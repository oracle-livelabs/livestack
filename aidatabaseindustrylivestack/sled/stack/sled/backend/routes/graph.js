/**
 * Graph API - State and Local Government partner network queries using Oracle Property Graph / SQL/PGQ
 */
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

const SLED_EDGE_METADATA = [
  { edgeType: 'follows', displayName: 'Resident Signal Follow-Up', category: 'Constituent Services', description: 'A resident, agency, or partner signal led to a follow-up service workflow.' },
  { edgeType: 'collaborates', displayName: 'Interagency Collaboration', category: 'Agency Operations', description: 'Agencies or community partners coordinate on a shared service case.' },
  { edgeType: 'reshared', displayName: 'Public Communication Relay', category: 'Transparency', description: 'A public update or resident signal was relayed across channels.' },
  { edgeType: 'inspired_by', displayName: 'Policy or Program Dependency', category: 'Policy Compliance', description: 'A service workflow depends on a related policy, program, or eligibility record.' },
  { edgeType: 'tagged', displayName: 'Records Management Link', category: 'Records Management', description: 'A signal, case, inspection, or request references a shared public record.' },
  { edgeType: 'co_creator', displayName: 'Partner Service Delivery', category: 'Interagency Workflows', description: 'A partner organization contributes to service delivery or case resolution.' },
  { edgeType: 'mentions', displayName: 'Service Request Evidence', category: 'Resident Experience', description: 'A resident signal mentions a service, program, permit, inspection, or public assistance need.' },
];

const SOURCE_CHANNEL_LABELS = {
  instagram: 'Resident portal',
  tiktok: 'Mobile service app',
  youtube: 'Public meeting record',
  twitter: '311 contact center',
  twitch: 'Emergency operations desk',
  threads: 'Interagency queue',
};

const publicAgencyHandleSql = (alias = 'i') => `
  CASE
    WHEN LOWER(${alias}.handle) LIKE '@sled_partner_%'
      THEN '@agency_partner_' || SUBSTR(${alias}.handle, LENGTH('@sled_partner_') + 1)
    ELSE ${alias}.handle
  END`;

function toStoredPartnerHandle(handle) {
  const value = String(handle || '').trim();
  return value.replace(/^@agency_partner_/i, '@sled_partner_');
}

function toPublicPartnerHandle(handle) {
  return String(handle || '').replace(/^@sled_partner_/i, '@agency_partner_');
}

function sourceChannelLabel(value) {
  return SOURCE_CHANNEL_LABELS[String(value || '').toLowerCase()] || value;
}

const PUBLIC_GRAPH_KEYS = {
  INFLUENCER_ID: 'PARTNER_ID',
  influencer_id: 'partner_id',
  FROM_INFLUENCER: 'FROM_PARTNER',
  TO_INFLUENCER: 'TO_PARTNER',
  from_influencer: 'from_partner',
  to_influencer: 'to_partner',
  PLATFORM: 'SOURCE_CHANNEL',
  platform: 'source_channel',
  FOLLOWER_COUNT: 'CONSTITUENT_REACH',
  follower_count: 'constituent_reach',
  FROM_FOLLOWERS: 'FROM_CONSTITUENT_REACH',
  TO_FOLLOWERS: 'TO_CONSTITUENT_REACH',
  INFLUENCE_SCORE: 'COORDINATION_SCORE',
  influence_score: 'coordination_score',
  FROM_SCORE: 'FROM_COORDINATION_SCORE',
  TO_SCORE: 'TO_COORDINATION_SCORE',
  ENGAGEMENT_RATE: 'COLLABORATION_RATE',
  engagement_rate: 'collaboration_rate',
  FROM_ENGAGEMENT: 'FROM_COLLABORATION_RATE',
  TO_ENGAGEMENT: 'TO_COLLABORATION_RATE',
  RECENT_POSTS: 'RECENT_SIGNALS',
  recent_posts: 'recent_signals',
  POST_COUNT: 'SIGNAL_COUNT',
  post_count: 'signal_count',
};

