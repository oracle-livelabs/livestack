-- Durable Higher Education dataset-generation state. Idempotent on retained volumes.
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
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_JOBS';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_jobs (
      job_id VARCHAR2(80) PRIMARY KEY, generation_id VARCHAR2(100) NOT NULL UNIQUE,
      initiating_actor VARCHAR2(128) NOT NULL, operation VARCHAR2(30) NOT NULL,
      status VARCHAR2(20) NOT NULL CHECK (status IN ('queued','running','completed','failed')),
      message VARCHAR2(1000), details_json CLOB, created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_GENERATIONS';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_generations (
      generation_id VARCHAR2(100) PRIMARY KEY, job_id VARCHAR2(80) NOT NULL UNIQUE,
      initiating_actor VARCHAR2(128) NOT NULL, prior_generation_id VARCHAR2(100),
      status VARCHAR2(20) NOT NULL CHECK (status IN ('admitted','applying','active','failed')),
      created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)]'; END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'APP_DATASET_OPERATION_LEASE';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE TABLE app_dataset_operation_lease (
      lease_id NUMBER(1) PRIMARY KEY CHECK (lease_id = 1), lease_token VARCHAR2(100),
      owner_job_id VARCHAR2(80), expires_at TIMESTAMP, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL)]';
    EXECUTE IMMEDIATE 'INSERT INTO app_dataset_operation_lease (lease_id, updated_at) VALUES (1, SYSTIMESTAMP)';
  END IF;
END;
/
DECLARE v_count NUMBER; BEGIN
  SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = 'UQ_HIGHERED_DATASET_WORK';
  IF v_count = 0 THEN EXECUTE IMMEDIATE q'[
    CREATE UNIQUE INDEX uq_highered_dataset_work ON app_dataset_generations
    (CASE WHEN status IN ('admitted','applying') THEN 1 END)]'; END IF;
END;
/
COMMIT;
SELECT 'Higher Education dataset generation lifecycle ready' AS status FROM dual;
