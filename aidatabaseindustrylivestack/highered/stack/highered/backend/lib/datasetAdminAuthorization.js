const crypto = require('node:crypto');
const { sameOriginDemoControl } = require('./demoSession');
const CONFIRMATIONS = Object.freeze({ '/upload': 'REPLACE_DATASET', '/restore-demo': 'RESTORE_DEMO' });
function header(req, name) { return typeof req?.get === 'function' ? String(req.get(name) || '') : String(req?.headers?.[String(name).toLowerCase()] || ''); }
function safeTokenEqual(provided, expected) { const a = Buffer.from(String(provided || ''), 'utf8'); const b = Buffer.from(String(expected || ''), 'utf8'); return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b); }
function destructiveConfirmation(req) { const h = header(req, 'X-HigherEd-Dataset-Confirmation').trim(); const b = typeof req?.body?.confirmation === 'string' ? req.body.confirmation.trim() : ''; return h && b && h !== b ? null : h || b; }
function createRequireDatasetAdmin({ token = () => process.env.DATASET_ADMIN_TOKEN, resolveDatasetAdminActor = null, isSameOriginDemoControl = sameOriginDemoControl } = {}) {
  const resolveAdmin = resolveDatasetAdminActor || ((actor) => require('../config/database').resolveDatasetAdminActor(actor));
  return async function requireDatasetAdmin(req, res, next) {
    const expected = CONFIRMATIONS[String(req?.path || '')];
    if (!expected || destructiveConfirmation(req) !== expected) return res.status(400).json({ ok: false, error: 'Explicit destructive confirmation is required.', code: 'DATASET_CONFIRMATION_REQUIRED' });
    if (Object.prototype.hasOwnProperty.call(req?.headers || {}, 'x-dataset-admin-token')) {
      if (!safeTokenEqual(header(req, 'X-Dataset-Admin-Token'), token())) return res.status(403).json({ ok: false, error: 'Dataset-admin authorization is required.', code: 'DATASET_ADMIN_FORBIDDEN' });
      req.datasetAdminAuthorization = Object.freeze({ method: 'token' }); return next();
    }
    if (!isSameOriginDemoControl(req)) return res.status(403).json({ ok: false, error: 'A same-origin Higher Education demo-control request is required.', code: 'DATASET_ADMIN_DEMO_CONTROL_FORBIDDEN' });
    const actor = typeof req?.authenticatedActor === 'string' ? req.authenticatedActor.trim() : '';
    if (!actor) return res.status(403).json({ ok: false, error: 'Dataset-admin authorization is required.', code: 'DATASET_ADMIN_FORBIDDEN' });
    try {
      const adminActor = await resolveAdmin(actor);
      if (!adminActor || adminActor !== actor) return res.status(403).json({ ok: false, error: 'Dataset-admin authorization is required.', code: 'DATASET_ADMIN_FORBIDDEN' });
      req.datasetAdminAuthorization = Object.freeze({ actor: adminActor, method: 'signed_admin_session' }); return next();
    } catch (_) { return res.status(503).json({ ok: false, error: 'Dataset-admin role validation is unavailable.', code: 'DATASET_ADMIN_IDENTITY_UNAVAILABLE' }); }
  };
}
module.exports = { CONFIRMATIONS, createRequireDatasetAdmin, destructiveConfirmation, safeTokenEqual };
