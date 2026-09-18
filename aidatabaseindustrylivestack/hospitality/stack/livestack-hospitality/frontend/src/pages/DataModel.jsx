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
import { SceneStoryPanel } from '../components/HospitalityStory';
import { FeatureBadge, SqlBlock } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';
import { apiFetch } from '../utils/api';

const CAPABILITY_GROUPS = [
  {
    title: 'Operational Reservation Core',
    accent: '#437C94',
    icon: ShoppingCart,
    summary: 'Oracle stores property, room type, guest, reservation, folio, and service records in relational tables.',
    detail: 'ACID transactions keep reservations, folio amounts, service assignments, and guest history consistent.',
  },
  {
    title: 'Guest, Channel & Demand Signals',
    accent: '#A36472',
    icon: TrendingUp,
    summary: 'Guest reviews, channel discrepancies, service complaints, and property alerts link back to rooms and guests.',
    detail: 'Signal and room links show how guest, channel, and service events affect occupancy, room revenue, and guest experience.',
  },
  {
    title: 'Guest Experience Graph',
    accent: '#796087',
    icon: Network,
    summary: 'Guest, reservation, room, venue, department, channel, and service-request links provide graph traversal and relationship analysis.',
    detail: 'Graph queries trace recurring complaints, shared-service failures, and room-readiness delays to common causes.',
  },
  {
    title: 'Housekeeping and Maintenance Coverage',
    accent: '#8A4E2F',
    icon: MapPin,
    summary: 'Properties, service zones, room blocks, guest tiers, and arrival-pressure regions all live as Oracle Spatial geometry.',
    detail: 'The coverage map uses spatial proximity, buffered service zones, and regional operations overlays.',
  },
  {
    title: 'Reservation Documents',
    accent: '#8A4E2F',
    icon: FileJson,
    summary: 'The same data can be exposed as nested JSON documents without duplicating the underlying rows.',
    detail: 'Duality views expose relational data as document-style payloads for runtime inspection.',
  },
  {
    title: 'Occupancy Forecasts and Decisions',
    accent: '#3E6F4D',
    icon: BrainCircuit,
    summary: 'Demand forecasts, guest indexes, and agent actions use the same Oracle data.',
    detail: 'Oracle retrieves matching records, scores operating risks, predicts room revenue, and records agent actions.',
  },
];

const CAPABILITY_GROUPS_PER_PAGE = 3;

function StatusGrid({ status, projected = false }) {
  const cards = [
    { label: 'Properties and Room Types', value: status?.products ?? 0, accent: '#437C94' },
    { label: 'Guest Signals', value: status?.social_posts ?? 0, accent: '#A36472' },
    { label: 'Reservations', value: status?.orders ?? 0, accent: '#3E6F4D' },
    { label: 'Room Type Intelligence Index', value: status?.product_embeddings ?? 0, accent: '#4F7D7B', vector: true },
    { label: 'Guest Signal Index', value: status?.signal_embeddings ?? 0, accent: '#4F7D7B', vector: true },
    { label: 'Signal-Room Links', value: status?.semantic_matches ?? 0, accent: '#796087', vector: true },
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
    signal_embeddings: bestCount(counts?.signal_embeddings, fallbackStatus?.signal_embeddings, counts?.social_posts, fallbackStatus?.social_posts),
    semantic_matches: firstCount(counts, fallbackStatus, ['semantic_matches']),
    fulfillment_zones: firstCount(counts, fallbackStatus, ['fulfillment_zones']),
    demand_regions: firstCount(counts, fallbackStatus, ['demand_regions']),
  };
}

function hasCountData(counts) {
  return Boolean(counts) && Object.values(counts).some((value) => numericCount(value) > 0);
}

const BEST_STATUS_STORAGE_KEY = 'hospitalityLiveFootprintBestStatus';

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
  if (progress >= 92 || /vector artifacts|embedding|semantic/i.test(baseMessage)) {
    return `${baseMessage} Guest intelligence indexes are rebuilt during the final step and appear when the restore finishes.`;
  }
  return baseMessage;
}

