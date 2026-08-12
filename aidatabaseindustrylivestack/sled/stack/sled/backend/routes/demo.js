/**
 * Demo Data Population API - SSE-streamed progress for seeding all tables
 *
 * GET /api/demo/start   - Stream progress events as data is verified/seeded
 * GET /api/demo/status  - Return current table counts
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireGlobalAccess } = require('../lib/accessControl');

// ── Helper: get count from a table ──────────────────────────────────────────
async function tableCount(table) {
  const result = await db.execute(`SELECT COUNT(*) AS cnt FROM ${table}`);
  return result.rows[0].CNT;
}

// ── GET /api/demo/status ────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM brands)                AS brands,
        (SELECT COUNT(*) FROM products)              AS products,
        (SELECT COUNT(*) FROM influencers)            AS influencers,
        (SELECT COUNT(*) FROM customers)              AS customers,
        (SELECT COUNT(*) FROM social_posts)           AS social_posts,
        (SELECT COUNT(*) FROM orders)                 AS orders,
        (SELECT COUNT(*) FROM fulfillment_centers)    AS fulfillment_centers,
        (SELECT COUNT(*) FROM fulfillment_zones)      AS fulfillment_zones,
        (SELECT COUNT(*) FROM demand_regions)         AS demand_regions,
        (SELECT COUNT(*) FROM demand_forecasts)       AS demand_forecasts,
        (SELECT COUNT(*) FROM product_embeddings)     AS product_embeddings,
        (SELECT COUNT(*) FROM post_embeddings)        AS post_embeddings,
        (SELECT COUNT(*) FROM semantic_matches)       AS semantic_matches,
        (SELECT COUNT(*) FROM influencer_connections) AS graph_edges,
        (SELECT COUNT(*) FROM brand_influencer_links) AS graph_links
      FROM dual
    `);

    const row = result.rows[0];
    res.json({
      public_programs:              row.BRANDS,
      public_services:              row.PRODUCTS,
      community_partners:           row.INFLUENCERS,
      resident_profiles:            row.CUSTOMERS,
      resident_signals:             row.SOCIAL_POSTS,
      service_requests:             row.ORDERS,
      service_access_centers:       row.FULFILLMENT_CENTERS,
      service_access_zones:         row.FULFILLMENT_ZONES,
      service_demand_regions:       row.DEMAND_REGIONS,
      service_demand_forecasts:     row.DEMAND_FORECASTS,
      public_service_vectors:       row.PRODUCT_EMBEDDINGS,
      resident_signal_vectors:      row.POST_EMBEDDINGS,
      semantic_service_matches:     row.SEMANTIC_MATCHES,
      community_network_nodes:      row.GRAPH_EDGES + row.GRAPH_LINKS,
      community_network_edges:      row.GRAPH_EDGES,
      community_program_links:      row.GRAPH_LINKS,
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/demo/start - SSE streamed data population ──────────────────────
router.get('/start', requireGlobalAccess, async (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

  // Detect client disconnect
  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    // ── 1. RESET / CHECK (0-5%) ───────────────────────────────────────────
    send({ step: 'reset', status: 'running', message: 'Checking existing data...', progress: 0 });

    const counts = {};
    const tables = [
      'brands', 'products', 'influencers', 'customers', 'social_posts',
      'orders', 'order_items', 'inventory', 'post_product_mentions',
      'influencer_connections', 'brand_influencer_links',
      'fulfillment_zones', 'demand_regions', 'demand_forecasts',
      'product_embeddings', 'post_embeddings', 'semantic_matches'
    ];

    for (const t of tables) {
      if (aborted) return;
      counts[t] = await tableCount(t);
    }

    send({ step: 'reset', status: 'done', message: 'Data audit complete', progress: 5, counts });

    // ── 2. BRANDS (5-10%) ─────────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'brands', status: 'running', message: 'Loading 12 public programs...', progress: 5 });

    if (counts.brands > 0) {
      send({ step: 'brands', status: 'skipped', message: `${counts.brands} public programs already loaded`, progress: 10, count: counts.brands });
    } else {
      // Inline public program inserts - same data as load_all_data.sql
      const brandInserts = [
        "('CivicBridge Network','civicbridge','Integrated Services','Denver',39.7392,-104.9903,2012,325000000,'premium')",
        "('VitalPath Service Counters','vitalpath','Constituent Services','Aurora',39.7294,-104.8319,2008,210000000,'premium')",
        "('PulsePoint Infrastructure','pulsepoint','Infrastructure','Colorado Springs',38.8339,-104.8214,2015,185000000,'premium')",
        "('ClearMind Housing and Human Services','clearmind','Housing and Human Services','Boulder',40.0150,-105.2705,2019,76000000,'standard')",
        "('OrthoMotion Rehab','orthomotion','Transportation','Fort Collins',40.5853,-105.0844,2016,98000000,'standard')",
        "('FieldWorks Connect','fieldworks','Field Services','Pueblo',38.2544,-104.6091,2018,124000000,'standard')",
        "('PublicWorks Supply','pwsupply','Public Works Materials','Grand Junction',39.0639,-108.5506,2014,260000000,'premium')",
        "('WellNest Youth Services','wellnest','Youth Services','Greeley',40.4233,-104.7091,2020,54000000,'emerging')",
        "('SilverLine Senior and Veteran Services','silverline','Senior and Veteran Services','Lakewood',39.7047,-105.0814,2011,148000000,'standard')",
        "('OncoGuide Services','oncoguide','Special Programs','Durango',37.2753,-107.8801,2017,132000000,'premium')",
        "('WaterFlow Services','waterflow','Water Services','Loveland',40.3978,-105.0750,2013,175000000,'premium')",
        "('CommunityFirst Services','womenfirst','Community Services','Alamosa',37.4694,-105.8700,2018,84000000,'standard')",
      ];

      for (const vals of brandInserts) {
        if (aborted) return;
        await db.execute(`
          INSERT INTO brands (brand_name,brand_slug,brand_category,headquarters_city,
            headquarters_lat,headquarters_lon,founded_year,annual_revenue,social_tier)
          VALUES ${vals}
        `);
      }

      const brandCount = await tableCount('brands');
      send({ step: 'brands', status: 'done', message: `${brandCount} public programs loaded`, progress: 10, count: brandCount });
    }

    // ── 3. PRODUCTS (10-18%) ──────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'products', status: 'running', message: 'Checking public services...', progress: 10 });

    if (counts.products > 0) {
      send({ step: 'products', status: 'skipped', message: `${counts.products} public services already loaded`, progress: 18, count: counts.products });
    } else {
      // Products are loaded via PL/SQL in load_products.sql - run inline
      // For the API we trigger the same pattern: use the load script via execute
      send({ step: 'products', status: 'error', message: 'Public services require SQL*Plus load (run load_products.sql). Skipping.', progress: 18, count: 0 });
    }

    // ── 4. INFLUENCERS (18-25%) ───────────────────────────────────────────
    if (aborted) return;
    send({ step: 'influencers', status: 'running', message: 'Checking community partners...', progress: 18 });

    const influencerCount = counts.influencers || await tableCount('influencers');
    if (influencerCount > 0) {
      send({ step: 'influencers', status: 'skipped', message: `${influencerCount} community partners already loaded`, progress: 25, count: influencerCount });
    } else {
      send({ step: 'influencers', status: 'error', message: 'Community partners require SQL*Plus load (run load_influencers.sql). Skipping.', progress: 25, count: 0 });
    }

    // ── 5. CUSTOMERS (25-33%) ─────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'customers', status: 'running', message: 'Checking resident profiles...', progress: 25 });

    const customerCount = counts.customers || await tableCount('customers');
    if (customerCount > 0) {
      send({ step: 'customers', status: 'skipped', message: `${customerCount} resident profiles already loaded`, progress: 33, count: customerCount });
    } else {
      send({ step: 'customers', status: 'error', message: 'Resident profiles require SQL*Plus load (run load_customers.sql). Skipping.', progress: 33, count: 0 });
    }

    // ── 6. SOCIAL POSTS (33-42%) ──────────────────────────────────────────
    if (aborted) return;
    send({ step: 'social_posts', status: 'running', message: 'Checking resident signals...', progress: 33 });

    const postCount = counts.social_posts || await tableCount('social_posts');
    if (postCount > 0) {
      send({ step: 'social_posts', status: 'skipped', message: `${postCount} resident signals already loaded`, progress: 42, count: postCount });
    } else {
      send({ step: 'social_posts', status: 'error', message: 'Resident signals require SQL*Plus load (run load_social_posts.sql). Skipping.', progress: 42, count: 0 });
    }

    // ── 7. ORDERS (42-50%) ────────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'orders', status: 'running', message: 'Checking service requests...', progress: 42 });

    const orderCount = counts.orders || await tableCount('orders');
    if (orderCount > 0) {
      send({ step: 'orders', status: 'skipped', message: `${orderCount} service requests already loaded`, progress: 50, count: orderCount });
    } else {
      send({ step: 'orders', status: 'error', message: 'Service requests require SQL*Plus load (run load_orders.sql). Skipping.', progress: 50, count: 0 });
    }

    // ── 8. GRAPH DATA (50-56%) ────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'graph', status: 'running', message: 'Checking graph data...', progress: 50 });

    const edgeCount = counts.influencer_connections || await tableCount('influencer_connections');
    const linkCount = counts.brand_influencer_links || await tableCount('brand_influencer_links');
    if (edgeCount > 0) {
      send({ step: 'graph', status: 'skipped', message: `${edgeCount} workflow edges, ${linkCount} public program links already loaded`, progress: 56, count: edgeCount });
    } else {
      send({ step: 'graph', status: 'error', message: 'Graph data requires SQL*Plus load (run load_graph_data.sql). Skipping.', progress: 56, count: 0 });
    }

    // ── 9. SPATIAL CENTERS (56-62%) ───────────────────────────────────────
    if (aborted) return;
    send({ step: 'spatial_centers', status: 'running', message: 'Populating service access center locations...', progress: 56 });

    try {
      const nullLocCount = await db.execute(
        `SELECT COUNT(*) AS cnt FROM fulfillment_centers WHERE location IS NULL AND latitude IS NOT NULL`
      );
      const needsUpdate = nullLocCount.rows[0].CNT;

      if (needsUpdate > 0) {
        await db.execute(`
          UPDATE fulfillment_centers
          SET location = SDO_GEOMETRY(2001, 4326, SDO_POINT_TYPE(longitude, latitude, NULL), NULL, NULL)
          WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
        `);
        send({ step: 'spatial_centers', status: 'done', message: `${needsUpdate} center locations populated`, progress: 62, count: needsUpdate });
      } else {
        const centerCount = await tableCount('fulfillment_centers');
        send({ step: 'spatial_centers', status: 'skipped', message: `${centerCount} centers already have locations`, progress: 62, count: centerCount });
      }
    } catch (err) {
      send({ step: 'spatial_centers', status: 'error', message: err.message, progress: 62 });
    }

    // ── 10. SPATIAL ZONES (62-70%) ────────────────────────────────────────
    if (aborted) return;
    send({ step: 'spatial_zones', status: 'running', message: 'Generating fulfillment zone polygons...', progress: 62 });

    try {
      const zoneCount = counts.fulfillment_zones || await tableCount('fulfillment_zones');
      if (zoneCount > 0) {
        send({ step: 'spatial_zones', status: 'skipped', message: `${zoneCount} fulfillment zones already exist`, progress: 70, count: zoneCount });
      } else {
        // Generate zones: 4 tiers x active centers
        const zoneTiers = [
          { type: 'express',   meters: 80000,  hrs: 8  },
          { type: 'overnight', meters: 160000, hrs: 16 },
          { type: 'standard',  meters: 250000, hrs: 24 },
          { type: 'economy',   meters: 500000, hrs: 72 },
        ];

        let totalInserted = 0;
        for (const tier of zoneTiers) {
          if (aborted) return;
          const insertResult = await db.execute(`
            INSERT INTO fulfillment_zones (center_id, zone_type, max_delivery_hrs, zone_boundary)
            SELECT center_id, :zoneType, :maxHrs,
              SDO_GEOM.SDO_BUFFER(location, :meters, 1, 'unit=METER')
            FROM fulfillment_centers
            WHERE is_active = 1 AND location IS NOT NULL
          `, { zoneType: tier.type, maxHrs: tier.hrs, meters: tier.meters });
          totalInserted += insertResult.rowsAffected || 0;
        }

        send({ step: 'spatial_zones', status: 'done', message: `${totalInserted} fulfillment zones created`, progress: 70, count: totalInserted });
      }
    } catch (err) {
      send({ step: 'spatial_zones', status: 'error', message: err.message, progress: 70 });
    }

    // ── 11. DEMAND REGIONS (70-75%) ───────────────────────────────────────
    if (aborted) return;
    send({ step: 'demand_regions', status: 'running', message: 'Checking demand regions...', progress: 70 });

    const regionCount = counts.demand_regions || await tableCount('demand_regions');
    if (regionCount > 0) {
      send({ step: 'demand_regions', status: 'skipped', message: `${regionCount} demand regions already loaded`, progress: 75, count: regionCount });
    } else {
      send({ step: 'demand_regions', status: 'error', message: 'Demand regions require SQL*Plus load (run load_demand_regions.sql). Skipping.', progress: 75, count: 0 });
    }

    // ── 12. DEMAND FORECASTS (75-80%) ─────────────────────────────────────
    if (aborted) return;
    send({ step: 'demand_forecasts', status: 'running', message: 'Checking demand forecasts...', progress: 75 });

    const forecastCount = counts.demand_forecasts || await tableCount('demand_forecasts');
    if (forecastCount > 0) {
      send({ step: 'demand_forecasts', status: 'skipped', message: `${forecastCount} demand forecasts already loaded`, progress: 80, count: forecastCount });
    } else {
      send({ step: 'demand_forecasts', status: 'error', message: 'Demand forecasts require SQL*Plus load (run load_demand_forecasts.sql). Skipping.', progress: 80, count: 0 });
    }

    // ── 13. PRODUCT EMBEDDINGS (80-87%) ───────────────────────────────────
    if (aborted) return;
    send({ step: 'product_embeddings', status: 'running', message: 'Generating service vectors...', progress: 80 });

    try {
      const prodEmbedCount = counts.product_embeddings || await tableCount('product_embeddings');
      const productTotal = await tableCount('products');

      if (prodEmbedCount >= productTotal && productTotal > 0) {
        send({ step: 'product_embeddings', status: 'skipped', message: `${prodEmbedCount} service vectors already exist`, progress: 87, count: prodEmbedCount });
      } else if (productTotal === 0) {
        send({ step: 'product_embeddings', status: 'skipped', message: 'No public services to embed', progress: 87, count: 0 });
      } else {
        const embResult = await db.execute(`
          INSERT INTO product_embeddings (product_id, embedding_text, embedding)
          SELECT p.product_id,
                 p.product_name || ' ' || p.category || ' ' || NVL(p.description, '') || ' ' || b.brand_name,
                 VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING
                   p.product_name || ' ' || p.category || ' ' || NVL(p.description, '') || ' ' || b.brand_name AS DATA)
          FROM products p
          JOIN brands b ON p.brand_id = b.brand_id
          WHERE NOT EXISTS (
            SELECT 1 FROM product_embeddings pe WHERE pe.product_id = p.product_id
          )
        `);

        const newCount = await tableCount('product_embeddings');
        send({ step: 'product_embeddings', status: 'done', message: `${embResult.rowsAffected || 0} service vectors generated`, progress: 87, count: newCount });
      }
    } catch (err) {
      send({ step: 'product_embeddings', status: 'error', message: err.message, progress: 87 });
    }

    // ── 14. POST EMBEDDINGS (87-94%) ──────────────────────────────────────
    if (aborted) return;
    send({ step: 'post_embeddings', status: 'running', message: 'Generating resident signal vectors...', progress: 87 });

    try {
      const postEmbedCount = counts.post_embeddings || await tableCount('post_embeddings');
      const totalPosts = await tableCount('social_posts');

      if (postEmbedCount >= totalPosts && totalPosts > 0) {
        send({ step: 'post_embeddings', status: 'skipped', message: `${postEmbedCount} resident signal vectors already exist`, progress: 94, count: postEmbedCount });
      } else if (totalPosts === 0) {
        send({ step: 'post_embeddings', status: 'skipped', message: 'No resident signals to embed', progress: 94, count: 0 });
      } else {
        let totalInserted = 0;
        let batchNum = 0;

        // Process in batches of 500
        while (!aborted) {
          batchNum++;
          const batchResult = await db.execute(`
            INSERT INTO post_embeddings (post_id, embedding_text, embedding)
            SELECT post_id, SUBSTR(post_text, 1, 500),
                   VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING SUBSTR(post_text, 1, 500) AS DATA)
            FROM social_posts sp
            WHERE NOT EXISTS (
              SELECT 1 FROM post_embeddings pe WHERE pe.post_id = sp.post_id
            )
            AND ROWNUM <= 500
          `);

          const inserted = batchResult.rowsAffected || 0;
          totalInserted += inserted;

          if (inserted === 0) break;

          // Calculate progress within 87-94% range
          const currentEmbed = await tableCount('post_embeddings');
          const pct = Math.min(94, 87 + Math.round((currentEmbed / totalPosts) * 7));
          send({ step: 'post_embeddings', status: 'running', message: `Batch ${batchNum}: ${totalInserted} resident signal vectors generated (${currentEmbed}/${totalPosts})...`, progress: pct, count: currentEmbed });

          if (inserted < 500) break;
        }

        const finalPostEmbeds = await tableCount('post_embeddings');
        send({ step: 'post_embeddings', status: 'done', message: `${totalInserted} resident signal vectors generated`, progress: 94, count: finalPostEmbeds });
      }
    } catch (err) {
      send({ step: 'post_embeddings', status: 'error', message: err.message, progress: 94 });
    }

    // ── 15. SEMANTIC MATCHES (94-97%) ─────────────────────────────────────
    if (aborted) return;
    send({ step: 'semantic_matches', status: 'running', message: 'Computing semantic matches for priority resident signals...', progress: 94 });

    try {
      const matchCount = counts.semantic_matches || await tableCount('semantic_matches');

      if (matchCount > 0) {
        send({ step: 'semantic_matches', status: 'skipped', message: `${matchCount} semantic matches already exist`, progress: 97, count: matchCount });
      } else {
        // Find viral/mega_viral posts that have embeddings, match to top-3 products
        const matchResult = await db.execute(`
          INSERT INTO semantic_matches (post_id, product_id, similarity_score, match_rank, match_method)
          SELECT post_id, product_id, similarity_score, match_rank, 'vector'
          FROM (
            SELECT pe.post_id,
                   pre.product_id,
                   ROUND(1 - VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE), 5) AS similarity_score,
                   ROW_NUMBER() OVER (PARTITION BY pe.post_id
                     ORDER BY VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE)) AS match_rank
            FROM post_embeddings pe
            JOIN social_posts sp ON pe.post_id = sp.post_id
            CROSS JOIN product_embeddings pre
            WHERE sp.momentum_flag IN ('viral', 'mega_viral')
              AND NOT EXISTS (
                SELECT 1 FROM semantic_matches sm WHERE sm.post_id = pe.post_id
              )
          )
          WHERE match_rank <= 3
        `);

        const newMatchCount = await tableCount('semantic_matches');
        send({ step: 'semantic_matches', status: 'done', message: `${matchResult.rowsAffected || 0} semantic matches computed`, progress: 97, count: newMatchCount });
      }
    } catch (err) {
      send({ step: 'semantic_matches', status: 'error', message: err.message, progress: 97 });
    }

    // ── 16. COMPLETE (100%) ───────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'complete', status: 'running', message: 'Running final verification...', progress: 97 });

    // Collect final counts
    const finalResult = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM brands)                AS brands,
        (SELECT COUNT(*) FROM products)              AS products,
        (SELECT COUNT(*) FROM influencers)            AS influencers,
        (SELECT COUNT(*) FROM customers)              AS customers,
        (SELECT COUNT(*) FROM social_posts)           AS social_posts,
        (SELECT COUNT(*) FROM orders)                 AS orders,
        (SELECT COUNT(*) FROM fulfillment_centers)    AS fulfillment_centers,
        (SELECT COUNT(*) FROM fulfillment_zones)      AS fulfillment_zones,
        (SELECT COUNT(*) FROM demand_regions)         AS demand_regions,
        (SELECT COUNT(*) FROM demand_forecasts)       AS demand_forecasts,
        (SELECT COUNT(*) FROM product_embeddings)     AS product_embeddings,
        (SELECT COUNT(*) FROM post_embeddings)        AS post_embeddings,
        (SELECT COUNT(*) FROM semantic_matches)       AS semantic_matches,
        (SELECT COUNT(*) FROM influencer_connections) AS graph_edges,
        (SELECT COUNT(*) FROM brand_influencer_links) AS graph_links
      FROM dual
    `);

    send({
      step: 'complete',
      status: 'done',
      message: 'Demo data population complete',
      progress: 100,
      counts: finalResult.rows[0]
    });

    res.end();

  } catch (err) {
    console.error('Demo start error:', err);
    send({ step: 'error', status: 'error', message: err.message, progress: -1 });
    res.end();
  }
});

module.exports = router;
