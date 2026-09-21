const { TABLES } = require('./importCatalog');

const OPTIONAL_OBJECT_TYPES = ['TABLE', 'VIEW'];
const FUTURE_DATE_EXCLUSIONS = new Set([
  // Forecast horizons and scheduled campaign commitments are intentionally future-dated after restore.
  'DEMAND_FORECASTS.FORECAST_DATE',
  'ORDERS.ESTIMATED_DELIVERY',
]);

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function rowValue(row, key) {
  if (!row) return null;
  return row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()] ?? null;
}

function numericValue(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function checkDateColumns() {
  return TABLES.flatMap((table) => (
    table.columns
      .filter((column) => column.type === 'date' || column.type === 'timestamp')
      .map((column) => ({
        tableName: table.name,
        columnName: column.name,
        type: column.type,
      }))
  ));
}

function buildNoFutureDateChecks() {
  return checkDateColumns()
    .filter(({ tableName, columnName }) => (
      !FUTURE_DATE_EXCLUSIONS.has(`${tableName}.${columnName}`.toUpperCase())
    ))
    .map(({ tableName, columnName }) => ({
      id: `no-future-${tableName}-${columnName}`,
      screen: 'Cross-screen date integrity',
      table: tableName,
      column: columnName,
      objects: [tableName],
      max: 0,
      expected: 'No non-forecast demo dates should be more than one hour in the future.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM ${tableName}
        WHERE ${columnName} IS NOT NULL
          AND CAST(${columnName} AS DATE) > SYSDATE + (1 / 24)
      `,
      message: `${tableName}.${columnName} should not contain future-dated restored values.`,
    }));
}

function buildDemoDateValidationChecks() {
  const checks = [
    {
      id: 'command-center-campaign-orders-last-7-days',
      screen: 'Launch Operations Command Center',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 1,
      expected: 'At least one campaign order in the last 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Launch Operations Command Center requires recent campaign orders for 7-day KPIs.',
    },
    {
      id: 'command-center-campaign-orders-last-30-days',
      screen: 'Launch Operations Command Center',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 1,
      expected: 'At least one campaign order in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Launch Operations Command Center requires current campaign order records for rolling KPIs.',
    },
    {
      id: 'command-center-audience-signal-annual-buckets',
      screen: 'Launch Operations Command Center',
      table: 'social_posts',
      column: 'posted_at',
      objects: ['social_posts'],
      min: 6,
      expected: 'Audience Signal Velocity should have multiple monthly buckets in the restored one-year window.',
      sql: `
        SELECT COUNT(DISTINCT TRUNC(CAST(posted_at AS DATE), 'MM')) AS actual
        FROM social_posts
        WHERE CAST(posted_at AS DATE) >= ADD_MONTHS(TRUNC(SYSDATE), -12)
      `,
      message: 'Audience Signal Velocity needs year-spanning signal history for the 1y demo range.',
    },
    {
      id: 'audience-signals-last-2-days',
      screen: 'Audience Momentum & Safety Signals',
      table: 'social_posts',
      column: 'posted_at',
      objects: ['social_posts'],
      min: 1,
      expected: 'At least one audience signal in the last 2 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM social_posts
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 2
      `,
      message: 'Audience and safety signal feeds need recent community activity after restore.',
    },
    {
      id: 'audience-signals-view-last-7-days',
      screen: 'Audience Momentum & Safety Signals',
      table: 'media_audience_signals_v',
      column: 'posted_at',
      objects: ['media_audience_signals_v'],
      min: 1,
      expected: 'At least one recent audience signal through the media semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM media_audience_signals_v
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Ask Data and signal screens should expose recent audience activity through media_audience_signals_v.',
    },
    {
      id: 'live-event-forecast-window-today-through-7-days',
      screen: 'Rights, Capacity & Live Event Coverage',
      table: 'demand_forecasts',
      column: 'forecast_date',
      objects: ['demand_forecasts'],
      min: 1,
      expected: 'Forecast records should cover today through the next 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM demand_forecasts
        WHERE forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7
      `,
      message: 'Rights, Capacity & Live Event Coverage requires demand forecasts anchored to the current restore window.',
    },
    {
      id: 'forecast-start-after-latest-history',
      screen: 'Engagement, Revenue & Retention Forecasts',
      table: 'demand_forecasts',
      column: 'forecast_date',
      objects: ['demand_forecasts', 'orders', 'social_posts', 'shipments'],
      min: 1,
      expected: 'The forecast window should start on or after the latest historical activity day.',
      sql: `
        WITH forecast_bounds AS (
          SELECT MIN(forecast_date) AS forecast_start
          FROM demand_forecasts
        ),
        historical_bounds AS (
          SELECT MAX(history_date) AS latest_history_date
          FROM (
            SELECT MAX(CAST(created_at AS DATE)) AS history_date FROM orders
            UNION ALL
            SELECT MAX(CAST(posted_at AS DATE)) AS history_date FROM social_posts
            UNION ALL
            SELECT MAX(CAST(NVL(delivered_at, NVL(shipped_at, created_at)) AS DATE)) AS history_date FROM shipments
          )
        )
        SELECT CASE
          WHEN f.forecast_start IS NOT NULL
           AND h.latest_history_date IS NOT NULL
           AND f.forecast_start >= TRUNC(h.latest_history_date)
          THEN 1 ELSE 0 END AS actual
        FROM forecast_bounds f
        CROSS JOIN historical_bounds h
      `,
      message: 'Forecast windows should remain aligned after restored campaign, audience, and route activity.',
    },
    {
      id: 'coverage-demand-regions-last-30-days',
      screen: 'Rights, Capacity & Live Event Coverage',
      table: 'demand_regions',
      column: 'updated_at',
      objects: ['demand_regions'],
      min: 1,
      expected: 'At least one demand region update in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM demand_regions
        WHERE CAST(updated_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Coverage map demand-region layers should not be stale after restore.',
    },
    {
      id: 'coverage-capacity-last-30-days',
      screen: 'Rights, Capacity & Live Event Coverage',
      table: 'inventory',
      column: 'updated_at',
      objects: ['inventory'],
      min: 1,
      expected: 'At least one content capacity update in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM inventory
        WHERE CAST(updated_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Coverage and distribution capacity KPIs require recent inventory timestamps.',
    },
    {
      id: 'route-milestones-last-30-days',
      screen: 'Rights, Capacity & Live Event Coverage',
      table: 'shipments',
      column: 'shipped_at',
      objects: ['shipments'],
      min: 1,
      expected: 'At least one campaign route milestone in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM shipments
        WHERE CAST(
          NVL(delivered_at, NVL(shipped_at, CAST(SYSDATE - 3650 AS TIMESTAMP)))
          AS DATE
        ) >= SYSDATE - 30
      `,
      message: 'Campaign route milestones should be recent for the live coverage map.',
    },
    {
      id: 'route-milestones-ordered',
      screen: 'Rights, Capacity & Live Event Coverage',
      table: 'shipments',
      column: 'shipped_at, delivered_at',
      objects: ['shipments'],
      max: 0,
      expected: 'Delivered milestones should not be earlier than dispatched milestones.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM shipments
        WHERE shipped_at IS NOT NULL
          AND delivered_at IS NOT NULL
          AND delivered_at < shipped_at
      `,
      message: 'Campaign route milestones should preserve chronology after date re-anchoring.',
    },
    {
      id: 'route-status-milestones-present',
      screen: 'Rights, Capacity & Live Event Coverage',
      table: 'shipments',
      column: 'ship_status',
      objects: ['shipments'],
      max: 0,
      expected: 'Movement statuses should include the required milestone timestamps.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM shipments
        WHERE (
            ship_status IN ('shipped', 'in_transit', 'out_for_delivery', 'delivered')
            AND shipped_at IS NULL
          )
          OR (
            ship_status = 'delivered'
            AND delivered_at IS NULL
          )
      `,
      message: 'Campaign routes with movement or delivered status need matching route timestamps.',
    },
    {
      id: 'analytics-orders-last-90-days',
      screen: 'Engagement, Revenue & Retention Forecasts',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 6,
      expected: 'Bundled campaign orders should sit inside the 90-day analytics window.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Engagement and revenue analytics require recent campaign orders for rolling-window queries.',
    },
    {
      id: 'analytics-signals-last-90-days',
      screen: 'Engagement, Revenue & Retention Forecasts',
      table: 'social_posts',
      column: 'posted_at',
      objects: ['social_posts'],
      min: 6,
      expected: 'Bundled audience signals should sit inside the 90-day analytics window.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM social_posts
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Engagement analytics require recent audience signals for trend and OML feature windows.',
    },
    {
      id: 'analytics-daily-campaign-buckets',
      screen: 'Engagement, Revenue & Retention Forecasts',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 2,
      expected: 'At least 2 daily campaign order buckets in the last 90 days.',
      sql: `
        SELECT COUNT(DISTINCT TRUNC(CAST(created_at AS DATE))) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Analytics trend and fallback OML views need multiple daily campaign buckets.',
    },
    {
      id: 'oml-signal-feature-source-window',
      screen: 'Engagement, Revenue & Retention Forecasts',
      table: 'post_product_mentions',
      column: 'created_at',
      objects: ['post_product_mentions', 'social_posts'],
      min: 1,
      expected: 'At least one signal-to-content feature row in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM post_product_mentions ppm
        JOIN social_posts sp ON sp.post_id = ppm.post_id
        WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 30
      `,
      message: 'OML and vector-adjacent feature windows need recent audience-signal-to-content rows.',
    },
    {
      id: 'oml-campaign-feature-source-window',
      screen: 'Engagement, Revenue & Retention Forecasts',
      table: 'order_items',
      column: 'order_id',
      objects: ['order_items', 'orders'],
      min: 1,
      expected: 'At least one line-item feature row in the last 90 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        WHERE CAST(o.created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'OML and fallback analytics require recent campaign line-item rows.',
    },
    {
      id: 'ask-media-campaign-orders-view-last-30-days',
      screen: 'Ask Media and Entertainment Data',
      table: 'media_campaign_orders_v',
      column: 'campaign_created_at',
      objects: ['media_campaign_orders_v'],
      min: 1,
      expected: 'At least one recent campaign order through the Ask Data semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM media_campaign_orders_v
        WHERE CAST(campaign_created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Media and Entertainment Data should answer recent campaign order questions after restore.',
    },
    {
      id: 'ask-media-audience-signals-view-last-30-days',
      screen: 'Ask Media and Entertainment Data',
      table: 'media_audience_signals_v',
      column: 'posted_at',
      objects: ['media_audience_signals_v'],
      min: 1,
      expected: 'At least one recent audience signal through the Ask Data semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM media_audience_signals_v
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Media and Entertainment Data should answer recent audience signal questions after restore.',
    },
    {
      id: 'creator-graph-relationships-last-30-days',
      screen: 'Creator & Community Graph',
      table: 'influencer_connections',
      column: 'last_interaction',
      objects: ['influencer_connections'],
      optional: true,
      skipWhenNoRows: 'influencer_connections',
      min: 1,
      expected: 'If creator graph relationships are present, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM influencer_connections
        WHERE CAST(last_interaction AS DATE) >= SYSDATE - 30
      `,
      message: 'Creator graph relationship timestamps should be recent when graph data is installed.',
    },
    {
      id: 'creator-graph-relationships-ordered',
      screen: 'Creator & Community Graph',
      table: 'influencer_connections',
      column: 'first_seen, last_interaction',
      objects: ['influencer_connections'],
      optional: true,
      skipWhenNoRows: 'influencer_connections',
      max: 0,
      expected: 'Creator graph last_interaction should not precede first_seen.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM influencer_connections
        WHERE first_seen IS NOT NULL
          AND last_interaction IS NOT NULL
          AND last_interaction < first_seen
      `,
      message: 'Creator graph timestamps should preserve relationship chronology.',
    },
    {
      id: 'creator-brand-links-last-30-days',
      screen: 'Creator & Community Graph',
      table: 'brand_influencer_links',
      column: 'last_mention',
      objects: ['brand_influencer_links'],
      optional: true,
      skipWhenNoRows: 'brand_influencer_links',
      min: 1,
      expected: 'If creator-to-studio links are present, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM brand_influencer_links
        WHERE CAST(last_mention AS DATE) >= SYSDATE - 30
      `,
      message: 'Creator-to-studio relationship timestamps should be recent when graph data is installed.',
    },
    {
      id: 'agent-actions-last-30-days-if-present',
      screen: 'Media and Entertainment Action Console',
      table: 'agent_actions',
      column: 'created_at',
      objects: ['agent_actions'],
      optional: true,
      skipWhenNoRows: 'agent_actions',
      min: 1,
      expected: 'If agent audit records exist, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM agent_actions
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Media and Entertainment Action Console audit records should be recent when present.',
    },
    {
      id: 'event-stream-last-30-days-if-present',
      screen: 'Media and Entertainment Action Console',
      table: 'event_stream',
      column: 'created_at',
      objects: ['event_stream'],
      optional: true,
      skipWhenNoRows: 'event_stream',
      min: 1,
      expected: 'If event stream records exist, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM event_stream
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Media and Entertainment Action Console event stream should be recent when present.',
    },
  ];

  return [...checks, ...buildNoFutureDateChecks()];
}

async function objectExists(connection, objectName) {
  const result = await connection.execute(`
    SELECT COUNT(*) AS actual
    FROM user_objects
    WHERE object_name = UPPER(:objectName)
      AND object_type IN (${OPTIONAL_OBJECT_TYPES.map((_, index) => `:type${index}`).join(', ')})
  `, {
    objectName,
    ...Object.fromEntries(OPTIONAL_OBJECT_TYPES.map((type, index) => [`type${index}`, type])),
  }, { autoCommit: false });
  return numericValue(rowValue(result.rows?.[0], 'actual')) > 0;
}

async function tableRowCount(connection, tableName) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS actual FROM ${tableName}`,
    {},
    { autoCommit: false }
  );
  return numericValue(rowValue(result.rows?.[0], 'actual'));
}

function buildResult(definition, status, actual, extra = {}) {
  return {
    id: definition.id,
    screen: definition.screen,
    table: definition.table,
    column: definition.column || null,
    status,
    expected: definition.expected,
    actual,
    message: definition.message,
    query: normalizeSql(definition.sql),
    ...extra,
  };
}

function checkStatus(definition, actual) {
  if (Number.isFinite(definition.min) && actual < definition.min) return 'fail';
  if (Number.isFinite(definition.max) && actual > definition.max) return 'fail';
  return 'pass';
}

async function runOneCheck(connection, definition) {
  for (const objectName of definition.objects || []) {
    const exists = await objectExists(connection, objectName);
    if (!exists) {
      if (definition.optional) {
        return buildResult(definition, 'skip', null, {
          reason: `${objectName} is not installed in this schema.`,
        });
      }
      return buildResult(definition, 'fail', null, {
        reason: `${objectName} is not installed in this schema.`,
      });
    }
  }

  if (definition.skipWhenNoRows) {
    const rowCount = await tableRowCount(connection, definition.skipWhenNoRows);
    if (rowCount === 0) {
      return buildResult(definition, 'skip', 0, {
        reason: `${definition.skipWhenNoRows} has no rows to validate.`,
      });
    }
  }

  try {
    // Restore validation runs inside the candidate transaction. The database
    // module's global autoCommit default is true, so an options object is
    // required even for these SELECTs to avoid committing candidate DML.
    const result = await connection.execute(
      definition.sql,
      definition.binds || {},
      { autoCommit: false }
    );
    const actual = numericValue(rowValue(result.rows?.[0], definition.valueColumn || 'actual'));
    return buildResult(definition, checkStatus(definition, actual), actual);
  } catch (err) {
    return buildResult(definition, definition.optional ? 'skip' : 'fail', null, {
      reason: err.message,
    });
  }
}

async function runDemoDateValidation(connection) {
  const checks = buildDemoDateValidationChecks();
  const results = [];

  for (const definition of checks) {
    results.push(await runOneCheck(connection, definition));
  }

  const failures = results.filter((result) => result.status === 'fail');
  const passed = results.filter((result) => result.status === 'pass');
  const skipped = results.filter((result) => result.status === 'skip');

  return {
    passed: failures.length === 0,
    checkedAt: new Date().toISOString(),
    checkCount: results.length,
    passedCount: passed.length,
    failedCount: failures.length,
    skippedCount: skipped.length,
    checks: results,
    failures,
  };
}

function summarizeDemoDateValidation(validation) {
  if (!validation) return null;
  return {
    passed: Boolean(validation.passed),
    checkedAt: validation.checkedAt,
    checkCount: validation.checkCount,
    passedCount: validation.passedCount,
    failedCount: validation.failedCount,
    skippedCount: validation.skippedCount,
    failures: validation.failures.map((failure) => ({
      id: failure.id,
      screen: failure.screen,
      table: failure.table,
      column: failure.column,
      expected: failure.expected,
      actual: failure.actual,
      message: failure.message,
      query: failure.query,
      reason: failure.reason,
    })),
  };
}

module.exports = {
  buildDemoDateValidationChecks,
  runDemoDateValidation,
  summarizeDemoDateValidation,
  _private: {
    buildNoFutureDateChecks,
    checkDateColumns,
    normalizeSql,
  },
};
