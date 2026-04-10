#!/bin/bash

set -euo pipefail

APP_DIR=/workspace/app
BOOTSTRAP_MARKER=/opt/oracle/oradata/.socialcommerce_bootstrap_done
ADMIN_CONNECT="sys/${ORACLE_PWD:-oracle}@//localhost:1521/FREEPDB1 as sysdba"
APP_CONNECT="socialcommerce/${APP_SCHEMA_PASSWORD:-socialcommerce}@//localhost:1521/FREEPDB1"
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

echo ">>> Social Commerce bootstrap starting inside db container..."
rm -f "$BOOTSTRAP_MARKER"

echo ">>> Preparing split SQL files..."
extract_between_markers \
  "-- SECTION 1: RUN AS ADMIN" \
  "-- SECTION 2: RUN AS SOCIALCOMMERCE" \
  "${APP_DIR}/db/schema/06_security.sql" \
  /tmp/06_security_admin.sql

extract_from_marker \
  "-- SECTION 2: RUN AS SOCIALCOMMERCE" \
  "${APP_DIR}/db/schema/06_security.sql" \
  /tmp/06_security_schema.sql

extract_between_markers \
  "-- STEP 2: CREATE PL/SQL FUNCTIONS THAT BECOME AGENT TOOLS" \
  "-- STEP 3: CREATE SELECT AI AGENT TOOLS" \
  "${APP_DIR}/db/schema/08_agents.sql" \
  /tmp/08_agents_functions.sql

extract_from_marker \
  "-- PRODUCT EMBEDDINGS" \
  "${APP_DIR}/db/schema/04_vector.sql" \
  /tmp/04_vector_schema.sql

for sql_file in /tmp/06_security_admin.sql /tmp/06_security_schema.sql /tmp/08_agents_functions.sql /tmp/04_vector_schema.sql; do
  if [ ! -s "$sql_file" ]; then
    echo ">>> ERROR: Failed to extract expected SQL section into $sql_file"
    exit 1
  fi
done

echo ">>> Waiting for Oracle AI Database Free service..."
until echo 'SELECT 1 FROM dual;' | sqlplus -L -s system/"${ORACLE_PWD:-oracle}"@localhost:1521/FREEPDB1 > /dev/null 2>&1; do
  sleep 5
done

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

cat > /tmp/bootstrap_admin.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM dba_users
  WHERE username = 'SOCIALCOMMERCE';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER socialcommerce IDENTIFIED BY "${APP_SCHEMA_PASSWORD:-socialcommerce}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User SOCIALCOMMERCE created.');
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER socialcommerce IDENTIFIED BY "${APP_SCHEMA_PASSWORD:-socialcommerce}"';
    EXECUTE IMMEDIATE 'ALTER USER socialcommerce DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP';
    EXECUTE IMMEDIATE 'ALTER USER socialcommerce QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User SOCIALCOMMERCE already exists. Password refreshed.');
  END IF;
END;
/
BEGIN
  FOR stmt IN (
    SELECT 'GRANT CREATE SESSION TO SOCIALCOMMERCE' AS sql_stmt FROM dual UNION ALL
    SELECT 'GRANT CREATE TABLE TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE VIEW TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE SEQUENCE TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE PROCEDURE TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE TRIGGER TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE TYPE TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE ROLE TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE JOB TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT CREATE MINING MODEL TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT UNLIMITED TABLESPACE TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT SODA_APP TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT GRAPH_DEVELOPER TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_GEOM TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_UTIL TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_CS TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON SYS.DBMS_RLS TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT AUDIT_ADMIN TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON DBMS_VECTOR TO SOCIALCOMMERCE' FROM dual UNION ALL
    SELECT 'GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO SOCIALCOMMERCE' FROM dual
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
      principal_name => 'SOCIALCOMMERCE',
      principal_type => xs_acl.ptype_db
    )
  );
  DBMS_OUTPUT.PUT_LINE('Network ACL granted to SOCIALCOMMERCE.');
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

cat > /tmp/check_base.sql <<'SQL'
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (SELECT 1 FROM dba_users WHERE username = 'SOCIALCOMMERCE')
          AND EXISTS (SELECT 1 FROM dba_tables WHERE owner = 'SOCIALCOMMERCE' AND table_name = 'PRODUCTS')
          AND EXISTS (SELECT 1 FROM dba_tables WHERE owner = 'SOCIALCOMMERCE' AND table_name = 'APP_USERS')
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL

BASE_READY="$(sqlplus -L -s "$ADMIN_CONNECT" @/tmp/check_base.sql | tr -d '[:space:]')"
sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_admin.sql

if [ "$BASE_READY" != "yes" ]; then
  echo ">>> Bootstrapping SOCIALCOMMERCE schema and core objects..."

  cat > /tmp/bootstrap_schema_core.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/01_tables.sql
@${APP_DIR}/db/schema/02_json_collections.sql
@${APP_DIR}/db/schema/03_graph.sql
@/tmp/04_vector_schema.sql
@${APP_DIR}/db/schema/05_spatial.sql
EXIT
SQL

  cat > /tmp/bootstrap_security_admin.sql <<'SQL'
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06_security_admin.sql
EXIT
SQL

  cat > /tmp/bootstrap_schema_data.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06_security_schema.sql
@${APP_DIR}/db/data/load_all_data.sql
EXIT
SQL

  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_core.sql
  sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_security_admin.sql
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_data.sql
else
  echo ">>> Core schema already present. Skipping base bootstrap."
fi

echo ">>> Running idempotent hydration steps..."
cat > /tmp/hydrate.sql <<SQL
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
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
COMMIT;
EXIT
SQL

sqlplus -L -s "$APP_CONNECT" @/tmp/hydrate.sql
touch "$BOOTSTRAP_MARKER"
echo ">>> Database bootstrap complete."
