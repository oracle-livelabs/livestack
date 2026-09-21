/**
 * Retail Agent Console: server-owned conversations, deterministic routing,
 * allowlisted Oracle tools, and citation-validated summaries.
 */
'use strict';

const crypto = require('crypto');
const express = require('express');
const db = require('../config/database');
const { DEFAULT_PROFILE, getAvailableProfiles, normalizeProfile } = require('../lib/ollamaAssistant');
const { TEAM_CONFIG, bindRouteToCitedEvidence, routeAgentQuestion } = require('../lib/agentRouter');
const { runAgentTools } = require('../lib/agentToolRegistry');
const { deterministicFallback, synthesizeAgentAnswer } = require('../lib/agentGroundedSynthesisService');
const { appendTurn, archiveConversation, createConversation, getConversation, listConversations } = require('../lib/agentConversationService');

const router = express.Router();
const MAX_QUESTION_LENGTH = 1000;
const AGENT_COMMAND_HEADER = 'confirm-agent-proposals';
const TEAMS = Object.freeze([
  { TEAM_NAME: 'DEMAND_SIGNAL_AGENT', STATUS: 'ENABLED', DESCRIPTION: 'Explains creator-led demand and product momentum from VPD-scoped retail signals.' },
  { TEAM_NAME: 'FULFILLMENT_OPTIMIZATION_AGENT', STATUS: 'ENABLED', DESCRIPTION: 'Finds inventory risk and spatial fulfillment options from governed Oracle data.' },
  { TEAM_NAME: 'COMMERCE_INTELLIGENCE_AGENT', STATUS: 'ENABLED', DESCRIPTION: 'Summarizes orders, revenue, categories, and demand-signal attribution.' },
  { TEAM_NAME: 'RETURNS_TRIAGE_AGENT', STATUS: 'ENABLED', DESCRIPTION: 'Retrieves return cases and semantically relevant evidence with Oracle AI Vector Search.' },
]);

function cleanQuestion(value) {
  const question = String(value || '').replace(/\s+/g, ' ').trim();
  if (!question) throw Object.assign(new Error('A question is required'), { status: 400, code: 'AGENT_QUESTION_REQUIRED' });
  if (question.length > MAX_QUESTION_LENGTH) throw Object.assign(new Error(`Questions must be ${MAX_QUESTION_LENGTH} characters or fewer`), { status: 400, code: 'AGENT_QUESTION_TOO_LONG' });
  return question;
}
function identity(req) { return { username: req.demoUser, role: req.demoIdentity?.role, accessScope: req.demoIdentity?.accessScope }; }
function recentContext(conversation) { return (conversation?.turns || []).slice(-4).map((turn) => `USER: ${turn.question}\nAGENT: ${turn.response}`).join('\n').slice(0, 2400); }
function isAdmin(req) { return String(req.demoIdentity?.role || '').toLowerCase() === 'admin' && String(req.demoIdentity?.accessScope || '').toUpperCase() === 'GLOBAL'; }
function requireAgentProposalCommand(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ code: 'AGENT_ADMIN_REQUIRED', error: 'Only a global Admin can create governed agent proposals.' });
  if (String(req.headers['x-agent-command'] || '') !== AGENT_COMMAND_HEADER) return res.status(409).json({ code: 'AGENT_CONFIRMATION_REQUIRED', error: 'Confirm the governed proposal cycle before creating audit rows.', requiredHeader: 'X-Agent-Command' });
  return next();
}
function routeOnlyAnswer(route) {
  if (route.status === 'clarification') return route.reason;
  return 'I can investigate retail demand signals, inventory and fulfillment, commerce metrics, or return evidence. This question does not map safely to one of those governed tool domains.';
}

/**
 * Keep the Agent Console's Recent Agent Actions feed useful without turning a
 * read-only question into an operational mutation.  HighTech records the
 * specialist work it performed; Retail does the same, but stores only bounded
 * provenance (team, tools, evidence count, and generation) in the existing
 * append-only audit table.  A regional role may be unable to write this global
 * audit row under VPD, so audit logging is deliberately best-effort and never
 * blocks the governed answer.
 */
