const db = require('../config/database');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_PROFILE = 'SC_LLAMA_PROFILE';
const OLLAMA_REQUEST_TIMEOUT_MS = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS || '45000', 10);
const ASKDATA_SQL_TIMEOUT_MS = parseInt(process.env.ASKDATA_SQL_TIMEOUT_MS || '30000', 10);
const ASKDATA_MAX_ROWS = Math.max(1, Math.min(parseInt(process.env.ASKDATA_MAX_ROWS || '200', 10), 500));
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
const OLLAMA_UNAVAILABLE_MESSAGE = 'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.';
const OLLAMA_MODEL_MISSING_MESSAGE = `Model ${OLLAMA_MODEL} is not available in Ollama. Pull or configure the model before using Ask Energy & Utilities Data.`;
const GOVERNED_SCHEMA_BLOCK_MESSAGE = 'This query was not executed because it falls outside the allowed governed Energy & Utilities schema.';
const ASKDATA_ERROR_MESSAGES = Object.freeze({
  OLLAMA_UNAVAILABLE: OLLAMA_UNAVAILABLE_MESSAGE,
  OLLAMA_MODEL_MISSING: OLLAMA_MODEL_MISSING_MESSAGE,
  OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
  MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific Energy & Utilities data question.',
  SQL_GENERATION_FAILED: 'Unable to generate a safe Oracle SQL query for that question. Try rephrasing with a more specific metric, time window, or entity.',
  SQL_VALIDATION_BLOCKED: GOVERNED_SCHEMA_BLOCK_MESSAGE,
  ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific metric or governed Energy & Utilities view.',
  VPD_ACCESS_ISSUE: 'The governed access context could not be applied for this request.',
  UNEXPECTED_BACKEND_RESPONSE: 'Ask Energy & Utilities Data received an unexpected backend response.',
  REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
});
const ALLOWED_TABLES = [
  'AGENT_ACTIONS',
  'APP_USERS',
  'BRANDS',
  'RESTORATION_CASE_ENTITIES',
  'UTILITY_GRAPH_EDGE_METADATA',
  'UTILITY_GRAPH_ENTITIES',
  'UTILITY_GRAPH_ENTITY_METRICS',
  'UTILITY_GRAPH_NODE_METADATA',
  'UTILITY_GRAPH_RESTORATION_FINDINGS',
  'UTILITY_GRAPH_RELATIONSHIPS',
  'UTILITY_GRAPH_RELATIONSHIP_METADATA',
  'SERVICE_TERRITORY_REGIONS_V',
  'FIELD_LOGISTICS_KPIS_V',
  'FIELD_CREW_ROUTES_V',
  'FIELD_LOGISTICS_SITES_V',
  'FIELD_LOGISTICS_ZONES_V',
  'UTILITY_REQUEST_ITEMS',
  'UTILITY_REQUEST_SIGNAL_LABEL_LOOKUP',
  'UTILITY_REQUEST_STATUS_LOOKUP',
  'UTILITY_SIGNAL_MATCHES_V',
  'UTILITY_SERVICE_REQUESTS',
  'UTILITY_SERVICE_REQUESTS_DV',
  'UTILITY_SERVICES_V',
  'SERVICE_POINTS_V',
  'RESTORATION_CASES',
  'ASSET_CAPACITY_V',
  'CUSTOMERS',
  'DEMAND_FORECASTS',
  'DEMAND_REGIONS',
  'EVENT_STREAM',
  'FULFILLMENT_CENTERS',
  'FULFILLMENT_ZONES',
  'UTILITIES_AGENT_ACTIONS_V',
  'UTILITY_SERVICE_REQUESTS_V',
  'INFLUENCERS',
  'INFLUENCER_CONNECTIONS',
  'INVENTORY',
  'ORDERS',
  'ORDER_ITEMS',
  'POST_PRODUCT_MENTIONS',
  'PRODUCTS',
  'RELIABILITY_LOAD_SIGNALS_V',
  'SHIPMENTS',
  'SOCIAL_POSTS',
];
const ALLOWED_TABLE_SET = new Set(ALLOWED_TABLES);
const SCHEMA_DOMAIN_ORDER = [
  'Service Requests',
  'Reliability, Production & Compliance',
  'Field Operations',
  'Cross-Sector Services & Assets',
  'Operational Event Graph',
  'AI Agent Actions',
  'Reference Data',
];

function schemaObject(objectName, objectType, domain, displayName, description, exampleQuestions = []) {
  return Object.freeze({
    object_name: objectName.toLowerCase(),
    object_type: objectType,
    domain,
    display_name: displayName,
    description,
    example_questions: Object.freeze(exampleQuestions),
  });
}

