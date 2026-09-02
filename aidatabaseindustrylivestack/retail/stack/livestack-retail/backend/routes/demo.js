/**
 * Read-only demo footprint API.
 *
 * Legacy GET /api/demo/start is permanently retired. Dataset replacement is
 * available only through the guarded, durable Admin import/Restore workflow.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/status', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
        (SELECT COUNT(*) FROM brands)                 AS brands,
        (SELECT COUNT(*) FROM products)               AS products,
        (SELECT COUNT(*) FROM influencers)            AS influencers,
        (SELECT COUNT(*) FROM customers)              AS customers,
        (SELECT COUNT(*) FROM social_posts)           AS social_posts,
        (SELECT COUNT(*) FROM orders)                 AS orders,
        (SELECT COUNT(*) FROM fulfillment_centers)    AS fulfillment_centers,
        (SELECT COUNT(*) FROM fulfillment_zones)      AS fulfillment_zones,
        (SELECT COUNT(*) FROM demand_regions)         AS demand_regions,
        (SELECT COUNT(*) FROM demand_forecasts)       AS demand_forecasts,
        (SELECT COUNT(*) FROM product_embeddings)     AS product_embeddings,
        (SELECT COUNT(*) FROM post_embeddings)        AS post_embeddings,
        (SELECT COUNT(*) FROM semantic_matches)       AS semantic_matches,
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
      graph_nodes: Number(row.GRAPH_EDGES || 0) + Number(row.GRAPH_LINKS || 0),
      graph_edges: row.GRAPH_EDGES,
      graph_links: row.GRAPH_LINKS,
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ error: 'Demo footprint is unavailable.' });
  }
});

router.get('/start', (_req, res) => res.status(410).json({
  category: 'ENDPOINT_RETIRED',
  available: false,
  error: 'Legacy demo population is permanently disabled. Use the guarded Admin Restore workflow.',
}));

module.exports = router;
