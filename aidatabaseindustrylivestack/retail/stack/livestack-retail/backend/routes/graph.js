/**
 * Graph API - Influencer network queries using Oracle Property Graph / SQL/PGQ
 */
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const {
  GraphExecutionEvidenceError,
  captureGraphCursorEvidence,
} = require('../lib/graphExecutionEvidenceService');

// ── Helper: execute one native SQL/PGQ frontier expansion ──────────────────
async function fetchGraphConnections({ connection, execute }, nodeIds, limit) {
  const ids = [...new Set(nodeIds.map(Number))]
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 25);
  if (!ids.length) return { rows: [], evidence: null };
  const binds = {};
  const idList = ids.map((id, index) => {
    binds[`node${index}`] = id;
    return `:node${index}`;
  }).join(',');
  const boundedLimit = Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 50));
  const result = await execute(`
    SELECT from_influencer, to_influencer,
           connection_type, strength, interaction_count,
           from_handle, from_display, from_platform, from_followers,
           from_score, from_niche, from_city, from_verified, from_engagement,
           to_handle, to_display, to_platform, to_followers,
           to_score, to_niche, to_city, to_verified, to_engagement
    FROM GRAPH_TABLE ( influencer_network
      MATCH (src IS influencer) -[edge IS connects_to]-> (dst IS influencer)
      WHERE src.influencer_id IN (${idList})
         OR dst.influencer_id IN (${idList})
      COLUMNS (
        src.influencer_id AS from_influencer,
        dst.influencer_id AS to_influencer,
        edge.connection_type AS connection_type,
        edge.strength AS strength,
        edge.interaction_count AS interaction_count,
        src.handle AS from_handle,
        src.display_name AS from_display,
        src.platform AS from_platform,
        src.follower_count AS from_followers,
        src.influence_score AS from_score,
        src.niche AS from_niche,
        src.city AS from_city,
        src.is_verified AS from_verified,
        src.engagement_rate AS from_engagement,
        dst.handle AS to_handle,
        dst.display_name AS to_display,
        dst.platform AS to_platform,
        dst.follower_count AS to_followers,
        dst.influence_score AS to_score,
        dst.niche AS to_niche,
        dst.city AS to_city,
        dst.is_verified AS to_verified,
        dst.engagement_rate AS to_engagement
      )
    )
    ORDER BY strength DESC
    FETCH FIRST ${boundedLimit} ROWS ONLY
  `, binds);
  const evidence = await captureGraphCursorEvidence(connection);
  return { rows: result.rows || [], evidence };
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

// GET /api/graph/influencers - top influencers with optional handle/name search
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

