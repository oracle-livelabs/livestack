/*
 * Fresh and retained bootstrap readiness publication.
 *
 * This script must run in the same schema-owner session after
 * RETAIL_SECURITY_PKG has established the trusted Admin context. It never
 * reloads base fixtures or OML models. It proves the current active
 * generation's Vector, Spatial, and In-Memory cursors by exact SQL ID/child,
 * proves correlated allowed and VPD-denied Unified Audit outcomes, persists
 * those proofs, validates the complete readiness shape, and only then
 * publishes APP_DATASET_READINESS.
 */
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

DECLARE
    v_generation app_dataset_state.active_generation_id%TYPE;
    v_fingerprint app_inmemory_generation_evidence.dataset_fingerprint%TYPE;
BEGIN
    SELECT state.active_generation_id,
           CASE
             WHEN state.active_generation_id = 'bootstrap-v1' THEN
               RAWTOHEX(STANDARD_HASH('bootstrap-v1', 'SHA256'))
             ELSE evidence.dataset_fingerprint
           END
    INTO v_generation, v_fingerprint
    FROM app_dataset_state state
    LEFT JOIN app_inmemory_generation_evidence evidence
      ON evidence.generation_id = state.active_generation_id
    WHERE state.state_id = 1;

    IF v_generation IS NULL
       OR v_fingerprint IS NULL
       OR NOT REGEXP_LIKE(v_fingerprint, '^[[:xdigit:]]{64}$') THEN
        RAISE_APPLICATION_ERROR(
          -20520,
          'Active generation and authoritative dataset fingerprint are required'
        );
    END IF;
END;
/

DECLARE
    v_vector_rows PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_vector_rows
    FROM product_embeddings
    WHERE embedding IS NOT NULL;
    IF v_vector_rows < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20536,
          'A nonempty product Vector execution is required before readiness'
        );
    END IF;
END;
/

/*
 * A brand-new IVF index can expose its catalog binding before Oracle has
 * opened the generated centroid/partition objects for a query cursor. Warm
 * the index with a separate cursor first; the marked cursor below remains the
 * exact, fail-closed readiness proof. Retained databases simply reuse their
 * already-initialized IVF structures.
 */
SELECT product_id, distance_score
FROM (
  SELECT /*+ GATHER_PLAN_STATISTICS
             VECTOR_INDEX_TRANSFORM(embeddings IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
         /* RETAIL_VECTOR_BOOTSTRAP_WARMUP */
         embeddings.product_id,
         VECTOR_DISTANCE(
           embeddings.embedding,
           VECTOR_EMBEDDING(
             ALL_MINILM_L12_V2 USING
             'outdoor trail footwear and sporting goods' AS DATA
           ),
           COSINE
         ) distance_score
  FROM product_embeddings embeddings
  ORDER BY distance_score
  FETCH APPROXIMATE FIRST 5 ROWS ONLY
)
ORDER BY distance_score, product_id;

BEGIN
  DBMS_APPLICATION_INFO.SET_MODULE('RETAIL_BOOTSTRAP', 'VECTOR_REPROOF');
END;
/

SET SERVEROUTPUT OFF

SELECT product_id, distance_score
FROM (
  SELECT /*+ GATHER_PLAN_STATISTICS
             VECTOR_INDEX_TRANSFORM(embeddings IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
         /* RETAIL_VECTOR_BOOTSTRAP_REPROOF */
         embeddings.product_id,
         VECTOR_DISTANCE(
           embeddings.embedding,
           VECTOR_EMBEDDING(
             ALL_MINILM_L12_V2 USING
             'outdoor trail footwear and sporting goods' AS DATA
           ),
           COSINE
         ) distance_score
  FROM product_embeddings embeddings
  ORDER BY distance_score
  FETCH APPROXIMATE FIRST 5 ROWS ONLY
)
ORDER BY distance_score, product_id;

DECLARE
    v_generation app_dataset_state.active_generation_id%TYPE;
    v_fingerprint app_inmemory_generation_evidence.dataset_fingerprint%TYPE;
    v_sql_id VARCHAR2(13);
    v_child_number NUMBER;
    v_display_rows PLS_INTEGER := 0;
    v_operation VARCHAR2(100);
    v_object_owner VARCHAR2(128);
    v_plan_object VARCHAR2(128);
    v_index_name VARCHAR2(128);
    v_index_binding_count PLS_INTEGER;
    v_vector_result_rows NUMBER;
    v_vector_result_count NUMBER;
    v_vector_full_scan_count PLS_INTEGER;
    v_vector_expected_index_count PLS_INTEGER;
    v_vector_unexpected_index_count PLS_INTEGER;
    v_vector_centroid_count PLS_INTEGER;
    v_vector_partition_count PLS_INTEGER;
    v_vector_unexpected_ivf_count PLS_INTEGER;
    v_vector_centroid_name VARCHAR2(128);
    v_vector_partition_name VARCHAR2(128);
    v_vector_centroid_owner VARCHAR2(128);
    v_vector_partition_owner VARCHAR2(128);
    v_vector_centroid_stem VARCHAR2(128);
    v_vector_partition_stem VARCHAR2(128);
    v_vector_plan_hash_value NUMBER;
    v_vector_plan_row_count PLS_INTEGER := 0;
