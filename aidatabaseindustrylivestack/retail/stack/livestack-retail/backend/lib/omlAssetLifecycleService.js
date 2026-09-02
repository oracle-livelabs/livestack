const db = require('../config/database');

const SYSTEM_IDENTITY = 'admin_jess';
const ASSET_TABLE = 'APP_OML_ASSET_INVENTORY';
const STAGE_TABLES = Object.freeze([
  'APP_OML_STAGE_DEMAND',
  'APP_OML_STAGE_CUSTOMER',
  'APP_OML_STAGE_REVENUE',
  'APP_OML_STAGE_PRODUCT',
]);
const DEFAULT_RETAINED_GENERATIONS = Math.max(
  1,
  Math.min(20, Number.parseInt(process.env.OML_ASSET_RETAINED_GENERATIONS || '5', 10))
);

function assertGenerationId(value) {
  const generationId = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(generationId)) {
    throw new Error('Unsafe OML generation identifier.');
  }
  return generationId;
}

function assertIdentifier(value) {
  const identifier = String(value || '').toUpperCase();
  if (!/^[A-Z][A-Z0-9_$#]{0,29}$/.test(identifier)) {
    throw new Error(`Unsafe OML asset identifier ${value || ''}.`);
  }
  return identifier;
}

function assertStageTable(value) {
  const table = String(value || '').toUpperCase();
  if (!STAGE_TABLES.includes(table)) {
    throw new Error(`Unregistered OML stage table ${value || ''}.`);
  }
  return table;
}

function assertStageColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Canonical OML stage columns are required.');
  }
  return columns.map((value) => {
    const column = String(value || '').toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(column)) {
      throw new Error(`Unsafe OML stage column ${value || ''}.`);
    }
    return column;
  });
}

async function execSql(connection, sql, binds = {}, options = {}) {
  return connection.execute(sql, binds, {
    autoCommit: false,
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    ...options,
  });
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, SYSTEM_IDENTITY, { autoCommit: false });
    return await callback(connection);
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    throw error;
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'OML asset lifecycle' });
  }
}

async function computeOracleStageProvenance(
  connection,
  {
    generationId,
    stageTable,
    columns,
  }
) {
  const safeGeneration = assertGenerationId(generationId);
  const safeTable = assertStageTable(stageTable);
  const safeColumns = assertStageColumns(columns);
  const canonicalJson = safeColumns
    .map((column) => `'${column}' VALUE ${column}`)
    .join(', ');

  // Three bounded LISTAGG levels preserve the complete ordered set without
  // relying on JavaScript declarations. At the import limit (100,000 rows),
  // every concatenation remains below 4,000 bytes and STANDARD_HASH derives
  // the registry provenance from the exact Oracle stage rows used by OML.
  const result = await execSql(connection, `
    WITH row_hashes AS (
      SELECT source_case_id,
             RAWTOHEX(STANDARD_HASH(
               JSON_OBJECT(
                 ${canonicalJson}
                 NULL ON NULL RETURNING VARCHAR2(4000)
               ),
               'SHA256'
             )) row_hash
      FROM ${safeTable}
      WHERE generation_id = :generationId
    ),
    numbered_rows AS (
      SELECT row_hash,
             ROW_NUMBER() OVER (ORDER BY source_case_id) row_number_value
      FROM row_hashes
    ),
    level_one AS (
      SELECT CEIL(row_number_value / 50) bucket_id,
             RAWTOHEX(STANDARD_HASH(
               LISTAGG(row_hash, '') WITHIN GROUP (ORDER BY row_number_value),
               'SHA256'
             )) bucket_hash
      FROM numbered_rows
      GROUP BY CEIL(row_number_value / 50)
    ),
    numbered_level_one AS (
      SELECT bucket_hash,
             ROW_NUMBER() OVER (ORDER BY bucket_id) bucket_number
      FROM level_one
    ),
    level_two AS (
      SELECT CEIL(bucket_number / 50) bucket_id,
             RAWTOHEX(STANDARD_HASH(
               LISTAGG(bucket_hash, '') WITHIN GROUP (ORDER BY bucket_number),
               'SHA256'
             )) bucket_hash
      FROM numbered_level_one
      GROUP BY CEIL(bucket_number / 50)
    ),
    numbered_level_two AS (
      SELECT bucket_hash,
             ROW_NUMBER() OVER (ORDER BY bucket_id) bucket_number
      FROM level_two
    ),
    row_summary AS (
      SELECT COUNT(*) training_row_count
      FROM row_hashes
    ),
    fingerprint_summary AS (
      SELECT NVL(
               RAWTOHEX(STANDARD_HASH(
                 LISTAGG(bucket_hash, '') WITHIN GROUP (ORDER BY bucket_number),
                 'SHA256'
               )),
               RAWTOHEX(STANDARD_HASH('EMPTY', 'SHA256'))
             ) training_fingerprint
      FROM numbered_level_two
    )
    SELECT row_summary.training_row_count,
           fingerprint_summary.training_fingerprint
    FROM row_summary
    CROSS JOIN fingerprint_summary
  `, { generationId: safeGeneration });
  const row = result.rows?.[0] || {};
  const trainingRowCount = Number(row.TRAINING_ROW_COUNT || 0);
  const trainingFingerprint = String(row.TRAINING_FINGERPRINT || '').toUpperCase();
  if (!Number.isInteger(trainingRowCount) || trainingRowCount < 1
      || !/^[A-F0-9]{64}$/.test(trainingFingerprint)) {
    throw new Error(`Oracle stage provenance is incomplete for ${safeTable}.`);
  }
  return {
    trainingRowCount,
    trainingFingerprint,
  };
}

