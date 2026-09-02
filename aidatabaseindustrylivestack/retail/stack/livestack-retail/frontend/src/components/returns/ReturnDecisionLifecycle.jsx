import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck,
  FileClock,
  History,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { JetButton, JetProgressCircle } from '../JetControls';
import { returnDecisionLifecycleApi } from '../../utils/returnDecisionLifecycleApi';
import './ReturnDecisionLifecycle.css';

const DECISION_OPTIONS = ['Approve', 'Request Info', 'Deny'];
const DECISION_COPY = Object.freeze({
  Approve: {
    notes: ({ policy, reason }) => (
      `AI-assisted draft — Approve. The recommendation is aligned with ${policy || 'the applicable return policy'}${reason ? ` for “${reason}”` : ''}. Review the evidence and record any human rationale before final confirmation.`
    ),
    response: ({ customer, product }) => (
      `Hi ${customer || 'there'},\n\nWe’ve reviewed your return${product ? ` for ${product}` : ''}. Based on the available evidence, your return is approved. We’ll share the next steps with you shortly.\n\nThank you,\nSeer Sporting Goods`
    ),
  },
  'Request Info': {
    notes: ({ policy, reason }) => (
      `AI-assisted draft — Request Info. More information is needed to resolve this return${reason ? ` (${reason})` : ''} under ${policy || 'the applicable return policy'}. Note the evidence gap and the exact follow-up requested before final confirmation.`
    ),
    response: ({ customer, product }) => (
      `Hi ${customer || 'there'},\n\nWe’re reviewing your return${product ? ` for ${product}` : ''} and need a little more information before we can complete it. Please reply with the requested details so our returns team can continue.\n\nThank you,\nSeer Sporting Goods`
    ),
  },
  Deny: {
    notes: ({ policy, reason }) => (
      `AI-assisted draft — Deny. The recommendation is based on ${reason || 'the return details'} under ${policy || 'the applicable return policy'}. Review the evidence and document any human override before final confirmation.`
    ),
    response: ({ customer, product }) => (
      `Hi ${customer || 'there'},\n\nWe’ve reviewed your return${product ? ` for ${product}` : ''}. Based on the available evidence and the applicable return policy, we’re unable to approve this return. If you have additional information, please contact our support team.\n\nThank you,\nSeer Sporting Goods`
    ),
  },
});
const STALE_CODES = new Set([
  'RETURN_DECISION_CASE_STALE',
  'RETURN_DECISION_PROPOSAL_STALE',
  'RETURN_DECISION_VERSION_CONFLICT',
  'RETURN_DECISION_GENERATION_STALE',
  'RETURN_DECISION_PROPOSAL_FINALIZED',
]);
const IDEMPOTENCY_CODES = new Set([
  'RETURN_DECISION_IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
]);
const UNAVAILABLE_CODES = new Set([
  'RETURN_DECISION_SCHEMA_UNAVAILABLE',
  'RETURN_DECISION_SERVICE_UNAVAILABLE',
  'RETURN_DECISION_LIFECYCLE_UNAVAILABLE',
  'RETURN_DECISION_GENERATION_UNAVAILABLE',
  'RETURN_DECISION_EVIDENCE_REFRESH_FAILED',
  'RETURN_DECISION_WRITE_FAILED',
]);

function newDecisionRequestId(prefix = 'return-decision') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function value(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
  }
  return null;
}

