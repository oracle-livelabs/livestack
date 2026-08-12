#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/healthcare-livestack"
ENV_FILE="${ROOT}/ollama-runtime.env"

if [ -f "${ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

OLLAMA_MODEL="${OLLAMA_MODEL:-llama3.2}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
OLLAMA_IMAGE="${OLLAMA_IMAGE:-docker.io/ollama/ollama:latest}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

log "Starting healthcare Ollama VM bootstrap."
mkdir -p "${ROOT}"

systemctl enable --now podman.socket || true

if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="${OLLAMA_PORT}/tcp" || true
  firewall-cmd --reload || true
fi

podman volume exists healthcare-ollama >/dev/null 2>&1 || podman volume create healthcare-ollama >/dev/null

podman run \
  -d \
  --replace \
  --name healthcare-ollama \
  -p "${OLLAMA_PORT}:11434" \
  -e OLLAMA_HOST=0.0.0.0:11434 \
  -v healthcare-ollama:/root/.ollama \
  "${OLLAMA_IMAGE}"

log "Waiting for Ollama API."
for attempt in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${OLLAMA_PORT}/api/tags" >/dev/null; then
    break
  fi
  if [ "${attempt}" = "60" ]; then
    log "Ollama API did not become ready."
    exit 1
  fi
  sleep 2
done

log "Pulling Ollama model ${OLLAMA_MODEL}."
podman exec healthcare-ollama ollama pull "${OLLAMA_MODEL}"
podman exec healthcare-ollama ollama show "${OLLAMA_MODEL}" >/dev/null

cat > "${ROOT}/ollama-status.txt" <<STATUS
Ollama bootstrap complete.
Endpoint: http://$(hostname -I | awk '{print $1}'):${OLLAMA_PORT}
Model: ${OLLAMA_MODEL}
Container: healthcare-ollama
STATUS

log "Healthcare Ollama VM bootstrap complete."
