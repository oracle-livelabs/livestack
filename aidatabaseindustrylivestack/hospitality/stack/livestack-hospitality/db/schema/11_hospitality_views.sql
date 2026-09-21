/*
 * 11_hospitality_views.sql
 * Hospitality-facing semantic layer for the Harborstone Hospitality LiveStack.
 *
 * The base tables intentionally keep inherited generic names for compatibility.
 * These views give Ask Data, demos, reports, and SQL snippets hotel-native names.
 */

CREATE OR REPLACE VIEW hospitality_properties_v AS
SELECT
  brand_id AS property_id,
  brand_name AS property_name,
  brand_category AS property_type,
  headquarters_city AS market,
  headquarters_lat AS latitude,
  headquarters_lon AS longitude,
  founded_year AS opened_year,
  annual_revenue AS annual_total_revenue,
  social_tier AS service_tier
FROM brands;

CREATE OR REPLACE VIEW hospitality_room_revenue_v AS
SELECT
  product_id AS room_type_id,
  product_name AS room_type_name,
  category AS revenue_center,
  subcategory AS room_type,
  unit_price AS adr_or_unit_rate,
  unit_cost AS cost_per_occupied_unit,
  tags AS hospitality_tags,
  brand_id AS property_id
FROM products;

CREATE OR REPLACE VIEW guest_signals_v AS
SELECT
  sp.post_id AS signal_id,
  sp.platform AS signal_channel,
  CASE sp.platform
    WHEN 'instagram' THEN 'Guest review'
    WHEN 'tiktok' THEN 'Service recovery alert'
    WHEN 'twitter' THEN 'OTA channel notice'
    WHEN 'youtube' THEN 'Demand signal feed'
    WHEN 'threads' THEN 'Property operations guest experience'
    ELSE 'Hospitality signal'
  END AS signal_source_type,
  sp.post_text AS signal_text,
  sp.posted_at AS signal_time,
  sp.likes_count AS reviewed_events,
  sp.shares_count AS escalated_issues,
  sp.comments_count AS open_service_requests,
  sp.views_count AS revenue_impact_score,
  sp.sentiment_score AS guest_sentiment,
  sp.virality_score AS issue_severity_score,
  CASE
    WHEN sp.virality_score >= 80 THEN 'Critical'
    WHEN sp.virality_score >= 60 THEN 'Escalating'
    WHEN sp.virality_score >= 40 THEN 'Elevated'
    ELSE 'Normal'
  END AS severity_band,
  sp.momentum_flag AS momentum_flag,
  i.display_name AS source_name,
  i.platform AS source_channel
FROM social_posts sp
LEFT JOIN influencers i ON i.influencer_id = sp.influencer_id;

CREATE OR REPLACE VIEW guest_reservations_v AS
SELECT
  o.order_id AS reservation_id,
  o.guest_id AS guest_id,
  o.order_status AS reservation_status,
  o.order_total AS folio_value,
  o.shipping_cost AS service_fee,
  o.fulfillment_center_id AS hotel_id,
  o.social_source_id AS guest_signal_id,
  o.demand_score AS booking_pace_score,
  o.created_at AS booked_at,
  o.updated_at AS updated_at
FROM orders o;

CREATE OR REPLACE VIEW hotels_v AS
SELECT
  center_id AS hotel_id,
  center_name AS hotel_name,
  center_type AS hotel_category,
  city,
  state_province,
  latitude,
  longitude,
  capacity_units AS room_or_task_capacity,
  current_load_pct AS current_load_pct,
  operating_hours,
  is_active
FROM fulfillment_centers;

CREATE OR REPLACE VIEW service_capacity_v AS
SELECT
  i.inventory_id AS capacity_id,
  i.product_id AS room_type_id,
  p.product_name AS room_type_name,
  i.center_id AS hotel_id,
  fc.center_name AS hotel_name,
  i.quantity_on_hand AS available_room_nights,
  i.quantity_reserved AS reserved_room_nights,
  i.quantity_incoming AS incoming_capacity,
  i.reorder_point AS readiness_threshold,
  i.reorder_qty AS replenishment_target,
  i.updated_at
FROM inventory i
JOIN products p ON p.product_id = i.product_id
JOIN fulfillment_centers fc ON fc.center_id = i.center_id;

CREATE OR REPLACE VIEW service_routes_v AS
SELECT
  s.shipment_id AS service_route_id,
  s.order_id AS reservation_id,
  s.center_id AS hotel_id,
  s.carrier AS service_team,
  s.tracking_number AS service_reference,
  s.ship_status AS route_status,
  s.distance_km,
  s.estimated_hours,
  s.ship_cost AS service_cost,
  s.routed_at,
  s.completed_at
FROM shipments s;

SELECT '11_hospitality_views.sql complete - hospitality semantic views created.' AS status FROM dual;
