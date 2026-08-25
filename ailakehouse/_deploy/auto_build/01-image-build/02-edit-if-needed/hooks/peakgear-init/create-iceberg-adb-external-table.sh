#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/opc/ingestion/.env}"
WALLET_DIR="${WALLET_DIR:-/home/opc/ingestion/wallet}"

log() {
  printf '[iceberg-adb] %s\n' "$*"
}

fail() {
  printf '[iceberg-adb] ERROR: %s\n' "$*" >&2
  exit 1
}

sql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "${value}" ]] || fail "${name} is required"
}

validate_sql_name() {
  local name="$1"
  local value="$2"
  [[ "${value}" =~ ^[A-Za-z][A-Za-z0-9_\$#]*$ ]] || fail "${name} must be a simple Oracle identifier: ${value}"
}

[[ -r "${ENV_FILE}" ]] || fail "Environment file not readable: ${ENV_FILE}"
set +u
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
set -u

APP_SCHEMA="${APP_SCHEMA:-PG}"
ICEBERG_NAMESPACE="${ICEBERG_SEED_NAMESPACE:-bronze}"
ICEBERG_TABLE="${ICEBERG_SEED_TABLE:-product_master_raw}"
ADB_TABLE="${ICEBERG_ADB_EXTERNAL_TABLE:-PRODUCT_MASTER_RAW_ICEBERG_EXT}"
ADB_CREDENTIAL="${ICEBERG_ADB_CREDENTIAL_NAME:-${OCI_GENAI_CREDENTIAL_NAME:-PG_OCI_GENAI_CRED}}"
ADB_METADATA_PREFIX="${ICEBERG_SEED_ADB_METADATA_PREFIX:-adb_oci}"
RECREATE_TABLE="${ICEBERG_ADB_EXTERNAL_TABLE_RECREATE:-false}"
SERVICE_ALIAS="${GRAVITINO_JDBC_SERVICE_NAME:-${SERVICE_NAME:-}}"
GRAVITINO_PORT="${GRAVITINO_REST_PORT:-1525}"

require_env DBPASSWORD
require_env GRAVITINO_S3_ENDPOINT
require_env GRAVITINO_S3_REGION
[[ -n "${SERVICE_ALIAS}" ]] || fail "SERVICE_NAME or GRAVITINO_JDBC_SERVICE_NAME is required"
[[ -d "${WALLET_DIR}" ]] || fail "Wallet directory not found: ${WALLET_DIR}"
validate_sql_name APP_SCHEMA "${APP_SCHEMA}"
validate_sql_name ICEBERG_ADB_EXTERNAL_TABLE "${ADB_TABLE}"
validate_sql_name ICEBERG_ADB_CREDENTIAL_NAME "${ADB_CREDENTIAL}"
APP_SCHEMA="${APP_SCHEMA^^}"
ADB_TABLE="${ADB_TABLE^^}"
ADB_CREDENTIAL="${ADB_CREDENTIAL^^}"

export TNS_ADMIN="${WALLET_DIR}"
export JAVA_TOOL_OPTIONS="-Doracle.net.tns_admin=${WALLET_DIR} -Doracle.net.wallet_location=${WALLET_DIR}${JAVA_TOOL_OPTIONS:+ ${JAVA_TOOL_OPTIONS}}"

metadata_location="$(
  curl -fsS "http://127.0.0.1:${GRAVITINO_PORT}/iceberg/v1/namespaces/${ICEBERG_NAMESPACE}/tables/${ICEBERG_TABLE}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["metadata-location"])'
)"

metadata_uri="$(
  python3 - "${metadata_location}" "${GRAVITINO_S3_ENDPOINT}" "${GRAVITINO_S3_REGION}" "${ADB_METADATA_PREFIX}" <<'PY'
import sys
from urllib.parse import quote

metadata_location, endpoint, region, prefix = sys.argv[1:5]
scheme, rest = metadata_location.split("://", 1)
if scheme not in {"s3", "s3a", "s3n"}:
    raise SystemExit(f"Unsupported Iceberg metadata scheme for ADB publishing: {scheme}")
bucket, _, object_name = rest.partition("/")
if not bucket or "/metadata/" not in object_name:
    raise SystemExit(f"Invalid Iceberg metadata location: {metadata_location}")
head, tail = object_name.rsplit("/metadata/", 1)
adb_object = f"{head}/metadata/{prefix.strip('/')}/{tail}"
host = endpoint.split("://", 1)[-1].split("/", 1)[0]
namespace = host.split(".compat.objectstorage.", 1)[0]
print(f"https://objectstorage.{region}.oraclecloud.com/n/{namespace}/b/{bucket}/o/{quote(adb_object, safe='')}")
PY
)"

object_host="objectstorage.${GRAVITINO_S3_REGION}.oraclecloud.com"
log "Creating ADB external table ${APP_SCHEMA}.${ADB_TABLE} from ${ICEBERG_NAMESPACE}.${ICEBERG_TABLE}"

sql -s /nolog <<SQL
SET ECHO OFF
SET DEFINE OFF
SET FEEDBACK ON
SET HEADING OFF
SET PAGESIZE 200
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

CONNECT ADMIN/"${DBPASSWORD}"@"${SERVICE_ALIAS}"

DECLARE
  PROCEDURE grant_role(p_sql VARCHAR2, p_label VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE p_sql;
    DBMS_OUTPUT.PUT_LINE(p_label || ' checked.');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE IN (-1919, -1924) OR SQLERRM LIKE '%already granted%' THEN
        DBMS_OUTPUT.PUT_LINE(p_label || ' already available.');
      ELSE
        DBMS_OUTPUT.PUT_LINE(p_label || ' skipped or already available: ' || SQLERRM);
      END IF;
  END;

  PROCEDURE add_ace(p_privilege VARCHAR2, p_lower NUMBER DEFAULT NULL, p_upper NUMBER DEFAULT NULL) IS
  BEGIN
    DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
      host       => '$(sql_literal "${object_host}")',
      lower_port => p_lower,
      upper_port => p_upper,
      ace        => xs\$ace_type(
        privilege_list => xs\$name_list(p_privilege),
        principal_name => UPPER('$(sql_literal "${APP_SCHEMA}")'),
        principal_type => xs_acl.ptype_db
      )
    );
    DBMS_OUTPUT.PUT_LINE('ACL ' || p_privilege || ' checked for $(sql_literal "${object_host}").');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE IN (-24243, -24244) OR SQLERRM LIKE '%already exists%' THEN
        DBMS_OUTPUT.PUT_LINE('ACL ' || p_privilege || ' already present for $(sql_literal "${object_host}").');
      ELSE
        RAISE;
      END IF;
  END;
BEGIN
  grant_role('GRANT DWROLE TO "$(sql_literal "${APP_SCHEMA}")"', 'DWROLE grant');
  grant_role('GRANT EXECUTE ON DBMS_CLOUD TO "$(sql_literal "${APP_SCHEMA}")"', 'DBMS_CLOUD grant');
  add_ace('http', 443, 443);
  add_ace('resolve');
  add_ace('connect', 443, 443);
END;
/

CONNECT "$(sql_literal "${APP_SCHEMA}")"/"${DBPASSWORD}"@"${SERVICE_ALIAS}"
SET SERVEROUTPUT ON

DECLARE
  l_count NUMBER;
  l_object BLOB;
BEGIN
  SELECT COUNT(*)
    INTO l_count
    FROM user_credentials
   WHERE credential_name = UPPER('$(sql_literal "${ADB_CREDENTIAL}")');

  IF l_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Credential $(sql_literal "${ADB_CREDENTIAL}") is missing in schema $(sql_literal "${APP_SCHEMA}").');
  END IF;

  l_object := DBMS_CLOUD.GET_OBJECT('$(sql_literal "${ADB_CREDENTIAL}")', '$(sql_literal "${metadata_uri}")');
  DBMS_OUTPUT.PUT_LINE('Metadata object bytes=' || DBMS_LOB.GETLENGTH(l_object));
END;
/

DECLARE
  l_exists NUMBER;
  l_rows NUMBER;
  l_table VARCHAR2(128) := UPPER('$(sql_literal "${ADB_TABLE}")');
BEGIN
  SELECT COUNT(*) INTO l_exists FROM user_tables WHERE table_name = l_table;

  IF l_exists > 0 AND LOWER('$(sql_literal "${RECREATE_TABLE}")') IN ('1', 'true', 'yes', 'y', 'on') THEN
    EXECUTE IMMEDIATE 'DROP TABLE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(l_table);
    DBMS_OUTPUT.PUT_LINE('Dropped existing external table ' || l_table || ' for recreation.');
    l_exists := 0;
  END IF;

  IF l_exists = 0 THEN
    DBMS_CLOUD.CREATE_EXTERNAL_TABLE(
      table_name      => l_table,
      credential_name => '$(sql_literal "${ADB_CREDENTIAL}")',
      file_uri_list   => '$(sql_literal "${metadata_uri}")',
      format          => '{"access_protocol":{"protocol_type":"iceberg"}}');
    DBMS_OUTPUT.PUT_LINE('External table created: ' || l_table);
  ELSE
    DBMS_OUTPUT.PUT_LINE('External table already exists: ' || l_table);
  END IF;

  EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || DBMS_ASSERT.SIMPLE_SQL_NAME(l_table) INTO l_rows;
  DBMS_OUTPUT.PUT_LINE('ROW_COUNT=' || l_rows);
END;
/

EXIT
SQL

log "ADB Iceberg external table is ready: ${APP_SCHEMA}.${ADB_TABLE}"
