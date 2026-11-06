/**
 * Graph API — returns relationship queries using Oracle Property Graph / SQL/PGQ.
 *
 * The endpoint names retain the original contract used by the frontend, but
 * the returned fields are compatibility aliases over returns entities.
 */
const express = require('express');
const router = express.Router();
const db = require('../config/database');

function intParam(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function safeEntityIdList(nodeIds) {
  return [...new Set(nodeIds.map(Number).filter(Number.isFinite))];
}

// Fetch returns relationships for a set of entity IDs in one query.
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
           e_f.review_score AS from_score,
           e_f.entity_type AS from_niche,
           e_f.city AS from_city,
           e_f.is_confirmed_returns AS from_verified,
           ROUND(e_f.review_score / 100, 4) AS from_engagement,
           e_f.review_level AS from_review_level,
           e_f.event_count AS from_event_count,
           e_t.entity_key AS to_handle,
           e_t.display_name AS to_display,
           e_t.channel AS to_platform,
           e_t.total_amount AS to_followers,
           e_t.review_score AS to_score,
           e_t.entity_type AS to_niche,
           e_t.city AS to_city,
           e_t.is_confirmed_returns AS to_verified,
           ROUND(e_t.review_score / 100, 4) AS to_engagement,
           e_t.review_level AS to_review_level,
           e_t.event_count AS to_event_count
    FROM returns_relationships fr
    JOIN returns_entities e_f ON fr.from_entity = e_f.entity_id
    JOIN returns_entities e_t ON fr.to_entity = e_t.entity_id
    WHERE fr.from_entity IN (${placeholders})
       OR fr.to_entity IN (${placeholders})
    ORDER BY fr.strength DESC, fr.total_amount DESC
    FETCH FIRST :limit ROWS ONLY
  `, binds, demoUser);

  return result.rows;
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
    REVIEW_LEVEL: from ? row.FROM_REVIEW_LEVEL : row.TO_REVIEW_LEVEL,
    EVENT_COUNT: from ? row.FROM_EVENT_COUNT : row.TO_EVENT_COUNT,
  };
}

// GET /api/graph/influencers — returns entities with optional channel/type/search filters.
router.get('/influencers', async (req, res) => {
  try {
    const { platform, niche, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    let where = 'WHERE 1=1';
    const binds = { limit };

    if (platform) {
      where += ' AND channel = :platform';
      binds.platform = platform;
    }
    if (niche) {
      where += ' AND entity_type = :niche';
      binds.niche = niche;
    }
    if (search) {
      where += ` AND (
        UPPER(entity_key) LIKE UPPER(:search)
        OR UPPER(display_name) LIKE UPPER(:search)
        OR UPPER(entity_type) LIKE UPPER(:search)
        OR UPPER(review_level) LIKE UPPER(:search)
      )`;
      binds.search = `%${search}%`;
    }

    const result = await db.executeAsUser(`
      SELECT entity_id AS influencer_id,
             entity_key AS handle,
             display_name,
             channel AS platform,
             total_amount AS follower_count,
             ROUND(review_score / 100, 4) AS engagement_rate,
             review_score AS influence_score,
             entity_type AS niche,
             city,
             is_confirmed_returns AS is_verified,
             review_level,
             event_count,
             (SELECT COUNT(*)
              FROM returns_relationships fr
              WHERE fr.from_entity = e.entity_id
                 OR fr.to_entity = e.entity_id) AS connection_count,
             event_count AS recent_posts
      FROM returns_entities e
      ${where}
      ORDER BY review_score DESC, total_amount DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Returns entities error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/network/:id — returns relationship map, depth 1-5 hops.
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
             ROUND(e.review_score / 100, 4) AS engagement_rate,
             e.review_score AS influence_score,
             e.entity_type AS niche,
             e.city,
             e.is_confirmed_returns AS is_verified,
             e.review_level,
             e.event_count,
             e.total_amount,
             e.event_count AS recent_posts,
             (SELECT COUNT(*)
              FROM returns_relationships fr
              WHERE fr.from_entity = e.entity_id
                 OR fr.to_entity = e.entity_id) AS total_connections,
             (SELECT COUNT(*)
              FROM returns_case_entities fce
              WHERE fce.entity_id = e.entity_id) AS brand_count
      FROM returns_entities e
      WHERE e.entity_id = :id
    `, { id: seedId }, req.demoUser);

    if (!centerRes.rows.length) {
      return res.status(404).json({ error: 'Returns entity not found' });
    }

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

    addNode(centerRes.rows[0], 'center', 0);

    const hop1Rows = await fetchConnections([seedId], 60, req.demoUser);
    const hop1Ids = new Set([seedId]);
    for (const row of hop1Rows) {
      addNode(nodeFromEdge(row, 'from'), 'hop1', 1);
      addNode(nodeFromEdge(row, 'to'), 'hop1', 1);
      hop1Ids.add(row.FROM_INFLUENCER);
      hop1Ids.add(row.TO_INFLUENCER);
      addEdge(row, 1);
    }

    if (depth >= 2) {
      const hop1Only = [...hop1Ids].filter(id => id !== seedId).slice(0, 30);
      if (hop1Only.length) {
        const hop2Rows = await fetchConnections(hop1Only, 140, req.demoUser);
        const hop2Ids = new Set(hop1Ids);
        for (const row of hop2Rows) {
          addNode(nodeFromEdge(row, 'from'), 'hop2', 2);
          addNode(nodeFromEdge(row, 'to'), 'hop2', 2);
          hop2Ids.add(row.FROM_INFLUENCER);
          hop2Ids.add(row.TO_INFLUENCER);
          addEdge(row, 2);
        }

        if (depth >= 3) {
          const newHop2 = [...hop2Ids].filter(id => !hop1Ids.has(id)).slice(0, 18);
          const hop3Ids = new Set(hop2Ids);
          if (newHop2.length) {
            const hop3Rows = await fetchConnections(newHop2, 80, req.demoUser);
            for (const row of hop3Rows) {
              addNode(nodeFromEdge(row, 'from'), 'hop3', 3);
              addNode(nodeFromEdge(row, 'to'), 'hop3', 3);
              hop3Ids.add(row.FROM_INFLUENCER);
              hop3Ids.add(row.TO_INFLUENCER);
              addEdge(row, 3);
            }
          }

          if (depth >= 4) {
            const newHop3 = [...hop3Ids].filter(id => !hop2Ids.has(id)).slice(0, 12);
            const hop4Ids = new Set(hop3Ids);
            if (newHop3.length) {
              const hop4Rows = await fetchConnections(newHop3, 50, req.demoUser);
              for (const row of hop4Rows) {
                addNode(nodeFromEdge(row, 'from'), 'hop4', 4);
                addNode(nodeFromEdge(row, 'to'), 'hop4', 4);
                hop4Ids.add(row.FROM_INFLUENCER);
                hop4Ids.add(row.TO_INFLUENCER);
                addEdge(row, 4);
              }
            }

            if (depth >= 5) {
              const newHop4 = [...hop4Ids].filter(id => !hop3Ids.has(id)).slice(0, 8);
              if (newHop4.length) {
                const hop5Rows = await fetchConnections(newHop4, 30, req.demoUser);
                for (const row of hop5Rows) {
                  addNode(nodeFromEdge(row, 'from'), 'hop5', 5);
                  addNode(nodeFromEdge(row, 'to'), 'hop5', 5);
                  addEdge(row, 5);
                }
              }
            }
          }
        }
      }
    }

    const casesRes = await db.executeAsUser(`
      SELECT fce.case_entity_id AS link_id,
             fc.case_id AS brand_id,
             fce.role AS relationship_type,
             fc.event_count AS post_count,
             ROUND(fc.review_score / 100, 4) AS avg_engagement,
             fc.loss_amount AS revenue_attributed,
             fc.case_ref AS brand_name,
             fc.case_type AS brand_category,
             fc.status AS social_tier,
             fc.review_score,
             fc.opened_at
      FROM returns_case_entities fce
      JOIN returns_cases fc ON fce.case_id = fc.case_id
      WHERE fce.entity_id = :id
      ORDER BY fc.review_score DESC, fc.loss_amount DESC
    `, { id: seedId }, req.demoUser);

    res.json({
      center: centerRes.rows[0],
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
    console.error('Returns relationship map error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/propagation/:caseRef — entities linked to a returns case.
router.get('/propagation/:caseRef', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT fc.case_ref,
             fc.case_type,
             e.entity_id AS entity_id,
             e.entity_key AS entity_key,
             e.display_name,
             e.entity_type,
             e.review_score,
             e.total_amount,
             fce.role,
             fr.to_entity AS reached_id,
             reached.entity_key AS reached_entity,
             reached.review_score AS reached_review_score,
             fr.relationship_type,
             fr.strength AS connection_strength
      FROM returns_cases fc
      JOIN returns_case_entities fce ON fc.case_id = fce.case_id
      JOIN returns_entities e ON fce.entity_id = e.entity_id
      LEFT JOIN returns_relationships fr ON fr.from_entity = e.entity_id
      LEFT JOIN returns_entities reached ON fr.to_entity = reached.entity_id
      WHERE LOWER(fc.case_ref) = LOWER(:case_ref)
      ORDER BY e.review_score DESC, fr.strength DESC NULLS LAST
      FETCH FIRST 100 ROWS ONLY
    `, { case_ref: req.params.caseRef }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Returns case propagation error:', err);
    res.status(500).json({ error: err.message });
  }
});

