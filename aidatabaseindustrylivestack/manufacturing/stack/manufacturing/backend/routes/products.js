/**
 * Products API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireDemoIdentity = require('../middleware/requireDemoIdentity');

const PRODUCT_DUALITY_VIEW_SQL = `
  SELECT JSON_SERIALIZE(DATA RETURNING CLOB) AS doc
  FROM products_inventory_dv
  WHERE JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id
`;

function parseJsonDocument(raw) {
  let document = raw;
  if (Array.isArray(document)) document = document[0];
  if (typeof document === 'string') document = JSON.parse(document);
  return document;
}

// GET /api/products — list with filters
router.get('/', async (req, res) => {
  try {
    const { category, brand, trending, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE p.is_active = 1';
    const binds = { limit: parseInt(limit), offset };

    if (category) { where += " AND p.category = :category"; binds.category = category; }
    if (brand) { where += " AND b.brand_slug = :brand"; binds.brand = brand; }

    const result = await db.executeAsUser(`
      SELECT p.product_id, p.sku, p.product_name, p.category, p.subcategory,
             p.unit_price, p.tags, b.brand_name, b.social_tier,
             (SELECT SUM(i.quantity_on_hand) FROM inventory i WHERE i.product_id = p.product_id) AS total_stock,
             (SELECT COUNT(*) FROM manufacturing_signal_part_mentions ppm
              JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
              WHERE ppm.manufactured_part_id = p.product_id
                AND sp.observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - INTERVAL '7' DAY) AS signal_mentions_7d
      FROM products p
      JOIN brands b ON p.brand_id = b.brand_id
      ${where}
      ORDER BY signal_mentions_7d DESC, p.product_name
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id — manufactured-part detail with capacity and production signals
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const product = await db.executeAsUser(`
      SELECT p.*, b.brand_name, b.social_tier
      FROM products p JOIN brands b ON p.brand_id = b.brand_id
      WHERE p.product_id = :id
    `, { id: productId }, req.demoUser);

    const inventory = await db.executeAsUser(`
      SELECT i.*, fc.center_name, fc.city, fc.state_province, fc.center_type
      FROM inventory i
      JOIN fulfillment_centers fc ON i.center_id = fc.center_id
      WHERE i.product_id = :id
      ORDER BY i.quantity_on_hand DESC
    `, { id: productId }, req.demoUser);

    const productionSignals = await db.executeAsUser(`
      SELECT sp.production_signal_id, sp.signal_text, sp.observed_at, sp.acknowledgement_count,
             sp.urgency_score, sp.momentum_code,
             i.handle, ppm.confidence_score, ppm.mention_type
      FROM manufacturing_signal_part_mentions ppm
      JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
      LEFT JOIN influencers i ON sp.network_account_id = i.influencer_id
      WHERE ppm.manufactured_part_id = :id
      ORDER BY sp.urgency_score DESC NULLS LAST
      FETCH FIRST 20 ROWS ONLY
    `, { id: productId }, req.demoUser);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      product: product.rows[0],
      inventory: inventory.rows,
      productionSignals: productionSignals.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id/duality — product as a read-only JSON duality document
router.get('/:id/duality', requireDemoIdentity, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const result = await db.executeAsUser(
      PRODUCT_DUALITY_VIEW_SQL,
      { id: productId },
      req.demoUser
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const doc = parseJsonDocument(result.rows[0].DOC);

    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `</api/manufacturing/parts/${productId}/document>; rel="successor-version"`);
    res.json({
      source: 'PRODUCTS_INVENTORY_DV',
      sourceMode: 'duality-view',
      readOnly: true,
      sql: PRODUCT_DUALITY_VIEW_SQL.trim(),
      binds: { id: productId },
      document: doc
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/categories/list
router.get('/categories/list', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT category, COUNT(*) AS product_count
      FROM products WHERE is_active = 1
      GROUP BY category ORDER BY product_count DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
