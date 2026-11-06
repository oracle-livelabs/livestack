const express = require('express');
const router = express.Router();
const selectAiService = require('../lib/selectAiService');

function isUserQueryError(error) {
  if (error?.isUserQueryError) return true;
  return /Unable to generate|No SQL generated|Only SELECT or WITH|not allowed|unsupported tables|Use .* instead|Oracle equivalents|PostgreSQL syntax|valid Oracle SQL query/i.test(error.message || '');
}

router.get('/profiles', async (_req, res) => {
  try {
    return res.json(await selectAiService.getAvailableProfiles());
  } catch (err) {
    console.error('Select AI profile discovery failed:', err.message);
    return res.status(503).json({
      profiles: [],
      activeProfile: null,
      runtime: { available: false, runtime: 'unavailable', reason: 'profile_discovery_failed' },
      error: err.message,
    });
  }
});

async function handleQuestion(req, res, mode, timeoutMs) {
  const { question, showSql = true } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  let timeout;
  try {
    const result = await Promise.race([
      selectAiService.runSelectAiQuestion(q, { mode, showSql, maxRows: mode === 'showsql' ? 1 : 200 }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);

    const response = {
      question: q,
      elapsed: Date.now() - startTime,
      profile: result.profile,
      model: result.model,
      runtime: result.runtime,
      runtimeLabel: result.runtimeLabel,
      provider: result.provider,
      sql: result.sql,
    };
    if (mode === 'runsql') {
      Object.assign(response, { columns: result.columns, rows: result.rows, rowCount: result.rowCount });
    } else if (mode !== 'showsql') {
      response.answer = result.answer;
    }
    return res.json(response);
  } catch (err) {
    console.error(`Select AI ${mode} error:`, err.message);
    return res.status(err.statusCode || (isUserQueryError(err) ? 400 : 500)).json({
      question: q,
      error: err.message === 'timeout'
        ? 'The request took too long. Try a narrower question.'
        : err.message,
      elapsed: Date.now() - startTime,
      profile: err.profile || null,
      model: err.model || null,
      runtime: err.runtime || 'select_ai',
      sql: err.sql || null,
      oracleError: err.oracleError || null,
    });
  } finally {
    clearTimeout(timeout);
  }
}

router.post('/chat', (req, res) => handleQuestion(req, res, 'narrate', 180000));
router.post('/chat-mode', (req, res) => handleQuestion(req, res, 'chat', 180000));
router.post('/showsql', (req, res) => handleQuestion(req, res, 'showsql', 150000));
router.post('/runsql', (req, res) => handleQuestion(req, res, 'runsql', 150000));

module.exports = router;
