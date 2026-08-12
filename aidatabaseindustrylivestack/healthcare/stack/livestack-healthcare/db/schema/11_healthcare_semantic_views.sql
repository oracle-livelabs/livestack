/*
 * 11_healthcare_semantic_views.sql
 * Healthcare-facing semantic views and comments.
 *
 * These objects let Ask Data, Select AI, agents, and demo presenters use
 * healthcare language while the inherited physical table names remain stable
 * for the application, import contracts, JSON duality views, vector search,
 * OML models, and backend routes.
 */

SET SERVEROUTPUT ON

CREATE OR REPLACE VIEW care_sites_v AS
SELECT
  customer_id AS care_site_id,
  email AS care_site_key,
  first_name || ' ' || last_name AS care_site_name,
  city,
  state_province,
  country,
  latitude,
  longitude,
  location,
  customer_tier AS care_site_tier,
  CASE customer_tier
    WHEN 'preferred' THEN 'Preferred Care Route'
    WHEN 'standard' THEN 'Standard Care Route'
    WHEN 'new' THEN 'New / Unvalidated Route'
    WHEN 'vip' THEN 'Priority Care Route'
    ELSE INITCAP(REPLACE(customer_tier, '_', ' '))
  END AS care_site_tier_display_name,
  lifetime_value AS service_value_total,
  created_at
FROM customers;

CREATE OR REPLACE VIEW care_services_v AS
SELECT
  p.product_id AS care_service_id,
  p.sku AS service_code,
  p.product_name AS service_name,
  p.description,
  p.category AS care_category,
  p.subcategory AS care_subcategory,
  p.unit_price AS service_value,
  p.unit_cost AS service_cost,
  p.tags,
  b.brand_id AS partner_id,
  b.brand_name AS provider_network_or_partner,
  b.brand_category AS partner_category
FROM products p
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW quality_capacity_signals_v AS
SELECT
  sp.post_id AS signal_id,
  i.influencer_id AS signal_source_id,
  i.handle AS signal_source,
  i.display_name AS signal_source_name,
  sp.platform AS source_channel,
  sp.post_text AS signal_text,
  sp.posted_at AS signal_timestamp,
  COALESCE(
    sp.virality_score,
    ROUND(LEAST(
      100,
      (LEAST(NVL(sp.views_count, 0), 2000000) / 2000000 * 45) +
      (LEAST(NVL(sp.likes_count, 0), 75000) / 75000 * 30) +
      (LEAST(NVL(sp.shares_count, 0), 15000) / 15000 * 20) +
      (LEAST(NVL(sp.comments_count, 0), 8000) / 8000 * 5)
    ), 2)
  ) AS criticality_score,
  sp.momentum_flag AS signal_intensity,
  sp.sentiment_score AS signal_sentiment,
  sp.views_count AS signal_reach,
  sp.shares_count AS escalation_count
FROM social_posts sp
LEFT JOIN influencers i ON i.influencer_id = sp.influencer_id;

CREATE OR REPLACE VIEW care_request_status_lookup AS
SELECT 'pending' AS request_status,
       'Submitted' AS display_name,
       'Intake' AS request_phase,
       'Request has been submitted and is waiting for logistics assignment.' AS description
FROM dual
UNION ALL SELECT 'confirmed', 'Confirmed', 'Intake',
       'Request has been accepted and is ready for preparation.'
FROM dual
UNION ALL SELECT 'processing', 'Preparing', 'Preparation',
       'Requested services or supplies are being prepared by the assigned logistics site.'
FROM dual
UNION ALL SELECT 'shipped', 'Dispatched', 'Movement',
       'Request has been dispatched; use logistics_movement_status for current route state.'
FROM dual
UNION ALL SELECT 'delivered', 'Delivered', 'Completed',
       'Request has been delivered to the requesting care site.'
FROM dual
UNION ALL SELECT 'cancelled', 'Cancelled', 'Closed',
       'Request was cancelled before fulfillment completed.'
FROM dual
UNION ALL SELECT 'returned', 'Returned', 'Closed',
       'Request was returned after fulfillment activity.'
FROM dual;

CREATE OR REPLACE VIEW care_logistics_partner_lookup AS
SELECT 'CryoLine' AS logistics_partner_key,
       'CryoLine' AS display_name,
       'Cold Chain Courier' AS partner_category
FROM dual
UNION ALL SELECT 'Specialty Care Courier',
       'Specialty Care Courier',
       'Specialty Care Courier'
FROM dual
UNION ALL SELECT 'TrialFreight',
       'Specialty Care Courier',
       'Specialty Care Courier'
FROM dual
UNION ALL SELECT 'SafeTemp',
       'SafeTemp',
       'Temperature-Controlled Logistics'
FROM dual
UNION ALL SELECT 'Clinical Express',
       'Clinical Express',
       'Urgent Care Logistics'
FROM dual;

CREATE OR REPLACE VIEW care_logistics_route_status_lookup AS
SELECT 'preparing' AS logistics_route_status,
       'Request Received' AS display_name,
       1 AS progress_order,
       'Care service request has been received for logistics coordination.' AS description
FROM dual
UNION ALL SELECT 'picked', 'Assigned', 2,
       'Care logistics site or partner has been assigned.'
FROM dual
UNION ALL SELECT 'packed', 'Packed', 3,
       'Requested services or supplies have been prepared for movement.'
FROM dual
UNION ALL SELECT 'shipped', 'Dispatched', 4,
       'Care logistics route has been dispatched.'
FROM dual
UNION ALL SELECT 'in_transit', 'In Transit', 5,
       'Care logistics route is moving toward the requesting care site.'
