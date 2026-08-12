const crypto = require('crypto');
const db = require('../config/database');
const { fetchRuntimeStatus } = require('./selectAiService');

const NATIVE_AGENT_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_PROFILE_NAME = 'PG_GENAI_PROFILE';
const DEFAULT_NATIVE_AGENT_CALL_TIMEOUT_MS = 15000;

const TEAM_CONFIG = {
  SOCIAL_TREND_TEAM: {
    intent: 'trends',
    agent: 'TREND_AGENT',
    task: 'TREND_ANALYSIS_TASK',
    description: 'Native Select AI Agent team for demand signal sensing.',
  },
  FULFILLMENT_TEAM: {
    intent: 'fulfillment',
    agent: 'FULFILLMENT_AGENT',
    task: 'FULFILLMENT_TASK',
    description: 'Native Select AI Agent team for inventory and fulfillment routing.',
  },
  COMMERCE_TEAM: {
    intent: 'commerce',
    agent: 'COMMERCE_AGENT',
    task: 'COMMERCE_TASK',
    description: 'Native Select AI Agent team for customer orders and revenue.',
  },
};

const EXPECTED_TOOLS = [
  'TREND_SQL_TOOL',
  'COMMERCE_SQL_TOOL',
  'DETECT_TRENDS_TOOL',
  'CHECK_INVENTORY_TOOL',
  'FULFILLMENT_ROUTE_TOOL',
  'INFLUENCER_NETWORK_TOOL',
  'LOG_DECISION_TOOL',
];

const EXPECTED_FUNCTIONS = [
  'DETECT_TRENDING_PRODUCTS',
  'CHECK_PRODUCT_INVENTORY',
  'FIND_BEST_FULFILLMENT',
  'GET_INFLUENCER_NETWORK',
  'LOG_AGENT_DECISION',
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

function envFlagEnabled(name, defaultValue = true) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || rawValue === '') return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(String(rawValue).trim().toLowerCase());
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
    runtime: 'ollama',
    source: 'app_db',
    reason,
    profileName: details.profileName || normalizeName(process.env.APP_AI_PROFILE_NAME || process.env.OCI_AI_PROFILE_NAME, DEFAULT_PROFILE_NAME),
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
       WHERE agent_name IN ('TREND_AGENT', 'FULFILLMENT_AGENT', 'COMMERCE_AGENT')
         AND status = 'ENABLED') AS enabled_agent_count,
      (SELECT COUNT(*)
       FROM user_ai_agent_tasks
       WHERE task_name IN ('TREND_ANALYSIS_TASK', 'FULFILLMENT_TASK', 'COMMERCE_TASK')
         AND status = 'ENABLED') AS enabled_task_count,
      (SELECT COUNT(*)
       FROM user_ai_agent_teams
       WHERE agent_team_name IN ('SOCIAL_TREND_TEAM', 'FULFILLMENT_TEAM', 'COMMERCE_TEAM')
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
    enabledToolCount: Number(row.ENABLED_TOOL_COUNT || 0),
    validFunctionCount: Number(row.VALID_FUNCTION_COUNT || 0),
    enabledAgentCount: Number(row.ENABLED_AGENT_COUNT || 0),
    enabledTaskCount: Number(row.ENABLED_TASK_COUNT || 0),
    enabledTeamCount: Number(row.ENABLED_TEAM_COUNT || 0),
  };
}

function inventoryReady(inventory) {
  return String(inventory.profileStatus || '').toUpperCase() === 'ENABLED'
    && inventory.enabledToolCount >= EXPECTED_TOOLS.length
    && inventory.validFunctionCount >= EXPECTED_FUNCTIONS.length
    && inventory.enabledAgentCount >= 3
    && inventory.enabledTaskCount >= 3
    && inventory.enabledTeamCount >= 3;
}

function sqlToolAttributes(profileName) {
  return JSON.stringify({
    tool_type: 'SQL',
    tool_params: { profile_name: profileName },
  });
}

function functionToolAttributes(instruction, functionName) {
  return JSON.stringify({
    instruction,
    function: functionName,
  });
}

async function executeAgentDdl(connection, sql, binds = {}) {
  await connection.execute(sql, binds, {
    outFormat: db.oracledb.OUT_FORMAT_OBJECT,
    autoCommit: true,
  });
}

