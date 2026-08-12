#!/usr/bin/env node
/* Source-safe contract for Restore durability.  No Podman or Oracle required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const lock = read('backend/lib/datasetOperationLock.js');
const jobs = read('backend/lib/importJobs.js');
const workflow = read('backend/lib/importWorkflowService.js');
const server = read('backend/server.js');
const schema = read('db/schema/01_tables.sql');
const checks = [
  ['no module-local mutex', () => assert.doesNotMatch(lock, /(?:let|const|var)\s+activeOperation\s*=/)],
  ['durable singleton lock table', () => assert.match(schema, /CREATE TABLE app_dataset_operation_lock/i)],
  ['lease expiry persisted', () => assert.match(schema, /lease_expires_at\s+TIMESTAMP/i)],
  ['lease claim locks Oracle row', () => assert.match(lock, /FOR UPDATE NOWAIT/i)],
  ['lease has unique worker token', () => assert.match(lock, /crypto\.randomUUID\(\)/)],
  ['lease claim fences active owner', () => assert.match(lock, /lease_expires_at > SYSTIMESTAMP/i)],
  ['jobs persist worker identity', () => assert.match(schema, /worker_id\s+VARCHAR2/i)],
  ['jobs persist their own lease token', () => assert.match(schema, /lease_token\s+VARCHAR2/i)],
  ['queued job has atomic worker claim', () => assert.match(jobs, /async function claimDatasetJob[\s\S]*WHERE job_id = :jobId AND status = 'queued'/i)],
  ['worker claim requires durable lease token', () => assert.match(jobs, /durable dataset-operation lease token is required/i)],
  ['legacy split job admission is not exported', () => assert.doesNotMatch(jobs, /module\.exports\s*=\s*\{[\s\S]*\bcreateJob,/i)],
  ['legacy blanket job failure recovery is not exported', () => assert.doesNotMatch(jobs, /module\.exports\s*=\s*\{[\s\S]*\brecoverInterruptedDatasetJobs,/i)],
  ['startup runs deterministic recovery', () => assert.match(server, /await reconcileDatasetLifecycleOnStartup\(\)/)],
  ['startup releases only planner-selected leases', () => {
    assert.match(workflow, /planAllStartupReconciliations\(lifecycleState\)/);
    assert.match(workflow, /if \(recoveryPlan\.releaseLease\)[\s\S]*releaseStartupLease/i);
  }],
  ['Restore worker claims before execution', () => assert.match(workflow, /await claimDatasetJob\(job\.jobId, \{ leaseToken: lock\.leaseToken/i)],
  ['progress heartbeats the same lease', () => assert.match(workflow, /createJobProgressHandler\(job\.jobId, lock\.leaseToken\)/)],
  ['lost lease stops Restore safely', () => assert.match(workflow, /Dataset worker lease was lost; restore was stopped safely/i)],
  ['worker release is lease-token fenced', () => assert.match(jobs, /completeDatasetJobTransaction[\s\S]*endOperationOnConnection\(connection, \{[\s\S]*leaseToken,[\s\S]*jobId/i)],
];

const failures = [];
for (const [name, check] of checks) {
  try { check(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures.push(`${name}: ${error.message}`); process.stdout.write(`RED  ${name}\n`); }
}
process.stdout.write(`\nHealthcare durable Restore recovery: ${checks.length - failures.length}/${checks.length} PASS, ${failures.length} RED\n`);
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
}
