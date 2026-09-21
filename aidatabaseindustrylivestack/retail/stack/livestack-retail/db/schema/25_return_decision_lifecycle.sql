/*
 * Governed Returns reviewer decision lifecycle.
 * Idempotent on fresh and retained databases; data reset/import integration
 * is intentionally owned by the root integration wave.
 */

SET SERVEROUTPUT ON
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tab_columns
  WHERE table_name = 'RETURN_REQUESTS'
    AND column_name = 'DECISION_VERSION';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE
      'ALTER TABLE return_requests ADD decision_version NUMBER DEFAULT 0 NOT NULL';
  END IF;
END;
/

DECLARE
  PROCEDURE create_table_if_missing(p_name VARCHAR2, p_ddl CLOB) IS
    v_count PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = UPPER(p_name);
    IF v_count = 0 THEN EXECUTE IMMEDIATE p_ddl; END IF;
  END;
BEGIN
  create_table_if_missing('RETURN_DECISION_PROPOSALS', q'[
    CREATE TABLE return_decision_proposals (
      proposal_id            VARCHAR2(80) PRIMARY KEY,
      return_id              NUMBER NOT NULL REFERENCES return_requests(return_id) ON DELETE CASCADE,
      owner_username         VARCHAR2(128) NOT NULL,
      dataset_generation_id  VARCHAR2(64) NOT NULL,
      decision_type          VARCHAR2(40) NOT NULL,
      reviewer_notes         CLOB,
      customer_response      CLOB NOT NULL,
      evidence_snapshot      JSON NOT NULL,
      ai_recommendation      VARCHAR2(30) NOT NULL,
      policy_clause          VARCHAR2(60),
      case_version           NUMBER DEFAULT 0 NOT NULL,
      status                 VARCHAR2(20) DEFAULT 'DRAFT' NOT NULL,
      version                NUMBER DEFAULT 0 NOT NULL,
      finalized_decision_id  NUMBER REFERENCES return_decisions(decision_id),
      created_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      updated_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      finalized_at           TIMESTAMP,
      CONSTRAINT ck_return_decision_proposal_type CHECK (
        decision_type IN ('Approve','Deny','Request Info')
      ),
      CONSTRAINT ck_return_decision_proposal_status CHECK (
        status IN ('DRAFT','FINALIZED','ARCHIVED','STALE')
      ),
      CONSTRAINT ck_return_decision_proposal_version CHECK (version >= 0)
    )
  ]');

  create_table_if_missing('RETURN_DECISION_PROVENANCE', q'[
    CREATE TABLE return_decision_provenance (
      provenance_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      decision_id            NUMBER NOT NULL UNIQUE REFERENCES return_decisions(decision_id) ON DELETE CASCADE,
      return_id              NUMBER NOT NULL REFERENCES return_requests(return_id) ON DELETE CASCADE,
      proposal_id            VARCHAR2(80) NOT NULL UNIQUE REFERENCES return_decision_proposals(proposal_id),
      reviewer_username      VARCHAR2(128) NOT NULL,
      dataset_generation_id  VARCHAR2(64) NOT NULL,
      ai_recommendation      VARCHAR2(30) NOT NULL,
      policy_clause          VARCHAR2(60),
      evidence_snapshot      JSON NOT NULL,
      decision_payload       JSON NOT NULL,
      created_at             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )
  ]');

  create_table_if_missing('RETURN_CUSTOMER_MESSAGES', q'[
    CREATE TABLE return_customer_messages (
      message_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      return_id           NUMBER NOT NULL REFERENCES return_requests(return_id) ON DELETE CASCADE,
      decision_id         NUMBER NOT NULL UNIQUE REFERENCES return_decisions(decision_id) ON DELETE CASCADE,
      proposal_id         VARCHAR2(80) NOT NULL REFERENCES return_decision_proposals(proposal_id),
      message_text        CLOB NOT NULL,
      delivery_status     VARCHAR2(20) DEFAULT 'RECORDED' NOT NULL,
      created_by          VARCHAR2(128) NOT NULL,
      created_at          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT ck_return_customer_message_status CHECK (
        delivery_status IN ('RECORDED','QUEUED','SENT','FAILED')
      )
    )
  ]');

  create_table_if_missing('RETURN_DECISION_COMMANDS', q'[
    CREATE TABLE return_decision_commands (
      command_id           NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      return_id            NUMBER NOT NULL REFERENCES return_requests(return_id) ON DELETE CASCADE,
      proposal_id          VARCHAR2(80),
      owner_username       VARCHAR2(128) NOT NULL,
      client_request_id    VARCHAR2(100) NOT NULL,
      command_type         VARCHAR2(20) NOT NULL,
      request_fingerprint  VARCHAR2(64) NOT NULL,
      response_payload     JSON NOT NULL,
      created_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CONSTRAINT uq_return_decision_command UNIQUE (owner_username, client_request_id),
      CONSTRAINT ck_return_decision_command_type CHECK (
        command_type IN ('CREATE','UPDATE','FINALIZE')
      )
    )
  ]');
