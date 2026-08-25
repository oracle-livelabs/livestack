const db = require('../config/database');
const {
  RESTRICTED_DEMO_USER,
  getRequestIdentity,
} = require('./requestIdentityContext');
const {
  isPhysicalLifecycleStatusKey,
  sanitizePublicLifecyclePayload,
  sanitizePublicLifecycleText,
} = require('./serviceLifecycle');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_PROFILE = 'SC_LLAMA_PROFILE';
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_TABLES = [
  'SLED_PUBLIC_PROGRAMS_V',
  'SLED_PUBLIC_SERVICES_V',
  'SLED_RESIDENT_SIGNALS_V',
  'SLED_SIGNAL_SOURCES_V',
  'SLED_SERVICE_REQUESTS_V',
  'SLED_SERVICE_REQUEST_LINES_V',
  'SLED_RESIDENTS_V',
  'SLED_SERVICE_ACCESS_CENTERS_V',
  'SLED_SERVICE_CAPACITY_V',
  'SLED_SERVICE_TASK_ROUTES_V',
  'SLED_OPERATIONS_DASHBOARD_V',
];
const ALLOWED_TABLE_SET = new Set(ALLOWED_TABLES);
const SLED_SCHEMA_OBJECT_METADATA = Object.freeze([
  {
    name: 'SLED_PUBLIC_PROGRAMS_V',
    domain: 'Programs',
    label: 'Public Programs',
    description: 'Public-sector programs and service lines exposed over the governed program catalog.',
    exampleQuestions: ['Which public programs carry the highest service value exposure?'],
  },
  {
    name: 'SLED_PUBLIC_SERVICES_V',
    domain: 'Services',
    label: 'Public Services',
    description: 'Public services, permits, benefits, inspections, and agency service categories.',
    exampleQuestions: ['Which public services have the highest current request demand?'],
  },
  {
    name: 'SLED_RESIDENT_SIGNALS_V',
    domain: 'Resident Signals',
    label: 'Resident Demand Signals',
    description: 'Resident, community, and agency signals with urgency, reach, sentiment, and source context.',
    exampleQuestions: ['Which resident signals have critical urgency this week?'],
  },
  {
    name: 'SLED_SIGNAL_SOURCES_V',
    domain: 'Resident Signals',
    label: 'Signal Sources',
    description: 'Community partners, agencies, service advocates, and resident signal sources.',
    exampleQuestions: ['Which signal sources have the highest community reach?'],
  },
  {
    name: 'SLED_SERVICE_REQUESTS_V',
    domain: 'Service Requests',
    label: 'Service Requests',
    description: 'Constituent service requests with status, SLA-adjacent timestamps, location, urgency, and signal attribution.',
    exampleQuestions: ['Which service requests are still open and signal-driven?'],
  },
  {
    name: 'SLED_SERVICE_REQUEST_LINES_V',
    domain: 'Service Requests',
    label: 'Service Request Lines',
    description: 'Line-level requested services and service value exposure for each case or request.',
    exampleQuestions: ['Which requested services drive the most line-level service value?'],
  },
  {
    name: 'SLED_RESIDENTS_V',
    domain: 'Residents',
    label: 'Residents',
    description: 'Synthetic resident profiles used for benefits eligibility, case management, service access, and privacy-safe demo analysis.',
    exampleQuestions: ['Which resident access tiers have the highest request volume?'],
  },
  {
    name: 'SLED_SERVICE_ACCESS_CENTERS_V',
    domain: 'Service Access',
    label: 'Service Access Centers',
    description: 'Public service hubs, counters, access centers, public works depots, and partner service points.',
    exampleQuestions: ['Which service access centers have the highest utilization?'],
  },
  {
    name: 'SLED_SERVICE_CAPACITY_V',
    domain: 'Capacity',
    label: 'Service Capacity',
    description: 'Available, reserved, incoming, and minimum capacity thresholds for public services and service centers.',
    exampleQuestions: ['Which public services have available capacity below the minimum threshold?'],
  },
  {
    name: 'SLED_SERVICE_TASK_ROUTES_V',
    domain: 'Field Response',
    label: 'Service Task Routes',
    description: 'Service task routing, field response status, public works dispatch, and completion records.',
    exampleQuestions: ['Which service task routes are still active or delayed?'],
  },
  {
    name: 'SLED_OPERATIONS_DASHBOARD_V',
    domain: 'Operations',
    label: 'Operations Dashboard',
    description: 'Dashboard-ready view combining service requests, residents, services, programs, access centers, and resident signals.',
    exampleQuestions: ['Which service categories combine high urgency and high request volume?'],
  },
]);
const PROFILE_CATALOG = Object.freeze({
  [DEFAULT_PROFILE]: Object.freeze({
    name: DEFAULT_PROFILE,
    status: 'ENABLED',
    model: OLLAMA_MODEL,
    provider: 'Ollama',
    type: 'Local SQL + reasoning',
    description: 'Primary local Ollama model for Ask State and Local Government Data.',
  }),
});
const PROFILE_ALIASES = new Map();
[
  [
    DEFAULT_PROFILE,
    [
      DEFAULT_PROFILE,
      'SC_COHERE_PROFILE',
      'SC_EMBED_PROFILE',
      'SC_GROK42_PROFILE',
      'SC_VISION_PROFILE',
      'OLLAMA_LLAMA32',
      'OLLAMA_LLAMA32_PROFILE',
      OLLAMA_MODEL,
    ],
  ],
].forEach(([profileName, aliases]) => {
  aliases.forEach((alias) => {
    const normalized = String(alias || '').trim().toUpperCase();
    if (normalized) PROFILE_ALIASES.set(normalized, profileName);
  });
});
const RELATIONSHIP_HINTS = [
  'SLED_SERVICE_REQUESTS_V.RESIDENT_ID joins to SLED_RESIDENTS_V.RESIDENT_ID.',
  'SLED_SERVICE_REQUESTS_V.RESIDENT_SIGNAL_ID joins to SLED_RESIDENT_SIGNALS_V.RESIDENT_SIGNAL_ID.',
  'SLED_SERVICE_REQUESTS_V.SERVICE_ACCESS_CENTER_ID joins to SLED_SERVICE_ACCESS_CENTERS_V.SERVICE_ACCESS_CENTER_ID.',
  'SLED_SERVICE_REQUEST_LINES_V.SERVICE_REQUEST_ID joins to SLED_SERVICE_REQUESTS_V.SERVICE_REQUEST_ID.',
  'SLED_SERVICE_REQUEST_LINES_V.SERVICE_ID joins to SLED_PUBLIC_SERVICES_V.SERVICE_ID.',
  'SLED_PUBLIC_SERVICES_V.PROGRAM_ID joins to SLED_PUBLIC_PROGRAMS_V.PROGRAM_ID.',
  'SLED_SERVICE_CAPACITY_V.SERVICE_ID joins to SLED_PUBLIC_SERVICES_V.SERVICE_ID.',
  'SLED_SERVICE_CAPACITY_V.SERVICE_ACCESS_CENTER_ID joins to SLED_SERVICE_ACCESS_CENTERS_V.SERVICE_ACCESS_CENTER_ID.',
  'SLED_SERVICE_TASK_ROUTES_V.SERVICE_REQUEST_ID joins to SLED_SERVICE_REQUESTS_V.SERVICE_REQUEST_ID.',
  'SLED_SERVICE_TASK_ROUTES_V.SERVICE_ACCESS_CENTER_ID joins to SLED_SERVICE_ACCESS_CENTERS_V.SERVICE_ACCESS_CENTER_ID.',
  'SLED_OPERATIONS_DASHBOARD_V is a denormalized view for request, resident, service, program, signal, and access-center questions.',
  'When using aggregates, every non-aggregated expression in SELECT must also appear in GROUP BY.',
];
const ORACLE_ONLY_SYNTAX_RULES = [
  { regex: /\bJSON_AGG\s*\(/i, reason: 'Use JSON_ARRAYAGG instead of JSON_AGG.' },
  { regex: /\bSTRING_AGG\s*\(/i, reason: 'Use LISTAGG instead of STRING_AGG.' },
  { regex: /\bILIKE\b/i, reason: 'Use UPPER(...) LIKE UPPER(...) instead of ILIKE.' },
  { regex: /\bDATE_TRUNC\s*\(/i, reason: 'Use TRUNC(date_expr, ...) instead of DATE_TRUNC.' },
  { regex: /::/, reason: 'Use CAST(expr AS type) instead of PostgreSQL :: casts.' },
  { regex: /->>|->/i, reason: 'Use JSON_VALUE or JSON_QUERY instead of PostgreSQL JSON operators.' },
];

let schemaCache = {
  expiresAt: 0,
  grouped: {},
  tableComments: {},
};
const entityCaches = new Map();

function normalizeProfile(profile) {
  if (!profile || !String(profile).trim()) return DEFAULT_PROFILE;
  const normalized = String(profile).trim().toUpperCase();
  return PROFILE_ALIASES.get(normalized) || DEFAULT_PROFILE;
}

function getAvailableProfiles() {
  return [PROFILE_CATALOG[DEFAULT_PROFILE]];
}

function getAvailableSelectAiProfiles() {
  return Object.values(PROFILE_CATALOG);
}

function getProfileConfig(profile) {
  return PROFILE_CATALOG[normalizeProfile(profile)] || PROFILE_CATALOG[DEFAULT_PROFILE];
}

function getProfileModel(profile) {
  return getProfileConfig(profile).model;
}

function getSledSchemaObjectMetadata() {
  return SLED_SCHEMA_OBJECT_METADATA.map((object) => ({
    ...object,
    object_name: object.name,
    objectName: object.name,
    object_type: 'view',
    display_name: object.label,
    description: object.description,
    example_questions: object.exampleQuestions || [],
    is_queryable_by_assistant: true,
  }));
}

function groupSledSchemaObjectMetadata(objects = getSledSchemaObjectMetadata()) {
  const grouped = objects.reduce((groups, object) => {
    const domain = object.domain || 'Other';
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(object);
    return groups;
  }, {});
  return Object.entries(grouped).map(([domain, groupObjects]) => ({
    domain,
    objects: groupObjects.sort((left, right) =>
      String(left.display_name || left.label || left.object_name).localeCompare(String(right.display_name || right.label || right.object_name))
    ),
    object_count: groupObjects.length,
  }));
}

function isAssistantQueryableObject(objectName) {
  const normalized = String(objectName || '').trim().toUpperCase();
  return ALLOWED_TABLE_SET.has(normalized);
}

function getOllamaRuntimeConfig(profile = DEFAULT_PROFILE) {
  return {
    host: OLLAMA_BASE_URL,
    model: getProfileModel(profile),
    profile: normalizeProfile(profile),
  };
}

function createAskDataError(category, cause = null, options = {}) {
  const messageByCategory = {
    REQUEST_TIMEOUT: 'The request took too long. Try a narrower State and Local Government operations question.',
    SQL_VALIDATION_BLOCKED: 'The generated SQL was blocked because it did not meet the State and Local Government read-only query policy.',
    ORACLE_EXECUTION_FAILED: 'Oracle could not execute the generated State and Local Government operations query.',
    OLLAMA_UNAVAILABLE: 'The local language model runtime is not available.',
  };
  const error = new Error(options.userMessage || messageByCategory[category] || 'Ask Data request failed.');
  error.category = category;
  error.statusCode = options.statusCode || 500;
  error.developerMessage = options.developerMessage || cause?.message || error.message;
  error.sql = options.sql || cause?.sql || null;
  error.profile = options.profile || cause?.profile || DEFAULT_PROFILE;
  error.model = options.model || cause?.model || getProfileModel(error.profile);
  error.oracleError = options.oracleError || cause?.oracleError || null;
  return error;
}

function normalizeAskDataError(err) {
  if (err?.category) return err;
  if (err?.isUserQueryError) {
    return createAskDataError('SQL_VALIDATION_BLOCKED', err, {
      statusCode: 400,
      userMessage: err.message,
      sql: err.sql,
      profile: err.profile,
      oracleError: err.oracleError,
    });
  }
  return createAskDataError('ORACLE_EXECUTION_FAILED', err, {
    statusCode: err?.statusCode || 500,
    userMessage: err?.message,
    sql: err?.sql,
    profile: err?.profile,
    oracleError: err?.oracleError,
  });
}

async function checkAskSledDataHealth({ demoUser = null, profile = DEFAULT_PROFILE } = {}) {
  const runtime = getOllamaRuntimeConfig(profile);
  try {
    const result = await db.executeAsUser(`
      SELECT
        (SELECT COUNT(*) FROM sled_service_requests_v) AS service_requests,
        (SELECT COUNT(*) FROM sled_resident_signals_v) AS resident_signals,
        (SELECT COUNT(*) FROM sled_operations_dashboard_v) AS dashboard_rows
      FROM dual
    `, {}, demoUser);
    const row = result.rows?.[0] || {};
    return {
      status: 'healthy',
      profile: runtime.profile,
      model: runtime.model,
      semanticViews: SLED_SCHEMA_OBJECT_METADATA.length,
      counts: {
        serviceRequests: row.SERVICE_REQUESTS || 0,
        residentSignals: row.RESIDENT_SIGNALS || 0,
        dashboardRows: row.DASHBOARD_ROWS || 0,
      },
    };
  } catch (err) {
    return {
      status: 'degraded',
      profile: runtime.profile,
      model: runtime.model,
      semanticViews: SLED_SCHEMA_OBJECT_METADATA.length,
      warning: getShortErrorMessage(err),
    };
  }
}

function getShortErrorMessage(error) {
  return String(error?.message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || 'Unknown Oracle error';
}

function getOracleErrorCode(error) {
  const match = getShortErrorMessage(error).match(/\bORA-\d{5}\b/);
  return match ? match[0] : null;
}

function isRetryableOracleSqlError(error) {
  return /\bORA-(009\d{2}|017\d{2}|018\d{2}|030\d{2}|30482)\b/i.test(
    getShortErrorMessage(error)
  );
}

function withSqlContext(error, { sql = null, profile = DEFAULT_PROFILE, oracleError = null } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  if (sql) error.sql = sql;
  error.profile = resolvedProfile;
  error.model = getProfileModel(resolvedProfile);
  error.oracleError = getShortErrorMessage({ message: oracleError || error?.message });
  return error;
}

function buildUserFacingSqlError(error, { sql = null, profile = DEFAULT_PROFILE, oracleError = null } = {}) {
  const shortOracleError = getShortErrorMessage({ message: oracleError || error?.message });
  const code = getOracleErrorCode({ message: shortOracleError });
  const friendlyMessage = [
    'Unable to generate a valid Oracle SQL query for that question.',
    'Try rephrasing with a more specific metric, time window, or entity.',
    code ? `Oracle reported ${code}.` : null,
  ].filter(Boolean).join(' ');

  return withSqlContext(new Error(friendlyMessage), {
    sql,
    profile,
    oracleError: shortOracleError,
  });
}

function createUserQueryError(message, extra = {}) {
  const error = new Error(message);
  error.isUserQueryError = true;
  Object.assign(error, extra);
  return error;
}

function normalizeEntityText(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '');
}

function cleanEntityCandidate(text) {
  return String(text || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+(?:in|for|with|by|from|during|over|on|within|across)\b.*$/i, '')
    .trim();
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceFirstOccurrence(text, searchValue, replacement) {
  if (!searchValue) return text;
  return String(text).replace(new RegExp(escapeRegExp(searchValue)), replacement);
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const dp = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function similarityScore(left, right) {
  const a = normalizeEntityText(left);
  const b = normalizeEntityText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / Math.max(a.length, b.length));
}

function entityCacheIdentity(demoUser) {
  return String(demoUser || getRequestIdentity().username || RESTRICTED_DEMO_USER).trim();
}

async function loadEntityCatalog(demoUser = null) {
  const username = entityCacheIdentity(demoUser);
  const cached = entityCaches.get(username);
  if (cached && Date.now() < cached.expiresAt && Object.keys(cached.catalogs).length > 0) {
    return cached;
  }

  const [brandsResult, productsResult, centersResult, customersResult, influencersResult] = await Promise.all([
    db.executeAsUser(`SELECT brand_name AS value FROM brands ORDER BY brand_name`, {}, username),
    db.executeAsUser(`SELECT product_name AS value FROM products ORDER BY product_name`, {}, username),
    db.executeAsUser(`SELECT center_name AS value FROM fulfillment_centers ORDER BY center_name`, {}, username),
    db.executeAsUser(`
      SELECT TRIM(first_name || ' ' || last_name) AS value FROM customers
      UNION
      SELECT email AS value FROM customers
    `, {}, username),
    db.executeAsUser(`
      SELECT handle AS value FROM influencers
      UNION
      SELECT display_name AS value FROM influencers
    `, {}, username),
  ]);

  const buildCatalog = (rows, type) =>
    (rows || [])
      .map((row) => String(row.VALUE || '').trim())
      .filter(Boolean)
      .map((value) => ({ value, normalized: normalizeEntityText(value), type }));

  const entityCache = {
    expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
    catalogs: {
      brand: buildCatalog(brandsResult.rows, 'brand'),
      product: buildCatalog(productsResult.rows, 'product'),
      center: buildCatalog(centersResult.rows, 'center'),
      customer: buildCatalog(customersResult.rows, 'customer'),
      influencer: buildCatalog(influencersResult.rows, 'influencer'),
    },
  };

  entityCaches.set(username, entityCache);

  return entityCache;
}

function findExactEntityMatch(catalog = [], rawValue) {
  const normalized = normalizeEntityText(rawValue);
  if (!normalized) return null;
  return catalog.find((entry) => entry.normalized === normalized) || null;
}

function rankEntityMatches(catalog = [], rawValue, limit = 3) {
  const normalized = normalizeEntityText(rawValue);
  if (!normalized) return [];
  return catalog
    .map((entry) => ({
      ...entry,
      score: similarityScore(normalized, entry.normalized),
    }))
    .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value))
    .slice(0, limit)
    .filter((entry) => entry.score >= 0.35);
}

function formatEntityList(entries = []) {
  return entries.map((entry) => entry.value).join(', ');
}

function buildUnsupportedRetailerError(candidate, brandSuggestions = []) {
  const suggestionText = brandSuggestions.length
    ? ` Try a known brand such as ${formatEntityList(brandSuggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't map "${candidate}" to this demo schema. This app does not model retailers or storefronts. Ask about public programs, public services, residents, service access centers, or community partners instead.${suggestionText}`
  );
}

function buildUnknownEntityError(candidate, entityType, suggestions = []) {
  const suggestionText = suggestions.length
    ? ` Closest ${entityType} matches: ${formatEntityList(suggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't find a ${entityType} named "${candidate}" in this demo schema.${suggestionText}`
  );
}

