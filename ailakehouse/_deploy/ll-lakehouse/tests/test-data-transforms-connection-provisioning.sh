#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-data-transforms-test.XXXXXX")"

cleanup_test() {
  rm -rf "${TEST_ROOT}"
}
trap cleanup_test EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# shellcheck source=../init/create-pg-iceberg-connection.sh
source "${PROJECT_ROOT}/init/create-pg-iceberg-connection.sh"
PYTHON_BIN="$(command -v python3)"

log_stdout="$(log "stdout-capture-probe" 2>/dev/null)"
[[ -z "${log_stdout}" ]] || fail "Diagnostic logs must not be captured as function return values."

cat > "${TEST_ROOT}/connections.json" <<'JSON'
{
  "items": [
    {
      "name": "atp214345",
      "technology": "ORACLE",
      "globalId": "oracle-default",
      "connectionProperties": {
        "isWalletConnection": false,
        "jdbcUrl": "jdbc:oracle:thin:@atp214345_low?TNS_ADMIN=/u01/wallet"
      }
    },
    {
      "name": "reporting",
      "technology": "ORACLE",
      "globalId": "oracle-reporting"
    }
  ]
}
JSON

selected="$(select_adb_connection_id_from_file \
  "${TEST_ROOT}/connections.json" "ATP214345" "atp214345" false)"
[[ "${selected}" == "oracle-default" ]] || fail "Exact connection-name selection failed."

cat > "${TEST_ROOT}/wallet-connections.json" <<'JSON'
[
  {
    "name": "generated-default",
    "technology": "ORACLE",
    "globalId": "wallet-default",
    "connectionProperties": {
      "isWalletConnection": true,
      "jdbcUrl": "jdbc:oracle:thin:@atp214345_low?TNS_ADMIN=/u01/wallet"
    }
  },
  {
    "name": "other-database",
    "technology": "ORACLE",
    "globalId": "wallet-other",
    "connectionProperties": {
      "isWalletConnection": true,
      "jdbcUrl": "jdbc:oracle:thin:@other_low?TNS_ADMIN=/u01/wallet"
    }
  }
]
JSON

selected="$(select_adb_connection_id_from_file \
  "${TEST_ROOT}/wallet-connections.json" "atp214345" "atp214345" false)"
[[ "${selected}" == "wallet-default" ]] || fail "Wallet/JDBC fallback selection failed."

cat > "${TEST_ROOT}/same-name-non-wallet.json" <<'JSON'
[
  {
    "name": "atp214345",
    "technology": "ORACLE",
    "globalId": "manual-same-name",
    "connectionProperties": {
      "isWalletConnection": false,
      "jdbcUrl": "jdbc:oracle:thin:@manual-host:1521/service"
    }
  },
  {
    "name": "generated-default",
    "technology": "ORACLE",
    "globalId": "wallet-default",
    "connectionProperties": {
      "isWalletConnection": true,
      "jdbcUrl": "jdbc:oracle:thin:@atp214345_low?TNS_ADMIN=/u01/wallet"
    }
  }
]
JSON

set +e
select_adb_connection_id_from_file \
  "${TEST_ROOT}/same-name-non-wallet.json" "atp214345" "atp214345" false \
  >/dev/null 2>&1
selection_status=$?
set -e
[[ "${selection_status}" -eq 5 ]] \
  || fail "A same-name non-wallet connection must not be selected or bypassed."

cat > "${TEST_ROOT}/ambiguous-connections.json" <<'JSON'
[
  {
    "name": "generated-one",
    "technology": "ORACLE",
    "globalId": "wallet-one",
    "connectionProperties": {
      "isWalletConnection": true,
      "jdbcUrl": "jdbc:oracle:thin:@atp214345_low?TNS_ADMIN=/u01/wallet"
    }
  },
  {
    "name": "generated-two",
    "technology": "ORACLE",
    "globalId": "wallet-two",
    "connectionProperties": {
      "isWalletConnection": true,
      "jdbcUrl": "jdbc:oracle:thin:@atp214345_high?TNS_ADMIN=/u01/wallet"
    }
  }
]
JSON

