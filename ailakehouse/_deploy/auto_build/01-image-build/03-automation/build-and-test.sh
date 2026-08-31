#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

case "$(uname -s)" in
  Darwin)
    exec bash "${SCRIPT_DIR}/build-and-test-macos.sh" "$@"
    ;;
  Linux)
    exec bash "${SCRIPT_DIR}/build-and-test-linux.sh" "$@"
    ;;
  *)
    printf 'Unsupported operating system: %s. Windows users run build-and-test.ps1.\n' "$(uname -s)" >&2
    exit 2
    ;;
esac
