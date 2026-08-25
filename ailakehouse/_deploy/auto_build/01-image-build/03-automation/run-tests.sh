#!/usr/bin/env bash
set -Eeuo pipefail

PILOT_ROOT="${PILOT_ROOT:-/home/opc/oci-image-pilot}"
SERVICE_NAME="oci-image-pilot.service"
COMPOSE_DIR="${PILOT_ROOT}/ingestion"
ENDPOINT_FILE="${PUBLIC_ENDPOINTS_FILE:-${PILOT_ROOT}/tests/public-endpoints.json}"
SERVICE_TEST_DIR="${PILOT_ROOT}/tests/service-tests"
DASHBOARD_ENV="${PILOT_ROOT}/runtime/dashboard.env"
DASHBOARD_CATALOG="${PILOT_ROOT}/runtime/dashboard-services.json"
WAIT_SECONDS=0
MODE="runtime"
EXPECTED_SOURCE=""
COMPOSE_SERVICES=()

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

usage() {
  cat <<'EOF'
Usage:
  run-tests.sh --build
  run-tests.sh --list-public-ports
  run-tests.sh [--wait [seconds]] [--expect-source oci|local]
EOF
}

fail() {
  printf '[verify] FAILED: %s\n' "$*" >&2
  exit 1
}

compose() {
  (
    cd "${COMPOSE_DIR}"
    podman-compose -f compose.yml -f dashboard.compose.yml "$@"
  )
}

runtime_env_value() {
  local file="$1"
  local key="$2"

  awk -F= -v wanted="${key}" '
    $1 == wanted {
      print substr($0, index($0, "=") + 1)
      exit
    }
  ' "${file}"
}

state_value() {
  local key="$1"
  local state_file="${PILOT_ROOT}/state/instance-configured"

  awk -F= -v wanted="${key}" '
    $1 == wanted {
      print substr($0, index($0, "=") + 1)
      exit
    }
  ' "${state_file}"
}

validate_public_endpoints() {
  [[ -f "${ENDPOINT_FILE}" ]] || fail "Missing ${ENDPOINT_FILE}."

  jq -e '
    type == "object"
    and ((.public_endpoints | type) == "array")
    and all(.public_endpoints[];
      ((.name | type) == "string")
      and ((.name | length) > 0)
      and (.name | test("^[^\\r\\n\\t]+$"))
      and ((.url | type) == "string")
      and (.url | test("^https?://\\{host\\}:[0-9]+/[^\\r\\n\\t ]*$"))
      and ((.url | capture("^https?://\\{host\\}:(?<port>[0-9]+)/").port | tonumber) >= 1)
      and ((.url | capture("^https?://\\{host\\}:(?<port>[0-9]+)/").port | tonumber) <= 65535)
      and ((.expected_status_codes | type) == "array")
      and ((.expected_status_codes | length) > 0)
      and all(.expected_status_codes[];
        (type == "number") and ((floor) == .) and (. >= 100 and . <= 599)
      )
    )
  ' "${ENDPOINT_FILE}" >/dev/null \
    || fail "${ENDPOINT_FILE} has an invalid public endpoint."
}

endpoint_rows() {
  jq -r '
    .public_endpoints[]
    | [
        .name,
        .url,
        (.url | capture("^https?://\\{host\\}:(?<port>[0-9]+)/").port),
        (.expected_status_codes | map(tostring) | join(",")),
        (.insecure_tls // false | tostring)
      ]
    | @tsv
  ' "${ENDPOINT_FILE}"
}

list_public_ports() {
  endpoint_rows | awk -F '\t' '{ print $3 }' | sort -nu
}

load_compose_services() {
  mapfile -t COMPOSE_SERVICES < <(compose config --services)
  [[ "${#COMPOSE_SERVICES[@]}" -gt 0 ]] \
    || fail "Compose does not declare any services."
}

service_is_oneshot() {
  local service="$1"
  jq -e --arg service "${service}" \
    '.services[] | select(.id == $service and .lifecycle == "oneshot")' \
    "${DASHBOARD_CATALOG}" >/dev/null 2>&1
}

container_for_service() {
  local service="$1"
  local container_id

  container_id="$(podman ps -aq --filter "label=com.docker.compose.service=${service}" | head -n 1)"
  if [[ -z "${container_id}" ]]; then
    container_id="$(podman ps -aq --filter "label=io.podman.compose.service=${service}" | head -n 1)"
  fi
  printf '%s' "${container_id}"
}

container_health() {
  podman inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else if and (eq .State.Status "exited") (eq .State.ExitCode 0)}}completed{{else}}{{.State.Status}}{{end}}' \
    "$1" 2>/dev/null || true
}

all_services_ready() {
  local service
  local container_id
  local health

  for service in "${COMPOSE_SERVICES[@]}"; do
    if service_is_oneshot "${service}"; then
      continue
    fi
    container_id="$(container_for_service "${service}")"
    [[ -n "${container_id}" ]] || return 1
    health="$(container_health "${container_id}")"
    [[ "${health}" == "healthy" || "${health}" == "running" ]] || return 1
  done
}

