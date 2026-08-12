#!/usr/bin/env node

const assert = require('assert');
const {
  OLLAMA_MODEL,
  createAskDataError,
  describeGeneratedSql,
  ensureSqlRowLimit,
  generatePatternSql,
  generateQuestionSql,
  normalizeAskDataError,
  parseJsonResponse,
  summarizeQueryResult,
  summarizeRunSqlResult,
  validateReadOnlySql,
} = require('../backend/lib/ollamaAssistant');

const REQUIRED_PROMPTS = [
  'Which care services are predicted to have the highest demand risk this week?',
  'Which quality and capacity signals have criticality above 80?',
  'Which logistics sites have available capacity for urgent care service requests?',
  'Show service value exposure by care category.',
  'What are the highest performing care request items?',
  'Which care service requests were triggered by quality or capacity signals?',
  'Which care pathway cases have the highest readmission or care-gap risk?',
];

const FREE_CHAT_SCENARIOS = [
  {
    question: 'What are the highest performing care request items?',
    sqlIncludes: ['care_request_items', 'service_supply_name', 'service_value'],
  },
  {
    question: 'Show me the top care request items by service value.',
    sqlIncludes: ['care_request_items', 'service_supply_name', 'service_value'],
  },
  {
    question: 'Which service request items are performing best?',
    sqlIncludes: ['care_request_items', 'service_supply_name', 'service_value'],
  },
  {
    question: 'Which care supplies have the most demand?',
    sqlIncludes: ['care_request_items', 'units_requested', 'service_requests'],
  },
  {
    question: 'What care services have the highest demand risk this week?',
    sqlIncludes: ['demand_forecasts', 'care_services_v', 'predicted_demand'],
  },
  {
    question: 'Which logistics sites can handle urgent care requests?',
    sqlIncludes: ['care_logistics_sites_v', 'capacity_supply_units'],
  },
  {
    question: 'Are there any capacity constraints or logistics issues that could impact the delivery of these care services?',
    sqlIncludes: ['care_logistics_sites_v', 'primary_constraint', 'recommended_action', 'operational_status'],
  },
  {
    question: 'What logistics constraints could affect those services?',
    sqlIncludes: ['care_logistics_sites_v', 'primary_constraint', 'recommended_action', 'operational_status'],
  },
  {
    question: 'Which quality signals have the biggest network impact?',
    sqlIncludes: ['quality_capacity_signals_v', 'network_impact'],
  },
  {
    question: 'How many care service requests were influenced by quality signals?',
    sqlIncludes: ['care_service_requests', 'signal_driven_service_requests', 'source_signal_id'],
  },
  {
    question: 'Show care pathway cases with readmission risk.',
    sqlIncludes: ['care_pathway_cases', 'risk_score'],
  },
  {
    question: 'What is the total service value by care category?',
    sqlIncludes: ['care_request_items', 'care_category', 'group by care_category'],
  },
  {
    question: 'Which provider networks have the highest service value?',
    sqlIncludes: ['care_request_items', 'provider_network_or_partner', 'service_value'],
  },
  {
    question: 'How many care service requests are there in total?',
    sqlIncludes: ['care_service_requests', 'total_service_requests'],
  },
];

const MODE_ENDPOINTS = [
  ['explain', '/api/selectai/chat'],
  ['chat', '/api/selectai/chat-mode'],
  ['show_sql', '/api/selectai/showsql'],
  ['run_sql', '/api/selectai/runsql'],
];

const LOGISTICS_QUESTION = 'Which logistics sites have available capacity for urgent care service requests?';
const LOGISTICS_ROWS = [
  {
    SITE_NAME: 'Aberdeen East Coast Specialty Care Warehouse',
    SITE_TYPE_DISPLAY_NAME: 'Care Supply Warehouse',
    LOCATION_NAME: 'Aberdeen, Maryland',
    REGION_NAME: 'Maryland',
  },
  {
    SITE_NAME: 'West Jordan Mountain Clinical Site',
    SITE_TYPE_DISPLAY_NAME: 'Care Supply Warehouse',
    LOCATION_NAME: 'West Jordan, Utah',
    REGION_NAME: 'Utah',
  },
];
const LOGISTICS_COLUMNS = ['SITE_NAME', 'SITE_TYPE_DISPLAY_NAME', 'LOCATION_NAME', 'REGION_NAME'];
const LOGISTICS_SQL = `SELECT site_name, site_type_display_name, location_name, region_name
FROM care_logistics_sites_v
WHERE is_active = 1
FETCH FIRST 5 ROWS ONLY`;

