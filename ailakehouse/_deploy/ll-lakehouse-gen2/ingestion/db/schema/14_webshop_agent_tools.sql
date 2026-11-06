/*
 * 14_webshop_agent_tools.sql
 * Notebook-derived Select AI Product Return Advisor Agent setup.
 *
 * Source notebook:
 *   SelectAI Product Return Advisor Agent.dsnb
 *
 * Runs as PG in ADB after PG_OCI_GENAI_CRED and PG_RETURN_AGENT_PROFILE have been created.
 * Product manual retrieval uses ADB-native vectors built from PRODUCT_VECTOR_STORE.
 */

SET SERVEROUTPUT ON
SET DEFINE OFF
SET SQLBLANKLINES ON

PROMPT Validating notebook return advisor profile...

DECLARE
  v_count NUMBER := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM user_cloud_ai_profiles
  WHERE profile_name = 'PG_RETURN_AGENT_PROFILE';

  IF v_count > 0 THEN
    DBMS_CLOUD_AI.SET_PROFILE(profile_name => 'PG_RETURN_AGENT_PROFILE');
    DBMS_OUTPUT.PUT_LINE('PG_RETURN_AGENT_PROFILE profile is available.');
  ELSE
    DBMS_OUTPUT.PUT_LINE('PG_RETURN_AGENT_PROFILE profile is not available. The agent objects will be created, but runtime calls require the profile.');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('PG_RETURN_AGENT_PROFILE profile validation skipped or failed: ' || SQLERRM);
END;
/

PROMPT Creating ADB-native product manual retrieval table...

BEGIN
  EXECUTE IMMEDIATE 'DROP INDEX idx_manual_embed_vec';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE product_manual_embeddings PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE product_manual_embeddings (
  product_id       NUMBER NOT NULL,
  doc_name         VARCHAR2(300),
  chunk_offset     NUMBER,
  chunk_text       CLOB,
  embedding_model  VARCHAR2(100) DEFAULT 'all_MiniLM_L12_v2',
  embedding        VECTOR(384, FLOAT32),
  created_at       TIMESTAMP DEFAULT SYSTIMESTAMP
);

INSERT INTO product_manual_embeddings (
  product_id,
  doc_name,
  chunk_offset,
  chunk_text,
  embedding
)
SELECT TO_NUMBER(product_id),
       doc_name,
       TO_NUMBER(chunk_offset),
       chunk_text,
       TO_VECTOR(DBMS_LOB.SUBSTR(chunk_vector, 32767, 1))
FROM product_vector_store
WHERE chunk_vector IS NOT NULL
  AND DBMS_LOB.GETLENGTH(chunk_vector) > 0;

COMMIT;

BEGIN
  EXECUTE IMMEDIATE '
    CREATE VECTOR INDEX idx_manual_embed_vec
    ON product_manual_embeddings(embedding)
    ORGANIZATION NEIGHBOR PARTITIONS
    WITH DISTANCE COSINE
    WITH TARGET ACCURACY 95';
EXCEPTION
  WHEN OTHERS THEN
    DBMS_OUTPUT.PUT_LINE('Product manual vector index skipped or already present: ' || SQLERRM);
END;
/

PROMPT Capturing customer order status reset baseline...

DECLARE
  v_count NUMBER := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM user_tables
  WHERE table_name = 'CUSTOMER_ORDER_STATUS';

  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(
      -20002,
      'CUSTOMER_ORDER_STATUS must be loaded from gold-data/CUSTOMER_ORDER_STATUS.csv before creating the return advisor agent.'
    );
  END IF;
END;
/

UPDATE customer_order_status
SET status = 'delivered',
    updated_at = NULL;

COMMIT;

BEGIN
  EXECUTE IMMEDIATE 'DROP TABLE customer_order_status_seed PURGE';
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
/

CREATE TABLE customer_order_status_seed AS
SELECT *
FROM customer_order_status;

COMMIT;

PROMPT Creating notebook return advisor tool functions...

CREATE OR REPLACE FUNCTION verify_customer_order (
    p_order_number IN VARCHAR2
) RETURN CLOB IS
    v_result CLOB;
    v_error  VARCHAR2(4000);
