#!/bin/bash

set -euo pipefail

INGESTION_DIR="${INGESTION_DIR:-/home/opc/ingestion}"
ENV_FILE="${ENV_FILE:-${INGESTION_DIR}/.env}"
WALLET_DIR="${WALLET_DIR:-${INGESTION_DIR}/wallet}"
MARKER_FILE="${ADB_LOAD_MARKER_FILE:-${INGESTION_DIR}/.adb_load_done}"
LOG_DIR="${INGESTION_DIR}/logs"
LOG_FILE="${LOG_DIR}/adb-load.log"

# Load deployment-specific values from OCI metadata. Private download URLs must
# be supplied at runtime and must never be embedded in the image source.
if [[ -r /home/opc/init/variable.sh ]]; then
  # shellcheck source=/dev/null
  source /home/opc/init/variable.sh
fi

ONNX_MODEL_URL="${ONNX_MODEL_URL:-}"
ONNX_MODEL_FILENAME="${ONNX_MODEL_FILENAME:-all_MiniLM_L12_v2.onnx}"
WORK_DIR=""

if [[ -z "${ONNX_MODEL_URL}" || "${ONNX_MODEL_URL}" == *"<"* ]]; then
  printf '[adb-load] ERROR: ONNX_MODEL_URL must be supplied through OCI runtime metadata.\n' >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"
chmod 700 "${LOG_DIR}"
chmod 600 "${LOG_FILE}"
exec >> "${LOG_FILE}" 2>&1

log() {
  printf '[adb-load] %s\n' "$*"
}

is_enabled() {
  local value="${1:-}"
  case "${value,,}" in
    0|false|no|off) return 1 ;;
    *) return 0 ;;
  esac
}

sql_password() {
  printf '%s' "$1" | sed 's/"/""/g'
}

sql_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

q_literal() {
  local value="$1"
  if [[ "${value}" == *"~"* ]]; then
    printf "q'!%s!'" "${value}"
  else
    printf "q'~%s~'" "${value}"
  fi
}

