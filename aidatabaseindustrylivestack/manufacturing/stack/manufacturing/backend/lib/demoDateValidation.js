const { TABLES } = require('./importCatalog');

const OPTIONAL_OBJECT_TYPES = ['TABLE', 'VIEW'];
const FUTURE_DATE_EXCLUSIONS = new Set([
  // Forecast horizons and scheduled work order commitments are intentionally future-dated after restore.
  'MANUFACTURING_DEMAND_FORECASTS.FORECAST_DATE',
  'MANUFACTURING_WORK_ORDERS.TARGET_COMPLETION_DATE',
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
      id: 'command-center-work-orders-last-7-days',
      screen: 'Factory Operations Command Center',
      table: 'manufacturing_work_orders',
      column: 'created_at',
      objects: ['manufacturing_work_orders'],
      min: 1,
      expected: 'At least one work order in the last 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_work_orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Factory Operations Command Center requires recent work orders for 7-day KPIs.',
    },
    {
      id: 'command-center-work-orders-last-30-days',
      screen: 'Factory Operations Command Center',
      table: 'manufacturing_work_orders',
      column: 'created_at',
      objects: ['manufacturing_work_orders'],
      min: 1,
      expected: 'At least one work order in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_work_orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Factory Operations Command Center requires current work order records for rolling KPIs.',
    },
    {
      id: 'command-center-production-signal-annual-buckets',
      screen: 'Factory Operations Command Center',
      table: 'manufacturing_production_signals',
      column: 'observed_at',
      objects: ['manufacturing_production_signals'],
      min: 6,
      expected: 'Production Signal Velocity should have multiple monthly buckets in the restored one-year window.',
      sql: `
        SELECT COUNT(DISTINCT TRUNC(CAST(observed_at AS DATE), 'MM')) AS actual
        FROM manufacturing_production_signals
        WHERE CAST(observed_at AS DATE) >= ADD_MONTHS(TRUNC(SYSDATE), -12)
      `,
      message: 'Production Signal Velocity needs year-spanning signal history for the 1y demo range.',
    },
    {
      id: 'production-signals-last-2-days',
      screen: 'Production Signal Monitor',
      table: 'manufacturing_production_signals',
      column: 'observed_at',
      objects: ['manufacturing_production_signals'],
      min: 1,
      expected: 'At least one production signal in the last 2 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_production_signals
        WHERE CAST(observed_at AS DATE) >= SYSDATE - 2
      `,
      message: 'Production and quality signal feeds need recent shop-floor activity after restore.',
    },
    {
      id: 'production-signals-view-last-7-days',
      screen: 'Production Signal Monitor',
      table: 'manufacturing_production_signals_v',
      column: 'observed_at',
      objects: ['manufacturing_production_signals_v'],
      min: 1,
      expected: 'At least one recent production signal through the manufacturing semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_production_signals_v
        WHERE CAST(observed_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Ask Data and signal screens should expose recent production signal activity through manufacturing_production_signals_v.',
    },
    {
      id: 'production-slot-forecast-window-today-through-7-days',
      screen: 'Plant Capacity & Routing',
      table: 'manufacturing_demand_forecasts',
      column: 'forecast_date',
      objects: ['manufacturing_demand_forecasts'],
      min: 1,
      expected: 'Forecast records should cover today through the next 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_demand_forecasts
        WHERE forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7
      `,
      message: 'Plant Capacity & Routing requires demand forecasts anchored to the current restore window.',
    },
    {
      id: 'forecast-start-after-latest-history',
      screen: 'Throughput, Order Value & Capacity Forecasts',
      table: 'manufacturing_demand_forecasts',
      column: 'forecast_date',
      objects: ['manufacturing_demand_forecasts', 'manufacturing_work_orders', 'manufacturing_production_signals', 'shipments'],
      min: 1,
      expected: 'The forecast window should start on or after the latest historical activity day.',
      sql: `
        WITH forecast_bounds AS (
          SELECT MIN(forecast_date) AS forecast_start
          FROM manufacturing_demand_forecasts
        ),
        historical_bounds AS (
          SELECT MAX(history_date) AS latest_history_date
          FROM (
            SELECT MAX(CAST(created_at AS DATE)) AS history_date FROM manufacturing_work_orders
            UNION ALL
            SELECT MAX(CAST(observed_at AS DATE)) AS history_date FROM manufacturing_production_signals
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
      message: 'Forecast windows should remain aligned after restored work order, customer account, and route activity.',
    },
    {
      id: 'plant-demand-regions-last-30-days',
      screen: 'Plant Capacity & Routing',
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
      message: 'Plant capacity demand-region layers should not be stale after restore.',
    },
    {
      id: 'plant-capacity-last-30-days',
      screen: 'Plant Capacity & Routing',
      table: 'inventory',
      column: 'updated_at',
      objects: ['inventory'],
      min: 1,
      expected: 'At least one manufacturing capacity update in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM inventory
        WHERE CAST(updated_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Plant capacity KPIs require recent inventory timestamps.',
    },
    {
      id: 'route-milestones-last-30-days',
      screen: 'Plant Capacity & Routing',
      table: 'shipments',
      column: 'shipped_at',
      objects: ['shipments'],
      min: 1,
      expected: 'At least one work order route milestone in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM shipments
        WHERE CAST(
          NVL(delivered_at, NVL(shipped_at, CAST(SYSDATE - 3650 AS TIMESTAMP)))
          AS DATE
        ) >= SYSDATE - 30
      `,
      message: 'Work order route milestones should be recent for the live plant capacity map.',
    },
    {
      id: 'route-milestones-ordered',
      screen: 'Plant Capacity & Routing',
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
      message: 'Work order route milestones should preserve chronology after date re-anchoring.',
    },
    {
      id: 'route-status-milestones-present',
      screen: 'Plant Capacity & Routing',
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
      message: 'Work order routes with movement or delivered status need matching route timestamps.',
    },
    {
      id: 'analytics-orders-last-90-days',
      screen: 'Throughput, Order Value & Capacity Forecasts',
      table: 'manufacturing_work_orders',
      column: 'created_at',
      objects: ['manufacturing_work_orders'],
      min: 6,
      expected: 'Bundled work orders should sit inside the 90-day analytics window.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_work_orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Throughput and work order value analytics require recent work orders for rolling-window queries.',
    },
    {
      id: 'analytics-signals-last-90-days',
      screen: 'Throughput, Order Value & Capacity Forecasts',
      table: 'manufacturing_production_signals',
      column: 'observed_at',
      objects: ['manufacturing_production_signals'],
      min: 6,
      expected: 'Bundled production signals should sit inside the 90-day analytics window.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_production_signals
        WHERE CAST(observed_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Throughput analytics require recent production signals for trend and OML feature windows.',
    },
    {
      id: 'analytics-daily-work-order-buckets',
      screen: 'Throughput, Order Value & Capacity Forecasts',
      table: 'manufacturing_work_orders',
      column: 'created_at',
      objects: ['manufacturing_work_orders'],
      min: 2,
      expected: 'At least 2 daily work order buckets in the last 90 days.',
      sql: `
        SELECT COUNT(DISTINCT TRUNC(CAST(created_at AS DATE))) AS actual
        FROM manufacturing_work_orders
        WHERE CAST(created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'Analytics trend and fallback OML views need multiple daily work order buckets.',
    },
    {
      id: 'oml-signal-feature-source-window',
      screen: 'Throughput, Order Value & Capacity Forecasts',
      table: 'manufacturing_signal_part_mentions',
      column: 'created_at',
      objects: ['manufacturing_signal_part_mentions', 'manufacturing_production_signals'],
      min: 1,
      expected: 'At least one production-signal-to-part feature row in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_signal_part_mentions ppm
        JOIN manufacturing_production_signals sp ON sp.production_signal_id = ppm.production_signal_id
        WHERE CAST(sp.observed_at AS DATE) >= SYSDATE - 30
      `,
      message: 'OML and vector-adjacent feature windows need recent production-signal-to-part rows.',
    },
    {
      id: 'oml-work-order-feature-source-window',
      screen: 'Throughput, Order Value & Capacity Forecasts',
      table: 'manufacturing_work_order_lines',
      column: 'work_order_id',
      objects: ['manufacturing_work_order_lines', 'manufacturing_work_orders'],
      min: 1,
      expected: 'At least one line-item feature row in the last 90 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_work_order_lines oi
        JOIN manufacturing_work_orders o ON o.work_order_id = oi.work_order_id
        WHERE CAST(o.created_at AS DATE) >= SYSDATE - 90
      `,
      message: 'OML and fallback analytics require recent work order line-item rows.',
    },
    {
      id: 'ask-manufacturing-work-orders-view-last-30-days',
      screen: 'Ask Manufacturing Data',
      table: 'manufacturing_work_orders_v',
      column: 'work_order_created_at',
      objects: ['manufacturing_work_orders_v'],
      min: 1,
      expected: 'At least one recent work order through the Ask Data semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_work_orders_v
        WHERE CAST(work_order_created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Manufacturing Data should answer recent work order questions after restore.',
    },
    {
      id: 'ask-manufacturing-production-signals-view-last-30-days',
      screen: 'Ask Manufacturing Data',
      table: 'manufacturing_production_signals_v',
      column: 'observed_at',
      objects: ['manufacturing_production_signals_v'],
      min: 1,
      expected: 'At least one recent production signal through the Ask Data semantic view.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_production_signals_v
        WHERE CAST(observed_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Manufacturing Data should answer recent production signal questions after restore.',
    },
    {
      id: 'supplier account-graph-relationships-last-30-days',
      screen: 'Supplier & Operations Network',
      table: 'influencer_connections',
      column: 'last_interaction',
      objects: ['influencer_connections'],
      optional: true,
      skipWhenNoRows: 'influencer_connections',
      min: 1,
      expected: 'If supplier account graph relationships are present, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM influencer_connections
        WHERE CAST(last_interaction AS DATE) >= SYSDATE - 30
      `,
      message: 'Supplier network relationship timestamps should be recent when graph data is installed.',
    },
    {
      id: 'supplier account-graph-relationships-ordered',
      screen: 'Supplier & Operations Network',
      table: 'influencer_connections',
      column: 'first_seen, last_interaction',
      objects: ['influencer_connections'],
      optional: true,
      skipWhenNoRows: 'influencer_connections',
      max: 0,
      expected: 'Supplier network last_interaction should not precede first_seen.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM influencer_connections
        WHERE first_seen IS NOT NULL
          AND last_interaction IS NOT NULL
          AND last_interaction < first_seen
      `,
      message: 'Supplier network timestamps should preserve relationship chronology.',
    },
    {
      id: 'supplier account-brand-links-last-30-days',
      screen: 'Supplier & Operations Network',
      table: 'brand_influencer_links',
      column: 'last_mention',
      objects: ['brand_influencer_links'],
      optional: true,
      skipWhenNoRows: 'brand_influencer_links',
      min: 1,
      expected: 'If supplier-to-product-line links are present, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM brand_influencer_links
        WHERE CAST(last_mention AS DATE) >= SYSDATE - 30
      `,
      message: 'Supplier-to-product-line relationship timestamps should be recent when graph data is installed.',
    },
    {
      id: 'production-risk-graph-relationships-last-30-days',
      screen: 'Production Risk Graph',
      table: 'manufacturing_graph_relationships',
      column: 'last_interaction',
      objects: ['manufacturing_graph_relationships'],
      optional: true,
      skipWhenNoRows: 'manufacturing_graph_relationships',
      min: 1,
      expected: 'If persisted production-risk graph relationships are present, at least one should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_graph_relationships
        WHERE CAST(last_interaction AS DATE) >= SYSDATE - 30
      `,
      message: 'Persisted production-risk graph relationship timestamps should be recent when graph data is installed.',
    },
    {
      id: 'production-risk-graph-relationships-ordered',
      screen: 'Production Risk Graph',
      table: 'manufacturing_graph_relationships',
      column: 'first_seen, last_interaction',
      objects: ['manufacturing_graph_relationships'],
      optional: true,
      skipWhenNoRows: 'manufacturing_graph_relationships',
      max: 0,
      expected: 'Persisted graph relationship last_interaction should not precede first_seen.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_graph_relationships
        WHERE first_seen IS NOT NULL
          AND last_interaction IS NOT NULL
          AND last_interaction < first_seen
      `,
      message: 'Persisted production-risk graph timestamps should preserve relationship chronology.',
    },
    {
      id: 'production-risk-cases-last-30-days',
      screen: 'Production Risk Graph',
      table: 'manufacturing_risk_cases',
      column: 'created_at',
      objects: ['manufacturing_risk_cases'],
      optional: true,
      skipWhenNoRows: 'manufacturing_risk_cases',
      min: 1,
      expected: 'If manufacturing risk cases are present, at least one case should be in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM manufacturing_risk_cases
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Manufacturing risk case timestamps should be recent when graph cases are installed.',
    },
    {
      id: 'agent-actions-last-30-days-if-present',
      screen: 'Manufacturing Action Console',
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
      message: 'Manufacturing Action Console audit records should be recent when present.',
    },
    {
      id: 'event-stream-last-30-days-if-present',
      screen: 'Manufacturing Action Console',
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
      message: 'Manufacturing Action Console event stream should be recent when present.',
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
