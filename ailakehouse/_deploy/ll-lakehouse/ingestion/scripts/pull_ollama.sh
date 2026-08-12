#!/bin/bash
set -euo pipefail

MODELS=(
  "${OLLAMA_MODEL_PRIMARY:-llama3.2}"
)

ollama serve &
pid=$!

wait_for_ollama() {
  local retries=30
  local delay_seconds=2

  for ((i = 1; i <= retries; i++)); do
    if ollama list >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay_seconds}"
  done

  return 1
}

ensure_model() {
  local model="$1"

  if ollama show "${model}" >/dev/null 2>&1; then
    echo "Model already present: ${model}"
    return 0
  fi

  echo "Pulling model: ${model}"
  ollama pull "${model}"
}

if ! wait_for_ollama; then
  echo "Ollama server did not become ready in time."
  exit 1
fi

echo "Checking configured models..."
declare -A seen_models=()
for model in "${MODELS[@]}"; do
  if [[ -z "${model}" || -n "${seen_models[${model}]:-}" ]]; then
    continue
  fi
  seen_models["${model}"]=1
  ensure_model "${model}"
done
echo "Model check complete."

wait "${pid}"