BEGIN
    SELECT prev_sql_id, prev_child_number
    INTO v_sql_id, v_child_number
    FROM sys.v_$session
    WHERE audsid = SYS_CONTEXT('USERENV', 'SESSIONID');

    IF NOT REGEXP_LIKE(v_sql_id, '^[0-9a-z]{13}$', 'c')
       OR v_child_number IS NULL
       OR v_child_number < 0
       OR TRUNC(v_child_number) <> v_child_number THEN
        RAISE_APPLICATION_ERROR(-20521, 'Vector cursor identity is unavailable');
    END IF;

    /* Cursor metadata publication can lag execution briefly after fresh DDL. */
    FOR v_attempt IN 1..40 LOOP
      SELECT MAX(plan_hash_value)
      INTO v_vector_plan_hash_value
      FROM sys.v_$sql
      WHERE sql_id = v_sql_id
        AND child_number = v_child_number;
      EXIT WHEN v_vector_plan_hash_value IS NOT NULL;
      DBMS_SESSION.SLEEP(0.25);
    END LOOP;
    IF v_vector_plan_hash_value IS NULL
       OR v_vector_plan_hash_value < 0 THEN
        RAISE_APPLICATION_ERROR(
          -20547,
          'Vector exact child has no Oracle PLAN_HASH_VALUE'
        );
    END IF;

    FOR v_attempt IN 1..40 LOOP
      SELECT COUNT(*)
      INTO v_vector_plan_row_count
      FROM sys.v_$sql_plan
      WHERE sql_id = v_sql_id
        AND child_number = v_child_number;
      EXIT WHEN v_vector_plan_row_count > 0;
      DBMS_SESSION.SLEEP(0.25);
    END LOOP;
    IF v_vector_plan_row_count < 1 THEN
        RAISE_APPLICATION_ERROR(-20522, 'Vector exact cursor plan is unavailable');
    END IF;

    FOR plan_line IN (
      SELECT plan_table_output
      FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
          v_sql_id, v_child_number, 'BASIC +ALIAS +PREDICATE'
        ))
    ) LOOP
      v_display_rows := v_display_rows + 1;
      DBMS_OUTPUT.PUT_LINE('RETAIL_VECTOR_PLAN ' || plan_line.plan_table_output);
    END LOOP;
    IF v_display_rows = 0 THEN
        RAISE_APPLICATION_ERROR(-20522, 'Vector exact cursor plan is unavailable');
    END IF;

    SELECT NVL(MAX(CASE WHEN id = 0 THEN last_output_rows END), 0)
    INTO v_vector_result_rows
    FROM sys.v_$sql_plan_statistics_all
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number;
    /* Oracle Free :latest can omit LAST_OUTPUT_ROWS for SQL*Plus cursors. */
    IF v_vector_result_rows < 1 THEN
        SELECT COUNT(*)
        INTO v_vector_result_count
        FROM (
          SELECT /*+ VECTOR_INDEX_TRANSFORM(embeddings IDX_PRODUCT_VEC PRE_FILTER_WITHOUT_JOIN_BACK) */
                 /* RETAIL_VECTOR_RESULT_COUNT_REPROOF */ embeddings.product_id
          FROM product_embeddings embeddings
          ORDER BY VECTOR_DISTANCE(
            embeddings.embedding,
            VECTOR_EMBEDDING(
              ALL_MINILM_L12_V2 USING
              'outdoor trail footwear and sporting goods' AS DATA
            ),
            COSINE
          )
          FETCH APPROXIMATE FIRST 5 ROWS ONLY
        );
        v_vector_result_rows := v_vector_result_count;
    END IF;
    IF v_vector_result_rows < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20538,
          'Vector exact cursor must return nonempty current rows'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_vector_full_scan_count
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND object_name = 'PRODUCT_EMBEDDINGS'
      AND TRIM(UPPER(operation)) LIKE 'TABLE ACCESS%'
      AND INSTR(UPPER(NVL(options, '')), 'FULL') > 0;
    IF v_vector_full_scan_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20539,
          'Vector exact cursor contains a PRODUCT_EMBEDDINGS full scan'
        );
    END IF;

    SELECT COUNT(*),
           MAX(TRIM(operation || CASE WHEN options IS NOT NULL
                                      THEN ' ' || options END)),
           MAX(object_owner)
    INTO v_vector_expected_index_count,
         v_operation,
         v_object_owner
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND UPPER(TRIM(operation)) = 'VECTOR INDEX'
      AND UPPER(TRIM(NVL(options, ''))) = 'IVF SCAN'
      AND UPPER(NVL(object_name, '<NULL>')) = 'IDX_PRODUCT_VEC';

    SELECT COUNT(*)
    INTO v_vector_unexpected_index_count
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND INSTR(
            UPPER(NVL(operation, '') || ' ' || NVL(options, '')),
            'VECTOR INDEX'
          ) > 0
      AND (
        UPPER(TRIM(NVL(operation, '<NULL>'))) <> 'VECTOR INDEX'
        OR UPPER(TRIM(NVL(options, '<NULL>'))) <> 'IVF SCAN'
        OR UPPER(NVL(object_name, '<NULL>')) <> 'IDX_PRODUCT_VEC'
      );

    SELECT COUNT(*), MAX(object_name), MAX(object_owner)
    INTO v_vector_centroid_count,
         v_vector_centroid_name,
         v_vector_centroid_owner
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND REGEXP_LIKE(
            UPPER(NVL(object_name, '')),
            '^VECTOR\$IDX_PRODUCT_VEC\$[0-9]+(_[0-9]+)*\$IVF_FLAT_CENTROIDS$'
          );

    SELECT COUNT(*), MAX(object_name), MAX(object_owner)
    INTO v_vector_partition_count,
         v_vector_partition_name,
         v_vector_partition_owner
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND REGEXP_LIKE(
            UPPER(NVL(object_name, '')),
            '^VECTOR\$IDX_PRODUCT_VEC\$[0-9]+(_[0-9]+)*\$(IVF_FLAT_)?CENTROID_PARTITIONS$'
          );

    SELECT COUNT(*)
    INTO v_vector_unexpected_ivf_count
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND UPPER(NVL(object_name, '')) LIKE 'VECTOR$%'
      AND INSTR(UPPER(NVL(object_name, '')), '$IVF_') > 0
      AND NOT REGEXP_LIKE(
            UPPER(NVL(object_name, '')),
            '^VECTOR\$IDX_PRODUCT_VEC\$[0-9]+(_[0-9]+)*\$(IVF_FLAT_CENTROIDS|(IVF_FLAT_)?CENTROID_PARTITIONS)$'
          );

    IF v_vector_unexpected_index_count <> 0
       OR v_vector_unexpected_ivf_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20550,
          'Vector cursor exposed an unexpected Vector index row or IVF object'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_index_binding_count
    FROM user_indexes indexes
    JOIN user_ind_columns columns
      ON columns.index_name = indexes.index_name
    WHERE indexes.index_name = 'IDX_PRODUCT_VEC'
      AND indexes.index_type = 'VECTOR'
      AND indexes.status = 'VALID'
      AND columns.table_name = 'PRODUCT_EMBEDDINGS'
      AND columns.column_name = 'EMBEDDING'
      AND columns.column_position = 1;
    IF v_index_binding_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20537,
          'IDX_PRODUCT_VEC must be VALID on PRODUCT_EMBEDDINGS.EMBEDDING'
        );
    END IF;

    IF v_vector_centroid_count = 1 AND v_vector_partition_count = 1 THEN
      v_vector_centroid_stem := REGEXP_REPLACE(
        UPPER(v_vector_centroid_name),
        '\$IVF_FLAT_CENTROIDS$'
      );
      v_vector_partition_stem := REGEXP_REPLACE(
        UPPER(v_vector_partition_name),
        '\$(IVF_FLAT_)?CENTROID_PARTITIONS$'
      );
    END IF;

    IF v_vector_expected_index_count = 1
       AND v_vector_centroid_count = 0
       AND v_vector_partition_count = 0 THEN
      v_plan_object := 'PRODUCT_EMBEDDINGS';
      v_index_name := 'IDX_PRODUCT_VEC';
    ELSIF v_vector_expected_index_count = 0
          AND v_vector_centroid_count = 1
          AND v_vector_partition_count = 1
          AND v_vector_centroid_stem = v_vector_partition_stem
          AND UPPER(v_vector_centroid_owner) = USER
          AND UPPER(v_vector_partition_owner) = USER THEN
      v_operation := 'VECTOR INDEX IVF INTERNAL OBJECT PAIR';
      v_object_owner := USER;
      v_plan_object := 'PRODUCT_EMBEDDINGS';
      v_index_name := 'IDX_PRODUCT_VEC';
    ELSE
      RAISE_APPLICATION_ERROR(
        -20523,
        'Vector exact cursor did not expose one exact IDX_PRODUCT_VEC IVF plan: ' ||
        'direct=' || v_vector_expected_index_count ||
        ', centroid=' || v_vector_centroid_count ||
        ', partition=' || v_vector_partition_count ||
        ', centroid_name=' || NVL(v_vector_centroid_name, '<NULL>') ||
        ', partition_name=' || NVL(v_vector_partition_name, '<NULL>')
      );
    END IF;

    SELECT state.active_generation_id,
           CASE
             WHEN state.active_generation_id = 'bootstrap-v1' THEN
               RAWTOHEX(STANDARD_HASH('bootstrap-v1', 'SHA256'))
             ELSE evidence.dataset_fingerprint
           END
    INTO v_generation, v_fingerprint
    FROM app_dataset_state state
    LEFT JOIN app_inmemory_generation_evidence evidence
      ON evidence.generation_id = state.active_generation_id
    WHERE state.state_id = 1;

    IF v_generation IS NULL OR v_fingerprint IS NULL THEN
        RAISE_APPLICATION_ERROR(
          -20540,
          'Vector plan publication requires generation and fingerprint'
        );
    END IF;

    MERGE INTO app_feature_plan_evidence target
    USING (
      SELECT v_generation generation_id, 'VECTOR' feature_name,
             v_fingerprint dataset_fingerprint, v_sql_id sql_id,
             v_child_number child_number,
             v_vector_plan_hash_value plan_hash_value,
             v_operation plan_operation,
             v_object_owner object_owner
      FROM dual
    ) source
    ON (target.generation_id = source.generation_id
        AND target.feature_name = source.feature_name)
    WHEN MATCHED THEN UPDATE SET
      target.job_id = NULL,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.plan_operation = source.plan_operation,
      target.object_owner = source.object_owner,
      target.object_name = 'PRODUCT_EMBEDDINGS',
      target.index_name = v_index_name,
      target.verified_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (
      generation_id, feature_name, job_id, dataset_fingerprint,
      sql_id, child_number, plan_hash_value, plan_operation, object_owner,
      object_name, index_name, verified_at
    ) VALUES (
      source.generation_id, source.feature_name, NULL,
      source.dataset_fingerprint, source.sql_id, source.child_number,
      source.plan_hash_value, source.plan_operation, source.object_owner,
      'PRODUCT_EMBEDDINGS', v_index_name, SYSTIMESTAMP
    );
EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(
        -20523,
        'Vector exact cursor did not use IDX_PRODUCT_VEC'
      );
END;
/

SELECT /* RETAIL_SPATIAL_BOOTSTRAP_WARMUP */
       center.center_id
FROM fulfillment_centers center
CROSS JOIN (
  SELECT location
  FROM customers
  WHERE location IS NOT NULL
  ORDER BY customer_id
  FETCH FIRST 1 ROW ONLY
) customer
WHERE center.location IS NOT NULL
  AND SDO_NN(
    center.location,
    customer.location,
    'sdo_num_res=5',
    1
  ) = 'TRUE'
ORDER BY SDO_GEOM.SDO_DISTANCE(
  customer.location, center.location, 0.005, 'unit=KM'
), center.center_id
FETCH FIRST 5 ROWS ONLY;

SET SERVEROUTPUT ON

BEGIN
  DBMS_APPLICATION_INFO.SET_ACTION('SPATIAL_REPROOF');
END;
/

SET SERVEROUTPUT OFF

