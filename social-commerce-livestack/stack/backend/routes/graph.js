/**
 * Graph API — Influencer network queries using Oracle Property Graph / SQL/PGQ
 */
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

// ── Helper: fetch connections for a set of node IDs in one query ───────────
async function fetchConnections(nodeIds, limit, demoUser) {
  if (!nodeIds.length) return [];
  const idList = [...new Set(nodeIds.map(Number))].join(',');
  const result = await db.executeAsUser(`
    SELECT ic.connection_id,
           ic.from_influencer, ic.to_influencer,
           ic.connection_type, ic.strength, ic.interaction_count,
           i_f.handle           AS from_handle,
           i_f.display_name     AS from_display,
           i_f.platform         AS from_platform,
           i_f.follower_count   AS from_followers,
           i_f.influence_score  AS from_score,
           i_f.niche            AS from_niche,
           i_f.city             AS from_city,
           i_f.is_verified      AS from_verified,
           i_f.engagement_rate  AS from_engagement,
           i_t.handle           AS to_handle,
           i_t.display_name     AS to_display,
           i_t.platform         AS to_platform,
           i_t.follower_count   AS to_followers,
           i_t.influence_score  AS to_score,
           i_t.niche            AS to_niche,
           i_t.city             AS to_city,
           i_t.is_verified      AS to_verified,
           i_t.engagement_rate  AS to_engagement
    FROM   influencer_connections ic
    JOIN   influencers i_f ON ic.from_influencer = i_f.influencer_id
    JOIN   influencers i_t ON ic.to_influencer   = i_t.influencer_id
    WHERE  ic.from_influencer IN (${idList})
        OR ic.to_influencer   IN (${idList})
    ORDER  BY ic.strength DESC
    FETCH FIRST ${limit} ROWS ONLY
  `, {}, demoUser);
  return result.rows;
}

// Build a node object from either side of a connection row
function nodeFromEdge(c, side) {
  const f = side === 'from';
  return {
    INFLUENCER_ID:   f ? c.FROM_INFLUENCER : c.TO_INFLUENCER,
    HANDLE:          f ? c.FROM_HANDLE     : c.TO_HANDLE,
    DISPLAY_NAME:    f ? c.FROM_DISPLAY    : c.TO_DISPLAY,
    PLATFORM:        f ? c.FROM_PLATFORM   : c.TO_PLATFORM,
    FOLLOWER_COUNT:  f ? c.FROM_FOLLOWERS  : c.TO_FOLLOWERS,
    INFLUENCE_SCORE: f ? c.FROM_SCORE      : c.TO_SCORE,
    NICHE:           f ? c.FROM_NICHE      : c.TO_NICHE,
    CITY:            f ? c.FROM_CITY       : c.TO_CITY,
    IS_VERIFIED:     f ? c.FROM_VERIFIED   : c.TO_VERIFIED,
    ENGAGEMENT_RATE: f ? c.FROM_ENGAGEMENT : c.TO_ENGAGEMENT,
  };
}

