/*
 * Activate the bundled dataset only after fresh bootstrap has proven every
 * required Oracle asset. Retained/custom datasets are never overwritten by
 * this script; bootstrap invokes it only for a newly created schema.
 */
BEGIN
    media_security_pkg.set_user_context('admin_jess');
END;
/

MERGE INTO app_dataset_jobs target
USING (
  SELECT 'bootstrap-media-v1' job_id, 'bootstrap-v1' generation_id
  FROM dual
) source
ON (target.job_id = source.job_id)
WHEN MATCHED THEN UPDATE SET
  target.operation = 'bootstrap',
  target.status = 'running',
  target.phase = 'verifying',
  target.candidate_generation_id = source.generation_id,
  target.progress = 99,
  target.message = 'Verifying the bundled Media generation.',
  target.payload = JSON_OBJECT(
    'jobId' VALUE source.job_id,
    'operation' VALUE 'bootstrap',
    'status' VALUE 'running',
    'phase' VALUE 'verifying',
    'progress' VALUE 99,
    'candidateGenerationId' VALUE source.generation_id,
    'datasetVersion' VALUE 'v1'
    RETURNING JSON
  ),
  target.updated_at = SYSTIMESTAMP,
  target.heartbeat_at = SYSTIMESTAMP,
  target.started_at = NVL(target.started_at, SYSTIMESTAMP),
  target.completed_at = NULL
WHEN NOT MATCHED THEN INSERT(
  job_id, operation, status, phase, candidate_generation_id, progress,
  message, payload, created_at, updated_at, heartbeat_at, started_at
) VALUES(
  source.job_id, 'bootstrap', 'running', 'verifying',
  source.generation_id, 99, 'Verifying the bundled Media generation.',
  JSON_OBJECT(
    'jobId' VALUE source.job_id,
    'operation' VALUE 'bootstrap',
    'status' VALUE 'running',
    'phase' VALUE 'verifying',
    'progress' VALUE 99,
    'candidateGenerationId' VALUE source.generation_id,
    'datasetVersion' VALUE 'v1'
    RETURNING JSON
  ),
  SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
);

MERGE INTO app_dataset_attempts target
USING (
  SELECT 'bootstrap-media-v1' job_id, 'bootstrap-v1' generation_id
  FROM dual
) source
ON (target.job_id = source.job_id)
WHEN MATCHED THEN UPDATE SET
  target.candidate_generation_id = source.generation_id,
  target.attempted_version = 'v1',
  target.phase = 'verifying',
  target.status = 'running',
  target.failure_message = NULL,
  target.updated_at = SYSTIMESTAMP,
  target.completed_at = NULL
WHEN NOT MATCHED THEN INSERT(
  job_id, candidate_generation_id, attempted_version, phase, status,
  created_at, updated_at
) VALUES(
  source.job_id, source.generation_id, 'v1', 'verifying', 'running',
  SYSTIMESTAMP, SYSTIMESTAMP
);

DECLARE
    v_denied BOOLEAN := FALSE;
    v_denied_return_code PLS_INTEGER := NULL;
    v_target_center_id fulfillment_centers.center_id%TYPE;
    v_target_state fulfillment_centers.state_province%TYPE;
BEGIN
    SELECT center_id, state_province
    INTO v_target_center_id, v_target_state
    FROM (
      SELECT center_id, state_province
      FROM fulfillment_centers
      WHERE UPPER(state_province) = 'CALIFORNIA'
      ORDER BY center_id
    )
    WHERE ROWNUM = 1;
    IF v_target_state <> 'California' THEN
        RAISE_APPLICATION_ERROR(-20431, 'Bootstrap VPD audit target is invalid');
    END IF;

    UPDATE /* MEDIA_AUDIT_ALLOWED_bootstrap_v1 */ orders
    SET updated_at = updated_at
    WHERE order_id = (SELECT MIN(order_id) FROM orders);
    IF SQL%ROWCOUNT <> 1 THEN
        RAISE_APPLICATION_ERROR(-20431, 'Bootstrap allowed audit statement affected no row');
    END IF;

    BEGIN
        media_security_pkg.set_user_context('fm_west_maria');
        BEGIN
            UPDATE /* MEDIA_AUDIT_DENIED_bootstrap_v1 */ fulfillment_centers
            SET state_province = 'Georgia'
            WHERE center_id = v_target_center_id;
        EXCEPTION
            WHEN OTHERS THEN
              IF SQLCODE = -28115 THEN
                  v_denied := TRUE;
                  v_denied_return_code := 28115;
              ELSE
                  RAISE;
              END IF;
        END;
        media_security_pkg.set_user_context('admin_jess');
    EXCEPTION
        WHEN OTHERS THEN
          media_security_pkg.set_user_context('admin_jess');
          RAISE;
    END;
    IF NOT v_denied OR v_denied_return_code <> 28115 THEN
        RAISE_APPLICATION_ERROR(-20432, 'Bootstrap VPD UPDATE_CHECK did not return ORA-28115');
    END IF;

    SELECT state_province
    INTO v_target_state
    FROM fulfillment_centers
    WHERE center_id = v_target_center_id;
    IF v_target_state <> 'California' THEN
        RAISE_APPLICATION_ERROR(-20434, 'Bootstrap VPD UPDATE_CHECK changed its target row');
    END IF;
