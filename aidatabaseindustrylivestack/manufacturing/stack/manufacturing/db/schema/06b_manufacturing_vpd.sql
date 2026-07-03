/*
 * 06b_manufacturing_vpd.sql
 * Canonical Manufacturing application context and row-level security.
 *
 * Fresh provisioning extracts the trusted package before creating the private
 * context, then installs the policy phase after the context is bound. The same
 * phases are idempotent for clean initial provisioning.
 */

-- SECTION 2A: TRUSTED PACKAGE BEGIN
CREATE OR REPLACE PACKAGE manufacturing_security_pkg AUTHID DEFINER AS
    PROCEDURE set_user_context(p_username IN VARCHAR2);
    PROCEDURE clear_user_context;
END manufacturing_security_pkg;
/

CREATE OR REPLACE PACKAGE BODY manufacturing_security_pkg AS
    PROCEDURE clear_user_context IS
    BEGIN
        DBMS_SESSION.CLEAR_CONTEXT('MANUFACTURING_APP_CTX', NULL);
    END clear_user_context;

    PROCEDURE set_user_context(p_username IN VARCHAR2) IS
        v_username     app_users.username%TYPE;
        v_role         app_users.role%TYPE;
        v_region       VARCHAR2(2);
        v_access_scope VARCHAR2(20);
    BEGIN
        clear_user_context;

        IF p_username IS NULL OR NOT REGEXP_LIKE(TRIM(p_username), '^[A-Za-z0-9_.-]{1,128}$') THEN
            RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive Manufacturing application user');
        END IF;

        BEGIN
            SELECT username,
                   LOWER(role),
                   CASE region
                       WHEN 'California' THEN 'CA'
                       WHEN 'New Jersey' THEN 'NJ'
                       WHEN 'Georgia' THEN 'GA'
                       WHEN 'CA' THEN 'CA'
                       WHEN 'NJ' THEN 'NJ'
                       WHEN 'GA' THEN 'GA'
                       ELSE NULL
                   END
            INTO v_username, v_role, v_region
            FROM app_users
            WHERE username = TRIM(p_username)
              AND is_active = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive Manufacturing application user');
            WHEN TOO_MANY_ROWS THEN
                RAISE_APPLICATION_ERROR(-20081, 'Invalid Manufacturing application user configuration');
        END;

        IF v_role IN ('admin', 'analyst') AND v_region IS NULL THEN
            v_access_scope := 'GLOBAL';
        ELSIF v_role = 'fulfillment_mgr' AND v_region IN ('CA', 'NJ', 'GA') THEN
            v_access_scope := 'REGIONAL';
        ELSIF v_role IN ('viewer', 'merchandiser') AND v_region IS NULL THEN
            v_access_scope := 'RESTRICTED';
        ELSE
            RAISE_APPLICATION_ERROR(-20081, 'Invalid Manufacturing application user configuration');
        END IF;

        DBMS_SESSION.SET_CONTEXT('MANUFACTURING_APP_CTX', 'USERNAME', v_username);
        DBMS_SESSION.SET_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE', v_role);
        DBMS_SESSION.SET_CONTEXT('MANUFACTURING_APP_CTX', 'REGION', v_region);
        DBMS_SESSION.SET_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE', v_access_scope);
        DBMS_SESSION.SET_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED', 'Y');
    EXCEPTION
        WHEN OTHERS THEN
            clear_user_context;
            RAISE;
    END set_user_context;
END manufacturing_security_pkg;
/
-- SECTION 2A: TRUSTED PACKAGE END

-- SECTION 2B: VPD POLICIES BEGIN

CREATE OR REPLACE TRIGGER trg_agent_actions_region
BEFORE INSERT OR UPDATE ON agent_actions
FOR EACH ROW
BEGIN
    IF SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') = 'REGIONAL' THEN
        :NEW.region_code := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION');
    ELSE
        :NEW.region_code := NULL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_event_stream_region
BEFORE INSERT OR UPDATE ON event_stream
FOR EACH ROW
BEGIN
    IF SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') = 'REGIONAL' THEN
        :NEW.region_code := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION');
    ELSE
        :NEW.region_code := NULL;
    END IF;
END;
/

