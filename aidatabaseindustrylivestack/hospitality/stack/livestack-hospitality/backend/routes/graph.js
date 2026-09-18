/**
 * Graph API — guest-risk network queries using Oracle Property Graph / SQL/PGQ.
 *
 * The endpoint names retain the original contract used by the frontend, but
 * the returned fields are compatibility aliases over guest-risk entities.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

const GUEST_ENTITY_TYPE = 'guest_profile';
const VISIBLE_ENTITY_TYPES = [
  GUEST_ENTITY_TYPE,
  'booking_channel',
  'payment_card',
  'venue_outlet',
];
const HIDDEN_CONTEXT_ENTITY_TYPES = [
  'device',
  'ip_address',
  'phone',
  'email',
];
const VISIBLE_ENTITY_TYPE_SQL = VISIBLE_ENTITY_TYPES.map(type => `'${type}'`).join(',');
const HIDDEN_CONTEXT_ENTITY_TYPE_SQL = HIDDEN_CONTEXT_ENTITY_TYPES.map(type => `'${type}'`).join(',');

function intParam(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function safeEntityIdList(nodeIds) {
  return [...new Set(nodeIds.map(Number).filter(Number.isFinite))];
}

// Fetch guest-risk relationships for a set of entity IDs in one query.
async function fetchConnections(nodeIds, limit, demoUser) {
  const ids = safeEntityIdList(nodeIds);
  if (!ids.length) return [];
  const binds = { limit };
  const placeholders = ids.map((id, index) => {
    const key = `id${index}`;
    binds[key] = id;
    return `:${key}`;
  }).join(',');

  const result = await db.executeAsUser(`
    SELECT fr.relationship_id AS connection_id,
           fr.from_entity AS from_influencer,
           fr.to_entity AS to_influencer,
           fr.relationship_type AS connection_type,
           fr.strength,
           fr.event_count AS interaction_count,
           fr.total_amount,
           fr.first_seen,
           fr.last_seen AS last_interaction,
           e_f.entity_key AS from_handle,
           e_f.display_name AS from_display,
           e_f.channel AS from_platform,
           e_f.total_amount AS from_followers,
           e_f.risk_score AS from_score,
           e_f.entity_type AS from_niche,
           e_f.city AS from_city,
           e_f.is_confirmed_fraud AS from_verified,
           ROUND(e_f.risk_score / 100, 4) AS from_engagement,
           e_f.risk_level AS from_risk_level,
           e_f.event_count AS from_event_count,
           e_t.entity_key AS to_handle,
           e_t.display_name AS to_display,
           e_t.channel AS to_platform,
           e_t.total_amount AS to_followers,
           e_t.risk_score AS to_score,
           e_t.entity_type AS to_niche,
           e_t.city AS to_city,
           e_t.is_confirmed_fraud AS to_verified,
           ROUND(e_t.risk_score / 100, 4) AS to_engagement,
           e_t.risk_level AS to_risk_level,
           e_t.event_count AS to_event_count
    FROM fraud_relationships fr
    JOIN fraud_entities e_f ON fr.from_entity = e_f.entity_id
    JOIN fraud_entities e_t ON fr.to_entity = e_t.entity_id
    WHERE fr.from_entity IN (${placeholders})
       OR fr.to_entity IN (${placeholders})
    ORDER BY fr.strength DESC, fr.total_amount DESC
    FETCH FIRST :limit ROWS ONLY
  `, binds, demoUser);

  return result.rows;
}

async function fetchVisibleConnections(limit, demoUser) {
  const result = await db.executeAsUser(`
    SELECT fr.relationship_id AS connection_id,
           fr.from_entity AS from_influencer,
           fr.to_entity AS to_influencer,
           fr.relationship_type AS connection_type,
           fr.strength,
           fr.event_count AS interaction_count,
           fr.total_amount,
           fr.first_seen,
           fr.last_seen AS last_interaction,
           e_f.entity_key AS from_handle,
           e_f.display_name AS from_display,
           e_f.channel AS from_platform,
           e_f.total_amount AS from_followers,
           e_f.risk_score AS from_score,
           e_f.entity_type AS from_niche,
           e_f.city AS from_city,
           e_f.is_confirmed_fraud AS from_verified,
           ROUND(e_f.risk_score / 100, 4) AS from_engagement,
           e_f.risk_level AS from_risk_level,
           e_f.event_count AS from_event_count,
           e_t.entity_key AS to_handle,
           e_t.display_name AS to_display,
           e_t.channel AS to_platform,
           e_t.total_amount AS to_followers,
           e_t.risk_score AS to_score,
           e_t.entity_type AS to_niche,
           e_t.city AS to_city,
           e_t.is_confirmed_fraud AS to_verified,
           ROUND(e_t.risk_score / 100, 4) AS to_engagement,
           e_t.risk_level AS to_risk_level,
           e_t.event_count AS to_event_count
    FROM fraud_relationships fr
    JOIN fraud_entities e_f ON fr.from_entity = e_f.entity_id
    JOIN fraud_entities e_t ON fr.to_entity = e_t.entity_id
    WHERE e_f.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})
      AND e_t.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})
      AND (
        e_f.entity_type = '${GUEST_ENTITY_TYPE}'
        OR e_t.entity_type = '${GUEST_ENTITY_TYPE}'
        OR e_f.channel = 'payments'
        OR e_t.channel = 'payments'
      )
    ORDER BY fr.strength DESC, fr.total_amount DESC
    FETCH FIRST :limit ROWS ONLY
  `, { limit }, demoUser);

  return result.rows;
}

async function fetchGuestContextConnections(limit, demoUser) {
  const result = await db.executeAsUser(`
    WITH guest_shared AS (
      SELECT CASE
               WHEN e_f.entity_type = '${GUEST_ENTITY_TYPE}' THEN e_f.entity_id
               ELSE e_t.entity_id
             END AS guest_id,
             CASE
               WHEN e_f.entity_type = '${GUEST_ENTITY_TYPE}' THEN e_t.entity_id
               ELSE e_f.entity_id
             END AS shared_id,
             fr.relationship_type,
             fr.strength,
             fr.event_count,
             fr.total_amount,
             fr.first_seen,
             fr.last_seen
      FROM fraud_relationships fr
      JOIN fraud_entities e_f ON fr.from_entity = e_f.entity_id
      JOIN fraud_entities e_t ON fr.to_entity = e_t.entity_id
      WHERE (
        e_f.entity_type = '${GUEST_ENTITY_TYPE}'
        AND e_t.entity_type IN (${HIDDEN_CONTEXT_ENTITY_TYPE_SQL})
      ) OR (
        e_t.entity_type = '${GUEST_ENTITY_TYPE}'
        AND e_f.entity_type IN (${HIDDEN_CONTEXT_ENTITY_TYPE_SQL})
      )
    ),
    pair_rows AS (
      SELECT g1.entity_id AS from_influencer,
             g2.entity_id AS to_influencer,
             CASE
               WHEN shared.entity_type IN ('device', 'ip_address') THEN 'shared_stay_context'
               WHEN shared.entity_type IN ('phone', 'email') THEN 'shared_guest_contact'
               ELSE 'shared_guest_context'
             END AS connection_type,
             LEAST(gs1.strength, gs2.strength) AS strength,
             NVL(gs1.event_count, 0) + NVL(gs2.event_count, 0) AS interaction_count,
             GREATEST(NVL(gs1.total_amount, 0), NVL(gs2.total_amount, 0)) AS total_amount,
             LEAST(gs1.first_seen, gs2.first_seen) AS first_seen,
             GREATEST(gs1.last_seen, gs2.last_seen) AS last_interaction,
             g1.entity_key AS from_handle,
             g1.display_name AS from_display,
             g1.channel AS from_platform,
             g1.total_amount AS from_followers,
             g1.risk_score AS from_score,
             g1.entity_type AS from_niche,
             g1.city AS from_city,
             g1.is_confirmed_fraud AS from_verified,
             ROUND(g1.risk_score / 100, 4) AS from_engagement,
             g1.risk_level AS from_risk_level,
             g1.event_count AS from_event_count,
             g2.entity_key AS to_handle,
             g2.display_name AS to_display,
             g2.channel AS to_platform,
             g2.total_amount AS to_followers,
             g2.risk_score AS to_score,
             g2.entity_type AS to_niche,
             g2.city AS to_city,
             g2.is_confirmed_fraud AS to_verified,
             ROUND(g2.risk_score / 100, 4) AS to_engagement,
             g2.risk_level AS to_risk_level,
             g2.event_count AS to_event_count
      FROM guest_shared gs1
      JOIN guest_shared gs2
        ON gs1.shared_id = gs2.shared_id
       AND gs1.guest_id < gs2.guest_id
      JOIN fraud_entities shared ON shared.entity_id = gs1.shared_id
      JOIN fraud_entities g1 ON g1.entity_id = gs1.guest_id
      JOIN fraud_entities g2 ON g2.entity_id = gs2.guest_id
    )
    SELECT 900000 + ROW_NUMBER() OVER (ORDER BY q.strength DESC, q.total_amount DESC) AS connection_id,
           q.*
    FROM (
      SELECT from_influencer,
             to_influencer,
             connection_type,
             MAX(strength) AS strength,
             SUM(interaction_count) AS interaction_count,
             SUM(total_amount) AS total_amount,
             MIN(first_seen) AS first_seen,
             MAX(last_interaction) AS last_interaction,
             from_handle,
             from_display,
             from_platform,
             from_followers,
             from_score,
             from_niche,
             from_city,
             from_verified,
             from_engagement,
             from_risk_level,
             from_event_count,
             to_handle,
             to_display,
             to_platform,
             to_followers,
             to_score,
             to_niche,
             to_city,
             to_verified,
             to_engagement,
             to_risk_level,
             to_event_count
      FROM pair_rows
      GROUP BY from_influencer,
               to_influencer,
               connection_type,
               from_handle,
               from_display,
               from_platform,
               from_followers,
               from_score,
               from_niche,
               from_city,
               from_verified,
               from_engagement,
               from_risk_level,
               from_event_count,
               to_handle,
               to_display,
               to_platform,
               to_followers,
               to_score,
               to_niche,
               to_city,
               to_verified,
               to_engagement,
               to_risk_level,
               to_event_count
    ) q
    ORDER BY q.strength DESC, q.total_amount DESC
    FETCH FIRST :limit ROWS ONLY
  `, { limit }, demoUser);

  return result.rows;
}

function isVisibleNode(node) {
  return VISIBLE_ENTITY_TYPES.includes(node?.NICHE);
}

function nodeFromEdge(row, side) {
  const from = side === 'from';
  return {
    INFLUENCER_ID: from ? row.FROM_INFLUENCER : row.TO_INFLUENCER,
    HANDLE: from ? row.FROM_HANDLE : row.TO_HANDLE,
    DISPLAY_NAME: from ? row.FROM_DISPLAY : row.TO_DISPLAY,
    PLATFORM: from ? row.FROM_PLATFORM : row.TO_PLATFORM,
    FOLLOWER_COUNT: from ? row.FROM_FOLLOWERS : row.TO_FOLLOWERS,
    INFLUENCE_SCORE: from ? row.FROM_SCORE : row.TO_SCORE,
    NICHE: from ? row.FROM_NICHE : row.TO_NICHE,
    CITY: from ? row.FROM_CITY : row.TO_CITY,
    IS_VERIFIED: from ? row.FROM_VERIFIED : row.TO_VERIFIED,
    ENGAGEMENT_RATE: from ? row.FROM_ENGAGEMENT : row.TO_ENGAGEMENT,
    RISK_LEVEL: from ? row.FROM_RISK_LEVEL : row.TO_RISK_LEVEL,
    EVENT_COUNT: from ? row.FROM_EVENT_COUNT : row.TO_EVENT_COUNT,
  };
}

// GET /api/graph/influencers — guest-risk entities with optional channel/type/search filters.
router.get('/influencers', async (req, res) => {
  try {
    const { platform, niche, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    let where = `WHERE entity_type = '${GUEST_ENTITY_TYPE}'`;
    const binds = { limit };

    if (platform) {
      where += ' AND channel = :platform';
      binds.platform = platform;
    }
    if (niche && niche === GUEST_ENTITY_TYPE) {
      where += ' AND entity_type = :niche';
      binds.niche = niche;
    }
    if (search) {
      where += ` AND (
        UPPER(entity_key) LIKE UPPER(:search)
        OR UPPER(display_name) LIKE UPPER(:search)
        OR UPPER(entity_type) LIKE UPPER(:search)
        OR UPPER(risk_level) LIKE UPPER(:search)
      )`;
      binds.search = `%${search}%`;
    }

    const result = await db.executeAsUser(`
      SELECT entity_id AS influencer_id,
             entity_key AS handle,
             display_name,
             channel AS platform,
             total_amount AS follower_count,
             ROUND(risk_score / 100, 4) AS engagement_rate,
             risk_score AS influence_score,
             entity_type AS niche,
             city,
             is_confirmed_fraud AS is_verified,
             risk_level,
             event_count,
             (SELECT COUNT(*)
              FROM fraud_relationships fr
              JOIN fraud_entities other
                ON other.entity_id = CASE
                  WHEN fr.from_entity = e.entity_id THEN fr.to_entity
                  ELSE fr.from_entity
                END
              WHERE (fr.from_entity = e.entity_id
                 OR fr.to_entity = e.entity_id)
                 AND other.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})) AS connection_count,
             event_count AS recent_posts
      FROM fraud_entities e
      ${where}
      ORDER BY risk_score DESC, total_amount DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Guest-risk entities error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/network/:id — ego guest-risk network, depth 1-5 hops.
router.get('/network/:id', async (req, res) => {
  try {
    const seedId = parseInt(req.params.id, 10);
    const depth = intParam(req.query.depth, 3, 5);

    const centerRes = await db.executeAsUser(`
      SELECT e.entity_id AS influencer_id,
             e.entity_key AS handle,
             e.display_name,
             e.channel AS platform,
             e.total_amount AS follower_count,
             ROUND(e.risk_score / 100, 4) AS engagement_rate,
             e.risk_score AS influence_score,
             e.entity_type AS niche,
             e.city,
             e.is_confirmed_fraud AS is_verified,
             e.risk_level,
             e.event_count,
             e.total_amount,
             e.event_count AS recent_posts,
             (SELECT COUNT(*)
              FROM fraud_relationships fr
              WHERE fr.from_entity = e.entity_id
                 OR fr.to_entity = e.entity_id) AS total_connections,
             (SELECT COUNT(*)
              FROM fraud_case_entities fce
              WHERE fce.entity_id = e.entity_id) AS brand_count
      FROM fraud_entities e
      WHERE e.entity_id = :id
        AND e.entity_type = '${GUEST_ENTITY_TYPE}'
    `, { id: seedId }, req.demoUser);

    if (!centerRes.rows.length) {
      return res.status(404).json({ error: 'Guest profile entity not found' });
    }

    const visibleRows = await fetchVisibleConnections(400, req.demoUser);
    const contextRows = await fetchGuestContextConnections(300, req.demoUser);
    const graphRows = [...contextRows, ...visibleRows];
    const candidateNodes = new Map([[seedId, centerRes.rows[0]]]);
    const adjacency = new Map();
    const nodesMap = new Map();
    const edgesSet = new Set();
    const edgesList = [];

    const addNode = (row, type, hopLevel) => {
      const id = row.INFLUENCER_ID;
      if (!nodesMap.has(id)) nodesMap.set(id, { ...row, type, hopLevel });
    };

    const addEdge = (row, hopLevel) => {
      const key = [
        Math.min(row.FROM_INFLUENCER, row.TO_INFLUENCER),
        Math.max(row.FROM_INFLUENCER, row.TO_INFLUENCER),
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
        amount: row.TOTAL_AMOUNT,
        hopLevel,
      });
    };

    const addCandidateNode = (row, side) => {
      const node = nodeFromEdge(row, side);
      if (isVisibleNode(node) && !candidateNodes.has(node.INFLUENCER_ID)) {
        candidateNodes.set(node.INFLUENCER_ID, node);
      }
    };

    const addAdjacentRow = (id, row) => {
      if (!adjacency.has(id)) adjacency.set(id, []);
      adjacency.get(id).push(row);
    };

    for (const row of graphRows) {
      addCandidateNode(row, 'from');
      addCandidateNode(row, 'to');
      if (!candidateNodes.has(row.FROM_INFLUENCER) || !candidateNodes.has(row.TO_INFLUENCER)) continue;
      addAdjacentRow(row.FROM_INFLUENCER, row);
      addAdjacentRow(row.TO_INFLUENCER, row);
    }

    const hopById = new Map([[seedId, 0]]);
    let frontier = [seedId];
    for (let hopLevel = 1; hopLevel <= depth; hopLevel += 1) {
      const nextFrontier = [];
      for (const id of frontier) {
        for (const row of adjacency.get(id) || []) {
          const otherId = row.FROM_INFLUENCER === id ? row.TO_INFLUENCER : row.FROM_INFLUENCER;
          if (!hopById.has(otherId)) {
            hopById.set(otherId, hopLevel);
            nextFrontier.push(otherId);
          }
        }
      }
      frontier = nextFrontier;
      if (!frontier.length) break;
    }

    for (const [id, hopLevel] of hopById.entries()) {
      const node = candidateNodes.get(id);
      if (!node) continue;
      addNode(node, id === seedId ? 'center' : `hop${hopLevel}`, hopLevel);
    }

    for (const row of graphRows) {
      const sourceHop = hopById.get(row.FROM_INFLUENCER);
      const targetHop = hopById.get(row.TO_INFLUENCER);
      if (sourceHop === undefined || targetHop === undefined) continue;
      addEdge(row, Math.max(sourceHop, targetHop));
    }
    const center = {
      ...centerRes.rows[0],
      TOTAL_CONNECTIONS: edgesList.filter(edge => edge.source === seedId || edge.target === seedId).length,
    };

    const casesRes = await db.executeAsUser(`
      SELECT fce.case_entity_id AS link_id,
             fc.case_id AS brand_id,
             fce.role AS relationship_type,
             fc.event_count AS post_count,
             ROUND(fc.risk_score / 100, 4) AS avg_engagement,
             fc.loss_amount AS revenue_attributed,
             fc.case_ref AS brand_name,
             fc.case_type AS brand_category,
             fc.status AS social_tier,
             fc.risk_score,
             fc.opened_at
      FROM fraud_case_entities fce
      JOIN fraud_cases fc ON fce.case_id = fc.case_id
      WHERE fce.entity_id = :id
      ORDER BY fc.risk_score DESC, fc.loss_amount DESC
    `, { id: seedId }, req.demoUser);

    res.json({
      center,
      nodes: Array.from(nodesMap.values()),
      edges: edgesList,
      brands: casesRes.rows,
      stats: {
        nodeCount: nodesMap.size,
        edgeCount: edgesList.length,
        brandCount: casesRes.rows.length,
        depth,
      },
    });
  } catch (err) {
    console.error('Guest-risk network error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/propagation/:caseRef — entities linked to a guest service case.
router.get('/propagation/:caseRef', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT fc.case_ref,
             fc.case_type,
             e.entity_id AS entity_id,
             e.entity_key AS entity_key,
             e.display_name,
             e.entity_type,
             e.risk_score,
             e.total_amount,
             fce.role,
             fr.to_entity AS reached_id,
             reached.entity_key AS reached_entity,
             reached.risk_score AS reached_risk_score,
             fr.relationship_type,
             fr.strength AS connection_strength
      FROM fraud_cases fc
      JOIN fraud_case_entities fce ON fc.case_id = fce.case_id
      JOIN fraud_entities e ON fce.entity_id = e.entity_id
      LEFT JOIN fraud_relationships fr ON fr.from_entity = e.entity_id
      LEFT JOIN fraud_entities reached ON fr.to_entity = reached.entity_id
      WHERE LOWER(fc.case_ref) = LOWER(:case_ref)
        AND e.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})
        AND (reached.entity_id IS NULL OR reached.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL}))
      ORDER BY e.risk_score DESC, fr.strength DESC NULLS LAST
      FETCH FIRST 100 ROWS ONLY
    `, { case_ref: req.params.caseRef }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Guest service case propagation error:', err);
    res.status(500).json({ error: err.message });
  }
});

const EXAMPLE_QUERIES = {
  fraud_ring_reach: {
    name: 'Guest-Centered Risk Reach (N-Hop Traversal)',
    description: 'Trace guest profiles plus payment channels and venue settlement nodes reachable from a guest seed using SQL/PGQ graph traversal.',
    params: [
      { key: 'entity_key', label: 'Seed Entity', default: 'GUEST-8841' },
      { key: 'hops', label: 'Max Hops (1-3)', default: 2, type: 'number' },
    ],
    buildSql: (p) => {
      const hops = intParam(p.hops, 2, 3);
      const entityKey = p.entity_key || 'GUEST-8841';
      return {
        sql: `SELECT DISTINCT entity_key, display_name, entity_type,
       risk_score, risk_level, total_amount, channel
FROM GRAPH_TABLE ( fraud_network
    MATCH (seed IS entity) -[e IS related_to]->{1,${hops}} (reached IS entity)
    WHERE seed.entity_key = :entity_key
      AND seed.entity_type = 'guest_profile'
    COLUMNS (
        reached.entity_key AS entity_key,
        reached.display_name AS display_name,
        reached.entity_type AS entity_type,
        reached.risk_score AS risk_score,
        reached.risk_level AS risk_level,
        reached.total_amount AS total_amount,
        reached.channel AS channel
    )
)
WHERE entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})
ORDER BY risk_score DESC
FETCH FIRST 25 ROWS ONLY`,
        binds: { entity_key: entityKey },
        display: `-- SQL/PGQ: Guest and payment entities within ${hops} hops
SELECT DISTINCT entity_key, display_name, entity_type,
       risk_score, risk_level, total_amount, channel
FROM GRAPH_TABLE ( fraud_network
    MATCH (seed IS entity)
          -[e IS related_to]->{1,${hops}}
          (reached IS entity)
    WHERE seed.entity_key = '${entityKey}'
      AND seed.entity_type = 'guest_profile'
    COLUMNS (
        reached.entity_key AS entity_key,
        reached.display_name AS display_name,
        reached.entity_type AS entity_type,
        reached.risk_score AS risk_score,
        reached.risk_level AS risk_level,
        reached.total_amount AS total_amount,
        reached.channel AS channel
    )
)
WHERE entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})
ORDER BY risk_score DESC
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  shared_guest_context: {
    name: 'Shared Guest Context',
    description: 'Find guest profiles connected through shared evidence context while suppressing raw technical identifiers.',
    params: [
      { key: 'min_risk', label: 'Minimum Operations Risk Score', default: 70, type: 'number' },
    ],
    buildSql: (p) => {
      const minOperationsRisk = parseInt(p.min_risk, 10) || 70;
      return {
        sql: `SELECT guest_profile_a,
       CASE
         WHEN shared_type IN ('device', 'ip_address') THEN 'shared_stay_context'
         WHEN shared_type IN ('phone', 'email') THEN 'shared_guest_contact'
         ELSE 'shared_guest_context'
       END AS guest_context,
       guest_profile_b,
       a_risk, b_risk,
       ROUND((a_risk + b_risk) / 2, 1) AS combined_risk
FROM GRAPH_TABLE ( fraud_network
    MATCH (a IS entity) -[e1 IS related_to]-> (shared IS entity) <-[e2 IS related_to]- (b IS entity)
    WHERE a.entity_type = 'guest_profile'
      AND b.entity_type = 'guest_profile'
      AND a.entity_id < b.entity_id
      AND shared.entity_type IN ('device','ip_address','phone','email')
      AND (a.risk_score >= :min_risk OR b.risk_score >= :min_risk)
    COLUMNS (
        a.entity_key AS guest_profile_a,
        shared.entity_type AS shared_type,
        b.entity_key AS guest_profile_b,
        a.risk_score AS a_risk,
        b.risk_score AS b_risk
    )
)
ORDER BY combined_risk DESC, guest_context
FETCH FIRST 25 ROWS ONLY`,
        binds: { min_risk: minOperationsRisk },
        display: `-- SQL/PGQ: Guest profiles linked by shared context
SELECT guest_profile_a,
       CASE
         WHEN shared_type IN ('device', 'ip_address') THEN 'shared_stay_context'
         WHEN shared_type IN ('phone', 'email') THEN 'shared_guest_contact'
         ELSE 'shared_guest_context'
       END AS guest_context,
       guest_profile_b,
       a_risk, b_risk,
       ROUND((a_risk + b_risk) / 2, 1) AS combined_risk
FROM GRAPH_TABLE ( fraud_network
    MATCH (a IS entity)
          -[e1 IS related_to]-> (shared IS entity)
          <-[e2 IS related_to]- (b IS entity)
    WHERE a.entity_type = 'guest_profile'
      AND b.entity_type = 'guest_profile'
      AND a.entity_id < b.entity_id
      AND shared.entity_type IN ('device','ip_address','phone','email')
      AND (a.risk_score >= ${minOperationsRisk} OR b.risk_score >= ${minOperationsRisk})
    COLUMNS (
        a.entity_key AS guest_profile_a,
        shared.entity_type AS shared_type,
        b.entity_key AS guest_profile_b,
        a.risk_score AS a_risk,
        b.risk_score AS b_risk
    )
)
ORDER BY combined_risk DESC, guest_context
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  folio_settlement_flow: {
    name: 'Folio Checkout Closeout Flow',
    description: 'Identify high-risk guest profiles converging on a shared OTA channel or folio settlement destination.',
    params: [
      { key: 'min_amount', label: 'Minimum Amount', default: 2500, type: 'number' },
    ],
    buildSql: (p) => {
      const minAmount = parseInt(p.min_amount, 10) || 2500;
      return {
        sql: `SELECT source_guest_profile, shared_channel, related_guest_profile,
       source_amount, related_amount,
       source_risk, related_risk
FROM GRAPH_TABLE ( fraud_network
    MATCH (src IS entity) -[e1 IS related_to]-> (channel IS entity) <-[e2 IS related_to]- (other IS entity)
    WHERE src.entity_type = 'guest_profile'
      AND other.entity_type = 'guest_profile'
      AND src.entity_id < other.entity_id
      AND channel.entity_type = 'booking_channel'
      AND e1.total_amount >= :min_amount
    COLUMNS (
        src.entity_key AS source_guest_profile,
        channel.entity_key AS shared_channel,
        other.entity_key AS related_guest_profile,
        e1.total_amount AS source_amount,
        e2.total_amount AS related_amount,
        src.risk_score AS source_risk,
        other.risk_score AS related_risk
    )
)
ORDER BY source_amount DESC, source_risk DESC
FETCH FIRST 25 ROWS ONLY`,
        binds: { min_amount: minAmount },
        display: `-- SQL/PGQ: Guest profiles converging on shared booking channels
SELECT source_guest_profile, shared_channel, related_guest_profile,
       source_amount, related_amount,
       source_risk, related_risk
FROM GRAPH_TABLE ( fraud_network
    MATCH (src IS entity)
          -[e1 IS related_to]-> (channel IS entity)
          <-[e2 IS related_to]- (other IS entity)
    WHERE src.entity_type = 'guest_profile'
      AND other.entity_type = 'guest_profile'
      AND src.entity_id < other.entity_id
      AND channel.entity_type = 'booking_channel'
      AND e1.total_amount >= ${minAmount}
    COLUMNS (
        src.entity_key AS source_guest_profile,
        channel.entity_key AS shared_channel,
        other.entity_key AS related_guest_profile,
        e1.total_amount AS source_amount,
        e2.total_amount AS related_amount,
        src.risk_score AS source_risk,
        other.risk_score AS related_risk
    )
)
ORDER BY source_amount DESC, source_risk DESC
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  cross_channel_takeover: {
    name: 'Guest Payment Channel Coverage',
    description: 'Spot folio/payment nodes touched by multiple guest profiles across web, mobile, kiosk, property, and contact-center channels.',
    params: [
      { key: 'min_channels', label: 'Minimum Guest Profiles', default: 2, type: 'number' },
    ],
    buildSql: (p) => {
      const minChannels = parseInt(p.min_channels, 10) || 2;
      return {
        sql: `SELECT payment_node, payment_type,
       COUNT(DISTINCT guest_profile_key) AS guest_profiles_seen,
       COUNT(DISTINCT channel) AS channels_seen,
       ROUND(AVG(risk_score), 1) AS avg_risk,
       SUM(edge_amount) AS exposure
FROM GRAPH_TABLE ( fraud_network
    MATCH (profile IS entity) -[e IS related_to]-> (payment IS entity)
    WHERE profile.entity_type = 'guest_profile'
      AND payment.entity_type IN ('booking_channel','payment_card','venue_outlet')
    COLUMNS (
        profile.entity_key AS guest_profile_key,
        profile.channel AS channel,
        profile.risk_score AS risk_score,
        e.total_amount AS edge_amount,
        payment.entity_key AS payment_node,
        payment.entity_type AS payment_type
    )
)
GROUP BY payment_node, payment_type
HAVING COUNT(DISTINCT guest_profile_key) >= :min_channels
ORDER BY guest_profiles_seen DESC, avg_risk DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: { min_channels: minChannels },
        display: `-- SQL/PGQ: Guest profile coverage across payment nodes
SELECT payment_node, payment_type,
       COUNT(DISTINCT guest_profile_key) AS guest_profiles_seen,
       COUNT(DISTINCT channel) AS channels_seen,
       ROUND(AVG(risk_score), 1) AS avg_risk,
       SUM(edge_amount) AS exposure
FROM GRAPH_TABLE ( fraud_network
    MATCH (profile IS entity)
          -[e IS related_to]-> (payment IS entity)
    WHERE profile.entity_type = 'guest_profile'
      AND payment.entity_type IN ('booking_channel','payment_card','venue_outlet')
    COLUMNS (
        profile.entity_key AS guest_profile_key,
        profile.channel AS channel,
        profile.risk_score AS risk_score,
        e.total_amount AS edge_amount,
        payment.entity_key AS payment_node,
        payment.entity_type AS payment_type
    )
)
GROUP BY payment_node, payment_type
HAVING COUNT(DISTINCT guest_profile_key) >= ${minChannels}
ORDER BY guest_profiles_seen DESC, avg_risk DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },

  risk_hubs: {
    name: 'Guest and Payment Hub Detection',
    description: 'Rank guest profiles and payment-supporting nodes by graph degree, guest risk, and revenue exposure.',
    params: [
      { key: 'entity_type', label: 'Entity Type (optional)', default: '' },
    ],
    buildSql: (p) => {
      const requestedType = String(p.entity_type || '').trim();
      const entityType = VISIBLE_ENTITY_TYPES.includes(requestedType) ? requestedType : '';
      const typeWhere = entityType
        ? `\n    WHERE src.entity_type = :entity_type`
        : `\n    WHERE src.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})`;
      return {
        sql: `SELECT entity_key, entity_type, risk_level, risk_score,
       total_amount, COUNT(*) AS degree,
       COUNT(DISTINCT relationship_type) AS relationship_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( fraud_network
    MATCH (src IS entity) -[e IS related_to]-> (dst IS entity)${typeWhere}
    COLUMNS (
        src.entity_key AS entity_key,
        src.entity_type AS entity_type,
        src.risk_level AS risk_level,
        src.risk_score AS risk_score,
        src.total_amount AS total_amount,
        e.relationship_type AS relationship_type,
        e.strength AS strength
    )
)
GROUP BY entity_key, entity_type, risk_level, risk_score, total_amount
ORDER BY degree DESC, risk_score DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: entityType ? { entity_type: entityType } : {},
        display: `-- SQL/PGQ: Guest and payment degree centrality
SELECT entity_key, entity_type, risk_level, risk_score,
       total_amount, COUNT(*) AS degree,
       COUNT(DISTINCT relationship_type) AS relationship_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( fraud_network
    MATCH (src IS entity)
          -[e IS related_to]->
          (dst IS entity)${entityType ? `\n    WHERE src.entity_type = '${entityType}'` : `\n    WHERE src.entity_type IN (${VISIBLE_ENTITY_TYPE_SQL})`}
    COLUMNS (
        src.entity_key AS entity_key,
        src.entity_type AS entity_type,
        src.risk_level AS risk_level,
        src.risk_score AS risk_score,
        src.total_amount AS total_amount,
        e.relationship_type AS relationship_type,
        e.strength AS strength
    )
)
GROUP BY entity_key, entity_type, risk_level, risk_score, total_amount
ORDER BY degree DESC, risk_score DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },
};

router.get('/example-queries', (req, res) => {
  const queries = Object.entries(EXAMPLE_QUERIES).map(([id, query]) => ({
    id,
    name: query.name,
    description: query.description,
    params: query.params,
  }));
  res.json(queries);
});

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
    console.error('Guest-risk graph example query error:', err);
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    res.status(500).json({
      error: err.message,
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
