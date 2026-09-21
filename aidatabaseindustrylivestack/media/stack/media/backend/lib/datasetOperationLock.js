const crypto = require('crypto');
const db = require('../config/database');

const SYSTEM_IDENTITY = process.env.SYSTEM_SECURITY_CONTEXT_USER || 'admin_jess';
const LEASE_SECONDS = Math.max(60, Number.parseInt(process.env.DATASET_OPERATION_LEASE_SECONDS || '1800', 10));
const HEARTBEAT_MILLIS = Math.max(5000, Math.min(30000, Math.floor(LEASE_SECONDS * 1000 / 3)));
// A failed renewal is deferred to the next heartbeat; the pre-commit fence is
// the authoritative ownership check. Keep this to one attempt so pool pressure
// cannot make workflow shutdown wait through several connection-queue timeouts.
const HEARTBEAT_RETRY_ATTEMPTS = 1;
const HEARTBEAT_RETRY_MILLIS = 250;
const VALIDATION_OWNER_TYPE = 'validation';
const activeValidationLeaseTokens = new Set();
const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const jsonBind = (value) => ({ val: clone(value), type: db.oracledb.DB_TYPE_JSON });

class DatasetOperationOwnershipLostError extends Error {
  constructor(message = 'Dataset operation lease ownership was lost.', details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'DatasetOperationOwnershipLostError';
    this.code = 'DATASET_OPERATION_OWNERSHIP_LOST';
    this.jobId = details.jobId || null;
    this.leaseToken = details.leaseToken || null;
  }
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'durable Media dataset lease' });
  }
}

function fromRow(row) {
  if (!row?.LEASE_TOKEN) return null;
  const payload = typeof row.LEASE_PAYLOAD === 'string'
    ? JSON.parse(row.LEASE_PAYLOAD)
    : clone(row.LEASE_PAYLOAD);
  return {
    ...(payload || {}),
    leaseToken: row.LEASE_TOKEN,
    jobId: row.OWNER_JOB_ID || payload?.jobId || null,
    ownerType: row.OWNER_TYPE || payload?.ownerType || null,
    ownerId: row.OWNER_ID || payload?.ownerId || null,
    kind: row.OPERATION_KIND || payload?.kind || null,
    status: row.STATUS || payload?.status || null,
    message: row.MESSAGE || payload?.message || null,
    progress: Number(row.PROGRESS || 0),
    stale: Number(row.IS_STALE || 0) === 1,
  };
}

