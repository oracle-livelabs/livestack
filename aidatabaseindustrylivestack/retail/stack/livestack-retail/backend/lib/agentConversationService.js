'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const { getStoredDatasetState } = require('./datasetStateStore');

const MAX_TURNS_RETURNED = 30;

class AgentConversationError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.name = 'AgentConversationError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clean(value, limit = 1000) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function json(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function schemaError(error) {
  if (/ORA-00942|AGENT_CONVERSATIONS|AGENT_CONVERSATION_TURNS|AGENT_RUNTIME_TELEMETRY/i.test(String(error?.message || ''))) {
    return new AgentConversationError(
      'AGENT_RUNTIME_SCHEMA_REQUIRED',
      'Agent Console conversation persistence is not installed. Apply db/schema/24_agent_console_runtime.sql.',
      503
    );
  }
  return error;
}

async function activeGeneration() {
  const state = await getStoredDatasetState();
  return clean(state?.generationId || 'legacy-demo-generation', 64);
}

function identityOf(input = {}) {
  return {
    username: clean(input.username, 128),
    role: clean(input.role, 30).toLowerCase(),
    accessScope: clean(input.accessScope, 30).toUpperCase(),
  };
}

function conversationFromRow(row) {
  if (!row) return null;
  return {
    id: row.CONVERSATION_ID,
    title: row.TITLE,
    status: row.STATUS,
    ownerUsername: row.OWNER_USERNAME,
    role: row.OWNER_ROLE,
    accessScope: row.ACCESS_SCOPE,
    datasetGenerationId: row.DATASET_GENERATION_ID,
    lastTeam: row.LAST_TEAM || null,
    context: json(row.CONTEXT_PAYLOAD, { entities: {} }),
    turnCount: Number(row.TURN_COUNT || 0),
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  };
}

function turnFromRow(row) {
  const answer = json(row.ANSWER_PAYLOAD, {});
  return {
    id: row.TURN_ID,
    turnNumber: Number(row.TURN_NUMBER),
    question: row.QUESTION,
    team: row.ROUTED_TEAM || null,
    routeStatus: row.ROUTE_STATUS,
    route: json(row.ROUTE_METADATA, {}),
    answer,
    response: answer.response || '',
    claims: answer.claims || [],
    evidence: json(row.EVIDENCE_METADATA, {}),
    telemetry: json(row.TELEMETRY_PAYLOAD, {}),
    createdAt: row.CREATED_AT,
  };
}

function assertFresh(conversation, identity, generationId) {
  if (!conversation) throw new AgentConversationError('AGENT_CONVERSATION_NOT_FOUND', 'The Agent Console conversation was not found in this user scope.', 404);
  if (conversation.status !== 'ACTIVE') throw new AgentConversationError('AGENT_CONVERSATION_ARCHIVED', 'This Agent Console conversation is archived. Start a new conversation.', 409);
  if (conversation.datasetGenerationId !== generationId) {
    throw new AgentConversationError('AGENT_CONVERSATION_STALE_DATASET', 'The active retail dataset changed. Start a new Agent Console conversation before applying prior context.', 409, { conversationGenerationId: conversation.datasetGenerationId, activeGenerationId: generationId });
  }
  if (conversation.accessScope !== identity.accessScope || String(conversation.role).toLowerCase() !== identity.role) {
    throw new AgentConversationError('AGENT_CONVERSATION_IDENTITY_CHANGED', 'The active role or VPD scope changed. Start a new Agent Console conversation.', 409);
  }
}

async function createConversation({ identity, title = 'Retail investigation' }) {
  const owner = identityOf(identity);
  const generationId = await activeGeneration();
  const conversationId = crypto.randomUUID();
  try {
    await db.executeAsUser(`
      INSERT INTO agent_conversations (
        conversation_id, owner_username, owner_role, access_scope,
        dataset_generation_id, title, status, context_payload
      ) VALUES (
        :conversationId, :username, :role, :accessScope,
        :generationId, :title, 'ACTIVE', :contextPayload
      )
    `, {
      conversationId, username: owner.username, role: owner.role,
      accessScope: owner.accessScope, generationId,
      title: clean(title, 200) || 'Retail investigation',
      contextPayload: JSON.stringify({ entities: {}, lastTeam: null }),
    }, owner.username);
    return getConversation({ conversationId, identity: owner, includeTurns: true });
  } catch (error) { throw schemaError(error); }
}

async function listConversations({ identity, limit = 20 }) {
  const owner = identityOf(identity);
  const generationId = await activeGeneration();
  try {
    const result = await db.executeAsUser(`
      SELECT conversation_id, owner_username, owner_role, access_scope,
             dataset_generation_id, title, status, last_team,
             JSON_SERIALIZE(context_payload RETURNING VARCHAR2(4000)) AS context_payload,
             turn_count, created_at, updated_at
      FROM agent_conversations
      WHERE owner_username = :username
        AND dataset_generation_id = :generationId
        AND status = 'ACTIVE'
      ORDER BY updated_at DESC
      FETCH FIRST :limit ROWS ONLY
    `, { username: owner.username, generationId, limit: Math.min(Math.max(Number(limit) || 20, 1), 50) }, owner.username);
    return { generationId, conversations: (result.rows || []).map(conversationFromRow) };
  } catch (error) { throw schemaError(error); }
}

