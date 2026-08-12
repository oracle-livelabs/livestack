/**
 * Demo Data Population API — SSE-streamed progress for seeding all tables
 *
 * GET /api/demo/start   — Stream progress events as data is verified/seeded
 * GET /api/demo/status  — Return current table counts
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

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
        (SELECT COUNT(*) FROM signal_embeddings)        AS signal_embeddings,
        (SELECT COUNT(*) FROM semantic_matches)       AS semantic_matches,
        (SELECT COUNT(*) FROM influencer_connections) AS graph_edges,
        (SELECT COUNT(*) FROM brand_influencer_links) AS graph_links
      FROM dual
    `);

    const row = result.rows[0];
    res.json({
      brands:              row.BRANDS,
      products:            row.PRODUCTS,
      influencers:         row.INFLUENCERS,
      customers:           row.CUSTOMERS,
      social_posts:        row.SOCIAL_POSTS,
      orders:              row.ORDERS,
      fulfillment_centers: row.FULFILLMENT_CENTERS,
      fulfillment_zones:   row.FULFILLMENT_ZONES,
      demand_regions:      row.DEMAND_REGIONS,
      demand_forecasts:    row.DEMAND_FORECASTS,
      product_embeddings:  row.PRODUCT_EMBEDDINGS,
      signal_embeddings:     row.SIGNAL_EMBEDDINGS,
      semantic_matches:    row.SEMANTIC_MATCHES,
      graph_nodes:         row.GRAPH_EDGES + row.GRAPH_LINKS,
      graph_edges:         row.GRAPH_EDGES,
      graph_links:         row.GRAPH_LINKS,
    });
  } catch (err) {
    console.error('Demo status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/demo/start — SSE streamed data population ──────────────────────
router.get('/start', async (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

  // Detect customer disconnect
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
      'product_embeddings', 'signal_embeddings', 'semantic_matches'
    ];

    for (const t of tables) {
      if (aborted) return;
      counts[t] = await tableCount(t);
    }

    send({ step: 'reset', status: 'done', message: 'Data audit complete', progress: 5, counts });

    // ── 2. BRANDS (5-10%) ─────────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'brands', status: 'running', message: 'Loading 50 PeakGear brands and partners...', progress: 5 });

    if (counts.brands > 0) {
      send({ step: 'brands', status: 'skipped', message: `${counts.brands} brands and partners already loaded`, progress: 10, count: counts.brands });
    } else {
      // Inline PeakGear brand and partner inserts — same data as load_all_data.sql
      const brandInserts = [
        "('PeakGear Core','peakgearcore','Retail Sporting Goods','Denver',39.7392,-104.9903,1998,245000000,'premium')",
        "('SummitTrail Outfitters','summittrail','Outdoor Gear','Seattle',47.6062,-122.3321,2004,186000000,'premium')",
        "('RidgeRunner Performance','ridgerunner','Running and Trail','Portland',45.5152,-122.6784,1987,132000000,'premium')",
        "('VelocityFit Devices','velocityfit','Fitness Devices','San Jose',37.3382,-121.8863,2012,221000000,'luxury')",
        "('AlpineForge Gear','alpineforge','Climbing and Snow','Salt Lake City',40.7608,-111.891,2001,98000000,'standard')",
        "('Trailhead Team Sales','trailheadteams','B2B Partnerships','Chicago',41.8781,-87.6298,1979,154000000,'premium')",
        "('GearPay Commerce','gearpay','E-Commerce','Austin',30.2672,-97.7431,2016,91000000,'premium')",
        "('PackGuard Returns Audit','packguard','Returns and Safety','Boston',42.3601,-71.0589,2011,43000000,'standard')",
        "('UrbanCourt Sports','urbancourt','Team Sports','Charlotte',35.2271,-80.8431,1968,275000000,'luxury')",
        "('EcoPeak Active','ecopeak','Sustainable Activewear','Boulder',40.015,-105.2705,2018,39000000,'emerging')",
        "('LoyaltyPeak Offers','loyaltypeak','Loyalty and Offers','Raleigh',35.7796,-78.6382,2007,76000000,'standard')",
        "('Catalyst Safety Gear','catalystsafety','Protective Equipment','Tulsa',36.154,-95.9928,1996,117000000,'premium')",
        "('NorthStar Outdoor Advisors','northstaroutdoor','Outdoor Advisory','Minneapolis',44.9778,-93.265,2005,52000000,'standard')",
        "('GulfRun Supply','gulfrun','Supply Planning','Houston',29.7604,-95.3698,1974,203000000,'premium')",
        "('Midwest Pickup Network','midwestpickup','Store Pickup','Indianapolis',39.7684,-86.1581,1989,88000000,'standard')",
        "('Pacific Commerce Network','pacificcommerce','E-Commerce','Los Angeles',34.0522,-118.2437,1994,143000000,'premium')",
        "('ReturnSure Labs','returnsure','Returns Audit','San Diego',32.7157,-117.1611,2012,69000000,'standard')",
        "('RouteOne Fulfillment','routeonefulfillment','Store Fulfillment','Memphis',35.1495,-90.049,2009,58000000,'standard')",
        "('Waterline Outdoor','waterlineoutdoor','Water Sports','Milwaukee',43.0389,-87.9065,2003,74000000,'standard')",
        "('RecoveryFit Wellness','recoveryfit','Recovery and Wellness','Scottsdale',33.4942,-111.9261,2015,46000000,'emerging')",
        "('ElectraRide Devices','electraride','Connected Bikes','Phoenix',33.4484,-112.074,2019,34000000,'emerging')",
        "('ReCycle Outdoor Exchange','recycleoutdoor','Circular Commerce','Seattle',47.6062,-122.3321,2021,21000000,'emerging')",
        "('DemandDesk Analytics','demanddesk','Retail Analytics','New York',40.7128,-74.006,2014,18000000,'emerging')",
        "('HealthPeak Wearables','healthpeak','Fitness Wearables','Philadelphia',39.9526,-75.1652,1999,112000000,'premium')",
        "('CleanTrail Apparel','cleantrail','Activewear','Cincinnati',39.1031,-84.512,2008,65000000,'standard')",
        "('BridgeLine B2B Gear','bridgelineb2b','B2B Partnerships','Atlanta',33.749,-84.388,1991,126000000,'premium')",
        "('StockGuard Advisors','stockguard','Inventory Intelligence','Dallas',32.7767,-96.797,2013,47000000,'standard')",
        "('FinePoint Digital','finepointdigital','Digital Commerce','Raleigh',35.7796,-78.6382,2006,82000000,'standard')",
        "('Portside Outdoor Supply','portsideoutdoor','Outdoor Supply','Savannah',32.0809,-81.0912,1985,157000000,'premium')",
        "('AltitudeYield Gear','altitudeyield','Premium Outdoor Gear','Kansas City',39.0997,-94.5786,1997,93000000,'standard')",
        "('PurePack Travel','purepack','Packs and Travel','St. Louis',38.627,-90.1994,1982,138000000,'premium')",
        "('SiliconFit Labs','siliconfit','Fitness Technology','Akron',41.0814,-81.519,2002,71000000,'standard')",
        "('CarbonActive Outdoor','carbonactive','Sustainable Outdoor','Pittsburgh',40.4406,-79.9959,1978,99000000,'standard')",
        "('ReturnGuard Operations','returnguard','Returns Operations','Tampa',27.9506,-82.4572,1995,61000000,'standard')",
        "('GearVault Product Data','gearvault','Product Data','Baltimore',39.2904,-76.6122,2000,55000000,'standard')",
        "('Coastal Perimeter Surf','coastalperimeter','Surf and Water','Wilmington',34.2257,-77.9447,1993,104000000,'premium')",
        "('CivicSure Team Sports','civicsure','Team Sports','Nashville',36.1627,-86.7816,2006,57000000,'standard')",
        "('IPA Direct Equipment','ipadirect','Equipment Leasing','San Antonio',29.4241,-98.4936,1990,118000000,'premium')",
        "('ApexOne Outdoors','apexoneoutdoors','Outdoor Performance','Louisville',38.2527,-85.7585,2004,67000000,'standard')",
        "('Propel Performance','propelperformance','Performance Training','Omaha',41.2565,-95.9345,1988,149000000,'premium')",
        "('Continuity Supply Ops','continuitysupply','Supply Continuity','New Orleans',29.9511,-90.0715,2001,59000000,'standard')",
        "('BatteryStreet Fitness Tech','batterystreet','Fitness Technology','Austin',30.2672,-97.7431,2020,26000000,'emerging')",
        "('TrendWatch Market Signals','trendwatch','Market Intelligence','Washington',38.9072,-77.0369,2017,31000000,'emerging')",
        "('Safety Updates Desk','safetyupdates','Product Safety','Washington',38.9072,-77.0369,2010,44000000,'standard')",
        "('MarketPulse Sports Signals','marketpulse','Market Data','Long Beach',33.7701,-118.1937,2018,29000000,'emerging')",
        "('StoreOps','storeops','Store Operations','Las Vegas',36.1699,-115.1398,2012,51000000,'standard')",
        "('AssortmentDesk','assortmentdesk','Assortment Signals','Cleveland',41.4993,-81.6944,2016,37000000,'emerging')",
        "('LedgerGrade Product Data','ledgergrade','Product Data Services','Salt Lake City',40.7608,-111.891,2009,48000000,'standard')",
        "('Specialty Gear Exchange','specialtygear','Marketplace Pricing','Miami',25.7617,-80.1918,2015,63000000,'standard')",
        "('NorthStar Pickup','northstarpickup','Store Pickup','Fargo',46.8772,-96.7898,2008,54000000,'standard')",
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
      send({ step: 'brands', status: 'done', message: `${brandCount} brands and partners loaded`, progress: 10, count: brandCount });
    }

    // ── 3. PRODUCTS (10-18%) ──────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'products', status: 'running', message: 'Checking PeakGear products...', progress: 10 });

    if (counts.products > 0) {
      send({ step: 'products', status: 'skipped', message: `${counts.products} sporting goods products already loaded`, progress: 18, count: counts.products });
    } else {
      // Products are loaded via PL/SQL in load_products.sql — run inline
      // For the API we trigger the same pattern: use the load script via execute
      send({ step: 'products', status: 'error', message: 'Products require SQL*Plus load (run load_products.sql). Skipping.', progress: 18, count: 0 });
    }

    // ── 4. SIGNAL SOURCES (18-25%) ────────────────────────────────────────
    if (aborted) return;
    send({ step: 'influencers', status: 'running', message: 'Checking signal sources...', progress: 18 });

    const influencerCount = counts.influencers || await tableCount('influencers');
    if (influencerCount > 0) {
      send({ step: 'influencers', status: 'skipped', message: `${influencerCount} signal sources already loaded`, progress: 25, count: influencerCount });
    } else {
      send({ step: 'influencers', status: 'error', message: 'Signal sources require SQL*Plus load (run load_influencers.sql). Skipping.', progress: 25, count: 0 });
    }

    // ── 5. BUYERS (25-33%) ────────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'customers', status: 'running', message: 'Checking customers...', progress: 25 });

    const customerCount = counts.customers || await tableCount('customers');
    if (customerCount > 0) {
      send({ step: 'customers', status: 'skipped', message: `${customerCount} customers already loaded`, progress: 33, count: customerCount });
    } else {
      send({ step: 'customers', status: 'error', message: 'Customers require SQL*Plus load (run load_customers.sql). Skipping.', progress: 33, count: 0 });
    }

    // ── 6. REGULATORY SIGNALS (33-42%) ────────────────────────────────────
    if (aborted) return;
    send({ step: 'social_posts', status: 'running', message: 'Checking demand signals...', progress: 33 });

    const postCount = counts.social_posts || await tableCount('social_posts');
    if (postCount > 0) {
      send({ step: 'social_posts', status: 'skipped', message: `${postCount} demand signals already loaded`, progress: 42, count: postCount });
    } else {
      send({ step: 'social_posts', status: 'error', message: 'Market and operations signals require SQL*Plus load (run load_social_posts.sql). Skipping.', progress: 42, count: 0 });
    }

    // ── 7. ORDERS (42-50%) ────────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'orders', status: 'running', message: 'Checking orders...', progress: 42 });

    const orderCount = counts.orders || await tableCount('orders');
    if (orderCount > 0) {
      send({ step: 'orders', status: 'skipped', message: `${orderCount} orders already loaded`, progress: 50, count: orderCount });
    } else {
      send({ step: 'orders', status: 'error', message: 'Orders require SQL*Plus load (run load_orders.sql). Skipping.', progress: 50, count: 0 });
    }

    // ── 8. GRAPH DATA (50-56%) ────────────────────────────────────────────
    if (aborted) return;
    send({ step: 'graph', status: 'running', message: 'Checking graph data...', progress: 50 });

    const edgeCount = counts.influencer_connections || await tableCount('influencer_connections');
    const linkCount = counts.brand_influencer_links || await tableCount('brand_influencer_links');
    if (edgeCount > 0) {
      send({ step: 'graph', status: 'skipped', message: `${edgeCount} edges, ${linkCount} brand or partner links already loaded`, progress: 56, count: edgeCount });
    } else {
      send({ step: 'graph', status: 'error', message: 'Graph data requires SQL*Plus load (run load_graph_data.sql). Skipping.', progress: 56, count: 0 });
    }

    // ── 9. SPATIAL CENTERS (56-62%) ───────────────────────────────────────
    if (aborted) return;
    send({ step: 'spatial_centers', status: 'running', message: 'Populating store fulfillment site locations...', progress: 56 });

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
    send({ step: 'product_embeddings', status: 'running', message: 'Generating product embeddings...', progress: 80 });

    try {
      const prodEmbedCount = counts.product_embeddings || await tableCount('product_embeddings');
      const productTotal = await tableCount('products');

      if (prodEmbedCount >= productTotal && productTotal > 0) {
        send({ step: 'product_embeddings', status: 'skipped', message: `${prodEmbedCount} product embeddings already exist`, progress: 87, count: prodEmbedCount });
      } else if (productTotal === 0) {
        send({ step: 'product_embeddings', status: 'skipped', message: 'No sporting goods products to embed', progress: 87, count: 0 });
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
        send({ step: 'product_embeddings', status: 'done', message: `${embResult.rowsAffected || 0} product embeddings generated`, progress: 87, count: newCount });
      }
    } catch (err) {
      send({ step: 'product_embeddings', status: 'error', message: err.message, progress: 87 });
    }

    // ── 14. SIGNAL EMBEDDINGS (87-94%) ────────────────────────────────────
    if (aborted) return;
    send({ step: 'signal_embeddings', status: 'running', message: 'Generating signal embeddings...', progress: 87 });

    try {
      const postEmbedCount = counts.signal_embeddings || await tableCount('signal_embeddings');
      const totalPosts = await tableCount('social_posts');

      if (postEmbedCount >= totalPosts && totalPosts > 0) {
        send({ step: 'signal_embeddings', status: 'skipped', message: `${postEmbedCount} signal embeddings already exist`, progress: 94, count: postEmbedCount });
      } else if (totalPosts === 0) {
        send({ step: 'signal_embeddings', status: 'skipped', message: 'No signal bulletins to embed', progress: 94, count: 0 });
      } else {
        let totalInserted = 0;
        let batchNum = 0;

        // Process in batches of 500
        while (!aborted) {
          batchNum++;
          const batchResult = await db.execute(`
            INSERT INTO signal_embeddings (post_id, embedding_text, embedding)
            SELECT post_id, SUBSTR(post_text, 1, 500),
                   VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING SUBSTR(post_text, 1, 500) AS DATA)
            FROM social_posts sp
            WHERE NOT EXISTS (
              SELECT 1 FROM signal_embeddings pe WHERE pe.post_id = sp.post_id
            )
            AND ROWNUM <= 500
          `);

          const inserted = batchResult.rowsAffected || 0;
          totalInserted += inserted;

          if (inserted === 0) break;

          // Calculate progress within 87-94% range
          const currentEmbed = await tableCount('signal_embeddings');
          const pct = Math.min(94, 87 + Math.round((currentEmbed / totalPosts) * 7));
          send({ step: 'signal_embeddings', status: 'running', message: `Batch ${batchNum}: ${totalInserted} signal embeddings generated (${currentEmbed}/${totalPosts})...`, progress: pct, count: currentEmbed });

          if (inserted < 500) break;
        }

        const finalPostEmbeds = await tableCount('signal_embeddings');
        send({ step: 'signal_embeddings', status: 'done', message: `${totalInserted} signal embeddings generated`, progress: 94, count: finalPostEmbeds });
      }
    } catch (err) {
      send({ step: 'signal_embeddings', status: 'error', message: err.message, progress: 94 });
    }

    // ── 15. SEMANTIC MATCHES (94-97%) ─────────────────────────────────────
    if (aborted) return;
    send({ step: 'semantic_matches', status: 'running', message: 'Computing semantic matches for signal bulletins...', progress: 94 });

    try {
      const matchCount = counts.semantic_matches || await tableCount('semantic_matches');

      if (matchCount > 0) {
        send({ step: 'semantic_matches', status: 'skipped', message: `${matchCount} semantic matches already exist`, progress: 97, count: matchCount });
      } else {
        // Find elevated or critical demand signals that have embeddings, match to top-3 sporting goods products
        const matchResult = await db.execute(`
          INSERT INTO semantic_matches (post_id, product_id, similarity_score, match_rank, match_method)
          SELECT post_id, product_id, similarity_score, match_rank, 'vector'
          FROM (
            SELECT pe.post_id,
                   pre.product_id,
                   ROUND(1 - VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE), 5) AS similarity_score,
                   ROW_NUMBER() OVER (PARTITION BY pe.post_id
                     ORDER BY VECTOR_DISTANCE(pe.embedding, pre.embedding, COSINE)) AS match_rank
            FROM signal_embeddings pe
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
        (SELECT COUNT(*) FROM signal_embeddings)        AS signal_embeddings,
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
