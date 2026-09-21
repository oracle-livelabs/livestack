'use strict';

/*
 * Server-owned, test-only feature unavailability boundary.
 *
 * Playwright may select one enumerated failure by adding the request header,
 * but the deployed Express process owns the HTTP response. Production ignores
 * the selector completely. This gives the browser suite a real
 * backend -> HTTP -> apiFetch -> React error path without browser-authored
 * responses or a client-authored response body.
 */

const SELECTOR_HEADER = 'X-Retail-Test-Feature-Failure';
const SELECTOR_HEADER_KEY = SELECTOR_HEADER.toLowerCase();
const ORIGIN_HEADER = 'X-Retail-Test-Failure-Origin';
const ORIGIN = 'SERVER_OWNED_TEST_ONLY';
const STALE_SELECTOR_HEADER = 'X-Retail-Test-Stale-Response';
const STALE_SELECTOR_HEADER_KEY = STALE_SELECTOR_HEADER.toLowerCase();
const STALE_NONCE_HEADER = 'X-Retail-Test-Stale-Nonce';
const STALE_NONCE_HEADER_KEY = STALE_NONCE_HEADER.toLowerCase();
const STALE_ORIGIN_HEADER = 'X-Retail-Test-Stale-Origin';
const STALE_STATE_HEADER = 'X-Retail-Test-Stale-State';
const STALE_DELAY_MS = 1500;
const OML_MOUNTED_ENDPOINTS = Object.freeze([
  '/ml/demand-forecast',
  '/ml/customer-segments',
  '/ml/revenue-forecast',
  '/ml/scoring-evidence',
  '/ml/summary',
  '/ml/vector-clusters',
  '/ml/inventory-intelligence',
]);

const FEATURE_FAILURES = Object.freeze({
  DATABASE_IN_MEMORY: Object.freeze({
    method: 'GET',
    path: /^\/dashboard\/inmemory\/?$/,
    feature: 'DATABASE_IN_MEMORY',
    error: 'Database In-Memory is unavailable',
  }),
  NATIVE_JSON: Object.freeze({
    method: 'GET',
    path: /^\/dashboard\/native-json\/?$/,
    feature: 'NATIVE_JSON',
    error: 'Native JSON operator evidence is unavailable',
  }),
  PRODUCT_DUALITY: Object.freeze({
    method: 'GET',
    path: /^\/products\/[1-9][0-9]*\/duality\/?$/,
    feature: 'JSON_RELATIONAL_DUALITY',
    error: 'JSON Relational Duality is unavailable',
  }),
  AI_VECTOR_SEARCH: Object.freeze({
    method: 'GET',
    path: /^\/social\/vector-readiness\/?$/,
    feature: 'AI_VECTOR_SEARCH',
    error: 'Native Oracle AI Vector Search is unavailable',
  }),
  SQL_PROPERTY_GRAPH: Object.freeze({
    method: 'GET',
    path: /^\/graph\/network\/[1-9][0-9]*\/?$/,
    feature: 'SQL_PROPERTY_GRAPH',
    error: 'Oracle Property Graph SQL/PGQ is unavailable',
  }),
  ORACLE_SPATIAL: Object.freeze({
    method: 'GET',
    path: /^\/fulfillment\/spatial-readiness\/?$/,
    feature: 'ORACLE_SPATIAL',
    error: 'Spatial execution proof is unavailable.',
  }),
  ORDER_DUALITY: Object.freeze({
    method: 'GET',
    path: /^\/orders\/[1-9][0-9]*\/duality\/?$/,
    feature: 'JSON_RELATIONAL_DUALITY',
    error: 'JSON Relational Duality is unavailable',
  }),
  RETURNS_INTELLIGENCE: Object.freeze({
    method: 'GET',
    path: /^\/returns\/summary\/?$/,
    feature: 'RETURNS_INTELLIGENCE',
    error: 'Oracle Returns Intelligence is unavailable',
  }),
  UNIFIED_AUDIT: Object.freeze({
    method: 'GET',
    path: /^\/returns\/audit-readiness\/?$/,
    feature: 'UNIFIED_AUDIT',
    error: 'Unified Audit execution evidence is unavailable',
  }),
  ORACLE_MACHINE_LEARNING: Object.freeze({
    method: 'GET',
    path: /^\/ml\/(?:demand-forecast|customer-segments|revenue-forecast|scoring-evidence|summary|vector-clusters|inventory-intelligence)\/?$/,
    feature: 'ORACLE_MACHINE_LEARNING',
    error: 'Oracle Machine Learning unavailable',
  }),
});