BEGIN
    SELECT JSON_OBJECT(
        'valid' VALUE 'true',
        'action' VALUE 'verify_customer_order',
        'orderNumber' VALUE order_number,
        'customerName' VALUE customer_name,
        'productId' VALUE product_id,
        'productName' VALUE product_name,
        'status' VALUE status,
        'updatedAt' VALUE updated_at,
        'message' VALUE 'Order found. Use this verified order and product context; do not ask for the order number again.'
        RETURNING CLOB
    )
    INTO v_result
    FROM customer_order_status
    WHERE order_number = TRIM(p_order_number)
    FETCH FIRST 1 ROW ONLY;

    RETURN v_result;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        SELECT JSON_OBJECT(
            'valid' VALUE 'false',
            'action' VALUE 'verify_customer_order',
            'orderNumber' VALUE TRIM(p_order_number),
            'message' VALUE 'Order not found. Ask the customer to verify the order number or provide product details.'
            RETURNING CLOB
        )
        INTO v_result
        FROM dual;
        RETURN v_result;
    WHEN OTHERS THEN
        v_error := SQLERRM;
        SELECT JSON_OBJECT(
            'valid' VALUE 'false',
            'action' VALUE 'verify_customer_order',
            'orderNumber' VALUE TRIM(p_order_number),
            'error' VALUE v_error
            RETURNING CLOB
        )
        INTO v_result
        FROM dual;
        RETURN v_result;
END;
/

CREATE OR REPLACE FUNCTION get_product_recommendations (
    p_product_id IN NUMBER
) RETURN CLOB IS
    v_result   CLOB := '';
    v_category VARCHAR2(100);
BEGIN
    SELECT category
    INTO v_category
    FROM dim_product
    WHERE source_product_id = p_product_id;

    FOR r IN (
        SELECT source_product_id, product_name, category, current_retail_price
        FROM (
            SELECT source_product_id,
                   product_name,
                   category,
                   current_retail_price,
                   CASE WHEN category = v_category THEN 1 ELSE 2 END AS sort_order
            FROM dim_product
            WHERE source_product_id <> p_product_id
        )
        ORDER BY sort_order, source_product_id
        FETCH FIRST 3 ROWS ONLY
    ) LOOP
        v_result := v_result || '- [' || r.source_product_id || '] ' || r.product_name ||
                    ' (' || r.category || ') $' || r.current_retail_price || CHR(10);
    END LOOP;

    IF v_result IS NULL OR LENGTH(v_result) = 0 THEN
        RETURN 'No alternatives found.';
    END IF;

    RETURN 'Alternative products for the customer:' || CHR(10) || v_result ||
           'Ask which product they want, or whether they prefer a refund or same-item replacement.';
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN 'Product ' || p_product_id || ' not found.';
    WHEN OTHERS THEN
        RETURN SQLERRM;
END;
/

CREATE OR REPLACE FUNCTION propose_order_status_update (
    p_customer_name IN VARCHAR2,
    p_order_number  IN VARCHAR2,
    p_status        IN VARCHAR2
) RETURN CLOB IS
    v_status VARCHAR2(80);
    v_result CLOB;
    v_error  VARCHAR2(4000);
BEGIN
    v_status := LOWER(TRIM(p_status));

    IF v_status NOT IN (
        'return_shipment_pending',
        'refund',
        'refund_completed',
        'replaced',
        'exchanged'
    ) THEN
        SELECT JSON_OBJECT(
            'valid' VALUE 'false',
            'error' VALUE 'Unsupported order status proposal: ' || NVL(p_status, 'null')
            RETURNING CLOB
        )
        INTO v_result
        FROM dual;
        RETURN v_result;
    END IF;

    SELECT JSON_OBJECT(
        'valid' VALUE 'true',
        'action' VALUE 'propose_order_status_update',
        'customerName' VALUE TRIM(p_customer_name),
        'orderNumber' VALUE TRIM(p_order_number),
        'status' VALUE v_status,
        'message' VALUE 'Order status update proposed. The application backend must validate and commit it.'
        RETURNING CLOB
    )
    INTO v_result
    FROM dual;
    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        v_error := SQLERRM;
        SELECT JSON_OBJECT(
            'valid' VALUE 'false',
            'error' VALUE v_error
            RETURNING CLOB
        )
        INTO v_result
        FROM dual;
        RETURN v_result;
