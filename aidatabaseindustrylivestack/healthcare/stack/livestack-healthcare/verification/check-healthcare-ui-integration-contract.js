#!/usr/bin/env node
/*
 * Source-only Healthcare UI integration contract.
 *
 * This checks that the rendered client does not retain data from a previous
 * governed persona, presents unavailable API/readiness states honestly, and
 * requires a user confirmation before requesting a demo Restore. It does not
 * prove database features, VPD, or Restore execution; those require the
 * database/security and later runtime acceptance lanes.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const api = read('frontend/src/utils/api.js');
const users = read('frontend/src/context/UserContext.jsx');
const dataHook = read('frontend/src/hooks/useData.js');
const dataModel = read('frontend/src/pages/DataModel.jsx');
const readme = read('README.md');

const checks = [
  ['HC-UI-01', 'API errors preserve HTTP status and structured detail for honest unavailable states.',
    /error\.status\s*=\s*status/.test(api) && /error\.category/.test(api)],
  ['HC-UI-02', 'Persona switching increments a scope version and does not fabricate an admin fallback.',
    /setScopeVersion\(\(version\)\s*=>\s*version\s*\+\s*1\)/.test(users) &&
      /Do not invent an elevated persona/.test(users) && !/const fallback = \{ USERNAME: 'admin_jess'/.test(users)],
  ['HC-UI-03', 'Shared data loading clears prior values when the governed scope changes and drops late responses.',
    /Never let a response from the previous governed scope stay visible/.test(dataHook) &&
      /requestVersion === requestVersionRef\.current/.test(dataHook) && /scopeVersion/.test(dataHook)],
  ['HC-UI-04', 'Data Foundation uses API helpers and explicit RESTORE_DEMO confirmation rather than a direct unguarded restore fetch.',
    /api\.import\.restoreDemo\(\{[\s\S]*confirmation:\s*'RESTORE_DEMO'/.test(dataModel) &&
      /Confirm Restore Demo Data/.test(dataModel) && !/fetch\('\/api\/import\/restore-demo'/.test(dataModel)],
  ['HC-UI-05', 'Data Foundation withholds stale counts and renders a live-status-unavailable state.',
    /statusScope === scopeVersion/.test(dataModel) &&
      /Live dataset status is unavailable/.test(dataModel) && /Counts are withheld/.test(dataModel)],
  ['HC-UI-06', 'README is self-contained, labels source status honestly, and does not disclose internal telemetry/evidence details.',
    /^# Healthcare LiveStack/m.test(readme) && /## Quick start/.test(readme) && /## Restore demo data/.test(readme) &&
      /## Deferred capabilities/.test(readme) && /not yet independently accepted/i.test(readme) &&
      !/DEMO_USAGE_COUNTER_PAR_URL|Object Storage|verification\//i.test(readme)],
];

const failures = [];
for (const [id, requirement, pass] of checks) {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${id} — ${requirement}\n`);
  if (!pass) failures.push(id);
}
process.stdout.write(`\nHealthcare UI integration contract: ${checks.length - failures.length}/${checks.length} PASS\n`);
if (failures.length) process.exitCode = 1;
