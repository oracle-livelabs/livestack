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
import { JetButton, JetSwitch } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';
import { SceneStoryPanel } from '../components/ManufacturingStory';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROUTE_PROVIDER_COLORS = {
  'Line Transfer': '#796087',
  'Supplier Transfer': '#AA643B',
  'Plant Shuttle': '#4F7D7B',
  'Expedite Lane': '#C74634',
};

const CENTER_TYPE_LABELS = {
  distribution: 'Final Assembly Plant',
  plant: 'Assembly Line',
  warehouse: 'Production Cell',
  micro: 'Prototype Cell',
  store: 'Partner Cell',
  drop_ship: 'Supplier Cell',
};

const TIER_LABELS = {
  vip: 'Critical Account',
  preferred: 'Priority Account',
  standard: 'Standard Account',
  new: 'New Demand Signal',
};

const ZONE_LABELS = {
  express: 'Maintenance Window',
  overnight: 'Next-Shift Recovery',
  standard: 'Standard Production Coverage',
  economy: 'Capacity Planning Horizon',
};

const TIER_COLORS = {
  vip:       '#796087',
  preferred: '#AA643B',
  standard:  '#437C94',
  new:       '#7A736E',
};

const OEE_LOAD_TARGET_PCT = 85;
const OEE_LOAD_NEAR_TARGET_PCT = 65;

function oeeLoadStatus(loadPct) {
  const value = Number(loadPct) || 0;
  if (value >= OEE_LOAD_TARGET_PCT) {
    return { label: 'Above target load', color: '#C74634', helper: 'red: overloaded or constrained' };
  }
  if (value >= OEE_LOAD_NEAR_TARGET_PCT) {
    return { label: 'Near target', color: '#AA643B', helper: 'amber: monitor shift capacity' };
  }
  return { label: 'Below target', color: '#4C825C', helper: 'green: capacity available' };
}

const ZONE_STYLES = {
  express:   { color: '#C74634', fillOpacity: 0.15, weight: 2.0, dashArray: '4 4' },
  overnight: { color: '#AA643B', fillOpacity: 0.12, weight: 1.8, dashArray: '5 4' },
  standard:  { color: '#AA643B', fillOpacity: 0.10, weight: 1.5, dashArray: '6 5' },
  economy:   { color: '#4C825C', fillOpacity: 0.07, weight: 1.0, dashArray: '8 6' },
};

const LAYER_DEFS = [
  { key: 'customers',     label: 'Customer Commitment Risk',       color: '#4C825C' },
  { key: 'centers',       label: 'Plants & Production Lines', color: '#437C94' },
  { key: 'routes',        label: 'Work Order Production Routes',      color: '#796087' },
  { key: 'zones',         label: 'Maintenance & Capacity Zones',       color: '#AA643B' },
  { key: 'h3',            label: 'Customer Account Density',      color: '#C74634' },
  { key: 'demandRegions', label: 'Capacity Planning Regions',       color: '#AA643B' },
];

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function centerColor(type) {
  if (type === 'distribution') return '#437C94';
  if (type === 'plant' || type === 'warehouse') return '#4C825C';
  return '#AA643B';
}

function centerTypeLabel(type) {
  return CENTER_TYPE_LABELS[type] || 'Plant Capacity Center';
}

function tierLabel(tier) {
  return TIER_LABELS[tier] || 'Customer Account';
}

function zoneLabel(zoneType) {
  return ZONE_LABELS[zoneType] || 'Capacity Zone';
}

function routeProviderLabel(provider) {
  const normalized = String(provider || '').toLowerCase();
  if (normalized.includes('fed')) return 'Line Transfer';
  if (normalized.includes('ups')) return 'Supplier Transfer';
  if (normalized.includes('postal')) return 'Plant Shuttle';
  if (normalized.includes('usps')) return 'Plant Shuttle';
  if (normalized.includes('dhl')) return 'Expedite Lane';
  return provider || 'Plant Route';
}

function routeProviderColor(provider) {
  return ROUTE_PROVIDER_COLORS[routeProviderLabel(provider)] || '#6F757E';
}

function centerRadius(units) {
  if (units > 100000) return 20;
  if (units > 50000)  return 15;
  if (units > 20000)  return 11;
  return 8;
}

