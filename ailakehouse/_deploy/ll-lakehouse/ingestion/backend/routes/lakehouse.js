/**
 * AI Data Lakehouse API
 *
 * Validates user-supplied Autonomous Database connection details and derives
 * the DB Actions URL from the service_name in the ADB connect descriptor.
 */
const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const AdmZip = require('adm-zip');
const { parse: parseCsv } = require('csv-parse');
const { oracledb } = require('../config/database');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

const WALLET_FIELDS = [
  { name: 'wallet', maxCount: 1 },
  { name: 'file', maxCount: 1 },
];

function quoteOracleIdentifier(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('"') || text.length > 128) {
    throw new Error(`Unsafe Oracle identifier: ${text || '<empty>'}`);
  }
  return `"${text}"`;
}

function normalizeWarehouseTableName(csvFile) {
  const stem = path.basename(String(csvFile || ''), path.extname(String(csvFile || '')));
  return stem.toUpperCase().replace(/[^A-Z0-9_$#]+/g, '_');
}

function normalizeWarehouseDataType(dataType) {
  const normalized = String(dataType || '').trim().toUpperCase();
  // The warehouse CSV exports are raw source snapshots. Keep scalar values as
  // text so SQLcl and node-oracledb load the same data without date/number
  // format drift; use CLOB for serialized payloads that can exceed 4000 bytes.
  if (['CLOB', 'JSON', 'VECTOR', 'SDO_GEOMETRY'].includes(normalized)) return 'CLOB';
  return 'VARCHAR2(4000)';
}

function parseCsvHeaderLine(line) {
  const headers = [];
  let current = '';
  let quoted = false;
  const source = String(line || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      headers.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  headers.push(current.trim());
  return headers.filter(Boolean);
}

function readCsvHeaderColumns(csvPath) {
  const firstLine = String(fsSync.readFileSync(csvPath, 'utf8')).split(/\r?\n/, 1)[0] || '';
  return parseCsvHeaderLine(firstLine).map((header) => ({
    name: normalizeWarehouseTableName(header),
    dataType: 'VARCHAR2(4000)',
  }));
}

function readWarehouseGoldDataInventory(goldDataDir, manifestPath) {
  const csvFiles = new Set(
    fsSync.existsSync(goldDataDir)
      ? fsSync.readdirSync(goldDataDir).filter((fileName) => fileName.toLowerCase().endsWith('.csv'))
      : []
  );

  if (!csvFiles.size) return { tables: [], staleTableNames: [] };

  if (fsSync.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8'));
      const manifestTables = Array.isArray(manifest?.tables) ? manifest.tables : [];
      const staleTableNames = manifestTables
        .filter((table) => table?.csv_file && !csvFiles.has(table.csv_file))
        .map((table) => String(table.table_name || normalizeWarehouseTableName(table.csv_file)).trim())
        .filter(Boolean);
      const tables = manifestTables
        .filter((table) => table?.csv_file && csvFiles.has(table.csv_file))
        .map((table) => ({
          tableName: String(table.table_name || normalizeWarehouseTableName(table.csv_file)).trim(),
          csvFile: table.csv_file,
          expectedRows: Number(table.row_count_exported || 0),
          columns: (Array.isArray(table.columns) ? table.columns : [])
            .map((column) => ({
              name: String(column.name || '').trim(),
              dataType: normalizeWarehouseDataType(column.data_type),
            }))
            .filter((column) => column.name),
        }))
        .filter((table) => table.tableName && table.columns.length);

      const manifestCsvFiles = new Set(tables.map((table) => table.csvFile));
      const extraTables = [...csvFiles]
        .filter((csvFile) => !manifestCsvFiles.has(csvFile))
        .map((csvFile) => ({
          tableName: normalizeWarehouseTableName(csvFile),
          csvFile,
          expectedRows: 1,
          columns: readCsvHeaderColumns(path.join(goldDataDir, csvFile)),
        }))
        .filter((table) => table.columns.length);

      if (tables.length || extraTables.length) {
        const activeTableNames = new Set([...tables, ...extraTables].map((table) => table.tableName));
        return {
          tables: [...tables, ...extraTables].sort((a, b) => a.csvFile.localeCompare(b.csvFile)),
          staleTableNames: [...new Set(staleTableNames)]
            .filter((tableName) => !activeTableNames.has(tableName))
            .sort(),
        };
      }
    } catch (err) {
      console.warn('Could not read gold-data export manifest; falling back to CSV filenames:', err.message);
    }
  }

  return {
    tables: [...csvFiles].sort().map((csvFile) => ({
      tableName: normalizeWarehouseTableName(csvFile),
      csvFile,
      expectedRows: 1,
      columns: readCsvHeaderColumns(path.join(goldDataDir, csvFile)),
    })).filter((table) => table.columns.length),
    staleTableNames: [],
  };
}

const ADMIN_USERNAME = 'ADMIN';
const LAKEHOUSE_SCHEMA_USERNAME = 'PG';
const LAKEHOUSE_USER_SCRIPT = path.resolve(__dirname, '../../db/data/create_user_pg.sql');
const LAKEHOUSE_BRONZE_SCHEMA_SCRIPT = path.resolve(__dirname, '../../db/schema/10_bronze_streaming_tables.sql');
const LAKEHOUSE_SILVER_SCHEMA_SCRIPT = path.resolve(__dirname, '../../db/schema/11_silver_tables.sql');
const LAKEHOUSE_GOLD_SCHEMA_SCRIPT = path.resolve(__dirname, '../../db/data/gold-schema.sql');
const LAKEHOUSE_APP_SCHEMA_SCRIPTS = [
  path.resolve(__dirname, '../../db/schema/01_tables.sql'),
  path.resolve(__dirname, '../../db/schema/02_json_collections.sql'),
  path.resolve(__dirname, '../../db/schema/03_graph.sql'),
  path.resolve(__dirname, '../../db/schema/04_vector.sql'),
  path.resolve(__dirname, '../../db/schema/05_spatial.sql'),
];
const LAKEHOUSE_APP_GOLD_DATA_SCRIPT = path.resolve(__dirname, '../../db/data/load_all_data.sql');
const LAKEHOUSE_RETURNS_GRAPH_SCHEMA_SCRIPT = path.resolve(__dirname, '../../db/schema/10_fraud_graph.sql');
const LAKEHOUSE_RETURNS_GRAPH_DATA_SCRIPT = path.resolve(__dirname, '../../db/data/load_fraud_graph.sql');
const LAKEHOUSE_FULFILLMENT_ZONES_SCRIPT = path.resolve(__dirname, '../../db/data/seed_fulfillment_zones.sql');
const LAKEHOUSE_WAREHOUSE_GOLD_DATA_DIR = path.resolve(__dirname, '../../gold-data');
const LAKEHOUSE_WAREHOUSE_GOLD_DATA_MANIFEST = path.resolve(LAKEHOUSE_WAREHOUSE_GOLD_DATA_DIR, '_export_manifest.json');
const LAKEHOUSE_WAREHOUSE_GOLD_DATA_INVENTORY = readWarehouseGoldDataInventory(
  LAKEHOUSE_WAREHOUSE_GOLD_DATA_DIR,
  LAKEHOUSE_WAREHOUSE_GOLD_DATA_MANIFEST
);
const LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLES = LAKEHOUSE_WAREHOUSE_GOLD_DATA_INVENTORY.tables;
const LAKEHOUSE_WAREHOUSE_STALE_GOLD_DATA_TABLE_NAMES = LAKEHOUSE_WAREHOUSE_GOLD_DATA_INVENTORY.staleTableNames;
const LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLE_NAMES = LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLES.map(({ tableName }) => tableName);
const LAKEHOUSE_APP_GOLD_DATA_TABLE_NAMES = [
  'BRANDS',
  'PRODUCTS',
  'FULFILLMENT_CENTERS',
  'CUSTOMERS',
  'ORDERS',
  'ORDER_ITEMS',
  'INVENTORY',
  'INFLUENCERS',
  'INFLUENCER_CONNECTIONS',
  'BRAND_INFLUENCER_LINKS',
  'SOCIAL_POSTS',
  'POST_PRODUCT_MENTIONS',
  'DEMAND_REGIONS',
  'DEMAND_FORECASTS',
  'SHIPMENTS',
  'APP_USERS',
  'APP_DATASET_STATE',
  'WEBSHOP_PRODUCT_ATTRIBUTES',
  'FULFILLMENT_ZONES',
  'RETURNS_ENTITIES',
  'RETURNS_RELATIONSHIPS',
  'RETURNS_CASES',
  'RETURNS_CASE_ENTITIES',
];
const LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES = [
  ...LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLE_NAMES,
  ...LAKEHOUSE_APP_GOLD_DATA_TABLE_NAMES,
];
const LAKEHOUSE_GOLD_DATA_EXPECTED_ROWS = new Map([
  ...LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLES.map(({ tableName, expectedRows }) => [
    tableName,
    Math.max(0, Number(expectedRows || 0)),
  ]),
  ...LAKEHOUSE_APP_GOLD_DATA_TABLE_NAMES.map((tableName) => [tableName, 1]),
]);
const LAKEHOUSE_APP_RESET_PROPERTY_GRAPHS = [
  'RETURNS_RELATIONSHIP_GRAPH',
  'RETURNS_NETWORK',
  'INFLUENCER_NETWORK',
];
const LAKEHOUSE_APP_RESET_VIEWS = [
  'PRODUCTS_INVENTORY_DV',
  'ORDERS_DV',
];
const LAKEHOUSE_APP_RESET_TABLES = [
  'RETURNS_CASE_ENTITIES',
  'RETURNS_RELATIONSHIPS',
  'RETURNS_CASES',
  'RETURNS_ENTITIES',
  'WEBSHOP_IMAGE_SEARCH_UPLOADS',
  'WEBSHOP_PRODUCT_IMAGE_EMBEDDINGS',
  'WEBSHOP_PRODUCT_ATTRIBUTES',
  'SEMANTIC_MATCHES',
  'SIGNAL_EMBEDDINGS',
  'PRODUCT_EMBEDDINGS',
  'PRODUCT_ATTRIBUTES',
  'BRAND_INFLUENCER_LINKS',
  'INFLUENCER_CONNECTIONS',
  'AGENT_ACTIONS',
  'SHIPMENTS',
  'ORDER_ITEMS',
  'ORDERS',
  'INVENTORY',
  'POST_PRODUCT_MENTIONS',
  'DEMAND_FORECASTS',
  'FULFILLMENT_ZONES',
  'DEMAND_REGIONS',
  'SOCIAL_POSTS',
  'EVENT_STREAM',
  'CUSTOMERS',
  'INFLUENCERS',
  'FULFILLMENT_CENTERS',
  'PRODUCTS',
  'BRANDS',
  'APP_USERS',
  'APP_DATASET_STATE',
];
const DEFAULT_AUTO_WALLET_DIR = '/wallet';
const AUTO_CONNECTION_ID = 'server-adb-wallet';
const DROP_USER_MAX_ATTEMPTS = 8;
const DROP_USER_RETRY_DELAY_MS = 1000;
const GOLD_DATA_CSV_LOAD_BATCH_SIZE = Number(process.env.ADB_GOLD_DATA_LOAD_BATCH_SIZE || 5000);
const SQL_LOCK_RETRY_ATTEMPTS = 5;
const PG_AI_REQUIRED_PACKAGES = ['DBMS_CLOUD', 'DBMS_CLOUD_AI'];
const PG_AI_OPTIONAL_PACKAGES = ['DBMS_CLOUD_AI_AGENT'];
const PG_AI_DEFAULT_PROFILE_NAME = 'PG_GENAI_PROFILE';
const PG_AI_DEFAULT_CREDENTIAL_NAME = 'PG_OCI_GENAI_CRED';
const PG_AI_DEFAULT_MODEL = 'cohere.command-a-03-2025';
const PG_AI_DEFAULT_EMBEDDING_MODEL = 'cohere.embed-v4.0';
let autoLakehousePromise = null;

function cleanText(value) {
  if (Array.isArray(value)) return cleanText(value[0]);
  return String(value || '').trim();
}

function createHttpError(status, message, details = undefined) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oracleErrorMatches(err, errorNum) {
  const normalizedCode = `ORA-${String(errorNum).padStart(5, '0')}`;
  return err?.errorNum === errorNum
    || err?.code === normalizedCode
    || String(err?.message || '').includes(normalizedCode);
}

function isTransientSqlLockError(err) {
  return oracleErrorMatches(err, 54) || oracleErrorMatches(err, 4022);
}

function extractSqlBlocks(scriptText) {
  const source = String(scriptText || '');
  const blockPattern = /```sql\s*([\s\S]*?)```/gi;
  const blocks = [];
  let match;

  while ((match = blockPattern.exec(source)) !== null) {
    if (match[1]?.trim()) blocks.push(match[1]);
  }

  const sqlText = blocks.length ? blocks.join('\n\n') : source;
  return sqlText.replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractCreateUserPassword(scriptText, username) {
  const escapedUsername = cleanText(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const passwordPattern = new RegExp(`CREATE\\s+USER\\s+"?${escapedUsername}"?\\s+IDENTIFIED\\s+BY\\s+"([^"]+)"`, 'i');
  const match = String(scriptText || '').match(passwordPattern);
  return match?.[1] || '';
}

function resolveLakehouseSchemaPassword({ adminPassword = '', scriptText = '' } = {}) {
  return process.env.ADB_STREAM_SCHEMA_PASSWORD
    || process.env.DBPASSWORD
    || process.env.ADB_ADMIN_PASSWORD
    || String(adminPassword || '')
    || extractCreateUserPassword(scriptText, LAKEHOUSE_SCHEMA_USERNAME);
}

function envFlagEnabled(name, defaultValue = true) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || rawValue === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(rawValue).trim().toLowerCase());
}

function firstNonEmpty(...values) {
  return values.map(cleanText).find(Boolean) || '';
}

function objectListMatchesSchema(value, schemaName) {
  const expectedSchema = cleanText(schemaName).toUpperCase();
  if (!expectedSchema || !value) return false;

  try {
    const parsed = JSON.parse(value);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const owners = entries
      .map((entry) => cleanText(entry?.owner).toUpperCase())
      .filter(Boolean);
    return owners.length > 0 && owners.every((owner) => owner === expectedSchema);
  } catch (_) {
    const normalized = cleanText(value).toUpperCase();
    return normalized.includes(`"OWNER":"${expectedSchema}"`)
      || normalized.includes(`"OWNER": "${expectedSchema}"`);
  }
}

function normalizePrivateKey(value) {
  return cleanText(value).replace(/\\n/g, '\n');
}

function resolveOciGenAiEndpoint(region) {
  const explicitEndpoint = firstNonEmpty(process.env.OCI_GENAI_ENDPOINT, process.env.ENDPOINT);
  if (explicitEndpoint) return explicitEndpoint.replace(/\/+$/, '');
  if (!region) return '';
  return `https://inference.generativeai.${region}.oci.oraclecloud.com`;
}

function extractEndpointHost(endpoint) {
  const value = cleanText(endpoint);
  if (!value) return '';
  try {
    return new URL(value).hostname;
  } catch (_) {
    return value
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
  }
}

function resolvePgAiProfileConfig() {
  const authType = firstNonEmpty(process.env.OCI_AUTH_TYPE, 'api_key').toLowerCase();
  const region = firstNonEmpty(process.env.OCI_REGION, process.env.AI_ENDPOINT_REGION, process.env.REGION_IDENTIFIER);
  const genAiEndpoint = resolveOciGenAiEndpoint(region);
  const config = {
    authType,
    profileName: firstNonEmpty(process.env.OCI_AI_PROFILE_NAME, process.env.PG_AI_PROFILE_NAME, PG_AI_DEFAULT_PROFILE_NAME).toUpperCase(),
    credentialName: firstNonEmpty(process.env.OCI_GENAI_CREDENTIAL_NAME, process.env.PG_AI_CREDENTIAL_NAME, PG_AI_DEFAULT_CREDENTIAL_NAME).toUpperCase(),
    model: firstNonEmpty(process.env.OCI_GENAI_MODEL, PG_AI_DEFAULT_MODEL),
    embeddingModel: firstNonEmpty(process.env.OCI_GENAI_EMBEDDING_MODEL, PG_AI_DEFAULT_EMBEDDING_MODEL),
    region,
    genAiEndpoint,
    genAiEndpointHost: extractEndpointHost(genAiEndpoint),
    compartmentId: firstNonEmpty(process.env.OCI_COMPARTMENT_ID, process.env.COMPARTMENT_OCID),
    userOcid: firstNonEmpty(process.env.OCI_USER_OCID, process.env.USER_OCID, process.env.user),
    tenancyOcid: firstNonEmpty(process.env.OCI_TENANCY_OCID, process.env.TENANCY_OCID, process.env.tenancy),
    fingerprint: firstNonEmpty(process.env.OCI_FINGERPRINT, process.env.PEM_KEY_FINGERPRINT, process.env.fingerprint),
    privateKey: normalizePrivateKey(firstNonEmpty(process.env.OCI_PRIVATE_KEY, process.env.PEM_SINGLE_LINE, process.env.PEM_KEY)),
  };

  const requiredFields = ['region', 'compartmentId', 'userOcid', 'tenancyOcid', 'fingerprint', 'privateKey'];
  const missing = requiredFields.filter((field) => !config[field]);
  return { config, missing };
}

function quoteOraclePassword(password) {
  return `"${String(password || '').replace(/"/g, '""')}"`;
}

function applyCreateUserPassword(statement, username, schemaPassword) {
  const escapedUsername = cleanText(username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(CREATE\\s+USER\\s+"?${escapedUsername}"?\\s+IDENTIFIED\\s+BY\\s+)"[^"]*"`, 'i');
  return String(statement || '').replace(pattern, `$1${quoteOraclePassword(schemaPassword)}`);
}

function extractServiceName(connectionString) {
  const descriptor = cleanText(connectionString);
  if (!descriptor) return null;

  const serviceNameMatch = descriptor.match(/\(\s*service_name\s*=\s*([^)]+?)\s*\)/i);
  if (serviceNameMatch?.[1]) {
    return serviceNameMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  const easyConnectMatch = descriptor.match(/\/([^/?\s)]+(?:\.adb\.oraclecloud\.com)?)(?:[?\s)]|$)/i);
  if (easyConnectMatch?.[1]) {
    return easyConnectMatch[1].trim().replace(/^["']|["']$/g, '');
  }

  return null;
}

function hasGeneratedAdbServicePrefix(serviceName) {
  const service = cleanText(serviceName).toLowerCase();
  if (!service) return false;
  if (service.includes('.adb.')) return true;
  const serviceRoot = service
    .split('?', 1)[0]
    .split('/', 1)[0]
    .split('.', 1)[0]
    .replace(/_(medium|high|low|tpurgent|tp)$/i, '');
  if (!serviceRoot.includes('_')) return false;
  const prefix = serviceRoot.split('_', 1)[0];
  return /^[a-z0-9]{8,}$/.test(prefix);
}

function extractConnectHost(connectionString) {
  const descriptor = cleanText(connectionString);
  if (!descriptor) return null;

  const descriptorHostMatch = descriptor.match(/\(\s*host\s*=\s*([^)]+?)\s*\)/i);
  if (descriptorHostMatch?.[1]) {
    return descriptorHostMatch[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
  }

  const easyConnectHostMatch = descriptor.match(/^(?:[^/@\s]+@)?\/\/?([^/:?\s)]+)(?:[:/?\s)]|$)/i)
    || descriptor.match(/^([^/:?\s)]+)(?:[:/?\s)]|$)/i);
  if (easyConnectHostMatch?.[1]) {
    return easyConnectHostMatch[1].trim().replace(/^["']|["']$/g, '').toLowerCase();
  }

  return null;
}

function normalizeDbActionsHost(serviceName, connectionString) {
  const service = cleanText(serviceName).toLowerCase();
  if (!service) return null;

  const adbDomainIndex = service.indexOf('.adb.');
  const rawServicePrefix = adbDomainIndex >= 0 ? service.slice(0, adbDomainIndex) : service;
  const serviceTail = adbDomainIndex >= 0 ? service.slice(adbDomainIndex + '.adb.'.length) : '';
  const baseServicePrefix = rawServicePrefix
    .replace(/_(medium|high|low|tpurgent)$/i, '')
    .replace(/_/g, '-');

  const connectHost = extractConnectHost(connectionString);
  const regionalHostMatch = connectHost?.match(/^adb\.([a-z0-9-]+)\.oraclecloud\.com$/i);
  if (regionalHostMatch?.[1]) {
    return `${baseServicePrefix}.adb.${regionalHostMatch[1]}.oraclecloudapps.com`;
  }

  if (serviceTail) {
    const normalizedTail = serviceTail.replace(/\.oraclecloud\.com$/i, '.oraclecloudapps.com');
    return `${baseServicePrefix}.adb.${normalizedTail}`;
  }

  return baseServicePrefix;
}

function buildDbActionsUrl(serviceName, username, connectionString = '') {
  const service = normalizeDbActionsHost(serviceName, connectionString);
  const schemaPath = cleanText(username).replace(/^"|"$/g, '').toLowerCase();
  if (!service || !schemaPath) return null;
  return `https://${service}/ords/${encodeURIComponent(schemaPath)}/sign-in/?r=_sdw`;
}

function buildDbActionsUrlFromBase(baseUrl, username) {
  const rawBaseUrl = cleanText(baseUrl);
  const schemaPath = cleanText(username).replace(/^"|"$/g, '').toLowerCase();
  if (!rawBaseUrl || !schemaPath) return null;

  try {
    const parsed = new URL(rawBaseUrl);
    const basePath = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${basePath}/${encodeURIComponent(schemaPath)}/sign-in/`;
    parsed.search = '';
    parsed.searchParams.set('r', '_sdw');
    return parsed.toString();
  } catch {
    return `${rawBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(schemaPath)}/sign-in/?r=_sdw`;
  }
}

function resolveServiceName(connectionString, serviceNameOverride) {
  const override = cleanText(serviceNameOverride);
  const extracted = extractServiceName(connectionString);
  if (!override) return extracted;
  if (!extracted) return override;

  // Standalone provisioning may emit SERVICE_NAME=<db_name>_high while the
  // ADB connect descriptor contains the generated service prefix required to
  // construct oraclecloudapps.com tool URLs.
  if (!hasGeneratedAdbServicePrefix(override) && hasGeneratedAdbServicePrefix(extracted)) {
    return extracted;
  }

  return override;
}

function resolveDbActionsUrl({ serviceName, username, connectionString, dbActionsBaseUrl }) {
  return buildDbActionsUrlFromBase(dbActionsBaseUrl, username)
    || buildDbActionsUrl(serviceName, username, connectionString);
}

function getWalletFile(req) {
  return req.files?.wallet?.[0] || req.files?.file?.[0] || null;
}

function shouldSkipSqlScriptLine(line) {
  const trimmed = line.trim();
  return !trimmed
    || trimmed.startsWith('--')
    || /^SET\s+(SERVEROUTPUT|DEFINE|FEEDBACK|HEADING|PAGESIZE|LINESIZE|TERMOUT|ECHO|VERIFY|TRIMSPOOL|SQLBLANKLINES|TIMING)\b/i.test(trimmed)
    || /^PROMPT\b/i.test(trimmed)
    || /^WHENEVER\b/i.test(trimmed)
    || /^EXIT\b/i.test(trimmed)
    || /^SPOOL\b/i.test(trimmed)
    || /^COLUMN\b/i.test(trimmed)
    || /^DEFINE\b/i.test(trimmed);
}

function parseSqlPlusIncludeTarget(line) {
  const trimmed = String(line || '').trim();
  const includeMatch = trimmed.match(/^@@?\s*(.+?)\s*;?\s*$/i);
  if (!includeMatch?.[1]) return null;
  return includeMatch[1].trim().replace(/^["']|["']$/g, '');
}

async function readSqlScriptWithIncludes(scriptPath, seen = new Set()) {
  const resolvedPath = path.resolve(scriptPath);
  const seenKey = resolvedPath.toLowerCase();
  if (seen.has(seenKey)) {
    throw createHttpError(500, `Recursive SQL include detected: ${resolvedPath}`);
  }

  const nextSeen = new Set(seen);
  nextSeen.add(seenKey);
  const scriptText = await fs.readFile(resolvedPath, 'utf8');
  const scriptDir = path.dirname(resolvedPath);
  const expandedLines = [];

  for (const line of scriptText.split(/\r?\n/)) {
    const includeTarget = parseSqlPlusIncludeTarget(line);
    if (!includeTarget) {
      expandedLines.push(line);
      continue;
    }

    const includePath = path.resolve(scriptDir, includeTarget);
    expandedLines.push(await readSqlScriptWithIncludes(includePath, nextSeen));
  }

  return expandedLines.join('\n');
}

function parseSqlScript(scriptText) {
  const statements = [];
  const current = [];
  let inBlock = false;

  for (const line of extractSqlBlocks(scriptText).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (shouldSkipSqlScriptLine(line)) continue;

    if (inBlock) {
      if (trimmed === '/') {
        const statement = current.join('\n').trim();
        if (statement) statements.push(statement);
        current.length = 0;
        inBlock = false;
      } else {
        current.push(line);
      }
      continue;
    }

    if (!current.length && /^(DECLARE|BEGIN|CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER))\b/i.test(trimmed)) {
      inBlock = true;
      current.push(line);
      continue;
    }

    current.push(line);
    if (trimmed.endsWith(';')) {
      const statement = current.join('\n').replace(/;\s*$/, '').trim();
      if (statement) statements.push(statement);
      current.length = 0;
    }
  }

  const trailingStatement = current.join('\n').trim();
  if (trailingStatement) statements.push(trailingStatement.replace(/;\s*$/, '').trim());
  return statements;
}

function normalizeGoldSchemaStatement(statement) {
  return String(statement || '')
    .replace(/"GOLD"\./gi, '')
    .replace(/\bGOLD\./gi, '')
    .trim();
}

function isGoldSchemaDdl(statement) {
  return /^(CREATE\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX)\b/i.test(String(statement || '').trim());
}

function prepareGoldSchemaStatements(statements) {
  const runnable = [];
  let skipped = 0;

  for (const statement of statements) {
    const normalized = normalizeGoldSchemaStatement(statement);
    if (isGoldSchemaDdl(normalized)) {
      runnable.push(normalized);
    } else {
      skipped += 1;
    }
  }

  return { runnable, skipped };
}

function ignoreGoldSchemaError(err) {
  return oracleErrorMatches(err, 955);
}

function normalizeLakehouseAppSchemaStatement(statement) {
  return String(statement || '')
    .replace(/\)\s+INMEMORY\s+MEMCOMPRESS\s+FOR\s+QUERY\s+HIGH\b/gi, ')')
    .trim();
}

function prepareLakehouseAppSchemaStatements(statements) {
  const runnable = [];
  let skipped = 0;

  for (const statement of statements) {
    if (/DBMS_VECTOR\.LOAD_ONNX_MODEL/i.test(statement)) {
      skipped += 1;
      continue;
    }
    runnable.push(normalizeLakehouseAppSchemaStatement(statement));
  }

  return { runnable, skipped };
}

function isOptionalLakehouseAppSchemaStatement(statement) {
  const normalized = String(statement || '').trim();
  return /^CREATE\s+(?:OR\s+REPLACE\s+)?JSON\s+RELATIONAL\s+DUALITY\s+VIEW\b/i.test(normalized)
    || /^CREATE\s+PROPERTY\s+GRAPH\b/i.test(normalized)
    || /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|PACKAGE|TRIGGER)\b/i.test(normalized)
    || /^CREATE\s+VECTOR\s+INDEX\b/i.test(normalized)
    || /^CREATE\s+SEARCH\s+INDEX\b/i.test(normalized)
    || /^INSERT\s+INTO\s+USER_SDO_GEOM_METADATA\b/i.test(normalized)
    || /^SELECT\b/i.test(normalized);
}

function ignoreLakehouseAppSchemaError(err, statement) {
  if (oracleErrorMatches(err, 955) || oracleErrorMatches(err, 1430)) {
    return true;
  }

  const normalized = String(statement || '').trim();
  if (/^INSERT\s+INTO\s+USER_SDO_GEOM_METADATA\b/i.test(normalized) && oracleErrorMatches(err, 1)) {
    return true;
  }

  return isOptionalLakehouseAppSchemaStatement(normalized);
}

function getCsvBindDef(column) {
  const dataType = String(column.dataType || '').toUpperCase();
  if (dataType.includes('NUMBER') || dataType.includes('FLOAT') || dataType.includes('BINARY_DOUBLE') || dataType.includes('BINARY_FLOAT')) {
    return { type: oracledb.NUMBER };
  }
  if (dataType.includes('DATE') || dataType.includes('TIMESTAMP')) {
    return { type: oracledb.DATE };
  }
  if (dataType.includes('CLOB')) {
    return { type: oracledb.STRING, maxSize: 32767 };
  }
  return {
    type: oracledb.STRING,
    maxSize: Math.max(1, Math.min(Number(column.dataLength || 4000), 32767)),
  };
}

function convertCsvValueForColumn(value, column) {
  if (value === undefined || value === null) return null;
  const rawValue = String(value);
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const dataType = String(column.dataType || '').toUpperCase();
  if (dataType.includes('NUMBER') || dataType.includes('FLOAT') || dataType.includes('BINARY_DOUBLE') || dataType.includes('BINARY_FLOAT')) {
    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  if (dataType.includes('DATE') || dataType.includes('TIMESTAMP')) {
    const dateValue = new Date(trimmed);
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }

  return rawValue;
}

async function fetchTableColumnMetadata(connection, tableName) {
  const result = await connection.execute(
    `SELECT column_name,
            data_type,
            data_length,
            identity_column
     FROM user_tab_cols
     WHERE table_name = :tableName
       AND hidden_column = 'NO'
     ORDER BY column_id`,
    { tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return (result.rows || []).map((row) => ({
    name: row.COLUMN_NAME,
    dataType: row.DATA_TYPE,
    dataLength: row.DATA_LENGTH,
    identity: row.IDENTITY_COLUMN === 'YES',
  }));
}

async function executeCsvLoadBatch(connection, insertSql, bindDefs, batch) {
  if (!batch.length) return 0;
  await connection.executeMany(insertSql, batch, { bindDefs, batchErrors: false });
  await connection.commit();
  return batch.length;
}

async function fetchTableRowCount(connection, tableName) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS row_count FROM ${quoteOracleIdentifier(tableName)}`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return Number(result.rows?.[0]?.ROW_COUNT || 0);
}

async function dropTableWithRetry(connection, tableName, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await connection.execute(`DROP TABLE ${quoteOracleIdentifier(tableName)} PURGE`);
      return { dropped: true, attempts: attempt };
    } catch (err) {
      if (oracleErrorMatches(err, 942)) {
        return { dropped: false, attempts: attempt, reason: 'missing' };
      }
      if (!oracleErrorMatches(err, 54) || attempt === attempts) {
        throw err;
      }
      await delay(attempt * 1000);
    }
  }
  return { dropped: false, attempts };
}

