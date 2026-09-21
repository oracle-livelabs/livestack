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
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { JetButton } from '../components/JetControls';
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { RetailSceneStory } from '../components/RetailStory';
import { api } from '../utils/api';
import { useUser } from '../context/UserContext';

const CAPABILITY_GROUPS = [
  {
    title: 'Sporting Goods Operations Core',
    accent: '#437C94',
    icon: ShoppingCart,
    summary: 'Brands, AllTerrain Hiking Boots, customers, orders, and line items remain the relational system of record.',
    detail: 'This is the operational core: ACID transactions, pricing, fulfillment routing, customer history, and service context.',
  },
  {
    title: 'Customer Trend Signals',
    accent: '#A36472',
    icon: TrendingUp,
    summary: 'Creator posts, reviews, mentions, and momentum flags connect outdoor and fitness demand signals to the retail catalog.',
    detail: 'Signal posts and product mentions let the demo track how community content affects demand, service exposure, and merchandising decisions for sporting goods.',
  },
  {
    title: 'Creator and Product Graph',
    accent: '#796087',
    icon: Network,
    summary: 'Creator, community, brand, and product links provide graph traversal and relationship analysis.',
    detail: 'The graph layer explains AllTerrain demand propagation, creator collaboration paths, product affinity, and retail partnership strength.',
  },
  {
    title: 'Sporting Goods Fulfillment Layer',
    accent: '#AA643B',
    icon: MapPin,
    summary: 'Centers, service zones, routes, and demand regions all live as Oracle Spatial geometry.',
    detail: 'The fulfillment map uses spatial proximity, buffered zones, and regional demand overlays to plan sporting-goods delivery and replenishment.',
  },
  {
    title: 'JSON Relational Duality',
    accent: '#AA643B',
    icon: FileJson,
    summary: 'The same order data can be exposed as nested JSON documents without duplicating the underlying rows.',
    detail: 'Duality views expose sporting-goods orders as document-style payloads for API, fulfillment, and service workflows.',
  },
  {
    title: 'ML, Vector, and Returns Analytics',
    accent: '#4C825C',
    icon: BrainCircuit,
    summary: 'Forecasts, vector search, and governed returns analysis run against the same Oracle data foundation.',
    detail: 'This is where semantic retrieval, AllTerrain demand scoring, replenishment risk, and service decisions converge.',
  },
];

const CAPABILITY_GROUPS_PER_PAGE = 3;
const DEMO_RESTORE_INITIAL_POLL_DELAY_MS = 500;
const DEMO_RESTORE_POLL_INTERVAL_MS = 1500;
const DEMO_RESTORE_TIMEOUT_MS = 15 * 60 * 1000;