export default function DataModel() {
  const { currentUser } = useUser();
  const [status, setStatus] = useState(() => readStoredBestStatus());
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoDone, setDemoDone] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoMessage, setDemoMessage] = useState('');
  const [restoreCounts, setRestoreCounts] = useState(null);
  const [loadedGroupPage, setLoadedGroupPage] = useState(0);

  const refreshStatus = useCallback(async ({ keepExistingOnError = true } = {}) => {
    try {
      const data = await apiFetch('/demo/status');
      setStatus((previousStatus) => {
        const mergedStatus = mergeBestStatus(data, previousStatus);
        writeStoredBestStatus(mergedStatus);
        return mergedStatus;
      });
      return data;
    } catch {
      if (!keepExistingOnError) setStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!currentUser?.USERNAME) return undefined;
    let cancelled = false;
    refreshStatus({ keepExistingOnError: false }).then((data) => {
      if (cancelled && data) return;
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.USERNAME, refreshStatus]);

  useEffect(() => {
    if (!currentUser?.USERNAME) return undefined;
    const refreshTimer = window.setInterval(() => {
      refreshStatus({ keepExistingOnError: true });
    }, 10000);
    const handleFocus = () => refreshStatus({ keepExistingOnError: true });
    const handleFootprintRefresh = () => refreshStatus({ keepExistingOnError: true });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('hospitality-live-footprint-refresh', handleFootprintRefresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('hospitality-live-footprint-refresh', handleFootprintRefresh);
    };
  }, [currentUser?.USERNAME, refreshStatus]);

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
      (displayStatus.signal_embeddings || 0) +
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
    setDemoMessage(hasData ? 'Restoring and verifying bundled demo data...' : 'Loading bundled demo data...');

    try {
      const startPayload = await apiFetch('/import/restore-demo', {
        method: 'POST',
        body: JSON.stringify({ source: 'data-model-load-demo' }),
      });
      if (!startPayload.jobId) {
        throw new Error(startPayload.error || startPayload.message || 'Demo restore could not be started.');
      }

      setDemoProgress(Number(startPayload.progress || 5));
      if (startPayload.counts) setRestoreCounts(startPayload.counts);
      setDemoMessage(startPayload.message || 'Demo restore started.');

      let finalJob = null;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
        const job = await apiFetch(`/import/status/${encodeURIComponent(startPayload.jobId)}`);
        if (!job) {
          throw new Error(job?.error || 'Demo restore status could not be read.');
        }

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
      setDemoMessage('Demo dataset restored and live counts were refreshed.');
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
              Load or restore the demo dataset before starting Scene 2. The same Oracle AI Database 26ai instance serves the property dashboard, guest signal search, graph, service coverage map, OML analytics, and agents.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Why It Matters</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Reservations, guest signals, service locations, forecasts, and agent actions stay in one database. Each page queries the same records instead of copying data into separate stores.
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
-- relational tables        -> brands, products, guests, orders, order_items (properties, room types, guests, reservations)
-- json / duality views     -> orders_dv, products_capacity_dv (reservation and capacity documents)
-- property graph           -> source relationships and property links
-- spatial geometry         -> fulfillment_centers, fulfillment_zones, demand_regions (service coverage)
-- vector embeddings        -> product_embeddings, signal_embeddings, signal-room matches
-- in-database analytics    -> forecasts, segmentation, scoring
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
          Load the hospitality demo data, then check the live record counts.
        </p>
      </div>

      <div className="glass-card p-5" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <p className="text-base text-[var(--color-text)] leading-7">
          The restore loads properties, room types, guests, reservations, service requests, guest and demand signals, service areas, guest indexes, forecasts, and agent audit records. When it finishes, check the counts below before you continue.
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
              Load or restore the bundled demo data. Check the record counts before continuing.
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
          {totalArtifacts == null ? 'Current record counts from the running demo.' : `${totalArtifacts.toLocaleString()} records are ready for the demo.`}
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
                    ? '#3E6F4D'
                    : 'linear-gradient(135deg, #A73529, #8A4E2F)',
                }}
              />
            </div>
            {showingProjectedCounts ? (
              <div className="text-[11px] text-[var(--color-text-dim)]">
                The page shows restore counts while Oracle rebuilds the guest indexes. Room, signal, and match counts update when the API returns them.
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
          The restore loads six data groups used in later scenes.
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
                  background: loadedGroupPage === index ? '#8A4E2F' : 'var(--color-border)',
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
