const db = require('../config/database');

const OML_MODEL_NAMES = [
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
];

function signalUrgencySql(alias) {
  return `COALESCE(${alias}.virality_score, ROUND(LEAST(99,
    CASE LOWER(NVL(${alias}.momentum_flag, 'normal'))
      WHEN 'mega_viral' THEN 72
      WHEN 'viral' THEN 58
      WHEN 'rising' THEN 38
      ELSE 18
    END +
    LEAST(12, LOG(10, NVL(${alias}.views_count, 0) + 1) * 2) +
    LEAST(10, (((NVL(${alias}.likes_count, 0) * 0.4) + (NVL(${alias}.shares_count, 0) * 2) + (NVL(${alias}.comments_count, 0) * 1.2)) / GREATEST(NVL(${alias}.views_count, 0), 1)) * 80) +
    LEAST(5, ABS(NVL(${alias}.sentiment_score, 0.5) - 0.5) * 10)
  ), 1))`;
}

function demandPressureScoreSql(alias) {
  return `ROUND(LEAST(99,
    LEAST(NVL(${alias}.total_posts, 0) * 0.14, 20) +
    LEAST(NVL(${alias}.viral_posts, 0) * 3, 18) +
    LEAST(NVL(${alias}.rising_posts, 0) * 1.1, 12) +
    LEAST(NVL(${alias}.total_views, 0) / 3000000, 22) +
    LEAST(NVL(${alias}.total_likes, 0) / 150000, 14) +
    LEAST(NVL(${alias}.total_shares, 0) / 70000, 12) +
    LEAST(NVL(${alias}.units_sold, 0) * 0.05, 16) +
    LEAST(NVL(${alias}.revenue, 0) / 50000, 8) +
    NVL(${alias}.avg_virality, 0) * 0.22
  ), 2)`;
}

