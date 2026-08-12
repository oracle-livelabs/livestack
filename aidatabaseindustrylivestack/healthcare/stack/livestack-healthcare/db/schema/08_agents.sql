/*
 * 07_agents.sql
 * Select AI Agent Orchestration - Oracle 26ai DBMS_CLOUD_AI_AGENT
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

COMMENT ON TABLE brands IS 'Healthcare provider networks in the supply network. Includes provider network name, category, headquarters location, revenue, and supply tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official provider network name (e.g. NorthStar Health System, BioPure Diagnostics)';
COMMENT ON COLUMN brands.social_tier IS 'Manufacturer supply tier retained in the original column: emerging, standard, premium, or luxury; luxury marks strategic manufacturers in this healthcare demo';

COMMENT ON TABLE products IS 'Healthcare services and supplies available for care service requests. Each product row represents a service or supply with a provider network, category, service value, and tags.';
COMMENT ON COLUMN products.product_name IS 'Full product name (e.g. Emergency Department Capacity Command Center, qPCR Respiratory Panel)';
COMMENT ON COLUMN products.category IS 'Product category: Biologics, Diagnostics, Cell and Gene Therapy, Care Delivery Supplies, Care Logistics, etc.';
COMMENT ON COLUMN products.unit_price IS 'Contract unit price in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the product';

COMMENT ON TABLE fulfillment_centers IS 'Care logistics storage and distribution sites that fulfill healthcare service requests. Each has lat/lon location, capacity, and type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Type: warehouse, distribution, micro, drop_ship, or store';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Stock levels of each healthcare service at each fulfillment site. Tracks on-hand, reserved, and reorder thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available inventory units at this center';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending care service requests, not yet dispatched';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, restock is needed';

COMMENT ON TABLE customers IS 'Care sites and health systems with shipping addresses and account tier. Has lat/lon for spatial care logistics fulfillment routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Buyer tier: new, standard, preferred, or vip';
COMMENT ON COLUMN customers.lifetime_value IS 'Total revenue from this buyer in US dollars';

COMMENT ON TABLE orders IS 'Internal compatibility table for healthcare service requests with status tracking. Demo-facing SQL should prefer care_service_requests.';
COMMENT ON COLUMN orders.order_status IS 'Status: pending, confirmed, processing, shipped, delivered, cancelled, or returned';
COMMENT ON COLUMN orders.order_total IS 'Compatibility field for request value in US dollars. Demo-facing SQL should prefer care_service_requests.request_value.';
COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the post_id that drove the service request or allocation. NULL means direct demand.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Internal compatibility table for care service request line items. Demo-facing SQL should prefer care_request_items.';

COMMENT ON TABLE influencers IS 'Regulatory, safety, quality, and care logistics signal sources. Includes reach counts, engagement rates, and computed source influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Signal source handle like @fda_watch or @care logistics_ops';
COMMENT ON COLUMN influencers.platform IS 'Healthcare source channel: Supply Quality Notice, Compliance Signal, Cold Chain Bulletin, Regulatory Notice, or Capacity Alert.';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on source reach and engagement';
COMMENT ON COLUMN influencers.follower_count IS 'Source reach count retained in the original follower_count column';
COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Regulatory bulletins, GxP notices, logistics advisories, and supply signals mentioning products or manufacturers. Has reach metrics, sentiment, and criticality score.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the compliance or supply signal';
COMMENT ON COLUMN social_posts.virality_score IS 'Criticality score 0-100 combining urgency, reach, and amplification';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Signal intensity: normal, rising, viral, or mega_viral where viral means elevated and mega_viral means critical';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Signal sentiment from -1.0 (negative supply risk) to 1.0 (positive availability)';
COMMENT ON COLUMN social_posts.likes_count IS 'Acknowledgement count from subscribed teams';
COMMENT ON COLUMN social_posts.shares_count IS 'Forward or escalation count';
COMMENT ON COLUMN social_posts.views_count IS 'Total signal reach count';

COMMENT ON TABLE post_product_mentions IS 'Links regulatory and supply signals to healthcare operations they mention. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted demand for products factoring in regulatory and supply signals. social_factor > 1 means signal activity is amplifying demand or allocation risk.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this product/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Healthcare logistics route records for care service requests. Tracks carrier or partner, distance, cost, and route status.';
COMMENT ON COLUMN shipments.distance_km IS 'Care logistics route distance in kilometers';
COMMENT ON COLUMN shipments.estimated_hours IS 'Estimated care logistics transit time in hours';

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

-- Detect critical products from regulatory and supply signals
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
                    rec.mention_count || ' signals, criticality ' || rec.avg_virality ||
                    ', ' || rec.total_views || ' reach, intensity: ' || rec.peak_momentum || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No critical care service signals found in the last ' || p_hours || ' hours with criticality >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' critical products (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- Check inventory for a product across all sites
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
    RETURN 'Inventory for "' || p_product_name || '" across ' || v_count || ' sites (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest compliant site with stock for a buyer
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
        RETURN 'No fulfillment site found with stock for "' || p_product_name || '" near buyer "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' care logistics fulfillment options:' || CHR(10) || v_result;
END;
/

-- Explore signal-source network and manufacturer relationships
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

    v_result := v_result || CHR(10) || 'Manufacturer relationships:' || CHR(10);
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

PROMPT PL/SQL tool functions created.

-- ============================================================
-- STEP 3: CREATE SELECT AI AGENT TOOLS
-- Two types: "SQL" (agent writes the query itself) and
-- "function" (agent calls a PL/SQL function you wrote).
-- ============================================================

-- Tool 1: SQL tool for regulatory and supply signal queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for regulatory bulletins, care service signals, source activity, manufacturer momentum, and reach metrics. Key columns: virality_score as criticality score, momentum_flag (normal/rising/viral/mega_viral), sentiment_score, likes_count, shares_count, views_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for care service request and fulfillment queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'COMMERCE_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query CARE_SERVICE_REQUESTS, CARE_REQUEST_ITEMS, CARE_SITES_V, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, and DEMAND_FORECASTS. Use for care service request lookups, service value, capacity and supply levels, care logistics movement status, care-site info, and demand predictions. request_status values include pending, confirmed, processing, shipped, delivered, cancelled, and returned. source_signal_id NOT NULL means the request is signal-influenced.'
    );
END;
/

-- Tool 3: Function - critical care-service signal detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect critical care services and supplies from regulatory, quality, and capacity signals. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum criticality score. Returns care service names, healthcare partners, signal counts, criticality, reach counts, and peak intensity.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent signal records to find care services or supplies with elevated or critical intensity'
    );
END;
/

-- Tool 4: Function - inventory checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check capacity and supply levels for a healthcare service across all care logistics sites. Parameter: P_PRODUCT_NAME (partial name match, e.g. Emergency Department Capacity Command Center or qPCR Respiratory Panel). Returns site name, location, quantity on hand, reserved, and capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity and supply levels for a care service at all active care logistics sites'
    );
END;
/

-- Tool 5: Function - spatial fulfillment routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best care logistics site to route a care service or supply to a care site using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial match). Returns top 3 nearest sites with distance in miles, estimated transit hours, and available capacity.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find the nearest compliant care logistics site with available capacity for a care site. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - signal source network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'INFLUENCER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore signal source network connections and healthcare partner relationships from graph data. Parameter: P_HANDLE (exact handle like @fda_watch). Returns source profile, connected sources with connection type and strength, healthcare partner relationships with attributed service value.",
                        "function": "get_influencer_network"}',
        description => 'Explores signal source connections and healthcare partner relationships from graph data'
    );
END;
/

-- Tool 7: Function - audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for compliance. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (care_service/service_request/capacity_supply), P_REASONING (explanation). Always call this after making a recommendation.",
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

-- Regulatory Signal Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'TREND_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a regulatory and market signal analyst for a healthcare supply platform. Your job is to detect emerging service-line risks from regulatory bulletins, GxP updates, care logistics notices, and manufacturer signals, and explain WHY they are critical: which sources, which channels, what reach patterns. Use TREND_SQL_TOOL to query signal records, sources, and care-service mentions. Use DETECT_TRENDS_TOOL for quick signal summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes healthcare care service signals'
    );
END;
/

-- Inventory & Fulfillment Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a care logistics supply chain and fulfillment optimizer for a regulated healthcare platform. Check capacity and supply levels, find the best compliant care logistics sites for service requests using spatial routing, and identify shortages for critical care services or supplies. Use CHECK_INVENTORY_TOOL for capacity and supply levels, FULFILLMENT_ROUTE_TOOL for care logistics routing, and COMMERCE_SQL_TOOL for service requests and logistics movements. When capacity or supply is low for a critical care service, recommend pre-positioning or allocation. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes care-service capacity, supply, and care logistics routing'
    );
END;
/

-- Care Service Request Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'COMMERCE_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a care service request intelligence analyst for a healthcare supply platform. Analyze service requests, service value, care-site patterns, and the impact of regulatory or supply signals on requests. Use COMMERCE_SQL_TOOL to query care_service_requests, care_request_items, care sites, and service value. Service requests where source_signal_id IS NOT NULL are signal-driven. Provide service-value breakdowns, request trends, and care-site insights with specific numbers. Do not guess - always query."}',
        description => 'Analyzes healthcare service requests, service value, and signal impact'
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
        attributes  => '{"instruction": "Analyze regulatory and supply signals for the healthcare platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently critical care services or supplies. 2) Use TREND_SQL_TOOL to query elevated and critical signal records in the last 48 hours. 3) Identify which sources and channels are driving the signals. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific care-service names, criticality scores, reach counts, and source handles. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "INFLUENCER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive signal analysis combining regulatory data and care-service mentions'
    );
END;
/

-- Fulfillment Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize care logistics, capacity, and supply for the regulated healthcare platform. Steps: 1) Check capacity and supply using CHECK_INVENTORY_TOOL for requested care services or supplies. 2) If a care site and care service are specified, find the best care logistics route using FULFILLMENT_ROUTE_TOOL. 3) Use COMMERCE_SQL_TOOL to check pending service requests and logistics movement status. 4) Flag care services or supplies where available capacity is below the reorder point. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Capacity and supply checks plus spatial care logistics routing'
    );
END;
/

-- Commerce Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'COMMERCE_TASK',
        attributes  => '{"instruction": "Analyze healthcare service request data for the healthcare platform. Use COMMERCE_SQL_TOOL to query service requests, service value, care sites, and logistics movements. When analyzing signal impact, look for service requests where social_source_id IS NOT NULL. Provide service-value totals, request counts, care-site segments, and signal attribution metrics. Do not guess - always query the data first. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Service request, service value, and care-site analytics'
    );
END;
/

PROMPT Select AI Agent tasks created: 3

-- ============================================================
-- STEP 6: CREATE TEAMS
-- SET_TEAM activates a team for your session.
-- Then use SELECT AI AGENT <your question> to talk to it.
-- ============================================================

-- Regulatory Signal Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'SOCIAL_TREND_TEAM',
        attributes  => '{"agents": [{"name": "TREND_AGENT", "task": "TREND_ANALYSIS_TASK"}],
                        "process": "sequential"}',
        description => 'Regulatory and supply signal analysis team'
    );
END;
/

-- Fulfillment Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Product inventory and care logistics fulfillment routing team'
    );
END;
/

-- Care Service Request Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'COMMERCE_TEAM',
        attributes  => '{"agents": [{"name": "COMMERCE_AGENT", "task": "COMMERCE_TASK"}],
                        "process": "sequential"}',
        description => 'Care service request and service value analytics team'
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
SELECT AI AGENT What healthcare operations are critical right now based on regulatory and supply signals;
SELECT AI AGENT Which signal sources are driving the most critical bulletins this week;
SELECT AI AGENT Show me the top 5 care services with critical signal intensity;

-- Fulfillment
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check inventory levels for qPCR Respiratory Panel across all care logistics sites;
SELECT AI AGENT What is the best care logistics site to route Emergency Department Capacity Command Center to a care site in Miami;
SELECT AI AGENT Which critical care services or supplies have low capacity;

-- Care Service Request Intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('COMMERCE_TEAM');
SELECT AI AGENT How many care service requests were created in the last 24 hours and what is the total service value;
SELECT AI AGENT What percentage of recent care service requests were driven by compliance signals;
SELECT AI AGENT Show me service value by care category for the last 30 days;

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
