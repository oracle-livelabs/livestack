/*
 * reset_data.sql
 * Truncates all demo data tables in FK-safe order.
 * Safe to run multiple times — leaves schema structure intact.
 *
 * Usage:
 *   Standalone:  @db/data/reset_data.sql
 */

SET SERVEROUTPUT ON
SET DEFINE OFF

PROMPT =====================================================
PROMPT  Resetting Utilities Demo Data
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
TRUNCATE TABLE restoration_case_entities;
TRUNCATE TABLE restoration_cases;
TRUNCATE TABLE utility_graph_relationships;
TRUNCATE TABLE utility_graph_entities;
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

BEGIN
    EXECUTE IMMEDIATE 'TRUNCATE TABLE app_demo_date_anchor';
    DBMS_OUTPUT.PUT_LINE('Demo date anchor metadata cleared.');
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE != -942 THEN
            RAISE;
        END IF;
        DBMS_OUTPUT.PUT_LINE('app_demo_date_anchor not present; skipping date anchor reset.');
END;
/

PROMPT All demo tables truncated.

-- Refresh signal-channel check constraint for existing databases that predate
-- the Energy & Utilities signal taxonomy.
BEGIN
    FOR c IN (
        SELECT uc.constraint_name
        FROM   user_constraints uc
        JOIN   user_cons_columns ucc
          ON   ucc.constraint_name = uc.constraint_name
         AND   ucc.owner = uc.owner
        WHERE  uc.table_name = 'INFLUENCERS'
        AND    uc.constraint_type = 'C'
        AND    ucc.column_name = 'PLATFORM'
    ) LOOP
        EXECUTE IMMEDIATE 'ALTER TABLE influencers DROP CONSTRAINT ' || c.constraint_name;
    END LOOP;

    EXECUTE IMMEDIATE q'[
        ALTER TABLE influencers ADD CONSTRAINT ck_influencers_platform_utilities
        CHECK (platform IN (
            'Reliability Signal',
            'Production Signal',
            'Supply Quality Notice',
            'Compliance Signal',
            'Field Access Bulletin',
            'Regulatory Notice',
            'Capacity Alert',
            'HSE and Emissions Notice'
        ))
    ]';
    DBMS_OUTPUT.PUT_LINE('Influencer signal-channel constraint refreshed.');
END;
/

-- Refresh app user role constraint for the Utilities field-supervisor role.
BEGIN
    FOR c IN (
        SELECT uc.constraint_name
        FROM   user_constraints uc
        JOIN   user_cons_columns ucc
          ON   ucc.constraint_name = uc.constraint_name
         AND   ucc.owner = uc.owner
        WHERE  uc.table_name = 'APP_USERS'
        AND    uc.constraint_type = 'C'
        AND    ucc.column_name = 'ROLE'
    ) LOOP
        EXECUTE IMMEDIATE 'ALTER TABLE app_users DROP CONSTRAINT ' || c.constraint_name;
    END LOOP;

    EXECUTE IMMEDIATE q'[
        ALTER TABLE app_users ADD CONSTRAINT ck_app_users_role_utilities
        CHECK (role IN (
            'admin',
            'analyst',
            'fulfillment_mgr',
            'field_supervisor',
            'viewer'
        ))
    ]';
    DBMS_OUTPUT.PUT_LINE('App user role constraint refreshed.');
END;
/

-- Reset identity sequences so IDs restart from 1 on next load
BEGIN
    FOR s IN (
        SELECT sequence_name
        FROM   user_tab_identity_cols
    ) LOOP
        BEGIN
            EXECUTE IMMEDIATE 'ALTER SEQUENCE ' || s.sequence_name || ' RESTART START WITH 1';
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_OUTPUT.PUT_LINE('Skipping identity sequence reset for ' || s.sequence_name || ': ' || SQLERRM);
        END;
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
