/*
 * 13_dataset_generation_lifecycle.sql
 *
 * Retained-volume migration for the Utilities atomic generation journal.
 * New volumes already receive the same objects from 01_tables.sql.  Every
 * block is idempotent so normal bootstrap hydration can run it on each start.
 */
SET SERVEROUTPUT ON

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tab_columns
  WHERE table_name = 'APP_DATASET_STATE'
    AND column_name = 'ACTIVE_GENERATION';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state ADD (active_generation VARCHAR2(100))';
    EXECUTE IMMEDIATE q'[
      UPDATE app_dataset_state
      SET active_generation = 'gen_legacy_' || LOWER(RAWTOHEX(SYS_GUID()))
      WHERE active_generation IS NULL
    ]';
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_state MODIFY (active_generation NOT NULL)';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tab_columns
  WHERE table_name = 'APP_DATASET_JOBS'
    AND column_name = 'INITIATING_ACTOR';

  IF v_count = 0 THEN
    -- Retained terminal history cannot be assigned a trusted actor after the
    -- fact. New admission always supplies this value; startup rejects any
    -- nonterminal legacy row for which it is absent.
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_jobs ADD (initiating_actor VARCHAR2(128))';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tab_columns
  WHERE table_name = 'APP_DATASET_JOBS'
    AND column_name = 'GENERATION_ID';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_jobs ADD (generation_id VARCHAR2(100))';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tables
  WHERE table_name = 'APP_DATASET_GENERATIONS';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE app_dataset_generations (
        generation_id          VARCHAR2(100) PRIMARY KEY,
        job_id                 VARCHAR2(80) NOT NULL UNIQUE,
        initiating_actor       VARCHAR2(128) NOT NULL,
        prior_generation_id    VARCHAR2(100),
        status                 VARCHAR2(20) NOT NULL
                               CHECK (status IN (
                                 'admitted','snapshotting','staged','applying',
                                 'ready','active','recovering','rolled_back',
                                 'failed','superseded'
                               )),
        snapshot_complete      NUMBER(1) DEFAULT 0 NOT NULL
                               CHECK (snapshot_complete IN (0,1)),
        rollback_dataset_json  CLOB,
        prior_dataset_json     CLOB,
        required_features_json CLOB,
        recovery_json          CLOB,
        apply_started_at       TIMESTAMP,
        ready_at               TIMESTAMP,
        activated_at           TIMESTAMP,
        created_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        updated_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
      )
    ]';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tab_columns
  WHERE table_name = 'APP_DATASET_GENERATIONS'
    AND column_name = 'INITIATING_ACTOR';

  IF v_count = 0 THEN
    -- As with jobs, legacy terminal history remains nullable. Any incomplete
    -- generation without a persisted actor fails startup recovery closed.
    EXECUTE IMMEDIATE 'ALTER TABLE app_dataset_generations ADD (initiating_actor VARCHAR2(128))';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_indexes
  WHERE index_name = 'UQ_APP_DATASET_GENERATION_WORK';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE UNIQUE INDEX uq_app_dataset_generation_work
      ON app_dataset_generations (
        CASE
          WHEN status IN ('admitted','snapshotting','staged','applying','ready','recovering')
          THEN 1
        END
      )
    ]';
  END IF;
END;
/

COMMIT;

SELECT 'Dataset generation lifecycle journal ready' AS status FROM dual;
