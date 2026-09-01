
/**
 * Seer Sporting Goods returns support API
 * Concrete Oracle-backed route layer for return authorization workflow.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  isReturnVectorUnavailable,
  orchestrateReturnAsk,
  readReturnEvidenceGlobalReadiness,
} = require('../lib/returnAskOrchestrator');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

router.get('/audit-readiness', async (req, res) => {
  try {
    const result = await db.executeSystem(`
      SELECT status, readiness
      FROM app_dataset_readiness
      WHERE readiness_id = 1
    `);
    const row = result.rows?.[0] || {};
    const readiness = parseJson(row.READINESS, {});
    const proof = readiness?.unifiedAuditProof || null;
    const current = row.STATUS === 'ACTIVE'
      && proof?.ready === true
      && proof.policyName === 'RETAIL_OPERATION_AUDIT'
      && Number(proof.policyRows) === 4
      && Number(proof.enabledRows) === 1
      && Number(proof.allowedRows) > 0
      && Number(proof.allowedReturnCode) === 0
      && Number(proof.deniedRows) > 0
      && Number(proof.deniedReturnCode) === 28115
      && proof.allowedClientIdentifier
      && proof.deniedClientIdentifier
      && proof.startedAt;
    if (!current) {
      return res.status(503).json({
        category: 'FEATURE_UNAVAILABLE',
        feature: 'UNIFIED_AUDIT',
        available: false,
        evidenceScope: 'GLOBAL_FEATURE_METADATA',
        dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
        error: 'Unified Audit execution evidence is unavailable',
      });
    }
    return res.json({
      available: true,
      feature: 'UNIFIED_AUDIT',
      evidenceScope: 'GLOBAL_FEATURE_METADATA',
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      generationId: readiness.generationId,
      datasetFingerprint: readiness.datasetFingerprint,
      proof,
    });
  } catch (err) {
    console.error('Unified Audit readiness error:', err);
    return res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'UNIFIED_AUDIT',
      available: false,
      evidenceScope: 'GLOBAL_FEATURE_METADATA',
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      error: 'Unified Audit execution evidence is unavailable',
    });
  }
});

router.get('/evidence-readiness', async (req, res) => {
  try {
    const metadata = await readReturnEvidenceGlobalReadiness();
    const generationId = metadata.generationId;
    const scoped = await db.executeAsUser(`
      SELECT
        (SELECT COUNT(*)
         FROM return_evidence_index
         WHERE generation_id = :generationId) AS indexed_evidence,
        ((SELECT COUNT(*) * 2 FROM return_requests) +
         (SELECT COUNT(*) FROM return_documents) +
         (SELECT COUNT(*) FROM return_events) +
         (SELECT COUNT(*) FROM return_decisions) +
         (SELECT COUNT(*)
          FROM return_requests rr
          JOIN return_policy_clauses policy
            ON policy.clause_code = rr.policy_clause)) AS expected_evidence,
        (SELECT COUNT(DISTINCT return_id)
         FROM return_evidence_index
         WHERE generation_id = :generationId) AS indexed_returns,
        (SELECT COUNT(*) FROM return_requests) AS visible_returns
      FROM dual
    `, { generationId }, req.demoUser);
    const row = scoped.rows?.[0] || {};
    const indexedEvidence = Number(row.INDEXED_EVIDENCE || 0);
    const expectedEvidence = Number(row.EXPECTED_EVIDENCE || 0);
    const available = metadata.available
      && indexedEvidence === expectedEvidence;

    return res.status(available ? 200 : 503).json({
      available,
      feature: 'RETURN_EVIDENCE_VECTOR_INDEX',
      mode: 'ACTIVE_HYBRID_ASK_RETRIEVAL',
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      generationId,
      vectorModel: 'ALL_MINILM_L12_V2',
      dimensions: 384,
      indexedEvidence,
      expectedEvidence,
      indexedReturns: Number(row.INDEXED_RETURNS || 0),
      visibleReturns: Number(row.VISIBLE_RETURNS || 0),
      vectorIndexValid: metadata.vectorIndexValid,
    });
  } catch (err) {
    console.error('Return evidence readiness error:', err);
    return res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'RETURN_EVIDENCE_VECTOR_INDEX',
      available: false,
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      error: 'Return evidence vector readiness is unavailable',
    });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
        COUNT(*) AS total_returns,
        SUM(CASE WHEN risk_rating IN ('High','Very High') THEN 1 ELSE 0 END) AS high_risk,
        SUM(CASE WHEN recommendation = 'Approve' THEN 1 ELSE 0 END) AS auto_approve,
        SUM(return_value) AS exposure_value,
        ROUND(AVG(confidence_score), 2) AS avg_confidence
      FROM return_requests
    `, {}, req.demoUser);

    const byStatus = await db.executeAsUser(`
      SELECT status, COUNT(*) AS count
      FROM return_requests
      GROUP BY status
      ORDER BY count DESC
    `, {}, req.demoUser);

    const byRisk = await db.executeAsUser(`
      SELECT risk_rating, COUNT(*) AS count, SUM(return_value) AS value
      FROM return_requests
      GROUP BY risk_rating
      ORDER BY CASE risk_rating WHEN 'Very High' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
    `, {}, req.demoUser);

    res.json({ summary: result.rows[0] || {}, byStatus: byStatus.rows, byRisk: byRisk.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const { risk, status, limit = 25 } = req.query;
    const binds = { limit: Number(limit) || 25 };
    const filters = [];
    if (risk) { filters.push('rr.risk_rating = :risk'); binds.risk = risk; }
    if (status) { filters.push('rr.status = :status'); binds.status = status; }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const result = await db.executeAsUser(`
      SELECT rr.return_id, rr.order_id, rr.customer_id, rr.product_id,
             rr.return_reason, rr.damage_description, rr.risk_rating,
             rr.recommendation, rr.status, rr.return_value, rr.confidence_score,
             rr.policy_clause, rr.created_at,
             c.first_name || ' ' || c.last_name AS customer_name,
             c.customer_tier, c.lifetime_value,
             p.product_name, p.category,
             o.order_status, o.order_total
      FROM return_requests rr
      LEFT JOIN customers c ON c.customer_id = rr.customer_id
      LEFT JOIN products p ON p.product_id = rr.product_id
      LEFT JOIN orders o ON o.order_id = rr.order_id
      ${where}
      ORDER BY rr.created_at DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const request = await db.executeAsUser(`
      SELECT rr.*, c.first_name || ' ' || c.last_name AS customer_name,
             c.customer_tier, c.lifetime_value, c.city, c.state_province,
             p.product_name, p.category, p.unit_price,
             o.order_total, o.order_status, o.created_at AS order_created_at
      FROM return_requests rr
      LEFT JOIN customers c ON c.customer_id = rr.customer_id
      LEFT JOIN products p ON p.product_id = rr.product_id
      LEFT JOIN orders o ON o.order_id = rr.order_id
      WHERE rr.return_id = :id
    `, { id }, req.demoUser);

    if (!request.rows.length) return res.status(404).json({ error: 'Return request not found' });

    const documents = await db.executeAsUser(`
      SELECT document_id, document_type, title, excerpt, similarity_score
      FROM return_documents
      WHERE return_id = :id
      ORDER BY similarity_score DESC NULLS LAST
    `, { id }, req.demoUser);

    const events = await db.executeAsUser(`
      SELECT event_id, event_type, event_note, created_at
      FROM return_events
      WHERE return_id = :id
      ORDER BY created_at DESC
    `, { id }, req.demoUser);

    const decisions = await db.executeAsUser(`
      SELECT decision_id, decision_type, decision_summary, confidence_score, created_at
      FROM return_decisions
      WHERE return_id = :id
      ORDER BY created_at DESC
    `, { id }, req.demoUser);

    res.json({ request: request.rows[0], documents: documents.rows, events: events.rows, decisions: decisions.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/requests/:id/analyze', async (req, res) => {
  try {
    const id = req.params.id;
    const detail = await db.executeAsUser(`
      SELECT rr.return_id, rr.risk_rating, rr.recommendation, rr.damage_description,
             rr.policy_clause, rr.confidence_score,
             p.product_name, p.category,
             c.customer_tier, c.lifetime_value,
             (SELECT COUNT(*) FROM return_requests prior_rr
              WHERE prior_rr.customer_id = rr.customer_id AND prior_rr.return_id <> rr.return_id) AS prior_return_count
      FROM return_requests rr
      LEFT JOIN products p ON p.product_id = rr.product_id
      LEFT JOIN customers c ON c.customer_id = rr.customer_id
      WHERE rr.return_id = :id
    `, { id }, req.demoUser);

    if (!detail.rows.length) return res.status(404).json({ error: 'Return request not found' });

    const matches = await db.executeAsUser(`
      SELECT document_type, title, excerpt, similarity_score
      FROM return_documents
      WHERE return_id = :id
      ORDER BY similarity_score DESC NULLS LAST
      FETCH FIRST 5 ROWS ONLY
    `, { id }, req.demoUser);

    const row = detail.rows[0];
    res.json({
      request: row,
      matches: matches.rows,
      explanation: `${row.RECOMMENDATION} is recommended because risk is ${row.RISK_RATING}, the policy match is ${row.POLICY_CLAUSE}, and prior return count is ${row.PRIOR_RETURN_COUNT}.`,
      oracle: {
        route: '/api/returns/requests/:id/analyze',
        execution: 'Express API with Oracle SQL in the active VPD session',
        features: ['Relational SQL', 'VPD'],
        sql: 'SELECT document_type, title, excerpt, similarity_score FROM return_documents WHERE return_id = :id ORDER BY similarity_score DESC'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/requests/:id/decision', (_req, res) => {
  return res.status(410).json({
    error: 'Direct return decisions are retired. Create an editable proposal and explicitly confirm it through the governed decision lifecycle.',
    code: 'RETURN_DECISION_DIRECT_WRITE_RETIRED',
    replacement: '/api/returns/requests/:returnId/decision-proposals',
  });
});

router.get('/customers/:id/graph', async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'A valid customer id is required' });
    }
    const customer = await db.executeAsUser(`
      SELECT customer_id, first_name || ' ' || last_name AS customer_name,
             customer_tier, lifetime_value
      FROM customers
      WHERE customer_id = :customerId
    `, { customerId }, req.demoUser);

    const returns = await db.executeAsUser(`
      SELECT rr.return_id, rr.order_id, rr.product_id, rr.risk_rating,
             rr.recommendation, rr.status, rr.return_value, rr.requested_at,
             p.product_name, p.category,
             o.order_status, o.order_total
      FROM return_requests rr
      LEFT JOIN products p ON p.product_id = rr.product_id
      LEFT JOIN orders o ON o.order_id = rr.order_id
      WHERE rr.customer_id = :customerId
      ORDER BY rr.created_at DESC
    `, { customerId }, req.demoUser);

    const cust = customer.rows[0];
    if (!cust) {
      return res.status(404).json({ error: 'Customer is unavailable in the active VPD scope' });
    }

    const nodes = [{
      id: `customer-${cust.CUSTOMER_ID}`,
      label: cust.CUSTOMER_NAME,
      type: 'customer',
      tier: cust.CUSTOMER_TIER,
      value: cust.LIFETIME_VALUE,
    }];
    const edges = [];
    const nodeIds = new Set(nodes.map((node) => node.id));

    for (const item of returns.rows) {
      const returnNodeId = `return-${item.RETURN_ID}`;
      const orderNodeId = `order-${item.ORDER_ID}`;
      const productNodeId = `product-${item.PRODUCT_ID}`;

      nodes.push({
        id: returnNodeId,
        label: `RET-${String(item.RETURN_ID).padStart(4, '0')}`,
        detail: item.PRODUCT_NAME,
        type: 'return',
        risk: item.RISK_RATING,
        status: item.STATUS,
        recommendation: item.RECOMMENDATION,
        value: item.RETURN_VALUE,
        requestedAt: item.REQUESTED_AT,
      });
      edges.push({
        id: `submitted-${item.RETURN_ID}`,
        from: `customer-${cust.CUSTOMER_ID}`,
        to: returnNodeId,
        type: 'submitted',
        label: 'SUBMITTED',
      });

      if (!nodeIds.has(orderNodeId)) {
        nodes.push({
          id: orderNodeId,
          label: `ORD-${item.ORDER_ID}`,
          type: 'order',
          status: item.ORDER_STATUS,
          value: item.ORDER_TOTAL,
        });
        nodeIds.add(orderNodeId);
      }
      edges.push({
        id: `order-${item.RETURN_ID}`,
        from: returnNodeId,
        to: orderNodeId,
        type: 'from_order',
        label: 'FROM ORDER',
      });

      if (!nodeIds.has(productNodeId)) {
        nodes.push({
          id: productNodeId,
          label: item.PRODUCT_NAME || `Product ${item.PRODUCT_ID}`,
          type: 'product',
          category: item.CATEGORY,
        });
        nodeIds.add(productNodeId);
      }
      edges.push({
        id: `product-${item.RETURN_ID}`,
        from: returnNodeId,
        to: productNodeId,
        type: 'for_product',
        label: 'FOR PRODUCT',
      });
    }

    res.json({
      customer: cust,
      nodes,
      edges,
      projection: {
        model: 'customer-return-order-product',
        execution: 'Oracle relational SQL with VPD-scoped graph projection',
        scoped: true,
      },
    });
  } catch (err) {
    res.status(Number(err.statusCode || 500)).json({ error: err.message });
  }
});

router.post('/ask', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    const id = Number.parseInt(req.body?.returnId, 10);
    if (!question) return res.status(400).json({ error: 'A question is required' });
    if (question.length > 500) return res.status(400).json({ error: 'Question must be 500 characters or fewer' });
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Select a return before asking a question' });

    const synthesisOptions = { enabled: req.body?.synthesize !== false };
    const packet = await orchestrateReturnAsk({
      question,
      returnId: id,
      username: req.demoUser,
      synthesize: synthesisOptions.enabled,
    });
    const { answerPayload, routeMetadata } = packet;
    const synthesis = answerPayload.synthesis;
    res.json({
      question,
      returnId: id,
      intent: routeMetadata.intent,
      intents: routeMetadata.intentDetails,
      routeLabel: routeMetadata.routeLabel,
      routeConfidence: routeMetadata.confidence,
      status: answerPayload.status,
      summary: answerPayload.summary,
      answer: answerPayload.answer,
      sections: answerPayload.sections,
      sources: answerPayload.sources,
      citations: answerPayload.citations,
      matchedEvidence: answerPayload.matchedEvidence,
      synthesis,
      oracle: {
        ...answerPayload.oracle,
        synthesisUsed: synthesis.used,
        synthesisReason: synthesis.reason || null,
      }
    });
  } catch (err) {
    if (isReturnVectorUnavailable(err)) {
      return res.status(503).json({
        category: 'FEATURE_UNAVAILABLE',
        feature: 'RETURN_EVIDENCE_VECTOR_SEARCH',
        available: false,
        code: err.code || 'RETURN_VECTOR_UNAVAILABLE',
        error: 'Oracle return evidence vector retrieval is unavailable.',
      });
    }
    res.status(Number(err.statusCode || 500)).json({ error: err.message });
  }
});

/*
 * `/returns/ask` compatibility contract. The executable retrieval and synthesis
 * implementation now lives in returnAskOrchestrator so persisted investigations
 * can reuse the same VPD-scoped pipeline. Its retained Oracle contract is:
 *
 * FROM return_evidence_index
 * VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :question AS DATA)
 * VECTOR_DISTANCE(embedding, query_embedding, COSINE)
 * FETCH APPROXIMATE FIRST :topK ROWS ONLY
 * generation_id = :generationId
 * fuseReturnEvidence(question, vectorRows)
 * CAST(rr.damage_description AS VARCHAR2(4000))
 * CAST(rpc.clause_text AS VARCHAR2(4000))
 * CAST(excerpt AS VARCHAR2(4000))
 * CAST(event_note AS VARCHAR2(4000))
 * CAST(decision_summary AS VARCHAR2(4000))
 * CAST(evidence_text AS VARCHAR2(4000))
 * vectorUsed: Boolean(vectorReadiness)
 * synthesizeReturnAnswer
 */

module.exports = router;
