/*
 * Unified, generation-bound evidence index for Returns Intelligence.
 * The table is created before VPD installation; rows are populated only after
 * ALL_MINILM_L12_V2 is available.
 */

SET SERVEROUTPUT ON

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_tables
  WHERE table_name = 'RETURN_EVIDENCE_INDEX';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE TABLE return_evidence_index (
        evidence_id         NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        return_id           NUMBER NOT NULL
                            REFERENCES return_requests(return_id) ON DELETE CASCADE,
        source_type         VARCHAR2(40) NOT NULL,
        source_id           VARCHAR2(128) NOT NULL,
        title               VARCHAR2(400) NOT NULL,
        evidence_text       CLOB NOT NULL,
        content_hash        VARCHAR2(64) NOT NULL,
        embedding_model     VARCHAR2(100) NOT NULL,
        embedding_dimensions NUMBER(5) DEFAULT 384 NOT NULL,
        embedding           VECTOR(384, FLOAT32),
        generation_id       VARCHAR2(64) NOT NULL,
        source_created_at   TIMESTAMP,
        indexed_at          TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
        CONSTRAINT ck_return_evidence_source_type CHECK (
          source_type IN (
            'RETURN_CASE','POLICY','DOCUMENT','EVENT','DECISION','CUSTOMER_HISTORY'
          )
        ),
        CONSTRAINT ck_return_evidence_dimensions CHECK (embedding_dimensions = 384),
        CONSTRAINT uq_return_evidence_source UNIQUE (
          return_id, source_type, source_id, embedding_model
        )
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
  WHERE index_name = 'IDX_RETURN_EVIDENCE_RETURN';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE
      'CREATE INDEX idx_return_evidence_return ON return_evidence_index(return_id, source_type)';
  END IF;
END;
/

DECLARE
  v_count PLS_INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_indexes
  WHERE index_name = 'IDX_RETURN_EVIDENCE_VEC';
  IF v_count = 0 THEN
    EXECUTE IMMEDIATE q'[
      CREATE VECTOR INDEX idx_return_evidence_vec
      ON return_evidence_index(embedding)
      ORGANIZATION NEIGHBOR PARTITIONS
      WITH DISTANCE COSINE
      WITH TARGET ACCURACY 95
    ]';
  END IF;
END;
/

CREATE OR REPLACE VIEW return_evidence_source_v AS
SELECT rr.return_id,
       'RETURN_CASE' AS source_type,
       TO_CHAR(rr.return_id) AS source_id,
       CAST('Return ' || rr.return_id || ' - ' || p.product_name AS VARCHAR2(400)) AS title,
       CAST(
         'Return reason: ' || rr.return_reason || '. Risk: ' || rr.risk_rating ||
         '. Recommendation: ' || rr.recommendation || '. Status: ' || rr.status ||
         '. Product: ' || p.product_name || '. Category: ' || NVL(p.category, 'Unknown') ||
         '. Customer: ' || c.first_name || ' ' || c.last_name ||
         '. Policy: ' || NVL(rr.policy_clause, 'None') || '. Details: ' ||
         NVL(DBMS_LOB.SUBSTR(rr.damage_description, 2400, 1), 'Not recorded')
         AS VARCHAR2(4000)
       ) AS evidence_text,
       rr.created_at AS source_created_at
FROM return_requests rr
JOIN products p ON p.product_id = rr.product_id
JOIN customers c ON c.customer_id = rr.customer_id
UNION ALL
SELECT rr.return_id,
       'POLICY',
       policy.clause_code,
       CAST(policy.clause_code || ' - ' || policy.clause_title AS VARCHAR2(400)),
       CAST(
         'Policy ' || policy.clause_code || '. ' || policy.clause_title ||
         '. Category: ' || NVL(policy.category, 'General') ||
         '. Severity: ' || NVL(policy.severity, 'standard') || '. ' ||
         DBMS_LOB.SUBSTR(policy.clause_text, 3000, 1)
         AS VARCHAR2(4000)
       ),
       policy.created_at
