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
 *   - Select AI profiles from 07_ai_profile.sql already created on ADB
 *   - Tables from 01_tables.sql through 06_security.sql already exist
 *   - Sample data loaded
 */

SET SERVEROUTPUT ON

-- ============================================================
-- STEP 0: TABLE & COLUMN COMMENTS FOR SELECT AI
-- Select AI reads these to understand your schema.
-- Good comments = smarter agent queries.
-- ============================================================

COMMENT ON TABLE brands IS 'Product brands sold on the social commerce platform. Includes brand name, brand_category, headquarters location, revenue, and social media tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official brand name (e.g. UrbanPulse, TechNova)';
COMMENT ON COLUMN brands.social_tier IS 'Brand social media tier: emerging, standard, premium, or luxury';

COMMENT ON TABLE products IS 'Products available for sale. Each product belongs to a brand and has a category, price, and tags.';
COMMENT ON COLUMN products.product_name IS 'Full product name (e.g. Neon Grid Hoodie, AirBud Elite TWS)';
COMMENT ON COLUMN products.category IS 'Product category: Fashion, Electronics, Beauty, Fitness, Audio, Outdoor, etc.';
COMMENT ON COLUMN products.unit_price IS 'Retail price in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the product';

COMMENT ON TABLE fulfillment_centers IS 'Warehouses and distribution centers that ship orders. Each has lat/lon location, capacity, and type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Type: warehouse, distribution, micro, drop_ship, or store';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Stock levels of each product at each fulfillment center. Tracks on-hand, reserved, and reorder thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available inventory units at this center';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending orders, not yet shipped';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, restock is needed';

COMMENT ON TABLE customers IS 'Retail customers with shipping addresses and loyalty tier. Has lat/lon for spatial fulfillment routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Loyalty tier: new, standard, preferred, or vip';
COMMENT ON COLUMN customers.lifetime_value IS 'Total revenue from this customer in US dollars';

COMMENT ON TABLE orders IS 'Customer orders with status tracking. May link to a social post that influenced the purchase. Assigned to a fulfillment center.';
COMMENT ON COLUMN orders.order_status IS 'Status: pending, confirmed, processing, shipped, delivered, cancelled, or returned';
COMMENT ON COLUMN orders.order_total IS 'Total order value in US dollars';
COMMENT ON COLUMN orders.social_source_id IS 'If social-influenced, the post_id that drove the purchase. NULL means organic.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Line items within an order. Each links to a product with quantity and price.';

COMMENT ON TABLE influencers IS 'Social media influencers. Includes follower counts, engagement rates, and computed influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Social media handle like @fashionista_sarah';
COMMENT ON COLUMN influencers.platform IS 'Platform: instagram, tiktok, twitter, youtube, or threads';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on reach and engagement';
COMMENT ON COLUMN influencers.follower_count IS 'Number of followers on the platform';
COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Social media posts mentioning products or brands. Has engagement metrics, sentiment, virality score.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the social media post';
COMMENT ON COLUMN social_posts.virality_score IS 'Virality score 0-100 combining engagement velocity and amplification';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Momentum: normal, rising, viral, or mega_viral';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Sentiment from -1.0 (negative) to 1.0 (positive)';
COMMENT ON COLUMN social_posts.likes_count IS 'Number of likes or hearts';
COMMENT ON COLUMN social_posts.shares_count IS 'Number of shares or reposts';
COMMENT ON COLUMN social_posts.views_count IS 'Total view count';

COMMENT ON TABLE post_product_mentions IS 'Links social posts to products they mention. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted demand for products factoring in social momentum. social_factor > 1 means social buzz is amplifying demand.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this product/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Social multiplier. 1.0 = no social effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Shipment records for orders. Tracks carrier, distance, cost, delivery status.';
COMMENT ON COLUMN shipments.distance_km IS 'Shipping distance in kilometers';
COMMENT ON COLUMN shipments.estimated_hours IS 'Estimated delivery time in hours';

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
            {"owner": "' || USER || '", "name": "CUSTOMERS"},
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

