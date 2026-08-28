/*
 * Oracle-owned jobs, singleton lease, active version, and feature readiness.
 */
BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_dataset_jobs (
            job_id VARCHAR2(100) PRIMARY KEY,
            operation VARCHAR2(40) NOT NULL,
            status VARCHAR2(20) NOT NULL
                CHECK (status IN ('queued','running','completed','failed')),
            phase VARCHAR2(40) DEFAULT 'queued' NOT NULL,
            candidate_generation_id VARCHAR2(100),
            progress NUMBER(3) DEFAULT 0 NOT NULL CHECK (progress BETWEEN 0 AND 100),
            message VARCHAR2(1000),
            payload JSON NOT NULL,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            heartbeat_at TIMESTAMP,
            started_at TIMESTAMP,
            completed_at TIMESTAMP
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_jobs ADD (phase VARCHAR2(40) DEFAULT ''queued'' NOT NULL)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_jobs ADD (candidate_generation_id VARCHAR2(100))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_jobs ADD (heartbeat_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
        'CREATE INDEX idx_app_dataset_jobs_status ON app_dataset_jobs(status, updated_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_dataset_operation_lock (
            lock_id NUMBER(1) PRIMARY KEY CHECK (lock_id = 1),
            lease_token VARCHAR2(100),
            owner_job_id VARCHAR2(100),
            owner_type VARCHAR2(20),
            owner_id VARCHAR2(100),
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
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_dataset_operation_lock ADD (owner_type VARCHAR2(20))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_dataset_operation_lock ADD (owner_id VARCHAR2(100))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

MERGE INTO app_dataset_operation_lock target
USING (SELECT 1 lock_id FROM dual) source
ON (target.lock_id = source.lock_id)
WHEN NOT MATCHED THEN INSERT (lock_id, updated_at) VALUES (1, SYSTIMESTAMP);

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_dataset_readiness (
            readiness_id NUMBER(1) PRIMARY KEY CHECK (readiness_id = 1),
            dataset_source VARCHAR2(20),
            dataset_version VARCHAR2(40),
            job_id VARCHAR2(100),
            status VARCHAR2(20) DEFAULT 'UNKNOWN' NOT NULL
                CHECK (status IN ('UNKNOWN','STABILIZING','ACTIVE','FAILED')),
            readiness JSON,
            failure_message VARCHAR2(2000),
            activated_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

DECLARE
    v_constraint user_constraints.constraint_name%TYPE;
BEGIN
    SELECT constraint_name INTO v_constraint
    FROM user_constraints
    WHERE table_name = 'APP_DATASET_READINESS'
      AND constraint_type = 'C'
      AND REGEXP_LIKE(search_condition_vc, 'UNKNOWN.*ACTIVE.*FAILED', 'i')
      AND NOT REGEXP_LIKE(search_condition_vc, 'STABILIZING', 'i')
    FETCH FIRST 1 ROW ONLY;
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_readiness DROP CONSTRAINT '
      || DBMS_ASSERT.SIMPLE_SQL_NAME(v_constraint);
    EXECUTE IMMEDIATE q'[
      ALTER TABLE app_dataset_readiness ADD CONSTRAINT ck_app_readiness_status
      CHECK(status IN ('UNKNOWN','STABILIZING','ACTIVE','FAILED'))
    ]';
EXCEPTION
    WHEN NO_DATA_FOUND THEN NULL;
END;
/

MERGE INTO app_dataset_readiness target
USING (SELECT 1 readiness_id FROM dual) source
ON (target.readiness_id = source.readiness_id)
WHEN NOT MATCHED THEN INSERT (readiness_id, status, updated_at)
VALUES (1, 'UNKNOWN', SYSTIMESTAMP);

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_dataset_attempts (
            job_id VARCHAR2(100) PRIMARY KEY,
            candidate_generation_id VARCHAR2(100) NOT NULL,
            attempted_version VARCHAR2(40),
            phase VARCHAR2(40) NOT NULL,
            status VARCHAR2(20) NOT NULL
                CHECK (status IN ('queued','running','completed','failed')),
            readiness JSON,
            failure_message VARCHAR2(2000),
            failure_injection_phase VARCHAR2(80),
            failure_fingerprint JSON,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            completed_at TIMESTAMP
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_attempts ADD (failure_injection_phase VARCHAR2(80))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_attempts ADD (failure_fingerprint JSON)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_oml_model_registry (
            logical_name VARCHAR2(40) PRIMARY KEY,
            physical_name VARCHAR2(128) NOT NULL,
            generation_id VARCHAR2(100) NOT NULL,
            training_fingerprint VARCHAR2(64),
            training_row_count NUMBER,
            validated_at TIMESTAMP NOT NULL,
            activated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_oml_model_registry ADD (training_fingerprint VARCHAR2(64))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_oml_model_registry ADD (training_row_count NUMBER)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_oml_candidate_rows (
            generation_id VARCHAR2(100) NOT NULL,
            entity_name VARCHAR2(40) NOT NULL,
            source_id VARCHAR2(100) NOT NULL,
            row_data JSON NOT NULL,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT pk_app_oml_candidate_rows
              PRIMARY KEY(generation_id, entity_name, source_id)
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_oml_generation_models (
            generation_id VARCHAR2(100) NOT NULL,
            logical_name VARCHAR2(40) NOT NULL,
            physical_name VARCHAR2(128) NOT NULL,
            training_table VARCHAR2(128) NOT NULL,
            settings_table VARCHAR2(128) NOT NULL,
            training_fingerprint VARCHAR2(64) NOT NULL,
            training_row_count NUMBER NOT NULL,
            status VARCHAR2(20) NOT NULL
              CHECK(status IN ('staged','validated','active','abandoned')),
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            validated_at TIMESTAMP,
            activated_at TIMESTAMP,
            quarantine_reason VARCHAR2(1000),
            quarantined_at TIMESTAMP,
            assets_cleaned_at TIMESTAMP,
            CONSTRAINT pk_app_oml_generation_models
              PRIMARY KEY(generation_id, logical_name),
            CONSTRAINT uq_app_oml_generation_physical UNIQUE(physical_name)
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_oml_generation_models ADD (settings_table VARCHAR2(128))';
EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = -1430 THEN NULL;
      ELSE RAISE;
      END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_oml_generation_models ADD (quarantine_reason VARCHAR2(1000))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_oml_generation_models ADD (quarantined_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_oml_generation_models ADD (assets_cleaned_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_oml_generations (
            generation_id VARCHAR2(100) PRIMARY KEY,
            source_fingerprint VARCHAR2(64) NOT NULL,
            status VARCHAR2(20) NOT NULL
              CHECK(status IN ('planned','staging','validated','active','abandoned','cleaned')),
            quarantine_reason VARCHAR2(1000),
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            activated_at TIMESTAMP,
            cleaned_at TIMESTAMP
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_oml_generation_assets (
            generation_id VARCHAR2(100) NOT NULL,
            logical_name VARCHAR2(40) NOT NULL,
            asset_type VARCHAR2(30) NOT NULL
              CHECK(asset_type IN ('MODEL','TRAINING_TABLE','SETTINGS_TABLE')),
            asset_name VARCHAR2(128) NOT NULL,
            status VARCHAR2(20) DEFAULT 'planned' NOT NULL
              CHECK(status IN ('planned','created','active','abandoned','cleaned')),
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            materialized_at TIMESTAMP,
            cleaned_at TIMESTAMP,
            cleanup_attempts NUMBER DEFAULT 0 NOT NULL,
            cleanup_error_category VARCHAR2(80),
            cleanup_error VARCHAR2(1000),
            cleanup_last_attempt_at TIMESTAMP,
            CONSTRAINT pk_app_oml_generation_assets
              PRIMARY KEY(generation_id, asset_type, asset_name),
            CONSTRAINT uq_app_oml_generation_asset_name UNIQUE(asset_name)
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_oml_generation_assets '
      || 'ADD (cleanup_attempts NUMBER DEFAULT 0 NOT NULL)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_oml_generation_assets '
      || 'ADD (cleanup_error_category VARCHAR2(80))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_oml_generation_assets '
      || 'ADD (cleanup_error VARCHAR2(1000))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_oml_generation_assets '
      || 'ADD (cleanup_last_attempt_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'CREATE INDEX idx_app_oml_assets_status '
      || 'ON app_oml_generation_assets(generation_id, status)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_demo_date_anchor (
            anchor_id NUMBER(1) PRIMARY KEY CHECK (anchor_id = 1),
            anchor_source VARCHAR2(30) NOT NULL,
            anchor_strategy VARCHAR2(80) NOT NULL,
            original_seed_anchor TIMESTAMP,
            restore_anchor TIMESTAMP NOT NULL,
            offset_days NUMBER(12,4) DEFAULT 0 NOT NULL,
            offset_seconds NUMBER(18,3) DEFAULT 0 NOT NULL,
            shifted_table_count NUMBER DEFAULT 0 NOT NULL,
            shifted_column_count NUMBER DEFAULT 0 NOT NULL,
            shifted_value_count NUMBER DEFAULT 0 NOT NULL,
            shifted_columns_json CLOB,
            refreshed_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_dataset_event_outbox (
            event_id VARCHAR2(240) PRIMARY KEY,
            job_id VARCHAR2(100) NOT NULL,
            generation_id VARCHAR2(100) NOT NULL,
            operation VARCHAR2(40) NOT NULL,
            event_status VARCHAR2(20) NOT NULL
              CHECK(event_status IN ('requested','completed','failed')),
            object_key VARCHAR2(1000) NOT NULL,
            payload JSON NOT NULL,
            delivery_status VARCHAR2(20) DEFAULT 'pending' NOT NULL
              CHECK(delivery_status IN ('pending','delivering','delivered')),
            delivery_attempts NUMBER DEFAULT 0 NOT NULL,
            next_attempt_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            last_error VARCHAR2(2000),
            last_error_category VARCHAR2(80),
            claim_token VARCHAR2(100),
            claimed_at TIMESTAMP,
            claim_expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            delivered_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT uq_app_dataset_event_key UNIQUE(object_key)
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_event_outbox ADD (last_error_category VARCHAR2(80))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_event_outbox ADD (claim_token VARCHAR2(100))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_event_outbox ADD (claimed_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_event_outbox ADD (claim_expires_at TIMESTAMP)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE q'[
        CREATE TABLE app_feature_execution_evidence (
            generation_id VARCHAR2(100) NOT NULL,
            feature_name VARCHAR2(40) NOT NULL,
            sql_id VARCHAR2(13) NOT NULL,
            child_number NUMBER NOT NULL,
            plan_hash_value NUMBER,
            operation VARCHAR2(60) NOT NULL,
            options VARCHAR2(60),
            object_name VARCHAR2(128),
            evidence_status VARCHAR2(20) NOT NULL,
            captured_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
            CONSTRAINT pk_app_feature_execution_evidence
              PRIMARY KEY(generation_id, feature_name)
        )
    ]';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_feature_execution_evidence '
      || 'ADD (result_row_count NUMBER)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_feature_execution_evidence '
      || 'ADD (dataset_fingerprint VARCHAR2(64))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_feature_execution_evidence '
      || 'ADD (plan_fingerprint VARCHAR2(64))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_feature_execution_evidence '
      || 'ADD (expected_table_name VARCHAR2(128))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_feature_execution_evidence '
      || 'ADD (expected_index_name VARCHAR2(128))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'ALTER TABLE app_feature_execution_evidence '
      || 'ADD (no_forbidden_full_scan NUMBER(1))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -1430 THEN RAISE; END IF;
END;
/

BEGIN
    EXECUTE IMMEDIATE
      'CREATE INDEX idx_app_event_outbox_delivery '
      || 'ON app_dataset_event_outbox(delivery_status, next_attempt_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -955 THEN RAISE; END IF;
END;
/
COMMIT;
