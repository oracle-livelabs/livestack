const INTENT_DEFINITIONS = Object.freeze([
  {
    id: 'policy',
    label: 'Policy and eligibility',
    patterns: [
      /\bpolicy\b/, /\bclause\b/, /\brule\b/, /\beligib/, /\brefund requirement/, /\bwarranty\b/,
    ],
  },
  {
    id: 'customer_history',
    label: 'Customer return history',
    patterns: [
      /\bprior\b/, /\bprevious\b/, /\bpast returns?\b/, /\breturn history\b/,
      /\bhow many returns?\b/, /\breturned before\b/, /\brepeat return/,
      /\bearlier return/,
    ],
  },
  {
    id: 'timeline',
    label: 'Events and decision timeline',
    patterns: [
      /\btimeline\b/, /\bevents?\b/, /\bwhat happened\b/, /\bwhen\b/, /\bactivity\b/,
      /\bwho (?:created|reviewed|decided|acted)\b/,
    ],
  },
  {
    id: 'evidence',
    label: 'Return evidence search',
    patterns: [
      /\bevidence\b/, /\bdocuments?\b/, /\bphotos?\b/, /\bimages?\b/, /\bserial\b/,
      /\baccessor/, /\bcharger\b/, /\badapter\b/, /\bscan\b/, /\bdamage/, /\bproof\b/,
      /\bpackage\b/, /\bmissing\b/, /\bmatch(?:es|ed|ing)?\b/,
    ],
  },
  {
    id: 'decision',
    label: 'Recommendation rationale',
    patterns: [
      /\bwhy\b/, /\brecommend/, /\bdecision\b/, /\bden(?:y|ied|ial)\b/, /\bapprov/,
      /\brisk\b/, /\bconfidence\b/, /\bscore\b/, /\breason for\b/,
    ],
  },
  {
    id: 'order_product',
    label: 'Order and product details',
    patterns: [
      /\border\b/, /\bproduct\b/, /\bitem\b/, /\bprice\b/, /\bvalue\b/, /\bcost\b/,
      /\bchannel\b/, /\bpurchase/, /\bdeliver/, /\bcategory\b/,
    ],
  },
  {
    id: 'customer',
    label: 'Customer profile',
    patterns: [
      /\bcustomer\b/, /\bname\b/, /\btier\b/, /\blifetime value\b/, /\blocation\b/,
      /\bcity\b/, /\bstate\b/,
    ],
  },
  {
    id: 'status',
    label: 'Case status',
    patterns: [
      /\bstatus\b/, /\bstate of (?:the )?case\b/, /\bopen\b/, /\bclosed\b/, /\bin review\b/,
      /\bstate is (?:the )?case\b/, /\breturn stand\b/,
    ],
  },
]);

const STOP_WORDS = new Set([
  'a', 'about', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'case',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i', 'in', 'is',
  'it', 'me', 'of', 'on', 'or', 'return', 'show', 'tell', 'that', 'the', 'this', 'to',
  'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you',
]);

const SEARCH_SYNONYMS = Object.freeze({
  accessories: ['accessory', 'charger', 'adapter', 'kit', 'cable'],
  accessory: ['accessories', 'charger', 'adapter', 'kit', 'cable'],
  missing: ['absent', 'accessory', 'charger', 'adapter', 'kit', 'cable'],
  serial: ['inbound', 'outbound', 'mismatch', 'verification'],
  damage: ['damaged', 'dented', 'cracked', 'crushed', 'package', 'packaging'],
  damaged: ['damage', 'dented', 'cracked', 'crushed', 'package', 'packaging'],
  denied: ['deny', 'denial', 'risk', 'policy'],
  deny: ['denied', 'denial', 'risk', 'policy'],
  approved: ['approve', 'approval', 'eligible'],
});

