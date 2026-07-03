/**
 * Work Orders API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const requireDemoIdentity = require('../middleware/requireDemoIdentity');

// GET /api/work-orders
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const binds = { limit: parseInt(limit), offset };

    if (status) { where += " AND o.work_order_status_code = :status"; binds.status = status; }

    const result = await db.executeAsUser(`
      SELECT o.work_order_id, o.work_order_code, o.work_order_status_code, o.work_order_value, o.routing_cost,
             o.demand_urgency_score, o.created_at,
             o.created_at + NUMTODSINTERVAL(
               CASE
                 WHEN o.work_order_status_code = 'planned' THEN 96
                 WHEN o.work_order_status_code = 'released' THEN 72
                 WHEN o.work_order_status_code = 'in_progress' THEN 48
                 WHEN o.work_order_status_code = 'dispatched' THEN 36
                 ELSE 24
               END, 'HOUR') AS target_completion_date,
             CASE WHEN o.work_order_status_code IN ('planned','released','in_progress')
                  THEN o.created_at + NUMTODSINTERVAL(
                    CASE
                      WHEN o.work_order_status_code = 'planned' THEN 24
                      WHEN o.work_order_status_code = 'released' THEN 18
                      ELSE 12
                    END, 'HOUR')
                  ELSE sr.last_shipped_at END AS projected_ship_date,
             CASE WHEN o.work_order_status_code IN ('planned','released','in_progress','dispatched')
                  THEN NVL(CAST(o.target_completion_date AS TIMESTAMP),
                           o.created_at + NUMTODSINTERVAL(
                             CASE
                               WHEN o.work_order_status_code = 'planned' THEN 96
                               WHEN o.work_order_status_code = 'released' THEN 72
                               WHEN o.work_order_status_code = 'in_progress' THEN 48
                               ELSE 36
                           END, 'HOUR'))
                  ELSE NULL END AS projected_completion_date,
             CASE
               WHEN o.work_order_status_code = 'planned' THEN 'projected_release'
               WHEN o.work_order_status_code = 'released' THEN 'projected_material_pick'
               WHEN o.work_order_status_code = 'in_progress' THEN 'projected_line_transfer'
               WHEN o.work_order_status_code = 'dispatched' THEN 'projected_completion'
               ELSE NULL
             END AS projected_route_status,
             CASE WHEN o.work_order_status_code = 'completed'
                  THEN COALESCE(CAST(o.actual_completion_date AS TIMESTAMP), sr.last_delivered_at)
                  ELSE NULL END AS actual_completion_date,
             CASE WHEN o.work_order_status_code = 'cancelled' THEN
                  CASE MOD(o.work_order_id, 6)
                    WHEN 0 THEN 'material shortage'
                    WHEN 1 THEN 'customer change'
                    WHEN 2 THEN 'duplicate order'
                    WHEN 3 THEN 'quality hold'
                    WHEN 4 THEN 'capacity conflict'
                    ELSE 'supplier delay'
                  END
                  ELSE NULL END AS cancellation_reason,
             c.first_name || ' ' || c.last_name AS customer_name,
             c.city AS customer_city, c.state_province AS customer_state,
	             fc.center_name AS assigned_plant,
	             (SELECT COUNT(*) FROM manufacturing_work_order_lines oi WHERE oi.work_order_id = o.work_order_id) AS work_order_line_count,
	             CASE WHEN o.production_signal_id IS NOT NULL THEN 1 ELSE 0 END AS signal_influenced
      FROM manufacturing_work_orders o
	      JOIN customers c ON o.customer_account_id = c.customer_id
      LEFT JOIN fulfillment_centers fc ON o.assigned_plant_id = fc.center_id
      LEFT JOIN (
        SELECT work_order_id,
               MAX(shipped_at) AS last_shipped_at,
               MAX(delivered_at) AS last_delivered_at
        FROM shipments
        GROUP BY work_order_id
      ) sr ON sr.work_order_id = o.work_order_id
      WHERE ${where}
      ORDER BY o.created_at DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await db.executeAsUser(`
      SELECT o.*,
             o.created_at + NUMTODSINTERVAL(
               CASE
                 WHEN o.work_order_status_code = 'planned' THEN 96
                 WHEN o.work_order_status_code = 'released' THEN 72
                 WHEN o.work_order_status_code = 'in_progress' THEN 48
                 WHEN o.work_order_status_code = 'dispatched' THEN 36
                 ELSE 24
               END, 'HOUR') AS target_completion_date,
             CASE WHEN o.work_order_status_code IN ('planned','released','in_progress')
                  THEN o.created_at + NUMTODSINTERVAL(
                    CASE
                      WHEN o.work_order_status_code = 'planned' THEN 24
                      WHEN o.work_order_status_code = 'released' THEN 18
                      ELSE 12
                    END, 'HOUR')
                  ELSE sr.last_shipped_at END AS projected_ship_date,
             CASE WHEN o.work_order_status_code IN ('planned','released','in_progress','dispatched')
                  THEN NVL(CAST(o.target_completion_date AS TIMESTAMP),
                           o.created_at + NUMTODSINTERVAL(
                             CASE
                               WHEN o.work_order_status_code = 'planned' THEN 96
                               WHEN o.work_order_status_code = 'released' THEN 72
                               WHEN o.work_order_status_code = 'in_progress' THEN 48
                               ELSE 36
                           END, 'HOUR'))
                  ELSE NULL END AS projected_completion_date,
             CASE
               WHEN o.work_order_status_code = 'planned' THEN 'projected_release'
               WHEN o.work_order_status_code = 'released' THEN 'projected_material_pick'
               WHEN o.work_order_status_code = 'in_progress' THEN 'projected_line_transfer'
               WHEN o.work_order_status_code = 'dispatched' THEN 'projected_completion'
               ELSE NULL
             END AS projected_route_status,
             CASE WHEN o.work_order_status_code = 'completed'
                  THEN COALESCE(CAST(o.actual_completion_date AS TIMESTAMP), sr.last_delivered_at)
                  ELSE NULL END AS actual_completion_date,
             CASE WHEN o.work_order_status_code = 'cancelled' THEN
                  CASE MOD(o.work_order_id, 6)
                    WHEN 0 THEN 'material shortage'
                    WHEN 1 THEN 'customer change'
                    WHEN 2 THEN 'duplicate order'
                    WHEN 3 THEN 'quality hold'
                    WHEN 4 THEN 'capacity conflict'
                    ELSE 'supplier delay'
                  END
                  ELSE NULL END AS cancellation_reason,
             c.first_name, c.last_name, c.email, c.city, c.state_province,
             c.latitude AS cust_lat, c.longitude AS cust_lon,
             fc.center_name, fc.city AS center_city, fc.latitude AS center_lat, fc.longitude AS center_lon,
             CASE WHEN c.location IS NOT NULL AND fc.location IS NOT NULL
                  THEN ROUND(SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE'), 2)
                  ELSE NULL END AS spatial_distance_miles
      FROM manufacturing_work_orders o
	      JOIN customers c ON o.customer_account_id = c.customer_id
      LEFT JOIN fulfillment_centers fc ON o.assigned_plant_id = fc.center_id
      LEFT JOIN (
        SELECT work_order_id,
               MAX(shipped_at) AS last_shipped_at,
               MAX(delivered_at) AS last_delivered_at
        FROM shipments
        GROUP BY work_order_id
      ) sr ON sr.work_order_id = o.work_order_id
      WHERE o.work_order_id = :id
    `, { id: orderId }, req.demoUser);

    const items = await db.executeAsUser(`
      SELECT oi.*, p.product_name, p.category, b.brand_name
      FROM manufacturing_work_order_lines oi
      JOIN products p ON oi.manufactured_part_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      WHERE oi.work_order_id = :id
    `, { id: orderId }, req.demoUser);

    const shipment = await db.executeAsUser(`
      SELECT s.*,
             s.shipment_id AS work_order_route_id,
             CASE
               WHEN LOWER(s.carrier) LIKE '%fed%' THEN 'Line Transfer'
               WHEN LOWER(s.carrier) LIKE '%ups%' THEN 'Supplier Transfer'
               WHEN LOWER(s.carrier) LIKE '%postal%' OR LOWER(s.carrier) LIKE '%usps%' THEN 'Plant Shuttle'
               WHEN LOWER(s.carrier) LIKE '%dhl%' THEN 'Expedite Lane'
               ELSE NVL(s.carrier, 'Production Route')
             END AS route_provider,
             s.tracking_number AS route_reference,
             s.ship_status AS production_route_status,
             s.ship_cost AS route_cost,
             ROUND(s.distance_km * 0.621371, 2) AS distance_miles
      FROM shipments s
      WHERE work_order_id = :id
      ORDER BY created_at DESC
      FETCH FIRST 1 ROWS ONLY
    `, { id: orderId }, req.demoUser);

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    // Compute driving route using SDO_GCDR.ELOC_ROUTE
    // Returns distance, time, AND full driving geometry in one call
    let route = null;
    let routeGeometry = null;
    const ord = order.rows[0];
    if (ord.CENTER_LAT && ord.CENTER_LON && ord.CUST_LAT && ord.CUST_LON) {
      try {
        const routeResult = await db.executeAsUser(`
          SELECT SDO_GCDR.ELOC_ROUTE(
            'fastest', 'mile', 'minute',
            :startLon, :startLat,
            :endLon,   :endLat,
            'auto'
          ) AS route_json FROM dual
        `, {
          startLon: ord.CENTER_LON, startLat: ord.CENTER_LAT,
          endLon: ord.CUST_LON, endLat: ord.CUST_LAT
        }, req.demoUser);

        const raw = routeResult.rows[0]?.ROUTE_JSON;
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const r = parsed?.routeResponse?.route;
          if (r) {
            route = { distance: r.distance, time: r.time, distanceUnit: r.distanceUnit, timeUnit: r.timeUnit };
            // Extract driving path geometry — swap GeoJSON [lon,lat] to Leaflet [lat,lon]
            const coords = r.geometry?.coordinates;
            if (coords && coords.length > 0) {
              routeGeometry = coords.map(([lon, lat]) => [lat, lon]);
            }
          }
        }
      } catch (routeErr) {
        console.log('SDO_GCDR.ELOC_ROUTE not available:', routeErr.message);
      }
    }

    res.json({
      workOrder: ord,
      workOrderLines: items.rows,
      productionRoute: shipment.rows[0] || null,
      route,
      routeGeometry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/work-orders/:id/duality — same work order from JSON Duality View
router.get('/:id/duality', requireDemoIdentity, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const sql = `
      SELECT JSON_SERIALIZE(DATA RETURNING CLOB) AS doc
      FROM manufacturing_work_order_documents_dv
      WHERE JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id
    `;
    const result = await db.executeAsUser(sql, { id: orderId }, req.demoUser);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found in duality view' });
    }

    // DATA comes back as an array — unwrap if needed
    let doc = result.rows[0].DOC;
    if (Array.isArray(doc)) doc = doc[0];
    if (typeof doc === 'string') doc = JSON.parse(doc);

    res.json({
      source: 'MANUFACTURING_WORK_ORDER_DOCUMENTS_DV',
      sourceMode: 'duality-view',
      readOnly: true,
      sql: sql.trim(),
      binds: { id: orderId },
      document: doc
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
