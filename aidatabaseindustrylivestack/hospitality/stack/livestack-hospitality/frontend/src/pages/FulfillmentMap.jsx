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
import { SceneStoryPanel } from '../components/HospitalityStory';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { JetSelectSingle, JetSwitch } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const CARRIER_COLORS = { RoomReady: '#796087', CrewLink: '#8A4E2F', MaintTrack: '#4F7D7B', 'GuestRoute': '#A73529' };

const TIER_COLORS = {
  vip:       '#796087',
  preferred: '#8A4E2F',
  standard:  '#437C94',
  new:       '#7A736E',
};

const ZONE_STYLES = {
  express:   { color: '#A73529', fillOpacity: 0.15, weight: 2.0, dashArray: '4 4' },
  overnight: { color: '#8A4E2F', fillOpacity: 0.12, weight: 1.8, dashArray: '5 4' },
  standard:  { color: '#8A4E2F', fillOpacity: 0.10, weight: 1.5, dashArray: '6 5' },
  economy:   { color: '#3E6F4D', fillOpacity: 0.07, weight: 1.0, dashArray: '8 6' },
};

const LAYER_DEFS = [
  { key: 'guests',     label: 'Guest Segments',          color: '#3E6F4D' },
  { key: 'centers',       label: 'Property Hotels',       color: '#437C94' },
  { key: 'routes',        label: 'Case Routes',          color: '#796087' },
  { key: 'zones',         label: 'Service SLA Coverage', color: '#8A4E2F' },
  { key: 'h3',            label: 'Guest Service Demand', color: '#A73529' },
  { key: 'demandRegions', label: 'Service Pressure Regions', color: '#8A4E2F' },
];

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

function FulfillmentStatCard({ iconClass, toneClass, value, label }) {
  return (
    <div className="stat-card fulfillment-stat-card">
      <div className="fulfillment-stat-card__copy">
        <p className="fulfillment-stat-card__value">{value}</p>
        <p className="fulfillment-stat-card__label">{label}</p>
      </div>
      <div className={`fulfillment-stat-card__glyph ${toneClass}`}>
        <JetGlyph iconClass={iconClass} className="fulfillment-stat-card__glyph-icon" />
      </div>
    </div>
  );
}

