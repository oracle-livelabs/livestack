const assert = require('assert');
const fs = require('fs');
const path = require('path');

const route = fs.readFileSync(path.resolve(__dirname, '../backend/routes/dashboard.js'), 'utf8');
const dashboard = fs.readFileSync(path.resolve(__dirname, '../frontend/src/pages/Dashboard.jsx'), 'utf8');

assert.match(route, /NUMTODSINTERVAL\(:hours, 'HOUR'\)/);
assert.match(route, /`\, \{ hours \}, req\.demoUser\)/);
assert.doesNotMatch(route, /INTERVAL '\$\{hours\}' HOUR/);
assert.match(dashboard, /\{ label: '1y',\s+hours: 8760 \}/);

console.log('Signal velocity range contract passed: the 1y filter uses a bound NUMTODSINTERVAL.');