set +e
select_adb_connection_id_from_file \
  "${TEST_ROOT}/ambiguous-connections.json" "atp214345" "atp214345" false \
  >/dev/null 2>&1
selection_status=$?
set -e
[[ "${selection_status}" -eq 2 ]] \
  || fail "Ambiguous wallet-backed connections must be rejected."

printf '{invalid json' > "${TEST_ROOT}/malformed-connections.json"
set +e
select_adb_connection_id_from_file \
  "${TEST_ROOT}/malformed-connections.json" "atp214345" "atp214345" false \
  >/dev/null 2>&1
selection_status=$?
set -e
[[ "${selection_status}" -eq 4 ]] \
  || fail "Malformed connection responses must be reported separately."

cat > "${TEST_ROOT}/connection-detail.json" <<'JSON'
{
  "name": "atp214345",
  "technology": "ORACLE",
  "globalId": "oracle-default",
  "description": "response-only value",
  "connectionProperties": {
    "dataServerProperties": {"fetchSize": "5000"},
    "isWalletConnection": true,
    "jdbcBatchUpdateSize": 5000,
    "jdbcDriverName": "oracle.jdbc.OracleDriver",
    "jdbcFetchArraySize": 5000,
    "jdbcUrl": "jdbc:oracle:thin:@atp214345_low?TNS_ADMIN=/u01/wallet",
    "targetDOP": 1,
    "username": "ADMIN"
  },
  "schemas": [
    {
      "dataSchema": "ADMIN",
      "default": true,
      "schemaShortName": "ADMIN",
      "workSchema": "ADMIN"
    }
  ]
}
JSON

test_password='P@ss:word/2026'
payload_output="$(build_adb_connection_payload \
  "${TEST_ROOT}/connection-detail.json" \
  "${TEST_ROOT}/connection-payload.json" \
  "PG" \
  "${test_password}")"
[[ -z "${payload_output}" ]] || fail "Payload generation must not print credentials."

TEST_PASSWORD="${test_password}" "${PYTHON_BIN}" - "${TEST_ROOT}/connection-payload.json" <<'PY'
import base64
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)

assert set(payload) == {"name", "technology", "globalId", "connectionProperties"}
assert payload["name"] == "atp214345"
assert payload["technology"] == "ORACLE"
assert payload["globalId"] == "oracle-default"

properties = payload["connectionProperties"]
assert properties["username"] == "PG"
assert base64.b64decode(properties["password"]).decode("utf-8") == os.environ["TEST_PASSWORD"]
assert properties["jdbcUrl"] == "jdbc:oracle:thin:@atp214345_low?TNS_ADMIN=/u01/wallet"
assert properties["dataServerProperties"] == {"fetchSize": "5000"}
PY

"${PYTHON_BIN}" - \
  "${TEST_ROOT}/connection-detail.json" \
  "${TEST_ROOT}/object-id-only-detail.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    detail = json.load(handle)

detail["objectId"] = detail.pop("globalId")
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    json.dump(detail, handle)
PY
build_adb_connection_payload \
  "${TEST_ROOT}/object-id-only-detail.json" \
  "${TEST_ROOT}/object-id-only-payload.json" \
  "PG" \
  "${test_password}"
"${PYTHON_BIN}" - "${TEST_ROOT}/object-id-only-payload.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)

assert payload["globalId"] == "oracle-default"
PY

encoded_password="$(TEST_PASSWORD="${test_password}" "${PYTHON_BIN}" - <<'PY'
import base64
import os

print(base64.b64encode(os.environ["TEST_PASSWORD"].encode("utf-8")).decode("ascii"))
PY
)"

