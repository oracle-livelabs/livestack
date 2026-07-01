/**
 * Canonical Manufacturing APIs backed directly by Oracle domain objects.
 */
const express = require('express');
const db = require('../config/database');
const requireDemoIdentity = require('../middleware/requireDemoIdentity');

const router = express.Router();

const DOCUMENTS = Object.freeze({
  part: Object.freeze({
    documentType: 'manufactured-part-capacity',
    sourceObject: 'MANUFACTURED_PART_CAPACITY_DV',
  }),
  workOrder: Object.freeze({
    documentType: 'manufacturing-work-order',
    sourceObject: 'MANUFACTURING_WORK_ORDER_DOCUMENTS_DV',
  }),
  plant: Object.freeze({
    documentType: 'manufacturing-plant-capacity',
    sourceObject: 'MANUFACTURING_PLANT_CAPACITY_DV',
  }),
});

const GRAPH_NAME = 'MANUFACTURING_PRODUCTION_NETWORK';
const GRAPH_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_GRAPH_LIMIT = 200;
const MAX_GRAPH_DEPTH = 5;

const GRAPH_DATASET_STATE_SQL = `
  SELECT graph_state.graph_name,
         graph_state.dataset_source,
         graph_state.dataset_version,
         graph_state.entity_count,
         graph_state.relationship_count,
         graph_state.loaded_at,
         dataset.active_source,
         dataset.active_version
  FROM manufacturing_graph_state graph_state
  LEFT JOIN app_dataset_state dataset
    ON dataset.state_id = 1
  WHERE graph_state.graph_name = :graph_name
`;

const GRAPH_ENTITIES_SQL = `
  SELECT *
  FROM (
    SELECT *
    FROM GRAPH_TABLE (
      manufacturing_production_network
      MATCH (entity IS manufacturing_entity)
      COLUMNS (
        entity.entity_id AS entity_id,
        entity.entity_key AS entity_key,
        entity.entity_type AS entity_type,
        entity.display_name AS display_name,
        entity.operations_label AS operations_label,
        entity.description AS description,
        entity.operations_domain AS operations_domain,
        entity.risk_score AS risk_score,
        entity.volume_count AS volume_count,
        entity.city AS city,
        entity.region AS region,
        entity.is_verified AS is_verified,
        entity.source_object AS source_object,
        entity.source_key AS source_key,
        entity.dataset_version AS dataset_version
      )
    )
    ORDER BY risk_score DESC, entity_key
  )
  WHERE ROWNUM <= :limit
`;

const GRAPH_CENTER_SQL = `
  SELECT *
  FROM GRAPH_TABLE (
    manufacturing_production_network
    MATCH (entity IS manufacturing_entity)
    WHERE entity.entity_key = :entity_key
    COLUMNS (
      entity.entity_id AS entity_id,
      entity.entity_key AS entity_key,
      entity.entity_type AS entity_type,
      entity.display_name AS display_name,
      entity.operations_label AS operations_label,
      entity.description AS description,
      entity.operations_domain AS operations_domain,
      entity.risk_score AS risk_score,
      entity.volume_count AS volume_count,
      entity.city AS city,
      entity.region AS region,
      entity.is_verified AS is_verified,
      entity.source_object AS source_object,
      entity.source_key AS source_key,
      entity.dataset_version AS dataset_version
    )
  )
`;

const GRAPH_VISIBLE_COUNTS_SQL = `
  SELECT
    (
      SELECT COUNT(*)
      FROM GRAPH_TABLE (
        manufacturing_production_network
        MATCH (entity IS manufacturing_entity)
        COLUMNS (entity.entity_id AS entity_id)
      )
    ) AS entity_count,
    (
      SELECT COUNT(*)
      FROM GRAPH_TABLE (
        manufacturing_production_network
        MATCH
          (from_vertex IS manufacturing_entity)
          -[relationship IS production_link]->
          (to_vertex IS manufacturing_entity)
        COLUMNS (relationship.relationship_id AS relationship_id)
      )
    ) AS relationship_count
  FROM dual
`;