// GET /api/graph/influencers — top influencers with optional handle/name search
router.get('/influencers', async (req, res) => {
  try {
    const { platform, niche, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    let where = 'WHERE 1=1';
    const binds = { limit };

    if (platform) { where += ' AND platform = :platform'; binds.platform = platform; }
    if (niche)    { where += ' AND niche = :niche';       binds.niche    = niche;    }
    if (search)   {
      where += ' AND (UPPER(handle) LIKE UPPER(:search) OR UPPER(display_name) LIKE UPPER(:search) OR UPPER(niche) LIKE UPPER(:search))';
      binds.search = `%${search}%`;
    }

    const result = await db.executeAsUser(`
      SELECT influencer_id, handle, display_name, platform,
             follower_count, engagement_rate, influence_score,
             niche, city, is_verified,
             (SELECT COUNT(*) FROM influencer_connections ic
              WHERE ic.from_influencer = i.influencer_id
                 OR ic.to_influencer   = i.influencer_id) AS connection_count,
             (SELECT COUNT(*) FROM social_posts sp
              WHERE sp.influencer_id = i.influencer_id
                AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '30' DAY) AS recent_posts
      FROM influencers i
      ${where}
      ORDER BY influence_score DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Influencers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/network/:id — ego network, depth 1-5 hops
// Returns: { center, nodes, edges, brands, stats }
router.get('/network/:id', async (req, res) => {
  try {
    const seedId = parseInt(req.params.id);
    const depth  = Math.min(parseInt(req.query.depth) || 3, 5);

    // ── Center node (full detail) ─────────────────────────────────────────
    const centerRes = await db.executeAsUser(`
      SELECT i.influencer_id, i.handle, i.display_name, i.platform,
             i.follower_count, i.engagement_rate, i.influence_score,
             i.niche, i.city, i.is_verified,
             (SELECT COUNT(*) FROM social_posts sp
              WHERE sp.influencer_id = i.influencer_id
                AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '30' DAY) AS recent_posts,
             (SELECT COUNT(*) FROM influencer_connections ic2
              WHERE ic2.from_influencer = i.influencer_id
                 OR ic2.to_influencer   = i.influencer_id)            AS total_connections,
             (SELECT COUNT(*) FROM brand_influencer_links bil
              WHERE bil.influencer_id = i.influencer_id)              AS brand_count
      FROM influencers i
      WHERE influencer_id = :id
    `, { id: seedId }, req.demoUser);

    if (!centerRes.rows.length) return res.status(404).json({ error: 'Influencer not found' });

    // ── Accumulators ──────────────────────────────────────────────────────
    const nodesMap  = new Map();
    const edgesSet  = new Set();
    const edgesList = [];

    const addNode = (row, type, hopLevel) => {
      const id = row.INFLUENCER_ID;
      if (!nodesMap.has(id)) nodesMap.set(id, { ...row, type, hopLevel });
    };

    const addEdge = (c, hopLevel) => {
      const key = [
        Math.min(c.FROM_INFLUENCER, c.TO_INFLUENCER),
        Math.max(c.FROM_INFLUENCER, c.TO_INFLUENCER),
        c.CONNECTION_TYPE,
      ].join('-');
      if (edgesSet.has(key)) return;
      edgesSet.add(key);
      edgesList.push({
        source:       c.FROM_INFLUENCER,
        target:       c.TO_INFLUENCER,
        type:         c.CONNECTION_TYPE,
        strength:     c.STRENGTH,
        interactions: c.INTERACTION_COUNT,
        hopLevel,
      });
    };

    addNode(centerRes.rows[0], 'center', 0);

    // ── Hop 1: direct connections of seed (≤50 edges) ─────────────────────
    const hop1Rows = await fetchConnections([seedId], 50, req.demoUser);
    const hop1Ids  = new Set([seedId]);

    for (const c of hop1Rows) {
      addNode(nodeFromEdge(c, 'from'), 'hop1', 1);
      addNode(nodeFromEdge(c, 'to'),   'hop1', 1);
      hop1Ids.add(c.FROM_INFLUENCER);
      hop1Ids.add(c.TO_INFLUENCER);
      addEdge(c, 1);
    }

    // ── Hop 2: connections of top 25 hop-1 nodes (≤120 edges) ────────────
    if (depth >= 2) {
      const hop1Only = [...hop1Ids].filter(id => id !== seedId).slice(0, 25);
      if (hop1Only.length) {
        const hop2Rows = await fetchConnections(hop1Only, 120, req.demoUser);
        const hop2Ids  = new Set(hop1Ids);

        for (const c of hop2Rows) {
          addNode(nodeFromEdge(c, 'from'), 'hop2', 2);
          addNode(nodeFromEdge(c, 'to'),   'hop2', 2);
          hop2Ids.add(c.FROM_INFLUENCER);
          hop2Ids.add(c.TO_INFLUENCER);
          addEdge(c, 2);
        }

        // ── Hop 3: top 15 newly-discovered hop-2 nodes (≤60 edges) ───────
        if (depth >= 3) {
          const newHop2 = [...hop2Ids].filter(id => !hop1Ids.has(id)).slice(0, 15);
          const hop3Ids = new Set(hop2Ids);
          if (newHop2.length) {
            const hop3Rows = await fetchConnections(newHop2, 60, req.demoUser);
            for (const c of hop3Rows) {
              addNode(nodeFromEdge(c, 'from'), 'hop3', 3);
              addNode(nodeFromEdge(c, 'to'),   'hop3', 3);
              hop3Ids.add(c.FROM_INFLUENCER);
              hop3Ids.add(c.TO_INFLUENCER);
              addEdge(c, 3);
            }
          }

          // ── Hop 4: top 10 newly-discovered hop-3 nodes (≤40 edges) ─────
          if (depth >= 4) {
            const newHop3 = [...hop3Ids].filter(id => !hop2Ids.has(id)).slice(0, 10);
            const hop4Ids = new Set(hop3Ids);
            if (newHop3.length) {
              const hop4Rows = await fetchConnections(newHop3, 40, req.demoUser);
              for (const c of hop4Rows) {
                addNode(nodeFromEdge(c, 'from'), 'hop4', 4);
                addNode(nodeFromEdge(c, 'to'),   'hop4', 4);
                hop4Ids.add(c.FROM_INFLUENCER);
                hop4Ids.add(c.TO_INFLUENCER);
                addEdge(c, 4);
              }
            }

            // ── Hop 5: top 8 newly-discovered hop-4 nodes (≤30 edges) ───
            if (depth >= 5) {
              const newHop4 = [...hop4Ids].filter(id => !hop3Ids.has(id)).slice(0, 8);
              if (newHop4.length) {
                const hop5Rows = await fetchConnections(newHop4, 30, req.demoUser);
                for (const c of hop5Rows) {
                  addNode(nodeFromEdge(c, 'from'), 'hop5', 5);
                  addNode(nodeFromEdge(c, 'to'),   'hop5', 5);
                  addEdge(c, 5);
                }
              }
            }
          }
        }
      }
    }

    // ── Brand relationships for center ────────────────────────────────────
    const brandsRes = await db.executeAsUser(`
      SELECT bil.link_id, bil.brand_id, bil.relationship_type,
             bil.post_count, bil.avg_engagement, bil.revenue_attributed,
             b.brand_name, b.brand_category, b.social_tier
      FROM brand_influencer_links bil
      JOIN brands b ON bil.brand_id = b.brand_id
      WHERE bil.influencer_id = :id
      ORDER BY bil.revenue_attributed DESC
    `, { id: seedId }, req.demoUser);

    res.json({
      center: centerRes.rows[0],
      nodes:  Array.from(nodesMap.values()),
      edges:  edgesList,
      brands: brandsRes.rows,
      stats: {
        nodeCount:  nodesMap.size,
        edgeCount:  edgesList.length,
        brandCount: brandsRes.rows.length,
        depth,
      },
    });
  } catch (err) {
    console.error('Network error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/propagation/:brandSlug — brand propagation network
router.get('/propagation/:brandSlug', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT bil.influencer_id AS promoter_id,
             i1.handle         AS promoter_handle,
             i1.influence_score AS promoter_score,
             i1.follower_count  AS promoter_followers,
             bil.relationship_type,
             ic.to_influencer  AS reached_id,
             i2.handle         AS reached_handle,
             i2.influence_score AS reached_score,
             i2.follower_count  AS reached_followers,
             ic.connection_type,
             ic.strength       AS connection_strength
      FROM brand_influencer_links bil
      JOIN brands b    ON bil.brand_id     = b.brand_id
      JOIN influencers i1 ON bil.influencer_id = i1.influencer_id
      LEFT JOIN influencer_connections ic ON bil.influencer_id = ic.from_influencer
      LEFT JOIN influencers i2 ON ic.to_influencer = i2.influencer_id
      WHERE b.brand_slug = :slug
      ORDER BY i1.influence_score DESC, ic.strength DESC NULLS LAST
      FETCH FIRST 100 ROWS ONLY
    `, { slug: req.params.brandSlug }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Propagation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Predefined SQL/PGQ graph query examples ───────────────────────────────
const EXAMPLE_QUERIES = {
  influence_reach: {
    name: 'Influence Reach (N-Hop Traversal)',
    description: 'Find all influencers reachable within N hops from a starting influencer using SQL/PGQ GRAPH_TABLE pattern matching.',
    params: [
      { key: 'handle', label: 'Starting Handle', default: '@crystal_cleo' },
      { key: 'hops',   label: 'Max Hops (1-3)',  default: 2, type: 'number' },
    ],
    buildSql: (p) => ({
      sql: `SELECT handle, influence_score, follower_count, platform, niche
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer) -[e IS connects_to]->{1,${Math.min(parseInt(p.hops)||2, 3)}} (v2 IS influencer)
    WHERE v1.handle = :handle
    COLUMNS (
        v2.handle,
        v2.influence_score,
        v2.follower_count,
        v2.platform,
        v2.niche
    )
)
ORDER BY influence_score DESC
FETCH FIRST 25 ROWS ONLY`,
      binds: { handle: p.handle || '@crystal_cleo' },
      display: `-- SQL/PGQ: Find influencers within ${p.hops || 2} hops
SELECT handle, influence_score, follower_count,
       platform, niche
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer)
          -[e IS connects_to]->{1,${p.hops || 2}}
          (v2 IS influencer)
    WHERE v1.handle = '${p.handle || '@crystal_cleo'}'
    COLUMNS (
        v2.handle, v2.influence_score,
        v2.follower_count, v2.platform, v2.niche
    )
)
ORDER BY influence_score DESC
FETCH FIRST 25 ROWS ONLY;`,
    }),
  },

  mutual_connections: {
    name: 'Mutual Connections (Triangle Pattern)',
    description: 'Find influencers who are mutual connections between two people — the "friends of friends" triangle pattern. Uses SQL/PGQ multi-edge MATCH to find shared network nodes.',
    params: [
      { key: 'from_handle', label: 'From Handle', default: '@neon_mia' },
      { key: 'to_handle',   label: 'To Handle',   default: '@haze_ella' },
    ],
    buildSql: (p) => ({
      sql: `SELECT mutual_handle, mutual_platform, mutual_followers,
       mutual_score, e1_type, e2_type,
       ROUND((e1_strength + e2_strength) / 2, 3) AS avg_strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (a IS influencer) -[e1 IS connects_to]-> (m IS influencer) <-[e2 IS connects_to]- (b IS influencer)
    WHERE a.handle = :from_handle
      AND b.handle = :to_handle
    COLUMNS (
        m.handle AS mutual_handle,
        m.platform AS mutual_platform,
        m.follower_count AS mutual_followers,
        m.influence_score AS mutual_score,
        e1.connection_type AS e1_type,
        e2.connection_type AS e2_type,
        e1.strength AS e1_strength,
        e2.strength AS e2_strength
    )
)
ORDER BY avg_strength DESC
FETCH FIRST 20 ROWS ONLY`,
      binds: { from_handle: p.from_handle || '@neon_mia', to_handle: p.to_handle || '@haze_ella' },
      display: `-- SQL/PGQ: Triangle pattern — mutual connections
SELECT mutual_handle, mutual_platform,
       mutual_followers, mutual_score,
       e1_type, e2_type,
       ROUND((e1_strength + e2_strength)/2, 3)
         AS avg_strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (a IS influencer)
          -[e1 IS connects_to]->
          (m IS influencer)
          <-[e2 IS connects_to]-
          (b IS influencer)
    WHERE a.handle = '${p.from_handle || '@neon_mia'}'
      AND b.handle = '${p.to_handle || '@haze_ella'}'
    COLUMNS (
        m.handle AS mutual_handle,
        m.platform AS mutual_platform,
        m.follower_count AS mutual_followers,
        m.influence_score AS mutual_score,
        e1.connection_type AS e1_type,
        e2.connection_type AS e2_type,
        e1.strength AS e1_strength,
        e2.strength AS e2_strength
    )
)
ORDER BY avg_strength DESC
FETCH FIRST 20 ROWS ONLY;`,
    }),
  },

  brand_propagation: {
    name: 'Brand Propagation Network',
    description: 'Trace how a brand spreads through the influencer network — from brand ambassadors to their connections. Uses multi-edge pattern: brand ←[promotes]— influencer —[connects_to]→ reached.',
    params: [
      { key: 'brand_name', label: 'Brand Name', default: 'UrbanPulse' },
    ],
    buildSql: (p) => ({
      sql: `SELECT promoter, reached, relationship_type,
       connection_type, strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (b IS brand) <-[e1 IS promotes]- (v1 IS influencer)
          -[e2 IS connects_to]-> (v2 IS influencer)
    WHERE b.brand_name = :brand_name
    COLUMNS (
        v1.handle AS promoter,
        v2.handle AS reached,
        e1.relationship_type,
        e2.connection_type,
        e2.strength
    )
)
ORDER BY strength DESC
FETCH FIRST 30 ROWS ONLY`,
      binds: { brand_name: p.brand_name || 'UrbanPulse' },
      display: `-- SQL/PGQ: Brand propagation through network
SELECT promoter, reached,
       relationship_type,
       connection_type, strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (b IS brand)
          <-[e1 IS promotes]-
          (v1 IS influencer)
          -[e2 IS connects_to]->
          (v2 IS influencer)
    WHERE b.brand_name = '${p.brand_name || 'UrbanPulse'}'
    COLUMNS (
        v1.handle AS promoter,
        v2.handle AS reached,
        e1.relationship_type,
        e2.connection_type,
        e2.strength
    )
)
ORDER BY strength DESC
FETCH FIRST 30 ROWS ONLY;`,
    }),
  },

  cross_platform: {
    name: 'Cross-Platform Bridge Influencers',
    description: 'Identify influencers who bridge different social platforms — key connectors that amplify reach across ecosystems. Uses GRAPH_TABLE edge traversal with cross-platform filtering.',
    params: [
      { key: 'min_platforms', label: 'Min Platforms Connected', default: 2, type: 'number' },
    ],
    buildSql: (p) => ({
      sql: `SELECT src_handle, src_platform, src_score, src_followers,
       COUNT(DISTINCT dest_platform) AS platforms_reached,
       COUNT(*) AS total_connections
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer) -[e IS connects_to]-> (v2 IS influencer)
    WHERE v1.platform != v2.platform
    COLUMNS (
        v1.handle AS src_handle,
        v1.platform AS src_platform,
        v1.influence_score AS src_score,
        v1.follower_count AS src_followers,
        v2.platform AS dest_platform
    )
)
GROUP BY src_handle, src_platform, src_score, src_followers
HAVING COUNT(DISTINCT dest_platform) >= :min_platforms
ORDER BY platforms_reached DESC, src_score DESC
FETCH FIRST 20 ROWS ONLY`,
      binds: { min_platforms: parseInt(p.min_platforms) || 2 },
      display: `-- SQL/PGQ: Cross-platform bridge detection
SELECT src_handle, src_platform, src_score,
       src_followers,
       COUNT(DISTINCT dest_platform)
         AS platforms_reached,
       COUNT(*) AS total_connections
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer)
          -[e IS connects_to]->
          (v2 IS influencer)
    WHERE v1.platform != v2.platform
    COLUMNS (
        v1.handle AS src_handle,
        v1.platform AS src_platform,
        v1.influence_score AS src_score,
        v1.follower_count AS src_followers,
        v2.platform AS dest_platform
    )
)
GROUP BY src_handle, src_platform,
         src_score, src_followers
HAVING COUNT(DISTINCT dest_platform) >= ${p.min_platforms || 2}
ORDER BY platforms_reached DESC,
         src_score DESC
FETCH FIRST 20 ROWS ONLY;`,
    }),
  },

  community_hubs: {
    name: 'Community Hub Detection (Degree Centrality)',
    description: 'Find the most connected influencers (highest graph degree) — community hubs that maximize network reach. Uses GRAPH_TABLE edge traversal with aggregation for degree centrality.',
    params: [
      { key: 'niche', label: 'Niche (optional)', default: '' },
    ],
    buildSql: (p) => {
      const nicheWhere = p.niche ? `\n    WHERE v1.niche = :niche` : '';
      return {
        sql: `SELECT src_handle, src_platform, src_niche,
       src_score, src_followers,
       COUNT(*) AS degree,
       COUNT(DISTINCT connection_type) AS edge_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer) -[e IS connects_to]-> (v2 IS influencer)${nicheWhere}
    COLUMNS (
        v1.handle AS src_handle,
        v1.platform AS src_platform,
        v1.niche AS src_niche,
        v1.influence_score AS src_score,
        v1.follower_count AS src_followers,
        e.connection_type,
        e.strength
    )
)
GROUP BY src_handle, src_platform, src_niche, src_score, src_followers
ORDER BY degree DESC, src_score DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: p.niche ? { niche: p.niche } : {},
        display: `-- SQL/PGQ: Community hub detection (degree centrality)
SELECT src_handle, src_platform, src_niche,
       src_score, src_followers,
       COUNT(*) AS degree,
       COUNT(DISTINCT connection_type)
         AS edge_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer)
          -[e IS connects_to]->
          (v2 IS influencer)${p.niche ? `\n    WHERE v1.niche = '${p.niche}'` : ''}
    COLUMNS (
        v1.handle AS src_handle,
        v1.platform AS src_platform,
        v1.niche AS src_niche,
        v1.influence_score AS src_score,
        v1.follower_count AS src_followers,
        e.connection_type, e.strength
    )
)
GROUP BY src_handle, src_platform, src_niche,
         src_score, src_followers
ORDER BY degree DESC, src_score DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },
};

// GET /api/graph/example-queries — list available queries with metadata
router.get('/example-queries', (req, res) => {
  const queries = Object.entries(EXAMPLE_QUERIES).map(([id, q]) => ({
    id,
    name: q.name,
    description: q.description,
    params: q.params,
  }));
  res.json(queries);
});

// POST /api/graph/run-example — execute a predefined graph query
router.post('/run-example', async (req, res) => {
  try {
    const { queryId, params = {} } = req.body;
    const queryDef = EXAMPLE_QUERIES[queryId];
    if (!queryDef) {
      return res.status(400).json({ error: `Unknown query: ${queryId}` });
    }

    const { sql, binds, display } = queryDef.buildSql(params);
    const startTime = Date.now();
    const result = await db.executeAsUser(sql, binds, req.demoUser);
    const elapsed = Date.now() - startTime;

    res.json({
      queryId,
      name: queryDef.name,
      sql: display,
      rows: result.rows,
      rowCount: result.rows.length,
      elapsed,
    });
  } catch (err) {
    console.error('Graph example query error:', err);
    // Return error with the SQL so user can see what failed
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    res.status(500).json({
      error: err.message,
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
