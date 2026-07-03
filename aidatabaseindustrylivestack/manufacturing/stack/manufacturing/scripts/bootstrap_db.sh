#!/bin/bash

set -Eeuo pipefail

APP_DIR=/workspace/app
BOOTSTRAP_MARKER=/opt/oracle/oradata/.app_schema_bootstrap_done
PROVISIONING_VERSION=2026.07.01.1
READY_MARKER_VALUE="READY:${PROVISIONING_VERSION}"
APP_SCHEMA_USER="${ORACLE_USER:-LIVESTACK}"
APP_SCHEMA_PASSWORD="${APP_SCHEMA_PASSWORD:-livestackrulez!}"
ONNX_MODEL_FILENAME="${ONNX_MODEL_FILENAME:-all_MiniLM_L12_v2.onnx}"
ONNX_MODEL_URL="${ONNX_MODEL_URL:-https://adwc4pm.objectstorage.us-ashburn-1.oci.customer-oci.com/p/eLddQappgBJ7jNi6Guz9m9LOtYe2u8LWY19GfgU8flFK4N9YgP4kTlrE9Px3pE12/n/adwc4pm/b/OML-Resources/o/all_MiniLM_L12_v2.onnx}"
ONNX_MODEL_SHA256="${ONNX_MODEL_SHA256:-3929907d138051f818619fce3ba054185f748f2739d7a4dbc26e2502dd2499ea}"
PROVISIONING_ACTIVE=0

if [[ ! "$APP_SCHEMA_USER" =~ ^[A-Za-z][A-Za-z0-9_]{0,127}$ ]]; then
  echo ">>> ERROR: ORACLE_USER must be an unquoted Oracle identifier using letters, numbers, or underscores."
  exit 1
fi

if [ "$ONNX_MODEL_FILENAME" != "all_MiniLM_L12_v2.onnx" ]; then
  echo ">>> ERROR: ONNX_MODEL_FILENAME must remain all_MiniLM_L12_v2.onnx for canonical 04_vector.sql provisioning."
  exit 1
fi

if [[ ! "$ONNX_MODEL_SHA256" =~ ^[0-9A-Fa-f]{64}$ ]]; then
  echo ">>> ERROR: ONNX_MODEL_SHA256 must be a 64-character SHA-256 digest."
  exit 1
fi

APP_SCHEMA_USER_UPPER="$(printf '%s' "$APP_SCHEMA_USER" | tr '[:lower:]' '[:upper:]')"
APP_SCHEMA_USER_LOWER="$(printf '%s' "$APP_SCHEMA_USER" | tr '[:upper:]' '[:lower:]')"
APP_SCHEMA_PASSWORD_SQL="${APP_SCHEMA_PASSWORD//\"/\"\"}"
ADMIN_CONNECT="sys/${ORACLE_PWD:-oracle}@//localhost:1521/FREEPDB1 as sysdba"
APP_CONNECT="${APP_SCHEMA_USER_UPPER}/${APP_SCHEMA_PASSWORD}@//localhost:1521/FREEPDB1"
ROOT_CONNECT="/ as sysdba"

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

verify_onnx_model_sha256() {
  local model_file="$1"
  local actual_sha256

  if command -v sha256sum >/dev/null 2>&1; then
    actual_sha256="$(sha256sum "$model_file" | awk '{print $1}')"
  elif command -v openssl >/dev/null 2>&1; then
    actual_sha256="$(openssl dgst -sha256 "$model_file" | awk '{print $NF}')"
  else
    echo ">>> ERROR: sha256sum or openssl is required to verify the ONNX model."
    return 1
  fi

  if [ "$(printf '%s' "$actual_sha256" | tr '[:upper:]' '[:lower:]')" != \
       "$(printf '%s' "$ONNX_MODEL_SHA256" | tr '[:upper:]' '[:lower:]')" ]; then
    echo ">>> ERROR: ONNX model SHA-256 does not match ONNX_MODEL_SHA256."
    return 1
  fi
}

apply_schema_user() {
  local sql_file="$1"
  sed -i.bak \
    -e "s/LIVESTACK/${APP_SCHEMA_USER_UPPER}/g" \
    -e "s/livestack\\./${APP_SCHEMA_USER_LOWER}./g" \
    "$sql_file"
  rm -f "${sql_file}.bak"
}

mark_provisioning_failed() {
  sqlplus -L -s "$APP_CONNECT" <<SQL >/dev/null 2>&1
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
UPDATE app_provisioning_state
SET provisioning_status = 'FAILED',
    completed_at = NULL,
    failure_message = 'Clean provisioning failed. Recreate the database volume before retrying.',
    updated_at = SYSTIMESTAMP
WHERE state_id = 1
  AND provisioning_version = '${PROVISIONING_VERSION}';
COMMIT;
EXIT SUCCESS
SQL
}

on_bootstrap_error() {
  local exit_code=$?
  trap - ERR
  set +e
  rm -f "$BOOTSTRAP_MARKER"
  if [ "$PROVISIONING_ACTIVE" = "1" ]; then
    mark_provisioning_failed
  fi
  echo ">>> ERROR: Manufacturing clean provisioning failed."
  exit "$exit_code"
}
trap on_bootstrap_error ERR

fail_closed() {
  rm -f "$BOOTSTRAP_MARKER"
  echo ">>> ERROR: $1"
  echo ">>> Refusing to migrate or repair this schema. Recreate the database volume for a clean provision."
  exit 1
}

