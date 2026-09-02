/*
 * Durable, owner-scoped Agent Console conversations and orchestration telemetry.
 * Runtime artifacts are bound to the active dataset generation and are not
 * imported as demo business data.
 */

SET SERVEROUTPUT ON

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'AGENT_CONVERSATIONS';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE agent_conversations (
        conversation_id       VARCHAR2(80) PRIMARY KEY,
        owner_username        VARCHAR2(128) NOT NULL,
        owner_role            VARCHAR2(30) NOT NULL,
        access_scope          VARCHAR2(30) NOT NULL,
        dataset_generation_id VARCHAR2(64) NOT NULL,
        title                 VARCHAR2(200) NOT NULL,
        status                VARCHAR2(16) DEFAULT 'ACTIVE' NOT NULL,
        last_team             VARCHAR2(80),
        context_payload       JSON NOT NULL,
        turn_count            NUMBER DEFAULT 0 NOT NULL,
        created_at            TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        updated_at            TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT ck_agent_conv_status CHECK (status IN ('ACTIVE','ARCHIVED')),
        CONSTRAINT ck_agent_conv_turns CHECK (turn_count >= 0)
      )
    ]';
  END IF;
END;
/

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'AGENT_CONVERSATION_TURNS';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE agent_conversation_turns (
        turn_id                VARCHAR2(80) PRIMARY KEY,
        conversation_id        VARCHAR2(80) NOT NULL
                               REFERENCES agent_conversations(conversation_id) ON DELETE CASCADE,
        owner_username          VARCHAR2(128) NOT NULL,
        dataset_generation_id   VARCHAR2(64) NOT NULL,
        turn_number             NUMBER NOT NULL,
        question                VARCHAR2(1000) NOT NULL,
        routed_team             VARCHAR2(80),
        route_status            VARCHAR2(24) NOT NULL,
        route_metadata          JSON NOT NULL,
        answer_payload          JSON NOT NULL,
        evidence_metadata       JSON NOT NULL,
        telemetry_payload       JSON NOT NULL,
        created_at              TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT uq_agent_conv_turn UNIQUE (conversation_id, turn_number),
        CONSTRAINT ck_agent_turn_number CHECK (turn_number > 0),
        CONSTRAINT ck_agent_route_status CHECK (route_status IN ('completed','clarification','refused','failed'))
      )
    ]';
  END IF;
END;
/

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_tables WHERE table_name = 'AGENT_RUNTIME_TELEMETRY';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE agent_runtime_telemetry (
        telemetry_id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        correlation_id       VARCHAR2(80) NOT NULL,
        conversation_id      VARCHAR2(80),
        turn_id              VARCHAR2(80),
        owner_username       VARCHAR2(128) NOT NULL,
        dataset_generation_id VARCHAR2(64) NOT NULL,
        event_type           VARCHAR2(60) NOT NULL,
        event_payload        JSON NOT NULL,
        elapsed_ms           NUMBER,
        created_at           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
      )
    ]';
  END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_agent_conv_owner_gen ON agent_conversations(owner_username, dataset_generation_id, updated_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955, -1408) THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_agent_turn_conv ON agent_conversation_turns(conversation_id, turn_number)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955, -1408) THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE INDEX idx_agent_telemetry_corr ON agent_runtime_telemetry(correlation_id, created_at)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-955, -1408) THEN RAISE; END IF;
END;
/

CREATE OR REPLACE FUNCTION vpd_agent_console_owner(
  p_schema IN VARCHAR2,
  p_table  IN VARCHAR2
) RETURN VARCHAR2 AUTHID DEFINER AS
BEGIN
  IF SYS_CONTEXT('RETAIL_APP_CTX', 'AUTHENTICATED') <> 'Y' THEN RETURN '1 = 0'; END IF;
  RETURN 'LOWER(owner_username) = LOWER(SYS_CONTEXT(''RETAIL_APP_CTX'', ''USERNAME''))';
END;
/

BEGIN
  FOR table_name IN (
    SELECT 'AGENT_CONVERSATIONS' name FROM dual UNION ALL
    SELECT 'AGENT_CONVERSATION_TURNS' FROM dual UNION ALL
    SELECT 'AGENT_RUNTIME_TELEMETRY' FROM dual
  ) LOOP
    BEGIN
      DBMS_RLS.DROP_POLICY(USER, table_name.name, 'VPD_AGENT_CONSOLE_OWNER');
    EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -28102 THEN RAISE; END IF;
    END;
    DBMS_RLS.ADD_POLICY(
      object_schema => USER,
      object_name => table_name.name,
      policy_name => 'VPD_AGENT_CONSOLE_OWNER',
      function_schema => USER,
      policy_function => 'VPD_AGENT_CONSOLE_OWNER',
      statement_types => 'SELECT,INSERT,UPDATE,DELETE',
      update_check => TRUE,
      enable => TRUE
    );
  END LOOP;
END;
/

COMMENT ON TABLE agent_conversations IS 'Server-authoritative Agent Console threads scoped by owner and active dataset generation.';
COMMENT ON TABLE agent_conversation_turns IS 'Persisted routed turns with bounded answer, evidence, and orchestration metadata.';
COMMENT ON TABLE agent_runtime_telemetry IS 'Owner-scoped orchestration events without prompts or secret tool internals.';

COMMIT;
