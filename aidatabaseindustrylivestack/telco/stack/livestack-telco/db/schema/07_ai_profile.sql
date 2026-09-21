/*
 * 07_ai_profile.sql
 * OCI GenAI Credential and Select AI Profile Suite
 * Run as LIVESTACK — BEFORE 08_agents.sql
 *
 * Creates four profiles that can be switched as needed:
 *   SC_COHERE_PROFILE   — Cohere Command R+ (strong SQL/structured tasks)
 *   SC_LLAMA_PROFILE    — LLaMA 3.3 70B (strong general reasoning)
 *   SC_VISION_PROFILE   — LLaMA 3.2 90B Vision (image analysis)
 *   SC_EMBED_PROFILE    — Cohere Embed v3 (vector embeddings / 04_vector.sql)
 *
 * Default active profile: SC_COHERE_PROFILE
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
--   EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_COHERE_PROFILE');
--   SELECT AI SHOWSQL how many records are available by status;
--   SELECT AI NARRATE summarize the highest priority operational risks;
--
-- Programmatic form for tools or ORDS handlers:
--   SELECT DBMS_CLOUD_AI.GENERATE(
--            prompt       => 'show the top five records by operational risk',
--            profile_name => 'SC_COHERE_PROFILE',
--            action       => 'showsql')
--   FROM dual;
*/

-- ============================================================
-- PROFILE 1: Cohere Command R+ — SQL & structured tasks
-- Best for: Select AI queries, agent tool calls, RAG
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('SC_COHERE_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'SC_COHERE_PROFILE',
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
                {"owner": "LIVESTACK", "name": "BRANDS"},
                {"owner": "LIVESTACK", "name": "PRODUCTS"},
                {"owner": "LIVESTACK", "name": "FULFILLMENT_CENTERS"},
                {"owner": "LIVESTACK", "name": "INVENTORY"},
                {"owner": "LIVESTACK", "name": "CUSTOMERS"},
                {"owner": "LIVESTACK", "name": "ORDERS"},
                {"owner": "LIVESTACK", "name": "ORDER_ITEMS"},
                {"owner": "LIVESTACK", "name": "INFLUENCERS"},
                {"owner": "LIVESTACK", "name": "SOCIAL_POSTS"},
                {"owner": "LIVESTACK", "name": "POST_PRODUCT_MENTIONS"},
                {"owner": "LIVESTACK", "name": "DEMAND_FORECASTS"},
                {"owner": "LIVESTACK", "name": "SHIPMENTS"},
                {"owner": "LIVESTACK", "name": "AGENT_ACTIONS"}
            ]
        }'
    );
    DBMS_OUTPUT.PUT_LINE('SC_COHERE_PROFILE created  (cohere.command-r-plus-08-2024)');
END;
/

-- ============================================================
-- PROFILE 2: LLaMA 3.3 70B — general reasoning & chat
-- Best for: complex reasoning, agent orchestration, explanations
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('SC_LLAMA_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'SC_LLAMA_PROFILE',
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
                {"owner": "LIVESTACK", "name": "BRANDS"},
                {"owner": "LIVESTACK", "name": "PRODUCTS"},
                {"owner": "LIVESTACK", "name": "FULFILLMENT_CENTERS"},
                {"owner": "LIVESTACK", "name": "INVENTORY"},
                {"owner": "LIVESTACK", "name": "CUSTOMERS"},
                {"owner": "LIVESTACK", "name": "ORDERS"},
                {"owner": "LIVESTACK", "name": "ORDER_ITEMS"},
                {"owner": "LIVESTACK", "name": "INFLUENCERS"},
                {"owner": "LIVESTACK", "name": "SOCIAL_POSTS"},
                {"owner": "LIVESTACK", "name": "POST_PRODUCT_MENTIONS"},
                {"owner": "LIVESTACK", "name": "DEMAND_FORECASTS"},
                {"owner": "LIVESTACK", "name": "SHIPMENTS"},
                {"owner": "LIVESTACK", "name": "AGENT_ACTIONS"}
            ]
        }'
    );
    DBMS_OUTPUT.PUT_LINE('SC_LLAMA_PROFILE created   (meta.llama-3.3-70b-instruct)');
END;
/

