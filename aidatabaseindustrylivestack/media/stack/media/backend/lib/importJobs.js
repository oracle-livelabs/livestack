const db = require('../config/database');
const {
  enqueueDatasetEventInTransaction,
  scheduleDatasetEventDelivery,
} = require('./datasetEventOutbox');
const {
  beginOperationInTransaction,
  assertOperationOwnershipInTransaction,
  getActiveOperation,
} = require('./datasetOperationLock');

const SYSTEM_IDENTITY = process.env.SYSTEM_SECURITY_CONTEXT_USER || 'admin_jess';

const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const jsonBind = (value) => ({ val: clone(value), type: db.oracledb.DB_TYPE_JSON });
const nowIso = () => new Date().toISOString();

function payloadFromRow(row) {
  const payload = row?.PAYLOAD;
  return typeof payload === 'string' ? JSON.parse(payload) : clone(payload);
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'durable Media dataset job' });
  }
}

function buildJob(metadata = {}) {
  const jobId = `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = nowIso();
  return {
    jobId,
    candidateGenerationId: `candidate-${jobId}`,
    status: 'queued',
    phase: 'queued',
    progress: 0,
    message: 'Import queued',
    warnings: [],
    errors: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...metadata,
  };
}

async function insertJobInTransaction(connection, job, {
  testDeliveryFault = null,
} = {}) {
  await connection.execute(`
    INSERT INTO app_dataset_jobs(
      job_id, operation, status, phase, candidate_generation_id, progress,
      message, payload, created_at, updated_at, heartbeat_at
    ) VALUES (
      :jobId, :operation, :status, :phase, :candidateGenerationId, :progress,
      :message, :payload, SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
    )
  `, {
    jobId: job.jobId,
    operation: String(job.operation || 'dataset_operation'),
    status: job.status,
    phase: job.phase,
    candidateGenerationId: job.candidateGenerationId,
    progress: job.progress,
    message: job.message,
    payload: jsonBind(job),
  }, { autoCommit: false });
  await connection.execute(`
    INSERT INTO app_dataset_attempts(
      job_id, candidate_generation_id, attempted_version, phase, status,
      created_at, updated_at
    ) VALUES(
      :jobId, :candidateGenerationId, :attemptedVersion, 'queued', 'queued',
      SYSTIMESTAMP, SYSTIMESTAMP
    )
  `, {
    jobId: job.jobId,
    candidateGenerationId: job.candidateGenerationId,
    attemptedVersion: job.datasetVersion || null,
  }, { autoCommit: false });
  await enqueueDatasetEventInTransaction(connection, {
    jobId: job.jobId,
    generationId: job.candidateGenerationId,
    operation: job.operation === 'restore_demo' ? 'restore' : 'refresh',
    status: 'requested',
    datasetVersion: job.datasetVersion || null,
    _testDeliveryFault: testDeliveryFault,
  });
}

async function createJob(metadata = {}) {
  const job = buildJob(metadata);
  await withConnection(async (connection) => {
    await insertJobInTransaction(connection, job);
    await connection.commit();
  });
  scheduleDatasetEventDelivery();
  return clone(job);
}

async function createJobWithOperation(metadata = {}, operationMetadata = {}) {
  const job = buildJob(metadata);
  const admission = await withConnection(async (connection) => {
    const lockAdmission = await beginOperationInTransaction(connection, {
      kind: operationMetadata.kind || job.operation,
      message: operationMetadata.message || job.message,
      status: operationMetadata.status || 'queued',
      progress: Number(operationMetadata.progress || 0),
      jobId: job.jobId,
    });
    if (!lockAdmission.operation) {
      await connection.rollback();
      return {
        job: null,
        operation: null,
        activeOperation: lockAdmission.activeOperation,
        contention: lockAdmission.contention,
      };
    }
    await insertJobInTransaction(connection, job, {
      testDeliveryFault: operationMetadata.testDeliveryFault || null,
    });
    // Lease ownership, job, attempt, and requested lifecycle intent become
    // durable together. There is no committed owner-less admission window.
    await connection.commit();
    return {
      job: clone(job),
      operation: lockAdmission.operation,
      activeOperation: null,
      contention: false,
    };
  });
  if (!admission.job && admission.contention && !admission.activeOperation) {
    // A NOWAIT loser can observe row-lock contention just before the winner's
    // admission commit is visible. Resolve that committed owner without ever
    // allocating a loser job, attempt, or lifecycle event.
    for (let attempt = 0; attempt < 50 && !admission.activeOperation; attempt += 1) {
      admission.activeOperation = await getActiveOperation();
      if (!admission.activeOperation) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }
  if (admission.job) scheduleDatasetEventDelivery();
  return admission;
}

async function getJob(jobId) {
  return withConnection(async (connection) => {
    const result = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) payload
       FROM app_dataset_jobs WHERE job_id = :jobId`,
      { jobId },
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    return payloadFromRow(result.rows?.[0]);
  });
}

