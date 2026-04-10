/**
 * DataModel — Interactive schema explorer showing every core table,
 * Oracle feature, and how data connects across the converged database.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Database, Package, Users, ShoppingCart, MapPin, TrendingUp,
  Network, Sparkles, BrainCircuit, Bot, Shield, Globe, ChevronRight,
  ChevronDown, Layers, Table2, Key, Link2, Boxes, FileJson,
  Play, CheckCircle2, Loader2, Clock, BarChart2, RefreshCw, ArrowRight
} from 'lucide-react';
import { FeatureBadge, SqlBlock, DiagramBox } from '../components/OracleInfoPanel';
import { RegisterOraclePanel } from '../context/OraclePanelContext';

/* ─── Oracle Feature Tags ─────────────────────────────────────────────────── */
const FEATURES = {
  relational: { label: 'Relational', color: '#1B84ED', icon: Database },
  json:       { label: 'JSON',       color: '#D4760A', icon: FileJson },
  graph:      { label: 'Graph',      color: '#7B48A5', icon: Network },
  vector:     { label: 'Vector',     color: '#1AADA8', icon: Sparkles },
  spatial:    { label: 'Spatial',    color: '#2D9F5E', icon: Globe },
  ml:         { label: 'ML / AI',    color: '#D4549A', icon: BrainCircuit },
  agents:     { label: 'AI Agents',  color: '#C74634', icon: Bot },
  security:   { label: 'Security',   color: '#E87B1A', icon: Shield },
};

