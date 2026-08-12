/*
 * Durable dataset-generation journal.
 *
 * Oracle commits caused by model DDL mean a Restore cannot rely on one long
 * application transaction.  Before destructive work begins, the importer
 * serializes the current importable base generation into this journal.  Any
 * admitted generation that does not reach the atomic ACTIVE/job-completed/
 * lease-released commit is rolled back from that journal before server
 * readiness.  Required derived features are rebuilt and proved on both the
 * forward and recovery paths.
 */
const db = require('../config/database');

const TABLE_NAME = 'APP_DATASET_GENERATIONS';
const NON_TERMINAL_STATUSES = new Set([
  'admitted',
  'snapshotting',
  'staged',
  'applying',
  'ready',
  'recovering',
]);
const SNAPSHOT_COMPLETE_STATUSES = new Set(['staged', 'applying', 'ready', 'recovering']);
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed']);
const REQUIRED_GENERATION_FEATURES = Object.freeze([
  'vector',
  'oml',
  'nativeJson',
  'spatial',
  'graph',
  'duality',
]);
const REQUIRED_OML_MODELS = Object.freeze([
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
]);
const REQUIRED_DUALITY_VIEWS = Object.freeze([
  'UTILITY_SERVICE_REQUESTS_DV',
  'PRODUCTS_INVENTORY_DV',
]);
const REQUIRED_SPATIAL_INDEXES = Object.freeze([
  'IDX_FC_SPATIAL',
  'IDX_CUST_SPATIAL',
]);

function parsed(value, fallback) {
  try {
    return value ? JSON.parse(String(value)) : fallback;
  } catch (_) {
    return fallback;
  }
}

function json(value, fallback = null) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch (_) {
    return JSON.stringify(fallback);
  }
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeActor(value) {
  const actor = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_.-]{1,128}$/.test(actor) ? actor : null;
}

function normalizeGenerationRow(row) {
  if (!row) return null;
  return {
    generationId: row.GENERATION_ID,
    jobId: row.JOB_ID || null,
    initiatingActor: normalizeActor(row.INITIATING_ACTOR),
    priorGenerationId: row.PRIOR_GENERATION_ID || null,
    status: normalizeStatus(row.STATUS),
    snapshotComplete: Number(row.SNAPSHOT_COMPLETE || 0) === 1,
    rollbackDataset: parsed(row.ROLLBACK_DATASET_JSON, null),
    priorDataset: parsed(row.PRIOR_DATASET_JSON, null),
    requiredFeatures: parsed(row.REQUIRED_FEATURES_JSON, null),
    recovery: parsed(row.RECOVERY_JSON, null),
    createdAt: row.CREATED_AT instanceof Date ? row.CREATED_AT.toISOString() : row.CREATED_AT,
    updatedAt: row.UPDATED_AT instanceof Date ? row.UPDATED_AT.toISOString() : row.UPDATED_AT,
  };
}

function normalizeJob(job) {
  if (!job) return null;
  return {
    ...job,
    jobId: job.jobId || job.JOB_ID || null,
    generationId: job.generationId || job.GENERATION_ID || null,
    initiatingActor: normalizeActor(job.initiatingActor || job.INITIATING_ACTOR),
    status: normalizeStatus(job.status || job.STATUS),
  };
}

function normalizeGeneration(generation) {
  if (!generation) return null;
  const status = normalizeStatus(generation.status || generation.STATUS);
  const explicitSnapshot = generation.snapshotComplete;
  return {
    ...generation,
    generationId: generation.generationId || generation.GENERATION_ID || null,
    jobId: generation.jobId || generation.JOB_ID || null,
    initiatingActor: normalizeActor(generation.initiatingActor || generation.INITIATING_ACTOR),
    priorGenerationId: generation.priorGenerationId || generation.PRIOR_GENERATION_ID || null,
    status,
    snapshotComplete: explicitSnapshot == null
      ? (Number(generation.SNAPSHOT_COMPLETE || 0) === 1 || SNAPSHOT_COMPLETE_STATUSES.has(status))
      : Boolean(explicitSnapshot),
  };
}

