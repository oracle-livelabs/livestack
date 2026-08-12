#!/bin/bash
set -euo pipefail

GOLDENGATE_SERVICE_URL="${GOLDENGATE_SERVICE_URL:-https://goldengate-cdc}"
GOLDENGATE_ADMIN_USER="${GOLDENGATE_ADMIN_USER:-oggadmin}"
GOLDENGATE_ADMIN_PASSWORD="${GOLDENGATE_ADMIN_PASSWORD:-LiveStack1!}"
GOLDENGATE_DEPLOYMENT="${GOLDENGATE_DEPLOYMENT:-PeakGearCDC}"
GOLDENGATE_EXTRACT_NAME="${GOLDENGATE_EXTRACT_NAME:-ENSCDC}"
GOLDENGATE_REPLICAT_NAME="${GOLDENGATE_REPLICAT_NAME:-RNSCDC}"
GOLDENGATE_TRAIL_NAME="${GOLDENGATE_TRAIL_NAME:-nt}"
GOLDENGATE_SOURCE_ALIAS="${GOLDENGATE_SOURCE_ALIAS:-netsuite_src}"
GOLDENGATE_TARGET_ALIAS="${GOLDENGATE_TARGET_ALIAS:-adb_pg}"
GOLDENGATE_TARGET_SCHEMA="${GOLDENGATE_TARGET_SCHEMA:-PG}"
NETSUITE_DB_CONNECT_STRING="${NETSUITE_DB_CONNECT_STRING:-netsuite-db:1521/FREEPDB1}"
GOLDENGATE_SOURCE_USER="${GOLDENGATE_SOURCE_USER:-GGADMIN}"
GOLDENGATE_SOURCE_PASSWORD="${GOLDENGATE_SOURCE_PASSWORD:-peakgear}"
ADB_STREAM_SCHEMA_USER="${ADB_STREAM_SCHEMA_USER:-PG}"
ADB_STREAM_SCHEMA_PASSWORD="${ADB_STREAM_SCHEMA_PASSWORD:-}"
ADB_SERVICE_NAME="${ADB_SERVICE_NAME:-}"
TNS_ADMIN="${TNS_ADMIN:-/wallet}"

log() {
  printf '[goldengate-cdc-setup] %s\n' "$*"
}

if [ -z "${ADB_SERVICE_NAME}" ]; then
  log "ADB_SERVICE_NAME is not set; cannot configure the GoldenGate target alias yet"
  exit 1
fi

if [ -z "${ADB_STREAM_SCHEMA_PASSWORD}" ]; then
  log "ADB_STREAM_SCHEMA_PASSWORD is not set; cannot configure the GoldenGate target alias yet"
  exit 1
fi

if [ ! -s "${TNS_ADMIN}/tnsnames.ora" ]; then
  log "ADB wallet is not mounted at ${TNS_ADMIN}; retrying later"
  exit 1
fi

log "Waiting for GoldenGate service at ${GOLDENGATE_SERVICE_URL}"
for attempt in $(seq 1 80); do
  if curl -kfsS "${GOLDENGATE_SERVICE_URL}/" >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = "80" ]; then
    log "GoldenGate service did not become reachable"
    exit 1
  fi
  sleep 10
done

ADMINCLIENT="${ADMINCLIENT:-}"
if [ -z "${ADMINCLIENT}" ] && [ -x /u01/app/ogg/bin/adminclient ]; then
  ADMINCLIENT=/u01/app/ogg/bin/adminclient
fi
if [ -z "${ADMINCLIENT}" ]; then
  ADMINCLIENT="$(command -v adminclient || true)"
fi
if [ -z "${ADMINCLIENT}" ]; then
  log "adminclient was not found in the GoldenGate image"
  exit 1
fi

PARAM_DIR="$(find /u02 -maxdepth 8 -type f -path '*/etc/conf/ogg/GLOBALS' -exec dirname {} \; 2>/dev/null | head -n 1 || true)"
if [ -z "${PARAM_DIR}" ]; then
  PARAM_DIR="$(find /u02 -maxdepth 8 -type d -name dirprm 2>/dev/null | head -n 1 || true)"
fi
if [ -z "${PARAM_DIR}" ]; then
  log "No GoldenGate parameter directory found under /u02; deployment may still be initializing"
  exit 1