function assertBlocked(sql, label) {
  const validation = validateReadOnlySql(sql);
  assert.strictEqual(validation.ok, false, `${label}: expected SQL to be blocked`);
}

function assertAllowed(sql, label) {
  const validation = validateReadOnlySql(sql);
  assert.strictEqual(validation.ok, true, `${label}: expected SQL to be allowed: ${validation.reason || 'unknown reason'}`);
  return validation.sql;
}

function combinedNarrativeText(result) {
  return [
    result.answer,
    result.result_summary,
    ...(result.key_findings || []),
    ...(result.follow_up_questions || []),
  ].filter(Boolean).join('\n');
}

function assertNoRawRowDump(result, context) {
  const text = combinedNarrativeText(result);
  assert(!/\bSITE_NAME\s*:|\bLOCATION_NAME\s*:|\bSITE_TYPE_DISPLAY_NAME\s*:/i.test(text), `${context}: should not expose raw column-name row dumps`);
  assert(!/Found\s+\d+\s+rows/i.test(text), `${context}: should not use generic row-dump phrasing`);
}

function assertSqlIncludes(sql, fragments, context) {
  for (const fragment of fragments) {
    const pattern = new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    assert(pattern.test(sql), `${context}: expected SQL to include "${fragment}"`);
  }
}

function assertFreeChatResponse(body, context) {
  assert.strictEqual(body.mode, 'chat', `${context}: expected chat mode response`);
  assert.strictEqual(typeof body.answer, 'string', `${context}: expected answer text`);
  assert(body.answer.trim().length > 20, `${context}: expected a useful answer`);
  assert.strictEqual(typeof body.rowCount, 'number', `${context}: expected numeric rowCount`);
  assert(Array.isArray(body.followUpQuestions), `${context}: expected follow-up questions array`);

  const mainText = [
    body.answer,
    body.resultSummary,
    ...(body.keyFindings || []),
    ...(body.followUpQuestions || []),
  ].filter(Boolean).join('\n');

  assert(!/Unable to generate safe SQL/i.test(JSON.stringify(body)), `${context}: should not return the safe-SQL failure`);
  assert(!/\[object Object\]/.test(mainText), `${context}: should not leak object-valued synthesis fields`);
  assert(!/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\s*:/g.test(mainText), `${context}: should not expose raw column-name row dumps`);
  assert(!/Found\s+\d+\s+rows/i.test(mainText), `${context}: should not use generic row-dump phrasing`);
}

function assertLogisticsNarrative(result, context) {
  const text = combinedNarrativeText(result);
  assert(/logistics sites/i.test(text), `${context}: expected logistics-site language`);
  assert(/available capacity/i.test(text), `${context}: expected available-capacity language`);
  assert(/Aberdeen East Coast Specialty Care Warehouse/i.test(text), `${context}: expected Aberdeen site to be cited`);
  assert(/West Jordan Mountain Clinical Site/i.test(text), `${context}: expected West Jordan site to be cited`);
  assertNoRawRowDump(result, context);
  assert(!/12\.?6K|12,?600/i.test(text), `${context}: should not invent capacity numbers when the result set lacks capacity fields`);
}

async function postJson(baseUrl, path, question, demoUser) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-User': demoUser,
    },
    body: JSON.stringify({ question }),
  });
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (_) {
    body = { error: bodyText.slice(0, 500) };
  }
  return { status: response.status, ok: response.ok, body };
}

