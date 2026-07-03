/*
 * 10_manufacturing_production_graph.sql
 * Manufacturing-native property graph for supplier and production risk.
 *
 * The graph connects active suppliers, parts, plants, work orders, and
 * production signals. Oracle SQL/PGQ traverses current relational evidence
 * without a separate graph database or copied hand-authored graph rows.
 */

SET SERVEROUTPUT ON
SET SQLBLANKLINES ON
SET DEFINE OFF

CREATE TABLE manufacturing_graph_entities (
  entity_id          NUMBER PRIMARY KEY,
  entity_key         VARCHAR2(50)  NOT NULL UNIQUE,
  entity_type        VARCHAR2(30)  NOT NULL,
  node_id            VARCHAR2(50),
  node_type          VARCHAR2(30),
  display_name       VARCHAR2(180) NOT NULL,
  operations_domain  VARCHAR2(100),
  risk_score         NUMBER(5,2)   DEFAULT 0,
  volume_count       NUMBER(10)    DEFAULT 0,
  engagement_rate    NUMBER(8,4)   DEFAULT 0,
  city               VARCHAR2(80),
  region             VARCHAR2(40),
  is_verified        CHAR(1)       DEFAULT 'Y',
  operations_label   VARCHAR2(220),
  description        VARCHAR2(700),
  summary            VARCHAR2(500),
  source_object      VARCHAR2(128) NOT NULL,
  source_key         VARCHAR2(128) NOT NULL,
  dataset_version    VARCHAR2(20)  DEFAULT 'v1' NOT NULL,
  created_at         TIMESTAMP     DEFAULT SYSTIMESTAMP,
  CONSTRAINT ck_mfg_graph_entity_type
    CHECK (entity_type IN (
      'supplier','part','plant','work_order','production_signal'
    )),
  CONSTRAINT ck_mfg_graph_entity_verified
    CHECK (is_verified IN ('Y','N')),
  CONSTRAINT ck_mfg_graph_source_object
    CHECK (source_object IN (
      'MANUFACTURING_SUPPLIERS',
      'PRODUCTS',
      'MANUFACTURING_WORK_ORDERS',
      'FULFILLMENT_CENTERS',
      'MANUFACTURING_PRODUCTION_SIGNALS'
    ))
);

CREATE OR REPLACE TRIGGER trg_mfg_graph_entities_node_meta
BEFORE INSERT OR UPDATE OF entity_key, entity_type, node_id, node_type
ON manufacturing_graph_entities
FOR EACH ROW
BEGIN
  :NEW.node_id := :NEW.entity_key;
  :NEW.node_type := :NEW.entity_type;
END;
/

CREATE TABLE manufacturing_graph_relationships (
  relationship_id    NUMBER PRIMARY KEY,
  from_entity_id     NUMBER NOT NULL REFERENCES manufacturing_graph_entities(entity_id),
  to_entity_id       NUMBER NOT NULL REFERENCES manufacturing_graph_entities(entity_id),
  relationship_type  VARCHAR2(40) NOT NULL,
  strength           NUMBER(4,3) DEFAULT 0.5,
  interaction_count  NUMBER(8)   DEFAULT 1,
  evidence_text      VARCHAR2(500),
  first_seen         TIMESTAMP   DEFAULT SYSTIMESTAMP,
  last_interaction   TIMESTAMP   DEFAULT SYSTIMESTAMP,
  CONSTRAINT uq_mfg_graph_rel
    UNIQUE (from_entity_id, to_entity_id, relationship_type),
  CONSTRAINT ck_mfg_graph_relationship_type
    CHECK (relationship_type IN (
      'produces_part','constrains_work_order','scheduled_on',
      'feeds_line','triggered_by_signal'
    ))
);

CREATE TABLE manufacturing_graph_edge_metadata (
  edge_type     VARCHAR2(40)  PRIMARY KEY,
  display_name  VARCHAR2(120) NOT NULL,
  category      VARCHAR2(80)  NOT NULL,
  description   VARCHAR2(500)
);

