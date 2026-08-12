/**
 * Service request API - compatibility route names backed by service request data.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const {
  toInternalRequestStatus,
  toPublicRequestStatus,
  toPublicServiceTaskStatus,
} = require('../lib/serviceLifecycle');

const PUBLIC_ORDER_KEYS = {
  order: 'serviceRequest',
  shipment: 'serviceTask',
  ORDER_ID: 'SERVICE_REQUEST_ID',
  order_id: 'service_request_id',
  orderId: 'serviceRequestId',
  ORDER_STATUS: 'SERVICE_REQUEST_STATUS',
  order_status: 'service_request_status',
  ORDER_TOTAL: 'SERVICE_VALUE',
  order_total: 'service_value',
  total: 'serviceValue',
  SHIPPING_COST: 'SERVICE_ROUTE_COST',
  shipping_cost: 'service_route_cost',
  shippingCost: 'serviceRouteCost',
  DEMAND_SCORE: 'PRIORITY_SCORE',
  demand_score: 'priority_score',
  demandScore: 'priorityScore',
  CUSTOMER_ID: 'CONSTITUENT_ID',
  customer_id: 'constituent_id',
  customerId: 'constituentId',
  CUSTOMER_NAME: 'RESIDENT_NAME',
  customer_name: 'resident_name',
  CUSTOMER_CITY: 'RESIDENT_CITY',
  customer_city: 'resident_city',
  CUSTOMER_STATE: 'RESIDENT_STATE',
  customer_state: 'resident_state',
  CUST_LAT: 'RESIDENT_LAT',
  CUST_LON: 'RESIDENT_LON',
  FULFILLMENT_CENTER_ID: 'SERVICE_SITE_ID',
  FULFILLMENT_CENTER: 'SERVICE_SITE',
  fulfillment_center: 'service_site',
  CENTER_CITY: 'SERVICE_SITE_CITY',
  center_city: 'service_site_city',
  CENTER_STATE_PROVINCE: 'SERVICE_SITE_STATE',
  center_state_province: 'service_site_state',
  CENTER_POSTAL_CODE: 'SERVICE_SITE_POSTAL_CODE',
  center_postal_code: 'service_site_postal_code',
  ITEM_COUNT: 'LINE_ITEM_COUNT',
  item_count: 'line_item_count',
  SOCIAL_DRIVEN: 'SIGNAL_LINKED',
  social_driven: 'signal_linked',
  PRODUCT_ID: 'SERVICE_ID',
  product_id: 'service_id',
  productId: 'serviceId',
  PRODUCT_NAME: 'SERVICE_NAME',
  product_name: 'service_name',
  BRAND_NAME: 'AGENCY_OR_PROGRAM',
  brand_name: 'agency_or_program',
  UNIT_PRICE: 'ESTIMATED_SERVICE_VALUE',
  unit_price: 'estimated_service_value',
  unitPrice: 'estimatedServiceValue',
  LINE_TOTAL: 'LINE_SERVICE_VALUE',
  line_total: 'line_service_value',
  itemId: 'lineItemId',
  SHIPMENT_ID: 'SERVICE_TASK_ID',
  shipment_id: 'service_task_id',
  SHIP_STATUS: 'SERVICE_TASK_STATUS',
  ship_status: 'service_task_status',
  SHIP_COST: 'SERVICE_TASK_COST',
  ship_cost: 'service_task_cost',
  SHIPPED_AT: 'STARTED_AT',
  shipped_at: 'started_at',
  DELIVERED_AT: 'COMPLETED_AT',
  delivered_at: 'completed_at',
  CARRIER: 'SERVICE_CHANNEL',
  carrier: 'service_channel',
  TRACKING_NUMBER: 'TASK_REFERENCE',
  tracking_number: 'task_reference',
  SPATIAL_DISTANCE_MILES: 'ROUTE_DISTANCE_MILES',
};

function sanitizeOrderString(value) {
  return String(value)
    .replace(/ORDERS_DV/g, 'SERVICE_REQUESTS_DV')
    .replace(/orders_dv/g, 'service_requests_dv')
    .replace(/ORDER_ITEMS/gi, 'SERVICE_REQUEST_LINES')
    .replace(/order_items/gi, 'service_request_lines')
    .replace(/\bORDERS\b/g, 'SERVICE_REQUESTS')
    .replace(/\borders\b/g, 'service_requests')
    .replace(/order_id/gi, 'service_request_id')
    .replace(/order_status/gi, 'service_request_status')
    .replace(/order_total/gi, 'service_value')
    .replace(/customer_id/gi, 'constituent_id')
    .replace(/product_id/gi, 'service_id')
    .replace(/product_name/gi, 'service_name')
    .replace(/unit_price/gi, 'estimated_service_value')
    .replace(/shipping_cost/gi, 'service_route_cost')
    .replace(/\bOrder\b/g, 'Service Request')
    .replace(/\border\b/g, 'service request')
    .replace(/\bOrders\b/g, 'Service Requests')
    .replace(/\borders\b/g, 'service requests')
    .replace(/\bCustomer\b/g, 'Resident')
    .replace(/\bcustomer\b/g, 'resident')
    .replace(/\bProduct\b/g, 'Public Service')
    .replace(/\bproduct\b/g, 'public service')
    .replace(/\bFulfillment\b/g, 'Resolution')
    .replace(/\bfulfillment\b/g, 'resolution')
    .replace(/\bShipment\b/g, 'Service Task')
    .replace(/\bshipment\b/g, 'service task')
    .replace(/\bShip\b/g, 'Task')
    .replace(/\bship\b/g, 'task')
    .replace(/\bCarrier\b/g, 'Service Channel')
    .replace(/\bcarrier\b/g, 'service channel')
    .replace(/\bSocial\b/g, 'Resident signal')
    .replace(/\bsocial\b/g, 'resident signal');
}

function orderLifecycleKind(rawKey, publicKey, inheritedKind = null) {
  const key = String(publicKey || rawKey || '').toUpperCase();
  if (['ORDER_STATUS', 'SERVICE_REQUEST_STATUS', 'REQUEST_STATUS'].includes(key)) return 'request';
  if (['SHIP_STATUS', 'SERVICE_TASK_STATUS', 'ROUTE_STATUS'].includes(key)) return 'serviceTask';
  if (key === 'STATUS') return inheritedKind;
  return null;
}

function childOrderLifecycleKind(rawKey, publicKey, inheritedKind = null) {
  const key = String(publicKey || rawKey || '').replace(/[^A-Za-z]/g, '').toLowerCase();
  if (['order', 'servicerequest', 'document'].includes(key)) return 'request';
  if (['shipment', 'servicetask'].includes(key)) return 'serviceTask';
  return inheritedKind;
}

function sanitizeOrderPayload(value, inheritedKind = null) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => sanitizeOrderPayload(entry, inheritedKind));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
      const publicKey = PUBLIC_ORDER_KEYS[key] || key;
      const statusKind = orderLifecycleKind(key, publicKey, inheritedKind);
      if (statusKind === 'request') return [publicKey, toPublicRequestStatus(entryValue)];
      if (statusKind === 'serviceTask') return [publicKey, toPublicServiceTaskStatus(entryValue)];
      const childKind = childOrderLifecycleKind(key, publicKey, inheritedKind);
      return [publicKey, sanitizeOrderPayload(entryValue, childKind)];
    }));
  }
  if (typeof value === 'string') return sanitizeOrderString(value);
  return value;
}

router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeOrderPayload(payload));
  next();
});

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const binds = { limit: parseInt(limit), offset };

    if (status) {
      const internalStatus = toInternalRequestStatus(status);
      if (!internalStatus) {
        return res.status(400).json({ error: 'Unknown service request status filter' });
      }
      where += " AND o.order_status = :status";
      binds.status = internalStatus;
    }

    const result = await db.executeAsUser(`
      SELECT o.order_id, o.order_status, o.order_total, o.shipping_cost,
             o.demand_score, o.created_at, o.service_region_code,
             c.first_name || ' ' || c.last_name AS customer_name,
             c.city AS customer_city, c.state_province AS customer_state,
             fc.center_name AS fulfillment_center,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count,
             CASE WHEN o.social_source_id IS NOT NULL THEN 1 ELSE 0 END AS social_driven
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN fulfillment_centers fc ON o.fulfillment_center_id = fc.center_id
      WHERE ${where}
      ORDER BY o.created_at DESC
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
      SELECT o.*, c.first_name, c.last_name, c.email, c.city, c.state_province,
             c.latitude AS cust_lat, c.longitude AS cust_lon,
             fc.center_name, fc.city AS center_city,
             fc.state_province AS center_state_province,
             fc.postal_code AS center_postal_code,
             fc.latitude AS center_lat, fc.longitude AS center_lon,
             CASE WHEN c.location IS NOT NULL AND fc.location IS NOT NULL
                  THEN ROUND(SDO_GEOM.SDO_DISTANCE(c.location, fc.location, 0.005, 'unit=MILE'), 2)
                  ELSE NULL END AS spatial_distance_miles
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      LEFT JOIN fulfillment_centers fc ON o.fulfillment_center_id = fc.center_id
      WHERE o.order_id = :id
    `, { id: orderId }, req.demoUser);

    const items = await db.executeAsUser(`
      SELECT oi.*, p.product_name, p.category, b.brand_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      JOIN brands b ON p.brand_id = b.brand_id
      WHERE oi.order_id = :id
    `, { id: orderId }, req.demoUser);

    const shipment = await db.executeAsUser(`
      SELECT s.*, ROUND(s.distance_km * 0.621371, 2) AS distance_miles
      FROM shipments s
      WHERE order_id = :id
      ORDER BY created_at DESC
      FETCH FIRST 1 ROWS ONLY
    `, { id: orderId }, req.demoUser);

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
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
            // Extract driving path geometry - swap GeoJSON [lon,lat] to Leaflet [lat,lon]
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

// GET /api/orders/:id/duality - same order from JSON Duality View
router.get('/:id/duality', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const sql = `SELECT DATA FROM orders_dv WHERE JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id`;
    const result = await db.execute(sql, { id: orderId });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found in duality view' });
    }

    // DATA comes back as an array - unwrap if needed
    let doc = result.rows[0].DATA;
    if (Array.isArray(doc)) doc = doc[0];
    if (typeof doc === 'string') doc = JSON.parse(doc);

    res.json({
      source: 'ORDERS_DV',
      viewDefinition: 'CREATE JSON RELATIONAL DUALITY VIEW orders_dv AS SELECT JSON {...} FROM orders o WITH UPDATE',
      sql: `SELECT DATA FROM orders_dv WHERE JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = ${orderId}`,
      document: doc
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
