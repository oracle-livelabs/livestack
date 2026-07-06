'use strict';

const CAPTURE_DATE = process.env.SLED_CAPTURE_DATE || '2026-07-03';
const VIEWPORT = Object.freeze({ width: 1280, height: 1066 });
const NOTE = 'Selected 1280x1066 live-app capture. Red boxes and numbered badges are deterministic DOM overlays used only where the instruction emphasizes a specific control, value, or result.';

function capture(group, route, file, view, alt) {
  return Object.freeze({
    group,
    route,
    file,
    view,
    caption: alt,
    alt,
    note: NOTE,
  });
}

const CAPTURES = Object.freeze([
  capture('welcome', 'welcome', 'introduction/images/sled-operations-brief.png', 'Colorado State and Local Government Service Operations LiveStack Guide - Introduction', 'Colorado Resident Services Overview with the statewide operating story'),
  capture('welcome', 'welcome', 'scene-1-sled-operations-brief/images/scene-1-sled-operations-brief.png', 'Scene 1 Welcome and Demo Orientation - Introduction', 'Welcome page establishing the Colorado statewide operating decision'),
  capture('welcome', 'welcome', 'scene-1-sled-operations-brief/images/operations-brief-workflow.png', 'Scene 1 Welcome and Demo Orientation - Task 1: Review the Colorado operating decision', 'Colorado operating workflow and nine connected use cases'),
  capture('welcome', 'welcome', 'scene-1-sled-operations-brief/images/start-demo-action.png', 'Scene 1 Welcome and Demo Orientation - Task 2: Start the guided workflow', 'Start the demo action leading to Data Foundation'),

  capture('foundation', 'datamodel', 'scene-2-seer-26ai-data-foundation/images/scene-2-seer-26ai-data-foundation.png', 'Scene 2 Data Foundation - Introduction', 'Data Foundation with the governed Colorado service domains'),
  capture('foundation', 'datamodel', 'scene-2-seer-26ai-data-foundation/images/prepare-dataset-counts.png', 'Scene 2 Data Foundation - Task 1: Verify the governed Colorado baseline', 'Populated record counts for the governed Colorado baseline'),
  capture('foundation', 'datamodel', 'scene-2-seer-26ai-data-foundation/images/what-gets-loaded-carousel.png', 'Scene 2 Data Foundation - Task 2: Review the connected data domains', 'What Gets Loaded carousel with connected Colorado service domains'),
  capture('foundation', 'datamodel', 'scene-2-seer-26ai-data-foundation/images/foundation-downstream-handoff.png', 'Scene 2 Data Foundation - Task 3: Connect the baseline to downstream decisions', 'Oracle capabilities connecting the Colorado baseline to downstream scenes'),

  capture('dashboard', 'dashboard', 'scene-3-public-service-command-center/images/scene-3-public-service-command-center.png', 'Scene 3 Public Service Command Center - Introduction', 'Public Service Command Center with the Colorado eligibility-risk signal'),
  capture('dashboard', 'dashboard', 'scene-3-public-service-command-center/images/command-center-kpis-overview.png', 'Scene 3 Public Service Command Center - Task 1: Read the eligibility-risk signal', 'Medicaid Eligibility Error Rate and 3.0 percent demo threshold'),
  capture('dashboard', 'dashboard', 'scene-3-public-service-command-center/images/signal-velocity-and-service-value.png', 'Scene 3 Public Service Command Center - Task 2: Compare workload velocity and service value', 'Agency workload velocity and public service value evidence'),
  capture('dashboard', 'dashboard', 'scene-3-public-service-command-center/images/services-under-pressure.png', 'Scene 3 Public Service Command Center - Task 3: Identify services under pressure', 'Services under pressure filtered to an eligibility-related investigation'),

  capture('signals', 'social', 'scene-4-resident-demand-signals/images/scene-4-resident-demand-signals.png', 'Scene 4 Resident Demand Signals - Introduction', 'Colorado Resident Demand Signals with vector search and signal evidence'),
  capture('signals', 'social', 'scene-4-resident-demand-signals/images/public-service-vector-search.png', 'Scene 4 Resident Demand Signals - Task 1: Search for eligibility-related demand', 'Vector search for benefits eligibility appointment backlog'),
  capture('signals', 'social', 'scene-4-resident-demand-signals/images/resident-signal-summary.png', 'Scene 4 Resident Demand Signals - Task 2: Interpret the signal summary', 'Colorado Resident Signal Summary with operating priorities'),
  capture('signals', 'social', 'scene-4-resident-demand-signals/images/resident-signal-momentum.png', 'Scene 4 Resident Demand Signals - Task 3: Inspect priority signals', 'Priority Colorado resident signal cards and follow-up evidence'),

  capture('graph', 'graph', 'scene-5-community-partner-network/images/scene-5-community-partner-network.png', 'Scene 5 Community Partner Network - Introduction', 'Colorado Community Partner Network and coordination workspace'),
  capture('graph', 'graph', 'scene-5-community-partner-network/images/partner-graph-workspace.png', 'Scene 5 Community Partner Network - Task 1: Explore the partner graph', 'Colorado eligibility partner graph at two hops'),
  capture('graph', 'graph', 'scene-5-community-partner-network/images/partner-program-relationships.png', 'Scene 5 Community Partner Network - Task 2: Review partner and program evidence', 'Colorado partner and public program relationship evidence'),
  capture('graph', 'graph', 'scene-5-community-partner-network/images/graph-query-explorer.png', 'Scene 5 Community Partner Network - Task 3: Run a governed graph query', 'SQL PGQ evidence for a Colorado eligibility coordination path'),

  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/scene-6-service-access-and-coverage-map.png', 'Scene 6 Service Access and Coverage Map - Introduction', 'Colorado Service Access and Coverage Map'),
  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/global-vpd-statewide.png', 'Scene 6 Service Access and Coverage Map - Task 1: Establish the statewide Colorado view', 'Jessica Chen global VPD view across Colorado'),
  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/service-access-map-layers.png', 'Scene 6 Service Access and Coverage Map - Task 2: Compare map layers', 'Colorado map layers and demand regions'),
  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/service-sites-table.png', 'Scene 6 Service Access and Coverage Map - Task 2: Compare service sites', 'Colorado service sites with in-state locations and capacity'),
  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/capacity-and-access-signals.png', 'Scene 6 Service Access and Coverage Map - Task 2: Compare access and capacity', 'Colorado access and capacity signals'),
  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/regional-vpd-western-slope.png', 'Scene 6 Service Access and Coverage Map - Task 3: Demonstrate regional VPD scope', 'Maria Santos regional VPD view of the Western Slope'),
  capture('coverage', 'fulfillment', 'scene-6-service-access-and-coverage-map/images/restricted-vpd-no-operational-rows.png', 'Scene 6 Service Access and Coverage Map - Task 3: Demonstrate restricted VPD scope', 'Sam Taylor restricted VPD state with no operational rows'),

  capture('requests', 'orders', 'scene-7-service-request-workbench/images/scene-7-service-request-workbench.png', 'Scene 7 Service Request Workbench - Introduction', 'Service Request Workbench with a Colorado regional request queue'),
  capture('requests', 'orders', 'scene-7-service-request-workbench/images/service-request-workspace.png', 'Scene 7 Service Request Workbench - Task 1: Review the Western Slope request queue', 'Western Slope request list with approved lifecycle labels'),
  capture('requests', 'orders', 'scene-7-service-request-workbench/images/service-request-relational-detail.png', 'Scene 7 Service Request Workbench - Task 2: Inspect relational request evidence', 'Relational request detail with resident, center, route cost, and Request Line Items'),
  capture('requests', 'orders', 'scene-7-service-request-workbench/images/service-request-json-duality.png', 'Scene 7 Service Request Workbench - Task 3: Compare the JSON Duality document', 'JSON Duality document for the same Colorado service request'),
  capture('requests', 'orders', 'scene-7-service-request-workbench/images/service-task-route-progress.png', 'Scene 7 Service Request Workbench - Task 4: Inspect the Service Task Route', 'Service Task Route with the complete field-resolution lifecycle'),
  capture('requests', 'orders', 'scene-7-service-request-workbench/images/service-request-oracle-evidence.png', 'Scene 7 Service Request Workbench - Task 5: Connect the request to Oracle evidence', 'Oracle Internals for JSON Duality Spatial routing and VPD'),

  capture('analytics', 'oml', 'scene-8-demand-and-capacity-analytics/images/scene-8-demand-and-capacity-analytics.png', 'Scene 8 Demand and Capacity Analytics - Introduction', 'Demand and Capacity Analytics with statewide Colorado model evidence'),
  capture('analytics', 'oml', 'scene-8-demand-and-capacity-analytics/images/demand-surge-risk.png', 'Scene 8 Demand and Capacity Analytics - Task 1: Review demand risk', 'Colorado public-service demand risk model output'),
  capture('analytics', 'oml', 'scene-8-demand-and-capacity-analytics/images/resident-need-segments.png', 'Scene 8 Demand and Capacity Analytics - Task 2: Inspect resident need segments', 'Colorado Resident Need Segments and in-state resident profiles'),
  capture('analytics', 'oml', 'scene-8-demand-and-capacity-analytics/images/service-value-forecast.png', 'Scene 8 Demand and Capacity Analytics - Task 3: Interpret the service value forecast', 'Service value forecast supporting the Colorado operating decision'),
  capture('analytics', 'oml', 'scene-8-demand-and-capacity-analytics/images/vector-k-means-clusters.png', 'Scene 8 Demand and Capacity Analytics - Task 4: Compare related service patterns', 'Vector K-Means clusters for related Colorado service patterns'),
  capture('analytics', 'oml', 'scene-8-demand-and-capacity-analytics/images/capacity-intelligence.png', 'Scene 8 Demand and Capacity Analytics - Task 5: Compare demand and capacity', 'Demand Capacity Across Colorado Service Centers'),

  capture('askdata', 'askdata', 'scene-9-ask-seer-operations-data/images/scene-9-ask-seer-operations-data.png', 'Scene 9 Ask State and Local Government Data - Introduction', 'Ask State and Local Government Data with governed answer modes'),
  capture('askdata', 'askdata', 'scene-9-ask-seer-operations-data/images/ask-public-service-data-narrate-mode.png', 'Scene 9 Ask State and Local Government Data - Task 1: Use Narrate for the operating brief', 'Narrated answer for the Colorado eligibility and capacity question'),
  capture('askdata', 'askdata', 'scene-9-ask-seer-operations-data/images/ask-public-service-data-chat-mode.png', 'Scene 9 Ask State and Local Government Data - Task 2: Use Chat for a follow-up', 'Chat follow-up about Colorado service-level risk'),
  capture('askdata', 'askdata', 'scene-9-ask-seer-operations-data/images/ask-public-service-data-generated-sql.png', 'Scene 9 Ask State and Local Government Data - Task 3: Inspect generated SQL', 'Generated SQL for the governed eligibility and capacity question'),
  capture('askdata', 'askdata', 'scene-9-ask-seer-operations-data/images/ask-public-service-data-run-sql-results.png', 'Scene 9 Ask State and Local Government Data - Task 4: Run authorized SQL', 'Authorized Oracle result rows for the Colorado operating question'),

  capture('agents', 'agents', 'scene-10-public-service-ai-agent-console/images/scene-10-public-service-ai-agent-console.png', 'Scene 10 Public Service AI Agent Console - Introduction', 'Public Service AI Agent Console for the Colorado operating decision'),
  capture('agents', 'agents', 'scene-10-public-service-ai-agent-console/images/agent-console-workspace.png', 'Scene 10 Public Service AI Agent Console - Task 1: Review the governed agent workspace', 'Governed public-service agent teams and prompt workspace'),
  capture('agents', 'agents', 'scene-10-public-service-ai-agent-console/images/agent-public-service-response.png', 'Scene 10 Public Service AI Agent Console - Task 2: Ask for constrained-service evidence', 'Agent response identifying constrained Colorado public services'),
  capture('agents', 'agents', 'scene-10-public-service-ai-agent-console/images/agent-action-audit-trail.png', 'Scene 10 Public Service AI Agent Console - Task 3: Inspect the action audit trail', 'Recent Agent Actions with the audited Colorado interaction'),

  capture('dataset', 'welcome', 'scene-11-use-your-own-public-service-data/images/scene-11-use-your-own-public-service-data.png', 'Scene 11 Use Your Own Public Service Data - Introduction', 'Use Your Own Public Service Data with validation and restore controls'),
  capture('dataset', 'welcome', 'scene-11-use-your-own-public-service-data/images/open-dataset-tool.png', 'Scene 11 Use Your Own Public Service Data - Task 1: Open the dataset tool', 'Dataset tool opened with the active Colorado demo baseline'),
  capture('dataset', 'welcome', 'scene-11-use-your-own-public-service-data/images/template-and-upload-workflow.png', 'Scene 11 Use Your Own Public Service Data - Task 2: Review the template and upload workflow', 'Template download completed ZIP validation and upload workflow'),
  capture('dataset', 'welcome', 'scene-11-use-your-own-public-service-data/images/preview-restore-seeded-dataset.png', 'Scene 11 Use Your Own Public Service Data - Task 3: Preview the seeded baseline', 'Preview Restore results for the seeded Colorado demo data'),
]);

if (CAPTURES.length !== 52) {
  throw new Error(`SLED runbook capture plan must contain exactly 52 entries; found ${CAPTURES.length}.`);
}

const duplicateFiles = CAPTURES
  .map((entry) => entry.file)
  .filter((file, index, files) => files.indexOf(file) !== index);
if (duplicateFiles.length) {
  throw new Error(`Duplicate SLED runbook capture paths: ${duplicateFiles.join(', ')}`);
}

module.exports = {
  CAPTURE_DATE,
  CAPTURES,
  NOTE,
  VIEWPORT,
};
