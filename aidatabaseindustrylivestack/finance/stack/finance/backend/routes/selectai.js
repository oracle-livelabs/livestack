const express = require('express');
const router = express.Router();
const {
  DEFAULT_PROFILE,
  answerQuestion,
  generateQuestionSql,
  getAvailableSelectAiProfiles,
  getProfileModel,
  normalizeProfile,
  runQuestionQuery,
} = require('../lib/ollamaAssistant');

const FINANCE_SCHEMA_OBJECTS = [
  schemaObject('finance_institutions_v', 'view', 'Institutions', 'Finance Institutions', 'Finance-facing institution, counterparty, and business line view.'),
  schemaObject('brands', 'table', 'Institutions', 'Institutions', 'Base institution and counterparty data.'),
  schemaObject('finance_products_v', 'view', 'Products & Exposure', 'Finance Products', 'Finance-facing financial product view.'),
  schemaObject('products', 'table', 'Products & Exposure', 'Financial Products', 'Base financial product data.'),
  schemaObject('client_transactions_v', 'view', 'Transactions & Cases', 'Client Transactions', 'Finance-facing transaction and case view.'),
  schemaObject('orders', 'table', 'Transactions & Cases', 'Client Transactions & Cases', 'Base client transaction and case records.'),
  schemaObject('order_items', 'table', 'Transactions & Cases', 'Transaction Line Items', 'Financial product line items for client transactions.'),
  schemaObject('customers', 'table', 'Clients', 'Clients', 'Client account, tier, and location records.'),
  schemaObject('risk_signals_v', 'view', 'Risk Signals', 'Risk Signals', 'Finance-facing compliance, fraud, market, and operations signal view.'),
  schemaObject('signal_sources_v', 'view', 'Risk Signals', 'Signal Sources', 'Finance-facing institutional monitoring source view.'),
  schemaObject('social_posts', 'table', 'Risk Signals', 'Risk Signal Records', 'Base regulatory, market, fraud, and operations risk signal records.'),
  schemaObject('influencers', 'table', 'Risk Signals', 'Monitoring Sources', 'Base risk signal source records.'),
  schemaObject('service_centers_v', 'view', 'Service Operations', 'Service Centers', 'Finance-facing operations center view.'),
  schemaObject('service_capacity_v', 'view', 'Service Operations', 'Service Capacity', 'Finance-facing processing capacity view.'),
  schemaObject('service_routes_v', 'view', 'Service Operations', 'Service Routes', 'Finance-facing transaction routing and SLA view.'),
  schemaObject('fulfillment_centers', 'table', 'Service Operations', 'Operations Centers', 'Base regional operations center records.'),
  schemaObject('inventory', 'table', 'Service Operations', 'Processing Capacity', 'Base service capacity records.'),
  schemaObject('shipments', 'table', 'Service Operations', 'Transaction Routing', 'Base route and SLA records for transaction processing.'),
  schemaObject('agent_actions', 'table', 'AI Agent Actions', 'AI Agent Actions', 'AI agent decisions, audit events, and recommended actions.'),
];

function schemaObject(objectName, objectType, domain, displayName, description) {
  return {
    object_name: objectName,
    object_type: objectType,
    domain,
    display_name: displayName,
    description,
    example_questions: [],
    is_queryable_by_assistant: true,
  };
}

function groupFinanceSchemaObjectMetadata(objects) {
  const groups = new Map();
  objects.forEach((object) => {
    if (!groups.has(object.domain)) groups.set(object.domain, []);
    groups.get(object.domain).push(object);
  });
  return [...groups.entries()].map(([domain, groupObjects]) => ({
    domain,
    objects: groupObjects,
    object_count: groupObjects.length,
  }));
}

function inferErrorCategory(error) {
  const message = error?.message || '';
  if (message === 'timeout') return 'REQUEST_TIMEOUT';
  if (/Only SELECT or WITH|Comments and multiple statements|Write operations and PL\/SQL|System packages and metadata views|unsupported tables|not allowed/i.test(message)) {
    return 'SQL_VALIDATION_BLOCKED';
  }
  if (/Unable to generate|No SQL generated|safe read-only SQL query|valid Oracle SQL query/i.test(message)) {
    return 'SQL_GENERATION_FAILED';
  }
  if (/Ollama request failed|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return 'OLLAMA_UNAVAILABLE';
  }
  if (/ORA-\d{5}|Oracle/i.test(message)) {
    return 'ORACLE_QUERY_FAILED';
  }
  return 'UNEXPECTED_BACKEND_RESPONSE';
}

