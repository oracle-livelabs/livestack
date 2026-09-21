#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/opc/ingestion/.env}"
WALLET_DIR="${WALLET_DIR:-/home/opc/ingestion/wallet}"
MARKER_FILE="${AI_DATA_CATALOG_MARKER_FILE:-/home/opc/ingestion/.ai_data_catalog_done}"
STORAGE_MARKER_FILE="${AI_DATA_CATALOG_STORAGE_MARKER_FILE:-/home/opc/ingestion/.ai_data_catalog_storage_registered}"

log() {
  printf '[ai-data-catalog] %s\n' "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

sql_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

sql_password() {
  printf '%s' "$1" | sed 's/"/""/g'
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "${name} is required when AI_DATA_CATALOG_ENABLED=true"
}

[[ -r "${ENV_FILE}" ]] || {
  log "No environment file at ${ENV_FILE}; skipping."
  exit 0
}

set +u
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
set -u

if ! is_enabled "${AI_DATA_CATALOG_ENABLED:-false}"; then
  log "AI Data Catalog is not enabled; skipping."
  exit 0
fi

if [[ -f "${MARKER_FILE}" ]]; then
  log "AI Data Catalog marker exists; skipping."
  exit 0
fi

require_env AI_DATA_CATALOG_URL
require_env AI_DATA_CATALOG_WAREHOUSE
require_env GRAVITINO_S3_ENDPOINT
require_env GRAVITINO_S3_REGION
require_env GRAVITINO_S3_ACCESS_KEY_ID
require_env GRAVITINO_S3_SECRET_ACCESS_KEY
require_env DBPASSWORD

CATALOG_ROOT_URL="${AI_DATA_CATALOG_URL%/}"
[[ "${CATALOG_ROOT_URL}" =~ ^https://[^/]+/catalog$ ]] || fail "AI_DATA_CATALOG_URL must use https://<host>/catalog"
[[ "${AI_DATA_CATALOG_WAREHOUSE}" =~ ^s3://[A-Za-z0-9._-]+$ ]] || fail "AI_DATA_CATALOG_WAREHOUSE must be an empty dedicated bucket in s3://<bucket> form"

CATALOG_NAME="${AI_DATA_CATALOG_NAME:-PG_AICAT}"
TOKEN_CREDENTIAL="${AI_DATA_CATALOG_TOKEN_CREDENTIAL:-PG_AICAT_TOKEN}"
STORAGE_CREDENTIAL="${AI_DATA_CATALOG_STORAGE_CREDENTIAL:-PG_AICAT_STORAGE}"
APP_SCHEMA="${AI_DATA_CATALOG_SCHEMA:-PG}"
for identifier in "${CATALOG_NAME}" "${TOKEN_CREDENTIAL}" "${STORAGE_CREDENTIAL}" "${APP_SCHEMA}"; do
  [[ "${identifier}" =~ ^[A-Za-z][A-Za-z0-9_$#]*$ ]] || fail "AI Data Catalog identifiers must be simple Oracle identifiers"
done
CATALOG_NAME="${CATALOG_NAME^^}"
TOKEN_CREDENTIAL="${TOKEN_CREDENTIAL^^}"
STORAGE_CREDENTIAL="${STORAGE_CREDENTIAL^^}"
APP_SCHEMA="${APP_SCHEMA^^}"

CATALOG_V1_URL="${CATALOG_ROOT_URL}/v1"
TOKEN_URL="${CATALOG_V1_URL}/auth/token"
STORAGE_ENDPOINT="${AI_DATA_CATALOG_S3_ENDPOINT:-${GRAVITINO_S3_ENDPOINT}}"
[[ "${STORAGE_ENDPOINT}" =~ ^https://[^/]+$ ]] || fail "AI_DATA_CATALOG_S3_ENDPOINT must be an HTTPS endpoint without a path"

CONNECT_TARGET="${SERVICE_NAME:-}"
if [[ -z "${CONNECT_TARGET}" || ! -f "${WALLET_DIR}/tnsnames.ora" ]]; then
  fail "A wallet and SERVICE_NAME are required"
fi
if ! grep -Eiq "^[[:space:]]*${CONNECT_TARGET}[[:space:]]*=" "${WALLET_DIR}/tnsnames.ora"; then
  fail "SERVICE_NAME is not present in the ADB wallet"
fi

WORK_DIR="$(mktemp -d /tmp/peakgear-ai-data-catalog.XXXXXX)"
chmod 700 "${WORK_DIR}"
cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

SQLCL_WALLET_DIR="${WORK_DIR}/wallet"
mkdir -p "${SQLCL_WALLET_DIR}"
cp -R "${WALLET_DIR}/." "${SQLCL_WALLET_DIR}/"
if [[ -f "${SQLCL_WALLET_DIR}/ojdbc.properties" ]]; then
  escaped_wallet_dir="$(printf '%s' "${SQLCL_WALLET_DIR}" | sed 's/[\/&]/\\&/g')"
  sed -i "s#/wallet#${escaped_wallet_dir}#g" "${SQLCL_WALLET_DIR}/ojdbc.properties"
fi
export TNS_ADMIN="${SQLCL_WALLET_DIR}"

ADMIN_PASSWORD="$(sql_password "${DBPASSWORD}")"
APP_PASSWORD="$(sql_password "${ADB_STREAM_SCHEMA_PASSWORD:-${DBPASSWORD}}")"
cat > "${WORK_DIR}/configure.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

CONNECT ADMIN/"${ADMIN_PASSWORD}"@"${CONNECT_TARGET}"

DECLARE
  PROCEDURE add_acl(
    p_host VARCHAR2,
    p_privilege VARCHAR2,
    p_lower_port NUMBER DEFAULT NULL,
    p_upper_port NUMBER DEFAULT NULL) IS
  BEGIN
    DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
      host       => p_host,
      lower_port => p_lower_port,
      upper_port => p_upper_port,
      ace        => xs\$ace_type(
        privilege_list => xs\$name_list(p_privilege),
        principal_name => '${APP_SCHEMA}',
        principal_type => xs_acl.ptype_db));
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE IN (-24243, -24244) OR SQLERRM LIKE '%already exists%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;
BEGIN
  EXECUTE IMMEDIATE 'GRANT AICAT_USER TO ${APP_SCHEMA}';
  add_acl('$(sql_literal "${CATALOG_ROOT_URL#https://}")', 'http', 443, 443);
  add_acl('$(sql_literal "${CATALOG_ROOT_URL#https://}")', 'http_proxy', 443, 443);
  add_acl('$(sql_literal "${CATALOG_ROOT_URL#https://}")', 'connect', 443, 443);
  add_acl('$(sql_literal "${CATALOG_ROOT_URL#https://}")', 'resolve');
  add_acl('$(sql_literal "${STORAGE_ENDPOINT#https://}")', 'http', 443, 443);
  add_acl('$(sql_literal "${STORAGE_ENDPOINT#https://}")', 'http_proxy', 443, 443);
  add_acl('$(sql_literal "${STORAGE_ENDPOINT#https://}")', 'connect', 443, 443);
  add_acl('$(sql_literal "${STORAGE_ENDPOINT#https://}")', 'resolve');
  add_acl('*.oraclecloudapps.com', 'http', 443, 443);
  add_acl('*.oraclecloudapps.com', 'http_proxy', 443, 443);
  add_acl('*.oci.customer-oci.com', 'http', 443, 443);
  add_acl('*.oci.customer-oci.com', 'http_proxy', 443, 443);
  DBMS_OUTPUT.PUT_LINE('PG AI Catalog access grants and ACLs verified.');
END;
/

EXIT SUCCESS

SQL

if is_enabled "${AI_DATA_CATALOG_REGISTER_STORAGE:-false}" && [[ ! -f "${STORAGE_MARKER_FILE}" ]]; then
  cat > "${WORK_DIR}/register-storage.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

CONNECT ADMIN/"${ADMIN_PASSWORD}"@"${CONNECT_TARGET}"

BEGIN
  ORACLE_AI_DATA_CATALOG.REGISTER_STORAGE_OCI(
    p_warehouse  => '$(sql_literal "${AI_DATA_CATALOG_WAREHOUSE}")',
    p_endpoint   => '$(sql_literal "${STORAGE_ENDPOINT}")',
    p_region     => '$(sql_literal "${GRAVITINO_S3_REGION}")',
    p_access_key => '$(sql_literal "${GRAVITINO_S3_ACCESS_KEY_ID}")',
    p_secret_key => '$(sql_literal "${GRAVITINO_S3_SECRET_ACCESS_KEY}")');
  DBMS_OUTPUT.PUT_LINE('AI Catalog storage registered.');
END;
/
EXIT SUCCESS
SQL

  if ! sql -L /nolog @"${WORK_DIR}/register-storage.sql" > "${WORK_DIR}/register-storage.out" 2>&1; then
    sed -E 's/(CLIENT_SECRET|p_secret_key|password)[[:space:]]*=>[[:space:]]*[^,)]*/\1 => [REDACTED]/Ig' "${WORK_DIR}/register-storage.out" >&2
    fail "AI Data Catalog storage registration failed"
  fi
  cat "${WORK_DIR}/register-storage.out"
  printf 'registered_at=%s\nwarehouse=%s\n' "$(date -Is)" "${AI_DATA_CATALOG_WAREHOUSE}" > "${STORAGE_MARKER_FILE}"
  chmod 600 "${STORAGE_MARKER_FILE}"
elif is_enabled "${AI_DATA_CATALOG_REGISTER_STORAGE:-false}"; then
  log "AI Data Catalog storage registration marker exists; skipping registration."
fi

cat > "${WORK_DIR}/mount.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

CONNECT "${APP_SCHEMA}"/"${APP_PASSWORD}"@"${CONNECT_TARGET}"

DECLARE
  l_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_count
  FROM user_mounted_catalogs
  WHERE catalog_name = '${CATALOG_NAME}';

  IF l_count > 0 THEN
    DBMS_OUTPUT.PUT_LINE('Catalog ${CATALOG_NAME} is already mounted.');
  ELSE
    SELECT COUNT(*) INTO l_count
    FROM user_credentials
    WHERE credential_name = '${TOKEN_CREDENTIAL}';
    IF l_count = 0 THEN
      DBMS_SHARE.CREATE_BEARER_TOKEN_CREDENTIAL(
        credential_name => '${TOKEN_CREDENTIAL}',
        bearer_token    => 'BEARER_TOKEN',
        token_endpoint  => '$(sql_literal "${TOKEN_URL}")',
        client_id       => '${APP_SCHEMA}',
        client_secret   => '$(sql_literal "${ADB_STREAM_SCHEMA_PASSWORD:-${DBPASSWORD}}")',
        token_scope     => 'PRINCIPAL_ROLE:ALL');
    END IF;

    SELECT COUNT(*) INTO l_count
    FROM user_credentials
    WHERE credential_name = '${STORAGE_CREDENTIAL}';
    IF l_count = 0 THEN
      DBMS_CLOUD.CREATE_CREDENTIAL(
        credential_name => '${STORAGE_CREDENTIAL}',
        username        => '$(sql_literal "${GRAVITINO_S3_ACCESS_KEY_ID}")',
        password        => '$(sql_literal "${GRAVITINO_S3_SECRET_ACCESS_KEY}")');
    END IF;

    DBMS_CATALOG.MOUNT_ICEBERG(
      catalog_name            => '${CATALOG_NAME}',
      endpoint                => '$(sql_literal "${CATALOG_V1_URL}")',
      catalog_credential      => '${TOKEN_CREDENTIAL}',
      data_storage_credential => '${STORAGE_CREDENTIAL}',
      catalog_type            => 'ICEBERG_ORACLE');
  END IF;
END;
/

SELECT catalog_name || ':' || catalog_type AS mounted_catalog
FROM user_mounted_catalogs
WHERE catalog_name = '${CATALOG_NAME}';

EXIT SUCCESS
SQL

if ! sql -L /nolog @"${WORK_DIR}/configure.sql" > "${WORK_DIR}/access.out" 2>&1; then
  sed -E 's/(CLIENT_SECRET|p_secret_key|password)[[:space:]]*=>[[:space:]]*[^,)]*/\1 => [REDACTED]/Ig' "${WORK_DIR}/access.out" >&2
  fail "AI Data Catalog access configuration failed"
fi
cat "${WORK_DIR}/access.out"

if ! sql -L /nolog @"${WORK_DIR}/mount.sql" > "${WORK_DIR}/mount.out" 2>&1; then
  sed -E 's/(CLIENT_SECRET|p_secret_key|password)[[:space:]]*=>[[:space:]]*[^,)]*/\1 => [REDACTED]/Ig' "${WORK_DIR}/mount.out" >&2
  fail "AI Data Catalog mount failed"
fi
cat "${WORK_DIR}/mount.out"

printf 'configured_at=%s\ncatalog_name=%s\n' "$(date -Is)" "${CATALOG_NAME}" > "${MARKER_FILE}"
chmod 600 "${MARKER_FILE}"
log "AI Data Catalog ${CATALOG_NAME} mounted for ${APP_SCHEMA}."
