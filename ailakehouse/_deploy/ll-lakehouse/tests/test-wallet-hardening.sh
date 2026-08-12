#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-wallet-test.XXXXXX")"

cleanup() {
  rm -rf "${TEST_ROOT}"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file_exists() {
  [[ -f "$1" ]] || fail "Expected file to exist: $1"
}

assert_file_absent() {
  [[ ! -e "$1" ]] || fail "Expected path to be absent: $1"
}

assert_dir_empty() {
  [[ -d "$1" ]] || fail "Expected directory to exist: $1"
  [[ -z "$(find "$1" -mindepth 1 -print -quit)" ]] || fail "Expected directory to be empty: $1"
}

make_wallet() {
  local zip_path="$1"
  local service_name="$2"
  local password="$3"
  local wallet_source

  wallet_source="$(mktemp -d "${TEST_ROOT}/wallet-source.XXXXXX")"
  printf '%s = (DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=example.invalid)(PORT=1522)))\n' \
    "${service_name}" > "${wallet_source}/tnsnames.ora"

  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${wallet_source}/wallet.key" \
    -out "${wallet_source}/wallet.crt" \
    -subj '/CN=wallet-test' >/dev/null 2>&1
  openssl pkcs12 -export \
    -inkey "${wallet_source}/wallet.key" \
    -in "${wallet_source}/wallet.crt" \
    -out "${wallet_source}/ewallet.p12" \
    -passout "pass:${password}" >/dev/null 2>&1

  (
    cd "${wallet_source}"
    zip -q "${zip_path}" tnsnames.ora ewallet.p12
  )
}

make_command_stubs() {
  local bin_dir="$1"
  mkdir -p "${bin_dir}"

  cat > "${bin_dir}/curl" <<'EOF'
#!/usr/bin/env bash
case "${TEST_METADATA_MODE:-local}:$*" in
  metadata:*metadata/adb_ocid)
    printf '%s' 'ocid1.autonomousdatabase.oc1.eu-frankfurt-1.test'
    ;;
  metadata:*metadata/dbpassword)
    printf '%s' "${TEST_METADATA_PASSWORD}"
    ;;
esac
EOF

  cat > "${bin_dir}/oci" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${TEST_OCI_ARGS_FILE:-}" ]]; then
  printf '%s\n' "$*" >> "${TEST_OCI_ARGS_FILE}"
fi
exit 1
EOF

  cat > "${bin_dir}/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

  chmod +x "${bin_dir}/curl" "${bin_dir}/oci" "${bin_dir}/sleep"
}

run_fallback_setup() {
  local case_dir="$1"
  local fallback_zip="$2"
  local password="$3"
  local expected_service="$4"
  local metadata_mode="${5:-local}"
  local host_service="${TEST_HOST_SERVICE_NAME:-${expected_service}}"
  local runtime_db_name="${expected_service%_high}"
  local wallet_dir_override="${TEST_WALLET_DIR_OVERRIDE:-${case_dir}/ingestion/wallet}"
  local wallet_zip_override="${TEST_WALLET_ZIP_OVERRIDE:-${case_dir}/ingestion/wallet/wallet.zip}"

  mkdir -p "${case_dir}/ingestion/wallet"
  if [[ "${TEST_NO_IDENTITY_INPUTS:-false}" == true ]]; then
    host_service=""
    printf 'DBPASSWORD=%s\n' "${password}" > "${case_dir}/ingestion/.env"
  elif [[ "${TEST_RUNTIME_DBNAME_ONLY:-false}" == true ]]; then
    host_service=""
    printf 'dbname="%s"\nDBPASSWORD=%s\n' \
      "${runtime_db_name}" "${password}" > "${case_dir}/ingestion/.env"
  else
    printf 'SERVICE_NAME=stale_runtime_high\nSERVICE_NAME=%s\nDBPASSWORD=%s\n' \
      "${expected_service}" "${password}" > "${case_dir}/ingestion/.env"
  fi
  printf 'ADB_OCID=ocid1.autonomousdatabase.oc1.eu-frankfurt-1.cached\n' >> "${case_dir}/ingestion/.env"
  if [[ "${TEST_OCI_REQUIRED_MARKER:-false}" == true ]]; then
    touch "${case_dir}/ingestion/.oci_wallet_required"
  fi
  TEST_METADATA_MODE="${metadata_mode}" \
  TEST_METADATA_PASSWORD="metadata-password" \
  TEST_OCI_ARGS_FILE="${case_dir}/oci-args.log" \
  PATH="${TEST_ROOT}/bin:${PATH}" \
  INGESTION_DIR="${case_dir}/ingestion" \
  WALLET_DIR="${wallet_dir_override}" \
  WALLET_ZIP="${wallet_zip_override}" \
  STUDIO_WALLET_ZIP="${case_dir}/ingestion/wallet/goldengate-studio-wallet.zip" \
  adbwallet="${fallback_zip}" \
  dbpasswordlocal="${password}" \
  SERVICE_NAME="${host_service}" \
  bash "${PROJECT_ROOT}/init/adb-wallet.sh"
}

