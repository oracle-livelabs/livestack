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

function StatCard({ icon: Icon, label, value, subValue, color = 'var(--color-accent)', trend }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg" style={{ background: `${color}22` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{label}</p>
      </div>
      {subValue && <p className="text-[11px] text-[var(--color-text-dim)] mt-1">{subValue}</p>}
    </div>
  );
}

/* ─── Product Detail Modal ─────────────────────────────────────────────── */
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
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
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
            <p className="text-sm text-red-400">{error || 'Failed to load product'}</p>
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
                background: 'rgba(27,132,237,0.15)', border: '1px solid rgba(27,132,237,0.4)', color: '#1B84ED'
              } : {
                background: 'transparent', border: '1px solid transparent', color: 'var(--color-text-dim)'
              }}>
              <Package size={12} /> Details
            </button>
            <button onClick={() => setTab('json')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={tab === 'json' ? {
                background: 'rgba(212,118,10,0.15)', border: '1px solid rgba(212,118,10,0.4)', color: '#D4760A'
              } : {
                background: 'transparent', border: '1px solid transparent', color: 'var(--color-text-dim)'
              }}>
              <Activity size={12} /> JSON Duality View
            </button>
            <span className="text-[10px] text-[var(--color-text-dim)] ml-2 hidden sm:inline">
              Same data — two interfaces
            </span>
          </div>
        )}

        {!loading && product && tab === 'details' && (
          <div className="p-5 space-y-5">
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
                <p className="text-lg font-bold text-green-400">{formatNumber(totalOnHand)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Total On Hand</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
                <p className="text-lg font-bold text-yellow-400">{formatNumber(totalReserved)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Reserved</p>
              </div>
              <div className="glass-card p-3 text-center" style={{ background: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.2)' }}>
                <p className="text-lg font-bold text-blue-400">{formatNumber(mentions.length)}</p>
                <p className="text-[10px] text-[var(--color-text-dim)]">Social Mentions</p>
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
                                  background: inv.CENTER_TYPE === 'distribution' ? 'rgba(59,130,246,0.15)' :
                                              inv.CENTER_TYPE === 'warehouse' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                                  color: inv.CENTER_TYPE === 'distribution' ? '#60a5fa' :
                                         inv.CENTER_TYPE === 'warehouse' ? '#4ade80' : '#fbbf24',
                                }}>
                                {inv.CENTER_TYPE}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right">{formatNumber(inv.QUANTITY_ON_HAND)}</td>
                            <td className="py-2 px-2 text-right text-yellow-400">{formatNumber(inv.QUANTITY_RESERVED)}</td>
                            <td className={`py-2 px-2 text-right font-medium ${isLow ? 'text-red-400' : 'text-green-400'}`}>
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

            {/* Social Mentions */}
            {mentions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Recent Social Mentions
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
                        <span className="text-[9px] text-purple-400 mt-1 inline-block">{m.MENTION_TYPE}</span>
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
                <RefreshCw size={14} className="animate-spin" /> Querying duality view…
              </div>
            ) : duality?.document ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#D4760A]/10 text-[#D4760A] border border-[#D4760A]/30 font-mono">
                    {duality.source}
                  </span>
                  <button onClick={copyJson}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[var(--color-border)] hover:border-[#D4760A]/50 text-[var(--color-text-dim)] hover:text-[#D4760A] transition-colors">
                    {copied ? <span className="text-green-400">✓ Copied</span> : 'Copy JSON'}
                  </button>
                </div>

                <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'rgba(212,118,10,0.06)', border: '1px dashed rgba(212,118,10,0.3)' }}>
                  <span className="text-[#D4760A] font-semibold">Product + Inventory as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> — The same product and inventory data from the Details tab, exposed as a single nested JSON document.
                  The duality view joins <span className="text-[#1B84ED] font-mono">products</span> and <span className="text-[#1B84ED] font-mono">inventory</span> tables
                  into one document with nested inventory array.</span>
                </div>

                <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,118,10,0.25)' }}>
                  <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: 'rgba(212,118,10,0.08)', borderBottom: '1px solid rgba(212,118,10,0.2)' }}>
                    <span className="text-[10px] font-semibold text-[#D4760A] uppercase tracking-wider">JSON Document</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {duality.document.inventory?.length || 0} inventory locations
                    </span>
                  </div>
                  <pre className="p-3 text-[11px] font-mono text-[#E8A24E] overflow-x-auto leading-relaxed max-h-[350px] overflow-y-auto whitespace-pre">
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

