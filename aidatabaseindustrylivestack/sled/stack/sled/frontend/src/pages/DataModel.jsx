import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/StateLocalGovernmentStory';
import { api, apiFetch } from '../utils/api';

const CAPABILITY_GROUPS = [
  {
    title: 'State and Local Government Data Foundation',
    accent: '#437C94',
    icon: Database,
    summary: 'Constituent services, agency operations, public programs, cases, permits, inspections, service requests, and resident records share one governed Oracle foundation.',
    detail: 'This is the trusted starting point for relational rows, JSON document projections, graph links, spatial layers, vectors, OML outputs, and audit records.',
  },
  {
    title: 'Constituent Service Operations',
    accent: '#C74634',
    icon: ShoppingCart,
    summary: 'Public services, service requests, work queues, service-level agreements, backlog pressure, and resident experience stay in the transactional system of record.',
    detail: 'Agency staff can monitor demand, route work, inspect status, and coordinate service delivery from governed Oracle data.',
  },
  {
    title: 'Resident and Agency Signals',
    accent: '#4F7D7B',
    icon: TrendingUp,
    summary: 'Resident feedback, public assistance signals, policy notes, inspection updates, and service-delay evidence become searchable operational signals.',
    detail: 'Vector search and semantic matching help surface urgency, compliance exposure, fraud/waste/abuse risk, and resident impact.',
  },
  {
    title: 'Interagency Workflow Graph',
    accent: '#796087',
    icon: Network,
    summary: 'Agencies, community partners, programs, records, permits, inspections, service requests, and cases can be explored as connected relationships.',
    detail: 'The graph layer supports partner coordination, case escalation, code enforcement, records management, and policy-compliance analysis.',
  },
  {
    title: 'Service Access Spatial Layer',
    accent: '#5F7D4F',
    icon: MapPin,
    summary: 'Public service centers, coverage zones, response regions, inspection routes, and demand overlays live as Oracle Spatial data.',
    detail: 'The map experience can reason over proximity, access gaps, routing constraints, emergency response, and equitable service delivery.',
  },
  {
    title: 'JSON Relational Duality',
    accent: '#AA643B',
    icon: FileJson,
    summary: 'Service requests, permits, benefits cases, inspections, and public assistance records can be exposed as nested JSON documents without duplicating source rows.',
    detail: 'Duality views support service request inspection and application-style payloads on the same transactional data.',
  },
  {
    title: 'Responsible AI and Compliance Evidence',
    accent: '#A36472',
    icon: ShieldCheck,
    summary: 'Policy compliance, accessibility, transparency, legislative and regulatory requirements, and auditability stay linked to operational work.',
    detail: 'The same foundation can support evidence review, public-sector governance, records traceability, and responsible AI recommendations.',
  },
  {
    title: 'OML, Vector, and AI Agents',
    accent: '#4C825C',
    icon: BrainCircuit,
    summary: 'Backlog scoring, demand forecasts, vector search, semantic matches, and agent workflows run against the same governed Oracle foundation.',
    detail: 'Analytics and AI actions stay anchored to auditable data, PL/SQL tools, and live State and Local Government application context.',
  },
];

const LOADED_GROUPS_PER_PAGE = 3;

function StatusGrid({ status, projected = false }) {
  const cards = [
    { label: 'Public Services', value: status?.products ?? 0, accent: '#437C94' },
    { label: 'Resident Signals', value: status?.social_posts ?? 0, accent: '#A36472' },
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
    products: firstCount(counts, fallbackStatus, ['public_services', 'products']),
    social_posts: firstCount(counts, fallbackStatus, ['resident_signals', 'social_posts']),
    orders: firstCount(counts, fallbackStatus, ['service_requests', 'orders']),
    product_embeddings: bestCount(
      counts?.public_service_vectors,
      fallbackStatus?.public_service_vectors,
      counts?.product_embeddings,
      fallbackStatus?.product_embeddings,
      counts?.public_services,
      fallbackStatus?.public_services,
      counts?.products,
      fallbackStatus?.products
    ),
    post_embeddings: bestCount(
      counts?.resident_signal_vectors,
      fallbackStatus?.resident_signal_vectors,
      counts?.post_embeddings,
      fallbackStatus?.post_embeddings,
      counts?.signal_embeddings,
      fallbackStatus?.signal_embeddings,
      counts?.resident_signals,
      fallbackStatus?.resident_signals,
      counts?.social_posts,
      fallbackStatus?.social_posts
    ),
    semantic_matches: firstCount(counts, fallbackStatus, ['semantic_service_matches', 'semantic_matches']),
    fulfillment_zones: firstCount(counts, fallbackStatus, ['service_access_zones', 'fulfillment_zones']),
    demand_regions: firstCount(counts, fallbackStatus, ['service_demand_regions', 'demand_regions']),
  };
}

