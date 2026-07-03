import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  Boxes,
  Factory,
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
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/ManufacturingStory';
import { useUser } from '../context/UserContext';
import { api } from '../utils/api';

const CAPABILITY_GROUPS = [
  {
    title: 'Data Foundation',
    accent: '#437C94',
    icon: Database,
    summary: 'Plants, production lines, machines, suppliers, manufactured parts, work orders, quality signals, and operational records share one governed foundation.',
    detail: 'This is the trusted starting point for relational rows, JSON document projections, graph links, spatial layers, vectors, and audit records.',
  },
  {
    title: 'Factory Operations',
    accent: '#C74634',
    icon: Factory,
    summary: 'Plants, work orders, production capacity, inventory, demand signals, and schedule status remain the operational system of record.',
    detail: 'Operations teams can monitor throughput, rebalance capacity, prioritize work orders, and track production status from governed Oracle data.',
  },
  {
    title: 'Production Signals',
    accent: '#4F7D7B',
    icon: TrendingUp,
    summary: 'Machine telemetry, quality updates, supplier alerts, schedule exceptions, and work order mentions become searchable manufacturing signals.',
    detail: 'Vector search and semantic matching help surface risk, momentum, and operational impact.',
  },
  {
    title: 'Production Risk Graph',
    accent: '#796087',
    icon: Network,
    summary: 'Current suppliers, parts, plants, work orders, and production signals can be explored as connected relationships.',
    detail: 'The graph layer rebuilds supplier ownership, part requirements, plant assignments, inventory availability, and signal evidence from live relational rows.',
  },
  {
    title: 'Plant Logistics Spatial Layer',
    accent: '#5F7D4F',
    icon: MapPin,
    summary: 'Plants, service zones, access regions, routes, and regional demand overlays live as Oracle Spatial data.',
    detail: 'The map experience can reason over proximity, production coverage, regional capacity, and supply-chain routing.',
  },
  {
    title: 'JSON Relational Duality',
    accent: '#AA643B',
    icon: FileJson,
    summary: 'Operational manufacturing records can be exposed as nested JSON documents without duplicating source rows.',
    detail: 'Duality views support work order inspection and application-style payloads on the same transactional data.',
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
    { label: 'Manufactured Parts', value: status?.products ?? 0, accent: '#437C94' },
    { label: 'Production Signals', value: status?.manufacturing_production_signals ?? 0, accent: '#A36472' },
    { label: 'Work Orders', value: status?.manufacturing_work_orders ?? 0, accent: '#4C825C' },
    { label: 'Manufactured Part Vectors', value: status?.product_embeddings ?? 0, accent: '#4F7D7B', vector: true },
    { label: 'Signal Vectors', value: status?.manufacturing_signal_embeddings ?? 0, accent: '#4F7D7B', vector: true },
    { label: 'Semantic Matches', value: status?.manufacturing_signal_part_matches ?? 0, accent: '#796087', vector: true },
  ];

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
      data-testid="data-foundation-status-grid"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          data-status-label={card.label}
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

function firstCount(source, fallback, keys) {
  for (const value of [...keys.map((key) => source?.[key]), ...keys.map((key) => fallback?.[key])]) {
    const count = numericCount(value);
    if (count !== null) return count;
  }
  return 0;
}

function restoreCountsToStatus(counts, fallbackStatus) {
  if (!counts && !fallbackStatus) return null;
  return {
    products: firstCount(counts, fallbackStatus, ['products']),
    manufacturing_production_signals: firstCount(counts, fallbackStatus, ['manufacturing_production_signals']),
    manufacturing_work_orders: firstCount(counts, fallbackStatus, ['manufacturing_work_orders']),
    product_embeddings: firstCount(counts, fallbackStatus, ['product_embeddings']),
    manufacturing_signal_embeddings: firstCount(counts, fallbackStatus, ['manufacturing_signal_embeddings']),
    manufacturing_signal_part_matches: firstCount(counts, fallbackStatus, ['manufacturing_signal_part_matches']),
    fulfillment_zones: firstCount(counts, fallbackStatus, ['fulfillment_zones']),
    demand_regions: firstCount(counts, fallbackStatus, ['demand_regions']),
  };
}

function hasCountData(counts) {
  return Boolean(counts) && Object.values(counts).some((value) => numericCount(value) > 0);
}

function restoreMessageForJob(job) {
  const baseMessage = job?.message || 'Restoring bundled manufacturing demo dataset...';
  const progress = Number(job?.progress ?? 0);
  if (/demo dates|restore window/i.test(baseMessage)) {
    return `${baseMessage} Seeded timestamps are being re-anchored before vector and analytics artifacts are rebuilt.`;
  }
  if (/validating refreshed demo date windows|date validation/i.test(baseMessage)) {
    return `${baseMessage} Restore checks are confirming recent 7-day, 30-day, 90-day, forecast, work order, route, signal, and analytics windows.`;
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
  const { currentUser } = useUser();
  const canManageDataset = String(currentUser?.ROLE || '').toLowerCase() === 'admin';
  const [status, setStatus] = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoMessage, setDemoMessage] = useState('');
  const [restoreCounts, setRestoreCounts] = useState(null);
  const [loadedGroupPage, setLoadedGroupPage] = useState(0);
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
    try {
      const data = await api.demo.status();
      setStatus(data);
      return data;
    } catch {
      if (!keepExistingOnError) setStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshStatus({ keepExistingOnError: false }).then((data) => {
      if (cancelled && data) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refreshStatus]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      refreshStatus({ keepExistingOnError: true });
    }, 10000);
    const handleFocus = () => refreshStatus({ keepExistingOnError: true });
    const handleFootprintRefresh = () => refreshStatus({ keepExistingOnError: true });
    const handleDemoUserChanged = () => refreshStatus({ keepExistingOnError: false });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('manufacturing-live-footprint-refresh', handleFootprintRefresh);
    window.addEventListener('manufacturing-demo-user-changed', handleDemoUserChanged);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('manufacturing-live-footprint-refresh', handleFootprintRefresh);
      window.removeEventListener('manufacturing-demo-user-changed', handleDemoUserChanged);
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
      (displayStatus.manufacturing_production_signals || 0) +
      (displayStatus.manufacturing_work_orders || 0) +
      (displayStatus.product_embeddings || 0) +
      (displayStatus.manufacturing_signal_embeddings || 0) +
      (displayStatus.manufacturing_signal_part_matches || 0)
    );
  }, [displayStatus]);

  const hasData = useMemo(() => {
    if (!status) return false;
    return Object.values(status).some((value) => typeof value === 'number' && value > 0);
  }, [status]);

  const startDemoRefresh = useCallback(async () => {
    if (demoRunning) return;
    if (!canManageDataset) {
      setDemoDone(false);
      setDemoMessage('Switch to the Admin demo user before restoring demo data.');
      return;
    }

    setDemoRunning(true);
    setDemoDone(false);
    setDemoProgress(0);
    setRestoreCounts(null);
    setDemoMessage(hasData ? 'Restoring and verifying bundled manufacturing demo data...' : 'Loading bundled manufacturing demo data...');

    try {
      const startPayload = await api.import.restoreDemo();
      if (!startPayload?.jobId) {
        throw new Error(startPayload?.error || startPayload?.message || 'Demo restore could not be started.');
      }

      setDemoProgress(Number(startPayload.progress || 5));
      if (startPayload.counts) setRestoreCounts(startPayload.counts);
      setDemoMessage(startPayload.message || 'Demo restore started.');

      let finalJob = null;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
        const job = await api.import.status(startPayload.jobId);

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
      setDemoMessage('Manufacturing demo dataset restored, dates re-anchored, and live counts refreshed.');
    } catch (err) {
      setDemoDone(false);
      setRestoreCounts(null);
      setDemoMessage(err?.message || 'Demo restore failed.');
      await refreshStatus({ keepExistingOnError: true });
    } finally {
      setDemoRunning(false);
    }
  }, [canManageDataset, demoRunning, hasData, refreshStatus]);

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      <RegisterOraclePanel title="Data Foundation">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Demo Readiness</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Start here to load or restore the Seer Manufacturing dataset before exploring the manufacturing use cases. The action prepares the governed Oracle AI Database 26ai foundation used by the command center, production signals, production risk graph, plant logistics map, analytics, and AI agents.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Why It Matters</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              The same foundation supports manufactured-part search, work order execution, supplier and quality signals, production-risk graph analysis, spatial routing, document projections, forecasting, and agent actions without splitting the story across separate data stores.
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
-- relational tables        -> suppliers, manufactured parts, plants, work orders, line items
-- json / duality views     -> work order and capacity documents
-- property graph           -> suppliers, parts, plants, work orders, production signals
-- spatial geometry         -> plant capacity centers, service zones, and demand regions
-- vector embeddings        -> manufactured part embeddings, signal embeddings, semantic matches
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
          Prepare the governed Seer Manufacturing dataset before you move into the manufacturing scenarios.
        </p>
      </div>

      <SceneStoryPanel scene="datamodel" />

      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Package size={18} className="text-[var(--color-accent)]" />
              Prepare the Dataset
            </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1 max-w-2xl">
              Load or restore the bundled manufacturing dataset, then verify the live record counts that power every use case in the demo.
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
            disabled={demoRunning || !canManageDataset}
          />
        </div>
        {!canManageDataset ? (
          <p className="text-xs tone-sienna mb-4">Switch to the Admin demo user to restore the bundled dataset.</p>
        ) : null}
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
                Showing the best available live and restore counts while Oracle rebuilds vector artifacts. Product vectors, signal vectors, and semantic matches refresh during the VECTOR_EMBEDDING step and remain visible as soon as the API reports them.
              </div>
            ) : null}
            {demoDone ? (
              <div className="flex items-center gap-1.5 text-[11px] tone-pine">
                <CheckCircle2 size={12} />
                Bundled manufacturing demo restore finished and live counts were refreshed.
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
          The restore prepares the production, operational, analytical, spatial, graph, vector, and agent data domains that the rest of the demo uses.
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
