/**
 * Oracle AI Database 26ai Connection Pool Manager
 * Handles connection pooling for Oracle AI Database 26ai Free
 */

const oracledb = require('oracledb');
const {
  RESTRICTED_DEMO_USER,
  getRequestIdentity,
} = require('../lib/requestIdentityContext');

// Use Thick mode when wallet-based Oracle AI Database 26ai connections are configured
// Thin mode (default in 6.x) works for some configs
let poolPromise = null;
let poolResetPromise = null;

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
    try {
      await clearSecurityContext(connection);
      await connection.ping();
      return connection;
    } catch (checkoutError) {
      try { await connection.close({ drop: true }); } catch (_) {}
      throw checkoutError;
    }
  } catch (err) {
    if (isReconnectError(err)) {
      await resetPool(err.code || err.message || 'connection failure');
      const pool = await poolPromise;
      const connection = await pool.getConnection();
      try {
        await clearSecurityContext(connection);
        await connection.ping();
        return connection;
      } catch (checkoutError) {
        try { await connection.close({ drop: true }); } catch (_) {}
        throw checkoutError;
      }
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

const SYSTEM_SECURITY_CONTEXT_USER = 'admin_jess';

async function setSecurityContext(connection, username, options = {}) {
  const effectiveUsername = String(username || getRequestIdentity().username || RESTRICTED_DEMO_USER).trim();
  return connection.execute(
    `BEGIN manufacturing_security_pkg.set_user_context(:username); END;`,
    { username: effectiveUsername },
    options
  );
}

async function clearSecurityContext(connection, options = {}) {
  return connection.execute(
    `BEGIN manufacturing_security_pkg.clear_user_context; END;`,
    {},
    options
  );
}

async function releaseConnection(connection, { rollback = false, label = 'session' } = {}) {
  if (!connection) return;

  let dropConnection = false;
  try {
    if (rollback) await connection.rollback();
    await clearSecurityContext(connection, { autoCommit: false });
  } catch (err) {
    dropConnection = true;
    console.warn(`Unable to reset Oracle VPD ${label} context:`, err.message || err);
  }

  try {
    if (dropConnection) {
      await connection.close({ drop: true });
    } else {
      await connection.close();
    }
  } catch (_) {
    // Pool shutdown or connection loss already makes the session unavailable.
  }
}

/**
 * Execute a query with automatic connection management
 */
async function execute(sql, binds = {}, options = {}) {
  return executeAsUser(sql, binds, getRequestIdentity().username, options);
}

async function executeSystem(sql, binds = {}, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    await setSecurityContext(connection, SYSTEM_SECURITY_CONTEXT_USER);
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    return result;
  } finally {
    await releaseConnection(connection, { label: 'system query' });
  }
}

/**
 * Execute a query with VPD user context set on the same connection.
 * Calls manufacturing_security_pkg.set_user_context(username) before running the query
 * so Oracle VPD policies filter rows based on the user's role/region.
 */
async function executeAsUser(sql, binds = {}, username = null, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    // Always set VPD context because pooled connections may retain stale state.
    // Missing request identity must fail closed rather than inherit administrator access.
    await setSecurityContext(connection, username || getRequestIdentity().username);
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    return result;
  } finally {
    // Do not return a region-scoped session to the shared pool. Routes that
    // do not use executeAsUser must never inherit a previous request's VPD context.
    await releaseConnection(connection);
  }
}

/**
 * Run multiple statements with one VPD identity and one consistent read view.
 */
async function withUserConnection(username, callback, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    if (options.readOnly) {
      await connection.execute('SET TRANSACTION READ ONLY', {}, { autoCommit: false });
    }
    await setSecurityContext(connection, username || getRequestIdentity().username, { autoCommit: false });

    const executeOnConnection = (sql, binds = {}, executeOptions = {}) => connection.execute(
      sql,
      binds,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
        ...executeOptions,
      }
    );

    return await callback({ connection, execute: executeOnConnection });
  } finally {
    await releaseConnection(connection, { rollback: true, label: 'transaction' });
  }
}

/**
 * Execute a PL/SQL procedure
 */
async function callProcedure(sql, binds = {}) {
  return executeAsUser(sql, binds, getRequestIdentity().username);
}

async function callSystemProcedure(sql, binds = {}) {
  let connection;
  try {
    connection = await getConnection();
    await setSecurityContext(connection, SYSTEM_SECURITY_CONTEXT_USER);
    const result = await connection.execute(sql, binds);
    return result;
  } finally {
    await releaseConnection(connection, { label: 'procedure' });
  }
}

async function resolveDemoIdentity(username) {
  let connection;
  try {
    connection = await getConnection();
    await setSecurityContext(connection, username);
    const result = await connection.execute(`
      SELECT SYS_CONTEXT('MANUFACTURING_APP_CTX', 'USERNAME') AS username,
             SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE') AS role,
             SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION') AS region,
             SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') AS access_scope,
             SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') AS authenticated
      FROM dual
    `, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const row = result.rows?.[0] || {};
    if (row.AUTHENTICATED !== 'Y' || !row.USERNAME || !row.ROLE || !row.ACCESS_SCOPE) {
      const error = new Error('Oracle did not establish an authenticated Manufacturing identity');
      error.code = 'DEMO_IDENTITY_FORBIDDEN';
      throw error;
    }
    return Object.freeze({
      username: row.USERNAME,
      role: String(row.ROLE).toLowerCase(),
      region: row.REGION || null,
      accessScope: String(row.ACCESS_SCOPE).toUpperCase(),
      authenticated: true,
    });
  } finally {
    await releaseConnection(connection, { label: 'identity validation' });
  }
}

module.exports = {
  initialize,
  getConnection,
  closePool,
  execute,
  executeSystem,
  executeAsUser,
  withUserConnection,
  callProcedure,
  callSystemProcedure,
  resolveDemoIdentity,
  setSecurityContext,
  clearSecurityContext,
  releaseConnection,
  oracledb
};
