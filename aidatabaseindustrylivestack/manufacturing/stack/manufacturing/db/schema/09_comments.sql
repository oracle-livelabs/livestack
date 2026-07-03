/*
 * 09_comments.sql
 * Table and column comments for all application tables
 * Oracle AI Database 26ai Free
 *
 * These comments serve two purposes:
 *   1. Schema documentation for developers and DBAs
 *   2. SELECT AI metadata - MANUFACTURING_COHERE_PROFILE has "comments": true,
 *      so Oracle SELECT AI reads these to map natural language to SQL.
 *
 * Run as: schema owner
 * Idempotent - COMMENT ON always replaces any existing comment.
 *
 * NOTE: 38 column comments already exist and are intentionally preserved
 *       (not re-issued here). Only missing comments are added.
 */

-- ============================================================
-- TABLE COMMENTS (12 tables missing + update existing as needed)
-- ============================================================

-- Tables that already have table comments are re-issued here
-- only when the comment was improved (e.g. PRODUCTS).
--   AGENT_ACTIONS, BRANDS, CUSTOMERS, MANUFACTURING_DEMAND_FORECASTS,
--   FULFILLMENT_CENTERS, INFLUENCERS, INVENTORY, MANUFACTURING_WORK_ORDERS,
--   MANUFACTURING_SIGNAL_PART_MENTIONS, PRODUCTS, SHIPMENTS, MANUFACTURING_PRODUCTION_SIGNALS

COMMENT ON TABLE app_users IS
  'Application users for the manufacturing VPD row-level security demo. Each user has a role and optional region filter.';

COMMENT ON TABLE brand_influencer_links IS
  'Many-to-many relationship between product lines and manufacturing network accounts. Tracks signal counts, signal activity, and attributed order value.';

COMMENT ON TABLE demand_regions IS
  'Geographic production regions used for demand forecasting. Each region has a boundary polygon, population, income, and supplier signal density.';

COMMENT ON TABLE event_stream IS
  'Transactional event log using JSON payloads. Stores agent actions, work order events, and production/demand signal triggers for event-driven processing.';

COMMENT ON TABLE fulfillment_zones IS
  'Production routing zones around plant capacity centers. Each zone has a boundary polygon and maximum routing time.';

COMMENT ON TABLE influencer_connections IS
  'Graph edges between manufacturing network accounts representing community connections. Used by SQL/PGQ graph queries for network analysis.';

COMMENT ON TABLE manufacturing_signal_embeddings IS
  'Vector embeddings of production or demand signal text. 384-dimensional vectors from the ALL_MINILM_L12_V2 ONNX model for semantic similarity search.';

COMMENT ON TABLE product_attributes IS
  'Extended manufactured part attributes stored as JSON. Holds category-specific metadata such as production family, operating parameters, equipment, and material requirements.';

COMMENT ON TABLE product_embeddings IS
  'Vector embeddings of manufactured part descriptions. 384-dim vectors from ALL_MINILM_L12_V2 ONNX model for semantic manufactured-part matching.';

COMMENT ON TABLE manufacturing_signal_part_matches IS
  'Cached results of vector similarity matching between production signals and manufactured parts. Stores similarity scores and match methods.';

COMMENT ON TABLE manufacturing_work_order_lines IS
  'Requested manufactured parts, materials, or supply items within a work order. Line value equals requested units multiplied by planned unit value.';

COMMENT ON TABLE products IS
  'Manufactured parts, capacity slots, and component inventory items. Each manufactured part belongs to a product line and has a category, value proxy, and tags. Work-order value by category is SUM(manufacturing_work_order_lines.line_value) joined through manufacturing_work_order_lines.manufactured_part_id.';


-- ============================================================
-- COLUMN COMMENTS - AGENT_ACTIONS (8 missing)
-- Already commented: DECISION_PAYLOAD, EXECUTION_STATUS
-- ============================================================

COMMENT ON COLUMN agent_actions.action_id IS
  'Unique action identifier (PK)';
