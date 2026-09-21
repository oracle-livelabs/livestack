/*
 * 07_agents.sql
 * Select AI Agent Orchestration — Oracle 26ai DBMS_CLOUD_AI_AGENT
 *
 * Replaces custom PL/SQL agent packages with the native Select AI Agent
 * framework. Components:
 *   TOOL   → a specific capability (SQL query or PL/SQL function)
 *   AGENT  → an AI personality with a role
 *   TASK   → instructions that tell the agent what to do + which tools
 *   TEAM   → brings agents and tasks together so you can run them
 *
 * Prerequisites:
 *   - Select AI profiles from 07_ai_profile.sql already created on Oracle AI Database 26ai
 *   - Tables from 01_tables.sql through 06_security.sql already exist
 *   - Sample data loaded
 */

SET SERVEROUTPUT ON

-- ============================================================
-- STEP 0: TABLE & COLUMN COMMENTS FOR SELECT AI
-- Select AI reads these to understand your schema.
-- Good comments = smarter agent queries.
-- ============================================================

COMMENT ON TABLE brands IS 'Hospitality properties in the Harborstone network. Includes property name, category, headquarters location, revenue, and relationship tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official property name (e.g. Grand Harbor Hotel, Canyon Reserve Canyon Reserve)';
COMMENT ON COLUMN brands.social_tier IS 'Property relationship tier retained in the original column: emerging, standard, premium, or luxury; luxury marks strategic properties in this hospitality demo';

COMMENT ON TABLE products IS 'Hospitality products available for guest reservation. Each hospitality product belongs to a property and has a category, price, and tags.';
COMMENT ON COLUMN products.product_name IS 'Full hospitality product name (e.g. Premium King Room, Revenue Manager Portal)';
COMMENT ON COLUMN products.category IS 'Hospitality Product category: Urban Hotel, Revenue Operations, Luxury Guest Management, Guest Operational Risk Services, Payments, etc.';
COMMENT ON COLUMN products.unit_price IS 'Contract unit price in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the hospitality product';

COMMENT ON TABLE fulfillment_centers IS 'Harborstone property hotels that fulfill hospitality service requests. Each has lat/lon location, capacity, and hotel category.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Hotel category: Full-Service Hotel, Convention Hotel, Select-Service Hotel, Resort Property, Extended-Stay Hotel, or Partner Property';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity levels of each hospitality product at each property hotel. Tracks on-hand, reserved, and reorder thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available capacity units at this property hotel';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending orders, not yet routed';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, replenishment is needed';

COMMENT ON TABLE guests IS 'B2B guests with shipping addresses and account tier. Has lat/lon for spatial property service routing.';
COMMENT ON COLUMN guests.guest_tier IS 'Guest tier: new, standard, preferred, or vip';
COMMENT ON COLUMN guests.lifetime_value IS 'Total revenue from this guest in US dollars';

COMMENT ON TABLE orders IS 'B2B hospitality orders with status tracking. May link to a brand standards or demand signal that influenced allocation. Assigned to a property hotel.';
COMMENT ON COLUMN orders.order_status IS 'Status: pending, confirmed, processing, routed, completed, cancelled, or returned';
COMMENT ON COLUMN orders.order_total IS 'Total order value in US dollars';
COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the post_id that drove the order or allocation. NULL means direct reservation activity.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed service-pressure urgency score 0-100';

COMMENT ON TABLE order_items IS 'Line items within an order. Each links to a hospitality product with quantity and price.';

COMMENT ON TABLE influencers IS 'Brand Standards, operations, and demand signal sources. Includes monitored exposure counts, escalation rates, and computed source authority scores.';
COMMENT ON COLUMN influencers.handle IS 'Internal stable signal source code. User-facing source names are stored in display_name.';
COMMENT ON COLUMN influencers.platform IS 'Source channel: instagram, tiktok, twitter, youtube, or threads. In this demo these labels represent feed types.';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on source exposure and escalation activity';
COMMENT ON COLUMN influencers.follower_count IS 'Monitored exposure count retained in the original follower_count column';
COMMENT ON COLUMN influencers.engagement_rate IS 'Escalation activity rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Brand Standards bulletins, Brand Standards notices, operations alerts, and demand signals linked to hospitality products or properties. Has exposure metrics, sentiment, and risk severity score.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the brand standards or demand signal';
COMMENT ON COLUMN social_posts.virality_score IS 'Operational Risk severity score 0-100 combining urgency, exposure, and amplification';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Signal intensity: normal, rising, viral, or mega_viral where viral means elevated and mega_viral means critical';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Signal sentiment from -1.0 (negative market risk) to 1.0 (positive availability)';
COMMENT ON COLUMN social_posts.likes_count IS 'Acknowledgement count from subscribed teams';
COMMENT ON COLUMN social_posts.shares_count IS 'advance-booking or escalation count';
COMMENT ON COLUMN social_posts.views_count IS 'Total monitored exposure count';