CREATE TABLE manufacturing_risk_cases (
  case_id           NUMBER PRIMARY KEY,
  case_key          VARCHAR2(50)  NOT NULL UNIQUE,
  case_type         VARCHAR2(80)  NOT NULL,
  severity          VARCHAR2(20)
                    CHECK (severity IN ('low','medium','high','critical')),
  status            VARCHAR2(30)  DEFAULT 'open',
  anchor_entity_id  NUMBER REFERENCES manufacturing_graph_entities(entity_id),
  risk_score        NUMBER(5,2)   DEFAULT 0,
  summary           VARCHAR2(700),
  created_at        TIMESTAMP     DEFAULT SYSTIMESTAMP
);

CREATE TABLE manufacturing_case_entities (
  case_entity_id  NUMBER PRIMARY KEY,
  case_id         NUMBER NOT NULL REFERENCES manufacturing_risk_cases(case_id),
  entity_id       NUMBER NOT NULL REFERENCES manufacturing_graph_entities(entity_id),
  role            VARCHAR2(40) NOT NULL,
  evidence_score  NUMBER(5,2) DEFAULT 0,
  note            VARCHAR2(400),
  CONSTRAINT uq_mfg_case_entity UNIQUE (case_id, entity_id, role)
);

CREATE TABLE manufacturing_graph_state (
  graph_name          VARCHAR2(128) PRIMARY KEY,
  dataset_source      VARCHAR2(20)  NOT NULL,
  dataset_version     VARCHAR2(20)  NOT NULL,
  entity_count        NUMBER        NOT NULL,
  relationship_count  NUMBER        NOT NULL,
  loaded_at           TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT ck_mfg_graph_state_source
    CHECK (dataset_source IN ('demo', 'custom')),
  CONSTRAINT ck_mfg_graph_state_entities
    CHECK (entity_count >= 0),
  CONSTRAINT ck_mfg_graph_state_relationships
    CHECK (relationship_count >= 0)
);

CREATE TABLE manufacturing_graph_entity_access (
  graph_entity_id  NUMBER        NOT NULL,
  region_code      VARCHAR2(2)   NOT NULL,
  access_basis     VARCHAR2(200) NOT NULL,
  created_at       TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_mfg_graph_entity_access
    PRIMARY KEY (graph_entity_id, region_code),
  CONSTRAINT fk_mfg_graph_access_entity
    FOREIGN KEY (graph_entity_id)
    REFERENCES manufacturing_graph_entities(entity_id)
    ON DELETE CASCADE,
  CONSTRAINT ck_mfg_graph_access_region
    CHECK (region_code IN ('CA', 'NJ', 'GA'))
);

CREATE INDEX idx_mfg_entities_type
  ON manufacturing_graph_entities(entity_type, risk_score DESC);
CREATE INDEX idx_mfg_graph_source
  ON manufacturing_graph_entities(source_object, source_key);
CREATE INDEX idx_mfg_rel_from
  ON manufacturing_graph_relationships(from_entity_id);
CREATE INDEX idx_mfg_rel_to
  ON manufacturing_graph_relationships(to_entity_id);
CREATE INDEX idx_mfg_rel_type
  ON manufacturing_graph_relationships(relationship_type);
CREATE INDEX idx_mfg_case_entities_case
  ON manufacturing_case_entities(case_id);
CREATE INDEX idx_mfg_case_entities_entity
  ON manufacturing_case_entities(entity_id);
CREATE INDEX idx_mfg_graph_access_region
  ON manufacturing_graph_entity_access(region_code, graph_entity_id);

