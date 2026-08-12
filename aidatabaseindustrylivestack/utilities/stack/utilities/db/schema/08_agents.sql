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
SET DEFINE OFF

-- ============================================================
-- STEP 0: TABLE & COLUMN COMMENTS FOR SELECT AI
-- Select AI reads these to understand your schema.
-- Good comments = smarter agent queries.
-- ============================================================

COMMENT ON TABLE brands IS 'Energy & Utilities utility operators, service partners, facilities, and operational networks across electric, gas, water/wastewater, upstream, midstream, and downstream operations.';
COMMENT ON COLUMN brands.brand_name IS 'The official utility operator, facility, service partner, or operational network name (e.g. GridBridge Electric, GasFlow Operations, WaterWorks Utility)';
COMMENT ON COLUMN brands.social_tier IS 'Operator or partner tier retained in the original column: emerging, standard, premium, or luxury; luxury marks strategic service partners in this utilities demo';

COMMENT ON TABLE products IS 'Energy & Utilities services, programs, inspections, maintenance bundles, customer operations tasks, and operating events available for utility service requests.';
COMMENT ON COLUMN products.product_name IS 'Full service or operating event name (e.g. Gas Leak Investigation, Wastewater Compliance Sampling, Well Production Variance Review, Refinery Unit Constraint Review)';
COMMENT ON COLUMN products.category IS 'Subsector or operating category: Electric Utility, Gas Utility, Water/Wastewater Utility, Oil & Gas Upstream, Oil & Gas Midstream, Oil & Gas Downstream, HSE and Emissions, Customer Operations, or Field Operations.';
COMMENT ON COLUMN products.unit_price IS 'Contract unit price in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the product';

COMMENT ON TABLE fulfillment_centers IS 'Field operations sites, staging depots, facilities, and partner logistics locations that support utilities service requests. Each has lat/lon location, capacity, and type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Type: warehouse, distribution, micro, drop_ship, or store';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity and supply levels for each utilities service at each field operations site. Tracks on-hand, reserved, and reorder thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available inventory units at this center';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending utility service requests, not yet dispatched';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, restock is needed';

COMMENT ON TABLE customers IS 'Service points and service territories with service addresses and account tier. Has lat/lon for spatial field operations routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Buyer tier: new, standard, preferred, or vip';
COMMENT ON COLUMN customers.lifetime_value IS 'Total revenue from this buyer in US dollars';

COMMENT ON TABLE orders IS 'Internal compatibility table for utilities service requests with status tracking. Demo-facing SQL should prefer utility_service_requests.';
COMMENT ON COLUMN orders.order_status IS 'Status: pending, confirmed, processing, shipped, delivered, cancelled, or returned';
COMMENT ON COLUMN orders.order_total IS 'Compatibility field for request priority value in US dollars. Demo-facing SQL should prefer utility_service_requests.request_value.';
COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the post_id that drove the service request or allocation. NULL means direct demand.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Internal compatibility table for utility service request line items. Demo-facing SQL should prefer utility_request_items.';

COMMENT ON TABLE influencers IS 'Regulatory, safety, quality, and field operations signal sources. Includes reach counts, engagement rates, and computed source influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Signal source handle like @fda_watch or @field operations_ops';
COMMENT ON COLUMN influencers.platform IS 'Energy & Utilities source channel: Reliability Signal, Production Signal, Supply Quality Notice, Compliance Signal, Field Access Bulletin, Regulatory Notice, Capacity Alert, or HSE and Emissions Notice.';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on source reach and engagement';
COMMENT ON COLUMN influencers.follower_count IS 'Source reach count retained in the original follower_count column';
COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Operational signals spanning electric reliability, gas pressure/leak response, water/wastewater compliance, oil & gas production, pipeline integrity, refinery throughput, LNG logistics, HSE, emissions, field execution, and customer operations.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the compliance or supply signal';
COMMENT ON COLUMN social_posts.virality_score IS 'Criticality score 0-100 combining urgency, reach, and amplification';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Signal intensity: normal, rising, viral, or mega_viral where viral means elevated and mega_viral means critical';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Signal sentiment from -1.0 (negative supply risk) to 1.0 (positive availability)';
COMMENT ON COLUMN social_posts.likes_count IS 'Acknowledgement count from subscribed teams';
COMMENT ON COLUMN social_posts.shares_count IS 'Forward or escalation count';
COMMENT ON COLUMN social_posts.views_count IS 'Total signal reach count';