END;
/

CREATE OR REPLACE FUNCTION troubleshoot_product_issue (
    p_product_name IN VARCHAR2,
    p_issue_text   IN VARCHAR2
) RETURN CLOB IS
    v_result        CLOB := '';
    v_query_text    VARCHAR2(4000);
    v_query_vec     VECTOR(384);
    v_product_id    NUMBER;
    v_used_vector   BOOLEAN := FALSE;
    v_match_count   NUMBER := 0;
    v_step_text     VARCHAR2(1200);

    PROCEDURE append_line(p_text IN VARCHAR2) IS
    BEGIN
        v_result := v_result || p_text || CHR(10);
    END;

    FUNCTION clean_manual_step(p_chunk IN CLOB) RETURN VARCHAR2 IS
        v_text VARCHAR2(1200);
    BEGIN
        v_text := REGEXP_REPLACE(DBMS_LOB.SUBSTR(p_chunk, 1200, 1), '[[:space:]]+', ' ');
        v_text := REGEXP_REPLACE(v_text, '^.*Detailed Troubleshooting Guide[[:space:]]*', '', 1, 1, 'i');
        v_text := REGEXP_REPLACE(v_text, '^Page [0-9]+[[:space:]]*Comprehensive Product Manual[[:space:]]*', '', 1, 1, 'i');
        v_text := REGEXP_REPLACE(v_text, '^Comprehensive Product Manual.*?Troubleshooting Guide[[:space:]]*', '', 1, 1, 'i');
        RETURN SUBSTR(TRIM(v_text), 1, 360);
    END;
BEGIN
    v_query_text := SUBSTR(
        NVL(TRIM(p_product_name), '') || ' ' ||
        NVL(TRIM(p_issue_text), 'defective damaged broken packaging troubleshooting repair setup'),
        1,
        3900
    );

    BEGIN
        SELECT product_id
        INTO v_product_id
        FROM customer_order_status
        WHERE UPPER(product_name) LIKE '%' || UPPER(TRIM(p_product_name)) || '%'
           OR UPPER(TRIM(p_product_name)) LIKE '%' || UPPER(product_name) || '%'
        FETCH FIRST 1 ROW ONLY;
    EXCEPTION
        WHEN OTHERS THEN
            v_product_id := NULL;
    END;

    BEGIN
        EXECUTE IMMEDIATE
            'SELECT VECTOR_EMBEDDING(ALL_MINILM_L12_V2 USING :query_text AS DATA) FROM dual'
        INTO v_query_vec
        USING v_query_text;
        v_used_vector := TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            v_used_vector := FALSE;
    END;

    append_line('According to the product manual, try these steps for ' || NVL(TRIM(p_product_name), 'the product') || ':');

    IF v_used_vector THEN
        FOR r IN (
            SELECT doc_name,
                   chunk_text,
                   ROUND(1 - VECTOR_DISTANCE(embedding, v_query_vec, COSINE), 4) AS relevance
            FROM product_manual_embeddings
            WHERE v_product_id IS NULL OR product_id = v_product_id
            ORDER BY
              CASE
                WHEN REGEXP_LIKE(DBMS_LOB.SUBSTR(chunk_text, 4000, 1), '(unravell|tackiness|tear|broken|damage|defect|trouble|repair|packaging)', 'i') THEN 0
                ELSE 1
              END,
              VECTOR_DISTANCE(embedding, v_query_vec, COSINE)
            FETCH FIRST 2 ROWS ONLY
        ) LOOP
            v_match_count := v_match_count + 1;
            v_step_text := clean_manual_step(r.chunk_text);
            IF v_step_text IS NOT NULL THEN
                append_line('- ' || v_step_text);
            END IF;
        END LOOP;
    ELSE
        FOR r IN (
            SELECT doc_name,
                   chunk_text
            FROM product_manual_embeddings
            WHERE (v_product_id IS NULL OR product_id = v_product_id)
              AND (
                    UPPER(DBMS_LOB.SUBSTR(chunk_text, 4000, 1)) LIKE '%DEFECT%'
                 OR UPPER(DBMS_LOB.SUBSTR(chunk_text, 4000, 1)) LIKE '%DAMAGE%'
                 OR UPPER(DBMS_LOB.SUBSTR(chunk_text, 4000, 1)) LIKE '%BROKEN%'
                 OR UPPER(DBMS_LOB.SUBSTR(chunk_text, 4000, 1)) LIKE '%TROUBLE%'
                 OR UPPER(DBMS_LOB.SUBSTR(chunk_text, 4000, 1)) LIKE '%REPAIR%'
                 OR UPPER(DBMS_LOB.SUBSTR(chunk_text, 4000, 1)) LIKE '%' || UPPER(NVL(TRIM(p_issue_text), 'RETURN')) || '%'
              )
            ORDER BY chunk_offset
            FETCH FIRST 2 ROWS ONLY
        ) LOOP
            v_match_count := v_match_count + 1;
            v_step_text := clean_manual_step(r.chunk_text);
            IF v_step_text IS NOT NULL THEN
                append_line('- ' || v_step_text);
            END IF;
        END LOOP;
    END IF;

    IF v_match_count = 0 THEN
        RETURN 'I could not find specific product manual guidance for ' || NVL(TRIM(p_product_name), 'the product') || '. If the issue continues, I can help with a same-item replacement, a refund, or an alternative product.';
    END IF;

    append_line('Do these steps resolve the issue? If not, I can help with a same-item replacement, a refund, or an alternative product.');
    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Product manual troubleshooting lookup failed: ' || SQLERRM;