command -v openssl >/dev/null 2>&1 || fail "openssl is required"
command -v zip >/dev/null 2>&1 || fail "zip is required"
make_command_stubs "${TEST_ROOT}/bin"

echo "Test: fallback wallet with a different service alias is rejected"
wrong_alias_zip="${TEST_ROOT}/wrong-alias.zip"
make_wallet "${wrong_alias_zip}" "oldadb_high" "wallet-password"
wrong_alias_dir="${TEST_ROOT}/wrong-alias"
if run_fallback_setup "${wrong_alias_dir}" "${wrong_alias_zip}" "wallet-password" "newadb_high" >"${TEST_ROOT}/wrong-alias.log" 2>&1; then
  fail "Fallback wallet with the wrong service alias was accepted"
fi
grep -q "newadb_high" "${TEST_ROOT}/wrong-alias.log" || fail "Wrong-alias failure did not identify the expected service"
assert_dir_empty "${wrong_alias_dir}/ingestion/wallet"

echo "Test: fallback wallet with a different password is rejected"
wrong_password_zip="${TEST_ROOT}/wrong-password.zip"
make_wallet "${wrong_password_zip}" "newadb_high" "old-password"
wrong_password_dir="${TEST_ROOT}/wrong-password"
if run_fallback_setup "${wrong_password_dir}" "${wrong_password_zip}" "new-password" "newadb_high" >"${TEST_ROOT}/wrong-password.log" 2>&1; then
  fail "Fallback wallet with the wrong password was accepted"
fi
grep -qi "password" "${TEST_ROOT}/wrong-password.log" || fail "Wrong-password failure was not explicit"
assert_dir_empty "${wrong_password_dir}/ingestion/wallet"

echo "Test: OCI generation failure never falls back to a static wallet"
valid_zip="${TEST_ROOT}/valid.zip"
make_wallet "${valid_zip}" "newadb_high" "metadata-password"
metadata_failure_dir="${TEST_ROOT}/metadata-failure"
if run_fallback_setup "${metadata_failure_dir}" "${valid_zip}" "metadata-password" "newadb_high" metadata >"${TEST_ROOT}/metadata-failure.log" 2>&1; then
  fail "Metadata-driven setup used a fallback wallet after OCI generation failed"
fi
assert_dir_empty "${metadata_failure_dir}/ingestion/wallet"
grep -q -- '--from-json file://' "${metadata_failure_dir}/oci-args.log" || fail "OCI wallet password was not passed through a protected JSON file"
if grep -q 'metadata-password' "${metadata_failure_dir}/oci-args.log"; then
  fail "OCI wallet password was exposed in the command arguments"
fi

