#!/usr/bin/env bash
set -euo pipefail

ENV_FILES=(
  "/home/opc/.env"
  "/home/opc/ingestion/.env"
)

DEFAULT_CONNECTION_NAME="pg-iceberg"
DEFAULT_ADB_USERNAME="PG"
DEFAULT_CATALOG_NAME="default"
DEFAULT_CATALOG_PROVIDER="genericrestcatalog"
DEFAULT_CATALOG_TYPE="REST"
DEFAULT_STORAGE_TYPE="OCIObjectStorage"
DEFAULT_GRAVITINO_PATH="/iceberg"
DEFAULT_GRAVITINO_PORT="1525"
DEFAULT_API_PREFIX="/odi/odi-rest/v1"
DEFAULT_MAX_ATTEMPTS="60"
DEFAULT_RETRY_SECONDS="15"
DEFAULT_DEMO_PROJECT_NAME="peakgear"
DEFAULT_API_CONNECT_TIMEOUT="15"
DEFAULT_API_MAX_TIME="60"

WORK_DIR=""
COOKIE_JAR=""
AUTH_COOKIE=""
API_STATUS=""
DT_BASE_URL=""
ICEBERG_REST_URL=""
CURL_AUTH_CONFIG=""
DEMO_RESET_COMPLETE=false

log() {
  printf '%s [data-transforms] %s\n' "$(date -Is)" "$*" >&2
}

is_disabled() {
  [[ "${1:-}" =~ ^([Ff][Aa][Ll][Ss][Ee]|0|[Nn][Oo])$ ]]
}

cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}

load_env() {
  local env_file

  set -a
  set +u
  for env_file in "${ENV_FILES[@]}"; do
    if [[ -r "${env_file}" ]]; then
      # shellcheck disable=SC1090
      source "${env_file}"
    fi
  done
  set -u
  set +a
}

find_python() {
  local candidate

  for candidate in python3.11 python3.9 python3; do
    if command -v "${candidate}" >/dev/null 2>&1 \
      && "${candidate}" -c "import requests" >/dev/null 2>&1; then
      command -v "${candidate}"
      return 0
    fi
  done

  return 1
}

require_tools() {
  if ! command -v curl >/dev/null 2>&1; then
    log "curl is required."
    return 1
  fi

  PYTHON_BIN="$(find_python || true)"
  if [[ -z "${PYTHON_BIN:-}" ]]; then
    log "python3 with the requests package is required."
    return 1
  fi
}

trim_trailing_slash() {
  local value="$1"
  while [[ "${value}" == */ ]]; do
    value="${value%/}"
  done
  printf '%s' "${value}"
}

derive_data_transforms_base_url() {
  "${PYTHON_BIN}" - <<'PY'
import os
import re
import sys
from urllib.parse import urlparse


def clean(value):
    return (value or "").strip().strip('"').strip("'")


for key in ("DATA_TRANSFORMS_BASE_URL", "ODI_BASE_URL", "ODI_URL"):
    value = clean(os.environ.get(key))
    if value:
        print(value.rstrip("/"))
        sys.exit(0)


def base_from_apps_url(value):
    value = clean(value)
    if not value:
        return None
    parsed = urlparse(value)
    host = parsed.netloc or parsed.path.split("/")[0]
    if host.endswith(".oraclecloudapps.com"):
        return f"https://{host}"
    return None


for key in ("ORDSURL", "BASEURL", "ordsurllocal", "baseurllocal"):
    value = base_from_apps_url(os.environ.get(key))
    if value:
        print(value.rstrip("/"))
        sys.exit(0)

connection = clean(os.environ.get("DBCONNECTION")) or clean(os.environ.get("dbconnectionlocal"))
host = None
host_patterns = (
    r"\(\s*host\s*=\s*([^)]+)\)",
    r"host\s*=\s*([a-zA-Z0-9.-]+)",
    r"@//([^/:)\s?]+)",
    r"tcps?://([^/:)\s?]+)",
    r"@([^/:)\s?]+):\d+",
)
for pattern in host_patterns:
    match = re.search(pattern, connection, re.IGNORECASE)
    if match:
        host = clean(match.group(1)).lower()
        break

if not host:
    sys.exit(1)

host_prefix = host.split(".", 1)[0]
service_prefix = None


def normalize_db_name(value):
    value = clean(value).lower()
    if not value:
        return None
    value = value.split("?", 1)[0].split("/", 1)[0].split(".", 1)[0]
    value = re.sub(r"_(high|medium|low|tpurgent|tp)$", "", value)
    if host_prefix and value.startswith(f"{host_prefix}_"):
        value = value[len(host_prefix) + 1:]
    value = re.sub(r"[^a-z0-9_$#-]", "", value)
    return value or None


def normalize_service_name(value):
    value = clean(value).lower()
    if not value:
        return None, None
    value = value.split("?", 1)[0].split("/", 1)[0].split(".", 1)[0]
    value = re.sub(r"_(high|medium|low|tpurgent|tp)$", "", value)
    if host_prefix and host_prefix != "adb" and value.startswith(f"{host_prefix}_"):
        return host_prefix, re.sub(r"[^a-z0-9_$#-]", "", value[len(host_prefix) + 1:]) or None
    if "_" in value:
        prefix, db_name = value.split("_", 1)
        if re.fullmatch(r"[a-z0-9]{8,}", prefix):
            return prefix, re.sub(r"[^a-z0-9_$#-]", "", db_name) or None
    return None, re.sub(r"[^a-z0-9_$#-]", "", value) or None


db_name = None
for key in ("DBNAME", "dbname", "dbnamelocal"):
    db_name = normalize_db_name(os.environ.get(key))
    if db_name:
        break

service_candidates = [
    os.environ.get("SERVICE_NAME"),
    os.environ.get("GRAVITINO_JDBC_SERVICE_NAME"),
]
service_candidates.extend(re.findall(r"service_name\s*=\s*([^)]+)", connection, re.IGNORECASE))
path_match = re.search(r"tcps?://[^/]+/([^?]+)", connection, re.IGNORECASE)
if path_match:
    service_candidates.append(path_match.group(1))
for candidate in service_candidates:
    candidate_prefix, candidate_db_name = normalize_service_name(candidate)
    if candidate_prefix:
        service_prefix = candidate_prefix
    if candidate_db_name and (not db_name or candidate_prefix):
        db_name = candidate_db_name
    if service_prefix and db_name:
        break

match = re.match(r"^([a-z0-9-]+)\.adb\.([a-z0-9-]+)\.oraclecloud\.com$", host)
if match:
    prefix, region = match.groups()
else:
    match = re.match(r"^adb\.([a-z0-9-]+)\.oraclecloud\.com$", host)
    if not match:
        sys.exit(1)
    prefix, region = service_prefix, match.group(1)

if not prefix or not db_name:
    sys.exit(1)
print(f"https://{prefix}-{db_name}.adb.{region}.oraclecloudapps.com")
PY
}

derive_public_host() {
  local value

  for value in "${DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST:-}" "${PUBLIC_HOST:-}" "${PUBLIC_IP:-}" "${public_ip:-}"; do
    if [[ -n "${value}" && ! "${value}" =~ '<html>' && "${value}" != "127.0.0.1" ]]; then
      printf '%s' "${value}"
      return 0
    fi
  done

  value="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || curl -fsS --max-time 5 http://ifconfig.me 2>/dev/null || true)"
  if [[ -n "${value}" && ! "${value}" =~ '<html>' && "${value}" != "127.0.0.1" ]]; then
    printf '%s' "${value}"
    return 0
  fi

  return 1
}