CREATE OR REPLACE FUNCTION vpd_manufacturing_operational (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
    v_authenticated VARCHAR2(1);
    v_role          VARCHAR2(30);
    v_scope         VARCHAR2(20);
    v_region        VARCHAR2(2);
    v_region_q      VARCHAR2(20);
    v_region_name_q VARCHAR2(40);
BEGIN
    v_authenticated := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED');
    v_role := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE'));
    v_scope := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE'));
    v_region := UPPER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION'));

    IF v_authenticated <> 'Y' THEN
        RETURN '1 = 0';
    END IF;
    IF v_scope = 'global' AND v_role IN ('admin', 'analyst') THEN
        RETURN NULL;
    END IF;
    IF v_scope <> 'regional' OR v_role <> 'fulfillment_mgr'
       OR v_region NOT IN ('CA', 'NJ', 'GA') THEN
        RETURN '1 = 0';
    END IF;

    v_region_q := DBMS_ASSERT.ENQUOTE_LITERAL(v_region);
    v_region_name_q := DBMS_ASSERT.ENQUOTE_LITERAL(
        CASE v_region WHEN 'CA' THEN 'CALIFORNIA' WHEN 'NJ' THEN 'NEW JERSEY' ELSE 'GEORGIA' END
    );

    CASE UPPER(p_table)
        WHEN 'FULFILLMENT_CENTERS' THEN
            RETURN 'UPPER(state_province) IN (' || v_region_q || ',' || v_region_name_q || ')';
        WHEN 'INVENTORY' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers WHERE UPPER(state_province) IN (' ||
                   v_region_q || ',' || v_region_name_q || '))';
        WHEN 'CUSTOMERS' THEN
            RETURN 'UPPER(state_province) IN (' || v_region_q || ',' || v_region_name_q || ')';
        WHEN 'MANUFACTURING_WORK_ORDERS' THEN
            RETURN 'assigned_plant_id IN (SELECT center_id FROM fulfillment_centers WHERE UPPER(state_province) IN (' ||
                   v_region_q || ',' || v_region_name_q || '))';
        WHEN 'MANUFACTURING_WORK_ORDER_LINES' THEN
            RETURN 'assigned_plant_id IN (SELECT center_id FROM fulfillment_centers WHERE UPPER(state_province) IN (' ||
                   v_region_q || ',' || v_region_name_q || '))';
        WHEN 'SHIPMENTS' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers WHERE UPPER(state_province) IN (' ||
                   v_region_q || ',' || v_region_name_q || '))';
        WHEN 'FULFILLMENT_ZONES' THEN
            RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers WHERE UPPER(state_province) IN (' ||
                   v_region_q || ',' || v_region_name_q || '))';
        WHEN 'DEMAND_REGIONS' THEN
            RETURN CASE v_region
                WHEN 'CA' THEN 'region_name IN (''Los Angeles Basin'',''Bay Area (SF)'')'
                WHEN 'NJ' THEN 'region_name IN (''New York Metro'',''Philadelphia Metro'',''Northeast Corridor'')'
                WHEN 'GA' THEN 'region_name IN (''Atlanta Metro'',''Sun Belt South'')'
                ELSE '1 = 0'
            END;
        WHEN 'MANUFACTURING_DEMAND_FORECASTS' THEN
            RETURN CASE v_region
                WHEN 'CA' THEN 'planning_region IN (''Los Angeles Basin'',''Bay Area (SF)'')'
                WHEN 'NJ' THEN 'planning_region IN (''New York Metro'',''Philadelphia Metro'',''Northeast Corridor'')'
                WHEN 'GA' THEN 'planning_region IN (''Atlanta Metro'',''Sun Belt South'')'
                ELSE '1 = 0'
            END;
        WHEN 'AGENT_ACTIONS' THEN
            RETURN 'region_code = ' || v_region_q;
        WHEN 'EVENT_STREAM' THEN
            RETURN 'region_code = ' || v_region_q;
        ELSE
            RETURN '1 = 0';
    END CASE;
END;
/

CREATE OR REPLACE FUNCTION vpd_manufacturing_signals (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
    v_authenticated VARCHAR2(1);
    v_role          VARCHAR2(30);
    v_scope         VARCHAR2(20);
    v_region        VARCHAR2(2);
    v_region_name_q VARCHAR2(40);
BEGIN
    v_authenticated := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED');
    v_role := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE'));
    v_scope := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE'));
    v_region := UPPER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION'));

    IF v_authenticated <> 'Y' THEN RETURN '1 = 0'; END IF;
    IF v_scope = 'global' AND v_role IN ('admin', 'analyst') THEN RETURN NULL; END IF;
    IF v_scope <> 'regional' OR v_role <> 'fulfillment_mgr'
       OR v_region NOT IN ('CA', 'NJ', 'GA') THEN
        RETURN '1 = 0';
    END IF;

    v_region_name_q := DBMS_ASSERT.ENQUOTE_LITERAL(
        CASE v_region WHEN 'CA' THEN 'California' WHEN 'NJ' THEN 'New Jersey' ELSE 'Georgia' END
    );
    CASE UPPER(p_table)
        WHEN 'INFLUENCERS' THEN
            RETURN 'region = ' || v_region_name_q;
        WHEN 'MANUFACTURING_PRODUCTION_SIGNALS' THEN
            RETURN 'network_account_id IN (SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q || ')';
        WHEN 'INFLUENCER_CONNECTIONS' THEN
            RETURN 'from_influencer IN (SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q ||
                   ') AND to_influencer IN (SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q || ')';
        WHEN 'BRAND_INFLUENCER_LINKS' THEN
            RETURN 'influencer_id IN (SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q || ')';
        WHEN 'MANUFACTURING_SIGNAL_PART_MENTIONS' THEN
            RETURN 'production_signal_id IN (SELECT production_signal_id FROM manufacturing_production_signals WHERE network_account_id IN (' ||
                   'SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q || '))';
        WHEN 'MANUFACTURING_SIGNAL_EMBEDDINGS' THEN
            RETURN 'production_signal_id IN (SELECT production_signal_id FROM manufacturing_production_signals WHERE network_account_id IN (' ||
                   'SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q || '))';
        WHEN 'MANUFACTURING_SIGNAL_PART_MATCHES' THEN
            RETURN 'production_signal_id IN (SELECT production_signal_id FROM manufacturing_production_signals WHERE network_account_id IN (' ||
                   'SELECT influencer_id FROM influencers WHERE region = ' || v_region_name_q || '))';
        ELSE
            RETURN '1 = 0';
    END CASE;
