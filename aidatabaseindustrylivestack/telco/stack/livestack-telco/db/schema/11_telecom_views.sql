/*
 * 11_telecom_views.sql
 * Seer Comms-facing semantic layer for Ask Data, Select AI, and demos.
 *
 * These views preserve the inherited physical table names used by the portable
 * baseline while exposing telecom names for services, subscriber signals,
 * network sites, field dispatch, demand, and AI Agent actions.
 * Run as: LIVESTACK
 */

CREATE OR REPLACE VIEW seer_comms_services_v AS
SELECT
  p.product_id AS service_id,
  p.product_name AS service_name,
  p.category AS service_category,
  p.subcategory AS service_segment,
  b.brand_id AS service_line_id,
  b.brand_name AS service_line_name,
  p.unit_price AS service_value_proxy,
  p.tags AS service_tags,
  p.is_active
FROM products p
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW seer_comms_service_lines_v AS
SELECT
  brand_id AS service_line_id,
  brand_name AS service_line_name,
  brand_slug AS service_line_slug,
  brand_category AS network_program,
  headquarters_city,
  annual_revenue AS annual_service_value,
  social_tier AS program_tier
FROM brands;

CREATE OR REPLACE VIEW seer_comms_network_capacity_v AS
SELECT
  i.inventory_id AS capacity_id,
  i.product_id AS service_id,
  p.product_name AS service_name,
  fc.center_id AS network_site_id,
  fc.center_name AS network_site_name,
  fc.center_type AS network_site_type,
  fc.city,
  fc.state_province,
  i.quantity_on_hand AS capacity_available,
  i.quantity_reserved AS capacity_reserved,
  i.quantity_incoming AS capacity_incoming,
  i.reorder_point AS escalation_threshold,
  i.reorder_qty AS target_capacity_increment,
  i.updated_at
FROM inventory i
JOIN products p ON p.product_id = i.product_id
JOIN fulfillment_centers fc ON fc.center_id = i.center_id;

CREATE OR REPLACE VIEW seer_comms_network_sites_v AS
SELECT
  center_id AS network_site_id,
  center_name AS network_site_name,
  CASE center_type
    WHEN 'distribution' THEN 'NOC / regional operations hub'
    WHEN 'warehouse' THEN 'Fiber or device field hub'
    WHEN 'micro' THEN 'Retail or device-support hub'
    WHEN 'store' THEN 'Retail/device-support site'
    WHEN 'drop_ship' THEN 'Partner field-service point'
    ELSE center_type
  END AS network_site_type,
  city,
  state_province,
  latitude,
  longitude,
  capacity_units AS service_capacity_units,
  current_load_pct AS current_capacity_load_pct,
  operating_hours,
  is_active
FROM fulfillment_centers;

CREATE OR REPLACE VIEW seer_comms_coverage_zones_v AS
SELECT
  fz.zone_id AS coverage_zone_id,
  fz.center_id AS network_site_id,
  fc.center_name AS network_site_name,
  fz.zone_type AS service_zone_type,
  fz.max_delivery_hrs AS max_field_response_hours,
  fz.zone_boundary,
  fz.created_at
FROM fulfillment_zones fz
JOIN fulfillment_centers fc ON fc.center_id = fz.center_id;

CREATE OR REPLACE VIEW seer_comms_subscriber_signals_v AS
SELECT
  sp.post_id AS signal_id,
  sp.post_text AS signal_text,
  sp.platform AS signal_channel,
  sp.virality_score AS urgency_score,
  sp.momentum_flag AS momentum_band,
  sp.sentiment_score,
  sp.likes_count AS acknowledgements,
  sp.shares_count AS escalations,
  sp.comments_count AS followups,
  sp.views_count AS exposure_count,
  sp.posted_at AS signal_time,
  i.influencer_id AS advocate_id,
  i.handle AS advocate_handle,
  i.display_name AS advocate_name,
  i.region
FROM social_posts sp
LEFT JOIN influencers i ON i.influencer_id = sp.influencer_id;

CREATE OR REPLACE VIEW seer_comms_signal_matches_v AS
SELECT
  sm.match_id,
  sp.post_id AS signal_id,
  sp.post_text AS signal_text,
  p.product_id AS service_id,
  p.product_name AS service_name,
  b.brand_name AS service_line_name,
  sm.similarity_score,
  sm.match_rank,
  sm.match_method,
  sm.verified,
  sm.created_at
