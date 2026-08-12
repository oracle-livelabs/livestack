const oracledb = require('oracledb');
const db = require('../config/database');

const DEFAULT_LOOKBACK_HOURS = 720;
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_FORECAST_DAYS = 14;
const PERSISTED_CLUSTER_K_VALUES = [3, 5, 10];

const TABLES = [
  'oml_model_runs',
  'oml_demand_scores',
  'oml_customer_segments',
  'oml_commitment_forecasts',
  'oml_product_clusters',
  'oml_capacity_alerts',
];

const EXPECTED_DBMS_MODELS = [
  'SLED_SERVICE_DEMAND_MODEL',
  'SLED_RESIDENT_NEED_SEGMENT_MODEL',
  'SLED_SERVICE_VALUE_MODEL',
  'SLED_CASE_SIGNAL_CLUSTER_MODEL',
];

let schemaReadyPromise = null;
let refreshPromise = null;

function localExec(connection, sql, binds = {}, options = {}) {
  return connection.execute(sql, binds, {
    autoCommit: false,
    ...options,
  });
}

async function withConnection(fn, username = null) {
  return db.withUserConnection(username, async ({ connection }) => {
    const result = await fn(connection);
    await connection.commit();
    return result;
  });
}

async function getContextAccessScope(connection) {
  const result = await localExec(connection, `
    SELECT SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE') AS access_scope,
           SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED') AS authenticated
    FROM dual
  `);
  return {
    accessScope: String(result.rows?.[0]?.ACCESS_SCOPE || '').toUpperCase(),
    authenticated: String(result.rows?.[0]?.AUTHENTICATED || '').toUpperCase() === 'Y',
  };
}

async function assertGlobalRefreshContext(connection) {
  const context = await getContextAccessScope(connection);
  if (!context.authenticated || context.accessScope !== 'GLOBAL') {
    const error = new Error('Global demo access is required to refresh persisted ML data');
    error.statusCode = 403;
    error.code = 'DEMO_GLOBAL_ACCESS_REQUIRED';
    throw error;
  }
}

async function tableExists(connection, tableName) {
  const result = await localExec(connection, `
    SELECT COUNT(*) AS cnt
    FROM user_tables
    WHERE table_name = UPPER(:tableName)
  `, { tableName });
  return Number(result.rows[0]?.CNT || 0) > 0;
}

async function indexExists(connection, indexName) {
  const result = await localExec(connection, `
    SELECT COUNT(*) AS cnt
    FROM user_indexes
    WHERE index_name = UPPER(:indexName)
  `, { indexName });
  return Number(result.rows[0]?.CNT || 0) > 0;
}

function schemaSetupRequired(objectType, objectName) {
  const error = new Error(
    `Required ML ${objectType} ${objectName} is not installed; run the SLED schema setup before starting the application`
  );
  error.statusCode = 503;
  error.code = 'SLED_SCHEMA_SETUP_REQUIRED';
  return error;
}

async function procedureExists(connection, procedureName) {
  const result = await localExec(connection, `
    SELECT COUNT(*) AS cnt
    FROM user_objects
    WHERE object_type = 'PROCEDURE'
      AND object_name = UPPER(:procedureName)
  `, { procedureName });
  return Number(result.rows[0]?.CNT || 0) > 0;
}

function expectedModelListSql() {
  return EXPECTED_DBMS_MODELS.map((model) => `'${model}'`).join(',');
}

