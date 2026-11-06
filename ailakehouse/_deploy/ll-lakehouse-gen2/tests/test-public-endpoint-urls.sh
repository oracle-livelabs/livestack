#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SETENV_FILE="${PROJECT_ROOT}/init/setenv.sh"
COMPOSE_FILE="${PROJECT_ROOT}/ingestion/compose.yml"
SERVER_FILE="${PROJECT_ROOT}/ingestion/backend/server.js"
ICEBERG_ROUTE_FILE="${PROJECT_ROOT}/ingestion/backend/routes/icebergCatalog.js"
ICEBERG_GUIDE_FILE="${PROJECT_ROOT}/ingestion/frontend/src/pages/IcebergCatalogServerGuide.jsx"
FRONTEND_APP_FILE="${PROJECT_ROOT}/ingestion/frontend/src/App.jsx"
FRONTEND_API_FILE="${PROJECT_ROOT}/ingestion/frontend/src/utils/api.js"
STREAMING_ROUTE_FILE="${PROJECT_ROOT}/ingestion/backend/routes/streamingAnalytics.js"
CDC_SETUP_FILE="${PROJECT_ROOT}/ingestion/backend/lib/customerCdcSetup.js"
DATA_TRANSFORMS_SETUP_FILE="${PROJECT_ROOT}/init/create-pg-iceberg-connection.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_text() {
  local file="$1"
  local expected="$2"
  grep -qF -- "${expected}" "${file}" || fail "Missing expected text in ${file}: ${expected}"
}

require_absent() {
  local file="$1"
  local unexpected="$2"
  ! grep -qF -- "${unexpected}" "${file}" || fail "Unexpected text in ${file}: ${unexpected}"
}

[[ ! -e "${ICEBERG_ROUTE_FILE}" ]] || fail "Credential route must not be present."
[[ ! -e "${ICEBERG_GUIDE_FILE}" ]] || fail "Credential guide must not be present."
require_absent "${SERVER_FILE}" "/api/iceberg-catalog"
require_absent "${FRONTEND_APP_FILE}" "iceberg-catalog-server"
require_absent "${FRONTEND_APP_FILE}" "Add Iceberg Catalog Server"
require_absent "${FRONTEND_APP_FILE}" "ICEBERG_CATALOG_SERVER_NAV_ITEM"
require_absent "${FRONTEND_API_FILE}" "/iceberg-catalog/config"
require_text "${FRONTEND_APP_FILE}" 'activePage === SILVER_PROCESS_PAGE_ID || activePage === LOAD_TO_ICEBERG_PAGE_ID'

node --check "${STREAMING_ROUTE_FILE}"
node --check "${CDC_SETUP_FILE}"

require_text "${SETENV_FILE}" 'OSA_PUBLIC_URL=${OSA_PUBLIC_URL:-https://${PUBLIC_ENDPOINT_HOST}:8085/osa/index.html}'
require_text "${SETENV_FILE}" 'GOLDENGATE_PUBLIC_URL=${GOLDENGATE_PUBLIC_URL:-https://${PUBLIC_ENDPOINT_HOST}:8501}'
require_text "${SETENV_FILE}" 'DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST=${DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST:-${PUBLIC_IP}}'
require_text "${COMPOSE_FILE}" 'PUBLIC_HOST: ${PUBLIC_HOST:-}'
require_text "${COMPOSE_FILE}" 'PUBLIC_IP: ${PUBLIC_IP:-}'
require_text "${COMPOSE_FILE}" 'DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST: ${DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST:-}'

derived_iceberg_url="$(
  PUBLIC_IP='161.33.41.1' \
  PUBLIC_HOST='llenv00614.livelabsenv3.oracle.com' \
  DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST='llenv00614.livelabsenv3.oracle.com' \
  DATA_TRANSFORMS_ICEBERG_REST_URL='' \
  bash -c 'source "$1"; derive_iceberg_rest_url' _ "${DATA_TRANSFORMS_SETUP_FILE}"
)"
[[ "${derived_iceberg_url}" == 'http://161.33.41.1:1525/iceberg' ]] \
  || fail "Data Transforms Iceberg URL must use PUBLIC_IP, got ${derived_iceberg_url}"

echo "Public endpoint URL checks passed."
