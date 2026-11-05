#!/bin/bash

set -euo pipefail

if [[ -f /home/opc/.env ]]; then
  source /home/opc/.env
fi

read_env_value() {
  local env_file="$1"
  local key="$2"
  [[ -f "${env_file}" ]] || return 1
  awk -v key="${key}" '
    BEGIN { FS = "=" }
    $1 == key {
      sub(/^[^=]*=/, "")
      value = $0
      found = 1
    }
    END { if (found) print value }
  ' "${env_file}"
}

metadata_value() {
  local key="$1"
  local value

  value="$(curl -fsS --max-time 5 -H "Authorization: Bearer Oracle" -L \
    "http://169.254.169.254/opc/v2/instance/metadata/${key}" 2>/dev/null || true)"
  if [[ -z "${value}" || "${value}" == *'<html>'* ]]; then
    return 1
  fi

  printf '%s' "${value}"
}

INGESTION_DIR="${INGESTION_DIR:-/home/opc/ingestion}"
WALLET_DIR="${INGESTION_DIR}/wallet"
WALLET_ZIP="${WALLET_DIR}/wallet.zip"
STUDIO_WALLET_ZIP="${WALLET_DIR}/goldengate-studio-wallet.zip"
OCI_WALLET_REQUIRED_MARKER="${INGESTION_DIR}/.oci_wallet_required"

export SUPPRESS_LABEL_WARNING="True"

validate_wallet_zip() {
  if [[ ! -s "${WALLET_ZIP}" ]]; then
    echo "ADB wallet ZIP is missing or empty: ${WALLET_ZIP}"
    return 1
  fi

  if ! unzip -tq "${WALLET_ZIP}" >/dev/null; then
    echo "ADB wallet ZIP is invalid or corrupt: ${WALLET_ZIP}"
    return 1
  fi
}

wallet_zip_member() {
  local basename="$1"

  unzip -Z1 "${WALLET_ZIP}" | awk -v basename="${basename}" '
    BEGIN { basename = tolower(basename) }
    {
      count = split($0, parts, "/")
      if (!found && tolower(parts[count]) == basename) {
        print
        found = 1
      }
    }
  '
}

strip_outer_quotes() {
  local value="$1"

  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] \
      || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s' "${value}"
}

expected_wallet_service() {
  local service_name=""
  local db_name=""

  service_name="$(read_env_value "${INGESTION_DIR}/.env" SERVICE_NAME || true)"
  if [[ -z "${service_name}" ]]; then
    service_name="${SERVICE_NAME:-}"
  fi
  if [[ -z "${service_name}" ]]; then
    service_name="$(read_env_value "${INGESTION_DIR}/.env" GRAVITINO_JDBC_SERVICE_NAME || true)"
  fi
  if [[ -z "${service_name}" ]]; then
    service_name="${GRAVITINO_JDBC_SERVICE_NAME:-}"
  fi
  db_name="$(read_env_value "${INGESTION_DIR}/.env" dbname || true)"
  if [[ -z "${db_name}" ]]; then
    db_name="${DBNAME:-${dbnamelocal:-}}"
  fi
  db_name="$(strip_outer_quotes "${db_name%$'\r'}")"
  if [[ -z "${service_name}" && -n "${db_name}" ]]; then
    service_name="${db_name}_high"
  fi

  service_name="$(strip_outer_quotes "${service_name%$'\r'}")"
  printf '%s' "${service_name}"
}

validate_wallet_service() {
  local expected_service="$1"
  local tns_member aliases expected_service_lower available_aliases

  tns_member="$(wallet_zip_member tnsnames.ora)"
  if [[ -z "${tns_member}" ]]; then
    echo "ADB wallet ZIP does not contain tnsnames.ora."
    return 1
  fi

  aliases="$(unzip -p "${WALLET_ZIP}" "${tns_member}" | awk -F '=' '
    /^[[:space:]]*[[:alnum:]_.-]+[[:space:]]*=/ {
      alias = $1
      gsub(/[[:space:]]/, "", alias)
      print tolower(alias)
    }
  ')"
  expected_service_lower="$(printf '%s' "${expected_service}" | tr '[:upper:]' '[:lower:]')"

  if ! grep -Fqx -- "${expected_service_lower}" <<< "${aliases}"; then
    available_aliases="$(printf '%s\n' "${aliases}" | paste -sd ',' -)"
    echo "ADB wallet does not contain expected service alias ${expected_service}."
    echo "Available wallet aliases: ${available_aliases:-none}"
    return 1
  fi
}