const STALE_RESPONSES = Object.freeze({
  WELCOME: Object.freeze({
    method: 'GET',
    path: /^\/import\/dataset\/?$/,
    payloadPath: 'activeDataset.label',
    sentinel: 'RETAIL_STALE_WELCOME_DATASET',
  }),
  DATAMODEL: Object.freeze({
    method: 'GET',
    path: /^\/demo\/status\/?$/,
    payloadPath: 'products',
    sentinel: 987654321,
  }),
  DASHBOARD: Object.freeze({
    method: 'GET',
    path: /^\/dashboard\/summary\/?$/,
    payloadPath: 'ORDERS_TOTAL',
    sentinel: 987654322,
  }),
  SOCIAL: Object.freeze({
    method: 'GET',
    path: /^\/social\/posts\/?$/,
    payloadPath: 'posts.0.POST_TEXT',
    sentinel: 'RETAIL_STALE_SOCIAL_POST',
  }),
  GRAPH: Object.freeze({
    method: 'GET',
    path: /^\/graph\/influencers\/?$/,
    payloadPath: '0.DISPLAY_NAME',
    sentinel: 'RETAIL_STALE_GRAPH_CREATOR',
  }),
  FULFILLMENT: Object.freeze({
    method: 'GET',
    path: /^\/fulfillment\/centers\/?$/,
    payloadPath: '0.CENTER_NAME',
    sentinel: 'RETAIL_STALE_FULFILLMENT_CENTER',
  }),
  ORDERS: Object.freeze({
    method: 'GET',
    path: /^\/orders\/?$/,
    payloadPath: '0.CUSTOMER_NAME',
    sentinel: 'RETAIL_STALE_ORDER_CUSTOMER',
  }),
  RETURNS: Object.freeze({
    method: 'GET',
    path: /^\/returns\/summary\/?$/,
    payloadPath: 'summary.TOTAL_RETURNS',
    sentinel: 987654323,
  }),
  OML: Object.freeze({
    method: 'GET',
    path: /^\/ml\/summary\/?$/,
    payloadPath: 'model_provenance.0.physicalName',
    sentinel: 'RETAIL_STALE_OML_MODEL',
  }),
  OML_SCORING: Object.freeze({
    method: 'GET',
    path: /^\/ml\/scoring-evidence\/?$/,
    payloadPath: 'models.0.physicalName',
    sentinel: 'RETAIL_STALE_OML_SCORING_MODEL',
  }),
  ASKDATA: Object.freeze({
    method: 'GET',
    path: /^\/selectai\/profiles\/?$/,
    payloadPath: 'profiles.0.model',
    sentinel: 'RETAIL_STALE_ASK_PROFILE',
  }),
});

const staleClaims = new Map();

function isTestMode(env = process.env) {
  return env.NODE_ENV === 'test';
}

function normalizeSelector(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function requestedSelector(req) {
  const value = req?.headers?.[SELECTOR_HEADER_KEY] || '';
  return normalizeSelector(Array.isArray(value) ? value[0] : value);
}

function headerValue(req, key) {
  const value = req?.headers?.[key] || '';
  return String(Array.isArray(value) ? value[0] : value).trim();
}

function replacePayloadValue(payload, dottedPath, replacement) {
  const parts = dottedPath.split('.');
  let cursor = payload;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (['__proto__', 'prototype', 'constructor'].includes(key)
        || cursor === null || typeof cursor !== 'object'
        || !Object.prototype.hasOwnProperty.call(cursor, key)) {
      throw new Error(`Test stale payload path is unavailable: ${dottedPath}`);
    }
    cursor = cursor[key];
  }
  const finalKey = parts.at(-1);
  if (cursor === null || typeof cursor !== 'object'
      || !Object.prototype.hasOwnProperty.call(cursor, finalKey)) {
    throw new Error(`Test stale payload path is unavailable: ${dottedPath}`);
  }
  cursor[finalKey] = replacement;
}

