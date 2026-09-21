'use strict';

const OML_NATIVE_API_ROUTE_PATHS = Object.freeze([
  '/api/ml/summary',
  '/api/ml/model-provenance',
  '/api/ml/demand-forecast',
  '/api/ml/customer-segments',
  '/api/ml/revenue-forecast',
  '/api/ml/product-clusters',
  '/api/ml/inventory-intelligence',
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const OML_NATIVE_API_ROUTE_PATTERN = new RegExp(
  `^(?:${OML_NATIVE_API_ROUTE_PATHS.map(escapeRegex).join('|')})$`
);

module.exports = {
  OML_NATIVE_API_ROUTE_PATHS,
  OML_NATIVE_API_ROUTE_PATTERN,
};
