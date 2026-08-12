/**
 * Oracle AI Database 26ai Connection Pool Manager
 * Handles connection pooling for Oracle AI Database 26ai Free
 */

const oracledb = require('oracledb');
const { AsyncLocalStorage } = require('node:async_hooks');

// Use Thick mode when wallet-based Oracle AI Database 26ai connections are configured
// Thin mode (default in 6.x) works for some configs
let poolPromise = null;
let poolResetPromise = null;
const requestActorStore = new AsyncLocalStorage();

class AuthenticationRequiredError extends Error {
  constructor() { super('An authenticated actor is required for governed database access.'); this.code = 'AUTHENTICATED_ACTOR_REQUIRED'; this.statusCode = 401; }
}
function runAsActor(actor, callback) { return requestActorStore.run({ actor }, callback); }
function requestActor() { return requestActorStore.getStore()?.actor || null; }

function buildPoolConfig() {
  const poolConfig = {
    user: process.env.ORACLE_USER || 'LIVESTACK',
    password: process.env.APP_SCHEMA_PASSWORD || 'livestackrulez!',
    connectString: process.env.ORACLE_CONNECTION_STRING,
    poolMin: parseInt(process.env.ORACLE_POOL_MIN) || 2,
    poolMax: parseInt(process.env.ORACLE_POOL_MAX) || 10,
    poolIncrement: parseInt(process.env.ORACLE_POOL_INCREMENT) || 1,
    poolTimeout: 60,
    queueMax: -1,
    queueTimeout: 60000,
    enableStatistics: true
  };

  if (process.env.ORACLE_WALLET_LOCATION) {
    poolConfig.walletLocation = process.env.ORACLE_WALLET_LOCATION;
    poolConfig.walletPassword = process.env.ORACLE_WALLET_PASSWORD;
    // Thin mode needs configDir to locate tnsnames.ora inside the wallet
    poolConfig.configDir = process.env.ORACLE_WALLET_LOCATION;
  }

  return poolConfig;
}

function isReconnectError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');

  return [
    'NJS-503',
    'DPI-1010',
    'DPI-1080',
    'ORA-03113',
    'ORA-03114',
    'ORA-12170',
    'ORA-12514',
    'ORA-12541',
    'ORA-12545',
  ].includes(code) || /EHOSTUNREACH|ECONNREFUSED|ENOTFOUND|connection to host .* could not be established/i.test(message);
}

async function createPool() {
  const poolConfig = buildPoolConfig();
  poolPromise = oracledb.createPool(poolConfig);
  try {
    const pool = await poolPromise;
    console.log(`Oracle connection pool created (min: ${pool.poolMin}, max: ${pool.poolMax})`);
    return pool;
  } catch (err) {
    poolPromise = null;
    throw err;
  }
}

async function resetPool(reason = 'connection reset') {
  if (poolResetPromise) {
    return poolResetPromise;
  }

  poolResetPromise = (async () => {
    const existingPoolPromise = poolPromise;
    poolPromise = null;

    if (existingPoolPromise) {
      try {
        const existingPool = await existingPoolPromise;
        await existingPool.close(10);
        console.warn(`Oracle connection pool reset (${reason})`);
      } catch (err) {
        console.warn('Error closing stale Oracle pool:', err.message || err);
      }
    }

    return createPool();
  })();

  try {
    return await poolResetPromise;
  } finally {
    poolResetPromise = null;
  }
}

async function initialize() {
  try {
    // If using wallet, initialize thick mode
    if (process.env.ORACLE_WALLET_LOCATION) {
      try {
        oracledb.initOracleClient({
          libDir: process.env.ORACLE_CLIENT_DIR || undefined,
          configDir: process.env.ORACLE_WALLET_LOCATION
        });
        console.log('Oracle Thick mode initialized with wallet');
      } catch (err) {
        // Thick mode may already be initialized
        if (!err.message.includes('already initialized')) {
          console.warn('Thick mode init warning:', err.message);
        }
      }
    }

    if (poolPromise) {
      return poolPromise;
    }

    const pool = await createPool();

    // Set default output format
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    oracledb.autoCommit = true;
    oracledb.fetchAsString = [oracledb.CLOB];

    return pool;
  } catch (err) {
    console.error('Failed to create Oracle connection pool:', err);
    throw err;
  }
}

