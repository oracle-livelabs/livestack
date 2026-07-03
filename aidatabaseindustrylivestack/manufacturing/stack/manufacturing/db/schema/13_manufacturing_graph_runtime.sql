/*
 * 13_manufacturing_graph_runtime.sql
 * Rebuild and validate the typed Manufacturing graph from the active
 * relational dataset. Demo and custom imports use this same code path.
 *
 * Required order:
 *   core schema -> data -> 06 security owner -> 06a context admin -> this file
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET SQLBLANKLINES ON
SET DEFINE OFF

CREATE OR REPLACE PROCEDURE refresh_manufacturing_graph_domain
AUTHID DEFINER
AS
  v_active_source       app_dataset_state.active_source%TYPE;
  v_active_version      app_dataset_state.active_version%TYPE;
  v_count               PLS_INTEGER;
  v_next_entity_id      NUMBER := 0;
  v_next_relationship_id NUMBER := 0;
  v_next_case_entity_id NUMBER := 0;
  v_caller_username     VARCHAR2(128) := SYS_CONTEXT('MANUFACTURING_APP_CTX', 'USERNAME');

  PROCEDURE restore_caller_context IS
  BEGIN
    IF v_caller_username IS NULL THEN
      manufacturing_security_pkg.clear_user_context;
    ELSE
      manufacturing_security_pkg.set_user_context(v_caller_username);
    END IF;
  END restore_caller_context;
BEGIN
  SAVEPOINT manufacturing_graph_refresh;

  manufacturing_security_pkg.set_user_context('analyst_raj');

  IF SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE') <> 'analyst'
     OR SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') <> 'GLOBAL'
     OR SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') <> 'Y' THEN
    RAISE_APPLICATION_ERROR(
      -20073,
      'Graph refresh requires the active global Manufacturing analyst context'
    );
  END IF;

  SELECT active_source,
         COALESCE(active_version, 'v1')
  INTO v_active_source,
       v_active_version
  FROM app_dataset_state
  WHERE state_id = 1
  FOR UPDATE;

  DELETE FROM manufacturing_graph_state
  WHERE graph_name = 'MANUFACTURING_PRODUCTION_NETWORK';
  DELETE FROM manufacturing_case_entities;
  DELETE FROM manufacturing_risk_cases;
  DELETE FROM manufacturing_graph_relationships;
  DELETE FROM manufacturing_graph_entity_access;
  DELETE FROM manufacturing_graph_entities;

  DELETE FROM manufacturing_graph_edge_metadata
  WHERE edge_type NOT IN (
    'produces_part',
    'constrains_work_order',
    'scheduled_on',
    'feeds_line',
    'triggered_by_signal'
  );

  MERGE INTO manufacturing_graph_edge_metadata target
  USING (
    SELECT 'produces_part' AS edge_type,
           'Supplies Part' AS display_name,
           'Supplier Network' AS category,
           'Connects a supplier to a manufactured part in the current relational dataset.' AS description
    FROM dual
    UNION ALL SELECT
      'feeds_line', 'Available At Plant', 'Production Flow',
      'Connects a manufactured part to a plant where current inventory or capacity is recorded.'
    FROM dual
    UNION ALL SELECT
      'scheduled_on', 'Scheduled At Plant', 'Production Flow',
      'Connects a work order to its assigned plant or production center.'
    FROM dual
    UNION ALL SELECT
      'constrains_work_order', 'Required By Work Order', 'Risk Propagation',
      'Connects a manufactured part to a work order that requires it.'
    FROM dual
    UNION ALL SELECT
      'triggered_by_signal', 'Supported By Signal', 'Production Signals',
      'Connects a production signal to the current part or work order it supports.'
    FROM dual
  ) source
  ON (target.edge_type = source.edge_type)
  WHEN MATCHED THEN UPDATE SET
    target.display_name = source.display_name,
    target.category = source.category,
    target.description = source.description
  WHEN NOT MATCHED THEN INSERT (
    edge_type,
    display_name,
    category,
    description
  ) VALUES (
    source.edge_type,
    source.display_name,
    source.category,
    source.description
  );

  -- Suppliers are the domain-facing projection of the inherited business-unit rows.
  INSERT INTO manufacturing_graph_entities (
    entity_id, entity_key, entity_type, display_name, operations_domain,
    risk_score, volume_count, engagement_rate, city, region, is_verified,
    operations_label, description, summary, source_object, source_key,
    dataset_version, created_at
  )
  SELECT v_next_entity_id + ROW_NUMBER() OVER (ORDER BY supplier.supplier_id),
         'SUPPLIER-' || TO_CHAR(supplier.supplier_id, 'TM9'),
         'supplier',
         supplier.supplier_name,
         COALESCE(supplier.supplier_category, 'Manufacturing Supply'),
         LEAST(100, GREATEST(0, COALESCE((
           SELECT MAX(work_order.demand_urgency_score)
           FROM products part
           JOIN manufacturing_work_order_lines line_item
             ON line_item.manufactured_part_id = part.product_id
           JOIN manufacturing_work_orders work_order
             ON work_order.work_order_id = line_item.work_order_id
           WHERE part.brand_id = supplier.supplier_id
         ), 0))),
         LEAST(9999999999, COALESCE((
           SELECT SUM(line_item.requested_units)
           FROM products part
           JOIN manufacturing_work_order_lines line_item
             ON line_item.manufactured_part_id = part.product_id
           WHERE part.brand_id = supplier.supplier_id
         ), 0)),
         0,
         supplier.headquarters_city,
         (
           SELECT MIN(center.state_province) KEEP (
                    DENSE_RANK FIRST
                    ORDER BY COALESCE(stock.quantity_on_hand, 0) DESC,
                             center.center_id
                  )
           FROM products part
           JOIN inventory stock
             ON stock.product_id = part.product_id
           JOIN fulfillment_centers center
             ON center.center_id = stock.center_id
           WHERE part.brand_id = supplier.supplier_id
         ),
         'Y',
         'Supplier: ' || supplier.supplier_name,
         SUBSTR(
           supplier.supplier_name || ' supplies ' ||
           TO_CHAR((SELECT COUNT(*) FROM products part
                    WHERE part.brand_id = supplier.supplier_id)) ||
           ' active dataset part records.',
           1,
           700
         ),
         SUBSTR(
           supplier.supplier_name || ' supplies ' ||
           TO_CHAR((SELECT COUNT(*) FROM products part
                    WHERE part.brand_id = supplier.supplier_id)) ||
           ' active dataset part records.',
           1,
           500
         ),
         'MANUFACTURING_SUPPLIERS',
         TO_CHAR(supplier.supplier_id, 'TM9'),
         v_active_version,
         supplier.created_at
  FROM manufacturing_suppliers supplier;

  SELECT COALESCE(MAX(entity_id), 0)
  INTO v_next_entity_id
  FROM manufacturing_graph_entities;

  INSERT INTO manufacturing_graph_entities (
    entity_id, entity_key, entity_type, display_name, operations_domain,
    risk_score, volume_count, engagement_rate, city, region, is_verified,
    operations_label, description, summary, source_object, source_key,
    dataset_version, created_at
  )
  SELECT v_next_entity_id + ROW_NUMBER() OVER (ORDER BY part.product_id),
         'PART-' || TO_CHAR(part.product_id, 'TM9'),
         'part',
         part.product_name,
         COALESCE(part.category, 'Manufactured Part'),
         LEAST(100, GREATEST(
           COALESCE((
             SELECT MAX(work_order.demand_urgency_score)
             FROM manufacturing_work_order_lines line_item
             JOIN manufacturing_work_orders work_order
               ON work_order.work_order_id = line_item.work_order_id
             WHERE line_item.manufactured_part_id = part.product_id
           ), 0),
           CASE
             WHEN COALESCE((
               SELECT SUM(stock.quantity_on_hand - stock.quantity_reserved)
               FROM inventory stock
               WHERE stock.product_id = part.product_id
             ), 0) <= COALESCE((
               SELECT SUM(stock.reorder_point)
               FROM inventory stock
               WHERE stock.product_id = part.product_id
             ), 0) THEN 80
             ELSE 35
           END
         )),
         LEAST(9999999999, COALESCE((
           SELECT SUM(line_item.requested_units)
           FROM manufacturing_work_order_lines line_item
           WHERE line_item.manufactured_part_id = part.product_id
         ), 0)),
         0,
         (
           SELECT MIN(center.city) KEEP (
                    DENSE_RANK FIRST
                    ORDER BY COALESCE(stock.quantity_on_hand, 0) DESC,
                             center.center_id
                  )
           FROM inventory stock
           JOIN fulfillment_centers center
             ON center.center_id = stock.center_id
           WHERE stock.product_id = part.product_id
         ),
         (
           SELECT MIN(center.state_province) KEEP (
                    DENSE_RANK FIRST
                    ORDER BY COALESCE(stock.quantity_on_hand, 0) DESC,
                             center.center_id
                  )
           FROM inventory stock
           JOIN fulfillment_centers center
             ON center.center_id = stock.center_id
           WHERE stock.product_id = part.product_id
         ),
         CASE WHEN part.is_active = 1 THEN 'Y' ELSE 'N' END,
         'Manufactured Part: ' || part.product_name,
         SUBSTR(
           COALESCE(DBMS_LOB.SUBSTR(part.description, 700, 1),
                    part.product_name || ' (' || part.sku || ')'),
           1,
           700
         ),
         SUBSTR(
           COALESCE(DBMS_LOB.SUBSTR(part.description, 500, 1),
                    part.product_name || ' (' || part.sku || ')'),
           1,
           500
         ),
         'PRODUCTS',
         TO_CHAR(part.product_id, 'TM9'),
         v_active_version,
         part.created_at
  FROM products part;

  SELECT COALESCE(MAX(entity_id), 0)
  INTO v_next_entity_id
  FROM manufacturing_graph_entities;

  INSERT INTO manufacturing_graph_entities (
    entity_id, entity_key, entity_type, display_name, operations_domain,
    risk_score, volume_count, engagement_rate, city, region, is_verified,
    operations_label, description, summary, source_object, source_key,
    dataset_version, created_at
  )
  SELECT v_next_entity_id + ROW_NUMBER() OVER (ORDER BY center.center_id),
         'PLANT-' || TO_CHAR(center.center_id, 'TM9'),
         'plant',
         center.center_name,
         'Plant Capacity',
         LEAST(100, GREATEST(
           COALESCE(center.current_load_pct, 0),
           COALESCE((
             SELECT MAX(work_order.demand_urgency_score)
             FROM manufacturing_work_orders work_order
             WHERE work_order.assigned_plant_id = center.center_id
           ), 0)
         )),
         LEAST(9999999999, COALESCE(center.capacity_units, 0)),
         0,
         center.city,
         center.state_province,
         CASE WHEN center.is_active = 1 THEN 'Y' ELSE 'N' END,
         'Plant: ' || center.center_name,
         SUBSTR(
           center.center_name || ' has ' || TO_CHAR(COALESCE(center.capacity_units, 0)) ||
           ' capacity units and current load of ' ||
           TO_CHAR(COALESCE(center.current_load_pct, 0)) || ' percent.',
           1,
           700
         ),
         SUBSTR(
           center.center_name || ' has ' || TO_CHAR(COALESCE(center.capacity_units, 0)) ||
           ' capacity units and current load of ' ||
           TO_CHAR(COALESCE(center.current_load_pct, 0)) || ' percent.',
           1,
           500
         ),
         'FULFILLMENT_CENTERS',
         TO_CHAR(center.center_id, 'TM9'),
         v_active_version,
         center.created_at
  FROM fulfillment_centers center;

  SELECT COALESCE(MAX(entity_id), 0)
  INTO v_next_entity_id
  FROM manufacturing_graph_entities;

  INSERT INTO manufacturing_graph_entities (
    entity_id, entity_key, entity_type, display_name, operations_domain,
    risk_score, volume_count, engagement_rate, city, region, is_verified,
    operations_label, description, summary, source_object, source_key,
    dataset_version, created_at
  )
  SELECT v_next_entity_id + ROW_NUMBER() OVER (ORDER BY work_order.work_order_id),
         CASE
           WHEN work_order.work_order_code IS NOT NULL
             AND REGEXP_LIKE(work_order.work_order_code, '^WO-[A-Za-z0-9_-]{1,47}$', 'i')
             AND work_order.normalized_code_count = 1
             THEN UPPER(work_order.work_order_code)
           ELSE 'WO-' || TO_CHAR(work_order.work_order_id, 'TM9')
         END,
         'work_order',
         COALESCE(work_order.work_order_code,
                  'Work Order ' || TO_CHAR(work_order.work_order_id, 'TM9')),
         'Production Planning',
         LEAST(100, GREATEST(0, COALESCE(
           work_order.demand_urgency_score,
           CASE work_order.work_order_status_code
             WHEN 'planned' THEN 75
             WHEN 'released' THEN 65
             WHEN 'in_progress' THEN 55
             WHEN 'dispatched' THEN 35
             WHEN 'completed' THEN 15
             WHEN 'on_hold' THEN 85
             WHEN 'cancelled' THEN 20
             ELSE 40
           END
         ))),
         LEAST(9999999999, COALESCE((
           SELECT SUM(line_item.requested_units)
           FROM manufacturing_work_order_lines line_item
           WHERE line_item.work_order_id = work_order.work_order_id
         ), 0)),
         0,
         center.city,
         center.state_province,
         'Y',
         'Work Order: ' || COALESCE(
           work_order.work_order_code,
           TO_CHAR(work_order.work_order_id, 'TM9')
         ),
         SUBSTR(
           'Current ' || work_order.work_order_status_code || ' work order with ' ||
           TO_CHAR(COALESCE((
             SELECT SUM(line_item.requested_units)
             FROM manufacturing_work_order_lines line_item
             WHERE line_item.work_order_id = work_order.work_order_id
           ), 0)) || ' requested units.',
           1,
           700
         ),
         SUBSTR(
           'Current ' || work_order.work_order_status_code || ' work order with ' ||
           TO_CHAR(COALESCE((
             SELECT SUM(line_item.requested_units)
             FROM manufacturing_work_order_lines line_item
             WHERE line_item.work_order_id = work_order.work_order_id
           ), 0)) || ' requested units.',
           1,
           500
         ),
         'MANUFACTURING_WORK_ORDERS',
         TO_CHAR(work_order.work_order_id, 'TM9'),
         v_active_version,
         work_order.created_at
  FROM (
    SELECT source_order.*,
           COUNT(*) OVER (
             PARTITION BY UPPER(source_order.work_order_code)
           ) AS normalized_code_count
    FROM manufacturing_work_orders source_order
  ) work_order
  LEFT JOIN fulfillment_centers center
    ON center.center_id = work_order.assigned_plant_id;

  SELECT COALESCE(MAX(entity_id), 0)
  INTO v_next_entity_id
  FROM manufacturing_graph_entities;

  INSERT INTO manufacturing_graph_entities (
    entity_id, entity_key, entity_type, display_name, operations_domain,
    risk_score, volume_count, engagement_rate, city, region, is_verified,
    operations_label, description, summary, source_object, source_key,
    dataset_version, created_at
  )
  SELECT v_next_entity_id + ROW_NUMBER() OVER (ORDER BY signal.production_signal_id),
         'SIGNAL-' || TO_CHAR(signal.production_signal_id, 'TM9'),
         'production_signal',
         'Production Signal ' || TO_CHAR(signal.production_signal_id, 'TM9'),
         'Production Signals',
         LEAST(100, GREATEST(0, COALESCE(signal.urgency_score, 0))),
         LEAST(9999999999, COALESCE(signal.observation_count, 0)),
         ROUND(LEAST(1, COALESCE(
           (COALESCE(signal.acknowledgement_count, 0) +
            COALESCE(signal.propagation_count, 0) +
            COALESCE(signal.response_count, 0)) /
           NULLIF(signal.observation_count, 0),
           0
         )), 4),
         source_account.city,
         source_account.region,
         'Y',
         'Production Signal: ' || TO_CHAR(signal.production_signal_id, 'TM9'),
         SUBSTR(COALESCE(DBMS_LOB.SUBSTR(signal.signal_text, 700, 1),
                         'Production signal ' || TO_CHAR(signal.production_signal_id, 'TM9')), 1, 700),
         SUBSTR(COALESCE(DBMS_LOB.SUBSTR(signal.signal_text, 500, 1),
                         'Production signal ' || TO_CHAR(signal.production_signal_id, 'TM9')), 1, 500),
         'MANUFACTURING_PRODUCTION_SIGNALS',
         TO_CHAR(signal.production_signal_id, 'TM9'),
         v_active_version,
         signal.created_at
  FROM manufacturing_production_signals signal
  LEFT JOIN influencers source_account
    ON source_account.influencer_id = signal.network_account_id;

  -- Every edge below is reconstructed from a current relational relationship.
  INSERT INTO manufacturing_graph_relationships (
    relationship_id, from_entity_id, to_entity_id, relationship_type,
    strength, interaction_count, evidence_text, first_seen, last_interaction
  )
  SELECT v_next_relationship_id + ROW_NUMBER() OVER (ORDER BY part.product_id),
         supplier_entity.entity_id,
         part_entity.entity_id,
         'produces_part',
         0.900,
         1,
         SUBSTR(supplier.supplier_name || ' supplies ' || part.product_name || '.', 1, 500),
         part.created_at,
         part.updated_at
  FROM products part
  JOIN manufacturing_suppliers supplier
    ON supplier.supplier_id = part.brand_id
  JOIN manufacturing_graph_entities supplier_entity
    ON supplier_entity.source_object = 'MANUFACTURING_SUPPLIERS'
   AND supplier_entity.source_key = TO_CHAR(supplier.supplier_id, 'TM9')
  JOIN manufacturing_graph_entities part_entity
    ON part_entity.source_object = 'PRODUCTS'
   AND part_entity.source_key = TO_CHAR(part.product_id, 'TM9');

  SELECT COALESCE(MAX(relationship_id), 0)
  INTO v_next_relationship_id
  FROM manufacturing_graph_relationships;

  INSERT INTO manufacturing_graph_relationships (
    relationship_id, from_entity_id, to_entity_id, relationship_type,
    strength, interaction_count, evidence_text, first_seen, last_interaction
  )
  SELECT v_next_relationship_id + ROW_NUMBER() OVER (
           ORDER BY source.product_id, source.work_order_id
         ),
         source.part_entity_id,
         source.work_order_entity_id,
         'constrains_work_order',
         0.880,
         LEAST(99999999, source.requested_units),
         SUBSTR(source.part_name || ' is required by ' || source.work_order_name || '.', 1, 500),
         source.first_seen,
         source.last_seen
  FROM (
    SELECT part.product_id,
           work_order.work_order_id,
           part_entity.entity_id AS part_entity_id,
           work_order_entity.entity_id AS work_order_entity_id,
           part.product_name AS part_name,
           COALESCE(work_order.work_order_code,
                    'work order ' || TO_CHAR(work_order.work_order_id, 'TM9')) AS work_order_name,
           SUM(line_item.requested_units) AS requested_units,
           MIN(work_order.created_at) AS first_seen,
           MAX(work_order.updated_at) AS last_seen
    FROM manufacturing_work_order_lines line_item
    JOIN products part
      ON part.product_id = line_item.manufactured_part_id
    JOIN manufacturing_work_orders work_order
      ON work_order.work_order_id = line_item.work_order_id
    JOIN manufacturing_graph_entities part_entity
      ON part_entity.source_object = 'PRODUCTS'
     AND part_entity.source_key = TO_CHAR(part.product_id, 'TM9')
    JOIN manufacturing_graph_entities work_order_entity
      ON work_order_entity.source_object = 'MANUFACTURING_WORK_ORDERS'
     AND work_order_entity.source_key = TO_CHAR(work_order.work_order_id, 'TM9')
    GROUP BY part.product_id,
             work_order.work_order_id,
             part_entity.entity_id,
             work_order_entity.entity_id,
             part.product_name,
             work_order.work_order_code
  ) source;

  SELECT COALESCE(MAX(relationship_id), 0)
  INTO v_next_relationship_id
  FROM manufacturing_graph_relationships;

  INSERT INTO manufacturing_graph_relationships (
    relationship_id, from_entity_id, to_entity_id, relationship_type,
    strength, interaction_count, evidence_text, first_seen, last_interaction
  )
  SELECT v_next_relationship_id + ROW_NUMBER() OVER (ORDER BY work_order.work_order_id),
         work_order_entity.entity_id,
         plant_entity.entity_id,
         'scheduled_on',
         0.900,
         1,
         SUBSTR(
           COALESCE(work_order.work_order_code,
                    'Work order ' || TO_CHAR(work_order.work_order_id, 'TM9')) ||
           ' is scheduled at ' || center.center_name || '.',
           1,
           500
         ),
         work_order.created_at,
         work_order.updated_at
  FROM manufacturing_work_orders work_order
  JOIN fulfillment_centers center
    ON center.center_id = work_order.assigned_plant_id
  JOIN manufacturing_graph_entities work_order_entity
    ON work_order_entity.source_object = 'MANUFACTURING_WORK_ORDERS'
   AND work_order_entity.source_key = TO_CHAR(work_order.work_order_id, 'TM9')
  JOIN manufacturing_graph_entities plant_entity
    ON plant_entity.source_object = 'FULFILLMENT_CENTERS'
   AND plant_entity.source_key = TO_CHAR(center.center_id, 'TM9');

  SELECT COALESCE(MAX(relationship_id), 0)
  INTO v_next_relationship_id
  FROM manufacturing_graph_relationships;

  INSERT INTO manufacturing_graph_relationships (
    relationship_id, from_entity_id, to_entity_id, relationship_type,
    strength, interaction_count, evidence_text, first_seen, last_interaction
  )
  SELECT v_next_relationship_id + ROW_NUMBER() OVER (ORDER BY stock.inventory_id),
         part_entity.entity_id,
         plant_entity.entity_id,
         'feeds_line',
         0.820,
         LEAST(99999999, GREATEST(1, COALESCE(stock.quantity_on_hand, 0))),
         SUBSTR(
           part.product_name || ' has current inventory at ' || center.center_name || '.',
           1,
           500
         ),
         CAST(stock.last_restock_date AS TIMESTAMP),
         stock.updated_at
  FROM inventory stock
  JOIN products part
    ON part.product_id = stock.product_id
  JOIN fulfillment_centers center
    ON center.center_id = stock.center_id
  JOIN manufacturing_graph_entities part_entity
    ON part_entity.source_object = 'PRODUCTS'
   AND part_entity.source_key = TO_CHAR(part.product_id, 'TM9')
  JOIN manufacturing_graph_entities plant_entity
    ON plant_entity.source_object = 'FULFILLMENT_CENTERS'
   AND plant_entity.source_key = TO_CHAR(center.center_id, 'TM9');

  SELECT COALESCE(MAX(relationship_id), 0)
  INTO v_next_relationship_id
  FROM manufacturing_graph_relationships;

  INSERT INTO manufacturing_graph_relationships (
    relationship_id, from_entity_id, to_entity_id, relationship_type,
    strength, interaction_count, evidence_text, first_seen, last_interaction
  )
  SELECT v_next_relationship_id + ROW_NUMBER() OVER (ORDER BY work_order.work_order_id),
         signal_entity.entity_id,
         work_order_entity.entity_id,
         'triggered_by_signal',
         0.920,
         1,
         SUBSTR(
           'Production signal ' || TO_CHAR(signal.production_signal_id, 'TM9') ||
           ' is the recorded source for ' ||
           COALESCE(work_order.work_order_code,
                    'work order ' || TO_CHAR(work_order.work_order_id, 'TM9')) || '.',
           1,
           500
         ),
         signal.observed_at,
         work_order.updated_at
  FROM manufacturing_work_orders work_order
  JOIN manufacturing_production_signals signal
    ON signal.production_signal_id = work_order.production_signal_id
  JOIN manufacturing_graph_entities signal_entity
    ON signal_entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS'
   AND signal_entity.source_key = TO_CHAR(signal.production_signal_id, 'TM9')
  JOIN manufacturing_graph_entities work_order_entity
    ON work_order_entity.source_object = 'MANUFACTURING_WORK_ORDERS'
   AND work_order_entity.source_key = TO_CHAR(work_order.work_order_id, 'TM9');

  SELECT COALESCE(MAX(relationship_id), 0)
  INTO v_next_relationship_id
  FROM manufacturing_graph_relationships;

  INSERT INTO manufacturing_graph_relationships (
    relationship_id, from_entity_id, to_entity_id, relationship_type,
    strength, interaction_count, evidence_text, first_seen, last_interaction
  )
  SELECT v_next_relationship_id + ROW_NUMBER() OVER (ORDER BY mention.signal_part_mention_id),
         signal_entity.entity_id,
         part_entity.entity_id,
         'triggered_by_signal',
         LEAST(0.999, GREATEST(0.001, COALESCE(mention.confidence_score, 0.5))),
         1,
         SUBSTR(
           'Production signal ' || TO_CHAR(signal.production_signal_id, 'TM9') ||
           ' mentions ' || part.product_name || '.',
           1,
           500
         ),
         signal.observed_at,
         mention.created_at
  FROM manufacturing_signal_part_mentions mention
  JOIN manufacturing_production_signals signal
    ON signal.production_signal_id = mention.production_signal_id
  JOIN products part
    ON part.product_id = mention.manufactured_part_id
  JOIN manufacturing_graph_entities signal_entity
    ON signal_entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS'
   AND signal_entity.source_key = TO_CHAR(signal.production_signal_id, 'TM9')
  JOIN manufacturing_graph_entities part_entity
    ON part_entity.source_object = 'PRODUCTS'
   AND part_entity.source_key = TO_CHAR(part.product_id, 'TM9');

  -- Derive a bounded investigation queue from the current highest-risk work orders.
  INSERT INTO manufacturing_risk_cases (
    case_id, case_key, case_type, severity, status, anchor_entity_id,
    risk_score, summary, created_at
  )
  SELECT risk_rank,
         'CASE-WO-' || source_key,
         'Work order production risk',
         CASE
           WHEN risk_score >= 90 THEN 'critical'
           WHEN risk_score >= 75 THEN 'high'
           WHEN risk_score >= 50 THEN 'medium'
           ELSE 'low'
         END,
         CASE
           WHEN work_order_status_code IN ('completed', 'cancelled', 'on_hold') THEN 'monitoring'
           ELSE 'open'
         END,
         entity_id,
         risk_score,
         SUBSTR(
           display_name || ' is ranked from the active relational dataset at risk ' ||
           TO_CHAR(risk_score) || ' with status ' || work_order_status_code || '.',
           1,
           700
         ),
         created_at
  FROM (
    SELECT entity.entity_id,
           entity.source_key,
           entity.display_name,
           entity.risk_score,
           work_order.work_order_status_code,
           work_order.created_at,
           ROW_NUMBER() OVER (
             ORDER BY entity.risk_score DESC, work_order.work_order_id
           ) AS risk_rank
    FROM manufacturing_graph_entities entity
    JOIN manufacturing_work_orders work_order
      ON entity.source_object = 'MANUFACTURING_WORK_ORDERS'
     AND entity.source_key = TO_CHAR(work_order.work_order_id, 'TM9')
  ) ranked
  WHERE risk_rank <= 25;

  INSERT INTO manufacturing_case_entities (
    case_entity_id, case_id, entity_id, role, evidence_score, note
  )
  SELECT v_next_case_entity_id + ROW_NUMBER() OVER (ORDER BY risk_case.case_id),
         risk_case.case_id,
         risk_case.anchor_entity_id,
         'anchor_work_order',
         risk_case.risk_score,
         'Risk case is anchored to this current work order.'
  FROM manufacturing_risk_cases risk_case;

  SELECT COALESCE(MAX(case_entity_id), 0)
  INTO v_next_case_entity_id
  FROM manufacturing_case_entities;

  INSERT INTO manufacturing_case_entities (
    case_entity_id, case_id, entity_id, role, evidence_score, note
  )
  SELECT v_next_case_entity_id + ROW_NUMBER() OVER (
           ORDER BY source.case_id, source.entity_id
         ),
         source.case_id,
         source.entity_id,
         'required_part',
         source.evidence_score,
         'Part is required by the case work order in MANUFACTURING_WORK_ORDER_LINES.'
  FROM (
    SELECT DISTINCT risk_case.case_id,
           part_entity.entity_id,
           LEAST(100, GREATEST(risk_case.risk_score, part_entity.risk_score))
             AS evidence_score
    FROM manufacturing_risk_cases risk_case
    JOIN manufacturing_graph_entities work_order_entity
      ON work_order_entity.entity_id = risk_case.anchor_entity_id
    JOIN manufacturing_work_order_lines line_item
      ON TO_CHAR(line_item.work_order_id, 'TM9') = work_order_entity.source_key
    JOIN manufacturing_graph_entities part_entity
      ON part_entity.source_object = 'PRODUCTS'
     AND part_entity.source_key = TO_CHAR(line_item.manufactured_part_id, 'TM9')
  ) source;

  SELECT COALESCE(MAX(case_entity_id), 0)
  INTO v_next_case_entity_id
  FROM manufacturing_case_entities;

  INSERT INTO manufacturing_case_entities (
    case_entity_id, case_id, entity_id, role, evidence_score, note
  )
  SELECT v_next_case_entity_id + ROW_NUMBER() OVER (
           ORDER BY source.case_id, source.entity_id
         ),
         source.case_id,
         source.entity_id,
         'part_supplier',
         source.evidence_score,
         'Supplier owns a part required by the case work order.'
  FROM (
    SELECT DISTINCT risk_case.case_id,
           supplier_entity.entity_id,
           LEAST(100, GREATEST(risk_case.risk_score, supplier_entity.risk_score))
             AS evidence_score
    FROM manufacturing_risk_cases risk_case
    JOIN manufacturing_graph_entities work_order_entity
      ON work_order_entity.entity_id = risk_case.anchor_entity_id
    JOIN manufacturing_work_order_lines line_item
      ON TO_CHAR(line_item.work_order_id, 'TM9') = work_order_entity.source_key
    JOIN products part
      ON part.product_id = line_item.manufactured_part_id
    JOIN manufacturing_graph_entities supplier_entity
      ON supplier_entity.source_object = 'MANUFACTURING_SUPPLIERS'
     AND supplier_entity.source_key = TO_CHAR(part.brand_id, 'TM9')
  ) source;

  SELECT COALESCE(MAX(case_entity_id), 0)
  INTO v_next_case_entity_id
  FROM manufacturing_case_entities;

  INSERT INTO manufacturing_case_entities (
    case_entity_id, case_id, entity_id, role, evidence_score, note
  )
  SELECT v_next_case_entity_id + ROW_NUMBER() OVER (ORDER BY risk_case.case_id),
         risk_case.case_id,
         plant_entity.entity_id,
         'scheduled_plant',
         LEAST(100, GREATEST(risk_case.risk_score, plant_entity.risk_score)),
         'Plant is the current fulfillment or production center for the case work order.'
  FROM manufacturing_risk_cases risk_case
  JOIN manufacturing_graph_entities work_order_entity
    ON work_order_entity.entity_id = risk_case.anchor_entity_id
  JOIN manufacturing_work_orders work_order
    ON TO_CHAR(work_order.work_order_id, 'TM9') = work_order_entity.source_key
  JOIN manufacturing_graph_entities plant_entity
    ON plant_entity.source_object = 'FULFILLMENT_CENTERS'
   AND plant_entity.source_key = TO_CHAR(work_order.assigned_plant_id, 'TM9');

  SELECT COALESCE(MAX(case_entity_id), 0)
  INTO v_next_case_entity_id
  FROM manufacturing_case_entities;

  INSERT INTO manufacturing_case_entities (
    case_entity_id, case_id, entity_id, role, evidence_score, note
  )
  SELECT v_next_case_entity_id + ROW_NUMBER() OVER (ORDER BY risk_case.case_id),
         risk_case.case_id,
         signal_entity.entity_id,
         'production_signal',
         LEAST(100, GREATEST(risk_case.risk_score, signal_entity.risk_score)),
         'Signal is the current relational source attributed to the case work order.'
  FROM manufacturing_risk_cases risk_case
  JOIN manufacturing_graph_entities work_order_entity
    ON work_order_entity.entity_id = risk_case.anchor_entity_id
  JOIN manufacturing_work_orders work_order
    ON TO_CHAR(work_order.work_order_id, 'TM9') = work_order_entity.source_key
  JOIN manufacturing_graph_entities signal_entity
    ON signal_entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS'
   AND signal_entity.source_key = TO_CHAR(work_order.production_signal_id, 'TM9');

  -- Regional VPD evidence is also rebuilt only from current relational rows.
  INSERT INTO manufacturing_graph_entity_access (
    graph_entity_id, region_code, access_basis
  )
  WITH source_regions AS (
    SELECT entity.entity_id,
           center.state_province AS source_region,
           'LIVE_PLANT_STATE:' || center.state_province AS access_basis
    FROM manufacturing_graph_entities entity
    JOIN fulfillment_centers center
      ON entity.source_object = 'FULFILLMENT_CENTERS'
     AND entity.source_key = TO_CHAR(center.center_id, 'TM9')

    UNION ALL

    SELECT entity.entity_id,
           center.state_province,
           'LIVE_ORDER_CENTER_STATE:' || center.state_province
    FROM manufacturing_graph_entities entity
    JOIN manufacturing_work_orders work_order
      ON entity.source_object = 'MANUFACTURING_WORK_ORDERS'
     AND entity.source_key = TO_CHAR(work_order.work_order_id, 'TM9')
    JOIN fulfillment_centers center
      ON center.center_id = work_order.assigned_plant_id

    UNION ALL

    SELECT entity.entity_id,
           center.state_province,
           'LIVE_PART_INVENTORY_STATE:' || center.state_province
    FROM manufacturing_graph_entities entity
    JOIN inventory stock
      ON entity.source_object = 'PRODUCTS'
     AND entity.source_key = TO_CHAR(stock.product_id, 'TM9')
    JOIN fulfillment_centers center
      ON center.center_id = stock.center_id

    UNION ALL

    SELECT entity.entity_id,
           center.state_province,
           'LIVE_SUPPLIER_INVENTORY_STATE:' || center.state_province
    FROM manufacturing_graph_entities entity
    JOIN products part
      ON entity.source_object = 'MANUFACTURING_SUPPLIERS'
     AND entity.source_key = TO_CHAR(part.brand_id, 'TM9')
    JOIN inventory stock
      ON stock.product_id = part.product_id
    JOIN fulfillment_centers center
      ON center.center_id = stock.center_id

    UNION ALL

    SELECT entity.entity_id,
           center.state_province,
           'LIVE_SIGNAL_PART_STATE:' || center.state_province
    FROM manufacturing_graph_entities entity
    JOIN manufacturing_signal_part_mentions mention
      ON entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS'
     AND entity.source_key = TO_CHAR(mention.production_signal_id, 'TM9')
    JOIN inventory stock
      ON stock.product_id = mention.manufactured_part_id
    JOIN fulfillment_centers center
      ON center.center_id = stock.center_id

    UNION ALL

    SELECT entity.entity_id,
           source_account.region,
           'LIVE_SIGNAL_ACCOUNT_REGION:' || source_account.region
    FROM manufacturing_graph_entities entity
    JOIN manufacturing_production_signals signal
      ON entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS'
     AND entity.source_key = TO_CHAR(signal.production_signal_id, 'TM9')
    JOIN influencers source_account
      ON source_account.influencer_id = signal.network_account_id
  ),
  mapped_regions AS (
    SELECT entity_id,
           CASE
             WHEN UPPER(TRIM(source_region)) IN (
               'CA', 'CALIFORNIA', 'WA', 'WASHINGTON',
               'AZ', 'ARIZONA', 'CO', 'COLORADO',
               'NV', 'NEVADA', 'OR', 'OREGON',
               'UT', 'UTAH', 'ID', 'IDAHO',
               'MT', 'MONTANA', 'WY', 'WYOMING'
             ) THEN 'CA'
             WHEN UPPER(TRIM(source_region)) IN (
               'NJ', 'NEW JERSEY', 'NY', 'NEW YORK',
               'PA', 'PENNSYLVANIA', 'MA', 'MASSACHUSETTS',
               'MI', 'MICHIGAN', 'IL', 'ILLINOIS',
               'OH', 'OHIO', 'IN', 'INDIANA',
               'WI', 'WISCONSIN', 'MN', 'MINNESOTA'
             ) THEN 'NJ'
             WHEN UPPER(TRIM(source_region)) IN (
               'GA', 'GEORGIA', 'TX', 'TEXAS',
               'FL', 'FLORIDA', 'TN', 'TENNESSEE',
               'AL', 'ALABAMA', 'MS', 'MISSISSIPPI',
               'LA', 'LOUISIANA', 'NC', 'NORTH CAROLINA',
               'SC', 'SOUTH CAROLINA'
             ) THEN 'GA'
           END AS region_code,
           access_basis
    FROM source_regions
    WHERE source_region IS NOT NULL
  )
  SELECT entity_id,
         region_code,
         MIN(SUBSTR(access_basis, 1, 200))
  FROM mapped_regions
  WHERE region_code IS NOT NULL
  GROUP BY entity_id, region_code;

  SELECT ABS(
           (SELECT COUNT(*) FROM manufacturing_graph_entities) -
           (
             (SELECT COUNT(*) FROM manufacturing_suppliers) +
             (SELECT COUNT(*) FROM products) +
             (SELECT COUNT(*) FROM fulfillment_centers) +
             (SELECT COUNT(*) FROM manufacturing_work_orders) +
             (SELECT COUNT(*) FROM manufacturing_production_signals)
           )
         )
  INTO v_count
  FROM dual;

  IF v_count <> 0 THEN
    RAISE_APPLICATION_ERROR(
      -20063,
      'Manufacturing graph does not contain exactly one vertex per live source row'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM manufacturing_graph_entities entity
  WHERE entity.dataset_version <> v_active_version
     OR (entity.source_object = 'MANUFACTURING_SUPPLIERS' AND NOT EXISTS (
           SELECT 1 FROM manufacturing_suppliers supplier
           WHERE TO_CHAR(supplier.supplier_id, 'TM9') = entity.source_key
         ))
     OR (entity.source_object = 'PRODUCTS' AND NOT EXISTS (
           SELECT 1 FROM products part
           WHERE TO_CHAR(part.product_id, 'TM9') = entity.source_key
         ))
     OR (entity.source_object = 'FULFILLMENT_CENTERS' AND NOT EXISTS (
           SELECT 1 FROM fulfillment_centers center
           WHERE TO_CHAR(center.center_id, 'TM9') = entity.source_key
         ))
     OR (entity.source_object = 'MANUFACTURING_WORK_ORDERS' AND NOT EXISTS (
           SELECT 1 FROM manufacturing_work_orders work_order
           WHERE TO_CHAR(work_order.work_order_id, 'TM9') = entity.source_key
         ))
     OR (entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS' AND NOT EXISTS (
           SELECT 1 FROM manufacturing_production_signals signal
           WHERE TO_CHAR(signal.production_signal_id, 'TM9') = entity.source_key
         ));

  IF v_count <> 0 THEN
    RAISE_APPLICATION_ERROR(
      -20065,
      'Manufacturing graph contains stale or orphaned source links'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM manufacturing_graph_entities supplier
  JOIN manufacturing_graph_relationships supply
    ON supply.from_entity_id = supplier.entity_id
   AND supply.relationship_type = 'produces_part'
  JOIN manufacturing_graph_entities part
    ON part.entity_id = supply.to_entity_id
   AND part.entity_type = 'part'
  JOIN manufacturing_graph_relationships requirement
    ON requirement.from_entity_id = part.entity_id
   AND requirement.relationship_type = 'constrains_work_order'
  JOIN manufacturing_graph_entities work_order
    ON work_order.entity_id = requirement.to_entity_id
   AND work_order.entity_type = 'work_order'
  WHERE supplier.entity_type = 'supplier';

  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(
      -20074,
      'Manufacturing graph has no live supplier-to-part-to-work-order path'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM manufacturing_risk_cases;

  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(
      -20075,
      'Manufacturing graph has no relationally derived risk cases'
    );
  END IF;

  MERGE INTO manufacturing_graph_state target
  USING (
    SELECT 'MANUFACTURING_PRODUCTION_NETWORK' AS graph_name,
           v_active_source AS dataset_source,
           v_active_version AS dataset_version,
           (SELECT COUNT(*) FROM manufacturing_graph_entities) AS entity_count,
           (SELECT COUNT(*) FROM manufacturing_graph_relationships)
             AS relationship_count
    FROM dual
  ) source
  ON (target.graph_name = source.graph_name)
  WHEN MATCHED THEN UPDATE SET
    target.dataset_source = source.dataset_source,
    target.dataset_version = source.dataset_version,
    target.entity_count = source.entity_count,
    target.relationship_count = source.relationship_count,
    target.loaded_at = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    graph_name,
    dataset_source,
    dataset_version,
    entity_count,
    relationship_count,
    loaded_at
  ) VALUES (
    source.graph_name,
    source.dataset_source,
    source.dataset_version,
    source.entity_count,
    source.relationship_count,
    SYSTIMESTAMP
  );
  restore_caller_context;
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK TO manufacturing_graph_refresh;
    restore_caller_context;
    RAISE;
END;
/

BEGIN
  refresh_manufacturing_graph_domain;
END;
/

DECLARE
  v_count                    PLS_INTEGER;
  v_entity_count             PLS_INTEGER;
  v_relationship_count       PLS_INTEGER;
  v_state_entity_count       PLS_INTEGER;
  v_state_relationship_count PLS_INTEGER;
  v_dataset_source           manufacturing_graph_state.dataset_source%TYPE;
  v_dataset_version          manufacturing_graph_state.dataset_version%TYPE;
  v_active_source            app_dataset_state.active_source%TYPE;
  v_active_version           app_dataset_state.active_version%TYPE;
BEGIN
  manufacturing_security_pkg.set_user_context('analyst_raj');

  SELECT active_source,
         COALESCE(active_version, 'v1')
  INTO v_active_source,
       v_active_version
  FROM app_dataset_state
  WHERE state_id = 1;

  SELECT COUNT(*)
  INTO v_entity_count
  FROM manufacturing_graph_entities;

  SELECT COUNT(*)
  INTO v_relationship_count
  FROM manufacturing_graph_relationships;

  SELECT dataset_source,
         dataset_version,
         entity_count,
         relationship_count
  INTO v_dataset_source,
       v_dataset_version,
       v_state_entity_count,
       v_state_relationship_count
  FROM manufacturing_graph_state
  WHERE graph_name = 'MANUFACTURING_PRODUCTION_NETWORK';

  IF v_dataset_source <> v_active_source
     OR v_dataset_version <> v_active_version
     OR v_state_entity_count <> v_entity_count
     OR v_state_relationship_count <> v_relationship_count THEN
    RAISE_APPLICATION_ERROR(
      -20067,
      'MANUFACTURING_GRAPH_STATE is stale or invalid'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM user_property_graphs
  WHERE graph_name = 'MANUFACTURING_PRODUCTION_NETWORK'
    AND graph_mode = 'ENFORCED';

  IF v_count <> 1 THEN
    RAISE_APPLICATION_ERROR(
      -20068,
      'MANUFACTURING_PRODUCTION_NETWORK is not enforced'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM GRAPH_TABLE (
    manufacturing_production_network
    MATCH
      (supplier IS manufacturing_entity)
      -[supply IS production_link]->
      (part IS manufacturing_entity)
      -[requirement IS production_link]->
      (work_order IS manufacturing_entity)
    WHERE supplier.entity_type = 'supplier'
      AND part.entity_type = 'part'
      AND work_order.entity_type = 'work_order'
      AND supply.relationship_type = 'produces_part'
      AND requirement.relationship_type = 'constrains_work_order'
    COLUMNS (
      supplier.entity_key AS supplier_key,
      part.entity_key AS part_key,
      work_order.entity_key AS work_order_key
    )
  );

  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(
      -20069,
      'Manufacturing SQL/PGQ live relational path validation failed'
    );
  END IF;
  manufacturing_security_pkg.clear_user_context;
EXCEPTION
  WHEN OTHERS THEN
    manufacturing_security_pkg.clear_user_context;
    RAISE;
END;
/

COMMIT;

PROMPT Manufacturing live relational graph verified.
