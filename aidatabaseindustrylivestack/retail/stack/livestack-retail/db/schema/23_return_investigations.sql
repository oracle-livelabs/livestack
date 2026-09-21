/*
 * Persisted, VPD-scoped Returns Intelligence investigation threads.
 * These are runtime artifacts, not importable demo-data tables.
 */

SET SERVEROUTPUT ON

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tables
  WHERE table_name = 'RETURN_INVESTIGATIONS';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE return_investigations (
        investigation_id       VARCHAR2(80) PRIMARY KEY,
        return_id              NUMBER NOT NULL
                               REFERENCES return_requests(return_id) ON DELETE CASCADE,
        owner_username         VARCHAR2(128) NOT NULL,
        dataset_generation_id  VARCHAR2(64) NOT NULL,
        title                  VARCHAR2(200) NOT NULL,
        status                 VARCHAR2(16) DEFAULT 'ACTIVE' NOT NULL,
        version                NUMBER DEFAULT 0 NOT NULL,
        created_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        updated_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT ck_ret_inv_status CHECK (status IN ('ACTIVE', 'ARCHIVED', 'CLOSED')),
        CONSTRAINT ck_ret_inv_version CHECK (version >= 0)
      )
    ]';
  END IF;
END;
/

-- Reconcile the status constraint on retained volumes created by an earlier
-- investigation preview that only allowed ACTIVE/CLOSED.
BEGIN
  EXECUTE IMMEDIATE
    'ALTER TABLE return_investigations DROP CONSTRAINT ck_ret_inv_status';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE <> -2443 THEN RAISE; END IF;
END;
/

ALTER TABLE return_investigations ADD CONSTRAINT ck_ret_inv_status
  CHECK (status IN ('ACTIVE', 'ARCHIVED', 'CLOSED'));

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tables
  WHERE table_name = 'RETURN_INVESTIGATION_TURNS';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE return_investigation_turns (
        turn_id              VARCHAR2(80) PRIMARY KEY,
        investigation_id     VARCHAR2(80) NOT NULL
                             REFERENCES return_investigations(investigation_id) ON DELETE CASCADE,
        turn_number           NUMBER NOT NULL,
        client_request_id     VARCHAR2(100) NOT NULL,
        request_fingerprint   VARCHAR2(64) NOT NULL,
        question              CLOB NOT NULL,
        resolved_question     CLOB NOT NULL,
        answer_payload        JSON NOT NULL,
        route_metadata        JSON NOT NULL,
        evidence_metadata     JSON NOT NULL,
        status                VARCHAR2(16) NOT NULL,
        created_by            VARCHAR2(128) NOT NULL,
        created_at            TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT uq_ret_inv_turn_no UNIQUE (investigation_id, turn_number),
        CONSTRAINT uq_ret_inv_request UNIQUE (investigation_id, client_request_id),
        CONSTRAINT ck_ret_inv_turn_no CHECK (turn_number > 0),
        CONSTRAINT ck_ret_inv_turn_status CHECK (status IN ('ANSWERED', 'AMBIGUOUS'))
      )
    ]';
  END IF;
END;
/

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_indexes
  WHERE index_name = 'IDX_RET_INV_RETURN_OWNER';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE
      'CREATE INDEX idx_ret_inv_return_owner ON return_investigations(return_id, owner_username, updated_at)';
  END IF;
END;
/

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_indexes
  WHERE index_name = 'IDX_RET_INV_TURN_CREATED';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE
      'CREATE INDEX idx_ret_inv_turn_created ON return_investigation_turns(investigation_id, created_at)';
  END IF;
END;
/

COMMENT ON TABLE return_investigations IS
  'Owner-scoped, dataset-generation-bound investigation threads for Returns Intelligence.';
COMMENT ON TABLE return_investigation_turns IS
  'Idempotent grounded turns containing bounded answer, route, and evidence metadata.';

COMMIT;
