const db = require('../config/database');
const crypto = require('crypto');
const {
  beginOperationOnConnection,
  endOperationOnConnection,
  ensureTable: ensureOperationLockTable,
} = require('./datasetOperationLock');
const {
  ensureTable: ensureGenerationTable,
  createGenerationOnConnection,
  activateGenerationOnConnection,
  getGenerationOnConnection,
  assertRequiredFeatureEvidence,
} = require('./datasetGenerationStore');
const {
  ensureTable: ensureDatasetStateTable,
  readStoredState,
  saveDatasetStateOnConnection,
} = require('./datasetStateStore');

const TABLE_NAME = 'APP_DATASET_JOBS';

function nowIso() { return new Date().toISOString(); }
function json(value, fallback) { try { return JSON.stringify(value ?? fallback); } catch (_) { return JSON.stringify(fallback); } }
function parsed(value, fallback) { try { return value ? JSON.parse(String(value)) : fallback; } catch (_) { return fallback; } }
function requiredActor(value) {
  const actor = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(actor)) {
    const error = new Error('A persisted initiating dataset-admin actor is required.');
    error.code = 'DATASET_INITIATING_ACTOR_REQUIRED';
    throw error;
  }
  return actor;
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    jobId: row.JOB_ID,
    initiatingActor: row.INITIATING_ACTOR || null,
    status: row.STATUS,
    progress: Number(row.PROGRESS || 0),
    message: row.MESSAGE,
    operation: row.OPERATION,
    warnings: parsed(row.WARNINGS_JSON, []),
    errors: parsed(row.ERRORS_JSON, []),
    counts: parsed(row.COUNTS_JSON, null),
    summary: parsed(row.SUMMARY_JSON, null),
    activeDataset: parsed(row.ACTIVE_DATASET_JSON, null),
    details: parsed(row.DETAILS_JSON, null),
    generationId: row.GENERATION_ID || null,
    workerId: row.WORKER_ID || null,
    leaseToken: row.LEASE_TOKEN || null,
    createdAt: row.CREATED_AT instanceof Date ? row.CREATED_AT.toISOString() : row.CREATED_AT,
    updatedAt: row.UPDATED_AT instanceof Date ? row.UPDATED_AT.toISOString() : row.UPDATED_AT,
  };
}

