/* Durable State and Local Government dataset-generation journal. */
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_STATE';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_state (
      state_id NUMBER(1) PRIMARY KEY CHECK (state_id = 1), active_source VARCHAR2(20) NOT NULL,
      active_label VARCHAR2(100) NOT NULL, active_version VARCHAR2(20), active_generation VARCHAR2(100) NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tab_columns WHERE table_name = 'APP_DATASET_STATE' AND column_name = 'ACTIVE_GENERATION';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state ADD (active_generation VARCHAR2(100))';
    EXECUTE IMMEDIATE q'[UPDATE app_dataset_state SET active_generation = 'sled_legacy_' || LOWER(RAWTOHEX(SYS_GUID())) WHERE active_generation IS NULL]';
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state MODIFY (active_generation NOT NULL)';
  END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_JOBS';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_jobs (
      job_id VARCHAR2(80) PRIMARY KEY, generation_id VARCHAR2(100) UNIQUE NOT NULL, initiating_actor VARCHAR2(128) NOT NULL,
      status VARCHAR2(20) NOT NULL CHECK (status IN ('queued','running','completed','failed')), operation VARCHAR2(40) NOT NULL,
      message VARCHAR2(1000), created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_GENERATIONS';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_generations (
      generation_id VARCHAR2(100) PRIMARY KEY, job_id VARCHAR2(80) UNIQUE NOT NULL, initiating_actor VARCHAR2(128) NOT NULL,
      prior_generation_id VARCHAR2(100), status VARCHAR2(20) NOT NULL CHECK (status IN ('admitted','applying','active','failed','recovered')),
      required_features_json CLOB, recovery_json CLOB, rollback_scn NUMBER, created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tab_columns WHERE table_name = 'APP_DATASET_GENERATIONS' AND column_name = 'ROLLBACK_SCN';
  IF v_count = 0 THEN EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_generations ADD (rollback_scn NUMBER)'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tab_columns WHERE table_name = 'APP_DATASET_GENERATIONS' AND column_name = 'FEATURE_EVIDENCE_JSON';
  IF v_count = 0 THEN EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_generations ADD (feature_evidence_json CLOB)'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_OPERATION_LEASE';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_operation_lease (
      lease_id NUMBER(1) PRIMARY KEY CHECK (lease_id = 1), lease_token VARCHAR2(100), owner_job_id VARCHAR2(80),
      status VARCHAR2(20) NOT NULL CHECK (status IN ('idle','active')), updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )]';
    EXECUTE IMMEDIATE q'[INSERT INTO app_dataset_operation_lease (lease_id, status) VALUES (1, 'idle')]';
  END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'UQ_SLED_DATASET_GENERATION_WORK';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[CREATE UNIQUE INDEX uq_sled_dataset_generation_work ON app_dataset_generations (CASE WHEN status IN ('admitted','applying') THEN 1 END)]'; END IF;
END;
/
COMMIT;
