#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/healthcare-livestack"
RUNTIME_DIR="${ROOT}/runtime"
SOURCE_PARENT="${ROOT}/source"
SOURCE_DIR="${SOURCE_PARENT}/current"
WALLET_DIR="${ROOT}/wallet"
RUNTIME_ENV="${ROOT}/oci-runtime.env"

if [ -f "${RUNTIME_ENV}" ]; then
  # shellcheck disable=SC1090
  source "${RUNTIME_ENV}"
fi

APP_PORT="${APP_PORT:-8505}"
ORDS_PORT="${ORDS_PORT:-8181}"
ORDS_BIND_ADDRESS="${ORDS_BIND_ADDRESS:-127.0.0.1}"
EXPOSE_ORDS_PUBLIC="${EXPOSE_ORDS_PUBLIC:-false}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2}"
APP_SOURCE_ARCHIVE_URL="${APP_SOURCE_ARCHIVE_URL:-}"
APP_SOURCE_ARCHIVE_SHA256="${APP_SOURCE_ARCHIVE_SHA256:-}"
APP_SOURCE_ARCHIVE_STRIP_COMPONENTS="${APP_SOURCE_ARCHIVE_STRIP_COMPONENTS:-0}"
AUTO_START_APP="${AUTO_START_APP:-false}"
ORACLE_USER="${ORACLE_USER:-LIVESTACK}"
ORACLE_CONNECTION_STRING="${ORACLE_CONNECTION_STRING:-}"
ORACLE_POOL_MIN="${ORACLE_POOL_MIN:-2}"
ORACLE_POOL_MAX="${ORACLE_POOL_MAX:-10}"
ORACLE_POOL_INCREMENT="${ORACLE_POOL_INCREMENT:-1}"
ADB_DB_NAME="${ADB_DB_NAME:-HCSTACK26AI}"
ADB_OCID="${ADB_OCID:-}"
ADB_IS_MTLS_CONNECTION_REQUIRED="${ADB_IS_MTLS_CONNECTION_REQUIRED:-false}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

install_podman_compose_if_needed() {
  if podman compose version >/dev/null 2>&1; then
    return 0
  fi
  if command -v podman-compose >/dev/null 2>&1; then
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf -y install podman-compose || true
  fi

  if podman compose version >/dev/null 2>&1 || command -v podman-compose >/dev/null 2>&1; then
    return 0
  fi

  python3 -m pip install --upgrade podman-compose

  if ! podman compose version >/dev/null 2>&1 && ! command -v podman-compose >/dev/null 2>&1; then
    log "Unable to install a Podman Compose provider."
    exit 1
  fi
}

run_podman_compose() {
  if podman compose version >/dev/null 2>&1; then
    podman compose "$@"
    return
  fi
  podman-compose "$@"
}

write_runtime_templates() {
  cat > "${RUNTIME_DIR}/healthcare.env.template" <<EOF
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:${APP_PORT}

ORACLE_USER=${ORACLE_USER}
APP_SCHEMA_PASSWORD=<set-after-adb-schema-bootstrap>
ORACLE_CONNECTION_STRING=${ORACLE_CONNECTION_STRING}
ORACLE_POOL_MIN=${ORACLE_POOL_MIN}
ORACLE_POOL_MAX=${ORACLE_POOL_MAX}
ORACLE_POOL_INCREMENT=${ORACLE_POOL_INCREMENT}

OLLAMA_BASE_URL=${OLLAMA_BASE_URL}
OLLAMA_MODEL=${OLLAMA_MODEL}

ORDS_IMAGE=container-registry.oracle.com/database/ords:latest
ORDS_PORT=${ORDS_PORT}
ORDS_BIND_ADDRESS=${ORDS_BIND_ADDRESS}
CONN_STRING=${ORACLE_CONNECTION_STRING}

ORACLE_WALLET_LOCATION=${WALLET_DIR}
ORACLE_WALLET_PASSWORD=<set-if-mtls-wallet-is-used>
ORACLE_CLIENT_DIR=
EOF

  chmod 0600 "${RUNTIME_DIR}/healthcare.env.template"

  cat > "${RUNTIME_DIR}/compose.oci.yml" <<'EOF'
services:
  app:
    build:
      context: .
      dockerfile: Containerfile
    image: 26ai-healthcare-app:oci
    env_file:
      - .env
    ports:
      - "${APP_PORT:-8505}:3001"
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "node -e \"require('http').get('http://127.0.0.1:3001/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))\""
        ]
      interval: 15s
      timeout: 5s
      retries: 15
      start_period: 180s
    restart: unless-stopped

  ords:
    image: ${ORDS_IMAGE:-container-registry.oracle.com/database/ords:latest}
    profiles:
      - ords
    env_file:
      - .env
    ports:
      - "${ORDS_BIND_ADDRESS:-127.0.0.1}:${ORDS_PORT:-8181}:8080"
    volumes:
      - ords-config:/etc/ords/config
      - ./db/wallet:/opt/oracle/wallet:ro
    restart: unless-stopped

volumes:
  ords-config:
EOF
}

