#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENTRYPOINT="${PROJECT_ROOT}/ingestion/ggsa/container/entrypoint.sh"
PIPELINE_SETUP="${PROJECT_ROOT}/ingestion/backend/lib/osaStreamingSetup.js"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/ll-lakehouse-osa-restart-test.XXXXXX")"

test_cleanup() {
  rm -rf "${TEST_ROOT}"
}
trap test_cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

source "${ENTRYPOINT}"
trap test_cleanup EXIT

cat > "${TEST_ROOT}/tnsnames.ora" <<'EOF'
atp229242_high = (DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=example.invalid)(PORT=1522)))
atp229242_medium = (DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=example.invalid)(PORT=1522)))
EOF

resolved_service="$(resolve_adb_service_name "${TEST_ROOT}/tnsnames.ora" "ATP229242_HIGH")"
[[ "${resolved_service}" == "atp229242_high" ]] \
  || fail "The metadata service name must resolve to the wallet's canonical alias."

package_line="$(rg -n 'package_osa_wallet' "${ENTRYPOINT}" | tail -n 1 | cut -d: -f1)"
reuse_line="$(rg -n 'Reusing existing OSA ADB connection' "${ENTRYPOINT}" | cut -d: -f1)"
[[ "${reuse_line}" -lt "${package_line}" ]] \
  || fail "An existing OSA connection must be reused before creating or uploading a wallet."

if rg -q -- '-X PUT "\$\{api_base\}/connections/' "${ENTRYPOINT}"; then
  fail "GGSA startup must not overwrite an existing OSA database connection."
fi

if ! rg -Uq 'existingApplication\?\.isPublished === true[\s\S]{0,400}applicationMatchesDesired\(existingApplication, existingSource\.id, existingTarget\.id\)\) \{' "${PIPELINE_SETUP}"; then
  fail "A matching published pipeline must be reused without requiring a running catalog flag."
fi

if rg -q 'applicationIsRunning' "${PIPELINE_SETUP}"; then
  fail "Restart reconciliation must not unpublish a matching pipeline only because OSA has not restored its running flag yet."
fi

echo "OSA restart-safety checks passed."
