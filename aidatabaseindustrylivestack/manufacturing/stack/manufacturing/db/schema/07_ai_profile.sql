/*
 * 07_ai_profile.sql
 * OCI GenAI Credential and Select AI Profile Suite
 * Run as the schema owner — BEFORE 08_agents.sql
 *
 * Creates five profiles that can be switched as needed:
 *   MANUFACTURING_COHERE_PROFILE — Cohere Command R+ (strong SQL/structured tasks)
 *   MANUFACTURING_LLAMA_PROFILE  — LLaMA 3.3 70B (strong general reasoning)
 *   MANUFACTURING_GROK42_PROFILE — Grok 4.2 (reasoning)
 *   MANUFACTURING_VISION_PROFILE — LLaMA 3.2 90B Vision (image analysis)
 *   MANUFACTURING_EMBED_PROFILE  — Cohere Embed v3 (vector embeddings / 04_vector.sql)
 *
 * Default active profile: MANUFACTURING_COHERE_PROFILE
 * Switch profiles any time with: EXEC DBMS_CLOUD_AI.SET_PROFILE('<name>');
 *
 * ── How to run ──────────────────────────────────────────────
 *   Manual — SQLcl with values pre-defined:
 *     DEFINE OCI_COMPARTMENT_ID = ocid1.compartment.oc1..replace_with_compartment_ocid
 *     DEFINE OCI_CRED_NAME      = OCI$RESOURCE_PRINCIPAL
 *     @db/schema/07_ai_profile.sql
 *
 *   Standalone — SQLcl will prompt for each undefined variable.
 *
 * ── Admin prerequisite (one-time per Oracle AI Database 26ai instance) ─────
 *   EXEC DBMS_CLOUD_ADMIN.ENABLE_PRINCIPAL_AUTH(
 *       provider => 'OCI', feature => 'AI'
 *   );
 */

SET SERVEROUTPUT ON
SET VERIFY OFF

DEFINE OCI_COMPARTMENT_ID = ocid1.compartment.oc1..replace_with_compartment_ocid
DEFINE OCI_CRED_NAME = OCI$RESOURCE_PRINCIPAL

BEGIN
  DBMS_OUTPUT.PUT_LINE('Using credential &&OCI_CRED_NAME for OCI Generative AI profiles.');
END;
/

/*
-- Optional manual API-key credential setup.
-- Prefer OCI Resource Principal where available:
--   DEFINE OCI_CRED_NAME = OCI$RESOURCE_PRINCIPAL
--
-- If Resource Principal is not available, create a named credential manually,
-- then run this script with:
--   DEFINE OCI_CRED_NAME = OCI_CRED
--
-- Example only. Do not commit real values.

BEGIN
  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'OCI_CRED',
    user_ocid       => 'ocid1.user.oc1..replace_with_user_ocid',
    tenancy_ocid    => 'ocid1.tenancy.oc1..replace_with_tenancy_ocid',
    fingerprint     => 'replace_with_fingerprint',
    private_key     => 'paste_private_key_at_runtime_only'
  );
END;
/
*/


/*
-- Select AI profile placeholders and operator notes.
-- This script creates DBMS_CLOUD_AI profiles for SELECT AI and
-- DBMS_CLOUD_AI.GENERATE. The active placeholders are:
--   &&OCI_CRED_NAME         - DBMS_CLOUD credential name, preferably OCI$RESOURCE_PRINCIPAL
--   &&OCI_COMPARTMENT_ID   - OCI compartment OCID used by OCI Generative AI
--
-- The profile object_list controls which schema objects Select AI may use for
-- NL2SQL metadata. Keep this list intentionally narrow and domain-specific.
-- Select AI sends schema metadata, object names, column names, data types, and
-- comments when comments=true. RUNSQL/SHOWSQL/EXPLAINSQL do not send table
-- contents, while NARRATE can send result data to the model.
--
-- Smoke tests after profile creation:
--   EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_COHERE_PROFILE');
--   SELECT AI SHOWSQL how many records are available by status;
--   SELECT AI NARRATE summarize the highest priority operational risks;
--
-- Programmatic form for tools or ORDS handlers:
--   SELECT DBMS_CLOUD_AI.GENERATE(
--            prompt       => 'show the top five records by operational risk',
--            profile_name => 'MANUFACTURING_COHERE_PROFILE',
--            action       => 'showsql')
--   FROM dual;
*/

