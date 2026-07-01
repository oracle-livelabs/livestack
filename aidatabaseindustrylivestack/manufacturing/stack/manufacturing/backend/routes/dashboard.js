/**
 * Dashboard API — Aggregated metrics for the main dashboard
 *
 * Uses data-relative timestamps (MAX observed_at / created_at) instead of
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
        (SELECT COUNT(*) FROM manufacturing_work_orders) AS work_orders_total,
        (SELECT COUNT(*) FROM manufacturing_work_orders WHERE created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '7' DAY) AS work_orders_7d,
        (SELECT COUNT(*) FROM manufacturing_work_orders WHERE created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '30' DAY) AS work_orders_30d,
        (SELECT NVL(SUM(work_order_value), 0) FROM manufacturing_work_orders) AS work_order_value_total,
        (SELECT NVL(SUM(work_order_value), 0) FROM manufacturing_work_orders WHERE created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '7' DAY) AS work_order_value_7d,
        (SELECT NVL(SUM(work_order_value), 0) FROM manufacturing_work_orders WHERE created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '30' DAY) AS work_order_value_30d,
        (SELECT COUNT(*) FROM manufacturing_production_signals WHERE momentum_code IN ('escalating','critical')) AS critical_signals,
        (SELECT COUNT(*) FROM manufacturing_production_signals WHERE momentum_code = 'elevated') AS elevated_signals,
        (SELECT COUNT(*) FROM manufacturing_production_signals) AS signals_total,
        (SELECT COUNT(DISTINCT manufactured_part_id) FROM manufacturing_signal_part_mentions
         WHERE production_signal_id IN (SELECT production_signal_id FROM manufacturing_production_signals WHERE momentum_code IN ('escalating','critical'))) AS high_risk_parts,
        (SELECT COUNT(*) FROM agent_actions) AS agent_actions_total,
        (SELECT COUNT(*) FROM shipments WHERE ship_status = 'in_transit') AS shipments_in_transit,
        (SELECT ROUND(AVG(load_pct), 1)
         FROM (
           SELECT NVL(SUM(i.quantity_on_hand), 0) / NULLIF(fc.capacity_units, 0) * 100 AS load_pct
           FROM fulfillment_centers fc
           LEFT JOIN inventory i ON i.center_id = fc.center_id
           WHERE fc.is_active = 1
           GROUP BY fc.center_id, fc.capacity_units
         )) AS avg_oee_load_pct,
        (SELECT ROUND(LEAST(18,
                    2.5 + COUNT(CASE WHEN momentum_code IN ('escalating','critical') THEN 1 END)
                    / NULLIF(COUNT(*), 0) * 14), 1)
         FROM manufacturing_production_signals
         WHERE observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - INTERVAL '7' DAY) AS scrap_watch_pct,
        (SELECT NVL(SUM(oi.requested_units), 0)
         FROM manufacturing_work_order_lines oi
         JOIN manufacturing_work_orders o ON o.work_order_id = oi.work_order_id
         WHERE o.created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '7' DAY) AS throughput_units_7d,
        (SELECT ROUND(NVL(AVG((production_signal_factor - 1) * 100), 0), 1)
         FROM manufacturing_demand_forecasts
         WHERE forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7) AS demand_variance_pct,
        (SELECT ROUND(NVL(SUM(oi.requested_units), 0) / 7, 1)
         FROM manufacturing_work_order_lines oi
         JOIN manufacturing_work_orders o ON o.work_order_id = oi.work_order_id
         WHERE o.created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '7' DAY) AS production_rate_units_day
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
             COUNT(DISTINCT ppm.production_signal_id) AS signal_count,
             SUM(sp.acknowledgement_count) AS total_acknowledgements,
             SUM(sp.propagation_count) AS total_propagations,
             SUM(sp.observation_count) AS total_observations,
             ROUND(AVG(sp.urgency_score), 2) AS avg_urgency,
             MAX(sp.momentum_code) AS peak_momentum
      FROM products p
      JOIN brands b ON p.brand_id = b.brand_id
      JOIN manufacturing_signal_part_mentions ppm ON p.product_id = ppm.manufactured_part_id
      JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
      WHERE sp.observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - INTERVAL '7' DAY
      ${whereExtra}
      GROUP BY p.product_id, p.product_name, p.category, p.unit_price,
               b.brand_name, b.social_tier
      ORDER BY avg_urgency DESC, total_observations DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds);

    res.json(result.rows);
  } catch (err) {
    console.error('High-demand manufactured parts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/signal-velocity?hours=48
router.get('/signal-velocity', async (req, res) => {
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
        TO_CHAR(TRUNC(observed_at, ${truncFmt}), ${labelFmt}) AS hour_bucket,
        COUNT(*) AS signal_count,
        SUM(acknowledgement_count) AS total_acknowledgements,
        SUM(propagation_count) AS total_propagations,
        ROUND(AVG(sentiment_score), 3) AS avg_sentiment,
        COUNT(CASE WHEN momentum_code IN ('escalating','critical') THEN 1 END) AS urgent_signal_count
      FROM manufacturing_production_signals
      -- NUMTODSINTERVAL handles the 8760-hour "1y" range without interval literal precision overflow.
      WHERE observed_at >= (SELECT MAX(observed_at) FROM manufacturing_production_signals) - NUMTODSINTERVAL(:hours, 'HOUR')
      GROUP BY TRUNC(observed_at, ${truncFmt})
      ORDER BY hour_bucket
    `, { hours });

    res.json(result.rows);
  } catch (err) {
    console.error('Production signal velocity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/work-order-value-by-category
router.get('/work-order-value-by-category', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT p.category,
             COUNT(DISTINCT o.work_order_id) AS work_order_count,
             SUM(oi.requested_units * oi.planned_unit_value) AS total_work_order_value,
             COUNT(DISTINCT CASE WHEN o.production_signal_id IS NOT NULL THEN o.work_order_id END) AS signal_influenced_work_orders
      FROM manufacturing_work_order_lines oi
      JOIN products p ON oi.manufactured_part_id = p.product_id
      JOIN manufacturing_work_orders o ON oi.work_order_id = o.work_order_id
      WHERE o.created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '30' DAY
      GROUP BY p.category
      ORDER BY total_work_order_value DESC
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
             COUNT(DISTINCT o.work_order_id) AS work_order_count,
             SUM(o.work_order_value) AS total_work_order_value,
             COUNT(DISTINCT CASE WHEN o.production_signal_id IS NOT NULL THEN o.work_order_id END) AS signal_influenced_work_orders
      FROM manufacturing_work_orders o
      JOIN customers c ON o.customer_account_id = c.customer_id
      WHERE o.created_at >= (SELECT MAX(created_at) FROM manufacturing_work_orders) - INTERVAL '30' DAY
        AND c.latitude IS NOT NULL
      GROUP BY c.city, c.state_province
      HAVING COUNT(DISTINCT o.work_order_id) >= 3
      ORDER BY work_order_count DESC
      FETCH FIRST 50 ROWS ONLY
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Demand map error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/inmemory — runtime proof for the In-Memory Column Store.
router.get('/inmemory', async (req, res) => {
  try {
    const evidence = await db.withUserConnection(req.demoUser, async ({ execute }) => {
      await execute('ALTER SESSION SET INMEMORY_QUERY = ENABLE');
      await execute('ALTER SESSION SET STATISTICS_LEVEL = ALL');
      await execute(`
        SELECT /*+ GATHER_PLAN_STATISTICS FULL(signal) NO_INDEX(signal) */
               /* MANUFACTURING_INMEMORY_PROOF */
               signal.momentum_code,
               COUNT(*) AS signal_count,
               SUM(signal.observation_count) AS total_observations,
               ROUND(AVG(signal.urgency_score), 2) AS average_urgency
        FROM manufacturing_production_signals signal
        GROUP BY signal.momentum_code
      `);
      const sqlIdResult = await execute(`
        SELECT prev_sql_id AS sql_id
        FROM sys.v_$session
        WHERE audsid = SYS_CONTEXT('USERENV', 'SESSIONID')
      `);
      const sqlId = sqlIdResult.rows?.[0]?.SQL_ID || null;
      const planResult = sqlId
        ? await execute(`
            SELECT plan_table_output
            FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sqlId, NULL, 'BASIC'))
          `, { sqlId })
        : { rows: [] };
      const planLines = (planResult.rows || []).map((row) => row.PLAN_TABLE_OUTPUT || '').filter(Boolean);
      const planUsedInMemory = /TABLE ACCESS\s+INMEMORY FULL/i.test(planLines.join('\n'));

      const statusResult = await execute('SELECT * FROM manufacturing_inmemory_status_v');
      const segmentsResult = await execute(`
          SELECT segment_name,
                 table_inmemory,
                 inmemory_priority,
                 inmemory_compression,
                 populate_status,
                 disk_bytes,
                 inmemory_bytes,
                 bytes_not_populated
          FROM manufacturing_inmemory_segments_v
          ORDER BY segment_name
        `);
      return {
        status: statusResult.rows?.[0] || null,
        segments: segmentsResult.rows || [],
        sameConnectionPlan: { sqlId, planLines, usedInMemory: planUsedInMemory },
      };
    });

    const status = evidence.status;
    if (!status) {
      return res.status(503).json({
        error: 'Oracle In-Memory runtime evidence is unavailable',
        evidenceStatus: 'UNAVAILABLE',
      });
    }

    const active = status.EVIDENCE_STATUS === 'ACTIVE';
    return res.json({
      evidenceStatus: status.EVIDENCE_STATUS,
      active,
      evidenceSources: ['V$PARAMETER', 'V$INMEMORY_AREA', 'V$IM_SEGMENTS', 'V$SQL_PLAN'],
      inmemoryOption: status.INMEMORY_OPTION,
      databaseInmemorySizeBytes: status.DATABASE_INMEMORY_SIZE_BYTES,
      inmemoryForce: status.INMEMORY_FORCE,
      inmemoryQuery: status.INMEMORY_QUERY,
      areaAllocatedBytes: status.AREA_ALLOCATED_BYTES,
      areaUsedBytes: status.AREA_USED_BYTES,
      expectedSegmentCount: status.EXPECTED_SEGMENT_COUNT,
      populatedSegmentCount: status.POPULATED_SEGMENT_COUNT,
      bytesNotPopulated: status.BYTES_NOT_POPULATED,
      planProof: {
        sqlId: status.PLAN_PROOF_SQL_ID,
        operation: status.PLAN_PROOF_OPERATION,
      },
      requestPlan: evidence.sameConnectionPlan,
      segments: evidence.segments,
    });
  } catch (err) {
    console.error('In-Memory stats error:', err);
    res.status(503).json({
      error: 'Oracle In-Memory runtime evidence is unavailable',
      detail: err.message,
      evidenceStatus: 'UNAVAILABLE',
    });
  }
});

module.exports = router;
