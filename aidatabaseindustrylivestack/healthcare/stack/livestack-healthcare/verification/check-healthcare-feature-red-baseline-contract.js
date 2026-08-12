#!/usr/bin/env node
/*
 * Healthcare feature source-structure contract.
 *
 * This deliberately does NOT award feature acceptance.  It is a hostile
 * static guard against a familiar false positive: a DDL token, a route token,
 * and a UI label placed in unrelated or unreachable files.  Each structural
 * row follows one named chain only:
 *
 *   exact schema artifact -> route block that issues that artifact/query
 *   -> server-mounted router -> exact client endpoint -> called page
 *   -> App.jsx page registration.
 *
 * Runtime DB execution, HTTP invocation, optimizer-plan capture, failure
 * execution, and browser rendering are separate live gates.  No result from
 * this file may be reported as a feature PASS/GREEN or an acceptance total.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const files = {
  server: read('backend/server.js'),
  app: read('frontend/src/App.jsx'),
  client: read('frontend/src/utils/api.js'),
  schema: {
    duality: read('db/schema/11_healthcare_semantic_views.sql'),
    vector: read('db/schema/04_vector.sql'),
    graph: read('db/schema/10_care_pathway_graph.sql'),
    spatial: read('db/schema/05_spatial.sql'),
    oml: read('db/schema/12_oml_models.sql'),
    inmemory: read('db/schema/01_tables.sql'),
    json: read('db/schema/02_json_collections.sql'),
    audit: read('db/schema/16_healthcare_unified_audit_admin.sql'),
  },
};

function routeFile(name) { return read(`backend/routes/${name}`); }
function pageFile(name) { return read(`frontend/src/pages/${name}`); }

// A token is only relevant when it occurs inside this route's own handler.
// This prevents a matching string in another handler, a README, or a test
// fixture from satisfying a feature row.
function handler(source, method, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = new RegExp(`router\\.${method}\\(\\s*['\"]${escaped}['\"]`, 'g').exec(source);
  if (!start) return '';
  const next = /\nrouter\.(?:get|post|put|patch|delete)\(/g;
  next.lastIndex = start.index + start[0].length;
  const boundary = next.exec(source);
  return source.slice(start.index, boundary ? boundary.index : source.length);
}

function mounted(prefix, variable) {
  return new RegExp(`app\\.use\\(\\s*['\"]${prefix}['\"]\\s*,\\s*${variable}\\s*\\)`).test(files.server);
}

function pageIsMounted(page, component) {
  return new RegExp(`import\\s+${component}\\s+from\\s+['\"]\\.\\/pages\\/${page}['\"]`).test(files.app)
    && new RegExp(`\\b[a-z]+:\\s*${component}(?:,|\\n|\\})`).test(files.app);
}

function hasClientEndpoint(endpoint, method = 'GET') {
  const endpointPattern = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const call = new RegExp(`apiFetch\\(\\s*['\"\\x60]${endpointPattern}`);
  return call.test(files.client) && (method === 'GET' || new RegExp(`apiFetch\\([\\s\\S]{0,280}${endpointPattern}[\\s\\S]{0,280}method:\\s*['\"]${method}['\"]`).test(files.client));
}

function report(row, checks) {
  const missing = checks.filter(([, pass]) => !pass).map(([name]) => name);
  const state = missing.length ? 'STRUCTURAL RED' : 'STRUCTURE PRESENT';
  process.stdout.write(`${state} ${row} — ${missing.length ? missing.join('; ') : 'non-accepting source chain only'}\n`);
  return { row, missing };
}

const contracts = [
  {
    row: 'JSON Relational Duality',
    checks: () => {
      const api = routeFile('orders.js');
      const endpoint = handler(api, 'get', '/:id/duality');
      const page = pageFile('Orders.jsx');
      return [
        ['DDL CARE_SERVICE_REQUESTS_DV', /CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW care_service_requests_dv/i.test(files.schema.duality)],
        ['handler /:id/duality executes named CARE_SERVICE_REQUESTS_DV query', /sql\s*=\s*CARE_SERVICE_REQUEST_DV_SQL[\s\S]*db\.executeAsUser\(sql/i.test(endpoint) && /CARE_SERVICE_REQUEST_DV_SQL\s*=\s*`SELECT DATA FROM care_service_requests_dv[\s\S]*JSON_VALUE\(DATA/i.test(api)],
        ['handler cannot substitute or relabel ORDERS_DV', !/\bORDERS_DV\b/i.test(api) && /requiredSource:\s*REQUIRED_CARE_SERVICE_REQUEST_DV/i.test(endpoint)],
        ['handler has exact-view unavailable failure', /sendDualityUnavailable\(res\)/i.test(endpoint) && /DUALITY_VIEW_UNAVAILABLE/i.test(api) && /nativeDualityViewAvailable:\s*false/i.test(api)],
        ['handler has local 404 failure', /res\.status\(404\).*Care service request not found in duality view/i.test(endpoint)],
        ['orders router mounted at /api/orders', mounted('/api/orders', 'ordersRoutes')],
        ['client calls /service-requests/:id/duality', /serviceRequests:[\s\S]*duality:\s*\(id\)\s*=>\s*apiFetch\(`\/service-requests\/\$\{id\}\/duality`\)/.test(files.client)],
        ['Orders consumes exact-source api.serviceRequests.duality', /api\.serviceRequests\.duality\(orderId\)/.test(page) && /duality\?\.source\s*===\s*['"]CARE_SERVICE_REQUESTS_DV['"]/.test(page)],
        ['Orders page mounted in App.jsx', pageIsMounted('Orders', 'Orders')],
      ];
    },
  },
  {
    row: 'Vector Search',
    checks: () => {
      const api = routeFile('social.js');
      const endpoint = handler(api, 'post', '/semantic-search');
      const page = pageFile('SocialFeed.jsx');
      return [
        ['DDL IDX_PRODUCT_VEC', /CREATE VECTOR INDEX idx_product_vec ON product_embeddings\(embedding\)/i.test(files.schema.vector)],
        ['handler /semantic-search queries product_embeddings with VECTOR_DISTANCE', /FROM\s+product_embeddings/i.test(endpoint) && /VECTOR_DISTANCE/i.test(endpoint)],
        ['handler rejects empty query locally', /res\.status\(400\).*Query text is required/i.test(endpoint)],
        ['social router mounted at /api/social', mounted('/api/social', 'socialRoutes')],
        ['client POSTs /social/semantic-search', hasClientEndpoint('/social/semantic-search', 'POST')],
        ['SocialFeed calls api.social.search', /api\.social\.search\(q\.trim\(\),\s*8\)/.test(page)],
        ['SocialFeed page mounted in App.jsx', pageIsMounted('SocialFeed', 'SocialFeed')],
      ];
    },
  },
  {
    row: 'Property Graph / SQL-PGQ',
    checks: () => {
      const api = routeFile('graph.js');
      const endpoint = handler(api, 'post', '/run-example');
      const page = pageFile('InfluencerGraph.jsx');
      return [
        ['DDL CARE_PATHWAY_NETWORK', /CREATE OR REPLACE PROPERTY GRAPH care_pathway_network/i.test(files.schema.graph)],
        ['handler /run-example executes named GRAPH_TABLE query', /queryDef\.buildSql\(params\)[\s\S]*db\.executeAsUser\(sql/i.test(endpoint) && /GRAPH_TABLE \( care_pathway_network/i.test(api)],
        ['handler rejects unknown query locally', /res\.status\(400\).*Unknown query/i.test(endpoint)],
        ['graph router mounted at /api/graph', mounted('/api/graph', 'graphRoutes')],
        ['client POSTs /graph/run-example', hasClientEndpoint('/graph/run-example', 'POST')],
        ['InfluencerGraph calls api.graph.runExample', /api\.graph\.runExample\(activeQuery\.id, params\)/.test(page)],
        ['InfluencerGraph page mounted in App.jsx', pageIsMounted('InfluencerGraph', 'InfluencerGraph')],
      ];
    },
  },
  {
    row: 'Spatial',
    checks: () => {
      const api = routeFile('fulfillment.js');
      const endpoint = handler(api, 'get', '/nearest');
      const page = pageFile('FulfillmentMap.jsx');
      return [
        ['DDL IDX_FC_SPATIAL DOMAIN INDEX', /CREATE INDEX idx_fc_spatial ON fulfillment_centers\(location\)[\s\S]*INDEXTYPE IS MDSYS\.SPATIAL_INDEX_V2/i.test(files.schema.spatial)],
        ['handler /nearest executes SDO_NN on fulfillment_centers', /JOIN fulfillment_centers center[\s\S]*SDO_NN\([\s\S]*center\.location/i.test(endpoint)],
        ['handler rejects missing location locally', /res\.status\(400\).*Provide customerId\+productId or lat\+lon/i.test(endpoint)],
        ['fulfillment router mounted at /api/fulfillment', mounted('/api/fulfillment', 'fulfillmentRoutes')],
        ['client calls /fulfillment/nearest', hasClientEndpoint('/fulfillment/nearest')],
        ['FulfillmentMap calls api.fulfillment.nearest', /api\.fulfillment\.nearest\(/.test(page)],
        ['FulfillmentMap page mounted in App.jsx', pageIsMounted('FulfillmentMap', 'FulfillmentMap')],
      ];
    },
  },
  {
    row: 'Oracle Machine Learning',
    checks: () => {
      const api = routeFile('ml.js');
      const endpoint = handler(api, 'get', '/demand-forecast');
      const page = pageFile('OMLAnalytics.jsx');
      return [
        ['DDL creates lifecycle-owned mining model', /DBMS_DATA_MINING\.CREATE_MODEL/i.test(files.schema.oml)],
        ['handler /demand-forecast scores with named model', /PREDICTION\([^)]*DEMAND_SURGE_MODEL|DEMAND_SURGE_MODEL[\s\S]*PREDICTION/i.test(endpoint)],
        ['handler delegates failure to local fail-closed OML guard', /handleMlRouteError\(res, 'ML demand-forecast'/i.test(endpoint) && /code:\s*'OML_MODEL_NOT_READY'[\s\S]*fallbackAllowed:\s*false/i.test(api)],
        ['ML router mounted at /api/ml', mounted('/api/ml', 'mlRoutes')],
        ['client calls /ml/demand-forecast', hasClientEndpoint('/ml/demand-forecast')],
        ['OMLAnalytics calls api.ml.demandForecast', /api\.ml\.demandForecast\(/.test(page)],
        ['OMLAnalytics page mounted in App.jsx', pageIsMounted('OMLAnalytics', 'OMLAnalytics')],
      ];
    },
  },
  {
    row: 'Database In-Memory',
    checks: () => {
      const api = routeFile('dashboard.js');
      const page = pageFile('Dashboard.jsx');
      return [
        ['DDL declares INMEMORY segment', /\) INMEMORY MEMCOMPRESS FOR QUERY HIGH/i.test(files.schema.inmemory)],
        ['shared readiness handler queries USER_TABLES/USER_SEGMENTS as the actor', /FROM\s+user_tables/i.test(api) && /user_segments/i.test(api) && /db\.executeAsUser\(/.test(api)],
        ['both In-Memory routes use the same declaration-only handler', /router\.get\(['"]\/inmemory['"],\s*sendInMemoryDeclarationEvidence\)/.test(api) && /router\.get\(['"]\/inmemory-readiness['"],\s*sendInMemoryDeclarationEvidence\)/.test(api)],
        ['handler has explicit unavailable evidence with no population claim', /res\.status\(503\)/i.test(api) && /evidenceStatus:\s*['"]UNAVAILABLE['"]/.test(api) && /runtimePopulationClaimed:\s*false/.test(api)],
        ['handler has no synthetic In-Memory estimate or completed status', !/diskBytes\s*\*\s*0\.25/.test(api) && !/status:\s*[^,\n]*\|\|\s*['"]COMPLETED['"]/.test(api)],
        ['dashboard router mounted at /api/dashboard', mounted('/api/dashboard', 'dashboardRoutes')],
        ['client calls /dashboard/inmemory-readiness', hasClientEndpoint('/dashboard/inmemory-readiness')],
        ['Dashboard calls declaration-only readiness and rejects population labels', /api\.dashboard\.inmemoryReadiness\(\)/.test(page) && !/●\s*POPULATED|○\s*POPULATING/.test(page)],
        ['Dashboard page mounted in App.jsx', pageIsMounted('Dashboard', 'Dashboard')],
      ];
    },
  },
  {
    row: 'Native JSON',
    checks: () => {
      const api = routeFile('demo.js');
      const endpoint = handler(api, 'get', '/native-json-readiness');
      const page = pageFile('DataModel.jsx');
      return [
        ['DDL PRODUCT_ATTRIBUTES.ATTRIBUTES JSON', /CREATE TABLE product_attributes[\s\S]*attributes\s+JSON\s+NOT NULL/i.test(files.schema.json)],
        ['handler checks native JSON catalog', /FROM user_tab_columns[\s\S]*data_type = 'JSON'/i.test(endpoint)],
        ['handler has local unavailable failure', /res\.status\(503\).*ORACLE_NATIVE_JSON/i.test(endpoint)],
        ['demo router mounted at /api/demo', mounted('/api/demo', 'demoRoutes')],
        ['client calls /demo/native-json-readiness', hasClientEndpoint('/demo/native-json-readiness')],
        ['DataModel consumes native JSON readiness', /api\.demo\.nativeJsonReadiness\(\)/.test(page)],
        ['DataModel page mounted in App.jsx', pageIsMounted('DataModel', 'DataModel')],
      ];
    },
  },
  {
    row: 'Unified Audit',
    checks: () => {
      const api = routeFile('demo.js');
      const endpoint = handler(api, 'get', '/unified-audit-readiness');
      const page = pageFile('DataModel.jsx');
      return [
        ['DDL SC_ORDER_AUDIT policy', /CREATE AUDIT POLICY sc_order_audit/i.test(files.schema.audit)],
        ['handler checks AUDIT_UNIFIED_ENABLED_POLICIES', /FROM audit_unified_enabled_policies[\s\S]*SC_ORDER_AUDIT/i.test(endpoint)],
        ['handler has local unavailable failure', /res\.status\(503\).*AUDIT_UNIFIED_ENABLED_POLICIES/i.test(endpoint)],
        ['demo router mounted at /api/demo', mounted('/api/demo', 'demoRoutes')],
        ['client calls /demo/unified-audit-readiness', hasClientEndpoint('/demo/unified-audit-readiness')],
        ['DataModel consumes Unified Audit readiness', /api\.demo\.unifiedAuditReadiness\(\)/.test(page)],
        ['DataModel page mounted in App.jsx', pageIsMounted('DataModel', 'DataModel')],
      ];
    },
  },
];

const rows = contracts.map(({ row, checks }) => report(row, checks()));
const structuralRed = rows.filter(({ missing }) => missing.length);
process.stdout.write(`\nSource-structure rows: ${rows.length - structuralRed.length}/${rows.length} structurally complete; ${structuralRed.length} STRUCTURAL RED.\n`);
process.stdout.write('Acceptance status: RED for every feature. This source-only result has no 40/40-style acceptance label.\n');
if (structuralRed.length) process.exitCode = 1;