const GRAPH_CASE_SQL = `
  SELECT *
  FROM GRAPH_TABLE (
    manufacturing_production_network
    MATCH
      (risk_case IS manufacturing_case)
      -[evidence IS case_involves]->
      (entity IS manufacturing_entity)
    WHERE risk_case.case_key = :case_key
    COLUMNS (
      risk_case.case_id AS case_id,
      risk_case.case_key AS case_key,
      risk_case.case_type AS case_type,
      risk_case.severity AS severity,
      risk_case.status AS case_status,
      risk_case.risk_score AS case_risk_score,
      risk_case.summary AS case_summary,
      evidence.case_entity_id AS case_entity_id,
      evidence.role AS evidence_role,
      evidence.evidence_score AS evidence_score,
      evidence.note AS evidence_note,
      entity.entity_id AS entity_id,
      entity.entity_key AS entity_key,
      entity.entity_type AS entity_type,
      entity.display_name AS display_name,
      entity.source_object AS source_object,
      entity.source_key AS source_key
    )
  )
  ORDER BY evidence_score DESC, entity_key
`;

function parsePositiveInteger(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseJsonDocument(raw) {
  let document = raw;
  if (Array.isArray(document)) document = document[0];
  if (typeof document === 'string') document = JSON.parse(document);
  return document;
}

function rowValue(row, key) {
  return row?.[key] ?? row?.[key.toUpperCase()] ?? row?.[key.toLowerCase()];
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseBoundedInteger(raw, defaultValue, min, max) {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function normalizeGraphEntity(row, prefix = '') {
  const field = (name) => rowValue(row, prefix ? `${prefix}_${name}` : name);
  return {
    entityId: nullableNumber(field('entity_id')),
    entityKey: field('entity_key'),
    entityType: field('entity_type'),
    displayName: field('display_name'),
    operationsLabel: field('operations_label') || null,
    description: field('description') || null,
    operationsDomain: field('operations_domain') || null,
    riskScore: nullableNumber(field('risk_score')),
    volumeCount: nullableNumber(field('volume_count')),
    city: field('city') || null,
    region: field('region') || null,
    verified: String(field('is_verified') || '').toUpperCase() === 'Y',
    sourceObject: field('source_object') || null,
    sourceKey: field('source_key') || null,
    datasetVersion: field('dataset_version') || null,
  };
}

function makeHttpError(statusCode, code, message, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

async function requireCurrentGraphDataset(execute = db.execute) {
  const result = await execute(GRAPH_DATASET_STATE_SQL, { graph_name: GRAPH_NAME });
  if (result.rows.length !== 1) {
    throw makeHttpError(503, 'GRAPH_NOT_READY', 'Manufacturing graph dataset state is not installed');
  }

  const row = result.rows[0];
  const graphSource = String(rowValue(row, 'dataset_source') || '').toLowerCase();
  const graphVersion = String(rowValue(row, 'dataset_version') || '');
  const activeSource = String(rowValue(row, 'active_source') || '').toLowerCase();
  const activeVersion = String(rowValue(row, 'active_version') || '');

  if (!activeSource || graphSource !== activeSource || graphVersion !== activeVersion) {
    throw makeHttpError(
      409,
      'GRAPH_DATASET_MISMATCH',
      'Manufacturing graph does not match the active application dataset',
      {
        graph: { source: graphSource || null, version: graphVersion || null },
        active: { source: activeSource || null, version: activeVersion || null },
      }
    );
  }

  return {
    datasetSource: graphSource,
    datasetVersion: graphVersion,
    entityCount: nullableNumber(rowValue(row, 'entity_count')) || 0,
    relationshipCount: nullableNumber(rowValue(row, 'relationship_count')) || 0,
    loadedAt: rowValue(row, 'loaded_at') || null,
  };
}

function buildGraphOneHopSql(seedIds) {
  const safeIds = [...new Set(seedIds.map(Number))];
  if (
    safeIds.length === 0 ||
    safeIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw makeHttpError(500, 'GRAPH_TRAVERSAL_ERROR', 'Graph traversal received an invalid vertex identifier');
  }

  const binds = {};
  const placeholders = safeIds.map((id, index) => {
    const key = `seed${index}`;
    binds[key] = id;
    return `:${key}`;
  });

  const sql = `
    SELECT DISTINCT *
    FROM GRAPH_TABLE (
      manufacturing_production_network
      MATCH
        (seed IS manufacturing_entity
          WHERE seed.entity_id IN (${placeholders.join(', ')}))
        -[relationship IS production_link]-
        (neighbor IS manufacturing_entity)
      COLUMNS (
        relationship.relationship_id AS relationship_id,
        relationship.from_entity_id AS from_entity_id,
        relationship.to_entity_id AS to_entity_id,
        relationship.relationship_type AS relationship_type,
        relationship.strength AS strength,
        relationship.interaction_count AS interaction_count,
        relationship.evidence_text AS evidence_text
      )
    )
    ORDER BY relationship_id
  `;

  return { sql, binds };
}

function buildGraphEntitiesByIdsSql(entityIds) {
  const safeIds = [...new Set(entityIds.map(Number))];
  if (
    safeIds.length === 0
    || safeIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
  ) {
    throw makeHttpError(500, 'GRAPH_HYDRATION_ERROR', 'Graph hydration received an invalid vertex identifier');
  }

  const binds = {};
  const placeholders = safeIds.map((id, index) => {
    const key = `entity${index}`;
    binds[key] = id;
    return `:${key}`;
  });

  return {
    binds,
    sql: `
      SELECT *
      FROM GRAPH_TABLE (
        manufacturing_production_network
        MATCH
          (entity IS manufacturing_entity
            WHERE entity.entity_id IN (${placeholders.join(', ')}))
        COLUMNS (
          entity.entity_id AS entity_id,
          entity.entity_key AS entity_key,
          entity.entity_type AS entity_type,
          entity.display_name AS display_name,
          entity.operations_label AS operations_label,
          entity.description AS description,
          entity.operations_domain AS operations_domain,
          entity.risk_score AS risk_score,
          entity.volume_count AS volume_count,
          entity.city AS city,
          entity.region AS region,
          entity.is_verified AS is_verified,
          entity.source_object AS source_object,
          entity.source_key AS source_key,
          entity.dataset_version AS dataset_version
        )
      )
      ORDER BY entity_id
    `,
  };
}

function buildGraphCasesForEntitiesSql(entityIds) {
  const safeIds = [...new Set(entityIds.map(Number))];
  const binds = {};
  const placeholders = safeIds.map((id, index) => {
    const key = `entity${index}`;
    binds[key] = id;
    return `:${key}`;
  });

  return {
    binds,
    sql: `
      SELECT *
      FROM GRAPH_TABLE (
        manufacturing_production_network
        MATCH
          (risk_case IS manufacturing_case)
          -[evidence IS case_involves]->
          (entity IS manufacturing_entity)
        WHERE entity.entity_id IN (${placeholders.join(', ')})
        COLUMNS (
          risk_case.case_id AS case_id,
          risk_case.case_key AS case_key,
          risk_case.case_type AS case_type,
          risk_case.severity AS severity,
          risk_case.status AS case_status,
          risk_case.risk_score AS case_risk_score,
          risk_case.summary AS case_summary,
          evidence.case_entity_id AS case_entity_id,
          evidence.role AS evidence_role,
          evidence.evidence_score AS evidence_score,
          evidence.note AS evidence_note,
          entity.entity_id AS entity_id,
          entity.entity_key AS entity_key,
          entity.entity_type AS entity_type,
          entity.display_name AS display_name,
          entity.source_object AS source_object,
          entity.source_key AS source_key
        )
      )
      ORDER BY case_risk_score DESC, evidence_score DESC, entity_key
    `,
  };
}

function normalizeGraphCases(rows) {
  const cases = new Map();
  for (const row of rows) {
    const caseId = nullableNumber(rowValue(row, 'case_id'));
    if (!cases.has(caseId)) {
      cases.set(caseId, {
        caseId,
        caseKey: rowValue(row, 'case_key'),
        caseType: rowValue(row, 'case_type'),
        severity: rowValue(row, 'severity'),
        status: rowValue(row, 'case_status'),
        riskScore: nullableNumber(rowValue(row, 'case_risk_score')),
        summary: rowValue(row, 'case_summary') || null,
        evidence: [],
      });
    }
    cases.get(caseId).evidence.push({
      caseEntityId: nullableNumber(rowValue(row, 'case_entity_id')),
      role: rowValue(row, 'evidence_role'),
      evidenceScore: nullableNumber(rowValue(row, 'evidence_score')),
      note: rowValue(row, 'evidence_note') || null,
      entity: {
        entityId: nullableNumber(rowValue(row, 'entity_id')),
        entityKey: rowValue(row, 'entity_key'),
        entityType: rowValue(row, 'entity_type'),
        displayName: rowValue(row, 'display_name'),
        sourceObject: rowValue(row, 'source_object') || null,
        sourceKey: rowValue(row, 'source_key') || null,
      },
    });
  }
  return [...cases.values()];
}

function sendGraphError(label, res, error) {
  console.error(`${label}:`, error);
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    error: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
}

function dualitySql(sourceObject) {
  return `
    SELECT JSON_SERIALIZE(DATA RETURNING CLOB) AS doc
    FROM ${sourceObject}
    WHERE JSON_VALUE(DATA, '$._id' RETURNING NUMBER) = :id
  `;
}

function createDocumentHandler(config) {
  const sql = dualitySql(config.sourceObject);

  return async (req, res) => {
    const id = parsePositiveInteger(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'Document id must be a positive integer' });
    }

    try {
      const result = await db.executeAsUser(sql, { id }, req.demoUser);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: `${config.documentType} document not found` });
      }

      return res.json({
        documentType: config.documentType,
        sourceObject: config.sourceObject,
        executionMode: 'duality-view',
        readOnly: true,
        sql: sql.trim(),
        binds: { id },
        document: parseJsonDocument(result.rows[0].DOC),
      });
    } catch (error) {
      console.error(`${config.documentType} duality error:`, error);
      return res.status(500).json({ error: error.message });
    }
  };
}

