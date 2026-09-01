/*
 * finalize_vector_search.sql
 * Materialize and validate the initial Oracle AI Vector Search dataset.
 *
 * This follows the Manufacturing/High Tech engineering spine: declared
 * VECTOR_INFO, actual stored vector descriptors, complete source coverage,
 * non-null provenance, and deterministic top-three semantic matches are all
 * readiness invariants. Complete retained evidence is left unchanged;
 * incomplete derived evidence is rebuilt atomically.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

CREATE OR REPLACE FUNCTION retail_vector_serialization_sha256(
    p_vector IN VECTOR
) RETURN VARCHAR2
AUTHID DEFINER
DETERMINISTIC
IS
    c_digest_version CONSTANT VARCHAR2(48) :=
        'RETAIL_VECTOR_SERIALIZATION_SHA256_V1';
    c_chunk_size    CONSTANT PLS_INTEGER := 4000;
    v_serialization CLOB;
    v_length        PLS_INTEGER;
    v_offset        PLS_INTEGER := 1;
    v_chunk_index   PLS_INTEGER := 0;
    v_chunk         VARCHAR2(4000);
    v_chunk_sha256  VARCHAR2(64);
    v_sha256        VARCHAR2(64);

    FUNCTION sha256_varchar2(p_value IN VARCHAR2) RETURN VARCHAR2 IS
        v_sha256 VARCHAR2(64);
    BEGIN
        SELECT LOWER(RAWTOHEX(STANDARD_HASH(p_value, 'SHA256')))
        INTO v_sha256
        FROM dual;
        RETURN v_sha256;
    END sha256_varchar2;
BEGIN
    IF p_vector IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT VECTOR_SERIALIZE(p_vector RETURNING CLOB)
    INTO v_serialization
    FROM dual;

    v_length := DBMS_LOB.GETLENGTH(v_serialization);
    v_sha256 := sha256_varchar2(
        c_digest_version || '|' || TO_CHAR(v_length, 'TM9')
    );
    WHILE v_offset <= v_length LOOP
        v_chunk_index := v_chunk_index + 1;
        v_chunk := DBMS_LOB.SUBSTR(
            v_serialization,
            c_chunk_size,
            v_offset
        );
        v_chunk_sha256 := sha256_varchar2(v_chunk);
        v_sha256 := sha256_varchar2(
            v_sha256 || '|' || TO_CHAR(v_chunk_index, 'TM9') || '|' ||
            v_chunk_sha256
        );
        v_offset := v_offset + c_chunk_size;
    END LOOP;
    RETURN v_sha256;
END retail_vector_serialization_sha256;
/

DECLARE
    v_generation                     VARCHAR2(64);
    v_dataset_fingerprint            VARCHAR2(64);
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
    v_invalid_product_vectors        PLS_INTEGER;
    v_invalid_post_vectors           PLS_INTEGER;
    v_product_source_text_mismatches PLS_INTEGER;
    v_post_source_text_mismatches    PLS_INTEGER;
    v_product_embedding_mismatches   PLS_INTEGER;
    v_post_embedding_mismatches      PLS_INTEGER;
    v_canonical_semantic_mismatches  PLS_INTEGER;
    v_generation_evidence_count      PLS_INTEGER;
    v_generation_evidence_mismatches PLS_INTEGER;
    v_incomplete_match_groups        PLS_INTEGER;
    v_invalid_matches                PLS_INTEGER;
    v_deterministic_match_mismatches PLS_INTEGER;
    v_last_post_id                   NUMBER := 0;
    v_rows                           PLS_INTEGER;
    v_total_post_rows                PLS_INTEGER := 0;

    PROCEDURE read_evidence IS
    BEGIN
        SELECT state.active_generation_id,
               CASE
                 WHEN state.active_generation_id = 'bootstrap-v1' THEN
                   RAWTOHEX(STANDARD_HASH('bootstrap-v1', 'SHA256'))
                 ELSE evidence.dataset_fingerprint
               END
        INTO v_generation, v_dataset_fingerprint
        FROM app_dataset_state state
        LEFT JOIN app_inmemory_generation_evidence evidence
          ON evidence.generation_id = state.active_generation_id
        WHERE state.state_id = 1;

        IF v_generation IS NULL
           OR v_dataset_fingerprint IS NULL THEN
            RAISE_APPLICATION_ERROR(
              -20540,
              'Vector finalization requires generation and dataset fingerprint'
            );
        END IF;

        SELECT COUNT(*) INTO v_source_products FROM products;
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
              (table_name = 'PRODUCT_EMBEDDINGS'
               AND column_name = 'EMBEDDING')
              OR
              (table_name = 'POST_EMBEDDINGS'
               AND column_name = 'EMBEDDING')
          );

        SELECT COUNT(*)
        INTO v_vector_index_count
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
          );

        v_expected_matches :=
            v_momentum_posts * LEAST(v_source_products, 3);

        SELECT COUNT(*)
        INTO v_invalid_product_vectors
        FROM product_embeddings vector_row
        WHERE vector_row.embedding IS NULL
           OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
           OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32'
           OR vector_row.embedding_text IS NULL
           OR DBMS_LOB.GETLENGTH(vector_row.embedding_text) = 0
           OR vector_row.embedding_model IS NULL
           OR LOWER(vector_row.embedding_model) <> 'all_minilm_l12_v2'
           OR NOT EXISTS (
                SELECT 1
                FROM products product
                WHERE product.product_id = vector_row.product_id
           );

        SELECT COUNT(*)
        INTO v_invalid_post_vectors
        FROM post_embeddings vector_row
        WHERE vector_row.embedding IS NULL
           OR VECTOR_DIMENSION_COUNT(vector_row.embedding) <> 384
           OR UPPER(VECTOR_DIMENSION_FORMAT(vector_row.embedding)) <> 'FLOAT32'
           OR vector_row.embedding_text IS NULL
           OR DBMS_LOB.GETLENGTH(vector_row.embedding_text) = 0
           OR vector_row.embedding_model IS NULL
           OR LOWER(vector_row.embedding_model) <> 'all_minilm_l12_v2'
           OR NOT EXISTS (
                SELECT 1
                FROM social_posts post
                WHERE post.post_id = vector_row.post_id
           );

        SELECT COUNT(*)
        INTO v_product_source_text_mismatches
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

        SELECT COUNT(*)
        INTO v_post_source_text_mismatches
        FROM post_embeddings vector_row
        JOIN social_posts post
          ON post.post_id = vector_row.post_id
        WHERE vector_row.embedding_text IS NULL
           OR DBMS_LOB.COMPARE(
                vector_row.embedding_text,
                TO_CLOB(DBMS_LOB.SUBSTR(post.post_text, 500, 1))
              ) <> 0;

        SELECT COUNT(*)
        INTO v_product_embedding_mismatches
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

        SELECT COUNT(*)
        INTO v_post_embedding_mismatches
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

        SELECT COUNT(*)
        INTO v_generation_evidence_count
        FROM app_vector_generation_evidence
        WHERE generation_id = v_generation
          AND dataset_fingerprint = v_dataset_fingerprint;

        SELECT COUNT(*)
        INTO v_generation_evidence_mismatches
        FROM (
            SELECT product.product_id entity_id
            FROM products product
            JOIN brands brand
              ON brand.brand_id = product.brand_id
            JOIN product_embeddings vector_row
              ON vector_row.product_id = product.product_id
            LEFT JOIN app_vector_generation_evidence evidence
              ON evidence.generation_id = v_generation
             AND evidence.dataset_fingerprint = v_dataset_fingerprint
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
             AND evidence.dataset_fingerprint = v_dataset_fingerprint
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
             AND evidence.dataset_fingerprint = v_dataset_fingerprint
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

        SELECT COUNT(*)
        INTO v_incomplete_match_groups
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
        JOIN social_posts post
          ON post.post_id = match_row.post_id
        WHERE post.momentum_flag NOT IN ('viral', 'mega_viral')
           OR match_row.similarity_score IS NULL
           OR match_row.similarity_score < -1
           OR match_row.similarity_score > 1
           OR match_row.match_rank IS NULL
           OR match_row.match_rank < 1
           OR match_row.match_rank > LEAST(v_source_products, 3)
           OR match_row.match_method IS NULL
           OR match_row.match_method <> 'vector';

        /*
         * Recompute the canonical result and compare persisted row, product,
         * rank, score, and method. Cardinality alone cannot prove a
         * deterministic semantic cache.
         */
        SELECT COUNT(*)
        INTO v_deterministic_match_mismatches
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
               OR ABS(
                    actual.similarity_score - expected.similarity_score
                  ) > 0.00001
        );
        v_canonical_semantic_mismatches :=
            v_deterministic_match_mismatches;
    END read_evidence;

    FUNCTION evidence_is_ready RETURN BOOLEAN IS
    BEGIN
        RETURN v_source_products > 0
           AND v_source_posts > 0
           AND v_momentum_posts > 0
           AND v_product_vectors = v_source_products
           AND v_post_vectors = v_source_posts
           AND v_semantic_matches = v_expected_matches
           AND v_vector_column_count = 2
           AND v_vector_index_count = 2
           AND v_invalid_product_vectors = 0
           AND v_invalid_post_vectors = 0
           AND v_product_source_text_mismatches = 0
           AND v_post_source_text_mismatches = 0
           AND v_product_embedding_mismatches = 0
           AND v_post_embedding_mismatches = 0
           AND v_canonical_semantic_mismatches = 0
           AND v_generation_evidence_count =
               v_source_products + v_source_posts + v_semantic_matches
           AND v_generation_evidence_mismatches = 0
           AND v_incomplete_match_groups = 0
           AND v_invalid_matches = 0
           AND v_deterministic_match_mismatches = 0;
    END evidence_is_ready;
