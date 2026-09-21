const crypto = require('crypto');
const db = require('../config/database');
const { recordDatasetEvent } = require('./usageCounterService');
const { failAtPhase } = require('./retailFailureInjection');

const SYSTEM_IDENTITY = 'admin_jess';
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 60;
const BASE_BACKOFF_SECONDS = 5;
const MAX_BACKOFF_SECONDS = 900;
const DEFAULT_RECONCILE_INTERVAL_MS = 15000;

let reconcileTimer = null;
let reconcileRunning = false;

function eventIdFor(jobId, status) {
  return `${String(jobId)}:${String(status).toLowerCase()}`;
}

function parsePayload(value) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function configuredBatchSize(value = process.env.DATASET_EVENT_OUTBOX_BATCH_SIZE) {
  return boundedInteger(value, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
}

function computeBackoffSeconds(attemptCount) {
  const exponent = Math.max(0, Number.parseInt(attemptCount || 0, 10));
  return Math.min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * (2 ** exponent));
}

function classifyDelivery(delivery = {}) {
  const reason = String(delivery.reason || delivery.error || '');
  if (delivery.ok && (!delivery.skipped || reason === 'disabled')) {
    return { delivered: true, errorCategory: 'NONE' };
  }
  if (reason === 'missing_par_url') {
    return { delivered: false, errorCategory: 'MISSING_CONFIGURATION' };
  }
  if (reason === 'invalid_oci_object_storage_par_url') {
    return { delivered: false, errorCategory: 'INVALID_DESTINATION' };
  }
  if (/HTTP\s+\d{3}|Object Storage PUT failed/i.test(reason)) {
    return { delivered: false, errorCategory: 'HTTP_FAILURE' };
  }
  if (/abort|timed?\s*out|timeout/i.test(reason)) {
    return { delivered: false, errorCategory: 'TIMEOUT' };
  }
  if (/fetch failed|ECONN|ENOTFOUND|network|socket|EHOST/i.test(reason)) {
    return { delivered: false, errorCategory: 'NETWORK_FAILURE' };
  }
  return { delivered: false, errorCategory: 'INTERNAL_FAILURE' };
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } finally {
    await db.releaseConnection(connection, {
      rollback: true,
      label: 'dataset event outbox',
    });
  }
}

async function enqueueOnConnection(connection, eventContext) {
  const eventId = eventContext.eventId || eventIdFor(eventContext.jobId, eventContext.status);
  const timestamp = eventContext.timestamp || new Date().toISOString();
  const payload = { ...eventContext, eventId, timestamp };
  await connection.execute(`
    MERGE INTO app_dataset_event_outbox target
    USING (
      SELECT :eventId event_id, :jobId job_id, :eventStatus event_status,
             :payload payload
      FROM dual
    ) source
    ON (target.event_id = source.event_id)
    WHEN NOT MATCHED THEN INSERT (
      event_id, job_id, event_status, payload, delivery_status,
      attempt_count, error_category, next_attempt_at,
      created_at, updated_at
    ) VALUES (
      source.event_id, source.job_id, source.event_status, source.payload,
      'PENDING', 0, 'NONE', SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
    )
  `, {
    eventId,
    jobId: String(eventContext.jobId),
    eventStatus: String(eventContext.status).toLowerCase(),
    payload: { val: payload, type: db.oracledb.DB_TYPE_JSON },
  }, { autoCommit: false });
  return { eventId, payload };
}

async function enqueueDatasetEvent(eventContext) {
  return withConnection(async (connection) => {
    const result = await enqueueOnConnection(connection, eventContext);
    await connection.commit();
    return result;
  });
}

function eventIdFilter(eventIds, binds) {
  if (!Array.isArray(eventIds) || !eventIds.length) return '';
  const boundedIds = [...new Set(eventIds.map(String))].slice(0, MAX_BATCH_SIZE);
  return `AND event_id IN (${boundedIds.map((id, index) => {
    binds[`event${index}`] = id;
    return `:event${index}`;
  }).join(',')})`;
}

async function claimPendingDatasetEvents({
  eventIds = null,
  batchSize = DEFAULT_BATCH_SIZE,
  claimToken = crypto.randomUUID(),
  leaseSeconds = DEFAULT_LEASE_SECONDS,
} = {}) {
  const boundedBatch = configuredBatchSize(batchSize);
  const boundedLease = boundedInteger(leaseSeconds, DEFAULT_LEASE_SECONDS, 15, 300);
  return withConnection(async (connection) => {
    const binds = { batchSize: boundedBatch };
    const filter = eventIdFilter(eventIds, binds);

    // Candidate discovery is bounded but intentionally unlocked. Each candidate
    // is then claimed with a row-specific SKIP LOCKED check, so competing
    // workers never share a lease and no network call occurs in this transaction.
    const candidates = await connection.execute(`
      SELECT event_id
      FROM app_dataset_event_outbox
      WHERE delivery_status = 'PENDING'
        AND next_attempt_at <= SYSTIMESTAMP
        AND (claim_token IS NULL OR claim_expires_at <= SYSTIMESTAMP)
        ${filter}
      ORDER BY created_at, event_id
      FETCH FIRST :batchSize ROWS ONLY
    `, binds, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });

    const claimed = [];
    for (const candidate of candidates.rows || []) {
      const locked = await connection.execute(`
        SELECT event_id, payload, attempt_count
        FROM app_dataset_event_outbox
        WHERE event_id = :eventId
          AND delivery_status = 'PENDING'
          AND next_attempt_at <= SYSTIMESTAMP
          AND (claim_token IS NULL OR claim_expires_at <= SYSTIMESTAMP)
        FOR UPDATE SKIP LOCKED
      `, { eventId: candidate.EVENT_ID }, {
        outFormat: db.oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
      });
      const row = locked.rows?.[0];
      if (!row) continue;
      await connection.execute(`
        UPDATE app_dataset_event_outbox
        SET claim_token = :claimToken,
            claim_expires_at = SYSTIMESTAMP
              + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'),
            updated_at = SYSTIMESTAMP
        WHERE event_id = :eventId
      `, {
        claimToken,
        leaseSeconds: boundedLease,
        eventId: row.EVENT_ID,
      }, { autoCommit: false });
      claimed.push({
        eventId: row.EVENT_ID,
        payload: parsePayload(row.PAYLOAD),
        attemptCount: Number(row.ATTEMPT_COUNT || 0),
        claimToken,
      });
    }
    await connection.commit();
    return claimed;
  });
}

