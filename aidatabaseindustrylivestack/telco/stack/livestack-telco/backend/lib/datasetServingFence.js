const { readPendingGeneration } = require('./datasetGenerationStore');
function exempt(req) { return req.method === 'OPTIONS' || req.path === '/health' || req.path === '/session' || /^\/import\/status\//.test(req.path); }
function createDatasetServingFence() { return async (req, res, next) => { if (exempt(req)) return next(); try { const pending = await readPendingGeneration(); if (pending) return res.status(503).set('Retry-After', '2').json({ ok: false, code: 'DATASET_GENERATION_TRANSITION', retryable: true, generation: pending }); return next(); } catch (_) { return res.status(503).set('Retry-After', '2').json({ ok: false, code: 'DATASET_GENERATION_FENCE_UNAVAILABLE', retryable: true }); } }; }
module.exports = { createDatasetServingFence };
