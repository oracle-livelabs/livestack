const express = require('express');
const router = express.Router();
const {
  DEFAULT_PROFILE,
  answerQuestion,
  getAvailableSelectAiProfiles,
  getProfileModel,
  normalizeProfile,
  runQuestionQuery,
} = require('../lib/ollamaAssistant');
const selectAiService = require('../lib/selectAiService');

function isUserQueryError(error) {
  if (error?.isUserQueryError) return true;
  return /Unable to generate|No SQL generated|Only SELECT or WITH|not allowed|unsupported tables|Use .* instead|Oracle equivalents|PostgreSQL syntax|valid Oracle SQL query/i.test(
    error.message || ''
  );
}

router.get('/profiles', async (_req, res) => {
  try {
    const result = await selectAiService.getAvailableProfiles();
    return res.json(result);
  } catch (err) {
    console.warn('Select AI profile discovery failed, using Ollama fallback:', err.message);
    return res.json({
      profiles: getAvailableSelectAiProfiles(),
      activeProfile: DEFAULT_PROFILE,
      runtime: {
        available: false,
        connected: false,
        runtime: 'ollama',
        reason: 'profile_discovery_failed',
        error: err.message,
      },
    });
  }
});

async function handleNarrativeMode(req, res, mode) {
  const { question, showSql = true, profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);

  try {
    const selectAiResult = await Promise.race([
      selectAiService.runSelectAiQuestion(q, { mode, showSql }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 180000)),
    ]);

    if (selectAiResult) {
      return res.json({
        question: q,
        answer: selectAiResult.answer,
        sql: showSql ? selectAiResult.sql : null,
        elapsed: Date.now() - startTime,
        profile: selectAiResult.profile,
        model: selectAiResult.model,
        runtime: selectAiResult.runtime,
        runtimeLabel: selectAiResult.runtimeLabel,
        provider: selectAiResult.provider,
      });
    }

    const result = await Promise.race([
      answerQuestion(q, { mode, demoUser: req.demoUser, profile: resolvedProfile }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 180000)),
    ]);

    return res.json({
      question: q,
      answer: result.answer,
      sql: showSql ? result.sql : null,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      runtime: result.runtime || 'ollama',
      runtimeLabel: result.runtimeLabel || 'Ollama + Oracle SQL',
      provider: result.provider || 'Ollama',
      repairedFromSql: result.repairedFromSql || null,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`Select AI ${mode} error:`, err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json({
      question: q,
      error: err.message === 'timeout'
        ? 'The request took too long. Try a narrower question.'
        : err.message,
      elapsed,
      profile: err.profile || resolvedProfile,
      model: err.model || getProfileModel(resolvedProfile),
      runtime: err.runtime || 'unknown',
      sql: err.sql || null,
      oracleError: err.oracleError || null,
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
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);

  try {
    const selectAiResult = await Promise.race([
      selectAiService.runSelectAiQuestion(q, { mode: 'showsql', maxRows: 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);

    if (selectAiResult) {
      return res.json({
        question: q,
        sql: selectAiResult.sql,
        elapsed: Date.now() - startTime,
        profile: selectAiResult.profile,
        model: selectAiResult.model,
        runtime: selectAiResult.runtime,
        runtimeLabel: selectAiResult.runtimeLabel,
        provider: selectAiResult.provider,
      });
    }

    const result = await Promise.race([
      runQuestionQuery(q, { mode: 'showsql', demoUser: req.demoUser, profile: resolvedProfile, maxRows: 1 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);

    return res.json({
      question: q,
      sql: result.sql,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      runtime: result.runtime || 'ollama',
      runtimeLabel: result.runtimeLabel || 'Ollama + Oracle SQL',
      provider: result.provider || 'Ollama',
      repairedFromSql: result.repairedFromSql || null,
    });
  } catch (err) {
    console.error('Select AI showsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json({
      question: q,
      error: err.message === 'timeout'
        ? 'The request took too long. Try a narrower question.'
        : err.message,
      elapsed: Date.now() - startTime,
      profile: err.profile || resolvedProfile,
      model: err.model || getProfileModel(resolvedProfile),
      runtime: err.runtime || 'unknown',
      sql: err.sql || null,
      oracleError: err.oracleError || null,
    });
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
    const selectAiResult = await Promise.race([
      selectAiService.runSelectAiQuestion(q, { mode: 'runsql' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);

    if (selectAiResult) {
      return res.json({
        question: q,
        columns: selectAiResult.columns,
        rows: selectAiResult.rows,
        rowCount: selectAiResult.rowCount,
        sql: selectAiResult.sql,
        elapsed: Date.now() - startTime,
        profile: selectAiResult.profile,
        model: selectAiResult.model,
        runtime: selectAiResult.runtime,
        runtimeLabel: selectAiResult.runtimeLabel,
        provider: selectAiResult.provider,
      });
    }

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
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
      model: result.model || getProfileModel(resolvedProfile),
      runtime: result.runtime || 'ollama',
      runtimeLabel: result.runtimeLabel || 'Ollama + Oracle SQL',
      provider: result.provider || 'Ollama',
      repairedFromSql: result.repairedFromSql || null,
    });
  } catch (err) {
    console.error('Select AI runsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json({
      question: q,
      error: err.message === 'timeout'
        ? 'The request took too long. Try a narrower question.'
        : err.message,
      elapsed: Date.now() - startTime,
      profile: err.profile || resolvedProfile,
      model: err.model || getProfileModel(resolvedProfile),
      runtime: err.runtime || 'unknown',
      sql: err.sql || null,
      oracleError: err.oracleError || null,
    });
  }
});

module.exports = router;
