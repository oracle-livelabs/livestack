const crypto = require('crypto');
const db = require('../config/database');

const EXPECTED_SEGMENTS = [
  'ORDERS',
  'ORDER_ITEMS',
  'SOCIAL_POSTS',
  'CUSTOMERS',
  'DEMAND_FORECASTS',
];
Object.freeze(EXPECTED_SEGMENTS);

function firstDefined(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return null;
}

function assertCanonicalInMemorySegments(
  rows,
  label = 'Retail In-Memory population'
) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_SEGMENTS.length) {
    throw new Error(
      `${label} requires exactly five canonical segment rows`
    );
  }
  const byName = new Map();
  for (const row of rows) {
    const name = String(firstDefined(
      row,
      ['SEGMENT_NAME', 'TABLE_NAME', 'segmentName', 'tableName']
    ) || '').trim().toUpperCase();
    if (!name || byName.has(name)) {
      throw new Error(`${label} contains a missing or duplicate segment`);
    }
    byName.set(name, row);
  }
  const actualNames = [...byName.keys()].sort();
  const expectedNames = [...EXPECTED_SEGMENTS].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${label} does not match the canonical five segments`);
  }
  for (const name of EXPECTED_SEGMENTS) {
    const row = byName.get(name);
    const tableInMemory = String(firstDefined(
      row,
      ['TABLE_INMEMORY', 'INMEMORY', 'tableInMemory']
    ) || '').trim().toUpperCase();
    const populateStatus = String(firstDefined(
      row,
      ['POPULATE_STATUS', 'STATUS', 'populateStatus']
    ) || '').trim().toUpperCase();
    const inMemoryBytes = Number(firstDefined(
      row,
      ['INMEMORY_BYTES', 'IM_BYTES', 'inMemoryBytes']
    ));
    const bytesNotPopulated = Number(firstDefined(
      row,
      ['BYTES_NOT_POPULATED', 'bytesNotPopulated']
    ));
    if (tableInMemory !== 'ENABLED'
        || populateStatus !== 'COMPLETED'
        || !Number.isFinite(inMemoryBytes)
        || inMemoryBytes <= 0
        || !Number.isFinite(bytesNotPopulated)
        || bytesNotPopulated !== 0) {
      throw new Error(
        `${label} requires ${name} to be COMPLETED with positive `
          + 'In-Memory bytes and zero bytes not populated'
      );
    }
  }
  return Object.freeze({
    ready: true,
    segmentCount: EXPECTED_SEGMENTS.length,
    segmentNames: EXPECTED_SEGMENTS,
  });
}

function fingerprintCandidate(candidateOml) {
  const manifest = (candidateOml?.models || [])
    .map((model) => `${model.logicalName}:${model.trainingFingerprint}:${model.trainingRowCount}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(manifest).digest('hex');
}