async function logAgentQueryAction({ owner, route, toolResult, synthesis, persisted, correlationId }) {
  if (!route?.team) return false;
  const toolKeys = (toolResult?.tools || []).map((tool) => tool.tool_key).filter(Boolean);
  const evidenceCount = (toolResult?.sources || []).length;
  const payload = {
    correlation_id: correlationId,
    dataset_generation_id: persisted?.generationId || null,
    team: route.team,
    intent: route.intent,
    route_confidence: route.confidence,
    route_margin: route.margin,
    tools: toolKeys,
    evidence_count: evidenceCount,
    synthesis_mode: synthesis?.mode || null,
    reason: `Completed governed ${route.intent} investigation with ${toolKeys.length} Oracle tool${toolKeys.length === 1 ? '' : 's'} and ${evidenceCount} evidence source${evidenceCount === 1 ? '' : 's'}.`,
  };
  try {
    await db.executeAsUser(`
      INSERT INTO agent_actions (
        agent_name, action_type, entity_type, decision_payload,
        confidence, execution_status, executed_at
      ) VALUES (
        :agentName, 'agent_query_completed', 'agent_query', :payload,
        :confidence, 'completed', SYSTIMESTAMP
      )
    `, {
      agentName: route.team.toLowerCase(),
      payload: JSON.stringify(payload),
      confidence: Number(route.confidence || 0),
    }, owner?.username);
    return true;
  } catch (error) {
    console.warn('Agent query audit row skipped:', String(error?.message || error).split('\n')[0]);
    return false;
  }
}

router.get('/teams', (_req, res) => res.json(TEAMS));
router.get('/profiles', (_req, res) => res.json({ profiles: getAvailableProfiles(), activeProfile: DEFAULT_PROFILE, scope: 'request-local' }));
router.post('/set-profile', (req, res) => {
  const profile = normalizeProfile(req.body?.profile);
  return res.json({ success: true, profile, scope: 'request-local', message: `${profile} uses the local Ollama model; Oracle remains the governed tool and data layer.` });
});

router.get('/conversations', async (req, res) => {
  try { return res.json(await listConversations({ identity: identity(req), limit: req.query.limit })); }
  catch (error) { return res.status(error.status || 503).json({ code: error.code || 'AGENT_CONVERSATIONS_UNAVAILABLE', error: error.message }); }
});
router.post('/conversations', async (req, res) => {
  try { return res.status(201).json(await createConversation({ identity: identity(req), title: req.body?.title })); }
  catch (error) { return res.status(error.status || 503).json({ code: error.code || 'AGENT_CONVERSATION_CREATE_FAILED', error: error.message }); }
});
router.get('/conversations/:conversationId', async (req, res) => {
  try { return res.json(await getConversation({ conversationId: req.params.conversationId, identity: identity(req), includeTurns: true })); }
  catch (error) { return res.status(error.status || 503).json({ code: error.code || 'AGENT_CONVERSATION_UNAVAILABLE', error: error.message, details: error.details }); }
});
router.delete('/conversations/:conversationId', async (req, res) => {
  try { return res.json(await archiveConversation({ conversationId: req.params.conversationId, identity: identity(req) })); }
  catch (error) { return res.status(error.status || 503).json({ code: error.code || 'AGENT_CONVERSATION_ARCHIVE_FAILED', error: error.message }); }
});