SELECT /*+ GATHER_PLAN_STATISTICS */
       /* RETAIL_SPATIAL_BOOTSTRAP_REPROOF */
       center.center_id
FROM fulfillment_centers center
CROSS JOIN (
  SELECT location
  FROM customers
  WHERE location IS NOT NULL
  ORDER BY customer_id
  FETCH FIRST 1 ROW ONLY
) customer
WHERE center.location IS NOT NULL
  AND SDO_NN(
    center.location,
    customer.location,
    'sdo_num_res=5',
    1
  ) = 'TRUE'
ORDER BY SDO_GEOM.SDO_DISTANCE(
  customer.location, center.location, 0.005, 'unit=KM'
), center.center_id
FETCH FIRST 5 ROWS ONLY;

DECLARE
    v_generation app_dataset_state.active_generation_id%TYPE;
    v_fingerprint app_inmemory_generation_evidence.dataset_fingerprint%TYPE;
    v_sql_id VARCHAR2(13);
    v_child_number NUMBER;
    v_display_rows PLS_INTEGER := 0;
    v_operation VARCHAR2(100);
    v_object_owner VARCHAR2(128);
    v_spatial_result_rows NUMBER;
    v_spatial_full_scan_count PLS_INTEGER;
    v_spatial_expected_index_count PLS_INTEGER;
    v_spatial_unexpected_index_count PLS_INTEGER;
    v_spatial_domain_index_count PLS_INTEGER;
    v_spatial_null_owner_index_count PLS_INTEGER;
    v_spatial_index_binding_count PLS_INTEGER;
    v_spatial_metadata_count PLS_INTEGER;
    v_spatial_plan_hash_value NUMBER;
    v_spatial_plan_row_count PLS_INTEGER := 0;
    v_spatial_result_count NUMBER;
BEGIN
    SELECT prev_sql_id, prev_child_number
    INTO v_sql_id, v_child_number
    FROM sys.v_$session
    WHERE audsid = SYS_CONTEXT('USERENV', 'SESSIONID');

    IF NOT REGEXP_LIKE(v_sql_id, '^[0-9a-z]{13}$', 'c')
       OR v_child_number IS NULL
       OR v_child_number < 0
       OR TRUNC(v_child_number) <> v_child_number THEN
        RAISE_APPLICATION_ERROR(-20524, 'Spatial cursor identity is unavailable');
    END IF;

    /* Preserve the exact child while allowing its catalog row to publish. */
    FOR v_attempt IN 1..40 LOOP
      SELECT MAX(plan_hash_value)
      INTO v_spatial_plan_hash_value
      FROM sys.v_$sql
      WHERE sql_id = v_sql_id
        AND child_number = v_child_number;
      EXIT WHEN v_spatial_plan_hash_value IS NOT NULL;
      DBMS_SESSION.SLEEP(0.25);
    END LOOP;
    IF v_spatial_plan_hash_value IS NULL
       OR v_spatial_plan_hash_value < 0 THEN
        RAISE_APPLICATION_ERROR(
          -20548,
          'Spatial exact child has no Oracle PLAN_HASH_VALUE'
        );
    END IF;

    FOR v_attempt IN 1..40 LOOP
      SELECT COUNT(*)
      INTO v_spatial_plan_row_count
      FROM sys.v_$sql_plan
      WHERE sql_id = v_sql_id
        AND child_number = v_child_number;
      EXIT WHEN v_spatial_plan_row_count > 0;
      DBMS_SESSION.SLEEP(0.25);
    END LOOP;
    IF v_spatial_plan_row_count < 1 THEN
        RAISE_APPLICATION_ERROR(-20525, 'Spatial exact cursor plan is unavailable');
    END IF;

    FOR plan_line IN (
      SELECT plan_table_output
      FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
          v_sql_id, v_child_number, 'BASIC +ALIAS +PREDICATE'
        ))
    ) LOOP
      v_display_rows := v_display_rows + 1;
      DBMS_OUTPUT.PUT_LINE('RETAIL_SPATIAL_PLAN ' || plan_line.plan_table_output);
    END LOOP;
    IF v_display_rows = 0 THEN
        RAISE_APPLICATION_ERROR(-20525, 'Spatial exact cursor plan is unavailable');
    END IF;

    SELECT NVL(MAX(CASE WHEN id = 0 THEN last_output_rows END), 0)
    INTO v_spatial_result_rows
    FROM sys.v_$sql_plan_statistics_all
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number;
    /* Same Oracle Free :latest SQL*Plus-statistics compatibility path. */
    IF v_spatial_result_rows < 1 THEN
        SELECT COUNT(*)
        INTO v_spatial_result_count
        FROM (
          SELECT /* RETAIL_SPATIAL_RESULT_COUNT_REPROOF */ center.center_id
          FROM fulfillment_centers center
          CROSS JOIN (
            SELECT location
            FROM customers
            WHERE location IS NOT NULL
            ORDER BY customer_id
            FETCH FIRST 1 ROW ONLY
          ) customer
          WHERE center.location IS NOT NULL
            AND SDO_NN(
              center.location,
              customer.location,
              'sdo_num_res=5',
              1
            ) = 'TRUE'
          ORDER BY SDO_GEOM.SDO_DISTANCE(
            customer.location, center.location, 0.005, 'unit=KM'
          ), center.center_id
          FETCH FIRST 5 ROWS ONLY
        );
        v_spatial_result_rows := v_spatial_result_count;
    END IF;
    IF v_spatial_result_rows < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20541,
          'Spatial exact cursor must return nonempty current rows'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_spatial_full_scan_count
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND object_name = 'FULFILLMENT_CENTERS'
      AND TRIM(UPPER(operation)) LIKE 'TABLE ACCESS%'
      AND INSTR(UPPER(NVL(options, '')), 'FULL') > 0;
    IF v_spatial_full_scan_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20542,
          'Spatial exact cursor contains a FULFILLMENT_CENTERS full scan'
        );
    END IF;

    SELECT COUNT(*),
           MAX(TRIM(operation || CASE WHEN options IS NOT NULL
                                      THEN ' ' || options END)),
           MAX(object_owner)
    INTO v_spatial_expected_index_count,
         v_operation,
         v_object_owner
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND UPPER(TRIM(operation)) = 'DOMAIN INDEX'
      AND UPPER(NVL(object_owner, '<NULL>')) = USER
      AND UPPER(NVL(object_name, '<NULL>')) = 'IDX_FC_SPATIAL';

    SELECT COUNT(*)
    INTO v_spatial_unexpected_index_count
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND INSTR(
            UPPER(NVL(operation, '') || ' ' || NVL(options, '')),
            'DOMAIN INDEX'
          ) > 0
      AND (
        UPPER(TRIM(NVL(operation, '<NULL>'))) <> 'DOMAIN INDEX'
        OR UPPER(NVL(object_owner, '<NULL>')) <> USER
        OR UPPER(NVL(object_name, '<NULL>')) <> 'IDX_FC_SPATIAL'
      );

    SELECT COUNT(*),
           SUM(CASE WHEN object_owner IS NULL
                         AND UPPER(NVL(object_name, '<NULL>')) = 'IDX_FC_SPATIAL'
                    THEN 1 ELSE 0 END)
    INTO v_spatial_domain_index_count,
         v_spatial_null_owner_index_count
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child_number
      AND INSTR(
            UPPER(NVL(operation, '') || ' ' || NVL(options, '')),
            'DOMAIN INDEX'
          ) > 0;

    /*
     * Oracle 26ai may expose more than one adaptive row for the same domain
     * index in a single child cursor. Require at least one exact, schema-owned
     * IDX_FC_SPATIAL row and reject every other DOMAIN INDEX row.
     */
    IF v_spatial_expected_index_count < 1
       OR v_spatial_unexpected_index_count <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20551,
          'Spatial exact child must use only schema-owned DOMAIN INDEX IDX_FC_SPATIAL rows: ' ||
          'domain=' || v_spatial_domain_index_count ||
          ', expected=' || v_spatial_expected_index_count ||
          ', unexpected=' || v_spatial_unexpected_index_count ||
          ', null_owner=' || v_spatial_null_owner_index_count
        );
    END IF;

    SELECT COUNT(*)
    INTO v_spatial_index_binding_count
    FROM user_indexes indexes
    JOIN user_ind_columns columns
      ON columns.index_name = indexes.index_name
    WHERE indexes.index_name = 'IDX_FC_SPATIAL'
      AND indexes.index_type = 'DOMAIN'
      AND indexes.status = 'VALID'
      AND indexes.domidx_status = 'VALID'
      AND indexes.domidx_opstatus = 'VALID'
      AND indexes.ityp_owner = 'MDSYS'
      AND indexes.ityp_name = 'SPATIAL_INDEX_V2'
      AND columns.table_name = 'FULFILLMENT_CENTERS'
      AND columns.column_name = 'LOCATION'
      AND columns.column_position = 1;
    IF v_spatial_index_binding_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20543,
          'IDX_FC_SPATIAL must be a VALID MDSYS Spatial index on '
          || 'FULFILLMENT_CENTERS.LOCATION'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_spatial_metadata_count
    FROM user_sdo_geom_metadata metadata
    WHERE metadata.table_name = 'FULFILLMENT_CENTERS'
      AND metadata.column_name = 'LOCATION'
      AND metadata.srid = 4326;
    IF v_spatial_metadata_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20549,
          'USER_SDO_GEOM_METADATA for FULFILLMENT_CENTERS.LOCATION is invalid'
        );
    END IF;

    SELECT state.active_generation_id,
           CASE
             WHEN state.active_generation_id = 'bootstrap-v1' THEN
               RAWTOHEX(STANDARD_HASH('bootstrap-v1', 'SHA256'))
             ELSE evidence.dataset_fingerprint
           END
    INTO v_generation, v_fingerprint
    FROM app_dataset_state state
    LEFT JOIN app_inmemory_generation_evidence evidence
      ON evidence.generation_id = state.active_generation_id
    WHERE state.state_id = 1;

    IF v_generation IS NULL OR v_fingerprint IS NULL THEN
        RAISE_APPLICATION_ERROR(
          -20544,
          'Spatial plan publication requires generation and fingerprint'
        );
    END IF;

    MERGE INTO app_feature_plan_evidence target
    USING (
      SELECT v_generation generation_id, 'SPATIAL' feature_name,
             v_fingerprint dataset_fingerprint, v_sql_id sql_id,
             v_child_number child_number,
             v_spatial_plan_hash_value plan_hash_value,
             v_operation plan_operation,
             v_object_owner object_owner
      FROM dual
    ) source
    ON (target.generation_id = source.generation_id
        AND target.feature_name = source.feature_name)
    WHEN MATCHED THEN UPDATE SET
      target.job_id = NULL,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.plan_operation = source.plan_operation,
      target.object_owner = source.object_owner,
      target.object_name = 'FULFILLMENT_CENTERS',
      target.index_name = 'IDX_FC_SPATIAL',
      target.verified_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (
      generation_id, feature_name, job_id, dataset_fingerprint,
      sql_id, child_number, plan_hash_value, plan_operation, object_owner,
      object_name, index_name, verified_at
    ) VALUES (
      source.generation_id, source.feature_name, NULL,
      source.dataset_fingerprint, source.sql_id, source.child_number,
      source.plan_hash_value, source.plan_operation, source.object_owner,
      'FULFILLMENT_CENTERS', 'IDX_FC_SPATIAL', SYSTIMESTAMP
    );
EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(
        -20526,
        'Spatial exact cursor did not use DOMAIN INDEX IDX_FC_SPATIAL'
      );
END;
/

BEGIN
    FOR expected IN (
        SELECT segment_name FROM retail_inmemory_segments_v
    ) LOOP
        DBMS_INMEMORY.POPULATE(USER, expected.segment_name);
    END LOOP;
END;
/

SET SERVEROUTPUT ON

/*
 * Produce one real allowed INSERT and one genuine VPD WITH CHECK OPTION
 * denial on every fresh or retained startup. Both statements are rolled back
 * to savepoints; Unified Audit still records their exact Oracle outcomes.
 * SQL*Plus bind variables carry the independently read trail tuple into the
 * readiness publication block below.
 */
VARIABLE b_audit_started_at VARCHAR2(64)
VARIABLE b_audit_allowed_client VARCHAR2(64)
VARIABLE b_audit_denied_client VARCHAR2(64)
VARIABLE b_audit_policy_rows NUMBER
VARIABLE b_audit_enabled_rows NUMBER
VARIABLE b_audit_allowed_rows NUMBER
VARIABLE b_audit_allowed_return_code NUMBER
VARIABLE b_audit_denied_rows NUMBER
VARIABLE b_audit_denied_return_code NUMBER

BEGIN
    :b_audit_started_at := TO_CHAR(
      SYSTIMESTAMP - INTERVAL '1' SECOND,
      'YYYY-MM-DD"T"HH24:MI:SS.FF6TZH:TZM'
    );
    :b_audit_allowed_client :=
      SUBSTR('retail-boot-audit-ok-' || RAWTOHEX(SYS_GUID()), 1, 64);
    :b_audit_denied_client :=
      SUBSTR('retail-boot-audit-denied-' || RAWTOHEX(SYS_GUID()), 1, 64);
END;
/

SAVEPOINT retail_boot_audit_allowed;
BEGIN
    retail_security_pkg.set_user_context('admin_jess');
    DBMS_SESSION.SET_IDENTIFIER(:b_audit_allowed_client);
END;
/
INSERT INTO return_decisions (
    return_id, decision_type, decision_summary,
    confidence_score, created_by
)
SELECT MIN(return_id), 'Request Info',
       'Bootstrap Unified Audit allowed proof',
       0.5, 'admin_jess'
FROM return_requests
HAVING MIN(return_id) IS NOT NULL;
ROLLBACK TO retail_boot_audit_allowed;

SAVEPOINT retail_boot_audit_denied;
BEGIN
    retail_security_pkg.set_user_context('analyst_raj');
    DBMS_SESSION.SET_IDENTIFIER(:b_audit_denied_client);
    BEGIN
        INSERT INTO return_decisions (
            return_id, decision_type, decision_summary,
            confidence_score, created_by
        )
        SELECT MIN(return_id), 'Request Info',
               'Bootstrap Unified Audit denied proof',
               0.5, 'analyst_raj'
        FROM return_requests
        HAVING MIN(return_id) IS NOT NULL;
        :b_audit_denied_return_code := 0;
    EXCEPTION
        WHEN OTHERS THEN
            :b_audit_denied_return_code := -SQLCODE;
            IF SQLCODE <> -28115 THEN RAISE; END IF;
    END;
END;
/
ROLLBACK TO retail_boot_audit_denied;

BEGIN
    retail_security_pkg.set_user_context('admin_jess');
    FOR attempt IN 1..120 LOOP
        SYSTEM.retail_audit_evidence_pkg.prove_denial(
          p_object_owner               => USER,
          p_allowed_client_identifier  => :b_audit_allowed_client,
          p_denied_client_identifier   => :b_audit_denied_client,
          p_started_at                 => TO_TIMESTAMP_TZ(
            :b_audit_started_at,
            'YYYY-MM-DD"T"HH24:MI:SS.FF6TZH:TZM'
          ),
          p_policy_rows                => :b_audit_policy_rows,
          p_enabled_rows               => :b_audit_enabled_rows,
          p_allowed_rows               => :b_audit_allowed_rows,
          p_allowed_return_code        => :b_audit_allowed_return_code,
          p_denied_rows                => :b_audit_denied_rows,
          p_denied_return_code         => :b_audit_denied_return_code
        );
        EXIT WHEN NVL(:b_audit_policy_rows, 0) = 4
          AND NVL(:b_audit_enabled_rows, 0) = 1
          AND NVL(:b_audit_allowed_rows, 0) > 0
          AND NVL(:b_audit_allowed_return_code, -1) = 0
          AND NVL(:b_audit_denied_rows, 0) > 0
          AND NVL(:b_audit_denied_return_code, 0) = 28115;
        DBMS_SESSION.SLEEP(0.25);
    END LOOP;
    IF NVL(:b_audit_policy_rows, 0) <> 4
       OR NVL(:b_audit_enabled_rows, 0) <> 1
       OR NVL(:b_audit_allowed_rows, 0) < 1
       OR NVL(:b_audit_allowed_return_code, -1) <> 0
       OR NVL(:b_audit_denied_rows, 0) < 1
       OR NVL(:b_audit_denied_return_code, 0) <> 28115 THEN
        RAISE_APPLICATION_ERROR(
          -20535,
          'Unified Audit allowed/denied execution tuple is incomplete'
        );
    END IF;
END;
/

DECLARE
    v_count PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1..60 LOOP
        SELECT COUNT(*) INTO v_count
        FROM retail_inmemory_segments_v
        WHERE table_inmemory = 'ENABLED'
          AND populate_status = 'COMPLETED'
          AND inmemory_bytes > 0
          AND bytes_not_populated = 0;
        EXIT WHEN v_count = 5;
        DBMS_SESSION.SLEEP(1);
    END LOOP;
    IF v_count <> 5 THEN
        RAISE_APPLICATION_ERROR(
          -20527,
          'Five fully populated current Retail In-Memory segments are required'
        );
    END IF;
END;
/

