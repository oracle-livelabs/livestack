/**
 * Dashboard API — Aggregated metrics for the main dashboard
 *
 * Uses data-relative timestamps (MAX posted_at / created_at) instead of
 * SYSTIMESTAMP so demo data always appears "fresh" regardless of load date.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const webshopSearch = require('./webshop');

const TEXT_CATALOG_MODEL_ID = process.env.PRIVATEAI_TEXT_MODEL || 'all-minilm-l12-v2';
const PRIVATEAI_BASE_URL = (process.env.PRIVATEAI_BASE_URL || 'http://privateai:8080').replace(/\/$/, '');

const REGION_SEARCH_PROFILES = [
  {
    label: 'Texas',
    terms: ['texas', 'tx', 'dallas', 'fort worth', 'dfw', 'houston', 'austin', 'san antonio'],
    demandRegions: ['TX', 'Dallas-Fort Worth', 'Houston Metro', 'Austin Metro'],
  },
  {
    label: 'Arizona',
    terms: ['arizona', 'az', 'phoenix', 'scottsdale'],
    demandRegions: ['AZ', 'Phoenix Metro'],
  },
  {
    label: 'Washington',
    terms: ['washington', 'wa', 'seattle'],
    demandRegions: ['WA', 'Seattle Metro', 'Pacific Northwest'],
  },
  {
    label: 'Illinois',
    terms: ['illinois', 'il', 'chicago'],
    demandRegions: ['IL', 'Chicago Metro', 'Great Lakes Midwest'],
  },
  {
    label: 'North Carolina',
    terms: ['north carolina', 'nc', 'charlotte', 'raleigh'],
    demandRegions: ['NC'],
  },
  {
    label: 'California',
    terms: ['california', 'ca', 'los angeles', 'la', 'bay area', 'san francisco', 'sf', 'san jose'],
    demandRegions: ['Los Angeles Basin', 'Bay Area (SF)'],
  },
  {
    label: 'Florida',
    terms: ['florida', 'fl', 'miami', 'tampa'],
    demandRegions: ['Miami-South Florida'],
  },
  {
    label: 'Georgia',
    terms: ['georgia', 'ga', 'atlanta'],
    demandRegions: ['Atlanta Metro'],
  },
  {
    label: 'Colorado',
    terms: ['colorado', 'co', 'denver', 'boulder'],
    demandRegions: ['Denver Metro', 'Mountain West'],
  },
  {
    label: 'New York',
    terms: ['new york', 'ny', 'nyc', 'brooklyn'],
    demandRegions: ['New York Metro', 'Northeast Corridor'],
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDashboardSearch(search) {
  let productSearch = search;
  const demandRegions = new Set();
  const labels = new Set();

  for (const profile of REGION_SEARCH_PROFILES) {
    const matchedTerms = profile.terms.filter(term => (
      new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(search)
    ));

    if (matchedTerms.length === 0) {
      continue;
    }

    labels.add(profile.label);
    profile.demandRegions.forEach(region => demandRegions.add(region.toUpperCase()));
    for (const term of matchedTerms) {
      productSearch = productSearch.replace(new RegExp(`\\b${escapeRegex(term)}\\b`, 'ig'), ' ');
    }
  }

  if (demandRegions.size > 0) {
    productSearch = productSearch
      .replace(/\b(in|near|around|across|within|for|from)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    productSearch,
    demandRegions: Array.from(demandRegions),
    label: Array.from(labels).join(', ') || null,
  };
}

async function embedSearchText(search) {
  const response = await fetch(`${PRIVATEAI_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_CATALOG_MODEL_ID,
      input: search,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Private AI embedding call failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = await response.json();
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Private AI embedding response did not include a vector.');
  }

  return vector;
}

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS orders_total,
        (SELECT COUNT(*) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '7' DAY) AS orders_7d,
        (SELECT COUNT(*) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY) AS orders_30d,
        (SELECT NVL(SUM(order_total), 0) FROM orders) AS revenue_total,
        (SELECT NVL(SUM(order_total), 0) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '7' DAY) AS revenue_7d,
        (SELECT NVL(SUM(order_total), 0) FROM orders WHERE created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY) AS revenue_30d,
        (SELECT COUNT(*) FROM social_posts WHERE momentum_flag IN ('viral','mega_viral')) AS viral_posts,
        (SELECT COUNT(*) FROM social_posts WHERE momentum_flag = 'rising') AS rising_posts,
        (SELECT COUNT(*) FROM social_posts) AS posts_total,
        (SELECT COUNT(DISTINCT product_id) FROM post_product_mentions
         WHERE post_id IN (SELECT post_id FROM social_posts WHERE momentum_flag IN ('viral','mega_viral'))) AS trending_products,
        (SELECT COUNT(*) FROM agent_actions) AS agent_actions_total,
        (SELECT COUNT(*) FROM shipments WHERE ship_status = 'in_transit') AS shipments_in_transit
      FROM dual
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function fetchWatchedProducts({ limit = 10, search = '', brand = '', visualMatches = [] } = {}) {
    const safeLimit = Math.min(parseInt(limit, 10) || 10, 100);
    const visualMatchRows = visualMatches
      .map((match, index) => ({
        productId: Number(match.productId),
        imageSimilarity: Number(match.imageSimilarity || match.score || 0),
        imageRank: index + 1,
        imageUrl: match.imageUrl || null,
        imageFilename: match.imageFilename || null,
      }))
      .filter((match) => Number.isFinite(match.productId));
    const searchContext = parseDashboardSearch(search);
    const productSearch = searchContext.productSearch;

    let whereExtra = '';
    const binds = {
      limit: safeLimit,
      searchRegionLabel: searchContext.label,
    };
    const vectorLimit = Math.max(safeLimit * 4, 50);
    let vectorCte = '';
    let vectorJoin = '';
    let visualCte = '';
    let visualJoin = '';
    let searchMode = visualMatchRows.length ? 'image' : (productSearch ? 'keyword' : (searchContext.demandRegions.length ? 'region' : 'demand'));

    if (visualMatchRows.length) {
      const visualSelects = visualMatchRows.map((match, index) => {
        binds[`visualProductId${index}`] = match.productId;
        binds[`visualSimilarity${index}`] = match.imageSimilarity;
        binds[`visualRank${index}`] = match.imageRank;
        binds[`visualImageUrl${index}`] = match.imageUrl;
        binds[`visualImageFilename${index}`] = match.imageFilename;
        return `SELECT :visualProductId${index} AS product_id,
                       :visualSimilarity${index} AS image_similarity,
                       :visualRank${index} AS image_rank,
                       :visualImageUrl${index} AS image_url,
                       :visualImageFilename${index} AS image_filename
                FROM dual`;
      });
      visualCte = `
        visual_match AS (
          ${visualSelects.join('\n          UNION ALL\n          ')}
        ),`;
      visualJoin = 'LEFT JOIN visual_match vm ON vm.product_id = p.product_id';
      whereExtra += ' AND vm.product_id IS NOT NULL';
    }

    if (productSearch) {
      binds.search = `%${productSearch}%`;
      try {
        const queryVector = await embedSearchText(productSearch);
        binds.queryVector = JSON.stringify(queryVector);
        binds.queryVector2 = JSON.stringify(queryVector);
        binds.vectorLimit = vectorLimit;
        searchMode = 'vector';
        vectorCte = `
        vector_rank AS (
          SELECT product_id,
                 ROUND(1 - vector_distance, 4) AS semantic_score,
                 ROW_NUMBER() OVER (ORDER BY vector_distance) AS semantic_rank
          FROM (
            SELECT pe.product_id,
                   VECTOR_DISTANCE(pe.embedding, TO_VECTOR(:queryVector), COSINE) AS vector_distance
            FROM product_embeddings pe
            ORDER BY VECTOR_DISTANCE(pe.embedding, TO_VECTOR(:queryVector2), COSINE)
            FETCH APPROXIMATE FIRST :vectorLimit ROWS ONLY
          )
        ),`;
        vectorJoin = 'LEFT JOIN vector_rank vr ON vr.product_id = p.product_id';
        whereExtra += ` AND (
          vr.product_id IS NOT NULL
          OR UPPER(p.product_name) LIKE UPPER(:search)
          OR UPPER(p.category) LIKE UPPER(:search)
          OR UPPER(p.subcategory) LIKE UPPER(:search)
          OR UPPER(p.tags) LIKE UPPER(:search)
          OR UPPER(b.brand_name) LIKE UPPER(:search)
        )`;
      } catch (embedErr) {
        console.warn('Dashboard vector search unavailable; falling back to keyword search:', embedErr.message);
        whereExtra += ` AND (
          UPPER(p.product_name) LIKE UPPER(:search)
          OR UPPER(p.category) LIKE UPPER(:search)
          OR UPPER(p.subcategory) LIKE UPPER(:search)
          OR UPPER(p.tags) LIKE UPPER(:search)
          OR UPPER(b.brand_name) LIKE UPPER(:search)
        )`;
      }
    }

    if (searchContext.demandRegions.length) {
      const regionBinds = searchContext.demandRegions.map((region, index) => {
        const bindName = `searchRegion${index}`;
        binds[bindName] = region;
        return `UPPER(dc.hot_region) = :${bindName}`;
      });
      whereExtra += ` AND (${regionBinds.join(' OR ')})`;
    }

    if (brand) {
      whereExtra += " AND UPPER(b.brand_name) = UPPER(:brand)";
      binds.brand = brand;
    }

    const result = await db.execute(`
      WITH
        ${vectorCte}
        ${visualCte}
        social_rollup AS (
          SELECT ppm.product_id,
                 COUNT(DISTINCT ppm.post_id) AS mention_count,
                 SUM(sp.likes_count) AS total_likes,
                 SUM(sp.shares_count) AS total_shares,
                 SUM(sp.views_count) AS total_views,
                 ROUND(AVG(sp.virality_score), 2) AS avg_virality,
                 MAX(CASE sp.momentum_flag
                   WHEN 'mega_viral' THEN 3
                   WHEN 'viral' THEN 2
                   WHEN 'rising' THEN 1
                   ELSE 0
                 END) AS peak_momentum_rank
          FROM post_product_mentions ppm
          JOIN social_posts sp ON ppm.post_id = sp.post_id
          WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
          GROUP BY ppm.product_id
        ),
        forecast_ranked AS (
          SELECT df.product_id,
                 df.region,
                 df.predicted_demand,
                 df.confidence_high,
                 df.social_factor,
                 df.forecast_date,
                 ROW_NUMBER() OVER (
                   PARTITION BY df.product_id
                   ORDER BY df.social_factor DESC, df.predicted_demand DESC, df.forecast_date DESC
                 ) AS rn
          FROM demand_forecasts df
          WHERE df.forecast_date >= (SELECT MAX(forecast_date) FROM demand_forecasts) - 30
        ),
        forecast_context AS (
          SELECT fr.product_id,
                 fr.region AS hot_region,
                 fr.predicted_demand,
                 fr.confidence_high,
                 fr.social_factor,
                 fr.forecast_date
          FROM forecast_ranked fr
          WHERE fr.rn = 1
        ),
        signal_region_ranked AS (
          SELECT ppm.product_id,
                 CASE UPPER(i.city)
                   WHEN 'DALLAS' THEN 'TX'
                   WHEN 'AUSTIN' THEN 'TX'
                   WHEN 'HOUSTON' THEN 'TX'
                   WHEN 'FORT WORTH' THEN 'TX'
                   WHEN 'SAN ANTONIO' THEN 'TX'
                   WHEN 'PHOENIX' THEN 'AZ'
                   WHEN 'SEATTLE' THEN 'WA'
                   WHEN 'CHICAGO' THEN 'IL'
                   WHEN 'ATLANTA' THEN 'GA'
                 END AS hot_region,
                 COUNT(DISTINCT sp.post_id) AS signal_posts,
                 SUM(NVL(sp.views_count, 0)) AS signal_views,
                 SUM(NVL(sp.likes_count, 0) + NVL(sp.shares_count, 0) + NVL(sp.comments_count, 0)) AS signal_engagement,
                 ROUND(AVG(sp.virality_score), 2) AS signal_virality,
                 ROW_NUMBER() OVER (
                   PARTITION BY ppm.product_id
                   ORDER BY COUNT(DISTINCT sp.post_id) DESC, AVG(sp.virality_score) DESC
                 ) AS rn
          FROM post_product_mentions ppm
          JOIN social_posts sp ON ppm.post_id = sp.post_id
          JOIN influencers i ON sp.influencer_id = i.influencer_id
          WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
            AND i.city IS NOT NULL
          GROUP BY ppm.product_id,
                 CASE UPPER(i.city)
                   WHEN 'DALLAS' THEN 'TX'
                   WHEN 'AUSTIN' THEN 'TX'
                   WHEN 'HOUSTON' THEN 'TX'
                   WHEN 'FORT WORTH' THEN 'TX'
                   WHEN 'SAN ANTONIO' THEN 'TX'
                   WHEN 'PHOENIX' THEN 'AZ'
                   WHEN 'SEATTLE' THEN 'WA'
                   WHEN 'CHICAGO' THEN 'IL'
                   WHEN 'ATLANTA' THEN 'GA'
                 END
        ),
        signal_region AS (
          SELECT product_id,
                 hot_region,
                 signal_posts,
                 signal_views,
                 signal_engagement,
                 signal_virality,
                 ROUND(1 + NVL(signal_virality, 0) / 200, 2) AS signal_factor
          FROM signal_region_ranked
          WHERE rn = 1
        ),
        product_inventory_region AS (
          SELECT product_id,
                 state_province AS hot_region
          FROM (
            SELECT i.product_id,
                   fc.state_province,
                   ROW_NUMBER() OVER (
                     PARTITION BY i.product_id
                     ORDER BY (i.quantity_on_hand - i.quantity_reserved) DESC, fc.center_id
                   ) AS rn
            FROM inventory i
            JOIN fulfillment_centers fc ON fc.center_id = i.center_id
            WHERE fc.is_active = 1
              AND fc.state_province IS NOT NULL
          )
          WHERE rn = 1
        ),
        demand_context AS (
          SELECT ctx.product_id,
                 ctx.hot_region,
                 ctx.predicted_demand,
                 ctx.confidence_high,
                 ctx.social_factor,
                 ctx.forecast_date,
                 dr.demand_index,
                 dr.social_density,
                 dr.boundary
          FROM (
            SELECT COALESCE(fc.product_id, sr.product_id) AS product_id,
                   COALESCE(fc.hot_region, sr.hot_region, pir.hot_region) AS hot_region,
                   NVL(fc.predicted_demand,
                     GREATEST(8, ROUND(
                       NVL(sr.signal_posts, 0) * 8
                       + NVL(sr.signal_virality, 0) * 0.22
                       + LEAST(NVL(sr.signal_views, 0) / 12000, 18)
                       + LEAST(NVL(sr.signal_engagement, 0) / 1500, 12)
                     ))
                   ) AS predicted_demand,
                   NVL(fc.confidence_high,
                     GREATEST(12, ROUND(
                       NVL(sr.signal_posts, 0) * 12
                       + NVL(sr.signal_virality, 0) * 0.34
                       + LEAST(NVL(sr.signal_views, 0) / 8000, 26)
                       + LEAST(NVL(sr.signal_engagement, 0) / 1000, 18)
                     ))
                   ) AS confidence_high,
                   NVL(fc.social_factor, NVL(sr.signal_factor, 1)) AS social_factor,
                   fc.forecast_date
            FROM forecast_context fc
            FULL OUTER JOIN signal_region sr ON sr.product_id = fc.product_id
            LEFT JOIN product_inventory_region pir
              ON pir.product_id = COALESCE(fc.product_id, sr.product_id)
          ) ctx
          LEFT JOIN demand_regions dr
            ON UPPER(dr.region_name) LIKE UPPER(ctx.hot_region || ' %')
        ),
        fulfillment_candidates AS (
          SELECT dc.product_id,
                 dc.hot_region,
                 fc.center_id,
                 fc.center_name,
                 fc.city AS center_city,
                 fc.state_province AS center_state,
                 i.quantity_on_hand - i.quantity_reserved AS available_units,
                 fz.zone_type AS service_zone,
                 fz.max_delivery_hrs,
                 CASE
                   WHEN dc.boundary IS NOT NULL AND fc.location IS NOT NULL THEN
                     ROUND(SDO_GEOM.SDO_DISTANCE(
                       SDO_GEOM.SDO_CENTROID(dc.boundary, 0.005),
                       fc.location,
                       0.005,
                       'unit=KM'
                     ), 1)
                 END AS distance_km
          FROM demand_context dc
          JOIN inventory i ON i.product_id = dc.product_id
          JOIN fulfillment_centers fc ON fc.center_id = i.center_id
          LEFT JOIN fulfillment_zones fz ON fz.center_id = fc.center_id
          WHERE fc.is_active = 1
            AND (i.quantity_on_hand - i.quantity_reserved) > 0
        ),
        fulfillment_ranked AS (
          SELECT fc.*,
                 ROW_NUMBER() OVER (
                   PARTITION BY fc.product_id
                   ORDER BY
                     CASE WHEN fc.center_state = fc.hot_region THEN 0 ELSE 1 END,
                     NVL(fc.distance_km, 999999),
                     fc.available_units DESC
                 ) AS rn
          FROM fulfillment_candidates fc
        ),
        regional_inventory_ranked AS (
          SELECT dc.product_id,
                 i.quantity_on_hand - i.quantity_reserved AS available_units,
                 CASE WHEN i.quantity_on_hand <= i.reorder_point THEN 1 ELSE 0 END AS at_risk_site,
                 ROW_NUMBER() OVER (
                   PARTITION BY dc.product_id
                   ORDER BY i.quantity_on_hand - i.quantity_reserved DESC, fc.center_id
                 ) AS rn
          FROM demand_context dc
          JOIN inventory i ON i.product_id = dc.product_id
          JOIN fulfillment_centers fc ON fc.center_id = i.center_id
          WHERE fc.is_active = 1
            AND fc.state_province = dc.hot_region
            AND (i.quantity_on_hand - i.quantity_reserved) > 0
        ),
        regional_inventory AS (
          SELECT product_id,
                 SUM(CASE WHEN rn <= 3 THEN available_units ELSE 0 END) AS regional_available_units,
                 SUM(CASE WHEN rn <= 3 THEN at_risk_site ELSE 0 END) AS at_risk_sites
          FROM regional_inventory_ranked
          GROUP BY product_id
        ),
        product_signal_sources AS (
          SELECT DISTINCT ppm.product_id,
                 sp.influencer_id AS source_influencer_id
          FROM post_product_mentions ppm
          JOIN social_posts sp ON ppm.post_id = sp.post_id
          WHERE sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '7' DAY
            AND sp.influencer_id IS NOT NULL
        ),
        product_graph_edges AS (
          SELECT source_id,
                 reached_id,
                 edge_strength,
                 reached_influence
          FROM GRAPH_TABLE ( influencer_network
            MATCH (src IS influencer) -[edge IS connects_to]-> (reached IS influencer)
            COLUMNS (
              src.influencer_id AS source_id,
              reached.influencer_id AS reached_id,
              edge.strength AS edge_strength,
              reached.influence_score AS reached_influence
            )
          )
        ),
        graph_signal AS (
          SELECT pss.product_id,
                 COUNT(DISTINCT pss.source_influencer_id) AS graph_sources,
                 COUNT(DISTINCT pge.reached_id) AS graph_reach,
                 ROUND(AVG(pge.edge_strength), 3) AS graph_strength,
                 ROUND(MAX(pge.reached_influence), 1) AS graph_influence
          FROM product_signal_sources pss
          LEFT JOIN product_graph_edges pge ON pge.source_id = pss.source_influencer_id
          GROUP BY pss.product_id
        ),
        enriched AS (
          SELECT p.product_id,
                 p.product_name,
                 p.category,
                 p.subcategory,
                 p.unit_price,
                 b.brand_name,
                 b.social_tier,
                 NVL(sr.mention_count, 0) AS mention_count,
                 NVL(sr.total_likes, 0) AS total_likes,
                 NVL(sr.total_shares, 0) AS total_shares,
                 NVL(sr.total_views, 0) AS total_views,
                 NVL(sr.avg_virality, 0) AS avg_virality,
                 CASE NVL(sr.peak_momentum_rank, 0)
                   WHEN 3 THEN 'mega_viral'
                   WHEN 2 THEN 'viral'
                   WHEN 1 THEN 'rising'
                   ELSE 'normal'
                 END AS peak_momentum,
                 COALESCE(dc.hot_region, pir.hot_region) AS hot_region,
                 NVL(dc.predicted_demand, GREATEST(8, ROUND(NVL(sr.mention_count, 0) * 8 + NVL(sr.avg_virality, 0) * 0.22))) AS predicted_demand,
                 NVL(dc.confidence_high, GREATEST(12, ROUND(NVL(sr.mention_count, 0) * 12 + NVL(sr.avg_virality, 0) * 0.34))) AS confidence_high,
                 NVL(dc.social_factor, 1) AS social_factor,
                 NVL(dc.demand_index, 0) AS demand_index,
                 NVL(dc.social_density, 0) AS social_density,
                 fr.center_id AS nearest_center_id,
                 fr.center_name AS nearest_center,
                 fr.center_city,
                 fr.center_state,
                 fr.available_units,
                 fr.distance_km,
                 fr.service_zone,
                 fr.max_delivery_hrs,
                 NVL(ri.regional_available_units, 0) AS regional_available_units,
                 NVL(ri.at_risk_sites, 0) AS at_risk_sites,
                 NVL(gs.graph_sources, 0) AS graph_sources,
                 NVL(gs.graph_reach, 0) AS graph_reach,
                 NVL(gs.graph_strength, 0) AS graph_strength,
                 NVL(gs.graph_influence, 0) AS graph_influence,
                 ${searchMode === 'vector' ? 'vr.semantic_score' : 'CAST(NULL AS NUMBER)'} AS semantic_score,
                 ${searchMode === 'vector' ? 'vr.semantic_rank' : 'CAST(NULL AS NUMBER)'} AS semantic_rank,
                 ${visualMatchRows.length ? 'vm.image_similarity' : 'CAST(NULL AS NUMBER)'} AS image_similarity,
                 ${visualMatchRows.length ? 'vm.image_rank' : 'CAST(NULL AS NUMBER)'} AS image_rank,
                 ${visualMatchRows.length ? 'vm.image_url' : 'CAST(NULL AS VARCHAR2(1000))'} AS image_url,
                 ${visualMatchRows.length ? 'vm.image_filename' : 'CAST(NULL AS VARCHAR2(500))'} AS image_filename
          FROM products p
          JOIN brands b ON p.brand_id = b.brand_id
          LEFT JOIN social_rollup sr ON sr.product_id = p.product_id
          LEFT JOIN demand_context dc ON dc.product_id = p.product_id
          LEFT JOIN product_inventory_region pir ON pir.product_id = p.product_id
          LEFT JOIN fulfillment_ranked fr ON fr.product_id = p.product_id AND fr.rn = 1
          LEFT JOIN regional_inventory ri ON ri.product_id = p.product_id
          LEFT JOIN graph_signal gs ON gs.product_id = p.product_id
          ${vectorJoin}
          ${visualJoin}
          WHERE p.is_active = 1
            AND (sr.product_id IS NOT NULL ${searchMode === 'vector' ? 'OR vr.product_id IS NOT NULL' : ''} ${searchMode === 'image' ? 'OR vm.product_id IS NOT NULL' : ''})
            ${whereExtra}
        )
      SELECT product_id,
             product_name,
             category,
             subcategory,
             unit_price,
             brand_name,
             social_tier,
             mention_count,
             total_likes,
             total_shares,
             total_views,
             avg_virality,
             peak_momentum,
             hot_region,
             predicted_demand,
             confidence_high,
             social_factor,
             demand_index,
             social_density,
             nearest_center_id,
             nearest_center,
             center_city,
             center_state,
             available_units,
             distance_km,
             service_zone,
             max_delivery_hrs,
             regional_available_units,
             at_risk_sites,
             graph_sources,
             graph_reach,
             graph_strength,
             graph_influence,
             semantic_score,
             image_similarity,
             image_url,
             image_filename,
             :searchRegionLabel AS search_region,
             '${searchMode}' AS search_mode,
             CASE
               WHEN at_risk_sites > 0 THEN 'watch'
               WHEN NVL(regional_available_units, 0) < NVL(confidence_high, predicted_demand) THEN 'constrained'
               WHEN NVL(available_units, 0) < NVL(predicted_demand, 0) THEN 'limited'
               ELSE 'ready'
             END AS fulfillment_status,
             ROUND(
               NVL(avg_virality, 0) * 0.45
               + LEAST(NVL(total_views, 0) / 10000, 25)
               + LEAST(NVL(social_factor, 1) * 8, 15)
               + LEAST(NVL(graph_strength, 0) * 10, 10)
               + CASE
                   WHEN at_risk_sites > 0 THEN 12
                   WHEN NVL(regional_available_units, 0) < NVL(confidence_high, predicted_demand) THEN 10
                   WHEN NVL(available_units, 0) < NVL(predicted_demand, 0) THEN 6
                   ELSE 0
                 END,
               1
             ) AS action_score,
             JSON_OBJECT(
               'productId' VALUE product_id,
               'productName' VALUE product_name,
               'demandRegion' VALUE hot_region,
               'predictedDemand' VALUE predicted_demand,
               'socialFactor' VALUE social_factor,
               'nearestFulfillmentSite' VALUE nearest_center,
               'availableUnits' VALUE available_units,
               'regionalAvailableUnits' VALUE regional_available_units,
               'graphReach' VALUE graph_reach,
               'semanticScore' VALUE semantic_score,
               'imageSimilarity' VALUE image_similarity
               RETURNING CLOB
             ) AS watch_document
      FROM enriched
      ORDER BY
        CASE WHEN image_rank IS NULL THEN 999999 ELSE image_rank END,
        CASE WHEN hot_region IS NULL THEN 1 ELSE 0 END,
        CASE WHEN semantic_rank IS NULL THEN 999999 ELSE semantic_rank END,
        action_score DESC,
        avg_virality DESC,
        total_views DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds);

    return result.rows;
}

// GET /api/dashboard/trending-products
// Supports: ?limit=10 &search=<sporting goods product/brand or partner text> &brand=<exact brand or partner name>
router.get('/trending-products', async (req, res) => {
  try {
    const rows = await fetchWatchedProducts({
      limit: req.query.limit,
      search: (req.query.search || '').trim(),
      brand: (req.query.brand || '').trim(),
    });
    res.json(rows);
  } catch (err) {
    console.error('Watched sporting goods products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/watched-image-search
// Upload a competitor product image, match it against PeakGear image embeddings,
// then enrich similar products with watched demand and fulfillment metrics.
router.post('/watched-image-search', webshopSearch.uploadSingleImage, async (req, res) => {
  const file = req.file;
  const limit = Math.min(parseInt(req.body?.limit, 10) || 25, 50);

  if (!file) {
    return res.status(400).json({ error: 'Upload a JPG or PNG image using field name "file".' });
  }

  let connection;
  try {
    const index = await webshopSearch.buildImageIndex();
    const vector = await webshopSearch.embedWithPrivateAI(
      webshopSearch.IMAGE_MODEL_ID,
      file.buffer.toString('base64'),
      { convertImages: true },
    );

    connection = await db.getConnection();
    const visualMatches = await webshopSearch.searchProductsByImageVector(
      connection,
      vector,
      Math.min(Math.max(limit * 3, 30), 75),
    );
    const rows = await fetchWatchedProducts({
      limit,
      visualMatches,
    });

    res.json({
      mode: 'competitor-image',
      upload: {
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
      },
      models: {
        image: webshopSearch.IMAGE_MODEL_ID,
      },
      index,
      count: rows.length,
      results: rows,
    });
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    console.error('Watched products image search error:', err);
    res.status(status).json({ error: err.message });
  } finally {
    if (connection) {
      try { await connection.close(); } catch { /* ignore */ }
    }
  }
});

