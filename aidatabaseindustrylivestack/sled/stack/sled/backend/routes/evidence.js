const express = require('express');
const { getActiveGenerationFeatureEvidence } = require('../lib/sledFeatureEvidence');
const router = express.Router();

// Read-only Oracle feature truth. Evidence is tied to the active Colorado
// dataset generation, never a static marketing capability list.
router.get('/features', async (req, res) => {
  try { return res.json({ ok: true, ...(await getActiveGenerationFeatureEvidence({ actor: req.authenticatedActor })) }); }
  catch (error) { return res.status(503).json({ ok: false, error: 'Generation-bound Oracle feature evidence is unavailable.', code: 'SLED_FEATURE_EVIDENCE_UNAVAILABLE' }); }
});
module.exports = router;
