const {
  consumeDatasetEventDeliveryFault,
} = require('./datasetEventDeliveryFault');

const DEFAULT_DEMO_ID = 'media';
const VALID_STATUSES = new Set(['requested', 'completed', 'failed']);
const OCI_HOST = /^objectstorage\.[a-z0-9-]+\.(?:oraclecloud\.com|oraclecloud8\.com|oraclecloud\.eu|oraclecloud\.uk)$/i;
const normalize = (value) => String(value == null ? '' : value).trim();
const safeToken = (value) => normalize(value)
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

function getConfig(env = process.env) {
  const demoId = safeToken(env.DEMO_USAGE_COUNTER_DEMO_ID || DEFAULT_DEMO_ID).toLowerCase() || DEFAULT_DEMO_ID;
  const prefix = normalize(env.DEMO_USAGE_COUNTER_PREFIX || `${demoId}-demo-usage/events`)
    .replace(/^\/+|\/+$/g, '');
  const parUrl = normalize(env.DEMO_USAGE_COUNTER_PAR_URL);
  const timeout = Number.parseInt(env.DEMO_USAGE_COUNTER_TIMEOUT_MS || '3000', 10);
  return {
    demoId,
    prefix,
    parUrl,
    enabled: Boolean(parUrl) && !['0', 'false', 'off', 'no'].includes(
      normalize(env.DEMO_USAGE_COUNTER_ENABLED).toLowerCase()
    ),
    timeoutMs: Number.isFinite(timeout) ? Math.max(1, Math.min(timeout, 30000)) : 3000,
  };
}

function testHosts(env) {
  if (normalize(env.NODE_ENV).toLowerCase() !== 'test') return new Set();
  return new Set(normalize(env.DEMO_USAGE_COUNTER_TEST_CAPTURE_HOSTS)
    .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
}

function validateParUrl(value, env = process.env) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new TypeError('Object destination URL is invalid');
  }
  const isTestHost = testHosts(env).has(parsed.host.toLowerCase());
  const segments = parsed.pathname.split('/').filter(Boolean);
  const hasParShape = segments.length >= 7
    && segments[0] === 'p' && segments[2] === 'n'
    && segments[4] === 'b' && segments[6] === 'o';
  if ((!isTestHost && parsed.protocol !== 'https:')
      || (!isTestHost && !OCI_HOST.test(parsed.hostname))
      || (!isTestHost && parsed.port)
      || parsed.username || parsed.password || parsed.search || parsed.hash
      || !hasParShape) {
    throw new TypeError('Object destination must be an approved OCI endpoint');
  }
  return parsed;
}

function buildPutUrl(parUrl, objectKey, env = process.env) {
  const parsed = validateParUrl(parUrl, env);
  const base = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  const encoded = objectKey.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${parsed.origin}${base}${encoded}`;
}

function buildPayload(config, context, eventTime) {
  const status = normalize(context.status).toLowerCase();
  if (!VALID_STATUSES.has(status)) throw new TypeError('Invalid dataset lifecycle status');
  const operation = normalize(context.operation || 'refresh').toLowerCase();
  const correlationId = safeToken(context.correlationId || context.jobId) || null;
  const payload = {
    schemaVersion: '1.0',
    eventType: operation === 'restore' ? 'dataset_restore' : 'dataset_refresh',
    demoId: config.demoId,
    eventTime,
    operation,
    status,
    correlationId,
    datasetVersion: safeToken(context.datasetVersion) || null,
  };
  const duration = Number(context.durationMs);
  if (Number.isFinite(duration) && duration >= 0) payload.durationMs = Math.round(duration);
  if (status === 'failed') payload.errorCategory = safeToken(context.errorCategory).toLowerCase() || 'unexpected';
  return payload;
}

function deterministicObjectKey(config, payload, context = {}) {
  const generation = safeToken(context.generationId || context.candidateGenerationId)
    || payload.correlationId || 'uncorrelated';
  return `${config.prefix}/${config.demoId}/${generation}/${payload.status}.json`;
}

function safeError(error) {
  return normalize(error?.message || error || 'unknown error').replace(/https?:\/\/\S+/gi, '[redacted-url]');
}

function prepareDatasetEvent(context = {}) {
  const config = getConfig();
  const payload = buildPayload(
    config,
    context,
    context.eventTime || new Date().toISOString()
  );
  const objectKey = deterministicObjectKey(config, payload, context);
  return { config, payload, objectKey };
}

async function deliverPreparedDatasetEvent({ objectKey, payload }) {
  const config = getConfig();
  if (!config.enabled || typeof fetch !== 'function') {
    return {
      recorded: false,
      skipped: true,
      retryable: true,
      failureCategory: 'OCI_OBJECT_STORAGE_DISABLED',
    };
  }
  const putUrl = buildPutUrl(config.parUrl, objectKey);
  const {
    _testDeliveryFault,
    ...publicPayload
  } = payload || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const injectedFault = consumeDatasetEventDeliveryFault({
      fault: _testDeliveryFault,
      objectKey,
    });
    if (injectedFault === 'http-error-once') {
      return {
        recorded: false,
        skipped: true,
        retryable: true,
        failureCategory: 'OCI_OBJECT_STORAGE_HTTP_ERROR',
      };
    }
    if (injectedFault === 'timeout-once') {
      const timeoutError = new Error(
        'Request-scoped test Object Storage timeout'
      );
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }
    const response = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: `${JSON.stringify(publicPayload)}\n`,
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        recorded: false,
        skipped: true,
        retryable: true,
        failureCategory: 'OCI_OBJECT_STORAGE_HTTP_ERROR',
      };
    }
    return { recorded: true };
  } catch (error) {
    console.warn(`Usage event skipped: ${safeError(error)}.`);
    return {
      recorded: false,
      skipped: true,
      retryable: true,
      failureCategory: error?.name === 'AbortError'
        ? 'OCI_OBJECT_STORAGE_TIMEOUT'
        : 'OCI_OBJECT_STORAGE_DELIVERY_ERROR',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function recordDatasetEvent(context = {}) {
  try {
    return deliverPreparedDatasetEvent(prepareDatasetEvent(context));
  } catch (error) {
    console.warn(`Usage event skipped: ${safeError(error)}.`);
    return {
      recorded: false,
      skipped: true,
      retryable: true,
      failureCategory: 'OCI_OBJECT_STORAGE_DELIVERY_ERROR',
    };
  }
}

const recordDatasetRefresh = (context = {}) => recordDatasetEvent({
  ...context,
  status: context.status || 'completed',
});

module.exports = {
  recordDatasetEvent,
  recordDatasetRefresh,
  prepareDatasetEvent,
  deliverPreparedDatasetEvent,
  deterministicObjectKey,
  _private: {
    buildPayload, buildPutUrl, getConfig, validateParUrl, deterministicObjectKey,
  },
};
