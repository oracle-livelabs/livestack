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

COMMENT ON TABLE brands IS 'Higher Education academic programs and service lines in the student-success platform. Includes program name, category, headquarters location, service value, and signal tier ranking.';
COMMENT ON COLUMN brands.brand_name IS 'The official academic program name (e.g. Northstar Advising Network, Riverbend Enrollment Services)';
COMMENT ON COLUMN brands.social_tier IS 'Academic program signal tier: emerging, standard, premium, or critical-access.';

COMMENT ON TABLE products IS 'Student services, programs, capacity slots, and campus supply items. Each service belongs to a academic program and has a category, value proxy, and search tags.';
COMMENT ON COLUMN products.product_name IS 'Full student service name (e.g. AI Tutoring Session, Internship Placement Support)';
COMMENT ON COLUMN products.category IS 'Student service category such as Academic Support, Enrollment, Student Wellness, Career Readiness, Online Support, Learning Support, Transfer Success, or Learning Resources.';
COMMENT ON COLUMN products.unit_price IS 'Student service value or cost proxy in US dollars';
COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the student service or capacity item';

COMMENT ON TABLE fulfillment_centers IS 'Student service access centers and service hubs used for spatial routing. Each has lat/lon location, capacity, and center type.';
COMMENT ON COLUMN fulfillment_centers.center_type IS 'Baseline center type values mapped to higher education hubs: warehouse, distribution, micro, drop_ship, or store.';
COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';
COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity or campus supply levels for each student service at each access center. Tracks available, reserved, and reorder or escalation thresholds.';
COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available capacity or supply units at this campus services center';
COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending student requests, not yet completed';
COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, capacity intervention or replenishment is needed';

COMMENT ON TABLE customers IS 'Synthetic students with service addresses and risk tier. Has lat/lon for spatial campus-service routing.';
COMMENT ON COLUMN customers.customer_tier IS 'Synthetic student access tier: new, standard, preferred, or vip baseline values.';
COMMENT ON COLUMN customers.lifetime_value IS 'Synthetic lifetime service value proxy in US dollars';

COMMENT ON TABLE orders IS 'Student requests with status tracking. May link to a student/community signal that influenced demand. Assigned to a campus services center.';
COMMENT ON COLUMN orders.order_status IS 'Baseline status values for student requests: pending, confirmed, processing, shipped/routed, delivered/completed, cancelled, or returned.';
COMMENT ON COLUMN orders.order_total IS 'Total student request service value proxy in US dollars';
COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the student/community signal post_id associated with demand. NULL means organic or direct.';
COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Requested services or supplies within a student request. Each links to a student service with quantity and value proxy.';

COMMENT ON TABLE influencers IS 'Higher Education advocates and community voices. Includes reach counts, engagement rates, and computed influence scores.';
COMMENT ON COLUMN influencers.handle IS 'Advocate or community voice handle such as @student_success';
COMMENT ON COLUMN influencers.platform IS 'Platform: instagram, tiktok, twitter, youtube, or threads';
COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on community reach and engagement';
COMMENT ON COLUMN influencers.follower_count IS 'Number of followers on the platform';
COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Student and community signal posts mentioning student services or academic programs. Has engagement metrics, sentiment, and urgency/virality score.';
COMMENT ON COLUMN social_posts.post_text IS 'Full text of the student/community signal post';
COMMENT ON COLUMN social_posts.virality_score IS 'Urgency score 0-100 combining engagement velocity, amplification, and campus services relevance';
COMMENT ON COLUMN social_posts.momentum_flag IS 'Momentum: normal, rising, viral, or mega_viral';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Sentiment from -1.0 (negative) to 1.0 (positive)';
COMMENT ON COLUMN social_posts.likes_count IS 'Number of likes or hearts';
COMMENT ON COLUMN social_posts.shares_count IS 'Number of shares or reposts';
COMMENT ON COLUMN social_posts.views_count IS 'Total view count';

