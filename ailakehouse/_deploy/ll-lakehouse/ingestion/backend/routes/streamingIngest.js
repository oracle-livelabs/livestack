/**
 * Real-time streaming ingest demo API.
 *
 * The app controls the Kafka signal generator and reports whether OSA-loaded
 * live demand signals have reached the server ADB wallet lakehouse.
 */
const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { oracledb } = require('../config/database');

const router = express.Router();

const DEFAULT_GENERATOR_URL = 'http://ggsa:18088';
const DEFAULT_TOPIC = 'peakgear.demand.signals.raw';
const DEFAULT_OSA_BOOTSTRAP = 'localhost:19092';
const DEFAULT_TARGET_TABLE = 'PG.BRONZE_DEMAND_SIGNALS';
const DEFAULT_SCHEMA_USERNAME = 'PG';
const DEFAULT_WALLET_DIR = '/wallet';

function cleanText(value) {
  return String(value || '').trim();
}

function getGeneratorUrl() {
  return cleanText(process.env.SIGNAL_GENERATOR_URL) || DEFAULT_GENERATOR_URL;
}

function getTopic() {
  return cleanText(process.env.SIGNAL_KAFKA_TOPIC) || DEFAULT_TOPIC;
}

function getLakehouseConfig() {
  const connectString = cleanText(process.env.ADB_CONNECTION_STRING)
    || cleanText(process.env.DBCONNECTION)
    || cleanText(process.env.ADB_SERVICE_NAME)
    || cleanText(process.env.SERVICE_NAME);
  const walletDir = cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_WALLET_DIR;

  if (!connectString || !walletDir) return null;

  return {
    connectString,
    walletDir,
    walletPassword: process.env.ADB_WALLET_PASSWORD
      || process.env.ORACLE_WALLET_PASSWORD
      || '',
    username: cleanText(process.env.ADB_STREAM_SCHEMA_USER) || DEFAULT_SCHEMA_USERNAME,
    password: process.env.ADB_STREAM_SCHEMA_PASSWORD
      || process.env.DBPASSWORD
      || process.env.ADB_ADMIN_PASSWORD
      || '',
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peakgear-stream-wallet-'));
  try {
    await fs.cp(walletDir, tempDir, { recursive: true });
    await fs.rm(path.join(tempDir, 'ojdbc.properties'), { force: true });
    return {
      options: {
        configDir: tempDir,
      },
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

async function fetchGenerator(endpoint, options = {}) {
  const url = `${getGeneratorUrl()}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || `Signal generator returned HTTP ${response.status}`);
    err.status = response.status;
    err.details = payload;
    throw err;
  }
  return payload;
}

async function getLakehouseLiveSignalStatus() {
  const config = getLakehouseConfig();
  if (!config) {
    return {
      available: false,
      connected: false,
      reason: 'not_configured',
      detail: 'Server ADB wallet is not configured',
    };
  }

  if (!(await hasWalletDirectory(config.walletDir))) {
    return {
      available: false,
      connected: false,
      reason: 'wallet_not_found',
      detail: 'Server ADB wallet is not available',
    };
  }

  let connection;
  let wallet;
  try {
    wallet = await useWalletDirectory(config.walletDir);
    connection = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: config.connectString,
      ...wallet.options,
      ...(config.walletPassword ? { walletLocation: wallet.options.configDir, walletPassword: config.walletPassword } : {}),
    });

    const result = await connection.execute(
      `SELECT COUNT(*) AS live_rows,
              MAX(created_at) AS last_loaded_at
       FROM bronze_demand_signals
       WHERE signal_id LIKE 'LIVE-%'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return {
      available: true,
      connected: true,
      targetTable: DEFAULT_TARGET_TABLE,
      liveRows: Number(result.rows?.[0]?.LIVE_ROWS || 0),
      lastLoadedAt: result.rows?.[0]?.LAST_LOADED_AT || null,
    };
  } catch (err) {
    return {
      available: true,
      connected: false,
      targetTable: DEFAULT_TARGET_TABLE,
      reason: err.code || 'lakehouse_query_failed',
      detail: err.message,
    };
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

async function deleteLiveSignals() {
  const config = getLakehouseConfig();
  if (!config || !(await hasWalletDirectory(config.walletDir))) {
    const err = new Error('Server ADB wallet is not configured');
    err.status = 409;
    throw err;
  }

  let connection;
  let wallet;
  try {
    wallet = await useWalletDirectory(config.walletDir);
    connection = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: config.connectString,
      ...wallet.options,
      ...(config.walletPassword ? { walletLocation: wallet.options.configDir, walletPassword: config.walletPassword } : {}),
    });

    const result = await connection.execute(
      `DELETE FROM bronze_demand_signals WHERE signal_id LIKE 'LIVE-%'`,
      {},
      { autoCommit: true }
    );

    return {
      ok: true,
      rowsDeleted: result.rowsAffected || 0,
    };
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

function pipelineConfig() {
  return {
    topic: getTopic(),
    osaKafkaBootstrap: cleanText(process.env.OSA_KAFKA_BOOTSTRAP) || DEFAULT_OSA_BOOTSTRAP,
    generatorControlUrl: getGeneratorUrl(),
    targetConnectionName: cleanText(process.env.OSA_ADB_CONNECTION_NAME) || 'PeakGear_ADB',
    targetTable: DEFAULT_TARGET_TABLE,
    keyField: 'signal_id',
    eventFields: [
      'signal_id',
      'observed_at',
      'source_system',
      'source_type',
      'platform',
      'region',
      'signal_text',
      'likes',
      'shares',
      'comments',
      'views',
      'sentiment_score',
      'criticality_score',
      'momentum_flag',
      'product_hints',
      'topic_tags',
    ],
  };
}

router.get('/pipeline-config', (req, res) => {
  res.json({
    ok: true,
    pipeline: pipelineConfig(),
  });
});

router.get('/status', async (req, res) => {
  const [generatorResult, lakehouseResult] = await Promise.allSettled([
    fetchGenerator('/status'),
    getLakehouseLiveSignalStatus(),
  ]);

  res.json({
    ok: true,
    pipeline: pipelineConfig(),
    generator: generatorResult.status === 'fulfilled'
      ? { available: true, ...generatorResult.value }
      : {
        available: false,
        running: false,
        topic: getTopic(),
        error: generatorResult.reason?.message || 'Signal generator is unavailable',
      },
    lakehouse: lakehouseResult.status === 'fulfilled'
      ? lakehouseResult.value
      : {
        available: false,
        connected: false,
        reason: 'lakehouse_status_unavailable',
        detail: lakehouseResult.reason?.message || 'Lakehouse status is unavailable',
      },
    checkedAt: new Date().toISOString(),
  });
});

router.post('/topic', async (req, res) => {
  try {
    const result = await fetchGenerator('/topic', { method: 'POST', body: '{}' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 502).json({
      ok: false,
      error: err.message,
      details: err.details,
    });
  }
});

router.post('/start', async (req, res) => {
  try {
    const rateMs = Number(req.body?.rateMs || 1500);
    const result = await fetchGenerator('/start', {
      method: 'POST',
      body: JSON.stringify({ rateMs }),
    });
    res.json({ ok: true, generator: result });
  } catch (err) {
    res.status(err.status || 502).json({
      ok: false,
      error: err.message,
      details: err.details,
    });
  }
});

router.post('/stop', async (req, res) => {
  try {
    const result = await fetchGenerator('/stop', { method: 'POST', body: '{}' });
    res.json({ ok: true, generator: result });
  } catch (err) {
    res.status(err.status || 502).json({
      ok: false,
      error: err.message,
      details: err.details,
    });
  }
});

router.post('/produce-once', async (req, res) => {
  try {
    const result = await fetchGenerator('/produce-once', { method: 'POST', body: '{}' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 502).json({
      ok: false,
      error: err.message,
      details: err.details,
    });
  }
});

router.delete('/live-signals', async (req, res) => {
  try {
    const result = await deleteLiveSignals();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message,
    });
  }
});

module.exports = router;