// GET /api/graph/network/:id - ego network, depth 1-5 hops
// Returns: { center, nodes, edges, brands, stats }
router.get('/network/:id', async (req, res) => {
  try {
    const seedId = Number.parseInt(req.params.id, 10);
    const depth  = Math.max(
      1,
      Math.min(Number.parseInt(req.query.depth, 10) || 3, 5)
    );
    if (!Number.isInteger(seedId) || seedId <= 0) {
      return res.status(400).json({
        category: 'INVALID_REQUEST',
        feature: 'SQL_PROPERTY_GRAPH',
        available: false,
        error: 'Influencer ID must be a positive integer.',
      });
    }

    const payload = await db.withUserConnection(
      req.demoUser,
      async ({ connection, execute }) => {
        // ── Center node (full detail) ─────────────────────────────────────
        const centerRes = await execute(`
      SELECT i.influencer_id, i.handle, i.display_name, i.platform,
             i.follower_count, i.engagement_rate, i.influence_score,
             i.niche, i.city, i.is_verified,
             (SELECT COUNT(*) FROM social_posts sp
              WHERE sp.influencer_id = i.influencer_id
                AND sp.posted_at >= (SELECT MAX(posted_at) FROM social_posts) - INTERVAL '30' DAY) AS recent_posts,
             (SELECT COUNT(*) FROM brand_influencer_links bil
              WHERE bil.influencer_id = i.influencer_id)              AS brand_count
      FROM influencers i
      WHERE influencer_id = :id
    `, { id: seedId });

        if (!centerRes.rows.length) return null;

        // ── Native SQL/PGQ frontier traversal, one exact cursor per hop ─────
        const nodesMap = new Map();
        const edgesSet = new Set();
        const edgesList = [];
        const graphExecutions = [];
        const seenIds = new Set([seedId]);
        const hopLimits = [50, 120, 60, 40, 30];
        const nextFrontierLimits = [25, 15, 10, 8, 0];

        const addNode = (row, type, hopLevel) => {
          const id = row.INFLUENCER_ID;
          if (!nodesMap.has(id)) nodesMap.set(id, { ...row, type, hopLevel });
        };
        const addEdge = (row, hopLevel) => {
          const key = [
            row.FROM_INFLUENCER,
            row.TO_INFLUENCER,
            row.CONNECTION_TYPE,
          ].join('-');
          if (edgesSet.has(key)) return;
          edgesSet.add(key);
          edgesList.push({
            source: row.FROM_INFLUENCER,
            target: row.TO_INFLUENCER,
            type: row.CONNECTION_TYPE,
            strength: row.STRENGTH,
            interactions: row.INTERACTION_COUNT,
            hopLevel,
          });
        };

        addNode(centerRes.rows[0], 'center', 0);
        let frontier = [seedId];
        for (let hop = 1; hop <= depth && frontier.length; hop += 1) {
          const expansion = await fetchGraphConnections(
            { connection, execute },
            frontier,
            hopLimits[hop - 1]
          );
          graphExecutions.push(expansion.evidence);
          const discovered = [];
          for (const row of expansion.rows) {
            addNode(nodeFromEdge(row, 'from'), `hop${hop}`, hop);
            addNode(nodeFromEdge(row, 'to'), `hop${hop}`, hop);
            addEdge(row, hop);
            for (const id of [row.FROM_INFLUENCER, row.TO_INFLUENCER]) {
              if (!seenIds.has(id)) discovered.push(id);
            }
          }
          for (const id of discovered) seenIds.add(id);
          frontier = [...new Set(discovered)]
            .slice(0, nextFrontierLimits[hop - 1]);
        }

        // ── Relational brand context; graph nodes/edges above stay native ───
        const brandsRes = await execute(`
          SELECT bil.link_id, bil.brand_id, bil.relationship_type,
                 bil.post_count, bil.avg_engagement, bil.revenue_attributed,
                 b.brand_name, b.brand_category, b.social_tier
          FROM brand_influencer_links bil
          JOIN brands b ON bil.brand_id = b.brand_id
          WHERE bil.influencer_id = :id
          ORDER BY bil.revenue_attributed DESC
        `, { id: seedId });
        const directConnectionCount = edgesList
          .filter((edge) => edge.hopLevel === 1)
          .length;
        const center = {
          ...centerRes.rows[0],
          TOTAL_CONNECTIONS: directConnectionCount,
        };
        return {
          center,
          nodes: Array.from(nodesMap.values()),
          edges: edgesList,
          brands: brandsRes.rows,
          stats: {
            nodeCount: nodesMap.size,
            edgeCount: edgesList.length,
            brandCount: brandsRes.rows.length,
            depth,
          },
          execution: {
            available: true,
            feature: 'SQL_PROPERTY_GRAPH',
            graphName: 'INFLUENCER_NETWORK',
            operator: 'GRAPH_TABLE',
            language: 'SQL/PGQ',
            queryCount: graphExecutions.length,
            cursors: graphExecutions,
          },
        };
      },
      { readOnly: true }
    );
    if (!payload) {
      return res.status(404).json({
        category: 'SCOPED_NOT_FOUND',
        feature: 'SQL_PROPERTY_GRAPH',
        available: true,
        error: 'Influencer is not visible in the active VPD scope.',
      });
    }
    res.json(payload);
  } catch (err) {
    console.error('Network error:', err);
    if (err instanceof GraphExecutionEvidenceError
        || /ORA-00942|ORA-04063|ORA-424|property graph|GRAPH_TABLE/i
          .test(String(err.message || ''))) {
      return res.status(503).json({
        category: 'FEATURE_UNAVAILABLE',
        feature: 'SQL_PROPERTY_GRAPH',
        available: false,
        error: 'The native INFLUENCER_NETWORK SQL/PGQ execution or exact cursor proof is unavailable.',
        details: err?.details || null,
      });
    }
    res.status(500).json({
      category: 'DATABASE_ERROR',
      feature: 'SQL_PROPERTY_GRAPH',
      available: false,
      error: 'The creator network query failed.',
    });
  }
});