configure_inmemory_base_level_for_clean_provision() {
  local current_config

  current_config="$(
    sqlplus -L -s "$ROOT_CONNECT" <<'SQL'
SET HEADING OFF
SET FEEDBACK OFF
SET VERIFY OFF
SET PAGES 0
SET ECHO OFF
SELECT MAX(CASE WHEN name = 'inmemory_size' THEN value END) || '|' ||
       MAX(CASE WHEN name = 'inmemory_force' THEN UPPER(value) END)
FROM v$parameter
WHERE name IN ('inmemory_size', 'inmemory_force');
EXIT SUCCESS
SQL
  )"
  current_config="$(printf '%s' "$current_config" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"

  if [ "$current_config" != "268435456|BASE_LEVEL" ]; then
    echo ">>> Configuring Oracle Database In-Memory Base Level (256M); one database restart is required..."
    sqlplus -L -s "$ROOT_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
ALTER SYSTEM SET INMEMORY_SIZE = 256M SCOPE = SPFILE;
ALTER SYSTEM SET INMEMORY_FORCE = 'BASE_LEVEL' SCOPE = SPFILE;
SHUTDOWN IMMEDIATE;
STARTUP;
ALTER PLUGGABLE DATABASE ALL OPEN;
EXIT SUCCESS
SQL

    until echo 'SELECT 1 FROM dual;' | sqlplus -L -s system/"${ORACLE_PWD:-oracle}"@localhost:1521/FREEPDB1 >/dev/null 2>&1; do
      sleep 5
    done
  fi

  sqlplus -L -s "$ROOT_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
DECLARE
  v_option VARCHAR2(10);
  v_size  NUMBER;
  v_force VARCHAR2(30);
  v_area  NUMBER;
BEGIN
  SELECT UPPER(value)
  INTO v_option
  FROM v$option
  WHERE parameter = 'In-Memory Column Store';

  SELECT MAX(CASE WHEN name = 'inmemory_size' THEN TO_NUMBER(value) END),
         MAX(CASE WHEN name = 'inmemory_force' THEN UPPER(value) END)
  INTO v_size, v_force
  FROM v$parameter
  WHERE name IN ('inmemory_size', 'inmemory_force');

  SELECT COALESCE(SUM(alloc_bytes), 0)
  INTO v_area
  FROM v$inmemory_area;

  IF v_option <> 'TRUE' OR v_size < 268435456 OR v_force <> 'BASE_LEVEL' OR v_area < 268435456 THEN
    RAISE_APPLICATION_ERROR(-20340, 'Oracle Database In-Memory Base Level configuration did not initialize');
  END IF;
END;
/
EXIT SUCCESS
SQL
}

derive_provisioning_state() {
  sqlplus -L -s "$ADMIN_CONNECT" <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET HEADING OFF
SET FEEDBACK OFF
SET VERIFY OFF
SET PAGES 0
SET ECHO OFF
DECLARE
  v_user_count       PLS_INTEGER;
  v_object_count     PLS_INTEGER := 0;
  v_state_table      PLS_INTEGER := 0;
  v_state_columns    PLS_INTEGER := 0;
  v_total_columns    PLS_INTEGER := 0;
  v_state_rows       PLS_INTEGER := 0;
  v_version          VARCHAR2(30);
  v_status           VARCHAR2(20);
BEGIN
  SELECT COUNT(*) INTO v_user_count
  FROM dba_users
  WHERE username = '${APP_SCHEMA_USER_UPPER}';

  IF v_user_count = 0 THEN
    DBMS_OUTPUT.PUT_LINE('ABSENT|||0');
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_object_count
  FROM dba_objects
  WHERE owner = '${APP_SCHEMA_USER_UPPER}';

  SELECT COUNT(*) INTO v_state_table
  FROM dba_tables
  WHERE owner = '${APP_SCHEMA_USER_UPPER}'
    AND table_name = 'APP_PROVISIONING_STATE';

  IF v_state_table = 0 THEN
    IF v_object_count = 0 THEN
      DBMS_OUTPUT.PUT_LINE('ABSENT|||0');
    ELSE
      DBMS_OUTPUT.PUT_LINE('PARTIAL|||' || v_object_count);
    END IF;
    RETURN;
  END IF;

  SELECT COUNT(*),
         COUNT(CASE WHEN column_name IN (
           'STATE_ID', 'PROVISIONING_VERSION', 'PROVISIONING_STATUS',
           'STARTED_AT', 'COMPLETED_AT', 'FAILURE_MESSAGE', 'UPDATED_AT'
         ) THEN 1 END)
  INTO v_total_columns, v_state_columns
  FROM dba_tab_columns
  WHERE owner = '${APP_SCHEMA_USER_UPPER}'
    AND table_name = 'APP_PROVISIONING_STATE';

  IF v_total_columns <> 7 OR v_state_columns <> 7 THEN
    DBMS_OUTPUT.PUT_LINE('PARTIAL|||' || v_object_count);
    RETURN;
  END IF;

  EXECUTE IMMEDIATE
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.app_provisioning_state WHERE state_id = 1'
    INTO v_state_rows;
  IF v_state_rows <> 1 THEN
    DBMS_OUTPUT.PUT_LINE('PARTIAL|||' || v_object_count);
    RETURN;
  END IF;

  EXECUTE IMMEDIATE
    'SELECT provisioning_version, provisioning_status ' ||
    'FROM ${APP_SCHEMA_USER_UPPER}.app_provisioning_state WHERE state_id = 1'
    INTO v_version, v_status;
  DBMS_OUTPUT.PUT_LINE('STATE|' || v_version || '|' || v_status || '|' || v_object_count);
END;
/
EXIT SUCCESS
SQL
}