FROM dual
UNION ALL SELECT 'out_for_delivery', 'Arriving', 6,
       'Care logistics route is arriving at the requesting care site.'
FROM dual
UNION ALL SELECT 'delivered', 'Delivered', 7,
       'Care logistics route has been delivered to the requesting care site.'
FROM dual
UNION ALL SELECT 'exception', 'Logistics Exception', 8,
       'Care logistics route requires review before normal progression can continue.'
FROM dual;

CREATE OR REPLACE VIEW care_request_signal_label_lookup AS
SELECT 'NO_SIGNAL' AS signal_key,
       'No related signal' AS display_name,
       'None' AS signal_domain,
       'No quality, capacity, supply, or logistics signal is linked to the request.' AS description
FROM dual
UNION ALL SELECT 'Compliance Signal', 'Quality Signal', 'Quality',
       'Compliance or quality signal linked to the request.'
FROM dual
UNION ALL SELECT 'Regulatory Notice', 'Quality Signal', 'Quality',
       'Regulatory or compliance notice linked to the request.'
FROM dual
UNION ALL SELECT 'Capacity Alert', 'Capacity Alert', 'Capacity',
       'Capacity alert linked to the request.'
FROM dual
UNION ALL SELECT 'Supply Quality Notice', 'Supply Constraint', 'Supply',
       'Supply quality or availability constraint linked to the request.'
FROM dual
UNION ALL SELECT 'Cold Chain Bulletin', 'Logistics Exception', 'Logistics',
       'Cold-chain or logistics exception signal linked to the request.'
FROM dual;

CREATE OR REPLACE VIEW healthcare_service_requests_v AS
WITH latest_shipments AS (
  SELECT
    order_id,
    MAX(ship_status) KEEP (DENSE_RANK LAST ORDER BY created_at) AS logistics_movement_status
  FROM shipments
  GROUP BY order_id
)
SELECT
  o.order_id AS service_request_id,
  o.order_status AS request_status,
  CASE
    WHEN o.order_status = 'shipped' AND s.logistics_movement_status = 'in_transit' THEN 'In Transit'
    WHEN o.order_status = 'shipped' AND s.logistics_movement_status = 'out_for_delivery' THEN 'Arriving'
    WHEN o.order_status = 'shipped' THEN 'Dispatched'
    ELSE rsl.display_name
  END AS request_status_display_name,
  rsl.request_phase,
  s.logistics_movement_status,
  CASE s.logistics_movement_status
    WHEN 'preparing' THEN 'Request Received'
    WHEN 'picked' THEN 'Assigned'
    WHEN 'packed' THEN 'Packed'
    WHEN 'shipped' THEN 'Dispatched'
    WHEN 'in_transit' THEN 'In Transit'
    WHEN 'out_for_delivery' THEN 'Arriving'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'exception' THEN 'Logistics Exception'
    ELSE NULL
  END AS logistics_movement_display_name,
  o.order_total AS service_value,
  o.shipping_cost AS logistics_cost,
  o.demand_score AS urgency_score,
  o.social_source_id AS source_signal_id,
  CASE WHEN o.social_source_id IS NOT NULL THEN 1 ELSE 0 END AS signal_influenced_flag,
  NVL(sp.platform, 'NO_SIGNAL') AS related_signal_key,
  NVL(sll.display_name, 'Related quality/capacity signal') AS related_signal_label,
  sll.signal_domain AS related_signal_domain,
  sp.platform AS related_signal_channel,
  sp.momentum_flag AS related_signal_intensity,
  sp.virality_score AS related_signal_criticality_score,
  c.customer_id AS care_site_id,
  c.first_name || ' ' || c.last_name AS care_site_name,
  c.city,
  c.state_province,
  fc.center_id AS care_logistics_site_id,
  fc.center_name AS care_logistics_site,
  o.created_at,
  o.updated_at
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.fulfillment_center_id
LEFT JOIN latest_shipments s ON s.order_id = o.order_id
LEFT JOIN social_posts sp ON sp.post_id = o.social_source_id
LEFT JOIN care_request_status_lookup rsl ON rsl.request_status = o.order_status
LEFT JOIN care_request_signal_label_lookup sll ON sll.signal_key = NVL(sp.platform, 'NO_SIGNAL');

