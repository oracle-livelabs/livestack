-- Retail Operations: one fixed demand-to-stock workflow in the PG schema.
-- Run after the OCI profile and 08_agent_tool_functions.sql exist.
-- PG_AGENT_PROFILE is defined by init/adb-load.sh as PG_RETAIL_AGENT_PROFILE.
SET DEFINE ON
SET VERIFY OFF
WHENEVER SQLERROR EXIT SQL.SQLCODE

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_cloud_ai_profiles
   WHERE profile_name = '&&PG_AGENT_PROFILE' AND status = 'ENABLED';
  IF v_count != 1 THEN
    RAISE_APPLICATION_ERROR(-20020, 'Retail Operations OCI profile is unavailable');
  END IF;
  SELECT COUNT(*) INTO v_count FROM user_objects
   WHERE object_type = 'FUNCTION' AND status = 'VALID'
     AND object_name IN ('GET_DEMAND_OPPORTUNITY', 'ASSESS_PRODUCT_STOCK');
  IF v_count != 2 THEN
    RAISE_APPLICATION_ERROR(-20021, 'Retail Operations tool functions are unavailable');
  END IF;
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name => q'~DEMAND_OPPORTUNITY_TOOL~',
    attributes => q'~{"instruction":"Call once without parameters. Return the structured JSON demand opportunity from the PG social signal data. A no_signal result means there is no recommendation to make.","function":"get_demand_opportunity"}~',
    description => 'Selects the strongest recent product demand signal using PG data.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
    tool_name => q'~STOCK_ASSESSMENT_TOOL~',
    attributes => q'~{"instruction":"Call once with P_PRODUCT_ID from DEMAND_SCOUT_TASK. Return structured JSON stock evidence for that exact product ID.","function":"assess_product_stock"}~',
    description => 'Checks available units and low stock sites for one PG product.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name => q'~DEMAND_SCOUT_AGENT~',
    attributes => q'~{"profile_name":"&&PG_AGENT_PROFILE","enable_human_tool":false,"role":"You identify one PeakGear product with a strong recent demand signal. Use only the assigned tool for facts. Return its JSON evidence and product ID. If no signal exists, say so. Do not call a tool again after it returns a result."}~',
    description => 'Finds one evidence-backed demand opportunity.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name => q'~STOCK_PLANNER_AGENT~',
    attributes => q'~{"profile_name":"&&PG_AGENT_PROFILE","enable_human_tool":false,"role":"You turn a demand signal into one stock response. Use only the assigned stock tool and the product ID supplied by the demand task. Cite the measured signal and stock values. Recommend review or replenishment when stock is low; otherwise recommend monitoring. Do not invent site or quantity data, and do not call a tool again after it returns a result."}~',
    description => 'Recommends a stock response for the selected product.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TASK(
    task_name => q'~DEMAND_SCOUT_TASK~',
    attributes => q'~{"enable_human_tool":false,"instruction":"For the PeakGear retail demand response, call DEMAND_OPPORTUNITY_TOOL exactly once. Return the tool JSON with product_id, product_name, signal_count, average_score, and total_reach. If status is no_signal, return that result and stop. Do not query other data. User request: {query}","tools":["DEMAND_OPPORTUNITY_TOOL"]}~',
    description => 'Selects one measured demand opportunity.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TASK(
    task_name => q'~STOCK_RESPONSE_TASK~',
    attributes => q'~{"enable_human_tool":false,"input":"DEMAND_SCOUT_TASK","instruction":"Read the upstream demand result. If it has no product_id, explain that no demand-driven stock action is available and finish. Otherwise call STOCK_ASSESSMENT_TOOL exactly once with that product_id. Report the product, signal count, average score, available units, low stock site count, and most constrained site. Recommend one specific review, replenishment, or monitoring action supported by those values. Do not retry a completed tool call.","tools":["STOCK_ASSESSMENT_TOOL"]}~',
    description => 'Uses the demand task result to recommend a stock action.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name => q'~RETAIL_RESPONSE_TEAM~',
    attributes => q'~{"agents":[{"name":"DEMAND_SCOUT_AGENT","task":"DEMAND_SCOUT_TASK"},{"name":"STOCK_PLANNER_AGENT","task":"STOCK_RESPONSE_TASK"}],"process":"sequential"}~',
    description => 'Two-agent demand signal to inventory response workflow.'
  );
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_ai_agent_tools
   WHERE tool_name IN ('DEMAND_OPPORTUNITY_TOOL', 'STOCK_ASSESSMENT_TOOL') AND status = 'ENABLED';
  IF v_count != 2 THEN RAISE_APPLICATION_ERROR(-20022, 'Retail Operations tools are incomplete'); END IF;
  SELECT COUNT(*) INTO v_count FROM user_ai_agents
   WHERE agent_name IN ('DEMAND_SCOUT_AGENT', 'STOCK_PLANNER_AGENT') AND status = 'ENABLED';
  IF v_count != 2 THEN RAISE_APPLICATION_ERROR(-20023, 'Retail Operations agents are incomplete'); END IF;
  SELECT COUNT(*) INTO v_count FROM user_ai_agent_tasks
   WHERE task_name IN ('DEMAND_SCOUT_TASK', 'STOCK_RESPONSE_TASK') AND status = 'ENABLED';
  IF v_count != 2 THEN RAISE_APPLICATION_ERROR(-20024, 'Retail Operations tasks are incomplete'); END IF;
  SELECT COUNT(*) INTO v_count FROM user_ai_agent_teams
   WHERE agent_team_name = 'RETAIL_RESPONSE_TEAM' AND status = 'ENABLED';
  IF v_count != 1 THEN RAISE_APPLICATION_ERROR(-20025, 'Retail Operations team is incomplete'); END IF;
END;
/

COMMIT;
SET DEFINE OFF
