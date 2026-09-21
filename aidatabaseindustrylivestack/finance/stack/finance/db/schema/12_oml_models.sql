/*
 * 12_oml_models.sql
 * Finance demo Oracle Machine Learning models
 *
 * Run as the application schema owner after core tables and demo data are loaded.
 * The script is idempotent: it replaces the training views, refreshes settings
 * tables, drops prior demo models, and rebuilds the persisted DBMS_DATA_MINING
 * models used by backend/routes/ml.js.
 */

WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON

CREATE OR REPLACE VIEW oml_demand_training_v AS
WITH product_features AS (
    SELECT /*+ NO_PARALLEL */
           p.product_id,
           p.category,
           p.unit_price,
           NVL(eng.total_posts, 0)      AS total_posts,
           NVL(eng.avg_sentiment, 0.5)  AS avg_sentiment,
           NVL(eng.total_likes, 0)      AS total_likes,
           NVL(eng.total_shares, 0)     AS total_shares,
           NVL(eng.total_views, 0)      AS total_views,
           NVL(eng.avg_virality, 0)     AS avg_virality,
           NVL(eng.viral_posts, 0)      AS viral_posts,
           NVL(eng.rising_posts, 0)     AS rising_posts,
           NVL(sales.units_sold, 0)     AS units_sold,
           NVL(sales.revenue, 0)        AS revenue
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
        WHERE o.order_status NOT IN ('cancelled', 'returned')
        GROUP BY oi.product_id
    ) sales ON sales.product_id = p.product_id
    WHERE p.is_active = 1
),
scored AS (
    SELECT pf.*,
           (
             NVL(pf.avg_virality, 0) * 0.45 +
             LEAST(NVL(pf.total_posts, 0), 40) * 0.9 +
             LEAST(NVL(pf.viral_posts, 0), 10) * 6 +
             LEAST(NVL(pf.rising_posts, 0), 15) * 2 +
             LEAST(NVL(pf.total_views, 0) / 2000, 25) +
             LEAST(NVL(pf.units_sold, 0), 80) * 0.2
           ) AS risk_signal_score
    FROM product_features pf
),
ranked AS (
    SELECT scored.*,
           NTILE(4) OVER (
             ORDER BY risk_signal_score DESC, avg_virality DESC, total_posts DESC, product_id
           ) AS risk_quartile
    FROM scored
)
SELECT product_id,
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
       CASE WHEN risk_quartile = 1 THEN 'SURGE' ELSE 'STABLE' END AS surge_label
FROM ranked;

CREATE OR REPLACE VIEW oml_customer_segment_v AS
SELECT /*+ NO_PARALLEL */
       c.customer_id,
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
    WHERE o.order_status NOT IN ('cancelled', 'returned')
    GROUP BY o.customer_id
) rfm ON rfm.customer_id = c.customer_id
WHERE NVL(rfm.frequency, 0) > 0;

CREATE OR REPLACE VIEW oml_revenue_training_v AS
SELECT /*+ NO_PARALLEL */
       o.order_id,
       c.customer_tier,
       o.order_status,
       NVL(c.lifetime_value, 0) AS lifetime_value,
       NVL(o.shipping_cost, 0) AS shipping_cost,
       NVL(o.demand_score, 0) AS demand_score,
       NVL(o.fulfillment_center_id, 0) AS fulfillment_center_id,
       ROUND(SYSDATE - CAST(o.created_at AS DATE)) AS order_age_days,
       NVL(items.item_count, 0) AS item_count,
       NVL(items.distinct_products, 0) AS distinct_products,
       NVL(items.avg_item_price, 0) AS avg_item_price,
       NVL(items.max_item_price, 0) AS max_item_price,
       NVL(o.order_total, 0) AS target_revenue
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN (
    SELECT order_id,
           SUM(quantity) AS item_count,
           COUNT(DISTINCT product_id) AS distinct_products,
           AVG(unit_price) AS avg_item_price,
           MAX(unit_price) AS max_item_price
    FROM order_items
    GROUP BY order_id
) items ON items.order_id = o.order_id
WHERE o.order_status NOT IN ('cancelled', 'returned')
  AND NVL(o.order_total, 0) > 0;

CREATE OR REPLACE VIEW oml_product_cluster_v AS
SELECT /*+ NO_PARALLEL */
       p.product_id,
       NVL(p.unit_price, 0) AS unit_price,
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
    JOIN orders o ON o.order_id = oi.order_id
    WHERE o.order_status NOT IN ('cancelled', 'returned')
    GROUP BY oi.product_id
) sales ON sales.product_id = p.product_id
LEFT JOIN (
    SELECT ppm.product_id,
           SUM(sp.likes_count + sp.shares_count + sp.views_count) AS total_engagement,
           AVG(sp.sentiment_score) AS avg_sentiment,
           AVG(sp.virality_score) AS avg_virality
    FROM post_product_mentions ppm
    JOIN social_posts sp ON sp.post_id = ppm.post_id
    GROUP BY ppm.product_id
) eng ON eng.product_id = p.product_id
WHERE p.is_active = 1;

DECLARE
    v_count NUMBER;

    PROCEDURE drop_model_if_exists(p_model_name IN VARCHAR2) IS
    BEGIN
        SELECT COUNT(*)
        INTO v_count
        FROM user_mining_models
        WHERE model_name = UPPER(p_model_name);

        IF v_count > 0 THEN
            DBMS_DATA_MINING.DROP_MODEL(p_model_name);
            DBMS_OUTPUT.PUT_LINE('Dropped model ' || p_model_name || '.');
        END IF;
    END;

    PROCEDURE drop_table_if_exists(p_table_name IN VARCHAR2) IS
    BEGIN
        SELECT COUNT(*)
        INTO v_count
        FROM user_tables
        WHERE table_name = UPPER(p_table_name);

        IF v_count > 0 THEN
            EXECUTE IMMEDIATE 'DROP TABLE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(p_table_name) || ' PURGE';
        END IF;
    END;
