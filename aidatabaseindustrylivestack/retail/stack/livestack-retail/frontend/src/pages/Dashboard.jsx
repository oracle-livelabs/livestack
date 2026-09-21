import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, TrendingUp, Eye, Truck, Bot, DollarSign,
  Activity, Flame, RefreshCw, Search, X, Package, MapPin,
  MessageSquare, ChevronRight, Clock, Database
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, getMomentumColor } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { RetailSceneStory } from '../components/RetailStory';

const CANONICAL_INMEMORY_SEGMENTS = Object.freeze([
  'ORDERS',
  'ORDER_ITEMS',
  'SOCIAL_POSTS',
  'CUSTOMERS',
  'DEMAND_FORECASTS',
]);

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

/* ─── Product Detail Modal ─────────────────────────────────────────────── */
function ProductDetailModal({ productId, onClose }) {
  const { data, loading, error } = useData(() => api.products.detail(productId), [productId]);
  const { data: duality, loading: loadingDuality, error: dualityError } = useData(() => api.products.duality(productId), [productId]);
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
                <p className="text-lg font-bold tone-ocean">{formatNumber(mentions.length)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Customer Signals</p>
              </div>
            </div>

            {/* Inventory Breakdown */}
            {inventory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Inventory by Fulfillment Center
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

            {/* Customer Signal Mentions */}
            {mentions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Recent Customer Signals
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
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No detailed data available for this product.</p>
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
              <div className="text-sm tone-red text-center py-8" role="alert">
                JSON Relational Duality is unavailable: {dualityError.message}
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
                  <span className="text-[#AA643B] font-semibold">Product + Inventory as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> - The same product and inventory data from the Details tab, exposed as a single nested JSON document.
                  The duality view joins <span className="text-[#437C94] font-mono">products</span> and <span className="text-[#437C94] font-mono">inventory</span> tables
                  into one document with nested inventory array.</span>
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

/* ─── Trending Table ───────────────────────────────────────────────────── */
function TrendingTable({ products, onSelect, selectedId }) {
  if (!products?.length) return <p className="text-sm text-[var(--color-text-dim)]">No trending data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
            <th className="text-left py-2 px-3">Product</th>
            <th className="text-left py-2 px-3">Brand</th>
            <th className="text-right py-2 px-3">Mentions</th>
            <th className="text-right py-2 px-3">Views</th>
            <th className="text-right py-2 px-3">Demand Momentum</th>
            <th className="text-center py-2 px-3">Signal Type</th>
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

export default function Dashboard() {
  const { data: summary } = useData(() => api.dashboard.summary());
  const { data: returnsData } = useData(() => api.returns.summary());
  const [velocityHours, setVelocityHours] = useState(168); // default 7d, wide enough to always show data
  const { data: velocity, loading: loadingVelocity } = useData(() => api.dashboard.velocity(velocityHours), [velocityHours]);
  const { data: revenue } = useData(() => api.dashboard.revenueByCategory());
  const { data: imEvidence, error: imError } = useData(() => api.dashboard.inmemory());
  const imSegments = Array.isArray(imEvidence?.rows) ? imEvidence.rows : [];
  const imSegmentNames = imSegments.map((segment) => segment.TABLE_NAME);
  const imMemoryReady = imSegments.length === CANONICAL_INMEMORY_SEGMENTS.length
    && CANONICAL_INMEMORY_SEGMENTS.every((name) => imSegmentNames.includes(name))
    && imSegments.every((segment) => (
      segment.STATUS === 'COMPLETED'
      && Number(segment.IM_BYTES) > 0
      && Number(segment.BYTES_NOT_POPULATED) === 0
    ));
  const {
    data: nativeJsonEvidence,
    error: nativeJsonError,
  } = useData(() => api.dashboard.nativeJson());

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
  const returnSummary = returnsData?.summary || {};
  const returnStatusRows = returnsData?.byStatus || [];
  const openReturns = returnStatusRows.reduce((total, row) => {
    const status = String(row.STATUS || row.status || '').toLowerCase();
    const isClosed = status.includes('approved') || status.includes('denied') || status.includes('closed');
    return isClosed ? total : total + Number(row.COUNT || row.count || 0);
  }, 0);
  const highRiskReturns = Number(returnSummary.HIGH_RISK || returnSummary.high_risk || 0);
  const returnExposure = Number(returnSummary.EXPOSURE_VALUE || returnSummary.exposure_value || 0);
  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Retail Command Center">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This command center composes separate VPD-scoped relational aggregates for orders, social signals, shipments, products, and returns. It also verifies current-generation Native JSON operators and Database In-Memory from trusted feature metadata. Opening a product adds a live relational detail read and the matching <span className="font-mono">PRODUCTS_INVENTORY_DV</span> document.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Relational SQL" color="blue" />
            <FeatureBadge label="Native JSON evidence" color="orange" />
            <FeatureBadge label="JSON Relational Duality" color="purple" />
            <FeatureBadge label="Oracle VPD" color="green" />
            <FeatureBadge label="In-Memory Column Store" color="yellow" />
          </div>
          <SqlBlock code={`-- Relational command-center summary
SELECT
  (SELECT COUNT(*) FROM orders) AS orders_total,
  (SELECT NVL(SUM(order_total), 0) FROM orders) AS revenue_total,
  (SELECT COUNT(*) FROM social_posts
    WHERE momentum_flag IN ('viral','mega_viral')) AS viral_posts,
  (SELECT COUNT(*) FROM agent_actions) AS agent_actions_total,
  (SELECT COUNT(*) FROM shipments
    WHERE ship_status = 'in_transit') AS shipments_in_transit
FROM dual;`} />
          <SqlBlock code={`-- Safe aggregate Native JSON feature metadata
SELECT s.active_generation_id,
       s.dataset_fingerprint,
       COUNT(*) AS evidence_count
FROM retail_native_json_evidence_v e
JOIN app_dataset_state s
  ON s.active_generation_id = e.generation_id
 AND s.dataset_fingerprint = e.dataset_fingerprint
WHERE s.state_id = 1
  AND e.feature_name = 'native_json'
  AND e.has_event = 'YES'
GROUP BY s.active_generation_id,
         s.dataset_fingerprint;`} />
          {nativeJsonEvidence?.available ? (
            <p
              className="text-xs text-[var(--color-text-dim)]"
              data-testid="native-json-evidence-tuple"
            >
              Native JSON evidence: {nativeJsonEvidence.proof?.evidenceCount || 0} current-generation proof row(s)
              {' · '}generation {nativeJsonEvidence.proof?.generationId}
              {' · '}fingerprint {nativeJsonEvidence.proof?.datasetFingerprint}
              {' · '}{nativeJsonEvidence.proof?.operators?.join(' + ')}.
              {' '}This is global Native JSON feature metadata; no event or business payload is exposed.
            </p>
          ) : (
            <p
              className="text-xs tone-red"
              data-testid="native-json-evidence-unavailable"
              role="alert"
            >
              {nativeJsonError?.message || 'Native JSON evidence is unavailable.'}
            </p>
          )}
          <SqlBlock code={`-- Product search: Oracle UPPER() case-insensitive LIKE
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
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Mounted workload</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="Relational APIs" sub="orders · social · returns" color="#437C94" />
              <DiagramBox label="Native JSON proof" sub="JSON_VALUE · JSON_EXISTS" color="#AA643B" />
              <DiagramBox label="Product detail" sub="PRODUCTS_INVENTORY_DV" color="#796087" />
              <DiagramBox label="Oracle AI Database 26ai" sub="one governed schema" color="#c74634" wide />
              <DiagramBox label="In-Memory proof" sub="TABLE ACCESS INMEMORY FULL" color="#AA643B" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">Independent read-only API calls · one VPD identity · one active dataset generation</p>
              <p className="text-[9px] font-mono text-[var(--color-text)] mt-0.5">No cross-card transaction is claimed</p>
            </div>
          </div>

          {/* Live In-Memory Column Store Stats */}
          {imSegments.length > 0 && (
            <div data-testid="inmemory-evidence-tuple">
              <div className="flex items-center gap-1.5 mb-2">
                <Database size={12} className="tone-sienna" />
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">
                  In-Memory Column Store: {imMemoryReady ? 'Live' : 'Not Ready'}
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
                      <tr
                        key={seg.TABLE_NAME}
                        data-testid={`inmemory-segment-${seg.TABLE_NAME}`}
                        style={{ background: i % 2 === 0 ? 'rgba(170,100,59,0.04)' : 'transparent' }}
                      >
                        <td className="px-2 py-1 font-mono text-[var(--color-text)]">
                          <span className="block">{seg.TABLE_NAME}</span>
                          <span className="block text-[8px] text-[var(--color-text-dim)]">
                            {seg.STATUS} · {seg.PRIORITY} · {seg.COMPRESSION}
                            {' '}· missing {Number(seg.BYTES_NOT_POPULATED || 0)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{Number(seg.ROW_COUNT || 0).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{(seg.DISK_BYTES / 1048576).toFixed(1)} MB</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text)] font-medium">
                          {seg.IM_BYTES == null ? 'Unavailable' : `${(seg.IM_BYTES / 1048576).toFixed(1)} MB`}
                        </td>
                        <td className="px-2 py-1 text-right font-medium text-[var(--color-text)]">
                          {seg.COMPRESSION_PCT == null ? '—' : `${seg.COMPRESSION_PCT}%`}
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
                    {imMemoryReady ? '● POPULATED' : '○ POPULATING'}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
                Oracle In-Memory Column Store keeps hot tables in a compressed columnar format for analytical scans,
                with this deployment proving <span className="font-mono">{imEvidence?.proof?.PLAN_PROOF_OPERATION}</span> in the actual cursor plan.
                {' '}This is global feature metadata; business KPIs above remain scoped to the selected persona.
              </p>
            </div>
          )}
          {imError && (
            <div className="rounded-lg border border-[var(--color-danger)]/40 p-3 text-xs">
              Database In-Memory is unavailable: {imError.message}
            </div>
          )}
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div>
        <div>
          <h2 className="text-2xl font-bold">Retail Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Monitor the AllTerrain Hiking Boots demand story across orders, inventory, service exposure, customer signals, fulfillment risk, and AI agent activity.
          </p>
        </div>
      </div>

      <RetailSceneStory scene="dashboard" />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
        <StatCard iconClass="oj-fwk-icon-tree-document" label="Total Orders" value={formatNumber(s.ORDERS_TOTAL)} subValue={`${formatNumber(s.ORDERS_30D)} last 30d`} color="#437C94" />
        <StatCard iconClass="oj-fwk-icon-view" label="Retail Revenue" value={formatCurrency(s.REVENUE_TOTAL)} subValue={`${formatCurrency(s.REVENUE_30D)} last 30d`} color="#4C825C" />
        <StatCard iconClass="oj-fwk-icon-tree-folder-open" label="Open Service Cases" value={formatNumber(openReturns || returnSummary.TOTAL_RETURNS || 0)} subValue={`${formatNumber(highRiskReturns)} high risk`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-warning" label="Service Value Exposure" value={formatCurrency(returnExposure)} subValue={`${formatNumber(returnSummary.AVG_CONFIDENCE ? returnSummary.AVG_CONFIDENCE * 100 : 0)}% avg confidence`} color="#A36472" />
        <StatCard iconClass="oj-fwk-icon-message-warning" label="Demand Signal Spikes" value={formatNumber(s.VIRAL_POSTS)} subValue={`${formatNumber(s.RISING_POSTS)} rising`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-sortrelevancehigh" label="Demand Signals" value={formatNumber(s.TRENDING_PRODUCTS)} subValue={`${formatNumber(s.POSTS_TOTAL)} total posts`} color="#AA643B" />
        <StatCard iconClass="oj-fwk-icon-users" label="AI Agent Actions" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(s.SHIPMENTS_IN_TRANSIT)} shipments in transit`} color="#796087" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer Signal Velocity Chart */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity size={15} className="text-[var(--color-accent)]" />
              Customer Signal Velocity
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
          <p className="text-sm text-[var(--color-text-dim)] mb-4">
            Measures the rate and intensity of customer activity across social posts, product mentions, reviews, and retail demand signals.
          </p>
          {!loadingVelocity && (!velocity || velocity.length === 0) ? (
            <div className="flex items-center justify-center" style={{ height: 240 }}>
              <div className="text-center space-y-2">
                <Activity size={28} className="mx-auto text-[var(--color-text-dim)] opacity-40" />
                <p className="text-sm text-[var(--color-text-dim)]">No posts during this time period</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Try selecting a wider range</p>
              </div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={velocity || []}>
              <defs>
                <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
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
              <Area type="monotone" dataKey="TOTAL_LIKES" stroke="#AA643B" fill="url(#gradLikes)" strokeWidth={2} name="Likes" />
              <Area type="monotone" dataKey="VIRAL_COUNT" stroke="#C74634" fill="url(#gradViral)" strokeWidth={2} name="Signal Spikes" />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by Category */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <DollarSign size={15} className="tone-pine" />
            Revenue by Category
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

      {/* Trending Products Table */}
      <div className="glass-card p-5">
        {/* Table Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <Flame size={15} className="tone-sienna" />
            Trending Products
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
              - Demand Momentum (7 day)
            </span>
          </h3>

          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search sporting goods products, brands, or service signals..."
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
          <p className="text-sm text-[var(--color-text-dim)]">Loading trending products...</p>
        ) : (
          <TrendingTable
            products={trending}
            onSelect={(id) => setSelectedProductId(id === selectedProductId ? null : id)}
            selectedId={selectedProductId}
          />
        )}

        {!loadingTrending && trending?.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No products match your search.</p>
        )}

        <p className="text-[10px] text-[var(--color-text-dim)] mt-3">
          Click any row to view inventory, return, order, and customer signal details for the product.
        </p>
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