function describeGeneratedSql(sql, question) {
  const normalized = String(sql || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const target = /social_posts|risk_signals_v/i.test(sql)
    ? 'risk signals'
    : /fulfillment_centers|service_/i.test(sql)
      ? 'service operations'
      : /orders|client_transactions_v|order_items/i.test(sql)
        ? 'client transaction'
        : 'governed finance';
  return `Generated SQL for the finance question "${question}" using authorized ${target} data. Review it before running if you need the raw rows.`;
}

function summarizeRunSqlResult(result) {
  const rowCount = Number(result?.rowCount || 0);
  if (rowCount === 0) {
    return 'SQL was validated and executed against authorized Seer Bank finance data, but no matching records were found.';
  }
  const columns = (result.columns || []).slice(0, 4).join(', ');
  return `${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'} returned from the governed Seer Bank finance schema${columns ? ` with columns ${columns}` : ''}.`;
}

function createErrorResponse(err, q, startTime, resolvedProfile) {
  const category = inferErrorCategory(err);
  return {
    question: q,
    error: err.message === 'timeout'
      ? 'The request took too long. Try a narrower question.'
      : err.message,
    category,
    elapsed: Date.now() - startTime,
    profile: err.profile || resolvedProfile,
    model: err.model || getProfileModel(resolvedProfile),
    sql: category === 'SQL_VALIDATION_BLOCKED' ? null : err.sql || null,
    oracleError: err.oracleError || null,
  };
}

function isUserQueryError(error) {
  if (error?.isUserQueryError) return true;
  return /Unable to generate|No SQL generated|Only SELECT or WITH|not allowed|unsupported tables|Use .* instead|Oracle equivalents|PostgreSQL syntax|valid Oracle SQL query/i.test(
    error.message || ''
  );
}

router.get('/profiles', async (_req, res) => {
  res.json({
    profiles: getAvailableSelectAiProfiles(),
    activeProfile: DEFAULT_PROFILE,
  });
});

router.get('/schema-objects', async (_req, res) => {
  res.json({
    objects: FINANCE_SCHEMA_OBJECTS,
    domains: groupFinanceSchemaObjectMetadata(FINANCE_SCHEMA_OBJECTS),
    meta: {
      object_count: FINANCE_SCHEMA_OBJECTS.length,
      domain_count: new Set(FINANCE_SCHEMA_OBJECTS.map((object) => object.domain)).size,
      raw_object_names_preserved: true,
      queryable_only: true,
    },
  });
});

router.get('/health', async (req, res) => {
  const profile = normalizeProfile(req.query.profile);
  res.json({
    status: 'healthy',
    profile,
    model: getProfileModel(profile),
    checks: [
      { name: 'profiles', status: 'ok', count: getAvailableSelectAiProfiles().length },
      { name: 'schema_metadata', status: 'ok', count: FINANCE_SCHEMA_OBJECTS.length },
    ],
    timestamp: new Date().toISOString(),
  });
});

async function handleNarrativeMode(req, res, mode) {
  const { question, showSql = true, profile, history = [] } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);

  try {
    const result = await Promise.race([
      answerQuestion(q, {
        mode,
        demoUser: req.demoUser,
        profile: resolvedProfile,
        conversationContext: mode === 'chat' ? history : [],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 180000)),
    ]);

    return res.json({
      question: q,
      answer: result.answer,
      keyFindings: result.keyFindings || [],
      resultSummary: result.resultSummary || '',
      followUpQuestions: result.followUpQuestions || [],
      referencedData: result.referencedData || null,
      rowCount: result.rowCount,
      sql: showSql ? result.sql : null,
      warnings: result.warnings || [],
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
    });
  } catch (err) {
    console.error(`Select AI ${mode} error:`, err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json(createErrorResponse(err, q, startTime, resolvedProfile));
  }
}

router.post('/chat', async (req, res) => {
  return handleNarrativeMode(req, res, 'narrate');
});

router.post('/chat-mode', async (req, res) => {
  return handleNarrativeMode(req, res, 'chat');
});

router.post('/showsql', async (req, res) => {
  const { question, profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);

  try {
    const result = await Promise.race([
      generateQuestionSql(q, { mode: 'showsql', profile: resolvedProfile }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);

    return res.json({
      question: q,
      sql: result.sql,
      explanation: describeGeneratedSql(result.sql, q),
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
    });
  } catch (err) {
    console.error('Select AI showsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json(createErrorResponse(err, q, startTime, resolvedProfile));
  }
});

router.post('/runsql', async (req, res) => {
  const { question, profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);

  try {
    const result = await Promise.race([
      runQuestionQuery(q, { mode: 'runsql', demoUser: req.demoUser, profile: resolvedProfile }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);

    return res.json({
      question: q,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      sql: result.sql,
      explanation: summarizeRunSqlResult(result),
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
    });
  } catch (err) {
    console.error('Select AI runsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json(createErrorResponse(err, q, startTime, resolvedProfile));
  }
});

module.exports = router;
