/*
 * 11_manufacturing_semantic_views.sql
 * Manufacturing-facing semantic views for demos, Ask Data, and agent prompts.
 *
 * These views enrich the canonical Manufacturing tables for Ask Data and
 * cross-feature analytics.
*/

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

PROMPT Creating manufacturing semantic views...

CREATE OR REPLACE VIEW manufacturing_suppliers AS
SELECT
  brand_id AS supplier_id,
  brand_slug AS supplier_code,
  brand_name AS supplier_name,
  brand_category AS supplier_category,
  headquarters_city,
  headquarters_lat,
  headquarters_lon,
  founded_year,
  annual_revenue,
  created_at,
  updated_at
FROM brands;

CREATE OR REPLACE VIEW manufacturing_parts_v AS
SELECT
  p.product_id,
  p.product_id AS manufactured_part_id,
  p.sku AS manufactured_part_code,
  p.product_name AS manufactured_part,
  p.description AS part_description,
  p.category AS part_category,
  p.subcategory AS part_subcategory,
  b.brand_id AS product_line_id,
  b.brand_name AS product_line,
  p.unit_price AS work_order_value_proxy,
  p.unit_cost AS production_cost_proxy,
  p.is_active,
  p.launch_date,
  NVL(cap.total_capacity_units, 0) AS total_capacity_units,
  NVL(cap.reserved_capacity_units, 0) AS reserved_capacity_units,
  NVL(sig.signal_count, 0) AS production_signal_count,
  sig.avg_urgency_score,
  sig.latest_signal_at
FROM products p
JOIN brands b ON b.brand_id = p.brand_id
LEFT JOIN (
  SELECT
    product_id,
    SUM(quantity_on_hand) AS total_capacity_units,
    SUM(quantity_reserved) AS reserved_capacity_units
  FROM inventory
  GROUP BY product_id
) cap ON cap.product_id = p.product_id
LEFT JOIN (
  SELECT
    ppm.manufactured_part_id AS product_id,
    COUNT(DISTINCT sp.production_signal_id) AS signal_count,
    ROUND(AVG(sp.urgency_score), 2) AS avg_urgency_score,
    MAX(sp.observed_at) AS latest_signal_at
  FROM manufacturing_signal_part_mentions ppm
  JOIN manufacturing_production_signals sp ON sp.production_signal_id = ppm.production_signal_id
  GROUP BY ppm.manufactured_part_id
) sig ON sig.product_id = p.product_id;

CREATE OR REPLACE VIEW manufacturing_work_orders_v AS
SELECT
  o.work_order_id AS work_order_id,
  o.work_order_code,
  o.work_order_status_code AS work_order_status,
  o.work_order_value AS work_order_value,
  o.routing_cost AS routing_cost,
  o.created_at AS work_order_created_at,
  o.updated_at AS work_order_updated_at,
  o.production_signal_id AS production_signal_source_id,
  o.demand_urgency_score AS demand_urgency_score,
  c.customer_id AS customer_account_id,
  TRIM(c.first_name || ' ' || c.last_name) AS customer_account,
  c.customer_tier,
  c.city AS customer_city,
  c.state_province AS customer_region,
  fc.center_id AS plant_capacity_center_id,
  fc.center_name AS plant_capacity_center,
  COUNT(oi.work_order_line_id) AS line_count,
  SUM(oi.requested_units) AS requested_units
FROM manufacturing_work_orders o
JOIN customers c ON c.customer_id = o.customer_account_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.assigned_plant_id
LEFT JOIN manufacturing_work_order_lines oi ON oi.work_order_id = o.work_order_id
GROUP BY
  o.work_order_id,
  o.work_order_code,
  o.work_order_status_code,
  o.work_order_value,
  o.routing_cost,
  o.created_at,
  o.updated_at,
  o.production_signal_id,
  o.demand_urgency_score,
  c.customer_id,
  TRIM(c.first_name || ' ' || c.last_name),
  c.customer_tier,
  c.city,
  c.state_province,
  fc.center_id,
  fc.center_name;

