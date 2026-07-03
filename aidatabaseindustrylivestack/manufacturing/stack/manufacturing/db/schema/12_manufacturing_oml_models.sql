/*
 * 12_manufacturing_oml_models.sql
 *
 * Manufacturing Oracle Machine Learning assets.
 *
 * Creates the OML training views and idempotent rebuild procedures used by the
 * manufacturing analytics scene. All model inputs come from the canonical
 * Manufacturing schema.
 */

SET SERVEROUTPUT ON

PROMPT Creating Manufacturing OML training views and rebuild procedures...

CREATE OR REPLACE VIEW oml_demand_training_v AS
WITH product_features AS (
  SELECT
    p.product_id,
    p.category,
    p.unit_price,
    NVL(eng.production_signal_count, 0) AS production_signal_count,
    NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
    NVL(eng.total_acknowledgements, 0) AS total_acknowledgements,
    NVL(eng.total_propagations, 0) AS total_propagations,
    NVL(eng.total_observations, 0) AS total_observations,
    NVL(eng.average_urgency_score, 0) AS average_urgency_score,
    NVL(eng.escalating_signal_count, 0) AS escalating_signal_count,
    NVL(eng.elevated_signal_count, 0) AS elevated_signal_count,
    NVL(sales.units_sold, 0) AS units_sold,
    NVL(sales.revenue, 0) AS revenue
  FROM products p
  LEFT JOIN (
    SELECT
      ppm.manufactured_part_id AS product_id,
      COUNT(*) AS production_signal_count,
      AVG(sp.sentiment_score) AS avg_sentiment,
      SUM(sp.acknowledgement_count) AS total_acknowledgements,
      SUM(sp.propagation_count) AS total_propagations,
      SUM(sp.observation_count) AS total_observations,
      AVG(sp.urgency_score) AS average_urgency_score,
      SUM(CASE WHEN sp.momentum_code IN ('escalating', 'critical') THEN 1 ELSE 0 END) AS escalating_signal_count,
      SUM(CASE WHEN sp.momentum_code = 'elevated' THEN 1 ELSE 0 END) AS elevated_signal_count
    FROM manufacturing_signal_part_mentions ppm
    JOIN manufacturing_production_signals sp ON sp.production_signal_id = ppm.production_signal_id
    GROUP BY ppm.manufactured_part_id
  ) eng ON eng.product_id = p.product_id
  LEFT JOIN (
    SELECT
      oi.manufactured_part_id AS product_id,
      SUM(oi.requested_units) AS units_sold,
      SUM(oi.line_value) AS revenue
    FROM manufacturing_work_order_lines oi
    JOIN manufacturing_work_orders o ON o.work_order_id = oi.work_order_id
    GROUP BY oi.manufactured_part_id
  ) sales ON sales.product_id = p.product_id
  WHERE p.is_active = 1
), ranked_features AS (
  SELECT
    product_features.*,
    NTILE(3) OVER (
      ORDER BY
        (average_urgency_score * 2)
        + (escalating_signal_count * 15)
        + (elevated_signal_count * 8)
        + (LN(1 + total_observations) * 5)
        + (LN(1 + units_sold) * 10)
        + (LN(1 + revenue) * 2),
        product_id
    ) AS demand_band
  FROM product_features
)
SELECT
  product_id,
  category,
  unit_price,
  production_signal_count,
  avg_sentiment,
  total_acknowledgements,
  total_propagations,
  total_observations,
  average_urgency_score,
  escalating_signal_count,
  elevated_signal_count,
  units_sold,
  revenue,
  CASE
    WHEN demand_band = 3 THEN 'SURGE'
    WHEN demand_band = 2 THEN 'WATCH'
    ELSE 'STABLE'
  END AS target_surge
FROM ranked_features;

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
    o.customer_account_id AS customer_id,
    ROUND(SYSDATE - CAST(MAX(o.created_at) AS DATE)) AS recency_days,
    COUNT(DISTINCT o.work_order_id) AS frequency,
    SUM(o.work_order_value) AS monetary,
    AVG(o.work_order_value) AS avg_order_value,
    NVL(SUM(oi_cnt.item_count), 0) AS total_items
  FROM manufacturing_work_orders o
  LEFT JOIN (
    SELECT work_order_id, SUM(requested_units) AS item_count
    FROM manufacturing_work_order_lines
    GROUP BY work_order_id
  ) oi_cnt ON oi_cnt.work_order_id = o.work_order_id
  GROUP BY o.customer_account_id
) rfm ON rfm.customer_id = c.customer_id
WHERE NVL(rfm.frequency, 0) > 0;

