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
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';
import { SceneStoryPanel } from '../components/HighTechStory';
import HelpTip from '../components/HelpTip';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPATIAL_READINESS_ENDPOINT = '/api/fulfillment/spatial-readiness';
const CARRIER_COLORS = { FedEx: '#796087', UPS: '#AA643B', USPS: '#4F7D7B', DHL: '#C74634' };

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
  { key: 'customers',     label: 'Strategic Customer Commitments', color: '#4C825C' },
  { key: 'centers',       label: 'Supply & Commitment Sites',      color: '#437C94' },
  { key: 'routes',        label: 'Order Promise Routes',           color: '#796087' },
  { key: 'zones',         label: 'Commitment Service Zones',       color: '#AA643B' },
  { key: 'h3',            label: 'H3 Density Grid',      color: '#C74634' },
  { key: 'demandRegions', label: 'Product Demand Regions',       color: '#AA643B' },
];

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function centerColor(type) {
  if (type === 'distribution') return '#437C94';
  if (type === 'fulfillment hub')    return '#4C825C';
  return '#AA643B';
}

function centerRadius(units) {
  if (units > 100000) return 20;
  if (units > 50000)  return 15;
  if (units > 20000)  return 11;
  return 8;
}

// Demand region color scale: high demand_index → red, low → green (Redwood palette, aerial map)
function demandColor(index) {
  if (index >= 85) return { fill: '#C74634', stroke: '#C74634', opacity: 0.42 };
  if (index >= 70) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.35 };
  if (index >= 55) return { fill: '#AA643B', stroke: '#AA643B', opacity: 0.28 };
  if (index >= 40) return { fill: '#5F7D4F', stroke: '#5F7D4F', opacity: 0.22 };
  return                  { fill: '#4C825C', stroke: '#4C825C', opacity: 0.18 };
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

function siteTypeLabel(type) {
  const key = String(type || '').toLowerCase();
  if (key === 'warehouse') return 'Regional Product Availability Center';
  if (key === 'distribution') return 'Contract Manufacturing Hub';
  if (key === 'micro') return 'Field Quality Buffer Site';
  if (key === 'drop_ship') return 'Supplier Direct Allocation';
  if (key === 'store') return 'Channel Inventory Node';
  return type ? type.replace(/_/g, ' ') : 'Supply Site';
}

function siteConstraint(site) {
  const load = Number(site?.CURRENT_LOAD_PCT || 0);
  if (load >= 90) return 'Capacity-constrained allocation path';
  if (Number(site?.PENDING_SHIPMENTS || 0) >= 20) return 'Customer commitment backlog';
  if (Number(site?.PRODUCTS_STOCKED || 0) <= 10) return 'Component availability exposure';
  return 'Ready for order promising';
}

function siteActions(site) {
  const load = Number(site?.CURRENT_LOAD_PCT || 0);
  const pending = Number(site?.PENDING_SHIPMENTS || 0);
  const actions = [];
  if (load >= 85) actions.push('Reallocate wafer starts');
  if (pending >= 10) actions.push('Protect customer commitments');
  if (String(site?.CENTER_TYPE || '').toLowerCase() === 'distribution') actions.push('Confirm contract manufacturing capacity');
  actions.push('Check BOM alternates');
  actions.push('Update order promising');
  return [...new Set(actions)].slice(0, 4);
}