async function registerCandidateAssetInventory(connection, { generationId, models }) {
  const safeGeneration = assertGenerationId(generationId);
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('Candidate OML asset plan is empty.');
  }
  const active = await execSql(connection, `
    SELECT
      (SELECT COUNT(*) FROM app_oml_model_registry
       WHERE generation_id = :generationId) registry_count,
      (SELECT COUNT(*) FROM app_dataset_state
       WHERE state_id = 1 AND active_generation_id = :generationId) state_count
    FROM dual
  `, { generationId: safeGeneration });
  const activeRow = active.rows?.[0] || {};
  if (Number(activeRow.REGISTRY_COUNT || 0) > 0
      || Number(activeRow.STATE_COUNT || 0) > 0) {
    throw new Error(`Active OML generation ${safeGeneration} cannot be restaged.`);
  }

  for (const model of models) {
    const logicalName = assertIdentifier(model.logicalName);
    const assets = [
      { assetType: 'MODEL', assetName: assertIdentifier(model.physicalName) },
      { assetType: 'VIEW', assetName: assertIdentifier(model.dataView) },
    ];
    for (const asset of assets) {
      await execSql(connection, `
        MERGE INTO ${ASSET_TABLE} target
        USING (
          SELECT :generationId generation_id, :logicalName logical_name,
                 :assetType asset_type, :assetName asset_name
          FROM dual
        ) source
        ON (
          target.generation_id = source.generation_id
          AND target.asset_type = source.asset_type
          AND target.asset_name = source.asset_name
        )
        WHEN MATCHED THEN UPDATE SET
          target.logical_name = source.logical_name,
          target.asset_status = 'PLANNED',
          target.failure_reason = NULL,
          target.updated_at = SYSTIMESTAMP,
          target.activated_at = NULL,
          target.retired_at = NULL,
          target.dropped_at = NULL
          WHERE target.asset_status <> 'ACTIVE'
        WHEN NOT MATCHED THEN INSERT (
          generation_id, logical_name, asset_type, asset_name,
          asset_status, created_at, updated_at
        ) VALUES (
          source.generation_id, source.logical_name, source.asset_type,
          source.asset_name, 'PLANNED', SYSTIMESTAMP, SYSTIMESTAMP
        )
      `, {
        generationId: safeGeneration,
        logicalName,
        assetType: asset.assetType,
        assetName: asset.assetName,
      });
    }
  }
  // This durable inventory must exist before CREATE VIEW or CREATE_MODEL can
  // implicitly commit. Startup can therefore clean every crash position.
  await connection.commit();
  return { generationId: safeGeneration, assetsPlanned: models.length * 2 };
}

