/* Oracle-authoritative jobs, singleton lease, readiness, and active version.
 * APP_LIVESTACK_RUNTIME_IDENTITY is the retained-volume generation marker.
 */

-- RETAIL_SCHEMA_GENERATION is reconciled on fresh and retained startup. The
-- external frozen manifest binds the exact db/ and bootstrap source bytes;
-- this row proves which idempotent schema generation the running database
-- actually applied.
BEGIN
  EXECUTE IMMEDIATE q'[
    CREATE TABLE app_livestack_runtime_identity (
      identity_id NUMBER(1) PRIMARY KEY,
      schema_generation VARCHAR2(128) NOT NULL,
      schema_source_contract VARCHAR2(128) NOT NULL,
      reconciled_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT ck_livestack_runtime_identity_one CHECK (identity_id = 1)
    )
  ]';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

MERGE INTO app_livestack_runtime_identity target
USING (
  SELECT 1 identity_id,
         'retail-schema-2026.07.30.13' schema_generation,
         'EXTERNAL_FROZEN_MANIFEST_DB_SUBSET' schema_source_contract
  FROM dual
) source
ON (target.identity_id = source.identity_id)
WHEN MATCHED THEN UPDATE SET
  target.schema_generation = source.schema_generation,
  target.schema_source_contract = source.schema_source_contract,
  target.reconciled_at = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT (
  identity_id, schema_generation, schema_source_contract, reconciled_at
) VALUES (
  source.identity_id, source.schema_generation,
  source.schema_source_contract, SYSTIMESTAMP
);
COMMIT;

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_JOBS';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_dataset_jobs (
            job_id VARCHAR2(100) PRIMARY KEY,
            operation VARCHAR2(40) NOT NULL,
            status VARCHAR2(20) NOT NULL CHECK (status IN ('queued','running','completed','failed')),
            progress NUMBER(3) DEFAULT 0 NOT NULL CHECK (progress BETWEEN 0 AND 100),
            message VARCHAR2(1000),
            payload JSON NOT NULL,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            started_at TIMESTAMP,
            completed_at TIMESTAMP
          )
        ]';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'IDX_APP_DATASET_JOBS_STATUS';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_app_dataset_jobs_status ON app_dataset_jobs(status, updated_at)';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_OPERATION_LOCK';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_dataset_operation_lock (
            lock_id NUMBER(1) PRIMARY KEY CHECK (lock_id = 1),
            lease_token VARCHAR2(100),
            owner_job_id VARCHAR2(100),
            operation_kind VARCHAR2(40),
            status VARCHAR2(20),
            message VARCHAR2(1000),
            progress NUMBER(3),
            lease_payload JSON,
            acquired_at TIMESTAMP,
            heartbeat_at TIMESTAMP,
            lease_expires_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
          )
        ]';
    END IF;
END;
/
MERGE INTO app_dataset_operation_lock t
USING (SELECT 1 lock_id FROM dual) s ON (t.lock_id = s.lock_id)
WHEN NOT MATCHED THEN INSERT (lock_id, updated_at) VALUES (1, SYSTIMESTAMP);

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_READINESS';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_dataset_readiness (
            readiness_id NUMBER(1) PRIMARY KEY CHECK (readiness_id = 1),
            dataset_source VARCHAR2(20),
            dataset_version VARCHAR2(40),
            job_id VARCHAR2(100),
            status VARCHAR2(20) NOT NULL CHECK (status IN ('UNKNOWN','ACTIVE','FAILED')),
            readiness JSON,
            failure_message VARCHAR2(2000),
            activated_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
          )
        ]';
    END IF;
END;
/
MERGE INTO app_dataset_readiness t
USING (SELECT 1 readiness_id FROM dual) s ON (t.readiness_id = s.readiness_id)
WHEN NOT MATCHED THEN INSERT (readiness_id, status, updated_at) VALUES (1, 'UNKNOWN', SYSTIMESTAMP);

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_EVENT_OUTBOX';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_dataset_event_outbox (
            event_id VARCHAR2(180) PRIMARY KEY,
            job_id VARCHAR2(100) NOT NULL,
            event_status VARCHAR2(20) NOT NULL,
            payload JSON NOT NULL,
            delivery_status VARCHAR2(20) DEFAULT 'PENDING' NOT NULL
              CHECK (delivery_status IN ('PENDING','DELIVERED')),
            attempt_count NUMBER DEFAULT 0 NOT NULL,
            error_category VARCHAR2(32) DEFAULT 'NONE' NOT NULL
              CHECK (error_category IN (
                'NONE','MISSING_CONFIGURATION','INVALID_DESTINATION',
                'HTTP_FAILURE','TIMEOUT','NETWORK_FAILURE','INTERNAL_FAILURE'
              )),
            next_attempt_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            claim_token VARCHAR2(64),
            claim_expires_at TIMESTAMP,
            last_error VARCHAR2(1000),
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            delivered_at TIMESTAMP
          )
        ]';
    END IF;
