#!/bin/bash

set -euo pipefail

APP_DIR=/workspace/app
BOOTSTRAP_MARKER=/opt/oracle/oradata/.pggold_bootstrap_done
ORACLE_HOME="${ORACLE_HOME:-/opt/oracle/product/26ai/dbhomeFree}"
ADMIN_CONNECT="sys/${ORACLE_PWD:-oracle}@//localhost:1521/FREEPDB1 as sysdba"
PG_SCHEMA_PASSWORD="${DBPASSWORD:-${APP_SCHEMA_PASSWORD:-peakgear}}"
APP_CONNECT="pg/${PG_SCHEMA_PASSWORD}@//localhost:1521/FREEPDB1"
ONNX_MODEL_URL="${ONNX_MODEL_URL:-https://adwc4pm.objectstorage.us-ashburn-1.oci.customer-oci.com/p/eLddQappgBJ7jNi6Guz9m9LOtYe2u8LWY19GfgU8flFK4N9YgP4kTlrE9Px3pE12/n/adwc4pm/b/OML-Resources/o/all_MiniLM_L12_v2.onnx}"
DBMS_CLOUD_WALLET_DIR="${DBMS_CLOUD_WALLET_DIR:-/opt/oracle/oradata/dbms_cloud_wallet}"
DBMS_CLOUD_WALLET_PASSWORD="${DBMS_CLOUD_WALLET_PASSWORD:-${ORACLE_PWD:-oracle}}"
DBMS_CLOUD_CA_BUNDLE="${DBMS_CLOUD_CA_BUNDLE:-/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem}"
GENAI_REGION="${OCI_REGION:-${AI_ENDPOINT_REGION:-${REGION_IDENTIFIER:-}}}"
DBMS_CLOUD_ENDPOINT_HOST="${DBMS_CLOUD_ENDPOINT_HOST:-}"

if [ -z "$DBMS_CLOUD_ENDPOINT_HOST" ] && [ -n "$GENAI_REGION" ]; then
  DBMS_CLOUD_ENDPOINT_HOST="inference.generativeai.${GENAI_REGION}.oci.oraclecloud.com"
fi

if [ -z "$DBMS_CLOUD_ENDPOINT_HOST" ] && [ -n "${OCI_GENAI_ENDPOINT:-}" ]; then
  DBMS_CLOUD_ENDPOINT_HOST="$(printf '%s' "$OCI_GENAI_ENDPOINT" | sed -E 's#^https?://([^/:]+).*#\1#')"
fi

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

add_cert_bundle_to_dbms_cloud_wallet() {
  local source_bundle="$1"
  local cert_dir="$2"
  local cert_prefix="$3"

  if [ ! -s "$source_bundle" ]; then
    return 0
  fi

  mkdir -p "$cert_dir"
  rm -f "${cert_dir}/${cert_prefix}"_*.pem
  awk -v dir="$cert_dir" -v prefix="$cert_prefix" '
    BEGIN { n = 0; in_cert = 0 }
    /-----BEGIN CERTIFICATE-----/ {
      n++
      in_cert = 1
      file = sprintf("%s/%s_%04d.pem", dir, prefix, n)
    }
    in_cert { print > file }
    /-----END CERTIFICATE-----/ {
      close(file)
      in_cert = 0
    }
  ' "$source_bundle" || return 0

  for cert_file in "${cert_dir}/${cert_prefix}"_*.pem; do
    [ -s "$cert_file" ] || continue
    "${ORACLE_HOME}/bin/orapki" wallet add \
      -wallet "$DBMS_CLOUD_WALLET_DIR" \
      -trusted_cert \
      -cert "$cert_file" \
      -pwd "$DBMS_CLOUD_WALLET_PASSWORD" >/dev/null 2>&1 || true
  done
}