COMMENT ON COLUMN agent_actions.agent_name IS
  'Name of the AI agent that took the action (e.g. signal_detector, capacity_optimizer)';
COMMENT ON COLUMN agent_actions.action_type IS
  'Type of action taken: alert, capacity_shift, supplier_escalation, corrective_action, trend_flag';
COMMENT ON COLUMN agent_actions.entity_type IS
  'Target entity type: manufactured_part, product_line, network account, work_order, or signal_post';
COMMENT ON COLUMN agent_actions.entity_id IS
  'FK to the target entity (product_id/service_id, brand_id/program_id, etc. depending on entity_type)';
COMMENT ON COLUMN agent_actions.confidence IS
  'Agent confidence score 0.0 to 1.0 for this action';
COMMENT ON COLUMN agent_actions.executed_at IS
  'Timestamp when the action was executed (NULL if not yet executed)';
COMMENT ON COLUMN agent_actions.created_at IS
  'Timestamp when the action record was created';


-- ============================================================
-- COLUMN COMMENTS - APP_USERS (10 missing - all columns)
-- ============================================================

COMMENT ON COLUMN app_users.user_id IS
  'Unique user identifier (PK)';
COMMENT ON COLUMN app_users.username IS
  'Login username used for VPD context (e.g. admin_jess, analyst_raj, fm_west_maria)';
COMMENT ON COLUMN app_users.password_hash IS
  'Hashed password for authentication';
COMMENT ON COLUMN app_users.full_name IS
  'User display name';
COMMENT ON COLUMN app_users.email IS
  'User email address';
COMMENT ON COLUMN app_users.role IS
  'User role: admin, analyst, fulfillment_mgr/access manager, merchandiser/production planner, or viewer';
COMMENT ON COLUMN app_users.region IS
  'Region filter for VPD row-level security. NULL means full access.';
COMMENT ON COLUMN app_users.is_active IS
  '1=active, 0=disabled';
COMMENT ON COLUMN app_users.last_login IS
  'Timestamp of last successful login';
COMMENT ON COLUMN app_users.created_at IS
  'Account creation timestamp';


-- ============================================================
-- COLUMN COMMENTS - BRANDS (9 missing)
-- Already commented: BRAND_ID, BRAND_NAME, SOCIAL_TIER
-- ============================================================

COMMENT ON COLUMN brands.brand_slug IS
  'URL-friendly unique identifier (e.g. apexautomation, circuitforge, pacificsensors)';
COMMENT ON COLUMN brands.brand_category IS
  'Product line category (e.g. Industrial Automation, Mobility Components, Quality Assurance). This is the program category, not the manufactured part category. Use products.category for service categories.';
COMMENT ON COLUMN brands.headquarters_city IS
  'City where the product line headquarters is located';
COMMENT ON COLUMN brands.headquarters_lat IS
  'Product line headquarters geographic latitude for spatial queries';
COMMENT ON COLUMN brands.headquarters_lon IS
  'Product line headquarters geographic longitude for spatial queries';
COMMENT ON COLUMN brands.founded_year IS
  'Year the product line was founded (4-digit year)';
COMMENT ON COLUMN brands.annual_revenue IS
  'Annual product line order value proxy in US dollars';
COMMENT ON COLUMN brands.created_at IS
  'Record creation timestamp';
COMMENT ON COLUMN brands.updated_at IS
  'Record last update timestamp';


-- ============================================================
-- COLUMN COMMENTS - BRAND_INFLUENCER_LINKS (9 missing - all)
-- ============================================================

COMMENT ON COLUMN brand_influencer_links.link_id IS
  'Unique link identifier (PK)';
COMMENT ON COLUMN brand_influencer_links.brand_id IS
  'FK to brands/product lines. JOIN brands ON brands.brand_id = brand_influencer_links.brand_id';
COMMENT ON COLUMN brand_influencer_links.influencer_id IS
  'FK to influencers/manufacturing network accounts. JOIN influencers ON influencers.influencer_id = brand_influencer_links.influencer_id';
