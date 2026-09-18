#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

const securityPackage = read('db/schema/06_security.sql');
const contextAdmin = read('db/schema/06a_hospitality_app_context_admin.sql');
const policies = read('db/schema/06b_hospitality_vpd_policies.sql');
const financial = read('db/schema/13_owner_financial_validation.sql');
const database = read('backend/config/database.js');
const server = read('backend/server.js');
const dashboard = read('backend/routes/dashboard.js');
const fulfillment = read('backend/routes/fulfillment.js');
const fulfillmentMap = read('frontend/src/pages/FulfillmentMap.jsx');
const ordersPage = read('frontend/src/pages/Orders.jsx');
const ownerFinancialPage = read('frontend/src/pages/OwnerFinancialValidation.jsx');
const bootstrap = read('scripts/bootstrap_db.sh');
const users = read('db/data/load_app_users.sql');

assert.match(securityPackage, /CREATE OR REPLACE PACKAGE hospitality_security_pkg/i);
assert.match(securityPackage, /DBMS_SESSION\.SET_CONTEXT\('HOSPITALITY_APP_CTX'/i);
assert.match(securityPackage, /DBMS_SESSION\.CLEAR_CONTEXT\('HOSPITALITY_APP_CTX'/i);
assert.doesNotMatch(securityPackage, /\bg_region\b|\bg_role\b/i);

assert.match(
  contextAdmin,
  /CREATE OR REPLACE CONTEXT hospitality_app_ctx\s+USING &&APP_SCHEMA_OWNER\.\.hospitality_security_pkg/i
);

for (const source of [policies, financial]) {
  assert.match(source, /SYS_CONTEXT\('HOSPITALITY_APP_CTX',\s*'ROLE'\)/i);
  assert.match(source, /DBMS_RLS\.CONTEXT_SENSITIVE/i);
  assert.match(source, /RETURN '1=0'/i);
  assert.doesNotMatch(source, /sc_security_ctx/i);
}

for (const table of [
  'FULFILLMENT_CENTERS',
  'INVENTORY',
  'FULFILLMENT_ZONES',
  'SHIPMENTS',
  'GUESTS',
  'ORDERS',
  'ORDER_ITEMS',
  'INFLUENCERS',
  'SOCIAL_POSTS',
  'INFLUENCER_CONNECTIONS',
  'BRAND_INFLUENCER_LINKS',
  'POST_PRODUCT_MENTIONS',
  'DEMAND_REGIONS',
  'DEMAND_FORECASTS',
  'AGENT_ACTIONS',
  'BRANDS',
]) {
  assert.match(policies, new RegExp(`replace_policy\\('${table}'`, 'i'), `${table} is missing a VPD policy`);
}

assert.match(database, /async function withUserConnection/i);
assert.match(database, /hospitality_security_pkg\.set_user_context/i);
assert.match(database, /hospitality_security_pkg\.clear_user_context/i);
assert.match(database, /AsyncLocalStorage/);
assert.match(database, /function runWithDemoUser/i);
assert.doesNotMatch(database, /username\s*\|\|\s*'admin_ava'/i);
assert.doesNotMatch(database, /sc_security_ctx/i);

assert.match(server, /DEFAULT_DEMO_USER\s*=\s*'corp_sam'/i);
assert.match(server, /status\(403\)/i);
assert.match(server, /validateDemoUser/i);
assert.match(server, /runWithDemoUser/i);

assert.doesNotMatch(dashboard, /db\.execute\(/);
assert.doesNotMatch(fulfillment, /db\.execute\(/);
assert.match(dashboard, /db\.executeAsUser\(/);
assert.match(fulfillment, /db\.executeAsUser\(/);

assert.match(bootstrap, /06a_hospitality_app_context_admin\.sql/);
assert.match(bootstrap, /06b_hospitality_vpd_policies\.sql/);

assert.match(users, /'rev_raj'.*'analyst', NULL/);
assert.match(users, /'corp_sam'.*'viewer', NULL/);

for (const page of [fulfillmentMap, ordersPage]) {
  assert.match(page, /isRestrictedViewer/);
  assert.match(page, /VPD \{vpdAccessLabel\}/);
  assert.doesNotMatch(page, /VPD \{isFM \? 'region-filtered' : 'full access'\}/);
}
assert.match(fulfillmentMap, /viewer\s+→\s+'1=0'/);
assert.match(ordersPage, /RETURN '1=0';\s+-- fail closed/i);
assert.match(ownerFinancialPage, /HOSPITALITY_APP_CTX/);
assert.doesNotMatch(ownerFinancialPage, /SC_SECURITY_CTX/i);

console.log('Hospitality VPD source contract passed.');
