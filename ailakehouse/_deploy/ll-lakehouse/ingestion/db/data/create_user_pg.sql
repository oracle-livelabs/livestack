-- Generated from Autonomous Database as ADMIN.
-- Service: SZ5KM3VSRS3LIE5_DELIGHT_high.adb.oraclecloud.com
-- Target user: PG
-- Account status: OPEN
-- Profile: DEFAULT
-- Password versions: 11G 12C 
-- Generated at: 2026-05-12T05:53:20.570Z
-- Seed password: supplied at runtime from DBPASSWORD
-- Note: Autonomous Database CLOUD_VERIFY_FUNCTION rejects passwords containing the username.

SET DEFINE OFF;

PROMPT Creating user PG
CREATE USER "PG" IDENTIFIED BY "REPLACED_AT_RUNTIME"
      DEFAULT COLLATION "USING_NLS_COMP" 
      DEFAULT TABLESPACE "DATA"
      TEMPORARY TABLESPACE "TEMP";

PROMPT Applying tablespace quotas
DECLARE 
  TEMP_COUNT NUMBER; 
  SQLSTR VARCHAR2(200); 
BEGIN 
  SQLSTR := 'ALTER USER "PG" QUOTA UNLIMITED ON "DATA"';
  EXECUTE IMMEDIATE SQLSTR;
