const lifecycleConfig = require('../../shared/serviceLifecycle.json');

const requestStatuses = Object.freeze(lifecycleConfig.requestStatuses.map((status) => Object.freeze({ ...status })));
const serviceTaskStatuses = Object.freeze(lifecycleConfig.serviceTaskStatuses.map((status) => Object.freeze({ ...status })));

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveStatus(statuses, value) {
  const token = normalize(value);
  if (!token) return null;
  return statuses.find((status) => normalize(status.internal) === token)
    || statuses.find((status) => normalize(status.code) === token)
    || statuses.find((status) => normalize(status.label) === token)
    || statuses.find((status) => (status.aliases || []).some((alias) => normalize(alias) === token))
    || null;
}

function toPublicStatus(statuses, value) {
  if (value === null || value === undefined || value === '') return value;
  return resolveStatus(statuses, value)?.label || 'Unknown';
}

function toPublicStatusCode(statuses, value) {
  if (value === null || value === undefined || value === '') return value;
  return resolveStatus(statuses, value)?.code || 'unknown';
}

function toInternalStatus(statuses, value) {
  return resolveStatus(statuses, value)?.internal || null;
}

function toPublicRequestStatus(value) {
  return toPublicStatus(requestStatuses, value);
}

function toPublicRequestStatusCode(value) {
  return toPublicStatusCode(requestStatuses, value);
}

function toInternalRequestStatus(value) {
  return toInternalStatus(requestStatuses, value);
}

function toPublicServiceTaskStatus(value) {
  return toPublicStatus(serviceTaskStatuses, value);
}

function toPublicServiceTaskStatusCode(value) {
  return toPublicStatusCode(serviceTaskStatuses, value);
}

function toInternalServiceTaskStatus(value) {
  return toInternalStatus(serviceTaskStatuses, value);
}

function toPublicSemanticRequestStatus(value) {
  if (normalize(value) === 'in progress') {
    return requestStatuses.find((status) => status.code === 'in_review').label;
  }
  return toPublicRequestStatus(value);
}

function toPublicSemanticServiceTaskStatus(value) {
  return toPublicServiceTaskStatus(value);
}

function tokenPattern(token) {
  return String(token)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/_/g, '(?:_|[\\s-])');
}

function replaceStatusTokens(text, statuses) {
  const replacements = statuses
    .flatMap((status) => [status.internal, ...(status.aliases || [])]
      .map((token) => ({ token, label: status.label })))
    .sort((left, right) => right.token.length - left.token.length);

  return replacements.reduce((output, { token, label }) => output.replace(
    new RegExp(`(?<![A-Za-z0-9_])${tokenPattern(token)}(?![A-Za-z0-9_])`, 'gi'),
    label
  ), String(text));
}

function sanitizePublicLifecycleText(value, defaultKind = 'request') {
  if (typeof value !== 'string') return value;
  const narrativeInternals = new Set([
    'preparing',
    'picked',
    'packed',
    'shipped',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
  ]);
  const primary = (defaultKind === 'serviceTask' ? serviceTaskStatuses : requestStatuses)
    .filter((status) => narrativeInternals.has(status.internal));
  const secondary = (defaultKind === 'serviceTask' ? requestStatuses : serviceTaskStatuses)
    .filter((status) => narrativeInternals.has(status.internal));
  const primaryInternals = new Set(primary.map((status) => status.internal));
  const nonConflictingSecondary = secondary.filter((status) => !primaryInternals.has(status.internal));
  return replaceStatusTokens(replaceStatusTokens(value, primary), nonConflictingSecondary);
}

const REQUEST_STATUS_KEYS = new Set([
  'ORDER_STATUS',
  'SERVICE_REQUEST_STATUS',
  'REQUEST_STATUS',
]);
const SERVICE_TASK_STATUS_KEYS = new Set([
  'SHIP_STATUS',
  'SERVICE_TASK_STATUS',
  'ROUTE_STATUS',
]);
const PHYSICAL_STATUS_KEYS = new Set([
  'PHYSICAL_REQUEST_STATUS',
  'PHYSICAL_ROUTE_STATUS',
]);

function lifecycleKindForKey(key, defaultKind = null) {
  const normalizedKey = String(key || '').toUpperCase();
  if (REQUEST_STATUS_KEYS.has(normalizedKey) || normalizedKey === 'PHYSICAL_REQUEST_STATUS') return 'request';
  if (SERVICE_TASK_STATUS_KEYS.has(normalizedKey) || normalizedKey === 'PHYSICAL_ROUTE_STATUS') return 'serviceTask';
  if (normalizedKey === 'STATUS') return defaultKind;
  return null;
}

function childLifecycleKind(key, inheritedKind = null) {
  const normalizedKey = String(key || '').replace(/[^A-Za-z]/g, '').toLowerCase();
  if (['order', 'servicerequest', 'document'].includes(normalizedKey)) return 'request';
  if (['shipment', 'servicetask'].includes(normalizedKey)) return 'serviceTask';
  return inheritedKind;
}

function isPhysicalLifecycleStatusKey(key) {
  return PHYSICAL_STATUS_KEYS.has(String(key || '').toUpperCase());
}

function sanitizePublicLifecyclePayload(value, options = {}, inheritedKind = options.defaultKind || null) {
  const {
    datesToIso = true,
    dropPhysicalStatusFields = false,
    sanitizeText = false,
    semanticView = false,
  } = options;

  if (value instanceof Date) return datesToIso ? value.toISOString() : value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePublicLifecyclePayload(entry, options, inheritedKind));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).flatMap(([key, entryValue]) => {
      if (dropPhysicalStatusFields && isPhysicalLifecycleStatusKey(key)) return [];
      const statusKind = lifecycleKindForKey(key, inheritedKind);
      if (statusKind && entryValue !== null && entryValue !== undefined) {
        const publicValue = semanticView && statusKind === 'request'
          ? toPublicSemanticRequestStatus(entryValue)
          : semanticView && statusKind === 'serviceTask'
            ? toPublicSemanticServiceTaskStatus(entryValue)
            : statusKind === 'request'
              ? toPublicRequestStatus(entryValue)
              : toPublicServiceTaskStatus(entryValue);
        return [[key, publicValue]];
      }
      const childKind = childLifecycleKind(key, inheritedKind);
      return [[key, sanitizePublicLifecyclePayload(entryValue, options, childKind)]];
    }));
  }
  if (sanitizeText && typeof value === 'string') {
    return sanitizePublicLifecycleText(value, inheritedKind || 'request');
  }
  return value;
}

module.exports = {
  isPhysicalLifecycleStatusKey,
  requestStatuses,
  sanitizePublicLifecyclePayload,
  sanitizePublicLifecycleText,
  serviceTaskStatuses,
  toInternalRequestStatus,
  toInternalServiceTaskStatus,
  toPublicRequestStatus,
  toPublicRequestStatusCode,
  toPublicSemanticRequestStatus,
  toPublicSemanticServiceTaskStatus,
  toPublicServiceTaskStatus,
  toPublicServiceTaskStatusCode,
};
