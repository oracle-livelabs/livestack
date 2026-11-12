/*
 * 12_oml_models.sql
 * Idempotent Oracle Machine Learning training views and DBMS_DATA_MINING models.
 *
 * Run as: PG
 */

SET SERVEROUTPUT ON

CREATE OR REPLACE VIEW oml_demand_training_v AS
WITH product_features AS (
    SELECT
        p.product_id,
        p.category,
        p.unit_price,
        NVL(eng.total_posts, 0)     AS total_posts,
        NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
        NVL(eng.total_likes, 0)     AS total_likes,
        NVL(eng.total_shares, 0)    AS total_shares,
        NVL(eng.total_views, 0)     AS total_views,
        NVL(eng.avg_virality, 0)    AS avg_virality,
        NVL(eng.viral_posts, 0)     AS viral_posts,
        NVL(eng.rising_posts, 0)    AS rising_posts,
        NVL(sales.units_sold, 0)    AS units_sold,
        NVL(sales.revenue, 0)       AS revenue
    FROM products p
    LEFT JOIN (
        SELECT
            ppm.product_id,
            COUNT(*) AS total_posts,
            AVG(sp.sentiment_score) AS avg_sentiment,
            SUM(sp.likes_count) AS total_likes,
            SUM(sp.shares_count) AS total_shares,
            SUM(sp.views_count) AS total_views,
            AVG(sp.virality_score) AS avg_virality,
            SUM(CASE WHEN sp.momentum_flag IN ('viral', 'mega_viral') THEN 1 ELSE 0 END) AS viral_posts,
            SUM(CASE WHEN sp.momentum_flag = 'rising' THEN 1 ELSE 0 END) AS rising_posts
        FROM post_product_mentions ppm
        JOIN social_posts sp ON sp.post_id = ppm.post_id
        GROUP BY ppm.product_id
    ) eng ON eng.product_id = p.product_id
    LEFT JOIN (
        SELECT
            oi.product_id,
            SUM(oi.quantity) AS units_sold,
            SUM(oi.line_total) AS revenue
        FROM order_items oi
        JOIN orders o ON o.order_id = oi.order_id
        WHERE o.order_status NOT IN ('cancelled', 'returned')
        GROUP BY oi.product_id
    ) sales ON sales.product_id = p.product_id
    WHERE p.is_active = 1
)
SELECT
    product_id,
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
    CASE
        WHEN avg_virality >= 45
          OR viral_posts > 0
          OR total_views >= 50000
          OR total_posts >= 3
          OR units_sold >= 25
        THEN 'SURGE'
        ELSE 'NORMAL'
    END AS surge_flag
FROM product_features;

CREATE OR REPLACE VIEW oml_customer_rfm_v AS
SELECT
    c.customer_id,
    NVL(c.lifetime_value, 0) AS lifetime_value,
    NVL(rfm.recency_days, 999) AS recency_days,
    NVL(rfm.frequency, 0) AS frequency,
    NVL(rfm.monetary, 0) AS monetary,
    NVL(rfm.avg_order_value, 0) AS avg_order_value,
    NVL(rfm.total_items, 0) AS total_items
FROM customers c
LEFT JOIN (
    SELECT
        o.customer_id,
        ROUND((
            SELECT MAX(CAST(created_at AS DATE)) FROM orders
        ) - CAST(MAX(o.created_at) AS DATE)) AS recency_days,
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
    WHERE o.order_status NOT IN ('cancelled', 'returned')
    GROUP BY o.customer_id
) rfm ON rfm.customer_id = c.customer_id
WHERE NVL(rfm.frequency, 0) > 0;

CREATE OR REPLACE VIEW oml_revenue_training_v AS
SELECT
    o.order_id,
    o.order_total AS target_revenue,
    c.customer_tier,
    NVL(c.lifetime_value, 0) AS lifetime_value,
    NVL(o.demand_score, 0) AS demand_score,
    NVL(o.shipping_cost, 0) AS shipping_cost,
    NVL(items.item_count, 0) AS item_count,
    NVL(items.avg_item_price, 0) AS avg_item_price,
    NVL(items.category_count, 0) AS category_count,
    NVL(fc.current_load_pct, 0) AS fulfillment_load_pct
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.fulfillment_center_id
LEFT JOIN (
    SELECT
        oi.order_id,
        SUM(oi.quantity) AS item_count,
        AVG(oi.unit_price) AS avg_item_price,
        COUNT(DISTINCT p.category) AS category_count
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    GROUP BY oi.order_id
) items ON items.order_id = o.order_id
WHERE o.order_total IS NOT NULL
  AND o.order_status NOT IN ('cancelled', 'returned');

