#!/usr/bin/env node
/* Source-only OML lifecycle contract: deployment owns creation; API only scores. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'db/schema/12_oml_models.sql'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'scripts/bootstrap_db.sh'), 'utf8');
const api = fs.readFileSync(path.join(root, 'backend/routes/ml.js'), 'utf8');
const models = ['DEMAND_SURGE_MODEL', 'CUSTOMER_SEGMENT_MODEL', 'REVENUE_PREDICT_MODEL', 'PRODUCT_CLUSTER_MODEL'];
const assertions = [
  ['bootstrap invokes OML lifecycle after semantic views', /11_healthcare_semantic_views\.sql[\s\S]*12_oml_models\.sql/i.test(bootstrap)],
  ['lifecycle uses DBMS_DATA_MINING.CREATE_MODEL', /DBMS_DATA_MINING\.CREATE_MODEL/i.test(schema)],
  ['lifecycle verifies all four persisted models', /v_count\s*<>\s*4/i.test(schema)],
  ['API exposes model lifecycle readiness', /router\.get\('\/models\/status'/i.test(api)],
  ['API exposes persistence readiness', /router\.get\('\/persistence\/status'/i.test(api)],
  ['missing models fail closed', /OML_MODEL_NOT_READY[\s\S]*fallbackAllowed:\s*false/i.test(api)],
  ['API does not create or drop OML models', !/DBMS_DATA_MINING\.(?:CREATE_MODEL|DROP_MODEL)/i.test(api)],
  ['forecast scoring view is a lifecycle-owned projection', /CREATE OR REPLACE VIEW oml_revenue_training_v/i.test(schema)],
  ['cluster scoring view is a lifecycle-owned projection', /CREATE OR REPLACE VIEW oml_product_cluster_v/i.test(schema)],
  ...models.map((model) => [`exact model ${model} is lifecycle-owned`, new RegExp(`replace_model\\('${model}'`, 'i').test(schema)]),
];
const failed = assertions.filter(([, pass]) => !pass);
for (const [name, pass] of assertions) process.stdout.write(`${pass ? 'PASS' : 'RED '} ${name}\n`);
process.stdout.write(`\nHealthcare OML lifecycle: ${assertions.length - failed.length}/${assertions.length} PASS, ${failed.length} RED\n`);
if (failed.length) process.exitCode = 1;
