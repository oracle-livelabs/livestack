const crypto = require('crypto');
const db = require('../config/database');

function safeEvidenceToken(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePlanRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: Number(row.ID ?? row.id ?? index),
    operation: upper(row.OPERATION ?? row.operation),
    options: upper(row.OPTIONS ?? row.options),
    objectOwner: upper(row.OBJECT_OWNER ?? row.objectOwner),
    objectName: upper(row.OBJECT_NAME ?? row.objectName),
    planHashValue: Number(
      row.PLAN_HASH_VALUE ?? row.planHashValue ?? 0
    ),
  }));
}

function normalizeIndexBindings(bindings = []) {
  return (Array.isArray(bindings) ? bindings : []).map((binding) => ({
    indexName: upper(binding.INDEX_NAME ?? binding.indexName),
    tableName: upper(binding.TABLE_NAME ?? binding.tableName),
    columnName: upper(binding.COLUMN_NAME ?? binding.columnName),
    columnPosition: Number(
      binding.COLUMN_POSITION ?? binding.columnPosition ?? 0
    ),
    indexType: upper(binding.INDEX_TYPE ?? binding.indexType),
    status: upper(binding.STATUS ?? binding.status),
    distance: upper(binding.DISTANCE ?? binding.distance),
  }));
}

function normalizeSpatialIndexBindings(bindings = []) {
  return (Array.isArray(bindings) ? bindings : []).map((binding) => {
    const metadataSupplied = [
      'METADATA_TABLE_NAME',
      'metadataTableName',
      'METADATA_COLUMN_NAME',
      'metadataColumnName',
      'SRID',
      'srid',
      'DIMENSION_COUNT',
      'dimensionCount',
    ].some((name) => Object.prototype.hasOwnProperty.call(binding, name));
    return {
      indexName: upper(binding.INDEX_NAME ?? binding.indexName),
      tableName: upper(binding.TABLE_NAME ?? binding.tableName),
      columnName: upper(binding.COLUMN_NAME ?? binding.columnName),
      columnPosition: Number(
        binding.COLUMN_POSITION ?? binding.columnPosition ?? 0
      ),
      indexType: upper(binding.INDEX_TYPE ?? binding.indexType),
      status: upper(binding.STATUS ?? binding.status),
      domainIndexStatus: upper(
        binding.DOMIDX_STATUS
          ?? binding.domainIndexStatus
          ?? binding.domidxStatus
      ),
      domainIndexOperationStatus: upper(
        binding.DOMIDX_OPSTATUS
          ?? binding.domainIndexOperationStatus
          ?? binding.domidxOpStatus
      ),
      implementationOwner: upper(
        binding.ITYP_OWNER ?? binding.implementationOwner
      ),
      implementationType: upper(
        binding.ITYP_NAME ?? binding.implementationType
      ),
      metadataSupplied,
      metadataTableName: upper(
        binding.METADATA_TABLE_NAME ?? binding.metadataTableName
      ),
      metadataColumnName: upper(
        binding.METADATA_COLUMN_NAME ?? binding.metadataColumnName
      ),
      srid: Number(binding.SRID ?? binding.srid ?? 0),
      dimensionCount: Number(
        binding.DIMENSION_COUNT ?? binding.dimensionCount ?? 0
      ),
    };
  });
}

function normalizeInMemorySegments(segments = []) {
  return (Array.isArray(segments) ? segments : []).map((segment) => ({
    tableName: upper(
      segment.TABLE_NAME
        ?? segment.SEGMENT_NAME
        ?? segment.tableName
        ?? segment.segmentName
    ),
    rowCount: Number(segment.ROW_COUNT ?? segment.rowCount ?? 0),
    tableInMemory: upper(
      segment.TABLE_INMEMORY ?? segment.tableInMemory
    ),
    priority: upper(
      segment.PRIORITY
        ?? segment.INMEMORY_PRIORITY
        ?? segment.priority
        ?? segment.inMemoryPriority
    ),
    compression: upper(
      segment.COMPRESSION
        ?? segment.INMEMORY_COMPRESSION
        ?? segment.compression
        ?? segment.inMemoryCompression
    ),
    status: upper(
      segment.STATUS
        ?? segment.POPULATE_STATUS
        ?? segment.status
        ?? segment.populateStatus
    ),
    inMemoryBytes: Number(
      segment.IM_BYTES
        ?? segment.INMEMORY_BYTES
        ?? segment.inMemoryBytes
        ?? 0
    ),
    bytesNotPopulated:
      segment.BYTES_NOT_POPULATED
        ?? segment.bytesNotPopulated
        ?? null,
  }));
}

