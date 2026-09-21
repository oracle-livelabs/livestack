/*
 * ADMIN-owned, idempotent Unified Audit policy.
 * Usage: @16_retail_unified_audit_admin.sql LIVESTACK
 */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET VERIFY OFF
DEFINE APP_SCHEMA_OWNER = '&1'

/*
 * The policy and audit trail are admin-only surfaces. A definer-rights
 * package cannot rely on SYSTEM's catalog roles, so grant only the three
 * views it needs directly to SYSTEM. The application schema keeps neither
 * AUDIT_ADMIN nor AUDIT_VIEWER and receives only EXECUTE on the narrow proof.
 */
GRANT SELECT ON SYS.AUDIT_UNIFIED_POLICIES TO SYSTEM;
GRANT SELECT ON SYS.AUDIT_UNIFIED_ENABLED_POLICIES TO SYSTEM;
GRANT SELECT ON AUDSYS.UNIFIED_AUDIT_TRAIL TO SYSTEM;

DECLARE
    v_rows PLS_INTEGER;
    v_expected PLS_INTEGER;
BEGIN
    SELECT COUNT(*),
           COUNT(CASE
             WHEN audit_option = 'UPDATE' AND object_schema = UPPER('&&APP_SCHEMA_OWNER') AND object_name = 'ORDERS' THEN 1
             WHEN audit_option = 'DELETE' AND object_schema = UPPER('&&APP_SCHEMA_OWNER') AND object_name = 'ORDERS' THEN 1
             WHEN audit_option = 'UPDATE' AND object_schema = UPPER('&&APP_SCHEMA_OWNER') AND object_name = 'RETURN_REQUESTS' THEN 1
             WHEN audit_option = 'INSERT' AND object_schema = UPPER('&&APP_SCHEMA_OWNER') AND object_name = 'RETURN_DECISIONS' THEN 1
           END)
    INTO v_rows, v_expected
    FROM audit_unified_policies
    WHERE policy_name = 'RETAIL_OPERATION_AUDIT';

    IF v_rows = 0 THEN
        EXECUTE IMMEDIATE q'[
            CREATE AUDIT POLICY retail_operation_audit
                ACTIONS UPDATE ON &&APP_SCHEMA_OWNER..orders,
                        DELETE ON &&APP_SCHEMA_OWNER..orders,
                        UPDATE ON &&APP_SCHEMA_OWNER..return_requests,
                        INSERT ON &&APP_SCHEMA_OWNER..return_decisions
        ]';
        v_rows := 4;
        v_expected := 4;
    END IF;
    IF v_rows <> 4 OR v_expected <> 4 THEN
        RAISE_APPLICATION_ERROR(-20420, 'RETAIL_OPERATION_AUDIT has a conflicting definition');
    END IF;
END;
/

DECLARE
    v_enabled PLS_INTEGER;
BEGIN
    SELECT COUNT(DISTINCT policy_name) INTO v_enabled
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'RETAIL_OPERATION_AUDIT'
      AND entity_name = 'ALL USERS';
    IF v_enabled = 0 THEN
        EXECUTE IMMEDIATE 'AUDIT POLICY retail_operation_audit';
    END IF;

    SELECT COUNT(DISTINCT policy_name) INTO v_enabled
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'RETAIL_OPERATION_AUDIT'
      AND entity_name = 'ALL USERS';
    IF v_enabled <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20421,
            'RETAIL_OPERATION_AUDIT is not enabled for all users'
        );
    END IF;
END;
/

/*
 * The application owner deliberately has neither AUDIT_ADMIN nor
 * AUDIT_VIEWER. This narrow SYSTEM-owned, definer-rights package exposes only
 * exact Retail policy metadata plus correlated allowed and denied INSERT
 * results. It
 * cannot create, change, disable, or purge audit policy or trail records.
 */
CREATE OR REPLACE PACKAGE SYSTEM.retail_audit_evidence_pkg AUTHID DEFINER AS
    PROCEDURE prove_denial(
        p_object_owner               IN  VARCHAR2,
        p_allowed_client_identifier  IN  VARCHAR2,
        p_denied_client_identifier   IN  VARCHAR2,
        p_started_at                 IN  TIMESTAMP WITH TIME ZONE,
        p_policy_rows                OUT NUMBER,
        p_enabled_rows               OUT NUMBER,
        p_allowed_rows               OUT NUMBER,
        p_allowed_return_code        OUT NUMBER,
        p_denied_rows                OUT NUMBER,
        p_denied_return_code         OUT NUMBER
    );
END retail_audit_evidence_pkg;
/

CREATE OR REPLACE PACKAGE BODY SYSTEM.retail_audit_evidence_pkg AS
    PROCEDURE prove_denial(
        p_object_owner               IN  VARCHAR2,
        p_allowed_client_identifier  IN  VARCHAR2,
        p_denied_client_identifier   IN  VARCHAR2,
        p_started_at                 IN  TIMESTAMP WITH TIME ZONE,
        p_policy_rows                OUT NUMBER,
        p_enabled_rows               OUT NUMBER,
        p_allowed_rows               OUT NUMBER,
        p_allowed_return_code        OUT NUMBER,
        p_denied_rows                OUT NUMBER,
        p_denied_return_code         OUT NUMBER
    ) IS
        v_owner VARCHAR2(128) :=
            UPPER(DBMS_ASSERT.SIMPLE_SQL_NAME(p_object_owner));
    BEGIN
        SELECT COUNT(*)
        INTO p_policy_rows
        FROM audit_unified_policies
        WHERE policy_name = 'RETAIL_OPERATION_AUDIT'
          AND object_schema = v_owner
          AND (
            (audit_option = 'UPDATE' AND object_name = 'ORDERS')
            OR (audit_option = 'DELETE' AND object_name = 'ORDERS')
            OR (audit_option = 'UPDATE' AND object_name = 'RETURN_REQUESTS')
            OR (audit_option = 'INSERT' AND object_name = 'RETURN_DECISIONS')
          );

        SELECT COUNT(DISTINCT policy_name)
        INTO p_enabled_rows
        FROM audit_unified_enabled_policies
        WHERE policy_name = 'RETAIL_OPERATION_AUDIT'
          AND entity_name = 'ALL USERS';

        SELECT COUNT(*), NVL(MAX(return_code), 0)
        INTO p_allowed_rows, p_allowed_return_code
        FROM unified_audit_trail
        WHERE unified_audit_policies LIKE '%RETAIL_OPERATION_AUDIT%'
          AND dbusername = v_owner
          AND client_identifier = p_allowed_client_identifier
          AND event_timestamp >= p_started_at
          AND action_name = 'INSERT'
          AND object_schema = v_owner
          AND object_name = 'RETURN_DECISIONS'
          AND return_code = 0;

        SELECT COUNT(*), NVL(MAX(return_code), 0)
        INTO p_denied_rows, p_denied_return_code
        FROM unified_audit_trail
        WHERE unified_audit_policies LIKE '%RETAIL_OPERATION_AUDIT%'
          AND dbusername = v_owner
          AND client_identifier = p_denied_client_identifier
          AND event_timestamp >= p_started_at
          AND action_name = 'INSERT'
          AND object_schema = v_owner
          AND object_name = 'RETURN_DECISIONS'
          AND return_code <> 0;
    END prove_denial;
END retail_audit_evidence_pkg;
/

GRANT EXECUTE ON SYSTEM.retail_audit_evidence_pkg TO &&APP_SCHEMA_OWNER;

UNDEFINE APP_SCHEMA_OWNER
EXIT SUCCESS