function retailFeatureFailureInjection(req, res, next, env = process.env) {
  if (!isTestMode(env)) return next();
  const selector = requestedSelector(req);
  if (!selector) return next();
  const contract = FEATURE_FAILURES[selector];
  if (!contract) {
    res.setHeader(ORIGIN_HEADER, ORIGIN);
    return res.status(400).json({
      category: 'TEST_SELECTOR_INVALID',
      feature: 'RETAIL_TEST_FEATURE_FAILURE',
      available: false,
      source: ORIGIN,
      selector,
      error: `Unknown Retail test feature failure selector "${selector}".`,
      details: { allowedSelectors: Object.keys(FEATURE_FAILURES) },
    });
  }
  if (String(req.method || '').toUpperCase() !== contract.method
      || !contract.path.test(String(req.path || ''))) {
    return next();
  }
  res.setHeader(ORIGIN_HEADER, ORIGIN);
  return res.status(503).json({
    category: 'FEATURE_UNAVAILABLE',
    feature: contract.feature,
    available: false,
    source: ORIGIN,
    selector,
    error: contract.error,
    details: {
      requestMethod: req.method,
      requestPath: req.originalUrl,
    },
  });
}

function retailStaleResponseInjection(req, res, next, env = process.env) {
  if (!isTestMode(env)) return next();
  const selector = normalizeSelector(
    headerValue(req, STALE_SELECTOR_HEADER_KEY)
  );
  const nonce = headerValue(req, STALE_NONCE_HEADER_KEY);
  if (!selector && !nonce) return next();
  if (!selector || !STALE_RESPONSES[selector]
      || !/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) {
    res.setHeader(STALE_ORIGIN_HEADER, ORIGIN);
    return res.status(400).json({
      category: 'TEST_STALE_SELECTOR_INVALID',
      feature: 'RETAIL_TEST_STALE_RESPONSE',
      available: false,
      source: ORIGIN,
      selector,
      error: 'Retail stale-response selector or nonce is invalid.',
      details: { allowedSelectors: Object.keys(STALE_RESPONSES) },
    });
  }
  const contract = STALE_RESPONSES[selector];
  if (String(req.method || '').toUpperCase() !== contract.method
      || !contract.path.test(String(req.path || ''))) {
    return next();
  }

  const claimKey = `${selector}:${nonce}`;
  res.setHeader(STALE_ORIGIN_HEADER, ORIGIN);
  if (staleClaims.has(claimKey)) {
    res.setHeader(STALE_STATE_HEADER, 'FRESH_REPLACEMENT');
    return next();
  }
  staleClaims.set(claimKey, Date.now());
  if (staleClaims.size > 500) {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, claimedAt] of staleClaims) {
      if (claimedAt < cutoff) staleClaims.delete(key);
    }
  }
  res.setHeader(STALE_STATE_HEADER, 'DELAYED_STALE');
  const sendJson = res.json.bind(res);
  res.json = (payload) => {
    const stalePayload = JSON.parse(JSON.stringify(payload));
    replacePayloadValue(
      stalePayload,
      contract.payloadPath,
      contract.sentinel
    );
    setTimeout(() => {
      if (!res.headersSent && !res.destroyed) sendJson(stalePayload);
    }, STALE_DELAY_MS);
    return res;
  };
  return next();
}

module.exports = {
  FEATURE_FAILURES,
  OML_MOUNTED_ENDPOINTS,
  ORIGIN,
  ORIGIN_HEADER,
  SELECTOR_HEADER,
  STALE_NONCE_HEADER,
  STALE_ORIGIN_HEADER,
  STALE_RESPONSES,
  STALE_SELECTOR_HEADER,
  STALE_STATE_HEADER,
  isTestMode,
  normalizeSelector,
  requestedSelector,
  retailFeatureFailureInjection,
  retailStaleResponseInjection,
};
