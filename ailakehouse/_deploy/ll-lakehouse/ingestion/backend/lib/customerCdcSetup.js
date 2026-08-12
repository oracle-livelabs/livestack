const fs = require('fs/promises');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { oracledb } = require('../config/database');

const DEFAULT_WALLET_DIR = '/wallet';
const DEFAULT_SOURCE_CONNECT_STRING = 'netsuite-db:1521/FREEPDB1';
const DEFAULT_SOURCE_USER = 'NETSUITE';
const DEFAULT_TARGET_SCHEMA = 'PG';
const DEFAULT_TARGET_GG_ADMIN_USER = 'GGADMIN';
const TARGET_TABLE_NAME = 'BRONZE_NETSUITE_CUSTOMERS';
const TARGET_TABLE_DISPLAY = `${DEFAULT_TARGET_SCHEMA}.${TARGET_TABLE_NAME}`;
const SOURCE_TABLE_DISPLAY = 'NETSUITE.CUSTOMERS';
const DEMO_ID_PREFIX = 'CDC_DEMO_';
const STUDIO_API_BASE = '/01012025/v2';
const STUDIO_REPLICATE_RECIPE_ID = 'F4D5736F-0FF2-41AF-84C9-1C3D145D8D7C';
const STUDIO_REPLICATE_STEP_NAME = 'oracle.cloud.ggfe.orchestrator.steps.replicate.Replicate';
const STUDIO_REPLICATE_RECIPE_NAME = 'Replicate';
const STUDIO_TOKEN_CACHE_TTL_MS = 50 * 60 * 1000;
const CDC_RUNTIME_PROCESS_PATTERNS = [/^E\d+$/i, /^R\d+$/i, /^ENSCDC$/i, /^RNSCDC$/i];
const BASELINE_CUSTOMERS = [
  ['NS10001', 'Maya Chen', 'B2C', 'maya.chen@peakgear.example', '+1-415-555-0101', 'GOLD', 'Trail Running', 34, 118500, '2024-01-12 09:30:00'],
  ['NS10002', 'Jordan Ellis', 'B2C', 'jordan.ellis@trailmail.example', '+1-503-555-0184', 'SILVER', 'Outdoor Fitness', 41, 94200, '2023-11-03 14:15:00'],
  ['NS10003', 'Priya Nair', 'B2B', 'priya.nair@summitco.example', '+1-650-555-0128', 'PLATINUM', 'Corporate Wellness', 38, 164000, '2022-08-19 10:45:00'],
  ['NS10004', 'Diego Ramirez', 'B2C', 'diego.ramirez@outdoorhub.example', '+1-512-555-0142', 'BRONZE', 'Cycling', 29, 72000, '2025-02-07 16:20:00'],
  ['NS10005', 'Avery Brooks', 'B2C', 'avery.brooks@peakgear.example', '+1-206-555-0193', 'GOLD', 'Hiking', 46, 132750, '2023-04-22 11:10:00'],
  ['NS10006', 'Noah Stein', 'B2B', 'noah.stein@northclub.example', '+1-312-555-0165', 'SILVER', 'Team Sports', 52, 109400, '2021-12-14 13:05:00'],
  ['NS10007', 'Lina Okafor', 'B2C', 'lina.okafor@trailmail.example', '+1-404-555-0119', 'PLATINUM', 'Performance Training', 31, 151200, '2024-07-09 08:55:00'],
  ['NS10008', 'Sofia Martinez', 'B2C', 'sofia.martinez@peakgear.example', '+1-786-555-0136', 'SILVER', 'Yoga', 27, 68500, '2025-01-28 15:40:00'],
  ['NS10009', 'Ethan Park', 'B2C', 'ethan.park@outdoorhub.example', '+1-213-555-0181', 'GOLD', 'Climbing', 36, 124300, '2022-10-05 12:25:00'],
  ['NS10010', 'Amara Johnson', 'B2B', 'amara.johnson@urbanfit.example', '+1-646-555-0177', 'BRONZE', 'Retail Partner', 44, 98750, '2023-06-17 09:05:00'],
  ['NS10011', 'Felix Weber', 'B2C', 'felix.weber@summitco.example', '+1-720-555-0123', 'SILVER', 'Skiing', 39, 116800, '2024-12-02 17:30:00'],
  ['NS10012', 'Nora Haddad', 'B2C', 'nora.haddad@peakgear.example', '+1-617-555-0162', 'GOLD', 'Running', 33, 105600, '2023-09-25 10:00:00'],
  ['NS10013', 'Kai Thompson', 'B2C', 'kai.thompson@trailmail.example', '+1-808-555-0149', 'BRONZE', 'Surf Training', 25, 59300, '2025-03-18 14:50:00'],
  ['NS10014', 'Elena Rossi', 'B2B', 'elena.rossi@alpineworks.example', '+1-303-555-0198', 'PLATINUM', 'Wholesale', 48, 188200, '2022-05-31 11:35:00'],
  ['NS10015', 'Marcus Green', 'B2C', 'marcus.green@outdoorhub.example', '+1-901-555-0115', 'SILVER', 'Basketball', 42, 87400, '2021-07-16 13:45:00'],
  ['NS10016', 'Tessa Morgan', 'B2C', 'tessa.morgan@peakgear.example', '+1-602-555-0188', 'GOLD', 'Triathlon', 37, 143900, '2024-03-08 09:25:00'],
  ['NS10017', 'Ravi Shah', 'B2B', 'ravi.shah@fitfleet.example', '+1-214-555-0166', 'SILVER', 'Corporate Fitness', 45, 129500, '2023-01-20 12:10:00'],
  ['NS10018', 'Isla Campbell', 'B2C', 'isla.campbell@trailmail.example', '+1-801-555-0172', 'BRONZE', 'Camping', 28, 64100, '2025-04-04 16:05:00'],
  ['NS10019', 'Owen Miller', 'B2C', 'owen.miller@summitco.example', '+1-314-555-0131', 'GOLD', 'Golf', 54, 158700, '2022-09-13 10:30:00'],
  ['NS10020', 'Grace Turner', 'B2C', 'grace.turner@peakgear.example', '+1-704-555-0191', 'SILVER', 'Women Fitness', 32, 93400, '2024-05-27 08:40:00'],
  ['NS10021', 'Leo Svensson', 'B2B', 'leo.svensson@nordictrail.example', '+1-971-555-0157', 'PLATINUM', 'Outdoor Retail', 50, 201600, '2021-11-11 15:55:00'],
  ['NS10022', 'Hannah Bauer', 'B2C', 'hannah.bauer@outdoorhub.example', '+1-414-555-0124', 'BRONZE', 'Family Recreation', 40, 81200, '2023-08-06 11:50:00'],
  ['NS10023', 'Mateo Alvarez', 'B2C', 'mateo.alvarez@trailmail.example', '+1-915-555-0186', 'GOLD', 'Soccer', 30, 101900, '2024-10-21 14:35:00'],
  ['NS10024', 'Chloe Bennett', 'B2C', 'chloe.bennett@peakgear.example', '+1-615-555-0169', 'SILVER', 'Pilates', 35, 97750, '2022-02-24 09:15:00'],
].map(([sourceCustomerId, customerName, customerType, email, phone, loyaltyTier, marketSegment, age, income, registrationDate]) => ({
  sourceCustomerId,
  customerName,
  customerType,
  email,
  phone,
  loyaltyTier,
  marketSegment,
  age,
  income,
  registrationDate,
}));
const GENERATED_DEMO_CUSTOMERS = [
  ['Taylor Quinn', 'taylor.quinn', 'peakgear.example', 'Trail Running', 36, 111000],
  ['Morgan Patel', 'morgan.patel', 'trailmail.example', 'Outdoor Fitness', 31, 96500],
  ['Alex Rivera', 'alex.rivera', 'outdoorhub.example', 'Cycling', 29, 88750],
  ['Jamie Novak', 'jamie.novak', 'summitco.example', 'Hiking', 43, 127500],
  ['Riley Hughes', 'riley.hughes', 'peakgear.example', 'Climbing', 34, 104250],
  ['Casey Wong', 'casey.wong', 'trailmail.example', 'Performance Training', 39, 139800],
];

let setupScheduled = false;
let studioToken = null;
let studioTokenExpiresAt = 0;
let studioLoginPromise = null;

function cleanText(value) {
  return String(value || '').trim();
}

function enabled(value, defaultValue = true) {
  const text = cleanText(value).toLowerCase();
  if (!text) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(text);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  return cleanText(value).replace(/\/+$/, '');
}

function getTargetConnectString() {
  return cleanText(process.env.ADB_CONNECTION_STRING)
    || cleanText(process.env.DBCONNECTION)
    || cleanText(process.env.ADB_SERVICE_NAME)
    || cleanText(process.env.SERVICE_NAME);
}

function getTargetAdminPassword() {
  return process.env.ADB_ADMIN_PASSWORD || process.env.DBPASSWORD || '';
}