-- ============================================================
-- PROFILE 1: Cohere Command R+ — SQL & structured tasks
-- Best for: Select AI queries, agent tool calls, RAG
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('MANUFACTURING_COHERE_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'MANUFACTURING_COHERE_PROFILE',
        attributes   => '{
            "provider"        : "oci",
            "credential_name" : "&&OCI_CRED_NAME",
            "oci_compartment_id" : "&&OCI_COMPARTMENT_ID",
            "model"           : "cohere.command-r-plus-08-2024",
            "oci_apiformat"   : "COHERE",
            "max_tokens"      : 2048,
            "temperature"     : 0.2,
            "comments"        : true,
            "object_list"     : [
                {"owner": "' || USER || '", "name": "BRANDS"},
                {"owner": "' || USER || '", "name": "PRODUCTS"},
                {"owner": "' || USER || '", "name": "FULFILLMENT_CENTERS"},
                {"owner": "' || USER || '", "name": "INVENTORY"},
                {"owner": "' || USER || '", "name": "CUSTOMERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDER_LINES"},
                {"owner": "' || USER || '", "name": "INFLUENCERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_PRODUCTION_SIGNALS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_SIGNAL_PART_MENTIONS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_DEMAND_FORECASTS"},
                {"owner": "' || USER || '", "name": "SHIPMENTS"},
                {"owner": "' || USER || '", "name": "AGENT_ACTIONS"}
            ]
        }'
    );
    DBMS_OUTPUT.PUT_LINE('MANUFACTURING_COHERE_PROFILE created  (cohere.command-r-plus-08-2024)');
END;
/

-- ============================================================
-- PROFILE 2: LLaMA 3.3 70B — general reasoning & chat
-- Best for: complex reasoning, agent orchestration, explanations
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('MANUFACTURING_LLAMA_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'MANUFACTURING_LLAMA_PROFILE',
        attributes   => '{
            "provider"        : "oci",
            "credential_name" : "&&OCI_CRED_NAME",
            "oci_compartment_id" : "&&OCI_COMPARTMENT_ID",
            "model"           : "meta.llama-3.3-70b-instruct",
            "oci_apiformat"   : "GENERIC",
            "max_tokens"      : 2048,
            "temperature"     : 0.2,
            "comments"        : true,
            "object_list"     : [
                {"owner": "' || USER || '", "name": "BRANDS"},
                {"owner": "' || USER || '", "name": "PRODUCTS"},
                {"owner": "' || USER || '", "name": "FULFILLMENT_CENTERS"},
                {"owner": "' || USER || '", "name": "INVENTORY"},
                {"owner": "' || USER || '", "name": "CUSTOMERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDER_LINES"},
                {"owner": "' || USER || '", "name": "INFLUENCERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_PRODUCTION_SIGNALS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_SIGNAL_PART_MENTIONS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_DEMAND_FORECASTS"},
                {"owner": "' || USER || '", "name": "SHIPMENTS"},
                {"owner": "' || USER || '", "name": "AGENT_ACTIONS"}
            ]
        }'
    );
    DBMS_OUTPUT.PUT_LINE('MANUFACTURING_LLAMA_PROFILE created   (meta.llama-3.3-70b-instruct)');
END;
/

-- ============================================================
-- PROFILE 3: Grok 4.2 — general reasoning & chat
-- Best for: complex reasoning, agent orchestration, explanations
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('MANUFACTURING_GROK42_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'MANUFACTURING_GROK42_PROFILE',
        attributes   => '{
            "provider"        : "oci",
            "credential_name" : "&&OCI_CRED_NAME",
            "oci_compartment_id" : "&&OCI_COMPARTMENT_ID",
            "model"           : "xai.grok-4.20-0309-reasoning",
            "region"          : "us-chicago-1",
            "oci_apiformat"   : "GENERIC",
            "max_tokens"      : 2048,
            "temperature"     : 0.2,
            "comments"        : true,
            "object_list"     : [
                {"owner": "' || USER || '", "name": "BRANDS"},
                {"owner": "' || USER || '", "name": "PRODUCTS"},
                {"owner": "' || USER || '", "name": "FULFILLMENT_CENTERS"},
                {"owner": "' || USER || '", "name": "INVENTORY"},
                {"owner": "' || USER || '", "name": "CUSTOMERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_WORK_ORDER_LINES"},
                {"owner": "' || USER || '", "name": "INFLUENCERS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_PRODUCTION_SIGNALS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_SIGNAL_PART_MENTIONS"},
                {"owner": "' || USER || '", "name": "MANUFACTURING_DEMAND_FORECASTS"},
                {"owner": "' || USER || '", "name": "SHIPMENTS"},
                {"owner": "' || USER || '", "name": "AGENT_ACTIONS"}
            ]
        }'
    );
    DBMS_OUTPUT.PUT_LINE('MANUFACTURING_GROK42_PROFILE created   (xai.grok-4.20-0309-reasoning)');
