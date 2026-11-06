#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ZIP_PATH="${1:-}"
UPLOAD_ARCHIVE="${UPLOAD_ARCHIVE:-true}"
PAR_FILE="${PAR_FILE:-${PROJECT_ROOT}/.par}"

if [[ -n "${ZIP_PATH}" && "${ZIP_PATH}" != /* ]]; then
  ZIP_PATH="${PROJECT_ROOT}/${ZIP_PATH}"
fi

if [[ "${UPLOAD_ARCHIVE}" != true && "${UPLOAD_ARCHIVE}" != false ]]; then
  echo "UPLOAD_ARCHIVE must be true or false." >&2
  exit 1
fi

if [[ "${UPLOAD_ARCHIVE}" == true && ! -f "${PAR_FILE}" ]]; then
  echo "PAR file is required when UPLOAD_ARCHIVE=true: ${PAR_FILE}" >&2
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

TMP_ZIP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-release.XXXXXX")"
TMP_ZIP="${TMP_ZIP_DIR}/release.zip"
TMP_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-build_dev.XXXXXX")"
TMP_HOST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-host.XXXXXX")"

cleanup() {
  rm -rf "${TMP_ZIP_DIR}"
  rm -rf "${TMP_STAGE}"
  rm -rf "${TMP_HOST_DIR}"
}
trap cleanup EXIT

cd "${PROJECT_ROOT}"

zip -qr "${TMP_ZIP}" . \
  -x './build_dev.zip' \
  -x './peakgear-release.zip' \
  -x './peakgear-release-*.zip' \
  -x './peakgear-host*.zip' \
  -x './.par' \
  -x './build_dev.zip.bak-*' \
  -x './.git/*' \
  -x './.omx/*' \
  -x './**/.omx/*' \
  -x './**/.omx/' \
  -x './.operator' \
  -x './.operator/' \
  -x './.operator/*' \
  -x './**/.operator/*' \
  -x './.operator-shared' \
  -x './.operator-shared/' \
  -x './.operator-shared/*' \
  -x './**/.operator-shared/*' \
  -x './ingestion/.demo-setup/*' \
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
  -x './ingestion/frontend/public/jet/libs/oj/20.0.2/' \
  -x './ingestion/frontend/public/jet/libs/oj/20.0.2/*' \
  -x './ingestion/frontend/dist/*' \
  -x './ingestion/node_modules/*' \
  -x './ingestion/backend/node_modules/*' \
  -x './ingestion/signal-generator/node_modules/*' \
  -x './ingestion/gravitino/dist/*' \
  -x './**/__pycache__/*' \
  -x './**/.dt-import-jobs/*' \
  -x './**/*.pyc' \
  -x './**/.DS_Store' \
  -x './**/*.done' \
  -x './**/.pggold_bootstrap_done' \
  -x './**/.netsuite_bootstrap_done' \
  -x './**/oradata/*'

unzip -q "${TMP_ZIP}" -d "${TMP_STAGE}"
# GNU sed accepts -i alone; macOS/BSD sed requires an explicit backup suffix.
if sed --version >/dev/null 2>&1; then
  SED_IN_PLACE=(-i)
else
  SED_IN_PLACE=(-i '')
fi
find "${TMP_STAGE}" -type f \
  \( -name '*.sh' \
     -o -name '*.service' \
     -o -name 'Dockerfile' \
     -o -name '*.yml' \
     -o -name '*.yaml' \
     -o -name '*.py' \) \
  -exec sed "${SED_IN_PLACE[@]}" $'s/\r$//' {} +
rm -f "${TMP_ZIP}"
(
  cd "${TMP_STAGE}"
  zip -qr "${TMP_ZIP}" .
)

# Both archives come from the same normalized, filtered source snapshot.
python3 "${SCRIPT_DIR}/build-host-payload-zip.py" \
  --source-dir "${TMP_STAGE}" --output-dir "${TMP_HOST_DIR}"
"${SCRIPT_DIR}/verify-rc-zip.sh" --zip "${TMP_ZIP}" --skip-build

ARCHIVE_SHA256="$(hash_file "${TMP_ZIP}")"
ARCHIVE_NAME="peakgear-release.zip"
ZIP_PATH="${ZIP_PATH:-${PROJECT_ROOT}/${ARCHIVE_NAME}}"
if [[ "${UPLOAD_ARCHIVE}" == true && "$(basename "${ZIP_PATH}")" != "${ARCHIVE_NAME}" ]]; then
  echo "Uploaded release archives must use the filename ${ARCHIVE_NAME}." >&2
  exit 1
fi
mv "${TMP_ZIP}" "${ZIP_PATH}"
HOST_ZIP_PATH="${PROJECT_ROOT}/peakgear-host.zip"
mv "${TMP_HOST_DIR}/peakgear-host.zip" "${HOST_ZIP_PATH}"
cleanup
trap - EXIT

echo "Built ${ZIP_PATH}"
ls -lh "${ZIP_PATH}"
echo "build_archive_sha256=${ARCHIVE_SHA256}"
echo "build_archive_object_name=${ARCHIVE_NAME}"
echo "Built ${HOST_ZIP_PATH}"
ls -lh "${HOST_ZIP_PATH}"

ZIP_NAME="$(basename "${ZIP_PATH}")"
if [[ "${UPLOAD_ARCHIVE}" == true ]]; then
  echo "Uploading ${ZIP_NAME} to Object Storage..."
  python3 "${SCRIPT_DIR}/object_storage_upload.py" "${ZIP_PATH}" --par-file "${PAR_FILE}"
  echo "Uploading peakgear-host.zip to Object Storage..."
  python3 "${SCRIPT_DIR}/object_storage_upload.py" "${HOST_ZIP_PATH}" --par-file "${PAR_FILE}"
  echo "Set BUILD_ARCHIVE_URL to the read-only object URL for ${ZIP_NAME} when building the custom image."
  echo "Set release_zip_url to the read-only object URL for peakgear-host.zip when provisioning VMs."
else
  echo "Skipped both Object Storage uploads because UPLOAD_ARCHIVE=false."
fi