function normalizeLease(lease) {
  if (!lease) return null;
  return {
    ...lease,
    leaseToken: lease.leaseToken || lease.LEASE_TOKEN || null,
    jobId: lease.jobId || lease.OWNER_JOB_ID || null,
    status: normalizeStatus(lease.status || lease.STATUS),
  };
}

/**
 * Pure, executable reconciliation planner.  The Oracle startup path consumes
 * these decisions, and the adversarial verifier attacks every state.
 */
function planStartupReconciliation({ lease = null, jobs = [], generations = [] } = {}) {
  const normalizedLease = normalizeLease(lease);
  const normalizedJobs = jobs.map(normalizeJob).filter(Boolean);
  const normalizedGenerations = generations.map(normalizeGeneration).filter(Boolean);
  const jobsById = new Map(normalizedJobs.map((job) => [job.jobId, job]));

  const incompleteGeneration = normalizedGenerations.find((generation) =>
    NON_TERMINAL_STATUSES.has(generation.status)
  ) || null;
  const leaseJob = normalizedLease?.jobId ? jobsById.get(normalizedLease.jobId) || null : null;

  if (incompleteGeneration) {
    const generationJob = jobsById.get(incompleteGeneration.jobId) || leaseJob || null;
    const snapshotComplete =
      incompleteGeneration.snapshotComplete ||
      SNAPSHOT_COMPLETE_STATUSES.has(incompleteGeneration.status);
    return {
      reason: snapshotComplete ? 'INCOMPLETE_GENERATION_REQUIRES_ROLLBACK' : 'PRE_APPLY_GENERATION_INTERRUPTED',
      releaseLease: Boolean(normalizedLease),
      leaseToken: normalizedLease?.leaseToken || null,
      leaseJobId: normalizedLease?.jobId || null,
      failJobId: generationJob?.jobId || incompleteGeneration.jobId || null,
      initiatingActor: incompleteGeneration.initiatingActor || generationJob?.initiatingActor || null,
      restoreGenerationId: snapshotComplete ? incompleteGeneration.generationId : null,
      cleanupGenerationId: snapshotComplete ? null : incompleteGeneration.generationId,
    };
  }

  if (normalizedLease?.leaseToken && !normalizedLease.jobId) {
    return {
      reason: 'UNASSOCIATED_ACTIVE_LEASE',
      releaseLease: true,
      leaseToken: normalizedLease.leaseToken,
      leaseJobId: null,
      failJobId: null,
      initiatingActor: null,
      restoreGenerationId: null,
      cleanupGenerationId: null,
    };
  }

  if (normalizedLease?.leaseToken && (!leaseJob || TERMINAL_JOB_STATUSES.has(leaseJob.status))) {
    return {
      reason: leaseJob ? 'TERMINAL_OWNER_LEASE' : 'UNKNOWN_OWNER_LEASE',
      releaseLease: true,
      leaseToken: normalizedLease.leaseToken,
      leaseJobId: normalizedLease.jobId,
      failJobId: null,
      initiatingActor: leaseJob?.initiatingActor || null,
      restoreGenerationId: null,
      cleanupGenerationId: null,
    };
  }

  const orphanJob = normalizedJobs.find((job) => !TERMINAL_JOB_STATUSES.has(job.status));
  if (orphanJob) {
    return {
      reason: 'ORPHAN_NONTERMINAL_JOB',
      releaseLease: Boolean(normalizedLease),
      leaseToken: normalizedLease?.leaseToken || null,
      leaseJobId: normalizedLease?.jobId || null,
      failJobId: orphanJob.jobId,
      initiatingActor: orphanJob.initiatingActor || null,
      restoreGenerationId: null,
      cleanupGenerationId: orphanJob.generationId || null,
    };
  }

  return {
    reason: 'CONSISTENT',
    releaseLease: false,
    leaseToken: null,
    leaseJobId: null,
    failJobId: null,
    initiatingActor: null,
    restoreGenerationId: null,
    cleanupGenerationId: null,
  };
}