cat > "${TEST_ROOT}/sensitive-response.json" <<JSON
{
  "password": "${encoded_password}",
  "clientSecret": "client-secret-value",
  "nested": {
    "Authorization": "Bearer auth-cookie-value",
    "message": "failed for ${test_password} and ${encoded_password}"
  }
}
JSON
summary="$(
  DBPASSWORD="${test_password}" AUTH_COOKIE="auth-cookie-value" \
    summarize_response "${TEST_ROOT}/sensitive-response.json"
)"
[[ "${summary}" == *"[REDACTED]"* ]] || fail "Sensitive response summary was not redacted."
[[ "${summary}" != *"${test_password}"* ]] || fail "Plaintext DB password leaked in response summary."
[[ "${summary}" != *"${encoded_password}"* ]] || fail "Encoded DB password leaked in response summary."
[[ "${summary}" != *"client-secret-value"* ]] || fail "Client secret leaked in response summary."
[[ "${summary}" != *"auth-cookie-value"* ]] || fail "Authorization cookie leaked in response summary."

cat > "${TEST_ROOT}/sensitive-response.txt" <<TEXT
Authorization: Bearer auth-cookie-value
password=${test_password}
encoded=${encoded_password}
TEXT
summary="$(
  DBPASSWORD="${test_password}" AUTH_COOKIE="auth-cookie-value" \
    summarize_response "${TEST_ROOT}/sensitive-response.txt"
)"
[[ "${summary}" == *"[REDACTED]"* ]] || fail "Non-JSON response summary was not redacted."
[[ "${summary}" != *"${test_password}"* ]] || fail "Non-JSON response leaked the plaintext password."
[[ "${summary}" != *"${encoded_password}"* ]] || fail "Non-JSON response leaked the encoded password."
[[ "${summary}" != *"auth-cookie-value"* ]] || fail "Non-JSON response leaked an authorization cookie."

cat > "${TEST_ROOT}/verified-detail.json" <<'JSON'
{
  "connectionProperties": {"username": "PG"},
  "schemas": [
    {
      "dataSchema": "PG",
      "default": true,
      "schemaShortName": "PG",
      "workSchema": "PG"
    }
  ]
}
JSON
verify_adb_connection_detail "${TEST_ROOT}/verified-detail.json" "PG" \
  || fail "PG username/default-schema verification failed."

cat > "${TEST_ROOT}/schema-less-detail.json" <<'JSON'
{
  "connectionProperties": {"username": "PG"},
  "schemas": []
}
JSON
verify_adb_connection_detail "${TEST_ROOT}/schema-less-detail.json" "PG" \
  || fail "A successful PG connection without schema metadata must be accepted."

cat > "${TEST_ROOT}/wrong-schema-detail.json" <<'JSON'
{
  "connectionProperties": {"username": "PG"},
  "schemas": [
    {
      "dataSchema": "ADMIN",
      "default": true,
      "schemaShortName": "ADMIN",
      "workSchema": "ADMIN"
    }
  ]
}
JSON
if verify_adb_connection_detail "${TEST_ROOT}/wrong-schema-detail.json" "PG"; then
  fail "A non-PG default schema must be rejected."
fi

log() {
  printf '[data-transforms] %s\n' "$*" >&2
}

find_adb_connection_id() {
  printf 'oracle-default'
}

mock_test_connection() {
  printf '%s\n' "$*" > "${MOCK_TEST_ARGS_FILE}"
}
test_connection() {
  mock_test_connection "$@"
}

WORK_DIR="${TEST_ROOT}/mock-success"
mkdir -p "${WORK_DIR}"
MOCK_TEST_ARGS_FILE="${WORK_DIR}/test-connection-args"
MOCK_PUT_PAYLOAD_FILE="${WORK_DIR}/captured-put-payload.json"
MOCK_GET_COUNT=0

