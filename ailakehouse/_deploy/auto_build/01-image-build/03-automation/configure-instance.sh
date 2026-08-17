#!/usr/bin/env bash
set -Eeuo pipefail

PILOT_ROOT="${PILOT_ROOT:-/home/opc/oci-image-pilot}"
OPC_HOME="${OPC_HOME:-/home/opc}"
RUNTIME_DIR="${PILOT_ROOT}/runtime"
STATE_DIR="${PILOT_ROOT}/state"
LOCAL_CONFIG="${PILOT_ROOT}/local/runtime.env"
CONFIGURE_HOOK="${PILOT_ROOT}/hooks/configure-extra.sh"
DASHBOARD_CONFIGURE="${PILOT_ROOT}/dashboard/configure-dashboard.sh"
METADATA_ENDPOINT="${OCI_METADATA_ENDPOINT:-http://169.254.169.254/opc/v2/instance/metadata/}"
METADATA_ATTEMPTS="${OCI_METADATA_ATTEMPTS:-12}"
METADATA_RETRY_DELAY="${OCI_METADATA_RETRY_DELAY:-5}"
METADATA_FILE="$(mktemp)"

log() {
  printf '[configure] %s\n' "$*"
}

fail() {
  printf '[configure] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  rm -f "${METADATA_FILE}"
}

local_value() {
  local key="$1"
  awk -v wanted="${key}" '
    /^[[:space:]]*#/ { next }
    index($0, "=") == 0 { next }
    {
      current = substr($0, 1, index($0, "=") - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", current)
      if (current == wanted) {
        value = substr($0, index($0, "=") + 1)
        sub(/\r$/, "", value)
        print value
        exit
      }
    }
  ' "${LOCAL_CONFIG}"
}

metadata_value() {
  local key="$1"
  jq -r --arg key "${key}" '
    if .[$key] == null then "" else .[$key] | tostring end
  ' "${METADATA_FILE}"
}

config_value() {
  local key="$1"

  if [[ "${config_source}" == "oci" ]]; then
    metadata_value "${key}"
  else
    local_value "${key}"
  fi
}

fetch_metadata() {
  local attempt

  for ((attempt = 1; attempt <= METADATA_ATTEMPTS; attempt++)); do
    if curl \
      --noproxy '*' \
      --fail \
      --silent \
      --show-error \
      --connect-timeout 2 \
      --max-time 8 \
      -H "Authorization: Bearer Oracle" \
      "${METADATA_ENDPOINT}" \
      -o "${METADATA_FILE}" 2>/dev/null \
      && jq -e 'type == "object"' "${METADATA_FILE}" >/dev/null 2>&1; then
      chmod 0600 "${METADATA_FILE}"
      return 0
    fi
    sleep "${METADATA_RETRY_DELAY}"
  done

  return 1
}

safe_text() {
  local label="$1"
  local value="$2"

  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
    fail "${label} cannot contain a newline."
  fi
}

safe_password() {
  local label="$1"
  local value="$2"

  [[ "${value}" =~ ^[A-Za-z0-9_-]{8,64}$ ]] \
    || fail "${label} must be 8-64 characters using letters, numbers, underscores, or hyphens."
}

oracle_password() {
  local label="$1"
  local value="$2"

  safe_password "${label}" "${value}"
  [[ "${value}" =~ [A-Z] ]] || fail "${label} must contain an uppercase letter."
  [[ "${value}" =~ [a-z] ]] || fail "${label} must contain a lowercase letter."
  [[ "${value}" =~ [0-9] ]] || fail "${label} must contain a number."
}

trap cleanup EXIT

[[ "${METADATA_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]] \
  || fail "OCI_METADATA_ATTEMPTS must be a positive integer."
[[ "${METADATA_RETRY_DELAY}" =~ ^[0-9]+$ ]] \
  || fail "OCI_METADATA_RETRY_DELAY must be a non-negative integer."

install -d -m 0700 "${RUNTIME_DIR}" "${STATE_DIR}"

requested_mode="${CONFIG_MODE:-auto}"
local_mode=""
if [[ -f "${LOCAL_CONFIG}" ]]; then
  local_mode="$(local_value CONFIG_MODE)"
fi

case "${requested_mode}" in
  local)
    [[ -f "${LOCAL_CONFIG}" ]] || fail "CONFIG_MODE=local requires ${LOCAL_CONFIG}."
    config_source="local"
    ;;
  oci)
    fetch_metadata || fail "OCI metadata is not available."
    config_source="oci"
    ;;
  auto)
    if [[ "${local_mode}" == "local" ]]; then
      config_source="local"
    elif fetch_metadata; then
      config_source="oci"
    else
      fail "OCI metadata is unavailable and no explicit local configuration exists."
    fi
    ;;
  *)
    fail "CONFIG_MODE must be auto, oci, or local."
    ;;
esac

umask 077
if [[ -f "${CONFIGURE_HOOK}" ]]; then
  # shellcheck source=/dev/null
  source "${CONFIGURE_HOOK}"
  declare -F configure_application >/dev/null \
    || fail "${CONFIGURE_HOOK} must define configure_application."
  configure_application
else
  log "No optional application configuration hook was provided"
fi

[[ -f "${DASHBOARD_CONFIGURE}" ]] || fail "Missing shared dashboard configuration: ${DASHBOARD_CONFIGURE}"
# shellcheck source=/dev/null
source "${DASHBOARD_CONFIGURE}"
declare -F configure_dashboard >/dev/null \
  || fail "${DASHBOARD_CONFIGURE} must define configure_dashboard."
configure_dashboard

cat > "${STATE_DIR}/instance-configured" <<EOF
source=${config_source}
configured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 0600 "${STATE_DIR}/instance-configured"

log "Runtime configuration created from ${config_source} values"
