const db = require('../config/database');

const TABLE_NAME = 'APP_DATASET_STATE';

function normalizeRow(row) {
  if (!row) return null;
  return {
    source: String(row.ACTIVE_SOURCE || '').toLowerCase() || 'custom',
    label: row.ACTIVE_LABEL || null,
    version: row.ACTIVE_VERSION || null,
    generationId: row.ACTIVE_GENERATION || null,
    updatedAt: row.UPDATED_AT instanceof Date
      ? row.UPDATED_AT.toISOString()
      : (row.UPDATED_AT || null),
  };
}

async function ensureTable(connection) {
  const exists = await connection.execute(
    `
      SELECT COUNT(*) AS CNT
      FROM user_tables
      WHERE table_name = :tableName
    `,
    { tableName: TABLE_NAME },
    { autoCommit: false }
  );

  if (!Number(exists.rows[0]?.CNT || 0)) {
    await connection.execute(
      `
      CREATE TABLE app_dataset_state (
        state_id NUMBER(1) PRIMARY KEY
          CHECK (state_id = 1),
        active_source VARCHAR2(20) NOT NULL
          CHECK (active_source IN ('demo', 'custom')),
        active_label VARCHAR2(100) NOT NULL,
      active_version VARCHAR2(20),
        active_generation VARCHAR2(100) NOT NULL,
        updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
      )
    `,
      {},
      { autoCommit: false }
    );
  }

  const generationColumn = await connection.execute(
    `SELECT COUNT(*) AS cnt FROM user_tab_columns WHERE table_name = :tableName AND column_name = 'ACTIVE_GENERATION'`,
    { tableName: TABLE_NAME }, { autoCommit: false }
  );
  if (!Number(generationColumn.rows[0]?.CNT || 0)) {
    await connection.execute(`ALTER TABLE app_dataset_state ADD (active_generation VARCHAR2(100))`, {}, { autoCommit: false });
    await connection.execute(`UPDATE app_dataset_state SET active_generation = RAWTOHEX(SYS_GUID()) WHERE active_generation IS NULL`, {}, { autoCommit: false });
    await connection.execute(`ALTER TABLE app_dataset_state MODIFY (active_generation NOT NULL)`, {}, { autoCommit: false });
  }
}

async function readStoredState(connection) {
  const result = await connection.execute(
    `
      SELECT active_source, active_label, active_version, active_generation, updated_at
      FROM app_dataset_state
      WHERE state_id = 1
    `,
    {},
    { autoCommit: false }
  );

  return normalizeRow(result.rows[0] || null);
}

async function getStoredDatasetState() {
  let connection;
  try {
    connection = await db.getConnection();
    await ensureTable(connection);
    return await readStoredState(connection);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function saveDatasetStateOnConnection(connection, { source, label, version = null, generationId = null }, { commit = false } = {}) {
  await ensureTable(connection);
  const generation = generationId || `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await connection.execute(
    `
      MERGE INTO app_dataset_state target
      USING (SELECT 1 AS state_id, :source AS active_source, :label AS active_label,
        :version AS active_version, :generation AS active_generation FROM dual) incoming
      ON (target.state_id = incoming.state_id)
      WHEN MATCHED THEN UPDATE SET target.active_source = incoming.active_source,
        target.active_label = incoming.active_label, target.active_version = incoming.active_version,
        target.active_generation = incoming.active_generation, target.updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (state_id, active_source, active_label, active_version, active_generation, updated_at)
        VALUES (incoming.state_id, incoming.active_source, incoming.active_label, incoming.active_version, incoming.active_generation, SYSTIMESTAMP)
    `,
    { source: String(source || 'custom').toLowerCase(), label: label || (String(source || '').toLowerCase() === 'demo' ? 'Demo Data' : 'Custom Dataset'), version, generation },
    { autoCommit: false }
  );
  if (commit) await connection.commit();
  return readStoredState(connection);
}

async function saveDatasetState({ source, label, version = null, generationId = null }) {
  let connection;
  try {
    connection = await db.getConnection();
    return await saveDatasetStateOnConnection(connection, { source, label, version, generationId }, { commit: true });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

module.exports = {
  getStoredDatasetState,
  saveDatasetState,
  saveDatasetStateOnConnection,
  ensureTable,
  readStoredState,
};
