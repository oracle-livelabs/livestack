#!/usr/bin/env node
/*
 * Focused source/unit contract for HC3-04 and HC3-05.
 *
 * This invokes the real Express handlers with adversarial Oracle outcomes and
 * checks the mounted React source. It is still source-only evidence: it does
 * not replace Oracle, HTTP, browser, restart, or package acceptance gates.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const databasePath = require.resolve('../backend/config/database');
const originalModuleLoad = Module._load;

// The retained source tree intentionally has no root node_modules install.
// A minimal Router registrar is enough to invoke these dependency-free route
// handlers without downloading packages or starting the application.
Module._load = function loadForContract(request, parent, isMain) {
  if (request === 'express') {
    return {
      Router() {
        const router = { stack: [] };
        router.get = (routePath, ...handlers) => {
          router.stack.push({
            route: {
              path: routePath,
              stack: handlers.map((handle) => ({ method: 'get', handle })),
            },
          });
          return router;
        };
        return router;
      },
    };
  }
  return originalModuleLoad.call(this, request, parent, isMain);
};

function loadRouter(relativePath, database) {
  const routePath = require.resolve(path.join(root, relativePath));
  delete require.cache[routePath];
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: database,
  };
  return require(routePath);
}

function routeHandler(router, method, routePath) {
  const layer = router.stack.find((entry) => entry.route?.path === routePath);
  assert.ok(layer, `route ${method.toUpperCase()} ${routePath} is mounted`);
  const routeLayer = layer.route.stack.find((entry) => entry.method === method);
  assert.ok(routeLayer, `route ${method.toUpperCase()} ${routePath} has a handler`);
  return routeLayer.handle;
}

async function invoke(handler, request = {}) {
  let statusCode = 200;
  let body;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  await handler(request, response);
  return { statusCode, body };
}

function oracleError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push([name, true]);
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    checks.push([name, false]);
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
  }
}

async function main() {
  const dashboardSource = read('backend/routes/dashboard.js');
  const dashboardPage = read('frontend/src/pages/Dashboard.jsx');
  const ordersSource = read('backend/routes/orders.js');
  const ordersPage = read('frontend/src/pages/Orders.jsx');
  const clientSource = read('frontend/src/utils/api.js');

  await check('HC3-04 removes synthetic In-Memory population math and status', () => {
    assert.doesNotMatch(dashboardSource, /diskBytes\s*\*\s*0\.25/);
    assert.doesNotMatch(dashboardSource, /status:\s*[^,\n]*\|\|\s*['"]COMPLETED['"]/);
    assert.doesNotMatch(dashboardPage, /●\s*POPULATED|○\s*POPULATING/);
    assert.doesNotMatch(dashboardPage, /COMPRESSION_PCT|IM_BYTES/);
  });

  await check('HC3-04 mounted Dashboard consumes the honest readiness route', () => {
    assert.match(clientSource, /inmemoryReadiness:\s*\(\)\s*=>\s*apiFetch\(['"]\/dashboard\/inmemory-readiness['"]\)/);
    assert.match(dashboardPage, /api\.dashboard\.inmemoryReadiness\(\)/);
    assert.doesNotMatch(dashboardPage, /api\.dashboard\.inmemory\(\)/);
    assert.match(dashboardPage, /Declaration only/i);
    assert.match(dashboardPage, /Runtime population not claimed/i);
    assert.match(dashboardPage, /Unavailable/i);
  });

  const declaredRows = [{
    TABLE_NAME: 'CARE_SERVICE_REQUESTS',
    ROW_COUNT: 42,
    DISK_BYTES: 1048576,
    INMEMORY_COMPRESSION: 'FOR QUERY HIGH',
    INMEMORY_PRIORITY: 'NONE',
  }];
  let declarationSql = '';
  let declarationActor = null;
  const dashboardRouter = loadRouter('backend/routes/dashboard.js', {
    async executeAsUser(sql, binds, actor) {
      declarationSql = sql;
      declarationActor = actor;
      return { rows: declaredRows };
    },
  });
  const readinessHandler = routeHandler(dashboardRouter, 'get', '/inmemory-readiness');
  const compatibilityHandler = routeHandler(dashboardRouter, 'get', '/inmemory');

  await check('HC3-04 declaration evidence is Oracle-derived and never population-shaped', async () => {
    const response = await invoke(readinessHandler, { demoUser: 'analyst_raj' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.evidenceMode, 'DECLARATION_ONLY');
    assert.equal(response.body.evidenceStatus, 'DECLARED');
    assert.equal(response.body.active, false);
    assert.equal(response.body.runtimePopulationClaimed, false);
    assert.equal(response.body.populationStatus, 'NOT_PROVEN');
    assert.deepEqual(response.body.evidenceSources, ['USER_TABLES', 'USER_SEGMENTS']);
    assert.equal(response.body.declaredSegmentCount, 1);
    assert.deepEqual(response.body.segments, declaredRows);
    assert.doesNotMatch(JSON.stringify(response.body), /"IM_BYTES"|"COMPRESSION_PCT"|"STATUS":"COMPLETED"/);
    assert.match(declarationSql, /FROM\s+user_tables/i);
    assert.match(declarationSql, /user_segments/i);
    assert.equal(declarationActor, 'analyst_raj');
  });

  await check('HC3-04 compatibility endpoint returns the same honest evidence envelope', async () => {
    const response = await invoke(compatibilityHandler, { demoUser: 'analyst_raj' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.evidenceMode, 'DECLARATION_ONLY');
    assert.equal(response.body.runtimePopulationClaimed, false);
    assert.equal(response.body.populationStatus, 'NOT_PROVEN');
    assert.ok(Array.isArray(response.body.segments));
  });

  for (const [label, error] of [
    ['missing catalog', oracleError('ORA-00942', 'table or view does not exist')],
    ['missing privilege', oracleError('ORA-01031', 'insufficient privileges')],
  ]) {
    await check(`HC3-04 ${label} is explicitly unavailable with no stale population claim`, async () => {
      const router = loadRouter('backend/routes/dashboard.js', {
        async executeAsUser() {
          throw error;
        },
      });
      for (const routePath of ['/inmemory-readiness', '/inmemory']) {
        const response = await invoke(routeHandler(router, 'get', routePath), { demoUser: 'viewer_sam' });
        assert.equal(response.statusCode, 503);
        assert.equal(response.body.evidenceMode, 'DECLARATION_ONLY');
        assert.equal(response.body.evidenceStatus, 'UNAVAILABLE');
        assert.equal(response.body.active, false);
        assert.equal(response.body.runtimePopulationClaimed, false);
        assert.equal(response.body.populationStatus, 'NOT_PROVEN');
        assert.deepEqual(response.body.segments, []);
        assert.doesNotMatch(JSON.stringify(response.body), /POPULATED|COMPLETED|"active":true/i);
      }
    });
  }

  await check('HC3-05 removes ORDERS_DV compatibility and source relabeling', () => {
    assert.doesNotMatch(ordersSource, /\bORDERS_DV\b/i);
    assert.doesNotMatch(ordersSource, /compatibilityProjection|mapLegacyOrderDocument|backingSource/);
    assert.doesNotMatch(ordersPage, /SOURCE_DISPLAY_LABELS|formatDualitySource/);
  });

  let dualityCalls = [];
  const ordersRouter = loadRouter('backend/routes/orders.js', {
    async executeAsUser(sql, binds, actor) {
      dualityCalls.push({ sql, binds, actor });
      return {
        rows: [{
          DATA: {
            serviceRequestId: 7,
            requestingCareSiteId: 3,
            requestStatus: 'confirmed',
            requestValue: 125,
            lineItems: [],
          },
        }],
      };
    },
  });
  const dualityHandler = routeHandler(ordersRouter, 'get', '/:id/duality');

  await check('HC3-05 success reports the exact executed native view provenance', async () => {
    dualityCalls = [];
    const response = await invoke(dualityHandler, {
      params: { id: '7' },
      demoUser: 'analyst_raj',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ready, true);
    assert.equal(response.body.source, 'CARE_SERVICE_REQUESTS_DV');
    assert.equal(response.body.requiredSource, 'CARE_SERVICE_REQUESTS_DV');
    assert.equal(response.body.executionMode, 'native-duality-view');
    assert.equal(response.body.nativeDualityViewAvailable, true);
    assert.equal(response.body.document.serviceRequestId, 7);
    assert.equal(dualityCalls.length, 1);
    assert.match(dualityCalls[0].sql, /FROM\s+care_service_requests_dv/i);
    assert.doesNotMatch(dualityCalls[0].sql, /orders_dv/i);
    assert.equal(dualityCalls[0].actor, 'analyst_raj');
  });

  for (const [label, error] of [
    ['missing view', oracleError('ORA-00942', 'table or view does not exist')],
    ['invalid view', oracleError('ORA-04063', 'view has errors')],
    ['missing privilege', oracleError('ORA-01031', 'insufficient privileges')],
  ]) {
    await check(`HC3-05 ${label} fails closed after one exact-view query`, async () => {
      let calls = 0;
      const router = loadRouter('backend/routes/orders.js', {
        async executeAsUser(sql) {
          calls += 1;
          assert.match(sql, /FROM\s+care_service_requests_dv/i);
          assert.doesNotMatch(sql, /orders_dv/i);
          throw error;
        },
      });
      const response = await invoke(routeHandler(router, 'get', '/:id/duality'), {
        params: { id: '7' },
        demoUser: 'viewer_sam',
      });
      assert.equal(calls, 1);
      assert.equal(response.statusCode, 503);
      assert.equal(response.body.code, 'DUALITY_VIEW_UNAVAILABLE');
      assert.equal(response.body.details.ready, false);
      assert.equal(response.body.details.source, 'CARE_SERVICE_REQUESTS_DV');
      assert.equal(response.body.details.requiredSource, 'CARE_SERVICE_REQUESTS_DV');
      assert.equal(response.body.details.executionMode, 'unavailable');
      assert.equal(response.body.details.nativeDualityViewAvailable, false);
      assert.doesNotMatch(JSON.stringify(response.body), /native-duality-view|"ready":true/i);
    });
  }

  await check('HC3-05 mounted UI renders exact success provenance and explicit unavailable state', () => {
    assert.match(ordersPage, /duality\?\.source\s*===\s*['"]CARE_SERVICE_REQUESTS_DV['"]/);
    assert.match(ordersPage, /Required source:/i);
    assert.match(ordersPage, /Native duality view unavailable/i);
    assert.match(ordersPage, /No compatibility view is substituted/i);
    assert.doesNotMatch(ordersPage, /ORDERS_DV/);
  });

  const failures = checks.filter(([, passed]) => !passed);
  process.stdout.write(`\nHealthcare HC3-04/HC3-05 source/unit checks: ${checks.length - failures.length}/${checks.length} PASS.\n`);
  process.stdout.write('Acceptance status: source-only; Oracle and rendered-browser gates remain RED.\n');
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
