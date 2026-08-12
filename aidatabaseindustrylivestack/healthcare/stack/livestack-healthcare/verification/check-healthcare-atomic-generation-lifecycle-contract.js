#!/usr/bin/env node
/*
 * Adversarial source/unit contract for HC3-02 and HC3-03.
 *
 * This runner deliberately attacks every process-loss boundary in the
 * lease/job/generation protocol.  It does not use Podman or Oracle, and it
 * cannot award runtime acceptance.  The production reconciliation planner
 * and required-feature validator are executed directly; source checks bind
 * those decisions to the Oracle transaction and bootstrap paths.
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

const lock = read('backend/lib/datasetOperationLock.js');
const jobs = read('backend/lib/importJobs.js');
const state = read('backend/lib/datasetStateStore.js');
const generation = read('backend/lib/datasetGenerationStore.js');
const servingFenceSource = read('backend/lib/datasetServingFence.js');
const recoveryFinalizerSource = jobs.match(
  /async function finalizeGenerationRecovery\([\s\S]*?async function finalizeInterruptedWithoutSnapshot\(/i
)?.[0] || '';
const workflow = read('backend/lib/importWorkflowService.js');
const nativeJsonProofSql = workflow.match(
  /const jsonResult = await execSql\(connection,\s*`([\s\S]*?)`\s*\);/i
)?.[1] || '';
const server = read('backend/server.js');
const schema = `${read('db/schema/01_tables.sql')}\n${read('db/schema/13_dataset_generation_lifecycle.sql')}`;
const bootstrap = read('scripts/bootstrap_db.sh');

let lifecycle = null;
try {
  lifecycle = require(path.join(root, 'backend/lib/datasetGenerationStore.js'));
} catch (_) {
  lifecycle = null;
}

let servingFence = null;
try {
  servingFence = require(path.join(root, 'backend/lib/datasetServingFence.js'));
} catch (_) {
  servingFence = null;
}

const generationFor = (status, jobId = 'job-1') => ({
  generationId: 'gen-new',
  jobId,
  initiatingActor: 'admin_jess',
  priorGenerationId: 'gen-old',
  status,
  snapshotComplete: ['staged', 'applying', 'ready', 'recovering'].includes(status),
});
const jobFor = (status, generationId = 'gen-new') => ({
  jobId: 'job-1',
  generationId,
  initiatingActor: 'admin_jess',
  status,
});
const leaseFor = (jobId = 'job-1') => ({
  leaseToken: 'lease-1',
  jobId,
  status: 'running',
});

function requirePlanner() {
  assert.equal(typeof lifecycle?.planStartupReconciliation, 'function');
  return lifecycle.planStartupReconciliation;
}

function requireAllPlanner() {
  assert.equal(typeof lifecycle?.planAllStartupReconciliations, 'function');
  return lifecycle.planAllStartupReconciliations;
}

function requireFeatureValidator() {
  assert.equal(typeof lifecycle?.assertRequiredFeatureEvidence, 'function');
  return lifecycle.assertRequiredFeatureEvidence;
}

function requireServingPlanner() {
  assert.equal(typeof servingFence?.planDatasetServingRequest, 'function');
  return servingFence.planDatasetServingRequest;
}

function completeEvidence() {
  const generationId = 'gen-new';
  return {
    generationId,
    expectedCounts: { products: 3, socialPosts: 4, spatialPoints: 5, careServiceRequests: 2, productInventory: 3 },
    vector: { ready: true, generationId, productCount: 3, productEmbeddings: 3, postCount: 4, postEmbeddings: 4, model: 'ALL_MINILM_L12_V2' },
    oml: { ready: true, generationId, models: ['DEMAND_SURGE_MODEL', 'CUSTOMER_SEGMENT_MODEL', 'REVENUE_PREDICT_MODEL', 'PRODUCT_CLUSTER_MODEL'], rebuildHook: 'REBUILD_HEALTHCARE_OML_MODELS' },
    nativeJson: { ready: true, generationId, object: 'PRODUCT_ATTRIBUTES', productCount: 3, jsonRows: 3, executedRows: 3 },
    spatial: { ready: true, generationId, expectedPoints: 5, pointRows: 5, spatialIndexes: ['IDX_FC_SPATIAL', 'IDX_CUST_SPATIAL'] },
    graph: { ready: true, generationId, graph: 'CARE_PATHWAY_NETWORK', vertices: 5, edges: 4, probeRows: 4 },
    duality: { ready: true, generationId, views: ['CARE_SERVICE_REQUESTS_DV', 'PRODUCTS_INVENTORY_DV'], requestRows: 2, productRows: 3 },
  };
}

const checks = [
  ['schema persists generation journal', () => assert.match(schema, /CREATE TABLE app_dataset_generations/i)],
  ['schema binds jobs to generation', () => assert.match(schema, /generation_id\s+VARCHAR2\(100\)/i)],
  ['schema records prior generation', () => assert.match(schema, /prior_generation_id\s+VARCHAR2\(100\)/i)],
  ['schema records snapshot completeness', () => assert.match(schema, /snapshot_complete\s+NUMBER\(1\)/i)],
  ['schema records required feature evidence', () => assert.match(schema, /required_features_json\s+CLOB/i)],
  ['schema provides a durable prior-base snapshot journal', () => assert.match(schema, /rollback_dataset_json\s+CLOB/i)],
  ['bootstrap installs generation lifecycle schema', () => assert.match(bootstrap, /13_dataset_generation_lifecycle\.sql/i)],

  ['admission has one Oracle transaction owner', () => {
    assert.match(jobs, /async function admitDatasetJob[\s\S]*beginOperationOnConnection[\s\S]*INSERT INTO app_dataset_jobs[\s\S]*createGenerationOnConnection[\s\S]*connection\.commit\(\)/i);
    assert.match(generation, /async function createGenerationOnConnection[\s\S]*INSERT INTO app_dataset_generations/i);
  }],
  ['admission lease is born associated', () => assert.match(jobs, /beginOperationOnConnection\([\s\S]*jobId/i)],
  ['workflow no longer leases then separately creates job', () => assert.doesNotMatch(workflow, /acquireOperationLock\(kind[\s\S]*await createJob\(/i)],
  ['completion transaction activates generation', () => assert.match(jobs, /completeDatasetJobTransaction[\s\S]*activateGenerationOnConnection/i)],
  ['completion transaction releases exact owner lease', () => assert.match(jobs, /completeDatasetJobTransaction[\s\S]*endOperationOnConnection/i)],
  ['completion rejects missing lease release', () => assert.match(jobs, /terminal lease release[\s\S]*exactly one/i)],

  ['planner exists', () => requirePlanner()],
  ['unassociated active lease is released immediately', () => {
    const plan = requirePlanner()({ lease: leaseFor(null), jobs: [], generations: [] });
    assert.equal(plan.releaseLease, true);
    assert.equal(plan.reason, 'UNASSOCIATED_ACTIVE_LEASE');
  }],
  ['completed-owner lease is released immediately', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('completed')], generations: [generationFor('active')] });
    assert.equal(plan.releaseLease, true);
    assert.equal(plan.restoreGenerationId, null);
  }],
  ['failed-owner lease is released immediately', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('failed')], generations: [generationFor('rolled_back')] });
    assert.equal(plan.releaseLease, true);
    assert.equal(plan.restoreGenerationId, null);
  }],
  ['admitted crash fails without data restore', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('queued')], generations: [generationFor('admitted')] });
    assert.equal(plan.failJobId, 'job-1');
    assert.equal(plan.restoreGenerationId, null);
  }],
  ['snapshotting crash fails without data restore', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('running')], generations: [generationFor('snapshotting')] });
    assert.equal(plan.failJobId, 'job-1');
    assert.equal(plan.restoreGenerationId, null);
  }],
  ['staged crash restores prior generation', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('running')], generations: [generationFor('staged')] });
    assert.equal(plan.restoreGenerationId, 'gen-new');
  }],
  ['applying crash restores prior generation', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('running')], generations: [generationFor('applying')] });
    assert.equal(plan.restoreGenerationId, 'gen-new');
  }],
  ['ready-before-activation crash restores prior generation', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('running')], generations: [generationFor('ready')] });
    assert.equal(plan.restoreGenerationId, 'gen-new');
  }],
  ['recovery crash is idempotently retried', () => {
    const plan = requirePlanner()({ lease: leaseFor(), jobs: [jobFor('running')], generations: [generationFor('recovering')] });
    assert.equal(plan.restoreGenerationId, 'gen-new');
  }],
  ['recovery admission awaits its final read before closing the Oracle connection', () => {
    assert.match(
      generation,
      /async function markGenerationRecovering[\s\S]*await connection\.commit\(\)[\s\S]*return await getGenerationOnConnection\(connection,\s*generationId\)[\s\S]*finally[\s\S]*connection\.close\(\)/i
    );
  }],
  ['terminal recovery persists optional CLOB evidence without mixed-type COALESCE', () => {
    assert.doesNotMatch(
      recoveryFinalizerSource,
      /required_features_json\s*=\s*COALESCE\(\s*:requiredFeatures\s*,\s*required_features_json\s*\)/i
    );
    assert.match(
      recoveryFinalizerSource,
      /const requiredFeaturesAssignment\s*=\s*requiredFeatures\s*\?\s*'required_features_json = :requiredFeatures,'\s*:\s*''/i
    );
    assert.match(recoveryFinalizerSource, /\$\{requiredFeaturesAssignment\}/);
    assert.match(
      recoveryFinalizerSource,
      /\.\.\.\(requiredFeatures\s*\?\s*\{\s*requiredFeatures:\s*json\(requiredFeatures,\s*null\)\s*\}\s*:\s*\{\s*\}\s*\)/i
    );
  }],
  ['orphan applying generation is recovered without a lease', () => {
    const plan = requirePlanner()({ lease: null, jobs: [jobFor('running')], generations: [generationFor('applying')] });
    assert.equal(plan.restoreGenerationId, 'gen-new');
    assert.equal(plan.failJobId, 'job-1');
  }],
  ['multiple pending generations fail closed even when database rows are unordered', () => {
    assert.throws(() => requireAllPlanner()({
      lease: leaseFor('job-owner'),
      jobs: [
        { jobId: 'job-other', generationId: 'gen-other', initiatingActor: 'admin_jess', status: 'running' },
        { jobId: 'job-owner', generationId: 'gen-owner', initiatingActor: 'admin_jess', status: 'running' },
      ],
      generations: [
        { ...generationFor('applying', 'job-other'), generationId: 'gen-other' },
        { ...generationFor('staged', 'job-owner'), generationId: 'gen-owner' },
      ],
    }), /integrity|ambiguous/i);
  }],
  ['two incomplete generations never reuse the owner lease token', () => {
    assert.throws(() => requireAllPlanner()({
      lease: leaseFor('job-owner'),
      jobs: [
        { jobId: 'job-owner', generationId: 'gen-owner', initiatingActor: 'admin_jess', status: 'running' },
        { jobId: 'job-other', generationId: 'gen-other', initiatingActor: 'admin_jess', status: 'running' },
      ],
      generations: [
        { ...generationFor('ready', 'job-other'), generationId: 'gen-other' },
        { ...generationFor('recovering', 'job-owner'), generationId: 'gen-owner' },
      ],
    }), /integrity|ambiguous/i);
    assert.doesNotMatch(workflow, /leaseToken:\s*lifecycleState\.lease\?\.leaseToken/i);
  }],
  ['active committed generation is preserved', () => {
    const plan = requirePlanner()({ lease: null, jobs: [jobFor('completed')], generations: [generationFor('active')] });
    assert.equal(plan.restoreGenerationId, null);
    assert.equal(plan.failJobId, null);
  }],

  ['required feature validator accepts the complete exact set', () => assert.doesNotThrow(() => requireFeatureValidator()(completeEvidence()))],
  ['missing Vector fails closed', () => {
    const evidence = completeEvidence(); delete evidence.vector;
    assert.throws(() => requireFeatureValidator()(evidence), /vector/i);
  }],
  ['not-ready OML fails closed', () => {
    const evidence = completeEvidence(); evidence.oml.ready = false;
    assert.throws(() => requireFeatureValidator()(evidence), /oml/i);
  }],
  ['warning-only native JSON fails closed', () => {
    const evidence = completeEvidence(); evidence.nativeJson = { ready: true, warnings: ['not verified'] };
    assert.throws(() => requireFeatureValidator()(evidence), /nativeJson/i);
  }],
  ['native JSON proof uses Oracle-valid independent scalar counts', () => {
    assert.match(
      nativeJsonProofSql,
      /SELECT\s+\(\s*SELECT COUNT\(\*\) FROM products\s*\)\s+AS product_count,\s+\(\s*SELECT COUNT\(\*\) FROM product_attributes\s*\)\s+AS json_rows,\s+\(\s*SELECT COUNT\(\*\)\s+FROM product_attributes\s+WHERE JSON_VALUE\(attributes,\s*'\$\.sku'\s+RETURNING VARCHAR2\(100\)\)\s+IS NOT NULL\s*\)\s+AS executed_rows\s+FROM dual/i
    );
  }],
  ['missing Spatial fails closed', () => {
    const evidence = completeEvidence(); delete evidence.spatial;
    assert.throws(() => requireFeatureValidator()(evidence), /spatial/i);
  }],
  ['missing Graph fails closed', () => {
    const evidence = completeEvidence(); delete evidence.graph;
    assert.throws(() => requireFeatureValidator()(evidence), /graph/i);
  }],
  ['wrong Duality view fails closed', () => {
    const evidence = completeEvidence(); evidence.duality.views = ['ORDERS_DV'];
    assert.throws(() => requireFeatureValidator()(evidence), /duality/i);
  }],

  ['production dataset serving planner exists', () => requireServingPlanner()],
  ['nonterminal generation fences governed data with retryable 503', () => {
    const decision = requireServingPlanner()({
      path: '/dashboard/summary',
      generation: generationFor('applying'),
    });
    assert.equal(decision.allow, false);
    assert.equal(decision.statusCode, 503);
    assert.equal(decision.retryable, true);
  }],
  ['generation lookup failure fences governed data closed', () => {
    const decision = requireServingPlanner()({
      path: '/products',
      lookupFailed: true,
    });
    assert.equal(decision.allow, false);
    assert.equal(decision.code, 'DATASET_GENERATION_FENCE_UNAVAILABLE');
  }],
  ['health session identity and exact job polling remain available', () => {
    const plan = requireServingPlanner();
    for (const pathName of ['/health', '/demo-session', '/users', '/import/status/job-1']) {
      assert.equal(plan({ path: pathName, generation: generationFor('recovering') }).allow, true);
    }
  }],
  ['ordinary governed data is not exempt from the serving fence', () => {
    const plan = requireServingPlanner();
    for (const pathName of ['/dashboard/summary', '/products', '/orders/1', '/ml/summary']) {
      assert.equal(plan({ path: pathName, generation: generationFor('ready') }).allow, false);
    }
  }],
  ['server mounts the serving fence before governed data routers', () => {
    assert.match(server, /app\.use\('\/api',\s*createDatasetServingFence\([\s\S]*app\.use\('\/api\/dashboard'/i);
  }],
  ['forward worker raises the fence before admission and drains readers before apply', () => {
    assert.match(workflow, /beginDatasetServingTransition[\s\S]*admitDatasetJob/i);
    assert.match(workflow, /waitForDatasetReadersToDrain[\s\S]*executeImportPlan/i);
  }],
  ['forward worker clears only its own serving transition after convergence', () => {
    assert.match(workflow, /finally\s*\{[\s\S]*endDatasetServingTransition[\s\S]*transitionToken/i);
    assert.match(servingFenceSource, /function endDatasetServingTransition[\s\S]*activeTransition\.transitionToken\s*!==\s*transitionToken[\s\S]*return false[\s\S]*activeTransition\s*=\s*null/i);
  }],

  ['workflow snapshots before destructive delete', () => assert.match(workflow, /stageGenerationSnapshot[\s\S]*markGenerationApplying[\s\S]*deleteExistingImportData/i)],
  ['workflow proves features before ready', () => assert.match(workflow, /rebuildAndProveRequiredGenerationFeatures[\s\S]*assertRequiredFeatureEvidence[\s\S]*markGenerationReady/i)],
  ['required Vector absence is not a warning', () => assert.doesNotMatch(workflow, /Vector artifacts will be skipped/i)],
  ['required Vector failure is not swallowed', () => assert.doesNotMatch(workflow, /Vector artifact rebuild was skipped after import/i)],
  ['required OML absence is not a warning', () => assert.doesNotMatch(workflow, /no restore-owned OML rebuild procedure is installed/i)],
  ['startup reconciles lifecycle before listening', () => assert.match(server, /await reconcileDatasetLifecycleOnStartup\(\)[\s\S]*app\.listen/i)],
  ['startup reconciliation covers every active generation state and returns its summary', () => {
    assert.match(workflow, /for \(const recoveryPlan of recoveryPlans\)[\s\S]*restoreGenerationSnapshot[\s\S]*rebuildAndProveRequiredGenerationFeatures[\s\S]*finalizeGenerationRecovery/i);
    assert.match(workflow, /async function reconcileDatasetLifecycleOnStartup\(\)[\s\S]*return\s*\{\s*reconciled:\s*results\.length,\s*results,\s*\}/i);
    assert.match(server, /const recovery = await reconcileDatasetLifecycleOnStartup\(\)[\s\S]*recovery\.reconciled/i);
  }],
  ['startup recovery failure prevents readiness', () => assert.doesNotMatch(server, /reconcileDatasetLifecycleOnStartup\(\)\.catch/i)],
  ['snapshot cleanup follows terminal convergence', () => assert.match(workflow, /cleanupGenerationSnapshot[\s\S]*(terminal|completed|rolled_back)/i)],
];

const failures = [];
for (const [name, check] of checks) {
  try {
    check();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    process.stdout.write(`RED  ${name}\n`);
  }
}

process.stdout.write(`\nHealthcare atomic generation lifecycle: ${checks.length - failures.length}/${checks.length} PASS, ${failures.length} RED\n`);
if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
}
