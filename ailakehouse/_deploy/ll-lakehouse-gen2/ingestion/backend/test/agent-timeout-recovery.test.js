const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/database');
const selectAiService = require('../lib/selectAiService');

test('NJS-123 recovers with the same product from registered Oracle tools', async () => {
  const originalGetConnection = db.getConnection;
  const originalFetchRuntimeStatus = selectAiService.fetchRuntimeStatus;
  const modulePath = require.resolve('../lib/appAgentService');
  const calls = [];
  let connections = 0;

  selectAiService.fetchRuntimeStatus = async () => ({ available: true, runtime: 'select_ai' });
  db.getConnection = async () => {
    connections += 1;
    return {
      callTimeout: 0,
      async close() {},
      async execute(sql, binds) {
        calls.push({ sql, binds });
        if (sql.includes('FROM all_objects')) return { rows: [{ OBJECT_NAME: 'DBMS_CLOUD_AI_AGENT' }] };
        if (sql.includes('FROM user_cloud_ai_profiles')) return { rows: [{ PROFILE_STATUS: 'ENABLED', PROFILE_MODEL: 'xai.grok-4.3', ENABLED_TOOL_COUNT: 2, VALID_FUNCTION_COUNT: 2, ENABLED_AGENT_COUNT: 2, ENABLED_TASK_COUNT: 2, ENABLED_TEAM_COUNT: 1 }] };
        if (sql.includes('CREATE_CONVERSATION')) return { rows: [{ CONVERSATION_ID: 'test-conversation' }] };
        if (sql.includes('RUN_TEAM')) throw Object.assign(new Error('call timeout'), { code: 'NJS-123' });
        if (sql.includes('RUN_TOOL')) {
          const value = binds.toolName === 'DEMAND_OPPORTUNITY_TOOL'
            ? { status: 'found', product_id: 35, product_name: 'Test Vest', signal_count: 2, average_score: 89, total_reach: 1200 }
            : { status: 'found', product_id: 35, active_sites: 4, available_units: 100, reserved_units: 10, low_stock_sites: 1, most_constrained_site: 'Test Store' };
          return { rows: [{ RESULT: JSON.stringify({ status: 'success', result: JSON.stringify(value) }) }] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
  };

  try {
    delete require.cache[modulePath];
    const service = require('../lib/appAgentService');
    const result = await service.runNativeAgentQuestion({ question: 'Identify a strong demand signal and recommend a stock response' });
    assert.equal(result.runtime, 'oracle_tool_response');
    assert.equal(result.agentUsed, false);
    assert.match(result.response, /Test Vest/);
    assert.match(result.response, /Test Store/);
    assert.match(result.executionNote, /did not finish/);
    assert.equal(result.data.demand.product_id, result.data.stock.product_id);
    assert.equal(connections, 3);
    assert.deepEqual(calls.filter(({ sql }) => sql.includes('RUN_TOOL')).map(({ binds }) => binds.toolName),
      ['DEMAND_OPPORTUNITY_TOOL', 'STOCK_ASSESSMENT_TOOL']);
    assert.equal(JSON.parse(calls.at(-1).binds.input).P_PRODUCT_ID, 35);
  } finally {
    db.getConnection = originalGetConnection;
    selectAiService.fetchRuntimeStatus = originalFetchRuntimeStatus;
    delete require.cache[modulePath];
  }
});
