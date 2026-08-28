BEGIN
    media_security_pkg.set_user_context('admin_jess');
    FOR expected IN (
        SELECT 'CUSTOMERS' segment_name FROM dual UNION ALL
        SELECT 'ORDERS' FROM dual UNION ALL
        SELECT 'ORDER_ITEMS' FROM dual UNION ALL
        SELECT 'SOCIAL_POSTS' FROM dual
    ) LOOP
        DBMS_STATS.GATHER_TABLE_STATS(USER, expected.segment_name);
        DBMS_INMEMORY.POPULATE(USER, expected.segment_name);
    END LOOP;
END;
/

DECLARE
    v_count PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1..60 LOOP
        SELECT COUNT(*) INTO v_count
        FROM media_inmemory_segments_v
        WHERE table_inmemory = 'ENABLED'
          AND populate_status = 'COMPLETED'
          AND inmemory_bytes > 0
          AND bytes_not_populated = 0;
        EXIT WHEN v_count = 4;
        DBMS_SESSION.SLEEP(1);
    END LOOP;
    IF v_count <> 4 THEN
        RAISE_APPLICATION_ERROR(-20410, 'Four populated Media In-Memory segments are required');
    END IF;
END;
/

-- Exact cursor capture is deliberately deferred until after the final data
-- commit in 21_media_inmemory_durable_verify.sql. A pre-commit cursor is not
-- accepted as durable evidence.
BEGIN
    media_security_pkg.clear_user_context;
END;
/
