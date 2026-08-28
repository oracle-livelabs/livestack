/*
 * Durable exact bootstrap evidence for Vector, Spatial, and In-Memory.
 *
 * Each tagged statement is immediately followed by capture of this session's
 * PREV_SQL_ID and PREV_CHILD_NUMBER. Only that exact child plan can satisfy
 * the generation record; historical/global cursor searches are forbidden.
 */
BEGIN
    media_security_pkg.set_user_context('admin_jess');
    FOR expected IN (
        SELECT 'CUSTOMERS' segment_name FROM dual UNION ALL
        SELECT 'ORDERS' FROM dual UNION ALL
        SELECT 'ORDER_ITEMS' FROM dual UNION ALL
        SELECT 'SOCIAL_POSTS' FROM dual
    ) LOOP
        DBMS_STATS.GATHER_TABLE_STATS(USER, expected.segment_name);
        DBMS_INMEMORY.POPULATE(USER, expected.segment_name);
    END LOOP;
END;
/

DECLARE
    v_count PLS_INTEGER := 0;
BEGIN
    FOR attempt IN 1..90 LOOP
        SELECT COUNT(*) INTO v_count
        FROM media_inmemory_segments_v
        WHERE table_inmemory = 'ENABLED'
          AND populate_status = 'COMPLETED'
          AND inmemory_bytes > 0
          AND bytes_not_populated = 0;
        EXIT WHEN v_count = 4;
        DBMS_SESSION.SLEEP(1);
    END LOOP;
    IF v_count <> 4 THEN
        RAISE_APPLICATION_ERROR(
          -20412,
          'Post-commit Media In-Memory population is incomplete'
        );
    END IF;
END;
/

DECLARE
    v_result_row_count PLS_INTEGER;
BEGIN
    SELECT LEAST(COUNT(*), 3)
    INTO v_result_row_count
    FROM product_embeddings
    WHERE embedding IS NOT NULL;
    IF v_result_row_count < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20413,
          'Exact bootstrap Vector execution would return no rows'
        );
    END IF;
END;
/

SET SERVEROUTPUT OFF

SELECT /*+ GATHER_PLAN_STATISTICS
           VECTOR_INDEX_TRANSFORM(embeddings idx_product_vec) */
       /* MEDIA_VECTOR_BOOTSTRAP_GEN_bootstrap-v1 */
       embeddings.product_id
FROM product_embeddings embeddings
ORDER BY VECTOR_DISTANCE(
  embeddings.embedding,
  VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING 'content demand' AS DATA),
  COSINE
)
FETCH APPROXIMATE FIRST 3 ROWS ONLY;

DECLARE
    v_sql_id      VARCHAR2(13);
    v_child       NUMBER;
    v_plan_hash   NUMBER;
    v_operation   VARCHAR2(60);
    v_options     VARCHAR2(60);
    v_object_name VARCHAR2(128);
    v_result_row_count       PLS_INTEGER;
    v_compact_index_rows     PLS_INTEGER;
    v_internal_object_rows   PLS_INTEGER;
    v_internal_pair_rows     PLS_INTEGER;
    v_forbidden_full_scans   PLS_INTEGER;
    v_binding_count          PLS_INTEGER;
    v_dataset_fingerprint    VARCHAR2(64);
    v_plan_fingerprint       VARCHAR2(64);
