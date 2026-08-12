#!/bin/bash
set -e

wallet_source_dir="${GOLDENGATE_WALLET_SOURCE_DIR:-/wallet}"
wallet_deployment_dir="${GOLDENGATE_WALLET_DEPLOYMENT_DIR:-/u02/Deployment/etc}"
cert_data_dir="${APP_DATA_HOME:-/u02/oggf}/certificate"
cert_runtime_dir="${APP_HOME:-/u01/oggf}/certificate"
nginx_cert_dir="/etc/nginx/cert"
service_manager_pid_file="${APP_DATA_HOME:-/u02/oggf}/../ServiceManager/var/run/ServiceManager.pid"
service_manager_run_dir="$(dirname "${service_manager_pid_file}")"
ensure_pmsrvr_script="/usr/local/bin/ensure-goldengate-pmsrvr.sh"

copy_wallet_to_deployment() {
  if [ ! -d "${wallet_deployment_dir}" ] || [ ! -f "${wallet_source_dir}/tnsnames.ora" ] || [ ! -f "${wallet_source_dir}/sqlnet.ora" ]; then
    return 1
  fi

  cp "${wallet_source_dir}/tnsnames.ora" "${wallet_deployment_dir}/tnsnames.ora"
  cp "${wallet_source_dir}/cwallet.sso" "${wallet_deployment_dir}/cwallet.sso" 2>/dev/null || true
  cp "${wallet_source_dir}/ewallet.p12" "${wallet_deployment_dir}/ewallet.p12" 2>/dev/null || true
  cp "${wallet_source_dir}/ewallet.pem" "${wallet_deployment_dir}/ewallet.pem" 2>/dev/null || true
  cp "${wallet_source_dir}/sqlnet.ora" "${wallet_deployment_dir}/sqlnet.ora"
  sed -i "s|DIRECTORY=\"?[^\"]*\"|DIRECTORY=\"${wallet_deployment_dir}\"|g; s|DIRECTORY=?/network/admin|DIRECTORY=${wallet_deployment_dir}|g" "${wallet_deployment_dir}/sqlnet.ora"
}

# These files describe live child processes, not the canonical deployment.
# Clearing them ensures a recreated container starts every enabled service.
rm -f \
  "${service_manager_pid_file}" \
  "${service_manager_run_dir}/topology.dat" \
  "${service_manager_run_dir}/session.dat"

if [ -d "${service_manager_run_dir}" ]; then
  find "${service_manager_run_dir}" -maxdepth 1 -type f -name '*-config.dat' -delete
fi

copy_wallet_to_deployment || true

if [ -x "${ensure_pmsrvr_script}" ]; then
  "${ensure_pmsrvr_script}" prestart || true
fi

(
  for _ in $(seq 1 150); do
    copy_wallet_to_deployment || true
    sleep 2
  done
) &

reset_generated_certs=false

if [ -f "${cert_data_dir}/ca.pem" ] && [ ! -f "${cert_runtime_dir}/ca-key.pem" ]; then
  reset_generated_certs=true
fi

for cert_file in \
  "${cert_data_dir}/server.pem" \
  "${nginx_cert_dir}/ogg.pem"; do
  if [ -f "${cert_file}" ] && ! openssl x509 -in "${cert_file}" -noout >/dev/null 2>&1; then
    reset_generated_certs=true
  fi
done

if [ "${reset_generated_certs}" = "true" ]; then
  rm -f \
    "${cert_data_dir}/ca.conf" \
    "${cert_data_dir}/ca.pem" \
    "${cert_data_dir}/ca.srl" \
    "${cert_data_dir}/extfile.cnf" \
    "${cert_data_dir}/oggfe.csr" \
    "${cert_data_dir}/server.pem" \
    "${cert_data_dir}/server.pem.partial" \
    "${cert_runtime_dir}/ca-key.pem" \
    "${cert_runtime_dir}/server-key.pem" \
    "${nginx_cert_dir}/ogg.pem" \
    "${nginx_cert_dir}/ogg.key"
fi

exec /usr/local/bin/deployment-main.sh