function planFingerprint(planRows) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(planRows))
    .digest('hex');
}

function classifyExactVectorPlan(cursor = {}, {
  expectedTableName,
  expectedIndexName,
  indexBindings,
  forbiddenFullScanTables = ['PRODUCT_EMBEDDINGS', 'POST_EMBEDDINGS'],
} = {}) {
  const generationId = String(cursor.generationId || '').trim();
  const sqlId = String(cursor.sqlId || '').trim().toLowerCase();
  const rawChildNumber = cursor.childNumber;
  const childNumber = Number(rawChildNumber);
  const tableName = upper(expectedTableName);
  const indexName = upper(expectedIndexName);
  if (!generationId) {
    throw new Error('Exact Vector generation identity is unavailable');
  }
  if (!/^[a-z0-9]{13}$/.test(sqlId)) {
    throw new Error('Exact Vector SQL_ID is malformed or unavailable');
  }
  if (rawChildNumber == null
      || !Number.isInteger(childNumber)
      || childNumber < 0) {
    throw new Error('Exact Vector child cursor is invalid');
  }
  if (!tableName || !indexName) {
    throw new Error(
      'Exact Vector plan classification requires expected table and index names'
    );
  }

  const bindings = normalizeIndexBindings(indexBindings);
  const matchingBindings = bindings.filter(
    (binding) => binding.indexName === indexName
  );
  if (matchingBindings.length !== 1) {
    throw new Error(
      `Exact Vector catalog binding for ${indexName} is unavailable`
    );
  }
  const binding = matchingBindings[0];
  if (binding.tableName !== tableName
      || binding.columnName !== 'EMBEDDING'
      || binding.columnPosition !== 1
      || binding.indexType !== 'VECTOR'
      || binding.status !== 'VALID'
      || binding.distance !== 'COSINE') {
    throw new Error(
      `Exact Vector index binding ${indexName} -> ${tableName}(EMBEDDING) is invalid`
    );
  }

  const resultRowCount = Number(
    cursor.resultRowCount
      ?? cursor.result?.rows?.length
      ?? 0
  );
  if (!Number.isInteger(resultRowCount) || resultRowCount < 1) {
    throw new Error(
      'Exact Vector execution requires a nonempty current-session result'
    );
  }

  const rows = normalizePlanRows(cursor.planRows ?? cursor.plan?.rows);
  if (rows.length === 0) {
    throw new Error('Exact Vector execution plan has no rows');
  }
  const forbidden = new Set(
    [...forbiddenFullScanTables, tableName].map(upper)
  );
  const fullScans = rows.filter((row) => (
    row.operation === 'TABLE ACCESS'
    && /\bFULL\b/.test(row.options)
    && forbidden.has(row.objectName)
  ));
  if (fullScans.length > 0) {
    throw new Error(
      `Exact Vector plan contains TABLE ACCESS FULL on ${fullScans
        .map((row) => row.objectName)
        .join(', ')}`
    );
  }

  const compactIndexRows = rows.filter((row) => (
    row.objectName === indexName
    && row.operation === 'VECTOR INDEX'
    && /\bIVF\b.*\bSCAN\b/.test(row.options)
  ));
  const vectorInternalRows = rows.filter((row) => (
    row.objectName.startsWith('VECTOR$')
  ));
  const escapedIndexName = indexName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const centroidPattern = new RegExp(
    `^(VECTOR\\$${escapedIndexName}\\$.+)\\$IVF_FLAT_CENTROIDS$`
  );
  const partitionPattern = new RegExp(
    `^(VECTOR\\$${escapedIndexName}\\$.+)\\$(?:IVF_FLAT_)?CENTROID_PARTITIONS$`
  );
  const centroidRows = vectorInternalRows.filter((row) => (
    row.operation === 'TABLE ACCESS'
    && row.options === 'FULL'
    && centroidPattern.test(row.objectName)
  ));
  const partitionRows = vectorInternalRows.filter((row) => (
    row.operation === 'TABLE ACCESS'
    && /^(?:FULL|BY INDEX ROWID(?: BATCHED)?)$/.test(row.options)
    && partitionPattern.test(row.objectName)
  ));
  const internalPair = centroidRows.length === 1
    && partitionRows.length === 1
    && centroidRows[0].objectName.match(centroidPattern)?.[1]
      === partitionRows[0].objectName.match(partitionPattern)?.[1];
  const unexpectedCompactRows = rows.filter((row) => (
    row.operation === 'VECTOR INDEX'
    && row !== compactIndexRows[0]
  ));
  if (unexpectedCompactRows.length > 0) {
    throw new Error(
      `Exact Vector plan contains unexpected Vector index ${unexpectedCompactRows
        .map((row) => row.objectName || 'UNNAMED')
        .join(', ')}`
    );
  }
  const compactShape = compactIndexRows.length === 1
    && vectorInternalRows.length === 0;
  const internalShape = compactIndexRows.length === 0
    && internalPair
    && vectorInternalRows.length === 2;
  if (!compactShape && !internalShape) {
    throw new Error(
      `Exact Vector execution plan must use expected index ${indexName}`
    );
  }
  const matched = compactShape
    ? compactIndexRows[0]
    : {
      id: Math.min(centroidRows[0].id, partitionRows[0].id),
      operation: 'VECTOR INDEX',
      options: 'IVF INTERNAL OBJECT PAIR',
      objectOwner: centroidRows[0].objectOwner,
      objectName: indexName,
      planHashValue: centroidRows[0].planHashValue,
    };
  if (!Number.isInteger(matched.planHashValue)
      || matched.planHashValue <= 0) {
    throw new Error('Exact Vector plan hash is invalid');
  }
  return Object.freeze({
    ready: true,
    generationId,
    sqlId,
    childNumber,
    tableName,
    indexName,
    operation: [matched.operation, matched.options]
      .filter(Boolean)
      .join(' '),
    objectName: matched.objectName,
    resultRowCount,
    noForbiddenFullScan: true,
    planShape: compactShape
      ? 'IVF_COMPACT_INDEX_NODE'
      : 'IVF_INTERNAL_OBJECT_PAIR',
    planFingerprint: planFingerprint(rows),
    planRows: Object.freeze(rows),
    matched,
  });
}

