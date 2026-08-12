/*
 * 00_setup.sql
 * Database Setup — MUST be run as ADMIN
 * Oracle AI Database 26ai Free
 *
 * Creates the application schema owner and grants every privilege
 * required by the application's subsequent schema scripts.
 *
 * Execution order:
 *   1. Connect as ADMIN and run this script.
 *   2. Connect as the application schema owner and run 01_tables.sql through 08_agents.sql.
 *
 * SQLcl example:
 *   connect admin@<tns_alias>
 *   @00_setup.sql
 *   connect livestack/<password>@<tns_alias>
 *   @01_tables.sql
 *   ...
 *
 * These defaults mirror compose.yml and .env.example.
 */

DEFINE APP_SCHEMA_USER = LIVESTACK
DEFINE APP_SCHEMA_PASSWORD = livestackrulez!

-- ============================================================
-- GUARD: This script must run as ADMIN
-- ============================================================
BEGIN
    IF SYS_CONTEXT('USERENV', 'SESSION_USER') != 'ADMIN' THEN
        RAISE_APPLICATION_ERROR(
            -20001,
            'This script must be run as ADMIN. ' ||
            'Current user: ' || SYS_CONTEXT('USERENV', 'SESSION_USER')
        );
    END IF;
    DBMS_OUTPUT.PUT_LINE('Connected as: ' || SYS_CONTEXT('USERENV', 'SESSION_USER'));
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
-- CORE SESSION AND DDL PRIVILEGES
-- Covers scripts: 01_tables.sql, 02_json_collections.sql,
--                 03_graph.sql, 04_vector.sql, 05_spatial.sql
-- ============================================================
GRANT CREATE SESSION         TO &&APP_SCHEMA_USER;  -- connect to the database
GRANT CREATE TABLE           TO &&APP_SCHEMA_USER;  -- tables, vector columns, spatial columns
GRANT CREATE VIEW            TO &&APP_SCHEMA_USER;  -- JSON Duality Views
GRANT CREATE SEQUENCE        TO &&APP_SCHEMA_USER;  -- standalone sequences if needed
GRANT CREATE PROCEDURE       TO &&APP_SCHEMA_USER;  -- procedures, functions
GRANT CREATE PACKAGE         TO &&APP_SCHEMA_USER;  -- PL/SQL packages (06_security.sql)
GRANT CREATE TRIGGER         TO &&APP_SCHEMA_USER;  -- triggers
GRANT CREATE TYPE            TO &&APP_SCHEMA_USER;  -- object types / collection types
GRANT CREATE ROLE            TO &&APP_SCHEMA_USER;  -- sc_admin, sc_analyst, etc. (06_security.sql)
GRANT CREATE JOB             TO &&APP_SCHEMA_USER;  -- DBMS_SCHEDULER jobs if needed
GRANT UNLIMITED TABLESPACE   TO &&APP_SCHEMA_USER;  -- unrestricted storage quota

-- ============================================================
-- CONVERGED DATABASE FEATURE GRANTS
-- ============================================================

-- JSON / SODA Collections (02_json_collections.sql)
GRANT SODA_APP               TO &&APP_SCHEMA_USER;

-- Property Graph (03_graph.sql)
-- Grants CREATE PROPERTY GRAPH and related graph DDL/DML privileges
GRANT GRAPH_DEVELOPER        TO &&APP_SCHEMA_USER;

-- Spatial (05_spatial.sql)
-- EXECUTE on SDO geometry packages used in constraints and operators.
-- NOTE: MDSYS table objects (e.g. SDO_COORD_REF_SYS) are already
--       granted to PUBLIC in Oracle AI Database 26ai Free and do not require an explicit grant
--       from ADMIN — attempting one raises ORA-01031.
GRANT EXECUTE ON MDSYS.SDO_GEOM TO &&APP_SCHEMA_USER;
GRANT EXECUTE ON MDSYS.SDO_UTIL TO &&APP_SCHEMA_USER;
GRANT EXECUTE ON MDSYS.SDO_CS   TO &&APP_SCHEMA_USER;

-- Row-Level Security / Virtual Private Database (06_security.sql)
-- Required for DBMS_RLS.ADD_POLICY / DROP_POLICY calls
GRANT EXECUTE ON SYS.DBMS_RLS            TO &&APP_SCHEMA_USER;

-- Unified Auditing — create audit policies (06_security.sql)
GRANT AUDIT_ADMIN            TO &&APP_SCHEMA_USER;

-- Vector / ONNX model loading (04_vector.sql)
-- LOAD_ONNX_MODEL requires EXECUTE on DBMS_VECTOR.
-- READ,WRITE on DATA_PUMP_DIR is needed to stage the downloaded zip.
GRANT EXECUTE ON DBMS_VECTOR             TO &&APP_SCHEMA_USER;
GRANT READ, WRITE ON DIRECTORY data_pump_dir TO &&APP_SCHEMA_USER;

-- Select AI / AI Agent framework (07_ai_profile.sql + 08_agents.sql)
-- LiveStack uses Ollama at the application layer, but if these packages are
-- present in the target database we grant them for optional manual workflows.
BEGIN
    FOR stmt IN (
        SELECT 'GRANT EXECUTE ON DBMS_CLOUD_AI TO &&APP_SCHEMA_USER' AS sql_stmt FROM dual UNION ALL
        SELECT 'GRANT EXECUTE ON DBMS_CLOUD_AI_AGENT TO &&APP_SCHEMA_USER' FROM dual UNION ALL
        SELECT 'GRANT EXECUTE ON DBMS_CLOUD TO &&APP_SCHEMA_USER' FROM dual
    ) LOOP
        BEGIN
            EXECUTE IMMEDIATE stmt.sql_stmt;
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_OUTPUT.PUT_LINE('Skipping optional AI grant: ' || stmt.sql_stmt);
        END;
    END LOOP;
END;
/

-- ============================================================
-- NETWORK ACCESS CONTROL LIST
-- Allows the application schema to make outbound HTTPS calls to OCI AI
-- services invoked by Select AI (07_agents.sql).
-- ============================================================
BEGIN
    DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
        host => '*',
        ace  => xs$ace_type(
                    privilege_list => xs$name_list('connect', 'resolve'),
                    principal_name => UPPER('&&APP_SCHEMA_USER'),
                    principal_type => xs_acl.ptype_db
                )
    );
    DBMS_OUTPUT.PUT_LINE('Network ACL granted to ' || UPPER('&&APP_SCHEMA_USER') || '.');
EXCEPTION
    WHEN OTHERS THEN
        -- ORA-44416: ACE already exists for this principal
        IF SQLCODE = -44416 THEN
            DBMS_OUTPUT.PUT_LINE('Network ACL already exists — skipping.');
        ELSE
            RAISE;
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

SELECT 'Setup complete.' ||
       ' Connect as ' || UPPER('&&APP_SCHEMA_USER') || ' and run 01_tables.sql through 08_agents.sql.' AS next_step
FROM   dual;
