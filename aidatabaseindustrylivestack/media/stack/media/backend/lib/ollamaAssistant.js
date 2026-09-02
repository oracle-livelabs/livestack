const db = require('../config/database');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_PROFILE = 'SC_LLAMA_PROFILE';
const OLLAMA_REQUEST_TIMEOUT_MS = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '45000', 10);
const ASKDATA_MAX_ROWS = Math.max(1, Math.min(parseInt(process.env.ASKDATA_MAX_ROWS || '200', 10), 500));
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
const OLLAMA_UNAVAILABLE_MESSAGE = 'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.';
const OLLAMA_MODEL_MISSING_MESSAGE = `Model ${OLLAMA_MODEL} is not available in Ollama. Pull or configure the model before using Ask Media and Entertainment Data.`;
const GOVERNED_SCHEMA_BLOCK_MESSAGE = 'This query was not executed because it falls outside the allowed governed media and entertainment schema.';
const ASKDATA_ERROR_MESSAGES = Object.freeze({
  OLLAMA_UNAVAILABLE: OLLAMA_UNAVAILABLE_MESSAGE,
  OLLAMA_MODEL_MISSING: OLLAMA_MODEL_MISSING_MESSAGE,
  OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
  MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific media and entertainment data question.',
  SQL_GENERATION_FAILED: 'Unable to generate a safe Oracle SQL query for that question. Try rephrasing with a more specific metric, time window, or entity.',
  SQL_VALIDATION_BLOCKED: GOVERNED_SCHEMA_BLOCK_MESSAGE,
  ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific metric or governed media view.',
  VPD_ACCESS_ISSUE: 'The governed access context could not be applied for this request.',
  UNEXPECTED_BACKEND_RESPONSE: 'Ask Media and Entertainment Data received an unexpected backend response.',
  REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
});
const ALLOWED_TABLES = [
  'AGENT_ACTIONS',
  'APP_USERS',
  'BRANDS',
  'CUSTOMERS',
  'DEMAND_FORECASTS',
  'DEMAND_REGIONS',
  'EVENT_STREAM',
  'FULFILLMENT_CENTERS',
  'FULFILLMENT_ZONES',
  'INFLUENCERS',
  'INFLUENCER_CONNECTIONS',
  'INVENTORY',
  'MEDIA_AUDIENCE_SIGNALS_V',
  'MEDIA_CAMPAIGN_ORDERS_V',
  'MEDIA_CONTENT_ASSETS_V',
  'MEDIA_CREATOR_RELATIONSHIPS_V',
  'MEDIA_DISTRIBUTION_CAPACITY_V',
  'ORDERS',
  'ORDER_ITEMS',
  'POST_PRODUCT_MENTIONS',
  'PRODUCTS',
  'SHIPMENTS',
  'SOCIAL_POSTS',
];
const ALLOWED_TABLE_SET = new Set(ALLOWED_TABLES);
const SCHEMA_DOMAIN_ORDER = [
  'Campaign Requests',
  'Content Assets',
  'Audience Signals',
  'Audience Segments',
  'Distribution & Capacity',
  'Creator Graph',
  'AI Agent Actions',
  'Reference Data',
];

function schemaObject(objectName, objectType, domain, displayName, description, exampleQuestions = []) {
  return Object.freeze({
    object_name: objectName.toLowerCase(),
    object_type: objectType,
    domain,
    display_name: displayName,
    description,
    example_questions: Object.freeze(exampleQuestions),
    is_queryable_by_assistant: true,
  });
}

const MEDIA_SCHEMA_OBJECT_METADATA = Object.freeze([
  schemaObject(
    'MEDIA_CAMPAIGN_ORDERS_V',
    'view',
    'Campaign Requests',
    'Media Campaign Requests',
    'Media-facing view of campaign requests, audience accounts, campaign value, signal attribution, line counts, and assigned distribution hub.',
    ['Which audience segments have the highest campaign value?', 'How many campaign requests have an audience signal source?']
  ),
  schemaObject(
    'ORDERS',
    'table',
    'Campaign Requests',
    'Campaign Request Compatibility Rows',
    'Physical order table retained for import and API compatibility; media-facing questions should prefer media_campaign_orders_v when possible.',
    ['Count campaign requests.', 'Show campaign status by value.']
  ),
  schemaObject(
    'ORDER_ITEMS',
    'table',
    'Campaign Requests',
    'Campaign Line Items',
    'Line-item table connecting campaign requests to content assets with quantity and campaign value.',
    ['Which content assets have the most requested units?', 'Show campaign line value by content asset.']
  ),
  schemaObject(
    'MEDIA_CONTENT_ASSETS_V',
    'view',
    'Content Assets',
    'Media Content Assets',
    'Media-facing view of content assets, studios and publishers, content categories, available capacity, and audience signal counts.',
    ['Which content assets are driving the most campaign value?', 'Show content assets by audience signal count.']
  ),
  schemaObject(
    'PRODUCTS',
    'table',
    'Content Assets',
    'Content Asset Compatibility Rows',
    'Physical content asset catalog retained as products for baseline compatibility.',
    ['Show active content assets by category.', 'Which content assets launched recently?']
  ),
  schemaObject(
    'BRANDS',
    'table',
    'Content Assets',
    'Studios and Publishers',
    'Studios, publishers, labels, creators, and rights owners represented on the inherited brands table.',
    ['Which studios have the highest campaign value?', 'Show studios by content category.']
  ),
  schemaObject(
    'MEDIA_AUDIENCE_SIGNALS_V',
    'view',
    'Audience Signals',
    'Media Audience Signals',
    'Signals from viewers, subscribers, fans, creators, streams, and campaign activity with urgency, sentiment, and momentum fields.',
    ['Which audience signal posts have urgency score above 80?', 'Which platforms are rising fastest?']
  ),
  schemaObject(
    'SOCIAL_POSTS',
    'table',
    'Audience Signals',
    'Audience Signal Records',
    'Inherited signal table storing fan, subscriber, creator, stream, campaign, moderation, and engagement signals.',
    ['Count signals by platform.', 'Show high urgency audience signals.']
  ),
  schemaObject(
    'CUSTOMERS',
    'table',
    'Audience Segments',
    'Audience Accounts',
    'Synthetic audience accounts representing viewers, subscribers, and fans for segmentation and VPD demos.',
    ['Which audience accounts have the most campaign requests?', 'Show audience activity by region.']
  ),
  schemaObject(
    'MEDIA_DISTRIBUTION_CAPACITY_V',
    'view',
    'Distribution & Capacity',
    'Media Distribution Capacity',
    'Media-facing capacity view for distribution hubs, live event capacity, content inventory, regional demand, and capacity risk.',
    ['Which distribution hubs have the most available live-event capacity?', 'Show capacity risk by content asset.']
  ),
  schemaObject(
    'FULFILLMENT_CENTERS',
    'table',
    'Distribution & Capacity',
    'Distribution Hub Compatibility Rows',
    'Distribution, content operations, ad operations, rights, release, and live-event hubs on the inherited fulfillment center table.',
    ['Show active distribution hubs.', 'Which hubs are in California?']
  ),
  schemaObject(
    'INVENTORY',
    'table',
    'Distribution & Capacity',
    'Content Capacity Inventory',
    'Capacity and inventory units for content assets at distribution hubs.',
    ['Which content assets are below capacity threshold?', 'Show capacity by hub.']
  ),
  schemaObject(
    'DEMAND_FORECASTS',
    'table',
    'Distribution & Capacity',
    'Audience Demand Forecasts',
    'Forecast records for viewer, fan, and subscriber demand by region and content asset.',
    ['Which content assets have the highest forecast demand?', 'Show forecast confidence by region.']
  ),
  schemaObject(
    'MEDIA_CREATOR_RELATIONSHIPS_V',
    'view',
    'Creator Graph',
    'Media Creator Relationships',
    'Media-facing view of creator, fan community, studio, and publisher relationships with engagement and attributed revenue.',
    ['Which creators have the highest influence score?', 'Show creator relationships for a studio.']
  ),
  schemaObject(
    'INFLUENCERS',
    'table',
    'Creator Graph',
    'Creators and Influencers',
    'Creators, fan community leaders, and content influencers represented on the inherited influencers table.',
    ['Show verified creators by platform.', 'Which creators have the highest engagement rate?']
  ),
  schemaObject(
    'AGENT_ACTIONS',
    'table',
    'AI Agent Actions',
    'Media and Entertainment Agent Actions',
    'Auditable AI-assisted actions for audience operations, campaign personalization, distribution capacity, moderation, retention, and monetization workflows.',
    ['Which AI agent actions are pending?', 'Show actions by confidence.']
  ),
  schemaObject(
    'APP_USERS',
    'table',
    'Reference Data',
    'Application Users',
    'Demo users used for role, region, VPD, and user-context workflows.',
    ['Which demo users are available?', 'Show users by role.']
  ),
]);