END;
/

DECLARE
    PROCEDURE ensure_column(p_column_name VARCHAR2, p_definition VARCHAR2) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM user_tab_columns
        WHERE table_name = 'APP_DATASET_EVENT_OUTBOX'
          AND column_name = UPPER(p_column_name);
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE
                'ALTER TABLE app_dataset_event_outbox ADD (' ||
                DBMS_ASSERT.SIMPLE_SQL_NAME(p_column_name) || ' ' || p_definition || ')';
        END IF;
    END;
BEGIN
    ensure_column(
        'error_category',
        q'[VARCHAR2(32) DEFAULT 'NONE' NOT NULL CHECK (
             error_category IN (
               'NONE','MISSING_CONFIGURATION','INVALID_DESTINATION',
               'HTTP_FAILURE','TIMEOUT','NETWORK_FAILURE','INTERNAL_FAILURE'
             )
           )]'
    );
    ensure_column('next_attempt_at', 'TIMESTAMP DEFAULT SYSTIMESTAMP');
    ensure_column('claim_token', 'VARCHAR2(64)');
    ensure_column('claim_expires_at', 'TIMESTAMP');
    EXECUTE IMMEDIATE
        'ALTER TABLE app_dataset_event_outbox MODIFY (next_attempt_at DEFAULT SYSTIMESTAMP)';

    DECLARE
        v_nullable user_tab_columns.nullable%TYPE;
    BEGIN
        SELECT nullable
        INTO v_nullable
        FROM user_tab_columns
        WHERE table_name = 'APP_DATASET_EVENT_OUTBOX'
          AND column_name = 'NEXT_ATTEMPT_AT';

        IF v_nullable = 'Y' THEN
            EXECUTE IMMEDIATE q'[
              UPDATE app_dataset_event_outbox
              SET next_attempt_at = NVL(next_attempt_at, created_at)
              WHERE next_attempt_at IS NULL
            ]';
            EXECUTE IMMEDIATE
                'ALTER TABLE app_dataset_event_outbox MODIFY (next_attempt_at NOT NULL)';
        END IF;
    END;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'IDX_DATASET_EVENT_OUTBOX_PENDING';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX idx_dataset_event_outbox_pending ON app_dataset_event_outbox(delivery_status, created_at)';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'IDX_DATASET_EVENT_OUTBOX_RETRY';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE INDEX idx_dataset_event_outbox_retry
          ON app_dataset_event_outbox(
            delivery_status, next_attempt_at, claim_expires_at, created_at
          )
        ]';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_INMEMORY_GENERATION_EVIDENCE';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_inmemory_generation_evidence (
            generation_id VARCHAR2(64) PRIMARY KEY,
            job_id VARCHAR2(100),
            dataset_fingerprint VARCHAR2(64) NOT NULL,
            populated_segments NUMBER NOT NULL,
            sql_id VARCHAR2(13) NOT NULL,
            child_number NUMBER NOT NULL,
            plan_operation VARCHAR2(80) NOT NULL,
            plan_object_owner VARCHAR2(128),
            plan_object_name VARCHAR2(128) NOT NULL,
            proof_id VARCHAR2(64) NOT NULL,
            evidence_status VARCHAR2(20) NOT NULL
              CHECK (evidence_status IN ('ACTIVE','FAILED')),
            verified_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
          )
        ]';
    END IF;
END;
/

DECLARE
    PROCEDURE ensure_column(p_column_name VARCHAR2, p_definition VARCHAR2) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM user_tab_columns
        WHERE table_name = 'APP_INMEMORY_GENERATION_EVIDENCE'
          AND column_name = UPPER(p_column_name);
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE
                'ALTER TABLE app_inmemory_generation_evidence ADD (' ||
                DBMS_ASSERT.SIMPLE_SQL_NAME(p_column_name) || ' ' ||
                p_definition || ')';
        END IF;
    END;
