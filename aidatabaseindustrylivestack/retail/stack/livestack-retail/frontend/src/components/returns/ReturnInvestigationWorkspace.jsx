import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  History,
  MessageSquareText,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { JetButton, JetProgressCircle } from '../JetControls';
import { returnInvestigationApi } from '../../utils/returnInvestigationApi';
import './ReturnInvestigationWorkspace.css';

const STALE_CODES = new Set([
  'RETURN_INVESTIGATION_GENERATION_STALE',
  'RETURN_INVESTIGATION_VERSION_CONFLICT',
]);

const FALLBACK_MODES = new Set(['deterministic_fallback', 'fallback']);
const SUGGESTED_QUESTIONS = Object.freeze([
  'What evidence supports or contradicts the recommendation?',
  'Which return policy clause applies, and what does it require?',
  'What serial, accessory, or inspection evidence was found?',
  'What happened in this return case, in timeline order?',
  'How does this customer’s prior return history affect the review?',
]);
const DEFAULT_QUESTION = SUGGESTED_QUESTIONS[0];

function newClientRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `return-turn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function returnLabel(returnId) {
  return Number(returnId) > 0
    ? `RET-${String(returnId).padStart(4, '0')}`
    : 'No return selected';
}

function normalizeInvestigations(payload) {
  const values = Array.isArray(payload) ? payload : payload?.investigations;
  return (Array.isArray(values) ? values : [])
    .filter((item) => item?.investigationId)
    .sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
}

function chronologicalTurns(values) {
  return [...(Array.isArray(values) ? values : [])]
    .sort((left, right) => Number(left.turnNumber || 0) - Number(right.turnNumber || 0));
}

function mergeTurn(turns, incoming) {
  if (!incoming?.turnId) return chronologicalTurns(turns);
  const byId = new Map(turns.map((turn) => [turn.turnId, turn]));
  byId.set(incoming.turnId, incoming);
  return chronologicalTurns([...byId.values()]);
}

function assertInvestigationIdentity(investigation, selectedReturnId, personaKey) {
  if (!investigation || Number(investigation.returnId) !== Number(selectedReturnId)) {
    const error = new Error('The persisted investigation does not belong to the selected return.');
    error.code = 'RETURN_INVESTIGATION_RETURN_MISMATCH';
    throw error;
  }
  if (personaKey && investigation.ownerUsername
      && String(investigation.ownerUsername).toLowerCase() !== String(personaKey).toLowerCase()) {
    const error = new Error('The persisted investigation does not belong to the selected persona.');
    error.code = 'RETURN_INVESTIGATION_OWNER_MISMATCH';
    throw error;
  }
  return investigation;
}

function errorView(error) {
  if (!error) return null;
  if (error.code === 'RETURN_INVESTIGATION_GENERATION_STALE') {
    return {
      kind: 'generation',
      title: 'Investigation belongs to an earlier dataset',
      message: 'Start a new investigation for the active Retail dataset. Earlier turns will not be rebound silently.',
    };
  }
  if (error.code === 'RETURN_INVESTIGATION_VERSION_CONFLICT') {
    return {
      kind: 'version',
      title: 'This investigation changed',
      message: 'Reload its persisted turns before sending the question again.',
    };
  }
  if (error.code === 'RETURN_INVESTIGATION_SCHEMA_UNAVAILABLE') {
    return {
      kind: 'unavailable',
      title: 'Persisted investigations are not installed',
      message: error.message,
    };
  }
  if (error.code === 'RETURN_INVESTIGATION_ORCHESTRATOR_UNAVAILABLE') {
    return {
      kind: 'unavailable',
      title: 'Investigation search is not connected',
      message: error.message,
    };
  }
  return {
    kind: 'error',
    title: 'Investigation request failed',
    message: error.message || 'The persisted investigation could not complete.',
  };
}

function EvidenceDetails({ evidence = [] }) {
  if (!evidence.length) return null;
  return (
    <details className="mt-3 text-xs" data-testid="return-investigation-evidence">
      <summary className="cursor-pointer font-medium">Inspect cited evidence ({evidence.length})</summary>
      <div className="return-investigation-evidence-grid mt-2">
        {evidence.map((item, index) => (
          <div key={item.id || item.citation || index} className="rounded-lg border border-[var(--color-border)] p-3">
            <p className="text-[10px] uppercase tracking-wider tone-sienna">{item.sourceType || item.sourceCode || 'Evidence'}</p>
            <p className="text-sm font-medium mt-1">{item.title || 'Return evidence'}</p>
            {item.text && <p className="mt-1 text-[var(--color-text-dim)] leading-relaxed">{item.text}</p>}
            {item.citation && <p className="mt-2 font-mono text-[10px]">{item.citation}</p>}
          </div>
        ))}
      </div>
    </details>
  );
}

function InvestigationSignals({ payload, onSuggestion }) {
  const investigation = payload?.investigation || {};
  const conflicts = investigation.conflicts || [];
  const gaps = investigation.gaps || [];
  const suggestions = investigation.suggestions || [];
  const clarification = payload?.clarification;

  return (
    <>
      {clarification && (
        <div className="return-investigation-alert mt-3" data-testid="return-investigation-clarification">
          <p className="text-xs font-semibold flex items-center gap-2"><MessageSquareText size={15} /> Clarification needed</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {(clarification.choices || []).map((choice) => (
              <button key={choice} type="button" className="min-h-11 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs" onClick={() => onSuggestion(choice)}>
                {choice}
              </button>
            ))}
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="return-investigation-alert mt-3" data-testid="return-investigation-conflicts">
          <p className="text-xs font-semibold flex items-center gap-2"><ShieldAlert size={15} /> Conflicting evidence</p>
          <div className="space-y-2 mt-2">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <p className="text-sm font-medium">{conflict.topic}</p>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">{conflict.message}</p>
                {(conflict.assertions || []).map((assertion) => (
                  <p key={`${conflict.id}-${assertion.citation}`} className="mt-2 text-xs">
                    <span className="font-mono">{assertion.citation}</span> — {assertion.excerpt}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="return-investigation-alert mt-3" data-testid="return-investigation-gaps">
          <p className="text-xs font-semibold flex items-center gap-2"><AlertTriangle size={15} /> Incomplete evidence</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--color-text-dim)]">
            {gaps.map((gap) => <li key={gap.id}>• {gap.message}</li>)}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3" aria-label="Suggested investigation follow-ups">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="min-h-11 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs text-left" onClick={() => onSuggestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function TurnCard({ turn, onSuggestion }) {
  const payload = turn.answerPayload || {};
  const fallbackMode = payload.synthesis?.mode || payload.synthesisMode || payload.mode;
  return (
    <article className="space-y-2" data-turn-id={turn.turnId}>
      <div className="return-investigation-turn return-investigation-question">
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Question {turn.turnNumber}</p>
        <p className="text-sm mt-1">{turn.question}</p>
        {turn.routeMetadata?.followup && (
          <p className="mt-2 text-[10px] tone-teal">Follow-up resolved from turn {turn.routeMetadata.inheritedFromTurnId}</p>
        )}
      </div>
      <div className="return-investigation-turn">
        <div className="flex items-start gap-2">
          {turn.status === 'AMBIGUOUS'
            ? <AlertTriangle size={16} className="tone-sienna mt-0.5" />
            : <CheckCircle2 size={16} className="tone-teal mt-0.5" />}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {turn.status === 'AMBIGUOUS' ? 'Needs clarification' : 'Persisted grounded answer'}
            </p>
            <p className="text-sm leading-relaxed mt-1">{payload.answer || payload.summary || 'No answer text was stored.'}</p>
          </div>
        </div>
        {FALLBACK_MODES.has(String(fallbackMode || '').toLowerCase()) && (
          <p className="mt-3 text-xs tone-sienna" data-testid="return-investigation-fallback">
            Model synthesis was unavailable or rejected; this persisted turn uses the deterministic Oracle-grounded fallback.
          </p>
        )}
        <InvestigationSignals payload={payload} onSuggestion={onSuggestion} />
        <EvidenceDetails evidence={turn.evidenceMetadata || []} />
      </div>
    </article>
  );
}

export default function ReturnInvestigationWorkspace({
  returnId,
  generationKey,
  caseContext = null,
  personaKey = null,
  datasetRevision = 0,
  apiClient = returnInvestigationApi,
  onInvestigationChange = null,
}) {
  const [investigations, setInvestigations] = useState([]);
  const [active, setActive] = useState(null);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [listLoading, setListLoading] = useState(false);
  const [turnLoading, setTurnLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestGeneration = useRef(0);
  const selectedReturnId = Number(returnId);
  const selectedLabel = returnLabel(selectedReturnId);
  const resetKey = `${generationKey || ''}:${personaKey || ''}:${datasetRevision}:${selectedReturnId || ''}`;

  const loadList = useCallback(async ({ selectId = null } = {}) => {
    if (!Number.isInteger(selectedReturnId) || selectedReturnId <= 0) return;
    const requestId = ++requestGeneration.current;
    setListLoading(true);
    setError(null);
    try {
      const rows = normalizeInvestigations(await apiClient.list(selectedReturnId))
        .filter((item) => Number(item.returnId) === selectedReturnId)
        .filter((item) => !personaKey || !item.ownerUsername
          || String(item.ownerUsername).toLowerCase() === String(personaKey).toLowerCase());
      if (requestId !== requestGeneration.current) return;
      setInvestigations(rows);
      const target = selectId || rows.find((item) => item.status === 'ACTIVE')?.investigationId;
      if (target) {
        const loaded = assertInvestigationIdentity(
          await apiClient.load(target),
          selectedReturnId,
          personaKey
        );
        if (requestId !== requestGeneration.current) return;
        setActive({ ...loaded, turns: chronologicalTurns(loaded.turns) });
        onInvestigationChange?.(loaded);
      } else {
        setActive(null);
        onInvestigationChange?.(null);
      }
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setListLoading(false);
    }
  }, [apiClient, onInvestigationChange, personaKey, selectedReturnId]);

  useEffect(() => {
    requestGeneration.current += 1;
    setInvestigations([]);
    setActive(null);
    setQuestion(DEFAULT_QUESTION);
    setError(null);
    setListLoading(false);
    setTurnLoading(false);
    setArchiveLoading(false);
    if (Number.isInteger(selectedReturnId) && selectedReturnId > 0) loadList();
    return () => { requestGeneration.current += 1; };
  }, [resetKey, loadList, selectedReturnId]);

  const createInvestigation = useCallback(async () => {
    if (!Number.isInteger(selectedReturnId) || selectedReturnId <= 0) return null;
    const requestId = ++requestGeneration.current;
    setTurnLoading(true);
    setError(null);
    try {
      const created = assertInvestigationIdentity(await apiClient.create({
        returnId: selectedReturnId,
        title: `${selectedLabel}${caseContext?.PRODUCT_NAME ? ` · ${caseContext.PRODUCT_NAME}` : ''}`,
      }), selectedReturnId, personaKey);
      if (requestId !== requestGeneration.current) return null;
      const normalized = { ...created, turns: chronologicalTurns(created.turns) };
      setActive(normalized);
      setInvestigations((current) => normalizeInvestigations([normalized, ...current]));
      onInvestigationChange?.(normalized);
      return normalized;
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
      return null;
    } finally {
      if (requestId === requestGeneration.current) setTurnLoading(false);
    }
  }, [apiClient, caseContext?.PRODUCT_NAME, onInvestigationChange, personaKey, selectedLabel, selectedReturnId]);

  const loadInvestigation = useCallback(async (investigationId) => {
    const requestId = ++requestGeneration.current;
    setListLoading(true);
    setError(null);
    try {
      const loaded = assertInvestigationIdentity(
        await apiClient.load(investigationId),
        selectedReturnId,
        personaKey
      );
      if (requestId !== requestGeneration.current) return;
      const normalized = { ...loaded, turns: chronologicalTurns(loaded.turns) };
      setActive(normalized);
      onInvestigationChange?.(normalized);
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setListLoading(false);
    }
  }, [apiClient, onInvestigationChange, personaKey, selectedReturnId]);

  const submitQuestion = useCallback(async (questionText) => {
    const askedQuestion = String(questionText || '').replace(/\s+/g, ' ').trim();
    if (!askedQuestion || turnLoading) return;
    const requestId = ++requestGeneration.current;
    setTurnLoading(true);
    setError(null);
    let investigation = active;
    try {
      if (!investigation) {
        investigation = assertInvestigationIdentity(await apiClient.create({
          returnId: selectedReturnId,
          title: `${selectedLabel}${caseContext?.PRODUCT_NAME ? ` · ${caseContext.PRODUCT_NAME}` : ''}`,
        }), selectedReturnId, personaKey);
      }
      if (requestId !== requestGeneration.current) return;
      const result = await apiClient.submitTurn(investigation.investigationId, {
        question: askedQuestion,
        clientRequestId: newClientRequestId(),
        expectedVersion: Number(investigation.version || 0),
        returnId: selectedReturnId,
      });
      if (requestId !== requestGeneration.current) return;
      assertInvestigationIdentity(result.investigation, selectedReturnId, personaKey);
      const next = {
        ...investigation,
        ...result.investigation,
        turns: mergeTurn(investigation.turns || [], result.turn),
      };
      setActive(next);
      setInvestigations((current) => normalizeInvestigations([
        next,
        ...current.filter((item) => item.investigationId !== next.investigationId),
      ]));
      setQuestion('');
      onInvestigationChange?.(next);
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setTurnLoading(false);
    }
  }, [active, apiClient, caseContext?.PRODUCT_NAME, onInvestigationChange, personaKey, selectedLabel, selectedReturnId, turnLoading]);

  const archiveActive = useCallback(async () => {
    if (!active || archiveLoading) return;
    const requestId = ++requestGeneration.current;
    setArchiveLoading(true);
    setError(null);
    try {
      await apiClient.archive(active.investigationId, Number(active.version || 0));
      if (requestId !== requestGeneration.current) return;
      setActive(null);
      onInvestigationChange?.(null);
      setArchiveLoading(false);
      await loadList();
    } catch (nextError) {
      if (requestId === requestGeneration.current) setError(nextError);
    } finally {
      if (requestId === requestGeneration.current) setArchiveLoading(false);
    }
  }, [active, apiClient, archiveLoading, loadList, onInvestigationChange]);

  const visibleError = errorView(error);
  const activeTurns = useMemo(() => chronologicalTurns(active?.turns), [active?.turns]);

  if (!Number.isInteger(selectedReturnId) || selectedReturnId <= 0) {
    return (
      <div className="glass-card p-5 text-sm text-[var(--color-text-dim)]" data-testid="return-investigation-no-case">
        Select a return before starting an evidence investigation.
      </div>
    );
  }

  return (
    <section className="return-investigation-workspace glass-card p-5" aria-labelledby="return-investigation-title">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 id="return-investigation-title" className="text-base font-semibold flex items-center gap-2">
            <History size={17} className="tone-teal" /> Return evidence investigation
          </h3>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            Persistent, VPD-scoped follow-ups for {selectedLabel}. Answers stay bound to this return, user, and dataset generation.
          </p>
          <p className="text-[10px] font-mono text-[var(--color-text-dim)] mt-1" data-testid="return-investigation-identity">
            {selectedLabel}{caseContext?.PRODUCT_NAME ? ` · ${caseContext.PRODUCT_NAME}` : ''}{personaKey ? ` · ${personaKey}` : ''}
          </p>
        </div>
        <JetButton label="New investigation" chroming="outlined" iconClass="oj-fwk-icon oj-fwk-icon-plus" disabled={turnLoading} onAction={createInvestigation} />
      </div>

      {visibleError && (
        <div className="return-investigation-alert mb-4" data-tone={visibleError.kind === 'error' ? 'danger' : 'warning'} role="alert" data-testid={`return-investigation-error-${visibleError.kind}`}>
          <p className="text-sm font-semibold">{visibleError.title}</p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">{visibleError.message}</p>
          {STALE_CODES.has(error?.code) && (
            <div className="flex flex-wrap gap-2 mt-3">
              <JetButton label="Reload persisted turns" chroming="outlined" iconClass="oj-fwk-icon oj-fwk-icon-refresh" onAction={() => active ? loadInvestigation(active.investigationId) : loadList()} />
              {error.code === 'RETURN_INVESTIGATION_GENERATION_STALE' && (
                <JetButton label="Start fresh investigation" chroming="callToAction" iconClass="oj-fwk-icon oj-fwk-icon-plus" onAction={createInvestigation} />
              )}
            </div>
          )}
        </div>
      )}

      <div className="return-investigation-layout">
        <aside className="return-investigation-sidebar">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold">Saved investigations</p>
            <button type="button" className="p-2 rounded-lg border border-[var(--color-border)]" aria-label="Refresh investigations" onClick={() => loadList()} disabled={listLoading}>
              <RefreshCw size={14} className={listLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {listLoading && !investigations.length ? (
            <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-text-dim)]" role="status">
              <JetProgressCircle value={-1} size="sm" /> Loading investigations...
            </div>
          ) : investigations.length ? (
            <div className="return-investigation-list">
              {investigations.map((item) => (
                <button
                  key={item.investigationId}
                  type="button"
                  className="return-investigation-list-button"
                  aria-current={item.investigationId === active?.investigationId ? 'true' : 'false'}
                  onClick={() => loadInvestigation(item.investigationId)}
                >
                  <span className="block text-sm font-medium">{item.title || selectedLabel}</span>
                  <span className="block text-[10px] text-[var(--color-text-dim)] mt-1">
                    {item.status} · {item.version || 0} turn{Number(item.version || 0) === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] p-4 text-xs text-[var(--color-text-dim)]">
              No persisted investigation exists for this return and persona.
            </div>
          )}
        </aside>

        <div className="return-investigation-thread">
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <p className="text-sm font-semibold">{active.title || selectedLabel}</p>
                  <p className="text-[10px] font-mono text-[var(--color-text-dim)]">
                    {active.investigationId} · version {active.version} · {active.generationId}
                  </p>
                </div>
                <JetButton label={archiveLoading ? 'Archiving...' : 'Archive'} chroming="outlined" iconClass="oj-fwk-icon oj-fwk-icon-trash" disabled={archiveLoading || turnLoading} onAction={archiveActive} />
              </div>
              {activeTurns.length ? (
                <div className="return-investigation-turns" aria-live="polite" data-testid="return-investigation-turns">
                  {activeTurns.map((turn) => <TurnCard key={turn.turnId} turn={turn} onSuggestion={setQuestion} />)}
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--color-border)] p-5 text-center text-sm text-[var(--color-text-dim)]">
                  <FileSearch size={20} className="mx-auto mb-2 tone-teal" />
                  Ask the first question about this return file.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-[var(--color-border)] p-6 text-center">
              <Plus size={22} className="mx-auto mb-2 tone-teal" />
              <p className="text-sm font-medium">Start a persistent investigation</p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">Follow-up questions will retain validated routing and evidence context.</p>
            </div>
          )}

          <div className="return-investigation-composer mt-4">
            <label htmlFor="return-investigation-question" className="block text-xs font-medium mb-1.5">Question about {selectedLabel}</label>
            <textarea
              id="return-investigation-question"
              value={question}
              maxLength={500}
              disabled={turnLoading}
              placeholder="Ask a question, then follow up on the persisted answer..."
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitQuestion(question);
              }}
            />
            <div className="return-investigation-suggestions" aria-label="Suggested investigation questions">
              <p className="return-investigation-suggestions-label">Suggested questions</p>
              <div className="return-investigation-suggestions-list">
                {SUGGESTED_QUESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="return-investigation-suggestion"
                    disabled={turnLoading}
                    aria-label={`Use suggested question: ${suggestion}`}
                    onClick={() => setQuestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <p className="text-[10px] text-[var(--color-text-dim)]">Ctrl/⌘ + Enter to send · {question.length}/500</p>
              <JetButton label={turnLoading ? 'Saving turn...' : 'Ask and persist'} chroming="callToAction" iconClass="oj-fwk-icon oj-fwk-icon-magnifier" disabled={turnLoading || !question.trim()} onAction={() => submitQuestion(question)} />
            </div>
            {turnLoading && (
              <div className="flex items-center gap-2 mt-3 text-xs text-[var(--color-text-dim)]" role="status">
                <JetProgressCircle value={-1} size="sm" /> Retrieving evidence and committing this turn atomically...
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export {
  STALE_CODES,
  chronologicalTurns,
  assertInvestigationIdentity,
  errorView,
  mergeTurn,
  newClientRequestId,
  normalizeInvestigations,
};
