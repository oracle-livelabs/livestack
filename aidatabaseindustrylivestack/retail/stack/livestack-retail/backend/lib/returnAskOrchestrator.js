'use strict';

const {
  buildReturnQuestionAnswer,
  routeReturnQuestion,
} = require('./returnQuestionService');
const { fuseReturnEvidence } = require('./returnEvidenceSearchService');
const { synthesizeReturnAnswer } = require('./returnGroundedSynthesisService');

function getDatabase() {
  return require('../config/database');
}

function vectorUnavailable(message, code = 'RETURN_VECTOR_UNAVAILABLE') {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = code;
  return error;
}

async function readReturnEvidenceGlobalReadiness(execute = null) {
  const run = execute || getDatabase().executeSystem;
  const metadata = await run(`
    SELECT state.active_generation_id,
           readiness.status AS readiness_status,
           JSON_VALUE(readiness.readiness, '$.generationId'
             RETURNING VARCHAR2(64)) AS published_generation,
           JSON_VALUE(readiness.readiness, '$.returnEvidenceVectors'
             RETURNING NUMBER) AS published_return_evidence,
           JSON_VALUE(readiness.readiness, '$.expectedReturnEvidenceVectors'
             RETURNING NUMBER) AS published_expected_return_evidence,
           JSON_VALUE(readiness.readiness, '$.invalidReturnEvidenceVectors'
             RETURNING NUMBER) AS published_invalid_return_evidence,
           (SELECT COUNT(*)
            FROM user_indexes
            WHERE index_name = 'IDX_RETURN_EVIDENCE_VEC'
              AND index_type = 'VECTOR'
              AND status = 'VALID') AS valid_index_count
    FROM app_dataset_state state
    CROSS JOIN app_dataset_readiness readiness
    WHERE state.state_id = 1
      AND readiness.readiness_id = 1
  `);
  const row = metadata.rows?.[0] || {};
  const generationId = row.ACTIVE_GENERATION_ID || null;
  const available = row.READINESS_STATUS === 'ACTIVE'
    && row.PUBLISHED_GENERATION === generationId
    && Number(row.PUBLISHED_RETURN_EVIDENCE ?? 0)
      === Number(row.PUBLISHED_EXPECTED_RETURN_EVIDENCE ?? -1)
    && Number(row.PUBLISHED_INVALID_RETURN_EVIDENCE ?? -1) === 0
    && Number(row.VALID_INDEX_COUNT || 0) === 1;
  return {
    available,
    generationId,
    vectorIndexValid: Number(row.VALID_INDEX_COUNT || 0) === 1,
  };
}

