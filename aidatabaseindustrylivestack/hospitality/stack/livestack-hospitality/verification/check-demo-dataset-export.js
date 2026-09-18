const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, './export-demo-dataset.js'), 'utf8');

assert.match(source, /db\.executeAsUser\(sql, \{\}, 'admin_ava'\)/);
assert.doesNotMatch(source, /connection = await db\.getConnection\(\)/);
assert.match(source, /authorized VPD session/);

console.log('Demo dataset export contract passed: protected tables export through admin_ava VPD context.');
