'use strict';

const TOPIC_RULES = Object.freeze([
  {
    id: 'serial_match',
    label: 'Serial verification',
    positive: [/\bserial\b[^.]{0,80}\bmatch(?:es|ed)?\b/i, /\bmatching serial\b/i],
    negative: [/\bserial\b[^.]{0,80}\b(?:mismatch|does not match|did not match|different)\b/i, /\bserial mismatch\b/i],
  },
  {
    id: 'accessory_complete',
    label: 'Accessory completeness',
    positive: [/\b(?:accessor(?:y|ies)|charger|adapter|cable|kit)\b[^.]{0,80}\b(?:included|complete|present)\b/i],
    negative: [/\b(?:missing|absent|not included|incomplete)\b[^.]{0,80}\b(?:accessor(?:y|ies)|charger|adapter|cable|kit)\b/i, /\b(?:accessor(?:y|ies)|charger|adapter|cable|kit)\b[^.]{0,80}\b(?:missing|absent|not included|incomplete)\b/i],
  },
  {
    id: 'physical_damage',
    label: 'Physical damage',
    positive: [/\b(?:damaged|damage|dented|cracked|crushed|broken)\b/i],
    negative: [/\b(?:no|without)\s+(?:visible\s+)?damage\b/i, /\b(?:undamaged|intact condition)\b/i],
  },
  {
    id: 'factory_seal',
    label: 'Factory seal',
    positive: [/\bseal\b[^.]{0,60}\b(?:intact|unbroken|closed)\b/i],
    negative: [/\bseal\b[^.]{0,60}\b(?:broken|open|removed|missing)\b/i, /\bopen-box\b/i],
  },
  {
    id: 'policy_eligibility',
    label: 'Policy eligibility',
    positive: [/\b(?:eligible|approval|approve|refund permitted)\b/i],
    negative: [/\b(?:ineligible|denial|deny|refund prohibited)\b/i],
  },
]);

const INTENT_REQUIREMENTS = Object.freeze({
  policy: [['POLICY', 'RETURN_POLICY_CLAUSES']],
  evidence: [['DOCUMENT', 'RETURN_DOCUMENTS']],
  evidence_search: [['DOCUMENT', 'RETURN_DOCUMENTS']],
  decision: [['DECISION', 'RETURN_DECISIONS'], ['POLICY', 'RETURN_POLICY_CLAUSES']],
  timeline: [['EVENT', 'RETURN_EVENTS']],
  customer_history: [['CUSTOMER_HISTORY', 'CUSTOMERS']],
  status: [['RETURN_CASE', 'RETURN_REQUESTS']],
  order_product: [['RETURN_CASE', 'RETURN_REQUESTS']],
});

