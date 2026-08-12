import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp, Eye, Truck, Bot, DollarSign,
  Activity, Flame, RefreshCw, Search, X, Package, MapPin,
  MessageSquare, ChevronRight, Clock, Database
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, getMomentumColor } from '../utils/format';
import { SceneStoryPanel } from '../components/EnergyUtilitiesStory';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

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

/* ─── Utility Service Detail Modal ────────────────────────────────────────────── */
function ProductDetailModal({ productId, onClose }) {
  const { data, loading, error } = useData(() => api.products.detail(productId), [productId]);
  const { data: duality, loading: loadingDuality } = useData(() => api.products.duality(productId), [productId]);
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
                    {product.PEAK_MOMENTUM === 'mega_viral' ? 'CRITICAL' : product.PEAK_MOMENTUM?.replace('_', ' ')}
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
            <p className="text-sm tone-red">{error?.message || 'Failed to load utility service'}</p>
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
                <p className="text-lg font-bold tone-ocean">{formatNumber(mentions.length)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Signal Mentions</p>
              </div>
            </div>

            {/* Inventory Breakdown */}
            {inventory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Capacity and Supply by Field Operations Site
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

            {/* Signal Mentions */}
            {mentions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Recent Compliance and Market Signals
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
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No detailed data available for this utility service.</p>
            )}
          </div>
        )}

        {/* JSON Duality View Tab */}
        {!loading && product && tab === 'json' && (
          <div className="p-5 space-y-4">
            {loadingDuality ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-8 justify-center">
                <RefreshCw size={14} className="animate-spin" /> Querying duality view…
              </div>
            ) : duality?.document ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#AA643B]/10 text-[#AA643B] border border-[#AA643B]/30 font-mono">
                    {duality.source}
                  </span>
                  <button onClick={copyJson}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:border-[#AA643B]/50 text-[var(--color-text-dim)] hover:text-[#AA643B] transition-colors">
                    {copied ? <span className="tone-pine">✓ Copied</span> : 'Copy JSON'}
                  </button>
                </div>

                <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)' }}>
                  <span className="text-[#AA643B] font-semibold">Utility Service + Capacity/Supply as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> - The same utility service and capacity/supply data from the Details tab, exposed as a single nested JSON document.
                  The duality view joins the inherited <span className="text-[#437C94] font-mono">products</span> and <span className="text-[#437C94] font-mono">inventory</span> physical tables
                  into one utilities-facing document with nested supply records.</span>
                </div>

                <div className="dashboard-duality-json-panel">
                  <div className="dashboard-duality-json-panel__header">
                    <span className="dashboard-duality-json-panel__title">JSON Document</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {duality.document.inventory?.length || 0} inventory locations
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

/* ─── Watched Services Table ───────────────────────────────────────────── */
function getGridTrendLabel(momentum) {
  switch (momentum) {
    case 'mega_viral': return 'Rapidly Rising';
    case 'viral': return 'Escalating';
    case 'rising': return 'Rising';
    default: return 'Stable';
  }
}

function getRecommendedServiceAction(row) {
  const category = (row.CATEGORY || '').toLowerCase();
  const trend = row.PEAK_MOMENTUM || '';

  if (category.includes('supply') || category.includes('billing support') || category.includes('component') || category.includes('meter')) {
    return 'Check supply availability';
  }
  if (category.includes('operations') || category.includes('specialty') || category.includes('customer')) {
    return 'Review capacity plan';
  }
  if (category.includes('quality') || category.includes('safety') || category.includes('compliance')) {
    return 'Review reliability signal';
  }
  if (trend === 'mega_viral' || trend === 'viral') return 'Route AI follow-up';

  return 'Open service detail';
}

function TrendingTable({ products, onSelect, selectedId }) {
  if (!products?.length) return <p className="text-sm text-[var(--color-text-dim)]">No watched utility service data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
            <th className="text-left py-2 px-3">Service / Supply</th>
            <th className="text-left py-2 px-3">Utility Operator Network / Partner</th>
            <th className="text-right py-2 px-3">Signals</th>
            <th className="text-right py-2 px-3">Network Impact</th>
            <th className="text-center py-2 px-3">Trend</th>
            <th className="text-left py-2 px-3">Next Step</th>
            <th className="py-2 px-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const isSelected = selectedId === p.PRODUCT_ID;
            const trendLabel = getGridTrendLabel(p.PEAK_MOMENTUM);
            const recommendedAction = getRecommendedServiceAction(p);
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
                <td className="py-2.5 px-3 text-center">
                  <span className={`momentum-badge momentum-${p.PEAK_MOMENTUM}`}>
                    {trendLabel}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-[var(--color-text)]">
                  <span className="text-xs font-medium leading-snug">{recommendedAction}</span>
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
const UTILITY_CATEGORY_COLORS = ['#C74634', '#4F7D7B', '#AA643B', '#4C825C', '#A36472', '#437C94', '#796087', '#6B7494'];
const UTILITY_CATEGORY_VISIBLE_SLICES = 7;

const MOMENTUM_FILTERS = ['', 'mega_viral', 'viral', 'rising'];
const MOMENTUM_LABELS  = { '': 'All', mega_viral: 'Critical', viral: 'Elevated', rising: 'Rising' };

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

function formatVelocityBucket(value) {
  if (!value) return 'No time bucket';
  return value.length > 10 ? value : `${value} bucket`;
}

function getVelocitySpike(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const criticalSpike = rows.reduce((largest, row) => {
    const value = toMetricNumber(row.VIRAL_COUNT);
    const postCount = toMetricNumber(row.POST_COUNT);
    if (!largest || value > largest.value || (value === largest.value && postCount > largest.postCount)) {
      return { row, value, postCount };
    }
    return largest;
  }, null);

  if (criticalSpike?.value > 0) {
    return {
      row: criticalSpike.row,
      metricKey: 'VIRAL_COUNT',
      value: criticalSpike.value,
      label: 'Peak critical signal bucket',
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
      label: 'Largest signal volume bucket',
      stroke: '#AA643B',
    };
  }

  return null;
}

function VelocityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  // /api/dashboard/social-velocity is bucket-level only. Source/category context
  // cannot be shown without a backend contract change, so the UI uses a safe
  // aggregate label when those fields are absent.
  const sourceOrCategory =
    row.PROVIDER_NAME || row.PROVIDER || row.CATEGORY || row.BRAND_NAME || 'Aggregated utility operator network';
  const contextLabel =
    row.PROVIDER_NAME || row.PROVIDER ? 'Signal source' :
    row.CATEGORY || row.BRAND_NAME ? 'Category' :
    'Scope';

  return (
    <div
      className="rounded-lg p-3 shadow-sm"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
        minWidth: 220,
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
          <span className="text-[var(--color-text-dim)]">Signal bulletins</span>
          <span className="font-semibold">{formatNumber(row.POST_COUNT)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Critical reliability signals</span>
          <span className="font-semibold tone-red">{formatNumber(row.VIRAL_COUNT)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Engagement value</span>
          <span className="font-semibold tone-sienna">{formatNumber(row.TOTAL_LIKES)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Shared signal value</span>
          <span className="font-semibold">{formatNumber(row.TOTAL_SHARES)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">{contextLabel}</span>
          <span className="font-medium text-right">{sourceOrCategory}</span>
        </div>
      </div>
    </div>
  );
}

function getUtilityCategoryChart(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map(row => ({
      ...row,
      TOTAL_REVENUE: toMetricNumber(row.TOTAL_REVENUE),
      ORDER_COUNT: toMetricNumber(row.ORDER_COUNT),
      SOCIAL_DRIVEN_ORDERS: toMetricNumber(row.SOCIAL_DRIVEN_ORDERS),
    }))
    .filter(row => row.TOTAL_REVENUE > 0);
  const totalValue = normalizedRows.reduce((sum, row) => sum + row.TOTAL_REVENUE, 0);

  if (!totalValue) {
    return { slices: [], totalValue: 0, topCategory: null, hiddenCount: 0 };
  }

  const visibleRows = normalizedRows.slice(0, UTILITY_CATEGORY_VISIBLE_SLICES);
  const hiddenRows = normalizedRows.slice(UTILITY_CATEGORY_VISIBLE_SLICES);
  const otherRow = hiddenRows.length
    ? {
        CATEGORY: 'Other categories',
        TOTAL_REVENUE: hiddenRows.reduce((sum, row) => sum + row.TOTAL_REVENUE, 0),
        ORDER_COUNT: hiddenRows.reduce((sum, row) => sum + row.ORDER_COUNT, 0),
        SOCIAL_DRIVEN_ORDERS: hiddenRows.reduce((sum, row) => sum + row.SOCIAL_DRIVEN_ORDERS, 0),
        CATEGORY_COUNT: hiddenRows.length,
        isOther: true,
      }
    : null;

  const slices = [...visibleRows, ...(otherRow ? [otherRow] : [])]
    .map((row, index) => ({
      ...row,
      percentOfTotal: row.TOTAL_REVENUE / totalValue,
      color: UTILITY_CATEGORY_COLORS[index % UTILITY_CATEGORY_COLORS.length],
    }));

  return {
    slices,
    totalValue,
    topCategory: slices[0] || null,
    hiddenCount: hiddenRows.length,
  };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function formatCompactCurrency(value) {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function UtilityCategoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  return (
    <div
      className="rounded-lg p-3 shadow-sm"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text)',
        minWidth: 220,
      }}
    >
      <p className="text-xs font-semibold text-[var(--color-text)]">{row.CATEGORY}</p>
      {row.isOther && (
        <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
          Combined from {formatNumber(row.CATEGORY_COUNT)} smaller categories
        </p>
      )}
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Service value</span>
          <span className="font-semibold">{formatCurrency(row.TOTAL_REVENUE)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Share of total</span>
          <span className="font-semibold">{formatPercent(row.percentOfTotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Service requests</span>
          <span className="font-semibold">{formatNumber(row.ORDER_COUNT)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Signal-linked requests</span>
          <span className="font-semibold">{formatNumber(row.SOCIAL_DRIVEN_ORDERS)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, loading: loadingSummary, refetch: refetchSummary } = useData(() => api.dashboard.summary());
  const [velocityHours, setVelocityHours] = useState(168); // default 7d - wide enough to always show data
  const { data: velocity, loading: loadingVelocity } = useData(() => api.dashboard.velocity(velocityHours), [velocityHours]);
  const { data: revenue } = useData(() => api.dashboard.revenueByCategory());
  const {
    data: imReadiness,
    loading: loadingImReadiness,
    error: imReadinessError,
  } = useData(() => api.dashboard.inmemoryReadiness());

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
  const velocitySpike = getVelocitySpike(velocity || []);
  const utilityCategoryChart = getUtilityCategoryChart(revenue || []);
  const imEvidence = imReadiness || imReadinessError?.details || {
    evidenceMode: 'DECLARATION_ONLY',
    evidenceStatus: 'UNAVAILABLE',
    active: false,
    runtimePopulationClaimed: false,
    populationStatus: 'NOT_PROVEN',
    evidenceSources: ['USER_TABLES', 'USER_SEGMENTS'],
    segments: [],
  };
  const imSegments = imEvidence.segments || [];

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Energy Operations Command Center">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This dashboard issues a single <span className="tone-teal font-mono">SELECT</span> across electric, gas, water/wastewater, and oil & gas operational domains while using five Oracle workload engines simultaneously -
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
	-- Utilities-facing query surfaces keep demo SQL operator-focused.
	SELECT
	  (SELECT COUNT(*)
	     FROM utility_service_requests) AS service_requests_total,
	  (SELECT NVL(SUM(request_value), 0)
	     FROM utility_service_requests) AS service_value_total,
	  (SELECT COUNT(*)
	     FROM reliability_load_signals_v
	    WHERE criticality_score >= 80) AS critical_signals,
	  (SELECT COUNT(*)
	     FROM utilities_agent_actions_v) AS agent_actions,
	  (SELECT COUNT(*)
	     FROM field_crew_routes_v
	    WHERE logistics_route_status = 'in_transit') AS logistics_routes_in_transit
	FROM dual;`} />
          <SqlBlock code={`-- Reliability/load signal search: Oracle UPPER() case-insensitive LIKE
SELECT signal_source_name,
       source_channel,
       COUNT(*) AS signal_count,
       ROUND(AVG(criticality_score), 2) AS avg_criticality
FROM reliability_load_signals_v
WHERE signal_timestamp >= SYSTIMESTAMP - INTERVAL '7' DAY
  AND (UPPER(signal_text)        LIKE UPPER(:search)
    OR UPPER(source_channel)     LIKE UPPER(:search)
    OR UPPER(signal_source_name) LIKE UPPER(:search))
GROUP BY signal_source_name, source_channel
ORDER BY avg_criticality DESC;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Converged Architecture</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="JSON Docs" sub="signal bulletins · event_stream" color="#AA643B" />
              <DiagramBox label="Oracle AI Database 26ai" sub="One Engine" color="#c74634" />
              <DiagramBox label="Spatial" sub="SDO_GEOMETRY" color="#4C825C" />
              <DiagramBox label="Relational" sub="service requests + service points" color="#437C94" />
              <DiagramBox label="Select AI" sub="Agents & LLMs" color="#796087" />
              <DiagramBox label="Graph" sub="PGQL / APEX" color="#4F7D7B" />
              <DiagramBox label="Vector" sub="VECTOR_EMBEDDING" color="#A36472" wide />
              <DiagramBox label="In-Memory" sub="Column Store" color="#AA643B" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">All workloads. One transaction. One connection pool.</p>
              <p className="text-[9px] font-mono text-[var(--color-text)] mt-0.5">No Kafka · No Spark · No Sync Jobs</p>
            </div>
          </div>

          {/* Honest In-Memory declaration evidence */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Database size={12} className="tone-sienna" />
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">
                  In-Memory Readiness - Declaration only
                </p>
              </div>
              <span className="text-[9px] font-mono text-[var(--color-text)]">
                {loadingImReadiness ? 'CHECKING' : imEvidence.evidenceStatus || 'UNAVAILABLE'}
              </span>
            </div>

            {loadingImReadiness ? (
              <div className="rounded-lg p-3 text-[10px] text-[var(--color-text-dim)]" style={{ border: '1px solid rgba(170,100,59,0.3)' }}>
                Checking Oracle catalog evidence…
              </div>
            ) : imEvidence.evidenceStatus === 'UNAVAILABLE' ? (
              <div className="rounded-lg p-3" style={{ background: 'rgba(199,70,52,0.06)', border: '1px solid rgba(199,70,52,0.25)' }}>
                <p className="text-[10px] font-semibold tone-red">Unavailable</p>
                <p className="text-[9px] text-[var(--color-text-dim)] mt-1 leading-relaxed">
                  Oracle declaration metadata could not be read. No cached size, estimated compression, or active runtime state is shown.
                </p>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(170,100,59,0.3)' }}>
                {imSegments.length > 0 ? (
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr style={{ background: 'rgba(170,100,59,0.12)' }}>
                        <th className="text-left px-2 py-1.5 text-[var(--color-text)] font-semibold">Declared table</th>
                        <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Rows</th>
                        <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Disk</th>
                        <th className="text-left px-2 py-1.5 text-[var(--color-text)] font-semibold">Declaration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imSegments.map((segment, index) => (
                        <tr key={segment.TABLE_NAME} style={{ background: index % 2 === 0 ? 'rgba(170,100,59,0.04)' : 'transparent' }}>
                          <td className="px-2 py-1 font-mono text-[var(--color-text)]">{segment.TABLE_NAME}</td>
                          <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{Number(segment.ROW_COUNT || 0).toLocaleString()}</td>
                          <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{(Number(segment.DISK_BYTES || 0) / 1048576).toFixed(1)} MB</td>
                          <td className="px-2 py-1 text-[var(--color-text-dim)] font-mono">
                            {segment.INMEMORY_COMPRESSION || 'Default'} · {segment.INMEMORY_PRIORITY || 'NONE'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="px-3 py-2 text-[10px] text-[var(--color-text-dim)]">
                    No In-Memory table declarations were returned by Oracle.
                  </p>
                )}
                <div className="px-2 py-1.5" style={{ background: 'rgba(170,100,59,0.08)', borderTop: '1px solid rgba(170,100,59,0.2)' }}>
                  <span className="text-[9px] text-[var(--color-text-dim)]">
                    Sources: <span className="text-[var(--color-text)] font-mono">{(imEvidence.evidenceSources || []).join(' + ')}</span>
                  </span>
                </div>
              </div>
            )}

            <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
              Runtime population not claimed. This panel proves only Oracle table declarations and disk metadata; it does not prove
              populated column-store segments or an In-Memory execution plan.
            </p>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Energy Operations Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Real-time electric outage, gas leak, water/wastewater, pipeline, production, refinery, LNG, emissions, HSE, customer, asset, and field execution intelligence powered by Oracle AI Database 26ai
          </p>
        </div>
        <button onClick={refetchSummary} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <SceneStoryPanel scene="dashboard" />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard iconClass="oj-fwk-icon-tree-document" label="Service Requests Logged" value={formatNumber(s.ORDERS_TOTAL)} subValue={`${formatNumber(s.ORDERS_30D)} opened last 30 days`} color="#437C94" />
        <StatCard iconClass="oj-fwk-icon-view" label="Operational Value Tracked" value={formatCurrency(s.REVENUE_TOTAL)} subValue={`${formatCurrency(s.REVENUE_30D)} tied to last 30 days`} color="#4C825C" />
        <StatCard iconClass="oj-fwk-icon-message-warning" label="Critical Events Flagged" value={formatNumber(s.VIRAL_POSTS)} subValue={`${formatNumber(s.RISING_POSTS)} rising in current feed`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-sortrelevancehigh" label="Assets & Services Under Watch" value={formatNumber(s.TRENDING_PRODUCTS)} subValue={`${formatNumber(s.POSTS_TOTAL)} bulletins in current feed`} color="#AA643B" />
        <StatCard iconClass="oj-fwk-icon-users" label="Agent Actions Completed" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(s.SHIPMENTS_IN_TRANSIT)} pending / in transit`} color="#796087" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Reliability Signal Velocity Chart */}
        <div className="glass-card p-5 lg:col-span-2 flex flex-col">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity size={15} className="text-[var(--color-accent)]" />
                Operations Signal Velocity
                {loadingVelocity && <RefreshCw size={12} className="animate-spin text-[var(--color-text-dim)]" />}
              </h3>
              <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
                Measures active electric outages, gas leak response events, water main breaks, wastewater compliance alerts, pipeline pressure anomalies, refinery exceptions, LNG logistics delays, HSE incidents, emissions alerts, critical asset alerts, and field crew activity.
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
                <p className="text-sm text-[var(--color-text-dim)]">No bulletins during this time period</p>
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
                  tickFormatter={v => {
                    if (!v) return '';
                    // For hourly data (has HH:MI), show time; for daily/weekly, show date
                    if (v.length > 10) return v.slice(11, 16);
                    return v.slice(5); // MM-DD
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={58}
                  label={{
                    value: 'Signal count per bucket',
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
                <Area type="monotone" dataKey="POST_COUNT" stroke="#AA643B" fill="url(#gradSignals)" strokeWidth={2} name="Signal Bulletins" />
                <Area type="monotone" dataKey="VIRAL_COUNT" stroke="#C74634" fill="url(#gradViral)" strokeWidth={2} name="Critical Signals" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Operational Value by Utility Category */}
        <div className="glass-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign size={15} className="tone-pine" />
              Operational Value by Utility Category
            </h3>
            <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
              Last 30 days by utility category, including smaller categories grouped for readability.
            </p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={utilityCategoryChart.slices}
                dataKey="TOTAL_REVENUE"
                nameKey="CATEGORY"
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={85}
                paddingAngle={2}
              >
                {utilityCategoryChart.slices.map((row) => (
                  <Cell key={row.CATEGORY} fill={row.color} />
                ))}
              </Pie>
              {utilityCategoryChart.totalValue > 0 && (
                <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-0.15em" style={{ fill: 'var(--color-text)', fontSize: 13, fontWeight: 600 }}>
                    {formatCompactCurrency(utilityCategoryChart.totalValue)}
                  </tspan>
                  <tspan x="50%" dy="1.25em" style={{ fill: 'var(--color-text-dim)', fontSize: 10 }}>
                    30 day value
                  </tspan>
                </text>
              )}
              <Tooltip content={<UtilityCategoryTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {utilityCategoryChart.slices.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {utilityCategoryChart.slices.map((r) => (
                <div key={r.CATEGORY} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[10px]">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: r.color }} />
                    <span className="text-[var(--color-text)] truncate">{r.CATEGORY}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-[var(--color-text)]">{formatPercent(r.percentOfTotal)}</span>
                    <span className="text-[var(--color-text-dim)]"> · {formatCompactCurrency(r.TOTAL_REVENUE)}</span>
                  </div>
                  <div className="col-span-2 pl-3.5 -mt-1 text-[9px] text-[var(--color-text-dim)]">
                    {formatNumber(r.ORDER_COUNT)} service requests{r.isOther ? ` across ${formatNumber(r.CATEGORY_COUNT)} categories` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No operational value data available.</p>
          )}
        </div>
      </div>

      {/* Watched Services and Supplies Table */}
      <div className="glass-card p-5">
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <Flame size={15} className="tone-sienna" />
            Watched Assets, Services, and Operations
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
              - Cross-sector risk and capacity trend (7 day)
            </span>
          </h3>

          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search utility services, pipelines, wells, refineries, facilities, supplies, or partners..."
              className="w-full text-sm pl-8 pr-8 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Partner filter chips (populated from watched service results) */}
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
          <p className="text-sm text-[var(--color-text-dim)]">Loading watched Energy & Utilities assets and services...</p>
        ) : (
          <TrendingTable
            products={trending}
            onSelect={(id) => setSelectedProductId(id === selectedProductId ? null : id)}
            selectedId={selectedProductId}
          />
        )}

        {!loadingTrending && trending?.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No Energy & Utilities assets or services match your search.</p>
        )}

        <p className="text-[10px] text-[var(--color-text-dim)] mt-3">
          Click any row to view inventory and signal details.
        </p>
      </div>

      {/* Converged DB Capabilities Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider">Converged capabilities in use</span>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Relational', desc: 'Requests & Inventory', color: '#437C94' },
              { label: 'JSON', desc: 'Signal Payloads', color: '#4C825C' },
              { label: 'Graph', desc: 'Utility Partner Signal Network', color: '#AA643B' },
              { label: 'Vector', desc: 'Semantic Matching', color: '#796087' },
              { label: 'Spatial', desc: 'Field Operations Routing', color: '#4F7D7B' },
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

      {/* Product Detail Modal */}
      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}