ensure_dbms_cloud_ssl_wallet() {
  echo ">>> Ensuring DBMS_CLOUD SSL wallet and network ACLs are configured..."

  mkdir -p "$DBMS_CLOUD_WALLET_DIR" /tmp/dbms_cloud_wallet_certs
  if [ ! -s "${DBMS_CLOUD_WALLET_DIR}/cwallet.sso" ]; then
    rm -f "${DBMS_CLOUD_WALLET_DIR}/ewallet.p12" "${DBMS_CLOUD_WALLET_DIR}/cwallet.sso"
    "${ORACLE_HOME}/bin/orapki" wallet create \
      -wallet "$DBMS_CLOUD_WALLET_DIR" \
      -pwd "$DBMS_CLOUD_WALLET_PASSWORD" \
      -auto_login
  fi

  add_cert_bundle_to_dbms_cloud_wallet "$DBMS_CLOUD_CA_BUNDLE" /tmp/dbms_cloud_wallet_certs os_ca

  if [ -n "$DBMS_CLOUD_ENDPOINT_HOST" ] && command -v openssl >/dev/null 2>&1; then
    echo ">>> Importing OCI GenAI TLS chain for ${DBMS_CLOUD_ENDPOINT_HOST}..."
    if openssl s_client \
      -showcerts \
      -servername "$DBMS_CLOUD_ENDPOINT_HOST" \
      -connect "${DBMS_CLOUD_ENDPOINT_HOST}:443" </dev/null >/tmp/dbms_cloud_wallet_certs/genai_chain.pem 2>/tmp/dbms_cloud_wallet_certs/genai_chain.err; then
      if [ -s /tmp/dbms_cloud_wallet_certs/genai_chain.pem ]; then
        add_cert_bundle_to_dbms_cloud_wallet /tmp/dbms_cloud_wallet_certs/genai_chain.pem /tmp/dbms_cloud_wallet_certs genai
      else
        echo ">>> OCI GenAI TLS chain import skipped; endpoint returned no certificates during bootstrap."
      fi
    else
      echo ">>> OCI GenAI TLS chain import skipped; endpoint was not reachable during bootstrap."
      sed 's/^/>>> openssl: /' /tmp/dbms_cloud_wallet_certs/genai_chain.err || true
    fi
  fi

  sqlplus -L -s "/ as sysdba" <<SQL
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
ALTER DATABASE PROPERTY SET ssl_wallet='file:${DBMS_CLOUD_WALLET_DIR}';
DECLARE
  v_exists NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_exists
  FROM dba_users
  WHERE username = 'C##CLOUD\$SERVICE';

  IF v_exists > 0 THEN
    BEGIN
      DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
        host => '*',
        lower_port => 443,
        upper_port => 443,
        ace => xs\$ace_type(
          privilege_list => xs\$name_list('http', 'http_proxy'),
          principal_name => 'C##CLOUD\$SERVICE',
          principal_type => xs_acl.ptype_db
        )
      );
      DBMS_OUTPUT.PUT_LINE('DBMS_CLOUD host ACE granted.');
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE = -44416 THEN
          DBMS_OUTPUT.PUT_LINE('DBMS_CLOUD host ACE already exists.');
        ELSE
          RAISE;
        END IF;
    END;

    BEGIN
      DBMS_NETWORK_ACL_ADMIN.APPEND_WALLET_ACE(
        wallet_path => 'file:${DBMS_CLOUD_WALLET_DIR}',
        ace => xs\$ace_type(
          privilege_list => xs\$name_list('use_client_certificates', 'use_passwords'),
          principal_name => 'C##CLOUD\$SERVICE',
          principal_type => xs_acl.ptype_db
        )
      );
      DBMS_OUTPUT.PUT_LINE('DBMS_CLOUD wallet ACE granted.');
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE = -44416 THEN
          DBMS_OUTPUT.PUT_LINE('DBMS_CLOUD wallet ACE already exists.');
        ELSE
          RAISE;
        END IF;
    END;
  END IF;
END;
/
EXIT
SQL
}

echo ">>> PeakGear Sporting Goods bootstrap starting inside db container..."
rm -f "$BOOTSTRAP_MARKER"

echo ">>> Intake split SQL files..."
extract_between_markers \
  "-- SECTION 1: RUN AS ADMIN" \
  "-- SECTION 2: RUN AS PG" \
  "${APP_DIR}/db/schema/06_security.sql" \
  /tmp/06_security_admin.sql

extract_from_marker \
  "-- SECTION 2: RUN AS PG" \
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

