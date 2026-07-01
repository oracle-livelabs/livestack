/*
 * finalize_manufacturing_inmemory.sql
 * Populate the canonical segments after seed loading.
 *
 * Actual execution-plan proof runs later, after the trusted application context
 * and VPD policies are installed, in validate_manufacturing_feature_readiness.sql.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

BEGIN
    DBMS_STATS.GATHER_TABLE_STATS(USER, 'MANUFACTURING_PRODUCTION_SIGNALS');
    DBMS_STATS.GATHER_TABLE_STATS(USER, 'MANUFACTURING_WORK_ORDERS');
    DBMS_STATS.GATHER_TABLE_STATS(USER, 'MANUFACTURING_WORK_ORDER_LINES');
    DBMS_STATS.GATHER_TABLE_STATS(USER, 'MANUFACTURING_DEMAND_FORECASTS');

    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_PRODUCTION_SIGNALS');
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_WORK_ORDERS');
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_WORK_ORDER_LINES');
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_DEMAND_FORECASTS');
END;
/

DECLARE
    v_completed PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1 .. 120 LOOP
        SELECT COUNT(*)
        INTO v_completed
        FROM manufacturing_inmemory_segments_v
        WHERE populate_status = 'COMPLETED'
          AND bytes_not_populated = 0
          AND inmemory_bytes > 0;

        EXIT WHEN v_completed = 4;
        DBMS_SESSION.SLEEP(1);
    END LOOP;

    IF v_completed <> 4 THEN
        RAISE_APPLICATION_ERROR(
            -20400,
            'All four canonical Manufacturing segments must be fully populated in the In-Memory Column Store'
        );
    END IF;
END;
/

PROMPT Oracle Database In-Memory Base Level segment population verified.