api_request() {
  local method="$1"
  local path="$2"
  local data_file="$3"
  local output_file="$4"

  API_STATUS=200
  case "${method} ${path}" in
    "GET /mock-api/dataservers/id/oracle-default")
      MOCK_GET_COUNT=$((MOCK_GET_COUNT + 1))
      if [[ "${MOCK_GET_COUNT}" -eq 1 ]]; then
        cp "${TEST_ROOT}/connection-detail.json" "${output_file}"
      else
        cp "${TEST_ROOT}/verified-detail.json" "${output_file}"
      fi
      ;;
    "PUT /mock-api/dataservers")
      cp "${data_file}" "${MOCK_PUT_PAYLOAD_FILE}"
      printf '{}\n' > "${output_file}"
      ;;
    *)
      fail "Unexpected mocked API request: ${method} ${path}"
      ;;
  esac
}

DBPASSWORD="${test_password}"
DATA_TRANSFORMS_ADB_USERNAME="PG"
configure_adb_connection "/mock-api" \
  || fail "Mocked ADB connection configuration failed."
[[ -s "${MOCK_PUT_PAYLOAD_FILE}" ]] || fail "Mocked ADB update did not send a payload."
[[ "$(cat "${MOCK_TEST_ARGS_FILE}")" == "/mock-api oracle-default atp214345" ]] \
  || fail "Mocked ADB update did not run the expected agent connection test."
TEST_PASSWORD="${test_password}" "${PYTHON_BIN}" - "${MOCK_PUT_PAYLOAD_FILE}" <<'PY'
import base64
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)

properties = payload["connectionProperties"]
assert properties["username"] == "PG"
assert base64.b64decode(properties["password"]).decode("utf-8") == os.environ["TEST_PASSWORD"]
PY

WORK_DIR="${TEST_ROOT}/mock-failure"
mkdir -p "${WORK_DIR}"
failure_token="failure-token-value"
api_request() {
  local method="$1"
  local path="$2"
  local data_file="$3"
  local output_file="$4"

  case "${method} ${path}" in
    "GET /mock-api/dataservers/id/oracle-default")
      API_STATUS=200
      cp "${TEST_ROOT}/connection-detail.json" "${output_file}"
      ;;
    "PUT /mock-api/dataservers")
      API_STATUS=400
      cat > "${output_file}" <<JSON
{"password":"${encoded_password}","token":"${failure_token}","message":"${test_password} ${encoded_password}"}
JSON
      return 1
      ;;
    *)
      fail "Unexpected mocked API request: ${method} ${path}"
      ;;
  esac
}

set +e
failure_output="$(AUTH_COOKIE="${failure_token}" configure_adb_connection "/mock-api" 2>&1)"
failure_status=$?
set -e
[[ "${failure_status}" -ne 0 ]] || fail "Failed ADB updates must propagate failure."
[[ "${failure_output}" == *"[REDACTED]"* ]] || fail "Failed ADB update response was not redacted."
[[ "${failure_output}" != *"${test_password}"* ]] || fail "Failed ADB update logged the plaintext password."
[[ "${failure_output}" != *"${encoded_password}"* ]] || fail "Failed ADB update logged the encoded password."
[[ "${failure_output}" != *"${failure_token}"* ]] || fail "Failed ADB update logged an authorization token."

WORK_DIR="${TEST_ROOT}/mock-demo"
mkdir -p "${WORK_DIR}"
DATA_TRANSFORMS_DEMO_PROJECT_NAME="peakgear"
DATA_TRANSFORMS_DEMO_DATA_FLOW_NAME="dataFlow"
DATA_TRANSFORMS_DEMO_DATA_FLOW_SOURCE_TABLE="PRODUCT_MASTER_RAW_ICEBERG_EXT"
DATA_TRANSFORMS_DEMO_DATA_FLOW_TARGET_TABLE="GOLD_PRODUCTS"
DATA_TRANSFORMS_DEMO_DATA_LOAD_NAME="dataLoad"
DATA_TRANSFORMS_DEMO_DATA_LOAD_SOURCE_TABLE="GOLD_PRODUCTS"
MOCK_FLOW_PAYLOAD_FILE="${WORK_DIR}/flow-payload.json"
MOCK_LOAD_PAYLOAD_FILE="${WORK_DIR}/load-payload.json"

