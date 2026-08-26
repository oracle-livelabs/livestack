const express = require('express');
const db = require('../config/database');
const { clearCookie, setCookie } = require('../lib/demoSession');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ ok: true, identity: req.demoIdentity || null });
});

router.post('/', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(username)) {
    return res.status(400).json({ ok: false, error: 'A valid demo username is required.' });
  }
  try {
    const identity = await db.resolveDemoIdentity(username);
    setCookie(res, identity);
    return res.json({ ok: true, identity });
  } catch (error) {
    return res.status(403).json({ ok: false, error: 'The requested demo identity is unavailable.' });
  }
});

router.delete('/', (req, res) => {
  clearCookie(res);
  res.status(204).end();
});

module.exports = router;
