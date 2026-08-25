#!/usr/bin/env bash

configure_application() {
  local api_key_file="${RUNTIME_DIR}/oci-api-key.pem"
  local wallet_zip="${RUNTIME_DIR}/peakgear-wallet.zip"
  local ingestion_dir="${PILOT_ROOT}/ingestion"

  [[ -s "${wallet_zip}" ]] || fail "Protected Peak Gear ADB wallet was not staged."
  [[ -s "${api_key_file}" ]] || fail "Protected Peak Gear OCI API key was not staged."

  install -d -m 0700 "${ingestion_dir}/wallet" "${ingestion_dir}/.oci"
  find "${ingestion_dir}/wallet" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  unzip -oq "${wallet_zip}" -d "${ingestion_dir}/wallet"
  install -m 0600 "${wallet_zip}" "${ingestion_dir}/wallet/goldengate-studio-wallet.zip"
  find "${ingestion_dir}/wallet" -type f -exec chmod 0600 {} +

  # Gravitino runs as a non-root user in the rootless Podman namespace. The
  # wallet must remain private on the host while that mapped user can read it.
  command -v podman >/dev/null 2>&1 || fail "Podman is required to grant wallet access."
  command -v setfacl >/dev/null 2>&1 || fail "setfacl is required to grant wallet access."
  for container_uid in 54321 10001; do
    podman unshare setfacl -m "u:${container_uid}:rx" "${ingestion_dir}/wallet" \
      || fail "Could not grant wallet directory access for container UID ${container_uid}."
    find "${ingestion_dir}/wallet" -type d \
      -exec podman unshare setfacl -m "u:${container_uid}:rx" {} + \
      || fail "Could not grant wallet directory traversal for container UID ${container_uid}."
    find "${ingestion_dir}/wallet" -type f \
      -exec podman unshare setfacl -m "u:${container_uid}:r" {} + \
      || fail "Could not grant wallet file access for container UID ${container_uid}."
  done

  install -m 0600 "${api_key_file}" "${ingestion_dir}/.oci/oci_api_key.pem"

  cat > "${ingestion_dir}/.oci/config" <<EOF
[DEFAULT]
user=$(config_value user_ocid)
fingerprint=$(config_value pem_key_fingerprint)
tenancy=$(config_value tenancy_ocid)
region=$(config_value region_identifier)
key_file=${ingestion_dir}/.oci/oci_api_key.pem
EOF
  chmod 0600 "${ingestion_dir}/.oci/config"

  export pem_keylocal
  pem_keylocal="$(cat "${api_key_file}")"
  export OCI_CONFIG_FILE="${ingestion_dir}/.oci/config"

  /home/opc/init/setenv.sh
  /home/opc/init/adb-load.sh
  [[ -s "${ingestion_dir}/.adb_load_done" ]] \
    || fail "Peak Gear ADB bootstrap did not create its completion marker."

  unset pem_keylocal
}
