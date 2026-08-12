const crypto = require('node:crypto');
const db = require('../config/database');
const NON_TERMINAL = new Set(['admitted', 'applying']);
const LEASE_SECONDS = 120;
const actorPattern = /^[A-Za-z0-9_.-]{1,128}$/;
function id(prefix) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }
function actor(value) { const normalized = typeof value === 'string' ? value.trim() : ''; if (!actorPattern.test(normalized)) throw new Error('A governed initiating actor is required.'); return normalized; }
function row(result) { return result.rows?.[0] || null; }
async function admitGeneration({ jobId, initiatingActor, operation }) {
  const generationId = id('gen'); const leaseToken = id('lease'); const initiator = actor(initiatingActor); let connection;
  try {
    connection = await db.getConnection();
    await connection.execute('SELECT lease_token, owner_job_id, expires_at FROM app_dataset_operation_lease WHERE lease_id = 1 FOR UPDATE');
    const active = await connection.execute("SELECT generation_id FROM app_dataset_generations WHERE status IN ('admitted','applying') FETCH FIRST 1 ROW ONLY");
    if (row(active)) { const error = new Error('Another governed dataset generation is already active.'); error.statusCode = 409; throw error; }
    const prior = await connection.execute('SELECT active_generation FROM app_dataset_state WHERE state_id = 1');
    await connection.execute(`INSERT INTO app_dataset_jobs (job_id, generation_id, initiating_actor, operation, status, message) VALUES (:jobId, :generationId, :actor, :operation, 'queued', 'Dataset generation admitted.')`, { jobId, generationId, actor: initiator, operation });
    await connection.execute(`INSERT INTO app_dataset_generations (generation_id, job_id, initiating_actor, prior_generation_id, status) VALUES (:generationId, :jobId, :actor, :priorGenerationId, 'admitted')`, { generationId, jobId, actor: initiator, priorGenerationId: row(prior)?.ACTIVE_GENERATION || null });
    await connection.execute(`UPDATE app_dataset_operation_lease SET lease_token = :leaseToken, owner_job_id = :jobId, expires_at = SYSTIMESTAMP + NUMTODSINTERVAL(:leaseSeconds, 'SECOND'), updated_at = SYSTIMESTAMP WHERE lease_id = 1`, { leaseToken, jobId, leaseSeconds: LEASE_SECONDS });
    await connection.commit(); return { generationId, leaseToken, leaseSeconds: LEASE_SECONDS };
  } catch (error) { if (connection) try { await connection.rollback(); } catch (_) {} throw error; }
  finally { if (connection) try { await connection.close(); } catch (_) {} }
}
async function transition({ jobId, generationId, leaseToken, status, message = null }) {
  let connection; try { connection = await db.getConnection();
    const lease = await connection.execute('SELECT lease_token, owner_job_id FROM app_dataset_operation_lease WHERE lease_id = 1 FOR UPDATE');
    if (row(lease)?.LEASE_TOKEN !== leaseToken || row(lease)?.OWNER_JOB_ID !== jobId) throw new Error('Dataset generation lease ownership was lost.');
    await connection.execute('UPDATE app_dataset_generations SET status = :status, updated_at = SYSTIMESTAMP WHERE generation_id = :generationId AND job_id = :jobId', { status, generationId, jobId });
    await connection.execute('UPDATE app_dataset_jobs SET status = :status, message = :message, updated_at = SYSTIMESTAMP WHERE job_id = :jobId', { status: status === 'applying' ? 'running' : status, message, jobId });
    await connection.commit();
  } catch (error) { if (connection) try { await connection.rollback(); } catch (_) {} throw error; } finally { if (connection) try { await connection.close(); } catch (_) {} }
}
async function completeGeneration({ jobId, generationId, leaseToken, activeDataset }) {
  let connection; try { connection = await db.getConnection(); await connection.execute('SELECT lease_token, owner_job_id FROM app_dataset_operation_lease WHERE lease_id = 1 FOR UPDATE');
    await connection.execute(`UPDATE app_dataset_generations SET status = 'active', updated_at = SYSTIMESTAMP WHERE generation_id = :generationId AND job_id = :jobId`, { generationId, jobId });
    await connection.execute(`UPDATE app_dataset_jobs SET status = 'completed', message = 'Dataset generation completed.', updated_at = SYSTIMESTAMP WHERE job_id = :jobId`, { jobId });
    await connection.execute(`MERGE INTO app_dataset_state d USING (SELECT 1 state_id FROM dual) s ON (d.state_id = s.state_id) WHEN MATCHED THEN UPDATE SET active_source=:source, active_label=:label, active_version=:version, active_generation=:generationId, updated_at=SYSTIMESTAMP`, { ...activeDataset, generationId });
    await connection.execute('UPDATE app_dataset_operation_lease SET lease_token = NULL, owner_job_id = NULL, expires_at = NULL, updated_at = SYSTIMESTAMP WHERE lease_id = 1 AND lease_token = :leaseToken', { leaseToken }); await connection.commit();
  } catch (error) { if (connection) try { await connection.rollback(); } catch (_) {} throw error; } finally { if (connection) try { await connection.close(); } catch (_) {} }
}
async function failGeneration({ jobId, generationId, leaseToken, message }) { let connection; try { connection = await db.getConnection();
  await connection.execute(`UPDATE app_dataset_generations SET status = 'failed', updated_at = SYSTIMESTAMP WHERE generation_id=:generationId AND job_id=:jobId`, { generationId, jobId });
  await connection.execute(`UPDATE app_dataset_jobs SET status = 'failed', message=:message, updated_at=SYSTIMESTAMP WHERE job_id=:jobId`, { message: String(message).slice(0, 1000), jobId });
  await connection.execute('UPDATE app_dataset_operation_lease SET lease_token=NULL, owner_job_id=NULL, expires_at=NULL, updated_at=SYSTIMESTAMP WHERE lease_id=1 AND lease_token=:leaseToken', { leaseToken }); await connection.commit();
} finally { if (connection) try { await connection.close(); } catch (_) {} } }
async function readNonTerminalGeneration() { let connection; try { connection = await db.getConnection(); const result = await connection.execute("SELECT generation_id, job_id, status FROM app_dataset_generations WHERE status IN ('admitted','applying') FETCH FIRST 1 ROW ONLY"); const value = row(result); return value ? { generationId: value.GENERATION_ID, jobId: value.JOB_ID, status: String(value.STATUS).toLowerCase() } : null; } finally { if (connection) try { await connection.close(); } catch (_) {} } }
async function reconcileOnStartup() { const pending = await readNonTerminalGeneration(); if (!pending) return { reconciled: 0 }; if (pending.status === 'admitted') { let connection; let leaseToken = null; try { connection = await db.getConnection(); const lease = await connection.execute('SELECT lease_token FROM app_dataset_operation_lease WHERE lease_id = 1 AND owner_job_id = :jobId', { jobId: pending.jobId }); leaseToken = row(lease)?.LEASE_TOKEN || null; } finally { if (connection) try { await connection.close(); } catch (_) {} } await failGeneration({ ...pending, leaseToken, message: 'Application restarted before dataset work began.' }); return { reconciled: 1 }; } const error = new Error('A prior Higher Education dataset generation was interrupted after apply began; serving remains blocked until recovery is reviewed.'); error.code = 'DATASET_GENERATION_RECOVERY_REQUIRED'; throw error; }
module.exports = { NON_TERMINAL, admitGeneration, transition, completeGeneration, failGeneration, readNonTerminalGeneration, reconcileOnStartup };