async function graphEntities(req, res) {
  const limit = parseBoundedInteger(req.query.limit, 100, 1, MAX_GRAPH_LIMIT);
  if (limit === null) {
    return res.status(400).json({
      error: `Graph entity limit must be an integer from 1 through ${MAX_GRAPH_LIMIT}`,
    });
  }

  try {
    const payload = await db.withUserConnection(req.demoUser, async ({ execute }) => {
      const dataset = await requireCurrentGraphDataset(execute);
      const result = await execute(GRAPH_ENTITIES_SQL, { limit });
      const visibleCounts = await execute(GRAPH_VISIBLE_COUNTS_SQL);
      const entities = result.rows.map((row) => normalizeGraphEntity(row));
      const counts = visibleCounts.rows[0] || {};

      return {
        sourceObject: GRAPH_NAME,
        executionMode: 'sql-property-graph',
        queryKey: 'manufacturing-graph-entities-v1',
        sql: GRAPH_ENTITIES_SQL.trim(),
        binds: { limit },
        datasetSource: dataset.datasetSource,
        datasetVersion: dataset.datasetVersion,
        entities,
        stats: {
          returnedEntityCount: entities.length,
          graphEntityCount: nullableNumber(rowValue(counts, 'entity_count')) || 0,
          graphRelationshipCount: nullableNumber(rowValue(counts, 'relationship_count')) || 0,
        },
      };
    }, { readOnly: true });
    return res.json(payload);
  } catch (error) {
    return sendGraphError('Manufacturing graph entities error', res, error);
  }
}

