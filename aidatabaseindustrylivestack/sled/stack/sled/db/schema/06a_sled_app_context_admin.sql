/*
 * Bind the private State and Local application context to its trusted package.
 * Run as ADMIN after SLED_SECURITY_PKG has compiled in the application schema:
 *   @06a_sled_app_context_admin.sql LIVESTACK
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

    -- Idempotent form of: CREATE CONTEXT SLED_APP_CTX USING <owner>.SLED_SECURITY_PKG
    EXECUTE IMMEDIATE
        'CREATE OR REPLACE CONTEXT SLED_APP_CTX USING ' ||
        v_owner || '.SLED_SECURITY_PKG';

    SELECT COUNT(*)
    INTO   v_context_count
    FROM   DBA_CONTEXT
    WHERE  namespace = 'SLED_APP_CTX'
      AND  schema = v_owner
      AND  package = 'SLED_SECURITY_PKG'
      AND  type = 'ACCESSED LOCALLY';

    IF v_context_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20201,
            'SLED_APP_CTX is not bound locally to the trusted package'
        );
    END IF;
END;
/

UNDEFINE APP_SCHEMA_OWNER

PROMPT Private SLED application context created and verified.
EXIT SUCCESS