COMMENT ON COLUMN brand_influencer_links.relationship_type IS
  'Relationship type: organic, sponsored, ambassador, affiliate, or competitor_mention baseline value';
COMMENT ON COLUMN brand_influencer_links.post_count IS
  'Total number of signal posts this manufacturing network account has made about this product line';
COMMENT ON COLUMN brand_influencer_links.avg_engagement IS
  'Average signal activity rate across signal posts for this product line/network account pair';
COMMENT ON COLUMN brand_influencer_links.revenue_attributed IS
  'Total order value in US dollars attributed to this network account for this product line';
COMMENT ON COLUMN brand_influencer_links.first_mention IS
  'Timestamp of the first signal post mentioning this product line by this network account';
COMMENT ON COLUMN brand_influencer_links.last_mention IS
  'Timestamp of the most recent signal post mentioning this product line by this network account';


-- ============================================================
-- COLUMN COMMENTS - CUSTOMERS (3 missing)
-- Already commented: CUSTOMER_ID, EMAIL, FIRST_NAME, LAST_NAME,
--   CITY, STATE_PROVINCE, LATITUDE, LONGITUDE, CUSTOMER_TIER,
--   LIFETIME_VALUE, CREATED_AT
-- ============================================================

COMMENT ON COLUMN customers.postal_code IS
  'Synthetic customer postal/zip code';
COMMENT ON COLUMN customers.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN customers.location IS
  'SDO_GEOMETRY point for spatial queries. Derived from latitude/longitude.';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_DEMAND_FORECASTS (9 missing)
-- Already commented: PREDICTED_UNIT_DEMAND, PRODUCTION_SIGNAL_FACTOR
-- ============================================================

COMMENT ON COLUMN manufacturing_demand_forecasts.demand_forecast_id IS
  'Unique forecast identifier (PK)';
COMMENT ON COLUMN manufacturing_demand_forecasts.manufactured_part_id IS
  'FK to products/manufactured parts. JOIN products ON products.product_id = manufacturing_demand_forecasts.manufactured_part_id';
COMMENT ON COLUMN manufacturing_demand_forecasts.planning_region IS
  'Geographic region name for this forecast';
COMMENT ON COLUMN manufacturing_demand_forecasts.forecast_date IS
  'Date this forecast applies to';
COMMENT ON COLUMN manufacturing_demand_forecasts.lower_confidence_units IS
  'Lower bound of the confidence interval for predicted production demand in units';
COMMENT ON COLUMN manufacturing_demand_forecasts.upper_confidence_units IS
  'Upper bound of the confidence interval for predicted production demand in units';
COMMENT ON COLUMN manufacturing_demand_forecasts.model_version IS
  'Version identifier of the ML model used to generate this forecast';
COMMENT ON COLUMN manufacturing_demand_forecasts.forecast_explanation IS
  'Human-readable forecast_explanation of plant capacity factors driving this forecast';
COMMENT ON COLUMN manufacturing_demand_forecasts.created_at IS
  'Timestamp when the forecast was generated';


-- ============================================================
-- COLUMN COMMENTS - DEMAND_REGIONS (9 missing - all)
-- ============================================================

COMMENT ON COLUMN demand_regions.region_id IS
  'Unique region identifier (PK)';
COMMENT ON COLUMN demand_regions.region_name IS
  'Display name of the region (e.g. Northeast, Pacific Northwest)';
COMMENT ON COLUMN demand_regions.region_type IS
  'Region classification: metro, state, zone, or custom';
COMMENT ON COLUMN demand_regions.boundary IS
  'SDO_GEOMETRY polygon defining the region boundary for spatial queries';
COMMENT ON COLUMN demand_regions.population IS
  'Estimated manufacturers and suppliers within the production region';
COMMENT ON COLUMN demand_regions.avg_income IS
  'Average industrial output in US dollars within the production region';
COMMENT ON COLUMN demand_regions.social_density IS
  'Production/demand signal density score 0-100 for this region';