/* ─── Schema Table Definitions ────────────────────────────────────────────── */
const SCHEMA_TABLES = [
  {
    group: 'Core Commerce',
    icon: ShoppingCart,
    color: '#1B84ED',
    tables: [
      {
        name: 'BRANDS',
        desc: 'Brand catalog — 50 fashion & lifestyle brands with headquarters, tier, and revenue data.',
        features: ['relational'],
        rowCount: '50',
        columns: [
          { name: 'brand_id', type: 'NUMBER', pk: true },
          { name: 'brand_name', type: 'VARCHAR2(100)' },
          { name: 'brand_slug', type: 'VARCHAR2(100)', unique: true },
          { name: 'category', type: 'VARCHAR2(50)' },
          { name: 'headquarters_city', type: 'VARCHAR2(100)' },
          { name: 'headquarters_lat / lon', type: 'NUMBER' },
          { name: 'social_tier', type: "CHECK (emerging|standard|premium|luxury)" },
          { name: 'annual_revenue', type: 'NUMBER' },
        ],
        sql: `SELECT brand_name, category, social_tier,
       TO_CHAR(annual_revenue, '$999,999,999') AS revenue
FROM   brands
WHERE  social_tier = 'luxury'
ORDER BY annual_revenue DESC;`,
      },
      {
        name: 'PRODUCTS',
        desc: 'Product catalog — 187 products across all brands with pricing, tags, and category hierarchy.',
        features: ['relational', 'vector'],
        rowCount: '187',
        columns: [
          { name: 'product_id', type: 'NUMBER', pk: true },
          { name: 'brand_id', type: 'NUMBER', fk: 'brands' },
          { name: 'sku', type: 'VARCHAR2(50)', unique: true },
          { name: 'product_name', type: 'VARCHAR2(200)' },
          { name: 'description', type: 'CLOB' },
          { name: 'category / subcategory', type: 'VARCHAR2(50)' },
          { name: 'unit_price / unit_cost', type: 'NUMBER' },
          { name: 'is_active', type: 'NUMBER(1)' },
          { name: 'launch_date', type: 'DATE' },
          { name: 'tags', type: 'VARCHAR2(500)' },
        ],
        sql: `-- Products enriched with 384-dim vector embeddings
SELECT p.product_name, p.unit_price,
       VECTOR_DISTANCE(pe.embedding,
         VECTOR_EMBEDDING(all_MiniLM_L12_v2
           USING 'sustainable streetwear' AS data),
         COSINE) AS similarity
FROM   products p
JOIN   product_embeddings pe ON p.product_id = pe.product_id
ORDER BY similarity
FETCH FIRST 5 ROWS ONLY;`,
      },
      {
        name: 'CUSTOMERS',
        desc: 'Customer profiles with geographic location, tier (new → VIP), and lifetime value tracking.',
        features: ['relational', 'spatial'],
        rowCount: '~500',
        columns: [
          { name: 'customer_id', type: 'NUMBER', pk: true },
          { name: 'email', type: 'VARCHAR2(200)', unique: true },
          { name: 'first_name / last_name', type: 'VARCHAR2(100)' },
          { name: 'city / state_province', type: 'VARCHAR2(100)' },
          { name: 'latitude / longitude', type: 'NUMBER' },
          { name: 'location', type: 'SDO_GEOMETRY', special: 'spatial' },
          { name: 'customer_tier', type: "CHECK (new|standard|preferred|vip)" },
          { name: 'lifetime_value', type: 'NUMBER' },
        ],
        sql: `-- Spatial: find customers within 50 miles of a center
SELECT c.first_name, c.city, c.customer_tier,
       SDO_GEOM.SDO_DISTANCE(c.location, fc.location,
         0.005, 'unit=MILE') AS distance_mi
FROM   customers c, fulfillment_centers fc
WHERE  fc.center_name = 'NYC Metro Hub'
  AND  SDO_WITHIN_DISTANCE(c.location, fc.location,
         'distance=50 unit=MILE') = 'TRUE';`,
      },
      {
        name: 'ORDERS',
        desc: 'Order transactions with fulfillment center routing, social attribution, and AI-computed demand scores.',
        features: ['relational'],
        rowCount: '~2,000',
        columns: [
          { name: 'order_id', type: 'NUMBER', pk: true },
          { name: 'customer_id', type: 'NUMBER', fk: 'customers' },
          { name: 'order_status', type: "CHECK (pending|confirmed|processing|shipped|delivered|cancelled|returned)" },
          { name: 'order_total / shipping_cost', type: 'NUMBER' },
          { name: 'fulfillment_center_id', type: 'NUMBER', fk: 'fulfillment_centers' },
          { name: 'social_source_id', type: 'NUMBER', fk: 'social_posts', note: 'nullable — tracks social-driven purchases' },
          { name: 'demand_score', type: 'NUMBER', note: 'AI-computed urgency 0–100' },
          { name: 'estimated_delivery / actual_delivery', type: 'TIMESTAMP' },
        ],
        sql: `-- Social attribution: orders driven by viral posts
SELECT o.order_id, o.order_total,
       sp.momentum_flag, sp.virality_score,
       i.handle AS influencer
FROM   orders o
JOIN   social_posts sp ON o.social_source_id = sp.post_id
JOIN   influencers i   ON sp.influencer_id = i.influencer_id
WHERE  sp.momentum_flag IN ('viral', 'mega_viral')
ORDER BY o.order_total DESC;`,
      },
      {
        name: 'ORDER_ITEMS',
        desc: 'Line items per order — tracks which product, quantity, and which fulfillment center ships it.',
        features: ['relational'],
        rowCount: '~5,000',
        columns: [
          { name: 'item_id', type: 'NUMBER', pk: true },
          { name: 'order_id', type: 'NUMBER', fk: 'orders' },
          { name: 'product_id', type: 'NUMBER', fk: 'products' },
          { name: 'quantity', type: 'NUMBER' },
          { name: 'unit_price', type: 'NUMBER' },
          { name: 'line_total', type: 'GENERATED ALWAYS AS (quantity * unit_price)', note: 'Virtual column' },
          { name: 'fulfilled_from', type: 'NUMBER', fk: 'fulfillment_centers' },
        ],
        sql: `-- Revenue by brand with virtual column
SELECT b.brand_name,
       COUNT(oi.item_id) AS items_sold,
       SUM(oi.line_total) AS total_revenue
FROM   order_items oi
JOIN   products p ON oi.product_id = p.product_id
JOIN   brands b   ON p.brand_id = b.brand_id
GROUP BY b.brand_name
ORDER BY total_revenue DESC;`,
      },
    ],
  },
  {
    group: 'Social & Influencers',
    icon: TrendingUp,
    color: '#D4549A',
    tables: [
      {
        name: 'INFLUENCERS',
        desc: 'Social media personalities — platform, follower count, engagement rate, influence score, and niche.',
        features: ['relational', 'graph'],
        rowCount: '~200',
        columns: [
          { name: 'influencer_id', type: 'NUMBER', pk: true },
          { name: 'handle', type: 'VARCHAR2(100)', unique: true },
          { name: 'display_name', type: 'VARCHAR2(200)' },
          { name: 'platform', type: "CHECK (instagram|tiktok|twitter|youtube|threads)" },
          { name: 'follower_count', type: 'NUMBER' },
          { name: 'engagement_rate', type: 'NUMBER(5,4)' },
          { name: 'influence_score', type: 'NUMBER', note: '0–100' },
          { name: 'niche', type: 'VARCHAR2(100)' },
          { name: 'is_verified', type: 'NUMBER(1)' },
        ],
        sql: `-- Graph: Find influencer's network using Property Graph
SELECT v2.handle, v2.platform, v2.follower_count,
       e.connection_type, e.strength
FROM   GRAPH_TABLE(influencer_network
         MATCH (v1 IS influencer)-[e IS connects_to]->(v2 IS influencer)
         WHERE v1.handle = '@fashion_sarah'
         COLUMNS (v2.handle, v2.platform, v2.follower_count,
                  e.connection_type, e.strength))
ORDER BY e.strength DESC;`,
      },
      {
        name: 'SOCIAL_POSTS',
        desc: '5,000 social media posts with NLP-driven virality scoring, sentiment, and momentum classification.',
        features: ['relational', 'json', 'vector'],
        rowCount: '5,000',
        columns: [
          { name: 'post_id', type: 'NUMBER', pk: true },
          { name: 'influencer_id', type: 'NUMBER', fk: 'influencers' },
          { name: 'platform', type: 'VARCHAR2(20)' },
          { name: 'post_text', type: 'CLOB' },
          { name: 'likes_count / shares_count / comments_count / views_count', type: 'NUMBER' },
          { name: 'sentiment_score', type: 'NUMBER', note: '-1.0 to +1.0' },
          { name: 'virality_score', type: 'NUMBER', note: '0–100' },
          { name: 'momentum_flag', type: "CHECK (normal|rising|viral|mega_viral)" },
        ],
        sql: `-- Viral posts with momentum scoring
SELECT sp.post_text, sp.virality_score,
       sp.momentum_flag, sp.sentiment_score,
       sp.likes_count, sp.shares_count
FROM   social_posts sp
WHERE  sp.momentum_flag = 'mega_viral'
ORDER BY sp.virality_score DESC;`,
      },
      {
        name: 'POST_PRODUCT_MENTIONS',
        desc: 'Many-to-many link between social posts and products — with confidence scores and mention type.',
        features: ['relational', 'graph'],
        rowCount: '~15,000',
        columns: [
          { name: 'mention_id', type: 'NUMBER', pk: true },
          { name: 'post_id', type: 'NUMBER', fk: 'social_posts' },
          { name: 'product_id', type: 'NUMBER', fk: 'products' },
          { name: 'confidence_score', type: 'NUMBER(3,2)', note: '0–1' },
          { name: 'mention_type', type: "CHECK (direct|semantic|hashtag|visual|inferred)" },
        ],
        sql: `-- Graph edge: post mentions product (used in Property Graph)
-- This table is an EDGE in the influencer_network graph:
--   (social_post) -[mentions_product]-> (product)
SELECT p.product_name, COUNT(*) AS mention_count,
       ROUND(AVG(ppm.confidence_score), 2) AS avg_confidence
FROM   post_product_mentions ppm
JOIN   products p ON ppm.product_id = p.product_id
GROUP BY p.product_name
ORDER BY mention_count DESC;`,
      },
      {
        name: 'INFLUENCER_CONNECTIONS',
        desc: 'Graph edges — who follows, collaborates with, or reshares from whom. Edge weights drive influence propagation.',
        features: ['graph'],
        rowCount: '~800',
        columns: [
          { name: 'connection_id', type: 'NUMBER', pk: true },
          { name: 'from_influencer', type: 'NUMBER', fk: 'influencers' },
          { name: 'to_influencer', type: 'NUMBER', fk: 'influencers' },
          { name: 'connection_type', type: "CHECK (follows|collaborates|mentioned|reshared|tagged|duet|inspired_by)" },
          { name: 'strength', type: 'NUMBER(3,2)', note: 'Edge weight 0–1' },
          { name: 'interaction_count', type: 'NUMBER' },
        ],
        sql: `-- Property Graph: 2-hop influencer network traversal
SELECT v1.handle AS source,
       v2.handle AS hop1,
       v3.handle AS hop2,
       e1.strength + e2.strength AS path_weight
FROM GRAPH_TABLE(influencer_network
  MATCH (v1)-[e1 IS connects_to]->(v2)-[e2 IS connects_to]->(v3)
  WHERE v1.handle = '@fashion_sarah'
  COLUMNS (v1.handle, v2.handle, v3.handle,
           e1.strength, e2.strength))
ORDER BY path_weight DESC;`,
      },
      {
        name: 'BRAND_INFLUENCER_LINKS',
        desc: 'Which influencers promote which brands — organic vs sponsored, with attributed revenue.',
        features: ['relational', 'graph'],
        rowCount: '~400',
        columns: [
          { name: 'link_id', type: 'NUMBER', pk: true },
          { name: 'brand_id', type: 'NUMBER', fk: 'brands' },
          { name: 'influencer_id', type: 'NUMBER', fk: 'influencers' },
          { name: 'relationship_type', type: "CHECK (organic|sponsored|ambassador|affiliate|competitor_mention)" },
          { name: 'post_count', type: 'NUMBER' },
          { name: 'revenue_attributed', type: 'NUMBER' },
        ],
        sql: `-- Graph edge: influencer promotes brand
SELECT b.brand_name, i.handle,
       bil.relationship_type,
       TO_CHAR(bil.revenue_attributed, '$999,999') AS attributed
FROM   brand_influencer_links bil
JOIN   brands b ON bil.brand_id = b.brand_id
JOIN   influencers i ON bil.influencer_id = i.influencer_id
WHERE  bil.relationship_type = 'ambassador'
ORDER BY bil.revenue_attributed DESC;`,
      },
    ],
  },
  {
    group: 'Supply Chain & Spatial',
    icon: MapPin,
    color: '#D4760A',
    tables: [
      {
        name: 'FULFILLMENT_CENTERS',
        desc: '30 warehouses & distribution centers across the US — with coordinates, capacity, and load metrics.',
        features: ['relational', 'spatial'],
        rowCount: '30',
        columns: [
          { name: 'center_id', type: 'NUMBER', pk: true },
          { name: 'center_name', type: 'VARCHAR2(100)' },
          { name: 'center_type', type: "CHECK (warehouse|distribution|micro|drop_ship|store)" },
          { name: 'city / state_province', type: 'VARCHAR2(100)' },
          { name: 'latitude / longitude', type: 'NUMBER' },
          { name: 'location', type: 'SDO_GEOMETRY', special: 'spatial' },
          { name: 'capacity_units', type: 'NUMBER' },
          { name: 'current_load_pct', type: 'NUMBER' },
        ],
        sql: `-- Spatial: SDO_POINT geometry for each center
-- location column populated with:
UPDATE fulfillment_centers SET location =
  SDO_GEOMETRY(2001, 4326,
    SDO_POINT_TYPE(longitude, latitude, NULL),
    NULL, NULL);
-- Indexed with MDSYS.SPATIAL_INDEX_V2`,
      },
      {
        name: 'INVENTORY',
        desc: 'Stock levels per product per center — with reorder points and incoming quantities.',
        features: ['relational'],
        rowCount: '~3,000',
        columns: [
          { name: 'inventory_id', type: 'NUMBER', pk: true },
          { name: 'product_id', type: 'NUMBER', fk: 'products' },
          { name: 'center_id', type: 'NUMBER', fk: 'fulfillment_centers' },
          { name: 'quantity_on_hand / quantity_reserved', type: 'NUMBER' },
          { name: 'quantity_incoming', type: 'NUMBER' },
          { name: 'reorder_point / reorder_qty', type: 'NUMBER' },
        ],
        sql: `-- Low stock alert: products below reorder point
SELECT p.product_name, fc.center_name,
       i.quantity_on_hand, i.reorder_point,
       CASE WHEN i.quantity_on_hand <= 0 THEN 'CRITICAL'
            WHEN i.quantity_on_hand < i.reorder_point THEN 'LOW'
            ELSE 'OK' END AS status
FROM   inventory i
JOIN   products p ON i.product_id = p.product_id
JOIN   fulfillment_centers fc ON i.center_id = fc.center_id
WHERE  i.quantity_on_hand < i.reorder_point;`,
      },
      {
        name: 'FULFILLMENT_ZONES',
        desc: 'Service area polygons around each center — express, standard, economy delivery tiers generated with SDO_BUFFER.',
        features: ['spatial'],
        rowCount: '120',
        columns: [
          { name: 'zone_id', type: 'NUMBER', pk: true },
          { name: 'center_id', type: 'NUMBER', fk: 'fulfillment_centers' },
          { name: 'zone_type', type: "CHECK (express|standard|economy|overnight)" },
          { name: 'max_delivery_hrs', type: 'NUMBER' },
          { name: 'zone_boundary', type: 'SDO_GEOMETRY', special: 'spatial' },
        ],
        sql: `-- Spatial: Generate express zone (50mi radius) with SDO_BUFFER
INSERT INTO fulfillment_zones (center_id, zone_type,
  max_delivery_hrs, zone_boundary)
SELECT center_id, 'express', 8,
       SDO_GEOM.SDO_BUFFER(location, 50, 0.005,
         'unit=MILE arc_tolerance=0.05')
FROM   fulfillment_centers
WHERE  is_active = 1;`,
      },
      {
        name: 'DEMAND_REGIONS',
        desc: 'Geographic demand heatmap polygons — metro areas, state clusters — with population and social density.',
        features: ['spatial'],
        rowCount: '20',
        columns: [
          { name: 'region_id', type: 'NUMBER', pk: true },
          { name: 'region_name', type: 'VARCHAR2(100)' },
          { name: 'region_type', type: "CHECK (metro|state|region|zip_cluster)" },
          { name: 'boundary', type: 'SDO_GEOMETRY', special: 'spatial' },
          { name: 'population / avg_income', type: 'NUMBER' },
          { name: 'social_density', type: 'NUMBER', note: 'Posts per 1,000 pop' },
          { name: 'demand_index', type: 'NUMBER', note: '0–100' },
        ],
        sql: `-- Spatial join: which demand regions overlap a center's zone?
SELECT dr.region_name, dr.demand_index, dr.population,
       fz.zone_type, fc.center_name
FROM   demand_regions dr, fulfillment_zones fz,
       fulfillment_centers fc
WHERE  fz.center_id = fc.center_id
  AND  SDO_ANYINTERACT(dr.boundary, fz.zone_boundary) = 'TRUE'
ORDER BY dr.demand_index DESC;`,
      },
      {
        name: 'SHIPMENTS',
        desc: 'Logistics tracking — carrier, status, distance, cost, and delivery timestamps.',
        features: ['relational'],
        rowCount: '~1,500',
        columns: [
          { name: 'shipment_id', type: 'NUMBER', pk: true },
          { name: 'order_id', type: 'NUMBER', fk: 'orders' },
          { name: 'center_id', type: 'NUMBER', fk: 'fulfillment_centers' },
          { name: 'carrier', type: 'VARCHAR2(50)' },
          { name: 'ship_status', type: "CHECK (preparing|picked|packed|shipped|in_transit|out_for_delivery|delivered|exception)" },
          { name: 'distance_km / estimated_hours / ship_cost', type: 'NUMBER' },
        ],
        sql: `-- Shipment performance by carrier
SELECT carrier,
       COUNT(*) AS total_shipments,
       ROUND(AVG(estimated_hours), 1) AS avg_hours,
       ROUND(AVG(ship_cost), 2) AS avg_cost
FROM   shipments
WHERE  ship_status = 'delivered'
GROUP BY carrier ORDER BY avg_hours;`,
      },
      {
        name: 'DEMAND_FORECASTS',
        desc: 'AI-predicted demand per product/region — includes social factor multiplier and explainable confidence bands.',
        features: ['relational', 'ml'],
        rowCount: '~500',
        columns: [
          { name: 'forecast_id', type: 'NUMBER', pk: true },
          { name: 'product_id', type: 'NUMBER', fk: 'products' },
          { name: 'region', type: 'VARCHAR2(100)' },
          { name: 'predicted_demand', type: 'NUMBER' },
          { name: 'confidence_low / confidence_high', type: 'NUMBER' },
          { name: 'social_factor', type: 'NUMBER', note: '1.0 = no effect, 3.0 = 3x demand' },
          { name: 'explanation', type: 'CLOB', note: 'JSON — explainable AI factors' },
        ],
        sql: `-- ML: Revenue regression using analytic SQL
SELECT product_name,
       REGR_SLOPE(oi.line_total, EXTRACT(EPOCH FROM o.created_at))
         OVER (PARTITION BY p.product_id) AS revenue_trend,
       NTILE(4) OVER (ORDER BY SUM(oi.line_total) DESC) AS quartile
FROM   products p
JOIN   order_items oi ON p.product_id = oi.product_id
JOIN   orders o ON oi.order_id = o.order_id;`,
      },
    ],
  },
  {
    group: 'JSON Document Store',
    icon: FileJson,
    color: '#D4760A',
    tables: [
      {
        name: 'PRODUCT_ATTRIBUTES',
        desc: 'Flexible JSON attributes per product — different shapes per category (apparel sizes, electronics specs, etc.).',
        features: ['json'],
        rowCount: '187',
        columns: [
          { name: 'attr_id', type: 'NUMBER', pk: true },
          { name: 'product_id', type: 'NUMBER', fk: 'products', unique: true },
          { name: 'attributes', type: 'JSON', special: 'json' },
        ],
        sql: `-- JSON: Schema-flexible product attributes
SELECT p.product_name,
       pa.attributes.material,
       pa.attributes.sizes,
       pa.attributes.sustainability_rating
FROM   product_attributes pa
JOIN   products p ON pa.product_id = p.product_id
WHERE  JSON_EXISTS(pa.attributes, '$.sustainability_rating');`,
      },
      {
        name: 'EVENT_STREAM',
        desc: 'Append-only system event log — tracks inventory changes, price updates, agent actions, and social spikes.',
        features: ['json'],
        rowCount: 'growing',
        columns: [
          { name: 'event_id', type: 'NUMBER', pk: true },
          { name: 'event_type', type: 'VARCHAR2(50)' },
          { name: 'event_source', type: 'VARCHAR2(50)' },
          { name: 'event_data', type: 'JSON', special: 'json' },
          { name: 'correlation_id', type: 'VARCHAR2(100)' },
          { name: 'processed', type: 'NUMBER(1)' },
        ],
        sql: `-- Event sourcing with JSON payloads
SELECT event_type, event_source,
       event_data.entity_id,
       event_data.change_type,
       created_at
FROM   event_stream
WHERE  processed = 0
ORDER BY created_at;`,
      },
    ],
  },
  {
    group: 'Vector & Embeddings',
    icon: Sparkles,
    color: '#1AADA8',
    tables: [
      {
        name: 'PRODUCT_EMBEDDINGS',
        desc: '384-dimensional vector embeddings for every product — generated by all_MiniLM_L12_v2 ONNX model loaded directly into the database.',
        features: ['vector'],
        rowCount: '187',
        columns: [
          { name: 'embedding_id', type: 'NUMBER', pk: true },
          { name: 'product_id', type: 'NUMBER', fk: 'products', unique: true },
          { name: 'embedding_model', type: 'VARCHAR2(100)' },
          { name: 'embedding_text', type: 'CLOB' },
          { name: 'embedding', type: 'VECTOR(384)', special: 'vector' },
        ],
        sql: `-- Vector index for fast approximate nearest neighbor search
CREATE VECTOR INDEX idx_product_vec
ON product_embeddings(embedding)
ORGANIZATION NEIGHBOR PARTITIONS
DISTANCE COSINE
WITH TARGET ACCURACY 95;`,
      },
      {
        name: 'POST_EMBEDDINGS',
        desc: 'Vector embeddings for each social post — enables semantic matching of posts to products.',
        features: ['vector'],
        rowCount: '5,000',
        columns: [
          { name: 'embedding_id', type: 'NUMBER', pk: true },
          { name: 'post_id', type: 'NUMBER', fk: 'social_posts', unique: true },
          { name: 'embedding_model', type: 'VARCHAR2(100)' },
          { name: 'embedding', type: 'VECTOR(384)', special: 'vector' },
        ],
        sql: `-- Semantic search: find posts similar to a product
SELECT sp.post_text, sp.virality_score,
       VECTOR_DISTANCE(pe_post.embedding,
         pe_prod.embedding, COSINE) AS similarity
FROM   post_embeddings pe_post
JOIN   product_embeddings pe_prod
  ON   pe_prod.product_id = :target_product_id
JOIN   social_posts sp ON pe_post.post_id = sp.post_id
ORDER BY similarity
FETCH FIRST 10 ROWS ONLY;`,
      },
      {
        name: 'SEMANTIC_MATCHES',
        desc: 'Cached results of vector similarity — which posts matched which products, with scores and verification status.',
        features: ['vector'],
        rowCount: '~8,000',
        columns: [
          { name: 'match_id', type: 'NUMBER', pk: true },
          { name: 'post_id', type: 'NUMBER', fk: 'social_posts' },
          { name: 'product_id', type: 'NUMBER', fk: 'products' },
          { name: 'similarity_score', type: 'NUMBER(5,4)' },
          { name: 'match_rank', type: 'NUMBER' },
          { name: 'match_method', type: "CHECK (vector|keyword|hybrid|visual)" },
          { name: 'verified', type: 'NUMBER(1)' },
        ],
        sql: `-- Products most mentioned via semantic matching
SELECT p.product_name, COUNT(*) AS semantic_hits,
       ROUND(AVG(sm.similarity_score), 3) AS avg_sim
FROM   semantic_matches sm
JOIN   products p ON sm.product_id = p.product_id
WHERE  sm.verified = 1
GROUP BY p.product_name
ORDER BY semantic_hits DESC;`,
      },
    ],
  },
  {
    group: 'AI Agents & Security',
    icon: Bot,
    color: '#C74634',
    tables: [
      {
        name: 'AGENT_ACTIONS',
        desc: 'Audit trail for every AI agent decision — reasoning, confidence, execution status, and outcome.',
        features: ['agents', 'json'],
        rowCount: 'growing',
        columns: [
          { name: 'action_id', type: 'NUMBER', pk: true },
          { name: 'agent_name', type: 'VARCHAR2(50)' },
          { name: 'action_type', type: 'VARCHAR2(50)' },
          { name: 'entity_type', type: "CHECK (product|order|inventory|shipment)" },
          { name: 'entity_id', type: 'NUMBER' },
          { name: 'decision_payload', type: 'CLOB', note: 'JSON — reasoning, factors, outcome' },
          { name: 'confidence', type: 'NUMBER(3,2)', note: '0–1' },
          { name: 'execution_status', type: "CHECK (proposed|approved|executing|completed|failed|rolled_back)" },
        ],
        sql: `-- Agent audit: what did the AI decide and why?
SELECT agent_name, action_type,
       JSON_VALUE(decision_payload, '$.reasoning') AS reasoning,
       confidence, execution_status, executed_at
FROM   agent_actions
WHERE  agent_name = 'TREND_AGENT'
ORDER BY executed_at DESC
FETCH FIRST 10 ROWS ONLY;`,
      },
      {
        name: 'APP_USERS',
        desc: 'Application user accounts — supports 5 roles with Virtual Private Database (VPD) row-level security.',
        features: ['security'],
        rowCount: '~10',
        columns: [
          { name: 'user_id', type: 'NUMBER', pk: true },
          { name: 'username', type: 'VARCHAR2(50)', unique: true },
          { name: 'role', type: "CHECK (admin|analyst|fulfillment_mgr|merchandiser|viewer)" },
          { name: 'region', type: 'VARCHAR2(50)', note: 'VPD: restricts visible centers' },
          { name: 'is_active', type: 'NUMBER(1)' },
        ],
        sql: `-- VPD: Row-level security on fulfillment_centers
-- Fulfillment managers only see their region's centers:
BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema => 'SOCIALCOMMERCE',
    object_name   => 'FULFILLMENT_CENTERS',
    policy_name   => 'VPD_FC_REGION',
    function_schema => 'SOCIALCOMMERCE',
    policy_function => 'SC_SECURITY_CTX.VPD_FULFILLMENT_REGION',
    statement_types => 'SELECT,UPDATE,DELETE');
END;`,
      },
    ],
  },
];