async function runLocalChecks() {
  assertBlocked('DROP TABLE care_service_requests', 'DDL');
  assertBlocked('UPDATE care_service_requests SET request_value = 0', 'DML');
  assertBlocked('SELECT * FROM dba_tables', 'dictionary table');
  assertBlocked('SELECT * FROM care_service_requests; DELETE FROM care_service_requests', 'multi-statement');
  assertBlocked('SELECT * FROM care_service_requests FOR UPDATE', 'for update');

  const limitedSql = ensureSqlRowLimit('SELECT service_request_id FROM care_service_requests', 25);
  assert(/\bFETCH FIRST 25 ROWS ONLY\b/i.test(limitedSql), 'Expected missing row limit to be appended');
  assertAllowed(limitedSql, 'row-limited SELECT');

  const parsed = parseJsonResponse('```json\n{"sql":"SELECT * FROM care_service_requests","warnings":[]}\n```');
  assert.strictEqual(parsed.sql, 'SELECT * FROM care_service_requests', 'Expected fenced JSON to parse');

  assert.throws(
    () => parseJsonResponse('not valid json'),
    (error) => error.category === 'MALFORMED_LLM_RESPONSE',
    'Malformed LLM JSON should throw a categorized safe error'
  );

  const unavailable = normalizeAskDataError(createAskDataError('OLLAMA_UNAVAILABLE'));
  assert.strictEqual(
    unavailable.userMessage,
    'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.'
  );

  const missingModel = normalizeAskDataError(createAskDataError('OLLAMA_MODEL_MISSING'));
  assert.strictEqual(
    missingModel.userMessage,
    `Model ${OLLAMA_MODEL} is not available in Ollama. Pull or configure the model before using Ask Healthcare Data.`
  );

  for (const prompt of REQUIRED_PROMPTS) {
    const result = await generateQuestionSql(prompt, { mode: 'showsql' });
    assert(result.sql, `${prompt}: expected generated SQL`);
    assertAllowed(result.sql, `${prompt}: generated SQL`);
    assert(!/\border_items\b|\borders\b|\bcustomerId\b|\bshippingCost\b/i.test(result.sql), `${prompt}: should avoid commerce names`);
  }

  for (const { question, sqlIncludes } of FREE_CHAT_SCENARIOS) {
    const patternSql = generatePatternSql(question);
    assert(patternSql, `${question}: expected deterministic free-chat SQL mapping`);
    assertAllowed(patternSql, `${question}: deterministic free-chat SQL`);
    assertSqlIncludes(patternSql, sqlIncludes, `${question}: deterministic free-chat SQL`);

    const result = await generateQuestionSql(question, { mode: 'chat' });
    assert(result.sql, `${question}: expected generated SQL through chat pipeline`);
    assertAllowed(result.sql, `${question}: chat pipeline SQL`);
    assertSqlIncludes(result.sql, sqlIncludes, `${question}: chat pipeline SQL`);
  }

  const showSql = await generateQuestionSql(REQUIRED_PROMPTS[0], { mode: 'showsql' });
  assert(showSql.sql && !showSql.rows && !('rowCount' in showSql), 'Show SQL generation should return SQL without executing it');

  const explain = await summarizeQueryResult({
    question: LOGISTICS_QUESTION,
    mode: 'narrate',
    sql: LOGISTICS_SQL,
    columns: LOGISTICS_COLUMNS,
    rows: LOGISTICS_ROWS,
    rowCount: LOGISTICS_ROWS.length,
    synthesizeWithModel: false,
  });
  assertLogisticsNarrative(explain, 'Explain logistics fallback');
  assert(explain.warnings.some((warning) => /does not include numeric capacity values/i.test(warning)), 'Explain should warn when capacity values are missing');

  const chat = await summarizeQueryResult({
    question: LOGISTICS_QUESTION,
    mode: 'chat',
    sql: LOGISTICS_SQL,
    columns: LOGISTICS_COLUMNS,
    rows: LOGISTICS_ROWS,
    rowCount: LOGISTICS_ROWS.length,
    synthesizeWithModel: false,
  });
  assertLogisticsNarrative(chat, 'Chat logistics fallback');
  assert(Array.isArray(chat.follow_up_questions) && chat.follow_up_questions.length > 0, 'Chat should provide follow-up questions');

  const malformedSynthesis = await summarizeQueryResult({
    question: LOGISTICS_QUESTION,
    mode: 'narrate',
    sql: LOGISTICS_SQL,
    columns: LOGISTICS_COLUMNS,
    rows: LOGISTICS_ROWS,
    rowCount: LOGISTICS_ROWS.length,
    synthesisClient: async () => {
      throw createAskDataError('MALFORMED_LLM_RESPONSE', 'bad synthesis JSON');
    },
  });
  assertLogisticsNarrative(malformedSynthesis, 'Malformed synthesis JSON fallback');

  const rawDumpSynthesis = await summarizeQueryResult({
    question: LOGISTICS_QUESTION,
    mode: 'narrate',
    sql: LOGISTICS_SQL,
    columns: LOGISTICS_COLUMNS,
    rows: LOGISTICS_ROWS,
    rowCount: LOGISTICS_ROWS.length,
    synthesisClient: async () => ({
      answer: 'Found 2 rows: SITE_NAME: Aberdeen East Coast Specialty Care Warehouse, LOCATION_NAME: Aberdeen, Maryland',
      key_findings: [],
      result_summary: 'SITE_NAME: raw dump',
      follow_up_questions: [],
      warnings: [],
    }),
  });
  assertLogisticsNarrative(rawDumpSynthesis, 'Raw model dump fallback');

  const objectAnswerSynthesis = await summarizeQueryResult({
    question: 'What are the highest performing care request items?',
    mode: 'chat',
    sql: `SELECT service_supply_name, care_category, provider_network_or_partner,
                 COUNT(DISTINCT service_request_id) AS service_requests,
                 SUM(quantity) AS units_requested,
                 ROUND(SUM(line_value), 2) AS service_value
          FROM care_request_items
          GROUP BY service_supply_name, care_category, provider_network_or_partner
          FETCH FIRST 5 ROWS ONLY`,
    columns: ['SERVICE_SUPPLY_NAME', 'CARE_CATEGORY', 'PROVIDER_NETWORK_OR_PARTNER', 'SERVICE_REQUESTS', 'UNITS_REQUESTED', 'SERVICE_VALUE'],
    rows: [{
      SERVICE_SUPPLY_NAME: 'Antioxidant Excipient Blend - Continuity Lot 2',
      CARE_CATEGORY: 'Pharmacy Supply',
      PROVIDER_NETWORK_OR_PARTNER: 'Solvanta Health Supply',
      SERVICE_REQUESTS: 57,
      UNITS_REQUESTED: 120,
      SERVICE_VALUE: 15000,
    }],
    rowCount: 1,
    synthesisClient: async () => ({
      answer: { text: 'Model returned a nested answer object.' },
      key_findings: [{ finding: 'Nested object finding' }],
      result_summary: { text: 'Nested summary' },
      follow_up_questions: ['Break this down by care site or region.'],
      warnings: [],
    }),
  });
  assert(!/\[object Object\]/.test(combinedNarrativeText(objectAnswerSynthesis)), 'Object-valued synthesis fields should not leak as [object Object]');
  assert(/Antioxidant Excipient Blend/i.test(objectAnswerSynthesis.answer), 'Object-valued synthesis should fall back to a grounded answer');

  const terseLogisticsSynthesis = await summarizeQueryResult({
    question: 'Are there any capacity constraints or logistics issues that could impact the delivery of these care services?',
    mode: 'chat',
    sql: `SELECT site_name,
                 site_type_display_name,
                 location_name,
                 region_name,
                 capacity_supply_units,
                 pending_request_count,
                 load_percentage,
                 alert_count,
                 operational_status,
                 primary_constraint,
                 recommended_action
          FROM care_logistics_sites_v
          FETCH FIRST 5 ROWS ONLY`,
    columns: [
      'SITE_NAME',
      'SITE_TYPE_DISPLAY_NAME',
      'LOCATION_NAME',
      'REGION_NAME',
      'CAPACITY_SUPPLY_UNITS',
      'PENDING_REQUEST_COUNT',
      'LOAD_PERCENTAGE',
      'ALERT_COUNT',
      'OPERATIONAL_STATUS',
      'PRIMARY_CONSTRAINT',
      'RECOMMENDED_ACTION',
    ],
    rows: [{
      SITE_NAME: 'Aberdeen East Coast Specialty Care Warehouse',
      SITE_TYPE_DISPLAY_NAME: 'Care Supply Warehouse',
      LOCATION_NAME: 'Aberdeen, Maryland',
      REGION_NAME: 'Maryland',
      CAPACITY_SUPPLY_UNITS: 12600,
      PENDING_REQUEST_COUNT: 23,
      LOAD_PERCENTAGE: 83.4,
      ALERT_COUNT: 2,
      OPERATIONAL_STATUS: 'Constrained',
      PRIMARY_CONSTRAINT: 'High site load',
      RECOMMENDED_ACTION: 'Check route coverage and rebalance demand across nearby care logistics sites.',
    }],
    rowCount: 1,
    synthesisClient: async () => ({
      answer: 'mRNA LNP Clinical Batch',
      follow_up_questions: [],
      referenced_data: { row_count: 1, notable_fields: ['SITE_NAME'] },
      warnings: [],
    }),
  });
  assert(/care logistics site/i.test(terseLogisticsSynthesis.answer), 'Terse entity-only logistics synthesis should fall back to a full healthcare answer');
  assert(/Aberdeen East Coast Specialty Care Warehouse/i.test(terseLogisticsSynthesis.answer), 'Terse logistics fallback should cite the returned logistics site');
  assert(/High site load/i.test(terseLogisticsSynthesis.answer), 'Logistics constraint fallback should cite the primary constraint');

  const vagueLogisticsSynthesis = await summarizeQueryResult({
    question: 'Are there any capacity constraints or logistics issues that could impact the delivery of these care services?',
    mode: 'narrate',
    sql: `SELECT site_name,
                 site_type_display_name,
                 location_name,
                 region_name,
                 capacity_supply_units,
                 pending_request_count,
                 load_percentage,
                 alert_count,
                 high_priority_alert_count,
                 operational_status,
                 primary_constraint,
                 recommended_action
          FROM care_logistics_sites_v
          FETCH FIRST 5 ROWS ONLY`,
    columns: [
      'SITE_NAME',
      'SITE_TYPE_DISPLAY_NAME',
      'LOCATION_NAME',
      'REGION_NAME',
      'CAPACITY_SUPPLY_UNITS',
      'PENDING_REQUEST_COUNT',
      'LOAD_PERCENTAGE',
      'ALERT_COUNT',
      'HIGH_PRIORITY_ALERT_COUNT',
      'OPERATIONAL_STATUS',
      'PRIMARY_CONSTRAINT',
      'RECOMMENDED_ACTION',
    ],
    rows: [{
      SITE_NAME: 'Aberdeen East Coast Specialty Care Warehouse',
      SITE_TYPE_DISPLAY_NAME: 'Care Supply Warehouse',
      LOCATION_NAME: 'Aberdeen, Maryland',
      REGION_NAME: 'Maryland',
      CAPACITY_SUPPLY_UNITS: 11769,
      PENDING_REQUEST_COUNT: 23,
      LOAD_PERCENTAGE: 5.2,
      ALERT_COUNT: 9,
      HIGH_PRIORITY_ALERT_COUNT: 6,
      OPERATIONAL_STATUS: 'Critical',
      PRIMARY_CONSTRAINT: 'Critical supply constraint',
      RECOMMENDED_ACTION: 'Review critical supply availability and route urgent care logistics to alternate sites.',
    }],
    rowCount: 1,
    synthesisClient: async () => ({
      answer: 'Yes, there are capacity constraints. Load percentages are above 80% for several sites.',
      key_findings: ['Several sites have load above 80%.'],
      result_summary: 'Capacity constraints were found.',
      follow_up_questions: [],
      warnings: [],
    }),
  });
  assert(/Aberdeen East Coast Specialty Care Warehouse/i.test(vagueLogisticsSynthesis.answer), 'Vague logistics synthesis should fall back to returned site evidence');
  assert(!/above 80%|80% for several/i.test(vagueLogisticsSynthesis.answer), 'Vague logistics fallback should not preserve unsupported load claims');

  const terseTotalCountSynthesis = await summarizeQueryResult({
    question: 'How many care service requests are there in total?',
    mode: 'chat',
    sql: 'SELECT COUNT(*) AS total_service_requests FROM care_service_requests',
    columns: ['TOTAL_SERVICE_REQUESTS'],
    rows: [{ TOTAL_SERVICE_REQUESTS: 3000 }],
    rowCount: 1,
    synthesisClient: async () => ({
      answer: '3000',
      follow_up_questions: [],
      referenced_data: { row_count: 1, notable_fields: ['TOTAL_SERVICE_REQUESTS'] },
      warnings: [],
    }),
  });
  assert(/3,000 care service requests/i.test(terseTotalCountSynthesis.answer), 'Numeric-only count synthesis should fall back to a full healthcare sentence');

  const terseSignalCountSynthesis = await summarizeQueryResult({
    question: 'How many care service requests were influenced by quality signals?',
    mode: 'chat',
    sql: 'SELECT COUNT(*) AS signal_driven_service_requests FROM care_service_requests WHERE source_signal_id IS NOT NULL',
    columns: ['SIGNAL_DRIVEN_SERVICE_REQUESTS'],
    rows: [{ SIGNAL_DRIVEN_SERVICE_REQUESTS: 57 }],
    rowCount: 1,
    synthesisClient: async () => ({
      answer: '57',
      follow_up_questions: [],
      referenced_data: { row_count: 1, notable_fields: ['SIGNAL_DRIVEN_SERVICE_REQUESTS'] },
      warnings: [],
    }),
  });
  assert(/57 signal-driven care service requests/i.test(terseSignalCountSynthesis.answer), 'Numeric-only signal count synthesis should fall back to a full healthcare sentence');

  const emptyExplain = await summarizeQueryResult({
    question: LOGISTICS_QUESTION,
    mode: 'narrate',
    sql: LOGISTICS_SQL,
    columns: LOGISTICS_COLUMNS,
    rows: [],
    rowCount: 0,
    synthesizeWithModel: false,
  });
  assert(/did not find matching records/i.test(emptyExplain.answer), 'Empty result sets should produce a useful empty-state answer');

  const showSqlExplanation = describeGeneratedSql(LOGISTICS_SQL, LOGISTICS_QUESTION);
  assert(/without executing/i.test(showSqlExplanation), 'Show SQL explanation should state that it does not execute SQL');

  const runSqlExplanation = summarizeRunSqlResult({
    sql: LOGISTICS_SQL,
    columns: LOGISTICS_COLUMNS,
    rows: LOGISTICS_ROWS,
    rowCount: LOGISTICS_ROWS.length,
  });
  assert(/structured records/i.test(runSqlExplanation), 'Run SQL should explain structured results');

  console.log('Ask Healthcare Data pipeline unit checks passed.');
}