async function markAssetCreated(connection, {
  generationId,
  assetType,
  assetName,
}) {
  const result = await execSql(connection, `
    UPDATE ${ASSET_TABLE}
    SET asset_status = 'CREATED', updated_at = SYSTIMESTAMP
    WHERE generation_id = :generationId
      AND asset_type = :assetType
      AND asset_name = :assetName
      AND asset_status IN ('PLANNED','CREATED')
  `, {
    generationId: assertGenerationId(generationId),
    assetType: String(assetType || '').toUpperCase(),
    assetName: assertIdentifier(assetName),
  });
  if (Number(result.rowsAffected || 0) !== 1) {
    throw new Error(`OML ${assetType} ${assetName} is absent from its pre-DDL inventory.`);
  }
}

async function activateOmlAssetInventoryOnConnection(connection, candidate) {
  const generationId = assertGenerationId(candidate?.generationId);
  for (const model of candidate.models || []) {
    const logicalName = assertIdentifier(model.logicalName);
    const physicalName = assertIdentifier(model.physicalName);
    const dataView = assertIdentifier(model.dataView);
    await execSql(connection, `
      UPDATE ${ASSET_TABLE}
      SET asset_status = 'SUPERSEDED', retired_at = SYSTIMESTAMP,
          updated_at = SYSTIMESTAMP
      WHERE logical_name = :logicalName
        AND asset_status = 'ACTIVE'
        AND NOT (
          generation_id = :generationId
          AND asset_name IN (:physicalName, :dataView)
        )
    `, {
      logicalName,
      generationId,
      physicalName,
      dataView,
    });
    const activated = await execSql(connection, `
      UPDATE ${ASSET_TABLE}
      SET asset_status = 'ACTIVE', activated_at = SYSTIMESTAMP,
          retired_at = NULL, failure_reason = NULL, updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId
        AND logical_name = :logicalName
        AND asset_name IN (:physicalName, :dataView)
        AND asset_status IN ('CREATED','ACTIVE')
    `, {
      generationId,
      logicalName,
      physicalName,
      dataView,
    });
    if (Number(activated.rowsAffected || 0) !== 2) {
      throw new Error(`OML active asset inventory is incomplete for ${logicalName}.`);
    }
    await execSql(connection, `
      UPDATE app_oml_training_generations
      SET status = 'SUPERSEDED', retired_at = SYSTIMESTAMP,
          updated_at = SYSTIMESTAMP
      WHERE logical_name = :logicalName
        AND generation_id <> :generationId
        AND status = 'ACTIVE'
    `, { logicalName, generationId });
  }
}

async function dropModelIfPresent(connection, modelName) {
  await execSql(connection, `
    BEGIN
      DBMS_DATA_MINING.DROP_MODEL(:modelName);
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE NOT IN (-40102, -40201, -40284) THEN RAISE; END IF;
    END;
  `, { modelName: assertIdentifier(modelName) });
}

async function dropViewIfPresent(connection, viewName) {
  const safeView = assertIdentifier(viewName);
  try {
    await execSql(connection, `DROP VIEW ${safeView}`);
  } catch (error) {
    if (Math.abs(Number(error?.errorNum || 0)) !== 942
        && !/ORA-00942/.test(String(error?.message || ''))) {
      throw error;
    }
  }
}

