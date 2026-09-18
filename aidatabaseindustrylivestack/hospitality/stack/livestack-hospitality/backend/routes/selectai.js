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
const { resolveConversationQuestion } = require('../lib/conversationContext');

const HOSPITALITY_SCHEMA_OBJECTS = [
  schemaObject('hospitality_properties_v', 'view', 'Properties', 'Properties', 'Hospitality-facing property, brand, and portfolio view.'),
  schemaObject('brands', 'table', 'Properties', 'Properties', 'Base property and hotel group data.'),
  schemaObject('hospitality_room_revenue_v', 'view', 'Rooms & Revenue', 'Room Types and Revenue Centers', 'Hospitality-facing room type, rate plan, and revenue-center view.'),
  schemaObject('products', 'table', 'Rooms & Revenue', 'Room Types and Revenue Centers', 'Base room type, rate plan, venue, and outlet data.'),
  schemaObject('guest_reservations_v', 'view', 'Reservations & Folios', 'Guest Reservations', 'Hospitality-facing reservation, folio, and service view.'),
  schemaObject('orders', 'table', 'Reservations & Folios', 'Reservations & Folios', 'Base reservation, folio, and service records.'),
  schemaObject('order_items', 'table', 'Reservations & Folios', 'Folio Line Items', 'Room, outlet, event, and service line items for reservations.'),
  schemaObject('guests', 'table', 'Guests', 'Guests', 'Guest profile, segment, and location records.'),
  schemaObject('guest_signals_v', 'view', 'Guest Signals', 'Guest Signals', 'Hospitality-facing guest review, channel, demand, and operations signal view.'),
  schemaObject('signal_sources_v', 'view', 'Guest Signals', 'Signal Sources', 'Hospitality-facing monitoring source view.'),
  schemaObject('social_posts', 'table', 'Guest Signals', 'Guest Signal Records', 'Base guest, demand, channel, and operations signal records.'),
  schemaObject('influencers', 'table', 'Guest Signals', 'Monitoring Sources', 'Base guest and operations signal source records.'),
  schemaObject('hotels_v', 'view', 'Service Operations', 'Hotels', 'Hospitality-facing hotel view.'),
  schemaObject('service_capacity_v', 'view', 'Service Operations', 'Service Capacity', 'Hospitality-facing housekeeping and maintenance capacity view.'),
  schemaObject('service_routes_v', 'view', 'Service Operations', 'Service Routes', 'Hospitality-facing reservation service routing and SLA view.'),
  schemaObject('fulfillment_centers', 'table', 'Service Operations', 'Hotels', 'Base property hotel service records.'),
  schemaObject('inventory', 'table', 'Service Operations', 'Room and Crew Capacity', 'Base room-night, housekeeping, and maintenance capacity records.'),
  schemaObject('shipments', 'table', 'Service Operations', 'Service Routing', 'Base route and SLA records for reservation service work.'),
  schemaObject('agent_actions', 'table', 'AI Agent Actions', 'AI Agent Actions', 'AI agent decisions, audit events, and recommended actions.'),
];
const ASKDATA_REQUEST_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.ASKDATA_REQUEST_TIMEOUT_MS || '28000', 10));

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

function groupHospitalitySchemaObjectMetadata(objects) {
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
  if (/Ollama request timed out|OLLAMA_TIMEOUT/i.test(message) || error?.code === 'OLLAMA_TIMEOUT') {
    return 'OLLAMA_TIMEOUT';
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
    : /fulfillment_centers|hotels_v|service_/i.test(sql)
      ? 'service operations'
    : /orders|guest_reservations_v|order_items/i.test(sql)
        ? 'guest reservation'
        : 'governed hospitality';
  return `Generated SQL for the hospitality question "${question}" using authorized ${target} data. Review it before running if you need the raw rows.`;
}

function summarizeRunSqlResult(result) {
  const rowCount = Number(result?.rowCount || 0);
  if (rowCount === 0) {
    return 'SQL was validated and executed against authorized Harborstone hospitality data, but no matching records were found.';
  }
  const columns = (result.columns || []).slice(0, 4).join(', ');
  return `${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'} returned from the governed Harborstone hospitality schema${columns ? ` with columns ${columns}` : ''}.`;
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

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      role: entry?.role === 'assistant' ? 'assistant' : entry?.role === 'user' ? 'user' : null,
      mode: entry?.mode || null,
      text: String(entry?.text || '').trim().slice(0, 1200),
    }))
    .filter((entry) => entry.role && entry.text)
    .slice(-12);
}

router.get('/profiles', async (_req, res) => {
  res.json({
    profiles: getAvailableSelectAiProfiles(),
    activeProfile: DEFAULT_PROFILE,
  });
});

router.get('/schema-objects', async (_req, res) => {
  res.json({
    objects: HOSPITALITY_SCHEMA_OBJECTS,
    domains: groupHospitalitySchemaObjectMetadata(HOSPITALITY_SCHEMA_OBJECTS),
    meta: {
      object_count: HOSPITALITY_SCHEMA_OBJECTS.length,
      domain_count: new Set(HOSPITALITY_SCHEMA_OBJECTS.map((object) => object.domain)).size,
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
      { name: 'schema_metadata', status: 'ok', count: HOSPITALITY_SCHEMA_OBJECTS.length },
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
  const conversationContext = normalizeConversationHistory(history);

  try {
    const result = await Promise.race([
      answerQuestion(q, {
        mode,
        demoUser: req.demoUser,
        profile: resolvedProfile,
        conversationContext,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ASKDATA_REQUEST_TIMEOUT_MS)),
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
      contextTurns: conversationContext.length,
      resolvedQuestion: result.resolvedQuestion || q,
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
  const { question, profile, history = [] } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);
  const conversationContext = normalizeConversationHistory(history);
  const effectiveQuestion = resolveConversationQuestion(q, conversationContext);

  try {
    const result = await Promise.race([
      generateQuestionSql(effectiveQuestion, { mode: 'showsql', profile: resolvedProfile }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ASKDATA_REQUEST_TIMEOUT_MS)),
    ]);

    return res.json({
      question: q,
      sql: result.sql,
      explanation: describeGeneratedSql(result.sql, q),
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
      contextTurns: conversationContext.length,
      resolvedQuestion: effectiveQuestion,
    });
  } catch (err) {
    console.error('Select AI showsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json(createErrorResponse(err, q, startTime, resolvedProfile));
  }
});

router.post('/runsql', async (req, res) => {
  const { question, profile, history = [] } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);
  const conversationContext = normalizeConversationHistory(history);
  const effectiveQuestion = resolveConversationQuestion(q, conversationContext);

  try {
    const result = await Promise.race([
      runQuestionQuery(effectiveQuestion, { mode: 'runsql', demoUser: req.demoUser, profile: resolvedProfile }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ASKDATA_REQUEST_TIMEOUT_MS)),
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
      contextTurns: conversationContext.length,
      resolvedQuestion: effectiveQuestion,
    });
  } catch (err) {
    console.error('Select AI runsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json(createErrorResponse(err, q, startTime, resolvedProfile));
  }
});

module.exports = router;
