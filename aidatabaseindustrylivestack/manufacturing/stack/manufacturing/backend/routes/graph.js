/**
 * Graph API - manufacturing supplier and production-risk property graph queries.
 *
 * Returned data comes from MANUFACTURING_PRODUCTION_NETWORK and uses only
 * manufacturing-native entity and risk-case contracts.
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

function productionFindingFromRow(row = {}) {
  const findingId = row.FINDING_ID || row.finding_id;
  const findingType = row.FINDING_TYPE || row.finding_type;
  const title = row.TITLE || row.title || 'Production-risk finding';
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
    FROM   manufacturing_graph_edge_metadata
    ORDER  BY CASE category
                WHEN 'Supplier Network' THEN 1
                WHEN 'Production Flow' THEN 2
                WHEN 'Production Signals' THEN 3
                WHEN 'Risk Propagation' THEN 4
                WHEN 'Operations Coordination' THEN 5
                ELSE 9
              END,
              edge_type
  `, {}, demoUser);

  return (result.rows || []).map(edgeMetadataFromRow);
}

async function fetchProductionFindings(seedId, depth, demoUser) {
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
    FROM   manufacturing_graph_production_findings
    WHERE  center_entity_id = :seedId
      AND  min_graph_depth <= :depth
    ORDER  BY risk_score DESC NULLS LAST,
              CASE finding_type
                WHEN 'case_evidence' THEN 1
                WHEN 'production_signal_risk' THEN 2
                WHEN 'work_order_schedule_risk' THEN 3
                WHEN 'part_capacity_risk' THEN 4
                WHEN 'supplier_demand_exposure' THEN 5
                WHEN 'supplier_dependency_risk' THEN 6
                WHEN 'production_bottleneck' THEN 7
                ELSE 9
              END,
              finding_id
    FETCH FIRST 6 ROWS ONLY
  `, { seedId, depth }, demoUser);

  return (result.rows || []).map(productionFindingFromRow);
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
           f.operations_label AS from_operations_label,
           f.description      AS from_description,
           f.entity_type      AS from_type,
           f.signal_reach     AS from_signal_reach,
           f.supplier_count   AS from_supplier_count,
           f.work_order_count AS from_work_order_count,
           f.production_signal_count AS from_production_signal_count,
           f.risk_score       AS from_risk_score,
           f.direct_connection_count AS from_direct_connection_count,
           f.operations_domain AS from_domain,
           f.city             AS from_city,
           f.region           AS from_region,
           f.is_verified      AS from_verified,
           f.engagement_rate  AS from_engagement,
           t.entity_key       AS to_key,
           t.display_name     AS to_display,
           t.operations_label AS to_operations_label,
           t.description      AS to_description,
           t.entity_type      AS to_type,
           t.signal_reach     AS to_signal_reach,
           t.supplier_count   AS to_supplier_count,
           t.work_order_count AS to_work_order_count,
           t.production_signal_count AS to_production_signal_count,
           t.risk_score       AS to_risk_score,
           t.direct_connection_count AS to_direct_connection_count,
           t.operations_domain AS to_domain,
           t.city             AS to_city,
           t.region           AS to_region,
           t.is_verified      AS to_verified,
           t.engagement_rate  AS to_engagement
    FROM   manufacturing_graph_relationships r
    JOIN   manufacturing_graph_entity_metrics f ON r.from_entity_id = f.entity_id
    JOIN   manufacturing_graph_entity_metrics t ON r.to_entity_id   = t.entity_id
    LEFT JOIN manufacturing_graph_edge_metadata m ON m.edge_type = r.relationship_type
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
    ENTITY_ID:       from ? edge.FROM_ENTITY_ID   : edge.TO_ENTITY_ID,
    ENTITY_KEY:      from ? edge.FROM_KEY         : edge.TO_KEY,
    NODE_ID:         from ? edge.FROM_KEY         : edge.TO_KEY,
    DISPLAY_NAME:    from ? edge.FROM_DISPLAY     : edge.TO_DISPLAY,
    OPERATIONS_LABEL: from ? edge.FROM_OPERATIONS_LABEL : edge.TO_OPERATIONS_LABEL,
    DESCRIPTION:     from ? edge.FROM_DESCRIPTION : edge.TO_DESCRIPTION,
    ENTITY_TYPE:     from ? edge.FROM_TYPE        : edge.TO_TYPE,
    NODE_TYPE:       from ? edge.FROM_TYPE        : edge.TO_TYPE,
    SIGNAL_REACH:    from ? edge.FROM_SIGNAL_REACH : edge.TO_SIGNAL_REACH,
    SUPPLIER_COUNT:  from ? edge.FROM_SUPPLIER_COUNT : edge.TO_SUPPLIER_COUNT,
    WORK_ORDER_COUNT: from ? edge.FROM_WORK_ORDER_COUNT : edge.TO_WORK_ORDER_COUNT,
    PRODUCTION_SIGNAL_COUNT: from ? edge.FROM_PRODUCTION_SIGNAL_COUNT : edge.TO_PRODUCTION_SIGNAL_COUNT,
    RISK_SCORE:      from ? edge.FROM_RISK_SCORE : edge.TO_RISK_SCORE,
    DIRECT_CONNECTION_COUNT: from ? edge.FROM_DIRECT_CONNECTION_COUNT : edge.TO_DIRECT_CONNECTION_COUNT,
    OPERATIONS_DOMAIN: from ? edge.FROM_DOMAIN      : edge.TO_DOMAIN,
    CITY:            from ? edge.FROM_CITY        : edge.TO_CITY,
    REGION:          from ? edge.FROM_REGION      : edge.TO_REGION,
    IS_VERIFIED:     from ? edge.FROM_VERIFIED    : edge.TO_VERIFIED,
    ENGAGEMENT_RATE: from ? edge.FROM_ENGAGEMENT  : edge.TO_ENGAGEMENT,
  };
  return withMetricAliases(node);
}

function withMetricAliases(row) {
  if (!row) return row;
  const signalReach = row.SIGNAL_REACH ?? row.signal_reach;
  const riskScore = row.RISK_SCORE ?? row.risk_score;
  const supplierCount = row.SUPPLIER_COUNT ?? row.supplier_count;
  const workOrderCount = row.WORK_ORDER_COUNT ?? row.work_order_count;
  const productionSignalCount = row.PRODUCTION_SIGNAL_COUNT ?? row.production_signal_count;
  const directConnectionCount = row.DIRECT_CONNECTION_COUNT ?? row.direct_connection_count ?? row.TOTAL_CONNECTIONS ?? row.CONNECTION_COUNT;
  const connectedNodeCount = row.CONNECTED_NODE_COUNT ?? row.connected_node_count;
  const productionRelationshipCount = row.PRODUCTION_RELATIONSHIP_COUNT ?? row.production_relationship_count;
  const graphDepth = row.GRAPH_DEPTH ?? row.graph_depth;
  const nodeId = row.NODE_ID ?? row.node_id ?? row.ENTITY_KEY;
  const nodeType = row.NODE_TYPE ?? row.node_type ?? row.ENTITY_TYPE;
  const operationsLabel = row.OPERATIONS_LABEL ?? row.operations_label;
  const description = row.DESCRIPTION ?? row.description;

  return {
    ...row,
    NODE_ID: nodeId,
    NODE_TYPE: nodeType,
    OPERATIONS_LABEL: operationsLabel,
    DESCRIPTION: description,
    SIGNAL_REACH: signalReach,
    RISK_SCORE: riskScore,
    SUPPLIER_COUNT: supplierCount,
    WORK_ORDER_COUNT: workOrderCount,
    PRODUCTION_SIGNAL_COUNT: productionSignalCount,
    DIRECT_CONNECTION_COUNT: directConnectionCount,
    signal_reach: signalReach,
    risk_score: riskScore,
    supplier_count: supplierCount,
    work_order_count: workOrderCount,
    production_signal_count: productionSignalCount,
    direct_connection_count: directConnectionCount,
    connected_node_count: connectedNodeCount,
    production_relationship_count: productionRelationshipCount,
    graph_depth: graphDepth,
    node_id: nodeId,
    node_type: nodeType,
    operations_label: operationsLabel,
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
    SELECT e.entity_id,
           e.entity_key,
           e.node_id,
           e.node_type,
           e.display_name,
           e.operations_label,
           e.description,
           e.entity_type,
           e.signal_reach,
           e.supplier_count,
           e.work_order_count,
           e.production_signal_count,
           e.risk_score,
           e.direct_connection_count,
           e.engagement_rate,
           e.operations_domain,
           e.city,
           e.region,
           e.is_verified,
           e.summary,
           e.direct_connection_count AS total_connections,
           (SELECT COUNT(*)
            FROM manufacturing_case_entities ce
            WHERE ce.entity_id = e.entity_id) AS brand_count,
           e.production_signal_count
    FROM manufacturing_graph_entity_metrics e
    WHERE ${centerWhere}
  `, binds, demoUser);

  return result.rows.length ? withMetricAliases(result.rows[0]) : null;
}

// GET /api/graph/entities - manufacturing graph vertices.
router.get('/entities', async (req, res) => {
  try {
    const { entityType, operationsDomain, search } = req.query;
    const limit = toLimit(req.query.limit);
    let where = 'WHERE 1=1';
    const binds = { limit };

    if (entityType) {
      where += ' AND entity_type = :entityType';
      binds.entityType = entityType;
    }
    if (operationsDomain) {
      where += ' AND operations_domain = :operationsDomain';
      binds.operationsDomain = operationsDomain;
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
      SELECT e.entity_id,
             e.entity_key,
             e.node_id,
             e.node_type,
             e.display_name,
             e.operations_label,
             e.description,
             e.entity_type,
             e.signal_reach,
             e.supplier_count,
             e.work_order_count,
             e.production_signal_count,
             e.risk_score,
             e.direct_connection_count,
             e.engagement_rate,
             e.operations_domain,
             e.city,
             e.region,
             e.is_verified,
             e.direct_connection_count AS connection_count
      FROM manufacturing_graph_entity_metrics e
      ${where}
      ORDER BY e.risk_score DESC, connection_count DESC, e.entity_key
      FETCH FIRST :limit ROWS ONLY
    `, binds, req.demoUser);

    res.json(result.rows.map(withMetricAliases));
  } catch (err) {
    console.error('Manufacturing graph vertices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/production-network/:id - bounded network for one graph entity.
router.get('/production-network/:id', async (req, res) => {
  try {
    const seedParam = String(req.params.id || '').trim();
    const depth = toGraphDepth(req.query.depth);
    const centerRow = await fetchGraphCenter(seedParam, req.demoUser);

    if (!centerRow) {
      return res.status(404).json({ error: 'Manufacturing graph entity not found' });
    }

    const seedId = centerRow.ENTITY_ID;

    const nodesMap  = new Map();
    const edgesSet  = new Set();
    const edgesList = [];

    const addNode = (row, type, hopLevel) => {
      const id = row.ENTITY_ID;
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
               c.case_id,
               c.case_key,
               c.case_type,
               c.severity,
               ce.role           AS relationship_type,
               ce.evidence_score AS avg_engagement,
               c.risk_score,
               c.summary
        FROM manufacturing_case_entities ce
        JOIN manufacturing_risk_cases c ON ce.case_id = c.case_id
        WHERE ce.entity_id = :id
        ORDER BY c.risk_score DESC, ce.evidence_score DESC
      `, { id: seedId }, req.demoUser),
      fetchEdgeMetadata(req.demoUser),
      fetchProductionFindings(seedId, depth, req.demoUser),
    ]);

    const center = {
      ...centerRow,
      CONNECTED_NODE_COUNT: nodesMap.size,
      PRODUCTION_RELATIONSHIP_COUNT: edgesList.length,
      GRAPH_DEPTH: depth,
    };
    const stats = {
      nodeCount:  nodesMap.size,
      edgeCount:  edgesList.length,
      caseCount:  casesRes.rows.length,
      depth,
      connectedNodeCount: nodesMap.size,
      productionRelationshipCount: edgesList.length,
      graphDepth: depth,
      connected_node_count: nodesMap.size,
      production_relationship_count: edgesList.length,
      graph_depth: depth,
    };
    res.json({
      center: withMetricAliases(center),
      nodes: Array.from(nodesMap.values()).map(withMetricAliases),
      edges: edgesList,
      edgeMetadata,
      findings,
      cases: casesRes.rows,
      stats,
    });
  } catch (err) {
    console.error('Manufacturing graph network error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/edge-metadata - manufacturing-friendly labels for canonical edge types.
router.get('/edge-metadata', async (req, res) => {
  try {
    res.json(await fetchEdgeMetadata(req.demoUser));
  } catch (err) {
    console.error('Manufacturing graph edge metadata error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/risk-cases/:caseKey - relational evidence for a graph risk case.
router.get('/risk-cases/:caseKey', async (req, res) => {
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
      FROM manufacturing_risk_cases c
      JOIN manufacturing_case_entities ce ON c.case_id = ce.case_id
      JOIN manufacturing_graph_entities e ON ce.entity_id = e.entity_id
      WHERE LOWER(c.case_key) = LOWER(:slug)
      ORDER BY ce.evidence_score DESC
    `, { slug: req.params.caseKey }, req.demoUser);

    res.json(result.rows);
  } catch (err) {
    console.error('Manufacturing risk case map error:', err);
    res.status(500).json({ error: err.message });
  }
});

const EXAMPLE_QUERIES = {
  supplier_work_order_paths: {
    name: 'Supplier Work Order Paths',
    description: 'Trace current supplied parts from a supplier to affected work orders.',
    params: [
      { key: 'supplier_key', label: 'Supplier Key (optional)', default: '' },
    ],
    buildSql: (p) => {
      const supplierKey = String(p.supplier_key || '').trim();
      const filter = supplierKey ? '\n      AND supplier.entity_key = :supplier_key' : '';
      const sql = `SELECT supplier_key, supplier_label,
       part_key, part_label,
       work_order_key, work_order_label,
       supplier_edge, work_order_edge, work_order_risk
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (supplier IS manufacturing_entity) -[supply IS production_link]-> (part IS manufacturing_entity)
          -[requirement IS production_link]-> (work_order IS manufacturing_entity)
    WHERE supplier.entity_type = 'supplier'
      AND part.entity_type = 'part'
      AND work_order.entity_type = 'work_order'
      AND supply.relationship_type = 'produces_part'
      AND requirement.relationship_type = 'constrains_work_order'${filter}
    COLUMNS (
        supplier.entity_key AS supplier_key,
        supplier.operations_label AS supplier_label,
        part.entity_key AS part_key,
        part.operations_label AS part_label,
        work_order.entity_key AS work_order_key,
        work_order.operations_label AS work_order_label,
        supply.relationship_type AS supplier_edge,
        requirement.relationship_type AS work_order_edge,
        work_order.risk_score AS work_order_risk
    )
)
ORDER BY work_order_risk DESC`;
      return {
        sql,
        binds: supplierKey ? { supplier_key: supplierKey } : {},
        display: `-- SQL/PGQ: Live supplier-to-part-to-work-order path\n${sql};`,
      };
    },
  },

  work_order_schedule_risk: {
    name: 'Work Order Schedule Risk',
    description: 'Follow supplied parts into current work orders and their scheduled plants.',
    params: [
      { key: 'work_order_key', label: 'Work Order Key (optional)', default: '' },
    ],
    buildSql: (p) => {
      const workOrderKey = String(p.work_order_key || '').trim();
      const filter = workOrderKey ? '\n      AND work_order.entity_key = :work_order_key' : '';
      const sql = `SELECT supplier_key, part_key, work_order_key, plant_key,
       supplier_edge, work_order_edge, plant_edge, work_order_risk
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (supplier IS manufacturing_entity) -[supply IS production_link]-> (part IS manufacturing_entity)
          -[requirement IS production_link]-> (work_order IS manufacturing_entity)
          -[schedule IS production_link]-> (plant IS manufacturing_entity)
    WHERE supplier.entity_type = 'supplier'
      AND part.entity_type = 'part'
      AND work_order.entity_type = 'work_order'
      AND plant.entity_type = 'plant'
      AND supply.relationship_type = 'produces_part'
      AND requirement.relationship_type = 'constrains_work_order'
      AND schedule.relationship_type = 'scheduled_on'${filter}
    COLUMNS (
        supplier.entity_key AS supplier_key,
        part.entity_key AS part_key,
        work_order.entity_key AS work_order_key,
        plant.entity_key AS plant_key,
        supply.relationship_type AS supplier_edge,
        requirement.relationship_type AS work_order_edge,
        schedule.relationship_type AS plant_edge,
        work_order.risk_score AS work_order_risk
    )
)
ORDER BY work_order_risk DESC`;
      return {
        sql,
        binds: workOrderKey ? { work_order_key: workOrderKey } : {},
        display: `-- SQL/PGQ: Live work-order schedule path\n${sql};`,
      };
    },
  },

  production_signal_work_order_paths: {
    name: 'Production Signal Work Order Paths',
    description: 'Trace current production signals into attributed work orders and scheduled plants.',
    params: [
      { key: 'signal_key', label: 'Signal Key (optional)', default: '' },
    ],
    buildSql: (p) => {
      const signalKey = String(p.signal_key || '').trim();
      const filter = signalKey ? '\n      AND signal.entity_key = :signal_key' : '';
      const sql = `SELECT signal_key, work_order_key, plant_key,
       signal_edge, plant_edge, signal_risk, work_order_risk
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (signal IS manufacturing_entity) -[trigger IS production_link]-> (work_order IS manufacturing_entity)
          -[schedule IS production_link]-> (plant IS manufacturing_entity)
    WHERE signal.entity_type = 'production_signal'
      AND work_order.entity_type = 'work_order'
      AND plant.entity_type = 'plant'
      AND trigger.relationship_type = 'triggered_by_signal'
      AND schedule.relationship_type = 'scheduled_on'${filter}
    COLUMNS (
        signal.entity_key AS signal_key,
        work_order.entity_key AS work_order_key,
        plant.entity_key AS plant_key,
        trigger.relationship_type AS signal_edge,
        schedule.relationship_type AS plant_edge,
        signal.risk_score AS signal_risk,
        work_order.risk_score AS work_order_risk
    )
)
ORDER BY work_order_risk DESC, signal_risk DESC`;
      return {
        sql,
        binds: signalKey ? { signal_key: signalKey } : {},
        display: `-- SQL/PGQ: Live production-signal work-order path\n${sql};`,
      };
    },
  },

  part_availability_paths: {
    name: 'Part Availability Paths',
    description: 'Show which current suppliers and plants are connected through part availability.',
    params: [
      { key: 'part_key', label: 'Part Key (optional)', default: '' },
    ],
    buildSql: (p) => {
      const partKey = String(p.part_key || '').trim();
      const filter = partKey ? '\n      AND part.entity_key = :part_key' : '';
      const sql = `SELECT supplier_key, part_key, plant_key,
       supplier_edge, availability_edge, part_risk, plant_risk
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (supplier IS manufacturing_entity) -[supply IS production_link]-> (part IS manufacturing_entity)
          -[availability IS production_link]-> (plant IS manufacturing_entity)
    WHERE supplier.entity_type = 'supplier'
      AND part.entity_type = 'part'
      AND plant.entity_type = 'plant'
      AND supply.relationship_type = 'produces_part'
      AND availability.relationship_type = 'feeds_line'${filter}
    COLUMNS (
        supplier.entity_key AS supplier_key,
        part.entity_key AS part_key,
        plant.entity_key AS plant_key,
        supply.relationship_type AS supplier_edge,
        availability.relationship_type AS availability_edge,
        part.risk_score AS part_risk,
        plant.risk_score AS plant_risk
    )
)
ORDER BY part_risk DESC, plant_risk DESC`;
      return {
        sql,
        binds: partKey ? { part_key: partKey } : {},
        display: `-- SQL/PGQ: Live supplier-to-part-to-plant path\n${sql};`,
      };
    },
  },

  signal_supported_work_order_paths: {
    name: 'Signal-Supported Work Order Paths',
    description: 'Find production signals that mention parts required by current work orders.',
    params: [
      { key: 'work_order_key', label: 'Work Order Key (optional)', default: '' },
    ],
    buildSql: (p) => {
      const workOrderKey = String(p.work_order_key || '').trim();
      const filter = workOrderKey ? '\n      AND work_order.entity_key = :work_order_key' : '';
      const sql = `SELECT signal_key, part_key, work_order_key,
       signal_edge, work_order_edge, signal_risk, work_order_risk
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (signal IS manufacturing_entity) -[mention IS production_link]-> (part IS manufacturing_entity)
          -[requirement IS production_link]-> (work_order IS manufacturing_entity)
    WHERE signal.entity_type = 'production_signal'
      AND part.entity_type = 'part'
      AND work_order.entity_type = 'work_order'
      AND mention.relationship_type = 'triggered_by_signal'
      AND requirement.relationship_type = 'constrains_work_order'${filter}
    COLUMNS (
        signal.entity_key AS signal_key,
        part.entity_key AS part_key,
        work_order.entity_key AS work_order_key,
        mention.relationship_type AS signal_edge,
        requirement.relationship_type AS work_order_edge,
        signal.risk_score AS signal_risk,
        work_order.risk_score AS work_order_risk
    )
)
ORDER BY work_order_risk DESC, signal_risk DESC`;
      return {
        sql,
        binds: workOrderKey ? { work_order_key: workOrderKey } : {},
        display: `-- SQL/PGQ: Live signal-to-part-to-work-order path\n${sql};`,
      };
    },
  },

  case_map: {
    name: 'Risk Case Evidence Map',
    description: 'Show all graph vertices involved in a manufacturing risk case and their evidence scores.',
    params: [
      { key: 'case_key', label: 'Case Key (optional)', default: '' },
    ],
    buildSql: (p) => {
      const caseKey = String(p.case_key || '').trim();
      const filter = caseKey ? '\n      AND c.case_key = :case_key' : '';
      const sql = `SELECT case_key, case_type, severity,
       entity_key, entity_type, display_name, operations_label,
       role, evidence_score
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (c IS manufacturing_case) -[e IS case_involves]-> (entity IS manufacturing_entity)
    WHERE 1 = 1${filter}
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
ORDER BY evidence_score DESC`;
      return {
        sql,
        binds: caseKey ? { case_key: caseKey } : {},
        display: `-- SQL/PGQ: Live relational risk-case evidence map\n${sql};`,
      };
    },
  },

  production_hubs: {
    name: 'Production Hub Detection',
    description: 'Find high-degree manufacturing entities that concentrate production risk.',
    params: [
      { key: 'entity_type', label: 'Entity Type (optional)', default: '' },
    ],
    buildSql: (p) => {
      const typeWhere = p.entity_type ? `\n    WHERE src.entity_type = :entity_type` : '';
      return {
        sql: `SELECT entity_key, display_name, operations_label,
       entity_type, operations_domain,
       MAX(signal_reach) AS signal_reach,
       MAX(risk_score) AS risk_score,
       COUNT(*) AS direct_connection_count,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (src IS manufacturing_entity) -[e IS production_link]-> (dest IS manufacturing_entity)${typeWhere}
    COLUMNS (
        src.entity_key AS entity_key,
        src.display_name AS display_name,
        src.operations_label AS operations_label,
        src.entity_type AS entity_type,
        src.operations_domain AS operations_domain,
        src.volume_count AS signal_reach,
        src.risk_score AS risk_score,
        e.strength AS strength
    )
)
GROUP BY entity_key, display_name, operations_label, entity_type, operations_domain
ORDER BY direct_connection_count DESC, avg_strength DESC
FETCH FIRST 20 ROWS ONLY`,
        binds: p.entity_type ? { entity_type: p.entity_type } : {},
        display: `-- SQL/PGQ: Production hub degree centrality
SELECT entity_key, display_name, operations_label,
       entity_type, operations_domain,
       MAX(signal_reach) AS signal_reach,
       MAX(risk_score) AS risk_score,
       COUNT(*) AS direct_connection_count,
       ROUND(AVG(strength), 3) AS avg_strength
FROM GRAPH_TABLE ( manufacturing_production_network
    MATCH (src IS manufacturing_entity)
          -[e IS production_link]->
          (dest IS manufacturing_entity)${p.entity_type ? `\n    WHERE src.entity_type = '${p.entity_type}'` : ''}
    COLUMNS (
        src.entity_key AS entity_key,
        src.display_name AS display_name,
        src.operations_label AS operations_label,
        src.entity_type AS entity_type,
        src.operations_domain AS operations_domain,
        src.volume_count AS signal_reach,
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
    console.error('Manufacturing graph example query error:', err);
    const queryDef = EXAMPLE_QUERIES[req.body?.queryId];
    res.status(500).json({
      error: err.message,
      sql: queryDef ? queryDef.buildSql(req.body?.params || {}).display : null,
    });
  }
});

module.exports = router;
