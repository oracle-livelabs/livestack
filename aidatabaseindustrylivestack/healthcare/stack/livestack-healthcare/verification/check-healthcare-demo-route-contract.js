#!/usr/bin/env node
/*
 * Adversarial source/unit contract for HC4-03.
 *
 * The production demo router is evaluated with injected Express/database
 * doubles so this contract cannot load dotenv, open Oracle, start a server, or
 * perform network/runtime work.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const demoPath = path.join(root, 'backend/routes/demo.js');
const serverPath = path.join(root, 'backend/server.js');
const routesPath = path.join(root, 'backend/routes');
const read = (filePath) => fs.readFileSync(filePath, 'utf8');

const checks = [];
async function check(id, requirement, test) {
  try {
    await test();
    checks.push({ id, requirement, status: 'PASS' });
  } catch (error) {
    checks.push({ id, requirement, status: 'RED', observed: error.message });
  }
}

function loadDemoRouterWithDoubles() {
  const registrations = [];
  const router = {
    get(routePath, ...handlers) {
      registrations.push({ method: 'GET', path: routePath, handlers });
      return router;
    },
  };
  const database = new Proxy({}, {
    get(_target, property) {
      return async () => {
        throw new Error(`unexpected database call: ${String(property)}`);
      };
    },
  });
  const module = { exports: {} };
  const source = read(demoPath);
  const sandbox = {
    module,
    exports: module.exports,
    require(request) {
      if (request === 'express') return { Router: () => router };
      if (request === '../config/database') return database;
      throw new Error(`unexpected require: ${request}`);
    },
    console: { error() {} },
  };
  vm.runInNewContext(source, sandbox, { filename: demoPath });
  return { router: module.exports, registrations };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    writes: [],
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    flushHeaders() {},
    write(chunk) {
      this.writes.push(String(chunk));
      return true;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function routeSegments(source) {
  const starts = [...source.matchAll(/\brouter\.(get|post|put|patch|delete|use)\s*\(/g)]
    .map((match) => ({
      method: match[1].toUpperCase(),
      index: match.index,
    }));
  return starts.map((start, index) => ({
    method: start.method,
    source: source.slice(start.index, starts[index + 1]?.index ?? source.length),
  }));
}

function sideEffectingGetSegments() {
  const findings = [];
  for (const entry of fs.readdirSync(routesPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = read(path.join(routesPath, entry.name));
    for (const segment of routeSegments(source).filter(({ method }) => method === 'GET')) {
      const dml = segment.source.match(/\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+TABLE)\b/i);
      if (dml) findings.push(`${entry.name}: ${dml[0].replace(/\s+/g, ' ')}`);
    }
  }
  return findings;
}

async function main() {
  const server = read(serverPath);
  const demoSource = read(demoPath);
  const { registrations } = loadDemoRouterWithDoubles();
  const start = registrations.find(({ method, path: routePath }) => (
    method === 'GET' && routePath === '/start'
  ));

  await check('HC-DEMO-01', 'The production server mounts the demo router at /api/demo.', () => {
    assert.match(server, /app\.use\(\s*['"]\/api\/demo['"]\s*,\s*demoRoutes\s*\)/);
  });

  await check('HC-DEMO-02', 'Mounted GET /api/demo/start is fail-closed and performs no database call.', async () => {
    assert.ok(start, 'GET /start is not registered');
    assert.equal(start.handlers.length, 1, 'GET /start has an unexpected handler chain');
    const req = { on() {}, authenticatedActor: 'admin_jess' };
    const res = response();
    await start.handlers[0](req, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.payload?.code, 'DEMO_START_DISABLED');
  });

  await check('HC-DEMO-03', 'The disabled route directs operators to the governed POST Restore endpoint.', async () => {
    assert.ok(start, 'GET /start is not registered');
    const res = response();
    await start.handlers[0]({ on() {} }, res);
    assert.equal(res.payload?.replacement?.method, 'POST');
    assert.equal(res.payload?.replacement?.path, '/api/import/restore-demo');
    assert.equal(res.payload?.replacement?.confirmation, 'RESTORE_DEMO');
  });

  await check('HC-DEMO-04', 'The GET /start registration contains no SQL DML or direct database execution.', () => {
    const startSource = routeSegments(demoSource)
      .find(({ method, source }) => method === 'GET' && /router\.get\(\s*['"]\/start['"]/.test(source))
      ?.source || '';
    assert.ok(startSource, 'GET /start source segment is missing');
    assert.doesNotMatch(startSource, /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+TABLE)\b/i);
    assert.doesNotMatch(startSource, /\bdb\.(?:execute|executeAsUser|getConnection)\s*\(/);
  });

  await check('HC-DEMO-05', 'No production router GET registration contains SQL DML.', () => {
    assert.deepEqual(sideEffectingGetSegments(), []);
  });

  const passed = checks.filter(({ status }) => status === 'PASS').length;
  const failed = checks.length - passed;
  for (const entry of checks) {
    process.stdout.write(`${entry.status.padEnd(4)} ${entry.id} — ${entry.requirement}`);
    if (entry.observed) process.stdout.write(`\n     ${entry.observed}`);
    process.stdout.write('\n');
  }
  process.stdout.write(`\nHealthcare demo-route contract: ${passed}/${checks.length} PASS, ${failed} RED\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