BEGIN
    SELECT prev_sql_id, prev_child_number
    INTO v_sql_id, v_child
    FROM sys.v_$session
    WHERE sid = SYS_CONTEXT('USERENV', 'SID');

    SELECT COUNT(CASE
             WHEN object_name = 'IDX_PRODUCT_VEC'
              AND operation = 'VECTOR INDEX'
              AND REGEXP_LIKE(options, 'IVF.*SCAN', 'i')
             THEN 1
           END),
           COUNT(CASE
             WHEN object_name LIKE 'VECTOR$IDX_PRODUCT_VEC$%'
             THEN 1
           END),
           COUNT(CASE
             WHEN operation = 'TABLE ACCESS'
              AND REGEXP_LIKE(options, '(^|[[:space:]])FULL($|[[:space:]])', 'i')
              AND object_name IN ('PRODUCT_EMBEDDINGS', 'POST_EMBEDDINGS')
             THEN 1
           END)
    INTO v_compact_index_rows, v_internal_object_rows,
         v_forbidden_full_scans
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child;

    SELECT COUNT(*)
    INTO v_internal_pair_rows
    FROM sys.v_$sql_plan centroids
    JOIN sys.v_$sql_plan partitions
      ON partitions.sql_id = centroids.sql_id
     AND partitions.child_number = centroids.child_number
     AND (
       partitions.object_name =
         REGEXP_REPLACE(
           centroids.object_name,
           '[$]IVF_FLAT_CENTROIDS$',
           ''
         ) || '$IVF_FLAT_CENTROID_PARTITIONS'
       OR partitions.object_name =
         REGEXP_REPLACE(
           centroids.object_name,
           '[$]IVF_FLAT_CENTROIDS$',
           ''
         ) || '$CENTROID_PARTITIONS'
     )
    WHERE centroids.sql_id = v_sql_id
      AND centroids.child_number = v_child
      AND centroids.operation = 'TABLE ACCESS'
      AND centroids.options = 'FULL'
      AND REGEXP_LIKE(
        centroids.object_name,
        '^VECTOR[$]IDX_PRODUCT_VEC[$].+[$]IVF_FLAT_CENTROIDS$'
      )
      AND partitions.operation = 'TABLE ACCESS'
      AND REGEXP_LIKE(
        partitions.options,
        '^(FULL|BY INDEX ROWID( BATCHED)?)$'
      );

    IF v_forbidden_full_scans <> 0
       OR NOT (
         (v_compact_index_rows = 1 AND v_internal_object_rows = 0)
         OR
         (v_compact_index_rows = 0
          AND v_internal_pair_rows = 1
          AND v_internal_object_rows = 2)
       ) THEN
        RAISE_APPLICATION_ERROR(
          -20413,
          'Exact bootstrap Vector plan lacks IDX_PRODUCT_VEC or contains a forbidden full scan'
        );
    END IF;

    IF v_compact_index_rows = 1 THEN
        SELECT operation, options, object_name, plan_hash_value
        INTO v_operation, v_options, v_object_name, v_plan_hash
        FROM sys.v_$sql_plan
        WHERE sql_id = v_sql_id
          AND child_number = v_child
          AND object_name = 'IDX_PRODUCT_VEC'
          AND operation = 'VECTOR INDEX'
          AND REGEXP_LIKE(options, 'IVF.*SCAN', 'i');
    ELSE
        SELECT 'VECTOR INDEX', 'IVF INTERNAL OBJECT PAIR',
               'IDX_PRODUCT_VEC', plan_hash_value
        INTO v_operation, v_options, v_object_name, v_plan_hash
        FROM (
          SELECT plan_hash_value
          FROM sys.v_$sql_plan
          WHERE sql_id = v_sql_id
            AND child_number = v_child
            AND REGEXP_LIKE(
              object_name,
              '^VECTOR[$]IDX_PRODUCT_VEC[$].+[$]IVF_FLAT_CENTROIDS$'
            )
          ORDER BY id
        )
        FETCH FIRST 1 ROW ONLY;
    END IF;

    SELECT LOWER(RAWTOHEX(STANDARD_HASH(
             LISTAGG(
               TO_CHAR(id) || '|' || NVL(operation, '~') || '|' ||
               NVL(options, '~') || '|' || NVL(object_owner, '~') || '|' ||
               NVL(object_name, '~') || '|' || TO_CHAR(plan_hash_value),
               CHR(10)
             ) WITHIN GROUP (ORDER BY id),
             'SHA256'
           )))
    INTO v_plan_fingerprint
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child;

    SELECT LEAST(COUNT(*), 3)
    INTO v_result_row_count
    FROM product_embeddings
    WHERE embedding IS NOT NULL;
    IF v_result_row_count < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20413,
          'Exact bootstrap Vector result became empty before publication'
        );
    END IF;

    SELECT source_fingerprint
    INTO v_dataset_fingerprint
    FROM app_oml_generations
    WHERE generation_id = 'bootstrap-v1'
      AND status IN ('validated', 'active');

    SELECT COUNT(*)
    INTO v_binding_count
    FROM user_indexes index_row
    JOIN user_ind_columns column_row
      ON column_row.index_name = index_row.index_name
    JOIN SYS.V_$VECTOR_INDEX vector_index
      ON vector_index.owner = USER
     AND vector_index.index_name = index_row.index_name
    WHERE index_row.index_name = 'IDX_PRODUCT_VEC'
      AND index_row.table_name = 'PRODUCT_EMBEDDINGS'
      AND index_row.status = 'VALID'
      AND index_row.index_type = 'VECTOR'
      AND REPLACE(UPPER(index_row.index_subtype), ' ', '_') =
          'NEIGHBOR_PARTITIONS_IVF'
      AND column_row.table_name = 'PRODUCT_EMBEDDINGS'
      AND column_row.column_name = 'EMBEDDING'
      AND column_row.column_position = 1
      AND NOT EXISTS (
        SELECT 1
        FROM user_ind_columns extra_column
        WHERE extra_column.index_name = index_row.index_name
          AND extra_column.column_position <> 1
      )
      AND UPPER(vector_index.distance_type) = 'COSINE'
      AND vector_index.index_dimensions = 384
      AND UPPER(vector_index.index_dim_type) = 'FLOAT32'
      AND UPPER(vector_index.index_organization) = 'NEIGHBOR PARTITIONS';
    IF v_binding_count <> 1
       OR NOT REGEXP_LIKE(v_dataset_fingerprint, '^[0-9a-f]{64}$') THEN
        RAISE_APPLICATION_ERROR(
          -20413,
          'Exact bootstrap Vector catalog/fingerprint binding is incomplete'
        );
    END IF;

    MERGE INTO app_feature_execution_evidence target
    USING (
      SELECT 'bootstrap-v1' generation_id, 'VECTOR' feature_name,
             v_sql_id sql_id, v_child child_number,
             v_plan_hash plan_hash_value, v_operation operation,
             v_options options, v_object_name object_name,
             v_result_row_count result_row_count,
             v_dataset_fingerprint dataset_fingerprint,
             v_plan_fingerprint plan_fingerprint,
             'PRODUCT_EMBEDDINGS' expected_table_name,
             'IDX_PRODUCT_VEC' expected_index_name,
             1 no_forbidden_full_scan
      FROM dual
    ) source
    ON (
      target.generation_id = source.generation_id
      AND target.feature_name = source.feature_name
    )
    WHEN MATCHED THEN UPDATE SET
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.operation = source.operation,
      target.options = source.options,
      target.object_name = source.object_name,
      target.result_row_count = source.result_row_count,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.plan_fingerprint = source.plan_fingerprint,
      target.expected_table_name = source.expected_table_name,
      target.expected_index_name = source.expected_index_name,
      target.no_forbidden_full_scan = source.no_forbidden_full_scan,
      target.evidence_status = 'VERIFIED',
      target.captured_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(
      generation_id, feature_name, sql_id, child_number, plan_hash_value,
      operation, options, object_name, result_row_count,
      dataset_fingerprint, plan_fingerprint, expected_table_name,
      expected_index_name, no_forbidden_full_scan,
      evidence_status, captured_at
    ) VALUES(
      source.generation_id, source.feature_name, source.sql_id,
      source.child_number, source.plan_hash_value, source.operation,
      source.options, source.object_name, source.result_row_count,
      source.dataset_fingerprint, source.plan_fingerprint,
      source.expected_table_name, source.expected_index_name,
      source.no_forbidden_full_scan, 'VERIFIED', SYSTIMESTAMP
    );
EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20413, 'Exact bootstrap Vector cursor proof is incomplete');
END;
/

WITH origin AS (
  SELECT location
  FROM (
    SELECT customer.location
    FROM customers customer
    WHERE customer.location IS NOT NULL
    ORDER BY customer.customer_id
  )
  WHERE ROWNUM = 1
),
indexed_candidates AS (
  SELECT /*+ GATHER_PLAN_STATISTICS LEADING(origin)
             USE_NL(center) INDEX(center idx_fc_spatial) */
         /* MEDIA_SPATIAL_BOOTSTRAP_GEN_bootstrap-v1 */
         'bootstrap-v1' proof_generation_id,
         center.center_id,
         center.location center_location,
         origin.location origin_location
  FROM origin
  JOIN fulfillment_centers center
    ON SDO_NN(
         center.location,
         origin.location,
         'sdo_batch_size=50 unit=KM'
       ) = 'TRUE'
  WHERE center.location IS NOT NULL
)
SELECT proof_generation_id,
       center_id,
       ROUND(
         SDO_GEOM.SDO_DISTANCE(
           origin_location,
           center_location,
           0.005,
           'unit=KM'
         ),
         5
       ) distance_km
FROM indexed_candidates
ORDER BY distance_km, center_id
FETCH FIRST 3 ROWS ONLY;