async function cleanupOmlAssetsOnConnection(connection, { generationId = null } = {}) {
  const binds = {};
  const generationFilter = generationId
    ? 'AND inventory.generation_id = :generationId'
    : '';
  if (generationId) binds.generationId = assertGenerationId(generationId);
  const result = await execSql(connection, `
    SELECT inventory.generation_id, inventory.asset_type, inventory.asset_name
    FROM ${ASSET_TABLE} inventory
    WHERE inventory.asset_status IN (
      'PLANNED','CREATED','FAILED','SUPERSEDED'
    )
      ${generationFilter}
      AND NOT EXISTS (
        SELECT 1
        FROM app_oml_model_registry registry
        WHERE registry.generation_id = inventory.generation_id
           OR registry.physical_name = inventory.asset_name
      )
      AND NOT EXISTS (
        SELECT 1
        FROM app_dataset_state state
        WHERE state.state_id = 1
          AND state.active_generation_id = inventory.generation_id
      )
    ORDER BY
      CASE inventory.asset_type WHEN 'MODEL' THEN 1 ELSE 2 END,
      inventory.asset_name
  `, binds);

  let assetsDropped = 0;
  for (const asset of result.rows || []) {
    if (asset.ASSET_TYPE === 'MODEL') {
      await dropModelIfPresent(connection, asset.ASSET_NAME);
    } else if (asset.ASSET_TYPE === 'VIEW') {
      await dropViewIfPresent(connection, asset.ASSET_NAME);
    } else {
      throw new Error(`Unsupported OML asset type ${asset.ASSET_TYPE}.`);
    }
    await execSql(connection, `
      UPDATE ${ASSET_TABLE}
      SET asset_status = 'DROPPED', dropped_at = SYSTIMESTAMP,
          updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId
        AND asset_type = :assetType
        AND asset_name = :assetName
        AND asset_status <> 'ACTIVE'
    `, {
      generationId: asset.GENERATION_ID,
      assetType: asset.ASSET_TYPE,
      assetName: asset.ASSET_NAME,
    });
    assetsDropped += 1;
  }
  await connection.commit();
  return { assetsDropped };
}

async function markOmlGenerationFailedAndCleanup(
  connection,
  generationId,
  error
) {
  const safeGeneration = assertGenerationId(generationId);
  const failureReason = String(error?.message || error || 'OML candidate failed').slice(0, 2000);
  await execSql(connection, `
    UPDATE ${ASSET_TABLE} inventory
    SET asset_status = 'FAILED',
        failure_reason = :failureReason,
        retired_at = SYSTIMESTAMP,
        updated_at = SYSTIMESTAMP
    WHERE inventory.generation_id = :generationId
      AND inventory.asset_status <> 'ACTIVE'
      AND inventory.asset_status <> 'DROPPED'
      AND NOT EXISTS (
        SELECT 1 FROM app_oml_model_registry registry
        WHERE registry.generation_id = inventory.generation_id
           OR registry.physical_name = inventory.asset_name
      )
  `, { generationId: safeGeneration, failureReason });
  await execSql(connection, `
    UPDATE app_oml_training_generations training
    SET status = 'FAILED', failed_reason = :failureReason,
        retired_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP
    WHERE training.generation_id = :generationId
      AND training.status <> 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM app_oml_model_registry registry
        WHERE registry.generation_id = training.generation_id
      )
  `, { generationId: safeGeneration, failureReason });
  await connection.commit();
  return cleanupOmlAssetsOnConnection(connection, { generationId: safeGeneration });
}