verify_manufacturing_provisioning_readiness() {
  local expected_status="$1"

  sqlplus -L -s "$APP_CONNECT" <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
@${APP_DIR}/db/data/validate_manufacturing_feature_readiness.sql
EXIT SUCCESS
SQL

  sqlplus -L -s "$ADMIN_CONNECT" <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
DECLARE
  v_count                 PLS_INTEGER;
  v_version               VARCHAR2(30);
  v_status                VARCHAR2(20);
  v_completed_at          TIMESTAMP;
  v_failure_message       VARCHAR2(4000);
  v_product_count         PLS_INTEGER;
  v_product_vector_count  PLS_INTEGER;
  v_signal_count          PLS_INTEGER;
  v_signal_vector_count   PLS_INTEGER;

  PROCEDURE require_positive(p_sql VARCHAR2, p_message VARCHAR2) IS
    v_rows PLS_INTEGER;
  BEGIN
    EXECUTE IMMEDIATE p_sql INTO v_rows;
    IF v_rows < 1 THEN
      RAISE_APPLICATION_ERROR(-20300, p_message);
    END IF;
  END;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM dba_tab_columns
  WHERE owner = '${APP_SCHEMA_USER_UPPER}'
    AND table_name = 'APP_PROVISIONING_STATE'
    AND column_name IN (
      'STATE_ID', 'PROVISIONING_VERSION', 'PROVISIONING_STATUS',
      'STARTED_AT', 'COMPLETED_AT', 'FAILURE_MESSAGE', 'UPDATED_AT'
    );
  IF v_count <> 7 THEN
    RAISE_APPLICATION_ERROR(-20301, 'APP_PROVISIONING_STATE has an invalid shape');
  END IF;

  EXECUTE IMMEDIATE
    'SELECT provisioning_version, provisioning_status, completed_at, failure_message ' ||
    'FROM ${APP_SCHEMA_USER_UPPER}.app_provisioning_state WHERE state_id = 1'
    INTO v_version, v_status, v_completed_at, v_failure_message;
  IF v_version <> '${PROVISIONING_VERSION}' OR v_status <> '${expected_status}' THEN
    RAISE_APPLICATION_ERROR(-20302, 'Provisioning version/status does not match the acceptance request');
  END IF;
  IF v_status = 'READY'
     AND (v_completed_at IS NULL OR v_failure_message IS NOT NULL) THEN
    RAISE_APPLICATION_ERROR(-20303, 'READY provisioning state is incomplete');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM dba_context
  WHERE namespace = 'MANUFACTURING_APP_CTX'
    AND schema = '${APP_SCHEMA_USER_UPPER}'
    AND package = 'MANUFACTURING_SECURITY_PKG'
    AND type = 'ACCESSED LOCALLY';
  IF v_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20304, 'Trusted Manufacturing application context is missing');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM dba_tab_privs
  WHERE grantee = '${APP_SCHEMA_USER_UPPER}'
    AND owner = 'SYS'
    AND (
      (privilege = 'SELECT' AND table_name IN (
        'V_\$PARAMETER', 'V_\$OPTION', 'V_\$INMEMORY_AREA', 'V_\$IM_SEGMENTS',
        'V_\$SQL', 'V_\$SQL_PLAN', 'V_\$SESSION'
      ))
      OR
      (privilege = 'EXECUTE' AND table_name IN ('DBMS_INMEMORY', 'DBMS_XPLAN'))
    );
  IF v_count <> 9 THEN
    RAISE_APPLICATION_ERROR(-20341, 'Exact direct Database In-Memory evidence grants are incomplete');
  END IF;

  SELECT COUNT(DISTINCT policy_name) INTO v_count
  FROM audit_unified_enabled_policies
  WHERE policy_name = 'MANUFACTURING_ORDER_AUDIT'
    AND entity_name = 'ALL USERS';
  IF v_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20309, 'Manufacturing unified audit policy is not enabled');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM dba_objects
  WHERE owner = '${APP_SCHEMA_USER_UPPER}'
    AND object_type = 'TABLE'
    AND object_name IN (
      'PRODUCTS', 'MANUFACTURING_WORK_ORDERS', 'MANUFACTURING_WORK_ORDER_LINES',
      'MANUFACTURING_PRODUCTION_SIGNALS', 'MANUFACTURING_DEMAND_FORECASTS',
      'APP_USERS', 'FULFILLMENT_ZONES',
      'PRODUCT_EMBEDDINGS', 'MANUFACTURING_SIGNAL_EMBEDDINGS',
      'MANUFACTURING_SIGNAL_PART_MATCHES',
      'MANUFACTURING_GRAPH_ENTITIES', 'MANUFACTURING_GRAPH_RELATIONSHIPS',
      'MANUFACTURING_RISK_CASES', 'MANUFACTURING_CASE_ENTITIES',
      'MANUFACTURING_GRAPH_STATE', 'APP_PROVISIONING_STATE'
    );
  IF v_count <> 16 THEN
    RAISE_APPLICATION_ERROR(-20305, 'Required Manufacturing tables are missing');
  END IF;

  require_positive('SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.products',
                   'Manufactured-part data is missing');
  require_positive('SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_work_orders',
                   'Work-order data is missing');
  require_positive('SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.app_users',
                   'Application identities are missing');
  require_positive(
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.shipments ' ||
    'WHERE distance_km IS NOT NULL AND estimated_hours IS NOT NULL',
    'Oracle Spatial route evidence is missing'
  );
  require_positive(
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.fulfillment_zones ' ||
    'WHERE zone_boundary IS NOT NULL',
    'Oracle Spatial zone evidence is missing'
  );
  require_positive('SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_graph_entities',
                   'Manufacturing graph vertices are missing');
  require_positive('SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_graph_relationships',
                   'Manufacturing graph edges are missing');
  require_positive(
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_graph_state ' ||
    'WHERE graph_name = ''MANUFACTURING_PRODUCTION_NETWORK'' ' ||
    'AND entity_count > 0 AND relationship_count > 0',
    'Manufacturing graph refresh state is missing'
  );
  require_positive('SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_signal_part_matches',
                   'In-database semantic matches are missing');

  EXECUTE IMMEDIATE
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.products'
    INTO v_product_count;
  EXECUTE IMMEDIATE
    'SELECT COUNT(DISTINCT product_id) FROM ${APP_SCHEMA_USER_UPPER}.product_embeddings'
    INTO v_product_vector_count;
  EXECUTE IMMEDIATE
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_production_signals'
    INTO v_signal_count;
  EXECUTE IMMEDIATE
    'SELECT COUNT(DISTINCT production_signal_id) FROM ${APP_SCHEMA_USER_UPPER}.manufacturing_signal_embeddings'
    INTO v_signal_vector_count;
  IF v_product_count = 0
     OR v_signal_count = 0
     OR v_product_vector_count <> v_product_count
     OR v_signal_vector_count <> v_signal_count THEN
    RAISE_APPLICATION_ERROR(-20306, 'Vector coverage is incomplete');
  END IF;

  EXECUTE IMMEDIATE
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.fulfillment_centers ' ||
    'WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NULL'
    INTO v_count;
  IF v_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20307, 'Plant Spatial point hydration is incomplete');
  END IF;

  EXECUTE IMMEDIATE
    'SELECT COUNT(*) FROM ${APP_SCHEMA_USER_UPPER}.customers ' ||
    'WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NULL'
    INTO v_count;
  IF v_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20308, 'Customer Spatial point hydration is incomplete');
  END IF;
