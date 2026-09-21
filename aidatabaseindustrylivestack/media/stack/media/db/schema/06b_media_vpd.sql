/*
 * Canonical fail-closed Media context and VPD policies.
 * Bootstrap runs the trusted package before ADMIN binds MEDIA_APP_CTX, then
 * runs the policy section. Both sections are idempotent.
 */

-- SECTION 2A: TRUSTED PACKAGE BEGIN
CREATE OR REPLACE PACKAGE media_security_pkg AUTHID DEFINER AS
    PROCEDURE set_user_context(p_username IN VARCHAR2);
    PROCEDURE clear_user_context;
END media_security_pkg;
/

CREATE OR REPLACE PACKAGE BODY media_security_pkg AS
    PROCEDURE clear_user_context IS
    BEGIN
        DBMS_SESSION.CLEAR_IDENTIFIER;
        DBMS_SESSION.CLEAR_CONTEXT('MEDIA_APP_CTX', NULL);
    END clear_user_context;

    PROCEDURE set_user_context(p_username IN VARCHAR2) IS
        v_username app_users.username%TYPE;
        v_role app_users.role%TYPE;
        v_region app_users.region%TYPE;
        v_scope VARCHAR2(20);
    BEGIN
        clear_user_context;
        IF p_username IS NULL
           OR NOT REGEXP_LIKE(TRIM(p_username), '^[A-Za-z0-9_.-]{1,128}$') THEN
            RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive Media application user');
        END IF;

        BEGIN
            SELECT username, LOWER(TRIM(role)), NULLIF(TRIM(region), '')
            INTO v_username, v_role, v_region
            FROM app_users
            WHERE LOWER(username) = LOWER(TRIM(p_username))
              AND is_active = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive Media application user');
            WHEN TOO_MANY_ROWS THEN
                RAISE_APPLICATION_ERROR(-20081, 'Invalid Media application user configuration');
        END;

        IF v_role IN ('admin', 'analyst') AND v_region IS NULL THEN
            v_scope := 'GLOBAL';
        ELSIF v_role = 'fulfillment_mgr'
              AND v_region IN ('California', 'New Jersey', 'Georgia') THEN
            v_scope := 'REGIONAL';
        ELSIF v_role IN ('viewer', 'merchandiser') AND v_region IS NULL THEN
            v_scope := 'RESTRICTED';
        ELSE
            RAISE_APPLICATION_ERROR(-20081, 'Invalid Media application user configuration');
        END IF;

        DBMS_SESSION.SET_CONTEXT('MEDIA_APP_CTX', 'USERNAME', v_username);
        DBMS_SESSION.SET_CONTEXT('MEDIA_APP_CTX', 'ROLE', v_role);
        DBMS_SESSION.SET_CONTEXT('MEDIA_APP_CTX', 'REGION', v_region);
        DBMS_SESSION.SET_CONTEXT('MEDIA_APP_CTX', 'ACCESS_SCOPE', v_scope);
        DBMS_SESSION.SET_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED', 'Y');
        DBMS_SESSION.SET_IDENTIFIER(v_username);
    EXCEPTION
        WHEN OTHERS THEN
            clear_user_context;
            RAISE;
    END set_user_context;
END media_security_pkg;
/

MERGE INTO app_users target
USING (
    SELECT 'inactive_audit' username,
           '$2b$10$inactiveaudit0000000000000000000000000000000000000' password_hash,
           'Inactive Audit User' full_name,
           'inactive.audit@media.demo' email,
           'viewer' role
    FROM dual
) source
ON (target.username = source.username)
WHEN MATCHED THEN UPDATE SET target.is_active = 0
WHEN NOT MATCHED THEN INSERT (
    username, password_hash, full_name, email, role, region, is_active
) VALUES (
    source.username, source.password_hash, source.full_name, source.email,
    source.role, NULL, 0
);
COMMIT;
-- SECTION 2A: TRUSTED PACKAGE END

-- SECTION 2B: VPD POLICIES BEGIN
-- LEGACY_MEDIA_VPD_POLICY_CLEANUP_BEGIN
DECLARE
    -- These seven exact tuples were installed by the retired schema-owner
    -- bootstrap. Drop them while their legacy policy functions still exist;
    -- otherwise Oracle can raise ORA-28110 when a protected object is parsed.
