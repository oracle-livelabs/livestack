const assert = require('assert');
const { _private } = require('../backend/lib/importWorkflowService');

function valuesFor(dataset, tableName, columnName) {
  return (dataset.tables?.[tableName]?.rows || [])
    .map((row) => row[columnName])
    .filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
}

function minDate(values) {
  assert(values.length > 0, 'Expected at least one date value');
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function maxDate(values) {
  assert(values.length > 0, 'Expected at least one date value');
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

const targetAnchor = _private.parseDemoAnchorDate('2026-09-15', 'verification target anchor');
const bundled = _private.getBundledDemoDataset().parsed.dataset;
const refreshPlan = _private.buildDemoDateRefreshSqlPlan();

assert.throws(
  () => _private.parseDemoAnchorDate('2026-02-31', 'verification invalid anchor'),
  /valid date or timestamp/,
  'Invalid configured anchor dates should fail before a restore job starts'
);

assert(
  refreshPlan.some((step) => step.tableName === 'social_posts' && step.columnName === 'posted_at'),
  'Database refresh plan should cover quality/capacity signal timestamps'
);
assert(
  refreshPlan.some((step) => step.tableName === 'orders' && step.columnName === 'created_at'),
  'Database refresh plan should cover care service request timestamps'
);
assert(
  refreshPlan.some((step) => step.tableName === 'demand_forecasts' && step.columnName === 'forecast_date'),
  'Database refresh plan should cover forecast dates'
);
assert(
  refreshPlan.some((step) => step.tableName === 'shipments' && step.columnName === 'shipped_at'),
  'Database refresh plan should cover logistics route timestamps'
);
assert(
  refreshPlan.every((step) => /WHERE \w+ IS NOT NULL$/.test(step.updateSql)),
  'Every database refresh update should be constrained to non-null date fields'
);

const originalForecastStart = minDate(valuesFor(bundled, 'demand_forecasts', 'forecast_date'));
const originalForecastEnd = maxDate(valuesFor(bundled, 'demand_forecasts', 'forecast_date'));
const originalSignalLatest = maxDate(valuesFor(bundled, 'social_posts', 'posted_at'));
const originalOrderLatest = maxDate(valuesFor(bundled, 'orders', 'created_at'));

const { dataset: refreshed, metadata } = _private.reanchorDemoDates(bundled, {
  targetAnchor,
  anchorSource: 'verification',
});

const refreshedForecastStart = minDate(valuesFor(refreshed, 'demand_forecasts', 'forecast_date'));
const refreshedForecastEnd = maxDate(valuesFor(refreshed, 'demand_forecasts', 'forecast_date'));
const refreshedSignalLatest = maxDate(valuesFor(refreshed, 'social_posts', 'posted_at'));
const refreshedOrderLatest = maxDate(valuesFor(refreshed, 'orders', 'created_at'));

const offsetMs = targetAnchor.getTime() - originalForecastStart.getTime();

assert.strictEqual(metadata.anchorSource, 'verification');
assert.strictEqual(metadata.anchorStrategy, 'forecast_start_to_anchor_date');
assert.strictEqual(isoDate(metadata.originalSeedAnchor), isoDate(originalForecastStart));
assert.strictEqual(isoDate(metadata.restoreAnchor), '2026-09-15');
assert.strictEqual(metadata.offsetDays, offsetMs / (24 * 60 * 60 * 1000));
assert(metadata.shiftedValueCount > 0, 'Expected date fields to be shifted');
assert(metadata.shiftedColumns.orders.created_at > 0, 'Expected service request timestamps to be shifted');
assert(metadata.shiftedColumns.social_posts.posted_at > 0, 'Expected quality signal timestamps to be shifted');
assert(metadata.shiftedColumns.demand_forecasts.forecast_date > 0, 'Expected forecast dates to be shifted');
assert(metadata.shiftedColumns.shipments.shipped_at > 0, 'Expected logistics route timestamps to be shifted');

assert.strictEqual(isoDate(refreshedForecastStart), '2026-09-15');
assert.strictEqual(
  refreshedForecastEnd.getTime() - refreshedForecastStart.getTime(),
  originalForecastEnd.getTime() - originalForecastStart.getTime(),
  'Forecast date spacing should be preserved'
);
assert.strictEqual(
  refreshedSignalLatest.getTime() - originalSignalLatest.getTime(),
  offsetMs,
  'Quality signal timestamps should use the same offset'
);
assert.strictEqual(
  refreshedOrderLatest.getTime() - originalOrderLatest.getTime(),
  offsetMs,
  'Care service request timestamps should use the same offset'
);

assert.strictEqual(
  isoDate(minDate(valuesFor(bundled, 'demand_forecasts', 'forecast_date'))),
  isoDate(originalForecastStart),
  'Cached bundled dataset should not be mutated'
);

console.log(
  `Demo date re-anchor check passed: ${isoDate(originalForecastStart)} -> 2026-09-15, ` +
  `${metadata.shiftedValueCount} date values shifted.`
);