END;
/
EXIT SUCCESS
SQL

  sqlplus -L -s "$APP_CONNECT" <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
DECLARE
  v_count                   PLS_INTEGER;
  v_proof_row_count         NUMBER;
  v_proof_observation_count NUMBER;
BEGIN
  manufacturing_security_pkg.set_user_context('analyst_raj');
  IF SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE') <> 'analyst'
     OR SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') <> 'GLOBAL'
     OR SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') <> 'Y' THEN
    RAISE_APPLICATION_ERROR(-20310, 'Readiness could not establish the global analyst application context');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM user_json_duality_views
  WHERE view_name IN (
    'MANUFACTURING_WORK_ORDER_DOCUMENTS_DV', 'PRODUCTS_INVENTORY_DV',
    'MANUFACTURED_PART_CAPACITY_DV', 'MANUFACTURING_PLANT_CAPACITY_DV'
  )
    AND status = 'VALID'
    AND read_only = TRUE
    AND allow_insert = FALSE
    AND allow_update = FALSE
    AND allow_delete = FALSE;
  IF v_count <> 4 THEN
    RAISE_APPLICATION_ERROR(-20311, 'Four VPD-compatible read-only duality views are required');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM user_property_graphs
  WHERE graph_name = 'MANUFACTURING_PRODUCTION_NETWORK'
    AND graph_mode = 'ENFORCED';
  IF v_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20312, 'Enforced Manufacturing property graph is missing');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM user_mining_models
  WHERE (model_name = 'ALL_MINILM_L12_V2' AND mining_function = 'EMBEDDING')
     OR model_name IN (
       'DEMAND_SURGE_MODEL', 'CUSTOMER_SEGMENT_MODEL',
       'REVENUE_PREDICT_MODEL', 'PRODUCT_CLUSTER_MODEL'
     );
  IF v_count <> 5 THEN
    RAISE_APPLICATION_ERROR(-20313, 'Required ONNX and OML models are missing');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM user_policies
  WHERE policy_name IN (
    'VPD_SEC_FC', 'VPD_SEC_INVENTORY', 'VPD_SEC_CUSTOMERS',
    'VPD_SEC_WORK_ORDERS', 'VPD_SEC_WORK_ORDER_LINES', 'VPD_SEC_SHIPMENTS',
    'VPD_SEC_ZONES', 'VPD_SEC_DEMAND_REGIONS', 'VPD_SEC_FORECASTS',
    'VPD_SEC_AGENT_ACTIONS', 'VPD_SEC_EVENT_STREAM', 'VPD_SEC_INFLUENCERS',
    'VPD_SEC_PRODUCTION_SIGNALS', 'VPD_SEC_INFLUENCER_LINKS',
    'VPD_SEC_BRAND_LINKS', 'VPD_SEC_MENTIONS', 'VPD_SEC_SIGNAL_EMBEDDINGS',
    'VPD_SEC_SIGNAL_MATCHES', 'VPD_SEC_GRAPH_ENTITIES',
    'VPD_SEC_GRAPH_RELS', 'VPD_SEC_RISK_CASES', 'VPD_SEC_CASE_ENTITIES',
    'VPD_SEC_GRAPH_ACCESS'
  )
    AND sel = 'YES'
    AND enable = 'YES'
    AND policy_type = 'CONTEXT_SENSITIVE';
  IF v_count <> 23 THEN
    RAISE_APPLICATION_ERROR(-20314, 'Twenty-three context-sensitive Manufacturing VPD policies are required');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM manufacturing_inmemory_segments_v
  WHERE table_inmemory = 'ENABLED'
    AND inmemory_priority = 'HIGH'
    AND inmemory_compression = 'FOR QUERY LOW'
    AND populate_status = 'COMPLETED'
    AND bytes_not_populated = 0
    AND inmemory_bytes > 0;
  IF v_count <> 4 THEN
    RAISE_APPLICATION_ERROR(-20316, 'Four fully populated Manufacturing In-Memory segments are required');
  END IF;

  EXECUTE IMMEDIATE q'~
    SELECT /*+ GATHER_PLAN_STATISTICS FULL(signal) NO_INDEX(signal) */
           /* MANUFACTURING_INMEMORY_PROOF */
           COUNT(*),
           SUM(signal.observation_count)
    FROM manufacturing_production_signals signal
  ~'
  INTO v_proof_row_count, v_proof_observation_count;
  IF v_proof_row_count = 0 OR v_proof_observation_count IS NULL THEN
    RAISE_APPLICATION_ERROR(-20318, 'Final In-Memory proof query returned no production-signal rows');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM manufacturing_inmemory_status_v
  WHERE inmemory_option = 'TRUE'
    AND database_inmemory_size_bytes >= 268435456
    AND inmemory_force = 'BASE_LEVEL'
    AND inmemory_query = 'ENABLE'
    AND plan_proof_operation = 'TABLE ACCESS INMEMORY FULL'
    AND evidence_status = 'ACTIVE';
  IF v_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20317, 'Oracle Database In-Memory runtime and plan proof are incomplete');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM user_objects
  WHERE status <> 'VALID'
    AND object_type IN (
      'FUNCTION', 'PROCEDURE', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER', 'VIEW'
    );
  IF v_count <> 0 THEN
    RAISE_APPLICATION_ERROR(-20315, 'Invalid application code objects remain');
  END IF;
  manufacturing_security_pkg.clear_user_context;
