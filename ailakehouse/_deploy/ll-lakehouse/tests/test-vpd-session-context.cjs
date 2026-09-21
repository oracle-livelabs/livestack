const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');

const source = fs.readFileSync(path.join(__dirname, '../ingestion/backend/config/database.js'), 'utf8');
let context;
const connection = {
  ping: async () => {}, close: async () => {},
  execute: async (sql, binds) => {
    if (sql.includes('set_user_context')) context = binds.username;
    return { rows: [{ username: context }] };
  },
};
const dbModule = { exports: {} };
vm.runInNewContext(source, {
  module: dbModule, process: { env: {} }, console: { log() {}, warn() {} },
  require: name => name === 'node:async_hooks' ? { AsyncLocalStorage } : {
    createPool: async () => ({ getConnection: async () => connection, close: async () => {} }),
  },
});
const db = dbModule.exports;
(async () => {
  await db.executeAsUser('select probe', {}, 'fm_west_maria');
  assert.equal((await db.execute('select probe')).rows[0].username, 'admin_jess');
  for (const user of ['fm_west_maria', 'fm_east_dave', 'fm_south_keisha', 'viewer_sam']) {
    await db.runAsUser(user, async () => {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal((await db.execute('select probe')).rows[0].username, user);
      assert.equal((await db.executeAsUser('select probe')).rows[0].username, user);
      assert.equal((await db.callProcedure('begin probe; end;')).rows[0].username, user);
    });
  }
  assert.equal((await db.execute('select probe')).rows[0].username, 'admin_jess');
  await db.closePool();
  console.log('VPD session context tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