COMMENT ON TABLE post_product_mentions IS 'Links hospitality risk and demand signals to associated hospitality products. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag (Monitoring feed), visual, or inferred (AI classified)';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted service pressure for hospitality products factoring in hospitality risk and demand signals. social_factor > 1 means signal activity is amplifying operational or allocation risk.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted service pressure units for this hospitality product/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal service pressure';

COMMENT ON TABLE shipments IS 'Transfer records for guest reservations. Tracks carrier, distance, cost, and completion status.';
COMMENT ON COLUMN shipments.distance_km IS 'Service route distance in kilometers';
COMMENT ON COLUMN shipments.estimated_hours IS 'Estimated service completion time in hours';

COMMENT ON TABLE agent_actions IS 'Audit log of all AI agent decisions. Stores agent name, action type, reasoning, confidence.';
COMMENT ON COLUMN agent_actions.decision_payload IS 'JSON with agent reasoning, factors, and outcome';
COMMENT ON COLUMN agent_actions.execution_status IS 'Status: proposed, approved, executing, completed, failed, or rolled_back';

COMMIT;
PROMPT Table and column comments added for Select AI.

-- ============================================================
-- STEP 1: REGISTER TABLES WITH THE AI PROFILE
-- ============================================================

BEGIN
    DBMS_CLOUD_AI.SET_ATTRIBUTE(
        profile_name    => 'SC_COHERE_PROFILE',
        attribute_name  => 'object_list',
        attribute_value => '[
            {"owner": "' || USER || '", "name": "BRANDS"},
            {"owner": "' || USER || '", "name": "PRODUCTS"},
            {"owner": "' || USER || '", "name": "FULFILLMENT_CENTERS"},
            {"owner": "' || USER || '", "name": "INVENTORY"},
            {"owner": "' || USER || '", "name": "GUESTS"},
            {"owner": "' || USER || '", "name": "ORDERS"},
            {"owner": "' || USER || '", "name": "ORDER_ITEMS"},
            {"owner": "' || USER || '", "name": "INFLUENCERS"},
            {"owner": "' || USER || '", "name": "SOCIAL_POSTS"},
            {"owner": "' || USER || '", "name": "POST_PRODUCT_MENTIONS"},
            {"owner": "' || USER || '", "name": "DEMAND_FORECASTS"},
            {"owner": "' || USER || '", "name": "SHIPMENTS"},
            {"owner": "' || USER || '", "name": "AGENT_ACTIONS"}
        ]'
    );
END;
/

PROMPT AI profile object_list updated with all tables.

-- ============================================================
-- STEP 2: CREATE PL/SQL FUNCTIONS THAT BECOME AGENT TOOLS
-- Each function does one focused job. The agent decides when to call them.
-- ============================================================

-- Detect critical hospitality products from hospitality risk and demand signals
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
        WHERE sp.posted_at >= SYSTIMESTAMP - NUMTODSINTERVAL(p_hours, 'HOUR')
          AND sp.virality_score >= p_min_score
        GROUP BY p.product_name, b.brand_name, p.category
        ORDER BY avg_virality DESC
        FETCH FIRST 10 ROWS ONLY
    ) LOOP
        v_result := v_result || rec.product_name || ' (' || rec.brand_name || ') - ' ||
                    rec.mention_count || ' signals, risk severity ' || rec.avg_virality ||
                    ', ' || rec.total_views || ' exposure, severity: ' || rec.peak_momentum || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No critical hospitality product signals found in the last ' || p_hours || ' hours with risk severity >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' critical hospitality products (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- Check inventory for a hospitality product across all sites
