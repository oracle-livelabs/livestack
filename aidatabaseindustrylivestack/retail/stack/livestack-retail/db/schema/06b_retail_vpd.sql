/*
 * Canonical private Retail application context and fail-closed VPD policies.
 * Bootstrap extracts the package and policy sections around the ADMIN context
 * binding step.
 */

-- SECTION 2A: TRUSTED PACKAGE BEGIN
CREATE OR REPLACE PACKAGE retail_vpd_inventory_pkg AUTHID DEFINER AS
    FUNCTION protected_objects RETURN SYS.ODCIVARCHAR2LIST DETERMINISTIC;
    FUNCTION policy_functions RETURN SYS.ODCIVARCHAR2LIST DETERMINISTIC;
    FUNCTION protected_object_count RETURN PLS_INTEGER DETERMINISTIC;
    FUNCTION installed_policy_count RETURN PLS_INTEGER DETERMINISTIC;
END retail_vpd_inventory_pkg;
/

CREATE OR REPLACE PACKAGE BODY retail_vpd_inventory_pkg AS
    FUNCTION protected_objects RETURN SYS.ODCIVARCHAR2LIST DETERMINISTIC IS
    BEGIN
        RETURN SYS.ODCIVARCHAR2LIST(
            'BRANDS','PRODUCTS','PRODUCT_EMBEDDINGS',
            'FULFILLMENT_CENTERS','INVENTORY','CUSTOMERS','ORDERS','ORDER_ITEMS',
            'SHIPMENTS','FULFILLMENT_ZONES','INFLUENCERS','SOCIAL_POSTS',
            'INFLUENCER_CONNECTIONS','BRAND_INFLUENCER_LINKS','POST_PRODUCT_MENTIONS',
            'POST_EMBEDDINGS','SEMANTIC_MATCHES','RETURN_REQUESTS','RETURN_DOCUMENTS',
            'RETURN_EVIDENCE_INDEX','RETURN_EVENTS','RETURN_DECISIONS',
            'RETURN_DECISION_PROPOSALS','RETURN_DECISION_PROVENANCE',
            'RETURN_CUSTOMER_MESSAGES','RETURN_DECISION_COMMANDS',
            'RETURN_INVESTIGATIONS','RETURN_INVESTIGATION_TURNS',
            'AGENT_CONVERSATIONS','AGENT_CONVERSATION_TURNS','AGENT_RUNTIME_TELEMETRY',
            'AGENT_ACTIONS','EVENT_STREAM',
            'RETURN_POLICY_CLAUSES','DEMAND_FORECASTS','DEMAND_REGIONS',
            'APP_DATASET_STATE','APP_DATASET_JOBS','APP_DATASET_OPERATION_LOCK',
            'APP_DATASET_READINESS','APP_OML_MODEL_REGISTRY',
            'APP_OML_TRAINING_GENERATIONS','APP_OML_STAGE_DEMAND',
            'APP_OML_STAGE_CUSTOMER','APP_OML_STAGE_REVENUE','APP_OML_STAGE_PRODUCT',
            'APP_OML_ASSET_INVENTORY','APP_DATASET_EVENT_OUTBOX',
            'APP_INMEMORY_GENERATION_EVIDENCE','APP_FEATURE_PLAN_EVIDENCE'
        );
    END protected_objects;

    FUNCTION policy_functions RETURN SYS.ODCIVARCHAR2LIST DETERMINISTIC IS
    BEGIN
        RETURN SYS.ODCIVARCHAR2LIST(
            'VPD_RETAIL_DIMENSIONS','VPD_RETAIL_DIMENSIONS','VPD_RETAIL_DIMENSIONS',
            'VPD_RETAIL_OPERATIONAL','VPD_RETAIL_OPERATIONAL','VPD_RETAIL_OPERATIONAL',
            'VPD_RETAIL_OPERATIONAL','VPD_RETAIL_OPERATIONAL','VPD_RETAIL_OPERATIONAL',
            'VPD_RETAIL_OPERATIONAL','VPD_RETAIL_SIGNALS','VPD_RETAIL_SIGNALS',
            'VPD_RETAIL_SIGNALS','VPD_RETAIL_SIGNALS','VPD_RETAIL_SIGNALS',
            'VPD_RETAIL_SIGNALS','VPD_RETAIL_SIGNALS','VPD_RETAIL_OPERATIONAL',
            'VPD_RETAIL_OPERATIONAL','VPD_RETAIL_OPERATIONAL','VPD_RETAIL_OPERATIONAL',
            'VPD_RETAIL_OPERATIONAL',
            'VPD_RETURN_DECISION_LIFECYCLE','VPD_RETURN_DECISION_LIFECYCLE',
            'VPD_RETURN_DECISION_LIFECYCLE','VPD_RETURN_DECISION_LIFECYCLE',
            'VPD_RETURN_INVESTIGATION','VPD_RETURN_INVESTIGATION',
            'VPD_AGENT_CONSOLE_OWNER','VPD_AGENT_CONSOLE_OWNER','VPD_AGENT_CONSOLE_OWNER',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY','VPD_RETAIL_GLOBAL_ONLY',
            'VPD_RETAIL_GLOBAL_ONLY'
        );
    END policy_functions;

    FUNCTION protected_object_count RETURN PLS_INTEGER DETERMINISTIC IS
        v_objects SYS.ODCIVARCHAR2LIST := protected_objects();
    BEGIN
        RETURN v_objects.COUNT;
    END protected_object_count;

    FUNCTION installed_policy_count RETURN PLS_INTEGER DETERMINISTIC IS
    BEGIN
        RETURN protected_object_count() * 2;
    END installed_policy_count;