-- ── Detect trending products from social momentum ───────────
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
                    rec.mention_count || ' mentions, virality ' || rec.avg_virality ||
                    ', ' || rec.total_views || ' views, momentum: ' || rec.peak_momentum || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No trending products found in the last ' || p_hours || ' hours with virality >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' trending products (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- ── Check inventory for a product across all centers ────────
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
                    ELSE 'OK' END AS stock_status
        FROM inventory i
        JOIN fulfillment_centers fc ON i.center_id = fc.center_id
        JOIN products p ON i.product_id = p.product_id
        WHERE UPPER(p.product_name) LIKE '%' || UPPER(p_product_name) || '%'
          AND fc.is_active = 1
        ORDER BY i.quantity_on_hand DESC
    ) LOOP
        v_result := v_result || rec.center_name || ' (' || rec.city || ', ' || rec.state_province || '): ' ||
                    rec.quantity_on_hand || ' on hand, ' || rec.quantity_reserved || ' reserved [' || rec.stock_status || ']' || CHR(10);
        v_total := v_total + rec.quantity_on_hand;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No inventory found for product matching: ' || p_product_name;
    END IF;
    RETURN 'Inventory for "' || p_product_name || '" across ' || v_count || ' centers (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- ── Spatial routing: nearest center with stock for a customer ─
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
                    rec.distance_mi || ' mi, ~' || rec.est_hours || ' hrs, ' || rec.quantity_on_hand || ' in stock' || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No fulfillment center found with stock for "' || p_product_name || '" near customer "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' fulfillment options:' || CHR(10) || v_result;
END;
/

-- ── Explore influencer network and brand relationships ──────
CREATE OR REPLACE FUNCTION get_influencer_network(
    p_handle VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_info   VARCHAR2(500);
BEGIN
    BEGIN
        SELECT 'Influencer: ' || display_name || ' (' || handle || ') - ' ||
               platform || ', ' || follower_count || ' followers, score ' || influence_score ||
               ', niche: ' || niche
        INTO v_info
        FROM influencers WHERE handle = p_handle;
        v_result := v_info || CHR(10) || CHR(10);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN 'Influencer not found: ' || p_handle;
    END;

    v_result := v_result || 'Connected influencers:' || CHR(10);
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
                    ', ' || rec.follower_count || ' followers) - ' || rec.connection_type ||
                    ' [strength ' || rec.strength || ']' || CHR(10);
    END LOOP;

    v_result := v_result || CHR(10) || 'Brand relationships:' || CHR(10);
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
                    ') - ' || rec.post_count || ' posts, $' || rec.revenue || ' attributed' || CHR(10);
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

-- Tool 1: SQL tool for social/trend queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for viral posts, trending products, influencer activity, social momentum, engagement metrics. Key columns: virality_score, momentum_flag (normal/rising/viral/mega_viral), sentiment_score, likes_count, shares_count, views_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for commerce/fulfillment queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'COMMERCE_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query ORDERS, ORDER_ITEMS, CUSTOMERS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, DEMAND_FORECASTS tables. Use for order lookups, revenue, inventory levels, shipping status, customer info, demand predictions. order_status: pending/confirmed/processing/shipped/delivered/cancelled/returned. social_source_id NOT NULL means social-influenced order.'
    );
END;
/

-- Tool 3: Function — trending products detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect trending products from social media momentum. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum virality score. Returns product names, brands, mention counts, virality, view counts, peak momentum.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent social posts to find products with viral or rising momentum'
    );
END;
/

-- Tool 4: Function — inventory checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check inventory levels for a product across all fulfillment centers. Parameter: P_PRODUCT_NAME (partial name match, e.g. Neon Grid or AirBud). Returns center name, location, quantity on hand, reserved, stock status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks stock levels for a product at all active fulfillment centers'
    );
END;
/

-- Tool 5: Function — spatial fulfillment routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best fulfillment center to ship a product to a customer using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial match). Returns top 3 nearest centers with distance in miles, estimated delivery hours, stock levels.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find nearest fulfillment center with stock for a customer. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function — influencer network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'INFLUENCER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore an influencer network connections and brand relationships from graph data. Parameter: P_HANDLE (exact handle like @fashion_sarah). Returns influencer profile, connected influencers with connection type and strength, brand promotion relationships with attributed revenue.",
                        "function": "get_influencer_network"}',
        description => 'Explores influencer connections and brand relationships from graph data'
    );
END;
/

-- Tool 7: Function — audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for compliance. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (product/order/inventory), P_REASONING (explanation). Always call this after making a recommendation.",
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

