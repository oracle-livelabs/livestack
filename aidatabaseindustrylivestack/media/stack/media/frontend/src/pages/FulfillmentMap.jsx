import { useState, useEffect, useMemo } from 'react';
import {
  MapContainer, TileLayer, CircleMarker, Circle, Polygon,
  Polyline, Popup, Tooltip, useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { latLngToCell, cellToBoundary } from 'h3-js';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetSwitch } from '../components/JetControls';
import { SceneStoryPanel } from '../components/MediaStory';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROUTE_PROVIDER_COLORS = {
  fedex: '#796087',
  ups: '#AA643B',
  usps: '#4F7D7B',
  dhl: '#C74634',
};

const ROUTE_PROVIDER_LABELS = {
  fedex: 'StreamOps',
  ups: 'StudioFleet',
  usps: 'ArenaLink',
  dhl: 'RightsRelay',
};

const TIER_COLORS = {
  vip:       '#796087',
  preferred: '#AA643B',
  standard:  '#437C94',
  new:       '#7A736E',
};

const ZONE_STYLES = {
  express:   { color: '#C74634', fillOpacity: 0.15, weight: 2.0, dashArray: '4 4' },
  overnight: { color: '#AA643B', fillOpacity: 0.12, weight: 1.8, dashArray: '5 4' },
  standard:  { color: '#AA643B', fillOpacity: 0.10, weight: 1.5, dashArray: '6 5' },
  economy:   { color: '#4C825C', fillOpacity: 0.07, weight: 1.0, dashArray: '8 6' },
};

const LAYER_DEFS = [
  { key: 'customers',     label: 'Audience Segments',       color: '#4C825C' },
  { key: 'centers',       label: 'Coverage Operations Hubs', color: '#437C94' },
  { key: 'routes',        label: 'Live Event Activation Paths', color: '#796087' },
  { key: 'zones',         label: 'Rights Coverage Zones',    color: '#AA643B' },
  { key: 'h3',            label: 'H3 Density Grid',      color: '#C74634' },
  { key: 'demandRegions', label: 'Audience Demand Regions',       color: '#AA643B' },
];

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

function CoverageKpiCard({ iconClass, label, value, meta, badge, color }) {
  return (
    <div className="stat-card fulfillment-kpi-card">
      <div className="fulfillment-kpi-card__top">
        <div className="fulfillment-kpi-card__icon" style={{ background: `${color}18`, color }}>
          <JetGlyph iconClass={iconClass} className="fulfillment-kpi-card__glyph" />
        </div>
        <span className="fulfillment-kpi-card__badge" style={{ borderColor: `${color}33`, color }}>
          {badge}
        </span>
      </div>
      <div className="fulfillment-kpi-card__copy">
        <p className="fulfillment-kpi-card__value">{value}</p>
        <p className="fulfillment-kpi-card__label">{label}</p>
      </div>
      <p className="fulfillment-kpi-card__meta">{meta}</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function centerColor(type) {
  if (type === 'distribution') return '#437C94';
  if (type === 'warehouse')    return '#4C825C';
  return '#AA643B';
}

function centerTypeLabel(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'distribution') return 'Rights Desk';
  if (normalizedType === 'warehouse') return 'Studio Ops Hub';
  if (normalizedType === 'micro') return 'Live Event Desk';
  if (normalizedType === 'drop_ship') return 'Partner Activation Desk';
  if (normalizedType === 'store') return 'Regional Coverage Desk';
  return 'Coverage operations hub';
}

function zoneTypeLabel(type) {
  const normalizedType = String(type || '').trim().toLowerCase();
  if (normalizedType === 'express') return 'Premiere Response';
  if (normalizedType === 'overnight') return 'Priority Coverage';
  if (normalizedType === 'standard') return 'Regional Coverage';
  if (normalizedType === 'economy') return 'Extended Coverage';
  return 'Coverage Tier';
}

function centerRadius(units) {
  if (units > 100000) return 20;
  if (units > 50000)  return 15;
  if (units > 20000)  return 11;
  return 8;
}

function normalizeRouteProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function routeProviderColor(value) {
  return ROUTE_PROVIDER_COLORS[normalizeRouteProvider(value)] || '#6F757E';
}

function routeProviderLabel(value) {
  return ROUTE_PROVIDER_LABELS[normalizeRouteProvider(value)] || 'Activation Path';
}

// Demand region color scale: high demand_index -> red, low -> green (Redwood palette, aerial map)
function demandColor(index) {
  if (index >= 85) return { fill: '#C74634', stroke: '#C74634', opacity: 0.42 };
  if (index >= 70) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.35 };
  if (index >= 55) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.28 };
  if (index >= 40) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.22 };
  return                  { fill: '#4C825C', stroke: '#4C825C', opacity: 0.18 };
}