EXCEPTION
  WHEN OTHERS THEN
    manufacturing_security_pkg.clear_user_context;
    RAISE;
END;
/
@${APP_DIR}/db/data/validate_spatial_structure.sql
EXIT SUCCESS
SQL
}

grant_select_ai_if_requested() {
  if [ "${ENABLE_SELECT_AI:-false}" != "true" ]; then
    echo ">>> Select AI package grant skipped: external OCI configuration was not requested."
    return
  fi

  sqlplus -L -s "$ADMIN_CONNECT" <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE
  v_package_owner VARCHAR2(128);
  v_grant_count   PLS_INTEGER;
BEGIN
  SELECT MIN(owner) KEEP (
           DENSE_RANK FIRST
           ORDER BY CASE WHEN owner = 'SYS' THEN 0 ELSE 1 END, owner
         )
  INTO v_package_owner
  FROM dba_objects
  WHERE object_name = 'DBMS_CLOUD_AI'
    AND object_type = 'PACKAGE'
    AND status = 'VALID';

  IF v_package_owner IS NULL THEN
    RAISE_APPLICATION_ERROR(
      -20319,
      'ENABLE_SELECT_AI=true but a valid DBMS_CLOUD_AI package is unavailable'
    );
  END IF;

  EXECUTE IMMEDIATE
    'GRANT EXECUTE ON ' ||
    DBMS_ASSERT.ENQUOTE_NAME(v_package_owner, FALSE) ||
    '.DBMS_CLOUD_AI TO ${APP_SCHEMA_USER_UPPER}';

  SELECT COUNT(*)
  INTO v_grant_count
  FROM dba_tab_privs
  WHERE grantee = '${APP_SCHEMA_USER_UPPER}'
    AND owner = v_package_owner
    AND table_name = 'DBMS_CLOUD_AI'
    AND privilege = 'EXECUTE';

  IF v_grant_count <> 1 THEN
    RAISE_APPLICATION_ERROR(-20318, 'Direct DBMS_CLOUD_AI EXECUTE grant was not established');
  END IF;
END;
/
EXIT SUCCESS
SQL
  echo ">>> Select AI DBMS_CLOUD_AI package grant established."
}

