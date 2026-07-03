/**
 * Oracle Machine Learning (OML) Analytics API
 *
 * Uses Oracle DBMS_DATA_MINING — trained, persisted in-database ML models:
 *   DEMAND_SURGE_MODEL      — Random Forest Classification (product surge detection)
 *   CUSTOMER_SEGMENT_MODEL  — K-Means Clustering (RFM customer segmentation)
 *   REVENUE_PREDICT_MODEL   — GLM Regression (order revenue prediction)
 *   PRODUCT_CLUSTER_MODEL   — K-Means Clustering (manufactured part grouping by operational behavior)
 *
 * Scoring functions: PREDICTION(), PREDICTION_PROBABILITY(), CLUSTER_ID(), CLUSTER_PROBABILITY()
 * All computation runs inside Oracle AI Database 26ai — no external ML framework.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

const REQUIRED_ML_MODELS = Object.freeze([
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
]);

function isMissingMlAssetError(err) {
  if (err?.code === 'OML_MODEL_UNAVAILABLE') return true;
  const message = String(err?.message || '');
  return /ORA-40216|ORA-40284|ORA-00942/i.test(message)
    && /(model does not exist|DEMAND_SURGE_MODEL|CUSTOMER_SEGMENT_MODEL|REVENUE_PREDICT_MODEL|PRODUCT_CLUSTER_MODEL|OML_DEMAND_TRAINING_V|OML_CUSTOMER_RFM_V|OML_REVENUE_TRAINING_V|OML_PRODUCT_CLUSTER_V|PRODUCT_CLUSTER_SETTINGS)/i.test(message);
}

async function inspectMiningModels(requiredModels) {
  const models = [...new Set(requiredModels.map((name) => String(name).toUpperCase()))];
  const binds = {};
  const placeholders = models.map((name, index) => {
    const bindName = `model${index}`;
    binds[bindName] = name;
    return `:${bindName}`;
  });
  const result = await db.execute(`
    SELECT model_name, mining_function, algorithm
    FROM   user_mining_models
    WHERE  model_name IN (${placeholders.join(', ')})
    ORDER  BY model_name
  `, binds);
  const availableModels = result.rows.map((row) => row.MODEL_NAME);
  const availableSet = new Set(availableModels);
  return {
    requiredModels: models,
    availableModels,
    missingModels: models.filter((name) => !availableSet.has(name)),
  };
}

async function requireMiningModels(requiredModels) {
  const modelState = await inspectMiningModels(requiredModels);
  if (modelState.missingModels.length > 0) {
    const error = new Error(`Required Oracle mining models are unavailable: ${modelState.missingModels.join(', ')}`);
    error.code = 'OML_MODEL_UNAVAILABLE';
    error.modelState = modelState;
    throw error;
  }
  return modelState;
}

function unavailablePayload(label, err, modelState) {
  const missingModels = modelState?.missingModels || [];
  const missingModelState = missingModels.length > 0;
  const oracleError = String(err?.message || '').match(/ORA-\d{5}/i)?.[0]?.toUpperCase() || null;
  return {
    error: missingModelState
      ? `Required Oracle DBMS_DATA_MINING model${missingModels.length === 1 ? '' : 's'} unavailable: ${missingModels.join(', ')}`
      : 'Required Oracle OML runtime asset is unavailable.',
    code: missingModelState ? 'OML_MODEL_UNAVAILABLE' : 'OML_ASSET_UNAVAILABLE',
    status: 'unavailable',
    endpoint: label,
    oracleFeature: 'DBMS_DATA_MINING',
    requiredModels: modelState?.requiredModels || [],
    availableModels: modelState?.availableModels || [],
    missingModels,
    modelStateSource: 'USER_MINING_MODELS',
    ...(oracleError ? { oracleError } : {}),
  };
}

async function handleMlRouteError(res, label, err, requiredModels) {
  if (isMissingMlAssetError(err)) {
    try {
      const modelState = err.modelState || await inspectMiningModels(requiredModels);
      const payload = unavailablePayload(label, err, modelState);
      console.warn(`${label} unavailable:`, payload);
      return res.status(503).json(payload);
    } catch (stateErr) {
      console.error(`${label} model-state inspection error:`, stateErr);
      return res.status(500).json({ error: stateErr.message, code: 'OML_MODEL_STATE_CHECK_FAILED' });
    }
  }

  console.error(`${label} error:`, err);
  return res.status(500).json({ error: err.message });
}


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/demand-forecast
//
// Scores products using the DEMAND_SURGE_MODEL (Random Forest, 50 trees).
// Training features: production signal activity, urgency, acknowledgements, propagations, observations, and order value.
// Returns PREDICTION() label + PREDICTION_PROBABILITY() confidence.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/demand-forecast', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const lookbackHours = Math.min(parseInt(req.query.hours) || 720, 2160);
    await requireMiningModels(['DEMAND_SURGE_MODEL']);

    const result = await db.execute(`
      WITH product_features AS (
        SELECT /*+ NO_PARALLEL */
               p.product_id,
               p.product_name,
               p.category,
               b.brand_name,
               b.social_tier,
               p.unit_price,
               NVL(eng.PRODUCTION_SIGNAL_COUNT, 0)      AS production_signal_count,
               NVL(eng.AVG_SENTIMENT, 0.5)   AS avg_sentiment,
               NVL(eng.TOTAL_ACKNOWLEDGEMENTS, 0)       AS total_acknowledgements,
               NVL(eng.TOTAL_PROPAGATIONS, 0)      AS total_propagations,
               NVL(eng.TOTAL_OBSERVATIONS, 0)       AS total_observations,
               NVL(eng.AVERAGE_URGENCY_SCORE, 0)      AS average_urgency_score,
               NVL(eng.ESCALATING_SIGNAL_COUNT, 0)       AS escalating_signal_count,
               NVL(eng.ELEVATED_SIGNAL_COUNT, 0)      AS elevated_signal_count,
               NVL(sales.UNITS_SOLD, 0)      AS units_sold,
               NVL(sales.REVENUE, 0)         AS revenue,
               eng.PEAK_MOMENTUM
        FROM products p
        JOIN brands b ON b.brand_id = p.brand_id
        LEFT JOIN (
            SELECT ppm.MANUFACTURED_PART_ID,
                   COUNT(*) AS PRODUCTION_SIGNAL_COUNT,
                   AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
                   SUM(sp.ACKNOWLEDGEMENT_COUNT) AS TOTAL_ACKNOWLEDGEMENTS,
                   SUM(sp.PROPAGATION_COUNT) AS TOTAL_PROPAGATIONS,
                   SUM(sp.OBSERVATION_COUNT) AS TOTAL_OBSERVATIONS,
                   AVG(sp.URGENCY_SCORE) AS AVERAGE_URGENCY_SCORE,
                   SUM(CASE WHEN sp.MOMENTUM_CODE IN ('escalating', 'critical') THEN 1 ELSE 0 END) AS ESCALATING_SIGNAL_COUNT,
                   SUM(CASE WHEN sp.MOMENTUM_CODE = 'elevated' THEN 1 ELSE 0 END) AS ELEVATED_SIGNAL_COUNT,
                   MAX(sp.MOMENTUM_CODE) AS PEAK_MOMENTUM
            FROM MANUFACTURING_SIGNAL_PART_MENTIONS ppm
            JOIN MANUFACTURING_PRODUCTION_SIGNALS sp ON ppm.PRODUCTION_SIGNAL_ID = sp.PRODUCTION_SIGNAL_ID
            WHERE CAST(sp.OBSERVED_AT AS DATE) >= SYSDATE - :lookback / 24
            GROUP BY ppm.MANUFACTURED_PART_ID
        ) eng ON p.PRODUCT_ID = eng.MANUFACTURED_PART_ID
        LEFT JOIN (
            SELECT oi.MANUFACTURED_PART_ID,
                   SUM(oi.REQUESTED_UNITS) AS UNITS_SOLD,
                   SUM(oi.LINE_VALUE) AS REVENUE
            FROM MANUFACTURING_WORK_ORDER_LINES oi
            JOIN MANUFACTURING_WORK_ORDERS o ON o.WORK_ORDER_ID = oi.WORK_ORDER_ID
            WHERE CAST(o.CREATED_AT AS DATE) >= SYSDATE - :lookback / 24
            GROUP BY oi.MANUFACTURED_PART_ID
        ) sales ON p.PRODUCT_ID = sales.MANUFACTURED_PART_ID
        WHERE p.IS_ACTIVE = 1
      )
      SELECT
        pf.product_id,
        pf.product_name,
        pf.category,
        pf.brand_name,
        pf.social_tier,
        pf.unit_price,
        pf.production_signal_count      AS recent_mentions,
        ROUND(pf.average_urgency_score, 1) AS average_urgency_score,
        pf.total_acknowledgements,
        pf.total_propagations,
        pf.total_observations,
        pf.units_sold        AS orders_recent,
        pf.peak_momentum,

        -- Oracle DBMS_DATA_MINING: Random Forest scoring
        PREDICTION(DEMAND_SURGE_MODEL USING
          pf.category       AS category,
          pf.unit_price     AS unit_price,
          pf.production_signal_count    AS production_signal_count,
          pf.avg_sentiment  AS avg_sentiment,
          pf.total_acknowledgements    AS total_acknowledgements,
          pf.total_propagations   AS total_propagations,
          pf.total_observations    AS total_observations,
          pf.average_urgency_score   AS average_urgency_score,
          pf.escalating_signal_count    AS escalating_signal_count,
          pf.elevated_signal_count   AS elevated_signal_count,
          pf.units_sold     AS units_sold,
          pf.revenue        AS revenue
        ) AS predicted_surge,

        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          pf.category       AS category,
          pf.unit_price     AS unit_price,
          pf.production_signal_count    AS production_signal_count,
          pf.avg_sentiment  AS avg_sentiment,
          pf.total_acknowledgements    AS total_acknowledgements,
          pf.total_propagations   AS total_propagations,
          pf.total_observations    AS total_observations,
          pf.average_urgency_score   AS average_urgency_score,
          pf.escalating_signal_count    AS escalating_signal_count,
          pf.elevated_signal_count   AS elevated_signal_count,
          pf.units_sold     AS units_sold,
          pf.revenue        AS revenue
        ) * 100, 1) AS surge_probability,

        -- Predicted demand: units × probability-weighted multiplier
        GREATEST(0, ROUND(
          pf.units_sold * (1 + PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
            pf.category AS category, pf.unit_price AS unit_price,
            pf.production_signal_count AS production_signal_count, pf.avg_sentiment AS avg_sentiment,
            pf.total_acknowledgements AS total_acknowledgements, pf.total_propagations AS total_propagations,
            pf.total_observations AS total_observations, pf.average_urgency_score AS average_urgency_score,
            pf.escalating_signal_count AS escalating_signal_count, pf.elevated_signal_count AS elevated_signal_count,
            pf.units_sold AS units_sold, pf.revenue AS revenue
          ) * 2.5)
          + pf.production_signal_count * 0.5
        , 0)) AS predicted_unit_demand,

        -- Uplift % based on surge probability
        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          pf.category AS category, pf.unit_price AS unit_price,
          pf.production_signal_count AS production_signal_count, pf.avg_sentiment AS avg_sentiment,
          pf.total_acknowledgements AS total_acknowledgements, pf.total_propagations AS total_propagations,
          pf.total_observations AS total_observations, pf.average_urgency_score AS average_urgency_score,
          pf.escalating_signal_count AS escalating_signal_count, pf.elevated_signal_count AS elevated_signal_count,
          pf.units_sold AS units_sold, pf.revenue AS revenue
        ) * 100, 1) AS uplift_pct,

        -- Confidence = surge probability
        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          pf.category AS category, pf.unit_price AS unit_price,
          pf.production_signal_count AS production_signal_count, pf.avg_sentiment AS avg_sentiment,
          pf.total_acknowledgements AS total_acknowledgements, pf.total_propagations AS total_propagations,
          pf.total_observations AS total_observations, pf.average_urgency_score AS average_urgency_score,
          pf.escalating_signal_count AS escalating_signal_count, pf.elevated_signal_count AS elevated_signal_count,
          pf.units_sold AS units_sold, pf.revenue AS revenue
        ) * 100, 0) AS confidence_pct,

        -- Revenue opportunity
        GREATEST(0, ROUND(
          (pf.units_sold * (1 + PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
            pf.category AS category, pf.unit_price AS unit_price,
            pf.production_signal_count AS production_signal_count, pf.avg_sentiment AS avg_sentiment,
            pf.total_acknowledgements AS total_acknowledgements, pf.total_propagations AS total_propagations,
            pf.total_observations AS total_observations, pf.average_urgency_score AS average_urgency_score,
            pf.escalating_signal_count AS escalating_signal_count, pf.elevated_signal_count AS elevated_signal_count,
            pf.units_sold AS units_sold, pf.revenue AS revenue
          ) * 2.5) + pf.production_signal_count * 0.5)
          * pf.unit_price
        , 2)) AS revenue_opportunity

      FROM product_features pf
      WHERE pf.production_signal_count > 0
      ORDER BY surge_probability DESC, average_urgency_score DESC
      FETCH FIRST :limit ROWS ONLY
    `, { lookback: lookbackHours, limit });

    res.json({
      products: result.rows,
      meta: {
        lookback_hours: lookbackHours,
        model: 'DEMAND_SURGE_MODEL (Random Forest, 50 trees)',
        algorithm: 'ALGO_RANDOM_FOREST',
        scoring: 'PREDICTION() / PREDICTION_PROBABILITY()',
        features: ['category', 'unit_price', 'production_signal_count', 'avg_sentiment', 'total_acknowledgements',
                   'total_propagations', 'total_observations', 'average_urgency_score', 'escalating_signal_count', 'elevated_signal_count',
                   'units_sold', 'revenue'],
        engine: 'Oracle DBMS_DATA_MINING — in-database Random Forest',
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML demand-forecast', err, ['DEMAND_SURGE_MODEL']);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/customer-segments
//
// Scores customers using CUSTOMER_SEGMENT_MODEL (K-Means, 4 clusters).
// Training features: lifetime_value, recency_days, frequency, monetary, avg_order_value.
// Returns CLUSTER_ID() assignment + CLUSTER_PROBABILITY() confidence.
// Also computes RFM quartiles via NTILE for labeling.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/customer-segments', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    await requireMiningModels(['CUSTOMER_SEGMENT_MODEL']);

    const result = await db.execute(`
      WITH customer_metrics AS (
        SELECT /*+ NO_PARALLEL */
               c.customer_id,
               c.first_name || ' ' || c.last_name              AS full_name,
               c.city,
               c.state_province                                  AS state,
               c.lifetime_value,
               NVL(rfm.RECENCY_DAYS, 999)                       AS recency_days,
               NVL(rfm.FREQUENCY, 0)                             AS frequency,
               NVL(rfm.MONETARY, 0)                              AS monetary,
               NVL(rfm.AVG_ORDER_VALUE, 0)                       AS avg_order_value,
               NVL(rfm.TOTAL_ITEMS, 0)                           AS total_items,
               rfm.FREQUENCY                                     AS order_count,
               rfm.MONETARY                                      AS total_spent,
               rfm.RECENCY_DAYS                                  AS days_since_last_order
        FROM customers c
        LEFT JOIN (
            SELECT o.CUSTOMER_ACCOUNT_ID,
                   ROUND(SYSDATE - CAST(MAX(o.CREATED_AT) AS DATE)) AS RECENCY_DAYS,
                   COUNT(DISTINCT o.WORK_ORDER_ID) AS FREQUENCY,
                   SUM(o.WORK_ORDER_VALUE) AS MONETARY,
                   AVG(o.WORK_ORDER_VALUE) AS AVG_ORDER_VALUE,
                   NVL(SUM(oi_cnt.ITEM_COUNT), 0) AS TOTAL_ITEMS
            FROM MANUFACTURING_WORK_ORDERS o
            LEFT JOIN (
                SELECT WORK_ORDER_ID, SUM(REQUESTED_UNITS) AS ITEM_COUNT
                FROM MANUFACTURING_WORK_ORDER_LINES GROUP BY WORK_ORDER_ID
            ) oi_cnt ON o.WORK_ORDER_ID = oi_cnt.WORK_ORDER_ID
            GROUP BY o.CUSTOMER_ACCOUNT_ID
        ) rfm ON c.CUSTOMER_ID = rfm.CUSTOMER_ACCOUNT_ID
      )
      SELECT
        cm.customer_id,
        cm.full_name,
        cm.city,
        cm.state,
        NVL(cm.order_count, 0)          AS order_count,
        ROUND(NVL(cm.total_spent, 0), 2) AS total_spent,
        ROUND(cm.avg_order_value, 2)     AS avg_order_value,
        NVL(cm.days_since_last_order, 999) AS days_since_last_order,

        -- Oracle DBMS_DATA_MINING: K-Means cluster assignment
        CLUSTER_ID(CUSTOMER_SEGMENT_MODEL USING
          cm.lifetime_value  AS lifetime_value,
          cm.recency_days    AS recency_days,
          cm.frequency       AS frequency,
          cm.monetary        AS monetary,
          cm.avg_order_value AS avg_order_value,
          cm.total_items     AS total_items
        ) AS oml_cluster_id,

        ROUND(CLUSTER_PROBABILITY(CUSTOMER_SEGMENT_MODEL USING
          cm.lifetime_value  AS lifetime_value,
          cm.recency_days    AS recency_days,
          cm.frequency       AS frequency,
          cm.monetary        AS monetary,
          cm.avg_order_value AS avg_order_value,
          cm.total_items     AS total_items
        ), 3) AS cluster_probability,

        -- RFM quartile scores for labeling
        NTILE(4) OVER (ORDER BY cm.recency_days ASC)   AS recency_score,
        NTILE(4) OVER (ORDER BY cm.frequency DESC)     AS frequency_score,
        NTILE(4) OVER (ORDER BY cm.monetary DESC)      AS monetary_score,

        -- Segment label derived from OML cluster + RFM
        CASE
          WHEN NTILE(4) OVER (ORDER BY cm.recency_days ASC) = 4
           AND NTILE(4) OVER (ORDER BY cm.frequency DESC) >= 3
           AND NTILE(4) OVER (ORDER BY cm.monetary DESC) >= 3 THEN 'Champion'
          WHEN NTILE(4) OVER (ORDER BY cm.recency_days ASC) >= 3
           AND NTILE(4) OVER (ORDER BY cm.frequency DESC) >= 3 THEN 'Loyal'
          WHEN NTILE(4) OVER (ORDER BY cm.recency_days ASC) = 4
           AND NTILE(4) OVER (ORDER BY cm.frequency DESC) <= 2 THEN 'New Customer'
          WHEN NTILE(4) OVER (ORDER BY cm.recency_days ASC) <= 2
           AND NTILE(4) OVER (ORDER BY cm.monetary DESC) = 4 THEN 'At Risk'
          WHEN NTILE(4) OVER (ORDER BY cm.recency_days ASC) = 1
           AND NTILE(4) OVER (ORDER BY cm.frequency DESC) <= 2 THEN 'Lost'
          WHEN NTILE(4) OVER (ORDER BY cm.monetary DESC) = 4
           AND NTILE(4) OVER (ORDER BY cm.recency_days ASC) >= 2 THEN 'Big Spender'
          WHEN NTILE(4) OVER (ORDER BY cm.recency_days ASC) >= 3
           AND NTILE(4) OVER (ORDER BY cm.monetary DESC) <= 2 THEN 'Promising'
          ELSE 'Potential'
        END AS segment,

        -- Churn risk
        CASE
          WHEN NVL(cm.days_since_last_order, 999) > 60 THEN 'High'
          WHEN NVL(cm.days_since_last_order, 999) > 30 THEN 'Medium'
          ELSE 'Low'
        END AS churn_risk,

        -- Predicted LTV
        ROUND(cm.avg_order_value * GREATEST(1,
          NVL(cm.frequency, 0) / NULLIF(cm.recency_days, 0) * 365
        ), 2) AS predicted_ltv

      FROM customer_metrics cm
      WHERE cm.frequency > 0
      ORDER BY total_spent DESC
      FETCH FIRST :limit ROWS ONLY
    `, { limit });

    // Roll up segment counts
    const segMap = {};
    result.rows.forEach(r => {
      const seg = r.SEGMENT;
      if (!segMap[seg]) {
        segMap[seg] = { segment: seg, count: 0, total_revenue: 0, avg_rfm: 0, churn_high: 0 };
      }
      segMap[seg].count++;
      segMap[seg].total_revenue += Number(r.TOTAL_SPENT) || 0;
      segMap[seg].avg_rfm += (Number(r.RECENCY_SCORE) || 0) + (Number(r.FREQUENCY_SCORE) || 0) + (Number(r.MONETARY_SCORE) || 0);
      if (r.CHURN_RISK === 'High') segMap[seg].churn_high++;
    });

    const segmentSummary = Object.values(segMap).map(s => ({
      ...s,
      total_revenue: Math.round(s.total_revenue * 100) / 100,
      avg_rfm: Math.round((s.avg_rfm / s.count) * 10) / 10,
    })).sort((a, b) => b.count - a.count);

    const churnDist = { High: 0, Medium: 0, Low: 0 };
    result.rows.forEach(r => { churnDist[r.CHURN_RISK] = (churnDist[r.CHURN_RISK] || 0) + 1; });

    res.json({
      customers: result.rows,
      segmentSummary,
      churnDistribution: Object.entries(churnDist).map(([risk, count]) => ({ risk, count })),
      total: result.rows.length,
      meta: {
        model: 'CUSTOMER_SEGMENT_MODEL (K-Means, 4 clusters)',
        algorithm: 'ALGO_KMEANS',
        scoring: 'CLUSTER_ID() / CLUSTER_PROBABILITY()',
        dimensions: ['lifetime_value', 'recency_days', 'frequency', 'monetary', 'avg_order_value', 'total_items'],
        engine: 'Oracle DBMS_DATA_MINING — in-database K-Means Clustering',
        clusters: segmentSummary.length,
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML customer-segments', err, ['CUSTOMER_SEGMENT_MODEL']);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/revenue-forecast
//
// Time-series revenue forecast using:
//   1. Oracle REGR_SLOPE/REGR_INTERCEPT/REGR_R2 for trend fitting
//   2. REVENUE_PREDICT_MODEL (GLM Regression) for per-order predictions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/revenue-forecast', async (req, res) => {
  try {
    const lookbackDays = Math.min(parseInt(req.query.days) || 30, 90);
    const forecastDays = Math.min(parseInt(req.query.forecast) || 7, 14);
    await requireMiningModels(['REVENUE_PREDICT_MODEL']);

    const histResult = await db.execute(`
      WITH daily_rev AS (
        SELECT /*+ NO_PARALLEL */
               TRUNC(CAST(created_at AS DATE), 'DD')            AS day_bucket,
               SUM(work_order_value)                                  AS revenue,
               COUNT(work_order_id)                                   AS order_count,
               AVG(work_order_value)                                  AS avg_order_value,
               ROW_NUMBER() OVER (
                 ORDER BY TRUNC(CAST(created_at AS DATE), 'DD')
               )                                                 AS rn
        FROM   manufacturing_work_orders
        WHERE  CAST(created_at AS DATE) >= SYSDATE - :lookback
        GROUP  BY TRUNC(CAST(created_at AS DATE), 'DD')
      ),
      params AS (
        SELECT
          REGR_SLOPE(revenue, rn)                                AS slope,
          REGR_INTERCEPT(revenue, rn)                            AS intercept,
          REGR_R2(revenue, rn)                                   AS r2,
          REGR_COUNT(revenue, rn)                                AS n_obs,
          AVG(revenue)                                           AS mean_revenue,
          STDDEV(revenue)                                        AS stddev_revenue,
          MAX(rn)                                                AS max_rn,
          CORR(revenue, rn)                                      AS correlation
        FROM daily_rev
      ),
      -- Oracle GLM model: predicted revenue per order
      glm_stats AS (
        SELECT
          ROUND(AVG(PREDICTION(REVENUE_PREDICT_MODEL USING
            CUSTOMER_TIER AS customer_tier,
            WORK_ORDER_STATUS_CODE AS work_order_status_code,
            DEMAND_URGENCY_SCORE AS demand_urgency_score,
            ROUTING_COST AS routing_cost,
            LINE_COUNT AS line_count,
            TOTAL_QUANTITY AS total_quantity,
            DISTINCT_PRODUCTS AS distinct_products,
            AVG_UNIT_PRICE AS avg_unit_price,
            MAX_UNIT_PRICE AS max_unit_price,
            LIFETIME_VALUE AS lifetime_value,
            CENTER_LOAD_PCT AS center_load_pct
          )), 2) AS avg_glm_predicted,
          ROUND(CORR(TARGET_REVENUE, PREDICTION(REVENUE_PREDICT_MODEL USING
            CUSTOMER_TIER AS customer_tier,
            WORK_ORDER_STATUS_CODE AS work_order_status_code,
            DEMAND_URGENCY_SCORE AS demand_urgency_score,
            ROUTING_COST AS routing_cost,
            LINE_COUNT AS line_count,
            TOTAL_QUANTITY AS total_quantity,
            DISTINCT_PRODUCTS AS distinct_products,
            AVG_UNIT_PRICE AS avg_unit_price,
            MAX_UNIT_PRICE AS max_unit_price,
            LIFETIME_VALUE AS lifetime_value,
            CENTER_LOAD_PCT AS center_load_pct
          )), 4) AS glm_correlation
        FROM OML_REVENUE_TRAINING_V
        WHERE ROWNUM <= 500
      )
      SELECT
        TO_CHAR(d.day_bucket, 'YYYY-MM-DD')                     AS day,
        ROUND(d.revenue, 2)                                      AS actual_revenue,
        d.order_count,
        ROUND(d.avg_order_value, 2)                              AS avg_order_value,
        ROUND(p.slope * d.rn + p.intercept, 2)                  AS trend_line,
        ROUND(AVG(d.revenue) OVER (
          ORDER BY d.rn ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ), 2)                                                    AS ma_7d,
        ROUND(p.r2, 4)                                           AS r_squared,
        ROUND(p.slope, 2)                                        AS daily_slope,
        ROUND(p.intercept, 2)                                    AS intercept,
        ROUND(p.mean_revenue, 2)                                 AS mean_revenue,
        ROUND(p.stddev_revenue, 2)                               AS stddev_revenue,
        ROUND(p.correlation, 4)                                  AS correlation,
        p.max_rn                                                 AS max_rn,
        g.avg_glm_predicted,
        g.glm_correlation,
        0                                                        AS is_forecast
      FROM   daily_rev d
      CROSS JOIN params p
      CROSS JOIN glm_stats g
      ORDER  BY d.day_bucket
    `, { lookback: lookbackDays });

    if (!histResult.rows.length) {
      return res.json({ historical: [], forecast: [], model: null });
    }

    const last = histResult.rows[histResult.rows.length - 1];
    const slope      = Number(last.DAILY_SLOPE)     || 0;
    const intercept  = Number(last.INTERCEPT)       || 0;
    const maxRn      = Number(last.MAX_RN)          || 0;
    const stddev     = Number(last.STDDEV_REVENUE)  || 0;

    const forecast = [];
    for (let i = 1; i <= forecastDays; i++) {
      const futureRn = maxRn + i;
      const predicted = Math.max(0, slope * futureRn + intercept);
      const ci = stddev * (1 + i * 0.07);
      const d = new Date();
      d.setDate(d.getDate() + i);

      forecast.push({
        DAY: d.toISOString().slice(0, 10),
        ACTUAL_REVENUE: null,
        ORDER_COUNT: null,
        AVG_ORDER_VALUE: null,
        TREND_LINE: Math.round(predicted * 100) / 100,
        MA_7D: null,
        CI_LOWER: Math.round(Math.max(0, predicted - ci) * 100) / 100,
        CI_UPPER: Math.round((predicted + ci) * 100) / 100,
        IS_FORECAST: 1,
      });
    }

    res.json({
      historical: histResult.rows,
      forecast,
      model: {
        type: 'GLM Regression (REVENUE_PREDICT_MODEL) + OLS Trend (REGR_SLOPE)',
        algorithm: 'ALGO_GENERALIZED_LINEAR_MODEL',
        engine: 'Oracle DBMS_DATA_MINING + REGR_SLOPE / REGR_R2',
        r_squared: Number(last.R_SQUARED),
        correlation: Number(last.CORRELATION),
        glm_correlation: Number(last.GLM_CORRELATION),
        avg_glm_predicted: Number(last.AVG_GLM_PREDICTED),
        daily_slope: slope,
        intercept,
        mean_daily_revenue: Number(last.MEAN_REVENUE),
        stddev: stddev,
        observations: maxRn,
        lookback_days: lookbackDays,
        forecast_days: forecastDays,
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML revenue-forecast', err, ['REVENUE_PREDICT_MODEL']);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/summary
// Quick stats for all four OML models
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    await requireMiningModels(REQUIRED_ML_MODELS);
    const [surgeCount, customers, modelCount, regr] = await Promise.all([
      // Count products predicted as SURGE by the Random Forest model
      db.execute(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT PRODUCT_ID,
            PREDICTION(DEMAND_SURGE_MODEL USING
              CATEGORY AS category,
              UNIT_PRICE AS unit_price,
              PRODUCTION_SIGNAL_COUNT AS production_signal_count,
              AVG_SENTIMENT AS avg_sentiment,
              TOTAL_ACKNOWLEDGEMENTS AS total_acknowledgements,
              TOTAL_PROPAGATIONS AS total_propagations,
              TOTAL_OBSERVATIONS AS total_observations,
              AVERAGE_URGENCY_SCORE AS average_urgency_score,
              ESCALATING_SIGNAL_COUNT AS escalating_signal_count,
              ELEVATED_SIGNAL_COUNT AS elevated_signal_count,
              UNITS_SOLD AS units_sold,
              REVENUE AS revenue
            ) AS pred
          FROM OML_DEMAND_TRAINING_V
        ) WHERE pred = 'SURGE'
      `),
      db.execute(`SELECT COUNT(*) AS cnt FROM customers`),
      // Count persisted OML models
      db.execute(`SELECT COUNT(*) AS cnt FROM user_mining_models WHERE algorithm != 'ONNX'`),
      db.execute(`SELECT /*+ NO_PARALLEL */
        ROUND(REGR_SLOPE(day_rev, rn), 2) AS slope,
        ROUND(REGR_R2(day_rev, rn), 4) AS r2
        FROM (
          SELECT SUM(work_order_value) AS day_rev,
                 ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE))) AS rn
          FROM manufacturing_work_orders WHERE CAST(created_at AS DATE) >= SYSDATE - 30
          GROUP BY TRUNC(CAST(created_at AS DATE))
        )`),
    ]);

    res.json({
      products_with_surge: Number(surgeCount.rows[0]?.CNT ?? 0),
      total_customers: Number(customers.rows[0]?.CNT ?? 0),
      rfm_segments: 8,
      revenue_slope: Number(regr.rows[0]?.SLOPE ?? 0),
      revenue_r2: Number(regr.rows[0]?.R2 ?? 0),
      models_active: Number(modelCount.rows[0]?.CNT ?? 0),
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML summary', err, REQUIRED_ML_MODELS);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/vector-clusters
//
// Scores with the PRODUCT_CLUSTER_MODEL created during provisioning.
// This GET route is read-only; model rebuilds belong to provisioning/Restore.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vector-clusters', async (req, res) => {
  try {
    const requestedK = Math.min(Math.max(parseInt(req.query.k) || 5, 2), 15);
    await requireMiningModels(['PRODUCT_CLUSTER_MODEL']);

    const [result, settingsResult] = await Promise.all([
      db.execute(`
        WITH clustered AS (
          SELECT
            pcv.PRODUCT_ID,
            CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING *) AS cluster_id,
            ROUND(CLUSTER_PROBABILITY(PRODUCT_CLUSTER_MODEL USING *), 4) AS cluster_prob,
            pcv.UNIT_PRICE,
            pcv.UNITS_SOLD,
            pcv.REVENUE AS product_revenue,
            pcv.TOTAL_SIGNAL_ACTIVITY,
            pcv.AVG_SENTIMENT,
            pcv.AVERAGE_URGENCY_SCORE
          FROM OML_PRODUCT_CLUSTER_V pcv
        )
        SELECT
          c.PRODUCT_ID,
          c.cluster_id,
          c.cluster_prob AS similarity,
          p.product_name,
          p.category,
          p.unit_price,
          b.brand_name,
          c.UNITS_SOLD,
          c.TOTAL_SIGNAL_ACTIVITY,
          FIRST_VALUE(p.product_name) OVER (
            PARTITION BY c.cluster_id ORDER BY c.cluster_prob DESC
          ) AS seed_name,
          FIRST_VALUE(c.PRODUCT_ID) OVER (
            PARTITION BY c.cluster_id ORDER BY c.cluster_prob DESC
          ) AS seed_id
        FROM clustered c
        JOIN products p ON c.PRODUCT_ID = p.PRODUCT_ID
        JOIN brands b   ON p.brand_id   = b.brand_id
        ORDER BY c.cluster_id, c.cluster_prob DESC
      `),
      db.execute(`
        SELECT TO_NUMBER(setting_value) AS configured_k
        FROM   product_cluster_settings
        WHERE  setting_name = 'CLUS_NUM_CLUSTERS'
      `),
    ]);

    // Group into clusters
    const clusterMap = {};
    result.rows.forEach(r => {
      const cid = r.CLUSTER_ID;
      if (!clusterMap[cid]) {
        clusterMap[cid] = {
          cluster_id: cid,
          centroid_product: r.SEED_NAME,
          centroid_product_id: r.SEED_ID,
          products: [],
          categories: {},
          total_similarity: 0,
        };
      }
      const cl = clusterMap[cid];
      cl.products.push({
        product_id: r.PRODUCT_ID,
        product_name: r.PRODUCT_NAME,
        category: r.CATEGORY,
        brand_name: r.BRAND_NAME,
        unit_price: r.UNIT_PRICE,
        similarity: r.SIMILARITY,
        is_centroid: r.PRODUCT_ID === r.SEED_ID,
      });
      cl.categories[r.CATEGORY] = (cl.categories[r.CATEGORY] || 0) + 1;
      cl.total_similarity += Number(r.SIMILARITY) || 0;
    });

    const clusters = Object.values(clusterMap).map(cl => ({
      cluster_id: cl.cluster_id,
      centroid_product: cl.centroid_product,
      size: cl.products.length,
      avg_similarity: Math.round((cl.total_similarity / cl.products.length) * 10000) / 10000,
      top_category: Object.entries(cl.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      category_breakdown: cl.categories,
      products: cl.products,
    }));

    const configuredK = Number(settingsResult.rows[0]?.CONFIGURED_K) || clusters.length;
    res.json({
      k: configuredK,
      requested_k: requestedK,
      total_products: result.rows.length,
      clusters,
      meta: {
        model: `PRODUCT_CLUSTER_MODEL (K-Means, ${configuredK} clusters)`,
        algorithm: 'ALGO_KMEANS',
        scoring: 'CLUSTER_ID() / CLUSTER_PROBABILITY()',
        features: ['unit_price', 'weight_kg', 'units_sold', 'revenue', 'order_count',
                   'total_signal_activity', 'avg_sentiment', 'average_urgency_score'],
        engine: 'Oracle DBMS_DATA_MINING — provisioned in-database K-Means model',
        model_configuration: requestedK === configuredK ? 'requested' : 'provisioned',
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML vector-clusters', err, ['PRODUCT_CLUSTER_MODEL']);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/inventory-intelligence
//
// OML-powered inventory alerts: joins DEMAND_SURGE_MODEL predictions
// (stored in manufacturing_demand_forecasts) with live inventory levels to identify
// manufactured parts at risk of stockout due to production-signal-driven demand surges.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/inventory-intelligence', async (req, res) => {
  try {
    await requireMiningModels(['DEMAND_SURGE_MODEL']);
    // Get OML-scored inventory alerts
    const alertsResult = await db.execute(`
      SELECT
        p.product_id, p.product_name, p.category, p.unit_price,
        b.brand_name,
        fc.center_id, fc.center_name, fc.city, fc.state_province,
        i.quantity_on_hand, i.reorder_point, i.quantity_reserved,
        i.quantity_on_hand - i.reorder_point AS deficit,
        NVL(df.predicted_unit_demand, 0) AS predicted_unit_demand,
        NVL(df.production_signal_factor, 1.0) AS production_signal_factor,
        NVL(df.lower_confidence_units, 0) AS lower_confidence_units,
        NVL(df.upper_confidence_units, 0) AS upper_confidence_units,
        df.model_version,
        -- OML: real-time surge prediction
        PREDICTION(DEMAND_SURGE_MODEL USING
          p.CATEGORY AS category, p.UNIT_PRICE AS unit_price,
          NVL(eng.PRODUCTION_SIGNAL_COUNT, 0) AS production_signal_count,
          NVL(eng.AVG_SENTIMENT, 0.5) AS avg_sentiment,
          NVL(eng.TOTAL_ACKNOWLEDGEMENTS, 0) AS total_acknowledgements,
          NVL(eng.TOTAL_PROPAGATIONS, 0) AS total_propagations,
          NVL(eng.TOTAL_OBSERVATIONS, 0) AS total_observations,
          NVL(eng.AVERAGE_URGENCY_SCORE, 0) AS average_urgency_score,
          NVL(eng.ESCALATING_SIGNAL_COUNT, 0) AS escalating_signal_count,
          NVL(eng.ELEVATED_SIGNAL_COUNT, 0) AS elevated_signal_count,
          NVL(sales.UNITS_SOLD, 0) AS units_sold,
          NVL(sales.REVENUE, 0) AS revenue
        ) AS oml_surge_prediction,
        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          p.CATEGORY AS category, p.UNIT_PRICE AS unit_price,
          NVL(eng.PRODUCTION_SIGNAL_COUNT, 0) AS production_signal_count,
          NVL(eng.AVG_SENTIMENT, 0.5) AS avg_sentiment,
          NVL(eng.TOTAL_ACKNOWLEDGEMENTS, 0) AS total_acknowledgements,
          NVL(eng.TOTAL_PROPAGATIONS, 0) AS total_propagations,
          NVL(eng.TOTAL_OBSERVATIONS, 0) AS total_observations,
          NVL(eng.AVERAGE_URGENCY_SCORE, 0) AS average_urgency_score,
          NVL(eng.ESCALATING_SIGNAL_COUNT, 0) AS escalating_signal_count,
          NVL(eng.ELEVATED_SIGNAL_COUNT, 0) AS elevated_signal_count,
          NVL(sales.UNITS_SOLD, 0) AS units_sold,
          NVL(sales.REVENUE, 0) AS revenue
        ) * 100, 1) AS oml_surge_probability,
        -- Stock risk assessment
        CASE
          WHEN i.quantity_on_hand = 0 THEN 'OUT_OF_STOCK'
          WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'CRITICAL'
          WHEN i.quantity_on_hand < i.reorder_point THEN 'LOW'
          WHEN i.quantity_on_hand < NVL(df.predicted_unit_demand, i.reorder_point) THEN 'AT_RISK'
          ELSE 'ADEQUATE'
        END AS stock_status,
        -- Days of supply remaining
        CASE WHEN NVL(df.predicted_unit_demand, 0) > 0
          THEN ROUND(i.quantity_on_hand / (df.predicted_unit_demand / 7), 1)
          ELSE NULL
        END AS days_of_supply,
        -- Revenue at risk
        CASE WHEN i.quantity_on_hand < NVL(df.predicted_unit_demand, 0)
          THEN ROUND((NVL(df.predicted_unit_demand, 0) - i.quantity_on_hand) * p.unit_price, 2)
          ELSE 0
        END AS revenue_at_risk
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      JOIN fulfillment_centers fc ON i.center_id = fc.center_id
      LEFT JOIN manufacturing_demand_forecasts df ON p.product_id = df.manufactured_part_id
          AND df.forecast_date = TRUNC(SYSDATE)
      LEFT JOIN (
          SELECT ppm.MANUFACTURED_PART_ID,
                 COUNT(*) AS PRODUCTION_SIGNAL_COUNT, AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
                 SUM(sp.ACKNOWLEDGEMENT_COUNT) AS TOTAL_ACKNOWLEDGEMENTS, SUM(sp.PROPAGATION_COUNT) AS TOTAL_PROPAGATIONS,
                 SUM(sp.OBSERVATION_COUNT) AS TOTAL_OBSERVATIONS, AVG(sp.URGENCY_SCORE) AS AVERAGE_URGENCY_SCORE,
                 SUM(CASE WHEN sp.MOMENTUM_CODE IN ('escalating', 'critical') THEN 1 ELSE 0 END) AS ESCALATING_SIGNAL_COUNT,
                 SUM(CASE WHEN sp.MOMENTUM_CODE='elevated' THEN 1 ELSE 0 END) AS ELEVATED_SIGNAL_COUNT
          FROM MANUFACTURING_SIGNAL_PART_MENTIONS ppm
          JOIN MANUFACTURING_PRODUCTION_SIGNALS sp ON ppm.PRODUCTION_SIGNAL_ID = sp.PRODUCTION_SIGNAL_ID
          GROUP BY ppm.MANUFACTURED_PART_ID
      ) eng ON p.PRODUCT_ID = eng.MANUFACTURED_PART_ID
      LEFT JOIN (
          SELECT MANUFACTURED_PART_ID, SUM(REQUESTED_UNITS) AS UNITS_SOLD, SUM(LINE_VALUE) AS REVENUE
          FROM MANUFACTURING_WORK_ORDER_LINES GROUP BY MANUFACTURED_PART_ID
      ) sales ON p.PRODUCT_ID = sales.MANUFACTURED_PART_ID
      WHERE fc.is_active = 1
      ORDER BY oml_surge_probability DESC, i.quantity_on_hand ASC
      FETCH FIRST 100 ROWS ONLY
    `);

    // Summary stats
    const alerts = alertsResult.rows;
    const critical = alerts.filter(a => a.STOCK_STATUS === 'CRITICAL' || a.STOCK_STATUS === 'OUT_OF_STOCK').length;
    const atRisk = alerts.filter(a => a.STOCK_STATUS === 'AT_RISK').length;
    const surgeProducts = alerts.filter(a => a.OML_SURGE_PREDICTION === 'SURGE').length;
    const totalRevenueAtRisk = alerts.reduce((sum, a) => sum + (Number(a.REVENUE_AT_RISK) || 0), 0);

    // Group by stock status for chart
    const statusDist = {};
    alerts.forEach(a => {
      statusDist[a.STOCK_STATUS] = (statusDist[a.STOCK_STATUS] || 0) + 1;
    });

    // Group by center
    const centerMap = {};
    alerts.forEach(a => {
      if (!centerMap[a.CENTER_NAME]) {
        centerMap[a.CENTER_NAME] = { center: a.CENTER_NAME, city: a.CITY, alerts: 0, critical: 0, surges: 0 };
      }
      centerMap[a.CENTER_NAME].alerts++;
      if (a.STOCK_STATUS === 'CRITICAL' || a.STOCK_STATUS === 'OUT_OF_STOCK') centerMap[a.CENTER_NAME].critical++;
      if (a.OML_SURGE_PREDICTION === 'SURGE') centerMap[a.CENTER_NAME].surges++;
    });

    res.json({
      alerts,
      summary: {
        total_alerts: alerts.length,
        critical_count: critical,
        at_risk_count: atRisk,
        surge_products: surgeProducts,
        total_revenue_at_risk: Math.round(totalRevenueAtRisk * 100) / 100,
      },
      statusDistribution: Object.entries(statusDist).map(([status, count]) => ({ status, count })),
      centerSummary: Object.values(centerMap).sort((a, b) => b.critical - a.critical),
      meta: {
        model: 'DEMAND_SURGE_MODEL (Random Forest) + manufacturing_demand_forecasts',
        scoring: 'PREDICTION() + PREDICTION_PROBABILITY() real-time',
        engine: 'Oracle DBMS_DATA_MINING + inventory JOIN',
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML inventory-intelligence', err, ['DEMAND_SURGE_MODEL']);
  }
});

module.exports = router;
