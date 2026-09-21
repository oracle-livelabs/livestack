/*
 * refresh_vector_artifacts.sql
 * Materialize and validate Oracle AI Vector Search evidence for Media.
 *
 * This follows the Manufacturing / accepted High Tech engineering spine:
 * declared and stored descriptors, exact source coverage, provenance, and
 * deterministic top-three semantic matches are one atomic invariant.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

CREATE OR REPLACE PROCEDURE refresh_media_vector_artifacts
AS
    v_model_count                    PLS_INTEGER;
    v_source_products                PLS_INTEGER;
    v_source_posts                   PLS_INTEGER;
    v_momentum_posts                 PLS_INTEGER;
    v_product_vectors                PLS_INTEGER;
    v_post_vectors                   PLS_INTEGER;
    v_semantic_matches               PLS_INTEGER;
    v_expected_matches               PLS_INTEGER;
    v_vector_column_count            PLS_INTEGER;
    v_vector_index_count             PLS_INTEGER;
    v_invalid_product_descriptors    PLS_INTEGER;
    v_invalid_post_descriptors       PLS_INTEGER;
    v_invalid_product_provenance     PLS_INTEGER;
    v_invalid_post_provenance        PLS_INTEGER;
    v_orphan_vector_rows             PLS_INTEGER;
    v_product_source_text_mismatches PLS_INTEGER;
    v_post_source_text_mismatches    PLS_INTEGER;
    v_product_embedding_mismatches   PLS_INTEGER;
    v_post_embedding_mismatches      PLS_INTEGER;
    v_incomplete_groups              PLS_INTEGER;
    v_invalid_matches                PLS_INTEGER;
    v_deterministic_mismatches       PLS_INTEGER;
    v_canonical_semantic_mismatches  PLS_INTEGER;
    v_last_post_id                   NUMBER := 0;
    v_rows                           PLS_INTEGER;
    v_total_post_rows                PLS_INTEGER := 0;

    PROCEDURE read_evidence IS
    BEGIN
        SELECT COUNT(*)
        INTO v_source_products
        FROM products
        WHERE is_active = 1;

        SELECT COUNT(*) INTO v_source_posts FROM social_posts;

        SELECT COUNT(*)
        INTO v_momentum_posts
        FROM social_posts
        WHERE momentum_flag IN ('viral', 'mega_viral');

        SELECT COUNT(*) INTO v_product_vectors FROM product_embeddings;
        SELECT COUNT(*) INTO v_post_vectors FROM post_embeddings;
        SELECT COUNT(*) INTO v_semantic_matches FROM semantic_matches;

        SELECT COUNT(*)
        INTO v_vector_column_count
        FROM user_tab_columns
        WHERE data_type = 'VECTOR'
          AND REPLACE(UPPER(vector_info), ' ', '') =
              'VECTOR(384,FLOAT32,DENSE)'
          AND (
              (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
              OR
              (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
          );

        SELECT COUNT(*)
        INTO v_vector_index_count
        FROM user_indexes index_row
        JOIN user_ind_columns column_row
          ON column_row.index_name = index_row.index_name
        JOIN SYS.V_$VECTOR_INDEX vector_index
          ON vector_index.owner = USER
         AND vector_index.index_name = index_row.index_name
        WHERE index_row.index_name IN ('IDX_PRODUCT_VEC', 'IDX_POST_VEC')
          AND index_row.status = 'VALID'
          AND index_row.index_type = 'VECTOR'
          AND REPLACE(UPPER(index_row.index_subtype), ' ', '_') =
              'NEIGHBOR_PARTITIONS_IVF'
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
          AND UPPER(vector_index.index_organization) = 'NEIGHBOR PARTITIONS'
          AND (
            (
              index_row.index_name = 'IDX_PRODUCT_VEC'
              AND index_row.table_name = 'PRODUCT_EMBEDDINGS'
              AND column_row.table_name = 'PRODUCT_EMBEDDINGS'
              AND column_row.column_name = 'EMBEDDING'
            )
            OR
            (
              index_row.index_name = 'IDX_POST_VEC'
              AND index_row.table_name = 'POST_EMBEDDINGS'
              AND column_row.table_name = 'POST_EMBEDDINGS'
              AND column_row.column_name = 'EMBEDDING'
            )
          );

        v_expected_matches :=
            v_momentum_posts * LEAST(v_source_products, 3);

        SELECT COUNT(*)
        INTO v_invalid_product_descriptors
        FROM product_embeddings vector_row
        WHERE vector_row.embedding IS NULL
           OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
           OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32';

        SELECT COUNT(*)
        INTO v_invalid_post_descriptors
        FROM post_embeddings vector_row
        WHERE vector_row.embedding IS NULL
           OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
           OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32';

        SELECT COUNT(*)
        INTO v_invalid_product_provenance
        FROM product_embeddings vector_row
        WHERE vector_row.embedding_text IS NULL
           OR NVL(DBMS_LOB.GETLENGTH(vector_row.embedding_text), 0) = 0
           OR vector_row.embedding_model IS NULL
           OR vector_row.embedding_model <> 'all_MiniLM_L12_v2';

        SELECT COUNT(*)
        INTO v_invalid_post_provenance
        FROM post_embeddings vector_row
        WHERE vector_row.embedding_text IS NULL
           OR NVL(DBMS_LOB.GETLENGTH(vector_row.embedding_text), 0) = 0
           OR vector_row.embedding_model IS NULL
           OR vector_row.embedding_model <> 'all_MiniLM_L12_v2';

        SELECT COUNT(*)
        INTO v_product_source_text_mismatches
        FROM product_embeddings vector_row
        JOIN products source_row
          ON source_row.product_id = vector_row.product_id
         AND source_row.is_active = 1
        JOIN brands brand
          ON brand.brand_id = source_row.brand_id
        WHERE vector_row.embedding_text IS NULL
           OR NVL(
                DBMS_LOB.COMPARE(
                  vector_row.embedding_text,
                  TO_CLOB(
                    source_row.product_name || ' ' ||
                    NVL(source_row.category, '') || ' ' ||
                    NVL(DBMS_LOB.SUBSTR(source_row.description, 1000, 1), '') ||
                    ' ' || brand.brand_name
                  )
                ),
                1
              ) <> 0;

        SELECT COUNT(*)
        INTO v_post_source_text_mismatches
        FROM post_embeddings vector_row
        JOIN social_posts source_row
          ON source_row.post_id = vector_row.post_id
        WHERE vector_row.embedding_text IS NULL
           OR NVL(
                DBMS_LOB.COMPARE(
                  vector_row.embedding_text,
                  TO_CLOB(DBMS_LOB.SUBSTR(source_row.post_text, 500, 1))
                ),
                1
              ) <> 0;

        SELECT COUNT(*)
        INTO v_product_embedding_mismatches
        FROM product_embeddings vector_row
        JOIN products source_row
          ON source_row.product_id = vector_row.product_id
         AND source_row.is_active = 1
        JOIN brands brand
          ON brand.brand_id = source_row.brand_id
        WHERE vector_row.embedding IS NULL
           OR NVL(
                VECTOR_DISTANCE(
                  vector_row.embedding,
                  VECTOR_EMBEDDING(
                    ALL_MINILM_L12_V2
                    USING source_row.product_name || ' ' ||
                      NVL(source_row.category, '') || ' ' ||
                      NVL(
                        DBMS_LOB.SUBSTR(source_row.description, 1000, 1),
                        ''
                      ) || ' ' || brand.brand_name AS DATA
                  ),
                  EUCLIDEAN
                ),
                999
              ) > 0.00001;

        SELECT COUNT(*)
        INTO v_post_embedding_mismatches
        FROM post_embeddings vector_row
        JOIN social_posts source_row
          ON source_row.post_id = vector_row.post_id
        WHERE vector_row.embedding IS NULL
           OR NVL(
                VECTOR_DISTANCE(
                  vector_row.embedding,
                  VECTOR_EMBEDDING(
                    ALL_MINILM_L12_V2
                    USING DBMS_LOB.SUBSTR(source_row.post_text, 500, 1) AS DATA
                  ),
                  EUCLIDEAN
                ),
                999
              ) > 0.00001;

        SELECT
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
        INTO v_orphan_vector_rows
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
           OR ABS(
                actual_row.similarity_score - expected_row.similarity_score
              ) > 0.00001
           OR actual_row.match_method IS NULL
           OR actual_row.match_method <> 'vector';

        /*
         * Transitive canonical proof: each stored product/post embedding was
         * compared with its current-model canonical embedding above, and the
         * stored vectors were then used to verify every deterministic top-3
         * match. Re-embedding their full cross-product adds no evidence.
         */
        v_canonical_semantic_mismatches :=
          CASE
            WHEN NVL(v_product_embedding_mismatches, 1) = 0
             AND NVL(v_post_embedding_mismatches, 1) = 0
             AND NVL(v_deterministic_mismatches, 1) = 0
            THEN 0
            ELSE 1
          END;
    END read_evidence;

    FUNCTION evidence_is_ready RETURN BOOLEAN IS
    BEGIN
        RETURN v_model_count = 1
           AND v_source_products > 0
           AND v_source_posts > 0
           AND v_momentum_posts > 0
           AND v_product_vectors = v_source_products
           AND v_post_vectors = v_source_posts
           AND v_semantic_matches = v_expected_matches
           AND v_vector_column_count = 2
           AND v_vector_index_count = 2
           AND v_invalid_product_descriptors = 0
           AND v_invalid_post_descriptors = 0
           AND v_invalid_product_provenance = 0
           AND v_invalid_post_provenance = 0
           AND v_orphan_vector_rows = 0
           AND v_product_source_text_mismatches = 0
           AND v_post_source_text_mismatches = 0
           AND v_product_embedding_mismatches = 0
           AND v_post_embedding_mismatches = 0
           AND v_incomplete_groups = 0
           AND v_invalid_matches = 0
           AND v_deterministic_mismatches = 0
           AND v_canonical_semantic_mismatches = 0;
    END evidence_is_ready;
