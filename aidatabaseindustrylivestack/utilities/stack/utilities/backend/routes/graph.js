/**
 * Graph API - Energy & Utilities restoration-workflow property graph queries.
 *
 * The route names keep the original frontend contract for compatibility, but
 * the returned data now comes from SERVICE_RESTORATION_NETWORK tables rather than the
 * older influencer/source graph.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

function toLimit(value, fallback = 50, max = 200) {
  return Math.min(parseInt(value, 10) || fallback, max);
}

function toGraphDepth(value) {
  return Math.min(Math.max(parseInt(value, 10) || 3, 1), 5);
}

function formatEdgeTypeLabel(type) {
  return String(type || 'unknown')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Unknown Edge';
}

function edgeMetadataFromRow(row = {}) {
  const edgeType = row.EDGE_TYPE || row.edge_type || row.RELATIONSHIP_TYPE || row.relationship_type;
  const displayName = row.DISPLAY_NAME || row.display_name || row.EDGE_DISPLAY_NAME || row.edge_display_name || formatEdgeTypeLabel(edgeType);
  const category = row.CATEGORY || row.category || row.EDGE_CATEGORY || row.edge_category || 'Uncategorized';
  const description = row.DESCRIPTION || row.description || row.EDGE_DESCRIPTION || row.edge_description || '';

  return {
    edgeType,
    edge_type: edgeType,
    displayName,
    display_name: displayName,
    category,
    description,
  };
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function pathwayFindingFromRow(row = {}) {
  const findingId = row.FINDING_ID || row.finding_id;
  const findingType = row.FINDING_TYPE || row.finding_type;
  const title = row.TITLE || row.title || 'Pathway finding';
  const description = row.DESCRIPTION || row.description || '';
  const supportingNodeIds = row.SUPPORTING_NODE_IDS || row.supporting_node_ids || '';
  const supportingEdgeTypes = row.SUPPORTING_EDGE_TYPES || row.supporting_edge_types || '';
  const riskScore = row.RISK_SCORE ?? row.risk_score;
  const recommendedAction = row.RECOMMENDED_ACTION || row.recommended_action || '';
  const recommendedQueryKey = row.RECOMMENDED_QUERY_KEY || row.recommended_query_key || '';
  const minGraphDepth = row.MIN_GRAPH_DEPTH ?? row.min_graph_depth;

  return {
    findingId,
    finding_id: findingId,
    findingType,
    finding_type: findingType,
    title,
    description,
    supportingNodeIds: splitList(supportingNodeIds),
    supporting_node_ids: supportingNodeIds,
    supportingEdgeTypes: splitList(supportingEdgeTypes),
    supporting_edge_types: supportingEdgeTypes,
    riskScore,
    risk_score: riskScore,
    recommendedAction,
    recommended_action: recommendedAction,
    recommendedQueryKey,
    recommended_query_key: recommendedQueryKey,
    minGraphDepth,
    min_graph_depth: minGraphDepth,
  };
}

async function fetchEdgeMetadata(demoUser) {
  const result = await db.executeAsUser(`
    SELECT edge_type,
           display_name,
           category,
           description
    FROM   utility_graph_edge_metadata
    ORDER  BY CASE category
                WHEN 'Operational Events' THEN 1
                WHEN 'Field Coordination' THEN 2
                WHEN 'Risk & Gaps' THEN 3
                ELSE 9
              END,
              edge_type
  `, {}, demoUser);

  return (result.rows || []).map(edgeMetadataFromRow);
}

async function fetchPathwayFindings(seedId, depth, demoUser) {
  const result = await db.executeAsUser(`
    SELECT finding_id,
           finding_type,
           title,
           description,
           supporting_node_ids,
           supporting_edge_types,
           risk_score,
           recommended_action,
           recommended_query_key,
           min_graph_depth
    FROM   utility_graph_restoration_findings
    WHERE  center_entity_id = :seedId
      AND  min_graph_depth <= :depth
    ORDER  BY risk_score DESC NULLS LAST,
              CASE finding_type
                WHEN 'case_evidence' THEN 1
                WHEN 'reliability_gap' THEN 2
                WHEN 'reliability_gap_workflow' THEN 3
                WHEN 'high_risk_pathway' THEN 4
                WHEN 'shared_field_crew' THEN 5
                WHEN 'coordination_hub' THEN 6
                ELSE 9
              END,
              finding_id
    FETCH FIRST 6 ROWS ONLY
  `, { seedId, depth }, demoUser);

  return (result.rows || []).map(pathwayFindingFromRow);
}

async function fetchConnections(nodeIds, limit, demoUser) {
  if (!nodeIds.length) return [];
  const idList = [...new Set(nodeIds.map(Number).filter(Number.isFinite))].join(',');
  if (!idList) return [];

  const result = await db.executeAsUser(`
    SELECT r.relationship_id,
           r.from_entity_id,
           r.to_entity_id,
           r.relationship_type,
           r.strength,
           r.interaction_count,
           r.evidence_text,
           m.display_name     AS edge_display_name,
           m.category         AS edge_category,
           m.description      AS edge_description,
           f.entity_key       AS from_key,
           f.display_name     AS from_display,
           f.operations_label   AS from_operations_label,
           f.description      AS from_description,
           f.entity_type      AS from_type,
           f.pathway_volume   AS from_pathway_volume,
           f.service_point_count    AS from_service_point_count,
           f.outage_event_count  AS from_outage_event_count,
           f.risk_score       AS from_risk_score,
           f.open_reliability_gap_count AS from_open_reliability_gap_count,
           f.direct_connection_count AS from_direct_connection_count,
           f.operations_domain  AS from_domain,
           f.city             AS from_city,
           f.region           AS from_region,
           f.is_verified      AS from_verified,
           f.engagement_rate  AS from_engagement,
           t.entity_key       AS to_key,
           t.display_name     AS to_display,
           t.operations_label   AS to_operations_label,
           t.description      AS to_description,
           t.entity_type      AS to_type,
           t.pathway_volume   AS to_pathway_volume,
           t.service_point_count    AS to_service_point_count,
           t.outage_event_count  AS to_outage_event_count,
           t.risk_score       AS to_risk_score,
           t.open_reliability_gap_count AS to_open_reliability_gap_count,
           t.direct_connection_count AS to_direct_connection_count,
           t.operations_domain  AS to_domain,
           t.city             AS to_city,
           t.region           AS to_region,
           t.is_verified      AS to_verified,
           t.engagement_rate  AS to_engagement
    FROM   utility_graph_relationships r
    JOIN   utility_graph_entity_metrics f ON r.from_entity_id = f.entity_id
    JOIN   utility_graph_entity_metrics t ON r.to_entity_id   = t.entity_id
    LEFT JOIN utility_graph_edge_metadata m ON m.edge_type = r.relationship_type
    WHERE  r.from_entity_id IN (${idList})
        OR r.to_entity_id   IN (${idList})
    ORDER  BY r.strength DESC, r.interaction_count DESC
    FETCH FIRST ${limit} ROWS ONLY
  `, {}, demoUser);

  return result.rows;
}

function nodeFromEdge(edge, side) {
  const from = side === 'from';
  const node = {
    INFLUENCER_ID:   from ? edge.FROM_ENTITY_ID   : edge.TO_ENTITY_ID,
    HANDLE:          from ? edge.FROM_KEY         : edge.TO_KEY,
    NODE_ID:         from ? edge.FROM_KEY         : edge.TO_KEY,
    DISPLAY_NAME:    from ? edge.FROM_DISPLAY     : edge.TO_DISPLAY,
    OPERATIONS_LABEL:  from ? edge.FROM_OPERATIONS_LABEL : edge.TO_OPERATIONS_LABEL,
    DESCRIPTION:     from ? edge.FROM_DESCRIPTION : edge.TO_DESCRIPTION,
    PLATFORM:        from ? edge.FROM_TYPE        : edge.TO_TYPE,
    NODE_TYPE:       from ? edge.FROM_TYPE        : edge.TO_TYPE,
    PATHWAY_VOLUME:  from ? edge.FROM_PATHWAY_VOLUME : edge.TO_PATHWAY_VOLUME,
    SERVICE_POINT_COUNT:   from ? edge.FROM_SERVICE_POINT_COUNT : edge.TO_SERVICE_POINT_COUNT,
    OUTAGE_EVENT_COUNT: from ? edge.FROM_OUTAGE_EVENT_COUNT : edge.TO_OUTAGE_EVENT_COUNT,
    RISK_SCORE:      from ? edge.FROM_RISK_SCORE : edge.TO_RISK_SCORE,
    OPEN_RELIABILITY_GAP_COUNT: from ? edge.FROM_OPEN_RELIABILITY_GAP_COUNT : edge.TO_OPEN_RELIABILITY_GAP_COUNT,
    DIRECT_CONNECTION_COUNT: from ? edge.FROM_DIRECT_CONNECTION_COUNT : edge.TO_DIRECT_CONNECTION_COUNT,
    FOLLOWER_COUNT:  from ? edge.FROM_PATHWAY_VOLUME : edge.TO_PATHWAY_VOLUME,
    INFLUENCE_SCORE: from ? edge.FROM_RISK_SCORE : edge.TO_RISK_SCORE,
    NICHE:           from ? edge.FROM_DOMAIN      : edge.TO_DOMAIN,
    CITY:            from ? edge.FROM_CITY        : edge.TO_CITY,
    REGION:          from ? edge.FROM_REGION      : edge.TO_REGION,
    IS_VERIFIED:     from ? edge.FROM_VERIFIED    : edge.TO_VERIFIED,
    ENGAGEMENT_RATE: from ? edge.FROM_ENGAGEMENT  : edge.TO_ENGAGEMENT,
  };
  return withMetricAliases(node);
}

function withMetricAliases(row) {
  if (!row) return row;
  const pathwayVolume = row.PATHWAY_VOLUME ?? row.pathway_volume ?? row.FOLLOWER_COUNT;
  const riskScore = row.RISK_SCORE ?? row.risk_score ?? row.INFLUENCE_SCORE;
  const servicePointCount = row.SERVICE_POINT_COUNT ?? row.service_point_count;
  const outageEventCount = row.OUTAGE_EVENT_COUNT ?? row.outage_event_count;
  const openReliabilityGapCount = row.OPEN_RELIABILITY_GAP_COUNT ?? row.open_reliability_gap_count;
  const directConnectionCount = row.DIRECT_CONNECTION_COUNT ?? row.direct_connection_count ?? row.TOTAL_CONNECTIONS ?? row.CONNECTION_COUNT;
  const connectedNodeCount = row.CONNECTED_NODE_COUNT ?? row.connected_node_count;
  const pathwayRelationshipCount = row.PATHWAY_RELATIONSHIP_COUNT ?? row.pathway_relationship_count;
  const graphDepth = row.GRAPH_DEPTH ?? row.graph_depth;
  const nodeId = row.NODE_ID ?? row.node_id ?? row.HANDLE;
  const nodeType = row.NODE_TYPE ?? row.node_type ?? row.PLATFORM;
  const operationalLabel = row.OPERATIONS_LABEL ?? row.operations_label;
  const description = row.DESCRIPTION ?? row.description;

  return {
    ...row,
    NODE_ID: nodeId,
    NODE_TYPE: nodeType,
    OPERATIONS_LABEL: operationalLabel,
    DESCRIPTION: description,
    PATHWAY_VOLUME: pathwayVolume,
    RISK_SCORE: riskScore,
    SERVICE_POINT_COUNT: servicePointCount,
    OUTAGE_EVENT_COUNT: outageEventCount,
    OPEN_RELIABILITY_GAP_COUNT: openReliabilityGapCount,
    DIRECT_CONNECTION_COUNT: directConnectionCount,
    pathway_volume: pathwayVolume,
    risk_score: riskScore,
    service_point_count: servicePointCount,
    outage_event_count: outageEventCount,
    open_reliability_gap_count: openReliabilityGapCount,
    direct_connection_count: directConnectionCount,
    connected_node_count: connectedNodeCount,
    pathway_relationship_count: pathwayRelationshipCount,
    graph_depth: graphDepth,
    node_id: nodeId,
    node_type: nodeType,
    operations_label: operationalLabel,
    description,
  };
}

async function fetchGraphCenter(seedParam, demoUser) {
  const seed = String(seedParam || '').trim();
  const numericSeed = /^\d+$/.test(seed) ? parseInt(seed, 10) : null;
  const centerWhere = numericSeed !== null
    ? 'e.entity_id = :seedId'
    : 'LOWER(e.entity_key) = LOWER(:seedKey)';
  const binds = numericSeed !== null
    ? { seedId: numericSeed }
    : { seedKey: seed };

  const result = await db.executeAsUser(`
    SELECT e.entity_id       AS influencer_id,
           e.entity_key      AS handle,
           e.node_id,
           e.node_type,
           e.display_name,
           e.operations_label,
           e.description,
           e.entity_type     AS platform,
           e.pathway_volume,
           e.service_point_count,
           e.outage_event_count,
           e.risk_score,
           e.open_reliability_gap_count,
           e.direct_connection_count,
           e.pathway_volume  AS follower_count,
           e.engagement_rate,
           e.risk_score      AS influence_score,
           e.operations_domain AS niche,
           e.city,
           e.region,
           e.is_verified,
           e.summary,
           e.direct_connection_count AS total_connections,
           (SELECT COUNT(*)
            FROM restoration_case_entities ce
            WHERE ce.entity_id = e.entity_id) AS brand_count,
           (SELECT COUNT(*)
            FROM restoration_case_entities ce
            WHERE ce.entity_id = e.entity_id) AS recent_posts
    FROM utility_graph_entity_metrics e
    WHERE ${centerWhere}
  `, binds, demoUser);

  return result.rows.length ? withMetricAliases(result.rows[0]) : null;
}

// GET /api/graph/influencers - compatibility endpoint for restoration graph vertices.
router.get('/influencers', async (req, res) => {
  try {
    const { platform, niche, search } = req.query;
    const limit = toLimit(req.query.limit);
    let where = 'WHERE 1=1';
    const binds = { limit };

    if (platform) {
      where += ' AND entity_type = :platform';
      binds.platform = platform;
    }
    if (niche) {
      where += ' AND operations_domain = :niche';
      binds.niche = niche;
    }
    if (search) {
      where += ` AND (
        UPPER(entity_key) LIKE UPPER(:search)
        OR UPPER(display_name) LIKE UPPER(:search)
        OR UPPER(operations_label) LIKE UPPER(:search)
        OR UPPER(description) LIKE UPPER(:search)
        OR UPPER(operations_domain) LIKE UPPER(:search)
        OR UPPER(entity_type) LIKE UPPER(:search)
      )`;
      binds.search = `%${search}%`;
    }

    const result = await db.executeAsUser(`
      SELECT e.entity_id       AS influencer_id,
             e.entity_key      AS handle,
             e.node_id,
             e.node_type,
             e.display_name,
             e.operations_label,
             e.description,
             e.entity_type     AS platform,
             e.pathway_volume,
             e.service_point_count,
             e.outage_event_count,
             e.risk_score,
             e.open_reliability_gap_count,
             e.direct_connection_count,
             e.pathway_volume  AS follower_count,
             e.engagement_rate,
             e.risk_score      AS influence_score,
             e.operations_domain AS niche,
             e.city,
             e.region,
             e.is_verified,
             e.direct_connection_count AS connection_count,
             (SELECT COUNT(*)
              FROM restoration_case_entities ce
              WHERE ce.entity_id = e.entity_id) AS recent_posts
      FROM utility_graph_entity_metrics e
      ${where}
      ORDER BY e.risk_score DESC, connection_count DESC, e.entity_key
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows.map(withMetricAliases));
  } catch (err) {
    console.error('Restoration graph vertices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/network/:id - ego network for one restoration graph vertex.
router.get('/network/:id', async (req, res) => {
  try {
    const seedParam = String(req.params.id || '').trim();
    const depth = toGraphDepth(req.query.depth);
    const centerRow = await fetchGraphCenter(seedParam, req.demoUser);

    if (!centerRow) {
      return res.status(404).json({ error: 'Restoration graph entity not found' });
    }

    const seedId = centerRow.INFLUENCER_ID;

    const nodesMap  = new Map();
    const edgesSet  = new Set();
    const edgesList = [];

    const addNode = (row, type, hopLevel) => {
      const id = row.INFLUENCER_ID;
      if (!nodesMap.has(id)) nodesMap.set(id, { ...row, type, hopLevel });
    };

    const addEdge = (edge, hopLevel) => {
      const key = `${edge.FROM_ENTITY_ID}-${edge.TO_ENTITY_ID}-${edge.RELATIONSHIP_TYPE}`;
      if (edgesSet.has(key)) return;
      edgesSet.add(key);
      edgesList.push({
        source:       edge.FROM_ENTITY_ID,
        target:       edge.TO_ENTITY_ID,
        type:         edge.RELATIONSHIP_TYPE,
        edgeType:     edge.RELATIONSHIP_TYPE,
        edge_type:    edge.RELATIONSHIP_TYPE,
        displayName:  edge.EDGE_DISPLAY_NAME || formatEdgeTypeLabel(edge.RELATIONSHIP_TYPE),
        display_name: edge.EDGE_DISPLAY_NAME || formatEdgeTypeLabel(edge.RELATIONSHIP_TYPE),
        category:     edge.EDGE_CATEGORY || 'Uncategorized',
        description:  edge.EDGE_DESCRIPTION || '',
        strength:     edge.STRENGTH,
        interactions: edge.INTERACTION_COUNT,
        evidence:     edge.EVIDENCE_TEXT,
        hopLevel,
      });
    };

    addNode(centerRow, 'center', 0);

    const hop1Rows = await fetchConnections([seedId], 60, req.demoUser);
    const hop1Ids  = new Set([seedId]);

    for (const edge of hop1Rows) {
      addNode(nodeFromEdge(edge, 'from'), 'hop1', 1);
      addNode(nodeFromEdge(edge, 'to'),   'hop1', 1);
      hop1Ids.add(edge.FROM_ENTITY_ID);
      hop1Ids.add(edge.TO_ENTITY_ID);
      addEdge(edge, 1);
    }

    if (depth >= 2) {
      const hop1Only = [...hop1Ids].filter(id => id !== seedId).slice(0, 30);
      const hop2Rows = hop1Only.length ? await fetchConnections(hop1Only, 140, req.demoUser) : [];
      const hop2Ids = new Set(hop1Ids);
      for (const edge of hop2Rows) {
        addNode(nodeFromEdge(edge, 'from'), 'hop2', 2);
        addNode(nodeFromEdge(edge, 'to'),   'hop2', 2);
        hop2Ids.add(edge.FROM_ENTITY_ID);
        hop2Ids.add(edge.TO_ENTITY_ID);
        addEdge(edge, 2);
      }

      if (depth >= 3) {
        const newHop2 = [...hop2Ids].filter(id => !hop1Ids.has(id)).slice(0, 20);
        const hop3Rows = newHop2.length ? await fetchConnections(newHop2, 100, req.demoUser) : [];
        const hop3Ids = new Set(hop2Ids);
        for (const edge of hop3Rows) {
          addNode(nodeFromEdge(edge, 'from'), 'hop3', 3);
          addNode(nodeFromEdge(edge, 'to'),   'hop3', 3);
          hop3Ids.add(edge.FROM_ENTITY_ID);
          hop3Ids.add(edge.TO_ENTITY_ID);
          addEdge(edge, 3);
        }

        if (depth >= 4) {
          const newHop3 = [...hop3Ids].filter(id => !hop2Ids.has(id)).slice(0, 12);
          const hop4Rows = newHop3.length ? await fetchConnections(newHop3, 70, req.demoUser) : [];
          const hop4Ids = new Set(hop3Ids);
          for (const edge of hop4Rows) {
            addNode(nodeFromEdge(edge, 'from'), 'hop4', 4);
            addNode(nodeFromEdge(edge, 'to'),   'hop4', 4);
            hop4Ids.add(edge.FROM_ENTITY_ID);
            hop4Ids.add(edge.TO_ENTITY_ID);
            addEdge(edge, 4);
          }

          if (depth >= 5) {
            const newHop4 = [...hop4Ids].filter(id => !hop3Ids.has(id)).slice(0, 8);
            const hop5Rows = newHop4.length ? await fetchConnections(newHop4, 50, req.demoUser) : [];
            for (const edge of hop5Rows) {
              addNode(nodeFromEdge(edge, 'from'), 'hop5', 5);
              addNode(nodeFromEdge(edge, 'to'),   'hop5', 5);
              addEdge(edge, 5);
            }
          }
        }
      }
    }

    const [casesRes, edgeMetadata, findings] = await Promise.all([
      db.executeAsUser(`
        SELECT ce.case_entity_id AS link_id,
               c.case_id         AS brand_id,
               c.case_key        AS brand_name,
               c.case_type       AS brand_category,
               c.severity        AS social_tier,
               ce.role           AS relationship_type,
               ce.evidence_score AS avg_engagement,
               c.risk_score      AS revenue_attributed,
               c.summary
        FROM restoration_case_entities ce
        JOIN restoration_cases c ON ce.case_id = c.case_id
        WHERE ce.entity_id = :id
        ORDER BY c.risk_score DESC, ce.evidence_score DESC
      `, { id: seedId }, req.demoUser),
      fetchEdgeMetadata(req.demoUser),
      fetchPathwayFindings(seedId, depth, req.demoUser),
    ]);

    const center = {
      ...centerRow,
      CONNECTED_NODE_COUNT: nodesMap.size,
      PATHWAY_RELATIONSHIP_COUNT: edgesList.length,
      GRAPH_DEPTH: depth,
    };
    const stats = {
      nodeCount:  nodesMap.size,
      edgeCount:  edgesList.length,
      caseCount:  casesRes.rows.length,
      brandCount: casesRes.rows.length,
      depth,
      connectedNodeCount: nodesMap.size,
      pathwayRelationshipCount: edgesList.length,
      graphDepth: depth,
      connected_node_count: nodesMap.size,
      pathway_relationship_count: edgesList.length,
      graph_depth: depth,
    };
    res.json({
      center: withMetricAliases(center),
      nodes: Array.from(nodesMap.values()).map(withMetricAliases),
      edges: edgesList,
      edgeMetadata,
      findings,
      brands: casesRes.rows,
      cases: casesRes.rows,
      stats,
    });
  } catch (err) {
    console.error('Restoration graph network error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/edge-metadata - utilities-friendly labels for canonical edge types.
router.get('/edge-metadata', async (req, res) => {
  try {
    res.json(await fetchEdgeMetadata(req.demoUser));
  } catch (err) {
    console.error('Restoration graph edge metadata error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/propagation/:brandSlug - compatibility endpoint for case maps.
router.get('/propagation/:brandSlug', async (req, res) => {
  try {
    const result = await db.executeAsUser(`
      SELECT c.case_key,
             c.case_type,
             c.severity,
             c.risk_score,
             ce.role,
             ce.evidence_score,
             e.entity_key,
             e.display_name,
             e.operations_label,
             e.description,
             e.entity_type,
             e.operations_domain
      FROM restoration_cases c
      JOIN restoration_case_entities ce ON c.case_id = ce.case_id
      JOIN utility_graph_entities e ON ce.entity_id = e.entity_id
      WHERE LOWER(c.case_key) = LOWER(:slug)
      ORDER BY ce.evidence_score DESC
    `, { slug: req.params.brandSlug }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Restoration case map error:', err);
    res.status(500).json({ error: err.message });
  }
});

const EXAMPLE_QUERIES = {
  reliability_gap_paths: {
    name: 'Reliability Gap Pathways',
    description: 'Trace a service point through outage events to reliability gaps such as missed follow-up, demand response event reconciliation, or overdue monitoring.',
    params: [
      { key: 'service_point_key', label: 'Service Point Key', default: 'SP-1001' },
    ],
    buildSql: (p) => ({
      sql: `SELECT service_point_key, service_point_name, service_point_label,
       outage_event_key, outage_event_name, outage_event_label,
       gap_key, gap_name, gap_label, gap_edge, strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (p IS utility_entity) -[e1 IS restoration_link]-> (enc IS utility_entity)
          -[e2 IS restoration_link]-> (gap IS utility_entity)
    WHERE p.entity_key = :service_point_key
      AND p.entity_type = 'service_point'
      AND gap.entity_type = 'reliability_gap'
    COLUMNS (
        p.entity_key AS service_point_key,
        p.display_name AS service_point_name,
        p.operations_label AS service_point_label,
        enc.entity_key AS outage_event_key,
        enc.display_name AS outage_event_name,
        enc.operations_label AS outage_event_label,
        gap.entity_key AS gap_key,
        gap.display_name AS gap_name,
        gap.operations_label AS gap_label,
        e2.relationship_type AS gap_edge,
        e2.strength AS strength
    )
)
ORDER BY strength DESC`,
      binds: { service_point_key: p.service_point_key || 'SP-1001' },
      display: `-- SQL/PGQ: Service Point-to-reliability-gap traversal
SELECT service_point_key, service_point_name, service_point_label,
       outage_event_key, outage_event_label,
       gap_key, gap_label, gap_edge, strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (p IS utility_entity)
          -[e1 IS restoration_link]->
          (enc IS utility_entity)
          -[e2 IS restoration_link]->
          (gap IS utility_entity)
    WHERE p.entity_key = '${p.service_point_key || 'SP-1001'}'
      AND p.entity_type = 'service_point'
      AND gap.entity_type = 'reliability_gap'
    COLUMNS (
        p.entity_key AS service_point_key,
        p.display_name AS service_point_name,
        p.operations_label AS service_point_label,
        enc.entity_key AS outage_event_key,
        enc.operations_label AS outage_event_label,
        gap.entity_key AS gap_key,
        gap.display_name AS gap_name,
        gap.operations_label AS gap_label,
        e2.relationship_type AS gap_edge,
        e2.strength AS strength
    )
)
ORDER BY strength DESC;`,
    }),
  },

  repeat_outage_chain: {
    name: 'Repeat Outage Risk Chain',
    description: 'Follow the repeat outage-risk path from an index outage event to a reliability gap and a related restoration event.',
    params: [
      { key: 'service_point_key', label: 'Service Point Key', default: 'SP-1001' },
    ],
    buildSql: (p) => ({
      sql: `SELECT service_point_key, service_point_label, index_outage_event,
       risk_gap, risk_gap_label, related_return,
       first_edge, risk_edge, return_edge, return_strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (p IS utility_entity) -[e1 IS restoration_link]-> (enc IS utility_entity)
          -[e2 IS restoration_link]-> (gap IS utility_entity)
          -[e3 IS restoration_link]-> (return_enc IS utility_entity)
    WHERE p.entity_key = :service_point_key
      AND gap.entity_key = 'GAP-REPEAT-OUTAGE'
    COLUMNS (
        p.entity_key AS service_point_key,
        p.operations_label AS service_point_label,
        enc.display_name AS index_outage_event,
        gap.display_name AS risk_gap,
        gap.operations_label AS risk_gap_label,
        return_enc.display_name AS related_return,
        e1.relationship_type AS first_edge,
        e2.relationship_type AS risk_edge,
        e3.relationship_type AS return_edge,
        e3.strength AS return_strength
    )
)`,
      binds: { service_point_key: p.service_point_key || 'SP-1001' },
      display: `-- SQL/PGQ: Repeat Outage-risk chain
SELECT service_point_key, service_point_label, index_outage_event,
       risk_gap, risk_gap_label, related_return, first_edge, risk_edge,
       return_edge, return_strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (p IS utility_entity)
          -[e1 IS restoration_link]->
          (enc IS utility_entity)
          -[e2 IS restoration_link]->
          (gap IS utility_entity)
          -[e3 IS restoration_link]->
          (return_enc IS utility_entity)
    WHERE p.entity_key = '${p.service_point_key || 'SP-1001'}'
      AND gap.entity_key = 'GAP-REPEAT-OUTAGE'
    COLUMNS (
        p.entity_key AS service_point_key,
        p.operations_label AS service_point_label,
        enc.display_name AS index_outage_event,
        gap.display_name AS risk_gap,
        gap.operations_label AS risk_gap_label,
        return_enc.display_name AS related_return,
        e1.relationship_type AS first_edge,
        e2.relationship_type AS risk_edge,
        e3.relationship_type AS return_edge,
        e3.strength AS return_strength
    )
);`,
    }),
  },

  shared_field_crew: {
    name: 'Shared Field-Crew Cluster',
    description: 'Find other service points connected to the same field crew or operations coordination team.',
    params: [
      { key: 'service_point_key', label: 'Service Point Key', default: 'SP-1002' },
    ],
    buildSql: (p) => ({
      sql: `SELECT service_point_key, service_point_label, shared_owner,
       shared_owner_label, related_service_point_key,
       related_service_point, related_service_point_label, owner_strength, related_strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (p1 IS utility_entity) -[e1 IS restoration_link]-> (owner IS utility_entity)
          <-[e2 IS restoration_link]- (p2 IS utility_entity)
    WHERE p1.entity_key = :service_point_key
      AND p1.entity_type = 'service_point'
      AND p2.entity_type = 'service_point'
      AND owner.entity_type = 'field_crew'
      AND p1.entity_key <> p2.entity_key
    COLUMNS (
        p1.entity_key AS service_point_key,
        p1.operations_label AS service_point_label,
        owner.display_name AS shared_owner,
        owner.operations_label AS shared_owner_label,
        p2.entity_key AS related_service_point_key,
        p2.display_name AS related_service_point,
        p2.operations_label AS related_service_point_label,
        e1.strength AS owner_strength,
        e2.strength AS related_strength
    )
)
ORDER BY related_strength DESC`,
      binds: { service_point_key: p.service_point_key || 'SP-1002' },
      display: `-- SQL/PGQ: Shared field-crew cluster
SELECT service_point_key, service_point_label, shared_owner,
       shared_owner_label, related_service_point_key,
       related_service_point_label, owner_strength, related_strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (p1 IS utility_entity)
          -[e1 IS restoration_link]->
          (owner IS utility_entity)
          <-[e2 IS restoration_link]-
          (p2 IS utility_entity)
    WHERE p1.entity_key = '${p.service_point_key || 'SP-1002'}'
      AND p1.entity_type = 'service_point'
      AND p2.entity_type = 'service_point'
      AND owner.entity_type = 'field_crew'
      AND p1.entity_key <> p2.entity_key
    COLUMNS (
        p1.entity_key AS service_point_key,
        p1.operations_label AS service_point_label,
        owner.display_name AS shared_owner,
        owner.operations_label AS shared_owner_label,
        p2.entity_key AS related_service_point_key,
        p2.display_name AS related_service_point,
        p2.operations_label AS related_service_point_label,
        e1.strength AS owner_strength,
        e2.strength AS related_strength
    )
)
ORDER BY related_strength DESC;`,
    }),
  },

  case_map: {
    name: 'Case Evidence Map',
    description: 'Show all graph vertices involved in a restoration-workflow risk case and their evidence scores.',
    params: [
      { key: 'case_key', label: 'Case Key', default: 'CASE-FEEDER-REPEAT' },
    ],
    buildSql: (p) => ({
      sql: `SELECT case_key, case_type, severity,
       entity_key, entity_type, display_name, operations_label,
       role, evidence_score
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (c IS restoration_case) -[e IS restoration_case_involves]-> (entity IS utility_entity)
    WHERE c.case_key = :case_key
    COLUMNS (
        c.case_key AS case_key,
        c.case_type AS case_type,
        c.severity AS severity,
        entity.entity_key AS entity_key,
        entity.entity_type AS entity_type,
        entity.display_name AS display_name,
        entity.operations_label AS operations_label,
        e.role AS role,
        e.evidence_score AS evidence_score
    )
)
ORDER BY evidence_score DESC`,
      binds: { case_key: p.case_key || 'CASE-FEEDER-REPEAT' },
      display: `-- SQL/PGQ: Case evidence map
SELECT case_key, case_type, severity,
       entity_key, entity_type, display_name, operations_label,
       role, evidence_score
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (c IS restoration_case)
          -[e IS restoration_case_involves]->
          (entity IS utility_entity)
    WHERE c.case_key = '${p.case_key || 'CASE-FEEDER-REPEAT'}'
    COLUMNS (
        c.case_key AS case_key,
        c.case_type AS case_type,
        c.severity AS severity,
        entity.entity_key AS entity_key,
        entity.entity_type AS entity_type,
        entity.display_name AS display_name,
        entity.operations_label AS operations_label,
        e.role AS role,
        e.evidence_score AS evidence_score
    )
)
ORDER BY evidence_score DESC;`,
    }),
  },

  restoration_hubs: {
    name: 'Operations Hub Detection',
    description: 'Find high-degree utility entities that concentrate pathway risk across service points and cases.',
    params: [
      { key: 'entity_type', label: 'Entity Type (optional)', default: '' },
    ],
    buildSql: (p) => {
      const typeWhere = p.entity_type ? `\n    WHERE src.entity_type = :entity_type` : '';
      return {
        sql: `SELECT entity_key, display_name, operations_label,
       entity_type, operations_domain,
       MAX(pathway_volume) AS pathway_volume,
       MAX(risk_score) AS risk_score,
       COUNT(*) AS direct_connection_count,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (src IS utility_entity) -[e IS restoration_link]-> (dest IS utility_entity)${typeWhere}
    COLUMNS (
        src.entity_key AS entity_key,
        src.display_name AS display_name,
        src.operations_label AS operations_label,
        src.entity_type AS entity_type,
        src.operations_domain AS operations_domain,
        src.volume_count AS pathway_volume,
        src.risk_score AS risk_score,
        e.strength AS strength
    )
)
GROUP BY entity_key, display_name, operations_label, entity_type, operations_domain
ORDER BY direct_connection_count DESC, avg_strength DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: p.entity_type ? { entity_type: p.entity_type } : {},
        display: `-- SQL/PGQ: Operations hub degree centrality
SELECT entity_key, display_name, operations_label,
       entity_type, operations_domain,
       MAX(pathway_volume) AS pathway_volume,
       MAX(risk_score) AS risk_score,
       COUNT(*) AS direct_connection_count,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( service_restoration_network
    MATCH (src IS utility_entity)
          -[e IS restoration_link]->
          (dest IS utility_entity)${p.entity_type ? `\n    WHERE src.entity_type = '${p.entity_type}'` : ''}
    COLUMNS (
        src.entity_key AS entity_key,
        src.display_name AS display_name,
        src.operations_label AS operations_label,
        src.entity_type AS entity_type,
        src.operations_domain AS operations_domain,
        src.volume_count AS pathway_volume,
        src.risk_score AS risk_score,
        e.strength AS strength
    )
)
GROUP BY entity_key, display_name, operations_label,
         entity_type, operations_domain
ORDER BY direct_connection_count DESC, avg_strength DESC
FETCH FIRST 20 ROWS ONLY;`,
      };
    },
  },
};

// GET /api/graph/readiness — catalog identity plus a nonempty SQL/PGQ probe.
router.get('/readiness', async (req, res) => {
  try {
    const [catalog, probe] = await Promise.all([
      db.executeAsUser(`SELECT graph_name
        FROM user_property_graphs
        WHERE graph_name = 'SERVICE_RESTORATION_NETWORK'`, {}, req.demoUser),
      db.executeAsUser(`SELECT COUNT(*) AS probe_row_count
        FROM GRAPH_TABLE (
          service_restoration_network
          MATCH (a IS utility_entity) -[e IS restoration_link]-> (b IS utility_entity)
          COLUMNS (
            a.entity_id AS source_id,
            b.entity_id AS target_id
          )
        )`, {}, req.demoUser),
    ]);
    const probeRowCount = Number(probe.rows?.[0]?.PROBE_ROW_COUNT || 0);
    const ready = catalog.rows.length === 1 && probeRowCount > 0;
    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ACTIVE' : 'NOT_READY',
      available: ready,
      sourceObject: 'SERVICE_RESTORATION_NETWORK',
      executionSource: 'SQL_PGQ_GRAPH_TABLE',
      metadataSource: 'USER_PROPERTY_GRAPHS',
      probeRowCount,
    });
  } catch (err) {
    return res.status(503).json({
      status: 'UNAVAILABLE',
      available: false,
      sourceObject: 'SERVICE_RESTORATION_NETWORK',
      error: err.message,
    });
  }
});

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
    console.error('Restoration graph example query error:', err);
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    res.status(500).json({
      error: err.message,
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