-- Trend Detection Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'TREND_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a social media trend analyst for a retail commerce platform. Your job is to detect emerging product trends from social media data, identify which products are going viral, and explain WHY they are trending — which influencers, which platforms, what engagement patterns. Use TREND_SQL_TOOL to query social posts, influencers, and product mentions. Use DETECT_TRENDS_TOOL for quick trend summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes social media product trends'
    );
END;
/

-- Inventory & Fulfillment Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a supply chain and fulfillment optimizer for a retail commerce platform. Check inventory levels, find the best fulfillment centers for orders using spatial routing, and identify stock shortages for trending products. Use CHECK_INVENTORY_TOOL for stock levels, FULFILLMENT_ROUTE_TOOL for optimal shipping routes, COMMERCE_SQL_TOOL for orders and shipments. When inventory is low for a trending product, recommend pre-positioning. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes inventory and fulfillment routing'
    );
END;
/

-- Commerce Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'COMMERCE_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a commerce intelligence analyst for a retail platform. Analyze orders, revenue, customer behavior, and the impact of social media on sales. Use COMMERCE_SQL_TOOL to query orders, customers, revenue. Orders where social_source_id IS NOT NULL are social-driven. Provide revenue breakdowns, order trends, customer insights with specific numbers. Do not guess — always query."}',
        description => 'Analyzes orders, revenue, and social commerce impact'
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
        attributes  => '{"instruction": "Analyze social media trends and product momentum for the retail platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently trending products. 2) Use TREND_SQL_TOOL to query viral and mega_viral social posts in the last 48 hours. 3) Identify which influencers and platforms are driving the trends. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific product names, virality scores, view counts, and influencer handles. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "INFLUENCER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive trend analysis combining social data and product mentions'
    );
END;
/

-- Fulfillment Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize fulfillment and inventory for the retail platform. Steps: 1) Check inventory using CHECK_INVENTORY_TOOL for requested products. 2) If a customer and product are specified, find the best fulfillment route using FULFILLMENT_ROUTE_TOOL. 3) Use COMMERCE_SQL_TOOL to check pending orders and shipment status. 4) Flag products where stock is below reorder point. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Inventory checks and spatial fulfillment routing'
    );
END;
/

-- Commerce Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'COMMERCE_TASK',
        attributes  => '{"instruction": "Analyze commerce data for the retail platform. Use COMMERCE_SQL_TOOL to query orders, revenue, customers, and shipments. When analyzing social impact, look for orders where social_source_id IS NOT NULL. Provide revenue totals, order counts, customer segments, and social attribution metrics. Do not guess — always query the data first. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Order, revenue, and customer analytics'
    );
END;
/

PROMPT Select AI Agent tasks created: 3

-- ============================================================
-- STEP 6: CREATE TEAMS
-- SET_TEAM activates a team for your session.
-- Then use SELECT AI AGENT <your question> to talk to it.
-- ============================================================

-- Trend Detection Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'SOCIAL_TREND_TEAM',
        attributes  => '{"agents": [{"name": "TREND_AGENT", "task": "TREND_ANALYSIS_TASK"}],
                        "process": "sequential"}',
        description => 'Social trend detection and analysis team'
    );
END;
/

-- Fulfillment Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Inventory and fulfillment routing team'
    );
END;
/

-- Commerce Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'COMMERCE_TEAM',
        attributes  => '{"agents": [{"name": "COMMERCE_AGENT", "task": "COMMERCE_TASK"}],
                        "process": "sequential"}',
        description => 'Order and revenue analytics team'
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
-- ── Trend Detection ─────────────────────────────────────────
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('SOCIAL_TREND_TEAM');
SELECT AI AGENT What products are trending right now based on social media activity;
SELECT AI AGENT Which influencers are driving the most viral posts this week;
SELECT AI AGENT Show me the top 5 products with mega_viral momentum;

-- ── Fulfillment ─────────────────────────────────────────────
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check inventory levels for the Neon Grid Hoodie across all warehouses;
SELECT AI AGENT What is the best fulfillment center to ship AirBud Elite earbuds to a customer in Miami;
SELECT AI AGENT Which trending products have critically low inventory;

-- ── Commerce Intelligence ───────────────────────────────────
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('COMMERCE_TEAM');
SELECT AI AGENT How many orders were placed in the last 24 hours and what is the total revenue;
SELECT AI AGENT What percentage of recent orders were driven by social media;
SELECT AI AGENT Show me revenue breakdown by product category for the last 30 days;

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
