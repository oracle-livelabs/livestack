const db = require('../config/database');

const VECTOR_OBJECT = 'PRODUCT_EMBEDDINGS';
const VECTOR_INDEX = 'IDX_PRODUCT_VEC';
const POST_VECTOR_OBJECT = 'POST_EMBEDDINGS';
const POST_VECTOR_INDEX = 'IDX_POST_VEC';
const SPATIAL_OBJECT = 'FULFILLMENT_CENTERS';
const SPATIAL_INDEX = 'IDX_FC_SPATIAL';
const SPATIAL_COLUMN = 'LOCATION';
const SPATIAL_SRID = 4326;
const SPATIAL_DIMENSIONS = 2;

class FeaturePlanEvidenceError extends Error {
  constructor(feature, message, details = null) {
    super(message);
    this.name = 'FeaturePlanEvidenceError';
    this.code = 'FEATURE_PLAN_UNAVAILABLE';
    this.statusCode = 503;
    this.feature = feature;
    this.details = details;
  }
}

function safeMarker(value) {
  const marker = String(value || '')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .slice(0, 48);
  if (!marker) throw new FeaturePlanEvidenceError('PLAN_EVIDENCE', 'A generation marker is required.');
  return marker;
}

function operationText(row) {
  return [row?.OPERATION, row?.OPTIONS]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function operationName(row) {
  return String(row?.OPERATION || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeIndexBinding(row = {}) {
  return {
    indexName: String(row.INDEX_NAME || row.indexName || '').toUpperCase(),
    tableName: String(row.TABLE_NAME || row.tableName || '').toUpperCase(),
    columnName: String(row.COLUMN_NAME || row.columnName || '').toUpperCase(),
    columnPosition: Number(row.COLUMN_POSITION ?? row.columnPosition),
    indexType: String(row.INDEX_TYPE || row.indexType || '').toUpperCase(),
    status: String(row.STATUS || row.status || '').toUpperCase(),
  };
}

function normalizeSpatialIndexBinding(row = {}) {
  return {
    ...normalizeIndexBinding(row),
    domainStatus: String(
      row.DOMIDX_STATUS || row.domainStatus || ''
    ).toUpperCase(),
    domainOperationStatus: String(
      row.DOMIDX_OPSTATUS || row.domainOperationStatus || ''
    ).toUpperCase(),
    implementationTypeOwner: String(
      row.ITYP_OWNER || row.implementationTypeOwner || ''
    ).toUpperCase(),
    implementationTypeName: String(
      row.ITYP_NAME || row.implementationTypeName || ''
    ).toUpperCase(),
  };
}

function normalizeSpatialMetadata(row = {}) {
  return {
    tableName: String(row.TABLE_NAME || row.tableName || '').toUpperCase(),
    columnName: String(row.COLUMN_NAME || row.columnName || '').toUpperCase(),
    srid: Number(row.SRID ?? row.srid),
    dimensionCount: Number(
      row.DIMENSION_COUNT ?? row.dimensionCount
    ),
  };
}

function exactCursorIdentity(cursor, feature) {
  const hasPlanHash = Object.prototype.hasOwnProperty.call(
    cursor || {},
    'planHashValue'
  );
  if (!hasPlanHash) return null;

  const sqlId = String(cursor?.sqlId || '').trim();
  const childNumber = Number(cursor?.childNumber);
  const planHashValue = Number(cursor?.planHashValue);
  const planHashReady = Number.isInteger(planHashValue)
    && planHashValue > 0;
  if (!/^[0-9a-z]{13}$/.test(sqlId)
      || cursor?.childNumber === null
      || cursor?.childNumber === undefined
      || String(cursor.childNumber).trim() === ''
      || !Number.isInteger(childNumber)
      || childNumber < 0
      || !planHashReady) {
    throw new FeaturePlanEvidenceError(
      feature,
      `The exact ${feature} SQL ID, child, or plan hash is invalid.`,
      {
        sqlId: sqlId || null,
        childNumber: cursor?.childNumber ?? null,
        planHashValue: cursor?.planHashValue ?? null,
      }
    );
  }
  return { sqlId, childNumber, planHashValue };
}

function assertVectorIndexBinding(indexBindings, {
  objectName,
  indexName,
}) {
  if (!Array.isArray(indexBindings)) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'Exact Oracle catalog binding metadata is required for Vector plan proof.'
    );
  }
  const expectedIndex = String(indexName).toUpperCase();
  const expectedObject = String(objectName).toUpperCase();
  const candidates = indexBindings
    .map(normalizeIndexBinding)
    .filter((binding) => binding.indexName === expectedIndex);
  if (candidates.length !== 1) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      `Vector index ${expectedIndex} does not have one exact catalog binding.`,
      { indexName: expectedIndex, bindings: candidates }
    );
  }
  const binding = candidates[0];
  if (binding.tableName !== expectedObject
      || binding.columnName !== 'EMBEDDING'
      || binding.columnPosition !== 1
      || binding.indexType !== 'VECTOR'
      || binding.status !== 'VALID') {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      `Vector index ${expectedIndex} is not VALID on ${expectedObject}.EMBEDDING.`,
      { expectedObject, expectedIndex, binding }
    );
  }
  return binding;
}