function compact(value, maxLength = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function normalizeEvidence(item, index) {
  if (!item || typeof item !== 'object') return null;
  const text = compact(item.text || item.evidenceText || item.EVIDENCE_TEXT, 1000);
  const citation = compact(item.citation || item.CITATION || item.sourceId || item.SOURCE_ID, 300);
  if (!text || !citation) return null;
  return {
    id: compact(item.id || item.evidenceId || item.EVIDENCE_ID || `evidence-${index + 1}`, 120),
    citation,
    sourceType: compact(item.sourceCode || item.sourceType || item.SOURCE_TYPE, 80).toUpperCase(),
    title: compact(item.title || item.TITLE || 'Evidence', 220),
    text,
  };
}

function classifyPolarity(text, rule) {
  const negative = rule.negative.some((pattern) => pattern.test(text));
  if (negative) return 'negative';
  return rule.positive.some((pattern) => pattern.test(text)) ? 'positive' : null;
}

function isNormativePolicySource(item) {
  return item.sourceType === 'POLICY'
    || item.sourceType === 'POLICY CLAUSE'
    || item.citation.toUpperCase().includes('RETURN_POLICY_CLAUSES');
}

function detectEvidenceConflicts(evidence = []) {
  const normalized = evidence.map(normalizeEvidence).filter(Boolean);
  const conflicts = [];
  for (const rule of TOPIC_RULES) {
    const candidateEvidence = rule.id === 'policy_eligibility'
      ? normalized
      : normalized.filter((item) => !isNormativePolicySource(item));
    const assertions = candidateEvidence.map((item) => ({
      ...item,
      polarity: classifyPolarity(item.text, rule),
    })).filter((item) => item.polarity);
    const positive = assertions.filter((item) => item.polarity === 'positive');
    const negative = assertions.filter((item) => item.polarity === 'negative');
    const distinctSources = new Set(assertions.map((item) => item.citation));
    if (!positive.length || !negative.length || distinctSources.size < 2) continue;
    conflicts.push({
      id: rule.id,
      topic: rule.label,
      status: 'conflicting',
      message: `${rule.label} is described inconsistently by the visible evidence.`,
      assertions: [positive[0], negative[0]].map((item) => ({
        polarity: item.polarity,
        citation: item.citation,
        sourceType: item.sourceType,
        title: item.title,
        excerpt: compact(item.text),
      })),
    });
  }
  return conflicts;
}

function sourceMatches(item, accepted) {
  const haystack = `${item.sourceType} ${item.citation}`.toUpperCase();
  return accepted.some((value) => haystack.includes(value));
}

function detectEvidenceGaps({ intents = [], evidence = [] } = {}) {
  const normalized = evidence.map(normalizeEvidence).filter(Boolean);
  const intentIds = [...new Set(intents.map((item) => (
    String(typeof item === 'object' ? item?.id : item || '').toLowerCase()
  )).filter(Boolean))];
  const gaps = [];
  for (const intent of intentIds) {
    for (const acceptedSources of INTENT_REQUIREMENTS[intent] || []) {
      if (normalized.some((item) => sourceMatches(item, acceptedSources))) continue;
      gaps.push({
        id: `${intent}:${acceptedSources[0].toLowerCase()}`,
        intent,
        status: 'missing',
        expectedSource: acceptedSources[0],
        message: `${intent.replaceAll('_', ' ')} does not have a visible ${acceptedSources[0].toLowerCase()} source.`,
      });
    }
  }
  return gaps;
}

function buildEvidenceSuggestions({ intents = [], evidence = [], conflicts = [], gaps = [] } = {}) {
  const suggestions = [];
  if (conflicts.length) suggestions.push('Which source should be treated as authoritative, and when was each source recorded?');
  for (const gap of gaps.slice(0, 3)) {
    if (gap.expectedSource === 'POLICY') suggestions.push('What policy clause applies to this return?');
    else if (gap.expectedSource === 'DECISION') suggestions.push('Has an authorized reviewer recorded a decision?');
    else if (gap.expectedSource === 'EVENT') suggestions.push('What happened in this return and when?');
    else if (gap.expectedSource === 'DOCUMENT') suggestions.push('What document or inspection evidence is available?');
    else if (gap.expectedSource === 'CUSTOMER_HISTORY') suggestions.push('What prior returns are visible for this customer?');
  }
  const intentIds = intents.map((item) => String(typeof item === 'object' ? item?.id : item || '').toLowerCase());
  if (!conflicts.length && !gaps.length && intentIds.includes('evidence')) {
    suggestions.push('Does this evidence agree with the applicable policy?');
  }
  if (evidence.length > 1) suggestions.push('Show the evidence in event-time order.');
  return [...new Set(suggestions)].slice(0, 4);
}

function analyzeReturnEvidence({ intents = [], evidence = [] } = {}) {
  const conflicts = detectEvidenceConflicts(evidence);
  const gaps = detectEvidenceGaps({ intents, evidence });
  return {
    conflicts,
    gaps,
    suggestions: buildEvidenceSuggestions({ intents, evidence, conflicts, gaps }),
    completeness: gaps.length ? 'incomplete' : conflicts.length ? 'conflicting' : 'complete',
  };
}

module.exports = {
  INTENT_REQUIREMENTS,
  TOPIC_RULES,
  analyzeReturnEvidence,
  buildEvidenceSuggestions,
  detectEvidenceConflicts,
  detectEvidenceGaps,
  normalizeEvidence,
  isNormativePolicySource,
};
