#!/usr/bin/env node
/*
 * Source/unit contract for the mounted Healthcare demo-control session.
 *
 * This suite is deliberately runtime-free: it does not start Express, Oracle,
 * Podman, or a browser. Pure session primitives are exercised directly, then
 * source wiring is checked across the server, mounted frontend, and README.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const readOptional = (...parts) => {
  try {
    return read(...parts);
  } catch (_) {
    return '';
  }
};

const files = {
  sessions: readOptional('backend/lib/demoSession.js'),
  server: read('backend/server.js'),
  database: read('backend/config/database.js'),
  api: read('frontend/src/utils/api.js'),
  users: read('frontend/src/context/UserContext.jsx'),
  switcher: read('frontend/src/components/UserSwitcher.jsx'),
  imports: read('backend/routes/import.js'),
  workflow: read('backend/lib/importWorkflowService.js'),
  readme: read('README.md'),
};

let sessionModule = null;
try {
  sessionModule = require(path.join(root, 'backend/lib/demoSession.js'));
} catch (_) {
  // Kept RED until the production session primitive exists.
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

async function main() {
  const fixedNow = Date.parse('2026-07-31T08:00:00.000Z');
  const secret = 'healthcare-source-unit-secret-is-at-least-thirty-two-bytes';

  await check('HC-SESSION-01', 'A valid server-signed actor session round-trips without exposing its secret.', () => {
    assert.ok(sessionModule?.createDemoSessionService);
    const service = sessionModule.createDemoSessionService({
      secret,
      ttlMs: 60_000,
      now: () => fixedNow,
    });
    const issued = service.issue('analyst_raj');
    assert.equal(service.verify(issued.token).actor, 'analyst_raj');
    assert.equal(issued.token.includes(secret), false);
  });

  await check('HC-SESSION-02', 'A tampered signature fails closed.', () => {
    const service = sessionModule.createDemoSessionService({
      secret,
      ttlMs: 60_000,
      now: () => fixedNow,
    });
    const issued = service.issue('analyst_raj');
    const last = issued.token.at(-1);
    const tampered = `${issued.token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
    assert.equal(service.verify(tampered).ok, false);
    assert.equal(service.verify(tampered).reason, 'invalid');
  });

  await check('HC-SESSION-03', 'Missing, malformed, and expired sessions fail closed.', () => {
    let now = fixedNow;
    const service = sessionModule.createDemoSessionService({
      secret,
      ttlMs: 1_000,
      now: () => now,
    });
    assert.equal(service.verify('').ok, false);
    assert.equal(service.verify('not-a-session').ok, false);
    const issued = service.issue('analyst_raj');
    now += 1_001;
    assert.equal(service.verify(issued.token).reason, 'expired');
  });

  await check('HC-SESSION-04', 'The cookie is API-scoped, HttpOnly, SameSite=Strict, bounded, and Secure in production.', () => {
    const service = sessionModule.createDemoSessionService({
      secret,
      ttlMs: 60_000,
      now: () => fixedNow,
    });
    const issued = service.issue('analyst_raj');
    const cookie = service.serializeCookie(issued.token, { secure: true });
    assert.match(cookie, /^healthcare_demo_session=/);
    assert.match(cookie, /Path=\/api/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Max-Age=60/);
    assert.match(cookie, /Secure/);
  });

  await check('HC-SESSION-05', 'Only same-origin mounted UI requests with explicit demo-control intent can issue or clear a session.', () => {
    assert.match(files.sessions, /Origin/);
    assert.match(files.sessions, /X-Healthcare-Demo-Control/i);
    assert.match(files.sessions, /same-origin/i);
    assert.match(files.server, /requireSameOriginDemoControl/);
    assert.match(files.server, /app\.post\(['"]\/api\/demo-session/);
    assert.match(files.server, /app\.delete\(['"]\/api\/demo-session/);
  });

  await check('HC-SESSION-06', 'The session endpoint validates an active Oracle actor before signing it.', () => {
    assert.match(files.database, /resolveActiveActor/);
    assert.match(files.database, /FROM\s+app_users[\s\S]{0,240}is_active\s*=\s*1/i);
    assert.match(files.server, /resolveActiveActor\(requestedActor\)/);
  });

  await check('HC-SESSION-07', 'A governed request accepts a verified cookie or the existing server-side bearer mapping.', () => {
    assert.match(files.server, /resolveAuthenticatedActor/);
    assert.match(files.server, /resolveBearerActor/);
    assert.match(files.server, /DEMO_ACTOR_TOKENS/);
    assert.match(files.server, /demoSessions\.readRequest/);
  });

  await check('HC-SESSION-08', 'X-Demo-User alone is never authority and a mismatch with the signed actor is rejected.', () => {
    assert.doesNotMatch(files.server, /authenticatedActor\s*=\s*req\.headers\[['"]x-demo-user/);
    assert.match(files.server, /DEMO_ACTOR_MISMATCH/);
    assert.match(files.server, /status\(401\)[\s\S]{0,240}Authentication is required for governed API routes/);
  });

  await check('HC-SESSION-09', 'Unknown or inactive actors fail closed on every governed request.', () => {
    assert.match(files.server, /await\s+db\.resolveActiveActor\(actor\)/);
    assert.match(files.server, /DEMO_ACTOR_FORBIDDEN/);
    assert.match(files.server, /status\(403\)/);
  });

  await check('HC-SESSION-10', 'All mounted fetch, upload, and download helpers explicitly send same-origin credentials.', () => {
    const sameOriginCredentials = files.api.match(/credentials:\s*['"]same-origin['"]/g) || [];
    assert.ok(sameOriginCredentials.length >= 3, `found ${sameOriginCredentials.length} credentialed helper(s)`);
  });

  await check('HC-SESSION-11', 'The mounted client can establish and clear a session without browser-visible bearer tokens or secrets.', () => {
    assert.match(files.api, /session:\s*\{[\s\S]*establish:/);
    assert.match(files.api, /X-Healthcare-Demo-Control/);
    assert.match(files.api, /\/demo-session/);
    assert.doesNotMatch(files.api, /DEMO_ACTOR_TOKENS|DEMO_SESSION_SECRET|Authorization\s*:/);
  });

  await check('HC-SESSION-12', 'Initial persona selection establishes its actor-bound session before governed UI state becomes current.', () => {
    const establishAt = files.users.indexOf('api.session.establish');
    const currentAt = files.users.indexOf('setCurrentUser(admin)', establishAt);
    assert.ok(establishAt >= 0 && currentAt > establishAt);
    assert.match(files.users, /await\s+api\.session\.establish\(admin\.USERNAME\)/);
  });

  await check('HC-SESSION-13', 'Persona switching waits for the new signed session and fails closed when establishment fails.', () => {
    assert.match(files.users, /const switchUser = useCallback\(async/);
    assert.match(files.users, /await\s+api\.session\.establish\(user\.USERNAME\)/);
    assert.match(files.users, /setApiUser\(null\)/);
    assert.match(files.users, /api\.session\.end/);
    assert.match(files.switcher, /switchingIdentity|identityError/);
  });

  await check('HC-SESSION-14', 'Dataset replacement and Restore retain their stronger admin and explicit-confirmation guards.', () => {
    assert.match(files.imports, /router\.post\(['"]\/upload['"],\s*requireDatasetAdmin/);
    assert.match(files.imports, /router\.post\(['"]\/restore-demo['"],\s*requireDatasetAdmin/);
    assert.match(files.workflow, /RESTORE_DEMO/);
    assert.match(files.workflow, /REPLACE_DATASET/);
  });

  await check('HC-SESSION-15', 'Documentation states the isolated-demo, non-production authentication boundary and bearer fallback.', () => {
    assert.match(files.readme, /same-origin/i);
    assert.match(files.readme, /HttpOnly/i);
    assert.match(files.readme, /isolated local demo/i);
    assert.match(files.readme, /not production authentication|not a production authentication/i);
    assert.match(files.readme, /bearer/i);
  });

  const passed = checks.filter((entry) => entry.status === 'PASS').length;
  const failed = checks.length - passed;
  for (const entry of checks) {
    process.stdout.write(`${entry.status.padEnd(4)} ${entry.id} — ${entry.requirement}`);
    if (entry.observed) process.stdout.write(`\n     ${entry.observed}`);
    process.stdout.write('\n');
  }
  process.stdout.write(`\nHealthcare signed demo-session contract: ${passed}/${checks.length} PASS, ${failed} RED\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
