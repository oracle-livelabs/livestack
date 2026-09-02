const crypto = require('crypto');
const {
  injectObjectStorageFailure,
} = require('./retailObjectStorageFailureInjection');

const DEFAULT_PREFIX = 'retail-demo-usage/events';
const DEFAULT_TIMEOUT_MS = 3000;

function isEnabled() {
  const value = String(process.env.DEMO_USAGE_COUNTER_ENABLED || '').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(value);
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function normalizeParUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return url.endsWith('/') ? url : `${url}/`;
}

function isOciObjectStorageParUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && /^objectstorage\.[a-z0-9-]+\.oraclecloud\.com$/i.test(url.host)
      && /^\/p\/[^/]+\/n\/[^/]+\/b\/[^/]+\/o(?:\/|$)/.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function encodeObjectName(objectName) {
  return String(objectName)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function timeoutMs() {
  const configured = Number.parseInt(process.env.DEMO_USAGE_COUNTER_TIMEOUT_MS || '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function buildObjectName(timestamp, eventId = null) {
  const prefix = trimSlashes(process.env.DEMO_USAGE_COUNTER_PREFIX || DEFAULT_PREFIX);
  const day = timestamp.slice(0, 10);
  const safeTime = timestamp.replace(/[:.]/g, '-');
  const id = String(eventId || crypto.randomUUID()).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 180);
  const fileName = `${safeTime}-${id}.json`;
  return [prefix, day, fileName].filter(Boolean).join('/');
}

function buildEventPayload({ jobId, operation, datasetSource, status, datasetVersion, errorCategory, timestamp }) {
  const eventTimestamp = timestamp || new Date().toISOString();
  return {
    demo: process.env.DEMO_USAGE_COUNTER_DEMO_ID || 'retail',
    event: 'dataset_restore',
    timestamp: eventTimestamp,
    jobId: jobId || null,
    operation: operation === 'restore_demo' ? 'restore' : (operation || null),
    status: status || null,
    datasetSource: datasetSource || null,
    datasetVersion: datasetVersion || null,
    ...(status === 'failed' && {
      errorCategory: String(errorCategory || 'RESTORE_FAILED')
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .slice(0, 64),
    }),
  };
}

async function putJsonObject(parUrl, objectName, payload) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(`${parUrl}${encodeObjectName(objectName)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: `${JSON.stringify(payload, null, 2)}\n`,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Object Storage PUT failed with HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
    }

    return {
      ok: true,
      objectName,
      status: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function recordDatasetEvent(eventContext) {
  if (!isEnabled()) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const parUrl = normalizeParUrl(process.env.DEMO_USAGE_COUNTER_PAR_URL);
  if (!parUrl) {
    return { ok: true, skipped: true, reason: 'missing_par_url' };
  }
  if (!isOciObjectStorageParUrl(parUrl)) {
    return { ok: false, skipped: true, reason: 'invalid_oci_object_storage_par_url' };
  }

  const payload = buildEventPayload(eventContext);
  const objectName = eventContext.objectName || buildObjectName(payload.timestamp, eventContext.eventId);

  try {
    const injectedFailure = await injectObjectStorageFailure(eventContext);
    if (injectedFailure) {
      return {
        ...injectedFailure,
        objectName,
      };
    }
    const result = await putJsonObject(parUrl, objectName, payload);
    console.log(`Usage telemetry event written to Object Storage: ${result.objectName}`);
    return result;
  } catch (err) {
    console.warn(`Usage telemetry event was skipped: ${err.message}`);
    return {
      ok: false,
      skipped: true,
      reason: err.message,
      objectName,
    };
  }
}

module.exports = {
  recordDatasetEvent,
  recordDatasetRefresh: recordDatasetEvent,
  _private: {
    buildEventPayload,
    buildObjectName,
    encodeObjectName,
    normalizeParUrl,
    isOciObjectStorageParUrl,
  },
};