report_compose_services() {
  local service
  local container_id
  local container_name
  local health

  for service in "${COMPOSE_SERVICES[@]}"; do
    if service_is_oneshot "${service}"; then
      printf '[verify] INFO: Compose service %s is one-shot; its result is checked by service tests.\n' \
        "${service}"
      continue
    fi
    container_id="$(container_for_service "${service}")"
    [[ -n "${container_id}" ]] \
      || fail "Compose service ${service} does not have a container."
    health="$(container_health "${container_id}")"
    [[ "${health}" == "healthy" || "${health}" == "running" ]] \
      || fail "Compose service ${service} is ${health:-missing}."
    container_name="$(podman inspect --format '{{.Name}}' "${container_id}" | sed 's#^/##')"
    printf '[verify] PASS: Compose container %s is %s.\n' \
      "${container_name}" "${health}"
  done
}

all_endpoints_ready() {
  local name
  local url_template
  local port
  local success_codes
  local insecure_tls
  local status
  local url
  local -a curl_tls_args

  while IFS=$'\t' read -r name url_template port success_codes insecure_tls; do
    url="${url_template//\{host\}/127.0.0.1}"
    curl_tls_args=()
    if [[ "${insecure_tls}" == "true" ]]; then
      curl_tls_args+=(--insecure)
    fi
    status="$(
      curl \
        --noproxy '*' \
        "${curl_tls_args[@]}" \
        --silent \
        --output /dev/null \
        --write-out '%{http_code}' \
        --connect-timeout 3 \
        --max-time 10 \
        "${url}" 2>/dev/null \
        || true
    )"

    case ",${success_codes}," in
      *",${status},"*) ;;
      *) return 1 ;;
    esac
  done < <(endpoint_rows)
}

runtime_ready() {
  all_services_ready && all_endpoints_ready
}

check_runtime_permissions() {
  local runtime_file
  local mode
  local -a runtime_files

  mapfile -t runtime_files < <(find "${PILOT_ROOT}/runtime" -maxdepth 1 -type f -print)
  if [[ "${#runtime_files[@]}" -eq 0 ]]; then
    echo "[verify] SKIP: the application does not create runtime configuration files."
    return
  fi

  for runtime_file in "${runtime_files[@]}"; do
    mode="$(stat -c '%a' "${runtime_file}")"
    [[ "${mode}" == "600" ]] \
      || fail "Runtime file ${runtime_file} must have mode 600, not ${mode}."
  done
}

run_service_tests() {
  local check
  local -a checks

  [[ -d "${SERVICE_TEST_DIR}" ]] || fail "Missing ${SERVICE_TEST_DIR}."
  mapfile -t checks < <(find "${SERVICE_TEST_DIR}" -maxdepth 1 -type f -name '*.sh' -print | sort)
  if [[ "${#checks[@]}" -eq 0 ]]; then
    echo "[verify] SKIP: no optional service tests are defined."
    return
  fi

  for check in "${checks[@]}"; do
    [[ -x "${check}" ]] || fail "Service test is not executable: ${check}"
    PILOT_ROOT="${PILOT_ROOT}" "${check}" \
      || fail "Service test failed: $(basename "${check}")"
  done
}

verify_dashboard() {
  local dashboard_user
  local dashboard_password
  local unauthenticated_status
  local status_payload

  [[ -f "${DASHBOARD_ENV}" ]] || fail "Missing ${DASHBOARD_ENV}."
  [[ -f "${DASHBOARD_CATALOG}" ]] || fail "Missing ${DASHBOARD_CATALOG}."
  dashboard_user="$(runtime_env_value "${DASHBOARD_ENV}" DASHBOARD_USERNAME)"
  dashboard_password="$(runtime_env_value "${DASHBOARD_ENV}" DASHBOARD_PASSWORD)"
  [[ -n "${dashboard_user}" && -n "${dashboard_password}" ]] \
    || fail "Dashboard authentication values are missing."

  unauthenticated_status="$(
    curl \
      --noproxy '*' \
      --silent \
      --output /dev/null \
      --write-out '%{http_code}' \
      http://127.0.0.1:32180/api/status
  )"
  [[ "${unauthenticated_status}" == "401" ]] \
    || fail "Dashboard status API must reject unauthenticated requests."

  status_payload="$(
    curl \
      --noproxy '*' \
      --fail \
      --silent \
      --show-error \
      --user "${dashboard_user}:${dashboard_password}" \
      http://127.0.0.1:32180/api/status
  )"
  # The dashboard is an operator surface. Its own health and authentication are
  # acceptance criteria; the Compose services, endpoints, and application
  # behavior are verified by their dedicated checks below.
  jq -e '.status == "healthy" and (.services | type) == "array"' \
    <<< "${status_payload}" >/dev/null \
    || fail "Dashboard did not report a healthy authenticated status."

  unset dashboard_password status_payload
  echo "[verify] PASS: dashboard authentication and health status are ready."
}