CREATE OR REPLACE VIEW oml_revenue_training_v AS
SELECT
  o.work_order_id,
  c.customer_tier,
  o.work_order_status_code,
  NVL(o.demand_urgency_score, 0) AS demand_urgency_score,
  NVL(o.routing_cost, 0) AS routing_cost,
  NVL(oi.line_count, 0) AS line_count,
  NVL(oi.total_quantity, 0) AS total_quantity,
  NVL(oi.distinct_products, 0) AS distinct_products,
  NVL(oi.avg_unit_price, 0) AS avg_unit_price,
  NVL(oi.max_unit_price, 0) AS max_unit_price,
  NVL(c.lifetime_value, 0) AS lifetime_value,
  NVL(fc.current_load_pct, 0) AS center_load_pct,
  NVL(o.work_order_value, 0) AS target_revenue
FROM manufacturing_work_orders o
JOIN customers c ON c.customer_id = o.customer_account_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.assigned_plant_id
LEFT JOIN (
  SELECT
    work_order_id,
    COUNT(*) AS line_count,
    SUM(requested_units) AS total_quantity,
    COUNT(DISTINCT manufactured_part_id) AS distinct_products,
    AVG(planned_unit_value) AS avg_unit_price,
    MAX(planned_unit_value) AS max_unit_price
  FROM manufacturing_work_order_lines
  GROUP BY work_order_id
) oi ON oi.work_order_id = o.work_order_id
WHERE o.work_order_value IS NOT NULL;

CREATE OR REPLACE VIEW oml_product_cluster_v AS
SELECT
  p.product_id,
  NVL(p.unit_price, 0) AS unit_price,
  NVL(p.weight_kg, 0) AS weight_kg,
  NVL(sales.units_sold, 0) AS units_sold,
  NVL(sales.revenue, 0) AS revenue,
  NVL(sales.order_count, 0) AS order_count,
  NVL(eng.total_signal_activity, 0) AS total_signal_activity,
  NVL(eng.avg_sentiment, 0.5) AS avg_sentiment,
  NVL(eng.average_urgency_score, 0) AS average_urgency_score
FROM products p
LEFT JOIN (
  SELECT
    oi.manufactured_part_id AS product_id,
    SUM(oi.requested_units) AS units_sold,
    SUM(oi.line_value) AS revenue,
    COUNT(DISTINCT oi.work_order_id) AS order_count
  FROM manufacturing_work_order_lines oi
  GROUP BY oi.manufactured_part_id
) sales ON sales.product_id = p.product_id
LEFT JOIN (
  SELECT
    ppm.manufactured_part_id AS product_id,
    SUM(sp.acknowledgement_count + sp.propagation_count + sp.observation_count) AS total_signal_activity,
    AVG(sp.sentiment_score) AS avg_sentiment,
    AVG(sp.urgency_score) AS average_urgency_score
  FROM manufacturing_signal_part_mentions ppm
  JOIN manufacturing_production_signals sp ON sp.production_signal_id = ppm.production_signal_id
  GROUP BY ppm.manufactured_part_id
) eng ON eng.product_id = p.product_id
WHERE p.is_active = 1;