CREATE PROPERTY GRAPH manufacturing_production_network
  VERTEX TABLES (
    manufacturing_graph_entities KEY (entity_id)
      LABEL manufacturing_entity
      PROPERTIES (
        entity_id,
        entity_key,
        node_id,
        entity_type,
        node_type,
        display_name,
        operations_label,
        description,
        operations_domain,
        risk_score,
        volume_count,
        engagement_rate,
        city,
        region,
        is_verified,
        summary,
        source_object,
        source_key,
        dataset_version,
        created_at
      ),
    manufacturing_risk_cases KEY (case_id)
      LABEL manufacturing_case
      PROPERTIES (
        case_id,
        case_key,
        case_type,
        severity,
        status,
        anchor_entity_id,
        risk_score,
        summary,
        created_at
      )
  )
  EDGE TABLES (
    manufacturing_graph_relationships
      KEY (relationship_id)
      SOURCE KEY (from_entity_id)
        REFERENCES manufacturing_graph_entities (entity_id)
      DESTINATION KEY (to_entity_id)
        REFERENCES manufacturing_graph_entities (entity_id)
      LABEL production_link
      PROPERTIES (
        relationship_id,
        from_entity_id,
        to_entity_id,
        relationship_type,
        strength,
        interaction_count,
        evidence_text,
        first_seen,
        last_interaction
      ),
    manufacturing_case_entities
      KEY (case_entity_id)
      SOURCE KEY (case_id)
        REFERENCES manufacturing_risk_cases (case_id)
      DESTINATION KEY (entity_id)
        REFERENCES manufacturing_graph_entities (entity_id)
      LABEL case_involves
      PROPERTIES (
        case_entity_id,
        case_id,
        entity_id,
        role,
        evidence_score,
        note
      )
  )
  OPTIONS (ENFORCED MODE);

ALTER PROPERTY GRAPH manufacturing_production_network COMPILE;

CREATE OR REPLACE VIEW manufacturing_graph_node_metadata AS
SELECT
  e.node_id,
  e.node_type,
  e.display_name,
  e.operations_label,
  COALESCE(e.description, e.summary) AS description,
  e.entity_id,
  e.operations_domain,
  e.city,
  e.region,
  e.is_verified
FROM manufacturing_graph_entities e;

CREATE OR REPLACE VIEW manufacturing_graph_relationship_metadata AS
SELECT
  r.relationship_id,
  r.relationship_type AS edge_type,
  r.relationship_type,
  COALESCE(m.display_name, INITCAP(REPLACE(r.relationship_type, '_', ' '))) AS display_name,
  COALESCE(m.category, 'Uncategorized') AS category,
  m.description,
  r.from_entity_id,
  r.to_entity_id,
  r.strength,
  r.interaction_count,
  r.evidence_text
FROM manufacturing_graph_relationships r
LEFT JOIN manufacturing_graph_edge_metadata m
  ON m.edge_type = r.relationship_type;

CREATE OR REPLACE VIEW manufacturing_graph_entity_metrics AS
SELECT
  e.entity_id,
  e.entity_key,
  e.node_id,
  e.entity_type,
  e.node_type,
  e.display_name,
  e.operations_label,
  COALESCE(e.description, e.summary) AS description,
  e.operations_domain,
  e.city,
  e.region,
  e.is_verified,
  e.summary,
  e.created_at,
  e.volume_count AS signal_reach,
  e.risk_score AS risk_score,
  CASE
    WHEN e.entity_type = 'supplier' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM manufacturing_graph_relationships r
      JOIN manufacturing_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'supplier'
    )
  END AS supplier_count,
  CASE
    WHEN e.entity_type = 'work_order' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM manufacturing_graph_relationships r
      JOIN manufacturing_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'work_order'
    )
  END AS work_order_count,
  CASE
    WHEN e.entity_type = 'production_signal' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM manufacturing_graph_relationships r
      JOIN manufacturing_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'production_signal'
    )
  END AS production_signal_count,
  (
    SELECT COUNT(*)
    FROM manufacturing_graph_relationships r
    WHERE r.from_entity_id = e.entity_id
       OR r.to_entity_id = e.entity_id
  ) AS direct_connection_count,
  e.volume_count AS follower_count,
  e.risk_score AS influence_score,
  e.engagement_rate
FROM manufacturing_graph_entities e;

