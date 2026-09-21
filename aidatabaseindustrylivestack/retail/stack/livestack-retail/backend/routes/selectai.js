const crypto = require('crypto');
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
const {
  completeAskDataConversation,
  prepareAskDataConversation,
} = require('../lib/askDataConversationService');

const NARRATIVE_TIMEOUT_MS = 180000;
const QUERY_TIMEOUT_MS = 150000;

function getCorrelationId(req) {
  const supplied = String(req.get('x-correlation-id') || '').trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function getSecurityMetadata(req) {
  const identity = req.demoIdentity || {};
  return {
    vpdUser: identity.username || req.demoUser || null,
    role: identity.role || null,
    accessScope: identity.accessScope || null,
    readOnly: true,
    mutationPerformed: false,
  };
}

function createTimeoutError() {
  const error = new Error('The request took too long. Try a narrower question.');
  error.code = 'REQUEST_TIMEOUT';
  error.category = 'timeout';
  return error;
}

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function categorizeError(error) {
  if (error?.status && error?.code) {
    return { status: error.status, code: error.code, category: error.category || 'conversation' };
  }

  const code = String(error?.code || '');
  if (code === 'CONVERSATION_CONTEXT_AMBIGUOUS') return { status: 422, code, category: 'ambiguous' };
  if (code === 'CONVERSATION_STALE_DATASET' || code === 'CONVERSATION_PROFILE_CHANGED') {
    return { status: 409, code, category: 'stale' };
  }
  if (code === 'MODEL_OUTPUT_INVALID') return { status: 502, code, category: 'model' };
  if (code === 'OLLAMA_UNAVAILABLE') return { status: 503, code, category: 'model' };
  if (code === 'REQUEST_TIMEOUT') return { status: 504, code, category: 'timeout' };
  if (code === 'SQL_VALIDATION_BLOCKED') return { status: 400, code, category: 'validation' };
  if (code === 'QUESTION_REQUIRED') return { status: 400, code, category: 'validation' };
  if (code === 'ORACLE_QUERY_FAILED' || /^ORA-|^NJS-|^DPI-/.test(code)) {
    const unavailable = /ORA-(03113|03114|12170|12514|12541|12545)|NJS-503|DPI-(1010|1080)|ECONNREFUSED|ENOTFOUND/i.test(
      `${code} ${error?.message || ''}`
    );
    return { status: unavailable ? 503 : 400, code: 'ORACLE_QUERY_FAILED', category: 'oracle' };
  }
  if (error?.isUserQueryError) {
    return { status: 400, code: code || 'QUESTION_NOT_SUPPORTED', category: error.category || 'validation' };
  }
  return { status: 500, code: code || 'ASK_DATA_FAILED', category: error?.category || 'internal' };
}

function baseMetadata(req, correlationId) {
  return {
    correlationId,
    security: getSecurityMetadata(req),
  };
}

async function prepareRequest(req, mode, resolvedProfile) {
  const { question, conversation = null, history = [] } = req.body || {};
  return prepareAskDataConversation({
    question,
    conversation,
    history,
    profile: resolvedProfile,
    mode,
    identity: req.demoIdentity || { username: req.demoUser },
  });
}

function sendError(req, res, error, {
  correlationId,
  question,
  profile,
  startTime,
  prepared = null,
} = {}) {
  const classification = categorizeError(error);
  const conversation = error.conversation || prepared?.envelope || null;
  console.error(`Select AI ${classification.category} error [${correlationId}]:`, error.message);
  return res.status(classification.status).json({
    question: String(question || '').trim(),
    error: error.message || 'Ask Retail Data failed.',
    code: classification.code,
    category: classification.category,
    elapsed: Date.now() - startTime,
    profile: error.profile || profile,
    model: error.model || getProfileModel(profile),
    sql: error.sql || null,
    oracleError: error.oracleError || null,
    conversation,
    ...baseMetadata(req, correlationId),
  });
}

router.get('/profiles', async (_req, res) => {
  res.json({
    profiles: getAvailableSelectAiProfiles(),
    activeProfile: DEFAULT_PROFILE,
    conversationContractVersion: 1,
  });
});

async function handleNarrativeMode(req, res, mode) {
  const { question, showSql = true, profile } = req.body || {};
  const startTime = Date.now();
  const correlationId = getCorrelationId(req);
  const resolvedProfile = normalizeProfile(profile);
  let prepared;
  res.set('X-Correlation-ID', correlationId);

  try {
    prepared = await prepareRequest(req, mode, resolvedProfile);
    const result = await withTimeout(answerQuestion(prepared.resolvedQuestion, {
      mode,
      demoUser: req.demoUser,
      profile: resolvedProfile,
      conversationContext: prepared.modelContext,
      entityCacheKey: prepared.entityCacheKey,
    }), NARRATIVE_TIMEOUT_MS);
    const conversation = completeAskDataConversation(prepared, {
      answerSummary: result.answer,
      resultColumns: result.columns,
    });

    return res.json({
      question: prepared.originalQuestion,
      answer: result.answer,
      sql: showSql ? result.sql : null,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
      conversation,
      ...baseMetadata(req, correlationId),
    });
  } catch (error) {
    return sendError(req, res, error, {
      correlationId,
      question,
      profile: resolvedProfile,
      startTime,
      prepared,
    });
  }
}

router.post('/chat', async (req, res) => handleNarrativeMode(req, res, 'narrate'));
router.post('/chat-mode', async (req, res) => handleNarrativeMode(req, res, 'chat'));

router.post('/showsql', async (req, res) => {
  const { question, profile } = req.body || {};
  const startTime = Date.now();
  const correlationId = getCorrelationId(req);
  const resolvedProfile = normalizeProfile(profile);
  let prepared;
  res.set('X-Correlation-ID', correlationId);

  try {
    prepared = await prepareRequest(req, 'showsql', resolvedProfile);
    const result = await withTimeout(generateQuestionSql(prepared.resolvedQuestion, {
      mode: 'showsql',
      profile: resolvedProfile,
      conversationContext: prepared.modelContext,
      entityCacheKey: prepared.entityCacheKey,
    }), QUERY_TIMEOUT_MS);
    const conversation = completeAskDataConversation(prepared, {
      answerSummary: 'A safe Oracle SQL statement was generated but not executed.',
    });

    return res.json({
      question: prepared.originalQuestion,
      sql: result.sql,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: null,
      conversation,
      ...baseMetadata(req, correlationId),
    });
  } catch (error) {
    return sendError(req, res, error, {
      correlationId,
      question,
      profile: resolvedProfile,
      startTime,
      prepared,
    });
  }
});

router.post('/runsql', async (req, res) => {
  const { question, profile } = req.body || {};
  const startTime = Date.now();
  const correlationId = getCorrelationId(req);
  const resolvedProfile = normalizeProfile(profile);
  let prepared;
  res.set('X-Correlation-ID', correlationId);

  try {
    prepared = await prepareRequest(req, 'runsql', resolvedProfile);
    const result = await withTimeout(runQuestionQuery(prepared.resolvedQuestion, {
      mode: 'runsql',
      demoUser: req.demoUser,
      profile: resolvedProfile,
      conversationContext: prepared.modelContext,
      entityCacheKey: prepared.entityCacheKey,
    }), QUERY_TIMEOUT_MS);
    const conversation = completeAskDataConversation(prepared, {
      answerSummary: `Returned ${result.rowCount} row(s).`,
      resultColumns: result.columns,
    });

    return res.json({
      question: prepared.originalQuestion,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      sql: result.sql,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      repairedFromSql: result.repairedFromSql || null,
      conversation,
      ...baseMetadata(req, correlationId),
    });
  } catch (error) {
    return sendError(req, res, error, {
      correlationId,
      question,
      profile: resolvedProfile,
      startTime,
      prepared,
    });
  }
});

module.exports = router;
