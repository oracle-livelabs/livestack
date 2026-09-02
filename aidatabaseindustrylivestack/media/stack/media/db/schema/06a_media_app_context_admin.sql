/*
 * Bind the private Media application context to its trusted definer-rights
 * package. Run as ADMIN after MEDIA_SECURITY_PKG has compiled.
 */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON

DEFINE APP_SCHEMA_OWNER = '&1'

DECLARE
    v_owner VARCHAR2(128);
    v_count PLS_INTEGER;
BEGIN
    v_owner := DBMS_ASSERT.SIMPLE_SQL_NAME(UPPER(TRIM('&&APP_SCHEMA_OWNER')));
    EXECUTE IMMEDIATE
        'CREATE OR REPLACE CONTEXT MEDIA_APP_CTX USING ' ||
        v_owner || '.MEDIA_SECURITY_PKG';

    SELECT COUNT(*) INTO v_count
    FROM dba_context
    WHERE namespace = 'MEDIA_APP_CTX'
      AND schema = v_owner
      AND package = 'MEDIA_SECURITY_PKG';

    IF v_count <> 1 THEN
        RAISE_APPLICATION_ERROR(-20221, 'MEDIA_APP_CTX is not bound to MEDIA_SECURITY_PKG');
    END IF;
END;
/

UNDEFINE APP_SCHEMA_OWNER
PROMPT Media private application context created.
EXIT SUCCESS
