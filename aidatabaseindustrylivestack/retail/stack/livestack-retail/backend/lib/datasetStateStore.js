const db = require('../config/database');

const TABLE_NAME = 'APP_DATASET_STATE';

function normalizeRow(row) {
  if (!row) return null;
  return {
    source: String(row.ACTIVE_SOURCE || '').toLowerCase() || 'custom',
    label: row.ACTIVE_LABEL || null,
    version: row.ACTIVE_VERSION || null,
    generationId: row.ACTIVE_GENERATION_ID || null,
    updatedAt: row.UPDATED_AT instanceof Date
      ? row.UPDATED_AT.toISOString()
      : (row.UPDATED_AT || null),
  };
}

async function readStoredState(connection) {
  const result = await connection.execute(
    `
      SELECT active_source, active_label, active_version,
             active_generation_id, updated_at
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
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    return await readStoredState(connection);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'dataset state read' });
  }
}

async function saveDatasetState({ source, label, version = null }) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });

    await connection.execute(
      `
        MERGE INTO app_dataset_state target
        USING (
          SELECT
            1 AS state_id,
            :source AS active_source,
            :label AS active_label,
            :version AS active_version
          FROM dual
        ) incoming
        ON (target.state_id = incoming.state_id)
        WHEN MATCHED THEN UPDATE SET
          target.active_source = incoming.active_source,
          target.active_label = incoming.active_label,
          target.active_version = incoming.active_version,
          target.updated_at = SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (
          state_id,
          active_source,
          active_label,
          active_version,
          updated_at
        ) VALUES (
          incoming.state_id,
          incoming.active_source,
          incoming.active_label,
          incoming.active_version,
          SYSTIMESTAMP
        )
      `,
      {
        source: String(source || 'custom').toLowerCase(),
        label: label || (String(source || '').toLowerCase() === 'demo' ? 'Demo Data' : 'Custom Dataset'),
        version,
      },
      { autoCommit: false }
    );

    await connection.commit();
    return await readStoredState(connection);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'dataset state write' });
  }
}

module.exports = {
  getStoredDatasetState,
  saveDatasetState,
};