async function pruneRetiredOmlGenerationsOnConnection(
  connection,
  retainedGenerations = DEFAULT_RETAINED_GENERATIONS
) {
  const retention = Math.max(1, Math.min(20, Number(retainedGenerations) || 1));
  const result = await execSql(connection, `
    WITH generation_sources AS (
      SELECT inventory.generation_id, MAX(inventory.updated_at) last_updated
      FROM ${ASSET_TABLE} inventory
      WHERE inventory.asset_status = 'DROPPED'
      GROUP BY inventory.generation_id
      UNION ALL
      SELECT training.generation_id, MAX(training.updated_at) last_updated
      FROM APP_OML_TRAINING_GENERATIONS training
      WHERE training.status = 'FAILED'
      GROUP BY training.generation_id
      UNION ALL
      SELECT generation_id, TIMESTAMP '1970-01-01 00:00:00' last_updated
      FROM APP_OML_STAGE_DEMAND
      GROUP BY generation_id
      UNION ALL
      SELECT generation_id, TIMESTAMP '1970-01-01 00:00:00' last_updated
      FROM APP_OML_STAGE_CUSTOMER
      GROUP BY generation_id
      UNION ALL
      SELECT generation_id, TIMESTAMP '1970-01-01 00:00:00' last_updated
      FROM APP_OML_STAGE_REVENUE
      GROUP BY generation_id
      UNION ALL
      SELECT generation_id, TIMESTAMP '1970-01-01 00:00:00' last_updated
      FROM APP_OML_STAGE_PRODUCT
      GROUP BY generation_id
    ),
    abandoned_generations AS (
      SELECT sources.generation_id, MAX(sources.last_updated) last_updated
      FROM generation_sources sources
      WHERE NOT EXISTS (
        SELECT 1 FROM app_oml_model_registry registry
        WHERE registry.generation_id = sources.generation_id
      )
        AND NOT EXISTS (
          SELECT 1 FROM app_dataset_state state
          WHERE state.state_id = 1
            AND state.active_generation_id = sources.generation_id
        )
      GROUP BY sources.generation_id
    )
    SELECT generation_id
    FROM (
      SELECT generation_id,
             DENSE_RANK() OVER (
               ORDER BY last_updated DESC, generation_id DESC
             ) retention_rank
      FROM abandoned_generations
    )
    WHERE retention_rank > :retention
  `, { retention });
  for (const row of result.rows || []) {
    const generationId = assertGenerationId(row.GENERATION_ID);
    for (const stageTable of STAGE_TABLES) {
      await execSql(
        connection,
        `DELETE FROM ${stageTable} WHERE generation_id = :generationId`,
        { generationId }
      );
    }
    await execSql(connection, `
      DELETE FROM app_oml_training_generations
      WHERE generation_id = :generationId
    `, { generationId });
    await execSql(connection, `
      DELETE FROM ${ASSET_TABLE}
      WHERE generation_id = :generationId
        AND asset_status = 'DROPPED'
    `, { generationId });
  }
  await connection.commit();
  return { generationsPruned: (result.rows || []).length, retention };
}

async function cleanupSupersededOmlAssets(connection) {
  return cleanupOmlAssetsOnConnection(connection);
}

async function reconcileOmlAssetsOnStartup() {
  return withConnection(async (connection) => {
    const reason = 'Startup reconciled an abandoned pre-activation OML generation.';
    await execSql(connection, `
      UPDATE ${ASSET_TABLE} inventory
      SET asset_status = 'FAILED',
          failure_reason = NVL(failure_reason, :reason),
          retired_at = NVL(retired_at, SYSTIMESTAMP),
          updated_at = SYSTIMESTAMP
      WHERE inventory.asset_status IN ('PLANNED','CREATED')
        AND NOT EXISTS (
          SELECT 1 FROM app_oml_model_registry registry
          WHERE registry.generation_id = inventory.generation_id
             OR registry.physical_name = inventory.asset_name
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_dataset_state state
          WHERE state.state_id = 1
            AND state.active_generation_id = inventory.generation_id
        )
    `, { reason });
    await execSql(connection, `
      UPDATE app_oml_training_generations training
      SET status = 'FAILED',
          failed_reason = NVL(failed_reason, :reason),
          retired_at = NVL(retired_at, SYSTIMESTAMP),
          updated_at = SYSTIMESTAMP
      WHERE training.status IN ('STAGED','TRAINED','VALIDATED')
        AND NOT EXISTS (
          SELECT 1 FROM app_oml_model_registry registry
          WHERE registry.generation_id = training.generation_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM app_dataset_state state
          WHERE state.state_id = 1
            AND state.active_generation_id = training.generation_id
        )
    `, { reason });
    await connection.commit();
    const cleanup = await cleanupOmlAssetsOnConnection(connection);
    const pruning = await pruneRetiredOmlGenerationsOnConnection(connection);
    return { ...cleanup, ...pruning };
  });
}

module.exports = {
  activateOmlAssetInventoryOnConnection,
  cleanupOmlAssetsOnConnection,
  cleanupSupersededOmlAssets,
  computeOracleStageProvenance,
  markAssetCreated,
  markOmlGenerationFailedAndCleanup,
  pruneRetiredOmlGenerationsOnConnection,
  reconcileOmlAssetsOnStartup,
  registerCandidateAssetInventory,
  _private: {
    ASSET_TABLE,
    DEFAULT_RETAINED_GENERATIONS,
    STAGE_TABLES,
    assertGenerationId,
    assertIdentifier,
    assertStageColumns,
    assertStageTable,
  },
};