const OUT_OF_SCOPE_PATTERNS = Object.freeze([
  /\bweather\b/, /\bfootball\b/, /\bstock price\b/, /\bpoem\b/,
  /\brestaurant\b/, /\bcapital of\b/, /\bbook (?:a )?flight\b/,
  /\bstore (?:hours|close|open)\b/,
]);

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function routeReturnQuestion(question) {
  const normalized = normalize(question);
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      intent: 'unsupported',
      intents: [{ id: 'unsupported', label: 'Outside the return file', matchedSignals: 1 }],
      label: 'Outside the return file',
      matchedSignals: 1,
      confidence: 'out_of_scope',
    };
  }
  const candidates = [];

  for (const [index, definition] of INTENT_DEFINITIONS.entries()) {
    const signalMatches = definition.patterns.filter((pattern) => pattern.test(normalized));
    if (!signalMatches.length) continue;
    candidates.push({
      id: definition.id,
      label: definition.label,
      matchedSignals: signalMatches.length,
      order: index,
    });
  }

  if (!candidates.length) {
    return {
      intent: 'evidence_search',
      intents: [{ id: 'evidence_search', label: 'General evidence search', matchedSignals: 0 }],
      label: 'General evidence search',
      matchedSignals: 0,
      confidence: 'exploratory',
    };
  }

  candidates.sort((left, right) => right.matchedSignals - left.matchedSignals || left.order - right.order);
  const intents = candidates.map(({ order, ...match }) => match);
  const best = intents[0];
  return {
    intent: best.id,
    intents,
    label: intents.length > 1 ? `${intents.length} evidence routes` : best.label,
    matchedSignals: intents.reduce((sum, intent) => sum + intent.matchedSignals, 0),
    confidence: best.matchedSignals > 1 || intents.length > 1 ? 'high' : 'matched',
  };
}

function questionTerms(question) {
  const terms = normalize(question)
    .split(' ')
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const synonym of SEARCH_SYNONYMS[term] || []) expanded.add(synonym);
  }
  return [...expanded];
}

function evidenceText(item) {
  return normalize([
    item.sourceType,
    item.title,
    item.text,
  ].filter(Boolean).join(' '));
}

function rankEvidence(question, items = []) {
  const terms = questionTerms(question);
  return items
    .map((item) => {
      const haystack = evidenceText(item);
      const matchedTerms = terms.filter((term) => haystack.includes(term));
      const storedScore = Number(item.storedScore || 0);
      return {
        ...item,
        matchedTerms,
        searchScore: (matchedTerms.length * 10) + storedScore,
      };
    })
    .sort((left, right) => right.searchScore - left.searchScore);
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'not recorded';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'not recorded';
  return `${Math.round(number * 100)}%`;
}

