const db = require('../config/database');

const REFRESH_SOCIAL_VIRALITY_SQL = `
UPDATE social_posts
SET virality_score = ROUND(
  LEAST(
    100,
    LEAST(GREATEST(NVL(likes_count, 0), 0) / 500, 45) +
    LEAST(GREATEST(NVL(shares_count, 0), 0) / 250, 25) +
    LEAST(GREATEST(NVL(comments_count, 0), 0) / 200, 15) +
    LEAST(GREATEST(NVL(views_count, 0), 0) / 200000, 10) +
    CASE NVL(momentum_flag, 'normal')
      WHEN 'mega_viral' THEN 30
      WHEN 'viral' THEN 20
      WHEN 'rising' THEN 10
      ELSE 0
    END
  ),
  2
)
`;

async function execSql(connection, sql, binds = {}, options = {}) {
  return connection.execute(sql, binds, {
    autoCommit: false,
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    ...options,
  });
}

async function getViralitySummary(connection, updatedRows = 0) {
  const result = await execSql(connection, `
    SELECT COUNT(*) AS total_posts,
           COUNT(virality_score) AS scored_posts,
           ROUND(MIN(virality_score), 2) AS min_score,
           ROUND(MAX(virality_score), 2) AS max_score,
           ROUND(AVG(virality_score), 2) AS avg_score
    FROM social_posts
  `);

  const row = result.rows[0] || {};
  return {
    updated_rows: Number(updatedRows || 0),
    total_posts: Number(row.TOTAL_POSTS || 0),
    scored_posts: Number(row.SCORED_POSTS || 0),
    min_score: row.MIN_SCORE === null ? null : Number(row.MIN_SCORE),
    max_score: row.MAX_SCORE === null ? null : Number(row.MAX_SCORE),
    avg_score: row.AVG_SCORE === null ? null : Number(row.AVG_SCORE),
  };
}

async function refreshSocialViralityScores(connection) {
  if (!connection) {
    throw new Error('A live Oracle connection is required to refresh social virality scores.');
  }

  const updateResult = await execSql(connection, REFRESH_SOCIAL_VIRALITY_SQL);
  return getViralitySummary(connection, updateResult.rowsAffected || 0);
}

module.exports = {
  REFRESH_SOCIAL_VIRALITY_SQL,
  refreshSocialViralityScores,
};