async function updateJob(jobId, patch = {}, ownership = null) {
  return withConnection(async (connection) => {
    ownership?.assertOwned?.();
    const result = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) payload
       FROM app_dataset_jobs WHERE job_id = :jobId FOR UPDATE`,
      { jobId },
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const current = payloadFromRow(result.rows?.[0]);
    if (!current) return null;
    let activeGenerationCommitted = false;
    if (String(patch.status || '').toLowerCase() === 'failed') {
      const readiness = await connection.execute(`
        SELECT status
        FROM app_dataset_readiness
        WHERE readiness_id = 1 AND job_id = :jobId
      `, { jobId }, {
        outFormat: db.oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
      });
      const readinessStatus = String(readiness.rows?.[0]?.STATUS || '').toUpperCase();
      activeGenerationCommitted = ['STABILIZING', 'ACTIVE'].includes(readinessStatus);
      if (activeGenerationCommitted) {
        patch = {
          ...patch,
          status: readinessStatus === 'ACTIVE' ? 'completed' : 'running',
          phase: readinessStatus === 'ACTIVE' ? 'activated' : 'stabilizing',
          message: readinessStatus === 'ACTIVE'
            ? 'Dataset is active; post-activation reporting will retry.'
            : 'Dataset generation is committed and awaiting durable feature stabilization.',
          warnings: [
            ...(current.warnings || []),
            String(patch.message || 'Post-activation reporting failed; retry scheduled.'),
          ],
          errors: current.errors || [],
          activeGenerationCommitted: true,
        };
      }
    }
    const next = {
      ...current,
      ...patch,
      warnings: Array.isArray(patch.warnings) ? patch.warnings : (current.warnings || []),
      errors: Array.isArray(patch.errors) ? patch.errors : (current.errors || []),
      updatedAt: nowIso(),
    };
    next.phase = String(patch.phase || current.phase || next.status || 'queued').toLowerCase();
    await connection.execute(`
      UPDATE app_dataset_jobs
      SET status = :status,
          phase = :phase,
          progress = :progress,
          message = :message,
          payload = :payload,
          updated_at = SYSTIMESTAMP,
          heartbeat_at = SYSTIMESTAMP,
          started_at = CASE WHEN :status = 'running' AND started_at IS NULL
                            THEN SYSTIMESTAMP ELSE started_at END,
          completed_at = CASE WHEN :status IN ('completed', 'failed')
                              THEN SYSTIMESTAMP ELSE completed_at END
      WHERE job_id = :jobId
    `, {
      status: String(next.status || 'queued').toLowerCase(),
      phase: next.phase,
      progress: Math.max(0, Math.min(100, Number(next.progress || 0))),
      message: String(next.message || '').slice(0, 1000),
      payload: jsonBind(next),
      jobId,
    }, { autoCommit: false });
    await connection.execute(`
      UPDATE app_dataset_attempts
      SET phase = :phase, status = :status, updated_at = SYSTIMESTAMP,
          completed_at = CASE WHEN :status IN ('completed', 'failed')
                              THEN SYSTIMESTAMP ELSE completed_at END
      WHERE job_id = :jobId
    `, {
      phase: next.phase,
      status: String(next.status || 'queued').toLowerCase(),
      jobId,
    }, { autoCommit: false });
    if (String(next.status).toLowerCase() === 'failed' && !activeGenerationCommitted) {
      await enqueueDatasetEventInTransaction(connection, {
        jobId,
        generationId: current.candidateGenerationId || `candidate-${jobId}`,
        operation: current.operation === 'restore_demo' ? 'restore' : 'refresh',
        status: 'failed',
        datasetVersion: current.datasetVersion || null,
        errorCategory: patch.errorCategory || patch.details?.failurePhase || 'required_feature_failure',
      });
    }
    if (ownership) {
      ownership.assertOwned?.();
      await assertOperationOwnershipInTransaction(connection, {
        jobId,
        leaseToken: ownership.leaseToken,
      });
    }
    await connection.commit();
    scheduleDatasetEventDelivery();
    return clone(next);
  });
}

async function appendJobWarnings(jobId, warnings = [], ownership = null) {
  const job = await getJob(jobId);
  if (!job || !warnings.length) return job;
  return updateJob(jobId, { warnings: [...(job.warnings || []), ...warnings] }, ownership);
}

async function appendJobErrors(jobId, errors = [], ownership = null) {
  const job = await getJob(jobId);
  if (!job || !errors.length) return job;
  return updateJob(jobId, { errors: [...(job.errors || []), ...errors] }, ownership);
}

function partitionRecoverableDatasetJobs(jobs = [], { activeJobIds = [] } = {}) {
  const activeJobIdsSet = new Set(activeJobIds.filter(Boolean).map(String));
  return {
    activeJobs: jobs.filter((job) => activeJobIdsSet.has(String(job?.jobId || ''))),
    recoverableJobs: jobs.filter((job) => !activeJobIdsSet.has(String(job?.jobId || ''))),
  };
}

async function recoverOrphanedDatasetJobs({ activeJobIds = [] } = {}) {
  const jobs = await withConnection(async (connection) => {
    const result = await connection.execute(`
      SELECT JSON_SERIALIZE(payload RETURNING CLOB) payload
      FROM app_dataset_jobs
      WHERE status IN ('queued', 'running')
      ORDER BY created_at
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    return (result.rows || []).map(payloadFromRow);
  });
  const activeJobIdsSet = new Set(activeJobIds.filter(Boolean).map(String));
  const stabilizingJobIds = [];
  const recoveredJobIds = [];
  const skippedActiveJobIds = [];
  for (const job of jobs) {
    if (activeJobIdsSet.has(String(job.jobId))) {
      skippedActiveJobIds.push(job.jobId);
      continue;
    }
    const readiness = await withConnection(async (connection) => connection.execute(`
      SELECT status FROM app_dataset_readiness
      WHERE readiness_id = 1 AND job_id = :jobId
    `, { jobId: job.jobId }, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    }));
    if (String(readiness.rows?.[0]?.STATUS || '').toUpperCase() === 'STABILIZING') {
      stabilizingJobIds.push(job.jobId);
      continue;
    }
    const message = 'Application restart rolled back the interrupted uncommitted dataset transaction.';
    await updateJob(job.jobId, {
      status: 'failed',
      phase: 'recovered_after_restart',
      progress: 100,
      message,
      errors: [...(job.errors || []), message],
      recovery: {
        recoverable: false,
        activeDatasetPreserved: true,
        reason: 'APPLICATION_RESTART',
        recoveredAt: nowIso(),
      },
      errorCategory: 'APPLICATION_RESTART',
    });
    recoveredJobIds.push(job.jobId);
  }
  return {
    recovered: recoveredJobIds.length,
    jobIds: recoveredJobIds,
    stabilizingJobIds,
    skippedActiveJobIds,
  };
}

module.exports = {
  createJob,
  createJobWithOperation,
  updateJob,
  appendJobWarnings,
  appendJobErrors,
  getJob,
  partitionRecoverableDatasetJobs,
  recoverOrphanedDatasetJobs,
};