FROM semantic_matches sm
JOIN social_posts sp ON sp.post_id = sm.post_id
JOIN products p ON p.product_id = sm.product_id
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW seer_comms_service_orders_v AS
SELECT
  o.order_id AS service_order_id,
  o.customer_id AS subscriber_id,
  c.first_name || ' ' || c.last_name AS subscriber_name,
  c.city,
  c.state_province,
  o.order_status AS physical_status,
  CASE o.order_status
    WHEN 'pending' THEN 'Pending'
    WHEN 'confirmed' THEN 'Scheduled'
    WHEN 'processing' THEN 'Assigned'
    WHEN 'shipped' THEN 'Routed'
    WHEN 'delivered' THEN 'Completed'
    WHEN 'cancelled' THEN 'Cancelled'
    WHEN 'returned' THEN 'Reopened'
    ELSE INITCAP(REPLACE(o.order_status, '_', ' '))
  END AS service_status,
  o.order_total AS service_value,
  o.shipping_cost AS dispatch_cost,
  o.fulfillment_center_id AS network_site_id,
  o.demand_score,
  o.social_source_id AS source_signal_id,
  o.created_at,
  o.updated_at
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id;

CREATE OR REPLACE VIEW seer_comms_field_dispatch_v AS
SELECT
  s.shipment_id AS dispatch_id,
  s.order_id AS service_order_id,
  fc.center_id AS network_site_id,
  fc.center_name AS network_site_name,
  fc.city AS network_site_city,
  fc.state_province AS network_site_state,
  s.carrier AS dispatch_partner,
  s.ship_status AS physical_dispatch_status,
  CASE s.ship_status
    WHEN 'preparing' THEN 'Scheduled'
    WHEN 'picked' THEN 'Assigned'
    WHEN 'packed' THEN 'Staged'
    WHEN 'shipped' THEN 'Routed'
    WHEN 'in_transit' THEN 'In Progress'
    WHEN 'out_for_delivery' THEN 'On Site'
    WHEN 'delivered' THEN 'Completed'
    WHEN 'exception' THEN 'Exception'
    ELSE INITCAP(REPLACE(s.ship_status, '_', ' '))
  END AS dispatch_status,
  s.distance_km,
  s.estimated_hours,
  s.ship_cost AS dispatch_cost,
  s.shipped_at AS dispatched_at,
  s.delivered_at AS completed_at,
  s.created_at
FROM shipments s
JOIN fulfillment_centers fc ON fc.center_id = s.center_id;

CREATE OR REPLACE VIEW seer_comms_demand_forecasts_v AS
SELECT
  df.forecast_id,
  df.product_id AS service_id,
  p.product_name AS service_name,
  b.brand_name AS service_line_name,
  df.region,
  df.forecast_date,
  df.predicted_demand AS predicted_service_demand,
  df.confidence_low,
  df.confidence_high,
  df.social_factor AS signal_factor,
  df.model_version,
  df.explanation,
  df.created_at
FROM demand_forecasts df
JOIN products p ON p.product_id = df.product_id
JOIN brands b ON b.brand_id = p.brand_id;

CREATE OR REPLACE VIEW seer_comms_agent_actions_v AS
SELECT
  action_id,
  agent_name,
  action_type,
  CASE entity_type
    WHEN 'product' THEN 'service'
    WHEN 'inventory' THEN 'network_capacity'
    WHEN 'shipment' THEN 'field_dispatch'
    WHEN 'order' THEN 'service_order'
    ELSE entity_type
  END AS telecom_entity_type,
  entity_id,
  decision_payload,
  confidence,
  execution_status,
  executed_at,
  created_at
FROM agent_actions;

CREATE OR REPLACE VIEW seer_comms_customer_experience_v AS
SELECT
  c.customer_id AS subscriber_id,
  c.first_name || ' ' || c.last_name AS subscriber_name,
  c.city,
  c.state_province,
  c.customer_tier AS subscriber_tier,
  c.lifetime_value AS service_value,
  COUNT(o.order_id) AS service_order_count,
  NVL(ROUND(AVG(o.demand_score), 2), 0) AS avg_demand_score,
  NVL(SUM(o.order_total), 0) AS service_value_total,
  MAX(o.updated_at) AS last_service_activity
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.first_name, c.last_name, c.city, c.state_province, c.customer_tier, c.lifetime_value;

CREATE OR REPLACE VIEW signal_embeddings AS
SELECT * FROM post_embeddings;

CREATE OR REPLACE VIEW service_embeddings AS
SELECT * FROM product_embeddings;

COMMIT;

SELECT '11_telecom_views.sql complete - Seer Comms semantic views created.' AS status FROM dual;
