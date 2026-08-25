#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v pwsh >/dev/null 2>&1; then
  printf 'PowerShell 7 (pwsh) is required on Linux and macOS.\n' >&2
  exit 127
fi

exec pwsh -NoProfile -File "${SCRIPT_DIR}/build-and-test.ps1" "$@"
