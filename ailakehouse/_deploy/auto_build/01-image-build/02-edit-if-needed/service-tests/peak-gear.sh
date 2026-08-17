#!/usr/bin/env bash
set -Eeuo pipefail

payload="$(curl --noproxy '*' --fail --silent --show-error http://127.0.0.1:8505/api/health)"
jq -e '.status == "healthy" or .status == "ok"' <<< "${payload}" >/dev/null \
  || { echo "[verify:peak-gear] Peak Gear API health is not healthy." >&2; exit 1; }

lakehouse="$(curl --noproxy '*' --fail --silent --show-error http://127.0.0.1:8505/api/lakehouse/auto)"
jq -e '.ok == true and .connected == true' <<< "${lakehouse}" >/dev/null \
  || { echo "[verify:peak-gear] Peak Gear did not confirm its ADB/lakehouse connection." >&2; exit 1; }

# Gravitino exposes the Iceberg REST configuration endpoint; its /iceberg root returns HTTP 500.
curl --noproxy '*' --fail --silent --show-error \
  "http://127.0.0.1:1525/iceberg/v1/config" >/dev/null
[[ -s "${PILOT_ROOT}/ingestion/.adb_load_done" ]] \
  || { echo "[verify:peak-gear] ADB bootstrap marker is missing." >&2; exit 1; }

service_wait_seconds="${PEAK_GEAR_SERVICE_WAIT_SECONDS:-1800}"
[[ "${service_wait_seconds}" =~ ^[1-9][0-9]*$ ]] \
  || { echo "[verify:peak-gear] PEAK_GEAR_SERVICE_WAIT_SECONDS must be a positive integer." >&2; exit 1; }

for unit in peakgear-pg-iceberg.service peakgear-iceberg-seed.service; do
  deadline=$((SECONDS + service_wait_seconds))
  until systemctl --user is-active --quiet "${unit}"; do
    if [[ "${SECONDS}" -ge "${deadline}" ]]; then
      echo "[verify:peak-gear] ${unit} did not complete within ${service_wait_seconds} seconds." >&2
      systemctl --user status "${unit}" --no-pager --full >&2 || true
      exit 1
    fi
    sleep 10
  done
done

for service in db netsuite-db ords ollama privateai goldengate-cdc goldengate-runtime ggsa signal-generator gravitino app runtime-dashboard; do
  container_id="$(podman ps -q --filter "label=com.docker.compose.service=${service}" | head -n 1)"
  if [[ -z "${container_id}" ]]; then
    container_id="$(podman ps -q --filter "label=io.podman.compose.service=${service}" | head -n 1)"
  fi
  [[ -n "${container_id}" ]] \
    || { echo "[verify:peak-gear] Iceberg seeding left Compose service ${service} stopped." >&2; exit 1; }
done

echo "[verify:peak-gear] PASS: application, ADB, Iceberg catalog, Data Transforms, and seed checks passed."