BEGIN
    -- Existing evidence without exact-child/object/proof identity is
    -- intentionally left incomplete and marked FAILED below. Startup must
    -- create a new exact proof before it can be exposed again.
    ensure_column('child_number', 'NUMBER');
    ensure_column('plan_object_owner', 'VARCHAR2(128)');
    ensure_column('plan_object_name', 'VARCHAR2(128)');
    ensure_column('proof_id', 'VARCHAR2(64)');
    EXECUTE IMMEDIATE q'[
      UPDATE app_inmemory_generation_evidence
      SET evidence_status = 'FAILED'
      WHERE child_number IS NULL
         OR plan_object_name IS NULL
         OR proof_id IS NULL
    ]';
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_FEATURE_PLAN_EVIDENCE';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_feature_plan_evidence (
            generation_id VARCHAR2(64) NOT NULL,
            feature_name VARCHAR2(20) NOT NULL
              CHECK (feature_name IN ('VECTOR','SPATIAL')),
            job_id VARCHAR2(100),
            dataset_fingerprint VARCHAR2(64) NOT NULL,
            sql_id VARCHAR2(13) NOT NULL,
            child_number NUMBER NOT NULL,
            plan_hash_value NUMBER NOT NULL,
            plan_operation VARCHAR2(100) NOT NULL,
            object_owner VARCHAR2(128),
            object_name VARCHAR2(128) NOT NULL,
            index_name VARCHAR2(128),
            verified_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT ck_feature_plan_hash_nonnegative
              CHECK (plan_hash_value >= 0),
            CONSTRAINT pk_feature_plan_evidence
              PRIMARY KEY (generation_id, feature_name)
          )
        ]';
    END IF;
END;
/

/*
 * A retained plan row without an Oracle-supplied PLAN_HASH_VALUE cannot be
 * upgraded into exact-child evidence. Remove incomplete derived proof, then
 * constrain the column; startup/recovery must establish a fresh real cursor.
 */
DECLARE
    v_column_count PLS_INTEGER;
    v_nullable user_tab_columns.nullable%TYPE;
    v_constraint_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_column_count
    FROM user_tab_columns
    WHERE table_name = 'APP_FEATURE_PLAN_EVIDENCE'
      AND column_name = 'PLAN_HASH_VALUE';

    IF v_column_count = 0 THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE app_feature_plan_evidence '
          || 'ADD plan_hash_value NUMBER';
    END IF;

    DELETE FROM app_feature_plan_evidence
    WHERE plan_hash_value IS NULL
       OR plan_hash_value < 0;

    SELECT nullable
    INTO v_nullable
    FROM user_tab_columns
    WHERE table_name = 'APP_FEATURE_PLAN_EVIDENCE'
      AND column_name = 'PLAN_HASH_VALUE';
    IF v_nullable = 'Y' THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE app_feature_plan_evidence '
          || 'MODIFY (plan_hash_value NOT NULL)';
    END IF;

    SELECT COUNT(*)
    INTO v_constraint_count
    FROM user_constraints
    WHERE table_name = 'APP_FEATURE_PLAN_EVIDENCE'
      AND constraint_name = 'CK_FEATURE_PLAN_HASH_POSITIVE';
    IF v_constraint_count = 0 THEN
        NULL;
    ELSE
        EXECUTE IMMEDIATE
          'ALTER TABLE app_feature_plan_evidence '
          || 'DROP CONSTRAINT ck_feature_plan_hash_positive';
    END IF;
    SELECT COUNT(*)
    INTO v_constraint_count
    FROM user_constraints
    WHERE table_name = 'APP_FEATURE_PLAN_EVIDENCE'
      AND constraint_name = 'CK_FEATURE_PLAN_HASH_NONNEGATIVE';
    IF v_constraint_count = 0 THEN
        EXECUTE IMMEDIATE
          'ALTER TABLE app_feature_plan_evidence '
          || 'ADD CONSTRAINT ck_feature_plan_hash_nonnegative '
          || 'CHECK (plan_hash_value >= 0)';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'APP_VECTOR_GENERATION_EVIDENCE';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_vector_generation_evidence (
            generation_id VARCHAR2(64) NOT NULL,
            dataset_fingerprint VARCHAR2(64) NOT NULL,
            entity_type VARCHAR2(10) NOT NULL
              CHECK (entity_type IN ('PRODUCT','POST','MATCH')),
            entity_id NUMBER NOT NULL,
            source_hash VARCHAR2(64) NOT NULL,
            vector_hash VARCHAR2(64) NOT NULL,
            model_name VARCHAR2(128) NOT NULL,
            validated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT pk_vector_generation_evidence
              PRIMARY KEY (generation_id, entity_type, entity_id)
          )
        ]';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_OML_MODEL_REGISTRY';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_oml_model_registry (
            logical_name VARCHAR2(30) PRIMARY KEY,
            physical_name VARCHAR2(30) NOT NULL UNIQUE,
            generation_id VARCHAR2(64) NOT NULL,
            activated_job_id VARCHAR2(100),
            activated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
          )
        ]';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_OML_TRAINING_GENERATIONS';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_oml_training_generations (
            generation_id VARCHAR2(64) NOT NULL,
            logical_name VARCHAR2(30) NOT NULL,
            training_fingerprint VARCHAR2(64) NOT NULL,
            training_row_count NUMBER NOT NULL,
            status VARCHAR2(20) NOT NULL
              CONSTRAINT ck_oml_training_status
                CHECK (status IN (
                  'STAGED','TRAINED','VALIDATED','ACTIVE','SUPERSEDED','FAILED'
                )),
            failed_reason VARCHAR2(2000),
            retired_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT pk_oml_training_generations
              PRIMARY KEY (generation_id, logical_name)
          )
        ]';
    END IF;
