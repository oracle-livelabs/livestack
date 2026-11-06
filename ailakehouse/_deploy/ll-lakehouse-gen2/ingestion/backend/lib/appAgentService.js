const db = require('../config/database');
const { fetchRuntimeStatus } = require('./selectAiService');

const NATIVE_AGENT_CACHE_TTL_MS = 2 * 60 * 1000;
const AGENT_PROFILE_NAME = 'PG_RETAIL_AGENT_PROFILE';
const AGENT_MODEL = 'xai.grok-4.3';
const DEFAULT_NATIVE_AGENT_CALL_TIMEOUT_MS = 45000;
const TOOL_CALL_TIMEOUT_MS = 15000;

const TEAM_CONFIG = {
  RETAIL_RESPONSE_TEAM: {
    intent: 'retail_response',
    description: 'Two agents turn a measured demand signal into an inventory response.',
  },
};

const EXPECTED_TOOLS = [
  'DEMAND_OPPORTUNITY_TOOL',
  'STOCK_ASSESSMENT_TOOL',
];

const EXPECTED_FUNCTIONS = [
  'GET_DEMAND_OPPORTUNITY',
  'ASSESS_PRODUCT_STOCK',
];

let nativeAgentCache = {
  expiresAt: 0,
  value: null,
  promise: null,
};

function cleanText(value) {
  if (Array.isArray(value)) return cleanText(value[0]);
  return String(value || '').trim();
}

function normalizeName(value, fallback = '') {
  return cleanText(value || fallback).toUpperCase();
}

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readLobValue(value) {
  if (value && typeof value.getData === 'function') {
    return value.getData();
  }
  return value;
}

function unavailableStatus(reason, details = {}) {
  return {
    available: false,
    connected: false,
    enabled: false,
    runtime: 'unavailable',
    source: 'app_db',
    reason,
    profileName: details.profileName || AGENT_PROFILE_NAME,
    ...details,
  };
}

async function withConnection(callback) {
  let connection;
  try {
    connection = await db.getConnection();
    return await callback(connection);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) { /* ignore close failures */ }
    }
  }
}

async function fetchAgentPackageStatus(connection) {
  const result = await connection.execute(
    `SELECT object_name
     FROM all_objects
     WHERE owner IN ('SYS', 'C##CLOUD$SERVICE')
       AND object_type = 'PACKAGE'
       AND object_name IN ('DBMS_CLOUD_AI_AGENT')`,
    {},
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );
  return new Set((result.rows || []).map((row) => String(row.OBJECT_NAME || '').toUpperCase()));
}

async function fetchNativeInventory(connection, profileName) {
  const result = await connection.execute(`
    SELECT
      (SELECT status
       FROM user_cloud_ai_profiles
       WHERE profile_name = :profileName) AS profile_status,
      (SELECT DBMS_LOB.SUBSTR(attribute_value, 200, 1)
       FROM user_cloud_ai_profile_attributes
       WHERE profile_name = :profileName
         AND attribute_name = 'model') AS profile_model,
      (SELECT COUNT(*)
       FROM user_ai_agent_tools
       WHERE tool_name IN (${EXPECTED_TOOLS.map((_, index) => `:tool${index}`).join(', ')})
         AND status = 'ENABLED') AS enabled_tool_count,
      (SELECT COUNT(*)
       FROM user_objects
       WHERE object_type = 'FUNCTION'
         AND object_name IN (${EXPECTED_FUNCTIONS.map((_, index) => `:func${index}`).join(', ')})
         AND status = 'VALID') AS valid_function_count,
      (SELECT COUNT(*)
       FROM user_ai_agents
       WHERE agent_name IN ('DEMAND_SCOUT_AGENT', 'STOCK_PLANNER_AGENT')
         AND status = 'ENABLED') AS enabled_agent_count,
      (SELECT COUNT(*)
       FROM user_ai_agent_tasks
       WHERE task_name IN ('DEMAND_SCOUT_TASK', 'STOCK_RESPONSE_TASK')
         AND status = 'ENABLED') AS enabled_task_count,
      (SELECT COUNT(*)
       FROM user_ai_agent_teams
       WHERE agent_team_name = 'RETAIL_RESPONSE_TEAM'
         AND status = 'ENABLED') AS enabled_team_count
    FROM dual`,
    {
      profileName,
      ...Object.fromEntries(EXPECTED_TOOLS.map((tool, index) => [`tool${index}`, tool])),
      ...Object.fromEntries(EXPECTED_FUNCTIONS.map((fn, index) => [`func${index}`, fn])),
    },
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );

  const row = result.rows?.[0] || {};
  return {
    profileStatus: row.PROFILE_STATUS || null,
    profileModel: row.PROFILE_MODEL || null,
    enabledToolCount: Number(row.ENABLED_TOOL_COUNT || 0),
    validFunctionCount: Number(row.VALID_FUNCTION_COUNT || 0),
    enabledAgentCount: Number(row.ENABLED_AGENT_COUNT || 0),
    enabledTaskCount: Number(row.ENABLED_TASK_COUNT || 0),
    enabledTeamCount: Number(row.ENABLED_TEAM_COUNT || 0),
  };
}

