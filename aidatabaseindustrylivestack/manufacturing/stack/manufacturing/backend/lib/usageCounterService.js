const crypto = require('crypto');
const os = require('os');

const DEFAULT_DEMO_ID = 'manufacturing';
const DEFAULT_TIMEOUT_MS = 3000;
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeDemoId(value) {
  const normalized = normalizeText(value || DEFAULT_DEMO_ID)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || DEFAULT_DEMO_ID;
}

function normalizePrefix(value, demoId) {
  return normalizeText(value || `${demoId}-demo-usage/events`)
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function parseTimeoutMs(value) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, 30000);
}

function isTelemetryDisabled(value) {
  return DISABLED_VALUES.has(normalizeText(value).toLowerCase());
}

function getTelemetryConfig(env = process.env) {
  const demoId = normalizeDemoId(env.DEMO_USAGE_COUNTER_DEMO_ID);
  const prefix = normalizePrefix(env.DEMO_USAGE_COUNTER_PREFIX, demoId);
  const parUrl = normalizeText(env.DEMO_USAGE_COUNTER_PAR_URL);
  const enabled = !isTelemetryDisabled(env.DEMO_USAGE_COUNTER_ENABLED) && Boolean(parUrl);

  return {
    enabled,
    parUrl,
    prefix,
    demoId,
    timeoutMs: parseTimeoutMs(env.DEMO_USAGE_COUNTER_TIMEOUT_MS),
  };
}

function encodePathSegments(objectKey) {
  return objectKey
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildPutUrl(parUrl, objectKey) {
  const parsed = new URL(parUrl);
  const basePath = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  return `${parsed.origin}${basePath}${encodePathSegments(objectKey)}${parsed.search || ''}`;
}

function safeFileToken(value) {
  return normalizeText(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildObjectKey({ prefix, demoId, timestamp, jobId }) {
  const datePartition = timestamp.slice(0, 10);
  const timestampToken = timestamp.replace(/[:.]/g, '-');
  const suffix = safeFileToken(jobId) || `evt-${crypto.randomBytes(6).toString('hex')}`;
  return `${prefix}/${datePartition}/${demoId}-${timestampToken}-${suffix}.json`;
}

function sanitizeErrorMessage(err) {
  const raw = normalizeText(err?.message || err || 'unknown error');
  return raw.replace(/https?:\/\/\S+/gi, '[redacted-url]');
}

function safeJsonValue(value) {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

function buildPayload(config, eventContext = {}, timestamp = new Date().toISOString()) {
  return {
    eventType: 'dataset_refresh',
    demoId: config.demoId,
    timestamp,
    jobId: eventContext.jobId || null,
    operation: eventContext.operation || 'refresh',
    datasetSource: eventContext.datasetSource || null,
    activeDataset: safeJsonValue(eventContext.activeDataset),
    summary: safeJsonValue(eventContext.summary),
    runtime: {
      appName: 'manufacturing-operations-demo',
      hostname: os.hostname(),
      nodeEnv: process.env.NODE_ENV || null,
    },
  };
}

async function recordDatasetRefresh(eventContext = {}) {
  const config = getTelemetryConfig();
  if (!config.enabled) {
    return { recorded: false, skipped: true };
  }

  if (typeof fetch !== 'function') {
    console.warn('Usage telemetry skipped: fetch is unavailable in this Node runtime.');
    return { recorded: false, skipped: true };
  }

  const timestamp = new Date().toISOString();
  const objectKey = buildObjectKey({
    prefix: config.prefix,
    demoId: config.demoId,
    timestamp,
    jobId: eventContext.jobId,
  });

  let putUrl;
  try {
    putUrl = buildPutUrl(config.parUrl, objectKey);
  } catch (err) {
    console.warn(`Usage telemetry skipped: invalid Object Storage PAR URL (${sanitizeErrorMessage(err)}).`);
    return { recorded: false, skipped: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const payload = buildPayload(config, eventContext, timestamp);
    const response = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: `${JSON.stringify(payload)}\n`,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Object Storage PUT returned HTTP ${response.status}`);
    }

    return { recorded: true, objectKey };
  } catch (err) {
    console.warn(`Usage telemetry skipped: ${sanitizeErrorMessage(err)}.`);
    return { recorded: false, skipped: true };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  recordDatasetRefresh,
  _private: {
    buildObjectKey,
    buildPayload,
    buildPutUrl,
    getTelemetryConfig,
    sanitizeErrorMessage,
  },
};
