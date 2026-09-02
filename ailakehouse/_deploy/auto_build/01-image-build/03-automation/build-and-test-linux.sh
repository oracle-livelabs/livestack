#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(uname -s)" != "Linux" ]]; then
  printf 'This launcher is for Linux. macOS users run build-and-test-macos.sh.\n' >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  printf 'Python 3 is required. Run ../../setup-workstation-linux.sh first.\n' >&2
  exit 127
fi

exec python3 "${SCRIPT_DIR}/build-and-test.py" "$@"
