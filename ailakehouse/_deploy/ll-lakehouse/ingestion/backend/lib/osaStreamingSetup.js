const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const lakehouseRoutes = require('../routes/lakehouse');
const { oracledb } = require('../config/database');

const DEFAULT_WALLET_DIR = '/wallet';
const DEFAULT_OSA_HTTPS_PORT = '8085';
const DEFAULT_OSA_ADMIN_USER = 'osaadmin';
const DEFAULT_OSA_SPARK_STATUS_URL = 'http://ggsa:28080/json/';
const DEFAULT_SIGNAL_GENERATOR_URL = 'http://ggsa:18088';
const DEFAULT_KAFKA_CONNECTION_NAME = 'PeakGear_Kafka';
const DEFAULT_ADB_CONNECTION_NAME = 'PeakGear_ADB';
const DEFAULT_SOURCE_NAME = 'PeakGear_Demand_Signal_Stream';
const DEFAULT_TARGET_NAME = 'PeakGear_Bronze_Demand_Signals';
const DEFAULT_PIPELINE_NAME = 'PeakGear_Realtime_Demand_Pipeline';
const DEFAULT_TOPIC = 'peakgear.demand.signals.raw';
const DEFAULT_BOOTSTRAP = 'localhost:19092';
const DEFAULT_STREAM_SCHEMA_USER = 'PG';
const FIXED_SOURCE_ID = 'b7f9f50a-7bc1-426d-87c6-a9f968529901';
const FIXED_TARGET_ID = 'a3d11693-7d0a-4186-8454-4624bc3a6d6d';
const FIXED_APPLICATION_ID = '936bb550-3366-4f77-a8d4-b8f906f9b5d1';
const TARGET_BINDING_ALIAS = 'PEAKGEAR_DEMAND_SIGNAL_STREAM';
const TARGET_TABLE_NAME = 'BRONZE_DEMAND_SIGNALS';
const LEGACY_TARGET_NAMES = ['PeakGear_Silver_Demand_Signals'];

const STREAM_FIELDS = [
  ['signal_id', 'text'],
  ['observed_at', 'datetime_with_format'],
  ['source_system', 'text'],
  ['source_type', 'text'],
  ['platform', 'text'],
  ['region', 'text'],
  ['signal_text', 'text'],
  ['likes', 'number'],
  ['shares', 'number'],
  ['comments', 'number'],
  ['views', 'number'],
  ['sentiment_score', 'number'],
  ['criticality_score', 'number'],
  ['momentum_flag', 'text'],
  ['product_hints', 'text'],
  ['topic_tags', 'text'],
];

const TARGET_FIELDS = [
  ['SIGNAL_TEXT', 'text'],
  ['COMMENTS', 'bigint'],
  ['VIEWS', 'bigint'],
  ['SIGNAL_ID', 'text', false],
  ['SHARES', 'bigint'],
  ['CRITICALITY_SCORE', 'number'],
  ['SOURCE_TYPE', 'text'],
  ['PRODUCT_HINTS', 'text'],
  ['MOMENTUM_FLAG', 'text'],
  ['SENTIMENT_SCORE', 'number'],
  ['LIKES', 'bigint'],
  ['SOURCE_SYSTEM', 'text'],
  ['OBSERVED_AT', 'datetime_with_format'],
  ['CREATED_AT', 'datetime_with_format'],
  ['TOPIC_TAGS', 'text'],
  ['PLATFORM', 'text'],
  ['REGION', 'text'],
];

const TARGET_MAPPING = {
  SIGNAL_TEXT: 'signal_text',
  COMMENTS: 'comments',
  VIEWS: 'views',
  SIGNAL_ID: 'signal_id',
  SHARES: 'shares',
  CRITICALITY_SCORE: 'criticality_score',
  SOURCE_TYPE: 'source_type',
  PRODUCT_HINTS: 'product_hints',
  MOMENTUM_FLAG: 'momentum_flag',
  SENTIMENT_SCORE: 'sentiment_score',
  LIKES: 'likes',
  SOURCE_SYSTEM: 'source_system',
  OBSERVED_AT: 'observed_at',
  CREATED_AT: 'observed_at',
  TOPIC_TAGS: 'topic_tags',
  PLATFORM: 'platform',
  REGION: 'region',
};

