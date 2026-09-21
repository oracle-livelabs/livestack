/*
 * 07_agents.sql
 * Select AI Agent Orchestration - Oracle 26ai DBMS_CLOUD_AI_AGENT
 *
 * Replaces custom PL/SQL agent packages with the native Select AI Agent
 * framework. Components:
 *   TOOL   -> a specific capability (SQL query or PL/SQL function)
 *   AGENT  -> an AI personality with a role
 *   TASK   -> instructions that tell the agent what to do + which tools
 *   TEAM   -> brings agents and tasks together so you can run them
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

COMMENT ON TABLE brands IS 'Media and Entertainment studios and labels and content lines in the content-intelligence platform. Includes program name, category, headquarters location, content revenue, and signal tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official studio or label name (e.g. Aurora Studios, StreamWave Network)';
COMMENT ON COLUMN brands.social_tier IS 'Studio or label signal tier: emerging, standard, premium, or premium-rights.';

COMMENT ON TABLE products IS 'Content assets, programs, capacity slots, and production supply items. Each service belongs to a studio or label and has a category, value proxy, and search tags.';
COMMENT ON COLUMN products.product_name IS 'Full content asset name (e.g. Midnight Harbor Premiere Window, Championship Highlights Rights)';
COMMENT ON COLUMN products.category IS 'Content asset category such as Film Discovery, Streaming Strategy, Fan Communities, Live Entertainment, Audience Activation, Streaming and Live Entertainment, Sports Media, or Production Supplies.';
COMMENT ON COLUMN products.unit_price IS 'Content revenue or cost proxy in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the content asset or capacity item';

COMMENT ON TABLE fulfillment_centers IS 'Distribution hubs and media operations desks used for spatial routing. Each has lat/lon location, capacity, and center type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Baseline center type values mapped to media hubs: warehouse, distribution, micro, drop_ship, or store.';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity or production supply levels for each content asset at each distribution hub. Tracks available, reserved, and reorder or escalation thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available capacity or supply units at this distribution hub';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending campaign orders, not yet completed';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand content releases below this, capacity intervention or replenishment is needed';

COMMENT ON TABLE customers IS 'Synthetic audience accounts with service addresses and risk tier. Has lat/lon for spatial distribution-hub routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Synthetic audience account access tier: new, standard, preferred, or vip baseline values.';
COMMENT ON COLUMN customers.lifetime_value IS 'Synthetic lifetime content revenue proxy in US dollars';

COMMENT ON TABLE orders IS 'Campaign orders with status tracking. May link to a audience/social signal that influenced demand. Assigned to a distribution hub.';
COMMENT ON COLUMN orders.order_status IS 'Baseline status values for campaign orders: pending, confirmed, processing, shipped/routed, delivered/completed, cancelled, or returned.';
COMMENT ON COLUMN orders.order_total IS 'Total campaign order content revenue proxy in US dollars';
COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the audience/social signal post_id associated with demand. NULL means organic or direct.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Requested services or supplies within a campaign order. Each links to a content asset with quantity and value proxy.';

COMMENT ON TABLE influencers IS 'Media and Entertainment creators and fan communities. Includes reach counts, engagement rates, and computed influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Creator or community voice handle such as @premiere_watchlist';
COMMENT ON COLUMN influencers.platform IS 'Platform: instagram, tiktok, twitter, youtube, or threads';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on community reach and engagement';
COMMENT ON COLUMN influencers.follower_count IS 'Number of followers on the platform';
COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Audience and community signal posts mentioning content assets or studios and labels. Has engagement metrics, sentiment, and urgency/virality score.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the audience/social signal post';
COMMENT ON COLUMN social_posts.virality_score IS 'Urgency score 0-100 combining engagement velocity, amplification, and content distribution relevance';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Momentum: normal, rising, viral, or mega_viral';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Sentiment from -1.0 (negative) to 1.0 (positive)';
COMMENT ON COLUMN social_posts.likes_count IS 'Number of likes or hearts';
COMMENT ON COLUMN social_posts.shares_count IS 'Number of shares or reposts';
COMMENT ON COLUMN social_posts.views_count IS 'Total view count';

COMMENT ON TABLE post_product_mentions IS 'Links audience/social signal posts to content assets they mention. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted audience demand for services factoring in audience/social signal momentum. social_factor > 1 means community signals are amplifying demand.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this content asset/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Audience/social signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Content routing and dispatch records for campaign orders. Tracks route team, distance, cost proxy, and completion status.';
COMMENT ON COLUMN shipments.distance_km IS 'Content routing distance in kilometers';
COMMENT ON COLUMN shipments.estimated_hours IS 'Estimated routing or completion time in hours';

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

-- -- Detect trending content assets from audience/social signal momentum
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
                    rec.mention_count || ' mentions, urgency ' || rec.avg_virality ||
                    ', ' || rec.total_views || ' views, momentum: ' || rec.peak_momentum || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No trending content assets found in the last ' || p_hours || ' hours with urgency score >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' trending content assets (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- -- Check capacity for a content asset across all distribution hubs
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
        RETURN 'No capacity or supply found for content asset matching: ' || p_product_name;
    END IF;
    RETURN 'Capacity for "' || p_product_name || '" across ' || v_count || ' centers (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest distribution hub with capacity for a synthetic audience account
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
        RETURN 'No distribution hub found with capacity for "' || p_product_name || '" near synthetic audience account "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' content routing options:' || CHR(10) || v_result;
END;
/

-- -- Explore media creator network and studio or label relationships
CREATE OR REPLACE FUNCTION get_influencer_network(
    p_handle VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_info   VARCHAR2(500);
BEGIN
    BEGIN
        SELECT 'Creator: ' || display_name || ' (' || handle || ') - ' ||
               platform || ', ' || follower_count || ' followers, score ' || influence_score ||
               ', niche: ' || niche
        INTO v_info
        FROM influencers WHERE handle = p_handle;
        v_result := v_info || CHR(10) || CHR(10);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN 'Creator not found: ' || p_handle;
    END;

    v_result := v_result || 'Connected media creators:' || CHR(10);
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

    v_result := v_result || CHR(10) || 'Studio or label relationships:' || CHR(10);
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
                    ') - ' || rec.post_count || ' signal posts, $' || rec.revenue || ' content revenue attributed' || CHR(10);
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

-- Tool 1: SQL tool for audience/social signal queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for audience/social signal posts, trending content assets, creator activity, signal momentum, and engagement metrics. Key columns: virality_score/urgency score, momentum_flag (normal/rising/viral/mega_viral), sentiment_score, likes_count, shares_count, views_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for content operations and access queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'COMMERCE_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query ORDERS, ORDER_ITEMS, CUSTOMERS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, DEMAND_FORECASTS tables. Use for campaign order lookups, content revenue, capacity levels, routing status, synthetic audience account info, and demand predictions. order_status uses baseline values pending/confirmed/processing/shipped/delivered/cancelled/returned. social_source_id NOT NULL means signal-influenced campaign order.'
    );
END;
/

-- Tool 3: Function - trending content assets detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect trending content assets from audience/social signal momentum. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum urgency score. Returns content asset names, studios and labels, mention counts, urgency, view counts, and peak momentum.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent audience/social signal posts to find content assets with rising or urgent momentum'
    );
END;
/

-- Tool 4: Function - capacity checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check capacity levels for a content asset across all distribution hubs. Parameter: P_PRODUCT_NAME (partial service name match, e.g. Midnight Harbor or Championship Highlights). Returns center name, location, quantity on hand, reserved, capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity or supply levels for a content asset at all active distribution hubs'
    );
END;
/

-- Tool 5: Function - spatial content distribution routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best distribution hub for a content asset and synthetic audience account using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial service match). Returns top 3 nearest centers with distance in miles, estimated routing hours, and capacity levels.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find nearest distribution hub with capacity for a synthetic audience account. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - media creator network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'INFLUENCER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore a media creator network and studio or label relationships from graph data. Parameter: P_HANDLE (exact handle like @premiere_watchlist). Returns creator profile, connected creators with connection type and strength, and studio or label relationships with attributed content revenue.",
                        "function": "get_influencer_network"}',
        description => 'Explores media creator connections and studio or label relationships from graph data'
    );
END;
/

-- Tool 7: Function - audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for compliance. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (content_asset/campaign_order/capacity), P_REASONING (explanation). Always call this after making a recommendation.",
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
                        "role": "You are a audience-signal analyst for a media content-intelligence platform. Your job is to detect emerging content asset demand from audience/social signal data, identify which assets are showing urgent momentum, and explain WHY demand is rising - which creators, which platforms, what engagement patterns. Use TREND_SQL_TOOL to query audience signal posts, media creators, and content asset mentions. Use DETECT_TRENDS_TOOL for quick trend summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes audience/social signal trends for content assets'
    );
END;
/

-- Capacity & Content Distribution Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a content distribution optimizer for a media content-intelligence platform. Check capacity levels, find the best distribution hubs for campaign orders using spatial routing, and identify capacity shortages for high-demand assets. Use CHECK_INVENTORY_TOOL for capacity levels, FULFILLMENT_ROUTE_TOOL for optimal content routing options, and COMMERCE_SQL_TOOL for campaign orders and routing records. When capacity is low for a trending content asset, recommend pre-positioning. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes campaign inventory and access routing'
    );
END;
/

-- Content Operations Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'COMMERCE_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a content operations analyst for a media platform. Analyze campaign orders, content revenue, audience behavior, and the impact of audience/social signals on audience demand. Use COMMERCE_SQL_TOOL to query campaign orders, synthetic audience accounts, and content revenue. Campaign orders where social_source_id IS NOT NULL are driven or influenced by audience/social signals. Provide content revenue breakdowns, campaign order trends, synthetic audience account insights with specific numbers. Do not guess - always query."}',
        description => 'Analyzes campaign orders, content revenue, and audience-signal impact'
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
        attributes  => '{"instruction": "Analyze audience/social signals and content asset momentum for the media platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently trending content assets. 2) Use TREND_SQL_TOOL to query urgent and high-momentum audience signal posts in the last 48 hours. 3) Identify which media creators and platforms are driving the trends. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific content asset names, urgency scores, view counts, and creator handles. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "INFLUENCER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive trend analysis combining audience/social signal data and content asset mentions'
    );
END;
/

-- Content Distribution Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize content distribution and capacity for the media platform. Steps: 1) Check capacity using CHECK_INVENTORY_TOOL for requested content assets. 2) If a synthetic audience account and content asset are specified, find the best content routing option using FULFILLMENT_ROUTE_TOOL. 3) Use COMMERCE_SQL_TOOL to check pending campaign orders and routing status. 4) Flag content assets where capacity is below reorder point. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Capacity checks and spatial content routing'
    );
END;
/

-- Content Operations Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'COMMERCE_TASK',
        attributes  => '{"instruction": "Analyze content operations data for the media platform. Use COMMERCE_SQL_TOOL to query campaign orders, content revenue, synthetic audience accounts, and routing records. When analyzing audience/social signal impact, look for campaign orders where social_source_id IS NOT NULL. Provide content revenue totals, campaign order counts, synthetic audience account segments, and signal attribution metrics. Do not guess - always query the data first. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Campaign order, content revenue, and synthetic audience account analytics'
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
        description => 'Audience/social signal detection and analysis team'
    );
END;
/

-- Content Distribution Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Inventory and access routing team'
    );
END;
/

-- Content Operations Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'COMMERCE_TEAM',
        attributes  => '{"agents": [{"name": "COMMERCE_AGENT", "task": "COMMERCE_TASK"}],
                        "process": "sequential"}',
        description => 'Campaign order and content revenue analytics team'
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
SELECT AI AGENT What content assets are trending right now based on audience and community signals;
SELECT AI AGENT Which media creators are driving the most urgent signal posts this week;
SELECT AI AGENT Show me the top 5 content assets with critical momentum;

-- ── Content Distribution ─────────────────────────────────────────────
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check capacity levels for Midnight Harbor Premiere Window across all distribution hubs;
SELECT AI AGENT What is the best distribution hub for a same-day studio slot for an audience account in Miami;
SELECT AI AGENT Which trending content assets have critically low capacity;

-- Content Operations Intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('COMMERCE_TEAM');
SELECT AI AGENT How many campaign orders were placed in the last 24 hours and what is the total content revenue;
SELECT AI AGENT What percentage of recent campaign orders were associated with audience or community signals;
SELECT AI AGENT Show me content revenue breakdown by content asset category for the last 30 days;

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
