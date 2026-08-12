#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_DIR="${GRAVITINO_ARCHIVE_DIR:-/opt/gravitino/archive}"
ARCHIVE_PATH="${GRAVITINO_ARCHIVE_PATH:-}"
SERVER_DIR="${GRAVITINO_HOME:-/opt/gravitino/server}"
CONF_DIR="${GRAVITINO_CONF_DIR:-/opt/gravitino/conf}"
LOG_DIR="${GRAVITINO_LOG_DIR:-/opt/gravitino/logs}"
TMP_DIR="${GRAVITINO_TMP_DIR:-/opt/gravitino/tmp}"

require_value() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

resolve_archive() {
  if [[ -n "${ARCHIVE_PATH}" && -f "${ARCHIVE_PATH}" ]]; then
    printf '%s\n' "${ARCHIVE_PATH}"
    return
  fi

  local discovered
  discovered="$(find "${ARCHIVE_DIR}" -maxdepth 1 -type f -name '*gravitino*iceberg*rest*server*.zip' | sort | head -1 || true)"
  if [[ -n "${discovered}" ]]; then
    printf '%s\n' "${discovered}"
    return
  fi

  echo "No Gravitino Iceberg REST server archive found in ${ARCHIVE_DIR}." >&2
  echo "Rebuild the container with the ADW-enabled ZIP staged in ingestion/gravitino/dist." >&2
  exit 1
}

install_server_if_needed() {
  if [[ -x "${SERVER_DIR}/bin/gravitino-iceberg-rest-server.sh" ]]; then
    return
  fi

  local archive extract_dir payload_script payload_dir
  archive="$(resolve_archive)"
  extract_dir="${TMP_DIR}/extract"

  rm -rf "${extract_dir}"
  mkdir -p "${extract_dir}" "${SERVER_DIR}" "${CONF_DIR}" "${LOG_DIR}"
  unzip -q "${archive}" -d "${extract_dir}"

  payload_script="$(find "${extract_dir}" -mindepth 1 -maxdepth 3 -type f -path '*/bin/gravitino-iceberg-rest-server.sh' -print -quit)"
  if [[ -z "${payload_script}" ]]; then
    echo "Archive does not contain bin/gravitino-iceberg-rest-server.sh: ${archive}" >&2
    exit 1
  fi

  payload_dir="$(dirname "$(dirname "${payload_script}")")"
  if [[ ! -x "${payload_dir}/bin/gravitino-iceberg-rest-server.sh" ]]; then
    echo "Archive does not contain bin/gravitino-iceberg-rest-server.sh: ${archive}" >&2
    exit 1
  fi

  rm -rf "${SERVER_DIR:?}/"*
  cp -R "${payload_dir}/." "${SERVER_DIR}/"
}

derive_config_values() {
  GRAVITINO_HTTP_PORT="${GRAVITINO_HTTP_PORT:-1525}"
  GRAVITINO_CATALOG_BACKEND_NAME="${GRAVITINO_CATALOG_BACKEND_NAME:-TEST_ICEBERG}"
  GRAVITINO_CATALOG_BACKEND_IMPL="${GRAVITINO_CATALOG_BACKEND_IMPL:-org.apache.iceberg.adw.ADWCatalog}"
  GRAVITINO_JDBC_DRIVER="${GRAVITINO_JDBC_DRIVER:-oracle.jdbc.driver.OracleDriver}"
  GRAVITINO_WALLET_DIR="${GRAVITINO_WALLET_DIR:-/wallet}"
  GRAVITINO_JDBC_USER="${GRAVITINO_JDBC_USER:-PG}"
  GRAVITINO_JDBC_PASSWORD="${GRAVITINO_JDBC_PASSWORD:-${DBPASSWORD:-}}"
  GRAVITINO_INITIALIZE="${GRAVITINO_INITIALIZE:-true}"
  GRAVITINO_S3_REGION="${GRAVITINO_S3_REGION:-${REGION_IDENTIFIER:-}}"
  GRAVITINO_S3_PATH_STYLE_ACCESS="${GRAVITINO_S3_PATH_STYLE_ACCESS:-true}"
  GRAVITINO_OBJECT_STORAGE_PREFIX="${GRAVITINO_OBJECT_STORAGE_PREFIX:-iceberg}"

  if [[ -z "${GRAVITINO_JDBC_URI:-}" ]]; then
    GRAVITINO_JDBC_SERVICE_NAME="${GRAVITINO_JDBC_SERVICE_NAME:-${SERVICE_NAME:-}}"
    require_value GRAVITINO_JDBC_SERVICE_NAME
    GRAVITINO_JDBC_URI="jdbc:oracle:thin:@${GRAVITINO_JDBC_SERVICE_NAME}?TNS_ADMIN=${GRAVITINO_WALLET_DIR}"
  fi

  if [[ -z "${GRAVITINO_WAREHOUSE:-}" ]]; then
    GRAVITINO_OBJECT_STORAGE_BUCKET="${GRAVITINO_OBJECT_STORAGE_BUCKET:-${BUCKET_NAME:-}}"
    require_value GRAVITINO_OBJECT_STORAGE_BUCKET
    GRAVITINO_WAREHOUSE="s3a://${GRAVITINO_OBJECT_STORAGE_BUCKET}/${GRAVITINO_OBJECT_STORAGE_PREFIX}"
  fi

  if [[ -z "${GRAVITINO_S3_ENDPOINT:-}" && -n "${OBJECT_NAMESPACE:-}" && -n "${REGION_IDENTIFIER:-}" ]]; then
    GRAVITINO_S3_ENDPOINT="https://${OBJECT_NAMESPACE}.compat.objectstorage.${REGION_IDENTIFIER}.oraclecloud.com"
  fi

  require_value GRAVITINO_JDBC_USER
  require_value GRAVITINO_JDBC_PASSWORD
  require_value GRAVITINO_WAREHOUSE
  require_value GRAVITINO_S3_ENDPOINT
  require_value GRAVITINO_S3_ACCESS_KEY_ID
  require_value GRAVITINO_S3_SECRET_ACCESS_KEY
  require_value GRAVITINO_S3_REGION
}