ALTER SESSION SET INMEMORY_QUERY = ENABLE;
BEGIN
    DBMS_APPLICATION_INFO.SET_MODULE(
      'RETAIL_BOOTSTRAP',
      'INMEMORY_PROOF'
    );
END;
/

SELECT /*+ GATHER_PLAN_STATISTICS FULL(retail_order) NO_INDEX(retail_order) */
       /* RETAIL_INMEMORY_BOOTSTRAP_REPROOF */
       retail_order.order_status,
       COUNT(*) order_count,
       SUM(retail_order.order_total) order_total
FROM orders retail_order
GROUP BY retail_order.order_status;

DECLARE
    v_generation app_dataset_state.active_generation_id%TYPE;
    v_fingerprint app_inmemory_generation_evidence.dataset_fingerprint%TYPE;
    v_sql_id VARCHAR2(13);
    v_child_number NUMBER;
    v_display_rows PLS_INTEGER := 0;
    v_operation VARCHAR2(100);
    v_object_owner VARCHAR2(128);
    v_object_name VARCHAR2(128);
    v_populated PLS_INTEGER;
    v_proof_id VARCHAR2(64) := RAWTOHEX(SYS_GUID());
BEGIN
    DBMS_APPLICATION_INFO.SET_ACTION('INMEMORY_PROOF_CAPTURE');

    SELECT sql_id, child_number
    INTO v_sql_id, v_child_number
    FROM (
      SELECT sql_id, child_number
      FROM sys.v_$sql
      WHERE module = 'RETAIL_BOOTSTRAP'
        AND action = 'INMEMORY_PROOF'
        AND INSTR(UPPER(sql_text), 'RETAIL_INMEMORY_BOOTSTRAP_REPROOF') > 0
        AND INSTR(UPPER(sql_text), 'FROM SYS.V_$SQL') = 0
      ORDER BY last_active_time DESC
    )
    WHERE ROWNUM = 1;

    IF v_sql_id IS NULL OR v_child_number IS NULL THEN
        RAISE_APPLICATION_ERROR(-20528, 'In-Memory cursor identity is unavailable');
    END IF;

    FOR plan_line IN (
        SELECT plan_table_output
        FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
          v_sql_id, v_child_number, 'BASIC +ALIAS +PREDICATE'
        ))
    ) LOOP
        v_display_rows := v_display_rows + 1;
    END LOOP;
    IF v_display_rows = 0 THEN
        RAISE_APPLICATION_ERROR(-20529, 'In-Memory exact cursor plan is unavailable');
    END IF;

    SELECT TRIM(operation || CASE WHEN options IS NOT NULL
                                 THEN ' ' || options END),
           object_owner, object_name
    INTO v_operation, v_object_owner, v_object_name
    FROM (
      SELECT operation, options, object_owner, object_name, id
      FROM sys.v_$sql_plan
      WHERE sql_id = v_sql_id
        AND child_number = v_child_number
        AND operation = 'TABLE ACCESS'
        AND options = 'INMEMORY FULL'
        AND object_owner = USER
        AND object_name = 'ORDERS'
      ORDER BY id
    )
    WHERE ROWNUM = 1;

    SELECT COUNT(*) INTO v_populated
    FROM retail_inmemory_segments_v
    WHERE table_inmemory = 'ENABLED'
      AND populate_status = 'COMPLETED'
      AND inmemory_bytes > 0
      AND bytes_not_populated = 0;
    IF v_populated <> 5 THEN
        RAISE_APPLICATION_ERROR(-20530, 'In-Memory population changed during proof');
    END IF;

    SELECT state.active_generation_id,
           CASE
             WHEN state.active_generation_id = 'bootstrap-v1' THEN
               RAWTOHEX(STANDARD_HASH('bootstrap-v1', 'SHA256'))
             ELSE evidence.dataset_fingerprint
           END
    INTO v_generation, v_fingerprint
    FROM app_dataset_state state
    LEFT JOIN app_inmemory_generation_evidence evidence
      ON evidence.generation_id = state.active_generation_id
    WHERE state.state_id = 1;

    MERGE INTO app_inmemory_generation_evidence target
    USING (
      SELECT v_generation generation_id, v_fingerprint dataset_fingerprint,
             v_populated populated_segments, v_sql_id sql_id,
             v_child_number child_number, v_operation plan_operation,
             v_object_owner plan_object_owner,
             v_object_name plan_object_name, v_proof_id proof_id
      FROM dual
    ) source
    ON (target.generation_id = source.generation_id)
    WHEN MATCHED THEN UPDATE SET
      target.job_id = NULL,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.populated_segments = source.populated_segments,
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_operation = source.plan_operation,
      target.plan_object_owner = source.plan_object_owner,
      target.plan_object_name = source.plan_object_name,
      target.proof_id = source.proof_id,
      target.evidence_status = 'ACTIVE',
      target.verified_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT (
      generation_id, job_id, dataset_fingerprint, populated_segments,
      sql_id, child_number, plan_operation, plan_object_owner,
      plan_object_name, proof_id, evidence_status, verified_at
    ) VALUES (
      source.generation_id, NULL, source.dataset_fingerprint,
      source.populated_segments, source.sql_id, source.child_number,
      source.plan_operation, source.plan_object_owner,
      source.plan_object_name, source.proof_id, 'ACTIVE', SYSTIMESTAMP
    );
EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(
        -20531,
        'In-Memory exact cursor did not access ORDERS with INMEMORY FULL'
      );
END;
/

DECLARE
    v_generation app_dataset_state.active_generation_id%TYPE;
    v_source app_dataset_state.active_source%TYPE;
    v_version app_dataset_state.active_version%TYPE;
    v_fingerprint app_inmemory_generation_evidence.dataset_fingerprint%TYPE;
    v_proof_id app_inmemory_generation_evidence.proof_id%TYPE;
    v_model_count PLS_INTEGER;
    v_registry_count PLS_INTEGER;
    v_training_count PLS_INTEGER;
    v_duality_count PLS_INTEGER;
    v_graph_count PLS_INTEGER;
    v_spatial_count PLS_INTEGER;
    v_native_json_count PLS_INTEGER;
    v_vpd_object_count PLS_INTEGER;
    v_vpd_policy_count PLS_INTEGER;
    v_context_count PLS_INTEGER;
    v_feature_plan_count PLS_INTEGER;
    v_product_count PLS_INTEGER;
    v_vector_count PLS_INTEGER;
    v_post_count PLS_INTEGER;
    v_post_vector_count PLS_INTEGER;
    v_return_evidence_count PLS_INTEGER;
    v_expected_return_evidence_count PLS_INTEGER;
    v_invalid_return_evidence PLS_INTEGER;
    v_momentum_post_count PLS_INTEGER;
    v_semantic_match_count PLS_INTEGER;
    v_expected_match_count PLS_INTEGER;
    v_vector_model_count PLS_INTEGER;
    v_vector_column_count PLS_INTEGER;
    v_vector_index_count PLS_INTEGER;
    v_invalid_product_vectors PLS_INTEGER;
    v_invalid_post_vectors PLS_INTEGER;
    v_product_source_text_mismatches PLS_INTEGER;
    v_post_source_text_mismatches PLS_INTEGER;
    v_product_embedding_mismatches PLS_INTEGER;
    v_post_embedding_mismatches PLS_INTEGER;
    v_canonical_semantic_mismatches PLS_INTEGER;
    v_generation_evidence_count PLS_INTEGER;
    v_generation_evidence_mismatches PLS_INTEGER;
    v_incomplete_match_groups PLS_INTEGER;
    v_invalid_matches PLS_INTEGER;
    v_deterministic_match_mismatches PLS_INTEGER;
    v_inmemory_count PLS_INTEGER;
    v_audit_count PLS_INTEGER;
    v_readiness JSON;
    v_published_status VARCHAR2(20);
    v_published_generation VARCHAR2(64);
    v_published_proof_id VARCHAR2(64);
