-- Select AI table and column descriptions for the 13 PG profile objects.
-- Derived from 08_agents.sql and 09_comments.sql; later statements refine earlier descriptions.
-- Run as PG after the application schema is created and before PG_GENAI_PROFILE is used.

COMMENT ON TABLE brands IS 'Retail brands and partners in the PeakGear sporting goods network. Includes brand or partner name, category, headquarters location, revenue, and relationship tier ranking.';

COMMENT ON COLUMN brands.brand_name IS 'The official brand or partner name (e.g. PeakGear Core, SummitTrail Outfitters)';

COMMENT ON COLUMN brands.social_tier IS 'Brand or Partner relationship tier retained in the original column: emerging, standard, premium, or luxury; luxury marks strategic brands and partners in this PeakGear sporting goods demo';

COMMENT ON TABLE products IS 'Products available for customer order. Each sporting goods product belongs to a brand or partner and has a category, price, and tags.';

COMMENT ON COLUMN products.product_name IS 'Full sporting goods product name (e.g. SummitStride Trail Runner, ZeroCopy Hydration Vest)';

COMMENT ON COLUMN products.category IS 'Product category: Retail Sporting Goods, Assortment Planning, Outdoor Performance, Risk Services, E-Commerce, etc.';

COMMENT ON COLUMN products.unit_price IS 'Contract unit price in US dollars';

COMMENT ON COLUMN products.tags IS 'Comma-separated search tags for the sporting goods product';

COMMENT ON TABLE fulfillment_centers IS 'Store and operations sites that fulfill B2B sporting goods orders. Each has lat/lon location, capacity, and type.';

COMMENT ON COLUMN fulfillment_centers.center_type IS 'Type: warehouse, distribution, micro, drop_ship, or store';

COMMENT ON COLUMN fulfillment_centers.latitude IS 'Geographic latitude';

COMMENT ON COLUMN fulfillment_centers.longitude IS 'Geographic longitude';

COMMENT ON TABLE inventory IS 'Capacity levels of each sporting goods product at each store fulfillment site. Tracks on-hand, reserved, and reorder thresholds.';

COMMENT ON COLUMN inventory.quantity_on_hand IS 'Current available inventory units at this center';

COMMENT ON COLUMN inventory.quantity_reserved IS 'Units reserved for pending orders, not yet routed';

COMMENT ON COLUMN inventory.reorder_point IS 'When on_hand drops below this, replenishment is needed';

COMMENT ON TABLE customers IS 'B2B customers with shipping addresses and account tier. Has lat/lon for spatial store service routing.';

COMMENT ON COLUMN customers.customer_tier IS 'Customer tier: new, standard, preferred, or vip';

COMMENT ON COLUMN customers.lifetime_value IS 'Total revenue from this customer in US dollars';

COMMENT ON TABLE orders IS 'B2B sporting goods orders with status tracking. May link to a market or market signal that influenced allocation. Assigned to a store fulfillment site.';

COMMENT ON COLUMN orders.order_status IS 'Status: pending, confirmed, processing, routed, completed, cancelled, or returned';

COMMENT ON COLUMN orders.order_total IS 'Total order value in US dollars';

COMMENT ON COLUMN orders.social_source_id IS 'If signal-influenced, the post_id that drove the order or allocation. NULL means direct demand.';

COMMENT ON COLUMN orders.demand_score IS 'AI-computed demand urgency score 0-100';

COMMENT ON TABLE order_items IS 'Line items within an order. Each links to a sporting goods product with quantity and price.';

COMMENT ON TABLE influencers IS 'Market, operations, and market signal sources. Includes reach counts, engagement rates, and computed source influence scores.';

COMMENT ON COLUMN influencers.handle IS 'Signal source handle like @safety_signal_01 or @store_signal_01';

COMMENT ON COLUMN influencers.platform IS 'Source channel: instagram, tiktok, twitter, youtube, or threads. In this demo these labels represent feed types.';

COMMENT ON COLUMN influencers.influence_score IS 'Computed score 0-100 based on source reach and engagement';

COMMENT ON COLUMN influencers.follower_count IS 'Source reach count retained in the original follower_count column';

COMMENT ON COLUMN influencers.engagement_rate IS 'Engagement rate as decimal (0.0345 = 3.45 percent)';