configure_select_ai_if_requested() {
  if [ "${ENABLE_SELECT_AI:-false}" != "true" ]; then
    echo ">>> Select AI profiles/native agents skipped: external OCI configuration was not requested."
    return
  fi
  if [ ! -s "${APP_DIR}/db/schema/07_ai_profile.sql" ]; then
    echo ">>> ERROR: ENABLE_SELECT_AI=true but 07_ai_profile.sql is unavailable."
    return 1
  fi
  if [[ ! "${OCI_COMPARTMENT_ID:-}" =~ ^ocid1\.compartment\.[A-Za-z0-9._-]+$ ]] ||
     [[ ! "${OCI_CRED_NAME:-}" =~ ^[A-Za-z][A-Za-z0-9_$#]{0,127}$ ]]; then
    echo ">>> ERROR: ENABLE_SELECT_AI=true requires valid OCI_COMPARTMENT_ID and OCI_CRED_NAME values."
    return 1
  fi

  local capable
  capable="$(
    sqlplus -L -s "$APP_CONNECT" <<'SQL'
SET HEADING OFF
SET FEEDBACK OFF
SET VERIFY OFF
SET PAGES 0
SET ECHO OFF
SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM all_objects
           WHERE object_name = 'DBMS_CLOUD_AI'
             AND object_type = 'PACKAGE'
             AND status = 'VALID'
         )
          AND EXISTS (
           SELECT 1 FROM all_objects
           WHERE object_name = 'USER_CLOUD_AI_PROFILES'
             AND object_type IN ('VIEW', 'SYNONYM')
             AND status = 'VALID'
         )
         THEN 'yes' ELSE 'no'
       END
FROM dual;
EXIT SUCCESS
SQL
  )"
  capable="$(printf '%s' "$capable" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
  if [ "$capable" != "yes" ]; then
    echo ">>> ERROR: ENABLE_SELECT_AI=true but DBMS_CLOUD_AI or its catalog is unavailable."
    return 1
  fi

  sed \
    -e "s|^DEFINE OCI_COMPARTMENT_ID =.*|DEFINE OCI_COMPARTMENT_ID = ${OCI_COMPARTMENT_ID}|" \
    -e "s|^DEFINE OCI_CRED_NAME =.*|DEFINE OCI_CRED_NAME = ${OCI_CRED_NAME}|" \
    "${APP_DIR}/db/schema/07_ai_profile.sql" > /tmp/07_ai_profile_configured.sql
  sqlplus -L -s "$APP_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
@/tmp/07_ai_profile_configured.sql
EXIT SUCCESS
SQL

  sqlplus -L -s "$APP_CONNECT" <<'SQL'
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM user_cloud_ai_profiles
  WHERE profile_name IN (
    'MANUFACTURING_COHERE_PROFILE',
    'MANUFACTURING_LLAMA_PROFILE',
    'MANUFACTURING_GROK42_PROFILE',
    'MANUFACTURING_VISION_PROFILE',
    'MANUFACTURING_EMBED_PROFILE'
  )
    AND status = 'ENABLED';

  IF v_count <> 5 THEN
    RAISE_APPLICATION_ERROR(-20320, 'Five enabled Manufacturing Select AI profiles are required');
  END IF;
END;
/
EXIT SUCCESS
SQL
  echo ">>> Select AI profiles configured. Native DBMS_CLOUD_AI_AGENT objects are outside the default Oracle Free deployment path."
}

provision_manufacturing_database() {
  for sql_file in \
    "${APP_DIR}/db/schema/01_tables.sql" \
    "${APP_DIR}/db/schema/02_json_collections.sql" \
    "${APP_DIR}/db/schema/03_graph.sql" \
    "${APP_DIR}/db/schema/04_vector.sql" \
    "${APP_DIR}/db/schema/05_spatial.sql" \
    "${APP_DIR}/db/schema/06_security.sql" \
    "${APP_DIR}/db/schema/06a_manufacturing_app_context_admin.sql" \
    "${APP_DIR}/db/schema/06b_manufacturing_vpd.sql" \
    "${APP_DIR}/db/schema/08_agents.sql" \
    "${APP_DIR}/db/schema/09_comments.sql" \
    "${APP_DIR}/db/schema/10_manufacturing_production_graph.sql" \
    "${APP_DIR}/db/schema/11_manufacturing_semantic_views.sql" \
    "${APP_DIR}/db/schema/12_manufacturing_oml_models.sql" \
    "${APP_DIR}/db/schema/13_manufacturing_graph_runtime.sql" \
    "${APP_DIR}/db/schema/14_manufacturing_duality_runtime.sql" \
    "${APP_DIR}/db/schema/15_manufacturing_inmemory.sql" \
    "${APP_DIR}/db/data/load_all_data.sql" \
    "${APP_DIR}/db/data/finalize_vector_search.sql" \
    "${APP_DIR}/db/data/finalize_manufacturing_inmemory.sql" \
    "${APP_DIR}/db/data/validate_spatial_structure.sql" \
    "${APP_DIR}/db/data/validate_manufacturing_feature_readiness.sql"; do
    if [ ! -s "$sql_file" ]; then
      echo ">>> ERROR: Required clean-provisioning SQL file is missing or empty: $sql_file"
      return 1
    fi
  done

  echo ">>> Preparing canonical SQL phases..."
  extract_between_markers \
    "-- SECTION 1: RUN AS ADMIN" \
    "-- SECTION 1: END" \
    "${APP_DIR}/db/schema/06_security.sql" \
    /tmp/06_security_admin.sql
  extract_between_markers \
    "-- SECTION 2A: TRUSTED PACKAGE BEGIN" \
    "-- SECTION 2A: TRUSTED PACKAGE END" \
    "${APP_DIR}/db/schema/06b_manufacturing_vpd.sql" \
    /tmp/06_security_package.sql
  extract_between_markers \
    "-- SECTION 2B: VPD POLICIES BEGIN" \
    "-- SECTION 2B: VPD POLICIES END" \
    "${APP_DIR}/db/schema/06b_manufacturing_vpd.sql" \
    /tmp/06_security_policies.sql
  extract_between_markers \
    "-- STEP 2: CREATE PL/SQL FUNCTIONS THAT BECOME AGENT TOOLS" \
    "-- STEP 3: CREATE SELECT AI AGENT TOOLS" \
    "${APP_DIR}/db/schema/08_agents.sql" \
    /tmp/08_agents_functions.sql

  for sql_file in \
    /tmp/06_security_admin.sql \
    /tmp/06_security_package.sql \
    /tmp/06_security_policies.sql \
    /tmp/08_agents_functions.sql; do
    if [ ! -s "$sql_file" ]; then
      echo ">>> ERROR: Failed to extract expected canonical SQL section into $sql_file"
      return 1
    fi
    apply_schema_user "$sql_file"
  done

  cat > /tmp/bootstrap_admin.sql <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM dba_users
  WHERE username = '${APP_SCHEMA_USER_UPPER}';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE USER ${APP_SCHEMA_USER_UPPER} IDENTIFIED BY "${APP_SCHEMA_PASSWORD_SQL}" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
  ELSE
    EXECUTE IMMEDIATE 'ALTER USER ${APP_SCHEMA_USER_UPPER} IDENTIFIED BY "${APP_SCHEMA_PASSWORD_SQL}"';
    EXECUTE IMMEDIATE 'ALTER USER ${APP_SCHEMA_USER_UPPER} DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP';
    EXECUTE IMMEDIATE 'ALTER USER ${APP_SCHEMA_USER_UPPER} QUOTA UNLIMITED ON USERS';
  END IF;
END;
/
GRANT CREATE SESSION TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE TABLE TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE VIEW TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE SEQUENCE TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE PROCEDURE TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE TRIGGER TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE MINING MODEL TO ${APP_SCHEMA_USER_UPPER};
GRANT CREATE PROPERTY GRAPH TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON MDSYS.SDO_GEOM TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON MDSYS.SDO_UTIL TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON SYS.DBMS_RLS TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON SYS.DBMS_VECTOR TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON SYS.DBMS_DATA_MINING TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON SYS.DBMS_INMEMORY TO ${APP_SCHEMA_USER_UPPER};
GRANT EXECUTE ON SYS.DBMS_XPLAN TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$PARAMETER TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$OPTION TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$INMEMORY_AREA TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$IM_SEGMENTS TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$SQL TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$SQL_PLAN TO ${APP_SCHEMA_USER_UPPER};
GRANT SELECT ON SYS.V_\$SESSION TO ${APP_SCHEMA_USER_UPPER};
GRANT READ ON DIRECTORY DATA_PUMP_DIR TO ${APP_SCHEMA_USER_UPPER};
EXIT SUCCESS
SQL

  echo ">>> Creating the clean application owner and required Oracle feature grants..."
  sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_admin.sql
  grant_select_ai_if_requested
  PROVISIONING_ACTIVE=1

  cat > /tmp/bootstrap_schema_base.sql <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/01_tables.sql
COMMIT;
EXIT SUCCESS
SQL
  echo ">>> Creating base tables and canonical provisioning state..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_base.sql

  local state_line state_kind state_version state_status state_object_count
  state_line="$(derive_provisioning_state | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
  IFS='|' read -r state_kind state_version state_status state_object_count <<< "$state_line"
  if [ "$state_kind" != "STATE" ] ||
     [ "$state_version" != "$PROVISIONING_VERSION" ] ||
     [ "$state_status" != "PROVISIONING" ]; then
    echo ">>> ERROR: 01_tables.sql did not establish canonical PROVISIONING state."
    return 1
  fi

  local model_dir
  model_dir="$(
    sqlplus -L -s "$ADMIN_CONNECT" <<'SQL'
SET HEADING OFF
SET FEEDBACK OFF
SET VERIFY OFF
SET PAGES 0
SET ECHO OFF
SELECT RTRIM(directory_path, '/')
FROM dba_directories
WHERE directory_name = 'DATA_PUMP_DIR'
  AND EXISTS (
    SELECT 1 FROM dba_objects
    WHERE owner = 'SYS'
      AND object_name = 'DBMS_VECTOR'
      AND object_type = 'PACKAGE'
      AND status = 'VALID'
  );
EXIT SUCCESS
SQL
  )"
  model_dir="$(printf '%s' "$model_dir" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
  if [ -z "$model_dir" ]; then
    echo ">>> ERROR: DBMS_VECTOR and DATA_PUMP_DIR are required for the Manufacturing ONNX feature."
    return 1
  fi

  local model_path="${model_dir}/${ONNX_MODEL_FILENAME}"
  local model_temp="${model_path}.part"
  echo ">>> Ensuring the required ONNX model file is available..."
  mkdir -p "$model_dir"
  if [ ! -s "$model_path" ]; then
    curl -fL --retry 5 --retry-delay 2 --retry-connrefused --continue-at - \
      "$ONNX_MODEL_URL" -o "$model_temp"
    if ! verify_onnx_model_sha256 "$model_temp"; then
      rm -f "$model_temp"
      return 1
    fi
    mv "$model_temp" "$model_path"
  elif ! verify_onnx_model_sha256 "$model_path"; then
    return 1
  fi
  chmod 644 "$model_path"

  cat > /tmp/bootstrap_schema_features.sql <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/02_json_collections.sql
@${APP_DIR}/db/schema/03_graph.sql
@${APP_DIR}/db/schema/04_vector.sql
@${APP_DIR}/db/schema/05_spatial.sql
@${APP_DIR}/db/schema/10_manufacturing_production_graph.sql
@${APP_DIR}/db/schema/11_manufacturing_semantic_views.sql
@${APP_DIR}/db/schema/12_manufacturing_oml_models.sql
@${APP_DIR}/db/schema/15_manufacturing_inmemory.sql
EXIT SUCCESS
SQL
  echo ">>> Creating canonical duality, graph, vector, Spatial, semantic, and OML objects..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_features.sql

  cat > /tmp/bootstrap_schema_data.sql <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
@${APP_DIR}/db/data/load_all_data.sql
@${APP_DIR}/db/data/finalize_vector_search.sql
BEGIN
  rebuild_manufacturing_oml_models;
END;
/
@${APP_DIR}/db/data/finalize_manufacturing_inmemory.sql
EXIT SUCCESS
SQL
  echo ">>> Loading deterministic data, vector evidence, Spatial evidence, and OML models..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_data.sql

  cat > /tmp/bootstrap_security_admin.sql <<'SQL'
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
@/tmp/06_security_admin.sql
EXIT SUCCESS
SQL
  cat > /tmp/bootstrap_security_package.sql <<'SQL'
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
@/tmp/06_security_package.sql
EXIT SUCCESS
SQL
  echo ">>> Creating Manufacturing roles and trusted security package..."
  sqlplus -L -s "$ADMIN_CONNECT" @/tmp/bootstrap_security_admin.sql
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_security_package.sql
  sqlplus -L -s "$ADMIN_CONNECT" \
    @"${APP_DIR}/db/schema/06a_manufacturing_app_context_admin.sql" \
    "$APP_SCHEMA_USER_UPPER"
  cat > /tmp/bootstrap_security_policies.sql <<'SQL'
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
@/tmp/06_security_policies.sql
EXIT SUCCESS
SQL
  echo ">>> Installing VPD and auditing after the trusted context is bound..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_security_policies.sql

  cat > /tmp/bootstrap_schema_finalize.sql <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
@${APP_DIR}/db/schema/13_manufacturing_graph_runtime.sql
@${APP_DIR}/db/schema/14_manufacturing_duality_runtime.sql
@${APP_DIR}/db/schema/09_comments.sql
@/tmp/08_agents_functions.sql
EXIT SUCCESS
SQL
  echo ">>> Refreshing the secured Manufacturing graph and final code objects..."
  sqlplus -L -s "$APP_CONNECT" @/tmp/bootstrap_schema_finalize.sql
  configure_select_ai_if_requested

  echo ">>> Running pre-READY catalog and data acceptance..."
  verify_manufacturing_provisioning_readiness PROVISIONING

  sqlplus -L -s "$APP_CONNECT" <<SQL
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
BEGIN
  UPDATE app_provisioning_state
  SET provisioning_status = 'READY',
      completed_at = SYSTIMESTAMP,
      failure_message = NULL,
      updated_at = SYSTIMESTAMP
  WHERE state_id = 1
    AND provisioning_version = '${PROVISIONING_VERSION}'
    AND provisioning_status = 'PROVISIONING';
  IF SQL%ROWCOUNT <> 1 THEN
    RAISE_APPLICATION_ERROR(-20330, 'Provisioning state could not advance to READY');
  END IF;
  COMMIT;
END;
/
EXIT SUCCESS
SQL

  echo ">>> Rechecking READY state before publishing the file marker..."
  verify_manufacturing_provisioning_readiness READY
  printf '%s\n' "$READY_MARKER_VALUE" > "$BOOTSTRAP_MARKER"
  PROVISIONING_ACTIVE=0
  echo ">>> Manufacturing clean provisioning ${PROVISIONING_VERSION} complete."
}