function inventoryReady(inventory) {
  return String(inventory.profileStatus || '').toUpperCase() === 'ENABLED'
    && inventory.profileModel === AGENT_MODEL
    && inventory.enabledToolCount >= EXPECTED_TOOLS.length
    && inventory.validFunctionCount >= EXPECTED_FUNCTIONS.length
    && inventory.enabledAgentCount >= 2
    && inventory.enabledTaskCount >= 2
    && inventory.enabledTeamCount >= 1;
}

async function ensureNativeAgentRuntime({ force = false } = {}) {
  const now = Date.now();
  if (!force && nativeAgentCache.value && nativeAgentCache.expiresAt > now) {
    return nativeAgentCache.value;
  }
  if (!force && nativeAgentCache.promise) {
    return nativeAgentCache.promise;
  }

  nativeAgentCache.promise = (async () => {
    const selectAiStatus = await fetchRuntimeStatus({ force, verify: true });
    const profileName = AGENT_PROFILE_NAME;

    if (!selectAiStatus.available || selectAiStatus.runtime !== 'select_ai') {
      return unavailableStatus('select_ai_unavailable', {
        profileName,
        selectAiStatus,
        model: selectAiStatus.model,
      });
    }

    try {
      return await withConnection(async (connection) => {
        const packages = await fetchAgentPackageStatus(connection);
        if (!packages.has('DBMS_CLOUD_AI_AGENT')) {
          return unavailableStatus('missing_database_packages', {
            profileName,
            missingPackages: ['DBMS_CLOUD_AI_AGENT'],
            selectAiStatus,
          });
        }

        let inventory;
        try {
          inventory = await fetchNativeInventory(connection, profileName);
        } catch (err) {
          return unavailableStatus('agent_metadata_unavailable', {
            profileName,
            error: err.message,
            code: err.code,
            errorNum: err.errorNum,
            selectAiStatus,
          });
        }

        if (!inventoryReady(inventory)) {
          return unavailableStatus('agent_not_ready', {
            profileName,
            inventory,
            selectAiStatus,
          });
        }

        return {
          available: true,
          connected: true,
          enabled: true,
          runtime: 'select_ai_agent',
          source: 'app_db',
          profileName,
          model: inventory.profileModel,
          provider: 'OCI GenAI',
          teamNames: Object.keys(TEAM_CONFIG),
          toolNames: EXPECTED_TOOLS,
          functionNames: EXPECTED_FUNCTIONS,
          inventory,
          selectAiStatus,
        };
      });
    } catch (err) {
      return unavailableStatus('agent_setup_failed', {
        profileName,
        error: err.message,
        code: err.code,
        errorNum: err.errorNum,
        selectAiStatus,
      });
    }
  })();

  try {
    const status = await nativeAgentCache.promise;
    nativeAgentCache = { expiresAt: Date.now() + NATIVE_AGENT_CACHE_TTL_MS, value: status, promise: null };
    return status;
  } catch (err) {
    nativeAgentCache = { expiresAt: 0, value: null, promise: null };
    throw err;
  }
}

function buildNativeAgentPrompt({ question, intent, conversationId }) {
  return [
    `Conversation id: ${conversationId}`,
    `Workflow: ${intent}`,
    'Identify one recent product demand signal, then check inventory for that exact product ID.',
    'Use the two registered PG tools for facts. Return one evidence-backed stock action.',
    `User request: ${question}`,
  ].join('\n');
}

