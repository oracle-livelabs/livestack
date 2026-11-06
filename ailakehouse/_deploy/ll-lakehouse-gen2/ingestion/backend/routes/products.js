/**
 * Products API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

async function findProductImageFilename(productId) {
  const tableCheck = await db.execute(`
    SELECT COUNT(*) AS cnt
    FROM user_tables
    WHERE table_name = 'WEBSHOP_PRODUCT_IMAGE_EMBEDDINGS'
  `);

  if (!Number(tableCheck.rows[0]?.CNT || 0)) return null;

  const image = await db.execute(`
    SELECT image_filename
    FROM (
      SELECT w.image_filename,
             ROW_NUMBER() OVER (
               ORDER BY CASE
                          WHEN UPPER(w.image_filename) LIKE '%' || UPPER(p.sku) || '%' THEN 0
                          ELSE 1
                        END,
                        w.image_filename
             ) AS rn
      FROM webshop_product_image_embeddings w
      JOIN products p ON p.product_id = w.product_id
      WHERE p.product_id = :id
    )
    WHERE rn = 1
  `, { id: productId });

  return image.rows[0]?.IMAGE_FILENAME || null;
}

function productDescriptionFallback(row = {}) {
  const brand = row.BRAND_NAME ? `${row.BRAND_NAME} ` : '';
  const category = row.CATEGORY ? `${String(row.CATEGORY).toLowerCase()} ` : '';
  const subcategory = row.SUBCATEGORY ? ` for ${String(row.SUBCATEGORY).toLowerCase()} use` : '';
  const productName = row.PRODUCT_NAME || 'PeakGear product';
  return `${brand}${productName} is a curated PeakGear ${category}item${subcategory}, with inventory, demand-signal, and fulfillment context connected through the AI Lakehouse.`;
}

// GET /api/products — list with filters
router.get('/', async (req, res) => {
  try {
    const { category, brand, search, trending, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE p.is_active = 1';
    const binds = { limit: parseInt(limit), offset };

    if (category) { where += " AND p.category = :category"; binds.category = category; }
    if (brand) { where += " AND b.brand_slug = :brand"; binds.brand = brand; }
    if (search) {
      where += ` AND (
        UPPER(p.product_name) LIKE UPPER(:search)
        OR UPPER(p.sku) LIKE UPPER(:search)
        OR UPPER(p.category) LIKE UPPER(:search)
        OR UPPER(b.brand_name) LIKE UPPER(:search)
      )`;
      binds.search = `%${search}%`;
    }

    const result = await db.execute(`
      SELECT p.product_id, p.sku, p.product_name, p.category, p.subcategory,
             p.unit_price, p.tags, b.brand_name, b.social_tier,
             (SELECT SUM(i.quantity_on_hand) FROM inventory i WHERE i.product_id = p.product_id) AS total_capacity,
             (SELECT COUNT(*) FROM post_product_mentions ppm
              JOIN social_posts sp ON ppm.post_id = sp.post_id
              WHERE ppm.product_id = p.product_id
                AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY) AS social_mentions_7d
      FROM products p
      JOIN brands b ON p.brand_id = b.brand_id
      ${where}
      ORDER BY social_mentions_7d DESC, p.product_name
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds);

    res.json(result.rows);
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

// GET /api/products/:id — product detail with inventory and social
router.get('/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const product = await db.execute(`
      SELECT p.*, b.brand_name, b.social_tier
      FROM products p JOIN brands b ON p.brand_id = b.brand_id
      WHERE p.product_id = :id
    `, { id: productId });

    const inventory = await db.execute(`
      SELECT i.*, fc.center_name, fc.city, fc.state_province, fc.center_type,
             ROUND(fc.latitude, 4) AS latitude,
             ROUND(fc.longitude, 4) AS longitude
      FROM inventory i
      JOIN fulfillment_centers fc ON i.center_id = fc.center_id
      WHERE i.product_id = :id
      ORDER BY i.quantity_on_hand DESC
    `, { id: productId });

    const socialMentions = await db.execute(`
      SELECT sp.post_id, sp.post_text, sp.posted_at, sp.likes_count,
             sp.virality_score, sp.momentum_flag,
             i.handle, ppm.confidence_score, ppm.mention_type
      FROM post_product_mentions ppm
      JOIN social_posts sp ON ppm.post_id = sp.post_id
      LEFT JOIN influencers i ON sp.influencer_id = i.influencer_id
      WHERE ppm.product_id = :id
      ORDER BY sp.virality_score DESC NULLS LAST
      FETCH FIRST 20 ROWS ONLY
    `, { id: productId });

    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const detail = product.rows[0];
    if (!detail.DESCRIPTION) {
      detail.DESCRIPTION = productDescriptionFallback(detail);
    }
    const imageFilename = await findProductImageFilename(productId);
    if (imageFilename) {
      detail.IMAGE_FILENAME = imageFilename;
      detail.IMAGE_URL = `/api/webshop/images/${encodeURIComponent(imageFilename)}`;
    }

    res.json({
      product: detail,
      inventory: inventory.rows,
      socialMentions: socialMentions.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id/duality — product as JSON document (mirrors PRODUCTS_INVENTORY_DV)
// Note: The actual duality view has an ORA-40666 bug on this Oracle version,
// so we build the equivalent JSON document via JSON_OBJECT + JSON_ARRAYAGG.
router.get('/:id/duality', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const sql = `SELECT JSON_OBJECT(
      '_id'         VALUE p.product_id,
      'sku'         VALUE p.sku,
      'productName' VALUE p.product_name,
      'category'    VALUE p.category,
      'unitPrice'   VALUE p.unit_price,
      'brand'       VALUE b.brand_name,
      'inventory'   VALUE (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'centerId'        VALUE i.center_id,
            'centerName'      VALUE fc.center_name,
            'quantityOnHand'  VALUE i.quantity_on_hand,
            'quantityReserved' VALUE i.quantity_reserved
          ) RETURNING CLOB
        )
        FROM inventory i
        JOIN fulfillment_centers fc ON i.center_id = fc.center_id
        WHERE i.product_id = p.product_id
      )
      RETURNING CLOB
    ) AS doc
    FROM products p
    JOIN brands b ON p.brand_id = b.brand_id
    WHERE p.product_id = :id`;

    const result = await db.execute(sql, { id: productId });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let doc = result.rows[0].DOC;
    if (typeof doc === 'string') doc = JSON.parse(doc);

    res.json({
      source: 'PRODUCTS_INVENTORY_DV (equivalent)',
      viewDefinition: 'CREATE JSON RELATIONAL DUALITY VIEW products_inventory_dv AS SELECT JSON {...} FROM products p WITH UPDATE',
      sql: sql.replace(':id', String(productId)),
      document: doc
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
