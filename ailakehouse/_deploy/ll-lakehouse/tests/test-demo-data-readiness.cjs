const assert = require('node:assert/strict');
const test = require('node:test');
const { oracledb } = require('../ingestion/backend/config/database');
const lakehouse = require('../ingestion/backend/routes/lakehouse')._private;
const demoNames = new Set(['DIM_PRODUCT', 'CUSTOMER_ORDER_STATUS', 'PRODUCT_MANUALS_SOURCE', 'PRODUCT_VECTOR_STORE']);

test('ADB readiness requires demo data but does not query deferred warehouse rows', async () => {
  const counted = [];
  const status = await lakehouse.fetchLakehouseGoldDataStatus({
    async execute(sql, binds = {}) {
      if (sql.includes('package_count')) return { rows: [{ PACKAGE_COUNT: 1 }] };
      if (sql.includes('set_user_context')) return {};
      if (sql.includes('FROM user_tables')) {
        return { rows: Object.values(binds).filter(name => !String(name).startsWith('stale')).map(TABLE_NAME => ({ TABLE_NAME })) };
      }
      const table = sql.match(/FROM "([^"]+)"/)[1];
      counted.push(table);
      return { rows: [{ ROW_COUNT: 20000 }] };
    },
  });
  assert.equal(status.loaded, true);
  for (const name of demoNames) assert(counted.includes(name));
  assert(!counted.includes('FACT_SALES'));
  assert(!counted.includes('DIM_CUSTOMER'));
});

test('automatic warehouse maintenance preserves existing data and creates only missing schemas', async () => {
  const original = oracledb.getConnection;
  const statements = [];
  let closed = false;
  oracledb.getConnection = async () => ({
    async execute(sql, binds = {}) {
      statements.push(sql);
      if (sql.includes('FROM user_tables')) return { rows: [{ CNT: binds.name === 'FACT_SALES' ? 0 : 1 }] };
      if (sql.startsWith('CREATE TABLE')) return {};
      const table = sql.match(/FROM "([^"]+)"/)[1];
      assert(demoNames.has(table), `Deferred table ${table} must not be loaded during auto-connect`);
      return { rows: [{ ROW_COUNT: 20000 }] };
    },
    async executeMany() { throw new Error('Populated demo tables must not be reloaded'); },
    async close() { closed = true; },
  });
  try {
    const result = await lakehouse.loadWarehouseGoldData({ connectString: 'test-adb', schemaPassword: 'test', walletOptions: {} });
    assert.equal(result.rowsLoaded, 0);
    assert.equal(result.tables.length, 4);
    assert.equal(result.create.length, 1);
    assert.equal(result.create[0].tableName, 'FACT_SALES');
    assert(!statements.some(sql => /DROP|TRUNCATE|DELETE/i.test(sql)));
    assert(closed);
  } finally { oracledb.getConnection = original; }
});

test('full import connection uses provisioned ADB credentials and fails closed without ADB config', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peakgear-wallet-test-'));
  fs.writeFileSync(path.join(dir, 'tnsnames.ora'), 'test wallet');
  fs.writeFileSync(path.join(dir, 'sqlnet.ora'), 'test wallet');
  const names = ['ADB_AUTO_CONNECT', 'ADB_WALLET_DIR', 'ADB_CONNECTION_STRING', 'ADB_ADMIN_PASSWORD', 'ADB_STREAM_SCHEMA_PASSWORD', 'ORACLE_CONNECTION_STRING'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const original = oracledb.getConnection;
  let options;
  oracledb.getConnection = async config => { options = config; return {}; };
  Object.assign(process.env, {
    ADB_AUTO_CONNECT: 'true', ADB_WALLET_DIR: dir,
    ADB_CONNECTION_STRING: 'provisioned-adb', ADB_ADMIN_PASSWORD: 'test-admin',
    ADB_STREAM_SCHEMA_PASSWORD: 'test-pg', ORACLE_CONNECTION_STRING: 'local-db',
  });
  try {
    await lakehouse.getAutoLakehousePgConnection();
    assert.equal(options.connectString, 'provisioned-adb');
    assert.equal(options.user, 'PG');
    assert.equal(options.password, 'test-pg');
    assert.equal(options.configDir, dir);
    process.env.ADB_AUTO_CONNECT = 'false';
    options = null;
    await assert.rejects(lakehouse.getAutoLakehousePgConnection(), /not configured/);
    assert.equal(options, null);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
    oracledb.getConnection = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('partial baseline data fails readiness without requiring optional rows', async () => {
  const status = await lakehouse.fetchLakehouseGoldDataStatus({
    async execute(sql, binds = {}) {
      if (sql.includes('package_count')) return { rows: [{ PACKAGE_COUNT: 0 }] };
      if (sql.includes('FROM user_tables')) return { rows: Object.values(binds).map(TABLE_NAME => ({ TABLE_NAME })) };
      return { rows: [{ ROW_COUNT: 1 }] };
    },
  });
  assert.equal(status.loaded, false);
  assert(status.incompleteTables.includes('DIM_PRODUCT'));
  assert(!status.incompleteTables.includes('FACT_SALES'));
});
