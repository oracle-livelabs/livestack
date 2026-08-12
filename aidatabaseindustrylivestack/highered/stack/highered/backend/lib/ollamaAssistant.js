const db = require('../config/database');

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const DEFAULT_PROFILE = 'HE_LLAMA_PROFILE';
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;
const ENTITY_CACHE_TTL_MS = 10 * 60 * 1000;
const GOVERNED_SCHEMA_BLOCK_MESSAGE = 'This query was not executed because it falls outside the allowed governed higher education schema.';
const ASK_DATA_ERROR_MESSAGES = {
  API_UNREACHABLE: 'The Ask Seer Higher Ed Data API is unreachable. Check that the app backend is running.',
  OLLAMA_UNAVAILABLE: 'The local Ollama service is unavailable. Check that the Ollama container is running and that llama3.2 is installed.',
  OLLAMA_MODEL_MISSING: 'Model llama3.2 is not available in Ollama. Pull or configure the model before using Ask Seer Higher Ed Data.',
  OLLAMA_TIMEOUT: 'The local Ollama service did not respond in time. Try again after the model finishes warming up.',
  SQL_GENERATION_FAILED: 'Unable to generate safe SQL for that question. Try a more specific student-success metric, time window, or entity.',
  SQL_VALIDATION_BLOCKED: GOVERNED_SCHEMA_BLOCK_MESSAGE,
  ORACLE_QUERY_FAILED: 'Oracle could not execute the generated query. Try rephrasing with a more specific governed higher education view.',
  REQUEST_TIMEOUT: 'The request took too long. Try a narrower question.',
  MALFORMED_LLM_RESPONSE: 'The model returned an unexpected response. Try again with a more specific higher education data question.',
  UNEXPECTED_BACKEND_RESPONSE: 'Ask Seer Higher Ed Data could not complete the request.',
};
const ALLOWED_TABLES = [
  'AGENT_ACTIONS',
  'APP_USERS',
  'ACADEMIC_PROGRAMS_V',
  'CAMPUS_SERVICE_SITES_V',
  'DEMAND_FORECASTS',
  'DEMAND_REGIONS',
  'EVENT_STREAM',
  'FULFILLMENT_ZONES',
  'HIGHERED_STUDENTS_V',
  'STUDENT_REQUEST_LINES_V',
  'STUDENT_SERVICE_CAPACITY_V',
  'STUDENT_SERVICE_REQUESTS_V',
  'STUDENT_SERVICE_ROUTES_V',
  'STUDENT_SERVICES_V',
  'STUDENT_SIGNAL_POSTS_V',
  'SUCCESS_ADVOCATES_V',
];
const ALLOWED_TABLE_SET = new Set(ALLOWED_TABLES);
const PROFILE_CATALOG = Object.freeze({
  [DEFAULT_PROFILE]: Object.freeze({
    name: DEFAULT_PROFILE,
    status: 'ENABLED',
    model: OLLAMA_MODEL,
    provider: 'Ollama',
    type: 'Local SQL + reasoning',
    description: 'Primary local Ollama model for Ask Your Data.',
  }),
});
const PROFILE_ALIASES = new Map();
[
  [
    DEFAULT_PROFILE,
    [
      DEFAULT_PROFILE,
      'SC_LLAMA_PROFILE',
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

function schemaObject(objectName, objectType, domain, displayName, description, exampleQuestions = []) {
  return Object.freeze({
    object_name: objectName,
    object_type: objectType,
    domain,
    display_name: displayName,
    description,
    example_questions: exampleQuestions,
    is_queryable_by_assistant: true,
  });
}

const HIGHERED_SCHEMA_OBJECTS = Object.freeze([
  schemaObject(
    'student_service_requests_v',
    'view',
    'Student Requests',
    'Student Service Requests',
    'Higher education service request view with student, request status, service value proxy, campus service site, signal source, demand score, and lifecycle timestamps.'
  ),
  schemaObject(
    'student_request_lines_v',
    'view',
    'Student Requests',
    'Student Request Lines',
    'Preferred Ask Data view for student request line items, requested services, academic programs, quantity, and line-level service value.'
  ),
  schemaObject(
    'student_services_v',
    'view',
    'Student Services',
    'Student Services',
    'Student service catalog with service category, subcategory, value proxy, delivery cost proxy, tags, and owning academic program.'
  ),
  schemaObject(
    'academic_programs_v',
    'view',
    'Academic Programs',
    'Academic Programs',
    'Academic program and service-owner view with program category, location, annual service value proxy, and signal tier.'
  ),
  schemaObject(
    'highered_students_v',
    'view',
    'Students',
    'Synthetic Students',
    'Synthetic student profile view with contact, support tier, service value proxy, and location.'
  ),
  schemaObject(
    'student_signal_posts_v',
    'view',
    'Student Signals',
    'Student Signal Posts',
    'Student and community signal feed with signal text, engagement metrics, sentiment, urgency score, momentum, and detected services.'
  ),
  schemaObject(
    'success_advocates_v',
    'view',
    'Student Signals',
    'Success Advocates',
    'Success advocate and community signal source view with channel, audience size, engagement, advocate score, focus, and region.'
  ),
  schemaObject(
    'campus_service_sites_v',
    'view',
    'Campus Service Capacity',
    'Campus Service Sites',
    'Campus service sites and access centers with location, service site type, capacity, current load, and active status.'
  ),
  schemaObject(
    'student_service_capacity_v',
    'view',
    'Campus Service Capacity',
    'Student Service Capacity',
    'Capacity view by student service and campus service site with available, reserved, incoming, threshold, and refresh units.'
  ),
  schemaObject(
    'student_service_routes_v',
    'view',
    'Service Routes',
    'Student Service Routes',
    'Service routing records with site assignment, routing team, route status, route cost proxy, distance, and response times.'
  ),
  schemaObject(
    'demand_forecasts',
    'table',
    'Demand Forecasting',
    'Demand Forecasts',
    'Forecast records for student service demand, signal multiplier, model version, and explanatory factors.'
  ),
  schemaObject(
    'demand_regions',
    'table',
    'Demand Forecasting',
    'Demand Regions',
    'Regional demand planning and spatial context used by campus service analysis.'
  ),
  schemaObject(
    'fulfillment_zones',
    'table',
    'Campus Service Capacity',
    'Service Zones',
    'Spatial service zones used for coverage, capacity, and routing analysis.'
  ),
  schemaObject(
    'event_stream',
    'table',
    'Operations Events',
    'Operations Event Stream',
    'Operational events used by the higher education demo for signal, graph, agent, and import workflows.'
  ),
  schemaObject(
    'agent_actions',
    'table',
    'AI Agent Actions',
    'Higher Ed Agent Actions',
    'Audit records for higher education AI agent tasks, decisions, execution status, and timestamps.'
  ),
]);

const HIGHERED_SCHEMA_DOMAIN_ORDER = [
  'Student Requests',
  'Student Services',
  'Academic Programs',
  'Students',
  'Student Signals',
  'Campus Service Capacity',
  'Service Routes',
  'Demand Forecasting',
  'Operations Events',
  'AI Agent Actions',
];
const RELATIONSHIP_HINTS = [
  'STUDENT_REQUEST_LINES_V.REQUEST_ID joins to STUDENT_SERVICE_REQUESTS_V.REQUEST_ID.',
  'STUDENT_REQUEST_LINES_V.SERVICE_ID joins to STUDENT_SERVICES_V.SERVICE_ID.',
  'STUDENT_REQUEST_LINES_V.PROGRAM_ID joins to ACADEMIC_PROGRAMS_V.PROGRAM_ID.',
  'STUDENT_SERVICE_REQUESTS_V.STUDENT_ID joins to HIGHERED_STUDENTS_V.STUDENT_ID.',
  'STUDENT_SERVICE_REQUESTS_V.CAMPUS_SERVICE_SITE_ID joins to CAMPUS_SERVICE_SITES_V.CAMPUS_SERVICE_SITE_ID.',
  'STUDENT_SERVICE_REQUESTS_V.SIGNAL_SOURCE_ID joins to STUDENT_SIGNAL_POSTS_V.SIGNAL_ID.',
  'STUDENT_SIGNAL_POSTS_V.ADVOCATE_ID joins to SUCCESS_ADVOCATES_V.ADVOCATE_ID.',
  'STUDENT_SERVICE_CAPACITY_V.SERVICE_ID joins to STUDENT_SERVICES_V.SERVICE_ID.',
  'STUDENT_SERVICE_CAPACITY_V.CAMPUS_SERVICE_SITE_ID joins to CAMPUS_SERVICE_SITES_V.CAMPUS_SERVICE_SITE_ID.',
  'STUDENT_SERVICE_ROUTES_V.REQUEST_ID joins to STUDENT_SERVICE_REQUESTS_V.REQUEST_ID.',
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

function getOllamaRuntimeConfig(profile = DEFAULT_PROFILE) {
  const resolvedProfile = normalizeProfile(profile);
  return {
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    host: OLLAMA_BASE_URL,
  };
}

function getHigherEdSchemaObjectMetadata({ queryableOnly = true } = {}) {
  const objects = [...HIGHERED_SCHEMA_OBJECTS];
  return queryableOnly ? objects.filter((object) => object.is_queryable_by_assistant !== false) : objects;
}

function groupHigherEdSchemaObjectMetadata(objects = getHigherEdSchemaObjectMetadata()) {
  const domainRank = new Map(HIGHERED_SCHEMA_DOMAIN_ORDER.map((domain, index) => [domain, index]));
  const groups = new Map();

  objects.forEach((object) => {
    const domain = object.domain || 'Reference Data';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(object);
  });

  return [...groups.entries()]
    .sort(([leftDomain], [rightDomain]) => {
      const leftRank = domainRank.get(leftDomain) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = domainRank.get(rightDomain) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || leftDomain.localeCompare(rightDomain);
    })
    .map(([domain, groupObjects]) => ({
      domain,
      objects: groupObjects.sort((left, right) => left.display_name.localeCompare(right.display_name)),
      object_count: groupObjects.length,
    }));
}

function createAskDataError(category, cause = null, extra = {}) {
  const fallbackMessage = ASK_DATA_ERROR_MESSAGES[category] || ASK_DATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE;
  const error = new Error(extra.message || fallbackMessage);
  error.category = category;
  error.cause = cause || undefined;
  error.statusCode = extra.statusCode || (
    category === 'REQUEST_TIMEOUT' ? 504
      : category === 'SQL_VALIDATION_BLOCKED' || category === 'SQL_GENERATION_FAILED' ? 400
        : 500
  );
  Object.assign(error, extra);
  return error;
}

function normalizeAskDataError(error) {
  const message = String(error?.message || '');
  let category = error?.category || 'UNEXPECTED_BACKEND_RESPONSE';

  if (!error?.category) {
    if (message === 'timeout' || /timed out|timeout/i.test(message)) {
      category = 'REQUEST_TIMEOUT';
    } else if (/Ollama request failed/i.test(message)) {
      category = /model.*not found|not found/i.test(message) ? 'OLLAMA_MODEL_MISSING' : 'OLLAMA_UNAVAILABLE';
    } else if (/Only SELECT or WITH|Comments and multiple statements|Write operations|System packages|unsupported tables|not allowed/i.test(message)) {
      category = 'SQL_VALIDATION_BLOCKED';
    } else if (/Unable to generate|No SQL generated|safe read-only SQL|valid Oracle SQL/i.test(message)) {
      category = 'SQL_GENERATION_FAILED';
    } else if (/\bORA-\d{5}\b/i.test(message) || error?.oracleError) {
      category = 'ORACLE_QUERY_FAILED';
    }
  }

  const isBlocked = category === 'SQL_VALIDATION_BLOCKED';
  const profile = normalizeProfile(error?.profile);
  return {
    category,
    statusCode: error?.statusCode || (isBlocked || category === 'SQL_GENERATION_FAILED' ? 400 : category === 'REQUEST_TIMEOUT' ? 504 : 500),
    userMessage: isBlocked
      ? GOVERNED_SCHEMA_BLOCK_MESSAGE
      : (ASK_DATA_ERROR_MESSAGES[category] || message || ASK_DATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE),
    developerMessage: message || ASK_DATA_ERROR_MESSAGES[category] || ASK_DATA_ERROR_MESSAGES.UNEXPECTED_BACKEND_RESPONSE,
    sql: isBlocked ? null : (error?.sql || null),
    oracleError: error?.oracleError || null,
    profile,
    model: error?.model || getProfileModel(profile),
  };
}

function getShortErrorMessage(error) {
  return String(error?.message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || 'Unknown Oracle error';
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

  return withSqlContext(new Error(friendlyMessage), {
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

  const [programsResult, servicesResult, centersResult, studentsResult, advocatesResult] = await Promise.all([
    db.execute(`SELECT academic_program AS value FROM academic_programs_v ORDER BY academic_program`),
    db.execute(`SELECT service_name AS value FROM student_services_v ORDER BY service_name`),
    db.execute(`SELECT campus_service_site_name AS value FROM campus_service_sites_v ORDER BY campus_service_site_name`),
    db.execute(`
      SELECT TRIM(first_name || ' ' || last_name) AS value FROM highered_students_v
      UNION
      SELECT email AS value FROM highered_students_v
    `),
    db.execute(`
      SELECT handle AS value FROM success_advocates_v
      UNION
      SELECT display_name AS value FROM success_advocates_v
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
      brand: buildCatalog(programsResult.rows, 'brand'),
      product: buildCatalog(servicesResult.rows, 'product'),
      center: buildCatalog(centersResult.rows, 'center'),
      customer: buildCatalog(studentsResult.rows, 'customer'),
      influencer: buildCatalog(advocatesResult.rows, 'influencer'),
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

function higherEdEntityLabel(entityType) {
  return {
    brand: 'academic program',
    product: 'student service',
    center: 'campus service center',
    customer: 'student',
    influencer: 'success advocate',
  }[entityType] || entityType;
}

function buildUnsupportedConsumerCommerceError(candidate, programSuggestions = []) {
  const suggestionText = programSuggestions.length
    ? ` Try a known academic program such as ${formatEntityList(programSuggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't map "${candidate}" to this higher education demo schema. Ask about academic programs, student services, students, campus service centers, or success advocates instead.${suggestionText}`
  );
}

function buildUnknownEntityError(candidate, entityType, suggestions = []) {
  const label = higherEdEntityLabel(entityType);
  const suggestionText = suggestions.length
    ? ` Closest ${label} matches: ${formatEntityList(suggestions)}.`
    : '';
  return createUserQueryError(
    `I couldn't find a ${label} named "${candidate}" in this demo schema.${suggestionText}`
  );
}

async function resolveQuestionEntities(question) {
  const originalQuestion = String(question || '').trim();
  const { catalogs } = await loadEntityCatalog();
  let resolvedQuestion = originalQuestion;
  const resolutionHints = [];

  const unsupportedConsumerCommercePatterns = [
    /\b(?:sold|available|stocked|carried)\s+at\s+(.+?)(?=$|[?.!,])/i,
    /\b(?:retailer|store|storefront)\s+(?:named|called\s+)?["']?(.+?)["']?(?=$|[?.!,])/i,
  ];

  for (const regex of unsupportedConsumerCommercePatterns) {
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
      throw buildUnsupportedConsumerCommerceError(candidate, rankEntityMatches(catalogs.brand, candidate, 3));
    }
  }

  const explicitEntityPatterns = [
    { type: 'brand', regexes: [/\b(?:academic\s+program|program|brand)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'product', regexes: [/\b(?:student\s+service|service|product)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'center', regexes: [/\b(?:campus\s+service\s+(?:site|center)|service\s+center|fulfillment\s+center|warehouse|center)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'customer', regexes: [/\b(?:student|customer)\s+(?:named|called)\s+["']?(.+?)["']?(?=$|[?.!,])/i] },
    { type: 'influencer', regexes: [/\b(?:success\s+advocate|advocate|influencer)\s+(?:named|called)\s+@?["']?(.+?)["']?(?=$|[?.!,])/i] },
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
          resolutionHints.push(`Entity resolution: treat "${candidate}" as ${higherEdEntityLabel(entry.type)} "${exact.value}".`);
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
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw createAskDataError('MALFORMED_LLM_RESPONSE', null, { message: 'Ollama returned invalid JSON' });
  }
}

async function ollamaGenerate(prompt, { format = null, temperature = 0.1, numPredict = 192, profile = DEFAULT_PROFILE } = {}) {
  const { model } = getProfileConfig(profile);
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
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

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    const category = /model.*not found|not found/i.test(body) ? 'OLLAMA_MODEL_MISSING' : 'OLLAMA_UNAVAILABLE';
    throw createAskDataError(category, null, {
      statusCode: 503,
      message: `Ollama request failed (${response.status}): ${body}`,
    });
  }

  const payload = await response.json();
  return stripCodeFences(payload?.response || '');
}

async function ollamaJson(systemPrompt, userPrompt, { profile = DEFAULT_PROFILE } = {}) {
  const text = await ollamaGenerate(
    `${systemPrompt}\n\n${userPrompt}`,
    { format: 'json', temperature: 0.05, numPredict: 160, profile }
  );
  return parseJsonResponse(text);
}

async function ollamaText(systemPrompt, userPrompt, { temperature = 0.2, profile = DEFAULT_PROFILE } = {}) {
  return ollamaGenerate(`${systemPrompt}\n\n${userPrompt}`, {
    temperature,
    numPredict: 220,
    profile,
  });
}

async function checkAskHigherEdDataHealth({ demoUser = 'admin_jess', profile = DEFAULT_PROFILE } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const runtime = getOllamaRuntimeConfig(resolvedProfile);
  const checks = [];

  async function check(name, fn) {
    const startedAt = Date.now();
    try {
      const details = await fn();
      checks.push({
        name,
        status: 'ok',
        duration_ms: Date.now() - startedAt,
        ...(details || {}),
      });
    } catch (error) {
      const normalized = normalizeAskDataError(error);
      checks.push({
        name,
        status: 'failed',
        duration_ms: Date.now() - startedAt,
        category: normalized.category,
        message: normalized.developerMessage,
      });
    }
  }

  await check('oracle_connection', async () => {
    const result = await db.execute('SELECT 1 AS ok FROM dual');
    return { rows: result.rows?.length || 0 };
  });

  await check('schema_metadata', async () => {
    const metadata = await loadSchemaMetadata();
    return { objects: Object.keys(metadata.grouped || {}).length };
  });

  await check('governed_query', async () => {
    const result = await executeReadOnlySql('SELECT COUNT(*) AS student_requests FROM student_service_requests_v', { demoUser, maxRows: 1 });
    return { row_count: result.rowCount };
  });

  await check('ollama_tags', async () => {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: 'GET' });
    if (!response.ok) {
      throw createAskDataError('OLLAMA_UNAVAILABLE', null, {
        message: `Ollama tags request failed with HTTP ${response.status}`,
      });
    }
    const payload = await response.json().catch(() => ({}));
    const models = (payload.models || []).map((model) => model.name || model.model).filter(Boolean);
    return {
      ollama_host: runtime.host,
      selected_model: runtime.model,
      model_available: models.some((name) => String(name).startsWith(runtime.model)),
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

  if (/(signal|signals|urgency|viral|virality|trend|trending|momentum|social|post|advocate|engagement|views|likes|shares|sentiment|community|alumni|advancement|fundraising|donor)/.test(q)) {
    [
      'STUDENT_SIGNAL_POSTS_V',
      'SUCCESS_ADVOCATES_V',
      'STUDENT_SERVICE_REQUESTS_V',
      'STUDENT_REQUEST_LINES_V',
      'STUDENT_SERVICES_V',
    ].forEach((tableName) => selected.add(tableName));
  }

  if (/(capacity|campus|site|access|inventory|restock|reorder|stock|route|routing|center|nearest|demand|forecast|region|emergency aid|scholarship|financial aid)/.test(q)) {
    [
      'CAMPUS_SERVICE_SITES_V',
      'STUDENT_SERVICE_CAPACITY_V',
      'STUDENT_SERVICE_ROUTES_V',
      'STUDENT_SERVICE_REQUESTS_V',
      'STUDENT_SERVICES_V',
      'DEMAND_FORECASTS',
      'DEMAND_REGIONS',
      'FULFILLMENT_ZONES',
    ].forEach((tableName) => selected.add(tableName));
  }

  if (/(request|requests|service value|resource impact|value|student|program|service|category|total|average|best|highest|line|retention|enrollment|census|persistence|advancement|fundraising|scholarship)/.test(q)) {
    [
      'STUDENT_SERVICE_REQUESTS_V',
      'STUDENT_REQUEST_LINES_V',
      'STUDENT_SERVICES_V',
      'HIGHERED_STUDENTS_V',
      'ACADEMIC_PROGRAMS_V',
    ].forEach((tableName) => selected.add(tableName));
  }

  if (/(user|users|region|role|account)/.test(q)) {
    ['APP_USERS'].forEach((tableName) => selected.add(tableName));
  }

  if (selected.size === 0) {
    [
      'STUDENT_SERVICE_REQUESTS_V',
      'STUDENT_REQUEST_LINES_V',
      'STUDENT_SERVICES_V',
      'HIGHERED_STUDENTS_V',
      'STUDENT_SIGNAL_POSTS_V',
      'SUCCESS_ADVOCATES_V',
      'ACADEMIC_PROGRAMS_V',
      'CAMPUS_SERVICE_SITES_V',
    ].forEach((tableName) => selected.add(tableName));
  }

  return [...selected];
}

async function getSchemaContext(question = '') {
  const metadata = await loadSchemaMetadata();
  const selectedTables = selectRelevantTables(question);

  const tableLines = selectedTables
    .filter((tableName) => metadata.grouped[tableName]?.length)
    .map((tableName) => {
      const comment = metadata.tableComments[tableName] ? ` -- ${metadata.tableComments[tableName]}` : '';
      return `${tableName}${comment}\n  ${metadata.grouped[tableName].join(', ')}`;
    });

  return [
    'Available Oracle schema for this higher education student-success app:',
    tableLines.join('\n'),
    'Key joins and semantics:',
    ...RELATIONSHIP_HINTS
      .filter((hint) => selectedTables.some((tableName) => hint.includes(tableName)))
      .map((hint) => `- ${hint}`),
    '- Prefer higher education semantic views such as STUDENT_SERVICE_REQUESTS_V, STUDENT_REQUEST_LINES_V, STUDENT_SERVICES_V, and STUDENT_SIGNAL_POSTS_V for user-facing answers.',
    '- STUDENT_SIGNAL_POSTS_V.MOMENTUM_FLAG values include normal, rising, viral, and mega_viral; urgency questions should use URGENCY_SCORE.',
    '- Capacity pressure questions should compare STUDENT_SERVICE_CAPACITY_V.CAPACITY_UNITS with RESERVED_UNITS and CAPACITY_TRIGGER_POINT.',
    '- Service value questions usually use STUDENT_SERVICE_REQUESTS_V.SERVICE_VALUE_PROXY or STUDENT_REQUEST_LINES_V.LINE_SERVICE_VALUE.',
  ].join('\n');
}

function sanitizeSql(sql) {
  return stripCodeFences(String(sql || ''))
    .replace(/;+\s*$/g, '')
    .trim();
}

function generatePatternSql(question) {
  const q = String(question || '').trim();
  const qLower = q.toLowerCase();

  const topMatch = qLower.match(/\btop\s+(\d+)\b/);
  const topN = topMatch ? Math.min(parseInt(topMatch[1], 10), 25) : 5;
  const dayMatch = qLower.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  const dayWindow = dayMatch ? Math.min(parseInt(dayMatch[1], 10), 365) : null;

  if (/student services.*signal-driven demand|signal-driven demand.*student services|highest signal.*demand/.test(qLower)) {
    const dateFilter = /this week/.test(qLower)
      ? "AND CAST(r.created_at AS DATE) >= (SELECT TRUNC(MAX(CAST(created_at AS DATE)), 'IW') FROM student_service_requests_v)"
      : dayWindow ? `AND CAST(r.created_at AS DATE) >= (SELECT MAX(CAST(created_at AS DATE)) FROM student_service_requests_v) - ${dayWindow}` : '';
    return `SELECT l.service_name,
                   l.service_category,
                   COUNT(DISTINCT l.request_id) AS request_count,
                   ROUND(SUM(l.line_service_value), 2) AS signal_driven_service_value
            FROM student_request_lines_v l
            JOIN student_service_requests_v r ON r.request_id = l.request_id
            WHERE r.signal_source_id IS NOT NULL
            ${dateFilter}
            GROUP BY l.service_name, l.service_category
            ORDER BY request_count DESC, signal_driven_service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(fall census|census).*(retention|persistence).*risk|advisors?.*(respond|response|intervene).*(retention|persistence).*risk|retention risk.*advisors?/.test(qLower)) {
    return `SELECT l.academic_program,
                   site.campus_service_site_name,
                   l.service_name,
                   COUNT(DISTINCT r.request_id) AS active_student_requests,
                   ROUND(AVG(NVL(r.demand_score, 0)), 1) AS avg_retention_risk_score,
                   SUM(CASE WHEN r.signal_source_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_linked_requests,
                   ROUND(SUM(l.line_service_value), 2) AS resource_impact
            FROM student_service_requests_v r
            JOIN student_request_lines_v l ON l.request_id = r.request_id
            LEFT JOIN campus_service_sites_v site ON site.campus_service_site_id = r.campus_service_site_id
            WHERE LOWER(l.service_category) IN ('student success', 'enrollment', 'financial aid', 'basic needs', 'student wellness')
               OR LOWER(l.service_subcategory) IN ('retention', 'appeals', 'emergency aid', 'course access')
               OR r.signal_source_id IS NOT NULL
            GROUP BY l.academic_program, site.campus_service_site_name, l.service_name
            ORDER BY avg_retention_risk_score DESC, signal_linked_requests DESC, active_student_requests DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/academic programs?.*(retention|persistence).*pressure|retention pressure.*academic programs?|programs?.*highest retention/.test(qLower)) {
    return `SELECT l.academic_program,
                   COUNT(DISTINCT r.request_id) AS active_student_requests,
                   ROUND(AVG(NVL(r.demand_score, 0)), 1) AS avg_retention_pressure_score,
                   SUM(CASE WHEN r.signal_source_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_linked_requests,
                   ROUND(SUM(l.line_service_value), 2) AS resource_impact
            FROM student_request_lines_v l
            JOIN student_service_requests_v r ON r.request_id = l.request_id
            WHERE LOWER(l.service_category) IN ('student success', 'enrollment', 'financial aid', 'basic needs', 'student wellness', 'advancement')
               OR LOWER(l.service_subcategory) IN ('retention', 'appeals', 'emergency aid', 'course access')
               OR r.signal_source_id IS NOT NULL
            GROUP BY l.academic_program
            ORDER BY avg_retention_pressure_score DESC, signal_linked_requests DESC, active_student_requests DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(advancement|fundraising|alumni).*(emergency aid|scholarship|financial aid|capacity)|where should advancement support/.test(qLower)) {
    return `SELECT s.service_name,
                   s.service_category,
                   s.academic_program,
                   SUM(c.capacity_units) AS available_capacity,
                   SUM(c.reserved_units) AS committed_capacity,
                   SUM(c.capacity_trigger_point) AS capacity_threshold,
                   ROUND(SUM(c.capacity_units - c.reserved_units), 0) AS net_capacity,
                   COUNT(DISTINCT c.campus_service_site_id) AS campus_service_sites
            FROM student_services_v s
            JOIN student_service_capacity_v c ON c.service_id = s.service_id
            WHERE LOWER(s.service_category) IN ('advancement', 'financial aid', 'basic needs')
               OR LOWER(s.service_name) LIKE '%emergency fund%'
               OR LOWER(s.service_name) LIKE '%scholarship%'
               OR LOWER(s.service_name) LIKE '%financial aid%'
            GROUP BY s.service_name, s.service_category, s.academic_program
            ORDER BY net_capacity ASC, committed_capacity DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(service value|resource impact).*service category|(service value|resource impact) by category|service category.*(service value|resource impact)|breakdown by category/.test(qLower)) {
    return `SELECT service_category,
                   COUNT(DISTINCT request_id) AS request_count,
                   ROUND(SUM(line_service_value), 2) AS service_value
            FROM student_request_lines_v
            GROUP BY service_category
            ORDER BY service_value DESC`;
  }

  if (/service value by academic program|academic program service value|academic program value breakdown/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(r.created_at AS DATE) >= (SELECT MAX(CAST(created_at AS DATE)) FROM student_service_requests_v) - ${dayWindow}` : '';
    return `SELECT l.academic_program,
                   COUNT(DISTINCT l.request_id) AS request_count,
                   ROUND(SUM(l.line_service_value), 2) AS service_value
            FROM student_request_lines_v l
            JOIN student_service_requests_v r ON r.request_id = l.request_id
            ${dateFilter}
            GROUP BY l.academic_program
            ORDER BY service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/(which is the best student service|what is the best student service|top .*student services.*service value|student services by service value)/.test(qLower)) {
    const dateFilter = dayWindow ? `WHERE CAST(r.created_at AS DATE) >= (SELECT MAX(CAST(created_at AS DATE)) FROM student_service_requests_v) - ${dayWindow}` : '';
    const limit = (!topMatch && /best student service/.test(qLower)) ? 1 : topN;
    return `SELECT l.service_name,
                   l.academic_program,
                   ROUND(SUM(l.line_service_value), 2) AS service_value,
                   SUM(l.requested_quantity) AS requested_units
            FROM student_request_lines_v l
            JOIN student_service_requests_v r ON r.request_id = l.request_id
            ${dateFilter}
            GROUP BY l.service_name, l.academic_program
            ORDER BY service_value DESC, requested_units DESC
            FETCH FIRST ${limit} ROWS ONLY`;
  }

  const urgencyMatch = qLower.match(/(?:urgency|virality) score above\s+(\d+)/);
  if (/(how many student signal posts|how many social posts)/.test(qLower) && urgencyMatch) {
    return `SELECT COUNT(*) AS signal_post_count
            FROM student_signal_posts_v
            WHERE urgency_score > ${parseInt(urgencyMatch[1], 10)}`;
  }

  if (/campus service sites.*risk|capacity pressure|at risk of capacity|service sites.*capacity pressure/.test(qLower)) {
    return `SELECT s.campus_service_site_name,
                   s.city,
                   s.state_province,
                   s.current_load_pct,
                   NVL(SUM(c.capacity_units), 0) AS available_capacity,
                   NVL(SUM(c.reserved_units), 0) AS reserved_capacity,
                   NVL(SUM(c.capacity_trigger_point), 0) AS capacity_trigger_point
            FROM campus_service_sites_v s
            LEFT JOIN student_service_capacity_v c
              ON c.campus_service_site_id = s.campus_service_site_id
            GROUP BY s.campus_service_site_name, s.city, s.state_province, s.current_load_pct
            ORDER BY s.current_load_pct DESC, reserved_capacity DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/success advocates.*high-urgency|advocates.*high urgency|advocates.*connected/.test(qLower)) {
    return `SELECT a.display_name,
                   a.handle,
                   a.signal_channel,
                   ROUND(AVG(p.urgency_score), 2) AS avg_urgency_score,
                   COUNT(p.signal_id) AS signal_count
            FROM success_advocates_v a
            JOIN student_signal_posts_v p ON p.advocate_id = a.advocate_id
            WHERE p.urgency_score >= 75
            GROUP BY a.display_name, a.handle, a.signal_channel
            ORDER BY avg_urgency_score DESC, signal_count DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  if (/total (service value|resource impact).*all student requests|(service value|resource impact) from all student requests|overall (service value|resource impact)/.test(qLower)) {
    return `SELECT ROUND(SUM(service_value_proxy), 2) AS total_resource_impact
            FROM student_service_requests_v`;
  }

  if (/how many student requests have a community(?: or alumni)? signal source|student requests.*signal source|signal-driven student requests/.test(qLower)) {
    return `SELECT COUNT(*) AS signal_driven_request_count
            FROM student_service_requests_v
            WHERE signal_source_id IS NOT NULL`;
  }

  if (/average student-signal urgency score by (?:platform|channel)|urgency.*by (?:platform|channel)|urgency.*signal channel/.test(qLower)) {
    return `SELECT signal_channel,
                   ROUND(AVG(urgency_score), 2) AS avg_urgency_score,
                   COUNT(*) AS signal_count
            FROM student_signal_posts_v
            GROUP BY signal_channel
            ORDER BY avg_urgency_score DESC`;
  }

  if (/(how many student requests(?:\s+(?:are there|exist|in total|total|overall))?|number of student requests|total number of student requests|summarize .*how many student requests|summarize .*total student requests|total student request count|overall student request count|count of student requests)/.test(qLower)) {
    return `SELECT COUNT(*) AS total_student_requests FROM student_service_requests_v`;
  }

  if (/how many student requests were placed this week|student requests placed this week/.test(qLower)) {
    return `SELECT COUNT(*) AS student_requests_this_week
            FROM student_service_requests_v
            WHERE CAST(created_at AS DATE) >= (SELECT TRUNC(MAX(CAST(created_at AS DATE)), 'IW') FROM student_service_requests_v)`;
  }

  if (/synthetic students .*most student requests|students .*most requests|top synthetic students by requests/.test(qLower)) {
    return `SELECT s.first_name || ' ' || s.last_name AS student_name,
                   s.email,
                   COUNT(r.request_id) AS request_count,
                   ROUND(SUM(r.service_value_proxy), 2) AS total_service_value
            FROM highered_students_v s
            JOIN student_service_requests_v r ON r.student_id = s.student_id
            GROUP BY s.first_name, s.last_name, s.email
            ORDER BY request_count DESC, total_service_value DESC
            FETCH FIRST ${topN} ROWS ONLY`;
  }

  return null;
}

function extractReferencedTables(sql) {
  const tables = new Set();
  const regex = /\b(?:from|join)\s+([A-Za-z0-9_."$#]+)/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const rawIdentifier = match[1].split(/\s+/)[0];
    const baseName = rawIdentifier
      .split('.')
      .pop()
      .replace(/"/g, '')
      .toUpperCase();
    if (baseName) tables.add(baseName);
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

  if (/\b(INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CREATE|DECLARE|BEGIN|COMMIT|ROLLBACK|CALL|EXECUTE)\b/i.test(normalized)) {
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

async function setDemoUserContext(connection, demoUser) {
  try {
    await connection.execute(
      `BEGIN sc_security_ctx.set_user_context(:username); END;`,
      { username: demoUser || 'admin_jess' }
    );
  } catch (_) {
    // The schema context package is optional for these helper calls.
  }
}

async function generateReadOnlySql(question, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [] } = {}) {
  const patternSql = generatePatternSql(question);
  if (patternSql) {
    const validation = validateReadOnlySql(patternSql);
    if (validation.ok) {
      return validation.sql;
    }
  }

  const schemaContext = await getSchemaContext(question);
  const response = await ollamaJson(
    [
      'You translate natural language into a single Oracle SQL query for a higher education student-success schema.',
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
      '- Prefer higher education semantic views such as STUDENT_SERVICE_REQUESTS_V, STUDENT_REQUEST_LINES_V, STUDENT_SERVICES_V, HIGHERED_STUDENTS_V, STUDENT_SIGNAL_POSTS_V, SUCCESS_ADVOCATES_V, ACADEMIC_PROGRAMS_V, and CAMPUS_SERVICE_SITES_V.',
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
    { profile }
  );

  const sql = response?.sql || '';
  const validation = validateReadOnlySql(sql);
  if (!sql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to generate a safe read-only SQL query.');
  }

  return validation.sql;
}

async function repairReadOnlySql(question, failedSql, failedError, { mode = 'narrate', profile = DEFAULT_PROFILE, resolutionHints = [] } = {}) {
  const schemaContext = await getSchemaContext(question);
  const response = await ollamaJson(
    [
      'You repair a failing Oracle SQL query for a higher education student-success schema.',
      'Return JSON only with keys "sql" and "reason".',
      'Rules:',
      '- Keep the original user intent, but fix the SQL so it compiles and runs in Oracle.',
      '- Generate exactly one read-only SELECT or WITH query.',
      '- Never use DBMS_CLOUD_AI, SELECT AI, PL/SQL, DDL, DML, comments, or semicolons.',
      '- Use only the tables, columns, and joins that exist in the provided schema context.',
      '- Do not reference columns from an alias unless that alias is joined in the same SELECT block.',
      '- Prefer higher education semantic views when they are present in the schema context.',
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
    { profile }
  );

  const repairedSql = response?.sql || '';
  const validation = validateReadOnlySql(repairedSql);
  if (!repairedSql || !validation.ok) {
    throw new Error(response?.reason || validation.reason || 'Unable to repair the SQL query.');
  }

  return validation.sql;
}

async function executeReadOnlySql(sql, { demoUser = null, maxRows = 200 } = {}) {
  const validation = validateReadOnlySql(sql);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  let connection;
  try {
    connection = await db.getConnection();
    await setDemoUserContext(connection, demoUser);

    const result = await connection.execute(validation.sql, {}, {
      outFormat: db.oracledb.OUT_FORMAT_OBJECT,
      maxRows,
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
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

async function runQuestionQuery(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, maxRows = 200 } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const resolution = await resolveQuestionEntities(question);
  const effectiveQuestion = resolution.question;
  const initialSql = await generateReadOnlySql(effectiveQuestion, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
  });
  let currentSql = initialSql;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await executeReadOnlySql(currentSql, { demoUser, maxRows });
      return {
        ...result,
        profile: resolvedProfile,
        model: getProfileModel(resolvedProfile),
        repairedFromSql: currentSql === initialSql ? null : initialSql,
        resolvedQuestion: effectiveQuestion,
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
        repairedSql = await repairReadOnlySql(effectiveQuestion, currentSql, error, {
          mode,
          profile: resolvedProfile,
          resolutionHints: resolution.resolutionHints,
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

async function generateQuestionSql(question, { mode = 'showsql', profile = DEFAULT_PROFILE } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const resolution = await resolveQuestionEntities(question);
  const sql = await generateReadOnlySql(resolution.question, {
    mode,
    profile: resolvedProfile,
    resolutionHints: resolution.resolutionHints,
  });

  return {
    sql,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    warnings: resolution.resolutionHints || [],
    resolvedQuestion: resolution.question,
  };
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

function deterministicSummary({ mode = 'narrate', sql, columns, rows, rowCount }) {
  if (!rows || rows.length === 0) {
    return 'No matching rows were found for that question.';
  }

  if (rowCount === 1) {
    const entries = Object.entries(rows[0]).map(([key, value]) => `${key}: ${formatValue(value)}`);
    return mode === 'chat'
      ? `I found one result. ${entries.join(', ')}.`
      : entries.join(', ');
  }

  const preview = rows.slice(0, 5).map((row) =>
    columns
      .slice(0, 4)
      .map((column) => `${column}: ${formatValue(row[column])}`)
      .join(', ')
  );

  const intro = mode === 'chat'
    ? `I found ${rowCount} rows. Here are the main results`
    : `Found ${rowCount} rows`;

  const sqlNote = sql ? '' : '';
  return `${intro}: ${preview.join(' | ')}${sqlNote}`;
}

function getSchemaObjectLabel(objectName) {
  const key = String(objectName || '').toLowerCase();
  const object = HIGHERED_SCHEMA_OBJECTS.find((entry) => entry.object_name === key);
  return object?.display_name || key.replace(/_v$/i, '').replace(/_/g, ' ');
}

function joinReadableList(items = []) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function describeGeneratedSql(sql, question = '') {
  const referencedTables = extractReferencedTables(sql)
    .filter((tableName) => tableName !== 'DUAL')
    .map(getSchemaObjectLabel);
  const target = referencedTables.length
    ? joinReadableList([...new Set(referencedTables)].slice(0, 4))
    : 'authorized higher education views';
  const questionCopy = question ? ' for the current higher education data question' : '';
  return `This SQL was generated${questionCopy} and validated as a read-only Oracle query against ${target}. It has not been executed in Show SQL mode.`;
}

function summarizeRunSqlResult(result = {}) {
  const rowCount = Number(result.rowCount || 0);
  if (!rowCount) {
    return 'SQL was validated and executed against authorized higher education views, but no matching records were found in the current authorized data scope.';
  }
  const referencedTables = extractReferencedTables(result.sql || '')
    .filter((tableName) => tableName !== 'DUAL')
    .map(getSchemaObjectLabel);
  const target = referencedTables.length
    ? joinReadableList([...new Set(referencedTables)].slice(0, 3))
    : 'authorized higher education views';
  return `${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'} returned from ${target}.`;
}

function buildReferencedData(sql, columns = [], rows = []) {
  const objectLabels = extractReferencedTables(sql || '')
    .filter((tableName) => tableName !== 'DUAL')
    .map(getSchemaObjectLabel);
  return {
    objects: [...new Set(objectLabels)],
    notable_fields: columns || [],
    preview_rows: (rows || []).slice(0, 3),
  };
}

function buildKeyFindings(columns = [], rows = [], limit = 3) {
  return (rows || []).slice(0, limit).map((row, index) => {
    const values = (columns.length ? columns : Object.keys(row))
      .slice(0, 3)
      .map((column) => `${column}: ${formatValue(row[column])}`);
    return `${index + 1}. ${values.join(' - ') || 'Matching higher education record'}`;
  });
}

function buildFollowUpQuestions(question = '', result = {}) {
  const q = String(question || '').toLowerCase();
  if (/capacity|campus|site|access/.test(q)) {
    return [
      'Which campus service sites have the most available capacity?',
      'Show service capacity by student service category.',
    ];
  }
  if (/signal|urgency|engagement|platform|advocate/.test(q)) {
    return [
      'Which success advocates have the highest urgency signals?',
      'Which student requests are linked to high-urgency signals?',
    ];
  }
  if (/program|service|request|value/.test(q)) {
    return [
      'Break this down by academic program.',
      'Show the top student services by service value.',
    ];
  }
  if (result.rowCount > 1) {
    return [
      'Break this down by campus service site.',
      'Show the same result for high-urgency student requests.',
    ];
  }
  return [];
}

function formatConversationContext(conversationContext = []) {
  return (Array.isArray(conversationContext) ? conversationContext : [])
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant'))
    .slice(-6)
    .map((entry) => {
      const speaker = entry.role === 'user' ? 'User' : 'Assistant';
      const text = String(entry.text || entry.question || '').trim().replace(/\s+/g, ' ');
      return text ? `${speaker}: ${text.slice(0, 500)}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function conversationalFallback({ rows, rowCount, conversationContext }) {
  const evidence = deterministicSummary({
    mode: 'narrate',
    columns: Object.keys(rows?.[0] || {}),
    rows,
    rowCount,
  });
  const hasHistory = Boolean(formatConversationContext(conversationContext));
  return `${hasHistory ? 'Building on this conversation, ' : ''}here’s what the current question shows: ${evidence} ${rowCount > 1 ? 'I can compare these results or drill into a specific program, service, or campus next.' : 'What would you like to explore next?'}`;
}

async function summarizeQueryResult({ question, mode = 'narrate', sql, columns, rows, rowCount, profile = DEFAULT_PROFILE, conversationContext = [] }) {
  const fastSummary = deterministicSummary({ mode, sql, columns, rows, rowCount });

  if (mode !== 'chat' || rowCount === 0) {
    return fastSummary;
  }

  try {
    const history = formatConversationContext(conversationContext);
    return await ollamaText(
      [
        'You are a conversational data assistant for a higher education student success demo application.',
        'Use only the supplied SQL result set.',
        'Do not invent numbers or columns.',
        'Respond naturally to the current question, using the conversation only to preserve context and tone.',
        'Give a concise interpretation, call out the most decision-relevant evidence, and end with one useful next step or follow-up question.',
        'Do not describe SQL unless the user asks for it.',
      ].join('\n'),
      [
        `Question: ${question}`,
        history ? `Recent conversation:\n${history}` : null,
        `SQL: ${sql}`,
        `Columns: ${columns.join(', ')}`,
        `Row count: ${rowCount}`,
        `Rows: ${buildPromptRows(rows, 6)}`,
      ].filter(Boolean).join('\n\n'),
      { temperature: 0.35, profile }
    );
  } catch (_) {
    return conversationalFallback({ rows, rowCount, conversationContext });
  }
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

async function answerQuestion(question, { mode = 'narrate', demoUser = null, profile = DEFAULT_PROFILE, conversationContext = [] } = {}) {
  const resolvedProfile = normalizeProfile(profile);
  const result = await runQuestionQuery(question, {
    mode,
    demoUser,
    profile: resolvedProfile,
  });
  const answer = await summarizeQueryResult({
    question,
    mode,
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    conversationContext,
  });

  return {
    answer,
    keyFindings: buildKeyFindings(result.columns, result.rows),
    resultSummary: summarizeRunSqlResult(result),
    followUpQuestions: buildFollowUpQuestions(question, result),
    referencedData: buildReferencedData(result.sql, result.columns, result.rows),
    warnings: [],
    sql: result.sql,
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rowCount,
    profile: resolvedProfile,
    model: getProfileModel(resolvedProfile),
    repairedFromSql: result.repairedFromSql || null,
  };
}

async function summarizeContext({ question, instructions, context }) {
  return ollamaText(
    [
      'You are an operations analyst for a higher education student success platform.',
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
  checkAskHigherEdDataHealth,
  createAskDataError,
  describeGeneratedSql,
  executeReadOnlySql,
  generateQuestionSql,
  generateReadOnlySql,
  getAvailableProfiles,
  getAvailableSelectAiProfiles,
  getHigherEdSchemaObjectMetadata,
  getOllamaRuntimeConfig,
  getProfileModel,
  groupHigherEdSchemaObjectMetadata,
  invalidateMetadataCaches,
  normalizeAskDataError,
  normalizeProfile,
  runQuestionQuery,
  summarizeRunSqlResult,
  summarizeContext,
  validateReadOnlySql,
};
