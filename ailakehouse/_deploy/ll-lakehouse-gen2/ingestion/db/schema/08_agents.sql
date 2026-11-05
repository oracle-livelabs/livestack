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
 *   - App-driven Select AI profile setup has created the active DBMS_CLOUD_AI profile
 *   - Tables from 01_tables.sql through 06_security.sql already exist
 *   - Sample data loaded
 */

SET SERVEROUTPUT ON

-- ============================================================
-- STEP 0: TABLE & COLUMN COMMENTS FOR SELECT AI
-- Select AI reads these to understand your schema.
-- Good comments = smarter agent queries.
-- ============================================================

COMMENT ON TABLE brands IS 'Retail brands and partners in the PeakGear sporting goods network. Includes brand or partner name, category, headquarters location, revenue, and relationship tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official brand or partner name (e.g. PeakGear Core, SummitTrail Outfitters)';
COMMENT ON COLUMN brands.social_tier IS 'Brand or Partner relationship tier retained in the original column: emerging, standard, premium, or luxury; luxury marks strategic brands and partners in this PeakGear sporting goods demo';

COMMENT ON TABLE products IS 'Products available for customer order. Each sporting goods product belongs to a brand or partner and has a category, price, and tags.';
COMMENT ON COLUMN products.product_name IS 'Full sporting goods product name (e.g. SummitStride Trail Runner, ZeroCopy Hydration Vest)';
COMMENT ON COLUMN products.category IS 'Product category: Retail Sporting Goods, Assortment Planning, Outdoor Performance, Risk Services, E-Commerce, etc.';
COMMENT ON COLUMN products.unit_price IS 'Contract unit price in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the sporting goods product';

COMMENT ON TABLE fulfillment_centers IS 'Store and operations sites that fulfill B2B sporting goods orders. Each has lat/lon location, capacity, and type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Type: warehouse, distribution, micro, drop_ship, or store';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity levels of each sporting goods product at each store fulfillment site. Tracks on-hand, reserved, and reorder thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available inventory units at this center';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending orders, not yet routed';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, replenishment is needed';

COMMENT ON TABLE customers IS 'B2B customers with shipping addresses and account tier. Has lat/lon for spatial store service routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Customer tier: new, standard, preferred, or vip';
COMMENT ON COLUMN customers.lifetime_value IS 'Total revenue from this customer in US dollars';

COMMENT ON TABLE orders IS 'B2B sporting goods orders with status tracking. May link to a market or market signal that influenced allocation. Assigned to a store fulfillment site.';
COMMENT ON COLUMN orders.order_status IS 'Status: pending, confirmed, processing, routed, completed, cancelled, or returned';
COMMENT ON COLUMN orders.order_total IS 'Total order value in US dollars';
COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the post_id that drove the order or allocation. NULL means direct demand.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Line items within an order. Each links to a sporting goods product with quantity and price.';

COMMENT ON TABLE influencers IS 'Market, operations, and market signal sources. Includes reach counts, engagement rates, and computed source influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Signal source handle like @safety_signal_01 or @store_signal_01';
COMMENT ON COLUMN influencers.platform IS 'Source channel: instagram, tiktok, twitter, youtube, or threads. In this demo these labels represent feed types.';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on source reach and engagement';
COMMENT ON COLUMN influencers.follower_count IS 'Source reach count retained in the original follower_count column';
COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Market and operations signals, product safety notices, assortment planning updates, and market signals mentioning sporting goods products or brands and partners. Has reach metrics, sentiment, and criticality score.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the returns audit or market signal';
COMMENT ON COLUMN social_posts.virality_score IS 'Criticality score 0-100 combining urgency, reach, and amplification';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Signal intensity: normal, rising, viral, or mega_viral where viral means elevated and mega_viral means critical';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Signal sentiment from -1.0 (negative demand risk) to 1.0 (positive availability)';
COMMENT ON COLUMN social_posts.likes_count IS 'Acknowledgement count from subscribed teams';
COMMENT ON COLUMN social_posts.shares_count IS 'Forward or escalation count';
COMMENT ON COLUMN social_posts.views_count IS 'Total signal reach count';

