/* Rebuild and validate the unified Returns evidence index. */

SET SERVEROUTPUT ON

DECLARE
  v_model_count PLS_INTEGER;
  v_generation app_dataset_state.active_generation_id%TYPE;
  v_expected PLS_INTEGER;
  v_actual PLS_INTEGER;
  v_invalid PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_model_count
  FROM user_mining_models
  WHERE model_name = 'ALL_MINILM_L12_V2'
    AND mining_function = 'EMBEDDING'
    AND algorithm = 'ONNX';

  SELECT active_generation_id INTO v_generation
  FROM app_dataset_state
  WHERE state_id = 1;

  IF v_model_count <> 1 OR v_generation IS NULL THEN
    RAISE_APPLICATION_ERROR(
      -20601,
      'Return evidence indexing requires ALL_MINILM_L12_V2 and an active generation'
    );
  END IF;

  retail_return_evidence_pkg.rebuild(v_generation);

  SELECT
    (SELECT COUNT(*) * 2 FROM return_requests) +
    (SELECT COUNT(*) FROM return_documents) +
    (SELECT COUNT(*) FROM return_events) +
    (SELECT COUNT(*) FROM return_decisions) +
    (SELECT COUNT(*)
     FROM return_requests rr
     JOIN return_policy_clauses policy ON policy.clause_code = rr.policy_clause)
  INTO v_expected
  FROM dual;

  SELECT COUNT(*) INTO v_actual
  FROM return_evidence_index
  WHERE generation_id = v_generation;

  SELECT COUNT(*) INTO v_invalid
  FROM return_evidence_index
  WHERE generation_id <> v_generation
     OR embedding IS NULL
     OR VECTOR_DIMENSION_COUNT(embedding) <> 384
     OR UPPER(VECTOR_DIMENSION_FORMAT(embedding)) <> 'FLOAT32'
     OR embedding_model <> 'ALL_MINILM_L12_V2'
     OR embedding_dimensions <> 384
     OR content_hash IS NULL
     OR LENGTH(content_hash) <> 64
     OR evidence_text IS NULL
     OR DBMS_LOB.GETLENGTH(evidence_text) = 0;

  IF v_actual <> v_expected OR v_invalid <> 0 THEN
    RAISE_APPLICATION_ERROR(
      -20602,
      'Return evidence index failed readiness: actual=' || v_actual ||
      ', expected=' || v_expected || ', invalid=' || v_invalid
    );
  END IF;

  DBMS_OUTPUT.PUT_LINE(
    'Return evidence index ready: rows=' || v_actual || ', invalid=' || v_invalid
  );

  COMMIT;
END;
/
