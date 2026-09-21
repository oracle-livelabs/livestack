const crypto = require('crypto');
const db = require('../config/database');

const TABLE = 'APP_DATASET_OPERATION_LOCK';
const SYSTEM_IDENTITY = 'admin_jess';
const LEASE_SECONDS = Math.max(60, Number.parseInt(process.env.DATASET_OPERATION_LEASE_SECONDS || '1800', 10));
const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const jsonBind = (value) => ({ val: clone(value), type: db.oracledb.DB_TYPE_JSON });

class DatasetLeaseOwnershipLostError extends Error {
  constructor(message = 'Dataset operation lease ownership was lost.') {
    super(message);
    this.name = 'DatasetLeaseOwnershipLostError';
    this.code = 'DATASET_LEASE_OWNERSHIP_LOST';
  }
}

function requireLeaseToken(value, action) {
  const leaseToken = String(value || '').trim();
  if (!leaseToken) {
    throw new Error(`A dataset operation lease token is required to ${action}.`);
  }
  return leaseToken;
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    throw error;
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'dataset operation lock' });
  }
}

function fromRow(row) {
  if (!row?.LEASE_TOKEN) return null;
  const raw = row.LEASE_PAYLOAD;
  const payload = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
  return {
    ...(payload || {}),
    leaseToken: row.LEASE_TOKEN,
    jobId: row.OWNER_JOB_ID || payload?.jobId || null,
    stale: Number(row.IS_STALE || 0) === 1,
  };
}

async function claimOperationOnConnection(connection, metadata = {}) {
  const ownerJobId = String(metadata.jobId || '').trim();
  if (!ownerJobId) {
    throw new Error('A durable owner job or validation operation ID is required for the dataset lease.');
  }
  const leaseToken = metadata.leaseToken || crypto.randomUUID();
  let result;
  try {
    result = await connection.execute(`
      SELECT lease_token, owner_job_id, lease_payload,
             CASE WHEN lease_token IS NOT NULL AND lease_expires_at <= SYSTIMESTAMP THEN 1 ELSE 0 END is_stale
      FROM ${TABLE} WHERE lock_id = 1 FOR UPDATE NOWAIT
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  } catch (error) {
    if (/ORA-00054/.test(String(error?.message || ''))) return null;
    throw error;
  }
  const current = fromRow(result.rows?.[0]);
  if (current && !current.stale) return null;
  const operation = {
    kind: metadata.kind || 'dataset_operation',
    message: metadata.message || 'Dataset operation in progress.',
    status: metadata.status || 'running',
    progress: Number(metadata.progress || 0),
    ...metadata,
    jobId: ownerJobId,
    leaseToken,
  };
  const updated = await connection.execute(`
    UPDATE ${TABLE}
    SET lease_token = :leaseToken, owner_job_id = :jobId,
        operation_kind = :kind, status = :status, message = :message,
        progress = :progress, lease_payload = :payload,
        acquired_at = SYSTIMESTAMP, heartbeat_at = SYSTIMESTAMP,
        lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'),
        updated_at = SYSTIMESTAMP
    WHERE lock_id = 1
  `, {
    leaseToken,
    jobId: ownerJobId,
    kind: operation.kind,
    status: operation.status,
    message: operation.message,
    progress: operation.progress,
    payload: jsonBind(operation),
    leaseSeconds: LEASE_SECONDS,
  }, { autoCommit: false });
  if (Number(updated.rowsAffected || 0) !== 1) {
    throw new Error('Dataset operation lease singleton is unavailable.');
  }
  return clone(operation);
}

async function getActiveOperation() {
  return withConnection(async (connection) => {
    const result = await connection.execute(`
      SELECT lease_token, owner_job_id, lease_payload,
             CASE WHEN lease_token IS NOT NULL AND lease_expires_at <= SYSTIMESTAMP THEN 1 ELSE 0 END is_stale
      FROM ${TABLE} WHERE lock_id = 1
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    const operation = fromRow(result.rows?.[0]);
    return operation?.stale ? null : operation;
  });
}

