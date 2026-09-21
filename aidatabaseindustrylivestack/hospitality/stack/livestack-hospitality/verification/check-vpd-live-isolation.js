#!/usr/bin/env node

const assert = require('node:assert/strict');

const BASE_URL = String(process.env.HOSPITALITY_BASE_URL || 'http://127.0.0.1:8505').replace(/\/$/, '');
const USERS = {
  admin: 'admin_ava',
  analyst: 'rev_raj',
  california: 'ops_west_maria',
  newJersey: 'ops_east_dave',
  georgia: 'ops_south_keisha',
  viewer: 'corp_sam',
};

async function request(pathname, username, expectedStatus = 200) {
  const headers = username === undefined ? {} : { 'X-Demo-User': username };
  const response = await fetch(`${BASE_URL}${pathname}`, { headers, cache: 'no-store' });
  const body = await response.text();
  assert.equal(
    response.status,
    expectedStatus,
    `${pathname} as ${username ?? '<anonymous>'} returned ${response.status}: ${body}`
  );
  if (response.status === 204) return null;
  return body ? JSON.parse(body) : null;
}

function dashboardFingerprint(row) {
  return {
    orders: Number(row.ORDERS_TOTAL || 0),
    posts: Number(row.POSTS_TOTAL || 0),
    inTransit: Number(row.SHIPMENTS_IN_TRANSIT || 0),
  };
}

async function readIdentity(username) {
  const [centers, financial, dashboard, demandRegions, agentActions] = await Promise.all([
    request('/api/fulfillment/centers', username),
    request('/api/financial-validation/summary', username),
    request('/api/dashboard/summary', username),
    request('/api/fulfillment/demand-regions', username),
    request('/api/agents/actions?limit=50', username),
  ]);
  return {
    centerStates: [...new Set(centers.map((row) => row.STATE_PROVINCE))].sort(),
    financialRegions: [...new Set(financial.submissions.map((row) => row.REGION))].sort(),
    financialCount: Number(financial.summary.SUBMISSION_COUNT || 0),
    demandRegions: demandRegions.map((row) => row.REGION_NAME).sort(),
    agentActionIds: agentActions.map((row) => Number(row.ACTION_ID)).sort((a, b) => a - b),
    dashboard: dashboardFingerprint(dashboard),
  };
}

async function main() {
  const baselineEntries = await Promise.all(
    Object.entries(USERS).map(async ([key, username]) => [key, await readIdentity(username)])
  );
  const baseline = Object.fromEntries(baselineEntries);

  assert.deepEqual(baseline.analyst, baseline.admin, 'Raj Patel must retain global Revenue Manager scope');
  assert.deepEqual(baseline.california.centerStates, ['California']);
  assert.deepEqual(baseline.california.financialRegions, ['California']);
  assert.deepEqual(baseline.california.demandRegions, ['Bay Area (SF)', 'Los Angeles Basin']);
  assert.deepEqual(baseline.newJersey.centerStates, ['New Jersey']);
  assert.deepEqual(baseline.newJersey.financialRegions, ['New Jersey']);
  assert.deepEqual(baseline.newJersey.demandRegions, ['Northeast Corridor']);
  assert.deepEqual(baseline.georgia.centerStates, ['Georgia']);
  assert.deepEqual(baseline.georgia.financialRegions, ['Georgia']);
  assert.deepEqual(baseline.georgia.demandRegions, ['Atlanta Metro']);

  assert.deepEqual(baseline.viewer.centerStates, [], 'Restricted viewer must not see regional centers');
  assert.deepEqual(baseline.viewer.financialRegions, [], 'Restricted viewer must not see owner financial rows');
  assert.equal(baseline.viewer.financialCount, 0);
  assert.deepEqual(baseline.viewer.demandRegions, []);
  assert.deepEqual(baseline.viewer.agentActionIds, []);
  assert.deepEqual(baseline.viewer.dashboard, { orders: 0, posts: 0, inTransit: 0 });

  const anonymous = await readIdentity(undefined);
  assert.deepEqual(anonymous, baseline.viewer, 'Anonymous requests must resolve to the restricted viewer');

  await request('/api/fulfillment/centers', 'does_not_exist', 403);

  const concurrentUsers = [
    USERS.admin,
    USERS.analyst,
    USERS.california,
    USERS.newJersey,
    USERS.georgia,
    USERS.viewer,
  ];
  const expectedByUser = new Map(
    Object.entries(USERS).map(([key, username]) => [username, baseline[key].dashboard])
  );

  const checks = [];
  for (let round = 0; round < 12; round += 1) {
    for (const username of concurrentUsers) {
      checks.push((async () => {
        const dashboard = await request('/api/dashboard/summary', username);
        assert.deepEqual(
          dashboardFingerprint(dashboard),
          expectedByUser.get(username),
          `Pooled Dashboard context leaked for ${username}`
        );
      })());
    }
  }
  await Promise.all(checks);

  console.log('Hospitality VPD live isolation passed: role matrix, anonymous viewer, invalid identity, and pooled concurrency are deterministic.');
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
