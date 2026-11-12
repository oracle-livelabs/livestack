const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/database');
const selectAiService = require('../lib/selectAiService');

test('missing agent definitions are reported without application DDL', async () => {
  const originalGetConnection = db.getConnection;
  const originalFetchRuntimeStatus = selectAiService.fetchRuntimeStatus;
  const modulePath = require.resolve('../lib/appAgentService');
  const statements = [];

  selectAiService.fetchRuntimeStatus = async () => ({
    available: true,
    runtime: 'select_ai',
    profileName: 'PG_GENAI_PROFILE',
    model: 'test-model',
  });
  db.getConnection = async () => ({
    async execute(sql) {
      statements.push(sql);
      if (sql.includes('FROM all_objects')) return { rows: [{ OBJECT_NAME: 'DBMS_CLOUD_AI_AGENT' }] };
      if (sql.includes('FROM user_cloud_ai_profiles')) {
        return { rows: [{ PROFILE_STATUS: 'ENABLED', PROFILE_MODEL: 'xai.grok-4.3', ENABLED_TOOL_COUNT: 0,
          VALID_FUNCTION_COUNT: 2, ENABLED_AGENT_COUNT: 0,
          ENABLED_TASK_COUNT: 0, ENABLED_TEAM_COUNT: 0 }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async close() {},
  });

  try {
    delete require.cache[modulePath];
    const service = require('../lib/appAgentService');
    const status = await service.ensureNativeAgentRuntime({ force: true });
    assert.equal(status.available, false);
    assert.equal(status.reason, 'agent_not_ready');
    assert.ok(statements.every((sql) => !/DBMS_CLOUD_AI_AGENT\.(?:CREATE|DROP)_/i.test(sql)));
  } finally {
    db.getConnection = originalGetConnection;
    selectAiService.fetchRuntimeStatus = originalFetchRuntimeStatus;
    delete require.cache[modulePath];
  }
});

test('complete agent inventory is accepted without application DDL', async () => {
  const originalGetConnection = db.getConnection;
  const originalFetchRuntimeStatus = selectAiService.fetchRuntimeStatus;
  const modulePath = require.resolve('../lib/appAgentService');
  const statements = [];

  selectAiService.fetchRuntimeStatus = async () => ({
    available: true,
    runtime: 'select_ai',
    profileName: 'PG_GENAI_PROFILE',
    model: 'test-model',
  });
  db.getConnection = async () => ({
    async execute(sql) {
      statements.push(sql);
      if (sql.includes('FROM all_objects')) return { rows: [{ OBJECT_NAME: 'DBMS_CLOUD_AI_AGENT' }] };
      if (sql.includes('FROM user_cloud_ai_profiles')) {
        return { rows: [{ PROFILE_STATUS: 'ENABLED', PROFILE_MODEL: 'xai.grok-4.3', ENABLED_TOOL_COUNT: 2,
          VALID_FUNCTION_COUNT: 2, ENABLED_AGENT_COUNT: 2,
          ENABLED_TASK_COUNT: 2, ENABLED_TEAM_COUNT: 1 }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async close() {},
  });

  try {
    delete require.cache[modulePath];
    const service = require('../lib/appAgentService');
    const status = await service.ensureNativeAgentRuntime({ force: true });
    assert.equal(status.available, true);
    assert.equal(status.runtime, 'select_ai_agent');
    assert.equal(status.profileName, 'PG_RETAIL_AGENT_PROFILE');
    assert.equal(status.model, 'xai.grok-4.3');
    assert.ok(statements.every((sql) => !/DBMS_CLOUD_AI_AGENT\.(?:CREATE|DROP)_/i.test(sql)));
  } finally {
    db.getConnection = originalGetConnection;
    selectAiService.fetchRuntimeStatus = originalFetchRuntimeStatus;
    delete require.cache[modulePath];
  }
});