generate_warehouse_sql() {
  local gold_data_dir="${INGESTION_DIR}/gold-data"
  local manifest_file="${gold_data_dir}/_export_manifest.json"

  if command -v python3 >/dev/null 2>&1 && [[ -f "${manifest_file}" ]]; then
    GOLD_DATA_DIR="${gold_data_dir}" \
    MANIFEST_FILE="${manifest_file}" \
    WAREHOUSE_DROP_SQL="${WORK_DIR}/warehouse_drop.sql" \
    WAREHOUSE_CREATE_SQL="${WORK_DIR}/warehouse_create.sql" \
    WAREHOUSE_LOAD_SQL="${WORK_DIR}/warehouse_load.sql" \
    WAREHOUSE_CHECK_SQL="${WORK_DIR}/warehouse_check.sql" \
    python3 <<'PY'
import json
import os
import re
import csv
from pathlib import Path

gold_data_dir = Path(os.environ["GOLD_DATA_DIR"])
manifest_file = Path(os.environ["MANIFEST_FILE"])

def quote_identifier(value):
    text = str(value or "").strip()
    if not text or '"' in text or len(text) > 128:
        raise ValueError(f"Unsafe Oracle identifier: {text!r}")
    return f'"{text}"'

def load_identifier(value):
    text = str(value or "").strip().upper()
    if re.fullmatch(r"[A-Z][A-Z0-9_$#]{0,127}", text):
        return text
    return quote_identifier(value)

def sql_string(value):
    return "'" + str(value).replace("'", "''") + "'"

def normalized_type(data_type):
    text = str(data_type or "").strip().upper()
    if text in {"CLOB", "JSON", "VECTOR", "SDO_GEOMETRY"}:
        return "CLOB"
    return "VARCHAR2(4000)"

def normalized_name(value):
    text = re.sub(r"[^A-Za-z0-9_$#]+", "_", str(value or "").strip().upper()).strip("_")
    return text or "COLUMN_VALUE"

def inferred_columns(csv_path):
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        headers = next(reader, [])
    return [
        {"name": normalized_name(header), "data_type": "VARCHAR2"}
        for header in headers
        if str(header or "").strip()
    ]

manifest = json.loads(manifest_file.read_text())
entries = []
stale_table_names = []
seen_csv_files = set()
for table in manifest.get("tables", []):
    csv_file = table.get("csv_file")
    if not csv_file:
        continue
    table_name = table.get("table_name") or Path(csv_file).stem.upper()
    csv_path = gold_data_dir / csv_file
    if not csv_path.is_file():
        stale_table_names.append(table_name)
        continue
    columns = table.get("columns") or []
    if not columns:
        continue
    entries.append({
        "table_name": table_name,
        "csv_file": csv_file,
        "csv_path": csv_path,
        "columns": columns,
        "expected": int(table.get("row_count_exported") or 0),
    })
    seen_csv_files.add(csv_file)

for csv_path in sorted(gold_data_dir.glob("*.csv")):
    if csv_path.name in seen_csv_files:
        continue
    columns = inferred_columns(csv_path)
    if not columns:
        continue
    entries.append({
        "table_name": normalized_name(csv_path.stem),
        "csv_file": csv_path.name,
        "csv_path": csv_path,
        "columns": columns,
        "expected": 1,
    })

entries.sort(key=lambda item: item["csv_file"].upper())
active_table_names = {entry["table_name"] for entry in entries}
stale_table_names = sorted({
    table_name
    for table_name in stale_table_names
    if table_name and table_name not in active_table_names
})

drop_lines = ["PROMPT Dropping warehouse gold-data CSV tables..."]
create_lines = ["PROMPT Creating warehouse gold-data CSV tables..."]
load_lines = [
    "PROMPT Loading warehouse gold-data CSV tables...",
    "SET LOAD DEFAULT",
    "SET LOAD BATCH_ROWS 5000 BATCHES_PER_COMMIT 1 SCAN 5000 CLEAN_NAMES TRANSFORM",
]
check_lines = []

for table_name in stale_table_names:
    drop_lines.append(f"DROP TABLE {quote_identifier(table_name)} PURGE;")

for entry in entries:
    table_sql = quote_identifier(entry["table_name"])
    drop_lines.append(f"DROP TABLE {table_sql} PURGE;")

    column_defs = []
    for column in entry["columns"]:
        column_name = column.get("name")
        column_defs.append(f"  {quote_identifier(column_name)} {normalized_type(column.get('data_type'))}")
    create_lines.append(f"CREATE TABLE {table_sql} (\n" + ",\n".join(column_defs) + "\n);")

    load_lines.append(f"LOAD TABLE {load_identifier(entry['table_name'])} {entry['csv_path']}")
    check_lines.append(f"  check_table({sql_string(table_sql)}, {entry['expected']});")

Path(os.environ["WAREHOUSE_DROP_SQL"]).write_text("\n".join(drop_lines) + "\n")
Path(os.environ["WAREHOUSE_CREATE_SQL"]).write_text("\n".join(create_lines) + "\n")
Path(os.environ["WAREHOUSE_LOAD_SQL"]).write_text("\n".join(load_lines) + "\n")
Path(os.environ["WAREHOUSE_CHECK_SQL"]).write_text("\n".join(check_lines) + "\n")
PY
    return 0
  fi

  : > "${WORK_DIR}/warehouse_drop.sql"
  : > "${WORK_DIR}/warehouse_create.sql"
  : > "${WORK_DIR}/warehouse_check.sql"
  {
    printf 'PROMPT Loading warehouse gold-data CSV tables...\n'
    printf 'SET LOAD DEFAULT\n'
    printf 'SET LOAD BATCH_ROWS 5000 BATCHES_PER_COMMIT 1 SCAN 5000 CLEAN_NAMES TRANSFORM\n'
    find "${gold_data_dir}" -maxdepth 1 -type f -name '*.csv' | sort | while read -r csv_path; do
      local csv_file table_name
      csv_file="$(basename "${csv_path}")"
      table_name="${csv_file%.csv}"
      table_name="$(printf '%s' "${table_name}" | tr '[:lower:]' '[:upper:]' | sed -E 's/[^A-Z0-9_$#]+/_/g')"
      printf 'DROP TABLE "%s" PURGE;\n' "${table_name}" >> "${WORK_DIR}/warehouse_drop.sql"
      if [[ "${table_name}" =~ ^[A-Z][A-Z0-9_\$#]{0,127}$ ]]; then
        printf 'LOAD TABLE %s %s NEW\n' "${table_name}" "${csv_path}"
      else
        printf 'LOAD TABLE "%s" %s NEW\n' "${table_name}" "${csv_path}"
      fi
      printf "  check_table('\"%s\"', 1);\n" "${table_name}" >> "${WORK_DIR}/warehouse_check.sql"
    done
  } > "${WORK_DIR}/warehouse_load.sql"
}

cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

if [[ -f "${MARKER_FILE}" ]]; then
  log "ADB load marker exists; skipping."
  exit 0
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  log "No ingestion .env found at ${ENV_FILE}; skipping ADB load."
  exit 0
fi

set +u
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
set -u

if [[ ! -f "${WALLET_DIR}/tnsnames.ora" ]]; then
  log "ADB wallet is not available at ${WALLET_DIR}; skipping ADB load."
  exit 0
fi

if [[ -z "${DBPASSWORD:-}" ]]; then
  log "DBPASSWORD is not set; skipping ADB load."
  exit 0
fi

if [[ -z "${DBCONNECTION:-}" && -z "${SERVICE_NAME:-}" ]]; then
  log "No ADB connection string or service name is configured; skipping ADB load."
  exit 0
fi

if ! command -v sql >/dev/null 2>&1; then
  log "SQLcl command 'sql' is not installed; skipping ADB load."
  exit 0
fi

WORK_DIR="$(mktemp -d /tmp/peakgear-adb-load.XXXXXX)"
chmod 700 "${WORK_DIR}"
SQLCL_WALLET_DIR="${WORK_DIR}/wallet"
mkdir -p "${SQLCL_WALLET_DIR}"
cp -R "${WALLET_DIR}/." "${SQLCL_WALLET_DIR}/"
generate_warehouse_sql

if [[ -f "${SQLCL_WALLET_DIR}/ojdbc.properties" ]]; then
  escaped_wallet_dir="$(printf '%s' "${SQLCL_WALLET_DIR}" | sed 's/[\/&]/\\&/g')"
  sed -i "s#/wallet#${escaped_wallet_dir}#g" "${SQLCL_WALLET_DIR}/ojdbc.properties"
fi

export TNS_ADMIN="${SQLCL_WALLET_DIR}"

run_sql() {
  local script_file="$1"
  local output_file="${WORK_DIR}/$(basename "${script_file}").out"

  if ! sql -L /nolog @"${script_file}" > "${output_file}" 2>&1; then
    cat "${output_file}"
    log "SQLcl exited with a non-zero status while running ${script_file}."
    return 1
  fi

  cat "${output_file}"

  if grep -Eiq 'Connection[[:space:]]+[Ff]ailed|Error report -[[:space:]]*Connection failed|SP2-0640:[[:space:]]*Not connected' "${output_file}"; then
    log "SQLcl could not establish a database connection while running ${script_file}."
    return 1
  fi
}

APP_SCHEMA="PG"
APP_PASSWORD="${ADB_STREAM_SCHEMA_PASSWORD:-${DBPASSWORD}}"
CONNECT_PASSWORD="$(sql_password "${DBPASSWORD}")"
SCHEMA_PASSWORD="$(sql_password "${APP_PASSWORD}")"
CONNECT_TARGET="${SERVICE_NAME:-}"

if [[ -n "${CONNECT_TARGET}" ]] && ! grep -Eiq "^[[:space:]]*${CONNECT_TARGET}[[:space:]]*=" "${SQLCL_WALLET_DIR}/tnsnames.ora"; then
  CONNECT_TARGET=""
fi

if [[ -z "${CONNECT_TARGET}" ]]; then
  CONNECT_TARGET="$(awk 'tolower($0) ~ /^[[:space:]]*[a-z0-9_]+_high[[:space:]]*=/ {
    gsub(/[[:space:]=]/, "", $1);
    print $1;
    exit;
  }' "${SQLCL_WALLET_DIR}/tnsnames.ora")"
fi

if [[ -z "${CONNECT_TARGET}" ]]; then
  CONNECT_TARGET="${DBCONNECTION}"
fi

if [[ -z "${CONNECT_TARGET}" ]]; then
  log "Could not resolve an ADB SQLcl connect target; skipping ADB load."
  exit 0
fi

log "Starting one-time ADB SQLcl bootstrap for schema ${APP_SCHEMA}."
log "Using wallet directory ${WALLET_DIR}."
log "Using SQLcl wallet copy ${SQLCL_WALLET_DIR}."

awk_password="$(printf '%s' "${APP_PASSWORD}" | sed 's/[\\&]/\\&/g; s/"/""/g')"
awk -v pass="${awk_password}" '
  {
    sub(/CREATE USER "PG" IDENTIFIED BY "[^"]*"/, "CREATE USER \"PG\" IDENTIFIED BY \"" pass "\"");
    print;
  }
' "${INGESTION_DIR}/db/data/create_user_pg.sql" > "${WORK_DIR}/create_user_pg.sql"

preprocess_schema() {
  local source_file="$1"
  local target_file="$2"
  sed -E 's/\)[[:space:]]+INMEMORY[[:space:]]+MEMCOMPRESS[[:space:]]+FOR[[:space:]]+QUERY[[:space:]]+HIGH/)/g' \
    "${source_file}" > "${target_file}"
}

preprocess_schema "${INGESTION_DIR}/db/schema/01_tables.sql" "${WORK_DIR}/01_tables.sql"
preprocess_schema "${INGESTION_DIR}/db/schema/02_json_collections.sql" "${WORK_DIR}/02_json_collections.sql"
preprocess_schema "${INGESTION_DIR}/db/schema/03_graph.sql" "${WORK_DIR}/03_graph.sql"
preprocess_schema "${INGESTION_DIR}/db/schema/04_vector.sql" "${WORK_DIR}/04_vector.sql"
preprocess_schema "${INGESTION_DIR}/db/schema/05_spatial.sql" "${WORK_DIR}/05_spatial.sql"
preprocess_schema "${INGESTION_DIR}/db/schema/10_fraud_graph.sql" "${WORK_DIR}/10_fraud_graph.sql"

cat > "${WORK_DIR}/admin.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE
CONNECT ADMIN/"${CONNECT_PASSWORD}"@"${CONNECT_TARGET}"

PROMPT Resetting ${APP_SCHEMA} user in ADB...
DECLARE
  v_exists NUMBER := 0;
  v_dropped BOOLEAN := FALSE;

  PROCEDURE kill_app_sessions IS
  BEGIN
    FOR session_row IN (
      SELECT sid, serial#, inst_id
      FROM gv\$session
      WHERE username = '${APP_SCHEMA}'
    ) LOOP
      BEGIN
        EXECUTE IMMEDIATE
          'ALTER SYSTEM KILL SESSION ''' ||
          session_row.sid || ',' || session_row.serial# || ',@' || session_row.inst_id ||
          ''' IMMEDIATE';
      EXCEPTION
        WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END;
BEGIN
  SELECT COUNT(*) INTO v_exists
  FROM dba_users
  WHERE username = '${APP_SCHEMA}';

  IF v_exists > 0 THEN
    FOR attempt IN 1..12 LOOP
      kill_app_sessions;
      BEGIN
        EXECUTE IMMEDIATE 'DROP USER "${APP_SCHEMA}" CASCADE';
        v_dropped := TRUE;
        EXIT;
      EXCEPTION
        WHEN OTHERS THEN
          IF SQLCODE = -1918 THEN
            v_dropped := TRUE;
            EXIT;
          ELSIF SQLCODE = -1940 AND attempt < 12 THEN
            DBMS_SESSION.SLEEP(5);
          ELSE
            RAISE;
          END IF;
      END;
    END LOOP;

    IF NOT v_dropped THEN
      RAISE_APPLICATION_ERROR(-20001, 'Could not drop ${APP_SCHEMA} after killing active sessions.');
    END IF;
  END IF;
END;
/

@"${WORK_DIR}/create_user_pg.sql"
EXIT
SQL

run_sql "${WORK_DIR}/admin.sql"

PG_AI_ENABLED="${PG_AI_PROFILE_AUTO_SETUP:-true}"
OCI_AUTH="${OCI_AUTH_TYPE:-api_key}"
OCI_REGION_VALUE="${OCI_REGION:-${AI_ENDPOINT_REGION:-${REGION_IDENTIFIER:-}}}"
OCI_COMPARTMENT_VALUE="${OCI_COMPARTMENT_ID:-${COMPARTMENT_OCID:-}}"
OCI_USER_VALUE="${OCI_USER_OCID:-${USER_OCID:-${user:-}}}"
OCI_TENANCY_VALUE="${OCI_TENANCY_OCID:-${TENANCY_OCID:-${tenancy:-}}}"
OCI_FINGERPRINT_VALUE="${OCI_FINGERPRINT:-${PEM_KEY_FINGERPRINT:-${fingerprint:-}}}"
OCI_PRIVATE_KEY_VALUE="${OCI_PRIVATE_KEY:-${PEM_SINGLE_LINE:-${PEM_KEY:-}}}"
OCI_PRIVATE_KEY_VALUE="$(printf '%b' "${OCI_PRIVATE_KEY_VALUE}")"
OCI_PROFILE_NAME="${OCI_AI_PROFILE_NAME:-PG_GENAI_PROFILE}"
OCI_RETURN_AGENT_PROFILE_NAME="${WEBSHOP_RETURN_AGENT_PROFILE_NAME:-PG_RETURN_AGENT_PROFILE}"
OCI_CREDENTIAL_NAME="${OCI_GENAI_CREDENTIAL_NAME:-PG_OCI_GENAI_CRED}"
OCI_MODEL_VALUE="${OCI_GENAI_MODEL:-cohere.command-a-03-2025}"
OCI_EMBEDDING_MODEL_VALUE="${OCI_GENAI_EMBEDDING_MODEL:-cohere.embed-v4.0}"
OCI_ENDPOINT_HOST=""
if [[ -n "${OCI_REGION_VALUE}" ]]; then
  OCI_ENDPOINT_HOST="inference.generativeai.${OCI_REGION_VALUE}.oci.oraclecloud.com"
fi

PROFILE_SQL=""
if is_enabled "${PG_AI_ENABLED}" && [[ "${OCI_AUTH,,}" == "api_key" ]]; then
  missing=()
  [[ -z "${OCI_REGION_VALUE}" ]] && missing+=("OCI_REGION")
  [[ -z "${OCI_COMPARTMENT_VALUE}" ]] && missing+=("OCI_COMPARTMENT_ID")
  [[ -z "${OCI_USER_VALUE}" ]] && missing+=("OCI_USER_OCID")
  [[ -z "${OCI_TENANCY_VALUE}" ]] && missing+=("OCI_TENANCY_OCID")
  [[ -z "${OCI_FINGERPRINT_VALUE}" ]] && missing+=("OCI_FINGERPRINT")
  [[ -z "${OCI_PRIVATE_KEY_VALUE}" ]] && missing+=("OCI_PRIVATE_KEY")

  if [[ ${#missing[@]} -eq 0 ]]; then
    PROFILE_ATTRIBUTES="{\"provider\":\"oci\",\"credential_name\":\"${OCI_CREDENTIAL_NAME}\",\"comments\":true,\"oci_compartment_id\":\"${OCI_COMPARTMENT_VALUE}\",\"region\":\"${OCI_REGION_VALUE}\",\"model\":\"${OCI_MODEL_VALUE}\",\"embedding_model\":\"${OCI_EMBEDDING_MODEL_VALUE}\",\"oci_apiformat\":\"COHERE\",\"temperature\":0,\"object_list\":[{\"owner\":\"${APP_SCHEMA}\"}]}"
    RETURN_AGENT_PROFILE_ATTRIBUTES="{\"provider\":\"oci\",\"credential_name\":\"${OCI_CREDENTIAL_NAME}\",\"comments\":true,\"oci_compartment_id\":\"${OCI_COMPARTMENT_VALUE}\",\"region\":\"${OCI_REGION_VALUE}\",\"model\":\"${OCI_MODEL_VALUE}\",\"oci_apiformat\":\"COHERE\",\"temperature\":0,\"object_list\":[{\"owner\":\"${APP_SCHEMA}\",\"name\":\"DIM_PRODUCT\"},{\"owner\":\"${APP_SCHEMA}\",\"name\":\"PRODUCT_MANUALS_SOURCE\"},{\"owner\":\"${APP_SCHEMA}\",\"name\":\"CUSTOMER_ORDER_STATUS\"}]}"
    cat > "${WORK_DIR}/admin_ai.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER SQLERROR CONTINUE
CONNECT ADMIN/"${CONNECT_PASSWORD}"@"${CONNECT_TARGET}"
DECLARE
  PROCEDURE grant_package(p_package_name VARCHAR2) IS
    v_count NUMBER := 0;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM (
      SELECT object_name AS package_name
      FROM all_objects
      WHERE object_type = 'PACKAGE'
      UNION
      SELECT synonym_name AS package_name
      FROM all_synonyms
    )
    WHERE package_name = UPPER(p_package_name);

    IF v_count > 0 THEN
      EXECUTE IMMEDIATE 'GRANT EXECUTE ON ' || p_package_name || ' TO "${APP_SCHEMA}"';
      DBMS_OUTPUT.PUT_LINE('Granted ' || p_package_name || ' to ${APP_SCHEMA}.');
    ELSE
      DBMS_OUTPUT.PUT_LINE('Package ' || p_package_name || ' not available; skipping grant.');
    END IF;
  END;
BEGIN
  grant_package('DBMS_CLOUD');
  grant_package('DBMS_CLOUD_AI');
  grant_package('DBMS_CLOUD_AI_AGENT');
  grant_package('DBMS_VECTOR');
END;
/

BEGIN
  EXECUTE IMMEDIATE 'GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO "${APP_SCHEMA}"';
  DBMS_OUTPUT.PUT_LINE('Granted DATA_PUMP_DIR read/write to ${APP_SCHEMA}.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('DATA_PUMP_DIR grant skipped or failed: ' || SQLERRM);
END;
/

BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host       => '$(sql_literal "${OCI_ENDPOINT_HOST}")',
    lower_port => 443,
    upper_port => 443,
    ace        => xs\$ace_type(
      privilege_list => xs\$name_list('http'),
      principal_name => '${APP_SCHEMA}',
      principal_type => xs_acl.ptype_db
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('HTTP ACL grant skipped or already present: ' || SQLERRM);
END;
/

BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '$(sql_literal "${OCI_ENDPOINT_HOST}")',
    ace  => xs\$ace_type(
      privilege_list => xs\$name_list('resolve'),
      principal_name => '${APP_SCHEMA}',
      principal_type => xs_acl.ptype_db
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Resolve ACL grant skipped or already present: ' || SQLERRM);
END;
/
EXIT
SQL

    PRIVATE_KEY_LITERAL="$(q_literal "${OCI_PRIVATE_KEY_VALUE}")"
    PROFILE_ATTRIBUTES_LITERAL="$(q_literal "${PROFILE_ATTRIBUTES}")"
    RETURN_AGENT_PROFILE_ATTRIBUTES_LITERAL="$(q_literal "${RETURN_AGENT_PROFILE_ATTRIBUTES}")"
    PROFILE_SQL=$(cat <<SQL
PROMPT Creating ${APP_SCHEMA} DBMS_CLOUD_AI profile...
WHENEVER SQLERROR CONTINUE
BEGIN
  BEGIN
    DBMS_CLOUD.DROP_CREDENTIAL(credential_name => '$(sql_literal "${OCI_CREDENTIAL_NAME}")');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => '$(sql_literal "${OCI_CREDENTIAL_NAME}")',
    user_ocid       => '$(sql_literal "${OCI_USER_VALUE}")',
    tenancy_ocid    => '$(sql_literal "${OCI_TENANCY_VALUE}")',
    private_key     => ${PRIVATE_KEY_LITERAL},
    fingerprint     => '$(sql_literal "${OCI_FINGERPRINT_VALUE}")'
  );
END;
/

BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE(profile_name => '$(sql_literal "${OCI_PROFILE_NAME}")', force => TRUE);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  DBMS_CLOUD_AI.CREATE_PROFILE(
    profile_name => '$(sql_literal "${OCI_PROFILE_NAME}")',
    attributes   => ${PROFILE_ATTRIBUTES_LITERAL}
  );
  BEGIN
    DBMS_CLOUD_AI.ENABLE_PROFILE('$(sql_literal "${OCI_PROFILE_NAME}")');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
/

PROMPT Creating Ask PeakGear return-agent DBMS_CLOUD_AI profile...
BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE(profile_name => '$(sql_literal "${OCI_RETURN_AGENT_PROFILE_NAME}")', force => TRUE);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  DBMS_CLOUD_AI.CREATE_PROFILE(
    profile_name => '$(sql_literal "${OCI_RETURN_AGENT_PROFILE_NAME}")',
    attributes   => ${RETURN_AGENT_PROFILE_ATTRIBUTES_LITERAL}
  );
  BEGIN
    DBMS_CLOUD_AI.ENABLE_PROFILE('$(sql_literal "${OCI_RETURN_AGENT_PROFILE_NAME}")');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
/

PROMPT Creating Ask PeakGear return-agent Select AI objects...
@"${INGESTION_DIR}/db/schema/14_webshop_agent_tools.sql"
WHENEVER SQLERROR EXIT SQL.SQLCODE
SQL
)
    run_sql "${WORK_DIR}/admin_ai.sql"
  else
    log "Skipping PG AI profile setup; missing ${missing[*]}."
  fi
elif ! is_enabled "${PG_AI_ENABLED}"; then
  log "Skipping PG AI profile setup because PG_AI_PROFILE_AUTO_SETUP is disabled."
else
  log "Skipping PG AI profile setup because OCI_AUTH_TYPE=${OCI_AUTH} is not api_key."
fi

cat > "${WORK_DIR}/pg_bootstrap.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE
CONNECT ${APP_SCHEMA}/"${SCHEMA_PASSWORD}"@"${CONNECT_TARGET}"

PROMPT Creating Bronze, Silver, and app schema objects...
WHENEVER SQLERROR CONTINUE
@"${INGESTION_DIR}/db/schema/10_bronze_streaming_tables.sql"
@"${INGESTION_DIR}/db/schema/11_silver_tables.sql"
@"${WORK_DIR}/01_tables.sql"
@"${WORK_DIR}/02_json_collections.sql"
@"${WORK_DIR}/03_graph.sql"

PROMPT Staging ALL_MINILM_L12_V2 ONNX model for vector search...
DECLARE
  v_count NUMBER := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM user_mining_models
  WHERE model_name = 'ALL_MINILM_L12_V2';

  IF v_count = 0 THEN
    BEGIN
      DBMS_CLOUD.GET_OBJECT(
        credential_name => NULL,
        object_uri      => '$(sql_literal "${ONNX_MODEL_URL}")',
        directory_name  => 'DATA_PUMP_DIR',
        file_name       => '$(sql_literal "${ONNX_MODEL_FILENAME}")'
      );
      DBMS_OUTPUT.PUT_LINE('${ONNX_MODEL_FILENAME} staged in DATA_PUMP_DIR.');
    EXCEPTION
      WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('ALL_MINILM_L12_V2 staging skipped or failed; 04_vector.sql will try existing DATA_PUMP_DIR file: ' || SQLERRM);
    END;
  ELSE
    DBMS_OUTPUT.PUT_LINE('ALL_MINILM_L12_V2 already loaded.');
  END IF;
END;
/

@"${WORK_DIR}/04_vector.sql"
@"${WORK_DIR}/05_spatial.sql"

PROMPT Recreating warehouse gold-data CSV tables...
WHENEVER SQLERROR CONTINUE
@"${WORK_DIR}/warehouse_drop.sql"

WHENEVER SQLERROR EXIT SQL.SQLCODE
@"${WORK_DIR}/warehouse_create.sql"
@"${WORK_DIR}/warehouse_load.sql"

PROMPT Loading PeakGear demo app data...
@"${INGESTION_DIR}/db/data/load_all_data.sql"

PROMPT Loading returns network and fulfillment zone data...
WHENEVER SQLERROR CONTINUE
@"${WORK_DIR}/10_fraud_graph.sql"
WHENEVER SQLERROR EXIT SQL.SQLCODE
@"${INGESTION_DIR}/db/data/load_fraud_graph.sql"
@"${INGESTION_DIR}/db/data/seed_fulfillment_zones.sql"

${PROFILE_SQL}

PROMPT Verifying required ADB demo tables...
DECLARE
  v_count NUMBER;
  v_missing VARCHAR2(32767) := '';

  PROCEDURE check_table(p_table_name VARCHAR2, p_expected_rows NUMBER DEFAULT 1) IS
  BEGIN
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || p_table_name INTO v_count;
    IF p_expected_rows > 0 AND v_count = 0 THEN
      v_missing := v_missing || p_table_name || ' is empty; ';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_missing := v_missing || p_table_name || ' missing or unreadable: ' || SQLERRM || '; ';
  END;
BEGIN
@"${WORK_DIR}/warehouse_check.sql"
  check_table('BRANDS');
  check_table('PRODUCTS');
  check_table('FULFILLMENT_CENTERS');
  check_table('CUSTOMERS');
  check_table('ORDERS');
  check_table('ORDER_ITEMS');
  check_table('INVENTORY');
  check_table('INFLUENCERS');
  check_table('INFLUENCER_CONNECTIONS');
  check_table('BRAND_INFLUENCER_LINKS');
  check_table('SOCIAL_POSTS');
  check_table('POST_PRODUCT_MENTIONS');
  check_table('DEMAND_REGIONS');
  check_table('DEMAND_FORECASTS');
  check_table('SHIPMENTS');
  check_table('APP_USERS');
  check_table('APP_DATASET_STATE');
  check_table('WEBSHOP_PRODUCT_ATTRIBUTES');
  check_table('FULFILLMENT_ZONES');
  check_table('RETURNS_ENTITIES');
  check_table('RETURNS_RELATIONSHIPS');
  check_table('RETURNS_CASES');
  check_table('RETURNS_CASE_ENTITIES');

  IF v_missing IS NOT NULL THEN
    RAISE_APPLICATION_ERROR(-20000, 'ADB demo data verification failed: ' || SUBSTR(v_missing, 1, 3000));
  END IF;
END;
/

EXIT
SQL

run_sql "${WORK_DIR}/pg_bootstrap.sql"

{
  echo "loaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "schema=${APP_SCHEMA}"
  echo "connect_target=${CONNECT_TARGET}"
} > "${MARKER_FILE}"
chmod 600 "${MARKER_FILE}"

log "ADB SQLcl bootstrap completed successfully. Marker written to ${MARKER_FILE}."
