#!/bin/bash

set -euo pipefail

APP_DIR=/workspace/app
BOOTSTRAP_MARKER=/opt/oracle/oradata/.app_schema_bootstrap_done
APP_SCHEMA_USER="${ORACLE_USER:-LIVESTACK}"
APP_SCHEMA_PASSWORD="${APP_SCHEMA_PASSWORD:-livestackrulez!}"

if [[ ! "$APP_SCHEMA_USER" =~ ^[A-Za-z][A-Za-z0-9_]{0,127}$ ]]; then
  echo ">>> ERROR: ORACLE_USER must be an unquoted Oracle identifier using letters, numbers, or underscores."
  exit 1
fi

APP_SCHEMA_USER_UPPER="$(printf '%s' "$APP_SCHEMA_USER" | tr '[:lower:]' '[:upper:]')"
APP_SCHEMA_USER_LOWER="$(printf '%s' "$APP_SCHEMA_USER" | tr '[:upper:]' '[:lower:]')"
APP_SCHEMA_PASSWORD_SQL="${APP_SCHEMA_PASSWORD//\"/\"\"}"

ADMIN_CONNECT="sys/${ORACLE_PWD:-oracle}@//localhost:1521/FREEPDB1 as sysdba"
APP_CONNECT="${APP_SCHEMA_USER_UPPER}/${APP_SCHEMA_PASSWORD}@//localhost:1521/FREEPDB1"
ONNX_MODEL_URL="${ONNX_MODEL_URL:-https://adwc4pm.objectstorage.us-ashburn-1.oci.customer-oci.com/p/eLddQappgBJ7jNi6Guz9m9LOtYe2u8LWY19GfgU8flFK4N9YgP4kTlrE9Px3pE12/n/adwc4pm/b/OML-Resources/o/all_MiniLM_L12_v2.onnx}"

extract_between_markers() {
  local start_marker="$1"
  local end_marker="$2"
  local source_file="$3"
  local target_file="$4"

  awk -v start="$start_marker" -v end="$end_marker" '
    index($0, start) { in_section = 1; next }
    index($0, end)   { in_section = 0; exit }
    in_section       { print }
  ' "$source_file" > "$target_file"
}

extract_from_marker() {
  local start_marker="$1"
  local source_file="$2"
  local target_file="$3"

  awk -v start="$start_marker" '
    index($0, start) { in_section = 1; next }
    in_section       { print }
  ' "$source_file" > "$target_file"
}

apply_schema_user() {
  local sql_file="$1"

  sed -i.bak \
    -e "s/LIVESTACK/${APP_SCHEMA_USER_UPPER}/g" \
    -e "s/livestack\\./${APP_SCHEMA_USER_LOWER}./g" \
    "$sql_file"
  rm -f "${sql_file}.bak"
}

echo ">>> State and Local Government Service Operations bootstrap starting inside db container..."
rm -f "$BOOTSTRAP_MARKER"

echo ">>> Preparing split SQL files..."
extract_between_markers \
  "-- SECTION 1: RUN AS ADMIN" \
  "-- SECTION 2: RUN AS SCHEMA OWNER" \
  "${APP_DIR}/db/schema/06_security.sql" \
  /tmp/06_security_admin.sql

extract_between_markers \
  "-- SECTION 2A: TRUSTED PACKAGE BEGIN" \
  "-- SECTION 2A: TRUSTED PACKAGE END" \
  "${APP_DIR}/db/schema/06b_sled_vpd.sql" \
  /tmp/06b_sled_package.sql

extract_between_markers \
  "-- SECTION 2B: VPD POLICIES BEGIN" \
  "-- SECTION 2B: VPD POLICIES END" \
  "${APP_DIR}/db/schema/06b_sled_vpd.sql" \
  /tmp/06b_sled_policies.sql

extract_between_markers \
  "-- STEP 2: CREATE PL/SQL FUNCTIONS THAT BECOME AGENT TOOLS" \
  "-- STEP 3: CREATE SELECT AI AGENT TOOLS" \
  "${APP_DIR}/db/schema/08_agents.sql" \
  /tmp/08_agents_functions.sql

extract_from_marker \
  "-- PRODUCT EMBEDDINGS" \
  "${APP_DIR}/db/schema/04_vector.sql" \
  /tmp/04_vector_schema.sql

