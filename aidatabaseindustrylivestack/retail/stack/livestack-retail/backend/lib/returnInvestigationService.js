'use strict';

const crypto = require('crypto');
const { analyzeReturnEvidence } = require('./returnEvidenceConflictService');
const { resolveReturnFollowup } = require('./returnFollowupResolver');

const MAX_QUESTION_LENGTH = 500;
const MAX_TITLE_LENGTH = 200;
const MAX_CLIENT_REQUEST_ID_LENGTH = 100;

class ReturnInvestigationError extends Error {
  constructor(message, statusCode = 400, code = 'RETURN_INVESTIGATION_INVALID', details = null) {
    super(message);
    this.name = 'ReturnInvestigationError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ReturnInvestigationError(`${label} must be a positive integer.`, 400, 'RETURN_INVESTIGATION_INVALID');
  }
  return parsed;
}

function validateOpaqueId(value, label, maxLength = 80) {
  const id = cleanText(value, maxLength);
  if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
    throw new ReturnInvestigationError(`${label} is invalid.`, 400, 'RETURN_INVESTIGATION_INVALID');
  }
  return id;
}

function normalizeQuestion(value) {
  const question = cleanText(value, MAX_QUESTION_LENGTH);
  if (!question) {
    throw new ReturnInvestigationError('A question is required.', 400, 'RETURN_INVESTIGATION_QUESTION_REQUIRED');
  }
  return question;
}

function requestFingerprint(question, explicitReturnId) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ question, explicitReturnId: explicitReturnId || null }))
    .digest('hex');
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeInvestigationRow(row) {
  if (!row) return null;
  return {
    investigationId: row.INVESTIGATION_ID,
    returnId: Number(row.RETURN_ID),
    ownerUsername: row.OWNER_USERNAME,
    generationId: row.DATASET_GENERATION_ID,
    title: row.TITLE,
    status: row.STATUS,
    version: Number(row.VERSION || 0),
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  };
}

function normalizeTurnRow(row, returnId) {
  if (!row) return null;
  return {
    turnId: row.TURN_ID,
    investigationId: row.INVESTIGATION_ID,
    returnId: Number(returnId || row.RETURN_ID),
    turnNumber: Number(row.TURN_NUMBER || 0),
    clientRequestId: row.CLIENT_REQUEST_ID,
    requestFingerprint: row.REQUEST_FINGERPRINT,
    question: row.QUESTION,
    resolvedQuestion: row.RESOLVED_QUESTION,
    status: row.STATUS,
    answerPayload: parseJson(row.ANSWER_PAYLOAD, {}),
    routeMetadata: parseJson(row.ROUTE_METADATA, {}),
    evidenceMetadata: parseJson(row.EVIDENCE_METADATA, []),
    createdAt: row.CREATED_AT,
  };
}

function schemaUnavailable(error) {
  return /ORA-00942|table or view does not exist|RETURN_INVESTIGATIONS|RETURN_INVESTIGATION_TURNS/i
    .test(String(error?.message || ''));
}

function publicError(error) {
  if (error instanceof ReturnInvestigationError) return error;
  if (schemaUnavailable(error)) {
    return new ReturnInvestigationError(
      'Persisted return investigations are not installed in this database generation.',
      503,
      'RETURN_INVESTIGATION_SCHEMA_UNAVAILABLE'
    );
  }
  return error;
}

