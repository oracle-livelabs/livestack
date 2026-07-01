const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const { RESTRICTED_DEMO_USER } = require('./requestIdentityContext');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_PROFILE = 'MANUFACTURING_LLAMA_PROFILE';
const OLLAMA_REQUEST_TIMEOUT_MS = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '45000', 10);
const ASKDATA_MAX_ROWS = Math.max(1, Math.min(parseInt(process.env.ASKDATA_MAX_ROWS || '200', 10), 500));
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_MAX_SCOPES = 32;
const OLLAMA_UNAVAILABLE_MESSAGE = 'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.';
const OLLAMA_MODEL_MISSING_MESSAGE = `Model ${OLLAMA_MODEL} is not available in Ollama. Pull or configure the model before using Ask Manufacturing Data.`;
const GOVERNED_SCHEMA_BLOCK_MESSAGE = 'This query was not executed because it falls outside the allowed governed manufacturing schema.';
const ASKDATA_ERROR_MESSAGES = Object.freeze({
  OLLAMA_UNAVAILABLE: OLLAMA_UNAVAILABLE_MESSAGE,
  OLLAMA_MODEL_MISSING: OLLAMA_MODEL_MISSING_MESSAGE,
  OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
  MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific manufacturing data question.',
  SQL_GENERATION_FAILED: 'Unable to generate a safe Oracle SQL query for that question. Try rephrasing with a more specific metric, time window, or entity.',
  SQL_VALIDATION_BLOCKED: GOVERNED_SCHEMA_BLOCK_MESSAGE,
  ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific metric or governed manufacturing view.',
  VPD_ACCESS_ISSUE: 'The governed access context could not be applied for this request.',
  UNEXPECTED_BACKEND_RESPONSE: 'Ask Manufacturing Data received an unexpected backend response.',
  REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
});
const ALLOWED_TABLES = [
  'AGENT_ACTIONS',
  'APP_USERS',
  'BRANDS',
  'CUSTOMERS',
  'MANUFACTURING_DEMAND_FORECASTS',
  'DEMAND_REGIONS',
  'EVENT_STREAM',
  'FULFILLMENT_CENTERS',
  'FULFILLMENT_ZONES',
  'INFLUENCERS',
  'INFLUENCER_CONNECTIONS',
  'INVENTORY',
  'MANUFACTURING_PRODUCTION_SIGNALS_V',
  'MANUFACTURING_WORK_ORDERS_V',
  'MANUFACTURING_PARTS_V',
  'MANUFACTURING_SUPPLIER_RELATIONSHIPS_V',
  'MANUFACTURING_PLANT_CAPACITY_V',
  'MANUFACTURING_GRAPH_NODE_METADATA',
  'MANUFACTURING_GRAPH_EDGE_METADATA',
  'MANUFACTURING_GRAPH_ENTITY_METRICS',
  'MANUFACTURING_GRAPH_RELATIONSHIP_METADATA',
  'MANUFACTURING_GRAPH_PRODUCTION_FINDINGS',
  'MANUFACTURING_GRAPH_ENTITIES',
  'MANUFACTURING_GRAPH_RELATIONSHIPS',
  'MANUFACTURING_RISK_CASES',
  'MANUFACTURING_CASE_ENTITIES',
  'MANUFACTURING_WORK_ORDERS',
  'MANUFACTURING_WORK_ORDER_LINES',
  'MANUFACTURING_SIGNAL_PART_MENTIONS',
  'PRODUCTS',
  'SHIPMENTS',
  'MANUFACTURING_PRODUCTION_SIGNALS',
];
const ALLOWED_TABLE_SET = new Set(ALLOWED_TABLES);
const ALLOWED_PROPERTY_GRAPHS = ['MANUFACTURING_PRODUCTION_NETWORK'];
const ALLOWED_PROPERTY_GRAPH_SET = new Set(ALLOWED_PROPERTY_GRAPHS);
const SCHEMA_DOMAIN_ORDER = [
  'Work Orders',
  'Manufactured Parts',
  'Production Signals',
  'Customer Accounts',
  'Plant Capacity',
  'Supplier Network',
  'Production Risk Graph',
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

const MANUFACTURING_SCHEMA_OBJECT_METADATA = Object.freeze([
  schemaObject(
    'MANUFACTURING_WORK_ORDERS_V',
    'view',
    'Work Orders',
    'Manufacturing Work Orders',
    'Manufacturing-facing view of work orders, customer accounts, work order value, signal attribution, line counts, and assigned plant capacity center.',
    ['Which customer accounts have the highest work order value?', 'How many work orders have a production signal source?']
  ),
  schemaObject(
    'MANUFACTURING_WORK_ORDERS',
    'table',
    'Work Orders',
    'Manufacturing Work Orders',
    'Canonical transactional work orders; manufacturing-facing questions should prefer manufacturing_work_orders_v when possible.',
    ['Count work orders.', 'Show work order status by value.']
  ),
  schemaObject(
    'MANUFACTURING_WORK_ORDER_LINES',
    'table',
    'Work Orders',
    'Work Order Line Items',
    'Canonical work-order lines connecting work orders to manufactured parts with requested units and planned unit value.',
    ['Which manufactured parts have the most requested units?', 'Show work order line value by manufactured part.']
  ),
  schemaObject(
    'MANUFACTURING_PARTS_V',
    'view',
    'Manufactured Parts',
    'Manufacturing Manufactured Parts',
    'Manufacturing-facing view of manufactured parts, product lines and suppliers, part categories, available capacity, and production signal counts.',
    ['Which manufactured parts are driving the most work order value?', 'Show manufactured parts by production signal count.']
  ),
  schemaObject(
    'PRODUCTS',
    'table',
    'Manufactured Parts',
    'Manufactured Part Compatibility Rows',
    'Physical manufactured part catalog retained as products for baseline compatibility.',
    ['Show active manufactured parts by category.', 'Which manufactured parts released recently?']
  ),
  schemaObject(
    'BRANDS',
    'table',
    'Manufactured Parts',
    'Product Lines and Suppliers',
    'Product lines, supplier programs, manufacturing programs, and capacity owners represented on the inherited brands table.',
    ['Which product lines have the highest work order value?', 'Show product lines by part category.']
  ),
  schemaObject(
    'MANUFACTURING_PRODUCTION_SIGNALS_V',
    'view',
    'Production Signals',
    'Manufacturing Production Signals',
    'Signals from operators, plant teams, customer accounts, operators, supplier accounts, production runs, and work order activity with urgency, sentiment, and momentum fields.',
    ['Which production signals have urgency score above 80?', 'Which signal channels are escalating fastest?']
  ),
  schemaObject(
    'MANUFACTURING_PRODUCTION_SIGNALS',
    'table',
    'Production Signals',
    'Production Signal Records',
    'Canonical production signal table storing operator, customer account, supplier, production run, work order, quality inspection, and signal activity.',
    ['Count signals by channel.', 'Show high urgency production signals.']
  ),
  schemaObject(
    'CUSTOMERS',
    'table',
    'Customer Accounts',
    'Customer Accounts',
    'Synthetic customer accounts representing operators, plant teams, customer accounts, and operators for segmentation and VPD demos.',
    ['Which customer accounts have the most work orders?', 'Show customer activity by region.']
  ),
  schemaObject(
    'MANUFACTURING_PLANT_CAPACITY_V',
    'view',
    'Plant Capacity',
    'Manufacturing Plant Capacity',
    'Manufacturing-facing capacity view for plant capacity centers, production capacity, part inventory, regional demand, and capacity risk.',
    ['Which plant capacity centers have the most available production capacity?', 'Show capacity risk by manufactured part.']
  ),
  schemaObject(
    'FULFILLMENT_CENTERS',
    'table',
    'Plant Capacity',
    'Plant Capacity Center Compatibility Rows',
    'Plant, part operations, production scheduling, materials, production run, and production hubs on the inherited fulfillment center table.',
    ['Show active plant capacity centers.', 'Which hubs are in California?']
  ),
  schemaObject(
    'INVENTORY',
    'table',
    'Plant Capacity',
    'Manufactured Part Capacity Inventory',
    'Capacity and inventory units for manufactured parts at plant capacity centers.',
    ['Which manufactured parts are below capacity threshold?', 'Show capacity by hub.']
  ),
  schemaObject(
    'MANUFACTURING_DEMAND_FORECASTS',
    'table',
    'Plant Capacity',
    'Customer Demand Forecasts',
    'Forecast records for operator, plant team, customer account, and unit demand by planning region and manufactured part.',
    ['Which manufactured parts have the highest forecast demand?', 'Show forecast confidence by region.']
  ),
  schemaObject(
    'MANUFACTURING_SUPPLIER_RELATIONSHIPS_V',
    'view',
    'Supplier Network',
    'Manufacturing Supplier Relationships',
    'Manufacturing-facing view of supplier accounts, operations network accounts, product lines, and supplier relationships with signal activity and attributed work order value.',
    ['Which supplier accounts have the highest influence score?', 'Show supplier relationships for a product line.']
  ),
  schemaObject(
    'INFLUENCERS',
    'table',
    'Supplier Network',
    'Supplier and Operations Accounts',
    'Supplier, maintenance, quality, plant, and operations network accounts represented on the inherited influencers table.',
    ['Show verified supplier accounts.', 'Which supplier accounts have the highest signal activity rate?']
  ),
  schemaObject(
    'MANUFACTURING_PRODUCTION_NETWORK',
    'property graph',
    'Production Risk Graph',
    'Manufacturing Production Network',
    'Enforced Oracle SQL Property Graph over governed manufacturing cases, suppliers, parts, plants, work orders, production signals, and their live relational relationships.',
    ['Which production-risk graph findings have the highest risk score?', 'Show the evidence graph for a manufacturing risk case.']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_PRODUCTION_FINDINGS',
    'view',
    'Production Risk Graph',
    'Manufacturing Graph Production Findings',
    'Database-backed production-risk findings by selected graph node and depth, including supplier demand exposure, part capacity, production signals, work order schedule risk, production hubs, and case evidence.',
    ['Which production-risk graph findings have the highest risk score?', 'Show supplier, part, and production-signal findings in the production graph.']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_ENTITY_METRICS',
    'view',
    'Production Risk Graph',
    'Manufacturing Graph Entity Metrics',
    'Metric projection for live manufacturing graph entities, including signal reach, risk score, supplier count, work order count, production signal count, and direct relationship count.',
    ['Which graph entities have the highest risk score?', 'Show production graph entities with the most direct relationships.']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_NODE_METADATA',
    'view',
    'Production Risk Graph',
    'Manufacturing Graph Node Metadata',
    'Manufacturing-friendly node metadata for live suppliers, parts, plants, work orders, and production signals.',
    ['Show node metadata for WO-4501.', 'List manufacturing graph nodes by node type.']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_EDGE_METADATA',
    'table',
    'Production Risk Graph',
    'Manufacturing Graph Edge Metadata',
    'Display metadata for live graph edges: supplies part, required by work order, scheduled at plant, available at plant, and supported by signal.',
    ['Show manufacturing graph edge metadata.', 'Which graph edge types are risk propagation edges?']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_RELATIONSHIP_METADATA',
    'view',
    'Production Risk Graph',
    'Manufacturing Graph Relationship Metadata',
    'Relationship projection that joins manufacturing graph relationships to edge type display metadata and evidence text.',
    ['Show manufacturing graph relationships with evidence text.', 'Which production signals connect to work orders or parts?']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_ENTITIES',
    'table',
    'Production Risk Graph',
    'Manufacturing Graph Entities',
    'Canonical persisted graph vertices rebuilt from current suppliers, parts, plants, work orders, and production signals.',
    ['Show manufacturing graph entities by type.', 'Which manufacturing graph entities are high risk?']
  ),
  schemaObject(
    'MANUFACTURING_GRAPH_RELATIONSHIPS',
    'table',
    'Production Risk Graph',
    'Manufacturing Graph Relationships',
    'Canonical persisted graph edges rebuilt from part ownership, work-order lines, plant assignments, inventory, signal attribution, and part mentions.',
    ['Show graph relationships for WO-4501.', 'Which production graph relationship types are most common?']
  ),
  schemaObject(
    'MANUFACTURING_RISK_CASES',
    'table',
    'Production Risk Graph',
    'Manufacturing Risk Cases',
    'Production-risk investigation cases derived from the current highest-risk work orders and their related supplier, part, plant, and signal evidence.',
    ['Which manufacturing risk cases have the highest risk score?', 'Show open manufacturing risk cases by severity.']
  ),
  schemaObject(
    'MANUFACTURING_CASE_ENTITIES',
    'table',
    'Production Risk Graph',
    'Manufacturing Case Evidence Links',
    'Links manufacturing risk cases to the graph entities that provide evidence for each case, with role and evidence score.',
    ['Which graph entities support the highest-risk current case?', 'Show case evidence links by role.']
  ),
  schemaObject(
    'AGENT_ACTIONS',
    'table',
    'AI Agent Actions',
    'Manufacturing Agent Actions',
    'Auditable AI-assisted actions for factory operations, work order prioritization, plant capacity, quality inspection, schedule recovery, and throughput workflows.',
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
    description: 'Primary local Ollama model for Ask Manufacturing Data.',
  }),
});
const PROFILE_ALIASES = new Map();
[
  [
    DEFAULT_PROFILE,
    [
      DEFAULT_PROFILE,
      'MANUFACTURING_COHERE_PROFILE',
      'MANUFACTURING_EMBED_PROFILE',
      'MANUFACTURING_GROK42_PROFILE',
      'MANUFACTURING_VISION_PROFILE',
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
  'MANUFACTURING_WORK_ORDERS_V exposes work_order_id, work_order_status, work_order_value, customer_account, customer_tier, customer_region, plant_capacity_center, line_count, and requested_units.',
  'MANUFACTURING_PARTS_V exposes manufactured_part, part_category, product_line, total_capacity_units, reserved_capacity_units, production_signal_count, avg_urgency_score, and latest_signal_at.',
  'MANUFACTURING_PRODUCTION_SIGNALS_V exposes production_signal_text, signal_channel_code, sentiment_score, urgency_score, momentum_code, supplier_account_handle, supplier_account_name, supplier_account_niche, and matched_manufactured_parts.',
  'MANUFACTURING_PLANT_CAPACITY_V exposes plant_capacity_center, plant_site_type, manufactured_part, part_category, capacity_units_available, capacity_units_reserved, predicted_unit_demand, forecast_date, and production_signal_factor.',
  'MANUFACTURING_SUPPLIER_RELATIONSHIPS_V exposes supplier_account_id, supplier_account_handle, supplier_account_name, product_line, relationship_type, order_value_attributed, supplier_edge_count, and average relationship strength.',
  'MANUFACTURING_GRAPH_ENTITIES.NODE_ID is the canonical graph node identifier and maps to ENTITY_KEY; read current NODE_ID values before using them in graph lookups.',
  'MANUFACTURING_GRAPH_ENTITIES.NODE_TYPE maps to ENTITY_TYPE and is one of supplier, part, plant, work_order, or production_signal.',
  'MANUFACTURING_GRAPH_NODE_METADATA exposes NODE_ID, NODE_TYPE, DISPLAY_NAME, OPERATIONS_LABEL, DESCRIPTION, ENTITY_ID, OPERATIONS_DOMAIN, CITY, REGION, and IS_VERIFIED for manufacturing-friendly graph node SQL and Ask Manufacturing Data answers.',
  'MANUFACTURING_GRAPH_EDGE_METADATA exposes EDGE_TYPE, DISPLAY_NAME, CATEGORY, and DESCRIPTION for produces_part, constrains_work_order, scheduled_on, feeds_line, and triggered_by_signal.',
  'MANUFACTURING_GRAPH_ENTITY_METRICS joins graph node metadata to manufacturing metric projections such as SIGNAL_REACH, RISK_SCORE, SUPPLIER_COUNT, WORK_ORDER_COUNT, PRODUCTION_SIGNAL_COUNT, and DIRECT_CONNECTION_COUNT.',
  'MANUFACTURING_GRAPH_PRODUCTION_FINDINGS exposes database-backed production-risk graph findings by CENTER_ENTITY_ID and CENTER_NODE_ID with FINDING_TYPE, TITLE, DESCRIPTION, SUPPORTING_NODE_IDS, SUPPORTING_EDGE_TYPES, RISK_SCORE, RECOMMENDED_ACTION, RECOMMENDED_QUERY_KEY, and MIN_GRAPH_DEPTH.',
  'MANUFACTURING_PRODUCTION_NETWORK is the enforced SQL Property Graph queried with GRAPH_TABLE for bounded manufacturing case and relationship traversals.',
  'MANUFACTURING_GRAPH_RELATIONSHIPS.FROM_ENTITY_ID and TO_ENTITY_ID join to MANUFACTURING_GRAPH_ENTITIES.ENTITY_ID.',
  'MANUFACTURING_GRAPH_RELATIONSHIP_METADATA joins MANUFACTURING_GRAPH_RELATIONSHIPS to MANUFACTURING_GRAPH_EDGE_METADATA and exposes RELATIONSHIP_ID, EDGE_TYPE, DISPLAY_NAME, CATEGORY, DESCRIPTION, FROM_ENTITY_ID, TO_ENTITY_ID, STRENGTH, INTERACTION_COUNT, and EVIDENCE_TEXT.',
  'MANUFACTURING_CASE_ENTITIES links MANUFACTURING_RISK_CASES.CASE_ID to MANUFACTURING_GRAPH_ENTITIES.ENTITY_ID with ROLE and EVIDENCE_SCORE.',
  'PRODUCTS.BRAND_ID joins to BRANDS.BRAND_ID.',
  'MANUFACTURING_WORK_ORDER_LINES.WORK_ORDER_ID joins to MANUFACTURING_WORK_ORDERS.WORK_ORDER_ID.',
  'MANUFACTURING_WORK_ORDER_LINES.MANUFACTURED_PART_ID joins to PRODUCTS.PRODUCT_ID.',
  'MANUFACTURING_WORK_ORDERS does not contain MANUFACTURED_PART_ID or BRAND_ID; part and product-line analysis must join MANUFACTURING_WORK_ORDERS -> MANUFACTURING_WORK_ORDER_LINES -> PRODUCTS -> BRANDS.',
  'MANUFACTURING_WORK_ORDERS.CUSTOMER_ACCOUNT_ID joins to CUSTOMERS.CUSTOMER_ID.',
  'MANUFACTURING_WORK_ORDERS.ASSIGNED_PLANT_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'MANUFACTURING_WORK_ORDERS.PRODUCTION_SIGNAL_ID links to MANUFACTURING_PRODUCTION_SIGNALS.PRODUCTION_SIGNAL_ID for production-signal-influenced work orders.',
  'INVENTORY.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'INVENTORY.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'MANUFACTURING_PRODUCTION_SIGNALS.NETWORK_ACCOUNT_ID joins to INFLUENCERS.INFLUENCER_ID.',
  'MANUFACTURING_SIGNAL_PART_MENTIONS.PRODUCTION_SIGNAL_ID joins to MANUFACTURING_PRODUCTION_SIGNALS.PRODUCTION_SIGNAL_ID.',
  'MANUFACTURING_SIGNAL_PART_MENTIONS.MANUFACTURED_PART_ID joins to PRODUCTS.PRODUCT_ID.',
  'SHIPMENTS.WORK_ORDER_ID joins to MANUFACTURING_WORK_ORDERS.WORK_ORDER_ID.',
  'SHIPMENTS.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'MANUFACTURING_WORK_ORDER_LINES.LINE_VALUE already stores requested_units * planned_unit_value.',
  'BRANDS.BRAND_NAME only exists on BRANDS; do not reference BRAND_NAME unless BRANDS is joined in the same query block.',
  'When using aggregates, every non-aggregated expression in SELECT must also appear in GROUP BY.',
];
const ORACLE_ONLY_SYNTAX_RULES = [
  { regex: /\bJSON_AGG\s*\(/i, reason: 'Use JSON_ARRAYAGG instead of JSON_AGG.' },
  { regex: /\bSTRING_AGG\s*\(/i, reason: 'Use LISTAGG instead of STRING_AGG.' },
  { regex: /\bILIKE\b/i, reason: 'Use UPPER(...) LIKE UPPER(...) instead of ILIKE.' },
  { regex: /\bDATE_TRUNC\s*\(/i, reason: 'Use TRUNC(date_expr, ...) instead of DATE_TRUNC.' },
  { regex: /::/, reason: 'Use CAST(expr AS type) instead of PostgreSQL :: casts.' },
  { regex: /(?<!\])(?:->>|->)/i, reason: 'Use JSON_VALUE or JSON_QUERY instead of PostgreSQL JSON operators.' },
];

let schemaCache = {
  expiresAt: 0,
  grouped: {},
  tableComments: {},
};
const entityCacheByScope = new Map();

let dbModule = null;
function getDb() {
  if (!dbModule) {
    dbModule = require('../config/database');
  }
  return dbModule;
}

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

function getManufacturingSchemaObjectMetadata() {
  return MANUFACTURING_SCHEMA_OBJECT_METADATA;
}

function isAssistantQueryableObject(objectName) {
  const normalized = String(objectName || '').trim().toUpperCase();
  return MANUFACTURING_SCHEMA_OBJECT_METADATA.some((object) => object.object_name.toUpperCase() === normalized);
}

function groupManufacturingSchemaObjectMetadata(objects = MANUFACTURING_SCHEMA_OBJECT_METADATA) {
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

async function loadEntityCatalog(demoUser = null) {
  const effectiveDemoUser = String(demoUser || '').trim() || RESTRICTED_DEMO_USER;
  const db = getDb();
  return db.withUserConnection(
    effectiveDemoUser,
    async ({ execute }) => {
      const contextResult = await execute(`
        SELECT COALESCE(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'USERNAME'), '<denied>') AS username,
               COALESCE(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE'), 'denied') AS role_name,
               COALESCE(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION'), '<none>') AS region_code
        FROM dual
      `);
      const contextRow = contextResult.rows?.[0] || {};
      const scopeKey = [
        contextRow.USERNAME || '<denied>',
        contextRow.ROLE_NAME || 'denied',
        contextRow.REGION_CODE || '<none>',
      ].join('|');
      const cached = entityCacheByScope.get(scopeKey);
      if (cached && Date.now() < cached.expiresAt && Object.keys(cached.catalogs).length > 0) {
        return cached;
      }

      const catalogResult = await execute(`
        SELECT entity_type, value
        FROM (
          SELECT CAST('brand' AS VARCHAR2(20)) AS entity_type, brand_name AS value FROM brands
          UNION ALL
          SELECT 'product', product_name FROM products
          UNION ALL
          SELECT 'center', center_name FROM fulfillment_centers
          UNION ALL
          SELECT 'customer', TRIM(first_name || ' ' || last_name) FROM customers
          UNION ALL
          SELECT 'customer', email FROM customers
          UNION ALL
          SELECT 'influencer', handle FROM influencers
          UNION ALL
          SELECT 'influencer', display_name FROM influencers
        )
        WHERE value IS NOT NULL
        ORDER BY entity_type, value
      `);

      const catalogs = {
        brand: [],
        product: [],
        center: [],
        customer: [],
        influencer: [],
      };
      for (const row of catalogResult.rows || []) {
        const type = String(row.ENTITY_TYPE || '').toLowerCase();
        const value = String(row.VALUE || '').trim();
        if (!value || !catalogs[type]) continue;
        catalogs[type].push({ value, normalized: normalizeEntityText(value), type });
      }

      const nextCache = {
        expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
        catalogs,
      };
      for (const [key, entry] of entityCacheByScope) {
        if (Date.now() >= entry.expiresAt) entityCacheByScope.delete(key);
      }
      while (entityCacheByScope.size >= ENTITY_CACHE_MAX_SCOPES) {
        entityCacheByScope.delete(entityCacheByScope.keys().next().value);
      }
      entityCacheByScope.set(scopeKey, nextCache);
      return nextCache;
    },
    { readOnly: true }
  );
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
    `I couldn't map "${candidate}" to this demo schema. This app models manufacturing operations, not retail storefronts. Ask about product lines, manufactured parts, customer accounts, plant capacity centers, suppliers, work orders, or production signals instead.${suggestionText}`
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

  const db = getDb();
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

  if (/(production[-\s]?risk graph|manufacturing graph|property graph|sql\/pgq|pgq|graph node|node id|node_id|graph edge|edge type|edge metadata|relationship metadata|graph relationship|case evidence|risk case|finding|supplier risk|part capacity|production signal|production bottleneck|work order schedule risk|\b(?:supplier|plant|wo|part|signal|case)-[a-z0-9-]+\b)/.test(q)) {
    ['MANUFACTURING_GRAPH_NODE_METADATA', 'MANUFACTURING_GRAPH_EDGE_METADATA', 'MANUFACTURING_GRAPH_ENTITY_METRICS', 'MANUFACTURING_GRAPH_PRODUCTION_FINDINGS', 'MANUFACTURING_GRAPH_ENTITIES', 'MANUFACTURING_GRAPH_RELATIONSHIPS', 'MANUFACTURING_GRAPH_RELATIONSHIP_METADATA', 'MANUFACTURING_RISK_CASES', 'MANUFACTURING_CASE_ENTITIES'].forEach((tableName) => selected.add(tableName));
  }

  if (/(trend|trending|momentum|production signal|supplier|supplier account|signal activity|signal channel|plant team|plant teams|customer account|customer accounts|operator|operators|monitor|schedule recovery|downtime|quality inspection|quality escape|sentiment|customer)/.test(q)) {
    ['MANUFACTURING_PRODUCTION_SIGNALS_V', 'MANUFACTURING_SUPPLIER_RELATIONSHIPS_V', 'BRANDS', 'INFLUENCERS', 'MANUFACTURING_SIGNAL_PART_MENTIONS', 'PRODUCTS', 'MANUFACTURING_PRODUCTION_SIGNALS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(inventory|fulfillment|plant|warehouse|hub|capacity|production|event|production run|materials|plant inventory|route|routing|center|nearest|demand|forecast)/.test(q)) {
    ['MANUFACTURING_PLANT_CAPACITY_V', 'CUSTOMERS', 'MANUFACTURING_DEMAND_FORECASTS', 'DEMAND_REGIONS', 'FULFILLMENT_CENTERS', 'FULFILLMENT_ZONES', 'INVENTORY', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(order|orders|work order|work orders|work order value|throughput|value|customer account|customer|product line|supplier|product line|brand|product|part|asset|title|manufactured part|production run|price|category|total|average|best-selling|segment)/.test(q)) {
    ['MANUFACTURING_WORK_ORDERS_V', 'MANUFACTURING_PARTS_V', 'BRANDS', 'CUSTOMERS', 'MANUFACTURING_WORK_ORDERS', 'MANUFACTURING_WORK_ORDER_LINES', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(user|users|region|role|account)/.test(q)) {
    ['APP_USERS'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    ['MANUFACTURING_WORK_ORDERS_V', 'MANUFACTURING_PARTS_V', 'MANUFACTURING_PRODUCTION_SIGNALS_V', 'BRANDS', 'CUSTOMERS', 'MANUFACTURING_WORK_ORDERS', 'MANUFACTURING_WORK_ORDER_LINES', 'PRODUCTS', 'MANUFACTURING_PRODUCTION_SIGNALS'].forEach((tableName) => selected.add(tableName));
  }

  return [...selected];
}

async function getSchemaContext(question = '') {
  const metadata = await loadSchemaMetadata();
  const selectedTables = selectRelevantTables(question);
  const selectedTableSet = new Set(selectedTables);

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
      .filter((hint) => {
        const isWorkOrderHint = /\bMANUFACTURING_WORK_ORDERS\b|\bMANUFACTURING_WORK_ORDER_LINES\b/.test(hint);
        if (isWorkOrderHint && !selectedTableSet.has('MANUFACTURING_WORK_ORDERS') && !selectedTableSet.has('MANUFACTURING_WORK_ORDER_LINES')) {
          return false;
        }
        return selectedTables.some((tableName) => hint.includes(tableName));
      })
      .map((hint) => `- ${hint}`),
    '- MANUFACTURING_WORK_ORDERS_V is the preferred manufacturing-facing surface for work order, customer account, plant team, operator, customer account, and throughput questions.',
    '- MANUFACTURING_PARTS_V is the preferred manufacturing-facing surface for manufactured part, production run, product line, supplier, product line, recommendation, and part performance questions.',
    '- MANUFACTURING_PRODUCTION_SIGNALS_V is the preferred manufacturing-facing surface for operator, plant team, operator, supplier, quality inspection, quality escape, downtime, signal activity, schedule recovery, and production signal questions.',
    '- MANUFACTURING_PLANT_CAPACITY_V is the preferred manufacturing-facing surface for production, production run, materials, production scheduling, capacity, and plant questions.',
    '- MANUFACTURING_GRAPH_PRODUCTION_FINDINGS, MANUFACTURING_GRAPH_ENTITY_METRICS, MANUFACTURING_RISK_CASES, and MANUFACTURING_CASE_ENTITIES are the preferred manufacturing-facing surfaces for supplier, part, plant, production-signal, work-order, bottleneck, and risk-case questions.',
    '- MANUFACTURING_PRODUCTION_SIGNALS.MOMENTUM_CODE values are stable, elevated, escalating, and critical.',
    '- INVENTORY capacity-risk logic typically compares QUANTITY_ON_HAND to REORDER_POINT.',
    '- Work Order value questions usually use MANUFACTURING_WORK_ORDERS_V.WORK_ORDER_VALUE or MANUFACTURING_WORK_ORDER_LINES.LINE_VALUE.',
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
  const nodeIdMatch = q.match(/\b(?:SUPPLIER|PLANT|WO|PART|SIGNAL)-[A-Z0-9-]+\b/i);
  const caseKeyMatch = q.match(/\bCASE-[A-Z0-9-]+\b/i);
  const edgeTypeMatch = q.match(/\b(?:PRODUCES_PART|CONSTRAINS_WORK_ORDER|SCHEDULED_ON|FEEDS_LINE|TRIGGERED_BY_SIGNAL)\b/i);
  const hopMatch = qLower.match(/\b(?:depth|hop|hops)\s*(\d)\b|\b(\d)\s*hops?\b/);
  const graphDepth = hopMatch ? Math.min(parseInt(hopMatch[1] || hopMatch[2], 10), 5) : 3;

  if (/(?:ax[-\s]?400|servo drive).*(?:recovery|priorit|action|recommend|what should)|(?:recovery|priorit|action|recommend|what should).*(?:ax[-\s]?400|servo drive)/.test(qLower)) {
    return `SELECT center_node_id,
                   finding_type,
                   title,
                   description,
                   supporting_node_ids,
                   supporting_edge_types,
                   risk_score,
                   recommended_action,
                   recommended_query_key,
                   min_graph_depth
            FROM manufacturing_graph_production_findings
            WHERE UPPER(center_node_id || ' ' || title || ' ' || description || ' ' || supporting_node_ids || ' ' || recommended_action) LIKE '%AX-400%'
               OR UPPER(center_node_id || ' ' || title || ' ' || description || ' ' || supporting_node_ids || ' ' || recommended_action) LIKE '%AX400%'
               OR UPPER(center_node_id || ' ' || title || ' ' || description || ' ' || supporting_node_ids || ' ' || recommended_action) LIKE '%WO-4501%'
               OR UPPER(center_node_id || ' ' || title || ' ' || description || ' ' || supporting_node_ids || ' ' || recommended_action) LIKE '%SERVO%'
            ORDER BY risk_score DESC NULLS LAST,
                     CASE finding_type
                       WHEN 'case_evidence' THEN 1
                       WHEN 'production_signal_risk' THEN 2
                       WHEN 'part_capacity_risk' THEN 3
                       WHEN 'work_order_schedule_risk' THEN 4
                       WHEN 'supplier_demand_exposure' THEN 5
                       WHEN 'supplier_dependency_risk' THEN 6
                       ELSE 7
                     END,
                     min_graph_depth,
                     center_node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (nodeIdMatch && /(production[-\s]?risk graph|manufacturing graph|graph insight|graph summary|finding|recommended.*query|case evidence|supplier delay|quality escape|downtime|bottleneck|schedule risk)/.test(qLower)) {
    const nodeId = nodeIdMatch[0].toUpperCase();
    return `SELECT finding_type,
                   title,
                   description,
                   supporting_node_ids,
                   supporting_edge_types,
                   risk_score,
                   recommended_action,
                   recommended_query_key,
                   min_graph_depth
            FROM manufacturing_graph_production_findings
            WHERE center_node_id = '${nodeId}'
              AND min_graph_depth <= ${graphDepth}
            ORDER BY risk_score DESC NULLS LAST, finding_type
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (nodeIdMatch && /(production[-\s]?risk graph|manufacturing graph|graph|node|metadata|display name|description|operations label|supplier|work order|part|plant|signal)/.test(qLower) && !/(relationship|relationships|edge|edges|connects|connected|evidence text)/.test(qLower)) {
    const nodeId = nodeIdMatch[0].toUpperCase();
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_label,
                   description,
                   operations_domain
            FROM manufacturing_graph_node_metadata
            WHERE node_id = '${nodeId}'`;
  }

  if (nodeIdMatch && /(relationship|relationships|edge|edges|connects|connected|evidence text)/.test(qLower)) {
    const nodeId = nodeIdMatch[0].toUpperCase();
    return `SELECT r.relationship_id,
                   from_e.node_id AS from_node_id,
                   from_e.display_name AS from_node,
                   r.edge_type,
                   r.display_name AS edge_display_name,
                   to_e.node_id AS to_node_id,
                   to_e.display_name AS to_node,
                   r.strength,
                   r.interaction_count,
                   r.evidence_text
            FROM manufacturing_graph_relationship_metadata r
            JOIN manufacturing_graph_entities from_e
              ON from_e.entity_id = r.from_entity_id
            JOIN manufacturing_graph_entities to_e
              ON to_e.entity_id = r.to_entity_id
            WHERE UPPER(from_e.node_id) = '${nodeId}'
               OR UPPER(to_e.node_id) = '${nodeId}'
            ORDER BY r.strength DESC, r.interaction_count DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (edgeTypeMatch && /(production[-\s]?risk graph|manufacturing graph|graph|edge|relationship|metadata|display name|description|category)/.test(qLower)) {
    const edgeType = edgeTypeMatch[0].toLowerCase();
    return `SELECT edge_type,
                   display_name,
                   category,
                   description
            FROM manufacturing_graph_edge_metadata
            WHERE edge_type = '${edgeType}'`;
  }

  if (/(list|show|return).*(production[-\s]?risk graph|manufacturing graph|graph).*(edge|relationship).*(metadata|types|labels)|graph edge metadata|edge type metadata|relationship type metadata/.test(qLower)) {
    return `SELECT edge_type,
                   display_name,
                   category,
                   description
            FROM manufacturing_graph_edge_metadata
            ORDER BY category, edge_type
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(list|show|return).*(production[-\s]?risk graph|manufacturing graph|graph).*(nodes|metadata|labels)|graph node metadata/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_label,
                   description
            FROM manufacturing_graph_node_metadata
            ORDER BY node_type, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(production[-\s]?risk graph|manufacturing graph|graph).*(findings?|insights?|risk score)|(?:which|show).*(production[-\s]?risk graph findings?).*(highest|top)|graph findings?.*(highest|top).*risk/.test(qLower)) {
    return `SELECT center_node_id,
                   'case_evidence' AS finding_type,
                   case_type || ' - ' || severity AS title,
                   summary AS description,
                   case_key AS supporting_node_ids,
                   'case_involves' AS supporting_edge_types,
                   risk_score,
                   'Open the governed risk case and review its related supplier, part, plant, work-order, and production-signal evidence.' AS recommended_action,
                   'case_map' AS recommended_query_key,
                   1 AS min_graph_depth
            FROM GRAPH_TABLE (
              manufacturing_production_network
              MATCH
                (risk_case IS manufacturing_case)
                -[evidence IS case_involves]->
                (anchor IS manufacturing_entity)
              WHERE evidence.role = 'anchor_work_order'
              COLUMNS (
                anchor.entity_key AS center_node_id,
                risk_case.case_key AS case_key,
                risk_case.case_type AS case_type,
                risk_case.severity AS severity,
                risk_case.summary AS summary,
                risk_case.risk_score AS risk_score
              )
            )
            ORDER BY risk_score DESC NULLS LAST, case_key
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(manufacturing )?risk cases?.*(highest|top|open|severity|risk score)|supplier delay.*risk cases?|quality escape.*risk cases?|downtime.*risk cases?/.test(qLower)) {
    return `SELECT case_key,
                   case_type,
                   severity,
                   status,
                   risk_score,
                   summary,
                   created_at
            FROM manufacturing_risk_cases
            ORDER BY risk_score DESC,
                     CASE severity
                       WHEN 'critical' THEN 1
                       WHEN 'high' THEN 2
                       WHEN 'medium' THEN 3
                       ELSE 4
                     END,
                     created_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (caseKeyMatch && /(case evidence|evidence links?|case map|supporting entities|graph entities|risk case)/.test(qLower)) {
    const caseKey = caseKeyMatch[0].toUpperCase();
    return `SELECT c.case_key,
                   c.case_type,
                   c.severity,
                   c.risk_score,
                   e.node_id,
                   e.node_type,
                   e.display_name,
                   e.operations_label,
                   ce.role,
                   ce.evidence_score,
                   ce.note
            FROM manufacturing_risk_cases c
            JOIN manufacturing_case_entities ce
              ON ce.case_id = c.case_id
            JOIN manufacturing_graph_entities e
              ON e.entity_id = ce.entity_id
            WHERE c.case_key = '${caseKey}'
            ORDER BY ce.evidence_score DESC, e.node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(production[-\s]?risk graph|manufacturing graph|graph).*(entities|nodes).*(highest|top|risk score)|high[-\s]?risk graph entities/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_label,
                   operations_domain,
                   risk_score,
                   supplier_count,
                   work_order_count,
                   production_signal_count,
                   direct_connection_count
            FROM manufacturing_graph_entity_metrics
            ORDER BY risk_score DESC, direct_connection_count DESC, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/\bhow many work orders\b|summarize .*how many work orders|total work orders|work order count|count of work orders|overall work order count/.test(qLower)) {
    return `SELECT COUNT(*) AS total_work_orders FROM manufacturing_work_orders_v`;
  }

  if (/total work order value|work order value from all work orders|overall work order value/.test(qLower)) {
    return `SELECT ROUND(SUM(work_order_value), 2) AS total_work_order_value FROM manufacturing_work_orders_v`;
  }

  if (/work order value.*part category|work order value by category|part category.*work order value|breakdown by category|work order value.*part category|part category.*work order value/.test(qLower)) {
    return `SELECT ca.part_category,
                   COUNT(DISTINCT co.work_order_id) AS work_orders,
                   ROUND(SUM(oi.line_value), 2) AS work_order_value
            FROM manufacturing_work_orders_v co
            JOIN manufacturing_work_order_lines oi ON oi.work_order_id = co.work_order_id
            JOIN manufacturing_parts_v ca ON ca.product_id = oi.manufactured_part_id
            GROUP BY ca.part_category
            ORDER BY work_order_value DESC`;
  }

  if (/(work orders?.*(?:production variance|downtime|schedule).*(?:risk|exposed)|work orders?.*(?:risk|missing|miss).*(?:schedule|production slot)|production runs?.*(?:downtime|work order value|throughput|schedule recovery|risk)|greatest downtime or work order value risk|work order value risk.*weekend|downtime.*risk.*weekend|most exposed to downtime risk)/.test(qLower)) {
    return `SELECT work_order_id AS production_risk_work_order,
                   customer_account,
                   customer_tier,
                   customer_region,
                   plant_capacity_center AS plant_capacity_center,
                   work_order_status,
                   ROUND(work_order_value, 2) AS work_order_value_at_risk,
                   requested_units,
                   CASE
                     WHEN LOWER(customer_tier) IN ('vip', 'preferred') AND production_signal_source_id IS NOT NULL THEN 'High-value customer with active signal-driven downtime risk'
                     WHEN LOWER(customer_tier) IN ('vip', 'preferred') THEN 'High-value customer schedule risk'
                     WHEN production_signal_source_id IS NOT NULL THEN 'Production signal influenced production risk'
                     ELSE 'Production variance risk'
                   END AS risk_driver
            FROM manufacturing_work_orders_v
            ORDER BY
              CASE WHEN production_signal_source_id IS NOT NULL THEN 0 ELSE 1 END,
              CASE LOWER(customer_tier)
                WHEN 'vip' THEN 0
                WHEN 'preferred' THEN 1
                WHEN 'standard' THEN 2
                ELSE 3
              END,
              work_order_value DESC,
              requested_units DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/manufactured parts?.*(driving|highest|top|most).*(work order value|work order value|work order value)|top manufactured parts?.*(work order value|work order value|work order value)|work order value.*manufactured parts?|which is the best manufactured part|what is the best manufactured part|top .*manufactured parts.*work order value|manufactured parts by work order value/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(co.work_order_created_at AS DATE) >= TRUNC(SYSDATE) - ${dayWindow}` : '';
    const limit = (!topMatch && /best manufactured part/.test(qLower)) ? 1 : topN;
    return `SELECT ca.manufactured_part,
                   ca.product_line AS product_line,
                   ca.part_category,
                   COUNT(DISTINCT co.work_order_id) AS work_orders,
                   ROUND(SUM(oi.line_value), 2) AS work_order_value,
                   SUM(oi.requested_units) AS requested_units
            FROM manufacturing_work_orders_v co
            JOIN manufacturing_work_order_lines oi ON oi.work_order_id = co.work_order_id
            JOIN manufacturing_parts_v ca ON ca.product_id = oi.manufactured_part_id
            ${dateFilter}
            GROUP BY ca.manufactured_part, ca.product_line, ca.part_category
            ORDER BY work_order_value DESC, requested_units DESC
            FETCH FIRST ${limit} ROWS ONLY`;
  }

  if (/customer accounts?.*(highest|most|top|worth).*(work order value|work order value|value)|work order value.*customer accounts?/.test(qLower)) {
    return `SELECT customer_tier AS customer_segment,
                   COUNT(work_order_id) AS work_orders,
                   ROUND(SUM(work_order_value), 2) AS work_order_value,
                   ROUND(AVG(work_order_value), 2) AS avg_work_order_value,
                   SUM(CASE WHEN production_signal_source_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_influenced_orders
            FROM manufacturing_work_orders_v
            GROUP BY customer_tier
            ORDER BY work_order_value DESC, signal_influenced_orders DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  const urgencyMatch = qLower.match(/urgency score above\s+(\d+)/);
  if (/how many production signals/.test(qLower) && urgencyMatch) {
    return `SELECT COUNT(*) AS urgent_production_signals
            FROM manufacturing_production_signals_v
            WHERE urgency_score > ${parseInt(urgencyMatch[1], 10)}`;
  }

  if (/production signals?.*(highest|top|most).*(urgency|momentum)|highest urgency/.test(qLower)) {
    return `SELECT production_signal_id,
                   signal_channel_code,
                   supplier_account_handle,
                   supplier_account_name,
                   production_signal_text,
                   urgency_score AS urgency_score,
                   momentum_code,
                   observation_count,
                   observed_at
            FROM manufacturing_production_signals_v
            ORDER BY urgency_score DESC, observation_count DESC, observed_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/plant capacity centers have the most available production capacity|plant capacity centers have the most available capacity|plant capacity centers?.*(available|support).*capacity|centers have the most capacity|most capacity/.test(qLower)) {
    return `SELECT plant_capacity_center AS plant_capacity_center,
                   plant_site_type AS plant_site_type,
                   plant_region,
                   COUNT(DISTINCT manufactured_part_id) AS manufactured_parts_ready,
                   SUM(capacity_units_available) AS capacity_units_available,
                   SUM(capacity_units_reserved) AS capacity_units_reserved,
                   ROUND(AVG(current_load_pct), 2) AS avg_load_pct
            FROM manufacturing_plant_capacity_v
            GROUP BY plant_capacity_center, plant_site_type, plant_region
            ORDER BY capacity_units_available DESC, manufactured_parts_ready DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(capacity|materials).*(issues?|constraints?|risk).*(production runs?|these production runs?|events?)|(?:production runs?|these production runs?|events?).*(capacity|materials).*(issues?|constraints?|risk)|capacity risk by manufactured part|show capacity risk/.test(qLower)) {
    return `SELECT plant_capacity_center AS plant_capacity_center,
                   manufactured_part,
                   part_category,
                   capacity_units_available,
                   predicted_unit_demand,
                   NVL(predicted_unit_demand, 0) - NVL(capacity_units_available, 0) AS capacity_gap,
                   current_load_pct,
                   production_signal_factor,
                   CASE
                     WHEN NVL(predicted_unit_demand, 0) > NVL(capacity_units_available, 0) THEN 'Demand exceeds available material capacity'
                     WHEN current_load_pct >= 80 THEN 'Plant capacity center operating near capacity'
                     WHEN production_signal_factor >= 1.2 THEN 'Production signal surge monitor'
                     ELSE 'Monitor production readiness'
                   END AS risk_driver,
                   CASE
                     WHEN NVL(predicted_unit_demand, 0) > NVL(capacity_units_available, 0) THEN 'Rebalance the production plan or expand material readiness before the production window.'
                     WHEN current_load_pct >= 80 THEN 'Shift activation work to a lower-load plant capacity center.'
                     WHEN production_signal_factor >= 1.2 THEN 'pre-stage maintenance and quality inspection coverage for the expected demand surge.'
                     ELSE 'Monitor demand and material readiness.'
                   END AS recommended_action
            FROM manufacturing_plant_capacity_v
            WHERE predicted_unit_demand IS NOT NULL
              AND (
                NVL(predicted_unit_demand, 0) > NVL(capacity_units_available, 0)
                OR current_load_pct >= 80
                OR production_signal_factor >= 1.2
                OR NVL(capacity_units_available, 0) <= NVL(capacity_intervention_threshold, 0)
              )
            ORDER BY capacity_gap DESC, current_load_pct DESC, production_signal_factor DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/highest average work order value|highest average request value|average work order value by product line|average request value by product line|product lines.*highest average work order value/.test(qLower)) {
    return `SELECT product_line,
                   ROUND(AVG(product_line_work_order_value), 2) AS avg_work_order_value
            FROM (
              SELECT co.work_order_id,
                     ca.product_line AS product_line,
                     SUM(oi.requested_units * oi.planned_unit_value) AS product_line_work_order_value
              FROM manufacturing_work_orders_v co
              JOIN manufacturing_work_order_lines oi ON co.work_order_id = oi.work_order_id
              JOIN manufacturing_parts_v ca ON oi.manufactured_part_id = ca.product_id
              GROUP BY co.work_order_id, ca.product_line
            )
            GROUP BY product_line
            ORDER BY avg_work_order_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many work orders have (a |an )?(production |customer )?signal source|work orders.*signal source|signal-driven work orders/.test(qLower)) {
    return `SELECT COUNT(*) AS production_signal_influenced_work_orders
            FROM manufacturing_work_orders_v
            WHERE production_signal_source_id IS NOT NULL`;
  }

  if (/average customer account-signal urgency score by channel|urgency.*by channel/.test(qLower)) {
    return `SELECT signal_channel_code,
                   ROUND(AVG(urgency_score), 2) AS avg_urgency_score,
                   COUNT(*) AS production_signal_count
            FROM manufacturing_production_signals_v
            GROUP BY signal_channel_code
            ORDER BY avg_urgency_score DESC`;
  }

  if (/customer accounts .*most work orders|top customer accounts by work orders/.test(qLower)) {
    return `SELECT c.first_name || ' ' || c.last_name AS customer_account_name,
                   c.email,
                   COUNT(o.work_order_id) AS work_order_count,
                   ROUND(SUM(o.work_order_value), 2) AS total_work_order_value
            FROM customers c
            JOIN manufacturing_work_orders o ON c.customer_id = o.customer_account_id
            GROUP BY c.first_name, c.last_name, c.email
            ORDER BY work_order_count DESC, total_work_order_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many work orders were placed this week|work orders placed this week|work orders this week/.test(qLower)) {
    return `SELECT COUNT(*) AS work_orders_this_week
            FROM manufacturing_work_orders_v
            WHERE CAST(work_order_created_at AS DATE) >= TRUNC(SYSDATE, 'IW')`;
  }

  if (/(?:supplier accounts?|suppliers?).*(fastest-escalating|escalating fastest|fastest escalating|producing).*(production signals?|signals?).*channel?|(?:supplier accounts?|suppliers?).*escalating fastest.*channel|which (?:supplier accounts?|suppliers?) are escalating fastest/.test(qLower)) {
    return `SELECT mas.signal_channel_code,
                   mas.supplier_account_handle,
                   mas.supplier_account_name,
                   mcr.product_line,
                   COUNT(*) AS escalating_signal_count,
                   ROUND(AVG(mas.urgency_score), 2) AS avg_urgency_score,
                   SUM(mas.observation_count) AS signal_reach,
                   MAX(mas.observed_at) AS latest_signal_at
            FROM manufacturing_production_signals_v mas
            LEFT JOIN manufacturing_supplier_relationships_v mcr
              ON mcr.supplier_account_id = mas.supplier_account_id
            WHERE mas.momentum_code IN ('elevated', 'escalating', 'critical')
            GROUP BY mas.signal_channel_code, mas.supplier_account_handle, mas.supplier_account_name, mcr.product_line
            ORDER BY escalating_signal_count DESC, avg_urgency_score DESC, signal_reach DESC
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
    if (baseName && baseName !== 'GRAPH_TABLE') tables.add(baseName);
  }

  return [...tables];
}

function extractReferencedPropertyGraphs(sql) {
  const graphs = new Set();
  const regex = /\bGRAPH_TABLE\s*\(\s*([A-Za-z0-9_."$#]+)/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const graphName = match[1]
      .split('.')
      .pop()
      .replace(/"/g, '')
      .toUpperCase();
    if (graphName) graphs.add(graphName);
  }

  return [...graphs];
}

function extractReferencedObjects(sql) {
  return [...new Set([
    ...extractReferencedTables(sql),
    ...extractReferencedPropertyGraphs(sql),
  ])];
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

  const usesGraphTable = /\bGRAPH_TABLE\s*\(/i.test(normalized);
  const referencedGraphs = extractReferencedPropertyGraphs(normalized);
  if (usesGraphTable && referencedGraphs.length === 0) {
    return { ok: false, reason: 'GRAPH_TABLE must name an allowlisted property graph.' };
  }
  const disallowedGraphs = referencedGraphs.filter(
    (graphName) => !ALLOWED_PROPERTY_GRAPH_SET.has(graphName)
  );
  if (disallowedGraphs.length > 0) {
    return {
      ok: false,
      reason: `Query referenced unsupported property graphs: ${disallowedGraphs.join(', ')}`,
    };
  }

  return { ok: true, sql: normalized };
}

async function generateReadOnlySql(question, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [], trace = null } = {}) {
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
      '- MANUFACTURING_WORK_ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join MANUFACTURING_WORK_ORDERS -> MANUFACTURING_WORK_ORDER_LINES -> PRODUCTS -> BRANDS.',
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
    { profile, trace }
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

async function repairReadOnlySql(question, failedSql, failedError, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [], trace = null } = {}) {
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
      '- MANUFACTURING_WORK_ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join MANUFACTURING_WORK_ORDERS -> MANUFACTURING_WORK_ORDER_LINES -> PRODUCTS -> BRANDS.',
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
    { profile, trace }
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

  const startedAt = Date.now();
  try {
    const db = getDb();
    return await db.withUserConnection(
      demoUser || RESTRICTED_DEMO_USER,
      async ({ execute }) => {
        const result = await execute(validation.sql, {}, {
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
      },
      { readOnly: true }
    );
  } finally {
    if (trace) trace.oracleExecutionDurationMs = (trace.oracleExecutionDurationMs || 0) + (Date.now() - startedAt);
  }
}

async function runQuestionQuery(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, maxRows = ASKDATA_MAX_ROWS, trace = null } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const resolution = await resolveQuestionEntities(question, { demoUser });
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

function formatManufacturingValue(column, value) {
  if (value === null || value === undefined) return 'not available';
  const col = String(column || '').toUpperCase();
  if (typeof value === 'number' && /(RATE|PCT|PERCENT|SCORE|FACTOR)/.test(col)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (typeof value === 'number' && /(VALUE|REVENUE|PRICE|COST|ATTRIBUTED)/.test(col)) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return formatValue(value);
}

function getResultKind(question = '', columns = []) {
  const q = String(question).toLowerCase();
  if (/graph|risk case|case evidence|supplier delay|quality escape|production bottleneck/.test(q) || hasAnyColumn(columns, [/FINDING_TYPE/, /CENTER_NODE_ID/, /SUPPORTING_NODE_IDS/, /CASE_KEY/, /EDGE_TYPE/, /NODE_ID/, /EVIDENCE_SCORE/])) {
    return 'graph';
  }
  if (/production|downtime|schedule recovery|work order value risk/.test(q) || hasAnyColumn(columns, [/PRODUCTION_RISK_WORK_ORDER/, /RISK_DRIVER/, /WORK_ORDER_VALUE_AT_RISK/])) {
    return 'production_risk';
  }
  if (/capacity|materials|coverage|production|plant/.test(q) || hasAnyColumn(columns, [/PLANT_CAPACITY_CENTER/, /CAPACITY_GAP/, /CAPACITY_UNITS_AVAILABLE/])) {
    return 'capacity';
  }
  if (/supplier|supplier account/.test(q) || hasAnyColumn(columns, [/SUPPLIER_ACCOUNT_/, /ESCALATING_SIGNAL_COUNT/])) {
    return 'supplier';
  }
  if (/production signal|urgency|momentum/.test(q) || hasAnyColumn(columns, [/PRODUCTION_SIGNAL/, /URGENCY_SCORE/, /MOMENTUM_CODE/])) {
    return 'signal';
  }
  if (/customer account|customer tier|customer account segment/.test(q) || hasAnyColumn(columns, [/CUSTOMER_ACCOUNT/, /CUSTOMER_TIER/])) {
    return 'customer_segment';
  }
  if (/manufactured part|part performance|work order value/.test(q) || hasAnyColumn(columns, [/MANUFACTURED_PART/, /WORK_ORDER_VALUE/])) {
    return 'part';
  }
  return 'generic';
}

function followUpsForResultKind(resultKind) {
  if (resultKind === 'graph') {
    return ['Show the case evidence links for the top risk case.', 'Which graph entities have the highest direct relationship count?'];
  }
  if (resultKind === 'production_risk') {
    return ['Break this down by customer account and region.', 'Which production signals point to the highest schedule risk?'];
  }
  if (resultKind === 'capacity') {
    return ['Show capacity risk by manufactured part and region.', 'Which plant capacity centers can absorb the next production surge?'];
  }
  if (resultKind === 'supplier') {
    return ['Show the top supplier accounts by attributed work-order value.', 'Which signal channels have the most escalating production signals?'];
  }
  if (resultKind === 'signal') {
    return ['Which production signals have the highest urgency?', 'Break urgent production signals down by signal channel and supplier account.'];
  }
  if (resultKind === 'customer_segment') {
    return ['Show downtime risk by customer account.', 'Which customer accounts have the most signal-influenced work order value?'];
  }
  if (resultKind === 'part') {
    return ['Show this by part category.', 'Which manufactured parts have the highest capacity or materials risk?'];
  }
  return ['Show this by part category.', 'Which records should a manufacturing operations team review first?'];
}

function formatResultBullet(row, index, columns = [], resultKind = 'generic') {
  const prefix = `${index}.`;
  if (resultKind === 'graph') {
    const findingTitle = readRowValue(row, ['TITLE']);
    const findingType = readRowValue(row, ['FINDING_TYPE']);
    const caseKey = readRowValue(row, ['CASE_KEY']);
    const caseType = readRowValue(row, ['CASE_TYPE']);
    const nodeId = readRowValue(row, ['NODE_ID', 'CENTER_NODE_ID', 'ENTITY_KEY']);
    const displayName = readRowValue(row, ['DISPLAY_NAME', 'OPERATIONS_LABEL', 'FROM_NODE', 'TO_NODE']);
    const edgeType = readRowValue(row, ['EDGE_TYPE']);
    const riskScore = readRowValue(row, ['RISK_SCORE', 'EVIDENCE_SCORE']);
    const action = readRowValue(row, ['RECOMMENDED_ACTION']);
    if (findingTitle || findingType) {
      return `${prefix} ${findingTitle || findingType} has risk score ${formatManufacturingValue('RISK_SCORE', riskScore)}${action ? `; ${action}` : ''}.`;
    }
    if (caseKey || caseType) {
      return `${prefix} ${caseKey || 'Risk case'} (${caseType || 'manufacturing risk case'}) has risk score ${formatManufacturingValue('RISK_SCORE', riskScore)}.`;
    }
    if (edgeType) {
      return `${prefix} ${edgeType} connects ${readRowValue(row, ['FROM_NODE_ID']) || 'one graph node'} to ${readRowValue(row, ['TO_NODE_ID']) || 'another graph node'} with strength ${formatManufacturingValue('STRENGTH', readRowValue(row, ['STRENGTH']))}.`;
    }
    return `${prefix} ${nodeId || 'Graph node'}${displayName ? ` (${displayName})` : ''} has graph risk score ${formatManufacturingValue('RISK_SCORE', riskScore)}.`;
  }
  if (resultKind === 'production_risk') {
    const request = readRowValue(row, ['PRODUCTION_RISK_WORK_ORDER', 'WORK_ORDER_ID']);
    const account = readRowValue(row, ['CUSTOMER_ACCOUNT']);
    const segment = readRowValue(row, ['CUSTOMER_TIER', 'CUSTOMER_ACCOUNT']);
    const value = readRowValue(row, ['WORK_ORDER_VALUE_AT_RISK', 'WORK_ORDER_VALUE']);
    const driver = readRowValue(row, ['RISK_DRIVER']);
    return `${prefix} Work order ${formatValue(request)} for ${account || 'a customer account'}${segment ? ` (${segment})` : ''} carries ${formatManufacturingValue('WORK_ORDER_VALUE_AT_RISK', value)} at risk${driver ? `: ${driver}` : ''}.`;
  }
  if (resultKind === 'capacity') {
    const desk = readRowValue(row, ['PLANT_CAPACITY_CENTER', 'PLANT_CAPACITY_CENTER']);
    const asset = readRowValue(row, ['MANUFACTURED_PART']);
    const available = readRowValue(row, ['CAPACITY_UNITS_AVAILABLE']);
    const gap = readRowValue(row, ['CAPACITY_GAP']);
    const action = readRowValue(row, ['RECOMMENDED_ACTION']);
    return `${prefix} ${desk || 'Plant capacity center'}${asset ? ` for ${asset}` : ''} has ${formatValue(available)} available capacity${gap !== undefined ? ` and a ${formatValue(gap)} unit capacity gap` : ''}${action ? `; ${action}` : ''}.`;
  }
  if (resultKind === 'supplier') {
    const supplier = readRowValue(row, ['SUPPLIER_ACCOUNT_NAME', 'SUPPLIER_ACCOUNT_HANDLE']);
    const channel = readRowValue(row, ['SIGNAL_CHANNEL_CODE']);
    const escalating = readRowValue(row, ['ESCALATING_SIGNAL_COUNT']);
    const reach = readRowValue(row, ['SIGNAL_REACH']);
    return `${prefix} ${supplier || 'Supplier Account'} is escalating on ${channel || 'a signal channel'} with ${formatValue(escalating)} escalating signals${reach !== undefined ? ` and ${formatValue(reach)} signal observations` : ''}.`;
  }
  if (resultKind === 'signal') {
    const channel = readRowValue(row, ['SIGNAL_CHANNEL_CODE']);
    const supplier = readRowValue(row, ['SUPPLIER_ACCOUNT_NAME', 'SUPPLIER_ACCOUNT_HANDLE']);
    const score = readRowValue(row, ['URGENCY_SCORE', 'URGENCY_SCORE']);
    return `${prefix} ${channel || 'Production'} signal${supplier ? ` from ${supplier}` : ''} has urgency score ${formatValue(score)}.`;
  }
  if (resultKind === 'customer_segment') {
    const segment = readRowValue(row, ['CUSTOMER_ACCOUNT', 'CUSTOMER_SEGMENT', 'CUSTOMER_TIER']);
    const value = readRowValue(row, ['WORK_ORDER_VALUE']);
    const requests = readRowValue(row, ['WORK_ORDERS', 'WORK_ORDERS']);
    return `${prefix} ${segment || 'Customer segment'} represents ${formatManufacturingValue('WORK_ORDER_VALUE', value)} across ${formatValue(requests)} work orders.`;
  }
  if (resultKind === 'part') {
    const asset = readRowValue(row, ['MANUFACTURED_PART']);
    const productLine = readRowValue(row, ['PRODUCT_LINE', 'PRODUCT_LINE']);
    const value = readRowValue(row, ['WORK_ORDER_VALUE', 'AVG_WORK_ORDER_VALUE']);
    const units = readRowValue(row, ['REQUESTED_UNITS']);
    return `${prefix} ${asset || productLine || 'Manufactured part'}${productLine && asset ? ` from ${productLine}` : ''} is tied to ${formatManufacturingValue('WORK_ORDER_VALUE', value)}${units !== undefined ? ` and ${formatValue(units)} requested units` : ''}.`;
  }
  const normalizedColumns = normalizeColumns(columns, [row]).slice(0, 4);
  const parts = normalizedColumns
    .map((column) => {
      const value = readRowValue(row, [column]);
      return value === undefined ? null : `${humanizeColumnName(column)} ${formatManufacturingValue(column, value)}`;
    })
    .filter(Boolean);
  return `${prefix} ${parts.join(', ')}`;
}

function buildAggregateResultSynthesis({ question = '', mode = 'narrate', columns = [], rows = [], rowCount = 0, followUpQuestions = [] }) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  const totalWorkOrderValue = readRowValue(row, ['TOTAL_WORK_ORDER_VALUE', 'TOTAL_WORK_ORDER_VALUE']);
  const totalWorkOrders = readRowValue(row, ['TOTAL_WORK_ORDERS', 'TOTAL_WORK_ORDERS', 'WORK_ORDER_COUNT', 'WORK_ORDER_COUNT']);
  const urgentSignals = readRowValue(row, ['URGENT_PRODUCTION_SIGNAL_POSTS', 'SIGNAL_POST_COUNT']);
  const signalInfluencedOrders = readRowValue(row, ['PRODUCTION_SIGNAL_INFLUENCED_WORK_ORDERS', 'PRODUCTION_SIGNAL_INFLUENCED_WORK_ORDERS']);
  let answer = '';
  let keyFinding = '';
  let resultSummary = '';

  if (totalWorkOrderValue !== undefined) {
    const value = formatManufacturingValue('TOTAL_WORK_ORDER_VALUE', totalWorkOrderValue);
    answer = mode === 'chat'
      ? `The governed manufacturing result shows ${value} in total work order value. You can narrow that by customer account, product line, plant capacity center, supplier signal, or production window.`
      : `The governed manufacturing result shows ${value} in total work order value across the authorized operating scope. For an operations leader, this is the current value base to protect while prioritizing production variance, supplier readiness, capacity, and downtime risk.`;
    keyFinding = `${value} total work order value is represented in this governed result.`;
    resultSummary = `${value} total work order value was returned from the governed manufacturing schema.`;
  } else if (totalWorkOrders !== undefined && /how many|count|total/i.test(question)) {
    const value = formatValue(totalWorkOrders);
    answer = mode === 'chat'
      ? `There are ${value} work orders in the authorized manufacturing data scope. We can break them down by customer account, product line, production signal source, or plant capacity center next.`
      : `The authorized manufacturing scope contains ${value} work orders. This gives the planning team the governed work-order population for variance, throughput, and capacity analysis.`;
    keyFinding = `${value} work orders are available for this authorized view.`;
    resultSummary = `${value} total work orders were returned from the governed manufacturing schema.`;
  } else if (urgentSignals !== undefined) {
    const value = formatValue(urgentSignals);
    answer = mode === 'chat'
      ? `There are ${value} production signals above the requested urgency threshold. We can inspect the strongest signals by signal channel, supplier account, product line, or affected work order.`
      : `${value} production signals exceed the requested urgency threshold. That is the signal population operations teams should review for downtime risk, supplier disruption, quality exposure, or throughput impact.`;
    keyFinding = `${value} production signals exceed the requested urgency threshold.`;
    resultSummary = `${value} urgent production signals were returned from the governed manufacturing schema.`;
  } else if (signalInfluencedOrders !== undefined) {
    const value = formatValue(signalInfluencedOrders);
    answer = mode === 'chat'
      ? `There are ${value} work orders linked to a production signal source. We can drill into the highest-value orders, the supplier network behind the signal, or the plant capacity centers affected.`
      : `${value} work orders are linked to production signal sources. Those orders deserve priority review because external or operational signals may be influencing schedule recovery, capacity planning, and customer commitments.`;
    keyFinding = `${value} work orders are signal-influenced.`;
    resultSummary = `${value} signal-influenced work orders were returned from the governed manufacturing schema.`;
  }

  if (!answer) return null;

  return {
    answer,
    key_findings: [keyFinding],
    result_summary: resultSummary || `${rowCount} aggregate record was returned from the governed manufacturing schema.`,
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
  const safeRowCount = Number.isFinite(Number(rowCount)) ? Number(rowCount) : safeRows.length;
  const resultKind = getResultKind(question, normalizedColumns);
  const followUpQuestions = followUpsForResultKind(resultKind);

  if (!safeRows.length || safeRowCount === 0) {
    return {
      answer: mode === 'chat'
        ? 'I did not find matching records in your authorized manufacturing data scope. Try narrowing the question by part number, customer account, signal channel, region, or production window.'
        : 'I did not find matching records in your authorized manufacturing data scope.',
      key_findings: [],
      result_summary: 'No matching records were returned from the governed manufacturing schema.',
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
    graph: `production-risk graph record${singular ? '' : 's'}`,
    production_risk: `production run${singular ? '' : 's'}`,
    capacity: `plant capacity record${singular ? '' : 's'}`,
    supplier: `supplier signal record${singular ? '' : 's'}`,
    signal: `production signal${singular ? '' : 's'}`,
    customer_segment: `customer account${singular ? '' : 's'}`,
    part: `manufactured part${singular ? '' : 's'}`,
    generic: `manufacturing record${singular ? '' : 's'}`,
  };
  const rowLabel = labelMap[resultKind] || labelMap.generic;
  const findings = safeRows.slice(0, 6).map((row, index) => formatResultBullet(row, index + 1, normalizedColumns, resultKind));
  const topFinding = findings[0]?.replace(/^\d+\.\s*/, '') || '';
  const supportSentence = resultKind === 'production_risk'
    ? 'These records help prioritize schedule recovery, downtime prevention, and production operations before the production window.'
    : resultKind === 'graph'
      ? 'These records help trace supplier, part, plant, production-signal, and work-order schedule risk through the persisted manufacturing graph.'
    : resultKind === 'capacity'
      ? 'These records help manufacturing operations rebalance material readiness, production readiness, and production capacity.'
    : resultKind === 'supplier'
      ? 'These records help procurement and supplier operations teams decide where supplier signal momentum can amplify the production run.'
    : 'These records help compare signal activity, throughput, schedule recovery, and operational priorities within the authorized data scope.';

  const answerParts = mode === 'chat'
    ? [
      `I found ${safeRowCount.toLocaleString()} ${rowLabel} from the governed manufacturing schema.`,
      topFinding ? `The top result is ${topFinding}` : null,
      supportSentence,
      'We can narrow this by customer account, manufactured part, supplier, plant capacity center, risk driver, or production window.',
    ]
    : [
      `The governed manufacturing result returned ${safeRowCount.toLocaleString()} ${rowLabel}.`,
      topFinding ? `The most important signal is ${topFinding}` : null,
      supportSentence,
    ];

  return {
    answer: answerParts.filter(Boolean).join(' '),
    key_findings: findings,
    result_summary: `${safeRowCount.toLocaleString()} ${rowLabel} were returned from the governed manufacturing schema.`,
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
  const entityColumns = [
    'PRODUCTION_RISK_WORK_ORDER',
    'CUSTOMER_ACCOUNT',
    'MANUFACTURED_PART',
    'PLANT_CAPACITY_CENTER',
    'SUPPLIER_ACCOUNT_NAME',
    'SUPPLIER_ACCOUNT_HANDLE',
    'CUSTOMER_TIER',
    'PRODUCT_LINE',
    'CASE_KEY',
    'CASE_TYPE',
    'CENTER_NODE_ID',
    'NODE_ID',
    'TITLE',
    'DISPLAY_NAME',
    'OPERATIONS_LABEL',
  ];

  return (Array.isArray(rows) ? rows : []).some((row) =>
    entityColumns.some((column) => {
      const name = readRowValue(row, [column]);
      return name && normalizedText.includes(normalizeEntityText(name));
    })
  );
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

  if (!normalized.answer) normalized.answer = fallback.answer;
  if (!normalized.result_summary) normalized.result_summary = fallback.result_summary;
  if (!normalized.key_findings.length && fallback.key_findings?.length) normalized.key_findings = fallback.key_findings;
  if (!normalized.follow_up_questions.length) normalized.follow_up_questions = fallback.follow_up_questions || [];

  const textForSafetyCheck = [
    normalized.answer,
    normalized.result_summary,
    ...normalized.key_findings,
  ].join('\n');
  const resultKind = getResultKind(context.question, context.columns);
  if (
    hasRawColumnDump(textForSafetyCheck, context.columns)
    || hasListOnlyAnswer(normalized.answer)
    || (['production_risk', 'capacity', 'supplier', 'graph'].includes(resultKind) && !responseMentionsReturnedEntity(textForSafetyCheck, context.rows))
  ) {
    return {
      ...fallback,
      warnings: [
        ...(fallback.warnings || []),
        'The model response did not follow the manufacturing explanation contract, so a deterministic grounded summary was used.',
      ],
    };
  }

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
      'You are a manufacturing operations data assistant for the Manufacturing Operations demo.',
      'Answer conversationally using only the provided SQL query results and optional conversation context.',
      'Make the response feel like an interactive follow-up: acknowledge the result, connect it to the user question, and suggest how to refine the analysis next.',
      'Use manufacturing operations language: work orders, manufactured parts, production signals, customer accounts, plant capacity centers, supplier network, production risk, downtime risk, quality or defect analysis, asset and equipment performance, production variance, throughput, and capacity.',
      'Do not invent values, counts, percentages, locations, capacity numbers, work order value, fields, or outcomes.',
      'If a field is missing, say it is missing instead of implying it exists.',
      'Avoid raw database phrasing such as "Found rows", "COLUMN equals", or dumped column names.',
      'Return JSON only with keys "answer", "follow_up_questions", "referenced_data", and "warnings".',
    ].join('\n')
    : [
      'You are a manufacturing operations analyst for the Manufacturing Operations demo.',
      'Convert SQL query results into a polished business explanation for a plant manager, production planner, quality engineer, maintenance technician, or operations leader.',
      'Use only the provided query results. Do not invent values.',
      'Explain what the result means operationally: production variance, downtime risk, quality or defect exposure, throughput, capacity, supplier readiness, customer commitment, asset performance, or work-order priority.',
      'Do not ask an open-ended conversational follow-up in the main answer. Provide a narrative explanation, key findings, and a concise result summary.',
      'If a field is missing, do not imply it exists.',
      'Mention that results are from the governed manufacturing schema when helpful.',
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

async function generateQuestionSql(question, { mode = 'showsql', demoUser = null, profile = DEFAULT_PROFILE, trace = null } = {}) {
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
  const resolution = await resolveQuestionEntities(question, { demoUser });
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
  return MANUFACTURING_SCHEMA_OBJECT_METADATA.find((object) => object.object_name.toUpperCase() === normalized)?.display_name
    || normalized.toLowerCase();
}

function describeGeneratedSql(sql, question = '') {
  const referencedTables = extractReferencedObjects(sql);
  const objectLabels = referencedTables.filter((table) => table !== 'DUAL').map(getSchemaObjectLabel);
  const target = objectLabels.length
    ? [...new Set(objectLabels)].slice(0, 3).join(', ')
    : 'authorized manufacturing views';
  const aggregate = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP BY)\b/i.test(sql) ? 'summarized ' : '';
  const limit = /\bFETCH FIRST\s+(\d+)\s+ROWS/i.exec(sql || '');
  const limitCopy = limit ? ` It limits the result to ${limit[1]} records for review.` : '';
  const questionCopy = question ? ' for the current manufacturing data question' : '';
  return `This SQL would retrieve ${aggregate}data from ${target}${questionCopy} without executing it.${limitCopy}`;
}

function summarizeRunSqlResult({ sql, columns = [], rows = [], rowCount = 0 }) {
  if (!rows || rows.length === 0 || rowCount === 0) {
    return 'SQL was validated and executed against authorized manufacturing views, but no matching records were found in the current authorized data scope.';
  }
  const referencedTables = extractReferencedObjects(sql);
  const objectLabels = referencedTables.filter((table) => table !== 'DUAL').map(getSchemaObjectLabel);
  const target = objectLabels.length ? [...new Set(objectLabels)].slice(0, 3).join(', ') : 'authorized manufacturing views';
  const fields = normalizeColumns(columns, rows).slice(0, 5).map(humanizeColumnName).filter(Boolean);
  return `SQL was validated and executed against ${target}. It returned ${rowCount.toLocaleString()} structured record${rowCount === 1 ? '' : 's'}${fields.length ? ` with ${fields.join(', ')}` : ''}.`;
}

function invalidateMetadataCaches() {
  schemaCache = {
    expiresAt: 0,
    grouped: {},
    tableComments: {},
  };
  entityCacheByScope.clear();
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
    trace,
  });
  const answer = await summarizeQueryResult({
    question,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    trace,
    conversationContext,
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
      'You are an operations analyst for a manufacturing operations platform.',
      'Answer only from the supplied JSON context.',
      'Be concise, specific, and truthful.',
      'If the context is incomplete, say so plainly.',
      instructions || '',
    ].join('\n'),
    `Question: ${question}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.2, profile }
  );
}

async function checkAskManufacturingDataHealth({ demoUser = RESTRICTED_DEMO_USER, profile = DEFAULT_PROFILE } = {}) {
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
      'SELECT COUNT(*) AS work_order_count FROM manufacturing_work_orders_v',
      { demoUser, maxRows: 1 }
    );
    result.oracle.status = 'healthy';
    result.oracle.rowCount = query.rows?.[0]?.WORK_ORDER_COUNT ?? null;
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
  checkAskManufacturingDataHealth,
  createAskDataError,
  describeGeneratedSql,
  ensureSqlRowLimit,
  executeReadOnlySql,
  generatePatternSql,
  generateQuestionSql,
  generateReadOnlySql,
  getAvailableProfiles,
  getAvailableSelectAiProfiles,
  getManufacturingSchemaObjectMetadata,
  getOllamaRuntimeConfig,
  getProfileModel,
  groupManufacturingSchemaObjectMetadata,
  invalidateMetadataCaches,
  isAssistantQueryableObject,
  normalizeAskDataError,
  normalizeProfile,
  parseJsonResponse,
  runQuestionQuery,
  summarizeQueryResult,
  summarizeRunSqlResult,
  summarizeContext,
  validateReadOnlySql,
};
