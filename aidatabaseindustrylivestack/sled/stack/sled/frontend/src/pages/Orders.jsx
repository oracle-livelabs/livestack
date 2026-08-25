import { useState, useCallback, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  Filter,
  Loader2,
  MapPin,
  Navigation,
  Send,
  Shield,
  UserCheck,
} from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatCurrency, formatDate } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetButton, JetSelectSingle } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { formatRegionLabel, useUser } from '../context/UserContext';
import { SceneStoryPanel } from '../components/StateLocalGovernmentStory';
import { STATE_LOCAL_SCENARIO } from '../config/stateLocalScenario';
import {
  getRequestStatusCode,
  getRequestStatusLabel,
  getServiceTaskStatusCode,
  getServiceTaskStatusLabel,
  REQUEST_STATUSES,
  SERVICE_TASK_STATUSES,
} from '../utils/serviceLifecycle';

const CARRIER_COLORS = { 'Field Crew': '#796087', 'Mobile Service': '#AA643B', 'Service Counter': '#4F7D7B', 'Partner Contractor': '#C74634' };

const TASK_STATUS_ICONS = {
  intake: ClipboardList,
  assigned: UserCheck,
  scheduled: CalendarClock,
  dispatched: Send,
  in_progress: Activity,
  field_resolution_underway: Navigation,
  completed: Check,
  blocked: AlertTriangle,
};

const SERVICE_TASK_STATUS_STEPS = SERVICE_TASK_STATUSES
  .filter((status) => status.code !== 'blocked')
  .map((status) => ({
    ...status,
    key: status.code,
    icon: TASK_STATUS_ICONS[status.code] || Activity,
  }));

const ORDER_DETAIL_TABS = [
  { id: 'relational', label: 'Relational' },
  { id: 'json', label: 'JSON Duality View' },
  { id: 'route', label: 'Service Task Route' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...REQUEST_STATUSES.map(({ code, label }) => ({ value: code, label })),
];

function field(row, publicKey, legacyKey, fallback = '') {
  if (!row) return fallback;
  if (row[publicKey] !== undefined && row[publicKey] !== null) return row[publicKey];
  if (legacyKey && row[legacyKey] !== undefined && row[legacyKey] !== null) return row[legacyKey];
  return fallback;
}

function serviceCenterLocation(order) {
  if (!order) return '';
  const city = field(order, 'SERVICE_SITE_CITY', 'CENTER_CITY');
  const state = field(order, 'SERVICE_SITE_STATE', 'CENTER_STATE_PROVINCE') || order.CENTER_STATE;
  const postalCode = field(order, 'SERVICE_SITE_POSTAL_CODE', 'CENTER_POSTAL_CODE') || order.CENTER_ZIP;
  return [city, state, postalCode].filter(Boolean).join(', ');
}

/* ─── Auto-fit map bounds ──────────────────────────────────────────────── */
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7, animate: false });
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
  submitted: 'surface-sienna-soft text-[var(--color-text)]',
  accepted: 'surface-ocean-soft text-[var(--color-text)]',
  in_review: 'surface-plum-soft text-[var(--color-text)]',
  in_progress: 'surface-teal-soft text-[var(--color-text)]',
  completed: 'surface-pine-soft text-[var(--color-text)]',
  cancelled: 'surface-red-soft text-[var(--color-text)]',
  needs_follow_up: 'surface-bark-soft text-[var(--color-text)]',
  unknown: 'surface-bark-soft text-[var(--color-text)]',
};

