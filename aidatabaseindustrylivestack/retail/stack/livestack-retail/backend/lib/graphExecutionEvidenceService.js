const db = require('../config/database');

class GraphExecutionEvidenceError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'GraphExecutionEvidenceError';
    this.code = 'GRAPH_EXECUTION_EVIDENCE_UNAVAILABLE';
    this.statusCode = 503;
    this.details = details;
  }
}

const executeOptions = Object.freeze({
  outFormat: db.oracledb.OUT_FORMAT_OBJECT,
  autoCommit: false,
});

async function captureGraphCursorEvidence(connection) {
  const previous = await connection.execute(`
    SELECT prev_sql_id, prev_child_number
    FROM v$session
    WHERE audsid = SYS_CONTEXT('USERENV', 'SESSIONID')
  `, {}, executeOptions);
  const sqlId = previous.rows?.[0]?.PREV_SQL_ID;
  const childNumber = previous.rows?.[0]?.PREV_CHILD_NUMBER;
  if (!sqlId || !Number.isInteger(Number(childNumber))) {
    throw new GraphExecutionEvidenceError(
      'The current SQL/PGQ cursor identity is unavailable.',
      { sqlId: sqlId || null, childNumber: childNumber ?? null }
    );
  }

  const cursor = await connection.execute(`
    SELECT DBMS_LOB.SUBSTR(sql_fulltext, 4000, 1) sql_text,
           plan_hash_value
    FROM v$sql
    WHERE sql_id = :sqlId
      AND child_number = :childNumber
    FETCH FIRST 1 ROW ONLY
  `, { sqlId, childNumber }, executeOptions);
  const sqlText = String(cursor.rows?.[0]?.SQL_TEXT || '');
  if (!/GRAPH_TABLE\s*\(\s*influencer_network\b/i.test(sqlText)) {
    throw new GraphExecutionEvidenceError(
      'The current cursor did not execute GRAPH_TABLE on INFLUENCER_NETWORK.',
      { sqlId, childNumber }
    );
  }
  const planHashValue = Number(cursor.rows?.[0]?.PLAN_HASH_VALUE || 0);
  if (!Number.isInteger(planHashValue) || planHashValue <= 0) {
    throw new GraphExecutionEvidenceError(
      'The exact SQL/PGQ cursor plan hash is unavailable.',
      { sqlId, childNumber, planHashValue }
    );
  }

  const display = await connection.execute(`
    SELECT plan_table_output
    FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
      :sqlId, :childNumber, 'BASIC +ALIAS +PREDICATE'
    ))
  `, { sqlId, childNumber }, executeOptions);
  const planText = (display.rows || [])
    .map((row) => row.PLAN_TABLE_OUTPUT)
    .filter(Boolean)
    .join('\n');
  if (!planText || /cannot be found|no plan table output/i.test(planText)) {
    throw new GraphExecutionEvidenceError(
      'The exact SQL/PGQ cursor plan is unavailable.',
      { sqlId, childNumber }
    );
  }

  const plan = await connection.execute(`
    SELECT id, operation, options, object_owner, object_name
    FROM v$sql_plan
    WHERE sql_id = :sqlId
      AND child_number = :childNumber
    ORDER BY id
  `, { sqlId, childNumber }, executeOptions);
  if (!(plan.rows || []).length) {
    throw new GraphExecutionEvidenceError(
      'The exact SQL/PGQ cursor has no inspectable plan rows.',
      { sqlId, childNumber }
    );
  }
  const representative = (plan.rows || []).find((row) => (
    String(row.OPERATION || '').toUpperCase() !== 'SELECT STATEMENT'
  )) || plan.rows[0];
  const planOperation = [representative.OPERATION, representative.OPTIONS]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  return Object.freeze({
    available: true,
    feature: 'SQL_PROPERTY_GRAPH',
    graphName: 'INFLUENCER_NETWORK',
    operator: 'GRAPH_TABLE',
    language: 'SQL/PGQ',
    sqlId,
    childNumber: Number(childNumber),
    planHashValue,
    planOperation,
  });
}

module.exports = {
  GraphExecutionEvidenceError,
  captureGraphCursorEvidence,
};