COMMENT ON TABLE social_posts IS 'Market and operations signals, product safety notices, assortment planning updates, and market signals mentioning sporting goods products or brands and partners. Has reach metrics, sentiment, and criticality score.';

COMMENT ON COLUMN social_posts.post_text IS 'Full text of the returns audit or market signal';

COMMENT ON COLUMN social_posts.virality_score IS 'Criticality score 0-100 combining urgency, reach, and amplification';

COMMENT ON COLUMN social_posts.momentum_flag IS 'Signal intensity: normal, rising, viral, or mega_viral where viral means elevated and mega_viral means critical';

COMMENT ON COLUMN social_posts.sentiment_score IS 'Signal sentiment from -1.0 (negative demand risk) to 1.0 (positive availability)';

COMMENT ON COLUMN social_posts.likes_count IS 'Acknowledgement count from subscribed teams';

COMMENT ON COLUMN social_posts.shares_count IS 'Forward or escalation count';

COMMENT ON COLUMN social_posts.views_count IS 'Total signal reach count';

COMMENT ON TABLE post_product_mentions IS 'Links retail demand and market signals to sporting goods products they mention. Has confidence score and detection method.';

COMMENT ON COLUMN post_product_mentions.mention_type IS 'Detection method: direct, semantic, hashtag, visual, or inferred';

COMMENT ON COLUMN post_product_mentions.confidence_score IS 'Match confidence 0 to 1';

COMMENT ON TABLE demand_forecasts IS 'Predicted demand for sporting goods products factoring in retail demand and market signals. social_factor > 1 means signal activity is amplifying demand or allocation risk.';

COMMENT ON COLUMN demand_forecasts.predicted_demand IS 'Predicted unit demand for this sporting goods product/region/date';

COMMENT ON COLUMN demand_forecasts.social_factor IS 'Signal multiplier. 1.0 = no signal effect, 3.0 = 3x normal demand';

COMMENT ON TABLE shipments IS 'Transfer records for customer and partner orders. Tracks carrier, distance, cost, and completion status.';

COMMENT ON COLUMN shipments.distance_km IS 'Service route distance in kilometers';

COMMENT ON COLUMN shipments.estimated_hours IS 'Estimated service completion time in hours';

COMMENT ON TABLE agent_actions IS 'Audit log of all AI agent decisions. Stores agent name, action type, reasoning, confidence.';

COMMENT ON COLUMN agent_actions.decision_payload IS 'JSON with agent reasoning, factors, and outcome';

COMMENT ON COLUMN agent_actions.execution_status IS 'Status: proposed, approved, executing, completed, failed, or rolled_back';

COMMENT ON TABLE order_items IS
  'Line items within an order. Each links to a sporting goods product with quantity and price. Revenue = quantity * unit_price.';

COMMENT ON TABLE products IS
  'Products available for customer order. Each sporting goods product belongs to a brand or partner and has a category, price, and tags. This is the ONLY table with sporting goods product categories. Use products.category for sporting goods product category queries. Revenue per category = SUM(order_items.line_total) grouped by products.category via JOIN order_items ON order_items.product_id = products.product_id.';

COMMENT ON COLUMN agent_actions.action_id IS
  'Unique action identifier (PK)';

COMMENT ON COLUMN agent_actions.agent_name IS
  'Name of the AI agent that took the action (e.g. trend_detector, inventory_optimizer)';

COMMENT ON COLUMN agent_actions.action_type IS
  'Type of action taken: alert, replenishment, allocation_review, returns_audit_review, trend_flag';

COMMENT ON COLUMN agent_actions.entity_type IS
  'Target entity type: sporting goods product, brand or partner, signal_source, order, or signal';

COMMENT ON COLUMN agent_actions.entity_id IS
  'FK to the target entity (product_id, brand_id, influencer_id, etc. depending on entity_type)';

COMMENT ON COLUMN agent_actions.confidence IS
  'Agent confidence score 0.0 to 1.0 for this action';

COMMENT ON COLUMN agent_actions.executed_at IS
  'Timestamp when the action was executed (NULL if not yet executed)';

COMMENT ON COLUMN agent_actions.created_at IS
  'Timestamp when the action record was created';

