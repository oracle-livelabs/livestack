const HEADER_NAME = 'x-retail-test-failure-phase';
const ENV_SELECTOR = 'RETAIL_TEST_FAILURE_PHASE';

const FAILURE_PHASES = Object.freeze([
  'POST_ACCEPTANCE',
  'LEASE',
  'DDL',
  'OML_AFTER_INVENTORY',
  'OML_AFTER_TRAINING_COMMIT',
  'OML_BEFORE_MODEL_1_VIEW',
  'OML_AFTER_MODEL_1_VIEW',
  'OML_BEFORE_MODEL_1_CREATE',
  'OML_AFTER_MODEL_1_CREATE',
  'OML_MODEL_1',
  'OML_BEFORE_MODEL_2_VIEW',
  'OML_AFTER_MODEL_2_VIEW',
  'OML_BEFORE_MODEL_2_CREATE',
  'OML_AFTER_MODEL_2_CREATE',
  'OML_MODEL_2',
  'OML_BEFORE_MODEL_3_VIEW',
  'OML_AFTER_MODEL_3_VIEW',
  'OML_BEFORE_MODEL_3_CREATE',
  'OML_AFTER_MODEL_3_CREATE',
  'OML_MODEL_3',
  'OML_BEFORE_MODEL_4_VIEW',
  'OML_AFTER_MODEL_4_VIEW',
  'OML_BEFORE_MODEL_4_CREATE',
  'OML_AFTER_MODEL_4_CREATE',
  'OML_MODEL_4',
  'OML_BEFORE_VALIDATION',
  'OML_AFTER_VALIDATION',
  'VECTOR',
  'NATIVE_JSON',
  'INMEMORY',
  'SPATIAL',
  'VPD',
  'DUALITY',
  'GRAPH',
  'UNIFIED_AUDIT',
  'READINESS',
  'PRE_ACTIVATION',
  'POST_COMMIT_PRE_DELIVERY',
  'POST_FAILED_INTENT',
  'OUTBOX_AFTER_CLAIM',
  'OUTBOX_AFTER_DELIVERY',
]);

const FAILURE_PHASE_SET = new Set(FAILURE_PHASES);
const PROCESS_TERMINATION_PHASES = new Set([
  'POST_ACCEPTANCE',
  'OML_AFTER_INVENTORY',
  'OML_AFTER_TRAINING_COMMIT',
  'OML_BEFORE_MODEL_1_VIEW',
  'OML_AFTER_MODEL_1_VIEW',
  'OML_BEFORE_MODEL_1_CREATE',
  'OML_AFTER_MODEL_1_CREATE',
  'OML_BEFORE_MODEL_2_VIEW',
  'OML_AFTER_MODEL_2_VIEW',
  'OML_BEFORE_MODEL_2_CREATE',
  'OML_AFTER_MODEL_2_CREATE',
  'OML_BEFORE_MODEL_3_VIEW',
  'OML_AFTER_MODEL_3_VIEW',
  'OML_BEFORE_MODEL_3_CREATE',
  'OML_AFTER_MODEL_3_CREATE',
  'OML_BEFORE_MODEL_4_VIEW',
  'OML_AFTER_MODEL_4_VIEW',
  'OML_BEFORE_MODEL_4_CREATE',
  'OML_AFTER_MODEL_4_CREATE',
  'OML_BEFORE_VALIDATION',
  'OML_AFTER_VALIDATION',
  'PRE_ACTIVATION',
  'POST_COMMIT_PRE_DELIVERY',
  'POST_FAILED_INTENT',
  'OUTBOX_AFTER_CLAIM',
  'OUTBOX_AFTER_DELIVERY',
]);

class RetailSyntheticFailure extends Error {
  constructor(phase, context = {}) {
    super(`Forced Retail Restore failure at ${phase}.`);
    this.name = 'RetailSyntheticFailure';
    this.code = 'RETAIL_SYNTHETIC_FAILURE';
    this.statusCode = 503;
    this.phase = phase;
    this.context = context;
  }
}

class RetailFailureSelectorError extends Error {
  constructor(selector) {
    super(`Unknown Retail test failure phase "${selector}".`);
    this.name = 'RetailFailureSelectorError';
    this.code = 'RETAIL_TEST_FAILURE_PHASE_INVALID';
    this.statusCode = 400;
    this.details = { allowedPhases: FAILURE_PHASES };
  }
}

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test';
}

function normalizePhase(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function headerValue(req) {
  if (!req?.headers) return '';
  const value = req.headers[HEADER_NAME]
    ?? req.headers[HEADER_NAME.toUpperCase()]
    ?? '';
  return Array.isArray(value) ? value[0] : value;
}

function requestedSelector(req, env = process.env) {
  return headerValue(req)
    || req?.body?.testFailurePhase
    || req?.query?.testFailurePhase
    || env[ENV_SELECTOR]
    || '';
}

function resolveFailurePhase(req, env = process.env) {
  // Production deliberately ignores both request and environment selectors.
  // The immutable launcher propagates NODE_ENV, while the selected phase is
  // carried by the Admin-authorized Restore request.
  if (!isTestMode(env)) return null;
  const rawSelector = requestedSelector(req, env);
  if (!rawSelector) return null;
  const phase = normalizePhase(rawSelector);
  if (!FAILURE_PHASE_SET.has(phase)) {
    throw new RetailFailureSelectorError(rawSelector);
  }
  return phase;
}

function terminateProcessAtPhase(phase, context = {}, terminator = null) {
  const record = {
    code: 'RETAIL_SYNTHETIC_PROCESS_TERMINATION',
    phase,
    context,
    pid: process.pid,
  };
  process.stderr.write(`${JSON.stringify(record)}\n`);

  if (terminator) {
    terminator(record);
    return;
  }

  // SIGKILL is intentionally uncatchable. The Compose restart policy restarts
  // the same app container so startup reconciliation sees the durable Oracle
  // state on each side of the activation commit.
  process.kill(process.pid, 'SIGKILL');
  process.abort();
}

function failAtPhase(requestedPhase, checkpoint, context = {}, options = {}) {
  const env = options.env || process.env;
  if (!isTestMode(env)) return false;

  const requested = normalizePhase(requestedPhase);
  const current = normalizePhase(checkpoint);
  if (!requested || requested !== current) return false;
  if (!FAILURE_PHASE_SET.has(current)) {
    throw new RetailFailureSelectorError(checkpoint);
  }

  if (PROCESS_TERMINATION_PHASES.has(current)) {
    terminateProcessAtPhase(current, context, options.terminator || null);
    return true;
  }

  throw new RetailSyntheticFailure(current, context);
}

module.exports = {
  ENV_SELECTOR,
  FAILURE_PHASES,
  HEADER_NAME,
  PROCESS_TERMINATION_PHASES,
  RetailFailureSelectorError,
  RetailSyntheticFailure,
  failAtPhase,
  isTestMode,
  normalizePhase,
  resolveFailurePhase,
  terminateProcessAtPhase,
};
