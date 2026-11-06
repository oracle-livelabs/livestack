const assert = require('node:assert/strict');
const test = require('node:test');
const database = require('../ingestion/backend/config/database');

const keys = [
  'ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECTION_STRING',
  'ADB_CONNECTION_STRING', 'ORACLE_WALLET_LOCATION', 'ORACLE_WALLET_PASSWORD',
];

test('primary app pool uses ADB PG and its wallet', async () => {
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const original = database.oracledb.createPool;
  let config;
  database.oracledb.createPool = async (options) => {
    config = options;
    return { poolMin: 2, poolMax: 10, close: async () => {} };
  };
  Object.assign(process.env, {
    ORACLE_USER: 'PG',
    ORACLE_PASSWORD: 'schema-password',
    ORACLE_CONNECTION_STRING: 'peakgear_high',
    ORACLE_WALLET_LOCATION: '/wallet',
    ORACLE_WALLET_PASSWORD: 'wallet-password',
  });
  try {
    await database.initialize();
    assert.equal(config.user, 'PG');
    assert.equal(config.connectString, 'peakgear_high');
    assert.equal(config.configDir, '/wallet');
    assert.equal(config.walletLocation, '/wallet');
    assert.equal(config.walletPassword, 'wallet-password');
  } finally {
    await database.closePool();
    database.oracledb.createPool = original;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('primary app pool refuses to start without ADB wallet configuration', async () => {
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const original = database.oracledb.createPool;
  let called = false;
  database.oracledb.createPool = async () => { called = true; };
  Object.assign(process.env, {
    ORACLE_USER: 'PG',
    ORACLE_PASSWORD: 'schema-password',
    ORACLE_CONNECTION_STRING: 'peakgear_high',
  });
  delete process.env.ORACLE_WALLET_LOCATION;
  delete process.env.ORACLE_WALLET_PASSWORD;
  try {
    await assert.rejects(database.initialize(), /ADB PG connection requires/);
    assert.equal(called, false);
  } finally {
    database.oracledb.createPool = original;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