END;
/

DECLARE
    v_has_superseded PLS_INTEGER;
    PROCEDURE add_column_if_missing(p_column VARCHAR2, p_ddl VARCHAR2) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM user_tab_columns
        WHERE table_name = 'APP_OML_TRAINING_GENERATIONS'
          AND column_name = UPPER(p_column);
        IF v_count = 0 THEN EXECUTE IMMEDIATE p_ddl; END IF;
    END;
BEGIN
    add_column_if_missing(
      'FAILED_REASON',
      'ALTER TABLE app_oml_training_generations ADD failed_reason VARCHAR2(2000)'
    );
    add_column_if_missing(
      'RETIRED_AT',
      'ALTER TABLE app_oml_training_generations ADD retired_at TIMESTAMP'
    );

    SELECT COUNT(*) INTO v_has_superseded
    FROM user_constraints
    WHERE table_name = 'APP_OML_TRAINING_GENERATIONS'
      AND constraint_type = 'C'
      AND UPPER(search_condition_vc) LIKE '%SUPERSEDED%';

    IF v_has_superseded = 0 THEN
        FOR old_status_check IN (
            SELECT constraint_name
            FROM user_constraints
            WHERE table_name = 'APP_OML_TRAINING_GENERATIONS'
              AND constraint_type = 'C'
              AND UPPER(search_condition_vc) LIKE '%STAGED%'
              AND UPPER(search_condition_vc) LIKE '%TRAINED%'
        ) LOOP
            EXECUTE IMMEDIATE
              'ALTER TABLE app_oml_training_generations DROP CONSTRAINT ' ||
              DBMS_ASSERT.SIMPLE_SQL_NAME(old_status_check.constraint_name);
        END LOOP;
        EXECUTE IMMEDIATE q'[
          ALTER TABLE app_oml_training_generations
          ADD CONSTRAINT ck_oml_training_status
          CHECK (status IN (
            'STAGED','TRAINED','VALIDATED','ACTIVE','SUPERSEDED','FAILED'
          ))
        ]';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tables
    WHERE table_name = 'APP_OML_ASSET_INVENTORY';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE TABLE app_oml_asset_inventory (
            generation_id VARCHAR2(64) NOT NULL,
            logical_name VARCHAR2(30) NOT NULL,
            asset_type VARCHAR2(10) NOT NULL
              CHECK (asset_type IN ('MODEL','VIEW')),
            asset_name VARCHAR2(30) NOT NULL,
            asset_status VARCHAR2(20) NOT NULL
              CHECK (asset_status IN (
                'PLANNED','CREATED','ACTIVE','SUPERSEDED','FAILED','DROPPED'
              )),
            failure_reason VARCHAR2(2000),
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            activated_at TIMESTAMP,
            retired_at TIMESTAMP,
            dropped_at TIMESTAMP,
            CONSTRAINT pk_oml_asset_inventory
              PRIMARY KEY (generation_id, asset_type, asset_name)
          )
        ]';
    END IF;
END;
/

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_indexes
    WHERE index_name = 'IDX_OML_ASSET_LIFECYCLE';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
          CREATE INDEX idx_oml_asset_lifecycle
          ON app_oml_asset_inventory(asset_status, updated_at, generation_id)
        ]';
    END IF;