FROM return_requests rr
JOIN return_policy_clauses policy ON policy.clause_code = rr.policy_clause
UNION ALL
SELECT document.return_id,
       'DOCUMENT',
       TO_CHAR(document.document_id),
       CAST(document.title AS VARCHAR2(400)),
       CAST(
         document.document_type || '. ' || document.title || '. ' ||
         NVL(DBMS_LOB.SUBSTR(document.excerpt, 3200, 1), 'No excerpt recorded')
         AS VARCHAR2(4000)
       ),
       document.created_at
FROM return_documents document
UNION ALL
SELECT event.return_id,
       'EVENT',
       TO_CHAR(event.event_id),
       CAST(event.event_type AS VARCHAR2(400)),
       CAST(
         'Return event: ' || event.event_type || '. Actor: ' ||
         NVL(event.actor, 'Not recorded') || '. ' ||
         NVL(DBMS_LOB.SUBSTR(event.event_note, 3200, 1), 'No event note recorded')
         AS VARCHAR2(4000)
       ),
       event.created_at
FROM return_events event
UNION ALL
SELECT decision.return_id,
       'DECISION',
       TO_CHAR(decision.decision_id),
       CAST(decision.decision_type AS VARCHAR2(400)),
       CAST(
         'Return decision: ' || decision.decision_type || '. Confidence: ' ||
         NVL(TO_CHAR(decision.confidence_score), 'Not recorded') ||
         '. Created by: ' || NVL(decision.created_by, 'Not recorded') || '. ' ||
         NVL(DBMS_LOB.SUBSTR(decision.decision_summary, 3000, 1), 'No decision summary recorded')
         AS VARCHAR2(4000)
       ),
       decision.created_at
FROM return_decisions decision
UNION ALL
SELECT rr.return_id,
       'CUSTOMER_HISTORY',
       TO_CHAR(rr.customer_id),
       CAST('Customer return history' AS VARCHAR2(400)),
       CAST(
         'Customer ' || c.first_name || ' ' || c.last_name || ' has ' ||
         (SELECT COUNT(*) FROM return_requests history_rr
          WHERE history_rr.customer_id = rr.customer_id
            AND history_rr.return_id <> rr.return_id) ||
         ' other return requests visible in this dataset. Customer tier: ' ||
         NVL(c.customer_tier, 'standard') || '. Lifetime value: ' ||
         NVL(TO_CHAR(c.lifetime_value), 'Not recorded') || '.'
         AS VARCHAR2(4000)
       ),
       rr.created_at
FROM return_requests rr
JOIN customers c ON c.customer_id = rr.customer_id;

CREATE OR REPLACE PACKAGE retail_return_evidence_pkg AUTHID DEFINER AS
  PROCEDURE rebuild(p_generation_id IN VARCHAR2);
END retail_return_evidence_pkg;
/

CREATE OR REPLACE PACKAGE BODY retail_return_evidence_pkg AS
  PROCEDURE rebuild(p_generation_id IN VARCHAR2) IS
  BEGIN
    IF p_generation_id IS NULL
       OR NOT REGEXP_LIKE(p_generation_id, '^[A-Za-z0-9_.:-]{1,64}$') THEN
      RAISE_APPLICATION_ERROR(-20600, 'A valid dataset generation is required');
    END IF;

    DELETE FROM return_evidence_index;

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
    FROM return_evidence_source_v source;
  END rebuild;
END retail_return_evidence_pkg;
/

COMMENT ON TABLE return_evidence_index IS
  'VPD-scoped, generation-bound Oracle vector index for return cases, policies, documents, events, decisions, and customer-history summaries.';
COMMENT ON COLUMN return_evidence_index.content_hash IS
  'SHA-256 of the exact evidence_text used to generate the embedding.';
COMMENT ON COLUMN return_evidence_index.generation_id IS
  'Dataset generation that produced this derived evidence row.';

COMMIT;
