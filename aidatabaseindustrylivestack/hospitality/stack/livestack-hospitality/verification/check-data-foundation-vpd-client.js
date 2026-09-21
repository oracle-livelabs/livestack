#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../frontend/src/pages/DataModel.jsx'),
  'utf8'
);

assert.match(source, /import \{ apiFetch \} from '\.\.\/utils\/api';/);
assert.match(source, /import \{ useUser \} from '\.\.\/context\/UserContext';/);
assert.match(source, /const \{ currentUser \} = useUser\(\);/);
assert.match(source, /apiFetch\('\/demo\/status'\)/);
assert.match(source, /apiFetch\('\/import\/restore-demo'/);
assert.match(source, /apiFetch\(`\/import\/status\/\$\{encodeURIComponent\(startPayload\.jobId\)\}`\)/);
assert.doesNotMatch(source, /fetch\(`?\/api\/(?:demo\/status|import\/restore-demo|import\/status)/);
assert.match(source, /\[currentUser\?\.USERNAME, refreshStatus\]/);

console.log('Data Foundation VPD client contract passed: restore and live counts use the selected demo identity.');
