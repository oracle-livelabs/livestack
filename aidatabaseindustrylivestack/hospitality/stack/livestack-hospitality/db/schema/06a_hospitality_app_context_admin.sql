/* Run as ADMIN/SYS after HOSPITALITY_SECURITY_PKG exists. */
DEFINE APP_SCHEMA_OWNER = LIVESTACK

CREATE OR REPLACE CONTEXT hospitality_app_ctx
  USING &&APP_SCHEMA_OWNER..hospitality_security_pkg;

SELECT namespace, schema, package
  FROM dba_context
 WHERE namespace = 'HOSPITALITY_APP_CTX';
