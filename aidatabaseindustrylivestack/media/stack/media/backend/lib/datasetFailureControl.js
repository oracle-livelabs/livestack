const { AsyncLocalStorage } = require('async_hooks');

const FAILURE_HEADER = 'x-media-failure-phase';
const SEMANTIC_FAILURE_PHASES = Object.freeze([
  'after_candidate_staging',
  'application_context_vpd_readiness',
  'duality_readiness',
  'vector_readiness',
  'graph_readiness',
  'spatial_readiness',
  'native_json_readiness',
  'audit_readiness',
  'inmemory_readiness',
  'after_demand_model',
  'after_customer_model',
  'after_revenue_model',
  'after_product_model',
  'after_derived_hydration',
  'after_readiness',
]);
const CRASH_FAILURE_PHASES = Object.freeze([
  'before_activation',
  'after_activation_commit',
  'after_completion_event_commit',
  'after_failed_event_commit',
]);
const FAILURE_PHASES = Object.freeze([
  ...SEMANTIC_FAILURE_PHASES,
  ...CRASH_FAILURE_PHASES,
]);
const failureContext = new AsyncLocalStorage();

function readHeader(headers = {}, name) {
  const direct = headers[name];
  if (Array.isArray(direct)) return direct[0] || '';
  if (direct != null) return direct;
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name
  );
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] || '' : value;
}

function normalizeFailurePhase(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveDatasetFailureControl({ headers = {}, allowEnvironment = true } = {}) {
  // The immutable launcher already propagates NODE_ENV. Production always
  // ignores both the private request selector and the legacy test environment
  // selector, so neither can affect a normal LiveStack deployment.
  if (process.env.NODE_ENV !== 'test') return null;

  const headerPhase = normalizeFailurePhase(readHeader(headers, FAILURE_HEADER));
  const environmentPhase = allowEnvironment
    ? normalizeFailurePhase(process.env.MEDIA_FAILURE_INJECTION_PHASE)
    : '';
  const phase = headerPhase || environmentPhase;
  if (!phase) return null;
  if (!FAILURE_PHASES.includes(phase)) {
    const error = new Error(`Unknown semantic failure injection phase "${phase}".`);
    error.code = 'MEDIA_FAILURE_PHASE_UNKNOWN';
    throw error;
  }
  return Object.freeze({
    phase,
    action: CRASH_FAILURE_PHASES.includes(phase) ? 'sigkill' : 'throw',
    source: headerPhase ? 'request' : 'environment',
  });
}

function runWithDatasetFailureControl(control, callback) {
  return failureContext.run(control || null, callback);
}

function getDatasetFailureControl() {
  const scoped = failureContext.getStore();
  if (scoped !== undefined) return scoped;
  return resolveDatasetFailureControl();
}

function isDatasetFailurePhaseSelected(phase, control = getDatasetFailureControl()) {
  return Boolean(control && control.phase === normalizeFailurePhase(phase));
}

function failureActionFor(control, phase) {
  if (!isDatasetFailurePhaseSelected(phase, control)) return 'none';
  return control.action;
}

function killProcessForFailureControl() {
  process.kill(process.pid, 'SIGKILL');
}

module.exports = {
  FAILURE_HEADER,
  FAILURE_PHASES,
  SEMANTIC_FAILURE_PHASES,
  CRASH_FAILURE_PHASES,
  resolveDatasetFailureControl,
  runWithDatasetFailureControl,
  getDatasetFailureControl,
  isDatasetFailurePhaseSelected,
  failureActionFor,
  killProcessForFailureControl,
};
