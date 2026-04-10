/*
 * 00_setup.sql
 * Database Setup — MUST be run as ADMIN
 * Oracle Autonomous Database 26ai
 *
 * Creates the SOCIALCOMMERCE schema owner and grants every privilege
 * required by the application's subsequent schema scripts.
 *
 * Execution order:
 *   1. Connect as ADMIN and run this script.
 *   2. Connect as SOCIALCOMMERCE and run 01_tables.sql through 08_agents.sql.
 *
 * SQLcl example:
 *   connect admin@<tns_alias>
 *   @00_setup.sql
 *   connect socialcommerce/<password>@<tns_alias>
 *   @01_tables.sql
 *   ...
 *
 * WARNING: Change the default password before running in any shared or
 *          production environment.
 */

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
-- CREATE SCHEMA OWNER: SOCIALCOMMERCE
-- Idempotent — skips creation if the user already exists.
-- ============================================================
-- !! CHANGE THIS PASSWORD before deploying to a shared environment !!
DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM dba_users
    WHERE username = 'SOCIALCOMMERCE';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            CREATE USER socialcommerce
            IDENTIFIED BY "SocialC0mmerce!"
            DEFAULT TABLESPACE data
            TEMPORARY TABLESPACE temp
            QUOTA UNLIMITED ON data
        ]';
        DBMS_OUTPUT.PUT_LINE('User SOCIALCOMMERCE created.');
    ELSE
        DBMS_OUTPUT.PUT_LINE('User SOCIALCOMMERCE already exists — skipping creation.');
    END IF;
END;
/

-- ============================================================
-- CORE SESSION AND DDL PRIVILEGES
-- Covers scripts: 01_tables.sql, 02_json_collections.sql,
--                 03_graph.sql, 04_vector.sql, 05_spatial.sql
-- ============================================================
GRANT CREATE SESSION         TO socialcommerce;  -- connect to the database
GRANT CREATE TABLE           TO socialcommerce;  -- tables, vector columns, spatial columns
GRANT CREATE VIEW            TO socialcommerce;  -- JSON Duality Views
GRANT CREATE SEQUENCE        TO socialcommerce;  -- standalone sequences if needed
GRANT CREATE PROCEDURE       TO socialcommerce;  -- procedures, functions
GRANT CREATE PACKAGE         TO socialcommerce;  -- PL/SQL packages (06_security.sql)
GRANT CREATE TRIGGER         TO socialcommerce;  -- triggers
GRANT CREATE TYPE            TO socialcommerce;  -- object types / collection types
GRANT CREATE ROLE            TO socialcommerce;  -- sc_admin, sc_analyst, etc. (06_security.sql)
GRANT CREATE JOB             TO socialcommerce;  -- DBMS_SCHEDULER jobs if needed
GRANT UNLIMITED TABLESPACE   TO socialcommerce;  -- unrestricted storage quota

-- ============================================================
-- CONVERGED DATABASE FEATURE GRANTS
-- ============================================================

-- JSON / SODA Collections (02_json_collections.sql)
GRANT SODA_APP               TO socialcommerce;

-- Property Graph (03_graph.sql)
-- Grants CREATE PROPERTY GRAPH and related graph DDL/DML privileges
GRANT GRAPH_DEVELOPER        TO socialcommerce;

-- Spatial (05_spatial.sql)
-- EXECUTE on SDO geometry packages used in constraints and operators.
-- NOTE: MDSYS table objects (e.g. SDO_COORD_REF_SYS) are already
--       granted to PUBLIC in ADB and do not require an explicit grant
--       from ADMIN — attempting one raises ORA-01031.
GRANT EXECUTE ON MDSYS.SDO_GEOM TO socialcommerce;
GRANT EXECUTE ON MDSYS.SDO_UTIL TO socialcommerce;
GRANT EXECUTE ON MDSYS.SDO_CS   TO socialcommerce;

-- Row-Level Security / Virtual Private Database (06_security.sql)
-- Required for DBMS_RLS.ADD_POLICY / DROP_POLICY calls
GRANT EXECUTE ON SYS.DBMS_RLS            TO socialcommerce;

-- Unified Auditing — create audit policies (06_security.sql)
GRANT AUDIT_ADMIN            TO socialcommerce;

-- Vector / ONNX model loading (04_vector.sql)
-- LOAD_ONNX_MODEL requires EXECUTE on DBMS_VECTOR.
-- READ,WRITE on DATA_PUMP_DIR is needed to stage the downloaded zip.
GRANT EXECUTE ON DBMS_VECTOR             TO socialcommerce;
GRANT READ, WRITE ON DIRECTORY data_pump_dir TO socialcommerce;

-- Select AI / AI Agent framework (07_ai_profile.sql + 08_agents.sql)
-- LiveStack uses Ollama at the application layer, but if these packages are
-- present in the target database we grant them for optional manual workflows.
BEGIN
    FOR stmt IN (
        SELECT 'GRANT EXECUTE ON DBMS_CLOUD_AI TO socialcommerce' AS sql_stmt FROM dual UNION ALL
        SELECT 'GRANT EXECUTE ON DBMS_CLOUD_AI_AGENT TO socialcommerce' FROM dual UNION ALL
        SELECT 'GRANT EXECUTE ON DBMS_CLOUD TO socialcommerce' FROM dual
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
-- Allows SOCIALCOMMERCE to make outbound HTTPS calls to OCI AI
-- services invoked by Select AI (07_agents.sql).
-- ============================================================
BEGIN
    DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
        host => '*',
        ace  => xs$ace_type(
                    privilege_list => xs$name_list('connect', 'resolve'),
                    principal_name => 'SOCIALCOMMERCE',
                    principal_type => xs_acl.ptype_db
                )
    );
    DBMS_OUTPUT.PUT_LINE('Network ACL granted to SOCIALCOMMERCE.');
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
WHERE  username = 'SOCIALCOMMERCE';

SELECT privilege
FROM   dba_sys_privs
WHERE  grantee = 'SOCIALCOMMERCE'
ORDER  BY privilege;

SELECT granted_role
FROM   dba_role_privs
WHERE  grantee = 'SOCIALCOMMERCE'
ORDER  BY granted_role;

SELECT 'Setup complete.' ||
       ' Connect as SOCIALCOMMERCE and run 01_tables.sql through 08_agents.sql.' AS next_step
FROM   dual;
