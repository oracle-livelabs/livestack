/*
 * 12_oml_models.sql
 * Energy & Utilities OML lifecycle: four persisted, idempotently rebuilt models.
 * This phase runs after bundled data and semantic views are present. It fails
 * closed: a model creation or verification failure aborts bootstrap.
 */
SET SERVEROUTPUT ON

CREATE OR REPLACE VIEW oml_demand_surge_training_v AS
SELECT p.product_id,
       p.category,
       p.unit_price,
       NVL(SUM(oi.quantity), 0) AS units_sold,
       NVL(SUM(oi.line_total), 0) AS revenue,
       CASE WHEN NVL(SUM(oi.quantity), 0) >= 10 THEN 'SURGE' ELSE 'STABLE' END AS demand_class
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.product_id
GROUP BY p.product_id, p.category, p.unit_price;

CREATE OR REPLACE VIEW oml_customer_segment_training_v AS
SELECT c.customer_id,
       NVL(COUNT(o.order_id), 0) AS request_count,
       NVL(SUM(o.order_total), 0) AS request_value,
       NVL(MAX(TRUNC(SYSDATE) - TRUNC(o.created_at)), 999) AS recency_days
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id;

CREATE OR REPLACE VIEW oml_revenue_predict_training_v AS
SELECT o.order_id,
       o.order_total AS target_revenue,
       NVL(o.shipping_cost, 0) AS logistics_cost,
       NVL(o.demand_score, 0) AS demand_score,
       COUNT(oi.item_id) AS line_count,
       NVL(SUM(oi.quantity), 0) AS unit_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY o.order_id, o.order_total, o.shipping_cost, o.demand_score;

-- Compatibility projection consumed by the existing forecast route. It is a
-- view over the same training rows, not a separately maintained dataset.
CREATE OR REPLACE VIEW oml_revenue_training_v AS
SELECT * FROM oml_revenue_predict_training_v;

CREATE OR REPLACE VIEW oml_product_cluster_training_v AS
SELECT p.product_id,
       p.unit_price,
       NVL(SUM(oi.quantity), 0) AS units_sold,
       NVL(SUM(oi.line_total), 0) AS revenue,
       NVL(COUNT(DISTINCT ppm.post_id), 0) AS signal_mentions,
       NVL(SUM(sp.likes_count + sp.shares_count + sp.views_count), 0) AS total_engagement,
       NVL(AVG(sp.sentiment_score), 0.5) AS avg_sentiment,
       NVL(AVG(sp.virality_score), 0) AS avg_virality
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.product_id
LEFT JOIN post_product_mentions ppm ON ppm.product_id = p.product_id
LEFT JOIN social_posts sp ON sp.post_id = ppm.post_id
GROUP BY p.product_id, p.unit_price;

CREATE OR REPLACE VIEW oml_product_cluster_v AS
SELECT * FROM oml_product_cluster_training_v;

CREATE OR REPLACE PROCEDURE rebuild_utilities_oml_models
AUTHID DEFINER
AS
  PROCEDURE replace_model(
    p_model_name IN VARCHAR2,
    p_function   IN VARCHAR2,
    p_data_view  IN VARCHAR2,
    p_case_id    IN VARCHAR2,
    p_target     IN VARCHAR2 DEFAULT NULL
  ) IS
    v_settings VARCHAR2(30) := LOWER(p_model_name) || '_SET';
    v_count NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM user_mining_models WHERE model_name = p_model_name;
    IF v_count > 0 THEN
      DBMS_DATA_MINING.DROP_MODEL(p_model_name);
    END IF;
    BEGIN EXECUTE IMMEDIATE 'DROP TABLE ' || v_settings || ' PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
    EXECUTE IMMEDIATE 'CREATE TABLE ' || v_settings || ' (setting_name VARCHAR2(30), setting_value VARCHAR2(4000))';
    EXECUTE IMMEDIATE 'INSERT INTO ' || v_settings || ' VALUES (''ALGO_NAME'', :1)' USING
      CASE p_function
        WHEN 'CLASSIFICATION' THEN 'ALGO_RANDOM_FOREST'
        WHEN 'REGRESSION' THEN 'ALGO_GENERALIZED_LINEAR_MODEL'
        ELSE 'ALGO_KMEANS'
      END;
    IF p_function = 'CLUSTERING' THEN
      EXECUTE IMMEDIATE 'INSERT INTO ' || v_settings || ' VALUES (''CLUS_NUM_CLUSTERS'', ''4'')';
    END IF;
    IF p_target IS NULL THEN
      DBMS_DATA_MINING.CREATE_MODEL(
        model_name => p_model_name, mining_function => p_function,
        data_table_name => p_data_view, case_id_column_name => p_case_id,
        settings_table_name => v_settings
      );
    ELSE
      DBMS_DATA_MINING.CREATE_MODEL(
        model_name => p_model_name, mining_function => p_function,
        data_table_name => p_data_view, case_id_column_name => p_case_id,
        target_column_name => p_target, settings_table_name => v_settings
      );
    END IF;
  END replace_model;
BEGIN
  replace_model('DEMAND_SURGE_MODEL', 'CLASSIFICATION', 'OML_DEMAND_SURGE_TRAINING_V', 'PRODUCT_ID', 'DEMAND_CLASS');
  replace_model('CUSTOMER_SEGMENT_MODEL', 'CLUSTERING', 'OML_CUSTOMER_SEGMENT_TRAINING_V', 'CUSTOMER_ID');
  replace_model('REVENUE_PREDICT_MODEL', 'REGRESSION', 'OML_REVENUE_PREDICT_TRAINING_V', 'ORDER_ID', 'TARGET_REVENUE');
  replace_model('PRODUCT_CLUSTER_MODEL', 'CLUSTERING', 'OML_PRODUCT_CLUSTER_TRAINING_V', 'PRODUCT_ID');
END rebuild_utilities_oml_models;
/

BEGIN
  rebuild_utilities_oml_models;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_mining_models
  WHERE model_name IN ('DEMAND_SURGE_MODEL', 'CUSTOMER_SEGMENT_MODEL', 'REVENUE_PREDICT_MODEL', 'PRODUCT_CLUSTER_MODEL');
  IF v_count <> 4 THEN
    RAISE_APPLICATION_ERROR(-20071, 'Energy & Utilities OML lifecycle did not create all four required models');
  END IF;
END;
/

COMMIT;
