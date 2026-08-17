#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${OCI_MANUAL_CAPTURE_MODE:-false}" != "true" ]]; then
  exit 0
fi

public_key="${OCI_MANUAL_CAPTURE_SSH_PUBLIC_KEY:-}"
if [[ ! "${public_key}" =~ ^(ssh-(rsa|ed25519)|ecdsa-sha2-[A-Za-z0-9-]+)[[:space:]]+[A-Za-z0-9+/=]+ ]]; then
  printf '[manual-capture] ERROR: OCI_MANUAL_CAPTURE_SSH_PUBLIC_KEY is not a valid OpenSSH public key.\n' >&2
  exit 1
fi

ssh_directory="/home/opc/.ssh"
authorized_keys="${ssh_directory}/authorized_keys"
key_record="/etc/oci-manual-capture-ssh-public-key"
cleanup_script="/usr/local/libexec/oci-manual-capture-remove-ssh-key.sh"
cleanup_unit="/etc/systemd/system/oci-manual-capture-remove-ssh-key.service"

install -d -m 0700 -o opc -g opc "${ssh_directory}"
touch "${authorized_keys}"
chown opc:opc "${authorized_keys}"
chmod 0600 "${authorized_keys}"
if ! grep -Fqx -- "${public_key}" "${authorized_keys}"; then
  printf '%s\n' "${public_key}" >> "${authorized_keys}"
fi

# Preserve Packer's temporary key while provisioning. This file records only
# the user's public key so the shutdown unit removes just that key before image
# capture, never the Packer connection key.
printf '%s\n' "${public_key}" > "${key_record}"
chmod 0600 "${key_record}"

install -d -m 0755 /usr/local/libexec
cat > "${cleanup_script}" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

authorized_keys="/home/opc/.ssh/authorized_keys"
key_record="/etc/oci-manual-capture-ssh-public-key"
cleanup_script="/usr/local/libexec/oci-manual-capture-remove-ssh-key.sh"
cleanup_unit="/etc/systemd/system/oci-manual-capture-remove-ssh-key.service"

if [[ -f "${key_record}" && -f "${authorized_keys}" ]]; then
  temporary_file="$(mktemp "${authorized_keys}.XXXXXX")"
  grep -Fvx -f "${key_record}" "${authorized_keys}" > "${temporary_file}" || true
  chown opc:opc "${temporary_file}"
  chmod 0600 "${temporary_file}"
  mv -f "${temporary_file}" "${authorized_keys}"
fi

rm -f "${key_record}"

# Do not carry this one-time shutdown helper into the captured image. The
# temporary key is removed before capture; a later image VM must keep the SSH
# key supplied through its own OCI metadata on reboot.
rm -f \
  "/etc/systemd/system/shutdown.target.wants/oci-manual-capture-remove-ssh-key.service" \
  "/etc/systemd/system/halt.target.wants/oci-manual-capture-remove-ssh-key.service" \
  "/etc/systemd/system/poweroff.target.wants/oci-manual-capture-remove-ssh-key.service" \
  "/etc/systemd/system/reboot.target.wants/oci-manual-capture-remove-ssh-key.service" \
  "${cleanup_unit}" \
  "${cleanup_script}"
EOF
chmod 0700 "${cleanup_script}"

cat > "${cleanup_unit}" <<'EOF'
[Unit]
Description=Remove the temporary manual-capture SSH key before shutdown
DefaultDependencies=no
Before=shutdown.target halt.target poweroff.target reboot.target
ConditionPathExists=/etc/oci-manual-capture-ssh-public-key

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/oci-manual-capture-remove-ssh-key.sh

[Install]
WantedBy=shutdown.target halt.target poweroff.target reboot.target
EOF

systemctl daemon-reload
systemctl enable oci-manual-capture-remove-ssh-key.service
printf '[manual-capture] Temporary SSH access is ready and will be removed on VM shutdown before image capture.\n'