/* ─── Data Flow Nodes (moved from Welcome) ─────────────────────────────── */
const FLOW_NODES = [
  {
    id: 'social', label: 'Social Listening',
    sub: '5,000 posts from TikTok, Instagram, Twitter, YouTube & Threads',
    icon: TrendingUp, color: '#D4549A', oracleFeature: 'JSON Document Store',
    detail: 'Social posts are stored relationally with NLP-driven virality scoring, sentiment analysis, and momentum classification. Post-product mentions link social activity to the product catalog.',
    tables: ['social_posts', 'post_product_mentions'],
  },
  {
    id: 'influencers', label: 'Influencer Network',
    sub: 'Brand ambassadors, follower reach, and collaboration graphs',
    icon: Network, color: '#7B48A5', oracleFeature: 'Property Graph',
    detail: 'Oracle Property Graph maps influencer → brand → product relationships. Graph traversal finds hidden connections and optimal partnership paths.',
    tables: ['influencers', 'influencer_connections', 'brand_influencer_links', 'post_product_mentions'],
  },
  {
    id: 'products', label: 'Product Catalog',
    sub: '187 products across 50 brands with AI-generated embeddings',
    icon: Package, color: '#1B84ED', oracleFeature: 'Relational + Vector',
    detail: 'Traditional relational tables for products, brands, and inventory — enriched with 384-dimensional vector embeddings for semantic search. The PRODUCTS_INVENTORY_DV duality view exposes products with nested inventory as a single JSON document. See it live in the Dashboard product detail modal.',
    tables: ['brands', 'products', 'product_attributes', 'product_embeddings', 'products_inventory_dv'],
  },
  {
    id: 'orders', label: 'Order Pipeline',
    sub: 'Real-time orders, revenue tracking, and JSON Duality Views',
    icon: ShoppingCart, color: '#2D9F5E', oracleFeature: 'OLTP + Duality Views',
    detail: 'ACID transactions for order processing with analytic window functions running on the same data. JSON Duality Views (ORDERS_DV) expose orders + line items as a single REST-ready JSON document — same transaction, no ETL. See it live on the Orders page.',
    tables: ['customers', 'orders', 'order_items', 'shipments', 'orders_dv'],
  },
  {
    id: 'spatial', label: 'Fulfillment & Logistics',
    sub: '30 centers, service zones, demand regions — all geo-indexed',
    icon: MapPin, color: '#D4760A', oracleFeature: 'SDO_GEOMETRY Spatial',
    detail: 'Fulfillment centers as SDO_POINT, service zones as SDO_BUFFER polygons, demand regions as SDO_GEOMETRY. Nearest-center queries, coverage analysis — all native.',
    tables: ['fulfillment_centers', 'fulfillment_zones', 'demand_regions', 'inventory'],
  },
  {
    id: 'ml', label: 'ML & AI Intelligence',
    sub: 'Demand forecasting, RFM segmentation, vector clustering',
    icon: BrainCircuit, color: '#0572CE', oracleFeature: 'In-Database ML',
    detail: 'REGR_SLOPE for revenue forecasting, NTILE for customer segmentation, VECTOR_DISTANCE for K-Means clustering — all computed inside Oracle, zero model export.',
    tables: ['demand_forecasts', 'semantic_matches', 'product_embeddings', 'post_embeddings'],
  },
  {
    id: 'agents', label: 'Smart AI Agents',
    sub: 'Autonomous agents with tool-calling, multi-step reasoning, and real-time actions',
    icon: Bot, color: '#C74634', oracleFeature: 'AI Agents + Tool Use',
    detail: 'AI agents connect directly to Oracle — calling SQL, PL/SQL, REST APIs, and vector search as tools. They reason over live data, chain multi-step actions, and execute autonomously.',
    tables: ['agent_actions', 'app_users'],
  },
];