function classifySpatialPlanInternal(cursor = {}, {
  expectedTableName,
  expectedColumnName,
  expectedIndexName,
  indexBindings,
  forbiddenFullScanTables = ['FULFILLMENT_CENTERS'],
} = {}, {
  requireCompleteMetadata = false,
} = {}) {
  const generationId = String(cursor.generationId || '').trim();
  const sqlId = String(cursor.sqlId || '').trim().toLowerCase();
  const rawChildNumber = cursor.childNumber;
  const childNumber = Number(rawChildNumber);
  const tableName = upper(expectedTableName);
  const columnName = upper(expectedColumnName);
  const indexName = upper(expectedIndexName);
  if (!generationId) {
    throw new Error('Exact Spatial generation identity is unavailable');
  }
  if (!/^[a-z0-9]{13}$/.test(sqlId)) {
    throw new Error('Exact Spatial SQL_ID is malformed or unavailable');
  }
  if (rawChildNumber == null
      || !Number.isInteger(childNumber)
      || childNumber < 0) {
    throw new Error('Exact Spatial child cursor is invalid');
  }
  if (!tableName || !columnName || !indexName) {
    throw new Error(
      'Exact Spatial plan classification requires table, column, and index names'
    );
  }

  const bindings = normalizeSpatialIndexBindings(indexBindings);
  const matchingBindings = bindings.filter(
    (binding) => binding.indexName === indexName
  );
  if (matchingBindings.length !== 1) {
    throw new Error(
      `Exact Spatial catalog binding for ${indexName} is unavailable`
    );
  }
  const binding = matchingBindings[0];
  if (binding.tableName !== tableName
      || binding.columnName !== columnName
      || binding.columnPosition !== 1
      || binding.indexType !== 'DOMAIN'
      || binding.status !== 'VALID'
      || binding.domainIndexStatus !== 'VALID'
      || binding.domainIndexOperationStatus !== 'VALID'
      || binding.implementationOwner !== 'MDSYS'
      || binding.implementationType !== 'SPATIAL_INDEX_V2'
      || (requireCompleteMetadata && !binding.metadataSupplied)
      || (binding.metadataSupplied
        && (
          binding.metadataTableName !== tableName
          || binding.metadataColumnName !== columnName
          || binding.srid !== 4326
          || binding.dimensionCount !== 2
        ))) {
    throw new Error(
      `Exact Spatial index binding ${indexName} -> ${tableName}(${columnName}) is invalid`
    );
  }

  const resultRowCount = Number(
    cursor.resultRowCount
      ?? cursor.result?.rows?.length
      ?? 0
  );
  if (!Number.isInteger(resultRowCount) || resultRowCount < 1) {
    throw new Error(
      'Exact Spatial execution requires a nonempty current-session result'
    );
  }

  const rows = normalizePlanRows(cursor.planRows ?? cursor.plan?.rows);
  if (rows.length === 0) {
    throw new Error('Exact Spatial execution plan has no rows');
  }
  const forbidden = new Set(
    [...forbiddenFullScanTables, tableName].map(upper)
  );
  const fullScans = rows.filter((row) => (
    row.operation === 'TABLE ACCESS'
    && /\bFULL\b/.test(row.options)
    && forbidden.has(row.objectName)
  ));
  if (fullScans.length > 0) {
    throw new Error(
      `Exact Spatial plan contains TABLE ACCESS FULL on ${fullScans
        .map((row) => row.objectName)
        .join(', ')}`
    );
  }

  const domainIndexRows = rows.filter((row) => (
    /DOMAIN INDEX|SPATIAL/.test(`${row.operation} ${row.options}`)
  ));
  if (domainIndexRows.some((row) => row.objectName !== indexName)) {
    throw new Error(
      'Exact Spatial plan contains an unrelated or unnamed domain index'
    );
  }
  const exactIndexRows = domainIndexRows.filter(
    (row) => row.objectName === indexName
  );
  if (exactIndexRows.length !== 1) {
    throw new Error(
      `Exact Spatial execution plan must use expected index ${indexName}`
    );
  }
  const matched = exactIndexRows[0];
  if (!Number.isInteger(matched.planHashValue)
      || matched.planHashValue <= 0) {
    throw new Error('Exact Spatial plan hash is invalid');
  }
  const hasRepresentativeRows = Object.prototype.hasOwnProperty.call(
    cursor,
    'resultRows'
  ) || Array.isArray(cursor.result?.rows);
  const resultRows = Array.isArray(cursor.resultRows)
    ? cursor.resultRows
    : cursor.result?.rows;
  const representative = resultRows?.[0] || null;
  const representativeGenerationId = String(
    representative?.PROOF_GENERATION_ID
      ?? representative?.proofGenerationId
      ?? ''
  ).trim();
  const rawCenterId =
    representative?.CENTER_ID
      ?? representative?.centerId;
  const centerId = Number(rawCenterId);
  const rawDistanceKm =
    representative?.DISTANCE_KM
      ?? representative?.distanceKm;
  const distanceKm = Number(rawDistanceKm);
  if (hasRepresentativeRows && (!representative
      || representativeGenerationId !== generationId
      || rawCenterId == null
      || !Number.isInteger(centerId)
      || centerId < 1
      || rawDistanceKm == null
      || !Number.isFinite(distanceKm)
      || distanceKm < 0)) {
    throw new Error(
      'Exact Spatial representative center/distance result is invalid or stale'
    );
  }
  return Object.freeze({
    ready: true,
    generationId,
    sqlId,
    childNumber,
    tableName,
    columnName,
    indexName,
    operation: [matched.operation, matched.options]
      .filter(Boolean)
      .join(' '),
    objectName: matched.objectName,
    planHashValue: matched.planHashValue,
    resultRowCount,
    representativeResult: hasRepresentativeRows
      ? Object.freeze({
        generationId,
        centerId,
        distanceKm,
      })
      : null,
    noForbiddenFullScan: true,
    planFingerprint: planFingerprint(rows),
    planRows: Object.freeze(rows),
    matched,
  });
}