const UTILITIES_SCHEMA_OBJECT_METADATA = Object.freeze([
  schemaObject(
    'UTILITY_SERVICE_REQUESTS',
    'view',
    'Service Requests',
    'Utility Service Requests',
    'Governed service request records and request-level attributes.',
    ['Which utility service requests are open this week?', 'Show service request priority value by service point.']
  ),
  schemaObject(
    'UTILITY_REQUEST_ITEMS',
    'view',
    'Service Requests',
    'Utility Request Line Items',
    'Line-item details for requested utility services, supplies, quantity, unit cost, and line value.',
    ['Which services have the highest requested volume?', 'Show line value by asset capacity.']
  ),
  schemaObject(
    'UTILITY_SERVICE_REQUESTS_DV',
    'json_duality_view',
    'Service Requests',
    'Utility Service Requests JSON Duality View',
    'JSON Relational Duality view exposing service requests with nested line items.',
    ['Show the JSON document for a utility service request.', 'Which fields are in the service request duality view?']
  ),
  schemaObject(
    'UTILITY_SERVICE_REQUESTS_V',
    'view',
    'Service Requests',
    'Utility Service Requests',
    'Utilities semantic view of service requests, service points, logistics assignment, operational value, and signal attribution.',
    ['Which requesting service points have the most service activity?', 'Show signal-driven service requests by region.']
  ),
  schemaObject(
    'ORDERS',
    'table',
    'Service Requests',
    'Service Request Compatibility Rows',
    'Compatibility table behind utilities service request views; demo-facing SQL should prefer utility_service_requests.',
    ['Count compatibility request rows.', 'Compare compatibility rows to utility service request views.']
  ),
  schemaObject(
    'ORDER_ITEMS',
    'table',
    'Service Requests',
    'Service Request Item Compatibility Rows',
    'Compatibility table behind utility request line item views; demo-facing SQL should prefer utility_request_items.',
    ['Show compatibility line item volume.', 'Compare compatibility item rows to utility_request_items.']
  ),
  schemaObject(
    'RELIABILITY_LOAD_SIGNALS_V',
    'view',
    'Reliability, Production & Compliance',
    'Reliability, Production & Compliance Signals',
    'SAIDI/SAIFI, feeder utilization, gas pressure, water pressure, wastewater compliance, well production, refinery throughput, LNG logistics, emissions, HSE, maintenance, and crew-capacity signals used for operational monitoring.',
    ['Which reliability, production, and compliance signals have criticality score above 80?', 'Show cross-sector operational signals by source type.']
  ),
  schemaObject(
    'UTILITY_SIGNAL_MATCHES_V',
    'view',
    'Reliability, Production & Compliance',
    'Utility Service Signal Matches',
    'Matched reliability, production, compliance, HSE, emissions, and logistics signals connected to utility services and supplies by vector, keyword, hybrid, or visual methods.',
    ['Which signals are matched to critical utility services?', 'Show high-confidence service signal matches.']
  ),
  schemaObject(
    'SOCIAL_POSTS',
    'table',
    'Reliability, Production & Compliance',
    'Reliability, Production & Compliance Signal Records',
    'Inherited compatibility table storing electric reliability, gas pressure, water/wastewater compliance, oil & gas production, refinery, LNG, emissions, HSE, outage, telemetry, and load signal bulletins.',
    ['Count signals by channel.', 'Show recent elevated operational signals.']
  ),
  schemaObject(
    'POST_PRODUCT_MENTIONS',
    'table',
    'Reliability, Production & Compliance',
    'Signal-to-Service Mentions',
    'Join table connecting utility signal records to utility services and supplies.',
    ['Which services are referenced by the most signals?', 'Show signals linked to a specific utility service.']
  ),
  schemaObject(
    'INFLUENCERS',
    'table',
    'Reliability, Production & Compliance',
    'Energy & Utilities Signal Sources',
    'Inherited compatibility table for signal sources such as reliability desks, gas operations, water/wastewater compliance, production operations, pipeline integrity, refinery, LNG logistics, regulators, HSE, emissions, and partner feeds.',
    ['Which signal sources have the highest network impact?', 'Show signal sources by type.']
  ),
  schemaObject(
    'INFLUENCER_CONNECTIONS',
    'table',
    'Reliability, Production & Compliance',
    'Signal Source Relationships',
    'Compatibility table describing relationships between utility signal sources.',
    ['Which signal sources are most connected?', 'Show relationships among quality and logistics signal sources.']
  ),
  schemaObject(
    'EVENT_STREAM',
    'table',
    'Reliability, Production & Compliance',
    'Operational Event Stream',
    'Time-series operational events used by dashboards, agents, and monitoring workflows.',
    ['Show recent operational events.', 'Count event stream records by type.']
  ),
  schemaObject(
    'FIELD_LOGISTICS_SITES_V',
    'view',
    'Field Operations',
    'Field Operations Sites and Assets',
    'Utilities semantic view of field operations sites, assets, capacity, supply constraints, pending requests, restricted areas, and recommended actions.',
    ['Which field operations sites have the highest load?', 'Show operations sites with active constraints.']
  ),
  schemaObject(
    'ASSET_CAPACITY_V',
    'view',
    'Field Operations',
    'Asset Integrity and Capacity',
    'Utilities semantic view of supply, capacity, asset integrity, and parts status by field operations site.',
    ['Which supplies are below reorder point?', 'Show asset and capacity status by operations site.']
  ),
  schemaObject(
    'FIELD_LOGISTICS_ZONES_V',
    'view',
    'Field Operations',
    'Safety, Environmental, and Service Zones',
    'Spatial service, safety, environmental, leak-response, and repair-priority zones with utilities-facing display names for map, route, and coverage analysis.',
    ['Which zones cover emergency repair or leak response?', 'Show safety and service zone coverage by site.']
  ),
  schemaObject(
    'SERVICE_TERRITORY_REGIONS_V',
    'view',
    'Field Operations',
    'Restoration and Repair Priority Areas',
    'Demand and repair-priority regions using service territory demand terminology for utility-operator capacity and field execution analysis.',
    ['Which priority areas have the highest service territory demand index?', 'Show repair-priority regions by severity.']
  ),
  schemaObject(
    'FIELD_CREW_ROUTES_V',
    'view',
    'Field Operations',
    'Crew Routes and Repair Corridors',
    'Utilities semantic view of field movement routes, repair corridors, partner labels, route status, and service-point tiers.',
    ['Which crew routes are in transit?', 'Show repair corridors by partner and status.']
  ),
  schemaObject(
    'FIELD_LOGISTICS_KPIS_V',
    'view',
    'Field Operations',
    'Field Operations KPIs',
    'KPI view for active field operations sites, available capacity, pending requests, and capacity or supply alerts.',
    ['How many field operations requests are pending?', 'Show capacity and supply alerts across the network.']
  ),
  schemaObject(
    'FULFILLMENT_CENTERS',
    'table',
    'Field Operations',
    'Field Operations Site Compatibility Rows',
    'Compatibility table behind field operations site views, retaining logistics site IDs and spatial location data.',
    ['Count active field operations sites.', 'Show field operations sites by region.']
  ),
  schemaObject(
    'FULFILLMENT_ZONES',
    'table',
    'Field Operations',
    'Field Operations Zone Geometry',
    'Compatibility table for service, safety, environmental, and repair-zone geometry and coverage attributes.',
    ['Show service zones by operations site.', 'Which zones have active route coverage?']
  ),
  schemaObject(
    'INVENTORY',
    'table',
    'Field Operations',
    'Asset Capacity Inventory',
    'Supply and capacity records by field operations site, including on-hand, reserved, incoming, and reorder values.',
    ['Which supplies are at risk?', 'Show inventory by field operations site.']
  ),
  schemaObject(
    'SHIPMENTS',
    'table',
    'Field Operations',
    'Field Operations Movements',
    'Field movement records for service requests, including route references, status, costs, and milestone timestamps.',
    ['Which field movements are in transit?', 'Show route status by service request.']
  ),
  schemaObject(
    'DEMAND_REGIONS',
    'table',
    'Field Operations',
    'Demand Region Compatibility Rows',
    'Compatibility table for service territory demand region geometry and demand-index inputs.',
    ['Show demand region records.', 'Which regions have high demand index values?']
  ),
  schemaObject(
    'DEMAND_FORECASTS',
    'table',
    'Field Operations',
    'Cross-Sector Demand and Capacity Forecasts',
    'Forecast records for utility services, assets, work plans, production, and capacity by region and date.',
    ['Which services or assets have the highest forecast demand?', 'Show forecast demand for the next week.']
  ),
  schemaObject(
    'UTILITY_SERVICES_V',
    'view',
    'Cross-Sector Services & Assets',
    'Utility Services, Assets, and Work Programs',
    'Utilities semantic view of electric, gas, water/wastewater, upstream, midstream, downstream, customer, compliance, field, and HSE/emissions service and asset records.',
    ['Which Energy & Utilities services are active?', 'Show services by subsector category.']
  ),
  schemaObject(
    'SERVICE_POINTS_V',
    'view',
    'Cross-Sector Services & Assets',
    'Service Points and Customer Accounts',
    'Utilities semantic view of service points, customer accounts, substations, service territories, and operational locations.',
    ['Which service points have the highest service activity?', 'Show service points by region.']
  ),
  schemaObject(
    'PRODUCTS',
    'table',
    'Cross-Sector Services & Assets',
    'Utility Service and Asset Compatibility Rows',
    'Compatibility table behind utility service and asset views, retaining service, asset, work-program, and supply catalog records.',
    ['Count active utility services and assets.', 'Show services by category.']
  ),
  schemaObject(
    'BRANDS',
    'table',
    'Cross-Sector Services & Assets',
    'Operator and Partner Compatibility Rows',
    'Compatibility table for utility operators, oil & gas facilities, service partners, manufacturers, regulators, and field organizations.',
    ['Show operator and service partners by tier.', 'Which partners support high-value services?']
  ),
  schemaObject(
    'CUSTOMERS',
    'table',
    'Reference Data',
    'Service Point Compatibility Rows',
    'Compatibility table behind service point views, retaining service point, location, and lifetime activity attributes.',
    ['Count service points by region.', 'Show service point activity fields.']
  ),
  schemaObject(
    'UTILITY_GRAPH_NODE_METADATA',
    'view',
    'Operational Event Graph',
    'Operational Event Node Metadata',
    'Energy & Utilities-friendly display names, operational labels, and descriptions for canonical graph node IDs.',
    ['Show metadata for GLK-2208.', 'Which graph nodes are emissions, HSE, pipeline, water, or production events?']
  ),
  schemaObject(
    'UTILITY_GRAPH_EDGE_METADATA',
    'view',
    'Operational Event Graph',
    'Operational Event Edge Metadata',
    'Energy & Utilities-friendly edge display names, categories, and descriptions for canonical graph edge types.',
    ['Show graph edge categories.', 'Which edge types connect events to compliance records and work orders?']
  ),
  schemaObject(
    'UTILITY_GRAPH_ENTITY_METRICS',
    'view',
    'Operational Event Graph',
    'Operational Event Entity Metrics',
    'Metric projections for graph nodes, including pathway volume, service point count, event count, risk score, reliability gaps, and direct connections.',
    ['Which operational event nodes have the highest risk score?', 'Show open reliability, compliance, HSE, and integrity gaps by node.']
  ),
  schemaObject(
    'UTILITY_GRAPH_RESTORATION_FINDINGS',
    'view',
    'Operational Event Graph',
    'Operational Event Findings',
    'Database-backed pathway findings for selected center nodes and graph depth across electric, gas, water/wastewater, upstream, midstream, downstream, emissions, and HSE events.',
    ['Show pathway findings for PIPE-17A.', 'What are recommended next investigations for emissions or HSE follow-up?']
  ),
  schemaObject(
    'UTILITY_GRAPH_ENTITIES',
    'table',
    'Operational Event Graph',
    'Operational Event Graph Entities',
    'Canonical graph entities for de-identified operational event cases, service points, affected customers, electric outages, gas leak events, water main breaks, wastewater events, pipeline anomalies, wells, facilities, refineries, LNG delays, emissions, HSE incidents, field crews, work orders, compliance records, and gaps.',
    ['Show graph entities by type.', 'Find the entity for RFY-HCU-02.']
  ),
  schemaObject(
    'UTILITY_GRAPH_RELATIONSHIPS',
    'table',
    'Operational Event Graph',
    'Operational Event Graph Relationships',
    'Canonical graph relationships connecting pathway entities with edge types and evidence.',
    ['Show relationships for a graph node.', 'Count relationships by edge type.']
  ),
  schemaObject(
    'UTILITY_GRAPH_RELATIONSHIP_METADATA',
    'view',
    'Operational Event Graph',
    'Operational Event Relationship Metadata',
    'Relationship rows joined to edge metadata for utilities-friendly graph query results.',
    ['Show relationship metadata for gas leak and emissions pathways.', 'Which relationships connect operational events to compliance records?']
  ),
  schemaObject(
    'RESTORATION_CASES',
    'table',
    'Operational Event Graph',
    'Operational Event Cases',
    'De-identified synthetic operational event case records used by the graph demo. Compatibility table name is retained for inherited graph APIs.',
    ['Which operational event cases have high risk score?', 'Show operational event cases by status.']
  ),
  schemaObject(
    'RESTORATION_CASE_ENTITIES',
    'table',
    'Operational Event Graph',
    'Operational Event Case Entity Links',
    'Links operational event cases to graph entities with role and evidence score.',
    ['Which entities support an operational event case?', 'Show case evidence links by role.']
  ),
  schemaObject(
    'UTILITIES_AGENT_ACTIONS_V',
    'view',
    'AI Agent Actions',
    'Energy & Utilities Agent Actions',
    'Utilities semantic view of AI agent audit actions and utilities-facing agent labels.',
    ['Which AI agent actions were completed today?', 'Show agent actions by type.']
  ),
  schemaObject(
    'AGENT_ACTIONS',
    'table',
    'AI Agent Actions',
    'Agent Action Audit Records',
    'Audit records for utilities AI agent tasks, decisions, execution status, and timestamps.',
    ['Show pending agent actions.', 'Count agent actions by status.']
  ),
  schemaObject(
    'APP_USERS',
    'table',
    'Reference Data',
    'Application Users',
    'Demo user records used for role, VPD, and user-context workflows.',
    ['Which demo users are available?', 'Show users by role.']
  ),
  schemaObject(
    'UTILITY_REQUEST_STATUS_LOOKUP',
    'table',
    'Reference Data',
    'Utility Request Status Labels',
    'Display labels, phases, and route semantics for canonical service request status keys.',
    ['What request statuses are available?', 'Show request phases by status.']
  ),
  schemaObject(
    'UTILITY_REQUEST_SIGNAL_LABEL_LOOKUP',
    'table',
    'Reference Data',
    'Utility Request Signal Labels',
    'Display labels and domains for service request signal attribution.',
    ['What signal labels are available?', 'Show signal domains for requests.']
  ),
]);
const PROFILE_CATALOG = Object.freeze({
  [DEFAULT_PROFILE]: Object.freeze({
    name: DEFAULT_PROFILE,
    status: 'ENABLED',
    model: OLLAMA_MODEL,
    provider: 'Ollama',
    type: 'Local SQL + reasoning',
    description: 'Primary local Ollama model for Ask Energy & Utilities Data.',
  }),
});
const PROFILE_ALIASES = new Map();
[
  [
    DEFAULT_PROFILE,
    [
      DEFAULT_PROFILE,
      'SC_COHERE_PROFILE',
      'SC_EMBED_PROFILE',
      'SC_GROK42_PROFILE',
      'SC_VISION_PROFILE',
      'OLLAMA_LLAMA32',
      'OLLAMA_LLAMA32_PROFILE',
      OLLAMA_MODEL,
    ],
  ],
].forEach(([profileName, aliases]) => {
  aliases.forEach((alias) => {
    const normalized = String(alias || '').trim().toUpperCase();
    if (normalized) PROFILE_ALIASES.set(normalized, profileName);
  });
});
const RELATIONSHIP_HINTS = [
  'UTILITY_REQUEST_ITEMS.SERVICE_REQUEST_ID joins to UTILITY_SERVICE_REQUESTS.SERVICE_REQUEST_ID.',
  'UTILITY_REQUEST_ITEMS.SERVICE_SUPPLY_ID joins to PRODUCTS.PRODUCT_ID.',
  'UTILITY_SERVICE_REQUESTS is the utilities-facing query surface for service requests and exposes REQUEST_VALUE, LOGISTICS_COST, REQUEST_STATUS, REQUEST_STATUS_DISPLAY_NAME, REQUEST_PHASE, LOGISTICS_MOVEMENT_STATUS, RELATED_SIGNAL_LABEL, RELATED_SIGNAL_DOMAIN, REQUESTING_SERVICE_POINT_ID, FIELD_LOGISTICS_SITE_ID, SOURCE_SIGNAL_ID, and URGENCY_SCORE.',
  "UTILITY_SERVICE_REQUESTS_DV is the utilities-facing JSON duality view for service request documents. Query DATA with JSON_VALUE(DATA, '$.serviceRequestId') and utilities JSON fields such as requestingServicePointId and logisticsCost.",
  'UTILITY_REQUEST_STATUS_LOOKUP maps canonical request status keys to utilities-facing DISPLAY_NAME values while preserving filter keys.',
  'UTILITY_REQUEST_SIGNAL_LABEL_LOOKUP maps signal channels to utilities-facing labels such as Reliability Signal, Production Signal, Capacity Alert, Supply Constraint, Logistics Exception, HSE and Emissions Notice, and No related signal.',
  'PRODUCTS.BRAND_ID joins to BRANDS.BRAND_ID.',
  'Compatibility/internal: ORDERS and ORDER_ITEMS remain physical tables for import and API compatibility. Demo-facing service request questions should use UTILITY_SERVICE_REQUESTS and UTILITY_REQUEST_ITEMS.',
  'ORDER_ITEMS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'ORDER_ITEMS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'ORDERS does not contain PRODUCT_ID or BRAND_ID; product and brand analysis must join ORDERS -> ORDER_ITEMS -> PRODUCTS -> BRANDS.',
  'ORDERS.CUSTOMER_ID joins to CUSTOMERS.CUSTOMER_ID.',
  'ORDERS.FULFILLMENT_CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'ORDERS.SOCIAL_SOURCE_ID links to SOCIAL_POSTS.POST_ID for signal-driven orders.',
  'INVENTORY.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'INVENTORY.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'SOCIAL_POSTS.INFLUENCER_ID joins to INFLUENCERS.INFLUENCER_ID.',
  'POST_PRODUCT_MENTIONS.POST_ID joins to SOCIAL_POSTS.POST_ID.',
  'POST_PRODUCT_MENTIONS.PRODUCT_ID joins to PRODUCTS.PRODUCT_ID.',
  'SHIPMENTS.ORDER_ID joins to ORDERS.ORDER_ID.',
  'SHIPMENTS.CENTER_ID joins to FULFILLMENT_CENTERS.CENTER_ID.',
  'UTILITY_GRAPH_ENTITIES.NODE_ID is the canonical graph node identifier and maps to ENTITY_KEY; use NODE_ID values such as OUT-1042, GLK-2208, PIPE-17A, WMB-4417, WWC-9031, WELL-NB-014, FAC-DELTA-03, RFY-HCU-02, LNG-7842, EMS-1190, HSE-3364, WO-23891, MP-6082, CMP-4420, CAUSE-FEEDER-FAULT, GAP-REPEAT-OUTAGE, SP-1007, and DR-PEAK-SHED for graph lookups.',
  'UTILITY_GRAPH_ENTITIES.NODE_TYPE maps to ENTITY_TYPE and describes service point, electric outage, gas leak, water main break, wastewater overflow, pipeline anomaly, well production issue, refinery constraint, LNG delay, emissions event, HSE incident, work order, maintenance plan, compliance record, root cause, demand response event, repair action, field crew, substation, reliability_gap, asset, or meter_event nodes.',
  'UTILITY_GRAPH_NODE_METADATA exposes NODE_ID, NODE_TYPE, DISPLAY_NAME, OPERATIONS_LABEL, and DESCRIPTION for utilities-friendly graph node SQL and Ask Energy & Utilities Data answers.',
  'UTILITY_GRAPH_EDGE_METADATA exposes EDGE_TYPE, DISPLAY_NAME, CATEGORY, and DESCRIPTION for utilities-friendly graph edge type labels while preserving canonical edge types such as reported_outage, root_caused_by, has_reliability_gap, and assigned_to.',
  'UTILITY_GRAPH_ENTITY_METRICS joins graph node metadata to utilities metric projections such as PATHWAY_VOLUME, SERVICE_POINT_COUNT, OUTAGE_EVENT_COUNT, RISK_SCORE, OPEN_RELIABILITY_GAP_COUNT, and DIRECT_CONNECTION_COUNT.',
  'UTILITY_GRAPH_RESTORATION_FINDINGS exposes database-backed operational event pathway findings by CENTER_ENTITY_ID and CENTER_NODE_ID with FINDING_TYPE, TITLE, DESCRIPTION, SUPPORTING_NODE_IDS, SUPPORTING_EDGE_TYPES, RISK_SCORE, RECOMMENDED_ACTION, RECOMMENDED_QUERY_KEY, and MIN_GRAPH_DEPTH.',
  'UTILITY_GRAPH_RELATIONSHIPS.FROM_ENTITY_ID and TO_ENTITY_ID join to UTILITY_GRAPH_ENTITIES.ENTITY_ID.',
  'UTILITY_GRAPH_RELATIONSHIP_METADATA joins UTILITY_GRAPH_RELATIONSHIPS to UTILITY_GRAPH_EDGE_METADATA and exposes RELATIONSHIP_ID, EDGE_TYPE, DISPLAY_NAME, CATEGORY, DESCRIPTION, FROM_ENTITY_ID, TO_ENTITY_ID, STRENGTH, INTERACTION_COUNT, and EVIDENCE_TEXT.',
  'RESTORATION_CASE_ENTITIES links RESTORATION_CASES.CASE_ID to UTILITY_GRAPH_ENTITIES.ENTITY_ID with ROLE and EVIDENCE_SCORE.',
  'ORDER_ITEMS.LINE_TOTAL already stores quantity * unit_price.',
  'BRANDS.BRAND_NAME only exists on BRANDS; do not reference BRAND_NAME unless BRANDS is joined in the same query block.',
  'When using aggregates, every non-aggregated expression in SELECT must also appear in GROUP BY.',
];
const ORACLE_ONLY_SYNTAX_RULES = [
  { regex: /\bJSON_AGG\s*\(/i, reason: 'Use JSON_ARRAYAGG instead of JSON_AGG.' },
  { regex: /\bSTRING_AGG\s*\(/i, reason: 'Use LISTAGG instead of STRING_AGG.' },
  { regex: /\bILIKE\b/i, reason: 'Use UPPER(...) LIKE UPPER(...) instead of ILIKE.' },
  { regex: /\bDATE_TRUNC\s*\(/i, reason: 'Use TRUNC(date_expr, ...) instead of DATE_TRUNC.' },
  { regex: /::/, reason: 'Use CAST(expr AS type) instead of PostgreSQL :: casts.' },
  { regex: /->>|->/i, reason: 'Use JSON_VALUE or JSON_QUERY instead of PostgreSQL JSON operators.' },
];

let schemaCache = {
  expiresAt: 0,
  grouped: {},
  tableComments: {},
};
let entityCache = {
  expiresAt: 0,
  catalogs: {},
};

function normalizeProfile(profile) {
  if (!profile || !String(profile).trim()) return DEFAULT_PROFILE;
  const normalized = String(profile).trim().toUpperCase();
  return PROFILE_ALIASES.get(normalized) || DEFAULT_PROFILE;
}

function getAvailableProfiles() {
  return [PROFILE_CATALOG[DEFAULT_PROFILE]];
}

function getAvailableSelectAiProfiles() {
  return Object.values(PROFILE_CATALOG);
}

function getProfileConfig(profile) {
  return PROFILE_CATALOG[normalizeProfile(profile)] || PROFILE_CATALOG[DEFAULT_PROFILE];
}

function getProfileModel(profile) {
  return getProfileConfig(profile).model;
}

function isAssistantQueryableObject(objectName) {
  return ALLOWED_TABLE_SET.has(String(objectName || '').trim().toUpperCase());
}

function getUtilitiesSchemaObjectMetadata({ queryableOnly = true } = {}) {
  const domainRank = new Map(SCHEMA_DOMAIN_ORDER.map((domain, index) => [domain, index]));
  return UTILITIES_SCHEMA_OBJECT_METADATA
    .map((object) => ({
      ...object,
      example_questions: [...object.example_questions],
      is_queryable_by_assistant: isAssistantQueryableObject(object.object_name),
    }))
    .filter((object) => !queryableOnly || object.is_queryable_by_assistant)
    .sort((left, right) => {
      const leftRank = domainRank.get(left.domain) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = domainRank.get(right.domain) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.display_name.localeCompare(right.display_name);
    });
}

function groupUtilitiesSchemaObjectMetadata(objects = getUtilitiesSchemaObjectMetadata()) {
  const groups = new Map(SCHEMA_DOMAIN_ORDER.map((domain) => [domain, []]));
  for (const object of objects) {
    if (!groups.has(object.domain)) groups.set(object.domain, []);
    groups.get(object.domain).push(object);
  }

  return [...groups.entries()]
    .filter(([, groupObjects]) => groupObjects.length > 0)
    .map(([domain, groupObjects]) => ({
      domain,
      objects: groupObjects,
      object_count: groupObjects.length,
    }));
}

function getShortErrorMessage(error) {
  return String(error?.message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || 'Unknown Oracle error';
}

function createAskDataError(category, message = null, extra = {}) {
  const error = new Error(message || ASKDATA_ERROR_MESSAGES[category] || ASKDATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE);
  error.category = category;
  error.userMessage = ASKDATA_ERROR_MESSAGES[category] || error.message;
  error.statusCode = extra.statusCode || (
    ['SQL_VALIDATION_BLOCKED', 'SQL_GENERATION_FAILED', 'MALFORMED_LLM_RESPONSE'].includes(category) ? 400 : 503
  );
  error.isUserQueryError = error.statusCode >= 400 && error.statusCode < 500;
  Object.assign(error, extra);
  return error;
}

function normalizeAskDataError(error) {
  const category = error?.category || (
    error?.message === 'timeout'
      ? 'REQUEST_TIMEOUT'
      : /\b(Only SELECT or WITH|not allowed|unsupported tables|safe read-only SQL|valid Oracle SQL query)\b/i.test(error?.message || '')
        ? 'SQL_VALIDATION_BLOCKED'
        : /\bORA-|NJS-|DPI-/i.test(error?.message || '')
          ? 'ORACLE_QUERY_FAILED'
          : 'UNEXPECTED_BACKEND_RESPONSE'
  );

  const userMessage = error?.userMessage || ASKDATA_ERROR_MESSAGES[category] || ASKDATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE;
  const statusCode = error?.statusCode || (error?.isUserQueryError ? 400 : 500);
  return {
    category,
    userMessage,
    statusCode,
    developerMessage: getShortErrorMessage(error),
    sql: error?.sql || null,
    oracleError: error?.oracleError || null,
    profile: error?.profile || null,
    model: error?.model || null,
  };
}

function getOracleErrorCode(error) {
  const match = getShortErrorMessage(error).match(/\bORA-\d{5}\b/);
  return match ? match[0] : null;
}

function isRetryableOracleSqlError(error) {
  return /\bORA-(009\d{2}|017\d{2}|018\d{2}|030\d{2}|30482)\b/i.test(
    getShortErrorMessage(error)
  );
}

function withSqlContext(error, { sql = null, profile = DEFAULT_PROFILE, oracleError = null } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  if (sql) error.sql = sql;
  error.profile = resolvedProfile;
  error.model = getProfileModel(resolvedProfile);
  error.oracleError = getShortErrorMessage({ message: oracleError || error?.message });
  return error;
}

function buildUserFacingSqlError(error, { sql = null, profile = DEFAULT_PROFILE, oracleError = null } = {}) {
  const shortOracleError = getShortErrorMessage({ message: oracleError || error?.message });
  const code = getOracleErrorCode({ message: shortOracleError });
  const friendlyMessage = [
    'Unable to generate a valid Oracle SQL query for that question.',
    'Try rephrasing with a more specific metric, time window, or entity.',
    code ? `Oracle reported ${code}.` : null,
  ].filter(Boolean).join(' ');

  return withSqlContext(createAskDataError('SQL_GENERATION_FAILED', friendlyMessage, { statusCode: 400 }), {
    sql,
    profile,
    oracleError: shortOracleError,
  });
}

function createUserQueryError(message, extra = {}) {
  const error = new Error(message);
  error.isUserQueryError = true;
  Object.assign(error, extra);
  return error;
}

function normalizeEntityText(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '');
}

function cleanEntityCandidate(text) {
  return String(text || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+(?:in|for|with|by|from|during|over|on|within|across)\b.*$/i, '')
    .trim();
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceFirstOccurrence(text, searchValue, replacement) {
  if (!searchValue) return text;
  return String(text).replace(new RegExp(escapeRegExp(searchValue)), replacement);
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const dp = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function similarityScore(left, right) {
  const a = normalizeEntityText(left);
  const b = normalizeEntityText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const distance = levenshteinDistance(a, b);
  return 1 - (distance / Math.max(a.length, b.length));
}

async function loadEntityCatalog() {
  if (Date.now() < entityCache.expiresAt && Object.keys(entityCache.catalogs).length > 0) {
    return entityCache;
  }

  const [brandsResult, productsResult, centersResult, customersResult, influencersResult] = await Promise.all([
    db.execute(`SELECT brand_name AS value FROM brands ORDER BY brand_name`),
    db.execute(`SELECT product_name AS value FROM products ORDER BY product_name`),
    db.execute(`SELECT center_name AS value FROM fulfillment_centers ORDER BY center_name`),
    db.execute(`
      SELECT TRIM(first_name || ' ' || last_name) AS value FROM customers
      UNION
      SELECT email AS value FROM customers
    `),
    db.execute(`
      SELECT handle AS value FROM influencers
      UNION
      SELECT display_name AS value FROM influencers
    `),
  ]);

  const buildCatalog = (rows, type) =>
    (rows || [])
      .map((row) => String(row.VALUE || '').trim())
      .filter(Boolean)
      .map((value) => ({ value, normalized: normalizeEntityText(value), type }));

  entityCache = {
    expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
    catalogs: {
      brand: buildCatalog(brandsResult.rows, 'brand'),
      product: buildCatalog(productsResult.rows, 'product'),
      center: buildCatalog(centersResult.rows, 'center'),
      customer: buildCatalog(customersResult.rows, 'customer'),
      influencer: buildCatalog(influencersResult.rows, 'influencer'),
    },
  };

  return entityCache;
}

function findExactEntityMatch(catalog = [], rawValue) {
  const normalized = normalizeEntityText(rawValue);
  if (!normalized) return null;
  return catalog.find((entry) => entry.normalized === normalized) || null;
}

function rankEntityMatches(catalog = [], rawValue, limit = 3) {
  const normalized = normalizeEntityText(rawValue);
  if (!normalized) return [];
  return catalog
    .map((entry) => ({
      ...entry,
      score: similarityScore(normalized, entry.normalized),
    }))
    .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value))
    .slice(0, limit)
    .filter((entry) => entry.score >= 0.35);
}

function formatEntityList(entries = []) {
  return entries.map((entry) => entry.value).join(', ');
}

function buildUnsupportedRetailerError(candidate, brandSuggestions = []) {
  const suggestionText = brandSuggestions.length
    ? ` Try a known manufacturer such as ${formatEntityList(brandSuggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't map "${candidate}" to this demo schema. This app models utility operator networks, utility services and supplies, service points, field operations sites, service requests, and utility signal sources.${suggestionText}`
  );
}

function buildUnknownEntityError(candidate, entityType, suggestions = []) {
  const suggestionText = suggestions.length
    ? ` Closest ${entityType} matches: ${formatEntityList(suggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't find a ${entityType} named "${candidate}" in this demo schema.${suggestionText}`
  );
}

async function resolveQuestionEntities(question) {
  const originalQuestion = String(question || '').trim();
  const { catalogs } = await loadEntityCatalog();
  let resolvedQuestion = originalQuestion;
  const resolutionHints = [];

  const retailerPatterns = [
    /\b(?:sold|available|stocked|carried)\s+at\s+(.+?)(?=$|[?.!,])/i,
    /\b(?:retailer|store|storefront)\s+(?:named|called\s+)?["']?(.+?)["']?(?=$|[?.!,])/i,
  ];

  for (const regex of retailerPatterns) {
    const match = originalQuestion.match(regex);
    if (!match) continue;
    const candidate = cleanEntityCandidate(match[1]);
    if (!candidate) continue;

    const supportedMatch = [
      findExactEntityMatch(catalogs.brand, candidate),
      findExactEntityMatch(catalogs.product, candidate),
      findExactEntityMatch(catalogs.center, candidate),
      findExactEntityMatch(catalogs.customer, candidate),
      findExactEntityMatch(catalogs.influencer, candidate),
    ].find(Boolean);

    if (!supportedMatch) {
      throw buildUnsupportedRetailerError(candidate, rankEntityMatches(catalogs.brand, candidate, 3));
    }
  }

  const explicitEntityPatterns = [
    { type: 'brand', regexes: [/\b(?:brand|manufacturer)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'product', regexes: [/\b(?:product|pilot\s+supply|operational\s+supply)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'center', regexes: [/\b(?:fulfillment\s+center|fulfillment\s+site|field operations\s+site|warehouse|center|site)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'customer', regexes: [/\b(?:customer|service point|account)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'influencer', regexes: [/\b(?:influencer|source|signal\s+source)\s+(?:named|called)\s+@?["']?(.+?)["']?(?=$|[?.!,])/i] },
  ];

  for (const entry of explicitEntityPatterns) {
    for (const regex of entry.regexes) {
      const match = originalQuestion.match(regex);
      if (!match) continue;
      const candidate = cleanEntityCandidate(match[1]);
      if (!candidate) continue;

      const exact = findExactEntityMatch(catalogs[entry.type], candidate);
      if (exact) {
        if (exact.value !== candidate) {
          resolvedQuestion = replaceFirstOccurrence(resolvedQuestion, candidate, exact.value);
          resolutionHints.push(`Entity resolution: treat "${candidate}" as ${entry.type} "${exact.value}".`);
        }
        break;
      }

      throw buildUnknownEntityError(candidate, entry.type, rankEntityMatches(catalogs[entry.type], candidate, 3));
    }
  }

  const quotedPattern = /["']([^"']{2,})["']/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(originalQuestion)) !== null) {
    const candidate = cleanEntityCandidate(quotedMatch[1]);
    if (!candidate) continue;

    const exactMatch =
      findExactEntityMatch(catalogs.brand, candidate)
      || findExactEntityMatch(catalogs.product, candidate)
      || findExactEntityMatch(catalogs.center, candidate)
      || findExactEntityMatch(catalogs.customer, candidate)
      || findExactEntityMatch(catalogs.influencer, candidate);

    if (!exactMatch) continue;

    if (exactMatch.value !== candidate) {
      resolvedQuestion = replaceFirstOccurrence(resolvedQuestion, candidate, exactMatch.value);
      resolutionHints.push(`Entity resolution: treat "${candidate}" as ${exactMatch.type} "${exactMatch.value}".`);
    }
  }

  return {
    question: resolvedQuestion,
    resolutionHints,
  };
}

function stripCodeFences(text) {
  return String(text || '')
    .replace(/^```(?:json|sql)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonResponse(text) {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (error) {
        throw createAskDataError('MALFORMED_LLM_RESPONSE', 'Ollama returned invalid JSON', {
          cause: error,
          rawResponsePreview: cleaned.slice(0, 500),
          statusCode: 502,
        });
      }
    }
    throw createAskDataError('MALFORMED_LLM_RESPONSE', 'Ollama returned invalid JSON', {
      rawResponsePreview: cleaned.slice(0, 500),
      statusCode: 502,
    });
  }
}

function getOllamaRuntimeConfig(profile = DEFAULT_PROFILE) {
  const { model } = getProfileConfig(profile);
  let host = OLLAMA_BASE_URL;
  try {
    const parsed = new URL(OLLAMA_BASE_URL);
    host = parsed.host;
  } catch (_) {}
  return { baseUrl: OLLAMA_BASE_URL, host, model };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = OLLAMA_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createAskDataError('OLLAMA_TIMEOUT', null, { statusCode: 504, cause: error });
    }
    throw createAskDataError('OLLAMA_UNAVAILABLE', null, { statusCode: 503, cause: error });
  } finally {
    clearTimeout(timer);
  }
}

function isOllamaMissingModelError(status, body) {
  return status === 404 || /model .* not found|not found.*model|pull/i.test(String(body || ''));
}

async function ollamaGenerate(prompt, { format = null, temperature = 0.1, numPredict = 192, profile = DEFAULT_PROFILE, trace = null } = {}) {
  const { model } = getProfileConfig(profile);
  const start = Date.now();
  let response;
  try {
    response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: format || undefined,
        prompt,
        options: {
          temperature,
          num_predict: numPredict,
        },
      }),
    });
  } finally {
    if (trace) {
      trace.ollamaCalls = (trace.ollamaCalls || 0) + 1;
      trace.ollamaDurationMs = (trace.ollamaDurationMs || 0) + (Date.now() - start);
    }
  }

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    if (isOllamaMissingModelError(response.status, body)) {
      throw createAskDataError('OLLAMA_MODEL_MISSING', null, { statusCode: 503, model });
    }
    throw createAskDataError('OLLAMA_UNAVAILABLE', `Ollama request failed (${response.status})`, {
      statusCode: 503,
      model,
      ollamaStatus: response.status,
      ollamaBodyPreview: String(body || '').slice(0, 500),
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw createAskDataError('UNEXPECTED_BACKEND_RESPONSE', 'Ollama returned non-JSON response payload', {
      statusCode: 502,
      cause: error,
    });
  }

  const output = stripCodeFences(payload?.response || '');
  if (!output) {
    throw createAskDataError('MALFORMED_LLM_RESPONSE', 'Ollama returned an empty response', {
      statusCode: 502,
    });
  }
  return output;
}

async function ollamaJson(systemPrompt, userPrompt, {
  profile = DEFAULT_PROFILE,
  trace = null,
  temperature = 0.05,
  numPredict = 160,
} = {}) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature, numPredict, profile, trace }
  );
  try {
    return parseJsonResponse(text);
  } catch (parseError) {
    const repairedText = await ollamaGenerate(
      [
        'Return valid JSON only. No markdown, comments, or prose.',
        'Repair this malformed JSON-like response so it can be parsed by JSON.parse.',
        'Preserve the original keys and values when possible.',
        '',
        text.slice(0, 4000),
      ].join('\n'),
      { format: 'json', temperature: 0, numPredict: Math.max(220, numPredict), profile, trace }
    );
    try {
      return parseJsonResponse(repairedText);
    } catch (repairError) {
      throw createAskDataError('MALFORMED_LLM_RESPONSE', 'Ollama returned invalid JSON after one repair attempt', {
        statusCode: 502,
        cause: repairError,
        originalError: parseError.message,
      });
    }
  }
}

async function ollamaText(systemPrompt, userPrompt, { temperature = 0.2, profile = DEFAULT_PROFILE, trace = null } = {}) {
  return ollamaGenerate(`${systemPrompt}\n\n${userPrompt}`, {
    temperature,
    numPredict: 220,
    profile,
    trace,
  });
}

function modelNameMatches(availableName, configuredName) {
  const available = String(availableName || '').trim();
  const configured = String(configuredName || '').trim();
  return available === configured || available === `${configured}:latest` || `${available}:latest` === configured;
}

async function getOllamaTags(profile = DEFAULT_PROFILE, trace = null) {
  const start = Date.now();
  let response;
  try {
    response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }, Math.min(OLLAMA_REQUEST_TIMEOUT_MS, 15000));
  } finally {
    if (trace) {
      trace.ollamaHealthDurationMs = (trace.ollamaHealthDurationMs || 0) + (Date.now() - start);
    }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw createAskDataError('OLLAMA_UNAVAILABLE', `Ollama tags request failed (${response.status})`, {
      statusCode: 503,
      ollamaStatus: response.status,
      ollamaBodyPreview: String(body || '').slice(0, 500),
    });
  }
  const payload = await response.json();
  const { model } = getProfileConfig(profile);
  const models = Array.isArray(payload.models) ? payload.models.map((entry) => entry.name).filter(Boolean) : [];
  return {
    models,
    configuredModel: model,
    modelAvailable: models.some((name) => modelNameMatches(name, model)),
  };
}

async function checkAskUtilityDataHealth({ demoUser = 'admin_jess', profile = DEFAULT_PROFILE } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const runtime = getOllamaRuntimeConfig(resolvedProfile);
  const checks = [];

  async function check(name, fn) {
    const start = Date.now();
    try {
      const details = await fn();
      checks.push({ name, status: 'ok', duration_ms: Date.now() - start, ...(details || {}) });
    } catch (error) {
      const normalized = normalizeAskDataError(error);
      checks.push({
        name,
        status: 'failed',
        duration_ms: Date.now() - start,
        category: normalized.category,
        message: normalized.userMessage,
      });
    }
  }

  await check('api_endpoint', async () => ({ reachable: true }));

  let tags = null;
  await check('ollama_tags', async () => {
    tags = await getOllamaTags(resolvedProfile);
    if (!tags.modelAvailable) {
      throw createAskDataError('OLLAMA_MODEL_MISSING', null, { statusCode: 503 });
    }
    return {
      ollama_host: runtime.host,
      configured_model: tags.configuredModel,
      available_model_count: tags.models.length,
    };
  });

  await check('ollama_generate', async () => {
    const answer = await ollamaGenerate('Return the word ok.', {
      profile: resolvedProfile,
      temperature: 0,
      numPredict: 8,
    });
    return { response_received: Boolean(answer) };
  });

  await check('oracle_connection', async () => {
    const result = await db.execute("SELECT 'connected' AS status FROM dual");
    return { database_status: result.rows?.[0]?.STATUS || 'unknown' };
  });

  await check('schema_metadata', async () => {
    const metadata = await loadSchemaMetadata();
    return {
      allowed_object_count: ALLOWED_TABLES.length,
      metadata_object_count: Object.keys(metadata.grouped || {}).length,
    };
  });

  await check('authorized_view_select', async () => {
    const result = await executeReadOnlySql('SELECT COUNT(*) AS total_service_requests FROM utility_service_requests', {
      demoUser,
      maxRows: 1,
    });
    return { row_count: result.rowCount, columns: result.columns };
  });

  await check('governed_sql_guard', async () => {
    const validation = validateReadOnlySql('SELECT * FROM dba_tables');
    if (validation.ok) {
      throw createAskDataError('SQL_VALIDATION_BLOCKED', 'Dictionary table query unexpectedly passed validation');
    }
    return { unauthorized_dictionary_query_blocked: true };
  });

  await check('vpd_context', async () => {
    const result = await executeReadOnlySql(
      "SELECT SYS_CONTEXT('UTILITIES_SECURITY_CTX', 'ROLE') AS role, SYS_CONTEXT('UTILITIES_SECURITY_CTX', 'REGION') AS region FROM dual",
      { demoUser, maxRows: 1 }
    );
    return {
      role_set: Boolean(result.rows?.[0]?.ROLE),
      region_set: result.rows?.[0]?.REGION || null,
    };
  });

  const failed = checks.filter((entry) => entry.status !== 'ok');
  return {
    status: failed.length ? 'degraded' : 'healthy',
    profile: resolvedProfile,
    model: runtime.model,
    ollama_host: runtime.host,
    checks,
  };
}

async function loadSchemaMetadata() {
  if (Date.now() < schemaCache.expiresAt && Object.keys(schemaCache.grouped).length > 0) {
    return schemaCache;
  }

  const binds = {};
  const placeholders = ALLOWED_TABLES.map((tableName, index) => {
    const key = `t${index}`;
    binds[key] = tableName;
    return `:${key}`;
  }).join(', ');

  const [tablesResult, columnsResult] = await Promise.all([
    db.execute(
      `SELECT table_name, comments
       FROM user_tab_comments
       WHERE table_name IN (${placeholders})
       ORDER BY table_name`,
      binds
    ),
    db.execute(
      `SELECT utc.table_name,
              utc.column_id,
              utc.column_name,
              utc.data_type,
              NVL(ucc.comments, '') AS column_comment
       FROM user_tab_columns utc
       LEFT JOIN user_col_comments ucc
         ON ucc.table_name = utc.table_name
        AND ucc.column_name = utc.column_name
       WHERE utc.table_name IN (${placeholders})
       ORDER BY utc.table_name, utc.column_id`,
      binds
    ),
  ]);

  const tableComments = Object.fromEntries(
    (tablesResult.rows || []).map((row) => [row.TABLE_NAME, row.COMMENTS || ''])
  );

  const grouped = {};
  for (const row of columnsResult.rows || []) {
    if (!grouped[row.TABLE_NAME]) grouped[row.TABLE_NAME] = [];
    grouped[row.TABLE_NAME].push(
      row.COLUMN_COMMENT
        ? `${row.COLUMN_NAME} ${row.DATA_TYPE} (${row.COLUMN_COMMENT})`
        : `${row.COLUMN_NAME} ${row.DATA_TYPE}`
    );
  }

  const tableLines = ALLOWED_TABLES
    .filter((tableName) => grouped[tableName]?.length)
    .map((tableName) => {
      const comment = tableComments[tableName] ? ` -- ${tableComments[tableName]}` : '';
      return `${tableName}${comment}\n  ${grouped[tableName].join(', ')}`;
    });

  schemaCache = {
    grouped,
    tableComments,
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
  };

  return schemaCache;
}

function selectRelevantTables(question) {
  const q = String(question || '').toLowerCase();
  const selected = new Set();

  if (/(viral|virality|critical|risk|compliance|regulatory|bulletin|signal|trend|trending|momentum|social|post|influencer|source|engagement|views|likes|shares|sentiment|saidi|saifi|pressure|throughput|production|emissions|hse|wastewater|water quality|leak response|crew capacity|maintenance backlog)/.test(q)) {
    ['UTILITY_SIGNAL_MATCHES_V', 'UTILITY_SERVICES_V', 'INFLUENCERS', 'POST_PRODUCT_MENTIONS', 'PRODUCTS', 'RELIABILITY_LOAD_SIGNALS_V', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(pathway graph|property graph|sql\/pgq|pgq|graph node|node id|node_id|graph edge|edge type|edge metadata|relationship metadata|operational label|display name|node metadata|pathway finding|finding|investigation query|feeder fault|repeat outage|reliability gap|follow[-\s]?up gap|outage event|restoration event|voltage|demand response|dispatch|reported_outage|root_caused_by|has_reliability_gap|assigned_to|gas leak|pipeline|water main|wastewater|well|production facility|compressor|refinery|lng|emissions|hse|work order|maintenance plan|compliance record|regulatory follow[-\s]?up|integrity risk|production variance)/.test(q)) {
    ['UTILITY_GRAPH_NODE_METADATA', 'UTILITY_GRAPH_EDGE_METADATA', 'UTILITY_GRAPH_ENTITY_METRICS', 'UTILITY_GRAPH_RESTORATION_FINDINGS', 'UTILITY_GRAPH_ENTITIES', 'UTILITY_GRAPH_RELATIONSHIPS', 'UTILITY_GRAPH_RELATIONSHIP_METADATA', 'RESTORATION_CASES', 'RESTORATION_CASE_ENTITIES'].forEach((tableName) => selected.add(tableName));
  }

  if (/(inventory|fulfillment|warehouse|field operations|restock|reorder|stock|ship|shipping|delivery|route|routing|center|nearest|service point in|customer in|demand)/.test(q)) {
    ['CUSTOMERS', 'DEMAND_FORECASTS', 'DEMAND_REGIONS', 'FULFILLMENT_CENTERS', 'FULFILLMENT_ZONES', 'INVENTORY', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(service request|service requests|request priority value|operational value|line item|line items|order|orders|revenue|sales|service point|customer|manufacturer|brand|product|product|price|category|total|average|best-selling)/.test(q)) {
    ['BRANDS', 'UTILITY_REQUEST_ITEMS', 'UTILITY_SERVICE_REQUESTS', 'CUSTOMERS', 'PRODUCTS', 'SHIPMENTS'].forEach((tableName) => selected.add(tableName));
  }

  if (/(user|users|region|role|account)/.test(q)) {
    ['APP_USERS'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    ['BRANDS', 'UTILITY_REQUEST_ITEMS', 'UTILITY_SERVICE_REQUESTS', 'CUSTOMERS', 'PRODUCTS', 'SOCIAL_POSTS'].forEach((tableName) => selected.add(tableName));
  }

  return [...selected];
}

async function getSchemaContext(question = '') {
  const metadata = await loadSchemaMetadata();
  const selectedTables = selectRelevantTables(question);
  const selectedTableSet = new Set(selectedTables);

  const tableLines = selectedTables
    .filter((tableName) => metadata.grouped[tableName]?.length)
    .map((tableName) => {
      const comment = metadata.tableComments[tableName] ? ` -- ${metadata.tableComments[tableName]}` : '';
      return `${tableName}${comment}\n  ${metadata.grouped[tableName].join(', ')}`;
    });

  return [
    'Available Oracle schema for this app:',
    tableLines.join('\n'),
    'Key joins and semantics:',
    ...RELATIONSHIP_HINTS
      .filter((hint) => {
        const isCompatibilityHint = /\bORDERS\b|\bORDER_ITEMS\b/.test(hint);
        if (isCompatibilityHint && !selectedTableSet.has('ORDERS') && !selectedTableSet.has('ORDER_ITEMS')) {
          return false;
        }
        return selectedTables.some((tableName) => hint.includes(tableName));
      })
      .map((hint) => `- ${hint}`),
    '- SOCIAL_POSTS.MOMENTUM_FLAG values include normal, rising, viral, and mega_viral; in this utilities demo, viral means elevated signal intensity and mega_viral means critical signal intensity.',
    '- INVENTORY low-stock logic typically compares QUANTITY_ON_HAND to REORDER_POINT.',
    '- Service request priority value questions should prefer UTILITY_SERVICE_REQUESTS.REQUEST_VALUE or UTILITY_REQUEST_ITEMS.LINE_VALUE; ORDERS.ORDER_TOTAL and ORDER_ITEMS.LINE_TOTAL remain compatibility fields.',
  ].join('\n');
}

function sanitizeSql(sql) {
  return stripCodeFences(String(sql || ''))
    .replace(/;+\s*$/g, '')
    .trim();
}

function ensureSqlRowLimit(sql, maxRows = ASKDATA_MAX_ROWS) {
  const normalized = sanitizeSql(sql);
  const limit = Math.max(1, Math.min(parseInt(maxRows, 10) || ASKDATA_MAX_ROWS, ASKDATA_MAX_ROWS));
  if (!normalized || /\bFETCH\s+FIRST\s+\d+\s+ROWS?\s+ONLY\b/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}\nFETCH FIRST ${limit} ROWS ONLY`;
}

function isUnsafeSqlIntent(question) {
  const normalized = String(question || '').trim();
  return /^(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|EXECUTE|EXEC|CALL|DECLARE|BEGIN)\b/i.test(normalized);
}

function generatePatternSql(question) {
  const q = String(question || '').trim();
  const qLower = q.toLowerCase();

  const topMatch = qLower.match(/\btop\s+(\d+)\b/);
  const topN = topMatch ? Math.min(parseInt(topMatch[1], 10), 25) : 5;
  const dayMatch = qLower.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  const dayWindow = dayMatch ? Math.min(parseInt(dayMatch[1], 10), 365) : null;
  const nodeIdMatch = q.match(/\b(?:SP|OUT|CAUSE|ACT|CREW|DR|FEEDER|GAP|MET|METER|POLE|SUB|XFMR|CASE|GLK|PIPE|WMB|WWC|WELL|FAC|RFY|LNG|EMS|HSE|WO|MP|CMP|ACCT|PUMP|WTP|WWF|CS|MID|STRG|INSP|SENS|MILE|WPV)-[A-Z0-9-]+\b/i);
  const edgeTypeMatch = q.match(/\b(?:reported_outage|root_caused_by|used_demand_response|opened_repair_action|assigned_field_crew|located_at|has_reliability_gap|followed_by|assigned_to|escalated_to|repeat_outage_after|meter_indicates|uses_asset|shares_field_crew|case_signal|affected_customer|affected_asset|requires_inspection|opens_work_order|creates_compliance_record|reaches_milestone|monitored_by_sensor|has_pressure_anomaly|has_compliance_event|has_emissions_event|has_hse_incident|constrains_throughput|delays_logistics|has_integrity_risk|has_production_variance|feeds_facility)\b/i);
  const hopMatch = qLower.match(/\b(?:depth|hop|hops)\s*(\d)\b|\b(\d)\s*hops?\b/);
  const graphDepth = hopMatch ? Math.min(parseInt(hopMatch[1] || hopMatch[2], 10), 5) : 3;

  const graphTextExpr = "LOWER(NVL(node_id, '') || ' ' || NVL(node_type, '') || ' ' || NVL(display_name, '') || ' ' || NVL(operations_domain, '') || ' ' || NVL(description, ''))";

  if (/(electric feeders?|feeders?).*(highest|top|risk|outage)|outage risk.*feeders?/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE (${graphTextExpr} LIKE '%feeder%'
                   OR ${graphTextExpr} LIKE '%outage%'
                   OR ${graphTextExpr} LIKE '%transformer%')
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(gas .*pipeline|pipeline segments?).*(pressure|anomal|integrity|corrosion)|pressure anomalies?.*pipeline|integrity risk.*pipeline/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE (${graphTextExpr} LIKE '%pipeline%'
                   OR ${graphTextExpr} LIKE '%gas leak%'
                   OR ${graphTextExpr} LIKE '%pressure%'
                   OR ${graphTextExpr} LIKE '%corrosion%'
                   OR ${graphTextExpr} LIKE '%integrity%')
              AND (${graphTextExpr} LIKE '%gas%'
                   OR ${graphTextExpr} LIKE '%pipe%'
                   OR node_id IN ('GLK-2208','PIPE-17A','SENS-PRS-17A'))
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(water pressure zones?|pressure zones?).*(recurring|leak|main break|anomal)|water.*leak events?|water main break/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE ${graphTextExpr} LIKE '%water%'
              AND (${graphTextExpr} LIKE '%pressure%'
                   OR ${graphTextExpr} LIKE '%leak%'
                   OR ${graphTextExpr} LIKE '%main break%'
                   OR ${graphTextExpr} LIKE '%pump%')
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/wastewater.*(compliance|threshold|discharge|overflow)|facilities.*approaching compliance/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE ${graphTextExpr} LIKE '%wastewater%'
               OR node_id IN ('WWC-9031','WWF-DUWAMISH','CMP-4420')
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(wells?).*(underperform|forecast|variance|production)|production variance.*well/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE node_id IN ('WELL-NB-014','WPV-014','FAC-DELTA-03')
               OR (${graphTextExpr} LIKE '%well%' AND (${graphTextExpr} LIKE '%production%' OR ${graphTextExpr} LIKE '%forecast%' OR ${graphTextExpr} LIKE '%variance%'))
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/refinery.*(constraint|throughput|unit)|units?.*constraining throughput|hydrocracker/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE node_id IN ('RFY-HCU-02','RFY-CON-02','EMS-1190','MP-6082')
               OR (${graphTextExpr} LIKE '%refinery%' OR ${graphTextExpr} LIKE '%hydrocracker%' OR ${graphTextExpr} LIKE '%throughput%')
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/lng.*(delay|shipment|cargo|logistics)|shipments?.*risk.*delay/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE node_id IN ('LNG-7842','LNG-SABINE','STRG-CAV-12')
               OR ${graphTextExpr} LIKE '%lng%'
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(assets?).*(prioritiz|before the storm|storm arrives)|storm.*assets?.*priorit/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE risk_score >= 80
              AND (node_type IN ('asset','pipeline_segment','pump_station','substation','work_order','maintenance_plan','field_crew')
                   OR ${graphTextExpr} LIKE '%storm%'
                   OR ${graphTextExpr} LIKE '%crew%'
                   OR ${graphTextExpr} LIKE '%maintenance%')
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/emissions?.*(regulatory|follow[-\s]?up|report)|regulatory follow[-\s]?up.*emissions?/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE node_id IN ('EMS-1190','CMP-4420','FAC-DELTA-03','RFY-HCU-02','CS-BAYOU-04')
               OR ${graphTextExpr} LIKE '%emissions%'
               OR ${graphTextExpr} LIKE '%regulatory%'
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/service requests?.*(breach|breaching|sla|late|overdue)|sla.*service requests?/.test(qLower)) {
    return `SELECT service_request_id,
                   requesting_service_point_name,
                   request_status_display_name,
                   request_phase,
                   related_signal_label,
                   urgency_score,
                   estimated_completion_at,
                   created_at
            FROM utility_service_requests
            WHERE request_status NOT IN ('delivered','cancelled','returned')
              AND (
                estimated_completion_at < SYSTIMESTAMP
                OR urgency_score >= 80
                OR related_signal_criticality_score >= 80
              )
            ORDER BY CASE WHEN estimated_completion_at < SYSTIMESTAMP THEN 0 ELSE 1 END,
                     urgency_score DESC NULLS LAST,
                     related_signal_criticality_score DESC NULLS LAST,
                     created_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/maintenance plans?.*(blocked|crew|parts|availability)|blocked.*maintenance|crew.*parts.*maintenance/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_domain,
                   risk_score,
                   description
            FROM utility_graph_node_metadata
            WHERE node_type IN ('maintenance_plan','work_order','field_crew','refinery_constraint','well_production_issue')
              AND (${graphTextExpr} LIKE '%blocked%'
                   OR ${graphTextExpr} LIKE '%crew%'
                   OR ${graphTextExpr} LIKE '%parts%'
                   OR ${graphTextExpr} LIKE '%maintenance%'
                   OR ${graphTextExpr} LIKE '%turnaround%')
            ORDER BY risk_score DESC NULLS LAST, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (nodeIdMatch && /(pathway finding|finding|recommended.*query|investigation query|what.*found|graph insight|graph summary)/.test(qLower)) {
    const nodeId = nodeIdMatch[0].toUpperCase();
    return `SELECT finding_type,
                   title,
                   description,
                   supporting_node_ids,
                   supporting_edge_types,
                   risk_score,
                   recommended_action,
                   recommended_query_key,
                   min_graph_depth
            FROM utility_graph_restoration_findings
            WHERE center_node_id = '${nodeId}'
              AND min_graph_depth <= ${graphDepth}
            ORDER BY risk_score DESC NULLS LAST, finding_type
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (nodeIdMatch && /(pathway graph|operational event graph|graph|node|operational label|display name|description|feeder fault|repeat outage|voltage|demand response|dispatch|gas leak|pipeline|water|wastewater|well|production|refinery|lng|emissions|hse|work order|maintenance|compliance)/.test(qLower)) {
    const nodeId = nodeIdMatch[0].toUpperCase();
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_label,
                   description
            FROM utility_graph_node_metadata
            WHERE node_id = '${nodeId}'`;
  }

  if (edgeTypeMatch && /(pathway graph|graph|edge|relationship|metadata|display name|description|category)/.test(qLower)) {
    const edgeType = edgeTypeMatch[0].toLowerCase();
    return `SELECT edge_type,
                   display_name,
                   category,
                   description
            FROM utility_graph_edge_metadata
            WHERE edge_type = '${edgeType}'`;
  }

  if (/(list|show|return).*(pathway graph|graph).*(edge|relationship).*(metadata|types|labels)|graph edge metadata|edge type metadata|relationship type metadata/.test(qLower)) {
    return `SELECT edge_type,
                   display_name,
                   category,
                   description
            FROM utility_graph_edge_metadata
            ORDER BY category, edge_type
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(list|show|return).*(pathway graph|graph).*(nodes|metadata|labels)|graph node metadata/.test(qLower)) {
    return `SELECT node_id,
                   node_type,
                   display_name,
                   operations_label,
                   description
            FROM utility_graph_node_metadata
            ORDER BY node_type, node_id
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(utility services|services).*(predicted|forecast).*(highest|top).*(demand risk|demand)|demand risk.*this week/.test(qLower)) {
    return `SELECT cs.service_name,
                   cs.utility_category,
                   df.region,
                   SUM(df.predicted_demand) AS predicted_demand,
                   ROUND(AVG(df.social_factor), 2) AS demand_risk_factor,
                   MAX(df.forecast_date) AS latest_forecast_date
            FROM demand_forecasts df
            JOIN utility_services_v cs
              ON cs.utility_service_id = df.product_id
            WHERE df.forecast_date >= TRUNC(SYSDATE)
              AND df.forecast_date < TRUNC(SYSDATE) + 7
            GROUP BY cs.service_name, cs.utility_category, df.region
            ORDER BY predicted_demand DESC, demand_risk_factor DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  const criticalityThresholdMatch = qLower.match(/criticality(?:\s+score)?\s+(?:above|over|greater than)\s+(\d+)/);
  if (/(quality|capacity).*(signals?).*criticality|signals?.*criticality/.test(qLower) && criticalityThresholdMatch) {
    return `SELECT signal_id,
                   source_channel AS source_type,
                   signal_source_name,
                   criticality_score,
                   signal_intensity,
                   signal_timestamp
            FROM reliability_load_signals_v
            WHERE criticality_score > ${parseInt(criticalityThresholdMatch[1], 10)}
            ORDER BY criticality_score DESC, signal_timestamp DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(quality|capacity).*(signals?).*(network impact|escalation)|signals?.*(network impact|escalation count)/.test(qLower)) {
    return `SELECT signal_id,
                   source_channel AS source_type,
                   signal_source_name,
                   signal_text,
                   signal_reach AS network_impact,
                   escalation_count,
                   signal_intensity,
                   signal_timestamp
            FROM reliability_load_signals_v
            ORDER BY signal_reach DESC NULLS LAST,
                     escalation_count DESC NULLS LAST,
                     signal_timestamp DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(capacity constraints?|logistics issues?|logistics constraints?|delivery risks?|delivery issues?|impact.*delivery|delivery.*impact).*(utility services?|these utility services?|services?)|(?:utility services?|these utility services?|services?).*(capacity constraints?|logistics issues?|logistics constraints?|delivery risks?|delivery issues?)/.test(qLower)) {
    return `SELECT site_name,
                   site_type_display_name,
                   location_name,
                   region_name,
                   capacity_supply_units,
                   pending_request_count,
                   load_percentage,
                   alert_count,
                   high_priority_alert_count,
                   operational_status,
                   primary_constraint,
                   recommended_action
            FROM field_logistics_sites_v
            WHERE is_active = 1
              AND (
                high_priority_alert_count > 0
                OR alert_count > 0
                OR load_percentage >= 80
                OR pending_request_count > 0
              )
            ORDER BY high_priority_alert_count DESC,
                     alert_count DESC,
                     load_percentage DESC,
                     pending_request_count DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(logistics sites?|field operations sites?|fulfillment logistics sites?|asset capacity warehouses?|distribution hubs?).*(available capacity|capacity|can handle|handle|support|route|serve).*(urgent|utility requests?|service requests?)|urgent.*(logistics sites?|available capacity|asset capacity warehouses?|distribution hubs?)/.test(qLower)) {
    return `SELECT site_name,
                   site_type_display_name,
                   location_name,
                   region_name,
                   capacity_supply_units,
                   pending_request_count,
                   load_percentage,
                   alert_count,
                   operational_status,
                   recommended_action
            FROM field_logistics_sites_v
            WHERE is_active = 1
              AND capacity_supply_units > 0
            ORDER BY high_priority_alert_count DESC,
                     capacity_supply_units DESC,
                     load_percentage ASC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/operational value exposure.*utility category|utility category.*operational value exposure/.test(qLower)) {
    return `SELECT utility_category,
                   COUNT(DISTINCT service_request_id) AS service_requests,
                   ROUND(SUM(line_value), 2) AS service_value_exposure
            FROM utility_request_items
            GROUP BY utility_category
            ORDER BY service_value_exposure DESC`;
  }

  if (/(how many|count).*service requests?.*(triggered|driven|influenced|linked).*(quality|capacity|signal)|(?:quality|capacity) signals?.*(how many|count).*service requests?/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_service_requests
            FROM utility_service_requests
            WHERE source_signal_id IS NOT NULL`;
  }

  if (/service requests?.*(triggered|driven|influenced).*(quality|capacity|signal)|(?:quality|capacity) signals?.*(triggered|drove|influenced).*service requests?/.test(qLower)) {
    return `SELECT service_request_id,
                   requesting_service_point_name,
                   request_status_display_name,
                   related_signal_label,
                   related_signal_domain,
                   related_signal_criticality_score,
                   request_value,
                   created_at
            FROM utility_service_requests
            WHERE source_signal_id IS NOT NULL
            ORDER BY related_signal_criticality_score DESC NULLS LAST,
                     created_at DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/service points?.*(highest|top).*(request volume).*(capacity pressure)|service points?.*(capacity pressure).*(request volume)/.test(qLower)) {
    return `SELECT csr.requesting_service_point_name,
                   csr.requesting_service_point_region,
                   COUNT(csr.service_request_id) AS request_volume,
                   ROUND(SUM(csr.request_value), 2) AS request_value,
                   ROUND(AVG(cls.load_percentage), 1) AS avg_fulfillment_site_load,
                   SUM(NVL(cls.alert_count, 0)) AS capacity_supply_alerts
            FROM utility_service_requests csr
            LEFT JOIN field_logistics_sites_v cls
              ON cls.field_logistics_site_id = csr.field_logistics_site_id
            GROUP BY csr.requesting_service_point_name,
                     csr.requesting_service_point_region
            ORDER BY request_volume DESC,
                     avg_fulfillment_site_load DESC NULLS LAST,
                     capacity_supply_alerts DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/top signal trends.*source type.*criticality|signal trends.*criticality|signals?.*source type.*criticality/.test(qLower)) {
    return `SELECT source_channel AS source_type,
                   signal_intensity,
                   COUNT(*) AS signal_count,
                   ROUND(AVG(criticality_score), 2) AS avg_criticality,
                   MAX(criticality_score) AS max_criticality,
                   MAX(signal_timestamp) AS latest_signal_timestamp
            FROM reliability_load_signals_v
            GROUP BY source_channel, signal_intensity
            ORDER BY avg_criticality DESC,
                     signal_count DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/top signal trends.*source type.*(network impact|escalation)|signal trends.*(network impact|escalation)/.test(qLower)) {
    return `SELECT source_channel AS source_type,
                   signal_intensity,
                   COUNT(*) AS signal_count,
                   ROUND(AVG(signal_reach), 0) AS avg_network_impact,
                   SUM(escalation_count) AS escalation_count,
                   MAX(signal_timestamp) AS latest_signal_timestamp
            FROM reliability_load_signals_v
            GROUP BY source_channel, signal_intensity
            ORDER BY avg_network_impact DESC NULLS LAST,
                     escalation_count DESC NULLS LAST,
                     signal_count DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(operational event graph|operational event) cases?.*(highest|top|critical|high)?.*(risk|compliance|hse|emissions|integrity|production|repeat outage|reliability[-\s]?gap)|repeat outage.*reliability[-\s]?gap.*risk/.test(qLower)) {
    return `SELECT case_key,
                   case_type,
                   severity,
                   status,
                   risk_score,
                   summary,
                   created_at
            FROM restoration_cases
            ORDER BY risk_score DESC,
                     severity DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(how many (?:utility )?service requests.*\b(in total|total|overall)\b|summarize .*how many (?:utility )?service requests|total (?:utility )?service request count|overall (?:utility )?service request count|count of (?:utility )?service requests)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_service_requests FROM utility_service_requests`;
  }

  if (/(operational value|request priority value).*utility category|utility category.*(operational value|request priority value)/.test(qLower)) {
    return `SELECT utility_category,
                   COUNT(DISTINCT service_request_id) AS service_requests,
                   ROUND(SUM(line_value), 2) AS service_value
            FROM utility_request_items
            GROUP BY utility_category
            ORDER BY service_value DESC`;
  }

  if (/(total|overall).*(operational value|request priority value)|(?:operational value|request priority value).*all service requests/.test(qLower)) {
    return `SELECT ROUND(SUM(request_value), 2) AS total_service_value FROM utility_service_requests`;
  }

  const asksForServiceRequestItems = /service\s+request\s+items?|utility\s+request\s+items?|utility supplies?|asset capacity items?|service supplies?|service supply items?/.test(qLower);
  if (asksForServiceRequestItems && /(highest|top|best|performing|performance|operational value|demand|most requested|requested most|requested volume|request volume)/.test(qLower)) {
    const requestItemOrder = /(demand|most requested|requested most|requested volume|request volume)/.test(qLower)
      ? `units_requested DESC,
                     service_requests DESC,
                     service_value DESC`
      : `service_value DESC,
                     units_requested DESC`;
    return `SELECT service_supply_name,
                   utility_category,
                   utility_operator_or_partner,
                   COUNT(DISTINCT service_request_id) AS service_requests,
                   SUM(quantity) AS units_requested,
                   ROUND(SUM(line_value), 2) AS service_value
            FROM utility_request_items
            GROUP BY service_supply_name,
                     utility_category,
                     utility_operator_or_partner
            ORDER BY ${requestItemOrder}
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(how many service requests.*(?:compliance signal|capacity signal|load signals|regulatory signal|signal) source|service requests.*influenced by .*(?:compliance|capacity|regulatory|quality|signal)|signal-driven service requests|signal driven service requests)/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_service_requests
            FROM utility_service_requests
            WHERE source_signal_id IS NOT NULL`;
  }

  if (/(service points).*most service requests|top service points by service requests|highest service activity/.test(qLower)) {
    return `SELECT requesting_service_point_name,
                   COUNT(service_request_id) AS service_request_count,
                   ROUND(SUM(request_value), 2) AS total_service_value
            FROM utility_service_requests
            GROUP BY requesting_service_point_name
            ORDER BY service_request_count DESC, total_service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(utility operator networks?|utility partners?|network partners?).*(highest|top|most|operational value|request priority value)|(?:operational value|request priority value).*(utility operator networks?|utility partners?|network partners?)/.test(qLower)) {
    return `SELECT utility_operator_or_partner,
                   COUNT(DISTINCT service_request_id) AS service_requests,
                   SUM(quantity) AS units_requested,
                   ROUND(SUM(line_value), 2) AS service_value
            FROM utility_request_items
            WHERE utility_operator_or_partner IS NOT NULL
            GROUP BY utility_operator_or_partner
            ORDER BY service_value DESC,
                     units_requested DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(how many orders.*\b(in total|total|overall)\b|summarize .*how many orders|summarize .*total orders|total order count|overall order count|count of orders)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_service_requests FROM utility_service_requests`;
  }

  if (/total revenue.*all orders|revenue from all orders|overall revenue/.test(qLower)) {
    return `SELECT ROUND(SUM(request_value), 2) AS total_service_value FROM utility_service_requests`;
  }

  if (/revenue.*(?:product|utility operations|grid capacity) category|revenue by (?:(?:product|utility operations|grid capacity) )?category|category.*revenue|breakdown by category/.test(qLower)) {
    return `SELECT utility_category,
                   COUNT(DISTINCT service_request_id) AS service_requests,
                   ROUND(SUM(line_value), 2) AS service_value
            FROM utility_request_items
            GROUP BY utility_category
            ORDER BY service_value DESC`;
  }

  if (/revenue by (?:brand|manufacturer)|(?:brand|manufacturer) revenue|sales by (?:brand|manufacturer)|revenue breakdown by (?:brand|manufacturer)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(csr.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
    return `SELECT cri.utility_operator_or_partner,
                   COUNT(DISTINCT cri.service_request_id) AS service_requests,
                   ROUND(SUM(cri.line_value), 2) AS service_value
            FROM utility_request_items cri
            JOIN utility_service_requests csr
              ON csr.service_request_id = cri.service_request_id
            ${dateFilter}
            GROUP BY cri.utility_operator_or_partner
            ORDER BY service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(which is the best (?:product|product)|what is the best (?:product|product)|\bbest[-\s]selling (?:products?|products?)\b|\bbest[-\s]performing (?:products?|products?)\b|\bbest (?:product|product)\b|top .*best-selling (?:products|products).*revenue|top .*(?:products|products) by revenue|best-selling (?:products|products) by revenue|products by revenue)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(o.created_at AS DATE) >= SYSDATE - ${dayWindow}` : '';
    const limit = (!topMatch && /\bbest product\b/.test(qLower)) ? 1 : topN;
    return `SELECT cri.service_supply_name,
                   cri.utility_operator_or_partner,
                   ROUND(SUM(cri.line_value), 2) AS service_value,
                   SUM(cri.quantity) AS units_requested
            FROM utility_request_items cri
            JOIN utility_service_requests csr
              ON csr.service_request_id = cri.service_request_id
            ${dateFilter}
            GROUP BY cri.service_supply_name, cri.utility_operator_or_partner
            ORDER BY service_value DESC, units_requested DESC
            FETCH FIRST ${limit} ROWS ONLY`;
  }

  const viralityMatch = qLower.match(/(?:virality|criticality|compliance signal|signal) score above\s+(\d+)/);
  if (/(how many (?:social posts|regulatory bulletins|signals|compliance signals)|count .*signals)/.test(qLower) && viralityMatch) {
    return `SELECT COUNT(*) AS critical_signal_count
            FROM reliability_load_signals_v
            WHERE criticality_score > ${parseInt(viralityMatch[1], 10)}`;
  }

  if (/fulfillment centers have the most inventory|centers have the most inventory|most inventory/.test(qLower)) {
    return `SELECT fc.center_name,
                   fc.city,
                   fc.state_province,
                   NVL(SUM(i.quantity_on_hand), 0) AS total_inventory
            FROM fulfillment_centers fc
            LEFT JOIN inventory i ON fc.center_id = i.center_id
            GROUP BY fc.center_name, fc.city, fc.state_province
            ORDER BY total_inventory DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/highest average order value|average order value by brand/.test(qLower)) {
    return `SELECT utility_operator_or_partner,
                   ROUND(AVG(partner_request_value), 2) AS avg_service_request_value
            FROM (
              SELECT service_request_id,
                     utility_operator_or_partner,
                     SUM(line_value) AS partner_request_value
              FROM utility_request_items
              GROUP BY service_request_id, utility_operator_or_partner
            )
            GROUP BY utility_operator_or_partner
            ORDER BY avg_service_request_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many orders have a (?:social media|compliance signal|regulatory signal|signal) source|how many orders.*(?:social|compliance|regulatory|signal) source|social-driven orders|social driven orders|signal-driven orders|signal driven orders/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_service_requests
            FROM utility_service_requests
            WHERE source_signal_id IS NOT NULL`;
  }

  if (/average (?:virality|criticality|signal) score by (?:platform|source type)|(?:virality|criticality|signal).*by (?:platform|source type)/.test(qLower)) {
    return `SELECT source_channel AS source_type,
                   ROUND(AVG(criticality_score), 2) AS avg_criticality_score,
                   COUNT(*) AS signal_count
            FROM reliability_load_signals_v
            GROUP BY source_channel
            ORDER BY avg_criticality_score DESC`;
  }

  if (/(customers|service points) placed the most orders|which (customers|service points) .*most orders|top (customers|service points) by orders/.test(qLower)) {
    return `SELECT requesting_service_point_name,
                   COUNT(service_request_id) AS service_request_count,
                   ROUND(SUM(request_value), 2) AS total_service_value
            FROM utility_service_requests
            GROUP BY requesting_service_point_name
            ORDER BY service_request_count DESC, total_service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/how many orders were placed this week|orders placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS service_requests_this_week
            FROM utility_service_requests
            WHERE CAST(created_at AS DATE) >= TRUNC(SYSDATE, 'IW')`;
  }

  if (/top (?:products|products) by revenue/.test(qLower)) {
    return `SELECT service_supply_name,
                   ROUND(SUM(line_value), 2) AS service_value
            FROM utility_request_items
            GROUP BY service_supply_name
            ORDER BY service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  return null;
}

function extractReferencedTables(sql) {
  const tables = new Set();
  const cteNames = new Set();
  const cteRegex = /(?:\bWITH|,)\s+([A-Za-z0-9_."$#]+)\s+AS\s*\(/gi;
  const regex = /\b(?:from|join)\s+([A-Za-z0-9_."$#]+)/gi;
  let match;

  while ((match = cteRegex.exec(sql)) !== null) {
    const cteName = match[1]
      .split('.')
      .pop()
      .replace(/"/g, '')
      .toUpperCase();
    if (cteName) cteNames.add(cteName);
  }

  while ((match = regex.exec(sql)) !== null) {
    const rawIdentifier = match[1].split(/\s+/)[0];
    const baseName = rawIdentifier
      .split('.')
      .pop()
      .replace(/"/g, '')
      .toUpperCase();
    if (baseName && !cteNames.has(baseName)) tables.add(baseName);
  }

  return [...tables];
}

function validateReadOnlySql(sql) {
  const normalized = sanitizeSql(sql);
  if (!normalized) {
    return { ok: false, reason: 'No SQL generated.' };
  }

  if (!/^(SELECT|WITH)\b/i.test(normalized)) {
    return { ok: false, reason: 'Only SELECT or WITH statements are allowed.' };
  }

  if (/[;]|\-\-|\/\*|\*\//.test(normalized)) {
    return { ok: false, reason: 'Comments and multiple statements are not allowed.' };
  }

  if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CREATE|DECLARE|BEGIN|COMMIT|ROLLBACK|CALL|EXECUTE|LOCK)\b/i.test(normalized)
    || /\bFOR\s+UPDATE\b/i.test(normalized)
    || /\bSELECT\b[\s\S]+\bINTO\b/i.test(normalized)) {
    return { ok: false, reason: 'Write operations and PL/SQL are not allowed.' };
  }

  if (/\b(DBMS_|UTL_|SYS\.|DBA_|ALL_|USER_|V\$)\b/i.test(normalized)) {
    return { ok: false, reason: 'System packages and metadata views are not allowed.' };
  }

  for (const rule of ORACLE_ONLY_SYNTAX_RULES) {
    if (rule.regex.test(normalized)) {
      return { ok: false, reason: rule.reason };
    }
  }

  const referencedTables = extractReferencedTables(normalized);
  const disallowedTables = referencedTables.filter(
    (tableName) => tableName !== 'DUAL' && !ALLOWED_TABLE_SET.has(tableName)
  );

  if (disallowedTables.length > 0) {
    return {
      ok: false,
      reason: `Query referenced unsupported tables: ${disallowedTables.join(', ')}`,
    };
  }

  return { ok: true, sql: normalized };
}

async function generateReadOnlySql(question, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [], trace = null } = {}) {
  const start = Date.now();
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      if (trace) {
        trace.sqlGenerationDurationMs = (trace.sqlGenerationDurationMs || 0) + (Date.now() - start);
        trace.sqlGenerationSource = 'deterministic_pattern';
        trace.sqlValidationOk = true;
      }
      return validation.sql;
    }
  }

  const schemaContext = await getSchemaContext(question);
  const response = await ollamaJson(
    [
      'You translate natural language into a single Oracle SQL query for a fixed application schema.',
      'Return JSON only with keys "sql" and "reason".',
      'Rules:',
      '- Use only Oracle SQL.',
      '- Generate exactly one read-only SELECT or WITH query.',
      '- Never use DBMS_CLOUD_AI, SELECT AI, PL/SQL, DDL, DML, comments, or semicolons.',
      '- Do not use PostgreSQL syntax such as JSON_AGG, STRING_AGG, ILIKE, :: casts, DATE_TRUNC, or -> / ->> JSON operators.',
      '- Use Oracle equivalents such as JSON_ARRAYAGG, LISTAGG, TRUNC(date_expr, ...), CAST(... AS ...), JSON_VALUE, and JSON_QUERY.',
      '- Use only the tables and columns provided in the schema.',
      '- Use explicit joins on the documented relationships.',
      '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
      '- For utilities service request questions, use UTILITY_SERVICE_REQUESTS and UTILITY_REQUEST_ITEMS.',
      '- Use legacy ORDERS and ORDER_ITEMS only when the user explicitly asks about compatibility/internal objects.',
      '- Product and utility-operator analysis for service requests should use UTILITY_REQUEST_ITEMS, optionally joined to UTILITY_SERVICE_REQUESTS by SERVICE_REQUEST_ID.',
      '- When using aggregates, every selected expression must either be aggregated or included in GROUP BY.',
      '- For list-style results, prefer FETCH FIRST 25 ROWS ONLY.',
      '- If the request cannot be answered from the schema, return an empty sql string and explain why in reason.',
    ].join('\n'),
    [
      `Question: ${question}`,
      `Mode: ${mode}`,
      resolutionHints.length ? `Resolved entities:\n- ${resolutionHints.join('\n- ')}` : null,
      schemaContext,
    ].filter(Boolean).join('\n\n'),
    { profile, trace }
  );

  const sql = response?.sql || '';
  const validation = validateReadOnlySql(sql);
  if (!sql || !validation.ok) {
    if (trace) trace.sqlValidationOk = false;
    throw createAskDataError(validation.ok ? 'SQL_GENERATION_FAILED' : 'SQL_VALIDATION_BLOCKED', response?.reason || validation.reason || 'Unable to generate a safe read-only SQL query.', {
      statusCode: 400,
    });
  }

  if (trace) {
    trace.sqlGenerationDurationMs = (trace.sqlGenerationDurationMs || 0) + (Date.now() - start);
    trace.sqlGenerationSource = 'ollama';
    trace.sqlValidationOk = true;
  }
  return validation.sql;
}

async function repairReadOnlySql(question, failedSql, failedError, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [], trace = null } = {}) {
  const schemaContext = await getSchemaContext(question);
  const response = await ollamaJson(
    [
      'You repair a failing Oracle SQL query for a fixed application schema.',
      'Return JSON only with keys "sql" and "reason".',
      'Rules:',
      '- Keep the original user intent, but fix the SQL so it compiles and runs in Oracle.',
      '- Generate exactly one read-only SELECT or WITH query.',
      '- Never use DBMS_CLOUD_AI, SELECT AI, PL/SQL, DDL, DML, comments, or semicolons.',
      '- Use only the tables, columns, and joins that exist in the provided schema context.',
      '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
      '- For utilities service request questions, use UTILITY_SERVICE_REQUESTS and UTILITY_REQUEST_ITEMS.',
      '- Use legacy ORDERS and ORDER_ITEMS only when the user explicitly asks about compatibility/internal objects.',
      '- Product and utility-operator analysis for service requests should use UTILITY_REQUEST_ITEMS, optionally joined to UTILITY_SERVICE_REQUESTS by SERVICE_REQUEST_ID.',
      '- When using aggregates, every selected expression must either be aggregated or included in GROUP BY.',
      '- If Oracle reported an invalid identifier, remove or replace the bad column/table reference.',
      '- If Oracle reported a GROUP BY error, correct the aggregation instead of changing the question intent.',
      '- If you cannot repair the query from the schema, return an empty sql string and explain why in reason.',
    ].join('\n'),
    [
      `Question: ${question}`,
      `Mode: ${mode}`,
      resolutionHints.length ? `Resolved entities:\n- ${resolutionHints.join('\n- ')}` : null,
      `Oracle error: ${getShortErrorMessage(failedError)}`,
      `Failing SQL:\n${failedSql}`,
      schemaContext,
    ].filter(Boolean).join('\n\n'),
    { profile, trace }
  );

  const repairedSql = response?.sql || '';
  const validation = validateReadOnlySql(repairedSql);
  if (!repairedSql || !validation.ok) {
    throw createAskDataError(validation.ok ? 'SQL_GENERATION_FAILED' : 'SQL_VALIDATION_BLOCKED', response?.reason || validation.reason || 'Unable to repair the SQL query.', {
      statusCode: 400,
    });
  }

  return validation.sql;
}

async function executeReadOnlySql(sql, { demoUser = null, maxRows = ASKDATA_MAX_ROWS, trace = null } = {}) {
  const limitedSql = ensureSqlRowLimit(sql, maxRows);
  const validation = validateReadOnlySql(limitedSql);
  if (!validation.ok) {
    if (trace) trace.sqlValidationOk = false;
    throw createAskDataError('SQL_VALIDATION_BLOCKED', validation.reason, {
      statusCode: 400,
      sql: limitedSql,
    });
  }
  if (trace) trace.sqlValidationOk = true;

  const start = Date.now();
  try {
    return await db.withActorConnection(demoUser || 'admin_jess', async (connection) => {
      connection.callTimeout = ASKDATA_SQL_TIMEOUT_MS;

      const result = await connection.execute(validation.sql, {}, {
        outFormat: db.oracledb.OUT_FORMAT_OBJECT,
        maxRows: Math.max(1, Math.min(parseInt(maxRows, 10) || ASKDATA_MAX_ROWS, ASKDATA_MAX_ROWS)),
      });

      const rows = [];
      for (const row of result.rows || []) {
        const processedRow = {};
        for (const [key, value] of Object.entries(row)) {
          if (value && typeof value.getData === 'function') {
            processedRow[key] = await value.getData();
          } else {
            processedRow[key] = value;
          }
        }
        rows.push(processedRow);
      }

      return {
        columns: (result.metaData || []).map((column) => column.name),
        rows,
        rowCount: rows.length,
        sql: validation.sql,
      };
    });
  } catch (error) {
    if (error?.category) throw error;
    throw createAskDataError('ORACLE_QUERY_FAILED', getShortErrorMessage(error), {
      statusCode: 500,
      sql: validation.sql,
      oracleError: getShortErrorMessage(error),
      cause: error,
    });
  } finally {
    if (trace) {
      trace.oracleExecutionDurationMs = (trace.oracleExecutionDurationMs || 0) + (Date.now() - start);
    }
  }
}

async function generateQuestionSql(question, { mode = 'showsql', profile = DEFAULT_PROFILE, trace = null } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  if (isUnsafeSqlIntent(question)) {
    if (trace) trace.sqlValidationOk = false;
    throw createAskDataError('SQL_VALIDATION_BLOCKED', GOVERNED_SCHEMA_BLOCK_MESSAGE, {
      statusCode: 400,
    });
  }
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      if (trace) {
        trace.sqlGenerationSource = 'deterministic_pattern';
        trace.sqlValidationOk = true;
      }
      return {
        sql: validation.sql,
        profile: resolvedProfile,
        model: getProfileModel(resolvedProfile),
        resolvedQuestion: question,
        warnings: [],
        timings: trace || {},
      };
    }
  }
  const resolution = await resolveQuestionEntities(question);
  const effectiveQuestion = resolution.question;
  const sql = await generateReadOnlySql(effectiveQuestion, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
    trace,
  });
  const validation = validateReadOnlySql(sql);
  if (!validation.ok) {
    throw createAskDataError('SQL_VALIDATION_BLOCKED', validation.reason, {
      statusCode: 400,
      sql,
      profile: resolvedProfile,
      model: getProfileModel(resolvedProfile),
    });
  }
  return {
    sql: validation.sql,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    resolvedQuestion: effectiveQuestion,
    warnings: [],
    timings: trace || {},
  };
}

async function runQuestionQuery(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, maxRows = ASKDATA_MAX_ROWS, trace = null } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const generated = await generateQuestionSql(question, { mode, profile: resolvedProfile, trace });
  const initialSql = generated.sql;
  let currentSql = initialSql;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await executeReadOnlySql(currentSql, { demoUser, maxRows, trace });
      return {
        ...result,
        profile: resolvedProfile,
        model: getProfileModel(resolvedProfile),
        repairedFromSql: currentSql === initialSql ? null : initialSql,
        resolvedQuestion: generated.resolvedQuestion,
        warnings: generated.warnings || [],
        timings: trace || {},
      };
    } catch (error) {
      if (!isRetryableOracleSqlError(error)) {
        throw withSqlContext(error, { sql: currentSql, profile: resolvedProfile });
      }

      if (attempt === 2) {
        throw buildUserFacingSqlError(error, {
          sql: currentSql,
          profile: resolvedProfile,
          oracleError: error.message,
        });
      }

	      let repairedSql;
	      try {
	        repairedSql = await repairReadOnlySql(generated.resolvedQuestion, currentSql, error, {
	          mode,
	          profile: resolvedProfile,
	          resolutionHints: [],
	          trace,
	        });
	      } catch (repairPromptError) {
        throw buildUserFacingSqlError(repairPromptError, {
          sql: currentSql,
          profile: resolvedProfile,
          oracleError: error.message,
        });
      }

      if (!repairedSql || repairedSql === currentSql) {
        throw buildUserFacingSqlError(error, {
          sql: currentSql,
          profile: resolvedProfile,
          oracleError: error.message,
        });
      }

      currentSql = repairedSql;
    }
  }

  throw buildUserFacingSqlError(new Error('Unable to produce a working SQL query.'), {
    sql: currentSql,
    profile: resolvedProfile,
  });
}

function buildPromptRows(rows, maxRows = 12) {
  return JSON.stringify(rows.slice(0, maxRows), null, 2);
}

function formatValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString('en-US')
      : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return String(value);
}

function toStringArray(value, maxItems = 5) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeTextField(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTextField(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

function normalizeColumns(columns = [], rows = []) {
  const explicitColumns = Array.isArray(columns) ? columns.filter(Boolean) : [];
  if (explicitColumns.length > 0) return explicitColumns;
  const firstRow = Array.isArray(rows) ? rows.find((row) => row && typeof row === 'object') : null;
  return firstRow ? Object.keys(firstRow) : [];
}

function compactResultValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 300);
  }
  const text = String(value).trim();
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

function buildStructuredQueryResult({ columns = [], rows = [], rowCount = 0 }, { maxRows = 10, maxColumns = 14 } = {}) {
  const normalizedColumns = normalizeColumns(columns, rows).slice(0, maxColumns);
  const compactRows = (Array.isArray(rows) ? rows : []).slice(0, maxRows).map((row) => {
    const next = {};
    for (const column of normalizedColumns) {
      const value = compactResultValue(readRowValue(row, [column]));
      if (value !== null && value !== '') next[column] = value;
    }
    return next;
  });

  return {
    columns: normalizedColumns,
    rows: compactRows,
    rowCount: Number.isFinite(rowCount) ? rowCount : compactRows.length,
    sampleRowCount: compactRows.length,
    truncated: (Array.isArray(rows) && rows.length > maxRows) || normalizeColumns(columns, rows).length > maxColumns,
  };
}

function readRowValue(row, candidateColumns = []) {
  if (!row || typeof row !== 'object') return undefined;
  const rowKeys = Object.keys(row);
  for (const candidate of candidateColumns) {
    const exact = rowKeys.find((key) => key === candidate);
    if (exact && row[exact] !== null && row[exact] !== undefined && row[exact] !== '') return row[exact];
    const normalizedCandidate = String(candidate || '').toUpperCase();
    const matched = rowKeys.find((key) => String(key).toUpperCase() === normalizedCandidate);
    if (matched && row[matched] !== null && row[matched] !== undefined && row[matched] !== '') return row[matched];
  }
  return undefined;
}

function hasAnyColumn(columns = [], patterns = []) {
  return normalizeColumns(columns).some((column) =>
    patterns.some((pattern) => pattern.test(String(column || '')))
  );
}

function humanizeColumnName(column) {
  return String(column || '')
    .replace(/_display_name$/i, '')
    .replace(/_name$/i, ' name')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getSchemaObjectLabel(objectName) {
  const normalized = String(objectName || '').replace(/"/g, '').toUpperCase();
  const object = UTILITIES_SCHEMA_OBJECT_METADATA.find((item) => item.object_name.toUpperCase() === normalized);
  return object?.display_name || humanizeColumnName(normalized);
}

function joinReadableList(items = []) {
  const filtered = items.map((item) => String(item || '').trim()).filter(Boolean);
  if (filtered.length <= 1) return filtered[0] || '';
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`;
}

function formatLocation(row) {
  const direct = readRowValue(row, ['LOCATION_NAME', 'LOCATION', 'SITE_LOCATION']);
  if (direct) return formatValue(direct);
  const city = readRowValue(row, ['CITY', 'SITE_CITY', 'REQUESTING_SERVICE_POINT_CITY', 'FIELD_LOGISTICS_SITE_CITY']);
  const region = readRowValue(row, ['REGION_NAME', 'REGION', 'STATE_PROVINCE', 'STATE', 'REQUESTING_SERVICE_POINT_REGION', 'FIELD_LOGISTICS_SITE_REGION']);
  return [city, region].filter(Boolean).map(formatValue).join(', ');
}

function getCapacityDetails(row) {
  const capacity = readRowValue(row, [
    'AVAILABLE_CAPACITY',
    'AVAILABLE_CAPACITY_UNITS',
    'AVAILABLE_UNITS',
    'CAPACITY_SUPPLY_UNITS',
    'TOTAL_AVAILABLE_CAPACITY',
    'TOTAL_INVENTORY',
  ]);
  const pending = readRowValue(row, [
    'PENDING_REQUEST_COUNT',
    'PENDING_REQUESTS',
    'PENDING_LOGISTICS_REQUESTS',
  ]);
  const load = readRowValue(row, ['LOAD_PERCENTAGE', 'LOAD_PCT', 'UTILIZATION_PERCENTAGE']);
  const alerts = readRowValue(row, ['ALERT_COUNT', 'CAPACITY_SUPPLY_ALERTS', 'HIGH_PRIORITY_ALERT_COUNT']);
  const details = [];

  if (capacity !== undefined) details.push(`${formatValue(capacity)} capacity units`);
  if (pending !== undefined) details.push(`${formatValue(pending)} pending requests`);
  if (load !== undefined) details.push(`${formatValue(load)}% load`);
  if (alerts !== undefined) details.push(`${formatValue(alerts)} active alerts`);
  return details;
}

function getConstraintDetails(row) {
  const operationalStatus = readRowValue(row, ['OPERATIONAL_STATUS']);
  const primaryConstraint = readRowValue(row, ['PRIMARY_CONSTRAINT']);
  const recommendedAction = readRowValue(row, ['RECOMMENDED_ACTION']);
  const details = [];

  if (operationalStatus !== undefined) details.push(`status ${formatValue(operationalStatus)}`);
  if (primaryConstraint !== undefined) details.push(`primary constraint ${formatValue(primaryConstraint)}`);
  if (recommendedAction !== undefined) details.push(`recommended action: ${formatValue(recommendedAction)}`);
  return details;
}

function getPerformanceDetails(row) {
  const serviceValue = readRowValue(row, [
    'SERVICE_VALUE',
    'SERVICE_VALUE_EXPOSURE',
    'LINE_VALUE',
    'REQUEST_VALUE',
    'TOTAL_SERVICE_VALUE',
  ]);
  const units = readRowValue(row, [
    'UNITS_REQUESTED',
    'QUANTITY',
    'TOTAL_UNITS',
  ]);
  const requests = readRowValue(row, [
    'SERVICE_REQUESTS',
    'SERVICE_REQUEST_COUNT',
    'REQUEST_VOLUME',
  ]);
  const details = [];

  if (serviceValue !== undefined) details.push(`${formatValue(serviceValue)} operational value`);
  if (units !== undefined) details.push(`${formatValue(units)} units requested`);
  if (requests !== undefined) details.push(`${formatValue(requests)} service requests`);
  return details;
}

function isServiceRequestItemResult(question = '', columns = []) {
  return /utility request items?|service request items?|request items?|service supplies?|utility supplies?|highest performing/i.test(question)
    || hasAnyColumn(columns, [/SERVICE_SUPPLY/i, /LINE_VALUE/i, /UNIT_COST/i, /UNITS_REQUESTED/i]);
}

function formatTopRowEvidence(row, resultKind = 'generic') {
  const name = readRowValue(row, [
    'SITE_NAME',
    'FIELD_LOGISTICS_SITE_NAME',
    'FULFILLMENT_LOGISTICS_SITE',
    'FULFILLMENT_CENTER',
    'REQUESTING_SERVICE_POINT_NAME',
    'SERVICE_POINT_NAME',
    'SERVICE_NAME',
    'SERVICE_SUPPLY_NAME',
  ]);
  if (!name) return '';

  const details = resultKind === 'request_items'
    ? getPerformanceDetails(row)
    : getCapacityDetails(row);
  if (!details.length) return formatValue(name);
  return `${formatValue(name)} with ${joinReadableList(details)}`;
}

function formatResultBullet(row, index, columns = [], resultKind = 'generic') {
  const name = readRowValue(row, [
    'SITE_NAME',
    'FIELD_LOGISTICS_SITE_NAME',
    'FULFILLMENT_LOGISTICS_SITE',
    'FULFILLMENT_CENTER',
    'REQUESTING_SERVICE_POINT_NAME',
    'SERVICE_POINT_NAME',
    'SERVICE_NAME',
    'SERVICE_SUPPLY_NAME',
    'UTILITY_CATEGORY',
    'SOURCE_TYPE',
    'CASE_KEY',
    'TITLE',
  ]);
  const type = readRowValue(row, [
    'SITE_TYPE_DISPLAY_NAME',
    'SITE_TYPE',
    'OPERATIONAL_STATUS',
    'REQUEST_STATUS_DISPLAY_NAME',
    'UTILITY_CATEGORY',
    'SIGNAL_INTENSITY',
    'CASE_TYPE',
    'SEVERITY',
  ]);
  const location = formatLocation(row);
  const metrics = resultKind === 'request_items'
    ? getPerformanceDetails(row)
    : getCapacityDetails(row);
  const constraintDetails = resultKind === 'logistics' ? getConstraintDetails(row) : [];

  if (name) {
    const details = [type, location, ...metrics, ...constraintDetails].filter(Boolean).map(formatValue);
    return `${index}. ${formatValue(name)}${details.length ? ` - ${details.join(', ')}` : ''}`;
  }

  const values = normalizeColumns(columns, [row])
    .map((column) => readRowValue(row, [column]))
    .filter((value) => value !== undefined && value !== null && value !== '')
    .slice(0, 4)
    .map(formatValue);
  return `${index}. ${values.join(' - ') || 'Matching utilities record'}`;
}

function isLogisticsResult(question = '', columns = []) {
  return /logistics|capacity|urgent service|asset capacity|distribution|warehouse|fulfillment/i.test(question)
    || hasAnyColumn(columns, [/SITE/i, /CAPACITY/i, /FULFILLMENT/i, /LOGISTICS/i]);
}

function isLogisticsConstraintQuestion(question = '') {
  return /(capacity constraints?|logistics issues?|logistics constraints?|delivery risks?|delivery issues?|impact.*delivery|delivery.*impact)/i.test(String(question || ''));
}

function getResultKind(question = '', columns = []) {
  if (isLogisticsResult(question, columns)) return 'logistics';
  if (isServiceRequestItemResult(question, columns)) return 'request_items';
  return 'generic';
}

function hasCapacityColumn(columns = []) {
  return hasAnyColumn(columns, [/CAPACITY/i, /AVAILABLE.*UNITS/i, /SUPPLY_UNITS/i, /INVENTORY/i]);
}

function buildMissingFieldWarnings({ question = '', columns = [], rows = [] }) {
  const warnings = [];
  const asksForCapacity = /available capacity|capacity units|capacity/i.test(question);
  if (asksForCapacity && rows.length > 0 && !hasCapacityColumn(columns)) {
    warnings.push('I found matching logistics sites, but this result set does not include numeric capacity values. Showing site names, types, and locations.');
  }
  return warnings;
}

function buildAggregateResultSynthesis({
  question = '',
  mode = 'narrate',
  columns = [],
  rows = [],
  rowCount = 0,
  followUpQuestions = [],
  warnings = [],
}) {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  const signalDrivenRequests = readRowValue(row, ['SIGNAL_DRIVEN_SERVICE_REQUESTS']);
  const totalServiceRequests = readRowValue(row, ['TOTAL_SERVICE_REQUESTS', 'SERVICE_REQUEST_COUNT']);
  const totalServiceValue = readRowValue(row, ['TOTAL_SERVICE_VALUE', 'SERVICE_VALUE']);
  let answer = '';
  let keyFinding = '';
  let resultSummary = '';

  if (signalDrivenRequests !== undefined) {
    const value = formatValue(signalDrivenRequests);
    answer = `There are ${value} signal-driven utility service requests in the authorized utility data scope.`;
    keyFinding = `${value} utility service requests are linked to cross-sector operational signals.`;
    resultSummary = `${value} signal-driven utility service requests were returned from the governed utility schema.`;
  } else if (totalServiceRequests !== undefined && /how many|count|total/i.test(question)) {
    const value = formatValue(totalServiceRequests);
    answer = `There are ${value} utility service requests in the authorized utility data scope.`;
    keyFinding = `${value} utility service requests are available for this authorized view.`;
    resultSummary = `${value} total utility service requests were returned from the governed utility schema.`;
  } else if (totalServiceValue !== undefined && /total|overall/i.test(question)) {
    const value = formatValue(totalServiceValue);
    answer = `The total operational value is ${value} in the authorized utility data scope.`;
    keyFinding = `${value} total operational value is represented in this governed result.`;
    resultSummary = `${value} total operational value was returned from the governed utility schema.`;
  }

  if (!answer) return null;

  return {
    answer: mode === 'chat'
      ? `${answer} You can narrow this by service point, region, category, or signal source.`
      : answer,
    key_findings: [keyFinding],
    result_summary: resultSummary || `${rowCount} aggregate record was returned from the governed utility schema.`,
    follow_up_questions: followUpQuestions,
    referenced_data: {
      row_count: rowCount,
      notable_fields: normalizeColumns(columns, rows),
    },
    warnings,
    source: 'deterministic_fallback',
  };
}

function deterministicResultSynthesis({ question, mode = 'narrate', columns = [], rows = [], rowCount = 0 }) {
  const normalizedColumns = normalizeColumns(columns, rows);
  const safeRows = Array.isArray(rows) ? rows : [];
  const warnings = buildMissingFieldWarnings({ question, columns: normalizedColumns, rows: safeRows });
  const resultKind = getResultKind(question, normalizedColumns);
  const followUpQuestions = resultKind === 'logistics'
    ? [
      'Which of these logistics sites has the lowest current load?',
      'Show pending urgent utility service requests by region.',
    ]
    : [
      'Break this down by service point or region.',
      'Show the highest-priority records for this question.',
    ];

  if (!safeRows.length || rowCount === 0) {
    const answer = mode === 'chat'
      ? 'I did not find matching records in your authorized utility data scope. You can try narrowing the question by service point, region, service type, or time window.'
      : 'I did not find matching records in your authorized utility data scope.';
    return {
      answer,
      key_findings: [],
      result_summary: 'No matching records were returned from the governed utility schema.',
      follow_up_questions: followUpQuestions,
      referenced_data: {
        row_count: 0,
        notable_fields: normalizedColumns,
      },
      warnings,
      source: 'deterministic_fallback',
    };
  }

  const aggregateSynthesis = buildAggregateResultSynthesis({
    question,
    mode,
    columns: normalizedColumns,
    rows: safeRows,
    rowCount,
    followUpQuestions,
    warnings,
  });
  if (aggregateSynthesis) return aggregateSynthesis;

  const singularResult = Number(rowCount) === 1;
  const rowLabel = resultKind === 'logistics'
    ? `field operations site${singularResult ? '' : 's'}`
    : resultKind === 'request_items'
      ? `utility request item${singularResult ? '' : 's'}`
    : `matching utilities record${singularResult ? '' : 's'}`;
  const topEntityLabel = resultKind === 'logistics'
    ? 'site'
    : resultKind === 'request_items'
      ? 'item'
      : 'record';
  const topNames = safeRows
    .map((row) => readRowValue(row, ['SITE_NAME', 'FIELD_LOGISTICS_SITE_NAME', 'REQUESTING_SERVICE_POINT_NAME', 'SERVICE_POINT_NAME', 'SERVICE_NAME', 'SERVICE_SUPPLY_NAME', 'UTILITY_CATEGORY', 'CASE_KEY', 'TITLE']))
    .filter(Boolean)
    .slice(0, 3)
    .map(formatValue);
  const findings = safeRows.slice(0, 6).map((row, index) => formatResultBullet(row, index + 1, normalizedColumns, resultKind));
  const topRowEvidence = formatTopRowEvidence(safeRows[0], resultKind);
  const otherTopNames = topNames.slice(topRowEvidence ? 1 : 0);
  const topNameText = otherTopNames.length ? `Other matches include ${joinReadableList(otherTopNames)}.` : '';
  const capacityPhrase = /available capacity/i.test(question)
    ? ' with available capacity'
    : '';
  const groundingPhrase = 'from the governed utility schema';
  const supportSentence = resultKind === 'request_items'
    ? 'These records can help compare requested utility services and supplies by operational value and demand within the authorized data scope.'
    : 'These records can support field coordination and urgent routing decisions within the authorized data scope.';
  const topConstraint = resultKind === 'logistics'
    ? readRowValue(safeRows[0], ['PRIMARY_CONSTRAINT'])
    : undefined;
  const topRecommendedAction = resultKind === 'logistics'
    ? readRowValue(safeRows[0], ['RECOMMENDED_ACTION'])
    : undefined;
  const constraintAnswerParts = isLogisticsConstraintQuestion(question) && resultKind === 'logistics'
    ? [
      `I found ${rowCount} field operations site${singularResult ? '' : 's'} with active capacity or logistics constraints ${groundingPhrase}.`,
      topRowEvidence ? `The top flagged site is ${topRowEvidence}.` : topNameText,
      topConstraint ? `Primary constraint: ${formatValue(topConstraint)}.` : null,
      topRecommendedAction ? `Recommended action: ${formatValue(topRecommendedAction)}` : null,
      topNameText && topRowEvidence ? topNameText : null,
    ].filter(Boolean)
    : null;
  const answer = mode === 'chat'
    ? (constraintAnswerParts || [
      `I found ${rowCount} ${rowLabel}${capacityPhrase} ${groundingPhrase}.`,
      topRowEvidence ? `The top matching ${topEntityLabel} is ${topRowEvidence}.` : topNameText,
      warnings[0] || supportSentence,
    ].filter(Boolean)).join(' ')
    : (constraintAnswerParts || [
      warnings[0] || null,
      `I found ${rowCount} ${rowLabel}${capacityPhrase} ${groundingPhrase}.`,
      topRowEvidence ? `The top matching ${topEntityLabel} is ${topRowEvidence}.` : topNameText,
      topNameText && topRowEvidence ? topNameText : null,
    ].filter(Boolean)).join(' ');

  return {
    answer,
    key_findings: findings,
    result_summary: `${rowCount} ${rowLabel}${capacityPhrase} were returned from the governed utility schema.`,
    follow_up_questions: followUpQuestions,
    referenced_data: {
      row_count: rowCount,
      notable_fields: normalizedColumns,
    },
    warnings,
    source: 'deterministic_fallback',
  };
}

function hasRawColumnDump(text, columns = []) {
  const joined = Array.isArray(text) ? text.join('\n') : String(text || '');
  if (/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\s*:/g.test(joined)) return true;
  return normalizeColumns(columns).some((column) => {
    const pattern = new RegExp(`\\b${escapeRegExp(String(column))}\\s*:`, 'i');
    return pattern.test(joined);
  });
}

function hasUnsupportedCapacityQuantity(text, columns = []) {
  if (hasCapacityColumn(columns)) return false;
  return /\b\d+(?:[.,]\d+)?\s*(?:k|m|thousand|million)?\s+(?:available\s+)?(?:capacity\s+)?units\b/i.test(String(text || ''));
}

function hasListOnlyAnswer(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/^[\d\s,.$%]+$/.test(value)) return true;
  if (value.split(/\s+/).length < 8 && !/[.!?]/.test(value)) return true;
  if (/,\S/.test(value) && !/[.!?]/.test(value)) return true;
  if (value.split(/\s+/).length < 14 && value.includes(',') && !/\b(has|have|with|from|because|capacity|requests?|schema|scope)\b/i.test(value)) {
    return true;
  }
  return false;
}

function responseMentionsReturnedEntity(text, rows = []) {
  const normalizedText = normalizeEntityText(text);
  if (!normalizedText) return false;
  return (Array.isArray(rows) ? rows : [])
    .map((row) => readRowValue(row, [
      'SITE_NAME',
      'FIELD_LOGISTICS_SITE_NAME',
      'FULFILLMENT_LOGISTICS_SITE',
      'FULFILLMENT_CENTER',
      'REQUESTING_SERVICE_POINT_NAME',
      'SERVICE_POINT_NAME',
      'SERVICE_NAME',
      'SERVICE_SUPPLY_NAME',
    ]))
    .filter(Boolean)
    .some((name) => normalizedText.includes(normalizeEntityText(name)));
}

function hasUnsupportedLoadThreshold(text, rows = []) {
  const value = String(text || '');
  if (!/(?:above|over|exceed(?:s|ed)?|at least|>=|greater than)\s*80\s*%|80\s*%\s*(?:or higher|or above|load)/i.test(value)) {
    return false;
  }
  return !(Array.isArray(rows) ? rows : []).some((row) => {
    const load = Number(readRowValue(row, ['LOAD_PERCENTAGE', 'LOAD_PCT', 'UTILIZATION_PERCENTAGE']));
    return Number.isFinite(load) && load >= 80;
  });
}

function normalizeSynthesisResponse(response, context, fallback) {
  const normalized = {
    answer: normalizeTextField(response?.answer),
    key_findings: toStringArray(response?.key_findings, 6),
    result_summary: normalizeTextField(response?.result_summary),
    follow_up_questions: toStringArray(response?.follow_up_questions, 3),
    referenced_data: {
      row_count: Number.isFinite(response?.referenced_data?.row_count)
        ? response.referenced_data.row_count
        : context.rowCount,
      notable_fields: toStringArray(response?.referenced_data?.notable_fields || context.columns, 12),
    },
    warnings: toStringArray(response?.warnings, 6),
    source: 'ollama_synthesis',
  };

  if (!normalized.answer) normalized.answer = fallback.answer;
  if (!normalized.result_summary) normalized.result_summary = fallback.result_summary;
  if (!normalized.key_findings.length && fallback.key_findings?.length) {
    normalized.key_findings = fallback.key_findings;
  }
  if (!normalized.follow_up_questions.length) normalized.follow_up_questions = fallback.follow_up_questions || [];

  const textForSafetyCheck = [
    normalized.answer,
    normalized.result_summary,
    ...normalized.key_findings,
  ].join('\n');
  if (
    hasRawColumnDump(textForSafetyCheck, context.columns)
    || hasUnsupportedCapacityQuantity(textForSafetyCheck, context.columns)
    || hasUnsupportedLoadThreshold(textForSafetyCheck, context.rows)
    || hasListOnlyAnswer(normalized.answer)
    || (
      isLogisticsConstraintQuestion(context.question)
      && getResultKind(context.question, context.columns) === 'logistics'
      && !responseMentionsReturnedEntity(textForSafetyCheck, context.rows)
    )
  ) {
    return {
      ...fallback,
      warnings: [
        ...(fallback.warnings || []),
        'The model response did not follow the utilities explanation contract, so a deterministic grounded summary was used.',
      ],
    };
  }

  normalized.warnings = [...new Set([...(fallback.warnings || []), ...normalized.warnings])];
  return normalized;
}

function buildConversationContext(history = []) {
  if (!Array.isArray(history) || history.length === 0) return '';
  return history
    .slice(-6)
    .map((entry) => {
      const role = entry?.role === 'assistant' ? 'Assistant' : 'User';
      const text = String(entry?.text || entry?.answer || '').replace(/\s+/g, ' ').trim();
      return text ? `${role}: ${text.slice(0, 360)}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function shapeNarrativeResponse(response, { mode, conversationContext = [] } = {}) {
  if (mode !== 'chat') {
    return {
      ...response,
      response_style: 'explanation',
      conversation_context_used: false,
    };
  }

  const hasPriorConversation = Array.isArray(conversationContext) && conversationContext.length > 0;
  const prefix = hasPriorConversation
    ? 'Picking up from our earlier exchange, '
    : 'Here’s the direct answer: ';
  const answer = /^\s*(?:Here’s the direct answer:|Here's the direct answer:|Picking up from our earlier exchange,)/i.test(response.answer || '')
    ? response.answer
    : `${prefix}${response.answer}`;

  return {
    ...response,
    answer,
    // Chat is intentionally a single conversational turn. The evidence-led
    // findings and summary belong to Explain mode rather than being rendered
    // as a second copy of the same response.
    key_findings: [],
    result_summary: '',
    response_style: 'conversation',
    conversation_context_used: hasPriorConversation,
  };
}

async function synthesizeQueryResultWithOllama({
  question,
  mode = 'narrate',
  sql,
  columns = [],
  rows = [],
  rowCount = 0,
  profile = DEFAULT_PROFILE,
  trace = null,
  conversationContext = [],
}) {
  const structuredResult = buildStructuredQueryResult({ columns, rows, rowCount });
  const contextText = buildConversationContext(conversationContext);
  const isChatMode = mode === 'chat';
  const systemPrompt = isChatMode
    ? [
      'You are an Energy & Utilities operations data assistant for the Seer Energy & Utilities demo.',
      'Answer conversationally using only the provided SQL query results and optional conversation context.',
      'Use Energy & Utilities operations language across electric utility, gas utility, water/wastewater utility, oil & gas upstream, midstream, downstream, HSE, emissions, customer operations, field execution, and regulatory compliance.',
      'Do not invent values, counts, percentages, locations, capacity numbers, or fields.',
      'If a field is missing, say it is missing instead of implying it exists.',
      'Avoid raw database phrasing such as "Found rows", "SITE_NAME equals", or dumped column names.',
      'Reply as one concise conversational turn. Start with "Here’s the direct answer:" when no prior conversation is supplied, or "Picking up from our earlier exchange," when it is supplied.',
      'Do not add a findings list or an analyst-style result summary; offer one natural next question instead.',
      'Return JSON only with keys "answer", "follow_up_questions", "referenced_data", and "warnings".',
    ].join('\n')
    : [
      'You are an Energy & Utilities operations data assistant for the Seer Energy & Utilities demo.',
      'Convert SQL query results into a concise, plain-English answer.',
      'Use only the provided query results. Do not invent values.',
      'If a field is missing, do not imply it exists.',
      'Mention that results are from the governed utility schema when helpful.',
      'Use Energy & Utilities operations language: electric reliability, gas leak response, water pressure, wastewater compliance, well production, pipeline integrity, refinery throughput, LNG logistics, emissions reporting, HSE, customer operations, field execution, regulatory compliance, governed data, and authorized data scope.',
      'Avoid dumping raw column names unless necessary.',
      'Write an evidence-led analyst briefing: give the answer, then two or more distinct key findings and a one-sentence result summary.',
      'Return JSON only with keys "answer", "key_findings", "result_summary", "follow_up_questions", and "warnings".',
    ].join('\n');
  const expectedJson = isChatMode
    ? {
      answer: '...',
      follow_up_questions: ['...', '...'],
      referenced_data: {
        row_count: rowCount,
        notable_fields: structuredResult.columns,
      },
      warnings: [],
    }
    : {
      answer: '...',
      key_findings: ['...', '...'],
      result_summary: '...',
      follow_up_questions: ['...'],
      warnings: [],
    };

  return ollamaJson(
    systemPrompt,
    [
      contextText ? `Conversation context:\n${contextText}` : null,
      `User question:\n${question}`,
      sql ? `Generated SQL:\n${sql}` : null,
      `Query result JSON:\n${JSON.stringify(structuredResult, null, 2)}`,
      `Return JSON only in this shape:\n${JSON.stringify(expectedJson, null, 2)}`,
    ].filter(Boolean).join('\n\n'),
    { profile, trace, temperature: 0.1, numPredict: 520 }
  );
}

async function summarizeQueryResult({
  question,
  mode = 'narrate',
  sql,
  columns = [],
  rows = [],
  rowCount = 0,
  profile = DEFAULT_PROFILE,
  trace = null,
  conversationContext = [],
  synthesizeWithModel = true,
  synthesisClient = null,
} = {}) {
  const context = {
    question,
    mode,
    sql,
    columns: normalizeColumns(columns, rows),
    rows: Array.isArray(rows) ? rows : [],
    rowCount: Number.isFinite(rowCount) ? rowCount : (Array.isArray(rows) ? rows.length : 0),
  };
  const fallback = deterministicResultSynthesis(context);

  if (!synthesizeWithModel) {
    return shapeNarrativeResponse(fallback, { mode, conversationContext });
  }

  try {
    const response = synthesisClient
      ? await synthesisClient({ ...context, profile, trace, conversationContext, fallback })
      : await synthesizeQueryResultWithOllama({
        ...context,
        profile,
        trace,
        conversationContext,
      });
    return shapeNarrativeResponse(
      normalizeSynthesisResponse(response, context, fallback),
      { mode, conversationContext }
    );
  } catch (_) {
    return shapeNarrativeResponse(fallback, { mode, conversationContext });
  }
}

function describeGeneratedSql(sql, question = '') {
  const referencedTables = extractReferencedTables(sql);
  const objectLabels = referencedTables.filter((table) => table !== 'DUAL').map(getSchemaObjectLabel);
  const target = objectLabels.length
    ? joinReadableList([...new Set(objectLabels)].slice(0, 3))
    : 'authorized utility views';
  const aggregate = /\b(COUNT|SUM|AVG|MIN|MAX|GROUP BY)\b/i.test(sql)
    ? 'summarized '
    : '';
  const limit = /\bFETCH FIRST\s+(\d+)\s+ROWS/i.exec(sql || '');
  const limitCopy = limit ? ` It limits the result to ${limit[1]} records for review.` : '';
  const questionCopy = question ? ' for the current utility data question' : '';
  return `This SQL would retrieve ${aggregate}data from ${target}${questionCopy} without executing it.${limitCopy}`;
}

function summarizeRunSqlResult({ sql, columns = [], rows = [], rowCount = 0 }) {
  const normalizedColumns = normalizeColumns(columns, rows);
  if (!rows || rows.length === 0 || rowCount === 0) {
    return 'SQL was validated and executed against authorized utility views, but no matching records were found in the current authorized data scope.';
  }
  const referencedTables = extractReferencedTables(sql);
  const objectLabels = referencedTables.filter((table) => table !== 'DUAL').map(getSchemaObjectLabel);
  const target = objectLabels.length ? joinReadableList([...new Set(objectLabels)].slice(0, 3)) : 'authorized utility views';
  const fields = normalizedColumns.slice(0, 5).map(humanizeColumnName).filter(Boolean);
  return `SQL was validated and executed against ${target}. It returned ${rowCount} structured records${fields.length ? ` with ${joinReadableList(fields)}` : ''}.`;
}

function invalidateMetadataCaches() {
  schemaCache = {
    expiresAt: 0,
    grouped: {},
    tableComments: {},
  };
  entityCache = {
    expiresAt: 0,
    catalogs: {},
  };
}

async function answerQuestion(question, {
  mode = 'narrate',
  demoUser = null,
  profile = DEFAULT_PROFILE,
  trace = null,
  conversationContext = [],
} = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const result = await runQuestionQuery(question, {
    mode,
    demoUser,
    profile: resolvedProfile,
    trace,
  });
  const answer = await summarizeQueryResult({
    question,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    trace,
    conversationContext,
  });

  return {
    answer: answer.answer,
    keyFindings: answer.key_findings || [],
    resultSummary: answer.result_summary || '',
    followUpQuestions: answer.follow_up_questions || [],
    referencedData: answer.referenced_data || null,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    repairedFromSql: result.repairedFromSql || null,
    warnings: [...(result.warnings || []), ...(answer.warnings || [])],
    responseStyle: answer.response_style || (mode === 'chat' ? 'conversation' : 'explanation'),
    conversationContextUsed: Boolean(answer.conversation_context_used),
    timings: trace || result.timings || {},
  };
}

async function summarizeContext({ question, instructions, context }) {
  return ollamaText(
    [
      'You are an operations analyst for a regulated Energy & Utilities platform spanning electric, gas, water/wastewater, upstream, midstream, and downstream operations.',
      'Answer only from the supplied JSON context.',
      'Be concise, specific, and truthful.',
      'If the context is incomplete, say so plainly.',
      instructions || '',
    ].join('\n'),
    `Question: ${question}\n\nContext JSON:\n${JSON.stringify(context, null, 2)}`,
    { temperature: 0.2 }
  );
}

module.exports = {
  DEFAULT_PROFILE,
  OLLAMA_MODEL,
  answerQuestion,
  checkAskUtilityDataHealth,
  createAskDataError,
  describeGeneratedSql,
  executeReadOnlySql,
  ensureSqlRowLimit,
  generatePatternSql,
  generateQuestionSql,
  generateReadOnlySql,
  getAvailableProfiles,
  getAvailableSelectAiProfiles,
  getUtilitiesSchemaObjectMetadata,
  getOllamaRuntimeConfig,
  getProfileModel,
  groupUtilitiesSchemaObjectMetadata,
  invalidateMetadataCaches,
  isAssistantQueryableObject,
  normalizeProfile,
  normalizeAskDataError,
  parseJsonResponse,
  runQuestionQuery,
  summarizeQueryResult,
  summarizeRunSqlResult,
  summarizeContext,
  validateReadOnlySql,
};
