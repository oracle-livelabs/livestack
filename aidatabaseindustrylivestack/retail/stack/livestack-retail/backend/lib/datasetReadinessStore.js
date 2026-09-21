const db = require('../config/database');

const clone = (value) => (value == null ? null : JSON.parse(JSON.stringify(value)));
const jsonBind = (value) => (value == null ? null : { val: clone(value), type: db.oracledb.DB_TYPE_JSON });

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    await db.setSecurityContext(connection, 'admin_jess', { autoCommit: false });
    return await callback(connection);
  } finally {
    await db.releaseConnection(connection, { rollback: true, label: 'dataset readiness state' });
  }
}

async function getDatasetReadiness() {
  return withConnection(async (connection) => {
    const result = await connection.execute(`
      SELECT dataset_source, dataset_version, job_id, status, readiness,
             failure_message, activated_at, updated_at
      FROM app_dataset_readiness WHERE readiness_id = 1
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
    return result.rows?.[0] || null;
  });
}

async function saveActiveDatasetReadiness({ source, version, jobId, readiness }) {
  return withConnection(async (connection) => {
    await connection.execute(`
      UPDATE app_dataset_readiness
      SET dataset_source = :source, dataset_version = :version, job_id = :jobId,
          status = 'ACTIVE', readiness = :readiness, failure_message = NULL,
          activated_at = SYSTIMESTAMP, updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
    `, { source, version, jobId, readiness: jsonBind(readiness) }, { autoCommit: false });
    await connection.commit();
    return getDatasetReadiness();
  });
}

async function markDatasetReadinessFailed({ jobId, attemptedVersion, readiness, message }) {
  return withConnection(async (connection) => {
    await connection.execute(`
      UPDATE app_dataset_readiness
      SET job_id = :jobId, status = 'FAILED', readiness = :readiness,
          failure_message = :message, updated_at = SYSTIMESTAMP
      WHERE readiness_id = 1
    `, {
      jobId,
      readiness: jsonBind({ attemptedVersion, ...(readiness || {}) }),
      message: String(message || 'Required feature readiness failed.').slice(0, 2000),
    }, { autoCommit: false });
    await connection.commit();
  });
}

module.exports = {
  getDatasetReadiness,
  saveActiveDatasetReadiness,
  markDatasetReadinessFailed,
};