async function runLiveChecks(baseUrl) {
  const demoUser = process.env.ASKDATA_PIPELINE_DEMO_USER || 'admin_jess';
  const chatOnly = process.env.ASKDATA_PIPELINE_CHAT_ONLY === '1';
  const healthResponse = await fetch(`${baseUrl}/api/selectai/health`, {
    headers: { 'X-Demo-User': demoUser },
  });
  const health = await healthResponse.json();
  assert(healthResponse.ok, `Health endpoint failed: ${JSON.stringify(health)}`);
  assert.strictEqual(health.status, 'healthy', `Expected healthy AskData stack: ${JSON.stringify(health)}`);

  if (!chatOnly) {
    const blocked = await postJson(baseUrl, '/api/selectai/runsql', 'drop table care_service_requests', demoUser);
    assert(!blocked.ok, 'Unsafe prompt should not execute successfully');
    assert.strictEqual(blocked.body.category, 'SQL_VALIDATION_BLOCKED', 'Unsafe prompt should be classified as SQL_VALIDATION_BLOCKED');
    assert(blocked.body.correlationId, 'Blocked query should include correlationId');

    for (const question of REQUIRED_PROMPTS) {
      for (const [mode, path] of MODE_ENDPOINTS) {
        const result = await postJson(baseUrl, path, question, demoUser);
        assert(result.ok, `${mode} failed for "${question}": ${JSON.stringify(result.body)}`);
        assert(result.body.correlationId, `${mode} ${question}: missing correlationId`);
        if (mode === 'show_sql') {
          assert(result.body.sql, `${mode} ${question}: missing SQL`);
          assert(!('rows' in result.body), `${mode} ${question}: Show SQL should not return rows`);
        }
        if (mode === 'run_sql') {
          assert(Array.isArray(result.body.rows), `${mode} ${question}: rows should be an array`);
          assert.strictEqual(typeof result.body.rowCount, 'number', `${mode} ${question}: rowCount should be numeric`);
          assert(result.body.rowCount > 0, `${mode} ${question}: expected at least one demo row`);
        }
      }
    }
  } else {
    console.log('Skipping full live mode matrix; running chat-only free-text scenarios.');
  }

  for (const { question, sqlIncludes } of FREE_CHAT_SCENARIOS) {
    const result = await postJson(baseUrl, '/api/selectai/chat-mode', question, demoUser);
    assert(result.ok, `free chat failed for "${question}": ${JSON.stringify(result.body)}`);
    assert(result.body.correlationId, `free chat ${question}: missing correlationId`);
    assertFreeChatResponse(result.body, `free chat ${question}`);
    if (result.body.sql) {
      assertSqlIncludes(result.body.sql, sqlIncludes, `free chat ${question}: generated SQL`);
    }
  }

  console.log(`Ask Healthcare Data live pipeline checks passed against ${baseUrl}.`);
}

async function main() {
  await runLocalChecks();

  const baseUrl = (process.env.ASKDATA_PIPELINE_BASE_URL || '').replace(/\/+$/, '');
  if (baseUrl) {
    await runLiveChecks(baseUrl);
  } else {
    console.log('Set ASKDATA_PIPELINE_BASE_URL to also validate the live /api/selectai pipeline.');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
