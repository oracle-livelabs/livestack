/*
 * Canonical State and Local trusted context and VPD policies.
 * The trusted package is installed before SLED_APP_CTX is created; policies are
 * installed only after the context has been bound by ADMIN.
 */

-- SECTION 2A: TRUSTED PACKAGE BEGIN
CREATE OR REPLACE PACKAGE sled_security_pkg AUTHID DEFINER AS
    PROCEDURE set_user_context(p_username IN VARCHAR2);
    PROCEDURE clear_user_context;
END sled_security_pkg;
/

CREATE OR REPLACE PACKAGE BODY sled_security_pkg AS
    PROCEDURE clear_user_context IS
    BEGIN
        DBMS_SESSION.CLEAR_CONTEXT('SLED_APP_CTX', NULL);
    END clear_user_context;

    PROCEDURE set_user_context(p_username IN VARCHAR2) IS
        v_username     app_users.username%TYPE;
        v_role         app_users.role%TYPE;
        v_region       app_users.region%TYPE;
        v_scope        app_users.access_scope%TYPE;
        v_region_code  VARCHAR2(30);
    BEGIN
        clear_user_context;

        IF p_username IS NULL
           OR NOT REGEXP_LIKE(TRIM(p_username), '^[A-Za-z0-9_.-]{1,100}$') THEN
            RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive SLED application user');
        END IF;

        BEGIN
            SELECT username, LOWER(role), region, UPPER(access_scope)
            INTO   v_username, v_role, v_region, v_scope
            FROM   app_users
            WHERE  username = TRIM(p_username)
              AND  is_active = 1;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE_APPLICATION_ERROR(-20080, 'Unknown or inactive SLED application user');
            WHEN TOO_MANY_ROWS THEN
                RAISE_APPLICATION_ERROR(-20081, 'Invalid SLED application user configuration');
        END;

        IF v_scope = 'GLOBAL'
           AND v_role IN ('admin', 'analyst')
           AND v_region IS NULL THEN
            v_region_code := NULL;
        ELSIF v_scope = 'REGIONAL'
              AND v_role = 'fulfillment_mgr' THEN
            v_region_code := CASE UPPER(TRIM(v_region))
                WHEN 'FRONT RANGE' THEN 'FRONT_RANGE'
                WHEN 'FRONT_RANGE' THEN 'FRONT_RANGE'
                WHEN 'WESTERN SLOPE' THEN 'WESTERN_SLOPE'
                WHEN 'WESTERN_SLOPE' THEN 'WESTERN_SLOPE'
                WHEN 'SOUTHERN COLORADO' THEN 'SOUTHERN_COLORADO'
                WHEN 'SOUTHERN_COLORADO' THEN 'SOUTHERN_COLORADO'
                ELSE NULL
            END;
            IF v_region_code IS NULL THEN
                RAISE_APPLICATION_ERROR(-20081, 'Invalid SLED regional user configuration');
            END IF;
        ELSIF v_scope = 'RESTRICTED'
              AND (v_role = 'viewer' OR v_role = 'merchandiser')
              AND v_region IS NULL THEN
            v_region_code := NULL;
        ELSE
            RAISE_APPLICATION_ERROR(-20081, 'Invalid SLED application user configuration');
        END IF;

        DBMS_SESSION.SET_CONTEXT('SLED_APP_CTX', 'USERNAME', v_username);
        DBMS_SESSION.SET_CONTEXT('SLED_APP_CTX', 'ROLE', v_role);
        DBMS_SESSION.SET_CONTEXT('SLED_APP_CTX', 'REGION', v_region_code);
        DBMS_SESSION.SET_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE', v_scope);
        DBMS_SESSION.SET_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED', 'Y');
    EXCEPTION
        WHEN OTHERS THEN
            clear_user_context;
            RAISE;
    END set_user_context;
END sled_security_pkg;
/
-- SECTION 2A: TRUSTED PACKAGE END

-- SECTION 2B: VPD POLICIES BEGIN
CREATE OR REPLACE TRIGGER trg_agent_actions_sled_region
BEFORE INSERT OR UPDATE ON agent_actions
FOR EACH ROW
BEGIN
    IF SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE') = 'REGIONAL' THEN
        :NEW.service_region_code := SYS_CONTEXT('SLED_APP_CTX', 'REGION');
    ELSE
        -- Global operational/audit events are intentionally global-only. Never
        -- trust a caller-supplied regional value for these unkeyed log tables.
        :NEW.service_region_code := NULL;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_event_stream_sled_region
