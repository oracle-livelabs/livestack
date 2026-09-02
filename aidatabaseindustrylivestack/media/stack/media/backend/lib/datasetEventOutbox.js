const crypto = require('crypto');
const db = require('../config/database');
const {
  prepareDatasetEvent,
  deliverPreparedDatasetEvent,
} = require('./usageCounterService');
const {
  CLAIM_LEASE_SECONDS,
  normalizeDeliveryFailureCategory,
} = require('./datasetEventLeasePolicy');
const {
  normalizeDatasetEventDeliveryFault,
} = require('./datasetEventDeliveryFault');

const SYSTEM_IDENTITY = process.env.SYSTEM_SECURITY_CONTEXT_USER || 'admin_jess';
const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const jsonBind = (value) => ({ val: clone(value), type: db.oracledb.DB_TYPE_JSON });

function eventIdFor(context) {
  return `${context.jobId}:${String(context.status || '').toLowerCase()}`;
}

async function enqueueDatasetEventInTransaction(connection, context) {
  const generationId = String(
    context.generationId || context.candidateGenerationId || `candidate-${context.jobId}`
  );
  const prepared = prepareDatasetEvent({ ...context, generationId });
  const testDeliveryFault = normalizeDatasetEventDeliveryFault(
    context._testDeliveryFault
  );
  const durablePayload = testDeliveryFault
    ? {
      ...prepared.payload,
      _testDeliveryFault: testDeliveryFault,
    }
    : prepared.payload;
  const eventId = eventIdFor(context);
  await connection.execute(`
    MERGE INTO app_dataset_event_outbox target
    USING (
      SELECT :eventId event_id, :jobId job_id, :generationId generation_id,
             :operation operation, :eventStatus event_status,
             :objectKey object_key, :payload payload
      FROM dual
    ) source
    ON (target.event_id = source.event_id)
    WHEN NOT MATCHED THEN INSERT(
      event_id, job_id, generation_id, operation, event_status,
      object_key, payload, delivery_status, delivery_attempts,
      next_attempt_at, created_at, updated_at
    ) VALUES(
      source.event_id, source.job_id, source.generation_id, source.operation,
      source.event_status, source.object_key, source.payload,
      'pending', 0, SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
    )
  `, {
    eventId,
    jobId: context.jobId,
    generationId,
    operation: String(context.operation || 'refresh').toLowerCase(),
    eventStatus: String(context.status || '').toLowerCase(),
    objectKey: prepared.objectKey,
    payload: jsonBind(durablePayload),
  }, { autoCommit: false });
  return { eventId, objectKey: prepared.objectKey };
}

async function withSystemConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } finally {
    await db.releaseConnection(connection, {
      rollback: true,
      label: 'Media dataset event outbox',
    });
  }
}

