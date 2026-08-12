/*
 * Idempotent State and Local region/access-scope schema setup.
 *
 * Run as the application schema before installing SLED_SECURITY_PKG and the
 * canonical policies. It is safe to rerun for fresh or retained demo data.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON

DECLARE
    l_required_tables SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'APP_USERS', 'FULFILLMENT_CENTERS', 'INVENTORY', 'CUSTOMERS',
        'ORDERS', 'ORDER_ITEMS', 'SHIPMENTS', 'FULFILLMENT_ZONES',
        'DEMAND_REGIONS', 'DEMAND_FORECASTS', 'AGENT_ACTIONS', 'EVENT_STREAM',
        'INFLUENCERS', 'SOCIAL_POSTS', 'INFLUENCER_CONNECTIONS',
        'BRAND_INFLUENCER_LINKS', 'POST_PRODUCT_MENTIONS', 'POST_EMBEDDINGS',
        'SEMANTIC_MATCHES', 'OML_CUSTOMER_SEGMENTS', 'OML_CAPACITY_ALERTS'
    );
    v_table_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO   v_table_count
    FROM   user_tables
    WHERE  table_name IN (SELECT column_value FROM TABLE(l_required_tables));

    IF v_table_count <> l_required_tables.COUNT THEN
        RAISE_APPLICATION_ERROR(
            -20070,
            'SLED regional schema preflight failed: required base or ML tables are missing'
        );
    END IF;
END;
/

DECLARE
    PROCEDURE add_column_if_missing(
        p_table_name  VARCHAR2,
        p_column_name VARCHAR2,
        p_definition  VARCHAR2
    ) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*)
        INTO   v_count
        FROM   user_tab_columns
        WHERE  table_name = UPPER(p_table_name)
          AND  column_name = UPPER(p_column_name);

        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(p_table_name) ||
                              ' ADD (' || DBMS_ASSERT.SIMPLE_SQL_NAME(p_column_name) ||
                              ' ' || p_definition || ')';
        END IF;
    END;
BEGIN
    add_column_if_missing('APP_USERS', 'ACCESS_SCOPE', 'VARCHAR2(20)');

    add_column_if_missing('FULFILLMENT_CENTERS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('INVENTORY', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('CUSTOMERS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('ORDERS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('ORDER_ITEMS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('SHIPMENTS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('FULFILLMENT_ZONES', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('DEMAND_REGIONS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('DEMAND_FORECASTS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('AGENT_ACTIONS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('EVENT_STREAM', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('INFLUENCERS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('SOCIAL_POSTS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('INFLUENCER_CONNECTIONS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('BRAND_INFLUENCER_LINKS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('POST_PRODUCT_MENTIONS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('POST_EMBEDDINGS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('SEMANTIC_MATCHES', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('OML_CUSTOMER_SEGMENTS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
    add_column_if_missing('OML_CAPACITY_ALERTS', 'SERVICE_REGION_CODE', 'VARCHAR2(30)');
END;
/

UPDATE app_users
SET access_scope = CASE
    WHEN role IN ('admin', 'analyst') THEN 'GLOBAL'
    WHEN role = 'fulfillment_mgr' THEN 'REGIONAL'
    ELSE 'RESTRICTED'
END;

UPDATE app_users SET region = NULL
WHERE role IN ('admin', 'analyst', 'viewer', 'merchandiser');

UPDATE app_users SET region = 'Western Slope'
WHERE username = 'fm_west_maria';

UPDATE app_users SET region = 'Front Range'
WHERE username = 'fm_east_dave';

UPDATE app_users SET region = 'Southern Colorado'
WHERE username = 'fm_south_keisha';

MERGE INTO app_users target
USING (
    SELECT 'inactive_audit' AS username,
           '$2b$10$inactiveidentitycannotlogin000000000000000000000000000' AS password_hash,
           'Inactive Security Fixture' AS full_name,
           'inactive.audit@state-local-government.demo' AS email,
           'viewer' AS role,
           'RESTRICTED' AS access_scope
    FROM dual
) incoming
ON (target.username = incoming.username)
WHEN MATCHED THEN UPDATE SET
    target.password_hash = incoming.password_hash,
    target.full_name = incoming.full_name,
    target.email = incoming.email,
    target.role = incoming.role,
    target.access_scope = incoming.access_scope,
    target.region = NULL,
    target.is_active = 0
WHEN NOT MATCHED THEN INSERT (
    username, password_hash, full_name, email, role, access_scope, region, is_active
) VALUES (
    incoming.username, incoming.password_hash, incoming.full_name, incoming.email,
    incoming.role, incoming.access_scope, NULL, 0
);

DECLARE
    v_nullable user_tab_columns.nullable%TYPE;
BEGIN
    SELECT nullable INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'APP_USERS'
      AND column_name = 'ACCESS_SCOPE';

    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE 'ALTER TABLE app_users MODIFY (access_scope NOT NULL)';
    END IF;
END;
/

DECLARE
    v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_constraints
    WHERE constraint_name = 'CK_APP_USERS_ACCESS_SCOPE';

    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            ALTER TABLE app_users ADD CONSTRAINT ck_app_users_access_scope
            CHECK (access_scope IN ('GLOBAL','REGIONAL','RESTRICTED'))
        ]';
    END IF;
END;
/

CREATE OR REPLACE FUNCTION sled_region_for_point(
    p_latitude  IN NUMBER,
    p_longitude IN NUMBER
) RETURN VARCHAR2
DETERMINISTIC
AUTHID DEFINER
AS
BEGIN
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RETURN NULL;
    ELSIF p_longitude <= -106.2 THEN
        RETURN 'WESTERN_SLOPE';
    ELSIF p_latitude < 39.2 THEN
        RETURN 'SOUTHERN_COLORADO';
    ELSE
        RETURN 'FRONT_RANGE';
    END IF;
END;
/

CREATE OR REPLACE FUNCTION sled_region_for_city(
    p_city IN VARCHAR2
) RETURN VARCHAR2
DETERMINISTIC
AUTHID DEFINER
AS
    v_city VARCHAR2(100) := UPPER(TRIM(p_city));
BEGIN
    IF v_city IN (
        'GRAND JUNCTION', 'DURANGO', 'MONTROSE', 'STEAMBOAT SPRINGS',
        'GLENWOOD SPRINGS', 'GUNNISON', 'LEADVILLE', 'CRAIG', 'TELLURIDE',
        'CORTEZ'
    ) THEN
        RETURN 'WESTERN_SLOPE';
    ELSIF v_city IN (
        'COLORADO SPRINGS', 'PUEBLO', 'ALAMOSA', 'CAÑON CITY', 'CANON CITY',
        'SALIDA', 'WALSENBURG', 'TRINIDAD'
    ) THEN
        RETURN 'SOUTHERN_COLORADO';
    ELSIF v_city IN (
        'DENVER', 'AURORA', 'FORT COLLINS', 'LAKEWOOD', 'THORNTON', 'ARVADA',
        'WESTMINSTER', 'GREELEY', 'CENTENNIAL', 'BOULDER', 'LONGMONT',
        'LOVELAND', 'CASTLE ROCK', 'BROOMFIELD', 'COMMERCE CITY', 'PARKER',
        'LITTLETON', 'BRIGHTON', 'NORTHGLENN', 'ENGLEWOOD', 'WHEAT RIDGE',
        'LAFAYETTE', 'ERIE', 'STERLING', 'FORT MORGAN', 'YUMA', 'BURLINGTON',
        'IDAHO SPRINGS'
    ) THEN
        RETURN 'FRONT_RANGE';
    END IF;
    RETURN NULL;
END;
/

CREATE OR REPLACE FUNCTION sled_region_for_demand_name(
    p_region_name IN VARCHAR2
) RETURN VARCHAR2
DETERMINISTIC
AUTHID DEFINER
AS
    v_name VARCHAR2(100) := UPPER(TRIM(p_region_name));
BEGIN
    IF REGEXP_LIKE(v_name, 'MESA|GARFIELD|EAGLE|SUMMIT|ROUTT|MONTROSE|LA PLATA|SOUTHWEST') THEN
        RETURN 'WESTERN_SLOPE';
    ELSIF REGEXP_LIKE(v_name, 'EL PASO|PUEBLO|ALAMOSA') THEN
        RETURN 'SOUTHERN_COLORADO';
    ELSIF REGEXP_LIKE(v_name, 'DENVER|ARAPAHOE|JEFFERSON|ADAMS|BOULDER|LARIMER|WELD|DOUGLAS|NORTHEAST') THEN
        RETURN 'FRONT_RANGE';
    END IF;
    RETURN NULL;
END;
/

-- Establish an administrative context when either the new package (repeat
-- setup) or the legacy package (first retained-volume setup) exists.
DECLARE
    v_context_ready  BOOLEAN := FALSE;
    v_username       VARCHAR2(100);
    v_scope          VARCHAR2(20);
    v_authenticated  VARCHAR2(1);
    v_legacy_role    VARCHAR2(30);
    v_legacy_region  VARCHAR2(100);
    v_visible_rows   PLS_INTEGER;
BEGIN
    BEGIN
        EXECUTE IMMEDIATE 'BEGIN SLED_SECURITY_PKG.SET_USER_CONTEXT(''admin_jess''); END;';
        SELECT SYS_CONTEXT('SLED_APP_CTX', 'USERNAME'),
               SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE'),
               SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED')
        INTO   v_username, v_scope, v_authenticated
        FROM   dual;

        v_context_ready := NVL(v_username, '!') = 'admin_jess'
                           AND NVL(v_scope, '!') = 'GLOBAL'
                           AND NVL(v_authenticated, '!') = 'Y';
    EXCEPTION
        WHEN OTHERS THEN
            v_context_ready := FALSE;
    END;

    IF NOT v_context_ready THEN
        BEGIN
            EXECUTE IMMEDIATE 'BEGIN SC_SECURITY_CTX.SET_USER_CONTEXT(''admin_jess''); END;';
            EXECUTE IMMEDIATE
                'BEGIN :role_name := SC_SECURITY_CTX.GET_ROLE(); ' ||
                ':region_name := SC_SECURITY_CTX.GET_REGION(); END;'
                USING OUT v_legacy_role, OUT v_legacy_region;

            SELECT COUNT(*) INTO v_visible_rows FROM fulfillment_centers;
            v_context_ready := NVL(LOWER(v_legacy_role), '!') = 'admin'
                               AND v_legacy_region IS NULL
                               AND v_visible_rows > 0;
        EXCEPTION
            WHEN OTHERS THEN
                v_context_ready := FALSE;
        END;
    END IF;

    IF NOT v_context_ready THEN
        RAISE_APPLICATION_ERROR(
            -20071,
            'SLED schema setup refused: unable to establish verified global security context'
        );
    END IF;
END;
/

CREATE OR REPLACE PROCEDURE refresh_sled_service_regions
AUTHID DEFINER
AS
    v_mismatch_count PLS_INTEGER;
BEGIN
    UPDATE fulfillment_centers
    SET service_region_code = sled_region_for_point(latitude, longitude);

    UPDATE customers
    SET service_region_code = sled_region_for_point(latitude, longitude);

    UPDATE influencers
    SET service_region_code = sled_region_for_city(city);

    UPDATE demand_regions
    SET service_region_code = sled_region_for_demand_name(region_name);

    UPDATE demand_forecasts
    SET service_region_code = sled_region_for_demand_name(region);

    UPDATE inventory target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM fulfillment_centers source
        WHERE source.center_id = target.center_id
    );

    -- Retain every request while replacing only an out-of-region center with
    -- the nearest center in the resident's own Colorado service region.
    MERGE INTO orders target
    USING (
        SELECT order_id, replacement_center_id
        FROM (
            SELECT o.order_id,
                   candidate.center_id AS replacement_center_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY o.order_id
                       ORDER BY POWER(candidate.latitude - resident.latitude, 2) +
                                POWER(candidate.longitude - resident.longitude, 2),
                                candidate.center_id
                   ) AS region_rank
            FROM orders o
            JOIN customers resident
              ON resident.customer_id = o.customer_id
            LEFT JOIN fulfillment_centers assigned
              ON assigned.center_id = o.fulfillment_center_id
            JOIN fulfillment_centers candidate
              ON candidate.service_region_code = resident.service_region_code
             AND candidate.is_active = 1
            WHERE o.fulfillment_center_id IS NOT NULL
              AND NVL(assigned.service_region_code, '!') <> resident.service_region_code
        )
        WHERE region_rank = 1
    ) incoming
    ON (target.order_id = incoming.order_id)
    WHEN MATCHED THEN UPDATE SET
        target.fulfillment_center_id = incoming.replacement_center_id;

    MERGE INTO orders target
    USING (
        SELECT o.order_id, resident.service_region_code
        FROM orders o
        JOIN customers resident ON resident.customer_id = o.customer_id
    ) incoming
    ON (target.order_id = incoming.order_id)
    WHEN MATCHED THEN UPDATE SET
        target.service_region_code = incoming.service_region_code;

    SELECT COUNT(*)
    INTO v_mismatch_count
    FROM orders o
    JOIN customers resident ON resident.customer_id = o.customer_id
    JOIN fulfillment_centers assigned ON assigned.center_id = o.fulfillment_center_id
    WHERE assigned.service_region_code <> resident.service_region_code;

    IF v_mismatch_count > 0 THEN
        RAISE_APPLICATION_ERROR(-20092, 'Unable to reconcile cross-region service requests');
    END IF;

    MERGE INTO order_items target
    USING (
        SELECT order_id, service_region_code, fulfillment_center_id
        FROM orders
    ) incoming
    ON (target.order_id = incoming.order_id)
    WHEN MATCHED THEN UPDATE SET
        target.service_region_code = incoming.service_region_code,
        target.fulfilled_from = incoming.fulfillment_center_id;

    MERGE INTO shipments target
    USING (
        SELECT order_id, service_region_code, fulfillment_center_id
        FROM orders
        WHERE fulfillment_center_id IS NOT NULL
    ) incoming
    ON (target.order_id = incoming.order_id)
    WHEN MATCHED THEN UPDATE SET
        target.service_region_code = incoming.service_region_code,
        target.center_id = incoming.fulfillment_center_id;

    UPDATE fulfillment_zones target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM fulfillment_centers source
        WHERE source.center_id = target.center_id
    );

    UPDATE social_posts target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM influencers source
        WHERE source.influencer_id = target.influencer_id
    );

    UPDATE influencer_connections target
    SET service_region_code = (
        SELECT CASE
                   WHEN source_from.service_region_code = source_to.service_region_code
                   THEN source_from.service_region_code
                   ELSE NULL
               END
        FROM influencers source_from
        JOIN influencers source_to
          ON source_to.influencer_id = target.to_influencer
        WHERE source_from.influencer_id = target.from_influencer
    );

    UPDATE brand_influencer_links target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM influencers source
        WHERE source.influencer_id = target.influencer_id
    );

    UPDATE post_product_mentions target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM social_posts source
        WHERE source.post_id = target.post_id
    );

    UPDATE post_embeddings target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM social_posts source
        WHERE source.post_id = target.post_id
    );

    UPDATE semantic_matches target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM social_posts source
        WHERE source.post_id = target.post_id
    );

    UPDATE oml_customer_segments target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM customers source
        WHERE source.customer_id = target.customer_id
    );

    UPDATE oml_capacity_alerts target
    SET service_region_code = (
        SELECT source.service_region_code
        FROM fulfillment_centers source
        WHERE source.center_id = target.center_id
    );

    -- Existing unkeyed log entries are global-only. New regional entries are
    -- stamped by trusted context triggers in 06b_sled_vpd.sql.
    UPDATE agent_actions SET service_region_code = NULL;
    UPDATE event_stream SET service_region_code = NULL;
END;
/

BEGIN
    refresh_sled_service_regions;
END;
/

CREATE OR REPLACE TRIGGER trg_fc_service_region
BEFORE INSERT OR UPDATE OF latitude, longitude ON fulfillment_centers
FOR EACH ROW
BEGIN
    :NEW.service_region_code := sled_region_for_point(:NEW.latitude, :NEW.longitude);
END;
/

CREATE OR REPLACE TRIGGER trg_customer_service_region
BEFORE INSERT OR UPDATE OF latitude, longitude ON customers
FOR EACH ROW
BEGIN
    :NEW.service_region_code := sled_region_for_point(:NEW.latitude, :NEW.longitude);
END;
/

CREATE OR REPLACE TRIGGER trg_influencer_service_region
BEFORE INSERT OR UPDATE OF city ON influencers
FOR EACH ROW
BEGIN
    :NEW.service_region_code := sled_region_for_city(:NEW.city);
END;
/

CREATE OR REPLACE TRIGGER trg_demand_region_scope
BEFORE INSERT OR UPDATE OF region_name ON demand_regions
FOR EACH ROW
BEGIN
    :NEW.service_region_code := sled_region_for_demand_name(:NEW.region_name);
END;
/

CREATE OR REPLACE TRIGGER trg_forecast_region_scope
BEFORE INSERT OR UPDATE OF region ON demand_forecasts
FOR EACH ROW
BEGIN
    :NEW.service_region_code := sled_region_for_demand_name(:NEW.region);
END;
/

CREATE OR REPLACE TRIGGER trg_inventory_service_region
BEFORE INSERT OR UPDATE OF center_id ON inventory
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM fulfillment_centers
    WHERE center_id = :NEW.center_id;
END;
/

CREATE OR REPLACE TRIGGER trg_order_service_region
BEFORE INSERT OR UPDATE OF customer_id, fulfillment_center_id ON orders
FOR EACH ROW
DECLARE
    v_center_region VARCHAR2(30);
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM customers
    WHERE customer_id = :NEW.customer_id;

    IF :NEW.fulfillment_center_id IS NOT NULL THEN
        SELECT service_region_code INTO v_center_region
        FROM fulfillment_centers
        WHERE center_id = :NEW.fulfillment_center_id;

        IF v_center_region <> :NEW.service_region_code THEN
            RAISE_APPLICATION_ERROR(-20090, 'Service request center must be in the resident service region');
        END IF;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_order_item_service_region
BEFORE INSERT OR UPDATE OF order_id, fulfilled_from ON order_items
FOR EACH ROW
DECLARE
    v_order_center  NUMBER;
    v_center_region VARCHAR2(30);
BEGIN
    SELECT service_region_code, fulfillment_center_id
    INTO :NEW.service_region_code, v_order_center
    FROM orders
    WHERE order_id = :NEW.order_id;

    IF :NEW.fulfilled_from IS NULL THEN
        :NEW.fulfilled_from := v_order_center;
    END IF;

    IF :NEW.fulfilled_from IS NOT NULL THEN
        SELECT service_region_code INTO v_center_region
        FROM fulfillment_centers
        WHERE center_id = :NEW.fulfilled_from;

        IF v_center_region <> :NEW.service_region_code THEN
            RAISE_APPLICATION_ERROR(-20091, 'Request line center must be in the request service region');
        END IF;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_shipment_service_region
BEFORE INSERT OR UPDATE OF order_id, center_id ON shipments
FOR EACH ROW
DECLARE
    v_center_region VARCHAR2(30);
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM orders
    WHERE order_id = :NEW.order_id;

    SELECT service_region_code INTO v_center_region
    FROM fulfillment_centers
    WHERE center_id = :NEW.center_id;

    IF v_center_region <> :NEW.service_region_code THEN
        RAISE_APPLICATION_ERROR(-20093, 'Route center must be in the request service region');
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_zone_service_region
BEFORE INSERT OR UPDATE OF center_id ON fulfillment_zones
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM fulfillment_centers
    WHERE center_id = :NEW.center_id;
END;
/

CREATE OR REPLACE TRIGGER trg_social_post_service_region
BEFORE INSERT OR UPDATE OF influencer_id ON social_posts
FOR EACH ROW
BEGIN
    IF :NEW.influencer_id IS NULL THEN
        :NEW.service_region_code := NULL;
    ELSE
        SELECT service_region_code INTO :NEW.service_region_code
        FROM influencers
        WHERE influencer_id = :NEW.influencer_id;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_connection_service_region
BEFORE INSERT OR UPDATE OF from_influencer, to_influencer ON influencer_connections
FOR EACH ROW
DECLARE
    v_from_region VARCHAR2(30);
    v_to_region   VARCHAR2(30);
BEGIN
    SELECT service_region_code INTO v_from_region
    FROM influencers WHERE influencer_id = :NEW.from_influencer;
    SELECT service_region_code INTO v_to_region
    FROM influencers WHERE influencer_id = :NEW.to_influencer;
    :NEW.service_region_code := CASE WHEN v_from_region = v_to_region THEN v_from_region END;
END;
/

CREATE OR REPLACE TRIGGER trg_brand_link_service_region
BEFORE INSERT OR UPDATE OF influencer_id ON brand_influencer_links
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM influencers WHERE influencer_id = :NEW.influencer_id;
END;
/

CREATE OR REPLACE TRIGGER trg_mention_service_region
BEFORE INSERT OR UPDATE OF post_id ON post_product_mentions
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM social_posts WHERE post_id = :NEW.post_id;
END;
/

CREATE OR REPLACE TRIGGER trg_post_embed_service_region
BEFORE INSERT OR UPDATE OF post_id ON post_embeddings
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM social_posts WHERE post_id = :NEW.post_id;
END;
/

CREATE OR REPLACE TRIGGER trg_match_service_region
BEFORE INSERT OR UPDATE OF post_id ON semantic_matches
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM social_posts WHERE post_id = :NEW.post_id;
END;
/

CREATE OR REPLACE TRIGGER trg_oml_segment_service_region
BEFORE INSERT OR UPDATE OF customer_id ON oml_customer_segments
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM customers WHERE customer_id = :NEW.customer_id;
END;
/

CREATE OR REPLACE TRIGGER trg_oml_capacity_service_region
BEFORE INSERT OR UPDATE OF center_id ON oml_capacity_alerts
FOR EACH ROW
BEGIN
    SELECT service_region_code INTO :NEW.service_region_code
    FROM fulfillment_centers WHERE center_id = :NEW.center_id;
END;
/

DECLARE
    PROCEDURE create_index_if_missing(
        p_index_name VARCHAR2,
        p_table_name VARCHAR2
    ) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM user_indexes
        WHERE index_name = UPPER(p_index_name);
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'CREATE INDEX ' || DBMS_ASSERT.SIMPLE_SQL_NAME(p_index_name) ||
                              ' ON ' || DBMS_ASSERT.SIMPLE_SQL_NAME(p_table_name) ||
                              '(service_region_code)';
        END IF;
    END;
BEGIN
    create_index_if_missing('IDX_FC_SERVICE_REGION', 'FULFILLMENT_CENTERS');
    create_index_if_missing('IDX_INVENTORY_SERVICE_REGION', 'INVENTORY');
    create_index_if_missing('IDX_CUST_SERVICE_REGION', 'CUSTOMERS');
    create_index_if_missing('IDX_ORDERS_SERVICE_REGION', 'ORDERS');
    create_index_if_missing('IDX_INF_SERVICE_REGION', 'INFLUENCERS');
    create_index_if_missing('IDX_DEMAND_REGION_SCOPE', 'DEMAND_REGIONS');
END;
/

BEGIN
    BEGIN
        EXECUTE IMMEDIATE 'BEGIN SLED_SECURITY_PKG.CLEAR_USER_CONTEXT; END;';
    EXCEPTION
        WHEN OTHERS THEN NULL;
    END;
END;
/

COMMIT;
PROMPT SLED regional ownership and access-scope schema setup complete.
