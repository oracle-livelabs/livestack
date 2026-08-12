#!/bin/bash
set -euo pipefail

: "${ORACLE_PWD:?ORACLE_PWD must be set}"
: "${DBHOST:=db}"
: "${DBPORT:=1521}"
: "${DBSERVICENAME:=FREEPDB1}"
: "${ORACLE_USER:=LIVESTACK}"

if [[ ! "$ORACLE_USER" =~ ^[A-Za-z][A-Za-z0-9_]{0,127}$ ]]; then
  echo ">>> ERROR: ORACLE_USER must be an unquoted Oracle identifier using letters, numbers, or underscores."
  exit 1
fi

APP_SCHEMA_USER_UPPER="$(printf '%s' "$ORACLE_USER" | tr '[:lower:]' '[:upper:]')"
APP_SCHEMA_URL_MAPPING="$(printf '%s' "$ORACLE_USER" | tr '[:upper:]' '[:lower:]')"

echo ">>> Enabling ${APP_SCHEMA_USER_UPPER} schema for ORDS SQL Developer Web..."

sql -L -s "sys/${ORACLE_PWD}@${DBHOST}:${DBPORT}/${DBSERVICENAME} as sysdba" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
BEGIN
  ORDS_METADATA.ORDS_ADMIN.ENABLE_SCHEMA(
    p_enabled             => TRUE,
    p_schema              => '${APP_SCHEMA_USER_UPPER}',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => '${APP_SCHEMA_URL_MAPPING}',
    p_auto_rest_auth      => FALSE
  );
  COMMIT;
  DBMS_OUTPUT.PUT_LINE('${APP_SCHEMA_USER_UPPER} schema is enabled for ORDS.');
END;
/
EXIT
SQL

echo ">>> ${APP_SCHEMA_USER_UPPER} ORDS schema enablement complete."
