#!/usr/bin/env bash

install_application() {
  local archive_tmp
  local init_source="${TARGET_ROOT}/init"
  local service_source="${TARGET_ROOT}/hooks/peakgear-init"

  : "${PEAKGEAR_REGISTRY_USERNAME:?Peak Gear registry username was not supplied by Packer.}"
  : "${PEAKGEAR_REGISTRY_TOKEN:?Peak Gear registry token was not supplied by Packer.}"
  : "${PEAKGEAR_GGSA_ARCHIVE_URL:?GoldenGate Stream Analytics archive URL was not supplied by Packer.}"
  : "${PEAKGEAR_GRAVITINO_ARCHIVE_URL:?Gravitino archive URL was not supplied by Packer.}"

  log "Installing Peak Gear build and runtime dependencies"
  dnf -y install sqlcl jdk-26-headless wget git acl python3.11 python3.11-pip
  python3.11 -m pip install --no-cache-dir oracledb python-dotenv requests

  [[ -d "${init_source}" ]] || fail "Missing LiveStack initialization scripts."
  [[ -d "${service_source}" ]] || fail "Missing Peak Gear service overrides."
  # Keep the automation-owned Data Transforms compatibility fallback in the
  # captured payload. The upstream init source is copied first by install-image.sh.
  install -m 0755 -o opc -g opc \
    "${service_source}/create-pg-iceberg-connection.sh" \
    "${init_source}/create-pg-iceberg-connection.sh"
  find "${init_source}" -maxdepth 1 -type f -name '*.sh' -exec chmod 0755 {} +
  install -m 0644 -o opc -g opc \
    "${service_source}/peakgear-pg-iceberg.service" \
    /home/opc/.config/systemd/user/peakgear-pg-iceberg.service
  install -m 0644 -o opc -g opc \
    "${service_source}/peakgear-iceberg-seed.service" \
    /home/opc/.config/systemd/user/peakgear-iceberg-seed.service
  run_as_opc systemctl --user daemon-reload
  run_as_opc systemctl --user enable peakgear-pg-iceberg.service peakgear-iceberg-seed.service

  log "Staging the licensed GoldenGate Stream Analytics installer"
  install -d -m 0755 -o opc -g opc "${TARGET_ROOT}/ingestion/ggsa"
  archive_tmp="$(mktemp)"
  curl --fail --location --silent --show-error "${PEAKGEAR_GGSA_ARCHIVE_URL}" -o "${archive_tmp}"
  install -m 0644 -o opc -g opc "${archive_tmp}" "${TARGET_ROOT}/ingestion/ggsa/V1054826-01.zip"
  rm -f "${archive_tmp}"

  log "Staging the Gravitino Iceberg REST server"
  install -d -m 0755 -o opc -g opc "${TARGET_ROOT}/ingestion/gravitino/dist"
  archive_tmp="$(mktemp)"
  curl --fail --location --silent --show-error "${PEAKGEAR_GRAVITINO_ARCHIVE_URL}" -o "${archive_tmp}"
  install -m 0644 -o opc -g opc "${archive_tmp}" \
    "${TARGET_ROOT}/ingestion/gravitino/dist/gravitino-iceberg-rest-server-0.7.0-incubating-SNAPSHOT-bin.zip"
  rm -f "${archive_tmp}"

  log "Authenticating to Oracle Container Registry without printing the token"
  printf '%s' "${PEAKGEAR_REGISTRY_TOKEN}" | run_as_opc podman login \
    --username "${PEAKGEAR_REGISTRY_USERNAME}" --password-stdin container-registry.oracle.com

  log "Preloading Peak Gear container images"
  for image in \
    container-registry.oracle.com/database/free:23.26.1.0 \
    container-registry.oracle.com/database/ords:latest \
    container-registry.oracle.com/database/private-ai:latest \
    container-registry.oracle.com/goldengate/goldengate-studio-free:23.9.0.25.09 \
    container-registry.oracle.com/goldengate/goldengate-oracle-free:latest \
    docker.io/ollama/ollama:latest \
    docker.io/node:20-bookworm; do
    run_as_opc podman pull "${image}"
  done

  cat > "${TARGET_ROOT}/ingestion/.env" <<'EOF'
DBPASSWORD=BuildOnly1Password
PASSWORD=BuildOnly1Password
ORACLE_PWD=BuildOnly1Password
APP_SCHEMA_PASSWORD=BuildOnly1Password
GGSA_OSA_ARCHIVE=V1054826-01.zip
GRAVITINO_ICEBERG_REST_SERVER_ARCHIVE=gravitino-iceberg-rest-server-0.7.0-incubating-SNAPSHOT-bin.zip
EOF
  chown opc:opc "${TARGET_ROOT}/ingestion/.env"
  chmod 0600 "${TARGET_ROOT}/ingestion/.env"

  log "Building Peak Gear local images"
  run_as_opc /bin/bash -c \
    "cd '${TARGET_ROOT}/ingestion' && podman-compose --env-file .env -f compose.yml --profile seed build"

  log "Caching Node dependencies"
  for volume in ingestion_app-node-modules ingestion_frontend-node-modules ingestion_signal-generator-node-modules; do
    run_as_opc podman volume create "${volume}" >/dev/null
  done
  run_as_opc podman run --rm \
    -v "${TARGET_ROOT}/ingestion:/workspace/app:z" \
    -v ingestion_app-node-modules:/workspace/app/node_modules \
    docker.io/node:20-bookworm bash -lc 'cd /workspace/app && npm ci --include=dev'
  run_as_opc podman run --rm \
    -v "${TARGET_ROOT}/ingestion/frontend:/workspace/frontend:z" \
    -v ingestion_frontend-node-modules:/workspace/frontend/node_modules \
    docker.io/node:20-bookworm bash -lc 'cd /workspace/frontend && npm ci --include=dev'
  run_as_opc podman run --rm \
    -v "${TARGET_ROOT}/ingestion/signal-generator:/workspace/generator:z" \
    -v ingestion_signal-generator-node-modules:/workspace/generator/node_modules \
    docker.io/node:20-bookworm bash -lc 'cd /workspace/generator && npm install --omit=dev'

  log "Caching the Ollama model"
  run_as_opc podman volume create ingestion_ollama-models >/dev/null
  run_as_opc podman run -d --name peakgear-model-cache \
    -v ingestion_ollama-models:/root/.ollama docker.io/ollama/ollama:latest serve >/dev/null
  for _ in $(seq 1 60); do
    run_as_opc podman exec peakgear-model-cache ollama list >/dev/null 2>&1 && break
    sleep 2
  done
  run_as_opc podman exec peakgear-model-cache ollama pull llama3.2
  run_as_opc podman rm -f peakgear-model-cache >/dev/null

  run_as_opc podman logout container-registry.oracle.com >/dev/null 2>&1 || true
  rm -f "${TARGET_ROOT}/ingestion/.env"
  unset PEAKGEAR_REGISTRY_TOKEN
}