const CHART_COLORS = ['#C74634', '#1AADA8', '#D4760A', '#2D9F5E', '#D4549A', '#1B84ED', '#7B48A5', '#E87B1A'];

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
  const { data: summary, loading: loadingSummary, refetch: refetchSummary } = useData(() => api.dashboard.summary());
  const [velocityHours, setVelocityHours] = useState(168); // default 7d — wide enough to always show data
  const { data: velocity, loading: loadingVelocity } = useData(() => api.dashboard.velocity(velocityHours), [velocityHours]);
  const { data: revenue } = useData(() => api.dashboard.revenueByCategory());
  const { data: imSegments } = useData(() => api.dashboard.inmemory());

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

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Dashboard">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This dashboard issues a single <span className="text-cyan-400 font-mono">SELECT</span> against five different Oracle workload engines simultaneously —
              relational aggregations, JSON collections, spatial data, property graph edges, and AI agent audit logs — all from one converged database.
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
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Converged Architecture</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="JSON Docs" sub="social_posts event_stream" color="#D4760A" />
              <DiagramBox label="Oracle AI Database 26ai" sub="One Engine" color="#c74634" />
              <DiagramBox label="Spatial" sub="SDO_GEOMETRY" color="#2D9F5E" />
              <DiagramBox label="Relational" sub="orders customers" color="#1B84ED" />
              <DiagramBox label="Select AI" sub="Agents & LLMs" color="#7B48A5" />
              <DiagramBox label="Graph" sub="PGQL / APEX" color="#1AADA8" />
              <DiagramBox label="Vector" sub="VECTOR_EMBEDDING" color="#D4549A" wide />
              <DiagramBox label="In-Memory" sub="Column Store" color="#E87B1A" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">All workloads. One transaction. One connection pool.</p>
              <p className="text-[9px] font-mono text-orange-400 mt-0.5">No Kafka · No Spark · No Sync Jobs</p>
            </div>
          </div>

          {/* Live In-Memory Column Store Stats */}
          {imSegments?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database size={12} className="text-yellow-400" />
                <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">In-Memory Column Store — Live</p>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(232,123,26,0.3)' }}>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr style={{ background: 'rgba(232,123,26,0.12)' }}>
                      <th className="text-left px-2 py-1.5 text-yellow-400 font-semibold">Table</th>
                      <th className="text-right px-2 py-1.5 text-yellow-400 font-semibold">Rows</th>
                      <th className="text-right px-2 py-1.5 text-yellow-400 font-semibold">Disk</th>
                      <th className="text-right px-2 py-1.5 text-yellow-400 font-semibold">IM Size</th>
                      <th className="text-right px-2 py-1.5 text-yellow-400 font-semibold">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imSegments.map((seg, i) => (
                      <tr key={seg.TABLE_NAME} style={{ background: i % 2 === 0 ? 'rgba(232,123,26,0.04)' : 'transparent' }}>
                        <td className="px-2 py-1 font-mono text-[var(--color-text)]">{seg.TABLE_NAME}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{Number(seg.ROW_COUNT || 0).toLocaleString()}</td>
                        <td className="px-2 py-1 text-right text-[var(--color-text-dim)]">{(seg.DISK_BYTES / 1048576).toFixed(1)} MB</td>
                        <td className="px-2 py-1 text-right text-cyan-400 font-medium">{(seg.IM_BYTES / 1048576).toFixed(1)} MB</td>
                        <td className="px-2 py-1 text-right font-medium" style={{ color: seg.COMPRESSION_PCT > 50 ? '#34d399' : '#fbbf24' }}>
                          {seg.COMPRESSION_PCT}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: 'rgba(232,123,26,0.08)', borderTop: '1px solid rgba(232,123,26,0.2)' }}>
                  <span className="text-[9px] text-[var(--color-text-dim)]">
                    Compression: <span className="text-yellow-400 font-mono">{imSegments[0]?.COMPRESSION || 'FOR QUERY HIGH'}</span>
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: '#34d399' }}>
                    {imSegments.every(s => s.STATUS === 'COMPLETED') ? '● POPULATED' : '○ POPULATING'}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-1.5 leading-relaxed">
                Oracle In-Memory Column Store keeps hot tables in a compressed columnar format for analytical scans —
                no ETL to a separate analytics database. Queries against these tables automatically use IMCS when beneficial.
              </p>
            </div>
          )}
        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Real-time social commerce intelligence powered by Oracle 26ai Converged Database
          </p>
        </div>
        <button onClick={refetchSummary} className="btn-ghost flex items-center gap-1.5">
          <RefreshCw size={14} className={loadingSummary ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={ShoppingCart} label="Total Orders" value={formatNumber(s.ORDERS_TOTAL)} subValue={`${formatNumber(s.ORDERS_30D)} last 30d`} color="#1B84ED" />
        <StatCard icon={DollarSign} label="Total Revenue" value={formatCurrency(s.REVENUE_TOTAL)} subValue={`${formatCurrency(s.REVENUE_30D)} last 30d`} color="#2D9F5E" />
        <StatCard icon={Flame} label="Viral Posts" value={formatNumber(s.VIRAL_POSTS)} subValue={`${formatNumber(s.RISING_POSTS)} rising`} color="#C74634" />
        <StatCard icon={TrendingUp} label="Trending Products" value={formatNumber(s.TRENDING_PRODUCTS)} subValue={`${formatNumber(s.POSTS_TOTAL)} total posts`} color="#D4760A" />
        <StatCard icon={Bot} label="Agent Actions" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(s.SHIPMENTS_IN_TRANSIT)} in transit`} color="#7B48A5" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Social Velocity Chart */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity size={15} className="text-[var(--color-accent)]" />
              Social Velocity
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
                    color: '#E87B1A'
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
                <p className="text-sm text-[var(--color-text-dim)]">No posts during this time period</p>
                <p className="text-[10px] text-[var(--color-text-dim)] opacity-60">Try selecting a wider range</p>
              </div>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={velocity || []}>
              <defs>
                <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D4760A" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#D4760A" stopOpacity={0} />
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
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: '#F5F4F2' }}
                itemStyle={{ color: '#F5F4F2' }}
                labelFormatter={v => {
                  if (!v) return '';
                  if (v.length > 10) return v; // full datetime
                  return v; // date only
                }}
              />
              <Area type="monotone" dataKey="TOTAL_LIKES" stroke="#D4760A" fill="url(#gradLikes)" strokeWidth={2} name="Likes" />
              <Area type="monotone" dataKey="VIRAL_COUNT" stroke="#C74634" fill="url(#gradViral)" strokeWidth={2} name="Viral Posts" />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by Category */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <DollarSign size={15} className="text-green-400" />
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
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: '#F5F4F2' }}
                itemStyle={{ color: '#F5F4F2' }}
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
            <Flame size={15} className="text-orange-400" />
            Trending Products
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
              — Social Momentum (7 day)
            </span>
          </h3>

          {/* Search bar */}
          <div className="relative flex-1 min-w-0">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search products or brands…"
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
                  color: '#E87B1A'
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
                style={{ background: 'rgba(199,70,52,0.25)', border: '1px solid rgba(199,70,52,0.5)', color: '#E87B1A' }}
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
          Click any row to view inventory &amp; social mention details
        </p>
      </div>

      {/* Converged DB Capabilities Bar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider">Converged capabilities in use</span>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Relational', desc: 'Orders & Inventory', color: '#1B84ED' },
              { label: 'JSON', desc: 'Social Payloads', color: '#2D9F5E' },
              { label: 'Graph', desc: 'Influencer Network', color: '#D4760A' },
              { label: 'Vector', desc: 'Semantic Matching', color: '#7B48A5' },
              { label: 'Spatial', desc: 'Fulfillment Routing', color: '#1AADA8' },
              { label: 'Agents', desc: 'AI Orchestration', color: '#C74634' },
              { label: 'Security', desc: 'RBAC + VPD', color: '#D4549A' },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: `${c.color}15`, border: `1px solid ${c.color}30` }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                <span className="text-[10px] font-medium" style={{ color: c.color }}>{c.label}</span>
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