BEGIN
    FOR old_policy IN (
        SELECT installed.object_name, installed.policy_name
        FROM user_policies installed
        JOIN (
            SELECT 'FULFILLMENT_CENTERS' object_name, 'VPD_FC_REGION' policy_name FROM dual
            UNION ALL SELECT 'ORDERS', 'VPD_ORDERS_REGION' FROM dual
            UNION ALL SELECT 'INFLUENCERS', 'VPD_GRAPH_INFLUENCERS' FROM dual
            UNION ALL SELECT 'SOCIAL_POSTS', 'VPD_GRAPH_SOCIAL_POSTS' FROM dual
            UNION ALL SELECT 'INFLUENCER_CONNECTIONS', 'VPD_GRAPH_CONNECTIONS' FROM dual
            UNION ALL SELECT 'BRAND_INFLUENCER_LINKS', 'VPD_GRAPH_BRAND_LINKS' FROM dual
            UNION ALL SELECT 'POST_PRODUCT_MENTIONS', 'VPD_GRAPH_MENTIONS' FROM dual
        ) legacy
          ON legacy.object_name = installed.object_name
         AND legacy.policy_name = installed.policy_name
        ORDER BY installed.object_name, installed.policy_name
    ) LOOP
        DBMS_RLS.DROP_POLICY(USER, old_policy.object_name, old_policy.policy_name);
    END LOOP;
END;
/
-- LEGACY_MEDIA_VPD_POLICY_CLEANUP_END

-- LEGACY_MEDIA_VPD_OBJECT_CLEANUP_BEGIN
BEGIN
    FOR object_row IN (
        SELECT object_type, object_name
        FROM user_objects
        WHERE object_name IN (
            'SC_SECURITY_CTX', 'VPD_FULFILLMENT_REGION', 'VPD_ORDERS_REGION',
            'VPD_GRAPH_INFLUENCERS', 'VPD_GRAPH_SOCIAL_POSTS',
            'VPD_GRAPH_CONNECTIONS', 'VPD_GRAPH_BRAND_LINKS', 'VPD_GRAPH_MENTIONS'
        )
          AND object_type IN ('PACKAGE', 'FUNCTION')
        ORDER BY CASE object_type WHEN 'FUNCTION' THEN 1 ELSE 2 END
    ) LOOP
        BEGIN
            IF object_row.object_type = 'FUNCTION' THEN
                EXECUTE IMMEDIATE 'DROP FUNCTION ' || DBMS_ASSERT.SIMPLE_SQL_NAME(object_row.object_name);
            ELSE
                EXECUTE IMMEDIATE 'DROP PACKAGE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(object_row.object_name);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            IF SQLCODE <> -4043 THEN RAISE; END IF;
        END;
    END LOOP;
END;
/
-- LEGACY_MEDIA_VPD_OBJECT_CLEANUP_END

