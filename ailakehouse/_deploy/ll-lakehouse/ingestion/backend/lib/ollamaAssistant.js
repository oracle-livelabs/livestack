const db = require('../config/database');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_PRIMARY || 'llama3.2';
const DEFAULT_PROFILE = 'PG_LLAMA_PROFILE';
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
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
  'ORDERS',
  'ORDER_ITEMS',
  'POST_PRODUCT_MENTIONS',
  'PRODUCTS',
  'SHIPMENTS',
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
      'PG_COHERE_PROFILE',
      'PG_EMBED_PROFILE',
      'PG_GROK42_PROFILE',
      'PG_VISION_PROFILE',
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
  'ORDERS.CUSTOMER_ID joins to CUSTOMERS.CUSTOMER_ID.',
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
    ? ` Try a known brand or partner such as ${formatEntityList(brandSuggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't map "${candidate}" to this demo schema. This app models brands and partners, sporting goods products, customers, store fulfillment sites, orders, and market signal sources.${suggestionText}`
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
      findExactEntityMatch(catalogs.customer, candidate),
      findExactEntityMatch(catalogs.influencer, candidate),
    ].find(Boolean);

    if (!supportedMatch) {
      throw buildUnsupportedRetailerError(candidate, rankEntityMatches(catalogs.brand, candidate, 3));
    }
  }

  const explicitEntityPatterns = [
    { type: 'brand', regexes: [/\b(?:brand|brand or partner)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'product', regexes: [/\b(?:product|sporting goods product|item|gear)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'center', regexes: [/\b(?:fulfillment\s+center|fulfillment\s+site|eligible\s+site|store\s+site|warehouse|center|site)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'customer', regexes: [/\b(?:customer|customer|account)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
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

async function ollamaJson(systemPrompt, userPrompt, { profile = DEFAULT_PROFILE } = {}) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature: 0.05, numPredict: 160, profile }
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

  if (/(viral|virality|critical|risk|returns audit|market|bulletin|signal|trend|trending|momentum|social|post|influencer|source|engagement|views|likes|shares|sentiment)/.test(q)) {
    ['BRANDS', 'INFLUENCERS', 'POST_PRODUCT_MENTIONS', 'PRODUCTS', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(inventory|fulfillment|warehouse|eligible|replenishment|reorder|capacity|ship|shipping|delivery|route|routing|center|nearest|customer in|customer in|demand)/.test(q)) {
    ['CUSTOMERS', 'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'FULFILLMENT_CENTERS', 'FULFILLMENT_ZONES', 'INVENTORY', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(order|orders|revenue|sales|customer|customer|brand or partner|brand|sporting goods product|product|price|category|total|average|best-selling)/.test(q)) {
    ['BRANDS', 'CUSTOMERS', 'ORDERS', 'ORDER_ITEMS', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(user|users|region|role|account)/.test(q)) {
    ['APP_USERS'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    ['BRANDS', 'CUSTOMERS', 'ORDERS', 'ORDER_ITEMS', 'PRODUCTS', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
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
    '- SOCIAL_POSTS.MOMENTUM_FLAG values include normal, rising, viral, and mega_viral; in this PeakGear sporting goods demo, viral means elevated signal intensity and mega_viral means critical demand signal intensity.',
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
  const orderAnchorDate = '(SELECT MAX(CAST(created_at AS DATE)) FROM orders)';

  if (/(how many orders.*\b(in total|total|overall)\b|summarize .*how many orders|summarize .*total orders|total order count|overall order count|count of orders)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_orders FROM orders`;
  }

  if (/total revenue.*all .*orders|revenue from all .*orders|overall revenue/.test(qLower)) {
    return `SELECT ROUND(SUM(order_total), 2) AS total_revenue FROM orders`;
  }

  if (/revenue.*(?:product|sporting goods product|gear) categor(?:y|ies)|revenue by (?:product |sporting goods product |gear )?categor(?:y|ies)|categor(?:y|ies).*revenue|breakdown by categor(?:y|ies)/.test(qLower)) {
    const categoryLimit = topMatch ? `\n            FETCH FIRST ${topN} ROWS ONLY` : '';
    return `SELECT p.category AS product_category,
                   COUNT(DISTINCT o.order_id) AS orders,
                   ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY p.category
            ORDER BY revenue DESC${categoryLimit}`;
  }

  if (/how many .*demand signals.*team sports|demand signals.*refer.*team sports|team sports.*demand signals/.test(qLower)) {
    return `SELECT COUNT(DISTINCT sp.post_id) AS team_sports_signal_count
            FROM social_posts sp
            JOIN post_product_mentions ppm ON ppm.post_id = sp.post_id
            JOIN products p ON p.product_id = ppm.product_id
            WHERE LOWER(p.category) = 'team sports'`;
  }

  if (/revenue by (?:brand|brand or partner)|(?:brand|brand or partner) revenue|sales by (?:brand|brand or partner)|revenue breakdown by (?:brand|brand or partner)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(o.created_at AS DATE) >= ${orderAnchorDate} - ${dayWindow}` : '';
    return `SELECT b.brand_name AS brand_partner_name,
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

  if (/(which is the best (?:product|sporting goods product)|what is the best (?:product|sporting goods product)|\bbest[-\s]selling (?:products?|sporting goods products?)\b|\bbest[-\s]performing (?:products?|sporting goods products?)\b|\bbest (?:product|sporting goods product)\b|top .*best-selling (?:products|sporting goods products).*revenue|top .*(?:products|sporting goods products) by revenue|best-selling (?:products|sporting goods products) by revenue|sporting goods products by revenue)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(o.created_at AS DATE) >= ${orderAnchorDate} - ${dayWindow}` : '';
    const limit = (!topMatch && /\bbest product\b/.test(qLower)) ? 1 : topN;
    return `SELECT p.product_name AS product_name,
                   b.brand_name AS brand_partner_name,
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

  const viralityMatch = qLower.match(/(?:virality|criticality|demand signal|signal) score above\s+(\d+)/);
  if (/(how many (?:social posts|market and operations signals|signals|demand signals)|count .*signals)/.test(qLower) && viralityMatch) {
    return `SELECT COUNT(*) AS critical_signal_count
            FROM social_posts
            WHERE virality_score > ${parseInt(viralityMatch[1], 10)}`;
  }

  if (/store fulfillment sites have the most inventory|centers have the most inventory|most inventory/.test(qLower)) {
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

  if (/highest average transaction value|average transaction value by brand/.test(qLower)) {
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

  if (/how many orders were completed last month|completed orders last month|orders completed last month/.test(qLower)) {
    return `SELECT COUNT(*) AS completed_orders_last_month
            FROM orders
            WHERE LOWER(order_status) = 'completed'
              AND CAST(created_at AS DATE) >= ADD_MONTHS(TRUNC(${orderAnchorDate}, 'MM'), -1)
              AND CAST(created_at AS DATE) < TRUNC(${orderAnchorDate}, 'MM')`;
  }

  if (/how many orders have a (?:social media|demand signal|market signal|signal) source|how many orders.*(?:social|returns audit|market|signal) source|signal-driven orders|social driven orders|signal-driven orders|signal driven orders/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_orders
            FROM orders
            WHERE social_source_id IS NOT NULL`;
  }

  if (/average sentiment score|avg sentiment score|our average sentiment|mean sentiment/.test(qLower)) {
    return `SELECT ROUND(AVG(sentiment_score), 3) AS avg_sentiment_score,
                   COUNT(*) AS signal_count
            FROM social_posts
            WHERE sentiment_score IS NOT NULL`;
  }

  if (/average (?:virality|criticality|signal) score by (?:platform|source type)|(?:virality|criticality|signal).*by (?:platform|source type)/.test(qLower)) {
    return `SELECT platform,
                   ROUND(AVG(virality_score), 2) AS avg_criticality_score,
                   COUNT(*) AS signal_count
            FROM social_posts
            GROUP BY platform
            ORDER BY avg_criticality_score DESC`;
  }

  if (/(customers|customers) placed the most orders|which (customers|customers) .*most orders|top (customers|customers) by orders/.test(qLower)) {
    return `SELECT TRIM(c.first_name || ' ' || c.last_name) AS customer_name,
                   c.email,
                   COUNT(o.order_id) AS order_count,
                   ROUND(SUM(o.order_total), 2) AS total_revenue
            FROM customers c
            JOIN orders o ON c.customer_id = o.customer_id
            GROUP BY c.first_name, c.last_name, c.email
            ORDER BY order_count DESC, total_revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many orders were placed this week|orders placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS orders_this_week
            FROM orders
            WHERE CAST(created_at AS DATE) >= TRUNC(${orderAnchorDate}, 'IW')`;
  }

  if (/top (?:products|sporting goods products) by revenue/.test(qLower)) {
    return `SELECT p.product_name AS product_name,
                   ROUND(SUM(oi.line_total), 2) AS revenue
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY p.product_name
            ORDER BY revenue DESC
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
  try {
    await connection.execute(
      `BEGIN sc_security_ctx.set_user_context(:username); END;`,
      { username: demoUser || 'admin_jess' }
    );
  } catch (_) {
    // The schema context package is optional for these helper calls.
  }
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

function deterministicSummary({ mode = 'narrate', sql, columns, rows, rowCount }) {
  if (!rows || rows.length === 0) {
    return 'No matching rows were found for that question.';
  }

  if (rowCount === 1) {
    const entries = Object.entries(rows[0]).map(([key, value]) => `${key}: ${formatValue(value)}`);
    return mode === 'chat'
      ? `I found one result. ${entries.join(', ')}.`
      : entries.join(', ');
  }

  const preview = rows.slice(0, 5).map((row) =>
    columns
      .slice(0, 4)
      .map((column) => `${column}: ${formatValue(row[column])}`)
      .join(', ')
  );

  const intro = mode === 'chat'
    ? `I found ${rowCount} rows. Here are the main results`
    : `Found ${rowCount} rows`;

  const sqlNote = sql ? '' : '';
  return `${intro}: ${preview.join(' | ')}${sqlNote}`;
}

async function summarizeQueryResult({ question, mode = 'narrate', sql, columns, rows, rowCount, profile = DEFAULT_PROFILE }) {
  const fastSummary = deterministicSummary({ mode, sql, columns, rows, rowCount });

  if (mode !== 'chat' || rowCount <= 5) {
    return fastSummary;
  }

  try {
    return await ollamaText(
      [
        'You are a data analyst for a governed PeakGear sporting goods demo application.',
        'Use only the supplied SQL result set.',
        'Do not invent numbers or columns.',
        'Answer conversationally in a short paragraph.',
      ].join('\n'),
      [
        `Question: ${question}`,
        `SQL: ${sql}`,
        `Columns: ${columns.join(', ')}`,
        `Row count: ${rowCount}`,
        `Rows: ${buildPromptRows(rows, 6)}`,
      ].join('\n\n'),
      { temperature: 0.15, profile }
    );
  } catch (_) {
    return fastSummary;
  }
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

async function answerQuestion(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const result = await runQuestionQuery(question, {
    mode,
    demoUser,
    profile: resolvedProfile,
  });
  const answer = await summarizeQueryResult({
    question,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
  });

  return {
    answer,
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
      'You are an operations analyst for a governed PeakGear sporting goods platform.',
      'Answer only from the supplied JSON context.',
      'Be concise, specific, and truthful.',
      'If the context is incomplete, say so plainly.',
      instructions || '',
    ].join('\n'),
    `Question: ${question}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.2 }
  );
}

module.exports = {
  DEFAULT_PROFILE,
  OLLAMA_MODEL,
  answerQuestion,
  executeReadOnlySql,
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
