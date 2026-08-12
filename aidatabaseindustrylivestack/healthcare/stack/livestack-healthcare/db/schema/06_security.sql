/*
 * 06_security.sql
 * Role-Based Access Control (RBAC) and Virtual Private Database (VPD)
 * Demonstrates converged security within the same database
 *
 * EXECUTION NOTE: This script is split into two sections by connection:
 *   SECTION 1 — Run as ADMIN (requires CREATE ROLE privilege)
 *   SECTION 2A — Run as the schema owner to compile the trusted package
 *   06a_healthcare_app_context_admin.sql — Run as ADMIN to bind the context
 *   SECTION 2B — Run as the schema owner to install policies and auditing
 *
 * In Oracle AI Database 26ai Free, CREATE ROLE and cross-schema GRANTs require ADMIN.
 * The VPD package, function, policy, and audit policy run as the schema owner.
 */

-- ============================================================
-- SECTION 1: RUN AS ADMIN
-- (CREATE ROLE + GRANT privileges on the application schema)
-- ============================================================

DEFINE APP_SCHEMA_OWNER = LIVESTACK

-- ============================================================
-- DATABASE ROLES
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE sc_admin';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;  -- role already exists
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE sc_analyst';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE sc_fulfillment_mgr';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE sc_care_coordinator';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE sc_viewer';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

-- ============================================================
-- GRANT PRIVILEGES BY ROLE
-- (Fully qualified with schema prefix — run as ADMIN)
-- ============================================================

-- Admin: full access
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..brands TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..products TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..inventory TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..customers TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..orders TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..order_items TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..influencers TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..social_posts TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..agent_actions TO sc_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..app_users TO sc_admin;

-- Analyst: read all, write forecasts
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

-- Fulfillment Manager: manage inventory and shipments
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..orders TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..order_items TO sc_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..inventory TO sc_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO sc_fulfillment_mgr;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..shipments TO sc_fulfillment_mgr;

-- Care Coordinator: manage products, view signals
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..brands TO sc_care_coordinator;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..products TO sc_care_coordinator;
GRANT SELECT ON &&APP_SCHEMA_OWNER..social_posts TO sc_care_coordinator;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO sc_care_coordinator;
GRANT SELECT ON &&APP_SCHEMA_OWNER..demand_forecasts TO sc_care_coordinator;

-- Viewer: read-only on key tables
GRANT SELECT ON &&APP_SCHEMA_OWNER..brands TO sc_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..social_posts TO sc_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO sc_viewer;

-- ============================================================
-- SECTION 2: RUN AS SCHEMA OWNER
-- (VPD package, function, policy, and audit policy)
-- ============================================================

-- SECTION 2A: TRUSTED SECURITY PACKAGE

-- ============================================================
-- VIRTUAL PRIVATE DATABASE (VPD) POLICIES
-- Restrict fulfillment managers to see only their region's data
-- ============================================================

-- Trusted application context.  Identity belongs to the Oracle session rather
-- than package globals, so it is visible to DBMS_RLS and can be scrubbed when a
-- pooled connection is returned.
CREATE OR REPLACE PACKAGE healthcare_security_pkg AS
    PROCEDURE set_actor_context(p_username IN VARCHAR2);
    PROCEDURE clear_actor_context;
END healthcare_security_pkg;
/

CREATE OR REPLACE PACKAGE BODY healthcare_security_pkg AS
    PROCEDURE set_actor_context(p_username IN VARCHAR2) IS
        v_region app_users.region%TYPE;
        v_role app_users.role%TYPE;
    BEGIN
        DBMS_SESSION.CLEAR_CONTEXT('HEALTHCARE_SECURITY_CTX');
        SELECT region, role INTO v_region, v_role
        FROM app_users
        WHERE username = p_username
          AND is_active = 1;
        DBMS_SESSION.SET_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ACTOR', p_username);
        DBMS_SESSION.SET_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE', v_role);
        DBMS_SESSION.SET_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION', v_region);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            -- An unknown/disabled actor must never inherit the previous
            -- borrower's authority from a pooled database session.
            RAISE_APPLICATION_ERROR(-20001, 'Unknown or inactive healthcare actor');
    END;
    PROCEDURE clear_actor_context IS
    BEGIN
        DBMS_SESSION.CLEAR_CONTEXT('HEALTHCARE_SECURITY_CTX');
    END;
END healthcare_security_pkg;
/

-- HEALTHCARE_SECURITY_CTX is created by ADMIN through
-- 06a_healthcare_app_context_admin.sql after this package compiles. The
-- application schema is deliberately not granted CREATE ANY CONTEXT.

