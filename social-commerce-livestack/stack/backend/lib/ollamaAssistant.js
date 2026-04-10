const db = require('../config/database');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_PRIMARY || 'llama3.2';
const DEFAULT_PROFILE = 'SC_LLAMA_PROFILE';
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
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
const LEGACY_PROFILE_ALIASES = new Set([
  'SC_COHERE_PROFILE',
  'SC_EMBED_PROFILE',
  'SC_GROK42_PROFILE',
  'SC_LLAMA_PROFILE',
  'SC_VISION_PROFILE',
  'OLLAMA_LLAMA32',
  'OLLAMA_LLAMA32_PROFILE',
]);
const RELATIONSHIP_HINTS = [
  'PRODUCTS.BRAND_ID joins to BRANDS.BRAND_ID.',
  'ORDER_ITEMS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'ORDER_ITEMS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
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

function normalizeProfile(profile) {
  if (!profile || !String(profile).trim()) return DEFAULT_PROFILE;
  const normalized = String(profile).trim().toUpperCase();
  if (LEGACY_PROFILE_ALIASES.has(normalized)) return DEFAULT_PROFILE;
  return DEFAULT_PROFILE;
}

function getAvailableProfiles() {
  return [
    {
      name: DEFAULT_PROFILE,
      status: 'ENABLED',
      model: OLLAMA_MODEL,
      provider: 'Ollama',
      type: 'Local SQL + reasoning',
      description: 'Primary local Ollama model used for all runtime AI features.',
    },
  ];
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

async function ollamaGenerate(prompt, { format = null, temperature = 0.1, numPredict = 192 } = {}) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
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

async function ollamaJson(systemPrompt, userPrompt) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature: 0.05, numPredict: 160 }
  );
  return parseJsonResponse(text);
}

async function ollamaText(systemPrompt, userPrompt, { temperature = 0.2 } = {}) {
  return ollamaGenerate(`${systemPrompt}\n\n${userPrompt}`, {
    temperature,
    numPredict: 220,
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

  if (/(viral|virality|trend|trending|momentum|social|post|influencer|engagement|views|likes|shares|sentiment)/.test(q)) {
    ['BRANDS', 'INFLUENCERS', 'POST_PRODUCT_MENTIONS', 'PRODUCTS', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(inventory|fulfillment|warehouse|restock|reorder|stock|ship|shipping|delivery|route|routing|center|nearest|customer in|demand)/.test(q)) {
    ['CUSTOMERS', 'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'FULFILLMENT_CENTERS', 'FULFILLMENT_ZONES', 'INVENTORY', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(order|orders|revenue|sales|customer|brand|product|price|category|total|average|best-selling)/.test(q)) {
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
    '- SOCIAL_POSTS.MOMENTUM_FLAG values include normal, rising, viral, and mega_viral.',
    '- INVENTORY low-stock logic typically compares QUANTITY_ON_HAND to REORDER_POINT.',
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

  if (/(how many orders.*\b(in total|total|overall)\b|summarize .*how many orders|summarize .*total orders|total order count|overall order count|count of orders)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_orders FROM orders`;
  }

  if (/total revenue.*all orders|revenue from all orders|overall revenue/.test(qLower)) {
    return `SELECT ROUND(SUM(order_total), 2) AS total_revenue FROM orders`;
  }

  if (/revenue.*product category|revenue by category|category.*revenue|breakdown by category/.test(qLower)) {
    return `SELECT p.category,
                   COUNT(DISTINCT o.order_id) AS orders,
                   ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.order_id
            JOIN products p ON oi.product_id = p.product_id
            GROUP BY p.category
            ORDER BY revenue DESC`;
  }

  if (/(top .*best-selling products.*revenue|top .*products by revenue|best-selling products by revenue)/.test(qLower)) {
    return `SELECT p.product_name,
                   b.brand_name,
                   ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue,
                   SUM(oi.quantity) AS units_sold
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            JOIN brands b ON p.brand_id = b.brand_id
            GROUP BY p.product_name, b.brand_name
            ORDER BY revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  const viralityMatch = qLower.match(/virality score above\s+(\d+)/);
  if (/how many social posts/.test(qLower) && viralityMatch) {
    return `SELECT COUNT(*) AS social_post_count
            FROM social_posts
            WHERE virality_score > ${parseInt(viralityMatch[1], 10)}`;
  }

  if (/fulfillment centers have the most inventory|centers have the most inventory|most inventory/.test(qLower)) {
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

  if (/highest average order value|average order value by brand/.test(qLower)) {
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

  if (/how many orders have a social media source|how many orders.*social source|social-driven orders|social driven orders/.test(qLower)) {
    return `SELECT COUNT(*) AS social_driven_orders
            FROM orders
            WHERE social_source_id IS NOT NULL`;
  }

  if (/average virality score by platform|virality.*by platform/.test(qLower)) {
    return `SELECT platform,
                   ROUND(AVG(virality_score), 2) AS avg_virality_score,
                   COUNT(*) AS post_count
            FROM social_posts
            GROUP BY platform
            ORDER BY avg_virality_score DESC`;
  }

  if (/customers placed the most orders|which customers .*most orders|top customers by orders/.test(qLower)) {
    return `SELECT c.customer_name,
                   c.email,
                   COUNT(o.order_id) AS order_count,
                   ROUND(SUM(o.order_total), 2) AS total_revenue
            FROM customers c
            JOIN orders o ON c.customer_id = o.customer_id
            GROUP BY c.customer_name, c.email
            ORDER BY order_count DESC, total_revenue DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many orders were placed this week|orders placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS orders_this_week
            FROM orders
            WHERE CAST(created_at AS DATE) >= TRUNC(SYSDATE, 'IW')`;
  }

  if (/top products by revenue/.test(qLower)) {
    return `SELECT p.product_name,
                   ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
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

async function generateReadOnlySql(question, { mode = 'narrate' } = {}) {
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
      '- For list-style results, prefer FETCH FIRST 25 ROWS ONLY.',
      '- If the request cannot be answered from the schema, return an empty sql string and explain why in reason.',
    ].join('\n'),
    `Question: ${question}\nMode: ${mode}\n\n${schemaContext}`
  );

  const sql = response?.sql || '';
  const validation = validateReadOnlySql(sql);
  if (!sql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to generate a safe read-only SQL query.');
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

async function summarizeQueryResult({ question, mode = 'narrate', sql, columns, rows, rowCount }) {
  const fastSummary = deterministicSummary({ mode, sql, columns, rows, rowCount });

  if (mode !== 'chat' || rowCount <= 5) {
    return fastSummary;
  }

  try {
    return await ollamaText(
      [
        'You are a data analyst for a social commerce demo application.',
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
      { temperature: 0.15 }
    );
  } catch (_) {
    return fastSummary;
  }
}

async function answerQuestion(question, { mode = 'narrate', demoUser = null } = {}) {
  const sql = await generateReadOnlySql(question, { mode });
  const result = await executeReadOnlySql(sql, { demoUser });
  const answer = await summarizeQueryResult({
    question,
    mode,
    sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
  });

  return {
    answer,
    sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
  };
}

async function summarizeContext({ question, instructions, context }) {
  return ollamaText(
    [
      'You are an operations analyst for a social commerce platform.',
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
  normalizeProfile,
  summarizeContext,
  validateReadOnlySql,
};
