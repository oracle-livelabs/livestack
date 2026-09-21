const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const csvPath = path.resolve(__dirname, './demo-dataset/required/social_posts.csv');
const rows = parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true });
const postedAt = rows.map((row) => new Date(row.posted_at).getTime()).filter(Number.isFinite);
const first = Math.min(...postedAt);
const last = Math.max(...postedAt);
const spanDays = (last - first) / (24 * 60 * 60 * 1000);

assert.strictEqual(rows.length, 5000, 'Canonical demo bundle must retain all seeded signals');
assert.ok(spanDays >= 360, `Canonical signal history must span at least 360 days, received ${spanDays.toFixed(1)}`);

console.log(`Demo dataset signal-history contract passed: ${rows.length} signals across ${spanDays.toFixed(1)} days.`);
