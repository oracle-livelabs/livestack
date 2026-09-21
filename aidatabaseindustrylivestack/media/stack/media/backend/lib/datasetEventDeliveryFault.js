'use strict';

const DELIVERY_FAULT_HEADER = 'x-media-test-outbox-delivery';
const DELIVERY_FAULT_MODES = Object.freeze([
  'http-error-once',
  'timeout-once',
]);
const consumedFaults = new Set();

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

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

function normalizeDatasetEventDeliveryFault(value, env = process.env) {
  if (env.NODE_ENV !== 'test') return null;
  const mode = normalize(value);
  return DELIVERY_FAULT_MODES.includes(mode) ? mode : null;
}

function resolveDatasetEventDeliveryFault({
  headers = {},
  env = process.env,
} = {}) {
  return normalizeDatasetEventDeliveryFault(
    readHeader(headers, DELIVERY_FAULT_HEADER),
    env
  );
}

function consumeDatasetEventDeliveryFault({
  fault,
  objectKey,
  env = process.env,
} = {}) {
  const mode = normalizeDatasetEventDeliveryFault(fault, env);
  const key = String(objectKey || '').trim();
  if (!mode || !key) return null;
  const onceKey = `${key}\0${mode}`;
  if (consumedFaults.has(onceKey)) return null;
  consumedFaults.add(onceKey);
  return mode;
}

function resetDatasetEventDeliveryFaults() {
  consumedFaults.clear();
}

module.exports = {
  DELIVERY_FAULT_HEADER,
  DELIVERY_FAULT_MODES,
  consumeDatasetEventDeliveryFault,
  normalizeDatasetEventDeliveryFault,
  resetDatasetEventDeliveryFaults,
  resolveDatasetEventDeliveryFault,
};