function sanitizeGraphText(value, mappedKey = '') {
  if (mappedKey === 'SOURCE_CHANNEL' || mappedKey === 'source_channel' || /SOURCE_CHANNEL/.test(mappedKey)) {
    return sourceChannelLabel(value);
  }
  return toPublicPartnerHandle(String(value))
    .replace(/\bInfluencer\b/g, 'Community Partner')
    .replace(/\binfluencer\b/g, 'community partner')
    .replace(/\bPlatform\b/g, 'Source Channel')
    .replace(/\bplatform\b/g, 'source channel')
    .replace(/\bPost\b/g, 'Signal')
    .replace(/\bpost\b/g, 'signal')
    .replace(/\bSocial\b/g, 'Resident signal')
    .replace(/\bsocial\b/g, 'resident signal');
}

function sanitizeGraphPayload(value, mappedKey = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizeGraphPayload(item, mappedKey));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
      const nextKey = PUBLIC_GRAPH_KEYS[key] || key;
      return [nextKey, sanitizeGraphPayload(entryValue, nextKey)];
    }));
  }
  if (typeof value === 'string') return sanitizeGraphText(value, mappedKey);
  return value;
}

router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(sanitizeGraphPayload(payload));
  next();
});

function relationshipDisplayName(value) {
  return edgeMetadataFromType(value).displayName;
}

function normalizeGraphExampleRows(rows = []) {
  return rows.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      let nextValue = value;
      if (typeof nextValue === 'string') {
        nextValue = toPublicPartnerHandle(nextValue);
      }
      if (/CHANNEL|PLATFORM/i.test(key)) {
        nextValue = sourceChannelLabel(nextValue);
      }
      if (/RELATIONSHIP|TYPE/i.test(key) && typeof value === 'string') {
        nextValue = relationshipDisplayName(value);
      }
      normalized[key] = nextValue;
    }
    return normalized;
  });
}

function edgeMetadataFromType(type) {
  return SLED_EDGE_METADATA.find((item) => item.edgeType === type) || {
    edgeType: type,
    displayName: String(type || 'unknown').replace(/_/g, ' '),
    category: 'Other',
    description: 'State and Local Government relationship evidence.',
  };
}

router.get('/edge-metadata', async (_req, res) => {
  res.json(SLED_EDGE_METADATA);
});