async function graphNetwork(req, res) {
  const entityKey = String(req.params.entityKey || '').trim();
  if (!GRAPH_KEY_PATTERN.test(entityKey)) {
    return res.status(400).json({ error: 'Graph entity key is invalid' });
  }

  const depth = parseBoundedInteger(req.query.depth, 2, 1, MAX_GRAPH_DEPTH);
  if (depth === null) {
    return res.status(400).json({
      error: `Graph depth must be an integer from 1 through ${MAX_GRAPH_DEPTH}`,
    });
  }

  try {
    const payload = await db.withUserConnection(req.demoUser, async ({ execute }) => {
      const dataset = await requireCurrentGraphDataset(execute);
      const centerResult = await execute(GRAPH_CENTER_SQL, { entity_key: entityKey });
      if (centerResult.rows.length === 0) {
        throw makeHttpError(404, 'GRAPH_ENTITY_NOT_FOUND', 'Manufacturing graph entity not found');
      }

      const center = normalizeGraphEntity(centerResult.rows[0]);
      const hopByEntityId = new Map([[center.entityId, 0]]);
      const relationshipsById = new Map();
      let frontier = [center.entityId];
      let firstTraversal = null;
      let graphTableExecutions = 1;
      let traversedDepth = 0;

      for (let hop = 1; hop <= depth && frontier.length > 0; hop += 1) {
        const traversal = buildGraphOneHopSql(frontier);
        if (!firstTraversal) {
          firstTraversal = {
            sql: traversal.sql.trim(),
            binds: { ...traversal.binds },
          };
        }

        const result = await execute(traversal.sql, traversal.binds);
        graphTableExecutions += 1;
        traversedDepth = hop;
        const previouslyVisited = new Set(hopByEntityId.keys());
        const nextFrontier = new Set();

        for (const row of result.rows) {
          const fromEntityId = nullableNumber(rowValue(row, 'from_entity_id'));
          const toEntityId = nullableNumber(rowValue(row, 'to_entity_id'));
          if (!fromEntityId || !toEntityId) {
            throw makeHttpError(500, 'GRAPH_TRAVERSAL_ERROR', 'SQL/PGQ edge result is missing an endpoint identifier');
          }

          for (const entityId of [fromEntityId, toEntityId]) {
            if (!previouslyVisited.has(entityId)) {
              hopByEntityId.set(entityId, hop);
              nextFrontier.add(entityId);
            }
          }

          const relationshipId = nullableNumber(rowValue(row, 'relationship_id'));
          if (!relationshipsById.has(relationshipId)) {
            relationshipsById.set(relationshipId, {
              relationshipId,
              fromEntityId,
              toEntityId,
              relationshipType: rowValue(row, 'relationship_type'),
              strength: nullableNumber(rowValue(row, 'strength')),
              interactionCount: nullableNumber(rowValue(row, 'interaction_count')),
              evidenceText: rowValue(row, 'evidence_text') || null,
              hop,
            });
          }
        }

        frontier = [...nextFrontier];
      }

      const hydrationQuery = buildGraphEntitiesByIdsSql([...hopByEntityId.keys()]);
      const hydrationResult = await execute(hydrationQuery.sql, hydrationQuery.binds);
      graphTableExecutions += 1;
      const hydratedById = new Map(hydrationResult.rows.map((row) => {
        const entity = normalizeGraphEntity(row);
        return [entity.entityId, entity];
      }));
      if (hydratedById.size !== hopByEntityId.size) {
        throw makeHttpError(
          500,
          'GRAPH_HYDRATION_ERROR',
          'SQL/PGQ vertex hydration did not return every traversed entity',
          { expected: hopByEntityId.size, actual: hydratedById.size }
        );
      }

      const caseQuery = buildGraphCasesForEntitiesSql([...hopByEntityId.keys()]);
      const caseResult = await execute(caseQuery.sql, caseQuery.binds);
      graphTableExecutions += 1;
      const entities = [...hopByEntityId.entries()].map(([entityId, hop]) => ({
        ...hydratedById.get(entityId),
        hop,
      })).sort((left, right) => (
        left.hop - right.hop || String(left.entityKey).localeCompare(String(right.entityKey))
      ));
      const relationships = [...relationshipsById.values()].map((relationship) => {
        const from = hydratedById.get(relationship.fromEntityId);
        const to = hydratedById.get(relationship.toEntityId);
        if (!from || !to) {
          throw makeHttpError(500, 'GRAPH_HYDRATION_ERROR', 'A traversed edge references an unavailable vertex');
        }
        return {
          ...relationship,
          fromNodeId: from.entityKey,
          toNodeId: to.entityKey,
          fromEntityKey: from.entityKey,
          toEntityKey: to.entityKey,
          fromDisplayName: from.displayName,
          toDisplayName: to.displayName,
          fromEntityType: from.entityType,
          toEntityType: to.entityType,
        };
      }).sort((left, right) => (
        left.hop - right.hop || left.relationshipId - right.relationshipId
      ));
      const cases = normalizeGraphCases(caseResult.rows);

      return {
        sourceObject: GRAPH_NAME,
        executionMode: 'sql-property-graph',
        queryKey: 'manufacturing-network-bounded-sql-pgq-bfs-v2',
        sql: firstTraversal?.sql || GRAPH_CENTER_SQL.trim(),
        binds: firstTraversal?.binds || { entity_key: entityKey },
        datasetSource: dataset.datasetSource,
        datasetVersion: dataset.datasetVersion,
        center,
        entities,
        relationships,
        cases,
        stats: {
          entityCount: entities.length,
          relationshipCount: relationships.length,
          caseCount: cases.length,
          depth,
          traversedDepth,
          graphTableExecutions,
        },
      };
    }, { readOnly: true });
    return res.json(payload);
  } catch (error) {
    return sendGraphError('Manufacturing graph network error', res, error);
  }
}