function FulfillmentKpiCard({ iconClass, label, value, meta, badge, color = '#437C94' }) {
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

function SiteActionChips({ site, compact = false }) {
  if (!site) return null;
  return (
    <div className={`site-action-chips${compact ? ' site-action-chips--compact' : ''}`}>
      {siteActions(site).map((action) => (
        <span key={action} className="site-action-chip">
          {action}
        </span>
      ))}
    </div>
  );
}

function SelectedSiteDetail({ site }) {
  if (!site) return null;
  const load = Number(site.CURRENT_LOAD_PCT || 0);
  const tone = load >= 85 ? '#C74634' : load >= 65 ? '#AA643B' : '#4C825C';
  return (
    <aside className="glass-card p-4 selected-site-detail">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">Selected Supply Site</p>
          <h3 className="text-base font-bold mt-1">{site.CENTER_NAME}</h3>
          <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
            {site.CITY}, {site.STATE_PROVINCE} · {siteTypeLabel(site.CENTER_TYPE)}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ color: tone, background: `${tone}14`, border: `1px solid ${tone}33` }}>
          {load}% inventory load
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { label: 'On-hand Units', value: formatNumber(site.TOTAL_UNITS || 0) },
          { label: 'Products', value: formatNumber(site.PRODUCTS_STOCKED || 0) },
          { label: 'Commitments', value: formatNumber(site.PENDING_SHIPMENTS || 0) },
        ].map((item) => (
          <div key={item.label} className="rounded-lg p-2 text-center" style={{ background: 'var(--color-surface-muted)', border: '1px solid var(--color-border)' }}>
            <p className="text-sm font-bold">{item.value}</p>
            <p className="text-[9px] text-[var(--color-text-dim)] uppercase">{item.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--color-text)] mt-3">
        {siteConstraint(site)} across supply chain resilience, order promising, and customer commitments.
      </p>
      <SiteActionChips site={site} />
    </aside>
  );
}