CREATE OR REPLACE FUNCTION vpd_media_rows(
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
    v_authenticated VARCHAR2(1) := SYS_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ACCESS_SCOPE'));
    v_region VARCHAR2(100) := SYS_CONTEXT('MEDIA_APP_CTX', 'REGION');
    v_region_q VARCHAR2(220);
BEGIN
    IF NVL(v_authenticated, 'N') <> 'Y' THEN RETURN '1 = 0'; END IF;
    IF v_scope = 'global' AND v_role IN ('admin', 'analyst') THEN RETURN NULL; END IF;
    IF v_scope <> 'regional'
       OR v_role <> 'fulfillment_mgr'
       OR v_region NOT IN ('California', 'New Jersey', 'Georgia') THEN
        RETURN '1 = 0';
    END IF;

    v_region_q := DBMS_ASSERT.ENQUOTE_LITERAL(UPPER(v_region));
    CASE UPPER(p_table)
        WHEN 'FULFILLMENT_CENTERS' THEN
            RETURN 'UPPER(state_province) = ' || v_region_q;
        WHEN 'INVENTORY' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers WHERE UPPER(state_province) = ' || v_region_q || ')';
        WHEN 'PRODUCTS' THEN
            RETURN 'product_id IN (SELECT i.product_id FROM inventory i JOIN fulfillment_centers fc ' ||
                   'ON fc.center_id = i.center_id WHERE UPPER(fc.state_province) = ' || v_region_q || ')';
        WHEN 'BRANDS' THEN
            RETURN 'brand_id IN (SELECT p.brand_id FROM products p JOIN inventory i ON i.product_id = p.product_id ' ||
                   'JOIN fulfillment_centers fc ON fc.center_id = i.center_id ' ||
                   'WHERE UPPER(fc.state_province) = ' || v_region_q || ')';
        WHEN 'PRODUCT_EMBEDDINGS' THEN
            RETURN 'product_id IN (SELECT i.product_id FROM inventory i JOIN fulfillment_centers fc ' ||
                   'ON fc.center_id = i.center_id WHERE UPPER(fc.state_province) = ' || v_region_q || ')';
        WHEN 'PRODUCT_ATTRIBUTES' THEN
            RETURN 'product_id IN (SELECT i.product_id FROM inventory i JOIN fulfillment_centers fc ' ||
                   'ON fc.center_id = i.center_id WHERE UPPER(fc.state_province) = ' || v_region_q || ')';
        WHEN 'CUSTOMERS' THEN
            RETURN 'UPPER(state_province) = ' || v_region_q;
        WHEN 'ORDERS' THEN
            RETURN 'fulfillment_center_id IN (SELECT center_id FROM fulfillment_centers) ' ||
                   'AND customer_id IN (SELECT customer_id FROM customers)';
        WHEN 'ORDER_ITEMS' THEN
            RETURN 'order_id IN (SELECT order_id FROM orders)';
        WHEN 'SHIPMENTS' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers) ' ||
                   'AND order_id IN (SELECT order_id FROM orders)';
        WHEN 'FULFILLMENT_ZONES' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers)';
        WHEN 'INFLUENCERS' THEN
            RETURN 'UPPER(region) = ' || v_region_q;
        WHEN 'SOCIAL_POSTS' THEN
            RETURN 'influencer_id IN (SELECT influencer_id FROM influencers)';
        WHEN 'INFLUENCER_CONNECTIONS' THEN
            RETURN 'from_influencer IN (SELECT influencer_id FROM influencers) ' ||
                   'AND to_influencer IN (SELECT influencer_id FROM influencers)';
        WHEN 'BRAND_INFLUENCER_LINKS' THEN
            RETURN 'influencer_id IN (SELECT influencer_id FROM influencers)';
        WHEN 'POST_PRODUCT_MENTIONS' THEN
            RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        WHEN 'POST_EMBEDDINGS' THEN
            RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        WHEN 'SOCIAL_POST_PAYLOADS' THEN
            RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        WHEN 'SEMANTIC_MATCHES' THEN
            RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        WHEN 'DEMAND_FORECASTS' THEN
            RETURN 'UPPER(region) = ' || v_region_q;
        WHEN 'DEMAND_REGIONS' THEN
            RETURN 'UPPER(region_name) = ' || v_region_q;
        WHEN 'AGENT_ACTIONS' THEN
            RETURN '(LOWER(entity_type) IN (''order'',''rights_request'') AND entity_id IN (SELECT order_id FROM orders))';
        ELSE
            RETURN '1 = 0';
    END CASE;
END;
/

