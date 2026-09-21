#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildOwnerCloseNote } = require('../backend/lib/ownerCloseNote');

const ROOT = path.resolve(__dirname, '..');

const reviewNote = buildOwnerCloseNote({
  PROPERTY_NAME: 'Summit Resort',
  FISCAL_PERIOD_LABEL: '2026-05',
  OWNER_VALIDATION_STATUS: 'exceptions to review',
  EXCEPTION_COUNT: 2,
  CLOSE_READINESS_SCORE: 77,
});
assert.equal(reviewNote.source, 'oracle-governed-summary');
assert.match(reviewNote.note, /^Summit Resort 2026-05 close is exceptions to review\./);
assert.match(reviewNote.note, /2 exception\(s\) remain/);
assert.match(reviewNote.note, /no exception has been auto-attested/);

const clearNote = buildOwnerCloseNote({
  PROPERTY_NAME: 'City Center Grand Hotel',
  FISCAL_PERIOD_LABEL: '2026-05',
  OWNER_VALIDATION_STATUS: 'owner validated',
  EXCEPTION_COUNT: 0,
  CLOSE_READINESS_SCORE: 100,
});
assert.match(clearNote.note, /Owner validation is recorded/);
assert.doesNotMatch(clearNote.note, /no exception has been auto-attested/);

const routeSource = fs.readFileSync(path.join(ROOT, 'backend/routes/financialValidation.js'), 'utf8');
assert.match(routeSource, /router\.post\('\/close-note'/);
assert.match(routeSource, /const generated = buildOwnerCloseNote\(summary\);/);
assert.doesNotMatch(routeSource, /summarizeContext/);
assert.doesNotMatch(routeSource, /await\s+buildOwnerCloseNote/);

const pageSource = fs.readFileSync(path.join(ROOT, 'frontend/src/pages/OwnerFinancialValidation.jsx'), 'utf8');
assert.match(pageSource, /Generate owner close note/);
assert.match(pageSource, /Governed close summary/);
assert.match(pageSource, /result\.propertyName \|\| selectedSubmission\.PROPERTY_NAME/);

console.log('Owner close-note verification passed: the governed note is synchronous, targeted, non-attesting, and free of request-bound inference.');
