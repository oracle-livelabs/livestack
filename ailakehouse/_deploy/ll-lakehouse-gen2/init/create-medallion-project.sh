#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/create-pg-iceberg-connection.sh"
require_tools
load_env
if is_disabled "${DATA_TRANSFORMS_MEDALLION_AUTO_CREATE:-true}" \
  || is_disabled "${DATA_TRANSFORMS_AICAT_AUTO_CREATE:-true}"; then
  log 'Medallion project creation disabled; skipping.'
  exit 0
fi
if ! aicat_connection_is_available; then
  log 'AI Catalog unavailable; skipping the catalog-dependent medallion project.'
  exit 0
fi
DT_BASE_URL="$(trim_trailing_slash "$(derive_data_transforms_base_url)")"
WORK_DIR="$(mktemp -d /tmp/pg-medallion.XXXXXX)"
trap cleanup EXIT
login_data_transforms
prefix="${DATA_TRANSFORMS_API_PREFIX:-${DEFAULT_API_PREFIX}}"
MEDALLION_ADB_ID="$(find_adb_connection_id "${prefix}")"
MEDALLION_AICAT_ID="$(find_connection_id "${DATA_TRANSFORMS_AICAT_CONNECTION_NAME:-pg-aicat}" "${prefix}")"
MEDALLION_AGENT="$(select_agent_name "${prefix}")"
[[ -n "${MEDALLION_ADB_ID}" && -n "${MEDALLION_AICAT_ID}" && -n "${MEDALLION_AGENT}" ]]
cp -R "${WALLET_DIR:-/home/opc/ingestion/wallet}" "${WORK_DIR}/wallet"
sed -i "s#/wallet#${WORK_DIR}/wallet#g" "${WORK_DIR}/wallet/ojdbc.properties"
export TNS_ADMIN="${WORK_DIR}/wallet"
export DT_BASE_URL CURL_AUTH_CONFIG COOKIE_JAR MEDALLION_ADB_ID MEDALLION_AICAT_ID MEDALLION_AGENT
"${PYTHON_BIN}" "${SCRIPT_DIR}/provision-medallion.py"