async function resolveQuestionEntities(question, { demoUser = null } = {}) {
  const originalQuestion = String(question || '').trim();
  const { catalogs } = await loadEntityCatalog(demoUser);
  let resolvedQuestion = originalQuestion;
  const resolutionHints = [];

  const retailerPatterns = [
    /\b(?:sold|available|stocked|carried)\s+at\s+(.+?)(?=$|[?.!,])/i,
    /\b(?:retailer|store|storefront)\s+(?:named|called\s+)?["']?(.+?)["']?(?=$|[?.!,])/i,
  ];

  for (const regex of retailerPatterns) {
    const match = originalQuestion.match(regex);
    if (!match) continue;
    const candidate = cleanEntityCandidate(match[1]);
    if (!candidate) continue;

    const supportedMatch = [
      findExactEntityMatch(catalogs.brand, candidate),
      findExactEntityMatch(catalogs.product, candidate),
      findExactEntityMatch(catalogs.center, candidate),
      findExactEntityMatch(catalogs.customer, candidate),
      findExactEntityMatch(catalogs.influencer, candidate),
    ].find(Boolean);

    if (!supportedMatch) {
      throw buildUnsupportedRetailerError(candidate, rankEntityMatches(catalogs.brand, candidate, 3));
    }
  }

  const explicitEntityPatterns = [
    { type: 'brand', regexes: [/\bbrand\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'product', regexes: [/\bproduct\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'center', regexes: [/\b(?:fulfillment\s+center|warehouse|center)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'customer', regexes: [/\bcustomer\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'influencer', regexes: [/\binfluencer\s+(?:named|called)\s+@?["']?(.+?)["']?(?=$|[?.!,])/i] },
  ];

  for (const entry of explicitEntityPatterns) {
    for (const regex of entry.regexes) {
      const match = originalQuestion.match(regex);
      if (!match) continue;
      const candidate = cleanEntityCandidate(match[1]);
      if (!candidate) continue;

      const exact = findExactEntityMatch(catalogs[entry.type], candidate);
      if (exact) {
        if (exact.value !== candidate) {
          resolvedQuestion = replaceFirstOccurrence(resolvedQuestion, candidate, exact.value);
          resolutionHints.push(`Entity resolution: treat "${candidate}" as ${entry.type} "${exact.value}".`);
        }
        break;
      }

      throw buildUnknownEntityError(candidate, entry.type, rankEntityMatches(catalogs[entry.type], candidate, 3));
    }
  }

  const quotedPattern = /["']([^"']{2,})["']/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(originalQuestion)) !== null) {
    const candidate = cleanEntityCandidate(quotedMatch[1]);
    if (!candidate) continue;

    const exactMatch =
      findExactEntityMatch(catalogs.brand, candidate)
      || findExactEntityMatch(catalogs.product, candidate)
      || findExactEntityMatch(catalogs.center, candidate)
      || findExactEntityMatch(catalogs.customer, candidate)
      || findExactEntityMatch(catalogs.influencer, candidate);

    if (!exactMatch) continue;

    if (exactMatch.value !== candidate) {
      resolvedQuestion = replaceFirstOccurrence(resolvedQuestion, candidate, exactMatch.value);
      resolutionHints.push(`Entity resolution: treat "${candidate}" as ${exactMatch.type} "${exactMatch.value}".`);
    }
  }

  return {
    question: resolvedQuestion,
    resolutionHints,
  };
}

function stripCodeFences(text) {
  return String(text || '')
    .replace(/^```(?:json|sql)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonResponse(text) {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Ollama returned invalid JSON');
  }
}

async function ollamaGenerate(prompt, { format = null, temperature = 0.1, numPredict = 192, profile = DEFAULT_PROFILE } = {}) {
  const { model } = getProfileConfig(profile);
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: format || undefined,
      prompt,
      options: {
        temperature,
        num_predict: numPredict,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  return stripCodeFences(payload?.response || '');
}

async function ollamaJson(systemPrompt, userPrompt, { profile = DEFAULT_PROFILE, temperature = 0.05, numPredict = 360 } = {}) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature, numPredict, profile }
  );
  return parseJsonResponse(text);
}

async function ollamaText(systemPrompt, userPrompt, { temperature = 0.2, profile = DEFAULT_PROFILE } = {}) {
  return ollamaGenerate(`${systemPrompt}\n\n${userPrompt}`, {
    temperature,
    numPredict: 220,
    profile,
  });
}

async function loadSchemaMetadata() {
  if (Date.now() < schemaCache.expiresAt && Object.keys(schemaCache.grouped).length > 0) {
    return schemaCache;
  }

  const binds = {};
  const placeholders = ALLOWED_TABLES.map((tableName, index) => {
    const key = `t${index}`;
    binds[key] = tableName;
    return `:${key}`;
  }).join(', ');

  const [tablesResult, columnsResult] = await Promise.all([
    db.execute(
      `SELECT table_name, comments
       FROM user_tab_comments
       WHERE table_name IN (${placeholders})
       ORDER BY table_name`,
      binds
    ),
    db.execute(
      `SELECT utc.table_name,
              utc.column_id,
              utc.column_name,
              utc.data_type,
              NVL(ucc.comments, '') AS column_comment
       FROM user_tab_columns utc
       LEFT JOIN user_col_comments ucc
         ON ucc.table_name = utc.table_name
        AND ucc.column_name = utc.column_name
       WHERE utc.table_name IN (${placeholders})
       ORDER BY utc.table_name, utc.column_id`,
      binds
    ),
  ]);

  const tableComments = Object.fromEntries(
    (tablesResult.rows || []).map((row) => [row.TABLE_NAME, row.COMMENTS || ''])
  );

  const grouped = {};
  for (const row of columnsResult.rows || []) {
    if (isPhysicalLifecycleStatusKey(row.COLUMN_NAME)) continue;
    if (!grouped[row.TABLE_NAME]) grouped[row.TABLE_NAME] = [];
    grouped[row.TABLE_NAME].push(
      row.COLUMN_COMMENT
        ? `${row.COLUMN_NAME} ${row.DATA_TYPE} (${row.COLUMN_COMMENT})`
        : `${row.COLUMN_NAME} ${row.DATA_TYPE}`
    );
  }

  const tableLines = ALLOWED_TABLES
    .filter((tableName) => grouped[tableName]?.length)
    .map((tableName) => {
      const comment = tableComments[tableName] ? ` -- ${tableComments[tableName]}` : '';
      return `${tableName}${comment}\n  ${grouped[tableName].join(', ')}`;
    });

  schemaCache = {
    grouped,
    tableComments,
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
  };

  return schemaCache;
}

function selectRelevantTables(question) {
  const q = String(question || '').toLowerCase();
  const selected = new Set();

  if (/(signal|resident demand|community|source|sentiment|urgency|critical|priority|transparency|audit|records)/.test(q)) {
    ['SLED_RESIDENT_SIGNALS_V', 'SLED_SIGNAL_SOURCES_V', 'SLED_SERVICE_REQUESTS_V', 'SLED_RESIDENTS_V'].forEach((tableName) => selected.add(tableName));
  }

  if (/(capacity|access|center|hub|counter|public works|transportation|field|route|dispatch|emergency|response|region|demand)/.test(q)) {
    ['SLED_SERVICE_ACCESS_CENTERS_V', 'SLED_SERVICE_CAPACITY_V', 'SLED_SERVICE_TASK_ROUTES_V', 'SLED_PUBLIC_SERVICES_V', 'SLED_OPERATIONS_DASHBOARD_V'].forEach((tableName) => selected.add(tableName));
  }

  if (/(service request|case|permit|licens|benefits|eligibility|inspection|code enforcement|program|agency|backlog|sla|service-level|value|category|total|average|fraud|waste|abuse|policy|compliance)/.test(q)) {
    ['SLED_SERVICE_REQUESTS_V', 'SLED_SERVICE_REQUEST_LINES_V', 'SLED_PUBLIC_SERVICES_V', 'SLED_PUBLIC_PROGRAMS_V', 'SLED_OPERATIONS_DASHBOARD_V'].forEach((tableName) => selected.add(tableName));
  }

  if (/(resident|constituent|person|household|tier|city|state)/.test(q)) {
    ['SLED_RESIDENTS_V', 'SLED_SERVICE_REQUESTS_V', 'SLED_OPERATIONS_DASHBOARD_V'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    ALLOWED_TABLES.forEach((tableName) => selected.add(tableName));
  }

  return [...selected];
}

async function getSchemaContext(question = '') {
  const metadata = await loadSchemaMetadata();
  const selectedTables = selectRelevantTables(question);

  const tableLines = selectedTables
    .filter((tableName) => metadata.grouped[tableName]?.length)
    .map((tableName) => {
      const comment = metadata.tableComments[tableName] ? ` -- ${metadata.tableComments[tableName]}` : '';
      return `${tableName}${comment}\n  ${metadata.grouped[tableName].join(', ')}`;
    });

  return [
    'Available Oracle semantic views for Ask State and Local Government Data:',
    tableLines.join('\n'),
    'Key joins and semantics:',
    ...RELATIONSHIP_HINTS
      .filter((hint) => selectedTables.some((tableName) => hint.includes(tableName)))
      .map((hint) => `- ${hint}`),
    '- Use only the listed State and Local Government semantic views in generated SQL.',
    '- Treat "open", "pending", "backlog", and "unresolved" service requests as request_status not in completed, routed, or reopened unless the question says otherwise.',
    '- Treat "signal-driven" service requests as rows where resident_signal_id is not null.',
    '- Treat "SLA risk" as high urgency, near estimated completion, or still-open requests with estimated_completion within the next seven days.',
    '- Treat "capacity pressure" as available_capacity below minimum_capacity_threshold or high access-center utilization.',
  ].join('\n');
}

function sanitizeSql(sql) {
  return stripCodeFences(String(sql || ''))
    .replace(/;+\s*$/g, '')
    .trim();
}

function generatePatternSql(question) {
  const q = String(question || '').trim();
  const qLower = q.toLowerCase();

  const topMatch = qLower.match(/\btop\s+(\d+)\b/);
  const topN = topMatch ? Math.min(parseInt(topMatch[1], 10), 25) : 5;
  const dayMatch = qLower.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  const dayWindow = dayMatch ? Math.min(parseInt(dayMatch[1], 10), 365) : null;
  const openStatusPredicate = `LOWER(request_status) NOT IN ('completed', 'routed', 'reopened', 'cancelled')`;

  if (/break(?: this)? down.*program.*service categor|program.*service categor.*break|breakdown by program and service categor/.test(qLower)) {
    const inspectionFilter = /inspection|code enforcement/.test(qLower)
      ? `AND (LOWER(service_category) LIKE '%inspection%' OR LOWER(service_category) LIKE '%code enforcement%')`
      : '';
    return `SELECT program_name,
                   service_category,
                   resident_state AS service_area,
                   COUNT(DISTINCT service_request_id) AS delayed_requests,
                   ROUND(AVG(urgency_score), 2) AS avg_priority_score
            FROM sled_operations_dashboard_v
            WHERE ${openStatusPredicate}
              ${inspectionFilter}
            GROUP BY program_name, service_category, resident_state
            ORDER BY delayed_requests DESC, avg_priority_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(pending|open|still).*service requests?.*signal-driven|service requests?.*(pending|open|still).*signal-driven|signal-driven.*service requests?.*(pending|open|still)|service requests?.*resident_signal_id/.test(qLower)) {
    return `SELECT service_request_id,
                   request_status,
                   ROUND(service_value_exposure, 2) AS service_value_exposure,
                   ROUND(urgency_score, 2) AS urgency_score,
                   estimated_completion,
                   created_at
            FROM sled_service_requests_v
            WHERE resident_signal_id IS NOT NULL
              AND ${openStatusPredicate}
            ORDER BY urgency_score DESC, created_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/service-level agreements|service level agreements|\bsla\b|breach/.test(qLower)) {
    return `SELECT service_request_id,
                   request_status,
                   ROUND(urgency_score, 2) AS urgency_score,
                   estimated_completion,
                   ROUND(service_value_exposure, 2) AS service_value_exposure
            FROM sled_service_requests_v
            WHERE ${openStatusPredicate}
            ORDER BY
              CASE
                WHEN estimated_completion IS NOT NULL AND CAST(estimated_completion AS DATE) <= SYSDATE + 7 THEN 0
                ELSE 1
              END,
              urgency_score DESC,
              service_value_exposure DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/permits? and licensing|licensing requests?|permit requests?|longest open backlog/.test(qLower)) {
    return `SELECT program_name AS agency_team,
                   service_category,
                   COUNT(DISTINCT service_request_id) AS open_backlog,
                   ROUND(AVG(urgency_score), 2) AS avg_priority_score,
                   MIN(request_created_at) AS oldest_request_created_at
            FROM sled_operations_dashboard_v
            WHERE LOWER(request_status) NOT IN ('completed', 'routed', 'reopened', 'cancelled')
            GROUP BY program_name, service_category
            ORDER BY oldest_request_created_at ASC, open_backlog DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/highest demand|highest current request demand|seeing the highest demand/.test(qLower)) {
    return `SELECT service_name,
                   program_name,
                   service_category,
                   COUNT(DISTINCT service_request_id) AS demand_count,
                   ROUND(AVG(urgency_score), 2) AS avg_urgency_score
            FROM sled_operations_dashboard_v
            GROUP BY service_name, program_name, service_category
            ORDER BY demand_count DESC, avg_urgency_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/low capacity|below minimum capacity|available capacity below|check capacity for|capacity for/.test(qLower)) {
    const serviceMatch = q.match(/(?:check\s+)?capacity\s+for\s+(.+?)\s*\??$/i);
    const serviceName = serviceMatch ? serviceMatch[1].trim().replace(/'/g, "''") : null;
    const serviceFilter = serviceName ? `AND UPPER(s.service_name) LIKE '%' || UPPER('${serviceName}') || '%'` : '';
    const capacityFilter = serviceName ? '' : 'AND c.available_capacity < c.minimum_capacity_threshold';
    return `SELECT s.service_name,
                   s.program_name,
                   c.service_access_center_id,
                   c.available_capacity,
                   c.minimum_capacity_threshold,
                   (c.minimum_capacity_threshold - c.available_capacity) AS capacity_gap
            FROM sled_service_capacity_v c
            JOIN sled_public_services_v s ON s.service_id = c.service_id
            WHERE 1 = 1
              ${serviceFilter}
              ${capacityFilter}
            ORDER BY capacity_gap DESC, c.available_capacity ASC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/percentage.*resident.?signal|resident.?signal.*percentage|signal-driven.*percentage|what percentage.*service requests/.test(qLower)) {
    return `SELECT COUNT(*) AS total_service_requests,
                   SUM(CASE WHEN resident_signal_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_linked_requests,
                   ROUND(100 * SUM(CASE WHEN resident_signal_id IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS signal_linked_percentage
            FROM sled_service_requests_v`;
  }

  if (/critical resident service signals|critical.*signals.*last 24 hours|resident service signals.*24 hours/.test(qLower)) {
    return `SELECT resident_signal_id,
                   source_channel,
                   urgency_score,
                   urgency_band,
                   reach_count,
                   signal_text,
                   signal_time
            FROM sled_resident_signals_v
            WHERE CAST(signal_time AS DATE) >= SYSDATE - 1
              AND (urgency_band = 'critical' OR urgency_score >= 75)
            ORDER BY urgency_score DESC, signal_time DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/nearest.*service (?:site|access center).*same-day|same-day.*service (?:site|access center)|service counter slots.*resident/.test(qLower)) {
    const cityMatch = q.match(/\b(?:in|near)\s+(?:a resident in\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/);
    const city = cityMatch ? cityMatch[1].trim().replace(/\?+$/, '') : null;
    const cityLiteral = city ? city.replace(/'/g, "''") : null;
    const residentFilter = cityLiteral ? `WHERE UPPER(r.city) = UPPER('${cityLiteral}')` : 'WHERE 1 = 1';
    return `SELECT c.service_access_center_name,
                   c.city,
                   c.state_province,
                   s.service_name,
                   cap.available_capacity,
                   cap.minimum_capacity_threshold,
                   ROUND(69.0 * SQRT(POWER(c.latitude - r.latitude, 2) + POWER((c.longitude - r.longitude) * COS(r.latitude * ACOS(-1) / 180), 2)), 2) AS distance_miles
            FROM sled_residents_v r
            CROSS JOIN sled_service_access_centers_v c
            JOIN sled_service_capacity_v cap ON cap.service_access_center_id = c.service_access_center_id
            JOIN sled_public_services_v s ON s.service_id = cap.service_id
            ${residentFilter}
              AND c.is_active = 1
              AND cap.available_capacity > cap.reserved_capacity
            ORDER BY distance_miles ASC, cap.available_capacity DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/benefits eligibility|resident need.*capacity|response capacity.*low|capacity is low/.test(qLower)) {
    return `SELECT d.program_name,
                   d.service_name,
                   COUNT(DISTINCT d.service_request_id) AS high_need_cases,
                   ROUND(AVG(d.urgency_score), 2) AS avg_resident_need_score,
                   NVL(SUM(c.available_capacity), 0) AS available_capacity,
                   NVL(SUM(c.minimum_capacity_threshold), 0) AS minimum_capacity_threshold
            FROM sled_operations_dashboard_v d
            LEFT JOIN sled_service_capacity_v c ON c.service_id = d.service_id
            WHERE d.urgency_score >= 60
            GROUP BY d.program_name, d.service_name
            ORDER BY avg_resident_need_score DESC, available_capacity ASC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/inspection|code enforcement|delayed by service area|service area/.test(qLower)) {
    return `SELECT resident_state AS service_area,
                   service_category,
                   COUNT(DISTINCT service_request_id) AS delayed_requests,
                   ROUND(AVG(urgency_score), 2) AS avg_priority_score,
                   MAX(request_created_at) AS latest_request_created_at
            FROM sled_operations_dashboard_v
            WHERE LOWER(request_status) NOT IN ('completed', 'routed', 'reopened', 'cancelled')
            GROUP BY resident_state, service_category
            ORDER BY delayed_requests DESC, avg_priority_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/public works|field capacity|rising request volume|limited field capacity/.test(qLower)) {
    return `SELECT c.state_province AS service_region,
                   c.service_access_center_type,
                   COUNT(DISTINCT c.service_access_center_id) AS access_centers,
                   ROUND(AVG(c.utilization_pct), 2) AS avg_utilization_pct,
                   NVL(SUM(sc.available_capacity), 0) AS available_capacity,
                   NVL(SUM(sc.minimum_capacity_threshold), 0) AS minimum_capacity_threshold
            FROM sled_service_access_centers_v c
            LEFT JOIN sled_service_capacity_v sc ON sc.service_access_center_id = c.service_access_center_id
            GROUP BY c.state_province, c.service_access_center_type
            ORDER BY avg_utilization_pct DESC, available_capacity ASC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/transportation|route pressure|service task route pressure/.test(qLower)) {
    return `SELECT s.service_name,
                   s.service_category,
                   COUNT(DISTINCT r.service_request_id) AS request_count,
                   COUNT(DISTINCT tr.service_task_route_id) AS active_routes,
                   ROUND(AVG(tr.estimated_hours), 2) AS avg_estimated_hours
            FROM sled_public_services_v s
            LEFT JOIN sled_service_request_lines_v l ON l.service_id = s.service_id
            LEFT JOIN sled_service_requests_v r ON r.service_request_id = l.service_request_id
            LEFT JOIN sled_service_task_routes_v tr ON tr.service_request_id = r.service_request_id
            GROUP BY s.service_name, s.service_category
            ORDER BY active_routes DESC, request_count DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/health and human services|public assistance program demand|program demand/.test(qLower)) {
    return `SELECT p.program_name,
                   COUNT(DISTINCT r.service_request_id) AS public_assistance_requests,
                   ROUND(SUM(l.line_service_value), 2) AS service_value_exposure,
                   ROUND(AVG(r.urgency_score), 2) AS avg_priority_score
            FROM sled_public_programs_v p
            JOIN sled_public_services_v s ON s.program_id = p.program_id
            JOIN sled_service_request_lines_v l ON l.service_id = s.service_id
            JOIN sled_service_requests_v r ON r.service_request_id = l.service_request_id
            GROUP BY p.program_name
            ORDER BY public_assistance_requests DESC, avg_priority_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/fraud|waste|abuse|policy compliance|compliance risk/.test(qLower)) {
    return `SELECT program_name,
                   service_category,
                   COUNT(DISTINCT service_request_id) AS compliance_risk_cases,
                   ROUND(AVG(urgency_score), 2) AS avg_priority_score,
                   SUM(CASE WHEN resident_signal_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_linked_cases
            FROM sled_operations_dashboard_v
            WHERE urgency_score >= 50 OR resident_signal_id IS NOT NULL
            GROUP BY program_name, service_category
            ORDER BY compliance_risk_cases DESC, signal_linked_cases DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/backlog reduction|prioritized for backlog|open service requests.*sla/.test(qLower)) {
    return `SELECT program_name AS agency,
                   COUNT(DISTINCT service_request_id) AS open_service_requests,
                   ROUND(AVG(urgency_score), 2) AS avg_sla_risk_score,
                   SUM(CASE WHEN resident_signal_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_linked_requests
            FROM sled_operations_dashboard_v
            WHERE LOWER(request_status) NOT IN ('completed', 'routed', 'reopened', 'cancelled')
            GROUP BY program_name
            ORDER BY open_service_requests DESC, avg_sla_risk_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/transparency|auditability|records support|resident experience cases/.test(qLower)) {
    return `SELECT r.service_request_id,
                   r.request_status,
                   res.resident_display_name,
                   res.city,
                   res.state_province,
                   ROUND(r.urgency_score, 2) AS urgency_score,
                   sig.source_channel,
                   sig.urgency_band
            FROM sled_service_requests_v r
            LEFT JOIN sled_residents_v res ON res.resident_id = r.resident_id
            LEFT JOIN sled_resident_signals_v sig ON sig.resident_signal_id = r.resident_signal_id
            ORDER BY r.urgency_score DESC, r.created_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/emergency response|near-term capacity adjustments|capacity adjustments/.test(qLower)) {
    return `SELECT s.service_name,
                   s.service_category,
                   c.service_access_center_id,
                   NVL(c.available_capacity, 0) AS available_capacity,
                   NVL(c.minimum_capacity_threshold, 0) AS minimum_capacity_threshold,
                   NVL(c.reserved_capacity, 0) AS reserved_capacity
            FROM sled_service_capacity_v c
            JOIN sled_public_services_v s ON s.service_id = c.service_id
            ORDER BY
              CASE WHEN NVL(c.available_capacity, 0) < NVL(c.minimum_capacity_threshold, 0) THEN 0 ELSE 1 END,
              available_capacity ASC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(how many service requests.*\b(in total|total|overall)\b|summarize .*how many service requests|summarize .*total service requests|total service request count|overall service request count|count of service requests)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_public_service_requests FROM sled_service_requests_v`;
  }

  if (/total service value.*all service requests|service value from all service requests|overall service value/.test(qLower)) {
    return `SELECT ROUND(SUM(service_value_exposure), 2) AS total_service_value FROM sled_service_requests_v`;
  }

  if (/service value.*public service category|service value by category|public service category.*service value|breakdown by category/.test(qLower)) {
    return `SELECT service_category,
                   COUNT(DISTINCT service_request_id) AS public_service_requests,
                   ROUND(SUM(line_service_value), 2) AS service_value
            FROM sled_service_request_lines_v l
            JOIN sled_public_services_v s ON s.service_id = l.service_id
            GROUP BY service_category
            ORDER BY service_value DESC`;
  }

  if (/service value by public program|public program service value|public program value breakdown/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(r.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
    return `SELECT p.program_name,
                   COUNT(DISTINCT r.service_request_id) AS public_service_requests,
                   ROUND(SUM(l.line_service_value), 2) AS service_value
            FROM sled_service_requests_v r
            JOIN sled_service_request_lines_v l ON l.service_request_id = r.service_request_id
            JOIN sled_public_services_v s ON s.service_id = l.service_id
            JOIN sled_public_programs_v p ON p.program_id = s.program_id
            ${dateFilter}
            GROUP BY p.program_name
            ORDER BY service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(which is the best public service|what is the best public service|top .*public services.*service value|public services by service value)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(r.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
    const limit = (!topMatch && /best public service/.test(qLower)) ? 1 : topN;
    return `SELECT s.service_name,
                   s.program_name,
                   ROUND(SUM(l.line_service_value), 2) AS service_value,
                   SUM(l.requested_quantity) AS requested_quantity
            FROM sled_service_request_lines_v l
            JOIN sled_service_requests_v r ON r.service_request_id = l.service_request_id
            JOIN sled_public_services_v s ON s.service_id = l.service_id
            ${dateFilter}
            GROUP BY s.service_name, s.program_name
            ORDER BY service_value DESC, requested_quantity DESC
            FETCH FIRST ${limit} ROWS ONLY`;
  }

  const urgencyMatch = qLower.match(/urgency score above\s+(\d+)/);
  if (/(how many resident signals|resident signal count)/.test(qLower) && urgencyMatch) {
    return `SELECT COUNT(*) AS resident_signal_count
            FROM sled_resident_signals_v
            WHERE urgency_score > ${parseInt(urgencyMatch[1], 10)}`;
  }

  if (/service access centers have the most available capacity|access centers.*capacity|centers have the most capacity|most capacity/.test(qLower)) {
    return `SELECT c.service_access_center_name,
                   c.city,
                   c.state_province,
                   NVL(SUM(sc.available_capacity), 0) AS total_capacity
            FROM sled_service_access_centers_v c
            LEFT JOIN sled_service_capacity_v sc ON c.service_access_center_id = sc.service_access_center_id
            GROUP BY c.service_access_center_name, c.city, c.state_province
            ORDER BY total_capacity DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/highest average request value|average request value by public program/.test(qLower)) {
    return `SELECT program_name,
                   ROUND(AVG(request_service_value), 2) AS avg_request_value
            FROM (
              SELECT r.service_request_id,
                     s.program_name,
                     SUM(l.line_service_value) AS request_service_value
              FROM sled_service_requests_v r
              JOIN sled_service_request_lines_v l ON r.service_request_id = l.service_request_id
              JOIN sled_public_services_v s ON l.service_id = s.service_id
              GROUP BY r.service_request_id, s.program_name
            )
            GROUP BY program_name
            ORDER BY avg_request_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many service requests have a community signal source|service requests.*signal source|signal-driven service requests/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_public_service_requests
            FROM sled_service_requests_v
            WHERE resident_signal_id IS NOT NULL`;
  }

  if (/average resident-signal urgency score by source|urgency.*by source|urgency.*by channel/.test(qLower)) {
    return `SELECT source_channel,
                   ROUND(AVG(urgency_score), 2) AS avg_urgency_score,
                   COUNT(*) AS resident_signal_count
            FROM sled_resident_signals_v
            GROUP BY source_channel
            ORDER BY avg_urgency_score DESC`;
  }

  if (/synthetic residents .*most service requests|residents .*most requests|top synthetic residents by requests/.test(qLower)) {
    return `SELECT r.resident_display_name AS resident_name,
                   r.resident_contact_email,
                   COUNT(sr.service_request_id) AS request_count,
                   ROUND(SUM(sr.service_value_exposure), 2) AS total_service_value
            FROM sled_residents_v r
            JOIN sled_service_requests_v sr ON r.resident_id = sr.resident_id
            GROUP BY r.resident_display_name, r.resident_contact_email
            ORDER BY request_count DESC, total_service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many service requests were placed this week|service requests placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS public_service_requests_this_week
            FROM sled_service_requests_v
            WHERE CAST(created_at AS DATE) >= TRUNC(SYSDATE, 'IW')`;
  }

  if (/top public services by service value|public services by service value/.test(qLower)) {
    return `SELECT service_name,
                   ROUND(SUM(line_service_value), 2) AS service_value
            FROM sled_service_request_lines_v
            GROUP BY service_name
            ORDER BY service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  return null;
}

function extractReferencedTables(sql) {
  const tables = new Set();
  const regex = /\b(?:from|join)\s+([A-Za-z0-9_."$#]+)/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const rawIdentifier = match[1].split(/\s+/)[0];
    const baseName = rawIdentifier
      .split('.')
      .pop()
      .replace(/"/g, '')
      .toUpperCase();
    if (baseName) tables.add(baseName);
  }

  return [...tables];
}

function validateReadOnlySql(sql) {
  const normalized = sanitizeSql(sql);
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

  if (/\bPHYSICAL_(?:REQUEST|ROUTE)_STATUS\b/i.test(normalized)) {
    return { ok: false, reason: 'Physical lifecycle status columns are not available in public queries.' };
  }

  for (const rule of ORACLE_ONLY_SYNTAX_RULES) {
    if (rule.regex.test(normalized)) {
      return { ok: false, reason: rule.reason };
    }
  }

  const referencedTables = extractReferencedTables(normalized);
  const disallowedTables = referencedTables.filter(
    (tableName) => tableName !== 'DUAL' && !ALLOWED_TABLE_SET.has(tableName)
  );

  if (disallowedTables.length > 0) {
    return {
      ok: false,
      reason: `Query referenced unsupported tables: ${disallowedTables.join(', ')}`,
    };
  }

  return { ok: true, sql: normalized };
}

async function generateReadOnlySql(question, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [] } = {}) {
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      return validation.sql;
    }
  }

  const schemaContext = await getSchemaContext(question);
  const response = await ollamaJson(
    [
      'You translate natural language into a single Oracle SQL query for a fixed application schema.',
      'Return JSON only with keys "sql" and "reason".',
      'Rules:',
      '- Use only Oracle SQL.',
      '- Generate exactly one read-only SELECT or WITH query.',
      '- Never use DBMS_CLOUD_AI, SELECT AI, PL/SQL, DDL, DML, comments, or semicolons.',
      '- Do not use PostgreSQL syntax such as JSON_AGG, STRING_AGG, ILIKE, :: casts, DATE_TRUNC, or -> / ->> JSON operators.',
      '- Use Oracle equivalents such as JSON_ARRAYAGG, LISTAGG, TRUNC(date_expr, ...), CAST(... AS ...), JSON_VALUE, and JSON_QUERY.',
      '- Use only the tables and columns provided in the schema.',
      '- Use only the listed State and Local Government semantic views; never invent helper tables or intermediate physical tables.',
      '- Use explicit joins on the documented relationships.',
      '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
      '- When using aggregates, every selected expression must either be aggregated or included in GROUP BY.',
      '- For list-style results, prefer FETCH FIRST 25 ROWS ONLY.',
      '- If the request cannot be answered from the schema, return an empty sql string and explain why in reason.',
    ].join('\n'),
    [
      `Question: ${question}`,
      `Mode: ${mode}`,
      resolutionHints.length ? `Resolved entities:\n- ${resolutionHints.join('\n- ')}` : null,
      schemaContext,
    ].filter(Boolean).join('\n\n'),
    { profile }
  );

  const sql = response?.sql || '';
  const validation = validateReadOnlySql(sql);
  if (!sql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to generate a safe read-only SQL query.');
  }

  return validation.sql;
}

async function repairReadOnlySql(question, failedSql, failedError, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [] } = {}) {
  const schemaContext = await getSchemaContext(question);
  const response = await ollamaJson(
    [
      'You repair a failing Oracle SQL query for a fixed application schema.',
      'Return JSON only with keys "sql" and "reason".',
      'Rules:',
      '- Keep the original user intent, but fix the SQL so it compiles and runs in Oracle.',
      '- Generate exactly one read-only SELECT or WITH query.',
      '- Never use DBMS_CLOUD_AI, SELECT AI, PL/SQL, DDL, DML, comments, or semicolons.',
      '- Use only the tables, columns, and joins that exist in the provided schema context.',
      '- Use only the listed State and Local Government semantic views; never invent helper tables or intermediate physical tables.',
      '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
      '- When using aggregates, every selected expression must either be aggregated or included in GROUP BY.',
      '- If Oracle reported an invalid identifier, remove or replace the bad column/table reference.',
      '- If Oracle reported a GROUP BY error, correct the aggregation instead of changing the question intent.',
      '- If you cannot repair the query from the schema, return an empty sql string and explain why in reason.',
    ].join('\n'),
    [
      `Question: ${question}`,
      `Mode: ${mode}`,
      resolutionHints.length ? `Resolved entities:\n- ${resolutionHints.join('\n- ')}` : null,
      `Oracle error: ${getShortErrorMessage(failedError)}`,
      `Failing SQL:\n${failedSql}`,
      schemaContext,
    ].filter(Boolean).join('\n\n'),
    { profile }
  );

  const repairedSql = response?.sql || '';
  const validation = validateReadOnlySql(repairedSql);
  if (!repairedSql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to repair the SQL query.');
  }

  return validation.sql;
}

async function executeReadOnlySql(sql, { demoUser = null, maxRows = 200 } = {}) {
  const validation = validateReadOnlySql(sql);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return db.withUserConnection(demoUser, async ({ execute }) => {
    const result = await execute(validation.sql, {}, { maxRows });

    const rows = [];
    for (const row of result.rows || []) {
      const processedRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value && typeof value.getData === 'function') {
          processedRow[key] = await value.getData();
        } else {
          processedRow[key] = value;
        }
      }
      rows.push(sanitizePublicLifecyclePayload(processedRow, {
        semanticView: true,
        dropPhysicalStatusFields: true,
      }));
    }

    return {
      columns: (result.metaData || [])
        .map((column) => column.name)
        .filter((columnName) => !isPhysicalLifecycleStatusKey(columnName)),
      rows,
      rowCount: rows.length,
      sql: validation.sql,
    };
  }, { readOnly: true });
}

async function runQuestionQuery(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, maxRows = 200 } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const resolution = await resolveQuestionEntities(question, { demoUser });
  const effectiveQuestion = resolution.question;
  const initialSql = await generateReadOnlySql(effectiveQuestion, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
  });
  let currentSql = initialSql;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await executeReadOnlySql(currentSql, { demoUser, maxRows });
      return {
        ...result,
        profile: resolvedProfile,
        model: getProfileModel(resolvedProfile),
        repairedFromSql: currentSql === initialSql ? null : initialSql,
        resolvedQuestion: effectiveQuestion,
      };
    } catch (error) {
      if (!isRetryableOracleSqlError(error)) {
        throw withSqlContext(error, { sql: currentSql, profile: resolvedProfile });
      }

      if (attempt === 2) {
        throw buildUserFacingSqlError(error, {
          sql: currentSql,
          profile: resolvedProfile,
          oracleError: error.message,
        });
      }

      let repairedSql;
      try {
        repairedSql = await repairReadOnlySql(effectiveQuestion, currentSql, error, {
          mode,
          profile: resolvedProfile,
          resolutionHints: resolution.resolutionHints,
        });
      } catch (repairPromptError) {
        throw buildUserFacingSqlError(repairPromptError, {
          sql: currentSql,
          profile: resolvedProfile,
          oracleError: error.message,
        });
      }

      if (!repairedSql || repairedSql === currentSql) {
        throw buildUserFacingSqlError(error, {
          sql: currentSql,
          profile: resolvedProfile,
          oracleError: error.message,
        });
      }

      currentSql = repairedSql;
    }
  }

  throw buildUserFacingSqlError(new Error('Unable to produce a working SQL query.'), {
    sql: currentSql,
    profile: resolvedProfile,
  });
}

function buildPromptRows(rows, maxRows = 12) {
  return JSON.stringify(rows.slice(0, maxRows), null, 2);
}

function formatValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString('en-US')
      : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return String(value);
}

function normalizeColumns(columns = [], rows = []) {
  if (Array.isArray(columns) && columns.length) return columns.map((column) => String(column)).filter(Boolean);
  if (Array.isArray(rows) && rows.length) return Object.keys(rows[0]);
  return [];
}

function readRowValue(row, candidates = []) {
  if (!row || typeof row !== 'object') return undefined;
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normalized = String(candidate || '').toUpperCase();
    const match = entries.find(([key]) => String(key).toUpperCase() === normalized);
    if (match) return match[1];
  }
  return undefined;
}

function humanizeColumnName(column) {
  return String(column || '')
    .replace(/^SLED_/i, '')
    .replace(/_ID$/i, ' id')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function joinReadableList(items = []) {
  const safeItems = items.map((item) => String(item || '').trim()).filter(Boolean);
  if (safeItems.length <= 1) return safeItems[0] || '';
  if (safeItems.length === 2) return `${safeItems[0]} and ${safeItems[1]}`;
  return `${safeItems.slice(0, -1).join(', ')}, and ${safeItems[safeItems.length - 1]}`;
}

function buildStructuredQueryResult({ columns = [], rows = [], rowCount = 0 }) {
  const normalizedColumns = normalizeColumns(columns, rows);
  return {
    row_count: Number.isFinite(Number(rowCount)) ? Number(rowCount) : (Array.isArray(rows) ? rows.length : 0),
    columns: normalizedColumns,
    rows: (Array.isArray(rows) ? rows : []).slice(0, 8),
  };
}

function getResultKind(question = '', columns = []) {
  const q = String(question || '').toLowerCase();
  const joinedColumns = normalizeColumns(columns).join(' ').toLowerCase();
  if (/service request|case/.test(q) || /service_request_id|request_status|service_value_exposure/.test(joinedColumns)) return 'service_requests';
  if (/capacity|available_capacity|minimum_capacity/.test(q) || /available_capacity|minimum_capacity|reserved_capacity|utilization/.test(joinedColumns)) return 'capacity';
  if (/resident signal|signal-driven|signal source|community signal/.test(q) || /resident_signal|source_channel|urgency_band/.test(joinedColumns)) return 'resident_signals';
  if (/route|field response|dispatch|public works/.test(q) || /route|estimated_hours/.test(joinedColumns)) return 'field_response';
  if (/program|benefits|public assistance|agency/.test(q) || /program_name|agency/.test(joinedColumns)) return 'programs';
  if (/resident|constituent/.test(q) || /resident_display_name|resident_name/.test(joinedColumns)) return 'residents';
  return 'service_requests';
}

function getResultLabel(resultKind, rowCount) {
  const plural = Number(rowCount) === 1 ? '' : 's';
  switch (resultKind) {
    case 'capacity':
      return `capacity record${plural}`;
    case 'resident_signals':
      return `resident signal record${plural}`;
    case 'field_response':
      return `field response route${plural}`;
    case 'programs':
      return `public program record${plural}`;
    case 'residents':
      return `resident record${plural}`;
    default:
      return `service request record${plural}`;
  }
}

function getFollowUpQuestions(resultKind) {
  switch (resultKind) {
    case 'capacity':
      return [
        'Which services are below minimum capacity by access center?',
        'Show capacity risks tied to open service requests.',
      ];
    case 'resident_signals':
      return [
        'Which resident signals are tied to open service requests?',
        'Break the signal-driven workload down by source channel.',
      ];
    case 'field_response':
      return [
        'Which active routes have the longest estimated completion time?',
        'Show delayed field response work by service access center.',
      ];
    case 'programs':
      return [
        'Which public programs have the largest open backlog?',
        'Show program demand with average urgency score.',
      ];
    case 'residents':
      return [
        'Which residents have the most open service requests?',
        'Show resident service requests by access tier.',
      ];
    default:
      return [
        'Break this down by program and service category.',
        'Show the highest-urgency open service requests.',
      ];
  }
}

function formatTopRowEvidence(row, resultKind) {
  if (!row) return '';
  const requestId = readRowValue(row, ['SERVICE_REQUEST_ID']);
  const status = readRowValue(row, ['REQUEST_STATUS']);
  const urgency = readRowValue(row, ['URGENCY_SCORE', 'AVG_PRIORITY_SCORE', 'AVG_SLA_RISK_SCORE', 'AVG_RESIDENT_NEED_SCORE']);
  const serviceValue = readRowValue(row, ['SERVICE_VALUE_EXPOSURE', 'SERVICE_VALUE', 'TOTAL_SERVICE_VALUE']);
  const serviceName = readRowValue(row, ['SERVICE_NAME']);
  const programName = readRowValue(row, ['PROGRAM_NAME', 'AGENCY', 'AGENCY_TEAM']);
  const category = readRowValue(row, ['SERVICE_CATEGORY']);
  const centerName = readRowValue(row, ['SERVICE_ACCESS_CENTER_NAME']);
  const region = readRowValue(row, ['SERVICE_REGION', 'SERVICE_AREA', 'STATE_PROVINCE', 'RESIDENT_STATE']);
  const capacity = readRowValue(row, ['AVAILABLE_CAPACITY', 'TOTAL_CAPACITY']);
  const minimumCapacity = readRowValue(row, ['MINIMUM_CAPACITY_THRESHOLD']);
  const signalCount = readRowValue(row, ['SIGNAL_LINKED_REQUESTS', 'SIGNAL_LINKED_CASES', 'SIGNAL_DRIVEN_PUBLIC_SERVICE_REQUESTS', 'RESIDENT_SIGNAL_COUNT']);

  if (resultKind === 'capacity') {
    const subject = serviceName || centerName || region || 'the top capacity record';
    const parts = [`${formatValue(subject)}`];
    if (capacity !== undefined) parts.push(`${formatValue(capacity)} available capacity`);
    if (minimumCapacity !== undefined) parts.push(`${formatValue(minimumCapacity)} minimum threshold`);
    return parts.join(' with ');
  }

  if (resultKind === 'programs') {
    const subject = programName || category || 'the top program record';
    const parts = [`${formatValue(subject)}`];
    if (urgency !== undefined) parts.push(`average urgency ${formatValue(urgency)}`);
    if (serviceValue !== undefined) parts.push(`service value ${formatValue(serviceValue)}`);
    return parts.join(' with ');
  }

  if (resultKind === 'resident_signals') {
    const subject = readRowValue(row, ['SOURCE_CHANNEL', 'URGENCY_BAND', 'RESIDENT_SIGNAL_ID']) || 'the top resident signal';
    const parts = [`${formatValue(subject)}`];
    if (urgency !== undefined) parts.push(`urgency ${formatValue(urgency)}`);
    if (signalCount !== undefined) parts.push(`${formatValue(signalCount)} signal-linked records`);
    return parts.join(' with ');
  }

  const subject = requestId ? `request ${formatValue(requestId)}` : (serviceName || programName || category || 'the top record');
  const parts = [formatValue(subject)];
  if (status !== undefined) parts.push(`status ${formatValue(status)}`);
  if (urgency !== undefined) parts.push(`urgency ${formatValue(urgency)}`);
  if (serviceValue !== undefined) parts.push(`service value ${formatValue(serviceValue)}`);
  return parts.join(' with ');
}

function formatResultBullet(row, index, columns = [], resultKind = 'service_requests') {
  const topEvidence = formatTopRowEvidence(row, resultKind);
  if (topEvidence) return `${index}. ${topEvidence}.`;
  const fields = normalizeColumns(columns)
    .slice(0, 4)
    .map((column) => {
      const value = readRowValue(row, [column]);
      return value === undefined ? null : `${humanizeColumnName(column)} ${formatValue(value)}`;
    })
    .filter(Boolean);
  return `${index}. ${fields.join(', ')}.`;
}

function buildAggregateResultSynthesis({
  question = '',
  mode = 'narrate',
  columns = [],
  rows = [],
  rowCount = 0,
  resultKind = 'service_requests',
  followUpQuestions = [],
}) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  const entries = Object.entries(row || {});
  if (entries.length !== 1) return null;
  const [rawColumn, rawValue] = entries[0];
  const value = formatValue(rawValue);
  const label = humanizeColumnName(rawColumn);
  const domain = resultKind === 'resident_signals'
    ? 'resident signal evidence'
    : resultKind === 'capacity'
      ? 'service capacity'
      : 'service operations';
  const answer = mode === 'chat'
    ? `I found ${value} ${label} in the governed State and Local Government ${domain} data. You can narrow this by program, service category, access center, or urgency.`
    : `The governed State and Local Government data shows ${value} ${label}. This is grounded in the authorized semantic view used for the question.`;

  return {
    answer,
    key_findings: [`${value} ${label} returned from the authorized State and Local Government data scope.`],
    result_summary: `${value} ${label} returned from the governed semantic views.`,
    follow_up_questions: followUpQuestions,
    referenced_data: {
      row_count: rowCount,
      notable_fields: normalizeColumns(columns, rows),
    },
    warnings: [],
    source: 'deterministic_fallback',
  };
}

function deterministicResultSynthesis({ question, mode = 'narrate', columns = [], rows = [], rowCount = 0 }) {
  const normalizedColumns = normalizeColumns(columns, rows);
  const safeRows = Array.isArray(rows) ? rows : [];
  const count = Number.isFinite(Number(rowCount)) ? Number(rowCount) : safeRows.length;
  const resultKind = getResultKind(question, normalizedColumns);
  const resultLabel = getResultLabel(resultKind, count);
  const followUpQuestions = getFollowUpQuestions(resultKind);

  if (!safeRows.length || count === 0) {
    const answer = mode === 'chat'
      ? 'I did not find matching records in the governed State and Local Government data scope. Try narrowing by program, service category, access center, urgency, or status.'
      : 'No matching records were returned from the governed State and Local Government semantic views for that question.';
    return {
      answer,
      key_findings: [],
      result_summary: 'No matching records were returned from the governed semantic views.',
      follow_up_questions: followUpQuestions,
      referenced_data: {
        row_count: 0,
        notable_fields: normalizedColumns,
      },
      warnings: [],
      source: 'deterministic_fallback',
    };
  }

  const aggregate = buildAggregateResultSynthesis({
    question,
    mode,
    columns: normalizedColumns,
    rows: safeRows,
    rowCount: count,
    resultKind,
    followUpQuestions,
  });
  if (aggregate) return aggregate;

  const topEvidence = formatTopRowEvidence(safeRows[0], resultKind);
  const findings = safeRows.slice(0, 5).map((row, index) => formatResultBullet(row, index + 1, normalizedColumns, resultKind));
  const secondEvidence = safeRows[1] ? formatTopRowEvidence(safeRows[1], resultKind) : '';
  const thirdEvidence = safeRows[2] ? formatTopRowEvidence(safeRows[2], resultKind) : '';
  const otherMatches = [secondEvidence, thirdEvidence].filter(Boolean).map(formatValue);
  const otherMatchText = otherMatches.length ? `Other visible matches include ${joinReadableList(otherMatches)}.` : '';

  const answer = mode === 'chat'
    ? [
      `I found ${count} matching ${resultLabel} in the governed State and Local Government data.`,
      topEvidence ? `The first result is ${topEvidence}.` : null,
      otherMatchText,
      'We can narrow this by program, access center, urgency, status, or service category.',
    ].filter(Boolean).join(' ')
    : [
      `The query returned ${count} ${resultLabel} from the governed State and Local Government semantic views.`,
      topEvidence ? `Highest-priority evidence: ${topEvidence}.` : null,
      otherMatchText,
      'This gives agency staff a concise, auditable queue for triage and follow-up.',
    ].filter(Boolean).join(' ');

  return {
    answer,
    key_findings: findings,
    result_summary: `${count} ${resultLabel} returned from the governed State and Local Government semantic views.`,
    follow_up_questions: followUpQuestions,
    referenced_data: {
      row_count: count,
      notable_fields: normalizedColumns,
    },
    warnings: [],
    source: 'deterministic_fallback',
  };
}

function normalizeTextField(value) {
  return sanitizePublicLifecycleText(String(value || ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function toStringArray(value, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeTextField(item)).filter(Boolean).slice(0, limit);
}

function normalizeSynthesisResponse(response, context, fallback) {
  const normalized = {
    answer: normalizeTextField(response?.answer),
    key_findings: toStringArray(response?.key_findings, 6),
    result_summary: normalizeTextField(response?.result_summary),
    follow_up_questions: toStringArray(response?.follow_up_questions, 3),
    referenced_data: {
      row_count: Number.isFinite(Number(response?.referenced_data?.row_count))
        ? Number(response.referenced_data.row_count)
        : context.rowCount,
      notable_fields: toStringArray(response?.referenced_data?.notable_fields || context.columns, 12),
    },
    warnings: toStringArray(response?.warnings, 6),
    source: 'ollama_synthesis',
  };

  if (!normalized.answer) normalized.answer = fallback.answer;
  if (!normalized.key_findings.length) normalized.key_findings = fallback.key_findings || [];
  if (!normalized.result_summary) normalized.result_summary = fallback.result_summary;
  if (!normalized.follow_up_questions.length) normalized.follow_up_questions = fallback.follow_up_questions || [];
  normalized.warnings = [...new Set([...(fallback.warnings || []), ...normalized.warnings])];
  return normalized;
}

function buildConversationContext(history = []) {
  if (!Array.isArray(history) || history.length === 0) return '';
  return history
    .slice(-6)
    .map((entry) => {
      const role = entry?.role === 'assistant' ? 'Assistant' : 'User';
      const text = String(entry?.text || entry?.answer || '').replace(/\s+/g, ' ').trim();
      return text ? `${role}: ${text.slice(0, 360)}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

async function synthesizeQueryResultWithOllama({
  question,
  mode = 'narrate',
  sql,
  columns = [],
  rows = [],
  rowCount = 0,
  profile = DEFAULT_PROFILE,
  conversationContext = [],
}) {
  const structuredResult = buildStructuredQueryResult({ columns, rows, rowCount });
  const contextText = buildConversationContext(conversationContext);
  const isChatMode = mode === 'chat';
  const systemPrompt = isChatMode
    ? [
      'You are a conversational State and Local Government data assistant for a public-sector modernization demo.',
      'Answer in a natural chat style using only the provided SQL query results and optional conversation context.',
      'Use public-sector language: constituent services, service requests, permits, benefits, inspections, public works, access centers, SLA risk, resident experience, auditability, and policy compliance.',
      'Do not invent values, counts, percentages, places, programs, fields, or recommendations that are not grounded in the rows.',
      'Do not sound like a SQL result dump. Do not list raw column names unless necessary.',
      'Return JSON only with keys "answer", "follow_up_questions", "referenced_data", and "warnings".',
    ].join('\n')
    : [
      'You are a State and Local Government operations narrator for a public-sector modernization demo.',
      'Convert SQL query results into a concise operations brief for agency staff.',
      'Use only the provided query results. Do not invent values.',
      'Use public-sector language: agency operations, constituent services, service requests, service-level risk, compliance, backlog reduction, resident experience, and auditability.',
      'Avoid raw database phrasing such as "Found rows" or dumped column names.',
      'Return JSON only with keys "answer", "key_findings", "result_summary", "follow_up_questions", and "warnings".',
    ].join('\n');
  const expectedJson = isChatMode
    ? {
      answer: '...',
      follow_up_questions: ['...', '...'],
      referenced_data: {
        row_count: rowCount,
        notable_fields: structuredResult.columns,
      },
      warnings: [],
    }
    : {
      answer: '...',
      key_findings: ['...', '...'],
      result_summary: '...',
      follow_up_questions: ['...'],
      warnings: [],
    };

  return ollamaJson(
    systemPrompt,
    [
      contextText ? `Conversation context:\n${contextText}` : null,
      `User question:\n${question}`,
      sql ? `Generated SQL:\n${sql}` : null,
      `Query result JSON:\n${JSON.stringify(structuredResult, null, 2)}`,
      `Return JSON only in this shape:\n${JSON.stringify(expectedJson, null, 2)}`,
    ].filter(Boolean).join('\n\n'),
    { profile, temperature: 0.1, numPredict: 520 }
  );
}

async function summarizeQueryResult({
  question,
  mode = 'narrate',
  sql,
  columns = [],
  rows = [],
  rowCount = 0,
  profile = DEFAULT_PROFILE,
  conversationContext = [],
  synthesizeWithModel = process.env.ASKDATA_RESULT_SYNTHESIS_ENABLED === '1',
  synthesisClient = null,
} = {}) {
  const context = {
    question,
    mode,
    sql,
    columns: normalizeColumns(columns, rows),
    rows: Array.isArray(rows) ? rows : [],
    rowCount: Number.isFinite(Number(rowCount)) ? Number(rowCount) : (Array.isArray(rows) ? rows.length : 0),
  };
  const fallback = deterministicResultSynthesis(context);

  if (!synthesizeWithModel) return fallback;

  try {
    const response = synthesisClient
      ? await synthesisClient({ ...context, profile, conversationContext, fallback })
      : await synthesizeQueryResultWithOllama({
        ...context,
        profile,
        conversationContext,
      });
    return normalizeSynthesisResponse(response, context, fallback);
  } catch (_) {
    return fallback;
  }
}

function invalidateMetadataCaches() {
  schemaCache = {
    expiresAt: 0,
    grouped: {},
    tableComments: {},
  };
  entityCaches.clear();
}

async function answerQuestion(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, conversationContext = [] } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const contextualQuestion = conversationContext.length
    ? `${question}\n\nPrior chat context:\n${conversationContext.slice(-6).map((item) => `${item.role || 'user'}: ${item.content || item.text || ''}`).join('\n')}`
    : question;
  const result = await runQuestionQuery(contextualQuestion, {
    mode,
    demoUser,
    profile: resolvedProfile,
  });
  const answer = await summarizeQueryResult({
    question: contextualQuestion,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    conversationContext,
  });

  return {
    answer: answer.answer,
    keyFindings: answer.key_findings || [],
    resultSummary: answer.result_summary || '',
    followUpQuestions: answer.follow_up_questions || [],
    referencedData: answer.referenced_data || null,
    warnings: answer.warnings || [],
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    repairedFromSql: result.repairedFromSql || null,
  };
}

async function summarizeContext({ question, instructions, context }) {
  return ollamaText(
    [
      'You are an operations analyst for a State and Local Government public service coordination platform.',
      'Answer only from the supplied JSON context.',
      'Be concise, specific, and truthful.',
      'If the context is incomplete, say so plainly.',
      instructions || '',
    ].join('\n'),
    `Question: ${question}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.2 }
  );
}

const generateQuestionSql = generateReadOnlySql;

function describeGeneratedSql(sql, question = '') {
  const lowered = String(sql || '').toLowerCase();
  if (!sql) return 'No SQL was generated.';
  if (lowered.includes('sled_service_requests_v')) return 'Queries State and Local Government service requests, statuses, urgency, SLA-adjacent timestamps, and resident signal attribution.';
  if (lowered.includes('sled_resident_signals_v')) return 'Queries resident and community signal evidence with urgency, sentiment, reach, and source context.';
  if (lowered.includes('sled_service_capacity_v')) return 'Queries service capacity and access center readiness for agency operations.';
  return `Generated governed Oracle SQL for the State and Local Government question: ${question}`;
}

function summarizeRunSqlResult({ rows = [], rowCount = 0 } = {}) {
  if (!rowCount) return 'No rows matched the State and Local Government operations question.';
  const preview = rows.slice(0, 3).map((row) => Object.values(row).slice(0, 3).join(' / ')).join('; ');
  return preview ? `${rowCount} row(s) returned. Example: ${preview}` : `${rowCount} row(s) returned.`;
}

module.exports = {
  DEFAULT_PROFILE,
  OLLAMA_MODEL,
  answerQuestion,
  checkAskSledDataHealth,
  createAskDataError,
  describeGeneratedSql,
  executeReadOnlySql,
  generatePatternSql,
  generateQuestionSql,
  generateReadOnlySql,
  getAvailableProfiles,
  getAvailableSelectAiProfiles,
  getOllamaRuntimeConfig,
  getProfileModel,
  getSledSchemaObjectMetadata,
  groupSledSchemaObjectMetadata,
  invalidateMetadataCaches,
  isAssistantQueryableObject,
  normalizeAskDataError,
  normalizeProfile,
  runQuestionQuery,
  summarizeRunSqlResult,
  summarizeContext,
  validateReadOnlySql,
};