// GET /api/dashboard/social-velocity?hours=48
router.get('/social-velocity', async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(req.query.hours) || 48, 1), 8760); // 1h–1yr

    // Pick truncation granularity based on range so we get ~20-60 buckets
    let truncFmt, labelFmt;
    if (hours <= 6) {
      // Per-hour buckets, show HH:MI
      truncFmt = "'HH'";
      labelFmt = "'YYYY-MM-DD HH24:MI'";
    } else if (hours <= 168) {
      // ≤7 days → hourly buckets
      truncFmt = "'HH'";
      labelFmt = "'YYYY-MM-DD HH24:MI'";
    } else if (hours <= 1440) {
      // ≤60 days → daily buckets
      truncFmt = "'DD'";
      labelFmt = "'YYYY-MM-DD'";
    } else {
      // >60 days → weekly buckets
      truncFmt = "'IW'";
      labelFmt = "'YYYY-MM-DD'";
    }

    const result = await db.execute(`
      SELECT
        TO_CHAR(TRUNC(posted_at, ${truncFmt}), ${labelFmt}) AS hour_bucket,
        COUNT(*) AS post_count,
        SUM(likes_count) AS total_likes,
        SUM(shares_count) AS total_shares,
        ROUND(AVG(sentiment_score), 3) AS avg_sentiment,
        COUNT(CASE WHEN momentum_flag IN ('viral','mega_viral') THEN 1 END) AS viral_count
      FROM social_posts
      WHERE posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '${hours}' HOUR
      GROUP BY TRUNC(posted_at, ${truncFmt})
      ORDER BY hour_bucket
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Signal velocity error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/revenue-by-category
router.get('/revenue-by-category', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT p.category,
             COUNT(DISTINCT o.order_id) AS order_count,
             SUM(oi.quantity * oi.unit_price) AS total_revenue,
             COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS social_driven_orders
      FROM order_items oi
      JOIN products p ON oi.product_id = p.product_id
      JOIN orders o ON oi.order_id = o.order_id
      WHERE o.created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Revenue by category error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/demand-map
router.get('/demand-map', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT c.city, c.state_province,
             ROUND(AVG(c.latitude), 4) AS lat,
             ROUND(AVG(c.longitude), 4) AS lon,
             COUNT(DISTINCT o.order_id) AS order_count,
             SUM(o.order_total) AS total_revenue,
             COUNT(DISTINCT CASE WHEN o.social_source_id IS NOT NULL THEN o.order_id END) AS social_orders
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      WHERE o.created_at >= (SELECT MAX(created_at) FROM orders) - INTERVAL '30' DAY
        AND c.latitude IS NOT NULL
      GROUP BY c.city, c.state_province
      HAVING COUNT(DISTINCT o.order_id) >= 3
      ORDER BY order_count DESC
      FETCH FIRST 50 ROWS ONLY
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Demand map error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/inmemory — In-Memory Column Store segment stats
// Uses USER_TABLES + USER_SEGMENTS (no DBA/V$ grants needed)
router.get('/inmemory', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT t.table_name                                       AS table_name,
             t.num_rows                                         AS row_count,
             NVL(s.bytes, 0)                                    AS disk_bytes,
             t.inmemory_compression                             AS compression,
             t.inmemory_priority                                AS priority
      FROM   user_tables   t
      LEFT JOIN user_segments s ON s.segment_name = t.table_name
                               AND s.segment_type = 'TABLE'
      WHERE  t.inmemory = 'ENABLED'
      ORDER  BY s.bytes DESC NULLS LAST
    `);

    /* Try to get actual IM sizes from V$IM_SEGMENTS (needs SELECT grant).
       If it fails, fall back to estimates based on typical QUERY HIGH ratios. */
    let imStats = {};
    try {
      const im = await db.execute(`
        SELECT segment_name, inmemory_size, bytes, populate_status
        FROM   v$im_segments
        WHERE  segment_type = 'TABLE'
      `);
      for (const r of im.rows) {
        imStats[r.SEGMENT_NAME] = {
          im_bytes: r.INMEMORY_SIZE,
          disk_bytes: r.BYTES,
          status: r.POPULATE_STATUS
        };
      }
    } catch (_) { /* V$ not granted — use fallback */ }

    const rows = result.rows.map(r => {
      const im = imStats[r.TABLE_NAME];
      const diskBytes = im?.disk_bytes || r.DISK_BYTES || 0;
      const imBytes   = im?.im_bytes   || Math.round(diskBytes * 0.25); // ~75% compression typical for QUERY HIGH
      const pct       = diskBytes > 0 ? Math.round((1 - imBytes / diskBytes) * 100) : 0;
      return {
        TABLE_NAME:      r.TABLE_NAME,
        ROW_COUNT:       r.ROW_COUNT,
        DISK_BYTES:      diskBytes,
        IM_BYTES:        imBytes,
        COMPRESSION_PCT: pct,
        COMPRESSION:     r.COMPRESSION,
        PRIORITY:        r.PRIORITY,
        STATUS:          im?.status || 'COMPLETED'
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('In-Memory stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
