/* Retained-volume migration for the Telco governed dataset journal. */
SET SERVEROUTPUT ON
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tab_columns WHERE table_name = 'APP_DATASET_STATE' AND column_name = 'ACTIVE_GENERATION';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state ADD (active_generation VARCHAR2(100))';
    EXECUTE IMMEDIATE q'[UPDATE app_dataset_state SET active_generation = 'gen_legacy_' || LOWER(RAWTOHEX(SYS_GUID())) WHERE active_generation IS NULL]';
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state MODIFY (active_generation NOT NULL)';
  END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_OPERATION_LOCK';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[CREATE TABLE app_dataset_operation_lock (
    lock_id NUMBER(1) PRIMARY KEY CHECK (lock_id = 1), lease_token VARCHAR2(100), owner_job_id VARCHAR2(80), operation_kind VARCHAR2(40),
    status VARCHAR2(20), message VARCHAR2(1000), progress NUMBER(3), acquired_at TIMESTAMP, heartbeat_at TIMESTAMP,
    lease_expires_at TIMESTAMP, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)]'; END IF;
  MERGE INTO app_dataset_operation_lock t USING (SELECT 1 lock_id FROM dual) s ON (t.lock_id=s.lock_id)
  WHEN NOT MATCHED THEN INSERT (lock_id, updated_at) VALUES (1, SYSTIMESTAMP);
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_GENERATIONS';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[CREATE TABLE app_dataset_generations (
    generation_id VARCHAR2(100) PRIMARY KEY, job_id VARCHAR2(80) NOT NULL UNIQUE, initiating_actor VARCHAR2(128) NOT NULL,
    prior_generation_id VARCHAR2(100), status VARCHAR2(20) NOT NULL CHECK (status IN ('admitted','applying','ready','active','recovering','failed','rolled_back')),
    recovery_json CLOB, created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, activated_at TIMESTAMP)]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'UQ_APP_DATASET_GENERATION_WORK';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[CREATE UNIQUE INDEX uq_app_dataset_generation_work ON app_dataset_generations
    (CASE WHEN status IN ('admitted','applying','ready','recovering') THEN 1 END)]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tab_columns WHERE table_name = 'APP_DATASET_GENERATIONS' AND column_name = 'ROLLBACK_DATASET_JSON';
  IF v_count = 0 THEN EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_generations ADD (rollback_dataset_json CLOB)'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tab_columns WHERE table_name = 'APP_DATASET_GENERATIONS' AND column_name = 'REQUIRED_FEATURES_JSON';
  IF v_count = 0 THEN EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_generations ADD (required_features_json CLOB)'; END IF;
END;
/
COMMIT;