COMMENT ON TABLE post_product_mentions IS 'Links retail demand and market signals to sporting goods products they mention. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted demand for sporting goods products factoring in retail demand and market signals. social_factor > 1 means signal activity is amplifying demand or allocation risk.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this sporting goods product/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Transfer records for customer and partner orders. Tracks carrier, distance, cost, and completion status.';
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
        profile_name    => 'PG_COHERE_PROFILE',
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

@@08_agent_tool_functions.sql

-- ============================================================
-- STEP 3: CREATE SELECT AI AGENT TOOLS
-- Two types: "SQL" (agent writes the query itself) and
-- "function" (agent calls a PL/SQL function you wrote).
-- ============================================================

-- Tool 1: SQL tool for demand and market signal queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "PG_COHERE_PROFILE"}}',
        description => 'Query SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for market and operations signals, sporting goods product signals, source activity, brand or partner momentum, and reach metrics. Key columns: virality_score as criticality score, momentum_flag (normal/rising/viral/mega_viral), sentiment_score, likes_count, shares_count, views_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for customer order and fulfillment queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'COMMERCE_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "PG_COHERE_PROFILE"}}',
        description => 'Query ORDERS, ORDER_ITEMS, CUSTOMERS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, DEMAND_FORECASTS tables. Use for customer order lookups, revenue, inventory levels, transaction routing status, customer info, and demand predictions. order_status: pending/confirmed/processing/routed/completed/cancelled/returned. social_source_id NOT NULL means signal-influenced order.'
    );
END;
/

-- Tool 3: Function - critical sporting goods product signal detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect critical sporting goods products from retail demand and market signals. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum criticality score. Returns sporting goods product names, brands and partners, signal counts, criticality, reach counts, and peak intensity.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent signal records to find sporting goods products with elevated or critical intensity'
    );
END;
/

-- Tool 4: Function - inventory checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check inventory levels for a sporting goods product across all store fulfillment sites. Parameter: P_PRODUCT_NAME (partial name match, e.g. SummitStride Trail Runner or ZeroCopy Hydration Vest). Returns site name, location, quantity on hand, reserved, capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity levels for a sporting goods product at all active store fulfillment sites'
    );
END;
/

-- Tool 5: Function - spatial fulfillment routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best store service site to ship a sporting goods product to a customer using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial match). Returns top 3 nearest sites with distance in miles, estimated delivery hours, capacity levels.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find nearest eligible store fulfillment site with capacity for a customer. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - signal source network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'INFLUENCER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore signal source network connections and brand or partner relationships from graph data. Parameter: P_HANDLE (exact handle like @safety_signal_01). Returns source profile, connected sources with connection type and strength, brand or partner relationships with attributed revenue.",
                        "function": "get_influencer_network"}',
        description => 'Explores signal source connections and brand or partner relationships from graph data'
    );
END;
/

-- Tool 7: Function — audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for returns audit. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (sporting goods product/order/inventory), P_REASONING (explanation). Always call this after making a recommendation.",
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

-- Market Signal Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'TREND_AGENT',
        attributes  => '{"profile_name": "PG_COHERE_PROFILE",
                        "role": "You are a demand and market signal analyst for a PeakGear sporting goods platform. Your job is to detect emerging sporting goods product risks from market and operations signals, product safety updates, market notices, and brand or partner signals, and explain WHY they are critical: which sources, which channels, what reach patterns. Use TREND_SQL_TOOL to query signal records, sources, and product mentions. Use DETECT_TRENDS_TOOL for quick signal summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes sporting goods product signals'
    );
END;
/