CREATE OR REPLACE PROCEDURE rebuild_manufacturing_oml_models(
  p_product_cluster_k IN NUMBER DEFAULT 5
) AUTHID CURRENT_USER AS
  v_product_cluster_k NUMBER := LEAST(GREATEST(NVL(p_product_cluster_k, 5), 2), 15);
  v_count NUMBER;
  v_surge_predictions NUMBER;
  v_prediction_classes NUMBER;

  PROCEDURE drop_model_if_exists(p_model_name IN VARCHAR2) IS
  BEGIN
    DBMS_DATA_MINING.DROP_MODEL(p_model_name);
    DBMS_OUTPUT.PUT_LINE('Dropped OML model ' || p_model_name || '.');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE IN (-40216, -40284) OR INSTR(LOWER(SQLERRM), 'does not exist') > 0 THEN
        DBMS_OUTPUT.PUT_LINE('OML model ' || p_model_name || ' not present; creating fresh.');
      ELSE
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

  PROCEDURE assert_training_rows(p_view_name IN VARCHAR2, p_min_rows IN NUMBER) IS
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || p_view_name INTO v_count;
    IF v_count < p_min_rows THEN
      RAISE_APPLICATION_ERROR(
        -20001,
        p_view_name || ' has ' || v_count || ' rows; expected at least ' || p_min_rows || ' rows before OML rebuild.'
      );
    END IF;
    DBMS_OUTPUT.PUT_LINE(p_view_name || ' rows: ' || v_count);
  END;

  PROCEDURE assert_demand_classes IS
  BEGIN
    SELECT COUNT(DISTINCT target_surge)
    INTO v_count
    FROM oml_demand_training_v;

    IF v_count < 3 THEN
      RAISE_APPLICATION_ERROR(
        -20002,
        'OML_DEMAND_TRAINING_V has ' || v_count || ' target classes; expected SURGE, WATCH, and STABLE before OML rebuild.'
      );
    END IF;
    DBMS_OUTPUT.PUT_LINE('OML_DEMAND_TRAINING_V target classes: ' || v_count);
  END;

  PROCEDURE assert_demand_model_predictions IS
  BEGIN
    EXECUTE IMMEDIATE q'~
      SELECT
        SUM(CASE WHEN predicted_surge = 'SURGE' THEN 1 ELSE 0 END),
        COUNT(DISTINCT predicted_surge)
      FROM (
        SELECT PREDICTION(DEMAND_SURGE_MODEL USING
          category AS category,
          unit_price AS unit_price,
          production_signal_count AS production_signal_count,
          avg_sentiment AS avg_sentiment,
          total_acknowledgements AS total_acknowledgements,
          total_propagations AS total_propagations,
          total_observations AS total_observations,
          average_urgency_score AS average_urgency_score,
          escalating_signal_count AS escalating_signal_count,
          elevated_signal_count AS elevated_signal_count,
          units_sold AS units_sold,
          revenue AS revenue
        ) AS predicted_surge
        FROM oml_demand_training_v
      )
    ~' INTO v_surge_predictions, v_prediction_classes;

    IF v_surge_predictions < 1 OR v_prediction_classes < 3 THEN
      RAISE_APPLICATION_ERROR(
        -20003,
        'DEMAND_SURGE_MODEL predicted ' || v_surge_predictions ||
        ' SURGE rows across ' || v_prediction_classes ||
        ' classes; expected at least one SURGE and all three demand classes.'
      );
    END IF;
    DBMS_OUTPUT.PUT_LINE(
      'DEMAND_SURGE_MODEL validation: ' || v_surge_predictions ||
      ' SURGE rows across ' || v_prediction_classes || ' predicted classes.'
    );
  END;