function lifecycleIntegrityFailure(details) {
  const error = new Error(`Dataset lifecycle integrity is ambiguous; startup recovery refused: ${details}`);
  error.code = 'DATASET_LIFECYCLE_INTEGRITY_ERROR';
  throw error;
}

function assertUnambiguousStartupState({ lease, jobs, generations }) {
  const duplicateJobIds = [...new Set(
    jobs
      .map((job) => job.jobId)
      .filter((jobId, index, all) => jobId && all.indexOf(jobId) !== index)
  )].sort();
  const duplicateGenerationIds = [...new Set(
    generations
      .map((generation) => generation.generationId)
      .filter((generationId, index, all) => generationId && all.indexOf(generationId) !== index)
  )].sort();
  if (duplicateJobIds.length || duplicateGenerationIds.length) {
    lifecycleIntegrityFailure('duplicate durable lifecycle identities');
  }

  const pendingGenerations = generations
    .filter((generation) => NON_TERMINAL_STATUSES.has(generation.status))
    .sort((left, right) => String(left.generationId || '').localeCompare(String(right.generationId || '')));
  const pendingJobs = jobs
    .filter((job) => !TERMINAL_JOB_STATUSES.has(job.status))
    .sort((left, right) => String(left.jobId || '').localeCompare(String(right.jobId || '')));

  // The installed unique work index permits exactly one nonterminal
  // generation. Seeing more than one means corruption or a legacy migration
  // conflict. Guessing an order could restore the wrong prior snapshot or
  // reuse the sole live lease token, so fail readiness before planning.
  if (pendingGenerations.length > 1) {
    lifecycleIntegrityFailure('multiple nonterminal generations');
  }
  if (pendingJobs.length > 1) {
    lifecycleIntegrityFailure('multiple nonterminal jobs');
  }

  const generation = pendingGenerations[0] || null;
  if (generation) {
    const ownerJob = pendingJobs.find((job) => job.jobId === generation.jobId) || null;
    if (!generation.generationId || !generation.jobId) {
      lifecycleIntegrityFailure('nonterminal generation is missing its durable identity');
    }
    if (!generation.initiatingActor) {
      lifecycleIntegrityFailure('nonterminal generation is missing its initiating actor');
    }
    if (ownerJob && ownerJob.initiatingActor !== generation.initiatingActor) {
      lifecycleIntegrityFailure('job and generation initiating actors disagree');
    }
    if (lease?.jobId && lease.jobId !== generation.jobId && pendingJobs.length) {
      lifecycleIntegrityFailure('lease owner does not match the nonterminal generation');
    }
  } else if (pendingJobs[0] && !pendingJobs[0].initiatingActor) {
    lifecycleIntegrityFailure('nonterminal job is missing its initiating actor');
  }
}