COMMENT ON TABLE post_product_mentions IS 'Links regulatory and supply signals to utility operations they mention. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted demand, capacity, production, compliance, and field-execution risk for Energy & Utilities services, factoring in operational signals. social_factor > 1 means signal activity is amplifying demand or allocation risk.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this product/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Energy & Utilities logistics route records for utility service requests. Tracks carrier or partner, distance, cost, and route status.';
COMMENT ON COLUMN shipments.distance_km IS 'Field operations route distance in kilometers';
COMMENT ON COLUMN shipments.estimated_hours IS 'Estimated field operations transit time in hours';

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
        RETURN 'No critical utility service signals found in the last ' || p_hours || ' hours with criticality >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' critical utility-service signals (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- Check capacity and supply for a utility service across all sites
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
                    rec.quantity_on_hand || ' available units, ' || rec.quantity_reserved || ' reserved units [' || rec.stock_status || ']' || CHR(10);
        v_total := v_total + rec.quantity_on_hand;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No capacity or supply found for utility service matching: ' || p_product_name;
    END IF;
    RETURN 'Capacity and supply for "' || p_product_name || '" across ' || v_count || ' sites (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest compliant field logistics site with capacity for a service point
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
                    rec.distance_mi || ' mi, ~' || rec.est_hours || ' hrs, ' || rec.quantity_on_hand || ' available units' || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No field operations site found with available capacity for "' || p_product_name || '" near service point "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' field operations routing options:' || CHR(10) || v_result;
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

    v_result := v_result || CHR(10) || 'Utilities partner relationships:' || CHR(10);
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
        tool_name   => 'GRID_SIGNAL_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query RELIABILITY_LOAD_SIGNALS_V, UTILITY_SIGNAL_MATCHES_V, UTILITY_SERVICES_V, and service-source views. Use for regulatory bulletins, utility service signals, source activity, utilities partner momentum, and reach metrics. Key business fields: criticality_score, signal_intensity, signal_sentiment, signal_reach, escalation_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for utility service request and field operations queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'SERVICE_REQUEST_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query UTILITY_SERVICE_REQUESTS, UTILITY_REQUEST_ITEMS, SERVICE_POINTS_V, ASSET_CAPACITY_V, FIELD_LOGISTICS_SITES_V, FIELD_CREW_ROUTES_V, and DEMAND_FORECASTS. Use for utility service request lookups, operational value, capacity and supply levels, field operations movement status, service-point info, and demand predictions. request_status values include pending, confirmed, processing, dispatched, completed, cancelled, and returned. source_signal_id NOT NULL means the request is signal-influenced.'
    );
END;
/

-- Tool 3: Function - critical utility-service signal detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_GRID_SIGNALS_TOOL',
        attributes  => '{"instruction": "Detect critical utility services and supplies from cross-sector operational, production, compliance, emissions, HSE, regulatory, reliability, and capacity signals. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum criticality score. Returns utility service names, utilities partners, signal counts, criticality, reach counts, and peak intensity.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent signal records to find utility services or supplies with elevated or critical intensity'
    );
END;
/

-- Tool 4: Function - inventory checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_CAPACITY_SUPPLY_TOOL',
        attributes  => '{"instruction": "Check capacity and supply levels for a utilities service across all field operations sites. Parameter: P_PRODUCT_NAME (partial name match, e.g. Emergency Operations Group Capacity Command Center or Transformer Load Assessment). Returns site name, location, quantity on hand, reserved, and capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity and supply levels for a utility service at all active field operations sites'
    );
END;
/

-- Tool 5: Function - spatial field crew routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FIELD_CREW_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best field operations site to route a utility service or supply to a service point using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial match). Returns top 3 nearest sites with distance in miles, estimated transit hours, and available capacity.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find the nearest compliant field operations site with available capacity for a service point. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - signal source network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'SIGNAL_SOURCE_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore signal source network connections and utilities partner relationships from graph data. Parameter: P_HANDLE (exact handle like @fda_watch). Returns source profile, connected sources with connection type and strength, utilities partner relationships with attributed operational value.",
                        "function": "get_influencer_network"}',
        description => 'Explores signal source connections and utilities partner relationships from graph data'
    );
END;
/

-- Tool 7: Function - audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for compliance. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (utility_service/service_request/capacity_supply), P_REASONING (explanation). Always call this after making a recommendation.",
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