echo ">>> Manufacturing Operations bootstrap starting inside db container..."
echo ">>> Waiting for Oracle AI Database Free service..."
until echo 'SELECT 1 FROM dual;' | sqlplus -L -s system/"${ORACLE_PWD:-oracle}"@localhost:1521/FREEPDB1 >/dev/null 2>&1; do
  sleep 5
done

STATE_LINE="$(derive_provisioning_state | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"
IFS='|' read -r STATE_KIND STATE_VERSION STATE_STATUS STATE_OBJECT_COUNT <<< "$STATE_LINE"

case "$STATE_KIND" in
  ABSENT)
    rm -f "$BOOTSTRAP_MARKER"
    configure_inmemory_base_level_for_clean_provision
    provision_manufacturing_database
    ;;
  PARTIAL)
    fail_closed "The application schema is partial or has no canonical provisioning state."
    ;;
  STATE)
    if [ "$STATE_VERSION" != "$PROVISIONING_VERSION" ]; then
      fail_closed "Provisioning state version ${STATE_VERSION:-<empty>} does not match ${PROVISIONING_VERSION}."
    fi
    case "$STATE_STATUS" in
      READY)
        rm -f "$BOOTSTRAP_MARKER"
        echo ">>> Matching READY state found; running read-only acceptance checks."
        verify_manufacturing_provisioning_readiness READY
        printf '%s\n' "$READY_MARKER_VALUE" > "$BOOTSTRAP_MARKER"
        echo ">>> Manufacturing schema ${PROVISIONING_VERSION} is ready; no persistent database mutation was performed."
        ;;
      PROVISIONING|FAILED)
        fail_closed "Provisioning state is $STATE_STATUS."
        ;;
      *)
        fail_closed "Unknown provisioning status ${STATE_STATUS:-<empty>}."
        ;;
    esac
    ;;
  *)
    fail_closed "Unable to classify application schema state: ${STATE_LINE:-<empty>}."
    ;;
esac
