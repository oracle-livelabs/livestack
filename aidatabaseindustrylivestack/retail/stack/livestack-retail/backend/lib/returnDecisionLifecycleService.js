'use strict';

const crypto = require('crypto');

const DECISIONS = new Set(['Approve', 'Deny', 'Request Info']);
const MAX_RESPONSE_LENGTH = 4000;
const MAX_NOTES_LENGTH = 4000;
const MAX_EVIDENCE_JSON_LENGTH = 65536;

class ReturnDecisionLifecycleError extends Error {
  constructor(message, statusCode = 400, code = 'RETURN_DECISION_INVALID', details = null) {
    super(message);
    this.name = 'ReturnDecisionLifecycleError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function cleanText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function boundedText(value, { label, maxLength, required = false }) {
  const text = String(value || '').trim();
  if (required && !text) {
    throw new ReturnDecisionLifecycleError(`${label} is required.`, 400, 'RETURN_DECISION_RESPONSE_REQUIRED');
  }
  if (text.length > maxLength) {
    throw new ReturnDecisionLifecycleError(
      `${label} must be ${maxLength} characters or fewer.`,
      400,
      'RETURN_DECISION_TEXT_TOO_LONG',
      { field: label, maxLength, actualLength: text.length }
    );
  }
  return text;
}

function validateId(value, label, maxLength = 100) {
  const id = cleanText(value, maxLength);
  if (!id || !/^[A-Za-z0-9_.:-]+$/.test(id)) {
    throw new ReturnDecisionLifecycleError(`${label} is invalid.`, 400, 'RETURN_DECISION_INVALID');
  }
  return id;
}

function validateVersion(value, label = 'expectedVersion') {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new ReturnDecisionLifecycleError(`${label} must be a non-negative integer.`, 400, 'RETURN_DECISION_VERSION_REQUIRED');
  }
  return version;
}

function validateReturnId(value) {
  const returnId = Number(value);
  if (!Number.isInteger(returnId) || returnId <= 0) {
    throw new ReturnDecisionLifecycleError('returnId must be a positive integer.', 400, 'RETURN_DECISION_INVALID');
  }
  return returnId;
}

function validateDecision(value) {
  const decisionType = cleanText(value, 40);
  if (!DECISIONS.has(decisionType)) {
    throw new ReturnDecisionLifecycleError('Decision must be Approve, Deny, or Request Info.', 400, 'RETURN_DECISION_INVALID');
  }
  return decisionType;
}

function cloneBoundedJson(value, fallback = {}) {
  const candidate = value === undefined || value === null ? fallback : value;
  let serialized;
  try { serialized = JSON.stringify(candidate); } catch { serialized = null; }
  if (!serialized || serialized.length > MAX_EVIDENCE_JSON_LENGTH) {
    throw new ReturnDecisionLifecycleError('Evidence snapshot must be bounded valid JSON.', 400, 'RETURN_DECISION_EVIDENCE_INVALID');
  }
  return JSON.parse(serialized);
}

function stableFingerprint(type, payload) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ type, ...payload }))
    .digest('hex');
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function assertIdentity(identity, { admin = false } = {}) {
  if (!identity?.authenticated || !identity.username) {
    throw new ReturnDecisionLifecycleError('An Oracle-validated identity is required.', 403, 'RETURN_DECISION_IDENTITY_REQUIRED');
  }
  if (admin && (String(identity.role).toLowerCase() !== 'admin'
      || String(identity.accessScope).toUpperCase() !== 'GLOBAL')) {
    throw new ReturnDecisionLifecycleError('Only a global Admin can change a reviewer decision.', 403, 'RETURN_DECISION_ADMIN_REQUIRED');
  }
  return validateId(identity.username, 'username', 128);
}

function normalizeProposal(row) {
  if (!row) return null;
  return {
    proposalId: row.PROPOSAL_ID,
    returnId: Number(row.RETURN_ID),
    ownerUsername: row.OWNER_USERNAME,
    generationId: row.DATASET_GENERATION_ID,
    decisionType: row.DECISION_TYPE,
    reviewerNotes: row.REVIEWER_NOTES || '',
    customerResponse: row.CUSTOMER_RESPONSE || '',
    evidenceSnapshot: parseJson(row.EVIDENCE_SNAPSHOT, {}),
    aiRecommendation: row.AI_RECOMMENDATION,
    policyClause: row.POLICY_CLAUSE,
    caseVersion: Number(row.CASE_VERSION || 0),
    status: row.STATUS,
    version: Number(row.VERSION || 0),
    finalizedDecisionId: row.FINALIZED_DECISION_ID ? Number(row.FINALIZED_DECISION_ID) : null,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
    finalizedAt: row.FINALIZED_AT,
  };
}

