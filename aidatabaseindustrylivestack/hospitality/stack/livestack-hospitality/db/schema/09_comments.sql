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
--   AGENT_ACTIONS, BRANDS, GUESTS, DEMAND_FORECASTS,
--   FULFILLMENT_CENTERS, INFLUENCERS, INVENTORY, ORDERS,
--   POST_PRODUCT_MENTIONS, PRODUCTS, SHIPMENTS, SOCIAL_POSTS

COMMENT ON TABLE app_users IS
  'Application users for the Hospitality LiveStack VPD row-level security demo. Each user has a role and optional region filter.';

COMMENT ON TABLE brand_influencer_links IS
  'Many-to-many relationship between properties and signal sources. Tracks signal counts, escalation activity, and attributed revenue exposure.';

COMMENT ON TABLE demand_regions IS
  'Geographic regions used for hospitality product service-pressure forecasting. Each region has a boundary polygon, population, income, and signal density.';

COMMENT ON TABLE event_stream IS
  'Reservational event log using JSON payloads. Stores agent actions, reservation events, guest issue escalations, service-routing events, and signal triggers for event-driven processing.';

COMMENT ON TABLE fulfillment_zones IS
  'SLA service zones around Hospitality LiveStack hotels. Each zone has a boundary polygon and maximum service-response time.';

COMMENT ON TABLE influencer_connections IS
  'Graph edges between brand standards, operations, and demand signal sources. Used by SQL/PGQ graph queries for network analysis.';

COMMENT ON TABLE signal_embeddings IS
  'Vector embeddings of brand standards and demand signal text. 384-dim vectors from ALL_MINILM_L12_V2 ONNX model for semantic similarity search.';

COMMENT ON TABLE product_embeddings IS
  'Vector embeddings of hospitality product descriptions. 384-dim vectors from ALL_MINILM_L12_V2 ONNX model for semantic hospitality product matching.';

COMMENT ON TABLE semantic_matches IS
  'Cached results of vector similarity matching between signals and hospitality products. Stores similarity scores and match methods.';


COMMENT ON TABLE order_items IS
  'Service rows within a Hospitality LiveStack guest reservation or case. Each row links to a hospitality product with quantity and value. Revenue exposure = quantity * unit_price.';

COMMENT ON TABLE products IS
  'Hospitality products and services offered or monitored by Hospitality LiveStack, including booking deposits, folio cards, group bookings, folio payments, revenue operations, luxury guest, brand standards, risk, and guest experience services. This is the ONLY table with hospitality product categories. Use products.category for hospitality product category queries. Revenue exposure per category = SUM(order_items.line_total) grouped by products.category via JOIN order_items ON order_items.product_id = products.product_id.';


-- ============================================================
-- COLUMN COMMENTS - AGENT_ACTIONS (8 missing)
-- Already commented: DECISION_PAYLOAD, EXECUTION_STATUS
-- ============================================================

COMMENT ON COLUMN agent_actions.action_id IS
  'Unique action identifier (PK)';
COMMENT ON COLUMN agent_actions.agent_name IS
  'Name of the AI agent that took the action (e.g. market_brand standards_signal_agent, guest_service_routing_agent, reservation_revenue_agent)';
COMMENT ON COLUMN agent_actions.action_type IS
  'Type of action taken: risk_alert, guest risk_escalation, service_routing, guest_review, reservation_exposure_review, brand standards_review';
COMMENT ON COLUMN agent_actions.entity_type IS
  'Target entity type: hospitality product, property, signal_source, reservation, case, guest, or signal';
COMMENT ON COLUMN agent_actions.entity_id IS
  'FK to the target entity (product_id, brand_id, influencer_id, etc. depending on entity_type)';
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
  'Login username used for VPD context (e.g. admin_ava, sales_rep_alice)';
COMMENT ON COLUMN app_users.password_hash IS
  'Hashed password for authentication';
COMMENT ON COLUMN app_users.full_name IS
  'User display name';
COMMENT ON COLUMN app_users.email IS
  'User email address';
COMMENT ON COLUMN app_users.role IS
  'User role: admin, sales_rep, fulfillment_mgr, analyst, or viewer';
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
  'URL-friendly unique property identifier (e.g. harborstone-grand-harbor, horizoncapital, )';
