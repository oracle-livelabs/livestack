/*
 * 10_media_semantic_views.sql
 * Media-facing semantic views and comments.
 *
 * These views preserve the inherited physical tables while giving Select AI,
 * Ask Data, and presenters media-native object names.
 */

CREATE OR REPLACE VIEW media_content_assets_v AS
SELECT
  p.product_id,
  p.sku AS content_asset_code,
  p.product_name AS content_asset,
  p.description AS content_description,
  p.category AS content_category,
  p.subcategory AS content_subcategory,
  b.brand_id AS studio_label_id,
  b.brand_name AS studio_or_label,
  p.unit_price AS campaign_value_proxy,
  p.unit_cost AS distribution_cost_proxy,
  p.is_active,
  p.launch_date,
  NVL(cap.total_capacity_units, 0) AS total_capacity_units,
  NVL(cap.reserved_capacity_units, 0) AS reserved_capacity_units,
  NVL(sig.signal_count, 0) AS audience_signal_count,
  sig.avg_virality_score,
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
    ppm.product_id,
    COUNT(DISTINCT sp.post_id) AS signal_count,
    ROUND(AVG(sp.virality_score), 2) AS avg_virality_score,
    MAX(sp.posted_at) AS latest_signal_at
  FROM post_product_mentions ppm
  JOIN social_posts sp ON sp.post_id = ppm.post_id
  GROUP BY ppm.product_id
) sig ON sig.product_id = p.product_id;

CREATE OR REPLACE VIEW media_campaign_orders_v AS
SELECT
  o.order_id AS campaign_order_id,
  o.order_status AS campaign_status,
  o.order_total AS campaign_value,
  o.shipping_cost AS distribution_cost,
  o.created_at AS campaign_created_at,
  o.social_source_id AS audience_signal_source_id,
  c.customer_id AS audience_account_id,
  TRIM(c.first_name || ' ' || c.last_name) AS audience_account,
  c.customer_tier AS audience_tier,
  c.city AS audience_city,
  c.state_province AS audience_region,
  fc.center_id AS distribution_hub_id,
  fc.center_name AS distribution_hub,
  COUNT(oi.item_id) AS line_count,
  SUM(oi.quantity) AS requested_units
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN fulfillment_centers fc ON fc.center_id = o.fulfillment_center_id
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY
  o.order_id,
  o.order_status,
  o.order_total,
  o.shipping_cost,
  o.created_at,
  o.social_source_id,
  c.customer_id,
  TRIM(c.first_name || ' ' || c.last_name),
  c.customer_tier,
  c.city,
  c.state_province,
  fc.center_id,
  fc.center_name;

CREATE OR REPLACE VIEW media_audience_signals_v AS
SELECT
  sp.post_id AS audience_signal_id,
  sp.platform,
  sp.posted_at,
  sp.post_text AS audience_signal_text,
  sp.sentiment_score,
  sp.virality_score,
  sp.momentum_flag,
  sp.likes_count,
  sp.shares_count,
  sp.views_count,
  i.influencer_id AS creator_id,
  i.handle AS creator_handle,
  i.display_name AS creator_name,
  i.niche AS creator_niche,
  (
    SELECT COUNT(*)
    FROM post_product_mentions ppm
    WHERE ppm.post_id = sp.post_id
  ) AS matched_content_assets
FROM social_posts sp
LEFT JOIN influencers i ON i.influencer_id = sp.influencer_id;

CREATE OR REPLACE VIEW media_distribution_capacity_v AS
SELECT
  fc.center_id AS distribution_hub_id,
  fc.center_name AS distribution_hub,
  fc.center_type AS hub_type,
  fc.city,
  fc.state_province,
  fc.capacity_units,
  fc.current_load_pct,
  p.product_id AS content_asset_id,
  p.product_name AS content_asset,
  p.category AS content_category,
  i.quantity_on_hand AS capacity_units_available,
  i.quantity_reserved AS capacity_units_reserved,
  i.quantity_incoming AS capacity_units_incoming,
  i.reorder_point AS capacity_intervention_threshold,
  df.predicted_demand,
  df.forecast_date,
  df.social_factor AS audience_signal_factor
FROM fulfillment_centers fc
JOIN inventory i ON i.center_id = fc.center_id
JOIN products p ON p.product_id = i.product_id
LEFT JOIN (
  SELECT product_id, region, forecast_date, predicted_demand, social_factor
  FROM (
    SELECT
      df.*,
      ROW_NUMBER() OVER (
        PARTITION BY df.product_id, df.region
        ORDER BY df.forecast_date DESC
      ) AS rn
    FROM demand_forecasts df
  )
  WHERE rn = 1
) df ON df.product_id = p.product_id
   AND (df.region = fc.state_province OR df.region IS NULL);

CREATE OR REPLACE VIEW media_creator_relationships_v AS
SELECT
  i.influencer_id AS creator_id,
  i.handle AS creator_handle,
  i.display_name AS creator_name,
  i.platform,
  i.niche,
  i.follower_count,
  i.engagement_rate,
  i.influence_score,
  b.brand_id AS studio_label_id,
  b.brand_name AS studio_or_label,
  bil.relationship_type,
  bil.post_count,
  bil.avg_engagement,
  bil.revenue_attributed AS content_revenue_attributed,
  NVL(edge.edge_count, 0) AS creator_edge_count,
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

COMMENT ON TABLE media_content_assets_v IS
  'Media semantic view over products, brands, inventory, and audience signals. Use this for content assets, studios, labels, content categories, and capacity questions.';

COMMENT ON TABLE media_campaign_orders_v IS
  'Media semantic view over orders, customers, order_items, and fulfillment_centers. Use this for campaign orders, audience accounts, campaign value, and distribution hub questions.';

COMMENT ON TABLE media_audience_signals_v IS
  'Media semantic view over social_posts and creators. Use this for audience signals, urgency, virality, momentum, creator handles, and platform questions.';

COMMENT ON TABLE media_distribution_capacity_v IS
  'Media semantic view over fulfillment_centers, inventory, products, and demand_forecasts. Use this for rights capacity, distribution hubs, regional demand, and capacity risk.';

COMMENT ON TABLE media_creator_relationships_v IS
  'Media semantic view over influencers, creator graph edges, and studio or label relationships. Use this for creator influence, propagation, partnerships, and attributed revenue.';

SELECT '10_media_semantic_views.sql complete - media semantic views available.' AS status FROM dual;