for sql_file in /tmp/06_security_admin.sql /tmp/06b_sled_package.sql /tmp/06b_sled_policies.sql /tmp/08_agents_functions.sql /tmp/04_vector_schema.sql; do
  if [ ! -s "$sql_file" ]; then
    echo ">>> ERROR: Failed to extract expected SQL section into $sql_file"
    exit 1
  fi
done

apply_schema_user /tmp/06_security_admin.sql

echo ">>> Waiting for Oracle AI Database Free service..."
until echo 'SELECT 1 FROM dual;' | sqlplus -L -s system/"${ORACLE_PWD:-oracle}"@localhost:1521/FREEPDB1 > /dev/null 2>&1; do
  sleep 5
done

cat > /tmp/bootstrap_admin.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM dba_users
  WHERE username = '${APP_SCHEMA_USER_UPPER}';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER ${APP_SCHEMA_USER_UPPER} IDENTIFIED BY "${APP_SCHEMA_PASSWORD_SQL}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User ${APP_SCHEMA_USER_UPPER} created.');
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER ${APP_SCHEMA_USER_UPPER} IDENTIFIED BY "${APP_SCHEMA_PASSWORD_SQL}"';
    EXECUTE IMMEDIATE 'ALTER USER ${APP_SCHEMA_USER_UPPER} DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP';
    EXECUTE IMMEDIATE 'ALTER USER ${APP_SCHEMA_USER_UPPER} QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User ${APP_SCHEMA_USER_UPPER} already exists. Password refreshed.');
  END IF;
END;
/
BEGIN
  FOR stmt IN (
    SELECT 'GRANT CREATE SESSION TO ${APP_SCHEMA_USER_UPPER}' AS sql_stmt FROM dual UNION ALL
    SELECT 'GRANT CREATE TABLE TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE VIEW TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE SEQUENCE TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE PROCEDURE TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE TRIGGER TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE TYPE TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE ROLE TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE JOB TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT CREATE MINING MODEL TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT UNLIMITED TABLESPACE TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT SODA_APP TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT GRAPH_DEVELOPER TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_GEOM TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_UTIL TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_CS TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON SYS.DBMS_RLS TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT AUDIT_ADMIN TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON DBMS_VECTOR TO ${APP_SCHEMA_USER_UPPER}' FROM dual UNION ALL
    SELECT 'GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO ${APP_SCHEMA_USER_UPPER}' FROM dual
  ) LOOP
    BEGIN
      EXECUTE IMMEDIATE stmt.sql_stmt;
    EXCEPTION
      WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Skipping grant: ' || stmt.sql_stmt || ' -> ' || SQLERRM);
    END;
  END LOOP;
END;
/
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '*',
    ace  => xs\$ace_type(
      privilege_list => xs\$name_list('connect', 'resolve'),
      principal_name => '${APP_SCHEMA_USER_UPPER}',
      principal_type => xs_acl.ptype_db
    )
  );
  DBMS_OUTPUT.PUT_LINE('Network ACL granted to ${APP_SCHEMA_USER_UPPER}.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -44416 THEN
      DBMS_OUTPUT.PUT_LINE('Network ACL already exists.');
    ELSE
      DBMS_OUTPUT.PUT_LINE('Skipping network ACL: ' || SQLERRM);
    END IF;
END;
/
EXIT
SQL

cat > /tmp/check_base.sql <<SQL
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (SELECT 1 FROM dba_users WHERE username = '${APP_SCHEMA_USER_UPPER}')
          AND EXISTS (SELECT 1 FROM dba_tables WHERE owner = '${APP_SCHEMA_USER_UPPER}' AND table_name = 'PRODUCTS')
          AND EXISTS (SELECT 1 FROM dba_tables WHERE owner = '${APP_SCHEMA_USER_UPPER}' AND table_name = 'APP_USERS')
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL

BASE_READY="$(sqlplus -L -s "$ADMIN_CONNECT" @/tmp/check_base.sql | tr -d '[:space:]')"
sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_admin.sql

MODEL_READY="$(
  sqlplus -L -s "$APP_CONNECT" <<'SQL'
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (
           SELECT 1
           FROM user_mining_models
           WHERE model_name = 'ALL_MINILM_L12_V2'
         )
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL
)"
MODEL_READY="$(printf '%s' "$MODEL_READY" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"

