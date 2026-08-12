#!/bin/bash

ensure_pmsrvr_config() {
  local cfg="${GOLDENGATE_DEPLOYMENT_CONFIG:-/u02/Deployment/etc/conf/deploymentConfiguration.dat}"
  local port="${GOLDENGATE_PMSRVR_PORT:-9015}"
  local tmp
  local id

  if [ ! -f "${cfg}" ]; then
    return 1
  fi

  if jq -e '.pmsrvr.config.network.serviceListeningPort' "${cfg}" >/dev/null 2>&1; then
    return 1
  fi

  id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
  tmp="$(mktemp /tmp/deploymentConfiguration.pmsrvr.XXXXXX)"

  jq --arg id "${id}" --argjson port "${port}" '
    .pmsrvr = (.pmsrvr // {
      "$schema": "ogg:service",
      "config": {},
      "critical": true,
      "enabled": true,
      "status": "restart",
      "locked": false,
      "id": $id
    })
    | .pmsrvr.config = (.pmsrvr.config // {})
    | .pmsrvr.config.network = (.pmsrvr.config.network // {})
    | .pmsrvr.config.network.serviceListeningPort = (.pmsrvr.config.network.serviceListeningPort // $port)
  ' \
    "${cfg}" > "${tmp}"

  cp "${cfg}" "${cfg}.pre-pmsrvr-$(date -u +%Y%m%d%H%M%S)"
  cp "${tmp}" "${cfg}"
  rm -f "${tmp}"
  echo "Ensured GoldenGate Performance Metrics Server network config in ${cfg}"
  return 0
}

wait_for_runtime_health() {
  local deployment="${OGG_DEPLOYMENT:-PeakGearCDC}"
  local url="http://127.0.0.1:8080/services/${deployment}/adminsrvr/v2/config/health"
  local attempts="${GOLDENGATE_RUNTIME_HEALTH_ATTEMPTS:-18}"
  local admin="${OGG_ADMIN:-}"
  local password="${OGG_ADMIN_PWD:-}"

  if [ -z "${admin}" ] || [ -z "${password}" ]; then
    echo "GoldenGate runtime health credentials are not configured." >&2
    return 1
  fi

  for _ in $(seq 1 "${attempts}"); do
    if curl -fsS --max-time 5 -u "${admin}:${password}" "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done

  return 1
}

request_one_time_runtime_restart() {
  local state_dir="${APP_DATA_HOME:-/u02/oggf}"
  local restart_marker="${state_dir}/.runtime-service-restart-requested"

  mkdir -p "${state_dir}"

  if [ -f "${restart_marker}" ]; then
    echo "GoldenGate runtime services are still unavailable after a prior self-restart."
    return 1
  fi

  touch "${restart_marker}"
  echo "GoldenGate runtime services did not become reachable; requesting one container restart."
  exit 75
}

case "${1:-startup}" in
  prestart)
    ensure_pmsrvr_config || true
    ;;
  *)
    ensure_pmsrvr_config || true

    if wait_for_runtime_health; then
      rm -f "${APP_DATA_HOME:-/u02/oggf}/.runtime-service-restart-requested"
    else
      request_one_time_runtime_restart || true
    fi
    ;;
esac