async function beginOperation(metadata = {}) {
  return withConnection(async (connection) => {
    const operation = await claimOperationOnConnection(connection, metadata);
    if (!operation) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return operation;
  });
}

async function updateOperation(patch = {}) {
  if (!patch.leaseToken) {
    throw new Error('A dataset operation lease token is required to update or heartbeat a lease.');
  }
  const leaseToken = requireLeaseToken(patch.leaseToken, 'update or heartbeat a lease');
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT lease_token, owner_job_id, lease_payload, 0 is_stale FROM ${TABLE} WHERE lock_id = 1 FOR UPDATE`,
      {},
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const current = fromRow(result.rows?.[0]);
    if (!current
        || current.leaseToken !== leaseToken
        || (patch.jobId && current.jobId && patch.jobId !== current.jobId)) {
      await connection.rollback();
      return null;
    }
    const next = { ...current, ...patch, leaseToken: current.leaseToken };
    const updated = await connection.execute(`
      UPDATE ${TABLE}
      SET status = :status, message = :message, progress = :progress,
          lease_payload = :payload, heartbeat_at = SYSTIMESTAMP,
          lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'),
          updated_at = SYSTIMESTAMP
      WHERE lock_id = 1 AND lease_token = :leaseToken
    `, {
      status: next.status || 'running',
      message: next.message || 'Dataset operation in progress.',
      progress: Number(next.progress || 0),
      payload: jsonBind(next),
      leaseSeconds: LEASE_SECONDS,
      leaseToken,
    }, { autoCommit: false });
    if (Number(updated.rowsAffected || 0) !== 1) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return clone(next);
  });
}

function startOperationHeartbeat({
  leaseToken,
  jobId,
  intervalMs = Math.max(5000, Math.floor((LEASE_SECONDS * 1000) / 3)),
} = {}) {
  const requiredLeaseToken = requireLeaseToken(leaseToken, 'heartbeat a lease');
  let stopped = false;
  let inFlight = null;
  let ownershipError = null;

  const loseOwnership = (cause) => {
    if (!ownershipError) {
      const detail = cause?.message ? ` ${cause.message}` : '';
      ownershipError = new DatasetLeaseOwnershipLostError(
        `Dataset operation lease ${requiredLeaseToken} is no longer owned by this worker.${detail}`
      );
      if (cause) ownershipError.cause = cause;
    }
    return ownershipError;
  };

  const pulse = async () => {
    if (stopped) {
      if (ownershipError) throw ownershipError;
      return null;
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const updated = await updateOperation({
          leaseToken: requiredLeaseToken,
          jobId,
          heartbeat: true,
        });
        if (!updated) throw loseOwnership();
        return updated;
      } catch (error) {
        throw error instanceof DatasetLeaseOwnershipLostError
          ? error
          : loseOwnership(error);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const timer = setInterval(() => {
    void pulse().catch((error) => {
      console.warn(`Dataset operation heartbeat lost ownership: ${error.message}`);
    });
  }, intervalMs);
  timer.unref?.();

  return {
    leaseToken: requiredLeaseToken,
    async pulse() {
      return pulse();
    },
    assertOwned() {
      if (ownershipError) throw ownershipError;
      if (stopped) {
        throw new DatasetLeaseOwnershipLostError(
          'Dataset operation lease guard has already stopped.'
        );
      }
      return true;
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (inFlight) {
        try { await inFlight; } catch (_) {}
      }
    },
  };
}

async function endOperation(criteria = {}) {
  if (!criteria.leaseToken) {
    throw new Error('A dataset operation lease token is required to release a lease.');
  }
  const leaseToken = requireLeaseToken(criteria.leaseToken, 'release a lease');
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT lease_token, owner_job_id, lease_payload, 0 is_stale FROM ${TABLE} WHERE lock_id = 1 FOR UPDATE`,
      {},
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const current = fromRow(result.rows?.[0]);
    if (!current
        || current.leaseToken !== leaseToken
        || (criteria.jobId && current.jobId && criteria.jobId !== current.jobId)) {
      await connection.rollback();
      return null;
    }
    const cleared = await connection.execute(`
      UPDATE ${TABLE}
      SET lease_token = NULL, owner_job_id = NULL, operation_kind = NULL,
          status = NULL, message = NULL, progress = NULL, lease_payload = NULL,
          acquired_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL,
          updated_at = SYSTIMESTAMP
      WHERE lock_id = 1 AND lease_token = :leaseToken
    `, { leaseToken }, { autoCommit: false });
    if (Number(cleared.rowsAffected || 0) !== 1) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return current;
  });
}

