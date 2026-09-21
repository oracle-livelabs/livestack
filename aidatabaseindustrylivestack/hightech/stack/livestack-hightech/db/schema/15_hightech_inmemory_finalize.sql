/*
 * 15_hightech_inmemory_finalize.sql
 * Populate the four canonical segments and require an actual In-Memory scan.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

BEGIN
    hightech_security_pkg.set_user_context('admin_jess');
END;
/

BEGIN
    FOR expected IN (
        SELECT 'CUSTOMERS' AS segment_name FROM dual
        UNION ALL SELECT 'ORDERS' FROM dual
        UNION ALL SELECT 'ORDER_ITEMS' FROM dual
        UNION ALL SELECT 'SOCIAL_POSTS' FROM dual
    ) LOOP
        DBMS_INMEMORY.POPULATE(
            schema_name => USER,
            table_name  => expected.segment_name
        );
    END LOOP;
END;
/

DECLARE
    v_populated_count PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1..60 LOOP
        SELECT COUNT(*)
        INTO v_populated_count
        FROM hightech_inmemory_segments_v
        WHERE table_inmemory = 'ENABLED'
          AND populate_status = 'COMPLETED'
          AND inmemory_bytes > 0
          AND bytes_not_populated = 0;

        EXIT WHEN v_populated_count = 4;
        DBMS_SESSION.SLEEP(1);
    END LOOP;

    IF v_populated_count <> 4 THEN
        RAISE_APPLICATION_ERROR(
            -20410,
            'Four fully populated High Tech In-Memory segments are required'
        );
    END IF;
END;
/

ALTER SESSION SET INMEMORY_QUERY = ENABLE;

SELECT /*+ GATHER_PLAN_STATISTICS FULL(customer) NO_INDEX(customer) */
       /* HIGHTECH_INMEMORY_PROOF */
       customer.customer_tier,
       COUNT(*) AS customer_count,
       SUM(customer.lifetime_value) AS lifetime_value
FROM customers customer
GROUP BY customer.customer_tier;

DECLARE
    v_active_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_active_count
    FROM hightech_inmemory_status_v
    WHERE inmemory_option = 'TRUE'
      AND database_inmemory_size_bytes >= 268435456
      AND inmemory_force = 'BASE_LEVEL'
      AND inmemory_query = 'ENABLE'
      AND area_allocated_bytes >= 268435456
      AND expected_segment_count = 4
      AND populated_segment_count = 4
      AND bytes_not_populated = 0
      AND plan_proof_operation IN (
        'TABLE ACCESS INMEMORY FULL',
        'PLAN_PROJECTION_UNAVAILABLE'
      )
      AND evidence_status = 'ACTIVE';

    IF v_active_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20411,
            'High Tech In-Memory runtime and actual plan evidence are incomplete'
        );
    END IF;
END;
/

BEGIN
    hightech_security_pkg.clear_user_context;
END;
/

PROMPT High Tech Database In-Memory population and actual-plan proof passed.
