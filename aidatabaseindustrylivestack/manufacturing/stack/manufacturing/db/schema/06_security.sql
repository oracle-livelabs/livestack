/*
 * 06_security.sql
 * Admin-owned Manufacturing roles, object grants, and unified audit policy.
 *
 * Run this script as ADMIN. The trusted application-context package and every
 * VPD policy are defined only in 06b_manufacturing_vpd.sql; keeping one source
 * prevents direct execution from replacing the hardened fail-closed policies.
 */

-- ============================================================
-- SECTION 1: RUN AS ADMIN
-- (CREATE ROLE, cross-schema grants, and unified audit policy)
-- ============================================================

DEFINE APP_SCHEMA_OWNER = LIVESTACK

-- ============================================================
-- DATABASE ROLES
-- ============================================================

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE manufacturing_admin';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;  -- role already exists
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE manufacturing_analyst';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE manufacturing_fulfillment_mgr';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE manufacturing_merchandiser';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE manufacturing_viewer';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
END;
/

-- ============================================================
-- GRANT PRIVILEGES BY ROLE
-- (Fully qualified with schema prefix — run as ADMIN)
-- ============================================================

-- Admin: full access
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..brands TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..products TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..inventory TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..customers TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..manufacturing_work_orders TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..manufacturing_work_order_lines TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..influencers TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..manufacturing_production_signals TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..agent_actions TO manufacturing_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON &&APP_SCHEMA_OWNER..app_users TO manufacturing_admin;

-- Analyst: read all, write forecasts
GRANT SELECT ON &&APP_SCHEMA_OWNER..brands TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_work_orders TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_work_order_lines TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_production_signals TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..inventory TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..fulfillment_centers TO manufacturing_analyst;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..manufacturing_demand_forecasts TO manufacturing_analyst;
GRANT SELECT ON &&APP_SCHEMA_OWNER..agent_actions TO manufacturing_analyst;

-- Fulfillment Manager: manage inventory and shipments
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO manufacturing_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_work_orders TO manufacturing_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_work_order_lines TO manufacturing_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..inventory TO manufacturing_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO manufacturing_fulfillment_mgr;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..shipments TO manufacturing_fulfillment_mgr;

-- Merchandiser: manage products, view production signals
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..brands TO manufacturing_merchandiser;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..products TO manufacturing_merchandiser;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_production_signals TO manufacturing_merchandiser;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO manufacturing_merchandiser;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_demand_forecasts TO manufacturing_merchandiser;

-- Viewer: read-only on key tables
GRANT SELECT ON &&APP_SCHEMA_OWNER..brands TO manufacturing_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO manufacturing_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..manufacturing_production_signals TO manufacturing_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..influencers TO manufacturing_viewer;

-- ============================================================
-- UNIFIED AUDIT POLICY
-- Created and enabled during the initial provision. Catalog checks make this
-- safe to rerun without hiding a conflicting policy definition.
-- ============================================================
DECLARE
    v_policy_row_count PLS_INTEGER;
    v_expected_row_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*),
           COUNT(
               CASE
                   WHEN audit_option = 'UPDATE'
                    AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
                    AND object_name = 'MANUFACTURING_WORK_ORDERS' THEN 1
                   WHEN audit_option = 'DELETE'
                    AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
                    AND object_name = 'MANUFACTURING_WORK_ORDERS' THEN 1
                   WHEN audit_option = 'INSERT'
                    AND object_schema = UPPER('&&APP_SCHEMA_OWNER')
                    AND object_name = 'AGENT_ACTIONS' THEN 1
               END
           )
    INTO v_policy_row_count, v_expected_row_count
    FROM audit_unified_policies
    WHERE policy_name = 'MANUFACTURING_ORDER_AUDIT';

    IF v_policy_row_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            CREATE AUDIT POLICY manufacturing_order_audit
                ACTIONS UPDATE ON &&APP_SCHEMA_OWNER..manufacturing_work_orders,
                        DELETE ON &&APP_SCHEMA_OWNER..manufacturing_work_orders,
                        INSERT ON &&APP_SCHEMA_OWNER..agent_actions
                WHEN 'SYS_CONTEXT(''USERENV'', ''SESSION_USER'') != ''ADMIN'''
                EVALUATE PER SESSION
        ]';

        v_policy_row_count := 3;
        v_expected_row_count := 3;
    END IF;

    IF v_policy_row_count <> 3 OR v_expected_row_count <> 3 THEN
        RAISE_APPLICATION_ERROR(
            -20072,
            'MANUFACTURING_ORDER_AUDIT exists with a conflicting definition'
        );
    END IF;
END;
/

DECLARE
    v_enabled_count PLS_INTEGER;
BEGIN
    SELECT COUNT(DISTINCT policy_name)
    INTO v_enabled_count
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'MANUFACTURING_ORDER_AUDIT'
      AND entity_name = 'ALL USERS';

    IF v_enabled_count = 0 THEN
        EXECUTE IMMEDIATE 'AUDIT POLICY manufacturing_order_audit';
    END IF;

    SELECT COUNT(DISTINCT policy_name)
    INTO v_enabled_count
    FROM audit_unified_enabled_policies
    WHERE policy_name = 'MANUFACTURING_ORDER_AUDIT'
      AND entity_name = 'ALL USERS';

    IF v_enabled_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20073,
            'MANUFACTURING_ORDER_AUDIT is not enabled for all users'
        );
    END IF;
END;
/

-- SECTION 1: END