DECLARE
    v_sql_id      VARCHAR2(13);
    v_child       NUMBER;
    v_plan_hash   NUMBER;
    v_operation   VARCHAR2(60);
    v_options     VARCHAR2(60);
    v_object_name VARCHAR2(128);
    v_result_row_count       PLS_INTEGER;
    v_expected_index_rows    PLS_INTEGER;
    v_unexpected_domain_rows PLS_INTEGER;
    v_forbidden_full_scans   PLS_INTEGER;
    v_binding_count          PLS_INTEGER;
    v_dataset_fingerprint    VARCHAR2(64);
    v_plan_fingerprint       VARCHAR2(64);
BEGIN
    SELECT prev_sql_id, prev_child_number
    INTO v_sql_id, v_child
    FROM sys.v_$session
    WHERE sid = SYS_CONTEXT('USERENV', 'SID');

    IF v_sql_id IS NULL
       OR NOT REGEXP_LIKE(v_sql_id, '^[a-z0-9]{13}$', 'i')
       OR v_child IS NULL
       OR v_child < 0 THEN
        RAISE_APPLICATION_ERROR(
          -20414,
          'Exact bootstrap Spatial current-session cursor identity is invalid'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_binding_count
    FROM user_indexes index_row
    JOIN user_ind_columns column_row
      ON column_row.index_name = index_row.index_name
     AND column_row.table_name = index_row.table_name
    JOIN user_sdo_geom_metadata metadata_row
      ON metadata_row.table_name = index_row.table_name
     AND metadata_row.column_name = column_row.column_name
    WHERE index_row.index_name = 'IDX_FC_SPATIAL'
      AND index_row.table_name = 'FULFILLMENT_CENTERS'
      AND index_row.index_type = 'DOMAIN'
      AND index_row.status = 'VALID'
      AND index_row.domidx_status = 'VALID'
      AND index_row.domidx_opstatus = 'VALID'
      AND index_row.ityp_owner = 'MDSYS'
      AND index_row.ityp_name = 'SPATIAL_INDEX_V2'
      AND column_row.column_name = 'LOCATION'
      AND column_row.column_position = 1
      AND metadata_row.srid = 4326
      AND (
        SELECT COUNT(*)
        FROM TABLE(metadata_row.diminfo) dim_element
      ) = 2
      AND NOT EXISTS (
        SELECT 1
        FROM user_ind_columns extra_column
        WHERE extra_column.index_name = index_row.index_name
          AND extra_column.table_name = index_row.table_name
          AND extra_column.column_position <> 1
      );
    IF v_binding_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20414,
          'Exact bootstrap Spatial catalog and geometry metadata binding is incomplete'
        );
    END IF;

    SELECT
      COUNT(CASE
        WHEN object_name = 'IDX_FC_SPATIAL'
         AND REGEXP_LIKE(
           operation || ' ' || NVL(options, ''),
           'DOMAIN INDEX|SPATIAL',
           'i'
         )
        THEN 1
      END),
      COUNT(CASE
        WHEN REGEXP_LIKE(
          operation || ' ' || NVL(options, ''),
          'DOMAIN INDEX|SPATIAL',
          'i'
        )
         AND NVL(object_name, '~') <> 'IDX_FC_SPATIAL'
        THEN 1
      END),
      COUNT(CASE
        WHEN operation = 'TABLE ACCESS'
         AND REGEXP_LIKE(
           NVL(options, ''),
           '(^|[[:space:]])FULL($|[[:space:]])',
           'i'
         )
         AND object_name = 'FULFILLMENT_CENTERS'
        THEN 1
      END)
    INTO v_expected_index_rows,
         v_unexpected_domain_rows,
         v_forbidden_full_scans
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child;

    IF v_expected_index_rows <> 1
       OR v_unexpected_domain_rows <> 0
       OR v_forbidden_full_scans <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20414,
          'Exact bootstrap Spatial plan is incomplete, ambiguous, or contains a forbidden full scan'
        );
    END IF;

    SELECT operation, options, object_name, plan_hash_value
    INTO v_operation, v_options, v_object_name, v_plan_hash
    FROM (
      SELECT operation, options, object_name, plan_hash_value
      FROM sys.v_$sql_plan
      WHERE sql_id = v_sql_id
        AND child_number = v_child
        AND object_name = 'IDX_FC_SPATIAL'
        AND REGEXP_LIKE(
          operation || ' ' || NVL(options, ''),
          'DOMAIN INDEX|SPATIAL',
          'i'
        )
      ORDER BY id
    )
    FETCH FIRST 1 ROW ONLY;

    IF v_plan_hash IS NULL OR v_plan_hash <= 0 THEN
        RAISE_APPLICATION_ERROR(
          -20414,
          'Exact bootstrap Spatial plan hash is invalid'
        );
    END IF;

    SELECT LOWER(RAWTOHEX(STANDARD_HASH(
             LISTAGG(
               TO_CHAR(id) || '|' || NVL(operation, '~') || '|' ||
               NVL(options, '~') || '|' || NVL(object_owner, '~') || '|' ||
               NVL(object_name, '~') || '|' || TO_CHAR(plan_hash_value),
               CHR(10)
             ) WITHIN GROUP (ORDER BY id),
             'SHA256'
           )))
    INTO v_plan_fingerprint
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child;

    SELECT MAX(rows_processed)
    INTO v_result_row_count
    FROM sys.v_$sql
    WHERE sql_id = v_sql_id
      AND child_number = v_child;
    IF v_result_row_count IS NULL OR v_result_row_count < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20414,
          'Exact bootstrap Spatial current-session execution returned no rows'
        );
    END IF;

    SELECT source_fingerprint
    INTO v_dataset_fingerprint
    FROM app_oml_generations
    WHERE generation_id = 'bootstrap-v1'
      AND status IN ('validated', 'active');
    IF NOT REGEXP_LIKE(v_dataset_fingerprint, '^[0-9a-f]{64}$') THEN
        RAISE_APPLICATION_ERROR(
          -20414,
          'Exact bootstrap Spatial dataset fingerprint is invalid'
        );
    END IF;

    MERGE INTO app_feature_execution_evidence target
    USING (
      SELECT 'bootstrap-v1' generation_id, 'SPATIAL' feature_name,
             v_sql_id sql_id, v_child child_number,
             v_plan_hash plan_hash_value, v_operation operation,
             v_options options, v_object_name object_name,
             v_result_row_count result_row_count,
             v_dataset_fingerprint dataset_fingerprint,
             v_plan_fingerprint plan_fingerprint,
             'FULFILLMENT_CENTERS' expected_table_name,
             'IDX_FC_SPATIAL' expected_index_name,
             1 no_forbidden_full_scan
      FROM dual
    ) source
    ON (
      target.generation_id = source.generation_id
      AND target.feature_name = source.feature_name
    )
    WHEN MATCHED THEN UPDATE SET
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.operation = source.operation,
      target.options = source.options,
      target.object_name = source.object_name,
      target.result_row_count = source.result_row_count,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.plan_fingerprint = source.plan_fingerprint,
      target.expected_table_name = source.expected_table_name,
      target.expected_index_name = source.expected_index_name,
      target.no_forbidden_full_scan = source.no_forbidden_full_scan,
      target.evidence_status = 'VERIFIED',
      target.captured_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(
      generation_id, feature_name, sql_id, child_number, plan_hash_value,
      operation, options, object_name, result_row_count,
      dataset_fingerprint, plan_fingerprint, expected_table_name,
      expected_index_name, no_forbidden_full_scan,
      evidence_status, captured_at
    ) VALUES(
      source.generation_id, source.feature_name, source.sql_id,
      source.child_number, source.plan_hash_value, source.operation,
      source.options, source.object_name, source.result_row_count,
      source.dataset_fingerprint, source.plan_fingerprint,
      source.expected_table_name, source.expected_index_name,
      source.no_forbidden_full_scan, 'VERIFIED', SYSTIMESTAMP
    );
EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20414, 'Exact bootstrap Spatial cursor proof is incomplete');
END;
/

ALTER SESSION SET INMEMORY_QUERY = ENABLE;
SELECT /*+ GATHER_PLAN_STATISTICS FULL(customer) NO_INDEX(customer) */
       /* MEDIA_INMEMORY_DURABLE_PROOF_GEN_bootstrap-v1 */
       'bootstrap-v1' proof_generation_id,
       customer.customer_tier,
       COUNT(*) customer_count,
       SUM(customer.lifetime_value) total_lifetime_value
FROM customers customer
GROUP BY customer.customer_tier
ORDER BY customer.customer_tier;

DECLARE
    v_sql_id      VARCHAR2(13);
    v_child       NUMBER;
    v_plan_hash   NUMBER;
    v_operation   VARCHAR2(60);
    v_options     VARCHAR2(60);
    v_object_name VARCHAR2(128);
    v_result_row_count       PLS_INTEGER;
    v_expected_plan_rows     PLS_INTEGER;
    v_unexpected_plan_rows   PLS_INTEGER;
    v_forbidden_full_scans   PLS_INTEGER;
    v_segment_count          PLS_INTEGER;
    v_dataset_fingerprint    VARCHAR2(64);
    v_plan_fingerprint       VARCHAR2(64);