// Compatibility-only direct helper for sealed predecessor fixtures that were
// created before metadata fields were included. Production execution must use
// classifyCompleteExactSpatialPlan below.
function classifyExactSpatialPlan(cursor = {}, options = {}) {
  return classifySpatialPlanInternal(cursor, options, {
    requireCompleteMetadata: false,
  });
}

function classifyCompleteExactSpatialPlan(cursor = {}, options = {}) {
  return classifySpatialPlanInternal(cursor, options, {
    requireCompleteMetadata: true,
  });
}

function classifyExactInMemoryPlan(cursor = {}, {
  expectedTableName = 'CUSTOMERS',
  segmentInventory,
} = {}) {
  const generationId = String(cursor.generationId || '').trim();
  const sqlId = String(cursor.sqlId || '').trim().toLowerCase();
  const rawChildNumber = cursor.childNumber;
  const childNumber = Number(rawChildNumber);
  const tableName = upper(expectedTableName);
  if (!generationId) {
    throw new Error('Exact In-Memory generation identity is unavailable');
  }
  if (!/^[a-z0-9]{13}$/.test(sqlId)) {
    throw new Error('Exact In-Memory SQL_ID is malformed or unavailable');
  }
  if (rawChildNumber == null
      || !Number.isInteger(childNumber)
      || childNumber < 0) {
    throw new Error('Exact In-Memory child cursor is invalid');
  }
  if (!tableName) {
    throw new Error('Exact In-Memory table identity is unavailable');
  }

  const expectedTables = [
    'CUSTOMERS',
    'ORDERS',
    'ORDER_ITEMS',
    'SOCIAL_POSTS',
  ];
  const segments = normalizeInMemorySegments(segmentInventory);
  if (segments.length !== expectedTables.length
      || new Set(segments.map((segment) => segment.tableName)).size
        !== expectedTables.length
      || expectedTables.some((expected) => (
        !segments.some((segment) => segment.tableName === expected)
      ))) {
    throw new Error(
      'Exact In-Memory segment inventory does not match the required four tables'
    );
  }
  for (const segment of segments) {
    const bytesNotPopulated = Number(segment.bytesNotPopulated);
    if (segment.tableInMemory !== 'ENABLED'
        || segment.priority !== 'HIGH'
        || segment.compression !== 'FOR QUERY LOW'
        || segment.status !== 'COMPLETED'
        || !Number.isInteger(segment.rowCount)
        || segment.rowCount < 1
        || !Number.isFinite(segment.inMemoryBytes)
        || segment.inMemoryBytes <= 0
        || segment.bytesNotPopulated == null
        || !Number.isFinite(bytesNotPopulated)
        || bytesNotPopulated !== 0) {
      throw new Error(
        `Exact In-Memory segment ${segment.tableName || 'UNKNOWN'} configuration, population, or bytes are invalid`
      );
    }
  }

  const resultRowCount = Number(
    cursor.resultRowCount
      ?? cursor.result?.rows?.length
      ?? 0
  );
  if (!Number.isInteger(resultRowCount) || resultRowCount < 1) {
    throw new Error(
      'Exact In-Memory execution requires a nonempty current-session result'
    );
  }
  const rows = normalizePlanRows(cursor.planRows ?? cursor.plan?.rows);
  if (rows.length === 0) {
    throw new Error('Exact In-Memory execution plan has no rows');
  }
  const conventionalFullScans = rows.filter((row) => (
    row.operation === 'TABLE ACCESS'
    && row.options === 'FULL'
    && row.objectName === tableName
  ));
  if (conventionalFullScans.length > 0) {
    throw new Error(
      `Exact In-Memory plan contains conventional TABLE ACCESS FULL on ${tableName}`
    );
  }
  const inMemoryRows = rows.filter((row) => (
    row.operation === 'TABLE ACCESS'
    && row.options === 'INMEMORY FULL'
  ));
  if (inMemoryRows.length !== 1
      || inMemoryRows[0].objectName !== tableName) {
    throw new Error(
      `Exact In-Memory plan must contain only ${tableName} TABLE ACCESS INMEMORY FULL`
    );
  }
  const matched = inMemoryRows[0];
  if (!Number.isInteger(matched.planHashValue)
      || matched.planHashValue <= 0) {
    throw new Error('Exact In-Memory plan hash is invalid');
  }

  const resultRows = Array.isArray(cursor.resultRows)
    ? cursor.resultRows
    : cursor.result?.rows;
  const representative = resultRows?.[0] || null;
  const representativeGenerationId = String(
    representative?.PROOF_GENERATION_ID
      ?? representative?.proofGenerationId
      ?? ''
  ).trim();
  const customerTier = String(
    representative?.CUSTOMER_TIER
      ?? representative?.customerTier
      ?? ''
  ).trim();
  const rawCustomerCount =
    representative?.CUSTOMER_COUNT
      ?? representative?.customerCount;
  const customerCount = Number(rawCustomerCount);
  const rawTotalLifetimeValue =
    representative?.TOTAL_LIFETIME_VALUE
      ?? representative?.totalLifetimeValue;
  const totalLifetimeValue = Number(rawTotalLifetimeValue);
  if (!representative
      || representativeGenerationId !== generationId
      || !customerTier
      || rawCustomerCount == null
      || !Number.isInteger(customerCount)
      || customerCount < 1
      || rawTotalLifetimeValue == null
      || !Number.isFinite(totalLifetimeValue)
      || totalLifetimeValue < 0) {
    throw new Error(
      'Exact In-Memory representative tier/count/value result is invalid or stale'
    );
  }

  return Object.freeze({
    ready: true,
    generationId,
    sqlId,
    childNumber,
    tableName,
    operation: [matched.operation, matched.options].join(' '),
    objectName: matched.objectName,
    planHashValue: matched.planHashValue,
    resultRowCount,
    representativeResult: Object.freeze({
      generationId,
      customerTier,
      customerCount,
      totalLifetimeValue,
    }),
    segmentInventory: Object.freeze(segments),
    noForbiddenFullScan: true,
    planFingerprint: planFingerprint(rows),
    planRows: Object.freeze(rows),
    matched,
  });
}

