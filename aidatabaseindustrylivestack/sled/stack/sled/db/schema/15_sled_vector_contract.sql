/* Retained-volume migration: SLED semantic vectors are always 384/FLOAT32/DENSE. */
DECLARE
  v_count NUMBER;
  PROCEDURE migrate_column(p_table VARCHAR2, p_index VARCHAR2) IS
  BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = p_table;
    IF v_count = 0 THEN RETURN; END IF;
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = p_index;
    IF v_count > 0 THEN EXECUTE IMMEDIATE 'DROP INDEX ' || p_index; END IF;
    EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table || ' MODIFY (embedding VECTOR(384,FLOAT32,DENSE))';
  END;
BEGIN
  migrate_column('PRODUCT_EMBEDDINGS', 'IDX_PRODUCT_VEC');
  migrate_column('POST_EMBEDDINGS', 'IDX_POST_VEC');
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'PRODUCT_EMBEDDINGS';
  IF v_count > 0 THEN
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'IDX_PRODUCT_VEC';
    IF v_count = 0 THEN EXECUTE IMMEDIATE 'CREATE VECTOR INDEX idx_product_vec ON product_embeddings(embedding) ORGANIZATION NEIGHBOR PARTITIONS WITH DISTANCE COSINE WITH TARGET ACCURACY 95'; END IF;
  END IF;
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'POST_EMBEDDINGS';
  IF v_count > 0 THEN
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'IDX_POST_VEC';
    IF v_count = 0 THEN EXECUTE IMMEDIATE 'CREATE VECTOR INDEX idx_post_vec ON post_embeddings(embedding) ORGANIZATION NEIGHBOR PARTITIONS WITH DISTANCE COSINE WITH TARGET ACCURACY 95'; END IF;
  END IF;
END;
/
