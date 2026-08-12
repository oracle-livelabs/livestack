#!/usr/bin/env node
/*
 * Adversarial source/unit contract for Healthcare HC4-01, HC4-02, and HC4-R1.
 *
 * This contract intentionally runs without Oracle, Podman, a browser, or the
 * frontend build. It executes the production actor-context helper, feature
 * validator, and recovery planner directly, then binds those decisions to the
 * admission, worker, startup, schema, and proof-query source paths.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch (_) {
    return '';
  }
};

const databaseSource = read('backend/config/database.js');
const jobsSource = read('backend/lib/importJobs.js');
const generationSource = read('backend/lib/datasetGenerationStore.js');
const workflowSource = read('backend/lib/importWorkflowService.js');
const serverSource = read('backend/server.js');
const securitySource = read('db/schema/06_security.sql');
const contextAdminSource = read('db/schema/06a_healthcare_app_context_admin.sql');
const bootstrapSource = read('scripts/bootstrap_db.sh');
const loadAllDataSource = read('db/data/load_all_data.sql');
const schemaSource = `${read('db/schema/01_tables.sql')}\n${read('db/schema/13_dataset_generation_lifecycle.sql')}`;

let database = null;
let lifecycle = null;
try {
  database = require(path.join(root, 'backend/config/database.js'));
  lifecycle = require(path.join(root, 'backend/lib/datasetGenerationStore.js'));
} catch (_) {
  database = null;
  lifecycle = null;
}

const REQUIRED_MODELS = [
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
];

function completeEvidence(generationId = 'gen-current') {
  return {
    generationId,
    expectedCounts: {
      products: 3,
      socialPosts: 4,
      spatialPoints: 5,
      careServiceRequests: 2,
      productInventory: 3,
    },
    vector: {
      ready: true,
      generationId,
      model: 'ALL_MINILM_L12_V2',
      productCount: 3,
      productEmbeddings: 3,
      postCount: 4,
      postEmbeddings: 4,
    },
    oml: {
      ready: true,
      generationId,
      models: REQUIRED_MODELS,
      rebuildHook: 'REBUILD_HEALTHCARE_OML_MODELS',
    },
    nativeJson: {
      ready: true,
      generationId,
      object: 'PRODUCT_ATTRIBUTES',
      productCount: 3,
      jsonRows: 3,
      executedRows: 3,
    },
    spatial: {
      ready: true,
      generationId,
      expectedPoints: 5,
      pointRows: 5,
      spatialIndexes: ['IDX_FC_SPATIAL', 'IDX_CUST_SPATIAL'],
    },
    graph: {
      ready: true,
      generationId,
      graph: 'CARE_PATHWAY_NETWORK',
      vertices: 5,
      edges: 4,
      probeRows: 4,
    },
    duality: {
      ready: true,
      generationId,
      views: ['CARE_SERVICE_REQUESTS_DV', 'PRODUCTS_INVENTORY_DV'],
      requestRows: 2,
      productRows: 3,
    },
  };
}

function requireFeatureValidator() {
  assert.equal(typeof lifecycle?.assertRequiredFeatureEvidence, 'function');
  return lifecycle.assertRequiredFeatureEvidence;
}

function requirePlanner() {
  assert.equal(typeof lifecycle?.planAllStartupReconciliations, 'function');
  return lifecycle.planAllStartupReconciliations;
}

const pendingGeneration = (generationId, jobId, priorGenerationId = 'gen-active') => ({
  generationId,
  jobId,
  priorGenerationId,
  initiatingActor: 'admin_jess',
  status: 'applying',
  snapshotComplete: true,
});

const checks = [
  ['fresh schema persists initiating actor on jobs', () => {
    assert.match(schemaSource, /CREATE TABLE app_dataset_jobs[\s\S]*initiating_actor\s+VARCHAR2\(128\)\s+NOT NULL/i);
  }],
  ['fresh schema persists initiating actor on generations', () => {
    assert.match(schemaSource, /CREATE TABLE app_dataset_generations[\s\S]*initiating_actor\s+VARCHAR2\(128\)\s+NOT NULL/i);
  }],
  ['retained-volume migration adds both initiating actor columns', () => {
    assert.match(schemaSource, /APP_DATASET_JOBS[\s\S]*INITIATING_ACTOR[\s\S]*ALTER TABLE app_dataset_jobs ADD \(initiating_actor VARCHAR2\(128\)\)/i);
    assert.match(schemaSource, /APP_DATASET_GENERATIONS[\s\S]*INITIATING_ACTOR[\s\S]*ALTER TABLE app_dataset_generations ADD \(initiating_actor VARCHAR2\(128\)\)/i);
  }],
  ['atomic admission requires and binds one initiating actor to job and generation', () => {
    assert.match(jobsSource, /async function admitDatasetJob[\s\S]*initiatingActor[\s\S]*INSERT INTO app_dataset_jobs[\s\S]*:initiatingActor[\s\S]*createGenerationOnConnection\([\s\S]*initiatingActor[\s\S]*connection\.commit\(\)/i);
  }],
  ['job and generation reads restore the persisted actor', () => {
    assert.match(jobsSource, /SELECT job_id[\s\S]*initiating_actor[\s\S]*FROM app_dataset_jobs/i);
    assert.match(generationSource, /SELECT generation_id[\s\S]*initiating_actor[\s\S]*FROM app_dataset_generations/i);
  }],
  ['upload and Restore pass the authenticated initiating actor into admission', () => {
    assert.match(workflowSource, /async function startImport\(\{[\s\S]*req[\s\S]*startDatasetJob\(\{[\s\S]*initiatingActor:\s*req\?\.authenticatedActor/i);
    assert.match(workflowSource, /async function startDemoRestore\(\{[\s\S]*req[\s\S]*startDatasetJob\(\{[\s\S]*initiatingActor:\s*req\?\.authenticatedActor/i);
  }],
  ['lifecycle worker uses one governed actor connection instead of a raw pooled connection', () => {
    assert.match(workflowSource, /async function executeImportPlan\([\s\S]*initiatingActor[\s\S]*requiredInitiatingActor\(initiatingActor\)[\s\S]*db\.withActorConnection\(\s*actor/i);
    const body = workflowSource.match(/async function executeImportPlan\([\s\S]*?\n\}\n\nfunction formatValidationResult/)?.[0] || '';
    assert.doesNotMatch(body, /db\.getConnection\(\)/i);
  }],
  ['governed helper sets exact actor, clears context, then returns connection', () => {
    assert.match(databaseSource, /async function withActorConnection[\s\S]*set_actor_context\(:username\)[\s\S]*clear_actor_context[\s\S]*connection\.close/i);
    assert.match(databaseSource, /clear_actor_context[\s\S]*connection\.close/i);
  }],
  ['governed helper executes and clears on the same connection', async () => {
    assert.equal(typeof database?.withActorConnection, 'function');
    const events = [];
    const fake = {
      execute: async (sql, binds) => {
        if (/set_actor_context/i.test(sql)) {
          events.push(`set:${binds.username}`);
        } else if (/clear_actor_context/i.test(sql)) {
          events.push('clear');
        }
        return { rows: [] };
      },
      close: async () => events.push('close'),
    };
    const result = await database.withActorConnection(
      'admin_jess',
      async (connection) => {
        assert.equal(connection, fake);
        events.push('work');
        return 42;
      },
      { connectionFactory: async () => fake }
    );
    assert.equal(result, 42);
    assert.deepEqual(events, ['set:admin_jess', 'work', 'clear', 'close']);
  }],
  ['governed helper clears before pool return when governed work throws', async () => {
    assert.equal(typeof database?.withActorConnection, 'function');
    const events = [];
    const fake = {
      execute: async (sql) => {
        events.push(/set_actor_context/i.test(sql) ? 'set' : 'clear');
        return { rows: [] };
      },
      close: async () => events.push('close'),
    };
    await assert.rejects(
      database.withActorConnection(
        'admin_jess',
        async () => {
          events.push('work-error');
          throw new Error('boom');
        },
        { connectionFactory: async () => fake }
      ),
      /boom/
    );
    assert.deepEqual(events, ['set', 'work-error', 'clear', 'close']);
  }],
  ['startup lifecycle rows are selected deterministically with their actor', () => {
    assert.match(generationSource, /SELECT job_id,\s*status,\s*generation_id,\s*initiating_actor[\s\S]*ORDER BY job_id/i);
    assert.match(generationSource, /SELECT generation_id,\s*job_id,\s*prior_generation_id,\s*status,\s*snapshot_complete,\s*initiating_actor[\s\S]*ORDER BY generation_id/i);
  }],
  ['startup revalidates persisted admin actor before recovery', () => {
    assert.match(workflowSource, /reconcileDatasetLifecycleOnStartup[\s\S]*resolvePersistedDatasetAdminActor[\s\S]*recoveryPlan\.initiatingActor/i);
    assert.match(workflowSource, /resolveDatasetAdminActor[\s\S]*persisted/i);
    assert.doesNotMatch(workflowSource, /initiatingActor\s*\|\|\s*['"]admin_/i);
  }],
  ['startup actor-context failure is not swallowed before readiness', () => {
    assert.match(serverSource, /await reconcileDatasetLifecycleOnStartup\(\)[\s\S]*app\.listen/i);
    assert.doesNotMatch(serverSource, /reconcileDatasetLifecycleOnStartup\(\)\.catch/i);
  }],
  ['trusted Healthcare context is bound by ADMIN to the exact package', () => {
    assert.match(contextAdminSource, /CREATE OR REPLACE CONTEXT HEALTHCARE_SECURITY_CTX USING/i);
    assert.match(contextAdminSource, /v_owner\s*\|\|\s*'\.HEALTHCARE_SECURITY_PKG'/i);
    assert.match(contextAdminSource, /FROM dba_context[\s\S]*namespace\s*=\s*'HEALTHCARE_SECURITY_CTX'[\s\S]*schema\s*=\s*v_owner[\s\S]*package\s*=\s*'HEALTHCARE_SECURITY_PKG'/i);
    assert.doesNotMatch(securitySource, /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?CONTEXT/im);
  }],
  ['bootstrap compiles package then binds context as ADMIN then installs policies', () => {
    assert.match(bootstrapSource, /sqlplus -L -s "\$APP_CONNECT" @\/tmp\/bootstrap_security_package\.sql[\s\S]*sqlplus -L -s "\$ADMIN_CONNECT"[\s\S]*06a_healthcare_app_context_admin\.sql[\s\S]*sqlplus -L -s "\$APP_CONNECT" @\/tmp\/bootstrap_security_policies\.sql/i);
    assert.match(bootstrapSource, /for sql_file in \/tmp\/06_security_admin\.sql \/tmp\/06_security_package\.sql \/tmp\/06_security_policies\.sql/i);
    assert.doesNotMatch(bootstrapSource, /\/tmp\/06_security_schema\.sql/i);
  }],
  ['application schema is not granted CREATE ANY CONTEXT', () => {
    assert.doesNotMatch(`${bootstrapSource}\n${securitySource}`, /GRANT\s+CREATE\s+ANY\s+CONTEXT/i);
  }],
  ['fresh seed supplies the non-null bootstrap generation required by the lifecycle schema', () => {
    assert.match(schemaSource, /CREATE TABLE app_dataset_state[\s\S]*active_generation\s+VARCHAR2\(100\)\s+NOT NULL/i);
    assert.match(loadAllDataSource, /'gen_bootstrap_v1'\s+AS\s+active_generation/i);
    assert.match(loadAllDataSource, /target\.active_generation\s*=\s*incoming\.active_generation/i);
    assert.match(loadAllDataSource, /WHEN NOT MATCHED THEN INSERT\s*\([\s\S]*active_generation[\s\S]*incoming\.active_generation/i);
  }],

  ['complete generation-bound evidence is accepted', () => {
    assert.doesNotThrow(() => requireFeatureValidator()(completeEvidence(), { generationId: 'gen-current' }));
  }],
  ['zero Vector product evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.expectedCounts.products = 0;
    evidence.vector.productCount = 0;
    evidence.vector.productEmbeddings = 0;
    evidence.nativeJson.productCount = 0;
    evidence.nativeJson.jsonRows = 0;
    evidence.nativeJson.executedRows = 0;
    evidence.duality.productRows = 0;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /vector/i);
  }],
  ['zero Vector post evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.expectedCounts.socialPosts = 0;
    evidence.vector.postCount = 0;
    evidence.vector.postEmbeddings = 0;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /vector/i);
  }],
  ['zero native JSON evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.nativeJson.jsonRows = 0;
    evidence.nativeJson.executedRows = 0;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /nativeJson/i);
  }],
  ['zero Spatial evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.spatial.expectedPoints = 0;
    evidence.spatial.pointRows = 0;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /spatial/i);
  }],
  ['zero Graph evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.graph.vertices = 0;
    evidence.graph.edges = 0;
    evidence.graph.probeRows = 0;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /graph/i);
  }],
  ['legacy-only graph evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.graph.graph = 'INFLUENCER_NETWORK';
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /graph/i);
  }],
  ['zero Duality evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.duality.requestRows = 0;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /duality/i);
  }],
  ['stale prior-generation top-level evidence fails closed', () => {
    assert.throws(
      () => requireFeatureValidator()(completeEvidence('gen-prior'), { generationId: 'gen-current' }),
      /generation/i
    );
  }],
  ['stale prior-generation feature evidence fails closed', () => {
    const evidence = completeEvidence();
    evidence.graph.generationId = 'gen-prior';
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /graph/i);
  }],
  ['generation expected-count mismatch fails closed', () => {
    const evidence = completeEvidence();
    evidence.vector.productEmbeddings = 2;
    assert.throws(() => requireFeatureValidator()(evidence, { generationId: 'gen-current' }), /vector/i);
  }],
  ['live proof queries only exact CARE_PATHWAY_NETWORK and executes SQL/PGQ', () => {
    const proof = workflowSource.match(/async function proveRequiredGenerationFeatures[\s\S]*?\n\}\n\nasync function rebuildAndProveRequiredGenerationFeatures/)?.[0] || '';
    assert.match(proof, /graph_name\s*=\s*'CARE_PATHWAY_NETWORK'/i);
    assert.match(proof, /GRAPH_TABLE\s*\(\s*care_pathway_network/i);
    assert.doesNotMatch(proof, /INFLUENCER_NETWORK/i);
  }],
  ['live proof binds positive exact current-generation expectations', () => {
    assert.match(workflowSource, /proveRequiredGenerationFeatures\(\s*connection,\s*omlRefresh,\s*\{[\s\S]*generationId[\s\S]*expectedCounts/i);
    assert.match(workflowSource, /assertRequiredFeatureEvidence\(\s*evidence,\s*\{\s*generationId\s*\}\s*\)/i);
  }],
  ['protected rollback snapshot rejects VPD-hidden zero rows', () => {
    assert.match(workflowSource, /function assertProtectedRollbackRows[\s\S]*(products|fulfillment_centers)[\s\S]*throw new ImportError/i);
    assert.match(workflowSource, /captureRollbackDataset[\s\S]*assertProtectedRollbackRows/i);
    assert.match(workflowSource, /rehydrateRollbackDataset[\s\S]*assertProtectedRollbackRows/i);
  }],
  ['rollback snapshot obtains its SCN without privileged DBMS_FLASHBACK access', () => {
    const capture = workflowSource.match(/async function captureRollbackDataset[\s\S]*?\n\}\n\nfunction rehydrateRollbackDataset/)?.[0] || '';
    assert.match(capture, /TIMESTAMP_TO_SCN\s*\(\s*SYSTIMESTAMP\s*\)/i);
    assert.doesNotMatch(capture, /DBMS_FLASHBACK\.GET_SYSTEM_CHANGE_NUMBER/i);
  }],
  ['ordinary pre-apply failures preserve the real worker error', () => {
    assert.match(
      workflowSource,
      /recoverGenerationBeforeRelease[\s\S]*finalizeInterruptedWithoutSnapshot\s*\(\s*\{[\s\S]*errorMessage/i
    );
    assert.match(
      jobsSource,
      /finalizeInterruptedWithoutSnapshot[\s\S]*const message\s*=\s*errorMessage\s*\|\|/i
    );
  }],

  ['duplicate-owner generations fail closed before token assignment', () => {
    const input = {
      lease: { leaseToken: 'lease-1', jobId: 'job-owner', status: 'running' },
      jobs: [{ jobId: 'job-owner', status: 'running', initiatingActor: 'admin_jess' }],
      generations: [
        pendingGeneration('gen-a', 'job-owner'),
        pendingGeneration('gen-b', 'job-owner'),
      ],
    };
    assert.throws(() => requirePlanner()(input), /ambiguous|integrity/i);
  }],
  ['multiple pending generations fail closed deterministically when reversed', () => {
    const generations = [
      pendingGeneration('gen-b', 'job-b', 'gen-a'),
      pendingGeneration('gen-a', 'job-a', 'gen-active'),
    ];
    const input = {
      lease: { leaseToken: 'lease-1', jobId: 'job-a', status: 'running' },
      jobs: [
        { jobId: 'job-a', status: 'running', initiatingActor: 'admin_jess' },
        { jobId: 'job-b', status: 'running', initiatingActor: 'admin_jess' },
      ],
    };
    let first;
    let second;
    try { requirePlanner()({ ...input, generations }); } catch (error) { first = error; }
    try { requirePlanner()({ ...input, generations: [...generations].reverse() }); } catch (error) { second = error; }
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.code, 'DATASET_LIFECYCLE_INTEGRITY_ERROR');
    assert.equal(second.code, first.code);
    assert.equal(second.message, first.message);
    assert.doesNotMatch(first.message, /lease-1/);
  }],
  ['cyclic pending generation chain fails closed', () => {
    assert.throws(() => requirePlanner()({
      lease: null,
      jobs: [
        { jobId: 'job-a', status: 'running', initiatingActor: 'admin_jess' },
        { jobId: 'job-b', status: 'running', initiatingActor: 'admin_jess' },
      ],
      generations: [
        pendingGeneration('gen-a', 'job-a', 'gen-b'),
        pendingGeneration('gen-b', 'job-b', 'gen-a'),
      ],
    }), /ambiguous|cycle|integrity/i);
  }],
  ['single recovery plan carries the exact persisted actor', () => {
    const plans = requirePlanner()({
      lease: { leaseToken: 'lease-1', jobId: 'job-a', status: 'running' },
      jobs: [{ jobId: 'job-a', status: 'running', initiatingActor: 'admin_jess' }],
      generations: [pendingGeneration('gen-a', 'job-a')],
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].initiatingActor, 'admin_jess');
  }],
];

(async () => {
  const failures = [];
  for (const [name, check] of checks) {
    try {
      await check();
      process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      process.stdout.write(`RED  ${name}\n`);
    }
  }

  process.stdout.write(`\nHealthcare HC4 VPD/feature lifecycle: ${checks.length - failures.length}/${checks.length} PASS, ${failures.length} RED\n`);
  if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
