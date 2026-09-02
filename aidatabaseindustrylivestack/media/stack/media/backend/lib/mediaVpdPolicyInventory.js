'use strict';

const assert = require('assert');

const MEDIA_SCENE_OBJECTS = Object.freeze([
  'BRANDS', 'PRODUCTS', 'PRODUCT_EMBEDDINGS', 'PRODUCT_ATTRIBUTES',
  'FULFILLMENT_CENTERS', 'INVENTORY', 'CUSTOMERS', 'ORDERS',
  'ORDER_ITEMS', 'SHIPMENTS', 'FULFILLMENT_ZONES', 'INFLUENCERS',
  'SOCIAL_POSTS', 'INFLUENCER_CONNECTIONS', 'BRAND_INFLUENCER_LINKS',
  'POST_PRODUCT_MENTIONS', 'POST_EMBEDDINGS', 'SEMANTIC_MATCHES',
  'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'AGENT_ACTIONS', 'EVENT_STREAM',
  'SOCIAL_POST_PAYLOADS',
]);

const MEDIA_ADMIN_OBJECTS = Object.freeze([
  'APP_DATASET_STATE', 'APP_DATASET_JOBS', 'APP_DATASET_READINESS',
  'APP_DATASET_ATTEMPTS', 'APP_DATASET_OPERATION_LOCK',
  'APP_OML_MODEL_REGISTRY', 'APP_OML_CANDIDATE_ROWS',
  'APP_OML_GENERATION_MODELS', 'APP_OML_GENERATIONS',
  'APP_OML_GENERATION_ASSETS', 'APP_DEMO_DATE_ANCHOR',
  'APP_DATASET_EVENT_OUTBOX', 'APP_FEATURE_EXECUTION_EVIDENCE',
  'OML_DEMAND_SETTINGS', 'OML_CUSTOMER_SEGMENT_SETTINGS',
  'OML_REVENUE_SETTINGS', 'OML_PRODUCT_CLUSTER_SETTINGS',
]);

const LEGACY_MEDIA_VPD_POLICIES = Object.freeze([
  Object.freeze({ objectName: 'FULFILLMENT_CENTERS', policyName: 'VPD_FC_REGION' }),
  Object.freeze({ objectName: 'ORDERS', policyName: 'VPD_ORDERS_REGION' }),
  Object.freeze({ objectName: 'INFLUENCERS', policyName: 'VPD_GRAPH_INFLUENCERS' }),
  Object.freeze({ objectName: 'SOCIAL_POSTS', policyName: 'VPD_GRAPH_SOCIAL_POSTS' }),
  Object.freeze({ objectName: 'INFLUENCER_CONNECTIONS', policyName: 'VPD_GRAPH_CONNECTIONS' }),
  Object.freeze({ objectName: 'BRAND_INFLUENCER_LINKS', policyName: 'VPD_GRAPH_BRAND_LINKS' }),
  Object.freeze({ objectName: 'POST_PRODUCT_MENTIONS', policyName: 'VPD_GRAPH_MENTIONS' }),
]);

const CANONICAL_MEDIA_VPD_POLICY_NAMES = Object.freeze([
  'VPD_MEDIA_SELECT',
  'VPD_MEDIA_DML',
]);

function sqlList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

async function executeInventorySql(execute, connection, sql, binds = {}) {
  assert.strictEqual(typeof execute, 'function', 'policy inventory SQL executor');
  return execute(connection, sql, binds);
}

async function expectedMediaPolicyFunctions(connection, execute) {
  const result = await executeInventorySql(execute, connection, `
    SELECT listed.object_name, listed.select_function
    FROM (
      SELECT object_name, 'VPD_MEDIA_ROWS' select_function
      FROM user_objects
      WHERE object_name IN (${sqlList(MEDIA_SCENE_OBJECTS)})
        AND object_type IN ('TABLE', 'VIEW')
      UNION
      SELECT object_name, 'VPD_MEDIA_ADMIN_ONLY' select_function
      FROM user_objects
      WHERE object_name IN (${sqlList(MEDIA_ADMIN_OBJECTS)})
        AND object_type IN ('TABLE', 'VIEW')
      UNION
      SELECT DISTINCT asset.asset_name object_name,
             'VPD_MEDIA_ADMIN_ONLY' select_function
      FROM app_oml_generation_assets asset
      JOIN user_objects object_inventory
        ON object_inventory.object_name = asset.asset_name
       AND object_inventory.object_type IN ('TABLE', 'VIEW')
    ) listed
    ORDER BY listed.object_name
  `);
  return new Map((result.rows || []).map((row) => [
    row.OBJECT_NAME,
    row.SELECT_FUNCTION,
  ]));
}