BEGIN
    SELECT COUNT(DISTINCT surge_label)
    INTO v_count
    FROM oml_demand_training_v;

    IF v_count < 2 THEN
        RAISE_APPLICATION_ERROR(-20012, 'DEMAND_SURGE_MODEL requires both SURGE and STABLE training classes.');
    END IF;

    drop_model_if_exists('DEMAND_SURGE_MODEL');
    drop_model_if_exists('CUSTOMER_SEGMENT_MODEL');
    drop_model_if_exists('REVENUE_PREDICT_MODEL');
    drop_model_if_exists('PRODUCT_CLUSTER_MODEL');

    drop_table_if_exists('OML_DEMAND_SETTINGS');
    drop_table_if_exists('OML_CUSTOMER_SEGMENT_SETTINGS');
    drop_table_if_exists('OML_REVENUE_SETTINGS');
    drop_table_if_exists('OML_PRODUCT_CLUSTER_SETTINGS');

    EXECUTE IMMEDIATE 'CREATE TABLE oml_demand_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    EXECUTE IMMEDIATE 'CREATE TABLE oml_customer_segment_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    EXECUTE IMMEDIATE 'CREATE TABLE oml_revenue_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    EXECUTE IMMEDIATE 'CREATE TABLE oml_product_cluster_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';

    EXECUTE IMMEDIATE q'[INSERT INTO oml_demand_settings VALUES ('ALGO_NAME', 'ALGO_RANDOM_FOREST')]';
    EXECUTE IMMEDIATE q'[INSERT INTO oml_demand_settings VALUES ('PREP_AUTO', 'ON')]';

    EXECUTE IMMEDIATE q'[INSERT INTO oml_customer_segment_settings VALUES ('ALGO_NAME', 'ALGO_KMEANS')]';
    EXECUTE IMMEDIATE q'[INSERT INTO oml_customer_segment_settings VALUES ('PREP_AUTO', 'ON')]';
    EXECUTE IMMEDIATE q'[INSERT INTO oml_customer_segment_settings VALUES ('CLUS_NUM_CLUSTERS', '4')]';

    EXECUTE IMMEDIATE q'[INSERT INTO oml_revenue_settings VALUES ('ALGO_NAME', 'ALGO_GENERALIZED_LINEAR_MODEL')]';
    EXECUTE IMMEDIATE q'[INSERT INTO oml_revenue_settings VALUES ('PREP_AUTO', 'ON')]';

    EXECUTE IMMEDIATE q'[INSERT INTO oml_product_cluster_settings VALUES ('ALGO_NAME', 'ALGO_KMEANS')]';
    EXECUTE IMMEDIATE q'[INSERT INTO oml_product_cluster_settings VALUES ('PREP_AUTO', 'ON')]';
    EXECUTE IMMEDIATE q'[INSERT INTO oml_product_cluster_settings VALUES ('CLUS_NUM_CLUSTERS', '5')]';

    COMMIT;

    DBMS_DATA_MINING.CREATE_MODEL(
        model_name           => 'DEMAND_SURGE_MODEL',
        mining_function      => DBMS_DATA_MINING.CLASSIFICATION,
        data_table_name      => 'OML_DEMAND_TRAINING_V',
        case_id_column_name  => 'PRODUCT_ID',
        target_column_name   => 'SURGE_LABEL',
        settings_table_name  => 'OML_DEMAND_SETTINGS'
    );
    DBMS_OUTPUT.PUT_LINE('Created DEMAND_SURGE_MODEL.');

    DBMS_DATA_MINING.CREATE_MODEL(
        model_name           => 'CUSTOMER_SEGMENT_MODEL',
        mining_function      => DBMS_DATA_MINING.CLUSTERING,
        data_table_name      => 'OML_CUSTOMER_SEGMENT_V',
        case_id_column_name  => 'CUSTOMER_ID',
        settings_table_name  => 'OML_CUSTOMER_SEGMENT_SETTINGS'
    );
    DBMS_OUTPUT.PUT_LINE('Created CUSTOMER_SEGMENT_MODEL.');

    DBMS_DATA_MINING.CREATE_MODEL(
        model_name           => 'REVENUE_PREDICT_MODEL',
        mining_function      => DBMS_DATA_MINING.REGRESSION,
        data_table_name      => 'OML_REVENUE_TRAINING_V',
        case_id_column_name  => 'ORDER_ID',
        target_column_name   => 'TARGET_REVENUE',
        settings_table_name  => 'OML_REVENUE_SETTINGS'
    );
    DBMS_OUTPUT.PUT_LINE('Created REVENUE_PREDICT_MODEL.');

    DBMS_DATA_MINING.CREATE_MODEL(
        model_name           => 'PRODUCT_CLUSTER_MODEL',
        mining_function      => DBMS_DATA_MINING.CLUSTERING,
        data_table_name      => 'OML_PRODUCT_CLUSTER_V',
        case_id_column_name  => 'PRODUCT_ID',
        settings_table_name  => 'OML_PRODUCT_CLUSTER_SETTINGS'
    );
    DBMS_OUTPUT.PUT_LINE('Created PRODUCT_CLUSTER_MODEL.');
END;
/

SELECT model_name,
       mining_function,
       algorithm
FROM user_mining_models
WHERE model_name IN (
    'DEMAND_SURGE_MODEL',
    'CUSTOMER_SEGMENT_MODEL',
    'REVENUE_PREDICT_MODEL',
    'PRODUCT_CLUSTER_MODEL'
)
ORDER BY model_name;

COMMIT;
