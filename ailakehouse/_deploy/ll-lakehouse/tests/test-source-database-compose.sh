#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/ingestion/compose.yml"
SOURCE_TLS_COMPOSE_FILE="${PROJECT_ROOT}/ingestion/compose.source-tls.yml"
SETENV_FILE="${PROJECT_ROOT}/init/setenv.sh"
VARIABLE_FILE="${PROJECT_ROOT}/init/variable.sh"
PODMAN_SERVICE_FILE="${PROJECT_ROOT}/init/user-podman.service"
APP_FILE="${PROJECT_ROOT}/ingestion/frontend/src/App.jsx"
API_FILE="${PROJECT_ROOT}/ingestion/frontend/src/utils/api.js"
PAGE_FILE="${PROJECT_ROOT}/ingestion/frontend/src/pages/DataSources.jsx"
ROUTE_FILE="${PROJECT_ROOT}/ingestion/backend/routes/dataSources.js"
SOURCE_CATALOG_ROUTE_FILE="${PROJECT_ROOT}/ingestion/backend/routes/sourceCatalogs.js"
SERVER_FILE="${PROJECT_ROOT}/ingestion/backend/server.js"
ADB_LOAD_FILE="${PROJECT_ROOT}/init/adb-load.sh"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_text() {
  local file="$1"
  local expected="$2"

  grep -qF -- "${expected}" "${file}" || fail "Missing expected text in ${file}: ${expected}"
}

reject_text() {
  local file="$1"
  local unexpected="$2"

  if grep -qF -- "${unexpected}" "${file}"; then
    fail "Unexpected text in ${file}: ${unexpected}"
  fi
}

service_block() {
  local service_name="$1"

  awk -v service="${service_name}:" '
    $0 == "  " service { in_service = 1; next }
    in_service && /^  [A-Za-z0-9_-]+:$/ { exit }
    in_service { print }
  ' "${COMPOSE_FILE}"
}

require_service_text() {
  local service_name="$1"
  local expected="$2"
  local block

  block="$(service_block "${service_name}")"
  grep -qF -- "${expected}" <<< "${block}" \
    || fail "Missing expected text in ${service_name} service: ${expected}"
}

for volume in postgres-source-data loyalty-mysql-data mongodb-catalog-data; do
  require_text "${COMPOSE_FILE}" "  ${volume}:"
done

require_text "${SOURCE_TLS_COMPOSE_FILE}" "ssl=on"
require_text "${SOURCE_TLS_COMPOSE_FILE}" "--ssl-ca=/run/peakgear-tls/ca.crt"
require_text "${SOURCE_TLS_COMPOSE_FILE}" "--tlsMode"
require_text "${SOURCE_TLS_COMPOSE_FILE}" "preferTLS"

require_service_text "postgres-source" "hostname: postgres-source"
require_service_text "postgres-source" 'image: ${POSTGRES_SOURCE_IMAGE:-docker.io/library/postgres:17.11-bookworm}'
if grep -qF -- "profiles:" <<< "$(service_block "postgres-source")"; then
  fail "PostgreSQL must be included in every image, not gated by AIHUB"
fi
require_service_text "postgres-source" '"${POSTGRES_SOURCE_PORT:-8504}:5432"'
require_service_text "postgres-source" "postgres-source-data:/var/lib/postgresql/data"
require_service_text "postgres-source" "./source-databases/postgres:/docker-entrypoint-initdb.d:ro,z"
require_service_text "postgres-source" 'POSTGRES_USER: ${POSTGRES_SOURCE_USER:-PG}'
require_service_text "postgres-source" 'POSTGRES_PASSWORD: ${DBPASSWORD:-peakgear}'
require_service_text "postgres-source" "pg_isready -U"

require_service_text "loyalty-mysql" "hostname: loyalty-mysql"
require_service_text "loyalty-mysql" 'image: ${LOYALTY_MYSQL_IMAGE:-docker.io/library/mysql:8.4.11}'
if grep -qF -- "profiles:" <<< "$(service_block "loyalty-mysql")"; then
  fail "Loyalty MySQL must be included in every image, not gated by AIHUB"