async function proveInMemoryOnConnection(connection, {
  generationId,
  jobId = null,
  datasetFingerprint,
  proofId = crypto.randomUUID().replace(/-/g, ''),
}) {
  const safeGeneration = String(generationId || '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 48);
  if (!safeGeneration || !/^[a-f0-9]{64}$/i.test(String(datasetFingerprint || ''))) {
    throw new Error('Generation-bound In-Memory evidence requires a valid generation and fingerprint.');
  }
  await connection.execute(`
    BEGIN
      ${EXPECTED_SEGMENTS.map((name) => `DBMS_INMEMORY.POPULATE(USER, '${name}');`).join('\n      ')}
    END;
  `, {}, { autoCommit: false });
  await connection.execute(`
    DECLARE populated_count PLS_INTEGER := 0;
    BEGIN
      FOR attempt IN 1..60 LOOP
        SELECT COUNT(*) INTO populated_count
        FROM retail_inmemory_segments_v
        WHERE table_inmemory = 'ENABLED'
          AND populate_status = 'COMPLETED'
          AND inmemory_bytes > 0
          AND bytes_not_populated = 0;
        EXIT WHEN populated_count = 5;
        DBMS_SESSION.SLEEP(1);
      END LOOP;
      IF populated_count <> 5 THEN
        RAISE_APPLICATION_ERROR(-20510, 'Five current In-Memory segments are required');
      END IF;
    END;
  `, {}, { autoCommit: false });
  await connection.execute(`
    SELECT /*+ GATHER_PLAN_STATISTICS FULL(retail_order) NO_INDEX(retail_order) */
           /* RETAIL_INMEMORY_GENERATION_${safeGeneration} */
           retail_order.order_status, COUNT(*) order_count,
           SUM(retail_order.order_total) order_total
    FROM orders retail_order
    GROUP BY retail_order.order_status
  `, {}, { autoCommit: false });
  const previous = await connection.execute(`
    SELECT prev_sql_id, prev_child_number
    FROM v$session
    WHERE audsid = SYS_CONTEXT('USERENV', 'SESSIONID')
  `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  const sqlId = previous.rows?.[0]?.PREV_SQL_ID;
  const childNumber = previous.rows?.[0]?.PREV_CHILD_NUMBER;
  if (!sqlId || !Number.isInteger(Number(childNumber))) {
    throw new Error('The current In-Memory cursor SQL ID/child identity is unavailable.');
  }
  const plan = await connection.execute(`
    SELECT plan_table_output
    FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
      :sqlId, :childNumber, 'BASIC +ALIAS +PREDICATE'
    ))
  `, { sqlId, childNumber }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const planText = (plan.rows || []).map((row) => row.PLAN_TABLE_OUTPUT).join('\n');
  if (!planText || /cannot be found|no plan table output/i.test(planText)) {
    throw new Error('The exact current-generation In-Memory cursor plan is unavailable.');
  }
  const exactPlan = await connection.execute(`
    SELECT operation, options, object_owner, object_name
    FROM v$sql_plan
    WHERE sql_id = :sqlId
      AND child_number = :childNumber
      AND operation = 'TABLE ACCESS'
      AND options = 'INMEMORY FULL'
      AND object_owner = USER
      AND object_name = 'ORDERS'
    ORDER BY id
    FETCH FIRST 1 ROW ONLY
  `, { sqlId, childNumber }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const planRow = exactPlan.rows?.[0];
  if (!planRow || !/TABLE ACCESS INMEMORY FULL/i.test(planText)) {
    throw new Error('The current generation analytic cursor did not use TABLE ACCESS INMEMORY FULL.');
  }
  const segments = await connection.execute(`
    SELECT segment_name, table_inmemory, populate_status,
           inmemory_bytes, bytes_not_populated
    FROM retail_inmemory_segments_v
    ORDER BY CASE segment_name
      WHEN 'ORDERS' THEN 1
      WHEN 'ORDER_ITEMS' THEN 2
      WHEN 'SOCIAL_POSTS' THEN 3
      WHEN 'CUSTOMERS' THEN 4
      WHEN 'DEMAND_FORECASTS' THEN 5
      ELSE 6
    END
  `, {}, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const segmentEvidence = assertCanonicalInMemorySegments(segments.rows || []);
  const populatedSegments = segmentEvidence.segmentCount;
  await connection.execute(`
    MERGE INTO app_inmemory_generation_evidence target
    USING (
      SELECT :generationId generation_id, :jobId job_id,
             :datasetFingerprint dataset_fingerprint,
             :populatedSegments populated_segments, :sqlId sql_id,
             :childNumber child_number, :planObjectOwner plan_object_owner,
             :planObjectName plan_object_name, :proofId proof_id
      FROM dual
    ) source
    ON (target.generation_id = source.generation_id)
    WHEN MATCHED THEN UPDATE SET
      target.job_id = source.job_id,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.populated_segments = source.populated_segments,
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_operation = 'TABLE ACCESS INMEMORY FULL',
      target.plan_object_owner = source.plan_object_owner,
      target.plan_object_name = source.plan_object_name,
      target.proof_id = source.proof_id,
      target.evidence_status = 'ACTIVE',
      target.verified_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (
      generation_id, job_id, dataset_fingerprint, populated_segments,
      sql_id, child_number, plan_operation, plan_object_owner,
      plan_object_name, proof_id, evidence_status, verified_at
    ) VALUES (
      source.generation_id, source.job_id, source.dataset_fingerprint,
      source.populated_segments, source.sql_id, source.child_number,
      'TABLE ACCESS INMEMORY FULL', source.plan_object_owner,
      source.plan_object_name, source.proof_id, 'ACTIVE', SYSTIMESTAMP
    )
  `, {
    generationId,
    jobId,
    datasetFingerprint,
    populatedSegments,
    sqlId,
    childNumber,
    planObjectOwner: planRow.OBJECT_OWNER,
    planObjectName: planRow.OBJECT_NAME,
    proofId,
  }, { autoCommit: false });
  return {
    populatedSegments,
    sqlId,
    childNumber: Number(childNumber),
    operation: 'TABLE ACCESS INMEMORY FULL',
    objectOwner: planRow.OBJECT_OWNER,
    objectName: planRow.OBJECT_NAME,
    proofId,
    datasetFingerprint,
  };
}

async function invalidateRestartSensitiveEvidence() {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const active = await connection.execute(`
      SELECT active_generation_id
      FROM app_dataset_state
      WHERE state_id = 1
      FOR UPDATE
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    const generationId = active.rows?.[0]?.ACTIVE_GENERATION_ID;
    if (!generationId) {
      throw new Error('Active dataset generation is unavailable for restart proof invalidation.');
    }
    await connection.execute(`
      UPDATE app_inmemory_generation_evidence
      SET evidence_status = 'FAILED',
          verified_at = SYSTIMESTAMP
      WHERE generation_id = :generationId
    `, { generationId }, { autoCommit: false });
    await connection.execute(`
      DELETE FROM app_feature_plan_evidence
      WHERE generation_id = :generationId
    `, { generationId }, { autoCommit: false });
    const readiness = await connection.execute(`
      UPDATE app_dataset_readiness
      SET status = 'FAILED',
          readiness = JSON_MERGEPATCH(
            readiness,
            JSON_OBJECT(
              'restartEvidence' VALUE 'PENDING',
              'inMemoryProofId' VALUE NULL
              RETURNING JSON
            )
          ),
          failure_message = 'Restart-sensitive Oracle plan evidence is being re-established.',
          updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
    `, {}, { autoCommit: false });
    if (Number(readiness.rowsAffected || 0) !== 1) {
      throw new Error('Restart evidence invalidation did not update readiness.');
    }
    await connection.commit();
    return { generationId };
  } finally {
    await db.releaseConnection(connection, {
      rollback: true,
      label: 'restart evidence invalidation',
    });
  }
}

async function completeRestartSensitiveReadiness({
  inMemoryProof,
  featurePlanProofs,
}) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const segmentResult = await connection.execute(`
      SELECT segment_name, table_inmemory, populate_status,
             inmemory_bytes, bytes_not_populated
      FROM retail_inmemory_segments_v
      ORDER BY CASE segment_name
        WHEN 'ORDERS' THEN 1
        WHEN 'ORDER_ITEMS' THEN 2
        WHEN 'SOCIAL_POSTS' THEN 3
        WHEN 'CUSTOMERS' THEN 4
        WHEN 'DEMAND_FORECASTS' THEN 5
        ELSE 6
      END
    `, {}, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false,
    });
    const canonicalSegmentEvidence = assertCanonicalInMemorySegments(
      segmentResult.rows || [],
      'Retail retained-restart In-Memory population'
    );
    const active = await connection.execute(`
      SELECT state.active_generation_id,
             evidence.dataset_fingerprint,
             evidence.proof_id,
             evidence.sql_id,
             evidence.child_number,
             evidence.plan_operation,
             evidence.plan_object_name,
             evidence.populated_segments,
             (SELECT COUNT(*)
                FROM retail_inmemory_segments_v
               WHERE table_inmemory = 'ENABLED'
                 AND populate_status = 'COMPLETED'
                 AND inmemory_bytes > 0
                 AND bytes_not_populated = 0) completed_segments,
             (SELECT COUNT(*)
                FROM retail_inmemory_segments_v
               WHERE table_inmemory <> 'ENABLED'
                  OR populate_status <> 'COMPLETED'
                  OR inmemory_bytes <= 0
                  OR bytes_not_populated <> 0) unpopulated_segments,
             (SELECT COUNT(*)
                FROM app_feature_plan_evidence plans
               WHERE plans.generation_id = state.active_generation_id
                 AND plans.dataset_fingerprint = evidence.dataset_fingerprint
                 AND plans.feature_name IN ('VECTOR','SPATIAL')
                 AND plans.plan_hash_value >= 0
                 AND REGEXP_LIKE(plans.sql_id, '^[0-9a-z]{13}$', 'c')
                 AND plans.child_number IS NOT NULL) feature_plan_count
      FROM app_dataset_state state
      JOIN app_inmemory_generation_evidence evidence
        ON evidence.generation_id = state.active_generation_id
      WHERE state.state_id = 1
        AND evidence.evidence_status = 'ACTIVE'
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    const row = active.rows?.[0];
    if (!row
        || row.PROOF_ID !== inMemoryProof?.proofId
        || row.DATASET_FINGERPRINT !== inMemoryProof?.datasetFingerprint
        || Number(row.CHILD_NUMBER) !== Number(inMemoryProof?.childNumber)
        || row.PLAN_OPERATION !== 'TABLE ACCESS INMEMORY FULL'
        || row.PLAN_OBJECT_NAME !== 'ORDERS'
        || Number(row.POPULATED_SEGMENTS) !== 5
        || Number(row.COMPLETED_SEGMENTS) !== 5
        || Number(row.UNPOPULATED_SEGMENTS) !== 0
        || canonicalSegmentEvidence.ready !== true
        || canonicalSegmentEvidence.segmentCount !== 5
        || Number(row.FEATURE_PLAN_COUNT) !== 2
        || featurePlanProofs?.vector?.datasetFingerprint !== row.DATASET_FINGERPRINT
        || featurePlanProofs?.spatial?.datasetFingerprint !== row.DATASET_FINGERPRINT) {
      throw new Error('Restart-sensitive Oracle evidence is incomplete.');
    }
    const updated = await connection.execute(`
      UPDATE app_dataset_readiness
      SET status = 'ACTIVE',
          readiness = JSON_MERGEPATCH(
            readiness,
            JSON_OBJECT(
              'generationId' VALUE :generationId,
              'datasetFingerprint' VALUE :datasetFingerprint,
              'inMemoryProofId' VALUE :proofId,
              'restartEvidence' VALUE 'ACTIVE'
              RETURNING JSON
            )
          ),
          failure_message = NULL,
          updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
    `, {
      generationId: row.ACTIVE_GENERATION_ID,
      datasetFingerprint: row.DATASET_FINGERPRINT,
      proofId: row.PROOF_ID,
    }, { autoCommit: false });
    if (Number(updated.rowsAffected || 0) !== 1) {
      throw new Error('Restart proof completion did not update readiness.');
    }
    await connection.commit();
    return {
      generationId: row.ACTIVE_GENERATION_ID,
      proofId: row.PROOF_ID,
    };
  } finally {
    await db.releaseConnection(connection, {
      rollback: true,
      label: 'restart evidence completion',
    });
  }
}

async function reestablishActiveInMemoryEvidence() {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const active = await connection.execute(`
      SELECT s.active_generation_id, r.job_id,
             e.dataset_fingerprint
      FROM app_dataset_state s
      LEFT JOIN app_dataset_readiness r ON r.readiness_id = 1
      LEFT JOIN app_inmemory_generation_evidence e
        ON e.generation_id = s.active_generation_id
      WHERE s.state_id = 1
    `, {}, { autoCommit: false });
    const row = active.rows?.[0];
    if (!row?.ACTIVE_GENERATION_ID || !row?.DATASET_FINGERPRINT) return null;
    const proof = await proveInMemoryOnConnection(connection, {
      generationId: row.ACTIVE_GENERATION_ID,
      jobId: row.JOB_ID,
      datasetFingerprint: row.DATASET_FINGERPRINT,
    });
    await connection.commit();
    return proof;
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'In-Memory startup evidence' });
  }
}

module.exports = {
  EXPECTED_SEGMENTS,
  assertCanonicalInMemorySegments,
  fingerprintCandidate,
  proveInMemoryOnConnection,
  invalidateRestartSensitiveEvidence,
  completeRestartSensitiveReadiness,
  reestablishActiveInMemoryEvidence,
};
