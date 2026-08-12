/*
 * 10_sled_views.sql
 * State-and-local-government-facing semantic layer for the Seer State and Local Government LiveStack.
 *
 * These views preserve inherited physical table names used by the application
 * while giving Ask Data, demos, and SQL snippets public-service names.
 * Run as: LIVESTACK
 */

CREATE OR REPLACE VIEW sled_public_programs_v AS
SELECT
  brand_id AS program_id,
  brand_name AS program_name,
  brand_category AS program_category,
  headquarters_city,
  annual_revenue AS program_value_proxy,
  social_tier AS service_priority_tier,
  created_at,
  updated_at
FROM brands;

CREATE OR REPLACE VIEW sled_public_services_v AS
SELECT
  p.product_id AS service_id,
  p.product_name AS service_name,
  p.description AS service_description,
  p.category AS service_category,
  p.subcategory AS service_subcategory,
  p.unit_price AS service_value_proxy,
  p.unit_cost AS service_cost_proxy,
  p.tags,
  p.brand_id AS program_id,
  b.brand_name AS program_name,
  p.is_active,
  p.launch_date,
  p.created_at,
  p.updated_at
FROM products p
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW sled_resident_signals_v AS
SELECT
  sp.post_id AS resident_signal_id,
  sp.service_region_code,
  sp.post_text AS signal_text,
  sp.platform AS source_channel,
  sp.virality_score AS urgency_score,
  CASE sp.momentum_flag
    WHEN 'viral' THEN 'urgent'
    WHEN 'mega_viral' THEN 'critical'
    ELSE sp.momentum_flag
  END AS urgency_band,
  sp.views_count AS reach_count,
  sp.likes_count AS acknowledgement_count,
  sp.shares_count AS escalation_count,
  sp.comments_count AS reply_count,
  sp.sentiment_score,
  sp.detected_products AS detected_services,
  sp.posted_at AS signal_time,
  sp.influencer_id AS source_id,
  i.handle AS source_handle,
  i.display_name AS source_name
FROM social_posts sp
LEFT JOIN influencers i ON i.influencer_id = sp.influencer_id;

CREATE OR REPLACE VIEW sled_signal_sources_v AS
SELECT
  influencer_id AS source_id,
  handle AS source_handle,
  display_name AS source_name,
  platform AS source_channel,
  follower_count AS community_reach,
  engagement_rate,
  influence_score AS source_authority_score,
  niche AS source_focus_area,
  city,
  region,
  service_region_code,
  country,
  is_verified,
  created_at
FROM influencers;

CREATE OR REPLACE VIEW sled_service_requests_v AS
SELECT
  o.order_id AS service_request_id,
  o.service_region_code,
  o.customer_id AS resident_id,
  o.order_status AS physical_request_status,
  CASE o.order_status
    WHEN 'shipped' THEN 'routed'
    WHEN 'delivered' THEN 'completed'
    WHEN 'returned' THEN 'reopened'
    WHEN 'processing' THEN 'in progress'
    ELSE o.order_status
  END AS request_status,
  o.order_total AS service_value_exposure,
  o.shipping_cost AS routing_cost_proxy,
  o.fulfillment_center_id AS service_access_center_id,
  o.shipping_lat AS service_latitude,
  o.shipping_lon AS service_longitude,
  o.estimated_delivery AS estimated_completion,
  o.actual_delivery AS actual_completion,
  o.social_source_id AS resident_signal_id,
  o.demand_score AS urgency_score,
  o.created_at,
  o.updated_at
FROM orders o;

CREATE OR REPLACE VIEW sled_service_request_lines_v AS
SELECT
  oi.item_id AS service_request_line_id,
  oi.service_region_code,
  oi.order_id AS service_request_id,
  oi.product_id AS service_id,
  p.product_name AS service_name,
  oi.quantity AS requested_quantity,
  oi.unit_price AS service_value_proxy,
  oi.line_total AS line_service_value,
  oi.fulfilled_from AS service_access_center_id
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id;

CREATE OR REPLACE VIEW sled_residents_v AS
SELECT
  customer_id AS resident_id,
  service_region_code,
  email AS resident_contact_email,
  first_name || ' ' || last_name AS resident_display_name,
  city,
  state_province,
  postal_code,
  country,
  latitude,
  longitude,
  location,
  customer_tier AS resident_access_tier,
  lifetime_value AS service_value_history,
  created_at
FROM customers;

CREATE OR REPLACE VIEW sled_service_access_centers_v AS
SELECT
  center_id AS service_access_center_id,
  service_region_code,
  center_name AS service_access_center_name,
  center_type AS physical_center_type,
  CASE center_type
    WHEN 'distribution' THEN 'Regional Service Hub'
    WHEN 'warehouse' THEN 'Service Capacity Center'
    WHEN 'micro' THEN 'Local Access Point'
    WHEN 'store' THEN 'Resident Service Counter'
    WHEN 'drop_ship' THEN 'Partner Service Point'
    ELSE center_type
  END AS service_access_center_type,
  address_line1,
  city,
  state_province,
  postal_code,
  country,
  latitude,
  longitude,
  capacity_units AS service_capacity_units,
  current_load_pct AS utilization_pct,
  is_active,
  operating_hours,
  created_at
