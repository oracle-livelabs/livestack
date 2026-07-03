/*
 * 00_setup.sql
 * Optional clean-provisioning owner setup — run as ADMIN or SYSDBA
 * Oracle AI Database 26ai Free
 *
 * The Deploy button runs scripts/bootstrap_db.sh, which owns the complete
 * initial provision and does not invoke this file. This helper is retained for
 * administrators who need to reproduce the owner prerequisite manually. It is
 * not a post-deployment migration or repair script.
 *
 * The grants below are limited to capabilities used by the canonical schema.
 * Optional Select AI packages are disabled unless explicitly enabled here.
 * Outbound network ACLs are intentionally not provisioned; an operator who
 * enables Select AI must allow only the exact provider hostname and port.
 *
 * SQLcl example:
 *   connect sys@<free_tns_alias> as sysdba
 *   -- Autonomous Database alternative: connect admin@<adb_tns_alias>
 *   @00_setup.sql
 * These owner defaults mirror compose.yml and .env.example. Continue with the
 * canonical clean initial-provisioning order after this prerequisite succeeds.
 */

DEFINE APP_SCHEMA_USER = LIVESTACK
DEFINE APP_SCHEMA_PASSWORD = livestackrulez!
DEFINE ENABLE_OPTIONAL_SELECT_AI = FALSE

-- ============================================================
-- GUARD: This script must run as Autonomous ADMIN or a SYSDBA session
-- ============================================================
DECLARE
    v_session_user VARCHAR2(128) := SYS_CONTEXT('USERENV', 'SESSION_USER');
    v_is_dba       VARCHAR2(5) := SYS_CONTEXT('USERENV', 'ISDBA');
BEGIN
    IF v_session_user != 'ADMIN' AND v_is_dba != 'TRUE' THEN
        RAISE_APPLICATION_ERROR(
            -20001,
            'This script must be run as Autonomous ADMIN or through a SYSDBA session. ' ||
            'Current user: ' || v_session_user || '; ISDBA: ' || v_is_dba
        );
    END IF;
    DBMS_OUTPUT.PUT_LINE(
        'Connected as: ' || v_session_user || '; ISDBA: ' || v_is_dba
    );
END;
/

-- ============================================================
-- CREATE SCHEMA OWNER
-- Idempotent — skips creation if the user already exists.
-- ============================================================
DECLARE
    v_count NUMBER;
    v_schema_user VARCHAR2(128) := DBMS_ASSERT.SIMPLE_SQL_NAME(UPPER('&&APP_SCHEMA_USER'));
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM dba_users
    WHERE username = v_schema_user;

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE USER ' || v_schema_user ||
            ' IDENTIFIED BY "&&APP_SCHEMA_PASSWORD"' ||
            ' DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
        DBMS_OUTPUT.PUT_LINE('User ' || v_schema_user || ' created.');
    ELSE
        EXECUTE IMMEDIATE 'ALTER USER ' || v_schema_user ||
            ' IDENTIFIED BY "&&APP_SCHEMA_PASSWORD" DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS';
        DBMS_OUTPUT.PUT_LINE('User ' || v_schema_user || ' already exists — password refreshed.');
    END IF;
END;
/

-- ============================================================
-- CORE SESSION AND DDL PRIVILEGES USED BY THE CANONICAL SCHEMA
-- ============================================================
GRANT CREATE SESSION         TO &&APP_SCHEMA_USER;  -- connect to the database
GRANT CREATE TABLE           TO &&APP_SCHEMA_USER;  -- tables, vector columns, spatial columns
GRANT CREATE VIEW            TO &&APP_SCHEMA_USER;  -- JSON Duality Views
GRANT CREATE SEQUENCE        TO &&APP_SCHEMA_USER;  -- backing sequences for identity columns
GRANT CREATE PROCEDURE       TO &&APP_SCHEMA_USER;  -- procedures, functions, packages
GRANT CREATE TRIGGER         TO &&APP_SCHEMA_USER;  -- triggers
GRANT CREATE MINING MODEL    TO &&APP_SCHEMA_USER;  -- in-database OML and ONNX models

-- ============================================================
-- CONVERGED DATABASE FEATURE GRANTS
-- ============================================================

-- Property Graph (03_graph.sql)
GRANT CREATE PROPERTY GRAPH  TO &&APP_SCHEMA_USER;

-- Spatial (05_spatial.sql)
-- SDO_GEOM supports distance/geometry operations; the API uses
-- SDO_UTIL.TO_GEOJSON to serialize Oracle Spatial results.
GRANT EXECUTE ON MDSYS.SDO_GEOM TO &&APP_SCHEMA_USER;
GRANT EXECUTE ON MDSYS.SDO_UTIL TO &&APP_SCHEMA_USER;

-- Row-Level Security / Virtual Private Database (06_security.sql)
-- Required for DBMS_RLS.ADD_POLICY / DROP_POLICY calls
GRANT EXECUTE ON SYS.DBMS_RLS            TO &&APP_SCHEMA_USER;

-- Vector / ONNX model loading (04_vector.sql)
-- The owner reads the model staged by the provisioning process; it does not
-- write to DATA_PUMP_DIR.
GRANT EXECUTE ON DBMS_VECTOR             TO &&APP_SCHEMA_USER;
GRANT EXECUTE ON DBMS_DATA_MINING        TO &&APP_SCHEMA_USER;
GRANT READ ON DIRECTORY data_pump_dir    TO &&APP_SCHEMA_USER;

-- Select AI profile framework (optional manual workflow only).
-- The clean Oracle Free deployment uses Ollama at the application layer. Set
-- ENABLE_OPTIONAL_SELECT_AI to TRUE only on a database where DBMS_CLOUD_AI and
-- a narrowly scoped provider network ACL have been configured deliberately.
DECLARE
    v_package_owner VARCHAR2(128);
BEGIN
    IF UPPER(TRIM('&&ENABLE_OPTIONAL_SELECT_AI')) = 'TRUE' THEN
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
                -20002,
                'Optional Select AI was requested but DBMS_CLOUD_AI is unavailable'
            );
        END IF;

        EXECUTE IMMEDIATE
            'GRANT EXECUTE ON ' ||
            DBMS_ASSERT.ENQUOTE_NAME(v_package_owner, FALSE) ||
            '.DBMS_CLOUD_AI TO ' ||
            DBMS_ASSERT.SIMPLE_SQL_NAME(UPPER('&&APP_SCHEMA_USER'));
        DBMS_OUTPUT.PUT_LINE('Optional DBMS_CLOUD_AI package grant enabled.');
    ELSE
        DBMS_OUTPUT.PUT_LINE(
            'Optional Select AI package grants disabled; no network ACL was created.'
        );
    END IF;
END;
/

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT username,
       account_status,
       default_tablespace,
       temporary_tablespace,
       profile,
       created
FROM   dba_users
WHERE  username = UPPER('&&APP_SCHEMA_USER');

SELECT privilege
FROM   dba_sys_privs
WHERE  grantee = UPPER('&&APP_SCHEMA_USER')
ORDER  BY privilege;

SELECT granted_role
FROM   dba_role_privs
WHERE  grantee = UPPER('&&APP_SCHEMA_USER')
ORDER  BY granted_role;

SELECT 'Owner prerequisite complete for ' || UPPER('&&APP_SCHEMA_USER') ||
       '. Continue the canonical clean initial-provisioning flow.' AS next_step
FROM   dual;

UNDEFINE ENABLE_OPTIONAL_SELECT_AI
