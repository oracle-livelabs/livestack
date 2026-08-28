'use strict';

const { featureUnavailable } = require('../lib/featureUnavailable');
const {
  OML_NATIVE_API_ROUTE_PATTERN,
} = require('../lib/mediaOmlRouteInventory');

const FAILURE_HEADER = 'x-media-feature-failure';
const FEATURE_FAILURE_RULES = Object.freeze([
  Object.freeze({
    method: 'GET',
    path: /^\/api\/demo\/status$/,
    features: Object.freeze(['APPLICATION_CONTEXT_VPD']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/dashboard\/native-json-audit-evidence$/,
    features: Object.freeze(['NATIVE_JSON', 'UNIFIED_AUDIT']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/dashboard\/inmemory$/,
    features: Object.freeze(['INMEMORY']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/products\/[^/]+\/duality$/,
    features: Object.freeze(['NATIVE_JSON', 'JSON_RELATIONAL_DUALITY']),
  }),
  Object.freeze({
    method: 'POST',
    path: /^\/api\/social\/semantic-search$/,
    features: Object.freeze(['AI_VECTOR_SEARCH']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/social\/posts$/,
    features: Object.freeze(['APPLICATION_CONTEXT_VPD']),
  }),
  Object.freeze({
    method: 'POST',
    path: /^\/api\/graph\/run-example$/,
    features: Object.freeze(['PROPERTY_GRAPH_SQL_PGQ']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/graph\/(?:influencers|network\/[^/]+)$/,
    features: Object.freeze(['PROPERTY_GRAPH_SQL_PGQ']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/fulfillment\/nearest$/,
    features: Object.freeze(['ORACLE_SPATIAL']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/fulfillment\/centers$/,
    features: Object.freeze(['APPLICATION_CONTEXT_VPD']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/orders\/[^/]+\/duality$/,
    features: Object.freeze(['JSON_RELATIONAL_DUALITY']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/orders$/,
    features: Object.freeze(['APPLICATION_CONTEXT_VPD']),
  }),
  Object.freeze({
    method: 'GET',
    path: OML_NATIVE_API_ROUTE_PATTERN,
    features: Object.freeze(['ORACLE_MACHINE_LEARNING']),
  }),
  Object.freeze({
    method: 'GET',
    path: /^\/api\/ml\/vector-clusters$/,
    features: Object.freeze(['AI_VECTOR_SEARCH']),
  }),
]);

function normalizedFeature(value) {
  return String(value || '').trim().toUpperCase();
}

function findFailureRule(method, requestPath, feature) {
  return FEATURE_FAILURE_RULES.find((rule) => (
    rule.method === String(method || '').toUpperCase()
      && rule.path.test(requestPath)
      && rule.features.includes(feature)
  )) || null;
}

function mediaFeatureFailure(req, res, next) {
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'test') {
    return next();
  }
  const feature = normalizedFeature(req.headers[FAILURE_HEADER]);
  if (!feature) return next();

  const rule = findFailureRule(req.method, req.path, feature);
  if (!rule) return next();

  return featureUnavailable(res, {
    feature,
    source: 'SERVER_OWNED_TEST_FAULT',
    message: `${feature} was made unavailable by the server-owned test fault.`,
    details: {
      testOnly: true,
      method: req.method,
      path: req.path,
    },
  });
}

module.exports = {
  FAILURE_HEADER,
  FEATURE_FAILURE_RULES,
  findFailureRule,
  mediaFeatureFailure,
};