BEFORE INSERT OR UPDATE ON event_stream
FOR EACH ROW
BEGIN
    IF SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED') = 'Y'
       AND SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE') = 'REGIONAL' THEN
        :NEW.service_region_code := SYS_CONTEXT('SLED_APP_CTX', 'REGION');
    ELSE
        :NEW.service_region_code := NULL;
    END IF;
END;
/

CREATE OR REPLACE FUNCTION vpd_sled_regional (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
    v_authenticated VARCHAR2(1);
    v_role          VARCHAR2(30);
    v_scope         VARCHAR2(20);
    v_region        VARCHAR2(30);
BEGIN
    v_authenticated := SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED');
    v_role := LOWER(SYS_CONTEXT('SLED_APP_CTX', 'ROLE'));
    v_scope := LOWER(SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE'));
    v_region := UPPER(SYS_CONTEXT('SLED_APP_CTX', 'REGION'));

    IF v_authenticated <> 'Y' THEN
        RETURN '1 = 0';
    END IF;

    IF v_scope = 'global'
       AND v_role IN ('admin', 'analyst')
       AND v_region IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_scope = 'regional'
       AND v_role = 'fulfillment_mgr'
       AND v_region IN ('FRONT_RANGE', 'WESTERN_SLOPE', 'SOUTHERN_COLORADO') THEN
        RETURN 'service_region_code = SYS_CONTEXT(''SLED_APP_CTX'', ''REGION'')';
    END IF;

    RETURN '1 = 0';
END;
/

CREATE OR REPLACE FUNCTION vpd_sled_global_only (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
    v_authenticated VARCHAR2(1);
    v_role          VARCHAR2(30);
    v_scope         VARCHAR2(20);
    v_region        VARCHAR2(30);
BEGIN
    v_authenticated := SYS_CONTEXT('SLED_APP_CTX', 'AUTHENTICATED');
    v_role := LOWER(SYS_CONTEXT('SLED_APP_CTX', 'ROLE'));
    v_scope := LOWER(SYS_CONTEXT('SLED_APP_CTX', 'ACCESS_SCOPE'));
    v_region := SYS_CONTEXT('SLED_APP_CTX', 'REGION');

    IF v_authenticated <> 'Y' THEN
        RETURN '1 = 0';
    END IF;

    IF v_scope = 'global'
       AND v_role IN ('admin', 'analyst')
       AND v_region IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN '1 = 0';
END;
/

-- DBMS_RLS.ALTER_POLICY only changes context-attribute associations; it cannot
-- safely change the policy function, statement types, update check, or policy
-- type. This temporary deny-all function protects an object while a malformed
-- canonical policy is replaced. It is removed after all 25 policies verify.
CREATE OR REPLACE FUNCTION sled_vpd_install_guard (
    p_schema IN VARCHAR2,
    p_table  IN VARCHAR2
) RETURN VARCHAR2
AUTHID DEFINER
AS
BEGIN
    RETURN '1 = 0';
END;
/

DECLARE
    l_objects SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'FULFILLMENT_CENTERS', 'INVENTORY', 'CUSTOMERS', 'ORDERS', 'ORDER_ITEMS',
        'SHIPMENTS', 'FULFILLMENT_ZONES', 'DEMAND_REGIONS', 'DEMAND_FORECASTS',
        'AGENT_ACTIONS', 'EVENT_STREAM', 'INFLUENCERS', 'SOCIAL_POSTS',
        'INFLUENCER_CONNECTIONS', 'BRAND_INFLUENCER_LINKS', 'POST_PRODUCT_MENTIONS',
        'POST_EMBEDDINGS', 'SEMANTIC_MATCHES', 'OML_CUSTOMER_SEGMENTS', 'OML_CAPACITY_ALERTS',
        'OML_MODEL_RUNS', 'OML_DEMAND_SCORES', 'OML_COMMITMENT_FORECASTS',
        'OML_PRODUCT_CLUSTERS', 'OML_MODEL_REFRESH_LOG'
    );
    l_policy_names SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'VPD_SLED_FC', 'VPD_SLED_INVENTORY', 'VPD_SLED_CUSTOMERS', 'VPD_SLED_ORDERS',
        'VPD_SLED_ORDER_ITEMS', 'VPD_SLED_SHIPMENTS', 'VPD_SLED_ZONES',
        'VPD_SLED_DEMAND_REGIONS', 'VPD_SLED_FORECASTS', 'VPD_SLED_AGENT_ACTIONS',
        'VPD_SLED_EVENT_STREAM', 'VPD_SLED_INFLUENCERS', 'VPD_SLED_SOCIAL_POSTS',
        'VPD_SLED_CONNECTIONS', 'VPD_SLED_BRAND_LINKS', 'VPD_SLED_MENTIONS',
        'VPD_SLED_POST_EMBEDS', 'VPD_SLED_MATCHES', 'VPD_SLED_SEGMENTS',
        'VPD_SLED_CAPACITY', 'VPD_SLED_MODEL_RUNS', 'VPD_SLED_DEMAND_SCORES',
        'VPD_SLED_COMMITMENTS', 'VPD_SLED_PRODUCT_CLUSTERS', 'VPD_SLED_REFRESH_LOG'
    );
    l_functions SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_REGIONAL', 'VPD_SLED_REGIONAL',
        'VPD_SLED_GLOBAL_ONLY', 'VPD_SLED_GLOBAL_ONLY', 'VPD_SLED_GLOBAL_ONLY',
        'VPD_SLED_GLOBAL_ONLY', 'VPD_SLED_GLOBAL_ONLY'
    );
    v_table_count    PLS_INTEGER;
    v_function_count PLS_INTEGER;
    v_policy_count   PLS_INTEGER;
    v_existing_count PLS_INTEGER;
    v_valid_count    PLS_INTEGER;
    v_add_required   BOOLEAN;

    PROCEDURE ensure_install_guard(p_object_name VARCHAR2) IS
        v_guard_count PLS_INTEGER;
        v_guard_valid PLS_INTEGER;
    BEGIN
        SELECT COUNT(*)
        INTO   v_guard_count
        FROM   user_policies
        WHERE  object_name = p_object_name
          AND  policy_name = 'VPD_SLED_INSTALL_GUARD';

        IF v_guard_count = 0 THEN
            DBMS_RLS.ADD_POLICY(
                object_schema   => USER,
                object_name     => p_object_name,
                policy_name     => 'VPD_SLED_INSTALL_GUARD',
                function_schema => USER,
                policy_function => 'SLED_VPD_INSTALL_GUARD',
                statement_types => 'SELECT,INSERT,UPDATE,DELETE',
                update_check    => TRUE,
                policy_type     => DBMS_RLS.STATIC,
                enable          => TRUE
            );
        ELSE
            SELECT COUNT(*)
            INTO   v_guard_valid
            FROM   user_policies
            WHERE  object_name = p_object_name
              AND  policy_name = 'VPD_SLED_INSTALL_GUARD'
              AND  "FUNCTION" = 'SLED_VPD_INSTALL_GUARD'
              AND  policy_type = 'STATIC'
              AND  enable = 'YES'
              AND  sel = 'YES'
              AND  ins = 'YES'
              AND  upd = 'YES'
              AND  del = 'YES'
              AND  chk_option = 'YES';

            IF v_guard_valid <> 1 THEN
                RAISE_APPLICATION_ERROR(
                    -20085,
                    'Existing SLED install guard is not safely fail-closed'
                );
            END IF;
        END IF;
    END;