const PIPELINE_PROPERTIES = {
  'kafka.intermediate.topic.retention.period': '3600000',
  'kafka.topic.offset': 'latest',
  'spark.driver.cores': '1',
  'spark.driver.memory': '768',
  'spark.executor.cores': '1',
  'spark.executor.instances': '1',
  'spark.executor.memory': '768',
  'draft.spark.driver.cores': '1',
  'draft.spark.driver.memory': '768m',
  'draft.spark.executor.cores': '1',
  'draft.spark.executor.instances': '1',
  'draft.spark.executor.memory': '768m',
  'spark.executor.startup.timeout': '120s',
  'spark.k8s.driver.cores': '1000',
  'spark.k8s.driver.memory': '800',
  'spark.k8s.executor.cores': '1000',
  'spark.k8s.executor.memory': '500',
  'spark.log.level': 'ERROR',
  'spark.streaming.batch.duration': '1000',
  'osa.hotdeploy.status.retryMax': '30',
  'osa.hotdeploy.status.retryInterval': '15000',
  'osa.spark.deploy.timeout': '180000',
  'osa.spark.deploy.pingPeriod': '2000',
  'osa.spark.undeploy.timeout': '120000',
  'osa.spark.ha.enabled': false,
  'kafka.intermediate.topic.enabled': true,
  'datastream.offset': true,
  'datastream.reset.offset': 'now',
  'datastream.lcrvalue': '',
  'datastream.timestamp': '',
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
  return String(value || '').trim();
}

function defaultOsaApiBaseUrl() {
  const port = cleanText(process.env.GGSA_OSA_HTTPS_PORT) || DEFAULT_OSA_HTTPS_PORT;
  return `https://ggsa:${port}/osa/services/v0.1`;
}

function enabled(value, defaultValue = true) {
  const text = cleanText(value).toLowerCase();
  if (!text) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(text);
}

function normalizeBaseUrl(value) {
  return cleanText(value || defaultOsaApiBaseUrl()).replace(/\/+$/, '');
}

function responseCookies(headers) {
  const setCookie = headers['set-cookie'];
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return values.map((value) => String(value).split(';')[0]).filter(Boolean).join('; ');
}

