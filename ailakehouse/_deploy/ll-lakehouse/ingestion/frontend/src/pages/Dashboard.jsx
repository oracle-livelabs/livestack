import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, TrendingUp, Eye, Truck, Bot, DollarSign,
  Activity, Flame, RefreshCw, Search, X, Package, MapPin,
  MessageSquare, ChevronRight, Clock, Image as ImageIcon,
  Upload
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import {
  MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, getMomentumColor } from '../utils/format';
import { convertPngToJpegFile } from '../utils/imageFiles';
import ImportanceModal, { ImportanceButton } from '../components/ImportanceModal';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { IMPORTANCE_CONTENT } from '../content/importanceContent';

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

function getFulfillmentStatusStyle(status) {
  switch (status) {
    case 'constrained':
      return { color: '#C74634', background: 'rgba(199,70,52,0.12)', border: 'rgba(199,70,52,0.35)' };
    case 'limited':
      return { color: '#AA643B', background: 'rgba(170,100,59,0.12)', border: 'rgba(170,100,59,0.35)' };
    case 'watch':
      return { color: '#A36472', background: 'rgba(163,100,114,0.12)', border: 'rgba(163,100,114,0.35)' };
    case 'ready':
      return { color: '#4C825C', background: 'rgba(76,130,92,0.12)', border: 'rgba(76,130,92,0.35)' };
    default:
      return { color: 'var(--color-text-dim)', background: 'var(--color-surface)', border: 'var(--color-border)' };
  }
}

function formatStatus(status) {
  if (!status) return 'Unknown';
  return status.replace('_', ' ');
}

function ProductSiteMapBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 5);
      return;
    }
    map.fitBounds(points.map((point) => [point.lat, point.lon]), { padding: [28, 28], maxZoom: 6 });
  }, [map, points]);

  return null;
}