END;
/
COMMIT;

DECLARE
    v_model_count                 PLS_INTEGER;
    v_source_products             PLS_INTEGER;
    v_source_posts                PLS_INTEGER;
    v_momentum_posts              PLS_INTEGER;
    v_product_vectors             PLS_INTEGER;
    v_post_vectors                PLS_INTEGER;
    v_semantic_matches            PLS_INTEGER;
    v_expected_matches            PLS_INTEGER;
    v_vector_columns              PLS_INTEGER;
    v_vector_indexes              PLS_INTEGER;
    v_invalid_descriptors         PLS_INTEGER;
    v_invalid_provenance          PLS_INTEGER;
    v_orphan_vectors              PLS_INTEGER;
    v_incomplete_groups           PLS_INTEGER;
    v_invalid_matches             PLS_INTEGER;
    v_deterministic_mismatches    PLS_INTEGER;
BEGIN
    SELECT
      (SELECT COUNT(*) FROM user_mining_models
       WHERE model_name = 'ALL_MINILM_L12_V2'
         AND UPPER(mining_function) = 'EMBEDDING'
         AND UPPER(algorithm) = 'ONNX'),
      (SELECT COUNT(*) FROM products WHERE is_active = 1),
      (SELECT COUNT(*) FROM social_posts),
      (SELECT COUNT(*) FROM social_posts
       WHERE momentum_flag IN ('viral', 'mega_viral')),
      (SELECT COUNT(*) FROM product_embeddings),
      (SELECT COUNT(*) FROM post_embeddings),
      (SELECT COUNT(*) FROM semantic_matches),
      (
        (SELECT COUNT(*) FROM social_posts
         WHERE momentum_flag IN ('viral', 'mega_viral'))
        * LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
      ),
      (SELECT COUNT(*)
       FROM user_tab_columns
       WHERE data_type = 'VECTOR'
         AND REPLACE(UPPER(vector_info), ' ', '') =
             'VECTOR(384,FLOAT32,DENSE)'
         AND (
           (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
           OR
           (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
         )),
      (SELECT COUNT(*)
       FROM user_indexes
       WHERE index_name IN ('IDX_PRODUCT_VEC', 'IDX_POST_VEC')
         AND status = 'VALID'),
      (SELECT COUNT(*)
       FROM (
         SELECT embedding FROM product_embeddings
         UNION ALL
         SELECT embedding FROM post_embeddings
       )
       WHERE embedding IS NULL
          OR VECTOR_DIMENSION_COUNT(embedding) <> 384
          OR UPPER(VECTOR_DIMENSION_FORMAT(embedding)) <> 'FLOAT32'),
      (
        (SELECT COUNT(*)
         FROM product_embeddings vector_row
         WHERE vector_row.embedding_text IS NULL
            OR NVL(DBMS_LOB.GETLENGTH(vector_row.embedding_text), 0) = 0
            OR vector_row.embedding_model IS NULL
            OR vector_row.embedding_model <> 'all_MiniLM_L12_v2')
        +
        (SELECT COUNT(*)
         FROM post_embeddings vector_row
         WHERE vector_row.embedding_text IS NULL
            OR NVL(DBMS_LOB.GETLENGTH(vector_row.embedding_text), 0) = 0
            OR vector_row.embedding_model IS NULL
            OR vector_row.embedding_model <> 'all_MiniLM_L12_v2')
      ),
      (
        (SELECT COUNT(*)
         FROM product_embeddings vector_row
         WHERE NOT EXISTS (
           SELECT 1
           FROM products source_row
           WHERE source_row.product_id = vector_row.product_id
             AND source_row.is_active = 1
         ))
        +
        (SELECT COUNT(*)
         FROM post_embeddings vector_row
         WHERE NOT EXISTS (
           SELECT 1
           FROM social_posts source_row
           WHERE source_row.post_id = vector_row.post_id
         ))
      )
    INTO
      v_model_count,
      v_source_products,
      v_source_posts,
      v_momentum_posts,
      v_product_vectors,
      v_post_vectors,
      v_semantic_matches,
      v_expected_matches,
      v_vector_columns,
      v_vector_indexes,
      v_invalid_descriptors,
      v_invalid_provenance,
      v_orphan_vectors
    FROM dual;

    SELECT COUNT(*)
    INTO v_incomplete_groups
    FROM (
      SELECT post.post_id
      FROM social_posts post
      LEFT JOIN semantic_matches match_row
        ON match_row.post_id = post.post_id
      WHERE post.momentum_flag IN ('viral', 'mega_viral')
      GROUP BY post.post_id
      HAVING COUNT(match_row.match_id) <> LEAST(v_source_products, 3)
          OR MIN(match_row.match_rank) <> 1
          OR MAX(match_row.match_rank) <> LEAST(v_source_products, 3)
          OR COUNT(DISTINCT match_row.match_rank)
             <> LEAST(v_source_products, 3)
          OR COUNT(DISTINCT match_row.product_id)
             <> LEAST(v_source_products, 3)
    );

    SELECT COUNT(*)
    INTO v_invalid_matches
    FROM semantic_matches match_row
    WHERE NOT EXISTS (
            SELECT 1
            FROM social_posts post
            WHERE post.post_id = match_row.post_id
              AND post.momentum_flag IN ('viral', 'mega_viral')
          )
       OR NOT EXISTS (
            SELECT 1
            FROM products product
            WHERE product.product_id = match_row.product_id
              AND product.is_active = 1
          )
       OR match_row.similarity_score IS NULL
       OR match_row.similarity_score < -1
       OR match_row.similarity_score > 1
       OR match_row.match_rank IS NULL
       OR match_row.match_rank < 1
       OR match_row.match_rank > LEAST(v_source_products, 3)
       OR match_row.match_method IS NULL
       OR match_row.match_method <> 'vector';

    WITH ranked_expected AS (
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
      FROM ranked_expected
      WHERE match_rank <= 3
    )
    SELECT COUNT(*)
    INTO v_deterministic_mismatches
    FROM expected_matches expected_row
    FULL OUTER JOIN semantic_matches actual_row
      ON actual_row.post_id = expected_row.post_id
     AND actual_row.match_rank = expected_row.match_rank
    WHERE expected_row.post_id IS NULL
       OR actual_row.post_id IS NULL
       OR actual_row.product_id <> expected_row.product_id
       OR actual_row.similarity_score IS NULL
       OR actual_row.match_rank IS NULL
       OR ABS(actual_row.similarity_score - expected_row.similarity_score)
            > 0.00001
       OR actual_row.match_method IS NULL
       OR actual_row.match_method <> 'vector';

    IF v_model_count <> 1
       OR v_source_products < 1
       OR v_source_posts < 1
       OR v_momentum_posts < 1
       OR v_product_vectors <> v_source_products
       OR v_post_vectors <> v_source_posts
       OR v_semantic_matches <> v_expected_matches
       OR v_vector_columns <> 2
       OR v_vector_indexes <> 2
       OR v_invalid_descriptors <> 0
       OR v_invalid_provenance <> 0
       OR v_orphan_vectors <> 0
       OR v_incomplete_groups <> 0
       OR v_invalid_matches <> 0
       OR v_deterministic_mismatches <> 0 THEN
        RAISE_APPLICATION_ERROR(
          -20435,
          'Fresh Media Vector descriptor, provenance, or deterministic coverage is incomplete'
        );
    END IF;
END;
/

DECLARE
    v_failures PLS_INTEGER;
BEGIN
    SELECT
      CASE WHEN
        (SELECT COUNT(*) FROM user_mining_models
         WHERE model_name = 'ALL_MINILM_L12_V2'
           AND UPPER(mining_function) = 'EMBEDDING'
           AND UPPER(algorithm) = 'ONNX') = 1
        AND (SELECT COUNT(*) FROM user_mining_models
             WHERE model_name IN (
               'DEMAND_SURGE_MODEL','CUSTOMER_SEGMENT_MODEL',
               'REVENUE_PREDICT_MODEL','PRODUCT_CLUSTER_MODEL'
             )) = 4
        AND (SELECT COUNT(*) FROM app_oml_model_registry
             WHERE generation_id = 'bootstrap-v1'
               AND training_fingerprint IS NOT NULL
               AND training_row_count > 0) = 4
        AND (SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL)
            = (SELECT COUNT(*) FROM products WHERE is_active = 1)
        AND (SELECT COUNT(*) FROM post_embeddings WHERE embedding IS NOT NULL)
            = (SELECT COUNT(*) FROM social_posts)
        AND (SELECT COUNT(*) FROM product_attributes) = (SELECT COUNT(*) FROM products)
        AND (SELECT COUNT(*) FROM social_post_payloads) = (SELECT COUNT(*) FROM social_posts)
        AND (SELECT COUNT(*) FROM event_stream) > 0
        AND (SELECT COUNT(*) FROM user_json_duality_views
             WHERE view_name IN ('ORDERS_DV','PRODUCTS_INVENTORY_DV')) = 2
        AND (SELECT COUNT(*) FROM user_property_graphs
             WHERE graph_name = 'INFLUENCER_NETWORK') = 1
        AND (SELECT COUNT(*) FROM user_indexes
             WHERE index_name IN ('IDX_FC_SPATIAL','IDX_CUST_SPATIAL')
               AND status = 'VALID') = 2
        -- 36 canonical Media objects plus the four OML settings tables and
        -- four active generation training views each require the paired
        -- SELECT and DML policies installed after OML provenance is loaded.
        AND (SELECT COUNT(*) FROM user_policies
             WHERE policy_type IN ('CONTEXT SENSITIVE','CONTEXT_SENSITIVE')) = 88
        AND (SELECT COUNT(*) FROM media_inmemory_segments_v
             WHERE table_inmemory = 'ENABLED'
               AND populate_status = 'COMPLETED'
               AND inmemory_bytes > 0
               AND bytes_not_populated = 0) = 4
        AND (SELECT COUNT(*) FROM app_feature_execution_evidence
             WHERE generation_id = 'bootstrap-v1'
               AND feature_name IN ('VECTOR','SPATIAL','INMEMORY')
               AND evidence_status = 'VERIFIED') = 3
        AND (SELECT COUNT(*) FROM app_feature_execution_evidence
             WHERE generation_id = 'bootstrap-v1'
               AND feature_name = 'VECTOR'
               AND sql_id IS NOT NULL
               AND child_number IS NOT NULL
               AND plan_hash_value IS NOT NULL
               AND plan_hash_value > 0
               AND dataset_fingerprint = (
                 SELECT source_fingerprint
                 FROM app_oml_generations
                 WHERE generation_id = 'bootstrap-v1'
               )
               AND result_row_count > 0
               AND expected_table_name = 'PRODUCT_EMBEDDINGS'
               AND expected_index_name = 'IDX_PRODUCT_VEC'
               AND no_forbidden_full_scan = 1
               AND plan_fingerprint IS NOT NULL) = 1
        AND (SELECT COUNT(*) FROM app_feature_execution_evidence
             WHERE generation_id = 'bootstrap-v1'
               AND feature_name = 'SPATIAL'
               AND sql_id IS NOT NULL
               AND child_number IS NOT NULL
               AND plan_hash_value IS NOT NULL
               AND plan_hash_value > 0
               AND object_name = 'IDX_FC_SPATIAL'
               AND result_row_count > 0
               AND dataset_fingerprint = (
                 SELECT source_fingerprint
                 FROM app_oml_generations
                 WHERE generation_id = 'bootstrap-v1'
               )
               AND plan_fingerprint IS NOT NULL
               AND expected_table_name = 'FULFILLMENT_CENTERS'
               AND expected_index_name = 'IDX_FC_SPATIAL'
               AND no_forbidden_full_scan = 1
               AND evidence_status = 'VERIFIED') = 1
        AND (SELECT COUNT(*) FROM app_feature_execution_evidence
             WHERE generation_id = 'bootstrap-v1'
               AND feature_name = 'INMEMORY'
               AND sql_id IS NOT NULL
               AND child_number IS NOT NULL
               AND plan_hash_value IS NOT NULL
               AND plan_hash_value > 0
               AND object_name = 'CUSTOMERS'
               AND result_row_count > 0
               AND dataset_fingerprint = (
                 SELECT source_fingerprint
                 FROM app_oml_generations
                 WHERE generation_id = 'bootstrap-v1'
               )
               AND plan_fingerprint IS NOT NULL
               AND expected_table_name = 'CUSTOMERS'
               AND expected_index_name IS NULL
               AND no_forbidden_full_scan = 1
               AND evidence_status = 'VERIFIED') = 1
        AND (SELECT COUNT(*) FROM sys.audit_unified_enabled_policies
             WHERE policy_name = 'SC_ORDER_AUDIT'
               AND entity_name = 'ALL USERS') = 1
      THEN 0 ELSE 1 END
    INTO v_failures
    FROM dual;

    IF v_failures <> 0 THEN
        RAISE_APPLICATION_ERROR(-20430, 'Fresh Media required-feature readiness is incomplete');
    END IF;
END;
/

MERGE INTO app_dataset_state target
USING (SELECT 1 state_id FROM dual) source
ON (target.state_id = source.state_id)
WHEN MATCHED THEN UPDATE SET
    target.active_source = 'demo',
    target.active_label = 'Demo Data',
    target.active_version = 'v1',
    target.updated_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT(
    state_id, active_source, active_label, active_version, updated_at
) VALUES(1, 'demo', 'Demo Data', 'v1', SYSTIMESTAMP);

UPDATE app_dataset_readiness
SET dataset_source = 'demo',
    dataset_version = 'v1',
    job_id = 'bootstrap-media-v1',
    status = 'ACTIVE',
    readiness = JSON_OBJECT(
      'applicationContextVpd' VALUE 'true' FORMAT JSON,
      'duality' VALUE 'true' FORMAT JSON,
      'vector' VALUE 'true' FORMAT JSON,
      'vectorIntegrity' VALUE JSON_OBJECT(
        'accessScope' VALUE 'GLOBAL',
        'generationId' VALUE 'bootstrap-v1',
        'datasetFingerprint' VALUE (
          SELECT source_fingerprint
          FROM app_oml_generations
          WHERE generation_id = 'bootstrap-v1'
        ),
        'sourceProducts' VALUE (
          SELECT COUNT(*) FROM products WHERE is_active = 1
        ),
        'sourcePosts' VALUE (
          SELECT COUNT(*) FROM social_posts
        ),
        'momentumPosts' VALUE (
          SELECT COUNT(*) FROM social_posts
          WHERE momentum_flag IN ('viral', 'mega_viral')
        ),
        'productVectors' VALUE (
          SELECT COUNT(*) FROM product_embeddings
        ),
        'postVectors' VALUE (
          SELECT COUNT(*) FROM post_embeddings
        ),
        'semanticMatches' VALUE (
          SELECT COUNT(*) FROM semantic_matches
        ),
        'expectedMatches' VALUE (
          (SELECT COUNT(*) FROM social_posts
           WHERE momentum_flag IN ('viral', 'mega_viral'))
          * LEAST((SELECT COUNT(*) FROM products WHERE is_active = 1), 3)
        ),
        'declaredVectorColumns' VALUE 2,
        'validVectorIndexes' VALUE 2,
        'modelCount' VALUE 1,
        'invalidProductDescriptors' VALUE 0,
        'invalidPostDescriptors' VALUE 0,
        'invalidProductProvenance' VALUE 0,
        'invalidPostProvenance' VALUE 0,
        'orphanVectorRows' VALUE 0,
        'productSourceTextMismatches' VALUE 0,
        'postSourceTextMismatches' VALUE 0,
        'productEmbeddingMismatches' VALUE 0,
        'postEmbeddingMismatches' VALUE 0,
        'canonicalSemanticMismatches' VALUE 0,
        'incompleteMatchGroups' VALUE 0,
        'invalidMatches' VALUE 0,
        'deterministicMatchMismatches' VALUE 0
        RETURNING JSON
      ),
      'vectorEvidence' VALUE (
        SELECT JSON_OBJECT(
          'generationId' VALUE generation_id,
          'feature' VALUE feature_name,
          'sqlId' VALUE sql_id,
          'childNumber' VALUE child_number,
          'planHashValue' VALUE plan_hash_value,
          'operation' VALUE operation,
          'options' VALUE options,
          'objectName' VALUE object_name,
          'resultRowCount' VALUE result_row_count,
          'datasetFingerprint' VALUE dataset_fingerprint,
          'planFingerprint' VALUE plan_fingerprint,
          'expectedTableName' VALUE expected_table_name,
          'expectedIndexName' VALUE expected_index_name,
          'noForbiddenFullScan' VALUE no_forbidden_full_scan
          RETURNING JSON
        )
        FROM app_feature_execution_evidence
        WHERE generation_id = 'bootstrap-v1'
          AND feature_name = 'VECTOR'
      ),
      'graph' VALUE 'true' FORMAT JSON,
      'spatial' VALUE 'true' FORMAT JSON,
      'spatialEvidence' VALUE (
        SELECT JSON_OBJECT(
          'generationId' VALUE generation_id,
          'feature' VALUE feature_name,
          'sqlId' VALUE sql_id,
          'childNumber' VALUE child_number,
          'planHashValue' VALUE plan_hash_value,
          'operation' VALUE operation,
          'options' VALUE options,
          'objectName' VALUE object_name,
          'resultRowCount' VALUE result_row_count,
          'datasetFingerprint' VALUE dataset_fingerprint,
          'planFingerprint' VALUE plan_fingerprint,
          'expectedTableName' VALUE expected_table_name,
          'expectedIndexName' VALUE expected_index_name,
          'noForbiddenFullScan' VALUE no_forbidden_full_scan
          RETURNING JSON
        )
        FROM app_feature_execution_evidence
        WHERE generation_id = 'bootstrap-v1'
          AND feature_name = 'SPATIAL'
      ),
      'oml' VALUE 'true' FORMAT JSON,
      'nativeJson' VALUE 'true' FORMAT JSON,
      'inMemoryConfigured' VALUE 'true' FORMAT JSON,
      'inMemoryExecution' VALUE 'true' FORMAT JSON,
      'inMemoryEvidence' VALUE (
        SELECT JSON_OBJECT(
          'generationId' VALUE generation_id,
          'feature' VALUE feature_name,
          'sqlId' VALUE sql_id,
          'childNumber' VALUE child_number,
          'planHashValue' VALUE plan_hash_value,
          'operation' VALUE operation,
          'options' VALUE options,
          'objectName' VALUE object_name,
          'resultRowCount' VALUE result_row_count,
          'datasetFingerprint' VALUE dataset_fingerprint,
          'planFingerprint' VALUE plan_fingerprint,
          'expectedTableName' VALUE expected_table_name,
          'expectedIndexName' VALUE expected_index_name,
          'noForbiddenFullScan' VALUE no_forbidden_full_scan
          RETURNING JSON
        )
        FROM app_feature_execution_evidence
        WHERE generation_id = 'bootstrap-v1'
          AND feature_name = 'INMEMORY'
      ),
      'unifiedAuditConfigured' VALUE 'true' FORMAT JSON,
      'unifiedAuditDeniedReturnCode' VALUE 28115,
      'unifiedAuditTargetUnchanged' VALUE 'true' FORMAT JSON,
      'dateWindows' VALUE 'true' FORMAT JSON
      RETURNING JSON
    ),
    failure_message = NULL,
    activated_at = SYSTIMESTAMP,
    updated_at = SYSTIMESTAMP
WHERE readiness_id = 1;

UPDATE app_dataset_jobs
SET status = 'completed',
    phase = 'activated',
    progress = 100,
    message = 'Bundled Media generation is active.',
    payload = JSON_MERGEPATCH(
      payload,
      JSON_OBJECT(
        'status' VALUE 'completed',
        'phase' VALUE 'activated',
        'progress' VALUE 100,
        'message' VALUE 'Bundled Media generation is active.'
        RETURNING JSON
      )
    ),
    updated_at = SYSTIMESTAMP,
    heartbeat_at = SYSTIMESTAMP,
    completed_at = SYSTIMESTAMP
WHERE job_id = 'bootstrap-media-v1';

UPDATE app_dataset_attempts
SET phase = 'activated',
    status = 'completed',
    readiness = (
      SELECT readiness FROM app_dataset_readiness WHERE readiness_id = 1
    ),
    failure_message = NULL,
    updated_at = SYSTIMESTAMP,
    completed_at = SYSTIMESTAMP
WHERE job_id = 'bootstrap-media-v1';

COMMIT;
BEGIN
    media_security_pkg.clear_user_context;
END;
/