/* ─── Relationship Map ───────────────────────────────────────────────────── */
const RELATIONSHIPS = [
  { from: 'BRANDS', to: 'PRODUCTS', label: '1 → N', type: 'FK' },
  { from: 'PRODUCTS', to: 'INVENTORY', label: '1 → N', type: 'FK' },
  { from: 'PRODUCTS', to: 'ORDER_ITEMS', label: '1 → N', type: 'FK' },
  { from: 'PRODUCTS', to: 'PRODUCT_EMBEDDINGS', label: '1 → 1', type: 'FK' },
  { from: 'PRODUCTS', to: 'PRODUCT_ATTRIBUTES', label: '1 → 1', type: 'FK' },
  { from: 'PRODUCTS', to: 'POST_PRODUCT_MENTIONS', label: '1 → N', type: 'FK' },
  { from: 'PRODUCTS', to: 'DEMAND_FORECASTS', label: '1 → N', type: 'FK' },
  { from: 'FULFILLMENT_CENTERS', to: 'INVENTORY', label: '1 → N', type: 'FK' },
  { from: 'FULFILLMENT_CENTERS', to: 'FULFILLMENT_ZONES', label: '1 → N', type: 'spatial' },
  { from: 'FULFILLMENT_CENTERS', to: 'ORDERS', label: '1 → N', type: 'FK' },
  { from: 'FULFILLMENT_CENTERS', to: 'SHIPMENTS', label: '1 → N', type: 'FK' },
  { from: 'CUSTOMERS', to: 'ORDERS', label: '1 → N', type: 'FK' },
  { from: 'ORDERS', to: 'ORDER_ITEMS', label: '1 → N', type: 'FK' },
  { from: 'ORDERS', to: 'SHIPMENTS', label: '1 → N', type: 'FK' },
  { from: 'ORDERS', to: 'SOCIAL_POSTS', label: 'N → 1', type: 'FK', note: 'social attribution' },
  { from: 'INFLUENCERS', to: 'SOCIAL_POSTS', label: '1 → N', type: 'FK' },
  { from: 'INFLUENCERS', to: 'INFLUENCER_CONNECTIONS', label: '1 → N', type: 'graph' },
  { from: 'INFLUENCERS', to: 'BRAND_INFLUENCER_LINKS', label: '1 → N', type: 'graph' },
  { from: 'BRANDS', to: 'BRAND_INFLUENCER_LINKS', label: '1 → N', type: 'graph' },
  { from: 'SOCIAL_POSTS', to: 'POST_PRODUCT_MENTIONS', label: '1 → N', type: 'FK' },
  { from: 'SOCIAL_POSTS', to: 'POST_EMBEDDINGS', label: '1 → 1', type: 'vector' },
];