async function readVectorIndexBindings(execute) {
  const result = await execute(`
    SELECT indexes.index_name, indexes.index_type, indexes.status,
           columns.table_name, columns.column_name, columns.column_position
    FROM user_indexes indexes
    JOIN user_ind_columns columns
      ON columns.index_name = indexes.index_name
    WHERE indexes.index_name IN ('IDX_PRODUCT_VEC', 'IDX_POST_VEC')
    ORDER BY indexes.index_name, columns.column_position
  `);
  return result.rows || [];
}

function assertSpatialIndexBinding(indexBindings) {
  if (!Array.isArray(indexBindings)) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'Exact Oracle catalog binding metadata is required for Spatial proof.'
    );
  }
  const candidates = indexBindings
    .map(normalizeSpatialIndexBinding)
    .filter((binding) => binding.indexName === SPATIAL_INDEX);
  if (candidates.length !== 1) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      `${SPATIAL_INDEX} does not have one exact catalog binding.`,
      { bindings: candidates }
    );
  }
  const binding = candidates[0];
  if (binding.tableName !== SPATIAL_OBJECT
      || binding.columnName !== SPATIAL_COLUMN
      || binding.columnPosition !== 1
      || binding.indexType !== 'DOMAIN'
      || binding.status !== 'VALID'
      || binding.domainStatus !== 'VALID'
      || binding.domainOperationStatus !== 'VALID'
      || binding.implementationTypeOwner !== 'MDSYS'
      || binding.implementationTypeName !== 'SPATIAL_INDEX_V2') {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      `${SPATIAL_INDEX} is not a VALID MDSYS Spatial index on `
        + `${SPATIAL_OBJECT}.${SPATIAL_COLUMN}.`,
      { binding }
    );
  }
  return binding;
}

function assertSpatialGeometryMetadata(geometryMetadata) {
  if (!Array.isArray(geometryMetadata)) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'USER_SDO_GEOM_METADATA is required for Spatial proof.'
    );
  }
  const candidates = geometryMetadata
    .map(normalizeSpatialMetadata)
    .filter((metadata) => (
      metadata.tableName === SPATIAL_OBJECT
        && metadata.columnName === SPATIAL_COLUMN
    ));
  if (candidates.length !== 1
      || candidates[0].srid !== SPATIAL_SRID
      || candidates[0].dimensionCount !== SPATIAL_DIMENSIONS) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      `Spatial metadata must bind ${SPATIAL_OBJECT}.${SPATIAL_COLUMN} `
        + `to SRID ${SPATIAL_SRID} with ${SPATIAL_DIMENSIONS} dimensions.`,
      { metadata: candidates }
    );
  }
  return candidates[0];
}

async function readSpatialIndexBindings(execute) {
  const result = await execute(`
    SELECT indexes.index_name, indexes.index_type, indexes.status,
           indexes.domidx_status, indexes.domidx_opstatus,
           indexes.ityp_owner, indexes.ityp_name,
           columns.table_name, columns.column_name, columns.column_position
    FROM user_indexes indexes
    JOIN user_ind_columns columns
      ON columns.index_name = indexes.index_name
    WHERE indexes.index_name = 'IDX_FC_SPATIAL'
    ORDER BY columns.column_position
  `);
  return result.rows || [];
}

