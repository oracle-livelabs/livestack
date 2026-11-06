/**
 * Webshop API
 *
 * End-customer product search backed by Oracle vector search and the
 * Private AI Services Container. Product text uses the existing MiniLM
 * catalog embeddings; product images use CLIP image embeddings generated
 * by Private AI and stored in Oracle AI Database.
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const os = require('os');
const path = require('path');
const db = require('../config/database');

const router = express.Router();
const { oracledb } = db;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error('Upload a JPG or PNG image.'));
  },
});

const IMAGE_MODEL_ID = process.env.PRIVATEAI_IMAGE_MODEL || 'clip-vit-base-patch32-img';
const TEXT_IMAGE_MODEL_ID = process.env.PRIVATEAI_IMAGE_TEXT_MODEL || 'clip-vit-base-patch32-txt';
const TEXT_CATALOG_MODEL_ID = process.env.PRIVATEAI_TEXT_MODEL || 'all-minilm-l12-v2';
const PRIVATEAI_BASE_URL = (process.env.PRIVATEAI_BASE_URL || 'http://privateai:8080').replace(/\/$/, '');
const UPLOAD_PAR_URL = (process.env.WEBSHOP_UPLOAD_PAR_URL || '').trim();
const UPLOAD_OBJECT_PREFIX = (process.env.WEBSHOP_UPLOAD_OBJECT_PREFIX || 'webshop-uploads')
  .replace(/^\/+|\/+$/g, '');
const LAKEHOUSE_SCHEMA_USERNAME = 'PG';
const DEFAULT_WALLET_DIR = '/wallet';
const WEBSHOP_RETURN_AGENT_PROFILE_NAME = cleanRuntimeName(process.env.WEBSHOP_RETURN_AGENT_PROFILE_NAME || 'PG_RETURN_AGENT_PROFILE');
const WEBSHOP_RETURN_AGENT_TEAM_NAME = cleanRuntimeName(process.env.WEBSHOP_RETURN_AGENT_TEAM_NAME || 'RETURN_ADVISOR_TEAM');
const WEBSHOP_RETURN_AGENT_AGENT_NAME = 'RETURN_ADVISOR_AGENT';
const WEBSHOP_RETURN_AGENT_TASK_NAME = 'RETURN_ADVISOR_TASK';
const WEBSHOP_RETURN_AGENT_TOOLS = [
  'VERIFY_ORDER_TOOL',
  'PROPOSE_ORDER_STATUS_TOOL',
  'TROUBLESHOOT_PRODUCT_TOOL',
  'GET_RECOMMENDATIONS_TOOL',
];
const WEBSHOP_RETURN_AGENT_FUNCTIONS = [
  'VERIFY_CUSTOMER_ORDER',
  'PROPOSE_ORDER_STATUS_UPDATE',
  'TROUBLESHOOT_PRODUCT_ISSUE',
  'GET_PRODUCT_RECOMMENDATIONS',
];
const WEBSHOP_AI_CHAT_ENABLED = envFlagEnabled('WEBSHOP_AI_CHAT_ENABLED', true);
const IMAGE_ROOT = path.resolve(
  process.env.PRODUCT_IMAGE_ROOT || path.join(__dirname, '../../images'),
);
const MAX_LIMIT = 16;
const IMAGE_INDEX_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.WEBSHOP_IMAGE_INDEX_LIMIT || '1000', 10) || 1000,
);
const RETURN_AGENT_ORDER_STATUSES = new Set([
  'return_shipment_pending',
  'refund',
  'refund_completed',
  'replaced',
  'exchanged',
]);
const COLOR_FAMILIES = [
  'white',
  'black',
  'gray',
  'blue',
  'red',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'brown',
];

const COLOR_SYNONYMS = new Map([
  ['white', 'white'],
  ['cream', 'white'],
  ['ivory', 'white'],
  ['black', 'black'],
  ['charcoal', 'black'],
  ['grey', 'gray'],
  ['gray', 'gray'],
  ['silver', 'gray'],
  ['blue', 'blue'],
  ['navy', 'blue'],
  ['red', 'red'],
  ['maroon', 'red'],
  ['green', 'green'],
  ['olive', 'green'],
  ['yellow', 'yellow'],
  ['orange', 'orange'],
  ['pink', 'pink'],
  ['purple', 'purple'],
  ['brown', 'brown'],
  ['tan', 'brown'],
]);

const PRODUCT_TYPE_INTENTS = [
  { pattern: /\b(t[\s-]?shirt|tee|shirt|top)\b/i, types: ['tee shirt', 'base layer top'] },
  { pattern: /\bhoodie\b/i, types: ['hoodie'] },
  { pattern: /\b(shorts?)\b/i, types: ['compression shorts'] },
  { pattern: /\b(running shoe|runner|trail shoe|trail runner)\b/i, types: ['trail running shoe', 'running shoe'] },
  { pattern: /\b(hiking boot|boot)\b/i, types: ['hiking boot'] },
  { pattern: /\b(sock|socks)\b/i, types: ['running socks'] },
  { pattern: /\b(jacket|shell)\b/i, types: ['outdoor jacket'] },
  { pattern: /\b(backpack|pack|daypack)\b/i, types: ['backpack', 'daypack'] },
  { pattern: /\b(watch|fitness watch)\b/i, types: ['fitness watch'] },
  { pattern: /\b(kettlebell)\b/i, types: ['kettlebell'] },
  { pattern: /\b(dumbbell|dumbbells)\b/i, types: ['dumbbells'] },
  { pattern: /\b(basketball)\b/i, types: ['basketball'] },
  { pattern: /\b(soccer ball)\b/i, types: ['soccer ball'] },
];

let indexPromise = null;
const returnAgentConversations = new Map();
const returnAgentSessionFacts = new Map();
const returnAgentOracleConversations = new Map();

function cleanText(value) {
  return String(value || '').trim();
}

function cleanRuntimeName(value) {
  return cleanText(value).toUpperCase();
}

function envFlagEnabled(name, defaultValue = true) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || rawValue === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(rawValue).trim().toLowerCase());
}

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
}

function expandedProductTokens(product) {
  const productText = [
    product.PRODUCT_NAME,
    product.CATEGORY,
    product.SUBCATEGORY,
    product.TAGS,
  ].join(' ');
  const tokens = new Set(tokenize(productText));
  const normalized = productText.toLowerCase();

  const expansions = [
    [/trail runner|running shoe|court shoe|cross training/i, ['shoe', 'runner', 'running', 'trail', 'training']],
    [/hiking boot/i, ['hiking', 'boot', 'shoe', 'trail']],
    [/hoodie/i, ['hoodie', 'training', 'activewear']],
    [/shell|rain jacket|outerwear/i, ['jacket', 'outdoor', 'shell', 'rain']],
    [/tee|base layer/i, ['tee', 'base', 'layer', 'top', 'performance']],
    [/compression|tight/i, ['compression', 'shorts', 'base', 'layer']],
    [/hydration/i, ['hydration', 'vest', 'belt', 'pack']],
    [/backpack|pack/i, ['backpack', 'daypack', 'pack']],
    [/trekking/i, ['trekking', 'poles', 'trail']],
    [/sleep|sleeping/i, ['sleeping', 'bag', 'camp']],
    [/tent/i, ['tent', 'camping']],
    [/gps|watch/i, ['gps', 'fitness', 'watch']],
    [/heart|sensor/i, ['heart', 'rate', 'strap', 'sensor']],
    [/bike computer|cycling/i, ['cycling', 'computer', 'bike']],
    [/recovery|massage/i, ['recovery', 'foam', 'roller']],
    [/kettlebell|strength/i, ['kettlebell', 'dumbbells', 'strength']],
    [/yoga/i, ['yoga', 'resistance', 'band']],
    [/basketball/i, ['basketball']],
    [/soccer/i, ['soccer', 'ball']],
    [/baseball|glove/i, ['baseball', 'glove']],
    [/sup|paddle/i, ['paddle', 'water', 'board']],
    [/duffel|dry/i, ['dry', 'bag', 'duffel', 'waterproof']],
  ];

  expansions.forEach(([pattern, extraTokens]) => {
    if (pattern.test(normalized)) {
      extraTokens.forEach((token) => tokens.add(token));
    }
  });

  return tokens;
}

function imageDescriptor(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
  return baseName
    .replace(/^\d+_/, '')
    .replace(/^sku-\d+_/, '')
    .replace(/-\d+$/, '')
    .replace(/[_-]+/g, ' ');
}

function imageSku(filePath) {
  const match = path.basename(filePath).match(/SKU-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function productTypeCaseSql(alias = 'p') {
  return `CASE
    WHEN LOWER(${alias}.product_name) LIKE '%trail runner%' THEN 'trail running shoe'
    WHEN LOWER(${alias}.product_name) LIKE '%running shoe%' THEN 'running shoe'
    WHEN LOWER(${alias}.product_name) LIKE '%cross-training shoe%' THEN 'training shoe'
    WHEN LOWER(${alias}.product_name) LIKE '%hiking boot%' THEN 'hiking boot'
    WHEN LOWER(${alias}.product_name) LIKE '%running socks%' THEN 'running socks'
    WHEN LOWER(${alias}.product_name) LIKE '%training hoodie%' THEN 'hoodie'
    WHEN LOWER(${alias}.product_name) LIKE '%compression shorts%' THEN 'compression shorts'
    WHEN LOWER(${alias}.product_name) LIKE '%performance tee%' THEN 'tee shirt'
    WHEN LOWER(${alias}.product_name) LIKE '%base layer top%' THEN 'base layer top'
    WHEN LOWER(${alias}.product_name) LIKE '%base layer pants%' THEN 'base layer pants'
    WHEN LOWER(${alias}.product_name) LIKE '%outdoor jacket%' THEN 'outdoor jacket'
    WHEN LOWER(${alias}.product_name) LIKE '%daypack%' THEN 'daypack'
    WHEN LOWER(${alias}.product_name) LIKE '%backpack%' THEN 'backpack'
    WHEN LOWER(${alias}.product_name) LIKE '%trekking poles%' THEN 'trekking poles'
    WHEN LOWER(${alias}.product_name) LIKE '%tent%' THEN 'tent'
    WHEN LOWER(${alias}.product_name) LIKE '%camping stove%' THEN 'camping stove'
    WHEN LOWER(${alias}.product_name) LIKE '%headlamp%' THEN 'headlamp'
    WHEN LOWER(${alias}.product_name) LIKE '%dry bag%' THEN 'dry bag'
    WHEN LOWER(${alias}.product_name) LIKE '%bike light%' THEN 'bike light'
    WHEN LOWER(${alias}.product_name) LIKE '%cycling jersey%' THEN 'cycling jersey'
    WHEN LOWER(${alias}.product_name) LIKE '%repair kit%' THEN 'repair kit'
    WHEN LOWER(${alias}.product_name) LIKE '%kettlebell%' THEN 'kettlebell'
    WHEN LOWER(${alias}.product_name) LIKE '%dumbbells%' THEN 'dumbbells'
    WHEN LOWER(${alias}.product_name) LIKE '%resistance band%' THEN 'resistance bands'
    WHEN LOWER(${alias}.product_name) LIKE '%yoga mat%' THEN 'yoga mat'
    WHEN LOWER(${alias}.product_name) LIKE '%foam roller%' THEN 'foam roller'
    WHEN LOWER(${alias}.product_name) LIKE '%gps fitness watch%' THEN 'fitness watch'
    WHEN LOWER(${alias}.product_name) LIKE '%smart scale%' THEN 'smart scale'
    WHEN LOWER(${alias}.product_name) LIKE '%basketball%' THEN 'basketball'
    WHEN LOWER(${alias}.product_name) LIKE '%soccer ball%' THEN 'soccer ball'
    WHEN LOWER(${alias}.product_name) LIKE '%baseball glove%' THEN 'baseball glove'
    WHEN LOWER(${alias}.product_name) LIKE '%volleyball%' THEN 'volleyball'
    WHEN LOWER(${alias}.product_name) LIKE '%pickleball paddle%' THEN 'pickleball paddle'
    WHEN LOWER(${alias}.product_name) LIKE '%tennis racket%' THEN 'tennis racket'
    WHEN LOWER(${alias}.product_name) LIKE '%badminton set%' THEN 'badminton set'
    WHEN LOWER(${alias}.product_name) LIKE '%grip tape%' THEN 'grip tape'
    WHEN LOWER(${alias}.product_name) LIKE '%climbing harness%' THEN 'climbing harness'
    WHEN LOWER(${alias}.product_name) LIKE '%belay device%' THEN 'belay device'
    WHEN LOWER(${alias}.product_name) LIKE '%carabiner set%' THEN 'carabiner set'
    WHEN LOWER(${alias}.product_name) LIKE '%snow helmet%' THEN 'snow helmet'
    WHEN LOWER(${alias}.product_name) LIKE '%wetsuit%' THEN 'wetsuit'
    WHEN LOWER(${alias}.product_name) LIKE '%swim goggles%' THEN 'swim goggles'
    WHEN LOWER(${alias}.product_name) LIKE '%paddle leash%' THEN 'paddle leash'
    WHEN LOWER(${alias}.product_name) LIKE '%electrolyte mix%' THEN 'electrolyte mix'
    ELSE LOWER(NVL(${alias}.subcategory, ${alias}.category))
  END`;
}

function parseSearchIntent(query) {
  const tokens = tokenize(query);
  const colorFamily = tokens.map((token) => COLOR_SYNONYMS.get(token)).find(Boolean) || null;
  const productTypes = new Set();

  PRODUCT_TYPE_INTENTS.forEach((intent) => {
    if (intent.pattern.test(query)) {
      intent.types.forEach((type) => productTypes.add(type));
    }
  });

  return {
    colorFamily,
    productTypes,
  };
}

function matchesProductType(productType, intent) {
  if (!intent.productTypes?.size) return false;
  const normalized = String(productType || '').toLowerCase();
  return intent.productTypes.has(normalized);
}

function colorScore(result, intent) {
  if (!intent.colorFamily) return 0;
  const colorFamily = String(result.colorFamily || '').toLowerCase();
  if (!colorFamily || colorFamily === 'unknown') return -0.02;
  const confidence = Number(result.colorConfidence || 0);
  if (colorFamily === intent.colorFamily) {
    return 0.28 + Math.min(Math.max(confidence, 0), 1) * 0.04;
  }
  return -0.12;
}

function productTypeScore(result, intent) {
  if (!intent.productTypes?.size) return 0;
  return matchesProductType(result.productType, intent) ? 0.14 : -0.18;
}

function scoreImageForProduct(productTokens, descriptor) {
  const descriptorTokens = new Set(tokenize(descriptor));
  let score = 0;

  descriptorTokens.forEach((token) => {
    if (productTokens.has(token)) score += 4;
  });

  const descriptorText = descriptor.toLowerCase();
  productTokens.forEach((token) => {
    if (token.length > 3 && descriptorText.includes(token)) score += 1;
  });

  return score;
}

function getLakehouseConfig() {
  const connectString = cleanText(process.env.ADB_CONNECTION_STRING)
    || cleanText(process.env.DBCONNECTION)
    || cleanText(process.env.ADB_SERVICE_NAME)
    || cleanText(process.env.SERVICE_NAME);
  const walletDir = cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_WALLET_DIR;
  const password = process.env.ADB_STREAM_SCHEMA_PASSWORD
    || process.env.DBPASSWORD
    || process.env.ADB_ADMIN_PASSWORD
    || '';

  if (!connectString || !walletDir || !password) return null;

  return {
    connectString,
    walletDir,
    walletPassword: process.env.ADB_WALLET_PASSWORD
      || process.env.ORACLE_WALLET_PASSWORD
      || '',
    username: cleanText(process.env.ADB_STREAM_SCHEMA_USER) || LAKEHOUSE_SCHEMA_USERNAME,
    password,
  };
}

async function hasWalletDirectory(walletDir) {
  try {
    const checks = await Promise.all(['tnsnames.ora', 'sqlnet.ora'].map(async (fileName) => {
      const stat = await fsp.stat(path.join(walletDir, fileName));
      return stat.isFile() && stat.size > 0;
    }));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}

async function useWalletDirectory(walletDir) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'peakgear-webshop-wallet-'));
  try {
    await fsp.cp(walletDir, tempDir, { recursive: true });
    await fsp.rm(path.join(tempDir, 'ojdbc.properties'), { force: true });
    return {
      options: {
        configDir: tempDir,
      },
      cleanup: async () => {
        await fsp.rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await fsp.rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

async function readLobValue(value) {
  if (value && typeof value.getData === 'function') {
    return value.getData();
  }
  return value;
}

function parseJsonText(value) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatDbTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return cleanText(value) || null;
}

function rememberReturnAgentTurn(sessionId, role, content) {
  const key = cleanText(sessionId);
  if (!key) return;
  const turns = returnAgentConversations.get(key) || [];
  turns.push({ role, content: cleanText(content).slice(0, 2000) });
  returnAgentConversations.set(key, turns.slice(-10));
}

function getReturnAgentFacts(sessionId) {
  return returnAgentSessionFacts.get(cleanText(sessionId)) || {};
}

function rememberReturnAgentFacts(sessionId, facts) {
  const key = cleanText(sessionId);
  if (!key || !facts || typeof facts !== 'object') return {};
  const current = returnAgentSessionFacts.get(key) || {};
  const next = { ...current };

  for (const [name, value] of Object.entries(facts)) {
    const cleaned = cleanText(value);
    if (cleaned) next[name] = cleaned;
  }

  returnAgentSessionFacts.set(key, next);
  return next;
}

async function getReturnAgentOracleConversationId(connection, sessionId) {
  const key = cleanText(sessionId);
  if (!key) return '';

  const existing = returnAgentOracleConversations.get(key);
  if (existing) return existing;

  const result = await connection.execute(`
    BEGIN
      :conversationId := DBMS_CLOUD_AI.CREATE_CONVERSATION();
    END;
  `, {
    conversationId: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 128 },
  });
  const conversationId = cleanText(result.outBinds?.conversationId);
  if (conversationId) {
    returnAgentOracleConversations.set(key, conversationId);
  }
  return conversationId;
}

function getReturnAgentRecommendations(sessionId) {
  const facts = getReturnAgentFacts(sessionId);
  const parsed = parseJsonText(facts.recommendations);
  return Array.isArray(parsed) ? parsed : [];
}

function buildReturnAgentPrompt(sessionId, currentMessage) {
  return cleanText(currentMessage);
}

function unavailableReturnAgentStatus(reason, details = {}) {
  return {
    available: false,
    connected: false,
    enabled: WEBSHOP_AI_CHAT_ENABLED,
    reason,
    profileName: WEBSHOP_RETURN_AGENT_PROFILE_NAME,
    teamName: WEBSHOP_RETURN_AGENT_TEAM_NAME,
    runtime: 'select_ai_agent',
    source: 'adb',
    scope: 'ADB PG notebook Return Advisor Select AI Agent',
    ...details,
  };
}

async function withLakehouseConnection(callback) {
  if (!WEBSHOP_AI_CHAT_ENABLED) {
    const err = new Error('Ask PeakGear is disabled.');
    err.statusCode = 503;
    err.reason = 'disabled';
    throw err;
  }

  const config = getLakehouseConfig();
  if (!config) {
    const err = new Error('ADB wallet connection is not configured.');
    err.statusCode = 503;
    err.reason = 'not_configured';
    throw err;
  }

  if (!(await hasWalletDirectory(config.walletDir))) {
    const err = new Error('ADB wallet is not available.');
    err.statusCode = 503;
    err.reason = 'wallet_not_found';
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

    return await callback(connection, config);
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
    if (wallet) {
      try { await wallet.cleanup(); } catch { /* ignore */ }
    }
  }
}