COMMENT ON COLUMN brands.brand_slug IS
  'URL-friendly unique brand or partner identifier (e.g. meridiantrust, horizoncapital, voltpay)';

COMMENT ON COLUMN brands.brand_category IS
  'Brand or Partner category (e.g. Retail Sporting Goods, Assortment Planning, Outdoor Performance). This is the brand or partner category, not the sporting goods product category. Use products.category for sporting goods product categories.';

COMMENT ON COLUMN brands.headquarters_city IS
  'City where brand or partner headquarters is located';

COMMENT ON COLUMN brands.headquarters_lat IS
  'Headquarters geographic latitude for spatial queries';

COMMENT ON COLUMN brands.headquarters_lon IS
  'Headquarters geographic longitude for spatial queries';

COMMENT ON COLUMN brands.founded_year IS
  'Year the brand or partner was founded (4-digit year)';

COMMENT ON COLUMN brands.annual_revenue IS
  'Annual brand or partner revenue in US dollars';

COMMENT ON COLUMN brands.created_at IS
  'Record creation timestamp';

COMMENT ON COLUMN brands.updated_at IS
  'Record last update timestamp';

COMMENT ON COLUMN customers.postal_code IS
  'Customer postal/zip code';

COMMENT ON COLUMN customers.country IS
  'ISO 3-letter country code (e.g. USA)';

COMMENT ON COLUMN customers.location IS
  'SDO_GEOMETRY point for spatial queries. Derived from latitude/longitude.';

COMMENT ON COLUMN demand_forecasts.forecast_id IS
  'Unique forecast identifier (PK)';

COMMENT ON COLUMN demand_forecasts.product_id IS
  'FK to products, used as sporting goods products in this demo. JOIN products ON products.product_id = demand_forecasts.product_id';

COMMENT ON COLUMN demand_forecasts.region IS
  'Geographic region name for this forecast';

COMMENT ON COLUMN demand_forecasts.forecast_date IS
  'Date this forecast applies to';

COMMENT ON COLUMN demand_forecasts.confidence_low IS
  'Lower bound of the confidence interval for predicted demand in units';

COMMENT ON COLUMN demand_forecasts.confidence_high IS
  'Upper bound of the confidence interval for predicted demand in units';

COMMENT ON COLUMN demand_forecasts.model_version IS
  'Version identifier of the ML model used to generate this forecast';

COMMENT ON COLUMN demand_forecasts.explanation IS
  'Human-readable explanation of factors driving this forecast';

COMMENT ON COLUMN demand_forecasts.created_at IS
  'Timestamp when the forecast was generated';

COMMENT ON COLUMN fulfillment_centers.address_line1 IS
  'Street address of the store fulfillment site';

COMMENT ON COLUMN fulfillment_centers.postal_code IS
  'Postal/zip code of the store fulfillment site';

COMMENT ON COLUMN fulfillment_centers.country IS
  'ISO 3-letter country code (e.g. USA)';

COMMENT ON COLUMN fulfillment_centers.capacity_units IS
  'Maximum storage capacity in units';

COMMENT ON COLUMN fulfillment_centers.current_load_pct IS
  'Current capacity utilization as a percentage (0-100)';

COMMENT ON COLUMN fulfillment_centers.operating_hours IS
  'Operating hours description (e.g. 24/7, Mon-Fri 8-18)';

COMMENT ON COLUMN fulfillment_centers.created_at IS
  'Record creation timestamp';

COMMENT ON COLUMN fulfillment_centers.location IS
  'SDO_GEOMETRY point for spatial queries. Derived from latitude/longitude.';

COMMENT ON COLUMN influencers.influencer_id IS
  'Unique signal source identifier (PK)';

COMMENT ON COLUMN influencers.display_name IS
  'Signal source display name';

COMMENT ON COLUMN influencers.niche IS
  'Signal niche: creator trends, competitor pricing, POS transactions, returns audit, product content, sporting goods products, or brand quality';

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

COMMENT ON COLUMN inventory.inventory_id IS
  'Unique inventory record identifier (PK)';

COMMENT ON COLUMN inventory.quantity_incoming IS
  'Units currently active transfers or on order from brand or partner';

COMMENT ON COLUMN inventory.reorder_qty IS
  'Standard reorder quantity in units when replenishment is triggered';

