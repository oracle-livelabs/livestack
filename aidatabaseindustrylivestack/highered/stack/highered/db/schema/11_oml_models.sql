/*
 * 11_oml_models.sql
 * Training views and in-database DBMS_DATA_MINING models for the higher education demo.
 *
 * Safe to rerun after data imports. The HYDRATE_OML_MODELS procedure drops and
 * recreates the four predictive mining models from current relational data.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT Creating OML training and scoring views...

CREATE OR REPLACE VIEW oml_demand_training_v AS
WITH product_features AS (
    SELECT
        p.product_id,
        p.category,
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
        NVL(fc.max_social_factor, 1) AS max_social_factor
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
        GROUP BY oi.product_id
    ) sales ON sales.product_id = p.product_id
    LEFT JOIN (
        SELECT product_id, MAX(social_factor) AS max_social_factor
        FROM demand_forecasts
        GROUP BY product_id
    ) fc ON fc.product_id = p.product_id
    WHERE p.is_active = 1
),
scored AS (
    SELECT
        product_features.*,
        LEAST(99,
            NVL(avg_virality, 0) * 0.45 +
            LEAST(NVL(total_posts, 0), 40) * 0.9 +
            LEAST(NVL(viral_posts, 0), 10) * 6 +
            LEAST(NVL(rising_posts, 0), 15) * 2 +
            LEAST(NVL(total_views, 0) / 2000, 25) +
            LEAST(NVL(units_sold, 0), 80) * 0.2 +
            GREATEST(0, NVL(max_social_factor, 1) - 1) * 15
        ) AS surge_score
    FROM product_features
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
        WHEN surge_score >= 65 THEN 'SURGE'
        WHEN surge_score >= 45 THEN 'WATCH'
        ELSE 'STABLE'
    END AS surge_flag
FROM scored;
/

CREATE OR REPLACE VIEW oml_customer_rfm_v AS
SELECT
    c.customer_id,
    c.lifetime_value,
    NVL(rfm.recency_days, 999) AS recency_days,
    NVL(rfm.frequency, 0) AS frequency,
    NVL(rfm.monetary, 0) AS monetary,
    NVL(rfm.avg_order_value, 0) AS avg_order_value,
    NVL(rfm.total_items, 0) AS total_items
FROM customers c
LEFT JOIN (
    SELECT
        o.customer_id,
        GREATEST(0, ROUND((SELECT MAX(CAST(created_at AS DATE)) FROM orders) - CAST(MAX(o.created_at) AS DATE))) AS recency_days,
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
WHERE NVL(rfm.frequency, 0) > 0;
/

CREATE OR REPLACE VIEW oml_revenue_training_v AS
SELECT
    o.order_id,
    o.order_total AS target_revenue,
    NVL(c.customer_tier, 'standard') AS customer_tier,
    NVL(c.lifetime_value, 0) AS lifetime_value,
    NVL(o.demand_score, 0) AS demand_score,
    NVL(items.item_count, 0) AS item_count,
    NVL(items.avg_item_price, 0) AS avg_item_price,
    NVL(o.shipping_cost, 0) AS shipping_cost,
    CASE WHEN o.social_source_id IS NULL THEN 0 ELSE 1 END AS social_signal,
    NVL(o.fulfillment_center_id, 0) AS fulfillment_center_id,
    GREATEST(0, ROUND((SELECT MAX(CAST(created_at AS DATE)) FROM orders) - CAST(o.created_at AS DATE))) AS request_age_days
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN (
    SELECT
        order_id,
        SUM(quantity) AS item_count,
        AVG(unit_price) AS avg_item_price
    FROM order_items
    GROUP BY order_id
) items ON items.order_id = o.order_id
WHERE o.order_total IS NOT NULL;
/

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
        product_id,
        SUM(quantity) AS units_sold,
        SUM(line_total) AS revenue,
        COUNT(DISTINCT order_id) AS order_count
    FROM order_items
    GROUP BY product_id
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
/

CREATE OR REPLACE PROCEDURE hydrate_oml_models AS
    v_count NUMBER;

    PROCEDURE drop_model_if_exists(p_model_name VARCHAR2) IS
    BEGIN
        DBMS_DATA_MINING.DROP_MODEL(p_model_name);
        DBMS_OUTPUT.PUT_LINE('Dropped model ' || p_model_name || '.');
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE NOT IN (-40102, -40284) THEN
                DBMS_OUTPUT.PUT_LINE('Skipping drop for ' || p_model_name || ': ' || SQLERRM);
            END IF;
    END;

    PROCEDURE drop_table_if_exists(p_table_name VARCHAR2) IS
    BEGIN
        EXECUTE IMMEDIATE 'DROP TABLE ' || p_table_name || ' PURGE';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE != -942 THEN
                RAISE;
            END IF;
    END;

    PROCEDURE add_setting(p_table_name VARCHAR2, p_name VARCHAR2, p_value VARCHAR2) IS
    BEGIN
        EXECUTE IMMEDIATE
            'INSERT INTO ' || p_table_name || ' (setting_name, setting_value) VALUES (:name, :value)'
            USING p_name, p_value;
    END;
BEGIN
    SELECT COUNT(*) INTO v_count FROM oml_demand_training_v;
    IF v_count < 2 THEN
        DBMS_OUTPUT.PUT_LINE('Skipping OML hydration: not enough demand training rows.');
        RETURN;
    END IF;

    drop_model_if_exists('DEMAND_SURGE_MODEL');
    drop_model_if_exists('CUSTOMER_SEGMENT_MODEL');
    drop_model_if_exists('REVENUE_PREDICT_MODEL');
    drop_model_if_exists('PRODUCT_CLUSTER_MODEL');

    drop_table_if_exists('DEMAND_SURGE_SETTINGS');
    drop_table_if_exists('CUSTOMER_SEGMENT_SETTINGS');
    drop_table_if_exists('REVENUE_PREDICT_SETTINGS');
    drop_table_if_exists('PRODUCT_CLUSTER_SETTINGS');

    EXECUTE IMMEDIATE 'CREATE TABLE demand_surge_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    add_setting('DEMAND_SURGE_SETTINGS', DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_RANDOM_FOREST);
    add_setting('DEMAND_SURGE_SETTINGS', DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON);

    DBMS_DATA_MINING.CREATE_MODEL(
        model_name          => 'DEMAND_SURGE_MODEL',
        mining_function     => DBMS_DATA_MINING.CLASSIFICATION,
        data_table_name     => 'OML_DEMAND_TRAINING_V',
        case_id_column_name => 'PRODUCT_ID',
        target_column_name  => 'SURGE_FLAG',
        settings_table_name => 'DEMAND_SURGE_SETTINGS'
    );
    DBMS_OUTPUT.PUT_LINE('Created DEMAND_SURGE_MODEL.');

    SELECT COUNT(*) INTO v_count FROM oml_customer_rfm_v;
    IF v_count >= 4 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE customer_segment_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
        add_setting('CUSTOMER_SEGMENT_SETTINGS', DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_KMEANS);
        add_setting('CUSTOMER_SEGMENT_SETTINGS', DBMS_DATA_MINING.CLUS_NUM_CLUSTERS, '4');
        add_setting('CUSTOMER_SEGMENT_SETTINGS', DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON);

        DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => 'CUSTOMER_SEGMENT_MODEL',
            mining_function     => DBMS_DATA_MINING.CLUSTERING,
            data_table_name     => 'OML_CUSTOMER_RFM_V',
            case_id_column_name => 'CUSTOMER_ID',
            settings_table_name => 'CUSTOMER_SEGMENT_SETTINGS'
        );
        DBMS_OUTPUT.PUT_LINE('Created CUSTOMER_SEGMENT_MODEL.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('Skipping CUSTOMER_SEGMENT_MODEL: fewer than 4 RFM rows.');
    END IF;

    SELECT COUNT(*) INTO v_count FROM oml_revenue_training_v;
    IF v_count >= 2 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE revenue_predict_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
        add_setting('REVENUE_PREDICT_SETTINGS', DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_GENERALIZED_LINEAR_MODEL);
        add_setting('REVENUE_PREDICT_SETTINGS', DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON);

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
        DBMS_OUTPUT.PUT_LINE('Skipping REVENUE_PREDICT_MODEL: fewer than 2 request rows.');
    END IF;

    SELECT COUNT(*) INTO v_count FROM oml_product_cluster_v;
    IF v_count >= 4 THEN
        EXECUTE IMMEDIATE 'CREATE TABLE product_cluster_settings (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
        add_setting('PRODUCT_CLUSTER_SETTINGS', DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_KMEANS);
        add_setting('PRODUCT_CLUSTER_SETTINGS', DBMS_DATA_MINING.CLUS_NUM_CLUSTERS, '4');
        add_setting('PRODUCT_CLUSTER_SETTINGS', DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON);

        DBMS_DATA_MINING.CREATE_MODEL(
            model_name          => 'PRODUCT_CLUSTER_MODEL',
            mining_function     => DBMS_DATA_MINING.CLUSTERING,
            data_table_name     => 'OML_PRODUCT_CLUSTER_V',
            case_id_column_name => 'PRODUCT_ID',
            settings_table_name => 'PRODUCT_CLUSTER_SETTINGS'
        );
        DBMS_OUTPUT.PUT_LINE('Created PRODUCT_CLUSTER_MODEL.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('Skipping PRODUCT_CLUSTER_MODEL: fewer than 4 service rows.');
    END IF;
END;
/

SHOW ERRORS PROCEDURE hydrate_oml_models

BEGIN
    hydrate_oml_models;
END;
/

COMMIT;
