/**
 * Dashboard API — Aggregated metrics for the main dashboard
 *
 * Uses data-relative timestamps (MAX posted_at / created_at) instead of
 * SYSTIMESTAMP so demo data always appears "fresh" regardless of load date.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS orders_total,
        (SELECT COUNT(*) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '7' DAY) AS orders_7d,
        (SELECT COUNT(*) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY) AS orders_30d,
        (SELECT NVL(SUM(order_total), 0) FROM orders) AS revenue_total,
        (SELECT NVL(SUM(order_total), 0) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '7' DAY) AS revenue_7d,
        (SELECT NVL(SUM(order_total), 0) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY) AS revenue_30d,
        (SELECT COUNT(*) FROM reliability_load_signals_v WHERE signal_intensity IN ('viral','mega_viral')) AS viral_posts,
        (SELECT COUNT(*) FROM reliability_load_signals_v WHERE signal_intensity = 'rising') AS rising_posts,
        (SELECT COUNT(*) FROM reliability_load_signals_v) AS posts_total,
        (SELECT COUNT(DISTINCT product_id) FROM post_product_mentions
         WHERE post_id IN (SELECT signal_id FROM reliability_load_signals_v WHERE signal_intensity IN ('viral','mega_viral'))) AS trending_products,
        (SELECT COUNT(*) FROM agent_actions) AS agent_actions_total,
        (SELECT COUNT(*) FROM shipments WHERE ship_status = 'in_transit') AS shipments_in_transit
      FROM dual
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/trending-products
// Supports: ?limit=10 &search=<product/manufacturer text> &brand=<exact manufacturer name>
router.get('/trending-products', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 10, 100);
    const search = (req.query.search || '').trim();
    const brand  = (req.query.brand  || '').trim();

    let whereExtra = '';
    const binds = { limit };

    if (search) {
      whereExtra += " AND (UPPER(p.product_name) LIKE UPPER(:search) OR UPPER(b.brand_name) LIKE UPPER(:search))";
      binds.search = `%${search}%`;
    }
    if (brand) {
      whereExtra += " AND UPPER(b.brand_name) = UPPER(:brand)";
      binds.brand = brand;
    }

    const result = await db.execute(`
	      SELECT p.product_id, p.product_name, p.category, p.unit_price,
	             b.brand_name, b.social_tier,
	             COUNT(DISTINCT ppm.post_id) AS mention_count,
	             ROUND(SUM(rls.criticality_score), 0) AS total_likes,
	             SUM(rls.escalation_count) AS total_shares,
	             SUM(rls.signal_reach) AS total_views,
	             ROUND(AVG(rls.criticality_score), 2) AS avg_virality,
	             MAX(rls.signal_intensity) AS peak_momentum
	      FROM products p
	      JOIN brands b ON p.brand_id = b.brand_id
	      JOIN post_product_mentions ppm ON p.product_id = ppm.product_id
	      JOIN reliability_load_signals_v rls ON ppm.post_id = rls.signal_id
	      WHERE rls.signal_timestamp >= (SELECT MAX(signal_timestamp) FROM reliability_load_signals_v) - INTERVAL '7' DAY
      ${whereExtra}
      GROUP BY p.product_id, p.product_name, p.category, p.unit_price,
               b.brand_name, b.social_tier
      ORDER BY avg_virality DESC, total_views DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds);

    res.json(result.rows);
  } catch (err) {
    console.error('Watched products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/social-velocity?hours=48
router.get('/social-velocity', async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || 48, 1), 8760); // 1h–1yr

    // Pick truncation granularity based on range so we get ~20-60 buckets
    let truncFmt, labelFmt;
    if (hours <= 6) {
      // Per-hour buckets, show HH:MI
      truncFmt = "'HH'";
      labelFmt = "'YYYY-MM-DD HH24:MI'";
    } else if (hours <= 168) {
      // ≤7 days → hourly buckets
      truncFmt = "'HH'";
      labelFmt = "'YYYY-MM-DD HH24:MI'";
    } else if (hours <= 1440) {
      // ≤60 days → daily buckets
      truncFmt = "'DD'";
      labelFmt = "'YYYY-MM-DD'";
    } else {
      // >60 days → weekly buckets
      truncFmt = "'IW'";
      labelFmt = "'YYYY-MM-DD'";
    }

	    const result = await db.execute(`
	      SELECT
	        TO_CHAR(TRUNC(signal_timestamp, ${truncFmt}), ${labelFmt}) AS hour_bucket,
	        COUNT(*) AS post_count,
	        ROUND(SUM(criticality_score), 0) AS total_likes,
	        SUM(escalation_count) AS total_shares,
	        ROUND(AVG(signal_sentiment), 3) AS avg_sentiment,
	        COUNT(CASE WHEN signal_intensity IN ('viral','mega_viral') THEN 1 END) AS viral_count
	      FROM reliability_load_signals_v
	      WHERE signal_timestamp >= (SELECT MAX(signal_timestamp) FROM reliability_load_signals_v) - NUMTODSINTERVAL(:hours, 'HOUR')
	      GROUP BY TRUNC(signal_timestamp, ${truncFmt})
	      ORDER BY hour_bucket
	    `, { hours });

    res.json(result.rows);
  } catch (err) {
    console.error('Signal velocity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/revenue-by-category
router.get('/revenue-by-category', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT p.category,
             COUNT(DISTINCT o.order_id) AS order_count,
             SUM(oi.quantity * oi.unit_price) AS total_revenue,
             COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS social_driven_orders
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      JOIN orders o ON oi.order_id = o.order_id
      WHERE o.created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Revenue by category error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/demand-map
router.get('/demand-map', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT c.city, c.state_province,
             ROUND(AVG(c.latitude), 4) AS lat,
             ROUND(AVG(c.longitude), 4) AS lon,
             COUNT(DISTINCT o.order_id) AS order_count,
             SUM(o.order_total) AS total_revenue,
             COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS social_orders
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
        AND c.latitude IS NOT NULL
      GROUP BY c.city, c.state_province
      HAVING COUNT(DISTINCT o.order_id) >= 3
      ORDER BY order_count DESC
      FETCH FIRST 50 ROWS ONLY
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Demand map error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function sendInMemoryDeclarationEvidence(req, res) {
  try {
    const declared = await db.executeAsUser(`
      SELECT t.table_name                                       AS table_name,
             t.num_rows                                         AS row_count,
             NVL(s.bytes, 0)                                    AS disk_bytes,
             t.inmemory_compression                             AS inmemory_compression,
             t.inmemory_priority                                AS inmemory_priority
      FROM   user_tables   t
      LEFT JOIN user_segments s ON s.segment_name = t.table_name
                               AND s.segment_type = 'TABLE'
      WHERE  t.inmemory = 'ENABLED'
      ORDER  BY s.bytes DESC NULLS LAST
    `, {}, req.demoUser);

    res.json({
      ready: true,
      feature: 'DATABASE_IN_MEMORY',
      evidenceMode: 'DECLARATION_ONLY',
      evidenceStatus: declared.rows.length > 0 ? 'DECLARED' : 'NOT_DECLARED',
      active: false,
      runtimePopulationClaimed: false,
      populationStatus: 'NOT_PROVEN',
      serviceManaged: true,
      evidenceSources: ['USER_TABLES', 'USER_SEGMENTS'],
      inmemoryOption: 'DECLARATION_ONLY',
      declaredSegmentCount: declared.rows.length,
      segments: declared.rows,
      requestPlan: null,
    });
  } catch (err) {
    const evidence = {
      ready: false,
      feature: 'DATABASE_IN_MEMORY',
      evidenceMode: 'DECLARATION_ONLY',
      evidenceStatus: 'UNAVAILABLE',
      active: false,
      runtimePopulationClaimed: false,
      populationStatus: 'NOT_PROVEN',
      evidenceSources: ['USER_TABLES', 'USER_SEGMENTS'],
      declaredSegmentCount: 0,
      segments: [],
      requestPlan: null,
    };
    res.status(503).json({
      error: 'Oracle In-Memory declaration evidence is unavailable.',
      code: 'INMEMORY_DECLARATION_UNAVAILABLE',
      category: 'ORACLE_FEATURE_UNAVAILABLE',
      ...evidence,
      details: evidence,
    });
  }
}

// Both endpoints report only declaration evidence. Neither infers runtime
// population, compressed bytes, an execution plan, or an active state.
router.get('/inmemory', sendInMemoryDeclarationEvidence);
router.get('/inmemory-readiness', sendInMemoryDeclarationEvidence);

module.exports = router;