COMMENT ON COLUMN demand_regions.demand_index IS
  'Composite production demand index 0-100 combining population, income, and supplier signal density';
COMMENT ON COLUMN demand_regions.updated_at IS
  'Timestamp when region data was last refreshed';


-- ============================================================
-- COLUMN COMMENTS - EVENT_STREAM (7 missing - all)
-- ============================================================

COMMENT ON COLUMN event_stream.event_id IS
  'Unique event identifier (PK)';
COMMENT ON COLUMN event_stream.event_type IS
  'Event type: work_order_created, signal_detected, capacity_triggered, agent_action, access_alert';
COMMENT ON COLUMN event_stream.event_source IS
  'System or agent that generated the event';
COMMENT ON COLUMN event_stream.event_data IS
  'JSON payload with event-specific details';
COMMENT ON COLUMN event_stream.correlation_id IS
  'Correlation ID to link related events across the system';
COMMENT ON COLUMN event_stream.processed IS
  '1=processed, 0=pending processing';
COMMENT ON COLUMN event_stream.created_at IS
  'Timestamp when the event was created';


-- ============================================================
-- COLUMN COMMENTS - FULFILLMENT_CENTERS (8 missing)
-- Already commented: CENTER_ID, CENTER_NAME, CENTER_TYPE,
--   CITY, STATE_PROVINCE, LATITUDE, LONGITUDE, IS_ACTIVE
-- ============================================================

COMMENT ON COLUMN fulfillment_centers.address_line1 IS
  'Street address of the plant capacity center';
COMMENT ON COLUMN fulfillment_centers.postal_code IS
  'Postal/zip code of the plant capacity center';
COMMENT ON COLUMN fulfillment_centers.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN fulfillment_centers.capacity_units IS
  'Maximum manufactured part capacity or component inventory capacity in units';
COMMENT ON COLUMN fulfillment_centers.current_load_pct IS
  'Current capacity utilization as a percentage (0-100)';
COMMENT ON COLUMN fulfillment_centers.operating_hours IS
  'Operating hours description (e.g. 24/7, Mon-Fri 8-18)';
COMMENT ON COLUMN fulfillment_centers.created_at IS
  'Record creation timestamp';
COMMENT ON COLUMN fulfillment_centers.location IS
  'SDO_GEOMETRY point for spatial queries. Derived from latitude/longitude.';


-- ============================================================
-- COLUMN COMMENTS - FULFILLMENT_ZONES (6 missing - all)
-- ============================================================

COMMENT ON COLUMN fulfillment_zones.zone_id IS
  'Unique zone identifier (PK)';
COMMENT ON COLUMN fulfillment_zones.center_id IS
  'FK to fulfillment_centers. JOIN fulfillment_centers ON fulfillment_centers.center_id = fulfillment_zones.center_id';
COMMENT ON COLUMN fulfillment_zones.zone_type IS
  'Production routing zone type: same_day, next_day, standard, or express baseline value';
COMMENT ON COLUMN fulfillment_zones.max_delivery_hrs IS
  'Maximum production routing time in hours for this zone';
COMMENT ON COLUMN fulfillment_zones.zone_boundary IS
  'SDO_GEOMETRY polygon defining the delivery zone boundary for spatial queries';
COMMENT ON COLUMN fulfillment_zones.created_at IS
  'Record creation timestamp';


-- ============================================================
-- COLUMN COMMENTS - INFLUENCERS (8 missing)
-- Already commented: HANDLE, PLATFORM, FOLLOWER_COUNT,
--   ENGAGEMENT_RATE, INFLUENCE_SCORE
-- ============================================================

COMMENT ON COLUMN influencers.influencer_id IS
  'Unique manufacturing network account identifier (PK)';
COMMENT ON COLUMN influencers.display_name IS
  'Manufacturing network account display name or real name';
COMMENT ON COLUMN influencers.niche IS
  'Industrial network niche: Industrial Automation, Mobility Components, Quality Assurance, Electronics Manufacturing, MRO Supply, Plant Logistics, Supplier Quality, Powertrain Components, Advanced Materials, Packaging Materials, or Flexible Assembly';
