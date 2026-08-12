/*
 * Oracle-backed singleton lease for destructive dataset operations.
 * There is deliberately no process-local state here: a new Node worker can
 * inspect and fence work left by a stopped worker.
 */
const crypto = require('crypto');
const db = require('../config/database');

const TABLE_NAME = 'APP_DATASET_OPERATION_LOCK';
const DEFAULT_LEASE_SECONDS = Math.max(60, Number(process.env.DATASET_OPERATION_LEASE_SECONDS || 1800));

function clone(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }

function normalizeRow(row) {
  if (!row || !row.LEASE_TOKEN) return null;
  return {
    leaseToken: row.LEASE_TOKEN,
    jobId: row.OWNER_JOB_ID || null,
    kind: row.OPERATION_KIND || null,
    status: row.STATUS || null,
    message: row.MESSAGE || null,
    progress: Number(row.PROGRESS || 0),
    leaseExpiresAt: row.LEASE_EXPIRES_AT instanceof Date ? row.LEASE_EXPIRES_AT.toISOString() : row.LEASE_EXPIRES_AT,
    stale: Number(row.IS_STALE || 0) === 1,
  };
}

async function withConnection(work) {
  let connection;
  try { connection = await db.getConnection(); await ensureTable(connection); return await work(connection); }
  finally { if (connection) try { await connection.close(); } catch (_) {} }
}

async function ensureTable(connection) {
  const exists = await connection.execute(`SELECT COUNT(*) AS cnt FROM user_tables WHERE table_name = :tableName`, { tableName: TABLE_NAME }, { autoCommit: false });
  if (!Number(exists.rows[0]?.CNT || 0)) {
    await connection.execute(`CREATE TABLE app_dataset_operation_lock (
      lock_id NUMBER(1) PRIMARY KEY CHECK (lock_id = 1),
      lease_token VARCHAR2(100), owner_job_id VARCHAR2(80), operation_kind VARCHAR2(40),
      status VARCHAR2(20), message VARCHAR2(1000), progress NUMBER(3),
      acquired_at TIMESTAMP, heartbeat_at TIMESTAMP, lease_expires_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`, {}, { autoCommit: false });
  }
  await connection.execute(`MERGE INTO app_dataset_operation_lock target USING (SELECT 1 AS lock_id FROM dual) source
    ON (target.lock_id = source.lock_id) WHEN NOT MATCHED THEN INSERT (lock_id, updated_at) VALUES (source.lock_id, SYSTIMESTAMP)`, {}, { autoCommit: false });
}

const SELECT_LOCK = `SELECT lease_token, owner_job_id, operation_kind, status, message, progress, lease_expires_at,
  CASE WHEN lease_token IS NOT NULL AND lease_expires_at <= SYSTIMESTAMP THEN 1 ELSE 0 END AS is_stale
  FROM app_dataset_operation_lock WHERE lock_id = 1`;

async function getActiveOperation() {
  return withConnection(async (connection) => {
    const result = await connection.execute(SELECT_LOCK, {}, { autoCommit: false });
    const operation = normalizeRow(result.rows[0]);
    return operation?.stale ? null : operation;
  });
}

async function beginOperationOnConnection(connection, metadata = {}) {
  await ensureTable(connection);
  const leaseToken = metadata.leaseToken || crypto.randomUUID();
  const leaseSeconds = Math.max(60, Number(metadata.leaseSeconds || DEFAULT_LEASE_SECONDS));
  let result;
  try {
    result = await connection.execute(`${SELECT_LOCK} FOR UPDATE NOWAIT`, {}, { autoCommit: false });
  } catch (error) {
    if (/ORA-00054/.test(String(error.message || ''))) return null;
    throw error;
  }
  const active = normalizeRow(result.rows[0]);
  if (active && !active.stale) return null;
  const operation = {
    kind: metadata.kind || 'dataset_operation',
    message: metadata.message || 'Dataset operation in progress.',
    status: metadata.status || 'running',
    progress: Number(metadata.progress || 0),
    jobId: metadata.jobId || null,
    leaseToken,
    leaseSeconds,
  };
  await connection.execute(`UPDATE app_dataset_operation_lock SET lease_token = :leaseToken, owner_job_id = :jobId,
    operation_kind = :kind, status = :status, message = :message, progress = :progress,
    acquired_at = SYSTIMESTAMP, heartbeat_at = SYSTIMESTAMP,
    lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'), updated_at = SYSTIMESTAMP WHERE lock_id = 1`, operation, { autoCommit: false });
  return clone(operation);
}

async function beginOperation(metadata = {}) {
  return withConnection(async (connection) => {
    const operation = await beginOperationOnConnection(connection, metadata);
    if (!operation) return null;
    await connection.commit();
    return operation;
  });
}

async function updateOperation(patch = {}) {
  if (!patch.leaseToken) return null;
  return withConnection(async (connection) => {
    const leaseSeconds = Math.max(60, Number(patch.leaseSeconds || DEFAULT_LEASE_SECONDS));
    const result = await connection.execute(`UPDATE app_dataset_operation_lock SET owner_job_id = COALESCE(:jobId, owner_job_id),
      status = COALESCE(:status, status), message = COALESCE(:message, message), progress = COALESCE(:progress, progress),
      heartbeat_at = SYSTIMESTAMP, lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'), updated_at = SYSTIMESTAMP
      WHERE lock_id = 1 AND lease_token = :leaseToken AND lease_expires_at > SYSTIMESTAMP`, { ...patch, leaseSeconds }, { autoCommit: false });
    if (!result.rowsAffected) return null;
    await connection.commit();
    return getActiveOperation();
  });
}

async function endOperationOnConnection(connection, criteria = {}) {
  if (!criteria.leaseToken) return null;
  await ensureTable(connection);
  const result = await connection.execute(`UPDATE app_dataset_operation_lock SET lease_token = NULL, owner_job_id = NULL,
    operation_kind = NULL, status = NULL, message = NULL, progress = NULL, acquired_at = NULL, heartbeat_at = NULL,
    lease_expires_at = NULL, updated_at = SYSTIMESTAMP WHERE lock_id = 1 AND lease_token = :leaseToken
    AND (:jobId IS NULL OR owner_job_id = :jobId)`, { leaseToken: criteria.leaseToken, jobId: criteria.jobId || null }, { autoCommit: false });
  return result.rowsAffected || 0;
}

async function endOperation(criteria = {}) {
  return withConnection(async (connection) => {
    const rowsAffected = await endOperationOnConnection(connection, criteria);
    if (!rowsAffected) return null;
    await connection.commit();
    return true;
  });
}

module.exports = {
  beginOperation,
  beginOperationOnConnection,
  updateOperation,
  endOperation,
  endOperationOnConnection,
  getActiveOperation,
  ensureTable,
};