function rawRequest(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const agent = parsed.protocol === 'https:'
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
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
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          const err = new Error(`OSA API ${method} ${parsed.pathname} returned HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = responseBody;
          reject(err);
          return;
        }
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: responseBody });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`OSA API request timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseJson(body) {
  if (!body) return {};
  return JSON.parse(body);
}

function unwrapOsaData(response) {
  if (response && Object.prototype.hasOwnProperty.call(response, 'data')) {
    return response.data?.data || response.data;
  }
  return response;
}

function assertOsaSuccess(response, action) {
  if (response?.success === false) {
    throw new Error(`${action} failed: ${response.message || response.errorCode || 'OSA returned success=false'}`);
  }
  return response;
}

class OsaApi {
  constructor(config) {
    this.baseUrl = normalizeBaseUrl(config.apiBaseUrl);
    this.username = config.adminUser;
    this.password = config.adminPassword;
    this.timeoutMs = config.timeoutMs;
    this.cookie = '';
  }

  async login() {
    const body = JSON.stringify({ username: this.username, password: this.password });
    const response = await rawRequest(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      timeoutMs: this.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    this.cookie = responseCookies(response.headers);
  }

  async request(path, { method = 'GET', body = null, optional = false } = {}) {
    const payload = body == null ? null : JSON.stringify(body);
    try {
      const response = await rawRequest(`${this.baseUrl}/${path.replace(/^\/+/, '')}`, {
        method,
        timeoutMs: this.timeoutMs,
        headers: {
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
        body: payload,
      });
      return parseJson(response.body);
    } catch (err) {
      if (optional && (err.statusCode === 404 || err.statusCode === 500)) return null;
      throw err;
    }
  }

  get(path, options) {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path, body) {
    return this.request(path, { method: 'POST', body });
  }

  put(path, body) {
    return this.request(path, { method: 'PUT', body });
  }

  patch(path, body) {
    return this.request(path, { method: 'PATCH', body });
  }
}

async function hasWallet(walletDir) {
  try {
    const required = ['tnsnames.ora', 'sqlnet.ora', 'cwallet.sso'];
    const checks = await Promise.all(required.map(async (fileName) => {
      const stat = await fs.stat(`${walletDir}/${fileName}`);
      return stat.isFile() && stat.size > 0;
    }));
    return checks.every(Boolean);
  } catch {
    return false;
  }
}

function getSetupConfig() {
  const walletDir = cleanText(process.env.ADB_WALLET_DIR) || DEFAULT_WALLET_DIR;
  const connectString = cleanText(process.env.ADB_CONNECTION_STRING)
    || cleanText(process.env.DBCONNECTION)
    || cleanText(process.env.ADB_SERVICE_NAME)
    || cleanText(process.env.SERVICE_NAME);
  const adminPassword = process.env.ADB_ADMIN_PASSWORD || process.env.DBPASSWORD || '';

  return {
    enabled: enabled(process.env.OSA_AUTO_STREAMING_PIPELINE, true),
    walletDir,
    walletPassword: process.env.ADB_WALLET_PASSWORD
      || process.env.ORACLE_WALLET_PASSWORD
      || '',
    connectString,
    adminPassword,
    signalGeneratorUrl: normalizeBaseUrl(process.env.SIGNAL_GENERATOR_URL || DEFAULT_SIGNAL_GENERATOR_URL),
    streamSchemaUser: cleanText(process.env.ADB_STREAM_SCHEMA_USER) || DEFAULT_STREAM_SCHEMA_USER,
    streamSchemaPassword: process.env.ADB_STREAM_SCHEMA_PASSWORD
      || process.env.DBPASSWORD
      || process.env.ADB_ADMIN_PASSWORD
      || '',
    osa: {
      apiBaseUrl: normalizeBaseUrl(process.env.OSA_API_BASE_URL || process.env.GGSA_OSA_API_BASE_URL),
      adminUser: cleanText(process.env.OSA_ADMIN_USER) || DEFAULT_OSA_ADMIN_USER,
      adminPassword: process.env.OSA_ADMIN_PASSWORD || process.env.PASSWORD || '',
      timeoutMs: Number(process.env.OSA_SETUP_TIMEOUT_MS || 120000),
      kafkaConnectionName: cleanText(process.env.OSA_KAFKA_CONNECTION_NAME) || DEFAULT_KAFKA_CONNECTION_NAME,
      adbConnectionName: cleanText(process.env.OSA_ADB_CONNECTION_NAME) || DEFAULT_ADB_CONNECTION_NAME,
      sourceName: cleanText(process.env.OSA_STREAMING_SOURCE_NAME) || DEFAULT_SOURCE_NAME,
      targetName: cleanText(process.env.OSA_STREAMING_TARGET_NAME) || DEFAULT_TARGET_NAME,
      pipelineName: cleanText(process.env.OSA_STREAMING_PIPELINE_NAME) || DEFAULT_PIPELINE_NAME,
      topic: cleanText(process.env.SIGNAL_KAFKA_TOPIC) || DEFAULT_TOPIC,
      kafkaBootstrap: cleanText(process.env.OSA_KAFKA_BOOTSTRAP) || DEFAULT_BOOTSTRAP,
      sparkStatusUrl: cleanText(process.env.OSA_SPARK_STATUS_URL) || DEFAULT_OSA_SPARK_STATUS_URL,
    },
  };
}

async function useWalletDirectory(walletDir) {
  // The application mounts its wallet read-only.  Keep its original absolute
  // paths intact instead of creating a short-lived copy for every retry.
  return {
    dir: walletDir,
    cleanup: async () => {},
  };
}

async function tableExists(connection, owner, tableName) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS table_count
     FROM all_tables
     WHERE owner = :owner AND table_name = :tableName`,
    { owner, tableName },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return Number(result.rows?.[0]?.TABLE_COUNT || 0) > 0;
}

async function isTargetCompatible(connection, owner) {
  const result = await connection.execute(
    `SELECT column_name, data_type
     FROM all_tab_columns
     WHERE owner = :owner
       AND table_name = :tableName
       AND column_name IN ('OBSERVED_AT', 'SIGNAL_TEXT', 'PRODUCT_HINTS', 'TOPIC_TAGS')`,
    { owner: cleanText(owner).toUpperCase(), tableName: TARGET_TABLE_NAME },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const types = new Map((result.rows || []).map((row) => [row.COLUMN_NAME, row.DATA_TYPE]));
  return types.get('OBSERVED_AT') === 'TIMESTAMP(6)'
    && types.get('SIGNAL_TEXT') === 'VARCHAR2'
    && types.get('PRODUCT_HINTS') === 'VARCHAR2'
    && types.get('TOPIC_TAGS') === 'VARCHAR2';
}

async function ensureBronzeStreamingTable(connection) {
  const ddlStatements = [
    `CREATE TABLE bronze_demand_signals (
       signal_id         VARCHAR2(80) PRIMARY KEY,
       observed_at       TIMESTAMP,
       source_system     VARCHAR2(80),
       source_type       VARCHAR2(50),
       platform          VARCHAR2(80),
       region            VARCHAR2(50),
       signal_text       VARCHAR2(4000),
       likes             NUMBER(12),
       shares            NUMBER(12),
       comments          NUMBER(12),
       views             NUMBER(14),
       sentiment_score   NUMBER(6,3),
       criticality_score NUMBER(6,2),
       momentum_flag     VARCHAR2(30),
       product_hints     VARCHAR2(4000),
       topic_tags        VARCHAR2(4000),
       created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
     )`,
    `CREATE INDEX idx_bronze_demand_region ON bronze_demand_signals (region)`,
    `CREATE INDEX idx_bronze_demand_score ON bronze_demand_signals (criticality_score DESC)`,
    `CREATE INDEX idx_bronze_demand_momentum ON bronze_demand_signals (momentum_flag)`,
  ];

  for (const statement of ddlStatements) {
    try {
      await connection.execute(statement);
    } catch (err) {
      if (err.errorNum !== 955 && err.code !== 'ORA-00955') throw err;
    }
  }
}

async function ensureStreamingLakehouseObjects(config) {
  let connection;
  let wallet;
  try {
    wallet = await useWalletDirectory(config.walletDir);
    connection = await oracledb.getConnection({
      user: config.streamSchemaUser,
      password: config.streamSchemaPassword,
      connectString: config.connectString,
      configDir: wallet.dir,
      ...(config.walletPassword ? { walletLocation: wallet.dir, walletPassword: config.walletPassword } : {}),
    });

    await ensureBronzeStreamingTable(connection);

    const pgReady = await tableExists(connection, config.streamSchemaUser.toUpperCase(), TARGET_TABLE_NAME);
    if (!pgReady) {
      throw new Error(`${config.streamSchemaUser}.${TARGET_TABLE_NAME} is not available yet`);
    }

    if (!(await isTargetCompatible(connection, config.streamSchemaUser))) {
      throw new Error(`${config.streamSchemaUser}.${TARGET_TABLE_NAME} is not compatible with the OSA target shape`);
    }
    return { ok: true };
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
    if (wallet) {
      await wallet.cleanup();
    }
  }
}

function metadata(name, displayName, description) {
  return {
    displayName,
    name,
    description,
    attachedTagNames: [],
  };
}

function topLevelMetadata(payload, name, displayName, description) {
  return {
    ...payload,
    metadata: metadata(name, displayName, description),
    description,
    displayName,
    attachedTagNames: [],
    wname: name,
  };
}

function producedShape() {
  return {
    id: '',
    displayName: 'PeakGear Demand Signal Event',
    eventTimestampFieldName: 'observed_at',
    fields: STREAM_FIELDS.map(([id, typeId]) => ({
      id,
      typeId,
      path: id,
      properties: {},
      nullable: false,
      primaryKey: false,
      name: id,
    })),
    attachment: '',
  };
}

function consumedShape() {
  return {
    id: '',
    displayName: TARGET_TABLE_NAME,
    fields: TARGET_FIELDS.map(([id, typeId, nullable = true]) => ({
      id,
      typeId,
      properties: {},
      nullable,
      primaryKey: false,
      name: id,
    })),
    attachment: `${TARGET_TABLE_NAME},SIGNAL_ID:SIGNAL_ID:SIGNAL_ID,SIGNAL_TEXT:varchar:true::4000,COMMENTS:bigint:true:,VIEWS:bigint:true:,SIGNAL_ID:varchar:false::80,SHARES:bigint:true:,CRITICALITY_SCORE:decimal:true::6:2:HALF_DOWN,SOURCE_TYPE:varchar:true::50,PRODUCT_HINTS:varchar:true::4000,MOMENTUM_FLAG:varchar:true::30,SENTIMENT_SCORE:decimal:true::6:3:HALF_DOWN,LIKES:bigint:true:,SOURCE_SYSTEM:varchar:true::80,OBSERVED_AT:timestamp:true::yyyy-MM-dd'T'HH:mm:ss'.'SSS:UTC,CREATED_AT:timestamp:true:SYSTIMESTAMP\n:yyyy-MM-dd'T'HH:mm:ss'.'SSS:UTC,TOPIC_TAGS:varchar:true::4000,PLATFORM:varchar:true::80,REGION:varchar:true::50`,
  };
}

function sourcePayload(config, kafkaConnectionId, existingId = '') {
  const name = config.sourceName;
  return topLevelMetadata({
    id: existingId || FIXED_SOURCE_ID,
    typeName: 'KafkaSource',
    beginningIndexType: 'earliest',
    parameters: {
      connectionId: kafkaConnectionId,
      contentType: 'JSON',
      lenient: 'true',
      multiLine: 'false',
      topicName: config.topic,
    },
    invalid: false,
    entityType: 'stream',
    producedShape: producedShape(),
    isWindowable: true,
  }, name, 'PeakGear Demand Signal Stream', 'Kafka stream of live PeakGear demand signal events.');
}

function targetPayload(config, adbConnectionId, existingId = '') {
  const name = config.targetName;
  return topLevelMetadata({
    id: existingId || FIXED_TARGET_ID,
    typeName: 'JdbcTarget',
    parameters: {
      connectionId: adbConnectionId,
      isVectorInsert: false,
    },
    invalid: false,
    entityType: 'target',
    consumedShape: consumedShape(),
  }, name, 'PeakGear Bronze Demand Signals', 'Bronze ADB target table for source-shaped live demand signals loaded from OSA.');
}

function sourceStage(config, sourceId, appId, stageId) {
  const sourceAlias = `S${sourceId}`;
  const outputChannelName = `sx_${config.pipelineName}_PeakGear_Demand_Signal_Stream_public`;
  return {
    type: 'SOURCE',
    id: stageId,
    metadata: metadata(config.sourceName, 'PeakGear Demand Signal Stream', ''),
    mode: 'NORMAL',
    errors: [],
    fields: STREAM_FIELDS.map(([id, typeId]) => ({
      id,
      alias: id,
      typeId,
      properties: {},
      nullable: false,
      primaryKey: false,
      fieldClass: 'SOURCE',
      operand: {
        fieldClass: 'SOURCE',
        fieldId: id,
        sourceAlias,
      },
      removedBySystem: false,
      removedByUser: false,
      preserved: false,
    })),
    config: {
      type: 'SOURCE',
      entityType: 'stream',
      sources: [{
        alias: sourceAlias,
        sourceId,
        type: 'EXTERNAL',
        displayName: 'PeakGear Demand Signal Stream',
        wname: config.sourceName,
        isWindowable: false,
        windowProfile: 'NONE',
        entityProfile: 'STREAM',
      }],
    },
    disabled: false,
    uiConfig: {
      table: { numberOfEvents: 100 },
      charts: [{ type: 'LINEAR' }, { type: 'SCATTER' }],
      view: { type: 'TABS' },
    },
    outputChannel: `/osa/services/events/${appId}?topic=${outputChannelName}`,
    outputChannelName,
    parents: [],
    leaf: false,
    parentCandidates: [],
    anchorId: '',
    icon: 'SOURCE_STREAM',
    sourceTypeName: 'KafkaSource',
    shapeIn: { fields: [] },
    deletedFields: {},
  };
}

function targetStage(config, targetId, appId, stageId, sourceStageId) {
  const outputChannelName = `sx_${config.pipelineName}_Write_to_Bronze_Demand_Signals_public`;
  const sourceShape = STREAM_FIELDS.map(([id, typeId]) => ({
    id,
    typeId,
    properties: {},
    nullable: false,
    primaryKey: false,
    name: id,
  }));

  return {
    type: 'TARGET',
    id: stageId,
    metadata: metadata('Write_to_Bronze_Demand_Signals', 'Write to Bronze Demand Signals', ''),
    mode: 'NORMAL',
    errors: [],
    fields: TARGET_FIELDS.map(([id, typeId]) => ({
      id,
      alias: id,
      typeId,
      properties: {},
      nullable: false,
      primaryKey: false,
      fieldClass: 'INTERNAL',
      operand: {
        fieldClass: 'INTERNAL',
        sourceAlias: targetId,
        fieldId: id,
      },
      removedBySystem: false,
      removedByUser: false,
      preserved: false,
    })),
    bindings: {
      sourceBindings: {
        [TARGET_BINDING_ALIAS]: {
          sourceId: sourceStageId,
          bounded: STREAM_FIELDS.map(([id]) => ({ [id]: 3 })),
          unBounded: [],
        },
      },
      outputAliasMap: Object.fromEntries(TARGET_FIELDS.map(([id]) => [id, id])),
      localChanges: [],
    },
    deletedFields: {},
    config: {
      type: 'TARGET',
      targetId,
      mapping: TARGET_MAPPING,
      sources: [{
        alias: TARGET_BINDING_ALIAS,
        sourceId: sourceStageId,
        window: { id: 'unspecified' },
        type: 'INTERNAL',
        displayName: 'PeakGear Demand Signal Stream',
        isWindowable: true,
      }],
    },
    disabled: false,
    uiConfig: { table: { numberOfEvents: 100 } },
    outputChannel: `/osa/services/events/${appId}?topic=${outputChannelName}`,
    outputChannelName,
    parents: [sourceStageId],
    leaf: true,
    parentCandidates: [],
    icon: 'TARGET',
    status: '',
    shapeIn: { id: '', displayName: '', fields: sourceShape },
  };
}

function applicationPayload(config, sourceId, targetId, existing = null) {
  const id = existing?.id || null;
  const existingSourceStage = (existing?.stages || []).find((stage) => stage.type === 'SOURCE');
  const existingTargetStage = (existing?.stages || []).find((stage) => stage.type === 'TARGET');
  const sourceStageId = existingSourceStage?.id || crypto.randomUUID();
  const targetStageId = existingTargetStage?.id || crypto.randomUUID();
  const payload = topLevelMetadata({
    id,
    typeName: 'APPLICATION',
    invalid: false,
    entityType: 'application',
    clientVersion: Number(existing?.clientVersion || 0) + 1,
    type: 'APPLICATION',
    activeStageId: targetStageId,
    errors: [],
    stages: [
      sourceStage(config, sourceId, id, sourceStageId),
      targetStage(config, targetId, id, targetStageId, sourceStageId),
    ],
    isWindowable: true,
  }, config.pipelineName, 'PeakGear Realtime Demand Pipeline', 'Streams PeakGear Kafka demand signals into the AI Lakehouse ADB target.');

  if (existing?.originalVersion) payload.originalVersion = existing.originalVersion;
  return payload;
}

async function findByName(api, path, expectedName) {
  const response = await api.get(path);
  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows.find((item) => [item.wname, item.name, item.displayName, item.metadata?.name, item.metadata?.displayName]
    .filter(Boolean)
    .includes(expectedName)) || null;
}

async function findCatalogEntity(api, expectedName, expectedEntityType) {
  const response = await api.get('catalog/entities?offset=0&limit=100');
  const rows = Array.isArray(response?.data?.list) ? response.data.list : [];
  return rows.find((item) => item.entityType === expectedEntityType
    && [item.wname, item.displayName].includes(expectedName)) || null;
}

async function ensureKafkaTopic(config) {
  const response = await rawRequest(`${config.signalGeneratorUrl}/topic`, {
    method: 'POST',
    timeoutMs: config.osa.timeoutMs,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const payload = parseJson(response.body);
  if (payload?.ok === false) {
    throw new Error(`Kafka topic ${config.osa.topic} preparation failed`);
  }
  return payload;
}

async function ensureKafkaConnection(api, config) {
  const existing = await findByName(api, 'connections/type/KafkaConnection', config.kafkaConnectionName);
  if (existing?.id) return existing;

  const payload = topLevelMetadata({
    id: null,
    typeName: 'KafkaConnection',
    parameters: {
      usebootstrap: true,
      bootstrapserver: config.kafkaBootstrap,
      zookeeper: '',
      securityType: [],
    },
  }, config.kafkaConnectionName, 'PeakGear Kafka', 'Kafka connection for PeakGear live demand signal demo.');

  const response = await api.post('connections', payload);
  return response?.data || payload;
}

async function getRequiredAdbConnection(api, config) {
  const existing = await findByName(api, 'connections/type/DatabaseConnection', config.adbConnectionName);
  if (!existing?.id) {
    throw new Error(`OSA ADB connection ${config.adbConnectionName} is not available yet`);
  }
  return existing;
}

async function ensureSource(api, config, kafkaConnectionId) {
  const existing = await findByName(api, 'sources', config.sourceName);
  const payload = sourcePayload(config, kafkaConnectionId, existing?.id);
  const response = existing?.id
    ? await api.put(`sources/${existing.id}`, payload)
    : await api.post('sources', payload);
  assertOsaSuccess(response, `OSA source ${config.sourceName} update`);
  return unwrapOsaData(response) || existing || payload;
}

async function ensureTarget(api, config, adbConnectionId) {
  const existing = await findByName(api, 'targets', config.targetName)
    || (await Promise.all(LEGACY_TARGET_NAMES.map((name) => findByName(api, 'targets', name))))
      .find(Boolean);

  const payload = targetPayload(config, adbConnectionId, existing?.id);
  const response = existing?.id
    ? await api.put(`targets/${existing.id}`, payload)
    : await api.post('targets', payload);
  assertOsaSuccess(response, `OSA target ${config.targetName} update`);
  return unwrapOsaData(response) || existing || payload;
}

async function unpublishExistingApplication(api, config) {
  const existing = await getExistingApplication(api, config);

  if (existing?.isPublished) {
    const response = await api.patch(`applications/${existing.id}`, { published: false });
    assertOsaSuccess(response, `OSA application ${config.pipelineName} unpublish`);
    await delay(Number(process.env.OSA_STREAMING_UNPUBLISH_SETTLE_MS || 10000));
  }

  return existing;
}

async function getApplicationCatalogEntity(api, config) {
  const entity = await findCatalogEntity(api, config.pipelineName, 'application');
  return entity;
}

async function getExistingApplication(api, config) {
  const entity = await getApplicationCatalogEntity(api, config);
  const existingId = entity?.name || FIXED_APPLICATION_ID;
  const existingResponse = await api.get(`applications/${existingId}`, { optional: true });
  const application = existingResponse?.data || null;
  if (application && entity) application.catalog = entity;
  return application;
}

function applicationMatchesDesired(application, sourceId, targetId) {
  if (!application) return false;

  const source = (application.stages || []).find((stage) => stage.type === 'SOURCE');
  const target = (application.stages || []).find((stage) => stage.type === 'TARGET');
  const sourceConfig = source?.config?.sources?.[0] || {};
  const targetConfig = target?.config || {};
  const targetSource = targetConfig.sources?.[0] || {};
  const mapping = targetConfig.mapping || {};

  return source?.id
    && target?.id
    && sourceConfig.sourceId === sourceId
    && targetConfig.targetId === targetId
    && targetSource.sourceId === source.id
    && target?.metadata?.displayName === 'Write to Bronze Demand Signals'
    && Object.entries(TARGET_MAPPING).every(([targetField, sourceField]) => mapping[targetField] === sourceField);
}

async function fetchSparkStatus(config) {
  if (!config.sparkStatusUrl) return null;
  try {
    const response = await rawRequest(config.sparkStatusUrl, {
      timeoutMs: Math.min(config.timeoutMs || 15000, 15000),
    });
    return parseJson(response.body);
  } catch {
    return null;
  }
}

async function sparkApplicationIsRunning(config, applicationId) {
  const status = await fetchSparkStatus(config);
  const activeApps = Array.isArray(status?.activeapps) ? status.activeapps : [];
  const normalizedId = cleanText(applicationId).replace(/-/g, '_');

  return activeApps.some((app) => {
    const name = cleanText(app?.name);
    const state = cleanText(app?.state).toUpperCase();
    return state === 'RUNNING'
      && name.includes(normalizedId)
      && name.endsWith('_public');
  });
}

async function confirmApplicationPublished(api, config, applicationId, action) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await api.get(`applications/${applicationId}`, { optional: true });
    const application = response?.data || null;
    const entity = await findCatalogEntity(api, application?.wname || application?.metadata?.name || applicationId, 'application');
    if (application?.isPublished === true
      && (entity?.running === true || await sparkApplicationIsRunning(config, applicationId))) {
      if (entity) application.catalog = entity;
      return application;
    }
    await delay(3000);
  }

  throw new Error(`${action} did not start ${applicationId}`);
}

async function ensureApplication(api, config, sourceId, targetId, existing = null) {
  existing = existing || (await getExistingApplication(api, config));

  if (existing) {
    let updated = existing;
    if (!applicationMatchesDesired(existing, sourceId, targetId)) {
      const payload = applicationPayload(config, sourceId, targetId, existing);
      const updatedResponse = await api.put(`applications/${existing.id}`, payload);
      assertOsaSuccess(updatedResponse, `OSA application ${config.pipelineName} update`);
      updated = unwrapOsaData(updatedResponse) || payload;
    }

    const propertiesResponse = await api.put(`applications/${existing.id}/properties`, PIPELINE_PROPERTIES);
    assertOsaSuccess(propertiesResponse, `OSA application ${config.pipelineName} properties update`);

    const publishResponse = await api.patch(`applications/${existing.id}`, { published: true });
    assertOsaSuccess(publishResponse, `OSA application ${config.pipelineName} publish`);
    const published = await confirmApplicationPublished(api, config, existing.id, `OSA application ${config.pipelineName} publish`)
      || unwrapOsaData(publishResponse)
      || updated;
    return {
      application: published,
      created: false,
      published: published?.isPublished === true,
      reused: true,
    };
  }

  const payload = applicationPayload(config, sourceId, targetId, existing);
  const response = await api.post('applications', payload);
  assertOsaSuccess(response, `OSA application ${config.pipelineName} create`);
  const application = unwrapOsaData(response) || payload;
  const applicationId = application.id || payload.id;

  const propertiesResponse = await api.put(`applications/${applicationId}/properties`, PIPELINE_PROPERTIES);
  assertOsaSuccess(propertiesResponse, `OSA application ${config.pipelineName} properties update`);
  const publishResponse = await api.patch(`applications/${applicationId}`, { published: true });
  assertOsaSuccess(publishResponse, `OSA application ${config.pipelineName} publish`);
  const published = await confirmApplicationPublished(api, config, applicationId, `OSA application ${config.pipelineName} publish`)
    || unwrapOsaData(publishResponse)
    || application;

  return {
    application: { ...published, id: applicationId },
    created: !existing,
    published: published?.isPublished === true,
  };
}

async function ensureOsaStreamingPipeline(config) {
  const api = new OsaApi(config.osa);
  await api.login();

  const kafkaConnection = await ensureKafkaConnection(api, config.osa);
  const adbConnection = await getRequiredAdbConnection(api, config.osa);

  const existingSource = await findByName(api, 'sources', config.osa.sourceName);
  const existingTarget = await findByName(api, 'targets', config.osa.targetName);
  const existingApplication = await getExistingApplication(api, config.osa);
  if (existingApplication?.isPublished === true
    && existingSource?.id
    && existingTarget?.id
    && applicationMatchesDesired(existingApplication, existingSource.id, existingTarget.id)) {
    return {
      ok: true,
      kafkaConnectionId: kafkaConnection.id,
      adbConnectionId: adbConnection.id,
      sourceId: existingSource.id,
      targetId: existingTarget.id,
      applicationId: existingApplication.id,
      published: true,
      reused: true,
    };
  }

  if (existingApplication?.isPublished) {
    await unpublishExistingApplication(api, config.osa);
  }

  const source = await ensureSource(api, config.osa, kafkaConnection.id);
  const target = await ensureTarget(api, config.osa, adbConnection.id);
  const application = await ensureApplication(api, config.osa, source.id, target.id, existingApplication);

  return {
    ok: true,
    kafkaConnectionId: kafkaConnection.id,
    adbConnectionId: adbConnection.id,
    sourceId: source.id,
    targetId: target.id,
    applicationId: application.application.id,
    published: application.published,
  };
}

async function runOsaStreamingDeploymentSetup({ logger = console } = {}) {
  const config = getSetupConfig();
  if (!config.enabled) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }
  if (!config.connectString || !config.adminPassword || !config.streamSchemaPassword || !config.osa.adminPassword) {
    return { ok: true, skipped: true, reason: 'not_configured' };
  }
  if (!(await hasWallet(config.walletDir))) {
    return { ok: true, skipped: true, reason: 'wallet_not_found' };
  }

  const lakehouse = await lakehouseRoutes._private.ensureAutoLakehouse();
  if (!lakehouse.available || !lakehouse.seeded) {
    throw new Error(`AI Lakehouse is not seeded yet (${lakehouse.reason || 'seed_incomplete'})`);
  }

  await ensureStreamingLakehouseObjects(config);
  await ensureKafkaTopic(config);
  const osa = await ensureOsaStreamingPipeline(config);
  logger.log(`[startup] OSA streaming pipeline ready (${osa.applicationId})`);
  return { ok: true, lakehouse, osa };
}

function scheduleOsaStreamingDeploymentSetup({ logger = console } = {}) {
  const config = getSetupConfig();
  if (!config.enabled) return;

  const maxAttempts = Number(process.env.OSA_STREAMING_SETUP_MAX_ATTEMPTS || 60);
  const intervalMs = Number(process.env.OSA_STREAMING_SETUP_INTERVAL_MS || 15000);
  const initialDelayMs = Number(process.env.OSA_STREAMING_SETUP_INITIAL_DELAY_MS || 5000);
  const runId = crypto.randomUUID();
  let attempt = 0;

  const run = async () => {
    attempt += 1;
    try {
      const result = await runOsaStreamingDeploymentSetup({ logger });
      if (result.skipped) {
        logger.log(`[startup] OSA streaming setup skipped: ${result.reason}`);
      }
    } catch (err) {
      if (attempt < maxAttempts) {
        logger.warn(`[startup] OSA streaming setup attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
        setTimeout(run, intervalMs).unref();
        return;
      }
      logger.error(`[startup] OSA streaming setup failed after ${maxAttempts} attempts (${runId}): ${err.message}`);
    }
  };

  setTimeout(run, initialDelayMs).unref();
}

module.exports = {
  ensureOsaStreamingPipeline,
  ensureStreamingLakehouseObjects,
  runOsaStreamingDeploymentSetup,
  scheduleOsaStreamingDeploymentSetup,
};
