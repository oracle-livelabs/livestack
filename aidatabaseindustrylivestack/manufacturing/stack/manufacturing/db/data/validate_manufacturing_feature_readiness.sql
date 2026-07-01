/*
 * validate_manufacturing_feature_readiness.sql
 * Reusable, SELECT-only acceptance for the native Oracle feature artifacts.
 *
 * This script intentionally performs no persistent DML or DDL. It is safe to
 * run during initial provisioning and on every READY container restart.
 */

WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET SERVEROUTPUT ON
SET DEFINE OFF

-- Priority-high objects repopulate after a database restart. POPULATE is an
-- idempotent IMCS memory operation and performs no persistent table DDL or DML.
BEGIN
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_PRODUCTION_SIGNALS');
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_WORK_ORDERS');
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_WORK_ORDER_LINES');
    DBMS_INMEMORY.POPULATE(USER, 'MANUFACTURING_DEMAND_FORECASTS');
END;
/

DECLARE
    v_completed PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1 .. 120 LOOP
        SELECT COUNT(*)
        INTO v_completed
        FROM manufacturing_inmemory_segments_v
        WHERE populate_status = 'COMPLETED'
          AND bytes_not_populated = 0
          AND inmemory_bytes > 0;
        EXIT WHEN v_completed = 4;
        DBMS_SESSION.SLEEP(1);
    END LOOP;

    IF v_completed <> 4 THEN
        RAISE_APPLICATION_ERROR(-20129, 'Database In-Memory segments did not repopulate after restart');
    END IF;
END;
/

ALTER SESSION SET INMEMORY_QUERY = ENABLE;
ALTER SESSION SET STATISTICS_LEVEL = ALL;

DECLARE
    TYPE t_momentum_codes IS TABLE OF manufacturing_production_signals.momentum_code%TYPE;
    TYPE t_numbers IS TABLE OF NUMBER;
    v_momentum_codes t_momentum_codes;
    v_signal_counts t_numbers;
    v_total_observations t_numbers;
    v_average_urgencies t_numbers;
    v_status manufacturing_inmemory_status_v.evidence_status%TYPE;
    v_sql_id manufacturing_inmemory_status_v.plan_proof_sql_id%TYPE;
    v_plan_lines PLS_INTEGER;
BEGIN
    manufacturing_security_pkg.set_user_context('analyst_raj');
    IF SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ROLE') <> 'analyst'
       OR SYS_CONTEXT('MANUFACTURING_APP_CTX', 'ACCESS_SCOPE') <> 'GLOBAL'
       OR SYS_CONTEXT('MANUFACTURING_APP_CTX', 'AUTHENTICATED') <> 'Y' THEN
        RAISE_APPLICATION_ERROR(-20127, 'In-Memory proof requires the global analyst application context');
    END IF;

    EXECUTE IMMEDIATE q'~
        SELECT /*+ GATHER_PLAN_STATISTICS FULL(signal) NO_INDEX(signal) */
               /* MANUFACTURING_INMEMORY_PROOF */
               signal.momentum_code,
               COUNT(*) AS signal_count,
               SUM(signal.observation_count) AS total_observations,
               ROUND(AVG(signal.urgency_score), 2) AS average_urgency
        FROM manufacturing_production_signals signal
        GROUP BY signal.momentum_code
    ~'
    BULK COLLECT INTO
        v_momentum_codes,
        v_signal_counts,
        v_total_observations,
        v_average_urgencies;

    IF v_momentum_codes.COUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20126, 'In-Memory proof query returned no production-signal rows');
    END IF;

    SELECT evidence_status, plan_proof_sql_id
    INTO v_status, v_sql_id
    FROM manufacturing_inmemory_status_v;

    SELECT COUNT(*)
    INTO v_plan_lines
    FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(v_sql_id, NULL, 'BASIC'))
    WHERE REGEXP_LIKE(plan_table_output, 'TABLE ACCESS[[:space:]]+INMEMORY FULL');

    IF v_status <> 'ACTIVE' OR v_plan_lines = 0 THEN
        RAISE_APPLICATION_ERROR(-20128, 'Database In-Memory runtime or DBMS_XPLAN proof is incomplete');
    END IF;

    manufacturing_security_pkg.clear_user_context;
EXCEPTION
    WHEN OTHERS THEN
        manufacturing_security_pkg.clear_user_context;
        RAISE;