END;
/

DECLARE
    PROCEDURE ensure_stage_table(p_name VARCHAR2, p_columns VARCHAR2) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = UPPER(p_name);
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'CREATE TABLE ' || p_name || ' (' || p_columns || ')';
        END IF;
    END;
BEGIN
    ensure_stage_table('app_oml_stage_demand', q'[
      generation_id VARCHAR2(64) NOT NULL, source_case_id VARCHAR2(128) NOT NULL,
      category VARCHAR2(100), unit_price NUMBER, total_posts NUMBER,
      avg_sentiment NUMBER, total_likes NUMBER, total_shares NUMBER,
      total_views NUMBER, avg_virality NUMBER, viral_posts NUMBER,
      rising_posts NUMBER, units_sold NUMBER, revenue NUMBER,
      surge_label VARCHAR2(20) NOT NULL,
      CONSTRAINT pk_oml_stage_demand PRIMARY KEY (generation_id, source_case_id)]');
    ensure_stage_table('app_oml_stage_customer', q'[
      generation_id VARCHAR2(64) NOT NULL, source_case_id VARCHAR2(128) NOT NULL,
      lifetime_value NUMBER, recency_days NUMBER, frequency NUMBER,
      monetary NUMBER, avg_order_value NUMBER, total_items NUMBER,
      CONSTRAINT pk_oml_stage_customer PRIMARY KEY (generation_id, source_case_id)]');
    ensure_stage_table('app_oml_stage_revenue', q'[
      generation_id VARCHAR2(64) NOT NULL, source_case_id VARCHAR2(128) NOT NULL,
      target_revenue NUMBER, customer_tier VARCHAR2(40), lifetime_value NUMBER,
      recency_days NUMBER, frequency NUMBER, monetary NUMBER,
      avg_order_value NUMBER, item_count NUMBER, total_quantity NUMBER,
      avg_item_price NUMBER, shipping_cost NUMBER, demand_score NUMBER,
      social_order_flag NUMBER,
      CONSTRAINT pk_oml_stage_revenue PRIMARY KEY (generation_id, source_case_id)]');
    ensure_stage_table('app_oml_stage_product', q'[
      generation_id VARCHAR2(64) NOT NULL, source_case_id VARCHAR2(128) NOT NULL,
      unit_price NUMBER, weight_kg NUMBER, units_sold NUMBER, revenue NUMBER,
      order_count NUMBER, total_engagement NUMBER, avg_sentiment NUMBER,
      avg_virality NUMBER,
      CONSTRAINT pk_oml_stage_product PRIMARY KEY (generation_id, source_case_id)]');
END;
/

DECLARE
    PROCEDURE add_column_if_missing(p_table VARCHAR2, p_column VARCHAR2, p_ddl VARCHAR2) IS
        v_count PLS_INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM user_tab_columns
        WHERE table_name = UPPER(p_table) AND column_name = UPPER(p_column);
        IF v_count = 0 THEN EXECUTE IMMEDIATE p_ddl; END IF;
    END;
BEGIN
    add_column_if_missing('APP_OML_MODEL_REGISTRY', 'TRAINING_FINGERPRINT',
      'ALTER TABLE app_oml_model_registry ADD training_fingerprint VARCHAR2(64)');
    add_column_if_missing('APP_OML_MODEL_REGISTRY', 'TRAINING_ROW_COUNT',
      'ALTER TABLE app_oml_model_registry ADD training_row_count NUMBER');
END;
/

MERGE INTO app_oml_model_registry target
USING (
    SELECT 'DEMAND_SURGE_MODEL' logical_name, 'DEMAND_SURGE_MODEL' physical_name FROM dual UNION ALL
    SELECT 'CUSTOMER_SEGMENT_MODEL', 'CUSTOMER_SEGMENT_MODEL' FROM dual UNION ALL
    SELECT 'REVENUE_PREDICT_MODEL', 'REVENUE_PREDICT_MODEL' FROM dual UNION ALL
    SELECT 'PRODUCT_CLUSTER_MODEL', 'PRODUCT_CLUSTER_MODEL' FROM dual
) source
ON (target.logical_name = source.logical_name)
WHEN NOT MATCHED THEN INSERT (
    logical_name, physical_name, generation_id, activated_job_id,
    training_fingerprint, training_row_count, activated_at
) VALUES (
    source.logical_name, source.physical_name, 'bootstrap-v1', NULL,
    'BOOTSTRAP', NULL, SYSTIMESTAMP
);