CREATE OR REPLACE VIEW care_service_requests AS
WITH latest_shipments AS (
  SELECT
    order_id,
    MAX(ship_status) KEEP (DENSE_RANK LAST ORDER BY created_at) AS logistics_movement_status
  FROM shipments
  GROUP BY order_id
)
SELECT
  o.order_id AS service_request_id,
  o.customer_id AS requesting_care_site_id,
  c.first_name || ' ' || c.last_name AS requesting_care_site_name,
  c.city AS requesting_care_site_city,
  c.state_province AS requesting_care_site_region,
  o.order_status AS request_status,
  CASE
    WHEN o.order_status = 'shipped' AND s.logistics_movement_status = 'in_transit' THEN 'In Transit'
    WHEN o.order_status = 'shipped' AND s.logistics_movement_status = 'out_for_delivery' THEN 'Arriving'
    WHEN o.order_status = 'shipped' THEN 'Dispatched'
    ELSE rsl.display_name
  END AS request_status_display_name,
  rsl.request_phase,
  s.logistics_movement_status,
  CASE s.logistics_movement_status
    WHEN 'preparing' THEN 'Request Received'
    WHEN 'picked' THEN 'Assigned'
    WHEN 'packed' THEN 'Packed'
    WHEN 'shipped' THEN 'Dispatched'
    WHEN 'in_transit' THEN 'In Transit'
    WHEN 'out_for_delivery' THEN 'Arriving'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'exception' THEN 'Logistics Exception'
    ELSE NULL
  END AS logistics_movement_display_name,
  o.order_total AS request_value,
  o.shipping_cost AS logistics_cost,
  o.fulfillment_center_id AS care_logistics_site_id,
  fc.center_name AS care_logistics_site_name,
  o.shipping_lat AS destination_lat,
  o.shipping_lon AS destination_lon,
  o.estimated_delivery AS estimated_completion_at,
  o.actual_delivery AS completed_at,
  o.social_source_id AS source_signal_id,
  CASE WHEN o.social_source_id IS NOT NULL THEN 1 ELSE 0 END AS signal_influenced_flag,
  NVL(sp.platform, 'NO_SIGNAL') AS related_signal_key,
  NVL(sll.display_name, 'Related quality/capacity signal') AS related_signal_label,
  sll.signal_domain AS related_signal_domain,
  sp.platform AS related_signal_channel,
  sp.momentum_flag AS related_signal_intensity,
  sp.virality_score AS related_signal_criticality_score,
  o.demand_score AS urgency_score,
  o.created_at,
  o.updated_at
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.fulfillment_center_id
LEFT JOIN latest_shipments s ON s.order_id = o.order_id
LEFT JOIN social_posts sp ON sp.post_id = o.social_source_id
LEFT JOIN care_request_status_lookup rsl ON rsl.request_status = o.order_status
LEFT JOIN care_request_signal_label_lookup sll ON sll.signal_key = NVL(sp.platform, 'NO_SIGNAL');

CREATE OR REPLACE VIEW care_request_items AS
SELECT
  oi.item_id AS line_item_id,
  oi.order_id AS service_request_id,
  oi.product_id AS service_supply_id,
  p.product_name AS service_supply_name,
  p.category AS care_category,
  b.brand_id AS provider_partner_id,
  b.brand_name AS provider_network_or_partner,
  oi.quantity,
  oi.unit_price AS unit_cost,
  oi.line_total AS line_value,
  oi.fulfilled_from AS fulfillment_logistics_site_id,
  fc.center_name AS fulfillment_logistics_site_name
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
JOIN brands b ON b.brand_id = p.brand_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = oi.fulfilled_from;

CREATE OR REPLACE JSON RELATIONAL DUALITY VIEW care_service_requests_dv AS
SELECT JSON {
    '_id'                  : o.order_id,
    'serviceRequestId'     : TO_NUMBER(o.order_id),
    'requestingCareSiteId' : o.customer_id,
    'requestStatus'        : o.order_status,
    'requestValue'         : o.order_total,
    'logisticsCost'        : o.shipping_cost,
    'demandScore'          : o.demand_score,
    'createdAt'            : o.created_at,
    'lineItems' : [
        SELECT JSON {
            'lineItemId'      : oi.item_id,
            'serviceSupplyId' : oi.product_id,
            'quantity'        : oi.quantity,
            'unitCost'        : oi.unit_price,
            'lineValue'       : oi.line_total
        }
        FROM order_items oi WITH UPDATE
        WHERE oi.order_id = o.order_id
    ]
}
FROM orders o WITH UPDATE;

