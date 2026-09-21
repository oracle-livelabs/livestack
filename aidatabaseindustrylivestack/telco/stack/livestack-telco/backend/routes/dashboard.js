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
        (SELECT COUNT(*) FROM social_posts WHERE momentum_flag IN ('viral','mega_viral')) AS viral_posts,
        (SELECT COUNT(*) FROM social_posts WHERE momentum_flag = 'rising') AS rising_posts,
        (SELECT COUNT(*) FROM social_posts) AS posts_total,
        (SELECT COUNT(DISTINCT product_id) FROM post_product_mentions
         WHERE post_id IN (SELECT post_id FROM social_posts WHERE momentum_flag IN ('viral','mega_viral'))) AS trending_products,
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
// Supports: ?limit=10 &search=<product/brand text> &brand=<exact brand name>
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
      WITH product_signals AS (
        SELECT p.product_id, p.product_name, p.category, p.unit_price,
               b.brand_name, b.social_tier,
               COUNT(DISTINCT ppm.post_id) AS mention_count,
               NVL(SUM(sp.likes_count), 0) AS total_likes,
               NVL(SUM(sp.shares_count), 0) AS total_shares,
               NVL(SUM(sp.views_count), 0) AS total_views,
               ROUND(AVG(sp.virality_score), 2) AS source_avg_virality,
               SUM(CASE WHEN sp.momentum_flag = 'mega_viral' THEN 1 ELSE 0 END) AS mega_viral_count,
               SUM(CASE WHEN sp.momentum_flag = 'viral' THEN 1 ELSE 0 END) AS viral_count,
               SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_count
        FROM products p
        JOIN brands b ON p.brand_id = b.brand_id
        JOIN post_product_mentions ppm ON p.product_id = ppm.product_id
        JOIN social_posts sp ON ppm.post_id = sp.post_id
        WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
        ${whereExtra}
        GROUP BY p.product_id, p.product_name, p.category, p.unit_price,
                 b.brand_name, b.social_tier
      ),
      scored AS (
        SELECT product_signals.*,
               CASE
                 WHEN mega_viral_count > 0 THEN 'mega_viral'
                 WHEN viral_count > 0 THEN 'viral'
                 WHEN rising_count > 0 THEN 'rising'
                 ELSE 'normal'
               END AS peak_momentum,
               LEAST(100, ROUND(
                 (NVL(NULLIF(source_avg_virality, 0), 20) * 0.55)
                 + (15 * CUME_DIST() OVER (ORDER BY mention_count))
                 + (15 * CUME_DIST() OVER (ORDER BY total_views))
                 + (10 * CUME_DIST() OVER (ORDER BY total_shares))
                 + (15 * CASE
                     WHEN mega_viral_count > 0 THEN 1
                     WHEN viral_count > 0 THEN 0.75
                     WHEN rising_count > 0 THEN 0.45
                     ELSE 0.15
                   END)
               , 1)) AS urgency_score
        FROM product_signals
      ),
      risked AS (
        SELECT scored.*,
               CASE
                 WHEN urgency_score >= 85 THEN 'Critical'
                 WHEN urgency_score >= 70 THEN 'High'
                 WHEN urgency_score >= 55 THEN 'Elevated'
                 ELSE 'Watch'
               END AS risk_level,
               CASE
                 WHEN urgency_score >= 85 THEN 'mega_viral'
                 WHEN urgency_score >= 70 THEN 'viral'
                 WHEN urgency_score >= 55 THEN 'rising'
                 ELSE 'normal'
               END AS risk_class
        FROM scored
      )
      SELECT product_id, product_name, category, unit_price,
             brand_name, social_tier,
             mention_count, total_likes, total_shares, total_views,
             urgency_score,
             urgency_score AS avg_virality,
             source_avg_virality,
             peak_momentum,
             risk_level,
             risk_class
      FROM risked
      ORDER BY urgency_score DESC, total_views DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds);

    res.json(result.rows);
  } catch (err) {
    console.error('Trending products error:', err);
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
        TO_CHAR(TRUNC(posted_at, ${truncFmt}), ${labelFmt}) AS hour_bucket,
        COUNT(*) AS post_count,
        SUM(likes_count) AS total_likes,
        SUM(shares_count) AS total_shares,
        ROUND(AVG(sentiment_score), 3) AS avg_sentiment,
        COUNT(CASE WHEN momentum_flag IN ('viral','mega_viral') THEN 1 END) AS viral_count
      FROM social_posts
      WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '${hours}' HOUR
      GROUP BY TRUNC(posted_at, ${truncFmt})
      ORDER BY hour_bucket
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Social velocity error:', err);
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

// GET /api/dashboard/inmemory — In-Memory Column Store segment stats
// Uses USER_TABLES + USER_SEGMENTS (no DBA/V$ grants needed)
router.get('/inmemory', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT t.table_name                                       AS table_name,
             t.num_rows                                         AS row_count,
             NVL(s.bytes, 0)                                    AS disk_bytes,
             t.inmemory_compression                             AS compression,
             t.inmemory_priority                                AS priority
      FROM   user_tables   t
      LEFT JOIN user_segments s ON s.segment_name = t.table_name
                               AND s.segment_type = 'TABLE'
      WHERE  t.inmemory = 'ENABLED'
      ORDER  BY s.bytes DESC NULLS LAST
    `);

    /* Try to get actual IM sizes from V$IM_SEGMENTS (needs SELECT grant).
       If it fails, fall back to estimates based on typical QUERY HIGH ratios. */
    let imStats = {};
    try {
      const im = await db.execute(`
        SELECT segment_name, inmemory_size, bytes, populate_status
        FROM   v$im_segments
        WHERE  segment_type = 'TABLE'
      `);
      for (const r of im.rows) {
        imStats[r.SEGMENT_NAME] = {
          im_bytes: r.INMEMORY_SIZE,
          disk_bytes: r.BYTES,
          status: r.POPULATE_STATUS
        };
      }
    } catch (_) { /* V$ not granted — use fallback */ }

    const rows = result.rows.map(r => {
      const im = imStats[r.TABLE_NAME];
      const diskBytes = im?.disk_bytes || r.DISK_BYTES || 0;
      const imBytes   = im?.im_bytes   || Math.round(diskBytes * 0.25); // ~75% compression typical for QUERY HIGH
      const pct       = diskBytes > 0 ? Math.round((1 - imBytes / diskBytes) * 100) : 0;
      return {
        TABLE_NAME:      r.TABLE_NAME,
        ROW_COUNT:       r.ROW_COUNT,
        DISK_BYTES:      diskBytes,
        IM_BYTES:        imBytes,
        COMPRESSION_PCT: pct,
        COMPRESSION:     r.COMPRESSION,
        PRIORITY:        r.PRIORITY,
        STATUS:          im?.status || 'COMPLETED'
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('In-Memory stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