fi
require_service_text "loyalty-mysql" '"${LOYALTY_MYSQL_PORT:-8503}:3306"'
require_service_text "loyalty-mysql" "loyalty-mysql-data:/var/lib/mysql"
require_service_text "loyalty-mysql" "./source-databases/mysql:/docker-entrypoint-initdb.d:ro,z"
require_service_text "loyalty-mysql" 'MYSQL_USER: ${LOYALTY_MYSQL_USER:-PG}'
require_service_text "loyalty-mysql" 'MYSQL_PASSWORD: ${DBPASSWORD:-peakgear}'
require_service_text "loyalty-mysql" 'MYSQL_ROOT_PASSWORD: ${DBPASSWORD:-peakgear}'
require_service_text "loyalty-mysql" "mysqladmin ping"

require_service_text "mongodb-catalog" "hostname: mongodb-catalog"
require_service_text "mongodb-catalog" 'image: ${MONGODB_CATALOG_IMAGE:-docker.io/library/mongo:8.0.29}'
require_service_text "mongodb-catalog" "profiles:"
require_service_text "mongodb-catalog" "- aihub"
require_service_text "mongodb-catalog" '"${MONGODB_CATALOG_PORT:-8888}:27017"'
require_service_text "mongodb-catalog" "mongodb-catalog-data:/data/db"
require_service_text "mongodb-catalog" "./source-databases/mongodb:/docker-entrypoint-initdb.d:ro,z"
require_service_text "mongodb-catalog" 'MONGO_INITDB_ROOT_USERNAME: ${MONGODB_CATALOG_ROOT_USERNAME:-PG}'
require_service_text "mongodb-catalog" 'MONGO_INITDB_ROOT_PASSWORD: ${DBPASSWORD:-peakgear}'
require_service_text "mongodb-catalog" "mongosh --quiet"
require_service_text "mongodb-catalog" '--password=\"$${MONGO_INITDB_ROOT_PASSWORD}\"'

require_service_text "ords" 'ORACLE_PWD: ${ORACLE_PWD:-oracle}'
require_service_text "ords" 'ORACLE_USER_PWD: ${ORACLE_PWD:-oracle}'

for seed_file in \
  "${PROJECT_ROOT}/ingestion/source-databases/postgres/01-demo-products.sql" \
  "${PROJECT_ROOT}/ingestion/source-databases/mysql/01-demo-products.sql" \
  "${PROJECT_ROOT}/ingestion/source-databases/mongodb/01-demo-products.js"; do
  require_text "${seed_file}" "demo_products"
  require_text "${seed_file}" "Trailhead Daypack"
  require_text "${seed_file}" "Summit Insulated Bottle"
  require_text "${seed_file}" "RidgeLine Headlamp"
done

require_service_text "goldengate-runtime" '"${GOLDENGATE_RUNTIME_HTTP_PORT:-8502}:8080"'
require_service_text "ggsa" '"${GGSA_MYSQL_PORT:-3306}:3306"'

for removed_variable in POSTGRES_SOURCE_PASSWORD LOYALTY_MYSQL_PASSWORD LOYALTY_MYSQL_ROOT_PASSWORD MONGODB_CATALOG_ROOT_PASSWORD; do
  if grep -qF -- "${removed_variable}" "${COMPOSE_FILE}" "${SETENV_FILE}"; then
    fail "Source database credentials must use DBPASSWORD, not ${removed_variable}"
  fi
done