async function ensureMlPersistenceSchema(connection = null) {
  if (connection) {
    await ensureMlPersistenceSchemaOnConnection(connection);
    return;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = withConnection(async (conn) => {
      await ensureMlPersistenceSchemaOnConnection(conn);
    }).catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

async function ensureMlPersistenceSchemaOnConnection(connection) {
  const requiredTables = TABLES.map((name) => name.toUpperCase());
  const requiredIndexes = [
    'IDX_OML_RUNS_STATUS',
    'IDX_OML_DEMAND_LATEST',
    'IDX_OML_SEGMENTS_LATEST',
    'IDX_OML_FORECAST_LATEST',
    'IDX_OML_CLUSTERS_LATEST',
    'IDX_OML_CAPACITY_LATEST',
  ];

  for (const tableName of requiredTables) {
    if (!(await tableExists(connection, tableName))) {
      throw schemaSetupRequired('table', tableName);
    }
  }
  for (const indexName of requiredIndexes) {
    if (!(await indexExists(connection, indexName))) {
      throw schemaSetupRequired('index', indexName);
    }
  }

  const policies = await localExec(connection, `
    SELECT object_name, policy_type, enable
    FROM user_policies
    WHERE object_name IN (${requiredTables.map((name) => `'${name}'`).join(', ')})
  `);
  const securedTables = new Set(
    (policies.rows || [])
      .filter((row) => String(row.ENABLE || '').toUpperCase() === 'YES'
        && String(row.POLICY_TYPE || '').trim().toUpperCase() === 'CONTEXT_SENSITIVE')
      .map((row) => row.OBJECT_NAME)
  );
  for (const tableName of requiredTables) {
    if (!securedTables.has(tableName)) {
      throw schemaSetupRequired('VPD policy for table', tableName);
    }
  }
}

function demandProductFeaturesCte(lookbackBind = ':lookbackHours') {
  return `
    WITH product_features AS (
      SELECT /*+ NO_PARALLEL */
             p.product_id,
             p.product_name,
             p.category,
             b.brand_name,
             b.social_tier,
             p.unit_price,
             NVL(eng.total_posts, 0) AS total_posts,
             NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
             NVL(eng.total_likes, 0) AS total_likes,
             NVL(eng.total_shares, 0) AS total_shares,
             NVL(eng.total_views, 0) AS total_views,
             NVL(eng.avg_virality, 0) AS avg_virality,
             NVL(eng.viral_posts, 0) AS viral_posts,
             NVL(eng.rising_posts, 0) AS rising_posts,
             NVL(sales.units_sold, 0) AS units_sold,
             NVL(sales.revenue, 0) AS revenue,
             NVL(eng.peak_momentum, 'normal') AS peak_momentum
      FROM products p
      JOIN brands b ON b.brand_id = p.brand_id
      LEFT JOIN (
        SELECT ppm.product_id,
               COUNT(*) AS total_posts,
               AVG(sp.sentiment_score) AS avg_sentiment,
               SUM(sp.likes_count) AS total_likes,
               SUM(sp.shares_count) AS total_shares,
               SUM(sp.views_count) AS total_views,
               AVG(sp.virality_score) AS avg_virality,
               SUM(CASE WHEN sp.momentum_flag = 'viral' THEN 1 ELSE 0 END) AS viral_posts,
               SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_posts,
               MAX(sp.momentum_flag) AS peak_momentum
        FROM post_product_mentions ppm
        JOIN social_posts sp ON ppm.post_id = sp.post_id
        WHERE CAST(sp.posted_at AS DATE) >= SYSDATE - ${lookbackBind} / 24
        GROUP BY ppm.product_id
      ) eng ON p.product_id = eng.product_id
      LEFT JOIN (
        SELECT oi.product_id,
               SUM(oi.quantity) AS units_sold,
               SUM(oi.line_total) AS revenue
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        WHERE CAST(o.created_at AS DATE) >= SYSDATE - ${lookbackBind} / 24
        GROUP BY oi.product_id
      ) sales ON p.product_id = sales.product_id
      WHERE p.is_active = 1
    )`;
}

function surgeProbabilitySql(alias) {
  return `ROUND(LEAST(99,
    NVL(${alias}.avg_virality, 0) * 0.45 +
    LEAST(NVL(${alias}.total_posts, 0), 40) * 0.9 +
    LEAST(NVL(${alias}.viral_posts, 0), 10) * 6 +
    LEAST(NVL(${alias}.rising_posts, 0), 15) * 2 +
    LEAST(NVL(${alias}.total_views, 0) / 2000, 25) +
    LEAST(NVL(${alias}.units_sold, 0), 80) * 0.2
  ), 1)`;
}

async function createRun(connection, source) {
  const result = await localExec(connection, `
    INSERT INTO oml_model_runs (run_name, model_version, source, status, started_at)
    VALUES ('sled_oml_scene_outputs', 'sled_persistent_ml_v1', :source, 'running', SYSTIMESTAMP)
    RETURNING run_id INTO :runId
  `, {
    source,
    runId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  });
  return result.outBinds.runId[0];
}

async function markRunCompleted(connection, runId, rowCounts) {
  await localExec(connection, `
    UPDATE oml_model_runs
    SET status = 'completed',
        completed_at = SYSTIMESTAMP,
        row_counts = :rowCounts,
        notes = 'Persisted State and Local Government OML scene outputs for service demand, resident needs, commitment forecasts, case signal clusters, and service capacity capacity intelligence.'
    WHERE run_id = :runId
  `, { runId, rowCounts: JSON.stringify(rowCounts) });
}

async function markRunFailed(connection, runId, error) {
  await localExec(connection, `
    UPDATE oml_model_runs
    SET status = 'failed',
        completed_at = SYSTIMESTAMP,
        notes = :notes
    WHERE run_id = :runId
  `, { runId, notes: String(error?.message || error || 'ML persistence refresh failed').slice(0, 3000) });
}

async function persistDemandScores(connection, runId, lookbackHours = DEFAULT_LOOKBACK_HOURS) {
  const result = await localExec(connection, `
    INSERT INTO oml_demand_scores (
      run_id, product_id, lookback_hours, predicted_surge, surge_probability,
      predicted_demand, uplift_pct, confidence_pct, revenue_opportunity,
      recent_mentions, avg_virality, total_likes, total_shares, total_views,
      orders_recent, peak_momentum
    )
    ${demandProductFeaturesCte(':lookbackHours')}
    , scored_products AS (
      SELECT pf.*,
             ${surgeProbabilitySql('pf')} AS surge_probability
      FROM product_features pf
    )
    SELECT
      :runId,
      sp.product_id,
      :lookbackHours,
      CASE
        WHEN sp.surge_probability >= 65 THEN 'SURGE'
        WHEN sp.surge_probability >= 45 THEN 'WATCH'
        ELSE 'STABLE'
      END,
      sp.surge_probability,
      GREATEST(0, ROUND(sp.units_sold * (1 + sp.surge_probability / 100 * 2) + sp.total_posts * 0.5, 0)),
      ROUND(sp.surge_probability, 1),
      ROUND(LEAST(99, sp.surge_probability * 0.9 + CASE WHEN sp.total_posts > 0 THEN 10 ELSE 0 END), 0),
      GREATEST(0, ROUND((sp.units_sold * (1 + sp.surge_probability / 100 * 2) + sp.total_posts * 0.5) * sp.unit_price, 2)),
      sp.total_posts,
      ROUND(sp.avg_virality, 1),
      sp.total_likes,
      sp.total_shares,
      sp.total_views,
      sp.units_sold,
      sp.peak_momentum
    FROM scored_products sp
    WHERE sp.total_posts > 0 OR sp.units_sold > 0
  `, { runId, lookbackHours });

  return result.rowsAffected || 0;
}

async function persistCustomerSegments(connection, runId) {
  const result = await localExec(connection, `
    INSERT INTO oml_customer_segments (
      run_id, customer_id, service_region_code, order_count, total_spent, avg_order_value,
      days_since_last_order, oml_cluster_id, cluster_probability,
      recency_score, frequency_score, monetary_score, segment, churn_risk,
      predicted_ltv
    )
    WITH customer_metrics AS (
      SELECT /*+ NO_PARALLEL */
             c.customer_id,
             c.service_region_code,
             c.lifetime_value,
             NVL(rfm.recency_days, 999) AS recency_days,
             NVL(rfm.frequency, 0) AS frequency,
             NVL(rfm.monetary, 0) AS monetary,
             NVL(rfm.avg_order_value, 0) AS avg_order_value,
             NVL(rfm.total_items, 0) AS total_items,
             rfm.frequency AS order_count,
             rfm.monetary AS total_spent,
             rfm.recency_days AS days_since_last_order
      FROM customers c
      LEFT JOIN (
        SELECT o.customer_id,
               ROUND(SYSDATE - CAST(MAX(o.created_at) AS DATE)) AS recency_days,
               COUNT(DISTINCT o.order_id) AS frequency,
               SUM(o.order_total) AS monetary,
               AVG(o.order_total) AS avg_order_value,
               NVL(SUM(oi_cnt.item_count), 0) AS total_items
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(quantity) AS item_count
          FROM order_items
          GROUP BY order_id
        ) oi_cnt ON o.order_id = oi_cnt.order_id
        GROUP BY o.customer_id
      ) rfm ON c.customer_id = rfm.customer_id
    ),
    scored AS (
      SELECT cm.*,
             NTILE(4) OVER (ORDER BY cm.recency_days ASC) AS recency_score,
             NTILE(4) OVER (ORDER BY cm.frequency DESC) AS frequency_score,
             NTILE(4) OVER (ORDER BY cm.monetary DESC) AS monetary_score
      FROM customer_metrics cm
      WHERE cm.frequency > 0
    ),
    segmented AS (
      SELECT s.*,
             MOD(s.recency_score + s.frequency_score + s.monetary_score - 1, 4) + 1 AS oml_cluster_id,
             ROUND((s.recency_score + s.frequency_score + s.monetary_score) / 12, 3) AS cluster_probability,
             CASE
               WHEN s.recency_score = 4 AND s.frequency_score >= 3 AND s.monetary_score >= 3 THEN 'Champion'
               WHEN s.recency_score >= 3 AND s.frequency_score >= 3 THEN 'Loyal'
               WHEN s.recency_score = 4 AND s.frequency_score <= 2 THEN 'New Enterprise Buyer'
               WHEN s.recency_score <= 2 AND s.monetary_score = 4 THEN 'At Risk'
               WHEN s.recency_score = 1 AND s.frequency_score <= 2 THEN 'Lost'
               WHEN s.monetary_score = 4 AND s.recency_score >= 2 THEN 'Big Spender'
               WHEN s.recency_score >= 3 AND s.monetary_score <= 2 THEN 'Promising'
               ELSE 'Potential'
             END AS segment,
             CASE
               WHEN NVL(s.days_since_last_order, 999) > 60 THEN 'High'
               WHEN NVL(s.days_since_last_order, 999) > 30 THEN 'Medium'
               ELSE 'Low'
             END AS churn_risk,
             ROUND(s.avg_order_value * GREATEST(1, NVL(s.frequency, 0) / NULLIF(s.recency_days, 0) * 365), 2) AS predicted_ltv
      FROM scored s
    )
    SELECT :runId, customer_id, service_region_code, NVL(order_count, 0), ROUND(NVL(total_spent, 0), 2),
           ROUND(avg_order_value, 2), NVL(days_since_last_order, 999),
           oml_cluster_id, cluster_probability, recency_score, frequency_score,
           monetary_score, segment, churn_risk, predicted_ltv
    FROM segmented
  `, { runId });

  return result.rowsAffected || 0;
}

async function persistCommitmentForecast(connection, runId, lookbackDays = DEFAULT_LOOKBACK_DAYS, forecastDays = DEFAULT_FORECAST_DAYS) {
  const hist = await localExec(connection, `
    WITH daily_rev AS (
      SELECT /*+ NO_PARALLEL */
             TRUNC(CAST(created_at AS DATE), 'DD') AS day_bucket,
             SUM(order_total) AS revenue,
             COUNT(order_id) AS order_count,
             AVG(order_total) AS avg_order_value,
             ROW_NUMBER() OVER (ORDER BY TRUNC(CAST(created_at AS DATE), 'DD')) AS rn
      FROM orders
      WHERE CAST(created_at AS DATE) >= SYSDATE - :lookbackDays
      GROUP BY TRUNC(CAST(created_at AS DATE), 'DD')
    ),
    params AS (
      SELECT REGR_SLOPE(revenue, rn) AS slope,
             REGR_INTERCEPT(revenue, rn) AS intercept,
             REGR_R2(revenue, rn) AS r2,
             AVG(revenue) AS mean_revenue,
             STDDEV(revenue) AS stddev_revenue,
             MAX(rn) AS max_rn,
             CORR(revenue, rn) AS correlation
      FROM daily_rev
    )
    SELECT d.day_bucket,
           ROUND(d.revenue, 2) AS actual_revenue,
           d.order_count,
           ROUND(d.avg_order_value, 2) AS avg_order_value,
           ROUND(p.slope * d.rn + p.intercept, 2) AS trend_line,
           ROUND(AVG(d.revenue) OVER (ORDER BY d.rn ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7d,
           ROUND(p.r2, 4) AS r_squared,
           ROUND(p.slope, 2) AS daily_slope,
           ROUND(p.intercept, 2) AS intercept,
           ROUND(p.mean_revenue, 2) AS mean_revenue,
           ROUND(p.stddev_revenue, 2) AS stddev_revenue,
           ROUND(p.correlation, 4) AS correlation,
           p.max_rn
    FROM daily_rev d
    CROSS JOIN params p
    ORDER BY d.day_bucket
  `, { lookbackDays });

  let inserted = 0;
  for (const row of hist.rows) {
    await localExec(connection, `
      INSERT INTO oml_commitment_forecasts (
        run_id, forecast_day, horizon_day, actual_revenue, order_count,
        avg_order_value, trend_line, ma_7d, is_forecast, r_squared,
        daily_slope, intercept, mean_revenue, stddev_revenue, correlation
      ) VALUES (
        :runId, :forecastDay, 0, :actualRevenue, :orderCount,
        :avgOrderValue, :trendLine, :ma7d, 0, :rSquared,
        :dailySlope, :intercept, :meanRevenue, :stddevRevenue, :correlation
      )
    `, {
      runId,
      forecastDay: row.DAY_BUCKET,
      actualRevenue: row.ACTUAL_REVENUE,
      orderCount: row.ORDER_COUNT,
      avgOrderValue: row.AVG_ORDER_VALUE,
      trendLine: row.TREND_LINE,
      ma7d: row.MA_7D,
      rSquared: row.R_SQUARED,
      dailySlope: row.DAILY_SLOPE,
      intercept: row.INTERCEPT,
      meanRevenue: row.MEAN_REVENUE,
      stddevRevenue: row.STDDEV_REVENUE,
      correlation: row.CORRELATION,
    });
    inserted += 1;
  }

  if (!hist.rows.length) return inserted;

  const last = hist.rows[hist.rows.length - 1];
  const slope = Number(last.DAILY_SLOPE) || 0;
  const intercept = Number(last.INTERCEPT) || 0;
  const maxRn = Number(last.MAX_RN) || 0;
  const stddev = Number(last.STDDEV_REVENUE) || 0;
  const lastDay = new Date(last.DAY_BUCKET);

  for (let i = 1; i <= forecastDays; i += 1) {
    const futureRn = maxRn + i;
    const predicted = Math.max(0, slope * futureRn + intercept);
    const ci = stddev * (1 + i * 0.07);
    const forecastDay = new Date(lastDay);
    forecastDay.setDate(forecastDay.getDate() + i);
    await localExec(connection, `
      INSERT INTO oml_commitment_forecasts (
        run_id, forecast_day, horizon_day, trend_line, ci_lower, ci_upper,
        is_forecast, r_squared, daily_slope, intercept, mean_revenue,
        stddev_revenue, correlation
      ) VALUES (
        :runId, :forecastDay, :horizonDay, :trendLine, :ciLower, :ciUpper,
        1, :rSquared, :dailySlope, :intercept, :meanRevenue,
        :stddevRevenue, :correlation
      )
    `, {
      runId,
      forecastDay,
      horizonDay: i,
      trendLine: Math.round(predicted * 100) / 100,
      ciLower: Math.round(Math.max(0, predicted - ci) * 100) / 100,
      ciUpper: Math.round((predicted + ci) * 100) / 100,
      rSquared: last.R_SQUARED,
      dailySlope: slope,
      intercept,
      meanRevenue: last.MEAN_REVENUE,
      stddevRevenue: stddev,
      correlation: last.CORRELATION,
    });
    inserted += 1;
  }

  return inserted;
}

function productClusterFeaturesCte() {
  return `
    WITH product_cluster_features AS (
      SELECT p.product_id,
             p.product_name,
             p.category,
             p.unit_price,
             b.brand_name,
             NVL(sales.units_sold, 0) AS units_sold,
             NVL(sales.revenue, 0) AS product_revenue,
             NVL(eng.total_engagement, 0) AS total_engagement,
             NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
             NVL(eng.avg_virality, 0) AS avg_virality
      FROM products p
      JOIN brands b ON p.brand_id = b.brand_id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS units_sold, SUM(line_total) AS revenue
        FROM order_items
        GROUP BY product_id
      ) sales ON p.product_id = sales.product_id
      LEFT JOIN (
        SELECT ppm.product_id,
               SUM(sp.likes_count + sp.shares_count + sp.views_count) AS total_engagement,
               AVG(sp.sentiment_score) AS avg_sentiment,
               AVG(sp.virality_score) AS avg_virality
        FROM post_product_mentions ppm
        JOIN social_posts sp ON ppm.post_id = sp.post_id
        GROUP BY ppm.product_id
      ) eng ON p.product_id = eng.product_id
      WHERE p.is_active = 1
    )`;
}

async function persistProductClusters(connection, runId, k) {
  const result = await localExec(connection, `
    INSERT INTO oml_product_clusters (
      run_id, k_value, product_id, cluster_id, similarity,
      centroid_product_id, units_sold, total_engagement
    )
    ${productClusterFeaturesCte()}
    , scored_products AS (
      SELECT pcf.*,
             ROUND(
               NVL(pcf.product_revenue, 0) * 0.001 +
               NVL(pcf.units_sold, 0) * 0.8 +
               NVL(pcf.total_engagement, 0) * 0.0005 +
               NVL(pcf.avg_virality, 0) * 3 +
               NVL(pcf.unit_price, 0) * 0.05,
             4) AS composite_score,
             NTILE(${Number(k)}) OVER (
               ORDER BY NVL(pcf.total_engagement, 0) DESC,
                        NVL(pcf.units_sold, 0) DESC,
                        NVL(pcf.product_revenue, 0) DESC,
                        pcf.product_id
             ) AS cluster_id
      FROM product_cluster_features pcf
    ),
    ranked_products AS (
      SELECT sp.*,
             FIRST_VALUE(sp.product_id) OVER (
               PARTITION BY sp.cluster_id
               ORDER BY sp.composite_score DESC, sp.product_id
             ) AS seed_id,
             MAX(sp.composite_score) OVER (PARTITION BY sp.cluster_id) AS max_score,
             MIN(sp.composite_score) OVER (PARTITION BY sp.cluster_id) AS min_score
      FROM scored_products sp
    )
    SELECT :runId,
           :k,
           rp.product_id,
           rp.cluster_id,
           ROUND(CASE
             WHEN rp.max_score = rp.min_score THEN 1
             ELSE 0.5 + 0.5 * ((rp.composite_score - rp.min_score) / NULLIF(rp.max_score - rp.min_score, 0))
           END, 4),
           rp.seed_id,
           rp.units_sold,
           rp.total_engagement
    FROM ranked_products rp
  `, { runId, k });
  return result.rowsAffected || 0;
}

async function persistCapacityAlerts(connection, runId) {
  const result = await localExec(connection, `
    INSERT INTO oml_capacity_alerts (
      run_id, product_id, center_id, service_region_code, quantity_on_hand, reorder_point,
      quantity_reserved, deficit, predicted_demand, social_factor,
      confidence_low, confidence_high, oml_surge_prediction,
      oml_surge_probability, stock_status, days_of_supply, revenue_at_risk
    )
    SELECT * FROM (
      SELECT :runId,
             p.product_id,
             fc.center_id,
             fc.service_region_code,
             i.quantity_on_hand,
             i.reorder_point,
             i.quantity_reserved,
             i.quantity_on_hand - i.reorder_point AS deficit,
             NVL(ds.predicted_demand, df.predicted_demand) AS predicted_demand,
             NVL(df.social_factor, 1.0) AS social_factor,
             NVL(df.confidence_low, 0) AS confidence_low,
             NVL(df.confidence_high, 0) AS confidence_high,
             NVL(ds.predicted_surge, 'STABLE') AS oml_surge_prediction,
             NVL(ds.surge_probability, 0) AS oml_surge_probability,
             CASE
               WHEN i.quantity_on_hand = 0 THEN 'OUT_OF_STOCK'
               WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'CRITICAL'
               WHEN i.quantity_on_hand < i.reorder_point THEN 'LOW'
               WHEN i.quantity_on_hand < NVL(ds.predicted_demand, NVL(df.predicted_demand, i.reorder_point)) THEN 'AT_RISK'
               ELSE 'ADEQUATE'
             END AS stock_status,
             CASE
               WHEN NVL(ds.predicted_demand, NVL(df.predicted_demand, 0)) > 0
               THEN ROUND(i.quantity_on_hand / (NVL(ds.predicted_demand, df.predicted_demand) / 7), 1)
               ELSE NULL
             END AS days_of_supply,
             CASE
               WHEN i.quantity_on_hand < NVL(ds.predicted_demand, NVL(df.predicted_demand, 0))
               THEN ROUND((NVL(ds.predicted_demand, NVL(df.predicted_demand, 0)) - i.quantity_on_hand) * p.unit_price, 2)
               ELSE 0
             END AS revenue_at_risk
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
      JOIN fulfillment_centers fc ON i.center_id = fc.center_id
      LEFT JOIN oml_demand_scores ds ON ds.run_id = :runId AND ds.product_id = p.product_id
      LEFT JOIN demand_forecasts df ON p.product_id = df.product_id
        AND df.forecast_date = TRUNC(SYSDATE)
      WHERE fc.is_active = 1
      ORDER BY NVL(ds.surge_probability, 0) DESC, i.quantity_on_hand ASC
    )
    WHERE ROWNUM <= 100
  `, { runId });
  return result.rowsAffected || 0;
}

async function pruneOlderRuns(connection, keepCount = 5) {
  await localExec(connection, `
    DELETE FROM oml_model_runs
    WHERE run_id IN (
      SELECT run_id
      FROM (
        SELECT run_id,
               ROW_NUMBER() OVER (ORDER BY completed_at DESC NULLS LAST, started_at DESC) AS rn
        FROM oml_model_runs
        WHERE status IN ('completed', 'failed')
      )
      WHERE rn > :keepCount
    )
  `, { keepCount });
}

async function getSledOmlModelLifecycle(connection = null) {
  if (connection) return getSledOmlModelLifecycleOnConnection(connection);
  return withConnection(getSledOmlModelLifecycleOnConnection);
}

async function getSledOmlModelLifecycleOnConnection(connection) {
  let refreshAvailable = false;
  try {
    refreshAvailable = await procedureExists(connection, 'refresh_sled_oml_models');
  } catch (_) {
    refreshAvailable = false;
  }

  const activeByName = new Map();
  try {
    const modelResult = await localExec(connection, `
      SELECT model_name,
             mining_function,
             algorithm,
             TO_CHAR(creation_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM user_mining_models
      WHERE model_name IN (${expectedModelListSql()})
      ORDER BY model_name
    `);
    (modelResult.rows || []).forEach((row) => {
      activeByName.set(row.MODEL_NAME, {
        modelName: row.MODEL_NAME,
        miningFunction: row.MINING_FUNCTION,
        algorithm: row.ALGORITHM,
        createdAt: row.CREATED_AT,
      });
    });
  } catch (err) {
    return {
      expectedModels: EXPECTED_DBMS_MODELS,
      activeCount: 0,
      attempted: false,
      refreshAvailable,
      models: EXPECTED_DBMS_MODELS.map((modelName) => ({ modelName, active: false })),
      error: `Unable to read USER_MINING_MODELS: ${err.message}`,
    };
  }

  const latestLogByName = new Map();
  let logCount = 0;
  if (await tableExists(connection, 'oml_model_refresh_log')) {
    const countResult = await localExec(connection, `
      SELECT COUNT(*) AS cnt
      FROM oml_model_refresh_log
      WHERE model_name IN (${expectedModelListSql()})
    `);
    logCount = Number(countResult.rows[0]?.CNT || 0);

    const logResult = await localExec(connection, `
      SELECT model_name, algorithm, status, message,
             TO_CHAR(refreshed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS refreshed_at
      FROM (
        SELECT l.*,
               ROW_NUMBER() OVER (
                 PARTITION BY model_name
                 ORDER BY refreshed_at DESC, refresh_id DESC
               ) AS rn
        FROM oml_model_refresh_log l
        WHERE model_name IN (${expectedModelListSql()})
      )
      WHERE rn = 1
    `);
    (logResult.rows || []).forEach((row) => {
      latestLogByName.set(row.MODEL_NAME, {
        status: row.STATUS,
        message: row.MESSAGE,
        refreshedAt: row.REFRESHED_AT,
        algorithm: row.ALGORITHM,
      });
    });
  }

  const models = EXPECTED_DBMS_MODELS.map((modelName) => {
    const active = activeByName.get(modelName);
    const log = latestLogByName.get(modelName);
    return {
      modelName,
      active: Boolean(active),
      miningFunction: active?.miningFunction || null,
      algorithm: active?.algorithm || log?.algorithm || null,
      createdAt: active?.createdAt || null,
      latestStatus: log?.status || null,
      latestMessage: log?.message || null,
      latestRefreshAt: log?.refreshedAt || null,
    };
  });

  const refreshTimes = models
    .map((model) => model.latestRefreshAt)
    .filter(Boolean)
    .sort();

  return {
    expectedModels: EXPECTED_DBMS_MODELS,
    activeCount: activeByName.size,
    attempted: activeByName.size > 0 || logCount > 0,
    refreshAvailable,
    latestRefreshAt: refreshTimes[refreshTimes.length - 1] || null,
    models,
  };
}

async function refreshSledOmlModels({ connection = null, progress = null } = {}) {
  const runRefresh = async (conn) => {
    await assertGlobalRefreshContext(conn);
    if (progress) {
      progress({ status: 'running', progress: 94, message: 'Refreshing Oracle DBMS_DATA_MINING models...' });
    }

    if (!(await procedureExists(conn, 'refresh_sled_oml_models'))) {
      const lifecycle = await getSledOmlModelLifecycleOnConnection(conn);
      return {
        ...lifecycle,
        refreshAvailable: false,
        refreshError: 'refresh_sled_oml_models procedure is not installed.',
      };
    }

    try {
      await localExec(conn, 'BEGIN refresh_sled_oml_models; END;');
    } catch (err) {
      const lifecycle = await getSledOmlModelLifecycleOnConnection(conn);
      return {
        ...lifecycle,
        refreshError: err.message,
      };
    }

    return getSledOmlModelLifecycleOnConnection(conn);
  };

  if (connection) return runRefresh(connection);
  return withConnection(runRefresh);
}

async function refreshPersistentMlData({
  connection = null,
  username = null,
  source = 'manual-refresh',
  progress = null,
  refreshModels = true,
  modelLifecycle = null,
} = {}) {
  if (refreshPromise && !connection) return refreshPromise;

  const runRefresh = async (conn) => {
    await assertGlobalRefreshContext(conn);
    await ensureMlPersistenceSchema(conn);
    const refreshedModelLifecycle = refreshModels
      ? await refreshSledOmlModels({ connection: conn, progress })
      : modelLifecycle;
    if (progress) progress({ status: 'running', progress: 95, message: 'Persisting machine learning outputs...' });

    const runId = await createRun(conn, source);
    const rowCounts = {};
    try {
      rowCounts.oml_demand_scores = await persistDemandScores(conn, runId);
      rowCounts.oml_customer_segments = await persistCustomerSegments(conn, runId);
      rowCounts.oml_commitment_forecasts = await persistCommitmentForecast(conn, runId);
      rowCounts.oml_product_clusters = 0;
      for (const k of PERSISTED_CLUSTER_K_VALUES) {
        rowCounts.oml_product_clusters += await persistProductClusters(conn, runId, k);
      }
      rowCounts.oml_capacity_alerts = await persistCapacityAlerts(conn, runId);
      rowCounts.oml_model_runs = 1;
      await markRunCompleted(conn, runId, rowCounts);
      await pruneOlderRuns(conn);
      return { runId, rowCounts, modelLifecycle: refreshedModelLifecycle };
    } catch (err) {
      await markRunFailed(conn, runId, err);
      throw err;
    }
  };

  if (connection) return runRefresh(connection);

  refreshPromise = withConnection(runRefresh, username).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function getLatestRun(connection) {
  await ensureMlPersistenceSchema(connection);
  const result = await localExec(connection, `
    SELECT run_id, run_name, model_version, source, status,
           TO_CHAR(started_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
           TO_CHAR(completed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
           row_counts
    FROM oml_model_runs
    WHERE status = 'completed'
    ORDER BY completed_at DESC NULLS LAST, started_at DESC
    FETCH FIRST 1 ROW ONLY
  `);
  return result.rows[0] || null;
}

async function ensureCompletedRun(connection) {
  let latest = await getLatestRun(connection);
  if (latest) return latest;
  await refreshPersistentMlData({ connection, source: 'lazy-route-refresh' });
  latest = await getLatestRun(connection);
  if (!latest) throw new Error('Persisted ML data could not be refreshed.');
  return latest;
}

async function getMlPersistenceStatus() {
  return withConnection(async (connection) => {
    await ensureMlPersistenceSchema(connection);
    await ensureCompletedRun(connection);
    const counts = {};
    for (const table of TABLES) {
      const result = await localExec(connection, `SELECT COUNT(*) AS cnt FROM ${table}`);
      counts[table] = Number(result.rows[0]?.CNT || 0);
    }
    const latestRun = await getLatestRun(connection);
    const modelLifecycle = await getSledOmlModelLifecycle(connection);
    return {
      persistent: true,
      latestRun,
      counts,
      modelLifecycle,
    };
  });
}

function parseRowCounts(raw) {
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) {
    return {};
  }
}

function persistedMeta(latestRun, extra = {}) {
  return {
    persisted: true,
    run_id: latestRun.RUN_ID,
    refreshed_at: latestRun.COMPLETED_AT,
    model_version: latestRun.MODEL_VERSION,
    row_counts: parseRowCounts(latestRun.ROW_COUNTS),
    ...extra,
  };
}

async function persistedMetaWithLifecycle(connection, latestRun, extra = {}) {
  let modelLifecycle = null;
  try {
    modelLifecycle = await getSledOmlModelLifecycle(connection);
  } catch (err) {
    modelLifecycle = {
      expectedModels: EXPECTED_DBMS_MODELS,
      activeCount: 0,
      attempted: false,
      refreshAvailable: false,
      error: err.message,
    };
  }
  return persistedMeta(latestRun, {
    model_lifecycle: modelLifecycle,
    ...extra,
  });
}

async function getPersistedDemandForecast({ limit = 20, lookbackHours = DEFAULT_LOOKBACK_HOURS } = {}) {
  return withConnection(async (connection) => {
    const latest = await ensureCompletedRun(connection);
    const result = await localExec(connection, `
      SELECT ds.product_id, p.product_name, p.category, b.brand_name, b.social_tier,
             p.unit_price, ds.recent_mentions, ds.avg_virality, ds.total_likes,
             ds.total_shares, ds.total_views, ds.orders_recent, ds.peak_momentum,
             ds.predicted_surge, ds.surge_probability, ds.predicted_demand,
             ds.uplift_pct, ds.confidence_pct, ds.revenue_opportunity
      FROM oml_demand_scores ds
      JOIN products p ON p.product_id = ds.product_id
      JOIN brands b ON b.brand_id = p.brand_id
      WHERE ds.run_id = :runId
        AND ds.lookback_hours = :lookbackHours
      ORDER BY ds.surge_probability DESC, ds.avg_virality DESC
      FETCH FIRST :limit ROWS ONLY
    `, { runId: latest.RUN_ID, lookbackHours, limit });

    return {
      products: result.rows,
      meta: await persistedMetaWithLifecycle(connection, latest, {
        lookback_hours: lookbackHours,
        model: 'Persisted State and Local Government Demand Volatility Scores',
        algorithm: 'Oracle SQL persisted scoring',
        scoring: 'Persisted case signal + commitment demand features',
        features: ['category', 'unit_price', 'case signals', 'sentiment', 'views', 'virality', 'resident needs'],
        engine: 'Oracle persisted ML output tables',
      }),
    };
  });
}

async function getPersistedCustomerSegments({ limit = 200 } = {}) {
  return withConnection(async (connection) => {
    const latest = await ensureCompletedRun(connection);
    const result = await localExec(connection, `
      SELECT cs.customer_id,
             cs.service_region_code,
             c.first_name || ' ' || c.last_name AS full_name,
             c.city,
             c.state_province AS state,
             cs.order_count,
             cs.total_spent,
             cs.avg_order_value,
             cs.days_since_last_order,
             cs.oml_cluster_id,
             cs.cluster_probability,
             cs.recency_score,
             cs.frequency_score,
             cs.monetary_score,
             cs.segment,
             cs.churn_risk,
             cs.predicted_ltv
      FROM oml_customer_segments cs
      JOIN customers c ON c.customer_id = cs.customer_id
      WHERE cs.run_id = :runId
      ORDER BY cs.total_spent DESC
      FETCH FIRST :limit ROWS ONLY
    `, { runId: latest.RUN_ID, limit });

    const segMap = {};
    result.rows.forEach((row) => {
      const segment = row.SEGMENT;
      if (!segMap[segment]) {
        segMap[segment] = { segment, count: 0, total_revenue: 0, avg_rfm: 0, churn_high: 0 };
      }
      segMap[segment].count += 1;
      segMap[segment].total_revenue += Number(row.TOTAL_SPENT) || 0;
      segMap[segment].avg_rfm += (Number(row.RECENCY_SCORE) || 0) + (Number(row.FREQUENCY_SCORE) || 0) + (Number(row.MONETARY_SCORE) || 0);
      if (row.CHURN_RISK === 'High') segMap[segment].churn_high += 1;
    });

    const segmentSummary = Object.values(segMap).map((segment) => ({
      ...segment,
      total_revenue: Math.round(segment.total_revenue * 100) / 100,
      avg_rfm: Math.round((segment.avg_rfm / segment.count) * 10) / 10,
    })).sort((a, b) => b.count - a.count);

    const churnCounts = { High: 0, Medium: 0, Low: 0 };
    result.rows.forEach((row) => {
      churnCounts[row.CHURN_RISK] = (churnCounts[row.CHURN_RISK] || 0) + 1;
    });

    return {
      customers: result.rows,
      segmentSummary,
      churnDistribution: Object.entries(churnCounts).map(([risk, count]) => ({ risk, count })),
      total: result.rows.length,
      meta: await persistedMetaWithLifecycle(connection, latest, {
        model: 'Persisted Customer Commitment Segments',
        algorithm: 'Oracle SQL persisted RFM segmentation',
        scoring: 'Persisted resident need recency, frequency, monetary, and value features',
        dimensions: ['lifetime_value', 'recency_days', 'frequency', 'monetary', 'avg_commitment_value', 'total_items'],
        engine: 'Oracle persisted ML output tables',
        clusters: segmentSummary.length,
      }),
    };
  });
}

async function getPersistedCommitmentForecast({ lookbackDays = 30, forecastDays = 7 } = {}) {
  return withConnection(async (connection) => {
    const latest = await ensureCompletedRun(connection);
    const historical = await localExec(connection, `
      SELECT TO_CHAR(forecast_day, 'YYYY-MM-DD') AS day,
             actual_revenue, order_count, avg_order_value, trend_line, ma_7d,
             r_squared, daily_slope, intercept, mean_revenue, stddev_revenue,
             correlation, 0 AS is_forecast
      FROM oml_commitment_forecasts
      WHERE run_id = :runId
        AND is_forecast = 0
        AND forecast_day >= TRUNC(SYSDATE) - :lookbackDays
      ORDER BY forecast_day
    `, { runId: latest.RUN_ID, lookbackDays });

    const forecast = await localExec(connection, `
      SELECT TO_CHAR(forecast_day, 'YYYY-MM-DD') AS day,
             CAST(NULL AS NUMBER) AS actual_revenue,
             CAST(NULL AS NUMBER) AS order_count,
             CAST(NULL AS NUMBER) AS avg_order_value,
             trend_line, CAST(NULL AS NUMBER) AS ma_7d,
             ci_lower, ci_upper, 1 AS is_forecast
      FROM oml_commitment_forecasts
      WHERE run_id = :runId
        AND is_forecast = 1
        AND horizon_day <= :forecastDays
      ORDER BY forecast_day
    `, { runId: latest.RUN_ID, forecastDays });

    const last = historical.rows[historical.rows.length - 1] || {};
    return {
      historical: historical.rows,
      forecast: forecast.rows,
      model: {
        ...(await persistedMetaWithLifecycle(connection, latest)),
        type: 'Persisted Commitment Value Forecast',
        algorithm: 'Oracle SQL REGR_SLOPE / REGR_R2 persisted output',
        engine: 'Oracle persisted ML output tables',
        r_squared: Number(last.R_SQUARED || 0),
        correlation: Number(last.CORRELATION || 0),
        daily_slope: Number(last.DAILY_SLOPE || 0),
        intercept: Number(last.INTERCEPT || 0),
        mean_daily_revenue: Number(last.MEAN_REVENUE || 0),
        stddev: Number(last.STDDEV_REVENUE || 0),
        observations: historical.rows.length,
        lookback_days: lookbackDays,
        forecast_days: forecastDays,
      },
    };
  });
}

async function getPersistedProductClusters({ k = 5 } = {}) {
  return withConnection(async (connection) => {
    const latest = await ensureCompletedRun(connection);
    const existing = await localExec(connection, `
      SELECT COUNT(*) AS cnt
      FROM oml_product_clusters
      WHERE run_id = :runId AND k_value = :k
    `, { runId: latest.RUN_ID, k });
    if (Number(existing.rows[0]?.CNT || 0) === 0) {
      await persistProductClusters(connection, latest.RUN_ID, k);
    }

    const result = await localExec(connection, `
      SELECT pc.product_id, pc.cluster_id, pc.similarity, p.product_name,
             p.category, p.unit_price, b.brand_name, pc.units_sold,
             pc.total_engagement, centroid.product_name AS seed_name,
             pc.centroid_product_id AS seed_id
      FROM oml_product_clusters pc
      JOIN products p ON p.product_id = pc.product_id
      JOIN brands b ON b.brand_id = p.brand_id
      LEFT JOIN products centroid ON centroid.product_id = pc.centroid_product_id
      WHERE pc.run_id = :runId AND pc.k_value = :k
      ORDER BY pc.cluster_id, pc.similarity DESC, pc.product_id
    `, { runId: latest.RUN_ID, k });

    const clusterMap = {};
    result.rows.forEach((row) => {
      const cid = row.CLUSTER_ID;
      if (!clusterMap[cid]) {
        clusterMap[cid] = {
          cluster_id: cid,
          centroid_product: row.SEED_NAME,
          centroid_product_id: row.SEED_ID,
          products: [],
          categories: {},
          total_similarity: 0,
        };
      }
      const cluster = clusterMap[cid];
      cluster.products.push({
        product_id: row.PRODUCT_ID,
        product_name: row.PRODUCT_NAME,
        category: row.CATEGORY,
        brand_name: row.BRAND_NAME,
        unit_price: row.UNIT_PRICE,
        similarity: row.SIMILARITY,
        is_centroid: row.PRODUCT_ID === row.SEED_ID,
      });
      cluster.categories[row.CATEGORY] = (cluster.categories[row.CATEGORY] || 0) + 1;
      cluster.total_similarity += Number(row.SIMILARITY) || 0;
    });

    const clusters = Object.values(clusterMap).map((cluster) => ({
      cluster_id: cluster.cluster_id,
      centroid_product: cluster.centroid_product,
      size: cluster.products.length,
      avg_similarity: Math.round((cluster.total_similarity / cluster.products.length) * 10000) / 10000,
      top_category: Object.entries(cluster.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      category_breakdown: cluster.categories,
      products: cluster.products,
    }));

    return {
      k,
      total_products: result.rows.length,
      clusters,
      meta: await persistedMetaWithLifecycle(connection, latest, {
        model: `Persisted Product Signal Clusters (${k} clusters)`,
        algorithm: 'Oracle SQL persisted clustering',
        scoring: 'Persisted case signal and commitment feature clusters',
        features: ['unit_price', 'units_sold', 'commitment_value', 'total_engagement', 'avg_sentiment', 'avg_virality'],
        engine: 'Oracle persisted ML output tables',
      }),
    };
  });
}

async function getPersistedCapacityIntelligence() {
  return withConnection(async (connection) => {
    const latest = await ensureCompletedRun(connection);
    const result = await localExec(connection, `
      SELECT ca.product_id, p.product_name, p.category, p.unit_price, b.brand_name,
             ca.center_id, ca.service_region_code, fc.center_name, fc.city, fc.state_province,
             ca.quantity_on_hand, ca.reorder_point, ca.quantity_reserved,
             ca.deficit, ca.predicted_demand, ca.social_factor,
             ca.confidence_low, ca.confidence_high, ca.oml_surge_prediction,
             ca.oml_surge_probability, ca.stock_status, ca.days_of_supply,
             ca.revenue_at_risk
      FROM oml_capacity_alerts ca
      JOIN products p ON p.product_id = ca.product_id
      JOIN brands b ON b.brand_id = p.brand_id
      JOIN fulfillment_centers fc ON fc.center_id = ca.center_id
      WHERE ca.run_id = :runId
      ORDER BY ca.oml_surge_probability DESC, ca.quantity_on_hand ASC
      FETCH FIRST 100 ROWS ONLY
    `, { runId: latest.RUN_ID });

    const alerts = result.rows;
    const critical = alerts.filter((row) => row.STOCK_STATUS === 'CRITICAL' || row.STOCK_STATUS === 'OUT_OF_STOCK').length;
    const atRisk = alerts.filter((row) => row.STOCK_STATUS === 'AT_RISK').length;
    const surgeProducts = alerts.filter((row) => row.OML_SURGE_PREDICTION === 'SURGE').length;
    const totalRevenueAtRisk = alerts.reduce((sum, row) => sum + (Number(row.REVENUE_AT_RISK) || 0), 0);

    const statusDist = {};
    const centerMap = {};
    alerts.forEach((row) => {
      statusDist[row.STOCK_STATUS] = (statusDist[row.STOCK_STATUS] || 0) + 1;
      if (!centerMap[row.CENTER_NAME]) {
        centerMap[row.CENTER_NAME] = { center: row.CENTER_NAME, city: row.CITY, alerts: 0, critical: 0, surges: 0 };
      }
      centerMap[row.CENTER_NAME].alerts += 1;
      if (row.STOCK_STATUS === 'CRITICAL' || row.STOCK_STATUS === 'OUT_OF_STOCK') centerMap[row.CENTER_NAME].critical += 1;
      if (row.OML_SURGE_PREDICTION === 'SURGE') centerMap[row.CENTER_NAME].surges += 1;
    });

    return {
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
      meta: await persistedMetaWithLifecycle(connection, latest, {
        model: 'Persisted service capacity & Capacity Intelligence',
        scoring: 'Persisted service demand scores joined to capacity and demand forecasts',
        engine: 'Oracle persisted ML output tables',
      }),
    };
  });
}

module.exports = {
  ensureMlPersistenceSchema,
  refreshSledOmlModels,
  getSledOmlModelLifecycle,
  refreshPersistentMlData,
  getMlPersistenceStatus,
  getPersistedDemandForecast,
  getPersistedCustomerSegments,
  getPersistedCommitmentForecast,
  getPersistedProductClusters,
  getPersistedCapacityIntelligence,
};
