/*
 * 16_utilities_unified_audit_admin.sql
 * ADMIN-owned, idempotent Unified Audit policy for sensitive Energy & Utilities DML.
 *
 * Usage:
 *   @16_utilities_unified_audit_admin.sql LIVESTACK
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET VERIFY OFF
SET DEFINE ON

DEFINE APP_SCHEMA_OWNER = '&1'

DECLARE
    v_policy_row_count   PLS_INTEGER;
    v_expected_row_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*),
           COUNT(
               CASE
                   WHEN audit_option = 'UPDATE'
                    AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
                    AND object_name = 'ORDERS' THEN 1
                   WHEN audit_option = 'DELETE'
                    AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
                    AND object_name = 'ORDERS' THEN 1
                   WHEN audit_option = 'INSERT'
                    AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
                    AND object_name = 'AGENT_ACTIONS' THEN 1
               END
           )
    INTO v_policy_row_count, v_expected_row_count
    FROM audit_unified_policies
    WHERE policy_name = 'SC_ORDER_AUDIT';

    IF v_policy_row_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            CREATE AUDIT POLICY sc_order_audit
                ACTIONS UPDATE ON &&APP_SCHEMA_OWNER..orders,
                        DELETE ON &&APP_SCHEMA_OWNER..orders,
                        INSERT ON &&APP_SCHEMA_OWNER..agent_actions
                WHEN 'SYS_CONTEXT(''USERENV'', ''SESSION_USER'') != ''ADMIN'''
                EVALUATE PER SESSION
        ]';

        v_policy_row_count := 3;
        v_expected_row_count := 3;
    END IF;

    IF v_policy_row_count <> 3 OR v_expected_row_count <> 3 THEN
        RAISE_APPLICATION_ERROR(
            -20420,
            'SC_ORDER_AUDIT exists with a conflicting definition'
        );
    END IF;
END;
/

DECLARE
    v_enabled_count PLS_INTEGER;
BEGIN
    SELECT COUNT(DISTINCT policy_name)
    INTO v_enabled_count
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'SC_ORDER_AUDIT'
      AND entity_name = 'ALL USERS';

    IF v_enabled_count = 0 THEN
        EXECUTE IMMEDIATE 'AUDIT POLICY sc_order_audit';
    END IF;

    SELECT COUNT(DISTINCT policy_name)
    INTO v_enabled_count
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'SC_ORDER_AUDIT'
      AND entity_name = 'ALL USERS';

    IF v_enabled_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20421,
            'SC_ORDER_AUDIT is not enabled for all users'
        );
    END IF;
END;
/

GRANT SELECT ON SYS.AUDIT_UNIFIED_ENABLED_POLICIES TO &&APP_SCHEMA_OWNER;

PROMPT Energy & Utilities Unified Audit policy is installed and enabled.
