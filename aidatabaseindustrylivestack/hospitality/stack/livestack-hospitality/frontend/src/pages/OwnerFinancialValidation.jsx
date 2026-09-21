import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, ClipboardCheck, Database, FileText,
  HelpCircle, RefreshCw, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../utils/api';
import { useUser } from '../context/UserContext';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetButton, JetSelectSingle } from '../components/JetControls';
import { SceneStoryPanel } from '../components/HospitalityStory';

const EMPTY_FILTERS = {
  period: '', region: '', propertyId: '', ownerId: '', status: '',
  severity: '', metricCategory: '', threshold: '1.5',
};
const SEVERITY_COLORS = {
  CRITICAL: '#A73529', HIGH: '#8A4E2F', MEDIUM: '#A36472', LOW: '#4F7D7B',
};
const CATEGORY_COLORS = ['#A73529', '#8A4E2F', '#437C94', '#4F7D7B'];
const ACTIONS = [
  { value: 'OWNER_VALIDATE', label: 'Owner validates exception', tone: 'primary' },
  { value: 'REQUEST_CORRECTION', label: 'Request correction' },
  { value: 'TIMING_DIFFERENCE', label: 'Mark as timing difference' },
  { value: 'ESCALATE_FINANCE', label: 'Escalate to finance' },
  { value: 'ADD_NOTE', label: 'Add note' },
];

function currency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

function optionRows(rows = []) {
  return [
    { value: '', label: 'All' },
    ...rows.map((row) => ({
      value: String(row.VALUE ?? ''),
      label: String(row.LABEL ?? row.VALUE ?? ''),
    })),
  ];
}

function compactFilters(filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
}

function severityClass(severity) {
  return `financial-severity financial-severity--${String(severity || 'low').toLowerCase()}`;
}

function aiStatusLabel(status) {
  return {
    PENDING: 'AI queued',
    PROCESSING: 'AI enriching',
    COMPLETED: 'AI assisted',
    FAILED: 'Rule fallback',
    NOT_REQUESTED: 'Rule rationale',
  }[status] || 'Rule rationale';
}

function Modal({ title, eyebrow, onClose, children, wide = false }) {
  const closeRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const dialog = closeRef.current?.closest('[role="dialog"]');
        const focusable = dialog?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="financial-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className={`financial-modal ${wide ? 'financial-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-modal-title"
      >
        <header className="financial-modal__header">
          <div>
            {eyebrow && <p className="section-kicker">{eyebrow}</p>}
            <h2 id="financial-modal-title">{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="financial-icon-button" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="financial-modal__body">{children}</div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = '#437C94' }) {
  return (
    <article className="stat-card financial-kpi" style={{ borderTopColor: tone }}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <article className={`glass-card financial-chart-card ${className}`}>
      <header>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div className="financial-chart-card__canvas">{children}</div>
    </article>
  );
}

function EmptyChart({ children = 'No matching Oracle data for these filters.' }) {
  return <div className="financial-empty-chart">{children}</div>;
}

function DetailDefinition({ label, value, mono = false }) {
  return (
    <div className="financial-definition">
      <dt>{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value ?? '—'}</dd>
    </div>
  );
}

