/*
 * 06a_utilities_app_context_admin.sql
 * Bind the private Energy & Utilities application context to its trusted package.
 *
 * Run as ADMIN after UTILITIES_SECURITY_PKG has compiled:
 *   @06a_utilities_app_context_admin.sql LIVESTACK
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
        'CREATE OR REPLACE CONTEXT UTILITIES_SECURITY_CTX USING ' ||
        v_owner || '.UTILITIES_SECURITY_PKG';

    SELECT COUNT(*)
    INTO v_context_count
    FROM dba_context
    WHERE namespace = 'UTILITIES_SECURITY_CTX'
      AND schema = v_owner
      AND package = 'UTILITIES_SECURITY_PKG'
      AND type = 'ACCESSED LOCALLY';

    IF v_context_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20241,
            'UTILITIES_SECURITY_CTX is not bound locally to the trusted package'
        );
    END IF;
END;
/

UNDEFINE APP_SCHEMA_OWNER

PROMPT Energy & Utilities private application context created.

EXIT SUCCESS
