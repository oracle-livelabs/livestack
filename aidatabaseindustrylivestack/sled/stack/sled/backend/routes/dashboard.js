/**
 * Dashboard API - Aggregated metrics for the main dashboard
 *
 * Uses data-relative timestamps (MAX posted_at / created_at) instead of
 * SYSTIMESTAMP so demo data always appears "fresh" regardless of load date.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireGlobalAccess } = require('../lib/accessControl');
const {
  STATE_LOCAL_SCENARIO,
  evaluateMedicaidEligibilityRisk,
} = require('../config/stateLocalScenario');

const PUBLIC_DASHBOARD_KEYS = {
  ORDERS_TOTAL: 'SERVICE_REQUESTS_TOTAL',
  ORDERS_7D: 'SERVICE_REQUESTS_7D',
  ORDERS_30D: 'SERVICE_REQUESTS_30D',
  REVENUE_TOTAL: 'SERVICE_VALUE_TOTAL',
  REVENUE_7D: 'SERVICE_VALUE_7D',
  REVENUE_30D: 'SERVICE_VALUE_30D',
  VIRAL_POSTS: 'CRITICAL_SIGNALS',
  RISING_POSTS: 'RISING_SIGNALS',
  POSTS_TOTAL: 'SIGNALS_TOTAL',
  TRENDING_PRODUCTS: 'SERVICES_UNDER_PRESSURE',
  SHIPMENTS_IN_TRANSIT: 'ACTIVE_SERVICE_ROUTES',
  PRODUCT_ID: 'SERVICE_ID',
  PRODUCT_NAME: 'SERVICE_NAME',
  BRAND_NAME: 'AGENCY_OR_PROGRAM',
  SOCIAL_TIER: 'PUBLIC_PROGRAM_TIER',
  UNIT_PRICE: 'ESTIMATED_SERVICE_VALUE',
  MENTION_COUNT: 'SIGNAL_MATCH_COUNT',
  TOTAL_LIKES: 'TOTAL_ACKNOWLEDGEMENTS',
  TOTAL_SHARES: 'TOTAL_HANDOFFS',
  TOTAL_VIEWS: 'TOTAL_REACH',
  AVG_VIRALITY: 'AVG_PRIORITY',
  PEAK_MOMENTUM: 'PEAK_PRIORITY',
  HOUR_BUCKET: 'TIME_BUCKET',
  POST_COUNT: 'SIGNAL_COUNT',
  VIRAL_COUNT: 'CRITICAL_SIGNAL_COUNT',
  ORDER_COUNT: 'SERVICE_REQUEST_COUNT',
  TOTAL_REVENUE: 'SERVICE_VALUE',
  SOCIAL_DRIVEN_ORDERS: 'SIGNAL_LINKED_REQUESTS',
  SOCIAL_ORDERS: 'SIGNAL_LINKED_REQUESTS',
  TABLE_NAME: 'DATA_SUBJECT',
};

const PUBLIC_TABLE_NAMES = {
  ORDERS: 'service_requests',
  ORDER_ITEMS: 'service_request_lines',
  PRODUCTS: 'public_services',
  BRANDS: 'agencies_and_programs',
  CUSTOMERS: 'resident_profiles',
  SOCIAL_POSTS: 'resident_signals',
  INFLUENCERS: 'community_partners',
  INVENTORY: 'service_capacity',
  SHIPMENTS: 'service_tasks',
  FULFILLMENT_CENTERS: 'service_access_centers',
  POST_PRODUCT_MENTIONS: 'signal_service_matches',
  PRODUCT_EMBEDDINGS: 'service_vectors',
  POST_EMBEDDINGS: 'resident_signal_vectors',
};

function sanitizeDashboardString(value, mappedKey = '') {
  if (mappedKey === 'DATA_SUBJECT') {
    return PUBLIC_TABLE_NAMES[value] || value;
  }
  return String(value)
    .replace(/mega_viral/gi, 'critical')
    .replace(/\bviral\b/gi, 'escalating')
    .replace(/product_name/gi, 'service_name')
    .replace(/product_id/gi, 'service_id')
    .replace(/brand_name/gi, 'agency_or_program')
    .replace(/unit_price/gi, 'estimated_service_value')
    .replace(/order_count/gi, 'service_request_count')
    .replace(/social_driven_orders/gi, 'signal_linked_requests')
    .replace(/post_count/gi, 'signal_count')
    .replace(/viral_count/gi, 'critical_signal_count')
    .replace(/\bProducts\b/g, 'Public Services')
    .replace(/\bproducts\b/g, 'public services')
    .replace(/\bProduct\b/g, 'Public Service')
    .replace(/\bproduct\b/g, 'public service')
    .replace(/\bOrders\b/g, 'Service Requests')
    .replace(/\borders\b/g, 'service requests')
    .replace(/\bOrder\b/g, 'Service Request')
    .replace(/\border\b/g, 'service request')
    .replace(/\bRevenue\b/g, 'Service Value')
    .replace(/\brevenue\b/g, 'service value')
    .replace(/\bFulfillment\b/g, 'Resolution')
    .replace(/\bfulfillment\b/g, 'resolution')
    .replace(/\bSocial\b/g, 'Resident signal')
    .replace(/\bsocial\b/g, 'resident signal')
    .replace(/\bVirality\b/g, 'Priority')
    .replace(/\bvirality\b/g, 'priority')
    .replace(/\bCustomer\b/g, 'Resident')
    .replace(/\bcustomer\b/g, 'resident')
    .replace(/\bShipment\b/g, 'Service Task')
    .replace(/\bshipment\b/g, 'service task');
}

function sanitizeDashboardPayload(value, mappedKey = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizeDashboardPayload(item, mappedKey));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
      const nextKey = PUBLIC_DASHBOARD_KEYS[key] || key;
      return [nextKey, sanitizeDashboardPayload(entryValue, nextKey)];
    }));
  }
  if (typeof value === 'string') return sanitizeDashboardString(value, mappedKey);
  return value;
}

router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeDashboardPayload(payload));
  next();
});

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

    res.json({
      ...result.rows[0],
      operatingScenario: {
        state: STATE_LOCAL_SCENARIO.state,
        stateCode: STATE_LOCAL_SCENARIO.stateCode,
        operatingViewLabel: STATE_LOCAL_SCENARIO.operatingViewLabel,
        residentScopeLabel: STATE_LOCAL_SCENARIO.residentScopeLabel,
      },
      medicaidEligibilityRisk: evaluateMedicaidEligibilityRisk(),
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/services-under-pressure
// Supports: ?limit=10 &search=<service/program text> &brand=<exact agency/program name>
async function servicesUnderPressureHandler(req, res) {
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
             SUM(sp.likes_count) AS total_likes,
             SUM(sp.shares_count) AS total_shares,
             SUM(sp.views_count) AS total_views,
             ROUND(AVG(sp.virality_score), 2) AS avg_virality,
             MAX(sp.momentum_flag) AS peak_momentum
      FROM products p
      JOIN brands b ON p.brand_id = b.brand_id
      JOIN post_product_mentions ppm ON p.product_id = ppm.product_id
      JOIN social_posts sp ON ppm.post_id = sp.post_id
      WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
      ${whereExtra}
      GROUP BY p.product_id, p.product_name, p.category, p.unit_price,
               b.brand_name, b.social_tier
      ORDER BY avg_virality DESC, total_views DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds);

    res.json(result.rows);
  } catch (err) {
    console.error('Services under pressure error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.get('/trending-products', servicesUnderPressureHandler);
router.get('/services-under-pressure', servicesUnderPressureHandler);

// GET /api/dashboard/agency-workload-velocity?hours=48
async function agencyWorkloadVelocityHandler(req, res) {
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
      WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(:hours, 'HOUR')
      GROUP BY TRUNC(posted_at, ${truncFmt})
      ORDER BY hour_bucket
    `, { hours });

    res.json(result.rows);
  } catch (err) {
    console.error('Agency workload velocity error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.get('/social-velocity', agencyWorkloadVelocityHandler);
router.get('/agency-workload-velocity', agencyWorkloadVelocityHandler);

// GET /api/dashboard/service-value-by-category
async function serviceValueByCategoryHandler(req, res) {
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
    console.error('Service value by category error:', err);
    res.status(500).json({ error: err.message });
  }
}
router.get('/revenue-by-category', serviceValueByCategoryHandler);
router.get('/service-value-by-category', serviceValueByCategoryHandler);

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

// GET /api/dashboard/inmemory - In-Memory Column Store segment stats
// Uses USER_TABLES + USER_SEGMENTS (no DBA/V$ grants needed)
router.get('/inmemory', requireGlobalAccess, async (req, res) => {
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
    } catch (_) { /* V$ not granted - use fallback */ }

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
