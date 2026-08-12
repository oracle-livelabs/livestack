#!/usr/bin/env node
/*
 * Source/unit contract for HC3-01, HC3-06/07, and the remediable HC4-04
 * credential surfaces outside frozen compose.yml.
 *
 * The client checks invoke the production helpers with a mocked fetch. The
 * authorization checks invoke the same middleware factory mounted by the
 * import router with a mocked Oracle role resolver. No server, Oracle,
 * browser, Podman, network, or archive action is performed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

let createRequireDatasetAdmin = null;
try {
  ({ createRequireDatasetAdmin } = require('../backend/lib/datasetAdminAuthorization'));
} catch (_) {
  // Kept RED until the production middleware exists.
}

const checks = [];
async function check(id, requirement, test) {
  try {
    await test();
    checks.push({ id, requirement, status: 'PASS' });
  } catch (error) {
    checks.push({ id, requirement, status: 'RED', observed: error.message });
  }
}

function request({
  actor = null,
  headers = {},
  pathName = '/upload',
  body = {},
} = {}) {
  return {
    authenticatedActor: actor,
    body,
    path: pathName,
    headers: Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    ),
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function runMiddleware(middleware, req) {
  const res = response();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, res };
}

function sameOriginHeaders(confirmation) {
  return {
    host: 'localhost:8505',
    origin: 'http://localhost:8505',
    'sec-fetch-site': 'same-origin',
    'x-healthcare-demo-control': 'healthcare-demo-session',
    'x-healthcare-dataset-confirmation': confirmation,
  };
}

async function main() {
  const adminToken = 'automation-token-kept-only-on-the-server';
  const resolvedActors = [];
  const middleware = createRequireDatasetAdmin?.({
    token: () => adminToken,
    resolveDatasetAdminActor: async (actor) => {
      resolvedActors.push(actor);
      return actor === 'admin_jess' ? actor : null;
    },
  });

  await check('HC-ADMIN-01', 'Missing token and missing signed actor fail closed.', async () => {
    assert.equal(typeof middleware, 'function');
    const result = await runMiddleware(
      middleware,
      request({ headers: sameOriginHeaders('REPLACE_DATASET') }),
    );
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  });

  await check('HC-ADMIN-02', 'A supplied wrong dataset-admin token fails closed even for an admin session.', async () => {
    const result = await runMiddleware(
      middleware,
      request({
        actor: 'admin_jess',
        headers: {
          ...sameOriginHeaders('REPLACE_DATASET'),
          'x-dataset-admin-token': 'wrong-token',
        },
      }),
    );
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  });

  await check('HC-ADMIN-03', 'The correct optional token remains a non-browser automation fallback.', async () => {
    const result = await runMiddleware(
      middleware,
      request({
        headers: {
          'x-dataset-admin-token': adminToken,
          'x-healthcare-dataset-confirmation': 'REPLACE_DATASET',
        },
      }),
    );
    assert.equal(result.nextCalled, true);
  });

  await check('HC-ADMIN-04', 'A same-origin signed actor succeeds only after Oracle revalidates the admin role.', async () => {
    resolvedActors.length = 0;
    const result = await runMiddleware(
      middleware,
      request({
        actor: 'admin_jess',
        headers: sameOriginHeaders('REPLACE_DATASET'),
      }),
    );
    assert.equal(result.nextCalled, true);
    assert.deepEqual(resolvedActors, ['admin_jess']);
  });

  await check('HC-ADMIN-05', 'A valid signed non-admin actor cannot replace or restore a dataset.', async () => {
    const result = await runMiddleware(
      middleware,
      request({
        actor: 'analyst_raj',
        pathName: '/restore-demo',
        headers: sameOriginHeaders('RESTORE_DEMO'),
      }),
    );
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  });

  await check('HC-ADMIN-06', 'The browser-session path requires same-origin demo-control intent.', async () => {
    const headers = sameOriginHeaders('RESTORE_DEMO');
    delete headers['x-healthcare-demo-control'];
    const result = await runMiddleware(
      middleware,
      request({ actor: 'admin_jess', pathName: '/restore-demo', headers }),
    );
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  });

  await check('HC-ADMIN-07', 'The middleware requires the route-specific destructive confirmation.', async () => {
    const result = await runMiddleware(
      middleware,
      request({
        actor: 'admin_jess',
        pathName: '/restore-demo',
        headers: sameOriginHeaders('REPLACE_DATASET'),
      }),
    );
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 400);
  });

  const apiModule = await import(
    `${pathToFileURL(path.join(root, 'frontend/src/utils/api.js')).href}?admin-contract=${Date.now()}`
  );
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 202,
      statusText: 'Accepted',
      headers: { get: () => null },
      json: async () => ({ ok: true, jobId: 'job-source-unit' }),
    };
  };

  try {
    const upload = new Blob(['source-unit'], { type: 'application/zip' });
    Object.defineProperty(upload, 'name', { value: 'healthcare-source-unit.zip' });
    await apiModule.api.import.upload(upload);
    await apiModule.api.import.restoreDemo();
  } finally {
    global.fetch = originalFetch;
  }

  await check('HC-ADMIN-08', 'The real upload helper sends no token and carries same-origin intent plus REPLACE_DATASET confirmation.', () => {
    const call = requests.find(({ url }) => url.endsWith('/api/import/upload'));
    assert.ok(call, 'upload helper did not call /api/import/upload');
    assert.equal(call.options.headers['X-Dataset-Admin-Token'], undefined);
    assert.equal(call.options.headers['X-Healthcare-Demo-Control'], 'healthcare-demo-session');
    assert.equal(call.options.headers['X-Healthcare-Dataset-Confirmation'], 'REPLACE_DATASET');
    assert.equal(call.options.credentials, 'same-origin');
    assert.equal(call.options.body.get('confirmation'), 'REPLACE_DATASET');
  });

  await check('HC-ADMIN-09', 'The real Restore helper sends no token and carries same-origin intent plus RESTORE_DEMO confirmation.', () => {
    const call = requests.find(({ url }) => url.endsWith('/api/import/restore-demo'));
    assert.ok(call, 'Restore helper did not call /api/import/restore-demo');
    assert.equal(call.options.headers['X-Dataset-Admin-Token'], undefined);
    assert.equal(call.options.headers['X-Healthcare-Demo-Control'], 'healthcare-demo-session');
    assert.equal(call.options.headers['X-Healthcare-Dataset-Confirmation'], 'RESTORE_DEMO');
    assert.equal(JSON.parse(call.options.body).confirmation, 'RESTORE_DEMO');
  });

  await check('HC-ADMIN-10', 'The mounted upload UI requires a second explicit destructive confirmation.', () => {
    const adminEntry = read('frontend/src/pages/AdminEntry.jsx');
    assert.match(adminEntry, /Confirm Replace Active Dataset/);
    assert.match(adminEntry, /uploadConfirmed/);
  });

  await check('HC-ADMIN-11', 'The production import router mounts the tested middleware on both destructive routes.', () => {
    const imports = read('backend/routes/import.js');
    assert.match(imports, /createRequireDatasetAdmin\(\)/);
    assert.match(imports, /router\.post\('\/upload',\s*requireDatasetAdmin/);
    assert.match(imports, /router\.post\('\/restore-demo',\s*requireDatasetAdmin/);
  });

  await check('HC-ADMIN-12', 'The production resolver proves active admin role from Oracle APP_USERS.', () => {
    const database = read('backend/config/database.js');
    assert.match(database, /async function resolveDatasetAdminActor/);
    assert.match(database, /FROM app_users[\s\S]{0,200}is_active\s*=\s*1[\s\S]{0,120}role\s*=\s*'admin'/i);
    assert.match(database, /resolveDatasetAdminActor,/);
  });

  await check('HC-PACKAGE-01', 'Frontend prepare and Vite failures propagate from the production build command.', () => {
    const frontendPackage = JSON.parse(read('frontend/package.json'));
    const build = frontendPackage.scripts?.build || '';
    assert.match(build, /prepare-jet-assets\.mjs\s*&&\s*vite build/);
    assert.doesNotMatch(build, /vite build\s*;/);
    assert.doesNotMatch(build, /vite build[\s\S]*\|\|\s*true\s*$/);
  });

  await check('HC-PACKAGE-02', 'Root package exposes one authoritative source-verification entrypoint including this contract and production build.', () => {
    const rootPackage = JSON.parse(read('package.json'));
    assert.match(rootPackage.scripts?.['verify:healthcare-source'] || '', /run-healthcare-source-verification/);
    const runner = read('verification/run-healthcare-source-verification.js');
    assert.match(runner, /check-healthcare-admin-package-contract\.js/);
    assert.match(runner, /npm[\s\S]*run[\s\S]*build/);
  });

  await check('HC-PACKAGE-03', 'Example configuration contains no concrete PAR and explains deployment-local secret injection.', () => {
    const example = read('.env.example');
    const telemetrySetting = example.match(/^DEMO_USAGE_COUNTER_PAR_URL=(.*)$/m)?.[1] || '';
    const modelSetting = example.match(/^ONNX_MODEL_URL=(.*)$/m)?.[1] || '';
    assert.ok(
      !/^https?:\/\/.+\/p\/[A-Za-z0-9_-]{20,}\//i.test(telemetrySetting),
      'DEMO_USAGE_COUNTER_PAR_URL still contains credential-shaped access material',
    );
    assert.ok(
      !/^https?:\/\/.+\/p\/[A-Za-z0-9_-]{20,}\//i.test(modelSetting),
      'ONNX_MODEL_URL still contains credential-shaped access material',
    );
    assert.match(example, /DEMO_USAGE_COUNTER_PAR_URL=<deployment-local-secret>/);
    assert.match(example, /ONNX_MODEL_URL=<deployment-local-model-url>/);
    assert.match(example, /local \.env|deployment secret/i);
  });

  await check('HC-PACKAGE-04', 'Bootstrap and Vector SQL contain no fallback/comment PAR and require deployment-local model injection.', () => {
    const bootstrap = read('scripts/bootstrap_db.sh');
    const vectorSql = read('db/schema/04_vector.sql');
    const credentialShapedPar = /https?:\/\/[^\s"'<>]+\/p\/[A-Za-z0-9_-]{16,}\/n\//i;
    assert.doesNotMatch(bootstrap, credentialShapedPar);
    assert.doesNotMatch(vectorSql, credentialShapedPar);
    assert.match(bootstrap, /ONNX_MODEL_URL="\$\{ONNX_MODEL_URL:-\}"/);
    assert.match(bootstrap, /\[\s+-z\s+"\$ONNX_MODEL_URL"\s+\][\s\S]{0,300}deployment-local configuration/i);
  });

  const passed = checks.filter(({ status }) => status === 'PASS').length;
  const failed = checks.length - passed;
  for (const entry of checks) {
    process.stdout.write(`${entry.status.padEnd(4)} ${entry.id} — ${entry.requirement}`);
    if (entry.observed) process.stdout.write(`\n     ${entry.observed}`);
    process.stdout.write('\n');
  }
  process.stdout.write(`\nHealthcare admin/package contract: ${passed}/${checks.length} PASS, ${failed} RED\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
