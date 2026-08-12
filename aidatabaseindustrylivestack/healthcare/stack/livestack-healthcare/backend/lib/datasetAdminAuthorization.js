const crypto = require('node:crypto');
const { sameOriginDemoControl } = require('./demoSession');

const CONFIRMATIONS = Object.freeze({
  '/upload': 'REPLACE_DATASET',
  '/restore-demo': 'RESTORE_DEMO',
});

function header(req, name) {
  if (typeof req?.get === 'function') return String(req.get(name) || '');
  return String(req?.headers?.[String(name).toLowerCase()] || '');
}

function safeTokenEqual(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  return providedBuffer.length > 0
    && providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function destructiveConfirmation(req) {
  const headerValue = header(req, 'X-Healthcare-Dataset-Confirmation').trim();
  const bodyValue = typeof req?.body?.confirmation === 'string'
    ? req.body.confirmation.trim()
    : '';
  if (headerValue && bodyValue && headerValue !== bodyValue) return null;
  return headerValue || bodyValue;
}

function expectedConfirmation(req) {
  return CONFIRMATIONS[String(req?.path || '')] || null;
}

function createRequireDatasetAdmin({
  token = () => process.env.DATASET_ADMIN_TOKEN,
  resolveDatasetAdminActor = null,
  isSameOriginDemoControl = sameOriginDemoControl,
} = {}) {
  const resolveAdmin = resolveDatasetAdminActor || (async (actor) => {
    const db = require('../config/database');
    return db.resolveDatasetAdminActor(actor);
  });

  return async function requireDatasetAdmin(req, res, next) {
    const expectedAction = expectedConfirmation(req);
    const confirmedAction = destructiveConfirmation(req);
    if (!expectedAction || confirmedAction !== expectedAction) {
      return res.status(400).json({
        ok: false,
        error: 'Explicit destructive confirmation is required.',
        code: 'DATASET_CONFIRMATION_REQUIRED',
      });
    }

    const tokenHeaderPresent = Object.prototype.hasOwnProperty.call(
      req?.headers || {},
      'x-dataset-admin-token',
    );
    if (tokenHeaderPresent) {
      const configuredToken = String(token() || '');
      const providedToken = header(req, 'X-Dataset-Admin-Token');
      if (!configuredToken || !safeTokenEqual(providedToken, configuredToken)) {
        return res.status(403).json({
          ok: false,
          error: 'Dataset-admin authorization is required.',
          code: 'DATASET_ADMIN_FORBIDDEN',
        });
      }
      req.datasetAdminAuthorization = Object.freeze({ method: 'token' });
      return next();
    }

    if (!isSameOriginDemoControl(req)) {
      return res.status(403).json({
        ok: false,
        error: 'A same-origin Healthcare demo-control request is required.',
        code: 'DATASET_ADMIN_DEMO_CONTROL_FORBIDDEN',
      });
    }

    const actor = typeof req?.authenticatedActor === 'string'
      ? req.authenticatedActor.trim()
      : '';
    if (!actor) {
      return res.status(403).json({
        ok: false,
        error: 'Dataset-admin authorization is required.',
        code: 'DATASET_ADMIN_FORBIDDEN',
      });
    }

    try {
      const adminActor = await resolveAdmin(actor);
      if (!adminActor || adminActor !== actor) {
        return res.status(403).json({
          ok: false,
          error: 'Dataset-admin authorization is required.',
          code: 'DATASET_ADMIN_FORBIDDEN',
        });
      }
      req.datasetAdminAuthorization = Object.freeze({
        actor: adminActor,
        method: 'signed_admin_session',
      });
      return next();
    } catch (error) {
      console.error('Dataset-admin role validation unavailable.');
      return res.status(503).json({
        ok: false,
        error: 'Dataset-admin role validation is unavailable.',
        code: 'DATASET_ADMIN_IDENTITY_UNAVAILABLE',
      });
    }
  };
}

module.exports = {
  CONFIRMATIONS,
  createRequireDatasetAdmin,
  destructiveConfirmation,
  safeTokenEqual,
};