BEGIN
    -- Preflight every dependency before removing a working legacy policy.
    SELECT COUNT(*)
    INTO   v_table_count
    FROM   user_tables
    WHERE  table_name IN (SELECT column_value FROM TABLE(l_objects));

    IF v_table_count <> l_objects.COUNT THEN
        RAISE_APPLICATION_ERROR(
            -20082,
            'SLED VPD preflight failed: one or more protected tables are missing'
        );
    END IF;

    SELECT COUNT(*)
    INTO   v_function_count
    FROM   user_objects
    WHERE  object_name IN (
               'VPD_SLED_REGIONAL',
               'VPD_SLED_GLOBAL_ONLY',
               'SLED_VPD_INSTALL_GUARD'
           )
      AND  object_type = 'FUNCTION'
      AND  status = 'VALID';

    IF v_function_count <> 3 THEN
        RAISE_APPLICATION_ERROR(
            -20083,
            'SLED VPD preflight failed: policy or install-guard functions are not VALID'
        );
    END IF;

    FOR i IN 1 .. l_objects.COUNT LOOP
        SELECT COUNT(*)
        INTO   v_existing_count
        FROM   user_policies
        WHERE  object_name = l_objects(i)
          AND  policy_name = l_policy_names(i);

        SELECT COUNT(*)
        INTO   v_valid_count
        FROM   user_policies
        WHERE  object_name = l_objects(i)
          AND  policy_name = l_policy_names(i)
          AND  "FUNCTION" = l_functions(i)
          AND  policy_type = 'CONTEXT_SENSITIVE'
          AND  enable = 'YES'
          AND  sel = 'YES'
          AND  ins = 'YES'
          AND  upd = 'YES'
          AND  del = 'YES'
          AND  chk_option = 'YES';

        v_add_required := FALSE;
        IF v_existing_count = 0 THEN
            -- Add canonical protection before touching any legacy policy.
            v_add_required := TRUE;
        ELSIF v_valid_count <> 1 THEN
            -- ALTER_POLICY cannot change the required security attributes.
            -- Install a deny-all guard before replacing malformed canonical DDL.
            ensure_install_guard(l_objects(i));
            DBMS_RLS.DROP_POLICY(USER, l_objects(i), l_policy_names(i));
            v_add_required := TRUE;
        END IF;

        IF v_add_required THEN
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
        END IF;
    END LOOP;

    -- Verify all canonical policies before removing any legacy/guard policy.
    SELECT COUNT(*)
    INTO   v_policy_count
    FROM   user_policies
    WHERE  object_name IN (SELECT column_value FROM TABLE(l_objects))
      AND  policy_type = 'CONTEXT_SENSITIVE'
      AND  enable = 'YES'
      AND  sel = 'YES'
      AND  ins = 'YES'
      AND  upd = 'YES'
      AND  del = 'YES'
      AND  chk_option = 'YES'
      AND  "FUNCTION" IN ('VPD_SLED_REGIONAL', 'VPD_SLED_GLOBAL_ONLY');

    IF v_policy_count <> l_objects.COUNT THEN
        RAISE_APPLICATION_ERROR(
            -20084,
            'SLED VPD installation verification failed; legacy objects retained'
        );
    END IF;

    -- Canonical protection is now complete. Remove noncanonical policies one
    -- object at a time; the verified canonical policy remains enabled.
    FOR i IN 1 .. l_objects.COUNT LOOP
        FOR policy_row IN (
            SELECT policy_name
            FROM   user_policies
            WHERE  object_name = l_objects(i)
              AND  policy_name <> l_policy_names(i)
        ) LOOP
            DBMS_RLS.DROP_POLICY(USER, l_objects(i), policy_row.policy_name);
        END LOOP;
    END LOOP;

    SELECT COUNT(*)
    INTO   v_policy_count
    FROM   user_policies
    WHERE  object_name IN (SELECT column_value FROM TABLE(l_objects));

    IF v_policy_count <> l_objects.COUNT THEN
        RAISE_APPLICATION_ERROR(
            -20086,
            'SLED VPD cleanup verification failed; canonical protection retained'
        );
    END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'DROP FUNCTION SLED_VPD_INSTALL_GUARD';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE <> -4043 THEN RAISE; END IF;
