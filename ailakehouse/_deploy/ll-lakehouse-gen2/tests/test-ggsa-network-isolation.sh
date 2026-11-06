#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose="${root}/ingestion/compose.yml"
entrypoint="${root}/ingestion/ggsa/container/entrypoint.sh"
installer="${root}/inst.sh"

ggsa_ports="$(sed -n '/^  ggsa:$/,/^  signal-generator:$/p' "${compose}" | sed -n '/^    ports:$/,/^    volumes:$/p')"

grep -qF '127.0.0.1:${GGSA_MYSQL_PORT:-3306}:3306' <<<"${ggsa_ports}"
grep -qF '127.0.0.1:${GGSA_OSA_HTTP_PORT:-19080}:9080' <<<"${ggsa_ports}"
grep -qF '${GGSA_OSA_HTTPS_PORT:-8085}:${GGSA_OSA_HTTPS_PORT:-8085}' <<<"${ggsa_ports}"

if grep -Eq '\$\{GGSA_(KAFKA_PORT|SPARK_[A-Z_]+PORT|SPARK_APP_PORT_RANGE)' <<<"${ggsa_ports}"; then
  echo 'GGSA Kafka or Spark host port is published' >&2
  exit 1
fi

grep -qF 'listeners=INTERNAL://127.0.0.1:${KAFKA_INTERNAL_BROKER_PORT},CONTROLLER://127.0.0.1:${KAFKA_CONTROLLER_PORT}' "${entrypoint}"
grep -qF 'advertised.listeners=INTERNAL://localhost:${KAFKA_INTERNAL_BROKER_PORT}' "${entrypoint}"
grep -qF 'SPARK_MASTER_REST_HOST:-127.0.0.1' "${entrypoint}"

if grep -Eq -- '--add-port=(19080|9092|7077|6066|2808[0-3]|4040-4050)/tcp' "${installer}"; then
  echo 'Installer opens an internal-only GGSA port' >&2
  exit 1
fi

echo 'GGSA network isolation checks passed.'
