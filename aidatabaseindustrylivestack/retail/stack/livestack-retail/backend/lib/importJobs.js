const db = require('../config/database');
const {
  eventIdFor,
  enqueueOnConnection,
} = require('./datasetEventOutbox');
const {
  claimOperationOnConnection,
} = require('./datasetOperationLock');

const JOB_TABLE = 'APP_DATASET_JOBS';
const SYSTEM_IDENTITY = 'admin_jess';

const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const nowIso = () => new Date().toISOString();
const jsonBind = (value) => ({ val: clone(value), type: db.oracledb.DB_TYPE_JSON });
const payloadFromRow = (row) => {
  if (!row) return null;
  const payload = row.PAYLOAD ?? row.payload;
  return typeof payload === 'string' ? JSON.parse(payload) : clone(payload);
};

function buildJob(metadata = {}) {
  const jobId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = nowIso();
  return {
    jobId,
    status: 'queued',
    progress: 0,
    message: 'Import queued',
    warnings: [],
    errors: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...metadata,
  };
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
    await db.releaseConnection(connection, { rollback: true, label: 'durable import job' });
  }
}

async function insertJobOnConnection(connection, job) {
  await connection.execute(`
      INSERT INTO ${JOB_TABLE} (
        job_id, operation, status, progress, message, payload, created_at, updated_at
      ) VALUES (
        :jobId, :operation, :status, :progress, :message, :payload, SYSTIMESTAMP, SYSTIMESTAMP
      )
    `, {
      jobId: job.jobId,
      operation: String(job.operation || 'dataset_operation'),
      status: job.status,
      progress: Number(job.progress || 0),
      message: job.message,
      payload: jsonBind(job),
    }, { autoCommit: false });
  return clone(job);
}

async function createJob(metadata = {}) {
  const job = buildJob(metadata);
  await withConnection(async (connection) => {
    await insertJobOnConnection(connection, job);
    await connection.commit();
  });
  return clone(job);
}

async function createJobWithRequestedIntent(metadata = {}, eventContext = {}) {
  return withConnection(async (connection) => {
    const job = buildJob(metadata);
    const generationPrefix = String(eventContext.generationPrefix || '');
    if (generationPrefix) {
      job.candidateGeneration = `${generationPrefix}${job.jobId}`;
    }
    await insertJobOnConnection(connection, job);
    const { generationPrefix: _generationPrefix, ...deliveryContext } = eventContext;
    const requested = await enqueueOnConnection(connection, {
      ...deliveryContext,
      eventId: eventIdFor(job.jobId, 'requested'),
      jobId: job.jobId,
      operation: eventContext.operation || job.operation,
      datasetSource: eventContext.datasetSource || job.datasetSource,
      datasetVersion: eventContext.datasetVersion || job.datasetVersion,
      status: 'requested',
    });
    // Accepting the durable job and its requested delivery intent is one
    // Oracle transaction. Neither record can survive without the other.
    await connection.commit();
    return { job: clone(job), requested };
  });
}

async function createJobWithRequestedIntentAndLease(
  metadata = {},
  eventContext = {},
  operationMetadata = {}
) {
  return withConnection(async (connection) => {
    // Allocate the durable owner ID before touching the singleton lease. The
    // lease, queued job, and requested outbox intent then share one Oracle
    // transaction and therefore become visible together or not at all.
    const job = buildJob(metadata);
    const generationPrefix = String(eventContext.generationPrefix || '');
    if (generationPrefix) {
      job.candidateGeneration = `${generationPrefix}${job.jobId}`;
    }

    const lease = await claimOperationOnConnection(connection, {
      kind: operationMetadata.kind || job.operation,
      message: operationMetadata.message || job.message,
      status: operationMetadata.status || 'queued',
      progress: Number(operationMetadata.progress || 0),
      ...operationMetadata,
      jobId: job.jobId,
    });
    if (!lease) {
      await connection.rollback();
      return null;
    }

    await insertJobOnConnection(connection, job);
    const { generationPrefix: _generationPrefix, ...deliveryContext } = eventContext;
    const requested = await enqueueOnConnection(connection, {
      ...deliveryContext,
      eventId: eventIdFor(job.jobId, 'requested'),
      jobId: job.jobId,
      operation: eventContext.operation || job.operation,
      datasetSource: eventContext.datasetSource || job.datasetSource,
      datasetVersion: eventContext.datasetVersion || job.datasetVersion,
      status: 'requested',
    });
    await connection.commit();
    return {
      job: clone(job),
      requested,
      lease: clone(lease),
    };
  });
}