async function collectExactSpatialIndexBindings(connection, {
  indexName = 'IDX_FC_SPATIAL',
} = {}) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(
      'A live Oracle connection is required for exact Spatial index binding'
    );
  }
  const result = await connection.execute(`
    SELECT index_row.index_name,
           index_row.table_name,
           column_row.column_name,
           column_row.column_position,
           index_row.index_type,
           index_row.status,
           index_row.domidx_status,
           index_row.domidx_opstatus,
           index_row.ityp_owner,
           index_row.ityp_name,
           metadata.table_name metadata_table_name,
           metadata.column_name metadata_column_name,
           metadata.srid,
           (
             SELECT COUNT(*)
             FROM TABLE(metadata.diminfo) dim_element
           ) dimension_count
    FROM user_indexes index_row
    JOIN user_ind_columns column_row
      ON column_row.index_name = index_row.index_name
     AND column_row.table_name = index_row.table_name
    LEFT JOIN user_sdo_geom_metadata metadata
      ON metadata.table_name = index_row.table_name
     AND metadata.column_name = column_row.column_name
    WHERE index_row.index_name = :indexName
    ORDER BY column_row.column_position
  `, { indexName: upper(indexName) }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  return result.rows || [];
}

async function collectExactInMemorySegmentInventory(connection) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(
      'A live Oracle connection is required for exact In-Memory inventory'
    );
  }
  const result = await connection.execute(`
    SELECT segment_name table_name,
           row_count,
           table_inmemory,
           inmemory_priority priority,
           inmemory_compression compression,
           populate_status status,
           inmemory_bytes im_bytes,
           bytes_not_populated
    FROM media_inmemory_segments_v
    ORDER BY segment_name
  `, {}, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  return result.rows || [];
}