function getTargetGoldenGatePassword() {
  return process.env.GOLDENGATE_TARGET_ADMIN_PASSWORD
    || process.env.DBPASSWORD
    || process.env.ADB_ADMIN_PASSWORD
    || '';
}

function getCdcConfig() {
  const targetSchema = (cleanText(process.env.GOLDENGATE_TARGET_SCHEMA)
    || cleanText(process.env.ADB_STREAM_SCHEMA_USER)
    || DEFAULT_TARGET_SCHEMA).toUpperCase();
  const hostPort = cleanText(process.env.NETSUITE_DB_HOST_PORT)
    || cleanText(process.env.NETSUITE_DB_PORT)
    || '1522';

  return {
    source: {
      connectString: cleanText(process.env.NETSUITE_DB_CONNECT_STRING) || DEFAULT_SOURCE_CONNECT_STRING,
      hostPort,
      user: (cleanText(process.env.NETSUITE_DB_USER) || DEFAULT_SOURCE_USER).toUpperCase(),
      password: process.env.NETSUITE_DB_PASSWORD || process.env.DBPASSWORD || 'peakgear',
    },
    target: {
      connectString: getTargetConnectString(),
      walletDir: cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_WALLET_DIR,
      studioWalletZip: cleanText(process.env.ADB_STUDIO_WALLET_ZIP) || path.join(cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_WALLET_DIR, 'goldengate-studio-wallet.zip'),
      walletPassword: process.env.ADB_WALLET_PASSWORD || process.env.ORACLE_WALLET_PASSWORD || '',
      user: targetSchema,
      password: process.env.GOLDENGATE_TARGET_PASSWORD
        || process.env.ADB_STREAM_SCHEMA_PASSWORD
        || process.env.DBPASSWORD
        || process.env.ADB_ADMIN_PASSWORD
        || '',
      tableName: TARGET_TABLE_NAME,
      displayName: `${targetSchema}.${TARGET_TABLE_NAME}`,
    },
    goldengate: {
      baseUrl: normalizeBaseUrl(process.env.GOLDENGATE_BASE_URL || 'https://goldengate-cdc:8443'),
      runtimeBaseUrl: normalizeBaseUrl(process.env.GOLDENGATE_RUNTIME_BASE_URL || 'http://goldengate-runtime'),
      runtimeHost: cleanText(process.env.GOLDENGATE_RUNTIME_HOST) || 'goldengate-runtime',
      runtimePort: cleanText(process.env.GOLDENGATE_RUNTIME_PORT) || '8080',
      uiUrl: normalizeBaseUrl(process.env.GOLDENGATE_PUBLIC_URL || 'https://localhost:8501'),
      apiBase: normalizeBaseUrl(process.env.GOLDENGATE_STUDIO_API_BASE || STUDIO_API_BASE),
      studioUsername: cleanText(process.env.GOLDENGATE_STUDIO_ADMIN_USER) || 'studioadmin',
      studioPassword: process.env.GOLDENGATE_STUDIO_ADMIN_PASSWORD
        || process.env.DBPASSWORD
        || 'peakgear',
      runtimeUsername: cleanText(process.env.GOLDENGATE_ADMIN_USER) || 'studioadmin',
      runtimePassword: process.env.GOLDENGATE_ADMIN_PASSWORD
        || process.env.DBPASSWORD
        || 'peakgear',
      deployment: cleanText(process.env.GOLDENGATE_DEPLOYMENT) || 'PeakGearCDC',
      extractName: cleanText(process.env.GOLDENGATE_EXTRACT_NAME) || 'ENSCDC',
      replicatName: cleanText(process.env.GOLDENGATE_REPLICAT_NAME) || 'RNSCDC',
      sourceAlias: cleanText(process.env.GOLDENGATE_SOURCE_ALIAS) || 'netsuite_src',
      targetAlias: cleanText(process.env.GOLDENGATE_TARGET_ALIAS) || 'adb_pg',
      targetAdminUser: (cleanText(process.env.GOLDENGATE_TARGET_ADMIN_USER) || DEFAULT_TARGET_GG_ADMIN_USER).toUpperCase(),
      targetAdminPassword: getTargetGoldenGatePassword(),
      sourceConnectionName: cleanText(process.env.GOLDENGATE_STUDIO_SOURCE_CONNECTION) || 'PeakGear_NetSuite_Source',
      targetConnectionName: cleanText(process.env.GOLDENGATE_STUDIO_TARGET_CONNECTION) || 'PeakGear_ADB_Target',
      deploymentConnectionName: cleanText(process.env.GOLDENGATE_STUDIO_DEPLOYMENT_CONNECTION) || 'PeakGear_GoldenGate_Runtime',
      pipelineName: cleanText(process.env.GOLDENGATE_STUDIO_PIPELINE_NAME) || 'PeakGear_NetSuite_Customers_CDC',
      productName: 'Oracle GoldenGate Studio Free',
    },
  };
}