COMMENT ON COLUMN brands.brand_category IS
  'Property category (e.g. Urban Hotel, Revenue Operations, Luxury Guest Management). This is the property category, not the hospitality product category. Use products.category for hospitality product categories.';
COMMENT ON COLUMN brands.headquarters_city IS
  'City where property headquarters is located';
COMMENT ON COLUMN brands.headquarters_lat IS
  'Headquarters geographic latitude for spatial queries';
COMMENT ON COLUMN brands.headquarters_lon IS
  'Headquarters geographic longitude for spatial queries';
COMMENT ON COLUMN brands.founded_year IS
  'Year the property was founded (4-digit year)';
COMMENT ON COLUMN brands.annual_revenue IS
  'Annual property revenue in US dollars';
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
  'FK to brands, used as properties in this hospitality demo. JOIN brands ON brands.brand_id = brand_influencer_links.brand_id';
COMMENT ON COLUMN brand_influencer_links.influencer_id IS
  'FK to influencers, used as signal sources in this hospitality demo. JOIN influencers ON influencers.influencer_id = brand_influencer_links.influencer_id';
COMMENT ON COLUMN brand_influencer_links.relationship_type IS
  'Relationship type retained from the original schema; in this demo values represent property-source signal relationships.';
COMMENT ON COLUMN brand_influencer_links.post_count IS
  'Total number of signals this source has made about this property';
COMMENT ON COLUMN brand_influencer_links.avg_engagement IS
  'Average escalation activity rate across signals for this property-source pair';
COMMENT ON COLUMN brand_influencer_links.revenue_attributed IS
  'Total revenue in US dollars attributed to this source for this property';
COMMENT ON COLUMN brand_influencer_links.first_mention IS
  'Timestamp of the first signal mentioning this property by this source';
COMMENT ON COLUMN brand_influencer_links.last_mention IS
  'Timestamp of the most recent signal mentioning this property by this source';


-- ============================================================
-- COLUMN COMMENTS - GUESTS (3 missing)
-- Already commented: GUEST_ID, EMAIL, FIRST_NAME, LAST_NAME,
--   CITY, STATE_PROVINCE, LATITUDE, LONGITUDE, GUEST_TIER,
--   LIFETIME_VALUE, CREATED_AT
-- ============================================================

COMMENT ON COLUMN guests.postal_code IS
  'Guest postal/zip code';
COMMENT ON COLUMN guests.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN guests.location IS
  'SDO_GEOMETRY point for spatial queries. Derived from latitude/longitude.';


-- ============================================================
-- COLUMN COMMENTS - DEMAND_FORECASTS (9 missing)
-- Already commented: PREDICTED_DEMAND, SOCIAL_FACTOR
-- ============================================================

COMMENT ON COLUMN demand_forecasts.forecast_id IS
  'Unique forecast identifier (PK)';
COMMENT ON COLUMN demand_forecasts.product_id IS
  'FK to products, used as hospitality products in this demo. JOIN products ON products.product_id = demand_forecasts.product_id';
COMMENT ON COLUMN demand_forecasts.region IS
  'Geographic region name for this forecast';
COMMENT ON COLUMN demand_forecasts.forecast_date IS
  'Date this forecast applies to';
COMMENT ON COLUMN demand_forecasts.confidence_low IS
  'Lower bound of the confidence interval for predicted service pressure in units';
COMMENT ON COLUMN demand_forecasts.confidence_high IS
  'Upper bound of the confidence interval for predicted service pressure in units';
COMMENT ON COLUMN demand_forecasts.model_version IS
  'Version identifier of the ML model used to generate this forecast';
COMMENT ON COLUMN demand_forecasts.explanation IS
  'Human-readable explanation of factors driving this forecast';
COMMENT ON COLUMN demand_forecasts.created_at IS
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
  'Estimated population within the region';
COMMENT ON COLUMN demand_regions.avg_income IS
  'Average household income in US dollars within the region';
COMMENT ON COLUMN demand_regions.social_density IS
  'Brand Standards and demand signal density score 0-100 for this region';
COMMENT ON COLUMN demand_regions.demand_index IS
  'Composite service-pressure index 0-100 combining population, income, and signal density';
COMMENT ON COLUMN demand_regions.updated_at IS
  'Timestamp when region data was last refreshed';


-- ============================================================
-- COLUMN COMMENTS - EVENT_STREAM (7 missing - all)
-- ============================================================

COMMENT ON COLUMN event_stream.event_id IS
  'Unique event identifier (PK)';
