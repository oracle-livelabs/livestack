import lifecycleConfig from '../../../shared/serviceLifecycle.json';

export const REQUEST_STATUSES = Object.freeze(lifecycleConfig.requestStatuses);
export const SERVICE_TASK_STATUSES = Object.freeze(lifecycleConfig.serviceTaskStatuses);

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

export function getRequestStatusCode(value) {
  return resolveStatus(REQUEST_STATUSES, value)?.code || 'unknown';
}

export function getRequestStatusLabel(value) {
  return resolveStatus(REQUEST_STATUSES, value)?.label || 'Unknown';
}

export function getServiceTaskStatusCode(value) {
  return resolveStatus(SERVICE_TASK_STATUSES, value)?.code || 'unknown';
}

export function getServiceTaskStatusLabel(value) {
  return resolveStatus(SERVICE_TASK_STATUSES, value)?.label || 'Unknown';
}
