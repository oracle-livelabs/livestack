/*
 * Runtime In-Memory evidence: populated expected segments plus the actual
 * cursor plan produced by the accepted analytic statement in this session.
 */
DECLARE
    /* RETAIL_INMEMORY_CANONICAL_MIGRATION */
    PROCEDURE converge_inmemory(
        p_table_name IN VARCHAR2,
        p_expected   IN VARCHAR2
    ) IS
        v_current user_tables.inmemory%TYPE;
        v_table_name VARCHAR2(128);
    BEGIN
        v_table_name := DBMS_ASSERT.SIMPLE_SQL_NAME(UPPER(p_table_name));
        SELECT inmemory
        INTO v_current
        FROM user_tables
        WHERE table_name = v_table_name;

        IF v_current <> p_expected THEN
            IF p_expected = 'ENABLED' THEN
                -- Executed form: ALTER TABLE <table_name> INMEMORY MEMCOMPRESS FOR QUERY HIGH
                EXECUTE IMMEDIATE
                  'ALTER TABLE ' || v_table_name ||
                  ' INMEMORY MEMCOMPRESS FOR QUERY HIGH';
            ELSIF p_expected = 'DISABLED' THEN
                -- Executed form: ALTER TABLE <table_name> NO INMEMORY
                EXECUTE IMMEDIATE
                  'ALTER TABLE ' || v_table_name || ' NO INMEMORY';
            ELSE
                RAISE_APPLICATION_ERROR(
                  -20536,
                  'Unexpected Retail In-Memory declaration target'
                );
            END IF;
        END IF;
    END;
BEGIN
    -- Retire declarations that cannot produce real clean-seed IM segments.
    converge_inmemory('PRODUCTS', 'DISABLED');
    converge_inmemory('RETURN_REQUESTS', 'DISABLED');

    -- One canonical business-relevant inventory on fresh and retained data.
    converge_inmemory('ORDERS', 'ENABLED');
    converge_inmemory('ORDER_ITEMS', 'ENABLED');
    converge_inmemory('SOCIAL_POSTS', 'ENABLED');
    converge_inmemory('CUSTOMERS', 'ENABLED');
    converge_inmemory('DEMAND_FORECASTS', 'ENABLED');
END;
/

CREATE OR REPLACE VIEW retail_inmemory_segments_v AS
WITH expected(segment_name) AS (
    SELECT 'ORDERS' FROM dual UNION ALL
    SELECT 'ORDER_ITEMS' FROM dual UNION ALL
    SELECT 'SOCIAL_POSTS' FROM dual UNION ALL
    SELECT 'CUSTOMERS' FROM dual UNION ALL
    SELECT 'DEMAND_FORECASTS' FROM dual
), populated AS (
    SELECT segment_name,
           MAX(populate_status) populate_status,
           SUM(bytes) disk_bytes,
           SUM(inmemory_size) inmemory_bytes,
           SUM(bytes_not_populated) bytes_not_populated
    FROM sys.v_$im_segments
    WHERE owner = USER
    GROUP BY segment_name
)
SELECT e.segment_name, t.num_rows row_count, t.inmemory table_inmemory,
       t.inmemory_priority, t.inmemory_compression,
       NVL(p.populate_status, 'NOT POPULATED') populate_status,
       NVL(p.disk_bytes, s.bytes) disk_bytes,
       NVL(p.inmemory_bytes, 0) inmemory_bytes,
       NVL(p.bytes_not_populated, NVL(s.bytes, 0)) bytes_not_populated
FROM expected e
JOIN user_tables t ON t.table_name = e.segment_name
LEFT JOIN user_segments s
  ON s.segment_name = e.segment_name AND s.segment_type = 'TABLE'
LEFT JOIN populated p ON p.segment_name = e.segment_name;

BEGIN
    FOR expected IN (
        SELECT segment_name FROM retail_inmemory_segments_v
    ) LOOP
        DBMS_INMEMORY.POPULATE(USER, expected.segment_name);
    END LOOP;
END;
/

DECLARE
    v_count PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1..60 LOOP
        SELECT COUNT(*) INTO v_count
        FROM retail_inmemory_segments_v
        WHERE table_inmemory = 'ENABLED'
          AND populate_status = 'COMPLETED'
          AND inmemory_bytes > 0
          AND bytes_not_populated = 0;
        EXIT WHEN v_count = 5;
        DBMS_SESSION.SLEEP(1);
    END LOOP;
    IF v_count <> 5 THEN
        RAISE_APPLICATION_ERROR(-20510, 'Five fully populated Retail In-Memory segments are required');
    END IF;
END;
/

CREATE OR REPLACE VIEW retail_inmemory_status_v AS
WITH segments AS (
    SELECT COUNT(*) expected_segments,
           SUM(CASE WHEN table_inmemory = 'ENABLED'
                     AND populate_status = 'COMPLETED'
                     AND inmemory_bytes > 0
                     AND bytes_not_populated = 0 THEN 1 ELSE 0 END) populated_segments
    FROM retail_inmemory_segments_v
), proof AS (
    SELECT evidence.sql_id,
           evidence.child_number,
           evidence.plan_operation,
           evidence.plan_object_owner,
           evidence.plan_object_name,
           evidence.proof_id,
           evidence.evidence_status,
           evidence.verified_at
    FROM app_dataset_state state
    JOIN app_inmemory_generation_evidence evidence
      ON evidence.generation_id = state.active_generation_id
    WHERE state.state_id = 1
)
SELECT segments.expected_segments, segments.populated_segments,
       proof.sql_id plan_proof_sql_id, proof.child_number plan_proof_child_number,
       proof.plan_operation plan_proof_operation,
       proof.plan_object_owner, proof.plan_object_name,
       proof.proof_id, proof.verified_at,
       CASE WHEN segments.expected_segments = 5
                  AND segments.populated_segments = 5
                  AND proof.evidence_status = 'ACTIVE'
                  AND proof.sql_id IS NOT NULL
                  AND proof.child_number IS NOT NULL
                  AND proof.plan_operation = 'TABLE ACCESS INMEMORY FULL'
                  AND proof.plan_object_name = 'ORDERS'
            THEN 'ACTIVE' ELSE 'NOT_READY' END evidence_status
FROM segments CROSS JOIN proof;
