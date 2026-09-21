#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  DEMO_FULFILLMENT_CAPACITY_TOTAL,
  validateDemoFulfillmentCapacityRows,
} = require('../backend/lib/demoCapacityProfile');

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (quoted && char === '"' && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && char === ',') {
      values.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

function readFulfillmentCenterRows() {
  const csvPath = path.join(ROOT, 'verification/demo-dataset/required/fulfillment_centers.csv');
  const lines = fs.readFileSync(csvPath, 'utf8')
    .trim()
    .split(/\r?\n/);
  const header = parseCsvLine(lines[0]);

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const row = { __lineNumber: rowIndex + 2 };

    header.forEach((column, columnIndex) => {
      row[column] = values[columnIndex];
    });

    return row;
  });
}

function readBuiltFrontendBundle() {
  const assetsDir = path.join(ROOT, 'frontend/dist/assets');
  return fs.readdirSync(assetsDir)
    .filter((fileName) => fileName.endsWith('.js'))
    .map((fileName) => fs.readFileSync(path.join(assetsDir, fileName), 'utf8'))
    .join('\n');
}

function assertFulfillmentPageUsesCapacityUnits() {
  const sourcePath = path.join(ROOT, 'frontend/src/pages/FulfillmentMap.jsx');

  if (fs.existsSync(sourcePath)) {
    const fulfillmentMap = fs.readFileSync(sourcePath, 'utf8');

    assert.match(
      fulfillmentMap,
      /radius=\{centerRadius\(c\.CAPACITY_UNITS\)\}/,
      'Fulfillment map marker sizing must use fulfillment_centers.capacity_units.'
    );
    assert.match(
      fulfillmentMap,
      /Room \/ Service Capacity:[\s\S]*formatNumber\(c\.CAPACITY_UNITS\)/,
      'Fulfillment map popup must display fulfillment_centers.capacity_units.'
    );
    assert.match(
      fulfillmentMap,
      /const totalCapacity\s*=\s*\(centers \|\| \[\]\)\.reduce\(\(s, c\) => s \+ \(c\.CAPACITY_UNITS/,
      'Fulfillment page total capacity stat must sum fulfillment_centers.capacity_units.'
    );
    assert.match(
      fulfillmentMap,
      /<th className="text-right py-2 px-3">Service Capacity<\/th>[\s\S]*formatNumber\(c\.CAPACITY_UNITS\)/,
      'Fulfillment table Service Capacity column must display fulfillment_centers.capacity_units.'
    );
    assert.doesNotMatch(
      fulfillmentMap,
      /<th className="text-left py-2 px-3">Primary Service<\/th>/,
      'Fulfillment table should not include the Primary Service column.'
    );
    assert.doesNotMatch(
      fulfillmentMap,
      /c\.TOTAL_UNITS/,
      'Fulfillment page should not use inventory TOTAL_UNITS for room/service capacity display.'
    );
    assert.match(
      fulfillmentMap,
      /Occupied Rooms/,
      'Fulfillment page must label open room usage as Occupied Rooms.'
    );
    assert.doesNotMatch(
      fulfillmentMap,
      /Open Work Orders|Open Service Cases/,
      'Fulfillment page should not label occupied rooms as work orders or service cases.'
    );
    return;
  }

  const bundle = readBuiltFrontendBundle();
  assert.match(
    bundle,
    /Room \/ Service Capacity:[\s\S]{0,1000}CAPACITY_UNITS/,
    'Built fulfillment page popup must display fulfillment_centers.capacity_units.'
  );
  assert.match(
    bundle,
    /Room & Service Capacity/,
    'Built fulfillment page must include the room/service capacity stat.'
  );
  assert.doesNotMatch(
    bundle,
    /TOTAL_UNITS/,
    'Built fulfillment page should not use inventory TOTAL_UNITS for room/service capacity display.'
  );
  assert.doesNotMatch(
    bundle,
    /Primary Service/,
    'Built fulfillment table should not include the Primary Service column.'
  );
  assert.match(
    bundle,
    /Occupied Rooms/,
    'Built fulfillment page must label open room usage as Occupied Rooms.'
  );
  assert.doesNotMatch(
    bundle,
    /Open Work Orders|Open Service Cases/,
    'Built fulfillment page should not label occupied rooms as work orders or service cases.'
  );
}

function assertFulfillmentApiUsesServiceCaseUtilization() {
  const sourcePath = path.join(ROOT, 'backend/routes/fulfillment.js');
  const fulfillmentRoute = fs.readFileSync(sourcePath, 'utf8');

  assert.match(
    fulfillmentRoute,
    /ROUND\(NVL\(\(SELECT COUNT\(\*\) FROM orders o2[\s\S]*o2\.fulfillment_center_id = fc\.center_id[\s\S]*o2\.order_status IN \('pending','confirmed','processing'\)[\s\S]*NULLIF\(fc\.capacity_units, 0\) \* 100, 0\), 1\) AS current_load_pct/,
    'Fulfillment API utilization must use occupied rooms divided by room capacity.'
  );
  assert.match(
    fulfillmentRoute,
    /AS occupied_rooms/,
    'Fulfillment API must expose occupied room counts as OCCUPIED_ROOMS.'
  );
}

assertFulfillmentPageUsesCapacityUnits();
assertFulfillmentApiUsesServiceCaseUtilization();

const capacityProfile = validateDemoFulfillmentCapacityRows(readFulfillmentCenterRows());

assert.deepEqual(capacityProfile.errors, []);
assert.equal(capacityProfile.valid, true);
assert.equal(capacityProfile.centerCount, 30);
assert.equal(capacityProfile.capacityTotal, DEMO_FULFILLMENT_CAPACITY_TOTAL);

console.log('Demo restore capacity contract passed.');