END;
/

PROMPT Creating notebook Select AI Agent tools...

BEGIN DBMS_CLOUD_AI_AGENT.DROP_TOOL('UPDATE_ORDER_STATUS_TOOL', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.DROP_TOOL('VERIFY_ORDER_TOOL', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.DROP_TOOL('PROPOSE_ORDER_STATUS_TOOL', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.DROP_TOOL('TROUBLESHOOT_PRODUCT_TOOL', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.DROP_TOOL('GET_RECOMMENDATIONS_TOOL', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP FUNCTION update_order_status'; EXCEPTION WHEN OTHERS THEN NULL; END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
      tool_name   => 'VERIFY_ORDER_TOOL',
      attributes  => q'~{
      "instruction": "Look up the customer's order by exact order number. Pass p_order_number. Use the returned customer, product, and status context for later return-advisor steps. If valid is true, do not ask for the order number again.",
      "function": "verify_customer_order"
    }~',
    description => 'Looks up customer order and product context from CUSTOMER_ORDER_STATUS.'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
      tool_name   => 'PROPOSE_ORDER_STATUS_TOOL',
      attributes  => q'~{
      "instruction": "Propose a final customer order status update. This tool never updates the database. Use it only after the customer explicitly chooses a final resolution and provides both exact customer name and exact order number. Valid p_status values are return_shipment_pending, refund, refund_completed, replaced, and exchanged. The application backend validates and commits the update.",
      "function": "propose_order_status_update"
    }~',
    description => 'Proposes a customer order status update for backend validation.'
  );
END;
/

BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
      tool_name   => 'TROUBLESHOOT_PRODUCT_TOOL',
      attributes  => q'~{
      "instruction": "Retrieve product manual troubleshooting guidance. Pass the customer product name as p_product_name and the defect, broken packaging, or issue description as p_issue_text. Use this once for a defective or broken-box issue, then present the returned steps and ask whether they resolved the issue.",
      "function": "troubleshoot_product_issue"
    }~',
      description => 'Retrieves product manual troubleshooting guidance using ADB vector search.'
  );
END;
/