EXCEPTION 
  WHEN OTHERS THEN
    IF SQLCODE = -30041 THEN 
      SQLSTR := 'SELECT COUNT(*) FROM USER_TABLESPACES 
              WHERE TABLESPACE_NAME = ''DATA'' AND CONTENTS = ''TEMPORARY''';
      EXECUTE IMMEDIATE SQLSTR INTO TEMP_COUNT;
      IF TEMP_COUNT = 1 THEN RETURN; 
      ELSE RAISE; 
      END IF;
    ELSE
      RAISE;
    END IF;
END;
/

PROMPT Applying role grants
GRANT "CONNECT" TO "PG";
   GRANT "RESOURCE" TO "PG";
   GRANT "DB_DEVELOPER_ROLE" TO "PG";
   GRANT "SODA_APP" TO "PG";
   GRANT "DWROLE" TO "PG";
   GRANT "PYQADMIN" TO "PG";
   GRANT "CONSOLE_DEVELOPER" TO "PG";
   GRANT "DATA_TRANSFORM_USER" TO "PG";
   GRANT "OML_DEVELOPER" TO "PG";
   GRANT "GRAPH_DEVELOPER" TO "PG";
   GRANT "GRAPH_ADMINISTRATOR" TO "PG";
   GRANT "DV_MONITOR" TO "PG";

PROMPT Applying optional Spatial Studio role grants
-- Feature-specific role grants are guarded because this script is also used during
-- image builds and reseeds where the target ADB feature set can differ by version.
DECLARE
  PROCEDURE grant_role_if_exists(p_role_name VARCHAR2) IS
    v_count NUMBER := 0;
  BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM dba_roles
    WHERE role = UPPER(p_role_name);

    IF v_count > 0 THEN
      EXECUTE IMMEDIATE 'GRANT "' || UPPER(p_role_name) || '" TO "PG"';
      DBMS_OUTPUT.PUT_LINE('Granted ' || UPPER(p_role_name) || ' to PG.');
    ELSE
      DBMS_OUTPUT.PUT_LINE('Role ' || UPPER(p_role_name) || ' is not available; continuing.');
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('Grant ' || UPPER(p_role_name) || ' not applied: ' || SQLERRM);
  END;
BEGIN
  grant_role_if_exists('SPATIAL_ADMIN');
  grant_role_if_exists('SPATIAL_AUTHOR');
  grant_role_if_exists('SPATIAL_CONSUMER');
END;
/

PROMPT Applying default roles
ALTER USER "PG" DEFAULT ROLE "CONNECT", "RESOURCE", "DB_DEVELOPER_ROLE", "SODA_APP", "DWROLE", "PYQADMIN", "CONSOLE_DEVELOPER", "DATA_TRANSFORM_USER", "OML_DEVELOPER", "GRAPH_DEVELOPER", "GRAPH_ADMINISTRATOR", "DV_MONITOR";

PROMPT Applying optional Spatial Studio default roles
DECLARE
  v_roles VARCHAR2(4000) := NULL;

  PROCEDURE append_role_if_granted(p_role_name VARCHAR2) IS
    v_count NUMBER := 0;
  BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM dba_role_privs
    WHERE grantee = 'PG'
      AND granted_role = UPPER(p_role_name);

    IF v_count > 0 THEN
      v_roles := v_roles || ', "' || UPPER(p_role_name) || '"';
    END IF;
  END;
BEGIN
  append_role_if_granted('SPATIAL_ADMIN');
  append_role_if_granted('SPATIAL_AUTHOR');
  append_role_if_granted('SPATIAL_CONSUMER');

  IF v_roles IS NOT NULL THEN
    EXECUTE IMMEDIATE 'ALTER USER "PG" DEFAULT ROLE "CONNECT", "RESOURCE", "DB_DEVELOPER_ROLE", "SODA_APP", "DWROLE", "PYQADMIN", "CONSOLE_DEVELOPER", "DATA_TRANSFORM_USER", "OML_DEVELOPER", "GRAPH_DEVELOPER", "GRAPH_ADMINISTRATOR", "DV_MONITOR"' || v_roles;
  END IF;
END;
/

PROMPT Enabling ORDS schema mapping for DB Actions
BEGIN
  ORDS_ADMIN.ENABLE_SCHEMA(
    p_enabled             => TRUE,
    p_schema              => 'PG',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'pg',
    p_auto_rest_auth      => FALSE
  );
  COMMIT;
END;
/

PROMPT Applying system grants
GRANT CREATE SESSION, CREATE TABLE, CREATE VIEW, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TYPE, CREATE SYNONYM, CREATE TRIGGER TO "PG";

PROMPT Enabling Spatial Studio proxy access
BEGIN
  EXECUTE IMMEDIATE 'ALTER USER "PG" GRANT CONNECT THROUGH "SPATIAL$PROXY_USER"';
  DBMS_OUTPUT.PUT_LINE('Enabled Spatial Studio proxy access for PG.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Spatial Studio proxy access not applied: ' || SQLERRM);
END;
/

PROMPT Enabling Graph Studio proxy access
BEGIN
  EXECUTE IMMEDIATE 'ALTER USER "PG" GRANT CONNECT THROUGH "GRAPH$PROXY_USER"';
  DBMS_OUTPUT.PUT_LINE('Enabled Graph Studio proxy access for PG.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Graph Studio proxy access not applied: ' || SQLERRM);
END;
/

PROMPT Applying object grants
-- No object grants found for PG.

PROMPT Enabling Cloud Links access for PG
-- Cloud Links package calls stay dynamic so unavailable package support is
-- reported without aborting PG creation on nonmatching ADB images.
DECLARE
  PROCEDURE run_cloud_link_admin(p_label VARCHAR2, p_sql VARCHAR2, p_arg1 VARCHAR2, p_arg2 VARCHAR2 DEFAULT NULL) IS
  BEGIN
    IF p_arg2 IS NULL THEN
      EXECUTE IMMEDIATE p_sql USING p_arg1;
    ELSE
      EXECUTE IMMEDIATE p_sql USING p_arg1, p_arg2;
    END IF;
    DBMS_OUTPUT.PUT_LINE('Cloud Links ' || p_label || ' enabled for PG.');
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('Cloud Links ' || p_label || ' not applied: ' || SQLERRM);
  END;
BEGIN
  run_cloud_link_admin(
    'READ',
    'BEGIN C##CLOUD$SERVICE.DBMS_CLOUD_LINK_ADMIN.GRANT_READ(USERNAME => :1); END;',
    'PG'
  );
  run_cloud_link_admin(
    'REGISTER MY$COMPARTMENT',
    'BEGIN C##CLOUD$SERVICE.DBMS_CLOUD_LINK_ADMIN.GRANT_REGISTER(USERNAME => :1, SCOPE => :2); END;',
    'PG',
    'MY$COMPARTMENT'
  );
  run_cloud_link_admin(
    'AUTHORIZE',
    'BEGIN C##CLOUD$SERVICE.DBMS_CLOUD_LINK_ADMIN.GRANT_AUTHORIZE(USERNAME => :1); END;',
    'PG'
  );
END;
/

PROMPT PG user DDL complete
