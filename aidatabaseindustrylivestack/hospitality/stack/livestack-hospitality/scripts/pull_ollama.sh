#!/bin/bash
set -euo pipefail

MODEL="${OLLAMA_MODEL:-llama3.2}"
FINANCIAL_MODEL="${OLLAMA_FINANCIAL_MODEL:-llama3.2:1b}"
FINANCIAL_NUM_CTX="${FINANCIAL_AI_NUM_CTX:-${OLLAMA_CONTEXT_LENGTH:-512}}"
FINANCIAL_NUM_THREAD="${FINANCIAL_AI_NUM_THREAD:-8}"
READY_FILE="/tmp/ollama-financial-ready"

rm -f "${READY_FILE}"

ollama serve &
pid=$!

wait_for_ollama() {
  local retries=30
  local delay_seconds=2

  for ((i = 1; i <= retries; i++)); do
    if OLLAMA_HOST=http://127.0.0.1:11434 ollama list >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay_seconds}"
  done

  return 1
}

ensure_model() {
  local model="$1"

  if OLLAMA_HOST=http://127.0.0.1:11434 ollama show "${model}" >/dev/null 2>&1; then
    echo "Model already present: ${model}"
    return 0
  fi

  echo "Pulling model: ${model}"
  OLLAMA_HOST=http://127.0.0.1:11434 ollama pull "${model}"
}

prewarm_financial_model() {
  local payload response content_length
  payload="{\"model\":\"${FINANCIAL_MODEL}\",\"stream\":false,\"prompt\":\"READY\",\"keep_alive\":\"${OLLAMA_KEEP_ALIVE:-30m}\",\"options\":{\"temperature\":0,\"num_predict\":1,\"num_ctx\":${FINANCIAL_NUM_CTX},\"num_thread\":${FINANCIAL_NUM_THREAD}}}"
  content_length="${#payload}"

  exec 3<>/dev/tcp/127.0.0.1/11434
  printf 'POST /api/generate HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' \
    "${content_length}" "${payload}" >&3
  response="$(cat <&3)"
  exec 3<&-
  exec 3>&-

  if [[ "${response}" != *'"done":true'* ]]; then
    echo "Finance model prewarm failed."
    return 1
  fi
}

if ! wait_for_ollama; then
  echo "Ollama server did not become ready in time."
  exit 1
fi

echo "Checking configured model..."
ensure_model "${MODEL}"
if [[ "${FINANCIAL_MODEL}" != "${MODEL}" ]]; then
  ensure_model "${FINANCIAL_MODEL}"
fi

echo "Prewarming finance model: ${FINANCIAL_MODEL}"
prewarm_financial_model
touch "${READY_FILE}"
echo "Model check and finance prewarm complete."

wait "${pid}"
