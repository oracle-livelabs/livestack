import { useState, useEffect, useMemo } from 'react';
import {
  MapContainer, TileLayer, CircleMarker, Circle, Polygon,
  Polyline, Popup, Tooltip, useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { latLngToCell, cellToBoundary } from 'h3-js';
import { api } from '../utils/api';
import { useData } from '../hooks/useData';
import { formatNumber, formatCurrency, formatDate } from '../utils/format';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { SceneStoryPanel } from '../components/HealthcareStory';
import { JetSwitch } from '../components/JetControls';
import { RegisterOraclePanel } from '../context/OraclePanelContext';
import { useUser } from '../context/UserContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const SPATIAL_READINESS_ENDPOINT = '/api/fulfillment/spatial-readiness';

const CARRIER_COLORS = {
  CryoLine: '#796087',
  'Specialty Care Courier': '#AA643B',
  TrialFreight: '#AA643B',
  SafeTemp: '#4F7D7B',
  'Clinical Express': '#C74634',
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
  { key: 'customers',     label: 'Care Site Tiers',          color: '#4C825C' },
  { key: 'centers',       label: 'Care Logistics Sites',         color: '#437C94' },
  { key: 'routes',        label: 'Care Logistics Routes',      color: '#796087' },
  { key: 'zones',         label: 'Care Logistics Zones',        color: '#AA643B' },
  { key: 'h3',            label: 'Care Site Density Grid',      color: '#C74634' },
  { key: 'demandRegions', label: 'Care Demand Regions',       color: '#AA643B' },
];

const CENTER_TYPE_LABELS = {
  distribution: 'Distribution Hub',
  warehouse: 'Care Supply Warehouse',
  micro: 'Micro Fulfillment Site',
  store: 'Micro Fulfillment Site',
  drop_ship: 'Partner Logistics Site',
};

const TIER_LABELS = {
  preferred: 'Preferred Care Route',
  standard: 'Standard Care Route',
  new: 'New / Unvalidated Route',
  vip: 'Priority Care Route',
};

const ZONE_LABELS = {
  express: 'Urgent Care Logistics',
  overnight: 'Next-Day Care Logistics',
  standard: 'Standard Care Route',
  economy: 'Routine Replenishment',
};

const ZONE_LEGEND_ITEMS = [
  { key: 'express', label: 'Urgent Care Logistics', radius: '80 km', color: '#C74634' },
  { key: 'overnight', label: 'Next-Day Care Logistics', radius: '160 km', color: '#AA643B' },
  { key: 'standard', label: 'Standard Care Route', radius: '250 km', color: '#AA643B' },
  { key: 'economy', label: 'Routine Replenishment', radius: '500 km', color: '#4C825C' },
];

const DEMAND_LEVEL_LABELS = [
  { color: '#C74634', label: '>=85 Critical' },
  { color: '#AA643B', label: '>=70 High' },
  { color: '#AA643B', label: '>=55 Moderate' },
  { color: '#5F7D4F', label: '>=40 Lower' },
  { color: '#4C825C', label: 'Stable' },
];

function titleizeKey(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function JetGlyph({ iconClass, className = '', style }) {
  return <span className={`oj-fwk-icon ${iconClass} ${className}`.trim()} aria-hidden="true" style={style} />;
}

function FulfillmentStatCard({ iconClass, toneClass, value, label, subtext }) {
  return (
    <div className="stat-card fulfillment-stat-card">
      <div className="fulfillment-stat-card__copy">
        <p className="fulfillment-stat-card__value">{value}</p>
        <p className="fulfillment-stat-card__label">{label}</p>
        {subtext && <p className="fulfillment-stat-card__subtext">{subtext}</p>}
      </div>
      <div className={`fulfillment-stat-card__glyph ${toneClass}`}>
        <JetGlyph iconClass={iconClass} className="fulfillment-stat-card__glyph-icon" />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function kpiMetric(source, key, fallback = 0) {
  const value = source?.[key] ?? source?.[key.toUpperCase()];
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function centerColor(type) {
  if (type === 'distribution') return '#437C94';
  if (type === 'warehouse')    return '#4C825C';
  return '#AA643B';
}

function centerRadius(units) {
  if (units > 100000) return 20;
  if (units > 50000)  return 15;
  if (units > 20000)  return 11;
  return 8;
}

function centerTypeLabel(center) {
  return center?.CENTER_TYPE_DISPLAY_NAME || CENTER_TYPE_LABELS[center?.CENTER_TYPE] || titleizeKey(center?.CENTER_TYPE);
}

function tierLabel(careSite) {
  return careSite?.CUSTOMER_TIER_DISPLAY_NAME || TIER_LABELS[careSite?.CUSTOMER_TIER] || titleizeKey(careSite?.CUSTOMER_TIER);
}

function zoneLabel(zone) {
  return zone?.ZONE_TYPE_DISPLAY_NAME || ZONE_LABELS[zone?.ZONE_TYPE] || titleizeKey(zone?.ZONE_TYPE);
}

function demandIndex(region) {
  return Number(region?.CARE_DEMAND_INDEX ?? region?.DEMAND_INDEX ?? 50);
}

function demandLevel(region) {
  const value = demandIndex(region);
  return region?.CARE_DEMAND_LEVEL || (
    value >= 85 ? 'Critical Care Demand'
      : value >= 70 ? 'High Care Demand'
        : value >= 55 ? 'Moderate Care Demand'
          : value >= 40 ? 'Lower Care Demand'
            : 'Stable Care Demand'
  );
}

function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}

function regionName(region) {
  return region?.CARE_DEMAND_REGION_NAME || region?.REGION_NAME || 'care demand region';
}

function siteLocationName(site) {
  return site?.LOCATION_NAME || [site?.CITY, site?.STATE_PROVINCE].filter(Boolean).join(', ') || '-';
}

function siteId(site) {
  return site?.SITE_ID ?? site?.CENTER_ID;
}

function siteName(site) {
  return site?.SITE_NAME || site?.CENTER_NAME || 'Care logistics site';
}

function siteMetric(site, primaryKey, legacyKey = primaryKey, fallback = 0) {
  const value = site?.[primaryKey] ?? site?.[legacyKey];
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function siteConstraintTone(site) {
  if (siteMetric(site, 'HIGH_PRIORITY_ALERT_COUNT') > 0) return 'tone-red';
  if (siteMetric(site, 'ALERT_COUNT') > 0 || siteMetric(site, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT') >= 80) return 'tone-sienna';
  return 'tone-pine';
}

function siteOperationalStatus(site) {
  return site?.OPERATIONAL_STATUS || site?.operational_status || (
    siteMetric(site, 'HIGH_PRIORITY_ALERT_COUNT') > 0 ? 'Critical'
      : siteMetric(site, 'ALERT_COUNT') > 0 || siteMetric(site, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT') >= 80 ? 'Constrained'
        : siteMetric(site, 'PENDING_REQUEST_COUNT', 'PENDING_SHIPMENTS') > 0 ? 'Watch'
          : 'Active'
  );
}

function siteStatusTone(site) {
  const status = siteOperationalStatus(site).toLowerCase();
  if (status === 'critical') return 'tone-red';
  if (status === 'constrained' || status === 'watch') return 'tone-sienna';
  return 'tone-pine';
}

function siteActionLabels(site) {
  const actions = [];
  if (siteMetric(site, 'PENDING_REQUEST_COUNT', 'PENDING_SHIPMENTS') > 0) {
    actions.push('Review pending requests');
  }
  actions.push('Check route coverage');
  actions.push('View service zone');
  if (siteMetric(site, 'ALERT_COUNT') > 0) {
    actions.push('Escalate capacity alert');
  }
  return actions.slice(0, 4);
}

function priorityTone(priority) {
  if (priority === 'Critical') return 'tone-red';
  if (priority === 'Elevated' || priority === 'High') return 'tone-sienna';
  if (priority === 'Action') return 'tone-teal';
  return 'tone-pine';
}

function buildLogisticsPriorities({ logisticsKpis, alerts, demandRegions, centers }) {
  const activeAlerts = kpiMetric(logisticsKpis, 'capacity_supply_alert_count', (alerts || []).length);
  const highPriorityAlerts = kpiMetric(
    logisticsKpis,
    'high_priority_alert_count',
    (alerts || []).filter(a => a.STOCK_STATUS === 'out_of_stock' || a.STOCK_STATUS === 'critical').length,
  );
  const pendingRequests = kpiMetric(
    logisticsKpis,
    'pending_logistics_request_count',
    (centers || []).reduce((sum, center) => sum + (Number(center.PENDING_SHIPMENTS) || 0), 0),
  );
  const highLoadSiteCount = kpiMetric(
    logisticsKpis,
    'high_load_site_count',
    (centers || []).filter(center => Number(center.CURRENT_LOAD_PCT) >= 80).length,
  );

  const rankedDemandRegions = [...(demandRegions || [])]
    .filter(region => Number.isFinite(demandIndex(region)))
    .sort((a, b) => demandIndex(b) - demandIndex(a));
  const topDemandRegions = rankedDemandRegions.slice(0, 2);
  const topDemandIndex = topDemandRegions.length ? demandIndex(topDemandRegions[0]) : null;
  const topDemandLabel = topDemandRegions.map(regionName).join(' and ');
  const highestLoadSite = [...(centers || [])]
    .filter(center => Number.isFinite(Number(center.CURRENT_LOAD_PCT)))
    .sort((a, b) => Number(b.CURRENT_LOAD_PCT) - Number(a.CURRENT_LOAD_PCT))[0];

  const items = [
    {
      label: highPriorityAlerts > 0 ? 'Critical' : activeAlerts > 0 ? 'Elevated' : 'Stable',
      value: `${formatNumber(activeAlerts)} active capacity and supply ${pluralize(activeAlerts, 'alert')} across the accessible network${highPriorityAlerts > 0 ? `; ${formatNumber(highPriorityAlerts)} high-priority.` : '.'}`,
    },
    {
      label: topDemandIndex >= 85 ? 'Critical' : topDemandIndex >= 70 ? 'High' : 'Watch',
      value: topDemandLabel
        ? `Highest care demand concentration appears in ${topDemandLabel}.`
        : 'Care demand regions are loading from the governed spatial dataset.',
    },
    {
      label: pendingRequests > 0 ? 'Elevated' : 'Stable',
      value: `${formatNumber(pendingRequests)} pending logistics ${pluralize(pendingRequests, 'request')} across active care sites.`,
    },
  ];

  const action = highLoadSiteCount > 0
    ? `Review ${formatNumber(highLoadSiteCount)} high-load ${pluralize(highLoadSiteCount, 'site')} and reroute urgent care logistics${highestLoadSite?.CENTER_NAME ? ` from ${highestLoadSite.CENTER_NAME}` : ''}.`
    : activeAlerts > 0
      ? 'Review capacity and supply alerts, then check route coverage for urgent care logistics.'
      : 'Continue monitoring care demand regions and active route coverage.';

  items.push({
    label: 'Action',
    value: `Recommended next step: ${action}`,
    action: true,
  });

  return items;
}

function SiteActionChips({ site, compact = false }) {
  return (
    <div className={compact ? 'fulfillment-site-actions fulfillment-site-actions--compact' : 'fulfillment-site-actions'}>
      {siteActionLabels(site).map((action) => (
        <span
          key={action}
          className="fulfillment-site-action-chip"
          aria-label={`${action} for ${siteName(site)}`}
        >
          {action}
        </span>
      ))}
    </div>
  );
}

function SiteDetailMetric({ label, value }) {
  return (
    <div className="fulfillment-site-detail-panel__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SelectedSiteDetail({ site }) {
  if (!site) return null;

  const load = siteMetric(site, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT');
  const alerts = siteMetric(site, 'ALERT_COUNT');
  const pending = siteMetric(site, 'PENDING_REQUEST_COUNT', 'PENDING_SHIPMENTS');

  return (
    <div className="glass-card fulfillment-site-detail-panel">
      <div className="fulfillment-site-detail-panel__header">
        <div>
          <p className="fulfillment-site-detail-panel__eyebrow">Selected care logistics site</p>
          <h3 className="fulfillment-site-detail-panel__title">{siteName(site)}</h3>
          <p className="fulfillment-site-detail-panel__meta">
            {centerTypeLabel(site)} · {siteLocationName(site)} · Site ID {siteId(site)}
          </p>
        </div>
        <span className={`fulfillment-site-detail-panel__status ${siteConstraintTone(site)}`}>
          {site.PRIMARY_CONSTRAINT || 'Stable operations'}
        </span>
      </div>

      <div className="fulfillment-site-detail-panel__metrics">
        <SiteDetailMetric label="Services" value={formatNumber(siteMetric(site, 'SERVICES_COUNT', 'PRODUCTS_STOCKED'))} />
        <SiteDetailMetric label="Capacity / supply" value={`${formatNumber(siteMetric(site, 'CAPACITY_SUPPLY_UNITS', 'TOTAL_UNITS'))} units`} />
        <SiteDetailMetric label="Pending requests" value={formatNumber(pending)} />
        <SiteDetailMetric label="Load" value={`${load}%`} />
        <SiteDetailMetric label="Alerts" value={formatNumber(alerts)} />
        <SiteDetailMetric label="Last updated" value={formatDate(site.LAST_UPDATED_AT)} />
      </div>

      <div className="fulfillment-site-detail-panel__footer">
        <div>
          <span className="fulfillment-site-detail-panel__footer-label">Recommended action</span>
          <p>{site.RECOMMENDED_ACTION || 'Continue monitoring route coverage and care demand regions.'}</p>
        </div>
        <SiteActionChips site={site} />
      </div>
    </div>
  );
}

// Care Demand Index color scale: high pressure -> red, low -> green (Redwood palette, aerial map)
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
    if (!active) return;

    const visibleSites = (centers || [])
      .map(c => [Number(c.LATITUDE), Number(c.LONGITUDE)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (visibleSites.length === 0) {
      map.setView([39.5, -98.35], 4);
      return;
    }

    if (visibleSites.length === 1) {
      map.setView(visibleSites[0], 7);
      return;
    }

    map.fitBounds(visibleSites, { padding: [30, 30], maxZoom: 7 });
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
function FulfillmentMapView({ centers, shipments, customers, zonesData, demandRegions, layers, setLayer, onSelectSite }) {
  // H3 hexagonal density bins from care-site lat/lng at resolution 4
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

        {/* ── LAYER: Demand Regions (SDO_GEOMETRY polygons, colored by Care Demand Index) ── */}
        {/* Sorted largest-area-first so smaller regions render on top and stay clickable */}
        {layers.demandRegions && sortedDemandRegions.map(r => {
          if (!r.COORDS?.length) return null;
          const index = demandIndex(r);
          const { fill, stroke, opacity } = demandColor(index);
          const label = demandLevel(r);
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
                    <span style={{ color: '#697778' }}>Care Demand Index</span>
                    <span style={{ color: fill, fontWeight: 700, fontSize: 13 }}>{index} - {label}</span>
                    <span style={{ color: '#697778' }}>Population</span>
                    <span>{r.POPULATION ? (r.POPULATION / 1e6).toFixed(1) + 'M' : '-'}</span>
                    <span style={{ color: '#697778' }}>Avg Income</span>
                    <span>${r.AVG_INCOME ? Number(r.AVG_INCOME).toLocaleString() : '-'}</span>
                    <span style={{ color: '#697778' }}>Signal Density</span>
                    <span>{r.SOCIAL_DENSITY}/1k pop</span>
                    {r.AVG_7DAY_FORECAST && <>
                      <span style={{ color: '#697778' }}>7-Day Forecast</span>
                      <span style={{ color: '#AA643B' }}>{Number(r.AVG_7DAY_FORECAST).toLocaleString()} units/day</span>
                    </>}
                    {r.PEAK_SOCIAL_FACTOR && <>
                      <span style={{ color: '#697778' }}>Peak Signal ×</span>
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
                  <span style={{ color: style.color }}>{zoneLabel(z)}</span>
                  {' '}zone · ≤{z.RADIUS_KM} km · {z.MAX_DELIVERY_HRS}h delivery
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* ── LAYER: Care Site Density Grid (hexagonal care-site density heatmap) ── */}
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
                  <strong>{cell.count}</strong> care sites<br />
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
              color={CARRIER_COLORS[s.CARRIER] || '#6F757E'}
              weight={2}
              opacity={0.65}
            />
          );
        })}

        {/* ── LAYER: Care Site Tiers (small dots colored by tier) ── */}
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
                  <strong style={{ color }}>{tierLabel(c)}</strong>
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
            eventHandlers={{
              click: () => onSelectSite?.(c),
            }}
            pathOptions={{
              fillColor:   centerColor(c.CENTER_TYPE),
              fillOpacity: 0.9,
              color:       'rgba(255,255,255,0.45)',
              weight:      2,
            }}
          >
            <Popup>
              <div className="fulfillment-site-popup">
                <div className="fulfillment-site-popup__header">
                  <div>
                    <p className="fulfillment-site-popup__name">{siteName(c)}</p>
                    <p className="fulfillment-site-popup__meta">{siteLocationName(c)} · Site ID {siteId(c)}</p>
                  </div>
                  <span
                    className="fulfillment-site-popup__type"
                    style={{
                      background: `${centerColor(c.CENTER_TYPE)}22`,
                      borderColor: `${centerColor(c.CENTER_TYPE)}44`,
                    }}
                  >
                    {centerTypeLabel(c)}
                  </span>
                </div>

                <div className="fulfillment-site-popup__metrics">
                  <span>Services</span>
                  <strong>{formatNumber(siteMetric(c, 'SERVICES_COUNT', 'PRODUCTS_STOCKED'))}</strong>
                  <span>Capacity / supply</span>
                  <strong>{formatNumber(siteMetric(c, 'CAPACITY_SUPPLY_UNITS', 'TOTAL_UNITS'))} units</strong>
                  <span>Pending requests</span>
                  <strong>{formatNumber(siteMetric(c, 'PENDING_REQUEST_COUNT', 'PENDING_SHIPMENTS'))}</strong>
                  <span>Load</span>
                  <strong>{siteMetric(c, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT')}%</strong>
                  <span>Alerts</span>
                  <strong className={siteConstraintTone(c)}>{formatNumber(siteMetric(c, 'ALERT_COUNT'))}</strong>
                  <span>Primary constraint</span>
                  <strong className={siteConstraintTone(c)}>{c.PRIMARY_CONSTRAINT || 'Stable operations'}</strong>
                </div>

                <div className="fulfillment-site-popup__action">
                  <span>Recommended action</span>
                  <p>{c.RECOMMENDED_ACTION || 'Continue monitoring route coverage.'}</p>
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
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-ocean inline-block" /> Distribution Hub</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-pine inline-block" /> Care Supply Warehouse</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-sienna inline-block" /> Micro Fulfillment Site</span>
          </div>
        )}
        {layers.customers && (
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(TIER_COLORS).map(([tier, color]) => (
              <span key={tier} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                <span>{TIER_LABELS[tier] || titleizeKey(tier)}</span>
              </span>
            ))}
          </div>
        )}
        {layers.h3 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="mr-1">Care Site Density:</span>
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
            {ZONE_LEGEND_ITEMS.map(({ key, label, radius, color }) => (
              <span key={key} className="flex items-center gap-1">
                <span
                  className="inline-block w-5 border-t-2 border-dashed"
                  style={{ borderTopColor: color }}
                /> {label} ≤{radius}
              </span>
            ))}
          </div>
        )}
        {layers.routes && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-plum inline-block" /> CryoLine</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-sienna inline-block" /> Specialty Care Courier</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-ocean inline-block" /> SafeTemp</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-brand-red inline-block" /> Clinical Express</span>
          </div>
        )}
        {layers.demandRegions && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mr-1">Care Demand Index:</span>
            {DEMAND_LEVEL_LABELS.map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block opacity-80" style={{ background: color }} />
                <span className="text-[9px]">{label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Spatial Attribution (top-right) ── */}
      <div className="absolute top-4 right-4 z-[1000] text-[10px] bg-[var(--color-surface)]/90 px-3 py-2 rounded-lg border border-[var(--color-border)] pointer-events-none space-y-1 text-right max-w-[320px]">
        <div className="text-[11px] font-semibold text-[var(--color-text)]">Spatial processing</div>
        <div className="text-[var(--color-text-dim)] leading-snug">
          Oracle Spatial powers route coverage, service zones, demand regions, and density grids from governed care logistics data.
        </div>
        <div><span className="tone-teal">SDO_GEOMETRY</span> spatial routing</div>
        {layers.h3 && (
          <div><span className="tone-sienna">H3 res-4</span> · {h3Cells.length} hexagons · {customers?.length ?? 0} care sites</div>
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
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const setLayer = (key, value) => setLayers(l => ({ ...l, [key]: value }));

  // VPD-aware: refetch when user switches (X-Demo-User header changes server-side filtering)
  const userKey = currentUser?.USERNAME;
  const { data: logisticsKpis } = useData(() => api.fulfillment.kpis(), [userKey]);
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
  const nearestOrigin = useMemo(
    () => (customers || []).find((careSite) => (
      Number.isFinite(Number(careSite.LATITUDE))
      && Number.isFinite(Number(careSite.LONGITUDE))
    )) || null,
    [customers],
  );
  const {
    data: nearestSites,
    loading: nearestLoading,
    error: nearestError,
  } = useData(
    () => api.fulfillment.nearest({
      lat: nearestOrigin?.LATITUDE,
      lon: nearestOrigin?.LONGITUDE,
      maxResults: 5,
    }),
    [userKey, nearestOrigin?.CUSTOMER_ID, nearestOrigin?.LATITUDE, nearestOrigin?.LONGITUDE],
    { autoFetch: Boolean(nearestOrigin) },
  );
  const selectedSite = useMemo(
    () => (centers || []).find(site => String(siteId(site)) === String(selectedSiteId)) || null,
    [centers, selectedSiteId],
  );

  const totalUnits      = (centers || []).reduce((s, c) => s + (c.TOTAL_UNITS      || 0), 0);
  const pendingShipments = (centers || []).reduce((s, c) => s + (c.PENDING_SHIPMENTS || 0), 0);
  const activeCareLogisticsSiteCount = kpiMetric(
    logisticsKpis,
    'active_care_logistics_site_count',
    (centers || []).length,
  );
  const availableCapacitySupplyUnits = kpiMetric(
    logisticsKpis,
    'available_capacity_supply_units',
    totalUnits,
  );
  const pendingLogisticsRequestCount = kpiMetric(
    logisticsKpis,
    'pending_logistics_request_count',
    pendingShipments,
  );
  const capacitySupplyAlertCount = kpiMetric(
    logisticsKpis,
    'capacity_supply_alert_count',
    (alerts || []).length,
  );
  const logisticsPriorityItems = useMemo(() => buildLogisticsPriorities({
    logisticsKpis,
    alerts,
    demandRegions,
    centers,
  }), [logisticsKpis, alerts, demandRegions, centers]);
  const spatialEvidenceStatus = spatialEvidenceError
    ? 'UNAVAILABLE'
    : spatialEvidenceLoading
      ? 'CHECKING'
      : spatialEvidence?.status || 'INCOMPLETE';

  useEffect(() => {
    if (!selectedSiteId) return;
    if (!centers) return;
    if (!selectedSite) setSelectedSiteId(null);
  }, [centers, selectedSite, selectedSiteId]);

  const handleSelectSite = (site) => {
    const id = siteId(site);
    if (id != null) setSelectedSiteId(id);
  };

  return (
    <div className="space-y-6 fade-in">

      {/* ── Oracle Internals Panel ── */}
      <RegisterOraclePanel title="Care Logistics Map">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">What's Happening</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              Every care logistics site, service zone, care-site address, and demand region is stored as an{' '}
              <span className="tone-pine font-mono">SDO_GEOMETRY</span> point or polygon.
              Oracle Spatial&apos;s <span className="tone-pine font-mono">SDO_NN()</span> uses the
              <span className="tone-teal font-mono"> IDX_FC_SPATIAL</span> R-tree to produce nearby candidates;
              <span className="tone-pine font-mono"> SDO_GEOM.SDO_DISTANCE()</span> then measures and deterministically
              ranks eligible care logistics sites in a single SQL - no external routing API.
              Service zones use <span className="tone-sienna font-mono">SDO_BUFFER</span> circular polygons.
              Demand regions are Oracle <span className="tone-sienna font-mono">SDO_GEOMETRY</span> polygon boundaries
              converted to GeoJSON via <span className="tone-sienna font-mono">SDO_UTIL.TO_GEOJSON()</span> and
              overlaid with forecast data from the <code className="text-xs tone-plum mx-1">demand_forecasts</code> table.
              The H3 layer bins care-site density client-side via{' '}
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
            <FeatureBadge label="care_site_tier" color="purple" />
          </div>
          <SqlBlock code={`-- Nearest care logistics site with available supply
WITH indexed_candidates AS (
  SELECT /*+ INDEX(site idx_fc_spatial) */
         site.center_id,
         site.center_name,
         care.location AS care_location,
         site.location AS site_location
  FROM   customers care
  JOIN   fulfillment_centers site
    ON   SDO_NN(site.location, care.location,
                'sdo_batch_size=50 unit=KM') = 'TRUE'
  WHERE  care.customer_id = :care_site_id
    AND  site.is_active = 1
),
measured_candidates AS (
  SELECT candidate.*,
         SDO_GEOM.SDO_DISTANCE(
           candidate.care_location,
           candidate.site_location,
           0.005,
           'unit=KM'
         ) AS distance_km
  FROM indexed_candidates candidate
)
SELECT center_id, center_name, distance_km
FROM measured_candidates
ORDER BY distance_km, center_id
FETCH FIRST 3 ROWS ONLY;`} />
          <SqlBlock code={`-- Demand regions: Oracle SDO_GEOMETRY → GeoJSON
-- SDO_UTIL.TO_GEOJSON converts polygon boundary for frontend rendering
SELECT r.care_demand_region_name,
       r.care_demand_index,
       r.care_demand_level,
       TO_CHAR(SDO_UTIL.TO_GEOJSON(r.boundary)) AS geojson,
       AVG(df.predicted_demand)  AS avg_7day_forecast,
       MAX(df.social_factor)     AS peak_signal_factor
FROM   care_demand_regions_v r
LEFT JOIN demand_forecasts df
       ON UPPER(df.region) = UPPER(r.care_demand_region_name)
      AND df.forecast_date BETWEEN TRUNC(SYSDATE)
                               AND TRUNC(SYSDATE) + 7
GROUP BY r.care_demand_region_id,
         r.care_demand_region_name,
         r.care_demand_index,
         r.care_demand_level,
         r.boundary
ORDER BY r.care_demand_index DESC;`} />
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Virtual Private Database (VPD)</p>
            <p className="text-[var(--color-text)] leading-relaxed mb-2">
              Oracle <span className="tone-red font-mono">DBMS_RLS</span> applies a row-level security policy
              to <code className="text-xs tone-teal mx-1">FULFILLMENT_CENTERS</code>. When a user is set via{' '}
              <span className="tone-sienna font-mono">sc_security_ctx.set_user_context()</span>, Oracle
              transparently appends a WHERE clause - care logistics managers see only their regional sites,
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
              <DiagramBox label="Indexed Candidates" sub="SDO_NN · IDX_FC_SPATIAL R-tree · VPD-aware" color="#437C94" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Exact Proximity Ranking" sub="SDO_GEOM.SDO_DISTANCE · deterministic order" color="#4C825C" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Service Zones" sub="SDO_BUFFER circular polygons · 3 tiers" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Care Site Tiers" sub="New / Unvalidated · Standard · Preferred · Priority" color="#796087" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="H3 Density Grid" sub="Uber H3 res-4 · demand heatmap" color="#AA643B" />
              <div className="text-center text-[var(--color-text-dim)] text-[9px]">↓</div>
              <DiagramBox label="Demand Regions" sub="SDO_GEOMETRY polygons · Care Demand Index 0-100 · forecast join" color="#C74634" />
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
                  Live plan evidence is unavailable: {spatialEvidenceError.message || String(spatialEvidenceError)}
                </p>
              )}
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <JetGlyph iconClass="oj-fwk-icon-calendar-clock" className="fulfillment-page-glyph tone-teal" /> Care Logistics Map
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          Monitor care logistics capacity, supply availability, service zones, demand regions, and route coverage across the provider network using <span className="tone-teal">Oracle Spatial</span>.
        </p>
      </div>

      <SceneStoryPanel scene="fulfillment" />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-grid"
          toneClass="tone-ocean"
          value={activeCareLogisticsSiteCount}
          label="Active Care Logistics Sites"
          subtext="visible to current user"
        />
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-view"
          toneClass="tone-pine"
          value={formatNumber(availableCapacitySupplyUnits)}
          label="Available Capacity / Supply Units"
          subtext="across accessible network"
        />
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-tree-document"
          toneClass="tone-sienna"
          value={formatNumber(pendingLogisticsRequestCount)}
          label="Pending Logistics Requests"
          subtext="open requests"
        />
        <FulfillmentStatCard
          iconClass="oj-fwk-icon-message-warning"
          toneClass="tone-red"
          value={capacitySupplyAlertCount}
          label="Capacity & Supply Alerts"
          subtext="active alerts"
        />
      </div>

      <div className="glass-card signal-summary-panel">
        <div className="signal-summary-panel__header">
          <div>
            <p className="signal-summary-panel__title">Logistics priorities</p>
            <p className="signal-summary-panel__subtitle">
              Database-backed priorities from capacity, supply, pending requests, demand regions, and care logistics site load.
            </p>
          </div>
          <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-sienna" />
        </div>
        <div className="signal-summary-panel__grid">
          {logisticsPriorityItems.map((item) => (
            <div key={`${item.label}-${item.value}`} className="signal-summary-panel__item">
              <span className={`signal-summary-panel__label ${priorityTone(item.label)}`}>{item.label}</span>
              <p className={`signal-summary-panel__value ${item.action ? 'signal-summary-panel__value--action' : ''}`}>
                {item.value}
              </p>
            </div>
          ))}
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
                  ? `Filtered to ${currentUser.REGION} - ${(centers || []).length} care logistics site${(centers || []).length !== 1 ? 's' : ''} visible`
                  : `${(centers || []).length} care logistics sites visible`
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
        customers={customers}
        zonesData={zonesData}
        demandRegions={demandRegions}
        layers={layers}
        setLayer={setLayer}
        onSelectSite={handleSelectSite}
      />

      <SelectedSiteDetail site={selectedSite} />

      <div className="glass-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Oracle Spatial nearest-site evidence</h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">
              The mounted scene calls the governed nearest-neighbor endpoint for the first visible care site with valid coordinates.
            </p>
          </div>
          <FeatureBadge
            label={!nearestOrigin || nearestError
              ? 'SDO_NN evidence unavailable'
              : nearestLoading
                ? 'SDO_NN evidence pending'
                : (nearestSites || []).length > 0
                  ? 'SDO_NN API evidence'
                  : 'SDO_NN no eligible result'}
            color={!nearestOrigin || nearestError
              ? 'red'
              : nearestLoading
                ? 'blue'
                : (nearestSites || []).length > 0
                  ? 'green'
                  : 'orange'}
          />
        </div>
        <div className="mt-4" role="status" aria-live="polite">
          {!nearestOrigin ? (
            <p className="text-xs text-[var(--color-text-dim)]">
              Spatial evidence is unavailable because no governed care-site coordinates are visible in the current scope.
            </p>
          ) : nearestLoading ? (
            <p className="text-xs text-[var(--color-text-dim)]">
              Running the SDO_NN nearest-site query for {nearestOrigin.CUSTOMER_NAME || nearestOrigin.CITY || 'the selected care site'}...
            </p>
          ) : nearestError ? (
            <p className="text-xs tone-red">
              Nearest-site evidence is unavailable. {nearestError.message} No spatial result is claimed.
            </p>
          ) : (nearestSites || []).length === 0 ? (
            <p className="text-xs text-[var(--color-text-dim)]">
              Oracle returned no eligible logistics sites for this care-site location.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {(nearestSites || []).slice(0, 3).map((site) => (
                <div
                  key={site.CENTER_ID}
                  className="border p-3"
                  style={{ borderColor: 'var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)' }}
                >
                  <p className="text-sm font-semibold">{site.CENTER_NAME}</p>
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">
                    {site.CITY}, {site.STATE_PROVINCE}
                  </p>
                  <p className="text-xs font-mono tone-pine mt-2">
                    {Number(site.DISTANCE_KM).toFixed(2)} km
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Care Logistics Sites Table ── */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">Care Logistics Sites</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wider border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-3">Site</th>
                <th className="text-left py-2 px-3">Location</th>
                <th className="text-left py-2 px-3">Site Type</th>
                <th className="text-right py-2 px-3">Services Supported</th>
                <th className="text-right py-2 px-3">Capacity / Supply Units</th>
                <th className="text-right py-2 px-3">Pending Requests</th>
                <th className="text-right py-2 px-3">Alerts</th>
                <th className="text-right py-2 px-3">Current Load</th>
                <th className="text-left py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(centers || []).map(c => {
                const isSelected = String(siteId(c)) === String(selectedSiteId);
                return (
                <tr
                  key={c.CENTER_ID}
                  className={`fulfillment-site-row border-b border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] ${isSelected ? 'fulfillment-site-row--selected' : ''}`}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => handleSelectSite(c)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectSite(c);
                    }
                  }}
                >
                  <td className="py-2 px-3 font-medium">{c.SITE_NAME || c.CENTER_NAME}</td>
                  <td className="py-2 px-3 text-[var(--color-text-dim)]">{siteLocationName(c)}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: `${centerColor(c.CENTER_TYPE)}18`,
                        color: 'var(--color-text)',
                        border: `1px solid ${centerColor(c.CENTER_TYPE)}30`,
                      }}>
                      {centerTypeLabel(c)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">{formatNumber(siteMetric(c, 'SERVICES_COUNT', 'PRODUCTS_STOCKED'))}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(siteMetric(c, 'CAPACITY_SUPPLY_UNITS', 'TOTAL_UNITS'))}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(siteMetric(c, 'PENDING_REQUEST_COUNT', 'PENDING_SHIPMENTS'))}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(siteMetric(c, 'ALERT_COUNT'))}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={siteMetric(c, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT') > 85 ? 'tone-red' : siteMetric(c, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT') > 65 ? 'tone-sienna' : 'tone-pine'}>
                      {siteMetric(c, 'LOAD_PERCENTAGE', 'CURRENT_LOAD_PCT')}%
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`fulfillment-site-status-badge ${siteStatusTone(c)}`}
                      title={c.PRIMARY_CONSTRAINT || c.RECOMMENDED_ACTION || 'Stable operations'}
                    >
                      {siteOperationalStatus(c)}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Inventory Alerts ── */}
      {(alerts || []).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <JetGlyph iconClass="oj-fwk-icon-message-warning" className="tone-red" /> Capacity and Supply Alerts - Compliance and Demand Risk
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
                    {a.QUANTITY_ON_HAND} in stock
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