/* ─── Demo Step Definitions ────────────────────────────────────────────── */
const STEP_LABELS = {
  reset:              { label: 'Verifying Schema',            icon: Database,     color: '#6B6560', capability: 'Relational' },
  brands:             { label: 'Brands (50)',                  icon: Package,      color: '#1B84ED', capability: 'Relational' },
  products:           { label: 'Products (187)',               icon: Package,      color: '#1B84ED', capability: 'Relational' },
  influencers:        { label: 'Influencers',                  icon: Users,        color: '#7B48A5', capability: 'Graph' },
  customers:          { label: 'Customers',                    icon: Users,        color: '#2D9F5E', capability: 'Relational' },
  social_posts:       { label: 'Social Posts (5,000)',         icon: TrendingUp,   color: '#D4549A', capability: 'JSON' },
  orders:             { label: 'Orders',                       icon: ShoppingCart,  color: '#2D9F5E', capability: 'Relational' },
  graph:              { label: 'Graph Relationships',          icon: Network,      color: '#7B48A5', capability: 'Graph' },
  spatial_centers:    { label: 'Center Coordinates',           icon: MapPin,       color: '#D4760A', capability: 'Spatial' },
  spatial_zones:      { label: 'SDO_BUFFER Zones (120)',       icon: MapPin,       color: '#D4760A', capability: 'Spatial' },
  demand_regions:     { label: 'Demand Regions (20)',          icon: Globe,        color: '#E87B1A', capability: 'Spatial' },
  demand_forecasts:   { label: 'Demand Forecasts',            icon: BarChart2,    color: '#E87B1A', capability: 'ML / AI' },
  product_embeddings: { label: 'Product Vectors (384-dim)',    icon: Sparkles,     color: '#1AADA8', capability: 'Vector' },
  post_embeddings:    { label: 'Post Vectors (5,000)',         icon: Sparkles,     color: '#1AADA8', capability: 'Vector' },
  semantic_matches:   { label: 'Semantic Matches',             icon: Sparkles,     color: '#1AADA8', capability: 'Vector' },
  complete:           { label: 'Demo Ready',                   icon: CheckCircle2, color: '#2D9F5E', capability: '' },
};