COMMENT ON COLUMN event_stream.event_type IS
  'Event type: order_placed, trend_detected, replenishment_triggered, agent_action, price_alert';
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
  'Street address of the property hotel';
COMMENT ON COLUMN fulfillment_centers.postal_code IS
  'Postal/zip code of the property hotel';
COMMENT ON COLUMN fulfillment_centers.country IS
  'ISO 3-letter country code (e.g. USA)';
COMMENT ON COLUMN fulfillment_centers.capacity_units IS
  'Guest room count used as room and service capacity for the property hotel';
COMMENT ON COLUMN fulfillment_centers.current_load_pct IS
  'Occupied rooms divided by guest room capacity as a percentage';
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
  'Delivery zone type: same_day, next_day, standard, or express';
COMMENT ON COLUMN fulfillment_zones.max_delivery_hrs IS
  'Maximum delivery time in hours for this zone';
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
  'Unique signal source identifier (PK)';
COMMENT ON COLUMN influencers.display_name IS
  'Signal source display name';
COMMENT ON COLUMN influencers.niche IS
  'Signal niche: Brand QA, Property Safety, Brand Standards, regulated, port operations, hospitality products, or property quality';
COMMENT ON COLUMN influencers.city IS
  'City where the signal source is based';
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
  'FK to influencers, used as signal sources. Source node in the graph edge.';
COMMENT ON COLUMN influencer_connections.to_influencer IS
  'FK to influencers, used as signal sources. Target node in the graph edge.';
COMMENT ON COLUMN influencer_connections.connection_type IS
  'Connection type retained from the original graph vocabulary; represents signal propagation.';
COMMENT ON COLUMN influencer_connections.strength IS
  'Connection strength score 0.0 to 1.0 based on interaction frequency';
COMMENT ON COLUMN influencer_connections.interaction_count IS
  'Total number of interactions between these two signal sources';
COMMENT ON COLUMN influencer_connections.first_seen IS
  'Timestamp when the connection was first detected';
COMMENT ON COLUMN influencer_connections.last_interaction IS
  'Timestamp of the most recent interaction between the two signal sources';


-- ============================================================
-- COLUMN COMMENTS - INVENTORY (5 missing)
-- Already commented: PRODUCT_ID, CENTER_ID, QUANTITY_ON_HAND,
--   QUANTITY_RESERVED, REORDER_POINT
-- ============================================================

COMMENT ON COLUMN inventory.inventory_id IS
  'Unique inventory record identifier (PK)';
COMMENT ON COLUMN inventory.quantity_incoming IS
  'Units currently active transfers or on order from property';
COMMENT ON COLUMN inventory.reorder_qty IS
  'Standard reorder quantity in units when replenishment is triggered';
COMMENT ON COLUMN inventory.last_restock_date IS
  'Date of the most recent replenishment delivery';
COMMENT ON COLUMN inventory.updated_at IS
  'Timestamp when inventory was last updated';


-- ============================================================
-- COLUMN COMMENTS - ORDERS (5 missing)
-- Already commented: ORDER_ID, GUEST_ID, ORDER_STATUS,
--   ORDER_TOTAL, SHIPPING_COST, FULFILLMENT_CENTER_ID,
--   SOCIAL_SOURCE_ID, DEMAND_SCORE, CREATED_AT
-- ============================================================

COMMENT ON COLUMN orders.shipping_lat IS
  'Guest destination latitude for spatial routing';
COMMENT ON COLUMN orders.shipping_lon IS
  'Guest destination longitude for spatial routing';
COMMENT ON COLUMN orders.estimated_delivery IS
  'Estimated delivery date';
COMMENT ON COLUMN orders.actual_delivery IS
  'Actual delivery date (NULL if not yet completed)';
COMMENT ON COLUMN orders.updated_at IS
  'Timestamp of last order status change';


-- ============================================================
-- COLUMN COMMENTS - ORDER_ITEMS (2 missing)
-- Already commented: ITEM_ID, ORDER_ID, PRODUCT_ID, QUANTITY, UNIT_PRICE
-- ============================================================

COMMENT ON COLUMN order_items.line_total IS
  'Line total in US dollars. Equals quantity * unit_price. SUM for reservation revenue.';
COMMENT ON COLUMN order_items.fulfilled_from IS
  'FK to fulfillment_centers. The property hotel that routed this line item. NULL if not yet assigned.';