CREATE OR REPLACE VIEW care_logistics_sites_v AS
WITH inventory_rollup AS (
  SELECT
    center_id,
    COUNT(DISTINCT CASE WHEN NVL(quantity_on_hand, 0) > 0 THEN product_id END) AS services_count,
    SUM(NVL(quantity_on_hand, 0)) AS total_supply_units,
    SUM(GREATEST(NVL(quantity_on_hand, 0) - NVL(quantity_reserved, 0), 0)) AS capacity_supply_units,
    SUM(
      CASE
        WHEN NVL(quantity_on_hand, 0) <= NVL(reorder_point, 0) THEN 1
        ELSE 0
      END
    ) AS alert_count,
    SUM(
      CASE
        WHEN NVL(quantity_on_hand, 0) = 0
          OR NVL(quantity_on_hand, 0) < NVL(reorder_point, 0) * 0.5
        THEN 1
        ELSE 0
      END
    ) AS high_priority_alert_count,
    MAX(updated_at) AS last_inventory_updated_at
  FROM inventory
  GROUP BY center_id
),
request_rollup AS (
  SELECT
    fulfillment_center_id AS center_id,
    COUNT(*) AS pending_request_count,
    MAX(updated_at) AS last_request_updated_at
  FROM orders
  WHERE order_status IN ('pending', 'confirmed', 'processing')
  GROUP BY fulfillment_center_id
),
route_rollup AS (
  SELECT
    center_id,
    MAX(NVL(delivered_at, NVL(shipped_at, created_at))) AS last_route_updated_at
  FROM shipments
  GROUP BY center_id
),
site_metrics AS (
  SELECT
    fc.center_id,
    fc.center_name,
    fc.center_type,
    CASE fc.center_type
      WHEN 'distribution' THEN 'Distribution Hub'
      WHEN 'warehouse' THEN 'Care Supply Warehouse'
      WHEN 'micro' THEN 'Micro Fulfillment Site'
      WHEN 'store' THEN 'Micro Fulfillment Site'
      WHEN 'drop_ship' THEN 'Partner Logistics Site'
      ELSE INITCAP(REPLACE(fc.center_type, '_', ' '))
    END AS site_type_display_name,
    fc.address_line1,
    fc.city,
    fc.state_province,
    fc.postal_code,
    fc.country,
    fc.latitude,
    fc.longitude,
    fc.location,
    fc.capacity_units,
    fc.current_load_pct,
    fc.is_active,
    fc.operating_hours,
    fc.created_at,
    NVL(i.services_count, 0) AS services_count,
    NVL(i.total_supply_units, 0) AS total_supply_units,
    NVL(i.capacity_supply_units, 0) AS capacity_supply_units,
    NVL(i.alert_count, 0) AS alert_count,
    NVL(i.high_priority_alert_count, 0) AS high_priority_alert_count,
    NVL(r.pending_request_count, 0) AS pending_request_count,
    ROUND(
      NVL(
        NVL(i.total_supply_units, 0) / NULLIF(fc.capacity_units, 0) * 100,
        NVL(fc.current_load_pct, 0)
      ),
      1
    ) AS load_percentage,
    i.last_inventory_updated_at,
    r.last_request_updated_at,
    routes.last_route_updated_at
  FROM fulfillment_centers fc
  LEFT JOIN inventory_rollup i ON i.center_id = fc.center_id
  LEFT JOIN request_rollup r ON r.center_id = fc.center_id
  LEFT JOIN route_rollup routes ON routes.center_id = fc.center_id
)
SELECT
  center_id AS care_logistics_site_id,
  center_name AS care_logistics_site_name,
  center_type AS site_type,
  site_type_display_name,
  center_id AS site_id,
  center_name AS site_name,
  center_type AS care_logistics_site_type,
  site_type_display_name AS care_logistics_site_type_display_name,
  CASE
    WHEN city IS NOT NULL AND state_province IS NOT NULL THEN city || ', ' || state_province
    ELSE NVL(city, state_province)
  END AS location_name,
  state_province AS region_name,
  address_line1,
  city,
  state_province,
  postal_code,
  country,
  latitude,
  longitude,
  location,
  capacity_units,
  current_load_pct,
  load_percentage,
  is_active,
  operating_hours,
  services_count,
  capacity_supply_units,
  total_supply_units,
  pending_request_count,
  alert_count,
  high_priority_alert_count,
  CASE
    WHEN is_active <> 1 THEN 'Inactive'
    WHEN high_priority_alert_count > 0 THEN 'Critical'
    WHEN alert_count > 0 OR load_percentage >= 80 THEN 'Constrained'
    WHEN pending_request_count > 0 THEN 'Watch'
    ELSE 'Active'
  END AS operational_status,
  CASE
    WHEN high_priority_alert_count > 0 THEN 'Critical supply constraint'
    WHEN alert_count > 0 THEN 'Capacity and supply watch'
    WHEN load_percentage >= 80 THEN 'High site load'
    WHEN pending_request_count > 0 THEN 'Open logistics requests'
    ELSE 'Stable operations'
  END AS primary_constraint,
  CASE
    WHEN high_priority_alert_count > 0 THEN 'Review critical supply availability and route urgent care logistics to alternate sites.'
    WHEN alert_count > 0 THEN 'Review capacity and supply alerts before assigning additional requests.'
    WHEN load_percentage >= 80 THEN 'Check route coverage and rebalance demand across nearby care logistics sites.'
    WHEN pending_request_count > 0 THEN 'Monitor open logistics requests and confirm service-zone coverage.'
    ELSE 'Continue monitoring route coverage and care demand regions.'
  END AS recommended_action,
  GREATEST(
    created_at,
    NVL(last_inventory_updated_at, created_at),
    NVL(last_request_updated_at, created_at),
    NVL(last_route_updated_at, created_at)
  ) AS last_updated_at
FROM site_metrics;

COMMENT ON TABLE brands IS
  'Healthcare provider networks, manufacturers, service partners, and signal organizations. The inherited table name brands is retained for application compatibility.';

COMMENT ON TABLE products IS
  'Healthcare care services, supplies, logistics offerings, and operational service bundles. The inherited table name products is retained for application compatibility.';

COMMENT ON TABLE customers IS
  'Care sites, facilities, health systems, and clinical locations. The inherited table name customers is retained for application compatibility.';

COMMENT ON TABLE orders IS
  'Healthcare service requests with status, service value, logistics assignment, care-site reference, signal attribution, and urgency score. The inherited table name orders is retained for application compatibility.';

COMMENT ON TABLE social_posts IS
  'Healthcare quality, regulatory, logistics, and capacity signals. The inherited table name social_posts is retained for application compatibility.';

COMMENT ON TABLE influencers IS
  'Healthcare signal sources such as regulators, quality desks, logistics desks, provider operations teams, and partner update feeds. The inherited table name influencers is retained for application compatibility.';

COMMENT ON TABLE demand_forecasts IS
  'Healthcare service and supply demand forecasts by region and date. Use for capacity planning, care logistics, and service-value exposure.';

COMMENT ON TABLE care_sites_v IS
  'Healthcare semantic view of care sites, facilities, health systems, and clinical locations from the inherited customers table.';

COMMENT ON TABLE care_services_v IS
  'Healthcare semantic view of care services, supplies, logistics offerings, and service partners from inherited products and brands tables.';

COMMENT ON TABLE quality_capacity_signals_v IS
  'Healthcare semantic view of quality, regulatory, logistics, and capacity signal bulletins from inherited social_posts and influencers tables.';

COMMENT ON TABLE care_request_status_lookup IS
  'Healthcare display labels and phases for canonical service request status keys. Canonical keys remain stable for filtering, VPD, and route logic.';

COMMENT ON TABLE care_request_signal_label_lookup IS
  'Healthcare display labels and domains for request signal attribution. Canonical signal channels remain available for drill-down queries.';

