/*
 * 07_ai_profile.sql
 * OCI GenAI Credential and Select AI Profile Suite
 * Run as SOCIALCOMMERCE — BEFORE 08_agents.sql
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
 *
 *   Recommended — via shell script (reads .env automatically):
 *     scripts/setup_ai_profile.sh
 *
 *   Manual — SQLcl with values pre-defined:
 *     DEFINE OCI_COMPARTMENT_ID = ocid1.compartment.oc1..xxx
 *     DEFINE OCI_CRED_NAME      = OCI$RESOURCE_PRINCIPAL
 *     @db/schema/07_ai_profile.sql
 *
 *   Standalone — SQLcl will prompt for each undefined variable.
 *
 * ── Admin prerequisite (one-time per ADB instance) ──────────
 *   EXEC DBMS_CLOUD_ADMIN.ENABLE_PRINCIPAL_AUTH(
 *       provider => 'OCI', feature => 'AI'
 *   );
 */

SET SERVEROUTPUT ON
SET VERIFY OFF


BEGIN
  BEGIN DBMS_CLOUD.DROP_CREDENTIAL('OCI_CRED'); EXCEPTION WHEN OTHERS THEN NULL; END;

  DBMS_CLOUD.CREATE_CREDENTIAL(
    credential_name => 'OCI_CRED',
    user_ocid       => 'ocid1.user.oc1..aaaaaaaaoyjkqdm4hpn23uddvl67uhk7hoz3i5biwapxxsxbsjpkx6aaacfa',
    tenancy_ocid    => 'ocid1.tenancy.oc1..aaaaaaaaj4ccqe763dizkrcdbs5x7ufvmmojd24mb6utvkymyo4xwxyv3gfa',
    fingerprint     => '1a:8f:9a:60:22:bb:45:60:6a:64:95:4a:1a:23:f9:72',
    private_key     =>
'-----BEGIN RSA PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDbH5bRsvdlywFw
4f84HBwmm3WBBQ8UbgmbucwhmAmdHdlgrRglVy7KgfE3ee6T4VBxwknY6lHnWFBT
DUy94aG+s+8f2J0PqDSPLAN0875mkQkHfk3WBXS1TcfBeLsE/F1k8jKvjITFA3Cx
Cysus4VD+R8lF+6hB4FoxaLNcnK5fYRA3nzbeC6Aa9ym639PLcQAb8CbigVR7TuB
a1qSQdbpuLRCqxouxSwxDxyzbz27P0dYfj5xZ2RJPy8dXMhnvICg1UhHDeDYAPzK
mnaElPP+fbSPVyfMoeEvOw4/6Dps6A0LRDvSvfd1dPFeEcwnxQqK4PF3VrlTHQJ7
iNzWObCFAgMBAAECggEAK/TMibDzyYb9eUJQsxYKfKErY3AbHA9N3KAbJ7MK3KqH
+ImIojb4wzVpaOZMGny0qTlfHIU23Gh+JobwudeJHYsVYUdQDHvC3WSoJd4eeA9I
pyjqXtBV3uflNjWsmJ2yc4VVbxtKaAYeZVmW9kWbam0PVx7TpxhtGJIq7Dk08+nv
eF0PnKC8+rTeKQ3KRJ+GvU4ZHXUxk0flF8/S4uH+s2s7Y5NH6zkibHqsbKc7Aw8g
3/wuocI+51tPF56iaMgzihb92DDWoEG04XTgLF3YupAzji+TNWxQA1cFAcY9m+Xz
/7v6Mc2TEho1Ap+Toyw0WtrIM9JslCrvH1USVhWqQQKBgQD8DlH3pQceL2r9lc59
2NEImFC3Vj1ygC4JL8JowlFBfkg/JOxrv+SaiPF9Fr1fAiKku3fOH8DoPvkemi7z
YHWmqAb0gqwADMFdufAFJdJRnVCna3Cd+lWp8lRO9LDiBJZH3ASrRZgOOhDVUXvt
dYFsLdWjpDljcA2Bc2+BsNNqwQKBgQDejVk5tZIcgJ3bN7pswKscjG0N53DILybx
jyacf87Tk9sSuHcRCDFfQTsckMoKuax/0FbD71sGhEs+xA6VRbGVaw4rR769uhxy
TK4Nbr8vkRCoeriSG2givXkEkjuACARZgL27smsGuXmTZ3x3w8chY0mL9ZkQznaZ
sXeOSZ0KxQKBgQC7gCuZfTn+SmfcnEQvecqGCkiBGbY8Jv4X9183btXjUn2L+3uj
6+uyyYxa8T+OHZiH0q0cuKJYIgBPs4KZqXfbscL6wPoST2rIvji+m5QJAm2tHU95
NW/kLFBrK7spZyAj9JfEkNC8RJWhGiyGSJMuVipGwTOvtPtXAPhCEbg0AQKBgDlP
szOOU6MtZ/llH4gUEbyXWRokiMG0itXYJHxW2X9Y6yimAluLfZNnK/7ONomOiSKd
F0r737gM54exW4QLX5D38b0pi7A2Nk8k+gmRhICOXfjVKaTOlAGmQ3zu3424As69
vZ6RcshXiTxxgPcinqw1cmItjA5s7NPlhMFKqbt1AoGAJyimNyqjuQvKz7LJKNS6
TNt3H2jY9Q0IS/i4v5nHuPs/NZDRx/GCs2Vzr7r4p3cPPv97OHCaizS+yuqllKzS
APBG4NYR4IR3EDrX+b+yQ0TwsLABvO76+4JjYq5yhBZe0lkRXIAWl/pWXIPe7dRU
16TMZqMDEAXNxImGn1ZQ8dk=
-----END RSA PRIVATE KEY-----'
  );
