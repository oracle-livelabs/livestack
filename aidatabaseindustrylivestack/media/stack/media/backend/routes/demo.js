/**
 * Read-only demo dataset compatibility API.
 *
 * Dataset replacement is intentionally available only through the guarded,
 * durable POST /api/import/restore-demo command. The historical GET start
 * endpoint is permanently non-mutating for every persona.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { featureUnavailable } = require('../lib/featureUnavailable');

router.get('/status', async (_req, res) => {
  try {
    // This endpoint intentionally reports shared dataset lifecycle/readiness
    // and global asset counts; it does not expose row-level scene data.
    const result = await db.executeSystem(`
      SELECT
        state.active_source,
        state.active_version,
        readiness.job_id active_job_id,
        readiness.status readiness_status,
        JSON_SERIALIZE(
          readiness.readiness RETURNING CLOB
        ) feature_readiness,
        (SELECT COUNT(*) FROM brands) brands,
        (SELECT COUNT(*) FROM products) products,
        (SELECT COUNT(*) FROM influencers) influencers,
        (SELECT COUNT(*) FROM customers) customers,
        (SELECT COUNT(*) FROM social_posts) social_posts,
        (SELECT COUNT(*) FROM orders) orders,
        (SELECT COUNT(*) FROM fulfillment_centers) fulfillment_centers,
        (SELECT COUNT(*) FROM fulfillment_zones) fulfillment_zones,
        (SELECT COUNT(*) FROM demand_regions) demand_regions,
        (SELECT COUNT(*) FROM demand_forecasts) demand_forecasts,
        (SELECT COUNT(*) FROM product_embeddings) product_embeddings,
        (SELECT COUNT(*) FROM post_embeddings) post_embeddings,
        (SELECT COUNT(*) FROM semantic_matches) semantic_matches,
        (SELECT COUNT(*) FROM influencer_connections) graph_edges,
        (SELECT COUNT(*) FROM brand_influencer_links) graph_links,
        (SELECT COUNT(*) FROM product_attributes
          WHERE JSON_EXISTS(attributes, '$.sku')) native_json_products,
        (SELECT COUNT(*) FROM event_stream
          WHERE JSON_EXISTS(event_data, '$.datasetVersion')) native_json_events
      FROM app_dataset_state state
      CROSS JOIN app_dataset_readiness readiness
      WHERE state.state_id = 1 AND readiness.readiness_id = 1
    `);
    const row = result.rows?.[0] || {};
    res.json({
      active_source: row.ACTIVE_SOURCE,
      active_version: row.ACTIVE_VERSION,
      active_job_id: row.ACTIVE_JOB_ID,
      readiness_status: row.READINESS_STATUS,
      feature_readiness: typeof row.FEATURE_READINESS === 'string'
        ? JSON.parse(row.FEATURE_READINESS)
        : row.FEATURE_READINESS,
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
      graph_nodes: Number(row.GRAPH_EDGES || 0) + Number(row.GRAPH_LINKS || 0),
      graph_edges: row.GRAPH_EDGES,
      graph_links: row.GRAPH_LINKS,
      native_json_products: row.NATIVE_JSON_PRODUCTS,
      native_json_events: row.NATIVE_JSON_EVENTS,
    });
  } catch (error) {
    console.error('Demo status error:', error);
    return featureUnavailable(res, {
      feature: 'APPLICATION_CONTEXT_VPD',
      source: 'MEDIA_APP_CTX + DBMS_RLS',
      message: 'Current Application Context and VPD dataset evidence is unavailable.',
    });
  }
});

router.get('/start', (_req, res) => res.status(410).json({
  error: 'Legacy GET demo mutation is permanently disabled.',
  code: 'LEGACY_DEMO_START_GONE',
  restorePath: '/api/import/restore-demo',
  mutating: false,
}));

module.exports = router;