const FEATURE_VIEW_SQL = [
  `
CREATE OR REPLACE VIEW oml_demand_training_v AS
WITH product_features AS (
  SELECT p.product_id,
         p.category,
         p.unit_price,
         NVL(eng.total_posts, 0)       AS total_posts,
         NVL(eng.avg_sentiment, 0.5)   AS avg_sentiment,
         NVL(eng.total_likes, 0)       AS total_likes,
         NVL(eng.total_shares, 0)      AS total_shares,
         NVL(eng.total_views, 0)       AS total_views,
         NVL(eng.avg_virality, 0)      AS avg_virality,
         NVL(eng.viral_posts, 0)       AS viral_posts,
         NVL(eng.rising_posts, 0)      AS rising_posts,
         NVL(sales.units_sold, 0)      AS units_sold,
         NVL(sales.revenue, 0)         AS revenue
  FROM products p
  LEFT JOIN (
    SELECT ppm.product_id,
           COUNT(*) AS total_posts,
           AVG(sp.sentiment_score) AS avg_sentiment,
           SUM(sp.likes_count) AS total_likes,
           SUM(sp.shares_count) AS total_shares,
           SUM(sp.views_count) AS total_views,
           AVG(${signalUrgencySql('sp')}) AS avg_virality,
           SUM(CASE WHEN sp.momentum_flag IN ('viral', 'mega_viral') THEN 1 ELSE 0 END) AS viral_posts,
           SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_posts
    FROM post_product_mentions ppm
    JOIN social_posts sp ON sp.post_id = ppm.post_id
    GROUP BY ppm.product_id
  ) eng ON eng.product_id = p.product_id
  LEFT JOIN (
    SELECT oi.product_id,
           SUM(oi.quantity) AS units_sold,
           SUM(oi.line_total) AS revenue
    FROM order_items oi
    JOIN orders o ON o.order_id = oi.order_id
    WHERE o.order_total > 0
      AND LOWER(NVL(o.order_status, '')) NOT IN ('cancelled', 'returned')
    GROUP BY oi.product_id
  ) sales ON sales.product_id = p.product_id
  WHERE p.is_active = 1
),
scored AS (
  SELECT product_features.*,
         ${demandPressureScoreSql('product_features')} AS demand_pressure_score
  FROM product_features
),
ranked AS (
  SELECT scored.*,
         NTILE(4) OVER (ORDER BY demand_pressure_score DESC, total_views DESC, product_id) AS pressure_quartile
  FROM scored
),
training_scenarios AS (
  SELECT
       product_id * 10 + 1 AS training_case_id,
       category,
       unit_price,
       total_posts,
       avg_sentiment,
       total_likes,
       total_shares,
       total_views,
       avg_virality,
       viral_posts,
       rising_posts,
       units_sold,
       revenue,
       demand_pressure_score,
       CASE WHEN pressure_quartile = 1 THEN 'SURGE' ELSE 'STABLE' END AS surge_label
  FROM ranked
  UNION ALL
  SELECT
       product_id * 10 + 2 AS training_case_id,
       category,
       unit_price,
       LEAST(total_posts + 14, 80) AS total_posts,
       LEAST(avg_sentiment + 0.08, 0.98) AS avg_sentiment,
       total_likes + 90000 AS total_likes,
       total_shares + 25000 AS total_shares,
       total_views + 6500000 AS total_views,
       LEAST(avg_virality + 24, 99) AS avg_virality,
       LEAST(viral_posts + 5, 20) AS viral_posts,
       LEAST(rising_posts + 8, 25) AS rising_posts,
       units_sold + 220 AS units_sold,
       revenue + (unit_price * 220) AS revenue,
       LEAST(demand_pressure_score + 26, 99) AS demand_pressure_score,
       'SURGE' AS surge_label
  FROM ranked
  WHERE pressure_quartile <= 2
  UNION ALL
  SELECT
       product_id * 10 + 3 AS training_case_id,
       category,
       unit_price,
       LEAST(total_posts, 4) AS total_posts,
       avg_sentiment,
       LEAST(total_likes, 12000) AS total_likes,
       LEAST(total_shares, 3000) AS total_shares,
       LEAST(total_views, 600000) AS total_views,
       LEAST(avg_virality, 24) AS avg_virality,
       0 AS viral_posts,
       LEAST(rising_posts, 1) AS rising_posts,
       LEAST(units_sold, 90) AS units_sold,
       LEAST(revenue, unit_price * 90) AS revenue,
       LEAST(demand_pressure_score, 32) AS demand_pressure_score,
       'STABLE' AS surge_label
  FROM ranked
)
SELECT training_case_id,
       category,
       unit_price,
       total_posts,
       avg_sentiment,
       total_likes,
       total_shares,
       total_views,
       avg_virality,
       viral_posts,
       rising_posts,
       units_sold,
       revenue,
       demand_pressure_score,
       surge_label
FROM training_scenarios
`,
  `
CREATE OR REPLACE VIEW oml_customer_rfm_v AS
SELECT c.customer_id,
       NVL(c.lifetime_value, 0) AS lifetime_value,
       NVL(rfm.recency_days, 999) AS recency_days,
       NVL(rfm.frequency, 0) AS frequency,
       NVL(rfm.monetary, 0) AS monetary,
       NVL(rfm.avg_order_value, 0) AS avg_order_value,
       NVL(rfm.total_items, 0) AS total_items
FROM customers c
JOIN (
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
  ) oi_cnt ON oi_cnt.order_id = o.order_id
  WHERE o.order_total > 0
    AND LOWER(NVL(o.order_status, '')) NOT IN ('cancelled', 'returned')
  GROUP BY o.customer_id
) rfm ON rfm.customer_id = c.customer_id
`,
  `
CREATE OR REPLACE VIEW oml_revenue_training_v AS
SELECT o.order_id,
       o.order_total AS target_revenue,
       NVL(c.customer_tier, 'standard') AS customer_tier,
       NVL(c.lifetime_value, 0) AS lifetime_value,
       NVL(rfm.recency_days, 999) AS recency_days,
       NVL(rfm.frequency, 0) AS frequency,
       NVL(rfm.monetary, 0) AS monetary,
       NVL(rfm.avg_order_value, 0) AS avg_order_value,
       NVL(items.item_count, 0) AS item_count,
       NVL(items.total_quantity, 0) AS total_quantity,
       NVL(items.avg_item_price, 0) AS avg_item_price,
       NVL(o.shipping_cost, 0) AS shipping_cost,
       NVL(o.demand_score, 0) AS demand_score,
       CASE WHEN o.social_source_id IS NOT NULL THEN 1 ELSE 0 END AS social_order_flag
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN (
  SELECT customer_id,
         ROUND(SYSDATE - CAST(MAX(created_at) AS DATE)) AS recency_days,
         COUNT(DISTINCT order_id) AS frequency,
         SUM(order_total) AS monetary,
         AVG(order_total) AS avg_order_value
  FROM orders
  WHERE order_total > 0
    AND LOWER(NVL(order_status, '')) NOT IN ('cancelled', 'returned')
  GROUP BY customer_id
) rfm ON rfm.customer_id = o.customer_id
LEFT JOIN (
  SELECT order_id,
         COUNT(*) AS item_count,
         SUM(quantity) AS total_quantity,
         AVG(unit_price) AS avg_item_price
  FROM order_items
  GROUP BY order_id
) items ON items.order_id = o.order_id
WHERE o.order_total > 0
  AND LOWER(NVL(o.order_status, '')) NOT IN ('cancelled', 'returned')
`,
  `
CREATE OR REPLACE VIEW oml_product_cluster_v AS
SELECT p.product_id,
       p.category,
       NVL(p.subcategory, 'General') AS subcategory,
       p.unit_price,
       NVL(p.weight_kg, 0) AS weight_kg,
       NVL(sales.units_sold, 0) AS units_sold,
       NVL(sales.revenue, 0) AS revenue,
       NVL(sales.order_count, 0) AS order_count,
       NVL(eng.total_engagement, 0) AS total_engagement,
       NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
       NVL(eng.avg_virality, 0) AS avg_virality,
       NVL(cap.available_capacity, 0) AS available_capacity,
       NVL(cap.capacity_exposure, 0) AS capacity_exposure,
       NVL(cap.avg_reorder_point, 0) AS avg_reorder_point,
       NVL(fcst.predicted_demand, 0) AS predicted_demand,
       NVL(fcst.avg_social_factor, 1) AS avg_social_factor
FROM products p
LEFT JOIN (
  SELECT oi.product_id,
         SUM(oi.quantity) AS units_sold,
         SUM(oi.line_total) AS revenue,
         COUNT(DISTINCT oi.order_id) AS order_count
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id
  WHERE o.order_total > 0
    AND LOWER(NVL(o.order_status, '')) NOT IN ('cancelled', 'returned')
  GROUP BY oi.product_id
) sales ON sales.product_id = p.product_id
LEFT JOIN (
  SELECT ppm.product_id,
         SUM(sp.likes_count + sp.shares_count + sp.comments_count) AS total_engagement,
         AVG(sp.sentiment_score) AS avg_sentiment,
         AVG(${signalUrgencySql('sp')}) AS avg_virality
  FROM post_product_mentions ppm
  JOIN social_posts sp ON sp.post_id = ppm.post_id
  GROUP BY ppm.product_id
) eng ON eng.product_id = p.product_id
LEFT JOIN (
  SELECT product_id,
         SUM(quantity_on_hand) AS available_capacity,
         SUM(GREATEST(reorder_point - quantity_on_hand, 0)) AS capacity_exposure,
         AVG(reorder_point) AS avg_reorder_point
  FROM inventory
  GROUP BY product_id
) cap ON cap.product_id = p.product_id
LEFT JOIN (
  SELECT product_id,
         SUM(predicted_demand) AS predicted_demand,
         AVG(social_factor) AS avg_social_factor
  FROM demand_forecasts
  WHERE forecast_date = (
    SELECT COALESCE(
      MIN(CASE WHEN forecast_date >= TRUNC(SYSDATE) THEN forecast_date END),
      MAX(forecast_date)
    )
    FROM demand_forecasts
  )
  GROUP BY product_id
) fcst ON fcst.product_id = p.product_id
WHERE p.is_active = 1
`,
];