find_connection_id() {
  printf 'iceberg-default'
}
find_adb_connection_id() {
  printf 'oracle-default'
}
api_request() {
  local method="$1"
  local path="$2"
  local data_file="$3"
  local output_file="$4"

  API_STATUS=200
  case "${method} ${path}" in
    "GET /mock-api/mappings"|"GET /mock-api/bulkload")
      printf '[]\n' > "${output_file}"
      ;;
    "GET /mock-api/projects/name/peakgear")
      printf '%s\n' '{"name":"peakgear","code":"PEAKGEAR","globalId":"project-default"}' > "${output_file}"
      ;;
    "GET /mock-api/datastores")
      cat > "${output_file}" <<'JSON'
[
  {"name":"PRODUCT_MASTER_RAW_ICEBERG_EXT","globalId":"source-store","dataStoreType":"TABLE","modelCode":"SOURCE_MODEL","schemaName":"PG","schemaGlobalId":"oracle-schema","dataServerName":"adb","dataServerGlobalId":"oracle-default","technologyCode":"ORACLE","columns":[{"name":"RAW_SKU","position":1,"dataType":"VARCHAR2","dataTypeCode":"VARCHAR2","length":50},{"name":"SUBCATEGORY","position":2,"dataType":"VARCHAR2","dataTypeCode":"VARCHAR2","length":100}]},
  {"name":"GOLD_PRODUCTS","globalId":"target-store","dataStoreType":"TABLE","modelCode":"TARGET_MODEL","schemaName":"PG","schemaGlobalId":"oracle-schema","dataServerName":"adb","dataServerGlobalId":"oracle-default","technologyCode":"ORACLE","columns":[{"name":"SKU","position":1,"dataType":"VARCHAR2","dataTypeCode":"VARCHAR2","length":50},{"name":"SUBCATEGORY","position":2,"dataType":"VARCHAR2","dataTypeCode":"VARCHAR2","length":100}]}
]
JSON
      ;;
    "POST /mock-api/mappings")
      cp "${data_file}" "${MOCK_FLOW_PAYLOAD_FILE}"
      printf '%s\n' '{"name":"dataFlow","globalId":"flow-default","projectName":"peakgear"}' > "${output_file}"
      ;;
    "GET /mock-api/dataservers/id/iceberg-default")
      printf '%s\n' '{"name":"pg-iceberg","globalId":"iceberg-default","schemas":[{"globalId":"iceberg-gold","dataSchema":"gold","schemaShortName":"gold","parentServer":"pg-iceberg","parentServerGlobalId":"iceberg-default","schemaName":"pg-iceberg.gold","workSchema":"gold","logicalSchema":"ICEBERG_LS","logicalSchemaTag":"IMPORTED_SCHEMA","technology":"APACHE_ICEBERG","default":true}]}' > "${output_file}"
      ;;
    "GET /mock-api/dataservers/id/oracle-default")
      printf '%s\n' '{"name":"adb","globalId":"oracle-default","schemas":[{"globalId":"oracle-schema","dataSchema":"PG","schemaShortName":"PG","parentServer":"adb","parentServerGlobalId":"oracle-default","schemaName":"adb.PG","workSchema":"PG","logicalSchema":"ORACLE_LS","logicalSchemaTag":"IMPORTED_SCHEMA","technology":"ORACLE","default":true}]}' > "${output_file}"
      ;;
    "POST /mock-api/bulkload")
      cp "${data_file}" "${MOCK_LOAD_PAYLOAD_FILE}"
      printf '%s\n' '{"bulkLoadName":"dataLoad","globalId":"load-default","parentProjectName":"peakgear","deploymentStatus":"VALID"}' > "${output_file}"
      ;;
    *)
      fail "Unexpected demo mocked API request: ${method} ${path}"
      ;;
  esac
}