BEGIN
  -- Invalidate models from the previous dataset before validating the new
  -- training population, so a failed custom rebuild cannot expose stale demo evidence.
  drop_model_if_exists('PRODUCT_CLUSTER_MODEL');
  drop_model_if_exists('REVENUE_PREDICT_MODEL');
  drop_model_if_exists('CUSTOMER_SEGMENT_MODEL');
  drop_model_if_exists('DEMAND_SURGE_MODEL');

  assert_training_rows('OML_DEMAND_TRAINING_V', 20);
  assert_training_rows('OML_CUSTOMER_RFM_V', 100);
  assert_training_rows('OML_REVENUE_TRAINING_V', 100);
  assert_training_rows('OML_PRODUCT_CLUSTER_V', 20);
  assert_demand_classes;

  drop_table_if_exists('DEMAND_SURGE_SETTINGS');
  EXECUTE IMMEDIATE 'CREATE TABLE demand_surge_settings (setting_name VARCHAR2(128), setting_value VARCHAR2(4000))';
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_RANDOM_FOREST;
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.RFOR_NUM_TREES, '50';
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON;
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING 'RFOR_SAMPLING_RATIO', '1';
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING 'TREE_TERM_MINREC_SPLIT', '4';
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING 'TREE_TERM_MINREC_NODE', '2';
  EXECUTE IMMEDIATE 'INSERT INTO demand_surge_settings VALUES (:1, :2)'
    USING 'ODMS_RANDOM_SEED', '42';

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'DEMAND_SURGE_MODEL',
    mining_function     => DBMS_DATA_MINING.CLASSIFICATION,
    data_table_name     => 'OML_DEMAND_TRAINING_V',
    case_id_column_name => 'PRODUCT_ID',
    target_column_name  => 'TARGET_SURGE',
    settings_table_name => 'DEMAND_SURGE_SETTINGS'
  );
  DBMS_OUTPUT.PUT_LINE('Created DEMAND_SURGE_MODEL.');
  assert_demand_model_predictions;

  drop_table_if_exists('CUSTOMER_SEGMENT_SETTINGS');
  EXECUTE IMMEDIATE 'CREATE TABLE customer_segment_settings (setting_name VARCHAR2(128), setting_value VARCHAR2(4000))';
  EXECUTE IMMEDIATE 'INSERT INTO customer_segment_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_KMEANS;
  EXECUTE IMMEDIATE 'INSERT INTO customer_segment_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.CLUS_NUM_CLUSTERS, '4';
  EXECUTE IMMEDIATE 'INSERT INTO customer_segment_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON;

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'CUSTOMER_SEGMENT_MODEL',
    mining_function     => DBMS_DATA_MINING.CLUSTERING,
    data_table_name     => 'OML_CUSTOMER_RFM_V',
    case_id_column_name => 'CUSTOMER_ID',
    settings_table_name => 'CUSTOMER_SEGMENT_SETTINGS'
  );
  DBMS_OUTPUT.PUT_LINE('Created CUSTOMER_SEGMENT_MODEL.');

  drop_table_if_exists('REVENUE_PREDICT_SETTINGS');
  EXECUTE IMMEDIATE 'CREATE TABLE revenue_predict_settings (setting_name VARCHAR2(128), setting_value VARCHAR2(4000))';
  EXECUTE IMMEDIATE 'INSERT INTO revenue_predict_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_GENERALIZED_LINEAR_MODEL;
  EXECUTE IMMEDIATE 'INSERT INTO revenue_predict_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON;

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'REVENUE_PREDICT_MODEL',
    mining_function     => DBMS_DATA_MINING.REGRESSION,
    data_table_name     => 'OML_REVENUE_TRAINING_V',
    case_id_column_name => 'WORK_ORDER_ID',
    target_column_name  => 'TARGET_REVENUE',
    settings_table_name => 'REVENUE_PREDICT_SETTINGS'
  );
  DBMS_OUTPUT.PUT_LINE('Created REVENUE_PREDICT_MODEL.');

  drop_table_if_exists('PRODUCT_CLUSTER_SETTINGS');
  EXECUTE IMMEDIATE 'CREATE TABLE product_cluster_settings (setting_name VARCHAR2(128), setting_value VARCHAR2(4000))';
  EXECUTE IMMEDIATE 'INSERT INTO product_cluster_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.ALGO_NAME, DBMS_DATA_MINING.ALGO_KMEANS;
  EXECUTE IMMEDIATE 'INSERT INTO product_cluster_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.CLUS_NUM_CLUSTERS, TO_CHAR(v_product_cluster_k);
  EXECUTE IMMEDIATE 'INSERT INTO product_cluster_settings VALUES (:1, :2)'
    USING DBMS_DATA_MINING.PREP_AUTO, DBMS_DATA_MINING.PREP_AUTO_ON;

  DBMS_DATA_MINING.CREATE_MODEL(
    model_name          => 'PRODUCT_CLUSTER_MODEL',
    mining_function     => DBMS_DATA_MINING.CLUSTERING,
    data_table_name     => 'OML_PRODUCT_CLUSTER_V',
    case_id_column_name => 'PRODUCT_ID',
    settings_table_name => 'PRODUCT_CLUSTER_SETTINGS'
  );
  DBMS_OUTPUT.PUT_LINE('Created PRODUCT_CLUSTER_MODEL with ' || v_product_cluster_k || ' clusters.');

  COMMIT;
END;
/

SHOW ERRORS PROCEDURE rebuild_manufacturing_oml_models

CREATE OR REPLACE PROCEDURE refresh_manufacturing_oml_models AUTHID CURRENT_USER AS
BEGIN
  rebuild_manufacturing_oml_models;
END;
/

CREATE OR REPLACE PROCEDURE rebuild_demo_oml_models AUTHID CURRENT_USER AS
BEGIN
  rebuild_manufacturing_oml_models;
END;
/

CREATE OR REPLACE PROCEDURE refresh_demo_oml_models AUTHID CURRENT_USER AS
BEGIN
  rebuild_manufacturing_oml_models;
END;
/

COMMENT ON TABLE oml_demand_training_v IS
  'Manufacturing OML training view for DEMAND_SURGE_MODEL. Predicts surge/watch/stable demand risk from production signals and work-order demand.';

COMMENT ON TABLE oml_customer_rfm_v IS
  'Manufacturing OML training view for CUSTOMER_SEGMENT_MODEL. Clusters customer accounts using work-order recency, frequency, value, and volume.';

COMMENT ON TABLE oml_revenue_training_v IS
  'Manufacturing OML training view for REVENUE_PREDICT_MODEL. Predicts work-order value from account, line-item, demand, and plant-capacity features.';

COMMENT ON TABLE oml_product_cluster_v IS
  'Manufacturing OML training view for PRODUCT_CLUSTER_MODEL. Clusters manufactured parts using value, demand, and production-signal activity features.';

SELECT '12_manufacturing_oml_models.sql complete - OML training views and rebuild procedures available.' AS status FROM dual;