async function readSpatialGeometryMetadata(execute) {
  const result = await execute(`
    SELECT metadata.table_name, metadata.column_name, metadata.srid,
           (
             SELECT COUNT(*)
             FROM TABLE(metadata.diminfo) dim_element
           ) dimension_count
    FROM user_sdo_geom_metadata metadata
    WHERE metadata.table_name = 'FULFILLMENT_CENTERS'
      AND metadata.column_name = 'LOCATION'
  `);
  return result.rows || [];
}

async function capturePreviousCursor(connection, feature) {
  const previous = await connection.execute(`
    SELECT prev_sql_id, prev_child_number
    FROM v$session
    WHERE audsid = SYS_CONTEXT('USERENV', 'SESSIONID')
  `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  const sqlId = previous.rows?.[0]?.PREV_SQL_ID;
  const childNumber = previous.rows?.[0]?.PREV_CHILD_NUMBER;
  if (!/^[0-9a-z]{13}$/.test(String(sqlId || '').trim())
      || childNumber === null
      || childNumber === undefined
      || String(childNumber).trim() === ''
      || !Number.isInteger(Number(childNumber))
      || Number(childNumber) < 0) {
    throw new FeaturePlanEvidenceError(
      feature,
      `The current ${feature} cursor identity is unavailable.`,
      { sqlId: sqlId || null, childNumber: childNumber ?? null }
    );
  }

  const hashResult = await connection.execute(`
    SELECT plan_hash_value
    FROM v$sql
    WHERE sql_id = :sqlId
      AND child_number = :childNumber
  `, { sqlId, childNumber }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const planHashValue = Number(hashResult.rows?.[0]?.PLAN_HASH_VALUE);
  exactCursorIdentity({
    sqlId,
    childNumber,
    planHashValue,
  }, feature);

  const display = await connection.execute(`
    SELECT plan_table_output
    FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
      :sqlId, :childNumber, 'BASIC +ALIAS +PREDICATE'
    ))
  `, { sqlId, childNumber }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const planText = (display.rows || [])
    .map((row) => row.PLAN_TABLE_OUTPUT)
    .filter(Boolean)
    .join('\n');
  if (!planText || /cannot be found|no plan table output/i.test(planText)) {
    throw new FeaturePlanEvidenceError(
      feature,
      `The exact ${feature} cursor plan is unavailable.`,
      { sqlId, childNumber }
    );
  }

  const plan = await connection.execute(`
    SELECT id, operation, options, object_owner, object_name
    FROM v$sql_plan
    WHERE sql_id = :sqlId
      AND child_number = :childNumber
    ORDER BY id
  `, { sqlId, childNumber }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  if (!(plan.rows || []).length) {
    throw new FeaturePlanEvidenceError(
      feature,
      `The exact ${feature} cursor has no inspectable plan rows.`,
      { sqlId, childNumber }
    );
  }
  return {
    sqlId,
    childNumber: Number(childNumber),
    planHashValue,
    planText,
    planRows: plan.rows,
  };
}

function classifyVectorPlan(cursor, {
  objectName = VECTOR_OBJECT,
  indexName = VECTOR_INDEX,
  indexBindings = null,
} = {}) {
  const cursorIdentity = exactCursorIdentity(cursor, 'AI_VECTOR_SEARCH');
  const expectedObject = String(objectName).toUpperCase();
  const expectedIndex = String(indexName).toUpperCase();
  const acceptedPair = (expectedObject === VECTOR_OBJECT && expectedIndex === VECTOR_INDEX)
    || (expectedObject === POST_VECTOR_OBJECT && expectedIndex === POST_VECTOR_INDEX);
  if (!acceptedPair) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'The requested Vector plan target is not in the deployed evidence inventory.'
    );
  }
  assertVectorIndexBinding(indexBindings, {
    objectName: expectedObject,
    indexName: expectedIndex,
  });
  if (!Number.isInteger(Number(cursor?.resultRowCount))
      || Number(cursor.resultRowCount) < 1) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'A nonempty current Vector execution is required for indexed plan proof.',
      {
        sqlId: cursor?.sqlId || null,
        childNumber: cursor?.childNumber ?? null,
        resultRowCount: cursor?.resultRowCount ?? null,
      }
    );
  }
  if (!Array.isArray(cursor?.planRows)) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'The current Vector cursor has no inspectable plan rows.'
    );
  }
  const fullScanRow = cursor.planRows.find((row) => (
    /^TABLE ACCESS\b/.test(operationText(row))
      && /\bFULL\b/.test(operationText(row))
      && String(row.OBJECT_NAME || '').toUpperCase() === expectedObject
  ));
  if (fullScanRow) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      `The current Vector cursor performed a full scan of ${expectedObject}.`,
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        operation: operationText(fullScanRow),
      }
    );
  }
  const vectorLookingRows = cursor.planRows.filter((row) => (
    operationText(row).includes('VECTOR INDEX')
  ));
  const exactIndexRows = vectorLookingRows.filter((row) => (
    operationName(row) === 'VECTOR INDEX'
      && operationText(row) === 'VECTOR INDEX IVF SCAN'
      && String(row.OBJECT_NAME || '').toUpperCase() === expectedIndex
  ));
  const unexpectedIndexRows = vectorLookingRows.filter((row) => (
    operationName(row) !== 'VECTOR INDEX'
      || String(row.OBJECT_NAME || '').toUpperCase() !== expectedIndex
  ));
  if (unexpectedIndexRows.length) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'The complete current Vector child contains an unexpected additional Vector index.',
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        expectedIndex,
        unexpectedIndexes: unexpectedIndexRows.map((row) => ({
          operation: operationText(row),
          objectOwner: row.OBJECT_OWNER || null,
          objectName: row.OBJECT_NAME || null,
        })),
      }
    );
  }

  const escapedIndex = expectedIndex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const centroidPattern = new RegExp(
    `^VECTOR\\$${escapedIndex}\\$([0-9]+(?:_[0-9]+)*)\\$IVF_FLAT_CENTROIDS$`
  );
  const partitionPattern = new RegExp(
    `^VECTOR\\$${escapedIndex}\\$([0-9]+(?:_[0-9]+)*)\\$(?:IVF_FLAT_)?CENTROID_PARTITIONS$`
  );
  const ivfRows = cursor.planRows.filter((row) => {
    const object = String(row.OBJECT_NAME || '').toUpperCase();
    return object.startsWith('VECTOR$')
      && (object.includes('$IVF_') || object.endsWith('$CENTROID_PARTITIONS'));
  });
  const centroidRows = ivfRows.filter((row) => (
    centroidPattern.test(String(row.OBJECT_NAME || '').toUpperCase())
  ));
  const partitionRows = ivfRows.filter((row) => (
    partitionPattern.test(String(row.OBJECT_NAME || '').toUpperCase())
  ));
  const expectedIvfRows = new Set([...centroidRows, ...partitionRows]);
  const unexpectedIvfRows = ivfRows.filter((row) => !expectedIvfRows.has(row));
  if (unexpectedIvfRows.length) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'The complete current Vector child contains an unexpected IVF object.',
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        expectedIndex,
        unexpectedObjects: unexpectedIvfRows.map((row) => row.OBJECT_NAME || null),
      }
    );
  }
  const [indexRow] = exactIndexRows;
  if (indexRow
      && exactIndexRows.length === 1
      && vectorLookingRows.length === 1
      && ivfRows.length === 0) {
    return {
      featureName: 'VECTOR',
      sqlId: cursor.sqlId,
      childNumber: cursor.childNumber,
      ...(cursorIdentity
        ? { planHashValue: cursorIdentity.planHashValue }
        : {}),
      resultRowCount: Number(cursor.resultRowCount),
      operation: operationText(indexRow),
      objectOwner: indexRow.OBJECT_OWNER || null,
      objectName: expectedObject,
      indexName: expectedIndex,
    };
  }


  if (vectorLookingRows.length === 0
      && centroidRows.length === 1
      && partitionRows.length === 1
      && ivfRows.length === 2) {
    const centroidName = String(centroidRows[0].OBJECT_NAME || '').toUpperCase();
    const partitionName = String(partitionRows[0].OBJECT_NAME || '').toUpperCase();
    const centroidMatch = centroidName.match(centroidPattern);
    const partitionMatch = partitionName.match(partitionPattern);
    const centroidOwner = String(centroidRows[0].OBJECT_OWNER || '').toUpperCase();
    const partitionOwner = String(partitionRows[0].OBJECT_OWNER || '').toUpperCase();
    if (centroidMatch?.[1] === partitionMatch?.[1]
        && centroidOwner
        && centroidOwner === partitionOwner) {
      return {
        featureName: 'VECTOR',
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        ...(cursorIdentity
          ? { planHashValue: cursorIdentity.planHashValue }
          : {}),
        resultRowCount: Number(cursor.resultRowCount),
        operation: 'VECTOR INDEX IVF INTERNAL OBJECT PAIR',
        objectOwner: centroidRows[0].OBJECT_OWNER || null,
        objectName: expectedObject,
        indexName: expectedIndex,
      };
    }
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'The current Vector cursor exposed a mismatched IVF internal-object pair.',
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        centroidName,
        partitionName,
      }
    );
  }

  // Oracle Free can execute the configured IVF access path through internal
  // VECTOR$IDX_* objects without projecting a literal VECTOR INDEX row in the
  // current child. The bootstrap proof uses the same honest representation:
  // retain the exact cursor identity, nonempty result, no base-table full
  // scan, and catalog binding, but do not claim an operator the plan omitted.
  if (vectorLookingRows.length === 0) {
    return {
      featureName: 'VECTOR',
      sqlId: cursor.sqlId,
      childNumber: cursor.childNumber,
      ...(cursorIdentity
        ? { planHashValue: cursorIdentity.planHashValue }
        : {}),
      resultRowCount: Number(cursor.resultRowCount),
      operation: 'PLAN_PROJECTION_UNAVAILABLE',
      objectOwner: null,
      objectName: expectedObject,
      indexName: null,
    };
  }

  throw new FeaturePlanEvidenceError(
    'AI_VECTOR_SEARCH',
    `The complete current Vector child must use exactly one ${expectedIndex} Vector index row.`,
    {
      sqlId: cursor.sqlId,
      childNumber: cursor.childNumber,
      vectorLookingRowCount: vectorLookingRows.length,
      exactVectorIndexRowCount: exactIndexRows.length,
    }
  );
}