-- ============================================================
-- COLUMN COMMENTS - POST_PRODUCT_MENTIONS (4 missing)
-- Already commented: CONFIDENCE_SCORE, MENTION_TYPE
-- ============================================================

COMMENT ON COLUMN post_product_mentions.mention_id IS
  'Unique signal link identifier (PK)';
COMMENT ON COLUMN post_product_mentions.post_id IS
  'FK to social_posts, used as signal records. JOIN social_posts ON social_posts.post_id = post_product_mentions.post_id';
COMMENT ON COLUMN post_product_mentions.product_id IS
  'FK to products, used as hospitality products. JOIN products ON products.product_id = post_product_mentions.product_id';
COMMENT ON COLUMN post_product_mentions.created_at IS
  'Timestamp when the signal link was detected';


-- ============================================================
-- COLUMN COMMENTS - PRODUCTS (9 missing)
-- Already commented: PRODUCT_ID, BRAND_ID, PRODUCT_NAME,
--   CATEGORY, UNIT_PRICE, TAGS
-- ============================================================

COMMENT ON COLUMN products.sku IS
  'Catalog code - unique hospitality product code for inventory tracking';
COMMENT ON COLUMN products.description IS
  'Detailed hospitality product description text. Used for vector embeddings and full-text search.';
COMMENT ON COLUMN products.subcategory IS
  'Hospitality product subcategory within the main category (e.g. Suite under Rooms, Banquet under Events, or Checkout Closeout under Folio Payments)';
COMMENT ON COLUMN products.unit_cost IS
  'Wholesale cost per unit in US dollars. Profit margin = unit_price - unit_cost.';
COMMENT ON COLUMN products.weight_kg IS
  'Hospitality Product compatibility metric used by routing cost calculations';
COMMENT ON COLUMN products.is_active IS
  '1=active and available for order, 0=discontinued or hidden';
COMMENT ON COLUMN products.launch_date IS
  'Date the hospitality product was first available for order';
COMMENT ON COLUMN products.created_at IS
  'Record creation timestamp';
COMMENT ON COLUMN products.updated_at IS
  'Record last update timestamp';


-- ============================================================
-- COLUMN COMMENTS - PRODUCT_EMBEDDINGS (6 missing - all)
-- ============================================================

COMMENT ON COLUMN product_embeddings.embedding_id IS
  'Unique embedding identifier (PK)';
COMMENT ON COLUMN product_embeddings.product_id IS
  'FK to products, used as hospitality products. JOIN products ON products.product_id = product_embeddings.product_id';
COMMENT ON COLUMN product_embeddings.embedding_model IS
  'Name of the ONNX model used to generate the embedding (e.g. all_MiniLM_L12_v2)';
COMMENT ON COLUMN product_embeddings.embedding_text IS
  'Source text that was embedded (hospitality product name + description + tags)';
COMMENT ON COLUMN product_embeddings.embedding IS
  'VECTOR(384) embedding from ALL_MINILM_L12_V2 for cosine similarity search';
COMMENT ON COLUMN product_embeddings.created_at IS
  'Timestamp when the embedding was generated';


-- ============================================================
-- COLUMN COMMENTS - POST_EMBEDDINGS (6 missing - all)
-- ============================================================

COMMENT ON COLUMN signal_embeddings.embedding_id IS
  'Unique embedding identifier (PK)';
COMMENT ON COLUMN signal_embeddings.post_id IS
  'FK to social_posts, used as signal records. JOIN social_posts ON social_posts.post_id = signal_embeddings.post_id';
COMMENT ON COLUMN signal_embeddings.embedding_model IS
  'Name of the ONNX model used to generate the embedding (e.g. all_MiniLM_L12_v2)';
COMMENT ON COLUMN signal_embeddings.embedding_text IS
  'Source text that was embedded (signal text content)';
COMMENT ON COLUMN signal_embeddings.embedding IS
  'VECTOR(384) embedding from ALL_MINILM_L12_V2 for cosine similarity search';
COMMENT ON COLUMN signal_embeddings.created_at IS
  'Timestamp when the embedding was generated';


-- ============================================================
-- COLUMN COMMENTS - SEMANTIC_MATCHES (8 missing - all)
-- ============================================================

COMMENT ON COLUMN semantic_matches.match_id IS
  'Unique match identifier (PK)';
