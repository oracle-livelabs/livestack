const { TABLES } = require('./importCatalog');

const OPTIONAL_OBJECT_TYPES = ['TABLE', 'VIEW'];
const FUTURE_DATE_EXCLUSIONS = new Set([
  // Forecast horizons are intentionally future-dated after restore.
  'DEMAND_FORECASTS.FORECAST_DATE',
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
      id: 'operations-orders-last-7-days',
      screen: 'Operations Command Center',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 1,
      expected: 'At least one care service request in the last 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Operations Command Center requires recent service request records for 7-day KPIs.',
    },
    {
      id: 'operations-orders-last-30-days',
      screen: 'Operations Command Center',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 1,
      expected: 'At least one care service request in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Operations Command Center requires service request records for 30-day KPIs.',
    },
    {
      id: 'operations-signals-last-7-days',
      screen: 'Operations Command Center',
      table: 'social_posts',
      column: 'posted_at',
      objects: ['social_posts'],
      min: 1,
      expected: 'At least one quality/capacity signal in the last 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM social_posts
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Operations Command Center velocity and signal KPIs require recent quality/capacity signals.',
    },
    {
      id: 'operations-signals-last-30-days',
      screen: 'Operations Command Center',
      table: 'social_posts',
      column: 'posted_at',
      objects: ['social_posts'],
      min: 1,
      expected: 'At least one quality/capacity signal in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM social_posts
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Operations Command Center 30-day signal summaries require restored signal timestamps.',
    },
    {
      id: 'quality-signals-view-last-7-days',
      screen: 'Quality & Capacity Signals',
      table: 'quality_capacity_signals_v',
      column: 'signal_timestamp',
      objects: ['quality_capacity_signals_v'],
      min: 1,
      expected: 'At least one healthcare signal in the last 7 days through the semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM quality_capacity_signals_v
        WHERE CAST(signal_timestamp AS DATE) >= SYSDATE - 7
      `,
      message: 'Quality & Capacity Signals feed should expose recent records through quality_capacity_signals_v.',
    },
    {
      id: 'quality-signals-latest-within-2-days',
      screen: 'Quality & Capacity Signals',
      table: 'quality_capacity_signals_v',
      column: 'signal_timestamp',
      objects: ['quality_capacity_signals_v'],
      min: 1,
      expected: 'At least one healthcare signal timestamp should be within the last 2 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM quality_capacity_signals_v
        WHERE CAST(signal_timestamp AS DATE) >= SYSDATE - 2
      `,
      message: 'Velocity charts and filters need the latest signal bulletin to land near the restore window.',
    },
    {
      id: 'logistics-forecast-window-today-through-7-days',
      screen: 'Care Logistics Map',
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
      message: 'Care Logistics Map requires forecast records anchored to the current restore window.',
    },
    {
      id: 'forecast-start-after-latest-history',
      screen: 'Risk and Capacity Analytics',
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
      message: 'Forecast windows should be anchored after restored historical orders, signals, and logistics routes.',
    },
    {
      id: 'logistics-demand-regions-last-30-days',
      screen: 'Care Logistics Map',
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
      message: 'Care Logistics Map demand-region layers should not be stale after restore.',
    },
    {
      id: 'logistics-inventory-last-30-days',
      screen: 'Care Logistics Map',
      table: 'inventory',
      column: 'updated_at',
      objects: ['inventory'],
      min: 1,
      expected: 'At least one capacity/supply inventory update in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM inventory
        WHERE CAST(updated_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Care Logistics Map site KPIs require recent inventory update timestamps.',
    },
    {
      id: 'service-requests-last-30-days',
      screen: 'Care Service Requests',
      table: 'care_service_requests',
      column: 'created_at',
      objects: ['care_service_requests'],
      min: 1,
      expected: 'At least one care service request created in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM care_service_requests
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Care Service Requests should display recently created request records after restore.',
    },
    {
      id: 'service-requests-latest-within-2-days',
      screen: 'Care Service Requests',
      table: 'care_service_requests',
      column: 'created_at',
      objects: ['care_service_requests'],
      min: 1,
      expected: 'At least one care service request should be within the last 2 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM care_service_requests
        WHERE CAST(created_at AS DATE) >= SYSDATE - 2
      `,
      message: 'The selected service request demo should feel current after Restore Demo Data.',
    },
    {
      id: 'logistics-routes-last-30-days',
      screen: 'Care Service Requests',
      table: 'care_logistics_routes_v',
      column: 'shipped_at',
      objects: ['care_logistics_routes_v'],
      min: 1,
      expected: 'At least one logistics route milestone in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM care_logistics_routes_v
        WHERE CAST(
          NVL(delivered_at, NVL(shipped_at, CAST(SYSDATE - 3650 AS TIMESTAMP)))
          AS DATE
        ) >= SYSDATE - 30
      `,
      message: 'Care Service Requests route tab requires recent logistics milestones.',
    },
    {
      id: 'logistics-route-milestones-ordered',
      screen: 'Care Service Requests',
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
      message: 'Logistics route milestones should remain ordered after date re-anchoring.',
    },
    {
      id: 'logistics-route-status-milestones-present',
      screen: 'Care Service Requests',
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
      message: 'Logistics routes with movement or delivered status need matching route timestamps.',
    },
    {
      id: 'analytics-orders-last-90-days',
      screen: 'Risk and Capacity Analytics',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 30,
      expected: 'At least 30 service request rows in the last 90 days for analytics windows.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Risk and Capacity Analytics requires enough recent service requests for rolling-window queries.',
    },
    {
      id: 'analytics-signals-last-90-days',
      screen: 'Risk and Capacity Analytics',
      table: 'social_posts',
      column: 'posted_at',
      objects: ['social_posts'],
      min: 30,
      expected: 'At least 30 signal rows in the last 90 days for analytics windows.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM social_posts
        WHERE CAST(posted_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Risk and Capacity Analytics requires enough recent signal rows for rolling-window features.',
    },
    {
      id: 'analytics-daily-request-buckets',
      screen: 'Risk and Capacity Analytics',
      table: 'orders',
      column: 'created_at',
      objects: ['orders'],
      min: 7,
      expected: 'At least 7 daily request buckets in the last 90 days.',
      sql: `
        SELECT COUNT(DISTINCT TRUNC(CAST(created_at AS DATE))) AS actual
        FROM orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Analytics trend and fallback OML views need multiple daily request buckets.',
    },
    {
      id: 'oml-signal-feature-source-window',
      screen: 'Risk and Capacity Analytics',
      table: 'post_product_mentions',
      column: 'created_at',
      objects: ['post_product_mentions', 'social_posts'],
      min: 1,
      expected: 'At least one signal-to-service feature row in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM post_product_mentions ppm
        JOIN social_posts sp ON sp.post_id = ppm.post_id
        WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - 30
      `,
      message: 'OML/vector-adjacent feature windows need recent signal-to-service mention rows.',
    },
    {
      id: 'oml-service-request-feature-source-window',
      screen: 'Risk and Capacity Analytics',
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
      message: 'OML/fallback analytics require recent request line-item rows.',
    },
    {
      id: 'ask-healthcare-service-requests-view-last-30-days',
      screen: 'Ask Healthcare Data',
      table: 'healthcare_service_requests_v',
      column: 'created_at',
      objects: ['healthcare_service_requests_v'],
      min: 1,
      expected: 'At least one recent service request through the Ask Data semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM healthcare_service_requests_v
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Healthcare Data should be able to answer recent service request questions after restore.',
    },
    {
      id: 'ask-healthcare-quality-signals-view-last-30-days',
      screen: 'Ask Healthcare Data',
      table: 'quality_capacity_signals_v',
      column: 'signal_timestamp',
      objects: ['quality_capacity_signals_v'],
      min: 1,
      expected: 'At least one recent quality/capacity signal through the Ask Data semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM quality_capacity_signals_v
        WHERE CAST(signal_timestamp AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Healthcare Data should be able to answer recent quality/capacity signal questions after restore.',
    },
    {
      id: 'care-graph-relationships-last-30-days',
      screen: 'Care Pathway Graph',
      table: 'care_graph_relationships',
      column: 'last_interaction',
      objects: ['care_graph_relationships'],
      optional: true,
      skipWhenNoRows: 'care_graph_relationships',
      min: 1,
      expected: 'If graph relationships are present, at least one graph event should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM care_graph_relationships
        WHERE CAST(last_interaction AS DATE) >= SYSDATE - 30
      `,
      message: 'Care Pathway Graph relationship timestamps should be recent when graph data is installed.',
    },
    {
      id: 'care-graph-relationships-ordered',
      screen: 'Care Pathway Graph',
      table: 'care_graph_relationships',
      column: 'first_seen, last_interaction',
      objects: ['care_graph_relationships'],
      optional: true,
      skipWhenNoRows: 'care_graph_relationships',
      max: 0,
      expected: 'Graph relationship last_interaction should not precede first_seen.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM care_graph_relationships
        WHERE first_seen IS NOT NULL
          AND last_interaction IS NOT NULL
          AND last_interaction < first_seen
      `,
      message: 'Care Pathway Graph event timestamps should preserve relationship chronology.',
    },
    {
      id: 'care-pathway-cases-last-30-days',
      screen: 'Care Pathway Graph',
      table: 'care_pathway_cases',
      column: 'created_at',
      objects: ['care_pathway_cases'],
      optional: true,
      skipWhenNoRows: 'care_pathway_cases',
      min: 1,
      expected: 'If pathway cases are present, at least one case should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM care_pathway_cases
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Care Pathway Graph case timestamps should be recent when graph cases are installed.',
    },
    {
      id: 'agent-actions-last-30-days-if-present',
      screen: 'Healthcare AI Agent Console',
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
      message: 'Healthcare AI Agent Console audit records should be recent when present.',
    },
    {
      id: 'event-stream-last-30-days-if-present',
      screen: 'Healthcare AI Agent Console',
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
      message: 'Healthcare AI Agent Console event stream should be recent when present.',
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
  });
  return numericValue(rowValue(result.rows?.[0], 'actual')) > 0;
}

async function tableRowCount(connection, tableName) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS actual FROM ${tableName}`
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
    const result = await connection.execute(definition.sql, definition.binds || {});
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