CREATE OR REPLACE VIEW manufacturing_graph_production_findings AS
WITH
  edge_pairs AS (
    SELECT r.from_entity_id AS center_entity_id,
           r.to_entity_id   AS neighbor_entity_id,
           r.relationship_type,
           r.strength
    FROM manufacturing_graph_relationships r
    UNION ALL
    SELECT r.to_entity_id   AS center_entity_id,
           r.from_entity_id AS neighbor_entity_id,
           r.relationship_type,
           r.strength
    FROM manufacturing_graph_relationships r
  ),
  one_hop AS (
    SELECT ep.center_entity_id,
           ep.neighbor_entity_id,
           ep.relationship_type AS edge_path,
           ep.strength,
           1 AS graph_depth
    FROM edge_pairs ep
  ),
  two_hop AS (
    SELECT e1.center_entity_id,
           e2.neighbor_entity_id,
           e1.relationship_type || ', ' || e2.relationship_type AS edge_path,
           LEAST(e1.strength, e2.strength) AS strength,
           2 AS graph_depth
    FROM edge_pairs e1
    JOIN edge_pairs e2
      ON e2.center_entity_id = e1.neighbor_entity_id
    WHERE e2.neighbor_entity_id <> e1.center_entity_id
  ),
  three_hop AS (
    SELECT e1.center_entity_id,
           e3.neighbor_entity_id,
           e1.relationship_type || ', ' || e2.relationship_type || ', ' || e3.relationship_type AS edge_path,
           LEAST(e1.strength, e2.strength, e3.strength) AS strength,
           3 AS graph_depth
    FROM edge_pairs e1
    JOIN edge_pairs e2
      ON e2.center_entity_id = e1.neighbor_entity_id
    JOIN edge_pairs e3
      ON e3.center_entity_id = e2.neighbor_entity_id
    WHERE e2.neighbor_entity_id <> e1.center_entity_id
      AND e3.neighbor_entity_id <> e1.center_entity_id
      AND e3.neighbor_entity_id <> e1.neighbor_entity_id
  ),
  reachable AS (
    SELECT * FROM one_hop
    UNION ALL
    SELECT * FROM two_hop
    UNION ALL
    SELECT * FROM three_hop
  ),
  supplier_work_order_counts AS (
    SELECT s.entity_id AS supplier_entity_id,
           COUNT(DISTINCT wo.entity_id) AS work_order_count,
           LISTAGG(DISTINCT wo.node_id, ', ') WITHIN GROUP (ORDER BY wo.node_id) AS work_order_nodes
    FROM manufacturing_graph_entities s
    JOIN reachable r
      ON r.center_entity_id = s.entity_id
     AND r.graph_depth <= 2
    JOIN manufacturing_graph_entities wo
      ON wo.entity_id = r.neighbor_entity_id
     AND wo.entity_type = 'work_order'
    WHERE s.entity_type = 'supplier'
    GROUP BY s.entity_id
  ),
  direct_counts AS (
    SELECT center_entity_id AS entity_id,
           COUNT(DISTINCT neighbor_entity_id) AS direct_connection_count
    FROM edge_pairs
    GROUP BY center_entity_id
  )
SELECT
  'FIND-' || c.entity_id || '-SIGNAL-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'production_signal_risk' AS finding_type,
  'High-urgency production signal nearby' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to current production signals: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Review the source signal and affected part or work order before changing the production plan.' AS recommended_action,
  'signal_supported_work_order_paths' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN manufacturing_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN manufacturing_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type = 'production_signal'
  AND n.risk_score >= 75
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-PART-CAPACITY-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'part_capacity_risk' AS finding_type,
  'High-risk part nearby' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to high-risk manufactured parts: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Compare current part inventory, supplier coverage, and dependent work orders.' AS recommended_action,
  'part_availability_paths' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN manufacturing_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN manufacturing_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type = 'part'
  AND n.risk_score >= 75
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-SUPPLIER-CAPACITY-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'supplier_demand_exposure' AS finding_type,
  'Supplier demand exposure' AS title,
  c.display_name || ' reaches supplier nodes within ' || r.graph_depth ||
    ' hops: ' || LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Confirm supplier coverage, part inventory, and dependent work-order priorities.' AS recommended_action,
  'supplier_work_order_paths' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN manufacturing_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN manufacturing_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type = 'supplier'
  AND n.risk_score >= 75
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-WO-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'work_order_schedule_risk' AS finding_type,
  'Work order schedule risk nearby' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to schedule-sensitive work orders: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Rebalance capacity, review material constraints, and update the production plan.' AS recommended_action,
  'work_order_schedule_risk' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN manufacturing_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN manufacturing_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type = 'work_order'
  AND n.risk_score >= 85
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-SUPPLIER-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'supplier_dependency_risk' AS finding_type,
  'Shared supplier schedule exposure' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to suppliers tied to multiple work orders: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id || ' [' || swc.work_order_nodes || ']', ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Prioritize supplier follow-up for constrained parts and dependent work orders.' AS recommended_action,
  'supplier_work_order_paths' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN manufacturing_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN manufacturing_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