function validateCanonicalPolicyRows(allPolicies, expectedFunctions) {
  const rows = Array.isArray(allPolicies) ? allPolicies : [];
  const legacyKeys = new Set(LEGACY_MEDIA_VPD_POLICIES.map(
    ({ objectName, policyName }) => `${objectName}:${policyName}`
  ));
  const legacyPolicies = rows.filter((row) => legacyKeys.has(
    `${row.OBJECT_NAME}:${row.POLICY_NAME}`
  ));
  const expectedObjects = new Set(expectedFunctions.keys());
  const unexpectedPolicies = rows.filter((row) => (
    !expectedObjects.has(row.OBJECT_NAME)
      || !CANONICAL_MEDIA_VPD_POLICY_NAMES.includes(row.POLICY_NAME)
  ));

  assert.deepStrictEqual(
    legacyPolicies,
    [],
    `legacy Media VPD policies remain installed: ${legacyPolicies
      .map((row) => `${row.OBJECT_NAME}:${row.POLICY_NAME}`)
      .join(', ')}`
  );
  assert.deepStrictEqual(
    unexpectedPolicies,
    [],
    `unexpected Media VPD policies: ${unexpectedPolicies
      .map((row) => `${row.OBJECT_NAME}:${row.POLICY_NAME}`)
      .join(', ')}`
  );
  assert.strictEqual(
    rows.length,
    expectedFunctions.size * CANONICAL_MEDIA_VPD_POLICY_NAMES.length,
    'exactly one SELECT and one DML policy are required per protected object'
  );

  const seen = new Set();
  for (const row of rows) {
    const key = `${row.OBJECT_NAME}:${row.POLICY_NAME}`;
    assert(!seen.has(key), `duplicate VPD policy metadata row ${key}`);
    seen.add(key);
    assert.strictEqual(row.ENABLE, 'YES', `${key}: enable`);
    assert(
      /CONTEXT[ _]SENSITIVE/i.test(String(row.POLICY_TYPE || '')),
      `${key}: policy_type must be context sensitive`
    );
    if (row.POLICY_NAME === 'VPD_MEDIA_SELECT') {
      assert.strictEqual(
        row.POLICY_FUNCTION,
        expectedFunctions.get(row.OBJECT_NAME),
        `${key}: policy_function`
      );
      assert.strictEqual(row.SEL, 'YES', `${key}: sel`);
      assert.strictEqual(row.INS, 'NO', `${key}: ins`);
      assert.strictEqual(row.UPD, 'NO', `${key}: upd`);
      assert.strictEqual(row.DEL, 'NO', `${key}: del`);
      assert.strictEqual(row.CHK_OPTION, 'NO', `${key}: chk_option`);
    } else {
      assert.strictEqual(row.POLICY_FUNCTION, 'VPD_MEDIA_DML', `${key}: policy_function`);
      assert.strictEqual(row.SEL, 'NO', `${key}: sel`);
      assert.strictEqual(row.INS, 'YES', `${key}: ins`);
      assert.strictEqual(row.UPD, 'YES', `${key}: upd`);
      assert.strictEqual(row.DEL, 'YES', `${key}: del`);
      assert.strictEqual(row.CHK_OPTION, 'YES', `${key}: chk_option`);
    }
  }

  for (const objectName of expectedFunctions.keys()) {
    assert(seen.has(`${objectName}:VPD_MEDIA_SELECT`));
    assert(seen.has(`${objectName}:VPD_MEDIA_DML`));
  }
  return { legacyPolicies, unexpectedPolicies };
}

async function verifyMediaCanonicalPolicyInventory({
  connection,
  execute,
  expectedSelectFunctions = null,
} = {}) {
  try {
    const expectedFunctions = expectedSelectFunctions
      || await expectedMediaPolicyFunctions(connection, execute);
    const result = await executeInventorySql(execute, connection, `
      SELECT object_name, policy_name,
             CASE
               WHEN package IS NULL THEN function
               ELSE package || '.' || function
             END policy_function,
             sel, ins, upd, del, chk_option, enable, policy_type
      FROM user_policies
      ORDER BY object_name, policy_name
    `);
    const policyInventory = result.rows || [];
    const validation = validateCanonicalPolicyRows(
      policyInventory,
      expectedFunctions
    );
    return {
      expectedFunctions,
      policyInventory,
      allPolicies: policyInventory,
      ...validation,
      ora28110Absent: true,
    };
  } catch (error) {
    if (/ORA-28110/i.test(String(error?.message || error))) {
      const wrapped = new Error(
        'ORA-28110 proves an installed VPD policy still references an invalid function or package.'
      );
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
}

module.exports = {
  CANONICAL_MEDIA_VPD_POLICY_NAMES,
  LEGACY_MEDIA_VPD_POLICIES,
  MEDIA_ADMIN_OBJECTS,
  MEDIA_SCENE_OBJECTS,
  expectedMediaPolicyFunctions,
  validateCanonicalPolicyRows,
  verifyMediaCanonicalPolicyInventory,
};