COMMENT ON COLUMN influencers.city IS
  'City where the manufacturing network account is based';
COMMENT ON COLUMN influencers.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN influencers.is_verified IS
  '1=platform-verified account, 0=not verified';
COMMENT ON COLUMN influencers.created_at IS
  'Record creation timestamp';
COMMENT ON COLUMN influencers.region IS
  'Geographic region for filtering (e.g. West, Northeast, Southeast)';


-- ============================================================
-- COLUMN COMMENTS - INFLUENCER_CONNECTIONS (8 missing - all)
-- ============================================================

COMMENT ON COLUMN influencer_connections.connection_id IS
  'Unique connection identifier (PK)';
COMMENT ON COLUMN influencer_connections.from_influencer IS
  'FK to influencers/manufacturing network accounts. Source node in the graph edge.';
COMMENT ON COLUMN influencer_connections.to_influencer IS
  'FK to influencers/manufacturing network accounts. Target node in the graph edge.';
COMMENT ON COLUMN influencer_connections.connection_type IS
  'Connection type: follows, collaborates, mentions, reshared, tagged, duet, or inspired_by baseline value';
COMMENT ON COLUMN influencer_connections.strength IS
  'Connection strength score 0.0 to 1.0 based on interaction frequency';
COMMENT ON COLUMN influencer_connections.interaction_count IS
  'Total number of interactions between these two manufacturing network accounts';
COMMENT ON COLUMN influencer_connections.first_seen IS
  'Timestamp when the connection was first detected';
COMMENT ON COLUMN influencer_connections.last_interaction IS
  'Timestamp of the most recent interaction between the two manufacturing network accounts';


-- ============================================================
-- COLUMN COMMENTS - INVENTORY (5 missing)
-- Already commented: PRODUCT_ID, CENTER_ID, QUANTITY_ON_HAND,
--   QUANTITY_RESERVED, REORDER_POINT
-- ============================================================

COMMENT ON COLUMN inventory.inventory_id IS
  'Unique inventory record identifier (PK)';
COMMENT ON COLUMN inventory.quantity_incoming IS
  'Manufactured part capacity or supply units currently incoming';
COMMENT ON COLUMN inventory.reorder_qty IS
  'Standard replenishment or capacity quantity in units when triggered';
COMMENT ON COLUMN inventory.last_restock_date IS
  'Date of the most recent capacity refresh or supply delivery';
COMMENT ON COLUMN inventory.updated_at IS
  'Timestamp when capacity or supply level was last updated';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_WORK_ORDERS (5 missing)
-- Already commented: WORK_ORDER_ID, CUSTOMER_ACCOUNT_ID, WORK_ORDER_STATUS_CODE,
--   WORK_ORDER_VALUE, ROUTING_COST, ASSIGNED_PLANT_ID,
--   PRODUCTION_SIGNAL_ID, DEMAND_URGENCY_SCORE, CREATED_AT
-- ============================================================

COMMENT ON COLUMN manufacturing_work_orders.destination_latitude IS
  'Work order destination latitude for spatial routing';
COMMENT ON COLUMN manufacturing_work_orders.destination_longitude IS
  'Work order destination longitude for spatial routing';
COMMENT ON COLUMN manufacturing_work_orders.target_completion_date IS
  'Estimated production completion or routing date';
COMMENT ON COLUMN manufacturing_work_orders.actual_completion_date IS
  'Actual production completion or routing date (NULL if not yet completed)';
COMMENT ON COLUMN manufacturing_work_orders.updated_at IS
  'Timestamp of last work order status change';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_WORK_ORDER_LINES (2 missing)
-- Already commented: WORK_ORDER_LINE_ID, WORK_ORDER_ID, MANUFACTURED_PART_ID,
--   REQUESTED_UNITS, PLANNED_UNIT_VALUE
-- ============================================================