-- Energy Operations Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'GRID_RELIABILITY_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are an Energy & Utilities operations intelligence analyst. Detect emerging electric reliability, gas leak, pipeline pressure, water pressure, wastewater compliance, well production, refinery throughput, LNG logistics, emissions, HSE, and regulatory signals, then explain WHY they are critical: which sources, channels, reach patterns, assets, customers, and compliance records are involved. Use GRID_SIGNAL_SQL_TOOL to query signal records, sources, and utility-service mentions. Use DETECT_GRID_SIGNALS_TOOL for quick signal summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes Energy & Utilities operational, production, compliance, emissions, HSE, and service signals'
    );
END;
/

-- Field Dispatch and Asset Maintenance Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FIELD_CREW_LOGISTICS_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a field dispatch and asset maintenance optimizer for regulated Energy & Utilities operations. Check capacity and supply levels, crew or parts blockers, work orders, maintenance plans, inspections, pipeline integrity actions, and the best compliant field operations logistics sites for service requests using spatial routing. Use CHECK_CAPACITY_SUPPLY_TOOL for capacity and supply levels, FIELD_CREW_ROUTE_TOOL for field operations routing, and SERVICE_REQUEST_SQL_TOOL for service requests and logistics movements. Recommend pre-positioning, dispatch, maintenance, or allocation actions when risk is high. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes field dispatch, maintenance, asset integrity, work orders, capacity, supply, and routing'
    );
END;
/

-- Customer and Regulatory Operations Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'UTILITY_SERVICE_REQUEST_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a customer and regulatory operations analyst for an Energy & Utilities platform. Analyze service requests, billing and collections, high-usage concerns, gas odor calls, water leak complaints, wastewater overflow complaints, industrial customer requests, regulatory follow-up, operational value, service-point patterns, and the impact of regulatory or supply signals on requests. Use SERVICE_REQUEST_SQL_TOOL to query utility_service_requests, utility_request_items, service points, and operational value. Service requests where source_signal_id IS NOT NULL are signal-driven. Provide service-value breakdowns, request trends, SLA risk, and service-point insights with specific numbers. Do not guess - always query."}',
        description => 'Analyzes utility service requests, customer operations, regulatory follow-up, operational value, and signal impact'
    );
END;
/

PROMPT Select AI Agents created: 3

-- ============================================================
-- STEP 5: CREATE TASKS
-- Instructions + tool bindings. {query} is where the user question goes.
-- ============================================================

-- Energy Operations Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'GRID_RELIABILITY_TASK',
        attributes  => '{"instruction": "Analyze Energy & Utilities operational signals. Steps: 1) Use DETECT_GRID_SIGNALS_TOOL to find currently critical utility services, operating events, compliance signals, or supplies. 2) Use GRID_SIGNAL_SQL_TOOL to query elevated and critical signal records in the last 48 hours. 3) Identify which sources and channels are driving electric, gas, water/wastewater, upstream, midstream, downstream, emissions, HSE, or regulatory signals. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific service names, criticality scores, reach counts, source handles, and follow-up recommendations. User query: {query}",
                        "tools": ["GRID_SIGNAL_SQL_TOOL", "DETECT_GRID_SIGNALS_TOOL", "SIGNAL_SOURCE_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive cross-sector signal analysis combining regulatory data, operational events, production, compliance, and utility-service mentions'
    );
END;
/

-- Field Dispatch and Asset Maintenance Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FIELD_CREW_LOGISTICS_TASK',
        attributes  => '{"instruction": "Optimize field dispatch, maintenance, capacity, and supply for the regulated Energy & Utilities platform. Steps: 1) Check capacity and supply using CHECK_CAPACITY_SUPPLY_TOOL for requested utility services, maintenance plans, parts, or supplies. 2) If a service point and utility service are specified, find the best field operations route using FIELD_CREW_ROUTE_TOOL. 3) Use SERVICE_REQUEST_SQL_TOOL to check pending service requests, work-order implications, and logistics movement status. 4) Flag services, assets, or supplies where capacity is below the reorder point or blocked by crew/parts availability. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["SERVICE_REQUEST_SQL_TOOL", "CHECK_CAPACITY_SUPPLY_TOOL", "FIELD_CREW_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Capacity, maintenance, work-order, supply, and spatial field operations routing'
    );
END;
/

