#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_ROOT="${1:-/tmp/oci-image-pilot}"
EDIT_ROOT="${SOURCE_ROOT}/01-edit"
OPTIONAL_ROOT="${SOURCE_ROOT}/02-edit-if-needed"
AUTOMATION_ROOT="${SOURCE_ROOT}/03-automation"
AUTOMATION_DASHBOARD="${AUTOMATION_ROOT}/dashboard"
TARGET_ROOT="/home/opc/oci-image-pilot"
SERVICE_NAME="oci-image-pilot.service"
OPC_UID="$(id -u opc)"
COMBINED_ENDPOINTS="$(mktemp)"

log() {
  printf '[install] %s\n' "$*"
}

fail() {
  printf '[install] ERROR: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '[install] FAILED at line %s (exit %s)\n' "${BASH_LINENO[0]}" "${exit_code}" >&2
  exit "${exit_code}"
}

cleanup() {
  rm -f "${COMBINED_ENDPOINTS}"
  if [[ -d "${TARGET_ROOT}/runtime" ]]; then
    find "${TARGET_ROOT}/runtime" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  fi
}

run_as_opc() {
  runuser -u opc -- env \
    HOME=/home/opc \
    USER=opc \
    LOGNAME=opc \
    XDG_RUNTIME_DIR="/run/user/${OPC_UID}" \
    "$@"
}

require_directory() {
  [[ -d "$1" ]] || fail "Missing required directory: $1"
}

require_file() {
  [[ -f "$1" ]] || fail "Missing required file: $1"
}

trap on_error ERR
trap cleanup EXIT

[[ "${EUID}" -eq 0 ]] || fail "Run install-image.sh as root."

require_directory "${EDIT_ROOT}/ingestion"
require_directory "${EDIT_ROOT}/init"
require_file "${EDIT_ROOT}/prepare-custom-image.sh"
require_file "${EDIT_ROOT}/public-endpoints.json"
require_file "${EDIT_ROOT}/service-catalog.json"
require_directory "${OPTIONAL_ROOT}/hooks"
require_directory "${OPTIONAL_ROOT}/service-tests"
require_file "${OPTIONAL_ROOT}/local-runtime.env.example"
require_file "${AUTOMATION_ROOT}/run-tests.sh"
require_file "${AUTOMATION_ROOT}/configure-instance.sh"
require_file "${AUTOMATION_ROOT}/prepare-image.sh"
require_directory "${AUTOMATION_ROOT}/systemd"
require_directory "${AUTOMATION_DASHBOARD}"
require_file "${AUTOMATION_DASHBOARD}/Containerfile"
require_file "${AUTOMATION_DASHBOARD}/dashboard.compose.yml"
require_file "${AUTOMATION_DASHBOARD}/public-endpoints.json"
require_file "${AUTOMATION_DASHBOARD}/configure-dashboard.sh"

# Packer may transfer sources from a Windows checkout. Normalize every shell
# source before a shebang or a sourced hook can be executed on Oracle Linux.
find "${SOURCE_ROOT}" -type f -name '*.sh' -exec sed -i 's/\r$//' {} +

# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID}" == "ol" && "${VERSION_ID}" == 9* ]] \
  || fail "This image automation requires Oracle Linux 9."

log "Updating Oracle Linux and installing image dependencies"
dnf -y update
dnf -y install oracle-epel-release-el9 dnf-plugins-core
dnf config-manager --enable ol9_developer_EPEL
dnf -y install container-tools podman-compose jq curl firewalld openssl oci-utils

if [[ -x /usr/libexec/oci-growfs ]]; then
  /usr/libexec/oci-growfs -y
fi

log "Configuring public endpoint firewall ports"
systemctl enable --now firewalld
jq -s '{public_endpoints: (map(.public_endpoints) | add)}' \
  "${EDIT_ROOT}/public-endpoints.json" \
  "${AUTOMATION_DASHBOARD}/public-endpoints.json" \
  > "${COMBINED_ENDPOINTS}"
public_ports="$(
  PUBLIC_ENDPOINTS_FILE="${COMBINED_ENDPOINTS}" \
    PILOT_ROOT="${SOURCE_ROOT}" \
    /bin/bash "${AUTOMATION_ROOT}/run-tests.sh" --list-public-ports
)"
mapfile -t endpoint_ports < <(printf '%s\n' "${public_ports}" | sed '/^[[:space:]]*$/d')
for port in "${endpoint_ports[@]}"; do
  firewall-cmd --permanent --zone=public --add-port="${port}/tcp"
done
firewall-cmd --reload

log "Assembling the immutable runtime payload"
rm -rf "${TARGET_ROOT}"
install -d -m 0755 -o opc -g opc \
  "${TARGET_ROOT}" \
  "${TARGET_ROOT}/ingestion" \
  "${TARGET_ROOT}/hooks" \
  "${TARGET_ROOT}/dashboard" \
  "${TARGET_ROOT}/init" \
  "${TARGET_ROOT}/local" \
  "${TARGET_ROOT}/scripts" \
  "${TARGET_ROOT}/systemd" \
  "${TARGET_ROOT}/tests" \
  "${TARGET_ROOT}/tests/service-tests"

cp -a "${EDIT_ROOT}/ingestion/." "${TARGET_ROOT}/ingestion/"
cp -a "${EDIT_ROOT}/init/." "${TARGET_ROOT}/init/"
install -m 0755 "${EDIT_ROOT}/prepare-custom-image.sh" "${TARGET_ROOT}/scripts/prepare-custom-image.sh"