async function fetchWebshopReturnAgentStatusRow(connection) {
  const result = await connection.execute(`
    SELECT
      (SELECT status
       FROM user_cloud_ai_profiles
       WHERE profile_name = :profileName) AS profile_status,
      (SELECT status
       FROM user_ai_agents
       WHERE agent_name = :agentName) AS agent_status,
      (SELECT status
       FROM user_ai_agent_tasks
       WHERE task_name = :taskName) AS task_status,
      (SELECT status
       FROM user_ai_agent_teams
       WHERE agent_team_name = :teamName) AS team_status,
      (SELECT COUNT(*)
       FROM user_ai_agent_tools
       WHERE tool_name IN (
         'VERIFY_ORDER_TOOL',
         'PROPOSE_ORDER_STATUS_TOOL',
         'TROUBLESHOOT_PRODUCT_TOOL',
         'GET_RECOMMENDATIONS_TOOL'
       )
         AND status = 'ENABLED') AS enabled_tool_count,
      (SELECT COUNT(*)
       FROM user_objects
       WHERE object_type = 'FUNCTION'
         AND object_name IN (
           'VERIFY_CUSTOMER_ORDER',
           'PROPOSE_ORDER_STATUS_UPDATE',
           'TROUBLESHOOT_PRODUCT_ISSUE',
           'GET_PRODUCT_RECOMMENDATIONS'
         )
         AND status = 'VALID') AS valid_function_count
    FROM dual
  `, {
    profileName: WEBSHOP_RETURN_AGENT_PROFILE_NAME,
    agentName: WEBSHOP_RETURN_AGENT_AGENT_NAME,
    taskName: WEBSHOP_RETURN_AGENT_TASK_NAME,
    teamName: WEBSHOP_RETURN_AGENT_TEAM_NAME,
  });

  return result.rows?.[0] || {};
}

async function recompileWebshopReturnAgentFunctions(connection) {
  const functionNames = [
    'VERIFY_CUSTOMER_ORDER',
    'PROPOSE_ORDER_STATUS_UPDATE',
    'TROUBLESHOOT_PRODUCT_ISSUE',
    'GET_PRODUCT_RECOMMENDATIONS',
  ];

  for (const functionName of functionNames) {
    await connection.execute(`ALTER FUNCTION ${functionName} COMPILE`);
  }
}

function buildWebshopReturnAgentStatus(row, details = {}) {
  return {
    available: true,
    connected: true,
    enabled: true,
    profileName: WEBSHOP_RETURN_AGENT_PROFILE_NAME,
    teamName: WEBSHOP_RETURN_AGENT_TEAM_NAME,
    profileStatus: row.PROFILE_STATUS,
    agentStatus: row.AGENT_STATUS,
    taskStatus: row.TASK_STATUS,
    teamStatus: row.TEAM_STATUS,
    enabledToolCount: Number(row.ENABLED_TOOL_COUNT || 0),
    validFunctionCount: Number(row.VALID_FUNCTION_COUNT || 0),
    runtime: 'select_ai_agent',
    source: 'adb',
    scope: 'ADB PG notebook Return Advisor Select AI Agent',
    ...details,
  };
}

async function getWebshopReturnAgentStatus() {
  if (!WEBSHOP_AI_CHAT_ENABLED) {
    return unavailableReturnAgentStatus('disabled');
  }

  try {
    return await withLakehouseConnection(async (connection) => {
      let row = await fetchWebshopReturnAgentStatusRow(connection);
      const profileEnabled = String(row.PROFILE_STATUS || '').toUpperCase() === 'ENABLED';
      const agentEnabled = String(row.AGENT_STATUS || '').toUpperCase() === 'ENABLED';
      const taskEnabled = String(row.TASK_STATUS || '').toUpperCase() === 'ENABLED';
      const teamEnabled = String(row.TEAM_STATUS || '').toUpperCase() === 'ENABLED';
      const toolsEnabled = Number(row.ENABLED_TOOL_COUNT || 0) >= WEBSHOP_RETURN_AGENT_TOOLS.length;
      let functionsValid = Number(row.VALID_FUNCTION_COUNT || 0) >= WEBSHOP_RETURN_AGENT_FUNCTIONS.length;

      if (profileEnabled && agentEnabled && taskEnabled && teamEnabled && toolsEnabled && !functionsValid) {
        try {
          await recompileWebshopReturnAgentFunctions(connection);
          row = await fetchWebshopReturnAgentStatusRow(connection);
          functionsValid = Number(row.VALID_FUNCTION_COUNT || 0) >= WEBSHOP_RETURN_AGENT_FUNCTIONS.length;
          if (functionsValid) {
            return buildWebshopReturnAgentStatus(row, { recoveredInvalidFunctions: true });
          }
        } catch (compileErr) {
          console.warn('Ask PeakGear return-agent function recompile failed:', compileErr.message || compileErr);
        }
      }

      if (!profileEnabled || !agentEnabled || !taskEnabled || !teamEnabled || !toolsEnabled || !functionsValid) {
        return unavailableReturnAgentStatus('agent_not_ready', {
          profileStatus: row.PROFILE_STATUS || null,
          agentStatus: row.AGENT_STATUS || null,
          taskStatus: row.TASK_STATUS || null,
          teamStatus: row.TEAM_STATUS || null,
          enabledToolCount: Number(row.ENABLED_TOOL_COUNT || 0),
          validFunctionCount: Number(row.VALID_FUNCTION_COUNT || 0),
        });
      }

      return buildWebshopReturnAgentStatus(row);
    });
  } catch (err) {
    return unavailableReturnAgentStatus(err.reason || 'connection_failed', {
      error: err.message,
      code: err.code,
      errorNum: err.errorNum,
    });
  }
}