async function finalizeClaim(row, delivery) {
  const outcome = classifyDelivery(delivery);
  const backoffSeconds = outcome.delivered
    ? 0
    : computeBackoffSeconds(row.attemptCount);
  return withConnection(async (connection) => {
    const result = await connection.execute(`
      UPDATE app_dataset_event_outbox
      SET delivery_status = :deliveryStatus,
          attempt_count = attempt_count + 1,
          error_category = :errorCategory,
          last_error = CASE
            WHEN :deliveryStatus = 'DELIVERED' THEN NULL
            ELSE :errorCategory
          END,
          next_attempt_at = CASE
            WHEN :deliveryStatus = 'DELIVERED' THEN SYSTIMESTAMP
            ELSE SYSTIMESTAMP + NUMTODSINTERVAL(:backoffSeconds, 'SECOND')
          END,
          delivered_at = CASE
            WHEN :deliveryStatus = 'DELIVERED' THEN SYSTIMESTAMP
            ELSE delivered_at
          END,
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = SYSTIMESTAMP
      WHERE event_id = :eventId
        AND claim_token = :claimToken
    `, {
      deliveryStatus: outcome.delivered ? 'DELIVERED' : 'PENDING',
      errorCategory: outcome.errorCategory,
      backoffSeconds,
      eventId: row.eventId,
      claimToken: row.claimToken,
    }, { autoCommit: false });
    await connection.commit();
    return {
      finalized: Number(result.rowsAffected || 0) === 1,
      ...outcome,
      backoffSeconds,
    };
  });
}

async function deliverPendingDatasetEvents({
  eventIds = null,
  batchSize = configuredBatchSize(),
  deliverEvent = recordDatasetEvent,
  claimToken = crypto.randomUUID(),
  failurePhase = null,
} = {}) {
  const claimed = await claimPendingDatasetEvents({
    eventIds,
    batchSize,
    claimToken,
  });
  if (claimed.length > 0) {
    failAtPhase(failurePhase, 'OUTBOX_AFTER_CLAIM', {
      claimToken,
      eventIds: claimed.map((row) => row.eventId),
    });
  }
  const results = [];
  for (const row of claimed) {
    let delivery;
    try {
      delivery = await deliverEvent({
        ...row.payload,
        deliveryAttempt: row.attemptCount + 1,
      });
    } catch (error) {
      delivery = {
        ok: false,
        skipped: true,
        reason: error?.message || 'delivery failed',
      };
    }
    failAtPhase(failurePhase, 'OUTBOX_AFTER_DELIVERY', {
      claimToken,
      eventId: row.eventId,
      deliveryOk: Boolean(delivery?.ok),
    });
    const finalization = await finalizeClaim(row, delivery);
    results.push({
      eventId: row.eventId,
      ...delivery,
      ...finalization,
    });
  }
  return results;
}

function configuredReconcileInterval(value = process.env.DATASET_EVENT_OUTBOX_INTERVAL_MS) {
  return boundedInteger(value, DEFAULT_RECONCILE_INTERVAL_MS, 1000, 300000);
}

function startDatasetEventReconciler({
  intervalMs = configuredReconcileInterval(),
  batchSize = configuredBatchSize(),
} = {}) {
  if (reconcileTimer) return stopDatasetEventReconciler;
  const sweep = async () => {
    if (reconcileRunning) return;
    reconcileRunning = true;
    try {
      await deliverPendingDatasetEvents({ batchSize });
    } catch (error) {
      console.warn(`Dataset event reconciliation deferred: ${error.message}`);
    } finally {
      reconcileRunning = false;
    }
  };
  setImmediate(() => { void sweep(); });
  reconcileTimer = setInterval(() => { void sweep(); }, configuredReconcileInterval(intervalMs));
  if (typeof reconcileTimer.unref === 'function') reconcileTimer.unref();
  return stopDatasetEventReconciler;
}

function stopDatasetEventReconciler() {
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = null;
  reconcileRunning = false;
}

module.exports = {
  eventIdFor,
  enqueueOnConnection,
  enqueueDatasetEvent,
  claimPendingDatasetEvents,
  deliverPendingDatasetEvents,
  startDatasetEventReconciler,
  stopDatasetEventReconciler,
  _private: {
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
    classifyDelivery,
    computeBackoffSeconds,
    configuredBatchSize,
    configuredReconcileInterval,
    eventIdFilter,
  },
};