function planAllStartupReconciliations(input = {}) {
  const lease = normalizeLease(input.lease);
  const jobs = (input.jobs || []).map(normalizeJob).filter(Boolean);
  const generations = (input.generations || []).map(normalizeGeneration).filter(Boolean);
  assertUnambiguousStartupState({ lease, jobs, generations });
  const pending = generations.filter((generation) => NON_TERMINAL_STATUSES.has(generation.status));
  const plans = [];
  const handledJobIds = new Set();
  let leaseAssigned = false;

  // Oracle row order is not lifecycle order. The sole lease follows its exact
  // owner generation, which is reconciled first; it is never handed to a
  // different generation merely because that row happened to arrive first.
  const orderedPending = [...pending].sort((left, right) => {
    const leftOwnsLease = Boolean(lease?.jobId && left.jobId === lease.jobId);
    const rightOwnsLease = Boolean(lease?.jobId && right.jobId === lease.jobId);
    return Number(rightOwnsLease) - Number(leftOwnsLease);
  });

  for (const generation of orderedPending) {
    const ownsLease = Boolean(lease?.leaseToken && generation.jobId === lease.jobId);
    plans.push(planStartupReconciliation({
      lease: ownsLease ? lease : null,
      jobs,
      generations: [generation],
    }));
    if (generation.jobId) handledJobIds.add(generation.jobId);
    if (ownsLease) leaseAssigned = true;
  }

  // Corrupt or legacy states can contain a nonterminal job without a
  // generation. Reconcile each one independently and associate the lease only
  // when the exact owner job matches.
  for (const job of jobs.filter(
    (candidate) => !TERMINAL_JOB_STATUSES.has(candidate.status) && !handledJobIds.has(candidate.jobId)
  )) {
    const ownsLease = Boolean(lease?.leaseToken && job.jobId === lease.jobId);
    plans.push(planStartupReconciliation({
      lease: ownsLease ? lease : null,
      jobs: [job],
      generations: [],
    }));
    if (ownsLease) leaseAssigned = true;
  }

  // Unassociated, unknown-owner, and terminal-owner leases remain actionable
  // even when unrelated incomplete generations also exist.
  if (lease?.leaseToken && !leaseAssigned) {
    const ownerJob = jobs.find((job) => job.jobId === lease.jobId);
    plans.push(planStartupReconciliation({
      lease,
      jobs: ownerJob ? [ownerJob] : [],
      generations: generations.filter((generation) => generation.jobId === lease.jobId),
    }));
  }

  return plans.length ? plans : [planStartupReconciliation({
    lease: null,
    jobs,
    generations,
  })];
}

function featureFailure(featureName, message) {
  const error = new Error(`Required generation feature ${featureName} is not ready: ${message}`);
  error.code = 'REQUIRED_GENERATION_FEATURE_NOT_READY';
  error.feature = featureName;
  throw error;
}