const SETTINGS_TABLES = [
  {
    name: 'oml_rf_settings',
    rows: [
      ['ALGO_NAME', 'ALGO_RANDOM_FOREST'],
      ['PREP_AUTO', 'ON'],
      ['RFOR_NUM_TREES', '50'],
    ],
  },
  {
    name: 'oml_customer_km_settings',
    rows: [
      ['ALGO_NAME', 'ALGO_KMEANS'],
      ['PREP_AUTO', 'ON'],
      ['CLUS_NUM_CLUSTERS', '4'],
    ],
  },
  {
    name: 'oml_revenue_glm_settings',
    rows: [
      ['ALGO_NAME', 'ALGO_GENERALIZED_LINEAR_MODEL'],
      ['PREP_AUTO', 'ON'],
    ],
  },
  {
    name: 'oml_product_km_settings',
    rows: [
      ['ALGO_NAME', 'ALGO_KMEANS'],
      ['PREP_AUTO', 'ON'],
      ['CLUS_NUM_CLUSTERS', '5'],
    ],
  },
];

async function execSql(connection, sql, binds = {}, options = {}) {
  return connection.execute(sql, binds, {
    autoCommit: false,
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    ...options,
  });
}

async function dropExistingOmlArtifacts(connection) {
  await execSql(connection, `
DECLARE
  PROCEDURE drop_model_if_exists(p_model_name IN VARCHAR2) IS
  BEGIN
    DBMS_DATA_MINING.DROP_MODEL(p_model_name);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE NOT IN (-40102, -40201, -40284) THEN
        RAISE;
      END IF;
  END;

  PROCEDURE drop_table_if_exists(p_table_name IN VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE 'DROP TABLE ' || p_table_name || ' PURGE';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE != -942 THEN
        RAISE;
      END IF;
  END;
BEGIN
  drop_model_if_exists('DEMAND_SURGE_MODEL');
  drop_model_if_exists('CUSTOMER_SEGMENT_MODEL');
  drop_model_if_exists('REVENUE_PREDICT_MODEL');
  drop_model_if_exists('PRODUCT_CLUSTER_MODEL');

  drop_table_if_exists('OML_RF_SETTINGS');
  drop_table_if_exists('OML_CUSTOMER_KM_SETTINGS');
  drop_table_if_exists('OML_REVENUE_GLM_SETTINGS');
  drop_table_if_exists('OML_PRODUCT_KM_SETTINGS');
END;
`);
}