validate_wallet_password() {
  local password="$1"
  local p12_member temporary_p12

  if [[ -z "${password}" ]]; then
    echo "DBPASSWORD is empty; the wallet password cannot be validated."
    return 1
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to validate the ADB wallet password."
    return 1
  fi

  p12_member="$(wallet_zip_member ewallet.p12)"
  if [[ -z "${p12_member}" ]]; then
    echo "ADB wallet ZIP does not contain ewallet.p12."
    return 1
  fi

  temporary_p12="$(mktemp /tmp/adb-wallet-validation.XXXXXX.p12)"
  if ! unzip -p "${WALLET_ZIP}" "${p12_member}" > "${temporary_p12}"; then
    rm -f "${temporary_p12}"
    echo "Unable to extract ewallet.p12 for password validation."
    return 1
  fi

  if openssl pkcs12 -in "${temporary_p12}" -passin fd:3 -noout 3<<< "${password}" >/dev/null 2>&1 \
    || openssl pkcs12 -legacy -in "${temporary_p12}" -passin fd:3 -noout 3<<< "${password}" >/dev/null 2>&1; then
    rm -f "${temporary_p12}"
    return 0
  fi

  rm -f "${temporary_p12}"
  echo "ADB wallet password validation failed; the wallet was not generated with DBPASSWORD."
  return 1
}

create_wallet_request_file() {
  local password="$1"

  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to create the protected OCI wallet request."
    return 1
  fi

  wallet_request_file="$(mktemp /tmp/adb-wallet-request.XXXXXX.json)"
  chmod 600 "${wallet_request_file}"
  python3 -c '
import json
import sys

password = sys.stdin.read().rstrip("\n")
with open(sys.argv[1], "w", encoding="utf-8") as request:
    json.dump({"password": password}, request)
' "${wallet_request_file}" <<< "${password}"
}