COMMENT ON TABLE healthcare_service_requests_v IS
  'Healthcare semantic view of service requests, care sites, service value, logistics assignment, and signal attribution from inherited orders, customers, and fulfillment_centers tables.';

COMMENT ON TABLE care_service_requests IS
  'Healthcare-named query surface for care service requests. It preserves the inherited orders table for compatibility while exposing service-request, care-site, logistics-cost, and request-value field names.';

COMMENT ON TABLE care_request_items IS
  'Healthcare-named query surface for care service request line items. It preserves inherited order_items rows while exposing service-supply, unit-cost, and line-value field names.';

COMMENT ON TABLE care_service_requests_dv IS
  'Healthcare-facing JSON Relational Duality View for care service request rows, with service request, care site, logistics cost, request value, and line item JSON field names.';

COMMENT ON COLUMN care_service_requests.service_request_id IS
  'Stable care service request identifier, mapped from orders.order_id.';

COMMENT ON COLUMN care_service_requests.requesting_care_site_id IS
  'Care site that requested the service or supply, mapped from orders.customer_id.';

COMMENT ON COLUMN care_service_requests.request_value IS
  'Service request value in US dollars, mapped from orders.order_total.';

COMMENT ON COLUMN care_service_requests.logistics_cost IS
  'Logistics cost associated with fulfilling the care service request, mapped from orders.shipping_cost.';

COMMENT ON COLUMN care_service_requests.request_status_display_name IS
  'Healthcare-facing status label derived from the canonical request_status key and, for dispatched requests, current logistics movement state.';

COMMENT ON COLUMN care_service_requests.logistics_movement_display_name IS
  'Healthcare-facing logistics route state from the latest shipment record, such as In Transit or Arriving.';

COMMENT ON COLUMN care_service_requests.related_signal_label IS
  'Healthcare-facing signal label: No related signal, Quality Signal, Capacity Alert, Supply Constraint, Logistics Exception, or fallback related quality/capacity signal.';

COMMENT ON COLUMN care_service_requests.related_signal_domain IS
  'Signal domain used for healthcare operations grouping, such as Quality, Capacity, Supply, Logistics, or None.';

COMMENT ON COLUMN care_request_items.service_supply_id IS
  'Care service or supply catalog identifier, mapped from order_items.product_id.';

COMMENT ON COLUMN care_request_items.unit_cost IS
  'Unit value for the requested service or supply line, mapped from order_items.unit_price for demo compatibility.';

COMMENT ON COLUMN care_request_items.line_value IS
  'Line value for the request item, derived from quantity multiplied by unit cost.';

COMMENT ON TABLE care_logistics_sites_v IS
  'Healthcare semantic view of care logistics site details, operating capacity, supply constraints, pending requests, location, and recommended operational actions from inherited fulfillment, inventory, order, and shipment tables.';

COMMENT ON COLUMN care_logistics_sites_v.site_id IS
  'Stable canonical care logistics site identifier, retained from fulfillment_centers.center_id.';

COMMENT ON COLUMN care_logistics_sites_v.site_name IS
  'Healthcare-friendly care logistics site name for popups, tables, and direct SQL.';

COMMENT ON COLUMN care_logistics_sites_v.site_type_display_name IS
  'Healthcare-facing site type label such as Distribution Hub, Care Supply Warehouse, or Micro Fulfillment Site.';

COMMENT ON COLUMN care_logistics_sites_v.location_name IS
  'Readable city and region label for the care logistics site.';

COMMENT ON COLUMN care_logistics_sites_v.services_count IS
  'Count of care services or supplies currently stocked at the care logistics site.';

COMMENT ON COLUMN care_logistics_sites_v.capacity_supply_units IS
  'Available supply units at the care logistics site, calculated as on-hand units minus reserved units and floored at zero.';

COMMENT ON COLUMN care_logistics_sites_v.pending_request_count IS
  'Count of pending, confirmed, or processing logistics requests assigned to the care logistics site.';

COMMENT ON COLUMN care_logistics_sites_v.load_percentage IS
  'Calculated site load percentage based on total on-hand supply units over configured capacity, falling back to the seeded current_load_pct value.';

COMMENT ON COLUMN care_logistics_sites_v.alert_count IS
  'Count of stocked service or supply records at or below their reorder point for the care logistics site.';

COMMENT ON COLUMN care_logistics_sites_v.operational_status IS
  'Derived care logistics operating status from active state, high-priority alerts, supply alerts, site load, and pending requests.';

COMMENT ON COLUMN care_logistics_sites_v.primary_constraint IS
  'Derived demo-safe operating constraint for the care logistics site based on supply alerts, site load, and pending requests.';

COMMENT ON COLUMN care_logistics_sites_v.recommended_action IS
  'Derived demo-safe next action for care logistics operators based on current site metrics.';

COMMENT ON COLUMN care_logistics_sites_v.last_updated_at IS
  'Most recent timestamp across site creation, inventory updates, service-request updates, and logistics movement updates.';

COMMENT ON COLUMN orders.order_total IS
  'Service value or budget exposure for the healthcare service request.';

COMMENT ON COLUMN social_posts.virality_score IS
  'Healthcare criticality score from 0 to 100 combining urgency, reach, and operational amplification.';

COMMENT ON COLUMN influencers.handle IS
  'Healthcare signal source handle, such as a regulator feed, quality desk, logistics desk, or partner update feed.';

COMMENT ON COLUMN customers.customer_tier IS
  'Care-site tier used for segmentation and VPD demos: new, standard, preferred, or vip.';

BEGIN
  DBMS_OUTPUT.PUT_LINE('Healthcare semantic views and comments refreshed.');
