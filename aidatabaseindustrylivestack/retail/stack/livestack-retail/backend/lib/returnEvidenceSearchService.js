const { questionTerms, rankEvidence } = require('./returnQuestionService');

const SOURCE_TABLES = Object.freeze({
  RETURN_CASE: 'RETURN_REQUESTS',
  POLICY: 'RETURN_POLICY_CLAUSES',
  DOCUMENT: 'RETURN_DOCUMENTS',
  EVENT: 'RETURN_EVENTS',
  DECISION: 'RETURN_DECISIONS',
  CUSTOMER_HISTORY: 'CUSTOMERS',
});

const SOURCE_LABELS = Object.freeze({
  RETURN_CASE: 'Return case',
  POLICY: 'Policy clause',
  DOCUMENT: 'Return document',
  EVENT: 'Return event',
  DECISION: 'Decision',
  CUSTOMER_HISTORY: 'Customer history',
});

function citationForRow(row) {
  const sourceType = String(row.SOURCE_TYPE || '').toUpperCase();
  const table = SOURCE_TABLES[sourceType] || 'RETURN_EVIDENCE_INDEX';
  const sourceId = sourceType === 'RETURN_CASE'
    ? `RET-${String(row.RETURN_ID).padStart(4, '0')}`
    : row.SOURCE_ID;
  return `${table} · ${sourceId}`;
}

function fuseReturnEvidence(question, rows = []) {
  const lexical = rankEvidence(question, rows.map((row) => ({
    evidenceId: Number(row.EVIDENCE_ID),
    sourceCode: String(row.SOURCE_TYPE || '').toUpperCase(),
    sourceType: SOURCE_LABELS[String(row.SOURCE_TYPE || '').toUpperCase()]
      || 'Return evidence',
    title: row.TITLE,
    text: row.EVIDENCE_TEXT,
    semanticScore: Number(row.SIMILARITY_SCORE || 0),
    citation: citationForRow(row),
    generationId: row.GENERATION_ID,
  })));
  const termCount = Math.max(questionTerms(question).length, 1);

  return lexical.map((item) => {
    const lexicalScore = Math.min(item.matchedTerms.length / Math.min(termCount, 4), 1);
    const semanticScore = Math.max(0, Math.min(Number(item.semanticScore || 0), 1));
    const hybridScore = (semanticScore * 0.72) + (lexicalScore * 0.28);
    return {
      ...item,
      lexicalScore: Number(lexicalScore.toFixed(4)),
      semanticScore: Number(semanticScore.toFixed(4)),
      hybridScore: Number(hybridScore.toFixed(4)),
      retrievalMode: 'oracle_vector_hybrid',
    };
  }).sort((left, right) => right.hybridScore - left.hybridScore
    || right.semanticScore - left.semanticScore
    || left.evidenceId - right.evidenceId);
}

module.exports = {
  SOURCE_LABELS,
  SOURCE_TABLES,
  fuseReturnEvidence,
};
