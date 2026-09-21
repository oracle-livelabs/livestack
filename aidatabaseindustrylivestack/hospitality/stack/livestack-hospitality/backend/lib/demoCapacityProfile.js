const DEMO_FULFILLMENT_CAPACITY_BY_CENTER = Object.freeze({
  'Summit Grand Edison Metro Hotel': 240,
  'Airport Hotel Ontario Airport Hotel': 190,
  'Joliet Gateway Hotel': 126,
  'Harborstone Lancaster South Hotel': 205,
  'Airport Hotel Union City Atlanta Airport': 150,
  'Extended Stay Kent Valley': 132,
  'Hialeah Miami Lakes Hotel': 145,
  'Summit Grand Denver Downtown Hotel': 250,
  'Phoenix West Hotel': 170,
  'Fall River Waterfront Hotel': 108,
  'Airport Hotel Shakopee Valley': 116,
  'Troutdale Extended Stay': 95,
  'Extended Stay Lebanon Nashville': 124,
  'Fremont Silicon Valley Hotel': 138,
  'Grand Garden Detroit Metro Airport': 215,
  'Middletown Delaware Hotel': 102,
  'Harborstone Missouri City Gulf Coast Resort': 220,
  'SpringHill Suites West Jordan': 118,
  'Airport Hotel Concord Mills': 112,
  'Extended Stay Plainfield Indianapolis': 122,
  'Harborstone North Las Vegas Hotel': 210,
  'Edwardsville Kansas City Hotel': 104,
  'Airport Hotel Etna Columbus': 110,
  'Sparks Reno Hotel': 128,
  'Brandon Tampa Extended Stay': 92,
  'Extended Stay Aberdeen Chesapeake': 120,
  'Airport Hotel New Braunfels Riverwalk': 125,
  'Olive Branch Memphis Hotel': 118,
  'Harborstone Kapolei Beach Resort': 160,
  'SpringHill Suites Anchorage Downtown': 105,
});

const DEMO_FULFILLMENT_CAPACITY_TOTAL = Object.values(DEMO_FULFILLMENT_CAPACITY_BY_CENTER)
  .reduce((sum, value) => sum + value, 0);

function validateDemoFulfillmentCapacityRows(rows) {
  const expectedNames = Object.keys(DEMO_FULFILLMENT_CAPACITY_BY_CENTER);
  const seen = new Set();
  const errors = [];
  let capacityTotal = 0;

  if (!Array.isArray(rows)) {
    errors.push('fulfillment_centers.csv capacity validation requires parsed rows.');
    return {
      valid: false,
      errors,
      centerCount: 0,
      capacityTotal: 0,
    };
  }

  if (rows.length !== expectedNames.length) {
    errors.push(`fulfillment_centers.csv must contain ${expectedNames.length} Harborstone property hotels, found ${rows.length}.`);
  }

  for (const row of rows) {
    const linePrefix = row?.__lineNumber ? `fulfillment_centers.csv line ${row.__lineNumber}` : 'fulfillment_centers.csv';
    const name = String(row?.center_name || '').trim();
    const capacity = Number(row?.capacity_units);

    if (!name) {
      errors.push(`${linePrefix}: center_name is required for capacity validation.`);
      continue;
    }

    if (seen.has(name)) {
      errors.push(`${linePrefix}: duplicate Harborstone property "${name}".`);
      continue;
    }
    seen.add(name);

    const expectedCapacity = DEMO_FULFILLMENT_CAPACITY_BY_CENTER[name];
    if (expectedCapacity == null) {
      errors.push(`${linePrefix}: unexpected Harborstone property "${name}".`);
    }

    if (!Number.isInteger(capacity) || capacity <= 0) {
      errors.push(`${linePrefix}: capacity_units must be a positive integer.`);
      continue;
    }

    capacityTotal += capacity;
    if (expectedCapacity != null && capacity !== expectedCapacity) {
      errors.push(`${linePrefix}: ${name} capacity_units must be ${expectedCapacity}, found ${capacity}.`);
    }
  }

  for (const expectedName of expectedNames) {
    if (!seen.has(expectedName)) {
      errors.push(`fulfillment_centers.csv is missing Harborstone property "${expectedName}".`);
    }
  }

  if (capacityTotal !== DEMO_FULFILLMENT_CAPACITY_TOTAL) {
    errors.push(
      `fulfillment_centers.csv capacity_units total must be ${DEMO_FULFILLMENT_CAPACITY_TOTAL}, found ${capacityTotal}.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    centerCount: rows.length,
    capacityTotal,
  };
}

module.exports = {
  DEMO_FULFILLMENT_CAPACITY_BY_CENTER,
  DEMO_FULFILLMENT_CAPACITY_TOTAL,
  validateDemoFulfillmentCapacityRows,
};