BEGIN
    SAVEPOINT retail_vector_rebuild;

    SELECT COUNT(*)
    INTO v_model_count
    FROM user_mining_models
    WHERE model_name = 'ALL_MINILM_L12_V2'
      AND mining_function = 'EMBEDDING'
      AND algorithm = 'ONNX';

    IF v_model_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20540,
            'ALL_MINILM_L12_V2 must be a valid ONNX embedding model before vector finalization'
        );
    END IF;

    read_evidence;
    IF evidence_is_ready THEN
        DBMS_OUTPUT.PUT_LINE(
            'Retail Oracle vector artifacts already verified: ' ||
            v_product_vectors || ' products, ' ||
            v_post_vectors || ' posts, ' ||
            v_semantic_matches || ' deterministic matches.'
        );
        RETURN;
    END IF;

    DELETE FROM semantic_matches;
    DELETE FROM app_vector_generation_evidence
    WHERE generation_id = v_generation;
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
           TO_CLOB(product.product_name) || ' ' ||
           NVL(product.category, '') || ' ' ||
           product.description || ' ' ||
           brand.brand_name,
           VECTOR_EMBEDDING(
               ALL_MINILM_L12_V2
               USING TO_CLOB(product.product_name) || ' ' ||
                     NVL(product.category, '') || ' ' ||
                     product.description || ' ' ||
                     brand.brand_name AS DATA
           )
    FROM products product
    JOIN brands brand
      ON brand.brand_id = product.brand_id;

    LOOP
        INSERT INTO post_embeddings (
            post_id,
            embedding_model,
            embedding_text,
            embedding
        )
        SELECT post.post_id,
               'all_MiniLM_L12_v2',
               TO_CLOB(DBMS_LOB.SUBSTR(post.post_text, 500, 1)),
               VECTOR_EMBEDDING(
                   ALL_MINILM_L12_V2
                   USING TO_CLOB(
                     DBMS_LOB.SUBSTR(post.post_text, 500, 1)
                   ) AS DATA
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

    INSERT INTO app_vector_generation_evidence (
        generation_id,
        dataset_fingerprint,
        entity_type,
        entity_id,
        source_hash,
        vector_hash,
        model_name
    )
    SELECT v_generation,
           v_dataset_fingerprint,
           'PRODUCT',
           product.product_id,
           RAWTOHEX(
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
           ),
           retail_vector_serialization_sha256(vector_row.embedding),
           'ALL_MINILM_L12_V2'
    FROM products product
    JOIN brands brand
      ON brand.brand_id = product.brand_id
    JOIN product_embeddings vector_row
      ON vector_row.product_id = product.product_id;

    INSERT INTO app_vector_generation_evidence (
        generation_id,
        dataset_fingerprint,
        entity_type,
        entity_id,
        source_hash,
        vector_hash,
        model_name
    )
    SELECT v_generation,
           v_dataset_fingerprint,
           'POST',
           post.post_id,
           RAWTOHEX(
             STANDARD_HASH(
               DBMS_LOB.SUBSTR(post.post_text, 500, 1),
               'SHA256'
             )
           ),
           retail_vector_serialization_sha256(vector_row.embedding),
           'ALL_MINILM_L12_V2'
    FROM social_posts post
    JOIN post_embeddings vector_row
      ON vector_row.post_id = post.post_id;

    INSERT INTO app_vector_generation_evidence (
        generation_id,
        dataset_fingerprint,
        entity_type,
        entity_id,
        source_hash,
        vector_hash,
        model_name
    )
    SELECT v_generation,
           v_dataset_fingerprint,
           'MATCH',
           match_row.match_id,
           RAWTOHEX(
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
           ),
           RAWTOHEX(
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
           ),
           'ALL_MINILM_L12_V2'
    FROM semantic_matches match_row;

    read_evidence;
    IF NOT evidence_is_ready THEN
        RAISE_APPLICATION_ERROR(
            -20541,
            'Retail Oracle vector artifacts are incomplete, invalid, or non-deterministic'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Retail Oracle vector artifacts verified: ' ||
        v_product_vectors || ' products, ' ||
        v_total_post_rows || ' posts, ' ||
        v_semantic_matches || ' deterministic matches.'
    );
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK TO retail_vector_rebuild;
        RAISE;
END;
/

PROMPT Retail Oracle AI Vector Search artifacts are ready.