END;
/

CREATE OR REPLACE FUNCTION vpd_manufacturing_graph (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
    v_authenticated VARCHAR2(1);
    v_role          VARCHAR2(30);
    v_scope         VARCHAR2(20);
    v_region        VARCHAR2(2);
    v_region_q      VARCHAR2(20);
BEGIN
    v_authenticated := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED');
    v_role := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE'));
    v_scope := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE'));
    v_region := UPPER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION'));

    IF v_authenticated <> 'Y' THEN RETURN '1 = 0'; END IF;
    IF v_scope = 'global' AND v_role IN ('admin', 'analyst') THEN RETURN NULL; END IF;
    IF v_scope <> 'regional' OR v_role <> 'fulfillment_mgr'
       OR v_region NOT IN ('CA', 'NJ', 'GA') THEN
        RETURN '1 = 0';
    END IF;

    v_region_q := DBMS_ASSERT.ENQUOTE_LITERAL(v_region);
    CASE UPPER(p_table)
        WHEN 'MANUFACTURING_GRAPH_ENTITIES' THEN
            RETURN 'entity_id IN (SELECT graph_entity_id FROM manufacturing_graph_entity_access WHERE region_code = ' ||
                   v_region_q || ')';
        WHEN 'MANUFACTURING_GRAPH_RELATIONSHIPS' THEN
            RETURN 'from_entity_id IN (SELECT graph_entity_id FROM manufacturing_graph_entity_access WHERE region_code = ' ||
                   v_region_q || ') AND to_entity_id IN (SELECT graph_entity_id FROM manufacturing_graph_entity_access WHERE region_code = ' ||
                   v_region_q || ')';
        WHEN 'MANUFACTURING_RISK_CASES' THEN
            RETURN 'anchor_entity_id IN (SELECT graph_entity_id FROM manufacturing_graph_entity_access WHERE region_code = ' ||
                   v_region_q || ')';
        WHEN 'MANUFACTURING_CASE_ENTITIES' THEN
            RETURN 'entity_id IN (SELECT graph_entity_id FROM manufacturing_graph_entity_access WHERE region_code = ' ||
                   v_region_q || ')';
        WHEN 'MANUFACTURING_GRAPH_ENTITY_ACCESS' THEN
            RETURN 'region_code = ' || v_region_q;
        ELSE
            RETURN '1 = 0';
    END CASE;
END;
/

DECLARE
    l_objects SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'FULFILLMENT_CENTERS', 'INVENTORY', 'CUSTOMERS', 'MANUFACTURING_WORK_ORDERS', 'MANUFACTURING_WORK_ORDER_LINES',
        'SHIPMENTS', 'FULFILLMENT_ZONES', 'DEMAND_REGIONS', 'MANUFACTURING_DEMAND_FORECASTS',
        'AGENT_ACTIONS', 'EVENT_STREAM',
        'INFLUENCERS', 'MANUFACTURING_PRODUCTION_SIGNALS', 'INFLUENCER_CONNECTIONS',
        'BRAND_INFLUENCER_LINKS', 'MANUFACTURING_SIGNAL_PART_MENTIONS',
        'MANUFACTURING_SIGNAL_EMBEDDINGS', 'MANUFACTURING_SIGNAL_PART_MATCHES',
        'MANUFACTURING_GRAPH_ENTITIES', 'MANUFACTURING_GRAPH_RELATIONSHIPS',
        'MANUFACTURING_RISK_CASES', 'MANUFACTURING_CASE_ENTITIES',
        'MANUFACTURING_GRAPH_ENTITY_ACCESS'
    );
    l_policy_names SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'VPD_SEC_FC', 'VPD_SEC_INVENTORY', 'VPD_SEC_CUSTOMERS', 'VPD_SEC_WORK_ORDERS',
        'VPD_SEC_WORK_ORDER_LINES', 'VPD_SEC_SHIPMENTS', 'VPD_SEC_ZONES',
        'VPD_SEC_DEMAND_REGIONS', 'VPD_SEC_FORECASTS', 'VPD_SEC_AGENT_ACTIONS',
        'VPD_SEC_EVENT_STREAM', 'VPD_SEC_INFLUENCERS', 'VPD_SEC_PRODUCTION_SIGNALS',
        'VPD_SEC_INFLUENCER_LINKS', 'VPD_SEC_BRAND_LINKS', 'VPD_SEC_MENTIONS',
        'VPD_SEC_SIGNAL_EMBEDDINGS', 'VPD_SEC_SIGNAL_MATCHES',
        'VPD_SEC_GRAPH_ENTITIES', 'VPD_SEC_GRAPH_RELS', 'VPD_SEC_RISK_CASES',
        'VPD_SEC_CASE_ENTITIES', 'VPD_SEC_GRAPH_ACCESS'
    );
    l_functions SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'VPD_MANUFACTURING_OPERATIONAL', 'VPD_MANUFACTURING_OPERATIONAL',
        'VPD_MANUFACTURING_OPERATIONAL', 'VPD_MANUFACTURING_OPERATIONAL',
        'VPD_MANUFACTURING_OPERATIONAL', 'VPD_MANUFACTURING_OPERATIONAL',
        'VPD_MANUFACTURING_OPERATIONAL', 'VPD_MANUFACTURING_OPERATIONAL',
        'VPD_MANUFACTURING_OPERATIONAL', 'VPD_MANUFACTURING_OPERATIONAL',
        'VPD_MANUFACTURING_OPERATIONAL',
        'VPD_MANUFACTURING_SIGNALS', 'VPD_MANUFACTURING_SIGNALS',
        'VPD_MANUFACTURING_SIGNALS', 'VPD_MANUFACTURING_SIGNALS',
        'VPD_MANUFACTURING_SIGNALS', 'VPD_MANUFACTURING_SIGNALS',
        'VPD_MANUFACTURING_SIGNALS',
        'VPD_MANUFACTURING_GRAPH', 'VPD_MANUFACTURING_GRAPH',
        'VPD_MANUFACTURING_GRAPH', 'VPD_MANUFACTURING_GRAPH',
        'VPD_MANUFACTURING_GRAPH'
    );
