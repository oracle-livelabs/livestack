import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Network,
  MapPin,
  BrainCircuit,
  FileJson,
  Package,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { SceneStoryPanel } from '../components/HealthcareStory';
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';
import { useData } from '../hooks/useData';
import { api } from '../utils/api';

const CAPABILITY_GROUPS = [
  {
    title: 'Healthcare Data Foundation',
    accent: '#437C94',
    icon: Database,
    summary: 'Provider networks, care services, care sites, service requests, quality signals, and operational records share one governed foundation.',
    detail: 'This is the trusted starting point for relational rows, JSON document projections, graph links, spatial layers, vectors, and audit records.',
  },
  {
    title: 'Healthcare Operations',
    accent: '#C74634',
    icon: ShoppingCart,
    summary: 'Care sites, service requests, capacity, supply, and patient-flow signals remain the operational system of record.',
    detail: 'Operational teams can monitor demand, route services, and track status from governed Oracle data.',
  },
  {
    title: 'Quality and Capacity Signals',
    accent: '#4F7D7B',
    icon: TrendingUp,
    summary: 'Quality updates, capacity alerts, compliance notes, and service mentions become searchable healthcare signals.',
    detail: 'Vector search and semantic matching help surface risk, momentum, and operational impact.',
  },
  {
    title: 'Care Pathway Graph',
    accent: '#796087',
    icon: Network,
    summary: 'Patients, encounters, providers, facilities, care gaps, and quality signals can be explored as connected relationships.',
    detail: 'The graph layer supports referral, pathway, care-gap, partner, and signal propagation analysis.',
  },
  {
    title: 'Care Logistics Spatial Layer',
    accent: '#5F7D4F',
    icon: MapPin,
    summary: 'Facilities, service zones, access regions, routes, and regional demand overlays live as Oracle Spatial data.',
    detail: 'The map experience can reason over proximity, service access, regional capacity, and logistics routes.',
  },
  {
    title: 'JSON Relational Duality',
    accent: '#AA643B',
    icon: FileJson,
    summary: 'Operational healthcare records can be exposed as nested JSON documents without duplicating source rows.',
    detail: 'Duality views support service request inspection and application-style payloads on the same transactional data.',
  },
  {
    title: 'Native JSON and Unified Audit',
    accent: '#A36472',
    icon: FileJson,
    summary: 'Native JSON document storage and Unified Audit policy evidence are exposed through read-only readiness endpoints.',
    detail: 'The UI reports readiness rather than claiming audit activation or JSON execution when Oracle evidence is unavailable.',
  },
  {
    title: 'ML, Vector, and AI Agents',
    accent: '#4C825C',
    icon: BrainCircuit,
    summary: 'Risk scoring, demand forecasts, vector search, and agent workflows run against the same governed Oracle foundation.',
    detail: 'Analytics and AI actions stay anchored to auditable data, PL/SQL tools, and live application context.',
  },
];

const LOADED_GROUPS_PER_PAGE = 3;