async function getConnection() {
  if (!poolPromise) {
    await initialize();
  }

  try {
    const pool = await poolPromise;
    const connection = await pool.getConnection();
    await connection.ping();
    return connection;
  } catch (err) {
    if (isReconnectError(err)) {
      await resetPool(err.code || err.message || 'connection failure');
      const pool = await poolPromise;
      const connection = await pool.getConnection();
      await connection.ping();
      return connection;
    }
    throw err;
  }
}

async function closePool() {
  if (poolPromise) {
    try {
      const pool = await poolPromise;
      await pool.close(10);
      console.log('Oracle connection pool closed');
    } catch (err) {
      console.error('Error closing pool:', err);
    } finally {
      poolPromise = null;
    }
  }
}

/**
 * Execute a query with automatic connection management
 */
async function execute(sql, binds = {}, options = {}) {
  return executeAsUser(sql, binds, requestActor(), options);
}

async function executePublicIdentityDirectory(sql, binds = {}, options = {}) {
  if (!/^\s*SELECT\b[\s\S]*\bFROM\s+app_users\b/i.test(sql) || /\b(?:INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|BEGIN)\b/i.test(sql)) {
    throw new Error('Public identity directory only permits a read of APP_USERS.');
  }
  let connection;
  try { connection = await getConnection(); return await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, ...options }); }
  finally { if (connection) try { await connection.close(); } catch (_) { /* ignore */ } }
}

async function resolveActiveActor(username) {
  const actor = typeof username === 'string' ? username.trim() : '';
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(actor)) return null;
  const result = await executePublicIdentityDirectory('SELECT username FROM app_users WHERE username = :username AND is_active = 1', { username: actor });
  return result.rows?.[0]?.USERNAME?.trim() || null;
}

async function resolveDatasetAdminActor(username) {
  const actor = typeof username === 'string' ? username.trim() : '';
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(actor)) return null;
  const result = await executePublicIdentityDirectory("SELECT username FROM app_users WHERE username = :username AND is_active = 1 AND role = 'admin'", { username: actor });
  return result.rows?.[0]?.USERNAME?.trim() || null;
}

/**
 * Execute a query with VPD user context set on the same connection.
 * Calls sc_security_ctx.set_user_context(username) before running the query
 * so Oracle VPD policies filter rows based on the user's role/region.
 */
async function executeAsUser(sql, binds = {}, username = null, options = {}) {
  if (!username || typeof username !== 'string') throw new AuthenticationRequiredError();
  let connection;
  try {
    connection = await getConnection();
    await connection.execute(
      `BEGIN sc_security_ctx.set_user_context(:username); END;`,
      { username }
    );
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    return result;
  } finally {
    if (connection) {
      // Reset to the schema's non-privileged fallback before this session can
      // return to the pool. A failed reset drops the potentially tainted one.
      let clearFailed = false;
      try { await connection.execute(`BEGIN sc_security_ctx.set_user_context(NULL); END;`); } catch (_) { clearFailed = true; }
      try {
        if (clearFailed) await connection.close({ drop: true });
        else await connection.close();
      } catch (_) { /* ignore */ }
    }
  }
}

/**
 * Execute a PL/SQL procedure
 */
async function callProcedure(sql, binds = {}) {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(sql, binds);
    return result;
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { /* ignore */ }
    }
  }
}

module.exports = {
  initialize,
  getConnection,
  closePool,
  execute,
  executePublicIdentityDirectory,
  resolveActiveActor,
  resolveDatasetAdminActor,
  executeAsUser,
  runAsActor,
  AuthenticationRequiredError,
  callProcedure,
  oracledb
};