CREATE OR REPLACE FUNCTION check_product_inventory(
    p_product_name VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_count  NUMBER := 0;
    v_total  NUMBER := 0;
BEGIN
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
        RETURN 'No inventory found for hospitality product matching: ' || p_product_name;
    END IF;
    RETURN 'Inventory for "' || p_product_name || '" across ' || v_count || ' sites (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest compliant site with capacity for a guest
CREATE OR REPLACE FUNCTION find_best_fulfillment(
    p_guest_email VARCHAR2,
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
        FROM guests c
        CROSS JOIN fulfillment_centers fc
        JOIN inventory i ON fc.center_id = i.center_id
        JOIN products p ON i.product_id = p.product_id
        WHERE c.email LIKE '%' || p_guest_email || '%'
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
        RETURN 'No property hotel found with capacity for "' || p_product_name || '" near guest "' || p_guest_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' property service options:' || CHR(10) || v_result;
END;
/

-- Explore signal-source network and property relationships
CREATE OR REPLACE FUNCTION get_influencer_network(
    p_source_name VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_info   VARCHAR2(500);
    v_source_id NUMBER;
BEGIN
    BEGIN
        SELECT influencer_id,
               'Signal source: ' || display_name || ' - ' ||
               platform || ', ' || follower_count || ' monitored exposure, score ' || influence_score ||
               ', niche: ' || niche
        INTO v_source_id, v_info
        FROM influencers
        WHERE UPPER(display_name) = UPPER(p_source_name)
           OR handle = p_source_name
        FETCH FIRST 1 ROW ONLY;
        v_result := v_info || CHR(10) || CHR(10);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN 'Signal source not found: ' || p_source_name;
    END;

    v_result := v_result || 'Connected signal sources:' || CHR(10);
    FOR rec IN (
        SELECT i2.display_name, i2.influence_score, i2.follower_count,
               ic.connection_type, ic.strength
        FROM influencer_connections ic
        JOIN influencers i1 ON ic.from_influencer = i1.influencer_id
        JOIN influencers i2 ON ic.to_influencer = i2.influencer_id
        WHERE i1.influencer_id = v_source_id
        ORDER BY ic.strength DESC
        FETCH FIRST 10 ROWS ONLY
    ) LOOP
        v_result := v_result || '  ' || rec.display_name || ' (score ' || rec.influence_score ||
                    ', ' || rec.follower_count || ' monitored exposure) - ' || rec.connection_type ||
                    ' [strength ' || rec.strength || ']' || CHR(10);
    END LOOP;

    v_result := v_result || CHR(10) || 'Property relationships:' || CHR(10);
    FOR rec IN (
        SELECT b.brand_name, bil.relationship_type, bil.post_count,
               ROUND(bil.revenue_attributed, 0) AS revenue
        FROM brand_influencer_links bil
        JOIN brands b ON bil.brand_id = b.brand_id
        JOIN influencers i ON bil.influencer_id = i.influencer_id
        WHERE i.influencer_id = v_source_id
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

PROMPT PL/SQL tool functions created.

-- ============================================================
-- STEP 3: CREATE SELECT AI AGENT TOOLS
-- Two types: "SQL" (agent writes the query itself) and
-- "function" (agent calls a PL/SQL function you wrote).
-- ============================================================

-- Tool 1: SQL tool for brand standards and demand signal queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for brand standards bulletins, hospitality product signals, source activity, property severity, and exposure metrics. Key columns: virality_score as risk severity score, momentum_flag (normal/rising/viral/mega_viral; rising displays as Elevated, viral displays as Escalating), sentiment_score, likes_count, shares_count, views_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for guest reservation and fulfillment queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'COMMERCE_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query ORDERS, ORDER_ITEMS, GUESTS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, DEMAND_FORECASTS tables. Use for guest reservation lookups, revenue, inventory levels, reservation routing status, guest info, and demand predictions. order_status: pending/confirmed/processing/routed/completed/cancelled/returned. social_source_id NOT NULL means signal-influenced order.'
    );
END;
/

-- Tool 3: Function - critical hospitality product signal detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect critical hospitality products from hospitality risk and demand signals. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum risk severity score. Returns hospitality product names, properties, signal counts, risk severity, exposure counts, and peak severity.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent signal records to find hospitality products with elevated or critical intensity'
    );
END;
/

-- Tool 4: Function - inventory checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check inventory levels for a hospitality product across all property hotels. Parameter: P_PRODUCT_NAME (partial name match, e.g. Revenue Manager Portal or Premium King Room). Returns site name, location, quantity on hand, reserved, capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity levels for a hospitality product at all active property hotels'
    );
END;
/

-- Tool 5: Function - spatial fulfillment routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best property service site to ship a hospitality product to a guest using Oracle Spatial distance calculations. Parameters: P_guest_EMAIL (partial match), P_PRODUCT_NAME (partial match). Returns top 3 nearest sites with distance in miles, estimated delivery hours, capacity levels.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find nearest compliant property hotel with capacity for a guest. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - signal source network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'INFLUENCER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore signal source network connections and property relationships from graph data. Parameter: P_SOURCE_NAME (exact display name, for example Brand QA Monitoring Feed 01). Returns source profile, connected sources with connection type and strength, property relationships with attributed revenue.",
                        "function": "get_influencer_network"}',
        description => 'Explores signal source connections and property relationships from graph data'
    );
