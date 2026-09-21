/*
 * Record truthful provenance for the immutable bootstrap OML generation.
 *
 * Every fingerprint is derived from the actual ordered training-view content.
 * This script runs only after all four native models and lifecycle tables
 * exist. It never replaces a later active candidate generation.
 */
ALTER SESSION SET NLS_NUMERIC_CHARACTERS = '.,';

DECLARE
    v_nonbootstrap_active PLS_INTEGER;

    PROCEDURE register_model(
        p_logical_name   IN VARCHAR2,
        p_physical_name  IN VARCHAR2,
        p_training_view  IN VARCHAR2,
        p_settings_table IN VARCHAR2,
        p_row_expression IN VARCHAR2
    ) IS
        v_sql         VARCHAR2(32767);
        v_row_count   NUMBER;
        v_fingerprint VARCHAR2(64);
        v_status      VARCHAR2(20);
    BEGIN
        v_sql :=
          'SELECT COUNT(*), LOWER(RAWTOHEX(STANDARD_HASH(' ||
          'TO_CHAR(COUNT(*)) || '':'' || ' ||
          'TO_CHAR(NVL(SUM(row_hash),0)) || '':'' || ' ||
          'TO_CHAR(NVL(MIN(row_hash),0)) || '':'' || ' ||
          'TO_CHAR(NVL(MAX(row_hash),0)), ''SHA256''))) ' ||
          'FROM (SELECT ORA_HASH(' || p_row_expression || ') row_hash FROM ' ||
          DBMS_ASSERT.SIMPLE_SQL_NAME(p_training_view) || ')';
        EXECUTE IMMEDIATE v_sql INTO v_row_count, v_fingerprint;

        IF v_row_count < 1 OR v_fingerprint IS NULL THEN
            RAISE_APPLICATION_ERROR(
              -20440,
              'Bootstrap OML provenance is empty for ' || p_logical_name
            );
        END IF;

        v_status := CASE WHEN v_nonbootstrap_active = 0 THEN 'active' ELSE 'validated' END;

        MERGE INTO app_oml_generation_models target
        USING (
          SELECT 'bootstrap-v1' generation_id,
                 p_logical_name logical_name,
                 p_physical_name physical_name,
                 p_training_view training_table,
                 p_settings_table settings_table,
                 v_fingerprint training_fingerprint,
                 v_row_count training_row_count
          FROM dual
        ) source
        ON (
          target.generation_id = source.generation_id
          AND target.logical_name = source.logical_name
        )
        WHEN MATCHED THEN UPDATE SET
          target.physical_name = source.physical_name,
          target.training_table = source.training_table,
          target.settings_table = source.settings_table,
          target.training_fingerprint = source.training_fingerprint,
          target.training_row_count = source.training_row_count,
          target.status = v_status,
          target.validated_at = SYSTIMESTAMP,
          target.activated_at = CASE WHEN v_status = 'active'
            THEN SYSTIMESTAMP ELSE target.activated_at END
        WHEN NOT MATCHED THEN INSERT(
          generation_id, logical_name, physical_name, training_table,
          settings_table, training_fingerprint, training_row_count,
          status, validated_at, activated_at
        ) VALUES(
          source.generation_id, source.logical_name, source.physical_name,
          source.training_table, source.settings_table,
          source.training_fingerprint, source.training_row_count,
          v_status, SYSTIMESTAMP,
          CASE WHEN v_status = 'active' THEN SYSTIMESTAMP ELSE NULL END
        );

        FOR asset IN (
          SELECT 'MODEL' asset_type, p_physical_name asset_name FROM dual
          UNION ALL SELECT 'TRAINING_TABLE', p_training_view FROM dual
          UNION ALL SELECT 'SETTINGS_TABLE', p_settings_table FROM dual
        ) LOOP
          MERGE INTO app_oml_generation_assets target
          USING (
            SELECT 'bootstrap-v1' generation_id, p_logical_name logical_name,
                   asset.asset_type asset_type, asset.asset_name asset_name
            FROM dual
          ) source
          ON (
            target.generation_id = source.generation_id
            AND target.asset_type = source.asset_type
            AND target.asset_name = source.asset_name
          )
          WHEN MATCHED THEN UPDATE SET
            target.status = CASE WHEN v_status = 'active' THEN 'active' ELSE 'created' END,
            target.materialized_at = NVL(target.materialized_at, SYSTIMESTAMP)
          WHEN NOT MATCHED THEN INSERT(
            generation_id, logical_name, asset_type, asset_name, status,
            created_at, materialized_at
          ) VALUES(
            source.generation_id, source.logical_name, source.asset_type,
            source.asset_name,
            CASE WHEN v_status = 'active' THEN 'active' ELSE 'created' END,
            SYSTIMESTAMP, SYSTIMESTAMP
          );
        END LOOP;

        MERGE INTO app_oml_model_registry target
        USING (
          SELECT p_logical_name logical_name, p_physical_name physical_name,
                 v_fingerprint training_fingerprint,
                 v_row_count training_row_count
          FROM dual
        ) source
        ON (target.logical_name = source.logical_name)
        WHEN MATCHED THEN UPDATE SET
          target.physical_name = source.physical_name,
          target.generation_id = 'bootstrap-v1',
          target.training_fingerprint = source.training_fingerprint,
          target.training_row_count = source.training_row_count,
          target.validated_at = SYSTIMESTAMP,
          target.activated_at = SYSTIMESTAMP
          WHERE target.generation_id IN ('bootstrap', 'bootstrap-v1')
        WHEN NOT MATCHED THEN INSERT(
          logical_name, physical_name, generation_id, training_fingerprint,
          training_row_count, validated_at, activated_at
        ) VALUES(
          source.logical_name, source.physical_name, 'bootstrap-v1',
          source.training_fingerprint, source.training_row_count,
          SYSTIMESTAMP, SYSTIMESTAMP
        );
    END;
