#!/bin/bash
# ============================================================
# setup_ai_profile.sh
# Loads OCI config from .env, validates it, creates the
# OCI_GENAI_CRED credential if needed (api_key auth), and
# runs 07_ai_profile.sql to create all Select AI profiles.
#
# Reads all config from .env in the project root.
# Run from any directory — the script resolves paths itself.
#
# Usage:
#   scripts/setup_ai_profile.sh
#   scripts/setup_ai_profile.sh --dry-run   (print config, skip SQL)
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_DIR="$PROJECT_ROOT/db/schema"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Load .env ─────────────────────────────────────────────────
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env not found at $ENV_FILE"
    echo "  cp .env.example .env  and fill in your values."
    exit 1
fi

set -a
# shellcheck disable=SC2046
eval $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | sed 's/[[:space:]]*$//')
set +a

# ── Resolve wallet path ────────────────────────────────────────
# ORACLE_WALLET_LOCATION can be a .zip file or a directory.
# SQLcl uses 'set cloudconfig <zip>' so we keep the zip path as-is.
# For the manual SQLcl next-steps we emit the correct cloudconfig command.
WALLET_PATH="${ORACLE_WALLET_LOCATION:-}"
if [ -n "$WALLET_PATH" ] && [ ! -e "$WALLET_PATH" ]; then
    echo "WARNING: ORACLE_WALLET_LOCATION not found: $WALLET_PATH"
    echo "  SQLcl connections will fail until the wallet is in place."
    echo ""
fi

# ── Validate core OCI vars are present and not placeholders ───
MISSING=()
for VAR in OCI_TENANCY_OCID OCI_USER_OCID OCI_COMPARTMENT_ID OCI_REGION \
           OCI_AUTH_TYPE OCI_GENAI_MODEL \
           ORACLE_USER ORACLE_PASSWORD ORACLE_CONNECTION_STRING; do
    if [ -z "${!VAR:-}" ]; then
        MISSING+=("$VAR")
    fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
    echo "ERROR: The following variables are not set in .env:"
    for v in "${MISSING[@]}"; do echo "  $v"; done
    exit 1
fi

for VAR in OCI_TENANCY_OCID OCI_USER_OCID OCI_COMPARTMENT_ID; do
    VAL="${!VAR}"
    if [[ "$VAL" == "<"* ]]; then
        echo "ERROR: $VAR still has a placeholder value: $VAL"
        echo "  Update it in .env with your actual OCID."
        exit 1
    fi
done

# ── Resolve credential name and validate auth-specific fields ──
OCI_AUTH_TYPE="${OCI_AUTH_TYPE:-resource_principal}"

if [ "$OCI_AUTH_TYPE" = "resource_principal" ]; then
    OCI_CRED_NAME='OCI$RESOURCE_PRINCIPAL'

