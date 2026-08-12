const crypto = require('node:crypto');
const db = require('../config/database');
const { TABLES } = require('./importCatalog');

const NON_TERMINAL_STATUSES = new Set(['admitted', 'applying']);
const REQUIRED_GENERATION_FEATURES = Object.freeze(['vector', 'oml', 'nativeJson', 'spatial', 'graph', 'duality']);
const normalize = (row) => row && ({ generationId: row.GENERATION_ID, jobId: row.JOB_ID, initiatingActor: row.INITIATING_ACTOR, status: String(row.STATUS || '').toLowerCase() });
const IMPORT_TABLE_NAMES = Object.freeze(TABLES.map(({ name }) => name.toUpperCase()));

function createFlashbackReplayPlan(rollbackScn) {
  const scn = Number(rollbackScn);
  if (!Number.isSafeInteger(scn) || scn <= 0) throw new Error('A valid durable Oracle rollback SCN is required.');
  return {
    enableRowMovement: IMPORT_TABLE_NAMES.map((tableName) => `ALTER TABLE ${tableName} ENABLE ROW MOVEMENT`),
    // Restore the mutually-referenced Colorado import tables as one Oracle
    // physical operation, rather than briefly exposing child/parent skew.
    flashback: `FLASHBACK TABLE ${IMPORT_TABLE_NAMES.join(', ')} TO SCN ${scn}`,
  };
}

async function withAdmin(actor, work) {
  return db.withUserConnection(actor, async ({ connection }) => work(connection));
}

async function admitGeneration({ actor, jobId, operation }) {
  if (!actor || !jobId) throw new Error('A trusted actor and job are required to admit a dataset generation.');
  return withAdmin(actor, async (connection) => {
    const leaseToken = crypto.randomUUID(); const generationId = `sled_gen_${crypto.randomUUID()}`;
    const lease = await connection.execute(`SELECT lease_token, owner_job_id, status FROM app_dataset_operation_lease WHERE lease_id = 1 FOR UPDATE`);
    if (String(lease.rows[0]?.STATUS || '').toLowerCase() === 'active') {
      const error = new Error('A governed dataset operation is already active.'); error.statusCode = 409; error.code = 'DATASET_OPERATION_ACTIVE'; throw error;
    }
    const prior = await connection.execute(`SELECT active_generation FROM app_dataset_state WHERE state_id = 1`);
    const priorGenerationId = prior.rows[0]?.ACTIVE_GENERATION || null;
    const scnResult = await connection.execute(`SELECT TIMESTAMP_TO_SCN(SYSTIMESTAMP) AS rollback_scn FROM dual`);
    const rollbackScn = Number(scnResult.rows[0]?.ROLLBACK_SCN || 0);
    if (!Number.isSafeInteger(rollbackScn) || rollbackScn <= 0) throw new Error('Oracle could not capture a durable rollback SCN before dataset replacement.');
    await connection.execute(`INSERT INTO app_dataset_jobs (job_id, generation_id, initiating_actor, status, operation, message) VALUES (:jobId, :generationId, :actor, 'queued', :operation, 'Dataset generation admitted.')`, { jobId, generationId, actor, operation });
    await connection.execute(`INSERT INTO app_dataset_generations (generation_id, job_id, initiating_actor, prior_generation_id, status, required_features_json, rollback_scn) VALUES (:generationId, :jobId, :actor, :priorGenerationId, 'admitted', :features, :rollbackScn)`, { generationId, jobId, actor, priorGenerationId, features: JSON.stringify(REQUIRED_GENERATION_FEATURES), rollbackScn });
    await connection.execute(`UPDATE app_dataset_operation_lease SET lease_token = :leaseToken, owner_job_id = :jobId, status = 'active', updated_at = SYSTIMESTAMP WHERE lease_id = 1`, { leaseToken, jobId });
    await connection.commit(); return { generationId, leaseToken, rollbackScn };
  });
}

async function updateGeneration({ actor, generationId, status, jobStatus = null, message = null }) {
  return withAdmin(actor, async (connection) => {
    await connection.execute(`UPDATE app_dataset_generations SET status = :status, updated_at = SYSTIMESTAMP WHERE generation_id = :generationId`, { status, generationId });
    if (jobStatus) await connection.execute(`UPDATE app_dataset_jobs SET status = :jobStatus, message = :message, updated_at = SYSTIMESTAMP WHERE generation_id = :generationId`, { jobStatus, message, generationId });
    await connection.commit();
  });
}