END;
/

-- Additional healthcare-facing semantic surfaces for Ask Data, Select AI, and agent demos.
CREATE OR REPLACE VIEW care_service_signal_matches_v AS
SELECT
  sm.match_id,
  sp.post_id AS signal_id,
  sp.post_text AS signal_text,
  COALESCE(
    sp.virality_score,
    ROUND(LEAST(
      100,
      (LEAST(NVL(sp.views_count, 0), 2000000) / 2000000 * 45) +
      (LEAST(NVL(sp.likes_count, 0), 75000) / 75000 * 30) +
      (LEAST(NVL(sp.shares_count, 0), 15000) / 15000 * 20) +
      (LEAST(NVL(sp.comments_count, 0), 8000) / 8000 * 5)
    ), 2)
  ) AS criticality_score,
  sp.momentum_flag AS signal_intensity,
  p.product_id AS care_service_id,
  p.product_name AS care_service_name,
  p.category AS care_category,
  sm.similarity_score,
  sm.match_rank,
  sm.match_method,
  sm.verified,
  sm.created_at
FROM semantic_matches sm
JOIN social_posts sp ON sp.post_id = sm.post_id
JOIN products p ON p.product_id = sm.product_id;

CREATE OR REPLACE VIEW care_supply_capacity_v AS
SELECT
  p.product_id AS care_service_id,
  p.product_name AS care_service_name,
  p.category AS care_category,
  fc.center_id AS care_logistics_site_id,
  fc.center_name AS care_logistics_site_name,
  fc.center_type AS care_logistics_site_type,
  CASE fc.center_type
    WHEN 'distribution' THEN 'Distribution Hub'
    WHEN 'warehouse' THEN 'Care Supply Warehouse'
    WHEN 'micro' THEN 'Micro Fulfillment Site'
    WHEN 'store' THEN 'Micro Fulfillment Site'
    WHEN 'drop_ship' THEN 'Partner Logistics Site'
    ELSE INITCAP(REPLACE(fc.center_type, '_', ' '))
  END AS care_logistics_site_type_display_name,
  fc.city,
  fc.state_province,
  i.quantity_on_hand,
  i.quantity_reserved,
  i.quantity_incoming,
  i.reorder_point,
  i.reorder_qty,
  CASE
    WHEN i.quantity_on_hand <= 0 THEN 'OUT_OF_STOCK'
    WHEN i.quantity_on_hand < i.reorder_point THEN 'AT_RISK'
    ELSE 'ADEQUATE'
  END AS capacity_status,
  i.updated_at
FROM inventory i
JOIN products p ON p.product_id = i.product_id
JOIN fulfillment_centers fc ON fc.center_id = i.center_id;

CREATE OR REPLACE VIEW care_logistics_zones_v AS
SELECT
  fz.zone_id AS care_logistics_zone_id,
  fc.center_id AS care_logistics_site_id,
  fc.center_name AS care_logistics_site_name,
  fc.center_type AS care_logistics_site_type,
  CASE fc.center_type
    WHEN 'distribution' THEN 'Distribution Hub'
    WHEN 'warehouse' THEN 'Care Supply Warehouse'
    WHEN 'micro' THEN 'Micro Fulfillment Site'
    WHEN 'store' THEN 'Micro Fulfillment Site'
    WHEN 'drop_ship' THEN 'Partner Logistics Site'
    ELSE INITCAP(REPLACE(fc.center_type, '_', ' '))
  END AS care_logistics_site_type_display_name,
  fz.zone_type AS care_logistics_zone_type,
  CASE fz.zone_type
    WHEN 'express' THEN 'Urgent Care Logistics'
    WHEN 'overnight' THEN 'Next-Day Care Logistics'
    WHEN 'standard' THEN 'Standard Care Route'
    WHEN 'economy' THEN 'Routine Replenishment'
    ELSE INITCAP(REPLACE(fz.zone_type, '_', ' '))
  END AS care_logistics_zone_display_name,
  fz.max_delivery_hrs,
  fz.zone_boundary,
  fz.created_at
FROM fulfillment_zones fz
JOIN fulfillment_centers fc ON fc.center_id = fz.center_id
WHERE fc.is_active = 1;

CREATE OR REPLACE VIEW care_demand_regions_v AS
SELECT
  region_id AS care_demand_region_id,
  region_name AS care_demand_region_name,
  region_type AS care_demand_region_type,
  INITCAP(REPLACE(region_type, '_', ' ')) AS care_demand_region_type_display_name,
  boundary,
  population,
  avg_income,
  social_density AS signal_density_per_1000,
  demand_index AS care_demand_index,
  CASE
    WHEN demand_index >= 85 THEN 'Critical Care Demand'
    WHEN demand_index >= 70 THEN 'High Care Demand'
    WHEN demand_index >= 55 THEN 'Moderate Care Demand'
    WHEN demand_index >= 40 THEN 'Lower Care Demand'
    ELSE 'Stable Care Demand'
  END AS care_demand_level,
  updated_at
FROM demand_regions;

