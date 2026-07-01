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

COMMENT ON TABLE brands IS 'Manufacturing product lines and production programs in the manufacturing-operations platform. Includes program name, category, headquarters location, order value, and signal tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official product line name (e.g. Apex Automation Systems, CircuitForge Electronics)';
COMMENT ON COLUMN brands.social_tier IS 'Product line signal tier: emerging, standard, premium, or critical-access.';

COMMENT ON TABLE products IS 'Manufactured parts, programs, capacity slots, and component inventory items. Each manufactured part belongs to a product line and has a category, value proxy, and search tags.';
COMMENT ON COLUMN products.product_name IS 'Full manufactured part name (e.g. Servo Drive Controller AX-400, Predictive Maintenance Sensor Pack)';
COMMENT ON COLUMN products.category IS 'Manufactured part category such as Industrial Automation, Quality Assurance, Condition Monitoring, Flexible Assembly, MRO Supply, or Component Inventory.';
COMMENT ON COLUMN products.unit_price IS 'Manufactured part value or cost proxy in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the manufactured part or capacity item';

COMMENT ON TABLE fulfillment_centers IS 'Plant capacity centers and production hubs used for spatial routing. Each has lat/lon location, capacity, and center type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Baseline center type values mapped to manufacturing hubs: warehouse, distribution, micro, drop_ship, or store.';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity or component inventory levels for each manufactured part at each access center. Tracks available, reserved, and reorder or escalation thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available capacity or supply units at this plant capacity center';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for planned or released work orders, not yet completed';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, capacity intervention or replenishment is needed';

COMMENT ON TABLE customers IS 'Synthetic customers with service addresses and risk tier. Has lat/lon for spatial plant routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Synthetic customer access tier: new, standard, preferred, or vip baseline values.';
COMMENT ON COLUMN customers.lifetime_value IS 'Synthetic lifetime order value proxy in US dollars';

COMMENT ON TABLE manufacturing_work_orders IS 'Manufacturing work orders with status tracking, production-signal attribution, and assigned plant capacity.';
COMMENT ON COLUMN manufacturing_work_orders.work_order_status_code IS 'Manufacturing status code: planned, released, in_progress, dispatched, completed, cancelled, or on_hold.';
COMMENT ON COLUMN manufacturing_work_orders.work_order_value IS 'Total work-order value proxy in US dollars';
COMMENT ON COLUMN manufacturing_work_orders.production_signal_id IS 'If signal-influenced, the production/demand signal production_signal_id associated with demand. NULL means organic or direct.';
COMMENT ON COLUMN manufacturing_work_orders.demand_urgency_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE manufacturing_work_order_lines IS 'Requested manufactured parts, materials, or supply items within a work order. Each links to a manufactured part with quantity and value proxy.';

COMMENT ON TABLE influencers IS 'Manufacturing supplier, operations, engineer, plant, and market network accounts. Includes reach counts, signal activity rates, and computed influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Network account or signal-source handle such as @plant_sarah';
COMMENT ON COLUMN influencers.platform IS 'Inherited signal-channel code. Display labels map these values to supplier portal, plant floor alert, market demand feed, quality bulletin, and partner operations feed.';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on signal-source reach and activity';
COMMENT ON COLUMN influencers.follower_count IS 'Reach count for the signal source or network account';
COMMENT ON COLUMN influencers.engagement_rate IS 'Signal activity rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE manufacturing_production_signals IS 'Production, supplier, market, and quality signals mentioning manufactured parts or product lines. Has signal activity metrics, sentiment, and urgency score.';
COMMENT ON COLUMN manufacturing_production_signals.signal_text IS 'Full text of the production or demand signal';
COMMENT ON COLUMN manufacturing_production_signals.urgency_score IS 'Urgency score 0-100 combining signal activity velocity, amplification, and plant capacity relevance';
COMMENT ON COLUMN manufacturing_production_signals.momentum_code IS 'Manufacturing momentum code: stable, elevated, escalating, or critical.';
COMMENT ON COLUMN manufacturing_production_signals.sentiment_score IS 'Sentiment from -1.0 (negative) to 1.0 (positive)';
COMMENT ON COLUMN manufacturing_production_signals.acknowledgement_count IS 'Number of signal acknowledgements';
COMMENT ON COLUMN manufacturing_production_signals.propagation_count IS 'Number of downstream teams or systems to which the signal propagated';
COMMENT ON COLUMN manufacturing_production_signals.observation_count IS 'Total number of signal observations';