async function claimPendingDatasetEvents({ limit = 25 } = {}) {
  return withSystemConnection(async (connection) => {
    const result = await connection.execute(`
      SELECT event_id, object_key,
             JSON_SERIALIZE(payload RETURNING CLOB) payload
      FROM app_dataset_event_outbox
      WHERE next_attempt_at <= SYSTIMESTAMP
        AND (
          delivery_status = 'pending'
          OR (
            delivery_status = 'delivering'
            AND NVL(claim_expires_at, TIMESTAMP '1970-01-01 00:00:00')
                <= SYSTIMESTAMP
          )
        )
        AND ROWNUM <= :limit
      FOR UPDATE SKIP LOCKED
    `, { limit }, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
    const claimed = [];
    for (const row of result.rows || []) {
      const claimToken = crypto.randomUUID();
      const update = await connection.execute(`
        UPDATE app_dataset_event_outbox
        SET delivery_status = 'delivering',
            delivery_attempts = delivery_attempts + 1,
            claim_token = :claimToken,
            claimed_at = SYSTIMESTAMP,
            claim_expires_at = SYSTIMESTAMP
              + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'),
            updated_at = SYSTIMESTAMP
        WHERE event_id = :eventId
          AND (
            delivery_status = 'pending'
            OR (
              delivery_status = 'delivering'
              AND NVL(claim_expires_at, TIMESTAMP '1970-01-01 00:00:00')
                  <= SYSTIMESTAMP
            )
          )
      `, {
        eventId: row.EVENT_ID,
        claimToken,
        leaseSeconds: CLAIM_LEASE_SECONDS,
      }, { autoCommit: false });
      if (Number(update.rowsAffected || 0) === 1) {
        claimed.push({
          eventId: row.EVENT_ID,
          objectKey: row.OBJECT_KEY,
          payload: typeof row.PAYLOAD === 'string' ? JSON.parse(row.PAYLOAD) : clone(row.PAYLOAD),
          claimToken,
        });
      }
    }
    // The claim is durable before any network call and releases every row lock.
    await connection.commit();
    return claimed;
  });
}

async function finalizeDatasetEventClaim(claim, outcome) {
  return withSystemConnection(async (connection) => {
    let update;
    if (outcome.recorded) {
      update = await connection.execute(`
        UPDATE app_dataset_event_outbox
        SET delivery_status = 'delivered', delivered_at = SYSTIMESTAMP,
            last_error = NULL, last_error_category = NULL,
            claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
            updated_at = SYSTIMESTAMP
        WHERE event_id = :eventId
          AND delivery_status = 'delivering'
          AND claim_token = :claimToken
      `, {
        eventId: claim.eventId,
        claimToken: claim.claimToken,
      }, { autoCommit: false });
    } else {
      const failureCategory = normalizeDeliveryFailureCategory(outcome.failureCategory);
      update = await connection.execute(`
        UPDATE app_dataset_event_outbox
        SET delivery_status = 'pending',
            next_attempt_at = SYSTIMESTAMP
              + NUMTODSINTERVAL(
                  LEAST(300, POWER(2, LEAST(delivery_attempts, 8))),
                  'SECOND'
                ),
            last_error = :failureCategory,
            last_error_category = :failureCategory,
            claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
            updated_at = SYSTIMESTAMP
        WHERE event_id = :eventId
          AND delivery_status = 'delivering'
          AND claim_token = :claimToken
      `, {
        eventId: claim.eventId,
        claimToken: claim.claimToken,
        failureCategory,
      }, { autoCommit: false });
    }
    await connection.commit();
    return Number(update.rowsAffected || 0) === 1;
  });
}

async function deliverPendingDatasetEvents({ limit = 25 } = {}) {
  const claims = await claimPendingDatasetEvents({ limit });
  const results = await Promise.all(claims.map(async (claim) => {
    let outcome;
    try {
      // No Oracle connection or row lock is held across this bounded HTTP PUT.
      outcome = await deliverPreparedDatasetEvent({
        objectKey: claim.objectKey,
        payload: claim.payload,
      });
    } catch (_) {
      outcome = {
        recorded: false,
        retryable: true,
        failureCategory: 'OCI_OBJECT_STORAGE_DELIVERY_ERROR',
      };
    }
    const claimFinalized = await finalizeDatasetEventClaim(claim, outcome);
    return {
      finalized: claimFinalized,
      delivered: claimFinalized && Boolean(outcome.recorded),
    };
  }));
  return {
    attempted: claims.length,
    finalized: results.filter((result) => result.finalized).length,
    delivered: results.filter((result) => result.delivered).length,
  };
}

let deliveryScheduled = false;
function scheduleDatasetEventDelivery() {
  if (deliveryScheduled) return;
  deliveryScheduled = true;
  setImmediate(async () => {
    deliveryScheduled = false;
    try {
      await deliverPendingDatasetEvents();
    } catch (error) {
      console.warn('Dataset event outbox delivery deferred:', error.message || error);
    }
  });
}

module.exports = {
  enqueueDatasetEventInTransaction,
  claimPendingDatasetEvents,
  finalizeDatasetEventClaim,
  deliverPendingDatasetEvents,
  scheduleDatasetEventDelivery,
  deterministicObjectKey: true,
};