echo ">>> Ensuring DBMS_CLOUD and DBMS_CLOUD_AI are installed..."
CLOUD_USER_READY="$(
  sqlplus -L -s "$ADMIN_CONNECT" <<'SQL'
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (
                SELECT 1
                FROM   dba_users
                WHERE  username = 'C##CLOUD$SERVICE'
              )
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL
)"
CLOUD_USER_READY="$(printf '%s' "$CLOUD_USER_READY" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
if [ "$CLOUD_USER_READY" != "yes" ]; then
  ROOT_CLOUD_USER_READY="$(
    sqlplus -L -s "/ as sysdba" <<'SQL'
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (
                SELECT 1
                FROM   dba_users
                WHERE  username = 'C##CLOUD$SERVICE'
              )
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL
  )"
  ROOT_CLOUD_USER_READY="$(printf '%s' "$ROOT_CLOUD_USER_READY" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"

  if [ "$ROOT_CLOUD_USER_READY" = "yes" ]; then
    echo ">>> Creating C##CLOUD\$SERVICE in FREEPDB1 for DBMS_CLOUD..."
    sqlplus -L -s "$ADMIN_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@?/rdbms/admin/catclouduser.sql
EXIT
SQL
  else
    echo ">>> Creating C##CLOUD\$SERVICE for DBMS_CLOUD using catcon.pl..."
    mkdir -p /tmp/dbms_cloud_install
    "${ORACLE_HOME}/perl/bin/perl" "${ORACLE_HOME}/rdbms/admin/catcon.pl" \
      -u "sys/${ORACLE_PWD:-oracle}" \
      -force_pdb_mode 'READ WRITE' \
      -b dbms_cloud_install \
      -d "${ORACLE_HOME}/rdbms/admin" \
      -l /tmp/dbms_cloud_install \
      catclouduser.sql
  fi
else
  echo ">>> C##CLOUD\$SERVICE already exists."
fi

DBMS_CLOUD_READY="$(
  sqlplus -L -s "$ADMIN_CONNECT" <<'SQL'
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (
                SELECT 1
                FROM   dba_objects
                WHERE  owner = 'C##CLOUD$SERVICE'
                  AND  object_name = 'DBMS_CLOUD'
                  AND  object_type = 'PACKAGE'
                  AND  status = 'VALID'
              )
          AND EXISTS (
                SELECT 1
                FROM   dba_objects
                WHERE  owner = 'C##CLOUD$SERVICE'
                  AND  object_name = 'DBMS_CLOUD_AI'
                  AND  object_type = 'PACKAGE'
                  AND  status = 'VALID'
              )
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL
)"
DBMS_CLOUD_READY="$(printf '%s' "$DBMS_CLOUD_READY" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
if [ "$DBMS_CLOUD_READY" != "yes" ]; then
  echo ">>> Installing DBMS_CLOUD packages using catcon.pl..."
  mkdir -p /tmp/dbms_cloud_install
  "${ORACLE_HOME}/perl/bin/perl" "${ORACLE_HOME}/rdbms/admin/catcon.pl" \
    -u "sys/${ORACLE_PWD:-oracle}" \
    -force_pdb_mode 'READ WRITE' \
    -b dbms_cloud_install \
    -d "${ORACLE_HOME}/rdbms/admin" \
    -l /tmp/dbms_cloud_install \
    dbms_cloud_install.sql
else
  echo ">>> DBMS_CLOUD packages already installed in FREEPDB1."
fi