async function dropNativeAgentObjects(connection) {
  const statements = [
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TEAM('SOCIAL_TREND_TEAM', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TEAM('FULFILLMENT_TEAM', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TEAM('COMMERCE_TEAM', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TASK('TREND_ANALYSIS_TASK', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TASK('FULFILLMENT_TASK', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TASK('COMMERCE_TASK', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_AGENT('TREND_AGENT', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_AGENT('FULFILLMENT_AGENT', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    `BEGIN DBMS_CLOUD_AI_AGENT.DROP_AGENT('COMMERCE_AGENT', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`,
    ...EXPECTED_TOOLS.map((tool) => `BEGIN DBMS_CLOUD_AI_AGENT.DROP_TOOL('${tool}', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;`),
  ];

  for (const statement of statements) {
    await executeAgentDdl(connection, statement);
  }
}

async function createTool(connection, { name, attributes, description }) {
  await executeAgentDdl(
    connection,
    `BEGIN
       DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
         tool_name   => :name,
         attributes  => :attributes,
         description => :description
       );
     END;`,
    { name, attributes, description }
  );
}

async function createAgent(connection, { name, attributes, description }) {
  await executeAgentDdl(
    connection,
    `BEGIN
       DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
         agent_name  => :name,
         attributes  => :attributes,
         description => :description
       );
     END;`,
    { name, attributes, description }
  );
}

async function createTask(connection, { name, attributes, description }) {
  await executeAgentDdl(
    connection,
    `BEGIN
       DBMS_CLOUD_AI_AGENT.CREATE_TASK(
         task_name   => :name,
         attributes  => :attributes,
         description => :description
       );
     END;`,
    { name, attributes, description }
  );
}

async function createTeam(connection, { name, attributes, description }) {
  await executeAgentDdl(
    connection,
    `BEGIN
       DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
         team_name   => :name,
         attributes  => :attributes,
         description => :description
       );
     END;`,
    { name, attributes, description }
  );
}

async function createNativeAgentObjects(connection, profileName) {
  await dropNativeAgentObjects(connection);

  await createTool(connection, {
    name: 'TREND_SQL_TOOL',
    attributes: sqlToolAttributes(profileName),
    description: 'Read-only SQL over SOCIAL_POSTS, POST_PRODUCT_MENTIONS, PRODUCTS, BRANDS, and INFLUENCERS for demand sensing, source activity, audience reach, signal tone, and product momentum.',
  });
  await createTool(connection, {
    name: 'COMMERCE_SQL_TOOL',
    attributes: sqlToolAttributes(profileName),
    description: 'Read-only SQL over ORDERS, ORDER_ITEMS, CUSTOMERS, INVENTORY, FULFILLMENT_CENTERS, SHIPMENTS, and DEMAND_FORECASTS for revenue, fulfillment, routing, and inventory questions.',
  });
  await createTool(connection, {
    name: 'DETECT_TRENDS_TOOL',
    attributes: functionToolAttributes('Detect emerging demand signals. Parameters: P_HOURS and P_MIN_SCORE. Return product names, brands, signal counts, reach, demand priority, and signal intensity.', 'detect_trending_products'),
    description: 'Finds products with elevated demand signals in the app database.',
  });
  await createTool(connection, {
    name: 'CHECK_INVENTORY_TOOL',
    attributes: functionToolAttributes('Check inventory for a product across active fulfillment sites. Parameter: P_PRODUCT_NAME. Return on-hand, reserved, and capacity status.', 'check_product_inventory'),
    description: 'Checks app database inventory levels for a PeakGear product.',
  });
  await createTool(connection, {
    name: 'FULFILLMENT_ROUTE_TOOL',
    attributes: functionToolAttributes('Find the nearest eligible fulfillment sites with capacity. Parameters: P_CUSTOMER_EMAIL and P_PRODUCT_NAME. Return site, distance, estimate, and available inventory.', 'find_best_fulfillment'),
    description: 'Uses Oracle Spatial in the app database for fulfillment routing.',
  });
  await createTool(connection, {
    name: 'INFLUENCER_NETWORK_TOOL',
    attributes: functionToolAttributes('Explore connected demand signal feeds and brand relationships. Parameter: P_HANDLE. Return source details, connected feeds, and related brands.', 'get_influencer_network'),
    description: 'Explores signal source relationships from app database graph tables.',
  });
  await createTool(connection, {
    name: 'LOG_DECISION_TOOL',
    attributes: functionToolAttributes('Log the final recommendation or action. Parameters: P_AGENT_NAME, P_ACTION_TYPE, P_ENTITY_TYPE, and P_REASONING. Use this after every actionable recommendation.', 'log_agent_decision'),
    description: 'Writes native agent recommendations to the app database audit trail.',
  });

  await createAgent(connection, {
    name: 'TREND_AGENT',
    attributes: JSON.stringify({
      profile_name: profileName,
      role: 'You are a PeakGear retail demand sensing agent. Use app database tables only. Detect emerging product demand, explain the source channels, quantify audience reach and signal intensity, and recommend the next merchandising or allocation action. Use tools for facts. Do not invent data.',
    }),
    description: 'Native Select AI Agent for retail demand sensing.',
  });
  await createAgent(connection, {
    name: 'FULFILLMENT_AGENT',
    attributes: JSON.stringify({
      profile_name: profileName,
      role: 'You are a PeakGear fulfillment operations agent. Use app database tables only. Check inventory, identify capacity risks, find eligible fulfillment sites, and recommend service or replenishment actions. Use tools for facts. Do not invent data.',
    }),
    description: 'Native Select AI Agent for inventory and fulfillment operations.',
  });
  await createAgent(connection, {
    name: 'COMMERCE_AGENT',
    attributes: JSON.stringify({
      profile_name: profileName,
      role: 'You are a PeakGear commerce intelligence agent. Use app database tables only. Analyze customer orders, revenue, product categories, brands, and demand attribution. Use tools for facts. Do not invent data.',
    }),
    description: 'Native Select AI Agent for customer orders and revenue.',
  });

  await createTask(connection, {
    name: 'TREND_ANALYSIS_TASK',
    attributes: JSON.stringify({
      instruction: 'Analyze the PeakGear retail demand question. User query: {query}. Required flow: 1. Use DETECT_TRENDS_TOOL or TREND_SQL_TOOL to ground the answer in app database rows. 2. Identify products, categories, source channels, reach, signal tone, and signal intensity when relevant. 3. Recommend one operational action such as review allocation, check store stock, coordinate campaign, or watch substitute items. 4. Use LOG_DECISION_TOOL to log the recommendation. Keep the final answer concise and business-facing.',
      tools: ['TREND_SQL_TOOL', 'DETECT_TRENDS_TOOL', 'INFLUENCER_NETWORK_TOOL', 'LOG_DECISION_TOOL'],
    }),
    description: 'Demand sensing task using app database signal data.',
  });
  await createTask(connection, {
    name: 'FULFILLMENT_TASK',
    attributes: JSON.stringify({
      instruction: 'Handle the PeakGear fulfillment or inventory question. User query: {query}. Required flow: 1. Use CHECK_INVENTORY_TOOL for product inventory questions. 2. If a customer and product are specified, use FULFILLMENT_ROUTE_TOOL. 3. Use COMMERCE_SQL_TOOL for order, shipment, and fulfillment center context. 4. Recommend one operational action such as replenish, pre-position inventory, route from a site, or investigate stock risk. 5. Use LOG_DECISION_TOOL to log the recommendation. Keep the final answer concise and business-facing.',
      tools: ['COMMERCE_SQL_TOOL', 'CHECK_INVENTORY_TOOL', 'FULFILLMENT_ROUTE_TOOL', 'LOG_DECISION_TOOL'],
    }),
    description: 'Fulfillment and inventory task using app database operations data.',
  });
  await createTask(connection, {
    name: 'COMMERCE_TASK',
    attributes: JSON.stringify({
      instruction: 'Analyze the PeakGear customer order or revenue question. User query: {query}. Required flow: 1. Use COMMERCE_SQL_TOOL to query app database orders, order items, customers, products, brands, inventory, and demand forecasts. 2. Provide specific totals, counts, categories, or brands. 3. Recommend one commercial action when useful. 4. Use LOG_DECISION_TOOL to log the recommendation. Keep the final answer concise and business-facing.',
      tools: ['COMMERCE_SQL_TOOL', 'LOG_DECISION_TOOL'],
    }),
    description: 'Commerce intelligence task using app database order data.',
  });

  await createTeam(connection, {
    name: 'SOCIAL_TREND_TEAM',
    attributes: JSON.stringify({
      agents: [{ name: 'TREND_AGENT', task: 'TREND_ANALYSIS_TASK' }],
      process: 'sequential',
    }),
    description: TEAM_CONFIG.SOCIAL_TREND_TEAM.description,
  });
  await createTeam(connection, {
    name: 'FULFILLMENT_TEAM',
    attributes: JSON.stringify({
      agents: [{ name: 'FULFILLMENT_AGENT', task: 'FULFILLMENT_TASK' }],
      process: 'sequential',
    }),
    description: TEAM_CONFIG.FULFILLMENT_TEAM.description,
  });
  await createTeam(connection, {
    name: 'COMMERCE_TEAM',
    attributes: JSON.stringify({
      agents: [{ name: 'COMMERCE_AGENT', task: 'COMMERCE_TASK' }],
      process: 'sequential',
    }),
    description: TEAM_CONFIG.COMMERCE_TEAM.description,
  });
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
    const profileName = normalizeName(selectAiStatus.profileName, DEFAULT_PROFILE_NAME);

    if (!selectAiStatus.available || selectAiStatus.runtime !== 'select_ai') {
      return unavailableStatus('select_ai_unavailable', {
        profileName,
        selectAiStatus,
        model: selectAiStatus.model,
      });
    }

    const autoSetupEnabled = envFlagEnabled(
      'AGENTS_SELECT_AI_AUTO_SETUP',
      envFlagEnabled('APP_AI_PROFILE_AUTO_SETUP', envFlagEnabled('PG_AI_PROFILE_AUTO_SETUP', true))
    );

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
          if (!autoSetupEnabled) {
            return unavailableStatus('agent_setup_disabled', {
              profileName,
              inventory,
              selectAiStatus,
            });
          }

          await createNativeAgentObjects(connection, profileName);
          inventory = await fetchNativeInventory(connection, profileName);
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
          model: selectAiStatus.model,
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
    `Intent: ${intent}`,
    'Use only the PeakGear app database PG schema. Do not refer to ADB or lakehouse Bronze/Silver/Gold tables.',
    'Use registered tools for facts. If you recommend an action, log it through LOG_DECISION_TOOL.',
    'For broad operational questions, answer from the available tables and tools; do not ask for clarification when a reasonable top list or summary can be produced.',
    `User request: ${question}`,
  ].join('\n');
}

async function fetchRecentNativeActions(connection, startedAt) {
  const result = await connection.execute(`
    SELECT action_id,
           agent_name,
           action_type,
           entity_type,
           entity_id,
           SUBSTR(decision_payload, 1, 500) AS decision_payload,
           confidence,
           execution_status,
           TO_CHAR(created_at, 'HH24:MI:SS') AS called_at
    FROM agent_actions
    WHERE agent_name IN ('TREND_AGENT', 'FULFILLMENT_AGENT', 'COMMERCE_AGENT',
                         'trend_detection_agent', 'inventory_agent',
                         'fulfillment_agent', 'master_orchestrator')
      AND (:startedAt IS NULL OR created_at >= CAST(:startedAt AS TIMESTAMP) - INTERVAL '5' SECOND)
    ORDER BY created_at DESC
    FETCH FIRST 6 ROWS ONLY`,
    { startedAt },
    { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows || [];
}

async function runNativeAgentQuestion({ question, team, intent }) {
  const runtime = await ensureNativeAgentRuntime();
  if (!runtime.available) {
    return null;
  }

  const teamName = normalizeName(team, 'COMMERCE_TEAM');
  if (!TEAM_CONFIG[teamName]) {
    const err = new Error(`Unsupported native agent team: ${teamName}`);
    err.statusCode = 400;
    err.nativeRuntimeAvailable = true;
    throw err;
  }

  const conversationId = crypto.randomUUID();
  const startTime = Date.now();
  const prompt = buildNativeAgentPrompt({
    question,
    intent: intent || TEAM_CONFIG[teamName].intent,
    conversationId,
  });

  return withConnection(async (connection) => {
    try {
      const startedResult = await connection.execute(
        `SELECT SYSTIMESTAMP AS started_at FROM dual`,
        {},
        { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
      );
      const startedAt = startedResult.rows?.[0]?.STARTED_AT || null;
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
      const actions = await fetchRecentNativeActions(connection, startedAt);
      const toolHistory = actions.slice(0, 5).map((entry) => ({
        TOOL_NAME: entry.ACTION_TYPE || 'LOG_DECISION_TOOL',
        CALLED_AT: entry.CALLED_AT,
        RESULT_PREVIEW: cleanText(entry.DECISION_PAYLOAD) || entry.EXECUTION_STATUS || 'completed',
      }));

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
            reason: entry.RESULT_PREVIEW,
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
    STATUS: native ? 'ENABLED' : 'FALLBACK',
    DESCRIPTION: native
      ? config.description
      : 'Local llama3.2 fallback team using application SQL and PL/SQL tools.',
    RUNTIME: native ? 'select_ai_agent' : 'ollama',
  }));
}

module.exports = {
  ensureNativeAgentRuntime,
  runNativeAgentQuestion,
  nativeProfileCatalogEntry,
  nativeTeams,
  TEAM_CONFIG,
};
