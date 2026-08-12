/**
 * Fulfillment API — Spatial routing and field operations site management
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

const SPATIAL_NN_PARAMETERS = 'sdo_batch_size=50 unit=KM';

function metricValue(row, columnName) {
  const value = row?.[columnName] ?? row?.[columnName.toUpperCase()] ?? 0;
  return Number(value) || 0;
}

function rowValue(row, columnName) {
  return row?.[columnName] ?? row?.[columnName.toUpperCase()] ?? row?.[columnName.toLowerCase()];
}

function boundedResultCount(value, fallback = 5) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 20);
}

function finiteCoordinate(value, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

// GET /api/fulfillment/kpis
// VPD-aware KPI rollup for the Field Operations Logistics Map.
router.get('/kpis', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
        active_field_logistics_site_count,
        available_capacity_supply_units,
        pending_logistics_request_count,
        capacity_supply_alert_count,
        high_priority_alert_count,
        high_load_site_count
      FROM field_logistics_kpis_v
    `, {}, req.demoUser);

    const row = result.rows?.[0] || {};
    res.json({
      active_field_logistics_site_count: metricValue(row, 'active_field_logistics_site_count'),
      available_capacity_supply_units: metricValue(row, 'available_capacity_supply_units'),
      pending_logistics_request_count: metricValue(row, 'pending_logistics_request_count'),
      capacity_supply_alert_count: metricValue(row, 'capacity_supply_alert_count'),
      high_priority_alert_count: metricValue(row, 'high_priority_alert_count'),
      high_load_site_count: metricValue(row, 'high_load_site_count'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/centers
// VPD: sc_security_ctx filters fulfillment_centers by user's role/region
router.get('/centers', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
             site_id,
             site_name,
             site_type,
             site_type_display_name,
             location_name,
             region_name,
             services_count,
             capacity_supply_units,
             pending_request_count,
             load_percentage,
             alert_count,
             high_priority_alert_count,
             operational_status,
             primary_constraint,
             recommended_action,
             last_updated_at,
             field_logistics_site_id AS center_id,
             field_logistics_site_name AS center_name,
             site_type AS center_type,
             site_type_display_name AS center_type_display_name,
             city,
             state_province,
             postal_code,
             latitude,
             longitude,
             capacity_units,
             load_percentage AS current_load_pct,
             is_active,
             services_count AS products_stocked,
             total_supply_units AS total_units,
             pending_request_count AS pending_shipments
      FROM field_logistics_sites_v
      WHERE is_active = 1
      ORDER BY site_name
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/nearest — indexed candidates, then exact distance ranking
router.get('/nearest', async (req, res) => {
  try {
    const { customerId, productId, lat, lon, maxResults = 5 } = req.query;
    const resultCount = boundedResultCount(maxResults);
    const hasCustomerId = customerId !== undefined && customerId !== '';
    const hasProductId = productId !== undefined && productId !== '';
    const hasLatitude = lat !== undefined && lat !== '';
    const hasLongitude = lon !== undefined && lon !== '';

    let result;
    if (hasCustomerId && hasProductId) {
      const parsedCustomerId = Number.parseInt(customerId, 10);
      const parsedProductId = Number.parseInt(productId, 10);
      if (!Number.isSafeInteger(parsedCustomerId) || parsedCustomerId < 1
          || !Number.isSafeInteger(parsedProductId) || parsedProductId < 1) {
        return res.status(400).json({
          error: 'customerId and productId must be positive integers',
        });
      }

      result = await db.executeAsUser(`
        WITH origin AS (
          SELECT customer.location
          FROM customers customer
          WHERE customer.customer_id = :customerId
            AND customer.location IS NOT NULL
        ),
        indexed_candidates AS (
          SELECT /*+ LEADING(origin) USE_NL(center) INDEX(center idx_fc_spatial) */
                 center.center_id,
                 center.center_name,
                 center.city,
                 center.state_province,
                 center.center_type,
                 center.latitude,
                 center.longitude,
                 center.location AS center_location,
                 origin.location AS origin_location
          FROM origin
          JOIN fulfillment_centers center
            ON SDO_NN(
                 center.location,
                 origin.location,
                 '${SPATIAL_NN_PARAMETERS}'
               ) = 'TRUE'
          WHERE center.is_active = 1
        ),
        available_candidates AS (
          SELECT candidate.*, inventory.quantity_on_hand
          FROM indexed_candidates candidate
          JOIN inventory
            ON inventory.center_id = candidate.center_id
           AND inventory.product_id = :productId
          WHERE inventory.quantity_on_hand > inventory.quantity_reserved
        ),
        measured_candidates AS (
          SELECT candidate.*,
                 ROUND(
                   SDO_GEOM.SDO_DISTANCE(
                     candidate.origin_location,
                     candidate.center_location,
                     0.005,
                     'unit=KM'
                   ),
                   2
                 ) AS distance_km
          FROM available_candidates candidate
        )
        SELECT center_id,
               center_name,
               city,
               state_province,
               center_type,
               CASE center_type
                   WHEN 'distribution' THEN 'Distribution Hub'
                   WHEN 'warehouse' THEN 'Asset Capacity Warehouse'
                   WHEN 'micro' THEN 'Neighborhood Field Staging Site'
                   WHEN 'store' THEN 'Neighborhood Field Staging Site'
                   WHEN 'drop_ship' THEN 'Partner Logistics Site'
                   ELSE INITCAP(REPLACE(center_type, '_', ' '))
               END AS center_type_display_name,
               latitude,
               longitude,
               quantity_on_hand,
               distance_km,
               ROUND(distance_km / 80, 1) AS estimated_hours
        FROM measured_candidates
        ORDER BY distance_km, center_id
        FETCH FIRST :maxResults ROWS ONLY
      `, {
        customerId: parsedCustomerId,
        productId: parsedProductId,
        maxResults: resultCount,
      }, req.demoUser);
    } else if (hasLatitude && hasLongitude) {
      const parsedLatitude = finiteCoordinate(lat, -90, 90);
      const parsedLongitude = finiteCoordinate(lon, -180, 180);
      if (parsedLatitude === null || parsedLongitude === null) {
        return res.status(400).json({
          error: 'lat and lon must be valid WGS-84 coordinates',
        });
      }

      result = await db.executeAsUser(`
        WITH origin AS (
          SELECT SDO_GEOMETRY(
                   2001,
                   4326,
                   SDO_POINT_TYPE(:lon, :lat, NULL),
                   NULL,
                   NULL
                 ) AS location
          FROM dual
        ),
        indexed_candidates AS (
          SELECT /*+ LEADING(origin) USE_NL(center) INDEX(center idx_fc_spatial) */
                 center.center_id,
                 center.center_name,
                 center.city,
                 center.state_province,
                 center.center_type,
                 center.latitude,
                 center.longitude,
                 center.location AS center_location,
                 origin.location AS origin_location
          FROM origin
          JOIN fulfillment_centers center
            ON SDO_NN(
                 center.location,
                 origin.location,
                 '${SPATIAL_NN_PARAMETERS}'
               ) = 'TRUE'
          WHERE center.is_active = 1
        ),
        measured_candidates AS (
          SELECT candidate.*,
                 ROUND(
                   SDO_GEOM.SDO_DISTANCE(
                     candidate.origin_location,
                     candidate.center_location,
                     0.005,
                     'unit=KM'
                   ),
                   2
                 ) AS distance_km
          FROM indexed_candidates candidate
        )
        SELECT center_id,
               center_name,
               city,
               state_province,
               center_type,
               CASE center_type
                   WHEN 'distribution' THEN 'Distribution Hub'
                   WHEN 'warehouse' THEN 'Asset Capacity Warehouse'
                   WHEN 'micro' THEN 'Neighborhood Field Staging Site'
                   WHEN 'store' THEN 'Neighborhood Field Staging Site'
                   WHEN 'drop_ship' THEN 'Partner Logistics Site'
                   ELSE INITCAP(REPLACE(center_type, '_', ' '))
               END AS center_type_display_name,
               latitude,
               longitude,
               distance_km
        FROM measured_candidates
        ORDER BY distance_km, center_id
        FETCH FIRST :maxResults ROWS ONLY
      `, {
        lat: parsedLatitude,
        lon: parsedLongitude,
        maxResults: resultCount,
      }, req.demoUser);
    } else {
      return res.status(400).json({
        error: 'Provide customerId+productId or lat+lon',
      });
    }

    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/spatial-readiness
// Execute the same indexed-candidate/exact-ranking strategy and then inspect
// that exact cursor on the same governed Oracle session.
router.get('/spatial-readiness', async (req, res) => {
  try {
    const evidence = await db.withActorConnection(req.demoUser, async (connection) => {
      const execute = (sql, binds = {}) => connection.execute(sql, binds);
      const probe = await execute(`
        WITH origin AS (
          SELECT location
          FROM (
            SELECT customer.location
            FROM customers customer
            WHERE customer.location IS NOT NULL
            ORDER BY customer.customer_id
          )
          WHERE ROWNUM = 1
        ),
        indexed_candidates AS (
          SELECT /*+ GATHER_PLAN_STATISTICS LEADING(origin) USE_NL(center) INDEX(center idx_fc_spatial) */
                 /* UTILITIES_SPATIAL_NN_API_PROOF */
                 center.center_id,
                 center.location AS center_location,
                 origin.location AS origin_location
          FROM origin
          JOIN fulfillment_centers center
            ON SDO_NN(
                 center.location,
                 origin.location,
                 '${SPATIAL_NN_PARAMETERS}'
               ) = 'TRUE'
          WHERE center.is_active = 1
        ),
        measured_candidates AS (
          SELECT candidate.center_id,
                 ROUND(
                   SDO_GEOM.SDO_DISTANCE(
                     candidate.origin_location,
                     candidate.center_location,
                     0.005,
                     'unit=KM'
                   ),
                   2
                 ) AS distance_km
          FROM indexed_candidates candidate
        )
        SELECT center_id, distance_km
        FROM measured_candidates
        ORDER BY distance_km, center_id
        FETCH FIRST 3 ROWS ONLY
      `);

      const planResult = await execute(`
        SELECT plan_table_output
        FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'BASIC +ALLSTATS LAST'))
      `);
      const planLines = (planResult.rows || [])
        .map((row) => String(rowValue(row, 'plan_table_output') || ''));
      const indexPlanLine = planLines.find((line) => (
        /\|\s*\*?\s*\d+\s*\|\s*DOMAIN INDEX[^|]*\|/i.test(line)
        && /\|\s*IDX_FC_SPATIAL\s*\|/i.test(line)
      )) || null;

      const indexResult = await execute(`
        SELECT index_name, status, domidx_status, domidx_opstatus
        FROM user_indexes
        WHERE index_name = 'IDX_FC_SPATIAL'
          AND table_name = 'FULFILLMENT_CENTERS'
          AND ityp_owner = 'MDSYS'
          AND ityp_name = 'SPATIAL_INDEX_V2'
      `);
      const indexRow = indexResult.rows?.[0] || {};
      const indexReady = rowValue(indexRow, 'status') === 'VALID'
        && rowValue(indexRow, 'domidx_status') === 'VALID'
        && rowValue(indexRow, 'domidx_opstatus') === 'VALID';
      const probeResultCount = (probe.rows || []).length;
      const ready = indexReady && Boolean(indexPlanLine) && probeResultCount > 0;

      return {
        status: ready ? 'ACTIVE' : 'INCOMPLETE',
        ready,
        strategy: 'SDO_NN indexed candidates -> SDO_GEOM.SDO_DISTANCE exact ranking',
        candidate_operator: 'SDO_NN',
        exact_rank_operator: 'SDO_GEOM.SDO_DISTANCE',
        index_name: rowValue(indexRow, 'index_name') || 'IDX_FC_SPATIAL',
        index_status: indexReady ? 'VALID' : 'INVALID',
        plan_operator: indexPlanLine ? 'DOMAIN INDEX' : null,
        plan_evidence: indexPlanLine?.trim() || null,
        planEvidence: indexPlanLine?.trim() || null,
        fallback_full_scan: false,
        probe_result_count: probeResultCount,
      };
    });

    return res.status(evidence.ready ? 200 : 503).json(evidence);
  } catch (err) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      ready: false,
      error: err.message,
      plan_operator: null,
      plan_evidence: null,
      planEvidence: null,
      fallback_full_scan: null,
    });
  }
});

// GET /api/fulfillment/shipments
router.get('/shipments', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let where = '1=1';
    const binds = { limit: parseInt(limit) };

    if (status) { where += " AND s.ship_status = :status"; binds.status = status; }

    const result = await db.executeAsUser(`
      SELECT s.shipment_id, s.order_id, s.carrier,
             s.carrier AS logistics_partner_key,
             CASE s.carrier
               WHEN 'PilotFreight' THEN 'Critical Infrastructure Courier'
               ELSE s.carrier
             END AS carrier_display_name,
             CASE s.carrier
               WHEN 'PilotFreight' THEN 'Critical Infrastructure Courier'
               ELSE s.carrier
             END AS logistics_partner_display_name,
             s.tracking_number,
             s.tracking_number AS logistics_route_reference_id,
             s.ship_status,
             s.ship_status AS logistics_route_status,
             CASE s.ship_status
               WHEN 'preparing' THEN 'Request Received'
               WHEN 'picked' THEN 'Assigned'
               WHEN 'packed' THEN 'Packed'
               WHEN 'shipped' THEN 'Dispatched'
               WHEN 'in_transit' THEN 'In Transit'
               WHEN 'out_for_delivery' THEN 'Arriving'
               WHEN 'delivered' THEN 'Delivered'
               WHEN 'exception' THEN 'Logistics Exception'
               ELSE INITCAP(REPLACE(s.ship_status, '_', ' '))
             END AS logistics_route_status_display_name,
             CASE s.ship_status
               WHEN 'preparing' THEN 1
               WHEN 'picked' THEN 2
               WHEN 'packed' THEN 3
               WHEN 'shipped' THEN 4
               WHEN 'in_transit' THEN 5
               WHEN 'out_for_delivery' THEN 6
               WHEN 'delivered' THEN 7
               ELSE NULL
             END AS logistics_route_progress_order,
             s.distance_km,
             ROUND(s.distance_km * 0.621371, 2) AS distance_miles,
             s.estimated_hours, s.ship_cost, s.ship_cost AS logistics_cost,
             s.shipped_at, s.delivered_at,
             fc.center_name, fc.city AS center_city, fc.latitude AS center_lat, fc.longitude AS center_lon,
             c.city AS customer_city, c.latitude AS customer_lat, c.longitude AS customer_lon
      FROM shipments s
      JOIN fulfillment_centers fc ON s.center_id = fc.center_id
      JOIN orders o ON s.order_id = o.order_id
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE ${where}
      ORDER BY s.created_at DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/inventory-alerts