function compactText(value, maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function citation(table, identifier) {
  return identifier ? `${table} · ${identifier}` : table;
}

function buildSingleIntentAnswer({ question, route, request, policy, documents = [], events = [], decisions = [], priorReturns = [] }) {
  const returnLabel = `RET-${String(request.RETURN_ID).padStart(4, '0')}`;
  const requestCitation = citation('RETURN_REQUESTS', returnLabel);

  if (route.intent === 'unsupported') {
    return {
      answer: `That question is outside the evidence stored in ${returnLabel}. I can answer questions about this return's policy, evidence, customer history, order, status, timeline, and recommendation.`,
      citations: [requestCitation],
      matchedEvidence: [],
      notFound: true,
    };
  }

  if (route.intent === 'policy') {
    if (!policy?.CLAUSE_CODE) {
      return {
        answer: `${returnLabel} references ${request.POLICY_CLAUSE || 'no policy clause'}, but the matching policy text is not available in the active dataset.`,
        citations: [requestCitation],
        matchedEvidence: [],
        notFound: true,
      };
    }
    const policyCitation = citation('RETURN_POLICY_CLAUSES', policy.CLAUSE_CODE);
    return {
      answer: `${policy.CLAUSE_CODE} — ${policy.CLAUSE_TITLE} applies. ${compactText(policy.CLAUSE_TEXT, 300)} Severity: ${policy.SEVERITY || 'standard'}.`,
      citations: [requestCitation, policyCitation],
      matchedEvidence: [{
        sourceType: 'Policy clause',
        title: policy.CLAUSE_TITLE,
        text: policy.CLAUSE_TEXT,
        citation: policyCitation,
      }],
    };
  }

  if (route.intent === 'customer_history') {
    const count = priorReturns.length;
    const summary = count
      ? priorReturns.slice(0, 3).map((item) => `RET-${String(item.RETURN_ID).padStart(4, '0')} (${item.RETURN_REASON}, ${item.RECOMMENDATION})`).join('; ')
      : 'No earlier return requests are visible in the active VPD scope.';
    return {
      answer: `${request.CUSTOMER_NAME} has ${count} prior return${count === 1 ? '' : 's'} visible to this user. ${summary}`,
      citations: [requestCitation, ...priorReturns.slice(0, 3).map((item) => citation('RETURN_REQUESTS', `RET-${String(item.RETURN_ID).padStart(4, '0')}`))],
      matchedEvidence: priorReturns.slice(0, 3).map((item) => ({
        sourceType: 'Prior return',
        title: `RET-${String(item.RETURN_ID).padStart(4, '0')}`,
        text: `${item.RETURN_REASON}; ${item.RISK_RATING} risk; ${item.RECOMMENDATION}; ${item.STATUS}`,
        citation: citation('RETURN_REQUESTS', `RET-${String(item.RETURN_ID).padStart(4, '0')}`),
      })),
    };
  }

  if (route.intent === 'timeline') {
    const timeline = [
      ...events.map((item) => ({
        sourceType: 'Return event',
        title: item.EVENT_TYPE,
        text: item.EVENT_NOTE,
        actor: item.ACTOR,
        createdAt: item.CREATED_AT,
        citation: citation('RETURN_EVENTS', item.EVENT_ID),
      })),
      ...decisions.map((item) => ({
        sourceType: 'Decision',
        title: item.DECISION_TYPE,
        text: item.DECISION_SUMMARY,
        actor: item.CREATED_BY,
        createdAt: item.CREATED_AT,
        citation: citation('RETURN_DECISIONS', item.DECISION_ID),
      })),
    ].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    if (!timeline.length) {
      return { answer: `No events or decisions are recorded for ${returnLabel}.`, citations: [requestCitation], matchedEvidence: [], notFound: true };
    }
    const latest = timeline[0];
    const latestActor = latest.actor ? ` by ${latest.actor}` : '';
    return {
      answer: `${returnLabel} has ${timeline.length} recorded event${timeline.length === 1 ? '' : 's'} or decision${timeline.length === 1 ? '' : 's'}. The latest is ${latest.title}${latestActor}: ${compactText(latest.text, 180)}`,
      citations: [requestCitation, ...timeline.slice(0, 4).map((item) => item.citation)],
      matchedEvidence: timeline.slice(0, 4),
    };
  }

  if (route.intent === 'order_product') {
    if (/\bcolou?r\b/.test(normalize(question))) {
      return {
        answer: `The active evidence for ${returnLabel} does not record the product color. I can confirm the product, category, order value, delivery state, and return channel.`,
        citations: [requestCitation, citation('PRODUCTS', request.PRODUCT_ID)],
        matchedEvidence: [],
        notFound: true,
      };
    }
    return {
      answer: `${returnLabel} covers ${request.PRODUCT_NAME} in ${request.CATEGORY || 'an uncategorized product group'}. The return value is ${formatMoney(request.RETURN_VALUE)} against order ${request.ORDER_ID} (${formatMoney(request.ORDER_TOTAL)}, ${request.ORDER_STATUS}). It was submitted through the ${request.RETURN_CHANNEL} channel.`,
      citations: [requestCitation, citation('PRODUCTS', request.PRODUCT_ID), citation('ORDERS', request.ORDER_ID)],
      matchedEvidence: [],
    };
  }

  if (route.intent === 'customer') {
    const location = [request.CITY, request.STATE_PROVINCE].filter(Boolean).join(', ') || 'location not recorded';
    return {
      answer: `${request.CUSTOMER_NAME} is a ${request.CUSTOMER_TIER || 'standard'} customer in ${location}, with lifetime value ${formatMoney(request.LIFETIME_VALUE)}.`,
      citations: [requestCitation, citation('CUSTOMERS', request.CUSTOMER_ID)],
      matchedEvidence: [],
    };
  }

  if (route.intent === 'status') {
    return {
      answer: `${returnLabel} is currently ${request.STATUS}. The recorded recommendation is ${request.RECOMMENDATION}, with ${formatPercent(request.CONFIDENCE_SCORE)} confidence and ${request.RISK_RATING} risk.`,
      citations: [requestCitation],
      matchedEvidence: [],
    };
  }

  const searchableEvidence = [
    ...documents.map((item) => ({
      sourceType: item.DOCUMENT_TYPE || 'Return document',
      title: item.TITLE,
      text: item.EXCERPT,
      storedScore: Number(item.SIMILARITY_SCORE || 0),
      citation: citation('RETURN_DOCUMENTS', item.DOCUMENT_ID),
    })),
    ...(policy?.CLAUSE_CODE ? [{
      sourceType: 'Policy clause',
      title: policy.CLAUSE_TITLE,
      text: policy.CLAUSE_TEXT,
      storedScore: 0,
      citation: citation('RETURN_POLICY_CLAUSES', policy.CLAUSE_CODE),
    }] : []),
    ...events.map((item) => ({
      sourceType: 'Return event',
      title: item.EVENT_TYPE,
      text: item.EVENT_NOTE,
      storedScore: 0,
      citation: citation('RETURN_EVENTS', item.EVENT_ID),
    })),
    ...decisions.map((item) => ({
      sourceType: 'Decision',
      title: item.DECISION_TYPE,
      text: item.DECISION_SUMMARY,
      storedScore: 0,
      citation: citation('RETURN_DECISIONS', item.DECISION_ID),
    })),
  ];
  const ranked = rankEvidence(question, searchableEvidence);

  if (route.intent === 'decision') {
    const supporting = ranked.filter((item) => item.text).slice(0, 2);
    return {
      answer: `${request.RECOMMENDATION} is the current recommendation for ${returnLabel}, with ${request.RISK_RATING} risk and ${formatPercent(request.CONFIDENCE_SCORE)} confidence. The case cites ${request.POLICY_CLAUSE || 'no policy clause'}.`,
      citations: [requestCitation, ...supporting.map((item) => item.citation)],
      matchedEvidence: supporting,
    };
  }

  const meaningfulTerms = questionTerms(question);
  const matches = meaningfulTerms.length
    ? ranked.filter((item) => item.matchedTerms.length).slice(0, 3)
    : ranked.slice(0, 3);

  if (!matches.length && route.intent === 'evidence' && documents.length) {
    const documentMatches = ranked
      .filter((item) => item.citation.startsWith('RETURN_DOCUMENTS'))
      .slice(0, 3);
    return {
      answer: `I found ${documentMatches.length} return-file document${documentMatches.length === 1 ? '' : 's'} for ${returnLabel}.`,
      citations: [requestCitation, ...documentMatches.map((item) => item.citation)],
      matchedEvidence: documentMatches,
    };
  }

  if (!matches.length) {
    return {
      answer: `I could not find evidence in ${returnLabel} that answers that question. Try asking about the recommendation, policy, serial or accessory evidence, customer return history, order details, status, or timeline.`,
      citations: [requestCitation],
      matchedEvidence: [],
      notFound: true,
    };
  }

  return {
    answer: `I found ${matches.length} relevant evidence item${matches.length === 1 ? '' : 's'} for ${returnLabel}.`,
    citations: [requestCitation, ...matches.map((item) => item.citation)],
    matchedEvidence: matches,
  };
}

function sourceFromCitation(value) {
  const [table, ...identifierParts] = String(value || '').split(' · ');
  const identifier = identifierParts.join(' · ');
  return {
    table,
    identifier,
    label: identifier ? `${table} · ${identifier}` : table,
  };
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const SEMANTIC_SOURCE_TYPES_BY_INTENT = Object.freeze({
  policy: ['POLICY'],
  customer_history: ['CUSTOMER_HISTORY'],
  timeline: ['EVENT', 'DECISION'],
  evidence: ['DOCUMENT', 'EVENT', 'POLICY', 'DECISION', 'RETURN_CASE'],
  evidence_search: ['DOCUMENT', 'EVENT', 'POLICY', 'DECISION', 'RETURN_CASE', 'CUSTOMER_HISTORY'],
  decision: ['DECISION', 'POLICY', 'DOCUMENT', 'RETURN_CASE'],
  order_product: ['RETURN_CASE'],
  customer: ['CUSTOMER_HISTORY', 'RETURN_CASE'],
  status: ['RETURN_CASE', 'DECISION'],
});

function semanticMatchesForIntent(intent, semanticEvidence = [], limit = 3) {
  const sourceTypes = SEMANTIC_SOURCE_TYPES_BY_INTENT[intent] || [];
  return semanticEvidence
    .filter((item) => sourceTypes.includes(item.sourceCode))
    .filter((item) => Number(item.semanticScore || 0) >= 0.2
      || (item.matchedTerms || []).length > 0)
    .slice(0, limit);
}

function isStrongSemanticMatch(item) {
  return Number(item.semanticScore || 0) >= 0.35
    || (item.matchedTerms || []).length > 0;
}

function buildReturnQuestionAnswer({ question, route, request, policy, documents = [], events = [], decisions = [], priorReturns = [], semanticEvidence = [] }) {
  const plannedIntents = route.intents?.length
    ? route.intents
    : [{ id: route.intent, label: route.label, matchedSignals: route.matchedSignals || 0 }];
  const sections = plannedIntents.map((plannedIntent) => {
    const result = buildSingleIntentAnswer({
      question,
      route: { intent: plannedIntent.id, label: plannedIntent.label },
      request,
      policy,
      documents,
      events,
      decisions,
      priorReturns,
    });
    const semanticMatches = plannedIntent.id === 'unsupported'
      ? []
      : semanticMatchesForIntent(plannedIntent.id, semanticEvidence);
    const evidence = uniqueBy(
      [...(result.matchedEvidence || []), ...semanticMatches],
      (item) => item.citation || `${item.sourceType}:${item.title}`
    );
    const citations = uniqueBy(
      [...(result.citations || []), ...semanticMatches.map((item) => item.citation)],
      (value) => value
    );
    const strongSemanticMatches = semanticMatches.filter(isStrongSemanticMatch);
    const semanticAnswered = ['evidence', 'evidence_search'].includes(plannedIntent.id)
      && strongSemanticMatches.length > 0;
    return {
      id: plannedIntent.id,
      title: plannedIntent.label,
      status: result.notFound && !semanticAnswered ? 'not_found' : 'answered',
      answer: semanticAnswered && result.notFound
        ? `I found ${strongSemanticMatches.length} semantically relevant evidence item${strongSemanticMatches.length === 1 ? '' : 's'} in the active return file.`
        : result.answer,
      evidence,
      sources: citations.map(sourceFromCitation),
    };
  });
  const citations = uniqueBy(
    sections.flatMap((section) => section.sources.map((source) => source.label)),
    (value) => value
  );
  const sources = citations.map(sourceFromCitation);
  const matchedEvidence = uniqueBy(
    sections.flatMap((section) => section.evidence),
    (item) => item.citation || `${item.sourceType}:${item.title}`
  );
  const answeredCount = sections.filter((section) => section.status === 'answered').length;
  const status = answeredCount ? 'answered' : 'not_found';
  const summary = sections.length > 1
    ? answeredCount
      ? `I found grounded information across ${answeredCount} of ${sections.length} requested areas.`
      : 'I could not find supporting evidence for the requested areas.'
    : sections[0]?.answer || 'No answer is available.';

  return {
    status,
    summary,
    answer: sections.map((section) => section.answer).join(' '),
    sections,
    sources,
    citations,
    matchedEvidence,
  };
}

module.exports = {
  buildReturnQuestionAnswer,
  questionTerms,
  rankEvidence,
  routeReturnQuestion,
};