BEGIN
    SELECT active_generation_id, active_source, active_version
    INTO v_generation, v_source, v_version
    FROM app_dataset_state
    WHERE state_id = 1;

    IF v_generation IS NULL
       OR v_source IS NULL
       OR v_version IS NULL THEN
        RAISE_APPLICATION_ERROR(
          -20545,
          'Active dataset identity is incomplete'
        );
    END IF;

    SELECT dataset_fingerprint, proof_id
    INTO v_fingerprint, v_proof_id
    FROM app_inmemory_generation_evidence
    WHERE generation_id = v_generation
      AND evidence_status = 'ACTIVE'
      AND populated_segments = 5
      AND child_number IS NOT NULL
      AND plan_operation = 'TABLE ACCESS INMEMORY FULL'
      AND plan_object_name = 'ORDERS';

    IF v_fingerprint IS NULL OR v_proof_id IS NULL THEN
        RAISE_APPLICATION_ERROR(
          -20546,
          'Active In-Memory evidence identity is incomplete'
        );
    END IF;

    SELECT COUNT(*) INTO v_model_count
    FROM user_mining_models
    WHERE model_name = 'ALL_MINILM_L12_V2'
       OR model_name IN (
         SELECT physical_name
         FROM app_oml_model_registry
         WHERE generation_id = v_generation
       );

    SELECT COUNT(*) INTO v_registry_count
    FROM app_oml_model_registry registry
    JOIN user_mining_models models
      ON models.model_name = registry.physical_name
    WHERE registry.generation_id = v_generation;

    SELECT COUNT(*) INTO v_training_count
    FROM app_oml_training_generations
    WHERE generation_id = v_generation
      AND status = 'ACTIVE';

    SELECT COUNT(*) INTO v_duality_count
    FROM user_json_duality_views
    WHERE view_name IN ('ORDERS_DV', 'PRODUCTS_INVENTORY_DV');

    SELECT COUNT(*) INTO v_graph_count
    FROM user_property_graphs
    WHERE graph_name = 'INFLUENCER_NETWORK';

    SELECT COUNT(*) INTO v_spatial_count
    FROM user_indexes
    WHERE index_name IN ('IDX_FC_SPATIAL', 'IDX_CUST_SPATIAL')
      AND status = 'VALID';

    SELECT COUNT(*) INTO v_native_json_count
    FROM retail_native_json_evidence_v
    WHERE feature_name = 'native_json'
      AND has_event = 'YES'
      AND generation_id = v_generation
      AND dataset_fingerprint = v_fingerprint;

    SELECT COUNT(DISTINCT object_name) INTO v_vpd_object_count
    FROM user_policies
    WHERE policy_type = 'CONTEXT_SENSITIVE'
      AND enable = 'YES'
      AND policy_name LIKE 'VPD_RT_%';

    SELECT COUNT(*) INTO v_vpd_policy_count
    FROM user_policies
    WHERE policy_type = 'CONTEXT_SENSITIVE'
      AND enable = 'YES'
      AND policy_name LIKE 'VPD_RT_%';

    SELECT COUNT(*) INTO v_context_count
    FROM dba_context
    WHERE namespace = 'RETAIL_APP_CTX'
      AND schema = USER
      AND package = 'RETAIL_SECURITY_PKG';

    SELECT COUNT(*) INTO v_feature_plan_count
    FROM app_feature_plan_evidence
    WHERE generation_id = v_generation
      AND dataset_fingerprint = v_fingerprint
      AND (
        (feature_name = 'VECTOR'
         AND object_name = 'PRODUCT_EMBEDDINGS'
         AND ((index_name = 'IDX_PRODUCT_VEC'
               AND plan_operation LIKE '%VECTOR INDEX%')
              OR (index_name IS NULL
                  AND plan_operation = 'PLAN_PROJECTION_UNAVAILABLE'))
         AND child_number IS NOT NULL
         AND plan_hash_value >= 0
         AND REGEXP_LIKE(sql_id, '^[0-9a-z]{13}$', 'c'))
        OR
        (feature_name = 'SPATIAL'
         AND object_name = 'FULFILLMENT_CENTERS'
         AND index_name = 'IDX_FC_SPATIAL'
         AND child_number IS NOT NULL
         AND plan_hash_value >= 0
         AND REGEXP_LIKE(sql_id, '^[0-9a-z]{13}$', 'c'))
      );

    SELECT COUNT(*) INTO v_product_count FROM products;
    SELECT COUNT(*) INTO v_vector_count FROM product_embeddings;
    SELECT COUNT(*) INTO v_post_count FROM social_posts;
    SELECT COUNT(*) INTO v_post_vector_count FROM post_embeddings;
    SELECT COUNT(*) INTO v_momentum_post_count
    FROM social_posts
    WHERE momentum_flag IN ('viral', 'mega_viral');
    SELECT COUNT(*) INTO v_semantic_match_count FROM semantic_matches;
    v_expected_match_count :=
        v_momentum_post_count * LEAST(v_product_count, 3);

    SELECT COUNT(*) INTO v_vector_model_count
    FROM user_mining_models
    WHERE model_name = 'ALL_MINILM_L12_V2'
      AND mining_function = 'EMBEDDING'
      AND algorithm = 'ONNX';

    SELECT COUNT(*) INTO v_vector_column_count
    FROM user_tab_columns
    WHERE data_type = 'VECTOR'
      AND REPLACE(UPPER(vector_info), ' ', '') =
          'VECTOR(384,FLOAT32,DENSE)'
      AND (
        (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
        OR
        (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
        OR
        (table_name = 'RETURN_EVIDENCE_INDEX' AND column_name = 'EMBEDDING')
      );

    SELECT COUNT(*) INTO v_vector_index_count
    FROM user_indexes indexes
    JOIN user_ind_columns columns
      ON columns.index_name = indexes.index_name
    WHERE indexes.index_type = 'VECTOR'
      AND indexes.status = 'VALID'
      AND (
        (indexes.index_name = 'IDX_PRODUCT_VEC'
         AND columns.table_name = 'PRODUCT_EMBEDDINGS'
         AND columns.column_name = 'EMBEDDING'
         AND columns.column_position = 1)
        OR
        (indexes.index_name = 'IDX_POST_VEC'
         AND columns.table_name = 'POST_EMBEDDINGS'
         AND columns.column_name = 'EMBEDDING'
         AND columns.column_position = 1)
        OR
        (indexes.index_name = 'IDX_RETURN_EVIDENCE_VEC'
         AND columns.table_name = 'RETURN_EVIDENCE_INDEX'
         AND columns.column_name = 'EMBEDDING'
         AND columns.column_position = 1)
      );

    SELECT COUNT(*) INTO v_return_evidence_count
    FROM return_evidence_index
    WHERE generation_id = v_generation;

    SELECT
      (SELECT COUNT(*) * 2 FROM return_requests) +
      (SELECT COUNT(*) FROM return_documents) +
      (SELECT COUNT(*) FROM return_events) +
      (SELECT COUNT(*) FROM return_decisions) +
      (SELECT COUNT(*)
       FROM return_requests rr
       JOIN return_policy_clauses policy
         ON policy.clause_code = rr.policy_clause)
    INTO v_expected_return_evidence_count
    FROM dual;

    SELECT COUNT(*) INTO v_invalid_return_evidence
    FROM return_evidence_index evidence
    WHERE evidence.generation_id <> v_generation
       OR evidence.embedding IS NULL
       OR VECTOR_DIMENSION_COUNT(evidence.embedding) <> 384
       OR UPPER(VECTOR_DIMENSION_FORMAT(evidence.embedding)) <> 'FLOAT32'
       OR evidence.embedding_model <> 'ALL_MINILM_L12_V2'
       OR evidence.embedding_dimensions <> 384
       OR evidence.content_hash IS NULL
       OR LENGTH(evidence.content_hash) <> 64
       OR evidence.evidence_text IS NULL
       OR DBMS_LOB.GETLENGTH(evidence.evidence_text) = 0;

    SELECT COUNT(*) INTO v_invalid_product_vectors
    FROM product_embeddings vector_row
    WHERE vector_row.embedding IS NULL
       OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
       OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32'
       OR vector_row.embedding_text IS NULL
       OR DBMS_LOB.GETLENGTH(vector_row.embedding_text) = 0
       OR vector_row.embedding_model IS NULL
       OR LOWER(vector_row.embedding_model) <> 'all_minilm_l12_v2'
       OR NOT EXISTS (
            SELECT 1 FROM products product
            WHERE product.product_id = vector_row.product_id
       );

    SELECT COUNT(*) INTO v_invalid_post_vectors
    FROM post_embeddings vector_row
    WHERE vector_row.embedding IS NULL
       OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
       OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32'
       OR vector_row.embedding_text IS NULL
       OR DBMS_LOB.GETLENGTH(vector_row.embedding_text) = 0
       OR vector_row.embedding_model IS NULL
       OR LOWER(vector_row.embedding_model) <> 'all_minilm_l12_v2'
       OR NOT EXISTS (
            SELECT 1 FROM social_posts post
            WHERE post.post_id = vector_row.post_id
       );

    SELECT COUNT(*) INTO v_product_source_text_mismatches
    FROM product_embeddings vector_row
    JOIN products product
      ON product.product_id = vector_row.product_id
    JOIN brands brand
      ON brand.brand_id = product.brand_id
    WHERE vector_row.embedding_text IS NULL
       OR DBMS_LOB.COMPARE(
            vector_row.embedding_text,
            TO_CLOB(product.product_name) || ' ' ||
            NVL(product.category, '') || ' ' ||
            product.description || ' ' ||
            brand.brand_name
          ) <> 0;

    SELECT COUNT(*) INTO v_post_source_text_mismatches
    FROM post_embeddings vector_row
    JOIN social_posts post
      ON post.post_id = vector_row.post_id
    WHERE vector_row.embedding_text IS NULL
       OR DBMS_LOB.COMPARE(
            vector_row.embedding_text,
            TO_CLOB(DBMS_LOB.SUBSTR(post.post_text, 500, 1))
          ) <> 0;

    SELECT COUNT(*) INTO v_product_embedding_mismatches
    FROM product_embeddings vector_row
    JOIN products product
      ON product.product_id = vector_row.product_id
    JOIN brands brand
      ON brand.brand_id = product.brand_id
    WHERE vector_row.embedding IS NOT NULL
      AND ABS(
            VECTOR_DISTANCE(
              vector_row.embedding,
              VECTOR_EMBEDDING(
                ALL_MINILM_L12_V2 USING
                TO_CLOB(product.product_name) || ' ' ||
                NVL(product.category, '') || ' ' ||
                product.description || ' ' ||
                brand.brand_name AS DATA
              ),
              EUCLIDEAN
            )
          ) > 0.000001;

    SELECT COUNT(*) INTO v_post_embedding_mismatches
    FROM post_embeddings vector_row
    JOIN social_posts post
      ON post.post_id = vector_row.post_id
    WHERE vector_row.embedding IS NOT NULL
      AND ABS(
            VECTOR_DISTANCE(
              vector_row.embedding,
              VECTOR_EMBEDDING(
                ALL_MINILM_L12_V2 USING
                TO_CLOB(
                  DBMS_LOB.SUBSTR(post.post_text, 500, 1)
                ) AS DATA
              ),
              EUCLIDEAN
            )
          ) > 0.000001;

    SELECT COUNT(*) INTO v_generation_evidence_count
    FROM app_vector_generation_evidence
    WHERE generation_id = v_generation
      AND dataset_fingerprint = v_fingerprint;

    SELECT COUNT(*) INTO v_generation_evidence_mismatches
    FROM (
      SELECT product.product_id entity_id
      FROM products product
      JOIN brands brand
        ON brand.brand_id = product.brand_id
      JOIN product_embeddings vector_row
        ON vector_row.product_id = product.product_id
      LEFT JOIN app_vector_generation_evidence evidence
        ON evidence.generation_id = v_generation
       AND evidence.dataset_fingerprint = v_fingerprint
       AND evidence.entity_type = 'PRODUCT'
       AND evidence.entity_id = product.product_id
      WHERE evidence.entity_id IS NULL
         OR evidence.model_name IS NULL
         OR evidence.model_name <> 'ALL_MINILM_L12_V2'
         OR evidence.source_hash IS NULL
         OR evidence.source_hash <> RAWTOHEX(
              STANDARD_HASH(
                DBMS_LOB.SUBSTR(
                  TO_CLOB(product.product_name) || ' ' ||
                  NVL(product.category, '') || ' ' ||
                  product.description || ' ' ||
                  brand.brand_name,
                  32767,
                  1
                ),
                'SHA256'
              )
            )
         OR evidence.vector_hash IS NULL
         OR evidence.vector_hash <>
              retail_vector_serialization_sha256(vector_row.embedding)
      UNION ALL
      SELECT post.post_id
      FROM social_posts post
      JOIN post_embeddings vector_row
        ON vector_row.post_id = post.post_id
      LEFT JOIN app_vector_generation_evidence evidence
        ON evidence.generation_id = v_generation
       AND evidence.dataset_fingerprint = v_fingerprint
       AND evidence.entity_type = 'POST'
       AND evidence.entity_id = post.post_id
      WHERE evidence.entity_id IS NULL
         OR evidence.model_name IS NULL
         OR evidence.model_name <> 'ALL_MINILM_L12_V2'
         OR evidence.source_hash IS NULL
         OR evidence.source_hash <> RAWTOHEX(
              STANDARD_HASH(
                DBMS_LOB.SUBSTR(post.post_text, 500, 1),
                'SHA256'
              )
            )
         OR evidence.vector_hash IS NULL
         OR evidence.vector_hash <>
              retail_vector_serialization_sha256(vector_row.embedding)
      UNION ALL
      SELECT match_row.match_id
      FROM semantic_matches match_row
      LEFT JOIN app_vector_generation_evidence evidence
        ON evidence.generation_id = v_generation
       AND evidence.dataset_fingerprint = v_fingerprint
       AND evidence.entity_type = 'MATCH'
       AND evidence.entity_id = match_row.match_id
      WHERE evidence.entity_id IS NULL
         OR evidence.model_name IS NULL
         OR evidence.model_name <> 'ALL_MINILM_L12_V2'
         OR evidence.source_hash IS NULL
         OR evidence.source_hash <> RAWTOHEX(
              STANDARD_HASH(
                TO_CHAR(match_row.post_id) || ':' ||
                TO_CHAR(match_row.product_id) || ':' ||
                TO_CHAR(match_row.match_rank) || ':' ||
                TO_CHAR(
                  match_row.similarity_score,
                  'FM9999999990D00000',
                  'NLS_NUMERIC_CHARACTERS=''.,'''
                ) || ':' ||
                match_row.match_method,
                'SHA256'
              )
            )
         OR evidence.vector_hash IS NULL
         OR evidence.vector_hash <> evidence.source_hash
    );

    SELECT COUNT(*) INTO v_incomplete_match_groups
    FROM (
      SELECT post.post_id
      FROM social_posts post
      LEFT JOIN semantic_matches match_row
        ON match_row.post_id = post.post_id
      WHERE post.momentum_flag IN ('viral', 'mega_viral')
      GROUP BY post.post_id
      HAVING COUNT(match_row.match_id) <> LEAST(v_product_count, 3)
          OR MIN(match_row.match_rank) <> 1
          OR MAX(match_row.match_rank) <> LEAST(v_product_count, 3)
          OR COUNT(DISTINCT match_row.match_rank)
             <> LEAST(v_product_count, 3)
          OR COUNT(DISTINCT match_row.product_id)
             <> LEAST(v_product_count, 3)
    );

    SELECT COUNT(*) INTO v_invalid_matches
    FROM semantic_matches match_row
    JOIN social_posts post
      ON post.post_id = match_row.post_id
    WHERE post.momentum_flag NOT IN ('viral', 'mega_viral')
       OR match_row.similarity_score IS NULL
       OR match_row.similarity_score < -1
       OR match_row.similarity_score > 1
       OR match_row.match_rank IS NULL
       OR match_row.match_rank < 1
       OR match_row.match_rank > LEAST(v_product_count, 3)
       OR match_row.match_method IS NULL
       OR match_row.match_method <> 'vector';

    SELECT COUNT(*) INTO v_deterministic_match_mismatches
    FROM (
      WITH ranked_matches AS (
        SELECT post_vector.post_id,
               product_vector.product_id,
               ROUND(
                 1 - VECTOR_DISTANCE(
                   post_vector.embedding,
                   product_vector.embedding,
                   COSINE
                 ),
                 5
               ) similarity_score,
               ROW_NUMBER() OVER (
                 PARTITION BY post_vector.post_id
                 ORDER BY VECTOR_DISTANCE(
                   post_vector.embedding,
                   product_vector.embedding,
                   COSINE
                 ),
                 product_vector.product_id
               ) match_rank
        FROM post_embeddings post_vector
        JOIN social_posts post
          ON post.post_id = post_vector.post_id
        CROSS JOIN product_embeddings product_vector
        WHERE post.momentum_flag IN ('viral', 'mega_viral')
      ),
      expected_matches AS (
        SELECT post_id, product_id, similarity_score, match_rank
        FROM ranked_matches
        WHERE match_rank <= 3
      )
      SELECT expected.post_id
      FROM expected_matches expected
      FULL OUTER JOIN semantic_matches actual
        ON actual.post_id = expected.post_id
       AND actual.product_id = expected.product_id
       AND actual.match_rank = expected.match_rank
      WHERE expected.post_id IS NULL
         OR actual.post_id IS NULL
         OR actual.match_rank IS NULL
         OR actual.similarity_score IS NULL
         OR actual.match_method IS NULL
         OR actual.match_method <> 'vector'
         OR ABS(actual.similarity_score - expected.similarity_score) > 0.00001
    );
    v_canonical_semantic_mismatches :=
        v_deterministic_match_mismatches;

    SELECT COUNT(*) INTO v_inmemory_count
    FROM retail_inmemory_segments_v
    WHERE table_inmemory = 'ENABLED'
      AND populate_status = 'COMPLETED'
      AND inmemory_bytes > 0
      AND bytes_not_populated = 0;

    /* The narrow SYSTEM verifier already read the admin-only policy view. */
    v_audit_count := NVL(:b_audit_enabled_rows, 0);

    DBMS_OUTPUT.PUT_LINE(
      'Retail readiness counts: models=' || v_model_count ||
      ', registry=' || v_registry_count ||
      ', training=' || v_training_count ||
      ', featurePlans=' || v_feature_plan_count ||
      ', inMemory=' || v_inmemory_count ||
      ', audit=' || v_audit_count ||
      ', nativeJson=' || v_native_json_count
    );
    DBMS_OUTPUT.PUT_LINE(
      'Retail readiness invariants: duality=' || v_duality_count ||
      ', graph=' || v_graph_count ||
      ', spatial=' || v_spatial_count ||
      ', vpdObjects=' || v_vpd_object_count ||
      ', vpdPolicies=' || v_vpd_policy_count ||
      ', context=' || v_context_count ||
      ', products=' || v_product_count || '/' || v_vector_count ||
      ', posts=' || v_post_count || '/' || v_post_vector_count ||
      ', momentum=' || v_momentum_post_count ||
      ', matches=' || v_semantic_match_count || '/' || v_expected_match_count ||
      ', vectorModel=' || v_vector_model_count ||
      ', columns=' || v_vector_column_count ||
      ', indexes=' || v_vector_index_count ||
      ', returnEvidence=' || v_return_evidence_count || '/' ||
        v_expected_return_evidence_count ||
      ', invalidReturnEvidence=' || v_invalid_return_evidence ||
      ', invalidVectors=' || v_invalid_product_vectors || '/' || v_invalid_post_vectors ||
      ', sourceMismatches=' || v_product_source_text_mismatches || '/' || v_post_source_text_mismatches ||
      ', embeddingMismatches=' || v_product_embedding_mismatches || '/' || v_post_embedding_mismatches ||
      ', generationEvidence=' || v_generation_evidence_count || '/' ||
        (v_product_count + v_post_count + v_semantic_match_count) ||
      ', evidenceMismatches=' || v_generation_evidence_mismatches ||
      ', matchGroups=' || v_incomplete_match_groups ||
      ', invalidMatches=' || v_invalid_matches ||
      ', deterministicMismatches=' || v_deterministic_match_mismatches
    );

    IF v_model_count <> 5
       OR v_registry_count <> 4
       OR v_training_count <> 4
       OR v_duality_count <> 2
       OR v_graph_count <> 1
       OR v_spatial_count <> 2
       OR v_native_json_count < 1
       OR v_vpd_object_count <>
            retail_vpd_inventory_pkg.protected_object_count()
       OR v_vpd_policy_count <>
            retail_vpd_inventory_pkg.installed_policy_count()
       OR v_context_count <> 1
       OR v_feature_plan_count <> 2
       OR v_product_count < 1
       OR v_vector_count <> v_product_count
       OR v_post_count < 1
       OR v_post_vector_count <> v_post_count
       OR v_momentum_post_count < 1
       OR v_semantic_match_count <> v_expected_match_count
       OR v_vector_model_count <> 1
       OR v_vector_column_count <> 3
       OR v_vector_index_count <> 3
       OR v_return_evidence_count <> v_expected_return_evidence_count
       OR v_return_evidence_count < 1
       OR v_invalid_return_evidence <> 0
       OR v_invalid_product_vectors <> 0
       OR v_invalid_post_vectors <> 0
       OR v_product_source_text_mismatches <> 0
       OR v_post_source_text_mismatches <> 0
       OR v_product_embedding_mismatches <> 0
       OR v_post_embedding_mismatches <> 0
       OR v_canonical_semantic_mismatches <> 0
       OR v_generation_evidence_count <>
            v_product_count + v_post_count + v_semantic_match_count
       OR v_generation_evidence_mismatches <> 0
       OR v_incomplete_match_groups <> 0
       OR v_invalid_matches <> 0
       OR v_deterministic_match_mismatches <> 0
       OR v_inmemory_count <> 5
       OR v_audit_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20532,
          'Complete generation-bound Retail readiness shape is not satisfied'
        );
    END IF;

    v_readiness := JSON_OBJECT(
      'generationId' VALUE v_generation,
      'datasetFingerprint' VALUE v_fingerprint,
      'inMemoryProofId' VALUE v_proof_id,
      'vectorAndOmlModels' VALUE v_model_count,
      'activeOmlRegistry' VALUE v_registry_count,
      'activeOmlTraining' VALUE v_training_count,
      'dualityViews' VALUE v_duality_count,
      'propertyGraphs' VALUE v_graph_count,
      'spatialIndexes' VALUE v_spatial_count,
      'nativeJsonRows' VALUE v_native_json_count,
      'vpdProtectedObjects' VALUE v_vpd_object_count,
      'vpdPolicies' VALUE v_vpd_policy_count,
      'trustedContexts' VALUE v_context_count,
      'featurePlanEvidence' VALUE v_feature_plan_count,
      'productVectors' VALUE v_vector_count,
      'products' VALUE v_product_count,
      'postVectors' VALUE v_post_vector_count,
      'posts' VALUE v_post_count,
      'momentumPosts' VALUE v_momentum_post_count,
      'semanticMatches' VALUE v_semantic_match_count,
      'expectedSemanticMatches' VALUE v_expected_match_count,
      'nativeVectorColumns' VALUE v_vector_column_count,
      'nativeVectorIndexes' VALUE v_vector_index_count,
      'returnEvidenceVectors' VALUE v_return_evidence_count,
      'expectedReturnEvidenceVectors'
        VALUE v_expected_return_evidence_count,
      'invalidReturnEvidenceVectors' VALUE v_invalid_return_evidence,
      'canonicalProductTextMismatches'
        VALUE v_product_source_text_mismatches,
      'canonicalPostTextMismatches'
        VALUE v_post_source_text_mismatches,
      'currentModelProductVectorMismatches'
        VALUE v_product_embedding_mismatches,
      'currentModelPostVectorMismatches'
        VALUE v_post_embedding_mismatches,
      'canonicalSemanticMismatches'
        VALUE v_canonical_semantic_mismatches,
      'generationBoundVectorEvidenceRows'
        VALUE v_generation_evidence_count,
      'generationBoundVectorEvidenceMismatches'
        VALUE v_generation_evidence_mismatches,
      'inmemoryTables' VALUE v_inmemory_count,
      'auditPolicies' VALUE v_audit_count,
      'unifiedAuditProof' VALUE JSON_OBJECT(
        'policyName' VALUE 'RETAIL_OPERATION_AUDIT',
        'evidenceBoundary' VALUE 'SYSTEM.RETAIL_AUDIT_EVIDENCE_PKG',
        'startedAt' VALUE :b_audit_started_at,
        'allowedClientIdentifier' VALUE :b_audit_allowed_client,
        'deniedClientIdentifier' VALUE :b_audit_denied_client,
        'policyRows' VALUE :b_audit_policy_rows,
        'enabledRows' VALUE :b_audit_enabled_rows,
        'allowedRows' VALUE :b_audit_allowed_rows,
        'allowedReturnCode' VALUE :b_audit_allowed_return_code,
        'deniedRows' VALUE :b_audit_denied_rows,
        'deniedReturnCode' VALUE :b_audit_denied_return_code,
        'returnCode' VALUE :b_audit_denied_return_code,
        'ready' VALUE 'true' FORMAT JSON
        RETURNING JSON
      )
      RETURNING JSON
    );

    UPDATE app_dataset_readiness
    SET dataset_source = v_source,
        dataset_version = v_version,
        status = 'ACTIVE',
        readiness = v_readiness,
        failure_message = NULL,
        activated_at = NVL(activated_at, SYSTIMESTAMP),
        updated_at = SYSTIMESTAMP
    WHERE readiness_id = 1;
    IF SQL%ROWCOUNT <> 1 THEN
        RAISE_APPLICATION_ERROR(-20533, 'Readiness publication affected zero rows');
    END IF;

    SELECT status,
           JSON_VALUE(readiness, '$.generationId'),
           JSON_VALUE(readiness, '$.inMemoryProofId')
    INTO v_published_status, v_published_generation, v_published_proof_id
    FROM app_dataset_readiness
    WHERE readiness_id = 1;

    IF v_published_status IS NULL
       OR v_published_generation IS NULL
       OR v_published_proof_id IS NULL
       OR v_published_status <> 'ACTIVE'
       OR v_published_generation <> v_generation
       OR v_published_proof_id <> v_proof_id THEN
        RAISE_APPLICATION_ERROR(-20534, 'Published readiness failed verification');
    END IF;

    COMMIT;
END;
/

PROMPT Retail current-generation readiness published with exact cursor evidence.