BEGIN
    SELECT prev_sql_id, prev_child_number
    INTO v_sql_id, v_child
    FROM sys.v_$session
    WHERE sid = SYS_CONTEXT('USERENV', 'SID');

    IF v_sql_id IS NULL
       OR NOT REGEXP_LIKE(v_sql_id, '^[a-z0-9]{13}$', 'i')
       OR v_child IS NULL
       OR v_child < 0 THEN
        RAISE_APPLICATION_ERROR(
          -20415,
          'Exact bootstrap In-Memory current-session cursor identity is invalid'
        );
    END IF;

    SELECT COUNT(*)
    INTO v_segment_count
    FROM media_inmemory_segments_v
    WHERE segment_name IN (
      'CUSTOMERS',
      'ORDERS',
      'ORDER_ITEMS',
      'SOCIAL_POSTS'
    )
      AND table_inmemory = 'ENABLED'
      AND inmemory_priority = 'HIGH'
      AND inmemory_compression = 'FOR QUERY LOW'
      AND populate_status = 'COMPLETED'
      AND row_count > 0
      AND inmemory_bytes > 0
      AND bytes_not_populated = 0;
    IF v_segment_count <> 4 THEN
        RAISE_APPLICATION_ERROR(
          -20415,
          'Exact bootstrap In-Memory four-segment inventory is incomplete'
        );
    END IF;

    SELECT
      COUNT(CASE
        WHEN operation = 'TABLE ACCESS'
         AND options = 'INMEMORY FULL'
         AND object_name = 'CUSTOMERS'
        THEN 1
      END),
      COUNT(CASE
        WHEN operation = 'TABLE ACCESS'
         AND options = 'INMEMORY FULL'
         AND NVL(object_name, '~') <> 'CUSTOMERS'
        THEN 1
      END),
      COUNT(CASE
        WHEN operation = 'TABLE ACCESS'
         AND options = 'FULL'
         AND object_name = 'CUSTOMERS'
        THEN 1
      END)
    INTO v_expected_plan_rows,
         v_unexpected_plan_rows,
         v_forbidden_full_scans
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child;

    IF v_expected_plan_rows <> 1
       OR v_unexpected_plan_rows <> 0
       OR v_forbidden_full_scans <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20415,
          'Exact bootstrap In-Memory plan is incomplete, ambiguous, or contains a conventional full scan'
        );
    END IF;

    SELECT operation, options, object_name, plan_hash_value
    INTO v_operation, v_options, v_object_name, v_plan_hash
    FROM (
      SELECT operation, options, object_name, plan_hash_value
      FROM sys.v_$sql_plan
      WHERE sql_id = v_sql_id
        AND child_number = v_child
        AND operation = 'TABLE ACCESS'
        AND options = 'INMEMORY FULL'
        AND object_owner = USER
        AND object_name = 'CUSTOMERS'
      ORDER BY id
    )
    FETCH FIRST 1 ROW ONLY;

    IF v_plan_hash IS NULL OR v_plan_hash <= 0 THEN
        RAISE_APPLICATION_ERROR(
          -20415,
          'Exact bootstrap In-Memory plan hash is invalid'
        );
    END IF;

    SELECT LOWER(RAWTOHEX(STANDARD_HASH(
             LISTAGG(
               TO_CHAR(id) || '|' || NVL(operation, '~') || '|' ||
               NVL(options, '~') || '|' || NVL(object_owner, '~') || '|' ||
               NVL(object_name, '~') || '|' || TO_CHAR(plan_hash_value),
               CHR(10)
             ) WITHIN GROUP (ORDER BY id),
             'SHA256'
           )))
    INTO v_plan_fingerprint
    FROM sys.v_$sql_plan
    WHERE sql_id = v_sql_id
      AND child_number = v_child;

    SELECT COUNT(*)
    INTO v_result_row_count
    FROM (
      SELECT customer.customer_tier,
             COUNT(*) customer_count,
             SUM(customer.lifetime_value) total_lifetime_value
      FROM customers customer
      GROUP BY customer.customer_tier
    );
    IF v_result_row_count IS NULL OR v_result_row_count < 1 THEN
        RAISE_APPLICATION_ERROR(
          -20415,
          'Exact bootstrap In-Memory current-session execution returned no rows'
        );
    END IF;

    SELECT source_fingerprint
    INTO v_dataset_fingerprint
    FROM app_oml_generations
    WHERE generation_id = 'bootstrap-v1'
      AND status IN ('validated', 'active');
    IF NOT REGEXP_LIKE(v_dataset_fingerprint, '^[0-9a-f]{64}$') THEN
        RAISE_APPLICATION_ERROR(
          -20415,
          'Exact bootstrap In-Memory dataset fingerprint is invalid'
        );
    END IF;

    MERGE INTO app_feature_execution_evidence target
    USING (
      SELECT 'bootstrap-v1' generation_id, 'INMEMORY' feature_name,
             v_sql_id sql_id, v_child child_number,
             v_plan_hash plan_hash_value, v_operation operation,
             v_options options, v_object_name object_name,
             v_result_row_count result_row_count,
             v_dataset_fingerprint dataset_fingerprint,
             v_plan_fingerprint plan_fingerprint,
             'CUSTOMERS' expected_table_name,
             CAST(NULL AS VARCHAR2(128)) expected_index_name,
             1 no_forbidden_full_scan
      FROM dual
    ) source
    ON (
      target.generation_id = source.generation_id
      AND target.feature_name = source.feature_name
    )
    WHEN MATCHED THEN UPDATE SET
      target.sql_id = source.sql_id,
      target.child_number = source.child_number,
      target.plan_hash_value = source.plan_hash_value,
      target.operation = source.operation,
      target.options = source.options,
      target.object_name = source.object_name,
      target.result_row_count = source.result_row_count,
      target.dataset_fingerprint = source.dataset_fingerprint,
      target.plan_fingerprint = source.plan_fingerprint,
      target.expected_table_name = source.expected_table_name,
      target.expected_index_name = source.expected_index_name,
      target.no_forbidden_full_scan = source.no_forbidden_full_scan,
      target.evidence_status = 'VERIFIED',
      target.captured_at = SYSTIMESTAMP
    WHEN NOT MATCHED THEN INSERT(
      generation_id, feature_name, sql_id, child_number, plan_hash_value,
      operation, options, object_name, result_row_count,
      dataset_fingerprint, plan_fingerprint, expected_table_name,
      expected_index_name, no_forbidden_full_scan,
      evidence_status, captured_at
    ) VALUES(
      source.generation_id, source.feature_name, source.sql_id,
      source.child_number, source.plan_hash_value, source.operation,
      source.options, source.object_name, source.result_row_count,
      source.dataset_fingerprint, source.plan_fingerprint,
      source.expected_table_name, source.expected_index_name,
      source.no_forbidden_full_scan, 'VERIFIED', SYSTIMESTAMP
    );
EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20415, 'Exact bootstrap In-Memory cursor proof is incomplete');
END;
/

COMMIT;
BEGIN
    media_security_pkg.clear_user_context;
END;
/

SET SERVEROUTPUT ON