async function createSettingsTables(connection) {
  for (const table of SETTINGS_TABLES) {
    await execSql(connection, `
      CREATE TABLE ${table.name} (
        setting_name  VARCHAR2(30),
        setting_value VARCHAR2(4000)
      )
    `);

    for (const [settingName, settingValue] of table.rows) {
      await execSql(
        connection,
        `INSERT INTO ${table.name} (setting_name, setting_value) VALUES (:settingName, :settingValue)`,
        { settingName, settingValue }
      );
    }
  }
}

async function createModels(connection) {
  await execSql(connection, `
BEGIN
  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'DEMAND_SURGE_MODEL',
    mining_function     => DBMS_DATA_MINING.CLASSIFICATION,
    data_table_name     => 'OML_DEMAND_TRAINING_V',
    case_id_column_name => 'TRAINING_CASE_ID',
    target_column_name  => 'SURGE_LABEL',
    settings_table_name => 'OML_RF_SETTINGS'
  );

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'CUSTOMER_SEGMENT_MODEL',
    mining_function     => DBMS_DATA_MINING.CLUSTERING,
    data_table_name     => 'OML_CUSTOMER_RFM_V',
    case_id_column_name => 'CUSTOMER_ID',
    settings_table_name => 'OML_CUSTOMER_KM_SETTINGS'
  );

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'REVENUE_PREDICT_MODEL',
    mining_function     => DBMS_DATA_MINING.REGRESSION,
    data_table_name     => 'OML_REVENUE_TRAINING_V',
    case_id_column_name => 'ORDER_ID',
    target_column_name  => 'TARGET_REVENUE',
    settings_table_name => 'OML_REVENUE_GLM_SETTINGS'
  );

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'PRODUCT_CLUSTER_MODEL',
    mining_function     => DBMS_DATA_MINING.CLUSTERING,
    data_table_name     => 'OML_PRODUCT_CLUSTER_V',
    case_id_column_name => 'PRODUCT_ID',
    settings_table_name => 'OML_PRODUCT_KM_SETTINGS'
  );
END;
`);
}

async function countOmlModels(connection) {
  const placeholders = OML_MODEL_NAMES.map((_, index) => `:model${index}`).join(', ');
  const binds = Object.fromEntries(OML_MODEL_NAMES.map((modelName, index) => [`model${index}`, modelName]));
  const result = await execSql(connection, `
    SELECT COUNT(*) AS model_count
    FROM user_mining_models
    WHERE model_name IN (${placeholders})
  `, binds);
  return Number(result.rows[0]?.MODEL_COUNT || 0);
}

async function countRows(connection, viewName) {
  const result = await execSql(connection, `SELECT COUNT(*) AS row_count FROM ${viewName}`);
  return Number(result.rows[0]?.ROW_COUNT || 0);
}

async function rebuildOmlModels(connection) {
  if (!connection) {
    throw new Error('A live Oracle connection is required to rebuild OML models.');
  }

  for (const sql of FEATURE_VIEW_SQL) {
    await execSql(connection, sql);
  }

  const trainingRows = {
    demand: await countRows(connection, 'OML_DEMAND_TRAINING_V'),
    customers: await countRows(connection, 'OML_CUSTOMER_RFM_V'),
    revenue: await countRows(connection, 'OML_REVENUE_TRAINING_V'),
    products: await countRows(connection, 'OML_PRODUCT_CLUSTER_V'),
  };

  await dropExistingOmlArtifacts(connection);
  await createSettingsTables(connection);
  await connection.commit();
  await createModels(connection);
  await connection.commit();

  return {
    models_active: await countOmlModels(connection),
    model_names: OML_MODEL_NAMES,
    training_rows: trainingRows,
  };
}

module.exports = {
  OML_MODEL_NAMES,
  rebuildOmlModels,
};
