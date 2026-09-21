'use strict';

const { routeReturnQuestion, questionTerms } = require('./returnQuestionService');

const FOLLOWUP_PATTERNS = Object.freeze([
  /^why(?:\s+is\s+that|\s+was\s+that)?[?.!]*$/i,
  /^how(?:\s+so)?[?.!]*$/i,
  /^(?:and|but)\s+(?:what|how|why|when|who|where)\b/i,
  /^what about\b/i,
  /^does (?:that|it|this)\b/i,
  /^is (?:that|it|this)\b/i,
  /^can you (?:explain|expand|clarify) (?:that|it|this)\b/i,
  /\b(?:that|it|this|those|them|the former|the latter)\b/i,
]);

const ORDINAL_REFERENCE_PATTERN = /\b(?:first|second|third|former|latter|last)(?:\s+(?:one|item|source|document|event))?\b/i;
const MAX_ANCHOR_TERMS = 12;

function normalizeText(value, maxLength = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeIntent(value) {
  const intent = normalizeText(value, 64).toLowerCase();
  return /^[a-z][a-z0-9_]{0,63}$/.test(intent) ? intent : null;
}

function normalizeSource(value) {
  if (!value || typeof value !== 'object') return null;
  const citation = normalizeText(value.citation || value.label, 300);
  if (!citation) return null;
  return {
    citation,
    sourceType: normalizeText(value.sourceType || value.table, 80) || null,
    title: normalizeText(value.title, 220) || null,
  };
}

function validatedTurnMetadata(turn) {
  if (!turn || typeof turn !== 'object') return null;
  const metadata = turn.routeMetadata && typeof turn.routeMetadata === 'object'
    ? turn.routeMetadata
    : {};
  const intentValues = Array.isArray(metadata.intents)
    ? metadata.intents
    : [metadata.intent];
  const intents = [...new Set(intentValues.map((item) => (
    normalizeIntent(typeof item === 'object' ? item?.id : item)
  )).filter(Boolean))];
  const anchors = [...new Set([
    ...(Array.isArray(metadata.anchorTerms) ? metadata.anchorTerms : []),
    ...(Array.isArray(metadata.entities) ? metadata.entities : []),
  ].map((item) => normalizeText(item, 100).toLowerCase()).filter(Boolean))]
    .slice(0, MAX_ANCHOR_TERMS);
  const sources = (Array.isArray(turn.evidenceMetadata) ? turn.evidenceMetadata : [])
    .map(normalizeSource)
    .filter(Boolean)
    .slice(0, 12);
  const turnId = normalizeText(turn.turnId || turn.TURN_ID, 80);
  const question = normalizeText(turn.resolvedQuestion || turn.question, 500);
  const returnId = Number(turn.returnId || turn.RETURN_ID || metadata.returnId);
  if (!turnId || !question || !Number.isInteger(returnId) || returnId <= 0) return null;
  return {
    turnId,
    question,
    returnId,
    intents,
    anchors,
    sources,
    status: normalizeText(turn.status || turn.STATUS, 40).toUpperCase() || 'ANSWERED',
    turnNumber: Number(turn.turnNumber || turn.TURN_NUMBER || 0),
  };
}

function isFollowupQuestion(question, route) {
  if (route.intent === 'unsupported') return false;
  if (ORDINAL_REFERENCE_PATTERN.test(question)) return true;
  if (FOLLOWUP_PATTERNS.some((pattern) => pattern.test(question))) return true;
  return route.intent === 'evidence_search' && questionTerms(question).length <= 2;
}

function clarificationFor(prior, reason) {
  const sourceChoices = prior?.sources?.slice(0, 3).map((source) => source.title || source.citation) || [];
  if (reason === 'ordinal_source' && sourceChoices.length > 1) {
    return {
      message: 'Which evidence item do you mean?',
      choices: sourceChoices,
    };
  }
  return {
    message: 'What part of the return file should I use for that follow-up?',
    choices: ['Recommendation and risk', 'Policy', 'Evidence', 'Timeline'],
  };
}

/**
 * Resolves a follow-up using only persisted, validated routing/evidence
 * metadata. Assistant prose is deliberately excluded from the resolver.
 */
function resolveReturnFollowup({
  question,
  priorTurns = [],
  investigationReturnId,
  explicitReturnId = null,
} = {}) {
  const normalizedQuestion = normalizeText(question, 500);
  if (!normalizedQuestion) {
    return { status: 'invalid', code: 'QUESTION_REQUIRED', message: 'A question is required.' };
  }

  const scopedReturnId = Number(explicitReturnId || investigationReturnId);
  if (!Number.isInteger(scopedReturnId) || scopedReturnId <= 0) {
    return { status: 'invalid', code: 'RETURN_REQUIRED', message: 'A valid return is required.' };
  }
  if (explicitReturnId && Number(explicitReturnId) !== Number(investigationReturnId)) {
    return {
      status: 'conflict',
      code: 'FOLLOWUP_RETURN_MISMATCH',
      message: 'A follow-up cannot switch the return bound to this investigation.',
    };
  }

  const route = routeReturnQuestion(normalizedQuestion);
  const followup = isFollowupQuestion(normalizedQuestion, route);
  if (!followup) {
    return {
      status: 'resolved',
      followup: false,
      returnId: scopedReturnId,
      originalQuestion: normalizedQuestion,
      resolvedQuestion: normalizedQuestion,
      route,
      inheritedFromTurnId: null,
      anchorTerms: questionTerms(normalizedQuestion).slice(0, MAX_ANCHOR_TERMS),
    };
  }

  const prior = [...priorTurns]
    .map(validatedTurnMetadata)
    .filter((turn) => turn && turn.returnId === scopedReturnId && turn.status !== 'FAILED')
    .sort((left, right) => right.turnNumber - left.turnNumber)[0];
  if (!prior) {
    const clarification = clarificationFor(null, 'missing_context');
    return {
      status: 'ambiguous',
      code: 'FOLLOWUP_CONTEXT_REQUIRED',
      returnId: scopedReturnId,
      originalQuestion: normalizedQuestion,
      ...clarification,
    };
  }

  if (ORDINAL_REFERENCE_PATTERN.test(normalizedQuestion) && prior.sources.length !== 1) {
    const clarification = clarificationFor(prior, 'ordinal_source');
    return {
      status: 'ambiguous',
      code: 'FOLLOWUP_SOURCE_AMBIGUOUS',
      returnId: scopedReturnId,
      originalQuestion: normalizedQuestion,
      inheritedFromTurnId: prior.turnId,
      ...clarification,
    };
  }

  const directIntents = route.intent === 'evidence_search'
    ? []
    : route.intents.map((intent) => intent.id);
  const inheritedIntents = directIntents.length ? directIntents : prior.intents;
  if (!inheritedIntents.length && !prior.anchors.length) {
    const clarification = clarificationFor(prior, 'missing_metadata');
    return {
      status: 'ambiguous',
      code: 'FOLLOWUP_METADATA_AMBIGUOUS',
      returnId: scopedReturnId,
      originalQuestion: normalizedQuestion,
      inheritedFromTurnId: prior.turnId,
      ...clarification,
    };
  }

  const anchorTerms = [...new Set([
    ...questionTerms(normalizedQuestion),
    ...prior.anchors,
  ])].slice(0, MAX_ANCHOR_TERMS);
  const resolvedQuestion = [
    normalizedQuestion,
    inheritedIntents.length ? `Context areas: ${inheritedIntents.join(', ')}.` : '',
    anchorTerms.length ? `Context terms: ${anchorTerms.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  const resolvedRoute = routeReturnQuestion([
    normalizedQuestion,
    ...inheritedIntents,
    ...anchorTerms,
  ].join(' '));

  return {
    status: 'resolved',
    followup: true,
    returnId: scopedReturnId,
    originalQuestion: normalizedQuestion,
    resolvedQuestion,
    route: resolvedRoute,
    inheritedIntents,
    inheritedFromTurnId: prior.turnId,
    anchorTerms,
  };
}

module.exports = {
  FOLLOWUP_PATTERNS,
  isFollowupQuestion,
  resolveReturnFollowup,
  validatedTurnMetadata,
};