function normalizeLifecycle(payload, returnId) {
  const lifecycle = payload?.lifecycle || payload || {};
  const proposals = lifecycle.proposals || [];
  const proposedActive = lifecycle.activeProposal || lifecycle.proposal
    || proposals.find((item) => String(value(item, 'status', 'STATUS') || '').toUpperCase() === 'DRAFT');
  const activeProposal = String(value(proposedActive, 'status', 'STATUS') || '').toUpperCase() === 'DRAFT'
    ? proposedActive
    : null;
  const decisions = lifecycle.decisions || lifecycle.decisionHistory || [];
  const derivedProvenance = decisions
    .filter((item) => value(item, 'PROPOSAL_ID', 'proposalId', 'EVIDENCE_SNAPSHOT', 'evidenceSnapshot'))
    .map((item) => ({
      provenanceId: `decision-${value(item, 'DECISION_ID', 'decisionId')}`,
      decisionId: value(item, 'DECISION_ID', 'decisionId'),
      proposalId: value(item, 'PROPOSAL_ID', 'proposalId'),
      generationId: value(item, 'DATASET_GENERATION_ID', 'generationId'),
      aiRecommendation: value(item, 'AI_RECOMMENDATION', 'aiRecommendation'),
      policyCode: value(item, 'POLICY_CLAUSE', 'policyClause'),
      evidence: value(item, 'EVIDENCE_SNAPSHOT', 'evidenceSnapshot'),
      decisionPayload: value(item, 'DECISION_PAYLOAD', 'decisionPayload'),
    }));
  return {
    returnId: Number(value(lifecycle, 'returnId', 'RETURN_ID') || returnId),
    caseVersion: Number(value(lifecycle, 'caseVersion', 'decisionVersion', 'DECISION_VERSION') || 0),
    status: value(lifecycle, 'status', 'caseStatus', 'STATUS')
      || value(lifecycle.request, 'status', 'STATUS') || 'Needs Review',
    generationId: value(lifecycle, 'generationId', 'GENERATION_ID'),
    request: lifecycle.request || null,
    activeProposal,
    proposals,
    decisions,
    provenance: lifecycle.provenance || lifecycle.provenanceHistory
      || derivedProvenance,
    messages: lifecycle.messages || [],
    events: lifecycle.events || lifecycle.eventHistory || [],
    canMutate: lifecycle.canMutate,
  };
}

function proposalValue(proposal, camel, upper, fallback = '') {
  return value(proposal, camel, upper) ?? fallback;
}

function recommendationDecision(valueToNormalize) {
  const normalized = String(valueToNormalize || '').trim().toLowerCase();
  return DECISION_OPTIONS.find((option) => option.toLowerCase() === normalized) || '';
}

function buildDecisionDraft(request = {}, selectedDecision = null) {
  const decisionType = recommendationDecision(
    selectedDecision === null
      ? value(request, 'recommendation', 'RECOMMENDATION')
      : selectedDecision
  );
  const copy = DECISION_COPY[decisionType];
  if (!copy) return { decisionType: '', reviewerNotes: '', customerResponse: '' };
  const context = {
    policy: value(request, 'policyClause', 'POLICY_CLAUSE'),
    reason: value(request, 'returnReason', 'RETURN_REASON'),
    customer: value(request, 'customerName', 'CUSTOMER_NAME'),
    product: value(request, 'productName', 'PRODUCT_NAME'),
  };
  return {
    decisionType,
    reviewerNotes: copy.notes(context),
    customerResponse: copy.response(context),
  };
}

function buildRecommendationDraft(request = {}) {
  return buildDecisionDraft(request);
}

function describeError(error) {
  if (!error) return null;
  if (STALE_CODES.has(error.code)) return {
    kind: 'stale',
    title: 'This return changed before the decision was saved',
    message: 'Reload the current proposal and evidence before making another governed decision attempt.',
  };
  if (IDEMPOTENCY_CODES.has(error.code)) return {
    kind: 'idempotency',
    title: 'That request identifier was already used differently',
    message: 'Reload the lifecycle. A retry must preserve the exact same decision command and content.',
  };
  if (UNAVAILABLE_CODES.has(error.code)) return {
    kind: 'unavailable',
    title: 'Governed decision lifecycle is unavailable',
    message: error.message,
  };
  if (error.code === 'RETURN_DECISION_CONFIRMATION_REQUIRED') return {
    kind: 'confirmation',
    title: 'Explicit confirmation is required',
    message: 'Review the proposal and use the final confirmation control. No decision has been committed.',
  };
  return {
    kind: 'error',
    title: 'Decision request failed',
    message: error.message || 'The governed decision request could not complete.',
  };
}

function formatWhen(input) {
  if (!input) return 'Time not supplied';
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? String(input) : parsed.toLocaleString();
}