async function graphCase(req, res) {
  const caseKey = String(req.params.caseKey || '').trim();
  if (!GRAPH_KEY_PATTERN.test(caseKey)) {
    return res.status(400).json({ error: 'Manufacturing risk case key is invalid' });
  }

  try {
    const payload = await db.withUserConnection(req.demoUser, async ({ execute }) => {
      const dataset = await requireCurrentGraphDataset(execute);
      const result = await execute(GRAPH_CASE_SQL, { case_key: caseKey });
      const cases = normalizeGraphCases(result.rows);
      if (cases.length === 0) {
        throw makeHttpError(404, 'GRAPH_CASE_NOT_FOUND', 'Manufacturing risk case not found');
      }

      return {
        sourceObject: GRAPH_NAME,
        executionMode: 'sql-property-graph',
        queryKey: 'manufacturing-risk-case-evidence-v1',
        sql: GRAPH_CASE_SQL.trim(),
        binds: { case_key: caseKey },
        datasetSource: dataset.datasetSource,
        datasetVersion: dataset.datasetVersion,
        case: cases[0],
      };
    }, { readOnly: true });
    return res.json(payload);
  } catch (error) {
    return sendGraphError('Manufacturing graph case error', res, error);
  }
}

const handlers = Object.freeze({
  partDocument: createDocumentHandler(DOCUMENTS.part),
  workOrderDocument: createDocumentHandler(DOCUMENTS.workOrder),
  plantDocument: createDocumentHandler(DOCUMENTS.plant),
  graphEntities,
  graphNetwork,
  graphCase,
});

router.use(requireDemoIdentity);
router.get('/parts/:id/document', handlers.partDocument);
router.get('/work-orders/:id/document', handlers.workOrderDocument);
router.get('/plants/:id/document', handlers.plantDocument);
router.get('/graph/entities', handlers.graphEntities);
router.get('/graph/network/:entityKey', handlers.graphNetwork);
router.get('/graph/cases/:caseKey', handlers.graphCase);

module.exports = router;
module.exports.handlers = handlers;