for expected in \
  'AIHUB=${AIHUB}' \
  'SOURCE_DATABASE_TLS_ENABLED=${source_tls_enabled}' \
  'NETSUITE_DB_PORT=1522' \
  'NETSUITE_DB_USER=${NETSUITE_DB_USER:-NETSUITE}' \
  'POSTGRES_SOURCE_PORT=${POSTGRES_SOURCE_PORT:-8504}' \
  'POSTGRES_CATALOG_PORT=${POSTGRES_CATALOG_PORT:-5432}' \
  'LOYALTY_MYSQL_PORT=${LOYALTY_MYSQL_PORT:-8503}' \
  'LOYALTY_MYSQL_CATALOG_PORT=${LOYALTY_MYSQL_CATALOG_PORT:-3306}' \
  'MONGODB_CATALOG_PORT=${MONGODB_CATALOG_PORT:-8888}' \
  'MONGODB_CATALOG_LINK_PORT=${MONGODB_CATALOG_LINK_PORT:-27017}' \
  'SOURCE_PUBLIC_HOST=${SOURCE_PUBLIC_HOST:-${PUBLIC_ENDPOINT_HOST}}' \
  'FRONTEND_URL=${FRONTEND_URL:-https://${PUBLIC_ENDPOINT_HOST}:8505}' \
  'OSA_PUBLIC_URL=${OSA_PUBLIC_URL:-https://${PUBLIC_ENDPOINT_HOST}:8085/osa/index.html}' \
  'GOLDENGATE_PUBLIC_URL=${GOLDENGATE_PUBLIC_URL:-https://${PUBLIC_ENDPOINT_HOST}:8501}' \
  'DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST=${DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST:-${PUBLIC_IP}}' \
  'PUBLIC_HOST=${PUBLIC_ENDPOINT_HOST}' \
  'GGSA_PUBLIC_HOST=${GGSA_PUBLIC_HOST:-${PUBLIC_ENDPOINT_HOST}}' \
  'POSTGRES_SOURCE_USER=${POSTGRES_SOURCE_USER:-PG}' \
  'LOYALTY_MYSQL_USER=${LOYALTY_MYSQL_USER:-PG}' \
  'MONGODB_CATALOG_ROOT_USERNAME=${MONGODB_CATALOG_ROOT_USERNAME:-PG}'; do
  require_text "${SETENV_FILE}" "${expected}"
done

app_block="$(service_block "app")"
for expected in \
  'DBPASSWORD: ${DBPASSWORD:-}' \
  'AIHUB: ${AIHUB:-false}' \
  'SOURCE_PUBLIC_HOST: ${SOURCE_PUBLIC_HOST:-}' \
  'PUBLIC_HOST: ${PUBLIC_HOST:-}' \
  'PUBLIC_IP: ${PUBLIC_IP:-}' \
  'DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST: ${DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST:-}' \
  'DATA_TRANSFORMS_ICEBERG_REST_URL: ${DATA_TRANSFORMS_ICEBERG_REST_URL:-}' \
  'DATA_TRANSFORMS_ICEBERG_REST_PATH: ${DATA_TRANSFORMS_ICEBERG_REST_PATH:-/iceberg}' \
  'GRAVITINO_REST_PORT: ${GRAVITINO_REST_PORT:-1525}' \
  'NETSUITE_DB_USER: ${NETSUITE_DB_USER:-NETSUITE}' \
  'POSTGRES_SOURCE_PORT: ${POSTGRES_SOURCE_PORT:-8504}' \
  'POSTGRES_CATALOG_PORT: ${POSTGRES_CATALOG_PORT:-5432}' \
  'LOYALTY_MYSQL_PORT: ${LOYALTY_MYSQL_PORT:-8503}' \
  'LOYALTY_MYSQL_CATALOG_PORT: ${LOYALTY_MYSQL_CATALOG_PORT:-3306}' \
  'MONGODB_CATALOG_PORT: ${MONGODB_CATALOG_PORT:-8888}' \
  'MONGODB_CATALOG_LINK_PORT: ${MONGODB_CATALOG_LINK_PORT:-27017}'; do
  grep -qF -- "${expected}" <<< "${app_block}" \
    || fail "Application service must expose source runtime configuration: ${expected}"
done

require_text "${VARIABLE_FILE}" '1|true|yes|on) export AIHUB=true ;'
require_text "${VARIABLE_FILE}" 'AIHUB_IMAGE_DEFAULT_FILE="${AIHUB_IMAGE_DEFAULT_FILE:-/home/opc/init/aihub-image-default.env}"'
require_text "${VARIABLE_FILE}" 'source "${AIHUB_IMAGE_DEFAULT_FILE}"'
require_text "${VARIABLE_FILE}" 'export_metadata_or_default "DATA_TRANSFORMS_ICEBERG_PUBLIC_HOST" "data_transforms_iceberg_public_host" "${PUBLIC_IP}"'
if grep -qF -- '"AIHUB" "aihub"' "${VARIABLE_FILE}"; then
  fail "AIHUB must be selected by the custom image, not Terraform metadata"
