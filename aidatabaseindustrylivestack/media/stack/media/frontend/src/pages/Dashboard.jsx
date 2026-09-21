import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DollarSign, Activity, Flame, RefreshCw, Search, X, Package, MapPin,
  MessageSquare, ChevronRight, Clock, Database
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, getMomentumColor } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { SceneStoryPanel } from '../components/MediaStory';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';

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

function centerTypeLabel(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'distribution') return 'Rights Desk';
  if (normalizedType === 'warehouse') return 'Studio Ops Hub';
  if (normalizedType === 'micro') return 'Live Event Desk';
  if (normalizedType === 'drop_ship') return 'Partner Activation Desk';
  if (normalizedType === 'store') return 'Regional Coverage Desk';
  return 'Coverage Operations Hub';
}

function centerTypeColor(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'distribution') return '#437C94';
  if (normalizedType === 'warehouse') return '#4C825C';
  return '#AA643B';
}

/* ─── Content Asset Detail Modal ─────────────────────────────────────────────── */
function ProductDetailModal({ productId, onClose }) {
  const { currentUser } = useUser();
  const userKey = currentUser?.USERNAME;
  const { data, loading, error } = useData(() => api.products.detail(productId), [productId, userKey]);
  const { data: duality, loading: loadingDuality, error: dualityError } =
    useData(() => api.products.duality(productId), [productId, userKey]);
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
  const mentions = data?.socialMentions || [];

  const totalOnHand = inventory.reduce((sum, r) => sum + (r.QUANTITY_ON_HAND || 0), 0);
  const totalReserved = inventory.reduce((sum, r) => sum + (r.QUANTITY_RESERVED || 0), 0);

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
                    {product.PEAK_MOMENTUM === 'mega_viral' ? '🔥 MEGA' : product.PEAK_MOMENTUM?.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-text-dim)]">
                <span>{product.BRAND_NAME}</span>
                <span> - </span>
                <span>{product.CATEGORY}</span>
                <span> - </span>
                <span className="font-medium text-[var(--color-text)]">{formatCurrency(product.UNIT_PRICE)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm tone-red">{error || 'Failed to load content asset'}</p>
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
                <p className="text-[10px] text-[var(--color-text-dim)]">Total Rights Capacity</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(170,100,59,0.05)', borderColor: 'rgba(170,100,59,0.2)' }}>
                <p className="text-lg font-bold tone-sienna">{formatNumber(totalReserved)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Reserved Rights</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(67,124,148,0.05)', borderColor: 'rgba(67,124,148,0.2)' }}>
                <p className="text-lg font-bold tone-ocean">{formatNumber(mentions.length)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Audience Signals</p>
              </div>
            </div>

            {/* Rights capacity breakdown */}
            {inventory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Available Rights Capacity by Distribution Hub
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Center</th>
                        <th className="text-left py-2 px-2">Location</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-right py-2 px-2">Capacity Units</th>
                        <th className="text-right py-2 px-2">Reserved Rights</th>
                        <th className="text-right py-2 px-2">Available Rights Capacity</th>
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
                                  background: `${centerTypeColor(inv.CENTER_TYPE)}22`,
                                  color: centerTypeColor(inv.CENTER_TYPE),
                                }}>
                                {centerTypeLabel(inv.CENTER_TYPE)}
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

            {/* Audience Signals */}
            {mentions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Recent Audience Signals
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {mentions.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-[var(--color-accent)]">@{m.HANDLE || 'unknown'}</span>
                        <div className="flex items-center gap-2">
                          {m.MOMENTUM_FLAG && (
                            <span className={`momentum-badge momentum-${m.MOMENTUM_FLAG}`} style={{ fontSize: 9 }}>
                              {m.MOMENTUM_FLAG?.replace('_', ' ')}
                            </span>
                          )}
                          <span className="font-mono text-[10px]" style={{ color: getMomentumColor(m.MOMENTUM_FLAG) }}>
                            {m.VIRALITY_SCORE?.toFixed(1)}
                          </span>
                          {m.CONFIDENCE_SCORE && (
                            <span className="text-[var(--color-text-dim)] text-[10px]">{(m.CONFIDENCE_SCORE * 100).toFixed(0)}% conf</span>
                          )}
                        </div>
                      </div>
                      {m.POST_TEXT && (
                        <p className="text-[var(--color-text-dim)] leading-relaxed line-clamp-2">{m.POST_TEXT}</p>
                      )}
                      {m.MENTION_TYPE && (
                        <span className="text-[9px] tone-plum mt-1 inline-block">{m.MENTION_TYPE}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inventory.length === 0 && mentions.length === 0 && (
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No detailed data available for this content asset.</p>
            )}
          </div>
        )}

        {/* JSON Duality View Tab */}
        {!loading && product && tab === 'json' && (
          <div className="p-5 space-y-4">
            {loadingDuality ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-8 justify-center">
                <RefreshCw size={14} className="animate-spin" /> Querying duality view...
              </div>
            ) : dualityError ? (
              <div className="text-sm tone-red text-center py-8" role="status">
                <p>Native JSON Relational Duality is unavailable.</p>
                <p className="text-xs mt-1">{dualityError.message}</p>
              </div>
            ) : duality?.document ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#AA643B]/10 text-[#AA643B] border border-[#AA643B]/30 font-mono">
                    {duality.source}
                  </span>
                  <button onClick={copyJson}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:border-[#AA643B]/50 text-[var(--color-text-dim)] hover:text-[#AA643B] transition-colors">
                    {copied ? <span className="tone-pine">check Copied</span> : 'Copy JSON'}
                  </button>
                </div>

                <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)' }}>
                  <span className="text-[#AA643B] font-semibold">Content Asset + Capacity as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> - The same content asset and capacity data from the Details tab, exposed as a single nested JSON document.
                  The duality view joins <span className="text-[#437C94] font-mono">products</span> (content assets) and <span className="text-[#437C94] font-mono">inventory</span> (capacity) tables
                  into one document with a nested rights capacity array.</span>
                </div>

                <div className="dashboard-duality-json-panel">
                  <div className="dashboard-duality-json-panel__header">
                    <span className="dashboard-duality-json-panel__title">JSON Document</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {duality.document.inventory?.length || 0} capacity locations
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
  if (!products?.length) return <p className="text-sm text-[var(--color-text-dim)]">No high-demand asset data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
            <th className="text-left py-2 px-3">Content Asset</th>
            <th className="text-left py-2 px-3">Studio or Label</th>
            <th className="text-right py-2 px-3">Mentions</th>
            <th className="text-right py-2 px-3">Views</th>
            <th className="text-right py-2 px-3">Virality</th>
            <th className="text-center py-2 px-3">Momentum</th>
            <th className="py-2 px-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const isSelected = selectedId === p.PRODUCT_ID;
            return (
              <tr
                key={p.PRODUCT_ID || i}
                onClick={() => onSelect(p.PRODUCT_ID)}
                className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                style={isSelected ? { background: 'rgba(199,70,52,0.12)', borderColor: 'rgba(199,70,52,0.3)' } : {}}
              >
                <td className="py-2.5 px-3 font-medium">{p.PRODUCT_NAME}</td>
                <td className="py-2.5 px-3 text-[var(--color-text-dim)]">{p.BRAND_NAME}</td>
                <td className="py-2.5 px-3 text-right">{formatNumber(p.MENTION_COUNT)}</td>
                <td className="py-2.5 px-3 text-right">{formatNumber(p.TOTAL_VIEWS)}</td>
                <td className="py-2.5 px-3 text-right">
                  <span className="font-mono font-medium" style={{ color: getMomentumColor(p.PEAK_MOMENTUM) }}>
                    {p.AVG_VIRALITY}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`momentum-badge momentum-${p.PEAK_MOMENTUM}`}>
                    {p.PEAK_MOMENTUM === 'mega_viral' ? '🔥 MEGA' : p.PEAK_MOMENTUM?.replace('_', ' ')}
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

const MOMENTUM_FILTERS = ['', 'mega_viral', 'viral', 'rising'];
const MOMENTUM_LABELS  = { '': 'All', mega_viral: '🔥 Mega', viral: 'Viral', rising: 'Rising' };

const VELOCITY_RANGES = [
  { label: '1h',  hours: 1 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '7d',  hours: 168 },
  { label: '30d', hours: 720 },
  { label: '1y',  hours: 8760 },
];

function toMetricNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatVelocityMonth(value, { short = false } = {}) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: short ? '2-digit' : 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatVelocityAxisTick(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}$/.test(String(value))) return formatVelocityMonth(value, { short: true });
  if (String(value).length > 10) return String(value).slice(11, 16);
  return String(value).slice(5);
}

function formatVelocityBucket(value) {
  if (!value) return 'No time bucket';
  if (/^\d{4}-\d{2}$/.test(String(value))) return `${formatVelocityMonth(value)} bucket`;
  return value.length > 10 ? value : `${value} bucket`;
}

function getVelocitySpike(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const highUrgencySpike = rows.reduce((largest, row) => {
    const value = toMetricNumber(row.VIRAL_COUNT);
    const postCount = toMetricNumber(row.POST_COUNT);
    if (!largest || value > largest.value || (value === largest.value && postCount > largest.postCount)) {
      return { row, value, postCount };
    }
    return largest;
  }, null);

  if (highUrgencySpike?.value > 0) {
    return {
      row: highUrgencySpike.row,
      metricKey: 'VIRAL_COUNT',
      value: highUrgencySpike.value,
      label: 'Peak high-urgency bucket',
      stroke: '#C74634',
    };
  }

  const volumeSpike = rows.reduce((largest, row) => {
    const value = toMetricNumber(row.POST_COUNT);
    const postCount = toMetricNumber(row.POST_COUNT);
    if (!largest || value > largest.value || (value === largest.value && postCount > largest.postCount)) {
      return { row, value, postCount };
    }
    return largest;
  }, null);

  if (volumeSpike?.value > 0) {
    return {
      row: volumeSpike.row,
      metricKey: 'POST_COUNT',
      value: volumeSpike.value,
      label: 'Largest audience-signal bucket',
      stroke: '#AA643B',
    };
  }

  return null;
}

function VelocityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};

  return (
    <div
      className="rounded-lg p-3 shadow-sm"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
        minWidth: 230,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
        Time bucket
      </p>
      <p className="text-xs font-mono text-[var(--color-text)] mt-0.5">
        {formatVelocityBucket(label)}
      </p>
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Audience signals</span>
          <span className="font-semibold">{formatNumber(row.POST_COUNT)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">High-urgency signals</span>
          <span className="font-semibold tone-red">{formatNumber(row.VIRAL_COUNT)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Engagement</span>
          <span className="font-semibold tone-sienna">{formatNumber(row.TOTAL_LIKES)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Amplification</span>
          <span className="font-semibold">{formatNumber(row.TOTAL_SHARES)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Scope</span>
          <span className="font-medium text-right">Media and entertainment audience activity</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currentUser } = useUser();
  const userKey = currentUser?.USERNAME;
  const {
    data: summary,
    loading: loadingSummary,
    error: summaryError,
    refetch: refetchSummary,
  } = useData(() => api.dashboard.summary(), [userKey]);
  const [velocityHours, setVelocityHours] = useState(168); // default 7d, wide enough to always show data
  const { data: velocity, loading: loadingVelocity } = useData(() => api.dashboard.velocity(velocityHours), [velocityHours, userKey]);
  const { data: revenue } = useData(() => api.dashboard.revenueByCategory(), [userKey]);
  const {
    data: imSegments,
    error: inMemoryError,
  } = useData(() => api.dashboard.inmemory(), [userKey]);
  const representativeResult = imSegments?.[0]?.representativeResult || null;

  // Search / filter state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const debounceRef = useRef(null);

  const { data: trending, loading: loadingTrending, refetch: refetchTrending } = useData(
    () => api.dashboard.trending(25, search, brand),
    [search, brand, userKey]
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
  const velocitySpike = getVelocitySpike(velocity || []);

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Launch Operations Internals">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This dashboard issues a single <span className="tone-teal font-mono">SELECT</span> against five different Oracle workload engines simultaneously:
              relational aggregations, JSON collections, spatial data, property graph edges, and AI agent audit logs - all from one converged database.
              No ETL pipelines. No microservices. No sync lag. Just Oracle.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Relational SQL" color="blue" />
            <FeatureBadge label="Native JSON" color="orange" />
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="Property Graph" color="purple" />
            <FeatureBadge label="Select AI" color="pink" />
            <FeatureBadge label="Vector Search" color="cyan" />
            <FeatureBadge label="In-Memory Column Store" color="yellow" />
          </div>
          <SqlBlock code={`-- One query. Five workloads. Zero ETL.
SELECT
  COUNT(o.order_id)                     AS orders_total,
  SUM(o.order_total)                    AS revenue_total,
  COUNT(sp.post_id) FILTER (
    WHERE sp.momentum_flag = 'viral')   AS viral_posts,
  COUNT(aa.action_id)                   AS agent_actions,
  COUNT(s.shipment_id) FILTER (
    WHERE s.ship_status = 'in_transit') AS shipments_in_transit
FROM   orders o, social_posts sp,
       agent_actions aa, shipments s;`} />
          <SqlBlock code={`-- Content asset search: Oracle UPPER() case-insensitive LIKE
SELECT p.product_name, b.brand_name,
       COUNT(DISTINCT ppm.post_id) AS mention_count,
       ROUND(AVG(sp.virality_score), 2) AS avg_virality
FROM products p
JOIN brands b ON p.brand_id = b.brand_id
JOIN post_product_mentions ppm ON p.product_id = ppm.product_id
JOIN social_posts sp ON ppm.post_id = sp.post_id
WHERE sp.posted_at >= SYSTIMESTAMP - INTERVAL '7' DAY
  AND (UPPER(p.product_name) LIKE UPPER(:search)
    OR UPPER(b.brand_name)   LIKE UPPER(:search))
GROUP BY p.product_id, p.product_name, b.brand_name
ORDER BY avg_virality DESC;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Converged Architecture</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="JSON Docs" sub="social_posts event_stream" color="#AA643B" />
              <DiagramBox label="Oracle AI Database 26ai" sub="One Engine" color="#c74634" />
              <DiagramBox label="Spatial" sub="SDO_GEOMETRY" color="#4C825C" />
              <DiagramBox label="Relational" sub="campaign requests + capacity" color="#437C94" />
              <DiagramBox label="Select AI" sub="Agents & LLMs" color="#796087" />
              <DiagramBox label="Graph" sub="PGQL / APEX" color="#4F7D7B" />
              <DiagramBox label="Vector" sub="VECTOR_EMBEDDING" color="#A36472" wide />
              <DiagramBox label="In-Memory" sub="Column Store" color="#AA643B" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">All workloads. One transaction. One connection pool.</p>
              <p className="text-[9px] font-mono text-[var(--color-text)] mt-0.5">No Kafka  -  No Spark  -  No Sync Jobs</p>
            </div>
          </div>

          {/* Live In-Memory Column Store Stats */}
          {imSegments?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database size={12} className="tone-sienna" />
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">
                  In-Memory Column Store - {imSegments.some(s => s.IS_ESTIMATED) ? 'Estimated' : 'Live'}
                </p>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(170,100,59,0.3)' }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: 'rgba(170,100,59,0.12)' }}>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text)] font-semibold">Table</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Rows</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Disk</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">IM Size</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imSegments.map((seg, i) => (
                      <tr key={seg.TABLE_NAME} style={{ background: i % 2 === 0 ? 'rgba(170,100,59,0.04)' : 'transparent' }}>
                        <td className="px-2 py-1 font-mono text-[var(--color-text)]">{seg.TABLE_NAME}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{Number(seg.ROW_COUNT || 0).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{(seg.DISK_BYTES / 1048576).toFixed(1)} MB</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text)] font-medium">{(seg.IM_BYTES / 1048576).toFixed(1)} MB</td>
                        <td className="px-2 py-1 text-right font-medium text-[var(--color-text)]">
                          {seg.COMPRESSION_PCT}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: 'rgba(170,100,59,0.08)', borderTop: '1px solid rgba(170,100,59,0.2)' }}>
                  <span className="text-[9px] text-[var(--color-text-dim)]">
                    Compression: <span className="text-[var(--color-text)] font-mono">{imSegments[0]?.COMPRESSION || 'FOR QUERY LOW'}</span>
                  </span>
                  <span className="text-[9px] font-mono text-[var(--color-text)]">
                    {imSegments.some(s => s.IS_ESTIMATED)
                      ? 'ESTIMATED'
                      : imSegments.every(s => s.STATUS === 'COMPLETED') ? 'POPULATED' : 'POPULATING'}
                  </span>
                </div>
              </div>
              <div
                className="mt-2 rounded p-2 text-[9px] font-mono text-[var(--color-text-dim)]"
                data-testid="inmemory-execution-proof"
                style={{ border: '1px dashed rgba(170,100,59,0.3)' }}
              >
                <span>
                  Generation: {imSegments[0].GENERATION_ID}
                </span>
                {' · '}
                <span>
                  Cursor: {imSegments[0].PLAN_PROOF_SQL_ID}/
                  {imSegments[0].PLAN_PROOF_CHILD_NUMBER}
                </span>
                {' · '}
                <span>
                  Plan: {[imSegments[0].PLAN_PROOF_OPERATION, imSegments[0].PLAN_PROOF_OPTIONS]
                    .filter(Boolean).join(' ')}
                  {' '}
                  {imSegments[0].PLAN_PROOF_OBJECT}
                </span>
                {' · '}
                <span>
                  Plan hash: {imSegments[0].PLAN_PROOF_HASH}
                </span>
                {' · '}
                <span>
                  Result rows: {imSegments[0].PLAN_PROOF_RESULT_ROWS}
                </span>
                {' · '}
                <span>
                  Expected table: {imSegments[0].EXPECTED_TABLE_NAME}
                </span>
                {representativeResult ? (
                  <>
                    {' · '}
                    <span>
                      Representative result: {representativeResult.customerTier}
                      {' tier · '}
                      {representativeResult.customerCount} customers
                      {' · '}
                      {formatCurrency(representativeResult.totalLifetimeValue)}
                      {' lifetime value · generation '}
                      {representativeResult.generationId}
                    </span>
                  </>
                ) : null}
              </div>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
                Oracle In-Memory Column Store keeps hot tables in a compressed columnar format for analytical scans -
                no ETL to a separate analytics database. Queries against these tables automatically use IMCS when beneficial.
              </p>
            </div>
          )}
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Launch Operations Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Midnight Harbor premiere weekend view of audience momentum, campaign value, rights capacity, retention risk, and AI actions powered by Oracle AI Database 26ai.
          </p>
        </div>
        <button onClick={refetchSummary} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <SceneStoryPanel scene="dashboard" />

      {(summaryError || inMemoryError) && (
        <div
          className="glass-card p-4"
          role="alert"
          data-testid="dashboard-feature-unavailable"
          style={{ borderLeft: '3px solid var(--color-danger)' }}
        >
          {inMemoryError && (
            <>
              <p className="text-sm font-semibold tone-red">
                Oracle Database In-Memory is unavailable
              </p>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                {inMemoryError.message}
              </p>
            </>
          )}
          {summaryError && (
            <p className="text-sm tone-red">{summaryError.message}</p>
          )}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard iconClass="oj-fwk-icon-tree-document" label="Campaign Requests" value={formatNumber(s.ORDERS_TOTAL)} subValue={`${formatNumber(s.ORDERS_30D)} last 30d`} color="#437C94" />
        <StatCard iconClass="oj-fwk-icon-view" label="Content Revenue" value={formatCurrency(s.REVENUE_TOTAL)} subValue={`${formatCurrency(s.REVENUE_30D)} last 30d`} color="#4C825C" />
        <StatCard iconClass="oj-fwk-icon-message-warning" label="Audience Momentum" value={formatNumber(s.VIRAL_POSTS)} subValue={`${formatNumber(s.RISING_POSTS)} rising`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-sortrelevancehigh" label="Launch Demand Alerts" value={formatNumber(s.TRENDING_PRODUCTS)} subValue={`${formatNumber(s.POSTS_TOTAL)} total signals`} color="#AA643B" />
        <StatCard iconClass="oj-fwk-icon-users" label="AI Actions" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(s.SHIPMENTS_IN_TRANSIT)} activation routes active`} color="#796087" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Signal Velocity Chart */}
        <div className="glass-card p-5 lg:col-span-2 flex flex-col">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity size={15} className="text-[var(--color-accent)]" />
                Audience Signal Velocity
                {loadingVelocity && <RefreshCw size={12} className="animate-spin text-[var(--color-text-dim)]" />}
              </h3>
              <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
                Measures the volume, pace, and urgency of media and entertainment audience signals across premiere windows, content releases,
                watch parties, creator activity, fan engagement, and content operations.
              </p>
            </div>
            <div className="flex items-center gap-1 flex-wrap sm:justify-end">
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
            <div className="flex flex-1 min-h-[280px] items-center justify-center">
              <div className="text-center space-y-2">
                <Activity size={28} className="mx-auto text-[var(--color-text-dim)] opacity-40" />
                <p className="text-sm text-[var(--color-text-dim)]">No audience signals during this time period</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Try selecting a wider range</p>
              </div>
            </div>
          ) : (
          <div className="flex-1 min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={velocity || []}>
              <defs>
                <linearGradient id="gradSignals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#AA643B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#AA643B" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradViral" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C74634" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#C74634" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} />
              <XAxis
                dataKey="HOUR_BUCKET"
                tick={{ fontSize: 10 }}
                tickFormatter={formatVelocityAxisTick}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={58}
                label={{
                  value: 'Audience signals per bucket',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 8,
                  style: { textAnchor: 'middle', fill: 'var(--color-text-dim)', fontSize: 10 },
                }}
              />
              <Tooltip content={<VelocityTooltip />} />
              {velocitySpike && (
                <ReferenceDot
                  x={velocitySpike.row.HOUR_BUCKET}
                  y={velocitySpike.value}
                  r={4}
                  stroke={velocitySpike.stroke}
                  strokeWidth={2}
                  fill="var(--color-surface)"
                  isFront
                  ifOverflow="extendDomain"
                  label={{
                    value: velocitySpike.label,
                    position: 'top',
                    fill: velocitySpike.stroke,
                    fontSize: 10,
                  }}
                />
              )}
              <Area type="monotone" dataKey="POST_COUNT" stroke="#AA643B" fill="url(#gradSignals)" strokeWidth={2} name="Audience Signals" />
              <Area type="monotone" dataKey="VIRAL_COUNT" stroke="#C74634" fill="url(#gradViral)" strokeWidth={2} name="High-Urgency Signals" />
            </AreaChart>
          </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Content Revenue by Category */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <DollarSign size={15} className="tone-pine" />
            Content Revenue by Category
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={(revenue || []).slice(0, 8)}
                dataKey="TOTAL_REVENUE"
                nameKey="CATEGORY"
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={85}
                paddingAngle={2}
              >
                {(revenue || []).slice(0, 8).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-text)' }}
                itemStyle={{ color: 'var(--color-text)' }}
                formatter={(v) => formatCurrency(v)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {(revenue || []).slice(0, 8).map((r, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-dim)]">
                <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {r.CATEGORY}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* High-Demand Assets Table */}
      <div className="glass-card p-5">
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <Flame size={15} className="tone-sienna" />
            Content Demand Alerts
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
              - Audience Momentum (7 days)
            </span>
          </h3>

          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search content assets or programs..."
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
            {'  -  '}
            <button className="underline hover:text-[var(--color-text)]" onClick={() => { clearSearch(); setBrand(''); }}>Clear all</button>
          </p>
        )}

        {loadingTrending ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading content demand alerts...</p>
        ) : (
          <TrendingTable
            products={trending}
            onSelect={(id) => setSelectedProductId(id === selectedProductId ? null : id)}
            selectedId={selectedProductId}
          />
        )}

        {!loadingTrending && trending?.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No content assets match your search.</p>
        )}

        <p className="text-[10px] text-[var(--color-text-dim)] mt-3">
          Click any row to inspect content capacity, audience signals, and JSON duality details.
        </p>
      </div>

      {/* Converged DB Capabilities Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider">Converged capabilities in use</span>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Relational', desc: 'Campaigns & Capacity', color: '#437C94' },
              { label: 'JSON', desc: 'Audience Payloads', color: '#4C825C' },
              { label: 'Graph', desc: 'Creator Network', color: '#AA643B' },
              { label: 'Vector', desc: 'Semantic Matching', color: '#796087' },
              { label: 'Spatial', desc: 'Distribution Coverage', color: '#4F7D7B' },
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

      {/* Content Asset Detail Modal */}
      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}