BEGIN
    DBMS_CLOUD_AI_AGENT.CREATE_TOOL(
      tool_name   => 'GET_RECOMMENDATIONS_TOOL',
      attributes  => q'~{
      "instruction": "Fetch alternative product recommendations for an exchange path. Call this only after the customer says troubleshooting did not resolve the issue or directly asks for alternatives. Look up the product_id from the customer order or known product mapping before calling this tool and pass it as p_product_id. For Ironkinetic Grip Tape use 19679, Aerostride Performance Tee use 19678, Canyonridge Adjustable Dumbbells use 19680, Nordcrest Base Layer Top use 19681, Hydrawave Repair Kit use 19682. Present the returned products and ask which product they want, or whether they prefer refund or same-item replacement.",
      "function": "get_product_recommendations"
    }~',
      description => 'Fetches alternative product recommendations from DIM_PRODUCT.'
  );
END;
/

PROMPT Creating notebook return advisor task, agent, and team...

BEGIN DBMS_CLOUD_AI_AGENT.DROP_TASK('RETURN_ADVISOR_TASK', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.DROP_AGENT('RETURN_ADVISOR_AGENT', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.CLEAR_TEAM(); EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN DBMS_CLOUD_AI_AGENT.DROP_TEAM('RETURN_ADVISOR_TEAM', TRUE); EXCEPTION WHEN OTHERS THEN NULL; END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TASK(
    task_name => 'RETURN_ADVISOR_TASK',
    attributes => q'~{
      "instruction": "Write one concise PeakGear customer-service response using only the provided context: {query}. Do not call any tools. Ask at most one next question. Never invent order, inventory, product, recommendation, or policy facts.",
      "enable_human_tool": false
    }~'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_AGENT(
    agent_name => 'RETURN_ADVISOR_AGENT',
    attributes => q'~{
      "profile_name": "PG_RETURN_AGENT_PROFILE",
      "role": "You are a concise PeakGear Sporting Goods customer return advisor. Use only the context provided in the prompt. Keep each response short, ask for only the next missing detail, and never invent facts. Never claim that you personally updated an order; backend validation records final status changes.",
      "enable_human_tool": false
    }~'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.CREATE_TEAM(
    team_name  => 'RETURN_ADVISOR_TEAM',
    attributes => '{"agents": [{"name": "RETURN_ADVISOR_AGENT", "task": "RETURN_ADVISOR_TASK"}],
                    "process": "sequential"}'
  );
END;
/

BEGIN
  DBMS_CLOUD_AI_AGENT.SET_TEAM(team_name => 'RETURN_ADVISOR_TEAM');
END;
/

PROMPT Recompiling notebook return advisor functions...

ALTER FUNCTION verify_customer_order COMPILE;
ALTER FUNCTION get_product_recommendations COMPILE;
ALTER FUNCTION propose_order_status_update COMPILE;
ALTER FUNCTION troubleshoot_product_issue COMPILE;

PROMPT Verifying notebook return advisor setup...

SELECT 'TOOLS' AS object_type, tool_name AS object_name, status
FROM user_ai_agent_tools
WHERE tool_name IN (
    'VERIFY_ORDER_TOOL',
    'PROPOSE_ORDER_STATUS_TOOL',
    'TROUBLESHOOT_PRODUCT_TOOL',
    'GET_RECOMMENDATIONS_TOOL'
)
UNION ALL
SELECT 'AGENTS', agent_name, status
FROM user_ai_agents
WHERE agent_name = 'RETURN_ADVISOR_AGENT'
UNION ALL
SELECT 'TASKS', task_name, status
FROM user_ai_agent_tasks
WHERE task_name = 'RETURN_ADVISOR_TASK'
UNION ALL
SELECT 'TEAMS', agent_team_name, status
FROM user_ai_agent_teams
WHERE agent_team_name = 'RETURN_ADVISOR_TEAM'
ORDER BY object_type, object_name;

SELECT object_name, object_type, status
FROM user_objects
WHERE object_name IN (
    'VERIFY_CUSTOMER_ORDER',
    'PROPOSE_ORDER_STATUS_UPDATE',
    'GET_PRODUCT_RECOMMENDATIONS',
    'TROUBLESHOOT_PRODUCT_ISSUE',
    'CUSTOMER_ORDER_STATUS',
    'CUSTOMER_ORDER_STATUS_SEED',
    'PRODUCT_MANUAL_EMBEDDINGS'
)
ORDER BY object_type, object_name;

SELECT COUNT(*) AS product_manual_embedding_rows
FROM product_manual_embeddings;
