import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, Eye, Truck, Bot, DollarSign,
  Activity, Flame, RefreshCw, Search, X, Package, MapPin,
  ChevronRight, Clock, Database
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, formatScore, getMomentumColor, timeAgo } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/ManufacturingStory';
import { ChartLegend, DefinitionRow, MetricChip } from '../components/MetricDefinition';

function StatCard({ iconClass, label, value, subValue, color = 'var(--color-accent)', trend }) {
  return (
    <div className="stat-card dashboard-stat-card">
      <div className="flex items-start justify-between">
        <div className="dashboard-stat-card__icon" style={{ background: `${color}18`, color }}>
          <span className={`${iconClass} oj-fwk-icon`} aria-hidden="true" />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend > 0 ? 'tone-pine' : 'tone-red'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="dashboard-stat-card__copy">
        <p className="dashboard-stat-card__value">{value}</p>
        <p className="dashboard-stat-card__label">{label}</p>
      </div>
      {subValue && <p className="dashboard-stat-card__meta">{subValue}</p>}
    </div>
  );
}

/* ─── Manufactured Part Detail Modal ─────────────────────────────────────────────── */
function ProductDetailModal({ productId, onClose }) {
  const { data, loading, error } = useData(() => api.products.detail(productId), [productId]);
  const { data: duality, loading: loadingDuality, error: dualityError } = useData(
    () => api.manufacturing.parts.document(productId),
    [productId]
  );
  const [tab, setTab] = useState('details'); // 'details' | 'json'
  const [copied, setCopied] = useState(false);

  // Close on Escape or backdrop click
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const copyJson = useCallback(() => {
    if (duality?.document) {
      navigator.clipboard.writeText(JSON.stringify(duality.document, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [duality]);

  const product = data?.product;
  const inventory = data?.inventory || [];

  const totalOnHand = inventory.reduce((sum, r) => sum + (r.QUANTITY_ON_HAND || 0), 0);
  const totalReserved = inventory.reduce((sum, r) => sum + (r.QUANTITY_RESERVED || 0), 0);
  const totalAvailable = inventory.reduce(
    (sum, row) => sum + Math.max((row.QUANTITY_ON_HAND || 0) - (row.QUANTITY_RESERVED || 0), 0),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(49,45,42,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-card w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        style={{ border: '1px solid var(--color-border)', borderRadius: 16 }}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-[var(--color-border)]">
          {loading ? (
            <div className="space-y-2">
              <div className="h-5 w-48 rounded bg-[var(--color-surface-hover)] animate-pulse" />
              <div className="h-3 w-32 rounded bg-[var(--color-surface-hover)] animate-pulse" />
            </div>
          ) : product ? (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold">{product.PRODUCT_NAME}</h3>
                {product.PEAK_MOMENTUM && (
                  <span className={`momentum-badge momentum-${product.PEAK_MOMENTUM}`}>
                    {MOMENTUM_LABELS[product.PEAK_MOMENTUM] || product.PEAK_MOMENTUM?.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-text-dim)]">
                <span>{product.BRAND_NAME}</span>
                <span>·</span>
                <span>{product.CATEGORY}</span>
                <span>·</span>
                <span className="font-medium text-[var(--color-text)]">{formatCurrency(product.UNIT_PRICE)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm tone-red">{error || 'Failed to load product'}</p>
          )}
          <button onClick={onClose} className="btn-ghost p-1.5 ml-4 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* View toggle tabs */}
        {!loading && product && (
          <div className="flex items-center gap-1 px-5 pt-3 pb-0">
            <button onClick={() => setTab('details')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={tab === 'details' ? {
                background: 'rgba(67,124,148,0.15)', border: '1px solid rgba(67,124,148,0.4)', color: '#437C94'
              } : {
                background: 'transparent', border: '1px solid transparent', color: 'var(--color-text-dim)'
              }}>
              <Package size={12} /> Details
            </button>
            <button onClick={() => setTab('json')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={tab === 'json' ? {
                background: 'rgba(170,100,59,0.15)', border: '1px solid rgba(170,100,59,0.4)', color: '#AA643B'
              } : {
                background: 'transparent', border: '1px solid transparent', color: 'var(--color-text-dim)'
              }}>
              <Activity size={12} /> JSON Duality View
            </button>
            <span className="text-[10px] text-[var(--color-text-dim)] ml-2 hidden sm:inline">
              Same data - two interfaces
            </span>
          </div>
        )}

        {!loading && product && tab === 'details' && (
          <div className="p-5 space-y-5">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(76,130,92,0.05)', borderColor: 'rgba(76,130,92,0.2)' }}>
                <p className="text-lg font-bold tone-pine">{formatNumber(totalOnHand)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Total On Hand</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(170,100,59,0.05)', borderColor: 'rgba(170,100,59,0.2)' }}>
                <p className="text-lg font-bold tone-sienna">{formatNumber(totalReserved)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Reserved</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(67,124,148,0.05)', borderColor: 'rgba(67,124,148,0.2)' }}>
                <p className="text-lg font-bold tone-ocean">{formatNumber(totalAvailable)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Available to Promise</p>
              </div>
            </div>

            {/* Inventory Breakdown */}
            {inventory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Capacity by Plant
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Center</th>
                        <th className="text-left py-2 px-2">Location</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-right py-2 px-2">On Hand</th>
                        <th className="text-right py-2 px-2">Reserved</th>
                        <th className="text-right py-2 px-2">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((inv, i) => {
                        const available = (inv.QUANTITY_ON_HAND || 0) - (inv.QUANTITY_RESERVED || 0);
                        const isLow = available < 20;
                        return (
                          <tr key={i} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)]">
                            <td className="py-2 px-2 font-medium">{inv.CENTER_NAME}</td>
                            <td className="py-2 px-2 text-[var(--color-text-dim)]">{inv.CITY}, {inv.STATE_PROVINCE}</td>
                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                style={{
                                  background: inv.CENTER_TYPE === 'distribution' ? 'rgba(67,124,148,0.15)' :
                                              inv.CENTER_TYPE === 'warehouse' ? 'rgba(76,130,92,0.15)' : 'rgba(170,100,59,0.15)',
                                  color: inv.CENTER_TYPE === 'distribution' ? '#437C94' :
                                         inv.CENTER_TYPE === 'warehouse' ? '#4C825C' : '#AA643B',
                                }}>
                                {inv.CENTER_TYPE}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right">{formatNumber(inv.QUANTITY_ON_HAND)}</td>
                            <td className="py-2 px-2 text-right tone-sienna">{formatNumber(inv.QUANTITY_RESERVED)}</td>
                            <td className={`py-2 px-2 text-right font-medium ${isLow ? 'tone-red' : 'tone-pine'}`}>
                              {formatNumber(available)}{isLow ? ' ⚠' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {inventory.length === 0 && (
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No detailed data available for this manufactured part.</p>
            )}
          </div>
        )}

        {/* JSON Duality View Tab */}
        {!loading && product && tab === 'json' && (
          <div className="p-5 space-y-4">
            {loadingDuality ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-8 justify-center">
                <RefreshCw size={14} className="animate-spin" /> Querying MANUFACTURED_PART_CAPACITY_DV…
              </div>
            ) : dualityError ? (
              <p className="text-sm tone-red text-center py-8">{dualityError}</p>
            ) : duality?.document ? (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#AA643B]/10 text-[#AA643B] border border-[#AA643B]/30 font-mono">
                      {duality.sourceObject}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)]">
                      {duality.executionMode === 'duality-view' ? 'Oracle duality view' : duality.executionMode}
                      {duality.readOnly ? ' · read-only' : ''}
                    </span>
                  </div>
                  <button onClick={copyJson}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:border-[#AA643B]/50 text-[var(--color-text-dim)] hover:text-[#AA643B] transition-colors">
                    {copied ? <span className="tone-pine">✓ Copied</span> : 'Copy JSON'}
                  </button>
                </div>

                <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)' }}>
                  <span className="text-[#AA643B] font-semibold">Manufactured Part + Capacity as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> - The same manufactured part and capacity data from the Details tab, exposed as a single nested JSON document.
                  Oracle maps the normalized part, product-line, capacity, and plant rows into one read-only domain document with keyed nested objects.</span>
                </div>

                <div className="dashboard-duality-json-panel">
                  <div className="dashboard-duality-json-panel__header">
                    <span className="dashboard-duality-json-panel__title">JSON Document</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {duality.document.plantCapacity?.length || 0} plant capacity records
                    </span>
                  </div>
                  <pre className="dashboard-duality-json-panel__body">
{JSON.stringify(duality.document, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-dim)] text-center py-8">Unable to load duality view data</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Trending Table ───────────────────────────────────────────────────── */
function TrendingTable({ products, onSelect, selectedId }) {
  if (!products?.length) return <p className="text-sm text-[var(--color-text-dim)]">No high-demand manufactured part data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
            <th className="text-left py-2 px-3">Manufactured Part</th>
            <th className="text-left py-2 px-3">Product Line</th>
            <th className="text-right py-2 px-3">Unit Value</th>
            <th className="text-right py-2 px-3">Signals</th>
            <th className="text-right py-2 px-3">Observations</th>
            <th className="text-right py-2 px-3">Urgency</th>
            <th className="text-center py-2 px-3">Momentum</th>
            <th className="py-2 px-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const isSelected = selectedId === p.PRODUCT_ID;
            const averageUrgencyScore = p.AVG_URGENCY ?? p.AVERAGE_URGENCY_SCORE;
            const formattedUrgencyScore = formatScore(averageUrgencyScore);
            const rowLabel = `${p.PRODUCT_NAME}, ${p.BRAND_NAME}, category ${p.CATEGORY}, unit value ${formatCurrency(p.UNIT_PRICE)}, ${formatNumber(p.SIGNAL_COUNT)} production signals, urgency ${formattedUrgencyScore} out of 100`;
            return (
              <tr
                key={p.PRODUCT_ID || i}
                onClick={() => onSelect(p.PRODUCT_ID)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(p.PRODUCT_ID);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${rowLabel}. Open capacity and production signal details.`}
                title={rowLabel}
                className="accessible-row border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                style={isSelected ? { background: 'rgba(199,70,52,0.12)', borderColor: 'rgba(199,70,52,0.3)' } : {}}
              >
                <td className="py-2.5 px-3">
                  <div className="font-medium">{p.PRODUCT_NAME}</div>
                  <div className="text-[10px] text-[var(--color-text-dim)]">{p.CATEGORY}</div>
                </td>
                <td className="py-2.5 px-3 text-[var(--color-text-dim)]">{p.BRAND_NAME}</td>
                <td className="py-2.5 px-3 text-right font-semibold">{formatCurrency(p.UNIT_PRICE)}</td>
                <td className="py-2.5 px-3 text-right font-semibold">{formatNumber(p.SIGNAL_COUNT)}</td>
                <td className="py-2.5 px-3 text-right font-semibold">{formatNumber(p.TOTAL_OBSERVATIONS)}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className="font-mono font-bold" style={{ color: getMomentumColor(p.PEAK_MOMENTUM) }}>
                    {formattedUrgencyScore} / 100
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`momentum-badge momentum-${p.PEAK_MOMENTUM}`}>
                    {MOMENTUM_LABELS[p.PEAK_MOMENTUM] || p.PEAK_MOMENTUM?.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-2.5 px-2 text-[var(--color-text-dim)]">
                  <ChevronRight size={13} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CHART_COLORS = ['#C74634', '#4F7D7B', '#AA643B', '#4C825C', '#A36472', '#437C94', '#796087', '#AA643B'];

const MOMENTUM_FILTERS = ['', 'critical', 'escalating', 'elevated'];
const MOMENTUM_LABELS  = { '': 'All', critical: 'Critical', escalating: 'Escalating', elevated: 'Elevated', stable: 'Stable' };

const VELOCITY_RANGES = [
  { label: '1h',  hours: 1 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '7d',  hours: 168 },
  { label: '30d', hours: 720 },
  { label: '1y',  hours: 8760 },
];

const MOMENTUM_DEFINITIONS = [
  { label: 'Critical', description: 'urgent production signal with high amplification', scale: 'urgency 85-100' },
  { label: 'Escalating', description: 'rapidly increasing supplier or quality pressure', scale: 'urgency 65-84' },
  { label: 'Rising', description: 'early signal trend to watch this shift', scale: 'urgency 45-64' },
  { label: 'Stable', description: 'baseline operating signal level', scale: '<45' },
];

function formatActionName(value) {
  return String(value || 'agent_action').replace(/_/g, ' ');
}

function DashboardAgentActions({ actions }) {
  if (!actions?.length) {
    return <p className="text-sm text-[var(--color-text-dim)]">No recent agent actions are logged yet.</p>;
  }

  return (
    <div className="dashboard-agent-actions">
      {actions.slice(0, 4).map((action) => (
        <article key={action.ACTION_ID} className="dashboard-agent-action">
          <div className="dashboard-agent-action__top">
            <span className="dashboard-agent-action__type">{formatActionName(action.ACTION_TYPE)}</span>
            <span className="dashboard-agent-action__pill">{action.ACTION_STATUS || action.EXECUTION_STATUS || 'proposed'}</span>
          </div>
          <p className="dashboard-agent-action__impact">{action.ACTION_IMPACT || 'No impact statement recorded.'}</p>
          <div className="dashboard-agent-action__meta">
            <span>Owner: <strong>{action.OWNER_SYSTEM || action.AGENT_NAME}</strong></span>
            <span>Time saved: <strong>{action.ESTIMATED_TIME_SAVED || 'Not recorded'}</strong></span>
            <span>Confidence: <strong>{action.CONFIDENCE != null ? `${Math.round(action.CONFIDENCE * 100)}%` : '-'}</strong></span>
            <span>{timeAgo(action.ACTION_TIMESTAMP || action.EXECUTED_AT || action.CREATED_AT)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function CategoryValueSummary({ rows }) {
  if (!rows?.length) return <p className="text-sm text-[var(--color-text-dim)]">No category value data available.</p>;
  const totalValue = rows.reduce((sum, row) => sum + (Number(row.TOTAL_WORK_ORDER_VALUE) || 0), 0) || 1;
  return (
    <div className="chart-value-list">
      {rows.map((row, index) => (
        <div key={row.CATEGORY || index} className="chart-value-list__row">
          <span className="chart-value-list__bar" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} aria-hidden="true" />
          <span className="chart-value-list__label">
            <span>{row.CATEGORY}</span>
            {formatNumber(row.WORK_ORDER_COUNT)} work orders · {formatNumber(row.SIGNAL_INFLUENCED_WORK_ORDERS)} signal-influenced
          </span>
          <span className="chart-value-list__value">{formatCurrency(row.TOTAL_WORK_ORDER_VALUE)}</span>
        </div>
      ))}
      <div className="h-1.5 rounded-full overflow-hidden bg-[var(--color-surface-muted)]" aria-hidden="true">
        {rows.map((row, index) => (
          <span
            key={`${row.CATEGORY || index}-bar`}
            className="inline-block h-full"
            style={{
              width: `${Math.max((Number(row.TOTAL_WORK_ORDER_VALUE) || 0) / totalValue * 100, 4)}%`,
              background: CHART_COLORS[index % CHART_COLORS.length],
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, loading: loadingSummary, refetch: refetchSummary } = useData(() => api.dashboard.summary());
  const [velocityHours, setVelocityHours] = useState(168); // default 7d - wide enough to always show data
  const { data: velocity, loading: loadingVelocity } = useData(() => api.dashboard.velocity(velocityHours), [velocityHours]);
  const { data: workOrderValue } = useData(() => api.dashboard.workOrderValueByCategory());
  const { data: inMemoryEvidence } = useData(() => api.dashboard.inmemory());
  const { data: agentActions } = useData(() => api.agents.actions({ limit: 4 }));

  // Search / filter state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const debounceRef = useRef(null);

  const { data: trending, loading: loadingTrending, refetch: refetchTrending } = useData(
    () => api.dashboard.trending(25, search, brand),
    [search, brand]
  );

  // Debounce free-text search
  const handleSearchChange = useCallback((val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val.trim()), 350);
  }, []);

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const s = summary || {};
  const inMemorySegments = inMemoryEvidence?.segments || [];
  const inMemoryEvidenceLabel = inMemoryEvidence?.evidenceStatus || 'UNAVAILABLE';
  const workOrderValueRows = (workOrderValue || []).slice(0, 8);
  const revenueValues = workOrderValueRows.map(row => Number(row.TOTAL_WORK_ORDER_VALUE) || 0);
  const categoryValuesAreFlat = revenueValues.length > 1
    && Math.max(...revenueValues) - Math.min(...revenueValues) < 1;
  const operatingIndicators = [
    {
      label: 'OEE load',
      value: s.AVG_OEE_LOAD_PCT == null ? '-' : `${s.AVG_OEE_LOAD_PCT}%`,
      helper: 'average active plant load',
      color: Number(s.AVG_OEE_LOAD_PCT) >= 85 ? '#C74634' : '#4C825C',
    },
    {
      label: 'Scrap watch',
      value: s.SCRAP_WATCH_PCT == null ? '-' : `${s.SCRAP_WATCH_PCT}%`,
      helper: 'critical-signal quality proxy',
      color: '#C74634',
    },
    {
      label: 'Throughput',
      value: formatNumber(s.THROUGHPUT_UNITS_7D),
      helper: 'units released last 7d',
      color: '#437C94',
    },
    {
      label: 'Demand variance',
      value: s.DEMAND_VARIANCE_PCT == null ? '-' : `${s.DEMAND_VARIANCE_PCT}%`,
      helper: 'forecast signal lift',
      color: '#AA643B',
    },
    {
      label: 'Production rate',
      value: s.PRODUCTION_RATE_UNITS_DAY == null ? '-' : `${formatNumber(s.PRODUCTION_RATE_UNITS_DAY)}/day`,
      helper: '7d average units',
      color: '#4F7D7B',
    },
  ];

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Operations Command Center">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This dashboard reads live operational aggregates and agent audit rows through Oracle-backed APIs.
              The other scenes expose native JSON, Spatial, SQL Property Graph, vector, and in-database machine-learning evidence from the same governed schema.
              Each feature claim is tied to its deployed Oracle object or runtime query response.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Relational SQL" color="blue" />
            <FeatureBadge label="Native JSON" color="orange" />
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="Property Graph" color="purple" />
            <FeatureBadge label="Agent Audit Tables" color="pink" />
            <FeatureBadge label="Vector Search" color="cyan" />
            <FeatureBadge label="In-Memory Base Level" color="yellow" />
          </div>
          <SqlBlock code={`-- Exact shape used by the dashboard summary API
SELECT
  (SELECT COUNT(*) FROM manufacturing_work_orders) AS work_orders_total,
  (SELECT NVL(SUM(work_order_value), 0) FROM manufacturing_work_orders) AS work_order_value_total,
  (SELECT COUNT(*) FROM manufacturing_production_signals
    WHERE momentum_code IN ('escalating','critical')) AS critical_signals,
  (SELECT COUNT(*) FROM agent_actions) AS agent_actions_total,
  (SELECT COUNT(*) FROM shipments
    WHERE ship_status = 'in_transit') AS routes_in_transit
FROM dual;`} />
          <SqlBlock code={`-- Product search: Oracle UPPER() case-insensitive LIKE
SELECT p.product_name, b.brand_name,
       COUNT(DISTINCT ppm.production_signal_id) AS signal_count,
       ROUND(AVG(sp.urgency_score), 2) AS avg_urgency
FROM products p
JOIN brands b ON p.brand_id = b.brand_id
JOIN manufacturing_signal_part_mentions ppm ON p.product_id = ppm.manufactured_part_id
JOIN manufacturing_production_signals sp ON ppm.production_signal_id = sp.production_signal_id
WHERE sp.observed_at >= SYSTIMESTAMP - INTERVAL '7' DAY
  AND (UPPER(p.product_name) LIKE UPPER(:search)
    OR UPPER(b.brand_name)   LIKE UPPER(:search))
GROUP BY p.product_id, p.product_name, b.brand_name
ORDER BY avg_urgency DESC;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Converged Architecture</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="JSON Docs" sub="production signals · event stream" color="#AA643B" />
              <DiagramBox label="Oracle AI Database 26ai" sub="One Engine" color="#c74634" />
              <DiagramBox label="Spatial" sub="SDO_GEOMETRY" color="#4C825C" />
              <DiagramBox label="Relational" sub="manufacturing work orders · customer accounts" color="#437C94" />
              <DiagramBox label="Agent Audit" sub="agent_actions · event_stream" color="#796087" />
              <DiagramBox label="Graph" sub="SQL/PGQ · GRAPH_TABLE" color="#4F7D7B" />
              <DiagramBox label="Vector" sub="VECTOR_EMBEDDING" color="#A36472" wide />
              <DiagramBox label="In-Memory" sub="Column Store" color="#AA643B" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">One governed Oracle schema with feature-specific runtime evidence.</p>
              <p className="text-[9px] font-mono text-[var(--color-text)] mt-0.5">Live API queries · no client-side evidence substitution</p>
            </div>
          </div>

          {/* In-Memory Column Store evidence */}
          {inMemoryEvidence && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database size={12} className="tone-sienna" />
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">In-Memory Column Store Evidence</p>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(170,100,59,0.3)' }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: 'rgba(170,100,59,0.12)' }}>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text)] font-semibold">Table</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Disk</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">IM Size</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Unpopulated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inMemorySegments.map((seg, i) => (
                      <tr key={seg.SEGMENT_NAME} style={{ background: i % 2 === 0 ? 'rgba(170,100,59,0.04)' : 'transparent' }}>
                        <td className="px-2 py-1 font-mono text-[var(--color-text)]">{seg.SEGMENT_NAME}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{(Number(seg.DISK_BYTES || 0) / 1048576).toFixed(1)} MB</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text)] font-medium">
                          {seg.INMEMORY_BYTES == null ? 'Unavailable' : `${(Number(seg.INMEMORY_BYTES) / 1048576).toFixed(1)} MB`}
                        </td>
                        <td className="px-2 py-1 text-right font-medium text-[var(--color-text)]">
                          {(Number(seg.BYTES_NOT_POPULATED || 0) / 1048576).toFixed(1)} MB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: 'rgba(170,100,59,0.08)', borderTop: '1px solid rgba(170,100,59,0.2)' }}>
                  <span className="text-[9px] text-[var(--color-text-dim)]">
                    {inMemoryEvidence.populatedSegmentCount}/{inMemoryEvidence.expectedSegmentCount} segments ·{' '}
                    <span className="text-[var(--color-text)] font-mono">{inMemoryEvidence.inmemoryForce}</span>
                  </span>
                  <span className="text-[9px] font-mono text-[var(--color-text)]">
                    {inMemoryEvidenceLabel}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
                Runtime evidence comes from V$PARAMETER, V$INMEMORY_AREA, V$IM_SEGMENTS, and V$SQL_PLAN.{' '}
                Base Level requires <span className="font-mono">INMEMORY_FORCE=BASE_LEVEL</span>.{' '}
                Plan proof: <span className="font-mono">{inMemoryEvidence.planProof?.operation || 'unavailable'}</span>
                {inMemoryEvidence.planProof?.sqlId ? ` (${inMemoryEvidence.planProof.sqlId})` : ''}.
              </p>
            </div>
          )}
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Seer Manufacturing Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Monitor the AX-400 production recovery story across work orders, supplier pressure, production signals, plant capacity, OML risk, and AI agent activity.
          </p>
        </div>
        <button onClick={refetchSummary} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <SceneStoryPanel scene="dashboard" />

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Detect the Operating Issue</h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              Momentum categories and operating indicators summarize where throughput, OEE load, scrap watch, and demand variance are moving together.
            </p>
          </div>
          <DefinitionRow items={MOMENTUM_DEFINITIONS} />
        </div>
        <div className="dashboard-operating-grid">
          {operatingIndicators.map((indicator) => (
            <MetricChip
              key={indicator.label}
              label={indicator.label}
              value={indicator.value}
              helper={indicator.helper}
              color={indicator.color}
            />
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard iconClass="oj-fwk-icon-tree-document" label="Work Orders" value={formatNumber(s.WORK_ORDERS_TOTAL)} subValue={`${formatNumber(s.WORK_ORDERS_30D)} last 30d`} color="#437C94" />
        <StatCard iconClass="oj-fwk-icon-view" label="Work Order Value" value={formatCurrency(s.WORK_ORDER_VALUE_TOTAL)} subValue={`${formatCurrency(s.WORK_ORDER_VALUE_30D)} last 30d`} color="#4C825C" />
        <StatCard iconClass="oj-fwk-icon-message-warning" label="Critical Production Signals" value={formatNumber(s.CRITICAL_SIGNALS)} subValue={`${formatNumber(s.ELEVATED_SIGNALS)} elevated`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-sortrelevancehigh" label="High-Risk Manufactured Parts" value={formatNumber(s.HIGH_RISK_PARTS)} subValue={`${formatNumber(s.SIGNALS_TOTAL)} total signals`} color="#AA643B" />
        <StatCard iconClass="oj-fwk-icon-users" label="Agent Actions" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(s.SHIPMENTS_IN_TRANSIT)} active work-order routes`} color="#796087" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Production Signal Velocity Chart */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity size={15} className="text-[var(--color-accent)]" />
              Production Signal Velocity
              {loadingVelocity && <RefreshCw size={12} className="animate-spin text-[var(--color-text-dim)]" />}
            </h3>
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-[var(--color-text-dim)]" />
              {VELOCITY_RANGES.map(r => (
                <button
                  key={r.hours}
                  onClick={() => setVelocityHours(r.hours)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                  style={velocityHours === r.hours ? {
                    background: 'rgba(199,70,52,0.25)',
                    border: '1px solid rgba(199,70,52,0.5)',
                    color: 'var(--color-text)'
                  } : {
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-dim)'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {!loadingVelocity && (!velocity || velocity.length === 0) ? (
            <div className="flex items-center justify-center" style={{ height: 240 }}>
              <div className="text-center space-y-2">
                <Activity size={28} className="mx-auto text-[var(--color-text-dim)] opacity-40" />
                <p className="text-sm text-[var(--color-text-dim)]">No production signals during this time period</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Try selecting a wider range</p>
              </div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={velocity || []}>
              <defs>
                <linearGradient id="gradAcknowledgements" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#AA643B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#AA643B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUrgentSignals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C74634" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#C74634" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} />
              <XAxis
                dataKey="HOUR_BUCKET"
                tick={{ fontSize: 10 }}
                tickFormatter={v => {
                  if (!v) return '';
                  // For hourly data (has HH:MI), show time; for daily/weekly, show date
                  if (v.length > 10) return v.slice(11, 16);
                  return v.slice(5); // MM-DD
                }}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-text)' }}
                itemStyle={{ color: 'var(--color-text)' }}
                labelFormatter={v => {
                  if (!v) return '';
                  if (v.length > 10) return v; // full datetime
                  return v; // date only
                }}
              />
              <Area type="monotone" dataKey="TOTAL_ACKNOWLEDGEMENTS" stroke="#AA643B" fill="url(#gradAcknowledgements)" strokeWidth={2} name="Acknowledgements" />
              <Area type="monotone" dataKey="URGENT_SIGNAL_COUNT" stroke="#C74634" fill="url(#gradUrgentSignals)" strokeWidth={2} name="Urgent Signals" />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* Order Value by Part Category */}
        <div className="glass-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign size={15} className="tone-pine" />
              Order Value by Part Category
            </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              30-day work-order value by manufactured-part category.
            </p>
          </div>
          {categoryValuesAreFlat ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-dim)]">
                Category values are balanced in this demo window, so a proportion chart would imply differences that are not present.
              </p>
              <CategoryValueSummary rows={workOrderValueRows} />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={workOrderValueRows}
                    dataKey="TOTAL_WORK_ORDER_VALUE"
                    nameKey="CATEGORY"
                    cx="50%" cy="50%"
                    innerRadius={48} outerRadius={82}
                    paddingAngle={2}
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {workOrderValueRows.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-text)' }}
                    itemStyle={{ color: 'var(--color-text)' }}
                    formatter={(v, _n, p) => [formatCurrency(v), `${p.payload.CATEGORY} value`]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ChartLegend
                title="Categories"
                items={workOrderValueRows.map((r, i) => ({
                  label: r.CATEGORY,
                  value: formatCurrency(r.TOTAL_WORK_ORDER_VALUE),
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
              />
            </>
          )}
        </div>
      </div>

      {/* High-Demand Manufactured Parts Table */}
      <div className="glass-card p-5">
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <Flame size={15} className="tone-sienna" />
            High-Demand Manufactured Parts
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
              - Production Signal Velocity (7 day)
            </span>
          </h3>

          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search manufactured parts or programs…"
              className="w-full text-sm pl-8 pr-8 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Brand filter chips (populated from trending results) */}
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            {Array.from(new Set((trending || []).map(p => p.BRAND_NAME))).slice(0, 4).map(b => (
              <button
                key={b}
                onClick={() => setBrand(brand === b ? '' : b)}
                className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                style={brand === b ? {
                  background: 'rgba(199,70,52,0.25)',
                  border: '1px solid rgba(199,70,52,0.5)',
                  color: 'var(--color-text)'
                } : {
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-dim)'
                }}
              >
                {b}
              </button>
            ))}
            {brand && !((trending || []).slice(0, 4).map(p => p.BRAND_NAME).includes(brand)) && (
              <button
                onClick={() => setBrand('')}
                className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                style={{ background: 'rgba(199,70,52,0.25)', border: '1px solid rgba(199,70,52,0.5)', color: 'var(--color-text)' }}
              >
                {brand} <X size={9} />
              </button>
            )}
          </div>

          {loadingTrending && (
            <RefreshCw size={13} className="animate-spin text-[var(--color-text-dim)] flex-shrink-0" />
          )}
        </div>

        {/* Result count / active filters notice */}
        {(search || brand) && !loadingTrending && (
          <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
            {trending?.length ?? 0} result{trending?.length !== 1 ? 's' : ''}
            {search ? <> matching <em>"{search}"</em></> : null}
            {brand ? <> in <em>{brand}</em></> : null}
            {' · '}
            <button className="underline hover:text-[var(--color-text)]" onClick={() => { clearSearch(); setBrand(''); }}>Clear all</button>
          </p>
        )}

        {loadingTrending ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading high-demand manufactured parts...</p>
        ) : (
          <TrendingTable
            products={trending}
            onSelect={(id) => setSelectedProductId(id === selectedProductId ? null : id)}
            selectedId={selectedProductId}
          />
        )}

        {!loadingTrending && trending?.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No manufactured parts match your search.</p>
        )}

        <p className="text-[10px] text-[var(--color-text-dim)] mt-3">
          Click any row to view capacity and production signal details
        </p>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Bot size={15} className="tone-plum" />
              Agent Actions
            </h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              Recent audited actions from the manufacturing signal, capacity, and work-order agents.
            </p>
          </div>
          <span className="text-[10px] font-mono text-[var(--color-text-dim)]">agent_actions</span>
        </div>
        <DashboardAgentActions actions={agentActions || []} />
      </div>

      {/* Converged DB Capabilities Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider">Converged capabilities in use</span>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Relational', desc: 'Work Orders & Plant Capacity', color: '#437C94' },
              { label: 'JSON', desc: 'Signal Payloads', color: '#4C825C' },
              { label: 'Graph', desc: 'Supplier Network', color: '#AA643B' },
              { label: 'Vector', desc: 'Semantic Matching', color: '#796087' },
              { label: 'Spatial', desc: 'Plant Routing', color: '#4F7D7B' },
              { label: 'Agents', desc: 'AI Orchestration', color: '#C74634' },
              { label: 'Security', desc: 'RBAC + VPD', color: '#A36472' },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: `${c.color}15`, border: `1px solid ${c.color}30` }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                <span className="text-[10px] font-medium text-[var(--color-text)]">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Manufactured Part Detail Modal */}
      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}