function kpiMetric(kpis, key, fallback = 0) {
  const value = kpis?.[key] ?? kpis?.[key.toUpperCase()];
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function FulfillmentKpiCard({ iconClass, label, value, helper, color }) {
  return (
    <div className="fulfillment-kpi-card" style={{ '--kpi-color': color }}>
      <div className="fulfillment-kpi-card__top">
        <span className="fulfillment-kpi-card__rule" aria-hidden="true" />
        <span className="fulfillment-kpi-card__icon">
          <JetGlyph iconClass={iconClass} />
        </span>
      </div>
      <div className="fulfillment-kpi-card__body">
        <p className="fulfillment-kpi-card__value">{formatNumber(value)}</p>
        <p className="fulfillment-kpi-card__label">{label}</p>
        <p className="fulfillment-kpi-card__helper">{helper}</p>
      </div>
    </div>
  );
}

// Demand region color scale: high demand_index → red, low → green (Redwood palette, aerial map)
function demandColor(index) {
  if (index >= 85) return { fill: '#C74634', stroke: '#C74634', opacity: 0.42 };
  if (index >= 70) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.35 };
  if (index >= 55) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.28 };
  if (index >= 40) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.22 };
  return                  { fill: '#4C825C', stroke: '#4C825C', opacity: 0.18 };
}

function demandLevelLabel(index) {
  if (index >= 85) return 'Critical Throughput Risk';
  if (index >= 70) return 'High Capacity Pressure';
  if (index >= 55) return 'Moderate Capacity Pressure';
  if (index >= 40) return 'Watch';
  return 'Stable';
}