async function createWarehouseGoldDataTable(connection, table) {
  if (!table?.columns?.length) {
    throw createHttpError(500, `Gold-data manifest does not define columns for ${table.tableName}`);
  }

  const columns = table.columns.map((column) => (
    `${quoteOracleIdentifier(column.name)} ${normalizeWarehouseDataType(column.dataType)}`
  ));
  await connection.execute(`CREATE TABLE ${quoteOracleIdentifier(table.tableName)} (\n${columns.join(',\n')}\n)`);
  return {
    tableName: table.tableName,
    columnsCreated: table.columns.length,
  };
}

async function loadCsvFileIntoTable({ connection, tableName, csvPath, batchSize = GOLD_DATA_CSV_LOAD_BATCH_SIZE }) {
  const columns = await fetchTableColumnMetadata(connection, tableName);
  if (!columns.length) {
    throw createHttpError(500, `Gold-data target table ${tableName} does not exist`);
  }

  let loadColumns = null;
  let insertSql = '';
  let bindDefs = null;
  let rowsLoaded = 0;
  let batch = [];

  const parser = fsSync
    .createReadStream(csvPath)
    .pipe(parseCsv({
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: false,
    }));

  for await (const record of parser) {
    if (!loadColumns) {
      const headersByUppercase = new Map(
        Object.keys(record).map((header) => [header.trim().toUpperCase(), header])
      );
      loadColumns = columns
        .filter((column) => !column.identity && headersByUppercase.has(column.name))
        .map((column) => ({
          ...column,
          csvHeader: headersByUppercase.get(column.name),
        }));

      if (!loadColumns.length) {
        throw createHttpError(500, `Gold-data CSV ${path.basename(csvPath)} has no loadable columns for ${tableName}`);
      }

      const columnList = loadColumns.map((column) => column.name).join(', ');
      const quotedColumnList = loadColumns.map((column) => quoteOracleIdentifier(column.name)).join(', ');
      const bindList = loadColumns.map((_, index) => `:c${index}`).join(', ');
      insertSql = `INSERT INTO ${quoteOracleIdentifier(tableName)} (${quotedColumnList || columnList}) VALUES (${bindList})`;
      bindDefs = Object.fromEntries(loadColumns.map((column, index) => [`c${index}`, getCsvBindDef(column)]));
    }

    const row = {};
    for (let index = 0; index < loadColumns.length; index += 1) {
      const column = loadColumns[index];
      row[`c${index}`] = convertCsvValueForColumn(record[column.csvHeader], column);
    }
    batch.push(row);

    if (batch.length >= batchSize) {
      rowsLoaded += await executeCsvLoadBatch(connection, insertSql, bindDefs, batch);
      batch = [];
    }
  }

  rowsLoaded += await executeCsvLoadBatch(connection, insertSql, bindDefs, batch);
  return {
    tableName,
    csvFile: path.basename(csvPath),
    rowsLoaded,
    columnsLoaded: loadColumns?.length || 0,
  };
}

