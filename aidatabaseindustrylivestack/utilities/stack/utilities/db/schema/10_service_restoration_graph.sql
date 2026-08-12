/*
 * 10_service_restoration_graph.sql
 * Energy & Utilities-native property graph for de-identified operational events.
 *
 * The graph connects synthetic electric outages, gas leak response, water main breaks,
 * wastewater compliance events, pipeline anomalies, well production issues, refinery
 * constraints, LNG logistics delays, emissions events, HSE incidents, affected customers,
 * assets, crews, inspections, work orders, compliance records, and resolution milestones.
 * It shows why graph traversal matters in Energy & Utilities: operators can follow
 * multi-hop operational context across subsectors without using an external graph database.
 */

SET SERVEROUTPUT ON
SET SQLBLANKLINES ON
SET DEFINE OFF

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE utility_graph_entities (
      entity_id        NUMBER PRIMARY KEY,
      entity_key       VARCHAR2(40)  NOT NULL UNIQUE,
      entity_type      VARCHAR2(30)  NOT NULL,
      node_id          VARCHAR2(40),
      node_type        VARCHAR2(30),
      display_name     VARCHAR2(160) NOT NULL,
      operations_domain  VARCHAR2(80),
      risk_score       NUMBER(5,2)   DEFAULT 0,
      volume_count     NUMBER(10)    DEFAULT 0,
      engagement_rate  NUMBER(8,4)   DEFAULT 0,
      city             VARCHAR2(80),
      region           VARCHAR2(40),
      is_verified      CHAR(1)       DEFAULT 'Y' CHECK (is_verified IN ('Y','N')),
      operations_label   VARCHAR2(180),
      description      VARCHAR2(700),
      summary          VARCHAR2(500),
      created_at       TIMESTAMP     DEFAULT SYSTIMESTAMP
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('utility_graph_entities table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('utility_graph_entities table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

DECLARE
  v_exists NUMBER := 0;
BEGIN
  FOR c IN (
    SELECT constraint_name
    FROM user_constraints
    WHERE table_name = 'UTILITY_GRAPH_ENTITIES'
      AND constraint_type = 'C'
      AND UPPER(search_condition_vc) LIKE '%ENTITY_TYPE%'
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_entities DROP CONSTRAINT ' ||
      DBMS_ASSERT.SIMPLE_SQL_NAME(c.constraint_name);
  END LOOP;

  SELECT COUNT(*) INTO v_exists
  FROM user_constraints
  WHERE table_name = 'UTILITY_GRAPH_ENTITIES'
    AND constraint_name = 'CHK_UTILITY_GRAPH_ENTITY_TYPE';

  IF v_exists = 0 THEN
    EXECUTE IMMEDIATE q'[
      ALTER TABLE utility_graph_entities ADD CONSTRAINT chk_utility_graph_entity_type
      CHECK (entity_type IN (
        'service_point','outage_event','gas_leak_event','water_main_break',
        'wastewater_overflow_event','pipeline_anomaly','well_production_issue',
        'refinery_constraint','lng_logistics_delay','emissions_event','hse_incident',
        'root_cause','demand_response_event','repair_action','field_crew','substation',
        'reliability_gap','asset','meter_event','affected_customer','affected_asset',
        'inspection','work_order','compliance_record','resolution_milestone',
        'pipeline_segment','well','production_facility','compressor_station',
        'refinery_unit','lng_terminal','storage_facility','water_treatment_plant',
        'wastewater_facility','pump_station','sensor_reading','maintenance_plan'
      ))
    ]';
  END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_entities ADD node_id VARCHAR2(40)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_entities ADD node_type VARCHAR2(30)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_entities ADD operations_label VARCHAR2(180)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_entities ADD description VARCHAR2(700)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

UPDATE utility_graph_entities
SET node_id = entity_key,
    node_type = entity_type
WHERE node_id IS NULL
   OR node_id <> entity_key
   OR node_type IS NULL
   OR node_type <> entity_type;

CREATE OR REPLACE TRIGGER trg_utility_graph_entities_node_meta
BEFORE INSERT OR UPDATE OF entity_key, entity_type, node_id, node_type
ON utility_graph_entities
FOR EACH ROW
BEGIN
  :NEW.node_id := :NEW.entity_key;
  :NEW.node_type := :NEW.entity_type;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE utility_graph_relationships (
      relationship_id    NUMBER PRIMARY KEY,
      from_entity_id     NUMBER NOT NULL REFERENCES utility_graph_entities(entity_id),
      to_entity_id       NUMBER NOT NULL REFERENCES utility_graph_entities(entity_id),
      relationship_type  VARCHAR2(40) NOT NULL,
      strength           NUMBER(4,3) DEFAULT 0.5,
      interaction_count  NUMBER(8)   DEFAULT 1,
      evidence_text      VARCHAR2(500),
      first_seen         TIMESTAMP   DEFAULT SYSTIMESTAMP,
      last_interaction   TIMESTAMP   DEFAULT SYSTIMESTAMP,
      CONSTRAINT uq_utility_graph_rel UNIQUE (from_entity_id, to_entity_id, relationship_type)
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('utility_graph_relationships table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('utility_graph_relationships table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

DECLARE
  v_exists NUMBER := 0;
BEGIN
  FOR c IN (
    SELECT constraint_name
    FROM user_constraints
    WHERE table_name = 'UTILITY_GRAPH_RELATIONSHIPS'
      AND constraint_type = 'C'
      AND UPPER(search_condition_vc) LIKE '%RELATIONSHIP_TYPE%'
  ) LOOP
    EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_relationships DROP CONSTRAINT ' ||
      DBMS_ASSERT.SIMPLE_SQL_NAME(c.constraint_name);
  END LOOP;

  SELECT COUNT(*) INTO v_exists
  FROM user_constraints
  WHERE table_name = 'UTILITY_GRAPH_RELATIONSHIPS'
    AND constraint_name = 'CHK_UTILITY_GRAPH_REL_TYPE';

  IF v_exists = 0 THEN
    EXECUTE IMMEDIATE q'[
      ALTER TABLE utility_graph_relationships ADD CONSTRAINT chk_utility_graph_rel_type
      CHECK (relationship_type IN (
        'reported_outage','root_caused_by','used_demand_response',
        'opened_repair_action','assigned_field_crew','located_at',
        'has_reliability_gap','followed_by','assigned_to',
        'escalated_to','repeat_outage_after','meter_indicates',
        'uses_asset','shares_field_crew','case_signal','affected_customer',
        'affected_asset','requires_inspection','opens_work_order',
        'creates_compliance_record','reaches_milestone','monitored_by_sensor',
        'has_pressure_anomaly','has_compliance_event','has_emissions_event',
        'has_hse_incident','constrains_throughput','delays_logistics',
        'has_integrity_risk','has_production_variance','feeds_facility'
      ))
    ]';
  END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE utility_graph_edge_metadata (
      edge_type     VARCHAR2(40)  PRIMARY KEY,
      display_name  VARCHAR2(120) NOT NULL,
      category      VARCHAR2(80)  NOT NULL,
      description   VARCHAR2(500)
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('utility_graph_edge_metadata table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('utility_graph_edge_metadata table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_edge_metadata ADD display_name VARCHAR2(120)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_edge_metadata ADD category VARCHAR2(80)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE utility_graph_edge_metadata ADD description VARCHAR2(500)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -1430 THEN RAISE; END IF;
END;
/

MERGE INTO utility_graph_edge_metadata m
USING (
  SELECT 'reported_outage' AS edge_type, 'Had Outage Event' AS display_name, 'Operational Events' AS category,
         'Connects a de-identified restoration event to an outage event in the operational event workflow graph.' AS description FROM dual
  UNION ALL SELECT 'root_caused_by', 'Root Caused By', 'Operational Events',
         'Connects an outage event or restoration event to a utility root cause node.' FROM dual
  UNION ALL SELECT 'opened_repair_action', 'Ordered Repair Action', 'Operational Events',
         'Connects an outage event to a repair, inspection, switching, or dispatch action ordered during the restoration workflow.' FROM dual
  UNION ALL SELECT 'meter_indicates', 'Meter Indicates', 'Operational Events',
         'Connects a repair action or telemetry check to a meter-event signal used for restoration context.' FROM dual
  UNION ALL SELECT 'used_demand_response', 'Received Demand Response Event', 'Operational Events',
         'Connects an outage event or restoration event to a demand response event used in the synthetic operational event workflow.' FROM dual
  UNION ALL SELECT 'assigned_field_crew', 'Assigned Field Crew', 'Field Coordination',
         'Connects an outage event or restoration event to a field crew involved in utility operations.' FROM dual
  UNION ALL SELECT 'shares_field_crew', 'Shares Field Crew', 'Field Coordination',
         'Connects utility entities that share a field crew, or coordination pattern.' FROM dual
  UNION ALL SELECT 'assigned_to', 'Assigned To', 'Field Coordination',
         'Connects a restoration event, gap, or service need to its assigned field owner.' FROM dual
  UNION ALL SELECT 'followed_by', 'Followed By', 'Field Coordination',
         'Connects sequential events such as an index outage followed by restoration or customer outreach.' FROM dual
  UNION ALL SELECT 'located_at', 'Occurred At', 'Field Coordination',
         'Connects an outage event or activity to the substation where it occurred in the demo graph.' FROM dual
  UNION ALL SELECT 'has_reliability_gap', 'Has Reliability Gap', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a restoration event, outage event, repair action, or service to an open reliability-gap node.' FROM dual
  UNION ALL SELECT 'repeat_outage_after', 'Repeat Outage After', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a repeat outage-risk pattern to a later or comparable return outage event in the demo graph.' FROM dual
  UNION ALL SELECT 'escalated_to', 'Escalated To', 'Risk ' || CHR(38) || ' Gaps',
         'Connects a reliability gap or risk signal to the team, substation, or partner responsible for follow-up.' FROM dual
  UNION ALL SELECT 'case_signal', 'Case Signal', 'Risk ' || CHR(38) || ' Gaps',
         'Connects an asset, service, or event to a risk or reliability signal in the synthetic workflow.' FROM dual
  UNION ALL SELECT 'uses_asset', 'Uses Asset', 'Risk ' || CHR(38) || ' Gaps',
         'Connects an outage event or restoration event to an asset involved in the synthetic operational event workflow.' FROM dual
  UNION ALL SELECT 'affected_customer', 'Affected Customer', 'Operational Events',
         'Connects an event to affected customer accounts, service points, or priority customers.' FROM dual
  UNION ALL SELECT 'affected_asset', 'Affected Asset', 'Operational Events',
         'Connects an event to the asset, unit, facility, or network segment affected by the issue.' FROM dual
  UNION ALL SELECT 'requires_inspection', 'Requires Inspection', 'Field Coordination',
         'Connects an operational event or asset risk to a field, integrity, compliance, HSE, or maintenance inspection.' FROM dual
  UNION ALL SELECT 'opens_work_order', 'Opens Work Order', 'Field Coordination',
         'Connects an event, inspection, or maintenance plan to the work order used for field execution.' FROM dual
  UNION ALL SELECT 'creates_compliance_record', 'Creates Compliance Record', 'Compliance',
         'Connects operational events to compliance records, regulatory reports, or reliability/HSE follow-up.' FROM dual
  UNION ALL SELECT 'reaches_milestone', 'Reaches Resolution Milestone', 'Operational Events',
         'Connects operational events to restoration, repair, reporting, or resolution milestones.' FROM dual
  UNION ALL SELECT 'monitored_by_sensor', 'Monitored By Sensor', 'Operational Events',
         'Connects assets and facilities to pressure, vibration, temperature, meter, water-quality, or emissions readings.' FROM dual
  UNION ALL SELECT 'has_pressure_anomaly', 'Has Pressure Anomaly', 'Risk ' || CHR(38) || ' Gaps',
         'Connects gas, water, or pipeline assets to pressure variance signals.' FROM dual
  UNION ALL SELECT 'has_compliance_event', 'Has Compliance Event', 'Compliance',
         'Connects a facility, event, or process to wastewater, regulatory, reliability, or safety compliance records.' FROM dual
  UNION ALL SELECT 'has_emissions_event', 'Has Emissions Event', 'Compliance',
         'Connects a facility, unit, pipeline, or production asset to emissions excursions and reporting follow-up.' FROM dual
  UNION ALL SELECT 'has_hse_incident', 'Has HSE Incident', 'HSE',
         'Connects events, assets, and work orders to HSE incidents and safety follow-up.' FROM dual
  UNION ALL SELECT 'constrains_throughput', 'Constrains Throughput', 'Production ' || CHR(38) || ' Operations',
         'Connects well, refinery, LNG, or facility events to production or throughput constraints.' FROM dual
  UNION ALL SELECT 'delays_logistics', 'Delays Logistics', 'Production ' || CHR(38) || ' Operations',
         'Connects LNG cargoes, terminal operations, field execution, or product movement records to logistics delays.' FROM dual
  UNION ALL SELECT 'has_integrity_risk', 'Has Integrity Risk', 'Risk ' || CHR(38) || ' Gaps',
         'Connects pipelines, stations, wells, and facilities to corrosion, integrity, or maintenance risk.' FROM dual
  UNION ALL SELECT 'has_production_variance', 'Has Production Variance', 'Production ' || CHR(38) || ' Operations',
         'Connects wells and production facilities to variance from forecast and optimization needs.' FROM dual
  UNION ALL SELECT 'feeds_facility', 'Feeds Facility', 'Production ' || CHR(38) || ' Operations',
         'Connects wells, pipeline segments, compressor stations, terminals, and storage assets to downstream facilities.' FROM dual
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
    CREATE TABLE restoration_cases (
      case_id           NUMBER PRIMARY KEY,
      case_key          VARCHAR2(40)  NOT NULL UNIQUE,
      case_type         VARCHAR2(60)  NOT NULL,
      severity          VARCHAR2(20)  CHECK (severity IN ('low','medium','high','critical')),
      status            VARCHAR2(30)  DEFAULT 'open',
      anchor_entity_id  NUMBER REFERENCES utility_graph_entities(entity_id),
      risk_score        NUMBER(5,2)   DEFAULT 0,
      summary           VARCHAR2(700),
      created_at        TIMESTAMP     DEFAULT SYSTIMESTAMP
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('restoration_cases table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('restoration_cases table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE restoration_case_entities (
      case_entity_id  NUMBER PRIMARY KEY,
      case_id         NUMBER NOT NULL REFERENCES restoration_cases(case_id),
      entity_id       NUMBER NOT NULL REFERENCES utility_graph_entities(entity_id),
      role            VARCHAR2(40) NOT NULL,
      evidence_score  NUMBER(5,2) DEFAULT 0,
      note            VARCHAR2(400),
      CONSTRAINT uq_restoration_case_entity UNIQUE (case_id, entity_id, role)
    )
  ]';
  DBMS_OUTPUT.PUT_LINE('restoration_case_entities table created.');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE = -955 THEN
      DBMS_OUTPUT.PUT_LINE('restoration_case_entities table already exists.');
    ELSE
      RAISE;
    END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_utility_entities_type ON utility_graph_entities(entity_type, risk_score DESC)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_utility_rel_from ON utility_graph_relationships(from_entity_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_utility_rel_to ON utility_graph_relationships(to_entity_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_utility_rel_type ON utility_graph_relationships(relationship_type)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_restoration_case_entities_case ON restoration_case_entities(case_id)';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE OR REPLACE PROPERTY GRAPH service_restoration_network
      VERTEX TABLES (
        utility_graph_entities KEY (entity_id)
          LABEL utility_entity
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
            summary
          ),
        restoration_cases KEY (case_id)
          LABEL restoration_case
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
        utility_graph_relationships
          KEY (relationship_id)
          SOURCE KEY (from_entity_id) REFERENCES utility_graph_entities (entity_id)
          DESTINATION KEY (to_entity_id) REFERENCES utility_graph_entities (entity_id)
          LABEL restoration_link
          PROPERTIES (
            relationship_type,
            strength,
            interaction_count,
            evidence_text
          ),
        restoration_case_entities
          KEY (case_entity_id)
          SOURCE KEY (case_id) REFERENCES restoration_cases (case_id)
          DESTINATION KEY (entity_id) REFERENCES utility_graph_entities (entity_id)
          LABEL restoration_case_involves
          PROPERTIES (
            role,
            evidence_score,
            note
          )
      )
  ]';
  DBMS_OUTPUT.PUT_LINE('service_restoration_network property graph created or replaced.');
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
/

CREATE OR REPLACE VIEW utility_graph_node_metadata AS
SELECT
  e.node_id,
  e.node_type,
  e.display_name,
  e.operations_label,
  COALESCE(e.description, e.summary) AS description,
  e.entity_id,
  e.operations_domain,
  e.risk_score,
  e.city,
  e.region,
  e.is_verified
FROM utility_graph_entities e;

CREATE OR REPLACE VIEW utility_graph_relationship_metadata AS
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
FROM utility_graph_relationships r
LEFT JOIN utility_graph_edge_metadata m
  ON m.edge_type = r.relationship_type;

CREATE OR REPLACE VIEW utility_graph_entity_metrics AS
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

  -- Energy & Utilities-specific metric names used by the demo API and SQL examples.
  e.volume_count AS pathway_volume,
  e.risk_score AS risk_score,
  CASE
    WHEN e.entity_type = 'service_point' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM utility_graph_relationships r
      JOIN utility_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'service_point'
    )
  END AS service_point_count,
  CASE
    WHEN e.entity_type = 'outage_event' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM utility_graph_relationships r
      JOIN utility_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'outage_event'
    )
  END AS outage_event_count,
  CASE
    WHEN e.entity_type = 'reliability_gap' THEN 1
    ELSE (
      SELECT COUNT(DISTINCT related.entity_id)
      FROM utility_graph_relationships r
      JOIN utility_graph_entities related
        ON related.entity_id = CASE
          WHEN r.from_entity_id = e.entity_id THEN r.to_entity_id
          ELSE r.from_entity_id
        END
      WHERE (r.from_entity_id = e.entity_id OR r.to_entity_id = e.entity_id)
        AND related.entity_type = 'reliability_gap'
    )
  END AS open_reliability_gap_count,
  (
    SELECT COUNT(*)
    FROM utility_graph_relationships r
    WHERE r.from_entity_id = e.entity_id
       OR r.to_entity_id = e.entity_id
  ) AS direct_connection_count,

  -- Backward-compatible aliases retained for inherited frontend/API contracts.
  e.volume_count AS follower_count,
  e.risk_score AS influence_score,
  e.engagement_rate
FROM utility_graph_entities e;

CREATE OR REPLACE VIEW utility_graph_restoration_findings AS
WITH
  edge_pairs AS (
    SELECT r.from_entity_id AS center_entity_id,
           r.to_entity_id   AS neighbor_entity_id,
           r.relationship_type,
           r.strength
    FROM utility_graph_relationships r
    UNION ALL
    SELECT r.to_entity_id   AS center_entity_id,
           r.from_entity_id AS neighbor_entity_id,
           r.relationship_type,
           r.strength
    FROM utility_graph_relationships r
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
  field_crew_service_point_counts AS (
    SELECT p.entity_id AS field_crew_entity_id,
           COUNT(DISTINCT service_point.entity_id) AS service_point_count,
           LISTAGG(DISTINCT service_point.node_id, ', ') WITHIN GROUP (ORDER BY service_point.node_id) AS service_point_nodes
    FROM utility_graph_entities p
    JOIN edge_pairs ep
      ON ep.center_entity_id = p.entity_id
    JOIN utility_graph_entities service_point
      ON service_point.entity_id = ep.neighbor_entity_id
     AND service_point.entity_type = 'service_point'
    WHERE p.entity_type = 'field_crew'
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
  'reliability_gap' AS finding_type,
  'Direct reliability gaps connected' AS title,
  c.display_name || ' is directly connected to ' || COUNT(DISTINCT n.entity_id) ||
    ' open reliability gap' || CASE WHEN COUNT(DISTINCT n.entity_id) = 1 THEN '' ELSE 's' END ||
    ': ' || LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Review reliability gap owners and affected outage events.' AS recommended_action,
  'reliability_gap_paths' AS recommended_query_key,
  1 AS min_graph_depth
FROM reachable r
JOIN utility_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN utility_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth = 1
  AND n.entity_type = 'reliability_gap'
GROUP BY c.entity_id, c.node_id, c.display_name

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-PATHWAY-GAPS-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'reliability_gap_workflow' AS finding_type,
  'Reliability gaps within ' || r.graph_depth || ' hops' AS title,
  c.display_name || ' reaches ' || COUNT(DISTINCT n.entity_id) ||
    ' reliability gap pathway' || CASE WHEN COUNT(DISTINCT n.entity_id) = 1 THEN '' ELSE 's' END ||
    ' within ' || r.graph_depth || ' hops: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id, ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Trace the reliability gap path and confirm the responsible field owner.' AS recommended_action,
  'reliability_gap_paths' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN utility_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN utility_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth IN (2, 3)
  AND n.entity_type = 'reliability_gap'
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
    WHEN MAX(CASE WHEN n.node_id = 'GAP-REPEAT-OUTAGE' THEN 1 ELSE 0 END) = 1 THEN 'repeat_outage_chain'
    ELSE 'restoration_hubs'
  END AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN utility_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN utility_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_id <> c.entity_id
  AND n.risk_score >= 90
  AND n.entity_type IN ('service_point','outage_event','root_cause','reliability_gap','asset','meter_event')
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-SHARED-CREW-D' || r.graph_depth AS finding_id,
  c.entity_id AS center_entity_id,
  c.node_id AS center_node_id,
  'shared_field_crew' AS finding_type,
  'Shared field-crew relationship' AS title,
  c.display_name || ' is connected within ' || r.graph_depth ||
    ' hops to field-crew nodes serving multiple de-identified restoration events: ' ||
    LISTAGG(DISTINCT n.display_name, ', ') WITHIN GROUP (ORDER BY n.display_name) || '.' AS description,
  LISTAGG(DISTINCT n.node_id || ' [' || ppc.service_point_nodes || ']', ', ') WITHIN GROUP (ORDER BY n.node_id) AS supporting_node_ids,
  LISTAGG(DISTINCT r.edge_path, ', ') WITHIN GROUP (ORDER BY r.edge_path) AS supporting_edge_types,
  MAX(n.risk_score) AS risk_score,
  'Review shared field-crew workload and related restoration events.' AS recommended_action,
  'shared_field_crew' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN utility_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN utility_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
JOIN field_crew_service_point_counts ppc
  ON ppc.field_crew_entity_id = n.entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND ppc.service_point_count >= 2
GROUP BY c.entity_id, c.node_id, c.display_name, r.graph_depth

UNION ALL

SELECT
  'FIND-' || c.entity_id || '-OPERATIONS-HUB-D' || r.graph_depth AS finding_id,
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
  'Open hub details to compare connected reliability gaps, utility operators, and outage events.' AS recommended_action,
  'restoration_hubs' AS recommended_query_key,
  r.graph_depth AS min_graph_depth
FROM reachable r
JOIN utility_graph_entities c
  ON c.entity_id = r.center_entity_id
JOIN utility_graph_entities n
  ON n.entity_id = r.neighbor_entity_id
JOIN direct_counts dc
  ON dc.entity_id = n.entity_id
WHERE r.graph_depth BETWEEN 1 AND 3
  AND n.entity_type IN ('field_crew','substation','reliability_gap','outage_event')
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
  'restoration_case_involves' AS supporting_edge_types,
  MAX(c.risk_score) AS risk_score,
  'Build the case evidence map for this selected node.' AS recommended_action,
  'case_map' AS recommended_query_key,
  1 AS min_graph_depth
FROM utility_graph_entities e
JOIN restoration_case_entities ce
  ON ce.entity_id = e.entity_id
JOIN restoration_cases c
  ON c.case_id = ce.case_id
GROUP BY e.entity_id, e.node_id, e.display_name;

COMMENT ON TABLE utility_graph_entity_metrics IS
  'Energy & Utilities-friendly operational event graph metric projection. Exposes pathway_volume, risk_score, service_point_count, outage_event_count, open_reliability_gap_count, and direct_connection_count while retaining legacy compatibility aliases.';
COMMENT ON TABLE utility_graph_node_metadata IS
  'Energy & Utilities-friendly node metadata projection. Preserves canonical node_id values while exposing node_type, display_name, operations_label, risk_score, and description for demos, SQL/PGQ examples, and natural-language querying.';
COMMENT ON TABLE utility_graph_edge_metadata IS
  'Energy & Utilities-friendly edge type metadata. Preserves canonical relationship edge_type values while exposing display_name, category, and description for graph legends, tooltips, SQL/PGQ presentation, and Ask Energy & Utilities Data.';
COMMENT ON TABLE utility_graph_relationship_metadata IS
  'Energy & Utilities-friendly relationship metadata projection. Joins graph relationships to edge type display metadata without changing canonical relationship_type values or graph traversal behavior.';
COMMENT ON TABLE utility_graph_restoration_findings IS
  'Database-backed pathway findings derived from synthetic operational event graph entities, relationships, field crew sharing, reliability gaps, risk scores, and case evidence. Findings are demo-safe and update by selected center node and graph depth.';

COMMENT ON COLUMN utility_graph_entities.node_id IS
  'Canonical graph node identifier exposed as a utilities-friendly alias for ENTITY_KEY. Stable IDs such as CAUSE-FEEDER-FAULT and SP-1007 are preserved for SQL/PGQ traversal.';
COMMENT ON COLUMN utility_graph_entities.node_type IS
  'Energy & Utilities graph node type exposed as a readable alias for ENTITY_TYPE, such as service point, outage event, gas leak event, water main break, pipeline anomaly, well production issue, refinery constraint, LNG delay, emissions event, HSE incident, field crew, work order, compliance record, asset, or reliability_gap.';
COMMENT ON COLUMN utility_graph_entities.display_name IS
  'Short user-facing node name for graph tooltips, detail panels, Ask Energy & Utilities Data, and direct SQL query results.';
COMMENT ON COLUMN utility_graph_entities.operations_label IS
  'Energy & Utilities-friendly node label that combines the node type and display name, for example Condition: Feeder Fault or Restoration Event: SP-1007.';
COMMENT ON COLUMN utility_graph_entities.description IS
  'Fictional demo-safe utilities node description. Service Point records remain de-identified and do not represent real operational outcomes.';
COMMENT ON COLUMN utility_graph_node_metadata.node_id IS
  'Canonical graph node identifier preserved for SQL/PGQ traversal and direct SQL lookup.';
COMMENT ON COLUMN utility_graph_node_metadata.node_type IS
  'Energy & Utilities graph node type for filtering and result display.';
COMMENT ON COLUMN utility_graph_node_metadata.display_name IS
  'Short user-facing graph node name.';
COMMENT ON COLUMN utility_graph_node_metadata.operations_label IS
  'Energy & Utilities-friendly graph node label for tooltips, detail panels, Ask Energy & Utilities Data, and SQL results.';
COMMENT ON COLUMN utility_graph_node_metadata.description IS
  'Fictional demo-safe graph node description.';
COMMENT ON COLUMN utility_graph_entity_metrics.node_id IS
  'Canonical graph node identifier preserved alongside utilities metric projections.';
COMMENT ON COLUMN utility_graph_entity_metrics.node_type IS
  'Energy & Utilities graph node type preserved alongside utilities metric projections.';
COMMENT ON COLUMN utility_graph_entity_metrics.operations_label IS
  'Energy & Utilities-friendly graph node label preserved alongside utilities metric projections.';
COMMENT ON COLUMN utility_graph_entity_metrics.description IS
  'Fictional demo-safe graph node description preserved alongside utilities metric projections.';
COMMENT ON COLUMN utility_graph_edge_metadata.edge_type IS
  'Canonical graph edge type preserved for SQL/PGQ traversal, for example reported_outage, root_caused_by, has_reliability_gap, or assigned_to.';
COMMENT ON COLUMN utility_graph_edge_metadata.display_name IS
  'Energy & Utilities-friendly edge type name for graph legends, edge tooltips, detail panels, Ask Energy & Utilities Data, and SQL results.';
COMMENT ON COLUMN utility_graph_edge_metadata.category IS
  'Energy & Utilities edge category such as Operational Events, Field Coordination, or Risk and Gaps.';
COMMENT ON COLUMN utility_graph_edge_metadata.description IS
  'Fictional demo-safe description of what the canonical edge type represents in the operational event graph.';
COMMENT ON COLUMN utility_graph_relationship_metadata.edge_type IS
  'Canonical edge type copied from UTILITY_GRAPH_RELATIONSHIPS.RELATIONSHIP_TYPE.';
COMMENT ON COLUMN utility_graph_relationship_metadata.display_name IS
  'Energy & Utilities-friendly display name for the canonical edge type.';
COMMENT ON COLUMN utility_graph_relationship_metadata.category IS
  'Energy & Utilities category for the canonical edge type.';
COMMENT ON COLUMN utility_graph_relationship_metadata.description IS
  'Demo-safe description for the canonical edge type.';
COMMENT ON COLUMN utility_graph_restoration_findings.finding_id IS
  'Stable generated finding identifier for the selected center node and finding type.';
COMMENT ON COLUMN utility_graph_restoration_findings.center_entity_id IS
  'Selected center graph entity for which the pathway finding was derived.';
COMMENT ON COLUMN utility_graph_restoration_findings.center_node_id IS
  'Canonical selected center node ID such as CAUSE-FEEDER-FAULT or SP-1001.';
COMMENT ON COLUMN utility_graph_restoration_findings.finding_type IS
  'utility operations finding class such as reliability_gap, high_risk_pathway, shared_field_crew, coordination_hub, or case_evidence.';
COMMENT ON COLUMN utility_graph_restoration_findings.supporting_node_ids IS
  'Canonical node IDs or case keys that support the generated pathway finding.';
COMMENT ON COLUMN utility_graph_restoration_findings.supporting_edge_types IS
  'Canonical edge types or edge paths that support the generated pathway finding.';
COMMENT ON COLUMN utility_graph_restoration_findings.min_graph_depth IS
  'Minimum selected graph depth required for the finding to be visible in the current network exploration.';

COMMENT ON TABLE utility_graph_entities IS
  'Synthetic de-identified utilities graph vertices spanning electric outages, gas leak response, water/wastewater operations, oil & gas production, pipelines, refineries, LNG logistics, emissions, HSE, assets, work orders, crews, compliance records, and reliability gaps.';
COMMENT ON TABLE utility_graph_relationships IS
  'Energy & Utilities graph edges that represent operational events, affected assets/customers, root causes, inspections, work orders, field crew assignments, compliance records, milestones, and shared operational context.';
COMMENT ON TABLE restoration_cases IS
  'Synthetic graph investigation cases for operational event risk, asset integrity, compliance follow-up, production constraints, HSE, and post-event coordination.';
COMMENT ON TABLE restoration_case_entities IS
  'Links operational-event graph cases to the entities that supply evidence for the case.';

COMMIT;

SELECT 'Operational event property graph ready' AS status FROM dual;
