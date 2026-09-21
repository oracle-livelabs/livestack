const crypto = require('crypto');
const { getStoredDatasetState } = require('./datasetStateStore');

const CONTRACT_VERSION = 1;
const MAX_TURNS = 6;
const MAX_TEXT_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 9000;
const ALLOWED_MODES = new Set(['narrate', 'chat', 'showsql', 'runsql']);
const FOLLOW_UP_REFERENCE = /\b(those|them|these|that|it|same|former|latter|above|previous|prior|ones?)\b|^(?:and|also|then|what about|how about|which of|only|now)\b/i;

class AskDataConversationError extends Error {
  constructor(code, message, { status = 400, category = 'conversation', conversation = null } = {}) {
    super(message);
    this.name = 'AskDataConversationError';
    this.code = code;
    this.status = status;
    this.category = category;
    this.conversation = conversation;
    this.isUserQueryError = true;
  }
}

function boundedText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, maxLength);
}

function boundedStringArray(value, limit = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => boundedText(entry, 160))
    .filter(Boolean)
    .slice(0, limit);
}

function safeSequence(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < 1000000 ? parsed : fallback;
}

function sanitizeTurn(turn, fallbackSequence = 0) {
  if (!turn || typeof turn !== 'object') return null;
  const userQuestion = boundedText(turn.userQuestion || turn.question);
  const resolvedQuestion = boundedText(turn.resolvedQuestion || userQuestion);
  if (!userQuestion && !resolvedQuestion) return null;

  return {
    sequence: safeSequence(turn.sequence, fallbackSequence),
    mode: ALLOWED_MODES.has(turn.mode) ? turn.mode : 'narrate',
    userQuestion: userQuestion || resolvedQuestion,
    resolvedQuestion: resolvedQuestion || userQuestion,
    answerSummary: boundedText(turn.answerSummary || turn.answer, 1200) || null,
    entities: boundedStringArray(turn.entities),
    filters: boundedStringArray(turn.filters),
    resultColumns: boundedStringArray(turn.resultColumns || turn.columns, 30),
  };
}

function turnsFromLegacyHistory(history) {
  if (!Array.isArray(history)) return [];
  const messages = history
    .slice(-(MAX_TURNS * 2 + 2))
    .map((entry) => ({
      role: entry?.role === 'assistant' ? 'assistant' : 'user',
      text: boundedText(entry?.text || entry?.content, 1200),
      mode: ALLOWED_MODES.has(entry?.mode) ? entry.mode : 'narrate',
    }))
    .filter((entry) => entry.text);

  const turns = [];
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({
        sequence: turns.length + 1,
        mode: message.mode,
        userQuestion: message.text,
        resolvedQuestion: message.text,
        answerSummary: null,
        entities: [],
        filters: [],
        resultColumns: [],
      });
    } else if (turns.length > 0 && !turns[turns.length - 1].answerSummary) {
      turns[turns.length - 1].answerSummary = message.text;
    }
  }
  return turns.slice(-MAX_TURNS);
}

function sanitizeConversation(conversation, history = []) {
  const sourceTurns = Array.isArray(conversation?.turns)
    ? conversation.turns
    : turnsFromLegacyHistory(history);
  const turns = sourceTurns
    .slice(-MAX_TURNS)
    .map((turn, index) => sanitizeTurn(turn, index + 1))
    .filter(Boolean);

  return {
    version: CONTRACT_VERSION,
    id: /^[A-Za-z0-9_-]{8,80}$/.test(String(conversation?.id || ''))
      ? String(conversation.id)
      : crypto.randomUUID(),
    datasetGenerationId: boundedText(conversation?.datasetGenerationId, 160) || null,
    sequence: safeSequence(conversation?.sequence, turns.at(-1)?.sequence || 0),
    turns,
  };
}