-- Customer and Regulatory Operations Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'UTILITY_SERVICE_REQUEST_TASK',
        attributes  => '{"instruction": "Analyze Energy & Utilities customer and regulatory operations data. Use SERVICE_REQUEST_SQL_TOOL to query service requests, billing inquiries, collections/payment arrangements, service points, operational value, logistics movements, and regulatory follow-up. When analyzing signal impact, look for service requests where source_signal_id IS NOT NULL. Provide service-value totals, request counts, SLA risk, service-point segments, and signal attribution metrics. Do not guess - always query the data first. User query: {query}",
                        "tools": ["SERVICE_REQUEST_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Customer operations, regulatory follow-up, service request, operational value, and service-point analytics'
    );
END;
/

PROMPT Select AI Agent tasks created: 3

-- ============================================================
-- STEP 6: CREATE TEAMS
-- SET_TEAM activates a team for your session.
-- Then use SELECT AI AGENT <your question> to talk to it.
-- ============================================================

-- Grid Reliability Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'GRID_RELIABILITY_TEAM',
        attributes  => '{"agents": [{"name": "GRID_RELIABILITY_AGENT", "task": "GRID_RELIABILITY_TASK"}],
                        "process": "sequential"}',
        description => 'Energy operations intelligence team for electric, gas, water/wastewater, oil & gas, emissions, HSE, and regulatory signals'
    );
END;
/

-- Field Dispatch and Asset Maintenance Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FIELD_CREW_LOGISTICS_TEAM',
        attributes  => '{"agents": [{"name": "FIELD_CREW_LOGISTICS_AGENT", "task": "FIELD_CREW_LOGISTICS_TASK"}],
                        "process": "sequential"}',
        description => 'Field dispatch and asset maintenance team for capacity, work orders, inspections, parts, crews, and routing'
    );
END;
/

-- Utility Service Request Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'UTILITY_SERVICE_REQUEST_TEAM',
        attributes  => '{"agents": [{"name": "UTILITY_SERVICE_REQUEST_AGENT", "task": "UTILITY_SERVICE_REQUEST_TASK"}],
                        "process": "sequential"}',
        description => 'Customer and regulatory operations team for service requests, SLA, billing, collections, compliance, and operational value'
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
PROMPT 7 tools, 3 governed execution agents, 3 tasks, 3 teams
PROMPT =====================================================

-- ============================================================
-- EXAMPLE USAGE
-- Run from SQL Developer, Database Actions, or the app backend.
-- ============================================================

/*
-- Energy operations intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('GRID_RELIABILITY_TEAM');
SELECT AI AGENT Which gas pipeline segments show pressure anomalies or integrity risk;
SELECT AI AGENT Which wastewater facilities are approaching compliance thresholds;
SELECT AI AGENT Which refinery units are constraining throughput;

-- Field dispatch and maintenance
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FIELD_CREW_LOGISTICS_TEAM');
SELECT AI AGENT Recommend field crew dispatch actions for gas leak response event GLK-2208;
SELECT AI AGENT Which maintenance plans are blocked by crew or parts availability;
SELECT AI AGENT Prioritize assets before the storm arrives;

-- Customer and regulatory operations
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('UTILITY_SERVICE_REQUEST_TEAM');
SELECT AI AGENT Which customer service requests are breaching SLA;
SELECT AI AGENT Analyze billing or collections service requests;
SELECT AI AGENT Prepare a regulatory reliability report summary;

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
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('GRID_RELIABILITY_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('FIELD_CREW_LOGISTICS_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('UTILITY_SERVICE_REQUEST_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('GRID_RELIABILITY_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('FIELD_CREW_LOGISTICS_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('UTILITY_SERVICE_REQUEST_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('GRID_RELIABILITY_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('FIELD_CREW_LOGISTICS_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('UTILITY_SERVICE_REQUEST_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('GRID_SIGNAL_SQL_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('SERVICE_REQUEST_SQL_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('DETECT_GRID_SIGNALS_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('CHECK_CAPACITY_SUPPLY_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('FIELD_CREW_ROUTE_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('SIGNAL_SOURCE_NETWORK_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('LOG_DECISION_TOOL', TRUE);
DROP FUNCTION detect_trending_products;
DROP FUNCTION check_product_inventory;
DROP FUNCTION find_best_fulfillment;
DROP FUNCTION get_influencer_network;
DROP FUNCTION log_agent_decision;
*/