function NearestCenterPanel({
  guestOptions,
  productOptions,
  selectedguestId,
  selectedProductId,
  nearestCenters,
  loading,
  error,
  onguestChange,
  onProductChange,
}) {
  const hasSelections = Boolean(selectedguestId && selectedProductId);

  return (
    <div className="glass-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-locator" className="tone-teal" />
            Nearest Property Hotel
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FeatureBadge label="find_nearest_centers" color="green" />
            <FeatureBadge label="distance_km" color="blue" />
            <FeatureBadge label="estimated_hours" color="orange" />
          </div>
        </div>
        <div className="grid w-full gap-3 md:grid-cols-2 lg:max-w-2xl">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Guest</p>
            <JetSelectSingle
              value={selectedguestId}
              options={guestOptions}
              placeholder="Select guest"
              className="w-full"
              disabled={!guestOptions.length}
              onValueChange={onguestChange}
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Room Type</p>
            <JetSelectSingle
              value={selectedProductId}
              options={productOptions}
              placeholder="Select room type"
              className="w-full"
              disabled={!productOptions.length}
              onValueChange={onProductChange}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {!hasSelections ? (
          <div className="lg:col-span-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-dim)]">
            Loading lookup data...
          </div>
        ) : loading ? (
          <div className="lg:col-span-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-dim)]">
            Finding nearest hotels...
          </div>
        ) : error ? (
          <div className="lg:col-span-3 rounded-lg border border-red-soft surface-red-soft p-4 text-sm text-[var(--color-text)]">
            {error}
          </div>
        ) : (nearestCenters || []).length === 0 ? (
          <div className="lg:col-span-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-dim)]">
            No hotel has available service capacity for this selection.
          </div>
        ) : (
          nearestCenters.map((center, index) => (
            <div
              key={center.CENTER_ID}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
                    Rank {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{center.CENTER_NAME}</p>
                  <p className="text-xs text-[var(--color-text-dim)]">{center.CITY}, {center.STATE_PROVINCE}</p>
                </div>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{
                    background: `${centerColor(center.CENTER_TYPE)}18`,
                    border: `1px solid ${centerColor(center.CENTER_TYPE)}30`,
                    color: 'var(--color-text)',
                  }}
                >
                  {centerTypeLabel(center.CENTER_TYPE)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Distance</p>
                  <p className="font-semibold">{center.DISTANCE_KM} km</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">SLA</p>
                  <p className="font-semibold">{center.ESTIMATED_HOURS} hrs</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Capacity</p>
                  <p className="font-semibold">{formatNumber(center.QUANTITY_ON_HAND)}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function centerColor(type) {
  if (type === 'Convention Hotel' || type === 'Regional Processing' || type === 'distribution') return '#437C94';
  if (type === 'Full-Service Hotel' || type === 'Enterprise Operations' || type === 'warehouse') return '#3E6F4D';
  return '#8A4E2F';
}

function centerTypeLabel(type) {
  if (type === 'Convention Hotel' || type === 'Regional Processing' || type === 'distribution') return 'Convention Hotel';
  if (type === 'Full-Service Hotel' || type === 'Enterprise Operations' || type === 'warehouse') return 'Full-Service Hotel';
  if (type === 'Select-Service Hotel' || type === 'Select-Service Property' || type === 'Property Services' || type === 'micro' || type === 'store') return 'Select-Service Hotel';
  if (type === 'Resort Property') return 'Resort Property';
  if (type === 'Extended-Stay Hotel') return 'Extended-Stay Hotel';
  if (type === 'drop_ship' || type === 'Partner Property') return 'Partner Property';
  return type || 'Property Hotel';
}

function centerRadius(units) {
  if (units > 100000) return 20;
  if (units > 50000)  return 15;
  if (units > 20000)  return 11;
  return 8;
}

// Service-pressure region color scale: high demand_index -> red, low -> green.
function demandColor(index) {
  if (index >= 85) return { fill: '#A73529', stroke: '#A73529', opacity: 0.42 };
  if (index >= 70) return { fill: '#8A4E2F', stroke: '#8A4E2F', opacity: 0.35 };
  if (index >= 55) return { fill: '#8A4E2F', stroke: '#8A4E2F', opacity: 0.28 };
  if (index >= 40) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.22 };
  return                  { fill: '#3E6F4D', stroke: '#3E6F4D', opacity: 0.18 };
}

// Heat-color scale: high density → red, low → green (Redwood palette, aerial map)
function h3HeatColor(ratio) {
  if (ratio > 0.75) return { fill: '#A73529', stroke: '#A73529', opacity: 0.60 };
  if (ratio > 0.50) return { fill: '#8A4E2F', stroke: '#8A4E2F', opacity: 0.50 };
  if (ratio > 0.25) return { fill: '#8A4E2F', stroke: '#8A4E2F', opacity: 0.42 };
  if (ratio > 0.10) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.35 };
  return                    { fill: '#3E6F4D', stroke: '#3E6F4D', opacity: 0.28 };
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
function FulfillmentMapView({ centers, shipments, guests, zonesData, demandRegions, layers, setLayer }) {
  // H3 hexagonal density bins from guest lat/lng at resolution 4
  const h3Cells = useMemo(() => {
    if (!guests?.length) return [];
    const counts = {};
    guests.forEach(c => {
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
      boundary: cellToBoundary(cellId),   // [[lat, lng], ...] - native Leaflet format
      ratio: count / maxCount,
    }));
  }, [guests]);

  // Sort service-pressure regions largest-area-first so smaller regions render on top.
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
      return area(b.COORDS) - area(a.COORDS); // largest first → rendered first → behind
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
          attribution="Tiles &copy; Esri - Esri, HERE, Gseasonal-ratein, FAO, NOAA, USGS"
          maxZoom={19}
        />

        <FitBounds centers={centers} active={layers.centers} />

        {/* LAYER: Service Pressure Regions (SDO_GEOMETRY polygons, colored by demand_index) */}
        {/* Sorted largest-area-first so smaller regions render on top and stay clickable */}
        {layers.demandRegions && sortedDemandRegions.map(r => {
          if (!r.COORDS?.length) return null;
          const { fill, stroke, opacity } = demandColor(r.DEMAND_INDEX || 50);
          const label = r.DEMAND_INDEX >= 85 ? 'Critical Pressure'
                      : r.DEMAND_INDEX >= 70 ? 'High Pressure'
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
                    <span style={{ color: '#697778' }}>Service Pressure Index</span>
                    <span style={{ color: fill, fontWeight: 700, fontSize: 13 }}>{r.DEMAND_INDEX} - {label}</span>
                    <span style={{ color: '#697778' }}>Population</span>
                    <span>{r.POPULATION ? (r.POPULATION / 1e6).toFixed(1) + 'M' : '-'}</span>
                    <span style={{ color: '#697778' }}>Avg Income</span>
                    <span>${r.AVG_INCOME ? Number(r.AVG_INCOME).toLocaleString() : '-'}</span>
                    <span style={{ color: '#697778' }}>Signal Density</span>
                    <span>{r.SOCIAL_DENSITY}/1k pop</span>
                    {r.AVG_7DAY_FORECAST && <>
                      <span style={{ color: '#697778' }}>7-Day Forecast</span>
                      <span style={{ color: '#8A4E2F' }}>{Number(r.AVG_7DAY_FORECAST).toLocaleString()} units/day</span>
                    </>}
                    {r.PEAK_SOCIAL_FACTOR && <>
                      <span style={{ color: '#697778' }}>Peak Signal ×</span>
                      <span style={{ color: '#796087' }}>{r.PEAK_SOCIAL_FACTOR}×</span>
                    </>}
                    {r.FORECAST_PRODUCTS > 0 && <>
                      <span style={{ color: '#697778' }}>Supported Services tracked</span>
                      <span>{r.FORECAST_PRODUCTS}</span>
                    </>}
                  </div>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* ── LAYER: Service SLA Coverage (dashed response-radius rings around hotels) ── */}
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
                  <span style={{ color: style.color, textTransform: 'capitalize' }}>{z.ZONE_TYPE}</span>
                  {' '}coverage · response target {z.MAX_DELIVERY_HRS}h · radius ≤{z.RADIUS_KM} km
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* ── LAYER: Guest Service Demand (hexagonal guest demand heatmap) ── */}
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
                  <strong>{cell.count}</strong> guests<br />
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

        {/* ── LAYER: Transfer Routes (polylines colored by carrier) ── */}
        {layers.routes && (shipments || []).map(s => {
          if (!s.CENTER_LAT || !s.guest_LAT) return null;
          return (
            <Polyline
              key={s.SHIPMENT_ID}
              positions={[[s.CENTER_LAT, s.CENTER_LON], [s.guest_LAT, s.guest_LON]]}
              color={CARRIER_COLORS[s.CARRIER] || '#6F757E'}
              weight={2}
              opacity={0.65}
            />
          );
        })}

        {/* ── LAYER: Guest Segments (small dots colored by tier) ── */}
        {layers.guests && (guests || []).map((c, i) => {
          if (!c.LATITUDE || !c.LONGITUDE) return null;
          const color  = TIER_COLORS[c.GUEST_TIER] || TIER_COLORS.standard;
          const radius = c.GUEST_TIER === 'vip' ? 5 :
                         c.GUEST_TIER === 'preferred' ? 4 : 3;
          return (
            <CircleMarker
              key={`cust-${i}`}
              center={[c.LATITUDE, c.LONGITUDE]}
              radius={radius}
              pathOptions={{ fillColor: color, fillOpacity: 0.85, color: '#fff', weight: 1 }}
            >
              <Tooltip sticky>
                <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                  <strong style={{ color }}>{c.GUEST_TIER?.toUpperCase()}</strong>
                  {' · '}{c.CITY}, {c.STATE_PROVINCE}<br />
                  LTV: {formatCurrency(c.LIFETIME_VALUE)}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* ── LAYER: Property Hotels (large markers with popups) ── */}
        {layers.centers && (centers || []).map(c => (
          <CircleMarker
            key={c.CENTER_ID}
            center={[c.LATITUDE, c.LONGITUDE]}
            radius={centerRadius(c.CAPACITY_UNITS)}
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
                  <div><span style={{ color: '#697778' }}>Service Lines: </span>{c.SUPPORTED_SERVICES || formatNumber(c.PRODUCTS_AVAILABLE ?? c.PRODUCTS_STOCKED)}</div>
                  <div><span style={{ color: '#697778' }}>Room / Service Capacity: </span>{formatNumber(c.CAPACITY_UNITS)} units</div>
                  <div><span style={{ color: '#697778' }}>Occupied Rooms: </span>{c.OCCUPIED_ROOMS ?? c.PENDING_SHIPMENTS}</div>
                  <div><span style={{ color: '#697778' }}>Utilization: </span>{c.CURRENT_LOAD_PCT}%</div>
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
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-ocean inline-block" /> Convention Hotel</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-pine inline-block" /> Full-Service Hotel</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> Select-Service Hotel</span>
          </div>
        )}
        {layers.guests && (
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
            {[['#A73529','High'],['#8A4E2F',''],['#8A4E2F',''],['#5F7D4F',''],['#3E6F4D','Low']].map(([c, l], i) => (
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
              <span className="inline-block w-5 border-t-2 border-brand-red border-dashed" /> Express 8h · ≤80 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-sienna border-dashed" /> Overnight 16h · ≤160 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-sienna border-dashed" /> Standard 24h · ≤250 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-pine border-dashed" /> Economy 72h · ≤500 km
            </span>
          </div>
        )}
        {layers.routes && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-plum inline-block" /> RoomReady</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-sienna inline-block" /> CrewLink</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-ocean inline-block" /> MaintTrack</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-red inline-block" /> GuestRoute</span>
          </div>
        )}
        {layers.demandRegions && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-1">Service Pressure Index:</span>
            {[['#A73529','≥85 Hot'],['#8A4E2F','≥70'],['#8A4E2F','≥55'],['#5F7D4F','≥40'],['#3E6F4D','Low']].map(([c, l]) => (
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
        <div><span className="tone-teal">SDO_GEOMETRY</span> spatial routing</div>
        {layers.h3 && (
          <div><span className="tone-sienna">H3 res-4</span> · {h3Cells.length} hexagons · {guests?.length ?? 0} guests</div>
        )}
        {layers.zones && (
          <div style={{ color: zonesSource === 'database' ? '#3E6F4D' : '#8A4E2F' }}>
            SLA coverage: {zonesSource === 'database' ? 'Oracle SDO_BUFFER' : 'computed from hotels'}
          </div>
        )}
        {layers.demandRegions && (
          <div><span className="tone-sienna">SDO_UTIL.TO_GEOJSON</span> · {(demandRegions || []).length} regions</div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FulfillmentMap() {
  const { currentUser, ROLE_META } = useUser();
  const [selectedguestId, setSelectedguestId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [layers, setLayers] = useState({
    centers:       false,
    routes:        false,
    zones:         false,
    guests:     false,
    h3:            false,
    demandRegions: false,
  });
  const setLayer = (key, value) => setLayers(l => ({ ...l, [key]: value }));

  // VPD-aware: refetch when user switches (X-Demo-User header changes server-side filtering)
  const userKey = currentUser?.USERNAME;
  const { data: centers }       = useData(() => api.fulfillment.centers(), [userKey]);
  const { data: alerts }        = useData(() => api.fulfillment.alerts(), [userKey]);
  const { data: shipments }     = useData(() => api.fulfillment.shipments({ limit: 30 }), [userKey]);
  const { data: guests }     = useData(() => api.fulfillment.guests(), [userKey]);
  const { data: zonesData }     = useData(() => api.fulfillment.zones(), [userKey]);
  const { data: demandRegions } = useData(() => api.fulfillment.demandRegions(), [userKey]);
  const { data: products }      = useData(() => api.products.list({ limit: 50 }), []);

  const totalCapacity   = (centers || []).reduce((s, c) => s + (c.CAPACITY_UNITS   || 0), 0);
  const occupiedRooms = (centers || []).reduce((s, c) => s + (c.OCCUPIED_ROOMS ?? c.PENDING_SHIPMENTS ?? 0), 0);
  const guestOptions = useMemo(() => (guests || [])
    .filter(c => c.GUEST_ID)
    .slice(0, 100)
    .map(c => ({
      value: String(c.GUEST_ID),
      label: `Guest ${c.GUEST_ID} - ${c.CITY}, ${c.STATE_PROVINCE} (${c.GUEST_TIER || 'standard'})`,
    })), [guests]);
  const productOptions = useMemo(() => (products || [])
    .map(p => ({
      value: String(p.PRODUCT_ID),
      label: `${p.PRODUCT_NAME} - ${p.BRAND_NAME || p.CATEGORY}`,
      totalCapacity: Number(p.TOTAL_CAPACITY || 0),
    })), [products]);
  const nearestReady = Boolean(selectedguestId && selectedProductId);
  const {
    data: nearestCenters,
    loading: nearestLoading,
    error: nearestError,
  } = useData(
    () => api.fulfillment.nearest({
      guestId: selectedguestId,
      productId: selectedProductId,
      maxResults: 3,
    }),
    [selectedguestId, selectedProductId, userKey],
    { autoFetch: nearestReady, initialData: [] }
  );

  useEffect(() => {
    if (!guestOptions.length) {
      if (selectedguestId) setSelectedguestId('');
      return;
    }
    if (!selectedguestId || !guestOptions.some(option => option.value === selectedguestId)) {
      setSelectedguestId(guestOptions[0].value);
    }
  }, [guestOptions, selectedguestId]);

  useEffect(() => {
    if (!productOptions.length) {
      if (selectedProductId) setSelectedProductId('');
      return;
    }
    if (!selectedProductId || !productOptions.some(option => option.value === selectedProductId)) {
      const defaultProduct = productOptions.find(option => option.totalCapacity > 0) || productOptions[0];
      setSelectedProductId(defaultProduct.value);
    }
  }, [productOptions, selectedProductId]);

  return (
    <div className="space-y-6 fade-in">

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Guest Service Coverage">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every Hospitality LiveStack property hotel, service SLA coverage ring, guest address, and service-pressure region is stored as an{' '}
              <span className="tone-pine font-mono">SDO_GEOMETRY</span> point or polygon.
              The <span className="tone-pine font-mono">find_nearest_centers</span> database function uses
              Oracle Spatial's <span className="tone-pine font-mono">SDO_GEOM.SDO_DISTANCE()</span> to rank
              property hotels by proximity - no external routing API.
              Service SLA coverage uses <span className="tone-sienna font-mono">SDO_BUFFER</span> response-radius
              polygons around each hotel for housekeeping and maintenance routing targets.
              Service-pressure regions are Oracle <span className="tone-sienna font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="tone-sienna font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs tone-plum mx-1">demand_forecasts</code> table.
              The H3 layer bins guest density guest-side via{' '}
              <span className="tone-sienna font-mono">h3-js</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="SDO_GEOMETRY" color="green" />
            <FeatureBadge label="SDO_GEOM.SDO_DISTANCE" color="green" />
            <FeatureBadge label="SDO_BUFFER (SLA Coverage)" color="yellow" />
            <FeatureBadge label="Spatial Index (R-Tree)" color="blue" />
            <FeatureBadge label="WGS-84 Geodetic" color="cyan" />
            <FeatureBadge label="SDO_NN (Nearest Neighbor)" color="orange" />
            <FeatureBadge label="H3 Hexagonal Grid" color="orange" />
            <FeatureBadge label="SDO_UTIL.TO_GEOJSON" color="orange" />
            <FeatureBadge label="demand_regions" color="red" />
            <FeatureBadge label="demand_forecasts" color="red" />
            <FeatureBadge label="guest_tier" color="purple" />
          </div>
          <SqlBlock code={`-- Run as LIVESTACK. Return a visible result set in SQLcl or SQL Developer.
DECLARE
  nearest_centers SYS_REFCURSOR;
  guest_id NUMBER;
  room_type_id NUMBER;
BEGIN
  hospitality_security_pkg.set_user_context('admin_ava');
  SELECT MIN(guest_id) INTO guest_id FROM guests;
  SELECT MIN(product_id) INTO room_type_id FROM products WHERE is_active = 1;
  nearest_centers := find_nearest_centers(guest_id, room_type_id, 3);
  DBMS_SQL.RETURN_RESULT(nearest_centers);
END;
/

-- find_nearest_centers returns latitude, longitude, distance_km,
-- estimated_hours, and orders by raw SDO_GEOM.SDO_DISTANCE(..., 'unit=KM')`} />
          <SqlBlock code={`-- Service-pressure regions: Oracle SDO_GEOMETRY -> GeoJSON
-- SDO_UTIL.TO_GEOJSON converts polygon boundary for frontend rendering
BEGIN hospitality_security_pkg.set_user_context('admin_ava'); END;
/

SELECT r.region_name, r.demand_index,
       TO_CHAR(SDO_UTIL.TO_GEOJSON(r.boundary)) AS geojson,
       (SELECT ROUND(AVG(df.predicted_demand), 0)
        FROM demand_forecasts df
        WHERE UPPER(df.region) = UPPER(r.region_name)
          AND df.forecast_date BETWEEN TRUNC(SYSDATE)
                                   AND TRUNC(SYSDATE) + 7
       ) AS avg_7day_forecast,
       (SELECT ROUND(MAX(df.social_factor), 2)
        FROM demand_forecasts df
        WHERE UPPER(df.region) = UPPER(r.region_name)
          AND df.forecast_date BETWEEN TRUNC(SYSDATE)
                                   AND TRUNC(SYSDATE) + 7
       ) AS peak_signal_factor
FROM demand_regions r
ORDER BY r.demand_index DESC;`} />
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed mb-2">
              Oracle <span className="tone-red font-mono">DBMS_RLS</span> applies a row-level security policy
              to <code className="text-xs tone-teal mx-1">FULFILLMENT_CENTERS</code>. When a user is set via{' '}
              <span className="tone-sienna font-mono">hospitality_security_pkg.set_user_context()</span>, Oracle
              transparently appends a WHERE clause - property service managers see only their assigned-state hotels,
              while admins and analysts see all rows. <strong>Zero application SQL changes required.</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS Policy" color="red" />
            <FeatureBadge label="VPD (Row-Level Security)" color="red" />
            <FeatureBadge label="HOSPITALITY_APP_CTX" color="yellow" />
            <FeatureBadge label="SYS_CONTEXT" color="yellow" />
          </div>
          <SqlBlock code={`-- VPD: set a regional operations identity, then inspect the active policy.
BEGIN hospitality_security_pkg.set_user_context('ops_west_maria'); END;
/

-- The VPD policy function (transparent to app SQL):
-- HOSPITALITY_VPD_CENTERS() returns:
--   fulfillment_mgr → 'state_province IN (''California'')'
--   global roles    → NULL  (no filter, sees all rows)
--   viewer          → '1=0' (restricted hotel service view)

SELECT object_name, policy_name, pf_owner, package, function,
       sel, upd, policy_type
FROM user_policies
WHERE object_name = 'FULFILLMENT_CENTERS'
ORDER BY policy_name;

SELECT center_name, city, state_province
FROM fulfillment_centers
ORDER BY center_name;`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Spatial Layer Architecture</p>
            <div className="space-y-1">
              <DiagramBox label="Property Hotels" sub="SDO_GEOMETRY points · R-Tree index" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Service SLA Coverage" sub="SDO_BUFFER response-radius polygons · 8-72h targets" color="#8A4E2F" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Guest Segments" sub="new · standard · preferred · vip" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Guest Service Demand" sub="Uber H3 res-4 · operational pressure heatmap" color="#8A4E2F" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Service Pressure Regions" sub="SDO_GEOMETRY polygons · demand_index 0-100 · forecast join" color="#A73529" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(62, 111, 77,0.06)', border: '1px dashed rgba(62, 111, 77,0.25)' }}>
              <p className="text-[9px] text-[var(--color-text)]">
                All geometry stored in Oracle · Spatial index = sub-millisecond proximity queries
              </p>
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" className="fulfillment-page-glyph tone-teal" /> Guest Service & SLA Coverage
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Six spatial layers:</span> Monitor room-readiness coverage, hotel service capacity, SLA performance, and guest service demand triggered by guest and demand events.
        </p>
      </div>

      <SceneStoryPanel scene="fulfillment" />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-grid"
          toneClass="tone-ocean"
          value={(centers || []).length}
          label="Active Property Hotels"
        />
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-view"
          toneClass="tone-pine"
          value={formatNumber(totalCapacity)}
          label="Room & Service Capacity"
        />
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-tree-document"
          toneClass="tone-sienna"
          value={formatNumber(occupiedRooms)}
              label="Occupied Rooms"
        />
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-message-warning"
          toneClass="tone-red"
          value={(alerts || []).length}
          label="SLA Capacity Alerts"
        />
      </div>

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isFM = currentUser.ROLE === 'fulfillment_mgr';
        const isRestrictedViewer = currentUser.ROLE === 'viewer';
        const vpdAccessLabel = isRestrictedViewer ? 'restricted' : isFM ? 'regional filter' : 'full access';
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
                {isRestrictedViewer
                  ? `Restricted hotel service view - ${(centers || []).length} hotels visible`
                  : isFM
                  ? `Filtered to ${currentUser.REGION} - ${(centers || []).length} hotel${(centers || []).length !== 1 ? 's' : ''} visible`
                  : `${(centers || []).length} hotels visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <JetGlyph iconClass="oj-fwk-icon-view" className="fulfillment-vpd-access-glyph" />
              VPD {vpdAccessLabel}
            </div>
          </div>
        );
      })()}

      <NearestCenterPanel
        guestOptions={guestOptions}
        productOptions={productOptions}
        selectedguestId={selectedguestId}
        selectedProductId={selectedProductId}
        nearestCenters={nearestCenters}
        loading={nearestLoading}
        error={nearestError}
        onguestChange={setSelectedguestId}
        onProductChange={setSelectedProductId}
      />

      {/* ── Leaflet Map ── */}
      <FulfillmentMapView
        centers={centers}
        shipments={shipments}
        guests={guests}
        zonesData={zonesData}
        demandRegions={demandRegions}
        layers={layers}
        setLayer={setLayer}
      />

      {/* ── Property Hotels Table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Property Hotels</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Hotel</th>
                <th className="text-left py-2 px-3">Market</th>
                <th className="text-left py-2 px-3">Hotel Category</th>
                <th className="text-right py-2 px-3">Service Capacity</th>
                <th className="text-right py-2 px-3">Occupied Rooms</th>
                <th className="text-right py-2 px-3">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {(centers || []).map(c => (
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
                  <td className="py-2 px-3 text-right">{formatNumber(c.CAPACITY_UNITS)}</td>
                  <td className="py-2 px-3 text-right">{c.OCCUPIED_ROOMS ?? c.PENDING_SHIPMENTS}</td>
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

      {/* ── SLA Capacity Alerts ── */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" /> SLA Capacity Alerts - Compliance and Onboarding Pressure
          </h3>
          <div className="space-y-2">
            {(alerts || []).slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg surface-red-soft border border-red-soft">
                <div>
                  <span className="font-medium text-sm">{a.PRODUCT_NAME}</span>
                  <span className="text-[var(--color-text-dim)] text-xs ml-2">{a.BRAND_NAME} · {a.CENTER_NAME}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={a.STOCK_STATUS === 'out_of_capacity' || a.STOCK_STATUS === 'critical' ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text)]'}>
                    {a.QUANTITY_ON_HAND} available
                  </span>
                  <span className="text-[var(--color-text-dim)]">Need: {a.PREDICTED_DEMAND}</span>
                  <span className="text-[var(--color-text)]">Signal: {a.SOCIAL_FACTOR}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
