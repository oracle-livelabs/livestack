#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENTRYPOINT="${PROJECT_ROOT}/ingestion/ggsa/container/entrypoint.sh"
DOCKERFILE="${PROJECT_ROOT}/ingestion/ggsa/Dockerfile"
JDBC_COMPAT_AGENT="${PROJECT_ROOT}/ingestion/ggsa/container/JdbcWalletCompatAgent.java"
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

[[ -f "${JDBC_COMPAT_AGENT}" ]] \
  || fail "The JDBC wallet compatibility agent must be included in the GGSA image build."

if ! rg -q 'jdbc:oracle:thin:@' "${JDBC_COMPAT_AGENT}" \
  || ! rg -q 'normalizeLegacyWalletUrl' "${JDBC_COMPAT_AGENT}" \
  || ! rg -q 'DbReferenceBuilder' "${JDBC_COMPAT_AGENT}" \
  || ! rg -q 'URLEncoder' "${JDBC_COMPAT_AGENT}"; then
  fail "The compatibility agent must fix both OSA wallet URL paths and URL-encode credentials."
fi

if ! rg -q 'JdbcWalletCompatAgent.java' "${DOCKERFILE}" \
  || ! rg -q 'jdbc-wallet-compat-agent.jar' "${DOCKERFILE}" \
  || ! rg -q -- '-javaagent:/u01/osa/osa-base/compat/jdbc-wallet-compat-agent.jar' "${DOCKERFILE}"; then
  fail "The GGSA image must compile and enable the JDBC wallet compatibility agent."
fi

if ! rg -Uq 'existingApplication\?\.isPublished === true[\s\S]{0,400}applicationMatchesDesired\(existingApplication, existingSource\.id, existingTarget\.id\)\) \{' "${PIPELINE_SETUP}"; then
  fail "A matching published pipeline must be reused without requiring a running catalog flag."
fi

if rg -q 'applicationIsRunning' "${PIPELINE_SETUP}"; then
  fail "Restart reconciliation must not unpublish a matching pipeline only because OSA has not restored its running flag yet."
fi

if ! rg -Uq 'async function unpublishExistingApplication[\s\S]{0,1400}existing\?\.id[\s\S]{0,800}sparkApplicationIsRunning\(config, existing\.id\)' "${PIPELINE_SETUP}"; then
  fail "A failed Draft publication must be undeployed and its Spark allocation released before retrying publish."
fi

if ! rg -Uq 'api\.patch\(`applications/\$\{existing\.id\}`, \{[\s\S]{0,120}published: false,[\s\S]{0,120}deployDraft: false' "${PIPELINE_SETUP}"; then
  fail "Draft cleanup must stop the Draft deployment before retrying publication."
fi

if ! rg -q "'spark\.executor\.extraJavaOptions': '.*jdbc-wallet-compat-agent\.jar'" "${PIPELINE_SETUP}"; then
  fail "Spark executors must load the wallet JDBC compatibility agent."
fi

if ! rg -q "name\.endsWith\('_draft'\)" "${PIPELINE_SETUP}"; then
  fail "The Spark allocation check must include orphaned Draft applications."
fi

if ! rg -Uq 'pipelineBaseUrl.*v1[\s\S]{0,2400}publishPipeline\(id\)[\s\S]{0,500}pipelines/\$\{id\}/publish[\s\S]{0,500}PIPELINE_PUBLISH_CONFIG' "${PIPELINE_SETUP}" \
  || ! rg -q 'api\.publishPipeline\(existing\.id\)' "${PIPELINE_SETUP}" \
  || ! rg -q 'api\.publishPipeline\(applicationId\)' "${PIPELINE_SETUP}"; then
  fail "Pipeline publication must use OSA's public v1 pipeline publish endpoint with its required configuration."
fi

if ! rg -Uq 'if \(existingApplication\) \{[\s\S]{0,160}unpublishExistingApplication\(api, config\.osa\)' "${PIPELINE_SETUP}"; then
  fail "Draft applications must be explicitly undeployed before the next publish attempt."
fi

if ! rg -Uq 'async function ensureTarget[\s\S]{0,500}!forceRefresh && targetMatchesDesired\(existing, config, adbConnectionId\).*return existing' "${PIPELINE_SETUP}"; then
  fail "A matching OSA JDBC target must be reused instead of rewritten before publication."
fi

if ! rg -Uq 'const createResponse = await api\.post\('"'"'targets'"'"', payload\)[\s\S]{0,700}await api\.put\(`targets/\$\{targetId\}`' "${PIPELINE_SETUP}"; then
  fail "A newly created OSA JDBC target must be edited once to refresh table metadata before publication."
fi

if ! rg -Uq 'async function recreateTargetAndApplication[\s\S]{0,1200}api\.delete\(`applications/\$\{existingApplication\.id\}`\)[\s\S]{0,1200}api\.delete\(`targets/\$\{target\.id\}`\)[\s\S]{0,800}crypto\.randomUUID\(\)' "${PIPELINE_SETUP}"; then
  fail "OSA-01213 recovery must rebuild the invalid draft and JDBC target with a new target identity."
fi

if ! rg -Uq 'requiresTargetRefresh[\s\S]{0,900}recreateTargetAndApplication\(api, config\.osa, adbConnection\.id, existingApplication, target\)[\s\S]{0,300}OSA_STREAMING_TARGET_REFRESH_SETTLE_MS' "${PIPELINE_SETUP}"; then
  fail "OSA-01213 must rebuild the target once and wait before publishing again."
fi

if ! rg -Uq 'async function ensureSource[\s\S]{0,300}sourceMatchesDesired\(existing, config, kafkaConnectionId\).*return existing' "${PIPELINE_SETUP}"; then
  fail "A matching OSA Kafka source must be reused instead of rewritten before publication."
fi

echo "OSA restart-safety checks passed."