// Heat-color scale: high density -> red, low -> green (Redwood palette, aerial map)
function h3HeatColor(ratio) {
  if (ratio > 0.75) return { fill: '#C74634', stroke: '#C74634', opacity: 0.60 };
  if (ratio > 0.50) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.50 };
  if (ratio > 0.25) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.42 };
  if (ratio > 0.10) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.35 };
  return                    { fill: '#4C825C', stroke: '#4C825C', opacity: 0.28 };
}

function normalizeCapacityStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === ['out', 'of', 'stock'].join('_')) return 'critical';
  return normalized;
}

function isCriticalCapacityStatus(status) {
  return ['critical', 'no_capacity'].includes(normalizeCapacityStatus(status));
}

// ── FitBounds ─────────────────────────────────────────────────────────────────
function FitBounds({ centers, active }) {
  const map = useMap();
  useEffect(() => {
    if (active && centers?.length) {
      map.fitBounds(centers.map(c => [c.LATITUDE, c.LONGITUDE]), { padding: [30, 30] });
    }
  }, [centers, active, map]);
  return null;
}

// ── Layer Switch ──────────────────────────────────────────────────────────────
function LayerToggle({ label, active, color, onChange }) {
  return (
    <label className="fulfillment-layer-toggle">
      <JetSwitch
        value={active}
        label={`${label} layer`}
        className="fulfillment-layer-toggle__switch"
        style={{
          '--oj-switch-track-bg-color-selected': color,
          '--oj-switch-track-border-color-selected': color,
          '--oj-switch-track-bg-color-selected-hover': color,
          '--oj-switch-track-border-color-selected-hover': color,
          '--oj-switch-track-bg-color-selected-active': color,
          '--oj-switch-track-border-color-selected-active': color,
        }}
        onValueChange={onChange}
      />
      <span className="fulfillment-layer-toggle__swatch" style={{ background: color }} />
      <span className="fulfillment-layer-toggle__label">{label}</span>
    </label>
  );
}

