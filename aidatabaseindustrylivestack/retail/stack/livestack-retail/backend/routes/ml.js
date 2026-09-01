/**
 * Oracle Machine Learning (OML) Analytics API
 *
 * Uses Oracle DBMS_DATA_MINING - trained, persisted in-database ML models:
 *   DEMAND_SURGE_MODEL      - Random Forest Classification (product surge detection)
 *   CUSTOMER_SEGMENT_MODEL  - K-Means Clustering (RFM customer segmentation)
 *   REVENUE_PREDICT_MODEL   - GLM Regression (order revenue prediction)
 *   PRODUCT_CLUSTER_MODEL   - K-Means Clustering (product grouping by behavior)
 *
 * Scoring functions: PREDICTION(), PREDICTION_PROBABILITY(), CLUSTER_ID(), CLUSTER_PROBABILITY()
 * All computation runs inside Oracle AI Database 26ai - no external ML framework.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  LATEST_DEMAND_FORECAST_JOIN_SQL,
} = require('../lib/retailOmlBusinessQueryFragments');

const LOGICAL_OML_MODELS = [
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
];

async function readActiveModelRegistry() {
  const registry = await db.executeSystem(`
    SELECT r.logical_name, r.physical_name, r.generation_id,
           r.training_fingerprint, r.training_row_count,
           CASE WHEN m.model_name IS NULL THEN 0 ELSE 1 END AS physical_exists
    FROM app_oml_model_registry r
    LEFT JOIN user_mining_models m
      ON m.model_name = r.physical_name
    WHERE r.logical_name IN (
      'DEMAND_SURGE_MODEL','CUSTOMER_SEGMENT_MODEL',
      'REVENUE_PREDICT_MODEL','PRODUCT_CLUSTER_MODEL'
    )
  `);
  const rows = registry.rows || [];
  const complete = rows.length === LOGICAL_OML_MODELS.length
    && LOGICAL_OML_MODELS.every((logicalName) => rows.some((row) => (
      String(row.LOGICAL_NAME || '').toUpperCase() === logicalName
      && /^[A-Z][A-Z0-9_$#]{0,29}$/.test(String(row.PHYSICAL_NAME || '').toUpperCase())
      && Number(row.PHYSICAL_EXISTS || 0) === 1
      && String(row.TRAINING_FINGERPRINT || '').length > 0
      && Number(row.TRAINING_ROW_COUNT || 0) > 0
    )));
  if (!complete) {
    const error = new Error('The active OML model registry or a registered physical model is incomplete.');
    error.code = 'OML_MODEL_REGISTRY_UNAVAILABLE';
    throw error;
  }
  return rows;
}

async function executeOml(sql, binds = {}) {
  const rows = await readActiveModelRegistry();
  const resolved = Object.fromEntries(rows.map((row) => [
    String(row.LOGICAL_NAME || '').toUpperCase(),
    String(row.PHYSICAL_NAME || '').toUpperCase(),
  ]));
  let resolvedSql = String(sql);
  for (const logicalName of LOGICAL_OML_MODELS) {
    resolvedSql = resolvedSql.replace(new RegExp(`\\b${logicalName}\\b`, 'g'), resolved[logicalName]);
  }
  return db.execute(resolvedSql, binds);
}

const OML_SCORING_SQL = Object.freeze({
  DEMAND_SURGE_MODEL: (physicalName) => `
    SELECT source_case_id,
           PREDICTION(${physicalName} USING
             category AS category, unit_price AS unit_price,
             total_posts AS total_posts, avg_sentiment AS avg_sentiment,
             total_likes AS total_likes, total_shares AS total_shares,
             total_views AS total_views, avg_virality AS avg_virality,
             viral_posts AS viral_posts, rising_posts AS rising_posts,
             units_sold AS units_sold, revenue AS revenue
           ) prediction_value,
           ROUND(PREDICTION_PROBABILITY(${physicalName}, 'SURGE' USING
             category AS category, unit_price AS unit_price,
             total_posts AS total_posts, avg_sentiment AS avg_sentiment,
             total_likes AS total_likes, total_shares AS total_shares,
             total_views AS total_views, avg_virality AS avg_virality,
             viral_posts AS viral_posts, rising_posts AS rising_posts,
             units_sold AS units_sold, revenue AS revenue
           ), 6) probability_value
    FROM APP_OML_STAGE_DEMAND
    WHERE generation_id = :generationId
    ORDER BY source_case_id
    FETCH FIRST 1 ROW ONLY
  `,
  CUSTOMER_SEGMENT_MODEL: (physicalName) => `
    SELECT source_case_id,
           CLUSTER_ID(${physicalName} USING
             lifetime_value AS lifetime_value,
             recency_days AS recency_days, frequency AS frequency,
             monetary AS monetary, avg_order_value AS avg_order_value,
             total_items AS total_items
           ) prediction_value,
           ROUND(CLUSTER_PROBABILITY(${physicalName} USING
             lifetime_value AS lifetime_value,
             recency_days AS recency_days, frequency AS frequency,
             monetary AS monetary, avg_order_value AS avg_order_value,
             total_items AS total_items
           ), 6) probability_value
    FROM APP_OML_STAGE_CUSTOMER
    WHERE generation_id = :generationId
    ORDER BY source_case_id
    FETCH FIRST 1 ROW ONLY
  `,
  REVENUE_PREDICT_MODEL: (physicalName) => `
    SELECT source_case_id,
           ROUND(PREDICTION(${physicalName} USING
             customer_tier AS customer_tier,
             lifetime_value AS lifetime_value,
             recency_days AS recency_days, frequency AS frequency,
             monetary AS monetary, avg_order_value AS avg_order_value,
             item_count AS item_count, total_quantity AS total_quantity,
             avg_item_price AS avg_item_price, shipping_cost AS shipping_cost,
             demand_score AS demand_score,
             social_order_flag AS social_order_flag
           ), 6) prediction_value,
           CAST(NULL AS NUMBER) probability_value
    FROM APP_OML_STAGE_REVENUE
    WHERE generation_id = :generationId
    ORDER BY source_case_id
    FETCH FIRST 1 ROW ONLY
  `,
  PRODUCT_CLUSTER_MODEL: (physicalName) => `
    SELECT source_case_id,
           CLUSTER_ID(${physicalName} USING
             unit_price AS unit_price, weight_kg AS weight_kg,
             units_sold AS units_sold, revenue AS revenue,
             order_count AS order_count,
             total_engagement AS total_engagement,
             avg_sentiment AS avg_sentiment,
             avg_virality AS avg_virality
           ) prediction_value,
           ROUND(CLUSTER_PROBABILITY(${physicalName} USING
             unit_price AS unit_price, weight_kg AS weight_kg,
             units_sold AS units_sold, revenue AS revenue,
             order_count AS order_count,
             total_engagement AS total_engagement,
             avg_sentiment AS avg_sentiment,
             avg_virality AS avg_virality
           ), 6) probability_value
    FROM APP_OML_STAGE_PRODUCT
    WHERE generation_id = :generationId
    ORDER BY source_case_id
    FETCH FIRST 1 ROW ONLY
  `,
});

function omlScoringOperators(logicalName) {
  if (logicalName === 'DEMAND_SURGE_MODEL') {
    return ['PREDICTION', 'PREDICTION_PROBABILITY'];
  }
  if (logicalName === 'REVENUE_PREDICT_MODEL') {
    return ['PREDICTION'];
  }
  return ['CLUSTER_ID', 'CLUSTER_PROBABILITY'];
}

async function readExactOmlScoringEvidence() {
  const registry = await readActiveModelRegistry();
  const evidence = [];
  for (const logicalName of LOGICAL_OML_MODELS) {
    const model = registry.find((row) => row.LOGICAL_NAME === logicalName);
    const physicalName = String(model?.PHYSICAL_NAME || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9_$#]{0,29}$/.test(physicalName)
        || !OML_SCORING_SQL[logicalName]) {
      throw new Error(`Unsafe or absent active OML model ${logicalName}.`);
    }
    const result = await db.executeSystem(
      OML_SCORING_SQL[logicalName](physicalName),
      { generationId: model.GENERATION_ID }
    );
    const row = result.rows?.[0];
    if (!row) {
      throw new Error(`Active OML stage result is empty for ${logicalName}.`);
    }
    evidence.push({
      logicalName,
      physicalName,
      generationId: model.GENERATION_ID,
      sourceCaseId: row.SOURCE_CASE_ID,
      operators: omlScoringOperators(logicalName),
      predictionValue: row.PREDICTION_VALUE,
      probabilityValue: row.PROBABILITY_VALUE,
    });
  }
  if (new Set(evidence.map((row) => row.physicalName)).size !== 4) {
    throw new Error('OML scoring evidence did not use four distinct physical models.');
  }
  return evidence;
}

function requireGlobalOmlEvidence(req, res, next) {
  const role = String(req.demoIdentity?.role || '').toLowerCase();
  const dataScope = String(
    req.demoIdentity?.accessScope || 'RESTRICTED'
  ).toUpperCase();
  if (role === 'admin' && dataScope === 'GLOBAL') return next();
  return res.status(403).json({
    category: 'EVIDENCE_SCOPE_RESTRICTED',
    code: 'GLOBAL_OML_EVIDENCE_REQUIRED',
    feature: 'ORACLE_MACHINE_LEARNING',
    available: false,
    authorized: false,
    evidenceScope: 'GLOBAL_SYSTEM_MODEL_EVIDENCE',
    dataScope,
    error: 'Global system-model scoring evidence is available only to the Administrator.',
  });
}

function isMissingMlAssetError(err) {
  const message = String(err?.message || '');
  return err?.code === 'OML_MODEL_REGISTRY_UNAVAILABLE'
    || /ORA-40284|ORA-00942|ORA-04063/i.test(message);
}

async function handleMlRouteError(res, label, err) {
  if (isMissingMlAssetError(err)) {
    return res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'ORACLE_MACHINE_LEARNING',
      available: false,
      error: 'Required Oracle Machine Learning models are unavailable',
    });
  }

  console.error(`${label} error:`, err);
  return res.status(500).json({ error: err.message });
}

function buildDemandProductFeaturesCte(lookbackHoursExpr = null) {
  const socialWhere = lookbackHoursExpr
    ? `WHERE CAST(sp.POSTED_AT AS DATE) >= SYSDATE - ${lookbackHoursExpr} / 24`
    : '';
  const salesWhere = lookbackHoursExpr
    ? `WHERE CAST(o.CREATED_AT AS DATE) >= SYSDATE - ${lookbackHoursExpr} / 24`
    : '';

  return `
    WITH product_features AS (
      SELECT /*+ NO_PARALLEL */
             p.PRODUCT_ID,
             p.PRODUCT_NAME,
             p.CATEGORY,
             b.BRAND_NAME,
             b.SOCIAL_TIER,
             p.UNIT_PRICE,
             NVL(eng.TOTAL_POSTS, 0)      AS TOTAL_POSTS,
             NVL(eng.AVG_SENTIMENT, 0.5)  AS AVG_SENTIMENT,
             NVL(eng.TOTAL_LIKES, 0)      AS TOTAL_LIKES,
             NVL(eng.TOTAL_SHARES, 0)     AS TOTAL_SHARES,
             NVL(eng.TOTAL_VIEWS, 0)      AS TOTAL_VIEWS,
             NVL(eng.AVG_VIRALITY, 0)     AS AVG_VIRALITY,
             NVL(eng.VIRAL_POSTS, 0)      AS VIRAL_POSTS,
             NVL(eng.RISING_POSTS, 0)     AS RISING_POSTS,
             NVL(sales.UNITS_SOLD, 0)     AS UNITS_SOLD,
             NVL(sales.REVENUE, 0)        AS REVENUE,
             NVL(eng.PEAK_MOMENTUM, 'normal') AS PEAK_MOMENTUM
      FROM PRODUCTS p
      JOIN BRANDS b ON b.BRAND_ID = p.BRAND_ID
      LEFT JOIN (
        SELECT ppm.PRODUCT_ID,
               COUNT(*) AS TOTAL_POSTS,
               AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
               SUM(sp.LIKES_COUNT) AS TOTAL_LIKES,
               SUM(sp.SHARES_COUNT) AS TOTAL_SHARES,
               SUM(sp.VIEWS_COUNT) AS TOTAL_VIEWS,
               AVG(sp.VIRALITY_SCORE) AS AVG_VIRALITY,
               SUM(CASE WHEN sp.MOMENTUM_FLAG = 'viral' THEN 1 ELSE 0 END) AS VIRAL_POSTS,
               SUM(CASE WHEN sp.MOMENTUM_FLAG = 'rising' THEN 1 ELSE 0 END) AS RISING_POSTS,
               MAX(sp.MOMENTUM_FLAG) AS PEAK_MOMENTUM
        FROM POST_PRODUCT_MENTIONS ppm
        JOIN SOCIAL_POSTS sp ON ppm.POST_ID = sp.POST_ID
        ${socialWhere}
        GROUP BY ppm.PRODUCT_ID
      ) eng ON p.PRODUCT_ID = eng.PRODUCT_ID
      LEFT JOIN (
        SELECT oi.PRODUCT_ID,
               SUM(oi.QUANTITY) AS UNITS_SOLD,
               SUM(oi.LINE_TOTAL) AS REVENUE
        FROM ORDER_ITEMS oi
        JOIN ORDERS o ON o.ORDER_ID = oi.ORDER_ID
        ${salesWhere}
        GROUP BY oi.PRODUCT_ID
      ) sales ON p.PRODUCT_ID = sales.PRODUCT_ID
      WHERE p.IS_ACTIVE = 1
    )`;
}

function heuristicSurgeProbabilitySql(alias) {
  return `ROUND(LEAST(99,
    NVL(${alias}.AVG_VIRALITY, 0) * 0.45 +
    LEAST(NVL(${alias}.TOTAL_POSTS, 0), 40) * 0.9 +
    LEAST(NVL(${alias}.VIRAL_POSTS, 0), 10) * 6 +
    LEAST(NVL(${alias}.RISING_POSTS, 0), 15) * 2 +
    LEAST(NVL(${alias}.TOTAL_VIEWS, 0) / 2000, 25) +
    LEAST(NVL(${alias}.UNITS_SOLD, 0), 80) * 0.2
  ), 1)`;
}

function latestDemandForecastJoinSql() {
  return LATEST_DEMAND_FORECAST_JOIN_SQL;
}

function summarizeInventoryAlerts(alerts) {
  const critical = alerts.filter(a => a.STOCK_STATUS === 'CRITICAL' || a.STOCK_STATUS === 'OUT_OF_STOCK').length;
  const atRisk = alerts.filter(a => a.STOCK_STATUS === 'AT_RISK').length;
  const surgeProducts = alerts.filter(a => a.OML_SURGE_PREDICTION === 'SURGE').length;
  const totalRevenueAtRisk = alerts.reduce((sum, a) => sum + (Number(a.REVENUE_AT_RISK) || 0), 0);

  const statusDist = {};
  alerts.forEach(a => {
    statusDist[a.STOCK_STATUS] = (statusDist[a.STOCK_STATUS] || 0) + 1;
  });

  const centerMap = {};
  alerts.forEach(a => {
    if (!centerMap[a.CENTER_NAME]) {
      centerMap[a.CENTER_NAME] = { center: a.CENTER_NAME, city: a.CITY, alerts: 0, critical: 0, surges: 0 };
    }
    centerMap[a.CENTER_NAME].alerts++;
    if (a.STOCK_STATUS === 'CRITICAL' || a.STOCK_STATUS === 'OUT_OF_STOCK') centerMap[a.CENTER_NAME].critical++;
    if (a.OML_SURGE_PREDICTION === 'SURGE') centerMap[a.CENTER_NAME].surges++;
  });

  return {
    summary: {
      total_alerts: alerts.length,
      critical_count: critical,
      at_risk_count: atRisk,
      surge_products: surgeProducts,
      total_revenue_at_risk: Math.round(totalRevenueAtRisk * 100) / 100,
    },
    statusDistribution: Object.entries(statusDist).map(([status, count]) => ({ status, count })),
    centerSummary: Object.values(centerMap).sort((a, b) => b.critical - a.critical),
  };
}

async function fallbackDemandForecast({ limit, lookbackHours }) {
  const result = await db.execute(`
    ${buildDemandProductFeaturesCte(':lookback')}
    , scored_products AS (
      SELECT pf.*,
             ${heuristicSurgeProbabilitySql('pf')} AS SURGE_PROBABILITY
      FROM product_features pf
    )
    SELECT
      sp.PRODUCT_ID,
      sp.PRODUCT_NAME,
      sp.CATEGORY,
      sp.BRAND_NAME,
      sp.SOCIAL_TIER,
      sp.UNIT_PRICE,
      sp.TOTAL_POSTS AS RECENT_MENTIONS,
      ROUND(sp.AVG_VIRALITY, 1) AS AVG_VIRALITY,
      sp.TOTAL_LIKES,
      sp.TOTAL_SHARES,
      sp.TOTAL_VIEWS,
      sp.UNITS_SOLD AS ORDERS_RECENT,
      sp.PEAK_MOMENTUM,
      CASE
        WHEN sp.SURGE_PROBABILITY >= 65 THEN 'SURGE'
        WHEN sp.SURGE_PROBABILITY >= 45 THEN 'WATCH'
        ELSE 'STABLE'
      END AS PREDICTED_SURGE,
      sp.SURGE_PROBABILITY,
      GREATEST(0, ROUND(
        sp.UNITS_SOLD * (1 + sp.SURGE_PROBABILITY / 100 * 2) + sp.TOTAL_POSTS * 0.5,
      0)) AS PREDICTED_DEMAND,
      ROUND(sp.SURGE_PROBABILITY, 1) AS UPLIFT_PCT,
      ROUND(
        LEAST(99, sp.SURGE_PROBABILITY * 0.9 + CASE WHEN sp.TOTAL_POSTS > 0 THEN 10 ELSE 0 END),
      0) AS CONFIDENCE_PCT,
      GREATEST(0, ROUND(
        (sp.UNITS_SOLD * (1 + sp.SURGE_PROBABILITY / 100 * 2) + sp.TOTAL_POSTS * 0.5)
        * sp.UNIT_PRICE,
      2)) AS REVENUE_OPPORTUNITY
    FROM scored_products sp
    WHERE sp.TOTAL_POSTS > 0 OR sp.UNITS_SOLD > 0
    ORDER BY sp.SURGE_PROBABILITY DESC, sp.AVG_VIRALITY DESC
    FETCH FIRST :limit ROWS ONLY
  `, { lookback: lookbackHours, limit });

  return {
    products: result.rows,
    meta: {
      lookback_hours: lookbackHours,
      model: 'Demand signal heuristic (fallback)',
      algorithm: 'HEURISTIC_SCORE',
      scoring: 'Weighted social engagement + sales signal',
      features: ['category', 'unit_price', 'total_posts', 'avg_sentiment', 'total_likes',
                 'total_shares', 'total_views', 'avg_virality', 'viral_posts', 'rising_posts',
                 'units_sold', 'revenue'],
      engine: 'Oracle SQL fallback - persisted DBMS_DATA_MINING model not available',
      fallback: true,
    },
  };
}

async function fallbackCustomerSegments({ limit }) {
  const result = await db.execute(`
    WITH customer_metrics AS (
      SELECT /*+ NO_PARALLEL */
             c.CUSTOMER_ID,
             c.FIRST_NAME || ' ' || c.LAST_NAME AS FULL_NAME,
             c.CITY,
             c.STATE_PROVINCE AS STATE,
             c.LIFETIME_VALUE,
             NVL(rfm.RECENCY_DAYS, 999) AS RECENCY_DAYS,
             NVL(rfm.FREQUENCY, 0) AS FREQUENCY,
             NVL(rfm.MONETARY, 0) AS MONETARY,
             NVL(rfm.AVG_ORDER_VALUE, 0) AS AVG_ORDER_VALUE,
             NVL(rfm.TOTAL_ITEMS, 0) AS TOTAL_ITEMS,
             rfm.FREQUENCY AS ORDER_COUNT,
             rfm.MONETARY AS TOTAL_SPENT,
             rfm.RECENCY_DAYS AS DAYS_SINCE_LAST_ORDER
      FROM CUSTOMERS c
      LEFT JOIN (
        SELECT o.CUSTOMER_ID,
               ROUND(SYSDATE - CAST(MAX(o.CREATED_AT) AS DATE)) AS RECENCY_DAYS,
               COUNT(DISTINCT o.ORDER_ID) AS FREQUENCY,
               SUM(o.ORDER_TOTAL) AS MONETARY,
               AVG(o.ORDER_TOTAL) AS AVG_ORDER_VALUE,
               NVL(SUM(oi_cnt.ITEM_COUNT), 0) AS TOTAL_ITEMS
        FROM ORDERS o
        LEFT JOIN (
          SELECT ORDER_ID, SUM(QUANTITY) AS ITEM_COUNT
          FROM ORDER_ITEMS
          GROUP BY ORDER_ID
        ) oi_cnt ON o.ORDER_ID = oi_cnt.ORDER_ID
        GROUP BY o.CUSTOMER_ID
      ) rfm ON c.CUSTOMER_ID = rfm.CUSTOMER_ID
    ),
    scored AS (
      SELECT cm.*,
             NTILE(4) OVER (ORDER BY cm.RECENCY_DAYS ASC) AS RECENCY_SCORE,
             NTILE(4) OVER (ORDER BY cm.FREQUENCY DESC) AS FREQUENCY_SCORE,
             NTILE(4) OVER (ORDER BY cm.MONETARY DESC) AS MONETARY_SCORE
      FROM customer_metrics cm
      WHERE cm.FREQUENCY > 0
    ),
    segmented AS (
      SELECT s.*,
             MOD(s.RECENCY_SCORE + s.FREQUENCY_SCORE + s.MONETARY_SCORE - 1, 4) + 1 AS OML_CLUSTER_ID,
             ROUND((s.RECENCY_SCORE + s.FREQUENCY_SCORE + s.MONETARY_SCORE) / 12, 3) AS CLUSTER_PROBABILITY,
             CASE
               WHEN s.RECENCY_SCORE = 4 AND s.FREQUENCY_SCORE >= 3 AND s.MONETARY_SCORE >= 3 THEN 'Champion'
               WHEN s.RECENCY_SCORE >= 3 AND s.FREQUENCY_SCORE >= 3 THEN 'Loyal'
               WHEN s.RECENCY_SCORE = 4 AND s.FREQUENCY_SCORE <= 2 THEN 'New Customer'
               WHEN s.RECENCY_SCORE <= 2 AND s.MONETARY_SCORE = 4 THEN 'At Risk'
               WHEN s.RECENCY_SCORE = 1 AND s.FREQUENCY_SCORE <= 2 THEN 'Lost'
               WHEN s.MONETARY_SCORE = 4 AND s.RECENCY_SCORE >= 2 THEN 'Big Spender'
               WHEN s.RECENCY_SCORE >= 3 AND s.MONETARY_SCORE <= 2 THEN 'Promising'
               ELSE 'Potential'
             END AS SEGMENT,
             CASE
               WHEN NVL(s.DAYS_SINCE_LAST_ORDER, 999) > 60 THEN 'High'
               WHEN NVL(s.DAYS_SINCE_LAST_ORDER, 999) > 30 THEN 'Medium'
               ELSE 'Low'
             END AS CHURN_RISK,
             ROUND(
               s.AVG_ORDER_VALUE * GREATEST(1, NVL(s.FREQUENCY, 0) / NULLIF(s.RECENCY_DAYS, 0) * 365),
             2) AS PREDICTED_LTV
      FROM scored s
    )
    SELECT
      CUSTOMER_ID,
      FULL_NAME,
      CITY,
      STATE,
      NVL(ORDER_COUNT, 0) AS ORDER_COUNT,
      ROUND(NVL(TOTAL_SPENT, 0), 2) AS TOTAL_SPENT,
      ROUND(AVG_ORDER_VALUE, 2) AS AVG_ORDER_VALUE,
      NVL(DAYS_SINCE_LAST_ORDER, 999) AS DAYS_SINCE_LAST_ORDER,
      OML_CLUSTER_ID,
      CLUSTER_PROBABILITY,
      RECENCY_SCORE,
      FREQUENCY_SCORE,
      MONETARY_SCORE,
      SEGMENT,
      CHURN_RISK,
      PREDICTED_LTV
    FROM segmented
    ORDER BY TOTAL_SPENT DESC
    FETCH FIRST :limit ROWS ONLY
  `, { limit });

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

  return {
    customers: result.rows,
    segmentSummary,
    churnDistribution: Object.entries(churnDist).map(([risk, count]) => ({ risk, count })),
    total: result.rows.length,
    meta: {
      model: 'RFM segmentation heuristic (fallback)',
      algorithm: 'QUARTILE_SEGMENTATION',
      scoring: 'NTILE quartiles + deterministic segment rules',
      dimensions: ['lifetime_value', 'recency_days', 'frequency', 'monetary', 'avg_order_value', 'total_items'],
      engine: 'Oracle SQL fallback - persisted DBMS_DATA_MINING model not available',
      clusters: segmentSummary.length,
      fallback: true,
    },
  };
}

async function fallbackRevenueForecast({ lookbackDays, forecastDays }) {
  const histResult = await db.execute(`
    WITH daily_rev AS (
      SELECT /*+ NO_PARALLEL */
             TRUNC(CAST(CREATED_AT AS DATE), 'DD') AS DAY_BUCKET,
             SUM(ORDER_TOTAL) AS REVENUE,
             COUNT(ORDER_ID) AS ORDER_COUNT,
             AVG(ORDER_TOTAL) AS AVG_ORDER_VALUE,
             ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(CREATED_AT AS DATE), 'DD')) AS RN
      FROM ORDERS
      WHERE CAST(CREATED_AT AS DATE) >= SYSDATE - :lookback
      GROUP BY TRUNC(CAST(CREATED_AT AS DATE), 'DD')
    ),
    params AS (
      SELECT
        REGR_SLOPE(REVENUE, RN) AS SLOPE,
        REGR_INTERCEPT(REVENUE, RN) AS INTERCEPT,
        REGR_R2(REVENUE, RN) AS R2,
        AVG(REVENUE) AS MEAN_REVENUE,
        STDDEV(REVENUE) AS STDDEV_REVENUE,
        MAX(RN) AS MAX_RN,
        CORR(REVENUE, RN) AS CORRELATION
      FROM daily_rev
    )
    SELECT
      TO_CHAR(d.DAY_BUCKET, 'YYYY-MM-DD') AS DAY,
      ROUND(d.REVENUE, 2) AS ACTUAL_REVENUE,
      d.ORDER_COUNT,
      ROUND(d.AVG_ORDER_VALUE, 2) AS AVG_ORDER_VALUE,
      ROUND(p.SLOPE * d.RN + p.INTERCEPT, 2) AS TREND_LINE,
      ROUND(AVG(d.REVENUE) OVER (
        ORDER BY d.RN ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      ), 2) AS MA_7D,
      ROUND(p.R2, 4) AS R_SQUARED,
      ROUND(p.SLOPE, 2) AS DAILY_SLOPE,
      ROUND(p.INTERCEPT, 2) AS INTERCEPT,
      ROUND(p.MEAN_REVENUE, 2) AS MEAN_REVENUE,
      ROUND(p.STDDEV_REVENUE, 2) AS STDDEV_REVENUE,
      ROUND(p.CORRELATION, 4) AS CORRELATION,
      p.MAX_RN AS MAX_RN,
      CAST(NULL AS NUMBER) AS AVG_GLM_PREDICTED,
      CAST(NULL AS NUMBER) AS GLM_CORRELATION,
      0 AS IS_FORECAST
    FROM daily_rev d
    CROSS JOIN params p
    ORDER BY d.DAY_BUCKET
  `, { lookback: lookbackDays });

  if (!histResult.rows.length) {
    return { historical: [], forecast: [], model: null };
  }

  const last = histResult.rows[histResult.rows.length - 1];
  const slope = Number(last.DAILY_SLOPE) || 0;
  const intercept = Number(last.INTERCEPT) || 0;
  const maxRn = Number(last.MAX_RN) || 0;
  const stddev = Number(last.STDDEV_REVENUE) || 0;

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

  return {
    historical: histResult.rows,
    forecast,
    model: {
      type: 'OLS Trend (fallback)',
      algorithm: 'REGR_SLOPE / REGR_R2',
      engine: 'Oracle SQL fallback - persisted GLM model not available',
      r_squared: Number(last.R_SQUARED),
      correlation: Number(last.CORRELATION),
      glm_correlation: null,
      avg_glm_predicted: null,
      daily_slope: slope,
      intercept,
      mean_daily_revenue: Number(last.MEAN_REVENUE),
      stddev,
      observations: maxRn,
      lookback_days: lookbackDays,
      forecast_days: forecastDays,
      fallback: true,
    },
  };
}

async function fallbackSummary() {
  const [surgeCount, customers, modelCount, regr] = await Promise.all([
    db.execute(`
      ${buildDemandProductFeaturesCte('720')}
      , scored_products AS (
        SELECT pf.PRODUCT_ID,
               ${heuristicSurgeProbabilitySql('pf')} AS SURGE_PROBABILITY
        FROM product_features pf
      )
      SELECT COUNT(*) AS CNT
      FROM scored_products
      WHERE SURGE_PROBABILITY >= 65
    `),
    db.execute(`SELECT COUNT(*) AS CNT FROM CUSTOMERS`),
    readActiveModelRegistry().then((rows) => ({ rows: [{ CNT: rows.length }] })),
    db.execute(`
      SELECT /*+ NO_PARALLEL */
        ROUND(REGR_SLOPE(DAY_REV, RN), 2) AS SLOPE,
        ROUND(REGR_R2(DAY_REV, RN), 4) AS R2
      FROM (
        SELECT SUM(ORDER_TOTAL) AS DAY_REV,
               ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(CREATED_AT AS DATE))) AS RN
        FROM ORDERS
        WHERE CAST(CREATED_AT AS DATE) >= SYSDATE - 30
        GROUP BY TRUNC(CAST(CREATED_AT AS DATE))
      )
    `),
  ]);

  return {
    products_with_surge: surgeCount.rows[0]?.CNT || 0,
    total_customers: customers.rows[0]?.CNT || 0,
    rfm_segments: 8,
    revenue_slope: regr.rows[0]?.SLOPE || 0,
    revenue_r2: regr.rows[0]?.R2 || 0,
    models_active: modelCount.rows[0]?.CNT || 0,
  };
}

function buildProductClusterFeaturesCte() {
  return `
    WITH product_cluster_features AS (
      SELECT
        p.PRODUCT_ID,
        p.PRODUCT_NAME,
        p.CATEGORY,
        p.UNIT_PRICE,
        b.BRAND_NAME,
        NVL(sales.UNITS_SOLD, 0) AS UNITS_SOLD,
        NVL(sales.REVENUE, 0) AS PRODUCT_REVENUE,
        NVL(eng.TOTAL_ENGAGEMENT, 0) AS TOTAL_ENGAGEMENT,
        NVL(eng.AVG_SENTIMENT, 0.5) AS AVG_SENTIMENT,
        NVL(eng.AVG_VIRALITY, 0) AS AVG_VIRALITY
      FROM PRODUCTS p
      JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
      LEFT JOIN (
        SELECT PRODUCT_ID,
               SUM(QUANTITY) AS UNITS_SOLD,
               SUM(LINE_TOTAL) AS REVENUE
        FROM ORDER_ITEMS
        GROUP BY PRODUCT_ID
      ) sales ON p.PRODUCT_ID = sales.PRODUCT_ID
      LEFT JOIN (
        SELECT ppm.PRODUCT_ID,
               SUM(sp.LIKES_COUNT + sp.SHARES_COUNT + sp.VIEWS_COUNT) AS TOTAL_ENGAGEMENT,
               AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
               AVG(sp.VIRALITY_SCORE) AS AVG_VIRALITY
        FROM POST_PRODUCT_MENTIONS ppm
        JOIN SOCIAL_POSTS sp ON ppm.POST_ID = sp.POST_ID
        GROUP BY ppm.PRODUCT_ID
      ) eng ON p.PRODUCT_ID = eng.PRODUCT_ID
      WHERE p.IS_ACTIVE = 1
    )`;
}

async function fallbackVectorClusters({ k }) {
  const result = await db.execute(`
    ${buildProductClusterFeaturesCte()}
    , scored_products AS (
      SELECT
        pcf.*,
        ROUND(
          NVL(pcf.PRODUCT_REVENUE, 0) * 0.001 +
          NVL(pcf.UNITS_SOLD, 0) * 0.8 +
          NVL(pcf.TOTAL_ENGAGEMENT, 0) * 0.0005 +
          NVL(pcf.AVG_VIRALITY, 0) * 3 +
          NVL(pcf.UNIT_PRICE, 0) * 0.05,
        4) AS COMPOSITE_SCORE,
        NTILE(${k}) OVER (
          ORDER BY NVL(pcf.TOTAL_ENGAGEMENT, 0) DESC,
                   NVL(pcf.UNITS_SOLD, 0) DESC,
                   NVL(pcf.PRODUCT_REVENUE, 0) DESC,
                   pcf.PRODUCT_ID
        ) AS CLUSTER_ID
      FROM product_cluster_features pcf
    ),
    ranked_products AS (
      SELECT
        sp.*,
        FIRST_VALUE(sp.PRODUCT_NAME) OVER (
          PARTITION BY sp.CLUSTER_ID
          ORDER BY sp.COMPOSITE_SCORE DESC, sp.PRODUCT_ID
        ) AS SEED_NAME,
        FIRST_VALUE(sp.PRODUCT_ID) OVER (
          PARTITION BY sp.CLUSTER_ID
          ORDER BY sp.COMPOSITE_SCORE DESC, sp.PRODUCT_ID
        ) AS SEED_ID,
        MAX(sp.COMPOSITE_SCORE) OVER (PARTITION BY sp.CLUSTER_ID) AS MAX_SCORE,
        MIN(sp.COMPOSITE_SCORE) OVER (PARTITION BY sp.CLUSTER_ID) AS MIN_SCORE
      FROM scored_products sp
    )
    SELECT
      rp.PRODUCT_ID,
      rp.CLUSTER_ID,
      ROUND(
        CASE
          WHEN rp.MAX_SCORE = rp.MIN_SCORE THEN 1
          ELSE 0.5 + 0.5 * ((rp.COMPOSITE_SCORE - rp.MIN_SCORE) / NULLIF(rp.MAX_SCORE - rp.MIN_SCORE, 0))
        END,
      4) AS SIMILARITY,
      rp.PRODUCT_NAME,
      rp.CATEGORY,
      rp.UNIT_PRICE,
      rp.BRAND_NAME,
      rp.UNITS_SOLD,
      rp.TOTAL_ENGAGEMENT,
      rp.SEED_NAME,
      rp.SEED_ID
    FROM ranked_products rp
    ORDER BY rp.CLUSTER_ID, SIMILARITY DESC, rp.PRODUCT_ID
  `);

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

  return {
    k,
    total_products: result.rows.length,
    clusters,
    meta: {
      model: `Quantile clustering fallback (${k} buckets)`,
      algorithm: 'NTILE + weighted product score',
      scoring: 'Window-function clustering with centroid by composite score',
      features: ['unit_price', 'units_sold', 'revenue', 'total_engagement', 'avg_sentiment', 'avg_virality'],
      engine: 'Oracle SQL fallback - persisted DBMS_DATA_MINING model/view not available',
      fallback: true,
    },
  };
}

async function fallbackInventoryIntelligence() {
  const result = await db.execute(`
    ${buildDemandProductFeaturesCte('720')}
    , scored_products AS (
      SELECT pf.*,
             ${heuristicSurgeProbabilitySql('pf')} AS SURGE_PROBABILITY
      FROM product_features pf
    ),
    inventory_features AS (
      SELECT
        p.PRODUCT_ID,
        p.PRODUCT_NAME,
        p.CATEGORY,
        p.UNIT_PRICE,
        b.BRAND_NAME,
        fc.CENTER_ID,
        fc.CENTER_NAME,
        fc.CITY,
        fc.STATE_PROVINCE,
        i.QUANTITY_ON_HAND,
        i.REORDER_POINT,
        i.QUANTITY_RESERVED,
        i.QUANTITY_ON_HAND - i.REORDER_POINT AS DEFICIT,
        NVL(df.PREDICTED_DEMAND, 0) AS FORECAST_PREDICTED_DEMAND,
        NVL(df.SOCIAL_FACTOR, 1.0) AS SOCIAL_FACTOR,
        NVL(df.CONFIDENCE_LOW, 0) AS CONFIDENCE_LOW,
        NVL(df.CONFIDENCE_HIGH, 0) AS CONFIDENCE_HIGH,
        df.MODEL_VERSION,
        CASE
          WHEN NVL(sp.SURGE_PROBABILITY, 0) >= 65 THEN 'SURGE'
          WHEN NVL(sp.SURGE_PROBABILITY, 0) >= 45 THEN 'WATCH'
          ELSE 'STABLE'
        END AS OML_SURGE_PREDICTION,
        NVL(sp.SURGE_PROBABILITY, 0) AS OML_SURGE_PROBABILITY,
        GREATEST(0, ROUND(
          NVL(sp.UNITS_SOLD, 0) * (1 + NVL(sp.SURGE_PROBABILITY, 0) / 100 * 2.5)
          + NVL(sp.TOTAL_POSTS, 0) * 0.5,
        0)) AS OML_PREDICTED_DEMAND
      FROM INVENTORY i
      JOIN PRODUCTS p ON i.PRODUCT_ID = p.PRODUCT_ID
      JOIN BRANDS b ON p.BRAND_ID = b.BRAND_ID
      JOIN FULFILLMENT_CENTERS fc ON i.CENTER_ID = fc.CENTER_ID
      ${latestDemandForecastJoinSql()}
      LEFT JOIN scored_products sp ON p.PRODUCT_ID = sp.PRODUCT_ID
      WHERE fc.IS_ACTIVE = 1
    ),
    product_demand_inventory AS (
      SELECT inventory_features.*,
             COUNT(*) OVER (PARTITION BY PRODUCT_ID) AS INVENTORY_CENTER_COUNT,
             COALESCE(NULLIF(FORECAST_PREDICTED_DEMAND, 0), OML_PREDICTED_DEMAND) AS PRODUCT_PREDICTED_DEMAND,
             CASE
               WHEN FORECAST_PREDICTED_DEMAND > 0 THEN 'forecast_table'
               WHEN OML_PREDICTED_DEMAND > 0 THEN 'live_oml'
               ELSE 'none'
             END AS DEMAND_SOURCE
      FROM inventory_features
    ),
    demand_inventory AS (
      SELECT product_demand_inventory.*,
             GREATEST(
               REORDER_POINT,
               CEIL(PRODUCT_PREDICTED_DEMAND / NULLIF(INVENTORY_CENTER_COUNT, 0))
             ) AS PREDICTED_DEMAND
      FROM product_demand_inventory
    ),
    assessed_inventory AS (
      SELECT demand_inventory.*,
             CASE
               WHEN QUANTITY_ON_HAND = 0 THEN 'OUT_OF_STOCK'
               WHEN QUANTITY_ON_HAND < REORDER_POINT * 0.5 THEN 'CRITICAL'
               WHEN QUANTITY_ON_HAND < REORDER_POINT THEN 'LOW'
               WHEN QUANTITY_ON_HAND < PREDICTED_DEMAND THEN 'AT_RISK'
               ELSE 'ADEQUATE'
             END AS STOCK_STATUS,
             CASE
               WHEN PREDICTED_DEMAND > 0 THEN ROUND(QUANTITY_ON_HAND / (PREDICTED_DEMAND / 7), 1)
               ELSE NULL
             END AS DAYS_OF_SUPPLY,
             CASE
               WHEN QUANTITY_ON_HAND < PREDICTED_DEMAND
                 THEN ROUND((PREDICTED_DEMAND - QUANTITY_ON_HAND) * UNIT_PRICE, 2)
               ELSE 0
             END AS REVENUE_AT_RISK
      FROM demand_inventory
    )
    SELECT *
    FROM assessed_inventory
    ORDER BY REVENUE_AT_RISK DESC,
             CASE STOCK_STATUS
               WHEN 'OUT_OF_STOCK' THEN 1
               WHEN 'CRITICAL' THEN 2
               WHEN 'AT_RISK' THEN 3
               WHEN 'LOW' THEN 4
               ELSE 5
             END,
             OML_SURGE_PROBABILITY DESC,
             QUANTITY_ON_HAND ASC
  `);

  const allAlerts = result.rows;
  const alerts = allAlerts.slice(0, 100);
  const inventorySummary = summarizeInventoryAlerts(allAlerts);

  return {
    alerts,
    ...inventorySummary,
    meta: {
      model: 'Demand signal heuristic + demand_forecasts/live demand fallback',
      scoring: 'Weighted social signal + inventory JOIN + live predicted demand fallback',
      engine: 'Oracle SQL fallback - persisted DBMS_DATA_MINING model not available',
      fallback: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/demand-forecast
//
// Scores products using the DEMAND_SURGE_MODEL (Random Forest, 50 trees).
// Training features: social engagement, virality, likes, shares, views, sales.
// Returns PREDICTION() label + PREDICTION_PROBABILITY() confidence.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/demand-forecast', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const lookbackHours = Math.min(parseInt(req.query.hours) || 720, 2160);

    const result = await executeOml(`
      /* RETAIL_OML_BUSINESS_QUERY:demand:START */
      WITH product_features AS (
        SELECT /*+ NO_PARALLEL */
               p.product_id,
               p.product_name,
               p.category,
               b.brand_name,
               b.social_tier,
               p.unit_price,
               NVL(eng.TOTAL_POSTS, 0)      AS total_posts,
               NVL(eng.AVG_SENTIMENT, 0.5)   AS avg_sentiment,
               NVL(eng.TOTAL_LIKES, 0)       AS total_likes,
               NVL(eng.TOTAL_SHARES, 0)      AS total_shares,
               NVL(eng.TOTAL_VIEWS, 0)       AS total_views,
               NVL(eng.AVG_VIRALITY, 0)      AS avg_virality,
               NVL(eng.VIRAL_POSTS, 0)       AS viral_posts,
               NVL(eng.RISING_POSTS, 0)      AS rising_posts,
               NVL(sales.UNITS_SOLD, 0)      AS units_sold,
               NVL(sales.REVENUE, 0)         AS revenue,
               eng.PEAK_MOMENTUM
        FROM products p
        JOIN brands b ON b.brand_id = p.brand_id
        LEFT JOIN (
            SELECT ppm.PRODUCT_ID,
                   COUNT(*) AS TOTAL_POSTS,
                   AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
                   SUM(sp.LIKES_COUNT) AS TOTAL_LIKES,
                   SUM(sp.SHARES_COUNT) AS TOTAL_SHARES,
                   SUM(sp.VIEWS_COUNT) AS TOTAL_VIEWS,
                   AVG(sp.VIRALITY_SCORE) AS AVG_VIRALITY,
                   SUM(CASE WHEN sp.MOMENTUM_FLAG = 'viral' THEN 1 ELSE 0 END) AS VIRAL_POSTS,
                   SUM(CASE WHEN sp.MOMENTUM_FLAG = 'rising' THEN 1 ELSE 0 END) AS RISING_POSTS,
                   MAX(sp.MOMENTUM_FLAG) AS PEAK_MOMENTUM
            FROM POST_PRODUCT_MENTIONS ppm
            JOIN SOCIAL_POSTS sp ON ppm.POST_ID = sp.POST_ID
            WHERE CAST(sp.POSTED_AT AS DATE) >= SYSDATE - :lookback / 24
            GROUP BY ppm.PRODUCT_ID
        ) eng ON p.PRODUCT_ID = eng.PRODUCT_ID
        LEFT JOIN (
            SELECT oi.PRODUCT_ID,
                   SUM(oi.QUANTITY) AS UNITS_SOLD,
                   SUM(oi.LINE_TOTAL) AS REVENUE
            FROM ORDER_ITEMS oi
            JOIN ORDERS o ON o.ORDER_ID = oi.ORDER_ID
            WHERE CAST(o.CREATED_AT AS DATE) >= SYSDATE - :lookback / 24
            GROUP BY oi.PRODUCT_ID
        ) sales ON p.PRODUCT_ID = sales.PRODUCT_ID
        WHERE p.IS_ACTIVE = 1
      )
      SELECT
        pf.product_id,
        pf.product_name,
        pf.category,
        pf.brand_name,
        pf.social_tier,
        pf.unit_price,
        pf.total_posts      AS recent_mentions,
        ROUND(pf.avg_virality, 1) AS avg_virality,
        pf.total_likes,
        pf.total_shares,
        pf.total_views,
        pf.units_sold        AS orders_recent,
        pf.peak_momentum,

        -- Oracle DBMS_DATA_MINING: Random Forest scoring
        PREDICTION(DEMAND_SURGE_MODEL USING
          pf.category       AS category,
          pf.unit_price     AS unit_price,
          pf.total_posts    AS total_posts,
          pf.avg_sentiment  AS avg_sentiment,
          pf.total_likes    AS total_likes,
          pf.total_shares   AS total_shares,
          pf.total_views    AS total_views,
          pf.avg_virality   AS avg_virality,
          pf.viral_posts    AS viral_posts,
          pf.rising_posts   AS rising_posts,
          pf.units_sold     AS units_sold,
          pf.revenue        AS revenue
        ) AS predicted_surge,

        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          pf.category       AS category,
          pf.unit_price     AS unit_price,
          pf.total_posts    AS total_posts,
          pf.avg_sentiment  AS avg_sentiment,
          pf.total_likes    AS total_likes,
          pf.total_shares   AS total_shares,
          pf.total_views    AS total_views,
          pf.avg_virality   AS avg_virality,
          pf.viral_posts    AS viral_posts,
          pf.rising_posts   AS rising_posts,
          pf.units_sold     AS units_sold,
          pf.revenue        AS revenue
        ) * 100, 1) AS surge_probability,

        -- Predicted demand: units × probability-weighted multiplier
        GREATEST(0, ROUND(
          pf.units_sold * (1 + PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
            pf.category AS category, pf.unit_price AS unit_price,
            pf.total_posts AS total_posts, pf.avg_sentiment AS avg_sentiment,
            pf.total_likes AS total_likes, pf.total_shares AS total_shares,
            pf.total_views AS total_views, pf.avg_virality AS avg_virality,
            pf.viral_posts AS viral_posts, pf.rising_posts AS rising_posts,
            pf.units_sold AS units_sold, pf.revenue AS revenue
          ) * 2.5)
          + pf.total_posts * 0.5
        , 0)) AS predicted_demand,

        -- Uplift % based on surge probability
        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          pf.category AS category, pf.unit_price AS unit_price,
          pf.total_posts AS total_posts, pf.avg_sentiment AS avg_sentiment,
          pf.total_likes AS total_likes, pf.total_shares AS total_shares,
          pf.total_views AS total_views, pf.avg_virality AS avg_virality,
          pf.viral_posts AS viral_posts, pf.rising_posts AS rising_posts,
          pf.units_sold AS units_sold, pf.revenue AS revenue
        ) * 100, 1) AS uplift_pct,

        -- Confidence = surge probability
        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          pf.category AS category, pf.unit_price AS unit_price,
          pf.total_posts AS total_posts, pf.avg_sentiment AS avg_sentiment,
          pf.total_likes AS total_likes, pf.total_shares AS total_shares,
          pf.total_views AS total_views, pf.avg_virality AS avg_virality,
          pf.viral_posts AS viral_posts, pf.rising_posts AS rising_posts,
          pf.units_sold AS units_sold, pf.revenue AS revenue
        ) * 100, 0) AS confidence_pct,

        -- Revenue opportunity
        GREATEST(0, ROUND(
          (pf.units_sold * (1 + PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
            pf.category AS category, pf.unit_price AS unit_price,
            pf.total_posts AS total_posts, pf.avg_sentiment AS avg_sentiment,
            pf.total_likes AS total_likes, pf.total_shares AS total_shares,
            pf.total_views AS total_views, pf.avg_virality AS avg_virality,
            pf.viral_posts AS viral_posts, pf.rising_posts AS rising_posts,
            pf.units_sold AS units_sold, pf.revenue AS revenue
          ) * 2.5) + pf.total_posts * 0.5)
          * pf.unit_price
        , 2)) AS revenue_opportunity

      FROM product_features pf
      WHERE pf.total_posts > 0
      ORDER BY surge_probability DESC, avg_virality DESC
      FETCH FIRST :limit ROWS ONLY
      /* RETAIL_OML_BUSINESS_QUERY:demand:END */
    `, { lookback: lookbackHours, limit });

    res.json({
      products: result.rows,
      meta: {
        lookback_hours: lookbackHours,
        model: 'DEMAND_SURGE_MODEL (Random Forest, 50 trees)',
        algorithm: 'ALGO_RANDOM_FOREST',
        scoring: 'PREDICTION() / PREDICTION_PROBABILITY()',
        features: ['category', 'unit_price', 'total_posts', 'avg_sentiment', 'total_likes',
                   'total_shares', 'total_views', 'avg_virality', 'viral_posts', 'rising_posts',
                   'units_sold', 'revenue'],
        engine: 'Oracle DBMS_DATA_MINING - in-database Random Forest',
      },
    });
  } catch (err) {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const lookbackHours = Math.min(parseInt(req.query.hours) || 720, 2160);
    return handleMlRouteError(res, 'ML demand-forecast', err, () =>
      fallbackDemandForecast({ limit, lookbackHours })
    );
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

    const result = await executeOml(`
      /* RETAIL_OML_BUSINESS_QUERY:rfm:START */
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
            SELECT o.CUSTOMER_ID,
                   ROUND(SYSDATE - CAST(MAX(o.CREATED_AT) AS DATE)) AS RECENCY_DAYS,
                   COUNT(DISTINCT o.ORDER_ID) AS FREQUENCY,
                   SUM(o.ORDER_TOTAL) AS MONETARY,
                   AVG(o.ORDER_TOTAL) AS AVG_ORDER_VALUE,
                   NVL(SUM(oi_cnt.ITEM_COUNT), 0) AS TOTAL_ITEMS
            FROM ORDERS o
            LEFT JOIN (
                SELECT ORDER_ID, SUM(QUANTITY) AS ITEM_COUNT
                FROM ORDER_ITEMS GROUP BY ORDER_ID
            ) oi_cnt ON o.ORDER_ID = oi_cnt.ORDER_ID
            GROUP BY o.CUSTOMER_ID
        ) rfm ON c.CUSTOMER_ID = rfm.CUSTOMER_ID
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
      /* RETAIL_OML_BUSINESS_QUERY:rfm:END */
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
        engine: 'Oracle DBMS_DATA_MINING - in-database K-Means Clustering',
        clusters: segmentSummary.length,
      },
    });
  } catch (err) {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    return handleMlRouteError(res, 'ML customer-segments', err, () =>
      fallbackCustomerSegments({ limit })
    );
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

    const histResult = await executeOml(`
      /* RETAIL_OML_BUSINESS_QUERY:forecast:START */
      WITH daily_rev AS (
        SELECT /*+ NO_PARALLEL */
               TRUNC(CAST(created_at AS DATE), 'DD')            AS day_bucket,
               SUM(order_total)                                  AS revenue,
               COUNT(order_id)                                   AS order_count,
               AVG(order_total)                                  AS avg_order_value,
               ROW_NUMBER() OVER (
                 ORDER BY TRUNC(CAST(created_at AS DATE), 'DD')
               )                                                 AS rn
        FROM   orders
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
          ROUND(AVG(PREDICTION(REVENUE_PREDICT_MODEL USING *)), 2) AS avg_glm_predicted,
          ROUND(CORR(TARGET_REVENUE, PREDICTION(REVENUE_PREDICT_MODEL USING *)), 4) AS glm_correlation
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
      /* RETAIL_OML_BUSINESS_QUERY:forecast:END */
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
    const lookbackDays = Math.min(parseInt(req.query.days) || 30, 90);
    const forecastDays = Math.min(parseInt(req.query.forecast) || 7, 14);
    return handleMlRouteError(res, 'ML revenue-forecast', err, () =>
      fallbackRevenueForecast({ lookbackDays, forecastDays })
    );
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/scoring-evidence
// One exact result from each distinct, active physical DBMS_DATA_MINING model.
// This exposes only generation-bound model/output metadata, never stage inputs.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/scoring-evidence', requireGlobalOmlEvidence, async (req, res) => {
  try {
    const models = await readExactOmlScoringEvidence();
    return res.json({
      available: true,
      authorized: true,
      feature: 'ORACLE_MACHINE_LEARNING',
      evidenceScope: 'GLOBAL_SYSTEM_MODEL_EVIDENCE',
      dataScope: String(
        req.demoIdentity?.accessScope || 'RESTRICTED'
      ).toUpperCase(),
      models,
    });
  } catch (err) {
    console.error('ML scoring-evidence error:', err);
    return res.status(503).json({
      category: 'FEATURE_UNAVAILABLE',
      feature: 'ORACLE_MACHINE_LEARNING',
      available: false,
      error: 'Required Oracle Machine Learning scoring evidence is unavailable',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/summary
// Quick stats for all four OML models
// ─────────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const [surgeCount, customers, modelCount, regr] = await Promise.all([
      // Count products predicted as SURGE by the Random Forest model
      executeOml(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT p.PRODUCT_ID,
            PREDICTION(DEMAND_SURGE_MODEL USING
              p.CATEGORY AS category, p.UNIT_PRICE AS unit_price,
              NVL(eng.TOTAL_POSTS, 0) AS total_posts,
              NVL(eng.AVG_SENTIMENT, 0.5) AS avg_sentiment,
              NVL(eng.TOTAL_LIKES, 0) AS total_likes,
              NVL(eng.TOTAL_SHARES, 0) AS total_shares,
              NVL(eng.TOTAL_VIEWS, 0) AS total_views,
              NVL(eng.AVG_VIRALITY, 0) AS avg_virality,
              NVL(eng.VIRAL_POSTS, 0) AS viral_posts,
              NVL(eng.RISING_POSTS, 0) AS rising_posts,
              NVL(sales.UNITS_SOLD, 0) AS units_sold,
              NVL(sales.REVENUE, 0) AS revenue
            ) AS pred
          FROM PRODUCTS p
          LEFT JOIN (
              SELECT ppm.PRODUCT_ID,
                     COUNT(*) AS TOTAL_POSTS, AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
                     SUM(sp.LIKES_COUNT) AS TOTAL_LIKES, SUM(sp.SHARES_COUNT) AS TOTAL_SHARES,
                     SUM(sp.VIEWS_COUNT) AS TOTAL_VIEWS, AVG(sp.VIRALITY_SCORE) AS AVG_VIRALITY,
                     SUM(CASE WHEN sp.MOMENTUM_FLAG='viral' THEN 1 ELSE 0 END) AS VIRAL_POSTS,
                     SUM(CASE WHEN sp.MOMENTUM_FLAG='rising' THEN 1 ELSE 0 END) AS RISING_POSTS
              FROM POST_PRODUCT_MENTIONS ppm
              JOIN SOCIAL_POSTS sp ON ppm.POST_ID = sp.POST_ID
              WHERE CAST(sp.POSTED_AT AS DATE) >= SYSDATE - 30
              GROUP BY ppm.PRODUCT_ID
          ) eng ON p.PRODUCT_ID = eng.PRODUCT_ID
          LEFT JOIN (
              SELECT PRODUCT_ID, SUM(QUANTITY) AS UNITS_SOLD, SUM(LINE_TOTAL) AS REVENUE
              FROM ORDER_ITEMS GROUP BY PRODUCT_ID
          ) sales ON p.PRODUCT_ID = sales.PRODUCT_ID
          WHERE p.IS_ACTIVE = 1
        ) WHERE pred = 'SURGE'
      `),
      db.execute(`SELECT COUNT(*) AS cnt FROM customers`),
      // Count only the four generation-provenanced physical models in the active registry.
      readActiveModelRegistry().then((rows) => ({ rows: [{ CNT: rows.length }], provenance: rows })),
      db.execute(`SELECT /*+ NO_PARALLEL */
        ROUND(REGR_SLOPE(day_rev, rn), 2) AS slope,
        ROUND(REGR_R2(day_rev, rn), 4) AS r2
        FROM (
          SELECT SUM(order_total) AS day_rev,
                 ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE))) AS rn
          FROM orders WHERE CAST(created_at AS DATE) >= SYSDATE - 30
          GROUP BY TRUNC(CAST(created_at AS DATE))
        )`),
    ]);

    res.json({
      modelEvidenceScope: 'GLOBAL_SYSTEM_MODEL_METADATA',
      dataScope: String(
        req.demoIdentity?.accessScope || 'RESTRICTED'
      ).toUpperCase(),
      products_with_surge: surgeCount.rows[0]?.CNT || 0,
      total_customers: customers.rows[0]?.CNT || 0,
      rfm_segments: 8,
      revenue_slope: regr.rows[0]?.SLOPE || 0,
      revenue_r2: regr.rows[0]?.R2 || 0,
      models_active: modelCount.rows[0]?.CNT || 0,
      model_provenance: (modelCount.provenance || []).map((row) => ({
        logicalName: row.LOGICAL_NAME,
        physicalName: row.PHYSICAL_NAME,
        generationId: row.GENERATION_ID,
        trainingFingerprint: row.TRAINING_FINGERPRINT,
        trainingRowCount: row.TRAINING_ROW_COUNT,
      })),
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML summary', err, fallbackSummary);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/vector-clusters
//
// Read-only scoring against the persisted PRODUCT_CLUSTER_MODEL. Model rebuilds
// are owned exclusively by the guarded dataset lifecycle.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vector-clusters', async (req, res) => {
  try {
    const result = await executeOml(`
      /* RETAIL_OML_BUSINESS_QUERY:clusters:START */
      WITH clustered AS (
        SELECT
          pcv.PRODUCT_ID,
          CLUSTER_ID(PRODUCT_CLUSTER_MODEL USING *) AS cluster_id,
          ROUND(CLUSTER_PROBABILITY(PRODUCT_CLUSTER_MODEL USING *), 4) AS cluster_prob,
          pcv.UNIT_PRICE,
          pcv.UNITS_SOLD,
          pcv.REVENUE AS product_revenue,
          pcv.TOTAL_ENGAGEMENT,
          pcv.AVG_SENTIMENT,
          pcv.AVG_VIRALITY
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
        c.TOTAL_ENGAGEMENT,
        -- Find centroid (highest probability member in each cluster)
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
      /* RETAIL_OML_BUSINESS_QUERY:clusters:END */
    `);

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

    res.json({
      k: clusters.length,
      requestedK: req.query.k ? Number.parseInt(req.query.k, 10) : null,
      total_products: result.rows.length,
      clusters,
      meta: {
        model: `persisted PRODUCT_CLUSTER_MODEL (K-Means, ${clusters.length} observed clusters)`,
        algorithm: 'ALGO_KMEANS',
        scoring: 'CLUSTER_ID() / CLUSTER_PROBABILITY()',
        features: ['unit_price', 'weight_kg', 'units_sold', 'revenue', 'order_count',
                   'total_engagement', 'avg_sentiment', 'avg_virality'],
        engine: 'Oracle DBMS_DATA_MINING - in-database K-Means Clustering',
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML vector-clusters', err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ml/inventory-intelligence
//
// OML-powered inventory alerts: joins DEMAND_SURGE_MODEL predictions and live
// inventory levels, using live OML demand fallback when seeded forecasts are
// not present for a product.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/inventory-intelligence', async (req, res) => {
  try {
    // Get OML-scored inventory alerts. The summary is calculated over the full
    // scored inventory set; the response returns the top 100 rows for display.
    const alertsResult = await executeOml(`
      /* RETAIL_OML_BUSINESS_QUERY:inventory:START */
      WITH inventory_features AS (
        SELECT
          p.PRODUCT_ID,
          p.PRODUCT_NAME,
          p.CATEGORY,
          p.UNIT_PRICE,
          b.BRAND_NAME,
          fc.CENTER_ID,
          fc.CENTER_NAME,
          fc.CITY,
          fc.STATE_PROVINCE,
          i.QUANTITY_ON_HAND,
          i.REORDER_POINT,
          i.QUANTITY_RESERVED,
          i.QUANTITY_ON_HAND - i.REORDER_POINT AS DEFICIT,
          NVL(df.PREDICTED_DEMAND, 0) AS FORECAST_PREDICTED_DEMAND,
          NVL(df.SOCIAL_FACTOR, 1.0) AS SOCIAL_FACTOR,
          NVL(df.CONFIDENCE_LOW, 0) AS CONFIDENCE_LOW,
          NVL(df.CONFIDENCE_HIGH, 0) AS CONFIDENCE_HIGH,
          df.MODEL_VERSION,
          NVL(eng.TOTAL_POSTS, 0) AS TOTAL_POSTS,
          NVL(eng.AVG_SENTIMENT, 0.5) AS AVG_SENTIMENT,
          NVL(eng.TOTAL_LIKES, 0) AS TOTAL_LIKES,
          NVL(eng.TOTAL_SHARES, 0) AS TOTAL_SHARES,
          NVL(eng.TOTAL_VIEWS, 0) AS TOTAL_VIEWS,
          NVL(eng.AVG_VIRALITY, 0) AS AVG_VIRALITY,
          NVL(eng.VIRAL_POSTS, 0) AS VIRAL_POSTS,
          NVL(eng.RISING_POSTS, 0) AS RISING_POSTS,
          NVL(sales.UNITS_SOLD, 0) AS UNITS_SOLD,
          NVL(sales.REVENUE, 0) AS REVENUE
        FROM inventory i
        JOIN products p ON i.product_id = p.product_id
        JOIN brands b ON p.brand_id = b.brand_id
        JOIN fulfillment_centers fc ON i.center_id = fc.center_id
        ${latestDemandForecastJoinSql()}
        LEFT JOIN (
            SELECT ppm.PRODUCT_ID,
                   COUNT(*) AS TOTAL_POSTS, AVG(sp.SENTIMENT_SCORE) AS AVG_SENTIMENT,
                   SUM(sp.LIKES_COUNT) AS TOTAL_LIKES, SUM(sp.SHARES_COUNT) AS TOTAL_SHARES,
                   SUM(sp.VIEWS_COUNT) AS TOTAL_VIEWS, AVG(sp.VIRALITY_SCORE) AS AVG_VIRALITY,
                   SUM(CASE WHEN sp.MOMENTUM_FLAG='viral' THEN 1 ELSE 0 END) AS VIRAL_POSTS,
                   SUM(CASE WHEN sp.MOMENTUM_FLAG='rising' THEN 1 ELSE 0 END) AS RISING_POSTS
            FROM POST_PRODUCT_MENTIONS ppm
            JOIN SOCIAL_POSTS sp ON ppm.POST_ID = sp.POST_ID
            GROUP BY ppm.PRODUCT_ID
        ) eng ON p.PRODUCT_ID = eng.PRODUCT_ID
        LEFT JOIN (
            SELECT PRODUCT_ID, SUM(QUANTITY) AS UNITS_SOLD, SUM(LINE_TOTAL) AS REVENUE
            FROM ORDER_ITEMS GROUP BY PRODUCT_ID
        ) sales ON p.PRODUCT_ID = sales.PRODUCT_ID
        WHERE fc.is_active = 1
      ),
      scored_inventory AS (
        SELECT inventory_features.*,
        -- OML: real-time surge prediction
        PREDICTION(DEMAND_SURGE_MODEL USING
          CATEGORY AS category, UNIT_PRICE AS unit_price,
          TOTAL_POSTS AS total_posts,
          AVG_SENTIMENT AS avg_sentiment,
          TOTAL_LIKES AS total_likes,
          TOTAL_SHARES AS total_shares,
          TOTAL_VIEWS AS total_views,
          AVG_VIRALITY AS avg_virality,
          VIRAL_POSTS AS viral_posts,
          RISING_POSTS AS rising_posts,
          UNITS_SOLD AS units_sold,
          REVENUE AS revenue
        ) AS oml_surge_prediction,
        ROUND(PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
          CATEGORY AS category, UNIT_PRICE AS unit_price,
          TOTAL_POSTS AS total_posts,
          AVG_SENTIMENT AS avg_sentiment,
          TOTAL_LIKES AS total_likes,
          TOTAL_SHARES AS total_shares,
          TOTAL_VIEWS AS total_views,
          AVG_VIRALITY AS avg_virality,
          VIRAL_POSTS AS viral_posts,
          RISING_POSTS AS rising_posts,
          UNITS_SOLD AS units_sold,
          REVENUE AS revenue
        ) * 100, 1) AS oml_surge_probability,
        GREATEST(0, ROUND(
          UNITS_SOLD * (1 + PREDICTION_PROBABILITY(DEMAND_SURGE_MODEL, 'SURGE' USING
            CATEGORY AS category, UNIT_PRICE AS unit_price,
            TOTAL_POSTS AS total_posts, AVG_SENTIMENT AS avg_sentiment,
            TOTAL_LIKES AS total_likes, TOTAL_SHARES AS total_shares,
            TOTAL_VIEWS AS total_views, AVG_VIRALITY AS avg_virality,
            VIRAL_POSTS AS viral_posts, RISING_POSTS AS rising_posts,
            UNITS_SOLD AS units_sold, REVENUE AS revenue
          ) * 2.5)
          + TOTAL_POSTS * 0.5,
        0)) AS oml_predicted_demand
        FROM inventory_features
      ),
      product_demand_inventory AS (
        SELECT scored_inventory.*,
               COUNT(*) OVER (PARTITION BY PRODUCT_ID) AS INVENTORY_CENTER_COUNT,
               COALESCE(NULLIF(FORECAST_PREDICTED_DEMAND, 0), OML_PREDICTED_DEMAND) AS PRODUCT_PREDICTED_DEMAND,
               CASE
                 WHEN FORECAST_PREDICTED_DEMAND > 0 THEN 'forecast_table'
                 WHEN OML_PREDICTED_DEMAND > 0 THEN 'live_oml'
                 ELSE 'none'
               END AS DEMAND_SOURCE
        FROM scored_inventory
      ),
      demand_inventory AS (
        SELECT product_demand_inventory.*,
               GREATEST(
                 reorder_point,
                 CEIL(PRODUCT_PREDICTED_DEMAND / NULLIF(INVENTORY_CENTER_COUNT, 0))
               ) AS predicted_demand
        FROM product_demand_inventory
      ),
      assessed_inventory AS (
        SELECT demand_inventory.*,
               CASE
                 WHEN quantity_on_hand = 0 THEN 'OUT_OF_STOCK'
                 WHEN quantity_on_hand < reorder_point * 0.5 THEN 'CRITICAL'
                 WHEN quantity_on_hand < reorder_point THEN 'LOW'
                 WHEN quantity_on_hand < predicted_demand THEN 'AT_RISK'
                 ELSE 'ADEQUATE'
               END AS stock_status,
               CASE WHEN predicted_demand > 0
                 THEN ROUND(quantity_on_hand / (predicted_demand / 7), 1)
                 ELSE NULL
               END AS days_of_supply,
               CASE WHEN quantity_on_hand < predicted_demand
                 THEN ROUND((predicted_demand - quantity_on_hand) * unit_price, 2)
                 ELSE 0
               END AS revenue_at_risk
        FROM demand_inventory
      )
      SELECT *
      FROM assessed_inventory
      ORDER BY revenue_at_risk DESC,
               CASE stock_status
                 WHEN 'OUT_OF_STOCK' THEN 1
                 WHEN 'CRITICAL' THEN 2
                 WHEN 'AT_RISK' THEN 3
                 WHEN 'LOW' THEN 4
                 ELSE 5
               END,
               oml_surge_probability DESC,
               quantity_on_hand ASC
      /* RETAIL_OML_BUSINESS_QUERY:inventory:END */
    `);

    const allAlerts = alertsResult.rows;
    const alerts = allAlerts.slice(0, 100);
    const inventorySummary = summarizeInventoryAlerts(allAlerts);

    res.json({
      alerts,
      ...inventorySummary,
      meta: {
        model: 'DEMAND_SURGE_MODEL (Random Forest) + demand_forecasts/live demand fallback',
        scoring: 'PREDICTION() + PREDICTION_PROBABILITY() real-time + predicted demand fallback',
        engine: 'Oracle DBMS_DATA_MINING + inventory JOIN',
      },
    });
  } catch (err) {
    return handleMlRouteError(res, 'ML inventory-intelligence', err, fallbackInventoryIntelligence);
  }
});

module.exports = router;