function normalizeRequest(row) {
  if (!row) return null;
  return {
    returnId: Number(row.RETURN_ID),
    recommendation: row.RECOMMENDATION,
    status: row.STATUS,
    policyClause: row.POLICY_CLAUSE,
    confidenceScore: Number(row.CONFIDENCE_SCORE || 0),
    decisionVersion: Number(row.DECISION_VERSION || 0),
    productName: row.PRODUCT_NAME || null,
    customerName: row.CUSTOMER_NAME || null,
    returnReason: row.RETURN_REASON || null,
    damageDescription: row.DAMAGE_DESCRIPTION || null,
  };
}

function schemaUnavailable(error) {
  return /ORA-00942|RETURN_DECISION_PROPOSALS|RETURN_DECISION_PROVENANCE|RETURN_CUSTOMER_MESSAGES|RETURN_DECISION_COMMANDS/i
    .test(String(error?.message || ''));
}

function publicError(error) {
  if (error instanceof ReturnDecisionLifecycleError) return error;
  if (schemaUnavailable(error)) {
    return new ReturnDecisionLifecycleError(
      'The governed return decision lifecycle is not installed in this database generation.',
      503,
      'RETURN_DECISION_SCHEMA_UNAVAILABLE'
    );
  }
  return error;
}

function createReturnDecisionLifecycleService({
  database = null,
  idFactory = () => crypto.randomUUID(),
} = {}) {
  const persistence = database || require('../config/database');
  const jsonType = persistence.oracledb?.DB_TYPE_JSON;
  const jsonBind = (value) => jsonType ? { val: value, type: jsonType } : JSON.stringify(value);

  async function currentGeneration(execute) {
    const result = await execute(`
      SELECT active_generation_id
      FROM app_dataset_state
      WHERE state_id = 1
    `);
    const generationId = result.rows?.[0]?.ACTIVE_GENERATION_ID;
    if (!generationId) {
      throw new ReturnDecisionLifecycleError('The active dataset generation is unavailable.', 503, 'RETURN_DECISION_GENERATION_UNAVAILABLE');
    }
    return String(generationId);
  }

  async function loadRequest(execute, returnId, { lock = false } = {}) {
    const result = await execute(`
      SELECT rr.return_id, rr.recommendation, rr.status, rr.policy_clause,
             rr.confidence_score, rr.decision_version,
             rr.return_reason,
             CAST(rr.damage_description AS VARCHAR2(4000)) AS damage_description,
             p.product_name,
             c.first_name || ' ' || c.last_name AS customer_name
      FROM return_requests rr
      LEFT JOIN products p ON p.product_id = rr.product_id
      LEFT JOIN customers c ON c.customer_id = rr.customer_id
      WHERE rr.return_id = :returnId
      ${lock ? 'FOR UPDATE' : ''}
    `, { returnId });
    const request = normalizeRequest(result.rows?.[0]);
    if (!request) {
      throw new ReturnDecisionLifecycleError('The return is unavailable in the active VPD scope.', 404, 'RETURN_DECISION_NOT_FOUND');
    }
    return request;
  }

  async function loadProposal(execute, proposalId, username, { lock = false } = {}) {
    const result = await execute(`
      SELECT proposal_id, return_id, owner_username, dataset_generation_id,
             decision_type,
             CAST(reviewer_notes AS VARCHAR2(4000)) AS reviewer_notes,
             CAST(customer_response AS VARCHAR2(4000)) AS customer_response,
             JSON_SERIALIZE(evidence_snapshot RETURNING CLOB) AS evidence_snapshot,
             ai_recommendation, policy_clause, case_version,
             status, version, finalized_decision_id,
             created_at, updated_at, finalized_at
      FROM return_decision_proposals
      WHERE proposal_id = :proposalId
        AND LOWER(owner_username) = LOWER(:username)
      ${lock ? 'FOR UPDATE' : ''}
    `, { proposalId, username });
    const proposal = normalizeProposal(result.rows?.[0]);
    if (!proposal) {
      throw new ReturnDecisionLifecycleError('The decision proposal was not found for this reviewer.', 404, 'RETURN_DECISION_PROPOSAL_NOT_FOUND');
    }
    return proposal;
  }

  async function replayCommand(execute, { username, clientRequestId, commandType, fingerprint }) {
    const result = await execute(`
      SELECT command_type, request_fingerprint,
             JSON_SERIALIZE(response_payload RETURNING CLOB) AS response_payload
      FROM return_decision_commands
      WHERE LOWER(owner_username) = LOWER(:username)
        AND client_request_id = :clientRequestId
    `, { username, clientRequestId });
    const row = result.rows?.[0];
    if (!row) return null;
    if (row.COMMAND_TYPE !== commandType || row.REQUEST_FINGERPRINT !== fingerprint) {
      throw new ReturnDecisionLifecycleError(
        'clientRequestId was already used for a different decision command.',
        409,
        'RETURN_DECISION_IDEMPOTENCY_CONFLICT'
      );
    }
    return parseJson(row.RESPONSE_PAYLOAD, {});
  }

  async function recordCommand(execute, {
    returnId, proposalId, username, clientRequestId, commandType, fingerprint, response,
  }) {
    await execute(`
      INSERT INTO return_decision_commands (
        return_id, proposal_id, owner_username, client_request_id,
        command_type, request_fingerprint, response_payload
      ) VALUES (
        :returnId, :proposalId, :username, :clientRequestId,
        :commandType, :fingerprint, :response
      )
    `, {
      returnId,
      proposalId,
      username,
      clientRequestId,
      commandType,
      fingerprint,
      response: jsonBind(response),
    });
  }

  async function recoverConcurrentCommand({
    error, username, clientRequestId, commandType, fingerprint,
  }) {
    if (!/ORA-00001/i.test(String(error?.message || ''))) return null;
    return persistence.withUserConnection(username, async ({ execute }) => {
      const replay = await replayCommand(execute, {
        username, clientRequestId, commandType, fingerprint,
      });
      return replay ? { ...replay, replayed: true } : null;
    });
  }

  function evidenceItem(sourceType, sourceId, title, text, createdAt = null) {
    const bounded = cleanText(text, 3000);
    return {
      citation: `${sourceType} · ${sourceId}`,
      sourceType,
      sourceId: String(sourceId),
      title: cleanText(title, 220),
      text: bounded,
      contentHash: crypto.createHash('sha256').update(bounded).digest('hex'),
      createdAt,
    };
  }

  async function buildAuthoritativeEvidenceSnapshot(execute, request, generationId) {
    const policyResult = request.policyClause ? await execute(`
      SELECT clause_code, clause_title,
             CAST(clause_text AS VARCHAR2(3000)) AS clause_text,
             severity, effective_start, effective_end
      FROM return_policy_clauses
      WHERE clause_code = :policyClause
      FOR UPDATE
    `, { policyClause: request.policyClause }) : { rows: [] };
    const documents = await execute(`
      SELECT document_id, document_type, title,
             CAST(excerpt AS VARCHAR2(3000)) AS excerpt,
             created_at
      FROM return_documents
      WHERE return_id = :returnId
      ORDER BY similarity_score DESC NULLS LAST, document_id
      FETCH FIRST 8 ROWS ONLY
    `, { returnId: request.returnId });
    const events = await execute(`
      SELECT event_id, event_type,
             CAST(event_note AS VARCHAR2(3000)) AS event_note,
             actor, created_at
      FROM return_events
      WHERE return_id = :returnId
      ORDER BY created_at DESC, event_id DESC
      FETCH FIRST 8 ROWS ONLY
    `, { returnId: request.returnId });
    const decisions = await execute(`
      SELECT decision_id, decision_type,
             CAST(decision_summary AS VARCHAR2(3000)) AS decision_summary,
             created_by, created_at
      FROM return_decisions
      WHERE return_id = :returnId
      ORDER BY created_at DESC, decision_id DESC
      FETCH FIRST 5 ROWS ONLY
    `, { returnId: request.returnId });
    const policy = policyResult.rows?.[0] || null;
    const evidence = [
      evidenceItem(
        'RETURN_REQUESTS',
        `RET-${String(request.returnId).padStart(4, '0')}`,
        `${request.productName || 'Return'} case`,
        `Reason: ${request.returnReason || 'Not recorded'}. Details: ${request.damageDescription || 'Not recorded'}. Status: ${request.status}. AI recommendation: ${request.recommendation}.`
      ),
      ...(policy ? [evidenceItem(
        'RETURN_POLICY_CLAUSES', policy.CLAUSE_CODE, policy.CLAUSE_TITLE,
        `${policy.CLAUSE_TEXT} Severity: ${policy.SEVERITY || 'standard'}.`,
        policy.EFFECTIVE_START
      )] : []),
      ...(documents.rows || []).map((row) => evidenceItem(
        'RETURN_DOCUMENTS', row.DOCUMENT_ID, row.TITLE,
        `${row.DOCUMENT_TYPE}. ${row.EXCERPT || 'No excerpt recorded.'}`, row.CREATED_AT
      )),
      ...(events.rows || []).map((row) => evidenceItem(
        'RETURN_EVENTS', row.EVENT_ID, row.EVENT_TYPE,
        `${row.EVENT_NOTE || 'No note recorded.'} Actor: ${row.ACTOR || 'Not recorded'}.`, row.CREATED_AT
      )),
      ...(decisions.rows || []).map((row) => evidenceItem(
        'RETURN_DECISIONS', row.DECISION_ID, row.DECISION_TYPE,
        `${row.DECISION_SUMMARY || 'No summary recorded.'} Created by: ${row.CREATED_BY || 'Not recorded'}.`, row.CREATED_AT
      )),
    ].slice(0, 22);
    return cloneBoundedJson({
      authority: 'oracle_server',
      generationId,
      returnId: request.returnId,
      capturedAt: new Date().toISOString(),
      aiRecommendation: {
        value: request.recommendation,
        confidence: request.confidenceScore,
      },
      policy: policy ? {
        clauseCode: policy.CLAUSE_CODE,
        title: policy.CLAUSE_TITLE,
        severity: policy.SEVERITY,
        effectiveStart: policy.EFFECTIVE_START,
        effectiveEnd: policy.EFFECTIVE_END,
      } : null,
      evidence,
    });
  }

  function validateProposalInput(input = {}) {
    const decisionType = validateDecision(input.decisionType);
    const customerResponse = boundedText(input.customerResponse, {
      label: 'customerResponse', maxLength: MAX_RESPONSE_LENGTH, required: true,
    });
    return {
      decisionType,
      customerResponse,
      reviewerNotes: boundedText(input.reviewerNotes, {
        label: 'reviewerNotes', maxLength: MAX_NOTES_LENGTH,
      }),
    };
  }

  async function getLifecycle({ returnId, identity } = {}) {
    const scopedReturnId = validateReturnId(returnId);
    const username = assertIdentity(identity);
    try {
      return await persistence.withUserConnection(username, async ({ execute }) => {
        const generationId = await currentGeneration(execute);
        const request = await loadRequest(execute, scopedReturnId);
        const proposalsResult = await execute(`
          SELECT proposal_id, return_id, owner_username, dataset_generation_id,
                 decision_type,
                 CAST(reviewer_notes AS VARCHAR2(4000)) AS reviewer_notes,
                 CAST(customer_response AS VARCHAR2(4000)) AS customer_response,
                 JSON_SERIALIZE(evidence_snapshot RETURNING CLOB) AS evidence_snapshot,
                 ai_recommendation, policy_clause, case_version,
                 status, version, finalized_decision_id,
                 created_at, updated_at, finalized_at
          FROM return_decision_proposals
          WHERE return_id = :returnId
            AND LOWER(owner_username) = LOWER(:username)
            AND dataset_generation_id = :generationId
          ORDER BY updated_at DESC, proposal_id
        `, { returnId: scopedReturnId, username, generationId });
        const decisions = await execute(`
          SELECT d.decision_id, d.decision_type,
                 CAST(d.decision_summary AS VARCHAR2(4000)) AS decision_summary,
                 d.confidence_score, d.created_by, d.created_at,
                 p.proposal_id, p.dataset_generation_id,
                 p.ai_recommendation, p.policy_clause,
                 JSON_SERIALIZE(p.decision_payload RETURNING CLOB) AS decision_payload,
                 JSON_SERIALIZE(p.evidence_snapshot RETURNING CLOB) AS evidence_snapshot
          FROM return_decisions d
          LEFT JOIN return_decision_provenance p ON p.decision_id = d.decision_id
          WHERE d.return_id = :returnId
          ORDER BY d.created_at DESC, d.decision_id DESC
        `, { returnId: scopedReturnId });
        const messages = await execute(`
          SELECT message_id, decision_id, proposal_id,
                 CAST(message_text AS VARCHAR2(4000)) AS message_text,
                 delivery_status, created_by, created_at
          FROM return_customer_messages
          WHERE return_id = :returnId
          ORDER BY created_at DESC, message_id DESC
        `, { returnId: scopedReturnId });
        const events = await execute(`
          SELECT event_id, event_type,
                 CAST(event_note AS VARCHAR2(4000)) AS event_note,
                 actor, created_at
          FROM return_events
          WHERE return_id = :returnId
            AND event_type = 'Reviewer Decision Finalized'
          ORDER BY created_at DESC, event_id DESC
        `, { returnId: scopedReturnId });
        return {
          returnId: scopedReturnId,
          generationId,
          caseVersion: request.decisionVersion,
          request,
          proposals: (proposalsResult.rows || []).map(normalizeProposal),
          decisions: decisions.rows || [],
          messages: messages.rows || [],
          events: events.rows || [],
          canMutate: String(identity.role).toLowerCase() === 'admin'
            && String(identity.accessScope).toUpperCase() === 'GLOBAL',
        };
      });
    } catch (error) {
      throw publicError(error);
    }
  }

  async function createProposal({ returnId, identity, clientRequestId, expectedVersion, ...input } = {}) {
    const scopedReturnId = validateReturnId(returnId);
    const username = assertIdentity(identity, { admin: true });
    const requestId = validateId(clientRequestId, 'clientRequestId');
    const caseVersion = validateVersion(expectedVersion);
    const proposalInput = validateProposalInput(input);
    const fingerprint = stableFingerprint('CREATE', {
      returnId: scopedReturnId, caseVersion, ...proposalInput,
    });
    try {
      return await persistence.withUserConnection(username, async ({ connection, execute }) => {
        const generationId = await currentGeneration(execute);
        const replay = await replayCommand(execute, {
          username, clientRequestId: requestId, commandType: 'CREATE', fingerprint,
        });
        if (replay) return { ...replay, replayed: true };
        const request = await loadRequest(execute, scopedReturnId, { lock: true });
        if (request.decisionVersion !== caseVersion) {
          throw new ReturnDecisionLifecycleError('The return changed before the proposal was created.', 409, 'RETURN_DECISION_VERSION_CONFLICT', {
            expectedVersion: caseVersion, currentVersion: request.decisionVersion,
          });
        }
        const evidenceSnapshot = await buildAuthoritativeEvidenceSnapshot(
          execute, request, generationId
        );
        const proposalId = validateId(idFactory(), 'generated proposal id', 80);
        await execute(`
          INSERT INTO return_decision_proposals (
            proposal_id, return_id, owner_username, dataset_generation_id,
            decision_type, reviewer_notes, customer_response, evidence_snapshot,
            ai_recommendation, policy_clause, case_version, status, version
          ) VALUES (
            :proposalId, :returnId, :username, :generationId,
            :decisionType, :reviewerNotes, :customerResponse, :evidenceSnapshot,
            :aiRecommendation, :policyClause, :caseVersion, 'DRAFT', 0
          )
        `, {
          proposalId,
          returnId: scopedReturnId,
          username,
          generationId,
          ...proposalInput,
          evidenceSnapshot: jsonBind(evidenceSnapshot),
          aiRecommendation: request.recommendation,
          policyClause: request.policyClause,
          caseVersion,
        });
        const proposal = {
          proposalId, returnId: scopedReturnId, ownerUsername: username,
          generationId, ...proposalInput, evidenceSnapshot,
          aiRecommendation: request.recommendation,
          policyClause: request.policyClause, caseVersion, status: 'DRAFT', version: 0,
        };
        const response = { proposal, caseVersion, aiRecommendationPreserved: true };
        await recordCommand(execute, {
          returnId: scopedReturnId, proposalId, username, clientRequestId: requestId,
          commandType: 'CREATE', fingerprint, response,
        });
        await connection.commit();
        return { ...response, replayed: false };
      });
    } catch (error) {
      const replay = await recoverConcurrentCommand({
        error, username, clientRequestId: requestId, commandType: 'CREATE', fingerprint,
      });
      if (replay) return replay;
      throw publicError(error);
    }
  }

  async function updateProposal({ returnId, proposalId, identity, clientRequestId, expectedVersion, ...input } = {}) {
    const scopedReturnId = validateReturnId(returnId);
    const id = validateId(proposalId, 'proposalId', 80);
    const username = assertIdentity(identity, { admin: true });
    const requestId = validateId(clientRequestId, 'clientRequestId');
    const version = validateVersion(expectedVersion);
    const proposalInput = validateProposalInput(input);
    const fingerprint = stableFingerprint('UPDATE', {
      returnId: scopedReturnId, proposalId: id, version, ...proposalInput,
    });
    try {
      return await persistence.withUserConnection(username, async ({ connection, execute }) => {
        const generationId = await currentGeneration(execute);
        const replay = await replayCommand(execute, {
          username, clientRequestId: requestId, commandType: 'UPDATE', fingerprint,
        });
        if (replay) return { ...replay, replayed: true };
        const proposal = await loadProposal(execute, id, username, { lock: true });
        if (proposal.returnId !== scopedReturnId) {
          throw new ReturnDecisionLifecycleError('The proposal does not belong to this return.', 409, 'RETURN_DECISION_RETURN_MISMATCH');
        }
        if (proposal.generationId !== generationId) {
          throw new ReturnDecisionLifecycleError('The proposal belongs to an earlier dataset generation.', 409, 'RETURN_DECISION_GENERATION_STALE');
        }
        if (proposal.status !== 'DRAFT') {
          throw new ReturnDecisionLifecycleError('Only a draft proposal can be edited.', 409, 'RETURN_DECISION_PROPOSAL_FINALIZED');
        }
        if (proposal.version !== version) {
          throw new ReturnDecisionLifecycleError('The proposal changed before the edit was saved.', 409, 'RETURN_DECISION_VERSION_CONFLICT', {
            expectedVersion: version, currentVersion: proposal.version,
          });
        }
        const request = await loadRequest(execute, scopedReturnId, { lock: true });
        if (request.decisionVersion !== proposal.caseVersion
            || request.recommendation !== proposal.aiRecommendation
            || String(request.policyClause || '') !== String(proposal.policyClause || '')) {
          throw new ReturnDecisionLifecycleError(
            'The return recommendation, policy, or decision version changed after this proposal was prepared.',
            409,
            'RETURN_DECISION_CASE_STALE'
          );
        }
        const evidenceSnapshot = await buildAuthoritativeEvidenceSnapshot(
          execute, request, generationId
        );
        const nextVersion = version + 1;
        const updated = await execute(`
          UPDATE return_decision_proposals
          SET decision_type = :decisionType,
              reviewer_notes = :reviewerNotes,
              customer_response = :customerResponse,
              evidence_snapshot = :evidenceSnapshot,
              version = :nextVersion,
              updated_at = SYSTIMESTAMP
          WHERE proposal_id = :proposalId
            AND LOWER(owner_username) = LOWER(:username)
            AND status = 'DRAFT'
            AND version = :expectedVersion
        `, {
          proposalId: id, username, expectedVersion: version, nextVersion,
          ...proposalInput, evidenceSnapshot: jsonBind(evidenceSnapshot),
        });
        if (Number(updated.rowsAffected || 0) !== 1) {
          throw new ReturnDecisionLifecycleError('The proposal changed before the edit was saved.', 409, 'RETURN_DECISION_VERSION_CONFLICT');
        }
        const nextProposal = {
          ...proposal, ...proposalInput, evidenceSnapshot, version: nextVersion,
        };
        const response = { proposal: nextProposal, aiRecommendationPreserved: true };
        await recordCommand(execute, {
          returnId: scopedReturnId, proposalId: id, username, clientRequestId: requestId,
          commandType: 'UPDATE', fingerprint, response,
        });
        await connection.commit();
        return { ...response, replayed: false };
      });
    } catch (error) {
      const replay = await recoverConcurrentCommand({
        error, username, clientRequestId: requestId, commandType: 'UPDATE', fingerprint,
      });
      if (replay) return replay;
      throw publicError(error);
    }
  }

  async function finalizeProposal({ returnId, proposalId, identity, clientRequestId, expectedVersion } = {}) {
    const scopedReturnId = validateReturnId(returnId);
    const id = validateId(proposalId, 'proposalId', 80);
    const username = assertIdentity(identity, { admin: true });
    const requestId = validateId(clientRequestId, 'clientRequestId');
    const version = validateVersion(expectedVersion);
    const fingerprint = stableFingerprint('FINALIZE', {
      returnId: scopedReturnId, proposalId: id, version, confirmation: true,
    });
    try {
      return await persistence.withUserConnection(username, async ({ connection, execute }) => {
        const generationId = await currentGeneration(execute);
        const replay = await replayCommand(execute, {
          username, clientRequestId: requestId, commandType: 'FINALIZE', fingerprint,
        });
        if (replay) return { ...replay, replayed: true };
        const proposal = await loadProposal(execute, id, username, { lock: true });
        if (proposal.returnId !== scopedReturnId) {
          throw new ReturnDecisionLifecycleError('The proposal does not belong to this return.', 409, 'RETURN_DECISION_RETURN_MISMATCH');
        }
        if (proposal.generationId !== generationId) {
          throw new ReturnDecisionLifecycleError('The proposal belongs to an earlier dataset generation.', 409, 'RETURN_DECISION_GENERATION_STALE');
        }
        if (proposal.status !== 'DRAFT') {
          throw new ReturnDecisionLifecycleError('This proposal has already been finalized.', 409, 'RETURN_DECISION_PROPOSAL_FINALIZED');
        }
        if (proposal.version !== version) {
          throw new ReturnDecisionLifecycleError('The proposal changed before final confirmation.', 409, 'RETURN_DECISION_VERSION_CONFLICT', {
            expectedVersion: version, currentVersion: proposal.version,
          });
        }
        const request = await loadRequest(execute, scopedReturnId, { lock: true });
        if (request.decisionVersion !== proposal.caseVersion
            || request.recommendation !== proposal.aiRecommendation
            || String(request.policyClause || '') !== String(proposal.policyClause || '')) {
          throw new ReturnDecisionLifecycleError(
            'The return recommendation, policy, or decision version changed after this proposal was prepared.',
            409,
            'RETURN_DECISION_CASE_STALE'
          );
        }
        const evidenceSnapshot = await buildAuthoritativeEvidenceSnapshot(
          execute, request, generationId
        );

        const decisionIdBind = {
          dir: persistence.oracledb?.BIND_OUT,
          type: persistence.oracledb?.NUMBER,
        };
        const inserted = await execute(`
          INSERT INTO return_decisions (
            return_id, decision_type, decision_summary,
            confidence_score, created_by
          ) VALUES (
            :returnId, :decisionType, :decisionSummary,
            :confidenceScore, :createdBy
          )
          RETURNING decision_id INTO :decisionId
        `, {
          returnId: scopedReturnId,
          decisionType: proposal.decisionType,
          decisionSummary: proposal.reviewerNotes || `Human reviewer finalized ${proposal.decisionType}.`,
          confidenceScore: null,
          createdBy: username,
          decisionId: decisionIdBind,
        });
        const decisionId = Number(Array.isArray(inserted.outBinds?.decisionId)
          ? inserted.outBinds.decisionId[0]
          : inserted.outBinds?.decisionId);
        if (!Number.isInteger(decisionId) || decisionId <= 0) {
          throw new ReturnDecisionLifecycleError('Oracle did not return the committed decision identifier.', 503, 'RETURN_DECISION_WRITE_FAILED');
        }

        const decisionPayload = {
          decisionType: proposal.decisionType,
          reviewerNotes: proposal.reviewerNotes,
          customerResponse: proposal.customerResponse,
          reviewer: username,
          humanConfirmed: true,
          autonomousModelWrite: false,
          aiRecommendationConfidence: request.confidenceScore,
        };
        await execute(`
          INSERT INTO return_decision_provenance (
            decision_id, return_id, proposal_id, reviewer_username,
            dataset_generation_id, ai_recommendation, policy_clause,
            evidence_snapshot, decision_payload
          ) VALUES (
            :decisionId, :returnId, :proposalId, :username,
            :generationId, :aiRecommendation, :policyClause,
            :evidenceSnapshot, :decisionPayload
          )
        `, {
          decisionId, returnId: scopedReturnId, proposalId: id, username,
          generationId, aiRecommendation: proposal.aiRecommendation,
          policyClause: proposal.policyClause,
          evidenceSnapshot: jsonBind(evidenceSnapshot),
          decisionPayload: jsonBind(decisionPayload),
        });
        await execute(`
          INSERT INTO return_customer_messages (
            return_id, decision_id, proposal_id, message_text,
            delivery_status, created_by
          ) VALUES (
            :returnId, :decisionId, :proposalId, :messageText,
            'RECORDED', :createdBy
          )
        `, {
          returnId: scopedReturnId, decisionId, proposalId: id,
          messageText: proposal.customerResponse, createdBy: username,
        });
        const nextStatus = proposal.decisionType === 'Request Info' ? 'In Review' : 'Closed';
        const requestUpdate = await execute(`
          UPDATE return_requests
          SET status = :status,
              decision_version = decision_version + 1,
              updated_at = SYSTIMESTAMP
          WHERE return_id = :returnId
            AND decision_version = :caseVersion
            AND recommendation = :aiRecommendation
        `, {
          status: nextStatus, returnId: scopedReturnId,
          caseVersion: proposal.caseVersion,
          aiRecommendation: proposal.aiRecommendation,
        });
        if (Number(requestUpdate.rowsAffected || 0) !== 1) {
          throw new ReturnDecisionLifecycleError('The return changed during final confirmation.', 409, 'RETURN_DECISION_CASE_STALE');
        }
        await execute(`
          INSERT INTO return_events (
            return_id, event_type, event_note, actor
          ) VALUES (
            :returnId, 'Reviewer Decision Finalized', :eventNote, :actor
          )
        `, {
          returnId: scopedReturnId,
          eventNote: `${username} finalized ${proposal.decisionType}; AI recommendation remained ${proposal.aiRecommendation}.`,
          actor: username,
        });
        await execute(`
          BEGIN
            retail_return_evidence_pkg.refresh_return(:returnId, :generationId);
          END;
        `, { returnId: scopedReturnId, generationId });
        const evidenceCounts = await execute(`
          SELECT
            (SELECT COUNT(*) FROM return_evidence_index
             WHERE generation_id = :generationId) AS indexed_evidence,
            ((SELECT COUNT(*) * 2 FROM return_requests) +
             (SELECT COUNT(*) FROM return_documents) +
             (SELECT COUNT(*) FROM return_events) +
             (SELECT COUNT(*) FROM return_decisions) +
             (SELECT COUNT(*) FROM return_requests rr
              JOIN return_policy_clauses policy
                ON policy.clause_code = rr.policy_clause)) AS expected_evidence
          FROM dual
        `, { generationId });
        const counts = evidenceCounts.rows?.[0] || {};
        if (Number(counts.INDEXED_EVIDENCE) !== Number(counts.EXPECTED_EVIDENCE)) {
          throw new ReturnDecisionLifecycleError('Current-generation return evidence did not reconcile.', 503, 'RETURN_DECISION_EVIDENCE_REFRESH_FAILED');
        }
        const readinessUpdate = await execute(`
          UPDATE app_dataset_readiness
          SET readiness = JSON_MERGEPATCH(readiness, :readinessPatch),
              updated_at = SYSTIMESTAMP
          WHERE readiness_id = 1
            AND status = 'ACTIVE'
            AND JSON_VALUE(readiness, '$.generationId' RETURNING VARCHAR2(64)) = :generationId
        `, {
          generationId,
          readinessPatch: jsonBind({
            returnEvidenceVectors: Number(counts.INDEXED_EVIDENCE),
            expectedReturnEvidenceVectors: Number(counts.EXPECTED_EVIDENCE),
            invalidReturnEvidenceVectors: 0,
          }),
        });
        if (Number(readinessUpdate.rowsAffected || 0) !== 1) {
          throw new ReturnDecisionLifecycleError('Active dataset readiness changed during final confirmation.', 409, 'RETURN_DECISION_GENERATION_STALE');
        }
        const correlationId = `return-decision-${decisionId}`;
        await execute(`
          INSERT INTO event_stream (
            event_type, event_source, event_data, correlation_id, processed
          ) VALUES (
            'return_decision_finalized', 'returns_intelligence',
            :eventData, :correlationId, 0
          )
        `, {
          eventData: jsonBind({
            returnId: scopedReturnId,
            decisionId,
            proposalId: id,
            decisionType: proposal.decisionType,
            reviewer: username,
            generationId,
          }),
          correlationId,
        });
        const nextVersion = version + 1;
        const finalized = await execute(`
          UPDATE return_decision_proposals
          SET status = 'FINALIZED',
              finalized_decision_id = :decisionId,
              evidence_snapshot = :evidenceSnapshot,
              version = :nextVersion,
              finalized_at = SYSTIMESTAMP,
              updated_at = SYSTIMESTAMP
          WHERE proposal_id = :proposalId
            AND LOWER(owner_username) = LOWER(:username)
            AND status = 'DRAFT'
            AND version = :expectedVersion
        `, {
          decisionId, nextVersion, proposalId: id, username,
          evidenceSnapshot: jsonBind(evidenceSnapshot),
          expectedVersion: version,
        });
        if (Number(finalized.rowsAffected || 0) !== 1) {
          throw new ReturnDecisionLifecycleError('The proposal changed during final confirmation.', 409, 'RETURN_DECISION_VERSION_CONFLICT');
        }
        const response = {
          returnId: scopedReturnId,
          decisionId,
          proposal: {
            ...proposal,
            status: 'FINALIZED',
            finalizedDecisionId: decisionId,
            version: nextVersion,
          },
          status: nextStatus,
          caseVersion: proposal.caseVersion + 1,
          customerMessageRecorded: true,
          evidenceRefreshed: true,
          outboxCorrelationId: correlationId,
          aiRecommendationPreserved: true,
        };
        await recordCommand(execute, {
          returnId: scopedReturnId, proposalId: id, username,
          clientRequestId: requestId, commandType: 'FINALIZE', fingerprint, response,
        });
        await connection.commit();
        return { ...response, replayed: false };
      });
    } catch (error) {
      const replay = await recoverConcurrentCommand({
        error, username, clientRequestId: requestId, commandType: 'FINALIZE', fingerprint,
      });
      if (replay) return replay;
      throw publicError(error);
    }
  }

  return {
    createProposal,
    finalizeProposal,
    getLifecycle,
    updateProposal,
  };
}

module.exports = {
  DECISIONS,
  ReturnDecisionLifecycleError,
  assertIdentity,
  cloneBoundedJson,
  createReturnDecisionLifecycleService,
  normalizeProposal,
  publicError,
  stableFingerprint,
};
