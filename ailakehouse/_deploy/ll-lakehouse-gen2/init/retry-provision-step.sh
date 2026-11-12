#!/usr/bin/env bash
# Bound the whole retry window, including commands that hang and retry sleeps.
set -euo pipefail
window="${PROVISION_RETRY_TIMEOUT_SECONDS:-1200}"
interval="${PROVISION_RETRY_INTERVAL_SECONDS:-30}"
[[ "$window" =~ ^[1-9][0-9]*$ && "$interval" =~ ^[1-9][0-9]*$ ]] || {
  echo 'Provisioning retry timeout and interval must be positive integers.' >&2
  exit 2
}
if [[ "${1:-}" == --attempts ]]; then
  shift
  label="$1"; shift
  attempt=1
  while true; do
    echo "[provision-retry] ${label}: attempt ${attempt}."
    if "$@"; then
      echo "[provision-retry] ${label}: completed."
      exit 0
    fi
    echo "[provision-retry] ${label}: failed; retrying in ${interval}s within the ${window}s window." >&2
    sleep "$interval"
    attempt=$((attempt + 1))
  done
fi
[[ $# -ge 2 ]] || { echo 'Usage: retry-provision-step.sh LABEL COMMAND [ARG ...]' >&2; exit 2; }
status=0
timeout --kill-after=5s "${window}s" /bin/bash "$0" --attempts "$@" || status=$?
if [[ "$status" == 124 || "$status" == 137 ]]; then
  echo "[provision-retry] $1: timed out after ${window}s; prerequisite remains incomplete." >&2
fi
exit "$status"