COMMENT ON COLUMN inventory.last_restock_date IS
  'Date of the most recent replenishment delivery';

COMMENT ON COLUMN inventory.updated_at IS
  'Timestamp when inventory was last updated';

COMMENT ON COLUMN orders.shipping_lat IS
  'Service Fee destination latitude for spatial routing';

COMMENT ON COLUMN orders.shipping_lon IS
  'Service Fee destination longitude for spatial routing';

COMMENT ON COLUMN orders.estimated_delivery IS
  'Estimated delivery date';

COMMENT ON COLUMN orders.actual_delivery IS
  'Actual delivery date (NULL if not yet completed)';

COMMENT ON COLUMN orders.updated_at IS
  'Timestamp of last order status change';

COMMENT ON COLUMN order_items.line_total IS
  'Line total in US dollars. Equals quantity * unit_price. SUM for transaction revenue.';

COMMENT ON COLUMN order_items.fulfilled_from IS
  'FK to fulfillment_centers. The center that routed this line item. NULL if not yet assigned.';

COMMENT ON COLUMN post_product_mentions.mention_id IS
  'Unique mention identifier (PK)';

COMMENT ON COLUMN post_product_mentions.post_id IS
  'FK to social_posts, used as signal records. JOIN social_posts ON social_posts.post_id = post_product_mentions.post_id';

COMMENT ON COLUMN post_product_mentions.product_id IS
  'FK to products, used as sporting goods products. JOIN products ON products.product_id = post_product_mentions.product_id';

COMMENT ON COLUMN post_product_mentions.created_at IS
  'Timestamp when the mention was detected';

COMMENT ON COLUMN products.sku IS
  'Catalog code - unique sporting goods product code for inventory tracking';

COMMENT ON COLUMN products.description IS
  'Detailed sporting goods product description text. Used for vector embeddings and full-text search.';

COMMENT ON COLUMN products.subcategory IS
  'Product subcategory within the main category (e.g. Digital Supply under Supply Planning)';

COMMENT ON COLUMN products.unit_cost IS
  'Wholesale cost per unit in US dollars. Profit margin = unit_price - unit_cost.';

COMMENT ON COLUMN products.weight_kg IS
  'Product compatibility metric used by routing cost calculations';

COMMENT ON COLUMN products.is_active IS
  '1=active and available for order, 0=discontinued or hidden';

COMMENT ON COLUMN products.launch_date IS
  'Date the sporting goods product was first available for order';

COMMENT ON COLUMN products.created_at IS
  'Record creation timestamp';

COMMENT ON COLUMN products.updated_at IS
  'Record last update timestamp';

COMMENT ON COLUMN shipments.shipment_id IS
  'Unique shipment identifier (PK)';

COMMENT ON COLUMN shipments.order_id IS
  'FK to orders. JOIN orders ON orders.order_id = shipments.order_id';

COMMENT ON COLUMN shipments.center_id IS
  'FK to fulfillment_centers. The center that routed this order.';

COMMENT ON COLUMN shipments.carrier IS
  'Secure transfer carrier name (e.g. SecureCourier, StoreLink, WireTrack, CustomerRoute)';

COMMENT ON COLUMN shipments.tracking_number IS
  'Carrier tracking number for shipment tracking';

COMMENT ON COLUMN shipments.ship_status IS
  'Shipment status: label_created, picked_up, in_transit, out_for_delivery, completed, or exception';

COMMENT ON COLUMN shipments.ship_cost IS
  'Service Fee cost in US dollars charged to the customer';

COMMENT ON COLUMN shipments.routed_at IS
  'Timestamp when the shipment was picked up by the carrier';

COMMENT ON COLUMN shipments.completed_at IS
  'Timestamp when the shipment was completed (NULL if not yet completed)';

COMMENT ON COLUMN shipments.created_at IS
  'Timestamp when the shipment record was created';

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
  'Comma-separated list of sporting goods product names detected in this signal by NLP';

COMMENT ON COLUMN social_posts.processed_at IS
  'Timestamp when NLP enrichment was completed for this signal';

COMMENT ON COLUMN social_posts.created_at IS
  'Timestamp when the signal was ingested into the system';

PROMPT Select AI table and column comments applied.