async function ensureTable(connection) {
  const exists = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM user_tables WHERE table_name = :tableName`,
    { tableName: TABLE_NAME }, { autoCommit: false }
  );
  if (!Number(exists.rows[0]?.CNT || 0)) {
    await connection.execute(`
      CREATE TABLE app_dataset_jobs (
        job_id VARCHAR2(80) PRIMARY KEY,
        initiating_actor VARCHAR2(128) NOT NULL,
        status VARCHAR2(20) NOT NULL,
        progress NUMBER(3) NOT NULL,
        message VARCHAR2(1000) NOT NULL,
        operation VARCHAR2(40),
        warnings_json CLOB, errors_json CLOB, counts_json CLOB,
        summary_json CLOB, active_dataset_json CLOB, details_json CLOB,
        created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT app_dataset_jobs_status_ck CHECK (status IN ('queued', 'running', 'completed', 'failed'))
      )
    `, {}, { autoCommit: false });
  }

  const columns = [
    ['WORKER_ID', 'VARCHAR2(100)'],
    ['LEASE_TOKEN', 'VARCHAR2(100)'],
    ['LEASE_EXPIRES_AT', 'TIMESTAMP'],
    ['RECOVERY_JSON', 'CLOB'],
    ['GENERATION_ID', 'VARCHAR2(100)'],
    ['INITIATING_ACTOR', 'VARCHAR2(128)'],
  ];
  for (const [columnName, declaration] of columns) {
    const present = await connection.execute(`SELECT COUNT(*) AS cnt FROM user_tab_columns WHERE table_name = :tableName AND column_name = :columnName`, { tableName: TABLE_NAME, columnName }, { autoCommit: false });
    if (!Number(present.rows[0]?.CNT || 0)) {
      await connection.execute(`ALTER TABLE app_dataset_jobs ADD (${columnName.toLowerCase()} ${declaration})`, {}, { autoCommit: false });
    }
  }
}

async function getJobOnConnection(connection, jobId) {
  const result = await connection.execute(`
    SELECT job_id, initiating_actor, status, progress, message, operation, warnings_json, errors_json,
           counts_json, summary_json, active_dataset_json, details_json,
           generation_id, worker_id, lease_token, created_at, updated_at
    FROM app_dataset_jobs WHERE job_id = :jobId
  `, { jobId }, { autoCommit: false });
  return normalizeRow(result.rows[0] || null);
}

async function withConnection(work) {
  let connection;
  try { connection = await db.getConnection(); await ensureTable(connection); return await work(connection); }
  finally { if (connection) try { await connection.close(); } catch (_) {} }
}

/**
 * Lease, queued job, and generation journal are admitted in one Oracle
 * transaction.  There is no observable unassociated-lease window.
 */
async function admitDatasetJob(metadata = {}) {
  const jobId = metadata.jobId || `imp_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const generationId = metadata.generationId || `gen_${crypto.randomUUID().replace(/-/g, '')}`;
  const leaseToken = metadata.leaseToken || crypto.randomUUID();
  const initiatingActor = requiredActor(metadata.initiatingActor);
  let connection;
  try {
    connection = await db.getConnection();
    await ensureTable(connection);
    await ensureOperationLockTable(connection);
    await ensureGenerationTable(connection);
    await ensureDatasetStateTable(connection);

    const priorDataset = await readStoredState(connection);
    const operation = await beginOperationOnConnection(connection, {
      leaseToken,
      jobId,
      kind: metadata.operation || 'dataset_operation',
      message: metadata.message || 'Dataset operation queued.',
      status: 'queued',
      progress: 0,
      leaseSeconds: metadata.leaseSeconds,
    });
    if (!operation) {
      await connection.rollback();
      return null;
    }

    await connection.execute(`INSERT INTO app_dataset_jobs (
      job_id, initiating_actor, status, progress, message, operation, warnings_json, errors_json, counts_json,
      summary_json, active_dataset_json, details_json, worker_id, lease_token,
      lease_expires_at, generation_id, created_at, updated_at
    ) VALUES (
      :jobId, :initiatingActor, 'queued', 0, :message, :operation, :warnings, :errors, :counts,
      :summary, :activeDataset, :details, NULL, :leaseToken,
      SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'), :generationId,
      SYSTIMESTAMP, SYSTIMESTAMP
    )`, {
      jobId,
      initiatingActor,
      message: metadata.message || 'Dataset operation queued.',
      operation: metadata.operation || null,
      warnings: json(metadata.warnings, []),
      errors: json(metadata.errors, []),
      counts: json(metadata.counts, null),
      summary: json(metadata.summary, null),
      activeDataset: json(metadata.activeDataset, null),
      details: json(metadata.details, null),
      leaseToken,
      leaseSeconds: Math.max(60, Number(operation.leaseSeconds || 1800)),
      generationId,
    }, { autoCommit: false });

    await createGenerationOnConnection(connection, {
      generationId,
      jobId,
      initiatingActor,
      priorGenerationId: priorDataset?.generationId || null,
      priorDataset,
    });

    // Atomic admission boundary: lease + job + generation become durable
    // together, so startup never has to wait for an association timeout.
    await connection.commit();
    return {
      job: await getJobOnConnection(connection, jobId),
      lock: operation,
      generationId,
      priorDataset,
    };
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    throw error;
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function updateJob(jobId, patch = {}) {
  return withConnection(async (connection) => {
    const current = await getJobOnConnection(connection, jobId);
    if (!current) return null;
    const next = { ...current, ...patch, warnings: patch.warnings ?? current.warnings, errors: patch.errors ?? current.errors };
    await connection.execute(`UPDATE app_dataset_jobs SET status = :status, progress = :progress,
      message = :message, warnings_json = :warnings, errors_json = :errors, counts_json = :counts,
      summary_json = :summary, active_dataset_json = :activeDataset, details_json = :details,
      updated_at = SYSTIMESTAMP WHERE job_id = :jobId`, {
      jobId, status: next.status, progress: next.progress, message: next.message,
      warnings: json(next.warnings, []), errors: json(next.errors, []), counts: json(next.counts, null),
      summary: json(next.summary, null), activeDataset: json(next.activeDataset, null), details: json(next.details, null),
    }, { autoCommit: false });
    await connection.commit();
    return getJobOnConnection(connection, jobId);
  });
}

async function appendJobWarnings(jobId, warnings = []) {
  if (!warnings.length) return getJob(jobId);
  const current = await getJob(jobId);
  return current ? updateJob(jobId, { warnings: [...current.warnings, ...warnings] }) : null;
}

async function appendJobErrors(jobId, errors = []) {
  if (!errors.length) return getJob(jobId);
  const current = await getJob(jobId);
  return current ? updateJob(jobId, { errors: [...current.errors, ...errors] }) : null;
}

async function getJob(jobId) { return withConnection((connection) => getJobOnConnection(connection, jobId)); }

async function claimDatasetJob(jobId, { leaseToken, leaseSeconds = 1800 } = {}) {
  if (!leaseToken) throw new Error('A durable dataset-operation lease token is required to claim a job.');
  const workerId = `dataset_${process.pid}_${crypto.randomUUID()}`;
  return withConnection(async (connection) => {
    const result = await connection.execute(`UPDATE app_dataset_jobs SET status = 'running', progress = 5,
      message = 'Dataset worker claimed job.', worker_id = :workerId, lease_token = :leaseToken,
      lease_expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'), updated_at = SYSTIMESTAMP
      WHERE job_id = :jobId AND status = 'queued' AND lease_token = :leaseToken`,
    { jobId, workerId, leaseToken, leaseSeconds: Math.max(60, Number(leaseSeconds || 1800)) },
    { autoCommit: false });
    if (result.rowsAffected !== 1) return null;
    await connection.commit();
    return { workerId, ...(await getJobOnConnection(connection, jobId)) };
  });
}

async function completeDatasetJobTransaction({
  jobId,
  generationId,
  leaseToken,
  activeDataset,
  warnings,
  summary,
  requiredFeatures,
  completeMessage,
}) {
  assertRequiredFeatureEvidence(requiredFeatures, { generationId });
  return withConnection(async (connection) => {
    const currentResult = await connection.execute(`
      SELECT job_id
      FROM app_dataset_jobs
      WHERE job_id = :jobId
        AND generation_id = :generationId
        AND lease_token = :leaseToken
        AND status = 'running'
      FOR UPDATE
    `, { jobId, generationId, leaseToken }, { autoCommit: false });
    const current = currentResult.rows[0] ? await getJobOnConnection(connection, jobId) : null;
    if (!current) throw new Error(`Dataset job ${jobId} does not exist.`);

    const generation = await getGenerationOnConnection(connection, generationId, { forUpdate: true });
    if (!generation || generation.status !== 'ready' || generation.jobId !== jobId) {
      throw new Error(`Dataset generation ${generationId} is not ready for completion.`);
    }

    // Dataset state, generation activation, terminal job, and exact owner
    // lease release share one commit.  A completed-owner lease cannot exist.
    const persisted = await saveDatasetStateOnConnection(
      connection,
      { ...activeDataset, generationId },
      { commit: false }
    );
    await activateGenerationOnConnection(connection, {
      generationId,
      jobId,
      requiredFeatures,
    });
    const completed = await connection.execute(`UPDATE app_dataset_jobs SET status = 'completed', progress = 100,
      message = :message, warnings_json = :warnings, summary_json = :summary,
      active_dataset_json = :activeDataset, updated_at = SYSTIMESTAMP
      WHERE job_id = :jobId
        AND generation_id = :generationId
        AND lease_token = :leaseToken
        AND status = 'running'`, {
      jobId,
      generationId,
      leaseToken,
      message: completeMessage,
      warnings: json(warnings, []),
      summary: json(summary, null),
      activeDataset: json(persisted, null),
    }, { autoCommit: false });
    if (completed.rowsAffected !== 1) {
      throw new Error(`Dataset job ${jobId} terminal update did not affect exactly one row.`);
    }

    const terminalLeaseRelease = await endOperationOnConnection(connection, {
      leaseToken,
      jobId,
    });
    if (terminalLeaseRelease !== 1) {
      throw new Error('Dataset terminal lease release did not affect exactly one owner row.');
    }

    await connection.commit();
    return { job: await getJobOnConnection(connection, jobId), activeDataset: persisted };
  });
}

async function finalizeGenerationRecovery({
  generationId,
  jobId,
  leaseToken = null,
  reason,
  errorMessage,
  requiredFeatures = null,
}) {
  return withConnection(async (connection) => {
    const generation = await getGenerationOnConnection(connection, generationId, { forUpdate: true });
    if (!generation) throw new Error(`Dataset generation ${generationId} does not exist.`);
    if (requiredFeatures) assertRequiredFeatureEvidence(requiredFeatures, { generationId });

    const message = errorMessage || 'Application restart interrupted this dataset operation; the prior active generation was restored before readiness.';
    const current = jobId ? await getJobOnConnection(connection, jobId) : null;
    if (current && !['completed', 'failed'].includes(current.status)) {
      await connection.execute(`UPDATE app_dataset_jobs SET status = 'failed', progress = 100,
        message = :message, errors_json = :errors, recovery_json = :recovery,
        worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
        updated_at = SYSTIMESTAMP WHERE job_id = :jobId`, {
        jobId,
        message,
        errors: json([...(current.errors || []), message], []),
        recovery: json({
          reason,
          recoveredAt: nowIso(),
          retryPolicy: 'manual-resubmit',
          priorGenerationId: generation.priorGenerationId,
          requiredFeatures,
        }, {}),
      }, { autoCommit: false });
    }

    const requiredFeaturesAssignment = requiredFeatures
      ? 'required_features_json = :requiredFeatures,'
      : '';
    await connection.execute(`UPDATE app_dataset_generations
      SET status = 'rolled_back',
          ${requiredFeaturesAssignment}
          recovery_json = :recovery,
          updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId
        AND status IN ('admitted', 'snapshotting', 'staged', 'applying', 'ready', 'recovering')`, {
      generationId,
      ...(requiredFeatures ? { requiredFeatures: json(requiredFeatures, null) } : {}),
      recovery: json({
        reason,
        recoveredAt: nowIso(),
        outcome: 'PRIOR_GENERATION_RESTORED',
      }, {}),
    }, { autoCommit: false });

    if (leaseToken) {
      const released = await endOperationOnConnection(connection, { leaseToken, jobId });
      if (released !== 1) {
        throw new Error('Recovered generation lease release did not affect exactly one owner row.');
      }
    }

    await connection.commit();
    return { generationId, jobId, status: 'rolled_back' };
  });
}

async function finalizeInterruptedWithoutSnapshot({
  generationId,
  jobId,
  leaseToken = null,
  reason,
  errorMessage = null,
}) {
  return withConnection(async (connection) => {
    const message = errorMessage ||
      'Application restart interrupted this dataset operation before destructive apply; the prior active generation was unchanged.';
    if (jobId) {
      const current = await getJobOnConnection(connection, jobId);
      if (current && !['completed', 'failed'].includes(current.status)) {
        await connection.execute(`UPDATE app_dataset_jobs SET status = 'failed', progress = 100,
          message = :message, errors_json = :errors, recovery_json = :recovery,
          worker_id = NULL, lease_token = NULL, lease_expires_at = NULL,
          updated_at = SYSTIMESTAMP WHERE job_id = :jobId`, {
          jobId,
          message,
          errors: json([...(current.errors || []), message], []),
          recovery: json({ reason, recoveredAt: nowIso(), outcome: 'PRIOR_GENERATION_UNCHANGED' }, {}),
        }, { autoCommit: false });
      }
    }
    if (generationId) {
      await connection.execute(`UPDATE app_dataset_generations SET status = 'failed',
        recovery_json = :recovery, updated_at = SYSTIMESTAMP
        WHERE generation_id = :generationId
          AND status IN ('admitted', 'snapshotting')`, {
        generationId,
        recovery: json({ reason, recoveredAt: nowIso(), outcome: 'PRIOR_GENERATION_UNCHANGED' }, {}),
      }, { autoCommit: false });
    }
    if (leaseToken) {
      const released = await endOperationOnConnection(connection, { leaseToken, jobId });
      if (released !== 1) {
        throw new Error('Interrupted generation lease release did not affect exactly one owner row.');
      }
    }
    await connection.commit();
    return { generationId, jobId, status: 'failed' };
  });
}

async function releaseStartupLease({ leaseToken, jobId = null }) {
  if (!leaseToken) return 0;
  return withConnection(async (connection) => {
    const released = await endOperationOnConnection(connection, { leaseToken, jobId });
    if (released !== 1) {
      throw new Error('Startup lease reconciliation did not affect exactly one owner row.');
    }
    await connection.commit();
    return released;
  });
}

module.exports = {
  admitDatasetJob,
  updateJob,
  appendJobWarnings,
  appendJobErrors,
  getJob,
  claimDatasetJob,
  completeDatasetJobTransaction,
  finalizeGenerationRecovery,
  finalizeInterruptedWithoutSnapshot,
  releaseStartupLease,
};