CREATE OR REPLACE VIEW care_logistics_routes_v AS
SELECT
  s.shipment_id AS care_logistics_route_id,
  s.order_id AS service_request_id,
  s.carrier AS logistics_partner_key,
  NVL(lpl.display_name, s.carrier) AS logistics_partner_display_name,
  s.tracking_number AS logistics_tracking_number,
  s.tracking_number AS logistics_route_reference_id,
  s.ship_status AS logistics_route_status,
  NVL(lrsl.display_name, INITCAP(REPLACE(s.ship_status, '_', ' '))) AS logistics_route_status_display_name,
  lrsl.progress_order AS logistics_route_progress_order,
  lrsl.description AS logistics_route_status_description,
  s.distance_km,
  ROUND(s.distance_km * 0.621371, 2) AS distance_miles,
  s.estimated_hours,
  s.ship_cost AS logistics_cost,
  fc.center_id AS care_logistics_site_id,
  fc.center_name AS care_logistics_site_name,
  fc.center_type AS care_logistics_site_type,
  CASE fc.center_type
    WHEN 'distribution' THEN 'Distribution Hub'
    WHEN 'warehouse' THEN 'Care Supply Warehouse'
    WHEN 'micro' THEN 'Micro Fulfillment Site'
    WHEN 'store' THEN 'Micro Fulfillment Site'
    WHEN 'drop_ship' THEN 'Partner Logistics Site'
    ELSE INITCAP(REPLACE(fc.center_type, '_', ' '))
  END AS care_logistics_site_type_display_name,
  c.customer_id AS care_site_id,
  c.city AS care_site_city,
  c.state_province AS care_site_state,
  c.customer_tier AS care_route_tier,
  CASE c.customer_tier
    WHEN 'preferred' THEN 'Preferred Care Route'
    WHEN 'standard' THEN 'Standard Care Route'
    WHEN 'new' THEN 'New / Unvalidated Route'
    WHEN 'vip' THEN 'Priority Care Route'
    ELSE INITCAP(REPLACE(c.customer_tier, '_', ' '))
  END AS care_route_tier_display_name,
  s.shipped_at,
  s.delivered_at
FROM shipments s
JOIN fulfillment_centers fc ON fc.center_id = s.center_id
JOIN orders o ON o.order_id = s.order_id
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN care_logistics_partner_lookup lpl ON lpl.logistics_partner_key = s.carrier
LEFT JOIN care_logistics_route_status_lookup lrsl ON lrsl.logistics_route_status = s.ship_status;

CREATE OR REPLACE VIEW care_logistics_kpis_v AS
WITH active_sites AS (
  SELECT
    fc.center_id,
    fc.capacity_units,
    NVL(
      ROUND(
        (
          SELECT SUM(i2.quantity_on_hand)
          FROM inventory i2
          WHERE i2.center_id = fc.center_id
        ) / NULLIF(fc.capacity_units, 0) * 100,
        1
      ),
      NVL(fc.current_load_pct, 0)
    ) AS calculated_load_pct
  FROM fulfillment_centers fc
  WHERE fc.is_active = 1
),
inventory_by_site AS (
  SELECT
    i.center_id,
    SUM(GREATEST(NVL(i.quantity_on_hand, 0) - NVL(i.quantity_reserved, 0), 0)) AS available_capacity_supply_units,
    SUM(
      CASE
        WHEN NVL(i.quantity_on_hand, 0) <= NVL(i.reorder_point, 0) THEN 1
        ELSE 0
      END
    ) AS capacity_supply_alert_count,
    SUM(
      CASE
        WHEN NVL(i.quantity_on_hand, 0) = 0
          OR NVL(i.quantity_on_hand, 0) < NVL(i.reorder_point, 0) * 0.5
        THEN 1
        ELSE 0
      END
    ) AS high_priority_alert_count
  FROM inventory i
  JOIN active_sites s ON s.center_id = i.center_id
  GROUP BY i.center_id
),
pending_requests_by_site AS (
  SELECT
    o.fulfillment_center_id AS center_id,
    COUNT(*) AS pending_logistics_request_count
  FROM orders o
  JOIN active_sites s ON s.center_id = o.fulfillment_center_id
  WHERE o.order_status IN ('pending', 'confirmed', 'processing')
  GROUP BY o.fulfillment_center_id
),
site_rollup AS (
  SELECT
    s.center_id,
    NVL(i.available_capacity_supply_units, 0) AS available_capacity_supply_units,
    NVL(i.capacity_supply_alert_count, 0) AS capacity_supply_alert_count,
    NVL(i.high_priority_alert_count, 0) AS high_priority_alert_count,
    NVL(p.pending_logistics_request_count, 0) AS pending_logistics_request_count,
    CASE
      WHEN s.calculated_load_pct >= 80 THEN 1
      ELSE 0
    END AS high_load_site_flag
  FROM active_sites s
  LEFT JOIN inventory_by_site i ON i.center_id = s.center_id
  LEFT JOIN pending_requests_by_site p ON p.center_id = s.center_id
)
SELECT
  COUNT(center_id) AS active_care_logistics_site_count,
  NVL(SUM(available_capacity_supply_units), 0) AS available_capacity_supply_units,
  NVL(SUM(pending_logistics_request_count), 0) AS pending_logistics_request_count,
  NVL(SUM(capacity_supply_alert_count), 0) AS capacity_supply_alert_count,
  NVL(SUM(high_priority_alert_count), 0) AS high_priority_alert_count,
  NVL(SUM(high_load_site_flag), 0) AS high_load_site_count
FROM site_rollup;

CREATE OR REPLACE VIEW healthcare_agent_actions_v AS
SELECT
  action_id,
  agent_name,
  CASE agent_name
    WHEN 'SOCIAL_TREND_TEAM' THEN 'Quality Signal Agent'
    WHEN 'FULFILLMENT_TEAM' THEN 'Care Logistics Agent'
    WHEN 'COMMERCE_TEAM' THEN 'Care Service Request Agent'
    ELSE agent_name
  END AS healthcare_agent_name,
  action_type,
  entity_type,
  entity_id,
  confidence,
  execution_status,
  decision_payload,
  created_at,
  executed_at