async function releaseStaleDatasetOperationLock({ forceJobIds = [], force = false } = {}) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT lease_token, owner_job_id, lease_payload,
              CASE WHEN lease_token IS NOT NULL AND lease_expires_at <= SYSTIMESTAMP THEN 1 ELSE 0 END is_stale
       FROM ${TABLE} WHERE lock_id = 1 FOR UPDATE`,
      {},
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const current = fromRow(result.rows?.[0]);
    if (!current) return null;
    if (!force && !current.stale && !forceJobIds.includes(current.jobId)) return null;
    const cleared = await connection.execute(`
      UPDATE ${TABLE}
      SET lease_token = NULL, owner_job_id = NULL, operation_kind = NULL,
          status = NULL, message = NULL, progress = NULL, lease_payload = NULL,
          acquired_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL,
          updated_at = SYSTIMESTAMP
      WHERE lock_id = 1 AND lease_token = :leaseToken
    `, { leaseToken: current.leaseToken }, { autoCommit: false });
    if (Number(cleared.rowsAffected || 0) !== 1) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return current;
  });
}

const STARTUP_OWNER_STATES = Object.freeze([
  'missing',
  'queued',
  'running',
  'completed',
  'failed',
]);

async function reconcileDatasetOperationLockOnStartup() {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT lease_token, owner_job_id, lease_payload,
              CASE WHEN lease_token IS NOT NULL AND lease_expires_at <= SYSTIMESTAMP THEN 1 ELSE 0 END is_stale
       FROM ${TABLE} WHERE lock_id = 1 FOR UPDATE`,
      {},
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const current = fromRow(result.rows?.[0]);
    if (!current) {
      await connection.rollback();
      return { released: false, ownerState: 'missing', operation: null };
    }
    const owner = await connection.execute(`
      SELECT status
      FROM APP_DATASET_JOBS
      WHERE job_id = :jobId
    `, { jobId: current.jobId }, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
    const ownerState = String(owner.rows?.[0]?.STATUS || 'missing').toLowerCase();
    if (!STARTUP_OWNER_STATES.includes(ownerState)) {
      throw new Error(`Unsupported dataset lease owner state ${ownerState}.`);
    }

    // At process startup no JavaScript worker from the previous process can
    // still own the lease. Queued/running jobs are terminalized first by the
    // job recovery pass; missing, queued, running, completed, and failed
    // owners are all released deterministically rather than waiting for TTL.
    const cleared = await connection.execute(`
      UPDATE ${TABLE}
      SET lease_token = NULL, owner_job_id = NULL, operation_kind = NULL,
          status = NULL, message = NULL, progress = NULL, lease_payload = NULL,
          acquired_at = NULL, heartbeat_at = NULL, lease_expires_at = NULL,
          updated_at = SYSTIMESTAMP
      WHERE lock_id = 1 AND lease_token = :leaseToken
    `, { leaseToken: current.leaseToken }, { autoCommit: false });
    if (Number(cleared.rowsAffected || 0) !== 1) {
      await connection.rollback();
      return { released: false, ownerState, operation: current };
    }
    await connection.commit();
    return { released: true, ownerState, operation: current };
  });
}

module.exports = {
  claimOperationOnConnection,
  beginOperation,
  updateOperation,
  startOperationHeartbeat,
  endOperation,
  getActiveOperation,
  releaseStaleDatasetOperationLock,
  reconcileDatasetOperationLockOnStartup,
  DatasetLeaseOwnershipLostError,
  _private: {
    STARTUP_OWNER_STATES,
    fromRow,
    requireLeaseToken,
  },
};
