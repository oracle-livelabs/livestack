import { useState, useCallback, useEffect } from 'react';
import { ClipboardList, Filter, ChevronRight, ChevronDown, Loader2, Check, MapPin, Package, Truck, Navigation, Shield, Eye, X } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatCurrency, formatDate } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetButton, JetSelectSingle } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';
import { SceneStoryPanel } from '../components/ManufacturingStory';

const ROUTE_PROVIDER_COLORS = {
  'Line Transfer': '#796087',
  'Supplier Transfer': '#AA643B',
  'Plant Shuttle': '#4F7D7B',
  'Expedite Lane': '#C74634',
};

const SHIP_STATUS_STEPS = [
  { key: 'preparing', label: 'Planned', icon: Package },
  { key: 'picked', label: 'Released', icon: Package },
  { key: 'packed', label: 'Staged', icon: Package },
  { key: 'shipped', label: 'Routed', icon: Truck },
  { key: 'in_transit', label: 'In Transit to Site', icon: Truck },
  { key: 'out_for_delivery', label: 'Final Transfer', icon: Navigation },
  { key: 'delivered', label: 'Completed', icon: Check },
];

const WORK_ORDER_DETAIL_TABS = [
  { id: 'relational', label: 'Relational' },
  { id: 'json', label: 'JSON Duality View' },
  { id: 'route', label: 'Work Order Route' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'planned', label: 'Planned' },
  { value: 'released', label: 'Released' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'on_hold', label: 'On Hold' },
];

function routeProviderLabel(provider) {
  const normalized = String(provider || '').toLowerCase();
  if (normalized.includes('fed')) return 'Line Transfer';
  if (normalized.includes('ups')) return 'Supplier Transfer';
  if (normalized.includes('postal')) return 'Plant Shuttle';
  if (normalized.includes('usps')) return 'Plant Shuttle';
  if (normalized.includes('dhl')) return 'Expedite Lane';
  return provider || 'Production Route';
}

function routeProviderColor(provider) {
  return ROUTE_PROVIDER_COLORS[routeProviderLabel(provider)] || '#4C825C';
}

/* ─── Auto-fit map bounds ──────────────────────────────────────────────── */
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 });
    }
  }, [map, bounds]);
  return null;
}

/* ─── Curved polyline (arc) between two points ─────────────────────────── */
function curvedPositions(from, to, numPoints = 30) {
  const points = [];
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  // offset perpendicular to the line for the arc
  const dx = to[1] - from[1];
  const dy = to[0] - from[0];
  const dist = Math.sqrt(dx * dx + dy * dy);
  const offset = dist * 0.15;
  const ctrlLat = midLat + (dx / dist) * offset;
  const ctrlLng = midLng - (dy / dist) * offset;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * ctrlLat + t * t * to[0];
    const lng = (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * ctrlLng + t * t * to[1];
    points.push([lat, lng]);
  }
  return points;
}

const STATUS_COLORS = {
  planned: 'surface-sienna-soft text-[var(--color-text)]',
  released: 'surface-ocean-soft text-[var(--color-text)]',
  in_progress: 'surface-plum-soft text-[var(--color-text)]',
  dispatched: 'surface-teal-soft text-[var(--color-text)]',
  completed: 'surface-pine-soft text-[var(--color-text)]',
  cancelled: 'surface-red-soft text-[var(--color-text)]',
  on_hold: 'surface-bark-soft text-[var(--color-text)]',
};

function routeStatusLabel(value) {
  return String(value || '-').replace(/_/g, ' ');
}

function completionDateLabel(order) {
  if (!order) return { label: 'Completion', value: '-', tone: 'text-[var(--color-text-dim)]' };
  if (order.ACTUAL_COMPLETION_DATE) {
    return { label: 'Actual completion', value: formatDate(order.ACTUAL_COMPLETION_DATE), tone: 'tone-pine' };
  }
  if (order.PROJECTED_COMPLETION_DATE) {
    return { label: 'Projected completion', value: formatDate(order.PROJECTED_COMPLETION_DATE), tone: 'tone-sienna' };
  }
  return { label: 'Completion', value: '-', tone: 'text-[var(--color-text-dim)]' };
}