// ── Map View ──────────────────────────────────────────────────────────────────
function FulfillmentMapView({ centers, shipments, customers, zonesData, demandRegions, layers, setLayer }) {
  // H3 hexagonal density bins from customer lat/lng at resolution 4
  const h3Cells = useMemo(() => {
    if (!customers?.length) return [];
    const counts = {};
    customers.forEach(c => {
      if (!c.LATITUDE || !c.LONGITUDE) return;
      try {
        const cell = latLngToCell(parseFloat(c.LATITUDE), parseFloat(c.LONGITUDE), 4);
        counts[cell] = (counts[cell] || 0) + 1;
      } catch (_) { /* skip bad coords */ }
    });
    const maxCount = Math.max(...Object.values(counts), 1);
    return Object.entries(counts).map(([cellId, count]) => ({
      cellId,
      count,
      boundary: cellToBoundary(cellId),   // [[lat, lng], ...] native Leaflet format
      ratio: count / maxCount,
    }));
  }, [customers]);

  // Sort demand regions largest-area-first so smaller regions render on top
  // and remain hoverable/clickable even when nested inside larger ones
  const sortedDemandRegions = useMemo(() => {
    if (!demandRegions?.length) return [];
    return [...demandRegions].sort((a, b) => {
      // Approximate area from bounding box of COORDS
      const area = (coords) => {
        if (!coords?.length) return 0;
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        coords.forEach(([lat, lng]) => {
          if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
        });
        return (maxLat - minLat) * (maxLng - minLng);
      };
      return area(b.COORDS) - area(a.COORDS); // largest first -> rendered first -> behind
    });
  }, [demandRegions]);

  const zones        = zonesData?.zones  || [];
  const zonesSource  = zonesData?.source || 'virtual';

  return (
    <div className="fulfillment-map-card">
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ height: '100%', width: '100%', background: 'var(--color-surface-muted)' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/* Light ArcGIS Canvas tiles, matching the Orders route panel treatment. */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles (c) Esri - Esri, HERE, Garmin, FAO, NOAA, USGS"
          maxZoom={19}
        />

        <FitBounds centers={centers} active={layers.centers} />

        {/* ── LAYER: Audience Demand Regions (SDO_GEOMETRY polygons, colored by demand_index) ── */}
        {/* Sorted largest-area-first so smaller regions render on top and stay clickable */}
        {layers.demandRegions && sortedDemandRegions.map(r => {
          if (!r.COORDS?.length) return null;
          const { fill, stroke, opacity } = demandColor(r.DEMAND_INDEX || 50);
          const label = r.DEMAND_INDEX >= 85 ? 'Hot Market'
                      : r.DEMAND_INDEX >= 70 ? 'High Demand'
                      : r.DEMAND_INDEX >= 55 ? 'Moderate'
                      : r.DEMAND_INDEX >= 40 ? 'Low'
                      : 'Slow';
          return (
            <Polygon
              key={`dr-${r.REGION_ID}`}
              positions={r.COORDS}
              pathOptions={{ fillColor: fill, fillOpacity: opacity, color: stroke, weight: 2.0, opacity: 0.85 }}
            >
              <Tooltip sticky className="demand-tooltip">
                <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 200, padding: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, borderBottom: '1px solid rgba(49,45,42,0.12)', paddingBottom: 5 }}>
                    {r.REGION_NAME}
                    <span style={{ fontSize: 10, color: '#697778', marginLeft: 6, textTransform: 'capitalize' }}>{r.REGION_TYPE}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px' }}>
                    <span style={{ color: '#697778' }}>Demand Index</span>
                    <span style={{ color: fill, fontWeight: 700, fontSize: 13 }}>{r.DEMAND_INDEX} - {label}</span>
                    <span style={{ color: '#697778' }}>Population</span>
                    <span>{r.POPULATION ? (r.POPULATION / 1e6).toFixed(1) + 'M' : '-'}</span>
                    <span style={{ color: '#697778' }}>Avg Income</span>
                    <span>${r.AVG_INCOME ? Number(r.AVG_INCOME).toLocaleString() : '-'}</span>
                    <span style={{ color: '#697778' }}>Social Density</span>
                    <span>{r.SOCIAL_DENSITY}/1k pop</span>
                    {r.AVG_7DAY_FORECAST && <>
                      <span style={{ color: '#697778' }}>7-Day Forecast</span>
                      <span style={{ color: '#AA643B' }}>{Number(r.AVG_7DAY_FORECAST).toLocaleString()} units/day</span>
                    </>}
                    {r.PEAK_SOCIAL_FACTOR && <>
                      <span style={{ color: '#697778' }}>Peak Social x</span>
                      <span style={{ color: '#796087' }}>{r.PEAK_SOCIAL_FACTOR}x</span>
                    </>}
                    {r.FORECAST_PRODUCTS > 0 && <>
                      <span style={{ color: '#697778' }}>Content assets tracked</span>
                      <span>{r.FORECAST_PRODUCTS}</span>
                    </>}
                  </div>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* ── LAYER: Rights Coverage Zones (dashed coverage rings around operations hubs) ── */}
        {layers.zones && zones.map((z, i) => {
          const style = ZONE_STYLES[z.ZONE_TYPE] || ZONE_STYLES.standard;
          if (!z.RADIUS_KM || !z.LATITUDE || !z.LONGITUDE) return null;
          return (
            <Circle
              key={`zone-${z.CENTER_ID}-${z.ZONE_TYPE}-${i}`}
              center={[z.LATITUDE, z.LONGITUDE]}
              radius={z.RADIUS_KM * 1000}
              pathOptions={{
                color:       style.color,
                fillColor:   style.color,
                fillOpacity: style.fillOpacity,
                weight:      style.weight,
                dashArray:   style.dashArray,
              }}
            >
              <Tooltip sticky>
                <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                  <strong>{z.CENTER_NAME}</strong><br />
                  <span style={{ color: style.color }}>{zoneTypeLabel(z.ZONE_TYPE)}</span>
                    {' '}coverage tier - {'<='}{z.RADIUS_KM} km - {z.MAX_DELIVERY_HRS}h live-event response
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* ── LAYER: H3 Density Grid (hexagonal customer density heatmap) ── */}
        {layers.h3 && h3Cells.map(cell => {
          const { fill, stroke, opacity } = h3HeatColor(cell.ratio);
          return (
            <Polygon
              key={cell.cellId}
              positions={cell.boundary}
              pathOptions={{
                fillColor:   fill,
                fillOpacity: opacity,
                color:       stroke,
                weight:      1.2,
                opacity:     0.85,
              }}
            >
              <Tooltip sticky>
                <div style={{ fontSize: 11 }}>
                  <strong>{cell.count}</strong> audience accounts<br />
                  <span style={{ color: fill }}>
                    {cell.ratio > 0.75 ? 'Very High' :
                     cell.ratio > 0.50 ? 'High' :
                     cell.ratio > 0.25 ? 'Medium' :
                     cell.ratio > 0.10 ? 'Low' : 'Sparse'} density
                  </span>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* ── LAYER: Live Event Activation Paths (polylines colored by operator) ── */}
        {layers.routes && (shipments || []).map(s => {
          if (!s.CENTER_LAT || !s.CUSTOMER_LAT) return null;
          return (
            <Polyline
              key={s.SHIPMENT_ID}
              positions={[[s.CENTER_LAT, s.CENTER_LON], [s.CUSTOMER_LAT, s.CUSTOMER_LON]]}
              color={routeProviderColor(s.CARRIER)}
              weight={2}
              opacity={0.65}
            />
          );
        })}

        {/* LAYER: Audience Segments (small dots colored by segment) */}
        {layers.customers && (customers || []).map((c, i) => {
          if (!c.LATITUDE || !c.LONGITUDE) return null;
          const color  = TIER_COLORS[c.CUSTOMER_TIER] || TIER_COLORS.standard;
          const radius = c.CUSTOMER_TIER === 'vip' ? 5 :
                         c.CUSTOMER_TIER === 'preferred' ? 4 : 3;
          return (
            <CircleMarker
              key={`cust-${i}`}
              center={[c.LATITUDE, c.LONGITUDE]}
              radius={radius}
              pathOptions={{ fillColor: color, fillOpacity: 0.85, color: '#fff', weight: 1 }}
            >
              <Tooltip sticky>
                <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                  <strong style={{ color }}>{c.CUSTOMER_TIER?.toUpperCase()}</strong>
                  {'  -  '}{c.CITY}, {c.STATE_PROVINCE}<br />
                  LTV: {formatCurrency(c.LIFETIME_VALUE)}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* ── LAYER: Coverage Operations Hubs (large markers with popups) ── */}
        {layers.centers && (centers || []).map(c => (
          <CircleMarker
            key={c.CENTER_ID}
            center={[c.LATITUDE, c.LONGITUDE]}
            radius={centerRadius(c.TOTAL_UNITS)}
            className="media-center-marker"
            pathOptions={{
              fillColor:   centerColor(c.CENTER_TYPE),
              fillOpacity: 0.9,
              color:       'rgba(255,255,255,0.45)',
              weight:      2,
            }}
          >
            <Popup>
              <div style={{ minWidth: 165, fontFamily: 'DM Sans, sans-serif' }}>
                <p style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{c.CENTER_NAME}</p>
                <p style={{ color: '#697778', fontSize: 11, marginBottom: 6 }}>{c.CITY}, {c.STATE_PROVINCE}</p>
                <span style={{
                  display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 10,
                  background: `${centerColor(c.CENTER_TYPE)}22`,
                  color: 'var(--color-text)',
                  marginBottom: 8, textTransform: 'capitalize',
                  border: `1px solid ${centerColor(c.CENTER_TYPE)}44`,
                }}>
                  {centerTypeLabel(c.CENTER_TYPE)}
                </span>
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  <div><span style={{ color: '#697778' }}>Content assets: </span>{formatNumber(c.PRODUCTS_STOCKED)}</div>
                  <div><span style={{ color: '#697778' }}>Capacity: </span>{formatNumber(c.TOTAL_UNITS)} units</div>
                  <div><span style={{ color: '#697778' }}>Pending: </span>{c.PENDING_SHIPMENTS} activations</div>
                  <div><span style={{ color: '#697778' }}>Load: </span>{c.CURRENT_LOAD_PCT}%</div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Layer Control Panel (top-left overlay) ── */}
      <div
        className="fulfillment-layer-panel"
      >
        <p className="fulfillment-layer-panel__title">
          <JetGlyph iconClass="oj-fwk-icon-filter" className="fulfillment-layer-panel__glyph" /> Map Layers
        </p>
        {LAYER_DEFS.map(def => (
          <LayerToggle
            key={def.key}
            label={def.label}
            active={layers[def.key]}
            color={def.color}
            onChange={(value) => setLayer(def.key, value)}
          />
        ))}
      </div>

      {/* ── Dynamic Legend (bottom-left) ── */}
      <div className="absolute bottom-4 left-4 z-[1000] text-[10px] bg-[var(--color-surface)]/90 px-3 py-2 rounded-lg border border-[var(--color-border)] pointer-events-none space-y-1.5"
           style={{ color: 'var(--color-text-dim)', maxWidth: 420 }}>
        {layers.centers && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-ocean inline-block" /> Rights Desk</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-pine inline-block" /> Studio Ops Hub</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> Live Event Desk</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> Regional Coverage Desk</span>
          </div>
        )}
        {layers.customers && (
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(TIER_COLORS).map(([tier, color]) => (
              <span key={tier} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                <span className="capitalize">{tier}</span>
              </span>
            ))}
          </div>
        )}
        {layers.h3 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="mr-1">H3 Density:</span>
            {[['#C74634','High'],['#AA643B',''],['#AA643B',''],['#5F7D4F',''],['#4C825C','Low']].map(([c, l], i) => (
              <span key={i} className="flex items-center gap-0.5">
                <span className="w-3 h-3 rounded-sm inline-block opacity-80" style={{ background: c }} />
                {l && <span className="text-[9px]">{l}</span>}
              </span>
            ))}
          </div>
        )}
        {layers.zones && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
                <span className="inline-block w-5 border-t-2 border-brand-red border-dashed" /> Premiere {'<='}80 km
            </span>
            <span className="flex items-center gap-1">
                <span className="inline-block w-5 border-t-2 border-brand-sienna border-dashed" /> Standard {'<='}250 km
            </span>
            <span className="flex items-center gap-1">
                <span className="inline-block w-5 border-t-2 border-brand-pine border-dashed" /> Extended {'<='}500 km
            </span>
          </div>
        )}
        {layers.routes && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-plum inline-block" /> StreamOps</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-sienna inline-block" /> StudioFleet</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-ocean inline-block" /> ArenaLink</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-red inline-block" /> RightsRelay</span>
          </div>
        )}
        {layers.demandRegions && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-1">Demand Index:</span>
            {[['#C74634','≥85 Hot'],['#AA643B','≥70'],['#AA643B','≥55'],['#5F7D4F','≥40'],['#4C825C','Low']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block opacity-80" style={{ background: c }} />
                <span className="text-[9px]">{l}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Spatial Attribution (top-right) ── */}
      <div className="absolute top-4 right-4 z-[1000] text-[10px] bg-[var(--color-surface)]/90 px-3 py-2 rounded-lg border border-[var(--color-border)] pointer-events-none space-y-0.5 text-right">
        <div><span className="tone-teal">SDO_GEOMETRY</span> coverage planning</div>
        {layers.h3 && (
          <div><span className="tone-sienna">H3 res-4</span>  -  {h3Cells.length} hexagons  -  {customers?.length ?? 0} audience accounts</div>
        )}
        {layers.zones && (
          <div style={{ color: zonesSource === 'database' ? '#4C825C' : '#AA643B' }}>
            Coverage zones: {zonesSource === 'database' ? 'Oracle SDO_BUFFER' : 'derived from operations hubs'}
          </div>
        )}
        {layers.demandRegions && (
          <div><span className="tone-sienna">SDO_UTIL.TO_GEOJSON</span>  -  {(demandRegions || []).length} regions</div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FulfillmentMap() {
  const { currentUser, ROLE_META } = useUser();
  const [layers, setLayers] = useState({
    centers:       false,
    routes:        false,
    zones:         false,
    customers:     false,
    h3:            false,
    demandRegions: false,
  });
  const setLayer = (key, value) => setLayers(l => ({ ...l, [key]: value }));

  // VPD-aware: refetch when user switches (X-Demo-User header changes server-side filtering)
  const userKey = currentUser?.USERNAME;
  const {
    data: centers,
    error: centersError,
  } = useData(() => api.fulfillment.centers(), [userKey]);
  const { data: alerts }        = useData(() => api.fulfillment.alerts(), [userKey]);
  const { data: shipments }     = useData(() => api.fulfillment.shipments({ limit: 30 }), [userKey]);
  const { data: customers }     = useData(() => api.fulfillment.customers(), [userKey]);
  const { data: zonesData }     = useData(() => api.fulfillment.zones(), [userKey]);
  const { data: demandRegions } = useData(() => api.fulfillment.demandRegions(), [userKey]);
  const proofLatitude = customers?.[0]?.LATITUDE;
  const proofLongitude = customers?.[0]?.LONGITUDE;
  const { data: spatialProof, error: spatialProofError } = useData(
    () => (proofLatitude != null && proofLongitude != null
      ? api.fulfillment.nearest({
        lat: proofLatitude,
        lon: proofLongitude,
        maxResults: 3,
      })
      : Promise.resolve(null)),
    [userKey, proofLatitude, proofLongitude]
  );
  const representativeResult = spatialProof?.representativeResult || null;

  const totalUnits      = (centers || []).reduce((s, c) => s + (c.TOTAL_UNITS      || 0), 0);
  const pendingShipments = (centers || []).reduce((s, c) => s + (c.PENDING_SHIPMENTS || 0), 0);

  return (
    <div className="space-y-6 fade-in">

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Rights, Capacity & Live Event Coverage">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every coverage operations hub, rights coverage zone, audience address, and demand region is stored as an{' '}
              <span className="tone-pine font-mono">SDO_GEOMETRY</span> point or polygon.
              Oracle Spatial's <span className="tone-pine font-mono">SDO_NN()</span> selects indexed nearest-neighbor
              candidates and <span className="tone-pine font-mono">SDO_GEOM.SDO_DISTANCE()</span> ranks them
              in a single SQL - no external coverage-planning service.
              Rights Coverage Zones use <span className="tone-sienna font-mono">SDO_BUFFER</span> circular polygons.
              Demand regions are Oracle <span className="tone-sienna font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="tone-sienna font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs tone-plum mx-1">demand_forecasts</code> table.
              Audience density is binned client-side via{' '}
              <span className="tone-sienna font-mono">h3-js</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="SDO_GEOMETRY" color="green" />
            <FeatureBadge label="SDO_GEOM.SDO_DISTANCE" color="green" />
            <FeatureBadge label="SDO_BUFFER (Zones)" color="yellow" />
            <FeatureBadge label="Spatial Index (R-Tree)" color="blue" />
            <FeatureBadge label="WGS-84 Geodetic" color="cyan" />
            <FeatureBadge label="SDO_NN (Nearest Neighbor)" color="orange" />
            <FeatureBadge label="H3 Hexagonal Grid" color="orange" />
            <FeatureBadge label="SDO_UTIL.TO_GEOJSON" color="orange" />
            <FeatureBadge label="demand_regions" color="red" />
            <FeatureBadge label="demand_forecasts" color="red" />
            <FeatureBadge label="audience_segment" color="purple" />
          </div>
          <SqlBlock code={`-- Nearest rights or event operations hub with available capacity
SELECT fc.center_name, fc.city,
       ROUND(SDO_GEOM.SDO_DISTANCE(
         c.location, fc.location, 0.005, 'unit=KM'), 2) AS dist_km,
       i.quantity_on_hand
FROM   customers c
CROSS  JOIN fulfillment_centers fc
JOIN   inventory i
          ON  i.center_id  = fc.center_id
          AND i.product_id = :product_id
WHERE  c.customer_id = :customer_id
  AND  fc.is_active  = 1
  AND  i.quantity_on_hand > i.quantity_reserved
  AND  SDO_NN(fc.location, c.location, 'sdo_num_res=12') = 'TRUE'
ORDER  BY dist_km
FETCH FIRST 3 ROWS ONLY;`} />
          <SqlBlock code={`-- Demand regions: Oracle SDO_GEOMETRY -> GeoJSON
-- SDO_UTIL.TO_GEOJSON converts polygon boundary for frontend rendering
SELECT r.region_name, r.demand_index,
       TO_CHAR(SDO_UTIL.TO_GEOJSON(r.boundary)) AS geojson,
       AVG(df.predicted_demand)  AS avg_7day_forecast,
       MAX(df.social_factor)     AS peak_social_factor
FROM   demand_regions r
LEFT JOIN demand_forecasts df
       ON UPPER(df.region) = UPPER(r.region_name)
      AND df.forecast_date BETWEEN TRUNC(SYSDATE)
                               AND TRUNC(SYSDATE) + 7
GROUP BY r.region_id, r.region_name,
         r.demand_index, r.boundary
ORDER BY r.demand_index DESC;`} />
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed mb-2">
              Oracle <span className="tone-red font-mono">DBMS_RLS</span> applies a row-level security policy
              to <code className="text-xs tone-teal mx-1">FULFILLMENT_CENTERS</code>. When a user is set via{' '}
              <span className="tone-sienna font-mono">MEDIA_SECURITY_PKG.set_user_context()</span>, Oracle
              transparently appends a WHERE clause - coverage managers see only their regional coverage hubs,
              while admins and analysts see all rows. <strong>Zero application SQL changes required.</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS Policy" color="red" />
            <FeatureBadge label="VPD (Row-Level Security)" color="red" />
            <FeatureBadge label="MEDIA_APP_CTX" color="yellow" />
            <FeatureBadge label="SYS_CONTEXT" color="yellow" />
          </div>
          <SqlBlock code={`-- VPD: Set user context before every query
BEGIN media_security_pkg.set_user_context('fm_west_maria'); END;

-- The shared scene policy function is transparent to app SQL:
-- vpd_media_rows() returns the predicate for the authenticated
-- role, region and scene object.

-- Separate SELECT and DML policies are attached:
DBMS_RLS.ADD_POLICY(
  object_name   => 'FULFILLMENT_CENTERS',
  policy_name   => 'VPD_MEDIA_SELECT',
  function_schema => USER,
  policy_function => 'VPD_MEDIA_ROWS',
  statement_types => 'SELECT'
);`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Spatial Layer Architecture</p>
            <div className="space-y-1">
              <DiagramBox label="Coverage Operations Hubs" sub="SDO_GEOMETRY points  -  R-Tree index" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Rights Coverage Zones" sub="SDO_BUFFER circular polygons  -  3 tiers" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Audience Segments" sub="new  -  standard  -  preferred  -  vip" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="H3 Density Grid" sub="Uber H3 res-4  -  demand heatmap" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Audience Demand Regions" sub="SDO_GEOMETRY polygons  -  demand_index 0-100  -  forecast join" color="#C74634" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(76,130,92,0.06)', border: '1px dashed rgba(76,130,92,0.25)' }}>
              <p className="text-[9px] text-[var(--color-text)]">
                Geometry and its R-tree index remain in Oracle; the API returns exact current-generation cursor evidence.
              </p>
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" className="fulfillment-page-glyph tone-teal" /> Rights, Capacity &amp; Live Event Coverage
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Coordinate Midnight Harbor premiere coverage across streaming rights windows, regional audience demand, live-event markets, and partner activations using <span className="tone-teal">Oracle Spatial</span>.
        </p>
      </div>

      <SceneStoryPanel scene="fulfillment" />

      {centersError && (
        <div
          className="glass-card p-4"
          role="alert"
          data-testid="fulfillment-vpd-unavailable"
          style={{ borderLeft: '3px solid var(--color-danger)' }}
        >
          <p className="text-sm font-semibold tone-red">
            VPD-governed coverage data is unavailable
          </p>
          <p className="text-xs text-[var(--color-text-dim)] mt-1">
            {centersError.message}
          </p>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="fulfillment-kpi-grid">
        <CoverageKpiCard
          iconClass="oj-fwk-icon-grid"
          color="#437C94"
          badge="Launch footprint"
          value={(centers || []).length}
          label="Coverage Operations Hubs"
          meta="Regional rights, studio ops, and live-event desks"
        />
        <CoverageKpiCard
          iconClass="oj-fwk-icon-view"
          color="#4C825C"
          badge="Rights pool"
          value={formatNumber(totalUnits)}
          label="Available Rights Capacity"
          meta="Capacity units available for launch windows"
        />
        <CoverageKpiCard
          iconClass="oj-fwk-icon-tree-document"
          color="#AA643B"
          badge="Live activations"
          value={formatNumber(pendingShipments)}
          label="Pending Activations"
          meta="Campaign requests awaiting coverage action"
        />
        <CoverageKpiCard
          iconClass="oj-fwk-icon-message-warning"
          color="#C74634"
          badge="At-risk markets"
          value={(alerts || []).length}
          label="Capacity Alerts"
          meta="Audience surges requiring operator attention"
        />
      </div>

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isFM = currentUser.ROLE === 'fulfillment_mgr';
        const isGlobal = currentUser.ROLE === 'admin' || currentUser.ROLE === 'analyst';
        return (
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
            style={{ background: `${roleMeta.color}10`, border: `1px solid ${roleMeta.color}25` }}
          >
            <JetGlyph iconClass="oj-fwk-icon-info" className="fulfillment-vpd-glyph" style={{ color: roleMeta.color }} />
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
                  ? `Filtered to ${currentUser.REGION} - ${(centers || []).length} coverage hub${(centers || []).length !== 1 ? 's' : ''} visible`
                  : `${(centers || []).length} coverage hubs visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <JetGlyph iconClass="oj-fwk-icon-view" className="fulfillment-vpd-access-glyph" />
              VPD {isFM ? 'region-filtered' : isGlobal ? 'global read' : 'restricted'}
            </div>
          </div>
        );
      })()}

      {(spatialProof?.evidence || spatialProofError) && (
        <div className="glass-card p-4">
          <p className="text-xs font-semibold text-[var(--color-text)]">
            Current-generation Oracle Spatial execution
          </p>
          {spatialProof?.evidence ? (
            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
              <span>Generation: <strong>{spatialProof.evidence.generationId}</strong></span>
              <span>Cursor: <strong>{spatialProof.evidence.sqlId}/{spatialProof.evidence.childNumber}</strong></span>
              <span>Plan: <strong>{[spatialProof.evidence.operation, spatialProof.evidence.options]
                .filter(Boolean).join(' ')} {spatialProof.evidence.objectName}</strong></span>
              <span>Plan hash: <strong>{spatialProof.evidence.planHashValue}</strong></span>
              <span>Result rows: <strong>{spatialProof.evidence.resultRowCount}</strong></span>
              <span>
                Binding: <strong>{spatialProof.evidence.expectedIndexName}</strong>
                {' -> '}
                <strong>{spatialProof.evidence.expectedTableName}</strong>
              </span>
              {representativeResult ? (
                <span>
                  Representative result: center <strong>{representativeResult.centerId}</strong>
                  {' at '}
                  <strong>{representativeResult.distanceKm} km</strong>
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-danger)]">
              Oracle Spatial cursor evidence is unavailable for this generation.
            </p>
          )}
        </div>
      )}

      {/* ── Leaflet Map ── */}
      <FulfillmentMapView
        centers={centers}
        shipments={shipments}
        customers={customers}
        zonesData={zonesData}
        demandRegions={demandRegions}
        layers={layers}
        setLayer={setLayer}
      />

      {/* ── Coverage Operations Hubs Table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Rights &amp; Live Event Hubs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Operations Hub</th>
                <th className="text-left py-2 px-3">Location</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-right py-2 px-3">Content Assets</th>
                <th className="text-right py-2 px-3">Available Rights Capacity</th>
                <th className="text-right py-2 px-3">Pending Activations</th>
                <th className="text-right py-2 px-3">Load</th>
              </tr>
            </thead>
            <tbody>
              {(centers || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--color-text-dim)]">
                    No coverage hubs available for this persona
                  </td>
                </tr>
              ) : (centers || []).map(c => (
                <tr key={c.CENTER_ID} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)]">
                  <td className="py-2 px-3 font-medium">{c.CENTER_NAME}</td>
                  <td className="py-2 px-3 text-[var(--color-text-dim)]">{c.CITY}, {c.STATE_PROVINCE}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: `${centerColor(c.CENTER_TYPE)}18`,
                        color: 'var(--color-text)',
                        border: `1px solid ${centerColor(c.CENTER_TYPE)}30`,
                      }}>
                      {centerTypeLabel(c.CENTER_TYPE)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">{formatNumber(c.PRODUCTS_STOCKED)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(c.TOTAL_UNITS)}</td>
                  <td className="py-2 px-3 text-right">{c.PENDING_SHIPMENTS}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={c.CURRENT_LOAD_PCT > 85 ? 'tone-red' : c.CURRENT_LOAD_PCT > 65 ? 'tone-sienna' : 'tone-pine'}>
                      {c.CURRENT_LOAD_PCT}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capacity Alerts */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" /> Rights and Capacity Alerts - Audience Surge
          </h3>
          <div className="space-y-2">
            {(alerts || []).slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg surface-red-soft border border-red-soft">
                <div>
                  <span className="font-medium text-sm">{a.PRODUCT_NAME}</span>
                  <span className="text-[var(--color-text-dim)] text-xs ml-2">{a.BRAND_NAME}  -  {a.CENTER_NAME}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={isCriticalCapacityStatus(a.STOCK_STATUS) ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text)]'}>
                    {a.QUANTITY_ON_HAND} capacity units available
                  </span>
                  <span className="text-[var(--color-text-dim)]">Need: {a.PREDICTED_DEMAND}</span>
                  <span className="text-[var(--color-text)]">Social: {a.SOCIAL_FACTOR}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