END;
/

-- Retire package-global security only after every protected table points to
-- one of the context-only functions above.
DECLARE
    PROCEDURE drop_legacy_function(p_ddl VARCHAR2) IS
    BEGIN
        EXECUTE IMMEDIATE p_ddl;
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE <> -4043 THEN RAISE; END IF;
    END;
BEGIN
    drop_legacy_function('DROP FUNCTION VPD_FULFILLMENT_REGION');
    drop_legacy_function('DROP FUNCTION VPD_ORDERS_REGION');
    drop_legacy_function('DROP FUNCTION VPD_GRAPH_INFLUENCERS');
    drop_legacy_function('DROP FUNCTION VPD_GRAPH_SOCIAL_POSTS');
    drop_legacy_function('DROP FUNCTION VPD_GRAPH_CONNECTIONS');
    drop_legacy_function('DROP FUNCTION VPD_GRAPH_BRAND_LINKS');
    drop_legacy_function('DROP FUNCTION VPD_GRAPH_MENTIONS');

    BEGIN
        EXECUTE IMMEDIATE 'DROP PACKAGE SC_SECURITY_CTX';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLCODE <> -4043 THEN RAISE; END IF;
    END;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE AUDIT POLICY sc_order_audit
            ACTIONS UPDATE ON orders,
                    DELETE ON orders,
                    INSERT ON agent_actions
            WHEN 'SYS_CONTEXT(''USERENV'', ''SESSION_USER'') != ''ADMIN'''
            EVALUATE PER SESSION
    ]';
EXCEPTION
    WHEN OTHERS THEN
        IF SQLCODE <> -46358 THEN RAISE; END IF;
END;
/

COMMIT;
-- SECTION 2B: VPD POLICIES END
