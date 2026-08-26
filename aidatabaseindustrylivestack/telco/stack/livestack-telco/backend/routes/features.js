const express = require('express');
const { collectFeatureEvidence } = require('../lib/datasetFeatureEvidence');
const router = express.Router();
router.get('/evidence', async (_req, res) => { try { res.json({ ok: true, evidence: await collectFeatureEvidence() }); } catch (error) { res.status(503).json({ ok: false, error: 'Telco feature evidence is unavailable.' }); } });
module.exports = router;