acquire_fallback_wallet() {
  if [[ -z "${adbwallet:-}" ]]; then
    echo "adbwallet is empty; provide either an HTTPS PAR URL or an absolute path to a readable wallet ZIP."
    return 1
  fi

  case "${adbwallet}" in
    https://*)
      echo "Downloading ADB wallet from fallback HTTPS URL."
      wget -O "${WALLET_ZIP}" "${adbwallet}"
      ;;
    /*)
      if [[ ! -f "${adbwallet}" || ! -r "${adbwallet}" ]]; then
        echo "ADB wallet ZIP is not a readable file: ${adbwallet}"
        return 1
      fi
      echo "Copying ADB wallet from local file: ${adbwallet}"
      cp -- "${adbwallet}" "${WALLET_ZIP}"
      ;;
    *)
      echo "Invalid adbwallet value. Provide either an HTTPS PAR URL or an absolute path to a readable wallet ZIP."
      return 1
      ;;
  esac

  validate_wallet_zip
}

if [[ -L "${WALLET_DIR}" ]]; then
  echo "Refusing to replace symbolic-link wallet directory: ${WALLET_DIR}"
  exit 1
fi

mkdir -p "${WALLET_DIR}"
wallet_setup_complete=false
wallet_request_file=""
cleanup_failed_wallet_setup() {
  local status=$?

  if [[ "${wallet_setup_complete}" != true ]]; then
    find "${WALLET_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + 2>/dev/null || true
    echo "Removed incomplete ADB wallet state from ${WALLET_DIR}."
  fi
  if [[ -n "${wallet_request_file}" ]]; then
    rm -f "${wallet_request_file}"
  fi

  return "${status}"
}
trap cleanup_failed_wallet_setup EXIT

if [[ "${adbwallet:-}" == "${WALLET_DIR}"/* ]]; then
  echo "Local adbwallet must be outside ${WALLET_DIR}; that directory is recreated during wallet setup."
  exit 1
fi
find "${WALLET_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +

if [ -f /home/opc/.oci/config ]; then
  oci setup repair-file-permissions --file /home/opc/.oci/config
fi
if [ -f /home/opc/.oci/oci_api_key.pem ]; then
  oci setup repair-file-permissions --file /home/opc/.oci/oci_api_key.pem
fi
# # oci setup repair-file-permissions --file /home/opc/.oci/oci_api_key_public.pem


metadata_adb_ocid="$(metadata_value adb_ocid || true)"
metadata_dbpassword="$(metadata_value dbpassword || true)"
oci_wallet_required=false
if [[ -e "${OCI_WALLET_REQUIRED_MARKER}" \
  || "${ADB_WALLET_REQUIRE_OCI_GENERATION:-false}" == true \
  || -n "${metadata_adb_ocid}" \
  || -n "${metadata_dbpassword}" ]]; then
  oci_wallet_required=true
fi

adb_ocid_from_ingestion_env="$(read_env_value "${INGESTION_DIR}/.env" ADB_OCID || true)"
adb_ocid="${metadata_adb_ocid:-${adb_ocid_from_ingestion_env:-${adb_ocidlocal:-}}}"

dbpassword_from_ingestion_env="$(read_env_value "${INGESTION_DIR}/.env" DBPASSWORD || true)"
dbpassword="${metadata_dbpassword:-${dbpassword_from_ingestion_env:-${dbpasswordlocal:-}}}"

adb_region="$(printf '%s' "${adb_ocid}" | sed -n 's/^ocid1\.autonomousdatabase\.oc1\.\([^.]*\)\..*/\1/p')"
adb_region="${adb_region:-${ADB_REGION:-}}"
wallet_origin="fallback"

if [[ "${oci_wallet_required}" == true ]]; then
  if [[ -z "${adb_ocid}" ]]; then
    echo "ADB metadata was detected, but ADB_OCID is empty; refusing to use a fallback wallet."
    exit 1
  fi
  if [[ -z "${dbpassword}" ]]; then
    echo "ADB metadata was detected, but DBPASSWORD is empty; refusing to use a fallback wallet."
    exit 1
  fi

  MAX_RETRIES="${ADB_WALLET_MAX_RETRIES:-6}"
  RETRY_DELAY="${ADB_WALLET_RETRY_DELAY:-20}"
  if [[ ! "${MAX_RETRIES}" =~ ^[1-9][0-9]*$ || ! "${RETRY_DELAY}" =~ ^[0-9]+$ ]]; then
    echo "ADB_WALLET_MAX_RETRIES must be positive and ADB_WALLET_RETRY_DELAY must be non-negative."
    exit 1
  fi

  create_wallet_request_file "${dbpassword}"
  attempt=1
  while [[ ${attempt} -le ${MAX_RETRIES} ]]; do
    echo "Generating wallet for the provisioned ADB (attempt ${attempt}/${MAX_RETRIES})."
    rm -f "${WALLET_ZIP}"
    oci_args=(db autonomous-database generate-wallet --from-json "file://${wallet_request_file}")
    if [[ -n "${adb_region}" ]]; then
      oci_args+=(--region "${adb_region}")
    fi

    if oci "${oci_args[@]}" \
      --autonomous-database-id "${adb_ocid}" \
      --file "${WALLET_ZIP}" && [[ -s "${WALLET_ZIP}" ]]; then
      wallet_origin="oci"
      echo "Wallet generated successfully for the provisioned ADB."
      break
    fi

    echo "Wallet generation attempt ${attempt} failed."
    if [[ ${attempt} -lt ${MAX_RETRIES} ]]; then
      echo "Waiting ${RETRY_DELAY} seconds before retrying."
      sleep "${RETRY_DELAY}"
    fi
    ((attempt++))
  done
  rm -f "${wallet_request_file}"
  wallet_request_file=""

  if [[ "${wallet_origin}" != "oci" ]]; then
    echo "OCI wallet generation failed; refusing to install the static fallback wallet on a provisioned instance."
    exit 1
  fi
else
  echo "ADB provisioning metadata is unavailable; validating the configured standalone fallback wallet."
  acquire_fallback_wallet || exit 1
fi

validate_wallet_zip || exit 1
expected_service="$(expected_wallet_service)"
if [[ "${wallet_origin}" == "fallback" && -z "${expected_service}" ]]; then
  echo "WARNING: SERVICE_NAME could not be derived; validating the standalone fallback wallet password only."
fi
if [[ -n "${expected_service}" ]]; then
  validate_wallet_service "${expected_service}" || exit 1
fi
validate_wallet_password "${dbpassword}" || exit 1

export TNS_ADMIN="${WALLET_DIR}"

unzip -oq "${WALLET_ZIP}" -d "${WALLET_DIR}"

rm "${WALLET_ZIP}"

echo "# Connection property while using Oracle wallets." > "${TNS_ADMIN}/ojdbc.properties"
echo "user=admin" >> "${TNS_ADMIN}/ojdbc.properties"
echo "password=${dbpassword}" >> "${TNS_ADMIN}/ojdbc.properties"
echo "oracle.net.ssl_server_dn_match=true" >> "${TNS_ADMIN}/ojdbc.properties"
echo "oracle.net.wallet_location=/wallet" >> "${TNS_ADMIN}/ojdbc.properties"
echo "javax.net.ssl.trustStore=/wallet/truststore.jks" >> "${TNS_ADMIN}/ojdbc.properties"
echo "javax.net.ssl.trustStorePassword=${dbpassword}" >> "${TNS_ADMIN}/ojdbc.properties"
echo "javax.net.ssl.keyStore=/wallet/keystore.jks" >> "${TNS_ADMIN}/ojdbc.properties"
echo "javax.net.ssl.keyStorePassword=${dbpassword}" >> "${TNS_ADMIN}/ojdbc.properties"

create_studio_wallet_zip() {
  local studio_wallet_dir tmp_zip
  studio_wallet_dir="$(mktemp -d /tmp/goldengate-studio-wallet.XXXXXX)"
  tmp_zip="$(mktemp /tmp/goldengate-studio-wallet.XXXXXX.zip)"
  rm -f "${tmp_zip}"

  find "${WALLET_DIR}" -maxdepth 1 -type f \
    ! -name 'ojdbc.properties' \
    ! -name '.wallet_done' \
    ! -name 'goldengate-studio-wallet.zip' \
    -exec cp -p {} "${studio_wallet_dir}/" \;
  printf '%s\n' \
    'oracle.net.wallet_location=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=${TNS_ADMIN})))' \
    > "${studio_wallet_dir}/ojdbc.properties"

  if command -v zip >/dev/null 2>&1; then
    if ! (
      cd "${studio_wallet_dir}"
      zip -q -r "${tmp_zip}" .
    ); then
      rm -rf "${studio_wallet_dir}"
      rm -f "${tmp_zip}"
      return 1
    fi
  elif command -v python3 >/dev/null 2>&1; then
    if ! python3 - "${studio_wallet_dir}" "${tmp_zip}" <<'PY'
import os
import sys
import zipfile

wallet_dir, tmp_zip = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(tmp_zip, 'w', zipfile.ZIP_DEFLATED) as wallet:
    for name in sorted(os.listdir(wallet_dir)):
        path = os.path.join(wallet_dir, name)
        if not os.path.isfile(path):
            continue
        wallet.write(path, name)
PY
    then
      rm -rf "${studio_wallet_dir}"
      rm -f "${tmp_zip}"
      return 1
    fi
  else
    echo "WARNING: neither zip nor python3 is available; GoldenGate Studio wallet upload ZIP was not created."
    rm -rf "${studio_wallet_dir}"
    rm -f "${tmp_zip}"
    return 0
  fi

  rm -rf "${studio_wallet_dir}"
  mv "${tmp_zip}" "${STUDIO_WALLET_ZIP}"
}

create_studio_wallet_zip

chmod 700 "${WALLET_DIR}"
find "${WALLET_DIR}" -type f -exec chmod 600 {} \;

# The wallet is mounted read-only into rootless containers. Grant only the
# mapped container UIDs that need wallet read/traverse access.
if command -v podman >/dev/null 2>&1 && command -v setfacl >/dev/null 2>&1; then
  wallet_container_uids=(
    "${GOLDENGATE_WALLET_CONTAINER_UID:-54321}"
    "${GRAVITINO_WALLET_CONTAINER_UID:-10001}"
  )
  for wallet_container_uid in "${wallet_container_uids[@]}"; do
    if podman unshare setfacl -m "u:${wallet_container_uid}:rx" "${WALLET_DIR}" \
      && find "${WALLET_DIR}" -type d -exec podman unshare setfacl -m "u:${wallet_container_uid}:rx" {} + \
      && find "${WALLET_DIR}" -type f -exec podman unshare setfacl -m "u:${wallet_container_uid}:r" {} +; then
      echo "Granted ADB wallet ACL for container UID ${wallet_container_uid}"
    else
      echo "WARNING: Could not grant ADB wallet ACL for container UID ${wallet_container_uid}"
    fi
  done
fi
wallet_setup_complete=true
trap - EXIT
echo "ADB wallet is available at ${WALLET_DIR}"