fi

mkdir -p "${PARAM_DIR}"
cat > "${PARAM_DIR}/${GOLDENGATE_EXTRACT_NAME}.prm" <<PRM
EXTRACT ${GOLDENGATE_EXTRACT_NAME}
USERIDALIAS ${GOLDENGATE_SOURCE_ALIAS} DOMAIN OracleGoldenGate
EXTTRAIL dirdat/${GOLDENGATE_TRAIL_NAME}
TABLE NETSUITE.CUSTOMERS;
PRM

cat > "${PARAM_DIR}/${GOLDENGATE_REPLICAT_NAME}.prm" <<PRM
REPLICAT ${GOLDENGATE_REPLICAT_NAME}
USERIDALIAS ${GOLDENGATE_TARGET_ALIAS} DOMAIN OracleGoldenGate
ASSUMETARGETDEFS
MAP NETSUITE.CUSTOMERS, TARGET ${GOLDENGATE_TARGET_SCHEMA}.BRONZE_NETSUITE_CUSTOMERS,
  KEYCOLS (SOURCE_CUSTOMER_ID),
  COLMAP (
    USEDEFAULTS,
    CDC_LOADED_AT = @DATENOW()
  );
PRM

OBEY_FILE="/tmp/peakgear-goldengate-cdc.oby"
cat > "${OBEY_FILE}" <<OBEY
ADD CREDENTIALSTORE
ALTER CREDENTIALSTORE ADD USER ${GOLDENGATE_SOURCE_USER}@${NETSUITE_DB_CONNECT_STRING} PASSWORD ${GOLDENGATE_SOURCE_PASSWORD} ALIAS ${GOLDENGATE_SOURCE_ALIAS} DOMAIN OracleGoldenGate
ALTER CREDENTIALSTORE ADD USER ${ADB_STREAM_SCHEMA_USER}@${ADB_SERVICE_NAME} PASSWORD ${ADB_STREAM_SCHEMA_PASSWORD} ALIAS ${GOLDENGATE_TARGET_ALIAS} DOMAIN OracleGoldenGate
DBLOGIN USERIDALIAS ${GOLDENGATE_SOURCE_ALIAS} DOMAIN OracleGoldenGate
REGISTER EXTRACT ${GOLDENGATE_EXTRACT_NAME} DATABASE
ADD EXTRACT ${GOLDENGATE_EXTRACT_NAME}, INTEGRATED TRANLOG, BEGIN NOW
ADD EXTTRAIL dirdat/${GOLDENGATE_TRAIL_NAME}, EXTRACT ${GOLDENGATE_EXTRACT_NAME}, MEGABYTES 10
START EXTRACT ${GOLDENGATE_EXTRACT_NAME}
DBLOGIN USERIDALIAS ${GOLDENGATE_TARGET_ALIAS} DOMAIN OracleGoldenGate
ADD CHECKPOINTTABLE ${GOLDENGATE_TARGET_SCHEMA}.GG_CHECKPOINT
ADD REPLICAT ${GOLDENGATE_REPLICAT_NAME}, INTEGRATED, EXTTRAIL dirdat/${GOLDENGATE_TRAIL_NAME}, CHECKPOINTTABLE ${GOLDENGATE_TARGET_SCHEMA}.GG_CHECKPOINT
START REPLICAT ${GOLDENGATE_REPLICAT_NAME}
INFO EXTRACT ${GOLDENGATE_EXTRACT_NAME}
INFO REPLICAT ${GOLDENGATE_REPLICAT_NAME}
OBEY

log "Configuring ${GOLDENGATE_EXTRACT_NAME} extract and ${GOLDENGATE_REPLICAT_NAME} replicat"
set +e
printf '%s\n' "${GOLDENGATE_ADMIN_PASSWORD}" | "${ADMINCLIENT}" \
  --server-uri "${GOLDENGATE_SERVICE_URL}" \
  --username "${GOLDENGATE_ADMIN_USER}" \
  --deployment "${GOLDENGATE_DEPLOYMENT}" \
  --insecure \
  --obey "${OBEY_FILE}"
status=$?
set -e

if [ "${status}" -ne 0 ]; then
  log "adminclient returned ${status}; setup will retry if the processes are not already configured"
  exit "${status}"
fi

log "GoldenGate CDC configuration completed"