function Timeline({ lifecycle }) {
  const entries = useMemo(() => {
    const decisions = lifecycle.decisions.map((item, index) => ({
      ...item,
      _kind: 'Committed decision',
      _id: value(item, 'decisionId', 'DECISION_ID') || `decision-${index}`,
      _time: value(item, 'committedAt', 'createdAt', 'COMMITTED_AT', 'CREATED_AT'),
      _title: value(item, 'decisionType', 'DECISION_TYPE') || 'Decision',
    }));
    const events = lifecycle.events.map((item, index) => ({
      ...item,
      _kind: 'Operational event',
      _id: value(item, 'eventId', 'EVENT_ID') || `event-${index}`,
      _time: value(item, 'createdAt', 'CREATED_AT'),
      _title: value(item, 'eventType', 'EVENT_TYPE') || 'Return event',
    }));
    const messages = lifecycle.messages.map((item, index) => ({
      ...item,
      _kind: 'Customer response',
      _id: value(item, 'messageId', 'MESSAGE_ID') || `message-${index}`,
      _time: value(item, 'createdAt', 'sentAt', 'CREATED_AT', 'SENT_AT'),
      _title: value(item, 'status', 'STATUS') || 'Recorded response',
    }));
    return [...decisions, ...messages, ...events].sort((left, right) => new Date(right._time || 0) - new Date(left._time || 0));
  }, [lifecycle.decisions, lifecycle.events, lifecycle.messages]);

  return entries.length ? (
    <div className="return-decision-timeline" data-testid="return-decision-history">
      {entries.map((entry) => (
        <div key={`${entry._kind}-${entry._id}`} className="return-decision-timeline-item">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">{entry._kind}</p>
          <p className="text-sm font-medium">{entry._title}</p>
          <p className="text-xs text-[var(--color-text-dim)]">
            {value(entry, 'actor', 'reviewerName', 'createdBy', 'ACTOR', 'CREATED_BY') || 'System'} · {formatWhen(entry._time)}
          </p>
          {value(entry, 'customerResponse', 'messageText', 'decisionSummary', 'eventNote', 'CUSTOMER_RESPONSE', 'MESSAGE_TEXT', 'DECISION_SUMMARY', 'EVENT_NOTE') && (
            <p className="text-xs mt-1 leading-relaxed">
              {value(entry, 'customerResponse', 'messageText', 'decisionSummary', 'eventNote', 'CUSTOMER_RESPONSE', 'MESSAGE_TEXT', 'DECISION_SUMMARY', 'EVENT_NOTE')}
            </p>
          )}
        </div>
      ))}
    </div>
  ) : <p className="text-xs text-[var(--color-text-dim)]">No committed decision or lifecycle event is visible in the current VPD scope.</p>;
}

