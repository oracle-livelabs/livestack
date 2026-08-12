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
      // Application context is physical-session state. Clear it before doing
      // anything else so a borrower can never inherit a previous request.
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

const SYSTEM_SECURITY_CONTEXT_USER = 'admin_jess';

function effectiveUsername(username) {
  if (username !== undefined && username !== null) {
    return String(username).trim();
  }
  return String(getRequestIdentity().username || RESTRICTED_DEMO_USER).trim();
}

async function setSecurityContext(connection, username, options = {}) {
  return connection.execute(
    'BEGIN sled_security_pkg.set_user_context(:username); END;',
    { username: effectiveUsername(username) },
    options
  );
}

async function clearSecurityContext(connection, options = {}) {
  return connection.execute(
    'BEGIN sled_security_pkg.clear_user_context; END;',
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
    // A lost connection or a closing pool already makes the session unusable.
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
  return executeAsUser(sql, binds, getRequestIdentity().username, options);
}

/**
 * Deliberately privileged helper for offline verification and controlled
 * maintenance scripts only. HTTP request handlers must use request identity
 * through execute()/executeAsUser() instead.
 */
async function executeSystem(sql, binds = {}, options = {}) {
  return executeAsUser(sql, binds, SYSTEM_SECURITY_CONTEXT_USER, options);
}

/**
 * Execute a query with VPD user context set on the same connection.
 * Calls the trusted SLED security package before running the query
 * so Oracle VPD policies filter rows based on the user's role/region.
 */
async function executeAsUser(sql, binds = {}, username = null, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    await setSecurityContext(connection, username);
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    return result;
  } finally {
    await releaseConnection(connection);
  }
}

/**
 * Run multiple statements on one checked-out connection under one validated
 * Oracle identity. The context is set on that exact session and always cleared.
 */
async function withUserConnection(username, callback, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    if (options.readOnly) {
      await connection.execute('SET TRANSACTION READ ONLY', {}, { autoCommit: false });
    }
    await setSecurityContext(connection, username, { autoCommit: false });

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

async function resolveDemoIdentity(username) {
  let connection;
  try {
    connection = await getConnection();
    await setSecurityContext(connection, username);
    const result = await connection.execute(`
      SELECT SYS_CONTEXT('SLED_APP_CTX', 'USERNAME') AS username,
             SYS_CONTEXT('SLED_APP_CTX', 'ROLE') AS role,
             SYS_CONTEXT('SLED_APP_CTX', 'REGION') AS region,
             SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE') AS access_scope,
             SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED') AS authenticated
      FROM dual
    `, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const row = result.rows?.[0] || {};
    if (row.AUTHENTICATED !== 'Y' || !row.USERNAME || !row.ROLE || !row.ACCESS_SCOPE) {
      const error = new Error('Oracle did not establish an authenticated State and Local identity');
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

// These narrow lookups remain Oracle-authoritative: the trusted SLED package
// establishes the supplied actor context before APP_USERS is read.
async function resolveActiveActor(username) {
  try {
    const identity = await resolveDemoIdentity(username);
    return identity.authenticated === true ? identity.username : null;
  } catch (error) {
    if (error?.code === 'DEMO_IDENTITY_FORBIDDEN') return null;
    throw error;
  }
}

async function resolveDatasetAdminActor(username) {
  try {
    const identity = await resolveDemoIdentity(username);
    return identity.authenticated === true && identity.role === 'admin' ? identity.username : null;
  } catch (error) {
    if (error?.code === 'DEMO_IDENTITY_FORBIDDEN') return null;
    throw error;
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
  resolveDemoIdentity,
  resolveActiveActor,
  resolveDatasetAdminActor,
  setSecurityContext,
  clearSecurityContext,
  releaseConnection,
  oracledb
};
