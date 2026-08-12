/*
 * 10_care_pathway_graph.sql
 * Healthcare-native property graph for de-identified care pathways.
 *
 * The graph connects synthetic patients, encounters, diagnoses, procedures,
 * medications, providers, facilities, devices, and care gaps. It is designed
 * to show why graph traversal matters in healthcare: care teams can follow
 * multi-hop clinical context from a patient to a care gap, readmission risk,
 * or shared-care-team cluster without using an external graph database.
 */

SET SERVEROUTPUT ON
SET SQLBLANKLINES ON

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE care_graph_entities (
      entity_id        NUMBER PRIMARY KEY,
      entity_key       VARCHAR2(40)  NOT NULL UNIQUE,
      entity_type      VARCHAR2(30)  NOT NULL
                       CHECK (entity_type IN (
                         'patient','encounter','condition','medication',
                         'procedure','provider','facility','care_gap',
                         'device','lab_result'
                       )),
      node_id          VARCHAR2(40),
      node_type        VARCHAR2(30),
      display_name     VARCHAR2(160) NOT NULL,
      clinical_domain  VARCHAR2(80),
      risk_score       NUMBER(5,2)   DEFAULT 0,
      volume_count     NUMBER(10)    DEFAULT 0,
      engagement_rate  NUMBER(8,4)   DEFAULT 0,
      city             VARCHAR2(80),
      region           VARCHAR2(40),
      is_verified      CHAR(1)       DEFAULT 'Y' CHECK (is_verified IN ('Y','N')),
      clinical_label   VARCHAR2(180),
      description      VARCHAR2(700),
      summary          VARCHAR2(500),
      created_at       TIMESTAMP     DEFAULT SYSTIMESTAMP
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('care_graph_entities table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('care_graph_entities table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_entities ADD node_id VARCHAR2(40)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_entities ADD node_type VARCHAR2(30)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_entities ADD clinical_label VARCHAR2(180)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_entities ADD description VARCHAR2(700)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

UPDATE care_graph_entities
SET node_id = entity_key,
    node_type = entity_type
WHERE node_id IS NULL
   OR node_id <> entity_key
   OR node_type IS NULL
   OR node_type <> entity_type;

CREATE OR REPLACE TRIGGER trg_care_graph_entities_node_meta
BEFORE INSERT OR UPDATE OF entity_key, entity_type, node_id, node_type
ON care_graph_entities
FOR EACH ROW
BEGIN
  :NEW.node_id := :NEW.entity_key;
  :NEW.node_type := :NEW.entity_type;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE care_graph_relationships (
      relationship_id    NUMBER PRIMARY KEY,
      from_entity_id     NUMBER NOT NULL REFERENCES care_graph_entities(entity_id),
      to_entity_id       NUMBER NOT NULL REFERENCES care_graph_entities(entity_id),
      relationship_type  VARCHAR2(40) NOT NULL
                         CHECK (relationship_type IN (
                           'had_encounter','diagnosed_with','received_medication',
                           'ordered_procedure','treated_by','occurred_at',
                           'has_care_gap','followed_by','assigned_to',
                           'escalated_to','readmitted_after','lab_indicates',
                           'uses_device','shares_provider','case_signal'
                         )),
      strength           NUMBER(4,3) DEFAULT 0.5,
      interaction_count  NUMBER(8)   DEFAULT 1,
      evidence_text      VARCHAR2(500),
      first_seen         TIMESTAMP   DEFAULT SYSTIMESTAMP,
      last_interaction   TIMESTAMP   DEFAULT SYSTIMESTAMP,
      CONSTRAINT uq_care_graph_rel UNIQUE (from_entity_id, to_entity_id, relationship_type)
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('care_graph_relationships table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('care_graph_relationships table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE care_graph_edge_metadata (
      edge_type     VARCHAR2(40)  PRIMARY KEY,
      display_name  VARCHAR2(120) NOT NULL,
      category      VARCHAR2(80)  NOT NULL,
      description   VARCHAR2(500)
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('care_graph_edge_metadata table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('care_graph_edge_metadata table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_edge_metadata ADD display_name VARCHAR2(120)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_edge_metadata ADD category VARCHAR2(80)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE care_graph_edge_metadata ADD description VARCHAR2(500)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

MERGE INTO care_graph_edge_metadata m
USING (
  SELECT 'had_encounter' AS edge_type, 'Had Encounter' AS display_name, 'Clinical Events' AS category,
         'Connects a de-identified patient journey to an encounter in the care pathway graph.' AS description FROM dual
  UNION ALL SELECT 'diagnosed_with', 'Diagnosed With', 'Clinical Events',
         'Connects an encounter or patient journey to a diagnosis or condition node.' FROM dual
  UNION ALL SELECT 'ordered_procedure', 'Ordered Procedure', 'Clinical Events',
         'Connects an encounter to a diagnostic, procedural, or care-service action ordered during the pathway.' FROM dual
  UNION ALL SELECT 'lab_indicates', 'Lab Indicates', 'Clinical Events',
         'Connects a procedure or lab order to a lab-result signal used for demo pathway context.' FROM dual
  UNION ALL SELECT 'received_medication', 'Received Medication', 'Clinical Events',
         'Connects an encounter or patient journey to a medication used in the synthetic care pathway.' FROM dual
  UNION ALL SELECT 'treated_by', 'Treated By', 'Care Coordination',
         'Connects an encounter or patient journey to a provider or care team involved in care delivery.' FROM dual
  UNION ALL SELECT 'shares_provider', 'Shares Provider', 'Care Coordination',
         'Connects care entities that share a provider, care team, or coordination pattern.' FROM dual
  UNION ALL SELECT 'assigned_to', 'Assigned To', 'Care Coordination',
         'Connects a patient journey, gap, or service need to its assigned care owner.' FROM dual
  UNION ALL SELECT 'followed_by', 'Followed By', 'Care Coordination',
         'Connects sequential events such as an inpatient encounter followed by discharge or outreach.' FROM dual
  UNION ALL SELECT 'occurred_at', 'Occurred At', 'Care Coordination',
         'Connects an encounter or activity to the facility where it occurred in the demo graph.' FROM dual
  UNION ALL SELECT 'has_care_gap', 'Has Care Gap', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a patient journey, encounter, procedure, or service to an open care-gap node.' FROM dual
  UNION ALL SELECT 'readmitted_after', 'Readmitted After', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a readmission-risk pattern to a later or comparable return encounter in the demo graph.' FROM dual
  UNION ALL SELECT 'escalated_to', 'Escalated To', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a care gap or risk signal to the team, facility, or partner responsible for follow-up.' FROM dual
  UNION ALL SELECT 'case_signal', 'Case Signal', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a device, service, or event to a risk or quality signal in the synthetic pathway.' FROM dual
  UNION ALL SELECT 'uses_device', 'Uses Device', 'Risk ' || CHR(38) || ' Gaps',
         'Connects an encounter or patient journey to a device involved in the synthetic care pathway.' FROM dual
) src
ON (m.edge_type = src.edge_type)
WHEN MATCHED THEN UPDATE SET
  m.display_name = src.display_name,
  m.category = src.category,
  m.description = src.description
WHEN NOT MATCHED THEN INSERT (edge_type, display_name, category, description)
  VALUES (src.edge_type, src.display_name, src.category, src.description);

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE care_pathway_cases (
      case_id           NUMBER PRIMARY KEY,
      case_key          VARCHAR2(40)  NOT NULL UNIQUE,
      case_type         VARCHAR2(60)  NOT NULL,
      severity          VARCHAR2(20)  CHECK (severity IN ('low','medium','high','critical')),
      status            VARCHAR2(30)  DEFAULT 'open',
      anchor_entity_id  NUMBER REFERENCES care_graph_entities(entity_id),
      risk_score        NUMBER(5,2)   DEFAULT 0,
      summary           VARCHAR2(700),
      created_at        TIMESTAMP     DEFAULT SYSTIMESTAMP
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('care_pathway_cases table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('care_pathway_cases table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE care_case_entities (
      case_entity_id  NUMBER PRIMARY KEY,
      case_id         NUMBER NOT NULL REFERENCES care_pathway_cases(case_id),
      entity_id       NUMBER NOT NULL REFERENCES care_graph_entities(entity_id),
      role            VARCHAR2(40) NOT NULL,
      evidence_score  NUMBER(5,2) DEFAULT 0,
      note            VARCHAR2(400),
      CONSTRAINT uq_care_case_entity UNIQUE (case_id, entity_id, role)
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('care_case_entities table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('care_case_entities table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_care_entities_type ON care_graph_entities(entity_type, risk_score DESC)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_care_rel_from ON care_graph_relationships(from_entity_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_care_rel_to ON care_graph_relationships(to_entity_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_care_rel_type ON care_graph_relationships(relationship_type)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_care_case_entities_case ON care_case_entities(case_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE OR REPLACE PROPERTY GRAPH care_pathway_network
      VERTEX TABLES (
        care_graph_entities KEY (entity_id)
          LABEL care_entity
          PROPERTIES (
            entity_id,
            entity_key,
            node_id,
            entity_type,
            node_type,
            display_name,
            clinical_label,
            description,
            clinical_domain,
            risk_score,
            volume_count,
            engagement_rate,
            city,
            region,
            is_verified,
            summary
          ),
        care_pathway_cases KEY (case_id)
          LABEL care_case
          PROPERTIES (
            case_id,
            case_key,
            case_type,
            severity,
            status,
            risk_score,
            summary
          )
      )
      EDGE TABLES (
        care_graph_relationships
          KEY (relationship_id)
          SOURCE KEY (from_entity_id) REFERENCES care_graph_entities (entity_id)
          DESTINATION KEY (to_entity_id) REFERENCES care_graph_entities (entity_id)
          LABEL clinical_link
          PROPERTIES (
            relationship_type,
            strength,
            interaction_count,
            evidence_text
          ),
        care_case_entities
          KEY (case_entity_id)
          SOURCE KEY (case_id) REFERENCES care_pathway_cases (case_id)
          DESTINATION KEY (entity_id) REFERENCES care_graph_entities (entity_id)
          LABEL case_involves
          PROPERTIES (
            role,
            evidence_score,
            note
          )
      )
  ]';
  DBMS_OUTPUT.PUT_LINE('care_pathway_network property graph created or replaced.');
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
/

CREATE OR REPLACE VIEW care_graph_node_metadata AS
SELECT
  e.node_id,
  e.node_type,
  e.display_name,
  e.clinical_label,
  COALESCE(e.description, e.summary) AS description,
  e.entity_id,
  e.clinical_domain,
  e.city,
  e.region,
  e.is_verified
FROM care_graph_entities e;

CREATE OR REPLACE VIEW care_graph_relationship_metadata AS
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
FROM care_graph_relationships r
LEFT JOIN care_graph_edge_metadata m
  ON m.edge_type = r.relationship_type;

CREATE OR REPLACE VIEW care_graph_entity_metrics AS
SELECT
  e.entity_id,
  e.entity_key,
  e.node_id,
  e.entity_type,
  e.node_type,
  e.display_name,
  e.clinical_label,
  COALESCE(e.description, e.summary) AS description,
  e.clinical_domain,
  e.city,
  e.region,
  e.is_verified,
  e.summary,
  e.created_at,

  -- Healthcare-specific metric names used by the demo API and SQL examples.
  e.volume_count AS pathway_volume,
  e.risk_score AS risk_score,
  CASE
    WHEN e.entity_type = 'patient' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM care_graph_relationships r
      JOIN care_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'patient'
    )
  END AS patient_count,
  CASE
    WHEN e.entity_type = 'encounter' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM care_graph_relationships r
      JOIN care_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'encounter'
    )
  END AS encounter_count,
  CASE
    WHEN e.entity_type = 'care_gap' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM care_graph_relationships r
      JOIN care_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'care_gap'
    )
  END AS open_care_gap_count,
  (
    SELECT COUNT(*)
    FROM care_graph_relationships r
    WHERE r.from_entity_id = e.entity_id
       OR r.to_entity_id = e.entity_id
  ) AS direct_connection_count,

  -- Backward-compatible aliases retained for inherited frontend/API contracts.
  e.volume_count AS follower_count,
  e.risk_score AS influence_score,
  e.engagement_rate
FROM care_graph_entities e;

CREATE OR REPLACE VIEW care_graph_pathway_findings AS
WITH
  edge_pairs AS (
    SELECT r.from_entity_id AS center_entity_id,
           r.to_entity_id   AS neighbor_entity_id,
           r.relationship_type,
           r.strength
    FROM care_graph_relationships r
    UNION ALL
    SELECT r.to_entity_id   AS center_entity_id,
           r.from_entity_id AS neighbor_entity_id,
           r.relationship_type,
           r.strength
    FROM care_graph_relationships r
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
  provider_patient_counts AS (
    SELECT p.entity_id AS provider_entity_id,
           COUNT(DISTINCT patient.entity_id) AS patient_count,
           LISTAGG(DISTINCT patient.node_id, ', ') WITHIN GROUP (ORDER BY patient.node_id) AS patient_nodes
    FROM care_graph_entities p
    JOIN edge_pairs ep
      ON ep.center_entity_id = p.entity_id
    JOIN care_graph_entities patient
      ON patient.entity_id = ep.neighbor_entity_id
     AND patient.entity_type = 'patient'
    WHERE p.entity_type = 'provider'
    GROUP BY p.entity_id
  ),
  direct_counts AS (
    SELECT center_entity_id AS entity_id,
           COUNT(DISTINCT neighbor_entity_id) AS direct_connection_count
    FROM edge_pairs
    GROUP BY center_entity_id
  )
SELECT
  'FIND-' || c.entity_id || '-DIRECT-GAPS' AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'care_gap' AS finding_type,
  'Direct care gaps connected' AS title,
  c.display_name || ' is directly connected to ' || COUNT(DISTINCT n.entity_id) ||
    ' open care gap' || CASE WHEN COUNT(DISTINCT n.entity_id) = 1 THEN '' ELSE 's' END ||
    ': ' || LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Review care gap owners and affected encounters.' AS recommended_action,
  'care_gap_paths' AS recommended_query_key,
  1 AS min_graph_depth
FROM reachable r
JOIN care_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN care_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth = 1
  AND n.entity_type = 'care_gap'
GROUP BY c.entity_id, c.node_id, c.display_name

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-PATHWAY-GAPS-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'care_gap_pathway' AS finding_type,
  'Care gaps within ' || r.graph_depth || ' hops' AS title,
  c.display_name || ' reaches ' || COUNT(DISTINCT n.entity_id) ||
    ' care gap pathway' || CASE WHEN COUNT(DISTINCT n.entity_id) = 1 THEN '' ELSE 's' END ||
    ' within ' || r.graph_depth || ' hops: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Trace the care gap path and confirm the responsible care owner.' AS recommended_action,
  'care_gap_paths' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN care_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN care_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth IN (2, 3)
  AND n.entity_type = 'care_gap'
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-HIGH-RISK-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'high_risk_pathway' AS finding_type,
  'High-risk pathway nodes nearby' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to high-risk pathway nodes: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Investigate the highest-risk connected node and supporting relationship path.' AS recommended_action,
  CASE
    WHEN MAX(CASE WHEN n.node_id = 'GAP-READMIT-RISK' THEN 1 ELSE 0 END) = 1 THEN 'readmission_chain'
    ELSE 'care_hubs'
  END AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN care_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN care_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_id <> c.entity_id
  AND n.risk_score >= 90
  AND n.entity_type IN ('patient','encounter','condition','care_gap','device','lab_result')
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-SHARED-PROVIDER-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'shared_provider' AS finding_type,
  'Shared care-team relationship' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to care-team nodes serving multiple de-identified patient journeys: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id || ' [' || ppc.patient_nodes || ']', ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Review shared care-team workload and related patient journeys.' AS recommended_action,
  'shared_care_team' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN care_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN care_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
JOIN provider_patient_counts ppc
  ON ppc.provider_entity_id = n.entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND ppc.patient_count >= 2
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-CARE-HUB-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'coordination_hub' AS finding_type,
  'High-connectivity coordination nodes' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to coordination hubs with concentrated graph relationships: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Open hub details to compare connected care gaps, providers, and encounters.' AS recommended_action,
  'care_hubs' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN care_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN care_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
JOIN direct_counts dc
  ON dc.entity_id = n.entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type IN ('provider','facility','care_gap','encounter')
  AND dc.direct_connection_count >= 4
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || e.entity_id || '-CASE-EVIDENCE' AS finding_id,
  e.entity_id AS center_entity_id,
  e.node_id AS center_node_id,
  'case_evidence' AS finding_type,
  'Case evidence map available' AS title,
  e.display_name || ' appears in ' || COUNT(DISTINCT c.case_id) ||
    ' synthetic pathway investigation case' ||
    CASE WHEN COUNT(DISTINCT c.case_id) = 1 THEN '' ELSE 's' END ||
    ': ' || LISTAGG(DISTINCT c.case_type, ', ') WITHIN GROUP (ORDER BY c.case_type) || '.' AS description,
  LISTAGG(DISTINCT c.case_key, ', ') WITHIN GROUP (ORDER BY c.case_key) AS supporting_node_ids,
  'case_involves' AS supporting_edge_types,
  MAX(c.risk_score) AS risk_score,
  'Build the case evidence map for this selected node.' AS recommended_action,
  'case_map' AS recommended_query_key,
  1 AS min_graph_depth
FROM care_graph_entities e
JOIN care_case_entities ce
  ON ce.entity_id = e.entity_id
JOIN care_pathway_cases c
  ON c.case_id = ce.case_id
GROUP BY e.entity_id, e.node_id, e.display_name;

COMMENT ON TABLE care_graph_entity_metrics IS
  'Healthcare-friendly care graph metric projection. Exposes pathway_volume, risk_score, patient_count, encounter_count, open_care_gap_count, and direct_connection_count while retaining legacy compatibility aliases.';
COMMENT ON TABLE care_graph_node_metadata IS
  'Healthcare-friendly node metadata projection. Preserves canonical node_id values while exposing node_type, display_name, clinical_label, and description for demos, SQL/PGQ examples, and natural-language querying.';
COMMENT ON TABLE care_graph_edge_metadata IS
  'Healthcare-friendly edge type metadata. Preserves canonical relationship edge_type values while exposing display_name, category, and description for graph legends, tooltips, SQL/PGQ presentation, and Ask Healthcare Data.';
COMMENT ON TABLE care_graph_relationship_metadata IS
  'Healthcare-friendly relationship metadata projection. Joins graph relationships to edge type display metadata without changing canonical relationship_type values or graph traversal behavior.';
COMMENT ON TABLE care_graph_pathway_findings IS
  'Database-backed pathway findings derived from synthetic care graph entities, relationships, provider sharing, care gaps, risk scores, and case evidence. Findings are demo-safe and update by selected center node and graph depth.';

COMMENT ON COLUMN care_graph_entities.node_id IS
  'Canonical graph node identifier exposed as a healthcare-friendly alias for ENTITY_KEY. Stable IDs such as COND-SEPSIS and PAT-1007 are preserved for SQL/PGQ traversal.';
COMMENT ON COLUMN care_graph_entities.node_type IS
  'Healthcare graph node type exposed as a readable alias for ENTITY_TYPE, such as patient, encounter, condition, provider, facility, medication, procedure, lab_result, or care_gap.';
COMMENT ON COLUMN care_graph_entities.display_name IS
  'Short user-facing node name for graph tooltips, detail panels, Ask Healthcare Data, and direct SQL query results.';
COMMENT ON COLUMN care_graph_entities.clinical_label IS
  'Healthcare-friendly node label that combines the node type and display name, for example Condition: Sepsis or Patient Journey: PAT-1007.';
COMMENT ON COLUMN care_graph_entities.description IS
  'Fictional demo-safe healthcare node description. Patient records remain de-identified and do not represent real clinical outcomes.';
COMMENT ON COLUMN care_graph_node_metadata.node_id IS
  'Canonical graph node identifier preserved for SQL/PGQ traversal and direct SQL lookup.';
COMMENT ON COLUMN care_graph_node_metadata.node_type IS
  'Healthcare graph node type for filtering and result display.';
COMMENT ON COLUMN care_graph_node_metadata.display_name IS
  'Short user-facing graph node name.';
COMMENT ON COLUMN care_graph_node_metadata.clinical_label IS
  'Healthcare-friendly graph node label for tooltips, detail panels, Ask Healthcare Data, and SQL results.';
COMMENT ON COLUMN care_graph_node_metadata.description IS
  'Fictional demo-safe graph node description.';
COMMENT ON COLUMN care_graph_entity_metrics.node_id IS
  'Canonical graph node identifier preserved alongside healthcare metric projections.';
COMMENT ON COLUMN care_graph_entity_metrics.node_type IS
  'Healthcare graph node type preserved alongside healthcare metric projections.';
COMMENT ON COLUMN care_graph_entity_metrics.clinical_label IS
  'Healthcare-friendly graph node label preserved alongside healthcare metric projections.';
COMMENT ON COLUMN care_graph_entity_metrics.description IS
  'Fictional demo-safe graph node description preserved alongside healthcare metric projections.';
COMMENT ON COLUMN care_graph_edge_metadata.edge_type IS
  'Canonical graph edge type preserved for SQL/PGQ traversal, for example had_encounter, diagnosed_with, has_care_gap, or assigned_to.';
COMMENT ON COLUMN care_graph_edge_metadata.display_name IS
  'Healthcare-friendly edge type name for graph legends, edge tooltips, detail panels, Ask Healthcare Data, and SQL results.';
COMMENT ON COLUMN care_graph_edge_metadata.category IS
  'Healthcare edge category such as Clinical Events, Care Coordination, or Risk and Gaps.';
COMMENT ON COLUMN care_graph_edge_metadata.description IS
  'Fictional demo-safe description of what the canonical edge type represents in the care pathway graph.';
COMMENT ON COLUMN care_graph_relationship_metadata.edge_type IS
  'Canonical edge type copied from CARE_GRAPH_RELATIONSHIPS.RELATIONSHIP_TYPE.';
COMMENT ON COLUMN care_graph_relationship_metadata.display_name IS
  'Healthcare-friendly display name for the canonical edge type.';
COMMENT ON COLUMN care_graph_relationship_metadata.category IS
  'Healthcare category for the canonical edge type.';
COMMENT ON COLUMN care_graph_relationship_metadata.description IS
  'Demo-safe description for the canonical edge type.';
COMMENT ON COLUMN care_graph_pathway_findings.finding_id IS
  'Stable generated finding identifier for the selected center node and finding type.';
COMMENT ON COLUMN care_graph_pathway_findings.center_entity_id IS
  'Selected center graph entity for which the pathway finding was derived.';
COMMENT ON COLUMN care_graph_pathway_findings.center_node_id IS
  'Canonical selected center node ID such as COND-SEPSIS or PAT-1001.';
COMMENT ON COLUMN care_graph_pathway_findings.finding_type IS
  'Healthcare operations finding class such as care_gap, high_risk_pathway, shared_provider, coordination_hub, or case_evidence.';
COMMENT ON COLUMN care_graph_pathway_findings.supporting_node_ids IS
  'Canonical node IDs or case keys that support the generated pathway finding.';
COMMENT ON COLUMN care_graph_pathway_findings.supporting_edge_types IS
  'Canonical edge types or edge paths that support the generated pathway finding.';
COMMENT ON COLUMN care_graph_pathway_findings.min_graph_depth IS
  'Minimum selected graph depth required for the finding to be visible in the current network exploration.';

COMMENT ON TABLE care_graph_entities IS
  'Synthetic de-identified healthcare graph vertices: patients, encounters, diagnoses, medications, procedures, providers, facilities, devices, and care gaps.';
COMMENT ON TABLE care_graph_relationships IS
  'Healthcare graph edges that represent care-pathway events, follow-up gaps, provider assignments, readmissions, and shared clinical context.';
COMMENT ON TABLE care_pathway_cases IS
  'Synthetic graph investigation cases for readmission risk, care gaps, and post-acute coordination.';
COMMENT ON TABLE care_case_entities IS
  'Links care-pathway graph cases to the entities that supply evidence for the case.';

COMMIT;

SELECT 'Care pathway property graph ready' AS status FROM dual;
