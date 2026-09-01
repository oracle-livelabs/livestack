/**
 * Dashboard API - Aggregated metrics for the main dashboard
 *
 * Uses data-relative timestamps (MAX posted_at / created_at) instead of
 * SYSTIMESTAMP so demo data always appears "fresh" regardless of load date.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  assertCanonicalInMemorySegments,
} = require('../lib/inMemoryEvidenceService');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
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
    `, {}, req.demoUser);

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

    const result = await db.executeAsUser(`
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
    `, binds, req.demoUser);

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

    const result = await db.executeAsUser(`
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
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Social velocity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/revenue-by-category
router.get('/revenue-by-category', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
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
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Revenue by category error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/demand-map
router.get('/demand-map', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
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
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Demand map error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/inmemory - In-Memory Column Store segment stats
// Uses USER_TABLES + USER_SEGMENTS (no DBA/V$ grants needed)
router.get('/inmemory', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT segment_name AS table_name, row_count, disk_bytes,
             inmemory_bytes AS im_bytes,
             inmemory_compression AS compression,
             inmemory_priority AS priority,
             populate_status AS status,
             bytes_not_populated
      FROM retail_inmemory_segments_v
      ORDER BY disk_bytes DESC NULLS LAST
    `, {}, req.demoUser);

    // Feature-population/readiness rows are safe, global engineering metadata.
    // They are intentionally read through the trusted system evidence boundary
    // so a regional persona can verify the feature without gaining access to
    // any globally protected business rows.
    const proofResult = await db.executeSystem(`
      SELECT 5 expected_segments, evidence.populated_segments,
             evidence.sql_id plan_proof_sql_id,
             evidence.child_number,
             evidence.plan_operation plan_proof_operation,
             evidence.plan_object_owner,
             evidence.plan_object_name,
             evidence.proof_id,
             evidence.evidence_status,
             evidence.generation_id,
             evidence.dataset_fingerprint,
             evidence.verified_at,
             readiness.status readiness_status,
             JSON_VALUE(readiness.readiness, '$.inMemoryProofId')
               readiness_proof_id,
             (SELECT COUNT(*)
                FROM retail_inmemory_segments_v
               WHERE table_inmemory = 'ENABLED'
                 AND populate_status = 'COMPLETED'
                 AND inmemory_bytes > 0
                 AND bytes_not_populated = 0) completed_segments,
             (SELECT COUNT(*)
                FROM retail_inmemory_segments_v
               WHERE table_inmemory <> 'ENABLED'
                  OR populate_status <> 'COMPLETED'
                  OR inmemory_bytes <= 0
                  OR bytes_not_populated <> 0) unpopulated_segments
      FROM app_dataset_state state
      JOIN app_dataset_readiness readiness
        ON readiness.readiness_id = 1
      JOIN app_inmemory_generation_evidence evidence
        ON evidence.generation_id = state.active_generation_id
      WHERE state.state_id = 1
    `);
    const proof = proofResult.rows?.[0] || {};

    const rows = result.rows.map(r => {
      const diskBytes = r.DISK_BYTES || 0;
      const imBytes = r.IM_BYTES ?? null;
      const pct       = diskBytes > 0 && imBytes != null ? Math.round((1 - imBytes / diskBytes) * 100) : null;
      return {
        TABLE_NAME:      r.TABLE_NAME,
        ROW_COUNT:       r.ROW_COUNT,
        DISK_BYTES:      diskBytes,
        IM_BYTES:        imBytes,
        COMPRESSION_PCT: pct,
        COMPRESSION:     r.COMPRESSION,
        PRIORITY:        r.PRIORITY,
        STATUS:          r.STATUS,
        BYTES_NOT_POPULATED: r.BYTES_NOT_POPULATED,
        SOURCE:          'V$IM_SEGMENTS',
        IS_ESTIMATED:    false,
        AVAILABLE:       r.STATUS === 'COMPLETED' && Number(r.BYTES_NOT_POPULATED || 0) === 0
      };
    });
    const canonicalSegmentEvidence = assertCanonicalInMemorySegments(
      rows,
      'Retail dashboard In-Memory population'
    );

    const proofIsCurrent = proof.EVIDENCE_STATUS === 'ACTIVE'
      && proof.READINESS_STATUS === 'ACTIVE'
      && proof.PROOF_ID
      && proof.PROOF_ID === proof.READINESS_PROOF_ID
      && Number.isInteger(Number(proof.CHILD_NUMBER))
      && proof.PLAN_PROOF_OPERATION === 'TABLE ACCESS INMEMORY FULL'
      && proof.PLAN_OBJECT_NAME === 'ORDERS'
      && Number(proof.POPULATED_SEGMENTS) === 5
      && Number(proof.COMPLETED_SEGMENTS) === 5
      && Number(proof.UNPOPULATED_SEGMENTS) === 0
      && rows.length === 5
      && canonicalSegmentEvidence.ready === true
      && canonicalSegmentEvidence.segmentCount === 5
      && rows.every((row) => row.AVAILABLE);
    if (!proofIsCurrent) {
      return res.status(503).json({
        category: 'FEATURE_UNAVAILABLE',
        feature: 'DATABASE_IN_MEMORY',
        available: false,
        message: 'Database In-Memory population or actual-plan evidence is not ready.',
        evidenceScope: 'GLOBAL_FEATURE_METADATA',
        dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
        details: { proof, rows },
      });
    }
    res.json({
      available: true,
      feature: 'DATABASE_IN_MEMORY',
      evidenceScope: 'GLOBAL_FEATURE_METADATA',
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      proof,
      canonicalSegmentEvidence,
      rows,
    });
  } catch (err) {
    console.error('In-Memory stats error:', err);
    res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'DATABASE_IN_MEMORY',
      available: false,
      error: 'Database In-Memory evidence is unavailable.',
    });
  }
});

// GET /api/dashboard/native-json - independent native JSON operator evidence
router.get('/native-json', async (req, res) => {
  try {
    // This trusted boundary returns only aggregate feature metadata. It never
    // exposes event identifiers, payload fields, jobs, or business rows.
    const result = await db.executeSystem(`
      SELECT state.active_generation_id generation_id,
             state.dataset_fingerprint,
             COUNT(*) evidence_count
      FROM retail_native_json_evidence_v evidence
      JOIN app_dataset_state state
        ON state.active_generation_id = evidence.generation_id
       AND state.dataset_fingerprint = evidence.dataset_fingerprint
      WHERE state.state_id = 1
        AND evidence.feature_name = 'native_json'
        AND evidence.has_event = 'YES'
      GROUP BY state.active_generation_id, state.dataset_fingerprint
    `);
    const row = result.rows?.[0] || {};
    const proof = {
      generationId: row.GENERATION_ID || null,
      datasetFingerprint: row.DATASET_FINGERPRINT || null,
      evidenceCount: Number(row.EVIDENCE_COUNT || 0),
      source: 'RETAIL_NATIVE_JSON_EVIDENCE_V',
      operators: ['JSON_VALUE', 'JSON_EXISTS'],
    };
    const proofIsCurrent = Boolean(
      proof.generationId
        && /^[a-f0-9]{64}$/i.test(String(proof.datasetFingerprint || ''))
        && proof.evidenceCount >= 1
    );
    if (!proofIsCurrent) {
      return res.status(503).json({
        category: 'FEATURE_UNAVAILABLE',
        feature: 'NATIVE_JSON',
        available: false,
        evidenceScope: 'GLOBAL_FEATURE_METADATA',
        dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
        error: 'Current generation Native JSON operator evidence is unavailable.',
      });
    }
    res.json({
      available: true,
      feature: 'NATIVE_JSON',
      evidenceScope: 'GLOBAL_FEATURE_METADATA',
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      proof,
    });
  } catch (err) {
    console.error('Native JSON evidence error:', err);
    res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'NATIVE_JSON',
      available: false,
      evidenceScope: 'GLOBAL_FEATURE_METADATA',
      dataScope: req.demoIdentity?.accessScope || 'RESTRICTED',
      error: 'Native JSON evidence is unavailable.',
    });
  }
});

module.exports = router;