CREATE OR REPLACE VIEW manufacturing_production_signals_v AS
SELECT
  sp.production_signal_id AS production_signal_id,
  sp.signal_channel_code,
  sp.observed_at,
  sp.signal_text AS production_signal_text,
  sp.sentiment_score,
  sp.urgency_score,
  sp.momentum_code,
  sp.acknowledgement_count,
  sp.propagation_count,
  sp.observation_count,
  i.influencer_id AS supplier_account_id,
  i.handle AS supplier_account_handle,
  i.display_name AS supplier_account_name,
  i.niche AS supplier_account_niche,
  (
    SELECT COUNT(*)
    FROM manufacturing_signal_part_mentions ppm
    WHERE ppm.production_signal_id = sp.production_signal_id
  ) AS matched_manufactured_parts
FROM manufacturing_production_signals sp
LEFT JOIN influencers i ON i.influencer_id = sp.network_account_id;

CREATE OR REPLACE VIEW manufacturing_plant_capacity_v AS
SELECT
  fc.center_id AS plant_capacity_center_id,
  fc.center_name AS plant_capacity_center,
  fc.center_type AS plant_site_type,
  fc.city,
  fc.state_province AS plant_region,
  fc.capacity_units,
  fc.current_load_pct,
  p.product_id AS manufactured_part_id,
  p.product_name AS manufactured_part,
  p.category AS part_category,
  i.quantity_on_hand AS capacity_units_available,
  i.quantity_reserved AS capacity_units_reserved,
  i.quantity_incoming AS capacity_units_incoming,
  i.reorder_point AS capacity_intervention_threshold,
  df.predicted_unit_demand,
  df.forecast_date,
  df.production_signal_factor AS production_signal_factor
FROM fulfillment_centers fc
JOIN inventory i ON i.center_id = fc.center_id
JOIN products p ON p.product_id = i.product_id
LEFT JOIN (
  SELECT manufactured_part_id, planning_region, forecast_date,
         predicted_unit_demand, production_signal_factor
  FROM (
    SELECT
      df.*,
      ROW_NUMBER() OVER (
        PARTITION BY df.manufactured_part_id, df.planning_region
        ORDER BY df.forecast_date DESC
      ) AS rn
    FROM manufacturing_demand_forecasts df
  )
  WHERE rn = 1
) df ON df.manufactured_part_id = p.product_id
   AND (df.planning_region = fc.state_province OR df.planning_region IS NULL);

CREATE OR REPLACE VIEW manufacturing_supplier_relationships_v AS
SELECT
  i.influencer_id AS supplier_account_id,
  i.handle AS supplier_account_handle,
  i.display_name AS supplier_account_name,
  i.platform,
  i.niche,
  i.follower_count,
  i.engagement_rate,
  i.influence_score,
  b.brand_id AS product_line_id,
  b.brand_name AS product_line,
  bil.relationship_type,
  bil.post_count AS rising_signal_count,
  bil.avg_engagement,
  bil.revenue_attributed AS order_value_attributed,
  NVL(edge.edge_count, 0) AS supplier_edge_count,
  edge.avg_relationship_strength
FROM influencers i
LEFT JOIN brand_influencer_links bil ON bil.influencer_id = i.influencer_id
LEFT JOIN brands b ON b.brand_id = bil.brand_id
LEFT JOIN (
  SELECT
    from_influencer AS influencer_id,
    COUNT(*) AS edge_count,
    ROUND(AVG(strength), 3) AS avg_relationship_strength
  FROM influencer_connections
  GROUP BY from_influencer
) edge ON edge.influencer_id = i.influencer_id;

CREATE OR REPLACE VIEW manufacturing_product_lines_v AS
SELECT
  brand_id AS product_line_id,
  brand_name AS product_line_name,
  brand_category AS product_line_category,
  headquarters_city,
  annual_revenue AS annual_order_value_proxy
