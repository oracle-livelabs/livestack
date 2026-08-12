/**
 * Demo evidence API.
 *
 * All mounted GET routes are read-only. Dataset replacement and canonical
 * demo restoration are owned by the governed POST /api/import lifecycle.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// These feature-readiness routes are intentionally read-only. They make a
// capability unavailable rather than fabricating fallback evidence.
router.get('/native-json-readiness', async (req, res) => {
  try {
    const columns = await db.executeAsUser(`SELECT table_name, column_name, data_type
      FROM user_tab_columns WHERE data_type = 'JSON' AND table_name IN ('PRODUCT_ATTRIBUTES', 'EVENT_STREAM')
      ORDER BY table_name`, {}, req.demoUser);
    const ready = columns.rows.length >= 2;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ACTIVE' : 'NOT_READY',
      ready,
      source: 'ORACLE_NATIVE_JSON',
      metadataSource: 'USER_TAB_COLUMNS',
      nativeColumns: columns.rows,
      operators: ['JSON_VALUE', 'JSON_QUERY', 'JSON_SERIALIZE'],
    });
  } catch (err) {
    res.status(503).json({ status: 'UNAVAILABLE', ready: false, source: 'ORACLE_NATIVE_JSON',
      error: err.message,
    });
  }
});

router.get('/unified-audit-readiness', async (req, res) => {
  try {
    const policy = await db.executeAsUser(`SELECT policy_name, enabled_option, entity_name
      FROM audit_unified_enabled_policies WHERE policy_name = 'SC_ORDER_AUDIT'`, {}, req.demoUser);
    const enabled = policy.rows.length > 0;
    res.status(enabled ? 200 : 503).json({
      status: enabled ? 'READY' : 'NOT_ENABLED',
      ready: enabled,
      source: 'AUDIT_UNIFIED_ENABLED_POLICIES',
      policy: {
        name: 'SC_ORDER_AUDIT',
        installed: true,
        enabled,
        evidenceStatus: enabled ? 'READY' : 'NOT_ENABLED',
      },
      auditCatalogAccess: 'deployment-evidence-only',
      broadAuditTrailGrant: false,
    });
  } catch (err) {
    res.status(503).json({ status: 'UNAVAILABLE', ready: false, source: 'AUDIT_UNIFIED_ENABLED_POLICIES',
      auditCatalogAccess: 'deployment-evidence-only',
      broadAuditTrailGrant: false,
      error: err.message,
    });
  }
});

router.get('/status', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
        (SELECT COUNT(*) FROM brands)                  AS brands,
        (SELECT COUNT(*) FROM products)                AS products,
        (SELECT COUNT(*) FROM influencers)             AS influencers,
        (SELECT COUNT(*) FROM customers)               AS customers,
        (SELECT COUNT(*) FROM social_posts)            AS social_posts,
        (SELECT COUNT(*) FROM orders)                  AS orders,
        (SELECT COUNT(*) FROM fulfillment_centers)     AS fulfillment_centers,
        (SELECT COUNT(*) FROM fulfillment_zones)       AS fulfillment_zones,
        (SELECT COUNT(*) FROM demand_regions)          AS demand_regions,
        (SELECT COUNT(*) FROM demand_forecasts)        AS demand_forecasts,
        (SELECT COUNT(*) FROM product_embeddings)      AS product_embeddings,
        (SELECT COUNT(*) FROM post_embeddings)         AS post_embeddings,
        (SELECT COUNT(*) FROM semantic_matches)        AS semantic_matches,
        (SELECT COUNT(*) FROM utility_graph_entities)     AS utility_graph_entities,
        (SELECT COUNT(*) FROM utility_graph_relationships) AS utility_graph_relationships,
        (SELECT COUNT(*) FROM restoration_cases)      AS restoration_cases,
        (SELECT COUNT(*) FROM influencer_connections) AS graph_edges,
        (SELECT COUNT(*) FROM brand_influencer_links) AS graph_links
      FROM dual
    `, {}, req.demoUser);

    const row = result.rows[0];
    res.json({
      brands: row.BRANDS,
      products: row.PRODUCTS,
      influencers: row.INFLUENCERS,
      customers: row.CUSTOMERS,
      social_posts: row.SOCIAL_POSTS,
      orders: row.ORDERS,
      fulfillment_centers: row.FULFILLMENT_CENTERS,
      fulfillment_zones: row.FULFILLMENT_ZONES,
      demand_regions: row.DEMAND_REGIONS,
      demand_forecasts: row.DEMAND_FORECASTS,
      product_embeddings: row.PRODUCT_EMBEDDINGS,
      post_embeddings: row.POST_EMBEDDINGS,
      semantic_matches: row.SEMANTIC_MATCHES,
      utility_graph_entities: row.UTILITY_GRAPH_ENTITIES,
      utility_graph_relationships: row.UTILITY_GRAPH_RELATIONSHIPS,
      restoration_cases: row.RESTORATION_CASES,
      graph_nodes: row.GRAPH_EDGES + row.GRAPH_LINKS,
      graph_edges: row.GRAPH_EDGES,
      graph_links: row.GRAPH_LINKS,
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// The former SSE GET handler performed incremental DML outside the governed
// dataset generation/rollback/serving-fence lifecycle. Keep the path
// explicitly fail-closed so old bookmarks and clients cannot trigger writes.
router.get('/start', (_req, res) => res.status(410).json({
  error: 'Direct demo seeding is disabled. Use the governed Restore Demo workflow.',
  code: 'DEMO_START_DISABLED',
  replacement: {
    method: 'POST',
    path: '/api/import/restore-demo',
    confirmation: 'RESTORE_DEMO',
    governance: [
      'dataset-admin authorization',
      'durable generation journal',
      'rollback snapshot',
      'dataset-serving transition',
      'required-feature proof',
    ],
  },
}));

module.exports = router;