async function retrieveReturnEvidence({
  execute,
  question,
  returnId,
  route,
  vectorReadiness,
}) {
  const routedIntents = new Set(route.intents.map((intent) => intent.id));
  const requestResult = await execute(`
    SELECT rr.return_id, rr.order_id, rr.customer_id, rr.product_id,
           rr.return_reason,
           CAST(rr.damage_description AS VARCHAR2(4000)) AS damage_description,
           rr.return_channel,
           rr.return_value, rr.risk_rating, rr.recommendation, rr.status,
           rr.policy_clause, rr.confidence_score, rr.requested_at,
           c.first_name || ' ' || c.last_name AS customer_name,
           c.customer_tier, c.lifetime_value, c.city, c.state_province,
           p.product_name, p.category,
           o.order_total, o.order_status, o.created_at AS order_created_at,
           rpc.clause_code, rpc.clause_title,
           CAST(rpc.clause_text AS VARCHAR2(4000)) AS clause_text,
           rpc.severity AS policy_severity
    FROM return_requests rr
    LEFT JOIN customers c ON c.customer_id = rr.customer_id
    LEFT JOIN products p ON p.product_id = rr.product_id
    LEFT JOIN orders o ON o.order_id = rr.order_id
    LEFT JOIN return_policy_clauses rpc ON rpc.clause_code = rr.policy_clause
    WHERE rr.return_id = :id
  `, { id: returnId });
  const request = requestResult.rows?.[0];
  if (!request) {
    const error = new Error('Return request not found in the active VPD scope');
    error.statusCode = 404;
    throw error;
  }

  const documents = ['decision', 'evidence', 'evidence_search'].some((intent) => routedIntents.has(intent))
    ? (await execute(`
        SELECT document_id, document_type, title,
               CAST(excerpt AS VARCHAR2(4000)) AS excerpt,
               similarity_score
        FROM return_documents
        WHERE return_id = :id
        ORDER BY similarity_score DESC NULLS LAST, document_id
      `, { id: returnId })).rows
    : [];
  const events = ['timeline', 'evidence_search'].some((intent) => routedIntents.has(intent))
    ? (await execute(`
        SELECT event_id, event_type,
               CAST(event_note AS VARCHAR2(4000)) AS event_note,
               actor, created_at
        FROM return_events
        WHERE return_id = :id
        ORDER BY created_at DESC, event_id DESC
      `, { id: returnId })).rows
    : [];
  const decisions = ['decision', 'timeline', 'evidence_search'].some((intent) => routedIntents.has(intent))
    ? (await execute(`
        SELECT decision_id, decision_type,
               CAST(decision_summary AS VARCHAR2(4000)) AS decision_summary,
               confidence_score, created_by, created_at
        FROM return_decisions
        WHERE return_id = :id
        ORDER BY created_at DESC, decision_id DESC
      `, { id: returnId })).rows
    : [];
  const priorReturns = routedIntents.has('customer_history')
    ? (await execute(`
        SELECT return_id, return_reason, risk_rating, recommendation,
               status, return_value, requested_at
        FROM return_requests
        WHERE customer_id = :customerId
          AND return_id <> :id
        ORDER BY requested_at DESC, return_id DESC
        FETCH FIRST 10 ROWS ONLY
      `, { customerId: request.CUSTOMER_ID, id: returnId })).rows
    : [];
  const vectorRows = vectorReadiness
    ? (await execute(`
        SELECT evidence_id, return_id, source_type, source_id, title,
               evidence_text, generation_id,
               ROUND(1 - distance_score, 6) AS similarity_score
        FROM (
          SELECT /*+ GATHER_PLAN_STATISTICS
                     VECTOR_INDEX_TRANSFORM(return_evidence_index IDX_RETURN_EVIDENCE_VEC POST_FILTER_WITHOUT_JOIN_BACK) */
                 evidence_id, return_id, source_type, source_id, title,
                 CAST(evidence_text AS VARCHAR2(4000)) AS evidence_text,
                 generation_id,
                 VECTOR_DISTANCE(
                   embedding,
                   VECTOR_EMBEDDING(
                     ALL_MINILM_L12_V2 USING :question AS DATA
                   ),
                   COSINE
                 ) AS distance_score
          FROM return_evidence_index
          WHERE return_id = :id
            AND generation_id = :generationId
          ORDER BY distance_score
          FETCH APPROXIMATE FIRST :topK ROWS ONLY
          /* RETAIL_RETURN_EVIDENCE_VECTOR_SEARCH */
        )
        ORDER BY distance_score, evidence_id
      `, {
        question,
        id: returnId,
        generationId: vectorReadiness.generationId,
        topK: 8,
      })).rows
    : [];
  if (vectorReadiness && !vectorRows.length) {
    throw vectorUnavailable(
      'No current-generation vector evidence exists for the selected return',
      'RETURN_VECTOR_SCOPE_EMPTY'
    );
  }

  return {
    request,
    policy: request.CLAUSE_CODE ? {
      CLAUSE_CODE: request.CLAUSE_CODE,
      CLAUSE_TITLE: request.CLAUSE_TITLE,
      CLAUSE_TEXT: request.CLAUSE_TEXT,
      SEVERITY: request.POLICY_SEVERITY,
    } : null,
    documents,
    events,
    decisions,
    priorReturns,
    semanticEvidence: fuseReturnEvidence(question, vectorRows),
    vectorGenerationId: vectorReadiness?.generationId || null,
  };
}

