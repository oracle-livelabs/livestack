/*
 * 06_security.sql
 * Hospitality RBAC roles and the trusted package for Oracle VPD context.
 *
 * Bootstrap phases:
 *   SECTION 1 - ADMIN creates roles and grants object privileges.
 *   SECTION 2 - Schema owner creates the trusted context package.
 *   06a_hospitality_app_context_admin.sql - ADMIN creates the private context.
 *   06b_hospitality_vpd_policies.sql - Schema owner installs policies.
 */

-- ============================================================
-- SECTION 1: RUN AS ADMIN
-- ============================================================

DEFINE APP_SCHEMA_OWNER = LIVESTACK

BEGIN
  FOR role_name IN (
    SELECT 'SC_ADMIN' AS name FROM dual UNION ALL
    SELECT 'SC_ANALYST' FROM dual UNION ALL
    SELECT 'SC_FULFILLMENT_MGR' FROM dual UNION ALL
    SELECT 'SC_MERCHANDISER' FROM dual UNION ALL
    SELECT 'SC_VIEWER' FROM dual
  ) LOOP
    BEGIN
      EXECUTE IMMEDIATE 'CREATE ROLE ' || role_name.name;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -1921 THEN RAISE; END IF;
    END;
  END LOOP;
END;
/

-- Admin: full access
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..brands TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..products TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..inventory TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..guests TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..orders TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..order_items TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..influencers TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..social_posts TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..agent_actions TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..app_users TO sc_admin;

-- Global Revenue Manager: read all regions, manage forecasts.
GRANT SELECT ON &&APP_SCHEMA_OWNER..brands TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..orders TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..order_items TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..social_posts TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..inventory TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..fulfillment_centers TO sc_analyst;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..demand_forecasts TO sc_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..agent_actions TO sc_analyst;

-- Regional hotel service manager.
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..orders TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..order_items TO sc_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..inventory TO sc_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO sc_fulfillment_mgr;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..shipments TO sc_fulfillment_mgr;

-- Global Guest Experience Manager.
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..brands TO sc_merchandiser;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..products TO sc_merchandiser;
GRANT SELECT ON &&APP_SCHEMA_OWNER..social_posts TO sc_merchandiser;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO sc_merchandiser;
GRANT SELECT ON &&APP_SCHEMA_OWNER..demand_forecasts TO sc_merchandiser;

-- Restricted viewer: only explicitly allowlisted global catalog metadata.
GRANT SELECT ON &&APP_SCHEMA_OWNER..brands TO sc_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_viewer;

-- ============================================================
-- SECTION 2: RUN AS SCHEMA OWNER
-- ============================================================

CREATE OR REPLACE PACKAGE hospitality_security_pkg AUTHID DEFINER AS
  PROCEDURE set_user_context(p_username IN VARCHAR2);
  PROCEDURE clear_user_context;
END hospitality_security_pkg;
/

CREATE OR REPLACE PACKAGE BODY hospitality_security_pkg AS
  PROCEDURE clear_user_context IS
  BEGIN
    DBMS_SESSION.CLEAR_CONTEXT('HOSPITALITY_APP_CTX');
    DBMS_SESSION.CLEAR_IDENTIFIER;
  END clear_user_context;

  PROCEDURE set_user_context(p_username IN VARCHAR2) IS
    v_username app_users.username%TYPE;
    v_role     app_users.role%TYPE;
    v_region   app_users.region%TYPE;
    v_scope    VARCHAR2(20);
  BEGIN
    clear_user_context;

    SELECT username, role, region
      INTO v_username, v_role, v_region
      FROM app_users
     WHERE username = LOWER(TRIM(p_username))
       AND is_active = 1;

    v_scope := CASE
      WHEN v_role IN ('admin', 'analyst', 'merchandiser') THEN 'GLOBAL'
      WHEN v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN 'REGION'
      WHEN v_role = 'viewer' THEN 'RESTRICTED'
      ELSE 'DENY'
    END;

    IF v_scope = 'DENY' THEN
      RAISE_APPLICATION_ERROR(-20002, 'Demo user has no valid access scope.');
    END IF;

    DBMS_SESSION.SET_CONTEXT('HOSPITALITY_APP_CTX', 'USERNAME', v_username);
    DBMS_SESSION.SET_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE', v_role);
    DBMS_SESSION.SET_CONTEXT('HOSPITALITY_APP_CTX', 'REGION', v_region);
    DBMS_SESSION.SET_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE', v_scope);
    DBMS_SESSION.SET_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED', 'Y');
    DBMS_SESSION.SET_IDENTIFIER(v_username);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      clear_user_context;
      RAISE_APPLICATION_ERROR(-20001, 'Unknown or inactive demo user.');
    WHEN OTHERS THEN
      clear_user_context;
      RAISE;
  END set_user_context;
END hospitality_security_pkg;
/

COMMIT;

SELECT 'Hospitality security roles/package created.' AS status FROM dual;
