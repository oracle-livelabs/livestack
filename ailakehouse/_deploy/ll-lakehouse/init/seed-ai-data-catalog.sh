#!/usr/bin/env bash
# Optional post-start job. No marker is baked into the custom image: the remote
# catalog's seed fingerprint and snapshot determine whether data already exists.
set -euo pipefail
umask 077
ENV_FILE="${ENV_FILE:-/home/opc/ingestion/.env}"
INGESTION_DIR="${INGESTION_DIR:-/home/opc/ingestion}"
WALLET_DIR="${WALLET_DIR:-${INGESTION_DIR}/wallet}"
log() { printf '[aicat-bronze] %s\n' "$*"; }
[[ -r "${ENV_FILE}" ]] || { log 'Environment unavailable; skipping.'; exit 0; }
set +u
set -a
source "${ENV_FILE}"
set +a
set -u
case "${AI_DATA_CATALOG_ENABLED:-false}" in
  true|TRUE|1|yes|on) ;;
  *) log 'AI Catalog disabled; skipping.'; exit 0 ;;
esac
[[ -n "${AI_DATA_CATALOG_URL:-}" ]] || { log 'AI Catalog URL unavailable; skipping.'; exit 0; }

# Serialize manual/service reruns on this VM.
exec 9>"${INGESTION_DIR}/.ai_catalog_bronze.lock"
flock -n 9 || { log 'Another seed is running; skipping.'; exit 0; }
WORK_DIR="$(mktemp -d /tmp/peakgear-aicat-bronze.XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

main() {
  local name
  local env_args=()
  for name in AI_DATA_CATALOG_ENABLED AI_DATA_CATALOG_URL AI_DATA_CATALOG_WAREHOUSE \
    AI_DATA_CATALOG_SCHEMA AI_DATA_CATALOG_NAME AI_DATA_CATALOG_STORAGE_CREDENTIAL AI_DATA_CATALOG_S3_ENDPOINT \
    GRAVITINO_S3_ENDPOINT GRAVITINO_S3_REGION GRAVITINO_S3_ACCESS_KEY_ID \
    GRAVITINO_S3_SECRET_ACCESS_KEY DBPASSWORD ADB_STREAM_SCHEMA_PASSWORD; do
    [[ -v "${name}" ]] && env_args+=(--env "${name}")
  done
  podman run --rm --userns=keep-id --network=host "${env_args[@]}" \
    -v "${INGESTION_DIR}/iceberg-seeder:/workspace/seeder:ro,z" \
    -v "${INGESTION_DIR}/demodata/aicat-sources:/sources:ro,z" \
    -v "${WORK_DIR}:/output:Z" --entrypoint python \
    localhost/iceberg-seeder:latest /workspace/seeder/seed_ai_catalog.py || return 1
  [[ -s "${WORK_DIR}/external-tables.sql" ]] || return 0

  [[ "${SERVICE_NAME:-}" =~ ^[A-Za-z0-9_]+$ ]] || return 1
  [[ "${AI_DATA_CATALOG_SCHEMA:-PG}" =~ ^[A-Za-z][A-Za-z0-9_]*$ ]] || return 1
  [[ -f "${WALLET_DIR}/tnsnames.ora" ]] || return 1
  mkdir "${WORK_DIR}/wallet" || return 1
  cp -R "${WALLET_DIR}/." "${WORK_DIR}/wallet/" || return 1
  if [[ -f "${WORK_DIR}/wallet/ojdbc.properties" ]]; then
    sed -i "s#/wallet#${WORK_DIR}/wallet#g" "${WORK_DIR}/wallet/ojdbc.properties" || return 1
  fi
  export TNS_ADMIN="${WORK_DIR}/wallet"
  local password="${ADB_STREAM_SCHEMA_PASSWORD:-${DBPASSWORD}}"
  password="${password//\"/\"\"}"
  # Keep SQLcl error context (which may echo SQL literals) out of service logs.
  if ! sql -s /nolog >"${WORK_DIR}/sql.log" 2>&1 <<SQL
SET ECHO OFF
SET DEFINE OFF
WHENEVER SQLERROR EXIT FAILURE ROLLBACK
WHENEVER OSERROR EXIT FAILURE ROLLBACK
CONNECT "${AI_DATA_CATALOG_SCHEMA:-PG}"/"${password}"@"${SERVICE_NAME}"
@${WORK_DIR}/external-tables.sql
SQL
  then
    log "External-table setup failed ($(grep -oE 'ORA-[0-9]+|SP2-[0-9]+' "${WORK_DIR}/sql.log" | sort -u | tr '\n' ' ')); no existing tables dropped."
    return 1
  fi
  [[ "$(grep -c '^VERIFIED EXT_' "${WORK_DIR}/sql.log")" == 4 ]] || return 1
  grep '^VERIFIED ' "${WORK_DIR}/sql.log"
  log 'All four AI Catalog bronze tables and PG external tables verified.'
}

if ! main; then
  log 'WARNING: optional bronze seed incomplete; provisioning continues. Rerun this script after resolving catalog/storage access.'
  # Manual verification can opt into a failing exit code. Boot never depends on
  # the optional catalog; systemd also orders this job after the main stack.
  [[ "${AI_CATALOG_SEED_STRICT:-false}" != true ]] || exit 1
fi
