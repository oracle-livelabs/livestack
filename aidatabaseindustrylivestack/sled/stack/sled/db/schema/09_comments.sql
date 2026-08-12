/*
 * 09_comments.sql
 * Table and column comments for all application tables
 * Oracle AI Database 26ai Free
 *
 * These comments serve two purposes:
 *   1. Schema documentation for developers and DBAs
 *   2. SELECT AI metadata - the SC_COHERE_PROFILE has "comments": true,
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
--   AGENT_ACTIONS, BRANDS, CUSTOMERS, DEMAND_FORECASTS,
--   FULFILLMENT_CENTERS, INFLUENCERS, INVENTORY, ORDERS,
--   POST_PRODUCT_MENTIONS, PRODUCTS, SHIPMENTS, SOCIAL_POSTS

COMMENT ON TABLE app_users IS
  'Application users for the State and Local Government VPD row-level security demo. Each user has a role and optional region filter.';

COMMENT ON TABLE brand_influencer_links IS
  'Many-to-many relationship between public programs and community partners. Tracks signal post counts, engagement, and attributed service value.';

COMMENT ON TABLE demand_regions IS
  'Colorado county and regional public service areas used for demand forecasting. Each region has an in-state boundary polygon, population, income, and community signal density.';

COMMENT ON TABLE event_stream IS
  'Transactional event log using JSON payloads. Stores agent actions, service request events, and resident/community signal triggers for event-driven processing.';

COMMENT ON TABLE fulfillment_zones IS
  'Public Service routing zones around service access centers. Each zone has a boundary polygon and maximum routing time.';

COMMENT ON TABLE influencer_connections IS
  'Graph edges between community partners representing community connections. Used by SQL/PGQ graph queries for network analysis.';

COMMENT ON TABLE post_embeddings IS
  'Vector embeddings of resident/community signal text. 384-dim vectors from ALL_MINILM_L12_V2 ONNX model for semantic similarity search.';

COMMENT ON TABLE product_attributes IS
  'Extended public service attributes stored as JSON. Holds category-specific metadata such as modality, acuity, duration, equipment, and service requirements.';

COMMENT ON TABLE product_embeddings IS
  'Vector embeddings of public service descriptions. 384-dim vectors from ALL_MINILM_L12_V2 ONNX model for semantic service matching.';

COMMENT ON TABLE semantic_matches IS
  'Cached results of vector similarity matching between resident/community signal posts and public services. Stores similarity scores and match methods.';

COMMENT ON TABLE order_items IS
  'Requested services or supplies within a service request. Each links to a public service with quantity and value proxy. Service value = quantity * unit_price.';

COMMENT ON TABLE products IS
  'Civic services, capacity slots, and public works material items. Each service belongs to a public program and has a category, value proxy, and tags. This is the ONLY table with public service categories. Use products.category for category queries. Service value per category = SUM(order_items.line_total) grouped by products.category via JOIN order_items ON order_items.product_id = products.product_id.';


-- ============================================================
-- COLUMN COMMENTS - AGENT_ACTIONS (8 missing)
-- Already commented: DECISION_PAYLOAD, EXECUTION_STATUS
-- ============================================================

COMMENT ON COLUMN agent_actions.action_id IS
  'Unique action identifier (PK)';
COMMENT ON COLUMN agent_actions.agent_name IS
  'Name of the AI agent that took the action (e.g. signal_detector, capacity_optimizer)';
COMMENT ON COLUMN agent_actions.action_type IS
  'Type of action taken: alert, capacity_shift, outreach, referral, trend_flag';
COMMENT ON COLUMN agent_actions.entity_type IS
  'Target entity type: public service_service, public service_program, advocate, public service_request, or signal_post';
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
  'User role: admin, analyst, fulfillment_mgr/access manager, merchandiser/public service planner, or viewer';
COMMENT ON COLUMN app_users.access_scope IS
  'Oracle-derived VPD scope: GLOBAL, REGIONAL, or RESTRICTED. Clients cannot supply this value.';
COMMENT ON COLUMN app_users.region IS
  'Assigned in-state service region for REGIONAL users. GLOBAL and RESTRICTED users must have NULL.';
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
  'URL-friendly unique identifier (e.g. civicbridge, vitalpath, pulsepoint)';
COMMENT ON COLUMN brands.brand_category IS
  'Public Service program category (e.g. Constituent Services, Infrastructure, Housing and Human Services). This is the program category, not the public service category. Use products.category for service categories.';
COMMENT ON COLUMN brands.headquarters_city IS
  'City where the public program headquarters is located';
COMMENT ON COLUMN brands.headquarters_lat IS
  'Public Service program headquarters geographic latitude for spatial queries';
COMMENT ON COLUMN brands.headquarters_lon IS
  'Public Service program headquarters geographic longitude for spatial queries';
COMMENT ON COLUMN brands.founded_year IS
  'Year the public program was founded (4-digit year)';
COMMENT ON COLUMN brands.annual_revenue IS
  'Annual public program service value proxy in US dollars';
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
  'FK to brands/public programs. JOIN brands ON brands.brand_id = brand_influencer_links.brand_id';
COMMENT ON COLUMN brand_influencer_links.influencer_id IS
  'FK to influencers/community partners. JOIN influencers ON influencers.influencer_id = brand_influencer_links.influencer_id';
COMMENT ON COLUMN brand_influencer_links.relationship_type IS
  'Relationship type: organic, partner, referral, advocate, or ambassador baseline value';
COMMENT ON COLUMN brand_influencer_links.post_count IS
  'Total number of signal posts this community partner has made about this public program';
COMMENT ON COLUMN brand_influencer_links.avg_engagement IS
  'Average engagement rate across signal posts for this public program/advocate pair';
COMMENT ON COLUMN brand_influencer_links.revenue_attributed IS
  'Total service value in US dollars attributed to this advocate for this public program';
COMMENT ON COLUMN brand_influencer_links.first_mention IS
  'Timestamp of the first signal post mentioning this public program by this advocate';
COMMENT ON COLUMN brand_influencer_links.last_mention IS
  'Timestamp of the most recent signal post mentioning this public program by this advocate';


-- ============================================================
-- COLUMN COMMENTS - CUSTOMERS (3 missing)
-- Already commented: CUSTOMER_ID, EMAIL, FIRST_NAME, LAST_NAME,
--   CITY, STATE_PROVINCE, LATITUDE, LONGITUDE, CUSTOMER_TIER,
--   LIFETIME_VALUE, CREATED_AT
-- ============================================================

COMMENT ON COLUMN customers.postal_code IS
  'Synthetic resident postal/zip code';
COMMENT ON COLUMN customers.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN customers.location IS
  'SDO_GEOMETRY point for spatial queries. Derived from latitude/longitude.';


-- ============================================================
-- COLUMN COMMENTS - DEMAND_FORECASTS (9 missing)
-- Already commented: PREDICTED_DEMAND, SOCIAL_FACTOR
-- ============================================================

COMMENT ON COLUMN demand_forecasts.forecast_id IS
  'Unique forecast identifier (PK)';
COMMENT ON COLUMN demand_forecasts.product_id IS
  'FK to products/public services. JOIN products ON products.product_id = demand_forecasts.product_id';
COMMENT ON COLUMN demand_forecasts.region IS
  'Geographic region name for this forecast';
COMMENT ON COLUMN demand_forecasts.forecast_date IS
  'Date this forecast applies to';
COMMENT ON COLUMN demand_forecasts.confidence_low IS
  'Lower bound of the confidence interval for predicted public service demand in units';
COMMENT ON COLUMN demand_forecasts.confidence_high IS
  'Upper bound of the confidence interval for predicted public service demand in units';
COMMENT ON COLUMN demand_forecasts.model_version IS
  'Version identifier of the ML model used to generate this forecast';
COMMENT ON COLUMN demand_forecasts.explanation IS
  'Human-readable explanation of service access factors driving this forecast';
COMMENT ON COLUMN demand_forecasts.created_at IS
  'Timestamp when the forecast was generated';


-- ============================================================
-- COLUMN COMMENTS - DEMAND_REGIONS (9 missing - all)
-- ============================================================

COMMENT ON COLUMN demand_regions.region_id IS
  'Unique region identifier (PK)';
COMMENT ON COLUMN demand_regions.region_name IS
  'Display name of the Colorado operating area (for example, Denver County Service Region or Northeast Plains Regional Service Area)';
COMMENT ON COLUMN demand_regions.region_type IS
  'Operating-area classification. The single-state demo uses region for county service regions and regional service areas.';
COMMENT ON COLUMN demand_regions.boundary IS
  'SDO_GEOMETRY polygon defining the in-state Colorado region boundary for spatial queries';
COMMENT ON COLUMN demand_regions.population IS
  'Estimated population within the public service region';
COMMENT ON COLUMN demand_regions.avg_income IS
  'Average household income in US dollars within the public service region';
COMMENT ON COLUMN demand_regions.social_density IS
  'Resident/community signal density score 0-100 for this region';
COMMENT ON COLUMN demand_regions.demand_index IS
  'Composite public service demand index 0-100 combining population, income, and community signal density';
COMMENT ON COLUMN demand_regions.updated_at IS
  'Timestamp when region data was last refreshed';


-- ============================================================
-- COLUMN COMMENTS - EVENT_STREAM (7 missing - all)
-- ============================================================

COMMENT ON COLUMN event_stream.event_id IS
  'Unique event identifier (PK)';
COMMENT ON COLUMN event_stream.event_type IS
  'Event type: public service_request_created, signal_detected, capacity_triggered, agent_action, access_alert';
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
  'Street address of the service access center';
COMMENT ON COLUMN fulfillment_centers.postal_code IS
  'Postal/zip code of the service access center';
COMMENT ON COLUMN fulfillment_centers.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN fulfillment_centers.capacity_units IS
  'Maximum public service capacity or public works material capacity in units';
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
  'Public Service routing zone type: same_day, next_day, standard, or express baseline value';
COMMENT ON COLUMN fulfillment_zones.max_delivery_hrs IS
  'Maximum public service routing time in hours for this zone';
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
  'Unique community partner identifier (PK)';
COMMENT ON COLUMN influencers.display_name IS
  'State and Local Government advocate display name or real name';
COMMENT ON COLUMN influencers.niche IS
  'Public Service niche: Constituent Services, Infrastructure, Housing and Human Services, Youth Services, Senior and Veteran Services, Field Services, Housing Assistance, Water Services, Special Programs, Community Services, or Recovery Operations';
COMMENT ON COLUMN influencers.city IS
  'City where the community partner is based';
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
  'FK to influencers/community partners. Source node in the graph edge.';
COMMENT ON COLUMN influencer_connections.to_influencer IS
  'FK to influencers/community partners. Target node in the graph edge.';
COMMENT ON COLUMN influencer_connections.connection_type IS
  'Connection type: follows, collaborates, mentions, reshared, tagged, duet, or inspired_by baseline value';
COMMENT ON COLUMN influencer_connections.strength IS
  'Connection strength score 0.0 to 1.0 based on interaction frequency';
COMMENT ON COLUMN influencer_connections.interaction_count IS
  'Total number of interactions between these two community partners';
COMMENT ON COLUMN influencer_connections.first_seen IS
  'Timestamp when the connection was first detected';
COMMENT ON COLUMN influencer_connections.last_interaction IS
  'Timestamp of the most recent interaction between the two community partners';


-- ============================================================
-- COLUMN COMMENTS - INVENTORY (5 missing)
-- Already commented: PRODUCT_ID, CENTER_ID, QUANTITY_ON_HAND,
--   QUANTITY_RESERVED, REORDER_POINT
-- ============================================================

COMMENT ON COLUMN inventory.inventory_id IS
  'Unique inventory record identifier (PK)';
COMMENT ON COLUMN inventory.quantity_incoming IS
  'Public Service service capacity or supply units currently incoming';
COMMENT ON COLUMN inventory.reorder_qty IS
  'Standard replenishment or capacity quantity in units when triggered';
COMMENT ON COLUMN inventory.last_restock_date IS
  'Date of the most recent capacity refresh or supply delivery';
COMMENT ON COLUMN inventory.updated_at IS
  'Timestamp when capacity or supply level was last updated';


-- ============================================================
-- COLUMN COMMENTS - ORDERS (5 missing)
-- Already commented: ORDER_ID, CUSTOMER_ID, ORDER_STATUS,
--   ORDER_TOTAL, SHIPPING_COST, FULFILLMENT_CENTER_ID,
--   SOCIAL_SOURCE_ID, DEMAND_SCORE, CREATED_AT
-- ============================================================

COMMENT ON COLUMN orders.shipping_lat IS
  'Service request destination latitude for spatial routing';
COMMENT ON COLUMN orders.shipping_lon IS
  'Service request destination longitude for spatial routing';
COMMENT ON COLUMN orders.estimated_delivery IS
  'Estimated public service completion or routing date';
COMMENT ON COLUMN orders.actual_delivery IS
  'Actual public service completion or routing date (NULL if not yet completed)';
COMMENT ON COLUMN orders.updated_at IS
  'Timestamp of last service request status change';


-- ============================================================
-- COLUMN COMMENTS - ORDER_ITEMS (2 missing)
-- Already commented: ITEM_ID, ORDER_ID, PRODUCT_ID, QUANTITY, UNIT_PRICE
-- ============================================================

COMMENT ON COLUMN order_items.line_total IS
  'Line total in US dollars. Equals quantity * unit_price. SUM for service request service value.';
COMMENT ON COLUMN order_items.fulfilled_from IS
  'FK to fulfillment_centers/service access centers. The center assigned to this line item. NULL if not yet assigned.';


-- ============================================================
-- COLUMN COMMENTS - POST_PRODUCT_MENTIONS (4 missing)
-- Already commented: CONFIDENCE_SCORE, MENTION_TYPE
-- ============================================================

COMMENT ON COLUMN post_product_mentions.mention_id IS
  'Unique mention identifier (PK)';
COMMENT ON COLUMN post_product_mentions.post_id IS
  'FK to social_posts. JOIN social_posts ON social_posts.post_id = post_product_mentions.post_id';
COMMENT ON COLUMN post_product_mentions.product_id IS
  'FK to products/public services. JOIN products ON products.product_id = post_product_mentions.product_id';
COMMENT ON COLUMN post_product_mentions.created_at IS
  'Timestamp when the mention was detected';


-- ============================================================
-- COLUMN COMMENTS - PRODUCTS (9 missing)
-- Already commented: PRODUCT_ID, BRAND_ID, PRODUCT_NAME,
--   CATEGORY, UNIT_PRICE, TAGS
-- ============================================================

COMMENT ON COLUMN products.sku IS
  'Baseline SKU - unique public service or supply code for capacity tracking';
COMMENT ON COLUMN products.description IS
  'Detailed public service description text. Used for vector embeddings and full-text search.';
COMMENT ON COLUMN products.subcategory IS
  'Public Service service subcategory within the main category (e.g. Digital Intake under Constituent Services, Infrastructure under Special Programs)';
COMMENT ON COLUMN products.unit_cost IS
  'Estimated delivery cost per unit in US dollars. Margin proxy = unit_price - unit_cost.';
COMMENT ON COLUMN products.weight_kg IS
  'Public Service service or supply weight in kilograms for routing cost calculation; virtual services use a near-zero value';
COMMENT ON COLUMN products.is_active IS
  '1=active and available for public service coordination, 0=inactive or hidden';
COMMENT ON COLUMN products.launch_date IS
  'Date the public service was first available';
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
  'FK to products/public services. JOIN products ON products.product_id = product_attributes.product_id';
COMMENT ON COLUMN product_attributes.attributes IS
  'JSON document with category-specific public service attributes (duration, modality, equipment, acuity, requirements)';
COMMENT ON COLUMN product_attributes.created_at IS
  'Record creation timestamp';


-- ============================================================
-- COLUMN COMMENTS - PRODUCT_EMBEDDINGS (6 missing - all)
-- ============================================================

COMMENT ON COLUMN product_embeddings.embedding_id IS
  'Unique embedding identifier (PK)';
COMMENT ON COLUMN product_embeddings.product_id IS
  'FK to products/public services. JOIN products ON products.product_id = product_embeddings.product_id';
COMMENT ON COLUMN product_embeddings.embedding_model IS
  'Name of the ONNX model used to generate the embedding (e.g. all_MiniLM_L12_v2)';
COMMENT ON COLUMN product_embeddings.embedding_text IS
  'Source text that was embedded (public service name + description + tags)';
COMMENT ON COLUMN product_embeddings.embedding IS
  'VECTOR(384) embedding from ALL_MINILM_L12_V2 for cosine similarity search';
COMMENT ON COLUMN product_embeddings.created_at IS
  'Timestamp when the embedding was generated';


-- ============================================================
-- COLUMN COMMENTS - POST_EMBEDDINGS (6 missing - all)
-- ============================================================

COMMENT ON COLUMN post_embeddings.embedding_id IS
  'Unique embedding identifier (PK)';
COMMENT ON COLUMN post_embeddings.post_id IS
  'FK to social_posts. JOIN social_posts ON social_posts.post_id = post_embeddings.post_id';
COMMENT ON COLUMN post_embeddings.embedding_model IS
  'Name of the ONNX model used to generate the embedding (e.g. all_MiniLM_L12_v2)';
COMMENT ON COLUMN post_embeddings.embedding_text IS
  'Source text that was embedded (post text content)';
COMMENT ON COLUMN post_embeddings.embedding IS
  'VECTOR(384) embedding from ALL_MINILM_L12_V2 for cosine similarity search';
COMMENT ON COLUMN post_embeddings.created_at IS
  'Timestamp when the embedding was generated';


-- ============================================================
-- COLUMN COMMENTS - SEMANTIC_MATCHES (8 missing - all)
-- ============================================================

COMMENT ON COLUMN semantic_matches.match_id IS
  'Unique match identifier (PK)';
COMMENT ON COLUMN semantic_matches.post_id IS
  'FK to social_posts. The resident/community signal post that was matched.';
COMMENT ON COLUMN semantic_matches.product_id IS
  'FK to products/public services. The public service matched to the signal post.';
COMMENT ON COLUMN semantic_matches.similarity_score IS
  'Cosine similarity score 0.0 to 1.0 between signal post and public service embeddings';
COMMENT ON COLUMN semantic_matches.match_rank IS
  'Rank position of this match within the post results (1 = best match)';
COMMENT ON COLUMN semantic_matches.match_method IS
  'Method used: vector, keyword, hybrid, or visual';
COMMENT ON COLUMN semantic_matches.verified IS
  '1=match manually verified as correct, 0=unverified';
COMMENT ON COLUMN semantic_matches.created_at IS
  'Timestamp when the match was computed';


-- ============================================================
-- COLUMN COMMENTS - SHIPMENTS (10 missing)
-- Already commented: DISTANCE_MILES, ESTIMATED_HOURS
-- ============================================================

COMMENT ON COLUMN shipments.shipment_id IS
  'Unique shipment identifier (PK)';
COMMENT ON COLUMN shipments.order_id IS
  'FK to orders/service requests. JOIN orders ON orders.order_id = shipments.order_id';
COMMENT ON COLUMN shipments.center_id IS
  'FK to fulfillment_centers/service access centers. The center assigned to this service request.';
COMMENT ON COLUMN shipments.carrier IS
  'Public Service routing team or logistics partner name';
COMMENT ON COLUMN shipments.tracking_number IS
  'Routing reference number for public service dispatch tracking';
COMMENT ON COLUMN shipments.ship_status IS
  'Routing status: label_created, picked_up, in_transit, out_for_delivery, delivered/completed, or exception';
COMMENT ON COLUMN shipments.ship_cost IS
  'Public Service routing cost proxy in US dollars';
COMMENT ON COLUMN shipments.shipped_at IS
  'Timestamp when the public service route started';
COMMENT ON COLUMN shipments.delivered_at IS
  'Timestamp when the public service route was completed (NULL if not yet completed)';
COMMENT ON COLUMN shipments.created_at IS
  'Timestamp when the public service routing record was created';


-- ============================================================
-- COLUMN COMMENTS - SOCIAL_POSTS (8 missing)
-- Already commented: POST_ID, POST_TEXT, LIKES_COUNT,
--   SHARES_COUNT, VIEWS_COUNT, SENTIMENT_SCORE, VIRALITY_SCORE,
--   MOMENTUM_FLAG
-- ============================================================

COMMENT ON COLUMN social_posts.influencer_id IS
  'FK to influencers/community partners. JOIN influencers ON influencers.influencer_id = social_posts.influencer_id. NULL if not from a tracked advocate.';
COMMENT ON COLUMN social_posts.platform IS
  'Source platform: instagram, tiktok, twitter, youtube, threads, or another community channel';
COMMENT ON COLUMN social_posts.external_post_id IS
  'Original signal post ID from the source platform for deduplication';
COMMENT ON COLUMN social_posts.posted_at IS
  'Timestamp when the signal post was published on the platform';
COMMENT ON COLUMN social_posts.comments_count IS
  'Number of comments or replies on the signal post';
COMMENT ON COLUMN social_posts.detected_products IS
  'Comma-separated list of public service names detected in this signal post by NLP';
COMMENT ON COLUMN social_posts.processed_at IS
  'Timestamp when NLP enrichment was completed for this signal post';
COMMENT ON COLUMN social_posts.created_at IS
  'Timestamp when the signal post was ingested into the system';


-- ============================================================
-- ============================================================
-- SEER STATE AND LOCAL GOVERNMENT SEMANTIC ALIASES
-- Metadata-only comments for Ask Data / Select AI. These do not rename tables.
-- ============================================================

COMMENT ON TABLE brands IS
  'Public programs, service lines, agencies, and partner organizations in the Seer State and Local Government demo.';

COMMENT ON TABLE products IS
  'Public services, capacity slots, benefits workflows, permits, inspections, public works materials, and service categories. Use this table for service names and service value proxy analysis.';

COMMENT ON TABLE customers IS
  'Synthetic Colorado residents, households, businesses, or service recipients with in-state service addresses and access tiers for Seer State and Local Government workflows.';

COMMENT ON TABLE orders IS
  'Colorado public service requests and casework for Seer State and Local Government. Use this table for request status, service value exposure, signal-linked requests, and in-state access-center assignment.';

COMMENT ON TABLE social_posts IS
  'Resident, community, partner, and public-service demand signals. Use virality_score as urgency_score and momentum_flag as urgency band.';

COMMENT ON TABLE influencers IS
  'Colorado community partners, advocates, agencies, trusted sources, and resident signal sources for Seer State and Local Government. Region is Colorado for the single-state operating scenario.';

COMMENT ON TABLE fulfillment_centers IS
  'Colorado service access centers, regional hubs, resident service counters, local access points, and partner service sites used for Oracle Spatial coverage and routing. A service hub is an in-state center or regional operations area responsible for processing resident requests.';

COMMENT ON TABLE inventory IS
  'Available service capacity, appointment capacity, staff capacity, or public works material availability at service access centers.';

COMMENT ON TABLE shipments IS
  'In-state service task routes, dispatch records, inspection routes, and completion records for Colorado public service requests.';

COMMENT ON TABLE agent_actions IS
  'Auditable AI Agent actions for Seer State and Local Government resident signal review, service access routing, capacity intervention, and public-service operations workflows.';

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

SELECT '09_comments.sql complete - all table and column comments added.' AS status FROM dual;