async function fetchReturnAgentTrace(connection, sessionId) {
  try {
    const result = await connection.execute(`
      SELECT event_type,
             event_payload,
             TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
      FROM order_service_events
      WHERE conversation_id = :sessionId
      ORDER BY created_at DESC
      FETCH FIRST 6 ROWS ONLY
    `, { sessionId }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { EVENT_PAYLOAD: { type: oracledb.STRING } },
    });

    return Promise.all((result.rows || []).map(async (row) => {
      const payloadText = cleanText(await readLobValue(row.EVENT_PAYLOAD));
      return {
        eventType: row.EVENT_TYPE,
        createdAt: row.CREATED_AT,
        payload: parseJsonText(payloadText) || payloadText,
      };
    }));
  } catch {
    return [];
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeReturnAgentOrderStatus(value) {
  const status = cleanText(value).toLowerCase();
  return RETURN_AGENT_ORDER_STATUSES.has(status) ? status : '';
}

function normalizeOrderNumber(value) {
  const text = cleanText(value);
  const explicitMatch = text.match(/\b(?:order|order\s+number|order\s+#|order#)\s*[:#-]?\s*(\d{4,})\b/i);
  if (explicitMatch) return explicitMatch[1];

  const match = text.match(/\b\d{4,}\b/);
  return match ? match[0] : '';
}

function normalizeNameTokens(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function buildReturnAgentCustomerText(sessionId, currentMessage) {
  const key = cleanText(sessionId);
  const turns = returnAgentConversations.get(key) || [];
  const facts = getReturnAgentFacts(key);
  return [
    cleanText(currentMessage),
    facts.orderNumber ? `order ${facts.orderNumber}` : '',
    facts.customerName || '',
    facts.productName || '',
    facts.status || '',
    ...turns
      .filter((turn) => turn.role === 'user')
      .slice(-4)
      .map((turn) => cleanText(turn.content)),
  ].join(' ');
}

function buildReturnAgentConversationContext(sessionId, currentMessage) {
  const key = cleanText(sessionId);
  const turns = returnAgentConversations.get(key) || [];
  const facts = getReturnAgentFacts(key);
  const factLines = [
    facts.orderNumber ? `Known order number: ${facts.orderNumber}` : '',
    facts.customerName ? `Known customer: ${facts.customerName}` : '',
    facts.productId ? `Known product id: ${facts.productId}` : '',
    facts.productName ? `Known product: ${facts.productName}` : '',
    facts.status ? `Known order status: ${facts.status}` : '',
  ].filter(Boolean);

  const recentTurns = turns
    .slice(-8)
    .map((turn) => `${turn.role === 'assistant' ? 'PeakGear' : 'Customer'}: ${cleanText(turn.content)}`)
    .filter(Boolean);

  return [
    factLines.length ? `Known verified facts:\n${factLines.join('\n')}` : '',
    recentTurns.length ? `Conversation:\n${recentTurns.join('\n')}` : '',
    `Current customer message: ${cleanText(currentMessage)}`,
  ].filter(Boolean).join('\n\n');
}

function messageAuthorizesReturnAgentProposal(message, proposal) {
  const orderNumber = normalizeOrderNumber(proposal?.orderNumber);
  const customerTokens = normalizeNameTokens(proposal?.customerName);
  const messageText = cleanText(message);
  const messageTokens = new Set(normalizeNameTokens(messageText));

  if (!orderNumber || customerTokens.length < 2) {
    return false;
  }

  const orderPattern = new RegExp(`(^|\\D)${escapeRegExp(orderNumber)}(\\D|$)`);
  if (!orderPattern.test(messageText)) {
    return false;
  }

  return customerTokens.every((token) => messageTokens.has(token));
}

function detectReturnAgentResolutionStatus(sessionId, currentMessage) {
  const recentCustomerText = buildReturnAgentCustomerText(sessionId, currentMessage).toLowerCase();

  if (/\b(refund|money back|refund me|refund it)\b/.test(recentCustomerText)) {
    return 'refund';
  }

  if (/\b(replacement|replace it|send (a )?new|same product)\b/.test(recentCustomerText)) {
    return 'replaced';
  }

  if (/\b(exchange|exchanged|alternative|swap|different product|i'?ll take|i will take|i choose|i want the)\b/.test(recentCustomerText)) {
    return 'exchanged';
  }

  if (/\b(no longer needed|ship it back|ship the product back|return shipping|return label)\b/.test(recentCustomerText)) {
    return 'return_shipment_pending';
  }

  return '';
}

function hasReturnAgentIssueReason(value) {
  return /\b(defective|defect|broken|damaged|box broken|packaging|unravell(?:ing|ed)?|tear(?:ing|s)?|torn|not working|doesn'?t work|malfunction|keeps\s+[a-z]+|lost tackiness|loss of tackiness)\b/i
    .test(cleanText(value));
}

function hasReturnAgentSpecificIssueDetail(value) {
  return /\b(box broken|packaging|broken|damaged|unravell(?:ing|ed)?|tear(?:ing|s)?|torn|not working|doesn'?t work|keeps\s+[a-z]+|lost tackiness|loss of tackiness)\b/i
    .test(cleanText(value));
}

function hasReturnAgentGeneralIssueIntent(value) {
  return /\b(problem|issue|return|replace|replacement|refund|exchange|defective|broken|damaged)\b/i
    .test(cleanText(value));
}

function isReturnAgentTroubleshootingTurn(sessionId, currentMessage) {
  const currentText = cleanText(currentMessage).toLowerCase();
  const conversationText = buildReturnAgentCustomerText(sessionId, currentMessage).toLowerCase();

  const issueInCurrentMessage = hasReturnAgentIssueReason(currentText);
  const issueInConversation = hasReturnAgentIssueReason(conversationText);
  const returnContext = /\b(return|replace|replacement|refund|exchange|problem|issue|defect|defective|broken|damaged)\b/.test(conversationText);

  return issueInCurrentMessage || (issueInConversation && returnContext);
}

function isReturnAgentAlternativesTurn(sessionId, currentMessage) {
  const currentText = cleanText(currentMessage).toLowerCase();
  const conversationText = buildReturnAgentCustomerText(sessionId, currentMessage).toLowerCase();

  const asksForAlternatives = /\b(alt[ea]rnative|alt[ea]rnatives|similar\s+(product|products|item|items|grip\s+tape|grip\s+tapes|tape|tapes)|other\s+(product|products|item|items|option|options|grip\s+tape|grip\s+tapes|tape|tapes)|recommend|recommendation|recommendations|suggest|suggestion|suggestions|show me|what else|different\s+(product|products|item|items)|swap option|exchange option)\b/.test(currentText);
  const returnContext = /\b(return|replace|replacement|refund|exchange|problem|issue|defect|defective|broken|damaged|did not solve|didn'?t solve)\b/.test(conversationText)
    || hasReturnAgentIssueReason(conversationText);

  return asksForAlternatives && returnContext;
}

function returnAgentAssistantText(sessionId) {
  return (returnAgentConversations.get(cleanText(sessionId)) || [])
    .filter((turn) => turn.role === 'assistant')
    .slice(-4)
    .map((turn) => cleanText(turn.content))
    .join(' ');
}

function hasReturnAgentTroubleshootingAlreadyShown(sessionId) {
  return /according to the product manual|troubleshooting steps|do these steps resolve/i
    .test(returnAgentAssistantText(sessionId));
}

function normalizedCompactText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function productMatchesConversation(productName, conversationText) {
  const productCompact = normalizedCompactText(productName);
  const conversationCompact = normalizedCompactText(conversationText);
  if (productCompact && conversationCompact.includes(productCompact)) return true;

  const productTokens = tokenize(productName)
    .filter((token) => !['the', 'and', 'with'].includes(token));
  const conversationTokens = new Set(tokenize(conversationText));
  const meaningfulTokens = productTokens.filter((token) => token.length > 2);
  if (meaningfulTokens.length < 2) return false;

  return meaningfulTokens.filter((token) => conversationTokens.has(token)).length >= Math.min(2, meaningfulTokens.length);
}

async function findReturnAgentConversationProduct(connection, sessionId, currentMessage) {
  const facts = getReturnAgentFacts(sessionId);
  if (facts.productName) {
    return {
      PRODUCT_ID: facts.productId ? Number.parseInt(facts.productId, 10) : null,
      PRODUCT_NAME: facts.productName,
    };
  }

  const conversationText = buildReturnAgentCustomerText(sessionId, currentMessage);
  const result = await connection.execute(`
    SELECT product_id,
           product_name
    FROM customer_order_status
    ORDER BY product_name
  `, {}, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

  return (result.rows || []).find((row) => productMatchesConversation(row.PRODUCT_NAME, conversationText)) || null;
}

function parseTroubleshootingItems(guidanceText) {
  let text = cleanText(guidanceText).replace(/\s+/g, ' ');
  const guideIndex = text.toLowerCase().indexOf('detailed troubleshooting guide');
  if (guideIndex >= 0) {
    text = text.slice(guideIndex).replace(/^detailed troubleshooting guide\s*/i, '');
  }

  const items = [];
  const itemPattern = /\b\d+\.\s*([^:]{3,100}):\s*(.*?)(?=\s+\d+\.\s*[^:]{3,100}:|$)/g;
  let match = itemPattern.exec(text);

  while (match) {
    const title = cleanText(match[1]).replace(/^Detailed Troubleshooting Guide\s*/i, '');
    const body = cleanText(match[2])
      .replace(/\s+(Page\s+\d+|[456]\.\s+(Maintenance|Warranty|Detailed).*)$/i, '')
      .slice(0, 500);

    if (title && body && !/^Product Identification$/i.test(title)) {
      items.push({ title, body });
    }
    match = itemPattern.exec(text);
  }

  return items;
}

function selectTroubleshootingItems(guidanceText, issueText) {
  const items = parseTroubleshootingItems(guidanceText);
  if (!items.length) return [];

  const issueTokens = tokenize(issueText);
  const scored = items.map((item, index) => {
    const itemTokens = new Set(tokenize(`${item.title} ${item.body}`));
    const score = issueTokens.filter((token) => itemTokens.has(token)).length;
    return { ...item, index, score };
  });

  const matching = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3);

  return (matching.length ? matching : scored.slice(0, 3));
}

function buildReturnAgentTroubleshootingResponse(productName, issueText, guidanceText) {
  const items = selectTroubleshootingItems(guidanceText, issueText);
  const productLabel = cleanText(productName) || 'the product';

  if (!items.length) {
    return [
      `I checked the product manual for ${productLabel}, but I could not extract specific troubleshooting steps from the manual text.`,
      'If the issue continues, I can help with a replacement, refund, or alternative product.',
    ].join('\n\n');
  }

  const bullets = items.map((item) => `- ${item.title}: ${item.body}`);
  return [
    `According to the product manual, try these steps for ${productLabel}:`,
    bullets.join('\n'),
    'Do these steps resolve the issue? If not, I can help with a replacement, refund, or alternative product.',
  ].join('\n\n');
}

function parseRecommendationItems(recommendationText) {
  return cleanText(recommendationText)
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/-\s*\[(\d+)\]\s+(.+?)\s+\(([^)]+)\)\s+\$([0-9]+(?:\.[0-9]+)?)/);
      if (!match) return null;
      return {
        productId: match[1],
        productName: cleanText(match[2]),
        category: cleanText(match[3]).replace(/_/g, ' '),
        price: Number.parseFloat(match[4]),
      };
    })
    .filter(Boolean);
}

function findSelectedReturnAgentRecommendation(sessionId, currentMessage) {
  const recommendations = getReturnAgentRecommendations(sessionId);
  if (!recommendations.length) return null;

  const messageText = cleanText(currentMessage);
  const numericChoice = messageText.match(/\b(?:option|choice|number|#)?\s*([123])\b/i);
  if (numericChoice) {
    const index = Number.parseInt(numericChoice[1], 10) - 1;
    if (recommendations[index]) return recommendations[index];
  }

  const ordinalChoice = messageText.match(/\b(first|second|third)\b/i);
  if (ordinalChoice) {
    const indexByName = { first: 0, second: 1, third: 2 };
    const index = indexByName[ordinalChoice[1].toLowerCase()];
    if (recommendations[index]) return recommendations[index];
  }

  return recommendations.find((item) => (
    productMatchesConversation(item.productName, messageText)
    || (item.productId && new RegExp(`\\b${escapeRegExp(item.productId)}\\b`).test(messageText))
  )) || null;
}

function buildReturnAgentAlternativesResponse(originalProductName, recommendationText) {
  const items = parseRecommendationItems(recommendationText);
  const productLabel = cleanText(originalProductName) || 'the original product';

  if (!items.length) {
    return [
      `I could not find suitable alternatives for ${productLabel} right now.`,
      'I can still help with a replacement of the original item or a refund.',
    ].join('\n\n');
  }

  const bullets = items.map((item) => `- ${item.productName} - $${item.price.toFixed(2)} (${item.category.toLowerCase()})`);
  return [
    `Here are alternative products for ${productLabel}:`,
    bullets.join('\n'),
    'If you want to exchange for one of these, tell me which product you want and include your name plus exact order number.',
  ].join('\n\n');
}

function normalizeReturnAgentProposal(value) {
  const raw = value || {};
  const validFlag = raw.valid ?? raw.VALID;

  if (validFlag !== undefined && !['true', '1', 'yes'].includes(String(validFlag).toLowerCase())) {
    return null;
  }

  const customerName = cleanText(
    raw.customerName
    || raw.CUSTOMER_NAME
    || raw.P_CUSTOMER_NAME
    || raw.p_customer_name,
  );
  const orderNumber = normalizeOrderNumber(
    raw.orderNumber
    || raw.ORDER_NUMBER
    || raw.P_ORDER_NUMBER
    || raw.p_order_number,
  );
  const status = normalizeReturnAgentOrderStatus(
    raw.status
    || raw.STATUS
    || raw.P_STATUS
    || raw.p_status,
  );

  if (!customerName || !orderNumber || !status) {
    return null;
  }

  return {
    customerName,
    orderNumber,
    status,
  };
}

function normalizeReturnAgentOrderLookup(value) {
  const raw = typeof value === 'string' ? (parseJsonText(value) || {}) : (value || {});
  const validFlag = raw.valid ?? raw.VALID;
  const valid = validFlag === undefined || ['true', '1', 'yes'].includes(String(validFlag).toLowerCase());
  const orderNumber = normalizeOrderNumber(
    raw.orderNumber
    || raw.ORDER_NUMBER
    || raw.p_order_number
    || raw.P_ORDER_NUMBER,
  );
  const customerName = cleanText(raw.customerName || raw.CUSTOMER_NAME);
  const productId = cleanText(raw.productId || raw.PRODUCT_ID);
  const productName = cleanText(raw.productName || raw.PRODUCT_NAME);
  const status = cleanText(raw.status || raw.STATUS);
  const updatedAt = cleanText(raw.updatedAt || raw.UPDATED_AT);
  const message = cleanText(raw.message || raw.MESSAGE);

  if (!orderNumber && !message) return null;

  return {
    valid,
    orderNumber,
    customerName,
    productId,
    productName,
    status,
    updatedAt,
    message,
  };
}

async function parseReturnAgentProposalRow(row) {
  const inputPayload = parseJsonText(await readLobValue(row.INPUT)) || {};
  const outputPayload = parseJsonText(await readLobValue(row.OUTPUT)) || {};
  const outputResult = typeof outputPayload.result === 'object'
    ? outputPayload.result
    : parseJsonText(outputPayload.result);

  return normalizeReturnAgentProposal({
    ...inputPayload,
    ...(outputResult || {}),
  });
}

async function fetchLatestReturnAgentTeamExecution(connection, sessionId, teamName) {
  try {
    const result = await connection.execute(`
      SELECT team_exec_id,
             state,
             start_date
      FROM user_ai_agent_team_history
      WHERE team_name = :teamName
        AND conversation_id = :sessionId
      ORDER BY start_date DESC
      FETCH FIRST 1 ROW ONLY
    `, {
      teamName,
      sessionId,
    }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows?.[0] || null;
  } catch {
    return null;
  }
}

async function fetchReturnAgentStatusProposal(connection, teamExecId) {
  if (!teamExecId) return null;

  try {
    const result = await connection.execute(`
      SELECT input,
             output,
             start_date
      FROM user_ai_agent_tool_history
      WHERE team_exec_id = :teamExecId
        AND tool_name = 'PROPOSE_ORDER_STATUS_TOOL'
      ORDER BY start_date DESC
      FETCH FIRST 8 ROWS ONLY
    `, {
      teamExecId,
    }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: {
        INPUT: { type: oracledb.STRING },
        OUTPUT: { type: oracledb.STRING },
      },
    });

    for (const row of result.rows || []) {
      const proposal = await parseReturnAgentProposalRow(row);
      if (proposal) return proposal;
    }
  } catch {
    return null;
  }

  return null;
}

async function customerOrderStatusUpdatedAtType(connection) {
  const result = await connection.execute(`
    SELECT data_type
    FROM user_tab_columns
    WHERE table_name = 'CUSTOMER_ORDER_STATUS'
      AND column_name = 'UPDATED_AT'
  `);

  return cleanRuntimeName(result.rows?.[0]?.DATA_TYPE || 'VARCHAR2');
}

async function updateCustomerOrderStatusFromProposal(connection, proposal) {
  const orderNumber = normalizeOrderNumber(proposal.orderNumber);
  const status = normalizeReturnAgentOrderStatus(proposal.status);
  const customerName = cleanText(proposal.customerName);

  if (!orderNumber || !status || !customerName) return null;

  const rowResult = await connection.execute(`
    SELECT ROWIDTOCHAR(ROWID) AS row_id,
           order_number,
           customer_name,
           product_name
    FROM customer_order_status
    WHERE order_number = :order_number
      AND UPPER(TRIM(customer_name)) = UPPER(TRIM(:customer_name))
    FETCH FIRST 1 ROW ONLY
  `, {
    order_number: orderNumber,
    customer_name: customerName,
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

  const row = rowResult.rows?.[0];
  if (!row) return null;

  const updatedAtType = await customerOrderStatusUpdatedAtType(connection);
  let updatedAtSql = 'updated_at = :updated_at_value';
  const binds = {
    new_status: status,
    target_row_id: row.ROW_ID,
    updated_at_value: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  if (updatedAtType.startsWith('TIMESTAMP')) {
    updatedAtSql = 'updated_at = SYSTIMESTAMP';
    delete binds.updated_at_value;
  } else if (updatedAtType === 'DATE') {
    updatedAtSql = 'updated_at = SYSDATE';
    delete binds.updated_at_value;
  }

  try {
    const updateResult = await connection.execute(`
      UPDATE customer_order_status
      SET status = :new_status,
          ${updatedAtSql}
      WHERE ROWID = CHARTOROWID(:target_row_id)
    `, binds, {
      autoCommit: false,
    });

    if (Number(updateResult.rowsAffected || 0) !== 1) {
      await connection.rollback();
      return null;
    }

    await connection.commit();
  } catch (err) {
    try { await connection.rollback(); } catch { /* ignore */ }
    throw err;
  }

  const updatedResult = await connection.execute(`
    SELECT order_number,
           status,
           product_name,
           updated_at
    FROM customer_order_status
    WHERE ROWID = CHARTOROWID(:target_row_id)
  `, {
    target_row_id: row.ROW_ID,
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  const updated = updatedResult.rows?.[0] || {};

  return {
    requestId: null,
    orderNumber: updated.ORDER_NUMBER || row.ORDER_NUMBER,
    status: updated.STATUS || status,
    originalProduct: updated.PRODUCT_NAME || row.PRODUCT_NAME,
    replacementProduct: null,
    updatedAt: formatDbTimestamp(updated.UPDATED_AT),
    validated: true,
    source: 'backend_validation',
  };
}

async function buildReturnAgentBackendProposal(connection, sessionId, currentMessage) {
  const orderNumber = normalizeOrderNumber(currentMessage);
  const status = normalizeReturnAgentOrderStatus(
    detectReturnAgentResolutionStatus(sessionId, currentMessage),
  );

  if (!orderNumber || !status) return null;

  const rowResult = await connection.execute(`
    SELECT customer_name
    FROM customer_order_status
    WHERE order_number = :orderNumber
    FETCH FIRST 1 ROW ONLY
  `, {
    orderNumber,
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

  const customerName = cleanText(rowResult.rows?.[0]?.CUSTOMER_NAME);
  const proposal = {
    customerName,
    orderNumber,
    status,
  };

  return messageAuthorizesReturnAgentProposal(currentMessage, proposal) ? proposal : null;
}

function buildReturnAgentBackendResponse(request) {
  const statusLabel = cleanText(request?.status).replace(/_/g, ' ');
  const orderNumber = cleanText(request?.orderNumber);
  const productName = cleanText(request?.originalProduct);
  const replacementProduct = cleanText(request?.replacementProduct);

  if (request?.status === 'refund') {
    return `Thanks. PeakGear validation recorded order ${orderNumber} for ${productName} as refund pending. Please use the return shipping label; the refund will be processed after the item is received.`;
  }

  if (request?.status === 'refund_completed') {
    return `Thanks. PeakGear validation recorded order ${orderNumber} for ${productName} as refund completed.`;
  }

  if (request?.status === 'replaced') {
    return `Thanks. PeakGear validation recorded order ${orderNumber} for ${productName} as replacement pending.`;
  }

  if (request?.status === 'exchanged') {
    return replacementProduct
      ? `Thanks. PeakGear validation recorded order ${orderNumber} for ${productName} as exchange pending with ${replacementProduct}. You will receive the return label and exchange confirmation shortly.`
      : `Thanks. PeakGear validation recorded order ${orderNumber} for ${productName} as exchange pending.`;
  }

  return `Thanks. PeakGear validation recorded order ${orderNumber} for ${productName} as ${statusLabel}.`;
}

async function applyBackendReturnAgentResolution(connection, {
  sessionId,
  currentMessage,
}) {
  const proposal = await buildReturnAgentBackendProposal(connection, sessionId, currentMessage);
  if (!proposal) return null;

  const toolResult = await runReturnAgentTool(connection, 'PROPOSE_ORDER_STATUS_TOOL', {
    P_CUSTOMER_NAME: proposal.customerName,
    P_ORDER_NUMBER: proposal.orderNumber,
    P_STATUS: proposal.status,
  });
  const toolProposal = normalizeReturnAgentProposal(parseJsonText(toolResult.result) || proposal) || proposal;

  if (!messageAuthorizesReturnAgentProposal(currentMessage, toolProposal)) {
    return null;
  }

  const request = await updateCustomerOrderStatusFromProposal(connection, toolProposal);
  if (!request) return null;

  return {
    ...request,
    answer: buildReturnAgentBackendResponse(request),
    conversationId: sessionId,
    teamExecId: null,
  };
}

async function applyBackendReturnAgentExchangeSelection(connection, {
  sessionId,
  currentMessage,
}) {
  const facts = getReturnAgentFacts(sessionId);
  const selected = findSelectedReturnAgentRecommendation(sessionId, currentMessage);
  const proposal = {
    customerName: facts.customerName,
    orderNumber: facts.orderNumber,
    status: 'exchanged',
  };

  if (!facts.orderNumber || !facts.customerName || !facts.productName || !selected?.productName) {
    return null;
  }

  const toolResult = await runReturnAgentTool(connection, 'PROPOSE_ORDER_STATUS_TOOL', {
    P_CUSTOMER_NAME: proposal.customerName,
    P_ORDER_NUMBER: proposal.orderNumber,
    P_STATUS: proposal.status,
  });
  const toolProposal = normalizeReturnAgentProposal(parseJsonText(toolResult.result) || proposal) || proposal;

  const request = await updateCustomerOrderStatusFromProposal(connection, toolProposal);
  if (!request) return null;

  const finalizedRequest = {
    ...request,
    replacementProduct: selected.productName,
  };
  rememberReturnAgentFacts(sessionId, {
    status: finalizedRequest.status,
    updatedAt: finalizedRequest.updatedAt,
    replacementProduct: selected.productName,
  });

  return {
    ...finalizedRequest,
    answer: buildReturnAgentBackendResponse(finalizedRequest),
    conversationId: sessionId,
    teamExecId: null,
  };
}

async function lookupReturnAgentOrderContext(connection, {
  sessionId,
  currentMessage,
}) {
  if (findSelectedReturnAgentRecommendation(sessionId, currentMessage)) return null;

  const orderNumber = normalizeOrderNumber(currentMessage);
  if (!orderNumber) return null;

  const existingFacts = getReturnAgentFacts(sessionId);
  if (existingFacts.orderNumber === orderNumber && existingFacts.productName) {
    return {
      toolName: 'VERIFY_ORDER_TOOL',
      result: JSON.stringify({
        valid: true,
        orderNumber: existingFacts.orderNumber,
        customerName: existingFacts.customerName,
        productId: existingFacts.productId,
        productName: existingFacts.productName,
        status: existingFacts.status,
        updatedAt: existingFacts.updatedAt,
        message: 'Order context already verified in this conversation. Do not ask for the order number again.',
      }),
      lookup: existingFacts,
      cached: true,
    };
  }

  const toolResult = await runReturnAgentTool(connection, 'VERIFY_ORDER_TOOL', {
    P_ORDER_NUMBER: orderNumber,
  });
  const lookup = normalizeReturnAgentOrderLookup(toolResult.result);

  if (lookup?.valid) {
    rememberReturnAgentFacts(sessionId, {
      orderNumber: lookup.orderNumber,
      customerName: lookup.customerName,
      productId: lookup.productId,
      productName: lookup.productName,
      status: lookup.status,
      updatedAt: lookup.updatedAt,
    });
  }

  return {
    toolName: 'VERIFY_ORDER_TOOL',
    result: toolResult.result,
    lookup,
    cached: false,
  };
}

async function buildReturnAgentOrderLookupResult(connection, {
  sessionId,
  currentMessage,
  orderLookup,
}) {
  if (!orderLookup) return null;

  const answer = await runReturnAgentResponseTeam(connection, {
    sessionId,
    currentMessage,
    toolName: 'VERIFY_ORDER_TOOL',
    toolResult: orderLookup.result,
  });

  return {
    answer,
    orderLookup: orderLookup.lookup || null,
  };
}

async function applyBackendReturnAgentSlotPrompt(connection, {
  sessionId,
  currentMessage,
}) {
  const conversationText = buildReturnAgentCustomerText(sessionId, currentMessage);
  const currentText = cleanText(currentMessage);
  const hasIssueReason = hasReturnAgentIssueReason(conversationText);
  const hasGeneralIssue = hasReturnAgentGeneralIssueIntent(conversationText);

  if (!hasGeneralIssue) return null;

  const product = await findReturnAgentConversationProduct(connection, sessionId, currentMessage);

  if (hasIssueReason && !product?.PRODUCT_NAME) {
    return {
      answer: 'Which product is defective? Please include the product name and what is happening, for example: Ironkinetic Grip Tape keeps unravelling.',
      reason: 'missing_product',
    };
  }

  if (hasIssueReason && product?.PRODUCT_NAME && !hasReturnAgentSpecificIssueDetail(conversationText)) {
    return {
      answer: `What is happening with ${product.PRODUCT_NAME}? For example, is it unravelling, damaged, not working, or a packaging issue?`,
      reason: 'missing_issue_detail',
    };
  }

  if (!hasIssueReason && /\b(problem|issue|return)\b/i.test(currentText)) {
    return {
      answer: 'What is the reason for the return? You can choose: defective, box broken, arrived too late, or no longer needed.',
      reason: 'missing_reason',
    };
  }

  return null;
}

async function applyBackendReturnAgentTroubleshooting(connection, {
  sessionId,
  currentMessage,
}) {
  if (!isReturnAgentTroubleshootingTurn(sessionId, currentMessage)) return null;
  if (hasReturnAgentTroubleshootingAlreadyShown(sessionId)) return null;

  const product = await findReturnAgentConversationProduct(connection, sessionId, currentMessage);
  if (!product?.PRODUCT_NAME) return null;
  rememberReturnAgentFacts(sessionId, {
    productId: product.PRODUCT_ID,
    productName: product.PRODUCT_NAME,
  });

  const toolResult = await runReturnAgentTool(connection, 'TROUBLESHOOT_PRODUCT_TOOL', {
    P_PRODUCT_NAME: product.PRODUCT_NAME,
    P_ISSUE_TEXT: buildReturnAgentCustomerText(sessionId, currentMessage),
  });
  const guidance = cleanText(toolResult.result);
  if (!guidance) return null;
  const answer = await runReturnAgentResponseTeam(connection, {
    sessionId,
    currentMessage,
    toolName: 'TROUBLESHOOT_PRODUCT_TOOL',
    toolResult: guidance,
  });

  return {
    answer,
    productName: product.PRODUCT_NAME,
    productId: product.PRODUCT_ID || null,
    guidance,
  };
}

async function applyBackendReturnAgentAlternatives(connection, {
  sessionId,
  currentMessage,
}) {
  if (!isReturnAgentAlternativesTurn(sessionId, currentMessage)) return null;

  const product = await findReturnAgentConversationProduct(connection, sessionId, currentMessage);
  if (!product?.PRODUCT_ID || !product?.PRODUCT_NAME) return null;
  rememberReturnAgentFacts(sessionId, {
    productId: product.PRODUCT_ID,
    productName: product.PRODUCT_NAME,
  });

  const toolResult = await runReturnAgentTool(connection, 'GET_RECOMMENDATIONS_TOOL', {
    P_PRODUCT_ID: product.PRODUCT_ID,
  });
  const recommendations = cleanText(toolResult.result);
  if (!recommendations) return null;
  const recommendationItems = parseRecommendationItems(recommendations);
  rememberReturnAgentFacts(sessionId, {
    recommendations: JSON.stringify(recommendationItems),
  });
  const answer = await runReturnAgentResponseTeam(connection, {
    sessionId,
    currentMessage,
    toolName: 'GET_RECOMMENDATIONS_TOOL',
    toolResult: recommendations,
  });

  return {
    answer,
    productName: product.PRODUCT_NAME,
    productId: product.PRODUCT_ID,
    recommendations,
  };
}

async function runReturnAgentTool(connection, toolName, input) {
  const result = await connection.execute(`
    SELECT DBMS_CLOUD_AI_AGENT.RUN_TOOL(
             tool_name => :toolName,
             input     => :input
           ) AS response
    FROM dual
  `, {
    toolName,
    input: JSON.stringify(input || {}),
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchInfo: { RESPONSE: { type: oracledb.STRING } },
  });

  const response = cleanText(await readLobValue(result.rows?.[0]?.RESPONSE));
  const payload = parseJsonText(response);
  const resultValue = payload && Object.prototype.hasOwnProperty.call(payload, 'result')
    ? payload.result
    : response;

  return {
    raw: response,
    status: cleanText(payload?.status || 'success'),
    result: typeof resultValue === 'string'
      ? cleanText(resultValue)
      : JSON.stringify(resultValue || {}),
  };
}

async function runReturnAgentResponseTeam(connection, {
  sessionId,
  currentMessage,
  toolName = '',
  toolResult = '',
}) {
  const oracleConversationId = await getReturnAgentOracleConversationId(connection, sessionId);
  const conversationText = buildReturnAgentConversationContext(sessionId, currentMessage).slice(0, 3500);
  const prompt = [
    'Return one concise PeakGear customer-service response.',
    'Use only the provided conversation and tool context.',
    'Ask at most one next question.',
    'Never invent order, inventory, product, or policy facts.',
    'If verified facts include an order and product, do not ask for the order number again.',
    'If VERIFY_ORDER_TOOL found an order, acknowledge the product once and ask for the next missing issue or return detail.',
    'If GET_RECOMMENDATIONS_TOOL returns products, list the returned products and ask which one the customer prefers.',
    `Conversation context: ${conversationText || cleanText(currentMessage)}`,
    toolName ? `Tool used: ${toolName}` : '',
    toolResult ? `Tool result:\n${cleanText(toolResult).slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n\n');

  const result = await connection.execute(`
    SELECT DBMS_CLOUD_AI_AGENT.RUN_TEAM(
             team_name   => :teamName,
             user_prompt => :message,
             params      => JSON_OBJECT('conversation_id' VALUE :conversationId RETURNING CLOB)
           ) AS response
    FROM dual
  `, {
    teamName: WEBSHOP_RETURN_AGENT_TEAM_NAME,
    message: prompt,
    conversationId: oracleConversationId,
  }, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
    fetchInfo: { RESPONSE: { type: oracledb.STRING } },
  });

  return cleanText(await readLobValue(result.rows?.[0]?.RESPONSE));
}

async function applyValidatedReturnAgentStatusProposal(connection, {
  sessionId,
  teamName,
  currentMessage,
}) {
  const teamExecution = await fetchLatestReturnAgentTeamExecution(connection, sessionId, teamName);
  const proposal = await fetchReturnAgentStatusProposal(connection, teamExecution?.TEAM_EXEC_ID);

  if (!proposal || !messageAuthorizesReturnAgentProposal(currentMessage, proposal)) {
    return null;
  }

  const request = await updateCustomerOrderStatusFromProposal(connection, proposal);
  if (!request) return null;

  return {
    ...request,
    conversationId: sessionId,
    teamExecId: teamExecution?.TEAM_EXEC_ID || null,
  };
}

async function fetchReturnAgentRequest(connection, sessionId, orderNumber) {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
  if (!normalizedOrderNumber) return null;

  try {
    const result = await connection.execute(`
      SELECT order_number,
             status,
             product_name,
             updated_at
      FROM customer_order_status
      WHERE order_number = :orderNumber
        AND updated_at IS NOT NULL
      FETCH FIRST 1 ROW ONLY
    `, {
      orderNumber: normalizedOrderNumber,
    }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const row = result.rows?.[0];
    if (!row) return null;
    return {
      requestId: null,
      conversationId: sessionId,
      orderNumber: row.ORDER_NUMBER,
      status: row.STATUS,
      originalProduct: row.PRODUCT_NAME,
      replacementProduct: null,
      updatedAt: formatDbTimestamp(row.UPDATED_AT),
    };
  } catch {
    return null;
  }
}

async function tableExists(connection, tableName) {
  const result = await connection.execute(`
    SELECT COUNT(*) AS table_count
    FROM user_tables
    WHERE table_name = :tableName
  `, { tableName: cleanRuntimeName(tableName) });
  return Number(result.rows?.[0]?.TABLE_COUNT || 0) > 0;
}

async function clearReturnAgentDemoConversation() {
  return withLakehouseConnection(async (connection) => {
    const counts = {
      orderServiceEvents: 0,
      returnExchangeRequests: 0,
      customerOrderStatus: 0,
    };

    if (await tableExists(connection, 'ORDER_SERVICE_EVENTS')) {
      const result = await connection.execute(`
        DELETE FROM order_service_events
        WHERE demo_order_number = 7820
      `);
      counts.orderServiceEvents = Number(result.rowsAffected || 0);
    }

    if (await tableExists(connection, 'RETURN_EXCHANGE_REQUESTS')) {
      const result = await connection.execute(`
        DELETE FROM return_exchange_requests
        WHERE demo_order_number = 7820
      `);
      counts.returnExchangeRequests = Number(result.rowsAffected || 0);
    }

    if (await tableExists(connection, 'CUSTOMER_ORDER_STATUS')) {
      if (await tableExists(connection, 'CUSTOMER_ORDER_STATUS_SEED')) {
        await connection.execute('DELETE FROM customer_order_status');
        const result = await connection.execute(`
          INSERT INTO customer_order_status
          SELECT *
          FROM customer_order_status_seed
        `);
        counts.customerOrderStatus = Number(result.rowsAffected || 0);
      } else {
        const result = await connection.execute(`
          UPDATE customer_order_status
          SET status = 'delivered',
              updated_at = NULL
        `);
        counts.customerOrderStatus = Number(result.rowsAffected || 0);
      }
    }

    await connection.commit();
    returnAgentConversations.clear();
    returnAgentSessionFacts.clear();
    returnAgentOracleConversations.clear();

    return {
      cleared: true,
      demoOrderNumber: 7820,
      counts,
      runtime: 'select_ai_agent',
      source: 'adb',
    };
  });
}

async function runWebshopReturnAgent({ sessionId, message, teamName }) {
  const trimmedMessage = cleanText(message);
  if (!trimmedMessage) {
    const err = new Error('Ask PeakGear needs a returns or exchange request.');
    err.statusCode = 400;
    throw err;
  }

  if (trimmedMessage.length > 2000) {
    const err = new Error('Ask PeakGear messages are limited to 2,000 characters.');
    err.statusCode = 400;
    throw err;
  }

  const requestedTeam = cleanRuntimeName(teamName || WEBSHOP_RETURN_AGENT_TEAM_NAME);
  if (requestedTeam !== WEBSHOP_RETURN_AGENT_TEAM_NAME) {
    const err = new Error('Unsupported Ask PeakGear agent team.');
    err.statusCode = 400;
    throw err;
  }

  const resolvedSessionId = cleanText(sessionId) || crypto.randomUUID();

  return withLakehouseConnection(async (connection) => {
    rememberReturnAgentTurn(resolvedSessionId, 'user', trimmedMessage);

    const resolution = await applyBackendReturnAgentResolution(connection, {
      sessionId: resolvedSessionId,
      currentMessage: trimmedMessage,
    });
    const orderLookup = resolution ? null : await lookupReturnAgentOrderContext(connection, {
      sessionId: resolvedSessionId,
      currentMessage: trimmedMessage,
    });
    const exchangeSelection = resolution ? null : await applyBackendReturnAgentExchangeSelection(connection, {
      sessionId: resolvedSessionId,
      currentMessage: trimmedMessage,
    });
    const alternatives = (resolution || exchangeSelection) ? null : await applyBackendReturnAgentAlternatives(connection, {
      sessionId: resolvedSessionId,
      currentMessage: trimmedMessage,
    });
    const troubleshooting = (resolution || exchangeSelection || alternatives) ? null : await applyBackendReturnAgentTroubleshooting(connection, {
      sessionId: resolvedSessionId,
      currentMessage: trimmedMessage,
    });
    const orderLookupResult = (resolution || exchangeSelection || alternatives || troubleshooting || !orderLookup)
      ? null
      : await buildReturnAgentOrderLookupResult(connection, {
        sessionId: resolvedSessionId,
        currentMessage: trimmedMessage,
        orderLookup,
      });

    const toolBackedResult = resolution || exchangeSelection || alternatives || troubleshooting || orderLookupResult;
    const responseForClient = toolBackedResult?.answer || await runReturnAgentResponseTeam(connection, {
      sessionId: resolvedSessionId,
      currentMessage: trimmedMessage,
    });

    rememberReturnAgentTurn(resolvedSessionId, 'assistant', responseForClient);
    const trace = await fetchReturnAgentTrace(connection, resolvedSessionId);
    const statusUpdate = resolution || exchangeSelection;
    const request = statusUpdate ? {
      requestId: statusUpdate.requestId || null,
      conversationId: resolvedSessionId,
      orderNumber: statusUpdate.orderNumber,
      status: statusUpdate.status,
      originalProduct: statusUpdate.originalProduct,
      replacementProduct: statusUpdate.replacementProduct || null,
      updatedAt: statusUpdate.updatedAt || null,
    } : null;

    return {
      answer: responseForClient,
      profile: WEBSHOP_RETURN_AGENT_PROFILE_NAME,
      teamName: requestedTeam,
      runtime: 'select_ai_agent',
      source: 'adb',
      mode: 'returns',
      toolName: troubleshooting ? 'TROUBLESHOOT_PRODUCT_TOOL' : alternatives ? 'GET_RECOMMENDATIONS_TOOL' : (resolution || exchangeSelection) ? 'PROPOSE_ORDER_STATUS_TOOL' : orderLookupResult ? 'VERIFY_ORDER_TOOL' : null,
      trace,
      request,
    };
  });
}

async function collectImages(root = IMAGE_ROOT) {
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp']);
  const files = [];

  async function walk(current) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(next);
      } else if (entry.isFile() && allowed.has(path.extname(entry.name).toLowerCase())) {
        files.push(next);
      }
    }
  }

  try {
    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) return [];
    await walk(root);
  } catch {
    return [];
  }

  return files.sort();
}

function relativeImageName(filePath) {
  return path.relative(IMAGE_ROOT, filePath).split(path.sep).join('/');
}

function safeImagePath(relativeName) {
  const decoded = decodeURIComponent(relativeName || '');
  const resolved = path.resolve(IMAGE_ROOT, decoded);
  if (!resolved.startsWith(`${IMAGE_ROOT}${path.sep}`) && resolved !== IMAGE_ROOT) {
    return null;
  }
  return resolved;
}

function uploadSingleImage(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      ok: false,
      error: err.message || 'Image upload failed',
    });
  });
}

function sanitizeObjectSegment(value, fallback = 'upload') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

function encodeObjectName(objectName) {
  return objectName.split('/').map(encodeURIComponent).join('/');
}

function parseObjectStoragePar(parUrl) {
  if (!parUrl) {
    throw Object.assign(new Error('WEBSHOP_UPLOAD_PAR_URL is not configured.'), { statusCode: 503 });
  }

  const url = new URL(parUrl);
  const match = url.pathname.match(/\/n\/([^/]+)\/b\/([^/]+)\/o(?:\/|$)/);
  if (!match) {
    throw Object.assign(new Error('WEBSHOP_UPLOAD_PAR_URL must point to an Object Storage /o/ prefix PAR.'), { statusCode: 500 });
  }

  return {
    url,
    namespace: decodeURIComponent(match[1]),
    bucket: decodeURIComponent(match[2]),
  };
}

function buildUploadObject(file) {
  const extension = file.mimetype === 'image/png' ? '.png' : '.jpg';
  const today = new Date().toISOString().slice(0, 10);
  const baseName = sanitizeObjectSegment(file.originalname, 'shopper-image');
  const objectName = [
    UPLOAD_OBJECT_PREFIX || 'webshop-uploads',
    today,
    `${crypto.randomUUID()}-${baseName}${extension}`,
  ].join('/');

  const { url, namespace, bucket } = parseObjectStoragePar(UPLOAD_PAR_URL);
  const targetUrl = new URL(url.toString());
  targetUrl.pathname = `${url.pathname.replace(/\/?$/, '/')}${encodeObjectName(objectName)}`;

  return {
    objectName,
    objectUri: `oci://${bucket}@${namespace}/${objectName}`,
    objectUrl: `${url.origin}/n/${encodeURIComponent(namespace)}/b/${encodeURIComponent(bucket)}/o/${encodeObjectName(objectName)}`,
    targetUrl,
  };
}

async function uploadImageToObjectStorage(file) {
  const object = buildUploadObject(file);
  const response = await fetch(object.targetUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.mimetype,
      'Content-Length': String(file.size),
    },
    body: file.buffer,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(
      new Error(`Object Storage upload failed (${response.status}): ${detail.slice(0, 500) || response.statusText}`),
      { statusCode: 502, object },
    );
  }

  return {
    objectName: object.objectName,
    objectUri: object.objectUri,
    objectUrl: object.objectUrl,
    etag: response.headers.get('etag') || null,
  };
}

async function embedWithPrivateAI(model, input, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (options.convertImages) {
    headers['x-convert-images'] = 'true';
  }

  const response = await fetch(`${PRIVATEAI_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Private AI embedding call failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const body = await response.json();
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Private AI embedding response did not include a vector.');
  }
  return vector;
}

async function ensureImageEmbeddingTable(connection) {
  const tableShape = await connection.execute(`
    SELECT pk.column_name AS primary_key_column
    FROM user_constraints c
    JOIN user_cons_columns pk
      ON pk.constraint_name = c.constraint_name
     AND pk.table_name = c.table_name
    WHERE c.table_name = 'WEBSHOP_PRODUCT_IMAGE_EMBEDDINGS'
      AND c.constraint_type = 'P'
    ORDER BY pk.position
  `);

  const primaryKeyColumns = tableShape.rows.map((row) => row.PRIMARY_KEY_COLUMN);
  const usesLegacyProductKey = primaryKeyColumns.length > 0
    && primaryKeyColumns.join(',') !== 'IMAGE_FILENAME';

  if (usesLegacyProductKey) {
    await connection.execute('DROP TABLE webshop_product_image_embeddings PURGE');
  }

  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE webshop_product_image_embeddings (
          image_filename   VARCHAR2(500) PRIMARY KEY,
          product_id       NUMBER REFERENCES products(product_id),
          image_label      VARCHAR2(300),
          mime_type        VARCHAR2(100),
          embedding_model  VARCHAR2(100) DEFAULT ''${IMAGE_MODEL_ID}'',
          embedding        VECTOR(512, FLOAT32),
          created_at       TIMESTAMP DEFAULT SYSTIMESTAMP
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
          RAISE;
        END IF;
    END;
  `);
}

async function ensureProductAttributesTable(connection) {
  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE webshop_product_attributes (
          product_id            NUMBER PRIMARY KEY REFERENCES products(product_id),
          color_family          VARCHAR2(40) DEFAULT ''unknown'' NOT NULL,
          product_type          VARCHAR2(80) NOT NULL,
          source_image_filename VARCHAR2(500),
          color_confidence      NUMBER(8,6),
          updated_at            TIMESTAMP DEFAULT SYSTIMESTAMP
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
          RAISE;
        END IF;
    END;
  `);

  await connection.execute(`
    DECLARE
      v_count NUMBER;
    BEGIN
      SELECT COUNT(*) INTO v_count
      FROM user_indexes
      WHERE index_name = 'IDX_WEB_ATTR_COLOR';

      IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_web_attr_color ON webshop_product_attributes(color_family)';
      END IF;

      SELECT COUNT(*) INTO v_count
      FROM user_indexes
      WHERE index_name = 'IDX_WEB_ATTR_TYPE';

      IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_web_attr_type ON webshop_product_attributes(product_type)';
      END IF;
    END;
  `);
}

async function ensureUploadTable(connection) {
  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE webshop_image_search_uploads (
          upload_id        VARCHAR2(36) PRIMARY KEY,
          object_name      VARCHAR2(700),
          object_uri       VARCHAR2(1000),
          object_url       VARCHAR2(2000),
          original_filename VARCHAR2(255),
          mime_type        VARCHAR2(100),
          file_size_bytes  NUMBER,
          embedding_model  VARCHAR2(100) DEFAULT ''${IMAGE_MODEL_ID}'',
          embedding        VECTOR(512, FLOAT32),
          top_product_id   NUMBER REFERENCES products(product_id),
          top_similarity   NUMBER(8,6),
          object_upload_status VARCHAR2(20) DEFAULT ''STORED'',
          object_upload_error  CLOB,
          match_summary    CLOB,
          uploaded_at      TIMESTAMP DEFAULT SYSTIMESTAMP
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
          RAISE;
        END IF;
    END;
  `);

  await connection.execute(`
    DECLARE
      v_count NUMBER;
    BEGIN
      SELECT COUNT(*) INTO v_count
      FROM user_tab_columns
      WHERE table_name = 'WEBSHOP_IMAGE_SEARCH_UPLOADS'
        AND column_name = 'OBJECT_UPLOAD_STATUS';

      IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE webshop_image_search_uploads ADD object_upload_status VARCHAR2(20) DEFAULT ''STORED''';
      END IF;

      SELECT COUNT(*) INTO v_count
      FROM user_tab_columns
      WHERE table_name = 'WEBSHOP_IMAGE_SEARCH_UPLOADS'
        AND column_name = 'OBJECT_UPLOAD_ERROR';

      IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE webshop_image_search_uploads ADD object_upload_error CLOB';
      END IF;

      BEGIN
        EXECUTE IMMEDIATE 'ALTER TABLE webshop_image_search_uploads MODIFY object_name NULL';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -1451 THEN
            RAISE;
          END IF;
      END;
    END;
  `);
}

async function ensureLakehouseUploadTable(connection) {
  await connection.execute(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE webshop_image_search_uploads (
          upload_id        VARCHAR2(36) PRIMARY KEY,
          object_name      VARCHAR2(700),
          object_uri       VARCHAR2(1000),
          object_url       VARCHAR2(2000),
          original_filename VARCHAR2(255),
          mime_type        VARCHAR2(100),
          file_size_bytes  NUMBER,
          embedding_model  VARCHAR2(100) DEFAULT ''${IMAGE_MODEL_ID}'',
          embedding        VECTOR(512, FLOAT32),
          top_product_id   NUMBER,
          top_similarity   NUMBER(8,6),
          object_upload_status VARCHAR2(20) DEFAULT ''STORED'',
          object_upload_error  CLOB,
          match_summary    CLOB,
          uploaded_at      TIMESTAMP DEFAULT SYSTIMESTAMP
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
          RAISE;
        END IF;
    END;
  `);

  await connection.execute(`
    DECLARE
      v_count NUMBER;
    BEGIN
      SELECT COUNT(*) INTO v_count
      FROM user_tab_columns
      WHERE table_name = 'WEBSHOP_IMAGE_SEARCH_UPLOADS'
        AND column_name = 'OBJECT_UPLOAD_STATUS';

      IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE webshop_image_search_uploads ADD object_upload_status VARCHAR2(20) DEFAULT ''STORED''';
      END IF;

      SELECT COUNT(*) INTO v_count
      FROM user_tab_columns
      WHERE table_name = 'WEBSHOP_IMAGE_SEARCH_UPLOADS'
        AND column_name = 'OBJECT_UPLOAD_ERROR';

      IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE webshop_image_search_uploads ADD object_upload_error CLOB';
      END IF;

      BEGIN
        EXECUTE IMMEDIATE 'ALTER TABLE webshop_image_search_uploads MODIFY object_name NULL';
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE != -1451 THEN
            RAISE;
          END IF;
      END;
    END;
  `);
}

async function imageIndexCount(connection) {
  const result = await connection.execute(`
    SELECT COUNT(*) AS cnt
    FROM user_tables
    WHERE table_name = 'WEBSHOP_PRODUCT_IMAGE_EMBEDDINGS'
  `);

  if (!result.rows[0]?.CNT) return 0;

  const countResult = await connection.execute(`
    SELECT COUNT(*) AS cnt
    FROM webshop_product_image_embeddings
  `);
  return Number(countResult.rows[0]?.CNT || 0);
}

async function uploadCount(connection) {
  const result = await connection.execute(`
    SELECT COUNT(*) AS cnt
    FROM user_tables
    WHERE table_name = 'WEBSHOP_IMAGE_SEARCH_UPLOADS'
  `);

  if (!result.rows[0]?.CNT) return 0;

  const countResult = await connection.execute(`
    SELECT COUNT(*) AS cnt
    FROM webshop_image_search_uploads
  `);
  return Number(countResult.rows[0]?.CNT || 0);
}

async function productAttributeSummary(connection) {
  await ensureProductAttributesTable(connection);
  const result = await connection.execute(`
    SELECT (SELECT COUNT(*) FROM products WHERE is_active = 1) AS product_count,
           (SELECT COUNT(*) FROM webshop_product_attributes) AS attribute_count,
           (SELECT COUNT(*)
            FROM webshop_product_attributes
            WHERE color_family <> 'unknown') AS color_count
    FROM dual
  `);

  const row = result.rows[0] || {};
  return {
    productCount: Number(row.PRODUCT_COUNT || 0),
    attributeCount: Number(row.ATTRIBUTE_COUNT || 0),
    colorCount: Number(row.COLOR_COUNT || 0),
  };
}

async function refreshProductAttributes(connection, { force = false } = {}) {
  await ensureProductAttributesTable(connection);
  const summary = await productAttributeSummary(connection);

  if (!force && summary.productCount > 0
      && summary.attributeCount >= summary.productCount
      && summary.colorCount >= summary.productCount) {
    return { ...summary, refreshed: false };
  }

  const colorBinds = {};
  const colorSelects = [];
  for (let index = 0; index < COLOR_FAMILIES.length; index += 1) {
    const color = COLOR_FAMILIES[index];
    const bindName = `colorVector${index}`;
    const colorVector = await embedWithPrivateAI(
      TEXT_IMAGE_MODEL_ID,
      `a ${color} t-shirt, ${color} shirt fabric, product color is ${color}`,
    );
    colorBinds[bindName] = JSON.stringify(colorVector);
    colorSelects.push(`SELECT '${color}' AS color_family, TO_VECTOR(:${bindName}) AS color_embedding FROM dual`);
  }

  const productTypeSql = productTypeCaseSql('p');
  const mergeSql = `
    MERGE INTO webshop_product_attributes a
    USING (
      WITH color_vectors AS (
        ${colorSelects.join('\n        UNION ALL\n        ')}
      ),
      ranked_colors AS (
        SELECT w.product_id,
               w.image_filename,
               cv.color_family,
               ROUND(1 - VECTOR_DISTANCE(w.embedding, cv.color_embedding, COSINE), 4) AS color_confidence,
               ROW_NUMBER() OVER (
                 PARTITION BY w.product_id
                 ORDER BY CASE
                            WHEN UPPER(w.image_filename) LIKE '%' || UPPER(p.sku) || '%' THEN 0
                            ELSE 1
                          END,
                          VECTOR_DISTANCE(w.embedding, cv.color_embedding, COSINE)
               ) AS rn
        FROM webshop_product_image_embeddings w
        JOIN products p ON p.product_id = w.product_id
        CROSS JOIN color_vectors cv
      ),
      best_colors AS (
        SELECT product_id, image_filename, color_family, color_confidence
        FROM ranked_colors
        WHERE rn = 1
      )
      SELECT p.product_id,
             NVL(bc.color_family, 'unknown') AS color_family,
             ${productTypeSql} AS product_type,
             bc.image_filename AS source_image_filename,
             bc.color_confidence AS color_confidence
      FROM products p
      LEFT JOIN best_colors bc ON bc.product_id = p.product_id
      WHERE p.is_active = 1
    ) src
    ON (a.product_id = src.product_id)
    WHEN MATCHED THEN
      UPDATE SET a.color_family = src.color_family,
                 a.product_type = src.product_type,
                 a.source_image_filename = src.source_image_filename,
                 a.color_confidence = src.color_confidence,
                 a.updated_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN
      INSERT (product_id, color_family, product_type, source_image_filename, color_confidence, updated_at)
      VALUES (src.product_id, src.color_family, src.product_type, src.source_image_filename, src.color_confidence, SYSTIMESTAMP)
  `;

  const result = await connection.execute(mergeSql, colorBinds);
  await connection.commit();
  const nextSummary = await productAttributeSummary(connection);
  return {
    ...nextSummary,
    refreshed: true,
    rowsAffected: result.rowsAffected || 0,
  };
}

async function safeRefreshProductAttributes(connection, options = {}) {
  try {
    return await refreshProductAttributes(connection, options);
  } catch (err) {
    console.warn('Webshop product attribute refresh skipped:', err.message);
    return { refreshed: false, error: err.message };
  }
}

async function fetchCatalogProducts(connection) {
  const result = await connection.execute(`
    SELECT p.product_id,
           p.sku,
           p.product_name,
           p.category,
           p.subcategory,
           p.tags,
           p.unit_price,
           b.brand_name
    FROM products p
    JOIN brands b ON p.brand_id = b.brand_id
    WHERE p.is_active = 1
    ORDER BY p.product_id
  `);
  return result.rows;
}

function assignImagesToProducts(products, imageFiles) {
  if (!products.length) return [];

  const productBySku = new Map(products.map((product) => [String(product.SKU || '').toUpperCase(), product]));
  const productTokens = products.map((product) => ({
    product,
    tokens: expandedProductTokens(product),
  }));

  const descriptors = imageFiles.map((filePath) => ({
    filePath,
    relativeName: relativeImageName(filePath),
    descriptor: imageDescriptor(filePath),
    sku: imageSku(filePath),
  }));
  const usedImages = new Set();
  const assignments = [];

  function bestProductForImage(image, fallbackIndex = 0) {
    const skuProduct = image.sku ? productBySku.get(image.sku) : null;
    if (skuProduct) return skuProduct;

    let best = null;
    for (const candidate of productTokens) {
      const score = scoreImageForProduct(candidate.tokens, image.descriptor);
      if (!best || score > best.score) {
        best = { product: candidate.product, score };
      }
    }

    if (!best || best.score <= 0) {
      return products[fallbackIndex % products.length];
    }
    return best.product;
  }

  function bestImageForProduct(product, fallbackIndex = 0) {
    const tokens = expandedProductTokens(product);
    const productSku = String(product.SKU || '').toUpperCase();
    const skuImage = descriptors.find((image) => image.sku === productSku && !usedImages.has(image.relativeName));
    if (skuImage) return skuImage;

    let best = null;

    for (const image of descriptors) {
      if (usedImages.has(image.relativeName)) continue;
      const score = scoreImageForProduct(tokens, image.descriptor);
      if (!best || score > best.score) {
        best = { image, score };
      }
    }

    if (!best || best.score <= 0) {
      const fallback = descriptors.find((image) => !usedImages.has(image.relativeName))
        || descriptors[fallbackIndex % descriptors.length];
      return fallback || null;
    }
    return best.image;
  }

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const image = bestImageForProduct(product, index);
    if (!image || usedImages.has(image.relativeName)) continue;
    usedImages.add(image.relativeName);
    assignments.push({ product, image });
  }

  descriptors.forEach((image, index) => {
    if (usedImages.has(image.relativeName)) return;
    usedImages.add(image.relativeName);
    assignments.push({ product: bestProductForImage(image, index), image });
  });

  return assignments;
}

async function clearImageIndex(connection) {
  await ensureImageEmbeddingTable(connection);
  await connection.execute('DELETE FROM webshop_product_image_embeddings');
}

async function buildImageIndex({ rebuild = false } = {}) {
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    let connection;
    try {
      connection = await db.getConnection();
      await ensureImageEmbeddingTable(connection);

      if (rebuild) {
        await clearImageIndex(connection);
      }

      const imageFiles = await collectImages();
      if (!imageFiles.length) {
        throw new Error(`No product images found under ${IMAGE_ROOT}`);
      }

      const targetImages = imageFiles.slice(0, IMAGE_INDEX_LIMIT);
      const existing = await imageIndexCount(connection);
      if (existing >= targetImages.length) {
        const attributes = await safeRefreshProductAttributes(connection, { force: rebuild });
        return {
          indexed: existing,
          inserted: 0,
          skipped: existing,
          imageFiles: imageFiles.length,
          imageRoot: IMAGE_ROOT,
          attributes,
        };
      }

      const products = await fetchCatalogProducts(connection);
      const assignments = assignImagesToProducts(products, targetImages);
      let inserted = 0;
      let skipped = 0;

      for (const { product, image } of assignments) {
        const exists = await connection.execute(`
          SELECT COUNT(*) AS cnt
          FROM webshop_product_image_embeddings
          WHERE image_filename = :imageFilename
        `, { imageFilename: image.relativeName });
        if (Number(exists.rows[0]?.CNT || 0) > 0) {
          skipped += 1;
          continue;
        }

        const imageBuffer = await fsp.readFile(image.filePath);
        const vector = await embedWithPrivateAI(IMAGE_MODEL_ID, imageBuffer.toString('base64'), { convertImages: true });
        const mimeType = path.extname(image.filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

        await connection.execute(`
          INSERT INTO webshop_product_image_embeddings (
            product_id,
            image_filename,
            image_label,
            mime_type,
            embedding_model,
            embedding
          ) VALUES (
            :productId,
            :imageFilename,
            :imageLabel,
            :mimeType,
            :embeddingModel,
            TO_VECTOR(:embeddingJson)
          )
        `, {
          productId: product.PRODUCT_ID,
          imageFilename: image.relativeName,
          imageLabel: image.descriptor,
          mimeType,
          embeddingModel: IMAGE_MODEL_ID,
          embeddingJson: JSON.stringify(vector),
        });
        inserted += 1;
      }

      await connection.commit();
      const attributes = await safeRefreshProductAttributes(connection, { force: true });
      const indexed = await imageIndexCount(connection);
      return { indexed, inserted, skipped, imageFiles: imageFiles.length, imageRoot: IMAGE_ROOT, attributes };
    } finally {
      if (connection) {
        try { await connection.close(); } catch { /* ignore */ }
      }
      indexPromise = null;
    }
  })();

  return indexPromise;
}

function rowNumber(row, key) {
  const value = row?.[key];
  return value == null ? null : Number(value);
}

function normalizeProduct(row) {
  const description = row.DESCRIPTION
    || `${row.BRAND_NAME || 'PeakGear'} ${row.PRODUCT_NAME || 'product'} is a curated ${String(row.CATEGORY || 'sporting goods').toLowerCase()} item with inventory, demand, and image-search context from the AI Lakehouse.`;

  return {
    productId: row.PRODUCT_ID,
    sku: row.SKU,
    productName: row.PRODUCT_NAME,
    description,
    category: row.CATEGORY,
    subcategory: row.SUBCATEGORY,
    colorFamily: row.COLOR_FAMILY || 'unknown',
    productType: row.PRODUCT_TYPE || null,
    colorConfidence: rowNumber(row, 'COLOR_CONFIDENCE'),
    unitPrice: row.UNIT_PRICE,
    brandName: row.BRAND_NAME,
    totalInventory: rowNumber(row, 'TOTAL_INVENTORY') || 0,
    imageUrl: row.IMAGE_FILENAME ? `/api/webshop/images/${encodeURIComponent(row.IMAGE_FILENAME)}` : null,
    imageFilename: row.IMAGE_FILENAME,
  };
}

async function searchTextProducts(connection, query, topK) {
  const vector = await embedWithPrivateAI(TEXT_CATALOG_MODEL_ID, query);
  const result = await connection.execute(`
    WITH image_choice AS (
      SELECT w.product_id,
             w.image_filename,
             ROW_NUMBER() OVER (
               PARTITION BY w.product_id
               ORDER BY CASE
                          WHEN UPPER(w.image_filename) LIKE '%' || UPPER(p.sku) || '%' THEN 0
                          ELSE 1
                        END,
                        w.image_filename
             ) AS rn
      FROM webshop_product_image_embeddings w
      JOIN products p ON p.product_id = w.product_id
    )
    SELECT p.product_id,
           p.sku,
           p.product_name,
           p.description,
           p.category,
           p.subcategory,
           a.color_family,
           a.product_type,
           a.color_confidence,
           p.unit_price,
           b.brand_name,
           w.image_filename,
           (SELECT SUM(i.quantity_on_hand) FROM inventory i WHERE i.product_id = p.product_id) AS total_inventory,
           ROUND(1 - VECTOR_DISTANCE(pe.embedding, TO_VECTOR(:queryVector), COSINE), 4) AS text_similarity
    FROM product_embeddings pe
    JOIN products p ON pe.product_id = p.product_id
    JOIN brands b ON p.brand_id = b.brand_id
    LEFT JOIN image_choice w ON w.product_id = p.product_id AND w.rn = 1
    LEFT JOIN webshop_product_attributes a ON a.product_id = p.product_id
    WHERE p.is_active = 1
    ORDER BY VECTOR_DISTANCE(pe.embedding, TO_VECTOR(:queryVector2), COSINE)
    FETCH APPROXIMATE FIRST :topK ROWS ONLY
  `, {
    queryVector: JSON.stringify(vector),
    queryVector2: JSON.stringify(vector),
    topK,
  });

  return result.rows.map((row) => ({
    ...normalizeProduct(row),
    textSimilarity: rowNumber(row, 'TEXT_SIMILARITY'),
  }));
}

async function searchImageProducts(connection, query, topK) {
  const vector = await embedWithPrivateAI(TEXT_IMAGE_MODEL_ID, query);
  const result = await connection.execute(`
    WITH ranked_images AS (
      SELECT p.product_id,
             p.sku,
             p.product_name,
             p.description,
             p.category,
             p.subcategory,
             a.color_family,
             a.product_type,
             a.color_confidence,
             p.unit_price,
             b.brand_name,
             w.image_filename,
             VECTOR_DISTANCE(w.embedding, TO_VECTOR(:queryVector), COSINE) AS image_distance,
             (SELECT SUM(i.quantity_on_hand) FROM inventory i WHERE i.product_id = p.product_id) AS total_inventory,
             ROW_NUMBER() OVER (
               PARTITION BY p.product_id
               ORDER BY VECTOR_DISTANCE(w.embedding, TO_VECTOR(:queryVector2), COSINE)
             ) AS rn
      FROM webshop_product_image_embeddings w
      JOIN products p ON w.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      LEFT JOIN webshop_product_attributes a ON a.product_id = p.product_id
      WHERE p.is_active = 1
    )
    SELECT product_id,
           sku,
           product_name,
           description,
           category,
           subcategory,
           color_family,
           product_type,
           color_confidence,
           unit_price,
           brand_name,
           image_filename,
           total_inventory,
           ROUND(1 - image_distance, 4) AS image_similarity
    FROM ranked_images
    WHERE rn = 1
    ORDER BY image_distance
    FETCH APPROXIMATE FIRST :topK ROWS ONLY
  `, {
    queryVector: JSON.stringify(vector),
    queryVector2: JSON.stringify(vector),
    topK,
  });

  return result.rows.map((row) => ({
    ...normalizeProduct(row),
    imageSimilarity: rowNumber(row, 'IMAGE_SIMILARITY'),
  }));
}

async function searchProductsByImageVector(connection, vector, topK) {
  const result = await connection.execute(`
    WITH ranked_images AS (
      SELECT p.product_id,
             p.sku,
             p.product_name,
             p.description,
             p.category,
             p.subcategory,
             a.color_family,
             a.product_type,
             a.color_confidence,
             p.unit_price,
             b.brand_name,
             w.image_filename,
             VECTOR_DISTANCE(w.embedding, TO_VECTOR(:queryVector), COSINE) AS image_distance,
             (SELECT SUM(i.quantity_on_hand) FROM inventory i WHERE i.product_id = p.product_id) AS total_inventory,
             ROW_NUMBER() OVER (
               PARTITION BY p.product_id
               ORDER BY VECTOR_DISTANCE(w.embedding, TO_VECTOR(:queryVector2), COSINE)
             ) AS rn
      FROM webshop_product_image_embeddings w
      JOIN products p ON w.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      LEFT JOIN webshop_product_attributes a ON a.product_id = p.product_id
      WHERE p.is_active = 1
    )
    SELECT product_id,
           sku,
           product_name,
           description,
           category,
           subcategory,
           color_family,
           product_type,
           color_confidence,
           unit_price,
           brand_name,
           image_filename,
           total_inventory,
           ROUND(1 - image_distance, 4) AS image_similarity
    FROM ranked_images
    WHERE rn = 1
    ORDER BY image_distance
    FETCH APPROXIMATE FIRST :topK ROWS ONLY
  `, {
    queryVector: JSON.stringify(vector),
    queryVector2: JSON.stringify(vector),
    topK,
  });

  return result.rows.map((row) => ({
    ...normalizeProduct(row),
    imageSimilarity: rowNumber(row, 'IMAGE_SIMILARITY'),
    matchSources: ['visual'],
    score: rowNumber(row, 'IMAGE_SIMILARITY'),
  }));
}

async function insertImageSearchUpload(connection, {
  uploadId,
  file,
  objectStorage,
  objectUploadStatus,
  objectUploadError,
  vector,
  results,
}) {
  const topResult = results[0] || null;
  await ensureUploadTable(connection);
  await connection.execute(`
    INSERT INTO webshop_image_search_uploads (
      upload_id,
      object_name,
      object_uri,
      object_url,
      original_filename,
      mime_type,
      file_size_bytes,
      embedding_model,
      embedding,
      top_product_id,
      top_similarity,
      object_upload_status,
      object_upload_error,
      match_summary
    ) VALUES (
      :uploadId,
      :objectName,
      :objectUri,
      :objectUrl,
      :originalFilename,
      :mimeType,
      :fileSizeBytes,
      :embeddingModel,
      TO_VECTOR(:embeddingJson),
      :topProductId,
      :topSimilarity,
      :objectUploadStatus,
      :objectUploadError,
      :matchSummary
    )
  `, {
    uploadId,
    objectName: objectStorage.objectName,
    objectUri: objectStorage.objectUri,
    objectUrl: objectStorage.objectUrl,
    originalFilename: file.originalname,
    mimeType: file.mimetype,
    fileSizeBytes: file.size,
    embeddingModel: IMAGE_MODEL_ID,
    embeddingJson: JSON.stringify(vector),
    topProductId: topResult?.productId || null,
    topSimilarity: topResult?.imageSimilarity || null,
    objectUploadStatus,
    objectUploadError,
    matchSummary: JSON.stringify(results.slice(0, 5).map((result) => ({
      productId: result.productId,
      sku: result.sku,
      productName: result.productName,
      similarity: result.imageSimilarity,
    }))),
  });
}

async function insertLakehouseImageSearchUpload({
  uploadId,
  file,
  objectStorage,
  objectUploadStatus,
  objectUploadError,
  vector,
  results,
}) {
  const config = getLakehouseConfig();
  if (!config) {
    return {
      available: false,
      inserted: false,
      reason: 'not_configured',
      tableName: `${LAKEHOUSE_SCHEMA_USERNAME}.WEBSHOP_IMAGE_SEARCH_UPLOADS`,
    };
  }

  if (!(await hasWalletDirectory(config.walletDir))) {
    return {
      available: false,
      inserted: false,
      reason: 'wallet_not_found',
      tableName: `${config.username}.WEBSHOP_IMAGE_SEARCH_UPLOADS`,
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

    await ensureLakehouseUploadTable(connection);
    const topResult = results[0] || null;
    await connection.execute(`
      MERGE INTO webshop_image_search_uploads target
      USING (
        SELECT :uploadId AS upload_id FROM dual
      ) source
      ON (target.upload_id = source.upload_id)
      WHEN NOT MATCHED THEN
        INSERT (
          upload_id,
          object_name,
          object_uri,
          object_url,
          original_filename,
          mime_type,
          file_size_bytes,
          embedding_model,
          embedding,
          top_product_id,
          top_similarity,
          object_upload_status,
          object_upload_error,
          match_summary
        ) VALUES (
          :uploadId,
          :objectName,
          :objectUri,
          :objectUrl,
          :originalFilename,
          :mimeType,
          :fileSizeBytes,
          :embeddingModel,
          TO_VECTOR(:embeddingJson),
          :topProductId,
          :topSimilarity,
          :objectUploadStatus,
          :objectUploadError,
          :matchSummary
        )
    `, {
      uploadId,
      objectName: objectStorage.objectName,
      objectUri: objectStorage.objectUri,
      objectUrl: objectStorage.objectUrl,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      embeddingModel: IMAGE_MODEL_ID,
      embeddingJson: JSON.stringify(vector),
      topProductId: topResult?.productId || null,
      topSimilarity: topResult?.imageSimilarity || null,
      objectUploadStatus,
      objectUploadError,
      matchSummary: JSON.stringify(results.slice(0, 5).map((result) => ({
        productId: result.productId,
        sku: result.sku,
        productName: result.productName,
        similarity: result.imageSimilarity,
      }))),
    });

    return {
      available: true,
      inserted: true,
      tableName: `${config.username}.WEBSHOP_IMAGE_SEARCH_UPLOADS`,
    };
  } catch (err) {
    return {
      available: true,
      inserted: false,
      tableName: `${config.username}.WEBSHOP_IMAGE_SEARCH_UPLOADS`,
      error: err.message,
      code: err.code,
    };
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
    if (wallet) {
      try { await wallet.cleanup(); } catch { /* ignore */ }
    }
  }
}

async function fetchDefaultProducts(connection, limit) {
  const result = await connection.execute(`
    WITH image_choice AS (
      SELECT w.product_id,
             w.image_filename,
             ROW_NUMBER() OVER (
               PARTITION BY w.product_id
               ORDER BY CASE
                          WHEN UPPER(w.image_filename) LIKE '%' || UPPER(p.sku) || '%' THEN 0
                          ELSE 1
                        END,
                        w.image_filename
             ) AS rn
      FROM webshop_product_image_embeddings w
      JOIN products p ON p.product_id = w.product_id
    )
    SELECT p.product_id,
           p.sku,
           p.product_name,
           p.description,
           p.category,
           p.subcategory,
           a.color_family,
           a.product_type,
           a.color_confidence,
           p.unit_price,
           b.brand_name,
           w.image_filename,
           (SELECT SUM(i.quantity_on_hand) FROM inventory i WHERE i.product_id = p.product_id) AS total_inventory
    FROM products p
    JOIN brands b ON p.brand_id = b.brand_id
    LEFT JOIN image_choice w ON w.product_id = p.product_id AND w.rn = 1
    LEFT JOIN webshop_product_attributes a ON a.product_id = p.product_id
    WHERE p.is_active = 1
    ORDER BY p.product_id
    FETCH FIRST :limit ROWS ONLY
  `, { limit });

  return result.rows.map((row) => ({
    ...normalizeProduct(row),
    matchSources: [],
    score: null,
  }));
}

function hybridScore(result, intent) {
  const textSimilarity = Number(result.textSimilarity || 0);
  const imageSimilarity = Number(result.imageSimilarity || 0);
  const baseScore = textSimilarity && imageSimilarity
    ? (textSimilarity * 0.62) + (imageSimilarity * 0.38)
    : Math.max(textSimilarity, imageSimilarity);

  return baseScore
    + colorScore(result, intent)
    + productTypeScore(result, intent);
}

function mergeResults(textResults, imageResults, limit, intent = {}) {
  const byProduct = new Map();

  function upsert(result, source) {
    const existing = byProduct.get(result.productId) || result;
    const next = { ...existing, ...result };
    if (result.textSimilarity != null) next.textSimilarity = result.textSimilarity;
    if (result.imageSimilarity != null) next.imageSimilarity = result.imageSimilarity;
    next.matchSources = new Set(existing.matchSources || []);
    next.matchSources.add(source);
    next.score = hybridScore(next, intent);
    byProduct.set(result.productId, next);
  }

  imageResults.forEach((result) => upsert(result, 'visual'));
  textResults.forEach((result) => upsert(result, 'catalog'));

  return [...byProduct.values()]
    .map((result) => ({
      ...result,
      matchSources: [...result.matchSources],
      score: Math.round((result.score || 0) * 10000) / 10000,
    }))
    .sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName))
    .slice(0, limit);
}

router.get('/status', async (_req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await ensureImageEmbeddingTable(connection);
    await ensureUploadTable(connection);
    await ensureProductAttributesTable(connection);
    const indexedImages = await imageIndexCount(connection);
    const uploadedImageSearches = await uploadCount(connection);
    const productAttributes = await productAttributeSummary(connection);
    const products = await fetchCatalogProducts(connection);
    const imageFiles = await collectImages();
    res.json({
      imageRoot: IMAGE_ROOT,
      imageRootAvailable: imageFiles.length > 0,
      imageFileCount: imageFiles.length,
      indexedImages,
      uploadedImageSearches,
      productAttributes,
      productCount: products.length,
      imageIndexLimit: IMAGE_INDEX_LIMIT,
      imageModel: IMAGE_MODEL_ID,
      imageTextModel: TEXT_IMAGE_MODEL_ID,
      catalogTextModel: TEXT_CATALOG_MODEL_ID,
      uploadParConfigured: Boolean(UPLOAD_PAR_URL),
      uploadObjectPrefix: UPLOAD_OBJECT_PREFIX || 'webshop-uploads',
      maxResults: MAX_LIMIT,
    });
  } catch (err) {
    console.error('Webshop status error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
});

router.get('/ask/agent/status', async (_req, res) => {
  try {
    const status = await getWebshopReturnAgentStatus();
    res.json(status);
  } catch (err) {
    console.error('Ask PeakGear agent status error:', err);
    res.status(500).json(unavailableReturnAgentStatus('status_failed', { error: err.message }));
  }
});

router.post('/ask/agent', async (req, res) => {
  try {
    const sessionId = cleanText(req.body?.sessionId) || crypto.randomUUID();
    const result = await runWebshopReturnAgent({
      sessionId,
      message: req.body?.message,
      teamName: req.body?.teamName,
    });

    res.json({
      sessionId,
      answer: cleanText(result.answer),
      profile: result.profile || WEBSHOP_RETURN_AGENT_PROFILE_NAME,
      teamName: result.teamName || WEBSHOP_RETURN_AGENT_TEAM_NAME,
      runtime: result.runtime || 'select_ai_agent',
      source: result.source || 'adb',
      mode: result.mode || 'returns',
      toolName: result.toolName || null,
      trace: result.trace || [],
      request: result.request || null,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Ask PeakGear agent chat error:', err);
    res.status(status).json({
      error: err.message,
      reason: err.reason || (status === 503 ? 'unavailable' : 'agent_chat_failed'),
      profileName: WEBSHOP_RETURN_AGENT_PROFILE_NAME,
      teamName: WEBSHOP_RETURN_AGENT_TEAM_NAME,
      runtime: 'select_ai_agent',
      source: 'adb',
    });
  }
});

router.delete('/ask/agent/conversations', async (_req, res) => {
  try {
    const result = await clearReturnAgentDemoConversation();
    res.json(result);
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Ask PeakGear agent conversation cleanup error:', err);
    res.status(status).json({
      error: err.message,
      reason: err.reason || (status === 503 ? 'unavailable' : 'cleanup_failed'),
      profileName: WEBSHOP_RETURN_AGENT_PROFILE_NAME,
      teamName: WEBSHOP_RETURN_AGENT_TEAM_NAME,
      runtime: 'select_ai_agent',
      source: 'adb',
    });
  }
});

router.post('/index', async (_req, res) => {
  try {
    const result = await buildImageIndex({ rebuild: true });
    res.json(result);
  } catch (err) {
    console.error('Webshop image index error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/image-search', uploadSingleImage, async (req, res) => {
  const file = req.file;
  const limit = clampLimit(req.body?.limit);

  if (!file) {
    return res.status(400).json({ error: 'Upload a JPG or PNG image using field name "file".' });
  }

  let connection;
  try {
    const index = await buildImageIndex();
    const vector = await embedWithPrivateAI(IMAGE_MODEL_ID, file.buffer.toString('base64'), { convertImages: true });

    connection = await db.getConnection();
    const results = await searchProductsByImageVector(connection, vector, limit);
    const uploadId = crypto.randomUUID();
    let objectStorage = null;
    let objectUploadStatus = 'STORED';
    let objectUploadError = null;

    try {
      objectStorage = await uploadImageToObjectStorage(file);
    } catch (uploadErr) {
      objectUploadStatus = UPLOAD_PAR_URL ? 'FAILED' : 'NOT_CONFIGURED';
      objectUploadError = uploadErr.message;
      objectStorage = uploadErr.object ? {
        objectName: uploadErr.object.objectName,
        objectUri: uploadErr.object.objectUri,
        objectUrl: uploadErr.object.objectUrl,
        etag: null,
      } : {
        objectName: null,
        objectUri: null,
        objectUrl: null,
        etag: null,
      };
    }

    await insertImageSearchUpload(connection, {
      uploadId,
      file,
      objectStorage,
      objectUploadStatus,
      objectUploadError,
      vector,
      results,
    });
    const lakehouse = await insertLakehouseImageSearchUpload({
      uploadId,
      file,
      objectStorage,
      objectUploadStatus,
      objectUploadError,
      vector,
      results,
    });

    res.json({
      ok: objectUploadStatus === 'STORED',
      mode: 'image',
      limit,
      upload: {
        uploadId,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        objectName: objectStorage.objectName,
        objectUri: objectStorage.objectUri,
        objectUrl: objectStorage.objectUrl,
        objectUploadStatus,
        objectUploadError,
        tableName: lakehouse.tableName || `${LAKEHOUSE_SCHEMA_USERNAME}.WEBSHOP_IMAGE_SEARCH_UPLOADS`,
        localTableName: 'WEBSHOP_IMAGE_SEARCH_UPLOADS',
      },
      lakehouse,
      warning: objectUploadStatus === 'STORED' ? null : objectUploadError,
      models: {
        image: IMAGE_MODEL_ID,
      },
      index,
      count: results.length,
      results,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Webshop image search error:', err);
    res.status(status).json({ error: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
});

router.post('/search', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  const limit = clampLimit(req.body?.limit);

  let connection;
  try {
    const index = await buildImageIndex();
    connection = await db.getConnection();

    if (!query) {
      const results = await fetchDefaultProducts(connection, limit);
      return res.json({
        query,
        limit,
        models: {
          image: IMAGE_MODEL_ID,
          imageText: TEXT_IMAGE_MODEL_ID,
          catalogText: TEXT_CATALOG_MODEL_ID,
        },
        index,
        count: results.length,
        results,
      });
    }

    const searchIntent = parseSearchIntent(query);
    const hasAttributeIntent = Boolean(searchIntent.colorFamily || searchIntent.productTypes.size);
    const searchLimit = hasAttributeIntent
      ? Math.min(Math.max(limit * 6, 60), 100)
      : Math.min(Math.max(limit * 2, limit), 30);
    const textResults = await searchTextProducts(connection, query, searchLimit);
    const imageResults = await searchImageProducts(connection, query, searchLimit);
    const results = mergeResults(textResults, imageResults, limit, searchIntent);

    res.json({
      query,
      limit,
      models: {
        image: IMAGE_MODEL_ID,
        imageText: TEXT_IMAGE_MODEL_ID,
        catalogText: TEXT_CATALOG_MODEL_ID,
      },
      index,
      searchIntent: {
        colorFamily: searchIntent.colorFamily,
        productTypes: [...searchIntent.productTypes],
      },
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('Webshop search error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
});

router.get('/images/*', (req, res) => {
  const imagePath = safeImagePath(req.params[0]);
  if (!imagePath || !fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }
  res.sendFile(imagePath);
});

module.exports = router;
module.exports.buildImageIndex = buildImageIndex;
module.exports.clampLimit = clampLimit;
module.exports.embedWithPrivateAI = embedWithPrivateAI;
module.exports.IMAGE_MODEL_ID = IMAGE_MODEL_ID;
module.exports.searchProductsByImageVector = searchProductsByImageVector;
module.exports.uploadSingleImage = uploadSingleImage;
