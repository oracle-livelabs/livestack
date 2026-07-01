/**
 * Manufacturing capacity API — plant routing and line-capacity planning
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

function metricValue(row, columnName) {
  const value = row?.[columnName] ?? row?.[columnName.toUpperCase()] ?? 0;
  return Number(value) || 0;
}

// GET /api/fulfillment/kpis
// VPD-aware KPI rollup for the Plant Capacity and Routing Map.
router.get('/kpis', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT
        (SELECT COUNT(*)
         FROM fulfillment_centers fc
         WHERE fc.is_active = 1) AS active_plant_count,
        NVL((SELECT SUM(GREATEST(i.quantity_on_hand - i.quantity_reserved, 0))
             FROM inventory i
             JOIN fulfillment_centers fc ON fc.center_id = i.center_id
             WHERE fc.is_active = 1), 0) AS available_capacity_units,
        (SELECT COUNT(*)
         FROM manufacturing_work_orders o
         WHERE o.work_order_status_code IN ('planned','released','in_progress')) AS active_work_order_count,
        (SELECT COUNT(*)
         FROM inventory i
         JOIN fulfillment_centers fc ON fc.center_id = i.center_id
         WHERE fc.is_active = 1
           AND i.quantity_on_hand <= i.reorder_point) AS capacity_alert_count,
        (SELECT COUNT(*)
         FROM inventory i
         JOIN fulfillment_centers fc ON fc.center_id = i.center_id
         WHERE fc.is_active = 1
           AND (i.quantity_on_hand = 0 OR i.quantity_on_hand < i.reorder_point * 0.5)) AS high_priority_alert_count,
        (SELECT COUNT(*)
         FROM (
           SELECT fc.center_id,
                  NVL(SUM(i.quantity_on_hand) / NULLIF(fc.capacity_units, 0) * 100, 0) AS load_pct
           FROM fulfillment_centers fc
           LEFT JOIN inventory i ON i.center_id = fc.center_id
           WHERE fc.is_active = 1
           GROUP BY fc.center_id, fc.capacity_units
         )
         WHERE load_pct >= 85) AS high_load_plant_count
      FROM dual
    `, {}, req.demoUser);

    const row = result.rows?.[0] || {};
    res.json({
      active_plant_count: metricValue(row, 'active_plant_count'),
      available_capacity_units: metricValue(row, 'available_capacity_units'),
      active_work_order_count: metricValue(row, 'active_work_order_count'),
      capacity_alert_count: metricValue(row, 'capacity_alert_count'),
      high_priority_alert_count: metricValue(row, 'high_priority_alert_count'),
      high_load_plant_count: metricValue(row, 'high_load_plant_count'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/centers
// VPD: MANUFACTURING_APP_CTX filters fulfillment_centers by user's role/region
router.get('/centers', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT fc.center_id, fc.center_name, fc.center_type,
             fc.city, fc.state_province, fc.postal_code,
             fc.latitude, fc.longitude, fc.capacity_units,
             ROUND(NVL((SELECT SUM(i2.quantity_on_hand) FROM inventory i2
               WHERE i2.center_id = fc.center_id) / NULLIF(fc.capacity_units, 0) * 100, 0), 1) AS current_load_pct,
             fc.is_active,
             (SELECT COUNT(DISTINCT i.product_id) FROM inventory i
              WHERE i.center_id = fc.center_id AND i.quantity_on_hand > 0) AS products_stocked,
             (SELECT COUNT(DISTINCT i.product_id) FROM inventory i
              WHERE i.center_id = fc.center_id AND i.quantity_on_hand > 0) AS parts_tracked,
             (SELECT SUM(i.quantity_on_hand) FROM inventory i
              WHERE i.center_id = fc.center_id) AS total_units,
             (SELECT COUNT(*) FROM manufacturing_work_orders o
              WHERE o.assigned_plant_id = fc.center_id
                AND o.work_order_status_code IN ('planned','released','in_progress')) AS active_work_order_count
      FROM fulfillment_centers fc
      WHERE fc.is_active = 1
      ORDER BY fc.center_name
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/nearest — find nearest center for a customer+product
router.get('/nearest', async (req, res) => {
  try {
    const { customerId, productId, lat, lon, maxResults = 5 } = req.query;

    let result;
    if (customerId && productId) {
      // Use the spatial function
      result = await db.executeAsUser(`
        SELECT fc.center_id, fc.center_name, fc.city, fc.state_province,
               fc.center_type, fc.latitude, fc.longitude,
               i.quantity_on_hand,
               ROUND(SDO_GEOM.SDO_DISTANCE(
                   c.location, fc.location, 0.005, 'unit=KM'
               ), 2) AS distance_km,
               ROUND(SDO_GEOM.SDO_DISTANCE(
                   c.location, fc.location, 0.005, 'unit=KM'
               ) / 80, 1) AS estimated_hours
        FROM customers c
        CROSS JOIN fulfillment_centers fc
        JOIN inventory i ON fc.center_id = i.center_id AND i.product_id = :productId
        WHERE c.customer_id = :customerId
          AND fc.is_active = 1
          AND i.quantity_on_hand > i.quantity_reserved
        ORDER BY SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=KM')
        FETCH FIRST :maxResults ROWS ONLY
      `, { customerId: parseInt(customerId), productId: parseInt(productId), maxResults: parseInt(maxResults) }, req.demoUser);
    } else if (lat && lon) {
      // Use raw coordinates
      result = await db.executeAsUser(`
        SELECT fc.center_id, fc.center_name, fc.city, fc.state_province,
               fc.center_type, fc.latitude, fc.longitude,
               ROUND(SDO_GEOM.SDO_DISTANCE(
                   SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(:lon, :lat, NULL), NULL, NULL),
                   fc.location, 0.005, 'unit=KM'
               ), 2) AS distance_km
        FROM fulfillment_centers fc
        WHERE fc.is_active = 1
        ORDER BY SDO_GEOM.SDO_DISTANCE(
            SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(:lon2, :lat2, NULL), NULL, NULL),
            fc.location, 0.005, 'unit=KM'
        )
        FETCH FIRST :maxResults ROWS ONLY
      `, { lat: parseFloat(lat), lon: parseFloat(lon),
           lat2: parseFloat(lat), lon2: parseFloat(lon),
           maxResults: parseInt(maxResults) }, req.demoUser);
    } else {
      return res.status(400).json({ error: 'Provide customerId+productId or lat+lon' });
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/shipments
// Source-compatible route records with Manufacturing aliases for the UI.
router.get('/shipments', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let where = '1=1';
    const binds = { limit: parseInt(limit) };

    if (status) { where += " AND s.ship_status = :status"; binds.status = status; }

    const result = await db.executeAsUser(`
      SELECT s.shipment_id,
             s.shipment_id AS work_order_route_id,
             s.work_order_id,
             s.carrier,
             CASE
               WHEN LOWER(s.carrier) LIKE '%fed%' THEN 'Line Transfer'
               WHEN LOWER(s.carrier) LIKE '%ups%' THEN 'Supplier Transfer'
               WHEN LOWER(s.carrier) LIKE '%postal%' OR LOWER(s.carrier) LIKE '%usps%' THEN 'Plant Shuttle'
               WHEN LOWER(s.carrier) LIKE '%dhl%' THEN 'Expedite Lane'
               ELSE NVL(s.carrier, 'Production Route')
             END AS route_provider,
             s.tracking_number,
             s.tracking_number AS route_reference,
             s.ship_status, s.distance_km,
             s.ship_status AS production_route_status,
             ROUND(s.distance_km * 0.621371, 2) AS distance_miles,
             s.estimated_hours, s.ship_cost,
             s.ship_cost AS route_cost,
             s.shipped_at, s.delivered_at,
             fc.center_name, fc.city AS center_city, fc.latitude AS center_lat, fc.longitude AS center_lon,
             c.city AS customer_city, c.latitude AS customer_lat, c.longitude AS customer_lon
      FROM shipments s
      JOIN fulfillment_centers fc ON s.center_id = fc.center_id
      JOIN manufacturing_work_orders o ON s.work_order_id = o.work_order_id
      JOIN customers c ON o.customer_account_id = c.customer_id
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
             GREATEST(i.reorder_point - i.quantity_on_hand, 0) AS capacity_gap,
             NVL(df.production_signal_factor, 1.0) AS production_signal_factor,
             NVL(df.predicted_unit_demand, 0) AS predicted_unit_demand,
             CASE
                 WHEN i.quantity_on_hand = 0 THEN 'out_of_stock'
                 WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'critical'
                 WHEN i.quantity_on_hand < i.reorder_point THEN 'low'
                 ELSE 'adequate'
             END AS stock_status,
             CASE
                 WHEN i.quantity_on_hand = 0 THEN 'line_blocked'
                 WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'critical_capacity_gap'
                 WHEN i.quantity_on_hand < i.reorder_point THEN 'capacity_watch'
                 ELSE 'capacity_ready'
             END AS capacity_status,
             CASE
                 WHEN i.quantity_on_hand = 0 THEN 'Open corrective action, check alternate supplier inventory, and reschedule affected work orders.'
                 WHEN i.quantity_on_hand < i.reorder_point * 0.5 THEN 'Reserve remaining material, add maintenance window review, and qualify alternate line capacity.'
                 WHEN i.quantity_on_hand < i.reorder_point THEN 'Expedite replenishment and monitor OEE impact for the next production shift.'
                 ELSE 'Continue standard production schedule monitoring.'
             END AS recommended_action
      FROM inventory i
      JOIN products p ON i.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      JOIN fulfillment_centers fc ON i.center_id = fc.center_id
      LEFT JOIN manufacturing_demand_forecasts df ON p.product_id = df.manufactured_part_id
          AND df.forecast_date = TRUNC(SYSDATE)
      WHERE i.quantity_on_hand <= i.reorder_point
        AND fc.is_active = 1
      ORDER BY production_signal_factor DESC, i.quantity_on_hand ASC
      FETCH FIRST 50 ROWS ONLY
    `, {}, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/customers
// Returns customer lat/lon + tier for the Customer Tier spatial layer
router.get('/customers', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 800, 2000);
    const result = await db.execute(`
      SELECT customer_id,
             customer_tier,
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
    console.error('Customers layer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/zones
// Returns only provisioned Oracle Spatial service-zone rows. Missing zones are
// reported as an empty database result; the API never invents feature evidence.
router.get('/zones', async (req, res) => {
  try {
    // Radius values mirror the canonical SDO_BUFFER distances used at provisioning.
    const RADIUS_MAP = { express: 80, overnight: 160, standard: 250, economy: 500 };
    const dbResult = await db.executeAsUser(`
      SELECT fz.zone_id, fz.center_id, fz.zone_type, fz.max_delivery_hrs,
             fc.center_name, fc.center_type,
             fc.latitude, fc.longitude
      FROM   fulfillment_zones fz
      JOIN   fulfillment_centers fc ON fz.center_id = fc.center_id
      WHERE  fc.is_active = 1
      ORDER  BY fc.center_name, fz.zone_type
    `, {}, req.demoUser);

    const zones = dbResult.rows.map(z => ({
      ...z,
      RADIUS_KM: RADIUS_MAP[z.ZONE_TYPE] || null,
    }));
    return res.json({
      source: 'database',
      status: zones.length > 0 ? 'ready' : 'empty',
      zones,
    });
  } catch (err) {
    console.error('Zones error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/demand-regions
// Returns demand_regions polygons with forecast summary, colored by demand_index.
// SDO_UTIL.TO_GEOJSON converts Oracle SDO_GEOMETRY → GeoJSON string.
// Joins to manufacturing_demand_forecasts by region_name for 7-day forecast context.
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
             TO_CHAR(SDO_UTIL.TO_GEOJSON(r.boundary)) AS geojson,
             (SELECT ROUND(AVG(df.predicted_unit_demand), 0)
              FROM manufacturing_demand_forecasts df
              WHERE UPPER(df.planning_region) = UPPER(r.region_name)
                AND df.forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7
             ) AS avg_7day_forecast,
             (SELECT ROUND(MAX(df.production_signal_factor), 2)
              FROM manufacturing_demand_forecasts df
              WHERE UPPER(df.planning_region) = UPPER(r.region_name)
                AND df.forecast_date BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 7
             ) AS peak_signal_factor,
             (SELECT COUNT(DISTINCT df.manufactured_part_id)
              FROM manufacturing_demand_forecasts df
              WHERE UPPER(df.planning_region) = UPPER(r.region_name)
             ) AS forecast_parts
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
