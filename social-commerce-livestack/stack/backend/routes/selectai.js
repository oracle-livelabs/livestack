const express = require('express');
const router = express.Router();
const {
  answerQuestion,
  executeReadOnlySql,
  generateReadOnlySql,
  normalizeProfile,
} = require('../lib/ollamaAssistant');

function isUserQueryError(error) {
  return /Unable to generate|No SQL generated|Only SELECT or WITH|not allowed|unsupported tables|Use .* instead|Oracle equivalents|PostgreSQL syntax/i.test(
    error.message || ''
  );
}

async function handleNarrativeMode(req, res, mode) {
  const { question, showSql = true, profile } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'A question is required' });
  }

  const q = question.trim();
  const startTime = Date.now();
  const resolvedProfile = normalizeProfile(profile);

  try {
    const result = await Promise.race([
      answerQuestion(q, { mode, demoUser: req.demoUser }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 180000)),
    ]);

    return res.json({
      question: q,
      answer: result.answer,
      sql: showSql ? result.sql : null,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
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
      profile: resolvedProfile,
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
    const sql = await Promise.race([
      generateReadOnlySql(q, { mode: 'showsql' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);

    return res.json({
      question: q,
      sql,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
    });
  } catch (err) {
    console.error('Select AI showsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json({
      question: q,
      error: err.message === 'timeout'
        ? 'The request took too long. Try a narrower question.'
        : err.message,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
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
    const sql = await Promise.race([
      generateReadOnlySql(q, { mode: 'runsql' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 150000)),
    ]);
    const result = await executeReadOnlySql(sql, { demoUser: req.demoUser });

    return res.json({
      question: q,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      sql,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
    });
  } catch (err) {
    console.error('Select AI runsql error:', err.message);
    return res.status(isUserQueryError(err) ? 400 : 500).json({
      question: q,
      error: err.message === 'timeout'
        ? 'The request took too long. Try a narrower question.'
        : err.message,
      elapsed: Date.now() - startTime,
      profile: resolvedProfile,
    });
  }
});

module.exports = router;