FROM brands;

CREATE OR REPLACE VIEW manufacturing_plant_sites_v AS
SELECT
  center_id AS plant_site_id,
  center_name AS plant_site_name,
  center_type AS plant_site_type,
  city,
  state_province,
  latitude,
  longitude,
  location AS plant_location,
  capacity_units,
  current_load_pct,
  is_active
FROM fulfillment_centers;

CREATE OR REPLACE VIEW manufacturing_work_order_routes_v AS
SELECT
  shipment_id AS route_id,
  work_order_id AS work_order_id,
  center_id AS plant_site_id,
  carrier AS route_provider,
  tracking_number AS route_reference,
  ship_status AS route_status,
  distance_km,
  estimated_hours,
  ship_cost AS transfer_cost,
  shipped_at AS routed_at,
  delivered_at AS completed_at,
  created_at
FROM shipments;

CREATE OR REPLACE VIEW supplier_signal_edges_v AS
SELECT
  connection_id AS edge_id,
  from_influencer AS from_network_account_id,
  to_influencer AS to_network_account_id,
  connection_type AS relationship_type,
  strength AS relationship_strength,
  interaction_count AS signal_interaction_count,
  first_seen,
  last_interaction
FROM influencer_connections;

CREATE OR REPLACE VIEW manufacturing_command_center_v AS
SELECT
  COUNT(*) AS work_order_count,
  SUM(work_order_value) AS work_order_value_total,
  AVG(demand_urgency_score) AS average_demand_urgency,
  SUM(CASE WHEN production_signal_id IS NOT NULL THEN 1 ELSE 0 END) AS signal_influenced_work_orders
FROM manufacturing_work_orders;

COMMENT ON TABLE manufacturing_parts_v IS
  'Manufacturing semantic view over products, product lines, inventory, and production signals. Use this for manufactured parts, part categories, product lines, and capacity questions.';

COMMENT ON TABLE manufacturing_suppliers IS
  'Manufacturing supplier identity view over the inherited business-unit table. Use this object for canonical supplier provenance.';

COMMENT ON TABLE manufacturing_work_orders_v IS
  'Manufacturing semantic view over canonical work orders, customers, work-order lines, and plant capacity centers. Use this for work orders, customer accounts, work-order value, and production-signal attribution.';

COMMENT ON TABLE manufacturing_production_signals_v IS
  'Manufacturing semantic view over production signals and supplier or operations accounts. Use this for production signals, urgency, momentum, supplier accounts, and channel questions.';

COMMENT ON TABLE manufacturing_plant_capacity_v IS
  'Manufacturing semantic view over fulfillment_centers, inventory, products, and manufacturing_demand_forecasts. Use this for plant capacity, regional demand, stockout risk, and production capacity gaps.';

COMMENT ON TABLE manufacturing_supplier_relationships_v IS
  'Manufacturing semantic view over influencers, supplier graph edges, and product-line relationships. Use this for supplier influence, propagation, product-line relationships, and attributed work order value.';

COMMENT ON TABLE manufacturing_product_lines_v IS
  'Manufacturing semantic view of product lines and production programs backed by the inherited brands table.';

COMMENT ON TABLE manufacturing_plant_sites_v IS
  'Manufacturing semantic view of plant sites, production hubs, capacity centers, geospatial location, current load, and active status.';

COMMENT ON TABLE manufacturing_work_order_routes_v IS
  'Manufacturing semantic view of work-order route and transfer records, including route partner, status, distance, estimated hours, and transfer cost.';

COMMENT ON TABLE supplier_signal_edges_v IS
  'Manufacturing semantic view of supplier, operations, and signal-source relationship edges used by graph workflows.';

COMMENT ON TABLE manufacturing_command_center_v IS
  'Manufacturing aggregate view for work-order count, work-order value, average demand urgency, and signal-influenced work orders.';

SELECT '11_manufacturing_semantic_views.sql complete - manufacturing semantic views available.' AS status FROM dual;