# The upstream LiveStack bootstrap intentionally uses these stable paths.
# Keep its source authoritative while the image payload remains under PILOT_ROOT.
rm -rf /home/opc/ingestion /home/opc/init
ln -s "${TARGET_ROOT}/ingestion" /home/opc/ingestion
ln -s "${TARGET_ROOT}/init" /home/opc/init
install -m 0644 "${COMBINED_ENDPOINTS}" "${TARGET_ROOT}/tests/public-endpoints.json"
install -m 0644 "${EDIT_ROOT}/service-catalog.json" "${TARGET_ROOT}/dashboard/service-catalog.json"
install -m 0644 "${AUTOMATION_DASHBOARD}/dashboard.compose.yml" "${TARGET_ROOT}/ingestion/dashboard.compose.yml"
install -m 0644 "${AUTOMATION_DASHBOARD}/Containerfile" "${TARGET_ROOT}/dashboard/Containerfile"
install -m 0644 "${AUTOMATION_DASHBOARD}/dashboard.py" "${TARGET_ROOT}/dashboard/dashboard.py"
install -m 0644 "${AUTOMATION_DASHBOARD}/index.html" "${TARGET_ROOT}/dashboard/index.html"
install -m 0644 "${AUTOMATION_DASHBOARD}/styles.css" "${TARGET_ROOT}/dashboard/styles.css"
install -m 0644 "${AUTOMATION_DASHBOARD}/app.js" "${TARGET_ROOT}/dashboard/app.js"
install -m 0755 "${AUTOMATION_DASHBOARD}/configure-dashboard.sh" "${TARGET_ROOT}/dashboard/configure-dashboard.sh"
install -m 0644 "${OPTIONAL_ROOT}/local-runtime.env.example" "${TARGET_ROOT}/local/runtime.env.example"
cp -a "${OPTIONAL_ROOT}/hooks/." "${TARGET_ROOT}/hooks/"
cp -a "${OPTIONAL_ROOT}/service-tests/." "${TARGET_ROOT}/tests/service-tests/"
install -m 0755 "${AUTOMATION_ROOT}/run-tests.sh" "${TARGET_ROOT}/tests/run-tests.sh"
install -m 0755 "${AUTOMATION_ROOT}/configure-instance.sh" "${TARGET_ROOT}/scripts/configure-instance.sh"
install -m 0755 "${AUTOMATION_ROOT}/prepare-image.sh" "${TARGET_ROOT}/scripts/prepare-image.sh"
cp -a "${AUTOMATION_ROOT}/systemd/." "${TARGET_ROOT}/systemd/"

install -d -m 0700 -o opc -g opc \
  "${TARGET_ROOT}/runtime" \
  "${TARGET_ROOT}/state" \
  "${TARGET_ROOT}/data"
install -d -m 0700 -o opc -g opc /home/opc/.config
install -d -m 0755 -o opc -g opc \
  /home/opc/.config/systemd \
  /home/opc/.config/systemd/user

chown -R opc:opc "${TARGET_ROOT}" /home/opc/.config
find "${TARGET_ROOT}/hooks" -maxdepth 1 -type f -name '*.sh' -exec chmod 0755 {} +
find "${TARGET_ROOT}/tests/service-tests" -maxdepth 1 -type f -name '*.sh' -exec chmod 0755 {} +
find "${TARGET_ROOT}/ingestion" -type f -name '*.sh' -exec chmod 0755 {} +
find "${TARGET_ROOT}/init" -type f -name '*.sh' -exec chmod 0755 {} +

install -m 0644 -o opc -g opc \
  "${TARGET_ROOT}/systemd/${SERVICE_NAME}" \
  "/home/opc/.config/systemd/user/${SERVICE_NAME}"

log "Enabling rootless Podman at boot"
loginctl enable-linger opc
systemctl start "user@${OPC_UID}.service"
setsebool -P container_manage_cgroup on
run_as_opc systemctl --user daemon-reload
run_as_opc systemctl --user enable "${SERVICE_NAME}"

install_hook="${TARGET_ROOT}/hooks/install-extra.sh"
if [[ -f "${install_hook}" ]]; then
  # shellcheck source=/dev/null
  source "${install_hook}"
  declare -F install_application >/dev/null \
    || fail "${install_hook} must define install_application."
  install_application
else
  log "No optional application installation hook was provided"
fi

log "Building the reserved runtime dashboard"
run_as_opc podman build \
  --pull \
  --tag localhost/oci-runtime-dashboard:1.0 \
  --file "${TARGET_ROOT}/dashboard/Containerfile" \
  "${TARGET_ROOT}/dashboard"

build_dashboard_password="$(openssl rand -hex 16)"
cat > "${TARGET_ROOT}/runtime/dashboard.env" <<EOF
DASHBOARD_TITLE=OCI Runtime Build Check
DASHBOARD_USERNAME=opc
DASHBOARD_PASSWORD=${build_dashboard_password}
DASHBOARD_PORT=32180
EOF
unset build_dashboard_password
install -m 0600 "${TARGET_ROOT}/dashboard/service-catalog.json" \
  "${TARGET_ROOT}/runtime/dashboard-services.json"
chown opc:opc \
  "${TARGET_ROOT}/runtime/dashboard.env" \
  "${TARGET_ROOT}/runtime/dashboard-services.json"
chmod 0600 \
  "${TARGET_ROOT}/runtime/dashboard.env" \
  "${TARGET_ROOT}/runtime/dashboard-services.json"

run_as_opc /bin/bash -c \
  "cd '${TARGET_ROOT}/ingestion' && podman-compose -f compose.yml -f dashboard.compose.yml config >/dev/null"

cleanup
remaining_containers="$(run_as_opc podman ps -aq)"
[[ -z "${remaining_containers}" ]] \
  || fail "No containers may remain in the captured image."

log "Image payload installed; the runtime service is enabled but not started"
