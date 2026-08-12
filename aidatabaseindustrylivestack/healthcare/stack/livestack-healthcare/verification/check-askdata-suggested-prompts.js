#!/usr/bin/env node

const assert = require('assert');
const prompts = require('../frontend/src/data/askDataSuggestedPrompts.json');
const {
  generatePatternSql,
  getHealthcareSchemaObjectMetadata,
  isAssistantQueryableObject,
  validateReadOnlySql,
} = require('../backend/lib/ollamaAssistant');

const EXPECTED_CATEGORIES = [
  'Demand Risk',
  'Quality Signals',
  'Logistics',
  'Operations',
  'Service Requests',
  'Care Sites',
  'Signal Trends',
  'Care Pathways',
];

const FORBIDDEN_LEGACY_OBJECTS = new Set([
  'BRANDS',
  'CUSTOMERS',
  'FULFILLMENT_CENTERS',
  'INFLUENCERS',
  'INVENTORY',
  'ORDER_ITEMS',
  'ORDERS',
  'POST_PRODUCT_MENTIONS',
  'PRODUCTS',
  'SHIPMENTS',
  'SOCIAL_POSTS',
]);

function extractReferencedObjects(sql) {
  const objects = new Set();
  const regex = /\b(?:from|join)\s+([A-Za-z0-9_."$#]+)/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const objectName = match[1]
      .split(/\s+/)[0]
      .split('.')
      .pop()
      .replace(/"/g, '')
      .toUpperCase();
    if (objectName && objectName !== 'DUAL') objects.add(objectName);
  }

  return [...objects];
}

function assertPromptSql(prompt, sql, context) {
  const validation = validateReadOnlySql(sql);
  assert(validation.ok, `${context}: SQL did not pass read-only validation: ${validation.reason || 'unknown'}`);

  const referencedObjects = extractReferencedObjects(validation.sql);
  assert(referencedObjects.length > 0, `${context}: expected at least one referenced healthcare object`);

  for (const objectName of referencedObjects) {
    assert.strictEqual(
      isAssistantQueryableObject(objectName),
      true,
      `${context}: ${objectName} is not exposed through Ask Healthcare Data metadata`
    );
    assert(
      !FORBIDDEN_LEGACY_OBJECTS.has(objectName),
      `${context}: generated SQL should use healthcare query surfaces, not legacy object ${objectName}`
    );
  }

  return referencedObjects;
}

async function postJson(baseUrl, path, question, demoUser, profile) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-User': demoUser,
    },
    body: JSON.stringify({ question, profile }),
  });
  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (error) {
    throw new Error(`${path} returned non-JSON response: ${bodyText.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}) for "${question}": ${body.error || bodyText}`);
  }

  return body;
}

function assertNarrativeResult(prompt, result, context) {
  assert.strictEqual(typeof result.answer, 'string', `${context}: expected answer text`);
  assert(result.answer.trim().length > 0, `${context}: expected non-empty answer`);
  assert(result.sql, `${context}: expected generated SQL to remain inspectable`);
  const objects = assertPromptSql(prompt, result.sql, context);
  assert(result.correlationId, `${context}: expected correlationId`);
  return objects;
}

async function validateLivePrompt(baseUrl, prompt) {
  const demoUser = process.env.ASKDATA_PROMPT_DEMO_USER || 'admin_jess';
  const profile = process.env.ASKDATA_PROMPT_PROFILE;

  const explain = await postJson(baseUrl, '/api/selectai/chat', prompt.text, demoUser, profile);
  const explainObjects = assertNarrativeResult(prompt, explain, `${prompt.category} explain`);

  const chat = await postJson(baseUrl, '/api/selectai/chat-mode', prompt.text, demoUser, profile);
  const chatObjects = assertNarrativeResult(prompt, chat, `${prompt.category} chat`);

  const showSql = await postJson(baseUrl, '/api/selectai/showsql', prompt.text, demoUser, profile);
  const showSqlObjects = assertPromptSql(prompt, showSql.sql, `${prompt.category} showsql`);
  assert(showSql.correlationId, `${prompt.category} showsql: expected correlationId`);
  assert(!('rows' in showSql), `${prompt.category} showsql: Show SQL must not execute or return rows`);

  const runSql = await postJson(baseUrl, '/api/selectai/runsql', prompt.text, demoUser, profile);
  const runSqlObjects = assertPromptSql(prompt, runSql.sql, `${prompt.category} runsql`);
  assert(Array.isArray(runSql.columns), `${prompt.category} runsql: expected columns array`);
  assert(Array.isArray(runSql.rows), `${prompt.category} runsql: expected rows array`);
  assert.strictEqual(typeof runSql.rowCount, 'number', `${prompt.category} runsql: expected numeric rowCount`);
  assert(runSql.rowCount > 0, `${prompt.category} runsql: expected the suggested prompt to return at least one demo row`);
  assert(runSql.correlationId, `${prompt.category} runsql: expected correlationId`);

  return {
    category: prompt.category,
    rowCount: runSql.rowCount,
    explainObjects,
    chatObjects,
    showSqlObjects,
    runSqlObjects,
  };
}

async function main() {
  const metadata = getHealthcareSchemaObjectMetadata();
  assert(metadata.length > 0, 'Expected Ask Healthcare Data schema metadata');

  assert.strictEqual(prompts.length, EXPECTED_CATEGORIES.length, 'Expected one suggested prompt per demo domain');
  for (const category of EXPECTED_CATEGORIES) {
    assert(prompts.some((prompt) => prompt.category === category), `Missing suggested prompt category: ${category}`);
  }

  const localResults = prompts.map((prompt) => {
    assert(prompt.text, `${prompt.category}: missing prompt text`);
    const sql = generatePatternSql(prompt.text);
    assert(sql, `${prompt.category}: suggested prompt is not covered by deterministic SQL generation`);
    const referencedObjects = assertPromptSql(prompt, sql, `${prompt.category} local pattern`);
    return `${prompt.category}: ${referencedObjects.join(', ')}`;
  });

  const baseUrl = (process.env.ASKDATA_PROMPT_BASE_URL || process.env.ASKDATA_LIVE_BASE_URL || '').replace(/\/+$/, '');
  if (baseUrl) {
    const liveResults = [];
    for (const prompt of prompts) {
      liveResults.push(await validateLivePrompt(baseUrl, prompt));
    }

    console.log(`Ask Healthcare Data suggested prompt live check passed against ${baseUrl}:`);
    for (const result of liveResults) {
      console.log(`- ${result.category}: ${result.rowCount} rows; objects ${result.runSqlObjects.join(', ')}`);
    }
    return;
  }

  console.log('Ask Healthcare Data suggested prompt generation check passed:');
  for (const result of localResults) {
    console.log(`- ${result}`);
  }
  console.log('Set ASKDATA_PROMPT_BASE_URL to also validate Explain, Chat, Show SQL, and Run SQL live.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