async function hasWalletDirectory(walletDir) {
  try {
    const checks = await Promise.all(['tnsnames.ora', 'sqlnet.ora'].map(async (fileName) => {
      const stat = await fs.stat(path.join(walletDir, fileName));
      return stat.isFile() && stat.size > 0;
    }));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}

async function useWalletDirectory(walletDir) {
  // Keep the mounted wallet in place so its ojdbc.properties paths remain
  // valid for concurrent CDC and Select AI setup calls.
  return {
    dir: walletDir,
    cleanup: async () => {},
  };
}

async function withSourceConnection(config, action) {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: config.source.user,
      password: config.source.password,
      connectString: config.source.connectString,
    });
    return await action(connection);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function withTargetConnection(config, action) {
  if (!config.target.connectString) {
    const err = new Error('ADB connection string is not configured');
    err.reason = 'target_not_configured';
    throw err;
  }
  if (!(await hasWalletDirectory(config.target.walletDir))) {
    const err = new Error('ADB wallet is not available to the app container');
    err.reason = 'target_wallet_missing';
    throw err;
  }

  let connection;
  let wallet;
  try {
    wallet = await useWalletDirectory(config.target.walletDir);
    connection = await oracledb.getConnection({
      user: config.target.user,
      password: config.target.password,
      connectString: config.target.connectString,
      configDir: wallet.dir,
      ...(config.target.walletPassword ? { walletLocation: wallet.dir, walletPassword: config.target.walletPassword } : {}),
    });
    return await action(connection);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

async function withTargetAdminConnection(config, action) {
  const adminPassword = getTargetAdminPassword();
  if (!adminPassword || !config.target.connectString) {
    return { ok: false, skipped: true, reason: 'adb_admin_not_configured' };
  }
  if (!(await hasWalletDirectory(config.target.walletDir))) {
    return { ok: false, skipped: true, reason: 'target_wallet_missing' };
  }

  let connection;
  let wallet;
  try {
    wallet = await useWalletDirectory(config.target.walletDir);
    connection = await oracledb.getConnection({
      user: 'ADMIN',
      password: adminPassword,
      connectString: config.target.connectString,
      configDir: wallet.dir,
      ...(config.target.walletPassword ? { walletLocation: wallet.dir, walletPassword: config.target.walletPassword } : {}),
    });
    return await action(connection);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

function safeOracleIdentifier(value) {
  const identifier = cleanText(value).toUpperCase();
  if (!/^[A-Z][A-Z0-9_$#]{0,127}$/.test(identifier)) {
    throw new Error(`Unsafe Oracle identifier: ${value}`);
  }
  return identifier;
}

function quoteOraclePassword(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

async function ensureTargetPrivilegesForStudio(config = getCdcConfig()) {
  const targetUser = safeOracleIdentifier(config.target.user);
  const targetGoldenGateUser = safeOracleIdentifier(config.goldengate.targetAdminUser);
  const targetGoldenGatePassword = config.goldengate.targetAdminPassword;
  return withTargetAdminConnection(config, async (connection) => {
    const results = [];
    if (targetGoldenGatePassword) {
      const existingUser = await connection.execute(
        `SELECT COUNT(*) AS user_count FROM dba_users WHERE username = :username`,
        { username: targetGoldenGateUser },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const userExists = Number(existingUser.rows?.[0]?.USER_COUNT || 0) > 0;
      const userStatement = userExists
        ? `ALTER USER ${targetGoldenGateUser} IDENTIFIED BY ${quoteOraclePassword(targetGoldenGatePassword)} ACCOUNT UNLOCK`
        : `CREATE USER ${targetGoldenGateUser} IDENTIFIED BY ${quoteOraclePassword(targetGoldenGatePassword)}`;
      try {
        await connection.execute(userStatement);
        results.push({ statement: userExists ? `ALTER USER ${targetGoldenGateUser}` : `CREATE USER ${targetGoldenGateUser}`, ok: true });
      } catch (err) {
        results.push({ statement: userExists ? `ALTER USER ${targetGoldenGateUser}` : `CREATE USER ${targetGoldenGateUser}`, ok: false, error: err.message });
      }
    }

    const grants = [
      `GRANT SELECT ON SYS.V_$DATABASE TO ${targetUser}`,
      `GRANT SELECT ON SYS.V_$PARAMETER TO ${targetUser}`,
      `GRANT SELECT ON SYS.DBA_TABLES TO ${targetUser}`,
      `GRANT SELECT ON SYS.DBA_TAB_COLS TO ${targetUser}`,
      `GRANT SELECT ON SYS.DBA_OBJECT_TABLES TO ${targetUser}`,
      `GRANT SELECT ON SYS.DBA_USERS TO ${targetUser}`,
      `GRANT SELECT ON SYS.DBA_ROLE_PRIVS TO ${targetUser}`,
      `GRANT SELECT ON SYS.DBA_SYS_PRIVS TO ${targetUser}`,
      `GRANT SELECT ANY DICTIONARY TO ${targetUser}`,
      `GRANT SELECT ANY TRANSACTION TO ${targetUser}`,
      `GRANT SELECT ANY TABLE TO ${targetUser}`,
      `GRANT SELECT_CATALOG_ROLE TO ${targetUser}`,
      `GRANT EXP_FULL_DATABASE TO ${targetUser}`,
      `GRANT DATAPUMP_EXP_FULL_DATABASE TO ${targetUser}`,
      `GRANT CREATE SESSION TO ${targetGoldenGateUser}`,
      `GRANT CONNECT TO ${targetGoldenGateUser}`,
      `GRANT RESOURCE TO ${targetGoldenGateUser}`,
      `GRANT CREATE TABLE TO ${targetGoldenGateUser}`,
      `GRANT CREATE DATABASE LINK TO ${targetGoldenGateUser}`,
      `GRANT UNLIMITED TABLESPACE TO ${targetGoldenGateUser}`,
      `GRANT SELECT ANY TABLE TO ${targetGoldenGateUser}`,
      `GRANT FLASHBACK ANY TABLE TO ${targetGoldenGateUser}`,
      `GRANT SELECT ANY TRANSACTION TO ${targetGoldenGateUser}`,
      `GRANT SELECT ANY DICTIONARY TO ${targetGoldenGateUser}`,
      `GRANT SELECT_CATALOG_ROLE TO ${targetGoldenGateUser}`,
      `GRANT EXP_FULL_DATABASE TO ${targetGoldenGateUser}`,
      `GRANT DATAPUMP_EXP_FULL_DATABASE TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.V_$DATABASE TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.V_$PARAMETER TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.DBA_TABLES TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.DBA_TAB_COLS TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.DBA_OBJECT_TABLES TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.DBA_USERS TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.DBA_ROLE_PRIVS TO ${targetGoldenGateUser}`,
      `GRANT SELECT ON SYS.DBA_SYS_PRIVS TO ${targetGoldenGateUser}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${targetUser}.${TARGET_TABLE_NAME} TO ${targetGoldenGateUser}`,
    ];

    for (const statement of grants) {
      try {
        await connection.execute(statement);
        results.push({ statement, ok: true });
      } catch (err) {
        results.push({ statement, ok: false, error: err.message });
      }
    }

    try {
      await connection.execute(
        `BEGIN
           DBMS_GOLDENGATE_AUTH.GRANT_ADMIN_PRIVILEGE('${targetGoldenGateUser}');
         END;`
      );
      results.push({ statement: `DBMS_GOLDENGATE_AUTH.GRANT_ADMIN_PRIVILEGE('${targetGoldenGateUser}')`, ok: true });
    } catch (err) {
      results.push({ statement: `DBMS_GOLDENGATE_AUTH.GRANT_ADMIN_PRIVILEGE('${targetGoldenGateUser}')`, ok: false, error: err.message });
    }

    return {
      ok: results.some((result) => result.ok),
      targetUser,
      targetGoldenGateUser,
      grants: results,
    };
  });
}

async function executeDdl(connection, statement) {
  try {
    await connection.execute(statement);
    return true;
  } catch (err) {
    if (err.errorNum === 955 || err.code === 'ORA-00955') return false;
    throw err;
  }
}

async function ensureCustomerCdcTargetObjects(config = getCdcConfig()) {
  return withTargetConnection(config, async (connection) => {
    const created = [];
    const ddlStatements = [
      [
        'table',
        `CREATE TABLE bronze_netsuite_customers (
           source_customer_id VARCHAR2(50) PRIMARY KEY,
           customer_name      VARCHAR2(200) NOT NULL,
           customer_type      VARCHAR2(30),
           email              VARCHAR2(300),
           phone              VARCHAR2(40),
           loyalty_tier       VARCHAR2(40),
           market_segment     VARCHAR2(120),
           age                NUMBER(3),
           income             NUMBER(12,2),
           registration_date  TIMESTAMP,
           source_system      VARCHAR2(40) DEFAULT 'NetSuite' NOT NULL,
           created_at         TIMESTAMP,
           updated_at         TIMESTAMP,
           cdc_loaded_at      TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
         )`,
      ],
      ['loyalty index', 'CREATE INDEX idx_bronze_ns_customers_tier ON bronze_netsuite_customers (loyalty_tier)'],
      ['updated index', 'CREATE INDEX idx_bronze_ns_customers_updated ON bronze_netsuite_customers (updated_at DESC)'],
    ];

    for (const [label, statement] of ddlStatements) {
      if (await executeDdl(connection, statement)) {
        created.push(label);
      }
    }

    const rowCount = await connection.execute(
      `SELECT COUNT(*) AS row_count, MAX(updated_at) AS last_updated_at
       FROM bronze_netsuite_customers`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return {
      ok: true,
      targetTable: config.target.displayName,
      created,
      rowCount: Number(rowCount.rows?.[0]?.ROW_COUNT || 0),
      lastUpdatedAt: rowCount.rows?.[0]?.LAST_UPDATED_AT || null,
    };
  });
}

async function resetCustomerCdcTargetRows(config = getCdcConfig()) {
  await ensureCustomerCdcTargetObjects(config);
  return withTargetConnection(config, async (connection) => {
    const result = await connection.execute(
      'DELETE FROM bronze_netsuite_customers',
      {},
      { autoCommit: true }
    );
    return {
      ok: true,
      rowsDeleted: result.rowsAffected || 0,
    };
  });
}

function rawRequest(url, { method = 'GET', headers = {}, body = null, timeoutMs = 10000, allowStatuses = null } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const agent = parsed.protocol === 'https:' ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    const requestHeaders = { ...headers };
    if (body && !requestHeaders['Content-Length']) {
      requestHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = transport.request(parsed, {
      method,
      headers: requestHeaders,
      agent,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        const statusCode = res.statusCode || 0;
        const accepted = allowStatuses
          ? allowStatuses(statusCode)
          : statusCode >= 200 && statusCode < 300;
        if (!accepted) {
          const err = new Error(`GoldenGate request ${method} ${parsed.pathname || '/'} returned HTTP ${statusCode}`);
          err.statusCode = statusCode;
          err.body = responseBody;
          reject(err);
          return;
        }
        resolve({ statusCode, headers: res.headers, body: responseBody });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`GoldenGate request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseJson(body) {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function goldenGateApiUrl(config, endpoint) {
  const apiBase = `/${cleanText(config.goldengate.apiBase || STUDIO_API_BASE).replace(/^\/+|\/+$/g, '')}`;
  return `${config.goldengate.baseUrl}${apiBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

function cachedStudioToken() {
  if (studioToken && studioTokenExpiresAt > Date.now()) return studioToken;
  studioToken = null;
  studioTokenExpiresAt = 0;
  return null;
}

function invalidateStudioToken(token = null) {
  if (!token || studioToken === token) {
    studioToken = null;
    studioTokenExpiresAt = 0;
  }
}

async function studioRawRequest(config, token, endpoint, options = {}) {
  const { headers = {}, ...requestOptions } = options;
  let activeToken = token ? (cachedStudioToken() || token) : null;
  const request = (authToken) => rawRequest(goldenGateApiUrl(config, endpoint), {
    ...requestOptions,
    headers: {
      ...headers,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });

  try {
    return await request(activeToken);
  } catch (err) {
    if (err.statusCode !== 401 || !activeToken) throw err;
    invalidateStudioToken(activeToken);
    activeToken = await studioLogin(config, { force: true });
    return request(activeToken);
  }
}

async function studioJsonRequest(config, token, endpoint, { method = 'GET', body = null, timeoutMs = 20000, allowStatuses = null } = {}) {
  const requestBody = body == null ? null : JSON.stringify(body);
  const response = await studioRawRequest(config, token, endpoint, {
    method,
    timeoutMs,
    body: requestBody,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
    },
    allowStatuses,
  });
  return parseJson(response.body) || response.body;
}

function runtimeApiUrl(config, endpoint) {
  const deployment = encodeURIComponent(config.goldengate.deployment);
  const baseUrl = new URL(config.goldengate.runtimeBaseUrl);
  if (!baseUrl.port) {
    baseUrl.port = config.goldengate.runtimePort || '8080';
  }
  const base = baseUrl.toString().replace(/\/+$/, '');
  return `${base}/services/${deployment}/adminsrvr/v2${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

async function runtimeJsonRequest(config, endpoint, { method = 'GET', body = null, timeoutMs = 20000, allowStatuses = null } = {}) {
  const requestBody = body == null ? null : JSON.stringify(body);
  const credentials = Buffer.from(`${config.goldengate.runtimeUsername}:${config.goldengate.runtimePassword}`).toString('base64');
  const response = await rawRequest(runtimeApiUrl(config, endpoint), {
    method,
    timeoutMs,
    body: requestBody,
    headers: {
      Authorization: `Basic ${credentials}`,
      ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
    },
    allowStatuses,
  });
  return parseJson(response.body) || response.body;
}

function responseItems(response) {
  return response?.items || response?.response?.items || [];
}

function resourceId(resource) {
  return resource?.id
    || resource?.uuid
    || resource?.jobId
    || resource?.pipelineId
    || resource?.response?.id
    || resource?.response?.uuid
    || resource?.response?.jobId
    || resource?.response?.pipelineId
    || resource?.name
    || resource?.response?.name;
}

async function listRuntimeProcesses(config, processType) {
  const response = await runtimeJsonRequest(config, `/${processType}`, {
    timeoutMs: 20000,
  });
  return responseItems(response);
}

function isCustomerCdcRuntimeProcess(name) {
  return CDC_RUNTIME_PROCESS_PATTERNS.some((pattern) => pattern.test(cleanText(name)));
}

async function stopRuntimeProcess(config, processType, name) {
  const endpoint = `/${processType}/${encodeURIComponent(name)}`;
  const attempts = [
    { method: 'PATCH', body: { status: 'stopped' } },
    { method: 'PATCH', body: { status: 'STOPPED' } },
  ];

  for (const attempt of attempts) {
    try {
      await runtimeJsonRequest(config, endpoint, {
        method: attempt.method,
        body: attempt.body,
        timeoutMs: 30000,
        allowStatuses: (statusCode) => statusCode === 404 || (statusCode >= 200 && statusCode < 300),
      });
      return { ok: true };
    } catch (err) {
      if (err.statusCode === 404) return { ok: true, skipped: true };
    }
  }

  return { ok: false, reason: `${processType}_${name}_stop_failed` };
}

async function deleteRuntimeProcess(config, processType, name) {
  const endpoint = `/${processType}/${encodeURIComponent(name)}`;
  try {
    await runtimeJsonRequest(config, endpoint, {
      method: 'DELETE',
      timeoutMs: 30000,
      allowStatuses: (statusCode) => statusCode === 404 || (statusCode >= 200 && statusCode < 300),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function resetGoldenGateRuntimeProcesses(config = getCdcConfig()) {
  const result = {
    ok: true,
    extracts: [],
    replicats: [],
    warnings: [],
  };

  try {
    const replicats = await listRuntimeProcesses(config, 'replicats');
    for (const replicat of replicats) {
      const name = replicat?.name;
      if (!isCustomerCdcRuntimeProcess(name)) continue;
      const stopped = await stopRuntimeProcess(config, 'replicats', name);
      const deleted = await deleteRuntimeProcess(config, 'replicats', name);
      result.replicats.push({ name, stopped, deleted });
      if (!deleted.ok) result.warnings.push(`Could not delete Replicat ${name}: ${deleted.reason}`);
    }
  } catch (err) {
    result.ok = false;
    result.warnings.push(`Could not list Replicats: ${err.message}`);
  }

  try {
    const extracts = await listRuntimeProcesses(config, 'extracts');
    for (const extract of extracts) {
      const name = extract?.name;
      if (!isCustomerCdcRuntimeProcess(name)) continue;
      const stopped = await stopRuntimeProcess(config, 'extracts', name);
      const deleted = await deleteRuntimeProcess(config, 'extracts', name);
      result.extracts.push({ name, stopped, deleted });
      if (!deleted.ok) result.warnings.push(`Could not delete Extract ${name}: ${deleted.reason}`);
    }
  } catch (err) {
    result.ok = false;
    result.warnings.push(`Could not list Extracts: ${err.message}`);
  }

  result.ok = result.warnings.length === 0;
  return result;
}

async function ensureRuntimeCredentialAlias(config, alias, userid, password) {
  if (!alias || !userid || !password) {
    return { skipped: true, reason: 'missing_runtime_credential_input' };
  }

  const endpoint = `/credentials/OracleGoldenGate/${encodeURIComponent(alias)}`;
  try {
    return await runtimeJsonRequest(config, endpoint, {
      method: 'PUT',
      timeoutMs: 30000,
      body: { userid, password },
    });
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    return runtimeJsonRequest(config, endpoint, {
      method: 'POST',
      timeoutMs: 30000,
      body: { userid, password },
      allowStatuses: (statusCode) => statusCode === 201 || (statusCode >= 200 && statusCode < 300),
    });
  }
}

async function studioLogin(config, { force = false } = {}) {
  if (!force) {
    const cachedToken = cachedStudioToken();
    if (cachedToken) return cachedToken;
  }
  if (studioLoginPromise) return studioLoginPromise;
  if (force) invalidateStudioToken();

  studioLoginPromise = (async () => {
    const response = await studioJsonRequest(config, null, '/auth/token', {
      method: 'POST',
      body: {
        deploymentUsername: config.goldengate.studioUsername,
        deploymentPassword: config.goldengate.studioPassword,
      },
      timeoutMs: 20000,
    });
    const token = response?.token || response?.access_token;
    if (!token) {
      throw new Error('GoldenGate Studio token response did not include a token');
    }
    studioToken = token;
    studioTokenExpiresAt = Date.now() + STUDIO_TOKEN_CACHE_TTL_MS;
    return token;
  })();

  try {
    return await studioLoginPromise;
  } finally {
    studioLoginPromise = null;
  }
}

function findNamedItem(items, name) {
  const normalized = cleanText(name).toLowerCase();
  return (items || []).find((item) => cleanText(item.name).toLowerCase() === normalized) || null;
}

async function listStudioConnections(config, token) {
  const response = await studioJsonRequest(config, token, '/connections');
  return response?.items || [];
}

async function listStudioPipelines(config, token) {
  const response = await studioJsonRequest(config, token, '/pipelines');
  return response?.items || [];
}

async function listStudioJobs(config, token) {
  const response = await studioJsonRequest(config, token, '/jobs');
  return response?.items || [];
}

async function deleteStudioJob(config, token, job) {
  const id = resourceId(job);
  if (!id) return { ok: false, skipped: true, reason: 'missing_job_id' };
  await studioJsonRequest(config, token, `/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    timeoutMs: 30000,
    allowStatuses: (statusCode) => statusCode === 404 || (statusCode >= 200 && statusCode < 300),
  });
  return { ok: true, id };
}

async function deleteStudioPipeline(config, token, pipeline) {
  const id = resourceId(pipeline);
  if (!id) return { ok: false, skipped: true, reason: 'missing_pipeline_id' };
  await studioJsonRequest(config, token, `/pipelines/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    timeoutMs: 30000,
    allowStatuses: (statusCode) => statusCode === 404 || (statusCode >= 200 && statusCode < 300),
  });
  return { ok: true, id };
}

function isStudioJobForPipeline(job, pipeline) {
  const pipelineId = resourceId(pipeline);
  const pipelineName = pipeline?.name || '';
  return cleanText(job?.name).toLowerCase() === cleanText(pipelineName).toLowerCase()
    || cleanText(job?.associatedId) === cleanText(pipelineId)
    || cleanText(job?.pipelineId) === cleanText(pipelineId)
    || cleanText(job?.pipeline?.id) === cleanText(pipelineId);
}

async function resetGoldenGateStudioPipeline(config, token) {
  const pipelines = await listStudioPipelines(config, token);
  const existingPipeline = findNamedItem(pipelines, config.goldengate.pipelineName);
  const jobs = await listStudioJobs(config, token);
  const deletedJobs = [];

  for (const job of jobs) {
    if (cleanText(job?.name).toLowerCase() === config.goldengate.pipelineName.toLowerCase()
      || (existingPipeline && isStudioJobForPipeline(job, existingPipeline))) {
      deletedJobs.push(await deleteStudioJob(config, token, job));
    }
  }

  const deletedPipeline = existingPipeline
    ? await deleteStudioPipeline(config, token, existingPipeline)
    : null;

  return {
    ok: true,
    deletedJobs,
    deletedPipeline,
  };
}

async function ensureStudioJob(config, token, pipeline) {
  const pipelineName = pipeline?.name || config.goldengate.pipelineName;
  let existingJob = null;
  try {
    existingJob = findNamedItem(await listStudioJobs(config, token), pipelineName);
  } catch (err) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return {
        name: pipelineName,
        associatedId: pipeline?.id,
        skipped: true,
        reason: `studio_jobs_endpoint_http_${err.statusCode}`,
      };
    }
    throw err;
  }
  if (existingJob) return existingJob;

  try {
    return await studioJsonRequest(config, token, '/jobs', {
      method: 'POST',
      timeoutMs: 60000,
      body: {
        name: pipelineName,
        description: pipeline?.description || 'Replicate NetSuite customer changes into the PeakGear Bronze customer table',
        associatedId: pipeline.id,
      },
    });
  } catch (err) {
    if (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 409) {
      return {
        name: pipelineName,
        associatedId: pipeline?.id,
        skipped: true,
        reason: `studio_jobs_endpoint_http_${err.statusCode}`,
      };
    }
    throw err;
  }
}

async function deleteStudioConnection(config, token, connection) {
  const id = connection?.id || connection?.name;
  if (!id) return;
  await studioJsonRequest(config, token, `/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    timeoutMs: 20000,
    allowStatuses: (statusCode) => statusCode === 404 || (statusCode >= 200 && statusCode < 300),
  });
}

async function createStudioConnection(config, token, payload) {
  return studioJsonRequest(config, token, '/connections', {
    method: 'POST',
    body: payload,
    timeoutMs: 30000,
  });
}

async function updateStudioConnection(config, token, connection, payload) {
  const id = connection?.id || connection?.name;
  if (!id) return createStudioConnection(config, token, payload);
  return studioJsonRequest(config, token, `/connections/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
    timeoutMs: 30000,
  });
}

async function upsertStudioConnection(config, token, payload) {
  const existing = findNamedItem(await listStudioConnections(config, token), payload.name);
  if (existing) {
    return updateStudioConnection(config, token, existing, payload);
  }
  return createStudioConnection(config, token, payload);
}

function resolveServiceName(config, walletServices = []) {
  const configured = cleanText(config.target.connectString)
    || cleanText(process.env.SERVICE_NAME)
    || cleanText(process.env.ADB_SERVICE_NAME);
  const serviceToken = configured.includes('/')
    ? configured.split('/').pop()
    : configured.split('.').shift();
  const normalized = cleanText(serviceToken).toUpperCase();
  if (walletServices.includes(normalized)) return normalized;

  const highService = walletServices.find((service) => /_HIGH$/i.test(service));
  return highService || normalized;
}

function buildMultipartBody(fields, fileField, fileName, fileBuffer) {
  const boundary = `----PeakGear${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  const push = (value) => chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));

  for (const [name, value] of Object.entries(fields || {})) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(`${value}\r\n`);
  }

  push(`--${boundary}\r\n`);
  push(`Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\n`);
  push('Content-Type: application/zip\r\n\r\n');
  push(fileBuffer);
  push('\r\n');
  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function uploadStudioWallet(config, token, connectionName) {
  const walletZip = config.target.studioWalletZip;
  const fileBuffer = await fs.readFile(walletZip);
  const { body, contentType } = buildMultipartBody({}, 'file', path.basename(walletZip), fileBuffer);
  const response = await studioRawRequest(
    config,
    token,
    `/connections/actions/uploadWallet?connectionName=${encodeURIComponent(connectionName)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body,
      timeoutMs: 60000,
    }
  );
  return parseJson(response.body) || {};
}

async function ensureStudioConnections(config, token) {
  const sourceConnection = await upsertStudioConnection(config, token, {
    name: config.goldengate.sourceConnectionName,
    description: 'PeakGear demo NetSuite source database',
    connector: 'DATABASE',
    role: 'SOURCE',
    properties: {
      databaseType: 'ORACLE',
      connectionType: 'BASIC',
      hostName: 'netsuite-db',
      port: '1521',
      service: 'FREEPDB1',
      userName: cleanText(process.env.GOLDENGATE_SOURCE_USER) || 'GGADMIN',
      password: process.env.GOLDENGATE_SOURCE_PASSWORD || config.source.password,
    },
  });

  const deploymentConnection = await upsertStudioConnection(config, token, {
    name: config.goldengate.deploymentConnectionName,
    description: 'PeakGear demo GoldenGate runtime connection',
    connector: 'GOLDENGATE',
    role: 'BOTH',
    properties: {
      hostName: config.goldengate.runtimeHost,
      port: config.goldengate.runtimePort,
      userName: config.goldengate.runtimeUsername,
      password: config.goldengate.runtimePassword,
      deployment: config.goldengate.deployment,
      useReverseProxy: 'false',
    },
  });

  const walletUpload = await uploadStudioWallet(config, token, config.goldengate.targetConnectionName);
  const targetService = resolveServiceName(config, walletUpload.items || []);
  const targetGoldenGateUser = safeOracleIdentifier(config.goldengate.targetAdminUser);
  const targetGoldenGatePassword = config.goldengate.targetAdminPassword || getTargetAdminPassword() || config.target.password;
  await ensureRuntimeCredentialAlias(
    config,
    config.goldengate.targetAlias,
    `${targetGoldenGateUser}@${targetService}`,
    targetGoldenGatePassword
  );
  const targetConnection = await upsertStudioConnection(config, token, {
    name: config.goldengate.targetConnectionName,
    description: 'PeakGear demo Autonomous Database Bronze target schema',
    connector: 'DATABASE',
    role: 'TARGET',
    properties: {
      databaseType: 'ORACLE',
      connectionType: 'CLOUDWALLET',
      wallet: walletUpload.location,
      service: targetService,
      userName: targetGoldenGateUser,
      password: targetGoldenGatePassword,
    },
  });

  return {
    source: sourceConnection,
    target: targetConnection,
    deployment: deploymentConnection,
  };
}

function studioConnectionId(connection) {
  return connection?.id || connection?.connectionId || connection?.name;
}

async function ensureStudioPipeline(config, token, connections) {
  const existing = findNamedItem(await listStudioPipelines(config, token), config.goldengate.pipelineName);
  if (existing) {
    await ensureStudioJob(config, token, existing);
    return existing;
  }

  const sourceId = studioConnectionId(connections.source);
  const targetId = studioConnectionId(connections.target);
  const deploymentId = studioConnectionId(connections.deployment);

  const parameters = {
    mappings: [
      {
        source: { schema: config.source.user, table: 'CUSTOMERS' },
        target: { schema: config.target.user, table: TARGET_TABLE_NAME },
      },
    ],
    initialLoad: false,
    initialLoadType: 'DBLINK',
    isPrivateNetwork: false,
    initialLoadParallelDegree: '1',
    initialLoadJobDuraion: '1h',
    extractSourceTimezone: 'null',
    extractParams: [],
    extractAutorestartEnable: 'false',
    extractAutorestartRetries: '9',
    extractAutorestartDelay: '0s',
    extractAutorestartWindow: '1m',
    extractAutorestartOnlyIfFails: 'true',
    extractAutorestartDisableOnFailure: 'true',
    extractAutorestartFailures: '1',
    ddlError: 'KILL',
    includeDdl: 'true',
    tableExistsAction: 'SKIP',
    waitForOpenTxnsDuraion: '1h',
    OpenTxnsAction: 'CONTINUE',
    replicatAutorestartEnable: 'false',
    replicatAutorestartDelay: '0s',
    replicatAutorestartDisableOnFailure: 'true',
    replicatAutorestartFailures: '1',
    replicatAutorestartOnlyIfFails: 'true',
    replicatAutorestartRetries: '9',
    replicatAutorestartWindow: '1m',
    replicatParams: [],
    replicatError: 'RETRYOP',
    replicatErrorMaxRetry: '1',
    replicatErrorDelay: '0s',
    onlineMigration: false,
    sourceUserIdAlias: config.goldengate.sourceAlias,
    targetUserIdAlias: config.goldengate.targetAlias,
  };

  const pipelineResponse = await studioJsonRequest(config, token, '/pipelines', {
    method: 'POST',
    timeoutMs: 120000,
    body: {
      name: config.goldengate.pipelineName,
      description: 'Replicate NetSuite customer changes into the PeakGear Bronze customer table',
      sourceId,
      targetId,
      steps: [
        {
          name: STUDIO_REPLICATE_STEP_NAME,
          recipe: STUDIO_REPLICATE_RECIPE_NAME,
          recipeId: STUDIO_REPLICATE_RECIPE_ID,
          recipeVersion: '1.0',
          parameters,
          association: [
            { first: { id: sourceId, type: 'DATABASE' }, second: { id: deploymentId, type: 'GOLDENGATE' } },
            { first: { id: targetId, type: 'DATABASE' }, second: { id: deploymentId, type: 'GOLDENGATE' } },
          ],
          path: [{ first: sourceId, second: targetId }],
        },
      ],
    },
  });

  const pipeline = findNamedItem(await listStudioPipelines(config, token), config.goldengate.pipelineName)
    || pipelineResponse?.response
    || pipelineResponse;
  await ensureStudioJob(config, token, pipeline);

  return pipeline;
}

async function ensureGoldenGateStudioAssets(config = getCdcConfig(), { reset = false } = {}) {
  const token = await studioLogin(config);
  await ensureTargetPrivilegesForStudio(config);
  const resetResult = reset ? await resetGoldenGateStudioPipeline(config, token) : { skipped: true };
  const connections = await ensureStudioConnections(config, token);
  const pipeline = await ensureStudioPipeline(config, token, connections);

  return {
    ok: true,
    reset: resetResult,
    connections,
    pipeline,
  };
}

async function getGoldenGateStudioAssets(config, token) {
  const [connections, pipelines] = await Promise.all([
    listStudioConnections(config, token),
    listStudioPipelines(config, token),
  ]);
  const expectedConnections = {
    source: findNamedItem(connections, config.goldengate.sourceConnectionName),
    target: findNamedItem(connections, config.goldengate.targetConnectionName),
    deployment: findNamedItem(connections, config.goldengate.deploymentConnectionName),
  };
  const pipeline = findNamedItem(pipelines, config.goldengate.pipelineName);

  return {
    expectedConnections,
    pipeline,
    configured: Boolean(expectedConnections.source && expectedConnections.target && expectedConnections.deployment && pipeline),
  };
}

function basicAuthHeader(config) {
  return `Basic ${Buffer.from(`${config.goldengate.runtimeUsername}:${config.goldengate.runtimePassword}`).toString('base64')}`;
}

async function probeGoldenGateProcess(config, processType, name) {
  const paths = [
    `/services/v2/${processType}/${encodeURIComponent(name)}`,
    `/services/v2/deployments/${encodeURIComponent(config.goldengate.deployment)}/${processType}/${encodeURIComponent(name)}`,
    `/services/v2/config/${processType}/${encodeURIComponent(name)}`,
  ];

  for (const endpoint of paths) {
    try {
      const response = await rawRequest(`${config.goldengate.runtimeBaseUrl}${endpoint}`, {
        headers: { Authorization: basicAuthHeader(config) },
        timeoutMs: 8000,
      });
      return {
        configured: true,
        endpoint,
        detail: parseJson(response.body) || response.body.slice(0, 240),
      };
    } catch (err) {
      if (err.statusCode && err.statusCode !== 404) {
        return {
          configured: false,
          endpoint,
          detail: err.message,
        };
      }
    }
  }

  return {
    configured: false,
    detail: `${name} not found through the GoldenGate REST status endpoints`,
  };
}

async function getGoldenGateStatus(config = getCdcConfig()) {
  if (!config.goldengate.baseUrl) {
    return {
      connected: false,
      configured: false,
      reason: 'goldengate_not_configured',
      detail: 'GoldenGate base URL is not configured',
      uiUrl: config.goldengate.uiUrl,
      credentials: {
        username: config.goldengate.studioUsername,
        password: config.goldengate.studioPassword,
      },
      runtimeUrl: config.goldengate.runtimeBaseUrl,
    };
  }

  try {
    const uiResponse = await rawRequest(`${config.goldengate.baseUrl}/`, {
      timeoutMs: 8000,
      allowStatuses: (statusCode) => statusCode >= 200 && statusCode < 500,
    });
    const isStudio = /GoldenGate Studio|app-root|ogg-splash/i.test(uiResponse.body);
    const token = await studioLogin(config);
    const assets = await getGoldenGateStudioAssets(config, token);
    const [extractsResult, replicatsResult] = await Promise.allSettled([
      listRuntimeProcesses(config, 'extracts'),
      listRuntimeProcesses(config, 'replicats'),
    ]);
    const extracts = extractsResult.status === 'fulfilled' ? extractsResult.value : [];
    const replicats = replicatsResult.status === 'fulfilled' ? replicatsResult.value : [];

    return {
      connected: true,
      configured: Boolean(isStudio && assets.configured),
      productName: config.goldengate.productName,
      detail: assets.configured
        ? 'GoldenGate Studio Free has the PeakGear CDC connections and pipeline'
        : 'GoldenGate Studio Free is reachable, but the CDC assets are still being provisioned',
      uiUrl: config.goldengate.uiUrl,
      credentials: {
        username: config.goldengate.studioUsername,
        password: config.goldengate.studioPassword,
      },
      runtimeUrl: config.goldengate.runtimeBaseUrl,
      studioAssets: {
        sourceConnection: Boolean(assets.expectedConnections.source),
        targetConnection: Boolean(assets.expectedConnections.target),
        deploymentConnection: Boolean(assets.expectedConnections.deployment),
        pipeline: Boolean(assets.pipeline),
        pipelineName: config.goldengate.pipelineName,
      },
      deployment: config.goldengate.deployment,
      extractName: config.goldengate.extractName,
      replicatName: config.goldengate.replicatName,
      runtimeProcesses: {
        extracts: extracts.map((extract) => ({ name: extract.name, status: extract.status || null })),
        replicats: replicats.map((replicat) => ({ name: replicat.name, status: replicat.status || null })),
      },
      sourceAlias: config.goldengate.sourceAlias,
      targetAlias: config.goldengate.targetAlias,
    };
  } catch (err) {
    return {
      connected: false,
      configured: false,
      reason: err.code || err.statusCode || 'goldengate_unavailable',
      detail: err.message,
      uiUrl: config.goldengate.uiUrl,
      credentials: {
        username: config.goldengate.studioUsername,
        password: config.goldengate.studioPassword,
      },
      runtimeUrl: config.goldengate.runtimeBaseUrl,
      deployment: config.goldengate.deployment,
      extractName: config.goldengate.extractName,
      replicatName: config.goldengate.replicatName,
    };
  }
}

async function getSourceStatus(config = getCdcConfig()) {
  try {
    return await withSourceConnection(config, async (connection) => {
      const result = await connection.execute(
        `SELECT COUNT(*) AS row_count, MAX(updated_at) AS last_updated_at
         FROM customers`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return {
        connected: true,
        sourceTable: SOURCE_TABLE_DISPLAY,
        connectString: config.source.connectString,
        hostPort: config.source.hostPort,
        rowCount: Number(result.rows?.[0]?.ROW_COUNT || 0),
        lastUpdatedAt: result.rows?.[0]?.LAST_UPDATED_AT || null,
      };
    });
  } catch (err) {
    return {
      connected: false,
      sourceTable: SOURCE_TABLE_DISPLAY,
      connectString: config.source.connectString,
      hostPort: config.source.hostPort,
      reason: err.code || 'source_unavailable',
      detail: err.message,
    };
  }
}

async function getTargetStatus(config = getCdcConfig()) {
  try {
    const result = await ensureCustomerCdcTargetObjects(config);
    return {
      connected: true,
      targetTable: config.target.displayName,
      rowCount: result.rowCount,
      lastUpdatedAt: result.lastUpdatedAt,
    };
  } catch (err) {
    return {
      connected: false,
      targetTable: config.target.displayName,
      reason: err.reason || err.code || 'target_unavailable',
      detail: err.message,
    };
  }
}

async function getCustomerCdcStatus() {
  const config = getCdcConfig();
  const [source, target, goldengate] = await Promise.all([
    getSourceStatus(config),
    getTargetStatus(config),
    getGoldenGateStatus(config),
  ]);

  return {
    ok: true,
    source,
    target,
    goldengate,
    sync: {
      initialLoadComplete: Boolean(source.connected && target.connected && source.rowCount > 0 && target.rowCount >= source.rowCount),
      rowDelta: source.connected && target.connected ? Math.max((source.rowCount || 0) - (target.rowCount || 0), 0) : null,
    },
    pipeline: {
      sourceConnection: config.source.connectString,
      sourceTable: SOURCE_TABLE_DISPLAY,
      targetConnection: config.target.connectString || 'Not configured',
      targetTable: config.target.displayName,
      extractName: config.goldengate.extractName,
      replicatName: config.goldengate.replicatName,
      sourceAlias: config.goldengate.sourceAlias,
      targetAlias: config.goldengate.targetAlias,
      hostPorts: {
        netsuiteDb: config.source.hostPort,
        goldenGateHttp: cleanText(process.env.GOLDENGATE_HTTP_PORT) || '8501',
      },
    },
    checkedAt: new Date().toISOString(),
  };
}

function normalizeCustomer(row) {
  if (!row) return null;
  return {
    sourceCustomerId: row.SOURCE_CUSTOMER_ID,
    customerName: row.CUSTOMER_NAME,
    customerType: row.CUSTOMER_TYPE,
    email: row.EMAIL,
    phone: row.PHONE,
    loyaltyTier: row.LOYALTY_TIER,
    marketSegment: row.MARKET_SEGMENT,
    age: row.AGE == null ? null : Number(row.AGE),
    income: row.INCOME == null ? null : Number(row.INCOME),
    registrationDate: row.REGISTRATION_DATE,
    sourceSystem: row.SOURCE_SYSTEM,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
    cdcLoadedAt: row.CDC_LOADED_AT || null,
  };
}

async function queryCustomerRows(connection, tableName, limit = 12) {
  const result = await connection.execute(
    `SELECT *
     FROM (
       SELECT source_customer_id,
              customer_name,
              customer_type,
              email,
              phone,
              loyalty_tier,
              market_segment,
              age,
              income,
              TO_CHAR(registration_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS registration_date,
              source_system,
              TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS created_at,
              TO_CHAR(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS updated_at,
              ${tableName === TARGET_TABLE_NAME ? 'TO_CHAR(cdc_loaded_at, \'YYYY-MM-DD"T"HH24:MI:SS.FF3\') AS cdc_loaded_at' : 'CAST(NULL AS VARCHAR2(40)) AS cdc_loaded_at'}
       FROM ${tableName}
       ORDER BY updated_at DESC, source_customer_id
     )
     WHERE ROWNUM <= :limit`,
    { limit },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []).map(normalizeCustomer);
}

async function getCustomerRows({ limit = 12 } = {}) {
  const config = getCdcConfig();
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const [sourceResult, targetResult] = await Promise.allSettled([
    withSourceConnection(config, (connection) => queryCustomerRows(connection, 'customers', safeLimit)),
    withTargetConnection(config, (connection) => queryCustomerRows(connection, TARGET_TABLE_NAME, safeLimit)),
  ]);

  return {
    ok: true,
    source: sourceResult.status === 'fulfilled'
      ? { connected: true, rows: sourceResult.value }
      : { connected: false, rows: [], error: sourceResult.reason?.message || 'Source rows unavailable' },
    target: targetResult.status === 'fulfilled'
      ? { connected: true, rows: targetResult.value }
      : { connected: false, rows: [], error: targetResult.reason?.message || 'Target rows unavailable' },
    checkedAt: new Date().toISOString(),
  };
}

function nextLoyaltyTier(currentTier) {
  const tiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  const currentIndex = tiers.indexOf(cleanText(currentTier).toUpperCase());
  return tiers[(currentIndex + 1) % tiers.length] || 'SILVER';
}

async function findCustomerById(connection, sourceCustomerId) {
  const result = await connection.execute(
    `SELECT source_customer_id,
            customer_name,
            customer_type,
            email,
            phone,
            loyalty_tier,
            market_segment,
            age,
            income,
            TO_CHAR(registration_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS registration_date,
            source_system,
            TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS created_at,
            TO_CHAR(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS updated_at,
            CAST(NULL AS VARCHAR2(40)) AS cdc_loaded_at
     FROM customers
     WHERE source_customer_id = :sourceCustomerId`,
    { sourceCustomerId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return normalizeCustomer(result.rows?.[0]);
}

async function findTargetCustomer(config, sourceCustomerId) {
  return withTargetConnection(config, async (connection) => {
    const result = await connection.execute(
      `SELECT source_customer_id,
              customer_name,
              customer_type,
              email,
              phone,
              loyalty_tier,
              market_segment,
              age,
              income,
              TO_CHAR(registration_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS registration_date,
              source_system,
              TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS created_at,
              TO_CHAR(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS updated_at,
              TO_CHAR(cdc_loaded_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS cdc_loaded_at
       FROM bronze_netsuite_customers
       WHERE source_customer_id = :sourceCustomerId`,
      { sourceCustomerId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return normalizeCustomer(result.rows?.[0]);
  });
}

async function pollReplicatedCustomer(config, sourceCustomer) {
  let lastError = null;
  const maxAttempts = Number(process.env.CUSTOMER_CDC_POLL_ATTEMPTS || 30);
  const pollDelayMs = Number(process.env.CUSTOMER_CDC_POLL_DELAY_MS || 3000);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await delay(pollDelayMs);
    try {
      const targetCustomer = await findTargetCustomer(config, sourceCustomer.sourceCustomerId);
      if (targetCustomer
        && targetCustomer.loyaltyTier === sourceCustomer.loyaltyTier
        && targetCustomer.email === sourceCustomer.email) {
        return {
          replicated: true,
          targetCustomer,
          attempts: attempt + 1,
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  return {
    replicated: false,
    targetCustomer: null,
    attempts: maxAttempts,
    detail: lastError?.message || 'Target row did not reflect the source change within the polling window',
  };
}

async function mergeCustomerIntoTarget(connection, sourceCustomer) {
  const binds = {
    sourceCustomerId: sourceCustomer.sourceCustomerId,
    customerName: sourceCustomer.customerName,
    customerType: sourceCustomer.customerType,
    email: sourceCustomer.email,
    phone: sourceCustomer.phone,
    loyaltyTier: sourceCustomer.loyaltyTier,
    marketSegment: sourceCustomer.marketSegment,
    age: sourceCustomer.age,
    income: sourceCustomer.income,
    registrationDate: sourceCustomer.registrationDate,
    sourceSystem: sourceCustomer.sourceSystem || 'NetSuite',
    createdAt: sourceCustomer.createdAt,
    updatedAt: sourceCustomer.updatedAt,
  };

  return connection.execute(
    `MERGE INTO bronze_netsuite_customers target
     USING (
       SELECT :sourceCustomerId AS source_customer_id,
              :customerName AS customer_name,
              :customerType AS customer_type,
              :email AS email,
              :phone AS phone,
              :loyaltyTier AS loyalty_tier,
              :marketSegment AS market_segment,
              :age AS age,
              :income AS income,
              TO_TIMESTAMP(:registrationDate, 'YYYY-MM-DD"T"HH24:MI:SS') AS registration_date,
              :sourceSystem AS source_system,
              TO_TIMESTAMP(:createdAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS created_at,
              TO_TIMESTAMP(:updatedAt, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS updated_at
       FROM dual
     ) source
     ON (target.source_customer_id = source.source_customer_id)
     WHEN MATCHED THEN UPDATE SET
       target.customer_name = source.customer_name,
       target.customer_type = source.customer_type,
       target.email = source.email,
       target.phone = source.phone,
       target.loyalty_tier = source.loyalty_tier,
       target.market_segment = source.market_segment,
       target.age = source.age,
       target.income = source.income,
       target.registration_date = source.registration_date,
       target.source_system = source.source_system,
       target.created_at = source.created_at,
       target.updated_at = source.updated_at,
       target.cdc_loaded_at = SYSTIMESTAMP
     WHEN NOT MATCHED THEN INSERT (
       source_customer_id,
       customer_name,
       customer_type,
       email,
       phone,
       loyalty_tier,
       market_segment,
       age,
       income,
       registration_date,
       source_system,
       created_at,
       updated_at,
       cdc_loaded_at
     ) VALUES (
       source.source_customer_id,
       source.customer_name,
       source.customer_type,
       source.email,
       source.phone,
       source.loyalty_tier,
       source.market_segment,
       source.age,
       source.income,
       source.registration_date,
       source.source_system,
       source.created_at,
       source.updated_at,
       SYSTIMESTAMP
     )`,
    binds,
    { autoCommit: true }
  );
}

async function applyDemoCdcChange(config, sourceCustomer) {
  if (!enabled(process.env.CUSTOMER_CDC_DEMO_APPLY, false)) {
    return { applied: false, mode: 'disabled' };
  }

  await ensureCustomerCdcTargetObjects(config);
  return withTargetConnection(config, async (connection) => {
    const result = await mergeCustomerIntoTarget(connection, sourceCustomer);

    return {
      applied: true,
      mode: 'demo-bronze-merge',
      rowsAffected: result.rowsAffected || 0,
    };
  });
}

async function readAllSourceCustomers(config) {
  return withSourceConnection(config, async (connection) => {
    const result = await connection.execute(
      `SELECT source_customer_id,
              customer_name,
              customer_type,
              email,
              phone,
              loyalty_tier,
              market_segment,
              age,
              income,
              TO_CHAR(registration_date, 'YYYY-MM-DD"T"HH24:MI:SS') AS registration_date,
              source_system,
              TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS created_at,
              TO_CHAR(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3') AS updated_at,
              CAST(NULL AS VARCHAR2(40)) AS cdc_loaded_at
       FROM customers
       ORDER BY source_customer_id`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return (result.rows || []).map(normalizeCustomer);
  });
}

async function resetSourceBaselineRows(config = getCdcConfig()) {
  return withSourceConnection(config, async (connection) => {
    await connection.execute('DELETE FROM customers');
    const insertSql = `INSERT INTO customers (
       source_customer_id,
       customer_name,
       customer_type,
       email,
       phone,
       loyalty_tier,
       market_segment,
       age,
       income,
       registration_date
     ) VALUES (
       :sourceCustomerId,
       :customerName,
       :customerType,
       :email,
       :phone,
       :loyaltyTier,
       :marketSegment,
       :age,
       :income,
       TO_TIMESTAMP(:registrationDate, 'YYYY-MM-DD HH24:MI:SS')
     )`;

    for (const customer of BASELINE_CUSTOMERS) {
      await connection.execute(insertSql, customer);
    }
    await connection.commit();
    return {
      ok: true,
      rowsSeeded: BASELINE_CUSTOMERS.length,
    };
  });
}

async function syncTargetBaselineFromSource(config = getCdcConfig()) {
  const rows = await readAllSourceCustomers(config);
  let rowsAffected = 0;
  const reset = await resetCustomerCdcTargetRows(config);
  await withTargetConnection(config, async (connection) => {
    for (const row of rows) {
      const result = await mergeCustomerIntoTarget(connection, row);
      rowsAffected += result.rowsAffected || 0;
    }
  });

  const nextTarget = await getTargetStatus(config);
  return {
    ok: true,
    mode: 'baseline-seed',
    sourceRows: rows.length,
    targetRows: nextTarget.rowCount,
    rowsDeleted: reset.rowsDeleted || 0,
    rowsAffected,
  };
}

async function insertDemoCustomer(connection) {
  const sourceCustomerId = `${DEMO_ID_PREFIX}${Date.now()}`;
  const shortId = sourceCustomerId.slice(-6);
  const profile = GENERATED_DEMO_CUSTOMERS[Number(shortId) % GENERATED_DEMO_CUSTOMERS.length];
  const [customerName, emailPrefix, emailDomain, marketSegment, age, income] = profile;
  const customer = {
    sourceCustomerId,
    customerName,
    customerType: 'B2C',
    email: `${emailPrefix}.${shortId}@${emailDomain}`,
    phone: `+1-415-555-${shortId.slice(-4)}`,
    loyaltyTier: ['BRONZE', 'SILVER', 'GOLD'][Number(shortId) % 3],
    marketSegment,
    age,
    income,
  };

  await connection.execute(
    `INSERT INTO customers (
       source_customer_id,
       customer_name,
       customer_type,
       email,
       phone,
       loyalty_tier,
       market_segment,
       age,
       income,
       registration_date
     ) VALUES (
       :sourceCustomerId,
       :customerName,
       :customerType,
       :email,
       :phone,
       :loyaltyTier,
       :marketSegment,
       :age,
       :income,
       SYSTIMESTAMP
     )`,
    customer,
    { autoCommit: true }
  );

  return findCustomerById(connection, sourceCustomerId);
}

async function findLatestReplicatedDemoCustomerId(config) {
  try {
    return await withTargetConnection(config, async (connection) => {
      const result = await connection.execute(
        `SELECT source_customer_id
         FROM (
           SELECT source_customer_id
           FROM bronze_netsuite_customers
           WHERE source_customer_id LIKE :prefix
           ORDER BY updated_at DESC
         )
         WHERE ROWNUM = 1`,
        { prefix: `${DEMO_ID_PREFIX}%` },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return result.rows?.[0]?.SOURCE_CUSTOMER_ID || null;
    });
  } catch {
    return null;
  }
}

async function updateDemoCustomer(connection, preferredCustomerId = null) {
  if (preferredCustomerId) {
    const existingPreferred = await connection.execute(
      `SELECT source_customer_id, loyalty_tier
       FROM customers
       WHERE source_customer_id = :sourceCustomerId`,
      { sourceCustomerId: preferredCustomerId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const preferredRow = existingPreferred.rows?.[0];
    if (preferredRow) {
      return updateDemoCustomerByRow(connection, preferredRow);
    }
  }

  const existing = await connection.execute(
    `SELECT source_customer_id, loyalty_tier
     FROM (
       SELECT source_customer_id, loyalty_tier
       FROM customers
       WHERE source_customer_id LIKE :prefix
       ORDER BY updated_at DESC
     )
     WHERE ROWNUM = 1`,
    { prefix: `${DEMO_ID_PREFIX}%` },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const row = existing.rows?.[0];
  if (!row) {
    return insertDemoCustomer(connection);
  }

  return updateDemoCustomerByRow(connection, row);
}

async function updateDemoCustomerByRow(connection, row) {
  const sourceCustomerId = row.SOURCE_CUSTOMER_ID;
  const loyaltyTier = nextLoyaltyTier(row.LOYALTY_TIER);
  const shortId = sourceCustomerId.slice(-6);
  const profile = GENERATED_DEMO_CUSTOMERS[Number(shortId) % GENERATED_DEMO_CUSTOMERS.length];
  const [, emailPrefix, emailDomain] = profile;

  await connection.execute(
    `UPDATE customers
     SET loyalty_tier = :loyaltyTier,
         email = :email,
         phone = :phone,
         market_segment = 'Loyalty Program',
         income = income + 750
     WHERE source_customer_id = :sourceCustomerId`,
    {
      loyaltyTier,
      email: `${emailPrefix}.${shortId}.${loyaltyTier.toLowerCase()}@${emailDomain}`,
      phone: `+1-628-555-${shortId.slice(-4)}`,
      sourceCustomerId,
    },
    { autoCommit: true }
  );

  return findCustomerById(connection, sourceCustomerId);
}

async function simulateCustomerChange(action = 'insert') {
  const config = getCdcConfig();
  const normalizedAction = cleanText(action).toLowerCase();
  if (!['insert', 'update'].includes(normalizedAction)) {
    const err = new Error('Action must be insert or update');
    err.status = 400;
    throw err;
  }

  const preferredCustomerId = normalizedAction === 'update'
    ? await findLatestReplicatedDemoCustomerId(config)
    : null;
  const sourceCustomer = await withSourceConnection(config, async (connection) => (
    normalizedAction === 'insert'
      ? insertDemoCustomer(connection)
      : updateDemoCustomer(connection, preferredCustomerId)
  ));

  const demoApply = await applyDemoCdcChange(config, sourceCustomer);
  const replication = await pollReplicatedCustomer(config, sourceCustomer);
  return {
    ok: true,
    action: normalizedAction,
    sourceCustomer,
    demoApply,
    replication,
    checkedAt: new Date().toISOString(),
  };
}

async function clearDemoCustomers() {
  const config = getCdcConfig();
  const [sourceResult, targetResult] = await Promise.allSettled([
    withSourceConnection(config, async (connection) => {
      const result = await connection.execute(
        `DELETE FROM customers WHERE source_customer_id LIKE :prefix`,
        { prefix: `${DEMO_ID_PREFIX}%` },
        { autoCommit: true }
      );
      return result.rowsAffected || 0;
    }),
    withTargetConnection(config, async (connection) => {
      const result = await connection.execute(
        `DELETE FROM bronze_netsuite_customers WHERE source_customer_id LIKE :prefix`,
        { prefix: `${DEMO_ID_PREFIX}%` },
        { autoCommit: true }
      );
      return result.rowsAffected || 0;
    }),
  ]);

  return {
    ok: sourceResult.status === 'fulfilled',
    sourceRowsDeleted: sourceResult.status === 'fulfilled' ? sourceResult.value : 0,
    targetRowsDeleted: targetResult.status === 'fulfilled' ? targetResult.value : 0,
    sourceError: sourceResult.status === 'rejected' ? sourceResult.reason?.message : null,
    targetError: targetResult.status === 'rejected' ? targetResult.reason?.message : null,
  };
}

async function ensureCustomerCdcSetup({ reset = false } = {}) {
  const config = getCdcConfig();
  await ensureCustomerCdcTargetObjects(config);
  const initialSource = await getSourceStatus(config);

  if (!initialSource.connected) {
    throw new Error(initialSource.detail || 'NetSuite source DB is not ready');
  }

  const runtimeReset = reset ? await resetGoldenGateRuntimeProcesses(config) : { skipped: true };
  const sourceReset = reset ? await resetSourceBaselineRows(config) : { skipped: true };
  const baselineSync = reset ? await syncTargetBaselineFromSource(config) : { skipped: true };
  const studioAssets = await ensureGoldenGateStudioAssets(config, { reset });
  const goldengate = await getGoldenGateStatus(config);
  const source = await getSourceStatus(config);
  const targetStatus = await getTargetStatus(config);

  if (!goldengate.connected) {
    throw new Error(goldengate.detail || 'GoldenGate is not ready');
  }

  return {
    ok: true,
    source,
    target: targetStatus,
    sourceReset,
    baselineSync,
    runtimeReset,
    goldengate,
    studioAssets,
  };
}

function scheduleCustomerCdcSetup() {
  if (setupScheduled || !enabled(process.env.CUSTOMER_CDC_AUTO_SETUP, true)) {
    return;
  }
  setupScheduled = true;

  const initialDelayMs = Number(process.env.CUSTOMER_CDC_SETUP_DELAY_MS || 60000);
  const retryMs = Number(process.env.CUSTOMER_CDC_SETUP_RETRY_MS || 30000);
  const maxAttempts = Number(process.env.CUSTOMER_CDC_SETUP_ATTEMPTS || 20);

  const runAttempt = async (attempt) => {
    try {
      const result = await ensureCustomerCdcSetup({
        reset: enabled(process.env.CUSTOMER_CDC_RESET_ON_STARTUP, false),
      });
      console.log(`[customer-cdc] setup ready: ${result.target.targetTable || TARGET_TABLE_DISPLAY}`);
    } catch (err) {
      if (attempt >= maxAttempts) {
        console.warn(`[customer-cdc] setup did not complete after ${attempt} attempts: ${err.message}`);
        return;
      }
      console.warn(`[customer-cdc] setup attempt ${attempt} failed: ${err.message}`);
      setTimeout(() => runAttempt(attempt + 1), retryMs);
    }
  };

  setTimeout(() => runAttempt(1), initialDelayMs);
}

module.exports = {
  clearDemoCustomers,
  ensureCustomerCdcSetup,
  ensureCustomerCdcTargetObjects,
  ensureGoldenGateStudioAssets,
  getCustomerCdcStatus,
  getCustomerRows,
  scheduleCustomerCdcSetup,
  simulateCustomerChange,
};