fi
require_text "${PROJECT_ROOT}/inst.sh" 'AIHUB_IMAGE_DEFAULT_FILE="/home/opc/init/aihub-image-default.env"'
require_text "${PROJECT_ROOT}/inst.sh" 'AIHUB_IMAGE_DEFAULT=true'
require_text "${PODMAN_SERVICE_FILE}" 'SOURCE_DATABASE_TLS_ENABLED:-false'
require_text "${PODMAN_SERVICE_FILE}" 'compose.source-tls.yml'
require_text "${SETENV_FILE}" 'openssl req -x509 -newkey rsa:2048'
require_text "${SETENV_FILE}" 'rm -f "$SOURCE_TLS_DIR/server.crt" "$SOURCE_TLS_DIR/server.key"'
reject_text "${SETENV_FILE}" 'rm -rf "$SOURCE_TLS_DIR"'
require_text "${SETENV_FILE}" 'DNS:postgres-source,DNS:mongodb-catalog,DNS:localhost,IP:127.0.0.1'
require_text "${SETENV_FILE}" 'Source database TLS certificate generated for ${PUBLIC_ENDPOINT_HOST}.'
require_text "${SOURCE_TLS_COMPOSE_FILE}" '--tlsAllowConnectionsWithoutCertificates'
reject_text "${SETENV_FILE}" 'SOURCE_DATABASE_TLS_CERT_PEM_B64'
reject_text "${SETENV_FILE}" 'SOURCE_DATABASE_TLS_KEY_PEM_B64'
reject_text "${SETENV_FILE}" 'SOURCE_DATABASE_TLS_CA_PEM_B64'
reject_text "${VARIABLE_FILE}" 'source_database_tls_'
require_text "${PROJECT_ROOT}/ingestion/backend/routes/streamingAnalytics.js" 'process.env.OSA_PUBLIC_URL || process.env.GGSA_OSA_PUBLIC_URL'
require_text "${PROJECT_ROOT}/ingestion/backend/lib/customerCdcSetup.js" 'process.env.GOLDENGATE_PUBLIC_URL || '\''https://localhost:8501'\'''

reject_text "${ADB_LOAD_FILE}" 'DBMS_CLOUD_ADMIN.CREATE_DATABASE_LINK('
reject_text "${ADB_LOAD_FILE}" 'DBMS_CATALOG.MOUNT_DB_LINK('
for expected in \
  'PG_SPORTSWEAR_CRED' \
  'PG_SPORTSWEAR_LINK' \
  'PG_SPORTSWEAR_CAT' \
  "gateway_params  => JSON_OBJECT('db_type' VALUE 'postgres')" \
  'PG_LOYALTY_MYSQL_CRED' \
  'PG_LOYALTY_MYSQL_LINK' \
  'PG_LOYALTY_MYSQL_CAT' \
  "gateway_params  => JSON_OBJECT('db_type' VALUE 'mysql_community')" \
  'PG_MONGODB_CATALOG_CRED' \
  'PG_MONGODB_CATALOG_LINK' \
  'PG_MONGODB_CATALOG_CAT' \
  "gateway_params  => JSON_OBJECT('db_type' VALUE 'mongodb')" \
  'MONGODB_CATALOG_ENABLED=true' \
  'password        =>' \
  '$(sql_literal "${DBPASSWORD}")'; do
  reject_text "${ADB_LOAD_FILE}" "${expected}"
