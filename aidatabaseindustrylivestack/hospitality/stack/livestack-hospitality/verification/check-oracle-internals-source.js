const assert = require('assert');
const { collectOracleInternalsBlocks } = require('./oracleInternalsBlocks');

const expectedCounts = {
  'AgentConsole.jsx': 1,
  'AskData.jsx': 1,
  'Dashboard.jsx': 2,
  'DataModel.jsx': 1,
  'FulfillmentMap.jsx': 3,
  'InfluencerGraph.jsx': 3,
  'OMLAnalytics.jsx': 5,
  'Orders.jsx': 4,
  'OwnerFinancialValidation.jsx': 4,
  'SocialFeed.jsx': 1,
};

const blocks = collectOracleInternalsBlocks();
const counts = blocks.reduce((result, block) => {
  result[block.file] = (result[block.file] || 0) + 1;
  return result;
}, {});

assert.deepStrictEqual(counts, expectedCounts, 'Oracle Internals block inventory changed');
assert.strictEqual(blocks.length, 25, 'Expected 25 Oracle Internals code blocks');

for (const block of blocks) {
  const executable = block.code
    .replace(/--.*$/gm, '')
    .replace(/'(?:''|[^'])*'/g, "''");
  const label = `${block.file} #${block.index}`;

  assert.doesNotMatch(executable, /\.\.\./, `${label} contains executable placeholder ellipses`);
  assert.doesNotMatch(executable, /:\w+/, `${label} contains unresolved bind variables`);
  assert.doesNotMatch(block.code, /guest_experience_network|guest_issue_entities|guest_service_requests/i,
    `${label} references a graph object that is not installed`);
  assert.doesNotMatch(block.code, /OML_guest_RFM_V|CUST_SEGMENT_SETTINGS|DEMAND_SURGE_SETTINGS|SURGE_FLAG/,
    `${label} references a stale OML object or column`);
}

const combined = blocks.map((block) => block.code).join('\n');
assert.match(combined, /GRAPH_TABLE \(fraud_network/i);
assert.match(combined, /ORDER BY criticality_score DESC/i);
assert.match(combined, /CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW orders_dv/i);
assert.match(combined, /ROLLBACK TO copy_paste_validation/i);
assert.match(combined, /VECTOR_EMBEDDING\(ALL_MINILM_L12_V2\s+USING 'suite with city views' AS DATA\)/i);

console.log(`Oracle Internals source contract passed: ${blocks.length} blocks across ${Object.keys(counts).length} scenes.`);