async function getConversation({ conversationId, identity, includeTurns = true }) {
  const owner = identityOf(identity);
  const generationId = await activeGeneration();
  try {
    const result = await db.executeAsUser(`
      SELECT conversation_id, owner_username, owner_role, access_scope,
             dataset_generation_id, title, status, last_team,
             JSON_SERIALIZE(context_payload RETURNING VARCHAR2(4000)) AS context_payload,
             turn_count, created_at, updated_at
      FROM agent_conversations
      WHERE conversation_id = :conversationId AND owner_username = :username
    `, { conversationId: clean(conversationId, 80), username: owner.username }, owner.username);
    const conversation = conversationFromRow(result.rows?.[0]);
    assertFresh(conversation, owner, generationId);
    if (!includeTurns) return conversation;
    const turnsResult = await db.executeAsUser(`
      SELECT turn_id, turn_number, question, routed_team, route_status,
             JSON_SERIALIZE(route_metadata RETURNING CLOB) AS route_metadata,
             JSON_SERIALIZE(answer_payload RETURNING CLOB) AS answer_payload,
             JSON_SERIALIZE(evidence_metadata RETURNING CLOB) AS evidence_metadata,
             JSON_SERIALIZE(telemetry_payload RETURNING CLOB) AS telemetry_payload,
             created_at
      FROM agent_conversation_turns
      WHERE conversation_id = :conversationId AND owner_username = :username
      ORDER BY turn_number DESC FETCH FIRST :limit ROWS ONLY
    `, { conversationId: conversation.id, username: owner.username, limit: MAX_TURNS_RETURNED }, owner.username);
    return { ...conversation, turns: (turnsResult.rows || []).reverse().map(turnFromRow) };
  } catch (error) { throw schemaError(error); }
}

async function appendTurn({ conversationId, identity, question, route, answer, evidence, telemetry }) {
  const owner = identityOf(identity);
  const generationId = await activeGeneration();
  const turnId = crypto.randomUUID();
  try {
    return await db.withUserConnection(owner.username, async ({ connection, execute }) => {
      const locked = await execute(`
        SELECT conversation_id, owner_username, owner_role, access_scope,
               dataset_generation_id, title, status, last_team,
               JSON_SERIALIZE(context_payload RETURNING VARCHAR2(4000)) AS context_payload,
               turn_count, created_at, updated_at
        FROM agent_conversations
        WHERE conversation_id = :conversationId AND owner_username = :username
        FOR UPDATE
      `, { conversationId: clean(conversationId, 80), username: owner.username });
      const conversation = conversationFromRow(locked.rows?.[0]);
      assertFresh(conversation, owner, generationId);
      const turnNumber = conversation.turnCount + 1;
      const context = {
        entities: {
          ...(conversation.context?.entities || {}),
          ...(route.entities || {}),
        },
        lastTeam: route.team || conversation.lastTeam || null,
        lastIntent: route.intent || null,
        lastTurnNumber: turnNumber,
      };
      const boundedEvidence = {
        contradictions: (evidence?.contradictions || []).slice(0, 8),
        insufficientEvidence: Boolean(evidence?.insufficientEvidence),
        sources: (evidence?.sources || []).slice(0, 14).map((item) => ({ ...item, excerpt: clean(item.excerpt, 500) })),
      };
      await execute(`
        INSERT INTO agent_conversation_turns (
          turn_id, conversation_id, owner_username, dataset_generation_id,
          turn_number, question, routed_team, route_status, route_metadata,
          answer_payload, evidence_metadata, telemetry_payload
        ) VALUES (
          :turnId, :conversationId, :username, :generationId,
          :turnNumber, :question, :team, :routeStatus, :routeMetadata,
          :answerPayload, :evidenceMetadata, :telemetryPayload
        )
      `, {
        turnId, conversationId: conversation.id, username: owner.username, generationId,
        turnNumber, question: clean(question, 1000), team: route.team || null,
        routeStatus: route.status, routeMetadata: JSON.stringify(route),
        answerPayload: JSON.stringify(answer), evidenceMetadata: JSON.stringify(boundedEvidence),
        telemetryPayload: JSON.stringify(telemetry || {}),
      });
      await execute(`
        UPDATE agent_conversations
        SET last_team = :lastTeam, context_payload = :contextPayload,
            turn_count = :turnNumber, updated_at = SYSTIMESTAMP
        WHERE conversation_id = :conversationId AND owner_username = :username
      `, { lastTeam: context.lastTeam, contextPayload: JSON.stringify(context), turnNumber, conversationId: conversation.id, username: owner.username });
      await execute(`
        INSERT INTO agent_runtime_telemetry (
          correlation_id, conversation_id, turn_id, owner_username,
          dataset_generation_id, event_type, event_payload, elapsed_ms
        ) VALUES (
          :correlationId, :conversationId, :turnId, :username,
          :generationId, 'agent_turn', :eventPayload, :elapsedMs
        )
      `, {
        correlationId: telemetry?.correlationId || turnId,
        conversationId: conversation.id, turnId, username: owner.username, generationId,
        eventPayload: JSON.stringify(telemetry || {}), elapsedMs: telemetry?.elapsedMs || null,
      });
      await connection.commit();
      return { turnId, turnNumber, context, generationId };
    });
  } catch (error) { throw schemaError(error); }
}

async function archiveConversation({ conversationId, identity }) {
  const owner = identityOf(identity);
  try {
    const result = await db.executeAsUser(`
      UPDATE agent_conversations SET status = 'ARCHIVED', updated_at = SYSTIMESTAMP
      WHERE conversation_id = :conversationId AND owner_username = :username AND status = 'ACTIVE'
    `, { conversationId: clean(conversationId, 80), username: owner.username }, owner.username);
    if (!result.rowsAffected) throw new AgentConversationError('AGENT_CONVERSATION_NOT_FOUND', 'The active Agent Console conversation was not found.', 404);
    return { conversationId, status: 'ARCHIVED' };
  } catch (error) { throw schemaError(error); }
}

module.exports = {
  AgentConversationError,
  appendTurn,
  archiveConversation,
  createConversation,
  getConversation,
  listConversations,
};
