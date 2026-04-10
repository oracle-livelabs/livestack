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

PROMPT =====================================================
PROMPT  Resetting Social Commerce Demo Data
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
TRUNCATE TABLE agent_actions;
TRUNCATE TABLE shipments;
TRUNCATE TABLE order_items;
TRUNCATE TABLE orders;
TRUNCATE TABLE post_embeddings;
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

PROMPT All demo tables truncated.

-- Reset identity sequences so IDs restart from 1 on next load
BEGIN
    FOR s IN (
        SELECT sequence_name
        FROM   user_tab_identity_cols
    ) LOOP
        EXECUTE IMMEDIATE 'ALTER SEQUENCE ' || s.sequence_name || ' RESTART START WITH 1';
    END LOOP;
    DBMS_OUTPUT.PUT_LINE('Identity sequences reset to START WITH 1.');
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