CREATE OR REPLACE VIEW oml_product_cluster_v AS
SELECT
    p.product_id,
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
    SELECT
        oi.product_id,
        SUM(oi.quantity) AS units_sold,
        SUM(oi.line_total) AS revenue,
        COUNT(DISTINCT oi.order_id) AS order_count
    FROM order_items oi
    JOIN orders o ON o.order_id = oi.order_id
    WHERE o.order_status NOT IN ('cancelled', 'returned')
    GROUP BY oi.product_id
) sales ON sales.product_id = p.product_id
LEFT JOIN (
    SELECT
        ppm.product_id,
        SUM(sp.likes_count + sp.shares_count + sp.comments_count) AS total_engagement,
        AVG(sp.sentiment_score) AS avg_sentiment,
        AVG(sp.virality_score) AS avg_virality
    FROM post_product_mentions ppm
    JOIN social_posts sp ON sp.post_id = ppm.post_id
    GROUP BY ppm.product_id
) eng ON eng.product_id = p.product_id
WHERE p.is_active = 1;

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'DEMAND_SURGE_SETTINGS';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE demand_surge_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    ELSE
        EXECUTE IMMEDIATE 'TRUNCATE TABLE demand_surge_settings';
    END IF;

    EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (''ALGO_NAME'', ''ALGO_RANDOM_FOREST'')';
    EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (''RFOR_NUM_TREES'', ''50'')';
    EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (''PREP_AUTO'', ''ON'')';
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_mining_models
    WHERE model_name = 'DEMAND_SURGE_MODEL';

    IF v_count = 0 THEN
        DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => 'DEMAND_SURGE_MODEL',
            mining_function     => DBMS_DATA_MINING.CLASSIFICATION,
            data_table_name     => 'OML_DEMAND_TRAINING_V',
            case_id_column_name => 'PRODUCT_ID',
            target_column_name  => 'SURGE_FLAG',
            settings_table_name => 'DEMAND_SURGE_SETTINGS'
        );
        DBMS_OUTPUT.PUT_LINE('Created DEMAND_SURGE_MODEL.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('DEMAND_SURGE_MODEL already present.');
    END IF;
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'CUST_SEGMENT_SETTINGS';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE cust_segment_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    ELSE
        EXECUTE IMMEDIATE 'TRUNCATE TABLE cust_segment_settings';
    END IF;

    EXECUTE IMMEDIATE 'INSERT INTO cust_segment_settings VALUES (''ALGO_NAME'', ''ALGO_KMEANS'')';
    EXECUTE IMMEDIATE 'INSERT INTO cust_segment_settings VALUES (''CLUS_NUM_CLUSTERS'', ''4'')';
    EXECUTE IMMEDIATE 'INSERT INTO cust_segment_settings VALUES (''PREP_AUTO'', ''ON'')';
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_mining_models
    WHERE model_name = 'CUSTOMER_SEGMENT_MODEL';

    IF v_count = 0 THEN
        DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => 'CUSTOMER_SEGMENT_MODEL',
            mining_function     => DBMS_DATA_MINING.CLUSTERING,
            data_table_name     => 'OML_CUSTOMER_RFM_V',
            case_id_column_name => 'CUSTOMER_ID',
            settings_table_name => 'CUST_SEGMENT_SETTINGS'
        );
        DBMS_OUTPUT.PUT_LINE('Created CUSTOMER_SEGMENT_MODEL.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('CUSTOMER_SEGMENT_MODEL already present.');
    END IF;
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'REVENUE_PREDICT_SETTINGS';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE revenue_predict_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    ELSE
        EXECUTE IMMEDIATE 'TRUNCATE TABLE revenue_predict_settings';
    END IF;

    EXECUTE IMMEDIATE 'INSERT INTO revenue_predict_settings VALUES (''ALGO_NAME'', ''ALGO_GENERALIZED_LINEAR_MODEL'')';
    EXECUTE IMMEDIATE 'INSERT INTO revenue_predict_settings VALUES (''PREP_AUTO'', ''ON'')';
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_mining_models
    WHERE model_name = 'REVENUE_PREDICT_MODEL';

    IF v_count = 0 THEN
        DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => 'REVENUE_PREDICT_MODEL',
            mining_function     => DBMS_DATA_MINING.REGRESSION,
            data_table_name     => 'OML_REVENUE_TRAINING_V',
            case_id_column_name => 'ORDER_ID',
            target_column_name  => 'TARGET_REVENUE',
            settings_table_name => 'REVENUE_PREDICT_SETTINGS'
        );
        DBMS_OUTPUT.PUT_LINE('Created REVENUE_PREDICT_MODEL.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('REVENUE_PREDICT_MODEL already present.');
    END IF;
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'PROD_CLUSTER_SETTINGS';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE prod_cluster_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    ELSE
        EXECUTE IMMEDIATE 'TRUNCATE TABLE prod_cluster_settings';
    END IF;

    EXECUTE IMMEDIATE 'INSERT INTO prod_cluster_settings VALUES (''ALGO_NAME'', ''ALGO_KMEANS'')';
    EXECUTE IMMEDIATE 'INSERT INTO prod_cluster_settings VALUES (''CLUS_NUM_CLUSTERS'', ''5'')';
    EXECUTE IMMEDIATE 'INSERT INTO prod_cluster_settings VALUES (''PREP_AUTO'', ''ON'')';
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_mining_models
    WHERE model_name = 'PRODUCT_CLUSTER_MODEL';

    IF v_count = 0 THEN
        DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => 'PRODUCT_CLUSTER_MODEL',
            mining_function     => DBMS_DATA_MINING.CLUSTERING,
            data_table_name     => 'OML_PRODUCT_CLUSTER_V',
            case_id_column_name => 'PRODUCT_ID',
            settings_table_name => 'PROD_CLUSTER_SETTINGS'
        );
        DBMS_OUTPUT.PUT_LINE('Created PRODUCT_CLUSTER_MODEL.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('PRODUCT_CLUSTER_MODEL already present.');
    END IF;
END;
/

COMMIT;