END;
/

DECLARE
  PROCEDURE create_index_if_missing(p_name VARCHAR2, p_ddl VARCHAR2) IS
    v_count PLS_INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_count FROM user_indexes WHERE index_name = UPPER(p_name);
    IF v_count = 0 THEN EXECUTE IMMEDIATE p_ddl; END IF;
  END;
BEGIN
  create_index_if_missing(
    'IDX_RETURN_DECISION_PROP_CASE',
    'CREATE INDEX idx_return_decision_prop_case ON return_decision_proposals(return_id, status, updated_at)'
  );
  create_index_if_missing(
    'IDX_RETURN_DECISION_PROP_OWNER',
    'CREATE INDEX idx_return_decision_prop_owner ON return_decision_proposals(owner_username, updated_at)'
  );
  create_index_if_missing(
    'IDX_RETURN_DECISION_PROV_CASE',
    'CREATE INDEX idx_return_decision_prov_case ON return_decision_provenance(return_id, created_at)'
  );
  create_index_if_missing(
    'IDX_RETURN_CUSTOMER_MSG_CASE',
    'CREATE INDEX idx_return_customer_msg_case ON return_customer_messages(return_id, created_at)'
  );
  create_index_if_missing(
    'IDX_RETURN_DECISION_CMD_CASE',
    'CREATE INDEX idx_return_decision_cmd_case ON return_decision_commands(return_id, created_at)'
  );
END;
/

/* Keep operational decision writes and current-generation semantic evidence
 * in the same transaction. Both procedures are preserved in the package spec.
 */
CREATE OR REPLACE PACKAGE retail_return_evidence_pkg AUTHID DEFINER AS
  PROCEDURE rebuild(p_generation_id IN VARCHAR2);
  PROCEDURE refresh_return(
    p_return_id IN NUMBER,
    p_generation_id IN VARCHAR2
  );
END retail_return_evidence_pkg;
/

CREATE OR REPLACE PACKAGE BODY retail_return_evidence_pkg AS
  PROCEDURE validate_generation(p_generation_id IN VARCHAR2) IS
  BEGIN
    IF p_generation_id IS NULL
       OR NOT REGEXP_LIKE(p_generation_id, '^[A-Za-z0-9_.:-]{1,64}$') THEN
      RAISE_APPLICATION_ERROR(-20600, 'A valid dataset generation is required');
    END IF;
  END validate_generation;

  PROCEDURE insert_sources(
    p_generation_id IN VARCHAR2,
    p_return_id IN NUMBER DEFAULT NULL
  ) IS
  BEGIN
    INSERT INTO return_evidence_index (
      return_id, source_type, source_id, title, evidence_text, content_hash,
      embedding_model, embedding_dimensions, embedding, generation_id,
      source_created_at
    )
    SELECT source.return_id,
           source.source_type,
           source.source_id,
           source.title,
           TO_CLOB(source.evidence_text),
           RAWTOHEX(STANDARD_HASH(source.evidence_text, 'SHA256')),
           'ALL_MINILM_L12_V2',
           384,
           VECTOR_EMBEDDING(
             ALL_MINILM_L12_V2 USING TO_CLOB(source.evidence_text) AS DATA
           ),
           p_generation_id,
           source.source_created_at
    FROM return_evidence_source_v source
    WHERE p_return_id IS NULL OR source.return_id = p_return_id;
  END insert_sources;

  PROCEDURE rebuild(p_generation_id IN VARCHAR2) IS
  BEGIN
    validate_generation(p_generation_id);
    DELETE FROM return_evidence_index;
    insert_sources(p_generation_id, NULL);
  END rebuild;

  PROCEDURE refresh_return(
    p_return_id IN NUMBER,
    p_generation_id IN VARCHAR2
  ) IS
    v_visible PLS_INTEGER;
  BEGIN
    validate_generation(p_generation_id);
    IF p_return_id IS NULL OR p_return_id <= 0 THEN
      RAISE_APPLICATION_ERROR(-20601, 'A valid return is required');
    END IF;
    SELECT COUNT(*) INTO v_visible
    FROM return_requests
    WHERE return_id = p_return_id;
    IF v_visible <> 1 THEN
      RAISE_APPLICATION_ERROR(-20602, 'Return is unavailable in the active VPD scope');
    END IF;
    DELETE FROM return_evidence_index WHERE return_id = p_return_id;
    insert_sources(p_generation_id, p_return_id);
  END refresh_return;
END retail_return_evidence_pkg;
/

COMMENT ON TABLE return_decision_proposals IS
  'Editable human-review proposals; no row is an operational decision until explicitly finalized by an Admin.';
COMMENT ON TABLE return_decision_provenance IS
  'Immutable evidence, policy, AI recommendation, dataset generation, and reviewer provenance for a committed human return decision.';
COMMENT ON TABLE return_customer_messages IS
  'Customer-facing response recorded atomically with the authorized human return decision.';
COMMENT ON TABLE return_decision_commands IS
  'Idempotency ledger for governed create, update, and finalization commands.';

COMMIT;
