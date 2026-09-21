#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_SCRIPT="${PROJECT_ROOT}/init/configure-ai-data-catalog.sh"
VARIABLE_SCRIPT="${PROJECT_ROOT}/init/variable.sh"
SETENV_SCRIPT="${PROJECT_ROOT}/init/setenv.sh"
SERVICE_FILE="${PROJECT_ROOT}/init/pg-ai-data-catalog.service"
PODMAN_SERVICE="${PROJECT_ROOT}/init/user-podman.service"
INSTALLER="${PROJECT_ROOT}/inst.sh"
IMAGE_PREP="${PROJECT_ROOT}/prepare-custom-image.sh"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-ai-data-catalog.XXXXXX")"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_text() {
  local file="$1"
  local expected="$2"
  grep -qF -- "${expected}" "${file}" || fail "Missing expected text in ${file}: ${expected}"
}

bash -n "${CONFIG_SCRIPT}"
bash -n "${VARIABLE_SCRIPT}"
bash -n "${SETENV_SCRIPT}"

printf 'AI_DATA_CATALOG_ENABLED=false\n' > "${TEMP_DIR}/env"
disabled_output="$(
  ENV_FILE="${TEMP_DIR}/env" \
  AI_DATA_CATALOG_MARKER_FILE="${TEMP_DIR}/marker" \
  WALLET_DIR="${TEMP_DIR}/wallet" \
  bash "${CONFIG_SCRIPT}"
)"
grep -qF -- 'AI Data Catalog is not enabled; skipping.' <<< "${disabled_output}" \
  || fail "Disabled AI Catalog configuration did not skip cleanly"
[[ ! -e "${TEMP_DIR}/marker" ]] || fail "Disabled AI Catalog configuration wrote a marker"

require_text "${CONFIG_SCRIPT}" 'AI_DATA_CATALOG_URL must use https://<host>/catalog'
require_text "${CONFIG_SCRIPT}" 'AI_DATA_CATALOG_WAREHOUSE must be an empty dedicated bucket'
require_text "${CONFIG_SCRIPT}" "ORACLE_AI_DATA_CATALOG.REGISTER_STORAGE_OCI"
require_text "${CONFIG_SCRIPT}" "GRANT AICAT_USER TO"
require_text "${CONFIG_SCRIPT}" "DBMS_SHARE.CREATE_BEARER_TOKEN_CREDENTIAL"
require_text "${CONFIG_SCRIPT}" "DBMS_CATALOG.MOUNT_ICEBERG"
require_text "${CONFIG_SCRIPT}" "catalog_type            => 'ICEBERG_ORACLE'"
require_text "${CONFIG_SCRIPT}" "principal_name => '\${APP_SCHEMA}'"
require_text "${CONFIG_SCRIPT}" "add_acl('*.oraclecloudapps.com', 'http', 443, 443);"
require_text "${CONFIG_SCRIPT}" "add_acl('*.oci.customer-oci.com', 'http', 443, 443);"

for metadata_key in \
  AI_DATA_CATALOG_ENABLED \
  AI_DATA_CATALOG_URL \
  AI_DATA_CATALOG_WAREHOUSE \
  AI_DATA_CATALOG_S3_ENDPOINT \
  AI_DATA_CATALOG_REGISTER_STORAGE; do
  require_text "${VARIABLE_SCRIPT}" "\"${metadata_key}\""
  require_text "${SETENV_SCRIPT}" "\"${metadata_key}="
done

require_text "${SERVICE_FILE}" "After=network-online.target adb-wallet.service adb-load.service"
require_text "${SERVICE_FILE}" "Before=user-podman.service"
require_text "${SERVICE_FILE}" "/home/opc/init/configure-ai-data-catalog.sh"
require_text "${PODMAN_SERVICE}" "pg-ai-data-catalog.service"
require_text "${INSTALLER}" "pg-ai-data-catalog.service"
require_text "${INSTALLER}" "configure-ai-data-catalog.sh"
require_text "${IMAGE_PREP}" "PG_AI_DATA_CATALOG_SERVICE"
require_text "${IMAGE_PREP}" ".ai_data_catalog_done"
require_text "${IMAGE_PREP}" ".ai_data_catalog_storage_registered"
require_text "${CONFIG_SCRIPT}" "user_credentials"
require_text "${CONFIG_SCRIPT}" "AI Data Catalog storage registration marker exists"

echo "AI Data Catalog bootstrap checks passed."