function Provenance({ records }) {
  if (!records.length) return <p className="text-xs text-[var(--color-text-dim)]">No committed provenance snapshot exists yet.</p>;
  return (
    <div className="space-y-2" data-testid="return-decision-provenance">
      {records.map((record, index) => {
        let evidence = value(record, 'citations', 'evidence', 'CITATIONS', 'EVIDENCE_SNAPSHOT') || [];
        if (typeof evidence === 'string') {
          try { evidence = JSON.parse(evidence); } catch { evidence = []; }
        }
        const citations = Array.isArray(evidence)
          ? evidence
          : evidence.citations || evidence.sources || evidence.evidence || [];
        return (
          <details key={value(record, 'provenanceId', 'PROVENANCE_ID') || index} className="rounded-lg border border-[var(--color-border)] p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Decision provenance · {value(record, 'model', 'MODEL') || 'deterministic'} · {value(record, 'policyCode', 'POLICY_CODE') || 'policy snapshot'}
            </summary>
            <p className="mt-2 text-[10px] font-mono text-[var(--color-text-dim)]">
              Evidence generation: {value(record, 'evidenceGeneration', 'generationId', 'EVIDENCE_GENERATION', 'GENERATION_ID') || 'not supplied'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {citations.map((citation, citationIndex) => (
                <span key={(typeof citation === 'string' ? citation : citation?.id || citation?.citation) || citationIndex} className="px-2 py-1 rounded-full border border-[var(--color-border)] text-[10px] font-mono">
                  {typeof citation === 'string' ? citation : citation?.citation || citation?.id || citation?.sourceId || 'Evidence'}
                </span>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export default function ReturnDecisionLifecycle({
  returnId,
  generationKey,
  caseContext = null,
  personaKey = null,
  personaRole = null,
  datasetRevision = 0,
  apiClient = returnDecisionLifecycleApi,
  onLifecycleChange = null,
}) {
  const selectedReturnId = Number(returnId);
  const [lifecycle, setLifecycle] = useState(() => normalizeLifecycle({}, selectedReturnId));
  const [decisionType, setDecisionType] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [customerResponse, setCustomerResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const requestGeneration = useRef(0);
  const commitRequestId = useRef(null);
  const resetKey = `${generationKey || ''}:${personaKey || ''}:${personaRole || ''}:${datasetRevision}:${selectedReturnId || ''}`;
  const canMutate = personaRole === 'admin'
    && String(personaKey || '').toLowerCase() === 'admin_jess'
    && lifecycle.canMutate !== false;

  const applyLifecycle = useCallback((payload) => {
    const next = normalizeLifecycle(payload, selectedReturnId);
    setLifecycle(next);
    const proposal = next.activeProposal;
    const generatedDraft = buildRecommendationDraft(next.request || {});
    setDecisionType(proposalValue(proposal, 'decisionType', 'DECISION_TYPE', generatedDraft.decisionType));
    setReviewerNotes(proposalValue(proposal, 'reviewerNotes', 'REVIEWER_NOTES', generatedDraft.reviewerNotes));
    setCustomerResponse(proposalValue(proposal, 'customerResponse', 'CUSTOMER_RESPONSE', generatedDraft.customerResponse));
    setConfirmed(false);
    commitRequestId.current = null;
    return next;
  }, [selectedReturnId]);

  const loadLifecycle = useCallback(async () => {
    if (!Number.isInteger(selectedReturnId) || selectedReturnId <= 0) return;
    const requestId = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiClient.load(selectedReturnId);
      if (requestId === requestGeneration.current) applyLifecycle(payload);
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setLoading(false);
    }
  }, [apiClient, applyLifecycle, selectedReturnId]);

  useEffect(() => {
    requestGeneration.current += 1;
    setLifecycle(normalizeLifecycle({}, selectedReturnId));
    setDecisionType('');
    setReviewerNotes('');
    setCustomerResponse('');
    setError(null);
    setConfirmed(false);
    setLoading(false);
    setSaving(false);
    setConfirming(false);
    commitRequestId.current = null;
    if (Number.isInteger(selectedReturnId) && selectedReturnId > 0) loadLifecycle();
    return () => { requestGeneration.current += 1; };
  }, [resetKey, selectedReturnId, loadLifecycle]);

  const saveDraft = useCallback(async () => {
    if (!canMutate || saving || !decisionType || !customerResponse.trim()) return;
    const requestId = ++requestGeneration.current;
    setSaving(true);
    setError(null);
    try {
      const proposal = lifecycle.activeProposal;
      const proposalId = proposalValue(proposal, 'proposalId', 'PROPOSAL_ID');
      const input = {
        decisionType,
        reviewerNotes: reviewerNotes.trim(),
        customerResponse: customerResponse.trim(),
        clientRequestId: newDecisionRequestId('return-proposal'),
        expectedVersion: Number(proposalId
          ? proposalValue(proposal, 'version', 'VERSION', 0)
          : lifecycle.caseVersion),
      };
      const payload = proposalId
        ? await apiClient.updateProposal(selectedReturnId, proposalId, input)
        : await apiClient.createProposal(selectedReturnId, input);
      if (requestId === requestGeneration.current) {
        applyLifecycle(payload);
        setSaving(false);
        await loadLifecycle();
        onLifecycleChange?.();
      }
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setSaving(false);
    }
  }, [apiClient, applyLifecycle, canMutate, customerResponse, decisionType, lifecycle, loadLifecycle, onLifecycleChange, reviewerNotes, saving, selectedReturnId]);

  const commit = useCallback(async () => {
    const proposal = lifecycle.activeProposal;
    const proposalId = proposalValue(proposal, 'proposalId', 'PROPOSAL_ID');
    if (!canMutate || confirming || !confirmed || !proposalId) return;
    const requestId = ++requestGeneration.current;
    setConfirming(true);
    setError(null);
    if (!commitRequestId.current) commitRequestId.current = newDecisionRequestId('return-commit');
    try {
      const payload = await apiClient.commitProposal(selectedReturnId, proposalId, {
        clientRequestId: commitRequestId.current,
        expectedVersion: Number(proposalValue(proposal, 'version', 'VERSION', 0)),
      });
      if (requestId === requestGeneration.current) {
        applyLifecycle(payload);
        setConfirming(false);
        await loadLifecycle();
        onLifecycleChange?.();
      }
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setConfirming(false);
    }
  }, [apiClient, applyLifecycle, canMutate, confirmed, confirming, lifecycle, loadLifecycle, onLifecycleChange, selectedReturnId]);

  const visibleError = describeError(error);
  const proposal = lifecycle.activeProposal;
  const proposalStatus = proposalValue(proposal, 'status', 'STATUS', null);
  const immutableRecommendation = value(lifecycle.request, 'recommendation', 'RECOMMENDATION')
    || value(caseContext, 'RECOMMENDATION', 'recommendation') || 'No AI recommendation supplied';
  const confidence = Number(value(lifecycle.request, 'confidenceScore', 'CONFIDENCE_SCORE')
    ?? value(caseContext, 'CONFIDENCE_SCORE', 'confidenceScore'));

  if (!Number.isInteger(selectedReturnId) || selectedReturnId <= 0) return null;

  return (
    <section className="return-decision-lifecycle glass-card p-5" aria-labelledby="return-decision-lifecycle-title">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 id="return-decision-lifecycle-title" className="text-base font-semibold flex items-center gap-2">
            <ClipboardCheck size={18} className="tone-sienna" /> Governed decision lifecycle
          </h3>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">Draft review, explicit Admin confirmation, immutable provenance, and one final Oracle transaction.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="return-decision-status" data-testid="return-decision-case-status">{lifecycle.status}</span>
          <button type="button" className="p-2 rounded-lg border border-[var(--color-border)]" aria-label="Refresh decision lifecycle" onClick={loadLifecycle} disabled={loading || saving || confirming}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && !proposal && (
        <div className="flex items-center gap-2 mb-4 text-xs text-[var(--color-text-dim)]" role="status">
          <JetProgressCircle value={-1} size="sm" /> Loading VPD-scoped decision history...
        </div>
      )}

      {visibleError && (
        <div className="return-decision-alert mb-4" data-tone={visibleError.kind === 'error' ? 'danger' : 'warning'} role="alert" data-testid={`return-decision-error-${visibleError.kind}`}>
          <p className="text-sm font-semibold">{visibleError.title}</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">{visibleError.message}</p>
          {(visibleError.kind === 'stale' || visibleError.kind === 'idempotency') && (
            <div className="mt-3"><JetButton label="Reload current lifecycle" chroming="outlined" iconClass="oj-fwk-icon oj-fwk-icon-refresh" onAction={loadLifecycle} /></div>
          )}
        </div>
      )}

      <div className="return-decision-panel return-decision-recommendation mb-4" data-testid="return-ai-recommendation">
        <p className="text-[10px] uppercase tracking-wider tone-purple">Immutable AI recommendation</p>
        <p className="text-base font-semibold mt-1">{immutableRecommendation}{Number.isFinite(confidence) ? ` · ${Math.round(confidence * 100)}% confidence` : ''}</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-1">The reviewer decision is recorded separately and never overwrites this recommendation.</p>
      </div>

      <div className="return-decision-grid">
        <div className="space-y-4">
          <div className="return-decision-panel" data-testid="return-decision-draft">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2"><FileClock size={16} /> Reviewer proposal</p>
                <p className="text-[10px] font-mono text-[var(--color-text-dim)] mt-1">
                  {proposal ? `${proposalValue(proposal, 'proposalId', 'PROPOSAL_ID')} · version ${proposalValue(proposal, 'version', 'VERSION', 0)}` : 'No persisted proposal'}
                </p>
              </div>
              {proposalStatus && <span className="return-decision-status">{proposalStatus}</span>}
            </div>

            {!proposal && canMutate && decisionType && (
              <div className="return-decision-editable-hint" role="note" data-testid="return-decision-editable-hint">
                <span className="return-decision-editable-dot" aria-hidden="true" />
                <span><strong>Editable AI-assisted draft.</strong> Reviewer notes and customer response are prefilled from the recommendation. Changing the reviewer decision refreshes both drafts; edit them before saving.</span>
              </div>
            )}

            <label htmlFor="return-decision-type" className="block text-xs font-medium mb-1.5">Reviewer decision</label>
            <select id="return-decision-type" aria-describedby="return-decision-editable-description" value={decisionType} disabled={!canMutate || saving || confirming} onChange={(event) => {
              const nextDecision = event.target.value;
              const nextDraft = buildDecisionDraft(lifecycle.request || caseContext || {}, nextDecision);
              setDecisionType(nextDecision);
              setReviewerNotes(nextDraft.reviewerNotes);
              setCustomerResponse(nextDraft.customerResponse);
              setConfirmed(false);
            }}>
              <option value="">Select a decision</option>
              {DECISION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>

            <label htmlFor="return-reviewer-notes" className="block text-xs font-medium mt-3 mb-1.5">Reviewer notes</label>
            <textarea id="return-reviewer-notes" aria-describedby="return-decision-editable-description" value={reviewerNotes} disabled={!canMutate || saving || confirming} maxLength={4000} onChange={(event) => { setReviewerNotes(event.target.value); setConfirmed(false); }} placeholder="Record the human rationale that will be preserved with the final decision." />
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1 text-right">{reviewerNotes.length}/4000</p>

            <label htmlFor="return-customer-response" className="block text-xs font-medium mt-3 mb-1.5">Customer response</label>
            <textarea id="return-customer-response" aria-describedby="return-decision-editable-description" value={customerResponse} disabled={!canMutate || saving || confirming} maxLength={4000} onChange={(event) => { setCustomerResponse(event.target.value); setConfirmed(false); }} placeholder="Write the exact customer-facing response that will be preserved with the decision." />
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1 text-right">{customerResponse.length}/4000</p>
            <p id="return-decision-editable-description" className="sr-only">These are editable reviewer draft fields. Values are initially generated from the immutable AI recommendation and regenerated when the reviewer decision changes.</p>

            {!canMutate && (
              <p className="mt-3 text-xs flex items-start gap-2 text-[var(--color-text-dim)]" role="note" data-testid="return-decision-read-only">
                <LockKeyhole size={15} className="mt-0.5 flex-shrink-0" /> Decision history is read-only. Jessica Chen using the Admin persona must create, edit, and commit proposals.
              </p>
            )}

            {canMutate && (
              <div className="flex flex-wrap gap-2 mt-3">
                <JetButton label={saving ? 'Saving draft...' : proposal ? 'Save draft changes' : 'Create decision draft'} chroming="outlined" iconClass="oj-fwk-icon oj-fwk-icon-save" disabled={saving || confirming || !decisionType || !customerResponse.trim()} onAction={saveDraft} />
              </div>
            )}
          </div>

          {canMutate && proposal && proposalStatus === 'DRAFT' && (
            <div className="return-decision-alert" data-testid="return-decision-confirmation">
              <p className="text-sm font-semibold flex items-center gap-2"><ShieldCheck size={16} /> Final decision confirmation</p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">This commits the reviewer decision, customer response, provenance, status, and event atomically. It is not an AI action and cannot be edited afterward.</p>
              <label className="flex items-start gap-2 mt-3 text-xs cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={confirmed} disabled={confirming} onChange={(event) => setConfirmed(event.target.checked)} />
                I, Jessica Chen, confirm this final decision and its customer response.
              </label>
              <div className="mt-3">
                <JetButton label={confirming ? 'Committing decision...' : 'Confirm and commit final decision'} chroming="callToAction" iconClass="oj-fwk-icon oj-fwk-icon-check" disabled={!confirmed || confirming} onAction={commit} />
              </div>
              {confirming && <p className="mt-2 text-xs text-[var(--color-text-dim)] flex items-center gap-2"><JetProgressCircle value={-1} size="sm" /> Committing one governed Oracle transaction...</p>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="return-decision-panel">
            <p className="text-sm font-semibold flex items-center gap-2 mb-3"><History size={16} /> Decision and event history</p>
            <Timeline lifecycle={lifecycle} />
          </div>
          <div className="return-decision-panel">
            <p className="text-sm font-semibold flex items-center gap-2 mb-3"><ShieldCheck size={16} /> Immutable provenance</p>
            <Provenance records={lifecycle.provenance} />
          </div>
        </div>
      </div>
    </section>
  );
}

export {
  IDEMPOTENCY_CODES,
  STALE_CODES,
  UNAVAILABLE_CODES,
  describeError,
  newDecisionRequestId,
  normalizeLifecycle,
};