/* ─── Work Order Duality Panel ─────────────────────────────────────────────── */
function WorkOrderDetailPanel({ workOrderId, onClose }) {
  const [view, setView] = useState('relational'); // 'relational' | 'json' | 'route'
  const { data: detail, loading: loadingDetail } = useData(() => api.workOrders.detail(workOrderId), [workOrderId]);
  const { data: duality, loading: loadingDuality, error: dualityError } = useData(
    () => api.manufacturing.workOrders.document(workOrderId),
    [workOrderId]
  );

  const [copied, setCopied] = useState(false);
  const copyJson = useCallback(() => {
    if (duality?.document) {
      navigator.clipboard.writeText(JSON.stringify(duality.document, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [duality]);

  const order = detail?.workOrder;
  const items = detail?.workOrderLines || [];
  const shipment = detail?.productionRoute;
  const route = detail?.route;
  const routeGeometry = detail?.routeGeometry;
  const [showDrivingRoute, setShowDrivingRoute] = useState(true);

  return (
    <tr id={`work-order-detail-${workOrderId}`}>
      <td colSpan={11} className="p-0">
        <div className="mx-4 mb-3 work-orders-detail-panel">

          {/* Tab bar */}
          <div className="work-orders-detail-tabbar">
            <div className="work-orders-detail-tabset">
              {WORK_ORDER_DETAIL_TABS.map(tab => (
                <JetButton
                  key={tab.id}
                  label={tab.label}
                  chroming={view === tab.id ? 'callToAction' : 'outlined'}
                  className="work-orders-detail-tab"
                  onAction={() => setView(tab.id)}
                />
              ))}
              <span className="text-[10px] text-[var(--color-text-dim)] ml-3 hidden sm:inline">
                Same data - three views
              </span>
            </div>
            <button
              type="button"
              aria-label="Close work order detail"
              title="Close order detail"
              className="inline-flex h-9 w-9 items-center justify-center border border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Relational view */}
          {view === 'relational' && (
            <div className="p-4 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-4 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading order details…
                </div>
              ) : !order ? (
                <p className="text-sm text-[var(--color-text-dim)] text-center py-4">Work order not found</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-xs text-[var(--color-text-dim)]">
                    <span className="text-[10px] px-2 py-0.5 rounded border font-mono" style={{ background: 'rgba(67,124,148,0.1)', borderColor: 'rgba(67,124,148,0.3)', color: 'var(--color-text)' }}>
                      SELECT * FROM manufacturing_work_orders / manufacturing_work_order_lines
                    </span>
                    <span>{items.length} work-order lines</span>
                  </div>

                  {/* Work Order summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(() => {
                      const completion = completionDateLabel(order);
                      return [
                        { label: 'Customer account', value: `${order.FIRST_NAME} ${order.LAST_NAME}` },
                        { label: 'Location', value: `${order.CITY}, ${order.STATE_PROVINCE}` },
                        { label: 'Work order value', value: formatCurrency(order.WORK_ORDER_VALUE), strong: true },
                        { label: 'Routing cost', value: formatCurrency(order.ROUTING_COST), strong: true },
                        { label: 'Created', value: formatDate(order.CREATED_AT) },
                        { label: 'Target completion', value: formatDate(order.TARGET_COMPLETION_DATE), strong: true },
                        { label: completion.label, value: completion.value, tone: completion.tone, strong: true },
                        { label: 'Projected route/status', value: routeStatusLabel(order.PROJECTED_ROUTE_STATUS || shipment?.PRODUCTION_ROUTE_STATUS || shipment?.SHIP_STATUS), tone: 'tone-ocean' },
                        ...(order.PROJECTED_SHIP_DATE ? [{ label: 'Projected dispatch', value: formatDate(order.PROJECTED_SHIP_DATE), tone: 'tone-sienna', strong: true }] : []),
                        ...(order.CANCELLATION_REASON ? [{ label: 'Cancellation reason', value: order.CANCELLATION_REASON, tone: 'tone-red', strong: true }] : []),
                      ];
                    })().map(s => (
                      <div key={s.label} className="rounded-lg p-2" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                        <p className="text-[10px] text-[var(--color-text-dim)] uppercase">{s.label}</p>
                        <p className={`text-sm ${s.strong ? 'font-bold' : 'font-medium'} ${s.tone || ''} capitalize`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Items table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-1.5 px-2">Work-order line</th>
                        <th className="text-left py-1.5 px-2">Manufactured Part</th>
                        <th className="text-left py-1.5 px-2">Product Line</th>
                        <th className="text-left py-1.5 px-2">Category</th>
                        <th className="text-right py-1.5 px-2">Qty</th>
                        <th className="text-right py-1.5 px-2">Planned unit value</th>
                        <th className="text-right py-1.5 px-2">Line value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.WORK_ORDER_LINE_ID} className="border-b border-[var(--color-border)]/20">
                          <td className="py-1.5 px-2 font-mono">{item.WORK_ORDER_LINE_ID}</td>
                          <td className="py-1.5 px-2 font-medium">{item.PRODUCT_NAME}</td>
                          <td className="py-1.5 px-2 text-[var(--color-text-dim)]">{item.BRAND_NAME}</td>
                          <td className="py-1.5 px-2 text-[var(--color-text-dim)]">{item.CATEGORY}</td>
                          <td className="py-1.5 px-2 text-right">{item.REQUESTED_UNITS}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(item.PLANNED_UNIT_VALUE)}</td>
                          <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(item.LINE_VALUE)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* JSON Duality View */}
          {view === 'json' && (
            <div className="p-4 space-y-3">
              {loadingDuality ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-4 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Querying MANUFACTURING_WORK_ORDER_DOCUMENTS_DV…
                </div>
              ) : dualityError ? (
                <p className="text-sm tone-red text-center py-4">{dualityError}</p>
              ) : duality?.document ? (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded border font-mono" style={{ background: 'rgba(170,100,59,0.1)', borderColor: 'rgba(170,100,59,0.3)', color: 'var(--color-text)' }}>
                        SELECT DATA FROM manufacturing_work_order_documents_dv
                      </span>
                      <span className="text-[10px] text-[var(--color-text-dim)]">
                        Source: <span className="text-[var(--color-text)] font-mono">{duality.sourceObject}</span>
                      </span>
                      <span className="text-[10px] text-[var(--color-text-dim)]">
                        {duality.executionMode === 'duality-view' ? 'Oracle duality view' : duality.executionMode}
                        {duality.readOnly ? ' · read-only' : ''}
                      </span>
                    </div>
                    <JetButton
                      label={copied ? 'Copied' : 'Copy'}
                      chroming="outlined"
                      onAction={copyJson}
                    />
                  </div>

                  {/* Info callout */}
                  <div className="rounded-lg p-3 text-xs leading-relaxed" style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)' }}>
                    <span className="text-[var(--color-text)] font-semibold">JSON Relational Duality View</span>
                    <span className="text-[var(--color-text-dim)]"> - This is the same governed work-order data from the relational tab, read directly through
                    Oracle's <span className="text-[var(--color-text)] font-mono">MANUFACTURING_WORK_ORDER_DOCUMENTS_DV</span>. The read-only aggregate contains governed customer-account and plant references plus keyed work-order lines and manufactured-part references without ETL or duplicated state.</span>
                  </div>

                  {/* JSON document */}
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface-muted)', border: '1px solid rgba(170,100,59,0.25)' }}>
                    <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: 'rgba(170,100,59,0.08)', borderBottom: '1px solid rgba(170,100,59,0.2)' }}>
                      <span className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider">JSON Document</span>
                      <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                        {duality.document.workOrderLines?.length || 0} work-order lines
                      </span>
                    </div>
                    <pre className="p-3 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto leading-relaxed max-h-[400px] overflow-y-auto whitespace-pre">
{JSON.stringify(duality.document, null, 2)}
                    </pre>
                  </div>

                  {/* SQL used */}
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                    <div className="px-3 py-1.5" style={{ background: 'rgba(67,124,148,0.06)', borderBottom: '1px solid var(--color-border)' }}>
                      <span className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider">SQL Executed</span>
                    </div>
                    <pre className="p-3 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto whitespace-pre">{duality.sql}</pre>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-dim)] text-center py-4">No duality data available</p>
              )}
            </div>
          )}

          {/* Work Order Route Map */}
          {view === 'route' && (
            <div className="p-4 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-4 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading production route data…
                </div>
              ) : !order ? (
                <p className="text-sm text-[var(--color-text-dim)] text-center py-4">Work order not found</p>
              ) : !order.CENTER_LAT || !order.CUST_LAT ? (
                <div className="text-center py-8">
                  <MapPin size={24} className="mx-auto mb-2 text-[var(--color-text-dim)] opacity-40" />
                  <p className="text-sm text-[var(--color-text-dim)]">No actual route geometry is available yet.</p>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-left">
                    {[
                      { label: 'Projected dispatch', value: formatDate(order.PROJECTED_SHIP_DATE), color: '#AA643B' },
                      { label: 'Projected delivery', value: formatDate(order.PROJECTED_COMPLETION_DATE), color: '#437C94' },
                      { label: 'Projected route/status', value: routeStatusLabel(order.PROJECTED_ROUTE_STATUS), color: '#4C825C' },
                    ].map(card => (
                      <div key={card.label} className="rounded-lg p-2" style={{ background: `${card.color}08`, border: `1px solid ${card.color}25` }}>
                        <p className="text-[10px] text-[var(--color-text-dim)] uppercase">{card.label}</p>
                        <p className="text-sm font-bold capitalize" style={{ color: card.color }}>{card.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (() => {
                const from = [order.CENTER_LAT, order.CENTER_LON];
                const to = [order.CUST_LAT, order.CUST_LON];
                const arc = curvedPositions(from, to);
                const routeProvider = shipment?.ROUTE_PROVIDER || shipment?.CARRIER;
                const routeColor = routeProviderColor(routeProvider);
                const routeReference = shipment?.ROUTE_REFERENCE || shipment?.TRACKING_NUMBER;
                const routeStatus = shipment?.PRODUCTION_ROUTE_STATUS || shipment?.SHIP_STATUS || order.WORK_ORDER_STATUS_CODE || 'preparing';
                const currentStep = routeStatus;
                const stepIndex = SHIP_STATUS_STEPS.findIndex(s => s.key === currentStep);

                // Distance priority: SDO_GCDR.ELOC_ROUTE (driving) > SDO_GEOM.SDO_DISTANCE (great-circle) > production route data > Haversine fallback
                const routeDistMiles = route?.distance != null ? Math.round(route.distance * 100) / 100 : null;
                const routeTimeHours = route?.time != null ? Math.round(route.time / 60 * 10) / 10 : null;
                let distanceMiles = null;
                let distanceSource = 'Distance unavailable';
                if (routeDistMiles != null) {
                  distanceMiles = routeDistMiles;
                  distanceSource = 'SDO_GCDR.ELOC_ROUTE';
                } else if (order.SPATIAL_DISTANCE_MILES != null) {
                  distanceMiles = order.SPATIAL_DISTANCE_MILES;
                  distanceSource = 'SDO_GEOM.SDO_DISTANCE';
                } else if (shipment?.DISTANCE_MILES != null) {
                  distanceMiles = shipment.DISTANCE_MILES;
                  distanceSource = 'Stored route distance';
                } else if ([...from, ...to].every((value) => Number.isFinite(Number(value)))) {
                  const R = 3958.8; // Earth radius in miles
                  const dLat = (to[0] - from[0]) * Math.PI / 180;
                  const dLon = (to[1] - from[1]) * Math.PI / 180;
                  const a = Math.sin(dLat/2)**2 + Math.cos(from[0]*Math.PI/180) * Math.cos(to[0]*Math.PI/180) * Math.sin(dLon/2)**2;
                  distanceMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  distanceSource = 'Browser Haversine fallback';
                }
                const estHours = routeTimeHours || (distanceMiles ? Math.round(distanceMiles / 55 * 10) / 10 : null);

                return (
                  <>
                    {/* Status badge row */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[10px] px-2 py-0.5 rounded border font-mono" style={{ background: 'rgba(76,130,92,0.1)', borderColor: 'rgba(76,130,92,0.3)', color: 'var(--color-text)' }}>
                        {routeGeometry ? 'SDO_GCDR.ELOC_ROUTE_GEOM' : distanceSource}
                      </span>
                      {routeGeometry && (
                        <JetButton
                          label={showDrivingRoute ? 'Routed path' : 'Direct arc'}
                          iconClass="oj-fwk-icon-arrowtail-e"
                          chroming={showDrivingRoute ? 'callToAction' : 'outlined'}
                          onAction={() => setShowDrivingRoute(prev => !prev)}
                        />
                      )}
                      {shipment && (
                        <span className="flex items-center gap-1 text-[var(--color-text-dim)]">
                          <Truck size={11} style={{ color: routeColor }} />
                          <span style={{ color: routeColor }} className="font-semibold">{routeProviderLabel(routeProvider)}</span>
                          {routeReference && (
                            <span className="font-mono opacity-60">#{routeReference}</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Map */}
                    <div className="work-orders-route-map">
                      <MapContainer
                        center={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]}
                        zoom={5}
                        style={{ height: '100%', width: '100%', background: 'var(--color-surface-muted)' }}
                        zoomControl={false}
                        attributionControl={false}
                      >
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
                        <FitBounds bounds={routeGeometry && showDrivingRoute ? routeGeometry : [from, to]} />

                        {/* Driving route (solid) - actual road path from SDO_GCDR.ELOC_ROUTE_GEOM */}
                        {routeGeometry && showDrivingRoute && (
                          <Polyline positions={routeGeometry} color={routeColor} weight={4} opacity={0.9} />
                        )}

                        {/* Bezier arc (dashed) - dimmed when driving route is shown */}
                        <Polyline
                          positions={arc}
                          color={routeGeometry && showDrivingRoute ? '#ffffff' : routeColor}
                          weight={routeGeometry && showDrivingRoute ? 1.5 : 3}
                          opacity={routeGeometry && showDrivingRoute ? 0.25 : 0.85}
                          dashArray="8 6"
                        />

                        {/* Plant center marker */}
                        <CircleMarker center={from} radius={8} fillColor="#437C94" fillOpacity={0.9} color="#fff" weight={2}>
                          <Tooltip permanent direction="top" offset={[0, -10]}
                            className="route-map-tooltip">
                            <div className="route-map-tooltip__content">
                              <span className="route-map-tooltip__label">Plant</span>
                              <span>{order.CENTER_NAME || 'Plant'}</span>
                            </div>
                          </Tooltip>
                        </CircleMarker>

                        {/* Customer marker */}
                        <CircleMarker center={to} radius={8} fillColor="#4C825C" fillOpacity={0.9} color="#fff" weight={2}>
                          <Tooltip permanent direction="top" offset={[0, -10]}
                            className="route-map-tooltip">
                            <div className="route-map-tooltip__content">
                              <span className="route-map-tooltip__label">Customer account</span>
                              <span>{order.FIRST_NAME} {order.LAST_NAME} - {order.CITY}, {order.STATE_PROVINCE}</span>
                            </div>
                          </Tooltip>
                        </CircleMarker>
                      </MapContainer>
                    </div>

                    {/* Work Order info cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Distance', value: distanceMiles ? `${Math.round(distanceMiles).toLocaleString()} mi` : '-', color: '#4C825C' },
                        { label: 'Est. transfer', value: estHours ? `${estHours} hrs` : '-', color: '#AA643B' },
                        { label: 'Route cost', value: (shipment?.ROUTE_COST ?? shipment?.SHIP_COST) ? formatCurrency(shipment?.ROUTE_COST ?? shipment?.SHIP_COST) : '-', color: '#437C94' },
                        { label: 'Route status', value: routeStatus.replace(/_/g, ' '), color: routeColor },
                      ].map(c => (
                        <div key={c.label} className="rounded-lg p-2" style={{ background: `${c.color}08`, border: `1px solid ${c.color}25` }}>
                          <p className="text-[10px] text-[var(--color-text-dim)] uppercase">{c.label}</p>
                          <p className="text-sm font-bold capitalize" style={{ color: c.color }}>{c.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Status timeline */}
                    {shipment && (
                      <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                        <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Work Order Progress</p>
                        <div className="flex items-center gap-0">
                          {SHIP_STATUS_STEPS.map((step, i) => {
                            const StepIcon = step.icon;
                            const isComplete = i <= stepIndex;
                            const isCurrent = i === stepIndex;
                            return (
                              <div key={step.key} className="flex items-center" style={{ flex: i < SHIP_STATUS_STEPS.length - 1 ? 1 : 'none' }}>
                                <div className="flex flex-col items-center" style={{ minWidth: 28 }}>
                                  <div className="w-6 h-6 rounded flex items-center justify-center transition-all"
                                    style={{
                                      background: isComplete ? `${routeColor}20` : 'var(--color-surface)',
                                      border: `2px solid ${isComplete ? routeColor : 'rgba(49,45,42,0.12)'}`,
                                      boxShadow: isCurrent ? `0 0 0 3px ${routeColor}24` : 'none',
                                    }}>
                                    <StepIcon size={10} style={{ color: isComplete ? routeColor : 'var(--color-text-dim)' }} />
                                  </div>
                                  <span className="text-[8px] mt-1 text-center leading-tight"
                                    style={{ color: isComplete ? routeColor : 'var(--color-text-dim)', fontWeight: isCurrent ? 700 : 400, maxWidth: 50 }}>
                                    {step.label}
                                  </span>
                                </div>
                                {i < SHIP_STATUS_STEPS.length - 1 && (
                                  <div className="flex-1 h-0.5 mx-0.5 rounded" style={{
                                    background: i < stepIndex ? routeColor : 'rgba(49,45,42,0.12)',
                                  }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Oracle spatial SQL */}
                    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                      <div className="px-3 py-1.5" style={{ background: 'rgba(76,130,92,0.06)', borderBottom: '1px solid var(--color-border)' }}>
                      <span className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider">Oracle Spatial - {routeGeometry ? 'SDO_GCDR Geocoder Routing' : 'SDO_GEOMETRY'}</span>
                    </div>
                      <pre className="p-3 text-[11px] font-mono text-[var(--color-text)] overflow-x-auto whitespace-pre leading-relaxed">{routeGeometry ? `-- Driving route geometry (Oracle Spatial Geocoder)
SELECT SDO_UTIL.TO_GEOJSON(
         SDO_GCDR.ELOC_ROUTE_GEOM(
           ${order.CENTER_LON}, ${order.CENTER_LAT},
           ${order.CUST_LON}, ${order.CUST_LAT},
           'vehicle=car'))
FROM   dual;
-- Result: LineString with ${routeGeometry.length} coordinate pairs

-- SDO_GCDR.ELOC_ROUTE for distance/time metrics
-- SDO_GCDR.ELOC_ROUTE_GEOM for actual road geometry
-- SDO_GCDR.ELOC_DRIVE_TIME_POLYGON for production route recovery windows` : `-- Distance between plant capacity center and customer account
SELECT ROUND(SDO_GEOM.SDO_DISTANCE(
         fc.location,              -- SDO_GEOMETRY point
         c.location,               -- SDO_GEOMETRY point
         0.05, 'unit=MILE'), 1)    AS distance_miles
FROM   fulfillment_centers fc, customers c
WHERE  fc.center_id = ${order.ASSIGNED_PLANT_ID || ':center_id'}
AND    c.customer_id = ${order.CUSTOMER_ACCOUNT_ID || ':customer_account_id'};
-- Result: ${distanceMiles ? Math.round(distanceMiles).toLocaleString() + ' miles' : 'N/A'}

-- Coordinates stored as SDO_GEOMETRY(2001, 4326, ...)
-- Spatial R-tree index enables sub-ms proximity queries`}</pre>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function WorkOrders() {
  const { currentUser, ROLE_META } = useUser();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  // VPD-aware: refetch when user switches
  const userKey = currentUser?.USERNAME;
  const { data: workOrders, loading } = useData(
    () => api.workOrders.list({ status, page, limit: 20 }),
    [status, page, userKey]
  );

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="space-y-6 fade-in">

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Work Orders">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
              JSON Relational Duality Views - Oracle 23ai+
            </p>
            <p className="text-sm text-[var(--color-text)] leading-relaxed">
              Work Orders are stored in a classic <span className="tone-ocean font-mono">relational schema</span> - ACID transactions, foreign keys, referential integrity.
              But Oracle's <span className="font-mono text-[var(--color-text)]">JSON Duality Views</span> let the <em>exact same data</em> be read as manufacturing JSON documents,
              without ETL or duplication. Click any order row and toggle between{' '}
              <span className="font-semibold text-[var(--color-text)]">Relational</span> and <span className="font-semibold text-[var(--color-text)]">JSON Duality</span> to see
              the same data rendered two ways - <em>same transaction, zero sync lag</em>. Writes remain on the governed relational workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="JSON Relational Duality Views" color="orange" />
            <FeatureBadge label="CREATE JSON RELATIONAL DUALITY VIEW" color="yellow" />
            <FeatureBadge label="Read-only document views" color="green" />
            <FeatureBadge label="Nested JSON Projection" color="cyan" />
            <FeatureBadge label="Same ACID Transaction" color="blue" />
            <FeatureBadge label="Zero ETL / Zero Sync" color="purple" />
          </div>

          {/* Manufacturing work-order duality evidence */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
              MANUFACTURING_WORK_ORDER_DOCUMENTS_DV - Runtime Evidence
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mb-2 leading-relaxed">
              The canonical API executes this query against the deployed read-only view; Oracle's catalog reports the object's validity and read-only status.
            </p>
            <SqlBlock code={`-- Exact query executed by the canonical document API
SELECT JSON_SERIALIZE(DATA RETURNING CLOB) AS doc
FROM   manufacturing_work_order_documents_dv
WHERE  JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id;

-- Deployment verification: expect VALID and TRUE
SELECT view_name, status, read_only
FROM   user_json_duality_views
WHERE  view_name = 'MANUFACTURING_WORK_ORDER_DOCUMENTS_DV';`} />
          </div>

          {/* Manufactured-part capacity duality evidence */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
              MANUFACTURED_PART_CAPACITY_DV - Runtime Evidence
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mb-2 leading-relaxed">
              The same direct runtime pattern returns a manufactured part with its product line and keyed plant-capacity records from one read-only domain document.
            </p>
            <SqlBlock code={`-- Exact query executed by the canonical document API
SELECT JSON_SERIALIZE(DATA RETURNING CLOB) AS doc
FROM   manufactured_part_capacity_dv
WHERE  JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id;

-- Deployment verification: expect VALID and TRUE
SELECT view_name, status, read_only
FROM   user_json_duality_views
WHERE  view_name = 'MANUFACTURED_PART_CAPACITY_DV';`} />
          </div>

          {/* Query example */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
              How to Query a Duality View
            </p>
            <SqlBlock code={`-- Relational: traditional row-by-row access
SELECT o.work_order_id,
       TRIM(c.first_name || ' ' || c.last_name) AS account_name,
       o.work_order_value,
       oi.manufactured_part_id, oi.requested_units, oi.planned_unit_value
FROM   manufacturing_work_orders o
JOIN   customers c    ON c.customer_id = o.customer_account_id
JOIN   manufacturing_work_order_lines oi ON oi.work_order_id   = o.work_order_id
WHERE  o.work_order_id = :id;

-- Duality: same data as a single JSON document
SELECT DATA FROM manufacturing_work_order_documents_dv
WHERE  JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id;
-- Returns: {"_id":1, "workOrderStatusCode":"in_progress", "workOrderLines":[...]}`} />
          </div>

          {/* Visual diagram */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Normalized Rows, Domain Document</p>
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
              <div className="text-center text-[10px] text-[var(--color-text)] mb-2">Same underlying data - relational and read-only document access</div>
              <div className="flex gap-2">
                <div className="flex-1 rounded p-2 text-[9px] text-center" style={{ background: '#437C9415', border: '1px solid #437C9440', color: 'var(--color-text)' }}>
                  <div className="font-bold mb-1">SQL View</div>
                  <div>SELECT *</div>
                  <div>FROM manufacturing_work_orders</div>
                  <div className="text-[8px] mt-1 text-[var(--color-text)]">row-by-row</div>
                </div>
                <div className="flex flex-col justify-center tone-sienna text-lg">→</div>
                <div className="flex-1 rounded p-2 text-[9px] text-center" style={{ background: '#AA643B15', border: '1px solid #AA643B40', color: 'var(--color-text)' }}>
                  <div className="font-bold mb-1">JSON Duality</div>
                  <div>{'{"_id":1,'}</div>
                  <div>{'"workOrderLines":[...]}'}</div>
                  <div className="text-[8px] mt-1 text-[var(--color-text)]">read-only document API</div>
                </div>
              </div>
              <div className="text-center text-[9px] text-[var(--color-text)] mt-1">✓ Same ACID transaction · No sync · No ETL</div>
            </div>
          </div>

          {/* Flow diagram */}
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
            <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Duality View Architecture</div>
            <DiagramBox label="manufacturing_work_orders + manufacturing_work_order_lines" sub="Normalized relational tables - ACID, FK constraints, indexes" color="#437C94" />
            <div className="text-center text-[10px] text-[var(--color-text)]">↓ CREATE JSON RELATIONAL DUALITY VIEW</div>
            <DiagramBox label="MANUFACTURING_WORK_ORDER_DOCUMENTS_DV" sub="VPD-compatible work-order aggregate with governed reference IDs and owned lines" color="#AA643B" />
            <div className="text-center text-[10px] text-[var(--color-text)]">↓</div>
            <DiagramBox label="products + inventory" sub="Manufactured Part catalog + plant capacity levels" color="#437C94" />
            <div className="text-center text-[10px] text-[var(--color-text)]">↓ CREATE JSON RELATIONAL DUALITY VIEW</div>
            <DiagramBox label="MANUFACTURED_PART_CAPACITY_DV" sub="Read-only domain document with product line and plant capacity" color="#AA643B" />
          </div>

          {/* How it works callout */}
          <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)' }}>
            <p className="text-[10px] text-[var(--color-text-dim)] leading-relaxed">
              <strong className="text-[var(--color-text)]">How it works:</strong>{' '}
              The same <span className="font-mono text-[var(--color-text)]">manufacturing_work_orders</span> + <span className="font-mono text-[var(--color-text)]">manufacturing_work_order_lines</span> rows you see in relational
              queries are exposed as nested JSON documents through <span className="font-mono text-[var(--color-text)]">MANUFACTURING_WORK_ORDER_DOCUMENTS_DV</span>.
              Read through the JSON document or query the same normalized tables directly - same ACID data, zero synchronization.
              Writes remain governed through the existing relational workflows.
            </p>
          </div>

          {/* VPD on Work Orders */}
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
              Virtual Private Database (VPD) on Work Orders
            </p>
            <p className="text-sm text-[var(--color-text)] leading-relaxed mb-2">
              A second <span className="tone-red font-mono">DBMS_RLS</span> policy on the{' '}
              <code className="text-xs tone-teal mx-1">MANUFACTURING_WORK_ORDERS</code> table restricts plant capacity managers
              to work orders assigned to their regional plants. The policy reads the trusted{' '}
              <code className="text-xs tone-teal mx-1">MANUFACTURING_APP_CTX</code> role and region set by{' '}
              <code className="text-xs tone-teal mx-1">MANUFACTURING_SECURITY_PKG</code>.
              Admins and analysts see all authorized work orders; a regional manager sees only their database-filtered subset.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS (Work Orders)" color="red" />
            <FeatureBadge label="VPD Row-Level Security" color="red" />
            <FeatureBadge label="MANUFACTURING_APP_CTX" color="yellow" />
            <FeatureBadge label="Cascading VPD" color="orange" />
          </div>
          <SqlBlock code={`-- Trusted package populates MANUFACTURING_APP_CTX
BEGIN
  MANUFACTURING_SECURITY_PKG.SET_USER_CONTEXT('fm_west_maria');
END;
/

-- Fail-closed VPD policy function for MANUFACTURING_WORK_ORDERS
CREATE OR REPLACE FUNCTION vpd_manufacturing_operational (
    p_schema IN VARCHAR2, p_table IN VARCHAR2
) RETURN VARCHAR2 AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE'));
    v_region := UPPER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION'));

    IF SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') <> 'Y' THEN
        RETURN '1 = 0';
    END IF;
    IF LOWER(SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE')) = 'global'
       AND v_role IN ('admin','analyst') THEN RETURN NULL; END IF;

    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'assigned_plant_id IN (' ||
               'SELECT center_id FROM fulfillment_centers ' ||
               'WHERE UPPER(state_province) = ' ||
               DBMS_ASSERT.ENQUOTE_LITERAL(v_region) || ')';
    END IF;

    RETURN '1 = 0';
END;
/

BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema   => USER,
    object_name     => 'MANUFACTURING_WORK_ORDERS',
    policy_name     => 'VPD_ORDERS_REGION',
    function_schema => USER,
    policy_function => 'VPD_MANUFACTURING_OPERATIONAL',
    statement_types => 'SELECT,INSERT,UPDATE,DELETE',
    update_check    => TRUE,
    enable          => TRUE
  );
END;
/`} />
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="tone-ocean" /> Work Orders
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Line supervisors can inspect the AX-400 production route, quality inspection holds, and execution record through{' '}
          <span className="font-semibold text-[var(--color-text)]">Relational</span> rows and{' '}
          <span className="font-semibold text-[var(--color-text)]">JSON Duality View</span> documents - same data, two interfaces.
        </p>
      </div>

      <SceneStoryPanel scene="work-orders" />

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isFM = currentUser.ROLE === 'fulfillment_mgr';
        const isRestricted = currentUser.ROLE === 'viewer' || currentUser.ROLE === 'merchandiser';
        return (
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm"
            style={{ background: `${roleMeta.color}10`, border: `1px solid ${roleMeta.color}25` }}
          >
            <Shield size={14} style={{ color: roleMeta.color }} />
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <span className="font-semibold" style={{ color: 'var(--color-text)' }}>
                {currentUser.FULL_NAME}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                style={{
                  background: 'var(--color-surface-muted)',
                  color: 'var(--color-text)',
                  border: `1px solid ${roleMeta.color}`,
                }}
              >
                {roleMeta.label}
              </span>
              <span className="text-[var(--color-text-dim)] text-xs">
                {isFM
                  ? `Filtered to ${currentUser.REGION} - ${(workOrders || []).length} work orders visible`
                  : `${(workOrders || []).length} work orders visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <Eye size={10} />
              VPD {isFM ? 'regional' : (isRestricted ? 'restricted' : 'global')}
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter size={14} className="text-[var(--color-text-dim)]" />
        <JetSelectSingle
          value={status}
          options={STATUS_OPTIONS}
          placeholder="All Statuses"
          className="work-orders-status-filter"
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>

      {/* Work Orders Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)] bg-[var(--color-surface)]/50">
                <th className="text-left py-3 px-4">Work Order #</th>
                <th className="text-left py-3 px-4">Customer Account</th>
                <th className="text-left py-3 px-4">Location</th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Items</th>
                <th className="text-right py-3 px-4">Total</th>
                <th className="text-center py-3 px-4">Production Signal</th>
                <th className="text-left py-3 px-4">Plant</th>
                <th className="text-left py-3 px-4">Created</th>
                <th className="text-left py-3 px-4">Target</th>
                <th className="text-left py-3 px-4">Completion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="py-8 text-center text-[var(--color-text-dim)]">Loading work orders...</td></tr>
              ) : (workOrders || []).length === 0 ? (
                <tr><td colSpan={11} className="py-8 text-center text-[var(--color-text-dim)]">No work orders found</td></tr>
              ) : (
                (workOrders || []).map(o => {
                  const isExpanded = expandedId === o.WORK_ORDER_ID;
                  const completion = completionDateLabel(o);
                  return [
                    <tr key={o.WORK_ORDER_ID}
                      onClick={() => toggleExpand(o.WORK_ORDER_ID)}
                      className={`border-b border-[var(--color-border)]/20 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer ${
                        isExpanded ? 'bg-[var(--color-surface-hover)]' : ''
                      }`}
                      style={isExpanded ? { borderBottom: 'none' } : {}}>
                      <td className="py-3 px-4 font-mono font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
                          aria-expanded={isExpanded}
                          aria-controls={`work-order-detail-${o.WORK_ORDER_ID}`}
                          aria-label={`${isExpanded ? 'Close' : 'Open'} work order ${o.WORK_ORDER_ID} details`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpand(o.WORK_ORDER_ID);
                          }}
                        >
                          {isExpanded ? <ChevronDown size={12} className="text-[#AA643B]" /> : <ChevronRight size={12} className="text-[var(--color-text-dim)]" />}
                          #{o.WORK_ORDER_ID}
                        </button>
                      </td>
                      <td className="py-3 px-4">{o.CUSTOMER_NAME}</td>
                      <td className="py-3 px-4 text-[var(--color-text-dim)]">{o.CUSTOMER_CITY}, {o.CUSTOMER_STATE}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[o.WORK_ORDER_STATUS_CODE] || ''}`}>
                          {o.WORK_ORDER_STATUS_CODE}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{o.WORK_ORDER_LINE_COUNT}</td>
                      <td className="py-3 px-4 text-right font-medium">{formatCurrency(o.WORK_ORDER_VALUE)}</td>
                      <td className="py-3 px-4 text-center">
                        {o.SIGNAL_INFLUENCED ? (
                          <span className="tone-rose text-xs font-semibold">Production Signal</span>
                        ) : (
                          <span className="text-[var(--color-text-dim)] text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--color-text-dim)]">{o.ASSIGNED_PLANT || '-'}</td>
                      <td className="py-3 px-4 text-xs text-[var(--color-text-dim)]">{formatDate(o.CREATED_AT)}</td>
                      <td className="py-3 px-4 text-xs font-semibold">{formatDate(o.TARGET_COMPLETION_DATE)}</td>
                      <td className={`py-3 px-4 text-xs font-semibold ${completion.tone}`}>
                        <div>{completion.value}</div>
                        <div className="text-[9px] text-[var(--color-text-dim)]">{completion.label}</div>
                      </td>
                    </tr>,
                    isExpanded && (
                      <WorkOrderDetailPanel key={`detail-${o.WORK_ORDER_ID}`} workOrderId={o.WORK_ORDER_ID} onClose={() => setExpandedId(null)} />
                    ),
                  ];
                }).flat().filter(Boolean)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <JetButton
          label="Prev"
          chroming="outlined"
          disabled={page === 1}
          onAction={() => setPage(p => Math.max(1, p - 1))}
        />
        <span className="text-sm text-[var(--color-text-dim)]">Page {page}</span>
        <JetButton
          label="Next"
          chroming="outlined"
          disabled={(workOrders || []).length < 20}
          onAction={() => setPage(p => p + 1)}
        />
      </div>
    </div>
  );
}
