const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../db/data/load_social_posts.sql'), 'utf8');

assert.match(source, /5000 channel, revenue, and demand signals across a 365-day history/);
assert.match(source, /POWER\(DBMS_RANDOM\.VALUE\(0, 1\), 2\) \* 365 \* 24/);
assert.match(source, /WHEN MOD\(i, 500\) = 0 THEN \(i \/ 500\) \* 36\.4 \* 24/);
assert.doesNotMatch(source, /\* 30 \* 24/);

console.log('Signal history seed contract passed: the canonical seed spans one year with monthly anchors.');