BEGIN
    FOR policy_row IN (
        SELECT object_name, policy_name
        FROM user_policies
        WHERE object_name IN (SELECT column_value FROM TABLE(l_objects))
    ) LOOP
        DBMS_RLS.DROP_POLICY(USER, policy_row.object_name, policy_row.policy_name);
    END LOOP;

    FOR i IN 1 .. l_objects.COUNT LOOP
        DBMS_RLS.ADD_POLICY(
            object_schema   => USER,
            object_name     => l_objects(i),
            policy_name     => l_policy_names(i),
            function_schema => USER,
            policy_function => l_functions(i),
            statement_types => 'SELECT,INSERT,UPDATE,DELETE',
            update_check    => TRUE,
            policy_type     => DBMS_RLS.CONTEXT_SENSITIVE,
            enable          => TRUE
        );
    END LOOP;
END;
/

-- Old per-table policy functions are removed only after every policy points at
-- the canonical context-only policy functions above.
BEGIN
    FOR function_name IN (
        SELECT column_value AS name
        FROM TABLE(SYS.ODCIVARCHAR2LIST(
            'VPD_FULFILLMENT_REGION', 'VPD_INVENTORY_REGION', 'VPD_ORDERS_REGION',
            'VPD_GRAPH_INFLUENCERS', 'VPD_GRAPH_SOCIAL_POSTS', 'VPD_GRAPH_CONNECTIONS',
            'VPD_GRAPH_BRAND_LINKS', 'VPD_GRAPH_MENTIONS', 'VPD_MANUFACTURING_GRAPH_ACCESS'
        ))
    ) LOOP
        BEGIN
            EXECUTE IMMEDIATE 'DROP FUNCTION ' || DBMS_ASSERT.SIMPLE_SQL_NAME(function_name.name);
        EXCEPTION
            WHEN OTHERS THEN
                IF SQLCODE <> -4043 THEN RAISE; END IF;
        END;
    END LOOP;
END;
/

COMMIT;
-- SECTION 2B: VPD POLICIES END