function uniqueEvidence(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.citation || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function oracleMetadata({ route, vectorReadiness, evidence, synthesis }) {
  return {
    route: '/api/returns/ask',
    execution: route.intent === 'unsupported'
      ? 'Deterministic out-of-scope routing; Oracle evidence retrieval was not invoked'
      : 'Multi-intent planning with VPD-scoped Oracle AI Vector Search and canonical relational facts',
    search: route.intent === 'unsupported'
      ? 'No retrieval for out-of-scope questions'
      : 'Hybrid ranking: 72% Oracle cosine similarity and 28% lexical evidence coverage',
    retrievalContract: route.intent === 'unsupported'
      ? 'Explicit refusal without evidence lookup'
      : 'Generation-bound RETURN_EVIDENCE_INDEX rows with structured source citations',
    vectorUsed: Boolean(vectorReadiness),
    model: vectorReadiness ? 'ALL_MINILM_L12_V2' : null,
    dimensions: vectorReadiness ? 384 : null,
    indexName: vectorReadiness ? 'IDX_RETURN_EVIDENCE_VEC' : null,
    generationId: evidence.vectorGenerationId,
    candidateCount: evidence.semanticEvidence.length,
    synthesisUsed: synthesis.used,
    synthesisMode: synthesis.mode,
    synthesisModel: synthesis.used ? synthesis.model : null,
    synthesisReason: synthesis.reason || null,
    features: route.intent === 'unsupported'
      ? ['Multi-intent routing', 'Explicit refusal']
      : ['Oracle AI Vector Search', 'VECTOR_EMBEDDING', 'VECTOR_DISTANCE', 'VPD', 'Hybrid ranking'],
  };
}

async function orchestrateReturnAsk({
  question,
  returnId,
  username = null,
  execute = null,
  route: suppliedRoute = null,
  generationId: expectedGenerationId = null,
  synthesize = true,
} = {}) {
  const effectiveQuestion = String(question || '').trim();
  const scopedReturnId = Number(returnId);
  const route = suppliedRoute || routeReturnQuestion(effectiveQuestion);
  const readinessExecute = execute || getDatabase().executeSystem;
  const vectorReadiness = route.intent === 'unsupported'
    ? null
    : await readReturnEvidenceGlobalReadiness(readinessExecute);
  if (vectorReadiness && (!vectorReadiness.available
      || (expectedGenerationId && vectorReadiness.generationId !== expectedGenerationId))) {
    throw vectorUnavailable('Oracle return evidence vector retrieval is unavailable');
  }

  const retrieve = (scopedExecute) => retrieveReturnEvidence({
    execute: scopedExecute,
    question: effectiveQuestion,
    returnId: scopedReturnId,
    route,
    vectorReadiness,
  });
  const evidence = execute
    ? await retrieve(execute)
    : await getDatabase().withUserConnection(username, ({ execute: scopedExecute }) => retrieve(scopedExecute));
  const result = buildReturnQuestionAnswer({
    question: effectiveQuestion,
    route,
    ...evidence,
  });
  const synthesis = await synthesizeReturnAnswer({
    question: effectiveQuestion,
    returnId: scopedReturnId,
    route,
    result,
  }, { enabled: synthesize });
  const finalAnswer = synthesis.used ? synthesis.answer : result.answer;
  const finalSummary = synthesis.used ? synthesis.answer : result.summary;
  const answerPayload = {
    status: result.status,
    summary: finalSummary,
    answer: finalAnswer,
    sections: result.sections,
    sources: result.sources,
    citations: result.citations,
    matchedEvidence: result.matchedEvidence,
    synthesis,
    oracle: oracleMetadata({ route, vectorReadiness, evidence, synthesis }),
  };
  const routeMetadata = {
    intent: route.intent,
    intents: route.intents.map((intent) => intent.id),
    intentDetails: route.intents,
    routeLabel: route.label,
    confidence: route.confidence,
    entities: [
      `RET-${String(scopedReturnId).padStart(4, '0')}`,
      evidence.request.PRODUCT_NAME,
      evidence.request.CUSTOMER_NAME,
      evidence.request.POLICY_CLAUSE,
    ].filter(Boolean),
  };
  const evidenceMetadata = uniqueEvidence([
    ...result.matchedEvidence,
    ...evidence.semanticEvidence,
  ]);
  return { answerPayload, routeMetadata, evidenceMetadata };
}

async function orchestrateReturnInvestigationTurn(context = {}) {
  return orchestrateReturnAsk({
    execute: context.execute,
    question: context.resolvedQuestion || context.question,
    returnId: context.investigation?.returnId,
    username: context.username,
    route: context.route,
    generationId: context.generationId,
    synthesize: true,
  });
}

function isReturnVectorUnavailable(error) {
  return error?.code === 'RETURN_VECTOR_UNAVAILABLE'
    || error?.code === 'RETURN_VECTOR_SCOPE_EMPTY'
    || /ORA-40284|ORA-519|vector.*index|model does not exist/i.test(String(error?.message || ''));
}

module.exports = {
  isReturnVectorUnavailable,
  orchestrateReturnAsk,
  orchestrateReturnInvestigationTurn,
  readReturnEvidenceGlobalReadiness,
};