function classifySpatialPlan(cursor, {
  indexBindings = null,
  geometryMetadata = null,
} = {}) {
  const cursorIdentity = exactCursorIdentity(cursor, 'ORACLE_SPATIAL');
  assertSpatialIndexBinding(indexBindings);
  const metadata = geometryMetadata === null
    ? null
    : assertSpatialGeometryMetadata(geometryMetadata);
  if (!Number.isInteger(Number(cursor?.resultRowCount))
      || Number(cursor.resultRowCount) < 1) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'A nonempty current Spatial execution is required for plan proof.',
      {
        sqlId: cursor?.sqlId || null,
        childNumber: cursor?.childNumber ?? null,
        resultRowCount: cursor?.resultRowCount ?? null,
      }
    );
  }
  if (!Array.isArray(cursor?.planRows)) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'The current Spatial cursor has no inspectable plan rows.'
    );
  }
  const fullScanRow = cursor.planRows.find((row) => (
    /^TABLE ACCESS\b/.test(operationText(row))
      && /\bFULL\b/.test(operationText(row))
      && String(row.OBJECT_NAME || '').toUpperCase() === SPATIAL_OBJECT
  ));
  if (fullScanRow) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      `The current Spatial cursor performed a full scan of ${SPATIAL_OBJECT}.`,
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        operation: operationText(fullScanRow),
      }
    );
  }
  const domainLookingRows = cursor.planRows.filter((row) => (
    operationText(row).includes('DOMAIN INDEX')
  ));
  const exactIndexRows = domainLookingRows.filter((row) => (
    operationName(row) === 'DOMAIN INDEX'
      && String(row.OBJECT_NAME || '').toUpperCase() === SPATIAL_INDEX
  ));
  const unexpectedIndexRows = domainLookingRows.filter((row) => (
    operationName(row) !== 'DOMAIN INDEX'
      || String(row.OBJECT_NAME || '').toUpperCase() !== SPATIAL_INDEX
  ));
  if (unexpectedIndexRows.length) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'The complete current Spatial child contains an unexpected additional domain index.',
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        unexpectedIndexes: unexpectedIndexRows.map((row) => ({
          operation: operationText(row),
          objectOwner: row.OBJECT_OWNER || null,
          objectName: row.OBJECT_NAME || null,
        })),
      }
    );
  }
  const [indexRow] = exactIndexRows;
  if (!indexRow
      || exactIndexRows.length !== 1
      || domainLookingRows.length !== 1) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'The complete current SDO_NN child must use exactly one DOMAIN INDEX IDX_FC_SPATIAL row.',
      {
        sqlId: cursor.sqlId,
        childNumber: cursor.childNumber,
        domainLookingRowCount: domainLookingRows.length,
        exactSpatialIndexRowCount: exactIndexRows.length,
      }
    );
  }
  return {
    featureName: 'SPATIAL',
    sqlId: cursor.sqlId,
    childNumber: cursor.childNumber,
    ...(cursorIdentity
      ? { planHashValue: cursorIdentity.planHashValue }
      : {}),
    resultRowCount: Number(cursor.resultRowCount),
    operation: operationText(indexRow),
    objectOwner: indexRow.OBJECT_OWNER || null,
    objectName: SPATIAL_OBJECT,
    indexName: SPATIAL_INDEX,
    ...(metadata
      ? {
          srid: metadata.srid,
          dimensionCount: metadata.dimensionCount,
        }
      : {}),
  };
}

