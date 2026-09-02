const db = require('../config/database');
const {
  enqueueDatasetEventInTransaction,
  scheduleDatasetEventDelivery,
} = require('./datasetEventOutbox');
const {
  assertOperationOwnershipInTransaction,
} = require('./datasetOperationLock');

const SYSTEM_IDENTITY = process.env.SYSTEM_SECURITY_CONTEXT_USER || 'admin_jess';
const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const jsonBind = (value) => ({ val: clone(value), type: db.oracledb.DB_TYPE_JSON });

function normalizeState(row) {
  if (!row) return null;
  return {
    source: String(row.ACTIVE_SOURCE || '').toLowerCase() || 'custom',
    label: row.ACTIVE_LABEL || null,
    version: row.ACTIVE_VERSION || null,
    updatedAt: row.UPDATED_AT instanceof Date ? row.UPDATED_AT.toISOString() : row.UPDATED_AT,
  };
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'Media dataset state' });
  }
}

async function readState(connection) {
  const result = await connection.execute(`
    SELECT active_source, active_label, active_version, updated_at
    FROM app_dataset_state WHERE state_id = 1
  `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  return normalizeState(result.rows?.[0]);
}

async function getStoredDatasetState() {
  return withConnection(readState);
}

async function getDatasetReadiness() {
  return withConnection(async (connection) => {
    const result = await connection.execute(`
      SELECT dataset_source, dataset_version, job_id, status,
             JSON_SERIALIZE(readiness RETURNING CLOB) readiness,
             failure_message, activated_at, updated_at
      FROM app_dataset_readiness WHERE readiness_id = 1
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    const row = result.rows?.[0];
    if (!row) return null;
    const readiness = typeof row.READINESS === 'string'
      ? JSON.parse(row.READINESS)
      : clone(row.READINESS);
    return {
      source: row.DATASET_SOURCE || null,
      version: row.DATASET_VERSION || null,
      jobId: row.JOB_ID || null,
      status: row.STATUS || 'UNKNOWN',
      readiness,
      failureMessage: row.FAILURE_MESSAGE || null,
      activatedAt: row.ACTIVATED_AT instanceof Date ? row.ACTIVATED_AT.toISOString() : row.ACTIVATED_AT,
      updatedAt: row.UPDATED_AT instanceof Date ? row.UPDATED_AT.toISOString() : row.UPDATED_AT,
    };
  });
}

async function saveDatasetState({ source, label, version = null }) {
  return withConnection(async (connection) => {
    await mergeState(connection, { source, label, version });
    await connection.commit();
    return readState(connection);
  });
}

async function mergeState(connection, { source, label, version }) {
  const normalizedSource = String(source || 'custom').toLowerCase();
  await connection.execute(`
    MERGE INTO app_dataset_state target
    USING (
      SELECT 1 state_id, :source active_source, :label active_label,
             :version active_version FROM dual
    ) incoming
    ON (target.state_id = incoming.state_id)
    WHEN MATCHED THEN UPDATE SET
      target.active_source = incoming.active_source,
      target.active_label = incoming.active_label,
      target.active_version = incoming.active_version,
      target.updated_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(
      state_id, active_source, active_label, active_version, updated_at
    ) VALUES(
      incoming.state_id, incoming.active_source, incoming.active_label,
      incoming.active_version, SYSTIMESTAMP
    )
  `, {
    source: normalizedSource,
    label: label || (normalizedSource === 'demo' ? 'Demo Data' : 'Custom Dataset'),
    version,
  }, { autoCommit: false });
}

async function activateDatasetInTransaction(
  connection,
  {
    source,
    label,
    version,
    jobId,
    readiness,
    jobPatch,
    omlCandidate = null,
    ownership = null,
  }
) {
    ownership?.assertOwned?.();
    const jobResult = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) payload
       FROM app_dataset_jobs WHERE job_id = :jobId FOR UPDATE`,
      { jobId },
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const raw = jobResult.rows?.[0]?.PAYLOAD;
    const existing = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if (!existing) throw new Error(`Durable dataset job ${jobId} does not exist`);
    const stabilizing = {
      ...existing,
      ...jobPatch,
      status: 'running',
      phase: 'stabilizing',
      progress: 99,
      message: 'Dataset generation committed; validating durable In-Memory execution.',
      updatedAt: new Date().toISOString(),
    };

    if (omlCandidate?.models?.length) {
      if (omlCandidate.models.length !== 4) {
        throw new Error('Exactly four validated OML candidate models are required for activation');
      }
      await connection.execute(`
        UPDATE app_oml_generation_models
        SET status = 'validated'
        WHERE status = 'active'
          AND generation_id <> :generationId
      `, { generationId: omlCandidate.generationId }, { autoCommit: false });
      await connection.execute(`
        UPDATE app_oml_generations
        SET status = 'validated', updated_at = SYSTIMESTAMP
        WHERE status = 'active'
          AND generation_id <> :generationId
      `, { generationId: omlCandidate.generationId }, { autoCommit: false });
      await connection.execute(`
        UPDATE app_oml_generation_assets
        SET status = 'created'
        WHERE status = 'active'
          AND generation_id <> :generationId
      `, { generationId: omlCandidate.generationId }, { autoCommit: false });

      for (const model of omlCandidate.models) {
        await connection.execute(`
          MERGE INTO app_oml_model_registry target
          USING (
            SELECT :logicalName logical_name, :physicalName physical_name,
                   :generationId generation_id,
                   :trainingFingerprint training_fingerprint,
                   :trainingRowCount training_row_count
            FROM dual
          ) candidate
          ON (target.logical_name = candidate.logical_name)
          WHEN MATCHED THEN UPDATE SET
            target.physical_name = candidate.physical_name,
            target.generation_id = candidate.generation_id,
            target.training_fingerprint = candidate.training_fingerprint,
            target.training_row_count = candidate.training_row_count,
            target.validated_at = SYSTIMESTAMP,
            target.activated_at = SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT(
            logical_name, physical_name, generation_id, training_fingerprint,
            training_row_count, validated_at, activated_at
          ) VALUES(
            candidate.logical_name, candidate.physical_name,
            candidate.generation_id, candidate.training_fingerprint,
            candidate.training_row_count, SYSTIMESTAMP, SYSTIMESTAMP
          )
        `, {
          logicalName: model.logicalName,
          physicalName: model.physicalName,
          generationId: omlCandidate.generationId,
          trainingFingerprint: model.trainingFingerprint || omlCandidate.fingerprint,
          trainingRowCount: model.trainingRowCount,
        }, { autoCommit: false });
      }

      await connection.execute(`
        UPDATE app_oml_generation_models
        SET status = 'active', activated_at = SYSTIMESTAMP
        WHERE generation_id = :generationId
          AND status = 'validated'
      `, { generationId: omlCandidate.generationId }, { autoCommit: false });
      await connection.execute(`
        UPDATE app_oml_generations
        SET status = 'active', activated_at = SYSTIMESTAMP,
            updated_at = SYSTIMESTAMP
        WHERE generation_id = :generationId
          AND status = 'validated'
      `, { generationId: omlCandidate.generationId }, { autoCommit: false });
      await connection.execute(`
        UPDATE app_oml_generation_assets
        SET status = 'active'
        WHERE generation_id = :generationId
          AND status = 'created'
      `, { generationId: omlCandidate.generationId }, { autoCommit: false });
    }

    await mergeState(connection, { source, label, version });
    await connection.execute(`
      UPDATE app_dataset_readiness
      SET dataset_source = :source, dataset_version = :version, job_id = :jobId,
          status = 'STABILIZING', readiness = :readiness, failure_message = NULL,
          activated_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
    `, { source, version, jobId, readiness: jsonBind(readiness) }, { autoCommit: false });
    await connection.execute(`
      UPDATE app_dataset_jobs
      SET status = 'running', phase = 'stabilizing', progress = 99, message = :message,
          payload = :payload, updated_at = SYSTIMESTAMP, heartbeat_at = SYSTIMESTAMP,
          completed_at = NULL
      WHERE job_id = :jobId
    `, {
      message: stabilizing.message,
      payload: jsonBind(stabilizing),
      jobId,
    }, { autoCommit: false });
    await connection.execute(`
      UPDATE app_dataset_attempts
      SET phase = 'stabilizing', status = 'running', readiness = :readiness,
          failure_message = NULL, updated_at = SYSTIMESTAMP,
          completed_at = NULL
      WHERE job_id = :jobId
    `, { jobId, readiness: jsonBind(readiness) }, { autoCommit: false });
    return { activeDataset: await readState(connection), job: stabilizing };
}

async function finalizeDatasetActivation({
  jobId,
  readiness,
  jobPatch = {},
  emitLifecycleEvent = true,
  ownership = null,
}) {
  return withConnection(async (connection) => {
    ownership?.assertOwned?.();
    const jobResult = await connection.execute(
      `SELECT JSON_SERIALIZE(payload RETURNING CLOB) payload
       FROM app_dataset_jobs WHERE job_id = :jobId FOR UPDATE`,
      { jobId },
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false }
    );
    const raw = jobResult.rows?.[0]?.PAYLOAD;
    const existing = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if (!existing) throw new Error(`Durable dataset job ${jobId} does not exist`);
    const completed = {
      ...existing,
      ...jobPatch,
      status: 'completed',
      phase: 'activated',
      progress: 100,
      updatedAt: new Date().toISOString(),
    };
    const readinessUpdate = await connection.execute(`
      UPDATE app_dataset_readiness
      SET status = 'ACTIVE', readiness = :readiness,
          failure_message = NULL, updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1 AND job_id = :jobId
        AND status = 'STABILIZING'
    `, { readiness: jsonBind(readiness), jobId }, { autoCommit: false });
    if (Number(readinessUpdate.rowsAffected || 0) !== 1) {
      throw new Error(`Dataset job ${jobId} is not the stabilizing active generation`);
    }
    await connection.execute(`
      UPDATE app_dataset_jobs
      SET status = 'completed', phase = 'activated', progress = 100,
          message = :message, payload = :payload, updated_at = SYSTIMESTAMP,
          heartbeat_at = SYSTIMESTAMP, completed_at = SYSTIMESTAMP
      WHERE job_id = :jobId
    `, {
      message: String(completed.message || 'Dataset operation completed.').slice(0, 1000),
      payload: jsonBind(completed),
      jobId,
    }, { autoCommit: false });
    await connection.execute(`
      UPDATE app_dataset_attempts
      SET phase = 'activated', status = 'completed', readiness = :readiness,
          failure_message = NULL, updated_at = SYSTIMESTAMP,
          completed_at = SYSTIMESTAMP
      WHERE job_id = :jobId
    `, { jobId, readiness: jsonBind(readiness) }, { autoCommit: false });
    if (emitLifecycleEvent) {
      await enqueueDatasetEventInTransaction(connection, {
        jobId,
        generationId: existing.candidateGenerationId || `candidate-${jobId}`,
        operation: existing.operation === 'restore_demo' ? 'restore' : 'refresh',
        status: 'completed',
        datasetVersion: existing.datasetVersion || null,
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
    if (emitLifecycleEvent) scheduleDatasetEventDelivery();
    return { activeDataset: await readState(connection), job: completed };
  });
}

async function activateDataset({
  source,
  label,
  version,
  jobId,
  readiness,
  jobPatch,
  omlCandidate = null,
  ownership = null,
}) {
  return withConnection(async (connection) => {
    const activation = await activateDatasetInTransaction(connection, {
      source, label, version, jobId, readiness, jobPatch, omlCandidate, ownership,
    });
    if (ownership) {
      ownership.assertOwned?.();
      await assertOperationOwnershipInTransaction(connection, {
        jobId,
        leaseToken: ownership.leaseToken,
      });
    }
    await connection.commit();
    return activation;
  });
}

async function markReadinessFailed({
  jobId,
  attemptedVersion,
  readiness,
  message,
  ownership = null,
}) {
  return withConnection(async (connection) => {
    ownership?.assertOwned?.();
    const active = await connection.execute(`
      SELECT status FROM app_dataset_readiness
      WHERE readiness_id = 1 AND job_id = :jobId
    `, { jobId }, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
    if (['STABILIZING', 'ACTIVE'].includes(String(active.rows?.[0]?.STATUS || '').toUpperCase())) {
      return { activeGenerationCommitted: true };
    }
    await connection.execute(`
      MERGE INTO app_dataset_attempts target
      USING (
        SELECT :jobId job_id, :candidateGenerationId candidate_generation_id
        FROM dual
      ) source
      ON (target.job_id = source.job_id)
      WHEN MATCHED THEN UPDATE SET
        target.phase = 'failed', target.status = 'failed',
        target.attempted_version = :attemptedVersion,
        target.readiness = :readiness,
        target.failure_message = :message,
        target.updated_at = SYSTIMESTAMP,
        target.completed_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT(
        job_id, candidate_generation_id, attempted_version, phase, status,
        readiness, failure_message, created_at, updated_at, completed_at
      ) VALUES(
        source.job_id, source.candidate_generation_id, :attemptedVersion,
        'failed', 'failed', :readiness, :message,
        SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
      )
    `, {
      jobId,
      candidateGenerationId: `candidate-${jobId}`,
      attemptedVersion,
      readiness: jsonBind({ attemptedVersion, ...(readiness || {}) }),
      message: String(message || 'Required feature readiness failed.').slice(0, 2000),
    }, { autoCommit: false });
    if (ownership) {
      ownership.assertOwned?.();
      await assertOperationOwnershipInTransaction(connection, {
        jobId,
        leaseToken: ownership.leaseToken,
      });
    }
    await connection.commit();
    return { activeGenerationCommitted: false };
  });
}

module.exports = {
  getStoredDatasetState,
  getDatasetReadiness,
  saveDatasetState,
  activateDataset,
  activateDatasetInTransaction,
  finalizeDatasetActivation,
  markReadinessFailed,
};