// ── Helper: fetch connections for a set of node IDs in one query ───────────
async function fetchConnections(nodeIds, limit, demoUser) {
  if (!nodeIds.length) return [];
  const idList = [...new Set(nodeIds.map(Number))].join(',');
  const result = await db.executeAsUser(`
    SELECT ic.connection_id,
           ic.from_influencer, ic.to_influencer,
           ic.connection_type, ic.strength, ic.interaction_count,
           ${publicAgencyHandleSql('i_f')} AS from_handle,
           i_f.display_name     AS from_display,
           i_f.platform         AS from_platform,
           i_f.follower_count   AS from_followers,
           i_f.influence_score  AS from_score,
           i_f.niche            AS from_niche,
           i_f.city             AS from_city,
           i_f.is_verified      AS from_verified,
           i_f.engagement_rate  AS from_engagement,
           ${publicAgencyHandleSql('i_t')} AS to_handle,
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

// GET /api/graph/influencers - top community partners with optional partner/name search
router.get('/influencers', async (req, res) => {
  try {
    const { platform, niche, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    let where = 'WHERE 1=1';
    const binds = { limit };

    if (platform) { where += ' AND platform = :platform'; binds.platform = platform; }
    if (niche)    { where += ' AND niche = :niche';       binds.niche    = niche;    }
    if (search)   {
      where += ` AND (UPPER(${publicAgencyHandleSql('i')}) LIKE UPPER(:search) OR UPPER(display_name) LIKE UPPER(:search) OR UPPER(niche) LIKE UPPER(:search))`;
      binds.search = `%${search}%`;
    }

    const result = await db.executeAsUser(`
      SELECT influencer_id, ${publicAgencyHandleSql('i')} AS handle, display_name, platform,
             follower_count, engagement_rate, influence_score,
             niche, city, i.service_region_code, is_verified,
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
    console.error('Community partners graph list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/network/:id - ego network, depth 1-5 hops
// Returns: { center, nodes, edges, brands, stats }
router.get('/network/:id', async (req, res) => {
  try {
    const seedId = parseInt(req.params.id);
    const depth  = Math.min(parseInt(req.query.depth) || 3, 5);

    // ── Center node (full detail) ─────────────────────────────────────────
    const centerRes = await db.executeAsUser(`
      SELECT i.influencer_id, ${publicAgencyHandleSql('i')} AS handle, i.display_name, i.platform,
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

    if (!centerRes.rows.length) return res.status(404).json({ error: 'Community partner not found' });

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
      SELECT bil.link_id, bil.brand_id AS program_id, bil.relationship_type,
             bil.post_count AS signal_count, bil.avg_engagement AS avg_coordination,
             bil.revenue_attributed AS public_value_attributed,
             b.brand_name AS program_name, b.brand_category AS program_category,
             b.social_tier AS public_program_tier
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
      edgeMetadata: SLED_EDGE_METADATA,
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

// GET /api/graph/propagation/:brandSlug - public program coordination network
router.get('/propagation/:brandSlug', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT bil.influencer_id AS promoter_id,
             ${publicAgencyHandleSql('i1')} AS promoter_handle,
             i1.influence_score AS promoter_score,
             i1.follower_count  AS promoter_followers,
             bil.relationship_type,
             ic.to_influencer  AS reached_id,
             ${publicAgencyHandleSql('i2')} AS reached_handle,
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

    res.json(normalizeGraphExampleRows(result.rows));
  } catch (err) {
    console.error('Propagation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Predefined SQL/PGQ graph query examples ───────────────────────────────
const EXAMPLE_QUERIES = {
  influence_reach: {
    name: 'Service Reach (N-Hop Traversal)',
    description: 'Find community partners reachable within N hops from a starting partner using SQL/PGQ GRAPH_TABLE pattern matching for interagency service pathways.',
    params: [
      { key: 'handle', label: 'Starting Partner', default: '@agency_partner_0328' },
      { key: 'hops',   label: 'Max Hops (1-3)',  default: 2, type: 'number' },
    ],
    buildSql: (p) => ({
      sql: `SELECT partner_name, coordination_score, constituent_reach,
       source_channel, service_domain
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer) -[e IS connects_to]->{1,${Math.min(parseInt(p.hops)||2, 3)}} (v2 IS influencer)
    WHERE v1.handle = :handle
    COLUMNS (
        v2.handle AS partner_name,
        v2.influence_score AS coordination_score,
        v2.follower_count AS constituent_reach,
        v2.platform AS source_channel,
        v2.niche AS service_domain
    )
)
ORDER BY coordination_score DESC
FETCH FIRST 25 ROWS ONLY`,
      binds: { handle: toStoredPartnerHandle(p.handle || '@agency_partner_0328') },
      display: `-- SQL/PGQ: Find community partners within ${p.hops || 2} hops
SELECT partner_name, coordination_score,
       constituent_reach, source_channel, service_domain
FROM GRAPH_TABLE ( state_local_government_partner_network
    MATCH (v1 IS community_partner)
          -[e IS service_relationship]->{1,${p.hops || 2}}
          (v2 IS community_partner)
    WHERE v1.partner_name = '${toPublicPartnerHandle(p.handle || '@agency_partner_0328')}'
    COLUMNS (
        v2.partner_name,
        v2.coordination_score,
        v2.constituent_reach,
        v2.source_channel,
        v2.service_domain
    )
)
ORDER BY coordination_score DESC
FETCH FIRST 25 ROWS ONLY;`,
    }),
  },

  mutual_connections: {
    name: 'Shared Case Pathways (Triangle Pattern)',
    description: 'Find community partners that connect two agencies or service teams through a shared case, referral, inspection, or compliance workflow.',
    params: [
      { key: 'from_handle', label: 'From Partner (optional)', default: '' },
      { key: 'to_handle',   label: 'To Partner (optional)',   default: '' },
    ],
    buildSql: (p) => {
      const fromHandle = String(p.from_handle || '').trim();
      const toHandle = String(p.to_handle || '').trim();
      const hasPartnerPair = Boolean(fromHandle && toHandle);
      const partnerWhere = hasPartnerPair ? 'WHERE a.handle = :from_handle\n      AND b.handle = :to_handle' : 'WHERE a.handle < b.handle';
      const displayWhere = hasPartnerPair
        ? `WHERE a.partner_name = '${toPublicPartnerHandle(fromHandle)}'\n      AND b.partner_name = '${toPublicPartnerHandle(toHandle)}'`
        : 'WHERE a.partner_name < b.partner_name';
      return {
      sql: `SELECT source_partner, target_partner, mutual_partner, mutual_source_channel, mutual_constituent_reach,
       mutual_coordination_score, first_relationship, second_relationship,
       ROUND((e1_strength + e2_strength) / 2, 3) AS avg_strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (a IS influencer) -[e1 IS connects_to]-> (m IS influencer) <-[e2 IS connects_to]- (b IS influencer)
    ${partnerWhere}
    COLUMNS (
        a.handle AS source_partner,
        b.handle AS target_partner,
        m.handle AS mutual_partner,
        m.platform AS mutual_source_channel,
        m.follower_count AS mutual_constituent_reach,
        m.influence_score AS mutual_coordination_score,
        e1.connection_type AS first_relationship,
        e2.connection_type AS second_relationship,
        e1.strength AS e1_strength,
        e2.strength AS e2_strength
    )
)
ORDER BY avg_strength DESC
FETCH FIRST 20 ROWS ONLY`,
      binds: hasPartnerPair ? { from_handle: toStoredPartnerHandle(fromHandle), to_handle: toStoredPartnerHandle(toHandle) } : {},
      display: `-- SQL/PGQ: Triangle pattern - shared case pathways
SELECT source_partner, target_partner, mutual_partner, mutual_source_channel,
       mutual_constituent_reach, mutual_coordination_score,
       first_relationship, second_relationship,
       ROUND((e1_strength + e2_strength)/2, 3)
         AS avg_strength
FROM GRAPH_TABLE ( state_local_government_partner_network
    MATCH (a IS community_partner)
          -[e1 IS service_relationship]->
          (m IS community_partner)
          <-[e2 IS service_relationship]-
          (b IS community_partner)
    ${displayWhere}
    COLUMNS (
        m.partner_name AS mutual_partner,
        m.source_channel AS mutual_source_channel,
        m.constituent_reach AS mutual_constituent_reach,
        m.coordination_score AS mutual_coordination_score,
        e1.connection_type AS first_relationship,
        e2.connection_type AS second_relationship,
        e1.strength AS e1_strength,
        e2.strength AS e2_strength
    )
)
ORDER BY avg_strength DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },

  brand_propagation: {
    name: 'Public Program Coordination Network',
    description: 'Trace how a public program, benefit, permit, inspection, or emergency-response workflow connects community partners and agency teams.',
    params: [
      { key: 'brand_name', label: 'Public Program Name (optional)', default: '' },
    ],
    buildSql: (p) => {
      const programName = String(p.brand_name || '').trim();
      const programWhere = programName ? 'WHERE b.brand_name = :brand_name' : '';
      const displayWhere = programName ? `WHERE program.program_name = '${programName}'` : '';
      return {
      sql: `SELECT supporting_partner, reached_partner, program_relationship,
       service_relationship, strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (b IS brand) <-[e1 IS promotes]- (v1 IS influencer)
          -[e2 IS connects_to]-> (v2 IS influencer)
    ${programWhere}
    COLUMNS (
        v1.handle AS supporting_partner,
        v2.handle AS reached_partner,
        e1.relationship_type AS program_relationship,
        e2.connection_type AS service_relationship,
        e2.strength
    )
)
ORDER BY strength DESC
FETCH FIRST 30 ROWS ONLY`,
      binds: programName ? { brand_name: programName } : {},
      display: `-- SQL/PGQ: Public program coordination through partner network
SELECT supporting_partner, reached_partner,
       program_relationship,
       service_relationship, strength
FROM GRAPH_TABLE ( state_local_government_partner_network
    MATCH (program IS public_program)
          <-[e1 IS supports_program]-
          (v1 IS community_partner)
          -[e2 IS service_relationship]->
          (v2 IS community_partner)
    ${displayWhere}
    COLUMNS (
        v1.partner_name AS supporting_partner,
        v2.partner_name AS reached_partner,
        e1.relationship_type AS program_relationship,
        e2.connection_type AS service_relationship,
        e2.strength
    )
)
ORDER BY strength DESC
FETCH FIRST 30 ROWS ONLY;`,
      };
    },
  },

  cross_platform: {
    name: 'Multi-Channel Service Bridges',
    description: 'Identify partners that bridge resident portals, mobile service apps, 311 contact centers, public meeting records, and interagency queues.',
    params: [
      { key: 'min_platforms', label: 'Min Channels Connected', default: 2, type: 'number' },
    ],
    buildSql: (p) => ({
      sql: `SELECT partner_name, source_channel, coordination_score, constituent_reach,
       COUNT(DISTINCT dest_platform) AS channels_reached,
       COUNT(*) AS total_connections
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer) -[e IS connects_to]-> (v2 IS influencer)
    WHERE v1.platform != v2.platform
    COLUMNS (
        v1.handle AS partner_name,
        v1.platform AS source_channel,
        v1.influence_score AS coordination_score,
        v1.follower_count AS constituent_reach,
        v2.platform AS dest_platform
    )
)
GROUP BY partner_name, source_channel, coordination_score, constituent_reach
HAVING COUNT(DISTINCT dest_platform) >= :min_platforms
ORDER BY channels_reached DESC, coordination_score DESC
FETCH FIRST 20 ROWS ONLY`,
      binds: { min_platforms: parseInt(p.min_platforms) || 2 },
      display: `-- SQL/PGQ: Multi-channel service bridge detection
SELECT partner_name, source_channel,
       coordination_score, constituent_reach,
       COUNT(DISTINCT destination_channel)
         AS channels_reached,
       COUNT(*) AS total_connections
FROM GRAPH_TABLE ( state_local_government_partner_network
    MATCH (v1 IS community_partner)
          -[e IS service_relationship]->
          (v2 IS community_partner)
    WHERE v1.source_channel != v2.source_channel
    COLUMNS (
        v1.partner_name AS partner_name,
        v1.source_channel AS source_channel,
        v1.coordination_score AS coordination_score,
        v1.constituent_reach AS constituent_reach,
        v2.source_channel AS destination_channel
    )
)
GROUP BY partner_name, source_channel,
         coordination_score, constituent_reach
HAVING COUNT(DISTINCT destination_channel) >= ${p.min_platforms || 2}
ORDER BY channels_reached DESC,
         coordination_score DESC
FETCH FIRST 20 ROWS ONLY;`,
    }),
  },

  community_hubs: {
    name: 'Community Service Hub Detection',
    description: 'Find the most connected community partners by graph degree so agencies can spot high-impact handoff, referral, and service coordination hubs.',
    params: [
      { key: 'niche', label: 'Service Domain (optional)', default: '' },
    ],
    buildSql: (p) => {
      const nicheWhere = p.niche ? `\n    WHERE v1.niche = :niche` : '';
      return {
        sql: `SELECT partner_name, source_channel, service_domain,
       coordination_score, constituent_reach,
       COUNT(*) AS degree,
       COUNT(DISTINCT connection_type) AS edge_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( influencer_network
    MATCH (v1 IS influencer) -[e IS connects_to]-> (v2 IS influencer)${nicheWhere}
    COLUMNS (
        v1.handle AS partner_name,
        v1.platform AS source_channel,
        v1.niche AS service_domain,
        v1.influence_score AS coordination_score,
        v1.follower_count AS constituent_reach,
        e.connection_type,
        e.strength
    )
)
GROUP BY partner_name, source_channel, service_domain, coordination_score, constituent_reach
ORDER BY degree DESC, coordination_score DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: p.niche ? { niche: p.niche } : {},
        display: `-- SQL/PGQ: Community service hub detection (degree centrality)
SELECT partner_name, source_channel, service_domain,
       coordination_score, constituent_reach,
       COUNT(*) AS degree,
       COUNT(DISTINCT connection_type)
         AS edge_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( state_local_government_partner_network
    MATCH (v1 IS community_partner)
          -[e IS service_relationship]->
          (v2 IS community_partner)${p.niche ? `\n    WHERE v1.service_domain = '${p.niche}'` : ''}
    COLUMNS (
        v1.partner_name AS partner_name,
        v1.source_channel AS source_channel,
        v1.service_domain AS service_domain,
        v1.coordination_score AS coordination_score,
        v1.constituent_reach AS constituent_reach,
        e.connection_type, e.strength
    )
)
GROUP BY partner_name, source_channel, service_domain,
         coordination_score, constituent_reach
ORDER BY degree DESC, coordination_score DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },
};

// GET /api/graph/example-queries - list available queries with metadata
router.get('/example-queries', (req, res) => {
  const queries = Object.entries(EXAMPLE_QUERIES).map(([id, q]) => ({
    id,
    name: q.name,
    description: q.description,
    params: q.params,
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

    const { sql, binds, display } = queryDef.buildSql(params);
    const startTime = Date.now();
    const result = await db.executeAsUser(sql, binds, req.demoUser);
    const elapsed = Date.now() - startTime;

    res.json({
      queryId,
      name: queryDef.name,
      sql: display,
      rows: normalizeGraphExampleRows(result.rows),
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