MERGE INTO app_oml_asset_inventory target
USING (
    SELECT 'DEMAND_SURGE_MODEL' logical_name, 'DEMAND_SURGE_MODEL' asset_name FROM dual UNION ALL
    SELECT 'CUSTOMER_SEGMENT_MODEL', 'CUSTOMER_SEGMENT_MODEL' FROM dual UNION ALL
    SELECT 'REVENUE_PREDICT_MODEL', 'REVENUE_PREDICT_MODEL' FROM dual UNION ALL
    SELECT 'PRODUCT_CLUSTER_MODEL', 'PRODUCT_CLUSTER_MODEL' FROM dual
) source
ON (
    target.generation_id = 'bootstrap-v1'
    AND target.asset_type = 'MODEL'
    AND target.asset_name = source.asset_name
)
WHEN NOT MATCHED THEN INSERT (
    generation_id, logical_name, asset_type, asset_name, asset_status,
    created_at, updated_at, activated_at
) VALUES (
    'bootstrap-v1', source.logical_name, 'MODEL', source.asset_name, 'ACTIVE',
    SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
);

DECLARE v_count PLS_INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM user_tab_columns
    WHERE table_name = 'APP_DATASET_STATE' AND column_name = 'ACTIVE_GENERATION_ID';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state ADD active_generation_id VARCHAR2(64)';
    END IF;
END;
/
UPDATE app_dataset_state
SET active_generation_id = NVL(active_generation_id, 'bootstrap-v1')
WHERE state_id = 1;

/*
 * Retained volumes created before the T16 invariant can contain NULL
 * provenance/cache values. Mark those derived rows as requiring rebuild
 * before adding NOT NULL constraints. The vector finalizer then replaces the
 * deliberately unhealthy sentinels atomically; no NULL row is credited as
 * healthy evidence.
 */
DECLARE
    PROCEDURE constrain_column(
      p_table_name VARCHAR2,
      p_column_name VARCHAR2,
      p_backfill_sql VARCHAR2,
      p_modify_sql VARCHAR2
    ) IS
        v_nullable user_tab_columns.nullable%TYPE;
    BEGIN
        SELECT nullable
        INTO v_nullable
        FROM user_tab_columns
        WHERE table_name = UPPER(p_table_name)
          AND column_name = UPPER(p_column_name);

        IF v_nullable = 'Y' THEN
            EXECUTE IMMEDIATE p_backfill_sql;
            EXECUTE IMMEDIATE p_modify_sql;
        END IF;
    END;
BEGIN
    constrain_column(
      'PRODUCT_EMBEDDINGS',
      'EMBEDDING_MODEL',
      q'[UPDATE product_embeddings
         SET embedding_model =
               'NULL_PROVENANCE_REBUILD_' || TO_CHAR(embedding_id)
         WHERE embedding_model IS NULL]',
      'ALTER TABLE product_embeddings MODIFY (embedding_model NOT NULL)'
    );
    constrain_column(
      'POST_EMBEDDINGS',
      'EMBEDDING_MODEL',
      q'[UPDATE post_embeddings
         SET embedding_model =
               'NULL_PROVENANCE_REBUILD_' || TO_CHAR(embedding_id)
         WHERE embedding_model IS NULL]',
      'ALTER TABLE post_embeddings MODIFY (embedding_model NOT NULL)'
    );
    constrain_column(
      'SEMANTIC_MATCHES',
      'SIMILARITY_SCORE',
      q'[UPDATE semantic_matches
         SET similarity_score = -2
         WHERE similarity_score IS NULL]',
      'ALTER TABLE semantic_matches MODIFY (similarity_score NOT NULL)'
    );
    constrain_column(
      'SEMANTIC_MATCHES',
      'MATCH_RANK',
      q'[UPDATE semantic_matches
         SET match_rank = 0
         WHERE match_rank IS NULL]',
      'ALTER TABLE semantic_matches MODIFY (match_rank NOT NULL)'
    );
    constrain_column(
      'SEMANTIC_MATCHES',
      'MATCH_METHOD',
      q'[UPDATE semantic_matches
         SET match_method = 'keyword'
         WHERE match_method IS NULL]',
      'ALTER TABLE semantic_matches MODIFY (match_method NOT NULL)'
    );
END;
/
COMMIT;