ensure_dbms_cloud_ssl_wallet

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
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
DECLARE
  v_count NUMBER;
  PROCEDURE grant_if_exists(p_role VARCHAR2) IS
    v_role_count NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_role_count FROM dba_roles WHERE role = UPPER(p_role);
    IF v_role_count > 0 THEN
      EXECUTE IMMEDIATE 'GRANT ' || p_role || ' TO PG';
      DBMS_OUTPUT.PUT_LINE('Granted role ' || p_role || ' to PG.');
    ELSE
      DBMS_OUTPUT.PUT_LINE('Role not present, skipped for PG: ' || p_role);
    END IF;
  END;
  PROCEDURE grant_sys_priv(p_priv VARCHAR2) IS
  BEGIN
    EXECUTE IMMEDIATE 'GRANT ' || p_priv || ' TO PG';
    DBMS_OUTPUT.PUT_LINE('Granted ' || p_priv || ' to PG.');
  EXCEPTION
    WHEN OTHERS THEN
      DBMS_OUTPUT.PUT_LINE('Skipping PG grant: ' || p_priv || ' -> ' || SQLERRM);
  END;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM dba_users
  WHERE username = 'PG';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER PG IDENTIFIED BY "${PG_SCHEMA_PASSWORD}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User PG created.');
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER PG IDENTIFIED BY "${PG_SCHEMA_PASSWORD}" ACCOUNT UNLOCK';
    EXECUTE IMMEDIATE 'ALTER USER PG DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP';
    EXECUTE IMMEDIATE 'ALTER USER PG QUOTA UNLIMITED ON USERS';
    DBMS_OUTPUT.PUT_LINE('User PG already exists. Password refreshed.');
  END IF;

  grant_sys_priv('CREATE SESSION');
  grant_sys_priv('CREATE TABLE');
  grant_sys_priv('CREATE VIEW');
  grant_sys_priv('CREATE SEQUENCE');
  grant_sys_priv('CREATE PROCEDURE');
  grant_sys_priv('CREATE TRIGGER');
  grant_sys_priv('CREATE TYPE');
  grant_sys_priv('CREATE ROLE');
  grant_sys_priv('CREATE JOB');
  grant_sys_priv('CREATE MINING MODEL');
  grant_sys_priv('UNLIMITED TABLESPACE');
  grant_sys_priv('CREATE CREDENTIAL');
  grant_if_exists('SODA_APP');
  grant_if_exists('GRAPH_DEVELOPER');
  grant_if_exists('DB_DEVELOPER_ROLE');
  grant_if_exists('AUDIT_ADMIN');

  FOR stmt IN (
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_GEOM TO PG' AS sql_stmt FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_UTIL TO PG' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON MDSYS.SDO_CS TO PG' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON SYS.DBMS_RLS TO PG' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON DBMS_VECTOR TO PG' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON DBMS_CLOUD TO PG' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON DBMS_CLOUD_AI TO PG' FROM dual UNION ALL
    SELECT 'GRANT EXECUTE ON DBMS_CLOUD_AI_AGENT TO PG' FROM dual UNION ALL
    SELECT 'GRANT READ, WRITE ON DIRECTORY DATA_PUMP_DIR TO PG' FROM dual
  ) LOOP
    BEGIN
      EXECUTE IMMEDIATE stmt.sql_stmt;
      DBMS_OUTPUT.PUT_LINE('Granted: ' || stmt.sql_stmt);
    EXCEPTION
      WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Skipping PG grant: ' || stmt.sql_stmt || ' -> ' || SQLERRM);
    END;
  END LOOP;
END;
/
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '*',
    ace  => xs\$ace_type(
      privilege_list => xs\$name_list('connect', 'resolve'),
      principal_name => 'PG',
      principal_type => xs_acl.ptype_db
    )
  );
  DBMS_OUTPUT.PUT_LINE('Network ACL granted to PG.');
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
         WHEN EXISTS (SELECT 1 FROM dba_users WHERE username = 'PG')
          AND EXISTS (SELECT 1 FROM dba_tables WHERE owner = 'PG' AND table_name = 'PRODUCTS')
          AND EXISTS (SELECT 1 FROM dba_tables WHERE owner = 'PG' AND table_name = 'APP_USERS')
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL

BASE_READY="$(sqlplus -L -s "$ADMIN_CONNECT" @/tmp/check_base.sql | tr -d '[:space:]')"
sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_admin.sql

if [ "$BASE_READY" != "yes" ]; then
  echo ">>> Bootstrapping PG schema and core objects..."

  cat > /tmp/bootstrap_schema_core.sql <<SQL
WHENEVER OSERROR EXIT FAILURE
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
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06_security_admin.sql
EXIT
SQL

  cat > /tmp/bootstrap_schema_security.sql <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06_security_schema.sql
EXIT
SQL

  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_core.sql
  sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_security_admin.sql
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_security.sql
  (cd "${APP_DIR}/db/data" && sqlplus -L -s "$APP_CONNECT" @load_all_data.sql)
else
  echo ">>> Core schema already present. Skipping base bootstrap."
fi

cat > /tmp/check_seed_data.sql <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN (SELECT COUNT(*) FROM brands) > 0
          AND (SELECT COUNT(*) FROM products) > 0
          AND (SELECT COUNT(*) FROM fulfillment_centers) > 0
          AND (SELECT COUNT(*) FROM customers) > 0
          AND (SELECT COUNT(*) FROM inventory) > 0
          AND (SELECT COUNT(*) FROM social_posts) > 0
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL

DATA_READY="$(sqlplus -L -s "$APP_CONNECT" @/tmp/check_seed_data.sql | tr -d '[:space:]')"
if [ "$DATA_READY" != "yes" ]; then
  echo ">>> Core schema present but gold-data seed is incomplete. Reloading seed data..."

  cat > /tmp/bootstrap_schema_security_reload.sql <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@/tmp/06_security_schema.sql