CREATE OR REPLACE FUNCTION vpd_media_global_only(
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
BEGIN
    IF SYS_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ACCESS_SCOPE')) = 'global'
       AND LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ROLE')) IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;
    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_media_admin_only(
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
BEGIN
    IF SYS_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ROLE')) = 'admin' THEN
        RETURN NULL;
    END IF;
    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_media_dml(
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
BEGIN
    -- DML matrix: Admin is globally entitled. A validated regional
    -- fulfillment manager may maintain only fulfillment-center rows that
    -- remain inside the manager's VPD region; UPDATE_CHECK rejects a
    -- transition out of that region. Analyst, merchandiser, Viewer,
    -- anonymous, unknown and inactive identities remain denied.
    IF SYS_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ROLE')) = 'admin' THEN
        RETURN vpd_media_admin_only(p_schema, p_table);
    END IF;
    IF SYS_CONTEXT('MEDIA_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ROLE')) = 'fulfillment_mgr'
       AND LOWER(SYS_CONTEXT('MEDIA_APP_CTX', 'ACCESS_SCOPE')) = 'regional'
       AND UPPER(p_table) = 'FULFILLMENT_CENTERS' THEN
        RETURN vpd_media_rows(p_schema, p_table);
    END IF;
    RAISE_APPLICATION_ERROR(
      -20501,
      'Media dataset DML is not permitted for this validated persona and object'
    );
END;
/

DECLARE
    -- Exhaustive application-owned inventory. APP_USERS is the reviewed
    -- exception: MEDIA_SECURITY_PKG must read it before a context exists, so
    -- it is package-owned identity root data and has no recursive VPD policy.
    -- Bootstrap is its only writer; no application route exposes mutation.
    l_scene_objects SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'BRANDS', 'PRODUCTS', 'PRODUCT_EMBEDDINGS', 'PRODUCT_ATTRIBUTES',
        'FULFILLMENT_CENTERS', 'INVENTORY', 'CUSTOMERS', 'ORDERS',
        'ORDER_ITEMS', 'SHIPMENTS', 'FULFILLMENT_ZONES', 'INFLUENCERS',
        'SOCIAL_POSTS', 'INFLUENCER_CONNECTIONS', 'BRAND_INFLUENCER_LINKS',
        'POST_PRODUCT_MENTIONS', 'POST_EMBEDDINGS', 'SEMANTIC_MATCHES',
        'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'AGENT_ACTIONS', 'EVENT_STREAM',
        'SOCIAL_POST_PAYLOADS'
    );
    l_admin_objects SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'APP_DATASET_STATE', 'APP_DATASET_JOBS', 'APP_DATASET_READINESS',
        'APP_DATASET_ATTEMPTS', 'APP_DATASET_OPERATION_LOCK',
        'APP_OML_MODEL_REGISTRY', 'APP_OML_CANDIDATE_ROWS',
        'APP_OML_GENERATION_MODELS', 'APP_OML_GENERATIONS',
        'APP_OML_GENERATION_ASSETS', 'APP_DEMO_DATE_ANCHOR',
        'APP_DATASET_EVENT_OUTBOX', 'APP_FEATURE_EXECUTION_EVIDENCE',
        'OML_DEMAND_SETTINGS', 'OML_CUSTOMER_SEGMENT_SETTINGS',
        'OML_REVENUE_SETTINGS', 'OML_PRODUCT_CLUSTER_SETTINGS'
    );
BEGIN
    FOR old_policy IN (
        SELECT object_name, policy_name
        FROM user_policies
        WHERE policy_name LIKE 'VPD_MEDIA_%'
    ) LOOP
        DBMS_RLS.DROP_POLICY(USER, old_policy.object_name, old_policy.policy_name);
    END LOOP;

    FOR inventory IN (
        SELECT DISTINCT listed.object_name, listed.select_function
        FROM (
          SELECT column_value object_name, 'VPD_MEDIA_ROWS' select_function
          FROM TABLE(l_scene_objects)
          UNION
          SELECT column_value object_name, 'VPD_MEDIA_ADMIN_ONLY' select_function
          FROM TABLE(l_admin_objects)
          UNION
          SELECT DISTINCT asset_name object_name,
                 'VPD_MEDIA_ADMIN_ONLY' select_function
          FROM app_oml_generation_assets
          WHERE status IN ('planned','created','active')
        ) listed
        JOIN user_objects object_inventory
          ON object_inventory.object_name = listed.object_name
         AND object_inventory.object_type IN ('TABLE','VIEW')
    ) LOOP
        DBMS_RLS.ADD_POLICY(
            object_schema   => USER,
            object_name     => inventory.object_name,
            policy_name     => 'VPD_MEDIA_SELECT',
            function_schema => USER,
            policy_function => inventory.select_function,
            statement_types => 'SELECT',
            update_check    => FALSE,
            policy_type     => DBMS_RLS.CONTEXT_SENSITIVE,
            enable          => TRUE
        );
        DBMS_RLS.ADD_POLICY(
            object_schema   => USER,
            object_name     => inventory.object_name,
            policy_name     => 'VPD_MEDIA_DML',
            function_schema => USER,
            policy_function => 'VPD_MEDIA_DML',
            statement_types => 'INSERT,UPDATE,DELETE',
            update_check    => TRUE,
            policy_type     => DBMS_RLS.CONTEXT_SENSITIVE,
            enable          => TRUE
        );
    END LOOP;
END;
/
COMMIT;
-- SECTION 2B: VPD POLICIES END