async function extractWallet(walletFile) {
  if (!walletFile) {
    return {
      metadata: { uploaded: false },
      connectionOptions: {},
      cleanup: async () => {},
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peakgear-adb-wallet-'));
  try {
    const zip = new AdmZip(walletFile.buffer);
    const entries = zip.getEntries();
    if (!entries.length) {
      throw createHttpError(400, 'Wallet ZIP is empty');
    }

    for (const entry of entries) {
      const rawName = String(entry.entryName || '').replace(/\\/g, '/');
      if (!rawName || rawName.startsWith('__MACOSX/')) continue;

      const normalized = path.normalize(rawName);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        throw createHttpError(400, 'Wallet ZIP contains an unsafe path');
      }

      const targetPath = path.join(tempDir, normalized);
      const relativePath = path.relative(tempDir, targetPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw createHttpError(400, 'Wallet ZIP contains an unsafe path');
      }

      if (entry.isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, entry.getData(), { mode: 0o600 });
      }
    }

    return {
      metadata: {
        uploaded: true,
        filename: walletFile.originalname,
        size: walletFile.size,
      },
      connectionOptions: {
        walletLocation: tempDir,
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

async function useWalletDirectory(walletDir, walletPassword) {
  const resolvedWalletDir = path.resolve(cleanText(walletDir) || DEFAULT_AUTO_WALLET_DIR);
  const requiredFiles = ['tnsnames.ora', 'sqlnet.ora'];
  const checks = await Promise.all(requiredFiles.map(async (fileName) => {
    try {
      const stat = await fs.stat(path.join(resolvedWalletDir, fileName));
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  }));

  if (!checks.every(Boolean)) return null;

  return {
    metadata: {
      uploaded: false,
      source: 'server',
      location: resolvedWalletDir,
    },
    connectionOptions: {
      // The compose service mounts the wallet read-only at /wallet.  Using that
      // location directly keeps the wallet's ojdbc.properties paths valid and
      // avoids a race where concurrent startup tasks remove a copied wallet
      // while node-oracledb is still opening its TLS files.
      configDir: resolvedWalletDir,
      ...(walletPassword ? { walletLocation: resolvedWalletDir, walletPassword } : {}),
    },
    cleanup: async () => {},
  };
}

async function resolveWallet({ walletFile, walletDir, walletPassword } = {}) {
  if (walletDir) {
    const directoryWallet = await useWalletDirectory(walletDir, walletPassword);
    if (directoryWallet) return directoryWallet;
  }
  return extractWallet(walletFile);
}

async function validateLakehouseConnection({
  connectionString,
  username,
  password,
  walletFile,
  walletDir,
  walletPassword,
  serviceNameOverride,
  dbActionsBaseUrl,
}) {
  const connectString = cleanText(connectionString);
  const user = ADMIN_USERNAME;
  const pass = String(password || '');
  const serviceName = resolveServiceName(connectString, serviceNameOverride);
  const dbActionsUrl = serviceName
    ? resolveDbActionsUrl({ serviceName, username: user, connectionString: connectString, dbActionsBaseUrl })
    : null;

  if (!connectString || !pass) {
    throw createHttpError(400, 'Connection string and ADMIN password are required');
  }

  if (!serviceName) {
    throw createHttpError(400, 'Could not find service_name in the Autonomous Database connection string');
  }

  let wallet;
  let connection;
  try {
    wallet = await resolveWallet({ walletFile, walletDir, walletPassword });
    connection = await oracledb.getConnection({
      user,
      password: pass,
      connectString,
      ...wallet.connectionOptions,
    });

    await connection.ping();
    const result = await connection.execute(
      `SELECT
         sys_context('USERENV', 'DB_NAME') AS db_name,
         sys_context('USERENV', 'SERVICE_NAME') AS service_name,
         sys_context('USERENV', 'CURRENT_SCHEMA') AS current_schema
       FROM dual`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return {
      ok: true,
      connected: true,
      serviceName,
      dbActionsUrl,
      username: user,
      database: result.rows?.[0] || {},
      wallet: wallet.metadata,
    };
  } catch (err) {
    if (err.status) throw err;
    const validationError = createHttpError(502, err.message || 'Autonomous Database connection validation failed', {
      code: err.code,
      serviceName,
      dbActionsUrl,
      walletUploaded: Boolean(walletFile),
    });
    throw validationError;
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

async function fetchUserStatus(connection, username) {
  const result = await connection.execute(
    `SELECT username, account_status, default_tablespace, temporary_tablespace, profile
     FROM dba_users
     WHERE username = :username`,
    { username },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows?.[0] || null;
}

async function fetchUserSessions(connection, username) {
  const result = await connection.execute(
    `SELECT inst_id,
            sid,
            serial# AS serial_num,
            status,
            machine,
            program,
            module
     FROM gv$session
     WHERE username = :username
     ORDER BY inst_id, sid`,
    { username },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows || [];
}

async function terminateUserSessions(connection, username) {
  const sessions = await fetchUserSessions(connection, username);
  const terminated = [];

  for (const session of sessions) {
    const instId = Number(session.INST_ID);
    const sid = Number(session.SID);
    const serialNum = Number(session.SERIAL_NUM);
    if (!Number.isFinite(instId) || !Number.isFinite(sid) || !Number.isFinite(serialNum)) {
      continue;
    }

    try {
      await connection.execute(`ALTER SYSTEM KILL SESSION '${sid},${serialNum},@${instId}' IMMEDIATE`);
      terminated.push({
        instId,
        sid,
        serialNum,
        status: session.STATUS,
        module: session.MODULE,
        program: session.PROGRAM,
      });
    } catch (err) {
      // ORA-00030 means the session disappeared; ORA-00031 means Oracle already marked it for kill.
      if (!oracleErrorMatches(err, 30) && !oracleErrorMatches(err, 31)) {
        throw err;
      }
    }
  }

  return terminated;
}

async function dropUserCascade(connection, username) {
  const terminatedSessions = [];

  for (let attempt = 1; attempt <= DROP_USER_MAX_ATTEMPTS; attempt += 1) {
    terminatedSessions.push(...await terminateUserSessions(connection, username));

    try {
      await connection.execute(`DROP USER "${username}" CASCADE`);
      return {
        dropped: true,
        terminatedSessions,
      };
    } catch (err) {
      if (!oracleErrorMatches(err, 1940) || attempt === DROP_USER_MAX_ATTEMPTS) {
        throw createHttpError(500, `Lakehouse seed failed while dropping existing ${username} user`, {
          code: err.code,
          errorNum: err.errorNum,
          message: err.message,
          terminatedSessions: terminatedSessions.length,
        });
      }

      await delay(DROP_USER_RETRY_DELAY_MS);
    }
  }

  return {
    dropped: false,
    terminatedSessions,
  };
}

async function fetchAvailableAiPackages(connection) {
  const packageNames = [...PG_AI_REQUIRED_PACKAGES, ...PG_AI_OPTIONAL_PACKAGES];
  const result = await connection.execute(
    `SELECT DISTINCT object_name AS package_name
     FROM all_objects
     WHERE object_type = 'PACKAGE'
       AND object_name IN (${packageNames.map((_, index) => `:pkg${index}`).join(', ')})
     UNION
     SELECT DISTINCT synonym_name AS package_name
     FROM all_synonyms
     WHERE synonym_name IN (${packageNames.map((_, index) => `:pkg${index}`).join(', ')})`,
    Object.fromEntries(packageNames.map((name, index) => [`pkg${index}`, name])),
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return new Set((result.rows || []).map((row) => String(row.PACKAGE_NAME || '').toUpperCase()));
}

async function grantPgAiNetworkAcl(connection, host) {
  const endpointHost = cleanText(host);
  if (!endpointHost) {
    return {
      granted: false,
      skipped: true,
      reason: 'missing_endpoint_host',
    };
  }

  await connection.execute(
    `BEGIN
       DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
         host       => :host,
         lower_port => 443,
         upper_port => 443,
         ace        => xs$ace_type(
           privilege_list => xs$name_list('http'),
           principal_name => :principal,
           principal_type => xs_acl.ptype_db
         )
       );
       DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
         host => :host,
         ace  => xs$ace_type(
           privilege_list => xs$name_list('resolve'),
           principal_name => :principal,
           principal_type => xs_acl.ptype_db
         )
       );
     END;`,
    {
      host: endpointHost,
      principal: LAKEHOUSE_SCHEMA_USERNAME,
    }
  );
  await connection.commit();

  return {
    granted: true,
    host: endpointHost,
    port: 443,
    privileges: ['http', 'resolve'],
  };
}

async function fetchPgAiNetworkAclStatus(connection, host) {
  const endpointHost = cleanText(host);
  if (!endpointHost) {
    return {
      granted: false,
      skipped: true,
      reason: 'missing_endpoint_host',
    };
  }

  try {
    const result = await connection.execute(
      `SELECT lower_port, upper_port, privilege, grant_type
       FROM dba_host_aces
       WHERE host = :host
         AND principal = :principal`,
      {
        host: endpointHost,
        principal: LAKEHOUSE_SCHEMA_USERNAME,
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const rows = result.rows || [];
    const hasHttp = rows.some((row) => String(row.PRIVILEGE || '').toUpperCase() === 'HTTP'
      && Number(row.LOWER_PORT) === 443
      && Number(row.UPPER_PORT) === 443
      && String(row.GRANT_TYPE || '').toUpperCase() === 'GRANT');
    const hasResolve = rows.some((row) => String(row.PRIVILEGE || '').toUpperCase() === 'RESOLVE'
      && row.LOWER_PORT === null
      && row.UPPER_PORT === null
      && String(row.GRANT_TYPE || '').toUpperCase() === 'GRANT');

    return {
      granted: hasHttp && hasResolve,
      host: endpointHost,
      port: 443,
      privileges: {
        http: hasHttp,
        resolve: hasResolve,
      },
    };
  } catch (err) {
    return {
      granted: false,
      host: endpointHost,
      error: err.message,
      code: err.code,
      errorNum: err.errorNum,
    };
  }
}

async function grantPgAiPrivileges(connection) {
  if (!envFlagEnabled('PG_AI_PROFILE_AUTO_SETUP', true)) {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'disabled',
    };
  }

  const availablePackages = await fetchAvailableAiPackages(connection);
  const missingRequiredPackages = PG_AI_REQUIRED_PACKAGES.filter((packageName) => !availablePackages.has(packageName));
  const missingOptionalPackages = PG_AI_OPTIONAL_PACKAGES.filter((packageName) => !availablePackages.has(packageName));

  if (missingRequiredPackages.length) {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'missing_packages',
      missingRequiredPackages,
      missingOptionalPackages,
    };
  }

  const { config } = resolvePgAiProfileConfig();
  const grantPackages = [...PG_AI_REQUIRED_PACKAGES, ...PG_AI_OPTIONAL_PACKAGES]
    .filter((packageName) => availablePackages.has(packageName));

  for (const packageName of grantPackages) {
    await connection.execute(`GRANT EXECUTE ON ${packageName} TO "${LAKEHOUSE_SCHEMA_USERNAME}"`);
  }

  const networkAcl = await grantPgAiNetworkAcl(connection, config.genAiEndpointHost);

  return {
    attempted: true,
    enabled: true,
    grantsExecuted: grantPackages.length,
    missingOptionalPackages,
    networkAcl,
  };
}

async function grantPgAiPrivilegesSafely(connection) {
  try {
    return await grantPgAiPrivileges(connection);
  } catch (err) {
    if (envFlagEnabled('PG_AI_PROFILE_REQUIRED', false)) {
      throw createHttpError(500, 'PG DBMS_CLOUD_AI privilege setup failed', {
        code: err.code,
        errorNum: err.errorNum,
        message: err.message,
      });
    }

    return {
      attempted: true,
      enabled: false,
      error: err.message,
      code: err.code,
      errorNum: err.errorNum,
    };
  }
}

async function fetchPgAiProfileStatus(pgConnection, profileName = PG_AI_DEFAULT_PROFILE_NAME) {
  try {
    const result = await pgConnection.execute(
      `SELECT profile_name, status
       FROM user_cloud_ai_profiles
       WHERE profile_name = :profileName`,
      { profileName: cleanText(profileName).toUpperCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    if (!row) return null;
    const { config } = resolvePgAiProfileConfig();
    const attributeResult = await pgConnection.execute(
      `SELECT attribute_name, attribute_value
       FROM user_cloud_ai_profile_attributes
       WHERE profile_name = :profileName
         AND attribute_name IN ('region', 'model', 'embedding_model', 'object_list')`,
      { profileName: cleanText(profileName).toUpperCase() },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { ATTRIBUTE_VALUE: { type: oracledb.STRING } },
      }
    );
    const attributes = {};
    for (const attributeRow of attributeResult.rows || []) {
      attributes[String(attributeRow.ATTRIBUTE_NAME || '').toLowerCase()] = cleanText(attributeRow.ATTRIBUTE_VALUE);
    }
    const expectedModel = config.model;
    const expectedEmbeddingModel = config.embeddingModel;
    const expectedRegion = config.region;
    const model = attributes.model || '';
    const embeddingModel = attributes.embedding_model || '';
    const region = attributes.region || '';
    const expectedSchema = LAKEHOUSE_SCHEMA_USERNAME;
    const objectListMatches = objectListMatchesSchema(attributes.object_list, expectedSchema);
    return {
      profileName: row.PROFILE_NAME,
      status: row.STATUS,
      enabled: String(row.STATUS || '').toUpperCase() === 'ENABLED',
      model,
      expectedModel,
      embeddingModel,
      expectedEmbeddingModel,
      region,
      expectedRegion,
      expectedSchema,
      objectListMatches,
      needsReconcile: Boolean(
        (expectedModel && model !== expectedModel)
          || (expectedEmbeddingModel && embeddingModel !== expectedEmbeddingModel)
          || (expectedRegion && region !== expectedRegion)
          || !objectListMatches
      ),
      attributes,
    };
  } catch (err) {
    return {
      profileName,
      status: 'UNKNOWN',
      enabled: false,
      error: err.message,
      code: err.code,
    };
  }
}

async function createPgAiProfile({ connectString, schemaPassword, walletOptions, privilegeResult }) {
  if (!envFlagEnabled('PG_AI_PROFILE_AUTO_SETUP', true)) {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'disabled',
    };
  }

  if (privilegeResult?.skipped || privilegeResult?.error) {
    return privilegeResult;
  }

  const { config, missing } = resolvePgAiProfileConfig();
  if (config.authType !== 'api_key') {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'unsupported_auth_type',
      authType: config.authType,
    };
  }

  if (missing.length) {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'missing_config',
      missing,
    };
  }

  const profileAttributes = JSON.stringify({
    provider: 'oci',
    credential_name: config.credentialName,
    comments: true,
    oci_compartment_id: config.compartmentId,
    region: config.region,
    model: config.model,
    embedding_model: config.embeddingModel,
    oci_apiformat: 'COHERE',
    temperature: 0,
    object_list: [{ owner: LAKEHOUSE_SCHEMA_USERNAME }],
  });

  let pgConnection;
  try {
    pgConnection = await oracledb.getConnection({
      user: LAKEHOUSE_SCHEMA_USERNAME,
      password: schemaPassword,
      connectString,
      ...walletOptions,
    });

    await pgConnection.execute(
      `BEGIN
         BEGIN
           DBMS_CLOUD.DROP_CREDENTIAL(credential_name => :credentialName);
         EXCEPTION
           WHEN OTHERS THEN NULL;
         END;
         DBMS_CLOUD.CREATE_CREDENTIAL(
           credential_name => :credentialName,
           user_ocid       => :userOcid,
           tenancy_ocid    => :tenancyOcid,
           private_key     => :privateKey,
           fingerprint     => :fingerprint
         );
       END;`,
      {
        credentialName: config.credentialName,
        userOcid: config.userOcid,
        tenancyOcid: config.tenancyOcid,
        privateKey: config.privateKey,
        fingerprint: config.fingerprint,
      }
    );

    await pgConnection.execute(
      `BEGIN
         BEGIN
           DBMS_CLOUD_AI.DROP_PROFILE(profile_name => :profileName, force => TRUE);
         EXCEPTION
           WHEN OTHERS THEN NULL;
         END;
         DBMS_CLOUD_AI.CREATE_PROFILE(
           profile_name => :profileName,
           attributes   => :profileAttributes
         );
         BEGIN
           DBMS_CLOUD_AI.ENABLE_PROFILE(:profileName);
         EXCEPTION
           WHEN OTHERS THEN NULL;
         END;
       END;`,
      {
        profileName: config.profileName,
        profileAttributes,
      }
    );

    const status = await fetchPgAiProfileStatus(pgConnection, config.profileName);
    return {
      attempted: true,
      enabled: status?.enabled ?? true,
      profileName: config.profileName,
      credentialName: config.credentialName,
      model: config.model,
      region: config.region,
      genAiEndpoint: config.genAiEndpoint,
      objectList: [{ owner: LAKEHOUSE_SCHEMA_USERNAME }],
      status,
      grantsExecuted: privilegeResult?.grantsExecuted || 0,
      missingOptionalPackages: privilegeResult?.missingOptionalPackages || [],
      networkAcl: privilegeResult?.networkAcl,
    };
  } finally {
    if (pgConnection) {
      try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function createPgAiProfileSafely(options) {
  try {
    return await createPgAiProfile(options);
  } catch (err) {
    if (envFlagEnabled('PG_AI_PROFILE_REQUIRED', false)) {
      throw createHttpError(500, 'PG DBMS_CLOUD_AI profile setup failed', {
        code: err.code,
        errorNum: err.errorNum,
        message: err.message,
      });
    }

    return {
      attempted: true,
      enabled: false,
      error: err.message,
      code: err.code,
      errorNum: err.errorNum,
    };
  }
}

async function reconcilePgAiProfileForSeededSchema({
  connectionString,
  password,
  walletDir,
  walletPassword,
  schemaPassword,
}) {
  if (!envFlagEnabled('PG_AI_PROFILE_AUTO_SETUP', true)) {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'disabled',
    };
  }

  const connectString = cleanText(connectionString);
  const pass = String(password || '');
  if (!connectString || !pass || !schemaPassword) {
    return {
      attempted: false,
      enabled: false,
      skipped: true,
      reason: 'missing_connection_config',
    };
  }

  let wallet;
  let connection;
  try {
    wallet = await resolveWallet({ walletDir, walletPassword });
    connection = await oracledb.getConnection({
      user: ADMIN_USERNAME,
      password: pass,
      connectString,
      ...wallet.connectionOptions,
    });

    const privilegeResult = await grantPgAiPrivilegesSafely(connection);
    return createPgAiProfileSafely({
      connectString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
      privilegeResult,
    });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

async function runPgSqlScript({
  scriptPath,
  label,
  connectString,
  schemaPassword,
  walletOptions,
  prepareStatements = (statements) => ({ runnable: statements, skipped: 0 }),
  ignoreError = null,
}) {
  const scriptText = await readSqlScriptWithIncludes(scriptPath);
  const statements = parseSqlScript(scriptText);
  const { runnable, skipped } = prepareStatements(statements);

  if (!runnable.length) {
    return {
      statementsExecuted: 0,
      statementsSkipped: statements.length,
      statementsIgnored: 0,
    };
  }

  let pgConnection;
  let ignored = 0;
  try {
    pgConnection = await oracledb.getConnection({
      user: LAKEHOUSE_SCHEMA_USERNAME,
      password: schemaPassword,
      connectString,
      ...walletOptions,
    });

    for (const [index, statement] of runnable.entries()) {
      let executed = false;
      for (let attempt = 1; attempt <= SQL_LOCK_RETRY_ATTEMPTS; attempt += 1) {
        try {
          await pgConnection.execute(statement);
          executed = true;
          break;
        } catch (err) {
          if (isTransientSqlLockError(err) && attempt < SQL_LOCK_RETRY_ATTEMPTS) {
            await delay(attempt * 1000);
            continue;
          }
          if (ignoreError?.(err, statement, { label, index, attempt })) {
            ignored += 1;
            executed = true;
            break;
          }
          throw createHttpError(500, `Lakehouse seed failed while executing ${label} statement ${index + 1}`, {
            code: err.code,
            errorNum: err.errorNum,
            message: err.message,
            statementPreview: statement.slice(0, 180),
          });
        }
      }
      if (!executed) {
        throw createHttpError(500, `Lakehouse seed failed while executing ${label} statement ${index + 1}`);
      }
    }

    return {
      statementsExecuted: runnable.length - ignored,
      statementsSkipped: skipped,
      statementsIgnored: ignored,
    };
  } finally {
    if (pgConnection) {
      try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function runSilverSchemaScript({ connectString, schemaPassword, walletOptions }) {
  return runPgSqlScript({
    scriptPath: LAKEHOUSE_SILVER_SCHEMA_SCRIPT,
    label: 'Silver schema',
    connectString,
    schemaPassword,
    walletOptions,
  });
}

async function runBronzeSchemaScript({ connectString, schemaPassword, walletOptions }) {
  return runPgSqlScript({
    scriptPath: LAKEHOUSE_BRONZE_SCHEMA_SCRIPT,
    label: 'Bronze streaming schema',
    connectString,
    schemaPassword,
    walletOptions,
  });
}

async function runGoldSchemaScript({ connectString, schemaPassword, walletOptions }) {
  return runPgSqlScript({
    scriptPath: LAKEHOUSE_GOLD_SCHEMA_SCRIPT,
    label: 'Gold schema',
    connectString,
    schemaPassword,
    walletOptions,
    prepareStatements: prepareGoldSchemaStatements,
    ignoreError: ignoreGoldSchemaError,
  });
}

async function runLakehouseAppSchemaScripts({ connectString, schemaPassword, walletOptions }) {
  const results = [];
  for (const scriptPath of LAKEHOUSE_APP_SCHEMA_SCRIPTS) {
    results.push(await runPgSqlScript({
      scriptPath,
      label: `App schema ${path.basename(scriptPath)}`,
      connectString,
      schemaPassword,
      walletOptions,
      prepareStatements: prepareLakehouseAppSchemaStatements,
      ignoreError: ignoreLakehouseAppSchemaError,
    }));
  }

  return results.reduce(
    (summary, result) => ({
      statementsExecuted: summary.statementsExecuted + Number(result.statementsExecuted || 0),
      statementsSkipped: summary.statementsSkipped + Number(result.statementsSkipped || 0),
      statementsIgnored: summary.statementsIgnored + Number(result.statementsIgnored || 0),
      scripts: [...summary.scripts, result],
    }),
    { statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0, scripts: [] }
  );
}

async function loadWarehouseGoldData({ connectString, schemaPassword, walletOptions }) {
  let pgConnection;
  try {
    pgConnection = await oracledb.getConnection({
      user: LAKEHOUSE_SCHEMA_USERNAME,
      password: schemaPassword,
      connectString,
      ...walletOptions,
    });

    const resetResults = [];
    const warehouseTablesToDrop = [
      ...new Set([
        ...LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLE_NAMES,
        ...LAKEHOUSE_WAREHOUSE_STALE_GOLD_DATA_TABLE_NAMES,
      ]),
    ];
    for (const tableName of warehouseTablesToDrop) {
      resetResults.push({ tableName, ...(await dropTableWithRetry(pgConnection, tableName)) });
    }

    const createResults = [];
    for (const table of LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLES) {
      createResults.push(await createWarehouseGoldDataTable(pgConnection, table));
    }

    const tables = [];
    for (const { tableName, csvFile } of LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLES) {
      tables.push(await loadCsvFileIntoTable({
        connection: pgConnection,
        tableName,
        csvPath: path.join(LAKEHOUSE_WAREHOUSE_GOLD_DATA_DIR, csvFile),
      }));
    }

    return {
      tables,
      reset: resetResults,
      create: createResults,
      rowsLoaded: tables.reduce((sum, table) => sum + Number(table.rowsLoaded || 0), 0),
    };
  } finally {
    if (pgConnection) {
      try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function executeIgnoringMissingObject(connection, sql, { ignoreAnyError = false } = {}) {
  for (let attempt = 1; attempt <= SQL_LOCK_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await connection.execute(sql);
      return { executed: true, attempts: attempt };
    } catch (err) {
      if (isTransientSqlLockError(err) && attempt < SQL_LOCK_RETRY_ATTEMPTS) {
        await delay(attempt * 1000);
        continue;
      }
      if (ignoreAnyError) {
        return { executed: false, ignored: true, code: err.code, attempts: attempt };
      }
      if (oracleErrorMatches(err, 942) || oracleErrorMatches(err, 4043) || oracleErrorMatches(err, 1418)) {
        return { executed: false, ignored: true, code: err.code, attempts: attempt };
      }
      throw err;
    }
  }
  return { executed: false, ignored: true, reason: 'retry_exhausted' };
}

async function resetLakehouseAppDataObjects({ connectString, schemaPassword, walletOptions }) {
  let pgConnection;
  try {
    pgConnection = await oracledb.getConnection({
      user: LAKEHOUSE_SCHEMA_USERNAME,
      password: schemaPassword,
      connectString,
      ...walletOptions,
    });

    const propertyGraphs = [];
    for (const graphName of LAKEHOUSE_APP_RESET_PROPERTY_GRAPHS) {
      propertyGraphs.push({
        name: graphName,
        ...(await executeIgnoringMissingObject(pgConnection, `DROP PROPERTY GRAPH ${graphName}`, { ignoreAnyError: true })),
      });
    }

    const views = [];
    for (const viewName of LAKEHOUSE_APP_RESET_VIEWS) {
      views.push({
        name: viewName,
        ...(await executeIgnoringMissingObject(pgConnection, `DROP VIEW ${viewName}`)),
      });
    }

    const tables = [];
    for (const tableName of LAKEHOUSE_APP_RESET_TABLES) {
      tables.push({
        name: tableName,
        ...(await executeIgnoringMissingObject(pgConnection, `DROP TABLE ${tableName} CASCADE CONSTRAINTS PURGE`)),
      });
    }

    return {
      propertyGraphs,
      views,
      tables,
      tablesDropped: tables.filter((table) => table.executed).length,
    };
  } finally {
    if (pgConnection) {
      try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function fetchLakehouseGoldDataStatus(pgConnection) {
  const tableBinds = Object.fromEntries(LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES.map((name, index) => [`t${index}`, name]));
  const tableList = LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES.map((_, index) => `:t${index}`).join(',');
  const tableResult = await pgConnection.execute(
    `SELECT table_name
     FROM user_tables
     WHERE table_name IN (${tableList})`,
    tableBinds,
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const existingTables = new Set((tableResult.rows || []).map((row) => row.TABLE_NAME));
  const counts = {};

  for (const tableName of LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES) {
    if (!existingTables.has(tableName)) {
      counts[tableName] = null;
      continue;
    }
    const countResult = await pgConnection.execute(
      `SELECT COUNT(*) AS row_count FROM ${quoteOracleIdentifier(tableName)}`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    counts[tableName] = Number(countResult.rows?.[0]?.ROW_COUNT || 0);
  }

  const missingTables = LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES.filter((tableName) => !existingTables.has(tableName));
  const emptyTables = LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES
    .filter((tableName) => {
      const expectedRows = Number(LAKEHOUSE_GOLD_DATA_EXPECTED_ROWS.get(tableName) ?? 1);
      return existingTables.has(tableName)
        && expectedRows > 0
        && Number(counts[tableName] || 0) === 0;
    });
  let staleWarehouseTables = [];
  if (LAKEHOUSE_WAREHOUSE_STALE_GOLD_DATA_TABLE_NAMES.length) {
    const staleBinds = Object.fromEntries(
      LAKEHOUSE_WAREHOUSE_STALE_GOLD_DATA_TABLE_NAMES.map((name, index) => [`s${index}`, name])
    );
    const staleList = LAKEHOUSE_WAREHOUSE_STALE_GOLD_DATA_TABLE_NAMES.map((_, index) => `:s${index}`).join(',');
    const staleResult = await pgConnection.execute(
      `SELECT table_name
       FROM user_tables
       WHERE table_name IN (${staleList})`,
      staleBinds,
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    staleWarehouseTables = (staleResult.rows || []).map((row) => row.TABLE_NAME);
  }

  return {
    loaded: missingTables.length === 0 && emptyTables.length === 0 && staleWarehouseTables.length === 0,
    requiredTables: LAKEHOUSE_GOLD_DATA_REQUIRED_TABLES.length,
    existingTables: existingTables.size,
    missingTables,
    emptyTables,
    staleWarehouseTables,
    counts,
    expectedRows: Object.fromEntries(LAKEHOUSE_GOLD_DATA_EXPECTED_ROWS),
  };
}

function areGoldDataTablesLoaded(status, tableNames) {
  if (!status?.counts) return false;
  return tableNames.every((tableName) => {
    const count = status.counts[tableName];
    const expectedRows = Number(LAKEHOUSE_GOLD_DATA_EXPECTED_ROWS.get(tableName) ?? 1);
    return count !== null && count !== undefined && (expectedRows === 0 || Number(count || 0) > 0);
  });
}

async function getLakehouseGoldDataStatusForConnection({ connectString, schemaPassword, walletOptions }) {
  let pgConnection;
  try {
    pgConnection = await oracledb.getConnection({
      user: LAKEHOUSE_SCHEMA_USERNAME,
      password: schemaPassword,
      connectString,
      ...walletOptions,
    });
    return await fetchLakehouseGoldDataStatus(pgConnection);
  } finally {
    if (pgConnection) {
      try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function loadLakehouseGoldData({
  connectString,
  schemaPassword,
  walletOptions,
  ensureWarehouseSchema = false,
}) {
  const warehouseSchemaResult = ensureWarehouseSchema
    ? await runGoldSchemaScript({ connectString, schemaPassword, walletOptions })
    : null;
  const initialStatus = await getLakehouseGoldDataStatusForConnection({ connectString, schemaPassword, walletOptions });
  const warehouseLoaded = areGoldDataTablesLoaded(initialStatus, LAKEHOUSE_WAREHOUSE_GOLD_DATA_TABLE_NAMES)
    && !(initialStatus.staleWarehouseTables || []).length;
  const appLoaded = areGoldDataTablesLoaded(initialStatus, LAKEHOUSE_APP_GOLD_DATA_TABLE_NAMES);

  const warehouseGoldResult = warehouseLoaded
    ? { skipped: true, reason: 'already_loaded', rowsLoaded: 0, tables: [] }
    : await loadWarehouseGoldData({
      connectString,
      schemaPassword,
      walletOptions,
    });

  let appSchemaResult = { skipped: true, reason: 'already_loaded', statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0 };
  let appSeedResult = { skipped: true, reason: 'already_loaded', statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0 };
  let returnsSchemaResult = { skipped: true, reason: 'already_loaded', statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0 };
  let returnsDataResult = { skipped: true, reason: 'already_loaded', statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0 };
  let fulfillmentZonesResult = { skipped: true, reason: 'already_loaded', statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0 };
  let appResetResult = { skipped: true, reason: 'already_loaded' };

  if (!appLoaded) {
    appResetResult = await resetLakehouseAppDataObjects({
      connectString,
      schemaPassword,
      walletOptions,
    });
    appSchemaResult = await runLakehouseAppSchemaScripts({
      connectString,
      schemaPassword,
      walletOptions,
    });
    appSeedResult = await runPgSqlScript({
      scriptPath: LAKEHOUSE_APP_GOLD_DATA_SCRIPT,
      label: 'Gold-data seed',
      connectString,
      schemaPassword,
      walletOptions,
    });
    returnsSchemaResult = await runPgSqlScript({
      scriptPath: LAKEHOUSE_RETURNS_GRAPH_SCHEMA_SCRIPT,
      label: 'Returns graph schema',
      connectString,
      schemaPassword,
      walletOptions,
      ignoreError: ignoreLakehouseAppSchemaError,
    });
    returnsDataResult = await runPgSqlScript({
      scriptPath: LAKEHOUSE_RETURNS_GRAPH_DATA_SCRIPT,
      label: 'Returns graph data',
      connectString,
      schemaPassword,
      walletOptions,
    });
    fulfillmentZonesResult = await runPgSqlScript({
      scriptPath: LAKEHOUSE_FULFILLMENT_ZONES_SCRIPT,
      label: 'Fulfillment zones',
      connectString,
      schemaPassword,
      walletOptions,
    });
  }

  let pgConnection;
  try {
    pgConnection = await oracledb.getConnection({
      user: LAKEHOUSE_SCHEMA_USERNAME,
      password: schemaPassword,
      connectString,
      ...walletOptions,
    });
    const status = await fetchLakehouseGoldDataStatus(pgConnection);
    const results = [
      appSchemaResult,
      appSeedResult,
      returnsSchemaResult,
      returnsDataResult,
      fulfillmentZonesResult,
    ];
    const totals = results.reduce((summary, result) => ({
      statementsExecuted: summary.statementsExecuted + Number(result.statementsExecuted || 0),
      statementsSkipped: summary.statementsSkipped + Number(result.statementsSkipped || 0),
      statementsIgnored: summary.statementsIgnored + Number(result.statementsIgnored || 0),
    }), { statementsExecuted: 0, statementsSkipped: 0, statementsIgnored: 0 });

    return {
      loaded: status.loaded,
      ...totals,
      warehouseGoldRowsLoaded: warehouseGoldResult.rowsLoaded,
      warehouseSchema: warehouseSchemaResult,
      appReset: appResetResult,
      appSchema: appSchemaResult,
      warehouseGold: warehouseGoldResult,
      appSeed: appSeedResult,
      returnsSchema: returnsSchemaResult,
      returnsData: returnsDataResult,
      fulfillmentZones: fulfillmentZonesResult,
      status,
    };
  } finally {
    if (pgConnection) {
      try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function loadLakehouseGoldDataFromConfig(config, schemaPassword) {
  let wallet;
  try {
    wallet = await resolveWallet({
      walletDir: config.walletDir,
      walletPassword: config.walletPassword,
    });
    return loadLakehouseGoldData({
      connectString: config.connectionString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
      ensureWarehouseSchema: true,
    });
  } finally {
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

async function seedLakehouseSchema({ connectionString, password, walletFile }) {
  return seedLakehouseSchemaWithOptions({ connectionString, password, walletFile });
}

async function seedLakehouseSchemaWithOptions({
  connectionString,
  password,
  walletFile,
  walletDir,
  walletPassword,
  serviceNameOverride,
  dbActionsBaseUrl,
}) {
  const connectString = cleanText(connectionString);
  const pass = String(password || '');
  const serviceName = resolveServiceName(connectString, serviceNameOverride);
  const dbActionsUrl = serviceName
    ? resolveDbActionsUrl({
      serviceName,
      username: ADMIN_USERNAME,
      connectionString: connectString,
      dbActionsBaseUrl,
    })
    : null;

  if (!connectString || !pass) {
    throw createHttpError(400, 'Connection string and ADMIN password are required');
  }

  if (!serviceName) {
    throw createHttpError(400, 'Could not find service_name in the Autonomous Database connection string');
  }

  let wallet;
  let connection;
  try {
    const scriptText = await fs.readFile(LAKEHOUSE_USER_SCRIPT, 'utf8');
    const schemaPassword = resolveLakehouseSchemaPassword({ adminPassword: pass, scriptText });
    if (!schemaPassword) {
      throw createHttpError(400, 'DBPASSWORD is required to seed the PG lakehouse user');
    }
    const statements = parseSqlScript(scriptText)
      .map((statement) => applyCreateUserPassword(statement, LAKEHOUSE_SCHEMA_USERNAME, schemaPassword));
    if (!statements.length) {
      throw createHttpError(500, 'Lakehouse seed script did not contain executable SQL');
    }

    wallet = await resolveWallet({ walletFile, walletDir, walletPassword });
    connection = await oracledb.getConnection({
      user: ADMIN_USERNAME,
      password: pass,
      connectString,
      ...wallet.connectionOptions,
    });

    await connection.ping();
    const existingUser = await fetchUserStatus(connection, LAKEHOUSE_SCHEMA_USERNAME);
    let dropResult = { dropped: false, terminatedSessions: [] };
    if (existingUser) {
      dropResult = await dropUserCascade(connection, LAKEHOUSE_SCHEMA_USERNAME);
    }

    for (const [index, statement] of statements.entries()) {
      try {
        await connection.execute(statement);
      } catch (err) {
        throw createHttpError(500, `Lakehouse seed failed while executing statement ${index + 1}`, {
          code: err.code,
          errorNum: err.errorNum,
          message: err.message,
        });
      }
    }

    const aiPrivilegeResult = await grantPgAiPrivilegesSafely(connection);

    const bronzeResult = await runBronzeSchemaScript({
      connectString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
    });

    const silverResult = await runSilverSchemaScript({
      connectString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
    });

    const goldResult = await runGoldSchemaScript({
      connectString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
    });

    const goldDataResult = await loadLakehouseGoldData({
      connectString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
    });

    const aiProfileResult = await createPgAiProfileSafely({
      connectString,
      schemaPassword,
      walletOptions: wallet.connectionOptions,
      privilegeResult: aiPrivilegeResult,
    });

    const createdUser = await fetchUserStatus(connection, LAKEHOUSE_SCHEMA_USERNAME);
    if (!createdUser) {
      throw createHttpError(500, `Seed script completed but ${LAKEHOUSE_SCHEMA_USERNAME} was not found`);
    }

    return {
      ok: true,
      seeded: true,
      schema: LAKEHOUSE_SCHEMA_USERNAME,
      droppedExisting: dropResult.dropped,
      terminatedSessions: dropResult.terminatedSessions.length,
      statementsExecuted: statements.length + bronzeResult.statementsExecuted + silverResult.statementsExecuted + goldResult.statementsExecuted + goldDataResult.statementsExecuted,
      userStatementsExecuted: statements.length,
      bronzeStatementsExecuted: bronzeResult.statementsExecuted,
      bronzeStatementsSkipped: bronzeResult.statementsSkipped,
      silverStatementsExecuted: silverResult.statementsExecuted,
      silverStatementsSkipped: silverResult.statementsSkipped,
      goldStatementsExecuted: goldResult.statementsExecuted,
      goldStatementsSkipped: goldResult.statementsSkipped,
      schemaStatementsExecuted: bronzeResult.statementsExecuted + silverResult.statementsExecuted + goldResult.statementsExecuted,
      schemaStatementsSkipped: bronzeResult.statementsSkipped + silverResult.statementsSkipped + goldResult.statementsSkipped,
      goldDataLoaded: goldDataResult.loaded,
      goldData: goldDataResult,
      goldDataStatementsExecuted: goldDataResult.statementsExecuted,
      goldDataStatementsSkipped: goldDataResult.statementsSkipped,
      goldDataStatementsIgnored: goldDataResult.statementsIgnored,
      schemaPassword,
      aiProfile: aiProfileResult,
      serviceName,
      dbActionsUrl,
      user: createdUser,
      wallet: wallet.metadata,
    };
  } catch (err) {
    if (err.status) throw err;
    throw createHttpError(502, err.message || 'Lakehouse seed failed', {
      code: err.code,
      serviceName,
      dbActionsUrl,
      walletUploaded: Boolean(walletFile),
    });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

async function getLakehouseSchemaStatus({
  connectionString,
  password,
  walletDir,
  walletPassword,
  serviceNameOverride,
  dbActionsBaseUrl,
}) {
  const connectString = cleanText(connectionString);
  const pass = String(password || '');
  const serviceName = resolveServiceName(connectString, serviceNameOverride);
  const dbActionsUrl = serviceName
    ? resolveDbActionsUrl({
      serviceName,
      username: ADMIN_USERNAME,
      connectionString: connectString,
      dbActionsBaseUrl,
    })
    : null;
  const schemaDbActionsUrl = serviceName
    ? resolveDbActionsUrl({
      serviceName,
      username: LAKEHOUSE_SCHEMA_USERNAME,
      connectionString: connectString,
      dbActionsBaseUrl,
    })
    : null;

  let wallet;
  let connection;
  try {
    wallet = await resolveWallet({ walletDir, walletPassword });
    connection = await oracledb.getConnection({
      user: ADMIN_USERNAME,
      password: pass,
      connectString,
      ...wallet.connectionOptions,
    });

    await connection.ping();
    const userStatus = await fetchUserStatus(connection, LAKEHOUSE_SCHEMA_USERNAME);
    let seeded = false;
    let seedDetails = null;
    let aiProfile = null;
    let goldData = null;

    if (userStatus) {
      const scriptText = await fs.readFile(LAKEHOUSE_USER_SCRIPT, 'utf8');
      const schemaPassword = resolveLakehouseSchemaPassword({ adminPassword: pass, scriptText });
      let pgConnection;
      try {
        pgConnection = await oracledb.getConnection({
          user: LAKEHOUSE_SCHEMA_USERNAME,
          password: schemaPassword,
          connectString,
          ...wallet.connectionOptions,
        });

        const result = await pgConnection.execute(
          `SELECT COUNT(*) AS object_count
           FROM user_objects
           WHERE object_name IN ('SILVER_PRODUCTS', 'SILVER_ORDER_LINES', 'DIM_CUSTOMER')
             AND object_type IN ('TABLE', 'VIEW')`,
          {},
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const objectCount = Number(result.rows?.[0]?.OBJECT_COUNT || 0);
        seeded = objectCount >= 3;
        goldData = await fetchLakehouseGoldDataStatus(pgConnection);
        aiProfile = await fetchPgAiProfileStatus(
          pgConnection,
          firstNonEmpty(process.env.OCI_AI_PROFILE_NAME, process.env.PG_AI_PROFILE_NAME, PG_AI_DEFAULT_PROFILE_NAME)
        );
        if (aiProfile) {
          const { config } = resolvePgAiProfileConfig();
          aiProfile.networkAcl = await fetchPgAiNetworkAclStatus(connection, config.genAiEndpointHost);
          aiProfile.needsReconcile = Boolean(aiProfile.needsReconcile || !aiProfile.networkAcl?.granted);
        }
        seedDetails = { objectCount, requiredObjectCount: 3 };
      } catch (err) {
        if (!oracleErrorMatches(err, 1017) && !oracleErrorMatches(err, 28000)) {
          throw err;
        }
        seeded = false;
        seedDetails = {
          objectCount: 0,
          requiredObjectCount: 3,
          reason: 'schema_password_mismatch',
          code: err.code,
        };
        goldData = null;
      } finally {
        if (pgConnection) {
          try { await pgConnection.close(); } catch (_) { /* ignore close failures */ }
        }
      }
    }

    return {
      ok: true,
      connected: true,
      seeded,
      seedDetails,
      serviceName,
      dbActionsUrl,
      schemaDbActionsUrl,
      username: ADMIN_USERNAME,
      schema: LAKEHOUSE_SCHEMA_USERNAME,
      schemaPassword: resolveLakehouseSchemaPassword({ adminPassword: pass }),
      goldData,
      aiProfile,
      user: userStatus,
      wallet: wallet.metadata,
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

function getAutoLakehouseConfig() {
  if (String(process.env.ADB_AUTO_CONNECT || 'true').toLowerCase() === 'false') {
    return null;
  }

  const walletDir = cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_AUTO_WALLET_DIR;
  const connectionString = cleanText(process.env.ADB_CONNECTION_STRING)
    || cleanText(process.env.DBCONNECTION)
    || cleanText(process.env.ADB_SERVICE_NAME)
    || cleanText(process.env.SERVICE_NAME);
  const password = process.env.ADB_ADMIN_PASSWORD || process.env.DBPASSWORD || '';
  const walletPassword = process.env.ADB_WALLET_PASSWORD
    || process.env.ORACLE_WALLET_PASSWORD
    || '';
  const serviceNameOverride = cleanText(process.env.ADB_SERVICE_NAME) || cleanText(process.env.SERVICE_NAME);
  const dbActionsBaseUrl = cleanText(process.env.ADB_DB_ACTIONS_URL) || cleanText(process.env.ORDSURL);

  if (!walletDir || !connectionString || !password) {
    return null;
  }

  return {
    walletDir,
    walletPassword,
    connectionString,
    password,
    serviceNameOverride,
    dbActionsBaseUrl,
  };
}

async function ensureAutoLakehouseImpl() {
  const config = getAutoLakehouseConfig();
  if (!config) {
    return { ok: true, available: false, reason: 'not_configured' };
  }

  const wallet = await useWalletDirectory(config.walletDir);
  if (!wallet) {
    return { ok: true, available: false, reason: 'wallet_not_found' };
  }
  await wallet.cleanup();

  const status = await getLakehouseSchemaStatus(config);
  let seedResult = null;
  let aiProfileResult = null;
  let goldDataResult = null;
  if (!status.seeded) {
    seedResult = await seedLakehouseSchemaWithOptions(config);
  }

  let currentStatus = seedResult
    ? await getLakehouseSchemaStatus(config)
    : status;

  if (currentStatus.seeded && !currentStatus.goldData?.loaded) {
    goldDataResult = await loadLakehouseGoldDataFromConfig(config, currentStatus.schemaPassword);
    currentStatus = await getLakehouseSchemaStatus(config);
  }

  if (currentStatus.seeded && (!currentStatus.aiProfile?.enabled || currentStatus.aiProfile?.needsReconcile)) {
    aiProfileResult = await reconcilePgAiProfileForSeededSchema({
      ...config,
      schemaPassword: currentStatus.schemaPassword,
    });
    currentStatus = await getLakehouseSchemaStatus(config);
  }

  return {
    ok: true,
    available: true,
    connected: currentStatus.connected,
    seeded: currentStatus.seeded,
    seedResult,
    goldDataResult,
    aiProfileResult,
    connection: {
      id: AUTO_CONNECTION_ID,
      name: 'Server ADB Wallet',
      connectionString: config.connectionString,
      username: currentStatus.schema,
      serviceName: currentStatus.serviceName,
      dbActionsUrl: currentStatus.schemaDbActionsUrl || currentStatus.dbActionsUrl,
      adminUsername: currentStatus.username,
      adminDbActionsUrl: currentStatus.dbActionsUrl,
      database: {},
      wallet: currentStatus.wallet,
      autoManaged: true,
      validatedAt: new Date().toISOString(),
      seededAt: currentStatus.seeded ? new Date().toISOString() : null,
      seededStatementsExecuted: seedResult?.statementsExecuted || null,
      goldDataLoaded: currentStatus.goldData?.loaded || false,
      goldData: currentStatus.goldData,
      goldDataStatementsExecuted: goldDataResult?.statementsExecuted || null,
      aiProfile: currentStatus.aiProfile,
      schema: currentStatus.schema,
      schemaPassword: currentStatus.schemaPassword,
      schemaDbActionsUrl: currentStatus.schemaDbActionsUrl,
    },
  };
}

async function ensureAutoLakehouse() {
  if (autoLakehousePromise) return autoLakehousePromise;
  autoLakehousePromise = ensureAutoLakehouseImpl()
    .finally(() => {
      autoLakehousePromise = null;
    });
  return autoLakehousePromise;
}

function uploadWallet(req, res, next) {
  upload.fields(WALLET_FIELDS)(req, res, (err) => {
    if (!err) return next();
    return res.status(400).json({
      ok: false,
      error: err.message || 'Wallet upload failed',
    });
  });
}

router.get('/auto', async (req, res) => {
  try {
    const result = await ensureAutoLakehouse();
    return res.json(result);
  } catch (err) {
    const status = Number(err.status || err.statusCode || 500);
    return res.status(status).json({
      ok: false,
      available: true,
      connected: false,
      seeded: false,
      error: err.message,
      details: err.details || undefined,
    });
  }
});

router.post('/validate', uploadWallet, async (req, res) => {
  try {
    const result = await validateLakehouseConnection({
      connectionString: req.body?.connectionString,
      password: req.body?.password,
      walletFile: getWalletFile(req),
    });

    return res.json(result);
  } catch (err) {
    const status = Number(err.status || err.statusCode || 500);
    return res.status(status).json({
      ok: false,
      connected: false,
      error: err.message,
      details: err.details || undefined,
    });
  }
});

router.post('/seed', uploadWallet, async (req, res) => {
  try {
    const result = await seedLakehouseSchema({
      connectionString: req.body?.connectionString,
      password: req.body?.password,
      walletFile: getWalletFile(req),
    });

    return res.json(result);
  } catch (err) {
    const status = Number(err.status || err.statusCode || 500);
    return res.status(status).json({
      ok: false,
      seeded: false,
      error: err.message,
      details: err.details || undefined,
    });
  }
});

router._private = {
  buildDbActionsUrl,
  buildDbActionsUrlFromBase,
  cleanText,
  createPgAiProfile,
  ensureAutoLakehouse,
  applyCreateUserPassword,
  extractConnectHost,
  fetchLakehouseGoldDataStatus,
  fetchPgAiProfileStatus,
  fetchPgAiNetworkAclStatus,
  grantPgAiPrivileges,
  grantPgAiPrivilegesSafely,
  normalizePrivateKey,
  reconcilePgAiProfileForSeededSchema,
  resolveLakehouseSchemaPassword,
  resolvePgAiProfileConfig,
  extractServiceName,
  getAutoLakehouseConfig,
  getLakehouseSchemaStatus,
  loadLakehouseGoldData,
  normalizeDbActionsHost,
  parseSqlScript,
  readSqlScriptWithIncludes,
  seedLakehouseSchema,
  seedLakehouseSchemaWithOptions,
  validateLakehouseConnection,
};

module.exports = router;
