const db = require('../config/database');
const ollamaAssistant = require('./ollamaAssistant');

const DEFAULT_APP_SCHEMA = 'PG';
const DEFAULT_PROFILE_NAME = 'PG_GENAI_PROFILE';
const DEFAULT_CREDENTIAL_NAME = 'PG_OCI_GENAI_CRED';
const DEFAULT_MODEL = 'cohere.command-a-03-2025';
const DEFAULT_EMBEDDING_MODEL = 'cohere.embed-v4.0';
const DEFAULT_FALLBACK_MODELS = [];
const STATUS_CACHE_TTL_MS = 2 * 60 * 1000;

let statusCache = {
  expiresAt: 0,
  value: null,
  promise: null,
  promiseVerify: false,
};

function cleanText(value) {
  if (Array.isArray(value)) return cleanText(value[0]);
  return String(value || '').trim();
}

function firstNonEmpty(...values) {
  return values.map(cleanText).find(Boolean) || '';
}

function envFlagEnabled(name, defaultValue = true) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || rawValue === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(rawValue).trim().toLowerCase());
}

function normalizePrivateKey(value) {
  return cleanText(value).replace(/\\n/g, '\n');
}

function normalizeRuntimeName(value, fallback) {
  return firstNonEmpty(value, fallback).toUpperCase();
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueList(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function resolveSelectAiConfig() {
  const autoSetupEnabled = envFlagEnabled(
    'APP_AI_PROFILE_AUTO_SETUP',
    envFlagEnabled('PG_AI_PROFILE_AUTO_SETUP', true)
  );
  const user = normalizeRuntimeName(process.env.ORACLE_USER, DEFAULT_APP_SCHEMA);
  const profileName = normalizeRuntimeName(
    firstNonEmpty(process.env.APP_AI_PROFILE_NAME, process.env.SELECT_AI_PROFILE_NAME, process.env.OCI_AI_PROFILE_NAME),
    DEFAULT_PROFILE_NAME
  );
  const credentialName = normalizeRuntimeName(
    firstNonEmpty(process.env.APP_AI_CREDENTIAL_NAME, process.env.SELECT_AI_CREDENTIAL_NAME, process.env.OCI_GENAI_CREDENTIAL_NAME),
    DEFAULT_CREDENTIAL_NAME
  );
  const region = firstNonEmpty(process.env.OCI_REGION, process.env.AI_ENDPOINT_REGION, process.env.REGION_IDENTIFIER);

  return {
    enabledByConfig: autoSetupEnabled,
    profileName,
    credentialName,
    user,
    provider: 'OCI GenAI',
    model: firstNonEmpty(process.env.OCI_GENAI_MODEL, DEFAULT_MODEL),
    embeddingModel: firstNonEmpty(process.env.OCI_GENAI_EMBEDDING_MODEL, DEFAULT_EMBEDDING_MODEL),
    fallbackModels: uniqueList([
      ...splitCsv(process.env.SELECT_AI_FALLBACK_MODELS),
      ...DEFAULT_FALLBACK_MODELS,
    ]),
    region,
    compartmentId: firstNonEmpty(process.env.OCI_COMPARTMENT_ID, process.env.COMPARTMENT_OCID),
    userOcid: firstNonEmpty(process.env.OCI_USER_OCID, process.env.USER_OCID, process.env.user),
    tenancyOcid: firstNonEmpty(process.env.OCI_TENANCY_OCID, process.env.TENANCY_OCID, process.env.tenancy),
    fingerprint: firstNonEmpty(process.env.OCI_FINGERPRINT, process.env.PEM_KEY_FINGERPRINT, process.env.fingerprint),
    privateKey: normalizePrivateKey(firstNonEmpty(process.env.OCI_PRIVATE_KEY, process.env.PEM_SINGLE_LINE, process.env.PEM_KEY)),
  };
}

function getModelCandidates(config) {
  return uniqueList([config.model, ...(config.fallbackModels || [])]);
}

function getMissingProfileConfig(config) {
  return ['region', 'compartmentId', 'userOcid', 'tenancyOcid', 'fingerprint', 'privateKey']
    .filter((field) => !config[field]);
}

function buildUnavailableStatus(reason, details = {}) {
  const config = resolveSelectAiConfig();
  return {
    available: false,
    connected: false,
    reason,
    profileName: config.profileName,
    user: config.user,
    model: config.model,
    provider: config.provider,
    runtime: 'ollama',
    ...details,
  };
}

async function withAppConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    return await callback(connection, resolveSelectAiConfig());
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function readLobValue(value) {
  if (value && typeof value.getData === 'function') {
    return value.getData();
  }
  return value;
}

function stripCodeFences(text) {
  const value = String(text || '').trim();
  const fenced = value.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || value).trim();
}

function sanitizeGeneratedSql(sql) {
  let value = stripCodeFences(sql)
    .replace(/^SQL\s*(?:Query|Statement)?\s*:\s*/i, '')
    .trim();
  const statementStart = value.match(/\b(WITH|SELECT)\b/i);
  if (statementStart && statementStart.index > 0) {
    value = value.slice(statementStart.index).trim();
  }
  return value.replace(/;+\s*$/g, '').trim();
}

function validateGeneratedSql(sql, schemaName = DEFAULT_APP_SCHEMA) {
  const normalized = sanitizeGeneratedSql(sql);
  if (!normalized) {
    return { ok: false, reason: 'No SQL generated.' };
  }
  if (!/^(SELECT|WITH)\b/i.test(normalized)) {
    return { ok: false, reason: 'Only SELECT or WITH statements are allowed.' };
  }
  if (/[;]|\-\-|\/\*|\*\//.test(normalized)) {
    return { ok: false, reason: 'Comments and multiple statements are not allowed.' };
  }
  if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CREATE|DECLARE|BEGIN|COMMIT|ROLLBACK|CALL|EXECUTE)\b/i.test(normalized)) {
    return { ok: false, reason: 'Write operations and PL/SQL are not allowed.' };
  }
  if (/\b(DBMS_|UTL_|SYS\.|DBA_|ALL_|USER_|V\$)\b/i.test(normalized)) {
    return { ok: false, reason: 'System packages and metadata views are not allowed.' };
  }

  const schema = cleanText(schemaName).toUpperCase();
  const fromJoinRegex = /\b(?:from|join)\s+((?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z][A-Za-z0-9_$#]*))?)/gi;
  let match;
  while ((match = fromJoinRegex.exec(normalized)) !== null) {
    const identifier = match[1].replace(/\s+/g, '');
    const parts = identifier.split('.');
    if (parts.length > 1) {
      const owner = parts[0].replace(/"/g, '').toUpperCase();
      if (owner && owner !== schema) {
        return { ok: false, reason: `Query referenced unsupported schema: ${owner}` };
      }
    }
  }

  return { ok: true, sql: normalized };
}

async function generateWithDbmsCloudAi(connection, { prompt, profileName, action }) {
  const result = await connection.execute(
    `SELECT DBMS_CLOUD_AI.GENERATE(
              prompt       => :prompt,
              profile_name => :profileName,
              action       => :action
            ) AS response
     FROM dual`,
    {
      prompt,
      profileName,
      action,
    },
    {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { RESPONSE: { type: db.oracledb.STRING } },
    }
  );
  return cleanText(await readLobValue(result.rows?.[0]?.RESPONSE));
}

async function fetchAvailablePackages(connection) {
  const result = await connection.execute(
    `SELECT object_name
     FROM all_objects
     WHERE owner IN ('SYS', 'C##CLOUD$SERVICE')
       AND object_type = 'PACKAGE'
       AND object_name IN ('DBMS_CLOUD', 'DBMS_CLOUD_AI')`,
    {},
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );
  return new Set((result.rows || []).map((row) => String(row.OBJECT_NAME || '').toUpperCase()));
}

async function fetchProfileStatus(connection, config) {
  const profileResult = await connection.execute(
    `SELECT profile_name, status
     FROM user_cloud_ai_profiles
     WHERE profile_name = :profileName`,
    { profileName: config.profileName },
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );
  const profileRow = profileResult.rows?.[0];
  if (!profileRow) return null;

  const attributeResult = await connection.execute(
    `SELECT attribute_name, attribute_value
     FROM user_cloud_ai_profile_attributes
     WHERE profile_name = :profileName
       AND attribute_name IN ('model', 'embedding_model', 'region', 'object_list')`,
    { profileName: config.profileName },
    {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { ATTRIBUTE_VALUE: { type: db.oracledb.STRING } },
    }
  );
  const attributes = {};
  for (const row of attributeResult.rows || []) {
    attributes[String(row.ATTRIBUTE_NAME || '').toLowerCase()] = cleanText(row.ATTRIBUTE_VALUE);
  }

  const model = attributes.model || '';
  const embeddingModel = attributes.embedding_model || '';
  const region = attributes.region || '';
  const enabled = String(profileRow.STATUS || '').toUpperCase() === 'ENABLED';
  const objectListMatches = objectListMatchesSchema(attributes.object_list, config.user);
  const needsReconcile = Boolean(
    !enabled
      || (config.model && model !== config.model)
      || (config.embeddingModel && embeddingModel !== config.embeddingModel)
      || (config.region && region !== config.region)
      || !objectListMatches
  );

  return {
    available: enabled && !needsReconcile,
    connected: enabled && !needsReconcile,
    profileName: profileRow.PROFILE_NAME,
    status: profileRow.STATUS,
    user: config.user,
    provider: config.provider,
    runtime: enabled && !needsReconcile ? 'select_ai' : 'ollama',
    model: model || config.model,
    embeddingModel: embeddingModel || config.embeddingModel,
    region: region || config.region,
    attributes,
    objectListMatches,
    needsReconcile,
  };
}

async function createOrReplaceProfile(connection, config) {
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
    object_list: [{ owner: config.user }],
  });

  await connection.execute(
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

  await connection.execute(
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
}

async function verifyProfileConnection(connection, config) {
  const response = await generateWithDbmsCloudAi(connection, {
    prompt: 'Reply with the single word CONNECTED and no other text.',
    profileName: config.profileName,
    action: 'chat',
  });
  return /CONNECTED/i.test(response);
}

async function ensureRuntimeStatus(connection, config, { verify = false } = {}) {
  if (!config.enabledByConfig) {
    return buildUnavailableStatus('disabled');
  }

  const packages = await fetchAvailablePackages(connection);
  const missingPackages = ['DBMS_CLOUD', 'DBMS_CLOUD_AI'].filter((name) => !packages.has(name));
  if (missingPackages.length) {
    return buildUnavailableStatus('missing_database_packages', { missingPackages });
  }

  const missingConfig = getMissingProfileConfig(config);
  if (missingConfig.length) {
    return buildUnavailableStatus('missing_config', { missing: missingConfig });
  }

  const errors = [];
  for (const model of getModelCandidates(config)) {
    const candidateConfig = { ...config, model };
    try {
      let status = await fetchProfileStatus(connection, candidateConfig);
      if (!status || status.needsReconcile) {
        await createOrReplaceProfile(connection, candidateConfig);
        status = await fetchProfileStatus(connection, candidateConfig);
      }

      if (!status?.available) {
        errors.push({ model, reason: 'profile_not_enabled', status });
        continue;
      }

      if (!verify) {
        return {
          ...status,
          available: true,
          connected: true,
          runtime: 'select_ai',
          verified: false,
          credentialName: config.credentialName,
          configuredModel: config.model,
        };
      }

      const verified = await verifyProfileConnection(connection, candidateConfig);
      if (!verified) {
        await createOrReplaceProfile(connection, candidateConfig);
        const retryVerified = await verifyProfileConnection(connection, candidateConfig);
        if (!retryVerified) {
          errors.push({ model, reason: 'profile_health_check_failed' });
          continue;
        }
        status = await fetchProfileStatus(connection, candidateConfig);
      }

      return {
        ...status,
        available: true,
        connected: true,
        runtime: 'select_ai',
        verified: true,
        verifiedAt: new Date().toISOString(),
        credentialName: config.credentialName,
        configuredModel: config.model,
      };
    } catch (err) {
      errors.push({
        model,
        reason: 'profile_health_check_failed',
        error: err.message,
        code: err.code,
        errorNum: err.errorNum,
      });
    }
  }

  const lastError = errors[errors.length - 1] || {};
  return buildUnavailableStatus('profile_health_check_failed', {
    error: lastError.error,
    code: lastError.code,
    errorNum: lastError.errorNum,
    profileName: config.profileName,
    attemptedModels: errors,
  });
}

async function fetchRuntimeStatus({ force = false, verify = false } = {}) {
  const now = Date.now();
  if (!force && statusCache.value && statusCache.expiresAt > now && (!verify || statusCache.value.verified)) {
    return statusCache.value;
  }
  if (!force && statusCache.promise && (!verify || statusCache.promiseVerify)) {
    return statusCache.promise;
  }

  statusCache.promiseVerify = verify;
  statusCache.promise = (async () => {
    try {
      return await withAppConnection((connection, config) =>
        ensureRuntimeStatus(connection, config, { verify })
      );
    } catch (err) {
      return buildUnavailableStatus('connection_failed', {
        error: err.message,
        code: err.code,
        errorNum: err.errorNum,
      });
    }
  })();

  try {
    const status = await statusCache.promise;
    statusCache = { expiresAt: Date.now() + STATUS_CACHE_TTL_MS, value: status, promise: null, promiseVerify: false };
    return status;
  } catch (err) {
    statusCache = { expiresAt: 0, value: null, promise: null, promiseVerify: false };
    throw err;
  }
}

function selectAiProfileToCatalogEntry(status) {
  return {
    name: status.profileName,
    status: 'ENABLED',
    model: status.model || DEFAULT_MODEL,
    provider: 'OCI GenAI',
    type: 'Oracle Select AI',
    description: `DBMS_CLOUD_AI profile for ${status.user || DEFAULT_APP_SCHEMA}`,
    runtime: 'select_ai',
    runtimeLabel: 'Oracle Select AI',
  };
}

async function getAvailableProfiles() {
  const status = await fetchRuntimeStatus({ verify: true });
  if (status.available) {
    return {
      profiles: [selectAiProfileToCatalogEntry(status)],
      activeProfile: status.profileName,
      runtime: status,
    };
  }

  return {
    profiles: ollamaAssistant.getAvailableSelectAiProfiles().map((profile) => ({
      ...profile,
      runtime: 'ollama',
      runtimeLabel: 'Ollama + Oracle SQL',
    })),
    activeProfile: ollamaAssistant.DEFAULT_PROFILE,
    runtime: status,
  };
}

function isSelectAiAvailableStatus(status) {
  return Boolean(status?.available && status.connected && status.profileName);
}

async function executeGeneratedSql(connection, sql, { maxRows = 200, schemaName = DEFAULT_APP_SCHEMA } = {}) {
  const validation = validateGeneratedSql(sql, schemaName);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.isUserQueryError = true;
    error.sql = sanitizeGeneratedSql(sql);
    throw error;
  }

  const result = await connection.execute(validation.sql, {}, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    maxRows,
  });

  const rows = [];
  for (const row of result.rows || []) {
    const processedRow = {};
    for (const [key, value] of Object.entries(row)) {
      processedRow[key] = await readLobValue(value);
    }
    rows.push(processedRow);
  }

  return {
    columns: (result.metaData || []).map((column) => column.name),
    rows,
    rowCount: rows.length,
    sql: validation.sql,
  };
}