// Heat-color scale: high density → red, low → green (Redwood palette, aerial map)
function h3HeatColor(ratio) {
  if (ratio > 0.75) return { fill: '#C74634', stroke: '#C74634', opacity: 0.60 };
  if (ratio > 0.50) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.50 };
  if (ratio > 0.25) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.42 };
  if (ratio > 0.10) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.35 };
  return                    { fill: '#4C825C', stroke: '#4C825C', opacity: 0.28 };
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
function FulfillmentMapView({ centers, shipments, customers, zonesData, demandRegions, layers, setLayer, onPlantSelect }) {
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
      boundary: cellToBoundary(cellId),   // [[lat, lng], ...] - native Leaflet format
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
      return area(b.COORDS) - area(a.COORDS); // largest first → rendered first → behind
    });
  }, [demandRegions]);

  const zones        = zonesData?.zones  || [];
  const zonesSource  = zonesData?.source || 'unavailable';

  return (
    <div className="fulfillment-map-card">
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ height: '100%', width: '100%', background: 'var(--color-surface-muted)' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/* Light ArcGIS Canvas tiles, matching the Orders route panel styling. */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri - Esri, HERE, Garmin, FAO, NOAA, USGS"
          maxZoom={19}
        />

        <FitBounds centers={centers} active={layers.centers} />

        {/* ── LAYER: Production Demand Regions (SDO_GEOMETRY polygons, colored by demand_index) ── */}
        {/* Sorted largest-area-first so smaller regions render on top and stay clickable */}
        {layers.demandRegions && sortedDemandRegions.map(r => {
          if (!r.COORDS?.length) return null;
          const { fill, stroke, opacity } = demandColor(r.DEMAND_INDEX || 50);
          const label = demandLevelLabel(r.DEMAND_INDEX || 50);
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
                    <span style={{ color: '#697778' }}>Production Demand Index</span>
                    <span style={{ color: fill, fontWeight: 700, fontSize: 13 }}>{r.DEMAND_INDEX} - {label}</span>
                    <span style={{ color: '#697778' }}>Customer Accounts</span>
                    <span>{r.POPULATION ? (r.POPULATION / 1e6).toFixed(1) + 'M' : '-'}</span>
                    <span style={{ color: '#697778' }}>Avg Contract Value</span>
                    <span>${r.AVG_INCOME ? Number(r.AVG_INCOME).toLocaleString() : '-'}</span>
                    <span style={{ color: '#697778' }}>Signal Density</span>
                    <span>{r.SOCIAL_DENSITY}/1k signal density</span>
                    {r.AVG_7DAY_FORECAST && <>
                      <span style={{ color: '#697778' }}>7-Day Demand Forecast</span>
                      <span style={{ color: '#AA643B' }}>{Number(r.AVG_7DAY_FORECAST).toLocaleString()} units/day</span>
                    </>}
                    {r.PEAK_SOCIAL_FACTOR && <>
                      <span style={{ color: '#697778' }}>Peak Production Signal</span>
                      <span style={{ color: '#796087' }}>{r.PEAK_SOCIAL_FACTOR}×</span>
                    </>}
                    {r.FORECAST_PRODUCTS > 0 && <>
                      <span style={{ color: '#697778' }}>Parts tracked</span>
                      <span>{r.FORECAST_PRODUCTS}</span>
                    </>}
                  </div>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* ── LAYER: Maintenance and Capacity Zones (dashed rings around centers) ── */}
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
                  <span style={{ color: style.color }}>{zoneLabel(z.ZONE_TYPE)}</span>
                  {' '}· ≤{z.RADIUS_KM} km · {z.MAX_DELIVERY_HRS}h recovery window
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* ── LAYER: Customer Account Density (hexagonal commitment heatmap) ── */}
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
                  <strong>{cell.count}</strong> customer-account commitments<br />
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

        {/* ── LAYER: Work Order Routes (polylines colored by production-route provider) ── */}
        {layers.routes && (shipments || []).map(s => {
          if (!s.CENTER_LAT || !s.CUSTOMER_LAT) return null;
          const provider = s.ROUTE_PROVIDER || s.CARRIER;
          return (
            <Polyline
              key={s.WORK_ORDER_ROUTE_ID || s.SHIPMENT_ID}
              positions={[[s.CENTER_LAT, s.CENTER_LON], [s.CUSTOMER_LAT, s.CUSTOMER_LON]]}
              color={routeProviderColor(provider)}
              weight={2}
              opacity={0.65}
            />
          );
        })}

        {/* ── LAYER: Customer Risk Tiers (small dots colored by tier) ── */}
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
                  <strong style={{ color }}>{tierLabel(c.CUSTOMER_TIER)}</strong>
                  {' · '}{c.CITY}, {c.STATE_PROVINCE}<br />
                  Contract value: {formatCurrency(c.LIFETIME_VALUE)}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* ── LAYER: Plants (large markers with popups) ── */}
        {layers.centers && (centers || []).map(c => {
          const partsTracked = c.PARTS_TRACKED ?? c.PRODUCTS_STOCKED;
          const queuedWorkOrders = c.ACTIVE_WORK_ORDER_COUNT;
          const oeeStatus = oeeLoadStatus(c.CURRENT_LOAD_PCT);
          return (
            <CircleMarker
              key={c.CENTER_ID}
              center={[c.LATITUDE, c.LONGITUDE]}
              radius={centerRadius(c.TOTAL_UNITS)}
              pathOptions={{
                fillColor:   centerColor(c.CENTER_TYPE),
                fillOpacity: 0.9,
                color:       'rgba(255,255,255,0.45)',
                weight:      2,
              }}
              eventHandlers={{ click: () => onPlantSelect?.(c.CENTER_ID) }}
            >
              <Popup>
                <div style={{ minWidth: 165, fontFamily: 'DM Sans, sans-serif' }}>
                  <p style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{c.CENTER_NAME}</p>
                  <p style={{ color: '#697778', fontSize: 11, marginBottom: 6 }}>{c.CITY}, {c.STATE_PROVINCE}</p>
                  <span style={{
                    display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 10,
                    background: `${centerColor(c.CENTER_TYPE)}22`,
                    color: 'var(--color-text)',
                    marginBottom: 8,
                    border: `1px solid ${centerColor(c.CENTER_TYPE)}44`,
                  }}>
                    {centerTypeLabel(c.CENTER_TYPE)}
                  </span>
                  <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                    <div><span style={{ color: '#697778' }}>Parts: </span>{formatNumber(partsTracked)}</div>
                    <div><span style={{ color: '#697778' }}>Line capacity: </span>{formatNumber(c.TOTAL_UNITS)} units</div>
                    <div><span style={{ color: '#697778' }}>Queued work orders: </span>{queuedWorkOrders}</div>
                    <div>
                      <span style={{ color: '#697778' }}>OEE load: </span>
                      <strong style={{ color: oeeStatus.color }}>{c.CURRENT_LOAD_PCT}%</strong>
                      <span style={{ color: '#697778' }}> vs {OEE_LOAD_TARGET_PCT}% target</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
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
          <>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-ocean inline-block" /> Final assembly</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-pine inline-block" /> Production line</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> Supplier/prototype cell</span>
            </div>
            <div className="oee-load-legend">
              <strong className="text-[var(--color-text)]">OEE load target {OEE_LOAD_TARGET_PCT}%:</strong>
              <span className="oee-load-legend__item"><span className="oee-load-legend__swatch" style={{ background: '#4C825C' }} />below target</span>
              <span className="oee-load-legend__item"><span className="oee-load-legend__swatch" style={{ background: '#AA643B' }} />{OEE_LOAD_NEAR_TARGET_PCT}-{OEE_LOAD_TARGET_PCT - 1}% near target</span>
              <span className="oee-load-legend__item"><span className="oee-load-legend__swatch" style={{ background: '#C74634' }} />{OEE_LOAD_TARGET_PCT}%+ overloaded</span>
            </div>
          </>
        )}
        {layers.customers && (
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(TIER_COLORS).map(([tier, color]) => (
              <span key={tier} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                <span>{tierLabel(tier)}</span>
              </span>
            ))}
          </div>
        )}
        {layers.h3 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="mr-1">Commitment Density:</span>
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
              <span className="inline-block w-5 border-t-2 border-brand-red border-dashed" /> Maintenance ≤80 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-sienna border-dashed" /> Production ≤250 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-pine border-dashed" /> Planning ≤500 km
            </span>
          </div>
        )}
        {layers.routes && (
          <div className="flex items-center gap-3">
            {Object.entries(ROUTE_PROVIDER_COLORS).map(([provider, color]) => (
              <span key={provider} className="flex items-center gap-1">
                <span className="w-4 h-0.5 inline-block" style={{ background: color }} /> {provider}
              </span>
            ))}
          </div>
        )}
        {layers.demandRegions && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-1">Capacity Index:</span>
            {[['#C74634','≥85 critical'],['#AA643B','≥70 high'],['#AA643B','≥55 moderate'],['#5F7D4F','≥40 watch'],['#4C825C','Stable']].map(([c, l]) => (
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
        <div><span className="tone-teal">SDO_GEOMETRY</span> production routing</div>
        {layers.h3 && (
          <div><span className="tone-sienna">H3 res-4</span> · {h3Cells.length} hexagons · {customers?.length ?? 0} customer accounts</div>
        )}
        {layers.zones && (
          <div style={{ color: zonesSource === 'database' ? '#4C825C' : '#AA643B' }}>
            Maintenance windows: {zonesSource === 'database' ? `Oracle SDO_BUFFER · ${zones.length} rows` : 'database evidence unavailable'}
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
  const [selectedPlantId, setSelectedPlantId] = useState(null);
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
  const { data: capacityKpis } = useData(() => api.fulfillment.kpis(), [userKey]);
  const { data: centers }       = useData(() => api.fulfillment.centers(), [userKey]);
  const { data: alerts }        = useData(() => api.fulfillment.alerts(), [userKey]);
  const { data: shipments }     = useData(() => api.fulfillment.shipments({ limit: 30 }), [userKey]);
  const { data: customers }     = useData(() => api.fulfillment.customers(), [userKey]);
  const { data: zonesData }     = useData(() => api.fulfillment.zones(), [userKey]);
  const { data: demandRegions } = useData(() => api.fulfillment.demandRegions(), [userKey]);
  const {
    data: selectedPlantDocument,
    loading: loadingPlantDocument,
    error: plantDocumentError,
  } = useData(
    () => selectedPlantId
      ? api.manufacturing.plants.document(selectedPlantId)
      : Promise.resolve(null),
    [selectedPlantId, userKey]
  );

  const totalUnits      = (centers || []).reduce((s, c) => s + (c.TOTAL_UNITS      || 0), 0);
  const activeWorkOrders = (centers || []).reduce((s, c) => s + (c.ACTIVE_WORK_ORDER_COUNT || 0), 0);
  const activePlantCount = kpiMetric(capacityKpis, 'active_plant_count', (centers || []).length);
  const availableCapacityUnits = kpiMetric(capacityKpis, 'available_capacity_units', totalUnits);
  const activeWorkOrderCount = kpiMetric(capacityKpis, 'active_work_order_count', activeWorkOrders);
  const capacityAlertCount = kpiMetric(capacityKpis, 'capacity_alert_count', (alerts || []).length);

  return (
    <div className="space-y-6 fade-in">

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Plant Capacity and Routing Map">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every plant capacity center, maintenance window, customer-account commitment, and capacity planning region is stored as an{' '}
              <span className="tone-pine font-mono">SDO_GEOMETRY</span> point or polygon.
              Oracle Spatial's <span className="tone-pine font-mono">SDO_GEOM.SDO_DISTANCE()</span> ranks
              all production lines by proximity and available line capacity in a single SQL - no external routing API.
              Maintenance and recovery windows use <span className="tone-sienna font-mono">SDO_BUFFER</span> circular polygons.
              Demand regions are Oracle <span className="tone-sienna font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="tone-sienna font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs tone-plum mx-1">manufacturing_demand_forecasts</code> table.
              The H3 layer bins customer-account commitment density client-side via{' '}
              <span className="tone-sienna font-mono">h3-js</span>.
              The map highlights OEE load, work order queues, and capacity planning tradeoffs for plant operations.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="Oracle Spatial" color="green" />
            <FeatureBadge label="SDO_GEOMETRY" color="green" />
            <FeatureBadge label="SDO_GEOM.SDO_DISTANCE" color="green" />
            <FeatureBadge label="SDO_BUFFER (Maintenance Windows)" color="yellow" />
            <FeatureBadge label="Spatial Index (R-Tree)" color="blue" />
            <FeatureBadge label="WGS-84 Geodetic" color="cyan" />
            <FeatureBadge label="SDO_NN (Nearest Neighbor)" color="orange" />
            <FeatureBadge label="H3 Hexagonal Grid" color="orange" />
            <FeatureBadge label="SDO_UTIL.TO_GEOJSON" color="orange" />
            <FeatureBadge label="demand_regions" color="red" />
            <FeatureBadge label="manufacturing_demand_forecasts" color="red" />
            <FeatureBadge label="line capacity" color="purple" />
          </div>
          <SqlBlock code={`-- Nearest production line with available capacity
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
ORDER  BY dist_km
FETCH FIRST 3 ROWS ONLY;`} />
          <SqlBlock code={`-- Demand regions: Oracle SDO_GEOMETRY → GeoJSON
-- SDO_UTIL.TO_GEOJSON converts polygon boundary for frontend rendering
SELECT r.region_name, r.demand_index,
       TO_CHAR(SDO_UTIL.TO_GEOJSON(r.boundary)) AS geojson,
       AVG(df.predicted_unit_demand)  AS avg_7day_forecast,
       MAX(df.production_signal_factor)     AS peak_production_signal_factor
FROM   demand_regions r
LEFT JOIN manufacturing_demand_forecasts df
       ON UPPER(df.planning_region) = UPPER(r.region_name)
      AND df.forecast_date BETWEEN TRUNC(SYSDATE)
                               AND TRUNC(SYSDATE) + 7
GROUP BY r.region_id, r.region_name,
         r.demand_index, r.boundary
ORDER BY r.demand_index DESC;`} />
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed mb-2">
              Oracle <span className="tone-red font-mono">DBMS_RLS</span> applies a row-level security policy
              to <code className="text-xs tone-teal mx-1">FULFILLMENT_CENTERS</code>. When{' '}
              <span className="tone-sienna font-mono">MANUFACTURING_SECURITY_PKG</span> establishes the trusted{' '}
              <span className="tone-sienna font-mono">MANUFACTURING_APP_CTX</span>, Oracle
              transparently appends a WHERE clause - plant capacity managers see only their regional centers,
              while admins and analysts see all rows. <strong>Zero application SQL changes required.</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS Policy" color="red" />
            <FeatureBadge label="VPD (Row-Level Security)" color="red" />
            <FeatureBadge label="MANUFACTURING_SECURITY_PKG" color="yellow" />
            <FeatureBadge label="SYS_CONTEXT" color="yellow" />
          </div>
          <SqlBlock code={`-- Trusted package populates MANUFACTURING_APP_CTX
BEGIN
  MANUFACTURING_SECURITY_PKG.SET_USER_CONTEXT('fm_west_maria');
END;
/

CREATE OR REPLACE FUNCTION vpd_fulfillment_region (
    p_schema IN VARCHAR2, p_table IN VARCHAR2
) RETURN VARCHAR2 AS
    v_role   VARCHAR2(30);
    v_region VARCHAR2(100);
BEGIN
    v_role   := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE');
    v_region := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'REGION');

    IF v_role IN ('admin','analyst') THEN RETURN NULL; END IF;
    IF v_role IS NULL OR v_role = 'denied' THEN RETURN '1 = 0'; END IF;

    IF v_role = 'fulfillment_mgr' AND v_region IS NOT NULL THEN
        RETURN 'state_province = ' || DBMS_ASSERT.ENQUOTE_LITERAL(v_region);
    END IF;

    RETURN 'is_active = 1';
END;
/

BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema   => USER,
    object_name     => 'FULFILLMENT_CENTERS',
    policy_name     => 'VPD_FC_REGION',
    function_schema => USER,
    policy_function => 'VPD_FULFILLMENT_REGION',
    statement_types => 'SELECT,INSERT,UPDATE,DELETE',
    update_check    => TRUE,
    enable          => TRUE
  );
END;
/`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Spatial Layer Architecture</p>
            <div className="space-y-1">
              <DiagramBox label="Production Lines" sub="SDO_GEOMETRY points · R-Tree index · OEE load" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Maintenance Windows" sub="SDO_BUFFER circular polygons · 3 recovery tiers" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Customer Commitment Risk" sub="new · standard · priority · critical" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Customer Account Density" sub="Uber H3 res-4 · commitment heatmap" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Capacity Planning Regions" sub="SDO_GEOMETRY polygons · demand_index 0-100 · forecast join" color="#C74634" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(76,130,92,0.06)', border: '1px dashed rgba(76,130,92,0.25)' }}>
              <p className="text-[9px] text-[var(--color-text)]">
                Geometry stored in Oracle · indexed proximity queries use the deployed Spatial objects
              </p>
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" className="fulfillment-page-glyph tone-teal" /> Plant Capacity and Routing Map
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Six spatial layers</span> show where AX-400 production lines, OEE load, maintenance windows, and capacity planning regions can be rebalanced.
          {' '}OEE load target: <strong className="text-[var(--color-text)]">{OEE_LOAD_TARGET_PCT}%</strong>.
        </p>
      </div>

      <SceneStoryPanel scene="fulfillment" />

      {/* ── Stats ── */}
      <div className="fulfillment-kpi-grid">
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-grid"
          label="Active Plants"
          value={activePlantCount}
          helper="capacity centers online"
          color="#437C94"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-view"
          label="Available Capacity"
          value={availableCapacityUnits}
          helper="units available for scheduling"
          color="#4C825C"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-tree-document"
          label="Active Work Orders"
          value={activeWorkOrderCount}
          helper="queued across plant routes"
          color="#AA643B"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-message-warning"
          label="Capacity Alerts"
          value={capacityAlertCount}
          helper="risk items needing review"
          color="#C74634"
        />
      </div>

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isFM = currentUser.ROLE === 'fulfillment_mgr';
        const isRestricted = currentUser.ROLE === 'viewer' || currentUser.ROLE === 'merchandiser';
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
                  ? `Filtered to ${currentUser.REGION} - ${(centers || []).length} plant${(centers || []).length !== 1 ? 's' : ''} visible`
                  : `${(centers || []).length} plants visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <JetGlyph iconClass="oj-fwk-icon-view" className="fulfillment-vpd-access-glyph" />
              VPD {isFM ? 'regional' : (isRestricted ? 'restricted' : 'global')}
            </div>
          </div>
        );
      })()}

      {/* ── Leaflet Map ── */}
      <FulfillmentMapView
        centers={centers}
        shipments={shipments}
        customers={customers}
        zonesData={zonesData}
        demandRegions={demandRegions}
        layers={layers}
        setLayer={setLayer}
        onPlantSelect={setSelectedPlantId}
      />

      {/* ── Plants Table ── */}
      <div className="glass-card p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Plants and Production Lines</h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              OEE load compares current line load to the {OEE_LOAD_TARGET_PCT}% target. Green is below target, amber is near target, red is above target.
            </p>
          </div>
          <div className="oee-load-legend">
            <span className="oee-load-legend__item"><span className="oee-load-legend__swatch" style={{ background: '#4C825C' }} />below</span>
            <span className="oee-load-legend__item"><span className="oee-load-legend__swatch" style={{ background: '#AA643B' }} />near</span>
            <span className="oee-load-legend__item"><span className="oee-load-legend__swatch" style={{ background: '#C74634' }} />above</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Plant / Line</th>
                <th className="text-left py-2 px-3">Location</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-right py-2 px-3">Parts</th>
                <th className="text-right py-2 px-3">Line Capacity</th>
                <th className="text-right py-2 px-3">Queued Work</th>
                <th className="text-right py-2 px-3">OEE Load</th>
              </tr>
            </thead>
            <tbody>
              {(centers || []).map(c => {
                const oeeStatus = oeeLoadStatus(c.CURRENT_LOAD_PCT);
                return (
                  <tr
                    key={c.CENTER_ID}
                    className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] cursor-pointer"
                    tabIndex={0}
                    aria-label={`Open the read-only ${c.CENTER_NAME} plant capacity document`}
                    onClick={() => setSelectedPlantId(c.CENTER_ID)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedPlantId(c.CENTER_ID);
                      }
                    }}
                  >
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
                    <td className="py-2 px-3 text-right font-semibold">{formatNumber(c.PARTS_TRACKED ?? c.PRODUCTS_STOCKED)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatNumber(c.TOTAL_UNITS)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{c.ACTIVE_WORK_ORDER_COUNT}</td>
                    <td className="py-2 px-3 text-right">
                      <span className="font-bold" style={{ color: oeeStatus.color }}>
                        {c.CURRENT_LOAD_PCT}%
                      </span>
                      <span className="oee-load-status" style={{ color: oeeStatus.color }}>
                        {oeeStatus.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPlantId && (
        <section className="glass-card p-5" aria-live="polite">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">Plant capacity document</p>
              <h3 className="text-sm font-semibold mt-1">
                {selectedPlantDocument?.document?.plantName || `Plant ${selectedPlantId}`}
              </h3>
            </div>
            <JetButton
              label="Close"
              title="Close plant capacity document"
              iconClass="oj-fwk-icon-cross"
              chroming="borderless"
              display="icons"
              onAction={() => setSelectedPlantId(null)}
            />
          </div>

          {loadingPlantDocument ? (
            <p className="text-sm text-[var(--color-text-dim)]">Querying MANUFACTURING_PLANT_CAPACITY_DV...</p>
          ) : plantDocumentError ? (
            <p className="text-sm tone-red">{plantDocumentError}</p>
          ) : selectedPlantDocument?.document ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-[var(--color-text-dim)] flex-wrap">
                <span className="font-mono text-[var(--color-text)]">{selectedPlantDocument.sourceObject}</span>
                <span>
                  {selectedPlantDocument.executionMode === 'duality-view'
                    ? 'Oracle duality view'
                    : selectedPlantDocument.executionMode}
                  {selectedPlantDocument.readOnly ? ' · read-only' : ''}
                </span>
                <span>{selectedPlantDocument.document.partCapacity?.length || 0} part capacity records</span>
                <span>{selectedPlantDocument.document.workOrders?.length || 0} assigned work orders</span>
              </div>
              <pre className="p-3 text-[11px] font-mono text-[var(--color-text)] overflow-auto max-h-[360px] whitespace-pre rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
{JSON.stringify(selectedPlantDocument.document, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      )}

      {/* ── Capacity Alerts ── */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" /> Capacity Alerts - OEE and Material Constraint Watch
          </h3>
          <div className="space-y-2">
            {(alerts || []).slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg surface-red-soft border border-red-soft">
                <div>
                  <span className="font-medium text-sm">{a.PRODUCT_NAME}</span>
                  <span className="text-[var(--color-text-dim)] text-xs ml-2">{a.BRAND_NAME} · {a.CENTER_NAME}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={a.STOCK_STATUS === 'out_of_stock' || a.STOCK_STATUS === 'critical' ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text)]'}>
                    {a.QUANTITY_ON_HAND} available capacity
                  </span>
                  <span className="text-[var(--color-text-dim)]">Forecast demand: {a.PREDICTED_UNIT_DEMAND}</span>
                  <span className="text-[var(--color-text)]">Signal factor: {a.PRODUCTION_SIGNAL_FACTOR}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