/* ─── Explore Nav Pages ────────────────────────────────────────────────── */
const EXPLORE_PAGES = [
  { id: 'dashboard',   label: 'Dashboard',        sub: 'KPIs, revenue charts, real-time overview',          icon: BarChart2,     color: '#C74634' },
  { id: 'social',      label: 'Social Trends',    sub: 'Vector search, momentum detection, viral posts',    icon: TrendingUp,    color: '#D4549A' },
  { id: 'graph',       label: 'Influencer Graph', sub: 'Property graph visualization, network traversal',   icon: Network,       color: '#7B48A5' },
  { id: 'fulfillment', label: 'Fulfillment Map',  sub: 'Spatial layers, SDO_BUFFER zones, demand regions',  icon: MapPin,        color: '#D4760A' },
  { id: 'oml',         label: 'ML Analytics',     sub: 'K-Means clustering, RFM, revenue regression',       icon: BrainCircuit,  color: '#1AADA8' },
  { id: 'agents',      label: 'Agent Console',    sub: 'AI agents with tool-calling, autonomous actions',   icon: Bot,           color: '#C74634' },
];

/* ─── Feature Badge Component ──────────────────────────────────────────── */
function FeatureTag({ feature }) {
  const f = FEATURES[feature];
  if (!f) return null;
  const Icon = f.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-semibold"
      style={{ background: `${f.color}18`, color: f.color, border: `1px solid ${f.color}30` }}>
      <Icon size={10} />
      {f.label}
    </span>
  );
}

/* ─── Column Row Component ─────────────────────────────────────────────── */
function ColumnRow({ col }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded text-[11px] hover:bg-[var(--color-surface-hover)] transition-colors">
      <span className="flex-shrink-0 w-4 text-center">
        {col.pk ? <Key size={10} className="text-[#D4760A]" /> :
         col.fk ? <Link2 size={10} className="text-[#7B48A5]" /> :
         col.unique ? <span className="text-[#1AADA8] font-bold text-[8px]">U</span> :
         col.special === 'spatial' ? <Globe size={10} className="text-[#2D9F5E]" /> :
         col.special === 'json' ? <FileJson size={10} className="text-[#D4760A]" /> :
         col.special === 'vector' ? <Sparkles size={10} className="text-[#1AADA8]" /> :
         null}
      </span>
      <span className="font-mono font-medium text-[var(--color-text)] min-w-[140px]">{col.name}</span>
      <span className="font-mono text-[var(--color-text-dim)] text-[10px] flex-1">{col.type}</span>
      {col.fk && <span className="text-[9px] text-[#7B48A5]">→ {col.fk}</span>}
      {col.note && <span className="text-[9px] text-[var(--color-text-dim)] italic">{col.note}</span>}
    </div>
  );
}

