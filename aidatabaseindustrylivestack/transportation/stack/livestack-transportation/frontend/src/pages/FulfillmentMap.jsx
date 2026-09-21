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
import { JetSelectSingle, JetSwitch } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';
import { TransportationStoryPanel } from '../components/TransportationStory';

// ── Constants ─────────────────────────────────────────────────────────────────
const CARRIER_COLORS = {
  FedEx: '#796087',
  UPS: '#AA643B',
  USPS: '#4F7D7B',
  DHL: '#C74634',
  TerminalFleet: '#437C94',
  'MetroLine Fleet': '#AA643B',
  'RoadRunner Freight': '#4F7D7B',
  'PortRoute Express': '#C74634',
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
  { key: 'shippers',     label: 'Shipper Risk Tiers',       color: '#4C825C' },
  { key: 'centers',       label: 'Logistics Terminals', color: '#437C94' },
  { key: 'routes',        label: 'Shipment Routes',      color: '#796087' },
  { key: 'zones',         label: 'Service Zones',        color: '#AA643B' },
  { key: 'h3',            label: 'Shipper Density Grid',      color: '#C74634' },
  { key: 'demandRegions', label: 'Transport Demand Regions',       color: '#AA643B' },
];

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

function FulfillmentKpiCard({ iconClass, label, value, meta, badge, color }) {
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
  if (type === 'transport hub')    return '#4C825C';
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

// ── Map View ──────────────────────────────────────────────────────────────────
function FulfillmentMapView({ centers, shipments, shippers, zonesData, demandRegions, layers, setLayer, selectedRouteId, setSelectedRouteId, routeOptions }) {
  // H3 hexagonal density bins from shipper lat/lng at resolution 4
  const h3Cells = useMemo(() => {
    if (!shippers?.length) return [];
    const counts = {};
    shippers.forEach(c => {
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
  }, [shippers]);

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
  const visibleShipments = useMemo(() => {
    if (!layers.routes) return [];
    if (!selectedRouteId || selectedRouteId === 'all') return shipments || [];
    return (shipments || []).filter(s => String(s.SHIPMENT_ID) === String(selectedRouteId));
  }, [layers.routes, selectedRouteId, shipments]);

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

        {/* ── LAYER: Transport Demand Regions (SDO_GEOMETRY polygons, colored by demand_index) ── */}
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
                    <span style={{ color: '#697778' }}>Service area scale</span>
                    <span>{r.POPULATION ? (r.POPULATION / 1e6).toFixed(1) + 'M' : '-'}</span>
                    <span style={{ color: '#697778' }}>Freight value index</span>
                    <span>${r.AVG_INCOME ? Number(r.AVG_INCOME).toLocaleString() : '-'}</span>
                    <span style={{ color: '#697778' }}>Signal density</span>
                    <span>{r.SOCIAL_DENSITY}/1k shippers</span>
                    {r.AVG_7DAY_FORECAST && <>
                      <span style={{ color: '#697778' }}>7-Day Forecast</span>
                      <span style={{ color: '#AA643B' }}>{Number(r.AVG_7DAY_FORECAST).toLocaleString()} loads/day</span>
                    </>}
                    {r.PEAK_SOCIAL_FACTOR && <>
                      <span style={{ color: '#697778' }}>Peak signal factor</span>
                      <span style={{ color: '#796087' }}>{r.PEAK_SOCIAL_FACTOR}×</span>
                    </>}
                    {r.FORECAST_PRODUCTS > 0 && <>
                      <span style={{ color: '#697778' }}>Services tracked</span>
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
                  {' '}zone · ≤{z.RADIUS_KM} km · {z.MAX_DELIVERY_HRS}h delivery response
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* ── LAYER: Shipper Density Grid (H3 hexagonal demand heatmap) ── */}
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
                  <strong>{cell.count}</strong> shippers<br />
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

        {/* ── LAYER: Shipment Routes (polylines colored by carrier) ── */}
        {visibleShipments.map(s => {
          if (!s.CENTER_LAT || !s.CUSTOMER_LAT) return null;
          const isFocused = selectedRouteId !== 'all' && String(s.SHIPMENT_ID) === String(selectedRouteId);
          const routeColor = CARRIER_COLORS[s.CARRIER] || '#6F757E';
          return (
            <Polyline
              key={s.SHIPMENT_ID}
              positions={[[s.CENTER_LAT, s.CENTER_LON], [s.CUSTOMER_LAT, s.CUSTOMER_LON]]}
              color={routeColor}
              weight={isFocused ? 5 : 2.4}
              opacity={isFocused ? 0.96 : 0.52}
            >
              <Tooltip sticky>
                <div style={{ fontSize: 11, lineHeight: 1.55 }}>
                  <strong>{s.CARRIER}</strong> - Order #{s.ORDER_ID}<br />
                  {s.CENTER_NAME} to {s.CUSTOMER_CITY}<br />
                  {s.DISTANCE_MILES ? `${s.DISTANCE_MILES} miles` : 'Distance pending'} · {s.SHIP_STATUS}
                </div>
              </Tooltip>
            </Polyline>
          );
        })}

        {selectedRouteId !== 'all' && visibleShipments.map(s => {
          if (!s.CENTER_LAT || !s.CUSTOMER_LAT) return null;
          const routeColor = CARRIER_COLORS[s.CARRIER] || '#6F757E';
          return (
            [
              <CircleMarker
                key={`route-start-${s.SHIPMENT_ID}`}
                center={[s.CENTER_LAT, s.CENTER_LON]}
                radius={6}
                pathOptions={{ fillColor: routeColor, fillOpacity: 1, color: '#fff', weight: 2 }}
              >
                <Tooltip sticky>{s.CENTER_NAME}</Tooltip>
              </CircleMarker>,
              <CircleMarker
                key={`route-end-${s.SHIPMENT_ID}`}
                center={[s.CUSTOMER_LAT, s.CUSTOMER_LON]}
                radius={6}
                pathOptions={{ fillColor: '#312D2A', fillOpacity: 1, color: routeColor, weight: 2 }}
              >
                <Tooltip sticky>Order #{s.ORDER_ID} destination - {s.CUSTOMER_CITY}</Tooltip>
              </CircleMarker>,
            ]
          );
        })}

        {/* ── LAYER: Shipper Risk Tiers (small dots colored by tier) ── */}
        {layers.shippers && (shippers || []).map((c, i) => {
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
                  Shipper value: {formatCurrency(c.LIFETIME_VALUE)}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* ── LAYER: Logistics Terminals (large markers with popups) ── */}
        {layers.centers && (centers || []).map(c => (
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
                  {c.CENTER_TYPE}
                </span>
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  <div><span style={{ color: '#697778' }}>Services: </span>{formatNumber(c.PRODUCTS_STOCKED)}</div>
                  <div><span style={{ color: '#697778' }}>Available capacity: </span>{formatNumber(c.TOTAL_UNITS)} units</div>
                  <div><span style={{ color: '#697778' }}>Pending: </span>{c.PENDING_SHIPMENTS} shipments</div>
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
        {layers.routes && (
          <div className="fulfillment-route-focus">
            <label className="fulfillment-route-focus__label" htmlFor="shipment-route-focus">
              Shipment Route
            </label>
            <JetSelectSingle
              id="shipment-route-focus"
              value={selectedRouteId}
              options={routeOptions}
              ariaLabel="Focus shipment route"
              className="fulfillment-route-focus__select"
              onValueChange={setSelectedRouteId}
            />
          </div>
        )}
      </div>

      {/* ── Dynamic Legend (bottom-left) ── */}
      <div className="absolute bottom-4 left-4 z-[1000] text-[10px] bg-[var(--color-surface)]/90 px-3 py-2 rounded-lg border border-[var(--color-border)] pointer-events-none space-y-1.5"
           style={{ color: 'var(--color-text-dim)', maxWidth: 420 }}>
        {layers.centers && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-ocean inline-block" /> Distribution</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-pine inline-block" /> Terminal</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> Local terminal</span>
          </div>
        )}
        {layers.shippers && (
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
            <span className="mr-1">Shipper density:</span>
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
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-ocean inline-block" /> TerminalFleet</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-sienna inline-block" /> MetroLine</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-teal inline-block" /> RoadRunner</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-red inline-block" /> PortRoute</span>
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
        <div><span className="tone-teal">SDO_GEOMETRY</span> network capacity routing</div>
        {layers.h3 && (
          <div><span className="tone-sienna">H3 res-4</span> · {h3Cells.length} demand cells · {shippers?.length ?? 0} shippers</div>
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
    shippers:     false,
    h3:            false,
    demandRegions: false,
  });
  const [selectedRouteId, setSelectedRouteId] = useState('all');
  const setLayer = (key, value) => setLayers(l => ({ ...l, [key]: value }));

  // VPD-aware: refetch when user switches (X-Demo-User header changes server-side filtering)
  const userKey = currentUser?.USERNAME;
  const { data: centers }       = useData(() => api.fulfillment.centers(), [userKey]);
  const { data: alerts }        = useData(() => api.fulfillment.alerts(), [userKey]);
  const { data: shipments }     = useData(() => api.fulfillment.shipments({ limit: 30 }), [userKey]);
  const { data: shippers }     = useData(() => api.fulfillment.customers(), [userKey]);
  const { data: zonesData }     = useData(() => api.fulfillment.zones(), [userKey]);
  const { data: demandRegions } = useData(() => api.fulfillment.demandRegions(), [userKey]);

  const routeOptions = useMemo(() => [
    { value: 'all', label: 'All shipment routes' },
    ...((shipments || []).slice(0, 30).map(s => ({
      value: String(s.SHIPMENT_ID),
      label: `#${s.ORDER_ID} ${s.CARRIER} - ${s.CENTER_CITY} to ${s.CUSTOMER_CITY}`,
    }))),
  ], [shipments]);

  const totalUnits      = (centers || []).reduce((s, c) => s + (c.TOTAL_UNITS      || 0), 0);
  const pendingShipments = (centers || []).reduce((s, c) => s + (c.PENDING_SHIPMENTS || 0), 0);

  return (
    <div className="space-y-6 fade-in">
      <TransportationStoryPanel scene="fulfillment" />

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Network Capacity & Rerouting">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every logistics terminal, service zone, shipper address, and demand region is stored as an{' '}
              <span className="tone-pine font-mono">SDO_GEOMETRY</span> point or polygon.
              Oracle Spatial's <span className="tone-pine font-mono">SDO_GEOM.SDO_DISTANCE()</span> ranks
              all transport hubs by proximity in a single SQL - no external routing API.
              Service zones use <span className="tone-sienna font-mono">SDO_BUFFER</span> circular polygons.
              Demand regions are Oracle <span className="tone-sienna font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="tone-sienna font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs tone-plum mx-1">demand_forecasts</code> table.
              The shipper density layer bins customer demand client-side via{' '}
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
            <FeatureBadge label="Shipper Density Grid" color="orange" />
            <FeatureBadge label="SDO_UTIL.TO_GEOJSON" color="orange" />
            <FeatureBadge label="demand_regions" color="red" />
            <FeatureBadge label="demand_forecasts" color="red" />
            <FeatureBadge label="shipper_tier" color="purple" />
          </div>
          <SqlBlock code={`-- Nearest logistics terminal with stock
SELECT fc.center_name, fc.city,
       ROUND(SDO_GEOM.SDO_DISTANCE(
         c.location, fc.location, 0.005, 'unit=KM'), 2) AS dist_km,
       i.quantity_on_hand
FROM   shippers c
CROSS  JOIN fulfillment_centers fc
JOIN   inventory i
          ON  i.center_id  = fc.center_id
          AND i.product_id = :product_id
WHERE  c.shipper_id = :shipper_id
  AND  fc.is_active  = 1
  AND  i.quantity_on_hand > i.quantity_reserved
ORDER  BY dist_km
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
      AND df.forecast_date BETWEEN (
            SELECT COALESCE(
              MIN(CASE WHEN forecast_date >= TRUNC(SYSDATE) THEN forecast_date END),
              MIN(forecast_date)
            )
            FROM demand_forecasts
          )
          AND (
            SELECT COALESCE(
              MIN(CASE WHEN forecast_date >= TRUNC(SYSDATE) THEN forecast_date END),
              MIN(forecast_date)
            ) + 7
            FROM demand_forecasts
          )
GROUP BY r.region_id, r.region_name,
         r.demand_index, r.boundary
ORDER BY r.demand_index DESC;`} />
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed mb-2">
              Oracle <span className="tone-red font-mono">DBMS_RLS</span> applies a row-level security policy
              to <code className="text-xs tone-teal mx-1">FULFILLMENT_CENTERS</code>. When a user is set via{' '}
              <span className="tone-sienna font-mono">sc_security_ctx.set_user_context()</span>, Oracle
              transparently appends a WHERE clause - dispatch managers see only their regional centers,
              while admins and analysts see all rows. <strong>Zero application SQL changes required.</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="DBMS_RLS Policy" color="red" />
            <FeatureBadge label="VPD (Row-Level Security)" color="red" />
            <FeatureBadge label="sc_security_ctx" color="yellow" />
            <FeatureBadge label="SYS_CONTEXT" color="yellow" />
          </div>
          <SqlBlock code={`-- VPD: Set user context before every query
BEGIN sc_security_ctx.set_user_context('fm_west_maria'); END;

-- The VPD policy function (transparent to app SQL):
-- vpd_fulfillment_region() returns:
--   fulfillment_mgr → 'state_province IN (''California'')'
--   admin/analyst   → NULL  (no filter, sees all rows)
--   viewer          → 'is_active = 1'

-- Policy attached to FULFILLMENT_CENTERS:
DBMS_RLS.ADD_POLICY(
  object_name   => 'FULFILLMENT_CENTERS',
  policy_name   => 'VPD_FC_REGION',
  function_schema => USER,
  policy_function => 'VPD_FULFILLMENT_REGION',
  statement_types => 'SELECT,UPDATE'
);`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Spatial Layer Architecture</p>
            <div className="space-y-1">
              <DiagramBox label="Logistics Terminals" sub="SDO_GEOMETRY points · R-Tree index" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Service Zones" sub="SDO_BUFFER circular polygons · 3 tiers" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Shipper Risk Tiers" sub="new · standard · preferred · vip" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Shipper Density Grid" sub="H3 res-4 · demand heatmap" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Transport Demand Regions" sub="SDO_GEOMETRY polygons · demand_index 0-100 · forecast join" color="#C74634" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(76,130,92,0.06)', border: '1px dashed rgba(76,130,92,0.25)' }}>
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
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" className="fulfillment-page-glyph tone-teal" /> Network Capacity & Rerouting
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="tone-teal">Six spatial layers</span> - terminals, zones, shipment routes, shipper tiers, density, and demand regions - all toggle-able
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="fulfillment-kpi-grid">
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-grid"
          color="#437C94"
          badge="Network footprint"
          value={formatNumber((centers || []).length)}
          label="Active Terminals"
          meta="Terminals represented in the network map"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-view"
          color="#4C825C"
          badge="Capacity pool"
          value={formatNumber(totalUnits)}
          label="Available Capacity"
          meta="Capacity units available for rerouting"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-tree-document"
          color="#AA643B"
          badge="Open shipments"
          value={formatNumber(pendingShipments)}
          label="Pending Shipments"
          meta="Shipments awaiting routing or delivery"
        />
        <FulfillmentKpiCard
          iconClass="oj-fwk-icon-message-warning"
          color="#C74634"
          badge="At-risk routes"
          value={formatNumber((alerts || []).length)}
          label="Capacity Alerts"
          meta="Capacity alerts requiring operational attention"
        />
      </div>

      {/* ── VPD Context Banner ── */}
      {currentUser && (() => {
        const roleMeta = ROLE_META[currentUser.ROLE] || ROLE_META.viewer;
        const isFM = currentUser.ROLE === 'fulfillment_mgr';
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
                  ? `Filtered to ${currentUser.REGION} - ${(centers || []).length} terminal${(centers || []).length !== 1 ? 's' : ''} visible`
                  : `${(centers || []).length} terminals visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <JetGlyph iconClass="oj-fwk-icon-view" className="fulfillment-vpd-access-glyph" />
              VPD {isFM ? 'region-filtered' : 'full access'}
            </div>
          </div>
        );
      })()}

      {/* ── Leaflet Map ── */}
      <FulfillmentMapView
        centers={centers}
        shipments={shipments}
        shippers={shippers}
        zonesData={zonesData}
        demandRegions={demandRegions}
        layers={layers}
        setLayer={setLayer}
        selectedRouteId={selectedRouteId}
        setSelectedRouteId={setSelectedRouteId}
        routeOptions={routeOptions}
      />

      {/* ── Logistics Terminals Table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Logistics Terminals</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Terminal</th>
                <th className="text-left py-2 px-3">Location</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-right py-2 px-3">Services</th>
                <th className="text-right py-2 px-3">Capacity</th>
                <th className="text-right py-2 px-3">Pending</th>
                <th className="text-right py-2 px-3">Load</th>
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
                      {c.CENTER_TYPE}
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

      {/* ── Capacity Alerts ── */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" /> Capacity Alerts - Demand Surge
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
                    {a.QUANTITY_ON_HAND} capacity units
                  </span>
                  <span className="text-[var(--color-text-dim)]">Need: {a.PREDICTED_DEMAND}</span>
                  <span className="text-[var(--color-text)]">Signal factor: {a.SOCIAL_FACTOR}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