BEGIN
    SAVEPOINT media_vector_rebuild;

    SELECT COUNT(*)
    INTO v_model_count
    FROM user_mining_models
    WHERE model_name = 'ALL_MINILM_L12_V2'
      AND UPPER(mining_function) = 'EMBEDDING'
      AND UPPER(algorithm) = 'ONNX';

    IF v_model_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
          -20013,
          'ALL_MINILM_L12_V2 must be loaded before Media vector finalization'
        );
    END IF;

    read_evidence;
    IF evidence_is_ready THEN
        DBMS_OUTPUT.PUT_LINE(
          'Media vector artifacts already verified; no rebuild executed: ' ||
          v_product_vectors || ' products, ' ||
          v_post_vectors || ' posts, ' ||
          v_semantic_matches || ' deterministic matches.'
        );
        RETURN;
    END IF;

    IF v_vector_column_count <> 2 THEN
        RAISE_APPLICATION_ERROR(
          -20014,
          'Media Vector columns must both be VECTOR(384,FLOAT32,DENSE)'
        );
    END IF;

    IF v_vector_index_count <> 2 THEN
        RAISE_APPLICATION_ERROR(
          -20015,
          'Required Media Vector indexes are missing or invalid'
        );
    END IF;

    DELETE FROM semantic_matches;
    DELETE FROM post_embeddings;
    DELETE FROM product_embeddings;

    INSERT INTO product_embeddings (
      product_id,
      embedding_model,
      embedding_text,
      embedding
    )
    SELECT product.product_id,
           'all_MiniLM_L12_v2',
           product.product_name || ' ' ||
             NVL(product.category, '') || ' ' ||
             NVL(DBMS_LOB.SUBSTR(product.description, 1000, 1), '') || ' ' ||
             brand.brand_name,
           VECTOR_EMBEDDING(
             ALL_MINILM_L12_V2
             USING product.product_name || ' ' ||
               NVL(product.category, '') || ' ' ||
               NVL(DBMS_LOB.SUBSTR(product.description, 1000, 1), '') || ' ' ||
               brand.brand_name AS DATA
           )
    FROM products product
    JOIN brands brand
      ON brand.brand_id = product.brand_id
    WHERE product.is_active = 1;

    LOOP
        INSERT INTO post_embeddings (
          post_id,
          embedding_model,
          embedding_text,
          embedding
        )
        SELECT post.post_id,
               'all_MiniLM_L12_v2',
               DBMS_LOB.SUBSTR(post.post_text, 500, 1),
               VECTOR_EMBEDDING(
                 ALL_MINILM_L12_V2
                 USING DBMS_LOB.SUBSTR(post.post_text, 500, 1) AS DATA
               )
        FROM (
          SELECT post_id, post_text
          FROM social_posts
          WHERE post_id > v_last_post_id
          ORDER BY post_id
          FETCH FIRST 500 ROWS ONLY
        ) post;

        v_rows := SQL%ROWCOUNT;
        EXIT WHEN v_rows = 0;

        v_total_post_rows := v_total_post_rows + v_rows;
        SELECT MAX(post_id)
        INTO v_last_post_id
        FROM post_embeddings;
    END LOOP;

    INSERT INTO semantic_matches (
      post_id,
      product_id,
      similarity_score,
      match_rank,
      match_method
    )
    SELECT post_id,
           product_id,
           similarity_score,
           match_rank,
           'vector'
    FROM (
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
    )
    WHERE match_rank <= 3;

    read_evidence;
    IF NOT evidence_is_ready THEN
        RAISE_APPLICATION_ERROR(
          -20016,
          'Media Vector artifacts are incomplete, corrupt, or nondeterministic'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
      'Media vector artifacts verified: ' ||
      v_product_vectors || ' products, ' ||
      v_total_post_rows || ' posts, ' ||
      v_semantic_matches || ' deterministic matches.'
    );
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK TO media_vector_rebuild;
        RAISE;
