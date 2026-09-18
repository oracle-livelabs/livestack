/*
 * Fail-closed, context-sensitive Hospitality VPD policies.
 * Run as the application schema owner after HOSPITALITY_APP_CTX exists.
 */

CREATE OR REPLACE FUNCTION hospitality_vpd_centers(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_region VARCHAR2(100) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION');
  v_scope  VARCHAR2(20)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
    RETURN 'state_province = SYS_CONTEXT(''HOSPITALITY_APP_CTX'', ''REGION'')';
  END IF;
  RETURN '1=0';
END hospitality_vpd_centers;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_center_child(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_region VARCHAR2(100) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION');
  v_scope  VARCHAR2(20)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
    RETURN 'center_id IN (SELECT center_id FROM fulfillment_centers)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_center_child;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_orders(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_region VARCHAR2(100) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION');
  v_scope  VARCHAR2(20)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
    RETURN 'fulfillment_center_id IN (SELECT center_id FROM fulfillment_centers)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_orders;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_order_items(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope  VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'order_id IN (SELECT order_id FROM orders)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_order_items;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_guests(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope  VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'guest_id IN (SELECT guest_id FROM orders)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_guests;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_influencers(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role   VARCHAR2(30)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_region VARCHAR2(100) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION');
  v_scope  VARCHAR2(20)  := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
    RETURN 'region = SYS_CONTEXT(''HOSPITALITY_APP_CTX'', ''REGION'')';
  END IF;
  RETURN '1=0';
END hospitality_vpd_influencers;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_social_posts(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'influencer_id IN (SELECT influencer_id FROM influencers)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_social_posts;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_connections(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN '(from_influencer IN (SELECT influencer_id FROM influencers) '
      || 'OR to_influencer IN (SELECT influencer_id FROM influencers))';
  END IF;
  RETURN '1=0';
END hospitality_vpd_connections;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_influencer_child(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'influencer_id IN (SELECT influencer_id FROM influencers)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_influencer_child;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_mentions(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'post_id IN (SELECT post_id FROM social_posts)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_mentions;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_demand_regions(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'EXISTS (SELECT 1 FROM fulfillment_centers fc '
      || 'WHERE SDO_RELATE(boundary, fc.location, ''mask=ANYINTERACT'') = ''TRUE'')';
  END IF;
  RETURN '1=0';
END hospitality_vpd_demand_regions;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_demand_forecasts(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'region IN (SELECT region_name FROM demand_regions)';
  END IF;
  RETURN '1=0';
END hospitality_vpd_demand_forecasts;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_agent_actions(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN q'[entity_type = 'financial_validation_exception'
      AND entity_id IN (SELECT exception_id FROM hotel_financial_validation_results)]';
  END IF;
  RETURN '1=0';
END hospitality_vpd_agent_actions;
/

CREATE OR REPLACE FUNCTION hospitality_vpd_brands(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AS
  v_role  VARCHAR2(30) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE');
  v_scope VARCHAR2(20) := SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE');
BEGIN
  IF SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') != 'Y' THEN
    RETURN '1=0';
  END IF;
  IF v_scope = 'GLOBAL' AND v_role IN ('admin', 'analyst', 'merchandiser') THEN
    RETURN NULL;
  END IF;
  -- The restricted viewer may browse non-operational property catalog metadata.
  IF v_scope = 'RESTRICTED' AND v_role = 'viewer' THEN
    RETURN NULL;
  END IF;
  IF v_scope = 'REGION' AND v_role = 'fulfillment_mgr'
     AND SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') IS NOT NULL THEN
    RETURN 'brand_id IN (
      SELECT pom.property_id
        FROM hotel_property_owner_map pom
        JOIN hotel_owner_entities oe ON oe.owner_id = pom.owner_id
       WHERE oe.region = SYS_CONTEXT(''HOSPITALITY_APP_CTX'', ''REGION''))';
  END IF;
  RETURN '1=0';
END hospitality_vpd_brands;
/

DECLARE
  PROCEDURE replace_policy(
    p_object_name     IN VARCHAR2,
    p_policy_name     IN VARCHAR2,
    p_policy_function IN VARCHAR2,
    p_statement_types IN VARCHAR2 DEFAULT 'SELECT',
    p_update_check    IN BOOLEAN DEFAULT FALSE
  ) IS
  BEGIN
    FOR existing_policy IN (
      SELECT policy_name
        FROM user_policies
       WHERE object_name = UPPER(p_object_name)
         AND (policy_name LIKE 'VPD_%' OR policy_name LIKE 'HOSP_VPD_%')
    ) LOOP
      DBMS_RLS.DROP_POLICY(USER, UPPER(p_object_name), existing_policy.policy_name);
    END LOOP;

    DBMS_RLS.ADD_POLICY(
      object_schema   => USER,
      object_name     => UPPER(p_object_name),
      policy_name     => UPPER(p_policy_name),
      function_schema => USER,
      policy_function => UPPER(p_policy_function),
      statement_types => p_statement_types,
      update_check    => p_update_check,
      enable          => TRUE,
      policy_type     => DBMS_RLS.CONTEXT_SENSITIVE
    );
  END replace_policy;
BEGIN
  replace_policy('FULFILLMENT_CENTERS', 'HOSP_VPD_CENTERS', 'HOSPITALITY_VPD_CENTERS', 'SELECT,UPDATE', TRUE);
  replace_policy('INVENTORY', 'HOSP_VPD_INVENTORY', 'HOSPITALITY_VPD_CENTER_CHILD', 'SELECT,UPDATE', TRUE);
  replace_policy('FULFILLMENT_ZONES', 'HOSP_VPD_ZONES', 'HOSPITALITY_VPD_CENTER_CHILD');
  replace_policy('SHIPMENTS', 'HOSP_VPD_SHIPMENTS', 'HOSPITALITY_VPD_CENTER_CHILD', 'SELECT,INSERT,UPDATE', TRUE);
  replace_policy('GUESTS', 'HOSP_VPD_GUESTS', 'HOSPITALITY_VPD_GUESTS');
  replace_policy('ORDERS', 'HOSP_VPD_ORDERS', 'HOSPITALITY_VPD_ORDERS', 'SELECT,UPDATE', TRUE);
  replace_policy('ORDER_ITEMS', 'HOSP_VPD_ORDER_ITEMS', 'HOSPITALITY_VPD_ORDER_ITEMS');
  replace_policy('INFLUENCERS', 'HOSP_VPD_INFLUENCERS', 'HOSPITALITY_VPD_INFLUENCERS');
  replace_policy('SOCIAL_POSTS', 'HOSP_VPD_SOCIAL_POSTS', 'HOSPITALITY_VPD_SOCIAL_POSTS');
  replace_policy('INFLUENCER_CONNECTIONS', 'HOSP_VPD_CONNECTIONS', 'HOSPITALITY_VPD_CONNECTIONS');
  replace_policy('BRAND_INFLUENCER_LINKS', 'HOSP_VPD_BRAND_LINKS', 'HOSPITALITY_VPD_INFLUENCER_CHILD');
  replace_policy('POST_PRODUCT_MENTIONS', 'HOSP_VPD_MENTIONS', 'HOSPITALITY_VPD_MENTIONS');
  replace_policy('DEMAND_REGIONS', 'HOSP_VPD_DEMAND_REGIONS', 'HOSPITALITY_VPD_DEMAND_REGIONS');
  replace_policy('DEMAND_FORECASTS', 'HOSP_VPD_DEMAND_FORECASTS', 'HOSPITALITY_VPD_DEMAND_FORECASTS', 'SELECT,INSERT,UPDATE', TRUE);
  replace_policy('AGENT_ACTIONS', 'HOSP_VPD_AGENT_ACTIONS', 'HOSPITALITY_VPD_AGENT_ACTIONS');
  replace_policy('BRANDS', 'HOSP_VPD_BRANDS', 'HOSPITALITY_VPD_BRANDS');
END;
/

DECLARE
  v_policy_count NUMBER;
BEGIN
  SELECT COUNT(DISTINCT policy_name)
    INTO v_policy_count
    FROM audit_unified_policies
   WHERE policy_name = 'SC_ORDER_AUDIT';

  IF v_policy_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE AUDIT POLICY sc_order_audit
        ACTIONS UPDATE ON orders,
                DELETE ON orders,
                INSERT ON agent_actions
        WHEN 'SYS_CONTEXT(''USERENV'', ''SESSION_USER'') != ''ADMIN'''
        EVALUATE PER SESSION
    ]';
  END IF;
END;
/

COMMIT;

SELECT 'Hospitality context-sensitive VPD policies created.' AS status FROM dual;
