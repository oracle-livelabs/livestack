'use strict';

const TEAM_CONFIG = Object.freeze({
  DEMAND_SIGNAL_AGENT: Object.freeze({
    intent: 'demand_signals',
    scene: 'social',
    strong: ['trending', 'viral', 'virality', 'momentum', 'creator network', 'influencer network', 'social signal'],
    weak: ['trend', 'signal', 'creator', 'influencer', 'post', 'engagement', 'views', 'likes', 'shares', 'sentiment', 'demand'],
  }),
  FULFILLMENT_OPTIMIZATION_AGENT: Object.freeze({
    intent: 'fulfillment',
    scene: 'fulfillment',
    strong: ['fulfillment', 'inventory risk', 'reorder', 'low inventory', 'low stock', 'out of stock', 'nearest center', 'spatial route'],
    weak: ['inventory', 'stock', 'warehouse', 'center', 'ship', 'deliver', 'distance', 'supply'],
  }),
  COMMERCE_INTELLIGENCE_AGENT: Object.freeze({
    intent: 'commerce',
    scene: 'orders',
    strong: ['revenue', 'order total', 'sales', 'average order', 'category breakdown', 'commerce'],
    weak: ['order', 'orders', 'customer value', 'category', 'sold', 'purchase'],
  }),
  RETURNS_TRIAGE_AGENT: Object.freeze({
    intent: 'returns',
    scene: 'returns',
    strong: ['return case', 'return request', 'return policy', 'refund', 'return evidence', 'risk rating', 'missing accessories'],
    weak: ['return', 'policy', 'decision', 'damage', 'warranty', 'serial number', 'service case'],
  }),
});

const FOLLOW_UP = /\b(that|those|them|these|it|same|former|latter|previous|prior|above)\b|^(?:and|also|then|what about|how about|why|which one|where can|does that|is that)\b/i;
const INJECTION = /\b(ignore|disregard|override|reveal|print|show)\b.{0,60}\b(instruction|prompt|system|tool|sql)\b|\b(?:use|switch\s+to|select|call)\s+(?:the\s+)?(?:\w+\s+){0,3}(?:agent|tool|sql)\b|\b(drop|delete|update|insert|merge)\s+(?:table|into|from|\w+)/i;
const ROUTE_OVERRIDE_CLAUSE = /\b(?:ignore|disregard|override|reveal|print|show|use|switch\s+to|select|call|drop|delete|update|insert|merge)\b[^.!?]*(?:[.!?]|$)/gi;