function StatusGrid({ status, projected = false }) {
  const cards = [
    { label: 'Care Services', value: status?.products ?? 0, accent: '#437C94' },
    { label: 'Signal Bulletins', value: status?.social_posts ?? 0, accent: '#A36472' },
    { label: 'Service Requests', value: status?.orders ?? 0, accent: '#4C825C' },
    { label: 'Service Vectors', value: status?.product_embeddings ?? 0, accent: '#4F7D7B', vector: true },
    { label: 'Signal Vectors', value: status?.post_embeddings ?? 0, accent: '#4F7D7B', vector: true },
    { label: 'Semantic Matches', value: status?.semantic_matches ?? 0, accent: '#796087', vector: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg p-3 text-center border border-[var(--color-border)]"
          style={{ boxShadow: `inset 0 2px 0 ${card.accent}`, background: 'var(--color-surface)' }}
        >
          <p className="text-lg font-bold font-mono">{Number(card.value || 0).toLocaleString()}</p>
          <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wide mt-1">{card.label}</p>
          {projected ? (
            <p className="text-[9px] text-[var(--color-text-dim)] mt-1">
              {card.vector ? 'Expected after vector rebuild' : 'Expected restore count'}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function numericCount(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function bestCount(...values) {
  return values.reduce((best, value) => {
    const count = numericCount(value);
    return count === null ? best : Math.max(best, count);
  }, 0);
}

function firstCount(source, fallback, keys) {
  return bestCount(...keys.map((key) => source?.[key]), ...keys.map((key) => fallback?.[key]));
}

function restoreCountsToStatus(counts, fallbackStatus) {
  if (!counts && !fallbackStatus) return null;
  return {
    products: firstCount(counts, fallbackStatus, ['products']),
    social_posts: firstCount(counts, fallbackStatus, ['social_posts']),
    orders: firstCount(counts, fallbackStatus, ['orders']),
    product_embeddings: bestCount(counts?.product_embeddings, fallbackStatus?.product_embeddings, counts?.products, fallbackStatus?.products),
    post_embeddings: bestCount(counts?.post_embeddings, fallbackStatus?.post_embeddings, counts?.signal_embeddings, fallbackStatus?.signal_embeddings, counts?.social_posts, fallbackStatus?.social_posts),
    semantic_matches: firstCount(counts, fallbackStatus, ['semantic_matches']),
    fulfillment_zones: firstCount(counts, fallbackStatus, ['fulfillment_zones']),
    demand_regions: firstCount(counts, fallbackStatus, ['demand_regions']),
  };
}

function hasCountData(counts) {
  return Boolean(counts) && Object.values(counts).some((value) => numericCount(value) > 0);
}

const BEST_STATUS_STORAGE_KEY = 'healthcareLiveFootprintBestStatus';

function mergeBestStatus(nextStatus, previousStatus) {
  if (!nextStatus && !previousStatus) return null;
  if (!nextStatus) return previousStatus;
  const bestMajorCounts = restoreCountsToStatus(nextStatus, previousStatus);
  return {
    ...(previousStatus || {}),
    ...nextStatus,
    ...(bestMajorCounts || {}),
  };
}

function readStoredBestStatus() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BEST_STATUS_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredBestStatus(bestStatus) {
  if (typeof window === 'undefined' || !bestStatus) return;
  try {
    window.localStorage.setItem(BEST_STATUS_STORAGE_KEY, JSON.stringify(bestStatus));
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}

function restoreMessageForJob(job) {
  const baseMessage = job?.message || 'Restoring bundled demo dataset...';
  const progress = Number(job?.progress ?? 0);
  if (/demo dates|restore window/i.test(baseMessage)) {
    return `${baseMessage} Seeded timestamps are being re-anchored before vector and analytics artifacts are rebuilt.`;
  }
  if (/validating refreshed demo date windows|date validation/i.test(baseMessage)) {
    return `${baseMessage} Restore checks are confirming recent 7-day, 30-day, 90-day, forecast, request, route, signal, and analytics windows.`;
  }
  if (/OML|model refresh/i.test(baseMessage)) {
    return `${baseMessage} Date-sensitive in-database ML artifacts are checked after the refreshed data is committed.`;
  }
  if (progress >= 92 || /vector artifacts|embedding|semantic/i.test(baseMessage)) {
    return `${baseMessage} Vector counts are rebuilt with Oracle VECTOR_EMBEDDING and appear after this final step finishes.`;
  }
  return baseMessage;
}

function ReadinessCard({ title, evidence, loading, error, readyDetail, unavailableDetail }) {
  const ready = evidence?.ready === true;
  const unavailable = Boolean(error) || (!loading && !evidence);
  const stateLabel = loading ? 'Checking' : ready ? 'Ready' : unavailable ? 'Unavailable' : 'Not ready';
  const stateColor = loading ? '#437C94' : ready ? '#4C825C' : unavailable ? '#C74634' : '#AA643B';
  const message = loading
    ? 'Checking the governed Oracle catalog for this capability.'
    : error
      ? `${error.message} No readiness claim is made while the endpoint is unavailable.`
      : ready
        ? readyDetail
        : evidence
          ? `${unavailableDetail} Oracle reported ${evidence.status || 'NOT_READY'}.`
          : `${unavailableDetail} No readiness evidence was returned.`;

  return (
    <div
      className="border p-4"
      role="status"
      aria-live="polite"
      style={{
        borderColor: 'var(--color-border)',
        borderRadius: '6px',
        background: 'var(--color-surface)',
        boxShadow: `inset 0 3px 0 ${stateColor}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: stateColor }}>
          {stateLabel}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-dim)]">{message}</p>
      {evidence?.source ? (
        <p className="mt-2 text-[10px] font-mono text-[var(--color-text-dim)]">
          Evidence source: {evidence.source}
        </p>
      ) : null}
    </div>
  );
}

export default function DataModel() {
  const { scopeVersion } = useUser();
  const [status, setStatus] = useState(null);
  const [statusScope, setStatusScope] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoMessage, setDemoMessage] = useState('');
  const [restoreCounts, setRestoreCounts] = useState(null);
  const [loadedGroupPage, setLoadedGroupPage] = useState(0);
  const {
    data: nativeJsonReadiness,
    loading: nativeJsonLoading,
    error: nativeJsonError,
  } = useData(() => api.demo.nativeJsonReadiness(), []);
  const {
    data: unifiedAuditReadiness,
    loading: unifiedAuditLoading,
    error: unifiedAuditError,
  } = useData(() => api.demo.unifiedAuditReadiness(), []);
  const loadedGroupPageCount = Math.ceil(CAPABILITY_GROUPS.length / LOADED_GROUPS_PER_PAGE);
  const loadedGroupStart = loadedGroupPage * LOADED_GROUPS_PER_PAGE;
  const visibleLoadedGroups = CAPABILITY_GROUPS.slice(loadedGroupStart, loadedGroupStart + LOADED_GROUPS_PER_PAGE);
  const loadedGroupEnd = Math.min(loadedGroupStart + visibleLoadedGroups.length, CAPABILITY_GROUPS.length);
  const canShowPreviousLoadedGroups = loadedGroupPage > 0;
  const canShowNextLoadedGroups = loadedGroupPage < loadedGroupPageCount - 1;

  const showPreviousLoadedGroups = () => {
    setLoadedGroupPage((page) => Math.max(0, page - 1));
  };

  const showNextLoadedGroups = () => {
    setLoadedGroupPage((page) => Math.min(loadedGroupPageCount - 1, page + 1));
  };

  const refreshStatus = useCallback(async ({ keepExistingOnError = true } = {}) => {
    const requestedScope = scopeVersion;
    try {
      const data = await api.demo.status();
      setStatus(data);
      setStatusScope(requestedScope);
      setStatusError(null);
      return data;
    } catch (error) {
      // A failed scope/readiness request is not permission to retain old counts.
      setStatus(null);
      setStatusScope(requestedScope);
      setStatusError(error);
      return null;
    }
  }, [scopeVersion]);

  useEffect(() => {
    setStatus(null);
    setStatusScope(null);
    setStatusError(null);
    let cancelled = false;
    refreshStatus({ keepExistingOnError: false }).then((data) => {
      if (cancelled && data) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refreshStatus, scopeVersion]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      refreshStatus({ keepExistingOnError: true });
    }, 10000);
    const handleFocus = () => refreshStatus({ keepExistingOnError: true });
    const handleFootprintRefresh = () => refreshStatus({ keepExistingOnError: true });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('healthcare-live-footprint-refresh', handleFootprintRefresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('healthcare-live-footprint-refresh', handleFootprintRefresh);
    };
  }, [refreshStatus]);

  const scopedStatus = statusScope === scopeVersion ? status : null;

  const displayStatus = useMemo(() => {
    if (demoRunning && hasCountData(restoreCounts)) {
      return restoreCountsToStatus(restoreCounts, scopedStatus);
    }
    return restoreCountsToStatus(null, scopedStatus);
  }, [demoRunning, restoreCounts, scopedStatus]);

  const showingProjectedCounts = demoRunning && hasCountData(restoreCounts);

  const totalArtifacts = useMemo(() => {
    if (!displayStatus) return null;
    return (
      (displayStatus.products || 0) +
      (displayStatus.social_posts || 0) +
      (displayStatus.orders || 0) +
      (displayStatus.product_embeddings || 0) +
      (displayStatus.post_embeddings || 0) +
      (displayStatus.semantic_matches || 0)
    );
  }, [displayStatus]);

  const hasData = useMemo(() => {
    if (!scopedStatus) return false;
    return Object.values(scopedStatus).some((value) => typeof value === 'number' && value > 0);
  }, [scopedStatus]);

  const startDemoRefresh = useCallback(async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    setDemoDone(false);
    setDemoProgress(0);
    setRestoreCounts(null);
    setDemoMessage(hasData ? 'Restoring and verifying bundled demo data...' : 'Loading bundled demo data...');

    try {
      const startPayload = await api.import.restoreDemo({
        source: 'data-model-load-demo',
        confirmation: 'RESTORE_DEMO',
      });
      if (!startPayload?.jobId) {
        throw new Error('Demo restore was not accepted. No dataset change was reported.');
      }

      setDemoProgress(Number(startPayload.progress || 5));
      if (startPayload.counts) setRestoreCounts(startPayload.counts);
      setDemoMessage(startPayload.message || 'Demo restore started.');

      let finalJob = null;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
        const job = await api.import.status(startPayload.jobId);
        if (!job) throw new Error('Demo restore status could not be read.');

        const progress = Math.max(0, Math.min(100, Number(job.progress ?? 0)));
        setDemoProgress(progress);
        if (job.counts) setRestoreCounts(job.counts);
        if (attempt % 3 === 0 || progress >= 90) {
          await refreshStatus({ keepExistingOnError: true });
        }
        setDemoMessage(restoreMessageForJob(job));

        const jobStatus = String(job.status || '').toLowerCase();
        if (jobStatus === 'completed' || jobStatus === 'complete' || jobStatus === 'success' || jobStatus === 'failed' || jobStatus === 'error') {
          finalJob = job;
          break;
        }
      }

      if (!finalJob) {
        throw new Error('Demo restore timed out before completion.');
      }
      if (!['completed', 'complete', 'success'].includes(String(finalJob.status || '').toLowerCase())) {
        throw new Error(finalJob.message || finalJob.errors?.[0] || 'Demo restore failed.');
      }

      const nextStatus = await refreshStatus({ keepExistingOnError: false });
      if (!nextStatus || !Object.values(nextStatus).some((value) => typeof value === 'number' && value > 0)) {
        throw new Error('Demo restore completed, but live counts still read as zero.');
      }

      setRestoreCounts(null);
      setDemoDone(true);
      setDemoProgress(100);
      setDemoMessage('Demo dataset restored, dates re-anchored, and live counts refreshed.');
    } catch (err) {
      setDemoDone(false);
      setRestoreCounts(null);
      setDemoMessage(err?.message || 'Demo restore failed.');
      await refreshStatus({ keepExistingOnError: true });
    } finally {
      setDemoRunning(false);
    }
  }, [demoRunning, hasData, refreshStatus]);

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      <RegisterOraclePanel title="Data Foundation">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Demo Readiness</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Start here to load or restore the Seer Health Network dataset before exploring the healthcare use cases. The action prepares the governed Oracle AI Database 26ai foundation used by the command center, quality signals, care pathways, logistics map, analytics, and AI agents.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Why It Matters</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The same foundation supports care-service search, quality and capacity signals, care-pathway analysis, spatial routing, document projections, forecasting, and agent actions without splitting the story across separate data stores.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Relational Core" color="blue" />
            <FeatureBadge label="JSON Duality Views" color="orange" />
            <FeatureBadge label="Property Graph" color="purple" />
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="Vector Search" color="cyan" />
            <FeatureBadge label="In-DB ML" color="red" />
            <FeatureBadge label="Agent Audit Trail" color="pink" />
          </div>
          <SqlBlock
            code={`-- Demo data prepared by this page
-- relational tables        -> provider networks, care services, care sites, service requests, service items
-- json / duality views     -> service request and capacity documents
-- property graph           -> patients, encounters, providers, facilities, care gaps, and quality signals
-- spatial geometry         -> care logistics sites, service zones, and demand regions
-- vector embeddings        -> care service embeddings, signal embeddings, semantic matches
-- in-database analytics    -> risk scoring, forecasting, segmentation, capacity planning
-- agent audit trail        -> agent_actions, event_stream`}
          />
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Database size={24} className="text-[var(--color-accent)]" />
          Data Foundation
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Prepare the governed Seer Health Network dataset before you move into the healthcare scenarios.
        </p>
      </div>

      <SceneStoryPanel scene="datamodel" />

      <div className="glass-card p-5" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <p className="text-base text-[var(--color-text)] leading-7">
          Start here to load the Seer Health Network demo dataset. This action prepares provider networks, care services, care sites, service requests, quality signals, logistics geography, vector embeddings, ML outputs, and agent audit history. Once the load completes, the live footprint confirms that the database is ready for the demo workflows.
        </p>
      </div>

      <div className="glass-card p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FileJson size={18} className="text-[var(--color-accent)]" />
            Database Evidence Readiness
          </h3>
          <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-3xl">
            Read-only catalog checks report what Oracle can prove for the current governed scope. An unavailable endpoint is shown as unavailable and never treated as feature readiness.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadinessCard
            title="Native JSON"
            evidence={nativeJsonReadiness}
            loading={nativeJsonLoading}
            error={nativeJsonError}
            readyDetail={`${nativeJsonReadiness?.nativeColumns?.length || 0} native JSON columns are visible in USER_TAB_COLUMNS.`}
            unavailableDetail="Native JSON catalog evidence is unavailable or incomplete."
          />
          <ReadinessCard
            title="Unified Audit"
            evidence={unifiedAuditReadiness}
            loading={unifiedAuditLoading}
            error={unifiedAuditError}
            readyDetail={`${unifiedAuditReadiness?.policy?.name || 'SC_ORDER_AUDIT'} is enabled in AUDIT_UNIFIED_ENABLED_POLICIES.`}
            unavailableDetail="Unified Audit policy evidence is unavailable or not enabled."
          />
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Package size={18} className="text-[var(--color-accent)]" />
              Prepare the Dataset
            </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-2xl">
              Load or restore the bundled healthcare dataset, then verify the live record counts that power every use case in the demo.
            </p>
          </div>
          <JetButton
            label={demoRunning ? 'Loading Demo Data...' : hasData ? 'Restore Demo Data' : 'Load Demo Data'}
            iconClass={demoRunning
              ? 'oj-fwk-icon oj-fwk-icon-load'
              : hasData
                ? 'oj-fwk-icon oj-fwk-icon-refresh'
                : 'oj-fwk-icon oj-fwk-icon-folderhierarchy'}
            chroming="callToAction"
            className="welcome-jet-button welcome-start-demo-button"
            onAction={startDemoRefresh}
            disabled={demoRunning}
          />
        </div>
        <p className="text-xs text-[var(--color-text-dim)] mb-4">
          {totalArtifacts == null ? 'Current runtime counts from the live demo stack.' : `${totalArtifacts.toLocaleString()} tracked records across the major demo layers.`}
        </p>
        {statusError ? (
          <div className="mb-4 border-l-4 p-3 text-xs" role="status" style={{ borderColor: '#C74634', background: 'rgba(199,70,52,0.08)' }}>
            <strong>Live dataset status is unavailable.</strong> {statusError.message} Counts are withheld until the governed API responds for the current scope.
          </div>
        ) : null}
        {(demoMessage || demoRunning || demoDone) && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--color-text-dim)]">{demoMessage || 'Waiting for demo restore...'}</span>
              <span className="text-xs font-mono font-semibold">{demoProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-border)]/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${demoProgress}%`,
                  background: demoDone
                    ? '#4C825C'
                    : 'linear-gradient(135deg, #C74634, #AA643B)',
                }}
              />
            </div>
            {showingProjectedCounts ? (
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Showing the best available live and restore counts while Oracle rebuilds vector artifacts. Service vectors, signal vectors, and semantic matches refresh during the VECTOR_EMBEDDING step and remain visible as soon as the API reports them.
              </div>
            ) : null}
            {demoDone ? (
              <div className="flex items-center gap-1.5 text-[11px] tone-pine">
                <CheckCircle2 size={12} />
                Bundled demo restore finished and live counts were refreshed.
              </div>
            ) : null}
          </div>
        )}
        {statusError && !displayStatus ? null : <StatusGrid status={displayStatus} projected={showingProjectedCounts} />}
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Boxes size={18} className="text-[var(--color-accent)]" />
            What Gets Loaded
          </h3>
          <div className="flex items-center gap-2" aria-label="Loaded data carousel controls">
            <button
              type="button"
              aria-label="Show previous loaded data groups"
              onClick={showPreviousLoadedGroups}
              disabled={!canShowPreviousLoadedGroups}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Show next loaded data groups"
              onClick={showNextLoadedGroups}
              disabled={!canShowNextLoadedGroups}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="text-sm text-[var(--color-text-dim)] leading-6 mt-3">
          The restore prepares the clinical, operational, analytical, spatial, graph, vector, and agent data domains that the rest of the demo uses.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--color-text-dim)]">
            Showing {loadedGroupStart + 1}-{loadedGroupEnd} of {CAPABILITY_GROUPS.length}
          </p>
          <div className="flex items-center gap-1.5" aria-label="Loaded data groups">
            {Array.from({ length: loadedGroupPageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show loaded data group ${index + 1}`}
                aria-current={loadedGroupPage === index ? 'true' : undefined}
                onClick={() => setLoadedGroupPage(index)}
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: loadedGroupPage === index ? '22px' : '10px',
                  background: loadedGroupPage === index ? '#AA643B' : 'var(--color-border)',
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="grid gap-4 mt-4 lg:grid-cols-3"
          aria-live="polite"
          aria-label={`Loaded data groups ${loadedGroupStart + 1} through ${loadedGroupEnd}`}
        >
          {visibleLoadedGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div
                key={group.title}
                className="border p-4"
                style={{
                  borderColor: 'var(--color-border)',
                  borderRadius: '6px',
                  background: 'var(--color-surface)',
                  boxShadow: `inset 0 3px 0 ${group.accent}`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 flex items-center justify-center rounded" style={{ background: `${group.accent}18` }}>
                    <Icon size={16} style={{ color: group.accent }} />
                  </div>
                  <div className="text-sm font-semibold">{group.title}</div>
                </div>
                <p className="text-sm text-[var(--color-text)] leading-6">{group.summary}</p>
                <p className="text-xs text-[var(--color-text-dim)] leading-5 mt-2">{group.detail}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