if [ "$MODEL_READY" != "yes" ]; then
  MODEL_DIR="$(
    sqlplus -L -s "$ADMIN_CONNECT" <<'SQL'
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT RTRIM(directory_path, '/')
FROM dba_directories
WHERE directory_name = 'DATA_PUMP_DIR';
EXIT
SQL
)"
  MODEL_DIR="$(printf '%s' "$MODEL_DIR" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"

  if [ -z "$MODEL_DIR" ]; then
    echo ">>> ERROR: Unable to resolve DATA_PUMP_DIR path."
    exit 1
  fi

  MODEL_PATH="${MODEL_DIR}/${ONNX_MODEL_FILENAME:-all_MiniLM_L12_v2.onnx}"
  MODEL_TEMP="${MODEL_PATH}.part"

  echo ">>> Ensuring ONNX model is available in DATA_PUMP_DIR..."
  mkdir -p "$MODEL_DIR"
  if [ ! -s "$MODEL_PATH" ]; then
    rm -f "$MODEL_TEMP"
    curl -fL \
      --retry 5 \
      --retry-delay 2 \
      "$ONNX_MODEL_URL" \
      -o "$MODEL_TEMP"
    mv "$MODEL_TEMP" "$MODEL_PATH"
  fi
  chmod 644 "$MODEL_PATH"
  ls -lh "$MODEL_PATH"
else
  echo ">>> ONNX model ALL_MINILM_L12_V2 already loaded; skipping DATA_PUMP_DIR file check."
fi

# VECTOR_EMBEDDING-dependent functions must never compile before the ONNX
# model is registered and proven to produce SLED's fixed 384-dimensional form.
echo ">>> Loading and probing ALL_MINILM_L12_V2 before vector schema compilation..."
cat > /tmp/load_and_probe_onnx.sql <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_mining_models WHERE model_name = 'ALL_MINILM_L12_V2';
  IF v_count = 0 THEN
    DBMS_VECTOR.LOAD_ONNX_MODEL(
      directory => 'DATA_PUMP_DIR', file_name => '${ONNX_MODEL_FILENAME:-all_MiniLM_L12_v2.onnx}',
      model_name => 'ALL_MINILM_L12_V2',
      metadata => JSON('{"function":"embedding","embeddingOutput":"embedding","input":{"input":["DATA"]}}')
    );
  END IF;
END;
/
SELECT VECTOR_DIMENSION_COUNT(VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING 'Colorado SLED bootstrap model probe' AS DATA)) FROM dual;
EXIT SUCCESS
SQL
sqlplus -L -s "$APP_CONNECT" @/tmp/load_and_probe_onnx.sql >/tmp/onnx_model_probe.out
if ! grep -Eq '(^|[[:space:]])384([[:space:]]|$)' /tmp/onnx_model_probe.out; then
  echo ">>> ERROR: ALL_MINILM_L12_V2 probe did not return a 384-dimension vector."
  cat /tmp/onnx_model_probe.out
  exit 1
fi

if [ "$BASE_READY" != "yes" ]; then
  echo ">>> Bootstrapping ${APP_SCHEMA_USER_UPPER} schema and core objects..."

  cat > /tmp/bootstrap_schema_core.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/01_tables.sql
@${APP_DIR}/db/schema/02_json_collections.sql
@${APP_DIR}/db/schema/03_graph.sql
@/tmp/04_vector_schema.sql
@${APP_DIR}/db/schema/05_spatial.sql
@${APP_DIR}/db/schema/12_ml_persistence.sql
@${APP_DIR}/db/schema/13_oml_model_lifecycle.sql
@${APP_DIR}/db/schema/14_sled_dataset_generation_lifecycle.sql
EXIT
SQL

  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_core.sql
else
  echo ">>> Core schema already present. Skipping base bootstrap."
fi

echo ">>> Enforcing retained SLED VECTOR(384,FLOAT32,DENSE) storage contract..."
sqlplus -L -s "$APP_CONNECT" @"${APP_DIR}/db/schema/15_sled_vector_contract.sql"

cat > /tmp/bootstrap_security_admin.sql <<'SQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06_security_admin.sql
EXIT
SQL

cat > /tmp/bootstrap_security_package.sql <<'SQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06b_sled_package.sql
EXIT
SQL