verify_build_payload() {
  local image
  local check
  local -a compose_images
  local -a checks

  [[ ! -e "${PILOT_ROOT}/local/runtime.env" ]] \
    || fail "The build image contains a local credential file."
  [[ -z "$(find "${PILOT_ROOT}/runtime" -mindepth 1 -print -quit)" ]] \
    || fail "The build image contains runtime configuration."
  [[ -z "$(find "${PILOT_ROOT}/state" -mindepth 1 -print -quit)" ]] \
    || fail "The build image contains instance state."
  [[ ! -e "${PILOT_ROOT}/.vncpwd" && ! -e "${PILOT_ROOT}/.vncpwd.env" ]] \
    || fail "The build image contains a generated login credential."

  mapfile -t compose_images < <(
    compose config \
      | awk '$1 == "image:" { gsub(/^['\''\"]|['\''\"]$/, "", $2); print $2 }' \
      | sort -u
  )
  [[ "${#compose_images[@]}" -gt 0 ]] || fail "Compose does not declare any images."

  for image in "${compose_images[@]}"; do
    podman image exists "${image}" || fail "The preloaded image is missing: ${image}"
  done

  [[ -z "$(podman ps -aq)" ]] || fail "The build image contains containers."

  mapfile -t checks < <(find "${SERVICE_TEST_DIR}" -maxdepth 1 -type f -name '*.sh' -print | sort)
  for check in "${checks[@]}"; do
    [[ -x "${check}" ]] || fail "Service test is not executable: ${check}"
  done

  echo "[verify] PASS: all Compose images, cleanup rules, endpoints, and optional service tests are ready for capture."
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --build)
      MODE="build"
      shift
      ;;
    --list-public-ports)
      MODE="ports"
      shift
      ;;
    --wait)
      WAIT_SECONDS=1800
      if [[ "${2:-}" =~ ^[0-9]+$ ]]; then
        WAIT_SECONDS="$2"
        shift
      fi
      shift
      ;;
    --expect-source)
      [[ "${2:-}" == "oci" || "${2:-}" == "local" ]] || fail "--expect-source must be oci or local."
      EXPECTED_SOURCE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

command -v jq >/dev/null || fail "jq is required."
validate_public_endpoints
if [[ "${MODE}" == "ports" ]]; then
  list_public_ports
  exit 0
fi

command -v podman-compose >/dev/null || fail "podman-compose is required."
[[ -d "${COMPOSE_DIR}" ]] || fail "Missing ${COMPOSE_DIR}."

load_compose_services

systemctl --user is-enabled "${SERVICE_NAME}" >/dev/null \
  || fail "${SERVICE_NAME} is not enabled."

if [[ "${MODE}" == "build" ]]; then
  verify_build_payload
  exit 0
fi

if [[ "${WAIT_SECONDS}" -gt 0 ]]; then
  deadline=$((SECONDS + WAIT_SECONDS))
  printf '[verify] Waiting up to %s seconds for instance configuration, Compose services, and endpoints\n' "${WAIT_SECONDS}"
  until [[ -f "${PILOT_ROOT}/state/instance-configured" ]]; do
    if [[ "${SECONDS}" -ge "${deadline}" ]]; then
      fail "Instance configuration state was not created before the timeout."
    fi
    sleep 10
  done
else
  [[ -f "${PILOT_ROOT}/state/instance-configured" ]] \
    || fail "Instance configuration state is missing."
fi
[[ "$(stat -c '%a' "${PILOT_ROOT}/state/instance-configured")" == "600" ]] \
  || fail "Instance configuration state must have mode 600."

actual_source="$(state_value source)"
[[ "${actual_source}" == "oci" || "${actual_source}" == "local" ]] \
  || fail "Instance configuration source is invalid."
if [[ -n "${EXPECTED_SOURCE}" && "${actual_source}" != "${EXPECTED_SOURCE}" ]]; then
  fail "Expected ${EXPECTED_SOURCE} configuration, but found ${actual_source}."
fi

check_runtime_permissions

if [[ "${WAIT_SECONDS}" -gt 0 ]]; then
  until runtime_ready; do
    if [[ "${SECONDS}" -ge "${deadline}" ]]; then
      compose ps
      fail "The stack did not become healthy before the timeout."
    fi
    sleep 10
  done
elif ! runtime_ready; then
  compose ps
  fail "The stack is not healthy. Run tests/run-tests.sh --wait during first initialization."
fi

report_compose_services

while IFS=$'\t' read -r name url_template port success_codes; do
  printf '[verify] PASS: public endpoint %s matches %s.\n' "${name}" "${url_template}"
done < <(endpoint_rows)

verify_dashboard
run_service_tests

echo "[verify] PASS: all declared services, public endpoints, metadata, permissions, and optional service tests passed."