COMMENT ON TABLE manufacturing_signal_part_mentions IS 'Links production or demand signals to manufactured parts. Has confidence score and detection method.';
COMMENT ON COLUMN manufacturing_signal_part_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN manufacturing_signal_part_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE manufacturing_demand_forecasts IS 'Predicted production demand for manufactured parts factoring in production/demand signal momentum. production_signal_factor > 1 means supplier signals are amplifying demand.';
COMMENT ON COLUMN manufacturing_demand_forecasts.predicted_unit_demand IS 'Predicted unit demand for this manufactured part/region/date';
COMMENT ON COLUMN manufacturing_demand_forecasts.production_signal_factor IS 'Production or demand signal multiplier. 1.0 means no signal effect; larger values indicate amplified demand.';

COMMENT ON TABLE shipments IS 'Production routing and dispatch records for work orders. Tracks route team, distance, cost proxy, and completion status.';
COMMENT ON COLUMN shipments.distance_km IS 'Production routing distance in kilometers';
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
        profile_name    => 'MANUFACTURING_COHERE_PROFILE',
        attribute_name  => 'object_list',
        attribute_value => '[
            {"owner": "' || USER || '", "name": "BRANDS"},
            {"owner": "' || USER || '", "name": "PRODUCTS"},
            {"owner": "' || USER || '", "name": "FULFILLMENT_CENTERS"},
            {"owner": "' || USER || '", "name": "INVENTORY"},
            {"owner": "' || USER || '", "name": "CUSTOMERS"},
            {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDERS"},
            {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDER_LINES"},
            {"owner": "' || USER || '", "name": "INFLUENCERS"},
            {"owner": "' || USER || '", "name": "MANUFACTURING_PRODUCTION_SIGNALS"},
            {"owner": "' || USER || '", "name": "MANUFACTURING_SIGNAL_PART_MENTIONS"},
            {"owner": "' || USER || '", "name": "MANUFACTURING_DEMAND_FORECASTS"},
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

-- -- Detect trending manufactured parts from production/demand signal momentum
CREATE OR REPLACE FUNCTION detect_trending_products(
    p_hours     NUMBER DEFAULT 48,
    p_min_score NUMBER DEFAULT 50
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_count  NUMBER := 0;
BEGIN
    FOR rec IN (
        SELECT p.product_name, b.brand_name, p.category,
               COUNT(DISTINCT sp.production_signal_id) AS mention_count,
               ROUND(AVG(sp.urgency_score), 1) AS average_urgency_score,
               SUM(sp.observation_count) AS total_observations,
               MAX(sp.momentum_code) AS peak_momentum
        FROM manufacturing_signal_part_mentions ppm
        JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
        JOIN products p ON ppm.manufactured_part_id = p.product_id
        JOIN brands b ON p.brand_id = b.brand_id
        WHERE sp.observed_at >= SYSTIMESTAMP - NUMTODSINTERVAL(p_hours, 'HOUR')
          AND sp.urgency_score >= p_min_score
        GROUP BY p.product_name, b.brand_name, p.category
        ORDER BY average_urgency_score DESC
        FETCH FIRST 10 ROWS ONLY
    ) LOOP
        v_result := v_result || rec.product_name || ' (' || rec.brand_name || ') - ' ||
                    rec.mention_count || ' mentions, urgency ' || rec.average_urgency_score ||
                    ', ' || rec.total_observations || ' views, momentum: ' || rec.peak_momentum || CHR(10);
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No trending manufactured parts found in the last ' || p_hours || ' hours with urgency score >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' trending manufactured parts (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- -- Check capacity for a manufactured part across all access centers
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
        RETURN 'No capacity or supply found for manufactured part matching: ' || p_product_name;
    END IF;
    RETURN 'Capacity for "' || p_product_name || '" across ' || v_count || ' centers (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest plant capacity center with capacity for a synthetic customer
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
        RETURN 'No plant capacity center found with capacity for "' || p_product_name || '" near synthetic customer "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' production routing options:' || CHR(10) || v_result;
END;
/

-- -- Explore manufacturing network account network and product line relationships
CREATE OR REPLACE FUNCTION get_supplier_network(
    p_handle VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_info   VARCHAR2(500);
BEGIN
    BEGIN
        SELECT 'Network Account: ' || display_name || ' (' || handle || ') - ' ||
               platform || ', ' || follower_count || ' reach, score ' || influence_score ||
               ', niche: ' || niche
        INTO v_info
        FROM influencers WHERE handle = p_handle;
        v_result := v_info || CHR(10) || CHR(10);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN 'Network Account not found: ' || p_handle;
    END;

    v_result := v_result || 'Connected manufacturing network accounts:' || CHR(10);
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

    v_result := v_result || CHR(10) || 'Product line relationships:' || CHR(10);
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
                    ') - ' || rec.post_count || ' signal posts, $' || rec.revenue || ' order value attributed' || CHR(10);
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

-- Tool 1: SQL tool for production/demand signal queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "MANUFACTURING_COHERE_PROFILE"}}',
        description => 'Query MANUFACTURING_PRODUCTION_SIGNALS, MANUFACTURING_SIGNAL_PART_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for production or demand signals, trending manufactured parts, network-account activity, signal momentum, and signal activity metrics. Key columns: urgency_score, momentum_code (stable/elevated/escalating/critical), sentiment_score, acknowledgement_count, propagation_count, observation_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for manufacturing operations and access queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'WORK_ORDER_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "MANUFACTURING_COHERE_PROFILE"}}',
        description => 'Query MANUFACTURING_WORK_ORDERS, MANUFACTURING_WORK_ORDER_LINES, CUSTOMERS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, MANUFACTURING_DEMAND_FORECASTS tables. Use for work-order lookups, value, capacity, routing status, customer accounts, and demand predictions. work_order_status_code values are planned/released/in_progress/dispatched/completed/cancelled/on_hold. production_signal_id NOT NULL means signal-influenced work order.'
    );
