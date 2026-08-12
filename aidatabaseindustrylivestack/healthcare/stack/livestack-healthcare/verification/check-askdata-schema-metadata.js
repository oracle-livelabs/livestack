#!/usr/bin/env node

const assert = require('assert');
const {
  getHealthcareSchemaObjectMetadata,
  groupHealthcareSchemaObjectMetadata,
  isAssistantQueryableObject,
  validateReadOnlySql,
} = require('../backend/lib/ollamaAssistant');

const REQUIRED_DOMAINS = [
  'Service Requests',
  'Quality & Capacity',
  'Logistics',
  'Care Services',
  'Care Pathways',
  'AI Agent Actions',
  'Reference Data',
];

const REQUIRED_OBJECTS = [
  'care_service_requests',
  'care_request_status_lookup',
  'care_request_signal_label_lookup',
  'care_request_items',
  'care_service_requests_dv',
  'healthcare_service_requests_v',
  'care_services_v',
  'care_sites_v',
  'quality_capacity_signals_v',
  'care_logistics_sites_v',
  'care_supply_capacity_v',
  'care_logistics_zones_v',
  'care_demand_regions_v',
  'care_logistics_routes_v',
  'care_logistics_kpis_v',
  'care_service_signal_matches_v',
  'event_stream',
  'demand_forecasts',
  'care_graph_node_metadata',
  'care_graph_edge_metadata',
  'care_graph_entity_metrics',
  'care_graph_pathway_findings',
  'care_graph_relationship_metadata',
  'care_pathway_cases',
  'healthcare_agent_actions_v',
];

const REQUIRED_OBJECT_EXPECTATIONS = {
  care_service_requests: {
    domain: 'Service Requests',
    displayName: 'Care Service Requests',
  },
  care_service_requests_dv: {
    domain: 'Service Requests',
    displayName: 'Care Service Requests JSON Duality View',
  },
  quality_capacity_signals_v: {
    domain: 'Quality & Capacity',
    displayName: 'Quality & Capacity Signals',
  },
};

const objects = getHealthcareSchemaObjectMetadata();
const objectsByName = new Map(objects.map((object) => [object.object_name, object]));
const groups = groupHealthcareSchemaObjectMetadata(objects);
const domains = new Set(groups.map((group) => group.domain));

assert(objects.length > 0, 'Expected Ask Healthcare Data schema metadata objects');

for (const domain of REQUIRED_DOMAINS) {
  assert(domains.has(domain), `Missing metadata domain: ${domain}`);
}

for (const objectName of REQUIRED_OBJECTS) {
  assert(objectsByName.has(objectName), `Missing metadata for ${objectName}`);
}

for (const object of objects) {
  assert.strictEqual(object.object_name, object.object_name.toLowerCase(), `${object.object_name}: object_name should remain lowercase for SQL examples and chips`);
  assert(object.object_type, `${object.object_name}: missing object_type`);
  assert(object.domain, `${object.object_name}: missing domain`);
  assert(object.display_name, `${object.object_name}: missing display_name`);
  assert(object.description, `${object.object_name}: missing description`);
  assert(Array.isArray(object.example_questions), `${object.object_name}: example_questions must be an array`);
  assert(object.example_questions.length > 0, `${object.object_name}: expected at least one example question`);
  assert.strictEqual(object.is_queryable_by_assistant, true, `${object.object_name}: metadata should only expose assistant-queryable objects`);
  assert.strictEqual(isAssistantQueryableObject(object.object_name), true, `${object.object_name}: metadata drifted from assistant allowlist`);

  const validation = validateReadOnlySql(`SELECT * FROM ${object.object_name} FETCH FIRST 1 ROWS ONLY`);
  assert(validation.ok, `${object.object_name}: metadata object should pass read-only SQL validation: ${validation.reason || 'n/a'}`);
}

for (const [objectName, expected] of Object.entries(REQUIRED_OBJECT_EXPECTATIONS)) {
  const object = objectsByName.get(objectName);
  assert.strictEqual(object.domain, expected.domain, `${objectName}: unexpected domain`);
  assert.strictEqual(object.display_name, expected.displayName, `${objectName}: unexpected display name`);
}

for (const group of groups) {
  assert(group.object_count === group.objects.length, `${group.domain}: object_count should match objects length`);
  for (const object of group.objects) {
    assert.strictEqual(object.domain, group.domain, `${object.object_name}: grouped under wrong domain`);
  }
}

console.log(`Ask Healthcare Data schema metadata check passed: ${objects.length} objects across ${groups.length} domains.`);