-- ============================================================
-- PROFILE 2: LLaMA 3.3 70B — general reasoning & chat
-- Best for: complex reasoning, agent orchestration, explanations
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('SC_GROK42_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'SC_GROK42_PROFILE',
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
                {"owner": "LIVESTACK", "name": "BRANDS"},
                {"owner": "LIVESTACK", "name": "PRODUCTS"},
                {"owner": "LIVESTACK", "name": "FULFILLMENT_CENTERS"},
                {"owner": "LIVESTACK", "name": "INVENTORY"},
                {"owner": "LIVESTACK", "name": "CUSTOMERS"},
                {"owner": "LIVESTACK", "name": "ORDERS"},
                {"owner": "LIVESTACK", "name": "ORDER_ITEMS"},
                {"owner": "LIVESTACK", "name": "INFLUENCERS"},
                {"owner": "LIVESTACK", "name": "SOCIAL_POSTS"},
                {"owner": "LIVESTACK", "name": "POST_PRODUCT_MENTIONS"},
                {"owner": "LIVESTACK", "name": "DEMAND_FORECASTS"},
                {"owner": "LIVESTACK", "name": "SHIPMENTS"},
                {"owner": "LIVESTACK", "name": "AGENT_ACTIONS"}
            ]
        }'
    );
    DBMS_OUTPUT.PUT_LINE('SC_GROK42_PROFILE created   (xai.grok-4.20-0309-reasoning)');
END;
/

-- ============================================================
-- PROFILE 3: LLaMA 3.2 Vision — image & multimodal analysis
-- Best for: product image tagging, visual content moderation
-- No object_list — used for image analysis, not SQL generation
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('SC_VISION_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'SC_VISION_PROFILE',
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
    DBMS_OUTPUT.PUT_LINE('SC_VISION_PROFILE created  (meta.llama-3.2-90b-vision-instruct)');
END;
/

-- ============================================================
-- PROFILE 4: Cohere Embed v3 — vector embeddings
-- Best for: DBMS_VECTOR.UTL_TO_EMBEDDINGS, semantic search (04_vector.sql)
-- No object_list or chat params — embedding only
-- ============================================================
BEGIN
    BEGIN
        DBMS_CLOUD_AI.DROP_PROFILE('SC_EMBED_PROFILE');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DBMS_CLOUD_AI.CREATE_PROFILE(
        profile_name => 'SC_EMBED_PROFILE',
        attributes   => '{
            "provider"        : "oci",
            "credential_name" : "&&OCI_CRED_NAME",
            "oci_compartment_id" : "&&OCI_COMPARTMENT_ID",
            "embedding_model" : "cohere.embed-multilingual-v3.0"
        }'
    );
    DBMS_OUTPUT.PUT_LINE('SC_EMBED_PROFILE created   (cohere.embed-multilingual-v3.0)');
END;
/

-- ============================================================
-- SET DEFAULT PROFILE FOR THIS SESSION
-- Cohere is the default — best for Select AI SQL generation
-- and agent tool calls in 08_agents.sql.
-- Switch anytime: EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_LLAMA_PROFILE');
-- ============================================================
BEGIN
    DBMS_CLOUD_AI.SET_PROFILE('SC_COHERE_PROFILE');
    DBMS_OUTPUT.PUT_LINE('Default profile set: SC_COHERE_PROFILE');
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
EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_COHERE_PROFILE');   -- SQL + agents (default)
EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_LLAMA_PROFILE');    -- general reasoning
EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_VISION_PROFILE');   -- image analysis
EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_EMBED_PROFILE');    -- embeddings

-- Smoke tests (uncomment to verify end-to-end connectivity):
EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_COHERE_PROFILE');
SELECT AI How many brands are in the database;
SELECT AI What are the top 5 products by unit price;

EXEC DBMS_CLOUD_AI.SET_PROFILE('SC_LLAMA_PROFILE');
SELECT AI Summarize the telecommunications network experience platform in one paragraph;
*/

-- ============================================================
-- UPDATE 08_agents.sql PROFILE REFERENCES (reminder)
-- 08_agents.sql references "genai" in agent/task attributes.
-- Update those to "SC_COHERE_PROFILE" or "SC_LLAMA_PROFILE"
-- as appropriate for each agent's role.
-- ============================================================

SELECT '07_ai_profile.sql complete — 4 profiles created. Ready for 08_agents.sql.' AS status
FROM dual;