derive_iceberg_rest_url() {
  local host port path

  if [[ -n "${DATA_TRANSFORMS_ICEBERG_REST_URL:-}" ]]; then
    trim_trailing_slash "${DATA_TRANSFORMS_ICEBERG_REST_URL}"
    return 0
  fi

  host="$(derive_public_host)" || return 1
  port="${GRAVITINO_REST_PORT:-${GRAVITINO_HTTP_PORT:-${DEFAULT_GRAVITINO_PORT}}}"
  path="${DATA_TRANSFORMS_ICEBERG_REST_PATH:-${DEFAULT_GRAVITINO_PATH}}"
  [[ "${path}" == /* ]] || path="/${path}"

  printf 'http://%s:%s%s' "${host}" "${port}" "${path}"
}

local_gravitino_ready() {
  local port="${GRAVITINO_REST_PORT:-${GRAVITINO_HTTP_PORT:-${DEFAULT_GRAVITINO_PORT}}}"
  curl -fsS --max-time 5 "http://127.0.0.1:${port}/iceberg/v1/config" >/dev/null
}

login_data_transforms() {
  local login_output

  COOKIE_JAR="${WORK_DIR}/cookies.txt"
  chmod 600 "${COOKIE_JAR}" 2>/dev/null || true

  login_output="$(
    DT_BASE_URL="${DT_BASE_URL}" \
      DATA_TRANSFORMS_LOGIN_USERNAME="${DATA_TRANSFORMS_USERNAME:-${USERNAME:-admin}}" \
      DATA_TRANSFORMS_LOGIN_PASSWORD="${DATA_TRANSFORMS_PASSWORD:-${DBPASSWORD:-}}" \
      COOKIE_JAR="${COOKIE_JAR}" \
      "${PYTHON_BIN}" - <<'PY'
import http.cookiejar
import os
import random
import sys
import time
from urllib.parse import unquote, urljoin

import requests

base_url = os.environ["DT_BASE_URL"].rstrip("/")
username = os.environ["DATA_TRANSFORMS_LOGIN_USERNAME"]
password = os.environ["DATA_TRANSFORMS_LOGIN_PASSWORD"]
cookie_jar_path = os.environ["COOKIE_JAR"]

session = requests.Session()
try:
    login_response = session.get(f"{base_url}/odi/?sso=true", allow_redirects=True, timeout=30)
    csrf = session.cookies.get("csrf_cookie")
    if not csrf:
        print("missing csrf cookie")
        sys.exit(1)

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Request-Id": f"AUTH_{int(time.time() * 1000)}_{random.randint(0, 999999)}",
        "Origin": base_url,
        "Referer": login_response.url,
    }
    authorize_response = session.post(
        f"{base_url}/adb/auth/v1/connect/authorize",
        data={
            "username": username,
            "password": password,
            "csrf_cookie": unquote(csrf),
        },
        headers=headers,
        allow_redirects=False,
        timeout=30,
    )
    redirect_url = authorize_response.headers.get("X-Redirect-Url")
    if not redirect_url:
        message = " ".join(authorize_response.text.split())[:300]
        print(f"authorize failed with HTTP {authorize_response.status_code}: {message}")
        sys.exit(1)

    session.get(urljoin(base_url, redirect_url), allow_redirects=True, timeout=30)
    if not session.cookies.get("Authorization"):
        print("missing authorization cookie")
        sys.exit(1)

    jar = http.cookiejar.MozillaCookieJar(cookie_jar_path)
    for cookie in session.cookies:
        jar.set_cookie(cookie)
    jar.save(ignore_discard=True, ignore_expires=True)
    print("ok")
except Exception as exc:
    print(f"login exception: {exc}")
    sys.exit(1)
PY
  )" || {
    log "Data Transforms login failed: ${login_output}"
    return 1
  }
  chmod 600 "${COOKIE_JAR}"

  AUTH_COOKIE="$(awk '$6 == "Authorization" { value = $7 } END { print value }' "${COOKIE_JAR}")"
  if [[ -z "${AUTH_COOKIE}" ]]; then
    log "Data Transforms login did not return an Authorization cookie."
    return 1
  fi

  CURL_AUTH_CONFIG="${WORK_DIR}/curl-auth.conf"
  printf 'header = "Authorization: Bearer %s"\n' "${AUTH_COOKIE}" > "${CURL_AUTH_CONFIG}"
  chmod 600 "${CURL_AUTH_CONFIG}"
}

api_request() {
  local method="$1"
  local path="$2"
  local data_file="$3"
  local output_file="$4"
  local args

  args=(
    -sS
    --config "${CURL_AUTH_CONFIG}"
    -b "${COOKIE_JAR}"
    -c "${COOKIE_JAR}"
    -o "${output_file}"
    -w "%{http_code}"
    --connect-timeout "${DATA_TRANSFORMS_API_CONNECT_TIMEOUT:-${DEFAULT_API_CONNECT_TIMEOUT}}"
    --max-time "${DATA_TRANSFORMS_API_MAX_TIME:-${DEFAULT_API_MAX_TIME}}"
    -X "${method}"
    -H "Accept: application/json"
  )

  if [[ -n "${data_file}" ]]; then
    args+=(-H "Content-Type: application/json" --data-binary "@${data_file}")
  fi

  API_STATUS="$(curl "${args[@]}" "${DT_BASE_URL}${path}" || true)"
  [[ "${API_STATUS}" =~ ^2 ]]
}

extract_connection_id() {
  local json_file="$1"
  local connection_name="$2"

  "${PYTHON_BIN}" - "${json_file}" "${connection_name}" <<'PY'
import json
import sys

path, target = sys.argv[1], sys.argv[2]
try:
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    sys.exit(1)


def walk(value):
    if isinstance(value, dict):
        if value.get("name") == target:
            identifier = value.get("globalId") or value.get("id") or value.get("objectId")
            if identifier:
                print(identifier)
                return True
        for child in value.values():
            if walk(child):
                return True
    elif isinstance(value, list):
        for child in value:
            if walk(child):
                return True
    return False


sys.exit(0 if walk(payload) else 1)
PY
}

find_connection_id() {
  local connection_name="$1"
  local api_prefix="$2"
  local output_file id endpoint

  for endpoint in "${api_prefix}/dataservers/names" "${api_prefix}/dataservers/techno/APACHE_ICEBERG"; do
    output_file="${WORK_DIR}/$(basename "${endpoint}").json"
    if api_request "GET" "${endpoint}" "" "${output_file}"; then
      id="$(extract_connection_id "${output_file}" "${connection_name}" || true)"
      if [[ -n "${id}" ]]; then
        printf '%s' "${id}"
        return 0
      fi
    fi
  done

  return 1
}

select_adb_connection_id_from_file() {
  local json_file="$1"
  local target_name="${2:-}"
  local database_name="${3:-}"
  local strict_name="${4:-false}"

  "${PYTHON_BIN}" - "${json_file}" "${target_name}" "${database_name}" "${strict_name}" <<'PY'
import json
import re
import sys

path = sys.argv[1]
target_name = sys.argv[2].strip()
database_name = sys.argv[3].strip()
strict_name = sys.argv[4].casefold() == "true"
try:
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception as exc:
    print(f"invalid Oracle connection response: {exc}", file=sys.stderr)
    sys.exit(4)

connections = {}


def walk(value):
    if isinstance(value, dict):
        identifier = value.get("globalId") or value.get("id") or value.get("objectId")
        name = value.get("name")
        technology = str(value.get("technology") or "ORACLE").upper()
        if identifier and isinstance(name, str) and technology == "ORACLE":
            connections[str(identifier)] = value
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)


walk(payload)
def is_platform_wallet(item):
    properties = item.get("connectionProperties") or {}
    jdbc_url = str(properties.get("jdbcUrl") or "")
    # Data Transforms may report isWalletConnection=false for its generated ADB
    # connection, so the provisioned wallet path and ADB alias are authoritative.
    if "tns_admin=/u01/wallet" not in jdbc_url.casefold():
        return False
    if not database_name:
        return True
    alias = re.escape(database_name.casefold())
    return re.search(r"@" + alias + r"_(high|medium|low|tpurgent|tp)(?:\?|$)", jdbc_url.casefold()) is not None


records = list(connections.values())
wallet_records = [item for item in records if is_platform_wallet(item)]

if target_name:
    exact = [item for item in records if item.get("name", "").casefold() == target_name.casefold()]
    exact_wallet = [item for item in exact if is_platform_wallet(item)]
    if len(exact_wallet) == 1:
        item = exact_wallet[0]
        print(item.get("globalId") or item.get("id") or item.get("objectId"))
        sys.exit(0)
    if len(exact_wallet) > 1:
        sys.exit(2)
    if exact:
        sys.exit(5)
    if strict_name:
        sys.exit(3)

if len(wallet_records) == 1:
    item = wallet_records[0]
    print(item.get("globalId") or item.get("id") or item.get("objectId"))
    sys.exit(0)
if len(wallet_records) > 1:
    sys.exit(2)

sys.exit(3)
PY
}

extract_connection_ids_from_file() {
  local json_file="$1"

  "${PYTHON_BIN}" - "${json_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)

identifiers = set()


def walk(value):
    if isinstance(value, dict):
        identifier = value.get("globalId") or value.get("id") or value.get("objectId")
        name = value.get("name")
        technology = str(value.get("technology") or "ORACLE").upper()
        if identifier and isinstance(name, str) and technology == "ORACLE":
            identifiers.add(str(identifier))
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)


walk(payload)
for identifier in sorted(identifiers):
    print(identifier)
PY
}

find_adb_connection_id() {
  local api_prefix="$1"
  local target_name target_name_normalized database_name database_name_normalized strict_name
  local output_file details_file detail_file
  local connection_id candidate_id candidate_ids first selection_status

  database_name="${DBNAME:-${dbname:-}}"
  target_name="${DATA_TRANSFORMS_ADB_CONNECTION_NAME:-${database_name}}"
  strict_name=false
  if [[ -n "${DATA_TRANSFORMS_ADB_CONNECTION_NAME:-}" ]]; then
    target_name_normalized="$(printf '%s' "${target_name}" | tr '[:upper:]' '[:lower:]')"
    database_name_normalized="$(printf '%s' "${database_name}" | tr '[:upper:]' '[:lower:]')"
    if [[ -z "${database_name_normalized}" || "${target_name_normalized}" != "${database_name_normalized}" ]]; then
      strict_name=true
    fi
  fi
  output_file="${WORK_DIR}/oracle-connections.json"

  if ! api_request "GET" "${api_prefix}/dataservers/techno/ORACLE" "" "${output_file}"; then
    log "Could not list Oracle connections; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${output_file}")"
    return 1
  fi

  if ! candidate_ids="$(extract_connection_ids_from_file "${output_file}")"; then
    log "Could not parse the Oracle connection list returned by Data Transforms."
    return 1
  fi

  details_file="${WORK_DIR}/oracle-connection-details.json"
  first=true
  printf '[' > "${details_file}"
  while IFS= read -r candidate_id; do
    [[ -n "${candidate_id}" ]] || continue
    detail_file="${WORK_DIR}/oracle-candidate.json"
    if ! api_request "GET" "${api_prefix}/dataservers/id/${candidate_id}" "" "${detail_file}"; then
      log "Could not inspect Oracle connection ${candidate_id}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${detail_file}")"
      return 1
    fi
    if [[ "${first}" == false ]]; then
      printf ',' >> "${details_file}"
    fi
    cat "${detail_file}" >> "${details_file}"
    first=false
  done <<< "${candidate_ids}"
  printf ']' >> "${details_file}"
  chmod 600 "${details_file}"

  if connection_id="$(select_adb_connection_id_from_file \
    "${details_file}" "${target_name}" "${database_name}" "${strict_name}")"; then
    printf '%s' "${connection_id}"
    return 0
  else
    selection_status=$?
  fi

  case "${selection_status}" in
    2)
      log "Multiple platform wallet-backed Oracle connections match ${target_name:-the provisioned database}; refusing to update any of them."
      ;;
    3)
      log "The platform-created wallet-backed Oracle connection ${target_name:-for the provisioned database} is not available yet."
      ;;
    4)
      log "Could not parse the Oracle connection details returned by Data Transforms."
      ;;
    5)
      log "An Oracle connection named ${target_name} exists, but it is not the platform wallet connection for ${database_name:-the provisioned database}."
      ;;
    *)
      log "Could not identify the platform-created wallet-backed Oracle connection."
      ;;
  esac
  return 1
}

build_adb_connection_payload() {
  local detail_file="$1"
  local output_file="$2"
  local username="$3"
  local password="$4"

  ADB_CONNECTION_USERNAME="${username}" ADB_CONNECTION_PASSWORD="${password}" \
    "${PYTHON_BIN}" - "${detail_file}" "${output_file}" <<'PY'
import base64
import json
import os
import sys

detail_path, output_path = sys.argv[1], sys.argv[2]
with open(detail_path, encoding="utf-8") as handle:
    detail = json.load(handle)

if detail.get("technology") != "ORACLE":
    raise SystemExit("selected connection is not an Oracle connection")

for key in ("name", "connectionProperties"):
    if key not in detail:
        raise SystemExit(f"selected Oracle connection is missing {key}")

identifier = detail.get("globalId") or detail.get("id") or detail.get("objectId")
if not identifier:
    raise SystemExit("selected Oracle connection is missing its identifier")

properties = dict(detail["connectionProperties"])
properties["username"] = os.environ["ADB_CONNECTION_USERNAME"]
properties["password"] = base64.b64encode(
    os.environ["ADB_CONNECTION_PASSWORD"].encode("utf-8")
).decode("ascii")

payload = {
    "name": detail["name"],
    "technology": detail["technology"],
    "globalId": identifier,
    "connectionProperties": properties,
}

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, separators=(",", ":"))
PY
  chmod 600 "${output_file}"
}

verify_adb_connection_detail() {
  local detail_file="$1"
  local expected_username="$2"

  "${PYTHON_BIN}" - "${detail_file}" "${expected_username}" <<'PY'
import json
import sys

path, expected_username = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as handle:
    payload = json.load(handle)

username = str((payload.get("connectionProperties") or {}).get("username") or "")
if username.casefold() != expected_username.casefold():
    sys.exit(1)

schemas = payload.get("schemas")
# Some Data Transforms versions omit schema metadata from an otherwise
# successfully tested Oracle data server. In that response shape, the
# connection username is the only available schema signal.
if not schemas:
    sys.exit(0)

for schema in schemas:
    if not schema.get("default"):
        continue
    schema_names = (
        schema.get("dataSchema"),
        schema.get("workSchema"),
        schema.get("schemaShortName"),
    )
    if any(str(name or "").casefold() == expected_username.casefold() for name in schema_names):
        sys.exit(0)

sys.exit(1)
PY
}

build_connection_payload() {
  local output_file="$1"
  local global_id="${2:-}"

  CONNECTION_GLOBAL_ID="${global_id}" \
    CONNECTION_NAME="${DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME:-${DEFAULT_CONNECTION_NAME}}" \
    ICEBERG_REST_URL="${ICEBERG_REST_URL}" \
    ICEBERG_CATALOG_NAME="${DATA_TRANSFORMS_ICEBERG_CATALOG_NAME:-${DEFAULT_CATALOG_NAME}}" \
    ICEBERG_CATALOG_PROVIDER="${DATA_TRANSFORMS_ICEBERG_CATALOG_PROVIDER:-${DEFAULT_CATALOG_PROVIDER}}" \
    ICEBERG_CATALOG_TYPE="${DATA_TRANSFORMS_ICEBERG_CATALOG_TYPE:-${DEFAULT_CATALOG_TYPE}}" \
    ICEBERG_STORAGE_TYPE="${DATA_TRANSFORMS_ICEBERG_STORAGE_TYPE:-${DEFAULT_STORAGE_TYPE}}" \
    "${PYTHON_BIN}" - "${output_file}" <<'PY'
import json
import os
import sys

payload = {
    "name": os.environ["CONNECTION_NAME"],
    "technology": "APACHE_ICEBERG",
    "connectionProperties": {
        "jdbcDriverName": "com.sunopsis.jdbc.driver.file.FileDriver",
        "jdbcUrl": "jdbc:snps:dbfile",
        "jdbcFetchArraySize": 30,
        "jdbcBatchUpdateSize": 5000,
        "targetDOP": 1,
        "dataServerProperties": {
            "catalogAuth": "None",
            "catalogName": os.environ["ICEBERG_CATALOG_NAME"],
            "catalogProvider": os.environ["ICEBERG_CATALOG_PROVIDER"],
            "catalogType": os.environ["ICEBERG_CATALOG_TYPE"],
            "enableCredentialVending": "false",
            "jdbcBatchUpdateSize": "5000",
            "restUri": os.environ["ICEBERG_REST_URL"],
            "storageType": os.environ["ICEBERG_STORAGE_TYPE"],
        },
    },
}

global_id = os.environ.get("CONNECTION_GLOBAL_ID", "")
if global_id:
    payload["globalId"] = global_id

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump(payload, handle, separators=(",", ":"))
PY
}

extract_first_agent_name() {
  local json_file="$1"

  "${PYTHON_BIN}" - "${json_file}" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    sys.exit(1)

names = []


def walk(value):
    if isinstance(value, dict):
        for key in ("name", "agentName"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                names.append(candidate)
        for child in value.values():
            walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)


walk(payload)
for preferred in ("OracleDIAgent1", "Local Agent"):
    if preferred in names:
        print(preferred)
        sys.exit(0)
if names:
    print(names[0])
    sys.exit(0)
sys.exit(1)
PY
}

select_agent_name() {
  local api_prefix="$1"
  local output_file agent_name

  if [[ -n "${DATA_TRANSFORMS_AGENT_NAME:-${ODI_AGENT_NAME:-}}" ]]; then
    printf '%s' "${DATA_TRANSFORMS_AGENT_NAME:-${ODI_AGENT_NAME:-}}"
    return 0
  fi

  output_file="${WORK_DIR}/agents.json"
  if api_request "GET" "${api_prefix}/agents" "" "${output_file}"; then
    agent_name="$(extract_first_agent_name "${output_file}" || true)"
    if [[ -n "${agent_name}" ]]; then
      printf '%s' "${agent_name}"
      return 0
    fi
  fi

  return 1
}

response_has_failure() {
  local json_file="$1"

  "${PYTHON_BIN}" - "${json_file}" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    text = open(sys.argv[1], encoding="utf-8", errors="ignore").read().lower()
    sys.exit(0 if any(token in text for token in ("failed", "exception", "error")) else 1)


def meaningful(value):
    return value not in (None, "", False, [], {})


def failed(value):
    if isinstance(value, dict):
        for key, child in value.items():
            lower_key = str(key).lower()
            if lower_key in {"error", "exception"} and meaningful(child):
                return True
            if lower_key in {"status", "state"} and str(child).lower() in {"failed", "failure", "error"}:
                return True
            if failed(child):
                return True
    elif isinstance(value, list):
        return any(failed(child) for child in value)
    elif isinstance(value, str):
        lower_value = value.lower()
        return "test connection failed" in lower_value or "exception" in lower_value
    return False


sys.exit(0 if failed(payload) else 1)
PY
}

summarize_response() {
  local file="$1"
  REDACT_DBPASSWORD="${DBPASSWORD:-}" \
    REDACT_DATA_TRANSFORMS_PASSWORD="${DATA_TRANSFORMS_PASSWORD:-}" \
    REDACT_AUTH_COOKIE="${AUTH_COOKIE:-}" \
    "${PYTHON_BIN}" - "${file}" <<'PY'
import base64
import json
import os
import re
import sys

text = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
redacted = "[REDACTED]"


def sensitive_key(key):
    normalized = re.sub(r"[^a-z0-9]", "", str(key).casefold())
    markers = (
        "password",
        "passwd",
        "secret",
        "token",
        "authorization",
        "cookie",
        "credential",
        "privatekey",
        "accesskey",
        "apikey",
    )
    return any(marker in normalized for marker in markers)


def redact_json(value):
    if isinstance(value, dict):
        return {
            key: redacted if sensitive_key(key) else redact_json(child)
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [redact_json(child) for child in value]
    return value


try:
    text = json.dumps(redact_json(json.loads(text)), separators=(",", ":"))
except Exception:
    header_pattern = re.compile(
        r"(?im)\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]+"
    )
    text = header_pattern.sub(lambda match: f"{match.group(1)}: {redacted}", text)

    key_pattern = (
        r"[A-Za-z0-9_.-]*(?:password|passwd|secret|token|authorization|cookie|"
        r"credential|private[_-]?key|access[_-]?key|api[_-]?key)[A-Za-z0-9_.-]*"
    )
    assignment_pattern = re.compile(
        r"(?i)([\"']?" + key_pattern + r"[\"']?\s*[:=]\s*)"
        r"(?:\"[^\"]*\"|'[^']*'|[^\s,;}\]]+)"
    )
    text = assignment_pattern.sub(lambda match: f'{match.group(1)}"{redacted}"', text)

secret_values = set()
for env_name in (
    "REDACT_DBPASSWORD",
    "REDACT_DATA_TRANSFORMS_PASSWORD",
    "REDACT_AUTH_COOKIE",
):
    value = os.environ.get(env_name, "")
    if value:
        secret_values.add(value)
        secret_values.add(base64.b64encode(value.encode("utf-8")).decode("ascii"))

for secret in sorted(secret_values, key=len, reverse=True):
    text = text.replace(secret, redacted)

text = " ".join(text.split())
print(text[:500])
PY
}

upsert_connection() {
  local api_prefix="$1"
  local connection_name="${DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME:-${DEFAULT_CONNECTION_NAME}}"
  local existing_id payload_file response_file connection_id

  existing_id="$(find_connection_id "${connection_name}" "${api_prefix}" || true)"
  payload_file="${WORK_DIR}/dataserver-payload.json"
  response_file="${WORK_DIR}/dataserver-response.json"

  if [[ -n "${existing_id}" ]]; then
    build_connection_payload "${payload_file}" "${existing_id}"
    if ! api_request "PUT" "${api_prefix}/dataservers" "${payload_file}" "${response_file}"; then
      log "Failed to update ${connection_name}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
      return 1
    fi
    connection_id="${existing_id}"
    log "Updated existing Data Transforms connection ${connection_name}."
  else
    build_connection_payload "${payload_file}"
    if ! api_request "POST" "${api_prefix}/dataservers" "${payload_file}" "${response_file}"; then
      log "Failed to create ${connection_name}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
      return 1
    fi
    connection_id="$(extract_connection_id "${response_file}" "${connection_name}" || true)"
    if [[ -z "${connection_id}" ]]; then
      connection_id="$(find_connection_id "${connection_name}" "${api_prefix}" || true)"
    fi
    log "Created Data Transforms connection ${connection_name}."
  fi

  if [[ -z "${connection_id}" ]]; then
    log "Could not resolve the Data Transforms connection ID for ${connection_name}."
    return 1
  fi

  printf '%s' "${connection_id}" > "${WORK_DIR}/connection-id"
}

test_connection() {
  local api_prefix="$1"
  local connection_id="$2"
  local connection_name="$3"
  local agent_name payload_file response_file

  agent_name="$(select_agent_name "${api_prefix}" || true)"
  if [[ -z "${agent_name}" ]]; then
    log "No Data Transforms agent found; cannot verify ${connection_name}."
    return 1
  fi

  payload_file="${WORK_DIR}/test-connection-payload.json"
  response_file="${WORK_DIR}/test-connection-response.json"
  TEST_OBJECT_ID="${connection_id}" TEST_AGENT_NAME="${agent_name}" \
    "${PYTHON_BIN}" - "${payload_file}" <<'PY'
import json
import os
import sys

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump({
        "objectId": os.environ["TEST_OBJECT_ID"],
        "agentName": os.environ["TEST_AGENT_NAME"],
    }, handle, separators=(",", ":"))
PY

  if ! api_request "POST" "${api_prefix}/jobs/test_connection" "${payload_file}" "${response_file}"; then
    log "Connection test failed for ${connection_name}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
    return 1
  fi

  if response_has_failure "${response_file}"; then
    log "Connection test failed for ${connection_name}: $(summarize_response "${response_file}")"
    return 1
  fi

  log "Connection ${connection_name} verified through Data Transforms agent ${agent_name}."
}

extract_project_id() {
  local json_file="$1"
  local project_name="$2"

  "${PYTHON_BIN}" - "${json_file}" "${project_name}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
target = sys.argv[2].casefold()
items = payload if isinstance(payload, list) else [payload]
for item in items:
    if isinstance(item, dict) and str(item.get("name", "")).casefold() == target:
        identifier = item.get("globalId") or item.get("id") or item.get("objectId")
        if identifier:
            print(identifier)
            break
else:
    sys.exit(1)
PY
}

ensure_demo_project() {
  local api_prefix="$1"
  local project_name="${DATA_TRANSFORMS_DEMO_PROJECT_NAME:-${DEFAULT_DEMO_PROJECT_NAME}}"
  local detail_file payload_file response_file project_id

  detail_file="${WORK_DIR}/demo-project.json"
  payload_file="${WORK_DIR}/demo-project-payload.json"
  response_file="${WORK_DIR}/demo-project-response.json"

  if api_request "GET" "${api_prefix}/projects/name/${project_name}" "" "${detail_file}"; then
    project_id="$(extract_project_id "${detail_file}" "${project_name}" || true)"
    if [[ -n "${project_id}" ]]; then
      log "Data Transforms demo project ${project_name} already exists."
      printf '%s' "${project_id}" > "${WORK_DIR}/demo-project-id"
      return 0
    fi
  elif [[ "${API_STATUS}" != "404" ]]; then
    log "Could not look up Data Transforms demo project ${project_name}; HTTP ${API_STATUS}: $(summarize_response "${detail_file}")"
    return 1
  fi

  DEMO_PROJECT_NAME="${project_name}" "${PYTHON_BIN}" - "${payload_file}" <<'PY'
import json
import os
import sys

name = os.environ["DEMO_PROJECT_NAME"]
code = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in name.upper())
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump({"name": name, "code": code}, handle, separators=(",", ":"))
PY

  if ! api_request "POST" "${api_prefix}/projects" "${payload_file}" "${response_file}"; then
    log "Failed to create Data Transforms demo project ${project_name}; HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
    return 1
  fi
  project_id="$(extract_project_id "${response_file}" "${project_name}" || true)"
  if [[ -z "${project_id}" ]]; then
    log "Data Transforms created demo project ${project_name}, but did not return its ID."
    return 1
  fi
  log "Created Data Transforms demo project ${project_name}."
  printf '%s' "${project_id}" > "${WORK_DIR}/demo-project-id"
}

demo_object_exists() {
  local json_file="$1"
  local object_name="$2"
  local project_name="$3"
  local name_key="$4"
  local project_key="$5"

  "${PYTHON_BIN}" - "${json_file}" "${object_name}" "${project_name}" "${name_key}" "${project_key}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
for item in payload if isinstance(payload, list) else []:
    if (str(item.get(sys.argv[4], "")).casefold() == sys.argv[2].casefold()
            and str(item.get(sys.argv[5], "")).casefold() == sys.argv[3].casefold()):
        sys.exit(0)
sys.exit(1)
PY
}

matching_object_ids() {
  local json_file="$1"
  local object_name="$2"
  local name_key="$3"
  local project_name="${4:-}"
  local project_key="${5:-}"

  "${PYTHON_BIN}" - "${json_file}" "${object_name}" "${name_key}" "${project_name}" "${project_key}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    items = json.load(handle)
for item in items if isinstance(items, list) else [items]:
    if not isinstance(item, dict) or str(item.get(sys.argv[3], "")).casefold() != sys.argv[2].casefold():
        continue
    if sys.argv[5] and str(item.get(sys.argv[5], "")).casefold() != sys.argv[4].casefold():
        continue
    identifier = item.get("globalId") or item.get("id") or item.get("objectId")
    if identifier:
        print(identifier)
PY
}

delete_data_transforms_object() {
  local api_prefix="$1"
  local endpoint="$2"
  local response_file="$3"

  if api_request "DELETE" "${api_prefix}${endpoint}" "" "${response_file}"; then
    return 0
  fi
  if [[ "${API_STATUS}" == "404" ]]; then
    return 0
  fi
  log "Failed to remove Data Transforms object at ${endpoint}; HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
  return 1
}

reset_demo_data_transforms() {
  local api_prefix="$1"
  local project_name="${DATA_TRANSFORMS_DEMO_PROJECT_NAME:-${DEFAULT_DEMO_PROJECT_NAME}}"
  local flow_name="${DATA_TRANSFORMS_DEMO_DATA_FLOW_NAME:-dataFlow}"
  local load_name="${DATA_TRANSFORMS_DEMO_DATA_LOAD_NAME:-dataLoad}"
  local connection_name="${DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME:-${DEFAULT_CONNECTION_NAME}}"
  local response_file mappings_file loads_file projects_file models_file adb_file connection_file identifier schema_id connection_id

  response_file="${WORK_DIR}/demo-reset-response.json"
  mappings_file="${WORK_DIR}/demo-reset-mappings.json"
  loads_file="${WORK_DIR}/demo-reset-loads.json"
  projects_file="${WORK_DIR}/demo-reset-project.json"
  models_file="${WORK_DIR}/demo-reset-models.json"
  adb_file="${WORK_DIR}/demo-reset-adb.json"
  connection_file="${WORK_DIR}/demo-reset-iceberg.json"

  api_request "GET" "${api_prefix}/bulkload" "" "${loads_file}" || return 1
  while IFS= read -r identifier; do
    [[ -n "${identifier}" ]] || continue
    delete_data_transforms_object "${api_prefix}" "/bulkload/id/${identifier}" "${response_file}" || return 1
    log "Removed Data Transforms demo data load ${load_name}."
  done < <(matching_object_ids "${loads_file}" "${load_name}" "bulkLoadName" "${project_name}" "parentProjectName")

  api_request "GET" "${api_prefix}/mappings" "" "${mappings_file}" || return 1
  while IFS= read -r identifier; do
    [[ -n "${identifier}" ]] || continue
    delete_data_transforms_object "${api_prefix}" "/mappings/id/${identifier}" "${response_file}" || return 1
    log "Removed Data Transforms demo data flow ${flow_name}."
  done < <(matching_object_ids "${mappings_file}" "${flow_name}" "name" "${project_name}" "projectName")

  if api_request "GET" "${api_prefix}/projects/name/${project_name}" "" "${projects_file}"; then
    while IFS= read -r identifier; do
      [[ -n "${identifier}" ]] || continue
      delete_data_transforms_object "${api_prefix}" "/projects/id/${identifier}" "${response_file}" || return 1
      log "Removed Data Transforms demo project ${project_name}."
    done < <(matching_object_ids "${projects_file}" "${project_name}" "name")
  elif [[ "${API_STATUS}" != "404" ]]; then
    return 1
  fi

  api_request "GET" "${api_prefix}/models" "" "${models_file}" || return 1
  while IFS= read -r identifier; do
    [[ -n "${identifier}" ]] || continue
    delete_data_transforms_object "${api_prefix}" "/models/id/${identifier}" "${response_file}" || return 1
    log "Removed Data Transforms PG model and its imported data entities."
  done < <(matching_object_ids "${models_file}" "PG" "modelCode")

  connection_id="$(find_adb_connection_id "${api_prefix}" || true)"
  if [[ -n "${connection_id}" ]] && api_request "GET" "${api_prefix}/dataservers/id/${connection_id}" "" "${adb_file}"; then
    while IFS= read -r schema_id; do
      [[ -n "${schema_id}" ]] || continue
      delete_data_transforms_object "${api_prefix}" "/dataservers/schemas/id/${schema_id}?cascade=true&forceDelete=true" "${response_file}" || return 1
      log "Removed Data Transforms PG schema metadata."
    done < <("${PYTHON_BIN}" - "${adb_file}" <<'PY'
import json,sys
for schema in json.load(open(sys.argv[1], encoding="utf-8")).get("schemas") or []:
    if str(schema.get("dataSchema", "")).casefold() == "pg":
        print(schema.get("globalId") or schema.get("id") or "")
PY
)
  fi

  connection_id="$(find_connection_id "${connection_name}" "${api_prefix}" || true)"
  if [[ -n "${connection_id}" ]]; then
    delete_data_transforms_object "${api_prefix}" "/dataservers/id/${connection_id}?cascade=true&forceDelete=true" "${response_file}" || return 1
    log "Removed Data Transforms Iceberg connection ${connection_name}."
  fi
}

ensure_iceberg_gold_schema() {
  local api_prefix="$1"
  local connection_name="${DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME:-${DEFAULT_CONNECTION_NAME}}"
  local connection_id detail_file payload_file response_file schema_id

  connection_id="$(find_connection_id "${connection_name}" "${api_prefix}" || true)"
  if [[ -z "${connection_id}" ]]; then
    log "Data Transforms Iceberg connection ${connection_name} is not available for demo data-load provisioning."
    return 1
  fi
  detail_file="${WORK_DIR}/iceberg-connection-detail.json"
  payload_file="${WORK_DIR}/iceberg-gold-schema-payload.json"
  response_file="${WORK_DIR}/iceberg-gold-schema-response.json"
  if ! api_request "GET" "${api_prefix}/dataservers/id/${connection_id}" "" "${detail_file}"; then
    log "Could not inspect Data Transforms Iceberg connection ${connection_name}; HTTP ${API_STATUS}: $(summarize_response "${detail_file}")"
    return 1
  fi
  schema_id="$("${PYTHON_BIN}" - "${detail_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
for schema in payload.get("schemas") or []:
    if str(schema.get("dataSchema", "")).casefold() == "gold":
        identifier = schema.get("globalId") or schema.get("id")
        if identifier:
            print(identifier)
            break
PY
)"
  if [[ -n "${schema_id}" ]]; then
    printf '%s' "${schema_id}" > "${WORK_DIR}/iceberg-gold-schema-id"
    return 0
  fi

  ICEBERG_CONNECTION_DETAIL="${detail_file}" "${PYTHON_BIN}" - "${payload_file}" <<'PY'
import json
import os
import sys

with open(os.environ["ICEBERG_CONNECTION_DETAIL"], encoding="utf-8") as handle:
    connection = json.load(handle)
name = connection["name"]
identifier = connection["globalId"]
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump({
        "schemaShortName": "gold",
        "parentServer": name,
        "parentServerGlobalId": identifier,
        "schemaName": f"{name}.gold",
        "dataSchema": "gold",
        "workSchema": "gold",
        "logicalSchema": f"ADP_S{identifier}_PGOLD_LS",
        "logicalSchemaTag": "IMPORTED_SCHEMA",
        "technology": "APACHE_ICEBERG",
        "default": True,
    }, handle, separators=(",", ":"))
PY
  if ! api_request "POST" "${api_prefix}/dataservers/id/${connection_id}/schemas" "${payload_file}" "${response_file}"; then
    log "Failed to create Data Transforms Iceberg gold schema; HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
    return 1
  fi
  schema_id="$("${PYTHON_BIN}" - "${response_file}" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    print(json.load(handle).get("globalId", ""))
PY
)"
  [[ -n "${schema_id}" ]] || return 1
  log "Created Data Transforms Iceberg schema ${connection_name}.gold."
  printf '%s' "${schema_id}" > "${WORK_DIR}/iceberg-gold-schema-id"
}

ensure_demo_data_entities() {
  local api_prefix="$1"
  local source_table="${DATA_TRANSFORMS_DEMO_DATA_FLOW_SOURCE_TABLE:-PRODUCT_MASTER_RAW_ICEBERG_EXT}"
  local target_table="${DATA_TRANSFORMS_DEMO_DATA_FLOW_TARGET_TABLE:-GOLD_PRODUCTS}"
  local connection_id detail_file schema_file schema_response models_file model_file model_response stores_file missing session_id job_file attempt agent_name

  stores_file="${WORK_DIR}/demo-datastores.json"
  api_request "GET" "${api_prefix}/datastores" "" "${stores_file}" || return 1
  missing="$(DEMO_STORES_FILE="${stores_file}" DEMO_SOURCE_TABLE="${source_table}" DEMO_TARGET_TABLE="${target_table}" "${PYTHON_BIN}" - <<'PY'
import json, os
stores=json.load(open(os.environ["DEMO_STORES_FILE"], encoding="utf-8"))
names={str(x.get("name", "")).casefold() for x in stores if isinstance(x, dict)}
print(" ".join(name for name in (os.environ["DEMO_SOURCE_TABLE"], os.environ["DEMO_TARGET_TABLE"]) if name.casefold() not in names))
PY
)"
  [[ -n "${missing}" ]] || return 0

  connection_id="$(find_adb_connection_id "${api_prefix}" || true)"
  [[ -n "${connection_id}" ]] || return 1
  agent_name="$(select_agent_name "${api_prefix}" || true)"
  if [[ -z "${agent_name}" ]]; then
    log "No Data Transforms agent found; cannot import the demo data entities."
    return 1
  fi
  detail_file="${WORK_DIR}/demo-oracle-detail.json"
  schema_file="${WORK_DIR}/demo-oracle-schema.json"
  schema_response="${WORK_DIR}/demo-oracle-schema-response.json"
  models_file="${WORK_DIR}/demo-models.json"
  model_file="${WORK_DIR}/demo-oracle-model.json"
  model_response="${WORK_DIR}/demo-oracle-model-response.json"
  api_request "GET" "${api_prefix}/dataservers/id/${connection_id}" "" "${detail_file}" || return 1
  DEMO_ORACLE_DETAIL="${detail_file}" "${PYTHON_BIN}" - "${schema_file}" <<'PY'
import json, os, sys
connection=json.load(open(os.environ["DEMO_ORACLE_DETAIL"], encoding="utf-8"))
schema=next((s for s in connection.get("schemas") or [] if str(s.get("dataSchema", "")).casefold()=="pg"), None)
if schema is None:
    identifier=connection["globalId"]
    schema={"schemaShortName":"PG","parentServer":connection["name"],"parentServerGlobalId":identifier,
            "schemaName":f"{connection['name']}.PG","dataSchema":"PG","workSchema":"PG",
            "logicalSchema":f"ADP_S{identifier}_PG_LS","logicalSchemaTag":"IMPORTED_SCHEMA",
            "technology":"ORACLE","default":True}
json.dump(schema, open(sys.argv[1], "w", encoding="utf-8"), separators=(",", ":"))
PY
  # The JSON producer writes only the payload; decide from the connection detail.
  if ! "${PYTHON_BIN}" - "${detail_file}" <<'PY'
import json,sys
connection=json.load(open(sys.argv[1], encoding="utf-8"))
sys.exit(0 if any(str(s.get("dataSchema", "")).casefold()=="pg" for s in connection.get("schemas") or []) else 1)
PY
  then
    api_request "POST" "${api_prefix}/dataservers/id/${connection_id}/schemas" "${schema_file}" "${schema_response}" || return 1
    cp "${schema_response}" "${schema_file}"
  fi
  api_request "GET" "${api_prefix}/models" "" "${models_file}" || return 1
  DEMO_MODELS_FILE="${models_file}" DEMO_SCHEMA_FILE="${schema_file}" DEMO_REVERSE_AGENT="${agent_name}" "${PYTHON_BIN}" - "${model_file}" <<'PY'
import json, os, sys
models=json.load(open(os.environ["DEMO_MODELS_FILE"], encoding="utf-8"))
model=next((m for m in models if str(m.get("modelCode", "")).casefold()=="pg"), None)
if model is None:
    model={"modelName":"PG","modelCode":"PG","parentFolder":"DefaultFolder","technologyCode":"ORACLE",
           "schema":json.load(open(os.environ["DEMO_SCHEMA_FILE"], encoding="utf-8"))}
model.update(reverseType="CUSTOMIZED",reverseAgent=os.environ["DEMO_REVERSE_AGENT"],reverseContext="GLOBAL",reverseMask="%",reverseObjectTypes=["TABLE"])
json.dump(model, open(sys.argv[1], "w", encoding="utf-8"), separators=(",", ":"))
PY
  if ! "${PYTHON_BIN}" - "${models_file}" <<'PY'
import json,sys
sys.exit(0 if any(str(m.get("modelCode", "")).casefold()=="pg" for m in json.load(open(sys.argv[1], encoding="utf-8"))) else 1)
PY
  then
    api_request "POST" "${api_prefix}/models" "${model_file}" "${model_response}" || return 1
    cp "${model_response}" "${model_file}"
  fi
  for missing in ${missing}; do
    DEMO_MODEL_FILE="${model_file}" DEMO_DATASTORE_NAME="${missing}" DEMO_REVERSE_AGENT="${agent_name}" "${PYTHON_BIN}" - "${WORK_DIR}/demo-reverse-${missing}.json" <<'PY'
import json, os, sys
model=json.load(open(os.environ["DEMO_MODEL_FILE"], encoding="utf-8"))
model.update(reverseType="CUSTOMIZED",reverseAgent=os.environ["DEMO_REVERSE_AGENT"],reverseContext="GLOBAL",reverseMask="%",reverseObjectTypes=["TABLE"],reverseObjList=os.environ["DEMO_DATASTORE_NAME"])
json.dump(model, open(sys.argv[1], "w", encoding="utf-8"), separators=(",", ":"))
PY
    api_request "POST" "${api_prefix}/models/reverse/custom" "${WORK_DIR}/demo-reverse-${missing}.json" "${WORK_DIR}/demo-reverse-response.json" || return 1
    session_id="$("${PYTHON_BIN}" - "${WORK_DIR}/demo-reverse-response.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1], encoding="utf-8")).get("sessionId", ""))
PY
)"
    [[ -n "${session_id}" ]] || return 1
    job_file="${WORK_DIR}/demo-reverse-${missing}-job.json"
    for attempt in {1..24}; do
      api_request "GET" "${api_prefix}/jobs/sessionId/${session_id}" "" "${job_file}" || return 1
      if "${PYTHON_BIN}" - "${job_file}" <<'PY'
import json,sys
status=json.load(open(sys.argv[1], encoding="utf-8")).get("status")
sys.exit(0 if status == "DONE" else 1)
PY
      then
        break
      fi
      sleep 5
    done
    if ! "${PYTHON_BIN}" - "${job_file}" <<'PY'
import json,sys
sys.exit(0 if json.load(open(sys.argv[1], encoding="utf-8")).get("status") == "DONE" else 1)
PY
    then
      log "Data Transforms import for ${missing} did not complete within two minutes."
      return 1
    fi
    log "Imported Data Transforms entity ${missing}."
  done
  api_request "GET" "${api_prefix}/datastores" "" "${stores_file}" || return 1
  missing="$(DEMO_STORES_FILE="${stores_file}" DEMO_SOURCE_TABLE="${source_table}" DEMO_TARGET_TABLE="${target_table}" "${PYTHON_BIN}" - <<'PY'
import json, os
stores=json.load(open(os.environ["DEMO_STORES_FILE"], encoding="utf-8"))
names={str(x.get("name", "")).casefold() for x in stores if isinstance(x, dict)}
print(" ".join(name for name in (os.environ["DEMO_SOURCE_TABLE"], os.environ["DEMO_TARGET_TABLE"]) if name.casefold() not in names))
PY
)"
  [[ -z "${missing}" ]]
}

ensure_demo_data_flow() {
  local api_prefix="$1"
  local project_name="${DATA_TRANSFORMS_DEMO_PROJECT_NAME:-${DEFAULT_DEMO_PROJECT_NAME}}"
  local flow_name="${DATA_TRANSFORMS_DEMO_DATA_FLOW_NAME:-dataFlow}"
  local source_table="${DATA_TRANSFORMS_DEMO_DATA_FLOW_SOURCE_TABLE:-PRODUCT_MASTER_RAW_ICEBERG_EXT}"
  local target_table="${DATA_TRANSFORMS_DEMO_DATA_FLOW_TARGET_TABLE:-GOLD_PRODUCTS}"
  local mappings_file stores_file project_file payload_file response_file

  mappings_file="${WORK_DIR}/demo-mappings.json"
  stores_file="${WORK_DIR}/demo-datastores.json"
  project_file="${WORK_DIR}/demo-project.json"
  payload_file="${WORK_DIR}/demo-data-flow-payload.json"
  response_file="${WORK_DIR}/demo-data-flow-response.json"
  if ! api_request "GET" "${api_prefix}/mappings" "" "${mappings_file}"; then
    log "Could not list Data Transforms data flows; HTTP ${API_STATUS}: $(summarize_response "${mappings_file}")"
    return 1
  fi
  if demo_object_exists "${mappings_file}" "${flow_name}" "${project_name}" "name" "projectName"; then
    log "Data Transforms demo data flow ${flow_name} already exists in ${project_name}."
    return 0
  fi
  if ! api_request "GET" "${api_prefix}/projects/name/${project_name}" "" "${project_file}" \
    || ! api_request "GET" "${api_prefix}/datastores" "" "${stores_file}"; then
    log "Could not read the Data Transforms metadata needed for demo data flow provisioning."
    return 1
  fi
  DEMO_DATA_FLOW_NAME="${flow_name}" DEMO_SOURCE_TABLE="${source_table}" DEMO_TARGET_TABLE="${target_table}" \
    "${PYTHON_BIN}" - "${project_file}" "${stores_file}" "${payload_file}" <<'PY'
import json
import os
import sys
import uuid

project = json.load(open(sys.argv[1], encoding="utf-8"))
stores = json.load(open(sys.argv[2], encoding="utf-8"))
source_name, target_name = os.environ["DEMO_SOURCE_TABLE"], os.environ["DEMO_TARGET_TABLE"]

def find(name):
    for store in stores:
        if store.get("name", "").casefold() == name.casefold():
            return store
    raise ValueError(f"Data entity {name} is not imported yet")

source, target = find(source_name), find(target_name)
source_columns = {column["name"]: column for column in source.get("columns", [])}

def component(store, is_source):
    attributes = []
    for column in store.get("columns", []):
        attribute = {key: column[key] for key in ("name", "position", "dataType", "dataTypeCode", "length", "scale") if key in column}
        attribute.update(globalId=str(uuid.uuid4()), syncState="IN_SYNC")
        if not is_source:
            source_column = column["name"] if column["name"] in source_columns else ("RAW_SKU" if column["name"] == "SKU" and "RAW_SKU" in source_columns else None)
            attribute.update(executeOnHint="NO_HINT", insert=bool(source_column), update=bool(source_column), checkNotNull=False, key=False, active=bool(source_column))
            if source_column:
                attribute["expressions"] = {"INPUT1": f"Substitution.{column['name']}"}
        attributes.append(attribute)
    result = {
        "name": store["name"], "globalId": str(uuid.uuid4()), "type": "DATASTORE",
        "uiCoordinates": "94.09375,239.109375" if is_source else "616.09375,230.109375",
        "boundToDataStoreId": store["globalId"], "boundToDataStoreName": store["name"],
        "boundToDataStoreType": store.get("dataStoreType", "TABLE"), "boundToDataStoreModel": store["modelCode"],
        "schemaName": store["schemaName"], "schemaGlobalId": store["schemaGlobalId"],
        "dataServerName": store["dataServerName"], "dataServerGlobalId": store["dataServerGlobalId"],
        "technology": store["technologyCode"], "syncState": "IN_SYNC", "deprecated": False,
        "attributes": attributes,
    }
    if is_source:
        result["connectedTo"] = ["Substitution"]
    else:
        result.update(connectedFrom=["Substitution"], integrationType="CONTROL_APPEND", isMaxErrorsAsPercentage=False, options=[])
    return result

substitution_attributes = []
for position, target_column in enumerate(target.get("columns", [])):
    target_name = target_column["name"]
    source_name = target_name if target_name in source_columns else ("RAW_SKU" if target_name == "SKU" and "RAW_SKU" in source_columns else None)
    if not source_name:
        continue
    data_type = target_column.get("dataType", "VARCHAR2")
    data_type_code = target_column.get("dataTypeCode", data_type)
    if data_type == "VARCHAR2":
        data_type = data_type_code = "VARCHAR"
    expression = f"{source['name']}.{source_name}"
    attribute = {"name": target_name, "globalId": str(uuid.uuid4()), "position": position,
                 "dataType": data_type, "dataTypeCode": data_type_code, "expressions": {"INPUT1": expression},
                 "syncState": "IN_SYNC", "connectedFrom": [expression]}
    for key in ("length", "scale"):
        if key in target_column:
            attribute[key] = target_column[key]
    if target_name == "SUBCATEGORY" and source_name == "SUBCATEGORY":
        attribute["expressions"] = {"INPUT1": f"case {expression} when 'NetSuite' then 'Databricks' else {expression} end"}
        attribute["substitutionMap"] = {"NetSuite": "Databricks"}
    substitution_attributes.append(attribute)

payload = {
    "name": os.environ["DEMO_DATA_FLOW_NAME"],
    "projectName": project["name"], "projectCode": project["code"], "parentFolder": "DefaultFolder",
    "attachedSchemas": [source["schemaGlobalId"]], "cleanupOnError": False,
    "sources": [component(source, True)], "targets": [component(target, False)],
    "dbfunc_substitutions": [{"name": "Substitution", "globalId": str(uuid.uuid4()), "type": "EXPRESSION",
                                "uiCoordinates": "416.09375,230.109375", "connectedFrom": [source["name"]],
                                "connectedTo": [target["name"]], "attributes": substitution_attributes, "deprecated": False}],
}
json.dump(payload, open(sys.argv[3], "w", encoding="utf-8"), separators=(",", ":"))
PY
  if ! api_request "POST" "${api_prefix}/mappings" "${payload_file}" "${response_file}"; then
    log "Failed to create Data Transforms demo data flow ${flow_name}; HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
    return 1
  fi
  log "Created Data Transforms demo data flow ${flow_name}."
}

ensure_demo_data_load() {
  local api_prefix="$1"
  local project_name="${DATA_TRANSFORMS_DEMO_PROJECT_NAME:-${DEFAULT_DEMO_PROJECT_NAME}}"
  local load_name="${DATA_TRANSFORMS_DEMO_DATA_LOAD_NAME:-dataLoad}"
  local source_table="${DATA_TRANSFORMS_DEMO_DATA_LOAD_SOURCE_TABLE:-GOLD_PRODUCTS}"
  local project_file oracle_file iceberg_file loads_file payload_file response_file oracle_id

  ensure_iceberg_gold_schema "${api_prefix}" || return 1
  loads_file="${WORK_DIR}/demo-bulkloads.json"
  project_file="${WORK_DIR}/demo-project.json"
  oracle_file="${WORK_DIR}/demo-oracle-connection.json"
  iceberg_file="${WORK_DIR}/iceberg-connection-detail.json"
  payload_file="${WORK_DIR}/demo-data-load-payload.json"
  response_file="${WORK_DIR}/demo-data-load-response.json"
  if ! api_request "GET" "${api_prefix}/bulkload" "" "${loads_file}"; then
    log "Could not list Data Transforms data loads; HTTP ${API_STATUS}: $(summarize_response "${loads_file}")"
    return 1
  fi
  if demo_object_exists "${loads_file}" "${load_name}" "${project_name}" "bulkLoadName" "parentProjectName"; then
    log "Data Transforms demo data load ${load_name} already exists in ${project_name}."
    return 0
  fi
  oracle_id="$(find_adb_connection_id "${api_prefix}" || true)"
  [[ -n "${oracle_id}" ]] || return 1
  if ! api_request "GET" "${api_prefix}/projects/name/${project_name}" "" "${project_file}" \
    || ! api_request "GET" "${api_prefix}/dataservers/id/${oracle_id}" "" "${oracle_file}"; then
    log "Could not read the Data Transforms metadata needed for demo data load provisioning."
    return 1
  fi
  DEMO_DATA_LOAD_NAME="${load_name}" DEMO_DATA_LOAD_SOURCE_TABLE="${source_table}" \
    "${PYTHON_BIN}" - "${project_file}" "${oracle_file}" "${iceberg_file}" "${payload_file}" <<'PY'
import json
import os
import sys

project, oracle, iceberg = (json.load(open(path, encoding="utf-8")) for path in sys.argv[1:4])
source_schema = next((schema for schema in oracle.get("schemas") or [] if schema.get("default")), None)
target_schema = next((schema for schema in iceberg.get("schemas") or [] if str(schema.get("dataSchema", "")).casefold() == "gold"), None)
if not source_schema or not target_schema:
    raise ValueError("Oracle default schema or Iceberg gold schema is not available")
def model(schema, technology, object_types):
    return {"technologyCode": technology, "schema": schema, "reverseType": "CUSTOMIZED", "reverseAgent": "Internal",
            "reverseContext": "GLOBAL", "reverseMask": "%", "reverseObjectTypes": object_types}
payload = {"bulkLoadName": os.environ["DEMO_DATA_LOAD_NAME"], "parentProjectID": project["globalId"],
           "parentProjectName": project["name"], "parentFolder": "DefaultFolder", "bulkLoadMode": "ICEBERG_INCREMENTAL",
           "sourceTechno": "ORACLE", "targetTechno": "APACHE_ICEBERG", "sourceModel": model(source_schema, "ORACLE", ["TABLE", "VIEW"]),
           "targetModel": model(target_schema, "APACHE_ICEBERG", ["TABLE"]), "chunkSize": 5,
           "sourceTables": [{"sourceTableName": os.environ["DEMO_DATA_LOAD_SOURCE_TABLE"], "targetPreloadAction": "APPEND"}]}
json.dump(payload, open(sys.argv[4], "w", encoding="utf-8"), separators=(",", ":"))
PY
  if ! api_request "POST" "${api_prefix}/bulkload" "${payload_file}" "${response_file}"; then
    log "Failed to create Data Transforms demo data load ${load_name}; HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
    return 1
  fi
  if ! "${PYTHON_BIN}" - "${response_file}" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    sys.exit(0 if json.load(handle).get("deploymentStatus") == "VALID" else 1)
PY
  then
    log "Data Transforms created demo data load ${load_name}, but it is not valid yet: $(summarize_response "${response_file}")"
    return 1
  fi
  log "Created valid Data Transforms demo data load ${load_name}."
}

configure_adb_connection() {
  local api_prefix="$1"
  local username="${DATA_TRANSFORMS_ADB_USERNAME:-${DEFAULT_ADB_USERNAME}}"
  local connection_id detail_file payload_file response_file verified_file connection_name

  if [[ -z "${DBPASSWORD:-}" ]]; then
    log "DBPASSWORD is required to configure the Data Transforms Oracle connection."
    return 1
  fi

  connection_id="$(find_adb_connection_id "${api_prefix}" || true)"
  if [[ -z "${connection_id}" ]]; then
    return 1
  fi

  detail_file="${WORK_DIR}/oracle-connection-detail.json"
  payload_file="${WORK_DIR}/oracle-connection-payload.json"
  response_file="${WORK_DIR}/oracle-connection-response.json"
  verified_file="${WORK_DIR}/oracle-connection-verified.json"

  if ! api_request "GET" "${api_prefix}/dataservers/id/${connection_id}" "" "${detail_file}"; then
    log "Could not read Oracle connection ${connection_id}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${detail_file}")"
    return 1
  fi

  connection_name="$("${PYTHON_BIN}" - "${detail_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    print(json.load(handle).get("name", "Oracle connection"))
PY
)"

  if ! build_adb_connection_payload "${detail_file}" "${payload_file}" "${username}" "${DBPASSWORD}"; then
    log "Could not build the credential update for ${connection_name}."
    return 1
  fi

  if ! api_request "PUT" "${api_prefix}/dataservers" "${payload_file}" "${response_file}"; then
    log "Failed to update ${connection_name}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${response_file}")"
    return 1
  fi
  log "Updated Data Transforms Oracle connection ${connection_name} to use ${username}."

  test_connection "${api_prefix}" "${connection_id}" "${connection_name}" || return 1

  if ! api_request "GET" "${api_prefix}/dataservers/id/${connection_id}" "" "${verified_file}"; then
    log "Could not verify ${connection_name}; Data Transforms returned HTTP ${API_STATUS}: $(summarize_response "${verified_file}")"
    return 1
  fi
  if ! verify_adb_connection_detail "${verified_file}" "${username}"; then
    log "Oracle connection ${connection_name} does not yet report ${username} as its username and default schema."
    return 1
  fi

  log "Oracle connection ${connection_name} verified with username and default schema ${username}."
}

attempt_once() {
  local api_prefix adb_enabled iceberg_enabled demo_enabled demo_reset_enabled connection_id

  load_env
  api_prefix="${DATA_TRANSFORMS_API_PREFIX:-${DEFAULT_API_PREFIX}}"
  adb_enabled=true
  iceberg_enabled=true
  demo_enabled=true
  demo_reset_enabled=true

  if is_disabled "${DATA_TRANSFORMS_ADB_AUTO_CONFIGURE:-true}"; then
    adb_enabled=false
  fi
  if is_disabled "${DATA_TRANSFORMS_ICEBERG_AUTO_CREATE:-true}"; then
    iceberg_enabled=false
  fi
  if is_disabled "${DATA_TRANSFORMS_DEMO_AUTO_CREATE:-true}"; then
    demo_enabled=false
  fi
  if is_disabled "${DATA_TRANSFORMS_DEMO_RESET:-true}"; then
    demo_reset_enabled=false
  fi
  if [[ "${adb_enabled}" == false && "${iceberg_enabled}" == false && "${demo_enabled}" == false ]]; then
    log "Automatic Data Transforms provisioning is disabled."
    return 0
  fi

  if [[ -z "${DBPASSWORD:-}" && -z "${DATA_TRANSFORMS_PASSWORD:-}" ]]; then
    log "DBPASSWORD or DATA_TRANSFORMS_PASSWORD is required for Data Transforms login."
    return 1
  fi

  DT_BASE_URL="$(derive_data_transforms_base_url)" || {
    log "Could not derive Data Transforms base URL. Set DATA_TRANSFORMS_BASE_URL if needed."
    return 1
  }
  DT_BASE_URL="$(trim_trailing_slash "${DT_BASE_URL}")"

  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pg-iceberg-connection.XXXXXX")"
  chmod 700 "${WORK_DIR}"
  trap cleanup EXIT

  login_data_transforms || return 1

  if [[ "${adb_enabled}" == true ]]; then
    configure_adb_connection "${api_prefix}" || return 1
  else
    log "Automatic Data Transforms Oracle connection configuration is disabled."
  fi

  if [[ "${demo_enabled}" == true && "${demo_reset_enabled}" == true && "${DEMO_RESET_COMPLETE}" != true ]]; then
    reset_demo_data_transforms "${api_prefix}" || return 1
    DEMO_RESET_COMPLETE=true
  elif [[ "${demo_enabled}" == true ]]; then
    [[ "${demo_reset_enabled}" == true ]] || log "Data Transforms demo reset is disabled."
  fi

  if [[ "${iceberg_enabled}" == true ]]; then
    ICEBERG_REST_URL="$(derive_iceberg_rest_url)" || {
      log "Could not derive public Gravitino Iceberg REST URL. Set DATA_TRANSFORMS_ICEBERG_REST_URL if needed."
      return 1
    }
    ICEBERG_REST_URL="$(trim_trailing_slash "${ICEBERG_REST_URL}")"

    if ! local_gravitino_ready; then
      log "Local Gravitino endpoint is not ready on port ${GRAVITINO_REST_PORT:-${GRAVITINO_HTTP_PORT:-${DEFAULT_GRAVITINO_PORT}}}."
      return 1
    fi

    log "Creating or updating ${DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME:-${DEFAULT_CONNECTION_NAME}} with REST URL ${ICEBERG_REST_URL}."
    upsert_connection "${api_prefix}" || return 1
    connection_id="$(<"${WORK_DIR}/connection-id")"
    test_connection "${api_prefix}" "${connection_id}" "${DATA_TRANSFORMS_ICEBERG_CONNECTION_NAME:-${DEFAULT_CONNECTION_NAME}}" || return 1
  else
    log "Automatic Data Transforms Iceberg connection creation is disabled."
  fi

  if [[ "${demo_enabled}" == true ]]; then
    ensure_demo_project "${api_prefix}" || return 1
    ensure_demo_data_entities "${api_prefix}" || return 1
    ensure_demo_data_flow "${api_prefix}" || return 1
    ensure_demo_data_load "${api_prefix}" || return 1
  else
    log "Automatic Data Transforms demo project creation is disabled."
  fi
}

main() {
  local attempt max_attempts retry_seconds

  require_tools
  load_env
  DEMO_RESET_COMPLETE=false

  max_attempts="${DATA_TRANSFORMS_ICEBERG_MAX_ATTEMPTS:-${DEFAULT_MAX_ATTEMPTS}}"
  retry_seconds="${DATA_TRANSFORMS_ICEBERG_RETRY_SECONDS:-${DEFAULT_RETRY_SECONDS}}"

  for ((attempt = 1; attempt <= max_attempts; attempt++)); do
    if attempt_once; then
      log "Data Transforms connection provisioning completed."
      return 0
    fi

    cleanup
    WORK_DIR=""

    if (( attempt < max_attempts )); then
      log "Attempt ${attempt}/${max_attempts} failed; retrying in ${retry_seconds}s."
      sleep "${retry_seconds}"
    fi
  done

  log "Failed to provision Data Transforms connections after ${max_attempts} attempts."
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