JOIN supplier_work_order_counts swc
  ON swc.supplier_entity_id = n.entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND swc.work_order_count >= 2
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-PRODUCTION-HUB-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'production_bottleneck' AS finding_type,
  'High-connectivity production hub' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to production hubs with concentrated schedule or risk relationships: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Open hub details to compare suppliers, parts, plants, work orders, and production signals.' AS recommended_action,
  'production_hubs' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN manufacturing_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN manufacturing_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
JOIN direct_counts dc
  ON dc.entity_id = n.entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type IN ('plant','supplier','part','work_order','production_signal')
  AND dc.direct_connection_count >= 4
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || e.entity_id || '-CASE-EVIDENCE' AS finding_id,
  e.entity_id AS center_entity_id,
  e.node_id AS center_node_id,
  'case_evidence' AS finding_type,
  'Risk case evidence map available' AS title,
  e.display_name || ' appears in ' || COUNT(DISTINCT c.case_id) ||
    ' manufacturing risk case' ||
    CASE WHEN COUNT(DISTINCT c.case_id) = 1 THEN '' ELSE 's' END ||
    ': ' || LISTAGG(DISTINCT c.case_type, ', ') WITHIN GROUP (ORDER BY c.case_type) || '.' AS description,
  LISTAGG(DISTINCT c.case_key, ', ') WITHIN GROUP (ORDER BY c.case_key) AS supporting_node_ids,
  'case_involves' AS supporting_edge_types,
  MAX(c.risk_score) AS risk_score,
  'Build the case evidence map for this selected production-risk node.' AS recommended_action,
  'case_map' AS recommended_query_key,
  1 AS min_graph_depth
FROM manufacturing_graph_entities e
JOIN manufacturing_case_entities ce
  ON ce.entity_id = e.entity_id
JOIN manufacturing_risk_cases c
  ON c.case_id = ce.case_id
GROUP BY e.entity_id, e.node_id, e.display_name;

COMMENT ON TABLE manufacturing_graph_entities IS
  'Typed manufacturing graph vertices rebuilt from the active relational supplier, part, plant, work order, and production signal data.';
COMMENT ON TABLE manufacturing_graph_relationships IS
  'Manufacturing graph edges rebuilt from supplier ownership, work-order lines, plant assignment, inventory, signal attribution, and part mentions.';
COMMENT ON TABLE manufacturing_graph_edge_metadata IS
  'Manufacturing-friendly edge type metadata for graph legends, tooltips, SQL/PGQ presentation, and Ask Manufacturing Data.';
COMMENT ON TABLE manufacturing_risk_cases IS
  'Manufacturing graph investigation cases derived from the active dataset highest-risk work orders and their related evidence.';
COMMENT ON TABLE manufacturing_case_entities IS
  'Links manufacturing risk cases to graph entities that supply evidence for each case.';
COMMENT ON TABLE manufacturing_graph_state IS
  'Validated graph refresh state aligned to the active demo or custom dataset version.';