// ── Map View ──────────────────────────────────────────────────────────────────
function FulfillmentMapView({ centers, shipments, customers, zonesData, demandRegions, layers, setLayer, selectedSite, onSiteSelect }) {
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
          attribution="Tiles &copy; Esri - Esri, HERE, Garmin, FAO, NOAA, USGS"
          maxZoom={19}
        />

        <FitBounds centers={centers} active={layers.centers} />

        {/* ── LAYER: Product Demand Regions (SDO_GEOMETRY polygons, colored by demand_index) ── */}
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
                      <span style={{ color: '#697778' }}>Peak Social ×</span>
                      <span style={{ color: '#796087' }}>{r.PEAK_SOCIAL_FACTOR}×</span>
                    </>}
                    {r.FORECAST_PRODUCTS > 0 && <>
                      <span style={{ color: '#697778' }}>Products tracked</span>
                      <span>{r.FORECAST_PRODUCTS}</span>
                    </>}
                  </div>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* ── LAYER: Service Zones (dashed rings around centers) ── */}
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
                  {' '}zone · ≤{z.RADIUS_KM} km · {z.MAX_DELIVERY_HRS}h fulfillment response
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
                  <strong>{cell.count}</strong> customers<br />
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

        {/* ── LAYER: Order Promise Routes (polylines colored by logistics partner) ── */}
        {layers.routes && (shipments || []).map(s => {
          if (!s.CENTER_LAT || !s.CUSTOMER_LAT) return null;
          return (
            <Polyline
              key={s.SHIPMENT_ID}
              positions={[[s.CENTER_LAT, s.CENTER_LON], [s.CUSTOMER_LAT, s.CUSTOMER_LON]]}
              color={CARRIER_COLORS[s.CARRIER] || '#6F757E'}
              weight={2}
              opacity={0.65}
            />
          );
        })}

        {/* ── LAYER: Strategic Customer Commitments (small dots colored by tier) ── */}
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
                  {' · '}{c.CITY}, {c.STATE_PROVINCE}<br />
                  LTV: {formatCurrency(c.LIFETIME_VALUE)}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* ── LAYER: Supply & Commitment Sites (large markers with popups) ── */}
        {layers.centers && (centers || []).map(c => (
          <CircleMarker
            key={c.CENTER_ID}
            center={[c.LATITUDE, c.LONGITUDE]}
            radius={centerRadius(c.TOTAL_UNITS)}
            eventHandlers={{ click: () => onSiteSelect?.(c) }}
            pathOptions={{
              fillColor:   centerColor(c.CENTER_TYPE),
              fillOpacity: 0.9,
              color:       selectedSite?.CENTER_ID === c.CENTER_ID ? '#312D2A' : 'rgba(255,255,255,0.45)',
              weight:      selectedSite?.CENTER_ID === c.CENTER_ID ? 3 : 2,
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
                  {siteTypeLabel(c.CENTER_TYPE)}
                </span>
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  <div><span style={{ color: '#697778' }}>Products: </span>{formatNumber(c.PRODUCTS_STOCKED)}</div>
                  <div><span style={{ color: '#697778' }}>Capacity: </span>{formatNumber(c.TOTAL_UNITS)} units</div>
                  <div><span style={{ color: '#697778' }}>Commitments: </span>{c.PENDING_SHIPMENTS}</div>
                  <div><span style={{ color: '#697778' }}>Load: </span>{c.CURRENT_LOAD_PCT}%</div>
                </div>
                <SiteActionChips site={c} compact />
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
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-ocean inline-block" /> CM hubs</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-pine inline-block" /> availability centers</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> channel buffers</span>
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
              <span className="inline-block w-5 border-t-2 border-brand-red border-dashed" /> Express ≤80 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-sienna border-dashed" /> Standard ≤250 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-brand-pine border-dashed" /> Economy ≤500 km
            </span>
          </div>
        )}
        {layers.routes && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-plum inline-block" /> FedEx</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-sienna inline-block" /> UPS</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-ocean inline-block" /> USPS</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-red inline-block" /> DHL</span>
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
        <div><span className="tone-teal">SDO_GEOMETRY</span> spatial routing</div>
        {layers.h3 && (
          <div><span className="tone-sienna">H3 res-4</span> · {h3Cells.length} hexagons · {customers?.length ?? 0} customers</div>
        )}
        {layers.zones && (
          <div style={{ color: zonesSource === 'database' ? '#4C825C' : '#AA643B' }}>
            Zones: {zonesSource === 'database' ? 'Oracle SDO_BUFFER' : 'computed from centers'}
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
  const [layers, setLayers] = useState({
    centers:       false,
    routes:        false,
    zones:         false,
    customers:     false,
    h3:            false,
    demandRegions: false,
  });
  const [selectedSite, setSelectedSite] = useState(null);
  const setLayer = (key, value) => setLayers(l => ({ ...l, [key]: value }));

  // VPD-aware: refetch when user switches (X-Demo-User header changes server-side filtering)
  const userKey = currentUser?.USERNAME;
  const { data: kpis }          = useData(() => api.fulfillment.kpis(), [userKey]);
  const { data: centers }       = useData(() => api.fulfillment.centers(), [userKey]);
  const { data: alerts }        = useData(() => api.fulfillment.alerts(), [userKey]);
  const { data: shipments }     = useData(() => api.fulfillment.shipments({ limit: 30 }), [userKey]);
  const { data: customers }     = useData(() => api.fulfillment.customers(), [userKey]);
  const { data: zonesData }     = useData(() => api.fulfillment.zones(), [userKey]);
  const { data: demandRegions } = useData(() => api.fulfillment.demandRegions(), [userKey]);
  const {
    data: spatialEvidence,
    loading: spatialEvidenceLoading,
    error: spatialEvidenceError,
  } = useData(() => api.fulfillment.spatialReadiness(), [userKey]);

  const totalUnits      = (centers || []).reduce((s, c) => s + (c.TOTAL_UNITS      || 0), 0);
  const pendingFulfillmentRoutes = (centers || []).reduce((s, c) => s + (c.PENDING_SHIPMENTS || 0), 0);
  const selectedSiteFromData = (centers || []).find((site) => site.CENTER_ID === selectedSite?.CENTER_ID)
    || (centers || [])[0]
    || null;
  const shortageAlerts = useMemo(() => (alerts || []).filter((alert) => alert.ALERT_GROUP === 'shortage'), [alerts]);
  const watchlistAlerts = useMemo(() => (alerts || []).filter((alert) => alert.ALERT_GROUP !== 'shortage'), [alerts]);
  const spatialEvidenceStatus = spatialEvidenceError
    ? 'UNAVAILABLE'
    : spatialEvidenceLoading
      ? 'CHECKING'
      : spatialEvidence?.status || 'INCOMPLETE';

  useEffect(() => {
    if (!selectedSite && centers?.length) {
      setSelectedSite(centers[0]);
    }
  }, [centers, selectedSite]);

  useEffect(() => {
    setSelectedSite(null);
  }, [userKey]);

  return (
    <div className="space-y-6 fade-in">

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Product Availability and Capacity Map">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every product availability center, commitment service zone, customer address, and demand region is stored as an{' '}
              <span className="tone-pine font-mono">SDO_GEOMETRY</span> point or polygon.
              Oracle Spatial's <span className="tone-pine font-mono">SDO_NN()</span> uses the
              <span className="tone-teal font-mono"> IDX_FC_SPATIAL</span> R-tree to produce nearby candidates;
              <span className="tone-pine font-mono"> SDO_GEOM.SDO_DISTANCE()</span> then measures and deterministically ranks
              eligible fab, contract manufacturing, supplier-direct, and channel-inventory capacity - no external routing API.
              Service zones use <span className="tone-sienna font-mono">SDO_BUFFER</span> circular polygons.
              Demand regions are Oracle <span className="tone-sienna font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="tone-sienna font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs tone-plum mx-1">demand_forecasts</code> table.
              The H3 layer bins customer density client-side via{' '}
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
            <FeatureBadge
              label={`Live DBMS_XPLAN: ${spatialEvidenceStatus}`}
              color={spatialEvidenceStatus === 'ACTIVE' ? 'cyan' : 'yellow'}
            />
            <FeatureBadge label="H3 Hexagonal Grid" color="orange" />
            <FeatureBadge label="SDO_UTIL.TO_GEOJSON" color="orange" />
            <FeatureBadge label="demand_regions" color="red" />
            <FeatureBadge label="demand_forecasts" color="red" />
            <FeatureBadge label="customer_tier" color="purple" />
          </div>
          <SqlBlock code={`-- Stage 1: R-tree indexed candidate selection
WITH origin AS (
  SELECT location FROM customers
  WHERE customer_id = :customer_id
), indexed_candidates AS (
  SELECT /*+ LEADING(origin) USE_NL(fc) INDEX(fc idx_fc_spatial) */
         fc.*, origin.location AS origin_location
  FROM origin
  JOIN fulfillment_centers fc
    ON SDO_NN(fc.location, origin.location,
         'sdo_batch_size=50 unit=KM') = 'TRUE'
  WHERE fc.is_active = 1
), measured_candidates AS (
  -- Stage 2: inventory filter plus exact geodetic measurement
  SELECT fc.center_id, fc.center_name, i.quantity_on_hand,
         ROUND(SDO_GEOM.SDO_DISTANCE(
           fc.origin_location, fc.location,
           0.005, 'unit=KM'), 2) AS distance_km
  FROM indexed_candidates fc
  JOIN inventory i ON i.center_id = fc.center_id
  WHERE i.product_id = :product_id
    AND i.quantity_on_hand > i.quantity_reserved
)
SELECT center_name, quantity_on_hand, distance_km
FROM measured_candidates
ORDER BY distance_km, center_id
FETCH FIRST 3 ROWS ONLY;`} />
          <SqlBlock code={`-- Demand regions: Oracle SDO_GEOMETRY → GeoJSON
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
              <span className="tone-sienna font-mono">hightech_security_pkg.set_user_context()</span>, Oracle
              transparently appends a WHERE clause - product availability managers see only their regional sites,
              while admins and analysts see all rows. <strong>Zero application SQL changes required.</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS Policy" color="red" />
            <FeatureBadge label="VPD (Row-Level Security)" color="red" />
            <FeatureBadge label="HIGHTECH_APP_CTX" color="yellow" />
            <FeatureBadge label="SYS_CONTEXT" color="yellow" />
          </div>
          <SqlBlock code={`-- Trusted package sets Oracle-derived context
BEGIN hightech_security_pkg.set_user_context('fm_west_maria'); END;

-- The VPD policy function (transparent to app SQL):
-- vpd_hightech_operational() returns:
--   fulfillment_mgr → 'state_province IN (''California'')'
--   admin/analyst   → NULL  (no filter, sees all rows)
--   viewer/missing  → '1 = 0' (fail closed)

-- Policy attached to FULFILLMENT_CENTERS:
DBMS_RLS.ADD_POLICY(
  object_name   => 'FULFILLMENT_CENTERS',
  policy_name   => 'VPD_HT_FC',
  function_schema => USER,
  policy_function => 'VPD_HIGHTECH_OPERATIONAL',
  statement_types => 'SELECT,INSERT,UPDATE,DELETE',
  policy_type => DBMS_RLS.CONTEXT_SENSITIVE
);`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Spatial Layer Architecture</p>
            <div className="space-y-1">
              <DiagramBox label="Indexed Candidates" sub="SDO_NN · IDX_FC_SPATIAL R-tree · VPD-aware" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Exact Capacity Ranking" sub="SDO_GEOM.SDO_DISTANCE · inventory filter · deterministic order" color="#4C825C" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Service Zones" sub="SDO_BUFFER circular polygons · 3 tiers" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Strategic Customer Commitments" sub="new · standard · preferred · vip" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="H3 Density Grid" sub="Uber H3 res-4 · demand heatmap" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Product Demand Regions" sub="SDO_GEOMETRY polygons · demand_index 0-100 · forecast join" color="#C74634" />
            </div>
            <div
              className="rounded-lg p-2 text-center mt-2"
              role="status"
              aria-live="polite"
              data-spatial-readiness={spatialEvidenceStatus}
              style={{ background: 'rgba(76,130,92,0.06)', border: '1px dashed rgba(76,130,92,0.25)' }}
            >
              <p className="text-[9px] text-[var(--color-text)]">
                Live evidence: {spatialEvidence?.index_name || 'IDX_FC_SPATIAL'} · DBMS_XPLAN {spatialEvidenceStatus}
              </p>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-1">
                Source: <code>{SPATIAL_READINESS_ENDPOINT}</code>
              </p>
              {spatialEvidence?.plan_evidence && (
                <p className="text-[9px] font-mono text-[var(--color-text-dim)] mt-1 break-words">
                  {spatialEvidence.plan_operator || 'Plan operator'}: {spatialEvidence.plan_evidence}
                </p>
              )}
              {spatialEvidenceError && (
                <p className="text-[9px] tone-red mt-1">
                  Live plan evidence is unavailable: {spatialEvidenceError}
                </p>
              )}
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      <SceneStoryPanel scene="fulfillment" />

      <section className="business-explanation" aria-labelledby="inventory-load-title">
        <div>
          <h3 id="inventory-load-title" className="business-explanation__title">How inventory load is calculated</h3>
          <p className="business-explanation__copy"><strong>Inventory Load = total units on hand across all products ÷ configured site capacity units × 100.</strong> Values at or above 85% are treated as constrained. This is a storage and allocation measure, not forecast demand.</p>
        </div>
        <dl className="business-explanation__metrics">
          <div className="business-explanation__metric"><dt>Below 65%</dt><dd>Capacity is available for order promising.</dd></div>
          <div className="business-explanation__metric"><dt>65%–84%</dt><dd>Review pending commitments and bill of materials alternatives.</dd></div>
          <div className="business-explanation__metric"><dt>85% or higher</dt><dd>Reallocation or additional manufacturing capacity may be required.</dd></div>
        </dl>
      </section>

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" className="fulfillment-page-glyph tone-teal" /> Supply &amp; Commitment Control Tower
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Six spatial layers</span> connect fabs, contract manufacturing, component capacity, order promising, and customer commitments.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="fulfillment-kpi-grid">
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-grid"
          label="Active Supply Sites"
          value={formatNumber(kpis?.active_supply_site_count ?? (centers || []).length)}
          meta="Fabs, contract manufacturers, supplier-direct, and channel nodes"
          badge="Supply network"
          color="#437C94"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-view"
          label="Available Capacity"
          value={formatNumber(kpis?.available_capacity_units ?? totalUnits)}
          meta="Capacity units available for order promising"
          badge="Order promising"
          color="#4C825C"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-tree-document"
          label="Customer Commitments"
          value={formatNumber(kpis?.customer_commitment_count ?? pendingFulfillmentRoutes)}
          meta="Pending, confirmed, or processing commitments"
          badge="Customer demand"
          color="#AA643B"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-message-warning"
          label="Supply Watch Items"
          value={formatNumber(kpis?.component_shortage_alert_count ?? (alerts || []).length)}
          meta={`${formatNumber(shortageAlerts.length)} immediate shortages · ${formatNumber(kpis?.constrained_capacity_site_count || 0)} constrained sites`}
          badge="Supply risk"
          color="#C74634"
        />
      </div>

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isGlobalUser = ['admin', 'analyst'].includes(currentUser.ROLE);
        const isRegionalUser = currentUser.ROLE === 'fulfillment_mgr';
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
                {isRegionalUser
                  ? `Filtered to ${currentUser.REGION} - ${(centers || []).length} supply site${(centers || []).length !== 1 ? 's' : ''} visible`
                  : isGlobalUser
                    ? `Global scope - ${(centers || []).length} supply sites visible`
                    : `Restricted scope - ${(centers || []).length} supply sites visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <JetGlyph iconClass="oj-fwk-icon-view" className="fulfillment-vpd-access-glyph" />
              {isRegionalUser ? 'VPD region-filtered' : isGlobalUser ? 'VPD global' : 'VPD restricted'}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        {/* ── Leaflet Map ── */}
        <FulfillmentMapView
          centers={centers}
          shipments={shipments}
          customers={customers}
          zonesData={zonesData}
          demandRegions={demandRegions}
          layers={layers}
          setLayer={setLayer}
          selectedSite={selectedSiteFromData}
          onSiteSelect={setSelectedSite}
        />
        <SelectedSiteDetail site={selectedSiteFromData} />
      </div>

      {/* ── Supply & Commitment Sites Table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Supply &amp; Commitment Sites</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Site</th>
                <th className="text-left py-2 px-3">Location</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-right py-2 px-3">Products</th>
                <th className="text-right py-2 px-3">On-hand Units</th>
                <th className="text-right py-2 px-3">Commitments</th>
                <th className="text-right py-2 px-3">Inventory Load <HelpTip label="Inventory Load" definition="Total units on hand across all products divided by the site's configured capacity units, multiplied by 100." /></th>
                <th className="text-left py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(centers || []).map(c => (
                <tr key={c.CENTER_ID} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] cursor-pointer" onClick={() => setSelectedSite(c)}>
                  <td className="py-2 px-3 font-medium">{c.CENTER_NAME}</td>
                  <td className="py-2 px-3 text-[var(--color-text-dim)]">{c.CITY}, {c.STATE_PROVINCE}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: `${centerColor(c.CENTER_TYPE)}18`,
                        color: 'var(--color-text)',
                        border: `1px solid ${centerColor(c.CENTER_TYPE)}30`,
                      }}>
                      {siteTypeLabel(c.CENTER_TYPE)}
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
                  <td className="py-2 px-3"><SiteActionChips site={c} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Capacity Alerts ── */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" /> Capacity Alerts - Immediate Shortages and Watchlist
          </h3>
          {shortageAlerts.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-xs font-bold text-[var(--color-text)]">Immediate shortages</h4>
              {shortageAlerts.slice(0, 10).map((a, i) => (
                <div key={`shortage-${i}`} className="p-3 rounded-lg surface-red-soft border border-red-soft">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div><span className="font-bold text-sm">{a.PRODUCT_NAME}</span><span className="text-[var(--color-text-dim)] text-xs ml-2">{a.BRAND_NAME} · {a.CENTER_NAME}</span></div>
                    <div className="flex items-center gap-3 text-xs"><strong>{a.QUANTITY_ON_HAND} in stock</strong><strong>{a.PREDICTED_DEMAND} forecast need</strong><span>Demand factor {a.SOCIAL_FACTOR}×</span></div>
                  </div>
                  <p className="text-xs font-semibold mt-2">{a.ALERT_REASON}</p>
                </div>
              ))}
            </div>
          )}
          {watchlistAlerts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--color-text)]">Watchlist - no immediate shortage</h4>
              {watchlistAlerts.slice(0, 10).map((a, i) => (
                <div key={`watch-${i}`} className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div><span className="font-semibold text-sm">{a.PRODUCT_NAME}</span><span className="text-[var(--color-text-dim)] text-xs ml-2">{a.BRAND_NAME} · {a.CENTER_NAME}</span></div>
                    <div className="flex items-center gap-3 text-xs"><strong>{a.QUANTITY_ON_HAND} in stock</strong><span>{a.PREDICTED_DEMAND} forecast need</span><span>Demand factor {a.SOCIAL_FACTOR}×</span></div>
                  </div>
                  <p className="text-xs text-[var(--color-text-dim)] mt-2">{a.ALERT_REASON}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