function hasCountData(counts) {
  return Boolean(counts) && Object.values(counts).some((value) => numericCount(value) > 0);
}

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

function restoreMessageForJob(job) {
  const baseMessage = job?.message || 'Restoring bundled demo dataset...';
  const progress = Number(job?.progress ?? 0);
  if (/demo dates|restore window/i.test(baseMessage)) {
    return `${baseMessage} Seeded timestamps are being re-anchored before vector and analytics artifacts are rebuilt.`;
  }
  if (/validating refreshed demo date windows|date validation/i.test(baseMessage)) {
    return `${baseMessage} Restore checks are confirming recent 7-day, 30-day, 90-day, forecast, request, response, signal, and analytics windows.`;
  }
  if (/OML|model refresh/i.test(baseMessage)) {
    return `${baseMessage} Date-sensitive in-database ML artifacts are checked after the refreshed data is committed.`;
  }
  if (progress >= 92 || /vector artifacts|embedding|semantic/i.test(baseMessage)) {
    return `${baseMessage} Vector counts are rebuilt with Oracle VECTOR_EMBEDDING and appear after this final step finishes.`;
  }
  return baseMessage;
}

export default function DataModel() {
  const [status, setStatus] = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoMessage, setDemoMessage] = useState('');
  const [restoreCounts, setRestoreCounts] = useState(null);
  const [loadedGroupPage, setLoadedGroupPage] = useState(0);
  const mountedRef = useRef(true);
  const requestControllersRef = useRef(new Set());
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

  const requestJson = useCallback(async (endpoint, options = {}) => {
    if (!mountedRef.current) {
      const abortError = new Error('Identity-bound Data Foundation request was cancelled.');
      abortError.name = 'AbortError';
      throw abortError;
    }

    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    try {
      return await apiFetch(endpoint, { ...options, signal: controller.signal });
    } finally {
      requestControllersRef.current.delete(controller);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestControllersRef.current.forEach((controller) => controller.abort());
      requestControllersRef.current.clear();
    };
  }, []);

  const refreshStatus = useCallback(async ({ keepExistingOnError = true } = {}) => {
    try {
      const data = await requestJson('/demo/status');
      if (!mountedRef.current) return null;
      setStatus((previousStatus) => {
        return mergeBestStatus(data, previousStatus);
      });
      return data;
    } catch (error) {
      if (mountedRef.current && error?.name !== 'AbortError' && !keepExistingOnError) setStatus(null);
      return null;
    }
  }, [requestJson]);

  useEffect(() => {
    void refreshStatus({ keepExistingOnError: false });
  }, [refreshStatus]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      refreshStatus({ keepExistingOnError: true });
    }, 10000);
    const handleFocus = () => refreshStatus({ keepExistingOnError: true });
    const handleFootprintRefresh = () => refreshStatus({ keepExistingOnError: true });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('state-local-government-live-footprint-refresh', handleFootprintRefresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('state-local-government-live-footprint-refresh', handleFootprintRefresh);
    };
  }, [refreshStatus]);

  const displayStatus = useMemo(() => {
    if (demoRunning && hasCountData(restoreCounts)) {
      return restoreCountsToStatus(restoreCounts, status);
    }
    return restoreCountsToStatus(null, status);
  }, [demoRunning, restoreCounts, status]);

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
    if (!status) return false;
    return Object.values(status).some((value) => typeof value === 'number' && value > 0);
  }, [status]);

  const startDemoRefresh = useCallback(async () => {
    if (demoRunning) return;

    setDemoRunning(true);
    setDemoDone(false);
    setDemoProgress(0);
    setRestoreCounts(null);
    setDemoMessage(hasData ? 'Restoring and verifying bundled State and Local Government demo data...' : 'Loading bundled State and Local Government demo data...');

    try {
      // This is a destructive operation. Use the shared dataset-admin client so
      // the same-origin control and explicit restore confirmation accompany the
      // Data Foundation action just as they do in the Dataset Manager.
      const startPayload = await api.import.restoreDemo();
      if (!startPayload?.jobId) {
        throw new Error(startPayload?.error || startPayload?.message || 'Demo restore could not be started.');
      }

      setDemoProgress(Number(startPayload.progress || 5));
      if (startPayload.counts) setRestoreCounts(startPayload.counts);
      setDemoMessage(startPayload.message || 'Demo restore started.');

      let finalJob = null;
      // Vector artifacts and in-database ML are rebuilt after the transactional
      // import, and can outlast a browser-side timer. The server owns the job;
      // keep observing it until it reaches a terminal state or this scene closes.
      for (let attempt = 0; mountedRef.current; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
        if (!mountedRef.current) return;
        const job = await requestJson(`/import/status/${encodeURIComponent(startPayload.jobId)}`);
        if (!job) {
          throw new Error(job?.error || 'Demo restore status could not be read.');
        }

        const progress = Math.max(0, Math.min(100, Number(job.progress ?? 0)));
        setDemoProgress(progress);
        if (job.counts) setRestoreCounts(job.counts);
        if (attempt % 3 === 0 || progress >= 90) {
          await refreshStatus({ keepExistingOnError: true });
        }
        if (!mountedRef.current) return;
        setDemoMessage(restoreMessageForJob(job));

        const jobStatus = String(job.status || '').toLowerCase();
        if (jobStatus === 'completed' || jobStatus === 'complete' || jobStatus === 'success' || jobStatus === 'failed' || jobStatus === 'error') {
          finalJob = job;
          break;
        }
      }

      if (!mountedRef.current) return;
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
      setDemoMessage('Demo dataset restored, dates re-anchored, vectors rebuilt, and live counts refreshed.');
    } catch (err) {
      if (!mountedRef.current || err?.name === 'AbortError') return;
      setDemoDone(false);
      setRestoreCounts(null);
      setDemoMessage(err?.message || 'Demo restore failed.');
      await refreshStatus({ keepExistingOnError: true });
    } finally {
      if (mountedRef.current) setDemoRunning(false);
    }
  }, [demoRunning, hasData, refreshStatus, requestJson]);

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      <RegisterOraclePanel title="Data Foundation">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Demo Readiness</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Start here to load or restore the Seer State and Local Government dataset before exploring constituent
              services, agency operations, public programs, resident demand signals, interagency graph workflows,
              service access coverage, OML analytics, Ask Data, and AI agents.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Why It Matters</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The same foundation supports service search, benefits eligibility, permits and licensing, inspections,
              public works, transportation services, tax and revenue operations, grants management, health and human
              services, policy compliance, records management, forecasting, and auditable agent actions without
              splitting the story across separate data stores.
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
-- relational tables        -> public services, residents, service requests, request lines, service centers, capacity
-- public-sector records    -> permits, licensing, benefits eligibility, inspections, code enforcement, grants, public works, transportation, tax, HHS
-- resident signals         -> digital service feedback, partner updates, compliance notes, fraud/waste/abuse indicators
-- json / duality views     -> service request, permit, benefits, inspection, and public assistance documents
-- property graph           -> agencies, programs, partners, cases, records, policies, service requests, and escalation paths
-- spatial geometry         -> service centers, response zones, access regions, inspection routes, and demand overlays
-- vector embeddings        -> public service embeddings, resident signal embeddings, semantic matches
-- in-database analytics    -> backlog scoring, service demand forecasting, segmentation, capacity planning
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
          Prepare the governed State and Local Government dataset before you move into the public-sector use cases.
        </p>
      </div>

      <SceneStoryPanel scene="datamodel" />

      <div className="glass-card p-5" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <p className="text-base text-[var(--color-text)] leading-7">
          Start here to load the State and Local Government demo dataset. This action prepares public services, resident records, service
          requests, benefits and permit workflows, inspection and code enforcement records, public works and
          transportation tasks, tax and revenue cases, grants and health and human services signals, service access
          geography, vector embeddings, OML outputs, and agent audit history.
        </p>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Package size={18} className="text-[var(--color-accent)]" />
              Prepare the Dataset
            </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-2xl">
              Load or restore the bundled State and Local Government dataset, then verify the live record counts that
              power every use case in the demo.
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
                Showing the best available live and restore counts while Oracle rebuilds vector artifacts. Service
                vectors, signal vectors, and semantic matches refresh during the VECTOR_EMBEDDING step and remain
                visible as soon as the API reports them.
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
        <StatusGrid status={displayStatus} projected={showingProjectedCounts} />
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
          The restore prepares constituent services, agency operations, resident signals, service requests,
          permits and licensing, benefits eligibility, case management, inspections, code enforcement, public works,
          transportation services, tax and revenue operations, grants management, health and human services, spatial,
          graph, vector, OML, and agent data domains that the rest of the demo uses.
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