END;
/



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
            "credential_name" : "OCI_CRED",
            "oci_compartment_id" : "ocid1.compartment.oc1..aaaaaaaatrquizuaoob2ey6czxmuikndr3carpnop4tg4rauc5cqg764ucja",
            "model"           : "cohere.command-r-plus-08-2024",
            "oci_apiformat"   : "COHERE",
            "max_tokens"      : 2048,
            "temperature"     : 0.2,
            "comments"        : true,
            "object_list"     : [
                {"owner": "SOCIALCOMMERCE", "name": "BRANDS"},
                {"owner": "SOCIALCOMMERCE", "name": "PRODUCTS"},
                {"owner": "SOCIALCOMMERCE", "name": "FULFILLMENT_CENTERS"},
                {"owner": "SOCIALCOMMERCE", "name": "INVENTORY"},
                {"owner": "SOCIALCOMMERCE", "name": "CUSTOMERS"},
                {"owner": "SOCIALCOMMERCE", "name": "ORDERS"},
                {"owner": "SOCIALCOMMERCE", "name": "ORDER_ITEMS"},
                {"owner": "SOCIALCOMMERCE", "name": "INFLUENCERS"},
                {"owner": "SOCIALCOMMERCE", "name": "SOCIAL_POSTS"},
                {"owner": "SOCIALCOMMERCE", "name": "POST_PRODUCT_MENTIONS"},
                {"owner": "SOCIALCOMMERCE", "name": "DEMAND_FORECASTS"},
                {"owner": "SOCIALCOMMERCE", "name": "SHIPMENTS"},
                {"owner": "SOCIALCOMMERCE", "name": "AGENT_ACTIONS"}
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
            "credential_name" : "OCI_CRED",
            "oci_compartment_id" : "ocid1.compartment.oc1..aaaaaaaatrquizuaoob2ey6czxmuikndr3carpnop4tg4rauc5cqg764ucja",
            "model"           : "meta.llama-3.3-70b-instruct",
            "oci_apiformat"   : "GENERIC",
            "max_tokens"      : 2048,
            "temperature"     : 0.2,
            "comments"        : true,
            "object_list"     : [
                {"owner": "SOCIALCOMMERCE", "name": "BRANDS"},
                {"owner": "SOCIALCOMMERCE", "name": "PRODUCTS"},
                {"owner": "SOCIALCOMMERCE", "name": "FULFILLMENT_CENTERS"},
                {"owner": "SOCIALCOMMERCE", "name": "INVENTORY"},
                {"owner": "SOCIALCOMMERCE", "name": "CUSTOMERS"},
                {"owner": "SOCIALCOMMERCE", "name": "ORDERS"},
                {"owner": "SOCIALCOMMERCE", "name": "ORDER_ITEMS"},
                {"owner": "SOCIALCOMMERCE", "name": "INFLUENCERS"},
                {"owner": "SOCIALCOMMERCE", "name": "SOCIAL_POSTS"},
                {"owner": "SOCIALCOMMERCE", "name": "POST_PRODUCT_MENTIONS"},
                {"owner": "SOCIALCOMMERCE", "name": "DEMAND_FORECASTS"},
                {"owner": "SOCIALCOMMERCE", "name": "SHIPMENTS"},
                {"owner": "SOCIALCOMMERCE", "name": "AGENT_ACTIONS"}
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
            "credential_name" : "OCI_CRED",
            "oci_compartment_id" : "ocid1.compartment.oc1..aaaaaaaatrquizuaoob2ey6czxmuikndr3carpnop4tg4rauc5cqg764ucja",
            "model"           : "xai.grok-4.20-0309-reasoning",
            "region"          : "us-chicago-1",
            "oci_apiformat"   : "GENERIC",
            "max_tokens"      : 2048,
            "temperature"     : 0.2,
            "comments"        : true,
            "object_list"     : [
                {"owner": "SOCIALCOMMERCE", "name": "BRANDS"},
                {"owner": "SOCIALCOMMERCE", "name": "PRODUCTS"},
                {"owner": "SOCIALCOMMERCE", "name": "FULFILLMENT_CENTERS"},
                {"owner": "SOCIALCOMMERCE", "name": "INVENTORY"},
                {"owner": "SOCIALCOMMERCE", "name": "CUSTOMERS"},
                {"owner": "SOCIALCOMMERCE", "name": "ORDERS"},
                {"owner": "SOCIALCOMMERCE", "name": "ORDER_ITEMS"},
                {"owner": "SOCIALCOMMERCE", "name": "INFLUENCERS"},
                {"owner": "SOCIALCOMMERCE", "name": "SOCIAL_POSTS"},
                {"owner": "SOCIALCOMMERCE", "name": "POST_PRODUCT_MENTIONS"},
                {"owner": "SOCIALCOMMERCE", "name": "DEMAND_FORECASTS"},
                {"owner": "SOCIALCOMMERCE", "name": "SHIPMENTS"},
                {"owner": "SOCIALCOMMERCE", "name": "AGENT_ACTIONS"}
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
            "credential_name" : "OCI_CRED",
            "oci_compartment_id" : "ocid1.compartment.oc1..aaaaaaaatrquizuaoob2ey6czxmuikndr3carpnop4tg4rauc5cqg764ucja",
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
            "credential_name" : "OCI_CRED",
            "oci_compartment_id" : "ocid1.compartment.oc1..aaaaaaaatrquizuaoob2ey6czxmuikndr3carpnop4tg4rauc5cqg764ucja",   
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
SELECT AI Summarize the social commerce platform in one paragraph;
*/

-- ============================================================
-- UPDATE 08_agents.sql PROFILE REFERENCES (reminder)
-- 08_agents.sql references "genai" in agent/task attributes.
-- Update those to "SC_COHERE_PROFILE" or "SC_LLAMA_PROFILE"
-- as appropriate for each agent's role.
-- ============================================================

SELECT '07_ai_profile.sql complete — 4 profiles created. Ready for 08_agents.sql.' AS status
FROM dual;
