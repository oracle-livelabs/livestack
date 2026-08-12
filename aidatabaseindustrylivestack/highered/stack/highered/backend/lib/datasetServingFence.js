const crypto = require('node:crypto');
const NON_TERMINAL = new Set(['admitted', 'applying']);
let transition = null;
function normalizedPath(value) { const path = String(value || '/').split('?')[0] || '/'; return path.startsWith('/') ? path : `/${path}`; }
function isDatasetFenceExemptRequest(method, path) { const target = normalizedPath(path); return String(method).toUpperCase() === 'OPTIONS' || target === '/health' || target === '/demo-session' || /^\/users\/?$/.test(target) || /^\/import\/status\/[^/]+\/?$/.test(target); }
function planDatasetServingRequest({ method = 'GET', path = '/', generation = null, localTransition = transition, lookupFailed = false } = {}) {
  if (isDatasetFenceExemptRequest(method, path)) return { allow: true, exempt: true };
  const pending = localTransition || generation;
  if (pending && NON_TERMINAL.has(String(pending.status || '').toLowerCase())) return { allow: false, statusCode: 503, code: 'DATASET_GENERATION_TRANSITION', retryAfterSeconds: 2, generation: pending };
  return lookupFailed ? { allow: false, statusCode: 503, code: 'DATASET_GENERATION_FENCE_UNAVAILABLE', retryAfterSeconds: 2 } : { allow: true, exempt: false };
}
function beginDatasetServingTransition(metadata = {}) { if (transition) { const error = new Error('A dataset generation transition is already active.'); error.statusCode = 409; throw error; } transition = { transitionToken: crypto.randomUUID(), ...metadata, status: String(metadata.status || 'admitted').toLowerCase() }; return transition.transitionToken; }
function associateDatasetServingTransition(token, patch = {}) { if (!transition || transition.transitionToken !== token) throw new Error('Dataset serving transition ownership was lost.'); transition = { ...transition, ...patch, status: String(patch.status || transition.status).toLowerCase() }; return { ...transition }; }
function endDatasetServingTransition({ transitionToken } = {}) { if (!transition || transition.transitionToken !== transitionToken) return false; transition = null; return true; }
function createDatasetServingFence({ lookupGeneration = null } = {}) { const lookup = lookupGeneration || (() => require('./datasetGenerationStore').readNonTerminalGeneration()); return async (req, res, next) => { let decision = planDatasetServingRequest({ method: req.method, path: req.path }); if (decision.exempt) return next(); if (decision.allow) { try { decision = planDatasetServingRequest({ method: req.method, path: req.path, generation: await lookup() }); } catch (_) { decision = planDatasetServingRequest({ method: req.method, path: req.path, lookupFailed: true }); } } if (decision.allow) return next(); res.setHeader('Retry-After', String(decision.retryAfterSeconds || 2)); return res.status(decision.statusCode).json({ ok: false, error: 'Dataset generation transition is in progress.', code: decision.code, retryable: true, generation: decision.generation || null }); }; }
module.exports = { isDatasetFenceExemptRequest, planDatasetServingRequest, beginDatasetServingTransition, associateDatasetServingTransition, endDatasetServingTransition, createDatasetServingFence };
