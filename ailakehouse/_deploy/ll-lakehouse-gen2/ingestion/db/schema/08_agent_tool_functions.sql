-- PG analysis functions and Select AI Agent tools. Run after the core data load.
SET SERVEROUTPUT ON

-- Detect critical sporting goods products from retail demand and market signals
CREATE OR REPLACE FUNCTION detect_trending_products(
    p_hours     NUMBER DEFAULT 48,
    p_min_score NUMBER DEFAULT 50
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_count  NUMBER := 0;
BEGIN
    FOR rec IN (
        SELECT p.product_name, b.brand_name, p.category,
               COUNT(DISTINCT sp.post_id) AS mention_count,
               ROUND(AVG(sp.virality_score), 1) AS avg_virality,
               SUM(sp.views_count) AS total_views,
               MAX(sp.momentum_flag) AS peak_momentum
        FROM post_product_mentions ppm
        JOIN social_posts sp ON ppm.post_id = sp.post_id
        JOIN products p ON ppm.product_id = p.product_id
        JOIN brands b ON p.brand_id = b.brand_id
        WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - NUMTODSINTERVAL(p_hours, 'HOUR')
          AND sp.virality_score >= p_min_score
        GROUP BY p.product_name, b.brand_name, p.category
        ORDER BY avg_virality DESC
        FETCH FIRST 10 ROWS ONLY
    ) LOOP
        v_result := v_result || rec.product_name || ' (' || rec.brand_name || ') - ' ||
                    rec.mention_count || ' signals, criticality ' || rec.avg_virality ||
                    ', ' || rec.total_views || ' reach, intensity: ' || rec.peak_momentum || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No critical sporting goods product signals found in the last ' || p_hours || ' hours with criticality >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' critical sporting goods products (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- Check inventory for a sporting goods product across all sites
CREATE OR REPLACE FUNCTION check_product_inventory(
    p_product_name VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_count  NUMBER := 0;
    v_total  NUMBER := 0;
BEGIN
    -- A missing product name otherwise matches every inventory row and overflows the VARCHAR2 return value.
    IF TRIM(p_product_name) IS NULL THEN
        RETURN 'A product name is required for this tool. Use COMMERCE_SQL_TOOL for a general inventory overview.';
    END IF;
    FOR rec IN (
        SELECT fc.center_name, fc.city, fc.state_province,
               i.quantity_on_hand, i.quantity_reserved, i.reorder_point,
               CASE WHEN i.quantity_on_hand <= i.reorder_point * 0.5 THEN 'CRITICAL'
                    WHEN i.quantity_on_hand <= i.reorder_point THEN 'LOW'
                    ELSE 'OK' END AS capacity_status
        FROM inventory i
        JOIN fulfillment_centers fc ON i.center_id = fc.center_id
        JOIN products p ON i.product_id = p.product_id
        WHERE UPPER(p.product_name) LIKE '%' || UPPER(p_product_name) || '%'
          AND fc.is_active = 1
        ORDER BY i.quantity_on_hand DESC
    ) LOOP
        v_result := v_result || rec.center_name || ' (' || rec.city || ', ' || rec.state_province || '): ' ||
                    rec.quantity_on_hand || ' on hand, ' || rec.quantity_reserved || ' reserved [' || rec.capacity_status || ']' || CHR(10);
        v_total := v_total + rec.quantity_on_hand;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No inventory found for product matching: ' || p_product_name;
    END IF;
    RETURN 'Inventory for "' || p_product_name || '" across ' || v_count || ' sites (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest eligible site with capacity for a customer
CREATE OR REPLACE FUNCTION find_best_fulfillment(
    p_customer_email VARCHAR2,
    p_product_name   VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_count  NUMBER := 0;
BEGIN
    FOR rec IN (
        SELECT fc.center_name, fc.city, fc.state_province,
               i.quantity_on_hand,
               ROUND(SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE'), 1) AS distance_mi,
               ROUND(SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE') / 50, 1) AS est_hours
        FROM customers c
        CROSS JOIN fulfillment_centers fc
        JOIN inventory i ON fc.center_id = i.center_id
        JOIN products p ON i.product_id = p.product_id
        WHERE c.email LIKE '%' || p_customer_email || '%'
          AND UPPER(p.product_name) LIKE '%' || UPPER(p_product_name) || '%'
          AND fc.is_active = 1
          AND i.quantity_on_hand > i.quantity_reserved
        ORDER BY SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE')
        FETCH FIRST 3 ROWS ONLY
    ) LOOP
        v_result := v_result || rec.center_name || ' (' || rec.city || ', ' || rec.state_province || '): ' ||
                    rec.distance_mi || ' mi, ~' || rec.est_hours || ' hrs, ' || rec.quantity_on_hand || ' available' || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No store fulfillment site found with capacity for "' || p_product_name || '" near customer "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' store service options:' || CHR(10) || v_result;
END;
/

-- Explore signal-source network and brand or partner relationships
CREATE OR REPLACE FUNCTION get_influencer_network(
    p_handle VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_info   VARCHAR2(500);
BEGIN
    BEGIN
        SELECT 'Signal source: ' || display_name || ' (' || handle || ') - ' ||
               platform || ', ' || follower_count || ' reach, score ' || influence_score ||
               ', niche: ' || niche
        INTO v_info
        FROM influencers WHERE handle = p_handle;
        v_result := v_info || CHR(10) || CHR(10);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN 'Signal source not found: ' || p_handle;
    END;

    v_result := v_result || 'Connected signal sources:' || CHR(10);
    FOR rec IN (
        SELECT i2.handle, i2.influence_score, i2.follower_count,
               ic.connection_type, ic.strength
        FROM influencer_connections ic
        JOIN influencers i1 ON ic.from_influencer = i1.influencer_id
        JOIN influencers i2 ON ic.to_influencer = i2.influencer_id
        WHERE i1.handle = p_handle
        ORDER BY ic.strength DESC
        FETCH FIRST 10 ROWS ONLY
    ) LOOP
        v_result := v_result || '  ' || rec.handle || ' (score ' || rec.influence_score ||
                    ', ' || rec.follower_count || ' reach) - ' || rec.connection_type ||
                    ' [strength ' || rec.strength || ']' || CHR(10);
    END LOOP;

    v_result := v_result || CHR(10) || 'Brand or Partner relationships:' || CHR(10);
    FOR rec IN (
        SELECT b.brand_name, bil.relationship_type, bil.post_count,
               ROUND(bil.revenue_attributed, 0) AS revenue
        FROM brand_influencer_links bil
        JOIN brands b ON bil.brand_id = b.brand_id
        JOIN influencers i ON bil.influencer_id = i.influencer_id
        WHERE i.handle = p_handle
        ORDER BY bil.revenue_attributed DESC
        FETCH FIRST 5 ROWS ONLY
    ) LOOP
        v_result := v_result || '  ' || rec.brand_name || ' (' || rec.relationship_type ||
                    ') - ' || rec.post_count || ' signals, $' || rec.revenue || ' attributed' || CHR(10);
    END LOOP;

    RETURN v_result;
END;
/

-- ── Log agent decisions to the audit trail ──────────────────
CREATE OR REPLACE FUNCTION log_agent_decision(
    p_agent_name   VARCHAR2,
    p_action_type  VARCHAR2,
    p_entity_type  VARCHAR2,
    p_reasoning    VARCHAR2
) RETURN VARCHAR2 AS
    PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
    INSERT INTO agent_actions (
        agent_name, action_type, entity_type,
        decision_payload, confidence, execution_status, executed_at
    ) VALUES (
        p_agent_name, p_action_type, p_entity_type,
        p_reasoning, 0.90, 'completed', SYSTIMESTAMP
    );
    COMMIT;
    RETURN 'Decision logged: ' || p_action_type || ' by ' || p_agent_name;
END;
/

-- The Retail Operations team uses structured, bounded results. Both functions
-- read the PG schema through the caller's VPD context.
CREATE OR REPLACE FUNCTION get_demand_opportunity RETURN CLOB AS
    v_result CLOB;
BEGIN
    SELECT JSON_OBJECT(
             'status' VALUE 'found',
             'product_id' VALUE product_id,
             'product_name' VALUE product_name,
             'brand_name' VALUE brand_name,
             'category' VALUE category,
             'signal_count' VALUE signal_count,
             'average_score' VALUE average_score,
             'total_reach' VALUE total_reach
             RETURNING CLOB)
      INTO v_result
      FROM (
        SELECT p.product_id, p.product_name, b.brand_name, p.category,
               COUNT(DISTINCT sp.post_id) AS signal_count,
               ROUND(AVG(sp.virality_score), 1) AS average_score,
               NVL(SUM(sp.views_count), 0) AS total_reach
          FROM post_product_mentions ppm
          JOIN social_posts sp ON sp.post_id = ppm.post_id
          JOIN products p ON p.product_id = ppm.product_id
          JOIN brands b ON b.brand_id = p.brand_id
         WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '48' HOUR
           AND sp.virality_score >= 50
         GROUP BY p.product_id, p.product_name, b.brand_name, p.category
         ORDER BY average_score DESC, signal_count DESC, p.product_id
         FETCH FIRST 1 ROW ONLY
      );
    RETURN v_result;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN '{"status":"no_signal"}';
END;
/

CREATE OR REPLACE FUNCTION assess_product_stock(p_product_id NUMBER) RETURN CLOB AS
    v_product_name products.product_name%TYPE;
    v_site_count NUMBER;
    v_on_hand NUMBER;
    v_reserved NUMBER;
    v_low_sites NUMBER;
    v_constrained_site fulfillment_centers.center_name%TYPE;
    v_result CLOB;
BEGIN
    IF p_product_id IS NULL THEN
        RETURN '{"status":"invalid_product_id"}';
    END IF;

    SELECT product_name INTO v_product_name
      FROM products WHERE product_id = p_product_id;

    SELECT COUNT(*), NVL(SUM(i.quantity_on_hand), 0),
           NVL(SUM(i.quantity_reserved), 0),
           NVL(SUM(CASE WHEN i.quantity_on_hand - i.quantity_reserved <= i.reorder_point THEN 1 ELSE 0 END), 0)
      INTO v_site_count, v_on_hand, v_reserved, v_low_sites
      FROM inventory i
      JOIN fulfillment_centers fc ON fc.center_id = i.center_id
     WHERE i.product_id = p_product_id AND fc.is_active = 1;

    BEGIN
        SELECT center_name INTO v_constrained_site
          FROM (
            SELECT fc.center_name
              FROM inventory i
              JOIN fulfillment_centers fc ON fc.center_id = i.center_id
             WHERE i.product_id = p_product_id AND fc.is_active = 1
             ORDER BY i.quantity_on_hand - i.quantity_reserved ASC, fc.center_name
          )
         WHERE ROWNUM = 1;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN v_constrained_site := NULL;
    END;

    SELECT JSON_OBJECT(
             'status' VALUE 'found',
             'product_id' VALUE p_product_id,
             'product_name' VALUE v_product_name,
             'active_sites' VALUE v_site_count,
             'on_hand_units' VALUE v_on_hand,
             'reserved_units' VALUE v_reserved,
             'available_units' VALUE v_on_hand - v_reserved,
             'low_stock_sites' VALUE v_low_sites,
             'most_constrained_site' VALUE v_constrained_site
             RETURNING CLOB)
      INTO v_result FROM dual;
    RETURN v_result;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN '{"status":"product_not_found"}';
END;
/

PROMPT PL/SQL tool functions created.