-- Inventory & Fulfillment Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "PG_COHERE_PROFILE",
                        "role": "You are a PeakGear sporting goods operations optimizer for a governed PeakGear sporting goods platform. Check inventory levels, find the best eligible store fulfillment sites for orders using spatial routing, and identify capacity shortages for critical sporting goods products. Use CHECK_INVENTORY_TOOL for capacity levels, FULFILLMENT_ROUTE_TOOL for optimal shipping routes, COMMERCE_SQL_TOOL for orders and shipments. When inventory is low for a critical sporting goods product, recommend pre-positioning or allocation. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes sporting goods product inventory and store service routing'
    );
END;
/

-- Commerce Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'COMMERCE_AGENT',
        attributes  => '{"profile_name": "PG_COHERE_PROFILE",
                        "role": "You are a customer order intelligence analyst for a PeakGear sporting goods platform. Analyze orders, revenue, customer behavior, and the impact of market or market signals on orders. Use COMMERCE_SQL_TOOL to query orders, customers, and revenue. Orders where social_source_id IS NOT NULL are signal-driven. Provide revenue breakdowns, order trends, and customer insights with specific numbers. Do not guess - always query."}',
        description => 'Analyzes customer and partner orders, revenue, and signal impact'
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
        attributes  => '{"instruction": "Analyze retail demand and market signals for the PeakGear sporting goods platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently critical sporting goods products. 2) Use TREND_SQL_TOOL to query viral and mega_viral signal records in the last 48 hours. 3) Identify which sources and channels are driving the signals. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific sporting goods product names, criticality scores, reach counts, and source handles. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "INFLUENCER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive signal analysis combining market data and product mentions'
    );
END;
/

-- Fulfillment Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize fulfillment and inventory for the governed PeakGear sporting goods platform. Steps: 1) Check inventory using CHECK_INVENTORY_TOOL for requested sporting goods products. 2) If a customer and sporting goods product are specified, find the best store service route using FULFILLMENT_ROUTE_TOOL. 3) Use COMMERCE_SQL_TOOL to check pending orders and shipment status. 4) Flag sporting goods products where capacity is below reorder point. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Inventory checks and spatial fulfillment routing'
    );
END;
/

-- Commerce Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'COMMERCE_TASK',
        attributes  => '{"instruction": "Analyze customer order data for the PeakGear sporting goods platform. Use COMMERCE_SQL_TOOL to query orders, revenue, customers, and shipments. When analyzing signal impact, look for orders where social_source_id IS NOT NULL. Provide revenue totals, order counts, customer segments, and signal attribution metrics. Do not guess - always query the data first. User query: {query}",
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

-- Market Signal Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'SOCIAL_TREND_TEAM',
        attributes  => '{"agents": [{"name": "TREND_AGENT", "task": "TREND_ANALYSIS_TASK"}],
                        "process": "sequential"}',
        description => 'Demand and market signal analysis team'
    );
END;
/

-- Fulfillment Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Product inventory and store service routing team'
    );
END;
/

-- Commerce Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'COMMERCE_TEAM',
        attributes  => '{"agents": [{"name": "COMMERCE_AGENT", "task": "COMMERCE_TASK"}],
                        "process": "sequential"}',
        description => 'customer order and revenue analytics team'
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
SELECT AI AGENT What sporting goods products are critical right now based on retail demand and market signals;
SELECT AI AGENT Which signal sources are driving the most critical bulletins this week;
SELECT AI AGENT Show me the top 5 sporting goods products with mega_viral signal intensity;

-- Fulfillment
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check inventory levels for SummitStride Trail Runner across all store and DC sites;
SELECT AI AGENT What is the best store fulfillment site to ship ZeroCopy Hydration Vest to a customer in Miami;
SELECT AI AGENT Which critical sporting goods products have low inventory;

-- B2B Order Intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('COMMERCE_TEAM');
SELECT AI AGENT How many orders were placed in the last 24 hours and what is the total revenue;
SELECT AI AGENT What percentage of recent orders were driven by demand signals;
SELECT AI AGENT Show me revenue breakdown by sporting goods product category for the last 30 days;

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