COMMENT ON TABLE manufacturing_graph_entity_access IS
  'Regional graph-entity access map used by context-sensitive Manufacturing graph VPD policies.';
COMMENT ON TABLE manufacturing_graph_entity_metrics IS
  'Manufacturing graph metric projection for live suppliers, parts, plants, work orders, production signals, and direct relationships.';
COMMENT ON TABLE manufacturing_graph_node_metadata IS
  'Manufacturing graph node metadata projection for demos, SQL/PGQ examples, and natural-language querying.';
COMMENT ON TABLE manufacturing_graph_relationship_metadata IS
  'Manufacturing relationship metadata projection joining graph relationships to edge display metadata.';
COMMENT ON TABLE manufacturing_graph_production_findings IS
  'Database-backed production-risk findings derived from live supplier, part, plant, work-order, production-signal, and case relationships.';

COMMENT ON COLUMN manufacturing_graph_entities.node_id IS
  'Canonical manufacturing graph node identifier exposed as an alias for ENTITY_KEY and rebuilt with the active dataset.';
COMMENT ON COLUMN manufacturing_graph_entities.node_type IS
  'Manufacturing graph node type exposed as a readable alias for ENTITY_TYPE.';
COMMENT ON COLUMN manufacturing_graph_entities.display_name IS
  'Short user-facing node name for graph tooltips, detail panels, Ask Manufacturing Data, and SQL query results.';
COMMENT ON COLUMN manufacturing_graph_entities.operations_label IS
  'Manufacturing-friendly node label combining node type and display name.';
COMMENT ON COLUMN manufacturing_graph_entities.description IS
  'Manufacturing description derived from the current relational source row.';
COMMENT ON COLUMN manufacturing_graph_entities.source_object IS
  'Canonical relational source object represented by this graph vertex.';
COMMENT ON COLUMN manufacturing_graph_entities.source_key IS
  'Stable identifier of the represented relational source row.';
COMMENT ON COLUMN manufacturing_graph_entities.dataset_version IS
  'Active dataset version against which graph provenance was last refreshed.';
COMMENT ON COLUMN manufacturing_graph_edge_metadata.edge_type IS
  'Canonical graph edge type preserved for SQL/PGQ traversal.';
COMMENT ON COLUMN manufacturing_graph_edge_metadata.display_name IS
  'Manufacturing-friendly edge type name for graph legends, edge tooltips, detail panels, Ask Manufacturing Data, and SQL results.';
COMMENT ON COLUMN manufacturing_graph_edge_metadata.category IS
  'Manufacturing edge category: Supplier Network, Production Flow, Production Signals, or Risk Propagation.';
COMMENT ON COLUMN manufacturing_graph_edge_metadata.description IS
  'Description of the relational relationship represented by the canonical graph edge type.';
COMMENT ON COLUMN manufacturing_graph_production_findings.finding_id IS
  'Stable generated finding identifier for the selected center node and finding type.';
COMMENT ON COLUMN manufacturing_graph_production_findings.center_entity_id IS
  'Selected center graph entity for which the production-risk finding was derived.';
COMMENT ON COLUMN manufacturing_graph_production_findings.center_node_id IS
  'Canonical selected center node ID from the current graph refresh.';
COMMENT ON COLUMN manufacturing_graph_production_findings.finding_type IS
  'Manufacturing finding class such as production_signal_risk, part_capacity_risk, supplier_demand_exposure, supplier_dependency_risk, work_order_schedule_risk, production_bottleneck, or case_evidence.';
COMMENT ON COLUMN manufacturing_graph_production_findings.supporting_node_ids IS
  'Canonical node IDs or case keys that support the generated production-risk finding.';
COMMENT ON COLUMN manufacturing_graph_production_findings.supporting_edge_types IS
  'Canonical edge types or edge paths that support the generated production-risk finding.';
COMMENT ON COLUMN manufacturing_graph_production_findings.min_graph_depth IS
  'Minimum selected graph depth required for the finding to be visible in the current network exploration.';

COMMIT;

SELECT 'Manufacturing production property graph ready' AS status FROM dual;