async function getJob(jobId) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) AS payload
       FROM ${JOB_TABLE}
       WHERE job_id = :jobId`,
      { jobId },
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    return payloadFromRow(result.rows?.[0]);
  });
}

async function updateJobOnConnection(connection, jobId, patch = {}) {
  const result = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) AS payload
       FROM ${JOB_TABLE}
       WHERE job_id = :jobId
       FOR UPDATE`,
      { jobId },
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
  const existing = payloadFromRow(result.rows?.[0]);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
    warnings: Array.isArray(patch.warnings) ? patch.warnings : (existing.warnings || []),
    errors: Array.isArray(patch.errors) ? patch.errors : (existing.errors || []),
    updatedAt: nowIso(),
  };
  await connection.execute(`
      UPDATE ${JOB_TABLE}
      SET status = :status,
          progress = :progress,
          message = :message,
          payload = :payload,
          updated_at = SYSTIMESTAMP,
          started_at = CASE WHEN :status = 'running' AND started_at IS NULL THEN SYSTIMESTAMP ELSE started_at END,
          completed_at = CASE WHEN :status IN ('completed','failed') THEN SYSTIMESTAMP ELSE completed_at END
      WHERE job_id = :jobId
    `, {
      status: String(next.status || 'queued').toLowerCase(),
      progress: Math.max(0, Math.min(100, Number(next.progress || 0))),
      message: String(next.message || '').slice(0, 1000),
      payload: jsonBind(next),
      jobId,
    }, { autoCommit: false });
  return clone(next);
}

async function updateJob(jobId, patch = {}) {
  return withConnection(async (connection) => {
    const next = await updateJobOnConnection(connection, jobId, patch);
    if (!next) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return next;
  });
}

async function failJobWithIntent(jobId, patch = {}, eventContext = {}) {
  return withConnection(async (connection) => {
    const job = await updateJobOnConnection(connection, jobId, {
      ...patch,
      status: 'failed',
      progress: 100,
    });
    if (!job) throw new Error(`Cannot fail missing dataset job ${jobId}.`);
    const failed = await enqueueOnConnection(connection, {
      ...eventContext,
      eventId: eventIdFor(jobId, 'failed'),
      jobId,
      operation: eventContext.operation || job.operation,
      datasetSource: eventContext.datasetSource || job.datasetSource,
      datasetVersion: eventContext.datasetVersion || job.datasetVersion,
      status: 'failed',
    });
    // Durable terminal failure and failed delivery intent share one commit.
    await connection.commit();
    return { job, failed };
  });
}

async function appendJobWarnings(jobId, warnings = []) {
  const job = await getJob(jobId);
  return job ? updateJob(jobId, { warnings: [...(job.warnings || []), ...warnings] }) : null;
}

async function appendJobErrors(jobId, errors = []) {
  const job = await getJob(jobId);
  return job ? updateJob(jobId, { errors: [...(job.errors || []), ...errors] }) : null;
}

async function getInterruptedJobs() {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) AS payload
       FROM ${JOB_TABLE}
       WHERE status IN ('queued','running')
       ORDER BY created_at`,
      {},
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    return (result.rows || []).map(payloadFromRow);
  });
}

async function recoverOrphanedDatasetJobs() {
  const interrupted = await getInterruptedJobs();
  for (const job of interrupted) {
    const message = 'Application restart interrupted this dataset operation before terminal readiness.';
    await failJobWithIntent(job.jobId, {
      status: 'failed',
      progress: 100,
      message,
      errors: [...(job.errors || []), message],
      phase: 'FAILED_ON_RESTART',
      recovery: {
        activeGenerationChanged: false,
        candidateGeneration: job.candidateGeneration || null,
        reason: 'APPLICATION_RESTART',
        recoveredAt: nowIso(),
      },
    }, {
      operation: job.operation,
      datasetSource: job.datasetSource || null,
      datasetVersion: job.datasetVersion || 'v1',
      errorCategory: 'APPLICATION_RESTART',
      objectStorageFailure: job.testObjectStorageFailure || null,
    });
  }
  return {
    recovered: interrupted.length,
    jobIds: interrupted.map((job) => job.jobId),
    jobs: interrupted,
  };
}

module.exports = {
  createJob,
  createJobWithRequestedIntent,
  createJobWithRequestedIntentAndLease,
  updateJob,
  failJobWithIntent,
  appendJobWarnings,
  appendJobErrors,
  getJob,
  getInterruptedJobs,
  recoverOrphanedDatasetJobs,
};
