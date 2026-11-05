#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ZIP_PATH="${1:-${PROJECT_ROOT}/install-peakgear.zip}"
REQUIRED_FILES=(
  "inst.sh"
  ".env.example"
  "INSTALLATION-GUIDE.md"
)

if [[ "${ZIP_PATH}" != /* ]]; then
  ZIP_PATH="${PROJECT_ROOT}/${ZIP_PATH}"
fi

for command in zip unzip; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to build the installation archive." >&2
    exit 1
  fi
done

for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "${PROJECT_ROOT}/${file}" ]]; then
    echo "Required installation file is missing: ${file}" >&2
    exit 1
  fi
done

ZIP_DIR="$(dirname "${ZIP_PATH}")"
if [[ ! -d "${ZIP_DIR}" ]]; then
  echo "Output directory does not exist: ${ZIP_DIR}" >&2
  exit 1
fi

TMP_ZIP="$(mktemp "${TMPDIR:-/tmp}/install-peakgear.XXXXXX.zip")"
rm -f "${TMP_ZIP}"

cleanup() {
  rm -f "${TMP_ZIP}"
}
trap cleanup EXIT

(
  cd "${PROJECT_ROOT}"
  zip -qj "${TMP_ZIP}" "${REQUIRED_FILES[@]}"
)

unzip -tq "${TMP_ZIP}" >/dev/null

expected_contents="$(printf '%s\n' "${REQUIRED_FILES[@]}" | sort)"
actual_contents="$(unzip -Z1 "${TMP_ZIP}" | sort)"
if [[ "${actual_contents}" != "${expected_contents}" ]]; then
  echo "Installation archive contains unexpected files." >&2
  exit 1
fi

mv -f "${TMP_ZIP}" "${ZIP_PATH}"
trap - EXIT

echo "Built ${ZIP_PATH}"
echo "Contents:"
unzip -Z1 "${ZIP_PATH}"
