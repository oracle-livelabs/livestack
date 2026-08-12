/*
 * 10_highered_views.sql
 * Higher education semantic views over the portable LiveStack schema.
 *
 * The physical table names are intentionally preserved for importer stability
 * and baseline route compatibility. These views give demos, Ask Data prompts,
 * and SQL examples higher education names without requiring a risky refactor.
 */

SET DEFINE OFF

CREATE OR REPLACE VIEW highered_students_v AS
SELECT
  customer_id AS student_id,
  first_name,
  last_name,
  email,
  city,
  state_province,
  postal_code,
  country,
  customer_tier AS support_tier,
  lifetime_value AS service_value_proxy,
  latitude,
  longitude,
  location,
  created_at
FROM customers;

CREATE OR REPLACE VIEW academic_programs_v AS
SELECT
  brand_id AS program_id,
  brand_name AS academic_program,
  brand_slug AS program_slug,
  brand_category AS program_category,
  headquarters_city AS program_city,
  headquarters_lat AS program_latitude,
  headquarters_lon AS program_longitude,
  annual_revenue AS annual_service_value_proxy,
  social_tier AS program_tier,
  created_at,
  updated_at
FROM brands;

CREATE OR REPLACE VIEW student_services_v AS
SELECT
  p.product_id AS service_id,
  p.product_name AS service_name,
  p.sku AS service_code,
  p.category AS service_category,
  p.subcategory AS service_subcategory,
  p.description,
  p.unit_price AS service_value_proxy,
  p.unit_cost AS delivery_cost_proxy,
  p.tags,
  p.is_active,
  b.brand_id AS program_id,
  b.brand_name AS academic_program
FROM products p
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW student_service_requests_v AS
SELECT
  o.order_id AS request_id,
  o.customer_id AS student_id,
  o.order_status AS request_status,
  o.order_total AS service_value_proxy,
  o.shipping_cost AS routing_cost_proxy,
  o.fulfillment_center_id AS campus_service_site_id,
  o.social_source_id AS signal_source_id,
  o.demand_score,
  o.shipping_lat AS student_latitude,
  o.shipping_lon AS student_longitude,
  o.estimated_delivery AS estimated_service_completion,
  o.actual_delivery AS actual_service_completion,
  o.created_at,
  o.updated_at
FROM orders o;

CREATE OR REPLACE VIEW student_request_lines_v AS
SELECT
  oi.item_id AS request_line_id,
  oi.order_id AS request_id,
  oi.product_id AS service_id,
  p.product_name AS service_name,
  p.category AS service_category,
  p.subcategory AS service_subcategory,
  p.brand_id AS program_id,
  b.brand_name AS academic_program,
  oi.quantity AS requested_quantity,
  oi.unit_price AS service_value_proxy,
  oi.line_total AS line_service_value,
  oi.fulfilled_from AS campus_service_site_id
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW campus_service_sites_v AS
SELECT
  center_id AS campus_service_site_id,
  center_name AS campus_service_site_name,
  center_type AS service_site_type,
  address_line1,
  city,
  state_province,
  postal_code,
  country,
  latitude,
  longitude,
  capacity_units,
  current_load_pct,
  operating_hours,
  is_active,
  location,
  created_at
FROM fulfillment_centers;

CREATE OR REPLACE VIEW success_advocates_v AS
SELECT
  influencer_id AS advocate_id,
  handle,
  display_name,
  platform AS signal_channel,
  follower_count AS audience_size,
  engagement_rate,
  influence_score AS advocate_score,
  niche AS advocate_focus,
  city,
  country,
  region,
  is_verified,
  created_at
FROM influencers;

CREATE OR REPLACE VIEW student_signal_posts_v AS
SELECT
  post_id AS signal_id,
  influencer_id AS advocate_id,
  platform AS signal_channel,
  external_post_id,
  post_text AS signal_text,
  posted_at,
  likes_count,
  shares_count,
  comments_count,
  views_count,
  sentiment_score,
  virality_score AS urgency_score,
  momentum_flag,
  detected_products AS detected_services,
  processed_at,
  created_at
FROM social_posts;

CREATE OR REPLACE VIEW student_service_routes_v AS
SELECT
  shipment_id AS service_route_id,
  order_id AS request_id,
  center_id AS campus_service_site_id,
  carrier AS routing_team,
  tracking_number AS routing_reference,
  ship_status AS route_status,
  ship_cost AS route_cost_proxy,
  ROUND(distance_km * 0.621371, 2) AS distance_miles,
  estimated_hours AS estimated_response_hours,
  shipped_at AS route_started_at,
  delivered_at AS route_completed_at,
  created_at
FROM shipments;

CREATE OR REPLACE VIEW student_service_capacity_v AS
SELECT
  i.inventory_id AS capacity_id,
  i.product_id AS service_id,
  i.center_id AS campus_service_site_id,
  i.quantity_on_hand AS capacity_units,
  i.quantity_reserved AS reserved_units,
  i.quantity_incoming AS incoming_units,
  i.reorder_point AS capacity_trigger_point,
  i.reorder_qty AS capacity_refresh_units,
  i.last_restock_date AS last_capacity_refresh_date,
  i.updated_at
FROM inventory i;

COMMENT ON TABLE highered_students_v IS
  'Semantic higher education view over CUSTOMERS. Rows are synthetic students for the student-success demo.';
COMMENT ON TABLE academic_programs_v IS
  'Semantic higher education view over BRANDS. Rows are academic programs or student-service owners.';
COMMENT ON TABLE student_services_v IS
  'Semantic higher education view over PRODUCTS. Rows are student services, capacity slots, and campus supply items.';
COMMENT ON TABLE student_service_requests_v IS
  'Semantic higher education view over ORDERS. Rows are student service requests with service value proxy and signal attribution.';
COMMENT ON TABLE student_request_lines_v IS
  'Preferred higher education semantic view for Ask Data. Rows are student request lines with requested services, academic programs, and line-level service value.';
COMMENT ON TABLE campus_service_sites_v IS
  'Semantic higher education view over FULFILLMENT_CENTERS. Rows are campus service sites used for capacity and spatial routing.';
COMMENT ON TABLE success_advocates_v IS
  'Semantic higher education view over INFLUENCERS. Rows are success advocates and community signal sources.';
COMMENT ON TABLE student_signal_posts_v IS
  'Semantic higher education view over SOCIAL_POSTS. Rows are student and community signal posts.';
COMMENT ON TABLE student_service_routes_v IS
  'Semantic higher education view over SHIPMENTS. Rows are campus service route records.';
COMMENT ON TABLE student_service_capacity_v IS
  'Semantic higher education view over INVENTORY. Rows are service capacity records by campus service site.';

SELECT 'Higher education semantic views created' AS status FROM dual;
