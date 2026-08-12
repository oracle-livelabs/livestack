/*
 * 12_ml_persistence.sql
 * Durable Oracle tables for State and Local Government OML scene outputs.
 *
 * DBMS_DATA_MINING models remain persisted Oracle mining models. These tables
 * persist the scored demo outputs so OML scene data survives app restarts and
 * can be refreshed after restore/import operations.
 */
SET SERVEROUTPUT ON

DECLARE
    PROCEDURE create_table_if_missing(p_table_name VARCHAR2, p_sql CLOB) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO   v_count
        FROM   user_tables
        WHERE  table_name = UPPER(p_table_name);

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE p_sql;
            DBMS_OUTPUT.PUT_LINE('Created ' || p_table_name || '.');
        ELSE
            DBMS_OUTPUT.PUT_LINE(p_table_name || ' already exists.');
        END IF;
    END;

    PROCEDURE create_index_if_missing(p_index_name VARCHAR2, p_sql CLOB) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*)
        INTO   v_count
        FROM   user_indexes
        WHERE  index_name = UPPER(p_index_name);

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE p_sql;
            DBMS_OUTPUT.PUT_LINE('Created ' || p_index_name || '.');
        END IF;
    END;
BEGIN
    create_table_if_missing('oml_model_runs', q'[
        CREATE TABLE oml_model_runs (
            run_id        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            run_name      VARCHAR2(100) NOT NULL,
            model_version VARCHAR2(100),
            source        VARCHAR2(50) DEFAULT 'refresh',
            status        VARCHAR2(30) DEFAULT 'running'
                          CHECK (status IN ('running','completed','failed')),
            started_at    TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            completed_at  TIMESTAMP,
            row_counts    CLOB,
            notes         CLOB
        )
    ]');

    create_table_if_missing('oml_demand_scores', q'[
        CREATE TABLE oml_demand_scores (
            score_id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            run_id              NUMBER NOT NULL REFERENCES oml_model_runs(run_id) ON DELETE CASCADE,
            product_id          NUMBER NOT NULL REFERENCES products(product_id),
            lookback_hours      NUMBER DEFAULT 720 NOT NULL,
            predicted_surge     VARCHAR2(20),
            surge_probability   NUMBER(6,2),
            predicted_demand    NUMBER(12,2),
            uplift_pct          NUMBER(6,2),
            confidence_pct      NUMBER(6,2),
            revenue_opportunity NUMBER(14,2),
            recent_mentions     NUMBER,
            avg_virality        NUMBER(6,2),
            total_likes         NUMBER,
            total_shares        NUMBER,
            total_views         NUMBER,
            orders_recent       NUMBER,
            peak_momentum       VARCHAR2(20),
            created_at          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]');

    create_table_if_missing('oml_customer_segments', q'[
        CREATE TABLE oml_customer_segments (
            segment_id             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            run_id                 NUMBER NOT NULL REFERENCES oml_model_runs(run_id) ON DELETE CASCADE,
            customer_id            NUMBER NOT NULL REFERENCES customers(customer_id),
            service_region_code    VARCHAR2(30)
                                   CHECK (service_region_code IN ('FRONT_RANGE','WESTERN_SLOPE','SOUTHERN_COLORADO')),
            order_count            NUMBER,
            total_spent            NUMBER(14,2),
            avg_order_value        NUMBER(12,2),
            days_since_last_order  NUMBER,
            oml_cluster_id         NUMBER,
            cluster_probability    NUMBER(8,4),
            recency_score          NUMBER,
            frequency_score        NUMBER,
            monetary_score         NUMBER,
            segment                VARCHAR2(80),
            churn_risk             VARCHAR2(20),
            predicted_ltv          NUMBER(14,2),
            created_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]');

    create_table_if_missing('oml_commitment_forecasts', q'[
        CREATE TABLE oml_commitment_forecasts (
            forecast_row_id        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            run_id                 NUMBER NOT NULL REFERENCES oml_model_runs(run_id) ON DELETE CASCADE,
            forecast_day           DATE NOT NULL,
            horizon_day            NUMBER DEFAULT 0 NOT NULL,
            actual_revenue         NUMBER(14,2),
            order_count            NUMBER,
            avg_order_value        NUMBER(12,2),
            trend_line             NUMBER(14,2),
            ma_7d                  NUMBER(14,2),
            ci_lower               NUMBER(14,2),
            ci_upper               NUMBER(14,2),
            is_forecast            NUMBER(1) DEFAULT 0 NOT NULL,
            r_squared              NUMBER(8,4),
            daily_slope            NUMBER(14,2),
            intercept              NUMBER(14,2),
            mean_revenue           NUMBER(14,2),
            stddev_revenue         NUMBER(14,2),
            correlation            NUMBER(8,4),
            created_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]');

    create_table_if_missing('oml_product_clusters', q'[
        CREATE TABLE oml_product_clusters (
            cluster_row_id      NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            run_id              NUMBER NOT NULL REFERENCES oml_model_runs(run_id) ON DELETE CASCADE,
            k_value             NUMBER DEFAULT 5 NOT NULL,
            product_id          NUMBER NOT NULL REFERENCES products(product_id),
            cluster_id          NUMBER NOT NULL,
            similarity          NUMBER(8,4),
            centroid_product_id NUMBER,
            units_sold          NUMBER,
            total_engagement    NUMBER,
            created_at          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]');

    create_table_if_missing('oml_capacity_alerts', q'[
        CREATE TABLE oml_capacity_alerts (
            alert_id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            run_id                NUMBER NOT NULL REFERENCES oml_model_runs(run_id) ON DELETE CASCADE,
            product_id            NUMBER NOT NULL REFERENCES products(product_id),
            center_id             NUMBER NOT NULL REFERENCES fulfillment_centers(center_id),
            service_region_code   VARCHAR2(30)
                                  CHECK (service_region_code IN ('FRONT_RANGE','WESTERN_SLOPE','SOUTHERN_COLORADO')),
            quantity_on_hand      NUMBER,
            reorder_point         NUMBER,
            quantity_reserved     NUMBER,
            deficit               NUMBER,
            predicted_demand      NUMBER,
            social_factor         NUMBER(6,2),
            confidence_low        NUMBER,
            confidence_high       NUMBER,
            oml_surge_prediction  VARCHAR2(20),
            oml_surge_probability NUMBER(6,2),
            stock_status          VARCHAR2(30),
            days_of_supply        NUMBER(10,2),
            revenue_at_risk       NUMBER(14,2),
            created_at            TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]');

    create_index_if_missing('idx_oml_runs_status', 'CREATE INDEX idx_oml_runs_status ON oml_model_runs(status, completed_at DESC)');
    create_index_if_missing('idx_oml_demand_latest', 'CREATE INDEX idx_oml_demand_latest ON oml_demand_scores(run_id, lookback_hours, surge_probability DESC)');
    create_index_if_missing('idx_oml_segments_latest', 'CREATE INDEX idx_oml_segments_latest ON oml_customer_segments(run_id, total_spent DESC)');
    create_index_if_missing('idx_oml_forecast_latest', 'CREATE INDEX idx_oml_forecast_latest ON oml_commitment_forecasts(run_id, is_forecast, forecast_day)');
    create_index_if_missing('idx_oml_clusters_latest', 'CREATE INDEX idx_oml_clusters_latest ON oml_product_clusters(run_id, k_value, cluster_id)');
    create_index_if_missing('idx_oml_capacity_latest', 'CREATE INDEX idx_oml_capacity_latest ON oml_capacity_alerts(run_id, oml_surge_probability DESC)');
END;
/

COMMIT;

PROMPT State and Local Government ML persistence tables are ready.