END;
/

DECLARE
    v_model_count             PLS_INTEGER;
    v_current_oml_model_count PLS_INTEGER;
    v_vector_index_count      PLS_INTEGER;
    v_source_products         PLS_INTEGER;
    v_source_signals          PLS_INTEGER;
    v_escalated_signals       PLS_INTEGER;
    v_product_vectors         PLS_INTEGER;
    v_signal_vectors          PLS_INTEGER;
    v_semantic_matches        PLS_INTEGER;
    v_expected_matches        PLS_INTEGER;
    v_vector_column_count     PLS_INTEGER;
    v_invalid_product_vectors PLS_INTEGER;
    v_invalid_signal_vectors  PLS_INTEGER;
    v_invalid_signal_metrics  PLS_INTEGER;
    v_invalid_matches         PLS_INTEGER;
BEGIN
    manufacturing_security_pkg.set_user_context('analyst_raj');

    SELECT COUNT(*)
    INTO v_model_count
    FROM user_mining_models
    WHERE model_name = 'ALL_MINILM_L12_V2'
      AND mining_function = 'EMBEDDING';

    SELECT COUNT(*)
    INTO v_current_oml_model_count
    FROM user_mining_models model
    CROSS JOIN app_dataset_state dataset
    WHERE model.model_name IN (
        'DEMAND_SURGE_MODEL',
        'CUSTOMER_SEGMENT_MODEL',
        'REVENUE_PREDICT_MODEL',
        'PRODUCT_CLUSTER_MODEL'
    )
      AND dataset.state_id = 1
      AND CAST(model.creation_date AS DATE) >= CAST(dataset.updated_at AS DATE);

    SELECT COUNT(*)
    INTO v_vector_index_count
    FROM user_indexes
    WHERE index_name IN ('IDX_PRODUCT_VEC', 'IDX_MFG_SIGNAL_VEC')
      AND status = 'VALID';

    SELECT COUNT(*) INTO v_source_products FROM products;
    SELECT COUNT(*) INTO v_source_signals FROM manufacturing_production_signals;
    SELECT COUNT(*)
    INTO v_escalated_signals
    FROM manufacturing_production_signals
    WHERE momentum_code IN ('escalating', 'critical');
    SELECT COUNT(*) INTO v_product_vectors FROM product_embeddings;
    SELECT COUNT(*) INTO v_signal_vectors FROM manufacturing_signal_embeddings;
    SELECT COUNT(*) INTO v_semantic_matches FROM manufacturing_signal_part_matches;

    SELECT COUNT(*)
    INTO v_vector_column_count
    FROM user_tab_columns
    WHERE data_type = 'VECTOR'
      AND REPLACE(UPPER(vector_info), ' ', '') LIKE 'VECTOR(384,%'
      AND REPLACE(UPPER(vector_info), ' ', '') NOT LIKE '%,SPARSE)'
      AND (
          (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
          OR
          (table_name = 'MANUFACTURING_SIGNAL_EMBEDDINGS' AND column_name = 'EMBEDDING')
      );

    v_expected_matches := v_escalated_signals * LEAST(v_source_products, 3);

    SELECT COUNT(*)
    INTO v_invalid_product_vectors
    FROM product_embeddings vector_row
    WHERE vector_row.embedding IS NULL
       OR vector_row.embedding_text IS NULL
       OR vector_row.embedding_model <> 'all_MiniLM_L12_v2'
       OR NOT EXISTS (
            SELECT 1
            FROM products part
            WHERE part.product_id = vector_row.product_id
       );

    SELECT COUNT(*)
    INTO v_invalid_signal_vectors
    FROM manufacturing_signal_embeddings vector_row
    WHERE vector_row.embedding IS NULL
       OR vector_row.embedding_text IS NULL
       OR vector_row.embedding_model <> 'all_MiniLM_L12_v2'
       OR NOT EXISTS (
            SELECT 1
            FROM manufacturing_production_signals signal
            WHERE signal.production_signal_id = vector_row.production_signal_id
       );

    SELECT COUNT(*)
    INTO v_invalid_signal_metrics
    FROM manufacturing_production_signals signal
    WHERE signal.urgency_score IS NULL
       OR signal.urgency_score < 0
       OR signal.urgency_score > 100
       OR (signal.momentum_code = 'critical' AND signal.urgency_score < 90)
       OR (signal.momentum_code = 'escalating' AND signal.urgency_score NOT BETWEEN 75 AND 89.99)
       OR (signal.momentum_code = 'elevated' AND signal.urgency_score NOT BETWEEN 50 AND 74.99)
       OR (signal.momentum_code = 'stable' AND signal.urgency_score >= 50);

    WITH ranked_matches AS (
        SELECT signal_vector.production_signal_id,
               part_vector.product_id,
               ROUND(
                   1 - VECTOR_DISTANCE(
                       signal_vector.embedding,
                       part_vector.embedding,
                       COSINE
                   ),
                   5
               ) AS similarity_score,
               ROW_NUMBER() OVER (
                   PARTITION BY signal_vector.production_signal_id
                   ORDER BY VECTOR_DISTANCE(
                       signal_vector.embedding,
                       part_vector.embedding,
                       COSINE
                   ),
                   part_vector.product_id
               ) AS match_rank
        FROM manufacturing_signal_embeddings signal_vector
        JOIN manufacturing_production_signals signal
          ON signal.production_signal_id = signal_vector.production_signal_id
        CROSS JOIN product_embeddings part_vector
        WHERE signal.momentum_code IN ('escalating', 'critical')
    ),
    expected_matches AS (
        SELECT production_signal_id,
               product_id,
               similarity_score,
               match_rank
        FROM ranked_matches
        WHERE match_rank <= 3
    )
    SELECT COUNT(*)
    INTO v_invalid_matches
    FROM expected_matches expected
    FULL OUTER JOIN manufacturing_signal_part_matches actual
      ON actual.production_signal_id = expected.production_signal_id
     AND actual.manufactured_part_id = expected.product_id
    WHERE expected.production_signal_id IS NULL
       OR actual.signal_part_match_id IS NULL
       OR actual.match_method IS NULL
       OR actual.match_method <> 'vector'
       OR actual.match_rank IS NULL
       OR actual.match_rank <> expected.match_rank
       OR actual.similarity_score IS NULL
       OR actual.similarity_score <> expected.similarity_score;

    IF v_model_count <> 1
       OR v_current_oml_model_count <> 4
       OR v_vector_index_count <> 2
       OR v_source_products = 0
       OR v_source_signals = 0
       OR v_escalated_signals = 0
       OR v_product_vectors <> v_source_products
       OR v_signal_vectors <> v_source_signals
       OR v_semantic_matches <> v_expected_matches
       OR v_vector_column_count <> 2
       OR v_invalid_product_vectors <> 0
       OR v_invalid_signal_vectors <> 0
       OR v_invalid_signal_metrics <> 0
       OR v_invalid_matches <> 0 THEN
        RAISE_APPLICATION_ERROR(
            -20130,
            'Oracle AI Vector Search readiness is incomplete or stale'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Vector readiness verified: ' || v_product_vectors ||
        ' parts, ' || v_signal_vectors || ' signals, ' ||
        v_semantic_matches || ' ranked matches.'
    );
    manufacturing_security_pkg.clear_user_context;
EXCEPTION
    WHEN OTHERS THEN
        manufacturing_security_pkg.clear_user_context;
        RAISE;
END;
/

DECLARE
    v_active_source           app_dataset_state.active_source%TYPE;
    v_metadata_count          PLS_INTEGER;
    v_spatial_index_count     PLS_INTEGER;
    v_center_count            PLS_INTEGER;
    v_valid_centers           PLS_INTEGER;
    v_customer_count          PLS_INTEGER;
    v_geocoded_customers      PLS_INTEGER;
    v_valid_customers         PLS_INTEGER;
    v_invalid_customer_coords PLS_INTEGER;
    v_region_count            PLS_INTEGER;
    v_valid_regions           PLS_INTEGER;
    v_active_center_count     PLS_INTEGER;
    v_zone_count              PLS_INTEGER;
    v_valid_zones             PLS_INTEGER;
    v_shipment_count          PLS_INTEGER;
    v_valid_routes            PLS_INTEGER;
BEGIN
    manufacturing_security_pkg.set_user_context('analyst_raj');

    SELECT active_source
    INTO v_active_source
    FROM app_dataset_state
    WHERE state_id = 1;

    SELECT COUNT(*)
    INTO v_metadata_count
    FROM user_sdo_geom_metadata
    WHERE srid = 4326
      AND (table_name, column_name) IN (
          ('FULFILLMENT_CENTERS', 'LOCATION'),
          ('CUSTOMERS', 'LOCATION'),
          ('FULFILLMENT_ZONES', 'ZONE_BOUNDARY'),
          ('DEMAND_REGIONS', 'BOUNDARY')
      );

    SELECT COUNT(*)
    INTO v_spatial_index_count
    FROM user_indexes index_state
    JOIN user_ind_columns index_column
      ON index_column.index_name = index_state.index_name
     AND index_column.table_name = index_state.table_name
     AND index_column.column_position = 1
    WHERE index_state.ityp_owner = 'MDSYS'
      AND index_state.ityp_name = 'SPATIAL_INDEX_V2'
      AND index_state.status = 'VALID'
      AND index_state.domidx_status = 'VALID'
      AND index_state.domidx_opstatus = 'VALID'
      AND (
           (index_state.index_name = 'IDX_FC_SPATIAL'
            AND index_state.table_name = 'FULFILLMENT_CENTERS'
            AND index_column.column_name = 'LOCATION')
        OR (index_state.index_name = 'IDX_CUST_SPATIAL'
            AND index_state.table_name = 'CUSTOMERS'
            AND index_column.column_name = 'LOCATION')
        OR (index_state.index_name = 'IDX_ZONES_BOUNDARY'
            AND index_state.table_name = 'FULFILLMENT_ZONES'
            AND index_column.column_name = 'ZONE_BOUNDARY')
      );

    SELECT COUNT(*) INTO v_center_count FROM fulfillment_centers;
    SELECT COUNT(*) INTO v_active_center_count
    FROM fulfillment_centers
    WHERE is_active = 1;
    SELECT COUNT(*)
    INTO v_valid_centers
    FROM fulfillment_centers center
    JOIN user_sdo_geom_metadata metadata
      ON metadata.table_name = 'FULFILLMENT_CENTERS'
     AND metadata.column_name = 'LOCATION'
     AND metadata.srid = 4326
    WHERE center.location IS NOT NULL
      AND center.location.sdo_gtype = 2001
      AND center.location.sdo_srid = 4326
      AND ABS(center.location.sdo_point.x - center.longitude) <= 0.000000001
      AND ABS(center.location.sdo_point.y - center.latitude) <= 0.000000001
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            center.location,
            metadata.diminfo
          ) = 'TRUE';

    SELECT COUNT(*) INTO v_customer_count FROM customers;
    SELECT COUNT(*)
    INTO v_geocoded_customers
    FROM customers
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL;
    SELECT COUNT(*)
    INTO v_invalid_customer_coords
    FROM customers
    WHERE (latitude IS NULL AND longitude IS NOT NULL)
       OR (latitude IS NOT NULL AND longitude IS NULL)
       OR latitude < -90
       OR latitude > 90
       OR longitude < -180
       OR longitude > 180
       OR (latitude IS NULL AND longitude IS NULL AND location IS NOT NULL);
    SELECT COUNT(*)
    INTO v_valid_customers
    FROM customers customer
    JOIN user_sdo_geom_metadata metadata
      ON metadata.table_name = 'CUSTOMERS'
     AND metadata.column_name = 'LOCATION'
     AND metadata.srid = 4326
    WHERE customer.latitude IS NOT NULL
      AND customer.longitude IS NOT NULL
      AND customer.location IS NOT NULL
      AND customer.location.sdo_gtype = 2001
      AND customer.location.sdo_srid = 4326
      AND ABS(customer.location.sdo_point.x - customer.longitude) <= 0.000000001
      AND ABS(customer.location.sdo_point.y - customer.latitude) <= 0.000000001
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            customer.location,
            metadata.diminfo
          ) = 'TRUE';

    SELECT COUNT(*) INTO v_region_count FROM demand_regions;
    SELECT COUNT(*)
    INTO v_valid_regions
    FROM demand_regions region
    JOIN user_sdo_geom_metadata metadata
      ON metadata.table_name = 'DEMAND_REGIONS'
     AND metadata.column_name = 'BOUNDARY'
     AND metadata.srid = 4326
    WHERE region.boundary IS NOT NULL
      AND region.boundary.sdo_gtype IN (2003, 2007)
      AND region.boundary.sdo_srid = 4326
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            region.boundary,
            metadata.diminfo
          ) = 'TRUE';

    SELECT COUNT(*) INTO v_zone_count FROM fulfillment_zones;
    SELECT COUNT(*)
    INTO v_valid_zones
    FROM fulfillment_zones zone
    JOIN fulfillment_centers center
      ON center.center_id = zone.center_id
     AND center.is_active = 1
    JOIN user_sdo_geom_metadata metadata
      ON metadata.table_name = 'FULFILLMENT_ZONES'
     AND metadata.column_name = 'ZONE_BOUNDARY'
     AND metadata.srid = 4326
    WHERE zone.zone_boundary IS NOT NULL
      AND zone.zone_boundary.sdo_gtype = 2003
      AND zone.zone_boundary.sdo_srid = 4326
      AND SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(
            zone.zone_boundary,
            metadata.diminfo
          ) = 'TRUE'
      AND SDO_GEOM.RELATE(
            zone.zone_boundary,
            'EQUAL',
            SDO_GEOM.SDO_BUFFER(
                center.location,
                CASE zone.zone_type
                    WHEN 'express' THEN 80000
                    WHEN 'overnight' THEN 160000
                    WHEN 'standard' THEN 250000
                    WHEN 'economy' THEN 500000
                END,
                1,
                'unit=METER'
            ),
            0.005
          ) = 'EQUAL';

    SELECT COUNT(*) INTO v_shipment_count FROM shipments;
    SELECT COUNT(*)
    INTO v_valid_routes
    FROM (
        SELECT shipment.distance_km,
               shipment.estimated_hours,
               ROUND(
                   SDO_GEOM.SDO_DISTANCE(
                       customer.location,
                       center.location,
                       0.005,
                       'unit=MILE'
                   ) * 1.60934,
                   2
               ) AS expected_distance_km,
               ROUND(
                   SDO_GEOM.SDO_DISTANCE(
                       customer.location,
                       center.location,
                       0.005,
                       'unit=MILE'
                   ) / 55,
                   1
               ) AS expected_hours
        FROM shipments shipment
        JOIN manufacturing_work_orders work_order
          ON work_order.work_order_id = shipment.work_order_id
        JOIN customers customer
          ON customer.customer_id = work_order.customer_account_id
        JOIN fulfillment_centers center
          ON center.center_id = shipment.center_id
    ) route
    WHERE route.distance_km IS NOT NULL
      AND route.estimated_hours IS NOT NULL
      AND route.distance_km = route.expected_distance_km
      AND route.estimated_hours = route.expected_hours;

    IF v_metadata_count <> 4
       OR v_spatial_index_count <> 3
       OR v_center_count = 0
       OR v_valid_centers <> v_center_count
       OR v_customer_count = 0
       OR v_invalid_customer_coords <> 0
       OR v_valid_customers <> v_geocoded_customers
       OR (v_active_source = 'demo' AND v_region_count = 0)
       OR v_valid_regions <> v_region_count
       OR v_active_center_count = 0
       OR v_zone_count <> v_active_center_count * 4
       OR v_valid_zones <> v_zone_count
       OR v_shipment_count = 0
       OR v_valid_routes <> v_shipment_count THEN
        RAISE_APPLICATION_ERROR(
            -20131,
            'Oracle Spatial readiness is incomplete or stale'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Spatial readiness verified: ' || v_valid_centers ||
        ' plants, ' || v_valid_customers || ' customers, ' ||
        v_valid_regions || ' regions, ' || v_valid_zones ||
        ' zones, ' || v_valid_routes || ' routes.'
    );
    manufacturing_security_pkg.clear_user_context;
