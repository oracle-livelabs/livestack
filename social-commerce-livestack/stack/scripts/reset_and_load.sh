#!/bin/bash
# ============================================================
# reset_and_load.sh
# Resets and reloads all Social Commerce demo data.
# Reads DB connection from .env — safe to run repeatedly.
#
# Usage:
#   scripts/reset_and_load.sh              # reset + full load
#   scripts/reset_and_load.sh --reset-only # truncate only
#   scripts/reset_and_load.sh --dry-run    # print config, skip SQL
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/db/data"
WALLET_PATH=""
RESET_ONLY=false
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --reset-only) RESET_ONLY=true ;;
        --dry-run)    DRY_RUN=true ;;
    esac
done

# ── Load .env ─────────────────────────────────────────────────
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env not found at $ENV_FILE"
    exit 1
fi
set -a
# shellcheck disable=SC2046
eval $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | sed 's/[[:space:]]*$//')
set +a

# ── Resolve wallet ─────────────────────────────────────────────
WALLET_PATH="${ORACLE_WALLET_LOCATION:-}"

# ── Validate required vars ─────────────────────────────────────
for VAR in ORACLE_USER ORACLE_PASSWORD ORACLE_CONNECTION_STRING; do
    if [ -z "${!VAR:-}" ]; then
        echo "ERROR: $VAR is not set in .env"
        exit 1
    fi
done

# ── Print summary ──────────────────────────────────────────────
echo "=============================================="
echo " Social Commerce — Data Reset & Load"
echo "=============================================="
echo "  DB user    : $ORACLE_USER"
echo "  Connection : $ORACLE_CONNECTION_STRING"
echo "  Wallet     : ${WALLET_PATH:-none}"
if $RESET_ONLY; then
    echo "  Mode       : RESET ONLY (no data load)"
else
    echo "  Mode       : RESET + FULL LOAD"
fi
echo "=============================================="
echo ""

if $DRY_RUN; then
    echo "[dry-run] Config validated. No SQL executed."
    exit 0
fi

# ── Build sqlcl session ────────────────────────────────────────
echo "Connecting and running reset..."
echo ""

sql /nolog <<SQLEOF
$([ -n "$WALLET_PATH" ] && echo "set cloudconfig ${WALLET_PATH}")
connect ${ORACLE_USER}/${ORACLE_PASSWORD}@${ORACLE_CONNECTION_STRING}
SET SERVEROUTPUT ON
SET VERIFY OFF

@${DATA_DIR}/reset_data.sql

$(if ! $RESET_ONLY; then
    echo "@${DATA_DIR}/load_all_data.sql"
fi)

EXIT
SQLEOF

echo ""
echo "=============================================="
if $RESET_ONLY; then
    echo " Reset complete!"
else
    echo " Data load complete!"
fi
echo "=============================================="
echo ""
echo "  App:    http://$(hostname -I | awk '{print $1}'):3001"
echo "  Health: http://$(hostname -I | awk '{print $1}'):3001/api/health"
echo ""