END;
/

-- Tool 7: Function — audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for brand standards. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (hospitality product/order/inventory), P_REASONING (explanation). Always call this after making a recommendation.",
                        "function": "log_agent_decision"}',
        description => 'Logs agent decisions and reasoning to the audit trail'
    );
END;
/

PROMPT Select AI Agent tools created: 7

-- ============================================================
-- STEP 4: CREATE AGENTS
-- The role attribute shapes personality and behavior.
-- ============================================================

-- Brand Standards Signal Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'TREND_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a brand standards and demand signal analyst for a hospitality platform. Your job is to detect emerging hospitality product risks from brand standards bulletins, Brand Standards updates, brand standards notices, and property signals, and explain WHY they are critical: which sources, which channels, what exposure patterns. Use TREND_SQL_TOOL to query signal records, sources, and hospitality product links. Use DETECT_TRENDS_TOOL for quick signal summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes hospitality product signals'
    );
END;
/

-- Inventory & Fulfillment Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a hospitality operations optimizer for a regulated hospitality platform. Check inventory levels, find the best compliant property hotels for orders using spatial routing, and identify capacity shortages for critical hospitality products. Use CHECK_INVENTORY_TOOL for capacity levels, FULFILLMENT_ROUTE_TOOL for optimal shipping routes, COMMERCE_SQL_TOOL for orders and shipments. When inventory is low for a critical hospitality product, recommend pre-positioning or allocation. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes hospitality product inventory and property service routing'
    );
END;
/

-- Commerce Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'COMMERCE_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a guest reservation intelligence analyst for a hospitality platform. Analyze orders, revenue, guest behavior, and the impact of brand standards or demand signals on orders. Use COMMERCE_SQL_TOOL to query orders, guests, and revenue. Orders where social_source_id IS NOT NULL are signal-driven. Provide revenue breakdowns, order trends, and guest insights with specific numbers. Do not guess - always query."}',
        description => 'Analyzes guest reservations, revenue, and signal impact'
    );
END;
/

PROMPT Select AI Agents created: 3

-- ============================================================
-- STEP 5: CREATE TASKS
-- Instructions + tool bindings. {query} is where the user question goes.
-- ============================================================

-- Trend Analysis Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'TREND_ANALYSIS_TASK',
        attributes  => '{"instruction": "Analyze hospitality risk and demand signals for the hospitality platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently critical hospitality products. 2) Use TREND_SQL_TOOL to query Escalating and Critical signal records in the last 48 hours. 3) Identify which sources and channels are driving the signals. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific hospitality product names, risk severity scores, exposure counts, and source names. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "INFLUENCER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive signal analysis combining brand standards data and hospitality product links'
    );
END;
/

-- Fulfillment Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize fulfillment and inventory for the regulated hospitality platform. Steps: 1) Check inventory using CHECK_INVENTORY_TOOL for requested hospitality products. 2) If a guest and hospitality product are specified, find the best property service route using FULFILLMENT_ROUTE_TOOL. 3) Use COMMERCE_SQL_TOOL to check pending orders and shipment status. 4) Flag hospitality products where capacity is below reorder point. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Inventory checks and spatial fulfillment routing'
    );
END;
/

-- Commerce Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'COMMERCE_TASK',
        attributes  => '{"instruction": "Analyze guest reservation data for the hospitality platform. Use COMMERCE_SQL_TOOL to query orders, revenue, guests, and shipments. When analyzing signal impact, look for orders where social_source_id IS NOT NULL. Provide revenue totals, order counts, guest segments, and signal attribution metrics. Do not guess - always query the data first. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Order, revenue, and guest analytics'
    );
