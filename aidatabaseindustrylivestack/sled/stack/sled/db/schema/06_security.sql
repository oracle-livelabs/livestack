/*
 * 06_security.sql
 * Database roles and object grants for the State and Local LiveStack.
 *
 * Run this section as ADMIN. The trusted application context and VPD objects
 * are installed separately by 06a_sled_app_context_admin.sql and
 * 06b_sled_vpd.sql so fresh and retained database volumes use the same phases.
 */

-- ============================================================
-- SECTION 1: RUN AS ADMIN
-- ============================================================

DEFINE APP_SCHEMA_OWNER = LIVESTACK

BEGIN
    EXECUTE IMMEDIATE 'CREATE ROLE sc_admin';
EXCEPTION WHEN OTHERS THEN
    IF SQLCODE != -1921 THEN RAISE; END IF;
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
    EXECUTE IMMEDIATE 'CREATE ROLE sc_merchandiser';
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

-- Database roles are illustrative. Runtime authorization is enforced by the
-- private SLED_APP_CTX VPD context because the pool connects as the schema.
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

GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..customers TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..orders TO sc_fulfillment_mgr;
GRANT SELECT ON &&APP_SCHEMA_OWNER..order_items TO sc_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..inventory TO sc_fulfillment_mgr;
GRANT SELECT, UPDATE ON &&APP_SCHEMA_OWNER..fulfillment_centers TO sc_fulfillment_mgr;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..shipments TO sc_fulfillment_mgr;

GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..brands TO sc_merchandiser;
GRANT SELECT, INSERT, UPDATE ON &&APP_SCHEMA_OWNER..products TO sc_merchandiser;

-- Restricted viewers retain reference-catalog access only. Protected
-- operational rows are denied by VPD even when accessed through schema views.
GRANT SELECT ON &&APP_SCHEMA_OWNER..brands TO sc_viewer;
GRANT SELECT ON &&APP_SCHEMA_OWNER..products TO sc_viewer;

-- ============================================================
-- SECTION 2: RUN AS SCHEMA OWNER
-- Canonical objects moved to 06a_sled_app_context_admin.sql and
-- 06b_sled_vpd.sql. This marker intentionally remains for older tooling.
-- ============================================================

PROMPT Database roles and object grants are ready.