END retail_vpd_inventory_pkg;
/

CREATE OR REPLACE PACKAGE retail_security_pkg AUTHID DEFINER AS
    PROCEDURE set_user_context(p_username IN VARCHAR2);
    PROCEDURE clear_user_context;
END retail_security_pkg;
/

CREATE OR REPLACE PACKAGE BODY retail_security_pkg AS
    PROCEDURE clear_user_context IS
    BEGIN
        DBMS_SESSION.CLEAR_CONTEXT('RETAIL_APP_CTX', NULL);
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
            RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive Retail application user');
        END IF;

        BEGIN
            SELECT username, LOWER(TRIM(role)), NULLIF(TRIM(region), '')
            INTO v_username, v_role, v_region
            FROM app_users
            WHERE LOWER(username) = LOWER(TRIM(p_username))
              AND is_active = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive Retail application user');
            WHEN TOO_MANY_ROWS THEN
                RAISE_APPLICATION_ERROR(-20081, 'Invalid Retail application user configuration');
        END;

        IF v_role IN ('admin', 'analyst') AND v_region IS NULL THEN
            v_scope := 'GLOBAL';
        ELSIF v_role = 'fulfillment_mgr'
              AND v_region IN ('California', 'New Jersey', 'Georgia') THEN
            v_scope := 'REGIONAL';
        ELSIF v_role IN ('viewer', 'merchandiser') AND v_region IS NULL THEN
            v_scope := 'RESTRICTED';
        ELSE
            RAISE_APPLICATION_ERROR(-20081, 'Invalid Retail application user configuration');
        END IF;

        DBMS_SESSION.SET_CONTEXT('RETAIL_APP_CTX', 'USERNAME', v_username);
        DBMS_SESSION.SET_CONTEXT('RETAIL_APP_CTX', 'ROLE', v_role);
        DBMS_SESSION.SET_CONTEXT('RETAIL_APP_CTX', 'REGION', v_region);
        DBMS_SESSION.SET_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE', v_scope);
        DBMS_SESSION.SET_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED', 'Y');
    EXCEPTION
        WHEN OTHERS THEN
            clear_user_context;
            RAISE;
    END set_user_context;
END retail_security_pkg;
/