FROM fulfillment_centers;

CREATE OR REPLACE VIEW sled_service_capacity_v AS
SELECT
  inventory_id AS capacity_id,
  service_region_code,
  product_id AS service_id,
  center_id AS service_access_center_id,
  quantity_on_hand AS available_capacity,
  quantity_reserved AS reserved_capacity,
  quantity_incoming AS incoming_capacity,
  reorder_point AS minimum_capacity_threshold,
  reorder_qty AS target_capacity_increment,
  last_restock_date,
  updated_at
FROM inventory;

CREATE OR REPLACE VIEW sled_service_task_routes_v AS
SELECT
  shipment_id AS service_task_route_id,
  service_region_code,
  order_id AS service_request_id,
  center_id AS service_access_center_id,
  carrier AS service_team,
  tracking_number AS route_reference,
  ship_status AS physical_route_status,
  CASE ship_status
    WHEN 'shipped' THEN 'routed'
    WHEN 'in_transit' THEN 'active route'
    WHEN 'out_for_delivery' THEN 'field response'
    WHEN 'delivered' THEN 'completed'
    ELSE ship_status
  END AS route_status,
  distance_km,
  estimated_hours,
  ship_cost AS route_cost_proxy,
  shipped_at AS routed_at,
  delivered_at AS completed_at,
  created_at
FROM shipments;

CREATE OR REPLACE VIEW sled_operations_dashboard_v AS
SELECT
  o.order_id AS service_request_id,
  o.service_region_code,
  sr.request_status,
  o.order_total AS service_value_exposure,
  o.demand_score AS urgency_score,
  c.customer_tier AS resident_access_tier,
  c.city AS resident_city,
  c.state_province AS resident_state,
  fc.center_name AS service_access_center_name,
  fc.center_type AS physical_center_type,
  p.product_id AS service_id,
  p.product_name AS service_name,
  p.category AS service_category,
  b.brand_id AS program_id,
  b.brand_name AS program_name,
  sp.post_id AS resident_signal_id,
  sp.virality_score AS signal_urgency_score,
  CASE sp.momentum_flag
    WHEN 'viral' THEN 'urgent'
    WHEN 'mega_viral' THEN 'critical'
    ELSE sp.momentum_flag
  END AS signal_urgency_band,
  o.created_at AS request_created_at
FROM orders o
JOIN sled_service_requests_v sr ON sr.service_request_id = o.order_id
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.fulfillment_center_id
LEFT JOIN order_items oi ON oi.order_id = o.order_id
LEFT JOIN products p ON p.product_id = oi.product_id
LEFT JOIN brands b ON b.brand_id = p.brand_id
LEFT JOIN social_posts sp ON sp.post_id = o.social_source_id;

COMMENT ON TABLE sled_public_programs_v IS
  'Semantic view over BRANDS exposing public programs and service lines.';
COMMENT ON TABLE sled_public_services_v IS
  'Semantic view over PRODUCTS exposing public services, capacity slots, workflows, and service value proxies.';
COMMENT ON TABLE sled_resident_signals_v IS
  'Semantic view over SOCIAL_POSTS exposing resident, community, and partner demand signals with urgency labels.';
COMMENT ON TABLE sled_signal_sources_v IS
  'Semantic view over INFLUENCERS exposing community partners, advocates, agencies, and signal sources.';
COMMENT ON TABLE sled_service_requests_v IS
  'Semantic view over ORDERS exposing public service request status, value exposure, and signal attribution.';
COMMENT ON TABLE sled_service_request_lines_v IS
  'Semantic view over ORDER_ITEMS exposing requested public services and line-level service value.';
COMMENT ON TABLE sled_residents_v IS
  'Semantic view over CUSTOMERS exposing synthetic residents and service recipients.';
COMMENT ON TABLE sled_service_access_centers_v IS
  'Semantic view over FULFILLMENT_CENTERS exposing service access centers and public-sector center types.';
COMMENT ON TABLE sled_service_capacity_v IS
  'Semantic view over INVENTORY exposing available service capacity and public works material availability.';
COMMENT ON TABLE sled_service_task_routes_v IS
  'Semantic view over SHIPMENTS exposing service task routes, dispatch records, and completion records.';
COMMENT ON TABLE sled_operations_dashboard_v IS
  'Dashboard-ready semantic view for Seer State and Local Government public-service operations.';

COMMIT;

SELECT '10_sled_views.sql complete - State and Local Government semantic views created.' AS status FROM dual;
