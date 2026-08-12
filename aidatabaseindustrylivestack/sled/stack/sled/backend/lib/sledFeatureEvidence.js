const db = require('../config/database');

const FEATURE_IDS = Object.freeze(['vector', 'spatial', 'graph', 'nativeJson', 'duality', 'oml', 'unifiedAudit', 'inMemory']);
const queries = Object.freeze({
  vector: `SELECT (SELECT COUNT(*) FROM user_mining_models WHERE model_name='ALL_MINILM_L12_V2') AS model_count, (SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL) + (SELECT COUNT(*) FROM post_embeddings WHERE embedding IS NOT NULL) AS artifact_count FROM dual`,
  spatial: `SELECT (SELECT COUNT(*) FROM user_sdo_geom_metadata WHERE table_name IN ('CUSTOMERS','FULFILLMENT_CENTERS')) AS metadata_count, (SELECT COUNT(*) FROM user_indexes WHERE index_name IN ('IDX_FC_SPATIAL','IDX_CUST_SPATIAL')) AS index_count FROM dual`,
  graph: `SELECT COUNT(*) AS graph_count FROM user_property_graphs WHERE graph_name = 'INFLUENCER_NETWORK'`,
  nativeJson: `SELECT COUNT(*) AS json_column_count FROM user_tab_columns WHERE data_type = 'JSON'`,
  duality: `SELECT COUNT(*) AS duality_count FROM user_json_duality_views WHERE view_name IN ('ORDERS_DV','PRODUCTS_INVENTORY_DV')`,
  oml: `SELECT (SELECT COUNT(*) FROM user_mining_models WHERE model_name IN ('DEMAND_SURGE_MODEL','CUSTOMER_SEGMENT_MODEL','REVENUE_PREDICT_MODEL','PRODUCT_CLUSTER_MODEL')) AS model_count, (SELECT COUNT(*) FROM oml_model_runs WHERE status = 'completed') AS completed_run_count FROM dual`,
  unifiedAudit: `SELECT COUNT(*) AS audit_count FROM unified_audit_trail WHERE event_timestamp >= SYSTIMESTAMP - INTERVAL '1' DAY`,
  inMemory: `SELECT (SELECT COUNT(*) FROM user_tables WHERE inmemory = 'ENABLED') AS declared_segment_count, (SELECT COUNT(*) FROM v$im_segments WHERE inmemory_size > 0) AS resident_segment_count FROM dual`,
});

function evidenceRow(feature, row) {
  if (feature === 'inMemory') {
    return { feature, status: Number(row?.RESIDENT_SEGMENT_COUNT || 0) > 0 ? 'proven' : 'unavailable', evidence: row || {}, checkedAt: new Date().toISOString() };
  }
  const numeric = Object.values(row || {}).some((value) => Number(value) > 0);
  return { feature, status: numeric ? 'proven' : 'unavailable', evidence: row || {}, checkedAt: new Date().toISOString() };
}

async function captureGenerationFeatureEvidence({ actor, generationId }) {
  if (!actor || !generationId) throw new Error('Feature evidence requires the trusted SLED actor and generation.');
  return db.withUserConnection(actor, async ({ connection }) => {
    const features = {};
    for (const feature of FEATURE_IDS) {
      try {
        const result = await connection.execute(queries[feature]);
        features[feature] = evidenceRow(feature, result.rows?.[0]);
      } catch (error) {
        // Unified Audit and In-Memory can legitimately be unavailable on Free;
        // report their exact non-claim rather than substituting declarative DDL.
        features[feature] = { feature, status: 'unavailable', evidence: {}, reason: String(error.message || error).slice(0, 300), checkedAt: new Date().toISOString() };
      }
    }
    await connection.execute(`UPDATE app_dataset_generations SET feature_evidence_json=:evidence, required_features_json=:required, updated_at=SYSTIMESTAMP WHERE generation_id=:generationId`, { generationId, evidence: JSON.stringify(features), required: JSON.stringify(FEATURE_IDS) });
    await connection.commit();
    return { generationId, features };
  });
}

async function getActiveGenerationFeatureEvidence({ actor }) {
  return db.withUserConnection(actor, async ({ connection }) => {
    const result = await connection.execute(`SELECT g.generation_id, g.feature_evidence_json FROM app_dataset_state s JOIN app_dataset_generations g ON g.generation_id=s.active_generation WHERE s.state_id=1`);
    const row = result.rows?.[0];
    if (!row) return { generationId: null, features: Object.fromEntries(FEATURE_IDS.map((feature) => [feature, { feature, status: 'unavailable', reason: 'No active dataset generation has recorded feature evidence.' }])) };
    let features = {}; try { features = JSON.parse(row.FEATURE_EVIDENCE_JSON || '{}'); } catch (_) { features = {}; }
    for (const feature of FEATURE_IDS) features[feature] ||= { feature, status: 'unavailable', reason: 'No generation-bound evidence was recorded.' };
    return { generationId: row.GENERATION_ID, features };
  });
}

module.exports = { FEATURE_IDS, captureGenerationFeatureEvidence, getActiveGenerationFeatureEvidence };