BEGIN
    SELECT COUNT(*) INTO v_nonbootstrap_active
    FROM app_oml_model_registry
    WHERE generation_id NOT IN ('bootstrap', 'bootstrap-v1');

    DELETE FROM app_oml_generation_models
    WHERE generation_id = 'bootstrap';

    MERGE INTO app_oml_generations target
    USING (
      SELECT 'bootstrap-v1' generation_id,
             LOWER(RAWTOHEX(STANDARD_HASH(
               'MEDIA-BOOTSTRAP-ACTUAL-PROVENANCE', 'SHA256'
             ))) source_fingerprint
      FROM dual
    ) source
    ON (target.generation_id = source.generation_id)
    WHEN MATCHED THEN UPDATE SET
      target.source_fingerprint = source.source_fingerprint,
      target.status = CASE WHEN v_nonbootstrap_active = 0 THEN 'active' ELSE 'validated' END,
      target.updated_at = SYSTIMESTAMP,
      target.activated_at = CASE WHEN v_nonbootstrap_active = 0
        THEN NVL(target.activated_at, SYSTIMESTAMP) ELSE target.activated_at END
    WHEN NOT MATCHED THEN INSERT(
      generation_id, source_fingerprint, status, created_at, updated_at, activated_at
    ) VALUES(
      source.generation_id, source.source_fingerprint,
      CASE WHEN v_nonbootstrap_active = 0 THEN 'active' ELSE 'validated' END,
      SYSTIMESTAMP, SYSTIMESTAMP,
      CASE WHEN v_nonbootstrap_active = 0 THEN SYSTIMESTAMP ELSE NULL END
    );

    register_model(
      'DEMAND_SURGE_MODEL', 'DEMAND_SURGE_MODEL',
      'OML_DEMAND_TRAINING_V', 'OML_DEMAND_SETTINGS',
      q'[TO_CHAR(product_id)||'|'||NVL(category,'~')||'|'||
         TO_CHAR(unit_price)||'|'||TO_CHAR(total_posts)||'|'||
         TO_CHAR(avg_sentiment)||'|'||TO_CHAR(total_likes)||'|'||
         TO_CHAR(total_shares)||'|'||TO_CHAR(total_views)||'|'||
         TO_CHAR(avg_virality)||'|'||TO_CHAR(viral_posts)||'|'||
         TO_CHAR(rising_posts)||'|'||TO_CHAR(units_sold)||'|'||
         TO_CHAR(revenue)||'|'||surge_label]'
    );
    register_model(
      'CUSTOMER_SEGMENT_MODEL', 'CUSTOMER_SEGMENT_MODEL',
      'OML_CUSTOMER_SEGMENT_V', 'OML_CUSTOMER_SEGMENT_SETTINGS',
      q'[TO_CHAR(customer_id)||'|'||TO_CHAR(lifetime_value)||'|'||
         TO_CHAR(recency_days)||'|'||TO_CHAR(frequency)||'|'||
         TO_CHAR(monetary)||'|'||TO_CHAR(avg_order_value)||'|'||
         TO_CHAR(total_items)]'
    );
    register_model(
      'REVENUE_PREDICT_MODEL', 'REVENUE_PREDICT_MODEL',
      'OML_REVENUE_TRAINING_V', 'OML_REVENUE_SETTINGS',
      q'[TO_CHAR(order_id)||'|'||NVL(customer_tier,'~')||'|'||
         NVL(order_status,'~')||'|'||TO_CHAR(lifetime_value)||'|'||
         TO_CHAR(shipping_cost)||'|'||TO_CHAR(demand_score)||'|'||
         TO_CHAR(fulfillment_center_id)||'|'||TO_CHAR(order_age_days)||'|'||
         TO_CHAR(item_count)||'|'||TO_CHAR(distinct_products)||'|'||
         TO_CHAR(avg_item_price)||'|'||TO_CHAR(max_item_price)||'|'||
         TO_CHAR(target_revenue)]'
    );
    register_model(
      'PRODUCT_CLUSTER_MODEL', 'PRODUCT_CLUSTER_MODEL',
      'OML_PRODUCT_CLUSTER_V', 'OML_PRODUCT_CLUSTER_SETTINGS',
      q'[TO_CHAR(product_id)||'|'||TO_CHAR(unit_price)||'|'||
         TO_CHAR(weight_kg)||'|'||TO_CHAR(units_sold)||'|'||
         TO_CHAR(revenue)||'|'||TO_CHAR(order_count)||'|'||
         TO_CHAR(total_engagement)||'|'||TO_CHAR(avg_sentiment)||'|'||
         TO_CHAR(avg_virality)]'
    );

    UPDATE app_oml_generations generation
    SET source_fingerprint = (
      SELECT LOWER(RAWTOHEX(STANDARD_HASH(
               LISTAGG(logical_name || ':' || training_fingerprint, '|')
                 WITHIN GROUP (ORDER BY logical_name),
               'SHA256'
             )))
      FROM app_oml_generation_models
      WHERE generation_id = 'bootstrap-v1'
    ),
        updated_at = SYSTIMESTAMP
    WHERE generation_id = 'bootstrap-v1';
END;
/
COMMIT;