elif [ "$OCI_AUTH_TYPE" = "api_key" ]; then
    OCI_CRED_NAME='OCI_GENAI_CRED'

    API_KEY_MISSING=()
    for VAR in OCI_FINGERPRINT OCI_PRIVATE_KEY_PATH; do
        if [ -z "${!VAR:-}" ] || [[ "${!VAR}" == "<"* ]]; then
            API_KEY_MISSING+=("$VAR")
        fi
    done
    if [ ${#API_KEY_MISSING[@]} -gt 0 ]; then
        echo "ERROR: OCI_AUTH_TYPE=api_key but these .env vars are missing or unset:"
        for v in "${API_KEY_MISSING[@]}"; do echo "  $v"; done
        exit 1
    fi
    if [ ! -f "$OCI_PRIVATE_KEY_PATH" ]; then
        echo "ERROR: OCI_PRIVATE_KEY_PATH file not found: $OCI_PRIVATE_KEY_PATH"
        exit 1
    fi
else
    echo "ERROR: OCI_AUTH_TYPE must be 'resource_principal' or 'api_key' (got: $OCI_AUTH_TYPE)"
    exit 1
fi

# ── Print config summary ───────────────────────────────────────
echo "=============================================="
echo " OCI GenAI — Config Validation"
echo "=============================================="
echo "  DB user      : $ORACLE_USER"
echo "  Connection   : $ORACLE_CONNECTION_STRING"
echo "  Tenancy      : $OCI_TENANCY_OCID"
echo "  User         : $OCI_USER_OCID"
echo "  Compartment  : $OCI_COMPARTMENT_ID"
echo "  Region       : $OCI_REGION"
echo "  Fingerprint  : ${OCI_FINGERPRINT:-n/a (resource principal)}"
echo "  Private key  : ${OCI_PRIVATE_KEY_PATH:-n/a (resource principal)}"
echo "  Auth type    : $OCI_AUTH_TYPE"
echo "  Credential   : $OCI_CRED_NAME"
echo "  Model        : $OCI_GENAI_MODEL"
echo "=============================================="
echo ""

if $DRY_RUN; then
    echo "[dry-run] Config validated. No SQL executed."
    echo ""
    echo "Would run:"
    echo "  sql /nolog"
    [ -n "$WALLET_PATH" ] && echo "  set cloudconfig ${WALLET_PATH}"
    echo "  connect ${ORACLE_USER}/${ORACLE_PASSWORD}@${ORACLE_CONNECTION_STRING}"
    [ "$OCI_AUTH_TYPE" = "api_key" ] && echo "  -- create OCI_GENAI_CRED credential"
    echo "  -- DEFINE OCI_COMPARTMENT_ID + OCI_CRED_NAME"
    echo "  @${SCHEMA_DIR}/07_ai_profile.sql"
    exit 0
fi

CLOUDCONFIG_CMD=""
if [ -n "$WALLET_PATH" ]; then
    CLOUDCONFIG_CMD="set cloudconfig ${WALLET_PATH}"
fi

echo "Checking Oracle AI package availability..."
PACKAGE_CHECK="$(
sql /nolog <<SQLEOF
${CLOUDCONFIG_CMD}
connect ${ORACLE_USER}/${ORACLE_PASSWORD}@${ORACLE_CONNECTION_STRING}
SET HEADING OFF FEEDBACK OFF VERIFY OFF PAGES 0 ECHO OFF
SELECT CASE
         WHEN EXISTS (
                SELECT 1
                FROM   all_objects
                WHERE  owner = 'SYS'
                  AND  object_name = 'DBMS_CLOUD'
                  AND  object_type = 'PACKAGE'
              )
          AND EXISTS (
                SELECT 1
                FROM   all_objects
                WHERE  owner = 'SYS'
                  AND  object_name = 'DBMS_CLOUD_AI'
                  AND  object_type = 'PACKAGE'
              )
          AND EXISTS (
                SELECT 1
                FROM   all_objects
                WHERE  owner = 'SYS'
                  AND  object_name = 'DBMS_CLOUD_AI_AGENT'
                  AND  object_type = 'PACKAGE'
              )
         THEN 'READY'
         ELSE 'MISSING'
       END
FROM dual;
EXIT
SQLEOF
)"
PACKAGE_CHECK="$(printf '%s' "$PACKAGE_CHECK" | tr -d '\r' | sed '/^[[:space:]]*$/d' | tail -n 1)"

if [ "$PACKAGE_CHECK" != "READY" ]; then
    echo "Skipping OCI Select AI profile setup."
    echo "This LiveStack uses Ollama llama3.2 for AI features, and the required"
    echo "DBMS_CLOUD / DBMS_CLOUD_AI / DBMS_CLOUD_AI_AGENT packages are not"
    echo "available in the target database."
    exit 0
fi

# ── Build credential SQL block (api_key only) ──────────────────
if [ "$OCI_AUTH_TYPE" = "api_key" ]; then
    PRIVATE_KEY_CONTENT=$(grep -v '\-\-\-' "$OCI_PRIVATE_KEY_PATH" | tr -d '\n')
    CRED_SQL="
PROMPT Creating OCI_GENAI_CRED credential...
BEGIN
    BEGIN
        DBMS_CLOUD.DROP_CREDENTIAL(credential_name => 'OCI_GENAI_CRED');
        DBMS_OUTPUT.PUT_LINE('Existing OCI_GENAI_CRED dropped.');
    EXCEPTION WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('No existing OCI_GENAI_CRED found.');
    END;
END;
/
BEGIN
    DBMS_CLOUD.CREATE_CREDENTIAL(
        credential_name => 'OCI_GENAI_CRED',
        user_ocid       => '${OCI_USER_OCID}',
        tenancy_ocid    => '${OCI_TENANCY_OCID}',
        private_key     => '${PRIVATE_KEY_CONTENT}',
        fingerprint     => '${OCI_FINGERPRINT}'
    );
    DBMS_OUTPUT.PUT_LINE('OCI_GENAI_CRED created successfully.');
END;
/
SELECT credential_name, username, enabled
FROM   user_credentials
WHERE  credential_name = 'OCI_GENAI_CRED';"
else
    CRED_SQL="PROMPT Auth type is resource_principal — no credential creation needed."
fi

# ── Run credential setup + 07_ai_profile.sql in one session ───
echo "Running 07_ai_profile.sql..."
echo ""

sql /nolog <<SQLEOF
${CLOUDCONFIG_CMD}
connect ${ORACLE_USER}/${ORACLE_PASSWORD}@${ORACLE_CONNECTION_STRING}
SET SERVEROUTPUT ON
SET VERIFY OFF

${CRED_SQL}

DEFINE OCI_COMPARTMENT_ID = ${OCI_COMPARTMENT_ID}
DEFINE OCI_CRED_NAME      = ${OCI_CRED_NAME}

@${SCHEMA_DIR}/07_ai_profile.sql

EXIT
SQLEOF

echo ""
echo "=============================================="
echo " Done!"
echo "=============================================="
echo ""
echo "  Next: run 08_agents.sql to register tools, agents, tasks, and teams:"
echo ""
echo "       sql /nolog"
[ -n "$WALLET_PATH" ] && echo "       set cloudconfig ${WALLET_PATH}"
echo "       connect ${ORACLE_USER}/${ORACLE_PASSWORD}@${ORACLE_CONNECTION_STRING}"
echo "       @${SCHEMA_DIR}/08_agents.sql"
echo ""
echo "=============================================="
