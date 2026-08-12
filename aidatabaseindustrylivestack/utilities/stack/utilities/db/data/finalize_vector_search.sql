/*
 * finalize_vector_search.sql
 * Materialize and validate the initial Oracle AI Vector Search dataset.
 *
 * This follows the Manufacturing engineering spine: declared VECTOR_INFO,
 * actual stored vector descriptors, complete source coverage, and
 * deterministic top-three semantic matches are all release invariants.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

DECLARE
    v_model_count             PLS_INTEGER;
    v_source_products         PLS_INTEGER;
    v_source_posts            PLS_INTEGER;
    v_momentum_posts          PLS_INTEGER;
    v_product_vectors         PLS_INTEGER;
    v_post_vectors            PLS_INTEGER;
    v_semantic_matches        PLS_INTEGER;
    v_expected_matches        PLS_INTEGER;
    v_vector_column_count     PLS_INTEGER;
    v_invalid_product_vectors PLS_INTEGER;
    v_invalid_post_vectors    PLS_INTEGER;
    v_incomplete_groups       PLS_INTEGER;
    v_invalid_matches         PLS_INTEGER;
    v_last_post_id            NUMBER := 0;
    v_rows                    PLS_INTEGER;
    v_total_rows              PLS_INTEGER := 0;

    PROCEDURE read_evidence IS
    BEGIN
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
          AND REPLACE(UPPER(vector_info), ' ', '') = 'VECTOR(384,FLOAT32,DENSE)'
          AND (
              (table_name = 'PRODUCT_EMBEDDINGS' AND column_name = 'EMBEDDING')
              OR
              (table_name = 'POST_EMBEDDINGS' AND column_name = 'EMBEDDING')
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
           OR vector_row.embedding_model <> 'all_MiniLM_L12_v2'
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
           OR vector_row.embedding_model <> 'all_MiniLM_L12_v2'
           OR NOT EXISTS (
                SELECT 1
                FROM social_posts post
                WHERE post.post_id = vector_row.post_id
           );

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
           OR match_row.match_method <> 'vector';
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
           AND v_invalid_product_vectors = 0
           AND v_invalid_post_vectors = 0
           AND v_incomplete_groups = 0
           AND v_invalid_matches = 0;
    END evidence_is_ready;
BEGIN
    SAVEPOINT utilities_vector_rebuild;

    SELECT COUNT(*)
    INTO v_model_count
    FROM user_mining_models
    WHERE model_name = 'ALL_MINILM_L12_V2';

    IF v_model_count <> 1 THEN
        RAISE_APPLICATION_ERROR(
            -20120,
            'ALL_MINILM_L12_V2 must be loaded before vector finalization'
        );
    END IF;

    read_evidence;
    IF evidence_is_ready THEN
        DBMS_OUTPUT.PUT_LINE(
            'Oracle vector artifacts already verified: ' ||
            v_product_vectors || ' products, ' ||
            v_post_vectors || ' operational signals, ' ||
            v_semantic_matches || ' deterministic matches.'
        );
        RETURN;
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
           NVL(product.description, '') || ' ' ||
           brand.brand_name,
           VECTOR_EMBEDDING(
               ALL_MINILM_L12_V2
               USING product.product_name || ' ' ||
                     NVL(product.category, '') || ' ' ||
                     NVL(product.description, '') || ' ' ||
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
               SUBSTR(post.post_text, 1, 500),
               VECTOR_EMBEDDING(
                   ALL_MINILM_L12_V2
                   USING SUBSTR(post.post_text, 1, 500) AS DATA
               )
        FROM (
            SELECT post_id,
                   post_text
            FROM social_posts
            WHERE post_id > v_last_post_id
            ORDER BY post_id
            FETCH FIRST 500 ROWS ONLY
        ) post;

        v_rows := SQL%ROWCOUNT;
        EXIT WHEN v_rows = 0;

        v_total_rows := v_total_rows + v_rows;
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
               ) AS similarity_score,
               ROW_NUMBER() OVER (
                   PARTITION BY post_vector.post_id
                   ORDER BY VECTOR_DISTANCE(
                       post_vector.embedding,
                       product_vector.embedding,
                       COSINE
                   ),
                   product_vector.product_id
               ) AS match_rank
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
            -20121,
            'Oracle vector artifacts are incomplete or invalid'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Oracle vector artifacts verified: ' ||
        v_product_vectors || ' products, ' ||
        v_total_rows || ' operational signals, ' ||
        v_semantic_matches || ' deterministic matches.'
    );
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK TO utilities_vector_rebuild;
        RAISE;
END;
/

PROMPT Energy & Utilities Oracle AI Vector Search artifacts are ready.
