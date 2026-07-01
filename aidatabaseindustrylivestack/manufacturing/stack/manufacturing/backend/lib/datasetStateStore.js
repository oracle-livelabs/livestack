const db = require('../config/database');

function normalizeRow(row) {
  if (!row) return null;
  return {
    source: String(row.ACTIVE_SOURCE || '').toLowerCase() || 'custom',
    label: row.ACTIVE_LABEL || null,
    version: row.ACTIVE_VERSION || null,
    updatedAt: row.UPDATED_AT instanceof Date
      ? row.UPDATED_AT.toISOString()
      : (row.UPDATED_AT || null),
  };
}

async function readStoredState(connection) {
  const result = await connection.execute(
    `
      SELECT active_source, active_label, active_version, updated_at
      FROM app_dataset_state
      WHERE state_id = 1
    `,
    {},
    { autoCommit: false }
  );

  return normalizeRow(result.rows[0] || null);
}

async function getStoredDatasetState() {
  return db.withUserConnection('admin_jess', async ({ connection }) => {
    return await readStoredState(connection);
  }, { readOnly: true });
}

module.exports = {
  getStoredDatasetState,
};