router.post('/chat', async (req, res) => {
  const startedAt = Date.now();
  const correlationId = `agent-chat-${crypto.randomUUID()}`;
  try {
    const question = cleanQuestion(req.body?.question);
    const owner = identity(req);
    const conversation = req.body?.conversationId
      ? await getConversation({ conversationId: req.body.conversationId, identity: owner, includeTurns: true })
      : await createConversation({ identity: owner, title: question.slice(0, 120) });
    const route = routeAgentQuestion(question, { lastTeam: conversation.lastTeam, entities: conversation.context?.entities || {} });
    const routeTelemetry = { correlationId, routeStatus: route.status, routeConfidence: route.confidence, routeMargin: route.margin, routedTeam: route.team, handoff: route.handoff, injectionDetected: route.injectionDetected };

    if (route.status !== 'completed') {
      const answer = { response: routeOnlyAnswer(route), claims: [], mode: route.status, confidence: 'low', citationValidation: 'skipped' };
      const persisted = await appendTurn({ conversationId: conversation.id, identity: owner, question, route, answer, evidence: { sources: [], contradictions: [], insufficientEvidence: true }, telemetry: { ...routeTelemetry, synthesisMode: 'skipped', elapsedMs: Date.now() - startedAt } });
      return res.json({
        question, conversationId: conversation.id, turnId: persisted.turnId, team: null, intent: route.intent, route,
        agentUsed: false, response: answer.response, claims: [], citations: [], data: null, toolsUsed: [], contradictions: [], insufficientEvidence: true, deepLinks: [],
        trace: [{ stage: 'route', status: route.status, detail: route.reason }], telemetry: { ...routeTelemetry, elapsedMs: Date.now() - startedAt },
        security: { vpdUser: req.demoUser, role: owner.role, accessScope: owner.accessScope, datasetGenerationId: persisted.generationId, serverOwnedConversation: true, readOnly: true, mutationPerformed: false },
        elapsed: Date.now() - startedAt,
      });
    }

    const toolResult = await runAgentTools(route, question, { username: req.demoUser });
    const synthesis = await synthesizeAgentAnswer({ question, route, sources: toolResult.sources, conversationContext: recentContext(conversation) });
    const resolvedRoute = bindRouteToCitedEvidence(route, synthesis.claims);
    const elapsedMs = Date.now() - startedAt;
    const telemetry = {
      ...routeTelemetry, toolKeys: toolResult.tools.map((item) => item.tool_key), toolLatencyMs: toolResult.toolLatencyMs,
      toolResultCount: toolResult.sources.length, synthesisMode: synthesis.mode, synthesisLatencyMs: synthesis.latencyMs || 0,
      citationValidation: synthesis.citationValidation, repairUsed: Boolean(synthesis.repairUsed), fallbackReason: synthesis.reason || null,
      contradictionCount: toolResult.contradictions.length, insufficientEvidence: toolResult.insufficientEvidence, elapsedMs,
    };
    const answer = { response: synthesis.answer, claims: synthesis.claims, mode: synthesis.mode, confidence: synthesis.confidence, citationValidation: synthesis.citationValidation, model: synthesis.model || null };
    const persisted = await appendTurn({ conversationId: conversation.id, identity: owner, question, route: resolvedRoute, answer, evidence: { sources: toolResult.sources, contradictions: toolResult.contradictions, insufficientEvidence: toolResult.insufficientEvidence }, telemetry });
    await logAgentQueryAction({ owner, route: resolvedRoute, toolResult, synthesis, persisted, correlationId });
    const citations = [...new Map((synthesis.claims || []).flatMap((claim) => claim.citations || []).map((item) => [item.id, item])).values()];
    return res.json({
      question, conversationId: conversation.id, turnId: persisted.turnId, team: resolvedRoute.team, intent: resolvedRoute.intent, route: resolvedRoute,
      agentUsed: synthesis.used, response: synthesis.answer, claims: synthesis.claims || [], citations,
      data: toolResult.data, toolsUsed: toolResult.tools,
      toolHistory: toolResult.tools.map((entry) => ({ TOOL_NAME: entry.tool, TOOL_KEY: entry.tool_key, CALLED_AT: new Date().toISOString(), RESULT_PREVIEW: entry.status })),
      contradictions: toolResult.contradictions, insufficientEvidence: toolResult.insufficientEvidence,
      deepLinks: resolvedRoute.deepLink ? [resolvedRoute.deepLink] : [],
      trace: [
        { stage: 'route', status: 'completed', detail: `${route.team} · confidence ${route.confidence} · margin ${route.margin}` },
        ...(route.handoff ? [{ stage: 'handoff', status: 'completed', detail: `${route.handoff.from} → ${route.handoff.to}` }] : []),
        { stage: 'oracle_tools', status: 'completed', detail: toolResult.tools.map((entry) => entry.tool_key) },
        { stage: 'citation_validation', status: synthesis.citationValidation, detail: `${citations.length} stable sources` },
        { stage: 'grounded_summary', status: synthesis.mode, detail: synthesis.reason || null },
      ], telemetry,
      security: { vpdUser: req.demoUser, role: owner.role, accessScope: owner.accessScope, datasetGenerationId: persisted.generationId, serverOwnedConversation: true, readOnly: true, mutationPerformed: false },
      elapsed: elapsedMs,
    });
  } catch (error) {
    console.error('Retail agent chat error:', error);
    return res.status(error.status || 503).json({ code: error.code || (error.status ? 'AGENT_REQUEST_INVALID' : 'AGENT_ORACLE_TOOL_UNAVAILABLE'), error: error.status ? error.message : 'The governed Agent Console could not complete this request.', details: error.details || (error.status ? undefined : String(error.message || '').split('\n')[0]), correlationId });
  }
});