EXIT
SQL

  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_security_reload.sql
  (cd "${APP_DIR}/db/data" && sqlplus -L -s "$APP_CONNECT" @load_all_data.sql)
else
  echo ">>> Gold-data seed already present. Skipping base seed reload."
fi

echo ">>> Running idempotent hydration steps..."
cat > /tmp/hydrate.sql <<SQL
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/12_oml_models.sql
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
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM product_embeddings;
  IF v_count = 0 THEN
    INSERT INTO product_embeddings (product_id, embedding_text, embedding)
    SELECT product_id,
           embedding_text,
           VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING embedding_text AS DATA)
    FROM (
      SELECT p.product_id,
             SUBSTR(p.product_name || ' ' || p.category || ' ' || DBMS_LOB.SUBSTR(p.description, 1200, 1), 1, 1900) AS embedding_text
      FROM products p
      WHERE p.is_active = 1
      ORDER BY p.product_id
      FETCH FIRST 180 ROWS ONLY
    );
    DBMS_OUTPUT.PUT_LINE('Generated product embeddings from gold-data products.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('Product embeddings already present.');
  END IF;
END;
/
DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM signal_embeddings;
  IF v_count = 0 THEN
    INSERT INTO signal_embeddings (post_id, embedding_text, embedding)
    SELECT post_id,
           embedding_text,
           VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING embedding_text AS DATA)
    FROM (
      SELECT sp.post_id,
             SUBSTR(DBMS_LOB.SUBSTR(sp.post_text, 1800, 1), 1, 1800) AS embedding_text
      FROM social_posts sp
      ORDER BY sp.virality_score DESC NULLS LAST, sp.post_id
      FETCH FIRST 180 ROWS ONLY
    );
    DBMS_OUTPUT.PUT_LINE('Generated signal embeddings from gold-data demand signals.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('Signal embeddings already present.');
  END IF;
END;
/
BEGIN
  batch_semantic_match(180);
  DBMS_OUTPUT.PUT_LINE('Computed semantic matches for gold-data demand signals.');
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Semantic match hydration skipped: ' || SQLERRM);
END;
/
@${APP_DIR}/db/schema/10_fraud_graph.sql
@${APP_DIR}/db/data/load_fraud_graph.sql
@${APP_DIR}/db/data/seed_fulfillment_zones.sql
@/tmp/08_agents_functions.sql
COMMIT;
EXIT
SQL

sqlplus -L -s "$APP_CONNECT" @/tmp/hydrate.sql

RETURNS_GRAPH_READY="$(
  sqlplus -L -s "$APP_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN (SELECT COUNT(*) FROM user_tables WHERE table_name = 'RETURNS_ENTITIES') = 1
          AND (SELECT COUNT(*) FROM user_tables WHERE table_name = 'RETURNS_RELATIONSHIPS') = 1
          AND (SELECT COUNT(*) FROM user_tables WHERE table_name = 'RETURNS_CASES') = 1
          AND (SELECT COUNT(*) FROM returns_entities) > 0
          AND (SELECT COUNT(*) FROM returns_relationships) > 0
          AND (SELECT COUNT(*) FROM returns_cases) > 0
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL
)"
RETURNS_GRAPH_READY="$(printf '%s' "$RETURNS_GRAPH_READY" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
if [ "$RETURNS_GRAPH_READY" != "yes" ]; then
  echo ">>> ERROR: Returns graph schema/data did not hydrate correctly."
  exit 1
fi

CORE_DATA_READY="$(
  sqlplus -L -s "$APP_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN (SELECT COUNT(*) FROM brands) > 0
          AND (SELECT COUNT(*) FROM products) > 0
          AND (SELECT COUNT(*) FROM fulfillment_centers) > 0
          AND (SELECT COUNT(*) FROM customers) > 0
          AND (SELECT COUNT(*) FROM inventory) > 0
          AND (SELECT COUNT(*) FROM social_posts) > 0
          AND (SELECT COUNT(*) FROM fulfillment_zones) > 0
         THEN 'yes'
         ELSE 'no'
       END
FROM dual;
EXIT
SQL
)"
CORE_DATA_READY="$(printf '%s' "$CORE_DATA_READY" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
if [ "$CORE_DATA_READY" != "yes" ]; then
  echo ">>> ERROR: Core gold-data seed did not hydrate correctly."
  exit 1
fi

touch "$BOOTSTRAP_MARKER"
echo ">>> Database bootstrap complete."