ensure_demo_data_flow "/mock-api" || fail "Demo data-flow provisioning failed."
ensure_demo_data_load "/mock-api" || fail "Demo data-load provisioning failed."
"${PYTHON_BIN}" - "${MOCK_FLOW_PAYLOAD_FILE}" "${MOCK_LOAD_PAYLOAD_FILE}" <<'PY'
import json
import sys

flow = json.load(open(sys.argv[1], encoding="utf-8"))
load = json.load(open(sys.argv[2], encoding="utf-8"))
assert flow["name"] == "dataFlow"
assert flow["projectName"] == "peakgear"
assert flow["sources"][0]["name"] == "PRODUCT_MASTER_RAW_ICEBERG_EXT"
assert flow["targets"][0]["name"] == "GOLD_PRODUCTS"
assert flow["dbfunc_substitutions"][0]["name"] == "Substitution"
assert flow["dbfunc_substitutions"][0]["attributes"][1]["substitutionMap"] == {"NetSuite": "Databricks"}
assert load["bulkLoadName"] == "dataLoad"
assert load["parentProjectName"] == "peakgear"
assert load["targetModel"]["schema"]["schemaName"] == "pg-iceberg.gold"
assert load["sourceTables"] == [{"sourceTableName": "GOLD_PRODUCTS", "targetPreloadAction": "APPEND"}]
assert "dataLoadOptions" not in load
PY

RESET_CALLS_FILE="${WORK_DIR}/reset-calls.log"
api_request() {
  local method="$1"
  local path="$2"
  local data_file="$3"
  local output_file="$4"

  API_STATUS=200
  printf '%s %s\n' "${method}" "${path}" >> "${RESET_CALLS_FILE}"
  case "${method} ${path}" in
    "GET /mock-api/bulkload")
      printf '%s\n' '[{"bulkLoadName":"dataLoad","parentProjectName":"peakgear","globalId":"load-id"}]' > "${output_file}"
      ;;
    "GET /mock-api/mappings")
      printf '%s\n' '[{"name":"dataFlow","projectName":"peakgear","globalId":"flow-id"}]' > "${output_file}"
      ;;
    "GET /mock-api/projects/name/peakgear")
      printf '%s\n' '{"name":"peakgear","globalId":"project-id"}' > "${output_file}"
      ;;
    "GET /mock-api/models")
      printf '%s\n' '[{"modelCode":"PG","globalId":"model-id"}]' > "${output_file}"
      ;;
    "GET /mock-api/dataservers/id/oracle-default")
      printf '%s\n' '{"name":"adb","globalId":"oracle-default","schemas":[{"dataSchema":"PG","globalId":"pg-schema-id"}]}' > "${output_file}"
      ;;
    DELETE\ *)
      printf '%s\n' '{}' > "${output_file}"
      ;;
    *)
      fail "Unexpected reset mocked API request: ${method} ${path}"
      ;;
  esac
}

reset_demo_data_transforms "/mock-api" || fail "Data Transforms demo reset failed."
expected_reset_calls="${WORK_DIR}/expected-reset-calls.log"
cat > "${expected_reset_calls}" <<'EOF'
GET /mock-api/bulkload
DELETE /mock-api/bulkload/id/load-id
GET /mock-api/mappings
DELETE /mock-api/mappings/id/flow-id
GET /mock-api/projects/name/peakgear
DELETE /mock-api/projects/id/project-id
GET /mock-api/models
DELETE /mock-api/models/id/model-id
GET /mock-api/dataservers/id/oracle-default
DELETE /mock-api/dataservers/schemas/id/pg-schema-id?cascade=true&forceDelete=true
DELETE /mock-api/dataservers/id/iceberg-default?cascade=true&forceDelete=true
EOF
cmp -s "${expected_reset_calls}" "${RESET_CALLS_FILE}" \
  || fail "Data Transforms demo reset did not use the expected scoped deletion order."

is_disabled false || fail "false must disable provisioning."
is_disabled 0 || fail "0 must disable provisioning."
if is_disabled true; then
  fail "true must enable provisioning."
fi

echo "Data Transforms connection provisioning tests passed."
