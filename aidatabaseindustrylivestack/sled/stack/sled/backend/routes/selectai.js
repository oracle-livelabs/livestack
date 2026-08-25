const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
  DEFAULT_PROFILE,
  answerQuestion,
  checkAskSledDataHealth,
  createAskDataError,
  describeGeneratedSql,
  generateQuestionSql,
  getAvailableSelectAiProfiles,
  getOllamaRuntimeConfig,
  getProfileModel,
  getSledSchemaObjectMetadata,
  groupSledSchemaObjectMetadata,
  normalizeAskDataError,
  normalizeProfile,
  runQuestionQuery,
  summarizeRunSqlResult,
} = require('../lib/ollamaAssistant');

function isUserQueryError(error) {
  if (error?.isUserQueryError) return true;
  return /Unable to generate|No SQL generated|Only SELECT or WITH|not allowed|unsupported tables|Use .* instead|Oracle equivalents|PostgreSQL syntax|valid Oracle SQL query/i.test(
    error.message || ''
  );
}

function createCorrelationId() {
  return crypto.randomUUID ? crypto.randomUUID() : `ask-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTrace(req, mode, profile, question = '') {
  const resolvedProfile = normalizeProfile(profile);
  const runtime = getOllamaRuntimeConfig(resolvedProfile);
  return {
    correlationId: req.headers['x-correlation-id'] || createCorrelationId(),
    mode,
    promptLength: String(question || '').length,
    profile: resolvedProfile,
    model: runtime.model,
    ollamaHost: runtime.host,
    startedAt: Date.now(),
  };
}

function logTrace(trace, status, extra = {}) {
  console.info(JSON.stringify({
    event: 'ask_state_local_government_data_request',
    correlation_id: trace.correlationId,
    mode: trace.mode,
    prompt_length: trace.promptLength,
    profile: trace.profile,
    selected_model: trace.model,
    ollama_host: trace.ollamaHost,
    row_count: trace.rowCount ?? null,
    final_status: status,
    elapsed_ms: Date.now() - trace.startedAt,
    ...extra,
  }));
}

function safeErrorResponse(err, trace, fallbackProfile) {
  const normalized = normalizeAskDataError(err);
  const profile = normalized.profile || fallbackProfile || trace.profile;
  return {
    error: normalized.message,
    category: normalized.category,
    correlationId: trace.correlationId,
    profile,
    model: normalized.model || getProfileModel(profile),
    elapsed: Date.now() - trace.startedAt,
    sql: normalized.category === 'SQL_VALIDATION_BLOCKED' ? null : normalized.sql,
    oracleError: normalized.oracleError || null,
  };
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(createAskDataError('REQUEST_TIMEOUT', null, { statusCode: 504 })), ms);
  });
}

function toPublicSchemaObject(object) {
  const displayName = object.display_name || object.label || String(object.name || '').replace(/^SLED_/i, '').replace(/_V$/i, '').replace(/_/g, ' ');
  return {
    ...object,
    name: displayName,
    object_name: displayName,
    objectName: displayName,
    display_name: displayName,
    raw_identifier_hidden: true,
  };
}

router.get('/profiles', async (_req, res) => {
  res.json({
    profiles: getAvailableSelectAiProfiles(),
    activeProfile: DEFAULT_PROFILE,
  });
});

router.get('/schema-objects', async (_req, res) => {
  const objects = getSledSchemaObjectMetadata().map(toPublicSchemaObject);
  res.json({
    objects,
    domains: groupSledSchemaObjectMetadata(objects),
    meta: {
      object_count: objects.length,
      domain_count: new Set(objects.map((object) => object.domain)).size,
      raw_object_names_preserved: false,
      raw_object_names_visible_only_in_sql_modes: true,
      queryable_only: true,
    },
  });
});

router.get('/health', async (req, res) => {
  const profile = normalizeProfile(req.query.profile);
  const result = await checkAskSledDataHealth({ demoUser: req.demoUser, profile });
  res.status(200).json({
    ...result,
    timestamp: new Date().toISOString(),
  });
});

async function handleNarrativeMode(req, res, mode) {
  const { question, showSql = true, profile, history = [] } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const resolvedProfile = normalizeProfile(profile);
  const trace = createTrace(req, mode === 'narrate' ? 'explain' : 'chat', resolvedProfile, q);
  res.setHeader('X-Correlation-ID', trace.correlationId);

  try {
    const result = await Promise.race([
      answerQuestion(q, {
        mode,
        demoUser: req.demoUser,
        profile: resolvedProfile,
        trace,
        conversationContext: history,
      }),
      timeoutAfter(180000),
    ]);
    trace.rowCount = result.rowCount;
    logTrace(trace, 'success', { row_count: result.rowCount });

    return res.json({
      mode: mode === 'narrate' ? 'explain' : 'chat',
      question: q,
      answer: result.answer,
      keyFindings: result.keyFindings || [],
      resultSummary: result.resultSummary || '',
      followUpQuestions: result.followUpQuestions || [],
      referencedData: result.referencedData || null,
      rowCount: result.rowCount,
      sql: showSql ? result.sql : null,
      warnings: result.warnings || [],
      elapsed: Date.now() - trace.startedAt,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
      correlationId: trace.correlationId,
    });
  } catch (err) {
    const normalized = normalizeAskDataError(err);
    logTrace(trace, 'failed', {
      error_category: normalized.category,
      developer_message: normalized.developerMessage,
    });
    console.error(`Select AI ${mode} error [${trace.correlationId}]:`, normalized.developerMessage);
    return res.status(normalized.statusCode || (isUserQueryError(err) ? 400 : 500)).json({
      question: q,
      ...safeErrorResponse(err, trace, resolvedProfile),
    });
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
  const resolvedProfile = normalizeProfile(profile);
  const trace = createTrace(req, 'show_sql', resolvedProfile, q);
  res.setHeader('X-Correlation-ID', trace.correlationId);

  try {
    const result = await Promise.race([
      generateQuestionSql(q, { mode: 'showsql', profile: resolvedProfile, trace }),
      timeoutAfter(150000),
    ]);
    const sql = typeof result === 'string' ? result : result.sql;
    logTrace(trace, 'success');

    return res.json({
      mode: 'show_sql',
      question: q,
      sql,
      explanation: describeGeneratedSql(sql, q),
      warnings: result.warnings || [],
      elapsed: Date.now() - trace.startedAt,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
      correlationId: trace.correlationId,
    });
  } catch (err) {
    const normalized = normalizeAskDataError(err);
    logTrace(trace, 'failed', {
      error_category: normalized.category,
      developer_message: normalized.developerMessage,
    });
    console.error(`Select AI showsql error [${trace.correlationId}]:`, normalized.developerMessage);
    return res.status(normalized.statusCode || (isUserQueryError(err) ? 400 : 500)).json({
      question: q,
      ...safeErrorResponse(err, trace, resolvedProfile),
    });
  }
});

router.post('/runsql', async (req, res) => {
  const { question, profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const resolvedProfile = normalizeProfile(profile);
  const trace = createTrace(req, 'run_sql', resolvedProfile, q);
  res.setHeader('X-Correlation-ID', trace.correlationId);

  try {
    const result = await Promise.race([
      runQuestionQuery(q, { mode: 'runsql', demoUser: req.demoUser, profile: resolvedProfile, trace }),
      timeoutAfter(150000),
    ]);
    trace.rowCount = result.rowCount;
    logTrace(trace, 'success', { row_count: result.rowCount });

    return res.json({
      mode: 'run_sql',
      question: q,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      sql: result.sql,
      explanation: summarizeRunSqlResult(result),
      resultSummary: summarizeRunSqlResult(result),
      elapsed: Date.now() - trace.startedAt,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
      correlationId: trace.correlationId,
    });
  } catch (err) {
    const normalized = normalizeAskDataError(err);
    logTrace(trace, 'failed', {
      error_category: normalized.category,
      developer_message: normalized.developerMessage,
    });
    console.error(`Select AI runsql error [${trace.correlationId}]:`, normalized.developerMessage);
    return res.status(normalized.statusCode || (isUserQueryError(err) ? 400 : 500)).json({
      question: q,
      ...safeErrorResponse(err, trace, resolvedProfile),
    });
  }
});

module.exports = router;