async function executeWithExactPlanEvidence(connection, {
  generationId,
  datasetFingerprint = null,
  feature,
  sql,
  binds = {},
  requiredPlan,
  requiredIndexName = null,
  requiredTableName = null,
  indexBindings = null,
  forbiddenFullScanTables = ['PRODUCT_EMBEDDINGS', 'POST_EMBEDDINGS'],
  requiredSpatialIndexName = null,
  requiredSpatialTableName = null,
  requiredSpatialColumnName = null,
  spatialIndexBindings = null,
  forbiddenSpatialFullScanTables = ['FULFILLMENT_CENTERS'],
  requiredInMemoryTableName = null,
  inMemorySegmentInventory = null,
  persist = true,
  requireNonEmptyResult = false,
}) {
  const generationToken = safeEvidenceToken(generationId);
  const featureToken = safeEvidenceToken(feature).toUpperCase();
  const taggedSql = `/* MEDIA_${featureToken}_GEN_${generationToken} */\n${sql}`;
  await connection.execute(
    'BEGIN DBMS_APPLICATION_INFO.SET_MODULE(:module, :action); END;',
    {
      module: 'MEDIA_DATASET_PROOF',
      action: `${featureToken}:${generationToken}`.slice(0, 64),
    },
    { autoCommit: false }
  );
  const result = await connection.execute(taggedSql, binds, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  if (requireNonEmptyResult
      && (!Array.isArray(result.rows) || result.rows.length === 0)) {
    throw new Error(
      `Exact current-generation ${feature} execution returned no rows`
    );
  }
  const cursor = await connection.execute(`
    SELECT prev_sql_id, prev_child_number
    FROM sys.v_$session
    WHERE sid = SYS_CONTEXT('USERENV', 'SID')
  `, {}, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  const sqlId = cursor.rows?.[0]?.PREV_SQL_ID;
  const rawChildNumber = cursor.rows?.[0]?.PREV_CHILD_NUMBER;
  const childNumber = Number(rawChildNumber);
  if (!sqlId || rawChildNumber == null || !Number.isInteger(childNumber)) {
    throw new Error(`Exact ${feature} cursor identity is unavailable`);
  }
  const plan = await connection.execute(`
    SELECT id, operation, options, object_owner, object_name, plan_hash_value
    FROM sys.v_$sql_plan
    WHERE sql_id = :sqlId AND child_number = :childNumber
    ORDER BY id
  `, { sqlId, childNumber }, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: false,
  });
  let matched;
  let strictVectorPlan = null;
  let strictSpatialPlan = null;
  let strictInMemoryPlan = null;
  if (requiredInMemoryTableName || inMemorySegmentInventory) {
    strictInMemoryPlan = classifyExactInMemoryPlan({
      generationId,
      resultRowCount: Array.isArray(result.rows) ? result.rows.length : 0,
      resultRows: result.rows || [],
      planRows: plan.rows || [],
      sqlId,
      childNumber,
    }, {
      expectedTableName: requiredInMemoryTableName,
      segmentInventory: inMemorySegmentInventory,
    });
    matched = strictInMemoryPlan.matched;
  } else if (requiredSpatialIndexName
      || requiredSpatialTableName
      || requiredSpatialColumnName
      || spatialIndexBindings) {
    strictSpatialPlan = classifyCompleteExactSpatialPlan({
      generationId,
      resultRowCount: Array.isArray(result.rows) ? result.rows.length : 0,
      resultRows: result.rows || [],
      planRows: plan.rows || [],
      sqlId,
      childNumber,
    }, {
      expectedTableName: requiredSpatialTableName,
      expectedColumnName: requiredSpatialColumnName,
      expectedIndexName: requiredSpatialIndexName,
      indexBindings: spatialIndexBindings,
      forbiddenFullScanTables: forbiddenSpatialFullScanTables,
    });
    matched = strictSpatialPlan.matched;
  } else if (requiredIndexName || requiredTableName || indexBindings) {
    strictVectorPlan = classifyExactVectorPlan({
      generationId,
      resultRowCount: Array.isArray(result.rows) ? result.rows.length : 0,
      planRows: plan.rows || [],
      sqlId,
      childNumber,
    }, {
      expectedTableName: requiredTableName,
      expectedIndexName: requiredIndexName,
      indexBindings,
      forbiddenFullScanTables,
    });
    matched = strictVectorPlan.matched;
  } else {
    matched = (plan.rows || []).find((row) => requiredPlan(row));
    if (!matched) {
      throw new Error(
        `Exact current-generation ${feature} execution plan is unavailable`
      );
    }
  }
  const matchedPlanHashValue = Number(
    matched.PLAN_HASH_VALUE ?? matched.planHashValue ?? 0
  );
  const matchedOperation = matched.OPERATION ?? matched.operation;
  const matchedOptions = matched.OPTIONS ?? matched.options ?? null;
  const matchedObjectName = matched.OBJECT_NAME ?? matched.objectName ?? null;
  if (persist) await connection.execute(`
    MERGE INTO app_feature_execution_evidence target
    USING (
      SELECT :generationId generation_id, :featureName feature_name,
             :sqlId sql_id, :childNumber child_number,
             :planHashValue plan_hash_value, :operation operation,
             :optionsValue options, :objectName object_name,
             :resultRowCount result_row_count,
             :datasetFingerprint dataset_fingerprint,
             :planFingerprint plan_fingerprint,
             :expectedTableName expected_table_name,
             :expectedIndexName expected_index_name,
             :noForbiddenFullScan no_forbidden_full_scan
      FROM dual
    ) source
    ON (
      target.generation_id = source.generation_id
      AND target.feature_name = source.feature_name
    )
    WHEN MATCHED THEN UPDATE SET
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.operation = source.operation,
      target.options = source.options,
      target.object_name = source.object_name,
      target.result_row_count = source.result_row_count,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.plan_fingerprint = source.plan_fingerprint,
      target.expected_table_name = source.expected_table_name,
      target.expected_index_name = source.expected_index_name,
      target.no_forbidden_full_scan = source.no_forbidden_full_scan,
      target.evidence_status = 'VERIFIED',
      target.captured_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(
      generation_id, feature_name, sql_id, child_number, plan_hash_value,
      operation, options, object_name, result_row_count,
      dataset_fingerprint, plan_fingerprint, expected_table_name,
      expected_index_name, no_forbidden_full_scan,
      evidence_status, captured_at
    ) VALUES(
      source.generation_id, source.feature_name, source.sql_id,
      source.child_number, source.plan_hash_value, source.operation,
      source.options, source.object_name, source.result_row_count,
      source.dataset_fingerprint, source.plan_fingerprint,
      source.expected_table_name, source.expected_index_name,
      source.no_forbidden_full_scan, 'VERIFIED', SYSTIMESTAMP
    )
  `, {
    generationId,
    featureName: featureToken,
    sqlId,
    childNumber,
    planHashValue: matchedPlanHashValue,
    operation: matchedOperation,
    optionsValue: matchedOptions,
    objectName: matchedObjectName,
    resultRowCount: Array.isArray(result.rows) ? result.rows.length : 0,
    datasetFingerprint,
    planFingerprint:
      strictVectorPlan?.planFingerprint
      || strictSpatialPlan?.planFingerprint
      || strictInMemoryPlan?.planFingerprint
      || null,
    expectedTableName:
      strictVectorPlan?.tableName
      || strictSpatialPlan?.tableName
      || strictInMemoryPlan?.tableName
      || null,
    expectedIndexName:
      strictVectorPlan?.indexName
      || strictSpatialPlan?.indexName
      || null,
    noForbiddenFullScan:
      strictVectorPlan || strictSpatialPlan || strictInMemoryPlan
        ? 1
        : null,
  }, { autoCommit: false });
  return {
    result,
    evidence: {
      generationId,
      feature: featureToken,
      sqlId,
      childNumber,
      planHashValue: matchedPlanHashValue,
      operation: matchedOperation,
      options: matchedOptions,
      objectName: matchedObjectName,
      resultRowCount: Array.isArray(result.rows) ? result.rows.length : 0,
      datasetFingerprint,
      planFingerprint:
        strictVectorPlan?.planFingerprint
        || strictSpatialPlan?.planFingerprint
        || strictInMemoryPlan?.planFingerprint
        || null,
      expectedTableName:
        strictVectorPlan?.tableName
        || strictSpatialPlan?.tableName
        || strictInMemoryPlan?.tableName
        || null,
      expectedIndexName:
        strictVectorPlan?.indexName
        || strictSpatialPlan?.indexName
        || null,
      noForbiddenFullScan:
        strictVectorPlan?.noForbiddenFullScan
        ?? strictSpatialPlan?.noForbiddenFullScan
        ?? strictInMemoryPlan?.noForbiddenFullScan
        ?? null,
      planRows:
        strictVectorPlan?.planRows
        || strictSpatialPlan?.planRows
        || strictInMemoryPlan?.planRows
        || null,
      representativeResult:
        strictSpatialPlan?.representativeResult
        || strictInMemoryPlan?.representativeResult
        || null,
      segmentInventory:
        strictInMemoryPlan?.segmentInventory
        || null,
    },
  };
}

module.exports = {
  classifyCompleteExactSpatialPlan,
  classifyExactInMemoryPlan,
  classifyExactSpatialPlan,
  classifyExactVectorPlan,
  collectExactInMemorySegmentInventory,
  collectExactSpatialIndexBindings,
  executeWithExactPlanEvidence,
};