function assertRequiredFeatureEvidence(evidence, { generationId = null } = {}) {
  if (!evidence || typeof evidence !== 'object') {
    featureFailure('all', 'evidence is missing');
  }

  const expectedGeneration = String(generationId || evidence.generationId || '').trim();
  if (!expectedGeneration || String(evidence.generationId || '').trim() !== expectedGeneration) {
    featureFailure('generation', 'evidence is not bound to the exact generation');
  }

  for (const featureName of REQUIRED_GENERATION_FEATURES) {
    const feature = evidence[featureName];
    if (!feature || feature.ready !== true) {
      featureFailure(featureName, 'ready=true was not proved');
    }
    if (Array.isArray(feature.warnings) && feature.warnings.length) {
      featureFailure(featureName, 'warning-only evidence is not accepted');
    }
    if (String(feature.generationId || '').trim() !== expectedGeneration) {
      featureFailure(featureName, 'proof belongs to another generation');
    }
  }

  const expected = evidence.expectedCounts || {};
  const expectedProducts = Number(expected.products);
  const expectedPosts = Number(expected.socialPosts);
  const expectedSpatialPoints = Number(expected.spatialPoints);
  const expectedRequests = Number(expected.serviceRequests);
  const expectedInventory = Number(expected.productInventory);
  const vector = evidence.vector;
  if (
    vector.model !== 'ALL_MINILM_L12_V2' ||
    !Number.isFinite(expectedProducts) ||
    expectedProducts <= 0 ||
    Number(vector.productCount) !== expectedProducts ||
    Number(vector.productEmbeddings) !== expectedProducts ||
    !Number.isFinite(expectedPosts) ||
    expectedPosts <= 0 ||
    Number(vector.postCount) !== expectedPosts ||
    Number(vector.postEmbeddings) !== expectedPosts
  ) {
    featureFailure('vector', 'exact model and positive generation-bound embedding counts are required');
  }

  const omlModels = new Set((evidence.oml.models || []).map((value) => String(value).toUpperCase()));
  if (
    evidence.oml.rebuildHook !== 'REBUILD_UTILITIES_OML_MODELS' ||
    REQUIRED_OML_MODELS.some((modelName) => !omlModels.has(modelName))
  ) {
    featureFailure('oml', 'all four exact persisted OML models are required');
  }

  if (
    String(evidence.nativeJson.object || '').toUpperCase() !== 'PRODUCT_ATTRIBUTES' ||
    Number(evidence.nativeJson.productCount) !== expectedProducts ||
    Number(evidence.nativeJson.jsonRows) !== expectedProducts ||
    Number(evidence.nativeJson.executedRows) !== expectedProducts
  ) {
    featureFailure('nativeJson', 'positive executed generation-bound PRODUCT_ATTRIBUTES JSON evidence is required');
  }

  const spatialIndexes = new Set((evidence.spatial.spatialIndexes || []).map((value) => String(value).toUpperCase()));
  if (
    !Number.isFinite(expectedSpatialPoints) ||
    expectedSpatialPoints <= 0 ||
    Number(evidence.spatial.expectedPoints) !== expectedSpatialPoints ||
    Number(evidence.spatial.pointRows) !== expectedSpatialPoints ||
    REQUIRED_SPATIAL_INDEXES.some((indexName) => !spatialIndexes.has(indexName))
  ) {
    featureFailure('spatial', 'point rows and both exact VALID spatial indexes are required');
  }

  if (
    String(evidence.graph.graph || '').toUpperCase() !== 'SERVICE_RESTORATION_NETWORK' ||
    Number(evidence.graph.vertices) <= 0 ||
    Number(evidence.graph.edges) <= 0 ||
    Number(evidence.graph.probeRows) <= 0
  ) {
    featureFailure('graph', 'exact SERVICE_RESTORATION_NETWORK with positive executed SQL/PGQ evidence is required');
  }

  const dualityViews = new Set((evidence.duality.views || []).map((value) => String(value).toUpperCase()));
  if (
    REQUIRED_DUALITY_VIEWS.some((viewName) => !dualityViews.has(viewName)) ||
    !Number.isFinite(expectedRequests) ||
    expectedRequests <= 0 ||
    Number(evidence.duality.requestRows) !== expectedRequests ||
    !Number.isFinite(expectedInventory) ||
    expectedInventory <= 0 ||
    Number(evidence.duality.productRows) !== expectedInventory
  ) {
    featureFailure('duality', 'both exact utilities Duality Views and positive generation-bound row evidence are required');
  }

  return evidence;
}