MERGE INTO app_users target
USING (
    SELECT 'inactive_audit' username,
           '$2b$10$inactiveaudit0000000000000000000000000000000000000' password_hash,
           'Inactive Audit User' full_name,
           'inactive.audit@retail.demo' email,
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
CREATE OR REPLACE FUNCTION vpd_retail_operational (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
    v_region VARCHAR2(100) := SYS_CONTEXT('RETAIL_APP_CTX', 'REGION');
    v_region_q VARCHAR2(220);
BEGIN
    IF NVL(v_auth, 'N') <> 'Y' THEN RETURN '1 = 0'; END IF;
    IF v_scope = 'global' AND v_role IN ('admin', 'analyst') THEN RETURN NULL; END IF;
    IF v_scope <> 'regional' OR v_role <> 'fulfillment_mgr'
       OR v_region NOT IN ('California', 'New Jersey', 'Georgia') THEN
        RETURN '1 = 0';
    END IF;

    v_region_q := DBMS_ASSERT.ENQUOTE_LITERAL(UPPER(v_region));
    CASE UPPER(p_table)
        WHEN 'FULFILLMENT_CENTERS' THEN
            RETURN 'UPPER(state_province) = ' || v_region_q;
        WHEN 'INVENTORY' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers)';
        WHEN 'CUSTOMERS' THEN
            RETURN 'UPPER(state_province) = ' || v_region_q;
        WHEN 'ORDERS' THEN
            RETURN 'fulfillment_center_id IN (SELECT center_id FROM fulfillment_centers) AND customer_id IN (SELECT customer_id FROM customers)';
        WHEN 'ORDER_ITEMS' THEN
            RETURN 'order_id IN (SELECT order_id FROM orders)';
        WHEN 'SHIPMENTS' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers) AND order_id IN (SELECT order_id FROM orders)';
        WHEN 'FULFILLMENT_ZONES' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers)';
        WHEN 'RETURN_REQUESTS' THEN
            RETURN 'order_id IN (SELECT order_id FROM orders) AND customer_id IN (SELECT customer_id FROM customers)';
        WHEN 'RETURN_DOCUMENTS' THEN
            RETURN 'return_id IN (SELECT return_id FROM return_requests)';
        WHEN 'RETURN_EVIDENCE_INDEX' THEN
            RETURN 'return_id IN (SELECT return_id FROM return_requests)';
        WHEN 'RETURN_EVENTS' THEN
            RETURN 'return_id IN (SELECT return_id FROM return_requests)';
        WHEN 'RETURN_DECISIONS' THEN
            RETURN 'return_id IN (SELECT return_id FROM return_requests)';
        WHEN 'AGENT_ACTIONS' THEN
            RETURN 'LOWER(entity_type) = ''order'' AND entity_id IN (SELECT order_id FROM orders)';
        ELSE
            RETURN '1 = 0';
    END CASE;
END;
/