function clean(value, limit = 160) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function extractEntities(question, prior = {}) {
  const text = clean(question, 1000);
  const entities = { ...(prior || {}) };
  const idPatterns = [
    ['returnId', /\b(?:return|case)\s*(?:#|id\s*)?(?:ret-)?0*(\d+)\b/i],
    ['orderId', /\border\s*(?:#|id\s*)?0*(\d+)\b/i],
    ['customerId', /\bcustomer\s*(?:#|id\s*)?0*(\d+)\b/i],
  ];
  for (const [key, pattern] of idPatterns) {
    const match = text.match(pattern);
    if (match) entities[key] = Number(match[1]);
  }
  const quoted = text.match(/["']([^"']{2,100})["']/);
  const knownProduct = text.match(/\b(AllTerrain Hiking Boots|RaceDay Docking Hub|Summit Hydration Pack)\b/i);
  if (knownProduct) entities.productName = clean(knownProduct[1], 100);
  else if (quoted) entities.productName = clean(quoted[1], 100);
  const city = text.match(/(?:customer\s+in|near|closest\s+to|to)\s+([A-Z][A-Za-z .'-]{1,40})(?:\?|$)/);
  if (city) entities.city = clean(city[1], 60);
  return entities;
}

function scoreQuestion(question) {
  const lowered = clean(question, 1000).toLowerCase();
  return Object.entries(TEAM_CONFIG).map(([team, config], index) => {
    const strongMatches = config.strong.filter((term) => lowered.includes(term));
    const weakMatches = config.weak.filter((term) => lowered.includes(term));
    return {
      team,
      intent: config.intent,
      index,
      score: strongMatches.length * 4 + weakMatches.length,
      matches: [...strongMatches, ...weakMatches],
    };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
}

function deepLinkFor(team, entities) {
  const scene = TEAM_CONFIG[team]?.scene || 'agents';
  const params = new URLSearchParams({ page: scene });
  if (entities.returnId) params.set('returnId', String(entities.returnId));
  if (entities.orderId) params.set('orderId', String(entities.orderId));
  if (entities.productName) params.set('product', entities.productName);
  return {
    scene,
    label: `Open ${scene === 'social' ? 'Customer Trend Signals' : scene === 'orders' ? 'Unified Order Intelligence' : scene === 'returns' ? 'Returns Intelligence' : 'Intelligent Fulfillment Network'}`,
    href: `/?${params.toString()}`,
    entities,
  };
}

function bindRouteToCitedEvidence(route, claims = []) {
  const citedEntity = claims
    .flatMap((claim) => claim?.citations || [])
    .map((citation) => citation?.entity)
    .find((entity) => entity && Object.keys(entity).length) || {};
  const entities = { ...citedEntity, ...(route?.entities || {}) };
  return {
    ...route,
    entities,
    deepLink: route?.team ? deepLinkFor(route.team, entities) : route?.deepLink || null,
  };
}

function clarification(message, ranked, entities, injectionDetected) {
  return {
    status: 'clarification',
    team: null,
    intent: 'ambiguous',
    confidence: 0,
    margin: ranked[0]?.score || 0,
    reason: message,
    alternatives: ranked.filter((item) => item.score > 0).slice(0, 3).map((item) => ({ team: item.team, intent: item.intent, score: item.score })),
    entities,
    injectionDetected,
    handoff: null,
    deepLink: null,
  };
}

function routeAgentQuestion(question, conversation = {}) {
  const text = clean(question, 1000);
  const priorTeam = TEAM_CONFIG[conversation.lastTeam] ? conversation.lastTeam : null;
  const entities = extractEntities(text, conversation.entities);
  const injectionDetected = INJECTION.test(text);
  const routingText = injectionDetected ? text.replace(ROUTE_OVERRIDE_CLAUSE, ' ') : text;
  const ranked = scoreQuestion(routingText);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const explicitFollowUp = FOLLOW_UP.test(text);

  if (best.score === 0) {
    if (explicitFollowUp && priorTeam) {
      const team = priorTeam;
      return {
        status: 'completed', team, intent: TEAM_CONFIG[team].intent,
        confidence: 0.72, margin: 1, reason: 'Follow-up retained the prior specialist and server-owned entity context.',
        alternatives: [], entities, injectionDetected, handoff: null, deepLink: deepLinkFor(team, entities),
      };
    }
    if (explicitFollowUp) {
      return clarification('The follow-up has no prior specialist context. Name the retail domain or entity to investigate.', ranked, entities, injectionDetected);
    }
    return {
      status: 'refused', team: null, intent: 'unsupported', confidence: 1, margin: 0,
      reason: 'No allowlisted retail intent matched.', alternatives: [], entities,
      injectionDetected, handoff: null, deepLink: null,
    };
  }

  const margin = best.score - runnerUp.score;
  if (best.score >= 3 && runnerUp.score >= 3 && margin <= 1) {
    return clarification(`This could be handled by ${best.intent} or ${runnerUp.intent}. Choose one domain so the tool boundary stays explicit.`, ranked, entities, injectionDetected);
  }

  const confidence = Math.max(0.55, Math.min(0.99, 0.58 + best.score * 0.055 + margin * 0.025));
  const handoff = priorTeam && priorTeam !== best.team
    ? { from: priorTeam, to: best.team, reason: `The new question explicitly matched ${best.intent}.` }
    : null;
  return {
    status: 'completed', team: best.team, intent: best.intent,
    confidence: Math.round(confidence * 100) / 100, margin,
    reason: `Matched allowlisted ${best.intent} terms: ${best.matches.join(', ')}.`,
    alternatives: ranked.filter((item) => item.score > 0).slice(1, 3).map((item) => ({ team: item.team, intent: item.intent, score: item.score })),
    entities, injectionDetected, handoff, deepLink: deepLinkFor(best.team, entities),
  };
}

module.exports = {
  TEAM_CONFIG,
  bindRouteToCitedEvidence,
  deepLinkFor,
  extractEntities,
  routeAgentQuestion,
  scoreQuestion,
};
