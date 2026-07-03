/*
 * 06a_manufacturing_app_context_admin.sql
 * Bind the local Manufacturing application context to its trusted package.
 *
 * Run as ADMIN after MANUFACTURING_SECURITY_PKG has compiled in the
 * application schema. Usage:
 *   @06a_manufacturing_app_context_admin.sql LIVESTACK
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON

DEFINE APP_SCHEMA_OWNER = '&1'

DECLARE
    v_owner         VARCHAR2(128);
    v_context_count PLS_INTEGER;
BEGIN
    v_owner := DBMS_ASSERT.SIMPLE_SQL_NAME(UPPER(TRIM('&&APP_SCHEMA_OWNER')));

    EXECUTE IMMEDIATE
        'CREATE CONTEXT MANUFACTURING_APP_CTX USING ' ||
        v_owner || '.MANUFACTURING_SECURITY_PKG';

    SELECT COUNT(*)
    INTO v_context_count
    FROM dba_context
    WHERE namespace = 'MANUFACTURING_APP_CTX'
      AND schema = v_owner
      AND package = 'MANUFACTURING_SECURITY_PKG'
      AND type = 'ACCESSED LOCALLY';

    IF v_context_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20201,
            'MANUFACTURING_APP_CTX is not bound locally to the trusted package'
        );
    END IF;
END;
/

UNDEFINE APP_SCHEMA_OWNER

PROMPT Manufacturing application context created.

EXIT SUCCESS