router.get('/inventory-alerts', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT p.product_id, p.product_name, p.category,
             b.brand_name,
             i.center_id, fc.center_name, fc.city,
             i.quantity_on_hand, i.reorder_point,
             i.quantity_on_hand - i.reorder_point AS deficit,
             NVL(df.social_factor, 1.0) AS social_factor,
             NVL(df.predicted_demand, 0) AS predicted_demand,
             CASE
                 WHEN i.quantity_on_hand = 0 THEN 'out_of_stock'
                 WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'critical'
                 WHEN i.quantity_on_hand < i.reorder_point THEN 'low'
                 ELSE 'adequate'
             END AS stock_status
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      JOIN fulfillment_centers fc ON i.center_id = fc.center_id
      LEFT JOIN demand_forecasts df ON p.product_id = df.product_id
          AND df.forecast_date = TRUNC(SYSDATE)
      WHERE i.quantity_on_hand <= i.reorder_point
        AND fc.is_active = 1
      ORDER BY social_factor DESC, i.quantity_on_hand ASC
      FETCH FIRST 50 ROWS ONLY
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/customers
// Returns service point lat/lon + tier for the Pilot Site Tier spatial layer
router.get('/customers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 800, 2000);
    const result = await db.execute(`
      SELECT customer_id,
             customer_tier,
             CASE customer_tier
                 WHEN 'preferred' THEN 'Preferred Service Route'
                 WHEN 'standard' THEN 'Standard Service Route'
                 WHEN 'new' THEN 'New / Unvalidated Route'
                 WHEN 'vip' THEN 'Priority Service Route'
                 ELSE INITCAP(REPLACE(customer_tier, '_', ' '))
             END AS customer_tier_display_name,
             ROUND(latitude, 4)        AS latitude,
             ROUND(longitude, 4)       AS longitude,
             city,
             state_province,
             ROUND(lifetime_value, 0)  AS lifetime_value
      FROM   customers
      WHERE  latitude  IS NOT NULL
        AND  longitude IS NOT NULL
      FETCH FIRST :limit ROWS ONLY
    `, { limit });
    res.json(result.rows);
  } catch (err) {
    console.error('Pilot Site layer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/zones
// Returns service zone polygons. If fulfillment_zones is empty, generates
// virtual zones (express/overnight/standard/economy) from center coordinates with
// radius values (km) for the frontend to draw as Leaflet Circle overlays.
router.get('/zones', async (req, res) => {
  try {
    // Try DB zones first — include radius mapping so frontend can draw Circles
    const RADIUS_MAP = { express: 80, overnight: 160, standard: 250, economy: 500 };
    const dbResult = await db.executeAsUser(`
      SELECT fz.zone_id, fz.center_id, fz.zone_type, fz.max_delivery_hrs,
             CASE fz.zone_type
                 WHEN 'express' THEN 'Emergency Repair / Leak Response'
                 WHEN 'overnight' THEN 'Priority Field Response'
                 WHEN 'standard' THEN 'Standard Service Route'
                 WHEN 'economy' THEN 'Routine Replenishment'
                 ELSE INITCAP(REPLACE(fz.zone_type, '_', ' '))
             END AS zone_type_display_name,
             fc.center_name, fc.center_type,
             CASE fc.center_type
                 WHEN 'distribution' THEN 'Distribution Hub'
                 WHEN 'warehouse' THEN 'Asset Capacity Warehouse'
                 WHEN 'micro' THEN 'Neighborhood Field Staging Site'
                 WHEN 'store' THEN 'Neighborhood Field Staging Site'
                 WHEN 'drop_ship' THEN 'Partner Logistics Site'
                 ELSE INITCAP(REPLACE(fc.center_type, '_', ' '))
             END AS center_type_display_name,
             fc.latitude, fc.longitude
      FROM   fulfillment_zones fz
      JOIN   fulfillment_centers fc ON fz.center_id = fc.center_id
      WHERE  fc.is_active = 1
      ORDER  BY fc.center_name, fz.zone_type
    `, {}, req.demoUser);

    if (dbResult.rows.length > 0) {
      const zones = dbResult.rows.map(z => ({
        ...z,
        RADIUS_KM: RADIUS_MAP[z.ZONE_TYPE] || 250,
      }));
      return res.json({ source: 'database', zones });
    }

    // Fallback: generate virtual zones from centers
    const centers = await db.executeAsUser(`
      SELECT center_id, center_name, center_type,
             CASE center_type
                 WHEN 'distribution' THEN 'Distribution Hub'
                 WHEN 'warehouse' THEN 'Asset Capacity Warehouse'
                 WHEN 'micro' THEN 'Neighborhood Field Staging Site'
                 WHEN 'store' THEN 'Neighborhood Field Staging Site'
                 WHEN 'drop_ship' THEN 'Partner Logistics Site'
                 ELSE INITCAP(REPLACE(center_type, '_', ' '))
             END AS center_type_display_name,
             latitude, longitude
      FROM   fulfillment_centers
      WHERE  is_active = 1 AND latitude IS NOT NULL
      ORDER  BY center_name
    `, {}, req.demoUser);

    const ZONE_RADII = [
      { type: 'express',  km: 80,  hrs: 8  },
      { type: 'overnight', km: 160, hrs: 12 },
      { type: 'standard', km: 250, hrs: 24 },
      { type: 'economy',  km: 500, hrs: 72 },
    ];

    const virtualZones = [];
    centers.rows.forEach(c => {
      ZONE_RADII.forEach(z => {
        virtualZones.push({
          ZONE_TYPE:        z.type,
          ZONE_TYPE_DISPLAY_NAME:
            z.type === 'express' ? 'Emergency Repair / Leak Response' :
            z.type === 'overnight' ? 'Priority Field Response' :
            z.type === 'standard' ? 'Standard Service Route' :
            z.type === 'economy' ? 'Routine Replenishment' : z.type,
          CENTER_ID:        c.CENTER_ID,
          CENTER_NAME:      c.CENTER_NAME,
          CENTER_TYPE:      c.CENTER_TYPE,
          CENTER_TYPE_DISPLAY_NAME: c.CENTER_TYPE_DISPLAY_NAME,
          LATITUDE:         c.LATITUDE,
          LONGITUDE:        c.LONGITUDE,
          RADIUS_KM:        z.km,
          MAX_DELIVERY_HRS: z.hrs,
        });
      });
    });

    res.json({ source: 'virtual', zones: virtualZones });
  } catch (err) {
    console.error('Zones error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/demand-regions
// Returns demand_regions polygons with forecast summary, colored by Service Territory Demand Index.
// SDO_UTIL.TO_GEOJSON converts Oracle SDO_GEOMETRY → GeoJSON string.
// Joins to demand_forecasts by region_name for 7-day forecast context.
router.get('/demand-regions', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT r.region_id,
             r.region_name,
             r.region_type,
             r.population,
             ROUND(r.avg_income, 0)     AS avg_income,
             ROUND(r.social_density, 1) AS social_density,
             r.demand_index,
             r.demand_index AS service_territory_index,
             CASE
                 WHEN r.demand_index >= 85 THEN 'Critical Service Territory Demand'
                 WHEN r.demand_index >= 70 THEN 'High Service Territory Demand'
                 WHEN r.demand_index >= 55 THEN 'Moderate Service Territory Demand'
                 WHEN r.demand_index >= 40 THEN 'Lower Service Territory Demand'
                 ELSE 'Stable Service Territory Demand'
             END AS service_territory_level,
             TO_CHAR(SDO_UTIL.TO_GEOJSON(r.boundary)) AS geojson,
             (SELECT ROUND(AVG(df.predicted_demand), 0)
              FROM demand_forecasts df
              WHERE UPPER(df.region) = UPPER(r.region_name)
                AND df.forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7
             ) AS avg_7day_forecast,
             (SELECT ROUND(MAX(df.social_factor), 2)
              FROM demand_forecasts df
              WHERE UPPER(df.region) = UPPER(r.region_name)
                AND df.forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7
             ) AS peak_social_factor,
             (SELECT COUNT(DISTINCT df.product_id)
              FROM demand_forecasts df
              WHERE UPPER(df.region) = UPPER(r.region_name)
             ) AS forecast_products
      FROM demand_regions r
      ORDER BY r.demand_index DESC
    `);

    // SDO_UTIL.TO_GEOJSON returns GeoJSON with [lon, lat] pairs.
    // Swap to [lat, lon] for Leaflet Polygon compatibility.
    const regions = result.rows.map(r => {
      let coords = null;
      if (r.GEOJSON) {
        try {
          const geo = JSON.parse(r.GEOJSON);
          coords = (geo.coordinates?.[0] || []).map(([lon, lat]) => [lat, lon]);
        } catch (_) { /* malformed geometry — skip */ }
      }
      return { ...r, COORDS: coords };
    });

    res.json(regions);
  } catch (err) {
    console.error('Demand regions error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