FROM agent_actions;

COMMENT ON TABLE care_service_signal_matches_v IS
  'Healthcare semantic view of quality or capacity signals matched to care services and supplies by vector, keyword, hybrid, or visual method.';

COMMENT ON TABLE care_supply_capacity_v IS
  'Healthcare semantic view of care service capacity and supply status by care logistics site, including on-hand, reserved, incoming, reorder, and capacity status fields.';

COMMENT ON TABLE care_logistics_zones_v IS
  'Healthcare semantic view of care logistics service zones with stable zone keys and healthcare-facing display names for map legends, popups, and direct SQL.';

COMMENT ON TABLE care_demand_regions_v IS
  'Healthcare semantic view of demand regions using Care Demand Index terminology for provider-network capacity and logistics demos.';

COMMENT ON TABLE care_logistics_routes_v IS
  'Healthcare semantic view of logistics movement routes, carriers or partners, route status, care site tier display names, and logistics site type display names.';

COMMENT ON TABLE care_logistics_partner_lookup IS
  'Healthcare-facing display metadata for logistics carrier or partner keys used by service request route records.';

COMMENT ON TABLE care_logistics_route_status_lookup IS
  'Healthcare-facing route status labels, progress order, and descriptions for canonical shipment status keys.';

COMMENT ON COLUMN care_logistics_routes_v.logistics_partner_display_name IS
  'Healthcare-facing carrier or logistics partner name for route tabs, map legends, popups, and SQL demos.';

COMMENT ON COLUMN care_logistics_routes_v.logistics_route_reference_id IS
  'Healthcare-facing route reference identifier retained from the inherited tracking number.';

COMMENT ON COLUMN care_logistics_routes_v.logistics_route_status_display_name IS
  'Healthcare-facing display label for the canonical logistics route status key.';

COMMENT ON COLUMN care_logistics_routes_v.logistics_route_progress_order IS
  'Progress sequence for route timeline display: request received, assigned, prepared, dispatched, in transit, arriving, delivered.';

COMMENT ON TABLE care_logistics_kpis_v IS
  'Healthcare semantic KPI view for the Care Logistics Map. Metrics are derived from VPD-filtered active care logistics sites, inventory, and pending service requests.';

COMMENT ON COLUMN care_logistics_kpis_v.active_care_logistics_site_count IS
  'Count of active care logistics sites visible to the current database security context.';

COMMENT ON COLUMN care_logistics_kpis_v.available_capacity_supply_units IS
  'Total available supply units across active visible care logistics sites, calculated as on-hand units minus reserved units and floored at zero.';

COMMENT ON COLUMN care_logistics_kpis_v.pending_logistics_request_count IS
  'Count of pending, confirmed, or processing care logistics requests assigned to active visible care logistics sites.';

COMMENT ON COLUMN care_logistics_kpis_v.capacity_supply_alert_count IS
  'Count of active visible site inventory records at or below their reorder point.';

COMMENT ON COLUMN care_logistics_kpis_v.high_priority_alert_count IS
  'Count of active visible site inventory records that are out of stock or below half of their reorder point.';

COMMENT ON COLUMN care_logistics_kpis_v.high_load_site_count IS
  'Count of active visible care logistics sites with calculated inventory load at or above 80 percent of configured capacity.';

COMMENT ON TABLE healthcare_agent_actions_v IS
  'Healthcare semantic view of AI agent audit actions with inherited internal agent names mapped to healthcare-facing agent labels.';

BEGIN
  FOR rec IN (
    SELECT 'care_service_requests' AS object_name, 'sc_admin' AS role_name FROM dual UNION ALL
    SELECT 'care_service_requests', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_service_requests', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_service_requests', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_service_requests', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_request_status_lookup', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_request_status_lookup', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_request_status_lookup', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_request_status_lookup', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_request_status_lookup', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_logistics_partner_lookup', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_logistics_partner_lookup', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_logistics_partner_lookup', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_logistics_partner_lookup', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_logistics_partner_lookup', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_logistics_route_status_lookup', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_logistics_route_status_lookup', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_logistics_route_status_lookup', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_logistics_route_status_lookup', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_logistics_route_status_lookup', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_logistics_routes_v', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_logistics_routes_v', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_logistics_routes_v', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_logistics_routes_v', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_logistics_routes_v', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_request_signal_label_lookup', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_request_signal_label_lookup', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_request_signal_label_lookup', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_request_signal_label_lookup', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_request_signal_label_lookup', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_request_items', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_request_items', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_request_items', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_request_items', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_request_items', 'sc_viewer' FROM dual UNION ALL
    SELECT 'care_service_requests_dv', 'sc_admin' FROM dual UNION ALL
    SELECT 'care_service_requests_dv', 'sc_analyst' FROM dual UNION ALL
    SELECT 'care_service_requests_dv', 'sc_fulfillment_mgr' FROM dual UNION ALL
    SELECT 'care_service_requests_dv', 'sc_care_coordinator' FROM dual UNION ALL
    SELECT 'care_service_requests_dv', 'sc_viewer' FROM dual
  ) LOOP
    BEGIN
      EXECUTE IMMEDIATE 'GRANT SELECT ON ' || rec.object_name || ' TO ' || rec.role_name;
    EXCEPTION
      WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Skipping healthcare service request grant for ' ||
                             rec.object_name || ' to ' || rec.role_name || ': ' || SQLERRM);
    END;
  END LOOP;
END;
/

BEGIN
  DBMS_OUTPUT.PUT_LINE('Additional healthcare semantic views refreshed.');
END;
/