write_config() {
  mkdir -p "${CONF_DIR}" "${LOG_DIR}"
  cp -n "${SERVER_DIR}/conf/"* "${CONF_DIR}/" 2>/dev/null || true

  cat > "${CONF_DIR}/gravitino-iceberg-rest-server.conf" <<EOF
gravitino.iceberg-rest.shutdown.timeout = 3000

gravitino.iceberg-rest.host = 0.0.0.0
gravitino.iceberg-rest.httpPort = ${GRAVITINO_HTTP_PORT}
gravitino.iceberg-rest.minThreads = ${GRAVITINO_MIN_THREADS:-24}
gravitino.iceberg-rest.maxThreads = ${GRAVITINO_MAX_THREADS:-200}
gravitino.iceberg-rest.stopTimeout = ${GRAVITINO_STOP_TIMEOUT:-30000}
gravitino.iceberg-rest.idleTimeout = ${GRAVITINO_IDLE_TIMEOUT:-30000}
gravitino.iceberg-rest.threadPoolWorkQueueSize = ${GRAVITINO_THREAD_POOL_WORK_QUEUE_SIZE:-100}
gravitino.iceberg-rest.requestHeaderSize = ${GRAVITINO_REQUEST_HEADER_SIZE:-131072}
gravitino.iceberg-rest.responseHeaderSize = ${GRAVITINO_RESPONSE_HEADER_SIZE:-131072}

gravitino.iceberg-rest.catalog-backend = custom
gravitino.iceberg-rest.catalog-backend-impl = ${GRAVITINO_CATALOG_BACKEND_IMPL}
gravitino.iceberg-rest.catalog-backend-name = ${GRAVITINO_CATALOG_BACKEND_NAME}
gravitino.iceberg-rest.driver = ${GRAVITINO_JDBC_DRIVER}
gravitino.iceberg-rest.uri = ${GRAVITINO_JDBC_URI}
gravitino.iceberg-rest.jdbc.user = ${GRAVITINO_JDBC_USER}
gravitino.iceberg-rest.jdbc.password = ${GRAVITINO_JDBC_PASSWORD}
gravitino.iceberg-rest.initialize = ${GRAVITINO_INITIALIZE}

gravitino.iceberg-rest.warehouse = ${GRAVITINO_WAREHOUSE}
gravitino.iceberg-rest.io-impl = ${GRAVITINO_IO_IMPL:-org.apache.iceberg.aws.s3.S3FileIO}
gravitino.iceberg-rest.s3-access-key-id = ${GRAVITINO_S3_ACCESS_KEY_ID}
gravitino.iceberg-rest.s3-secret-access-key = ${GRAVITINO_S3_SECRET_ACCESS_KEY}
gravitino.iceberg-rest.s3-endpoint = ${GRAVITINO_S3_ENDPOINT}
gravitino.iceberg-rest.s3-path-style-access = ${GRAVITINO_S3_PATH_STYLE_ACCESS}
gravitino.iceberg-rest.s3.path-style-access = ${GRAVITINO_S3_PATH_STYLE_ACCESS}
gravitino.iceberg-rest.s3-region = ${GRAVITINO_S3_REGION}
EOF

  cat > "${CONF_DIR}/gravitino-env.sh" <<EOF
GRAVITINO_VERSION=0.7.0-incubating-SNAPSHOT
export GRAVITINO_HOME="${SERVER_DIR}"
export GRAVITINO_CONF_DIR="${CONF_DIR}"
export GRAVITINO_LOG_DIR="${LOG_DIR}"
export GRAVITINO_MEM="${GRAVITINO_MEM:--Xms1024m -Xmx1024m -XX:MaxMetaspaceSize=512m}"
EOF
}

install_server_if_needed
derive_config_values
write_config

exec "${SERVER_DIR}/bin/gravitino-iceberg-rest-server.sh" --config "${CONF_DIR}" run
