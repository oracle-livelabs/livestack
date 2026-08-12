const { TABLES } = require('./importCatalog');

const FUTURE_DATE_EXCLUSIONS = new Set([
  // Forecast horizons and SLA due dates are intentionally future-dated after restore.
  'DEMAND_FORECASTS.FORECAST_DATE',
  'ORDERS.ESTIMATED_DELIVERY',
]);

function rowValue(row, key) {
  if (!row) return null;
  return row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()] ?? null;
}

function numericValue(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
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
  return [
    {
      id: 'command-center-requests-last-7-days',
      screen: 'Public Service Command Center',
      table: 'sled_service_requests_v',
      column: 'created_at',
      objects: ['sled_service_requests_v'],
      min: 1,
      expected: 'At least one constituent service request in the last 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM sled_service_requests_v
        WHERE CAST(created_at AS DATE) >= SYSDATE - 7
      `,
      message: 'Public Service Command Center requires current service request records for 7-day KPIs.',
    },
    {
      id: 'command-center-signals-last-7-days',
      screen: 'Public Service Command Center',
      table: 'sled_resident_signals_v',
      column: 'signal_time',
      objects: ['sled_resident_signals_v'],
      min: 1,
      expected: 'At least one resident or agency signal in the last 7 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM sled_resident_signals_v
        WHERE CAST(signal_time AS DATE) >= SYSDATE - 7
      `,
      message: 'Command Center signal KPIs require recently restored resident demand signals.',
    },
    {
      id: 'resident-signals-latest-within-2-days',
      screen: 'Resident Demand Signals',
      table: 'sled_resident_signals_v',
      column: 'signal_time',
      objects: ['sled_resident_signals_v'],
      min: 1,
      expected: 'At least one resident demand signal timestamp should be within the last 2 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM sled_resident_signals_v
        WHERE CAST(signal_time AS DATE) >= SYSDATE - 2
      `,
      message: 'Resident Demand Signals should feel current after Restore Demo Data.',
    },
    {
      id: 'partner-network-recent-sources',
      screen: 'Community Partner Network',
      table: 'sled_signal_sources_v',
      column: 'created_at',
      objects: ['sled_signal_sources_v'],
      min: 1,
      expected: 'At least one community partner or source record should be current enough for the graph.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM sled_signal_sources_v
        WHERE CAST(created_at AS DATE) >= SYSDATE - 120
      `,
      message: 'Community Partner Network requires current source records.',
    },
    {
      id: 'service-access-forecast-window',
      screen: 'Service Access & Coverage Map',
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
      message: 'Service Access & Coverage Map requires forecast records anchored to the current restore window.',
    },
    {
      id: 'service-requests-last-30-days',
      screen: 'Service Request Workbench',
      table: 'sled_service_requests_v',
      column: 'created_at',
      objects: ['sled_service_requests_v'],
      min: 1,
      expected: 'At least one service request created in the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM sled_service_requests_v
        WHERE CAST(created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Service Request Workbench should display recent requests after restore.',
    },
    {
      id: 'analytics-forecast-after-history',
      screen: 'Backlog, Risk & Capacity Analytics',
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
      message: 'OML forecast windows should be anchored after restored service requests, signals, and task routes.',
    },
    {
      id: 'ask-data-dashboard-current',
      screen: 'Ask State and Local Government Data',
      table: 'sled_operations_dashboard_v',
      column: 'request_created_at',
      objects: ['sled_operations_dashboard_v'],
      min: 1,
      expected: 'Ask Data semantic dashboard view should include service requests from the last 30 days.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM sled_operations_dashboard_v
        WHERE CAST(request_created_at AS DATE) >= SYSDATE - 30
      `,
      message: 'Ask Data should not answer from stale semantic dashboard records.',
    },
    {
      id: 'agent-console-actions-recent',
      screen: 'Public Service AI Agent Console',
      table: 'agent_actions',
      column: 'created_at',
      objects: ['agent_actions'],
      min: 0,
      expected: 'Agent action timestamps should be valid when present.',
      sql: `
        SELECT COUNT(*) AS actual
        FROM agent_actions
        WHERE created_at IS NOT NULL
      `,
      message: 'Agent Console action history should expose timestamped audit evidence.',
      optional: true,
    },
    ...buildNoFutureDateChecks(),
  ];
}

async function objectExists(connection, objectName) {
  const result = await connection.execute(`
    SELECT COUNT(*) AS actual
    FROM user_objects
    WHERE object_name = UPPER(:objectName)
      AND object_type IN ('TABLE','VIEW')
  `, { objectName });
  return numericValue(rowValue(result.rows?.[0], 'actual')) > 0;
}

async function runSingleCheck(connection, check) {
  for (const objectName of check.objects || [check.table]) {
    if (!(await objectExists(connection, objectName))) {
      return {
        ...check,
        passed: Boolean(check.optional),
        skipped: Boolean(check.optional),
        actual: null,
        reason: `Object ${objectName} is not installed.`,
        query: normalizeSql(check.sql),
      };
    }
  }

  const result = await connection.execute(check.sql);
  const actual = numericValue(rowValue(result.rows?.[0], 'actual'));
  const minOk = check.min == null || actual >= check.min;
  const maxOk = check.max == null || actual <= check.max;
  return {
    ...check,
    passed: minOk && maxOk,
    skipped: false,
    actual,
    query: normalizeSql(check.sql),
  };
}

async function runDemoDateValidation(connection) {
  const checks = buildDemoDateValidationChecks();
  const results = [];
  for (const check of checks) {
    results.push(await runSingleCheck(connection, check));
  }
  return {
    passed: results.every((result) => result.passed || result.skipped),
    results,
  };
}

function summarizeDemoDateValidation(validation) {
  const results = validation.results || [];
  const failures = results.filter((result) => !result.passed && !result.skipped);
  const skipped = results.filter((result) => result.skipped);
  return {
    fresh: validation.passed,
    passed: validation.passed,
    checkCount: results.length,
    passedCount: results.length - failures.length - skipped.length,
    failedCount: failures.length,
    skippedCount: skipped.length,
    failures,
  };
}

module.exports = {
  buildDemoDateValidationChecks,
  runDemoDateValidation,
  summarizeDemoDateValidation,
};