// GET /api/graph/propagation/:brandSlug - brand propagation network
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
const FALLBACK_EXPLORER_DEFAULTS = Object.freeze({
  influence_reach: Object.freeze({ handle: '@climb_lily_67', hops: 2 }),
  mutual_connections: Object.freeze({
    from_handle: '@alpine_mia_208',
    to_handle: '@hydration_ella_461',
  }),
  brand_propagation: Object.freeze({ brand_name: 'TerraGear' }),
  cross_platform: Object.freeze({ min_platforms: 2 }),
  community_hubs: Object.freeze({ niche: '' }),
});

const EXAMPLE_QUERIES = {
  influence_reach: {
    name: 'Influence Reach (N-Hop Traversal)',
    description: 'Find all influencers reachable within N hops from a starting influencer using SQL/PGQ GRAPH_TABLE pattern matching.',
    params: [
      { key: 'handle', label: 'Starting Handle', default: FALLBACK_EXPLORER_DEFAULTS.influence_reach.handle },
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
      binds: { handle: p.handle || FALLBACK_EXPLORER_DEFAULTS.influence_reach.handle },
      display: `-- SQL/PGQ: Find influencers within ${p.hops || 2} hops
SELECT handle, influence_score, follower_count,
       platform, niche
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer)
          -[e IS connects_to]->{1,${p.hops || 2}}
          (v2 IS influencer)
    WHERE v1.handle = '${p.handle || FALLBACK_EXPLORER_DEFAULTS.influence_reach.handle}'
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
    description: 'Find influencers who are mutual connections between two people - the "friends of friends" triangle pattern. Uses SQL/PGQ multi-edge MATCH to find shared network nodes.',
    params: [
      { key: 'from_handle', label: 'From Handle', default: FALLBACK_EXPLORER_DEFAULTS.mutual_connections.from_handle },
      { key: 'to_handle',   label: 'To Handle',   default: FALLBACK_EXPLORER_DEFAULTS.mutual_connections.to_handle },
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
      binds: {
        from_handle: p.from_handle || FALLBACK_EXPLORER_DEFAULTS.mutual_connections.from_handle,
        to_handle: p.to_handle || FALLBACK_EXPLORER_DEFAULTS.mutual_connections.to_handle,
      },
      display: `-- SQL/PGQ: Triangle pattern - mutual connections
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
    WHERE a.handle = '${p.from_handle || FALLBACK_EXPLORER_DEFAULTS.mutual_connections.from_handle}'
      AND b.handle = '${p.to_handle || FALLBACK_EXPLORER_DEFAULTS.mutual_connections.to_handle}'
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
    description: 'Trace how a brand spreads through the influencer network - from brand ambassadors to their connections. Uses multi-edge pattern: brand ←[promotes]- influencer -[connects_to]→ reached.',
    params: [
      { key: 'brand_name', label: 'Brand Name', default: FALLBACK_EXPLORER_DEFAULTS.brand_propagation.brand_name },
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
      binds: { brand_name: p.brand_name || FALLBACK_EXPLORER_DEFAULTS.brand_propagation.brand_name },
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
    WHERE b.brand_name = '${p.brand_name || FALLBACK_EXPLORER_DEFAULTS.brand_propagation.brand_name}'
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
    description: 'Identify influencers who bridge different social platforms - key connectors that amplify reach across ecosystems. Uses GRAPH_TABLE edge traversal with cross-platform filtering.',
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
    description: 'Find the most connected influencers (highest graph degree) - community hubs that maximize network reach. Uses GRAPH_TABLE edge traversal with aggregation for degree centrality.',
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

async function activeExampleQueryDefaults(demoUser) {
  try {
    const result = await db.executeAsUser(`
      WITH reach_candidates AS (
        SELECT i.handle, COUNT(*) connection_count
        FROM influencers i
        JOIN influencer_connections c
          ON c.from_influencer = i.influencer_id
        GROUP BY i.handle
      ),
      mutual_candidates AS (
        SELECT ia.handle from_handle, ib.handle to_handle,
               COUNT(*) mutual_count
        FROM influencer_connections ca
        JOIN influencer_connections cb
          ON cb.to_influencer = ca.to_influencer
         AND cb.from_influencer > ca.from_influencer
        JOIN influencers ia
          ON ia.influencer_id = ca.from_influencer
        JOIN influencers ib
          ON ib.influencer_id = cb.from_influencer
        GROUP BY ia.handle, ib.handle
      ),
      brand_candidates AS (
        SELECT b.brand_name, COUNT(*) propagation_count
        FROM brands b
        JOIN brand_influencer_links bil
          ON bil.brand_id = b.brand_id
        JOIN influencer_connections c
          ON c.from_influencer = bil.influencer_id
        GROUP BY b.brand_name
      )
      SELECT
        (SELECT handle
         FROM reach_candidates
         ORDER BY connection_count DESC, handle
         FETCH FIRST 1 ROW ONLY) reach_handle,
        (SELECT from_handle
         FROM mutual_candidates
         ORDER BY mutual_count DESC, from_handle, to_handle
         FETCH FIRST 1 ROW ONLY) from_handle,
        (SELECT to_handle
         FROM mutual_candidates
         ORDER BY mutual_count DESC, from_handle, to_handle
         FETCH FIRST 1 ROW ONLY) to_handle,
        (SELECT brand_name
         FROM brand_candidates
         ORDER BY propagation_count DESC, brand_name
         FETCH FIRST 1 ROW ONLY) brand_name
      FROM dual
    `, {}, demoUser);
    const row = result.rows?.[0] || {};
    return {
      ...FALLBACK_EXPLORER_DEFAULTS,
      influence_reach: {
        ...FALLBACK_EXPLORER_DEFAULTS.influence_reach,
        handle: row.REACH_HANDLE || FALLBACK_EXPLORER_DEFAULTS.influence_reach.handle,
      },
      mutual_connections: {
        ...FALLBACK_EXPLORER_DEFAULTS.mutual_connections,
        from_handle: row.FROM_HANDLE || FALLBACK_EXPLORER_DEFAULTS.mutual_connections.from_handle,
        to_handle: row.TO_HANDLE || FALLBACK_EXPLORER_DEFAULTS.mutual_connections.to_handle,
      },
      brand_propagation: {
        ...FALLBACK_EXPLORER_DEFAULTS.brand_propagation,
        brand_name: row.BRAND_NAME || FALLBACK_EXPLORER_DEFAULTS.brand_propagation.brand_name,
      },
    };
  } catch (error) {
    console.warn(`Graph Query Explorer defaults fell back to the bundled dataset: ${error.message}`);
    return FALLBACK_EXPLORER_DEFAULTS;
  }
}

function queryParamsWithDefaults(queryId, queryDef, params, defaults) {
  const resolved = { ...(params || {}) };
  for (const param of queryDef.params || []) {
    const value = resolved[param.key];
    if (value === undefined || value === null || String(value).trim() === '') {
      resolved[param.key] = defaults[queryId]?.[param.key] ?? param.default;
    }
  }
  return resolved;
}

// GET /api/graph/example-queries - list available queries with metadata
router.get('/example-queries', async (req, res) => {
  const defaults = await activeExampleQueryDefaults(req.demoUser);
  const queries = Object.entries(EXAMPLE_QUERIES).map(([id, q]) => ({
    id,
    name: q.name,
    description: q.description,
    params: q.params.map((param) => ({
      ...param,
      default: defaults[id]?.[param.key] ?? param.default,
    })),
  }));
  res.json(queries);
});

// POST /api/graph/run-example - execute a predefined graph query
router.post('/run-example', async (req, res) => {
  try {
    const { queryId, params = {} } = req.body;
    const queryDef = EXAMPLE_QUERIES[queryId];
    if (!queryDef) {
      return res.status(400).json({ error: `Unknown query: ${queryId}` });
    }

    const defaults = await activeExampleQueryDefaults(req.demoUser);
    const resolvedParams = queryParamsWithDefaults(queryId, queryDef, params, defaults);
    const { sql, binds, display } = queryDef.buildSql(resolvedParams);
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
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    if (/ORA-00942|ORA-04063|ORA-424|property graph|GRAPH_TABLE/i.test(String(err.message || ''))) {
      return res.status(503).json({
        category: 'FEATURE_UNAVAILABLE',
        feature: 'SQL_PROPERTY_GRAPH',
        available: false,
        error: 'The native SQL/PGQ property graph is unavailable.',
        sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
      });
    }
    res.status(500).json({
      category: 'DATABASE_ERROR',
      feature: 'SQL_PROPERTY_GRAPH',
      available: false,
      error: 'The SQL/PGQ query failed.',
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
