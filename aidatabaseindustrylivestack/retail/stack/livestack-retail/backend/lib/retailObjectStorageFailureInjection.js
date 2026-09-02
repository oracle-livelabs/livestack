'use strict';

const HEADER_NAME = 'x-retail-test-object-storage-failure';
const FAILURE_SELECTORS = Object.freeze([
  'HTTP_FAILURE_ONCE',
  'TIMEOUT_ONCE',
]);
const FAILURE_SELECTOR_SET = new Set(FAILURE_SELECTORS);
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 10000;

class RetailObjectStorageFailureSelectorError extends Error {
  constructor(selector) {
    super(`Unknown Retail test Object Storage failure selector "${selector}".`);
    this.name = 'RetailObjectStorageFailureSelectorError';
    this.code = 'RETAIL_TEST_OBJECT_STORAGE_FAILURE_INVALID';
    this.statusCode = 400;
    this.details = { allowedSelectors: FAILURE_SELECTORS };
  }
}

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test';
}

function normalizeSelector(value) {
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

function resolveObjectStorageFailure(req, env = process.env) {
  // Production deliberately ignores every request and environment selector.
  if (!isTestMode(env)) return null;
  const rawSelector = headerValue(req)
    || req?.body?.testObjectStorageFailure
    || req?.query?.testObjectStorageFailure
    || env.RETAIL_TEST_OBJECT_STORAGE_FAILURE
    || '';
  if (!rawSelector) return null;
  const selector = normalizeSelector(rawSelector);
  if (!FAILURE_SELECTOR_SET.has(selector)) {
    throw new RetailObjectStorageFailureSelectorError(rawSelector);
  }
  return selector;
}

function configuredTimeoutMs(env = process.env) {
  const parsed = Number.parseInt(env.DEMO_USAGE_COUNTER_TIMEOUT_MS || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, parsed);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function injectObjectStorageFailure(
  eventContext = {},
  {
    env = process.env,
    delay = sleep,
  } = {}
) {
  if (!isTestMode(env)) return null;
  const selector = normalizeSelector(eventContext.objectStorageFailure);
  if (!selector) return null;
  if (!FAILURE_SELECTOR_SET.has(selector)) {
    throw new RetailObjectStorageFailureSelectorError(selector);
  }

  // The selector belongs to one Restore request. Only the first delivery
  // attempt for its requested intent is failed; terminal intents and durable
  // retries still exercise the real configured Object Storage endpoint.
  const deliveryAttempt = Number(eventContext.deliveryAttempt || 0);
  const eventStatus = String(eventContext.status || '').trim().toLowerCase();
  if (eventStatus !== 'requested' || deliveryAttempt !== 1) return null;

  if (selector === 'HTTP_FAILURE_ONCE') {
    return {
      ok: false,
      skipped: true,
      reason: 'Object Storage PUT failed with HTTP 503 (test-only one-shot).',
    };
  }

  await delay(configuredTimeoutMs(env));
  const timeoutError = new Error(
    'Object Storage PUT timed out (test-only one-shot).'
  );
  timeoutError.name = 'AbortError';
  throw timeoutError;
}

module.exports = {
  FAILURE_SELECTORS,
  HEADER_NAME,
  RetailObjectStorageFailureSelectorError,
  injectObjectStorageFailure,
  resolveObjectStorageFailure,
  _private: {
    configuredTimeoutMs,
    headerValue,
    isTestMode,
    normalizeSelector,
  },
};