COMMENT ON COLUMN manufacturing_work_order_lines.line_value IS
  'Line value in US dollars. Equals requested_units * planned_unit_value.';
COMMENT ON COLUMN manufacturing_work_order_lines.assigned_plant_id IS
  'FK to fulfillment_centers/plant capacity centers. The center assigned to this line item. NULL if not yet assigned.';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_SIGNAL_PART_MENTIONS (4 missing)
-- Already commented: CONFIDENCE_SCORE, MENTION_TYPE
-- ============================================================

COMMENT ON COLUMN manufacturing_signal_part_mentions.signal_part_mention_id IS
  'Unique mention identifier (PK)';
COMMENT ON COLUMN manufacturing_signal_part_mentions.production_signal_id IS
  'FK to manufacturing_production_signals. JOIN manufacturing_production_signals ON manufacturing_production_signals.production_signal_id = manufacturing_signal_part_mentions.production_signal_id';
COMMENT ON COLUMN manufacturing_signal_part_mentions.manufactured_part_id IS
  'FK to products/manufactured parts. JOIN products ON products.product_id = manufacturing_signal_part_mentions.manufactured_part_id';
COMMENT ON COLUMN manufacturing_signal_part_mentions.created_at IS
  'Timestamp when the mention was detected';


-- ============================================================
-- COLUMN COMMENTS - PRODUCTS (9 missing)
-- Already commented: PRODUCT_ID, BRAND_ID, PRODUCT_NAME,
--   CATEGORY, UNIT_PRICE, TAGS
-- ============================================================

COMMENT ON COLUMN products.sku IS
  'Baseline SKU - unique manufactured part or supply code for capacity tracking';
COMMENT ON COLUMN products.description IS
  'Detailed manufactured part description text. Used for vector embeddings and full-text search.';
COMMENT ON COLUMN products.subcategory IS
  'Manufactured part subcategory within the main category (e.g. Servo Controls under Industrial Automation, Mobility Components under Specialty Manufacturing)';
COMMENT ON COLUMN products.unit_cost IS
  'Estimated delivery cost per unit in US dollars. Margin proxy = unit_price - unit_cost.';
COMMENT ON COLUMN products.weight_kg IS
  'Manufactured part or supply weight in kilograms for routing cost calculation; virtual capacity items use a near-zero value';
COMMENT ON COLUMN products.is_active IS
  '1=active and available for manufacturing operations, 0=inactive or hidden';
COMMENT ON COLUMN products.launch_date IS
  'Date the manufactured part was first available';
COMMENT ON COLUMN products.created_at IS
  'Record creation timestamp';
COMMENT ON COLUMN products.updated_at IS
  'Record last update timestamp';


-- ============================================================
-- COLUMN COMMENTS - PRODUCT_ATTRIBUTES (4 missing - all)
-- ============================================================

COMMENT ON COLUMN product_attributes.attr_id IS
  'Unique attribute record identifier (PK)';
COMMENT ON COLUMN product_attributes.product_id IS
  'FK to products/manufactured parts. JOIN products ON products.product_id = product_attributes.product_id';
COMMENT ON COLUMN product_attributes.attributes IS
  'JSON document with category-specific manufactured part attributes (duration, modality, equipment, acuity, requirements)';
COMMENT ON COLUMN product_attributes.created_at IS
  'Record creation timestamp';


-- ============================================================
-- COLUMN COMMENTS - PRODUCT_EMBEDDINGS (6 missing - all)
-- ============================================================

COMMENT ON COLUMN product_embeddings.embedding_id IS
  'Unique embedding identifier (PK)';
COMMENT ON COLUMN product_embeddings.product_id IS
  'FK to products/manufactured parts. JOIN products ON products.product_id = product_embeddings.product_id';
COMMENT ON COLUMN product_embeddings.embedding_model IS
  'Name of the ONNX model used to generate the embedding (e.g. all_MiniLM_L12_v2)';
COMMENT ON COLUMN product_embeddings.embedding_text IS
  'Source text that was embedded (manufactured part name + description + tags)';