async function selectLock(connection, forUpdate = false) {
  const result = await connection.execute(`
    SELECT lease_token, owner_job_id, owner_type, owner_id,
           operation_kind, status, message,
           progress,
           JSON_SERIALIZE(lease_payload RETURNING CLOB) lease_payload,
           CASE WHEN lease_token IS NOT NULL AND lease_expires_at <= SYSTIMESTAMP
                THEN 1 ELSE 0 END AS is_stale
    FROM app_dataset_operation_lock
    WHERE lock_id = 1
    ${forUpdate ? `FOR UPDATE${forUpdate === 'wait' ? '' : ' NOWAIT'}` : ''}
  `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  return fromRow(result.rows?.[0]);
}

async function getActiveOperation() {
  return withConnection(async (connection) => {
    const operation = await selectLock(connection);
    return operation?.stale ? null : operation;
  });
}

async function assertOperationOwnershipInTransaction(connection, {
  jobId,
  leaseToken,
} = {}) {
  if (!leaseToken) {
    throw new DatasetOperationOwnershipLostError(
      'Dataset transaction requires the exact lease token.',
      { jobId, leaseToken }
    );
  }
  const current = await selectLock(connection);
  const exactJobOwner = jobId == null || current?.jobId === jobId;
  if (!current
      || current.stale
      || current.leaseToken !== leaseToken
      || !exactJobOwner) {
    throw new DatasetOperationOwnershipLostError(
      'Dataset operation lease no longer belongs to this worker.',
      { jobId, leaseToken }
    );
  }

  // Fence replacement admission in the same Oracle transaction as the
  // candidate/provenance/activation/finalization commit that follows.
  const fenceResult = await connection.execute(`
    SELECT lease_token
    FROM app_dataset_operation_lock
    WHERE lock_id = 1
      AND lease_token = :leaseToken
      AND (:jobId IS NULL OR owner_job_id = :jobId)
      AND lease_expires_at > SYSTIMESTAMP
    FOR UPDATE
  `, {
    leaseToken,
    jobId: jobId || null,
  }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  if (Number(fenceResult.rows?.length || 0) !== 1) {
    throw new DatasetOperationOwnershipLostError(
      'Dataset operation lease expired or was replaced before commit.',
      { jobId, leaseToken }
    );
  }
  return true;
}

async function beginOperationInTransaction(connection, metadata = {}) {
  let current;
  try {
    current = await selectLock(connection, true);
  } catch (error) {
    if (/ORA-00054/.test(String(error?.message || ''))) {
      return { operation: null, activeOperation: null, contention: true };
    }
    throw error;
  }
  if (current && !current.stale) {
    return { operation: null, activeOperation: current, contention: false };
  }

  // The readiness row is the durable publication/admission fence. Lock it
  // after the single operation row and before allocating a replacement lease,
  // so a committed STABILIZING generation cannot admit another destructive
  // import or Restore even if its worker lease expired during restart.
  const readinessResult = await connection.execute(`
    SELECT status, job_id
    FROM app_dataset_readiness
    WHERE readiness_id = 1
    FOR UPDATE
  `, {}, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const readiness = readinessResult.rows?.[0] || {};
  if (String(readiness.STATUS || '').toUpperCase() === 'STABILIZING') {
    const generationResult = readiness.JOB_ID
      ? await connection.execute(`
          SELECT candidate_generation_id
          FROM app_dataset_jobs
          WHERE job_id = :jobId
        `, { jobId: readiness.JOB_ID }, {
          outFormat: db.oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false,
        })
      : { rows: [] };
    return {
      operation: null,
      activeOperation: {
        kind: 'dataset_stabilization',
        status: 'STABILIZING',
        jobId: readiness.JOB_ID || null,
        generationId:
          generationResult.rows?.[0]?.CANDIDATE_GENERATION_ID || null,
        message:
          'The committed dataset generation is completing feature stabilization.',
      },
      contention: false,
    };
  }

  const operation = {
    kind: metadata.kind || 'dataset_operation',
    message: metadata.message || 'Dataset operation in progress.',
    status: metadata.status || 'running',
    progress: Number(metadata.progress || 0),
    jobId: metadata.jobId || null,
    leaseToken: crypto.randomUUID(),
    ...metadata,
  };
  await connection.execute(`
    UPDATE app_dataset_operation_lock
    SET lease_token = :leaseToken,
        owner_job_id = :jobId,
        owner_type = :ownerType,
        owner_id = :ownerId,
        operation_kind = :kind,
        status = :status,
        message = :message,
        progress = :progress,
        lease_payload = :payload,
        acquired_at = SYSTIMESTAMP,
        heartbeat_at = SYSTIMESTAMP,
        lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'),
        updated_at = SYSTIMESTAMP
    WHERE lock_id = 1
  `, {
    leaseToken: operation.leaseToken,
    jobId: operation.jobId,
    ownerType: operation.ownerType || null,
    ownerId: operation.ownerId || null,
    kind: operation.kind,
    status: operation.status,
    message: operation.message,
    progress: operation.progress,
    payload: jsonBind(operation),
    leaseSeconds: LEASE_SECONDS,
  }, { autoCommit: false });
  return { operation: clone(operation), activeOperation: null, contention: false };
}

async function beginOperation(metadata = {}) {
  return withConnection(async (connection) => {
    const admission = await beginOperationInTransaction(connection, metadata);
    if (!admission.operation) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    if (admission.operation.ownerType === VALIDATION_OWNER_TYPE) {
      activeValidationLeaseTokens.add(admission.operation.leaseToken);
    }
    return admission.operation;
  });
}

async function updateOperation(patch = {}) {
  if (!patch.leaseToken) {
    throw new Error('Dataset lease update requires the exact leaseToken.');
  }
  return withConnection(async (connection) => {
    // Heartbeats and phase updates legitimately overlap. Let these short lease
    // updates serialize instead of turning an ORA-00054 collision into a false
    // ownership-loss signal. Admission/reconciliation retain NOWAIT semantics.
    const current = await selectLock(connection, 'wait');
    if (!current
        || current.stale
        || patch.leaseToken !== current.leaseToken
        || (patch.jobId && patch.jobId !== current.jobId)) return null;
    const next = { ...current, ...patch, leaseToken: current.leaseToken };
    const updateResult = await connection.execute(`
      UPDATE app_dataset_operation_lock
      SET owner_job_id = :jobId,
          owner_type = :ownerType,
          owner_id = :ownerId,
          operation_kind = :kind,
          status = :status,
          message = :message,
          progress = :progress,
          lease_payload = :payload,
          heartbeat_at = SYSTIMESTAMP,
          lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'),
          updated_at = SYSTIMESTAMP
      WHERE lock_id = 1 AND lease_token = :leaseToken
    `, {
      jobId: next.jobId,
      ownerType: next.ownerType || null,
      ownerId: next.ownerId || null,
      kind: next.kind,
      status: next.status,
      message: next.message,
      progress: Number(next.progress || 0),
      payload: jsonBind(next),
      leaseSeconds: LEASE_SECONDS,
      leaseToken: next.leaseToken,
    }, { autoCommit: false });
    if (Number(updateResult.rowsAffected || 0) !== 1) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return clone(next);
  });
}

function startOperationHeartbeat({
  jobId,
  leaseToken,
  ownerType,
  intervalMillis = HEARTBEAT_MILLIS,
  scheduleInterval = setInterval,
  cancelInterval = clearInterval,
}) {
  if (!leaseToken) {
    throw new Error('Dataset lease heartbeat requires an exact leaseToken.');
  }
  if (ownerType === VALIDATION_OWNER_TYPE) {
    activeValidationLeaseTokens.add(leaseToken);
  }
  const abortController = new AbortController();
  let stopped = false;
  let tail = Promise.resolve();
  let ownershipError = null;

  function loseOwnership(error) {
    if (!ownershipError) {
      ownershipError = error instanceof DatasetOperationOwnershipLostError
        ? error
        : new DatasetOperationOwnershipLostError(
          'Dataset operation heartbeat could not prove exact lease ownership.',
          { jobId, leaseToken, cause: error }
        );
      abortController.abort(ownershipError);
    }
    return ownershipError;
  }

  function assertOwned() {
    if (ownershipError || abortController.signal.aborted) {
      throw ownershipError || abortController.signal.reason;
    }
    return true;
  }

  async function renew() {
    assertOwned();
    let updated;
    let lastError = null;
    for (let attempt = 1; attempt <= HEARTBEAT_RETRY_ATTEMPTS; attempt += 1) {
      try {
        updated = await updateOperation({
          jobId,
          leaseToken,
          heartbeatOnly: true,
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < HEARTBEAT_RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_RETRY_MILLIS));
        }
      }
    }
    // An unavailable/saturated database does not prove lease replacement.
    // Keep the worker alive and let the next heartbeat retry. Every publish
    // still calls assertOperationOwnershipInTransaction, whose locked token
    // and expiry check is the authoritative fail-closed ownership fence.
    if (lastError) return null;
    if (!updated) {
      throw loseOwnership(new DatasetOperationOwnershipLostError(
        'Dataset operation heartbeat found an expired or replacement lease.',
        { jobId, leaseToken }
      ));
    }
    return updated;
  }

  const timer = scheduleInterval(() => {
    if (stopped) return tail;
    tail = tail.then(renew).catch((error) => {
      loseOwnership(error);
    });
    return tail;
  }, intervalMillis);
  timer.unref?.();

  async function drain() {
    await tail;
    assertOwned();
  }

  async function stop() {
    stopped = true;
    cancelInterval(timer);
    await drain();
  }

  // Keep the legacy callable shape while exposing an explicit ownership
  // controller to new workflow code and regression tests.
  const heartbeat = async () => stop();
  return Object.assign(heartbeat, {
    jobId: jobId || null,
    leaseToken,
    signal: abortController.signal,
    assertOwned,
    loseOwnership,
    drain: drain,
    stop: stop,
  });
}

function classifyDatasetOperationOwner({
  operation,
  ownerStatus = '',
  recoveredJobIds = [],
  activeValidationTokens = activeValidationLeaseTokens,
} = {}) {
  if (!operation) return 'no_lease';
  if (operation.stale) return 'lease_expired';
  if (operation.ownerType === VALIDATION_OWNER_TYPE) {
    return activeValidationTokens.has(operation.leaseToken)
      ? 'owner_active'
      : 'owner_missing';
  }
  if (!operation.jobId) return 'owner_missing';
  if (recoveredJobIds.includes(operation.jobId)) return 'owner_recovered';
  const normalizedStatus = String(ownerStatus || '').toLowerCase();
  if (!normalizedStatus) return 'owner_missing';
  if (['completed', 'failed'].includes(normalizedStatus)) {
    return 'owner_terminal';
  }
  return 'owner_active';
}

async function endOperation(criteria = {}) {
  if (!criteria.leaseToken) {
    throw new Error('Dataset lease release requires the exact leaseToken.');
  }
  try {
    return await withConnection(async (connection) => {
      const current = await selectLock(connection, true);
      if (!current
          || criteria.leaseToken !== current.leaseToken
          || (criteria.jobId && criteria.jobId !== current.jobId)) return null;
      const result = await connection.execute(`
        UPDATE app_dataset_operation_lock
        SET lease_token = NULL, owner_job_id = NULL,
            owner_type = NULL, owner_id = NULL, operation_kind = NULL,
            status = NULL, message = NULL, progress = NULL, lease_payload = NULL,
            acquired_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL,
            updated_at = SYSTIMESTAMP
        WHERE lock_id = 1
          AND lease_token = :leaseToken
      `, { leaseToken: current.leaseToken }, { autoCommit: false });
      if (Number(result.rowsAffected || 0) !== 1) {
        await connection.rollback();
        return null;
      }
      await connection.commit();
      return current;
    });
  } finally {
    activeValidationLeaseTokens.delete(criteria.leaseToken);
  }
}

async function reconcileDatasetOperationLock({ recoveredJobIds = [] } = {}) {
  return withConnection(async (connection) => {
    const current = await selectLock(connection, true);
    if (!current) {
      await connection.rollback();
      return { released: false, reason: 'no_lease', operation: null };
    }

    let ownerStatus = '';
    if (current.jobId
        && !current.stale
        && !recoveredJobIds.includes(current.jobId)) {
      const owner = await connection.execute(`
        SELECT status
        FROM app_dataset_jobs
        WHERE job_id = :jobId
      `, { jobId: current.jobId }, {
        outFormat: db.oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
      });
      ownerStatus = owner.rows?.[0]?.STATUS || '';
    }
    // Validation owners are durable in the Oracle lease payload and remain
    // live only while this process owns the exact token. A restarted process
    // has an empty registry and can immediately reclaim a crashed validation.
    const reason = classifyDatasetOperationOwner({
      operation: current,
      ownerStatus,
      recoveredJobIds,
    });

    if (reason !== 'owner_active') {
      await connection.execute(`
        UPDATE app_dataset_operation_lock
        SET lease_token = NULL, owner_job_id = NULL,
            owner_type = NULL, owner_id = NULL, operation_kind = NULL,
            status = NULL, message = NULL, progress = NULL, lease_payload = NULL,
            acquired_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL,
            updated_at = SYSTIMESTAMP
        WHERE lock_id = 1 AND lease_token = :leaseToken
      `, { leaseToken: current.leaseToken }, { autoCommit: false });
      await connection.commit();
      activeValidationLeaseTokens.delete(current.leaseToken);
      return { released: true, reason, operation: current };
    }
    await connection.rollback();
    return { released: false, reason: 'owner_active', operation: current };
  });
}

async function releaseStaleDatasetOperationLock(options = {}) {
  return reconcileDatasetOperationLock(options);
}

module.exports = {
  DatasetOperationOwnershipLostError,
  assertOperationOwnershipInTransaction,
  beginOperationInTransaction,
  beginOperation,
  updateOperation,
  endOperation,
  getActiveOperation,
  startOperationHeartbeat,
  reconcileDatasetOperationLock,
  releaseStaleDatasetOperationLock,
  classifyDatasetOperationOwner,
};
