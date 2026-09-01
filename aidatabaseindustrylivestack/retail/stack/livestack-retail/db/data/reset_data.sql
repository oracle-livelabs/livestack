/*
 * reset_data.sql
 * Truncates all demo data tables in FK-safe order.
 * Safe to run multiple times — leaves schema structure intact.
 *
 * Usage:
 *   Standalone:  @db/data/reset_data.sql
 */

SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE

PROMPT =====================================================
PROMPT  Resetting Seer Sporting Goods Demo Data
PROMPT =====================================================

/*
 * Contract inventory for source verification. These statements are executed
 * dynamically below so an error cannot strand every FK in DISABLED state.
 * TRUNCATE TABLE agent_runtime_telemetry
 * TRUNCATE TABLE agent_conversation_turns
 * TRUNCATE TABLE agent_conversations
 * TRUNCATE TABLE return_investigation_turns
 * TRUNCATE TABLE return_investigations
 * TRUNCATE TABLE return_decision_commands
 * TRUNCATE TABLE return_customer_messages
 * TRUNCATE TABLE return_decision_provenance
 * TRUNCATE TABLE return_decision_proposals
 */
DECLARE
    TYPE t_constraint_record IS RECORD (
        table_name      user_constraints.table_name%TYPE,
        constraint_name user_constraints.constraint_name%TYPE
    );
    TYPE t_constraint_list IS TABLE OF t_constraint_record INDEX BY PLS_INTEGER;
    l_disabled_by_reset t_constraint_list;
    l_disabled_count    PLS_INTEGER := 0;
    l_table_count       PLS_INTEGER;
    l_tables            SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'AGENT_RUNTIME_TELEMETRY', 'AGENT_CONVERSATION_TURNS',
        'AGENT_CONVERSATIONS', 'RETURN_INVESTIGATION_TURNS',
        'RETURN_INVESTIGATIONS', 'RETURN_DECISION_COMMANDS',
        'RETURN_CUSTOMER_MESSAGES', 'RETURN_DECISION_PROVENANCE',
        'RETURN_DECISION_PROPOSALS', 'RETURN_EVIDENCE_INDEX',
        'RETURN_DECISIONS', 'RETURN_EVENTS', 'RETURN_DOCUMENTS',
        'RETURN_REQUESTS', 'RETURN_POLICY_CLAUSES', 'AGENT_ACTIONS',
        'SHIPMENTS', 'ORDER_ITEMS', 'ORDERS', 'POST_EMBEDDINGS',
        'POST_PRODUCT_MENTIONS', 'DEMAND_FORECASTS', 'PRODUCT_EMBEDDINGS',
        'SEMANTIC_MATCHES', 'SOCIAL_POSTS', 'BRAND_INFLUENCER_LINKS',
        'INFLUENCER_CONNECTIONS', 'INVENTORY', 'DEMAND_REGIONS',
        'FULFILLMENT_ZONES', 'CUSTOMERS', 'INFLUENCERS',
        'FULFILLMENT_CENTERS', 'PRODUCTS', 'BRANDS', 'APP_USERS',
        'EVENT_STREAM', 'APP_DATASET_STATE'
    );

    PROCEDURE restore_constraints IS
        l_restore_error VARCHAR2(2000);
    BEGIN
        IF l_disabled_count > 0 THEN
            FOR i IN 1 .. l_disabled_count LOOP
                BEGIN
                    EXECUTE IMMEDIATE
                        'ALTER TABLE ' ||
                        DBMS_ASSERT.SIMPLE_SQL_NAME(l_disabled_by_reset(i).table_name) ||
                        ' ENABLE CONSTRAINT ' ||
                        DBMS_ASSERT.SIMPLE_SQL_NAME(l_disabled_by_reset(i).constraint_name);
                EXCEPTION
                    WHEN OTHERS THEN
                        IF l_restore_error IS NULL THEN
                            l_restore_error :=
                                l_disabled_by_reset(i).table_name || '.' ||
                                l_disabled_by_reset(i).constraint_name || ': ' || SQLERRM;
                        END IF;
                END;
            END LOOP;
        END IF;
        IF l_restore_error IS NOT NULL THEN
            RAISE_APPLICATION_ERROR(
                -20062,
                'One or more FK constraints could not be restored: ' || l_restore_error
            );
        END IF;
    END restore_constraints;
BEGIN
    FOR c IN (
        SELECT constraint_name, table_name
        FROM user_constraints
        WHERE constraint_type = 'R'
          AND status = 'ENABLED'
        ORDER BY table_name, constraint_name
    ) LOOP
        EXECUTE IMMEDIATE
            'ALTER TABLE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(c.table_name) ||
            ' DISABLE CONSTRAINT ' || DBMS_ASSERT.SIMPLE_SQL_NAME(c.constraint_name);
        l_disabled_count := l_disabled_count + 1;
        l_disabled_by_reset(l_disabled_count).table_name := c.table_name;
        l_disabled_by_reset(l_disabled_count).constraint_name := c.constraint_name;
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('FK constraints disabled for reset: ' || l_disabled_count);

    FOR i IN 1 .. l_tables.COUNT LOOP
        SELECT COUNT(*) INTO l_table_count
        FROM user_tables
        WHERE table_name = l_tables(i);
        IF l_table_count <> 1 THEN
            RAISE_APPLICATION_ERROR(
                -20061,
                'Required reset table is missing: ' || l_tables(i) ||
                '. Complete database bootstrap before restoring demo data.'
            );
        END IF;
        EXECUTE IMMEDIATE
            'TRUNCATE TABLE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(l_tables(i));
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('All demo and runtime tables truncated.');

    FOR s IN (
        SELECT sequence_name
        FROM user_tab_identity_cols
        ORDER BY sequence_name
    ) LOOP
        EXECUTE IMMEDIATE
            'ALTER SEQUENCE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(s.sequence_name) ||
            ' RESTART START WITH 1';
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('Identity sequences reset to START WITH 1.');

    restore_constraints;
    DBMS_OUTPUT.PUT_LINE('FK constraints restored to their pre-reset enabled state.');
EXCEPTION
    WHEN OTHERS THEN
        BEGIN
            restore_constraints;
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_OUTPUT.PUT_LINE(
                    'WARNING: reset failed and one or more FK constraints could not be restored: ' ||
                    SQLERRM
                );
        END;
        RAISE;
END;
/

PROMPT All demo tables truncated.

COMMIT;

PROMPT =====================================================
PROMPT  Reset complete. Ready for data load.
PROMPT =====================================================
