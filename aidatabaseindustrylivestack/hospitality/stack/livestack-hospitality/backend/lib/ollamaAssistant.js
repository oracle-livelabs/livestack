const db = require('../config/database');
const { resolveConversationQuestion } = require('./conversationContext');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_PROFILE = 'SC_LLAMA_PROFILE';
const OLLAMA_SQL_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.OLLAMA_SQL_TIMEOUT_MS || '6000', 10));
const OLLAMA_TEXT_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.OLLAMA_TEXT_TIMEOUT_MS || '5000', 10));
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
const ALLOWED_TABLES = [
  'AGENT_ACTIONS',
  'APP_USERS',
  'BRANDS',
  'GUEST_RESERVATIONS_V',
  'GUESTS',
  'DEMAND_FORECASTS',
  'DEMAND_REGIONS',
  'EVENT_STREAM',
  'HOSPITALITY_PROPERTIES_V',
  'HOSPITALITY_ROOM_REVENUE_V',
  'HOTEL_FINANCIAL_VALIDATION_SUMMARY_V',
  'HOTEL_FINANCIAL_EXCEPTION_QUEUE_V',
  'HOTEL_FINANCIAL_VARIANCE_TREND_V',
  'HOTEL_FINANCIAL_METRIC_VARIANCE_V',
  'HOTEL_FINANCIAL_OWNER_STATUS_V',
  'FULFILLMENT_CENTERS',
  'FULFILLMENT_ZONES',
  'INFLUENCERS',
  'INFLUENCER_CONNECTIONS',
  'INVENTORY',
  'ORDERS',
  'ORDER_ITEMS',
  'POST_PRODUCT_MENTIONS',
  'PRODUCTS',
  'GUEST_SIGNALS_V',
  'SERVICE_CAPACITY_V',
  'HOTELS_V',
  'SERVICE_ROUTES_V',
  'SHIPMENTS',
  'SIGNAL_SOURCES_V',
  'SOCIAL_POSTS',
];
const ALLOWED_TABLE_SET = new Set(ALLOWED_TABLES);
const PROFILE_CATALOG = Object.freeze({
  [DEFAULT_PROFILE]: Object.freeze({
    name: DEFAULT_PROFILE,
    status: 'ENABLED',
    model: OLLAMA_MODEL,
    provider: 'Ollama',
    type: 'Local SQL + reasoning',
    description: 'Primary local Ollama model for Ask Your Data.',
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
  'PRODUCTS.BRAND_ID joins to BRANDS.BRAND_ID.',
  'ORDER_ITEMS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'ORDER_ITEMS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join ORDERS -> ORDER_ITEMS -> PRODUCTS -> BRANDS.',
  'ORDERS.GUEST_ID joins to GUESTS.GUEST_ID.',
  'ORDERS.FULFILLMENT_CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'ORDERS.SOCIAL_SOURCE_ID links to SOCIAL_POSTS.POST_ID for signal-driven orders.',
  'INVENTORY.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'INVENTORY.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'SOCIAL_POSTS.INFLUENCER_ID joins to INFLUENCERS.INFLUENCER_ID.',
  'POST_PRODUCT_MENTIONS.POST_ID joins to SOCIAL_POSTS.POST_ID.',
  'POST_PRODUCT_MENTIONS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'SHIPMENTS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'SHIPMENTS.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'ORDER_ITEMS.LINE_TOTAL already stores quantity * unit_price.',
  'BRANDS.BRAND_NAME only exists on BRANDS; do not reference BRAND_NAME unless BRANDS is joined in the same query block.',
  'HOSPITALITY_PROPERTIES_V is the hospitality-facing property view over BRANDS.',
  'HOSPITALITY_ROOM_REVENUE_V is the hospitality-facing room and revenue-center view over PRODUCTS.',
  'GUEST_SIGNALS_V is the hospitality-facing guest, channel, demand, and operations signal view over SOCIAL_POSTS.',
  'SIGNAL_SOURCES_V is the hospitality-facing signal source view over INFLUENCERS.',
  'GUEST_RESERVATIONS_V is the hospitality-facing reservation and folio view over ORDERS.',
  'HOTELS_V, SERVICE_CAPACITY_V, and SERVICE_ROUTES_V are hospitality-facing hotel service views.',
  'HOTEL_FINANCIAL_VALIDATION_SUMMARY_V contains the latest owner close validation summary per property submission.',
  'HOTEL_FINANCIAL_EXCEPTION_QUEUE_V contains only latest-run financial exceptions with submitted, expected, variance, severity, status, rationale, and evidence.',
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
let entityCache = {
  expiresAt: 0,
  catalogs: {},
};

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

async function loadEntityCatalog() {
  if (Date.now() < entityCache.expiresAt && Object.keys(entityCache.catalogs).length > 0) {
    return entityCache;
  }

  const [brandsResult, productsResult, centersResult, guestsResult, influencersResult] = await Promise.all([
    db.execute(`SELECT brand_name AS value FROM brands ORDER BY brand_name`),
    db.execute(`SELECT product_name AS value FROM products ORDER BY product_name`),
    db.execute(`SELECT center_name AS value FROM fulfillment_centers ORDER BY center_name`),
    db.execute(`
      SELECT TRIM(first_name || ' ' || last_name) AS value FROM guests
      UNION
      SELECT email AS value FROM guests
    `),
    db.execute(`
      SELECT display_name AS value FROM influencers
    `),
  ]);

  const buildCatalog = (rows, type) =>
    (rows || [])
      .map((row) => String(row.VALUE || '').trim())
      .filter(Boolean)
      .map((value) => ({ value, normalized: normalizeEntityText(value), type }));

  entityCache = {
    expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
    catalogs: {
      brand: buildCatalog(brandsResult.rows, 'brand'),
      product: buildCatalog(productsResult.rows, 'product'),
      center: buildCatalog(centersResult.rows, 'center'),
      guest: buildCatalog(guestsResult.rows, 'guest'),
      influencer: buildCatalog(influencersResult.rows, 'influencer'),
    },
  };

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
    ? ` Try a known property such as ${formatEntityList(brandSuggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't map "${candidate}" to this demo schema. This app models properties, room types, guests, property hotels, reservations, and guest signal sources.${suggestionText}`
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

async function resolveQuestionEntities(question) {
  const originalQuestion = String(question || '').trim();
  const { catalogs } = await loadEntityCatalog();
  let resolvedQuestion = originalQuestion;
  const resolutionHints = [];

  const retailerPatterns = [
    /\b(?:sold|available|available|carried)\s+at\s+(.+?)(?=$|[?.!,])/i,
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
      findExactEntityMatch(catalogs.guest, candidate),
      findExactEntityMatch(catalogs.influencer, candidate),
    ].find(Boolean);

    if (!supportedMatch) {
      throw buildUnsupportedRetailerError(candidate, rankEntityMatches(catalogs.brand, candidate, 3));
    }
  }

  const explicitEntityPatterns = [
    { type: 'brand', regexes: [/\b(?:brand|property)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'product', regexes: [/\b(?:product|room type|rate plan|revenue center)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'center', regexes: [/\b(?:fulfillment\s+center|fulfillment\s+site|regulated\s+site|warehouse|center|site)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'guest', regexes: [/\b(?:guest|guest|booker)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'influencer', regexes: [/\b(?:influencer|source|signal\s+source)\s+(?:named|called)\s+@?["']?(.+?)["']?(?=$|[?.!,])/i] },
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
      || findExactEntityMatch(catalogs.guest, candidate)
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

async function ollamaGenerate(prompt, {
  format = null,
  temperature = 0.1,
  numPredict = 192,
  profile = DEFAULT_PROFILE,
  timeoutMs = OLLAMA_SQL_TIMEOUT_MS,
  model = null,
  keepAlive = null,
  numCtx = null,
  numThread = null,
  includeMetrics = false,
} = {}) {
  const resolvedModel = model || getProfileConfig(profile).model;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: resolvedModel,
        stream: false,
        format: format || undefined,
        prompt,
        keep_alive: keepAlive || undefined,
        options: {
          temperature,
          num_predict: numPredict,
          num_ctx: Number.isFinite(numCtx) ? numCtx : undefined,
          num_thread: Number.isFinite(numThread) ? numThread : undefined,
        },
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Ollama request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'OLLAMA_TIMEOUT';
      timeoutError.profile = normalizeProfile(profile);
      timeoutError.model = resolvedModel;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const text = stripCodeFences(payload?.response || '');
  if (!includeMetrics) return text;
  return {
    text,
    metrics: {
      model: payload?.model || resolvedModel,
      totalDurationNs: Number(payload?.total_duration || 0),
      loadDurationNs: Number(payload?.load_duration || 0),
      promptEvalCount: Number(payload?.prompt_eval_count || 0),
      promptEvalDurationNs: Number(payload?.prompt_eval_duration || 0),
      evalCount: Number(payload?.eval_count || 0),
      evalDurationNs: Number(payload?.eval_duration || 0),
      doneReason: payload?.done_reason || null,
    },
  };
}

async function ollamaJson(systemPrompt, userPrompt, { profile = DEFAULT_PROFILE } = {}) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature: 0.05, numPredict: 160, profile, timeoutMs: OLLAMA_SQL_TIMEOUT_MS }
  );
  return parseJsonResponse(text);
}

async function ollamaText(systemPrompt, userPrompt, {
  temperature = 0.2,
  profile = DEFAULT_PROFILE,
  timeoutMs = OLLAMA_TEXT_TIMEOUT_MS,
  numPredict = 180,
  model = null,
  keepAlive = null,
  numCtx = null,
  numThread = null,
  includeMetrics = false,
} = {}) {
  return ollamaGenerate(`${systemPrompt}\n\n${userPrompt}`, {
    temperature,
    numPredict,
    profile,
    timeoutMs,
    model,
    keepAlive,
    numCtx,
    numThread,
    includeMetrics,
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

  if (/(viral|virality|critical|risk|guest|review|channel|ota|demand|service|bulletin|signal|trend|trending|momentum|social|post|influencer|source|engagement|views|likes|shares|sentiment)/.test(q)) {
    ['BRANDS', 'INFLUENCERS', 'POST_PRODUCT_MENTIONS', 'PRODUCTS', 'GUEST_SIGNALS_V', 'SIGNAL_SOURCES_V', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(inventory|fulfillment|housekeeping|maintenance|room|crew|capacity|ship|shipping|delivery|route|routing|center|nearest|guest in|guest in|demand)/.test(q)) {
    ['GUESTS', 'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'FULFILLMENT_CENTERS', 'FULFILLMENT_ZONES', 'INVENTORY', 'PRODUCTS', 'HOTELS_V', 'SERVICE_CAPACITY_V', 'SERVICE_ROUTES_V', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(order|orders|reservation|reservations|revenue|sales|guest|guest|property|brand|room type|rate plan|product|price|category|total|average|best-selling)/.test(q)) {
    ['BRANDS', 'GUEST_RESERVATIONS_V', 'GUESTS', 'HOSPITALITY_PROPERTIES_V', 'HOSPITALITY_ROOM_REVENUE_V', 'ORDERS', 'ORDER_ITEMS', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(user|users|region|role|user profile)/.test(q)) {
    ['APP_USERS'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    ['BRANDS', 'GUEST_RESERVATIONS_V', 'GUESTS', 'HOSPITALITY_ROOM_REVENUE_V', 'ORDERS', 'ORDER_ITEMS', 'PRODUCTS', 'GUEST_SIGNALS_V', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
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
    'Available Oracle schema for this app:',
    tableLines.join('\n'),
    'Key joins and semantics:',
    ...RELATIONSHIP_HINTS
      .filter((hint) => selectedTables.some((tableName) => hint.includes(tableName)))
      .map((hint) => `- ${hint}`),
    '- SOCIAL_POSTS.MOMENTUM_FLAG values include normal, rising, viral, and mega_viral; in this hospitality demo, rising displays as Elevated, viral displays as Escalating, and mega_viral displays as Critical.',
    '- INVENTORY low-capacity logic typically compares QUANTITY_ON_HAND to REORDER_POINT.',
    '- Revenue questions usually use ORDERS.ORDER_TOTAL or ORDER_ITEMS.LINE_TOTAL.',
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
  const contextualFollowUp = /\b(?:current follow-up|continue from this prior|prior hospitality question|previous user question|previous agent answer|same result|break that down|breakdown|what about|how about)\b/.test(qLower);
  const asksBreakdown = /\b(?:break that down|breakdown|show|compare|split|group|what about|how about|by)\b/.test(qLower);
  const orderDateJoinFilter = dayWindow ? `AND CAST(o.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
  const orderDateWhereFilter = dayWindow ? `WHERE CAST(o.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';

  if (contextualFollowUp && asksBreakdown && /\b(?:guest tier|guest segment|loyalty tier|loyalty tier|tier|segment)\b/.test(qLower)) {
    return `SELECT c.guest_tier AS guest_tier,
                   COUNT(DISTINCT c.guest_id) AS guests,
                   COUNT(DISTINCT o.order_id) AS reservations,
                   ROUND(SUM(o.order_total), 2) AS total_revenue,
                   COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS signal_linked_reservations,
                   ROUND(SUM(CASE WHEN o.social_source_id IS NOT NULL THEN o.order_total ELSE 0 END), 2) AS signal_linked_revenue
            FROM guests c
            LEFT JOIN orders o ON o.guest_id = c.guest_id ${orderDateJoinFilter}
            GROUP BY c.guest_tier
            ORDER BY total_revenue DESC NULLS LAST, reservations DESC`;
  }

  if (contextualFollowUp && asksBreakdown && /\b(?:property|brand tier|brand|hotel)\b/.test(qLower)) {
    return `SELECT b.brand_name AS property_name,
                   b.brand_category AS property_type,
                   COUNT(DISTINCT o.order_id) AS reservations,
                   ROUND(SUM(o.order_total), 2) AS total_revenue,
                   COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS signal_linked_reservations,
                   ROUND(SUM(CASE WHEN o.social_source_id IS NOT NULL THEN o.order_total ELSE 0 END), 2) AS signal_linked_revenue
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            JOIN brands b ON b.brand_id = p.brand_id
            ${orderDateWhereFilter}
            GROUP BY b.brand_name, b.brand_category
            ORDER BY total_revenue DESC NULLS LAST, signal_linked_revenue DESC NULLS LAST
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (contextualFollowUp && asksBreakdown && /\b(?:source|signal source|channel|platform|influencer)\b/.test(qLower)) {
    return `SELECT i.display_name AS signal_source,
                   i.platform AS monitoring_channel,
                   COUNT(sp.post_id) AS signal_count,
                   ROUND(AVG(sp.virality_score), 1) AS avg_issue_severity,
                   COUNT(DISTINCT o.order_id) AS linked_reservations,
                   ROUND(SUM(o.order_total), 2) AS linked_revenue
            FROM social_posts sp
            JOIN influencers i ON i.influencer_id = sp.influencer_id
            LEFT JOIN orders o ON o.social_source_id = sp.post_id ${orderDateJoinFilter}
            GROUP BY i.display_name, i.platform
            ORDER BY linked_revenue DESC NULLS LAST, avg_issue_severity DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (contextualFollowUp && asksBreakdown && /\broom types?\b/.test(qLower) && !/\broom type categor(?:y|ies)\b/.test(qLower)) {
    return `SELECT p.product_name AS room_type_name,
                   p.category AS room_type_category,
                   COUNT(DISTINCT o.order_id) AS reservations,
                   ROUND(SUM(oi.line_total), 2) AS total_revenue,
                   SUM(oi.quantity) AS room_nights_or_units,
                   ROUND(AVG(oi.unit_price), 2) AS average_rate
            FROM order_items oi
            JOIN orders o ON o.order_id = oi.order_id
            JOIN products p ON p.product_id = oi.product_id
            ${orderDateWhereFilter}
            GROUP BY p.product_name, p.category
            ORDER BY total_revenue DESC NULLS LAST`;
  }

  if (contextualFollowUp && asksBreakdown && /\b(?:category|revenue center|rate plan)\b/.test(qLower)) {
    return `SELECT p.category AS hospitality_category,
                   COUNT(DISTINCT o.order_id) AS reservations,
                   ROUND(SUM(oi.line_total), 2) AS total_revenue,
                   SUM(oi.quantity) AS room_nights_or_units,
                   ROUND(AVG(oi.unit_price), 2) AS average_rate
            FROM order_items oi
            JOIN orders o ON o.order_id = oi.order_id
            JOIN products p ON p.product_id = oi.product_id
            ${orderDateWhereFilter}
            GROUP BY p.category
            ORDER BY total_revenue DESC NULLS LAST`;
  }

  if (contextualFollowUp && asksBreakdown && /\b(?:operations center|operations zone|hotel|zone|sla|service)\b/.test(qLower)) {
    return `SELECT fc.center_name AS operations_center,
                   fc.center_type AS service_tier,
                   fc.city,
                   fc.state_province AS region,
                   fc.current_load_pct AS utilization_pct,
                   COUNT(s.shipment_id) AS active_service_routes,
                   ROUND(AVG(NVL(s.estimated_hours, 0)), 1) AS avg_estimated_hours
            FROM fulfillment_centers fc
            LEFT JOIN shipments s ON s.center_id = fc.center_id
            GROUP BY fc.center_name, fc.center_type, fc.city, fc.state_province, fc.current_load_pct
            ORDER BY fc.current_load_pct DESC, active_service_routes DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(?:total revenue.*(?:bookings|reservations).*top .*properties.*(?:demand signal|signal)|top .*properties.*(?:by|for).*demand signal|hospitality properties.*demand signal)/.test(qLower)) {
    return `SELECT b.brand_name AS property_name,
                   b.brand_category AS property_type,
                   COUNT(DISTINCT o.order_id) AS bookings,
                   ROUND(SUM(o.order_total), 2) AS total_revenue,
                   COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS signal_linked_bookings,
                   ROUND(SUM(CASE WHEN o.social_source_id IS NOT NULL THEN o.order_total ELSE 0 END), 2) AS signal_linked_revenue,
                   ROUND(AVG(o.demand_score), 1) AS avg_demand_signal_score
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            JOIN brands b ON b.brand_id = p.brand_id
            GROUP BY b.brand_name, b.brand_category
            ORDER BY signal_linked_revenue DESC, avg_demand_signal_score DESC, total_revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(ota|ota|service recovery).*signals.*(?:reservation )?revenue impact|signals.*driving.*(?:reservation )?revenue impact/.test(qLower)) {
    return `SELECT i.display_name AS signal_source,
                   i.platform AS monitoring_channel,
                   CASE sp.momentum_flag
                     WHEN 'mega_viral' THEN 'Critical'
                     WHEN 'viral' THEN 'Escalating'
                     WHEN 'rising' THEN 'Elevated'
                     ELSE 'Normal'
                   END AS risk_severity,
                   COUNT(DISTINCT o.order_id) AS signal_linked_reservations,
                   ROUND(SUM(o.order_total), 2) AS signal_linked_value,
                   ROUND(AVG(sp.virality_score), 1) AS ai_risk_score
            FROM social_posts sp
            JOIN influencers i ON i.influencer_id = sp.influencer_id
            JOIN orders o ON o.social_source_id = sp.post_id
            GROUP BY i.display_name, i.platform, sp.momentum_flag
            ORDER BY signal_linked_value DESC, ai_risk_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/reservation revenue impact by (?:room type or revenue center )?category|revenue impact by (?:room type or revenue center )?category|product category.*signal-linked/.test(qLower)) {
    return `SELECT p.category AS room_type_category,
                   COUNT(DISTINCT o.order_id) AS signal_linked_reservations,
                   ROUND(SUM(oi.line_total), 2) AS signal_linked_value
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            WHERE o.social_source_id IS NOT NULL
            GROUP BY p.category
            ORDER BY signal_linked_value DESC`;
  }

  if (/same result by property|service recovery-linked case value by property|service recovery cases by property|service recovery.*connected guest value.*property|property.*service recovery.*connected guest value/.test(qLower)) {
    return `SELECT b.brand_name AS property_name,
                   b.brand_category AS property_type,
                   COUNT(DISTINCT o.order_id) AS service_recovery_linked_cases,
                   ROUND(SUM(o.order_total), 2) AS connected_guest_value,
                   ROUND(AVG(o.demand_score), 1) AS avg_service_urgency_score
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            JOIN brands b ON b.brand_id = p.brand_id
            WHERE o.social_source_id IS NOT NULL
            GROUP BY b.brand_name, b.brand_category
            ORDER BY connected_guest_value DESC, avg_service_urgency_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/service recovery-linked cases by guest tier|service recovery cases by guest tier|case value by guest tier/.test(qLower)) {
    return `SELECT c.guest_tier AS guest_tier,
                   COUNT(DISTINCT o.order_id) AS service_recovery_linked_cases,
                   ROUND(SUM(o.order_total), 2) AS connected_guest_value,
                   ROUND(AVG(o.demand_score), 1) AS avg_service_urgency_score
            FROM orders o
            JOIN guests c ON c.guest_id = o.guest_id
            WHERE o.social_source_id IS NOT NULL
            GROUP BY c.guest_tier
            ORDER BY connected_guest_value DESC`;
  }

  if (/service recovery-linked cases by operations center|service recovery cases by operations center|case value by operations center/.test(qLower)) {
    return `SELECT fc.center_name AS operations_center,
                   fc.center_type AS service_tier,
                   COUNT(DISTINCT o.order_id) AS service_recovery_linked_cases,
                   ROUND(SUM(o.order_total), 2) AS connected_guest_value,
                   ROUND(AVG(o.demand_score), 1) AS avg_service_urgency_score
            FROM orders o
            JOIN fulfillment_centers fc ON fc.center_id = o.fulfillment_center_id
            WHERE o.social_source_id IS NOT NULL
            GROUP BY fc.center_name, fc.center_type
            ORDER BY connected_guest_value DESC, avg_service_urgency_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/top service recovery cases|service recovery cases.*connected guest value|connected guest value/.test(qLower)) {
    return `SELECT o.order_id AS case_id,
                   ROUND(o.order_total, 2) AS connected_guest_value,
                   TRIM(c.first_name || ' ' || c.last_name) AS guest_name,
                   c.guest_tier AS guest_tier,
                   o.order_status AS case_status,
                   o.demand_score AS service_urgency_score
            FROM orders o
            JOIN guests c ON c.guest_id = o.guest_id
            WHERE o.social_source_id IS NOT NULL
            ORDER BY connected_guest_value DESC, service_urgency_score DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/hotels.*(?:risk|missing).*sla|service recovery sla|missing service recovery sla/.test(qLower)) {
    return `SELECT fc.center_name AS operations_center,
                   fc.center_type AS service_tier,
                   fc.city,
                   fc.state_province AS region,
                   fc.current_load_pct AS utilization_pct,
                   COUNT(s.shipment_id) AS active_case_routes,
                   ROUND(AVG(NVL(s.estimated_hours, 0)), 1) AS avg_estimated_hours
            FROM fulfillment_centers fc
            LEFT JOIN shipments s ON s.center_id = fc.center_id
            GROUP BY fc.center_name, fc.center_type, fc.city, fc.state_province, fc.current_load_pct
            ORDER BY fc.current_load_pct DESC, active_case_routes DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/hotels.*highest utilization|highest utilization.*hotels|operations centers.*highest utilization/.test(qLower)) {
    return `SELECT fc.center_name AS operations_center,
                   fc.center_type AS service_tier,
                   fc.city,
                   fc.state_province AS region,
                   fc.current_load_pct AS utilization_pct,
                   fc.capacity_units AS processing_capacity
            FROM fulfillment_centers fc
            ORDER BY fc.current_load_pct DESC, fc.capacity_units DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/properties.*highest.*signal-linked reservation value|highest signal-linked reservation value|signal-linked reservation value.*property/.test(qLower)) {
    return `SELECT b.brand_name AS property_name,
                   b.brand_category AS property_type,
                   COUNT(DISTINCT o.order_id) AS signal_linked_reservations,
                   ROUND(SUM(o.order_total), 2) AS signal_linked_value
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            JOIN brands b ON b.brand_id = p.brand_id
            WHERE o.social_source_id IS NOT NULL
            GROUP BY b.brand_name, b.brand_category
            ORDER BY signal_linked_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/guest tiers.*highest.*signal-linked revenue impact|signal-linked revenue impact.*guest tiers/.test(qLower)) {
    return `SELECT c.guest_tier AS guest_tier,
                   COUNT(DISTINCT o.guest_id) AS guests,
                   COUNT(o.order_id) AS signal_linked_reservations,
                   ROUND(SUM(o.order_total), 2) AS signal_linked_value,
                   ROUND(AVG(o.demand_score), 1) AS avg_urgency_score
            FROM orders o
            JOIN guests c ON c.guest_id = o.guest_id
            WHERE o.social_source_id IS NOT NULL
            GROUP BY c.guest_tier
            ORDER BY signal_linked_value DESC`;
  }

  if (/total value.*signal-linked guest reservations|total.*signal-linked.*reservations/.test(qLower)) {
    return `SELECT COUNT(o.order_id) AS signal_linked_reservations,
                   ROUND(SUM(o.order_total), 2) AS signal_linked_value,
                   ROUND(AVG(o.order_total), 2) AS average_reservation_value
            FROM orders o
            WHERE o.social_source_id IS NOT NULL`;
  }

  if (/signal sources.*highest revenue impact|highest revenue impact|source.*revenue impact/.test(qLower)) {
    return `SELECT i.display_name AS signal_source,
                   i.platform AS monitoring_channel,
                   i.follower_count AS revenue_impact,
                   ROUND(i.influence_score, 1) AS ai_confidence,
                   ROUND(i.engagement_rate * 100, 2) AS escalation_rate_pct
            FROM influencers i
            ORDER BY revenue_impact DESC, ai_confidence DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(how many orders.*\b(in total|total|overall)\b|summarize .*how many orders|summarize .*total orders|total order count|overall order count|count of orders)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_orders FROM orders`;
  }

  if (/total revenue.*all orders|revenue from all orders|overall revenue/.test(qLower)) {
    return `SELECT ROUND(SUM(order_total), 2) AS total_revenue FROM orders`;
  }

  if (/revenue.*(?:product|room type or revenue center) category|revenue by (?:(?:product|room type or revenue center) )?category|category.*revenue|breakdown by category/.test(qLower)) {
    return `SELECT p.category AS hospitality_category,
                   COUNT(DISTINCT o.order_id) AS orders,
                   ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY p.category
            ORDER BY revenue DESC`;
  }

  if (/revenue by (?:brand|property)|(?:brand|property) revenue|sales by (?:brand|property)|revenue breakdown by (?:brand|property)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(o.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
    return `SELECT b.brand_name AS property_name,
                   COUNT(DISTINCT o.order_id) AS orders,
                   ROUND(SUM(oi.line_total), 2) AS revenue
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.order_id
            JOIN products p ON p.product_id = oi.product_id
            JOIN brands b ON b.brand_id = p.brand_id
            ${dateFilter}
            GROUP BY b.brand_name
            ORDER BY revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(which is the best (?:product|room type or revenue center)|what is the best (?:product|room type or revenue center)|\bbest[-\s]selling (?:products?|room type or revenue centers?)\b|\bbest[-\s]performing (?:products?|room type or revenue centers?)\b|\bbest (?:product|room type or revenue center)\b|top .*best-selling (?:products|room type or revenue centers).*revenue|top .*(?:products|room type or revenue centers) by revenue|best-selling (?:products|room type or revenue centers) by revenue|room type or revenue centers by revenue)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(o.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
    const limit = (!topMatch && /\bbest product\b/.test(qLower)) ? 1 : topN;
    return `SELECT p.product_name AS room_type_name,
                   b.brand_name AS property_name,
                   ROUND(SUM(oi.line_total), 2) AS revenue,
                   SUM(oi.quantity) AS units_sold
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN products p ON oi.product_id = p.product_id
            JOIN brands b ON p.brand_id = b.brand_id
            ${dateFilter}
            GROUP BY p.product_name, b.brand_name
            ORDER BY revenue DESC, units_sold DESC
            FETCH FIRST ${limit} ROWS ONLY`;
  }

  const viralityMatch = qLower.match(/(?:virality|criticality|brand-standard signal|signal) score above\s+(\d+)/);
  if (/(how many (?:social posts|channel bulletins|signals|brand-standard signals)|count .*signals)/.test(qLower) && viralityMatch) {
    return `SELECT COUNT(*) AS critical_signal_count
            FROM social_posts
            WHERE virality_score > ${parseInt(viralityMatch[1], 10)}`;
  }

  if (/property service zones have the most inventory|centers have the most inventory|most inventory/.test(qLower)) {
    return `SELECT fc.center_name,
                   fc.city,
                   fc.state_province,
                   NVL(SUM(i.quantity_on_hand), 0) AS total_inventory
            FROM fulfillment_centers fc
            LEFT JOIN inventory i ON fc.center_id = i.center_id
            GROUP BY fc.center_name, fc.city, fc.state_province
            ORDER BY total_inventory DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/highest average reservation value|average reservation value by brand/.test(qLower)) {
    return `SELECT brand_name,
                   ROUND(AVG(brand_order_value), 2) AS avg_order_value
            FROM (
              SELECT o.order_id,
                     b.brand_name,
                     SUM(oi.quantity * oi.unit_price) AS brand_order_value
              FROM orders o
              JOIN order_items oi ON o.order_id = oi.order_id
              JOIN products p ON oi.product_id = p.product_id
              JOIN brands b ON p.brand_id = b.brand_id
              GROUP BY o.order_id, b.brand_name
            )
            GROUP BY brand_name
            ORDER BY avg_order_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many orders have a (?:social media|brand-standard signal|channel signal|signal) source|how many orders.*(?:social|brand-standard|channel|signal) source|signal-driven orders|social driven orders|signal-driven orders|signal driven orders/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_orders
            FROM orders
            WHERE social_source_id IS NOT NULL`;
  }

  if (/average (?:virality|criticality|signal) score by (?:platform|source type)|(?:virality|criticality|signal).*by (?:platform|source type)/.test(qLower)) {
    return `SELECT platform,
                   ROUND(AVG(virality_score), 2) AS avg_criticality_score,
                   COUNT(*) AS signal_count
            FROM social_posts
            GROUP BY platform
            ORDER BY avg_criticality_score DESC`;
  }

  if (/(guests|guests) placed the most orders|which (guests|guests) .*most orders|top (guests|guests) by orders/.test(qLower)) {
    return `SELECT TRIM(c.first_name || ' ' || c.last_name) AS guest_name,
                   c.email,
                   COUNT(o.order_id) AS order_count,
                   ROUND(SUM(o.order_total), 2) AS total_revenue
            FROM guests c
            JOIN orders o ON c.guest_id = o.guest_id
            GROUP BY c.first_name, c.last_name, c.email
            ORDER BY order_count DESC, total_revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many orders were placed this week|orders placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS orders_this_week
            FROM orders
            WHERE CAST(created_at AS DATE) >= TRUNC(SYSDATE, 'IW')`;
  }

  if (/top (?:products|room type or revenue centers) by revenue/.test(qLower)) {
    return `SELECT p.product_name AS room_type_name,
                   ROUND(SUM(oi.line_total), 2) AS revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY p.product_name
            ORDER BY revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  return null;
}

function generateFallbackSql(question) {
  const qLower = String(question || '').toLowerCase();

  if (/service|sla|housekeeping|maintenance|operations|arrival|readiness|capacity|route|zone/.test(qLower)) {
    return `SELECT fc.center_name AS operations_center,
                   fc.center_type AS service_tier,
                   fc.city,
                   fc.state_province AS region,
                   fc.current_load_pct AS utilization_pct,
                   fc.capacity_units AS processing_capacity,
                   COUNT(s.shipment_id) AS active_service_routes
            FROM fulfillment_centers fc
            LEFT JOIN shipments s ON s.center_id = fc.center_id
            GROUP BY fc.center_name, fc.center_type, fc.city, fc.state_province, fc.current_load_pct, fc.capacity_units
            ORDER BY fc.current_load_pct DESC, active_service_routes DESC
            FETCH FIRST 10 ROWS ONLY`;
  }

  if (/guest|loyalty|loyalty|segment|tier|nps|satisfaction/.test(qLower)) {
    return `SELECT c.guest_tier AS guest_segment,
                   COUNT(DISTINCT c.guest_id) AS guests,
                   COUNT(o.order_id) AS reservations,
                   ROUND(SUM(o.order_total), 2) AS total_revenue,
                   ROUND(AVG(o.order_total), 2) AS average_reservation_value
            FROM guests c
            LEFT JOIN orders o ON o.guest_id = c.guest_id
            GROUP BY c.guest_tier
            ORDER BY total_revenue DESC NULLS LAST, reservations DESC`;
  }

  if (/signal|review|complaint|channel|ota|social|issue|critical|demand/.test(qLower)) {
    return `SELECT i.display_name AS signal_source,
                   i.platform AS monitoring_channel,
                   COUNT(sp.post_id) AS signal_count,
                   ROUND(AVG(sp.virality_score), 1) AS avg_issue_severity,
                   COUNT(DISTINCT o.order_id) AS linked_reservations,
                   ROUND(SUM(o.order_total), 2) AS linked_revenue
            FROM social_posts sp
            JOIN influencers i ON i.influencer_id = sp.influencer_id
            LEFT JOIN orders o ON o.social_source_id = sp.post_id
            GROUP BY i.display_name, i.platform
            ORDER BY linked_revenue DESC NULLS LAST, avg_issue_severity DESC
            FETCH FIRST 10 ROWS ONLY`;
  }

  if (/room|rate|adr|revpar|outlet|event|revenue center|revenue centre/.test(qLower)) {
    return `SELECT p.product_name AS room_type_or_revenue_center,
                   p.category AS hospitality_category,
                   b.brand_name AS property_name,
                   ROUND(SUM(oi.line_total), 2) AS revenue,
                   SUM(oi.quantity) AS room_nights_or_units,
                   ROUND(AVG(oi.unit_price), 2) AS average_rate
            FROM order_items oi
            JOIN orders o ON o.order_id = oi.order_id
            JOIN products p ON p.product_id = oi.product_id
            JOIN brands b ON b.brand_id = p.brand_id
            GROUP BY p.product_name, p.category, b.brand_name
            ORDER BY revenue DESC
            FETCH FIRST 10 ROWS ONLY`;
  }

  return `SELECT b.brand_name AS property_name,
                 b.brand_category AS property_type,
                 COUNT(DISTINCT o.order_id) AS reservations,
                 ROUND(SUM(o.order_total), 2) AS total_revenue,
                 ROUND(AVG(o.order_total), 2) AS average_reservation_value,
                 COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS signal_linked_reservations
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.order_id
          JOIN products p ON p.product_id = oi.product_id
          JOIN brands b ON b.brand_id = p.brand_id
          GROUP BY b.brand_name, b.brand_category
          ORDER BY total_revenue DESC
          FETCH FIRST 10 ROWS ONLY`;
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

async function setDemoUserContext(connection, demoUser) {
  await db.setUserContext(connection, demoUser || 'corp_sam');
}

async function generateReadOnlySql(question, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [] } = {}) {
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      return validation.sql;
    }
  }

  const fallbackSql = generateFallbackSql(question);

  const schemaContext = await getSchemaContext(question);
  let response;
  try {
    response = await ollamaJson(
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
        '- Use explicit joins on the documented relationships.',
        '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
        '- ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join ORDERS -> ORDER_ITEMS -> PRODUCTS -> BRANDS.',
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
  } catch (error) {
    const validation = validateReadOnlySql(fallbackSql);
    if (validation.ok) {
      return validation.sql;
    }
    throw error;
  }

  const sql = response?.sql || '';
  const validation = validateReadOnlySql(sql);
  if (!sql || !validation.ok) {
    const fallbackValidation = validateReadOnlySql(fallbackSql);
    if (fallbackValidation.ok) {
      return fallbackValidation.sql;
    }
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
      '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
      '- ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join ORDERS -> ORDER_ITEMS -> PRODUCTS -> BRANDS.',
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

  let connection;
  try {
    connection = await db.getConnection();
    await setDemoUserContext(connection, demoUser);

    const result = await connection.execute(validation.sql, {}, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      maxRows,
    });

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
      rows.push(processedRow);
    }

    return {
      columns: (result.metaData || []).map((column) => column.name),
      rows,
      rowCount: rows.length,
      sql: validation.sql,
    };
  } finally {
    if (connection) {
      try { await db.clearUserContext(connection); } catch (_) {}
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function runQuestionQuery(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, maxRows = 200 } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const resolution = await resolveQuestionEntities(question);
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

async function generateQuestionSql(question, { mode = 'showsql', profile = DEFAULT_PROFILE } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const resolution = await resolveQuestionEntities(question);
  const sql = await generateReadOnlySql(resolution.question, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
  });

  return {
    sql,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    resolvedQuestion: resolution.question,
  };
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

function formatAnswerColumn(column) {
  return String(column || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatRowPreview(row, columns, maxColumns = 4) {
  return columns
    .slice(0, maxColumns)
    .map((column) => `${formatAnswerColumn(column)} ${formatValue(row[column])}`)
    .join(', ');
}

function deterministicSummary({ mode = 'narrate', sql, columns, rows, rowCount }) {
  if (!rows || rows.length === 0) {
    return mode === 'chat'
      ? 'I checked the governed Harborstone hospitality data for that follow-up and did not find matching rows. Try narrowing by property, brand tier, signal source, or date window.'
      : 'No matching rows were found in the governed Harborstone hospitality data for that question.';
  }

  if (rowCount === 1) {
    const entries = Object.entries(rows[0]).map(([key, value]) => `${formatAnswerColumn(key)} ${formatValue(value)}`);
    return mode === 'chat'
      ? `Yes. I found one matching Harborstone record: ${entries.join(', ')}.`
      : `Executive readout: one Harborstone hospitality record matched the question. ${entries.join(', ')}.`;
  }

  const preview = rows.slice(0, 5).map((row) => formatRowPreview(row, columns));

  if (mode === 'chat') {
    return `Continuing the conversation, I found ${rowCount} matching rows. The strongest results are: ${preview.join(' | ')}. Ask me to break this down by property, guest segment, signal source, room type, or property hotel and I will keep the same context.`;
  }

  return `Executive readout: ${rowCount} Harborstone hospitality rows matched the question. The leading results are ${preview.join(' | ')}. Use the SQL evidence below to inspect the governed Oracle query path.`;
}

async function summarizeQueryResult({ question, mode = 'narrate', sql, columns, rows, rowCount, profile = DEFAULT_PROFILE, conversationContext = [] }) {
  return deterministicSummary({ mode, sql, columns, rows, rowCount });
}

function buildKeyFindings({ mode = 'narrate', columns = [], rows = [], rowCount = 0 }) {
  if (!rows?.length) {
    return ['No governed Harborstone rows matched the question.'];
  }

  const first = rows[0];
  const findings = [
    `${rowCount.toLocaleString()} governed row${rowCount === 1 ? '' : 's'} returned from Oracle AI Database 26ai.`,
  ];

  if (columns.length > 0) {
    findings.push(`Primary evidence fields: ${columns.slice(0, 4).map(formatAnswerColumn).join(', ')}.`);
  }

  if (mode === 'chat') {
    findings.push(`Current lead result: ${formatRowPreview(first, columns, 3)}.`);
  } else {
    findings.push(`Top Harborstone result: ${formatRowPreview(first, columns, 3)}.`);
  }

  return findings;
}

function buildFollowUpQuestions(question, columns = []) {
  const q = String(question || '').toLowerCase();
  const columnSet = new Set((columns || []).map((column) => String(column || '').toUpperCase()));

  if (/service recovery cases|connected guest value/.test(q) || columnSet.has('CONNECTED_ACCOUNT_VALUE')) {
    return [
      'Break down service recovery-linked case value by property.',
      'Show service recovery-linked cases by guest tier.',
      'Show service recovery-linked cases by operations center.',
    ];
  }

  if (/signal|ota|ota|brand-standard|risk/.test(q)) {
    return [
      'Show signal-linked reservation value by property.',
      'Show risk signal sources with the highest revenue impact.',
      'Show guest tiers with the highest signal-linked revenue impact.',
    ];
  }

  if (/hotel|sla|operations center|capacity/.test(q)) {
    return [
      'Show service recovery-linked cases by operations center.',
      'Show hotels with the highest utilization.',
      'Show signal-linked reservation value by property.',
    ];
  }

  return [
    'Show signal-linked reservation value by property.',
    'Show guest tiers with the highest signal-linked revenue impact.',
    'Show risk signal sources with the highest revenue impact.',
  ];
}

function invalidateMetadataCaches() {
  schemaCache = {
    expiresAt: 0,
    grouped: {},
    tableComments: {},
  };
  entityCache = {
    expiresAt: 0,
    catalogs: {},
  };
}

async function answerQuestion(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, conversationContext = [] } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const effectiveQuestion = conversationContext?.length
    ? resolveConversationQuestion(question, conversationContext)
    : question;
  const result = await runQuestionQuery(effectiveQuestion, {
    mode,
    demoUser,
    profile: resolvedProfile,
  });
  const answer = await summarizeQueryResult({
    question: effectiveQuestion,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    conversationContext,
  });

  return {
    answer,
    resultSummary: `${result.rowCount} row${result.rowCount === 1 ? '' : 's'} returned from the governed Harborstone hospitality schema.`,
    keyFindings: buildKeyFindings({
      mode,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
    }),
    followUpQuestions: buildFollowUpQuestions(question, result.columns),
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    repairedFromSql: result.repairedFromSql || null,
    resolvedQuestion: effectiveQuestion,
  };
}

async function summarizeContext({ question, instructions, context }, generationOptions = {}) {
  return ollamaText(
    [
      'You are an operations analyst for a hospitality performance and operations platform.',
      'Answer only from the supplied JSON context.',
      'Be concise, specific, and truthful.',
      'If the context is incomplete, say so plainly.',
      instructions || '',
    ].join('\n'),
    `Question: ${question}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.2, ...generationOptions }
  );
}

async function generateText({ systemPrompt = '', userPrompt = '' }, generationOptions = {}) {
  return ollamaText(systemPrompt, userPrompt, generationOptions);
}

module.exports = {
  DEFAULT_PROFILE,
  OLLAMA_MODEL,
  answerQuestion,
  executeReadOnlySql,
  generateText,
  generateQuestionSql,
  generateReadOnlySql,
  getAvailableProfiles,
  getAvailableSelectAiProfiles,
  getProfileModel,
  invalidateMetadataCaches,
  normalizeProfile,
  runQuestionQuery,
  summarizeContext,
  validateReadOnlySql,
};
