/**
 * Graph API - Seer Comms subscriber and network impact graph.
 *
 * Endpoint names preserve the original frontend contract, but returned fields are
 * compatibility aliases over telecom_graph_entities and telecom_graph_relationships.
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
    SELECT tr.relationship_id AS connection_id,
           tr.from_entity AS from_influencer,
           tr.to_entity AS to_influencer,
           tr.relationship_type AS connection_type,
           tr.strength,
           tr.event_count AS interaction_count,
           tr.affected_count,
           tr.first_seen,
           tr.last_seen AS last_interaction,
           e_f.entity_key AS from_handle,
           e_f.entity_key AS from_entity_key,
           e_f.display_name AS from_display,
           e_f.entity_type AS from_platform,
           e_f.entity_type AS from_entity_type,
           e_f.affected_count AS from_followers,
           e_f.affected_count AS from_affected_subscribers,
           e_f.risk_score AS from_score,
           e_f.risk_score AS from_impact_risk,
           e_f.entity_type AS from_niche,
           e_f.city AS from_city,
           CASE WHEN e_f.risk_score >= 90 THEN 1 ELSE 0 END AS from_verified,
           ROUND(e_f.experience_score / 100, 4) AS from_engagement,
           e_f.experience_score AS from_experience_score,
           e_f.region AS from_region,
           e_f.signal_count AS from_recent_posts,
           e_f.signal_count AS from_signal_count,
           e_f.service_value AS from_service_value_at_risk,
           e_t.entity_key AS to_handle,
           e_t.entity_key AS to_entity_key,
           e_t.display_name AS to_display,
           e_t.entity_type AS to_platform,
           e_t.entity_type AS to_entity_type,
           e_t.affected_count AS to_followers,
           e_t.affected_count AS to_affected_subscribers,
           e_t.risk_score AS to_score,
           e_t.risk_score AS to_impact_risk,
           e_t.entity_type AS to_niche,
           e_t.city AS to_city,
           CASE WHEN e_t.risk_score >= 90 THEN 1 ELSE 0 END AS to_verified,
           ROUND(e_t.experience_score / 100, 4) AS to_engagement,
           e_t.experience_score AS to_experience_score,
           e_t.region AS to_region,
           e_t.signal_count AS to_recent_posts,
           e_t.signal_count AS to_signal_count,
           e_t.service_value AS to_service_value_at_risk
    FROM telecom_graph_relationships tr
    JOIN telecom_graph_entities e_f ON tr.from_entity = e_f.entity_id
    JOIN telecom_graph_entities e_t ON tr.to_entity = e_t.entity_id
    WHERE tr.from_entity IN (${placeholders})
       OR tr.to_entity IN (${placeholders})
    ORDER BY tr.strength DESC, tr.affected_count DESC
    FETCH FIRST :limit ROWS ONLY
  `, binds, demoUser);

  return result.rows;
}

function nodeFromEdge(row, side) {
  const from = side === 'from';
  return {
    INFLUENCER_ID: from ? row.FROM_INFLUENCER : row.TO_INFLUENCER,
    HANDLE: from ? row.FROM_HANDLE : row.TO_HANDLE,
    ENTITY_KEY: from ? row.FROM_ENTITY_KEY : row.TO_ENTITY_KEY,
    DISPLAY_NAME: from ? row.FROM_DISPLAY : row.TO_DISPLAY,
    PLATFORM: from ? row.FROM_PLATFORM : row.TO_PLATFORM,
    ENTITY_TYPE: from ? row.FROM_ENTITY_TYPE : row.TO_ENTITY_TYPE,
    FOLLOWER_COUNT: from ? row.FROM_FOLLOWERS : row.TO_FOLLOWERS,
    AFFECTED_SUBSCRIBERS: from ? row.FROM_AFFECTED_SUBSCRIBERS : row.TO_AFFECTED_SUBSCRIBERS,
    INFLUENCE_SCORE: from ? row.FROM_SCORE : row.TO_SCORE,
    IMPACT_RISK: from ? row.FROM_IMPACT_RISK : row.TO_IMPACT_RISK,
    NICHE: from ? row.FROM_NICHE : row.TO_NICHE,
    CITY: from ? row.FROM_CITY : row.TO_CITY,
    IS_VERIFIED: from ? row.FROM_VERIFIED : row.TO_VERIFIED,
    ENGAGEMENT_RATE: from ? row.FROM_ENGAGEMENT : row.TO_ENGAGEMENT,
    EXPERIENCE_SCORE: from ? row.FROM_EXPERIENCE_SCORE : row.TO_EXPERIENCE_SCORE,
    REGION: from ? row.FROM_REGION : row.TO_REGION,
    RECENT_POSTS: from ? row.FROM_RECENT_POSTS : row.TO_RECENT_POSTS,
    SIGNAL_COUNT: from ? row.FROM_SIGNAL_COUNT : row.TO_SIGNAL_COUNT,
    SERVICE_VALUE_AT_RISK: from ? row.FROM_SERVICE_VALUE_AT_RISK : row.TO_SERVICE_VALUE_AT_RISK,
  };
}

// GET /api/graph/influencers - telecom graph entities with original contract aliases.
router.get('/influencers', async (req, res) => {
  try {
    const { platform, niche, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    let where = 'WHERE 1=1';
    const binds = { limit };

    if (platform) {
      where += ' AND entity_type = :platform';
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
        OR UPPER(region) LIKE UPPER(:search)
        OR UPPER(city) LIKE UPPER(:search)
      )`;
      binds.search = `%${search}%`;
    }

    const result = await db.executeAsUser(`
      SELECT entity_id AS influencer_id,
             entity_key AS handle,
             entity_key,
             display_name,
             entity_type AS platform,
             entity_type,
             affected_count AS follower_count,
             affected_count AS affected_subscribers,
             ROUND(experience_score / 100, 4) AS engagement_rate,
             experience_score,
             risk_score AS influence_score,
             risk_score AS impact_risk,
             entity_type AS niche,
             city,
             CASE WHEN risk_score >= 90 THEN 1 ELSE 0 END AS is_verified,
             region,
             signal_count AS recent_posts,
             signal_count,
             service_value,
             service_value AS service_value_at_risk,
             (SELECT COUNT(*)
              FROM telecom_graph_relationships tr
              WHERE tr.from_entity = e.entity_id
                 OR tr.to_entity = e.entity_id) AS connection_count
      FROM telecom_graph_entities e
      ${where}
      ORDER BY risk_score DESC, affected_count DESC, service_value DESC
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Telecom graph entities error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/network/:id - ego network, depth 1-5 hops.
router.get('/network/:id', async (req, res) => {
  try {
    const seedId = parseInt(req.params.id, 10);
    const depth = intParam(req.query.depth, 3, 5);

    const centerRes = await db.executeAsUser(`
      SELECT entity_id AS influencer_id,
             entity_key AS handle,
             entity_key,
             display_name,
             entity_type AS platform,
             entity_type,
             affected_count AS follower_count,
             affected_count AS affected_subscribers,
             ROUND(experience_score / 100, 4) AS engagement_rate,
             experience_score,
             risk_score AS influence_score,
             risk_score AS impact_risk,
             entity_type AS niche,
             city,
             CASE WHEN risk_score >= 90 THEN 1 ELSE 0 END AS is_verified,
             region,
             signal_count AS recent_posts,
             signal_count,
             service_value,
             service_value AS service_value_at_risk,
             (SELECT COUNT(*)
              FROM telecom_graph_relationships tr
              WHERE tr.from_entity = e.entity_id
                 OR tr.to_entity = e.entity_id) AS total_connections,
             (SELECT COUNT(*)
              FROM telecom_case_entities tce
              WHERE tce.entity_id = e.entity_id) AS brand_count
      FROM telecom_graph_entities e
      WHERE e.entity_id = :id
    `, { id: seedId }, req.demoUser);

    if (!centerRes.rows.length) {
      return res.status(404).json({ error: 'Telecom graph entity not found' });
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
        eventCount: row.INTERACTION_COUNT,
        affectedCount: row.AFFECTED_COUNT,
        affectedSubscribers: row.AFFECTED_COUNT,
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
      SELECT tce.case_entity_id AS link_id,
             tc.case_id AS brand_id,
             tce.role_in_case AS relationship_type,
             tc.subscribers_affected AS post_count,
             ROUND(tc.risk_score / 100, 4) AS avg_engagement,
             tc.service_value_at_risk AS revenue_attributed,
             tc.case_ref AS brand_name,
             tc.case_type AS brand_category,
             tc.case_status AS social_tier,
             tc.priority,
             tc.risk_score,
             tc.opened_at
      FROM telecom_case_entities tce
      JOIN telecom_experience_cases tc ON tce.case_id = tc.case_id
      WHERE tce.entity_id = :id
      ORDER BY tc.risk_score DESC, tc.service_value_at_risk DESC
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
    console.error('Telecom network error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/propagation/:caseRef - entities linked to an experience case.
router.get('/propagation/:caseRef', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT tc.case_ref,
             tc.case_type,
             e.entity_id,
             e.entity_key,
             e.display_name,
             e.entity_type,
             e.risk_score,
             e.affected_count,
             tce.role_in_case,
             tr.to_entity AS reached_id,
             reached.entity_key AS reached_entity,
             reached.risk_score AS reached_risk_score,
             tr.relationship_type,
             tr.strength AS connection_strength
      FROM telecom_experience_cases tc
      JOIN telecom_case_entities tce ON tc.case_id = tce.case_id
      JOIN telecom_graph_entities e ON tce.entity_id = e.entity_id
      LEFT JOIN telecom_graph_relationships tr ON tr.from_entity = e.entity_id
      LEFT JOIN telecom_graph_entities reached ON tr.to_entity = reached.entity_id
      WHERE LOWER(tc.case_ref) = LOWER(:case_ref)
      ORDER BY e.risk_score DESC, tr.strength DESC NULLS LAST
      FETCH FIRST 100 ROWS ONLY
    `, { case_ref: req.params.caseRef }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Telecom case propagation error:', err);
    res.status(500).json({ error: err.message });
  }
});

const EXAMPLE_QUERIES = {
  impact_reach: {
    name: 'Subscriber Impact Reach',
    description: 'Trace subscribers, service lines, network sites, cases, and crews reachable from a signal or outage seed with SQL/PGQ.',
    params: [
      { key: 'entity_key', label: 'Seed Entity', default: 'OUT-EVENT-501' },
      { key: 'hops', label: 'Max Hops (1-3)', default: 2, type: 'number' },
    ],
    buildSql: (p) => {
      const hops = intParam(p.hops, 2, 3);
      const entityKey = p.entity_key || 'OUT-EVENT-501';
      return {
        sql: `SELECT DISTINCT entity_key, display_name, entity_type,
       region, city, risk_score, affected_count, signal_count
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (seed IS entity) -[e IS related_to]->{1,${hops}} (reached IS entity)
    WHERE seed.entity_key = :entity_key
    COLUMNS (
        reached.entity_key AS entity_key,
        reached.display_name AS display_name,
        reached.entity_type AS entity_type,
        reached.region AS region,
        reached.city AS city,
        reached.risk_score AS risk_score,
        reached.affected_count AS affected_count,
        reached.signal_count AS signal_count
    )
)
ORDER BY risk_score DESC, affected_count DESC
FETCH FIRST 25 ROWS ONLY`,
        binds: { entity_key: entityKey },
        display: `-- SQL/PGQ: Subscriber and network impact within ${hops} hops
SELECT DISTINCT entity_key, display_name, entity_type,
       region, city, risk_score, affected_count, signal_count
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (seed IS entity)
          -[e IS related_to]->{1,${hops}}
          (reached IS entity)
    WHERE seed.entity_key = '${entityKey}'
    COLUMNS (
        reached.entity_key AS entity_key,
        reached.display_name AS display_name,
        reached.entity_type AS entity_type,
        reached.region AS region,
        reached.city AS city,
        reached.risk_score AS risk_score,
        reached.affected_count AS affected_count,
        reached.signal_count AS signal_count
    )
)
ORDER BY risk_score DESC, affected_count DESC
FETCH FIRST 25 ROWS ONLY;`,
      };
    },
  },

  case_entities: {
    name: 'Experience Case Entities',
    description: 'List the sites, service lines, subscriber clusters, and field crews tied to a Seer Comms experience case.',
    params: [
      { key: 'case_ref', label: 'Case Reference', default: 'TEL-5G-2026-501' },
    ],
    buildSql: (p) => {
      const caseRef = p.case_ref || 'TEL-5G-2026-501';
      return {
        sql: `SELECT case_ref, case_type, role_in_case,
       entity_key, display_name, entity_type,
       risk_score, affected_count, confidence
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (c IS experience_case) -[edge IS case_involves]-> (entity IS entity)
    WHERE c.case_ref = :case_ref
    COLUMNS (
        c.case_ref AS case_ref,
        c.case_type AS case_type,
        edge.role_in_case AS role_in_case,
        edge.confidence AS confidence,
        entity.entity_key AS entity_key,
        entity.display_name AS display_name,
        entity.entity_type AS entity_type,
        entity.risk_score AS risk_score,
        entity.affected_count AS affected_count
    )
)
ORDER BY risk_score DESC, confidence DESC`,
        binds: { case_ref: caseRef },
        display: `-- SQL/PGQ: Entities involved in a Seer Comms experience case
SELECT case_ref, case_type, role_in_case,
       entity_key, display_name, entity_type,
       risk_score, affected_count, confidence
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (c IS experience_case)
          -[edge IS case_involves]->
          (entity IS entity)
    WHERE c.case_ref = '${caseRef}'
    COLUMNS (
        c.case_ref AS case_ref,
        c.case_type AS case_type,
        edge.role_in_case AS role_in_case,
        edge.confidence AS confidence,
        entity.entity_key AS entity_key,
        entity.display_name AS display_name,
        entity.entity_type AS entity_type,
        entity.risk_score AS risk_score,
        entity.affected_count AS affected_count
    )
)
ORDER BY risk_score DESC, confidence DESC;`,
      };
    },
  },

  capacity_dependencies: {
    name: 'Capacity Dependency Paths',
    description: 'Find network sites, capacity pools, service lines, and crews with the highest affected subscriber counts.',
    params: [
      { key: 'min_affected', label: 'Minimum Affected Subscribers', default: 5000, type: 'number' },
    ],
    buildSql: (p) => {
      const minAffected = parseInt(p.min_affected, 10) || 5000;
      return {
        sql: `SELECT from_key, relationship_type, to_key,
       to_type, strength, affected_count
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (from_node IS entity) -[edge IS related_to]-> (to_node IS entity)
    WHERE edge.affected_count >= :min_affected
      AND edge.relationship_type IN ('served_by','capacity_dependency','assigned_crew','service_path')
    COLUMNS (
        from_node.entity_key AS from_key,
        edge.relationship_type AS relationship_type,
        edge.strength AS strength,
        edge.affected_count AS affected_count,
        to_node.entity_key AS to_key,
        to_node.entity_type AS to_type
    )
)
ORDER BY affected_count DESC, strength DESC
FETCH FIRST 30 ROWS ONLY`,
        binds: { min_affected: minAffected },
        display: `-- SQL/PGQ: Capacity and dispatch dependencies with high impact
SELECT from_key, relationship_type, to_key,
       to_type, strength, affected_count
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (from_node IS entity)
          -[edge IS related_to]->
          (to_node IS entity)
    WHERE edge.affected_count >= ${minAffected}
      AND edge.relationship_type IN (
        'served_by','capacity_dependency','assigned_crew','service_path'
      )
    COLUMNS (
        from_node.entity_key AS from_key,
        edge.relationship_type AS relationship_type,
        edge.strength AS strength,
        edge.affected_count AS affected_count,
        to_node.entity_key AS to_key,
        to_node.entity_type AS to_type
    )
)
ORDER BY affected_count DESC, strength DESC
FETCH FIRST 30 ROWS ONLY;`,
      };
    },
  },

  incident_response_chain: {
    name: 'Incident Response Chain',
    description: 'Follow an outage through its escalated support cases to the field crews assigned to restore service.',
    params: [
      { key: 'outage_key', label: 'Outage Entity', default: 'OUT-EVENT-501' },
    ],
    buildSql: (p) => {
      const outageKey = p.outage_key || 'OUT-EVENT-501';
      return {
        sql: `SELECT outage_key, support_case, assigned_crew,
       case_impact, escalation_strength, assignment_strength
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (outage IS entity)
          -[escalation IS related_to]->
          (support_case IS entity)
          -[assignment IS related_to]->
          (crew IS entity)
    WHERE outage.entity_key = :outage_key
      AND outage.entity_type = 'outage_event'
      AND escalation.relationship_type = 'escalates_case'
      AND support_case.entity_type = 'support_case'
      AND assignment.relationship_type = 'assigned_crew'
      AND crew.entity_type = 'field_crew'
    COLUMNS (
        outage.entity_key AS outage_key,
        support_case.display_name AS support_case,
        crew.display_name AS assigned_crew,
        support_case.affected_count AS case_impact,
        escalation.strength AS escalation_strength,
        assignment.strength AS assignment_strength
    )
)
ORDER BY case_impact DESC, escalation_strength DESC`,
        binds: { outage_key: outageKey },
        display: `-- SQL/PGQ: Outage escalation and field response chain
SELECT outage_key, support_case, assigned_crew,
       case_impact, escalation_strength, assignment_strength
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (outage IS entity)
          -[escalation IS related_to]->
          (support_case IS entity)
          -[assignment IS related_to]->
          (crew IS entity)
    WHERE outage.entity_key = '${outageKey}'
      AND outage.entity_type = 'outage_event'
      AND escalation.relationship_type = 'escalates_case'
      AND support_case.entity_type = 'support_case'
      AND assignment.relationship_type = 'assigned_crew'
      AND crew.entity_type = 'field_crew'
    COLUMNS (
        outage.entity_key AS outage_key,
        support_case.display_name AS support_case,
        crew.display_name AS assigned_crew,
        support_case.affected_count AS case_impact,
        escalation.strength AS escalation_strength,
        assignment.strength AS assignment_strength
    )
)
ORDER BY case_impact DESC, escalation_strength DESC;`,
      };
    },
  },

  subscriber_service_path: {
    name: 'Subscriber Service Path',
    description: 'Show how subscriber segments depend on service lines and the network sites serving those services in a region.',
    params: [
      { key: 'region', label: 'Region', default: 'Northeast' },
    ],
    buildSql: (p) => {
      const region = p.region || 'Northeast';
      return {
        sql: `SELECT subscriber_segment, service_line, network_site,
       subscribers_affected, subscription_strength, site_strength
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (subscriber IS entity)
          -[subscription IS related_to]->
          (service IS entity)
          -[site_link IS related_to]->
          (site IS entity)
    WHERE subscriber.region = :region
      AND subscriber.entity_type = 'subscriber'
      AND subscription.relationship_type = 'subscribes_to'
      AND service.entity_type = 'service_line'
      AND site_link.relationship_type = 'served_by'
      AND site.entity_type = 'network_site'
    COLUMNS (
        subscriber.display_name AS subscriber_segment,
        service.display_name AS service_line,
        site.display_name AS network_site,
        subscriber.affected_count AS subscribers_affected,
        subscription.strength AS subscription_strength,
        site_link.strength AS site_strength
    )
)
ORDER BY subscribers_affected DESC, subscription_strength DESC`,
        binds: { region },
        display: `-- SQL/PGQ: Subscriber-to-service-to-site dependency path
SELECT subscriber_segment, service_line, network_site,
       subscribers_affected, subscription_strength, site_strength
FROM GRAPH_TABLE ( telecom_experience_network
    MATCH (subscriber IS entity)
          -[subscription IS related_to]->
          (service IS entity)
          -[site_link IS related_to]->
          (site IS entity)
    WHERE subscriber.region = '${region}'
      AND subscriber.entity_type = 'subscriber'
      AND subscription.relationship_type = 'subscribes_to'
      AND service.entity_type = 'service_line'
      AND site_link.relationship_type = 'served_by'
      AND site.entity_type = 'network_site'
    COLUMNS (
        subscriber.display_name AS subscriber_segment,
        service.display_name AS service_line,
        site.display_name AS network_site,
        subscriber.affected_count AS subscribers_affected,
        subscription.strength AS subscription_strength,
        site_link.strength AS site_strength
    )
)
ORDER BY subscribers_affected DESC, subscription_strength DESC;`,
      };
    },
  },
};

router.get('/example-queries', (req, res) => {
  const queries = Object.entries(EXAMPLE_QUERIES).map(([id, q]) => ({
    id,
    name: q.name,
    description: q.description,
    params: q.params,
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
    console.error('Graph example query error:', err);
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    res.status(500).json({
      error: err.message,
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