function StatusGrid({ status, projected = false }) {
  const cards = [
    { label: 'Products', value: status?.products ?? 0, accent: '#437C94' },
    { label: 'Signal Posts', value: status?.social_posts ?? 0, accent: '#A36472' },
    { label: 'Orders', value: status?.orders ?? 0, accent: '#4C825C' },
    { label: 'Product Vectors', value: status?.product_embeddings ?? 0, accent: '#4F7D7B', vector: true },
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

function firstCount(source, fallback, keys) {
  for (const key of keys) {
    const count = numericCount(source?.[key]);
    if (count !== null) return count;
  }
  for (const key of keys) {
    const count = numericCount(fallback?.[key]);
    if (count !== null) return count;
  }
  return 0;
}

function restoreCountsToStatus(counts, fallbackStatus) {
  if (!counts && !fallbackStatus) return null;
  return {
    products: firstCount(counts, fallbackStatus, ['products']),
    social_posts: firstCount(counts, fallbackStatus, ['social_posts']),
    orders: firstCount(counts, fallbackStatus, ['orders']),
    product_embeddings: firstCount(counts, fallbackStatus, ['product_embeddings']),
    post_embeddings: firstCount(counts, fallbackStatus, ['post_embeddings', 'signal_embeddings']),
    semantic_matches: firstCount(counts, fallbackStatus, ['semantic_matches']),
    fulfillment_zones: firstCount(counts, fallbackStatus, ['fulfillment_zones']),
    demand_regions: firstCount(counts, fallbackStatus, ['demand_regions']),
  };
}

function hasCountData(counts) {
  return Boolean(counts) && Object.values(counts).some((value) => numericCount(value) > 0);
}

function restoreMessageForJob(job) {
  const baseMessage = job?.message || 'Restoring bundled demo dataset...';
  const progress = Number(job?.progress ?? 0);
  if (progress >= 92 || /vector artifacts|embedding|semantic/i.test(baseMessage)) {
    return `${baseMessage} Vector counts are rebuilt with Oracle VECTOR_EMBEDDING and appear after this final step finishes.`;
  }
  return baseMessage;
}

function normalizeRestoreStatus(jobStatus, { demoRunning = false, demoDone = false } = {}) {
  const normalized = String(jobStatus || '').toLowerCase();
  if (demoDone || ['completed', 'complete', 'success'].includes(normalized)) return 'completed';
  if (['failed', 'error'].includes(normalized)) return 'failed';
  if (demoRunning || ['queued', 'running', 'starting'].includes(normalized)) return 'running';
  return normalized || null;
}

function restoreStatusLabel(status, progress) {
  if (status === 'completed') return 'Completed successfully';
  if (status === 'failed') return 'Restore failed';
  if (status === 'running' && Number(progress) >= 100) return 'Finalizing activation';
  if (status === 'running') return 'Restore in progress';
  return 'Restore status pending';
}

export default function DataModel() {
  const { currentUser } = useUser();
  const isAdmin = String(currentUser?.ROLE || '').toLowerCase() === 'admin';
  const [status, setStatus] = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoMessage, setDemoMessage] = useState('');
  const [restoreCounts, setRestoreCounts] = useState(null);
  const [restoreJob, setRestoreJob] = useState(null);
  const [loadedGroupPage, setLoadedGroupPage] = useState(0);
  const statusGeneration = useRef(0);
  const statusAbort = useRef(null);

  const refreshStatus = useCallback(async ({ keepExistingOnError = true } = {}) => {
    const generation = ++statusGeneration.current;
    statusAbort.current?.abort();
    const controller = new AbortController();
    statusAbort.current = controller;
    try {
      const data = await api.demo.status({ signal: controller.signal });
      if (generation !== statusGeneration.current || controller.signal.aborted) return null;
      setStatus(data);
      return data;
    } catch {
      if (generation === statusGeneration.current && !controller.signal.aborted && !keepExistingOnError) {
        setStatus(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const clearPersonaOrDatasetState = () => {
      statusGeneration.current += 1;
      statusAbort.current?.abort();
      setStatus(null);
      setRestoreCounts(null);
      setRestoreJob(null);
      setDemoDone(false);
      setDemoProgress(0);
      setDemoMessage('');
      void refreshStatus({ keepExistingOnError: false });
    };
    window.addEventListener('retail-demo-user-changed', clearPersonaOrDatasetState);
    window.addEventListener('retail-dataset-revision', clearPersonaOrDatasetState);
    return () => {
      window.removeEventListener('retail-demo-user-changed', clearPersonaOrDatasetState);
      window.removeEventListener('retail-dataset-revision', clearPersonaOrDatasetState);
    };
  }, [refreshStatus]);

  useEffect(() => {
    void refreshStatus({ keepExistingOnError: false });
    return () => {
      statusGeneration.current += 1;
      statusAbort.current?.abort();
    };
  }, [refreshStatus]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      refreshStatus({ keepExistingOnError: true });
    }, 10000);
    const handleFocus = () => refreshStatus({ keepExistingOnError: true });
    const handleFootprintRefresh = () => refreshStatus({ keepExistingOnError: true });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('retail-live-footprint-refresh', handleFootprintRefresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('retail-live-footprint-refresh', handleFootprintRefresh);
    };
  }, [refreshStatus]);

  const displayStatus = useMemo(() => {
    if (demoRunning && hasCountData(restoreCounts)) {
      return restoreCountsToStatus(restoreCounts, status);
    }
    return restoreCountsToStatus(null, status);
  }, [demoRunning, restoreCounts, status]);

  const showingProjectedCounts = demoRunning && hasCountData(restoreCounts);
  const restoreStatus = normalizeRestoreStatus(restoreJob?.status, { demoRunning, demoDone });
  const restoreStatusText = restoreStatusLabel(restoreStatus, demoProgress);

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

  const loadedGroupPageCount = Math.ceil(CAPABILITY_GROUPS.length / CAPABILITY_GROUPS_PER_PAGE);
  const loadedGroupStart = loadedGroupPage * CAPABILITY_GROUPS_PER_PAGE;
  const visibleLoadedGroups = CAPABILITY_GROUPS.slice(loadedGroupStart, loadedGroupStart + CAPABILITY_GROUPS_PER_PAGE);
  const loadedGroupEnd = Math.min(loadedGroupStart + visibleLoadedGroups.length, CAPABILITY_GROUPS.length);
  const canShowPreviousLoadedGroups = loadedGroupPage > 0;
  const canShowNextLoadedGroups = loadedGroupPage < loadedGroupPageCount - 1;

  const showPreviousLoadedGroups = () => {
    setLoadedGroupPage((page) => Math.max(0, page - 1));
  };

  const showNextLoadedGroups = () => {
    setLoadedGroupPage((page) => Math.min(loadedGroupPageCount - 1, page + 1));
  };

  const startDemoRefresh = useCallback(async () => {
    if (demoRunning) return;

    setDemoRunning(true);
    setDemoDone(false);
    setDemoProgress(0);
    setRestoreCounts(null);
    setRestoreJob({ status: 'starting', progress: 0 });
    setDemoMessage(hasData ? 'Restoring and verifying bundled demo data...' : 'Loading bundled demo data...');

    try {
      if (!isAdmin) throw new Error('Only the Administrator can restore demo data.');
      const startPayload = await api.import.restoreDemo();
      if (!startPayload.jobId) {
        throw new Error(startPayload.error || startPayload.message || 'Demo restore could not be started.');
      }

      setDemoProgress(Number(startPayload.progress || 5));
      if (startPayload.counts) setRestoreCounts(startPayload.counts);
      setRestoreJob({
        jobId: startPayload.jobId,
        status: 'queued',
        progress: Number(startPayload.progress || 5),
        message: startPayload.message || 'Demo restore started.',
      });
      setDemoMessage(startPayload.message || 'Demo restore started.');

      let finalJob = null;
      let attempt = 0;
      const restoreDeadline = Date.now() + DEMO_RESTORE_TIMEOUT_MS;
      while (Date.now() < restoreDeadline) {
        await new Promise((resolve) => setTimeout(
          resolve,
          attempt === 0 ? DEMO_RESTORE_INITIAL_POLL_DELAY_MS : DEMO_RESTORE_POLL_INTERVAL_MS
        ));
        const job = await api.import.status(startPayload.jobId);
        if (!job) {
          throw new Error(job?.error || 'Demo restore status could not be read.');
        }

        const progress = Math.max(0, Math.min(100, Number(job.progress ?? 0)));
        setDemoProgress(progress);
        if (job.counts) setRestoreCounts(job.counts);
        setRestoreJob({
          ...job,
          jobId: job.jobId || startPayload.jobId,
          status: String(job.status || 'running').toLowerCase(),
          progress,
        });
        if (attempt % 3 === 0 || progress >= 90) {
          await refreshStatus({ keepExistingOnError: true });
        }
        setDemoMessage(restoreMessageForJob(job));

        const jobStatus = String(job.status || '').toLowerCase();
        if (jobStatus === 'completed' || jobStatus === 'complete' || jobStatus === 'success' || jobStatus === 'failed' || jobStatus === 'error') {
          finalJob = job;
          break;
        }
        attempt += 1;
      }

      if (!finalJob) {
        setRestoreJob((current) => ({
          ...current,
          jobId: startPayload.jobId,
          status: 'running',
          background: true,
          message: `Restore is still running in the background (job ${startPayload.jobId}).`,
        }));
        throw new Error(
          `Demo restore is still running in the background (job ${startPayload.jobId}). `
          + 'This page stopped waiting after 15 minutes; the database job was not cancelled.'
        );
      }
      if (!['completed', 'complete', 'success'].includes(String(finalJob.status || '').toLowerCase())) {
        setRestoreJob((current) => ({
          ...current,
          ...finalJob,
          jobId: finalJob.jobId || startPayload.jobId,
          status: String(finalJob.status || 'failed').toLowerCase(),
        }));
        throw new Error(finalJob.message || finalJob.errors?.[0] || 'Demo restore failed.');
      }

      const nextStatus = await refreshStatus({ keepExistingOnError: false });
      const countsVerified = Boolean(nextStatus && Object.values(nextStatus).some((value) => typeof value === 'number' && value > 0));

      setRestoreCounts(null);
      setDemoDone(true);
      setDemoProgress(100);
      setRestoreJob((current) => ({
        ...current,
        ...finalJob,
        jobId: finalJob.jobId || startPayload.jobId,
        status: 'completed',
        progress: 100,
        verification: countsVerified ? 'verified' : 'refreshing',
      }));
      setDemoMessage(countsVerified
        ? 'Demo dataset restored and live counts were refreshed.'
        : 'Demo dataset restore completed successfully; live counts are still refreshing.');
    } catch (err) {
      setDemoDone(false);
      setRestoreCounts(null);
      setRestoreJob((current) => ({
        ...current,
        status: current?.status === 'running' && current?.background ? 'running' : 'failed',
        error: err?.message || 'Demo restore failed.',
      }));
      setDemoMessage(err?.message || 'Demo restore failed.');
      await refreshStatus({ keepExistingOnError: true });
    } finally {
      setDemoRunning(false);
    }
  }, [demoRunning, hasData, isAdmin, refreshStatus]);
  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      <RegisterOraclePanel title="Data Foundation">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Restore execution</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Restore Demo Data starts a durable <span className="font-mono">APP_DATASET_JOBS</span> job; the browser only polls its status and never owns the database transaction. The job holds the singleton dataset lease, stages and validates rows, rebuilds Spatial, Vector, Duality, In-Memory, and OML assets, and publishes a new active generation only after its required readiness checks pass.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Why It Matters</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              A timed-out browser wait does not cancel the durable job. <span className="font-mono">APP_DATASET_STATE</span> and <span className="font-mono">APP_DATASET_READINESS</span> remain the authoritative generation and feature-readiness records used by downstream scenes.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Relational Core" color="blue" />
            <FeatureBadge label="JSON Duality Views" color="orange" />
            <FeatureBadge label="Property Graph" color="purple" />
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="Vector Search" color="cyan" />
            <FeatureBadge label="In-DB ML" color="red" />
            <FeatureBadge label="Durable dataset job" color="blue" />
            <FeatureBadge label="Generation activation" color="green" />
            <FeatureBadge label="Returns Decisions" color="pink" />
          </div>
          <SqlBlock
            code={`-- Status read used by the restore workflow
SELECT dataset_source, dataset_version, job_id,
       status, readiness, failure_message,
       activated_at, updated_at
FROM app_dataset_readiness
WHERE readiness_id = 1;

-- Durable job progress polled by /api/import/status/:jobId
SELECT job_id, operation, status,
       JSON_VALUE(payload, '$.phase') AS phase,
       progress, message, payload,
       created_at, started_at, completed_at
FROM app_dataset_jobs
WHERE job_id = :job_id;`}
          />
          <p className="text-xs text-[var(--color-text-dim)] leading-relaxed">
            Activation is server-controlled: staged data and derived assets are validated first, then the active generation, readiness JSON, and completed job result are committed. Failed candidates never become the active dataset.
          </p>
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Database size={24} className="text-[var(--color-accent)]" />
          Data Foundation
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Prepare the governed Seer Sporting Goods dataset before you move into the AllTerrain Hiking Boots scenario and the connected retail operations use cases.
        </p>
      </div>

      <RetailSceneStory scene="datamodel" />

      <div className="glass-card p-5" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <p className="text-base text-[var(--color-text)] leading-7">
          Start here to load the Seer Sporting Goods demo dataset. This action prepares sporting-goods products, customers, orders, return requests, service cases, customer demand signals, fulfillment geography, vector embeddings, and ML outputs. Once the load completes, the live footprint confirms that the database is ready for the AllTerrain Hiking Boots demo journey.
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
              Load or restore the bundled sporting-goods dataset, then verify the live record counts that power every use case in the demo.
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
            disabled={demoRunning || !isAdmin}
          />
        </div>
        {!isAdmin && (
          <p className="text-xs tone-sienna mb-4" role="note">
            Live footprint counts are scoped to the selected persona. Only the Administrator can load or restore data.
          </p>
        )}
        <p className="text-xs text-[var(--color-text-dim)] mb-4">
          {totalArtifacts == null ? 'Current runtime counts from the live demo stack.' : `${totalArtifacts.toLocaleString()} tracked records across the major demo layers.`}
        </p>
        {(demoMessage || demoRunning || demoDone || restoreJob) && (
          <div className="mb-4 space-y-2">
            <div
              className="rounded-lg border p-3 space-y-2"
              style={{
                borderColor: restoreStatus === 'completed'
                  ? 'rgba(76, 130, 92, 0.55)'
                  : restoreStatus === 'failed'
                    ? 'rgba(199, 70, 52, 0.55)'
                    : 'var(--color-border)',
                background: 'var(--color-surface)',
              }}
              role="status"
              aria-live="polite"
              aria-label={`Demo restore status: ${restoreStatusText}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {restoreStatus === 'completed' ? <CheckCircle2 size={15} className="tone-pine" aria-hidden="true" /> : null}
                  {restoreStatus === 'failed' ? <AlertTriangle size={15} className="tone-red" aria-hidden="true" /> : null}
                  {restoreStatus === 'running' ? <Loader2 size={15} className="animate-spin text-[var(--color-accent)]" aria-hidden="true" /> : null}
                  <span className="text-xs font-semibold">{restoreStatusText}</span>
                </div>
                <span className="text-xs font-mono font-semibold">{demoProgress}%</span>
              </div>
              <p className="text-xs text-[var(--color-text-dim)]">{demoMessage || 'Waiting for demo restore...'}</p>
              {restoreJob?.jobId ? (
                <p className="text-[11px] text-[var(--color-text-dim)]">
                  Job <span className="font-mono">{restoreJob.jobId}</span>
                  {restoreJob.phase ? ` · phase ${String(restoreJob.phase).replaceAll('_', ' ')}` : ''}
                </p>
              ) : null}
              {restoreStatus === 'completed' ? (
                <p className="text-[11px] tone-pine">
                  All staged rows, derived assets, and readiness checks completed successfully.
                  {restoreJob?.activeDataset?.generationId ? ` Active generation: ${restoreJob.activeDataset.generationId}.` : ''}
                  {restoreJob?.verification === 'refreshing' ? ' Live footprint counts are still refreshing.' : ''}
                </p>
              ) : null}
              {restoreStatus === 'failed' ? (
                <p className="text-[11px] tone-red">The active dataset was not activated. Review the job details and try again.</p>
              ) : null}
              {restoreStatus === 'running' && Number(demoProgress) >= 100 ? (
                <p className="text-[11px] text-[var(--color-text-dim)]">The job reported 100% data work; Oracle is completing final activation and readiness publication.</p>
              ) : null}
            </div>
            <div className="h-2 rounded-full bg-[var(--color-border)]/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${demoProgress}%`,
                  background: restoreStatus === 'completed'
                    ? '#4C825C'
                    : restoreStatus === 'failed'
                      ? '#C74634'
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
                {restoreJob?.verification === 'refreshing'
                  ? 'Bundled demo restore finished; live counts are still refreshing.'
                  : 'Bundled demo restore finished and live counts were refreshed.'}
              </div>
            ) : null}
          </div>
        )}
        <StatusGrid status={displayStatus} projected={showingProjectedCounts} />
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Boxes size={18} className="text-[var(--color-accent)]" />
            What Gets Loaded
          </h3>
          <div className="flex items-center gap-2" aria-label="Loaded data carousel controls">
            <button
              type="button"
              aria-label="Show previous loaded data domains"
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
              aria-label="Show next loaded data domains"
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
        <p className="text-sm text-[var(--color-text-dim)] leading-6 mb-4">
          The restore prepares the operational, returns, analytical, spatial, graph, and vector data domains used by the AllTerrain Hiking Boots story and the rest of the demo.
        </p>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
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
