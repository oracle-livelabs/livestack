/*
 * load_graph_data.sql
 * Digital advocate connections (3000+ edges) and service brand advocate links
 */

SET SERVEROUTPUT ON
PROMPT Loading influence and account graph edges...

DECLARE
    v_from_id NUMBER;
    v_to_id NUMBER;
    v_brand_id NUMBER;
    v_count    NUMBER := 0;
    v_conn_idx NUMBER;
    TYPE t_str IS TABLE OF VARCHAR2(30);
    v_conn_types t_str := t_str('follows','collaborates','mentioned','reshared','tagged','duet','inspired_by');
BEGIN
    -- Generate ~3000 digital advocate connections
    FOR i IN 1..3500 LOOP
        SELECT influencer_id INTO v_from_id
        FROM (
          SELECT influencer_id
          FROM influencers
          ORDER BY DBMS_RANDOM.VALUE
        )
        WHERE ROWNUM = 1;

        SELECT influencer_id INTO v_to_id
        FROM (
          SELECT influencer_id
          FROM influencers
          ORDER BY DBMS_RANDOM.VALUE
        )
        WHERE ROWNUM = 1;

        IF v_from_id != v_to_id THEN
            v_conn_idx := MOD(i, v_conn_types.COUNT) + 1;
            BEGIN
                INSERT INTO influencer_connections (
                    from_influencer, to_influencer, connection_type,
                    strength, interaction_count
                ) VALUES (
                    v_from_id, v_to_id,
                    v_conn_types(v_conn_idx),
                    ROUND(DBMS_RANDOM.VALUE(0.1, 1.0), 3),
                    FLOOR(DBMS_RANDOM.VALUE(1, 200))
                );
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
                WHEN OTHERS THEN NULL;
            END;
        END IF;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Digital advocate connections loaded: ' || v_count);

    -- Generate service brand advocate links (~1500)
    v_count := 0;
    FOR i IN 1..2000 LOOP
        BEGIN
            SELECT brand_id INTO v_brand_id
            FROM (
              SELECT brand_id
              FROM brands
              ORDER BY DBMS_RANDOM.VALUE
            )
            WHERE ROWNUM = 1;

            SELECT influencer_id INTO v_from_id
            FROM (
              SELECT influencer_id
              FROM influencers
              ORDER BY DBMS_RANDOM.VALUE
            )
            WHERE ROWNUM = 1;

            INSERT INTO brand_influencer_links (
                brand_id, influencer_id, relationship_type,
                post_count, avg_engagement, revenue_attributed,
                first_mention, last_mention
            ) VALUES (
                v_brand_id,
                v_from_id,
                CASE MOD(i, 5)
                    WHEN 0 THEN 'organic'
                    WHEN 1 THEN 'organic'
                    WHEN 2 THEN 'partner'
                    WHEN 3 THEN 'service_assurance'
                    ELSE 'advocate'
                END,
                FLOOR(DBMS_RANDOM.VALUE(1, 100)),
                ROUND(DBMS_RANDOM.VALUE(0.01, 0.12), 4),
                ROUND(DBMS_RANDOM.VALUE(0, 50000), 2),
                SYSTIMESTAMP - NUMTODSINTERVAL(DBMS_RANDOM.VALUE(30, 365) * 24, 'HOUR'),
                SYSTIMESTAMP - NUMTODSINTERVAL(DBMS_RANDOM.VALUE(0, 30) * 24, 'HOUR')
            );
            v_count := v_count + 1;
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;
            WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Service brand advocate links loaded: ' || v_count);
END;
/