END;
/

-- ============================================================
-- PROFILE 4: LLaMA 3.2 Vision — image & multimodal analysis
-- Best for: product image tagging, visual content moderation
-- No object_list — used for image analysis, not SQL generation
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('MANUFACTURING_VISION_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'MANUFACTURING_VISION_PROFILE',
        attributes   => '{
            "provider"        : "oci",
            "credential_name" : "&&OCI_CRED_NAME",
            "oci_compartment_id" : "&&OCI_COMPARTMENT_ID",
            "model"           : "meta.llama-3.2-90b-vision-instruct",
            "oci_apiformat"   : "GENERIC",
            "max_tokens"      : 1024,
            "temperature"     : 0.1
        }'
    );
    DBMS_OUTPUT.PUT_LINE('MANUFACTURING_VISION_PROFILE created  (meta.llama-3.2-90b-vision-instruct)');
END;
/

-- ============================================================
-- PROFILE 5: Cohere Embed v3 — vector embeddings
-- Best for: DBMS_VECTOR.UTL_TO_EMBEDDINGS, semantic search (04_vector.sql)
-- No object_list or chat params — embedding only
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('MANUFACTURING_EMBED_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'MANUFACTURING_EMBED_PROFILE',
        attributes   => '{
            "provider"        : "oci",
            "credential_name" : "&&OCI_CRED_NAME",
            "oci_compartment_id" : "&&OCI_COMPARTMENT_ID",
            "embedding_model" : "cohere.embed-multilingual-v3.0"
        }'
    );
    DBMS_OUTPUT.PUT_LINE('MANUFACTURING_EMBED_PROFILE created   (cohere.embed-multilingual-v3.0)');
END;
/

-- ============================================================
-- SET DEFAULT PROFILE FOR THIS SESSION
-- Cohere is the default — best for Select AI SQL generation
-- and agent tool calls in 08_agents.sql.
-- Switch anytime: EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_LLAMA_PROFILE');
-- ============================================================
BEGIN
    DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_COHERE_PROFILE');
    DBMS_OUTPUT.PUT_LINE('Default profile set: MANUFACTURING_COHERE_PROFILE');
END;
/

-- ============================================================
-- VERIFY ALL PROFILES
-- ============================================================
SELECT profile_name,
       status,
       TO_CHAR(created, 'YYYY-MM-DD HH24:MI') AS created
FROM   user_cloud_ai_profiles
ORDER  BY profile_name;

-- ============================================================
-- PROFILE REFERENCE
-- ============================================================
/*
-- Switch profiles mid-session:
EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_COHERE_PROFILE'); -- SQL + agents (default)
EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_LLAMA_PROFILE');  -- general reasoning
EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_VISION_PROFILE'); -- image analysis
EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_EMBED_PROFILE');  -- embeddings

-- Smoke tests (uncomment to verify end-to-end connectivity):
EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_COHERE_PROFILE');
SELECT AI Which manufactured parts have the highest demand surge risk;
SELECT AI Show plant sites with the highest current load;

EXEC DBMS_CLOUD_AI.SET_PROFILE('MANUFACTURING_LLAMA_PROFILE');
SELECT AI Summarize the manufacturing operations platform in one paragraph;
*/

-- ============================================================
-- UPDATE 08_agents.sql PROFILE REFERENCES (reminder)
-- 08_agents.sql references "genai" in agent/task attributes.
-- Update those to "MANUFACTURING_COHERE_PROFILE" or "MANUFACTURING_LLAMA_PROFILE"
-- as appropriate for each agent's role.
-- ============================================================

SELECT '07_ai_profile.sql complete - 5 profiles created. Ready for 08_agents.sql.' AS status
FROM dual;
