import { useState, useEffect, useMemo } from 'react';
import { MapPin, Truck, AlertTriangle, Package, Layers, Shield, Eye } from 'lucide-react';
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
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const CARRIER_COLORS = { FedEx: '#7B48A5', UPS: '#D4760A', USPS: '#1AADA8', DHL: '#C74634' };

const TIER_COLORS = {
  vip:       '#7B48A5',
  preferred: '#D4760A',
  standard:  '#1B84ED',
  new:       '#6B6560',
};

const ZONE_STYLES = {
  express:   { color: '#C74634', fillOpacity: 0.15, weight: 2.0, dashArray: '4 4' },
  overnight: { color: '#E87B1A', fillOpacity: 0.12, weight: 1.8, dashArray: '5 4' },
  standard:  { color: '#D4760A', fillOpacity: 0.10, weight: 1.5, dashArray: '6 5' },
  economy:   { color: '#2D9F5E', fillOpacity: 0.07, weight: 1.0, dashArray: '8 6' },
};

const LAYER_DEFS = [
  { key: 'customers',     label: 'Customer Tiers',       color: '#2D9F5E' },
  { key: 'centers',       label: 'Fulfillment Centers', color: '#1B84ED' },
  { key: 'routes',        label: 'Shipment Routes',      color: '#7B48A5' },
  { key: 'zones',         label: 'Service Zones',        color: '#D4760A' },
  { key: 'h3',            label: 'H3 Density Grid',      color: '#C74634' },
  { key: 'demandRegions', label: 'Demand Regions',       color: '#E87B1A' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function centerColor(type) {
  if (type === 'distribution') return '#1B84ED';
  if (type === 'warehouse')    return '#2D9F5E';
  return '#D4760A';
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
  if (index >= 70) return { fill: '#E87B1A', stroke: '#E87B1A', opacity: 0.35 };
  if (index >= 55) return { fill: '#D4760A', stroke: '#D4760A', opacity: 0.28 };
  if (index >= 40) return { fill: '#6BAD45', stroke: '#6BAD45', opacity: 0.22 };
  return                  { fill: '#2D9F5E', stroke: '#2D9F5E', opacity: 0.18 };
}

// Heat-color scale: high density → red, low → green (Redwood palette, aerial map)
function h3HeatColor(ratio) {
  if (ratio > 0.75) return { fill: '#C74634', stroke: '#C74634', opacity: 0.60 };
  if (ratio > 0.50) return { fill: '#E87B1A', stroke: '#E87B1A', opacity: 0.50 };
  if (ratio > 0.25) return { fill: '#D4760A', stroke: '#D4760A', opacity: 0.42 };
  if (ratio > 0.10) return { fill: '#6BAD45', stroke: '#6BAD45', opacity: 0.35 };
  return                    { fill: '#2D9F5E', stroke: '#2D9F5E', opacity: 0.28 };
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

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function LayerToggle({ label, active, color, onToggle }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        onClick={onToggle}
        className="relative flex-shrink-0 transition-all duration-200"
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: active ? color : 'rgba(255,255,255,0.08)',
          border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        <div
          className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200"
          style={{
            background: active ? '#fff' : 'rgba(255,255,255,0.35)',
            left: active ? '15px' : '1px',
            boxShadow: active ? `0 0 6px ${color}88` : 'none',
          }}
        />
      </button>
      <span className="text-[11px] leading-none" style={{ color: active ? '#e2e2f0' : '#666666' }}>
        {label}
      </span>
    </label>
  );
}

// ── Map View ──────────────────────────────────────────────────────────────────
function FulfillmentMapView({ centers, shipments, customers, zonesData, demandRegions, layers, toggle }) {
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
      boundary: cellToBoundary(cellId),   // [[lat, lng], ...] — native Leaflet format
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
    <div className="glass-card overflow-hidden relative" style={{ height: 560 }}>
      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ height: '100%', width: '100%', background: '#161616' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/* Esri World Imagery — aerial/satellite tiles */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
          maxZoom={19}
          className="aerial-tiles"
        />

        <FitBounds centers={centers} active={layers.centers} />

        {/* ── LAYER: Demand Regions (SDO_GEOMETRY polygons, colored by demand_index) ── */}
        {/* Sorted largest-area-first so smaller regions render on top and stay clickable */}
        {layers.demandRegions && sortedDemandRegions.map(r => {
          if (!r.COORDS?.length) return null;
          const { fill, stroke, opacity } = demandColor(r.DEMAND_INDEX || 50);
          const label = r.DEMAND_INDEX >= 85 ? 'Hot Market 🔴'
                      : r.DEMAND_INDEX >= 70 ? 'High Demand 🟠'
                      : r.DEMAND_INDEX >= 55 ? 'Moderate 🟡'
                      : r.DEMAND_INDEX >= 40 ? 'Low 🟢'
                      : 'Slow 🟢';
          return (
            <Polygon
              key={`dr-${r.REGION_ID}`}
              positions={r.COORDS}
              pathOptions={{ fillColor: fill, fillOpacity: opacity, color: stroke, weight: 2.0, opacity: 0.85 }}
            >
              <Tooltip sticky className="demand-tooltip">
                <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 200, padding: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 5 }}>
                    {r.REGION_NAME}
                    <span style={{ fontSize: 10, color: '#999999', marginLeft: 6, textTransform: 'capitalize' }}>{r.REGION_TYPE}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px' }}>
                    <span style={{ color: '#999999' }}>Demand Index</span>
                    <span style={{ color: fill, fontWeight: 700, fontSize: 13 }}>{r.DEMAND_INDEX} — {label}</span>
                    <span style={{ color: '#999999' }}>Population</span>
                    <span>{r.POPULATION ? (r.POPULATION / 1e6).toFixed(1) + 'M' : '—'}</span>
                    <span style={{ color: '#999999' }}>Avg Income</span>
                    <span>${r.AVG_INCOME ? Number(r.AVG_INCOME).toLocaleString() : '—'}</span>
                    <span style={{ color: '#999999' }}>Social Density</span>
                    <span>{r.SOCIAL_DENSITY}/1k pop</span>
                    {r.AVG_7DAY_FORECAST && <>
                      <span style={{ color: '#999999' }}>7-Day Forecast</span>
                      <span style={{ color: '#D4760A' }}>{Number(r.AVG_7DAY_FORECAST).toLocaleString()} units/day</span>
                    </>}
                    {r.PEAK_SOCIAL_FACTOR && <>
                      <span style={{ color: '#999999' }}>Peak Social ×</span>
                      <span style={{ color: '#7B48A5' }}>{r.PEAK_SOCIAL_FACTOR}×</span>
                    </>}
                    {r.FORECAST_PRODUCTS > 0 && <>
                      <span style={{ color: '#999999' }}>Products tracked</span>
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
                  {' '}zone · ≤{z.RADIUS_KM} km · {z.MAX_DELIVERY_HRS}h delivery
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

        {/* ── LAYER: Shipment Routes (polylines colored by carrier) ── */}
        {layers.routes && (shipments || []).map(s => {
          if (!s.CENTER_LAT || !s.CUSTOMER_LAT) return null;
          return (
            <Polyline
              key={s.SHIPMENT_ID}
              positions={[[s.CENTER_LAT, s.CENTER_LON], [s.CUSTOMER_LAT, s.CUSTOMER_LON]]}
              color={CARRIER_COLORS[s.CARRIER] || '#6b7280'}
              weight={2}
              opacity={0.65}
            />
          );
        })}

        {/* ── LAYER: Customer Tiers (small dots colored by tier) ── */}
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

        {/* ── LAYER: Fulfillment Centers (large markers with popups) ── */}
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
                <p style={{ color: '#999999', fontSize: 11, marginBottom: 6 }}>{c.CITY}, {c.STATE_PROVINCE}</p>
                <span style={{
                  display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: 10,
                  background: `${centerColor(c.CENTER_TYPE)}22`,
                  color: centerColor(c.CENTER_TYPE),
                  marginBottom: 8, textTransform: 'capitalize',
                }}>
                  {c.CENTER_TYPE}
                </span>
                <div style={{ fontSize: 12, lineHeight: 1.9 }}>
                  <div><span style={{ color: '#999999' }}>Products: </span>{formatNumber(c.PRODUCTS_STOCKED)}</div>
                  <div><span style={{ color: '#999999' }}>Inventory: </span>{formatNumber(c.TOTAL_UNITS)} units</div>
                  <div><span style={{ color: '#999999' }}>Pending: </span>{c.PENDING_SHIPMENTS} shipments</div>
                  <div><span style={{ color: '#999999' }}>Load: </span>{c.CURRENT_LOAD_PCT}%</div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Layer Control Panel (top-left overlay) ── */}
      <div
        className="absolute top-3 left-3 z-[1000] p-3 rounded-xl space-y-2"
        style={{ background: 'rgba(22,22,22,0.92)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(14px)', minWidth: 185, pointerEvents: 'auto' }}
      >
        <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5 flex items-center gap-1.5"
           style={{ color: '#666666' }}>
          <Layers size={10} /> Map Layers
        </p>
        {LAYER_DEFS.map(def => (
          <LayerToggle
            key={def.key}
            label={def.label}
            active={layers[def.key]}
            color={def.color}
            onToggle={() => toggle(def.key)}
          />
        ))}
      </div>

      {/* ── Dynamic Legend (bottom-left) ── */}
      <div className="absolute bottom-4 left-4 z-[1000] text-[10px] bg-[var(--color-surface)]/90 px-3 py-2 rounded-lg border border-[var(--color-border)] pointer-events-none space-y-1.5"
           style={{ color: 'var(--color-text-dim)', maxWidth: 420 }}>
        {layers.centers && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Distribution</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Warehouse</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Micro/Store</span>
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
            {[['#C74634','High'],['#E87B1A',''],['#D4760A',''],['#84cc16',''],['#2D9F5E','Low']].map(([c, l], i) => (
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
              <span className="inline-block w-5 border-t-2 border-red-500 border-dashed" /> Express ≤80 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-yellow-500 border-dashed" /> Standard ≤250 km
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-5 border-t-2 border-green-500 border-dashed" /> Economy ≤500 km
            </span>
          </div>
        )}
        {layers.routes && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-violet-500 inline-block" /> FedEx</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 inline-block" /> UPS</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-sky-500 inline-block" /> USPS</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-500 inline-block" /> DHL</span>
          </div>
        )}
        {layers.demandRegions && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-1">Demand Index:</span>
            {[['#C74634','≥85 Hot'],['#E87B1A','≥70'],['#D4760A','≥55'],['#84cc16','≥40'],['#2D9F5E','Low']].map(([c, l]) => (
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
        <div><span className="text-cyan-400">SDO_GEOMETRY</span> spatial routing</div>
        {layers.h3 && (
          <div><span className="text-orange-400">H3 res-4</span> · {h3Cells.length} hexagons · {customers?.length ?? 0} customers</div>
        )}
        {layers.zones && (
          <div style={{ color: zonesSource === 'database' ? '#4ade80' : '#fbbf24' }}>
            Zones: {zonesSource === 'database' ? 'Oracle SDO_BUFFER' : 'computed from centers'}
          </div>
        )}
        {layers.demandRegions && (
          <div><span className="text-orange-400">SDO_UTIL.TO_GEOJSON</span> · {(demandRegions || []).length} regions</div>
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
  const toggle = key => setLayers(l => ({ ...l, [key]: !l[key] }));

  // VPD-aware: refetch when user switches (X-Demo-User header changes server-side filtering)
  const userKey = currentUser?.USERNAME;
  const { data: centers }       = useData(() => api.fulfillment.centers(), [userKey]);
  const { data: alerts }        = useData(() => api.fulfillment.alerts(), [userKey]);
  const { data: shipments }     = useData(() => api.fulfillment.shipments({ limit: 30 }), [userKey]);
  const { data: customers }     = useData(() => api.fulfillment.customers(), [userKey]);
  const { data: zonesData }     = useData(() => api.fulfillment.zones(), [userKey]);
  const { data: demandRegions } = useData(() => api.fulfillment.demandRegions(), [userKey]);

  const totalUnits      = (centers || []).reduce((s, c) => s + (c.TOTAL_UNITS      || 0), 0);
  const pendingShipments = (centers || []).reduce((s, c) => s + (c.PENDING_SHIPMENTS || 0), 0);

  return (
    <div className="space-y-6 fade-in">

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Fulfillment Map">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every fulfillment center, service zone, customer address, and demand region is stored as an{' '}
              <span className="text-green-400 font-mono">SDO_GEOMETRY</span> point or polygon.
              Oracle Spatial's <span className="text-green-400 font-mono">SDO_GEOM.SDO_DISTANCE()</span> ranks
              all warehouses by proximity in a single SQL — no external routing API.
              Service zones use <span className="text-yellow-400 font-mono">SDO_BUFFER</span> circular polygons.
              Demand regions are Oracle <span className="text-orange-400 font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="text-orange-400 font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs text-purple-300 mx-1">demand_forecasts</code> table.
              The H3 layer bins customer density client-side via{' '}
              <span className="text-orange-400 font-mono">h3-js</span>.
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
            <FeatureBadge label="customer_tier" color="purple" />
          </div>
          <SqlBlock code={`-- Nearest fulfillment center with stock
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
              Oracle <span className="text-red-400 font-mono">DBMS_RLS</span> applies a row-level security policy
              to <code className="text-xs text-cyan-300 mx-1">FULFILLMENT_CENTERS</code>. When a user is set via{' '}
              <span className="text-yellow-400 font-mono">sc_security_ctx.set_user_context()</span>, Oracle
              transparently appends a WHERE clause — fulfillment managers see only their regional centers,
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
              <DiagramBox label="🏭 Fulfillment Centers" sub="SDO_GEOMETRY points · R-Tree index" color="#1B84ED" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="📦 Service Zones" sub="SDO_BUFFER circular polygons · 3 tiers" color="#D4760A" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="👤 Customer Tiers" sub="new · standard · preferred · vip" color="#7B48A5" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="🔷 H3 Density Grid" sub="Uber H3 res-4 · demand heatmap" color="#E87B1A" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="🗺️ Demand Regions" sub="SDO_GEOMETRY polygons · demand_index 0-100 · forecast join" color="#C74634" />
            </div>
            <div className="rounded-lg p-2 text-center mt-2" style={{ background: 'rgba(45,159,94,0.06)', border: '1px dashed rgba(45,159,94,0.25)' }}>
              <p className="text-[9px]" style={{ color: '#6b7280' }}>
                All geometry stored in Oracle · Spatial index = sub-millisecond proximity queries
              </p>
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="text-cyan-400" /> Smart Fulfillment Map
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          <span className="text-cyan-400">Six spatial layers</span> — centers, zones, routes, customer tiers, H3 density &amp; demand regions — all toggle-able
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <Package size={16} className="text-blue-400 mb-2" />
          <p className="text-xl font-bold">{(centers || []).length}</p>
          <p className="text-xs text-[var(--color-text-dim)]">Active Centers</p>
        </div>
        <div className="stat-card">
          <MapPin size={16} className="text-green-400 mb-2" />
          <p className="text-xl font-bold">{formatNumber(totalUnits)}</p>
          <p className="text-xs text-[var(--color-text-dim)]">Total Inventory</p>
        </div>
        <div className="stat-card">
          <Truck size={16} className="text-yellow-400 mb-2" />
          <p className="text-xl font-bold">{formatNumber(pendingShipments)}</p>
          <p className="text-xs text-[var(--color-text-dim)]">Pending Shipments</p>
        </div>
        <div className="stat-card">
          <AlertTriangle size={16} className="text-red-400 mb-2" />
          <p className="text-xl font-bold">{(alerts || []).length}</p>
          <p className="text-xs text-[var(--color-text-dim)]">Inventory Alerts</p>
        </div>
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
            <Shield size={14} style={{ color: roleMeta.color }} />
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <span className="font-semibold" style={{ color: roleMeta.color }}>
                {currentUser.FULL_NAME}
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                style={{ background: `${roleMeta.color}20`, color: roleMeta.color }}
              >
                {roleMeta.label}
              </span>
              <span className="text-[var(--color-text-dim)] text-xs">
                {isFM
                  ? `Filtered to ${currentUser.REGION} — ${(centers || []).length} center${(centers || []).length !== 1 ? 's' : ''} visible`
                  : `${(centers || []).length} centers visible`
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
              <Eye size={10} />
              VPD {isFM ? 'region-filtered' : 'full access'}
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
        toggle={toggle}
      />

      {/* ── Fulfillment Centers Table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Fulfillment Centers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Center</th>
                <th className="text-left py-2 px-3">Location</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-right py-2 px-3">Products</th>
                <th className="text-right py-2 px-3">Inventory</th>
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
                      style={{ background: `${centerColor(c.CENTER_TYPE)}18`, color: centerColor(c.CENTER_TYPE) }}>
                      {c.CENTER_TYPE}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">{formatNumber(c.PRODUCTS_STOCKED)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(c.TOTAL_UNITS)}</td>
                  <td className="py-2 px-3 text-right">{c.PENDING_SHIPMENTS}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={c.CURRENT_LOAD_PCT > 85 ? 'text-red-400' : c.CURRENT_LOAD_PCT > 65 ? 'text-yellow-400' : 'text-green-400'}>
                      {c.CURRENT_LOAD_PCT}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Inventory Alerts ── */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" /> Inventory Alerts — Social Demand Surge
          </h3>
          <div className="space-y-2">
            {(alerts || []).slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <div>
                  <span className="font-medium text-sm">{a.PRODUCT_NAME}</span>
                  <span className="text-[var(--color-text-dim)] text-xs ml-2">{a.BRAND_NAME} · {a.CENTER_NAME}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className={a.STOCK_STATUS === 'out_of_stock' || a.STOCK_STATUS === 'critical' ? 'text-red-400 font-bold' : 'text-yellow-400'}>
                    {a.QUANTITY_ON_HAND} in stock
                  </span>
                  <span className="text-[var(--color-text-dim)]">Need: {a.PREDICTED_DEMAND}</span>
                  <span className="text-orange-400">Social: {a.SOCIAL_FACTOR}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