CREATE OR REPLACE FUNCTION vpd_return_investigation (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
    v_username VARCHAR2(128) := SYS_CONTEXT('RETAIL_APP_CTX', 'USERNAME');
    v_username_q VARCHAR2(280);
BEGIN
    IF NVL(v_auth, 'N') <> 'Y' OR v_username IS NULL THEN RETURN '1 = 0'; END IF;
    IF NOT ((v_scope = 'global' AND v_role IN ('admin', 'analyst'))
         OR (v_scope = 'regional' AND v_role = 'fulfillment_mgr')) THEN
        RETURN '1 = 0';
    END IF;

    v_username_q := DBMS_ASSERT.ENQUOTE_LITERAL(LOWER(v_username));
    IF UPPER(p_table) = 'RETURN_INVESTIGATIONS' THEN
        RETURN 'LOWER(owner_username) = ' || v_username_q ||
               ' AND return_id IN (SELECT return_id FROM return_requests)';
    ELSIF UPPER(p_table) = 'RETURN_INVESTIGATION_TURNS' THEN
        RETURN 'investigation_id IN (SELECT investigation_id FROM return_investigations)';
    END IF;
    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_return_decision_lifecycle (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
    v_username VARCHAR2(128) := SYS_CONTEXT('RETAIL_APP_CTX', 'USERNAME');
    v_username_q VARCHAR2(280);
BEGIN
    IF NVL(v_auth, 'N') <> 'Y' OR v_username IS NULL THEN RETURN '1 = 0'; END IF;
    IF NOT ((v_scope = 'global' AND v_role IN ('admin', 'analyst'))
         OR (v_scope = 'regional' AND v_role = 'fulfillment_mgr')) THEN
        RETURN '1 = 0';
    END IF;

    v_username_q := DBMS_ASSERT.ENQUOTE_LITERAL(LOWER(v_username));
    IF UPPER(p_table) IN ('RETURN_DECISION_PROPOSALS','RETURN_DECISION_COMMANDS') THEN
        RETURN 'LOWER(owner_username) = ' || v_username_q ||
               ' AND return_id IN (SELECT return_id FROM return_requests)';
    ELSIF UPPER(p_table) IN ('RETURN_DECISION_PROVENANCE','RETURN_CUSTOMER_MESSAGES') THEN
        RETURN 'return_id IN (SELECT return_id FROM return_requests)';
    END IF;
    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_return_investigation_write (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
BEGIN
    RETURN vpd_return_investigation(p_schema, p_table);
END;
/

CREATE OR REPLACE FUNCTION vpd_agent_console_owner (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_username VARCHAR2(128) := SYS_CONTEXT('RETAIL_APP_CTX', 'USERNAME');
    v_username_q VARCHAR2(280);
BEGIN
    IF NVL(v_auth, 'N') <> 'Y' OR v_username IS NULL THEN RETURN '1 = 0'; END IF;
    v_username_q := DBMS_ASSERT.ENQUOTE_LITERAL(LOWER(v_username));
    RETURN 'LOWER(owner_username) = ' || v_username_q;
END;
/

CREATE OR REPLACE FUNCTION vpd_retail_signals (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
    v_region VARCHAR2(100) := SYS_CONTEXT('RETAIL_APP_CTX', 'REGION');
    v_region_q VARCHAR2(220);
BEGIN
    IF NVL(v_auth, 'N') <> 'Y' THEN RETURN '1 = 0'; END IF;
    IF v_scope = 'global' AND v_role IN ('admin', 'analyst') THEN RETURN NULL; END IF;
    IF v_scope <> 'regional' OR v_role <> 'fulfillment_mgr'
       OR v_region NOT IN ('California', 'New Jersey', 'Georgia') THEN
        RETURN '1 = 0';
    END IF;
    v_region_q := DBMS_ASSERT.ENQUOTE_LITERAL(UPPER(v_region));
    CASE UPPER(p_table)
        WHEN 'INFLUENCERS' THEN RETURN 'UPPER(region) = ' || v_region_q;
        WHEN 'SOCIAL_POSTS' THEN RETURN 'influencer_id IN (SELECT influencer_id FROM influencers)';
        WHEN 'INFLUENCER_CONNECTIONS' THEN RETURN 'from_influencer IN (SELECT influencer_id FROM influencers) AND to_influencer IN (SELECT influencer_id FROM influencers)';
        WHEN 'BRAND_INFLUENCER_LINKS' THEN RETURN 'influencer_id IN (SELECT influencer_id FROM influencers)';
        WHEN 'POST_PRODUCT_MENTIONS' THEN RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        WHEN 'POST_EMBEDDINGS' THEN RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        WHEN 'SEMANTIC_MATCHES' THEN RETURN 'post_id IN (SELECT post_id FROM social_posts)';
        ELSE RETURN '1 = 0';
    END CASE;
END;
/

CREATE OR REPLACE FUNCTION vpd_retail_dimensions (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
BEGIN
    IF NVL(v_auth, 'N') = 'Y'
       AND ((v_scope = 'global' AND v_role IN ('admin', 'analyst'))
         OR (v_scope = 'regional' AND v_role = 'fulfillment_mgr')) THEN
        RETURN NULL;
    END IF;
    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_retail_global_only (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
BEGIN
    IF NVL(v_auth, 'N') = 'Y' AND v_scope = 'global'
       AND v_role IN ('admin', 'analyst') THEN RETURN NULL; END IF;
    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_retail_write_entitlement (
    p_schema IN VARCHAR2,
    p_table IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER
AS
    v_auth VARCHAR2(1) := SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED');
    v_role VARCHAR2(30) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ROLE'));
    v_scope VARCHAR2(20) := LOWER(SYS_CONTEXT('RETAIL_APP_CTX', 'ACCESS_SCOPE'));
BEGIN
    IF NVL(v_auth, 'N') = 'Y' AND v_scope = 'global' AND v_role = 'admin' THEN
        RETURN NULL;
    END IF;
    IF NVL(v_auth, 'N') = 'Y'
       AND v_scope = 'regional'
       AND v_role = 'fulfillment_mgr'
       AND UPPER(p_table) IN (
         'FULFILLMENT_CENTERS','INVENTORY','CUSTOMERS','ORDERS','ORDER_ITEMS',
         'SHIPMENTS','FULFILLMENT_ZONES','INFLUENCERS','SOCIAL_POSTS',
         'INFLUENCER_CONNECTIONS','BRAND_INFLUENCER_LINKS',
         'POST_PRODUCT_MENTIONS','POST_EMBEDDINGS','SEMANTIC_MATCHES',
         'RETURN_REQUESTS','RETURN_DOCUMENTS','RETURN_EVENTS',
         'RETURN_DECISIONS','AGENT_ACTIONS'
       ) THEN
        RETURN NULL;
    END IF;
    RETURN '1 = 0';
END;
/

DECLARE
    l_objects SYS.ODCIVARCHAR2LIST :=
        retail_vpd_inventory_pkg.protected_objects();
    l_functions SYS.ODCIVARCHAR2LIST :=
        retail_vpd_inventory_pkg.policy_functions();
BEGIN
    IF l_objects.COUNT <> l_functions.COUNT
       OR l_objects.COUNT <> retail_vpd_inventory_pkg.protected_object_count() THEN
        RAISE_APPLICATION_ERROR(
          -20222,
          'Canonical Retail VPD object/function inventory is inconsistent'
        );
    END IF;

    FOR old_policy IN (
        SELECT object_name, policy_name
        FROM user_policies
        WHERE object_name IN (SELECT column_value FROM TABLE(l_objects))
    ) LOOP
        DBMS_RLS.DROP_POLICY(USER, old_policy.object_name, old_policy.policy_name);
    END LOOP;

    FOR i IN 1 .. l_objects.COUNT LOOP
        DBMS_RLS.ADD_POLICY(
            object_schema => USER,
            object_name => l_objects(i),
            policy_name => 'VPD_RT_' || SUBSTR(l_objects(i), 1, 21),
            function_schema => USER,
            policy_function => l_functions(i),
            statement_types => 'SELECT,INSERT,UPDATE,DELETE',
            update_check => TRUE,
            policy_type => DBMS_RLS.CONTEXT_SENSITIVE,
            enable => TRUE
        );
    END LOOP;

    -- SELECT scope and mutation entitlement are independent. Even a globally
    -- scoped analyst receives a second, fail-closed predicate for DML.
    FOR i IN 1 .. l_objects.COUNT LOOP
        DBMS_RLS.ADD_POLICY(
            object_schema => USER,
            object_name => l_objects(i),
            policy_name => 'VPD_RT_WR_' || SUBSTR(l_objects(i), 1, 18),
            function_schema => USER,
            policy_function => CASE
              WHEN l_objects(i) IN ('RETURN_INVESTIGATIONS','RETURN_INVESTIGATION_TURNS')
                THEN 'VPD_RETURN_INVESTIGATION_WRITE'
              WHEN l_objects(i) IN ('AGENT_CONVERSATIONS','AGENT_CONVERSATION_TURNS','AGENT_RUNTIME_TELEMETRY')
                THEN 'VPD_AGENT_CONSOLE_OWNER'
              ELSE 'VPD_RETAIL_WRITE_ENTITLEMENT'
            END,
            statement_types => 'INSERT,UPDATE,DELETE',
            update_check => TRUE,
            policy_type => DBMS_RLS.CONTEXT_SENSITIVE,
            enable => TRUE
        );
    END LOOP;
END;
/

BEGIN
    FOR object_row IN (
        SELECT object_type, object_name
        FROM user_objects
        WHERE object_name IN (
            'SC_SECURITY_CTX','VPD_FULFILLMENT_REGION','VPD_ORDERS_REGION',
            'VPD_GRAPH_INFLUENCERS','VPD_GRAPH_SOCIAL_POSTS',
            'VPD_GRAPH_CONNECTIONS','VPD_GRAPH_BRAND_LINKS','VPD_GRAPH_MENTIONS',
            'VPD_RETAIL_ADMIN_WRITE'
        )
          AND object_type IN ('PACKAGE','PACKAGE BODY','FUNCTION')
        ORDER BY CASE object_type WHEN 'FUNCTION' THEN 1 WHEN 'PACKAGE BODY' THEN 2 ELSE 3 END
    ) LOOP
        BEGIN
            IF object_row.object_type = 'FUNCTION' THEN
                EXECUTE IMMEDIATE 'DROP FUNCTION ' || DBMS_ASSERT.SIMPLE_SQL_NAME(object_row.object_name);
            ELSIF object_row.object_type = 'PACKAGE' THEN
                EXECUTE IMMEDIATE 'DROP PACKAGE ' || DBMS_ASSERT.SIMPLE_SQL_NAME(object_row.object_name);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            IF SQLCODE <> -4043 THEN RAISE; END IF;
        END;
    END LOOP;
END;
/
COMMIT;
-- SECTION 2B: VPD POLICIES END
