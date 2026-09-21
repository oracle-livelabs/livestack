const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const loader = read('ingestion/db/data/load_all_data.sql');
assert(loader.indexOf('@@bootstrap_context.sql') > loader.indexOf('@@load_gold_seed.sql'));
assert(loader.indexOf('@@bootstrap_context.sql') < loader.indexOf('@@normalize_seed_dates.sql'));
assert.match(loader, /WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK/);
const bootstrap = read('ingestion/scripts/bootstrap_db.sh');
for (const section of ['cat > /tmp/check_seed_data.sql', 'cat > /tmp/hydrate.sql', 'CORE_DATA_READY=']) {
  const body = bootstrap.slice(bootstrap.indexOf(section)).split('\nSQL')[0];
  assert.match(body, /@\$\{APP_DIR\}\/db\/data\/bootstrap_context.sql/);
}
assert.match(read('init/adb-load.sh'), /Verifying required ADB demo tables\.\.\.[\s\S]*?bootstrap_context.sql/);
const reset = read('ingestion/db/data/reset_data.sql');
assert(reset.indexOf('TRUNCATE TABLE webshop_product_attributes') < reset.indexOf('TRUNCATE TABLE products;'));
assert.match(reset, /IF v_count = 0 THEN[\s\S]*AS IDENTITY \(START WITH 1\)/);
assert.match(read('ingestion/scripts/generate_gold_seed.py'), /"@@bootstrap_context.sql"/);
assert.match(read('ingestion/db/data/bootstrap_context.sql'), /RAISE_APPLICATION_ERROR/);
assert.match(read('ingestion/db/schema/06_security.sql'), /v_role IS NULL OR v_role = 'unknown'/);
console.log('Bootstrap VPD, fail-fast, reseed, and generator checks passed.');

// Exercise the readiness decision with a VPD-like connection: rows are hidden
// until an admin context is explicitly selected. Missing admin must fail,
// not return an empty-table status that would trigger an automatic reset.
const vm = require('node:vm');
const route = read('ingestion/backend/routes/lakehouse.js');
const source = route.slice(route.indexOf('async function fetchLakehouseGoldDataStatus('),
  route.indexOf('\nfunction areGoldDataTablesLoaded('));
const fetchStatus = vm.runInNewContext(`(${source})`, {
  oracledb: { OUT_FORMAT_OBJECT: 1 },
  LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES: ['ORDERS'],
  LAKEHOUSE_GOLD_DATA_EXPECTED_ROWS: new Map([['ORDERS', 1]]),
  LAKEHOUSE_WAREHOUSE_STALE_GOLD_DATA_TABLE_NAMES: [],
  quoteOracleIdentifier: name => `"${name}"`,
});
(async () => {
  for (const hasPackage of [true, false]) {
    let context = false;
    const connection = { execute: async sql => {
      if (sql.includes('package_count')) return { rows: [{ PACKAGE_COUNT: hasPackage ? 1 : 0 }] };
      if (sql.includes('set_user_context')) { context = true; return {}; }
      if (sql.includes('FROM user_tables')) return { rows: hasPackage ? [{ TABLE_NAME: 'ORDERS' }] : [] };
      assert(context, 'Readiness queried VPD-protected data without context');
      return { rows: [{ ROW_COUNT: 5000 }] };
    } };
    assert.equal((await fetchStatus(connection)).loaded, hasPackage);
  }
  await assert.rejects(fetchStatus({ execute: async sql => {
    if (sql.includes('package_count')) return { rows: [{ PACKAGE_COUNT: 1 }] };
    throw new Error('Missing admin context');
  } }), /Missing admin context/);
  console.log('ADB readiness context and fail-closed checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