function extractEntities(question) {
  const text = boundedText(question);
  const entities = new Set();
  for (const match of text.matchAll(/["']([^"']{2,100})["']/g)) entities.add(match[1]);
  const namedPatterns = [
    /\b(?:product|brand|customer|influencer|warehouse|fulfillment center|center)\s+(?:named|called)\s+([^?.!,]{2,100})/gi,
    /\bfor\s+([A-Z][A-Za-z0-9&' -]{2,80})(?=[?.!,]|\s+(?:in|at|during|over|with|by)\b|$)/g,
  ];
  for (const pattern of namedPatterns) {
    for (const match of text.matchAll(pattern)) entities.add(match[1].trim());
  }
  return [...entities].slice(0, 12);
}

function extractFilters(question) {
  const text = boundedText(question);
  const filters = new Set();
  const patterns = [
    /\b(?:last|past)\s+\d+\s+(?:days?|weeks?|months?)\b/gi,
    /\b(?:this|last)\s+(?:week|month|quarter|year)\b/gi,
    /\b(?:in|near|closest to|from)\s+([A-Z][A-Za-z .'-]{2,60})(?=[?.!,]|$)/g,
    /\b(?:above|below|over|under|at least|at most)\s+[$]?\d+(?:\.\d+)?%?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) filters.add(match[0].trim());
  }
  return [...filters].slice(0, 12);
}

function isFollowUp(question) {
  const text = boundedText(question);
  return FOLLOW_UP_REFERENCE.test(text);
}

function resolveFollowUp(question, turns) {
  const current = boundedText(question);
  if (!isFollowUp(current)) {
    return { resolvedQuestion: current, usedPriorContext: false, referencedTurnSequence: null };
  }

  const prior = [...turns].reverse().find((turn) => turn.resolvedQuestion || turn.userQuestion);
  if (!prior) {
    throw new AskDataConversationError(
      'CONVERSATION_CONTEXT_AMBIGUOUS',
      'That question refers to earlier results, but no usable prior turn was supplied. Ask a standalone question or restore the conversation.',
      { status: 422, category: 'ambiguous' }
    );
  }

  const priorQuestion = boundedText(prior.resolvedQuestion || prior.userQuestion).replace(/[?.!]+$/, '');
  const resolvedQuestion = boundedText(
    `${priorQuestion}. Apply this follow-up to that same result scope: ${current}`,
    MAX_TEXT_LENGTH
  );
  return {
    resolvedQuestion,
    usedPriorContext: true,
    referencedTurnSequence: prior.sequence,
  };
}

function buildModelContext(turns) {
  let remaining = MAX_CONTEXT_LENGTH;
  const entries = [];
  for (const turn of turns.slice(-MAX_TURNS).reverse()) {
    const entry = {
      sequence: turn.sequence,
      userQuestion: turn.userQuestion,
      resolvedQuestion: turn.resolvedQuestion,
      answerSummary: turn.answerSummary,
      entities: turn.entities,
      filters: turn.filters,
      resultColumns: turn.resultColumns,
    };
    const encoded = JSON.stringify(entry);
    if (encoded.length > remaining) break;
    entries.unshift(entry);
    remaining -= encoded.length;
  }
  return entries;
}

async function prepareAskDataConversation({
  question,
  conversation = null,
  history = [],
  profile,
  mode,
  identity = {},
} = {}) {
  const currentQuestion = boundedText(question);
  if (!currentQuestion) {
    throw new AskDataConversationError('QUESTION_REQUIRED', 'A question is required', {
      status: 400,
      category: 'validation',
    });
  }

  const datasetState = await getStoredDatasetState();
  const generationId = boundedText(datasetState?.generationId, 160) || null;
  const sanitized = sanitizeConversation(conversation, history);
  if (sanitized.datasetGenerationId && sanitized.datasetGenerationId !== generationId) {
    throw new AskDataConversationError(
      'CONVERSATION_STALE_DATASET',
      'The active retail dataset changed after this conversation started. Start a new conversation so prior entities and filters are not applied to different data.',
      { status: 409, category: 'stale', conversation: { ...sanitized, currentDatasetGenerationId: generationId } }
    );
  }

  if (conversation?.profile && String(conversation.profile) !== String(profile)) {
    throw new AskDataConversationError(
      'CONVERSATION_PROFILE_CHANGED',
      'The model profile changed after this conversation started. Start a new conversation for the selected profile.',
      { status: 409, category: 'stale', conversation: sanitized }
    );
  }

  const resolution = resolveFollowUp(currentQuestion, sanitized.turns);
  const nextSequence = Math.max(sanitized.sequence, sanitized.turns.at(-1)?.sequence || 0) + 1;
  const knownEntities = [...new Set([
    ...sanitized.turns.flatMap((turn) => turn.entities),
    ...extractEntities(resolution.resolvedQuestion),
  ])].slice(-12);
  const knownFilters = [...new Set([
    ...sanitized.turns.flatMap((turn) => turn.filters),
    ...extractFilters(resolution.resolvedQuestion),
  ])].slice(-12);
  const username = boundedText(identity?.username, 100) || 'unknown';
  const accessScope = boundedText(identity?.accessScope, 100) || 'UNKNOWN';

  return {
    originalQuestion: currentQuestion,
    resolvedQuestion: resolution.resolvedQuestion,
    modelContext: buildModelContext(sanitized.turns),
    entityCacheKey: `${username}:${accessScope}:${generationId || 'unknown-generation'}`,
    envelope: {
      version: CONTRACT_VERSION,
      id: sanitized.id,
      datasetGenerationId: generationId,
      sequence: nextSequence,
      profile,
      mode,
      resolvedQuestion: resolution.resolvedQuestion,
      usedPriorContext: resolution.usedPriorContext,
      referencedTurnSequence: resolution.referencedTurnSequence,
      turns: sanitized.turns,
    },
    turn: {
      sequence: nextSequence,
      mode,
      userQuestion: currentQuestion,
      resolvedQuestion: resolution.resolvedQuestion,
      answerSummary: null,
      entities: knownEntities,
      filters: knownFilters,
      resultColumns: [],
    },
  };
}

function completeAskDataConversation(prepared, { answerSummary = null, resultColumns = [] } = {}) {
  const turn = sanitizeTurn({
    ...prepared.turn,
    answerSummary,
    resultColumns,
  }, prepared.envelope.sequence);
  return {
    ...prepared.envelope,
    turns: [...prepared.envelope.turns, turn].slice(-MAX_TURNS),
  };
}

module.exports = {
  AskDataConversationError,
  CONTRACT_VERSION,
  MAX_TURNS,
  completeAskDataConversation,
  prepareAskDataConversation,
  sanitizeConversation,
};
