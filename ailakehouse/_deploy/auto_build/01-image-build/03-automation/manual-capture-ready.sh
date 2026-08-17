#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${OCI_MANUAL_CAPTURE_MODE:-false}" == "true" ]]; then
  printf 'OCI_MANUAL_CAPTURE_READY:%s\n' "${OCI_MANUAL_CAPTURE_INSTANCE:?manual capture instance is required}"
  exit 86
fi
