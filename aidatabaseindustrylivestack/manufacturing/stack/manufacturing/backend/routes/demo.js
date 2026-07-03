/**
 * Read-only demo dataset status API.
 *
 * The database bootstrap owns schema creation, seed data, and derived Oracle
 * artifacts. The running application reports that state but never provisions
 * missing data through an HTTP request.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

router.get('/status', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM brands) AS brands,
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM influencers) AS influencers,
        (SELECT COUNT(*) FROM customers) AS customers,
        (SELECT COUNT(*) FROM manufacturing_production_signals) AS manufacturing_production_signals,
        (SELECT COUNT(*) FROM manufacturing_work_orders) AS manufacturing_work_orders,
        (SELECT COUNT(*) FROM manufacturing_work_order_lines) AS manufacturing_work_order_lines,
        (SELECT COUNT(*) FROM fulfillment_centers) AS fulfillment_centers,
        (SELECT COUNT(*) FROM fulfillment_zones) AS fulfillment_zones,
        (SELECT COUNT(*) FROM demand_regions) AS demand_regions,
        (SELECT COUNT(*) FROM manufacturing_demand_forecasts) AS manufacturing_demand_forecasts,
        (SELECT COUNT(*) FROM product_embeddings) AS product_embeddings,
        (SELECT COUNT(*) FROM manufacturing_signal_embeddings) AS manufacturing_signal_embeddings,
        (SELECT COUNT(*) FROM manufacturing_signal_part_matches) AS manufacturing_signal_part_matches,
        (SELECT COUNT(*) FROM manufacturing_graph_entities) AS manufacturing_graph_entities,
        (SELECT COUNT(*) FROM manufacturing_graph_relationships) AS manufacturing_graph_relationships,
        (SELECT COUNT(*) FROM manufacturing_risk_cases) AS manufacturing_risk_cases,
        (SELECT COUNT(*) FROM influencer_connections) AS graph_edges,
        (SELECT COUNT(*) FROM brand_influencer_links) AS graph_links
      FROM dual
    `);

    const row = result.rows[0];
    res.json({
      brands: row.BRANDS,
      products: row.PRODUCTS,
      influencers: row.INFLUENCERS,
      customers: row.CUSTOMERS,
      manufacturing_production_signals: row.MANUFACTURING_PRODUCTION_SIGNALS,
      manufacturing_work_orders: row.MANUFACTURING_WORK_ORDERS,
      manufacturing_work_order_lines: row.MANUFACTURING_WORK_ORDER_LINES,
      fulfillment_centers: row.FULFILLMENT_CENTERS,
      fulfillment_zones: row.FULFILLMENT_ZONES,
      demand_regions: row.DEMAND_REGIONS,
      manufacturing_demand_forecasts: row.MANUFACTURING_DEMAND_FORECASTS,
      product_embeddings: row.PRODUCT_EMBEDDINGS,
      manufacturing_signal_embeddings: row.MANUFACTURING_SIGNAL_EMBEDDINGS,
      manufacturing_signal_part_matches: row.MANUFACTURING_SIGNAL_PART_MATCHES,
      manufacturing_graph_entities: row.MANUFACTURING_GRAPH_ENTITIES,
      manufacturing_graph_relationships: row.MANUFACTURING_GRAPH_RELATIONSHIPS,
      manufacturing_risk_cases: row.MANUFACTURING_RISK_CASES,
      graph_nodes: row.GRAPH_EDGES + row.GRAPH_LINKS,
      graph_edges: row.GRAPH_EDGES,
      graph_links: row.GRAPH_LINKS,
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
