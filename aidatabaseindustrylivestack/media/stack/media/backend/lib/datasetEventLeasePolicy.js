// Object PUT timeout is capped at 30 seconds. The durable claim outlives that
// bound so a second worker cannot reclaim an in-flight request.
const CLAIM_LEASE_SECONDS = 60;
const DELIVERY_FAILURE_CATEGORIES = new Set([
  'OCI_OBJECT_STORAGE_DISABLED',
  'OCI_OBJECT_STORAGE_TIMEOUT',
  'OCI_OBJECT_STORAGE_HTTP_ERROR',
  'OCI_OBJECT_STORAGE_DELIVERY_ERROR',
]);

function normalizeDeliveryFailureCategory(value) {
  const category = String(value || '').trim().toUpperCase();
  return DELIVERY_FAILURE_CATEGORIES.has(category)
    ? category
    : 'OCI_OBJECT_STORAGE_DELIVERY_ERROR';
}

function isClaimableEvent(event, now = new Date()) {
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const nextAttempt = new Date(event.nextAttemptAt || 0).getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(nextAttempt)
      || nextAttempt > currentTime) return false;
  if (event.deliveryStatus === 'pending') return true;
  if (event.deliveryStatus !== 'delivering') return false;
  const expiresAt = new Date(event.claimExpiresAt || 0).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= currentTime;
}

module.exports = {
  CLAIM_LEASE_SECONDS,
  normalizeDeliveryFailureCategory,
  isClaimableEvent,
};