function ProductSiteMiniMap({ inventory }) {
  const points = (inventory || [])
    .map((site) => {
      const lat = Number(site.LATITUDE);
      const lon = Number(site.LONGITUDE);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const available = Number(site.QUANTITY_ON_HAND || 0) - Number(site.QUANTITY_RESERVED || 0);
      return { ...site, lat, lon, available };
    })
    .filter(Boolean);

  if (!points.length) return null;

  const markerColor = (available) => {
    if (available <= 20) return '#C74634';
    if (available <= 75) return '#AA643B';
    return '#4C825C';
  };

  return (
    <div>
      <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <MapPin size={12} /> Site Location Map
      </h4>
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          scrollWheelZoom={false}
          style={{ height: 180, width: '100%' }}
          className="z-0"
        >
          <ProductSiteMapBounds points={points} />
          <TileLayer
            attribution=""
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          />
          {points.map((site) => {
            const color = markerColor(site.available);
            return (
              <CircleMarker
                key={site.CENTER_ID}
                center={[site.lat, site.lon]}
                radius={6}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.82,
                  weight: 2,
                }}
              >
                <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div className="text-xs">
                    <div className="font-semibold">{site.CENTER_NAME}</div>
                    <div>{site.CITY}, {site.STATE_PROVINCE}</div>
                    <div>{formatNumber(site.available)} net available</div>
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[var(--color-text-dim)]">
        <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#4C825C' }} />Ready</span>
        <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#AA643B' }} />Limited</span>
        <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#C74634' }} />Low</span>
      </div>
    </div>
  );
}

/* ─── Product Detail Modal ────────────────────────────────────────────── */
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
            <div className="flex items-start gap-4 min-w-0">
              <div
                className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                {product.IMAGE_URL ? (
                  <img
                    src={product.IMAGE_URL}
                    alt={product.PRODUCT_NAME}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Package size={24} className="text-[var(--color-text-dim)]" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold">{product.PRODUCT_NAME}</h3>
                  {product.PEAK_MOMENTUM && (
                    <span className={`momentum-badge momentum-${product.PEAK_MOMENTUM}`} title={SIGNAL_INTENSITY_HELP}>
                      {formatSignalIntensity(product.PEAK_MOMENTUM)}
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
            </div>
          ) : (
            <p className="text-sm tone-red">{error || 'Failed to load sporting goods product'}</p>
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
              Same data — two interfaces
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
                <p className="text-[10px] text-[var(--color-text-dim)]">Signal Mentions</p>
              </div>
            </div>

            <ProductSiteMiniMap inventory={inventory} />

            {/* Inventory Breakdown */}
            {inventory.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <MapPin size={12} /> Inventory by Store Fulfillment Site
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-2 px-2">Center</th>
                        <th className="text-left py-2 px-2">Location</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-right py-2 px-2">On Hand</th>
                        <th className="text-right py-2 px-2">Reserved Capacity</th>
                        <th className="text-right py-2 px-2">Net Available</th>
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
                  <MessageSquare size={12} /> Recent Demand and Market Signals
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
              <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No detailed data available for this sporting goods product.</p>
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
                  <span className="text-[#AA643B] font-semibold">Product + Inventory as JSON Document</span>
                  <span className="text-[var(--color-text-dim)]"> — The same sporting goods product and capacity data from the Details tab, exposed as a single nested JSON document.
                  The duality view joins <span className="text-[#437C94] font-mono">products</span> and <span className="text-[#437C94] font-mono">inventory</span> tables
                  into one document with nested inventory array.</span>
                </div>

                <div className="dashboard-duality-json-panel">
                  <div className="dashboard-duality-json-panel__header">
                    <span className="dashboard-duality-json-panel__title">JSON Document</span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                      {duality.document.inventory?.length || 0} service locations
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

/* ─── Watched Products Table ───────────────────────────────────────────── */
function TooltipHeader({ className, label, help }) {
  return (
    <th scope="col" className={`${className} cursor-help`} title={help} aria-label={`${label}. ${help}`}>
      <span className="underline decoration-dotted underline-offset-4">{label}</span>
    </th>
  );
}

function TrendingTable({ products, onSelect, selectedId }) {
  if (!products?.length) return <p className="text-sm text-[var(--color-text-dim)]">No watched product data</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
            <TooltipHeader className="text-left py-2 px-3" label="Product" help={WATCHED_COLUMN_HELP.product} />
            <TooltipHeader className="text-left py-2 px-3" label="Demand Region" help={WATCHED_COLUMN_HELP.demandRegion} />
            <TooltipHeader className="text-left py-2 px-3" label="Nearest Site" help={WATCHED_COLUMN_HELP.nearestSite} />
            <TooltipHeader className="text-right py-2 px-3" label="Inventory" help={WATCHED_COLUMN_HELP.inventory} />
            <TooltipHeader className="text-right py-2 px-3" label="Graph Reach" help={WATCHED_COLUMN_HELP.graphReach} />
            <TooltipHeader className="text-right py-2 px-3" label="Action Score" help={WATCHED_COLUMN_HELP.actionScore} />
            <TooltipHeader className="text-center py-2 px-3" label="Signal Intensity" help={WATCHED_COLUMN_HELP.signalIntensity} />
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
                <td className="py-2.5 px-3">
                  <div className="font-medium">{p.PRODUCT_NAME}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-text-dim)]">
                    <span>{p.BRAND_NAME}</span>
                    <span>{p.CATEGORY}</span>
                    {p.SEMANTIC_SCORE != null && <span className="font-mono tone-teal">AI {Math.round(p.SEMANTIC_SCORE * 100)}%</span>}
                    {p.IMAGE_SIMILARITY != null && <span className="font-mono tone-sienna">Visual {Math.round(p.IMAGE_SIMILARITY * 100)}%</span>}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-medium">{p.HOT_REGION || '—'}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                    {formatNumber(p.PREDICTED_DEMAND)} forecast · {Number(p.SOCIAL_FACTOR || 1).toFixed(2)}x signal
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-medium">{p.NEAREST_CENTER || 'No site'}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                    {p.CENTER_STATE || '—'} · {p.DISTANCE_KM != null ? `${p.DISTANCE_KM} km` : 'distance n/a'} · {p.SERVICE_ZONE || 'standard'}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span
                    className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{
                      color: getFulfillmentStatusStyle(p.FULFILLMENT_STATUS).color,
                      background: getFulfillmentStatusStyle(p.FULFILLMENT_STATUS).background,
                      border: `1px solid ${getFulfillmentStatusStyle(p.FULFILLMENT_STATUS).border}`,
                    }}
                  >
                    {formatStatus(p.FULFILLMENT_STATUS)}
                  </span>
                  <div className="mt-1 text-[10px] text-[var(--color-text-dim)]">
                    {formatNumber(p.AVAILABLE_UNITS)} site · {formatNumber(p.REGIONAL_AVAILABLE_UNITS)} region
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <div className="font-mono font-medium">{formatNumber(p.GRAPH_REACH)}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                    {Number(p.GRAPH_STRENGTH || 0).toFixed(2)} strength
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <div className="font-mono font-medium" style={{ color: getMomentumColor(p.PEAK_MOMENTUM) }}>
                    {p.ACTION_SCORE ?? p.AVG_VIRALITY}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
                    {formatNumber(p.MENTION_COUNT)} mentions
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span
                    className={`momentum-badge momentum-${p.PEAK_MOMENTUM || 'normal'}`}
                    title={SIGNAL_INTENSITY_HELP}
                  >
                    {formatSignalIntensity(p.PEAK_MOMENTUM)}
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
const MOMENTUM_LABELS  = { '': 'All', mega_viral: 'Critical', viral: 'Elevated', rising: 'Rising' };
const SIGNAL_INTENSITY_HELP = 'Peak signal intensity across recent product mentions: CRITICAL = mega viral signal, viral = elevated signal, rising = early growth, normal = no strong acceleration.';
const WATCHED_COLUMN_HELP = {
  product: 'Product being monitored. The smaller text shows brand, category, and semantic match score when AI vector search is active.',
  demandRegion: 'Region where demand is currently strongest. The smaller text shows forecasted demand and the social signal multiplier.',
  nearestSite: 'Best matching fulfillment site for the demand region. The smaller text shows site state, distance to demand region, and service zone.',
  inventory: 'Fulfillment readiness for the product. READY has enough site and regional capacity, WATCH has low-stock risk, LIMITED has site pressure, and CONSTRAINED means demand exceeds available regional capacity.',
  graphReach: 'Signal-source network spread for the product signal. The main value is reachable connected sources, and strength is the average relationship strength.',
  actionScore: 'Priority score for operations. It combines signal intensity, views, signal multiplier, graph strength, and inventory risk; mentions shows how many recent demand signals reference the product.',
  signalIntensity: SIGNAL_INTENSITY_HELP,
};

function formatSignalIntensity(flag) {
  if (flag === 'mega_viral') return 'CRITICAL';
  return flag?.replace('_', ' ') || 'normal';
}

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
  const [showImportance, setShowImportance] = useState(false);
  const [velocityHours, setVelocityHours] = useState(168); // default 7d — wide enough to always show data
  const { data: velocity, loading: loadingVelocity } = useData(() => api.dashboard.velocity(velocityHours), [velocityHours]);
  const { data: revenue } = useData(() => api.dashboard.revenueByCategory());

  // Search / filter state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageSearch, setImageSearch] = useState(null);
  const [imageError, setImageError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const debounceRef = useRef(null);

  const { data: trending, loading: loadingTrending, refetch: refetchTrending } = useData(
    () => api.dashboard.trending(25, search, brand),
    [search, brand]
  );

  useEffect(() => () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  }, [imagePreviewUrl]);

  // Debounce free-text search
  const handleSearchChange = useCallback((val) => {
    setImageSearch(null);
    setImageError('');
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val.trim()), 350);
  }, []);

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const clearImageSearch = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl('');
    setImageSearch(null);
    setImageError('');
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageSearch(null);
    setImageError('');

    if (!file) {
      setImageFile(null);
      setImagePreviewUrl('');
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setImageFile(null);
      setImagePreviewUrl('');
      setImageError('Upload a JPG or PNG competitor image.');
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const runImageSearch = async () => {
    if (!imageFile) return;
    setImageLoading(true);
    setImageError('');
    setImageSearch(null);
    setSelectedProductId(null);
    try {
      const searchableImage = await convertPngToJpegFile(imageFile, 'competitor-image');
      const data = await api.dashboard.watchedImageSearch(searchableImage, 25);
      setSearchInput('');
      setSearch('');
      setBrand('');
      setImageSearch(data);
    } catch (err) {
      setImageError(err.message);
    } finally {
      setImageLoading(false);
    }
  };

  const s = summary || {};
  const watchedProducts = imageSearch?.results || trending;
  const loadingWatchedProducts = loadingTrending || imageLoading;

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Dashboard">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This dashboard issues a single <span className="tone-teal font-mono">SELECT</span> against five different Oracle workload engines simultaneously —
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
          </div>
          <SqlBlock code={`-- One query. Five workloads. Zero ETL.
SELECT
  (SELECT COUNT(*) FROM orders) AS orders_total,
  (SELECT NVL(SUM(order_total), 0) FROM orders) AS revenue_total,
  (SELECT COUNT(*) FROM social_posts WHERE momentum_flag = 'viral') AS critical_signals,
  (SELECT COUNT(*) FROM agent_actions) AS agent_actions,
  (SELECT COUNT(*) FROM shipments WHERE ship_status = 'in_transit') AS shipments_in_transit
FROM dual;`} />
          <div className="rounded-lg p-3" style={{ background: 'rgba(76,130,92,0.08)', border: '1px solid rgba(76,130,92,0.28)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4C825C' }}>Challenge Solved</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              PeakGear needs to know when a product starts trending and whether the right fulfillment sites can support that demand.
              The watched products query connects live signals, regional demand, inventory, service geography, signal-source network reach,
              and semantic product search so operations can see which products are ready, constrained, or need attention now.
            </p>
          </div>
          <SqlBlock code={`-- Watched products: one converged query
WITH semantic AS (
  SELECT
      product_id,
      VECTOR_DISTANCE(embedding, 'wetsuit', COSINE) AS distance
  FROM product_embeddings
),
demand AS (
  SELECT
      product_id,
      region,
      predicted_demand,
      social_factor
  FROM demand_forecasts
),
graph_matches AS (
  SELECT
      brand_id,
      influencer_id
  FROM GRAPH_TABLE (
      influencer_network
      MATCH (i IS INFLUENCER)-[e IS PROMOTES]->(b IS BRAND)
      COLUMNS (
          b.BRAND_ID AS brand_id,
          i.INFLUENCER_ID AS influencer_id
      )
  )
),
graph AS (
  SELECT
      brand_id,
      COUNT(*) AS network_reach
  FROM graph_matches
  GROUP BY brand_id
)
SELECT
    p.product_name,
    d.region,
    fc.center_name,
    SDO_GEOM.SDO_DISTANCE(
        dr.boundary,
        fc.location,
        0.005,
        'unit=KM'
    ) AS distance_km,
    g.network_reach
FROM products p
JOIN demand d
    ON d.product_id = p.product_id
JOIN inventory i
    ON i.product_id = p.product_id
JOIN fulfillment_centers fc
    ON fc.center_id = i.center_id
JOIN demand_regions dr
    ON dr.region_name LIKE d.region || ' %'
LEFT JOIN graph g
    ON g.brand_id = p.brand_id
LEFT JOIN semantic s
    ON s.product_id = p.product_id;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Converged Architecture</p>
            <div className="grid grid-cols-3 gap-1.5">
              <DiagramBox label="JSON Docs" sub="demand signals · event_stream" color="#AA643B" />
              <DiagramBox label="Oracle AI Database 26ai" sub="One Engine" color="#c74634" />
              <DiagramBox label="Spatial" sub="SDO_GEOMETRY" color="#4C825C" />
              <DiagramBox label="Relational" sub="orders customers" color="#437C94" />
              <DiagramBox label="Select AI" sub="Agents & LLMs" color="#796087" />
              <DiagramBox label="Graph" sub="PGQL / APEX" color="#4F7D7B" />
              <DiagramBox label="Vector" sub="VECTOR_EMBEDDING" color="#A36472" wide />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">All workloads. One transaction. One connection pool.</p>
              <p className="text-[9px] font-mono text-[var(--color-text)] mt-0.5">No Kafka · No Spark · No Sync Jobs</p>
            </div>
          </div>

        </div>
      </RegisterOraclePanel>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Command Center</h2>
          <p className="text-sm text-[var(--color-text-dim)] mt-1">
            Real-time PeakGear sporting goods and returns audit intelligence powered by Oracle 26ai Converged Database
          </p>
        </div>
        <ImportanceButton onClick={() => setShowImportance(true)} />
      </div>

      <ImportanceModal
        open={showImportance}
        onClose={() => setShowImportance(false)}
        content={IMPORTANCE_CONTENT.dashboard}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard iconClass="oj-fwk-icon-tree-document" label="Total Transactions" value={formatNumber(s.ORDERS_TOTAL)} subValue={`${formatNumber(s.ORDERS_30D)} last 30d`} color="#437C94" />
        <StatCard iconClass="oj-fwk-icon-view" label="Total Revenue" value={formatCurrency(s.REVENUE_TOTAL)} subValue={`${formatCurrency(s.REVENUE_30D)} last 30d`} color="#4C825C" />
        <StatCard iconClass="oj-fwk-icon-message-warning" label="Critical Demand Signals" value={formatNumber(s.VIRAL_POSTS)} subValue={`${formatNumber(s.RISING_POSTS)} rising`} color="#C74634" />
        <StatCard iconClass="oj-fwk-icon-sortrelevancehigh" label="Watched Products" value={formatNumber(s.TRENDING_PRODUCTS)} subValue={`${formatNumber(s.POSTS_TOTAL)} total demand signals`} color="#AA643B" />
        <StatCard iconClass="oj-fwk-icon-users" label="Agent Actions" value={formatNumber(s.AGENT_ACTIONS_TOTAL)} subValue={`${formatNumber(s.SHIPMENTS_IN_TRANSIT)} active transfers`} color="#796087" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Social engagement chart */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity size={15} className="text-[var(--color-accent)]" />
                Market Demand Activity
                {loadingVelocity && <RefreshCw size={12} className="animate-spin text-[var(--color-text-dim)]" />}
              </h3>
              <p className="max-w-2xl text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                Tracks changes in customer engagement, product interest, and demand activity to identify emerging retail pressure and high-risk products.
              </p>
            </div>
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
                <p className="text-sm text-[var(--color-text-dim)]">No demand signals during this time period</p>
                <p className="text-[10px] text-[var(--color-text)]">Try selecting a wider range</p>
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
              <YAxis yAxisId="likes" tick={{ fontSize: 10 }} tickFormatter={formatNumber} width={44} />
              <YAxis yAxisId="signals" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} width={34} />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12, color: 'var(--color-text)' }}
                itemStyle={{ color: 'var(--color-text)' }}
                formatter={(v, name) => [formatNumber(v), name]}
                labelFormatter={v => {
                  if (!v) return '';
                  if (v.length > 10) return v; // full datetime
                  return v; // date only
                }}
              />
              <Area yAxisId="likes" type="monotone" dataKey="TOTAL_LIKES" stroke="#AA643B" fill="url(#gradLikes)" strokeWidth={2} name="Likes" />
              <Area yAxisId="signals" type="monotone" dataKey="VIRAL_COUNT" stroke="#C74634" fill="url(#gradViral)" strokeWidth={2} name="Critical Demand Signals" />
            </AreaChart>
          </ResponsiveContainer>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-5 text-[var(--color-text-dim)]">
            <span className="flex items-start gap-1.5">
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: '#AA643B' }} />
              Consumer Activity
            </span>
            <span className="flex items-start gap-1.5">
              <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: '#C74634' }} />
              Demand Spike Alerts
            </span>
          </div>
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

      {/* Watched Products Table */}
      <div className="glass-card p-5">
        {/* Table Header */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Flame size={15} className="tone-sienna" />
                Watched Products
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] font-normal hidden sm:inline">
                  — Demand-To-Fulfillment Risk (7 Day)
                </span>
              </h3>
              <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-[var(--color-text-dim)]">
                Use semantic search to find products by demand intent, region, or category, or upload a competitor
                product image to compare visually similar PeakGear products against current demand, inventory, and
                fulfillment readiness.
              </p>
            </div>
            {loadingWatchedProducts && (
              <RefreshCw size={13} className="animate-spin text-[var(--color-text-dim)] flex-shrink-0 mt-1" />
            )}
          </div>

          <div className="flex flex-1 min-w-0 flex-col gap-2">
            {/* Search bar */}
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
              <input
                type="text"
                value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Semantic search: trail running gear in Texas, cycling jersey demand, waterproof packs..."
                className="h-9 w-full text-sm pl-8 pr-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
              {searchInput && (
                <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Competitor image search */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="webshop-image-picker min-w-[12rem] lg:min-w-[13rem]" title="Upload a competitor product image to find similar PeakGear products and compare demand readiness.">
                <input type="file" accept="image/jpeg,image/png" onChange={selectImage} />
                <span style={{ height: '2.25rem', minHeight: '2.25rem' }}>
                  <ImageIcon size={14} aria-hidden="true" />
                  {imageFile ? imageFile.name : 'Competitor image'}
                </span>
              </label>
              {imagePreviewUrl && (
                <div className="webshop-image-preview" style={{ width: '2.25rem', height: '2.25rem' }}>
                  <img src={imagePreviewUrl} alt="Competitor product preview" />
                  <button type="button" className="webshop-icon-button" onClick={clearImageSearch} aria-label="Remove competitor image">
                    <X size={11} />
                  </button>
                </div>
              )}
              <button
                type="button"
                className="btn-primary text-sm"
                style={{ height: '2.25rem', paddingTop: 0, paddingBottom: 0 }}
                onClick={runImageSearch}
                disabled={!imageFile || imageLoading}
              >
                {imageLoading ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                Match Image
              </button>
            </div>
          </div>

          {/* Brand or Partner filter chips (populated from watched-sporting goods product results) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from(new Set((watchedProducts || []).map(p => p.BRAND_NAME))).slice(0, 4).map(b => (
              <button
                key={b}
                onClick={() => { setImageSearch(null); setBrand(brand === b ? '' : b); }}
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
            {brand && !((watchedProducts || []).slice(0, 4).map(p => p.BRAND_NAME).includes(brand)) && (
              <button
                onClick={() => setBrand('')}
                className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                style={{ background: 'rgba(199,70,52,0.25)', border: '1px solid rgba(199,70,52,0.5)', color: 'var(--color-text)' }}
              >
                {brand} <X size={9} />
              </button>
            )}
          </div>
        </div>

        {imageError && (
          <p className="text-[11px] tone-red mb-3">{imageError}</p>
        )}

        {imageSearch && !imageLoading && (
          <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
            {watchedProducts?.length ?? 0} similar PeakGear product{watchedProducts?.length !== 1 ? 's' : ''} matched from competitor image
            {imageSearch.upload?.originalFilename ? <> <em>{imageSearch.upload.originalFilename}</em></> : null}
            {' · '}
            ranked by image similarity, then enriched with demand and fulfillment readiness
            {' · '}
            <button className="underline hover:text-[var(--color-text)]" onClick={clearImageSearch}>Clear image match</button>
          </p>
        )}

        {/* Result count / active filters notice */}
        {(search || brand) && !loadingWatchedProducts && !imageSearch && (
          <p className="text-[11px] text-[var(--color-text-dim)] mb-3">
            {watchedProducts?.length ?? 0} result{watchedProducts?.length !== 1 ? 's' : ''}
            {search ? <> matching <em>"{search}"</em> with {watchedProducts?.[0]?.SEARCH_MODE === 'vector' ? 'AI vector search' : watchedProducts?.[0]?.SEARCH_MODE === 'region' ? 'region filtering' : 'keyword search'}</> : null}
            {watchedProducts?.[0]?.SEARCH_REGION ? <> in <em>{watchedProducts[0].SEARCH_REGION}</em></> : null}
            {brand ? <> in <em>{brand}</em></> : null}
            {' · '}
            <button className="underline hover:text-[var(--color-text)]" onClick={() => { clearSearch(); setBrand(''); }}>Clear all</button>
          </p>
        )}

        {loadingWatchedProducts ? (
          <p className="text-sm text-[var(--color-text-dim)]">Loading watched products...</p>
        ) : (
          <TrendingTable
            products={watchedProducts}
            onSelect={(id) => setSelectedProductId(id === selectedProductId ? null : id)}
            selectedId={selectedProductId}
          />
        )}

        {!loadingWatchedProducts && watchedProducts?.length === 0 && (
          <p className="text-sm text-[var(--color-text-dim)] text-center py-6">No sporting goods products match your search.</p>
        )}

        <p className="text-[10px] text-[var(--color-text-dim)] mt-3">
          Click any row to view capacity and signal details.
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
