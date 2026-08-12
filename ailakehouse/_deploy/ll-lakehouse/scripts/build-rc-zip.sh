#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ZIP_PATH="${1:-${PROJECT_ROOT}/build_dev.zip}"
BUILD_ENV_FILE="${BUILD_ENV_FILE:-${PROJECT_ROOT}/.env.kev}"

if [[ -z "${BUILD_ARCHIVE_UPLOAD_URL_PREFIX:-}" && -f "${BUILD_ENV_FILE}" ]]; then
  BUILD_ARCHIVE_UPLOAD_URL_PREFIX="$(
    # Load only the requested value back into this process.
    # shellcheck disable=SC1090
    source "${BUILD_ENV_FILE}"
    printf '%s' "${BUILD_ARCHIVE_UPLOAD_URL_PREFIX:-}"
  )"
fi

BUILD_ARCHIVE_UPLOAD_URL_PREFIX="${BUILD_ARCHIVE_UPLOAD_URL_PREFIX:-}"
UPLOAD_ARCHIVE="${UPLOAD_ARCHIVE:-true}"

if [[ "${ZIP_PATH}" != /* ]]; then
  ZIP_PATH="${PROJECT_ROOT}/${ZIP_PATH}"
fi

if [[ "${UPLOAD_ARCHIVE}" != true && "${UPLOAD_ARCHIVE}" != false ]]; then
  echo "UPLOAD_ARCHIVE must be true or false." >&2
  exit 1
fi

if [[ "${UPLOAD_ARCHIVE}" == true ]] && ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to upload the release archive." >&2
  exit 1
fi
if [[ "${UPLOAD_ARCHIVE}" == true && -z "${BUILD_ARCHIVE_UPLOAD_URL_PREFIX}" ]]; then
  echo "BUILD_ARCHIVE_UPLOAD_URL_PREFIX is required when UPLOAD_ARCHIVE=true; set it in ${BUILD_ENV_FILE} or the process environment." >&2
  exit 1
fi
#
# `.env.example` is excluded from the generated archive, so it may contain real
# URLs without affecting the packaged build output.

hash_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

TMP_ZIP="$(mktemp "${TMPDIR:-/tmp}/ll-lakehouse-build_dev.XXXXXX.zip")"
rm -f "${TMP_ZIP}"

cleanup() {
  rm -f "${TMP_ZIP}"
}
trap cleanup EXIT

cd "${PROJECT_ROOT}"

zip -qr "${TMP_ZIP}" . \
  -x './build_dev.zip' \
  -x './build_dev.zip.bak-*' \
  -x './.git/*' \
  -x './.omx/*' \
  -x './.env*' \
  -x './**/.env*' \
  -x './Wallet_*.zip' \
  -x './wallet.zip' \
  -x './goldengate-studio-wallet.zip' \
  -x './cwallet.sso' \
  -x './ewallet.p12' \
  -x './ewallet.pem' \
  -x './ojdbc.properties' \
  -x './tnsnames.ora' \
  -x './sqlnet.ora' \
  -x './keystore.jks' \
  -x './truststore.jks' \
  -x './**/Wallet_*.zip' \
  -x './**/wallet.zip' \
  -x './**/goldengate-studio-wallet.zip' \
  -x './**/cwallet.sso' \
  -x './**/ewallet.p12' \
  -x './**/ewallet.pem' \
  -x './**/ojdbc.properties' \
  -x './**/tnsnames.ora' \
  -x './**/sqlnet.ora' \
  -x './**/keystore.jks' \
  -x './**/truststore.jks' \
  -x './tmp/*' \
  -x './output/*' \
  -x './ingestion/frontend/node_modules/*' \
  -x './ingestion/frontend/dist/*' \
  -x './ingestion/node_modules/*' \
  -x './ingestion/backend/node_modules/*' \
  -x './ingestion/signal-generator/node_modules/*' \
  -x './ingestion/gravitino/dist/*' \
  -x './**/__pycache__/*' \
  -x './**/*.pyc' \
  -x './**/.DS_Store' \
  -x './**/*.done' \
  -x './**/.pggold_bootstrap_done' \
  -x './**/.netsuite_bootstrap_done' \
  -x './**/oradata/*'

mv "${TMP_ZIP}" "${ZIP_PATH}"
trap - EXIT

echo "Built ${ZIP_PATH}"
ls -lh "${ZIP_PATH}"
echo "sha256=$(hash_file "${ZIP_PATH}")"
"${SCRIPT_DIR}/verify-rc-zip.sh" --zip "${ZIP_PATH}" --skip-build

ZIP_NAME="$(basename "${ZIP_PATH}")"
if [[ "${UPLOAD_ARCHIVE}" == true ]]; then
  echo "Uploading ${ZIP_NAME} to Object Storage..."
  curl --fail --silent --show-error --upload-file "${ZIP_PATH}" "${BUILD_ARCHIVE_UPLOAD_URL_PREFIX}${ZIP_NAME}"
  echo "Uploaded ${ZIP_NAME} to Object Storage."
else
  echo "Skipped Object Storage upload because UPLOAD_ARCHIVE=false."
fi