function validateOrchestratedTurn(packet) {
  if (!packet || typeof packet !== 'object') {
    throw new ReturnInvestigationError(
      'The return investigation answer orchestrator is unavailable.',
      503,
      'RETURN_INVESTIGATION_ORCHESTRATOR_UNAVAILABLE'
    );
  }
  const answerPayload = packet.answerPayload && typeof packet.answerPayload === 'object'
    ? packet.answerPayload
    : null;
  const routeMetadata = packet.routeMetadata && typeof packet.routeMetadata === 'object'
    ? packet.routeMetadata
    : null;
  const evidenceMetadata = Array.isArray(packet.evidenceMetadata)
    ? packet.evidenceMetadata
    : null;
  if (!answerPayload || !routeMetadata || !evidenceMetadata) {
    throw new ReturnInvestigationError(
      'The answer orchestrator returned an incomplete persisted-turn packet.',
      503,
      'RETURN_INVESTIGATION_ORCHESTRATION_INVALID'
    );
  }
  let serializedAnswer;
  try {
    serializedAnswer = JSON.stringify(answerPayload);
  } catch {
    serializedAnswer = null;
  }
  if (!serializedAnswer || serializedAnswer.length > 65536) {
    throw new ReturnInvestigationError(
      'The answer payload is not valid bounded JSON.',
      503,
      'RETURN_INVESTIGATION_ORCHESTRATION_INVALID'
    );
  }
  const cleanList = (value, maxItems, maxLength) => (
    Array.isArray(value)
      ? [...new Set(value.map((item) => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems)
      : []
  );
  const safeRouteMetadata = {
    intent: cleanText(routeMetadata.intent, 64) || null,
    routeLabel: cleanText(routeMetadata.routeLabel, 160) || null,
    confidence: cleanText(routeMetadata.confidence, 40) || null,
    intents: cleanList(routeMetadata.intents, 8, 64),
    anchorTerms: cleanList(routeMetadata.anchorTerms, 12, 100),
    entities: cleanList(routeMetadata.entities, 12, 100),
  };
  const safeEvidenceMetadata = evidenceMetadata.slice(0, 20).map((item, index) => {
    if (!item || typeof item !== 'object') return null;
    const citation = cleanText(item.citation || item.CITATION, 300);
    const text = cleanText(item.text || item.evidenceText || item.EVIDENCE_TEXT, 3000);
    if (!citation || !text) return null;
    return {
      id: cleanText(item.id || item.evidenceId || item.EVIDENCE_ID || `evidence-${index + 1}`, 120),
      citation,
      sourceCode: cleanText(item.sourceCode || item.SOURCE_TYPE, 80).toUpperCase(),
      sourceType: cleanText(item.sourceType, 80),
      title: cleanText(item.title || item.TITLE || 'Evidence', 220),
      text,
      semanticScore: Number.isFinite(Number(item.semanticScore)) ? Number(item.semanticScore) : null,
      lexicalScore: Number.isFinite(Number(item.lexicalScore)) ? Number(item.lexicalScore) : null,
      hybridScore: Number.isFinite(Number(item.hybridScore)) ? Number(item.hybridScore) : null,
      matchedTerms: cleanList(item.matchedTerms, 12, 80),
    };
  }).filter(Boolean);
  return {
    answerPayload: JSON.parse(serializedAnswer),
    routeMetadata: safeRouteMetadata,
    evidenceMetadata: safeEvidenceMetadata,
  };
}

function createReturnInvestigationService({
  database = null,
  orchestrateTurn = null,
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const persistence = database || require('../config/database');
  let turnOrchestrator = orchestrateTurn;

  function setTurnOrchestrator(next) {
    if (next !== null && typeof next !== 'function') {
      throw new TypeError('Return investigation orchestrator must be a function or null.');
    }
    turnOrchestrator = next;
  }

  async function currentGeneration(execute) {
    const result = await execute(`
      SELECT active_generation_id
      FROM app_dataset_state
      WHERE state_id = 1
    `);
    const generationId = result.rows?.[0]?.ACTIVE_GENERATION_ID;
    if (!generationId) {
      throw new ReturnInvestigationError(
        'The active dataset generation is unavailable.',
        503,
        'RETURN_INVESTIGATION_GENERATION_UNAVAILABLE'
      );
    }
    return String(generationId);
  }

  async function assertVisibleReturn(execute, returnId) {
    const result = await execute(`
      SELECT return_id
      FROM return_requests
      WHERE return_id = :returnId
    `, { returnId });
    if (!result.rows?.length) {
      throw new ReturnInvestigationError(
        'The return is unavailable in the active VPD scope.',
        404,
        'RETURN_INVESTIGATION_NOT_FOUND'
      );
    }
  }

  async function createInvestigation({ returnId, username, title = null } = {}) {
    const scopedReturnId = positiveInteger(returnId, 'returnId');
    const ownerUsername = validateOpaqueId(username, 'username', 128);
    const investigationId = validateOpaqueId(idFactory(), 'generated investigation id');
    const normalizedTitle = cleanText(title, MAX_TITLE_LENGTH)
      || `Return RET-${String(scopedReturnId).padStart(4, '0')} investigation`;
    try {
      return await persistence.withUserConnection(ownerUsername, async ({ connection, execute }) => {
        const generationId = await currentGeneration(execute);
        await assertVisibleReturn(execute, scopedReturnId);
        await execute(`
          INSERT INTO return_investigations (
            investigation_id, return_id, owner_username,
            dataset_generation_id, title, status, version
          ) VALUES (
            :investigationId, :returnId, :ownerUsername,
            :generationId, :title, 'ACTIVE', 0
          )
        `, {
          investigationId,
          returnId: scopedReturnId,
          ownerUsername,
          generationId,
          title: normalizedTitle,
        });
        await connection.commit();
        return {
          investigationId,
          returnId: scopedReturnId,
          ownerUsername,
          generationId,
          title: normalizedTitle,
          status: 'ACTIVE',
          version: 0,
          turns: [],
        };
      });
    } catch (error) {
      throw publicError(error);
    }
  }

  async function getInvestigation({ investigationId, username } = {}) {
    const id = validateOpaqueId(investigationId, 'investigationId');
    const ownerUsername = validateOpaqueId(username, 'username', 128);
    try {
      return await persistence.withUserConnection(ownerUsername, async ({ execute }) => {
        const investigationResult = await execute(`
          SELECT investigation_id, return_id, owner_username,
                 dataset_generation_id, title, status, version,
                 created_at, updated_at
          FROM return_investigations
          WHERE investigation_id = :investigationId
            AND LOWER(owner_username) = LOWER(:ownerUsername)
        `, { investigationId: id, ownerUsername });
        const investigation = normalizeInvestigationRow(investigationResult.rows?.[0]);
        if (!investigation) {
          throw new ReturnInvestigationError(
            'The investigation was not found for this user.',
            404,
            'RETURN_INVESTIGATION_NOT_FOUND'
          );
        }
        const generationId = await currentGeneration(execute);
        if (generationId !== investigation.generationId) {
          throw new ReturnInvestigationError(
            'This investigation belongs to an earlier dataset generation.',
            409,
            'RETURN_INVESTIGATION_GENERATION_STALE',
            { investigationGenerationId: investigation.generationId, activeGenerationId: generationId }
          );
        }
        await assertVisibleReturn(execute, investigation.returnId);
        const turnResult = await execute(`
          SELECT turn_id, investigation_id, turn_number, client_request_id,
                 request_fingerprint,
                 CAST(question AS VARCHAR2(4000)) AS question,
                 CAST(resolved_question AS VARCHAR2(4000)) AS resolved_question,
                 JSON_SERIALIZE(answer_payload RETURNING CLOB) AS answer_payload,
                 JSON_SERIALIZE(route_metadata RETURNING CLOB) AS route_metadata,
                 JSON_SERIALIZE(evidence_metadata RETURNING CLOB) AS evidence_metadata,
                 status, created_at
          FROM return_investigation_turns
          WHERE investigation_id = :investigationId
          ORDER BY turn_number
        `, { investigationId: id });
        return {
          ...investigation,
          turns: (turnResult.rows || []).map((row) => normalizeTurnRow(row, investigation.returnId)),
        };
      });
    } catch (error) {
      throw publicError(error);
    }
  }

  async function listInvestigations({ returnId, username } = {}) {
    const scopedReturnId = positiveInteger(returnId, 'returnId');
    const ownerUsername = validateOpaqueId(username, 'username', 128);
    try {
      return await persistence.withUserConnection(ownerUsername, async ({ execute }) => {
        const generationId = await currentGeneration(execute);
        await assertVisibleReturn(execute, scopedReturnId);
        const result = await execute(`
          SELECT investigation_id, return_id, owner_username,
                 dataset_generation_id, title, status, version,
                 created_at, updated_at
          FROM return_investigations
          WHERE return_id = :returnId
            AND LOWER(owner_username) = LOWER(:ownerUsername)
            AND dataset_generation_id = :generationId
          ORDER BY updated_at DESC, created_at DESC, investigation_id
        `, {
          returnId: scopedReturnId,
          ownerUsername,
          generationId,
        });
        return {
          returnId: scopedReturnId,
          generationId,
          investigations: (result.rows || []).map(normalizeInvestigationRow),
        };
      });
    } catch (error) {
      throw publicError(error);
    }
  }

  async function archiveInvestigation({ investigationId, username, expectedVersion } = {}) {
    const id = validateOpaqueId(investigationId, 'investigationId');
    const ownerUsername = validateOpaqueId(username, 'username', 128);
    const version = Number(expectedVersion);
    if (!Number.isInteger(version) || version < 0) {
      throw new ReturnInvestigationError(
        'expectedVersion must be a non-negative integer.',
        400,
        'RETURN_INVESTIGATION_VERSION_REQUIRED'
      );
    }
    try {
      return await persistence.withUserConnection(ownerUsername, async ({ connection, execute }) => {
        const result = await execute(`
          SELECT investigation_id, return_id, owner_username,
                 dataset_generation_id, title, status, version,
                 created_at, updated_at
          FROM return_investigations
          WHERE investigation_id = :investigationId
            AND LOWER(owner_username) = LOWER(:ownerUsername)
          FOR UPDATE
        `, { investigationId: id, ownerUsername });
        const investigation = normalizeInvestigationRow(result.rows?.[0]);
        if (!investigation) {
          throw new ReturnInvestigationError(
            'The investigation was not found for this user.',
            404,
            'RETURN_INVESTIGATION_NOT_FOUND'
          );
        }
        const generationId = await currentGeneration(execute);
        if (generationId !== investigation.generationId) {
          throw new ReturnInvestigationError(
            'This investigation belongs to an earlier dataset generation.',
            409,
            'RETURN_INVESTIGATION_GENERATION_STALE',
            { investigationGenerationId: investigation.generationId, activeGenerationId: generationId }
          );
        }
        await assertVisibleReturn(execute, investigation.returnId);

        if (investigation.status === 'ARCHIVED') {
          return { investigation, archived: true, replayed: true };
        }
        if (investigation.status !== 'ACTIVE') {
          throw new ReturnInvestigationError(
            'Only an active investigation can be archived.',
            409,
            'RETURN_INVESTIGATION_CLOSED'
          );
        }
        if (investigation.version !== version) {
          throw new ReturnInvestigationError(
            'The investigation changed before it could be archived.',
            409,
            'RETURN_INVESTIGATION_VERSION_CONFLICT',
            { expectedVersion: version, currentVersion: investigation.version }
          );
        }

        const nextVersion = investigation.version + 1;
        const updated = await execute(`
          UPDATE return_investigations
          SET status = 'ARCHIVED',
              version = :nextVersion,
              updated_at = SYSTIMESTAMP
          WHERE investigation_id = :investigationId
            AND LOWER(owner_username) = LOWER(:ownerUsername)
            AND status = 'ACTIVE'
            AND version = :expectedVersion
        `, {
          nextVersion,
          investigationId: id,
          ownerUsername,
          expectedVersion: version,
        });
        if (Number(updated.rowsAffected || 0) !== 1) {
          throw new ReturnInvestigationError(
            'The investigation changed before it could be archived.',
            409,
            'RETURN_INVESTIGATION_VERSION_CONFLICT'
          );
        }
        await connection.commit();
        return {
          investigation: {
            ...investigation,
            status: 'ARCHIVED',
            version: nextVersion,
          },
          archived: true,
          replayed: false,
        };
      });
    } catch (error) {
      throw publicError(error);
    }
  }

  async function runTurn({
    investigationId,
    username,
    question,
    clientRequestId,
    expectedVersion,
    explicitReturnId = null,
  } = {}) {
    const id = validateOpaqueId(investigationId, 'investigationId');
    const ownerUsername = validateOpaqueId(username, 'username', 128);
    const normalizedQuestion = normalizeQuestion(question);
    const requestId = validateOpaqueId(
      clientRequestId,
      'clientRequestId',
      MAX_CLIENT_REQUEST_ID_LENGTH
    );
    const version = Number(expectedVersion);
    if (!Number.isInteger(version) || version < 0) {
      throw new ReturnInvestigationError(
        'expectedVersion must be a non-negative integer.',
        400,
        'RETURN_INVESTIGATION_VERSION_REQUIRED'
      );
    }
    const requestedReturnId = explicitReturnId === null || explicitReturnId === undefined
      ? null
      : positiveInteger(explicitReturnId, 'explicitReturnId');
    const fingerprint = requestFingerprint(normalizedQuestion, requestedReturnId);

    try {
      return await persistence.withUserConnection(ownerUsername, async ({ connection, execute }) => {
        const investigationResult = await execute(`
          SELECT investigation_id, return_id, owner_username,
                 dataset_generation_id, title, status, version,
                 created_at, updated_at
          FROM return_investigations
          WHERE investigation_id = :investigationId
            AND LOWER(owner_username) = LOWER(:ownerUsername)
          FOR UPDATE
        `, { investigationId: id, ownerUsername });
        const investigation = normalizeInvestigationRow(investigationResult.rows?.[0]);
        if (!investigation) {
          throw new ReturnInvestigationError(
            'The investigation was not found for this user.',
            404,
            'RETURN_INVESTIGATION_NOT_FOUND'
          );
        }
        if (investigation.status !== 'ACTIVE') {
          throw new ReturnInvestigationError(
            'The investigation is not active.',
            409,
            'RETURN_INVESTIGATION_CLOSED'
          );
        }
        const generationId = await currentGeneration(execute);
        if (generationId !== investigation.generationId) {
          throw new ReturnInvestigationError(
            'This investigation belongs to an earlier dataset generation.',
            409,
            'RETURN_INVESTIGATION_GENERATION_STALE',
            { investigationGenerationId: investigation.generationId, activeGenerationId: generationId }
          );
        }
        await assertVisibleReturn(execute, investigation.returnId);

        const replayResult = await execute(`
          SELECT turn_id, investigation_id, turn_number, client_request_id,
                 request_fingerprint,
                 CAST(question AS VARCHAR2(4000)) AS question,
                 CAST(resolved_question AS VARCHAR2(4000)) AS resolved_question,
                 JSON_SERIALIZE(answer_payload RETURNING CLOB) AS answer_payload,
                 JSON_SERIALIZE(route_metadata RETURNING CLOB) AS route_metadata,
                 JSON_SERIALIZE(evidence_metadata RETURNING CLOB) AS evidence_metadata,
                 status, created_at
          FROM return_investigation_turns
          WHERE investigation_id = :investigationId
            AND client_request_id = :clientRequestId
        `, { investigationId: id, clientRequestId: requestId });
        if (replayResult.rows?.length) {
          const replay = normalizeTurnRow(replayResult.rows[0], investigation.returnId);
          if (replay.requestFingerprint !== fingerprint) {
            throw new ReturnInvestigationError(
              'clientRequestId was already used for a different turn request.',
              409,
              'RETURN_INVESTIGATION_IDEMPOTENCY_CONFLICT'
            );
          }
          return { investigation, turn: replay, replayed: true };
        }

        if (investigation.version !== version) {
          throw new ReturnInvestigationError(
            'The investigation changed before this turn was submitted.',
            409,
            'RETURN_INVESTIGATION_VERSION_CONFLICT',
            { expectedVersion: version, currentVersion: investigation.version }
          );
        }

        const priorResult = await execute(`
          SELECT turn_id, investigation_id, turn_number, client_request_id,
                 request_fingerprint,
                 CAST(question AS VARCHAR2(4000)) AS question,
                 CAST(resolved_question AS VARCHAR2(4000)) AS resolved_question,
                 JSON_SERIALIZE(answer_payload RETURNING CLOB) AS answer_payload,
                 JSON_SERIALIZE(route_metadata RETURNING CLOB) AS route_metadata,
                 JSON_SERIALIZE(evidence_metadata RETURNING CLOB) AS evidence_metadata,
                 status, created_at
          FROM return_investigation_turns
          WHERE investigation_id = :investigationId
          ORDER BY turn_number
        `, { investigationId: id });
        const priorTurns = (priorResult.rows || [])
          .map((row) => normalizeTurnRow(row, investigation.returnId));
        const resolution = resolveReturnFollowup({
          question: normalizedQuestion,
          priorTurns,
          investigationReturnId: investigation.returnId,
          explicitReturnId: requestedReturnId,
        });
        if (resolution.status === 'invalid' || resolution.status === 'conflict') {
          throw new ReturnInvestigationError(
            resolution.message,
            resolution.status === 'conflict' ? 409 : 400,
            resolution.code
          );
        }

        let packet;
        if (resolution.status === 'ambiguous') {
          packet = {
            answerPayload: {
              status: 'ambiguous',
              answer: resolution.message,
              clarification: {
                code: resolution.code,
                choices: resolution.choices || [],
              },
            },
            routeMetadata: {
              intent: 'clarification',
              intents: ['clarification'],
              returnId: investigation.returnId,
              inheritedFromTurnId: resolution.inheritedFromTurnId || null,
              anchorTerms: [],
            },
            evidenceMetadata: [],
          };
        } else {
          if (typeof turnOrchestrator !== 'function') {
            throw new ReturnInvestigationError(
              'The persisted investigation route is installed, but its answer orchestrator is not configured.',
              503,
              'RETURN_INVESTIGATION_ORCHESTRATOR_UNAVAILABLE'
            );
          }
          packet = validateOrchestratedTurn(await turnOrchestrator({
            execute,
            investigation,
            priorTurns,
            question: normalizedQuestion,
            resolvedQuestion: resolution.resolvedQuestion,
            route: resolution.route,
            resolution,
            generationId,
            username: ownerUsername,
          }));
          packet.routeMetadata = {
            ...packet.routeMetadata,
            returnId: investigation.returnId,
            followup: resolution.followup,
            inheritedFromTurnId: resolution.inheritedFromTurnId,
            anchorTerms: resolution.anchorTerms,
            intents: resolution.route.intents.map((intent) => intent.id),
          };
        }

        const evidenceAnalysis = analyzeReturnEvidence({
          intents: packet.routeMetadata.intents || [],
          evidence: packet.evidenceMetadata,
        });
        packet.answerPayload = {
          ...packet.answerPayload,
          investigation: {
            conflicts: evidenceAnalysis.conflicts,
            gaps: evidenceAnalysis.gaps,
            suggestions: evidenceAnalysis.suggestions,
            completeness: evidenceAnalysis.completeness,
          },
        };

        const turnId = validateOpaqueId(idFactory(), 'generated turn id');
        const nextVersion = investigation.version + 1;
        const turnStatus = resolution.status === 'ambiguous' ? 'AMBIGUOUS' : 'ANSWERED';
        const jsonType = persistence.oracledb?.DB_TYPE_JSON;
        const jsonBind = (value) => jsonType ? { val: value, type: jsonType } : JSON.stringify(value);
        await execute(`
          INSERT INTO return_investigation_turns (
            turn_id, investigation_id, turn_number, client_request_id,
            request_fingerprint, question, resolved_question,
            answer_payload, route_metadata, evidence_metadata,
            status, created_by
          ) VALUES (
            :turnId, :investigationId, :turnNumber, :clientRequestId,
            :requestFingerprint, :question, :resolvedQuestion,
            :answerPayload, :routeMetadata, :evidenceMetadata,
            :status, :createdBy
          )
        `, {
          turnId,
          investigationId: id,
          turnNumber: nextVersion,
          clientRequestId: requestId,
          requestFingerprint: fingerprint,
          question: normalizedQuestion,
          resolvedQuestion: resolution.resolvedQuestion || normalizedQuestion,
          answerPayload: jsonBind(packet.answerPayload),
          routeMetadata: jsonBind(packet.routeMetadata),
          evidenceMetadata: jsonBind(packet.evidenceMetadata),
          status: turnStatus,
          createdBy: ownerUsername,
        });
        const update = await execute(`
          UPDATE return_investigations
          SET version = :nextVersion,
              updated_at = SYSTIMESTAMP
          WHERE investigation_id = :investigationId
            AND LOWER(owner_username) = LOWER(:ownerUsername)
            AND version = :expectedVersion
        `, {
          nextVersion,
          investigationId: id,
          ownerUsername,
          expectedVersion: version,
        });
        if (Number(update.rowsAffected || 0) !== 1) {
          throw new ReturnInvestigationError(
            'The investigation changed before this turn could be committed.',
            409,
            'RETURN_INVESTIGATION_VERSION_CONFLICT'
          );
        }
        await connection.commit();
        return {
          investigation: { ...investigation, version: nextVersion },
          turn: {
            turnId,
            investigationId: id,
            returnId: investigation.returnId,
            turnNumber: nextVersion,
            clientRequestId: requestId,
            requestFingerprint: fingerprint,
            question: normalizedQuestion,
            resolvedQuestion: resolution.resolvedQuestion || normalizedQuestion,
            status: turnStatus,
            answerPayload: packet.answerPayload,
            routeMetadata: packet.routeMetadata,
            evidenceMetadata: packet.evidenceMetadata,
          },
          replayed: false,
        };
      });
    } catch (error) {
      throw publicError(error);
    }
  }

  return {
    archiveInvestigation,
    createInvestigation,
    getInvestigation,
    listInvestigations,
    runTurn,
    setTurnOrchestrator,
  };
}

module.exports = {
  ReturnInvestigationError,
  createReturnInvestigationService,
  normalizeInvestigationRow,
  normalizeTurnRow,
  publicError,
  requestFingerprint,
};