/* ─── Service Request Duality Panel ─────────────────────────────────────────────── */
function OrderDualityPanel({ orderId, onClose }) {
  const [view, setView] = useState('relational'); // 'relational' | 'json' | 'route'
  const { data: detail, loading: loadingDetail } = useData(() => api.orders.detail(orderId), [orderId]);
  const { data: duality, loading: loadingDuality, error: dualityError } = useData(() => api.orders.duality(orderId), [orderId]);

  const [copied, setCopied] = useState(false);
  const copyJson = useCallback(() => {
    if (duality?.document) {
      navigator.clipboard.writeText(JSON.stringify(duality.document, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [duality]);

  const order = detail?.serviceRequest || detail?.order;
  const items = detail?.items || [];
  const shipment = detail?.serviceTask || detail?.shipment;
  const route = detail?.route;
  const routeGeometry = detail?.routeGeometry;
  const centerLocation = serviceCenterLocation(order);
  const [showDrivingRoute, setShowDrivingRoute] = useState(true);

  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="mx-4 mb-3 orders-detail-panel">

          {/* Tab bar */}
          <div className="orders-detail-tabbar">
            <div className="orders-detail-tabset">
              {ORDER_DETAIL_TABS.map(tab => (
                <JetButton
                  key={tab.id}
                  label={tab.label}
                  chroming={view === tab.id ? 'callToAction' : 'outlined'}
                  className="orders-detail-tab"
                  onAction={() => setView(tab.id)}
                />
              ))}
              <span className="text-[10px] text-[var(--color-text-dim)] ml-3 hidden sm:inline">
                Same data - three views
              </span>
            </div>
            <JetButton
              label="Close"
              title="Close service request detail"
              iconClass="oj-fwk-icon-cross"
              chroming="borderless"
              display="icons"
              onAction={onClose}
            />
          </div>

          {/* Relational view */}
          {view === 'relational' && (
            <div className="p-4 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-4 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading service request details…
                </div>
              ) : !order ? (
                <p className="text-sm text-[var(--color-text-dim)] text-center py-4">Service request not found</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-xs text-[var(--color-text-dim)]">
                    <span className="text-[10px] px-2 py-0.5 rounded border font-mono" style={{ background: 'rgba(67,124,148,0.1)', borderColor: 'rgba(67,124,148,0.3)', color: 'var(--color-text)' }}>
                      SELECT * FROM service_requests / service_request_lines
                    </span>
                    <span>{items.length} line items</span>
                  </div>

                  {/* Service Request summary */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                    {[
                      { label: 'Resident', value: `${order.FIRST_NAME} ${order.LAST_NAME}` },
                      { label: 'Location', value: `${order.CITY}, ${order.STATE_PROVINCE}` },
                      { label: 'Service Center Location', value: centerLocation || 'Location pending' },
                      { label: 'Service Value', value: formatCurrency(field(order, 'SERVICE_VALUE', 'ORDER_TOTAL')) },
                      { label: 'Route Cost', value: formatCurrency(field(order, 'SERVICE_ROUTE_COST', 'SHIPPING_COST')) },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg p-2" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                        <p className="text-[10px] text-[var(--color-text-dim)] uppercase">{s.label}</p>
                        <p className="text-sm font-medium">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Items table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                        <th className="text-left py-1.5 px-2">Item #</th>
                        <th className="text-left py-1.5 px-2">Public Service</th>
                        <th className="text-left py-1.5 px-2">Public Program</th>
                        <th className="text-left py-1.5 px-2">Category</th>
                        <th className="text-right py-1.5 px-2">Qty</th>
                        <th className="text-right py-1.5 px-2">Est. Value</th>
                        <th className="text-right py-1.5 px-2">Line Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.ITEM_ID} className="border-b border-[var(--color-border)]/20">
                          <td className="py-1.5 px-2 font-mono">{item.ITEM_ID}</td>
                          <td className="py-1.5 px-2 font-medium">{field(item, 'SERVICE_NAME', 'Public service')}</td>
                          <td className="py-1.5 px-2 text-[var(--color-text-dim)]">{field(item, 'AGENCY_OR_PROGRAM', 'Agency or program')}</td>
                          <td className="py-1.5 px-2 text-[var(--color-text-dim)]">{item.CATEGORY}</td>
                          <td className="py-1.5 px-2 text-right">{item.QUANTITY}</td>
                          <td className="py-1.5 px-2 text-right">{formatCurrency(field(item, 'ESTIMATED_SERVICE_VALUE', 0))}</td>
                          <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(field(item, 'LINE_SERVICE_VALUE', 'LINE_TOTAL'))}</td>
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
                  <Loader2 size={14} className="animate-spin" /> Querying ORDERS_DV duality view…
                </div>
              ) : dualityError ? (
                <p className="text-sm tone-red text-center py-4">{dualityError}</p>
              ) : duality?.document ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded border font-mono" style={{ background: 'rgba(170,100,59,0.1)', borderColor: 'rgba(170,100,59,0.3)', color: 'var(--color-text)' }}>
                        SELECT DATA FROM orders_dv
                      </span>
                      <span className="text-[10px] text-[var(--color-text-dim)]">
                        Source: <span className="text-[var(--color-text)] font-mono">{duality.source}</span>
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
                    <span className="text-[var(--color-text-dim)]"> - This is the exact same service request data from the relational tab, but accessed through
                    Oracle's <span className="text-[var(--color-text)] font-mono">ORDERS_DV</span> duality view. The normalized tables store the rows; the duality view exposes them as a
                    single JSON document with nested items. Read and write through either interface - same ACID transaction.</span>
                  </div>

                  {/* JSON document */}
                  <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface-muted)', border: '1px solid rgba(170,100,59,0.25)' }}>
                    <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: 'rgba(170,100,59,0.08)', borderBottom: '1px solid rgba(170,100,59,0.2)' }}>
                      <span className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider">JSON Document</span>
                      <span className="text-[10px] text-[var(--color-text-dim)] font-mono">
                        {duality.document.items?.length || 0} nested items
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

          {/* Service Task Route Map */}
          {view === 'route' && (
            <div className="p-4 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-dim)] py-4 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading service task data…
                </div>
              ) : !order ? (
                <p className="text-sm text-[var(--color-text-dim)] text-center py-4">Service request not found</p>
              ) : !order.CENTER_LAT || !field(order, 'RESIDENT_LAT', 'CUST_LAT') ? (
                <div className="text-center py-8">
                  <MapPin size={24} className="mx-auto mb-2 text-[var(--color-text-dim)] opacity-40" />
                  <p className="text-sm text-[var(--color-text-dim)]">No location data available for this service request</p>
                </div>
              ) : (() => {
                const residentLat = field(order, 'RESIDENT_LAT', 'CUST_LAT');
                const residentLon = field(order, 'RESIDENT_LON', 'CUST_LON');
                const from = [order.CENTER_LAT, order.CENTER_LON];
                const to = [residentLat, residentLon];
                const arc = curvedPositions(from, to);
                const serviceChannel = field(shipment, 'SERVICE_CHANNEL', 'CARRIER');
                const taskReference = field(shipment, 'TASK_REFERENCE', 'TRACKING_NUMBER');
                const carrierColor = CARRIER_COLORS[serviceChannel] || '#4C825C';
                const serviceTaskStatus = field(shipment, 'SERVICE_TASK_STATUS', 'SHIP_STATUS');
                const currentStep = getServiceTaskStatusCode(serviceTaskStatus || 'intake');
                const stepIndex = SERVICE_TASK_STATUS_STEPS.findIndex((step) => step.key === currentStep);
                const currentStatusDefinition = SERVICE_TASK_STATUSES.find((entry) => entry.code === currentStep);
                const visibleStatus = shipment
                  ? getServiceTaskStatusLabel(serviceTaskStatus)
                  : getRequestStatusLabel(field(order, 'SERVICE_REQUEST_STATUS', 'ORDER_STATUS'));

                // Distance priority: SDO_GCDR.ELOC_ROUTE (driving) > SDO_GEOM.SDO_DISTANCE (great-circle) > service task data > Haversine fallback
                const routeDistMiles = route?.distance != null ? Math.round(route.distance * 100) / 100 : null;
                const routeTimeHours = route?.time != null ? Math.round(route.time / 60 * 10) / 10 : null;
                let distanceMiles = routeDistMiles || field(order, 'ROUTE_DISTANCE_MILES', 'SPATIAL_DISTANCE_MILES') || shipment?.DISTANCE_MILES;
                if (!distanceMiles && from[0] && to[0]) {
                  const R = 3958.8; // Earth radius in miles
                  const dLat = (to[0] - from[0]) * Math.PI / 180;
                  const dLon = (to[1] - from[1]) * Math.PI / 180;
                  const a = Math.sin(dLat/2)**2 + Math.cos(from[0]*Math.PI/180) * Math.cos(to[0]*Math.PI/180) * Math.sin(dLon/2)**2;
                  distanceMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                }
                const estHours = routeTimeHours || (distanceMiles ? Math.round(distanceMiles / 55 * 10) / 10 : null);
                const isRouteData = routeDistMiles != null;

                return (
                  <>
                    {/* Status badge row */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[10px] px-2 py-0.5 rounded border font-mono" style={{ background: 'rgba(76,130,92,0.1)', borderColor: 'rgba(76,130,92,0.3)', color: 'var(--color-text)' }}>
                        {routeGeometry ? 'SDO_GCDR.ELOC_ROUTE_GEOM' : isRouteData ? 'SDO_GCDR.ELOC_ROUTE' : 'SDO_GEOM.SDO_DISTANCE'}
                      </span>
                      {routeGeometry && (
                        <JetButton
                          label={showDrivingRoute ? 'Driving Route' : 'Arc Only'}
                          iconClass="oj-fwk-icon-arrowtail-e"
                          chroming={showDrivingRoute ? 'callToAction' : 'outlined'}
                          onAction={() => setShowDrivingRoute(prev => !prev)}
                        />
                      )}
                      {shipment && (
                        <span className="flex items-center gap-1 text-[var(--color-text-dim)]">
                          <Navigation size={11} style={{ color: carrierColor }} />
                          <span style={{ color: carrierColor }} className="font-semibold">{serviceChannel}</span>
                          {taskReference && (
                            <span className="font-mono opacity-60">#{taskReference}</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Map */}
                    <div className="orders-route-map">
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
                          <Polyline positions={routeGeometry} color={carrierColor} weight={4} opacity={0.9} />
                        )}

                        {/* Bezier arc (dashed) - dimmed when driving route is shown */}
                        <Polyline
                          positions={arc}
                          color={routeGeometry && showDrivingRoute ? '#ffffff' : carrierColor}
                          weight={routeGeometry && showDrivingRoute ? 1.5 : 3}
                          opacity={routeGeometry && showDrivingRoute ? 0.25 : 0.85}
                          dashArray="8 6"
                        />

                        {/* Service Site center marker */}
                        <CircleMarker center={from} radius={8} fillColor="#437C94" fillOpacity={0.9} color="#fff" weight={2}>
                          <Tooltip permanent direction="top" offset={[0, -10]}
                            className="route-map-tooltip">
                            <div className="route-map-tooltip__content">
                              <span className="route-map-tooltip__label">Center</span>
                              <span>{order.CENTER_NAME || 'Service Site'}</span>
                              {centerLocation && <span>{centerLocation}</span>}
                            </div>
                          </Tooltip>
                        </CircleMarker>

                        {/* Resident marker */}
                        <CircleMarker center={to} radius={8} fillColor="#4C825C" fillOpacity={0.9} color="#fff" weight={2}>
                          <Tooltip permanent direction="top" offset={[0, -10]}
                            className="route-map-tooltip">
                            <div className="route-map-tooltip__content">
                              <span className="route-map-tooltip__label">Resident</span>
                              <span>{order.FIRST_NAME} {order.LAST_NAME} - {order.CITY}, {order.STATE_PROVINCE}</span>
                            </div>
                          </Tooltip>
                        </CircleMarker>
                      </MapContainer>
                    </div>

                    {/* Service Task info cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Distance', value: distanceMiles ? `${Math.round(distanceMiles).toLocaleString()} mi` : '-', color: '#4C825C' },
                        { label: 'Est. Travel', value: estHours ? `${estHours} hrs` : '-', color: '#AA643B' },
                        { label: 'Route Cost', value: field(shipment, 'SERVICE_TASK_COST', 'SHIP_COST') ? formatCurrency(field(shipment, 'SERVICE_TASK_COST', 'SHIP_COST')) : '-', color: '#437C94' },
                        { label: 'Status', value: visibleStatus, color: carrierColor, title: currentStatusDefinition?.description },
                      ].map(c => (
                        <div key={c.label} title={c.title} className="rounded-lg p-2" style={{ background: `${c.color}08`, border: `1px solid ${c.color}25` }}>
                          <p className="text-[10px] text-[var(--color-text-dim)] uppercase">{c.label}</p>
                          <p className="text-sm font-bold" style={{ color: c.color }}>{c.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Status timeline */}
                    {shipment && (
                      <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
                        <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Service Task Progress</p>
                        <div className="overflow-x-auto pb-1">
                          <div className="flex items-center gap-0 min-w-[680px]">
                          {SERVICE_TASK_STATUS_STEPS.map((step, i) => {
                            const StepIcon = step.icon;
                            const isComplete = i <= stepIndex;
                            const isCurrent = i === stepIndex;
                            return (
                              <div key={step.key} className="flex items-center" style={{ flex: i < SERVICE_TASK_STATUS_STEPS.length - 1 ? 1 : 'none' }}>
                                <div className="flex flex-col items-center" style={{ minWidth: 28 }}>
                                  <div className="w-6 h-6 rounded flex items-center justify-center transition-all"
                                    style={{
                                      background: isComplete ? `${carrierColor}20` : 'var(--color-surface)',
                                      border: `2px solid ${isComplete ? carrierColor : 'rgba(49,45,42,0.12)'}`,
                                      boxShadow: isCurrent ? `0 0 0 3px ${carrierColor}24` : 'none',
                                    }}>
                                    <StepIcon size={10} style={{ color: isComplete ? carrierColor : 'var(--color-text-dim)' }} />
                                  </div>
                                  <span title={step.description} className="text-[8px] mt-1 text-center leading-tight"
                                    style={{ color: isComplete ? carrierColor : 'var(--color-text-dim)', fontWeight: isCurrent ? 700 : 400, maxWidth: 82 }}>
                                    {step.label}
                                  </span>
                                </div>
                                {i < SERVICE_TASK_STATUS_STEPS.length - 1 && (
                                  <div className="flex-1 h-0.5 mx-0.5 rounded" style={{
                                    background: i < stepIndex ? carrierColor : 'rgba(49,45,42,0.12)',
                                  }} />
                                )}
                              </div>
                            );
                          })}
                          </div>
                        </div>
                        <p className="text-[9px] text-[var(--color-text-dim)] mt-2">
                          <strong className="text-[var(--color-text)]">Field Resolution Underway</strong> means the assigned in-state team is actively resolving the request in the resident's service area.
                        </p>
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
           ${residentLon}, ${residentLat},
           'vehicle=car'))
FROM   dual;
-- Result: LineString with ${routeGeometry.length} coordinate pairs

-- SDO_GCDR.ELOC_ROUTE for distance/time metrics
-- SDO_GCDR.ELOC_ROUTE_GEOM for actual road geometry
-- SDO_GCDR.ELOC_DRIVE_TIME_POLYGON for isochrone zones` : `-- Distance between service access center and resident
SELECT ROUND(SDO_GEOM.SDO_DISTANCE(
         fc.location,              -- SDO_GEOMETRY point
         c.location,               -- SDO_GEOMETRY point
         0.05, 'unit=MILE'), 1)    AS distance_miles
FROM   fulfillment_centers fc, customers c
WHERE  fc.center_id = ${field(order, 'SERVICE_SITE_ID', 'FULFILLMENT_CENTER_ID') || ':center_id'}
AND    c.customer_id = ${field(order, 'CONSTITUENT_ID', 'CUSTOMER_ID') || ':constituent_id'};
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

export default function Orders() {
  const { currentUser, accessScope, ROLE_META } = useUser();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  // VPD-aware: refetch when user switches
  const userKey = currentUser?.USERNAME;
  const { data: orders, loading } = useData(
    () => api.orders.list({ status, page, limit: 20 }),
    [status, page, userKey]
  );
  const serviceRequests = orders || [];

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="space-y-6 fade-in">
      <SceneStoryPanel scene="orders" />

      {/* Register Oracle Internals into the right panel */}
      <RegisterOraclePanel title="Service Request Workbench">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
              JSON Relational Duality Views
            </p>
            <p className="text-sm text-[var(--color-text)] leading-relaxed">
              The database contains two actual <span className="font-mono text-[var(--color-text)]">JSON Relational Duality Views</span>:
              <span className="tone-ocean font-mono"> ORDERS_DV</span> for service requests and
              <span className="tone-ocean font-mono"> PRODUCTS_INVENTORY_DV</span> for the populated public-service catalog.
              They expose the <em>same relational data</em> as JSON documents without ETL or duplication. Click any service request row and toggle between{' '}
              <span className="font-semibold text-[var(--color-text)]">Relational</span> and <span className="font-semibold text-[var(--color-text)]">JSON Duality</span> to see
              the same data rendered two ways - <em>same transaction, zero sync lag</em>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="JSON Relational Duality Views" color="orange" />
            <FeatureBadge label="ORDERS_DV" color="yellow" />
            <FeatureBadge label="PRODUCTS_INVENTORY_DV" color="green" />
            <FeatureBadge label="WITH UPDATE (read-write)" color="cyan" />
            <FeatureBadge label="Same ACID Transaction" color="blue" />
            <FeatureBadge label="Zero ETL / Zero Sync" color="purple" />
          </div>

          {/* PRODUCTS_INVENTORY_DV examples */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
              PRODUCTS_INVENTORY_DV - Populated Duality View Examples
            </p>
            <p className="text-xs text-[var(--color-text-dim)] mb-2 leading-relaxed">
              This is the populated Duality View in the demo dataset. It contains 188 public-service documents, so these examples return rows in the current environment.
            </p>
            <SqlBlock code={`-- Count JSON documents in the actual Duality View
SELECT COUNT(*) AS duality_documents
FROM products_inventory_dv;

-- Read fields from one JSON document
SELECT JSON_VALUE(DATA, '$._id' RETURNING NUMBER) AS service_id,
       JSON_VALUE(DATA, '$.productName' RETURNING VARCHAR2(200)) AS service_name,
       JSON_VALUE(DATA, '$.category' RETURNING VARCHAR2(100)) AS category
FROM products_inventory_dv
ORDER BY JSON_VALUE(DATA, '$._id' RETURNING NUMBER)
FETCH FIRST 5 ROWS ONLY;`} />
          </div>

          {/* Query example */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
              How to Query a Real Duality View
            </p>
            <SqlBlock code={`-- Aggregate JSON fields directly from the Duality View
SELECT JSON_VALUE(DATA, '$.category' RETURNING VARCHAR2(100)) AS category,
       COUNT(*) AS service_documents
FROM products_inventory_dv
GROUP BY JSON_VALUE(DATA, '$.category' RETURNING VARCHAR2(100))
ORDER BY service_documents DESC
FETCH FIRST 5 ROWS ONLY;`} />
          </div>

          {/* Visual diagram */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">One Table, Two Faces</p>
            <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
              <div className="text-center text-[10px] text-[var(--color-text)] mb-2">Same underlying data - two interfaces</div>
              <div className="flex gap-2">
                <div className="flex-1 rounded p-2 text-[9px] text-center" style={{ background: '#437C9415', border: '1px solid #437C9440', color: 'var(--color-text)' }}>
                  <div className="font-bold mb-1">SQL View</div>
                  <div>SELECT *</div>
                  <div>FROM orders</div>
                  <div className="text-[8px] mt-1 text-[var(--color-text)]">row-by-row</div>
                </div>
                <div className="flex flex-col justify-center tone-sienna text-lg">⇔</div>
                <div className="flex-1 rounded p-2 text-[9px] text-center" style={{ background: '#AA643B15', border: '1px solid #AA643B40', color: 'var(--color-text)' }}>
                  <div className="font-bold mb-1">JSON Duality</div>
                  <div>{'{"id":1,'}</div>
                  <div>{'"items":[...]}'}</div>
                  <div className="text-[8px] mt-1 text-[var(--color-text)]">document REST API</div>
                </div>
              </div>
              <div className="text-center text-[9px] text-[var(--color-text)] mt-1">✓ Same ACID transaction · No sync · No ETL</div>
            </div>
          </div>

          {/* Flow diagram */}
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
            <div className="text-[9px] text-center text-[var(--color-text)] font-bold mb-1">Duality View Architecture</div>
            <DiagramBox label="Service requests + lines" sub="Normalized relational tables - ACID, FK constraints, indexes" color="#437C94" />
            <div className="text-center text-[10px] text-[var(--color-text)]">↕ ORDERS_DV · WITH UPDATE</div>
            <DiagramBox label="ORDERS_DV" sub="Actual service-request JSON document: {_id, status, items: [...]}" color="#AA643B" />
            <div className="text-center text-[10px] text-[var(--color-text)]">↕</div>
            <DiagramBox label="Products + inventory" sub="Populated public-service catalog + inventory rows" color="#437C94" />
            <div className="text-center text-[10px] text-[var(--color-text)]">↕ PRODUCTS_INVENTORY_DV · WITH UPDATE</div>
            <DiagramBox label="PRODUCTS_INVENTORY_DV" sub="Actual JSON document: {_id, productName, inventory: [...]}" color="#AA643B" />
          </div>

          {/* How it works callout */}
          <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(170,100,59,0.06)', border: '1px dashed rgba(170,100,59,0.3)' }}>
            <p className="text-[10px] text-[var(--color-text-dim)] leading-relaxed">
              <strong className="text-[var(--color-text)]">How it works:</strong>{' '}
              The same relational rows are exposed as nested JSON documents through the actual
              <span className="font-mono text-[var(--color-text)]"> ORDERS_DV</span> and
              <span className="font-mono text-[var(--color-text)]"> PRODUCTS_INVENTORY_DV</span> views.
              Read or write through either interface - same ACID transaction, same data, zero sync.
              Their <span className="font-mono text-[var(--color-text)]">WITH UPDATE</span> definitions make both views read-write.
            </p>
          </div>

          {/* VPD on Service Requests */}
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
              Virtual Private Database (VPD) on Service Request Workbench
            </p>
            <p className="text-sm text-[var(--color-text)] leading-relaxed mb-2">
              A second <span className="tone-red font-mono">DBMS_RLS</span> policy on the{' '}
              <code className="text-xs tone-teal mx-1">SERVICE_REQUESTS</code> semantic object restricts access managers
              to service requests assigned to their in-state service region. The governed{' '}
              <code className="text-xs tone-teal mx-1">SERVICE_REGION_CODE</code> is evaluated directly against the
              authenticated Oracle context on every protected operation.
              <span className="tone-sienna font-mono"> SLED_SECURITY_PKG</span> validates the identity, and policy
              functions read <span className="tone-sienna font-mono">SLED_APP_CTX</span> only through{' '}
              <span className="tone-sienna font-mono">SYS_CONTEXT</span>. Global roles are explicitly allowlisted,
              regional managers see only their subset, and restricted or missing context returns no protected service requests.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS (Service Requests)" color="red" />
            <FeatureBadge label="VPD Row-Level Security" color="red" />
            <FeatureBadge label="SLED_SECURITY_PKG" color="yellow" />
            <FeatureBadge label="SLED_APP_CTX" color="yellow" />
            <FeatureBadge label="Fail-Closed VPD" color="orange" />
          </div>
          <SqlBlock code={`-- Trusted session context and the scope it produces
BEGIN SLED_SECURITY_PKG.SET_USER_CONTEXT('fm_west_maria'); END;
/

SELECT CASE
         WHEN SYS_CONTEXT('SLED_APP_CTX','AUTHENTICATED') != 'Y' THEN 'no protected rows'
         WHEN SYS_CONTEXT('SLED_APP_CTX','ACCESS_SCOPE') = 'GLOBAL' THEN 'global access'
         WHEN SYS_CONTEXT('SLED_APP_CTX','ACCESS_SCOPE') = 'REGIONAL' THEN
           'regional access for ' || SYS_CONTEXT('SLED_APP_CTX','REGION')
         ELSE 'no protected rows'
       END AS vpd_scope,
       SYS_CONTEXT('SLED_APP_CTX','ROLE') AS role_name,
       SYS_CONTEXT('SLED_APP_CTX','REGION') AS region
FROM dual;`} />
        </div>
      </RegisterOraclePanel>

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="tone-ocean" /> Service Request Workbench
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Click any service request to toggle between <span className="font-semibold text-[var(--color-text)]">Relational</span> and{' '}
          <span className="font-semibold text-[var(--color-text)]">JSON Duality View</span> - same data, two interfaces. Requests shown for {STATE_LOCAL_SCENARIO.state} residents only; service centers are assigned within {STATE_LOCAL_SCENARIO.state}.
        </p>
        <p className="text-xs text-[var(--color-text-dim)] mt-2">
          <strong className="text-[var(--color-text)]">Request Line Items:</strong>{' '}
          Number of individual service or eligibility items included in the resident request.
        </p>
      </div>

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isRegional = accessScope === 'REGIONAL';
        const isRestricted = accessScope === 'RESTRICTED';
        const scopeMessage = isRestricted
          ? 'No protected operational rows visible'
          : isRegional
            ? `Filtered to ${formatRegionLabel(currentUser.REGION)} - ${serviceRequests.length} service requests visible`
            : `${serviceRequests.length} service requests visible across Colorado`;
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
                {scopeMessage}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <Eye size={10} />
              VPD {accessScope.toLowerCase()}
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
          className="orders-status-filter"
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>

      {/* Service Requests Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)] bg-[var(--color-surface)]/50">
                <th className="text-left py-3 px-4">Service Request #</th>
                <th className="text-left py-3 px-4">Resident</th>
                <th className="text-left py-3 px-4">Location</th>
                <th className="text-center py-3 px-4">Status</th>
                <th
                  className="text-right py-3 px-4"
                  title="Number of individual service or eligibility items included in the resident request."
                >
                  Request Line Items
                </th>
                <th className="text-right py-3 px-4">Service Value</th>
                <th className="text-center py-3 px-4">Resident Signal</th>
                <th className="text-left py-3 px-4">Service Site</th>
                <th className="text-left py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-8 text-center text-[var(--color-text-dim)]">Loading service requests...</td></tr>
              ) : serviceRequests.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-[var(--color-text-dim)]">No service requests found</td></tr>
              ) : (
                serviceRequests.map(o => {
                  const requestId = field(o, 'SERVICE_REQUEST_ID', 'ORDER_ID');
                  const requestStatusValue = field(o, 'SERVICE_REQUEST_STATUS', 'ORDER_STATUS');
                  const requestStatusCode = getRequestStatusCode(requestStatusValue);
                  const requestStatusLabel = getRequestStatusLabel(requestStatusValue);
                  const isExpanded = expandedId === requestId;
                  return [
                    <tr key={requestId}
                      onClick={() => toggleExpand(requestId)}
                      className={`border-b border-[var(--color-border)]/20 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer ${
                        isExpanded ? 'bg-[var(--color-surface-hover)]' : ''
                      }`}
                      style={isExpanded ? { borderBottom: 'none' } : {}}>
                      <td className="py-3 px-4 font-mono font-medium flex items-center gap-1.5">
                        {isExpanded ? <ChevronDown size={12} className="text-[#AA643B]" /> : <ChevronRight size={12} className="text-[var(--color-text-dim)]" />}
                        #{requestId}
                      </td>
                      <td className="py-3 px-4">{field(o, 'RESIDENT_NAME', 'CUSTOMER_NAME')}</td>
                      <td className="py-3 px-4 text-[var(--color-text-dim)]">{field(o, 'RESIDENT_CITY', 'CUSTOMER_CITY')}, {field(o, 'RESIDENT_STATE', 'CUSTOMER_STATE')}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${STATUS_COLORS[requestStatusCode] || STATUS_COLORS.unknown}`}>
                          {requestStatusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{field(o, 'LINE_ITEM_COUNT', 'ITEM_COUNT')}</td>
                      <td className="py-3 px-4 text-right font-medium">{formatCurrency(field(o, 'SERVICE_VALUE', 'ORDER_TOTAL'))}</td>
                      <td className="py-3 px-4 text-center">
                        {field(o, 'SIGNAL_LINKED', 'SOCIAL_DRIVEN') ? (
                          <span className="tone-rose text-xs font-semibold">Resident Signal</span>
                        ) : (
                          <span className="text-[var(--color-text-dim)] text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--color-text-dim)]">{field(o, 'SERVICE_SITE', 'FULFILLMENT_CENTER', '-')}</td>
                      <td className="py-3 px-4 text-xs text-[var(--color-text-dim)]">{formatDate(o.CREATED_AT)}</td>
                    </tr>,
                    isExpanded && (
                      <OrderDualityPanel key={`detail-${requestId}`} orderId={requestId} onClose={() => setExpandedId(null)} />
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
          disabled={serviceRequests.length < 20}
          onAction={() => setPage(p => p + 1)}
        />
      </div>
    </div>
  );
}
