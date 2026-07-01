/*
 * finalize_vector_search.sql
 * Materialize and validate the initial Oracle AI Vector Search dataset.
 *
 * Run after:
 *   1. core vector tables have been created,
 *   2. relational demo data has been loaded, and
 *   3. ALL_MINILM_L12_V2 is present in USER_MINING_MODELS.
 */

WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON
SET DEFINE OFF

DECLARE
    v_model_count PLS_INTEGER;
BEGIN
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
END;
/

DELETE FROM manufacturing_signal_part_matches;
DELETE FROM manufacturing_signal_embeddings;
DELETE FROM product_embeddings;

INSERT INTO product_embeddings (
    product_id,
    embedding_model,
    embedding_text,
    embedding
)
SELECT part.product_id,
       'all_MiniLM_L12_v2',
       part.product_name || ' ' ||
       NVL(part.category, '') || ' ' ||
       NVL(part.description, '') || ' ' ||
       supplier.brand_name,
       VECTOR_EMBEDDING(
           ALL_MINILM_L12_V2
           USING part.product_name || ' ' ||
                 NVL(part.category, '') || ' ' ||
                 NVL(part.description, '') || ' ' ||
                 supplier.brand_name AS DATA
       )
FROM products part
JOIN brands supplier
  ON supplier.brand_id = part.brand_id;

DECLARE
    v_last_post_id manufacturing_production_signals.production_signal_id%TYPE := 0;
    v_rows          PLS_INTEGER;
    v_total_rows    PLS_INTEGER := 0;
BEGIN
    LOOP
        INSERT INTO manufacturing_signal_embeddings (
            production_signal_id,
            embedding_model,
            embedding_text,
            embedding
        )
        SELECT signal.production_signal_id,
               'all_MiniLM_L12_v2',
               SUBSTR(signal.signal_text, 1, 500),
               VECTOR_EMBEDDING(
                   ALL_MINILM_L12_V2
                   USING SUBSTR(signal.signal_text, 1, 500) AS DATA
               )
        FROM (
            SELECT production_signal_id,
                   signal_text
            FROM manufacturing_production_signals
            WHERE production_signal_id > v_last_post_id
            ORDER BY production_signal_id
            FETCH FIRST 500 ROWS ONLY
        ) signal;

        v_rows := SQL%ROWCOUNT;
        EXIT WHEN v_rows = 0;

        v_total_rows := v_total_rows + v_rows;

        SELECT MAX(production_signal_id)
        INTO v_last_post_id
        FROM manufacturing_signal_embeddings;
    END LOOP;

    DBMS_OUTPUT.PUT_LINE(
        'Production signal vectors generated: ' || v_total_rows
    );
END;
/

INSERT INTO manufacturing_signal_part_matches (
    production_signal_id,
    manufactured_part_id,
    similarity_score,
    match_rank,
    match_method
)
SELECT production_signal_id,
       product_id,
       similarity_score,
       match_rank,
       'vector'
FROM (
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
)
WHERE match_rank <= 3;

DECLARE
    v_source_products          PLS_INTEGER;
    v_source_signals           PLS_INTEGER;
    v_escalated_signals        PLS_INTEGER;
    v_product_vectors          PLS_INTEGER;
    v_signal_vectors           PLS_INTEGER;
    v_semantic_matches         PLS_INTEGER;
    v_expected_matches         PLS_INTEGER;
    v_vector_column_count      PLS_INTEGER;
    v_invalid_product_vectors  PLS_INTEGER;
    v_invalid_signal_vectors   PLS_INTEGER;
    v_incomplete_match_groups  PLS_INTEGER;
    v_invalid_matches          PLS_INTEGER;
BEGIN
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

    v_expected_matches :=
        v_escalated_signals * LEAST(v_source_products, 3);

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
    INTO v_incomplete_match_groups
    FROM (
        SELECT signal.production_signal_id
        FROM manufacturing_production_signals signal
        LEFT JOIN manufacturing_signal_part_matches match_row
          ON match_row.production_signal_id = signal.production_signal_id
        WHERE signal.momentum_code IN ('escalating', 'critical')
        GROUP BY signal.production_signal_id
        HAVING COUNT(match_row.signal_part_match_id) <> LEAST(v_source_products, 3)
            OR MIN(match_row.match_rank) <> 1
            OR MAX(match_row.match_rank) <> LEAST(v_source_products, 3)
            OR COUNT(DISTINCT match_row.manufactured_part_id)
               <> LEAST(v_source_products, 3)
    );

    SELECT COUNT(*)
    INTO v_invalid_matches
    FROM manufacturing_signal_part_matches match_row
    JOIN manufacturing_production_signals signal
      ON signal.production_signal_id = match_row.production_signal_id
    WHERE signal.momentum_code NOT IN ('escalating', 'critical')
       OR match_row.similarity_score IS NULL
       OR match_row.similarity_score < -1
       OR match_row.similarity_score > 1
       OR match_row.match_method <> 'vector';

    IF v_source_products = 0
       OR v_source_signals = 0
       OR v_escalated_signals = 0
       OR v_product_vectors <> v_source_products
       OR v_signal_vectors <> v_source_signals
       OR v_semantic_matches <> v_expected_matches
       OR v_vector_column_count <> 2
       OR v_invalid_product_vectors <> 0
       OR v_invalid_signal_vectors <> 0
       OR v_incomplete_match_groups <> 0
       OR v_invalid_matches <> 0 THEN
        RAISE_APPLICATION_ERROR(
            -20121,
            'Oracle vector artifacts are incomplete or invalid'
        );
    END IF;

    DBMS_OUTPUT.PUT_LINE(
        'Oracle vector artifacts verified: ' ||
        v_product_vectors || ' manufactured parts, ' ||
        v_signal_vectors || ' production signals, ' ||
        v_semantic_matches || ' top-3 escalated-signal matches.'
    );
END;
/

COMMIT;

PROMPT Oracle AI Vector Search data finalized.
