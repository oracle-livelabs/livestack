#!/bin/bash

# Reconcile only the ADB Select AI return-advisor profile and agent objects.
# This intentionally does not reset the PG schema or re-run the full ADB load.
set -euo pipefail

INGESTION_DIR="${INGESTION_DIR:-/home/opc/ingestion}"
ENV_FILE="${ENV_FILE:-${INGESTION_DIR}/.env}"
WALLET_DIR="${WALLET_DIR:-${INGESTION_DIR}/wallet}"
LOG_DIR="${INGESTION_DIR}/logs"
LOG_FILE="${LOG_DIR}/adb-return-agent.log"
WORK_DIR=""

mkdir -p "${LOG_DIR}"
touch "${LOG_FILE}"
chmod 700 "${LOG_DIR}"
chmod 600 "${LOG_FILE}"
exec >> "${LOG_FILE}" 2>&1

log() {
  printf '[adb-return-agent] %s\n' "$*"
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

cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

if [[ ! -r "${ENV_FILE}" ]]; then
  log "Runtime environment file ${ENV_FILE} is missing. Run init/setenv.sh first."
  exit 1
fi
if [[ ! -d "${WALLET_DIR}" ]]; then
  log "ADB wallet directory ${WALLET_DIR} is missing."
  exit 1
fi
if ! command -v sql >/dev/null 2>&1; then
  log "SQLcl (sql) is required but was not found."
  exit 1
fi

# The generated file is trusted local installer state and provides ADB/OCI values.
set -a
source "${ENV_FILE}"
set +a

RETURN_PROFILE="${WEBSHOP_RETURN_AGENT_PROFILE_NAME:-PG_RETURN_AGENT_PROFILE}"
if [[ "${RETURN_PROFILE}" != "PG_RETURN_AGENT_PROFILE" ]]; then
  log "Unsupported return-agent profile ${RETURN_PROFILE}. This setup script creates PG_RETURN_AGENT_PROFILE."
  exit 1
fi

APP_SCHEMA_PASSWORD="${ADB_STREAM_SCHEMA_PASSWORD:-${DBPASSWORD:-}}"
required=(DBPASSWORD OCI_GENAI_CREDENTIAL_NAME OCI_REGION OCI_COMPARTMENT_ID OCI_GENAI_MODEL)
missing=()
for name in "${required[@]}"; do
  [[ -z "${!name:-}" ]] && missing+=("${name}")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  log "Cannot configure return advisor; missing ${missing[*]}."
  exit 1
fi

WORK_DIR="$(mktemp -d /tmp/peakgear-adb-return-agent.XXXXXX)"
chmod 700 "${WORK_DIR}"
SQLCL_WALLET_DIR="${WORK_DIR}/wallet"
mkdir -p "${SQLCL_WALLET_DIR}"
cp -R "${WALLET_DIR}/." "${SQLCL_WALLET_DIR}/"
if [[ -f "${SQLCL_WALLET_DIR}/ojdbc.properties" ]]; then
  escaped_wallet_dir="$(printf '%s' "${SQLCL_WALLET_DIR}" | sed 's/[\\/&]/\\&/g')"
  sed -i "s#/wallet#${escaped_wallet_dir}#g" "${SQLCL_WALLET_DIR}/ojdbc.properties"
fi
export TNS_ADMIN="${SQLCL_WALLET_DIR}"

CONNECT_TARGET="${SERVICE_NAME:-}"
if [[ -n "${CONNECT_TARGET}" ]] && ! grep -Eiq "^[[:space:]]*${CONNECT_TARGET}[[:space:]]*=" "${SQLCL_WALLET_DIR}/tnsnames.ora"; then
  CONNECT_TARGET=""
fi
if [[ -z "${CONNECT_TARGET}" ]]; then
  CONNECT_TARGET="$(awk 'tolower($0) ~ /^[[:space:]]*[a-z0-9_]+_high[[:space:]]*=/ { gsub(/[[:space:]=]/, "", $1); print $1; exit }' "${SQLCL_WALLET_DIR}/tnsnames.ora")"
fi
if [[ -z "${CONNECT_TARGET}" ]]; then
  CONNECT_TARGET="${DBCONNECTION:-}"
fi
if [[ -z "${CONNECT_TARGET}" ]]; then
  log "Could not resolve an ADB SQLcl connect target."
  exit 1
fi

PROFILE_ATTRIBUTES="{\"provider\":\"oci\",\"credential_name\":\"${OCI_GENAI_CREDENTIAL_NAME}\",\"comments\":true,\"oci_compartment_id\":\"${OCI_COMPARTMENT_ID}\",\"region\":\"${OCI_REGION}\",\"model\":\"${OCI_GENAI_MODEL}\",\"oci_apiformat\":\"COHERE\",\"temperature\":0,\"object_list\":[{\"owner\":\"PG\",\"name\":\"DIM_PRODUCT\"},{\"owner\":\"PG\",\"name\":\"PRODUCT_MANUALS_SOURCE\"},{\"owner\":\"PG\",\"name\":\"CUSTOMER_ORDER_STATUS\"}]}"
PROFILE_ATTRIBUTES_LITERAL="$(q_literal "${PROFILE_ATTRIBUTES}")"
SCHEMA_PASSWORD="$(sql_password "${APP_SCHEMA_PASSWORD}")"

cat > "${WORK_DIR}/return-agent.sql" <<SQL
SET ECHO OFF
SET DEFINE OFF
SET SERVEROUTPUT ON
SET SQLBLANKLINES ON
WHENEVER SQLERROR EXIT SQL.SQLCODE
CONNECT PG/"${SCHEMA_PASSWORD}"@"${CONNECT_TARGET}"

DECLARE
  v_credential_count NUMBER := 0;
BEGIN
  SELECT COUNT(*) INTO v_credential_count
  FROM user_credentials
  WHERE credential_name = '$(sql_literal "${OCI_GENAI_CREDENTIAL_NAME}")';
  IF v_credential_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Required OCI GenAI credential is not available in PG. Reconcile PG_GENAI_PROFILE first.');
  END IF;
END;
/

BEGIN
  BEGIN
    DBMS_CLOUD_AI.DROP_PROFILE(profile_name => '${RETURN_PROFILE}', force => TRUE);
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
  DBMS_CLOUD_AI.CREATE_PROFILE(
    profile_name => '${RETURN_PROFILE}',
    attributes   => ${PROFILE_ATTRIBUTES_LITERAL}
  );
  BEGIN
    DBMS_CLOUD_AI.ENABLE_PROFILE('${RETURN_PROFILE}');
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
/

@"${INGESTION_DIR}/db/schema/14_webshop_agent_tools.sql"
EXIT
SQL

log "Reconciling ${RETURN_PROFILE} and RETURN_ADVISOR_TEAM without resetting PG."
if ! sql -L /nolog @"${WORK_DIR}/return-agent.sql"; then
  log "Return-advisor reconciliation failed."
  exit 1
fi
log "Return-advisor reconciliation completed."
