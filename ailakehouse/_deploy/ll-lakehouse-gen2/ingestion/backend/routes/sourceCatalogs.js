const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { oracledb } = require('../config/database');
const db = require('../config/database');

const router = express.Router();
const CATALOG_OWNER = 'PG';
const DEFAULT_WALLET_DIR = '/wallet';

function cleanText(value) {
  return String(value || '').trim();
}

function port(name, defaultValue) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : defaultValue;
}

function loadBalancerFqdn() {
  const host = cleanText(process.env.SOURCE_PUBLIC_HOST);
  const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const isFqdn = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])$/.test(host) && host.includes('.');

  return isFqdn && !isIpAddress ? host : null;
}

function targetConfig() {
  const sharedPassword = process.env.DBPASSWORD || '';

  return {
    connectString: cleanText(process.env.ADB_CONNECTION_STRING)
      || cleanText(process.env.DBCONNECTION)
      || cleanText(process.env.ADB_SERVICE_NAME)
      || cleanText(process.env.SERVICE_NAME),
    catalogPassword: process.env.ADB_STREAM_SCHEMA_PASSWORD || sharedPassword,
    sourcePassword: sharedPassword,
    walletDir: cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_WALLET_DIR,
    walletPassword: process.env.ADB_WALLET_PASSWORD || process.env.ORACLE_WALLET_PASSWORD || '',
  };
}

function sourceCatalogs() {
  const host = loadBalancerFqdn();
  if (!host) {
    const err = new Error('The load balancer FQDN is not available yet. Provision the instance through Terraform, then try again.');
    err.statusCode = 503;
    throw err;
  }
  const sources = [
    {
      catalogName: 'PG_LOYALTY_MYSQL_CAT',
      credentialName: 'PG_LOYALTY_MYSQL_CRED',
      linkName: 'PG_LOYALTY_MYSQL_LINK',
      engine: 'MySQL',
      username: cleanText(process.env.LOYALTY_MYSQL_USER) || CATALOG_OWNER,
      hostname: host,
      port: port('LOYALTY_MYSQL_CATALOG_PORT', 3306),
      serviceName: cleanText(process.env.LOYALTY_MYSQL_DATABASE) || 'loyalty',
      dbType: 'mysql_community',
    },
  ];

  return sources;
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

async function requireAdminDemoUser(req) {
  const username = cleanText(req.demoUser);
  if (!username) return false;

  const result = await db.execute(
    `SELECT role
       FROM app_users
      WHERE username = :username
        AND is_active = 1`,
    { username },
  );
  const role = result.rows?.[0]?.ROLE ?? result.rows?.[0]?.role;
  return String(role || '').toLowerCase() === 'admin';
}

async function withCatalogOwnerConnection(action) {
  const config = targetConfig();
  if (!config.connectString || !config.catalogPassword || !config.sourcePassword) {
    const err = new Error('Autonomous Database and source database credentials are not configured.');
    err.statusCode = 503;
    throw err;
  }
  if (!(await hasWalletDirectory(config.walletDir))) {
    const err = new Error('The Autonomous Database wallet is not available to the application.');
    err.statusCode = 503;
    throw err;
  }

  let connection;
  try {
    connection = await oracledb.getConnection({
      user: CATALOG_OWNER,
      password: config.catalogPassword,
      connectString: config.connectString,
      configDir: config.walletDir,
      ...(config.walletPassword ? {
        walletLocation: config.walletDir,
        walletPassword: config.walletPassword,
      } : {}),
    });
    connection.callTimeout = 120000;
    return await action(connection, config.sourcePassword);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function ensureCatalog(connection, source, password, replaceExisting) {
  const existingLinks = await connection.execute(
    `SELECT db_link
       FROM user_db_links
      WHERE db_link = :linkName`,
    { linkName: source.linkName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const linkExists = Boolean(existingLinks.rows?.length);
  if (linkExists && replaceExisting) {
    await connection.execute(
      `BEGIN
         BEGIN
           DBMS_CATALOG.UNMOUNT(:catalogName);
         EXCEPTION
           WHEN OTHERS THEN NULL;
         END;
         DBMS_CLOUD_ADMIN.DROP_DATABASE_LINK(:linkName);
       END;`,
      { catalogName: source.catalogName, linkName: source.linkName },
      { autoCommit: true },
    );
  }

  if (!linkExists || replaceExisting) {
    await connection.execute(
      `BEGIN
         BEGIN
           DBMS_CLOUD.DROP_CREDENTIAL(:credentialName);
         EXCEPTION
           WHEN OTHERS THEN NULL;
         END;

         DBMS_CLOUD.CREATE_CREDENTIAL(
           credential_name => :credentialName,
           username        => :username,
           password        => :password
         );
       END;`,
      {
        credentialName: source.credentialName,
        username: source.username,
        password,
      },
      { autoCommit: true },
    );

    const linkBinds = {
      credentialName: source.credentialName,
      linkName: source.linkName,
      hostname: source.hostname,
      port: source.port,
      serviceName: source.serviceName,
    };
    const linkSql = source.dbType
      ? `BEGIN
           DBMS_CLOUD_ADMIN.CREATE_DATABASE_LINK(
             db_link_name       => :linkName,
             hostname           => :hostname,
             port               => :port,
             service_name       => :serviceName,
             credential_name    => :credentialName,
             gateway_params     => JSON_OBJECT('db_type' VALUE '${source.dbType}'),
             ssl_server_cert_dn => NULL
           );
         END;`
      : `BEGIN
           DBMS_CLOUD_ADMIN.CREATE_DATABASE_LINK(
             db_link_name       => :linkName,
             hostname           => :hostname,
             port               => :port,
             service_name       => :serviceName,
             credential_name    => :credentialName,
             directory_name     => NULL,
             ssl_server_cert_dn => NULL
           );
         END;`;
    await connection.execute(linkSql, linkBinds, { autoCommit: true });

    await connection.execute(
      `BEGIN
         DBMS_CATALOG.MOUNT_DB_LINK(
           catalog_name => :catalogName,
           db_link      => :linkName,
           enabled      => TRUE
         );
       END;`,
      {
        catalogName: source.catalogName,
        linkName: source.linkName,
      },
      { autoCommit: true },
    );
  }

  return {
    catalogName: source.catalogName,
    engine: source.engine,
    created: !linkExists || replaceExisting,
    replaced: linkExists && replaceExisting,
  };
}

async function createSourceCatalogs(replaceExisting = false) {
  const sources = sourceCatalogs();
  return withCatalogOwnerConnection(async (connection, password) => {
    const catalogs = [];
    for (const source of sources) {
      catalogs.push(await ensureCatalog(connection, source, password, replaceExisting));
    }
    return catalogs;
  });
}

router.post('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    if (!(await requireAdminDemoUser(req))) {
      return res.status(403).json({ error: 'An active administrator is required to create database links.' });
    }

    const catalogs = await createSourceCatalogs(req.query.replace === 'true');
    return res.json({ created: true, catalogs });
  } catch (err) {
    const statusCode = err.statusCode || 502;
    console.error('Source database link creation failed:', err.code || err.name || 'unknown_error');
    return res.status(statusCode).json({
      error: statusCode === 503
        ? err.message
        : 'Database links could not be created. Check that the source containers are healthy, then try again.',
    });
  }
});

module.exports = router;
module.exports._private = {
  CATALOG_OWNER,
  cleanText,
  loadBalancerFqdn,
  sourceCatalogs,
  targetConfig,
};