END;
/

-- Tool 3: Function - trending manufactured parts detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect trending manufactured parts from production/demand signal momentum. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum urgency score. Returns manufactured part names, product lines, mention counts, urgency, view counts, and peak momentum.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent production or demand signals to find manufactured parts with elevated, escalating, or critical momentum'
    );
END;
/

-- Tool 4: Function — capacity checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check capacity levels for a manufactured part across all plant capacity centers. Parameter: P_PRODUCT_NAME (partial manufactured part name match, e.g. Servo Drive or Predictive Maintenance). Returns center name, location, quantity on hand, reserved, capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity or supply levels for a manufactured part at all active plant capacity centers'
    );
END;
/

-- Tool 5: Function - spatial plant capacity routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best plant capacity center for a manufactured part and synthetic customer using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial manufactured part match). Returns top 3 nearest centers with distance in miles, estimated routing hours, and capacity levels.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find nearest plant capacity center with capacity for a synthetic customer. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - manufacturing network account network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'SUPPLIER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore a manufacturing network account network and product line relationships from graph data. Parameter: P_HANDLE (exact handle like @plant_sarah). Returns network account profile, connected network accounts with connection type and strength, and product line relationships with attributed order value.",
                        "function": "get_supplier_network"}',
        description => 'Explores manufacturing network account connections and product line relationships from graph data'
    );
END;
/

-- Tool 7: Function — audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for compliance. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (manufactured_part/work_order/capacity), P_REASONING (forecast_explanation). Always call this after making a recommendation.",
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
        attributes  => '{"profile_name": "MANUFACTURING_COHERE_PROFILE",
                        "role": "You are a production-signal analyst for a manufacturing operations platform. Your job is to detect emerging manufactured part demand from production/demand signal data, identify which manufactured parts are showing urgent momentum, and explain WHY demand is rising — which network accounts, which signal channels, what signal activity patterns. Use TREND_SQL_TOOL to query production signals, manufacturing network accounts, and manufactured part mentions. Use DETECT_TRENDS_TOOL for quick trend summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes production/demand signal trends for manufactured parts'
    );
END;
/

-- Capacity & Plant Capacity Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "MANUFACTURING_COHERE_PROFILE",
                        "role": "You are a plant capacity optimizer for a manufacturing operations platform. Check capacity levels, find the best plants for work orders using spatial routing, and identify capacity shortages for high-demand manufactured parts. Use CHECK_INVENTORY_TOOL for capacity levels, FULFILLMENT_ROUTE_TOOL for optimal production routing options, and WORK_ORDER_SQL_TOOL for work orders and routing records. When capacity is low for a trending manufactured part, recommend pre-positioning. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes production capacity and access routing'
    );
END;
/