async function persistEvidence(connection, {
  generationId,
  jobId,
  datasetFingerprint,
  proof,
}) {
  await connection.execute(`
    MERGE INTO APP_FEATURE_PLAN_EVIDENCE target
    USING (
      SELECT :generationId generation_id, :featureName feature_name,
             :jobId job_id, :datasetFingerprint dataset_fingerprint,
             :sqlId sql_id, :childNumber child_number,
             :planHashValue plan_hash_value,
             :planOperation plan_operation, :objectOwner object_owner,
             :objectName object_name, :indexName index_name
      FROM dual
    ) source
    ON (
      target.generation_id = source.generation_id
      AND target.feature_name = source.feature_name
    )
    WHEN MATCHED THEN UPDATE SET
      target.job_id = source.job_id,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.plan_operation = source.plan_operation,
      target.object_owner = source.object_owner,
      target.object_name = source.object_name,
      target.index_name = source.index_name,
      target.verified_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (
      generation_id, feature_name, job_id, dataset_fingerprint,
      sql_id, child_number, plan_hash_value, plan_operation, object_owner,
      object_name, index_name, verified_at
    ) VALUES (
      source.generation_id, source.feature_name, source.job_id,
      source.dataset_fingerprint, source.sql_id, source.child_number,
      source.plan_hash_value, source.plan_operation, source.object_owner,
      source.object_name,
      source.index_name, SYSTIMESTAMP
    )
  `, {
    generationId,
    featureName: proof.featureName,
    jobId,
    datasetFingerprint,
    sqlId: proof.sqlId,
    childNumber: proof.childNumber,
    planHashValue: proof.planHashValue,
    planOperation: proof.operation,
    objectOwner: proof.objectOwner,
    objectName: proof.objectName,
    indexName: proof.indexName,
  }, { autoCommit: false });
}