EXCEPTION
    WHEN OTHERS THEN
        manufacturing_security_pkg.clear_user_context;
        RAISE;
END;
/

DECLARE
    v_active_source            app_dataset_state.active_source%TYPE;
    v_active_version           app_dataset_state.active_version%TYPE;
    v_dataset_updated_at       app_dataset_state.updated_at%TYPE;
    v_state_source             manufacturing_graph_state.dataset_source%TYPE;
    v_state_version            manufacturing_graph_state.dataset_version%TYPE;
    v_state_entity_count       PLS_INTEGER;
    v_state_relationship_count PLS_INTEGER;
    v_graph_loaded_at          manufacturing_graph_state.loaded_at%TYPE;
    v_entity_count             PLS_INTEGER;
    v_expected_entity_count    PLS_INTEGER;
    v_relationship_count       PLS_INTEGER;
    v_invalid_provenance       PLS_INTEGER;
    v_duplicate_source_links   PLS_INTEGER;
    v_access_count             PLS_INTEGER;
    v_invalid_access           PLS_INTEGER;
    v_graph_count              PLS_INTEGER;
    v_traversed_edges          PLS_INTEGER;
    v_canonical_paths          PLS_INTEGER;
BEGIN
    manufacturing_security_pkg.set_user_context('analyst_raj');

    SELECT active_source,
           COALESCE(active_version, 'v1'),
           updated_at
    INTO v_active_source,
         v_active_version,
         v_dataset_updated_at
    FROM app_dataset_state
    WHERE state_id = 1;

    SELECT dataset_source,
           dataset_version,
           entity_count,
           relationship_count,
           loaded_at
    INTO v_state_source,
         v_state_version,
         v_state_entity_count,
         v_state_relationship_count,
         v_graph_loaded_at
    FROM manufacturing_graph_state
    WHERE graph_name = 'MANUFACTURING_PRODUCTION_NETWORK';

    SELECT COUNT(*) INTO v_entity_count
    FROM manufacturing_graph_entities;
    SELECT (
             (SELECT COUNT(*) FROM manufacturing_suppliers) +
             (SELECT COUNT(*) FROM products) +
             (SELECT COUNT(*) FROM fulfillment_centers) +
             (SELECT COUNT(*) FROM manufacturing_work_orders) +
             (SELECT COUNT(*) FROM manufacturing_production_signals)
           )
    INTO v_expected_entity_count
    FROM dual;
    SELECT COUNT(*) INTO v_relationship_count
    FROM manufacturing_graph_relationships;

    SELECT COUNT(*)
    INTO v_invalid_provenance
    FROM manufacturing_graph_entities entity
    WHERE entity.dataset_version <> v_active_version
       OR entity.source_object IS NULL
       OR entity.source_key IS NULL
       OR (
            entity.source_object = 'MANUFACTURING_SUPPLIERS'
            AND NOT EXISTS (
                SELECT 1
                FROM manufacturing_suppliers supplier
                WHERE TO_CHAR(supplier.supplier_id, 'TM9') = entity.source_key
            )
       )
       OR (
            entity.source_object = 'PRODUCTS'
            AND NOT EXISTS (
                SELECT 1
                FROM products part
                WHERE TO_CHAR(part.product_id, 'TM9') = entity.source_key
            )
       )
       OR (
            entity.source_object = 'FULFILLMENT_CENTERS'
            AND NOT EXISTS (
                SELECT 1
                FROM fulfillment_centers center
                WHERE TO_CHAR(center.center_id, 'TM9') = entity.source_key
            )
       )
       OR (
            entity.source_object = 'MANUFACTURING_WORK_ORDERS'
            AND NOT EXISTS (
                SELECT 1
                FROM manufacturing_work_orders work_order
                WHERE TO_CHAR(work_order.work_order_id, 'TM9') = entity.source_key
            )
       )
       OR (
            entity.source_object = 'MANUFACTURING_PRODUCTION_SIGNALS'
            AND NOT EXISTS (
                SELECT 1
                FROM manufacturing_production_signals signal
                WHERE TO_CHAR(signal.production_signal_id, 'TM9') = entity.source_key
            )
       )
       OR entity.entity_type <> CASE entity.source_object
            WHEN 'MANUFACTURING_SUPPLIERS' THEN 'supplier'
            WHEN 'PRODUCTS' THEN 'part'
            WHEN 'FULFILLMENT_CENTERS' THEN 'plant'
            WHEN 'MANUFACTURING_WORK_ORDERS' THEN 'work_order'
            WHEN 'MANUFACTURING_PRODUCTION_SIGNALS' THEN 'production_signal'
          END;

    SELECT COUNT(*)
    INTO v_duplicate_source_links
    FROM (
        SELECT source_object,
               source_key
        FROM manufacturing_graph_entities
        GROUP BY source_object, source_key
        HAVING COUNT(*) <> 1
    );

    SELECT COUNT(*)
    INTO v_access_count
    FROM manufacturing_graph_entity_access;

    SELECT COUNT(*)
    INTO v_invalid_access
    FROM manufacturing_graph_entity_access access_row
    JOIN manufacturing_graph_entities entity
      ON entity.entity_id = access_row.graph_entity_id
    WHERE access_row.region_code NOT IN ('CA', 'NJ', 'GA')
       OR access_row.access_basis IS NULL
       OR CASE entity.source_object
            WHEN 'FULFILLMENT_CENTERS' THEN
              CASE WHEN access_row.access_basis LIKE 'LIVE_PLANT_STATE:%'
                   THEN 0 ELSE 1 END
            WHEN 'MANUFACTURING_WORK_ORDERS' THEN
              CASE WHEN access_row.access_basis LIKE 'LIVE_ORDER_CENTER_STATE:%'
                   THEN 0 ELSE 1 END
            WHEN 'PRODUCTS' THEN
              CASE WHEN access_row.access_basis LIKE 'LIVE_PART_INVENTORY_STATE:%'
                   THEN 0 ELSE 1 END
            WHEN 'MANUFACTURING_SUPPLIERS' THEN
              CASE WHEN access_row.access_basis LIKE 'LIVE_SUPPLIER_INVENTORY_STATE:%'
                   THEN 0 ELSE 1 END
            WHEN 'MANUFACTURING_PRODUCTION_SIGNALS' THEN
              CASE WHEN access_row.access_basis LIKE 'LIVE_SIGNAL_PART_STATE:%'
                     OR access_row.access_basis LIKE 'LIVE_SIGNAL_ACCOUNT_REGION:%'
                   THEN 0 ELSE 1 END
            ELSE 1
          END <> 0;

    SELECT COUNT(*)
    INTO v_graph_count
    FROM user_property_graphs
    WHERE graph_name = 'MANUFACTURING_PRODUCTION_NETWORK'
      AND graph_mode = 'ENFORCED';

    SELECT COUNT(*)
    INTO v_traversed_edges
    FROM GRAPH_TABLE (
        manufacturing_production_network
        MATCH
          (source_entity IS manufacturing_entity)
          -[production_edge IS production_link]->
          (target_entity IS manufacturing_entity)
        COLUMNS (
          production_edge.relationship_id AS relationship_id
        )
    );

    SELECT COUNT(*)
    INTO v_canonical_paths
    FROM GRAPH_TABLE (
        manufacturing_production_network
        MATCH
          (supplier IS manufacturing_entity)
          -[production IS production_link]->
          (part IS manufacturing_entity)
          -[constraint_edge IS production_link]->
          (work_order IS manufacturing_entity)
        WHERE supplier.entity_type = 'supplier'
          AND part.entity_type = 'part'
          AND work_order.entity_type = 'work_order'
          AND production.relationship_type = 'produces_part'
          AND constraint_edge.relationship_type = 'constrains_work_order'
        COLUMNS (
          supplier.entity_key AS supplier_key,
          work_order.entity_key AS work_order_key
        )
    );

    IF v_active_source <> v_state_source
       OR v_active_version <> v_state_version
       OR v_graph_loaded_at < v_dataset_updated_at
       OR v_entity_count = 0
       OR v_entity_count <> v_expected_entity_count
       OR v_relationship_count = 0
       OR v_state_entity_count <> v_entity_count
       OR v_state_relationship_count <> v_relationship_count
       OR v_invalid_provenance <> 0
       OR v_duplicate_source_links <> 0
       OR v_invalid_access <> 0
       OR (v_active_source = 'demo' AND v_access_count = 0)
       OR v_graph_count <> 1
       OR v_traversed_edges <> v_relationship_count
       OR v_canonical_paths = 0 THEN
        RAISE_APPLICATION_ERROR(
            -20132,
            'Oracle SQL Property Graph readiness is incomplete or stale'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Graph readiness verified: ' || v_entity_count ||
        ' entities, ' || v_traversed_edges ||
        ' traversed relationships, ' || v_canonical_paths ||
        ' supplier-to-work-order paths.'
    );
    manufacturing_security_pkg.clear_user_context;
EXCEPTION
    WHEN OTHERS THEN
        manufacturing_security_pkg.clear_user_context;
        RAISE;
END;
/

PROMPT Manufacturing Vector, Spatial, and SQL Property Graph readiness verified.