COMMENT ON COLUMN semantic_matches.post_id IS
  'FK to social_posts. The brand standards or demand signal that was matched.';
COMMENT ON COLUMN semantic_matches.product_id IS
  'FK to products. The hospitality product matched to the signal.';
COMMENT ON COLUMN semantic_matches.similarity_score IS
  'Cosine similarity score 0.0 to 1.0 between signal and hospitality product embeddings';
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
  'FK to orders. JOIN orders ON orders.order_id = shipments.order_id';
COMMENT ON COLUMN shipments.center_id IS
  'FK to fulfillment_centers. The property hotel that routed this order.';
COMMENT ON COLUMN shipments.carrier IS
  'Secure transfer carrier name (e.g. SecureCourier, PropertyLink, airport-transferTrack, GuestRoute)';
COMMENT ON COLUMN shipments.tracking_number IS
  'Carrier tracking number for shipment tracking';
COMMENT ON COLUMN shipments.ship_status IS
  'Shipment status: label_created, picked_up, in_transit, out_for_delivery, completed, or exception';
COMMENT ON COLUMN shipments.ship_cost IS
  'Processing fee cost in US dollars charged to the guest';
COMMENT ON COLUMN shipments.routed_at IS
  'Timestamp when the shipment was picked up by the carrier';
COMMENT ON COLUMN shipments.completed_at IS
  'Timestamp when the shipment was completed (NULL if not yet completed)';
COMMENT ON COLUMN shipments.created_at IS
  'Timestamp when the shipment record was created';


-- ============================================================
-- COLUMN COMMENTS - SOCIAL_POSTS (8 missing)
-- Already commented: POST_ID, POST_TEXT, LIKES_COUNT,
--   SHARES_COUNT, VIEWS_COUNT, SENTIMENT_SCORE, VIRALITY_SCORE,
--   MOMENTUM_FLAG
-- ============================================================

COMMENT ON COLUMN social_posts.influencer_id IS
  'FK to influencers, used as signal sources. JOIN influencers ON influencers.influencer_id = social_posts.influencer_id. NULL if not from a tracked source.';
COMMENT ON COLUMN social_posts.platform IS
  'Signal feed channel: instagram, tiktok, twitter, youtube, or threads. Values are retained from the original schema.';
COMMENT ON COLUMN social_posts.external_post_id IS
  'Original signal ID from the source feed for deduplication';
COMMENT ON COLUMN social_posts.posted_at IS
  'Timestamp when the signal was published on the feed';
COMMENT ON COLUMN social_posts.comments_count IS
  'Number of comments, replies, or acknowledgements on the signal';
COMMENT ON COLUMN social_posts.detected_products IS
  'Comma-separated list of hospitality product names detected in this signal by NLP';
COMMENT ON COLUMN social_posts.processed_at IS
  'Timestamp when NLP enrichment was completed for this signal';
COMMENT ON COLUMN social_posts.created_at IS
  'Timestamp when the signal was ingested into the system';



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

-- ============================================================
-- HOSPITALITY HOSPITALITY SEMANTIC ALIASES
-- Metadata-only comments for Ask Data / Select AI. These do not rename tables.
-- ============================================================

COMMENT ON TABLE brands IS
  'Hospitality properties, business lines, and service organizations in the Hospitality LiveStack demo.';

COMMENT ON TABLE orders IS
  'Hospitality LiveStack guest reservations and cases. Use this table for reservation value, status, urgency, signal-linked reservations, and hotel assignment.';

COMMENT ON TABLE social_posts IS
  'Brand Standards, market, guest risk, and operations risk signals for Hospitality LiveStack. Use virality_score as risk severity and momentum_flag as severity.';

COMMENT ON TABLE influencers IS
  'Operational risk signal sources for Hospitality LiveStack such as brand auditors, market feeds, guest risk operations, and property operations alerts.';

COMMENT ON TABLE inventory IS
  'Service capacity for Hospitality LiveStack hospitality products at hotels. quantity_on_hand means available processing capacity.';

COMMENT ON TABLE fulfillment_centers IS
  'Hospitality LiveStack property hotels grouped by hotel category for spatial routing, housekeeping coverage, maintenance capacity, and SLA coverage.';

COMMENT ON TABLE shipments IS
  'Service route and SLA events for Hospitality LiveStack reservations and cases. Use ship_status as service route status.';
