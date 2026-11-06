/*
 * reset_data.sql
 * Truncates all demo data tables in FK-safe order.
 * Safe to run multiple times — leaves schema structure intact.
 *
 * Usage:
 *   Standalone:  @db/data/reset_data.sql
 *   Via script:  scripts/reset_and_load.sh --reset-only
 */

SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

PROMPT =====================================================
PROMPT  Resetting PeakGear Sporting Goods Demo Data
PROMPT =====================================================

-- Disable FK constraints to allow truncation in any order
BEGIN
    FOR c IN (
        SELECT owner, constraint_name, table_name
        FROM   user_constraints
        WHERE  constraint_type = 'R'
        AND    status          = 'ENABLED'
    ) LOOP
        EXECUTE IMMEDIATE 'ALTER TABLE ' || c.table_name ||
                          ' DISABLE CONSTRAINT ' || c.constraint_name;
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('FK constraints disabled.');
END;
/

-- ── Truncate all demo data tables ────────────────────────────
-- This enrichment table is created after the first seed, so it may not
-- exist yet. Clear it before its parent products on subsequent seed loads.
BEGIN
    EXECUTE IMMEDIATE 'TRUNCATE TABLE webshop_product_attributes';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN RAISE; END IF;
END;
/
TRUNCATE TABLE agent_actions;
TRUNCATE TABLE shipments;
TRUNCATE TABLE order_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE signal_embeddings;
TRUNCATE TABLE post_product_mentions;
-- TRUNCATE TABLE social_post_payloads;  -- removed from demo (not populated)
TRUNCATE TABLE demand_forecasts;
TRUNCATE TABLE product_embeddings;
TRUNCATE TABLE product_attributes;
TRUNCATE TABLE semantic_matches;
TRUNCATE TABLE social_posts;
TRUNCATE TABLE brand_influencer_links;
TRUNCATE TABLE influencer_connections;
TRUNCATE TABLE inventory;
TRUNCATE TABLE demand_regions;
TRUNCATE TABLE fulfillment_zones;
TRUNCATE TABLE customers;
TRUNCATE TABLE influencers;
TRUNCATE TABLE fulfillment_centers;
TRUNCATE TABLE products;
TRUNCATE TABLE brands;
TRUNCATE TABLE app_users;
TRUNCATE TABLE event_stream;

BEGIN
    EXECUTE IMMEDIATE 'TRUNCATE TABLE app_dataset_state';
    DBMS_OUTPUT.PUT_LINE('Dataset metadata cleared.');
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN
            RAISE;
        END IF;
        DBMS_OUTPUT.PUT_LINE('app_dataset_state not present; skipping metadata reset.');
END;
/

PROMPT All demo tables truncated.

-- Seed foreign keys use deterministic IDs starting at 1. Reset identities
-- through ALTER TABLE, never by altering Oracle-owned backing sequences.
-- Only reset empty tables; preserve identities of unrelated populated tables.
DECLARE
    v_count NUMBER;
BEGIN
    FOR c IN (SELECT table_name, column_name, generation_type
              FROM user_tab_identity_cols) LOOP
        EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' ||
            DBMS_ASSERT.ENQUOTE_NAME(c.table_name, FALSE) INTO v_count;
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE ' ||
                DBMS_ASSERT.ENQUOTE_NAME(c.table_name, FALSE) || ' MODIFY ' ||
                DBMS_ASSERT.ENQUOTE_NAME(c.column_name, FALSE) ||
                ' GENERATED ' || c.generation_type || ' AS IDENTITY (START WITH 1)';
        END IF;
    END LOOP;
END;
/

-- Re-enable FK constraints
BEGIN
    FOR c IN (
        SELECT owner, constraint_name, table_name
        FROM   user_constraints
        WHERE  constraint_type = 'R'
        AND    status          = 'DISABLED'
    ) LOOP
        EXECUTE IMMEDIATE 'ALTER TABLE ' || c.table_name ||
                          ' ENABLE CONSTRAINT ' || c.constraint_name;
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('FK constraints re-enabled.');
END;
/

COMMIT;

PROMPT =====================================================
PROMPT  Reset complete. Ready for data load.
PROMPT =====================================================