echo "Test: custom-image marker blocks fallback when metadata is temporarily unavailable"
cached_metadata_dir="${TEST_ROOT}/cached-metadata"
if TEST_OCI_REQUIRED_MARKER=true \
  run_fallback_setup "${cached_metadata_dir}" "${valid_zip}" "metadata-password" "newadb_high" >"${TEST_ROOT}/cached-metadata.log" 2>&1; then
  fail "Custom-image setup used a fallback wallet when live metadata was unavailable"
fi
assert_dir_empty "${cached_metadata_dir}/ingestion/wallet"

echo "Test: matching standalone fallback wallet is accepted"
valid_dir="${TEST_ROOT}/valid"
override_dir="${TEST_ROOT}/must-not-delete"
override_zip="${TEST_ROOT}/must-not-overwrite.zip"
mkdir -p "${override_dir}"
touch "${override_dir}/keep-me"
printf 'keep me\n' > "${override_zip}"
TEST_HOST_SERVICE_NAME="oldadb_high" \
TEST_WALLET_DIR_OVERRIDE="${override_dir}" \
TEST_WALLET_ZIP_OVERRIDE="${override_zip}" \
run_fallback_setup "${valid_dir}" "${valid_zip}" "metadata-password" "newadb_high" >"${TEST_ROOT}/valid.log" 2>&1
assert_file_exists "${valid_dir}/ingestion/wallet/tnsnames.ora"
assert_file_exists "${valid_dir}/ingestion/wallet/ewallet.p12"
studio_wallet_zip="${valid_dir}/ingestion/wallet/goldengate-studio-wallet.zip"
studio_ojdbc_properties="${valid_dir}/studio-ojdbc.properties"
assert_file_exists "${studio_wallet_zip}"
if ! unzip -p "${studio_wallet_zip}" ojdbc.properties > "${studio_ojdbc_properties}"; then
  fail "GoldenGate Studio wallet ZIP does not contain ojdbc.properties"
fi
grep -Fqx 'oracle.net.wallet_location=(SOURCE=(METHOD=FILE)(METHOD_DATA=(DIRECTORY=${TNS_ADMIN})))' \
  "${studio_ojdbc_properties}" \
  || fail "GoldenGate Studio ojdbc.properties does not use a portable TNS_ADMIN wallet location"
if grep -Eqi '^(user|password|javax\.net\.ssl\.(trustStorePassword|keyStorePassword))=' \
  "${studio_ojdbc_properties}"; then
  fail "GoldenGate Studio ojdbc.properties contains credentials"
fi
if grep -Fq '/wallet' "${studio_ojdbc_properties}"; then
  fail "GoldenGate Studio ojdbc.properties contains a host-specific wallet path"
fi
assert_file_exists "${override_dir}/keep-me"
grep -q 'keep me' "${override_zip}" || fail "WALLET_ZIP override modified a file outside the ingestion wallet"

echo "Test: quoted dbname derives a valid fallback wallet service"
quoted_dbname_dir="${TEST_ROOT}/quoted-dbname"
TEST_RUNTIME_DBNAME_ONLY=true \
run_fallback_setup "${quoted_dbname_dir}" "${valid_zip}" "metadata-password" "newadb_high" >"${TEST_ROOT}/quoted-dbname.log" 2>&1
assert_file_exists "${quoted_dbname_dir}/ingestion/wallet/tnsnames.ora"

echo "Test: standalone fallback remains usable when no alias can be derived"
no_identity_dir="${TEST_ROOT}/no-identity"
TEST_NO_IDENTITY_INPUTS=true \
run_fallback_setup "${no_identity_dir}" "${valid_zip}" "metadata-password" "newadb_high" >"${TEST_ROOT}/no-identity.log" 2>&1
assert_file_exists "${no_identity_dir}/ingestion/wallet/tnsnames.ora"
grep -q 'password only' "${TEST_ROOT}/no-identity.log" || fail "Missing standalone identity warning"

echo "PASS: wallet hardening regression tests"