const EXAMPLE_QUERIES = {
  returns_ring_reach: {
    name: 'Return Flow Reach (N-Hop Traversal)',
    description: 'Trace customer accounts, orders, receipts, stores, refund methods, promotions, and outlet channels reachable from a PeakGear return entity.',
    params: [
      { key: 'entity_key', label: 'Seed Entity', default: 'ACCT-8841' },
      { key: 'hops', label: 'Max Hops (1-3)', default: 2, type: 'number' },
    ],
    buildSql: (p) => {
      const hops = intParam(p.hops, 2, 3);
      const entityKey = p.entity_key || 'ACCT-8841';
      return {
        sql: `SELECT DISTINCT entity_key, display_name, entity_type,
       review_score AS review_score, review_level AS review_level, total_amount, channel
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (seed IS entity) -[e IS related_to]->{1,${hops}} (reached IS entity)
    WHERE seed.entity_key = :entity_key
    COLUMNS (
        reached.entity_key AS entity_key,
        reached.display_name AS display_name,
        reached.entity_type AS entity_type,
        reached.review_score AS review_score,
        reached.review_level AS review_level,
        reached.total_amount AS total_amount,
        reached.channel AS channel
    )
)
ORDER BY review_score DESC
FETCH FIRST 25 ROWS ONLY`,
        binds: { entity_key: entityKey },
        display: `-- SQL/PGQ: PeakGear return entities within ${hops} hops
SELECT DISTINCT entity_key, display_name, entity_type,
       review_score AS review_score, review_level AS review_level,
       total_amount, channel
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (seed IS entity)
          -[e IS related_to]->{1,${hops}}
          (reached IS entity)
    WHERE seed.entity_key = '${entityKey}'
    COLUMNS (
        reached.entity_key AS entity_key,
        reached.display_name AS display_name,
        reached.entity_type AS entity_type,
        reached.review_score AS review_score,
        reached.review_level AS review_level,
        reached.total_amount AS total_amount,
        reached.channel AS channel
    )
)
ORDER BY review_score DESC
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  shared_receipt_cluster: {
    name: 'Shared Receipt/Order Cluster',
    description: 'Find customer accounts connected through the same order batch, receipt pattern, or return contact.',
    params: [
      { key: 'min_review', label: 'Minimum Review Score', default: 70, type: 'number' },
    ],
    buildSql: (p) => {
      const minReview = parseInt(p.min_review, 10) || 70;
      return {
        sql: `SELECT account_a, shared_entity, shared_type, account_b,
       a_review, b_review,
       ROUND((a_review + b_review) / 2, 1) AS combined_review,
       e1_type, e2_type
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (a IS entity) -[e1 IS related_to]-> (shared IS entity) <-[e2 IS related_to]- (b IS entity)
    WHERE a.entity_type = 'customer_account'
      AND b.entity_type = 'customer_account'
      AND a.entity_id < b.entity_id
      AND shared.entity_type IN ('order','receipt','contact')
      AND (a.review_score >= :min_review OR b.review_score >= :min_review)
    COLUMNS (
        a.entity_key AS account_a,
        shared.entity_key AS shared_entity,
        shared.entity_type AS shared_type,
        b.entity_key AS account_b,
        a.review_score AS a_review,
        b.review_score AS b_review,
        e1.relationship_type AS e1_type,
        e2.relationship_type AS e2_type
    )
)
ORDER BY combined_review DESC, shared_entity
FETCH FIRST 25 ROWS ONLY`,
        binds: { min_review: minReview },
        display: `-- SQL/PGQ: Customer accounts sharing order, receipt, or return contact
SELECT account_a, shared_entity, shared_type, account_b,
       a_review, b_review,
       ROUND((a_review + b_review) / 2, 1) AS combined_review,
       e1_type, e2_type
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (a IS entity)
          -[e1 IS related_to]-> (shared IS entity)
          <-[e2 IS related_to]- (b IS entity)
    WHERE a.entity_type = 'customer_account'
      AND b.entity_type = 'customer_account'
      AND a.entity_id < b.entity_id
      AND shared.entity_type IN ('order','receipt','contact')
      AND (a.review_score >= ${minReview} OR b.review_score >= ${minReview})
    COLUMNS (
        a.entity_key AS account_a,
        shared.entity_key AS shared_entity,
        shared.entity_type AS shared_type,
        b.entity_key AS account_b,
        a.review_score AS a_review,
        b.review_score AS b_review,
        e1.relationship_type AS e1_type,
        e2.relationship_type AS e2_type
    )
)
ORDER BY combined_review DESC, shared_entity
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  refund_method_cluster: {
    name: 'Refund Method Cluster',
    description: 'Identify customer accounts converging on the same PeakGear refund method or store-credit path.',
    params: [
      { key: 'min_amount', label: 'Minimum Amount', default: 2500, type: 'number' },
    ],
    buildSql: (p) => {
      const minAmount = parseInt(p.min_amount, 10) || 2500;
      return {
        sql: `SELECT source_account, refund_method, related_account,
       source_amount, related_amount,
       source_review, related_review
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (src IS entity) -[e1 IS related_to]-> (destination IS entity) <-[e2 IS related_to]- (other IS entity)
    WHERE src.entity_type = 'customer_account'
      AND other.entity_type = 'customer_account'
      AND src.entity_id < other.entity_id
      AND destination.entity_type = 'refund_method'
      AND e1.total_amount >= :min_amount
    COLUMNS (
        src.entity_key AS source_account,
        destination.entity_key AS refund_method,
        other.entity_key AS related_account,
        e1.total_amount AS source_amount,
        e2.total_amount AS related_amount,
        src.review_score AS source_review,
        other.review_score AS related_review
    )
)
ORDER BY source_amount DESC, source_review DESC
FETCH FIRST 25 ROWS ONLY`,
        binds: { min_amount: minAmount },
        display: `-- SQL/PGQ: Accounts converging on shared refund methods
SELECT source_account, refund_method, related_account,
       source_amount, related_amount,
       source_review, related_review
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (src IS entity)
          -[e1 IS related_to]-> (destination IS entity)
          <-[e2 IS related_to]- (other IS entity)
    WHERE src.entity_type = 'customer_account'
      AND other.entity_type = 'customer_account'
      AND src.entity_id < other.entity_id
      AND destination.entity_type = 'refund_method'
      AND e1.total_amount >= ${minAmount}
    COLUMNS (
        src.entity_key AS source_account,
        destination.entity_key AS refund_method,
        other.entity_key AS related_account,
        e1.total_amount AS source_amount,
        e2.total_amount AS related_amount,
        src.review_score AS source_review,
        other.review_score AS related_review
    )
)
ORDER BY source_amount DESC, source_review DESC
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  cross_channel_returns: {
    name: 'Cross-Channel Return Flow',
    description: 'Spot return entities where mobile, web, store, POS, and contact-center activity converge.',
    params: [
      { key: 'min_channels', label: 'Minimum Channels', default: 2, type: 'number' },
    ],
    buildSql: (p) => {
      const minChannels = parseInt(p.min_channels, 10) || 2;
      return {
        sql: `SELECT shared_entity, shared_type,
       COUNT(DISTINCT channel) AS channels_seen,
       COUNT(DISTINCT account_key) AS accounts_seen,
       ROUND(AVG(review_score), 1) AS avg_review,
       SUM(total_amount) AS exposure
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (account IS entity) -[e IS related_to]-> (shared IS entity)
    WHERE account.entity_type = 'customer_account'
      AND shared.entity_type IN ('order','receipt','refund_method')
    COLUMNS (
        account.entity_key AS account_key,
        account.channel AS channel,
        account.review_score AS review_score,
        account.total_amount AS total_amount,
        shared.entity_key AS shared_entity,
        shared.entity_type AS shared_type
    )
)
GROUP BY shared_entity, shared_type
HAVING COUNT(DISTINCT channel) >= :min_channels
ORDER BY channels_seen DESC, avg_review DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: { min_channels: minChannels },
        display: `-- SQL/PGQ: Shared return entities across channels
SELECT shared_entity, shared_type,
       COUNT(DISTINCT channel) AS channels_seen,
       COUNT(DISTINCT account_key) AS accounts_seen,
       ROUND(AVG(review_score), 1) AS avg_review,
       SUM(total_amount) AS exposure
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (account IS entity)
          -[e IS related_to]-> (shared IS entity)
    WHERE account.entity_type = 'customer_account'
      AND shared.entity_type IN ('order','receipt','refund_method')
    COLUMNS (
        account.entity_key AS account_key,
        account.channel AS channel,
        account.review_score AS review_score,
        account.total_amount AS total_amount,
        shared.entity_key AS shared_entity,
        shared.entity_type AS shared_type
    )
)
GROUP BY shared_entity, shared_type
HAVING COUNT(DISTINCT channel) >= ${minChannels}
ORDER BY channels_seen DESC, avg_review DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },

  review_priority_hubs: {
    name: 'Review Priority Hubs',
    description: 'Rank return entities by graph degree, review score, and return value exposure to surface operational priorities.',
    params: [
      { key: 'entity_type', label: 'Entity Type (optional)', default: '' },
    ],
    buildSql: (p) => {
      const typeWhere = p.entity_type ? `\n    WHERE src.entity_type = :entity_type` : '';
      return {
        sql: `SELECT entity_key, entity_type, review_level, review_score,
       total_amount, COUNT(*) AS degree,
       COUNT(DISTINCT relationship_type) AS relationship_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (src IS entity) -[e IS related_to]-> (dst IS entity)${typeWhere}
    COLUMNS (
        src.entity_key AS entity_key,
        src.entity_type AS entity_type,
        src.review_level AS review_level,
        src.review_score AS review_score,
        src.total_amount AS total_amount,
        e.relationship_type AS relationship_type,
        e.strength AS strength
    )
)
GROUP BY entity_key, entity_type, review_level, review_score, total_amount
ORDER BY degree DESC, review_score DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: p.entity_type ? { entity_type: p.entity_type } : {},
        display: `-- SQL/PGQ: Degree centrality and return review priority
SELECT entity_key, entity_type, review_level, review_score,
       total_amount, COUNT(*) AS degree,
       COUNT(DISTINCT relationship_type) AS relationship_types,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( returns_relationship_graph
    MATCH (src IS entity)
          -[e IS related_to]->
          (dst IS entity)${p.entity_type ? `\n    WHERE src.entity_type = '${p.entity_type}'` : ''}
    COLUMNS (
        src.entity_key AS entity_key,
        src.entity_type AS entity_type,
        src.review_level AS review_level,
        src.review_score AS review_score,
        src.total_amount AS total_amount,
        e.relationship_type AS relationship_type,
        e.strength AS strength
    )
)
GROUP BY entity_key, entity_type, review_level, review_score, total_amount
ORDER BY degree DESC, review_score DESC
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
    console.error('Returns graph example query error:', err);
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    res.status(500).json({
      error: err.message,
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
