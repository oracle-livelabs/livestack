/*
 * ADMIN-owned exact policy; the application owner does not retain AUDIT_ADMIN.
 * Usage: @16_media_unified_audit_admin.sql LIVESTACK
 */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET VERIFY OFF
SET DEFINE ON

DEFINE APP_SCHEMA_OWNER = '&1'

DECLARE
    v_rows PLS_INTEGER;
    v_expected PLS_INTEGER;
    v_enabled PLS_INTEGER;
BEGIN
    SELECT COUNT(*),
           COUNT(CASE
             WHEN audit_option = 'UPDATE'
              AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
              AND object_name = 'ORDERS' THEN 1
             WHEN audit_option = 'DELETE'
              AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
              AND object_name = 'ORDERS' THEN 1
             WHEN audit_option = 'INSERT'
              AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
              AND object_name = 'AGENT_ACTIONS' THEN 1
             WHEN audit_option = 'UPDATE'
              AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
              AND object_name = 'FULFILLMENT_CENTERS' THEN 1
           END)
    INTO v_rows, v_expected
    FROM audit_unified_policies
    WHERE policy_name = 'SC_ORDER_AUDIT';
    IF v_rows <> 4 OR v_expected <> 4 THEN
        IF v_rows > 0 THEN
            SELECT COUNT(*) INTO v_enabled
            FROM audit_unified_enabled_policies
            WHERE policy_name = 'SC_ORDER_AUDIT'
              AND entity_name = 'ALL USERS';
            IF v_enabled > 0 THEN
                EXECUTE IMMEDIATE 'NOAUDIT POLICY SC_ORDER_AUDIT';
            END IF;
            EXECUTE IMMEDIATE 'DROP AUDIT POLICY SC_ORDER_AUDIT';
        END IF;
        EXECUTE IMMEDIATE q'[
          CREATE AUDIT POLICY sc_order_audit
            ACTIONS UPDATE ON &&APP_SCHEMA_OWNER..orders,
                    DELETE ON &&APP_SCHEMA_OWNER..orders,
                    INSERT ON &&APP_SCHEMA_OWNER..agent_actions,
                    UPDATE ON &&APP_SCHEMA_OWNER..fulfillment_centers
            WHEN 'SYS_CONTEXT(''USERENV'', ''SESSION_USER'') != ''ADMIN'''
            EVALUATE PER SESSION
        ]';
    END IF;
END;
/

DECLARE
    v_enabled PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_enabled
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'SC_ORDER_AUDIT' AND entity_name = 'ALL USERS';
    IF v_enabled = 0 THEN
        EXECUTE IMMEDIATE 'AUDIT POLICY SC_ORDER_AUDIT';
    END IF;
END;
/

DECLARE
    v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM dba_role_privs
    WHERE grantee = UPPER('&&APP_SCHEMA_OWNER')
      AND granted_role = 'AUDIT_ADMIN';
    IF v_count > 0 THEN
        EXECUTE IMMEDIATE 'REVOKE AUDIT_ADMIN FROM &&APP_SCHEMA_OWNER';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM dba_sys_privs
    WHERE grantee = UPPER('&&APP_SCHEMA_OWNER')
      AND privilege = 'CREATE ROLE';
    IF v_count > 0 THEN
        EXECUTE IMMEDIATE 'REVOKE CREATE ROLE FROM &&APP_SCHEMA_OWNER';
    END IF;
END;
/

/*
 * UNIFIED_AUDIT_TRAIL is owned by AUDSYS. A view created in the application
 * schema resolves its dependencies with the application owner's privileges,
 * even when a SYSDBA session issues the CREATE VIEW statement. Keep the
 * filtered evidence surface in SYSTEM, which is the ADMIN-managed boundary,
 * and grant the application only SELECT on that narrow view.
 */
GRANT SELECT ON AUDSYS.UNIFIED_AUDIT_TRAIL
TO SYSTEM WITH GRANT OPTION;

CREATE OR REPLACE VIEW SYSTEM.media_unified_audit_evidence_v AS
SELECT event_timestamp, dbusername, client_identifier, action_name,
       object_schema, object_name, return_code, sql_text
FROM AUDSYS.UNIFIED_AUDIT_TRAIL
WHERE object_schema = UPPER('&&APP_SCHEMA_OWNER')
  AND object_name IN ('ORDERS','AGENT_ACTIONS','FULFILLMENT_CENTERS')
  AND (
    sql_text LIKE '%MEDIA_AUDIT_ALLOWED_%'
    OR sql_text LIKE '%MEDIA_AUDIT_DENIED_%'
  );

GRANT SELECT ON SYSTEM.media_unified_audit_evidence_v TO &&APP_SCHEMA_OWNER;

DECLARE
    v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM dba_views
    WHERE owner = UPPER('&&APP_SCHEMA_OWNER')
      AND view_name = 'MEDIA_UNIFIED_AUDIT_EVIDENCE_V';

    IF v_count > 0 THEN
        EXECUTE IMMEDIATE
          'DROP VIEW &&APP_SCHEMA_OWNER..media_unified_audit_evidence_v';
    END IF;
END;
/

UNDEFINE APP_SCHEMA_OWNER
EXIT SUCCESS
