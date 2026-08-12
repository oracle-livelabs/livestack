/*
 * Serving fence for in-place dataset generation transitions.
 *
 * Oracle generation journaling makes process-loss recovery deterministic, but
 * the mounted routes read shared base tables directly. This fence prevents
 * those routes from observing the interval between destructive apply and
 * atomic generation activation.
 */
const crypto = require('crypto');
const db = require('../config/database');

const NON_TERMINAL_STATUSES = new Set([
  'admitted',
  'snapshotting',
  'staged',
  'applying',
  'ready',
  'recovering',
]);

let activeTransition = null;
let activeGovernedReaders = 0;
const drainWaiters = new Set();

function normalizedPath(value) {
  const path = String(value || '/').split('?')[0] || '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function isDatasetFenceExemptRequest(method, path) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const requestPath = normalizedPath(path);
  if (normalizedMethod === 'OPTIONS') return true;
  if (requestPath === '/health' || requestPath === '/demo-session') return true;
  if (/^\/users\/?$/.test(requestPath)) return true;
  return /^\/import\/status\/[^/]+\/?$/.test(requestPath);
}

function normalizeGeneration(generation) {
  if (!generation) return null;
  return {
    generationId: generation.generationId || generation.GENERATION_ID || null,
    jobId: generation.jobId || generation.JOB_ID || null,
    status: String(generation.status || generation.STATUS || '').toLowerCase(),
  };
}

function planDatasetServingRequest({
  method = 'GET',
  path = '/',
  generation = null,
  localTransition = null,
  lookupFailed = false,
} = {}) {
  if (isDatasetFenceExemptRequest(method, path)) {
    return { allow: true, exempt: true };
  }

  const pending = normalizeGeneration(localTransition) || normalizeGeneration(generation);
  if (pending && NON_TERMINAL_STATUSES.has(pending.status)) {
    return {
      allow: false,
      statusCode: 503,
      code: 'DATASET_GENERATION_TRANSITION',
      retryable: true,
      retryAfterSeconds: 2,
      generation: pending,
    };
  }

  if (lookupFailed) {
    return {
      allow: false,
      statusCode: 503,
      code: 'DATASET_GENERATION_FENCE_UNAVAILABLE',
      retryable: true,
      retryAfterSeconds: 2,
      generation: null,
    };
  }

  return { allow: true, exempt: false };
}

function getDatasetServingTransition() {
  return activeTransition ? { ...activeTransition } : null;
}

function beginDatasetServingTransition(metadata = {}) {
  if (activeTransition) {
    const error = new Error('A destructive dataset generation transition is already active.');
    error.code = 'DATASET_GENERATION_TRANSITION_ACTIVE';
    error.statusCode = 409;
    throw error;
  }
  const transitionToken = metadata.transitionToken || crypto.randomUUID();
  activeTransition = {
    transitionToken,
    generationId: metadata.generationId || null,
    jobId: metadata.jobId || null,
    status: String(metadata.status || 'admitted').toLowerCase(),
    startedAt: new Date().toISOString(),
  };
  return transitionToken;
}

function associateDatasetServingTransition(transitionToken, metadata = {}) {
  if (!activeTransition || activeTransition.transitionToken !== transitionToken) {
    throw new Error('Dataset serving transition ownership was lost.');
  }
  activeTransition = {
    ...activeTransition,
    generationId: metadata.generationId || activeTransition.generationId,
    jobId: metadata.jobId || activeTransition.jobId,
    status: String(metadata.status || activeTransition.status || 'admitted').toLowerCase(),
  };
  return getDatasetServingTransition();
}

function endDatasetServingTransition({ transitionToken } = {}) {
  if (!activeTransition || !transitionToken || activeTransition.transitionToken !== transitionToken) {
    return false;
  }
  activeTransition = null;
  return true;
}

function resolveDrainWaiters() {
  if (activeGovernedReaders !== 0) return;
  for (const waiter of drainWaiters) waiter();
  drainWaiters.clear();
}

function registerGovernedReader(res) {
  activeGovernedReaders += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeGovernedReaders = Math.max(0, activeGovernedReaders - 1);
    resolveDrainWaiters();
  };
  res.once('finish', release);
  res.once('close', release);
}

function waitForDatasetReadersToDrain({ transitionToken } = {}) {
  if (!activeTransition || activeTransition.transitionToken !== transitionToken) {
    return Promise.reject(new Error('Dataset serving transition ownership was lost before reader drain.'));
  }
  if (activeGovernedReaders === 0) return Promise.resolve();
  return new Promise((resolve) => drainWaiters.add(resolve));
}

async function readNonTerminalGeneration() {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(`
      SELECT generation_id, job_id, status
      FROM app_dataset_generations
      WHERE status IN ('admitted','snapshotting','staged','applying','ready','recovering')
      ORDER BY created_at
      FETCH FIRST 1 ROW ONLY
    `, {}, { autoCommit: false });
    return normalizeGeneration(result.rows[0] || null);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

function sendFenceResponse(res, decision) {
  res.setHeader('Retry-After', String(decision.retryAfterSeconds || 2));
  return res.status(decision.statusCode || 503).json({
    ok: false,
    error: decision.code === 'DATASET_GENERATION_FENCE_UNAVAILABLE'
      ? 'Dataset generation stability could not be proved.'
      : 'Dataset generation transition is in progress.',
    code: decision.code,
    retryable: true,
    generation: decision.generation,
  });
}

function createDatasetServingFence({ lookupGeneration = readNonTerminalGeneration } = {}) {
  return async function datasetServingFence(req, res, next) {
    const request = { method: req.method, path: req.path };
    let decision = planDatasetServingRequest({
      ...request,
      localTransition: getDatasetServingTransition(),
    });
    if (decision.exempt) return next();
    if (!decision.allow) return sendFenceResponse(res, decision);

    let generation;
    try {
      generation = await lookupGeneration();
    } catch (error) {
      console.error('Dataset generation serving-fence lookup failed:', error);
      decision = planDatasetServingRequest({ ...request, lookupFailed: true });
      return sendFenceResponse(res, decision);
    }

    // Recheck the process-local transition after the asynchronous Oracle read.
    // If admission began while the lookup was in flight, the request is fenced.
    decision = planDatasetServingRequest({
      ...request,
      generation,
      localTransition: getDatasetServingTransition(),
    });
    if (!decision.allow) return sendFenceResponse(res, decision);

    // Admission raises the local transition before its first await. A worker
    // then waits for all readers registered here before destructive apply.
    registerGovernedReader(res);
    return next();
  };
}

module.exports = {
  NON_TERMINAL_STATUSES,
  isDatasetFenceExemptRequest,
  planDatasetServingRequest,
  getDatasetServingTransition,
  beginDatasetServingTransition,
  associateDatasetServingTransition,
  endDatasetServingTransition,
  waitForDatasetReadersToDrain,
  readNonTerminalGeneration,
  createDatasetServingFence,
  _private: {
    activeGovernedReaders: () => activeGovernedReaders,
  },
};