async function fetchNativeToolHistory(connection, teamName, conversationId) {
  const result = await connection.execute(`
    SELECT h.tool_name, TO_CHAR(h.start_date, 'HH24:MI:SS') AS called_at,
           DBMS_LOB.SUBSTR(h.output, 500, 1) AS result_preview
    FROM user_ai_agent_tool_history h
    WHERE h.team_exec_id = (
      SELECT team_exec_id
      FROM user_ai_agent_team_history
      WHERE team_name = :teamName AND conversation_id = :conversationId
      ORDER BY start_date DESC
      FETCH FIRST 1 ROW ONLY
    )
    ORDER BY h.start_date`,
    { teamName, conversationId },
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows || [];
}

async function runStructuredTool(connection, toolName, input) {
  const result = await connection.execute(
    'SELECT DBMS_CLOUD_AI_AGENT.RUN_TOOL(:toolName, :input) AS result FROM dual',
    { toolName, input: JSON.stringify(input) },
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );
  const envelope = JSON.parse(await readLobValue(result.rows?.[0]?.RESULT));
  if (envelope.status !== 'success' || typeof envelope.result !== 'string') {
    throw new Error(`${toolName} did not return a successful result`);
  }
  return JSON.parse(envelope.result);
}

async function recoverTimedOutAgent({ question, teamName, intent, runtime, conversationId, startTime }) {
  // ADB can complete both tools but leave RUN_TEAM waiting on its final model response.
  // On NJS-123 only, re-run the two read-only registered tools with the same VPD user
  // context on a fresh connection. Never label this result as a completed agent run.
  return withConnection(async (connection) => {
    connection.callTimeout = TOOL_CALL_TIMEOUT_MS;
    const demand = await runStructuredTool(connection, 'DEMAND_OPPORTUNITY_TOOL', {});
    let stock = null;
    if (demand.status === 'found' && Number.isInteger(Number(demand.product_id))) {
      stock = await runStructuredTool(connection, 'STOCK_ASSESSMENT_TOOL', { P_PRODUCT_ID: Number(demand.product_id) });
      if (stock.status !== 'found' || Number(stock.product_id) !== Number(demand.product_id)) {
        throw new Error('Stock tool did not return the selected product');
      }
    } else if (demand.status !== 'no_signal') {
      throw new Error('Demand tool did not return a usable product');
    }

    const response = stock
      ? `${demand.product_name} has ${demand.signal_count} recent demand signal(s), average score ${demand.average_score}, and reach ${demand.total_reach}. `
        + `Across ${stock.active_sites} active sites, ${stock.available_units} units are available after ${stock.reserved_units} reservations. `
        + (stock.low_stock_sites > 0
          ? `${stock.low_stock_sites} site(s) are at or below their reorder point. Review replenishment or allocation at ${stock.most_constrained_site}.`
          : 'No sites are at or below their reorder point; monitor the signal and current stock.')
      : 'No qualifying recent demand signal was found, so there is no product-specific stock action to recommend.';

    return {
      question,
      team: teamName,
      intent,
      agentUsed: false,
      runtime: 'oracle_tool_response',
      runtimeLabel: 'Oracle tool response',
      provider: 'OCI GenAI',
      profile: runtime.profileName,
      model: runtime.model,
      source: 'app_db',
      response,
      executionNote: 'The agent team did not finish its final response. This answer uses the registered Oracle database tools directly.',
      data: { demand, stock },
      toolsUsed: [
        { tool: 'DEMAND_OPPORTUNITY_TOOL', status: 'success' },
        ...(stock ? [{ tool: 'STOCK_ASSESSMENT_TOOL', status: 'success' }] : []),
      ],
      conversationId,
      elapsed: Date.now() - startTime,
    };
  });
}

async function runNativeAgentQuestion({ question, team, intent }) {
  const runtime = await ensureNativeAgentRuntime();
  if (!runtime.available) {
    return null;
  }

  const teamName = normalizeName(team, 'RETAIL_RESPONSE_TEAM');
  if (!TEAM_CONFIG[teamName]) {
    const err = new Error(`Unsupported native agent team: ${teamName}`);
    err.statusCode = 400;
    err.nativeRuntimeAvailable = true;
    throw err;
  }

  const startTime = Date.now();
  let conversationId;

  try {
    return await withConnection(async (connection) => {
    try {
      // RUN_TEAM requires a conversation registered in ADB, not an arbitrary UUID.
      const conversationResult = await connection.execute(
        'SELECT DBMS_CLOUD_AI.CREATE_CONVERSATION() AS conversation_id FROM dual',
        {},
        { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
      );
      conversationId = conversationResult.rows[0].CONVERSATION_ID;
      const prompt = buildNativeAgentPrompt({
        question,
        intent: intent || TEAM_CONFIG[teamName].intent,
        conversationId,
      });
      const params = JSON.stringify({
        conversation_id: conversationId,
        source: 'agents_page',
        intent: intent || TEAM_CONFIG[teamName].intent,
      });
      const previousCallTimeout = connection.callTimeout;
      connection.callTimeout = numberEnv('NATIVE_AGENT_CALL_TIMEOUT_MS', DEFAULT_NATIVE_AGENT_CALL_TIMEOUT_MS);
      const result = await connection.execute(`
        BEGIN
          :response := DBMS_CLOUD_AI_AGENT.RUN_TEAM(
                         team_name   => :teamName,
                         user_prompt => :prompt,
                         params      => :params
                       );
        END;`,
        {
          response: { dir: db.oracledb.BIND_OUT, type: db.oracledb.CLOB },
          teamName,
          prompt,
          params,
        },
        {
          outFormat: db.oracledb.OUT_FORMAT_OBJECT,
        }
      );
      connection.callTimeout = previousCallTimeout;

      const response = cleanText(await readLobValue(result.outBinds?.response));
      const toolHistory = await fetchNativeToolHistory(connection, teamName, conversationId);

      return {
        question,
        team: teamName,
        intent: intent || TEAM_CONFIG[teamName].intent,
        agentUsed: true,
        runtime: 'select_ai_agent',
        runtimeLabel: 'Oracle Select AI Agent',
        provider: 'OCI GenAI',
        profile: runtime.profileName,
        model: runtime.model,
        source: 'app_db',
        response: response || 'The Select AI Agent completed the request but did not return a message.',
        data: null,
        toolsUsed: [
          {
            tool: 'Select AI Agent orchestration',
            technicalTool: 'DBMS_CLOUD_AI_AGENT.RUN_TEAM',
            team: teamName,
            status: 'success',
          },
          ...toolHistory.map((entry) => ({
            tool: entry.TOOL_NAME,
            status: 'success',
            reason: cleanText(entry.RESULT_PREVIEW) || 'completed',
          })),
        ],
        toolHistory,
        elapsed: Date.now() - startTime,
      };
    } catch (err) {
      try { connection.callTimeout = 0; } catch (_) { /* ignore timeout reset failures */ }
      err.nativeRuntimeAvailable = true;
      throw err;
    }
    });
  } catch (err) {
    if (err.code !== 'NJS-123' || !conversationId) throw err;
    return recoverTimedOutAgent({
      question, teamName, intent: intent || TEAM_CONFIG[teamName].intent,
      runtime, conversationId, startTime,
    });
  }
}

function nativeProfileCatalogEntry(status) {
  return {
    name: status.profileName,
    status: 'ENABLED',
    model: status.model,
    provider: 'OCI GenAI',
    type: 'Oracle Select AI Agent',
    description: 'Native DBMS_CLOUD_AI_AGENT workflow over the app database PG schema',
    runtime: 'select_ai_agent',
    runtimeLabel: 'Oracle Select AI Agent',
  };
}

function nativeTeams(status) {
  const native = Boolean(status?.available);
  return Object.entries(TEAM_CONFIG).map(([teamName, config]) => ({
    TEAM_NAME: teamName,
    STATUS: native ? 'ENABLED' : 'UNAVAILABLE',
    DESCRIPTION: config.description,
    RUNTIME: native ? 'select_ai_agent' : 'unavailable',
  }));
}

module.exports = {
  ensureNativeAgentRuntime,
  runNativeAgentQuestion,
  nativeProfileCatalogEntry,
  nativeTeams,
  TEAM_CONFIG,
};
