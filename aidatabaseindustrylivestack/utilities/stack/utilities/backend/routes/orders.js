/**
 * Orders API
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

const UTILITY_SERVICE_REQUEST_DV_SQL =
  `SELECT DATA FROM utility_service_requests_dv WHERE JSON_VALUE(DATA, '$.serviceRequestId' RETURNING NUMBER) = :id`;
const REQUIRED_UTILITY_SERVICE_REQUEST_DV = 'UTILITY_SERVICE_REQUESTS_DV';

function unwrapDualityDocument(data) {
  let doc = data;
  if (Array.isArray(doc)) doc = doc[0];
  if (typeof doc === 'string') doc = JSON.parse(doc);
  return doc;
}

function isDualityViewUnavailableError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  return ['ORA-00942', 'ORA-01031', 'ORA-04043', 'ORA-04063'].includes(code)
    || /ORA-(?:00942|01031|04043|04063)/i.test(message);
}

function mapUtilityServiceRequestDocument(doc) {
  if (!doc) return doc;
  return {
    serviceRequestId: doc.serviceRequestId ?? doc._id,
    requestingServicePointId: doc.requestingServicePointId,
    requestStatus: doc.requestStatus,
    requestValue: doc.requestValue,
    logisticsCost: doc.logisticsCost,
    demandScore: doc.demandScore ?? doc.urgencyScore,
    createdAt: doc.createdAt,
    lineItems: doc.lineItems || [],
  };
}

function sendDualityUnavailable(res) {
  const details = {
    ready: false,
    feature: 'JSON_RELATIONAL_DUALITY',
    source: REQUIRED_UTILITY_SERVICE_REQUEST_DV,
    requiredSource: REQUIRED_UTILITY_SERVICE_REQUEST_DV,
    sourceMode: 'duality-view',
    executionMode: 'unavailable',
    nativeDualityViewAvailable: false,
  };
  return res.status(503).json({
    error: 'Required Utilities JSON Relational Duality View is unavailable.',
    code: 'DUALITY_VIEW_UNAVAILABLE',
    category: 'ORACLE_FEATURE_UNAVAILABLE',
    details,
  });
}

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const binds = { limit: parseInt(limit), offset };

    if (status) { where += " AND csr.request_status = :status"; binds.status = status; }

    const result = await db.executeAsUser(`
      SELECT csr.service_request_id AS order_id,
             csr.service_request_id,
             csr.request_status AS order_status,
             csr.request_status,
             csr.request_status_display_name,
             csr.request_phase,
             csr.logistics_movement_status,
             csr.logistics_movement_display_name,
             csr.request_value AS order_total,
             csr.request_value,
             csr.logistics_cost AS shipping_cost,
             csr.logistics_cost,
             csr.urgency_score AS demand_score,
             csr.urgency_score,
             csr.created_at,
             csr.requesting_service_point_name AS customer_name,
             csr.requesting_service_point_name,
             csr.requesting_service_point_id,
             csr.requesting_service_point_city AS customer_city,
             csr.requesting_service_point_city,
             csr.requesting_service_point_region AS customer_state,
             csr.requesting_service_point_region,
             csr.field_logistics_site_name AS fulfillment_center,
             csr.field_logistics_site_name,
             csr.field_logistics_site_id,
             (SELECT COUNT(*) FROM utility_request_items cri WHERE cri.service_request_id = csr.service_request_id) AS item_count,
             csr.signal_influenced_flag AS social_driven,
             csr.signal_influenced_flag,
             csr.source_signal_id,
             csr.related_signal_key,
             csr.related_signal_label,
             csr.related_signal_domain,
             csr.related_signal_channel,
             csr.related_signal_intensity,
             csr.related_signal_criticality_score
      FROM utility_service_requests csr
      WHERE ${where}
      ORDER BY csr.created_at DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await db.executeAsUser(`
      SELECT o.*,
             csr.service_request_id,
             csr.requesting_service_point_id,
             csr.request_status,
             csr.request_status_display_name,
             csr.request_phase,
             csr.logistics_movement_status,
             csr.logistics_movement_display_name,
             csr.request_value,
             csr.logistics_cost,
             csr.field_logistics_site_id,
             csr.source_signal_id,
             csr.signal_influenced_flag,
             csr.related_signal_key,
             csr.related_signal_label,
             csr.related_signal_domain,
             csr.related_signal_channel,
             csr.related_signal_intensity,
             csr.related_signal_criticality_score,
             csr.urgency_score,
             c.first_name, c.last_name, c.email, c.city, c.state_province,
             csr.requesting_service_point_name,
             csr.requesting_service_point_city,
             csr.requesting_service_point_region,
             c.latitude AS cust_lat, c.longitude AS cust_lon,
             fc.center_name, fc.city AS center_city, fc.latitude AS center_lat, fc.longitude AS center_lon,
             csr.field_logistics_site_name,
             CASE WHEN c.location IS NOT NULL AND fc.location IS NOT NULL
                  THEN ROUND(SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE'), 2)
                  ELSE NULL END AS spatial_distance_miles
      FROM orders o
      JOIN utility_service_requests csr ON csr.service_request_id = o.order_id
      JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN fulfillment_centers fc ON o.fulfillment_center_id = fc.center_id
      WHERE o.order_id = :id
    `, { id: orderId }, req.demoUser);

    const items = await db.executeAsUser(`
      SELECT oi.*,
             oi.item_id AS line_item_id,
             oi.order_id AS service_request_id,
             oi.product_id AS service_supply_id,
             oi.unit_price AS unit_cost,
             oi.line_total AS line_value,
             oi.fulfilled_from AS fulfillment_logistics_site_id,
             p.product_name, p.product_name AS service_supply_name,
             p.category, p.category AS utility_category,
             b.brand_name, b.brand_name AS utility_operator_or_partner
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      WHERE oi.order_id = :id
    `, { id: orderId }, req.demoUser);

    const shipment = await db.executeAsUser(`
      SELECT s.*,
             s.carrier AS carrier_key,
             s.carrier AS logistics_partner_key,
             CASE s.carrier
               WHEN 'PilotFreight' THEN 'Critical Infrastructure Courier'
               ELSE s.carrier
             END AS carrier_display_name,
             CASE s.carrier
               WHEN 'PilotFreight' THEN 'Critical Infrastructure Courier'
               ELSE s.carrier
             END AS logistics_partner_display_name,
             s.tracking_number AS logistics_route_reference_id,
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
             ROUND(s.distance_km * 0.621371, 2) AS distance_miles,
             s.ship_cost AS logistics_cost
      FROM shipments s
      WHERE order_id = :id
      ORDER BY created_at DESC
      FETCH FIRST 1 ROWS ONLY
    `, { id: orderId }, req.demoUser);

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Utility service request not found' });
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
      order: ord,
      items: items.rows,
      shipment: shipment.rows[0] || null,
      route,
      routeGeometry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id/duality — same utility service request from JSON Duality View
router.get('/:id/duality', async (req, res) => {
  try {
    const orderId = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return res.status(400).json({ error: 'A positive service request ID is required.' });
    }

    let result;

    try {
      result = await db.executeAsUser(
        UTILITY_SERVICE_REQUEST_DV_SQL,
        { id: orderId },
        req.demoUser,
      );
    } catch (err) {
      if (isDualityViewUnavailableError(err)) return sendDualityUnavailable(res);
      throw err;
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utility service request not found in duality view' });
    }

    const rawDoc = unwrapDualityDocument(result.rows[0].DATA);
    const doc = mapUtilityServiceRequestDocument(rawDoc);

    return res.json({
      ready: true,
      feature: 'JSON_RELATIONAL_DUALITY',
      source: REQUIRED_UTILITY_SERVICE_REQUEST_DV,
      requiredSource: REQUIRED_UTILITY_SERVICE_REQUEST_DV,
      sourceMode: 'duality-view',
      executionMode: 'native-duality-view',
      nativeDualityViewAvailable: true,
      sql: UTILITY_SERVICE_REQUEST_DV_SQL.replace(':id', String(orderId)),
      document: doc,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: 'DUALITY_QUERY_FAILED',
      category: 'ORACLE_FEATURE_UNAVAILABLE',
      details: {
        ready: false,
        feature: 'JSON_RELATIONAL_DUALITY',
        source: REQUIRED_UTILITY_SERVICE_REQUEST_DV,
        requiredSource: REQUIRED_UTILITY_SERVICE_REQUEST_DV,
        sourceMode: 'duality-view',
        executionMode: 'unavailable',
        nativeDualityViewAvailable: false,
      },
    });
  }
});

module.exports = router;