END;
/

PROMPT Select AI Agent tasks created: 3

-- ============================================================
-- STEP 6: CREATE TEAMS
-- SET_TEAM activates a team for your session.
-- Then use SELECT AI AGENT <your question> to talk to it.
-- ============================================================

-- Brand Standards Signal Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'SOCIAL_TREND_TEAM',
        attributes  => '{"agents": [{"name": "TREND_AGENT", "task": "TREND_ANALYSIS_TASK"}],
                        "process": "sequential"}',
        description => 'Brand Standards and demand signal analysis team'
    );
END;
/

-- Fulfillment Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Hospitality Product inventory and property service routing team'
    );
END;
/

-- Commerce Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'COMMERCE_TEAM',
        attributes  => '{"agents": [{"name": "COMMERCE_AGENT", "task": "COMMERCE_TASK"}],
                        "process": "sequential"}',
        description => 'guest reservation and revenue analytics team'
    );
END;
/

PROMPT Select AI Agent teams created: 3

-- ============================================================
-- STEP 7: VERIFY EVERYTHING IS CREATED
-- All should show status ENABLED.
-- ============================================================

SELECT 'TOOLS' AS object_type, tool_name AS object_name, status FROM USER_AI_AGENT_TOOLS
UNION ALL
SELECT 'AGENTS', agent_name, status FROM USER_AI_AGENTS
UNION ALL
SELECT 'TASKS', task_name, status FROM USER_AI_AGENT_TASKS
UNION ALL
SELECT 'TEAMS', agent_team_name, status FROM USER_AI_AGENT_TEAMS
ORDER BY 1, 2;

PROMPT =====================================================
PROMPT Select AI Agent setup complete!
PROMPT 7 tools, 3 agents, 3 tasks, 3 teams
PROMPT =====================================================

-- ============================================================
-- EXAMPLE USAGE
-- Run from SQL Developer, Database Actions, or the app backend.
-- ============================================================

/*
-- Signal Detection
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('SOCIAL_TREND_TEAM');
SELECT AI AGENT What hospitality products are critical right now based on hospitality risk and demand signals;
SELECT AI AGENT Which signal sources are driving the most critical bulletins this week;
SELECT AI AGENT Show me the top 5 hospitality products with Critical signal severity;

-- Fulfillment
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check inventory levels for Premium King Room across all property service sites;
SELECT AI AGENT What is the best property hotel to ship Revenue Manager Portal to a guest in Miami;
SELECT AI AGENT Which critical hospitality products have low inventory;

-- B2B Order Intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('COMMERCE_TEAM');
SELECT AI AGENT How many orders were placed in the last 24 hours and what is the total revenue;
SELECT AI AGENT What percentage of recent orders were driven by brand standards signals;
SELECT AI AGENT Show me revenue breakdown by hospitality product category for the last 30 days;

-- ── See what the agents did behind the scenes ───────────────
SELECT tool_name, TO_CHAR(start_date, 'HH24:MI:SS') AS called_at,
       SUBSTR(output, 1, 80) AS result
FROM USER_AI_AGENT_TOOL_HISTORY
ORDER BY start_date DESC
FETCH FIRST 10 ROWS ONLY;

SELECT team_name, TO_CHAR(start_date, 'HH24:MI:SS') AS started, state
FROM USER_AI_AGENT_TEAM_HISTORY
ORDER BY start_date DESC
FETCH FIRST 5 ROWS ONLY;
*/

-- ============================================================
-- CLEANUP (run only to remove everything)
-- ============================================================
/*
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('SOCIAL_TREND_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('FULFILLMENT_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('COMMERCE_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('TREND_ANALYSIS_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('FULFILLMENT_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('COMMERCE_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('TREND_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('FULFILLMENT_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('COMMERCE_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('TREND_SQL_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('COMMERCE_SQL_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('DETECT_TRENDS_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('CHECK_INVENTORY_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('FULFILLMENT_ROUTE_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('INFLUENCER_NETWORK_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('LOG_DECISION_TOOL', TRUE);
DROP FUNCTION detect_trending_products;
DROP FUNCTION check_product_inventory;
DROP FUNCTION find_best_fulfillment;
DROP FUNCTION get_influencer_network;
DROP FUNCTION log_agent_decision;
*/
