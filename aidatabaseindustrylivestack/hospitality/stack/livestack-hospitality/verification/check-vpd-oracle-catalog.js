#!/usr/bin/env node

const assert = require('node:assert/strict');
const db = require('../backend/config/database');

const PROTECTED_OBJECTS = [
  'AGENT_ACTIONS',
  'BRANDS',
  'BRAND_INFLUENCER_LINKS',
  'DEMAND_FORECASTS',
  'DEMAND_REGIONS',
  'FULFILLMENT_CENTERS',
  'FULFILLMENT_ZONES',
  'GUESTS',
  'HOTEL_FINANCIAL_AI_JOBS',
  'HOTEL_FINANCIAL_SUBMISSIONS',
  'HOTEL_FINANCIAL_SUBMISSION_LINES',
  'HOTEL_FINANCIAL_VALIDATION_ACTIONS',
  'HOTEL_FINANCIAL_VALIDATION_RESULTS',
  'HOTEL_FINANCIAL_VALIDATION_RUNS',
  'INFLUENCERS',
  'INFLUENCER_CONNECTIONS',
  'INVENTORY',
  'ORDERS',
  'ORDER_ITEMS',
  'POST_PRODUCT_MENTIONS',
  'SHIPMENTS',
  'SOCIAL_POSTS',
].sort();

async function main() {
  const policies = await db.execute(`
    SELECT object_name, policy_name, enable, policy_type
      FROM user_policies
     WHERE policy_name LIKE 'HOSP_VPD_%'
        OR policy_name LIKE 'VPD_OWNER_FIN%'
     ORDER BY object_name, policy_name
  `);
  assert.deepEqual(
    [...new Set(policies.rows.map((row) => row.OBJECT_NAME))].sort(),
    PROTECTED_OBJECTS,
    'Protected Oracle object set does not match the regional access contract'
  );
  assert.ok(policies.rows.every((row) => row.ENABLE === 'YES'), 'Every VPD policy must be enabled');
  assert.ok(
    policies.rows.every((row) => row.POLICY_TYPE === 'CONTEXT_SENSITIVE'),
    'Every VPD policy must be CONTEXT_SENSITIVE'
  );

  const invalidObjects = await db.execute(`
    SELECT object_name, object_type
      FROM user_objects
     WHERE status != 'VALID'
       AND (object_name LIKE 'HOSPITALITY_%' OR object_name LIKE 'VPD_OWNER_FIN%')
  `);
  assert.deepEqual(invalidObjects.rows, [], 'Hospitality VPD objects must compile VALID');

  const legacyObjects = await db.execute(`
    SELECT object_name, object_type
      FROM user_objects
     WHERE object_name = 'SC_SECURITY_CTX'
        OR object_name IN (
          'VPD_FULFILLMENT_REGION', 'VPD_ORDERS_REGION',
          'VPD_GRAPH_INFLUENCERS', 'VPD_GRAPH_SOCIAL_POSTS',
          'VPD_GRAPH_CONNECTIONS', 'VPD_GRAPH_BRAND_LINKS', 'VPD_GRAPH_MENTIONS'
        )
  `);
  assert.deepEqual(legacyObjects.rows, [], 'Legacy package-global VPD objects must be removed');

  const exempt = await db.execute(`
    SELECT privilege
      FROM user_sys_privs
     WHERE privilege = 'EXEMPT ACCESS POLICY'
  `);
  assert.deepEqual(exempt.rows, [], 'Application owner must not bypass VPD');

  const mariaContext = await db.withUserConnection('ops_west_maria', async (connection) => {
    const result = await connection.execute(`
      SELECT SYS_CONTEXT('HOSPITALITY_APP_CTX', 'USERNAME') AS username,
             SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ROLE') AS role,
             SYS_CONTEXT('HOSPITALITY_APP_CTX', 'REGION') AS region,
             SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE') AS access_scope,
             SYS_CONTEXT('HOSPITALITY_APP_CTX', 'AUTHENTICATED') AS authenticated
        FROM dual
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
    return result.rows[0];
  });
  assert.deepEqual(mariaContext, {
    USERNAME: 'ops_west_maria',
    ROLE: 'fulfillment_mgr',
    REGION: 'California',
    ACCESS_SCOPE: 'REGION',
    AUTHENTICATED: 'Y',
  });

  const cleanConnection = await db.getConnection();
  try {
    const clean = await cleanConnection.execute(`
      SELECT SYS_CONTEXT('HOSPITALITY_APP_CTX', 'USERNAME') AS username,
             SYS_CONTEXT('HOSPITALITY_APP_CTX', 'ACCESS_SCOPE') AS access_scope
        FROM dual
    `, {}, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
    assert.deepEqual(clean.rows[0], { USERNAME: null, ACCESS_SCOPE: null });
  } finally {
    await cleanConnection.close();
  }

  console.log('Hospitality VPD Oracle catalog passed: private context, exact policies, valid objects, no bypass, and clean pooled sessions.');
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(() => db.closePool());