async function runSelectAiQuestion(question, { mode = 'narrate', showSql = true, maxRows = 200 } = {}) {
  const status = await fetchRuntimeStatus({ verify: true });
  if (!isSelectAiAvailableStatus(status)) {
    return null;
  }

  return withAppConnection(async (connection, config) => {
    if (mode === 'chat') {
      const answer = await generateWithDbmsCloudAi(connection, {
        prompt: question,
        profileName: config.profileName,
        action: 'chat',
      });
      return {
        answer,
        sql: null,
        profile: config.profileName,
        model: status.model || config.model,
        runtime: 'select_ai',
        runtimeLabel: 'Oracle Select AI',
        provider: 'OCI GenAI',
      };
    }

    const generatedSql = await generateWithDbmsCloudAi(connection, {
      prompt: question,
      profileName: config.profileName,
      action: 'showsql',
    });
    const validation = validateGeneratedSql(generatedSql, config.user);
    if (!validation.ok) {
      const error = new Error(validation.reason);
      error.isUserQueryError = true;
      error.sql = sanitizeGeneratedSql(generatedSql);
      error.profile = config.profileName;
      error.model = status.model || config.model;
      throw error;
    }

    if (mode === 'showsql') {
      return {
        sql: validation.sql,
        profile: config.profileName,
        model: status.model || config.model,
        runtime: 'select_ai',
        runtimeLabel: 'Oracle Select AI',
        provider: 'OCI GenAI',
      };
    }

    if (mode === 'runsql') {
      const result = await executeGeneratedSql(connection, validation.sql, {
        maxRows,
        schemaName: config.user,
      });
      return {
        ...result,
        profile: config.profileName,
        model: status.model || config.model,
        runtime: 'select_ai',
        runtimeLabel: 'Oracle Select AI',
        provider: 'OCI GenAI',
      };
    }

    const answer = await generateWithDbmsCloudAi(connection, {
      prompt: question,
      profileName: config.profileName,
      action: 'narrate',
    });
    return {
      answer,
      sql: showSql ? validation.sql : null,
      profile: config.profileName,
      model: status.model || config.model,
      runtime: 'select_ai',
      runtimeLabel: 'Oracle Select AI',
      provider: 'OCI GenAI',
    };
  });
}

module.exports = {
  fetchRuntimeStatus,
  getAvailableProfiles,
  runSelectAiQuestion,
  validateGeneratedSql,
};