COMMENT ON TABLE post_product_mentions IS 'Links student/community signal posts to student services they mention. Has confidence score and detection method.';
COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';
COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted student service demand for services factoring in student/community signal momentum. social_factor > 1 means community signals are amplifying demand.';
COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this student service/region/date';
COMMENT ON COLUMN demand_forecasts.social_factor IS 'Student/community signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Service routing and dispatch records for student requests. Tracks route team, distance, cost proxy, and completion status.';
COMMENT ON COLUMN shipments.distance_km IS 'Service routing distance in kilometers';
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

-- -- Detect trending student services from student/community signal momentum
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
        WHERE sp.posted_at >= (
            SELECT MAX(posted_at) - NUMTODSINTERVAL(p_hours, 'HOUR')
            FROM social_posts
        )
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
        RETURN 'No trending student services found in the last ' || p_hours || ' hours with urgency score >= ' || p_min_score;
    END IF;
    RETURN 'Found ' || v_count || ' trending student services (last ' || p_hours || 'h):' || CHR(10) || v_result;
END;
/

-- -- Check capacity for a student service across all access centers
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
                    rec.quantity_on_hand || ' available, ' || rec.quantity_reserved || ' committed [' || rec.stock_status || ']' || CHR(10);
        v_total := v_total + rec.quantity_on_hand;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RETURN 'No capacity or supply found for student service matching: ' || p_product_name;
    END IF;
    RETURN 'Capacity for "' || p_product_name || '" across ' || v_count || ' centers (' || v_total || ' total units):' || CHR(10) || v_result;
END;
/

-- Spatial routing: nearest campus services center with capacity for a synthetic student
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
        RETURN 'No campus services center found with capacity for "' || p_product_name || '" near synthetic student "' || p_customer_email || '".';
    END IF;
    RETURN 'Top ' || v_count || ' service routing options:' || CHR(10) || v_result;
END;
/

-- -- Explore higher education advocate network and academic program relationships
CREATE OR REPLACE FUNCTION get_influencer_network(
    p_handle VARCHAR2
) RETURN VARCHAR2 AS
    v_result CLOB := '';
    v_info   VARCHAR2(500);
BEGIN
    BEGIN
        SELECT 'Advocate: ' || display_name || ' (' || handle || ') - ' ||
               platform || ', ' || follower_count || ' followers, score ' || influence_score ||
               ', niche: ' || niche
        INTO v_info
        FROM influencers WHERE handle = p_handle;
        v_result := v_info || CHR(10) || CHR(10);
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN 'Advocate not found: ' || p_handle;
    END;

    v_result := v_result || 'Connected higher education advocates:' || CHR(10);
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

    v_result := v_result || CHR(10) || 'Academic program relationships:' || CHR(10);
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
                    ') - ' || rec.post_count || ' signal posts, $' || rec.revenue || ' service value attributed' || CHR(10);
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

-- Tool 1: SQL tool for student/community signal queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'TREND_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS tables. Use for student/community signal posts, trending student services, advocate activity, signal momentum, and engagement metrics. Key columns: virality_score/urgency score, momentum_flag (normal/rising/viral/mega_viral), sentiment_score, likes_count, shares_count, views_count, influence_score, follower_count.'
    );
END;
/

-- Tool 2: SQL tool for student-success operations and access queries
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'COMMERCE_SQL_TOOL',
        attributes  => '{"tool_type": "SQL",
                        "tool_params": {"profile_name": "SC_COHERE_PROFILE"}}',
        description => 'Query ORDERS, ORDER_ITEMS, CUSTOMERS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, DEMAND_FORECASTS tables. Use for student request lookups, service value, capacity levels, routing status, synthetic student info, and demand predictions. order_status uses baseline values pending/confirmed/processing/shipped/delivered/cancelled/returned. social_source_id NOT NULL means signal-influenced student request.'
    );
END;
/