// Proposal lifecycle intentionally remains unchanged until Milestone 5.
router.post('/run-cycle', requireAgentProposalCommand, async (req, res) => {
  const correlationId = `retail-agent-${crypto.randomUUID()}`;
  try {
    const snapshots = [];
    for (const team of Object.keys(TEAM_CONFIG)) {
      const question = team === 'DEMAND_SIGNAL_AGENT' ? 'What demand needs attention?'
        : team === 'FULFILLMENT_OPTIMIZATION_AGENT' ? 'What inventory needs attention?'
          : team === 'RETURNS_TRIAGE_AGENT' ? 'What return evidence needs review?'
            : 'What commerce metrics need attention?';
      const route = { ...routeAgentQuestion(question, {}), team, intent: TEAM_CONFIG[team].intent };
      const toolResult = await runAgentTools(route, question, { username: req.demoUser });
      snapshots.push({ team, intent: route.intent, summary: deterministicFallback(toolResult.sources, route.intent).answer, tools: toolResult.tools });
    }
    await db.withUserConnection(req.demoUser, async ({ connection, execute }) => {
      for (const snapshot of snapshots) {
        await execute(`INSERT INTO agent_actions (agent_name, action_type, entity_type, decision_payload, confidence, execution_status)
          VALUES (:agentName, 'review_proposal', :entityType, :payload, 0.900, 'proposed')`, { agentName: snapshot.team.toLowerCase(), entityType: snapshot.intent, payload: JSON.stringify({ correlation_id: correlationId, reason: snapshot.summary, tools: snapshot.tools.map((tool) => tool.tool_key) }) });
      }
      await execute(`INSERT INTO event_stream (event_type, event_source, event_data, correlation_id, processed)
        VALUES ('agent_review_proposed', 'retail_agent_orchestrator', :eventData, :correlationId, 1)`, { eventData: JSON.stringify({ proposal_count: snapshots.length, initiated_by: req.demoUser }), correlationId });
      await connection.commit();
    });
    return res.status(201).json({ message: `${snapshots.length} governed review proposals created. No orders, inventory, returns, or customer records were changed.`, correlationId, status: 'proposed', proposals: snapshots });
  } catch (error) {
    console.error('Retail agent proposal cycle error:', error);
    return res.status(503).json({ code: 'AGENT_PROPOSAL_FAILED', error: 'The proposal transaction did not complete.', details: String(error.message || '').split('\n')[0] });
  }
});

router.post('/detect-trends', async (_req, res) => {
  try { const route = routeAgentQuestion('What products are trending?', {}); const result = await runAgentTools(route, 'What products are trending?', { username: _req.demoUser }); return res.json({ message: 'Read-only demand signal analysis complete.', actions: [], data: result.data, toolsUsed: result.tools }); }
  catch (error) { return res.status(503).json({ code: 'AGENT_ORACLE_TOOL_UNAVAILABLE', error: 'Demand signal analysis is unavailable.', details: String(error.message || '').split('\n')[0] }); }
});
router.get('/actions', async (req, res) => {
  try { const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100); const result = await db.execute(`SELECT action_id, agent_name, action_type, entity_type, entity_id, decision_payload, confidence, execution_status, executed_at, created_at FROM agent_actions ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`, { limit }); return res.json(result.rows || []); }
  catch (_error) { return res.status(503).json({ error: 'Agent provenance is unavailable.', code: 'AGENT_PROVENANCE_UNAVAILABLE' }); }
});
router.get('/events', async (req, res) => {
  try { const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100); const result = await db.execute(`SELECT event_id, event_type, event_source, JSON_SERIALIZE(event_data RETURNING VARCHAR2(4000)) AS event_data, correlation_id, processed, created_at FROM event_stream ORDER BY created_at DESC FETCH FIRST :limit ROWS ONLY`, { limit }); return res.json(result.rows || []); }
  catch (_error) { return res.status(503).json({ error: 'Agent events are unavailable.', code: 'AGENT_EVENTS_UNAVAILABLE' }); }
});
router.get('/summary', async (_req, res) => {
  try { const result = await db.execute(`SELECT agent_name, COUNT(*) AS total_actions, COUNT(CASE WHEN execution_status = 'proposed' THEN 1 END) AS proposed, COUNT(CASE WHEN execution_status = 'completed' THEN 1 END) AS completed, ROUND(AVG(confidence), 3) AS avg_confidence, MAX(created_at) AS last_action FROM agent_actions GROUP BY agent_name ORDER BY total_actions DESC`); return res.json(result.rows || []); }
  catch (_error) { return res.status(503).json({ error: 'Agent summary is unavailable.', code: 'AGENT_SUMMARY_UNAVAILABLE' }); }
});

module.exports = router;
