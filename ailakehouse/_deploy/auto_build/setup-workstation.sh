#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

case "$(uname -s)" in
  Darwin)
    exec bash "${SCRIPT_DIR}/setup-workstation-macos.sh" "$@"
    ;;
  Linux)
    exec bash "${SCRIPT_DIR}/setup-workstation-linux.sh" "$@"
    ;;
  *)
    printf 'Unsupported operating system: %s. Windows users run setup-workstation.ps1.\n' "$(uname -s)" >&2
    exit 2
    ;;
esac
