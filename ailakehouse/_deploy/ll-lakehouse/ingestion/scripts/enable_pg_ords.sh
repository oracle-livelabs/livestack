#!/bin/bash

set -euo pipefail

ADMIN_CONNECT="sys/${ORACLE_PWD:-oracle}@//db:1521/FREEPDB1 as sysdba"
PG_SCHEMA_PASSWORD="${DBPASSWORD:-${APP_SCHEMA_PASSWORD:-peakgear}}"

echo ">>> Ensuring local PG schema is enabled for ORDS Database Actions..."
until echo 'SELECT 1 FROM dual;' | sqlplus -L -s system/"${ORACLE_PWD:-oracle}"@db:1521/FREEPDB1 > /dev/null 2>&1; do
  sleep 5
done

sqlplus -L -s "$ADMIN_CONNECT" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
DECLARE
  v_count NUMBER;
  PROCEDURE grant_if_exists(p_role VARCHAR2) IS
    v_role_count NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_role_count FROM dba_roles WHERE role = UPPER(p_role);
    IF v_role_count > 0 THEN
      EXECUTE IMMEDIATE 'GRANT ' || p_role || ' TO PG';
    END IF;
  END;
  PROCEDURE grant_sys_priv(p_priv VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE 'GRANT ' || p_priv || ' TO PG';
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('Skipping PG grant: ' || p_priv || ' -> ' || SQLERRM);
  END;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM dba_users
  WHERE username = 'PG';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER PG IDENTIFIED BY "${PG_SCHEMA_PASSWORD}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User PG created.');
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER PG IDENTIFIED BY "${PG_SCHEMA_PASSWORD}" ACCOUNT UNLOCK';
    EXECUTE IMMEDIATE 'ALTER USER PG DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP';
    EXECUTE IMMEDIATE 'ALTER USER PG QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User PG already exists. Password refreshed.');
  END IF;

  grant_sys_priv('CREATE SESSION');
  grant_sys_priv('CREATE TABLE');
  grant_sys_priv('CREATE VIEW');
  grant_sys_priv('CREATE SEQUENCE');
  grant_sys_priv('CREATE PROCEDURE');
  grant_sys_priv('CREATE TRIGGER');
  grant_sys_priv('CREATE TYPE');
  grant_sys_priv('CREATE JOB');
  grant_sys_priv('UNLIMITED TABLESPACE');
  grant_if_exists('SODA_APP');
  grant_if_exists('GRAPH_DEVELOPER');
  grant_if_exists('DB_DEVELOPER_ROLE');
END;
/
BEGIN
  ORDS_ADMIN.ENABLE_SCHEMA(
    p_enabled             => TRUE,
    p_schema              => 'PG',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'pg',
    p_auto_rest_auth      => FALSE
  );
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('ORDS enabled for PG at /ords/pg/.');
END;
/
EXIT
SQL

echo ">>> PG ORDS Database Actions setup complete."