const PROFILE_CATALOG = Object.freeze({
  [DEFAULT_PROFILE]: Object.freeze({
    name: DEFAULT_PROFILE,
    status: 'ENABLED',
    model: OLLAMA_MODEL,
    provider: 'Ollama',
    type: 'Local SQL + reasoning',
    description: 'Primary local Ollama model for Ask Media and Entertainment Data.',
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
  'MEDIA_CAMPAIGN_ORDERS_V exposes campaign_order_id, campaign_status, campaign_value, audience_account, audience_tier, audience_region, distribution_hub, line_count, and requested_units.',
  'MEDIA_CONTENT_ASSETS_V exposes content_asset, content_category, studio_or_label, total_capacity_units, reserved_capacity_units, audience_signal_count, avg_virality_score, and latest_signal_at.',
  'MEDIA_AUDIENCE_SIGNALS_V exposes audience_signal_text, platform, sentiment_score, virality_score, momentum_flag, creator_handle, creator_name, creator_niche, and matched_content_assets.',
  'MEDIA_DISTRIBUTION_CAPACITY_V exposes distribution_hub, hub_type, content_asset, content_category, capacity_units_available, capacity_units_reserved, predicted_demand, forecast_date, and audience_signal_factor.',
  'MEDIA_CREATOR_RELATIONSHIPS_V exposes creator_handle, creator_name, platform, niche, follower_count, engagement_rate, influence_score, studio_or_label, relationship_type, and content_revenue_attributed.',
  'PRODUCTS.BRAND_ID joins to BRANDS.BRAND_ID.',
  'ORDER_ITEMS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'ORDER_ITEMS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join ORDERS -> ORDER_ITEMS -> PRODUCTS -> BRANDS.',
  'ORDERS.CUSTOMER_ID joins to CUSTOMERS.CUSTOMER_ID.',
  'ORDERS.FULFILLMENT_CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'ORDERS.SOCIAL_SOURCE_ID links to SOCIAL_POSTS.POST_ID for social-driven orders.',
  'INVENTORY.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'INVENTORY.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'SOCIAL_POSTS.INFLUENCER_ID joins to INFLUENCERS.INFLUENCER_ID.',
  'POST_PRODUCT_MENTIONS.POST_ID joins to SOCIAL_POSTS.POST_ID.',
  'POST_PRODUCT_MENTIONS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'SHIPMENTS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'SHIPMENTS.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'ORDER_ITEMS.LINE_TOTAL already stores quantity * unit_price.',
  'BRANDS.BRAND_NAME only exists on BRANDS; do not reference BRAND_NAME unless BRANDS is joined in the same query block.',
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

function getOllamaRuntimeConfig(profile = DEFAULT_PROFILE) {
  return {
    host: OLLAMA_BASE_URL,
    model: getProfileModel(profile),
    timeoutMs: OLLAMA_REQUEST_TIMEOUT_MS,
  };
}

function getMediaSchemaObjectMetadata() {
  return MEDIA_SCHEMA_OBJECT_METADATA;
}

function isAssistantQueryableObject(objectName) {
  const normalized = String(objectName || '').trim().toUpperCase();
  return MEDIA_SCHEMA_OBJECT_METADATA.some((object) => object.object_name.toUpperCase() === normalized);
}

function groupMediaSchemaObjectMetadata(objects = MEDIA_SCHEMA_OBJECT_METADATA) {
  const domainRank = new Map(SCHEMA_DOMAIN_ORDER.map((domain, index) => [domain, index]));
  const groups = new Map();
  for (const object of objects) {
    const domain = object.domain || 'Reference Data';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(object);
  }
  return [...groups.entries()]
    .sort(([leftDomain], [rightDomain]) => {
      const leftRank = domainRank.get(leftDomain) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = domainRank.get(rightDomain) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || leftDomain.localeCompare(rightDomain);
    })
    .map(([domain, domainObjects]) => ({
      domain,
      object_count: domainObjects.length,
      objects: domainObjects.slice().sort((left, right) => left.display_name.localeCompare(right.display_name)),
    }));
}

function createAskDataError(category, cause = null, extra = {}) {
  const causeError = typeof cause === 'string' ? new Error(cause) : cause;
  const error = new Error(
    extra.message
    || (typeof cause === 'string' ? cause : null)
    || ASKDATA_ERROR_MESSAGES[category]
    || ASKDATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE
  );
  error.category = category || 'UNEXPECTED_BACKEND_RESPONSE';
  error.statusCode = extra.statusCode || null;
  error.developerMessage = causeError?.message || extra.developerMessage || error.message;
  error.sql = extra.sql || causeError?.sql || null;
  error.profile = extra.profile || causeError?.profile || null;
  error.model = extra.model || causeError?.model || (error.profile ? getProfileModel(error.profile) : null);
  error.oracleError = extra.oracleError || causeError?.oracleError || null;
  if (causeError) error.cause = causeError;
  return error;
}

function normalizeAskDataError(error) {
  const category = error?.category
    || (error?.isUserQueryError ? 'SQL_GENERATION_FAILED' : null)
    || (/timeout/i.test(error?.message || '') ? 'REQUEST_TIMEOUT' : null)
    || (/Ollama request failed \(404\)|model .* not found/i.test(error?.message || '') ? 'OLLAMA_MODEL_MISSING' : null)
    || (/fetch failed|ECONNREFUSED|ENOTFOUND|Ollama request failed/i.test(error?.message || '') ? 'OLLAMA_UNAVAILABLE' : null)
    || (/Only SELECT or WITH|not allowed|unsupported tables|valid Oracle SQL query|Oracle equivalents|PostgreSQL syntax/i.test(error?.message || '') ? 'SQL_VALIDATION_BLOCKED' : null)
    || (/ORA-\d{5}|Oracle could not execute/i.test(error?.message || '') ? 'ORACLE_QUERY_FAILED' : null)
    || 'UNEXPECTED_BACKEND_RESPONSE';
  const statusCode = error?.statusCode
    || (category === 'REQUEST_TIMEOUT' ? 504 : null)
    || (['SQL_GENERATION_FAILED', 'SQL_VALIDATION_BLOCKED'].includes(category) ? 400 : null)
    || (['OLLAMA_UNAVAILABLE', 'OLLAMA_MODEL_MISSING'].includes(category) ? 503 : 500);
  return {
    category,
    statusCode,
    userMessage: ASKDATA_ERROR_MESSAGES[category] || error?.message || ASKDATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE,
    developerMessage: error?.developerMessage || error?.message || String(error || ''),
    sql: error?.sql || null,
    profile: error?.profile || null,
    model: error?.model || (error?.profile ? getProfileModel(error.profile) : null),
    oracleError: error?.oracleError || null,
  };
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

  const [brandsResult, productsResult, centersResult, customersResult, influencersResult] = await Promise.all([
    db.execute(`SELECT brand_name AS value FROM brands ORDER BY brand_name`),
    db.execute(`SELECT product_name AS value FROM products ORDER BY product_name`),
    db.execute(`SELECT center_name AS value FROM fulfillment_centers ORDER BY center_name`),
    db.execute(`
      SELECT TRIM(first_name || ' ' || last_name) AS value FROM customers
      UNION
      SELECT email AS value FROM customers
    `),
    db.execute(`
      SELECT handle AS value FROM influencers
      UNION
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
      customer: buildCatalog(customersResult.rows, 'customer'),
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
    ? ` Try a known brand such as ${formatEntityList(brandSuggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't map "${candidate}" to this demo schema. This app does not model retailers or storefronts. Ask about studios and labels, content assets, subscribers, distribution hubs, or content creators instead.${suggestionText}`
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
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (error) {
        throw createAskDataError('MALFORMED_LLM_RESPONSE', error);
      }
    }
    throw createAskDataError('MALFORMED_LLM_RESPONSE', new Error('Ollama returned invalid JSON'));
  }
}

async function ollamaGenerate(prompt, {
  format = null,
  temperature = 0.1,
  numPredict = 192,
  profile = DEFAULT_PROFILE,
  trace = null,
} = {}) {
  const { model } = getProfileConfig(profile);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_REQUEST_TIMEOUT_MS);
  let response;
  const startedAt = Date.now();
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
  } catch (error) {
    if (trace) trace.ollamaDurationMs = (trace.ollamaDurationMs || 0) + (Date.now() - startedAt);
    if (error?.name === 'AbortError') {
      throw createAskDataError('OLLAMA_TIMEOUT', error, { profile, model });
    }
    throw createAskDataError('OLLAMA_UNAVAILABLE', error, { profile, model });
  } finally {
    clearTimeout(timer);
  }
  if (trace) trace.ollamaDurationMs = (trace.ollamaDurationMs || 0) + (Date.now() - startedAt);

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    if (response.status === 404 || /not found|model/i.test(body)) {
      throw createAskDataError('OLLAMA_MODEL_MISSING', new Error(body), { profile, model, statusCode: 503 });
    }
    throw createAskDataError('OLLAMA_UNAVAILABLE', new Error(`Ollama request failed (${response.status}): ${body}`), { profile, model, statusCode: 503 });
  }

  const payload = await response.json();
  return stripCodeFences(payload?.response || '');
}

async function ollamaJson(systemPrompt, userPrompt, {
  profile = DEFAULT_PROFILE,
  temperature = 0.05,
  numPredict = 160,
  trace = null,
} = {}) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature, numPredict, profile, trace }
  );
  return parseJsonResponse(text);
}

async function ollamaText(systemPrompt, userPrompt, { temperature = 0.2, profile = DEFAULT_PROFILE, trace = null } = {}) {
  return ollamaGenerate(`${systemPrompt}\n\n${userPrompt}`, {
    temperature,
    numPredict: 220,
    profile,
    trace,
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

  if (/(viral|virality|trend|trending|momentum|social|post|influencer|creator|engagement|viewer|viewers|subscriber|subscribers|fan|fans|watch|retention|churn|moderation|toxicity|fraud|sentiment|audience|platform)/.test(q)) {
    ['MEDIA_AUDIENCE_SIGNALS_V', 'MEDIA_CREATOR_RELATIONSHIPS_V', 'BRANDS', 'INFLUENCERS', 'POST_PRODUCT_MENTIONS', 'PRODUCTS', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(inventory|fulfillment|distribution|warehouse|hub|capacity|live event|event|premiere event|release|rights|ad ops|campaign inventory|route|routing|center|nearest|demand|forecast)/.test(q)) {
    ['MEDIA_DISTRIBUTION_CAPACITY_V', 'CUSTOMERS', 'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'FULFILLMENT_CENTERS', 'FULFILLMENT_ZONES', 'INVENTORY', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(order|orders|campaign|campaigns|revenue|monetization|value|subscriber|customer|audience|studio|publisher|label|brand|product|content|asset|title|stream|price|category|total|average|best-selling|segment)/.test(q)) {
    ['MEDIA_CAMPAIGN_ORDERS_V', 'MEDIA_CONTENT_ASSETS_V', 'BRANDS', 'CUSTOMERS', 'ORDERS', 'ORDER_ITEMS', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(user|users|region|role|account)/.test(q)) {
    ['APP_USERS'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    ['MEDIA_CAMPAIGN_ORDERS_V', 'MEDIA_CONTENT_ASSETS_V', 'MEDIA_AUDIENCE_SIGNALS_V', 'BRANDS', 'CUSTOMERS', 'ORDERS', 'ORDER_ITEMS', 'PRODUCTS', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
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
    '- MEDIA_CAMPAIGN_ORDERS_V is the preferred media-facing surface for campaign request, subscriber, viewer, fan, audience segment, and monetization questions.',
    '- MEDIA_CONTENT_ASSETS_V is the preferred media-facing surface for content asset, stream, studio, publisher, label, recommendation, and content performance questions.',
    '- MEDIA_AUDIENCE_SIGNALS_V is the preferred media-facing surface for viewer, fan, creator, moderation, toxicity, churn, engagement, retention, and audience signal questions.',
    '- MEDIA_DISTRIBUTION_CAPACITY_V is the preferred media-facing surface for live event, release, premiere event, rights, ad operations, capacity, and distribution questions.',
    '- SOCIAL_POSTS.MOMENTUM_FLAG values include normal, rising, viral, and mega_viral.',
    '- INVENTORY capacity-risk logic typically compares QUANTITY_ON_HAND to REORDER_POINT.',
    '- Campaign value questions usually use MEDIA_CAMPAIGN_ORDERS_V.CAMPAIGN_VALUE or ORDER_ITEMS.LINE_TOTAL.',
  ].join('\n');
}

function sanitizeSql(sql) {
  return stripCodeFences(String(sql || ''))
    .replace(/;+\s*$/g, '')
    .trim();
}

function ensureSqlRowLimit(sql, maxRows = ASKDATA_MAX_ROWS) {
  const normalized = sanitizeSql(sql);
  const limit = Math.max(1, Math.min(parseInt(maxRows, 10) || ASKDATA_MAX_ROWS, ASKDATA_MAX_ROWS));
  if (!normalized || /\bFETCH\s+FIRST\s+\d+\s+ROWS?\s+ONLY\b/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}\nFETCH FIRST ${limit} ROWS ONLY`;
}

function isUnsafeSqlIntent(question) {
  const normalized = String(question || '').trim();
  return /^(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|EXEC|CALL|DECLARE|BEGIN)\b/i.test(normalized);
}

function generatePatternSql(question) {
  const q = String(question || '').trim();
  const qLower = q.toLowerCase();

  const topMatch = qLower.match(/\btop\s+(\d+)\b/);
  const topN = topMatch ? Math.min(parseInt(topMatch[1], 10), 25) : 5;
  const dayMatch = qLower.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  const dayWindow = dayMatch ? Math.min(parseInt(dayMatch[1], 10), 365) : (/this week|weekly|weekend/.test(qLower) ? 7 : null);

  if (/\bchurn risk\b.*\b(?:this|that|the) audience segment\b|\b(?:this|that|the) audience segment\b.*\bchurn risk\b/.test(qLower)) {
    return `SELECT campaign_order_id AS launch_event_request,
                   audience_account,
                   audience_tier AS audience_segment,
                   audience_region,
                   ROUND(campaign_value, 2) AS campaign_value_at_risk,
                   CASE
                     WHEN audience_tier IN ('VIP', 'Premium') AND audience_signal_source_id IS NOT NULL THEN 'High churn risk'
                     WHEN audience_tier IN ('VIP', 'Premium') THEN 'Elevated churn risk'
                     WHEN audience_signal_source_id IS NOT NULL THEN 'Signal-driven churn risk'
                     ELSE 'Revenue concentration risk'
                   END AS churn_risk,
                   CASE
                     WHEN audience_tier IN ('VIP', 'Premium') AND audience_signal_source_id IS NOT NULL THEN 'High-value audience with an active audience signal'
                     WHEN audience_tier IN ('VIP', 'Premium') THEN 'High-value audience retention exposure'
                     WHEN audience_signal_source_id IS NOT NULL THEN 'Active audience signal influenced this launch'
                     ELSE 'Campaign value is concentrated in this launch'
                   END AS risk_driver
            FROM media_campaign_orders_v
            ORDER BY
              CASE WHEN audience_signal_source_id IS NOT NULL THEN 0 ELSE 1 END,
              CASE audience_tier
                WHEN 'VIP' THEN 0
                WHEN 'Premium' THEN 1
                WHEN 'Gold' THEN 2
                ELSE 3
              END,
              campaign_value DESC,
              requested_units DESC
            FETCH FIRST 1 ROW ONLY`;
  }

  const resolvedLaunchIds = /\b(?:launch event|campaign (?:order|request))s?\b/.test(qLower)
    ? [...new Set((q.match(/\b\d{4,}\b/g) || []).map((value) => Number(value)))]
      .filter(Number.isSafeInteger)
      .slice(0, 25)
    : [];
  if (resolvedLaunchIds.length > 0) {
    const idList = resolvedLaunchIds.join(', ');
    if (/\b(?:average|avg|mean)\b.*\bcampaign value\b|\bcampaign value\b.*\b(?:average|avg|mean)\b/.test(qLower)) {
      return `SELECT ROUND(AVG(campaign_value), 2) AS avg_campaign_value_at_risk,
                     COUNT(*) AS launch_event_count
              FROM media_campaign_orders_v
              WHERE campaign_order_id IN (${idList})`;
    }
    return `SELECT campaign_order_id AS launch_event_request,
                   audience_account,
                   audience_tier,
                   audience_region,
                   distribution_hub AS coverage_desk,
                   campaign_status,
                   ROUND(campaign_value, 2) AS campaign_value_at_risk,
                   requested_units
            FROM media_campaign_orders_v
            WHERE campaign_order_id IN (${idList})
            ORDER BY CASE campaign_order_id ${resolvedLaunchIds
              .map((id, index) => `WHEN ${id} THEN ${index}`)
              .join(' ')} ELSE ${resolvedLaunchIds.length} END`;
  }

  if (/(how many campaign (?:orders|requests).*\b(in total|total|overall)\b|summarize .*how many campaign (?:orders|requests)|summarize .*total campaign (?:orders|requests)|total campaign (?:order|request) count|overall campaign (?:order|request) count|count of campaign (?:orders|requests))/.test(qLower)) {
    return `SELECT COUNT(*) AS total_campaign_requests FROM media_campaign_orders_v`;
  }

  if (/total content revenue.*all campaign (?:orders|requests)|content revenue from all campaign (?:orders|requests)|overall content revenue/.test(qLower)) {
    return `SELECT ROUND(SUM(campaign_value), 2) AS total_campaign_value FROM media_campaign_orders_v`;
  }

  if (/content revenue.*content category|content revenue by category|content category.*content revenue|breakdown by category|campaign value.*content category|content category.*campaign value/.test(qLower)) {
    return `SELECT ca.content_category,
                   COUNT(DISTINCT co.campaign_order_id) AS campaign_requests,
                   ROUND(SUM(oi.line_total), 2) AS campaign_value
            FROM media_campaign_orders_v co
            JOIN order_items oi ON oi.order_id = co.campaign_order_id
            JOIN media_content_assets_v ca ON ca.product_id = oi.product_id
            GROUP BY ca.content_category
            ORDER BY campaign_value DESC`;
  }

  if (/(launch events?.*(?:churn|revenue|monetization|retention|risk)|greatest churn or revenue risk|revenue risk.*weekend|churn.*risk.*weekend|most exposed to churn risk)/.test(qLower)) {
    return `SELECT campaign_order_id AS launch_event_request,
                   audience_account,
                   audience_tier,
                   audience_region,
                   distribution_hub AS coverage_desk,
                   campaign_status,
                   ROUND(campaign_value, 2) AS campaign_value_at_risk,
                   requested_units,
                   CASE
                     WHEN audience_tier IN ('VIP', 'Premium') AND audience_signal_source_id IS NOT NULL THEN 'High-value audience with active signal-driven churn risk'
                     WHEN audience_tier IN ('VIP', 'Premium') THEN 'High-value audience retention risk'
                     WHEN audience_signal_source_id IS NOT NULL THEN 'Audience signal influenced launch risk'
                     ELSE 'Revenue concentration risk'
                   END AS risk_driver
            FROM media_campaign_orders_v
            ORDER BY
              CASE WHEN audience_signal_source_id IS NOT NULL THEN 0 ELSE 1 END,
              CASE audience_tier
                WHEN 'VIP' THEN 0
                WHEN 'Premium' THEN 1
                WHEN 'Gold' THEN 2
                ELSE 3
              END,
              campaign_value DESC,
              requested_units DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/content assets?.*(driving|highest|top|most).*(campaign value|content revenue|revenue)|top content assets?.*(campaign value|content revenue|revenue)|campaign value.*content assets?|which is the best content asset|what is the best content asset|top .*content assets.*content revenue|content assets by content revenue/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(co.campaign_created_at AS DATE) >= TRUNC(SYSDATE) - ${dayWindow}` : '';
    const limit = (!topMatch && /best content asset/.test(qLower)) ? 1 : topN;
    return `SELECT ca.content_asset,
                   ca.studio_or_label AS studio_or_publisher,
                   ca.content_category,
                   COUNT(DISTINCT co.campaign_order_id) AS campaign_orders,
                   ROUND(SUM(oi.line_total), 2) AS campaign_value,
                   SUM(oi.quantity) AS requested_units
            FROM media_campaign_orders_v co
            JOIN order_items oi ON oi.order_id = co.campaign_order_id
            JOIN media_content_assets_v ca ON ca.product_id = oi.product_id
            ${dateFilter}
            GROUP BY ca.content_asset, ca.studio_or_label, ca.content_category
            ORDER BY campaign_value DESC, requested_units DESC
            FETCH FIRST ${limit} ROWS ONLY`;
  }

  if (/audience segments?.*(highest|most|top|worth).*(campaign value|revenue|value)|campaign value.*audience segments?/.test(qLower)) {
    return `SELECT audience_tier AS audience_segment,
                   COUNT(campaign_order_id) AS campaign_orders,
                   ROUND(SUM(campaign_value), 2) AS campaign_value,
                   ROUND(AVG(campaign_value), 2) AS avg_campaign_value,
                   SUM(CASE WHEN audience_signal_source_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_influenced_orders
            FROM media_campaign_orders_v
            GROUP BY audience_tier
            ORDER BY campaign_value DESC, signal_influenced_orders DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  const viralityMatch = qLower.match(/(?:urgency|virality) score above\s+(\d+)/);
  if (/(how many audience signal posts|how many social posts)/.test(qLower) && viralityMatch) {
    return `SELECT COUNT(*) AS urgent_audience_signal_posts
            FROM media_audience_signals_v
            WHERE virality_score > ${parseInt(viralityMatch[1], 10)}`;
  }

  if (/audience signals?.*(highest|top|most).*(urgency|virality|momentum)|highest urgency/.test(qLower)) {
    return `SELECT audience_signal_id,
                   platform,
                   creator_handle,
                   creator_name,
                   audience_signal_text,
                   virality_score AS urgency_score,
                   momentum_flag,
                   views_count,
                   posted_at
            FROM media_audience_signals_v
            ORDER BY virality_score DESC, views_count DESC, posted_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/distribution hubs have the most available live-?event capacity|distribution hubs have the most available capacity|live-?event hubs.*capacity|coverage desks?.*(available|support).*capacity|centers have the most capacity|most capacity/.test(qLower)) {
    return `SELECT distribution_hub AS coverage_desk,
                   hub_type AS coverage_desk_type,
                   state_province AS coverage_region,
                   COUNT(DISTINCT content_asset_id) AS content_assets_ready,
                   SUM(capacity_units_available) AS capacity_units_available,
                   SUM(capacity_units_reserved) AS capacity_units_reserved,
                   ROUND(AVG(current_load_pct), 2) AS avg_load_pct
            FROM media_distribution_capacity_v
            GROUP BY distribution_hub, hub_type, state_province
            ORDER BY capacity_units_available DESC, content_assets_ready DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(capacity|rights).*(issues?|constraints?|risk).*(launch events?|these launch events?|events?)|(?:launch events?|these launch events?|events?).*(capacity|rights).*(issues?|constraints?|risk)|capacity risk by content asset|show capacity risk/.test(qLower)) {
    return `SELECT distribution_hub AS coverage_desk,
                   content_asset,
                   content_category,
                   capacity_units_available,
                   predicted_demand,
                   GREATEST(NVL(predicted_demand, 0) - NVL(capacity_units_available, 0), 0) AS capacity_gap,
                   current_load_pct,
                   audience_signal_factor,
                   CASE
                     WHEN NVL(predicted_demand, 0) > NVL(capacity_units_available, 0) THEN 'Demand exceeds available rights capacity'
                     WHEN NVL(current_load_pct, 0) >= 80 THEN 'Coverage desk operating near capacity'
                     WHEN NVL(audience_signal_factor, 0) >= 1.2 THEN 'Audience signal surge watch'
                     ELSE 'Monitor live-event readiness'
                   END AS risk_driver,
                   CASE
                     WHEN NVL(predicted_demand, 0) > NVL(capacity_units_available, 0) THEN 'Rebalance the launch plan or expand rights coverage before the event window.'
                     WHEN NVL(current_load_pct, 0) >= 80 THEN 'Shift activation work to a lower-load coverage desk.'
                     WHEN NVL(audience_signal_factor, 0) >= 1.2 THEN 'Pre-stage engagement and moderation coverage for the expected audience surge.'
                     ELSE 'Monitor demand and rights readiness.'
                   END AS recommended_action
            FROM media_distribution_capacity_v
            WHERE NVL(predicted_demand, 0) > NVL(capacity_units_available, 0)
               OR NVL(current_load_pct, 0) >= 80
               OR NVL(audience_signal_factor, 0) >= 1.2
               OR NVL(capacity_units_available, 0) <= NVL(capacity_intervention_threshold, 0)
            ORDER BY
              CASE
                WHEN NVL(predicted_demand, 0) > NVL(capacity_units_available, 0) THEN 0
                WHEN NVL(current_load_pct, 0) >= 80 THEN 1
                WHEN NVL(audience_signal_factor, 0) >= 1.2 THEN 2
                ELSE 3
              END,
              capacity_gap DESC,
              current_load_pct DESC,
              audience_signal_factor DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/highest average campaign value|highest average request value|average campaign value by studio or label|average request value by studio or label|studios? or publishers?.*highest average campaign value/.test(qLower)) {
    return `SELECT studio_or_publisher,
                   ROUND(AVG(studio_campaign_value), 2) AS avg_campaign_value
            FROM (
              SELECT co.campaign_order_id,
                     ca.studio_or_label AS studio_or_publisher,
                     SUM(oi.quantity * oi.unit_price) AS studio_campaign_value
              FROM media_campaign_orders_v co
              JOIN order_items oi ON co.campaign_order_id = oi.order_id
              JOIN media_content_assets_v ca ON oi.product_id = ca.product_id
              GROUP BY co.campaign_order_id, ca.studio_or_label
            )
            GROUP BY studio_or_publisher
            ORDER BY avg_campaign_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many campaign (?:orders|requests) have (a |an )?(community |audience )?signal source|campaign (?:orders|requests).*signal source|signal-driven campaign (?:orders|requests)/.test(qLower)) {
    return `SELECT COUNT(*) AS audience_signal_influenced_campaign_requests
            FROM media_campaign_orders_v
            WHERE audience_signal_source_id IS NOT NULL`;
  }

  if (/average subscriber-signal urgency score by platform|urgency.*by platform/.test(qLower)) {
    return `SELECT platform,
                   ROUND(AVG(virality_score), 2) AS avg_urgency_score,
                   COUNT(*) AS post_count
            FROM media_audience_signals_v
            GROUP BY platform
            ORDER BY avg_urgency_score DESC`;
  }

  if (/synthetic audience accounts .*most campaign (?:orders|requests)|subscribers .*most campaign (?:orders|requests)|top synthetic audience accounts by campaign (?:orders|requests)|top audience accounts by campaign (?:orders|requests)/.test(qLower)) {
    return `SELECT c.first_name || ' ' || c.last_name AS subscriber_name,
                   c.email,
                   COUNT(o.order_id) AS campaign_request_count,
                   ROUND(SUM(o.order_total), 2) AS total_campaign_value
            FROM customers c
            JOIN orders o ON c.customer_id = o.customer_id
            GROUP BY c.first_name, c.last_name, c.email
            ORDER BY campaign_request_count DESC, total_campaign_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many campaign (?:orders|requests) were placed this week|campaign (?:orders|requests) placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS campaign_requests_this_week
            FROM media_campaign_orders_v
            WHERE CAST(campaign_created_at AS DATE) >= TRUNC(SYSDATE, 'IW')`;
  }

  if (/creators?.*(fastest-rising|rising fastest|fastest rising|producing).*(audience signals?|signals?).*(platform)?|creators?.*rising fastest.*platform|which creators are rising fastest/.test(qLower)) {
    return `SELECT mas.platform,
                   mas.creator_handle,
                   mas.creator_name,
                   mcr.studio_or_label,
                   COUNT(*) AS rising_signal_count,
                   ROUND(AVG(mas.virality_score), 2) AS avg_urgency_score,
                   SUM(mas.views_count) AS audience_reach,
                   MAX(mas.posted_at) AS latest_signal_at
            FROM media_audience_signals_v mas
            LEFT JOIN media_creator_relationships_v mcr
              ON mcr.creator_id = mas.creator_id
            WHERE mas.momentum_flag IN ('rising', 'viral', 'mega_viral')
            GROUP BY mas.platform, mas.creator_handle, mas.creator_name, mcr.studio_or_label
            ORDER BY rising_signal_count DESC, avg_urgency_score DESC, audience_reach DESC
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
  await db.setSecurityContext(connection, demoUser, { autoCommit: false });
}

async function generateReadOnlySql(question, {
  mode = 'narrate',
  profile = DEFAULT_PROFILE,
  resolutionHints = [],
  trace = null,
} = {}) {
  const startedAt = Date.now();
  if (isUnsafeSqlIntent(question)) {
    throw createAskDataError('SQL_VALIDATION_BLOCKED', new Error(GOVERNED_SCHEMA_BLOCK_MESSAGE), {
      statusCode: 400,
      profile,
    });
  }
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      if (trace) {
        trace.sqlGenerationDurationMs = Date.now() - startedAt;
        trace.sqlGenerationSource = 'deterministic_pattern';
        trace.sqlValidationOk = true;
      }
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
    { profile, trace, temperature: 0.02, numPredict: 420 }
  );

  const sql = response?.sql || '';
  const validation = validateReadOnlySql(sql);
  if (!sql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to generate a safe read-only SQL query.');
  }

  if (trace) {
    trace.sqlGenerationDurationMs = Date.now() - startedAt;
    trace.sqlGenerationSource = 'ollama';
    trace.sqlValidationOk = true;
  }
  return ensureSqlRowLimit(validation.sql);
}

async function repairReadOnlySql(question, failedSql, failedError, {
  mode = 'narrate',
  profile = DEFAULT_PROFILE,
  resolutionHints = [],
  trace = null,
} = {}) {
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
    { profile, trace, temperature: 0.02, numPredict: 420 }
  );

  const repairedSql = response?.sql || '';
  const validation = validateReadOnlySql(repairedSql);
  if (!repairedSql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to repair the SQL query.');
  }

  return ensureSqlRowLimit(validation.sql);
}

async function executeReadOnlySql(sql, { demoUser = null, maxRows = ASKDATA_MAX_ROWS, trace = null } = {}) {
  const validation = validateReadOnlySql(sql);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  let connection;
  const startedAt = Date.now();
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
    if (trace) trace.oracleExecutionDurationMs = (trace.oracleExecutionDurationMs || 0) + (Date.now() - startedAt);
    await db.releaseConnection(connection, { rollback: true, label: 'Ask Media Data query' });
  }
}

async function runQuestionQuery(question, {
  mode = 'narrate',
  demoUser = null,
  profile = DEFAULT_PROFILE,
  maxRows = ASKDATA_MAX_ROWS,
  conversationContext = [],
  trace = null,
} = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const contextualQuestion = await resolveConversationalQuestion(question, {
    conversationContext,
    profile: resolvedProfile,
    trace,
  });
  const resolution = await resolveQuestionEntities(contextualQuestion);
  const effectiveQuestion = resolution.question;
  const initialSql = await generateReadOnlySql(effectiveQuestion, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
    trace,
  });
  let currentSql = initialSql;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await executeReadOnlySql(currentSql, { demoUser, maxRows, trace });
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
          trace,
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
  const fromMetadata = Array.isArray(columns) ? columns.filter(Boolean) : [];
  if (fromMetadata.length) return fromMetadata.map((column) => String(column).toUpperCase());
  const firstRow = Array.isArray(rows) && rows.length ? rows[0] : {};
  return Object.keys(firstRow || {}).map((column) => String(column).toUpperCase());
}

function toStringArray(value, maxItems = 5) {
  const values = Array.isArray(value) ? value : (value === undefined || value === null ? [] : [value]);
  return values
    .map((item) => {
      if (item === undefined || item === null) return '';
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'object') return Object.values(item).map((part) => String(part || '').trim()).filter(Boolean).join(' ');
      return String(item).trim();
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTextField(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return Object.values(value).map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  return String(value).trim();
}

function humanizeColumnName(column) {
  return String(column || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readRowValue(row, candidateColumns = []) {
  if (!row || typeof row !== 'object') return undefined;
  for (const candidate of candidateColumns) {
    const upper = String(candidate).toUpperCase();
    const lower = String(candidate).toLowerCase();
    if (row[upper] !== undefined && row[upper] !== null) return row[upper];
    if (row[lower] !== undefined && row[lower] !== null) return row[lower];
    if (row[candidate] !== undefined && row[candidate] !== null) return row[candidate];
  }
  return undefined;
}

function hasAnyColumn(columns = [], patterns = []) {
  return normalizeColumns(columns).some((column) => patterns.some((pattern) => pattern.test(column)));
}

function joinReadableList(items = []) {
  const filtered = items.filter(Boolean);
  if (filtered.length <= 1) return filtered[0] || '';
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`;
}

function formatMediaValue(column, value) {
  if (value === null || value === undefined) return 'not available';
  const col = String(column || '').toUpperCase();
  if (typeof value === 'number' && /(VALUE|REVENUE|PRICE|COST|RISK|ATTRIBUTED)/.test(col)) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (typeof value === 'number' && /(RATE|PCT|PERCENT|SCORE|FACTOR)/.test(col)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return formatValue(value);
}

function getResultKind(question = '', columns = []) {
  const q = String(question).toLowerCase();
  const hasCapacityIntent = /capacity|rights|coverage|live event|distribution/.test(q);
  const hasLaunchIntent = /launch|churn|retention|revenue risk/.test(q);
  if (hasCapacityIntent) {
    return 'capacity';
  }
  if (hasLaunchIntent || hasAnyColumn(columns, [/LAUNCH_EVENT_REQUEST/, /CAMPAIGN_VALUE_AT_RISK/])) {
    return 'launch_risk';
  }
  if (hasAnyColumn(columns, [/COVERAGE_DESK/, /CAPACITY_GAP/, /CAPACITY_UNITS_AVAILABLE/])) {
    return 'capacity';
  }
  if (/audience signal|urgency|virality|momentum/.test(q) || hasAnyColumn(columns, [/AUDIENCE_SIGNAL/, /URGENCY_SCORE/, /MOMENTUM_FLAG/])) {
    return 'signal';
  }
  if (/creator/.test(q) || hasAnyColumn(columns, [/CREATOR_/, /RISING_SIGNAL_COUNT/])) {
    return 'creator';
  }
  if (/audience segment|audience tier|subscriber segment/.test(q) || hasAnyColumn(columns, [/AUDIENCE_SEGMENT/, /AUDIENCE_TIER/])) {
    return 'audience_segment';
  }
  if (/content asset|content performance|campaign value/.test(q) || hasAnyColumn(columns, [/CONTENT_ASSET/, /CAMPAIGN_VALUE/])) {
    return 'content';
  }
  return 'generic';
}

function followUpsForResultKind(resultKind) {
  if (resultKind === 'launch_risk') {
    return [
      'Break this down by audience segment and region.',
      'Are there any capacity or rights issues that could impact these launch events?',
      'Which audience signals point to the highest engagement risk?',
    ];
  }
  if (resultKind === 'capacity') {
    return ['Show capacity risk by content asset and region.', 'Which coverage desks can absorb the next live-event surge?'];
  }
  if (resultKind === 'creator') {
    return ['Show the top creators by attributed campaign value.', 'Which platforms have the fastest-rising audience signals?'];
  }
  if (resultKind === 'signal') {
    return ['Which audience signals have the highest urgency?', 'Break urgent audience signals down by platform and creator.'];
  }
  if (resultKind === 'audience_segment') {
    return ['Show churn risk by audience segment.', 'Which audience segments have the most signal-influenced campaign value?'];
  }
  if (resultKind === 'content') {
    return ['Show this by content category.', 'Which content assets have the highest capacity or rights risk?'];
  }
  return ['Show this by content category.', 'Which records should a media operations team review first?'];
}

function formatResultBullet(row, index, columns = [], resultKind = 'generic') {
  const prefix = `${index}.`;
  if (resultKind === 'launch_risk') {
    const request = readRowValue(row, ['LAUNCH_EVENT_REQUEST', 'CAMPAIGN_ORDER_ID']);
    const account = readRowValue(row, ['AUDIENCE_ACCOUNT']);
    const segment = readRowValue(row, ['AUDIENCE_TIER', 'AUDIENCE_SEGMENT']);
    const value = readRowValue(row, ['CAMPAIGN_VALUE_AT_RISK', 'CAMPAIGN_VALUE']);
    const driver = readRowValue(row, ['RISK_DRIVER']);
    return `${prefix} Launch request ${formatValue(request)} for ${account || 'an audience account'}${segment ? ` (${segment})` : ''} carries ${formatMediaValue('CAMPAIGN_VALUE_AT_RISK', value)} campaign value at risk${driver ? `: ${driver}` : ''}.`;
  }
  if (resultKind === 'capacity') {
    const desk = readRowValue(row, ['COVERAGE_DESK', 'DISTRIBUTION_HUB']);
    const asset = readRowValue(row, ['CONTENT_ASSET']);
    const available = readRowValue(row, ['CAPACITY_UNITS_AVAILABLE']);
    const gap = readRowValue(row, ['CAPACITY_GAP']);
    const load = readRowValue(row, ['CURRENT_LOAD_PCT', 'AVG_LOAD_PCT']);
    const signalFactor = readRowValue(row, ['AUDIENCE_SIGNAL_FACTOR']);
    const driver = readRowValue(row, ['RISK_DRIVER']);
    const action = readRowValue(row, ['RECOMMENDED_ACTION']);
    const metrics = [];
    if (available !== undefined) metrics.push(`${formatValue(available)} available rights capacity units`);
    if (gap !== undefined && Number(gap) > 0) metrics.push(`${formatValue(gap)} unit capacity gap`);
    if (load !== undefined) metrics.push(`${formatValue(load)}% coverage-desk load`);
    if (signalFactor !== undefined) metrics.push(`${formatValue(signalFactor)} audience signal factor`);
    const subject = `${desk || 'Coverage desk'}${asset ? ` for ${asset}` : ''}`;
    const driverCopy = driver ? ` The risk driver is ${formatValue(driver)}.` : '';
    const actionCopy = action ? ` Recommended action: ${formatValue(action)}` : '';
    return `${prefix} ${subject} is a capacity watch item${metrics.length ? ` with ${metrics.join(', ')}` : ''}.${driverCopy}${actionCopy}`;
  }
  if (resultKind === 'creator') {
    const creator = readRowValue(row, ['CREATOR_NAME', 'CREATOR_HANDLE']);
    const platform = readRowValue(row, ['PLATFORM']);
    const rising = readRowValue(row, ['RISING_SIGNAL_COUNT']);
    const reach = readRowValue(row, ['AUDIENCE_REACH']);
    return `${prefix} ${creator || 'Creator'} is rising on ${platform || 'a platform'} with ${formatValue(rising)} rising signals${reach !== undefined ? ` and ${formatValue(reach)} audience reach` : ''}.`;
  }
  if (resultKind === 'signal') {
    const platform = readRowValue(row, ['PLATFORM']);
    const creator = readRowValue(row, ['CREATOR_NAME', 'CREATOR_HANDLE']);
    const score = readRowValue(row, ['URGENCY_SCORE', 'VIRALITY_SCORE']);
    return `${prefix} ${platform || 'Audience'} signal${creator ? ` from ${creator}` : ''} has urgency score ${formatValue(score)}.`;
  }
  if (resultKind === 'audience_segment') {
    const segment = readRowValue(row, ['AUDIENCE_SEGMENT', 'AUDIENCE_TIER']);
    const value = readRowValue(row, ['CAMPAIGN_VALUE']);
    const requests = readRowValue(row, ['CAMPAIGN_REQUESTS', 'CAMPAIGN_ORDERS']);
    return `${prefix} ${segment || 'Audience segment'} represents ${formatMediaValue('CAMPAIGN_VALUE', value)} across ${formatValue(requests)} campaign requests.`;
  }
  if (resultKind === 'content') {
    const asset = readRowValue(row, ['CONTENT_ASSET']);
    const studio = readRowValue(row, ['STUDIO_OR_PUBLISHER', 'STUDIO_OR_LABEL']);
    const value = readRowValue(row, ['CAMPAIGN_VALUE', 'AVG_CAMPAIGN_VALUE']);
    const units = readRowValue(row, ['REQUESTED_UNITS']);
    return `${prefix} ${asset || studio || 'Content asset'}${studio && asset ? ` from ${studio}` : ''} is tied to ${formatMediaValue('CAMPAIGN_VALUE', value)}${units !== undefined ? ` and ${formatValue(units)} requested units` : ''}.`;
  }
  const normalizedColumns = normalizeColumns(columns, [row]).slice(0, 4);
  const parts = normalizedColumns
    .map((column) => {
      const value = readRowValue(row, [column]);
      return value === undefined ? null : `${humanizeColumnName(column)} ${formatMediaValue(column, value)}`;
    })
    .filter(Boolean);
  return `${prefix} ${parts.join(', ')}`;
}

function buildAggregateResultSynthesis({ question = '', mode = 'narrate', columns = [], rows = [], rowCount = 0, followUpQuestions = [] }) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  const totalCampaignValue = readRowValue(row, ['TOTAL_CAMPAIGN_VALUE', 'TOTAL_CONTENT_REVENUE']);
  const totalCampaignOrders = readRowValue(row, ['TOTAL_CAMPAIGN_REQUESTS', 'TOTAL_CAMPAIGN_ORDERS', 'CAMPAIGN_REQUEST_COUNT', 'CAMPAIGN_ORDER_COUNT']);
  const urgentSignals = readRowValue(row, ['URGENT_AUDIENCE_SIGNAL_POSTS', 'SIGNAL_POST_COUNT']);
  const signalInfluencedOrders = readRowValue(row, ['AUDIENCE_SIGNAL_INFLUENCED_CAMPAIGN_REQUESTS', 'AUDIENCE_SIGNAL_INFLUENCED_CAMPAIGN_ORDERS']);
  const averageCampaignValueAtRisk = readRowValue(row, ['AVG_CAMPAIGN_VALUE_AT_RISK']);
  const launchEventCount = readRowValue(row, ['LAUNCH_EVENT_COUNT']);
  let answer = '';
  let keyFinding = '';
  let resultSummary = '';

  if (averageCampaignValueAtRisk !== undefined) {
    const value = formatMediaValue('AVG_CAMPAIGN_VALUE_AT_RISK', averageCampaignValueAtRisk);
    const eventCount = launchEventCount === undefined ? null : formatValue(launchEventCount);
    const scope = eventCount === null ? 'the selected launch events' : `${eventCount} selected launch event${Number(launchEventCount) === 1 ? '' : 's'}`;
    answer = `The average campaign value at risk is ${value} across ${scope}.`;
    keyFinding = `${value} is the average campaign value at risk across ${scope}.`;
    resultSummary = `Average campaign value at risk for ${scope}: ${value}.`;
  } else if (totalCampaignValue !== undefined) {
    const value = formatMediaValue('TOTAL_CAMPAIGN_VALUE', totalCampaignValue);
    answer = `The total campaign value is ${value} across the authorized media and entertainment data scope.`;
    keyFinding = `${value} total campaign value is represented in this governed result.`;
    resultSummary = `${value} total campaign value was returned from the governed media and entertainment schema.`;
  } else if (totalCampaignOrders !== undefined && /how many|count|total/i.test(question)) {
    const value = formatValue(totalCampaignOrders);
    answer = `There are ${value} campaign requests in the authorized media and entertainment data scope.`;
    keyFinding = `${value} campaign requests are available for this authorized view.`;
    resultSummary = `${value} total campaign requests were returned from the governed media and entertainment schema.`;
  } else if (urgentSignals !== undefined) {
    const value = formatValue(urgentSignals);
    answer = `There are ${value} urgent audience signal posts in the authorized media and entertainment data scope.`;
    keyFinding = `${value} audience signals exceed the requested urgency threshold.`;
    resultSummary = `${value} urgent audience signal posts were returned from the governed media and entertainment schema.`;
  } else if (signalInfluencedOrders !== undefined) {
    const value = formatValue(signalInfluencedOrders);
    answer = `There are ${value} campaign requests linked to an audience signal source in the authorized media and entertainment data scope.`;
    keyFinding = `${value} campaign requests are signal-influenced.`;
    resultSummary = `${value} signal-influenced campaign requests were returned from the governed media and entertainment schema.`;
  }

  if (!answer) return null;

  return {
    answer: mode === 'chat' ? `${answer} You can narrow this by audience segment, content category, platform, region, or launch window.` : answer,
    key_findings: [keyFinding],
    result_summary: resultSummary || `${rowCount} aggregate record was returned from the governed media and entertainment schema.`,
    follow_up_questions: followUpQuestions,
    referenced_data: {
      row_count: rowCount,
      notable_fields: normalizeColumns(columns, rows),
    },
    warnings: [],
    source: 'deterministic_fallback',
  };
}

function isCapacityRiskQuestion(question = '') {
  return /(capacity|rights).*(issues?|constraints?|risk)|(issues?|constraints?|risk).*(capacity|rights)|impact.*launch events?|launch events?.*impact/i.test(String(question || ''));
}

function deterministicResultSynthesis({ question, mode = 'narrate', columns = [], rows = [], rowCount = 0 }) {
  const normalizedColumns = normalizeColumns(columns, rows);
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeRowCount = Number.isFinite(Number(rowCount)) ? Number(rowCount) : safeRows.length;
  const resultKind = getResultKind(question, normalizedColumns);
  const followUpQuestions = followUpsForResultKind(resultKind);

  if (!safeRows.length || safeRowCount === 0) {
    if (resultKind === 'capacity' && isCapacityRiskQuestion(question)) {
      return {
        answer: mode === 'chat'
          ? 'I did not find active capacity or rights-risk records above the governed media thresholds for those launch events. Check coverage desks, live-event surge signals, or content category if you want a broader readiness view.'
          : 'I did not find active capacity or rights-risk records above the governed media thresholds for those launch events.',
        key_findings: [],
        result_summary: 'No active capacity or rights-risk records were returned from the governed media and entertainment schema.',
        follow_up_questions: followUpQuestions,
        referenced_data: {
          row_count: 0,
          notable_fields: normalizedColumns,
        },
        warnings: [],
        source: 'deterministic_fallback',
      };
    }
    return {
      answer: mode === 'chat'
        ? 'I did not find matching records in your authorized media and entertainment data scope. Try narrowing the question by content title, audience segment, platform, region, or launch window.'
        : 'I did not find matching records in your authorized media and entertainment data scope.',
      key_findings: [],
      result_summary: 'No matching records were returned from the governed media and entertainment schema.',
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
    rowCount: safeRowCount,
    followUpQuestions,
  });
  if (aggregate) return aggregate;

  const singular = safeRowCount === 1;
  const labelMap = {
    launch_risk: `launch event${singular ? '' : 's'}`,
    capacity: `coverage capacity record${singular ? '' : 's'}`,
    creator: `creator signal record${singular ? '' : 's'}`,
    signal: `audience signal${singular ? '' : 's'}`,
    audience_segment: `audience segment${singular ? '' : 's'}`,
    content: `content asset${singular ? '' : 's'}`,
    generic: `media and entertainment record${singular ? '' : 's'}`,
  };
  const rowLabel = labelMap[resultKind] || labelMap.generic;
  const findings = safeRows.slice(0, 6).map((row, index) => formatResultBullet(row, index + 1, normalizedColumns, resultKind));
  const topFinding = findings[0]?.replace(/^\d+\.\s*/, '') || '';
  const supportSentence = resultKind === 'launch_risk'
    ? 'These records help prioritize retention, campaign recovery, and launch operations before the event window.'
    : resultKind === 'capacity'
      ? 'These records help media operations rebalance rights coverage, activation readiness, and live-event capacity.'
    : resultKind === 'creator'
      ? 'These records help partnership and community teams decide where creator momentum can amplify the release.'
    : 'These records help compare engagement, monetization, retention, and operational priorities within the authorized data scope.';
  const fallbackAnswer = (() => {
    if (resultKind === 'launch_risk') {
      return [
        topFinding ? `The launch event needing the most attention is ${topFinding}` : `The governed media data highlights ${safeRowCount.toLocaleString()} launch events with churn or revenue-risk signals.`,
        'The ranking uses audience tier, campaign value at risk, requested units, and active audience-signal influence to surface the launch windows that need retention and campaign recovery attention first.',
        mode === 'chat' ? supportSentence : null,
      ].filter(Boolean).join(' ');
    }
    if (resultKind === 'capacity') {
      return [
        topFinding ? `Yes. ${topFinding}` : `Yes. The governed media data highlights ${safeRowCount.toLocaleString()} coverage capacity records that need readiness review.`,
        'That gives the operations team a concrete desk, asset, load signal, and recommended action before the launch window is affected.',
        mode === 'chat' ? supportSentence : null,
      ].filter(Boolean).join(' ');
    }
    if (resultKind === 'creator') {
      return [
        topFinding ? `The creator signal to watch first is ${topFinding}` : `The governed media data highlights ${safeRowCount.toLocaleString()} creator signal records.`,
        mode === 'chat' ? supportSentence : null,
      ].filter(Boolean).join(' ');
    }
    return [
      `The governed media and entertainment schema returned ${safeRowCount.toLocaleString()} ${rowLabel}.`,
      topFinding ? `The strongest signal is ${topFinding}` : null,
      mode === 'chat' ? supportSentence : null,
    ].filter(Boolean).join(' ');
  })();

  return {
    answer: fallbackAnswer,
    key_findings: findings,
    result_summary: `${safeRowCount.toLocaleString()} ${rowLabel} were returned from the governed media and entertainment schema.`,
    follow_up_questions: followUpQuestions,
    referenced_data: {
      row_count: safeRowCount,
      notable_fields: normalizedColumns,
    },
    warnings: [],
    source: 'deterministic_fallback',
  };
}

function hasRawColumnDump(text, columns = []) {
  const joined = Array.isArray(text) ? text.join('\n') : String(text || '');
  if (/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\s*:/g.test(joined)) return true;
  return normalizeColumns(columns).some((column) => {
    const pattern = new RegExp(`\\b${escapeRegExp(String(column))}\\s*:`, 'i');
    return pattern.test(joined);
  });
}

function hasListOnlyAnswer(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/^[\d\s,.$%]+$/.test(value)) return true;
  if (value.split(/\s+/).length < 8 && !/[.!?]/.test(value)) return true;
  if (/,\S/.test(value) && !/[.!?]/.test(value)) return true;
  return false;
}

function responseMentionsReturnedEntity(text, rows = []) {
  const normalizedText = normalizeEntityText(text);
  if (!normalizedText) return false;
  const candidateColumns = [
    'LAUNCH_EVENT_REQUEST',
    'AUDIENCE_ACCOUNT',
    'CONTENT_ASSET',
    'COVERAGE_DESK',
    'DISTRIBUTION_HUB',
    'CREATOR_NAME',
    'CREATOR_HANDLE',
    'AUDIENCE_SEGMENT',
    'AUDIENCE_TIER',
    'STUDIO_OR_PUBLISHER',
    'STUDIO_OR_LABEL',
  ];
  return (Array.isArray(rows) ? rows : [])
    .flatMap((row) => candidateColumns.map((column) => readRowValue(row, [column])))
    .filter(Boolean)
    .some((name) => normalizedText.includes(normalizeEntityText(name)));
}

function normalizeSynthesisResponse(response, context, fallback) {
  const normalized = {
    answer: normalizeTextField(response?.answer),
    key_findings: toStringArray(response?.key_findings, 6),
    result_summary: normalizeTextField(response?.result_summary),
    follow_up_questions: toStringArray(response?.follow_up_questions, 3),
    referenced_data: {
      row_count: Number.isFinite(response?.referenced_data?.row_count)
        ? response.referenced_data.row_count
        : context.rowCount,
      notable_fields: toStringArray(response?.referenced_data?.notable_fields || context.columns, 12),
    },
    warnings: toStringArray(response?.warnings, 6),
    source: 'ollama_synthesis',
  };

  const textForSafetyCheck = [
    normalized.answer,
    normalized.result_summary,
    ...normalized.key_findings,
  ].join('\n');
  const resultKind = getResultKind(context.question, context.columns);
  if (
    !normalized.answer
    || hasRawColumnDump(textForSafetyCheck, context.columns)
    || hasListOnlyAnswer(normalized.answer)
    || (['launch_risk', 'capacity', 'creator'].includes(resultKind) && !responseMentionsReturnedEntity(textForSafetyCheck, context.rows))
  ) {
    return {
      ...fallback,
      warnings: [
        ...(fallback.warnings || []),
        'The model response did not follow the media and entertainment explanation contract, so a deterministic grounded summary was used.',
      ],
    };
  }

  if (!normalized.result_summary) normalized.result_summary = fallback.result_summary;
  if (!normalized.key_findings.length && fallback.key_findings?.length) normalized.key_findings = fallback.key_findings;
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

function resolveOrdinalIdentifierFollowUp(question, history = []) {
  const currentQuestion = String(question || '').replace(/\s+/g, ' ').trim();
  const ordinalMatch = currentQuestion.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+one\b/i
  );
  if (!ordinalMatch || !Array.isArray(history)) return null;

  const wordOrdinals = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
  const ordinalToken = ordinalMatch[1].toLowerCase();
  const position = wordOrdinals[ordinalToken] || Number.parseInt(ordinalToken, 10);
  if (!Number.isSafeInteger(position) || position < 1) return null;

  const assistantEntry = [...history].reverse().find((entry) => {
    if (entry?.role !== 'assistant') return false;
    const text = String(entry?.text || entry?.answer || '');
    return /\b(?:launch event|campaign (?:order|request))s?\b/i.test(text)
      && /\bIDs?\b/i.test(text)
      && (text.match(/\b\d{4,}\b/g) || []).length >= position;
  });
  if (!assistantEntry) return null;

  const assistantText = String(assistantEntry.text || assistantEntry.answer || '');
  const orderedIds = (assistantText.match(/\b\d{4,}\b/g) || []).map(Number).filter(Number.isSafeInteger);
  const identifier = orderedIds[position - 1];
  if (!identifier) return null;

  return currentQuestion.replace(ordinalMatch[0], `the launch event with ID ${identifier}`);
}

async function resolveConversationalQuestion(question, {
  conversationContext = [],
  profile = DEFAULT_PROFILE,
  trace = null,
} = {}) {
  const currentQuestion = String(question || '').replace(/\s+/g, ' ').trim();
  const contextText = buildConversationContext(conversationContext);
  if (!currentQuestion || !contextText) return currentQuestion;

  if (
    /\bchurn risk\b.*\b(?:this|that|the) audience segment\b|\b(?:this|that|the) audience segment\b.*\bchurn risk\b/i.test(currentQuestion)
    && /User: .*\blaunch event\b.*\b(?:churn|revenue) risk\b/i.test(contextText)
  ) {
    return 'What is the churn risk for this audience segment associated with the highest-risk launch event?';
  }

  const ordinalResolution = resolveOrdinalIdentifierFollowUp(currentQuestion, conversationContext);
  if (ordinalResolution) return ordinalResolution;

  try {
    const rewritten = await ollamaText(
      [
        'Rewrite the current media and entertainment data follow-up as one standalone question.',
        'Resolve pronouns, ordinals, and references such as "those", "it", "the second one", or "that campaign" from the conversation context.',
        'Preserve names, identifiers, ranking order, dates, regions, and requested metrics exactly.',
        'Do not answer the question, generate SQL, add facts, or explain your work.',
        'Return only the standalone question as a single line.',
      ].join('\n'),
      `Conversation context:\n${contextText}\n\nCurrent follow-up:\n${currentQuestion}`,
      { profile, trace, temperature: 0 }
    );
    const standalone = stripCodeFences(rewritten)
      .replace(/^\s*(?:standalone|rewritten)\s+question\s*:\s*/i, '')
      .replace(/^['"]|['"]$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return standalone && standalone.length <= 800
      ? standalone
      : currentQuestion;
  } catch (_) {
    return currentQuestion;
  }
}

function buildStructuredQueryResult({ columns = [], rows = [], rowCount = 0 }, { maxRows = 10, maxColumns = 14 } = {}) {
  const normalizedColumns = normalizeColumns(columns, rows).slice(0, maxColumns);
  const safeRows = Array.isArray(rows) ? rows.slice(0, maxRows) : [];
  return {
    row_count: rowCount,
    columns: normalizedColumns,
    rows: safeRows.map((row) => {
      const compact = {};
      for (const column of normalizedColumns) {
        const value = readRowValue(row, [column]);
        if (value !== undefined) compact[column] = value;
      }
      return compact;
    }),
  };
}

async function synthesizeQueryResultWithOllama({
  question,
  mode = 'narrate',
  sql,
  columns = [],
  rows = [],
  rowCount = 0,
  profile = DEFAULT_PROFILE,
  trace = null,
  conversationContext = [],
}) {
  const structuredResult = buildStructuredQueryResult({ columns, rows, rowCount });
  const contextText = buildConversationContext(conversationContext);
  const isChatMode = mode === 'chat';
  const systemPrompt = isChatMode
    ? [
      'You are a media and entertainment operations data assistant for the Seer Media demo.',
      'Answer conversationally using only the provided SQL query results and optional conversation context.',
      'The current Query result JSON is authoritative. Use conversation context only to resolve pronouns or follow-up references, and never answer from prior context when it conflicts with the current Query result JSON.',
      'Use media and entertainment operations language: viewers, subscribers, fans, creators, studios, publishers, campaigns, premiere windows, content releases, live events, watch parties, audience segments, engagement, retention, churn risk, rights coverage, monetization, and content performance.',
      'Do not invent values, counts, percentages, locations, capacity numbers, revenue, fields, or outcomes.',
      'If a field is missing, say it is missing instead of implying it exists.',
      'Avoid raw database phrasing such as "Found rows", "COLUMN equals", or dumped column names.',
      'Return JSON only with keys "answer", "follow_up_questions", "referenced_data", and "warnings".',
    ].join('\n')
    : [
      'You are a media and entertainment operations data assistant for the Seer Media demo.',
      'Convert SQL query results into a concise, plain-English answer.',
      'Use only the provided query results. Do not invent values.',
      'If a field is missing, do not imply it exists.',
      'Mention that results are from the governed media and entertainment schema when helpful.',
      'Use media and entertainment operations language: viewers, subscribers, fans, creators, studios, publishers, campaigns, premiere windows, content releases, live events, watch parties, audience segments, engagement, retention, churn risk, rights coverage, monetization, and content performance.',
      'Avoid dumping raw column names unless necessary.',
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
      isChatMode ? 'Current-query rule: answer the current question from Query result JSON. Do not repeat facts from conversation context unless they also appear in Query result JSON.' : null,
      `User question:\n${question}`,
      sql ? `Generated SQL:\n${sql}` : null,
      `Query result JSON:\n${JSON.stringify(structuredResult, null, 2)}`,
      `Return JSON only in this shape:\n${JSON.stringify(expectedJson, null, 2)}`,
    ].filter(Boolean).join('\n\n'),
    { profile, trace, temperature: 0.1, numPredict: 520 }
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
  trace = null,
  conversationContext = [],
  synthesizeWithModel = true,
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
      ? await synthesisClient({ ...context, profile, trace, conversationContext, fallback })
      : await synthesizeQueryResultWithOllama({
        ...context,
        profile,
        trace,
        conversationContext,
      });
    return normalizeSynthesisResponse(response, context, fallback);
  } catch (_) {
    return fallback;
  }
}

async function generateQuestionSql(question, { mode = 'showsql', profile = DEFAULT_PROFILE, trace = null } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const startedAt = Date.now();
  if (isUnsafeSqlIntent(question)) {
    throw createAskDataError('SQL_VALIDATION_BLOCKED', new Error(GOVERNED_SCHEMA_BLOCK_MESSAGE), {
      statusCode: 400,
      profile: resolvedProfile,
    });
  }
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      if (trace) {
        trace.sqlGenerationDurationMs = Date.now() - startedAt;
        trace.sqlGenerationSource = 'deterministic_pattern';
        trace.sqlValidationOk = true;
      }
      return {
        sql: validation.sql,
        warnings: [],
        profile: resolvedProfile,
        model: getProfileModel(resolvedProfile),
        repairedFromSql: null,
      };
    }
  }
  const resolution = await resolveQuestionEntities(question);
  const sql = await generateReadOnlySql(resolution.question, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
    trace,
  });
  if (trace) {
    trace.sqlGenerationDurationMs = Date.now() - startedAt;
    trace.sqlValidationOk = true;
  }
  return {
    sql,
    warnings: resolution.resolutionHints,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    repairedFromSql: null,
  };
}

function getSchemaObjectLabel(tableName) {
  const normalized = String(tableName || '').toUpperCase();
  return MEDIA_SCHEMA_OBJECT_METADATA.find((object) => object.object_name.toUpperCase() === normalized)?.display_name
    || normalized.toLowerCase();
}

function describeGeneratedSql(sql, question = '') {
  const referencedTables = extractReferencedTables(sql);
  const objectLabels = referencedTables.filter((table) => table !== 'DUAL').map(getSchemaObjectLabel);
  const target = objectLabels.length
    ? [...new Set(objectLabels)].slice(0, 3).join(', ')
    : 'authorized media views';
  const aggregate = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP BY)\b/i.test(sql) ? 'summarized ' : '';
  const limit = /\bFETCH FIRST\s+(\d+)\s+ROWS/i.exec(sql || '');
  const limitCopy = limit ? ` It limits the result to ${limit[1]} records for review.` : '';
  const questionCopy = question ? ' for the current media and entertainment data question' : '';
  return `This SQL would retrieve ${aggregate}data from ${target}${questionCopy} without executing it.${limitCopy}`;
}

function summarizeRunSqlResult({ sql, columns = [], rows = [], rowCount = 0 }) {
  if (!rows || rows.length === 0 || rowCount === 0) {
    return 'SQL was validated and executed against authorized media views, but no matching records were found in the current authorized data scope.';
  }
  const referencedTables = extractReferencedTables(sql);
  const objectLabels = referencedTables.filter((table) => table !== 'DUAL').map(getSchemaObjectLabel);
  const target = objectLabels.length ? [...new Set(objectLabels)].slice(0, 3).join(', ') : 'authorized media views';
  const fields = normalizeColumns(columns, rows).slice(0, 5).map(humanizeColumnName).filter(Boolean);
  return `SQL was validated and executed against ${target}. It returned ${rowCount.toLocaleString()} structured record${rowCount === 1 ? '' : 's'}${fields.length ? ` with ${fields.join(', ')}` : ''}.`;
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

async function answerQuestion(question, {
  mode = 'narrate',
  demoUser = null,
  profile = DEFAULT_PROFILE,
  trace = null,
  conversationContext = [],
} = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const result = await runQuestionQuery(question, {
    mode,
    demoUser,
    profile: resolvedProfile,
    conversationContext,
    trace,
  });
  const answer = await summarizeQueryResult({
    question: result.resolvedQuestion || question,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    trace,
    conversationContext: [],
  });

  return {
    answer: answer.answer,
    keyFindings: answer.key_findings || [],
    resultSummary: answer.result_summary || '',
    followUpQuestions: answer.follow_up_questions || [],
    referencedData: answer.referenced_data || null,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    repairedFromSql: result.repairedFromSql || null,
    warnings: [...(result.warnings || []), ...(answer.warnings || [])],
  };
}

async function summarizeContext({ question, instructions, context, profile = DEFAULT_PROFILE }) {
  return ollamaText(
    [
      'You are an operations analyst for a media content intelligence platform.',
      'Answer only from the supplied JSON context.',
      'Be concise, specific, and truthful.',
      'If context.high_demand_assets contains rows, treat it as complete current demand evidence and rank those assets by the supplied metrics.',
      'Only say the context is incomplete when the relevant context arrays are empty.',
      instructions || '',
    ].join('\n'),
    `Question: ${question}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.2, profile }
  );
}

async function checkAskMediaDataHealth({ demoUser = 'admin_jess', profile = DEFAULT_PROFILE } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const runtime = getOllamaRuntimeConfig(resolvedProfile);
  const result = {
    status: 'healthy',
    profile: resolvedProfile,
    model: runtime.model,
    ollama: {
      status: 'unknown',
      host: runtime.host,
      modelAvailable: false,
    },
    oracle: {
      status: 'unknown',
      rowCount: null,
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(runtime.timeoutMs, 10000));
    const response = await fetch(`${runtime.host}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Ollama tags returned ${response.status}`);
    const payload = await response.json();
    const models = Array.isArray(payload?.models) ? payload.models : [];
    result.ollama.modelAvailable = models.some((model) => (
      String(model.name || '').split(':')[0] === String(runtime.model).split(':')[0]
      || String(model.name || '') === runtime.model
    ));
    result.ollama.status = result.ollama.modelAvailable ? 'healthy' : 'model_missing';
  } catch (error) {
    result.ollama.status = 'unavailable';
    result.ollama.error = getShortErrorMessage(error);
  }

  try {
    const query = await executeReadOnlySql(
      'SELECT COUNT(*) AS campaign_request_count FROM media_campaign_orders_v',
      { demoUser, maxRows: 1 }
    );
    result.oracle.status = 'healthy';
    result.oracle.rowCount = query.rows?.[0]?.CAMPAIGN_REQUEST_COUNT ?? null;
  } catch (error) {
    result.oracle.status = 'unavailable';
    result.oracle.error = getShortErrorMessage(error);
  }

  if (result.ollama.status !== 'healthy' || result.oracle.status !== 'healthy') {
    result.status = 'unhealthy';
  }
  return result;
}

module.exports = {
  DEFAULT_PROFILE,
  OLLAMA_MODEL,
  answerQuestion,
  checkAskMediaDataHealth,
  createAskDataError,
  describeGeneratedSql,
  ensureSqlRowLimit,
  executeReadOnlySql,
  generatePatternSql,
  generateQuestionSql,
  generateReadOnlySql,
  getAvailableProfiles,
  getAvailableSelectAiProfiles,
  getMediaSchemaObjectMetadata,
  getOllamaRuntimeConfig,
  getProfileModel,
  groupMediaSchemaObjectMetadata,
  invalidateMetadataCaches,
  isAssistantQueryableObject,
  normalizeAskDataError,
  normalizeProfile,
  parseJsonResponse,
  resolveOrdinalIdentifierFollowUp,
  runQuestionQuery,
  summarizeQueryResult,
  summarizeRunSqlResult,
  summarizeContext,
  validateReadOnlySql,
};
