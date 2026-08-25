#!/usr/bin/env bash

APPLICATION_WRITABLE_DIRS=(
  "${PILOT_ROOT}/ingestion/wallet"
  "${PILOT_ROOT}/ingestion/logs"
)

cleanup_application_data() {
  local volume
  local -a preserved_volumes=(
    ingestion_ollama-models
    ingestion_app-node-modules
    ingestion_frontend-node-modules
    ingestion_signal-generator-node-modules
  )

  rm -rf \
    "${PILOT_ROOT}/ingestion/.env" \
    "${PILOT_ROOT}/ingestion/.oci" \
    "${PILOT_ROOT}/ingestion/.adb_load_done" \
    "${PILOT_ROOT}/ingestion/cdc/goldengate/cert" \
    "${PILOT_ROOT}/ingestion/logs" \
    "${PILOT_ROOT}/ingestion/ggsa/V1054826-01.zip" \
    "${PILOT_ROOT}/ingestion/gravitino/dist/gravitino-iceberg-rest-server-0.7.0-incubating-SNAPSHOT-bin.zip" \
    /home/opc/.oci \
    /home/opc/.config/containers/auth.json \
    /home/opc/.docker/config.json

  while IFS= read -r volume; do
    [[ "${volume}" == ingestion_* ]] || continue
    if [[ " ${preserved_volumes[*]} " == *" ${volume} "* ]]; then
      continue
    fi
    run_as_opc podman volume rm -f "${volume}" >/dev/null
  done < <(run_as_opc podman volume ls --format '{{.Name}}')

  for volume in "${preserved_volumes[@]}"; do
    run_as_opc podman volume exists "${volume}" \
      || fail "Required offline cache volume is missing: ${volume}"
  done

  install -d -m 0700 -o opc -g opc \
    "${PILOT_ROOT}/ingestion/wallet" \
    "${PILOT_ROOT}/ingestion/logs"
}