download_source_if_configured() {
  if [ -z "${APP_SOURCE_ARCHIVE_URL}" ]; then
    log "APP_SOURCE_ARCHIVE_URL is empty; source copy remains manual."
    return 0
  fi

  log "Downloading healthcare source archive."
  rm -rf "${SOURCE_DIR}"
  mkdir -p "${SOURCE_PARENT}" "${SOURCE_DIR}"
  ARCHIVE="${SOURCE_PARENT}/healthcare-source.zip"
  curl -fL --retry 5 --retry-delay 3 "${APP_SOURCE_ARCHIVE_URL}" -o "${ARCHIVE}"

  if [ -n "${APP_SOURCE_ARCHIVE_SHA256}" ]; then
    printf '%s  %s\n' "${APP_SOURCE_ARCHIVE_SHA256}" "${ARCHIVE}" | sha256sum -c -
  fi

  unzip -q "${ARCHIVE}" -d "${SOURCE_DIR}.tmp"

  if [ "${APP_SOURCE_ARCHIVE_STRIP_COMPONENTS}" -gt 0 ]; then
    # zip has no --strip-components, so move files down one or more levels.
    candidate="${SOURCE_DIR}.tmp"
    for _ in $(seq 1 "${APP_SOURCE_ARCHIVE_STRIP_COMPONENTS}"); do
      first_child="$(find "${candidate}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
      if [ -z "${first_child}" ]; then
        log "Unable to strip requested archive components."
        exit 1
      fi
      candidate="${first_child}"
    done
    cp -a "${candidate}/." "${SOURCE_DIR}/"
    rm -rf "${SOURCE_DIR}.tmp"
  else
    cp -a "${SOURCE_DIR}.tmp/." "${SOURCE_DIR}/"
    rm -rf "${SOURCE_DIR}.tmp"
  fi

  cp "${RUNTIME_DIR}/compose.oci.yml" "${SOURCE_DIR}/compose.oci.yml"
  if [ ! -f "${SOURCE_DIR}/.env" ]; then
    cp "${RUNTIME_DIR}/healthcare.env.template" "${SOURCE_DIR}/.env"
  fi
  chmod 0600 "${SOURCE_DIR}/.env"

  log "Healthcare source archive extracted to ${SOURCE_DIR}."
}

write_next_steps() {
  cat > "${ROOT}/README-OCI-NEXT-STEPS.txt" <<EOF
Healthcare LiveStack app VM prepared by Terraform cloud-init.

Runtime templates:
  ${RUNTIME_DIR}/healthcare.env.template
  ${RUNTIME_DIR}/compose.oci.yml

Source target:
  ${SOURCE_DIR}

Autonomous Database:
  Name: ${ADB_DB_NAME}
  OCID: ${ADB_OCID}
  mTLS required: ${ADB_IS_MTLS_CONNECTION_REQUIRED}

Ollama:
  ${OLLAMA_BASE_URL}
  model: ${OLLAMA_MODEL}

Before starting the app:
  1. Copy or download the healthcare source tree into ${SOURCE_DIR}, unless APP_SOURCE_ARCHIVE_URL did that already.
  2. Bootstrap the ADB schema from the healthcare db/schema and db/data scripts.
  3. Copy ${RUNTIME_DIR}/healthcare.env.template to ${SOURCE_DIR}/.env and fill APP_SCHEMA_PASSWORD.
  4. If ADB mTLS is required, place the wallet under ${WALLET_DIR} and set ORACLE_WALLET_PASSWORD.
  5. Run: cd ${SOURCE_DIR} && podman compose -f compose.oci.yml up -d --build app
  6. Start local ORDS only after its ADB connection configuration is reviewed:
     cd ${SOURCE_DIR} && podman compose -f compose.oci.yml --profile ords up -d ords

The compose-based local deployment remains unchanged; this VM uses compose.oci.yml only.
EOF
}

maybe_start_app() {
  if [ "${AUTO_START_APP}" != "true" ]; then
    log "AUTO_START_APP=false; not starting app containers."
    return 0
  fi

  if [ ! -f "${SOURCE_DIR}/Containerfile" ]; then
    log "AUTO_START_APP requested but ${SOURCE_DIR}/Containerfile is missing."
    exit 1
  fi

  if ! grep -q '^APP_SCHEMA_PASSWORD=' "${SOURCE_DIR}/.env" || grep -q '<set-after-adb-schema-bootstrap>' "${SOURCE_DIR}/.env"; then
    log "AUTO_START_APP requested but APP_SCHEMA_PASSWORD is not set in ${SOURCE_DIR}/.env."
    exit 1
  fi

  log "Starting healthcare app container."
  cd "${SOURCE_DIR}"
  run_podman_compose -f compose.oci.yml up -d --build app
}

log "Starting healthcare app VM bootstrap."
mkdir -p "${ROOT}" "${RUNTIME_DIR}" "${SOURCE_PARENT}" "${WALLET_DIR}"
chmod 0755 "${ROOT}" "${RUNTIME_DIR}" "${SOURCE_PARENT}"
chmod 0700 "${WALLET_DIR}"

systemctl enable --now podman.socket || true
install_podman_compose_if_needed

if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="${APP_PORT}/tcp" || true
  if [ "${EXPOSE_ORDS_PUBLIC}" = "true" ]; then
    firewall-cmd --permanent --add-port="${ORDS_PORT}/tcp" || true
  fi
  firewall-cmd --reload || true
fi

write_runtime_templates
download_source_if_configured
write_next_steps
maybe_start_app

chown -R opc:opc "${ROOT}" || true
log "Healthcare app VM bootstrap complete."