COMMENT ON COLUMN product_embeddings.embedding IS
  'VECTOR(384) embedding from ALL_MINILM_L12_V2 for cosine similarity search';
COMMENT ON COLUMN product_embeddings.created_at IS
  'Timestamp when the embedding was generated';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_SIGNAL_EMBEDDINGS (6 missing - all)
-- ============================================================

COMMENT ON COLUMN manufacturing_signal_embeddings.embedding_id IS
  'Unique embedding identifier (PK)';
COMMENT ON COLUMN manufacturing_signal_embeddings.production_signal_id IS
  'FK to manufacturing_production_signals. JOIN manufacturing_production_signals ON manufacturing_production_signals.production_signal_id = manufacturing_signal_embeddings.production_signal_id';
COMMENT ON COLUMN manufacturing_signal_embeddings.embedding_model IS
  'Name of the ONNX model used to generate the embedding (e.g. all_MiniLM_L12_v2)';
COMMENT ON COLUMN manufacturing_signal_embeddings.embedding_text IS
  'Source production-signal text that was embedded';
COMMENT ON COLUMN manufacturing_signal_embeddings.embedding IS
  'VECTOR(384) embedding from ALL_MINILM_L12_V2 for cosine similarity search';
COMMENT ON COLUMN manufacturing_signal_embeddings.created_at IS
  'Timestamp when the embedding was generated';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_SIGNAL_PART_MATCHES (8 missing - all)
-- ============================================================

COMMENT ON COLUMN manufacturing_signal_part_matches.signal_part_match_id IS
  'Unique match identifier (PK)';
COMMENT ON COLUMN manufacturing_signal_part_matches.production_signal_id IS
  'FK to manufacturing_production_signals. The production or demand signal that was matched.';
COMMENT ON COLUMN manufacturing_signal_part_matches.manufactured_part_id IS
  'FK to products/manufactured parts. The manufactured part matched to the signal.';
COMMENT ON COLUMN manufacturing_signal_part_matches.similarity_score IS
  'Cosine similarity score 0.0 to 1.0 between signal and manufactured-part embeddings';
COMMENT ON COLUMN manufacturing_signal_part_matches.match_rank IS
  'Rank position of this match within the signal results (1 = best match)';
COMMENT ON COLUMN manufacturing_signal_part_matches.match_method IS
  'Method used: vector, keyword, hybrid, or visual';
COMMENT ON COLUMN manufacturing_signal_part_matches.verified IS
  '1=match manually verified as correct, 0=unverified';
COMMENT ON COLUMN manufacturing_signal_part_matches.created_at IS
  'Timestamp when the match was computed';


-- ============================================================
-- COLUMN COMMENTS - SHIPMENTS (10 missing)
-- Already commented: DISTANCE_MILES, ESTIMATED_HOURS
-- ============================================================

COMMENT ON COLUMN shipments.shipment_id IS
  'Unique shipment identifier (PK)';
COMMENT ON COLUMN shipments.work_order_id IS
  'FK to manufacturing_work_orders/work orders. JOIN manufacturing_work_orders ON manufacturing_work_orders.work_order_id = shipments.work_order_id';
COMMENT ON COLUMN shipments.center_id IS
  'FK to fulfillment_centers/plant capacity centers. The center assigned to this work order.';
COMMENT ON COLUMN shipments.carrier IS
  'Production routing team or logistics partner name';
COMMENT ON COLUMN shipments.tracking_number IS
  'Routing reference number for production dispatch tracking';
COMMENT ON COLUMN shipments.ship_status IS
  'Routing status: label_created, picked_up, in_transit, out_for_delivery, delivered/completed, or exception';
COMMENT ON COLUMN shipments.ship_cost IS
  'Production routing cost proxy in US dollars';
COMMENT ON COLUMN shipments.shipped_at IS
  'Timestamp when the production route started';
COMMENT ON COLUMN shipments.delivered_at IS
  'Timestamp when the production route was completed (NULL if not yet completed)';