async function activateGeneration({ actor, generationId, source, label, version = 'v1' }) {
  return withAdmin(actor, async (connection) => {
    const row = await connection.execute(`SELECT job_id FROM app_dataset_generations WHERE generation_id = :generationId FOR UPDATE`, { generationId });
    if (!row.rows[0]) throw new Error('Dataset generation was not found for activation.');
    await connection.execute(`MERGE INTO app_dataset_state t USING (SELECT 1 state_id FROM dual) s ON (t.state_id=s.state_id) WHEN MATCHED THEN UPDATE SET active_source=:source, active_label=:label, active_version=:version, active_generation=:generationId, updated_at=SYSTIMESTAMP WHEN NOT MATCHED THEN INSERT (state_id, active_source, active_label, active_version, active_generation) VALUES (1,:source,:label,:version,:generationId)`, { source, label, version, generationId });
    await connection.execute(`UPDATE app_dataset_generations SET status = 'active', updated_at = SYSTIMESTAMP WHERE generation_id = :generationId`, { generationId });
    await connection.execute(`UPDATE app_dataset_jobs SET status = 'completed', message = 'Dataset generation activated.', updated_at = SYSTIMESTAMP WHERE generation_id = :generationId`, { generationId });
    await connection.execute(`UPDATE app_dataset_operation_lease SET lease_token=NULL, owner_job_id=NULL, status='idle', updated_at=SYSTIMESTAMP WHERE lease_id=1 AND owner_job_id=(SELECT job_id FROM app_dataset_generations WHERE generation_id=:generationId)`, { generationId });
    await connection.commit();
  });
}

async function failGeneration({ actor, generationId, message }) {
  return withAdmin(actor, async (connection) => {
    await connection.execute(`UPDATE app_dataset_generations SET status='failed', recovery_json=:recovery, updated_at=SYSTIMESTAMP WHERE generation_id=:generationId`, { generationId, recovery: JSON.stringify({ reason: message || 'Dataset operation failed.' }) });
    await connection.execute(`UPDATE app_dataset_jobs SET status='failed', message=:message, updated_at=SYSTIMESTAMP WHERE generation_id=:generationId`, { generationId, message: message || 'Dataset operation failed.' });
    await connection.execute(`UPDATE app_dataset_operation_lease SET lease_token=NULL, owner_job_id=NULL, status='idle', updated_at=SYSTIMESTAMP WHERE lease_id=1 AND owner_job_id=(SELECT job_id FROM app_dataset_generations WHERE generation_id=:generationId)`, { generationId });
    await connection.commit();
  });
}

async function readNonTerminalGeneration() {
  return db.withUserConnection('admin_jess', async ({ connection }) => {
    const result = await connection.execute(`SELECT generation_id, job_id, status FROM app_dataset_generations WHERE status IN ('admitted','applying') ORDER BY created_at FETCH FIRST 1 ROW ONLY`);
    return normalize(result.rows[0]);
  });
}

async function replayInterruptedGeneration({ actor, generationId }) {
  if (!actor || !generationId) throw new Error('Interrupted generation replay requires its trusted actor and generation ID.');
  return withAdmin(actor, async (connection) => {
    const result = await connection.execute(`SELECT rollback_scn FROM app_dataset_generations WHERE generation_id = :generationId FOR UPDATE`, { generationId });
    const rollbackScn = result.rows[0]?.ROLLBACK_SCN;
    const plan = createFlashbackReplayPlan(rollbackScn);
    for (const statement of plan.enableRowMovement) await connection.execute(statement);
    await connection.execute(plan.flashback);
    await connection.execute(`UPDATE app_dataset_generations SET status='recovered', recovery_json=:recovery, updated_at=SYSTIMESTAMP WHERE generation_id=:generationId`, { generationId, recovery: JSON.stringify({ reason: 'Interrupted in-place generation physically replayed from Oracle rollback SCN.', rollbackScn }) });
    await connection.execute(`UPDATE app_dataset_jobs SET status='failed', message='Interrupted dataset generation was physically replayed from its rollback SCN.', updated_at=SYSTIMESTAMP WHERE generation_id=:generationId`, { generationId });
    await connection.execute(`UPDATE app_dataset_operation_lease SET lease_token=NULL, owner_job_id=NULL, status='idle', updated_at=SYSTIMESTAMP WHERE lease_id=1 AND owner_job_id=(SELECT job_id FROM app_dataset_generations WHERE generation_id=:generationId)`, { generationId });
    await connection.commit(); return { generationId, rollbackScn, restoredTables: IMPORT_TABLE_NAMES };
  });
}
async function reconcileDatasetLifecycleOnStartup() {
  const row = await db.withUserConnection('admin_jess', async ({ connection }) => {
    const result = await connection.execute(`SELECT generation_id, job_id, initiating_actor, status FROM app_dataset_generations WHERE status IN ('admitted','applying') ORDER BY created_at FETCH FIRST 2 ROWS ONLY`);
    if (result.rows.length > 1) throw new Error('Dataset lifecycle integrity is ambiguous: multiple nonterminal generations.');
    return result.rows[0] || null;
  });
  if (!row) return { reconciled: 0 };
  const replay = await replayInterruptedGeneration({ actor: row.INITIATING_ACTOR, generationId: row.GENERATION_ID });
  return { reconciled: 1, ...replay };
}
module.exports = { NON_TERMINAL_STATUSES, REQUIRED_GENERATION_FEATURES, IMPORT_TABLE_NAMES, createFlashbackReplayPlan, admitGeneration, updateGeneration, activateGeneration, failGeneration, readNonTerminalGeneration, replayInterruptedGeneration, reconcileDatasetLifecycleOnStartup };
