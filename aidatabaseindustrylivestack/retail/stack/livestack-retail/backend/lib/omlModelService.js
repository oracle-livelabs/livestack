const crypto = require('crypto');
const db = require('../config/database');
const { refreshSocialViralityScores } = require('./socialSignalScoreService');
const {
  activateOmlAssetInventoryOnConnection,
  computeOracleStageProvenance,
  markAssetCreated,
  markOmlGenerationFailedAndCleanup,
  registerCandidateAssetInventory,
} = require('./omlAssetLifecycleService');
const { failAtPhase } = require('./retailFailureInjection');

const OML_MODEL_NAMES = [
  'DEMAND_SURGE_MODEL',
  'CUSTOMER_SEGMENT_MODEL',
  'REVENUE_PREDICT_MODEL',
  'PRODUCT_CLUSTER_MODEL',
];

function sourceKey(value) {
  return String(value == null ? '' : value).trim();
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapBy(rows, key) {
  return new Map((rows || []).map((row) => [sourceKey(row[key]), row]));
}

function stableFingerprint(rows) {
  const canonical = [...rows]
    .map((row) => Object.fromEntries(Object.entries(row)
      .filter(([key]) => key !== '__lineNumber')
      .sort(([left], [right]) => left.localeCompare(right))))
    .sort((left, right) => sourceKey(left.source_case_id).localeCompare(sourceKey(right.source_case_id)));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function syntheticOmlFailureTarget(env = process.env) {
  if (env.NODE_ENV !== 'test') return '';
  return String(env.RETAIL_TEST_FORCE_OML_FAILURE_MODEL || '').toUpperCase();
}

function buildCandidateTrainingSets(dataset) {
  const tableRows = (name) => dataset?.tables?.[name]?.rows || [];
  const products = tableRows('products').filter((row) => numeric(row.is_active, 1) === 1);
  const customers = tableRows('customers');
  const orders = tableRows('orders');
  const orderItems = tableRows('order_items');
  const posts = tableRows('social_posts');
  const mentions = tableRows('post_product_mentions');
  const postsById = mapBy(posts, 'post_id');
  const customersById = mapBy(customers, 'customer_id');

  const engagementByProduct = new Map();
  for (const mention of mentions) {
    const productId = sourceKey(mention.product_id);
    const post = postsById.get(sourceKey(mention.post_id));
    if (!productId || !post) continue;
    const current = engagementByProduct.get(productId) || {
      total_posts: 0, sentiment_sum: 0, total_likes: 0, total_shares: 0,
      total_views: 0, virality_sum: 0, viral_posts: 0, rising_posts: 0,
      total_engagement: 0,
    };
    current.total_posts += 1;
    current.sentiment_sum += numeric(post.sentiment_score, 0.5);
    current.total_likes += numeric(post.likes_count);
    current.total_shares += numeric(post.shares_count);
    current.total_views += numeric(post.views_count);
    current.virality_sum += numeric(post.virality_score);
    current.viral_posts += post.momentum_flag === 'viral' ? 1 : 0;
    current.rising_posts += post.momentum_flag === 'rising' ? 1 : 0;
    current.total_engagement += numeric(post.likes_count)
      + numeric(post.shares_count) + numeric(post.comments_count);
    engagementByProduct.set(productId, current);
  }

  const salesByProduct = new Map();
  const itemsByOrder = new Map();
  for (const item of orderItems) {
    const orderId = sourceKey(item.order_id);
    const productId = sourceKey(item.product_id);
    const quantity = numeric(item.quantity);
    const unitPrice = numeric(item.unit_price);
    const items = itemsByOrder.get(orderId) || [];
    items.push(item);
    itemsByOrder.set(orderId, items);
    const sales = salesByProduct.get(productId) || {
      units_sold: 0, revenue: 0, order_ids: new Set(),
    };
    sales.units_sold += quantity;
    sales.revenue += quantity * unitPrice;
    sales.order_ids.add(orderId);
    salesByProduct.set(productId, sales);
  }

  const latestOrderMs = Math.max(0, ...orders.map((row) => new Date(row.created_at || row.updated_at || 0).getTime()));
  const ordersByCustomer = new Map();
  for (const order of orders) {
    const key = sourceKey(order.customer_id);
    const rows = ordersByCustomer.get(key) || [];
    rows.push(order);
    ordersByCustomer.set(key, rows);
  }

  const demand = products.map((product) => {
    const productId = sourceKey(product.product_id);
    const engagement = engagementByProduct.get(productId) || {};
    const sales = salesByProduct.get(productId) || {};
    const totalPosts = numeric(engagement.total_posts);
    const avgSentiment = totalPosts ? numeric(engagement.sentiment_sum) / totalPosts : 0.5;
    const avgVirality = totalPosts ? numeric(engagement.virality_sum) / totalPosts : 0;
    const surgeScore = Math.min(99,
      avgVirality * 0.45
      + Math.min(totalPosts, 40) * 0.9
      + Math.min(numeric(engagement.viral_posts), 10) * 6
      + Math.min(numeric(engagement.rising_posts), 15) * 2
      + Math.min(numeric(engagement.total_views) / 2000, 25)
      + Math.min(numeric(sales.units_sold), 80) * 0.2);
    return {
      source_case_id: productId,
      category: product.category || null,
      unit_price: numeric(product.unit_price),
      total_posts: totalPosts,
      avg_sentiment: avgSentiment,
      total_likes: numeric(engagement.total_likes),
      total_shares: numeric(engagement.total_shares),
      total_views: numeric(engagement.total_views),
      avg_virality: avgVirality,
      viral_posts: numeric(engagement.viral_posts),
      rising_posts: numeric(engagement.rising_posts),
      units_sold: numeric(sales.units_sold),
      revenue: numeric(sales.revenue),
      surge_label: Math.round(surgeScore * 10) / 10 >= 65 ? 'SURGE' : 'STABLE',
    };
  });

  const customer = customers.map((row) => {
    const customerId = sourceKey(row.customer_id);
    const customerOrders = ordersByCustomer.get(customerId) || [];
    const totals = customerOrders.map((order) => numeric(order.order_total));
    const latest = Math.max(0, ...customerOrders.map((order) => new Date(order.created_at || order.updated_at || 0).getTime()));
    return {
      source_case_id: customerId,
      lifetime_value: numeric(row.lifetime_value),
      recency_days: latest && latestOrderMs ? Math.max(0, Math.round((latestOrderMs - latest) / 86400000)) : 999,
      frequency: customerOrders.length,
      monetary: totals.reduce((sum, value) => sum + value, 0),
      avg_order_value: totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0,
      total_items: customerOrders.reduce((sum, order) =>
        sum + (itemsByOrder.get(sourceKey(order.order_id)) || [])
          .reduce((itemSum, item) => itemSum + numeric(item.quantity), 0), 0),
    };
  });

  const revenue = orders.map((order) => {
    const customerRow = customersById.get(sourceKey(order.customer_id)) || {};
    const customerOrders = ordersByCustomer.get(sourceKey(order.customer_id)) || [];
    const customerTotals = customerOrders.map((item) => numeric(item.order_total));
    const latest = Math.max(0, ...customerOrders.map((item) => new Date(item.created_at || item.updated_at || 0).getTime()));
    const items = itemsByOrder.get(sourceKey(order.order_id)) || [];
    const quantities = items.map((item) => numeric(item.quantity));
    const prices = items.map((item) => numeric(item.unit_price));
    return {
      source_case_id: sourceKey(order.order_id),
      target_revenue: numeric(order.order_total),
      customer_tier: customerRow.customer_tier || 'standard',
      lifetime_value: numeric(customerRow.lifetime_value),
      recency_days: latest && latestOrderMs ? Math.max(0, Math.round((latestOrderMs - latest) / 86400000)) : 999,
      frequency: customerOrders.length,
      monetary: customerTotals.reduce((sum, value) => sum + value, 0),
      avg_order_value: customerTotals.length
        ? customerTotals.reduce((sum, value) => sum + value, 0) / customerTotals.length : 0,
      item_count: items.length,
      total_quantity: quantities.reduce((sum, value) => sum + value, 0),
      avg_item_price: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0,
      shipping_cost: numeric(order.shipping_cost),
      demand_score: numeric(order.demand_score),
      social_order_flag: order.social_source_id ? 1 : 0,
    };
  });

  const product = products.map((row) => {
    const productId = sourceKey(row.product_id);
    const sales = salesByProduct.get(productId) || {};
    const engagement = engagementByProduct.get(productId) || {};
    const totalPosts = numeric(engagement.total_posts);
    return {
      source_case_id: productId,
      unit_price: numeric(row.unit_price),
      weight_kg: numeric(row.weight_kg),
      units_sold: numeric(sales.units_sold),
      revenue: numeric(sales.revenue),
      order_count: sales.order_ids?.size || 0,
      total_engagement: numeric(engagement.total_engagement),
      avg_sentiment: totalPosts ? numeric(engagement.sentiment_sum) / totalPosts : 0.5,
      avg_virality: totalPosts ? numeric(engagement.virality_sum) / totalPosts : 0,
    };
  });

  const definitions = {
    DEMAND_SURGE_MODEL: demand,
    CUSTOMER_SEGMENT_MODEL: customer,
    REVENUE_PREDICT_MODEL: revenue,
    PRODUCT_CLUSTER_MODEL: product,
  };
  return Object.fromEntries(Object.entries(definitions).map(([logicalName, rows]) => [
    logicalName,
    { logicalName, rows, rowCount: rows.length, fingerprint: stableFingerprint(rows) },
  ]));
}

const FEATURE_VIEW_SQL = [
  `
CREATE OR REPLACE VIEW oml_demand_training_v AS
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
       NVL(sales.revenue, 0)         AS revenue,
       CASE
         WHEN ROUND(LEAST(99,
           NVL(eng.avg_virality, 0) * 0.45 +
           LEAST(NVL(eng.total_posts, 0), 40) * 0.9 +
           LEAST(NVL(eng.viral_posts, 0), 10) * 6 +
           LEAST(NVL(eng.rising_posts, 0), 15) * 2 +
           LEAST(NVL(eng.total_views, 0) / 2000, 25) +
           LEAST(NVL(sales.units_sold, 0), 80) * 0.2
         ), 1) >= 65 THEN 'SURGE'
         ELSE 'STABLE'
       END AS surge_label
FROM products p
LEFT JOIN (
  SELECT ppm.product_id,
         COUNT(*) AS total_posts,
         AVG(sp.sentiment_score) AS avg_sentiment,
         SUM(sp.likes_count) AS total_likes,
         SUM(sp.shares_count) AS total_shares,
         SUM(sp.views_count) AS total_views,
         AVG(sp.virality_score) AS avg_virality,
         SUM(CASE WHEN sp.momentum_flag = 'viral' THEN 1 ELSE 0 END) AS viral_posts,
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
  GROUP BY oi.product_id
) sales ON sales.product_id = p.product_id
WHERE p.is_active = 1
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
  ) oi_cnt ON oi_cnt.order_id = o.order_id
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
WHERE o.order_total IS NOT NULL
`,
  `
CREATE OR REPLACE VIEW oml_product_cluster_v AS
SELECT p.product_id,
       p.unit_price,
       NVL(p.weight_kg, 0) AS weight_kg,
       NVL(sales.units_sold, 0) AS units_sold,
       NVL(sales.revenue, 0) AS revenue,
       NVL(sales.order_count, 0) AS order_count,
       NVL(eng.total_engagement, 0) AS total_engagement,
       NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
       NVL(eng.avg_virality, 0) AS avg_virality
FROM products p
LEFT JOIN (
  SELECT oi.product_id,
         SUM(oi.quantity) AS units_sold,
         SUM(oi.line_total) AS revenue,
         COUNT(DISTINCT oi.order_id) AS order_count
  FROM order_items oi
  GROUP BY oi.product_id
) sales ON sales.product_id = p.product_id
LEFT JOIN (
  SELECT ppm.product_id,
         SUM(sp.likes_count + sp.shares_count + sp.comments_count) AS total_engagement,
         AVG(sp.sentiment_score) AS avg_sentiment,
         AVG(sp.virality_score) AS avg_virality
  FROM post_product_mentions ppm
  JOIN social_posts sp ON sp.post_id = ppm.post_id
  GROUP BY ppm.product_id
) eng ON eng.product_id = p.product_id
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
    case_id_column_name => 'PRODUCT_ID',
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

const CANDIDATE_MODEL_DEFINITIONS = [
  {
    logicalName: 'DEMAND_SURGE_MODEL',
    prefix: 'RTDS',
    viewPrefix: 'RTDV',
    miningFunction: 'DBMS_DATA_MINING.CLASSIFICATION',
    stageTable: 'APP_OML_STAGE_DEMAND',
    viewColumns: `source_case_id product_id, category, unit_price, total_posts,
      avg_sentiment, total_likes, total_shares, total_views, avg_virality,
      viral_posts, rising_posts, units_sold, revenue, surge_label`,
    caseId: 'PRODUCT_ID',
    target: 'SURGE_LABEL',
    settings: 'OML_RF_SETTINGS',
    proof: (name, view) => `SELECT PREDICTION(${name} USING *) proof_value FROM ${view} FETCH FIRST 1 ROW ONLY`,
  },
  {
    logicalName: 'CUSTOMER_SEGMENT_MODEL',
    prefix: 'RTCS',
    viewPrefix: 'RTCV',
    miningFunction: 'DBMS_DATA_MINING.CLUSTERING',
    stageTable: 'APP_OML_STAGE_CUSTOMER',
    viewColumns: `source_case_id customer_id, lifetime_value, recency_days,
      frequency, monetary, avg_order_value, total_items`,
    caseId: 'CUSTOMER_ID',
    settings: 'OML_CUSTOMER_KM_SETTINGS',
    proof: (name, view) => `SELECT CLUSTER_ID(${name} USING *) proof_value FROM ${view} FETCH FIRST 1 ROW ONLY`,
  },
  {
    logicalName: 'REVENUE_PREDICT_MODEL',
    prefix: 'RTRP',
    viewPrefix: 'RTRV',
    miningFunction: 'DBMS_DATA_MINING.REGRESSION',
    stageTable: 'APP_OML_STAGE_REVENUE',
    viewColumns: `source_case_id order_id, target_revenue, customer_tier,
      lifetime_value, recency_days, frequency, monetary, avg_order_value,
      item_count, total_quantity, avg_item_price, shipping_cost, demand_score,
      social_order_flag`,
    caseId: 'ORDER_ID',
    target: 'TARGET_REVENUE',
    settings: 'OML_REVENUE_GLM_SETTINGS',
    proof: (name, view) => `SELECT PREDICTION(${name} USING *) proof_value FROM ${view} FETCH FIRST 1 ROW ONLY`,
  },
  {
    logicalName: 'PRODUCT_CLUSTER_MODEL',
    prefix: 'RTPC',
    viewPrefix: 'RTPV',
    miningFunction: 'DBMS_DATA_MINING.CLUSTERING',
    stageTable: 'APP_OML_STAGE_PRODUCT',
    viewColumns: `source_case_id product_id, unit_price, weight_kg, units_sold,
      revenue, order_count, total_engagement, avg_sentiment, avg_virality`,
    caseId: 'PRODUCT_ID',
    settings: 'OML_PRODUCT_KM_SETTINGS',
    proof: (name, view) => `SELECT CLUSTER_ID(${name} USING *) proof_value FROM ${view} FETCH FIRST 1 ROW ONLY`,
  },
];

const OML_PROCESS_CHECKPOINTS = Object.freeze([
  Object.freeze({
    beforeView: 'OML_BEFORE_MODEL_1_VIEW',
    afterView: 'OML_AFTER_MODEL_1_VIEW',
    beforeCreate: 'OML_BEFORE_MODEL_1_CREATE',
    afterCreate: 'OML_AFTER_MODEL_1_CREATE',
  }),
  Object.freeze({
    beforeView: 'OML_BEFORE_MODEL_2_VIEW',
    afterView: 'OML_AFTER_MODEL_2_VIEW',
    beforeCreate: 'OML_BEFORE_MODEL_2_CREATE',
    afterCreate: 'OML_AFTER_MODEL_2_CREATE',
  }),
  Object.freeze({
    beforeView: 'OML_BEFORE_MODEL_3_VIEW',
    afterView: 'OML_AFTER_MODEL_3_VIEW',
    beforeCreate: 'OML_BEFORE_MODEL_3_CREATE',
    afterCreate: 'OML_AFTER_MODEL_3_CREATE',
  }),
  Object.freeze({
    beforeView: 'OML_BEFORE_MODEL_4_VIEW',
    afterView: 'OML_AFTER_MODEL_4_VIEW',
    beforeCreate: 'OML_BEFORE_MODEL_4_CREATE',
    afterCreate: 'OML_AFTER_MODEL_4_CREATE',
  }),
]);

function generationSuffix(generationId) {
  const normalized = String(generationId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) throw new Error('A candidate generation id is required.');
  return normalized.slice(-16);
}

function assertModelIdentifier(value) {
  const identifier = String(value || '').toUpperCase();
  if (!/^[A-Z][A-Z0-9_$#]{0,29}$/.test(identifier)) {
    throw new Error('Unsafe OML model identifier.');
  }
  return identifier;
}

function planCandidateOmlAssets(generationId) {
  const suffix = generationSuffix(generationId);
  return CANDIDATE_MODEL_DEFINITIONS.map((definition) => ({
    definition,
    logicalName: definition.logicalName,
    physicalName: assertModelIdentifier(
      `${definition.prefix}_${suffix}`.slice(0, 30)
    ),
    dataView: assertModelIdentifier(
      `${definition.viewPrefix}_${suffix}`.slice(0, 30)
    ),
  }));
}

async function registerCandidateOmlInventoryBeforeTraining(
  connection,
  generationId,
  { failurePhase = null } = {}
) {
  if (!connection) {
    throw new Error(
      'A live Oracle connection is required to inventory candidate OML assets.'
    );
  }
  const plannedModels = planCandidateOmlAssets(generationId);
  await registerCandidateAssetInventory(connection, {
    generationId,
    models: plannedModels,
  });
  // registerCandidateAssetInventory commits this complete deterministic plan.
  // A natural process death after any later stage/training commit therefore
  // leaves a durable generation key that startup reconciliation can discover.
  failAtPhase(failurePhase, 'OML_AFTER_INVENTORY', {
    generationId,
    assetsPlanned: plannedModels.length * 2,
  });
  return plannedModels;
}

const STAGE_INSERTS = {
  DEMAND_SURGE_MODEL: {
    table: 'app_oml_stage_demand',
    columns: ['source_case_id', 'category', 'unit_price', 'total_posts', 'avg_sentiment',
      'total_likes', 'total_shares', 'total_views', 'avg_virality', 'viral_posts',
      'rising_posts', 'units_sold', 'revenue', 'surge_label'],
  },
  CUSTOMER_SEGMENT_MODEL: {
    table: 'app_oml_stage_customer',
    columns: ['source_case_id', 'lifetime_value', 'recency_days', 'frequency',
      'monetary', 'avg_order_value', 'total_items'],
  },
  REVENUE_PREDICT_MODEL: {
    table: 'app_oml_stage_revenue',
    columns: ['source_case_id', 'target_revenue', 'customer_tier', 'lifetime_value',
      'recency_days', 'frequency', 'monetary', 'avg_order_value', 'item_count',
      'total_quantity', 'avg_item_price', 'shipping_cost', 'demand_score',
      'social_order_flag'],
  },
  PRODUCT_CLUSTER_MODEL: {
    table: 'app_oml_stage_product',
    columns: ['source_case_id', 'unit_price', 'weight_kg', 'units_sold', 'revenue',
      'order_count', 'total_engagement', 'avg_sentiment', 'avg_virality'],
  },
};

async function stageCandidateTrainingRows(
  connection,
  dataset,
  generationId,
  { failurePhase = null } = {}
) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(generationId || ''))) {
    throw new Error('Unsafe candidate generation id.');
  }
  const trainingSets = buildCandidateTrainingSets(dataset);
  for (const logicalName of OML_MODEL_NAMES) {
    const stage = STAGE_INSERTS[logicalName];
    const training = trainingSets[logicalName];
    if (!training || training.rowCount === 0) {
      throw new Error(`Candidate training rows are empty for ${logicalName}.`);
    }
    await execSql(connection, `DELETE FROM ${stage.table} WHERE generation_id = :generationId`, { generationId });
    const columnSql = ['generation_id', ...stage.columns].join(', ');
    const valueSql = ['generationId', ...stage.columns].map((name) => `:${name}`).join(', ');
    for (const row of training.rows) {
      await execSql(connection, `
        INSERT INTO ${stage.table} (${columnSql}) VALUES (${valueSql})
      `, { generationId, ...row });
    }
    const oracleProvenance = await computeOracleStageProvenance(connection, {
      generationId,
      stageTable: stage.table,
      columns: stage.columns,
    });
    if (oracleProvenance.trainingRowCount !== training.rowCount) {
      throw new Error(
        `Oracle stage row count mismatch for ${logicalName}: `
        + `${oracleProvenance.trainingRowCount} stored versus ${training.rowCount} declared.`
      );
    }
    // Downstream model inventory, validation, registry, and dataset
    // fingerprinting use only the count/digest recomputed from Oracle rows.
    training.fingerprint = oracleProvenance.trainingFingerprint;
    training.rowCount = oracleProvenance.trainingRowCount;
    await execSql(connection, `
      MERGE INTO app_oml_training_generations target
      USING (
        SELECT :generationId generation_id, :logicalName logical_name,
               :fingerprint training_fingerprint, :rowCount training_row_count
        FROM dual
      ) source
      ON (target.generation_id = source.generation_id
          AND target.logical_name = source.logical_name)
      WHEN MATCHED THEN UPDATE SET
        target.training_fingerprint = source.training_fingerprint,
        target.training_row_count = source.training_row_count,
        target.status = 'STAGED', target.updated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (
        generation_id, logical_name, training_fingerprint,
        training_row_count, status, created_at, updated_at
      ) VALUES (
        source.generation_id, source.logical_name, source.training_fingerprint,
        source.training_row_count, 'STAGED', SYSTIMESTAMP, SYSTIMESTAMP
      )
    `, {
      generationId,
      logicalName,
      fingerprint: oracleProvenance.trainingFingerprint,
      rowCount: oracleProvenance.trainingRowCount,
    });
  }
  // This commit publishes only inactive, generation-keyed training rows.
  // No active application table or active model registry has been touched.
  await connection.commit();
  failAtPhase(failurePhase, 'OML_AFTER_TRAINING_COMMIT', {
    generationId,
    trainingGenerations: OML_MODEL_NAMES.length,
  });
  return trainingSets;
}

async function stageCandidateOmlModels(
  connection,
  generationId,
  trainingSets,
  { failurePhase = null, plannedModels: inventoryPlan = null } = {}
) {
  if (!connection) throw new Error('A live Oracle connection is required to stage OML models.');
  const models = [];
  const deterministicPlan = planCandidateOmlAssets(generationId);
  const plannedModels = deterministicPlan.map((planned, index) => {
    const definition = planned.definition;
    const inventoried = inventoryPlan?.[index];
    if (inventoried
        && (inventoried.logicalName !== planned.logicalName
          || inventoried.physicalName !== planned.physicalName
          || inventoried.dataView !== planned.dataView)) {
      throw new Error(
        `Candidate OML inventory plan drifted for ${definition.logicalName}.`
      );
    }
    const training = trainingSets?.[definition.logicalName];
    if (!training?.fingerprint || !training?.rowCount) {
      throw new Error(`Training provenance is missing for ${definition.logicalName}.`);
    }
    return {
      ...planned,
      trainingFingerprint: training.fingerprint,
      trainingRowCount: training.rowCount,
    };
  });

  try {
    failAtPhase(failurePhase, 'DDL', { generationId });
    for (const [modelIndex, planned] of plannedModels.entries()) {
      const checkpoints = OML_PROCESS_CHECKPOINTS[modelIndex];
      const { definition, physicalName, dataView } = planned;
      const safeGeneration = String(generationId).replace(/'/g, "''");
      failAtPhase(failurePhase, checkpoints.beforeView, {
        generationId,
        logicalName: definition.logicalName,
        dataView,
      });
      await execSql(connection, `
        CREATE OR REPLACE VIEW ${dataView} AS
        SELECT ${definition.viewColumns}
        FROM ${definition.stageTable}
        WHERE generation_id = '${safeGeneration}'
      `);
      failAtPhase(failurePhase, checkpoints.afterView, {
        generationId,
        logicalName: definition.logicalName,
        dataView,
      });
      await markAssetCreated(connection, {
        generationId,
        assetType: 'VIEW',
        assetName: dataView,
      });
      failAtPhase(failurePhase, checkpoints.beforeCreate, {
        generationId,
        logicalName: definition.logicalName,
        physicalName,
      });
      await execSql(connection, `
        BEGIN
          BEGIN
            DBMS_DATA_MINING.DROP_MODEL(:physicalName);
          EXCEPTION
            WHEN OTHERS THEN
              IF SQLCODE NOT IN (-40102, -40201, -40284) THEN RAISE; END IF;
          END;
          DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => :physicalName,
            mining_function     => ${definition.miningFunction},
            data_table_name     => :dataView,
            case_id_column_name => :caseId,
            target_column_name  => :targetName,
            settings_table_name => :settingsTable
          );
        END;
      `, {
        physicalName,
        dataView,
        caseId: definition.caseId,
        targetName: definition.target || null,
        settingsTable: definition.settings,
      });
      failAtPhase(failurePhase, checkpoints.afterCreate, {
        generationId,
        logicalName: definition.logicalName,
        physicalName,
      });
      await markAssetCreated(connection, {
        generationId,
        assetType: 'MODEL',
        assetName: physicalName,
      });
      const trained = await execSql(connection, `
        UPDATE app_oml_training_generations
        SET status = 'TRAINED', updated_at = SYSTIMESTAMP
        WHERE generation_id = :generationId AND logical_name = :logicalName
          AND training_fingerprint = :fingerprint
          AND training_row_count = :rowCount
      `, {
        generationId,
        logicalName: definition.logicalName,
        fingerprint: planned.trainingFingerprint,
        rowCount: planned.trainingRowCount,
      });
      if (Number(trained.rowsAffected || 0) !== 1) {
        throw new Error(`Oracle training provenance changed for ${definition.logicalName}.`);
      }
      const { definition: _definition, ...candidateModel } = planned;
      models.push(candidateModel);
      failAtPhase(failurePhase, `OML_MODEL_${models.length}`, {
        generationId,
        logicalName: definition.logicalName,
        physicalName,
      });
      const forcedFailure = syntheticOmlFailureTarget();
      if (forcedFailure === definition.logicalName
          || forcedFailure === String(models.length)) {
        throw new Error(`Forced candidate model failure at ${definition.logicalName}.`);
      }
    }
  } catch (error) {
    try {
      await markOmlGenerationFailedAndCleanup(connection, generationId, error);
    } catch (cleanupError) {
      error.cleanupError = cleanupError.message;
    }
    throw error;
  }

  await connection.commit();
  return { generationId: String(generationId), models };
}

async function validateCandidateOmlModels(connection, candidate) {
  if (!candidate?.models?.length) throw new Error('Candidate OML model set is empty.');
  for (const definition of CANDIDATE_MODEL_DEFINITIONS) {
    const candidateModel = candidate.models.find((item) => item.logicalName === definition.logicalName);
    if (!candidateModel) throw new Error(`Candidate is missing ${definition.logicalName}.`);
    const physicalName = assertModelIdentifier(candidateModel.physicalName);
    const dataView = assertModelIdentifier(candidateModel.dataView);
    const proof = await execSql(connection, definition.proof(physicalName, dataView));
    if (!proof.rows?.length || proof.rows[0].PROOF_VALUE == null) {
      throw new Error(`Candidate ${physicalName} did not produce a score.`);
    }
    const oracleProvenance = await computeOracleStageProvenance(connection, {
      generationId: candidate.generationId,
      stageTable: STAGE_INSERTS[definition.logicalName].table,
      columns: STAGE_INSERTS[definition.logicalName].columns,
    });
    const provenance = await execSql(connection, `
      SELECT training_fingerprint, training_row_count
      FROM app_oml_training_generations
      WHERE generation_id = :generationId AND logical_name = :logicalName
        AND status = 'TRAINED'
    `, { generationId: candidate.generationId, logicalName: definition.logicalName });
    const row = provenance.rows?.[0];
    if (oracleProvenance.trainingFingerprint !== candidateModel.trainingFingerprint
        || oracleProvenance.trainingRowCount !== Number(candidateModel.trainingRowCount)
        || row?.TRAINING_FINGERPRINT !== oracleProvenance.trainingFingerprint
        || Number(row?.TRAINING_ROW_COUNT || 0) !== oracleProvenance.trainingRowCount) {
      throw new Error(`Candidate training provenance mismatch for ${physicalName}.`);
    }
    await execSql(connection, `
      UPDATE app_oml_training_generations
      SET status = 'VALIDATED', updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId AND logical_name = :logicalName
    `, { generationId: candidate.generationId, logicalName: definition.logicalName });
  }
  return { modelsValidated: candidate.models.length };
}

async function activateCandidateOmlModels(connection, candidate, jobId) {
  for (const model of candidate.models) {
    const physicalName = assertModelIdentifier(model.physicalName);
    await execSql(connection, `
      MERGE INTO app_oml_model_registry target
      USING (
        SELECT :logicalName logical_name, :physicalName physical_name,
               :generationId generation_id, :jobId activated_job_id
        FROM dual
      ) source
      ON (target.logical_name = source.logical_name)
      WHEN MATCHED THEN UPDATE SET
        target.physical_name = source.physical_name,
        target.generation_id = source.generation_id,
        target.activated_job_id = source.activated_job_id,
        target.training_fingerprint = :trainingFingerprint,
        target.training_row_count = :trainingRowCount,
        target.activated_at = SYSTIMESTAMP
      WHEN NOT MATCHED THEN INSERT (
        logical_name, physical_name, generation_id, activated_job_id,
        training_fingerprint, training_row_count, activated_at
      ) VALUES (
        source.logical_name, source.physical_name, source.generation_id,
        source.activated_job_id, :trainingFingerprint, :trainingRowCount,
        SYSTIMESTAMP
      )
    `, {
      logicalName: model.logicalName,
      physicalName,
      generationId: candidate.generationId,
      jobId,
      trainingFingerprint: model.trainingFingerprint,
      trainingRowCount: model.trainingRowCount,
    });
    await execSql(connection, `
      UPDATE app_oml_training_generations
      SET status = 'ACTIVE', updated_at = SYSTIMESTAMP
      WHERE generation_id = :generationId AND logical_name = :logicalName
        AND training_fingerprint = :trainingFingerprint
        AND training_row_count = :trainingRowCount
    `, {
      generationId: candidate.generationId,
      logicalName: model.logicalName,
      trainingFingerprint: model.trainingFingerprint,
      trainingRowCount: model.trainingRowCount,
    });
  }
  await activateOmlAssetInventoryOnConnection(connection, candidate);
}

async function rebuildOmlModels(connection) {
  if (!connection) {
    throw new Error('A live Oracle connection is required to rebuild OML models.');
  }

  const socialScoreSummary = await refreshSocialViralityScores(connection);

  for (const sql of FEATURE_VIEW_SQL) {
    await execSql(connection, sql);
  }

  await dropExistingOmlArtifacts(connection);
  await createSettingsTables(connection);
  await createModels(connection);
  await connection.commit();

  return {
    models_active: await countOmlModels(connection),
    model_names: OML_MODEL_NAMES,
    social_scores: socialScoreSummary,
  };
}

module.exports = {
  OML_MODEL_NAMES,
  planCandidateOmlAssets,
  registerCandidateOmlInventoryBeforeTraining,
  rebuildOmlModels,
  stageCandidateOmlModels,
  stageCandidateTrainingRows,
  validateCandidateOmlModels,
  activateCandidateOmlModels,
  assertModelIdentifier,
  _private: {
    buildCandidateTrainingSets,
    stableFingerprint,
    syntheticOmlFailureTarget,
  },
};
