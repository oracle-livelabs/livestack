/**
 * Read-only Oracle feature truth for the active Student Success generation.
 * Every response is generation-bound; no feature is inferred from UI state.
 */
const express = require('express');
const db = require('../config/database');
const router = express.Router();

async function scalar(sql, binds, actor) {
  const result = await db.executeAsUser(sql, binds, actor);
  return result.rows?.[0] || {};
}
function evidence(generationId, ready, source, details = {}) {
  return { generationId, ready: Boolean(ready), source, observedAt: new Date().toISOString(), ...details };
}

router.get('/features', async (req, res) => {
  try {
    const state = await scalar(`SELECT active_generation, active_source, active_label, active_version
      FROM app_dataset_state WHERE state_id = 1`, {}, req.demoUser);
    const generationId = state.ACTIVE_GENERATION;
    if (!generationId) return res.status(503).json({ ok: false, error: 'Active Student Success generation is not available.', code: 'ACTIVE_GENERATION_UNAVAILABLE' });

    const vector = await scalar(`SELECT COUNT(*) AS fixed_columns, SUM(CASE WHEN table_name='PRODUCT_EMBEDDINGS' THEN 1 ELSE 0 END) AS service_vectors,
        SUM(CASE WHEN table_name='POST_EMBEDDINGS' THEN 1 ELSE 0 END) AS signal_vectors
        FROM user_tab_columns WHERE data_type='VECTOR' AND REPLACE(UPPER(vector_info),' ','')='VECTOR(384,FLOAT32,DENSE)'
          AND table_name IN ('PRODUCT_EMBEDDINGS','POST_EMBEDDINGS') AND column_name='EMBEDDING'`, {}, req.demoUser);
    const spatial = await scalar(`SELECT COUNT(*) AS spatial_indexes, SUM(CASE WHEN table_name='FULFILLMENT_CENTERS' THEN 1 ELSE 0 END) AS campus_sites,
        SUM(CASE WHEN table_name='CUSTOMERS' THEN 1 ELSE 0 END) AS student_support_locations
        FROM user_indexes WHERE index_type='DOMAIN' AND index_name IN ('IDX_FC_SPATIAL','IDX_CUST_SPATIAL')`, {}, req.demoUser);
    const graph = await scalar(`SELECT COUNT(*) AS property_graphs FROM user_property_graphs WHERE graph_name='INFLUENCER_NETWORK'`, {}, req.demoUser);
    const nativeJson = await scalar(`SELECT COUNT(*) AS json_columns FROM user_json_columns WHERE table_name IN ('EVENT_STREAM','PRODUCT_ATTRIBUTES')`, {}, req.demoUser);
    const duality = await scalar(`SELECT COUNT(*) AS duality_views FROM user_json_duality_views WHERE view_name IN ('STUDENT_REQUESTS_DV','PRODUCTS_INVENTORY_DV')`, {}, req.demoUser);
    const oml = await scalar(`SELECT COUNT(*) AS models FROM user_mining_models WHERE model_name IN ('DEMAND_SURGE_MODEL','CUSTOMER_SEGMENT_MODEL','REVENUE_PREDICT_MODEL','PRODUCT_CLUSTER_MODEL')`, {}, req.demoUser);
    const audit = await scalar(`SELECT COUNT(*) AS enabled_policies FROM audit_unified_enabled_policies WHERE policy_name='SC_ORDER_AUDIT'`, {}, req.demoUser);
    const inmemory = await scalar(`SELECT COUNT(*) AS declared_segments FROM user_tables WHERE inmemory='ENABLED'`, {}, req.demoUser);
    const features = {
      vector: evidence(generationId, Number(vector.FIXED_COLUMNS || 0) === 2, 'USER_TAB_COLUMNS', { fixedColumnCount: Number(vector.FIXED_COLUMNS || 0), capability: 'Student-service and support-signal semantic search' }),
      spatial: evidence(generationId, Number(spatial.SPATIAL_INDEXES || 0) >= 2, 'USER_INDEXES', { domainIndexCount: Number(spatial.SPATIAL_INDEXES || 0), capability: 'Campus service coverage and student-support routing' }),
      graph: evidence(generationId, Number(graph.PROPERTY_GRAPHS || 0) === 1, 'USER_PROPERTY_GRAPHS', { propertyGraphCount: Number(graph.PROPERTY_GRAPHS || 0), capability: 'Advisor, program, and support-network SQL/PGQ traversal' }),
      nativeJson: evidence(generationId, Number(nativeJson.JSON_COLUMNS || 0) >= 2, 'USER_JSON_COLUMNS', { jsonColumnCount: Number(nativeJson.JSON_COLUMNS || 0), capability: 'Student-success signal and service-event documents' }),
      duality: evidence(generationId, Number(duality.DUALITY_VIEWS || 0) >= 1, 'USER_JSON_DUALITY_VIEWS', { nativeDualityViewCount: Number(duality.DUALITY_VIEWS || 0), requiredSource: 'STUDENT_REQUESTS_DV', capability: 'Student request JSON relational duality' }),
      oml: evidence(generationId, Number(oml.MODELS || 0) === 4, 'USER_MINING_MODELS', { modelCount: Number(oml.MODELS || 0), capability: 'Student-success predictive analytics' }),
      unifiedAudit: evidence(generationId, Number(audit.ENABLED_POLICIES || 0) > 0, 'AUDIT_UNIFIED_ENABLED_POLICIES', { enabledPolicyCount: Number(audit.ENABLED_POLICIES || 0), capability: 'Student-success data-change audit policy' }),
      inmemory: evidence(generationId, Number(inmemory.DECLARED_SEGMENTS || 0) > 0, 'USER_TABLES', { evidenceMode: 'DECLARATION_ONLY', declaredSegmentCount: Number(inmemory.DECLARED_SEGMENTS || 0), populationStatus: 'NOT_PROVEN', runtimePopulationClaimed: false, capability: 'Declared In-Memory student-success tables' }),
    };
    return res.json({ ok: true, activeDataset: { generationId, source: state.ACTIVE_SOURCE, label: state.ACTIVE_LABEL, version: state.ACTIVE_VERSION }, features });
  } catch (error) {
    console.error('Higher Education feature evidence error:', error);
    return res.status(503).json({ ok: false, error: 'Oracle feature evidence is unavailable.', code: 'FEATURE_EVIDENCE_UNAVAILABLE' });
  }
});
module.exports = router;