-- Tool 3: Function - trending student services detector
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'DETECT_TRENDS_TOOL',
        attributes  => '{"instruction": "Detect trending student services from student/community signal momentum. Parameters: P_HOURS (default 48) how far back to scan, P_MIN_SCORE (default 50) minimum urgency score. Returns student service names, academic programs, mention counts, urgency, view counts, and peak momentum.",
                        "function": "detect_trending_products"}',
        description => 'Scans recent student/community signal posts to find student services with rising or urgent momentum'
    );
END;
/

-- Tool 4: Function — capacity checker
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'CHECK_INVENTORY_TOOL',
        attributes  => '{"instruction": "Check capacity levels for a student service across all campus service centers. Parameter: P_PRODUCT_NAME (partial service name match, e.g. AI Tutoring Session or Student Emergency Fund). Returns center name, location, available capacity, committed capacity, and capacity status (OK/LOW/CRITICAL).",
                        "function": "check_product_inventory"}',
        description => 'Checks capacity or supply levels for a student service at all active campus service centers'
    );
END;
/

-- Tool 5: Function - spatial campus services routing
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'FULFILLMENT_ROUTE_TOOL',
        attributes  => '{"instruction": "Find the best campus services center for a student service and synthetic student using Oracle Spatial distance calculations. Parameters: P_CUSTOMER_EMAIL (partial match), P_PRODUCT_NAME (partial service match). Returns top 3 nearest centers with distance in miles, estimated routing hours, and capacity levels.",
                        "function": "find_best_fulfillment"}',
        description => 'Spatial routing to find nearest campus services center with capacity for a synthetic student. Returns distance in miles.'
    );
END;
/

-- Tool 6: Function - higher education advocate network explorer
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'INFLUENCER_NETWORK_TOOL',
        attributes  => '{"instruction": "Explore a higher education advocate network and academic program relationships from graph data. Parameter: P_HANDLE (exact handle such as @student_success). Returns advocate profile, connected advocates with connection type and strength, and academic program relationships with attributed service value.",
                        "function": "get_influencer_network"}',
        description => 'Explores higher education advocate connections and academic program relationships from graph data'
    );
END;
/

-- Tool 7: Function — audit trail logger
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
        tool_name   => 'LOG_DECISION_TOOL',
        attributes  => '{"instruction": "Log an agent decision to the audit trail for compliance. Parameters: P_AGENT_NAME (which agent), P_ACTION_TYPE (what action), P_ENTITY_TYPE (student, student_service, service_request, campus_service_site, signal_post, or capacity), P_REASONING (explanation). Always call this after making a recommendation.",
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
                        "role": "You are a student-signal analyst for a higher education student-success platform. Your job is to detect emerging student service demand from student/community signal data, identify which services are showing urgent momentum, and explain WHY demand is rising — which advocates, which platforms, what engagement patterns. Use TREND_SQL_TOOL to query student signal posts, higher education advocates, and student service mentions. Use DETECT_TRENDS_TOOL for quick trend summaries. Always provide specific numbers and data. After analysis, log findings using LOG_DECISION_TOOL."}',
        description => 'Detects and analyzes student/community signal trends for student services'
    );
END;
/

-- Capacity & Campus Services Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'FULFILLMENT_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a campus services optimizer for a higher education student-success platform. Check capacity levels, find the best campus service sites for student requests using spatial routing, and identify capacity shortages for high-demand services. Use CHECK_INVENTORY_TOOL for capacity levels, FULFILLMENT_ROUTE_TOOL for optimal service routing options, and COMMERCE_SQL_TOOL for student requests and routing records. When capacity is low for a trending student service, recommend pre-positioning. Always log recommendations using LOG_DECISION_TOOL."}',
        description => 'Optimizes service capacity and access routing'
    );
END;
/