done
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "router.post('/', async (req, res) =>"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "requireAdminDemoUser(req)"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" 'loadBalancerFqdn()'
reject_text "${SOURCE_CATALOG_ROUTE_FILE}" 'Source database TLS is not configured.'
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "port('LOYALTY_MYSQL_CATALOG_PORT', 3306)"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "DBMS_CLOUD_ADMIN.CREATE_DATABASE_LINK"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "DBMS_CATALOG.MOUNT_DB_LINK"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" 'directory_name     => NULL'
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "FROM user_db_links"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "const linkExists = Boolean(existingLinks.rows?.length);"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "DBMS_CLOUD_ADMIN.DROP_DATABASE_LINK"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "DBMS_CATALOG.UNMOUNT"
require_text "${SOURCE_CATALOG_ROUTE_FILE}" "PG_LOYALTY_MYSQL_CAT"
reject_text "${SOURCE_CATALOG_ROUTE_FILE}" "PG_SPORTSWEAR_CAT"
reject_text "${SOURCE_CATALOG_ROUTE_FILE}" "PG_MONGODB_CATALOG_CAT"
reject_text "${SOURCE_CATALOG_ROUTE_FILE}" "PG_NETSUITE_CAT"
reject_text "${SOURCE_CATALOG_ROUTE_FILE}" 'demo_products@${source.linkName}'
reject_text "${SOURCE_CATALOG_ROUTE_FILE}" '  enabled,'
require_text "${SERVER_FILE}" "require('./routes/sourceCatalogs')"
require_text "${SERVER_FILE}" "app.use('/api/source-catalogs', sourceCatalogsRoutes);"
require_text "${PROJECT_ROOT}/ingestion/db/data/create_user_pg.sql" 'GRANT EXECUTE ON DBMS_CLOUD TO "PG";'
require_text "${PROJECT_ROOT}/ingestion/db/data/create_user_pg.sql" 'GRANT EXECUTE ON DBMS_CLOUD_ADMIN TO "PG";'
require_text "${PROJECT_ROOT}/ingestion/db/data/create_user_pg.sql" 'GRANT CREATE DATABASE LINK TO "PG";'

AIHUB_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-aihub-default.XXXXXX")"
trap 'rm -rf "${AIHUB_TEST_DIR}"' EXIT
mkdir -p "${AIHUB_TEST_DIR}/bin"
cat > "${AIHUB_TEST_DIR}/bin/curl" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"metadata/aihub"*) printf 'true\n' ;;
esac
EOF
chmod +x "${AIHUB_TEST_DIR}/bin/curl"

aihub_from_image_default() {
  local default_value="$1"
  local output

  printf 'AIHUB=%s\n' "${default_value}" > "${AIHUB_TEST_DIR}/aihub-image-default.env"
  output="$(PATH="${AIHUB_TEST_DIR}/bin:${PATH}" \
    AIHUB_IMAGE_DEFAULT_FILE="${AIHUB_TEST_DIR}/aihub-image-default.env" \
    bash -c 'source "$1"; printf "%s" "$AIHUB"' _ "${VARIABLE_FILE}")"
  [[ "${output}" == "${default_value}" ]] \
    || fail "Image AI Hub default ${default_value} was not preserved; got ${output}"
}

aihub_from_image_default true
aihub_from_image_default false

require_text "${APP_FILE}" "const DATA_CATALOG_PAGE_ID = 'data-sources';"
require_text "${APP_FILE}" "label: DATA_CATALOG_LABEL"
require_text "${APP_FILE}" "[DATA_CATALOG_PAGE_ID]: DataSources"
require_text "${APP_FILE}" "? DATA_CATALOG_PAGE_ID"
if grep -qF -- "items.push(DATA_CATALOG_NAV_ITEM);" "${APP_FILE}"; then
  fail "Data Catalog must not be duplicated in AI Lakehouse tools"
fi
if grep -qF -- "api.features.get()" "${APP_FILE}" "${API_FILE}"; then
  fail "Data Sources must not depend on the MongoDB feature flag"
fi
require_text "${PAGE_FILE}" "Create Database Links"
require_text "${PAGE_FILE}" "Replace Database Links"
require_text "${PAGE_FILE}" "Open Data Studio"
require_text "${PAGE_FILE}" "IMPORTANCE_CONTENT.dataCatalog"
require_text "${PAGE_FILE}" "api.sourceCatalogs.create()"
require_text "${PAGE_FILE}" "api.sourceCatalogs.replace()"
require_text "${ROUTE_FILE}" "router.get('/', (req, res) =>"
require_text "${ROUTE_FILE}" 'mysql://${host}'
require_text "${ROUTE_FILE}" "function sourcePort("
require_text "${ROUTE_FILE}" "LOYALTY_MYSQL_CATALOG_PORT"
reject_text "${ROUTE_FILE}" 'postgresql://${host}'
reject_text "${ROUTE_FILE}" 'mongodb://${host}'
reject_text "${ROUTE_FILE}" 'oracle://${host}'
require_text "${API_FILE}" "sourceCatalogs:"
require_text "${API_FILE}" "create: () => apiFetch('/source-catalogs', { method: 'POST' })"
require_text "${API_FILE}" "replace: () => apiFetch('/source-catalogs?replace=true', { method: 'POST' })"

echo "Source database Compose checks passed."