-- Manufacturing Operations Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'MANUFACTURING_OPERATIONS_AGENT',
        attributes  => '{"profile_name": "MANUFACTURING_COHERE_PROFILE",
                        "role": "You are a manufacturing operations analyst for a manufacturing platform. Analyze work orders, order value, customer behavior, and the impact of production/demand signals on production demand. Use WORK_ORDER_SQL_TOOL to query work orders, synthetic customers, and order value. Work orders where production_signal_id IS NOT NULL are driven or influenced by production/demand signals. Provide order value breakdowns, work order trends, synthetic customer insights with specific numbers. Do not guess - always query."}',
        description => 'Analyzes work orders, order value, and production-signal impact'
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
        attributes  => '{"instruction": "Analyze production/demand signals and manufactured part momentum for the manufacturing platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently trending manufactured parts. 2) Use TREND_SQL_TOOL to query urgent and high-momentum production signals in the last 48 hours. 3) Identify which manufacturing network accounts and platforms are driving the trends. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific manufactured part names, urgency scores, view counts, and network account handles. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "SUPPLIER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive trend analysis combining production/demand signal data and manufactured part mentions'
    );
END;
/

-- Plant Capacity Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize plant capacity and capacity for the manufacturing platform. Steps: 1) Check capacity using CHECK_INVENTORY_TOOL for requested manufactured parts. 2) If a synthetic customer and manufactured part are specified, find the best production routing option using FULFILLMENT_ROUTE_TOOL. 3) Use WORK_ORDER_SQL_TOOL to check planned and released work orders plus routing status. 4) Flag manufactured parts where capacity is below reorder point. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["WORK_ORDER_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Capacity checks and spatial production routing'
    );
END;
/

-- Manufacturing Operations Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'MANUFACTURING_OPERATIONS_TASK',
        attributes  => '{"instruction": "Analyze manufacturing operations data for the manufacturing platform. Use WORK_ORDER_SQL_TOOL to query work orders, order value, synthetic customers, and routing records. When analyzing production/demand signal impact, look for work orders where production_signal_id IS NOT NULL. Provide order value totals, work order counts, synthetic customer segments, and signal attribution metrics. Do not guess - always query the data first. User query: {query}",
                        "tools": ["WORK_ORDER_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Work order, order value, and synthetic customer analytics'
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
        team_name   => 'PRODUCTION_SIGNAL_TEAM',
        attributes  => '{"agents": [{"name": "TREND_AGENT", "task": "TREND_ANALYSIS_TASK"}],
                        "process": "sequential"}',
        description => 'Production/demand signal detection and analysis team'
    );
END;
/

-- Plant Capacity Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Production capacity and access routing team'
    );
END;
/

-- Manufacturing Operations Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'MANUFACTURING_OPERATIONS_TEAM',
        attributes  => '{"agents": [{"name": "MANUFACTURING_OPERATIONS_AGENT", "task": "MANUFACTURING_OPERATIONS_TASK"}],
                        "process": "sequential"}',
        description => 'Work order and order value analytics team'
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
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('PRODUCTION_SIGNAL_TEAM');
SELECT AI AGENT What manufactured parts are trending right now based on customer and supplier signals;
SELECT AI AGENT Which manufacturing network accounts are driving the most urgent signal posts this week;
SELECT AI AGENT Show me the top 5 manufactured parts with critical momentum;

-- ── Plant Capacity ─────────────────────────────────────────────
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check capacity levels for Servo Drive Controller AX-400 across all plants;
SELECT AI AGENT What is the best plant for a urgent capacity slot for a customer in Miami;
SELECT AI AGENT Which trending manufactured parts have critically low capacity;

-- Manufacturing Operations Intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('MANUFACTURING_OPERATIONS_TEAM');
SELECT AI AGENT How many work orders were placed in the last 24 hours and what is the total order value;
SELECT AI AGENT What percentage of recent work orders were associated with customer or supplier signals;
SELECT AI AGENT Show me order value breakdown by manufactured part category for the last 30 days;

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
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('PRODUCTION_SIGNAL_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('FULFILLMENT_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TEAM('MANUFACTURING_OPERATIONS_TEAM', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('TREND_ANALYSIS_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('FULFILLMENT_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TASK('MANUFACTURING_OPERATIONS_TASK', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('TREND_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('FULFILLMENT_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_AGENT('MANUFACTURING_OPERATIONS_AGENT', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('TREND_SQL_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('WORK_ORDER_SQL_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('DETECT_TRENDS_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('CHECK_INVENTORY_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('FULFILLMENT_ROUTE_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('SUPPLIER_NETWORK_TOOL', TRUE);
EXEC DBMS_CLOUD_AI_AGENT.DROP_TOOL('LOG_DECISION_TOOL', TRUE);
DROP FUNCTION detect_trending_products;
DROP FUNCTION check_product_inventory;
DROP FUNCTION find_best_fulfillment;
DROP FUNCTION get_supplier_network;
DROP FUNCTION log_agent_decision;
*/
