#!/bin/bash
set -euo pipefail

MODEL="${OLLAMA_MODEL:-llama3.2}"

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

if ! wait_for_ollama; then
  echo "Ollama server did not become ready in time."
  exit 1
fi

echo "Checking configured model..."
ensure_model "${MODEL}"
echo "Model check complete."

wait "${pid}"
