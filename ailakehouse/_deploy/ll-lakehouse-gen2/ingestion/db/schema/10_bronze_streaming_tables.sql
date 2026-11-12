/*
 * 10_bronze_streaming_tables.sql
 * Bronze streaming landing-zone DDL for the PeakGear AI Data Lakehouse demo.
 *
 * GoldenGate Streaming Analytics lands Kafka demand-signal events here as
 * source-shaped records. Silver processing can curate these rows downstream.
 */

SET SERVEROUTPUT ON
PROMPT Creating PeakGear Bronze streaming tables...

DECLARE
    PROCEDURE run_ddl(p_sql VARCHAR2, p_label VARCHAR2) IS
    BEGIN
        EXECUTE IMMEDIATE p_sql;
        DBMS_OUTPUT.PUT_LINE('Created ' || p_label || '.');
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE = -955 THEN
                DBMS_OUTPUT.PUT_LINE(p_label || ' already exists.');
            ELSE
                RAISE;
            END IF;
    END;
BEGIN
    run_ddl(q'[
        CREATE TABLE bronze_demand_signals (
            signal_id         VARCHAR2(80) PRIMARY KEY,
            observed_at       TIMESTAMP,
            source_system     VARCHAR2(80),
            source_type       VARCHAR2(50),
            platform          VARCHAR2(80),
            region            VARCHAR2(50),
            signal_text       VARCHAR2(4000),
            likes             NUMBER(12),
            shares            NUMBER(12),
            comments          NUMBER(12),
            views             NUMBER(14),
            sentiment_score   NUMBER(6,3),
            criticality_score NUMBER(6,2),
            momentum_flag     VARCHAR2(30),
            product_hints     VARCHAR2(4000),
            topic_tags        VARCHAR2(4000),
            created_at        TIMESTAMP DEFAULT SYSTIMESTAMP
        )
    ]', 'BRONZE_DEMAND_SIGNALS');

    run_ddl(q'[
        CREATE INDEX idx_bronze_demand_region
        ON bronze_demand_signals (region)
    ]', 'IDX_BRONZE_DEMAND_REGION');

    run_ddl(q'[
        CREATE INDEX idx_bronze_demand_score
        ON bronze_demand_signals (criticality_score DESC)
    ]', 'IDX_BRONZE_DEMAND_SCORE');

    run_ddl(q'[
        CREATE INDEX idx_bronze_demand_momentum
        ON bronze_demand_signals (momentum_flag)
    ]', 'IDX_BRONZE_DEMAND_MOMENTUM');
END;
/

PROMPT PeakGear Bronze streaming table DDL complete.