END;
/

BEGIN
    refresh_media_vector_artifacts;
END;
/

/*
 * Retained databases can predate the required storage constraints. The
 * finalizer above first self-heals and revalidates every derived row; only
 * then is the retained catalog converged to the same fail-closed definition
 * used by a clean schema build.
 */
DECLARE
    v_nullable user_tab_columns.nullable%TYPE;
BEGIN
    SELECT nullable INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'PRODUCT_EMBEDDINGS'
      AND column_name = 'EMBEDDING_MODEL';
    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE product_embeddings MODIFY (embedding_model NOT NULL)';
    END IF;

    SELECT nullable INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'POST_EMBEDDINGS'
      AND column_name = 'EMBEDDING_MODEL';
    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE post_embeddings MODIFY (embedding_model NOT NULL)';
    END IF;

    SELECT nullable INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'SEMANTIC_MATCHES'
      AND column_name = 'SIMILARITY_SCORE';
    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE semantic_matches MODIFY (similarity_score NOT NULL)';
    END IF;

    SELECT nullable INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'SEMANTIC_MATCHES'
      AND column_name = 'MATCH_RANK';
    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE semantic_matches MODIFY (match_rank NOT NULL)';
    END IF;

    SELECT nullable INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'SEMANTIC_MATCHES'
      AND column_name = 'MATCH_METHOD';
    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE semantic_matches MODIFY (match_method NOT NULL)';
    END IF;
END;
/

SELECT 'refresh_vector_artifacts.sql complete' AS status FROM dual;
