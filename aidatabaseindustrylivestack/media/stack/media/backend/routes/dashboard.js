/**
 * Dashboard API — Aggregated metrics for the main dashboard
 *
 * Uses data-relative timestamps (MAX posted_at / created_at) instead of
 * SYSTIMESTAMP so demo data always appears "fresh" regardless of load date.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { featureUnavailable } = require('../lib/featureUnavailable');
const {
  auditGenerationTokenSql,
} = require('../lib/auditGenerationToken');
const {
  collectExactInMemorySegmentInventory,
  executeWithExactPlanEvidence,
} = require('../lib/exactPlanEvidence');

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
    console.error('Trending products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/social-velocity?hours=48
router.get('/social-velocity', async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || 48, 1), 8760); // 1h–1yr

    // Pick bucket granularity based on range, then generate zero-filled buckets
    // so sparse demo signals still render as a visible time-series chart.
    let truncFmt, labelFmt, bucketExpression, bucketCountSql, nextBucketExpression;
    if (hours <= 6) {
      // Per-hour buckets, show HH:MI
      truncFmt = "'HH'";
      labelFmt = "'YYYY-MM-DD HH24:MI'";
      bucketExpression = 'start_bucket + ((LEVEL - 1) * (1/24))';
      bucketCountSql = ':hours + 1';
      nextBucketExpression = 'b.end_bucket + (1/24)';
    } else if (hours <= 168) {
      // ≤7 days → hourly buckets
      truncFmt = "'HH'";
      labelFmt = "'YYYY-MM-DD HH24:MI'";
      bucketExpression = 'start_bucket + ((LEVEL - 1) * (1/24))';
      bucketCountSql = ':hours + 1';
      nextBucketExpression = 'b.end_bucket + (1/24)';
    } else if (hours <= 1440) {
      // ≤60 days → daily buckets
      truncFmt = "'DD'";
      labelFmt = "'YYYY-MM-DD'";
      bucketExpression = 'start_bucket + (LEVEL - 1)';
      bucketCountSql = 'FLOOR(:hours / 24) + 1';
      nextBucketExpression = 'b.end_bucket + 1';
    } else {
      // Annual demo view → monthly buckets, so the restored release calendar
      // reads like a year of media and entertainment audience moments.
      truncFmt = "'MM'";
      labelFmt = "'YYYY-MM'";
      bucketExpression = 'ADD_MONTHS(start_bucket, LEVEL - 1)';
      bucketCountSql = 'FLOOR(MONTHS_BETWEEN(end_bucket, start_bucket)) + 1';
      nextBucketExpression = 'ADD_MONTHS(b.end_bucket, 1)';
    }

    const result = await db.execute(`
      WITH bounds AS (
        SELECT
          TRUNC(CAST(MAX(posted_at) AS DATE), ${truncFmt}) AS end_bucket,
          TRUNC(CAST(MAX(posted_at) AS DATE) - (:hours / 24), ${truncFmt}) AS start_bucket
        FROM social_posts
      ),
      bucket_series AS (
        SELECT ${bucketExpression} AS bucket_start
        FROM bounds
        WHERE start_bucket IS NOT NULL
        CONNECT BY LEVEL <= ${bucketCountSql}
      ),
      signal_counts AS (
        SELECT
          TRUNC(CAST(sp.posted_at AS DATE), ${truncFmt}) AS bucket_start,
          COUNT(*) AS post_count,
          SUM(sp.likes_count) AS total_likes,
          SUM(sp.shares_count) AS total_shares,
          ROUND(AVG(sp.sentiment_score), 3) AS avg_sentiment,
          COUNT(CASE WHEN sp.momentum_flag IN ('viral','mega_viral') THEN 1 END) AS viral_count
        FROM social_posts sp
        CROSS JOIN bounds b
        WHERE sp.posted_at >= CAST(b.start_bucket AS TIMESTAMP)
          AND sp.posted_at < CAST(${nextBucketExpression} AS TIMESTAMP)
        GROUP BY TRUNC(CAST(sp.posted_at AS DATE), ${truncFmt})
      )
      SELECT
        TO_CHAR(bs.bucket_start, ${labelFmt}) AS hour_bucket,
        NVL(sc.post_count, 0) AS post_count,
        NVL(sc.total_likes, 0) AS total_likes,
        NVL(sc.total_shares, 0) AS total_shares,
        sc.avg_sentiment,
        NVL(sc.viral_count, 0) AS viral_count
      FROM bucket_series bs
      LEFT JOIN signal_counts sc ON sc.bucket_start = bs.bucket_start
      ORDER BY bs.bucket_start
    `, { hours });

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

// GET /api/dashboard/inmemory — measured In-Memory population and cursor proof only
router.get('/inmemory', async (req, res) => {
  try {
    const generationId = req.activeGenerationId;
    if (!generationId) {
      throw new Error('Active Media generation is unavailable');
    }
    const verified = await db.withUserConnection(
      'admin_jess',
      async ({ connection }) => {
        const segmentInventory =
          await collectExactInMemorySegmentInventory(connection);
        const proof = await executeWithExactPlanEvidence(connection, {
          generationId,
          feature: 'INMEMORY_API',
          sql: `
            SELECT /*+ GATHER_PLAN_STATISTICS FULL(customer) NO_INDEX(customer) */
                   :generationId proof_generation_id,
                   customer.customer_tier,
                   COUNT(*) customer_count,
                   SUM(customer.lifetime_value) total_lifetime_value
            FROM customers customer
            GROUP BY customer.customer_tier
          `,
          binds: { generationId },
          persist: false,
          requiredPlan: (row) => (
            row.OPERATION === 'TABLE ACCESS'
            && row.OPTIONS === 'INMEMORY FULL'
            && String(row.OBJECT_NAME || '').toUpperCase() === 'CUSTOMERS'
          ),
          requiredInMemoryTableName: 'CUSTOMERS',
          inMemorySegmentInventory: segmentInventory,
          requireNonEmptyResult: true,
        });
        return { segmentInventory, proof };
      }
    );
    const evidence = verified.proof.evidence;
    const representativeResult = evidence.representativeResult;
    if (!representativeResult?.customerTier
        || representativeResult.customerCount == null
        || representativeResult.totalLifetimeValue == null) {
      throw new Error(
        'Current-generation In-Memory representative result is unavailable'
      );
    }
    res.json(verified.segmentInventory.map((row) => ({
      ...row,
      SOURCE: 'V$IM_SEGMENTS',
      IS_ESTIMATED: false,
      GENERATION_ID: generationId,
      PLAN_PROOF_OPERATION: evidence.operation,
      PLAN_PROOF_OPTIONS: evidence.options,
      PLAN_PROOF_OBJECT: evidence.objectName,
      PLAN_PROOF_SQL_ID: evidence.sqlId,
      PLAN_PROOF_CHILD_NUMBER: evidence.childNumber,
      PLAN_PROOF_HASH: evidence.planHashValue,
      PLAN_PROOF_RESULT_ROWS: evidence.resultRowCount,
      EXPECTED_TABLE_NAME: evidence.expectedTableName,
      NO_FORBIDDEN_FULL_SCAN: evidence.noForbiddenFullScan,
      representativeResult: {
        generationId: representativeResult.generationId,
        customerTier: representativeResult.customerTier,
        customerCount: representativeResult.customerCount,
        totalLifetimeValue: representativeResult.totalLifetimeValue,
      },
    })));
  } catch (err) {
    console.error('In-Memory stats error:', err);
    return featureUnavailable(res, {
      feature: 'INMEMORY',
      source: 'V$IM_SEGMENTS + APP_FEATURE_EXECUTION_EVIDENCE',
      message: 'Oracle Database In-Memory execution is unavailable.',
    });
  }
});

// GET /api/dashboard/native-json-audit-evidence
// Current active-generation Native JSON execution plus correlated Unified Audit.
router.get('/native-json-audit-evidence', async (_req, res) => {
  try {
    const result = await db.executeSystem(`
      SELECT job.candidate_generation_id generation_id,
             readiness.status readiness_status,
             JSON_VALUE(
               readiness.readiness,
               '$.unifiedAuditDeniedReturnCode' RETURNING NUMBER
             ) denied_return_code,
             JSON_VALUE(
               readiness.readiness,
               '$.unifiedAuditTargetUnchanged'
             ) audit_target_unchanged,
             (SELECT COUNT(*) FROM products) product_count,
             (SELECT COUNT(*) FROM product_attributes
               WHERE JSON_VALUE(attributes, '$.sku') IS NOT NULL
                 AND JSON_EXISTS(attributes, '$.contentType')) native_json_product_count,
             (SELECT COUNT(*) FROM event_stream
               WHERE JSON_EXISTS(event_data, '$.datasetVersion')) native_json_event_count,
             (SELECT COUNT(*) FROM social_posts) social_post_count,
             (SELECT COUNT(*) FROM social_post_payloads
               WHERE JSON_VALUE(raw_payload, '$.postId') IS NOT NULL
                 AND JSON_EXISTS(enrichments, '$.momentum')) social_payload_count,
             (SELECT JSON_SERIALIZE(event_data RETURNING CLOB)
                FROM event_stream
               WHERE JSON_EXISTS(event_data, '$.datasetVersion')
               ORDER BY created_at DESC FETCH FIRST 1 ROW ONLY) executed_json_result,
             (SELECT COUNT(*) FROM SYSTEM.media_unified_audit_evidence_v audit_evidence
               WHERE audit_evidence.sql_text LIKE
                       '%MEDIA_AUDIT_ALLOWED_' ||
                       ${auditGenerationTokenSql('job.candidate_generation_id')} || '%'
                 AND LOWER(client_identifier) = 'admin_jess'
                 AND RETURN_CODE = 0) allowed_action,
             (SELECT COUNT(*) FROM SYSTEM.media_unified_audit_evidence_v audit_evidence
               WHERE audit_evidence.sql_text LIKE
                       '%MEDIA_AUDIT_DENIED_' ||
                       ${auditGenerationTokenSql('job.candidate_generation_id')} || '%'
                 AND LOWER(client_identifier) = 'fm_west_maria'
                 AND RETURN_CODE = 28115) denied_action
      FROM app_dataset_readiness readiness
      JOIN app_dataset_jobs job ON job.job_id = readiness.job_id
      WHERE readiness.readiness_id = 1
    `);
    const row = result.rows?.[0] || {};
    const nativeJsonAvailable = row.READINESS_STATUS === 'ACTIVE'
      && Number(row.NATIVE_JSON_PRODUCT_COUNT || 0) === Number(row.PRODUCT_COUNT || 0)
      && Number(row.NATIVE_JSON_EVENT_COUNT || 0) > 0
      && Number(row.SOCIAL_PAYLOAD_COUNT || 0) === Number(row.SOCIAL_POST_COUNT || 0)
      && row.EXECUTED_JSON_RESULT;
    const unifiedAuditAvailable = row.READINESS_STATUS === 'ACTIVE'
      && Number(row.ALLOWED_ACTION || 0) > 0
      && Number(row.DENIED_ACTION || 0) > 0
      && Number(row.DENIED_RETURN_CODE || 0) === 28115
      && String(row.AUDIT_TARGET_UNCHANGED || '').toLowerCase() === 'true';
    if (!nativeJsonAvailable) {
      return featureUnavailable(res, {
        feature: 'NATIVE_JSON',
        source: 'JSON_VALUE + JSON_EXISTS + JSON_SERIALIZE',
        message: 'Current-generation Native JSON evidence is unavailable.',
      });
    }
    if (!unifiedAuditAvailable) {
      return featureUnavailable(res, {
        feature: 'UNIFIED_AUDIT',
        source: 'UNIFIED_AUDIT_TRAIL',
        message: 'Current-generation Unified Audit evidence is unavailable.',
      });
    }
    res.json({
      generationId: row.GENERATION_ID,
      readinessStatus: row.READINESS_STATUS,
      nativeJson: {
        productCount: Number(row.NATIVE_JSON_PRODUCT_COUNT),
        eventCount: Number(row.NATIVE_JSON_EVENT_COUNT),
        socialPayloadCount: Number(row.SOCIAL_PAYLOAD_COUNT),
        executedOperator: 'JSON_VALUE + JSON_EXISTS + JSON_SERIALIZE',
        executedResult: row.EXECUTED_JSON_RESULT,
      },
      unifiedAudit: {
        allowedAction: Number(row.ALLOWED_ACTION),
        deniedAction: Number(row.DENIED_ACTION),
        correlatedIdentities: ['admin_jess', 'fm_west_maria'],
        denialOracle: 'ORA-28115',
        unifiedAuditDeniedReturnCode: Number(row.DENIED_RETURN_CODE),
        unifiedAuditTargetUnchanged: true,
      },
    });
  } catch (error) {
    console.error('Native JSON / Unified Audit evidence error:', error);
    const failedFeature = /AUDIT/i.test(String(error?.message || ''))
      ? 'UNIFIED_AUDIT'
      : 'NATIVE_JSON';
    return featureUnavailable(res, {
      feature: failedFeature,
      source: failedFeature === 'UNIFIED_AUDIT'
        ? 'UNIFIED_AUDIT_TRAIL'
        : 'JSON_VALUE + JSON_EXISTS + JSON_SERIALIZE',
      message: `Current-generation ${failedFeature === 'UNIFIED_AUDIT'
        ? 'Unified Audit'
        : 'Native JSON'} evidence is unavailable.`,
    });
  }
});

module.exports = router;