cat > /tmp/bootstrap_security_policies.sql <<'SQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06b_sled_policies.sql
EXIT
SQL

cat > /tmp/bootstrap_region_scope.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/06c_sled_region_scope.sql
EXIT
SQL

cat > /tmp/bootstrap_retained_dependencies.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tables
  WHERE table_name IN (
    'APP_USERS', 'PRODUCTS', 'FULFILLMENT_CENTERS', 'INVENTORY', 'CUSTOMERS',
    'ORDERS', 'ORDER_ITEMS', 'SHIPMENTS', 'FULFILLMENT_ZONES',
    'DEMAND_REGIONS', 'DEMAND_FORECASTS', 'AGENT_ACTIONS', 'EVENT_STREAM',
    'INFLUENCERS', 'SOCIAL_POSTS', 'INFLUENCER_CONNECTIONS',
    'BRAND_INFLUENCER_LINKS', 'POST_PRODUCT_MENTIONS', 'POST_EMBEDDINGS',
    'SEMANTIC_MATCHES'
  );
  IF v_count <> 20 THEN
    RAISE_APPLICATION_ERROR(-20069, 'Retained SLED schema is incomplete; refusing security setup');
  END IF;
END;
/
@${APP_DIR}/db/schema/12_ml_persistence.sql
@${APP_DIR}/db/schema/13_oml_model_lifecycle.sql
@${APP_DIR}/db/schema/14_sled_dataset_generation_lifecycle.sql
EXIT
SQL

sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_security_admin.sql

if [ "$BASE_READY" != "yes" ]; then
  echo ">>> Installing trusted package and loading fresh regional data..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_security_package.sql
  sqlplus -L -s "$ADMIN_CONNECT" \
    @"${APP_DIR}/db/schema/06a_sled_app_context_admin.sql" \
    "${APP_SCHEMA_USER_UPPER}"
  sqlplus -L -s "$APP_CONNECT" <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@${APP_DIR}/db/data/load_all_data.sql
EXIT
SQL
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_region_scope.sql
else
  echo ">>> Applying retained-volume regional ownership setup..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_retained_dependencies.sql
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_region_scope.sql
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_security_package.sql
  sqlplus -L -s "$ADMIN_CONNECT" \
    @"${APP_DIR}/db/schema/06a_sled_app_context_admin.sql" \
    "${APP_SCHEMA_USER_UPPER}"
fi

echo ">>> Installing context-sensitive SLED VPD policies..."
sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_security_policies.sql

echo ">>> Running idempotent hydration steps..."
cat > /tmp/hydrate.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
BEGIN
  sled_security_pkg.set_user_context('admin_jess');
END;
/
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_mining_models
  WHERE model_name = 'ALL_MINILM_L12_V2';

  IF v_count = 0 THEN
    DBMS_VECTOR.LOAD_ONNX_MODEL(
      directory  => 'DATA_PUMP_DIR',
      file_name  => '${ONNX_MODEL_FILENAME:-all_MiniLM_L12_v2.onnx}',
      model_name => 'ALL_MINILM_L12_V2',
      metadata   => JSON('{"function":"embedding","embeddingOutput":"embedding","input":{"input":["DATA"]}}')
    );
    DBMS_OUTPUT.PUT_LINE('Loaded ALL_MINILM_L12_V2.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('ALL_MINILM_L12_V2 already present.');
  END IF;
END;
/
ALTER FUNCTION search_products_by_text COMPILE;
@${APP_DIR}/db/data/seed_fulfillment_zones.sql
@/tmp/08_agents_functions.sql
@${APP_DIR}/db/schema/09_comments.sql
@${APP_DIR}/db/schema/10_sled_views.sql
@${APP_DIR}/db/schema/12_ml_persistence.sql
@${APP_DIR}/db/schema/13_oml_model_lifecycle.sql
BEGIN
  refresh_sled_oml_models;
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Skipping refresh_sled_oml_models during bootstrap: ' || SQLERRM);
END;
/
BEGIN
  sled_security_pkg.clear_user_context;
END;
/
COMMIT;
EXIT
SQL

sqlplus -L -s "$APP_CONNECT" @/tmp/hydrate.sql
touch "$BOOTSTRAP_MARKER"
echo ">>> Database bootstrap complete."
