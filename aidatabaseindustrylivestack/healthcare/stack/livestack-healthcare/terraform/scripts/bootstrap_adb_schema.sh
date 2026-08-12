#!/usr/bin/env bash
set -euo pipefail

# Optional helper for the app VM or an operator workstation after Resource
# Manager apply. It is not called by Terraform. Review the generated SQL before
# running against a real Autonomous Database.

usage() {
  cat <<'USAGE'
Usage:
  CONFIRM_RUN_ADB_BOOTSTRAP=yes \
  SQLCL=sql \
  HEALTHCARE_SOURCE_DIR=/opt/healthcare-livestack/source/current \
  ADB_CONNECT_STRING='<ADB connect string or TNS alias>' \
  ADB_ADMIN_PASSWORD='<ADMIN password>' \
  APP_SCHEMA_USER=LIVESTACK \
  APP_SCHEMA_PASSWORD='<schema password>' \
  ./bootstrap_adb_schema.sh

This mirrors the compose bootstrap order as closely as possible for ADB:
  1. Run db/schema/00_setup.sql as ADMIN, with APP_SCHEMA_USER/PASSWORD inserted.
  2. Run core schema scripts as the app schema.
  3. Run security admin section as ADMIN.
  4. Run security schema section and load_all_data.sql as the app schema.
  5. Run hydration scripts, graph reload, semantic views, and agent functions.

Prerequisites:
  - SQLcl on PATH, or SQLCL=/path/to/sql.
  - ADB wallet/TNS configured if mTLS is required.
  - The ONNX file available to DATA_PUMP_DIR before 04_vector.sql or hydration.
  - 07_ai_profile.sql reviewed and sanitized before any optional Select AI profile work.
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

: "${CONFIRM_RUN_ADB_BOOTSTRAP:?Set CONFIRM_RUN_ADB_BOOTSTRAP=yes after reviewing this helper.}"
if [ "${CONFIRM_RUN_ADB_BOOTSTRAP}" != "yes" ]; then
  echo "Refusing to run. Set CONFIRM_RUN_ADB_BOOTSTRAP=yes after review." >&2
  exit 1
fi

SQLCL="${SQLCL:-sql}"
HEALTHCARE_SOURCE_DIR="${HEALTHCARE_SOURCE_DIR:-/opt/healthcare-livestack/source/current}"
APP_SCHEMA_USER="${APP_SCHEMA_USER:-LIVESTACK}"

: "${ADB_CONNECT_STRING:?Set ADB_CONNECT_STRING.}"
: "${ADB_ADMIN_PASSWORD:?Set ADB_ADMIN_PASSWORD.}"
: "${APP_SCHEMA_PASSWORD:?Set APP_SCHEMA_PASSWORD.}"

if ! command -v "${SQLCL}" >/dev/null 2>&1; then
  echo "SQLcl command not found: ${SQLCL}" >&2
  exit 1
fi

cd "${HEALTHCARE_SOURCE_DIR}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

APP_SCHEMA_USER_SQL="$(escape_sed "${APP_SCHEMA_USER}")"
APP_SCHEMA_PASSWORD_SQL="$(escape_sed "${APP_SCHEMA_PASSWORD}")"

sed \
  -e "s/^DEFINE APP_SCHEMA_USER = .*/DEFINE APP_SCHEMA_USER = ${APP_SCHEMA_USER_SQL}/" \
  -e "s/^DEFINE APP_SCHEMA_PASSWORD = .*/DEFINE APP_SCHEMA_PASSWORD = ${APP_SCHEMA_PASSWORD_SQL}/" \
  db/schema/00_setup.sql > "${TMP_DIR}/00_setup_adb.sql"

awk '
  index($0, "-- SECTION 1: RUN AS ADMIN") { in_section = 1; next }
  index($0, "-- SECTION 2: RUN AS SCHEMA OWNER") { in_section = 0; exit }
  in_section { print }
' db/schema/06_security.sql > "${TMP_DIR}/06_security_admin.sql"

awk '
  index($0, "-- SECTION 2: RUN AS SCHEMA OWNER") { in_section = 1; next }
  in_section { print }
' db/schema/06_security.sql > "${TMP_DIR}/06_security_schema.sql"

awk '
  index($0, "-- PRODUCT EMBEDDINGS") { in_section = 1; next }
  in_section { print }
' db/schema/04_vector.sql > "${TMP_DIR}/04_vector_schema.sql"

awk '
  index($0, "-- STEP 2: CREATE PL/SQL FUNCTIONS THAT BECOME AGENT TOOLS") { in_section = 1; next }
  index($0, "-- STEP 3: CREATE SELECT AI AGENT TOOLS") { in_section = 0; exit }
  in_section { print }
' db/schema/08_agents.sql > "${TMP_DIR}/08_agents_functions.sql"

cat > "${TMP_DIR}/schema_core.sql" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@db/schema/01_tables.sql
@db/schema/02_json_collections.sql
@db/schema/03_graph.sql
@${TMP_DIR}/04_vector_schema.sql
@db/schema/05_spatial.sql
@db/schema/10_care_pathway_graph.sql
@db/schema/11_healthcare_semantic_views.sql
EXIT
SQL

cat > "${TMP_DIR}/schema_data.sql" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@${TMP_DIR}/06_security_schema.sql
@db/data/load_all_data.sql
EXIT
SQL

cat > "${TMP_DIR}/hydrate.sql" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@db/data/seed_fulfillment_zones.sql
@db/schema/10_care_pathway_graph.sql
@db/data/load_care_pathway_graph.sql
@db/schema/11_healthcare_semantic_views.sql
@${TMP_DIR}/08_agents_functions.sql
COMMIT;
EXIT
SQL

echo "Running 00_setup as ADMIN..."
"${SQLCL}" -L -s "admin/${ADB_ADMIN_PASSWORD}@${ADB_CONNECT_STRING}" @"${TMP_DIR}/00_setup_adb.sql"

echo "Running core schema as ${APP_SCHEMA_USER}..."
"${SQLCL}" -L -s "${APP_SCHEMA_USER}/${APP_SCHEMA_PASSWORD}@${ADB_CONNECT_STRING}" @"${TMP_DIR}/schema_core.sql"

echo "Running security admin section as ADMIN..."
"${SQLCL}" -L -s "admin/${ADB_ADMIN_PASSWORD}@${ADB_CONNECT_STRING}" @"${TMP_DIR}/06_security_admin.sql"

echo "Running schema data as ${APP_SCHEMA_USER}..."
"${SQLCL}" -L -s "${APP_SCHEMA_USER}/${APP_SCHEMA_PASSWORD}@${ADB_CONNECT_STRING}" @"${TMP_DIR}/schema_data.sql"

echo "Running hydration as ${APP_SCHEMA_USER}..."
"${SQLCL}" -L -s "${APP_SCHEMA_USER}/${APP_SCHEMA_PASSWORD}@${ADB_CONNECT_STRING}" @"${TMP_DIR}/hydrate.sql"

echo "ADB schema bootstrap helper complete."