COMMENT ON COLUMN shipments.created_at IS
  'Timestamp when the production routing record was created';


-- ============================================================
-- COLUMN COMMENTS - MANUFACTURING_PRODUCTION_SIGNALS (8 missing)
-- Already commented: PRODUCTION_SIGNAL_ID, SIGNAL_TEXT, ACKNOWLEDGEMENT_COUNT,
--   PROPAGATION_COUNT, OBSERVATION_COUNT, SENTIMENT_SCORE, URGENCY_SCORE,
--   MOMENTUM_CODE
-- ============================================================

COMMENT ON COLUMN manufacturing_production_signals.network_account_id IS
  'FK to influencers/manufacturing network accounts. NULL if not from a tracked network account.';
COMMENT ON COLUMN manufacturing_production_signals.signal_channel_code IS
  'Manufacturing source channel: supplier_portal, plant_floor, market_feed, quality_bulletin, or partner_operations';
COMMENT ON COLUMN manufacturing_production_signals.external_signal_id IS
  'Original signal ID from the source system for deduplication';
COMMENT ON COLUMN manufacturing_production_signals.observed_at IS
  'Timestamp when the source signal was observed';
COMMENT ON COLUMN manufacturing_production_signals.response_count IS
  'Number of operational responses to the signal';
COMMENT ON COLUMN manufacturing_production_signals.detected_part_ids IS
  'Comma-separated list of manufactured-part identifiers detected in this signal';
COMMENT ON COLUMN manufacturing_production_signals.processed_at IS
  'Timestamp when signal enrichment was completed';
COMMENT ON COLUMN manufacturing_production_signals.created_at IS
  'Timestamp when the signal was ingested into the system';


-- ============================================================
-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 'Table comments' AS check_type,
       COUNT(*) AS total
FROM user_tab_comments
WHERE comments IS NOT NULL
  AND table_name NOT LIKE 'DR$%'
  AND table_name NOT LIKE 'DM$%'
  AND table_name NOT LIKE 'MDRT%'
  AND table_name NOT LIKE 'VECTOR$%'
  AND table_name NOT LIKE 'BIN$%'
  AND table_name NOT LIKE 'ANNOTATIONS%'
  AND table_name NOT LIKE 'METADATA%'
  AND table_name NOT LIKE 'SYS_%'
  AND table_name NOT LIKE 'DBTOOLS$%'
  AND table_name NOT LIKE 'OML_%'
  AND table_name NOT LIKE '%_SETTINGS'
UNION ALL
SELECT 'Column comments' AS check_type,
       COUNT(*) AS total
FROM user_col_comments
WHERE comments IS NOT NULL;

SELECT '09_comments.sql base comments complete - applying manufacturing semantic overrides.' AS status FROM dual;

-- Manufacturing semantic overrides for Ask Data and industry-aligned demos.
COMMENT ON TABLE manufacturing_production_signals IS
  'Production, supplier, market, and operations signals. Use this table for manufacturing demand, urgency, momentum, sentiment, and signal-channel analysis.';

COMMENT ON TABLE influencers IS
  'Manufacturing supplier, operations, engineer, plant, and market network accounts. Use this table for supplier network and signal-source analysis.';

COMMENT ON TABLE fulfillment_centers IS
  'Plant sites, distribution hubs, service centers, and capacity centers used for Oracle Spatial routing and capacity analysis.';

COMMENT ON TABLE manufacturing_work_orders IS
  'Manufacturing work orders with status, order value, demand urgency, optional production-signal attribution, and assigned plant capacity center.';

COMMENT ON COLUMN manufacturing_work_orders.production_signal_id IS
  'Production or supplier signal that influenced this work order. NULL means no signal attribution.';

COMMENT ON COLUMN manufacturing_demand_forecasts.production_signal_factor IS
  'Production or supplier signal multiplier. 1.0 means no signal effect; values above 1.0 indicate signal-driven demand pressure.';

SELECT '09_comments.sql complete - manufacturing semantic comments added.' AS status FROM dual;