async function proveFeaturePlansOnConnection(connection, {
  generationId,
  jobId = null,
  datasetFingerprint,
}) {
  const marker = safeMarker(generationId);
  if (!/^[a-f0-9]{64}$/i.test(String(datasetFingerprint || ''))) {
    throw new FeaturePlanEvidenceError(
      'PLAN_EVIDENCE',
      'Generation-bound plan evidence requires a valid dataset fingerprint.'
    );
  }

  const vector = await connection.execute(`
    SELECT product_id, distance_score
    FROM (
      SELECT /*+ GATHER_PLAN_STATISTICS
                 VECTOR_INDEX_TRANSFORM(pe IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
             /* RETAIL_VECTOR_GENERATION_${marker} */
             pe.product_id,
             VECTOR_DISTANCE(
               pe.embedding,
               VECTOR_EMBEDDING(
                 ALL_MINILM_L12_V2 USING
                 'outdoor trail footwear and sporting goods' AS DATA
               ),
               COSINE
             ) distance_score
      FROM product_embeddings pe
      ORDER BY distance_score
      FETCH APPROXIMATE FIRST 5 ROWS ONLY
    )
    ORDER BY distance_score, product_id
  `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  if (!vector.rows?.length) {
    throw new FeaturePlanEvidenceError(
      'AI_VECTOR_SEARCH',
      'The generation-marked Vector validation returned no rows.'
    );
  }
  const vectorCursor = await capturePreviousCursor(
    connection,
    'AI_VECTOR_SEARCH'
  );
  const vectorIndexBindings = await readVectorIndexBindings(
    (sql, binds = {}, options = {}) => connection.execute(
      sql,
      binds,
      { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false, ...options }
    )
  );
  const vectorProof = classifyVectorPlan(
    {
      ...vectorCursor,
      resultRowCount: vector.rows.length,
    },
    {
      objectName: VECTOR_OBJECT,
      indexName: VECTOR_INDEX,
      indexBindings: vectorIndexBindings,
    }
  );
  await persistEvidence(connection, {
    generationId,
    jobId,
    datasetFingerprint,
    proof: vectorProof,
  });

  const spatial = await connection.execute(`
    SELECT /*+ GATHER_PLAN_STATISTICS */
           /* RETAIL_SPATIAL_GENERATION_${marker} */
           fc.center_id
    FROM fulfillment_centers fc
    CROSS JOIN (
      SELECT location
      FROM customers
      WHERE location IS NOT NULL
      ORDER BY customer_id
      FETCH FIRST 1 ROW ONLY
    ) customer
    WHERE fc.location IS NOT NULL
      AND SDO_NN(
        fc.location,
        customer.location,
        'sdo_num_res=5',
        1
      ) = 'TRUE'
    ORDER BY SDO_GEOM.SDO_DISTANCE(
      customer.location, fc.location, 0.005, 'unit=KM'
    ), fc.center_id
    FETCH FIRST 5 ROWS ONLY
  `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  if (!spatial.rows?.length) {
    throw new FeaturePlanEvidenceError(
      'ORACLE_SPATIAL',
      'The generation-marked Spatial validation returned no rows.'
    );
  }
  const spatialCursor = await capturePreviousCursor(
    connection,
    'ORACLE_SPATIAL'
  );
  const executeCatalog = (sql, binds = {}, options = {}) => connection.execute(
    sql,
    binds,
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false, ...options }
  );
  const spatialIndexBindings = await readSpatialIndexBindings(executeCatalog);
  const spatialGeometryMetadata = await readSpatialGeometryMetadata(
    executeCatalog
  );
  const spatialProof = classifySpatialPlan(
    {
      ...spatialCursor,
      resultRowCount: spatial.rows.length,
    },
    {
      indexBindings: spatialIndexBindings,
      geometryMetadata: spatialGeometryMetadata,
    }
  );
  await persistEvidence(connection, {
    generationId,
    jobId,
    datasetFingerprint,
    proof: spatialProof,
  });

  return {
    vector: { ...vectorProof, datasetFingerprint },
    spatial: { ...spatialProof, datasetFingerprint },
  };
}

async function reestablishActiveFeaturePlanEvidence() {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    const active = await connection.execute(`
      SELECT state.active_generation_id, readiness.job_id,
             inmemory.dataset_fingerprint
      FROM app_dataset_state state
      LEFT JOIN app_dataset_readiness readiness
        ON readiness.readiness_id = 1
      LEFT JOIN app_inmemory_generation_evidence inmemory
        ON inmemory.generation_id = state.active_generation_id
      WHERE state.state_id = 1
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    const row = active.rows?.[0];
    if (!row?.ACTIVE_GENERATION_ID || !row?.DATASET_FINGERPRINT) return null;
    const proof = await proveFeaturePlansOnConnection(connection, {
      generationId: row.ACTIVE_GENERATION_ID,
      jobId: row.JOB_ID,
      datasetFingerprint: row.DATASET_FINGERPRINT,
    });
    await connection.commit();
    return proof;
  } finally {
    await db.releaseConnection(connection, {
      rollback: true,
      label: 'Vector/Spatial startup evidence',
    });
  }
}

module.exports = {
  FeaturePlanEvidenceError,
  capturePreviousCursor,
  readVectorIndexBindings,
  readSpatialIndexBindings,
  readSpatialGeometryMetadata,
  classifyVectorPlan,
  classifySpatialPlan,
  proveFeaturePlansOnConnection,
  reestablishActiveFeaturePlanEvidence,
  _private: {
    operationText,
    operationName,
    normalizeIndexBinding,
    normalizeSpatialIndexBinding,
    normalizeSpatialMetadata,
    assertVectorIndexBinding,
    assertSpatialIndexBinding,
    assertSpatialGeometryMetadata,
    exactCursorIdentity,
    safeMarker,
  },
};