async function ensureTable(connection) {
  const exists = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM user_tables WHERE table_name = :tableName`,
    { tableName: TABLE_NAME },
    { autoCommit: false }
  );
  if (!Number(exists.rows[0]?.CNT || 0)) {
    throw new Error('APP_DATASET_GENERATIONS is missing; run db/schema/13_dataset_generation_lifecycle.sql before the app starts.');
  }
}

async function createGenerationOnConnection(connection, {
  generationId,
  jobId,
  initiatingActor,
  priorGenerationId = null,
  priorDataset = null,
}) {
  await ensureTable(connection);
  await connection.execute(`
    INSERT INTO app_dataset_generations (
      generation_id, job_id, initiating_actor, prior_generation_id, status, snapshot_complete,
      prior_dataset_json, created_at, updated_at
    ) VALUES (
      :generationId, :jobId, :initiatingActor, :priorGenerationId, 'admitted', 0,
      :priorDataset, SYSTIMESTAMP, SYSTIMESTAMP
    )
  `, {
    generationId,
    jobId,
    initiatingActor,
    priorGenerationId,
    priorDataset: json(priorDataset, null),
  }, { autoCommit: false });
}

async function stageGenerationSnapshotOnConnection(connection, generationId, rollbackDataset) {
  await ensureTable(connection);
  const snapshotting = await connection.execute(`
    UPDATE app_dataset_generations
    SET status = 'snapshotting', updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND status = 'admitted'
  `, { generationId }, { autoCommit: false });
  if (snapshotting.rowsAffected !== 1) {
    throw new Error(`Generation ${generationId} could not enter snapshotting.`);
  }
  await connection.commit();

  const staged = await connection.execute(`
    UPDATE app_dataset_generations
    SET status = 'staged',
        snapshot_complete = 1,
        rollback_dataset_json = :rollbackDataset,
        updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND status = 'snapshotting'
  `, { generationId, rollbackDataset: json(rollbackDataset, null) }, { autoCommit: false });
  if (staged.rowsAffected !== 1) {
    throw new Error(`Generation ${generationId} rollback snapshot was not staged.`);
  }
  await connection.commit();
}

async function markGenerationApplyingOnConnection(connection, generationId) {
  const result = await connection.execute(`
    UPDATE app_dataset_generations
    SET status = 'applying', apply_started_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND status = 'staged'
      AND snapshot_complete = 1
  `, { generationId }, { autoCommit: false });
  if (result.rowsAffected !== 1) {
    throw new Error(`Generation ${generationId} is not durably staged.`);
  }
  await connection.commit();
}

async function markGenerationReadyOnConnection(connection, generationId, requiredFeatures) {
  assertRequiredFeatureEvidence(requiredFeatures, { generationId });
  const result = await connection.execute(`
    UPDATE app_dataset_generations
    SET status = 'ready',
        required_features_json = :requiredFeatures,
        ready_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND status IN ('applying', 'recovering')
      AND snapshot_complete = 1
  `, { generationId, requiredFeatures: json(requiredFeatures, null) }, { autoCommit: false });
  if (result.rowsAffected !== 1) {
    throw new Error(`Generation ${generationId} could not become ready.`);
  }
  await connection.commit();
}

async function activateGenerationOnConnection(connection, {
  generationId,
  jobId,
  requiredFeatures,
}) {
  assertRequiredFeatureEvidence(requiredFeatures, { generationId });
  const result = await connection.execute(`
    UPDATE app_dataset_generations
    SET status = 'active',
        required_features_json = :requiredFeatures,
        activated_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND job_id = :jobId
      AND status = 'ready'
      AND snapshot_complete = 1
  `, {
    generationId,
    jobId,
    requiredFeatures: json(requiredFeatures, null),
  }, { autoCommit: false });
  if (result.rowsAffected !== 1) {
    throw new Error(`Generation ${generationId} was not ready for activation.`);
  }

  await connection.execute(`
    UPDATE app_dataset_generations
    SET status = 'superseded', updated_at = SYSTIMESTAMP
    WHERE generation_id <> :generationId
      AND status = 'active'
  `, { generationId }, { autoCommit: false });
}

async function getGenerationOnConnection(connection, generationId, { forUpdate = false } = {}) {
  await ensureTable(connection);
  const result = await connection.execute(`
    SELECT generation_id, job_id, initiating_actor, prior_generation_id, status, snapshot_complete,
           rollback_dataset_json, prior_dataset_json, required_features_json,
           recovery_json, created_at, updated_at
    FROM app_dataset_generations
    WHERE generation_id = :generationId
    ${forUpdate ? 'FOR UPDATE' : ''}
  `, { generationId }, { autoCommit: false });
  return normalizeGenerationRow(result.rows[0] || null);
}

async function getGeneration(generationId) {
  let connection;
  try {
    connection = await db.getConnection();
    return await getGenerationOnConnection(connection, generationId);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function markGenerationRecovering(generationId, reason) {
  let connection;
  try {
    connection = await db.getConnection();
    await ensureTable(connection);
    const result = await connection.execute(`
      UPDATE app_dataset_generations
      SET status = 'recovering',
          recovery_json = :recovery,
          updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId
        AND status IN ('staged', 'applying', 'ready', 'recovering')
        AND snapshot_complete = 1
    `, {
      generationId,
      recovery: json({ reason, startedAt: new Date().toISOString(), policy: 'restore-prior-generation' }, {}),
    }, { autoCommit: false });
    if (result.rowsAffected !== 1) {
      throw new Error(`Generation ${generationId} does not have a complete rollback snapshot.`);
    }
    await connection.commit();
    return await getGenerationOnConnection(connection, generationId);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function loadStartupLifecycleState() {
  let connection;
  try {
    connection = await db.getConnection();
    await ensureTable(connection);
    // node-oracledb permits one operation at a time per connection.
    const leaseResult = await connection.execute(`
        SELECT lease_token, owner_job_id, operation_kind, status, message, progress,
               lease_expires_at
        FROM app_dataset_operation_lock
        WHERE lock_id = 1
      `, {}, { autoCommit: false });
    const jobsResult = await connection.execute(`
        SELECT job_id, status, generation_id, initiating_actor
        FROM app_dataset_jobs
        WHERE status IN ('queued', 'running')
           OR job_id = (SELECT owner_job_id FROM app_dataset_operation_lock WHERE lock_id = 1)
        ORDER BY job_id
      `, {}, { autoCommit: false });
    const generationsResult = await connection.execute(`
        SELECT generation_id, job_id, prior_generation_id, status, snapshot_complete, initiating_actor
        FROM app_dataset_generations
        WHERE status IN ('admitted', 'snapshotting', 'staged', 'applying', 'ready', 'recovering')
           OR job_id = (SELECT owner_job_id FROM app_dataset_operation_lock WHERE lock_id = 1)
        ORDER BY generation_id
      `, {}, { autoCommit: false });

    const leaseRow = leaseResult.rows[0] || null;
    return {
      lease: leaseRow?.LEASE_TOKEN ? {
        leaseToken: leaseRow.LEASE_TOKEN,
        jobId: leaseRow.OWNER_JOB_ID || null,
        status: leaseRow.STATUS,
      } : null,
      jobs: (jobsResult.rows || []).map((row) => ({
        jobId: row.JOB_ID,
        status: row.STATUS,
        generationId: row.GENERATION_ID || null,
        initiatingActor: normalizeActor(row.INITIATING_ACTOR),
      })),
      generations: (generationsResult.rows || []).map((row) => ({
        generationId: row.GENERATION_ID,
        jobId: row.JOB_ID || null,
        initiatingActor: normalizeActor(row.INITIATING_ACTOR),
        priorGenerationId: row.PRIOR_GENERATION_ID || null,
        status: row.STATUS,
        snapshotComplete: Number(row.SNAPSHOT_COMPLETE || 0) === 1,
      })),
    };
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function cleanupGenerationSnapshot(generationId, terminalStatus) {
  if (!['active', 'rolled_back', 'failed', 'superseded'].includes(normalizeStatus(terminalStatus))) {
    throw new Error('Generation snapshot cleanup requires a terminal status.');
  }
  let connection;
  try {
    connection = await db.getConnection();
    await ensureTable(connection);
    const result = await connection.execute(`
      UPDATE app_dataset_generations
      SET rollback_dataset_json = NULL, updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId
        AND status IN ('active', 'rolled_back', 'failed', 'superseded')
    `, { generationId }, { autoCommit: false });
    await connection.commit();
    return result.rowsAffected || 0;
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

module.exports = {
  REQUIRED_GENERATION_FEATURES,
  REQUIRED_OML_MODELS,
  REQUIRED_DUALITY_VIEWS,
  REQUIRED_SPATIAL_INDEXES,
  NON_TERMINAL_STATUSES,
  planStartupReconciliation,
  planAllStartupReconciliations,
  assertRequiredFeatureEvidence,
  ensureTable,
  createGenerationOnConnection,
  stageGenerationSnapshotOnConnection,
  markGenerationApplyingOnConnection,
  markGenerationReadyOnConnection,
  activateGenerationOnConnection,
  getGenerationOnConnection,
  getGeneration,
  markGenerationRecovering,
  loadStartupLifecycleState,
  cleanupGenerationSnapshot,
};