-- Student Success Operations Intelligence Agent
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
        agent_name  => 'COMMERCE_AGENT',
        attributes  => '{"profile_name": "SC_COHERE_PROFILE",
                        "role": "You are a student-success operations analyst for a higher education platform. Analyze student requests, service value, student behavior, and the impact of student/community signals on student service demand. Use COMMERCE_SQL_TOOL to query student requests, synthetic students, and service value. Student requests where social_source_id IS NOT NULL are driven or influenced by student/community signals. Provide service value breakdowns, student request trends, synthetic student insights with specific numbers. Do not guess — always query."}',
        description => 'Analyzes student requests, service value, and student-signal impact'
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
        attributes  => '{"instruction": "Analyze student/community signals and student service momentum for the higher education platform. Steps: 1) Use DETECT_TRENDS_TOOL to find currently trending student services. 2) Use TREND_SQL_TOOL to query urgent and high-momentum student signal posts in the last 48 hours. 3) Identify which higher education advocates and platforms are driving the trends. 4) Log your analysis using LOG_DECISION_TOOL. Provide specific student service names, urgency scores, view counts, and advocate handles. User query: {query}",
                        "tools": ["TREND_SQL_TOOL", "DETECT_TRENDS_TOOL", "INFLUENCER_NETWORK_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Comprehensive trend analysis combining student/community signal data and student service mentions'
    );
END;
/

-- Campus Services Optimization Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'FULFILLMENT_TASK',
        attributes  => '{"instruction": "Optimize campus services and capacity for the higher education platform. Steps: 1) Check capacity using CHECK_INVENTORY_TOOL for requested student services. 2) If a synthetic student and student service are specified, find the best service routing option using FULFILLMENT_ROUTE_TOOL. 3) Use COMMERCE_SQL_TOOL to check pending student requests and routing status. 4) Flag student services where capacity is below intervention threshold. 5) Log recommendations using LOG_DECISION_TOOL. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "CHECK_INVENTORY_TOOL", "FULFILLMENT_ROUTE_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Capacity checks and spatial service routing'
    );
END;
/

-- Student Success Operations Intelligence Task
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TASK(
        task_name   => 'COMMERCE_TASK',
        attributes  => '{"instruction": "Analyze student-success operations data for the higher education platform. Use COMMERCE_SQL_TOOL to query student requests, service value, synthetic students, and routing records. When analyzing student/community signal impact, look for student requests where social_source_id IS NOT NULL. Provide service value totals, student request counts, synthetic student segments, and signal attribution metrics. Do not guess — always query the data first. User query: {query}",
                        "tools": ["COMMERCE_SQL_TOOL", "LOG_DECISION_TOOL"]}',
        description => 'Student request, service value, and synthetic student analytics'
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
        description => 'Student/community signal detection and analysis team'
    );
END;
/

-- Campus Services Optimization Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'FULFILLMENT_TEAM',
        attributes  => '{"agents": [{"name": "FULFILLMENT_AGENT", "task": "FULFILLMENT_TASK"}],
                        "process": "sequential"}',
        description => 'Service capacity and access routing team'
    );
END;
/

-- Student Success Operations Intelligence Team
BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
        team_name   => 'COMMERCE_TEAM',
        attributes  => '{"agents": [{"name": "COMMERCE_AGENT", "task": "COMMERCE_TASK"}],
                        "process": "sequential"}',
        description => 'Student request and service value analytics team'
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
SELECT AI AGENT What student services are trending right now based on student and community signals;
SELECT AI AGENT Which higher education advocates are driving the most urgent signal posts this week;
SELECT AI AGENT Show me the top 5 student services with critical momentum;

-- ── Campus Services ─────────────────────────────────────────────
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('FULFILLMENT_TEAM');
SELECT AI AGENT Check capacity levels for AI Tutoring Session across all campus service sites;
SELECT AI AGENT What is the best campus service site for a same-day campus center slot for a student in Miami;
SELECT AI AGENT Which trending student services have critically low capacity;

-- Student Success Operations Intelligence
EXEC DBMS_CLOUD_AI_AGENT.SET_TEAM('COMMERCE_TEAM');
SELECT AI AGENT How many student requests were placed in the last 24 hours and what is the total service value;
SELECT AI AGENT What percentage of recent student requests were associated with student or community signals;
SELECT AI AGENT Show me service value breakdown by student service category for the last 30 days;

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
