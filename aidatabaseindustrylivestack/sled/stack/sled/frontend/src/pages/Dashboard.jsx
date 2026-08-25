import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DollarSign, Activity, Flame, RefreshCw, Search, X, Package, MapPin,
  MessageSquare, ChevronRight, Clock, Database
} from 'lucide-react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, getMomentumColor } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { SceneStoryPanel } from '../components/StateLocalGovernmentStory';

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

/* ─── Public Service Detail Modal ─────────────────────────────────────────────── */
function ProductDetailModal({ productId, onClose }) {
  const { data, loading, error } = useData(() => api.publicServices.detail(productId), [productId]);
  const { data: duality, loading: loadingDuality } = useData(() => api.publicServices.duality(productId), [productId]);
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

  const product = data?.service;
  const inventory = data?.capacity || [];
  const mentions = data?.residentSignals || [];

  const totalOnHand = inventory.reduce((sum, r) => sum + metric(r, 'AVAILABLE_CAPACITY'), 0);
  const totalReserved = inventory.reduce((sum, r) => sum + metric(r, 'RESERVED_CAPACITY'), 0);

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
                <h3 className="text-lg font-bold">{field(product, 'SERVICE_NAME')}</h3>
                {field(product, 'PEAK_PRIORITY') && (
                  <span className={`priority-badge ${getPriorityBadgeClass(field(product, 'PEAK_PRIORITY'))}`}>
                    {getGovernmentTrendLabel(field(product, 'PEAK_PRIORITY'))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-text-dim)]">
                <span>{field(product, 'AGENCY_OR_PROGRAM')}</span>
                <span>·</span>
                <span>{product.CATEGORY}</span>
                <span>·</span>
                <span className="font-medium text-[var(--color-text)]">{formatCurrency(field(product, 'ESTIMATED_SERVICE_VALUE'))}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm tone-red">{error || 'Failed to load public service'}</p>
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
                <p className="text-[10px] text-[var(--color-text-dim)]">Available Capacity</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(170,100,59,0.05)', borderColor: 'rgba(170,100,59,0.2)' }}>
                <p className="text-lg font-bold tone-sienna">{formatNumber(totalReserved)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Reserved Capacity</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(67,124,148,0.05)', borderColor: 'rgba(67,124,148,0.2)' }}>
                <p className="text-lg font-bold tone-ocean">{formatNumber(mentions.length)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Resident Signals</p>
              </div>
            </div>

            {/* Inventory Breakdown */}
            {inventory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Capacity by Service Site
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
                        const available = metric(inv, 'AVAILABLE_CAPACITY') - metric(inv, 'RESERVED_CAPACITY');
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
                            <td className="py-2 px-2 text-right">{formatNumber(field(inv, 'AVAILABLE_CAPACITY'))}</td>
                            <td className="py-2 px-2 text-right tone-sienna">{formatNumber(field(inv, 'RESERVED_CAPACITY'))}</td>
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

            {/* Resident Signals */}
            {mentions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Recent Resident Signals
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {mentions.map((m, i) => (
                    <div key={i} className="p-3 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-[var(--color-accent)]">{field(m, 'PARTNER_HANDLE', 'agency partner')}</span>
                        <div className="flex items-center gap-2">
                          {field(m, 'PRIORITY_FLAG') && (
                            <span className={`priority-badge ${getPriorityBadgeClass(field(m, 'PRIORITY_FLAG'))}`} style={{ fontSize: 9 }}>
                              {getGovernmentTrendLabel(field(m, 'PRIORITY_FLAG'))}
                            </span>
                          )}
                          <span className="font-mono text-[10px]" style={{ color: getMomentumColor(field(m, 'PRIORITY_FLAG')) }}>
                            Priority {field(m, 'PRIORITY_SCORE')?.toFixed(1)}
                          </span>
                          {field(m, 'MATCH_CONFIDENCE') && (
                            <span className="text-[var(--color-text-dim)] text-[10px]">{(field(m, 'MATCH_CONFIDENCE') * 100).toFixed(0)}% conf</span>
                          )}
                        </div>
                      </div>
                      {field(m, 'SIGNAL_TEXT') && (
                        <p className="text-[var(--color-text-dim)] leading-relaxed line-clamp-2">{field(m, 'SIGNAL_TEXT')}</p>
                      )}
                      {field(m, 'MATCH_TYPE') && (
                        <span className="text-[9px] tone-plum mt-1 inline-block">{field(m, 'MATCH_TYPE')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inventory.length === 0 && mentions.length === 0 && (
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No detailed data available for this public service.</p>
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
                  <span className="text-[#AA643B] font-semibold">Public Service + Capacity as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> - The same public service and capacity data from the Details tab, exposed as a single nested JSON document.
                  The duality view joins <span className="text-[#437C94] font-mono">service_catalog</span> and <span className="text-[#437C94] font-mono">service_capacity</span>
                  into one document with nested capacity details.</span>
                </div>

                <div className="dashboard-duality-json-panel">
                  <div className="dashboard-duality-json-panel__header">
                    <span className="dashboard-duality-json-panel__title">JSON Document</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {duality.document.capacity?.length || 0} capacity locations
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

/* ─── Watched Public Services Table ────────────────────────────────────── */
function getGovernmentTrendLabel(momentum) {
  switch (String(momentum || '').toLowerCase()) {
    case 'critical': return 'Critical';
    case 'escalating': return 'Escalating';
    case 'rising': return 'Rising';
    default: return 'Stable';
  }
}

function getPriorityBadgeClass(momentum) {
  switch (String(momentum || '').toLowerCase()) {
    case 'critical':
      return 'priority-critical';
    case 'escalating':
      return 'priority-escalating';
    case 'rising':
      return 'priority-rising';
    default:
      return 'priority-normal';
  }
}

function getRecommendedServiceAction(row) {
  const category = (row.CATEGORY || '').toLowerCase();
  const trend = normalizePriority(field(row, 'PEAK_PRIORITY', ''));

  if (category.includes('benefit') || category.includes('public assistance') || category.includes('health and human services')) {
    return 'Review eligibility queue';
  }
  if (category.includes('permit') || category.includes('license') || category.includes('inspection') || category.includes('code')) {
    return 'Assign inspection review';
  }
  if (category.includes('public works') || category.includes('transportation') || category.includes('emergency')) {
    return 'Review response plan';
  }
  if (category.includes('tax') || category.includes('revenue') || category.includes('grant')) {
    return 'Check compliance exposure';
  }
  if (category.includes('records') || category.includes('policy') || category.includes('accessibility')) {
    return 'Verify audit evidence';
  }
  if (trend === 'critical' || trend === 'escalating') return 'Route agency follow-up';

  return 'Open service detail';
}

function TrendingTable({ products, onSelect, selectedId }) {
  if (!products?.length) return <p className="text-sm text-[var(--color-text-dim)]">No watched public service data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
            <th className="text-left py-2 px-3">Service / Program</th>
            <th className="text-left py-2 px-3">Responsible Agency / Program</th>
            <th className="text-right py-2 px-3">Signals</th>
            <th className="text-right py-2 px-3">Resident Impact</th>
            <th className="text-center py-2 px-3">Trend</th>
            <th className="text-left py-2 px-3">Next Step</th>
            <th className="py-2 px-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => {
            const serviceId = field(p, 'SERVICE_ID');
            const priority = field(p, 'PEAK_PRIORITY');
            const isSelected = selectedId === serviceId;
            const trendLabel = getGovernmentTrendLabel(priority);
            const recommendedAction = getRecommendedServiceAction(p);
            return (
              <tr
                key={serviceId || i}
                onClick={() => onSelect(serviceId)}
                className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                style={isSelected ? { background: 'rgba(199,70,52,0.12)', borderColor: 'rgba(199,70,52,0.3)' } : {}}
              >
                <td className="py-2.5 px-3 font-medium">{field(p, 'SERVICE_NAME')}</td>
                <td className="py-2.5 px-3 text-[var(--color-text-dim)]">{field(p, 'AGENCY_OR_PROGRAM')}</td>
                <td className="py-2.5 px-3 text-right">{formatNumber(field(p, 'SIGNAL_MATCH_COUNT'))}</td>
                <td className="py-2.5 px-3 text-right">{formatNumber(field(p, 'TOTAL_REACH'))}</td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`priority-badge ${getPriorityBadgeClass(priority)}`}>
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

const GOVERNMENT_CATEGORY_COLORS = ['#C74634', '#4F7D7B', '#AA643B', '#4C825C', '#A36472', '#437C94', '#796087', '#6B7494'];
const GOVERNMENT_CATEGORY_VISIBLE_SLICES = 7;

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

function field(row, publicKey, fallback = undefined) {
  if (!row) return fallback;
  if (row[publicKey] !== undefined && row[publicKey] !== null) return row[publicKey];
  return fallback;
}

function metric(row, publicKey) {
  return toMetricNumber(field(row, publicKey, 0));
}

function normalizePriority(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'critical') return 'critical';
  if (normalized === 'escalating') return 'escalating';
  return normalized || 'stable';
}

function formatVelocityBucket(value) {
  if (!value) return 'No time bucket';
  return value.length > 10 ? value : `${value} bucket`;
}

function normalizeVelocityRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    TIME_BUCKET: field(row, 'TIME_BUCKET', 'HOUR_BUCKET'),
    SIGNAL_COUNT: metric(row, 'SIGNAL_COUNT'),
    CRITICAL_SIGNAL_COUNT: metric(row, 'CRITICAL_SIGNAL_COUNT'),
    TOTAL_ACKNOWLEDGEMENTS: metric(row, 'TOTAL_ACKNOWLEDGEMENTS'),
    TOTAL_HANDOFFS: metric(row, 'TOTAL_HANDOFFS'),
  }));
}

function getVelocitySpike(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const criticalSpike = rows.reduce((largest, row) => {
    const value = metric(row, 'CRITICAL_SIGNAL_COUNT');
    const postCount = metric(row, 'SIGNAL_COUNT');
    if (!largest || value > largest.value || (value === largest.value && postCount > largest.postCount)) {
      return { row, value, postCount };
    }
    return largest;
  }, null);

  if (criticalSpike?.value > 0) {
    return {
      row: criticalSpike.row,
      metricKey: 'CRITICAL_SIGNAL_COUNT',
      value: criticalSpike.value,
      label: 'Peak critical service signal bucket',
      stroke: '#C74634',
    };
  }

  const volumeSpike = rows.reduce((largest, row) => {
    const value = metric(row, 'SIGNAL_COUNT');
    const postCount = metric(row, 'SIGNAL_COUNT');
    if (!largest || value > largest.value || (value === largest.value && postCount > largest.postCount)) {
      return { row, value, postCount };
    }
    return largest;
  }, null);

  if (volumeSpike?.value > 0) {
    return {
      row: volumeSpike.row,
      metricKey: 'SIGNAL_COUNT',
      value: volumeSpike.value,
      label: 'Largest agency workload bucket',
      stroke: '#AA643B',
    };
  }

  return null;
}

function VelocityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  // The velocity API is bucket-level only. Agency/program context cannot be
  // shown without changing the backend contract, so the UI uses a safe
  // aggregate label when those fields are absent.
  const agencyOrCategory =
    row.AGENCY_NAME || row.AGENCY || row.CATEGORY || field(row, 'AGENCY_OR_PROGRAM') || 'Aggregated State and Local Government services';
  const contextLabel =
    row.AGENCY_NAME || row.AGENCY ? 'Agency' :
    row.CATEGORY || field(row, 'AGENCY_OR_PROGRAM') ? 'Category' :
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
          <span className="text-[var(--color-text-dim)]">Agency intake events</span>
          <span className="font-semibold">{formatNumber(field(row, 'SIGNAL_COUNT'))}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Critical service signals</span>
          <span className="font-semibold tone-red">{formatNumber(field(row, 'CRITICAL_SIGNAL_COUNT'))}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Resident acknowledgements</span>
          <span className="font-semibold tone-sienna">{formatNumber(field(row, 'TOTAL_ACKNOWLEDGEMENTS'))}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Escalation shares</span>
          <span className="font-semibold">{formatNumber(field(row, 'TOTAL_HANDOFFS'))}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">{contextLabel}</span>
          <span className="font-medium text-right">{agencyOrCategory}</span>
        </div>
      </div>
    </div>
  );
}

function getGovernmentCategoryChart(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map(row => ({
      ...row,
      SERVICE_VALUE: metric(row, 'SERVICE_VALUE'),
      SERVICE_REQUEST_COUNT: metric(row, 'SERVICE_REQUEST_COUNT'),
      SIGNAL_LINKED_REQUESTS: metric(row, 'SIGNAL_LINKED_REQUESTS'),
    }))
    .filter(row => row.SERVICE_VALUE > 0);
  const totalValue = normalizedRows.reduce((sum, row) => sum + row.SERVICE_VALUE, 0);

  if (!totalValue) {
    return { slices: [], totalValue: 0, topCategory: null, hiddenCount: 0 };
  }

  const visibleRows = normalizedRows.slice(0, GOVERNMENT_CATEGORY_VISIBLE_SLICES);
  const hiddenRows = normalizedRows.slice(GOVERNMENT_CATEGORY_VISIBLE_SLICES);
  const otherRow = hiddenRows.length
    ? {
        CATEGORY: 'Other categories',
        SERVICE_VALUE: hiddenRows.reduce((sum, row) => sum + row.SERVICE_VALUE, 0),
        SERVICE_REQUEST_COUNT: hiddenRows.reduce((sum, row) => sum + row.SERVICE_REQUEST_COUNT, 0),
        SIGNAL_LINKED_REQUESTS: hiddenRows.reduce((sum, row) => sum + row.SIGNAL_LINKED_REQUESTS, 0),
        CATEGORY_COUNT: hiddenRows.length,
        isOther: true,
      }
    : null;

  const slices = [...visibleRows, ...(otherRow ? [otherRow] : [])]
    .map((row, index) => ({
      ...row,
      percentOfTotal: row.SERVICE_VALUE / totalValue,
      color: GOVERNMENT_CATEGORY_COLORS[index % GOVERNMENT_CATEGORY_COLORS.length],
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

function GovernmentCategoryTooltip({ active, payload }) {
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
          <span className="font-semibold">{formatCurrency(row.SERVICE_VALUE)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Share of total</span>
          <span className="font-semibold">{formatPercent(row.percentOfTotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Service requests</span>
          <span className="font-semibold">{formatNumber(row.SERVICE_REQUEST_COUNT)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--color-text-dim)]">Signal-linked requests</span>
          <span className="font-semibold">{formatNumber(row.SIGNAL_LINKED_REQUESTS)}</span>
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
  const { data: imSegments } = useData(() => api.dashboard.inmemory());

  // Search / filter state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(null);
  const debounceRef = useRef(null);

  const { data: trending, loading: loadingTrending } = useData(
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
  const medicaidRisk = s.medicaidEligibilityRisk || {};
  const medicaidCurrentRate = Number(medicaidRisk.currentErrorRatePercent);
  const medicaidThreshold = Number(medicaidRisk.thresholdPercent);
  const medicaidMetricReady = Number.isFinite(medicaidCurrentRate)
    && Number.isFinite(medicaidThreshold)
    && medicaidThreshold > 0;
  const medicaidStatus = medicaidMetricReady
    ? medicaidRisk.status
    : loadingSummary ? 'Loading Metric' : 'Metric Unavailable';
  const medicaidAboveThreshold = medicaidMetricReady && medicaidRisk.aboveThreshold === true;
  const medicaidThresholdStatus = medicaidMetricReady
    ? `${medicaidAboveThreshold ? 'Above' : 'Within'} ${medicaidThreshold.toFixed(1)}% limit`
    : null;
  const medicaidStatusColor = !medicaidMetricReady
    ? '#697778'
    : medicaidAboveThreshold
      ? '#C74634'
      : medicaidStatus === 'Approaching Threshold' ? '#AA643B' : '#4C825C';
  const velocityRows = normalizeVelocityRows(velocity || []);
  const serviceRows = Array.isArray(trending) ? trending : [];
  const velocitySpike = getVelocitySpike(velocityRows);
  const governmentCategoryChart = getGovernmentCategoryChart(revenue || []);

  return (
    <div className="space-y-6 fade-in">
      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Public Service Command Center">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This dashboard issues a single <span className="tone-teal font-mono">SELECT</span> across constituent services, permits and licensing, benefits eligibility, inspections, emergency response, public works, transportation, tax and revenue, grants, and records operations while using five Oracle workload engines simultaneously -
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
-- Government-facing query surfaces keep demo SQL agency-focused.
SELECT
  (SELECT COUNT(*)
     FROM sled_service_requests_v) AS service_requests_total,
  (SELECT NVL(SUM(service_value_exposure), 0)
     FROM sled_service_requests_v) AS service_value_exposure,
  (SELECT COUNT(*)
     FROM sled_resident_signals_v
    WHERE urgency_score >= 80) AS critical_service_signals,
  (SELECT COUNT(*)
     FROM agent_actions) AS agent_actions,
  (SELECT COUNT(*)
     FROM sled_service_task_routes_v
    WHERE route_status = 'active route') AS active_service_routes
FROM dual;`} />
          <SqlBlock code={`-- Service and program search: Oracle UPPER() case-insensitive LIKE
SELECT service_name,
       program_name,
       service_category,
       COUNT(*) AS service_count,
       ROUND(AVG(service_value_proxy), 2) AS avg_service_value
FROM sled_public_services_v
WHERE REGEXP_LIKE(UPPER(service_name || ' ' || service_category || ' ' || program_name),
                  'PERMIT|INSPECTION|LICENSE|BENEFIT|PUBLIC WORKS|CASE MANAGEMENT')
GROUP BY service_name, program_name, service_category
ORDER BY avg_service_value DESC
FETCH FIRST 10 ROWS ONLY;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Converged Architecture</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="JSON Docs" sub="resident signals · event_stream" color="#AA643B" />
              <DiagramBox label="Oracle AI Database 26ai" sub="One Engine" color="#c74634" />
              <DiagramBox label="Spatial" sub="SDO_GEOMETRY" color="#4C825C" />
              <DiagramBox label="Relational" sub="service requests + residents" color="#437C94" />
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

          {/* Live In-Memory Column Store Stats */}
          {imSegments?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database size={12} className="tone-sienna" />
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">In-Memory Column Store - Live</p>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(170,100,59,0.3)' }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: 'rgba(170,100,59,0.12)' }}>
                      <th className="text-left px-2 py-1.5 text-[var(--color-text)] font-semibold">Object</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Rows</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Disk</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">IM Size</th>
                      <th className="text-right px-2 py-1.5 text-[var(--color-text)] font-semibold">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imSegments.map((seg, i) => (
                      <tr key={field(seg, 'DATA_SUBJECT', `subject-${i}`)} style={{ background: i % 2 === 0 ? 'rgba(170,100,59,0.04)' : 'transparent' }}>
                        <td className="px-2 py-1 font-mono text-[var(--color-text)]">{field(seg, 'DATA_SUBJECT', 'State and Local Government object')}</td>
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
                    Compression: <span className="text-[var(--color-text)] font-mono">{imSegments[0]?.COMPRESSION || 'FOR QUERY HIGH'}</span>
                  </span>
                  <span className="text-[9px] font-mono text-[var(--color-text)]">
                    {imSegments.every(s => s.STATUS === 'COMPLETED') ? '● POPULATED' : '○ POPULATING'}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
                Oracle In-Memory Column Store keeps hot State and Local Government service objects in a compressed columnar format for analytical scans -
                no ETL to a separate analytics database. Queries against these objects automatically use IMCS when beneficial.
              </p>
            </div>
          )}
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Public Service Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Real-time resident demand, service access, SLA risk, and capacity intelligence powered by Oracle AI Database 26ai.
          </p>
        </div>
        <button onClick={refetchSummary} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />
          Refresh command center
        </button>
      </div>

      <SceneStoryPanel scene="dashboard" />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard iconClass="oj-fwk-icon-tree-document" label="Service Requests" value={formatNumber(field(s, 'SERVICE_REQUESTS_TOTAL', 0))} subValue={`${formatNumber(field(s, 'SERVICE_REQUESTS_30D', 0))} last 30d`} color="#437C94" />
        <StatCard iconClass="oj-fwk-icon-view" label="Service Value Exposure" value={formatCurrency(field(s, 'SERVICE_VALUE_TOTAL', 0))} subValue={`${formatCurrency(field(s, 'SERVICE_VALUE_30D', 0))} last 30d`} color="#4C825C" />
        <StatCard iconClass="oj-fwk-icon-message-warning" label="Urgent Resident Signals" value={formatNumber(field(s, 'CRITICAL_SIGNALS', 0))} subValue={`${formatNumber(field(s, 'RISING_SIGNALS', 0))} rising`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-sortrelevancehigh" label="Services Under Pressure" value={formatNumber(field(s, 'SERVICES_UNDER_PRESSURE', 0))} subValue={`${formatNumber(field(s, 'SIGNALS_TOTAL', 0))} total signals`} color="#AA643B" />
        <StatCard iconClass="oj-fwk-icon-users" label="Audited Actions" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(field(s, 'ACTIVE_SERVICE_ROUTES', 0))} active routes`} color="#796087" />
      </div>

      <section
        className="glass-card p-5"
        aria-labelledby="medicaid-eligibility-risk-title"
        title="Medicaid eligibility error rate tracks eligibility-related improper payment risk against the stakeholder-provided 3% demo threshold."
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="medicaid-eligibility-risk-title" className="text-base font-bold">
                Medicaid Eligibility Error Rate
              </h3>
              <span
                className="rounded-full px-2 py-1 text-[10px] font-bold"
                style={{ background: `${medicaidStatusColor}18`, border: `1px solid ${medicaidStatusColor}45`, color: 'var(--color-text)' }}
              >
                {medicaidStatus}
              </span>
              {medicaidThresholdStatus && (
                <span
                  className="rounded-full px-2 py-1 text-[10px] font-semibold text-[var(--color-text)]"
                  style={{
                    background: medicaidAboveThreshold ? 'rgba(199,70,52,0.10)' : 'rgba(76,130,92,0.10)',
                    border: `1px solid ${medicaidAboveThreshold ? 'rgba(199,70,52,0.30)' : 'rgba(76,130,92,0.30)'}`,
                  }}
                >
                  {medicaidThresholdStatus}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-dim)]">
              Tracks the share of eligibility-related payments that may be improper.{' '}
              {!medicaidMetricReady
                ? loadingSummary
                  ? 'Loading the current rate and threshold status.'
                  : 'The current rate and threshold status are temporarily unavailable.'
                : medicaidAboveThreshold
                  ? 'The current rate is above the stakeholder-provided threshold and requires risk review.'
                  : medicaidStatus === 'Approaching Threshold'
                    ? 'The current rate remains within the threshold but is close enough to require active monitoring.'
                    : 'The current rate is within the stakeholder-provided threshold.'}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-dim)]">
              This demo risk indicator applies the stakeholder-provided 3% threshold as a business rule (displayed as 3.0%).
              Rates above it may create potential federal matching-fund exposure.
            </p>
          </div>

          <div className="grid min-w-full grid-cols-2 gap-3 sm:min-w-[360px] lg:min-w-[420px]">
            <div className="rounded-lg p-4" style={{ background: `${medicaidStatusColor}0D`, border: `1px solid ${medicaidStatusColor}35` }}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Current rate</p>
              <p className="mt-1 text-3xl font-bold" style={{ color: medicaidStatusColor }}>
                {Number.isFinite(medicaidCurrentRate) ? `${medicaidCurrentRate.toFixed(1)}%` : '…'}
              </p>
            </div>
            <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Demo threshold</p>
              <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
                {Number.isFinite(medicaidThreshold) ? `${medicaidThreshold.toFixed(1)}%` : '…'}
              </p>
            </div>
          </div>
        </div>
        {medicaidAboveThreshold && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm surface-red-soft text-[var(--color-text)]" role="alert">
            Above Threshold — {medicaidRisk.potentialRisk || 'Potential federal matching-fund exposure'}
          </div>
        )}
      </section>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agency Workload Velocity Chart */}
        <div className="glass-card p-5 lg:col-span-2 flex flex-col">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity size={15} className="text-[var(--color-accent)]" />
                Agency Workload Velocity
                {loadingVelocity && <RefreshCw size={12} className="animate-spin text-[var(--color-text-dim)]" />}
              </h3>
              <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
                Measures constituent service requests, permits and licensing, benefits eligibility, inspections, emergency response, public works, transportation, tax and revenue, records, grants, and compliance workload signals.
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
          {!loadingVelocity && velocityRows.length === 0 ? (
            <div className="flex flex-1 min-h-[280px] items-center justify-center">
              <div className="text-center space-y-2">
                <Activity size={28} className="mx-auto text-[var(--color-text-dim)] opacity-40" />
                <p className="text-sm text-[var(--color-text-dim)]">No agency intake events during this time period</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Try selecting a wider range</p>
              </div>
            </div>
          ) : (
          <div className="flex-1 min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={velocityRows}>
                <defs>
                  <linearGradient id="gradSignals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#AA643B" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#AA643B" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCritical" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C74634" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#C74634" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.3} />
                <XAxis
                  dataKey="TIME_BUCKET"
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
                    x={velocitySpike.row.TIME_BUCKET}
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
                <Area type="monotone" dataKey="SIGNAL_COUNT" stroke="#AA643B" fill="url(#gradSignals)" strokeWidth={2} name="Agency Intake Events" />
                <Area type="monotone" dataKey="CRITICAL_SIGNAL_COUNT" stroke="#C74634" fill="url(#gradCritical)" strokeWidth={2} name="Critical Service Signals" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Service Value by Category */}
        <div className="glass-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <DollarSign size={15} className="tone-pine" />
              Service Value by Category
            </h3>
            <p className="text-[11px] text-[var(--color-text-dim)] mt-1">
              Last 30 days by government service category, including smaller categories grouped for readability.
            </p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={governmentCategoryChart.slices}
                dataKey="SERVICE_VALUE"
                nameKey="CATEGORY"
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={85}
                paddingAngle={2}
              >
                {governmentCategoryChart.slices.map((row) => (
                  <Cell key={row.CATEGORY} fill={row.color} />
                ))}
              </Pie>
              {governmentCategoryChart.totalValue > 0 && (
                <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-0.15em" style={{ fill: 'var(--color-text)', fontSize: 13, fontWeight: 600 }}>
                    {formatCompactCurrency(governmentCategoryChart.totalValue)}
                  </tspan>
                  <tspan x="50%" dy="1.25em" style={{ fill: 'var(--color-text-dim)', fontSize: 10 }}>
                    30 day value
                  </tspan>
                </text>
              )}
              <Tooltip content={<GovernmentCategoryTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {governmentCategoryChart.slices.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {governmentCategoryChart.slices.map((r) => (
                <div key={r.CATEGORY} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-[10px]">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: r.color }} />
                    <span className="text-[var(--color-text)] truncate">{r.CATEGORY}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-[var(--color-text)]">{formatPercent(r.percentOfTotal)}</span>
                    <span className="text-[var(--color-text-dim)]"> · {formatCompactCurrency(r.SERVICE_VALUE)}</span>
                  </div>
                  <div className="col-span-2 pl-3.5 -mt-1 text-[9px] text-[var(--color-text-dim)]">
                    {formatNumber(r.SERVICE_REQUEST_COUNT)} service requests{r.isOther ? ` across ${formatNumber(r.CATEGORY_COUNT)} categories` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No service value data available.</p>
          )}
        </div>
      </div>

        {/* Services Under Pressure Table */}
      <div className="glass-card p-5">
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <Flame size={15} className="tone-sienna" />
            Services Under Pressure
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
              - Agency workload and SLA risk trend (7 day)
            </span>
          </h3>

          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search public services or programs…"
              className="w-full text-sm pl-8 pr-8 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            {searchInput && (
              <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Program filter chips (populated from watched service results) */}
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            {Array.from(new Set(serviceRows.map(p => field(p, 'AGENCY_OR_PROGRAM')).filter(Boolean))).slice(0, 4).map(b => (
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
            {brand && !(serviceRows.slice(0, 4).map(p => field(p, 'AGENCY_OR_PROGRAM')).includes(brand)) && (
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
            {serviceRows.length} result{serviceRows.length !== 1 ? 's' : ''}
            {search ? <> matching <em>"{search}"</em></> : null}
            {brand ? <> under <em>{brand}</em></> : null}
            {' · '}
            <button className="underline hover:text-[var(--color-text)]" onClick={() => { clearSearch(); setBrand(''); }}>Clear all</button>
          </p>
        )}

        {loadingTrending ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading State and Local Government services under pressure...</p>
        ) : (
          <TrendingTable
            products={serviceRows}
            onSelect={(id) => setSelectedProductId(id === selectedProductId ? null : id)}
            selectedId={selectedProductId}
          />
        )}

        {!loadingTrending && serviceRows.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No public services match your search.</p>
        )}

        <p className="text-[10px] text-[var(--color-text-dim)] mt-3">
          Click any row to view capacity and resident signal details
        </p>
      </div>

      {/* Converged DB Capabilities Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider">Converged capabilities in use</span>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Relational', desc: 'Service requests & capacity', color: '#437C94' },
              { label: 'JSON', desc: 'Resident signal events', color: '#4C825C' },
              { label: 'Graph', desc: 'Community partner network', color: '#AA643B' },
              { label: 'Vector', desc: 'Semantic Matching', color: '#796087' },
              { label: 'Spatial', desc: 'Service Access Routing', color: '#4F7D7B' },
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

      {/* Public Service Detail Modal */}
      {selectedProductId && (
        <ProductDetailModal
          productId={selectedProductId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </div>
  );
}
