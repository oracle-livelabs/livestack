const db = require('../config/database');

async function scalar(connection, sql, binds = {}) { const result = await connection.execute(sql, binds, { autoCommit: false }); return Number(Object.values(result.rows?.[0] || {})[0] || 0); }
async function safe(check) { try { return await check(); } catch (error) { return { ready: false, error: String(error.message || error) }; } }

async function collectFeatureEvidence(connection = null) {
  let owned = false;
  try {
    if (!connection) { connection = await db.getConnection(); owned = true; }
    const state = await connection.execute(`SELECT active_generation FROM app_dataset_state WHERE state_id=1`, {}, { autoCommit: false });
    const activeGeneration = state.rows?.[0]?.ACTIVE_GENERATION || null;
    const vector = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM user_mining_models WHERE model_name='ALL_MINILM_L12_V2'`)) === 1 && (await scalar(connection, 'SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL')) > 0 && (await scalar(connection, 'SELECT COUNT(*) FROM post_embeddings WHERE embedding IS NOT NULL')) > 0 }));
    const spatial = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM user_indexes WHERE index_name IN ('IDX_CUST_SPATIAL','IDX_FC_SPATIAL')`)) >= 2 && (await scalar(connection, 'SELECT COUNT(*) FROM fulfillment_centers WHERE location IS NOT NULL')) > 0 }));
    const graph = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM user_property_graphs WHERE graph_name IN ('INFLUENCER_NETWORK','TELECOM_EXPERIENCE_NETWORK')`)) === 2 }));
    const nativeJson = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM product_attributes WHERE JSON_VALUE(attributes,'$.serviceId' RETURNING NUMBER) IS NOT NULL`)) > 0 }));
    const duality = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM user_json_duality_views WHERE view_name IN ('ORDERS_DV','PRODUCTS_INVENTORY_DV')`)) === 2 }));
    const oml = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM user_mining_models WHERE algorithm <> 'ONNX'`)) >= 4 }));
    const unifiedAudit = await safe(async () => ({ ready: (await scalar(connection, `SELECT COUNT(*) FROM audit_unified_enabled_policies WHERE policy_name='SC_ORDER_AUDIT'`)) === 1 }));
    const inmemory = await safe(async () => { const declared = await scalar(connection, `SELECT COUNT(*) FROM user_tables WHERE inmemory='ENABLED'`); try { const populated = await scalar(connection, `SELECT COUNT(*) FROM v$im_segments WHERE populate_status='COMPLETED'`); return { available: true, declaredTables: declared, populatedSegments: populated, ready: declared > 0 && populated > 0 }; } catch (_) { return { available: false, declaredTables: declared, populatedSegments: null, ready: false, reason: 'V$IM_SEGMENTS is unavailable to the app schema' }; } });
    return { activeGeneration, collectedAt: new Date().toISOString(), vector, spatial, graph, nativeJson, duality, oml, unifiedAudit, inmemory };
  } finally { if (owned && connection) try { await connection.close(); } catch (_) {} }
}

function assertRequiredFeatureEvidence(evidence) {
  for (const key of ['vector', 'spatial', 'graph', 'nativeJson', 'duality', 'oml', 'unifiedAudit']) if (!evidence?.[key]?.ready) throw new Error(`Required Telco feature evidence is not ready: ${key}.`);
  return evidence;
}
module.exports = { collectFeatureEvidence, assertRequiredFeatureEvidence };
