#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf '[cleanup] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || fail "Run prepare-image.sh as root."
[[ "${1:-}" == "--final" ]] || fail "Refusing to run without --final."

podman_bin="$(command -v podman || true)"
podman_compose_bin="$(command -v podman-compose || true)"
[[ -n "${podman_bin}" ]] || fail "podman is required for final image cleanup."
[[ -n "${podman_compose_bin}" ]] || fail "podman-compose is required for final image cleanup."

# Packer invokes this wrapper with sudo because the source cleanup also removes
# root-owned launch data. The downloaded images and offline volumes, however,
# belong to opc's rootless Podman store. Route only the container commands
# through opc so the preflight validates the store that will be captured.
wrapper_dir="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-cleanup.XXXXXX")"
cleanup_wrappers() {
  rm -rf -- "${wrapper_dir}"
}
trap cleanup_wrappers EXIT

ln -s "${podman_bin}" "${wrapper_dir}/podman-real"
ln -s "${podman_compose_bin}" "${wrapper_dir}/podman-compose-real"

cat > "${wrapper_dir}/podman" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
opc_uid="$(id -u opc)"
real_bin="$(readlink -f -- "$(dirname -- "$0")/podman-real")"
run_rootless_podman() {
  runuser -u opc -- env \
    -u PODMAN_BIN \
    -u PODMAN_COMPOSE_BIN \
    HOME=/home/opc \
    USER=opc \
    LOGNAME=opc \
    XDG_RUNTIME_DIR="/run/user/${opc_uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${opc_uid}/bus" \
    "${real_bin}" "$@"
}

# The installer creates reusable dependency volumes directly so they can be
# populated before Compose starts. Older podman-compose versions do not add
# project labels to those existing volumes. Include only the four exact cache
# names when the LiveStack cleanup asks for volumes by Compose project label.
if [[ "${1:-}" == "volume" && "${2:-}" == "ls" ]]; then
  project=""
  previous=""
  for argument in "$@"; do
    if [[ "${previous}" == "--filter" \
      && "${argument}" == label=io.podman.compose.project=* ]]; then
      project="${argument##*=}"
      break
    fi
    previous="${argument}"
  done

  if [[ -n "${project}" ]]; then
    output="$(run_rootless_podman "$@")"
    printf '%s\n' "${output}" | sed '/^$/d'
    for key in \
      ollama-models \
      app-node-modules \
      frontend-node-modules \
      signal-generator-node-modules; do
      candidate="${project}_${key}"
      if run_rootless_podman volume exists "${candidate}" \
        && ! grep -qxF -- "${candidate}" <<< "${output}"; then
        printf '%s\n' "${candidate}"
      fi
    done
    exit 0
  fi
fi

run_rootless_podman "$@"
EOF

cat > "${wrapper_dir}/podman-compose" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
opc_uid="$(id -u opc)"
real_bin="$(readlink -f -- "$(dirname -- "$0")/podman-compose-real")"
exec runuser -u opc -- env \
  -u PODMAN_BIN \
  -u PODMAN_COMPOSE_BIN \
  HOME=/home/opc \
  USER=opc \
  LOGNAME=opc \
  XDG_RUNTIME_DIR="/run/user/${opc_uid}" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${opc_uid}/bus" \
  "${real_bin}" "$@"
EOF

chmod 0755 "${wrapper_dir}/podman" "${wrapper_dir}/podman-compose"

# The LiveStack source owns its cleanup rules: it removes generated runtime
# configuration while keeping the offline images and artifacts required at boot.
PODMAN_BIN="${wrapper_dir}/podman" \
PODMAN_COMPOSE_BIN="${wrapper_dir}/podman-compose" \
  /home/opc/oci-image-pilot/scripts/prepare-custom-image.sh

# The upstream cleanup runs as root because it removes protected build-time
# material. Recreate the two first-boot writable directories for the opc user;
# otherwise configure-instance.sh cannot unpack the Terraform-staged wallet or
# create application logs when a VM is launched from the captured image.
install -d -m 0700 -o opc -g opc \
  /home/opc/oci-image-pilot/ingestion/wallet \
  /home/opc/oci-image-pilot/ingestion/logs

# The upstream cleanup may leave this first-boot marker owned by root. The
# ingestion tree is bind-mounted by rootless Podman with SELinux relabeling,
# so every retained entry must be writable by the opc owner during relabeling.
wallet_required_marker="/home/opc/oci-image-pilot/ingestion/.oci_wallet_required"
if [[ -e "${wallet_required_marker}" ]]; then
  chown opc:opc "${wallet_required_marker}"
  chmod 0600 "${wallet_required_marker}"
fi

for writable_dir in \
  /home/opc/oci-image-pilot/ingestion/wallet \
  /home/opc/oci-image-pilot/ingestion/logs; do
  [[ "$(stat -c '%U:%G:%a' "${writable_dir}")" == "opc:opc:700" ]] \
    || fail "First-boot writable directory has unsafe ownership or mode: ${writable_dir}"
done