/* ─── Table Card Component ─────────────────────────────────────────────── */
function TableCard({ table, groupColor }) {
  const [expanded, setExpanded] = useState(false);
  const [showSql, setShowSql] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden transition-all"
      style={{ borderColor: expanded ? `${groupColor}44` : undefined }}>
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-surface-hover)] transition-colors">
        <Table2 size={14} style={{ color: groupColor }} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold font-mono">{table.name}</span>
            {table.rowCount && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-dim)] font-mono">
                ~{table.rowCount} rows
              </span>
            )}
            {table.features.map(f => <FeatureTag key={f} feature={f} />)}
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5 leading-relaxed">{table.desc}</p>
        </div>
        <ChevronRight size={14} className="text-[var(--color-text-dim)] flex-shrink-0 transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
      </button>

      {/* Expanded: columns + SQL */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
          {/* Columns */}
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 mb-2 px-2">
              <Layers size={11} className="text-[var(--color-text-dim)]" />
              <span className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider">Columns</span>
              <div className="flex-1" />
              <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-dim)]">
                <span className="flex items-center gap-1"><Key size={8} className="text-[#D4760A]" /> PK</span>
                <span className="flex items-center gap-1"><Link2 size={8} className="text-[#7B48A5]" /> FK</span>
                <span className="flex items-center gap-1 font-bold text-[#1AADA8]">U Unique</span>
              </div>
            </div>
            {table.columns.map((col, i) => <ColumnRow key={i} col={col} />)}
          </div>
          {/* SQL toggle */}
          {table.sql && (
            <div className="border-t border-[var(--color-border)]">
              <button onClick={() => setShowSql(!showSql)}
                className="w-full text-left px-4 py-2 text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider hover:bg-[var(--color-surface-hover)] flex items-center gap-1.5">
                <Database size={10} style={{ color: groupColor }} />
                {showSql ? 'Hide' : 'Show'} Example Query
                <ChevronDown size={10} style={{ transform: showSql ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {showSql && (
                <div className="px-3 pb-3">
                  <SqlBlock code={table.sql} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Flow Connector ─────────────────────────────────────────────────────── */
function FlowConnector({ color = '#ffffff' }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="w-px h-6" style={{ background: `linear-gradient(to bottom, ${color}44, ${color}22)` }} />
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function DataModel({ onNavigate }) {
  const [expandedFlow, setExpandedFlow] = useState(null);
  const [showRelationships, setShowRelationships] = useState(false);

  // Demo state
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoSteps, setDemoSteps] = useState([]);
  const [demoProgress, setDemoProgress] = useState(0);
  const [demoDone, setDemoDone] = useState(false);
  const [status, setStatus] = useState(null);
  const logRef = useRef(null);

  // Fetch current data status on mount
  useEffect(() => {
    fetch('/api/demo/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, [demoDone]);

  const hasData = status && (status.products > 0 || status.brands > 0);

  // Start the demo SSE stream
  const startDemo = () => {
    setDemoRunning(true);
    setDemoSteps([]);
    setDemoProgress(0);
    setDemoDone(false);

    const evtSource = new EventSource('/api/demo/start');

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDemoProgress(data.progress || 0);
        setDemoSteps(prev => {
          const existing = prev.findIndex(s => s.step === data.step);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = data;
            return updated;
          }
          return [...prev, data];
        });
        if (data.step === 'complete') {
          setDemoDone(true);
          setDemoRunning(false);
          evtSource.close();
        }
      } catch (_) {}
    };

    evtSource.onerror = () => {
      setDemoRunning(false);
      evtSource.close();
    };
  };

  // Auto-scroll the log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [demoSteps]);

  // Count totals
  const totalTables = SCHEMA_TABLES.reduce((sum, g) => sum + g.tables.length, 0);

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">

      {/* ── Right Oracle Panel ── */}
      <RegisterOraclePanel title="Data Model">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Schema Architecture</p>
            <p className="text-[var(--color-text)] leading-relaxed">
              This page documents the <span className="text-[#C74634] font-semibold">complete schema</span> of the Social Commerce demo —
              {totalTables} tables spanning 7 Oracle capabilities. Every table, column, foreign key, and Oracle-specific feature is described here.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FeatureBadge label="22 Tables" color="blue" />
            <FeatureBadge label="1 Property Graph" color="purple" />
            <FeatureBadge label="2 Vector Indexes" color="cyan" />
            <FeatureBadge label="4 Spatial Layers" color="green" />
            <FeatureBadge label="4 AI Profiles" color="red" />
            <FeatureBadge label="3 Agent Teams" color="pink" />
          </div>
          <SqlBlock code={`-- Schema owner
CREATE USER socialcommerce
  IDENTIFIED BY ****
  DEFAULT TABLESPACE data
  QUOTA UNLIMITED ON data;

-- Capabilities used:
-- 01_tables.sql      → Core relational (12 tables)
-- 02_json.sql        → JSON collections + Duality Views
-- 03_graph.sql       → Property Graph (influencer_network)
-- 04_vector.sql      → VECTOR(384) + ONNX model
-- 05_spatial.sql     → SDO_GEOMETRY + spatial indexes
-- 06_security.sql    → RBAC + VPD row-level security
-- 07_ai_profile.sql  → 4 OCI GenAI profiles
-- 08_agents.sql      → 3 AI agent teams`} />
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Key Insight</p>
            <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(199,70,52,0.08)', border: '1px dashed rgba(199,70,52,0.3)' }}>
              <p className="text-[9px] text-[var(--color-text-dim)]">All 22 tables live in one schema. No external services.</p>
              <p className="text-[9px] font-mono text-[#D4760A] mt-0.5">JSON + Graph + Vector + Spatial = Zero ETL</p>
            </div>
          </div>
        </div>
      </RegisterOraclePanel>

      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Database size={24} className="text-[var(--color-accent)]" />
          Schema &amp; Data Model
        </h2>
        <p className="text-sm text-[var(--color-text-dim)] mt-1">
          {totalTables} tables · 2 duality views · 1 property graph · {RELATIONSHIPS.length} relationships — all in a single Oracle AI Database 26ai
        </p>
      </div>

      {/* ── What This Demo Showcases ── */}
      <div className="glass-card p-5" style={{ borderLeft: '3px solid var(--color-accent)' }}>
        <p className="text-sm text-[var(--color-text)] leading-relaxed">
          This capabilities demo simulates a social-commerce platform — think Shop.com — built entirely on a single Oracle Autonomous Database.{' '}
          <strong className="text-[#1B84ED]">50 brands</strong> sell <strong className="text-[#1B84ED]">187 products</strong> across categories like fitness, electronics, and home goods.{' '}
          <strong className="text-[#2D9F5E]">2,000 customers</strong> place orders fulfilled from <strong className="text-[#2D9F5E]">30 distribution centers</strong> nationwide.{' '}
          A social listening feed of <strong className="text-[#D4549A]">5,000 posts</strong> from TikTok, Instagram, X, YouTube, and Threads drives demand signals, while{' '}
          an <strong className="text-[#7B48A5]">influencer network</strong> maps brand ambassador relationships through a property graph.{' '}
          Every workload — relational transactions, JSON documents, graph traversals, vector similarity search, spatial queries, in-database ML, and AI agents — runs inside the same database with zero ETL and zero external services.
        </p>
      </div>

      {/* ── The Magic ── */}
      <div className="p-4 rounded-xl text-center"
        style={{ background: 'rgba(199,70,52,0.06)', border: '1px dashed rgba(199,70,52,0.3)' }}>
        <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">
          <strong className="text-[var(--color-accent)]">The magic:</strong>{' '}
          A single SQL query can <span className="text-[#1AADA8]">embed a search query as a vector</span>,{' '}
          <span className="text-[#D4549A]">join it to social post sentiment</span>,{' '}
          <span className="text-[#D4760A]">filter by spatial proximity</span>,{' '}
          <span className="text-[#7B48A5]">traverse the influencer graph</span>,{' '}
          <span className="text-[#E8A24E]">expose results as JSON via duality views</span>,{' '}
          <span className="text-[#2D9F5E]">score with ML regression</span>, and{' '}
          <span className="text-[#C74634]">let an AI agent act on the results</span>{' '}
          — all in one round-trip, one transaction, one engine.
        </p>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {Object.entries(FEATURES).map(([key, f]) => {
          const Icon = f.icon;
          const count = SCHEMA_TABLES.reduce((sum, g) =>
            sum + g.tables.filter(t => t.features.includes(key)).length, 0);
          return (
            <div key={key} className="text-center p-3 rounded-xl border border-[var(--color-border)]/40"
              style={{ background: `${f.color}08` }}>
              <div className="w-9 h-9 rounded-xl mx-auto flex items-center justify-center mb-1.5"
                style={{ background: `${f.color}22` }}>
                <Icon size={18} style={{ color: f.color }} />
              </div>
              <p className="text-xs font-bold" style={{ color: f.color }}>{f.label}</p>
              <p className="text-[9px] text-[var(--color-text-dim)] mt-0.5">{count} table{count !== 1 ? 's' : ''}</p>
            </div>
          );
        })}
      </div>

      {/* ── How the Data Connects (moved from Welcome) ── */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Boxes size={20} className="text-[var(--color-accent)]" />
          How the Data Connects
        </h2>
        <p className="text-xs text-[var(--color-text-dim)] mb-5">
          Click any node to see how Oracle handles it — and which tables are involved.
        </p>

        <div className="space-y-0">
          {FLOW_NODES.map((node, i) => {
            const Icon = node.icon;
            const expanded = expandedFlow === node.id;
            return (
              <div key={node.id}>
                {i > 0 && <FlowConnector color={node.color} />}
                <button
                  onClick={() => setExpandedFlow(expanded ? null : node.id)}
                  className="w-full text-left rounded-xl p-4 transition-all"
                  style={{
                    background: expanded ? `${node.color}12` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${expanded ? node.color + '44' : 'var(--color-border)'}`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${node.color}22` }}>
                      <Icon size={22} style={{ color: node.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold">{node.label}</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold"
                          style={{ background: `${node.color}22`, color: node.color, border: `1px solid ${node.color}33` }}>
                          {node.oracleFeature}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-dim)]">{node.sub}</p>
                    </div>
                    <ChevronRight size={16} className="text-[var(--color-text-dim)] transition-transform"
                      style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
                  </div>
                  {expanded && (
                    <div className="mt-3 ml-[60px] border-t pt-3" style={{ borderColor: `${node.color}33` }}>
                      <p className="text-sm text-[var(--color-text)] leading-relaxed mb-3">{node.detail}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[9px] text-[var(--color-text-dim)] mr-1">Tables:</span>
                        {node.tables.map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono font-medium"
                            style={{ background: `${node.color}15`, color: node.color, border: `1px solid ${node.color}25` }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

      </div>

      {/* ── Table Groups ── */}
      {/* ── Live Demo Control Center ── */}
      <div className="glass-card p-6" style={{ border: '1px solid rgba(199,70,52,0.3)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Play size={20} className="text-[var(--color-accent)]" />
              Live Demo
            </h2>
            <p className="text-xs text-[var(--color-text-dim)] mt-0.5">
              Populate Oracle with live data — watch vectors, spatial geometry, graph relationships, and ML models activate in real time
            </p>
          </div>
          {!demoRunning && !demoDone && (
            <button
              onClick={startDemo}
              className="px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #C74634, #D4760A)',
                boxShadow: '0 4px 24px rgba(199,70,52,0.3)',
              }}
            >
              <Play size={16} />
              {hasData ? 'Verify & Refresh Demo' : 'Start Demo'}
            </button>
          )}
          {demoDone && (
            <div className="flex items-center gap-3">
              <button
                onClick={startDemo}
                className="px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 transition-colors"
              >
                <RefreshCw size={13} /> Re-run
              </button>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #2D9F5E, #1AADA8)',
                    boxShadow: '0 4px 24px rgba(45,159,94,0.3)',
                  }}
                >
                  Explore the Demo <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {(demoRunning || demoDone) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[var(--color-text-dim)]">
                {demoDone ? 'Demo ready — all data loaded' : 'Streaming data into Oracle AI Database 26ai...'}
              </span>
              <span className="text-xs font-mono font-bold" style={{ color: demoDone ? '#2D9F5E' : '#C74634' }}>
                {demoProgress}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-border)]/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${demoProgress}%`,
                  background: demoDone
                    ? '#2D9F5E'
                    : 'linear-gradient(90deg, #C74634, #D4760A)',
                }}
              />
            </div>
          </div>
        )}

        {/* Step log */}
        {demoSteps.length > 0 && (
          <div ref={logRef} className="max-h-[300px] overflow-y-auto space-y-1 rounded-lg p-3"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border)' }}>
            {demoSteps.map((s, i) => {
              const stepDef = STEP_LABELS[s.step] || { label: s.step, icon: Database, color: '#6b7280', capability: '' };
              const StepIcon = stepDef.icon;
              return (
                <div key={`${s.step}-${i}`} className="flex items-center gap-3 py-1.5 px-2 rounded text-xs"
                  style={{
                    background: s.status === 'done' ? `${stepDef.color}08` : s.status === 'running' ? `${stepDef.color}11` : 'transparent',
                  }}>
                  <div className="w-5 flex-shrink-0">
                    {s.status === 'running' ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: stepDef.color }} />
                    ) : s.status === 'done' ? (
                      <CheckCircle2 size={14} className="text-green-400" />
                    ) : s.status === 'skipped' ? (
                      <CheckCircle2 size={14} className="text-blue-400" />
                    ) : (
                      <Clock size={14} className="text-[var(--color-text-dim)]" />
                    )}
                  </div>
                  <StepIcon size={13} style={{ color: stepDef.color }} className="flex-shrink-0" />
                  <span className="flex-1" style={{ color: s.status === 'done' ? 'var(--color-text)' : 'var(--color-text-dim)' }}>
                    {s.message}
                  </span>
                  {stepDef.capability && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full font-mono flex-shrink-0"
                      style={{ background: `${stepDef.color}22`, color: stepDef.color }}>
                      {stepDef.capability}
                    </span>
                  )}
                  {s.count != null && (
                    <span className="text-[10px] font-mono font-bold flex-shrink-0" style={{ color: stepDef.color }}>
                      {s.count.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Status summary when no demo running */}
        {!demoRunning && !demoDone && status && hasData && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-4">
            {[
              { label: 'Products', count: status.products, color: '#1B84ED' },
              { label: 'Social Posts', count: status.social_posts, color: '#D4549A' },
              { label: 'Orders', count: status.orders, color: '#2D9F5E' },
              { label: 'Product Vectors', count: status.product_embeddings, color: '#1AADA8' },
              { label: 'Post Vectors', count: status.post_embeddings, color: '#1AADA8' },
              { label: 'Spatial Zones', count: status.fulfillment_zones, color: '#D4760A' },
              { label: 'Demand Regions', count: status.demand_regions, color: '#E87B1A' },
              { label: 'Graph Nodes', count: status.graph_nodes, color: '#7B48A5' },
              { label: 'Semantic Matches', count: status.semantic_matches, color: '#C74634' },
              { label: 'Customers', count: status.customers, color: '#2D9F5E' },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-2 text-center"
                style={{ background: `${s.color}11`, border: `1px solid ${s.color}22` }}>
                <p className="text-sm font-bold font-mono" style={{ color: s.color }}>{(s.count || 0).toLocaleString()}</p>
                <p className="text-[8px] text-[var(--color-text-dim)] uppercase">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="text-center pb-6">
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Schema: <strong>SOCIALCOMMERCE</strong> · Oracle AI Database 26ai · Autonomous, Converged, AI-Native
        </p>
      </div>
    </div>
  );
}