-- SECTION 2B: VPD POLICIES AND AUDIT

-- VPD policy function for fulfillment center regional access
CREATE OR REPLACE FUNCTION vpd_fulfillment_region (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    -- Admins and analysts see everything
    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;  -- no predicate = full access
    END IF;

    -- Fulfillment managers see their region
    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'state_province = ''' || v_region || '''';
    END IF;

    RETURN '1=0';
END;
/

-- Products underpin the native products_inventory_dv endpoint. Applying the
-- policy to the base table means the duality view receives the same trusted
-- session predicate and never becomes a VPD escape hatch.
CREATE OR REPLACE FUNCTION vpd_products_access (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role VARCHAR2(30);
BEGIN
    v_role := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    IF v_role IN ('admin', 'analyst', 'fulfillment_mgr', 'care_coordinator', 'viewer') THEN
        RETURN NULL;
    END IF;
    RETURN '1=0';
END;
/

BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'PRODUCTS',
        policy_name     => 'VPD_PRODUCTS_ACCESS',
        function_schema => USER,
        policy_function => 'VPD_PRODUCTS_ACCESS',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
            DBMS_RLS.DROP_POLICY(USER, 'PRODUCTS', 'VPD_PRODUCTS_ACCESS');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'PRODUCTS',
                policy_name     => 'VPD_PRODUCTS_ACCESS',
                function_schema => USER,
                policy_function => 'VPD_PRODUCTS_ACCESS',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- Apply VPD policy to FULFILLMENT_CENTERS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'FULFILLMENT_CENTERS',
        policy_name     => 'VPD_FC_REGION',
        function_schema => USER,
        policy_function => 'VPD_FULFILLMENT_REGION',
        statement_types => 'SELECT,UPDATE',
        update_check    => TRUE,
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN  -- policy already exists
            DBMS_RLS.DROP_POLICY(USER, 'FULFILLMENT_CENTERS', 'VPD_FC_REGION');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'FULFILLMENT_CENTERS',
                policy_name     => 'VPD_FC_REGION',
                function_schema => USER,
                policy_function => 'VPD_FULFILLMENT_REGION',
                statement_types => 'SELECT,UPDATE',
                update_check    => TRUE,
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- ============================================================
-- VPD policy for ORDERS table
-- Fulfillment managers see only orders routed to their region's
-- centers; admins/analysts/supply planners/viewers see all orders.
-- ============================================================

CREATE OR REPLACE FUNCTION vpd_orders_region (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    -- Admins and analysts see everything
    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;

    -- Fulfillment managers see orders routed to their region's centers
    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'fulfillment_center_id IN (SELECT center_id FROM fulfillment_centers WHERE state_province = ''' || v_region || ''')';
    END IF;

    RETURN '1=0';
END;
/

-- Apply VPD policy to ORDERS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'ORDERS',
        policy_name     => 'VPD_ORDERS_REGION',
        function_schema => USER,
        policy_function => 'VPD_ORDERS_REGION',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN  -- policy already exists
            DBMS_RLS.DROP_POLICY(USER, 'ORDERS', 'VPD_ORDERS_REGION');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'ORDERS',
                policy_name     => 'VPD_ORDERS_REGION',
                function_schema => USER,
                policy_function => 'VPD_ORDERS_REGION',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- ============================================================
-- VPD POLICIES FOR GRAPH / SOCIAL DATA
-- Admins and analysts see all graph data.
-- Fulfillment managers see only influencers/posts/connections
-- in their assigned region.
-- Everyone else sees all graph data.
-- ============================================================

-- Policy function for INFLUENCERS table (region column directly)
CREATE OR REPLACE FUNCTION vpd_graph_influencers (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    -- Admins and analysts see everything
    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;

    -- Fulfillment managers see only their region's influencers
    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'region = ''' || v_region || '''';
    END IF;

    RETURN '1=0';
END;
/

-- Policy function for SOCIAL_POSTS (join through influencer_id)
CREATE OR REPLACE FUNCTION vpd_graph_social_posts (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;

    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'influencer_id IN (SELECT influencer_id FROM influencers WHERE region = ''' || v_region || ''')';
    END IF;

    RETURN '1=0';
END;
/

-- Policy function for INFLUENCER_CONNECTIONS (edges between influencers)
CREATE OR REPLACE FUNCTION vpd_graph_connections (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;

    -- Fulfillment managers see connections where either endpoint is in their region
    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'from_influencer IN (SELECT influencer_id FROM influencers WHERE region = ''' || v_region || ''') '
            || 'OR to_influencer IN (SELECT influencer_id FROM influencers WHERE region = ''' || v_region || ''')';
    END IF;

    RETURN '1=0';
END;
/

-- Policy function for BRAND_INFLUENCER_LINKS
CREATE OR REPLACE FUNCTION vpd_graph_brand_links (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;

    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'influencer_id IN (SELECT influencer_id FROM influencers WHERE region = ''' || v_region || ''')';
    END IF;

    RETURN '1=0';
END;
/

-- Policy function for POST_PRODUCT_MENTIONS
CREATE OR REPLACE FUNCTION vpd_graph_mentions (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'ROLE');
    v_region := SYS_CONTEXT('HEALTHCARE_SECURITY_CTX', 'REGION');

    IF v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;

    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'post_id IN (SELECT post_id FROM social_posts WHERE influencer_id IN '
            || '(SELECT influencer_id FROM influencers WHERE region = ''' || v_region || '''))';
    END IF;

    RETURN '1=0';
END;
/

-- Apply VPD policy to INFLUENCERS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'INFLUENCERS',
        policy_name     => 'VPD_GRAPH_INFLUENCERS',
        function_schema => USER,
        policy_function => 'VPD_GRAPH_INFLUENCERS',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
            DBMS_RLS.DROP_POLICY(USER, 'INFLUENCERS', 'VPD_GRAPH_INFLUENCERS');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'INFLUENCERS',
                policy_name     => 'VPD_GRAPH_INFLUENCERS',
                function_schema => USER,
                policy_function => 'VPD_GRAPH_INFLUENCERS',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- Apply VPD policy to SOCIAL_POSTS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'SOCIAL_POSTS',
        policy_name     => 'VPD_GRAPH_SOCIAL_POSTS',
        function_schema => USER,
        policy_function => 'VPD_GRAPH_SOCIAL_POSTS',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
            DBMS_RLS.DROP_POLICY(USER, 'SOCIAL_POSTS', 'VPD_GRAPH_SOCIAL_POSTS');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'SOCIAL_POSTS',
                policy_name     => 'VPD_GRAPH_SOCIAL_POSTS',
                function_schema => USER,
                policy_function => 'VPD_GRAPH_SOCIAL_POSTS',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- Apply VPD policy to INFLUENCER_CONNECTIONS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'INFLUENCER_CONNECTIONS',
        policy_name     => 'VPD_GRAPH_CONNECTIONS',
        function_schema => USER,
        policy_function => 'VPD_GRAPH_CONNECTIONS',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
            DBMS_RLS.DROP_POLICY(USER, 'INFLUENCER_CONNECTIONS', 'VPD_GRAPH_CONNECTIONS');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'INFLUENCER_CONNECTIONS',
                policy_name     => 'VPD_GRAPH_CONNECTIONS',
                function_schema => USER,
                policy_function => 'VPD_GRAPH_CONNECTIONS',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- Apply VPD policy to BRAND_INFLUENCER_LINKS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'BRAND_INFLUENCER_LINKS',
        policy_name     => 'VPD_GRAPH_BRAND_LINKS',
        function_schema => USER,
        policy_function => 'VPD_GRAPH_BRAND_LINKS',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
            DBMS_RLS.DROP_POLICY(USER, 'BRAND_INFLUENCER_LINKS', 'VPD_GRAPH_BRAND_LINKS');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'BRAND_INFLUENCER_LINKS',
                policy_name     => 'VPD_GRAPH_BRAND_LINKS',
                function_schema => USER,
                policy_function => 'VPD_GRAPH_BRAND_LINKS',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

-- Apply VPD policy to POST_PRODUCT_MENTIONS
BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => USER,
        object_name     => 'POST_PRODUCT_MENTIONS',
        policy_name     => 'VPD_GRAPH_MENTIONS',
        function_schema => USER,
        policy_function => 'VPD_GRAPH_MENTIONS',
        statement_types => 'SELECT',
        enable          => TRUE
    );
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE = -28101 THEN
            DBMS_RLS.DROP_POLICY(USER, 'POST_PRODUCT_MENTIONS', 'VPD_GRAPH_MENTIONS');
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => 'POST_PRODUCT_MENTIONS',
                policy_name     => 'VPD_GRAPH_MENTIONS',
                function_schema => USER,
                policy_function => 'VPD_GRAPH_MENTIONS',
                statement_types => 'SELECT',
                enable          => TRUE
            );
        ELSE
            RAISE;
        END IF;
END;
/

COMMIT;

SELECT 'Security objects created successfully' AS status FROM dual;