export default function OwnerFinancialValidation() {
  const { currentUser } = useUser();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [summaryData, setSummaryData] = useState(null);
  const [exceptionsData, setExceptionsData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [internals, setInternals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [overlay, setOverlay] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionNote, setActionNote] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [aiProgress, setAiProgress] = useState(null);
  const aiPollTimerRef = useRef(null);
  const aiPollVersionRef = useRef(0);
  const detailExceptionIdRef = useRef(null);

  const params = useMemo(() => compactFilters(filters), [filters]);

  const loadAll = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [summary, exceptions, charts, internalData] = await Promise.all([
        api.financialValidation.summary(params),
        api.financialValidation.exceptions(params),
        api.financialValidation.charts(params),
        api.financialValidation.internals(),
      ]);
      setSummaryData(summary);
      setExceptionsData(exceptions);
      setChartData(charts);
      setInternals(internalData);
    } catch (err) {
      setError(err.message || 'Unable to load owner financial validation data.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAll(), 180);
    return () => window.clearTimeout(timer);
  }, [loadAll, currentUser?.USERNAME]);

  const summary = summaryData?.summary || {};
  const submissions = summaryData?.submissions || [];
  const exceptions = exceptionsData?.exceptions || [];
  const selectedSubmission = submissions[0] || null;
  const filterOptions = summaryData?.filters || {};

  useEffect(() => {
    detailExceptionIdRef.current = detail?.exception?.EXCEPTION_ID || null;
  }, [detail?.exception?.EXCEPTION_ID]);

  const startAiPolling = useCallback((jobIds) => {
    const ids = [...new Set((jobIds || []).map(Number).filter(Number.isFinite))];
    if (!ids.length) return;
    aiPollVersionRef.current += 1;
    const version = aiPollVersionRef.current;
    if (aiPollTimerRef.current) window.clearTimeout(aiPollTimerRef.current);
    let lastCompleted = -1;
    let lastFailed = -1;

    const poll = async () => {
      try {
        const progress = await api.financialValidation.aiJobs({ jobIds: ids });
        if (version !== aiPollVersionRef.current) return;
        setAiProgress({ ...progress, jobIds: ids });
        const completed = Number(progress.statusCounts?.COMPLETED || 0);
        const failed = Number(progress.statusCounts?.FAILED || 0);
        if (lastCompleted >= 0 && (completed !== lastCompleted || failed !== lastFailed)) {
          await loadAll({ quiet: true });
        }
        lastCompleted = completed;
        lastFailed = failed;

        if (progress.allTerminal) {
          await loadAll({ quiet: true });
          const openExceptionId = detailExceptionIdRef.current;
          if (openExceptionId && progress.jobs.some((job) => Number(job.EXCEPTION_ID) === Number(openExceptionId))) {
            setDetail(await api.financialValidation.exceptionDetail(openExceptionId));
          }
          return;
        }
      } catch (err) {
        if (version !== aiPollVersionRef.current) return;
        setAiProgress((current) => ({ ...current, jobIds: ids, pollingError: err.message || 'AI job status is temporarily unavailable.' }));
      }
      if (version === aiPollVersionRef.current) {
        aiPollTimerRef.current = window.setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
  }, [loadAll]);

  useEffect(() => () => {
    aiPollVersionRef.current += 1;
    if (aiPollTimerRef.current) window.clearTimeout(aiPollTimerRef.current);
  }, []);

  useEffect(() => {
    const submissionId = selectedSubmission?.SUBMISSION_ID;
    if (!submissionId) return undefined;
    let cancelled = false;
    void api.financialValidation.aiJobs({ submissionId }).then((progress) => {
      if (cancelled) return;
      const activeIds = progress.jobs
        .filter((job) => ['PENDING', 'PROCESSING'].includes(job.JOB_STATUS))
        .map((job) => job.JOB_ID);
      if (activeIds.length) startAiPolling(activeIds);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSubmission?.SUBMISSION_ID, startAiPolling]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value == null ? '' : String(value) }));
  };

  const openDetail = useCallback(async (exceptionId) => {
    setOverlay({ type: 'detail', title: 'Validation exception' });
    setDetail(null);
    setDetailLoading(true);
    setActionNote('');
    try {
      setDetail(await api.financialValidation.exceptionDetail(exceptionId));
    } catch (err) {
      setError(err.message || 'Unable to load exception evidence.');
      setOverlay(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const runValidation = async () => {
    setWorking('validation');
    setNotice('');
    setError('');
    try {
      const result = await api.financialValidation.run({
        submissionId: selectedSubmission?.SUBMISSION_ID,
        filters: params,
        threshold: Number(filters.threshold),
        actor: currentUser?.USERNAME,
      });
      setNotice(result.message || `${result.validated} submission${result.validated === 1 ? '' : 's'} validated in Oracle. Human attestation is still required.`);
      await loadAll({ quiet: true });
      const jobIds = (result.aiJobs || []).map((job) => job.JOB_ID);
      if (jobIds.length) startAiPolling(jobIds);
    } catch (err) {
      setError(err.message || 'AI-assisted validation failed.');
    } finally {
      setWorking('');
    }
  };

  const generateCloseNote = async () => {
    if (!selectedSubmission?.SUBMISSION_ID) {
      setError('Select a submission before generating an owner close note.');
      return;
    }
    setWorking('close-note');
    setError('');
    try {
      const result = await api.financialValidation.closeNote(selectedSubmission.SUBMISSION_ID, currentUser?.USERNAME);
      setCloseNote(result.note);
      setOverlay({
        type: 'close-note',
        title: 'Generated owner close note',
        source: result.source,
        propertyName: result.propertyName || selectedSubmission.PROPERTY_NAME,
        fiscalPeriodLabel: result.fiscalPeriodLabel || selectedSubmission.FISCAL_PERIOD_LABEL,
      });
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message || 'Unable to generate the owner close note.');
    } finally {
      setWorking('');
    }
  };

  const takeAction = async (actionType) => {
    const exceptionId = detail?.exception?.EXCEPTION_ID;
    if (!exceptionId) return;
    setWorking(`action-${actionType}`);
    setError('');
    try {
      await api.financialValidation.takeAction(exceptionId, {
        actionType,
        note: actionNote,
        actor: currentUser?.USERNAME,
      });
      setNotice('Owner decision persisted to Oracle and appended to the audit trail.');
      const refreshed = await api.financialValidation.exceptionDetail(exceptionId);
      setDetail(refreshed);
      setActionNote('');
      await loadAll({ quiet: true });
    } catch (err) {
      setError(err.message || 'Unable to persist the owner action.');
    } finally {
      setWorking('');
    }
  };

  const varianceByMetric = (chartData?.varianceByMetric || []).map((row) => ({
    category: row.CATEGORY,
    variance: Number(row.VARIANCE || 0),
    absoluteVariance: Number(row.ABSOLUTE_VARIANCE || 0),
  }));
  const revenueTrend = (chartData?.revenueTrend || []).map((row) => ({
    period: row.PERIOD,
    submitted: Number(row.SUBMITTED || 0),
    expected: Number(row.EXPECTED || 0),
  }));
  const severityDistribution = (chartData?.severityDistribution || []).map((row) => ({
    name: row.SEVERITY,
    value: Number(row.EXCEPTION_COUNT || 0),
  }));
  const waterfall = (chartData?.reconciliationWaterfall || []).map((row) => ({
    step: row.STEP,
    value: Number(row.VALUE || 0),
    kind: row.KIND,
  }));
  const aiCounts = aiProgress?.statusCounts || {};
  const aiPending = Number(aiCounts.PENDING || 0);
  const aiProcessing = Number(aiCounts.PROCESSING || 0);
  const aiCompleted = Number(aiCounts.COMPLETED || 0);
  const aiFailed = Number(aiCounts.FAILED || 0);
  const aiProgressMessage = aiProgress?.pollingError
    ? `${aiProgress.pollingError} Retrying without blocking owner review.`
    : aiPending + aiProcessing > 0
      ? `${aiCompleted} AI assisted · ${aiProcessing} enriching · ${aiPending} queued. Oracle validation is complete and owner review remains available.`
      : `AI enrichment finished: ${aiCompleted} AI assisted · ${aiFailed} retained governed rule fallback. No exception was auto-attested.`;

  const renderOverlay = () => {
    if (!overlay) return null;
    const close = () => setOverlay(null);
    if (overlay.type === 'how') {
      return (
        <Modal title="How validation works" eyebrow="Governed comparison" onClose={close}>
          <div className="financial-explainer-flow">
            <DiagramBox label="Owner-reported close" sub="Revenue · fees · adjustments · close inputs" color="#8A4E2F" />
            <DiagramBox label="Oracle governed evidence" sub="Reservations · folio lines · property metadata · rules" color="#437C94" />
            <DiagramBox label="Versioned validation run" sub="PL/SQL calculations · JSON evidence · severity" color="#796087" />
            <DiagramBox label="Owner reviews exceptions" sub="Validate · correct · time · escalate · note" color="#3E6F4D" />
          </div>
          <p>Oracle assembles the reconciliation. AI explains likely exceptions, but it cannot attest or silently resolve them. Only an explicit owner or finance action changes an exception status, and every action receives an audit ID.</p>
        </Modal>
      );
    }
    if (overlay.type === 'formula') {
      return (
        <Modal title="Room revenue formula" eyebrow="Expected value" onClose={close}>
          <div className="financial-formula">Expected room revenue = Σ governed folio line amount</div>
          <p>Scope: non-cancelled reservation folio lines for the selected property and fiscal month. The synthetic demo uses <code>ORDERS</code>, <code>ORDER_ITEMS.LINE_TOTAL</code>, and <code>PRODUCTS.BRAND_ID</code>. If a seeded historical month has no folio activity, the package uses a governed property run-rate fallback based on active revenue centers and property metadata.</p>
          <SqlBlock code={`-- Run as LIVESTACK. Uses the latest populated reservation month.
BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/

SELECT ROUND(SUM(oi.line_total), 2) AS expected_room_revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE p.brand_id = (SELECT MIN(brand_id) FROM brands)
  AND TRUNC(CAST(o.created_at AS DATE), 'MM') =
      (SELECT MAX(TRUNC(CAST(created_at AS DATE), 'MM')) FROM orders)
  AND o.order_status NOT IN ('cancelled','returned');`} />
        </Modal>
      );
    }
    if (overlay.type === 'fee-rule') {
      const exception = detail?.exception;
      return (
        <Modal title="Fee validation rule" eyebrow="Governed rule" onClose={close}>
          <dl className="financial-definition-grid">
            <DetailDefinition label="Rule" value={exception?.RULE_NAME || 'Synthetic management fee at governed rate'} />
            <DetailDefinition label="Fee basis" value={exception?.BASIS_DESCRIPTION || 'Governed room revenue'} />
            <DetailDefinition label="Tolerance" value={`${number(exception?.TOLERANCE_PCT || 2, 2)}% or ${currency(exception?.TOLERANCE_AMOUNT || 100)}`} />
            <DetailDefinition label="Demo rate" value={`${number(exception?.RATE_PCT || 3, 2)}%`} />
          </dl>
          <p>Severity is determined by the variance outside tolerance: 20%+ Critical, 10%+ High, 5%+ Medium, then the rule&apos;s severity floor. These are synthetic demonstration rules—not production policy.</p>
        </Modal>
      );
    }
    if (overlay.type === 'ai-rationale') {
      const exception = detail?.exception;
      return (
        <Modal title="AI rationale" eyebrow="Explainable assistance" onClose={close}>
          <div className="financial-rationale"><Sparkles size={18} aria-hidden="true" />{exception?.AI_RATIONALE || 'Choose an exception to see its rule-grounded explanation.'}</div>
          <dl className="financial-definition-grid">
            <DetailDefinition label="Generation state" value={aiStatusLabel(exception?.AI_STATUS)} />
            <DetailDefinition label="Rationale source" value={exception?.AI_SOURCE || 'deterministic-rule-fallback'} />
            <DetailDefinition label="Model" mono value={exception?.AI_MODEL || 'No model requested'} />
            <DetailDefinition label="Latency" value={exception?.AI_LATENCY_MS == null ? '—' : `${number(exception.AI_LATENCY_MS)} ms`} />
          </dl>
          <p>The rationale is stored with the versioned Oracle validation result. It is decision support only; it cannot perform owner attestation.</p>
        </Modal>
      );
    }
    if (overlay.type === 'evidence') {
      const evidence = detail?.exception?.EVIDENCE_JSON;
      return (
        <Modal title="Oracle evidence" eyebrow="Traceable source" onClose={close} wide>
          <dl className="financial-definition-grid">
            <DetailDefinition label="Query name" mono value={evidence?.queryName || 'OWNER_FIN_GOVERNED_EXPECTATION_V1'} />
            <DetailDefinition label="Package" mono value={internals?.objects?.package || 'OWNER_FIN_VALIDATION_PKG'} />
            <DetailDefinition label="Evidence records" value={evidence?.evidenceCount ?? detail?.exception?.EVIDENCE_COUNT ?? 'Available in exception detail'} />
            <DetailDefinition label="Audit stores" mono value={(internals?.objects?.audit || []).join(' · ')} />
          </dl>
          <p className="text-sm text-[var(--color-text-dim)]">Source objects</p>
          <div className="flex flex-wrap gap-2">
            {(evidence?.sourceObjects || internals?.objects?.tables || []).map((name) => <FeatureBadge key={name} label={name} color="blue" />)}
          </div>
          {detail?.sourceRecords?.length > 0 && (
            <div className="financial-table-wrap">
              <table className="financial-evidence-table">
                <thead><tr><th>Reservation</th><th>Folio line</th><th>Status</th><th>Amount</th></tr></thead>
                <tbody>{detail.sourceRecords.map((row) => (
                  <tr key={`${row.RESERVATION_ID}-${row.FOLIO_LINE}`}>
                    <td>{row.RESERVATION_ID}</td><td>{row.FOLIO_LINE}</td><td>{row.RESERVATION_STATUS}</td><td>{currency(row.LINE_TOTAL)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Modal>
      );
    }
    if (overlay.type === 'attestation') {
      const actions = detail?.actions || [];
      return (
        <Modal title="Owner attestation" eyebrow="Human decision record" onClose={close}>
          {actions.length ? actions.map((action) => (
            <article key={action.ACTION_ID} className="financial-audit-item">
              <div><strong>{action.ACTION_TYPE.replaceAll('_', ' ')}</strong><span>Audit #{action.ACTION_ID}</span></div>
              <p>{action.ACTION_NOTE || 'No note provided.'}</p>
              <small>{action.ACTION_BY} · {new Date(action.CREATED_AT).toLocaleString()}</small>
            </article>
          )) : <p>No owner attestation or finance decision has been recorded for this exception.</p>}
        </Modal>
      );
    }
    if (overlay.type === 'close-note') {
      return (
        <Modal title="Generated owner close note" eyebrow="Governed close summary" onClose={close}>
          <p className="financial-close-note-target">
            {overlay.propertyName} · {overlay.fiscalPeriodLabel}
          </p>
          <div className="financial-rationale"><FileText size={18} aria-hidden="true" />{closeNote}</div>
          <p className="text-xs text-[var(--color-text-dim)]">Source: {overlay.source}. The note is persisted to Oracle and does not attest any exception.</p>
        </Modal>
      );
    }
    if (overlay.type === 'detail') {
      const exception = detail?.exception;
      return (
        <Modal title={exception ? `${exception.METRIC_CODE} exception` : 'Validation exception'} eyebrow="Owner review" onClose={close} wide>
          {detailLoading ? <div className="financial-loading"><RefreshCw className="animate-spin" size={18} />Loading governed evidence…</div> : exception && (
            <div className="financial-detail-stack">
              <div className="financial-detail-heading">
                <div><h3>{exception.PROPERTY_NAME}</h3><p>{exception.OWNER_NAME} · {exception.FISCAL_PERIOD_LABEL}</p></div>
                <span className={severityClass(exception.SEVERITY)}>{exception.SEVERITY}</span>
              </div>
              <dl className="financial-definition-grid financial-definition-grid--amounts">
                <DetailDefinition label="Submitted" value={currency(exception.SUBMITTED_AMOUNT)} />
                <DetailDefinition label="Oracle expected" value={currency(exception.EXPECTED_AMOUNT)} />
                <DetailDefinition label="Variance" value={currency(exception.VARIANCE_AMOUNT)} />
                <DetailDefinition label="Variance %" value={`${number(exception.VARIANCE_PCT, 2)}%`} />
                <DetailDefinition label="Status" value={exception.STATUS.replaceAll('_', ' ')} />
                <DetailDefinition label="Evidence count" value={number(exception.EVIDENCE_COUNT)} />
              </dl>
              <div className="financial-rule-callout">
                <ShieldCheck size={18} aria-hidden="true" />
                <div><strong>{exception.RULE_NAME}</strong><p>{exception.BASIS_DESCRIPTION}</p></div>
              </div>
              <div className="financial-rationale"><Sparkles size={18} aria-hidden="true" />{exception.AI_RATIONALE}</div>
              <p className="financial-rationale-meta">{aiStatusLabel(exception.AI_STATUS)} · {exception.AI_SOURCE || 'deterministic-rule-fallback'}{exception.AI_MODEL ? ` · ${exception.AI_MODEL}` : ''}</p>
              <div className="financial-rule-callout">
                <ClipboardCheck size={18} aria-hidden="true" />
                <div><strong>Suggested owner action</strong><p>{detail.suggestedOwnerAction}</p></div>
              </div>
              <div className="financial-overlay-links" aria-label="Exception supporting details">
                <button type="button" onClick={() => setOverlay({ type: 'formula' })}>Room revenue formula</button>
                <button type="button" onClick={() => setOverlay({ type: 'fee-rule' })}>Fee validation rule</button>
                <button type="button" onClick={() => setOverlay({ type: 'ai-rationale' })}>AI rationale</button>
                <button type="button" onClick={() => setOverlay({ type: 'evidence' })}>Oracle evidence</button>
                <button type="button" onClick={() => setOverlay({ type: 'attestation' })}>Owner attestation</button>
              </div>
              <label className="financial-note-field">
                <span>Owner / finance note</span>
                <textarea value={actionNote} onChange={(event) => setActionNote(event.target.value)} rows={3} placeholder="Add context for the audit record…" />
              </label>
              <div className="financial-action-grid">
                {ACTIONS.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    className={action.tone === 'primary' ? 'btn-primary' : 'btn-ghost'}
                    disabled={Boolean(working)}
                    onClick={() => void takeAction(action.value)}
                  >
                    {working === `action-${action.value}` && <RefreshCw size={13} className="animate-spin" aria-hidden="true" />}
                    {action.label}
                  </button>
                ))}
              </div>
              <section>
                <h3 className="financial-subheading">Action history</h3>
                {detail.actions?.length ? detail.actions.map((action) => (
                  <article key={action.ACTION_ID} className="financial-audit-item">
                    <div><strong>{action.ACTION_TYPE.replaceAll('_', ' ')}</strong><span>Audit #{action.ACTION_ID}</span></div>
                    <p>{action.ACTION_NOTE || 'No note provided.'}</p>
                    <small>{action.ACTION_BY} · {new Date(action.CREATED_AT).toLocaleString()}</small>
                  </article>
                )) : <p className="text-sm text-[var(--color-text-dim)]">No owner action recorded yet.</p>}
              </section>
            </div>
          )}
        </Modal>
      );
    }
    return null;
  };

  return (
    <div className="financial-workbench fade-in">
      <RegisterOraclePanel title="Owner Financial Validation Workbench">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Scene 10 internals</p>
            <p className="text-[var(--color-text)] leading-relaxed">Versioned PL/SQL validation compares owner-submitted close lines with governed reservation, folio, property, and rule data. Oracle persists AI explanation jobs with leases and retries so validation returns immediately; deterministic rationale remains available if generation fails. Human actions append to three separate audit stores.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Relational" color="blue" />
            <FeatureBadge label="Native JSON Evidence" color="orange" />
            <FeatureBadge label="PL/SQL Validation" color="purple" />
            <FeatureBadge label="Persistent AI Queue" color="purple" />
            <FeatureBadge label="Audit" color="red" />
            <FeatureBadge label="AI-assisted Reasoning" color="pink" />
            <FeatureBadge label="VPD / Roles" color="green" />
          </div>
          <SqlBlock code={`-- Latest-run exception detection
BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/

SELECT q.property_name, q.metric_code,
       q.submitted_amount, q.expected_amount,
       q.variance_amount, q.variance_pct,
       q.severity, q.status
FROM hotel_financial_exception_queue_v q
WHERE q.fiscal_period = (
  SELECT MAX(fiscal_period) FROM hotel_financial_exception_queue_v
)
  AND ABS(q.variance_pct) >= 5
ORDER BY CASE q.severity
  WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
  WHEN 'MEDIUM' THEN 3 ELSE 4 END;`} />
          <SqlBlock code={`-- Execute a validation safely, show its IDs, then roll it back.
BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/
SAVEPOINT copy_paste_validation;

DECLARE
  submission_id NUMBER;
  run_id NUMBER;
  exception_count NUMBER;
BEGIN
  SELECT MIN(submission_id) INTO submission_id
  FROM hotel_financial_submissions;
  owner_fin_validation_pkg.run_financial_validation(
    p_submission_id   => submission_id,
    p_actor           => 'copy_paste_demo',
    p_threshold_pct   => 5,
    p_run_id          => run_id,
    p_exception_count => exception_count
  );
  DBMS_OUTPUT.PUT_LINE('Run ' || run_id || ': ' || exception_count || ' exceptions');
END;
/
ROLLBACK TO copy_paste_validation;`} />
          <SqlBlock code={`-- Single-worker, lease-based claim
BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/
SAVEPOINT copy_paste_claim;

DECLARE
  job_id NUMBER;
BEGIN
  owner_fin_validation_pkg.claim_financial_ai_job(
    p_worker_id     => 'copy_paste_demo',
    p_job_id        => job_id,
    p_lease_seconds => 60
  );
  DBMS_OUTPUT.PUT_LINE('Claimed job: ' || NVL(TO_CHAR(job_id), 'none pending'));
END;
/
ROLLBACK TO copy_paste_claim;`} />
          <div className="grid grid-cols-2 gap-1.5">
            <DiagramBox label="Owner submission" sub="Relational lines + JSON report" color="#8A4E2F" />
            <DiagramBox label="Governed evidence" sub="Orders · folio lines · rules" color="#437C94" />
            <DiagramBox label="Versioned result + job" sub="Variance · fallback · durable AI state" color="#796087" />
            <DiagramBox label="Human action" sub="Owner + agent + event audit" color="#3E6F4D" />
          </div>
          <p className="text-[9px] text-[var(--color-text-dim)]">VPD uses the private <code>HOSPITALITY_APP_CTX</code>, set and cleared on each pooled connection. All data and fee rules are synthetic.</p>
        </div>
      </RegisterOraclePanel>

      <SceneStoryPanel scene="ownerfinancial" headingLevel={2} />

      <section className="glass-card financial-hero">
        <div>
          <p className="section-kicker">Scene 10 · Owner close assurance</p>
          <h1>Owner Financial Validation Workbench</h1>
          <p>AI-assisted multi-property close validation for property-submitted revenue, fees, and owner-reported financial inputs.</p>
          <div className="financial-synthetic-note"><ShieldCheck size={14} aria-hidden="true" />Synthetic demonstration data and demo rules—not hospitality production architecture or policy.</div>
        </div>
        <div className="financial-hero__actions">
          <JetButton
            label={working === 'validation' ? 'Validating in Oracle…' : 'Run AI validation'}
            iconClass="oj-fwk-icon oj-fwk-icon-sparkle"
            chroming="callToAction"
            disabled={Boolean(working) || loading}
            onAction={() => void runValidation()}
          />
          <JetButton label="Show Oracle evidence" iconClass="oj-fwk-icon oj-fwk-icon-database" disabled={Boolean(working)} onAction={() => setOverlay({ type: 'evidence' })} />
          <JetButton label={working === 'close-note' ? 'Generating…' : 'Generate owner close note'} iconClass="oj-fwk-icon oj-fwk-icon-notes" disabled={Boolean(working) || !selectedSubmission} onAction={() => void generateCloseNote()} />
          <JetButton label="Refresh from Oracle" iconClass="oj-fwk-icon oj-fwk-icon-refresh" disabled={Boolean(working)} onAction={() => void loadAll()} />
        </div>
      </section>

      {(error || notice) && (
        <div className={`financial-message ${error ? 'financial-message--error' : 'financial-message--success'}`} role={error ? 'alert' : 'status'}>
          {error ? <AlertTriangle size={17} aria-hidden="true" /> : <CheckCircle2 size={17} aria-hidden="true" />}
          <span>{error || notice}</span>
          <button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss message"><X size={15} /></button>
        </div>
      )}

      {aiProgress && (
        <div className="financial-message financial-message--ai" role="status" aria-live="polite">
          {aiPending + aiProcessing > 0 ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
          <span>{aiProgressMessage}</span>
        </div>
      )}

      <section className="glass-card financial-filters" aria-label="Financial validation filters">
        <div className="financial-filter-field"><label>Fiscal period</label><JetSelectSingle value={filters.period} options={optionRows(filterOptions.periods)} ariaLabel="Fiscal period" onValueChange={(value) => updateFilter('period', value)} /></div>
        <div className="financial-filter-field"><label>Region</label><JetSelectSingle value={filters.region} options={optionRows(filterOptions.regions)} ariaLabel="Region" onValueChange={(value) => updateFilter('region', value)} /></div>
        <div className="financial-filter-field"><label>Property</label><JetSelectSingle value={filters.propertyId} options={optionRows(filterOptions.properties)} ariaLabel="Property" onValueChange={(value) => updateFilter('propertyId', value)} /></div>
        <div className="financial-filter-field"><label>Owner / entity</label><JetSelectSingle value={filters.ownerId} options={optionRows(filterOptions.owners)} ariaLabel="Owner or entity" onValueChange={(value) => updateFilter('ownerId', value)} /></div>
        <div className="financial-filter-field"><label>Submission status</label><JetSelectSingle value={filters.status} options={optionRows(filterOptions.statuses)} ariaLabel="Submission status" onValueChange={(value) => updateFilter('status', value)} /></div>
        <div className="financial-filter-field"><label>Exception severity</label><JetSelectSingle value={filters.severity} options={optionRows(filterOptions.severities)} ariaLabel="Exception severity" onValueChange={(value) => updateFilter('severity', value)} /></div>
        <div className="financial-filter-field"><label>Metric type</label><JetSelectSingle value={filters.metricCategory} options={optionRows(filterOptions.metricCategories)} ariaLabel="Metric type" onValueChange={(value) => updateFilter('metricCategory', value)} /></div>
        <label className="financial-threshold">
          <span>Tolerance threshold <strong>{number(filters.threshold, 1)}%</strong></span>
          <input type="range" min="0" max="10" step="0.5" value={filters.threshold} onChange={(event) => updateFilter('threshold', event.target.value)} aria-label="Tolerance threshold percentage" />
        </label>
        <button type="button" className="financial-reset" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</button>
      </section>

      <section className="financial-kpi-grid" aria-label="Owner close summary">
        <MetricCard label="Submitted room revenue" value={currency(summary.SUBMITTED_ROOM_REVENUE)} detail={`${number(summary.SUBMISSION_COUNT)} submissions`} tone="#8A4E2F" />
        <MetricCard label="Oracle expected room revenue" value={currency(summary.EXPECTED_ROOM_REVENUE)} detail="Governed reservation + folio evidence" tone="#437C94" />
        <MetricCard label="Variance amount" value={currency(summary.VARIANCE_AMOUNT)} detail="Submitted less Oracle expected" tone="#A73529" />
        <MetricCard label="Exception count" value={number(summary.EXCEPTION_COUNT)} detail={`${number(filters.threshold, 1)}% display tolerance`} tone="#A36472" />
        <MetricCard label="Auto-cleared percentage" value={`${number(summary.AUTO_CLEARED_PCT, 1)}%`} detail="Inside governed tolerance" tone="#4F7D7B" />
        <MetricCard label="Owner validation status" value={summary.OWNER_VALIDATION_STATUS || '—'} detail="Human decision state" tone="#796087" />
        <MetricCard label="Close readiness score" value={`${number(summary.CLOSE_READINESS_SCORE, 0)}%`} detail="Severity-weighted readiness" tone="#3E6F4D" />
      </section>

      <section className="financial-helper-row" aria-label="Validation explanations">
        <button type="button" onClick={() => setOverlay({ type: 'how' })}><HelpCircle size={15} />How validation works</button>
        <button type="button" onClick={() => setOverlay({ type: 'formula' })}><Database size={15} />Room revenue formula</button>
        <button type="button" onClick={() => setOverlay({ type: 'fee-rule' })}><ClipboardCheck size={15} />Fee validation rule</button>
      </section>

      {loading ? (
        <div className="glass-card financial-loading"><RefreshCw size={18} className="animate-spin" />Loading owner submissions and Oracle evidence…</div>
      ) : (
        <div className="financial-main-grid">
          <section className="financial-analytics-grid" aria-label="Financial validation analytics">
            <ChartCard title="Variance by metric category" subtitle="Current exception population from Oracle">
              {varianceByMetric.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={varianceByMetric} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" angle={-15} textAnchor="end" interval={0} /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => currency(value)} /><Bar dataKey="absoluteVariance" name="Absolute variance">{varianceByMetric.map((entry, index) => <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer> : <EmptyChart />}
            </ChartCard>
            <ChartCard title="Submitted vs Oracle expected" subtitle="Recent fiscal-period revenue trend">
              {revenueTrend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={revenueTrend} margin={{ top: 8, right: 14, left: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => currency(value)} /><Legend /><Line type="monotone" dataKey="submitted" name="Owner submitted" stroke="#8A4E2F" strokeWidth={3} dot={{ r: 3 }} /><Line type="monotone" dataKey="expected" name="Oracle expected" stroke="#437C94" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <EmptyChart />}
            </ChartCard>
            <ChartCard title="Exception severity distribution" subtitle="Critical, high, medium, and low exceptions">
              {severityDistribution.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={severityDistribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={3} label={({ name, value }) => `${name} ${value}`}>{severityDistribution.map((entry) => <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#7A736E'} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer> : <EmptyChart />}
            </ChartCard>
            <ChartCard title="Reconciliation waterfall" subtitle="Submitted total through owner decisions to Oracle expected">
              {waterfall.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={waterfall} margin={{ top: 8, right: 8, left: 8, bottom: 38 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="step" angle={-18} textAnchor="end" interval={0} /><YAxis tickFormatter={(value) => `$${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => currency(value)} /><Bar dataKey="value" name="Reconciliation value">{waterfall.map((entry) => <Cell key={entry.step} fill={entry.kind === 'total' ? '#437C94' : '#A36472'} />)}</Bar></BarChart></ResponsiveContainer> : <EmptyChart />}
            </ChartCard>
          </section>

          <aside className="glass-card financial-queue" aria-label="Validation exception queue">
            <header>
              <div><p className="section-kicker">Owner review queue</p><h2>Validation exceptions</h2></div>
              <span>{number(exceptions.length)}</span>
            </header>
            <p className="financial-queue__hint">Select an exception to inspect the formula, Oracle source records, AI rationale, and action history.</p>
            <div className="financial-queue__list">
              {exceptions.length ? exceptions.map((item) => (
                <button key={item.EXCEPTION_ID} type="button" className="financial-exception-card" onClick={() => void openDetail(item.EXCEPTION_ID)}>
                  <div className="financial-exception-card__heading">
                    <span className={severityClass(item.SEVERITY)}>{item.SEVERITY}</span>
                    <span className="financial-exception-card__states">
                      <span>{item.STATUS.replaceAll('_', ' ')}</span>
                      <span className={`financial-ai-badge financial-ai-badge--${String(item.AI_STATUS || 'not_requested').toLowerCase()}`}>{aiStatusLabel(item.AI_STATUS)}</span>
                    </span>
                  </div>
                  <strong>{item.METRIC_CODE.replaceAll('_', ' ')}</strong>
                  <p>{item.PROPERTY_NAME}</p>
                  <small>{item.OWNER_NAME} · {item.FISCAL_PERIOD_LABEL}</small>
                  <div className="financial-exception-card__amounts"><span>{currency(item.SUBMITTED_AMOUNT)} submitted</span><span>{currency(item.EXPECTED_AMOUNT)} expected</span></div>
                  <div className="financial-exception-card__variance"><strong>{currency(item.VARIANCE_AMOUNT)}</strong><span>{number(item.VARIANCE_PCT, 2)}%</span></div>
                  <p className="financial-exception-card__rationale">{item.AI_RATIONALE}</p>
                  <footer><span>{number(item.EVIDENCE_COUNT)} evidence records</span><span>{item.LAST_ACTION?.replaceAll('_', ' ') || 'No owner action'}</span></footer>
                </button>
              )) : <div className="financial-empty-queue"><CheckCircle2 size={28} /><strong>No matching exceptions</strong><p>Try broadening the filters or lowering the display threshold.</p></div>}
            </div>
          </aside>
        </div>
      )}

      <section className="glass-card financial-audit-feed">
        <header><div><p className="section-kicker">Oracle audit feed</p><h2>Recent owner and finance actions</h2></div><Bot size={20} aria-hidden="true" /></header>
        <div className="financial-audit-feed__grid">
          {(chartData?.recentActions || []).length ? chartData.recentActions.map((action) => (
            <article key={action.ACTION_ID} className="financial-audit-item">
              <div><strong>{action.ACTION_TYPE.replaceAll('_', ' ')}</strong><span>Audit #{action.ACTION_ID}</span></div>
              <p>{action.PROPERTY_NAME} · {action.FISCAL_PERIOD_LABEL}</p>
              <small>{action.ACTION_BY} · {new Date(action.CREATED_AT).toLocaleString()}</small>
            </article>
          )) : <p className="text-sm text-[var(--color-text-dim)]">No owner actions have been recorded for the current filter selection.</p>}
        </div>
      </section>

      {renderOverlay()}
    </div>
  );
}
