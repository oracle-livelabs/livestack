# Retail Operations Intelligence LiveStack

## Purpose and business story

This portable Oracle AI Database 26ai retail demonstration connects customer trends, product and order documents, influence relationships, fulfillment geography, predictive analytics, governed returns decisions, and bounded AI-agent orchestration in one Redwood/JET application. Data Foundation prepares the governed dataset. The nine mounted demo scenes are Retail Command Center, Customer Trend Signals, Creator Influence Network, Intelligent Fulfillment Network, Unified Order Intelligence, Returns Intelligence, Retail OML Analytics, Ask Retail Data, and Retail AI Agent Console.

The Retail AI Agent Console deterministically routes questions to demand, fulfillment, commerce, or returns specialists. Each specialist executes only allowlisted, read-only Oracle SQL, Spatial, or AI Vector Search in the selected user's VPD context. Ollama can summarize returned evidence but cannot choose a tool, generate executable SQL, or mutate retail records. A separate Admin-confirmed proposal cycle may append review proposals and JSON provenance to `agent_actions` and `event_stream`; it never changes orders, inventory, customers, or return decisions.

## Architecture and runtime services

The immutable topology contains Oracle AI Database Free (`db`), ORDS (`ords`), local Ollama (`ollama`), and the Node.js/React application (`app`).

| Service | Runtime responsibility | Host port | Container port | Persistence |
|---|---|---:|---:|---|
| `app` | Retail API and Redwood/JET UI | 8505 | 3001 | Stateless image |
| `db` | Converged Oracle feature execution | 1521 | 1521 | `oracle-data` |
| `ords` | Packaged REST runtime; acceptance deferred | 8181 | 8080 | `ords-config` |
| `ollama` | Existing local model topology; not Oracle proof | 11434 | 11434 | `ollama-models` |

The application is <http://localhost:8505>, health is <http://localhost:8505/api/health>, ORDS is <http://localhost:8181/ords/>, and Ollama is <http://localhost:11434>. Compose health ordering starts `db`, then `ords`, and requires all dependencies before `app`. The service topology, `compose.yml`, canonical ports, and `Containerfile` are immutable in this wave.

## Prerequisites

- Podman 5 or newer with a running Podman machine
- A Podman Compose provider
- Network access for the first image and model download
- Accepted Oracle container registry terms where required
- Free host ports 1521, 8181, 8505, and 11434
- `curl` for health checks and Node.js 20 for source-contract tests
- Google Chrome and Lighthouse-capable `npx` for the maintained accessibility gates
- An isolated demo or controlled lab trust boundary

## Quick start with Podman

From the extracted `retail` directory:

```sh
cp .env.example .env
./scripts/podman-stack.sh config
./scripts/podman-stack.sh up -d --build
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

Review the copied configuration without printing secrets. The controlled archive can already contain `.env` byte-identical to `.env.example`; the copy command re-establishes that state. Initial bootstrap creates the schema and native feature assets automatically. The launcher fixes the project identity as `livestack-retail`, so containers, networks, and volumes use the `livestack-retail-*` prefix regardless of extraction folder. Do not change canonical ports.

Stop while retaining Oracle data:

```sh
./scripts/podman-stack.sh down --remove-orphans
```

## Configuration

| Variable | Compose default or expectation | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Application runtime mode |
| `PORT` | `3001` | Internal application port |
| `APP_PORT` | `8505` | Published application port |
| `DBPORT` | `1521` | Published Oracle listener port |
| `ORDS_PORT` | `8181` | Published ORDS port |
| `OLLAMA_PORT` | `11434` | Published model-runtime port |
| `ORACLE_DB_IMAGE` | Reviewed Oracle Free image | Database container |
| `ORDS_IMAGE` | Reviewed ORDS image | ORDS container retained in the immutable topology |
| `OLLAMA_IMAGE` | Reviewed Ollama image | Existing deferred local-model container |
| `ORACLE_USER` | `LIVESTACK` | Application schema |
| `APP_SCHEMA_PASSWORD` | Required demo-only secret | Schema credential; do not distribute a production value |
| `ORACLE_CONNECTION_STRING` | `db:1521/FREEPDB1` | App-to-database connection |
| `CONN_STRING`, `DBHOST`, `DBSERVICENAME` | `db:1521/FREEPDB1`, `db`, `FREEPDB1` | ORDS database service settings |
| `ORACLE_POOL_MIN/MAX/INCREMENT` | `2/10/1` | Node-oracledb pool sizing |
| `FRONTEND_URL` | `http://localhost:8505` | Same-origin browser boundary |
| `ONNX_MODEL_FILENAME` | `all_MiniLM_L12_v2.onnx` | Embedding model asset |
| `ONNX_MODEL_URL` | Reviewed public model artifact | First-bootstrap embedding model download |
| `OLLAMA_HOST`, `OLLAMA_BASE_URL` | Container-local addresses | Local model service binding and app connection |
| `OLLAMA_MODEL` | `llama3.2` | Existing deferred local model |
| `DATASET_OPERATION_LEASE_SECONDS` | `1800` | Durable import/Restore operation lease |

Review `.env.example` before startup. Do not add machine-local credentials, host addresses, or private keys to a release. Restore owns demo-date re-anchoring; there is no public demo-date override. Upload limits and required dataset manifest version are application-enforced rather than operator-tunable.

## Restore Demo Data

Select **Use Your Own Retail Data**, choose `admin_jess`, preview/validate the operation, and confirm **Restore Demo Data**. Restore is destructive for the active demo dataset. `POST /api/import/restore-demo/validate` performs the preview, `POST /api/import/restore-demo` queues the operation, and `GET /api/import/status/:jobId` reports durable queued, running, completed, or failed state.

Restore loads and validates replacement rows in one transaction while generation-specific OML models are staged before active-row mutation. Vector and Spatial run generation-marked candidate queries, require nonempty results, inspect the complete exact SQL ID/child execution plan and positive plan hash, and persist accepted object/index evidence on the activation connection. A mixed plan containing a forbidden full scan is rejected even when the expected index also appears. Duality, native JSON, Graph, VPD, In-Memory, audit, and all four OML scoring paths are also checked before a single DML commit switches the dataset pointer, model registry, readiness, and terminal job state. A failed candidate remains recorded on its job and does not overwrite active readiness. Live destructive lifecycle, forced-feature-failure, restart-recovery, and rollback evidence are still mandatory release gates.

Mutation requires both the Oracle-validated administrator persona and explicit same-origin command intent. These are isolated-demo controls; a shared deployment still needs trusted external authentication and sessions.

## Demo identities and security boundary

| Persona | Role and scope | Intended demonstration |
|---|---|---|
| `admin_jess` | Default global administrator and dataset operator | Jessica Chen; cross-region visibility and authorized dataset mutation |
| `analyst_raj` | Global read/analytics scope | Enterprise-wide analysis without dataset administration |
| `fm_west_maria` | California regional scope | West-region row filtering and in-scope database DML enforcement |
| `fm_east_dave` | New Jersey regional scope | East-region row filtering and in-scope database DML enforcement |
| `fm_south_keisha` | Georgia regional scope | South-region row filtering and in-scope database DML enforcement |
| `merch_tom` | Restricted merchandiser scope | Fail-restricted protected rows and writes |
| `viewer_sam` | Restricted viewer | Fail-restricted protected data visibility |

Oracle Application Context and VPD are authoritative for identity, role, region, and visibility. A missing identity resolves to the default `admin_jess` demo persona; an explicit malformed, unknown, or inactive identity is rejected. The demo header is not production authentication.

`X-Demo-User` is a caller-controlled demo persona switch, not authentication or proof of caller entitlement. Oracle validates the named active persona and derives VPD context; missing identity selects `admin_jess`, explicit malformed/unknown/inactive identity is rejected, and identity infrastructure failure is unavailable. The intent header and UI role switch are not authorization substitutes. Because the default persona is an administrator, use only in an isolated demo unless an external trusted authentication/session boundary protects it.

The database policy matrix deliberately proves all four SQL verbs. Admin can mutate globally; each fulfillment manager can insert, update, and delete only regional operational rows; cross-region inserts and updates fail through VPD `WITH CHECK OPTION`; Analyst, Merchandiser, and Viewer writes remain denied. The application exposes a narrower boundary: mounted dataset and Returns-decision mutation endpoints and their UI controls remain Admin-only, while regional scenes demonstrate VPD-filtered reads.

The live VPD regression gate takes schema-bound cryptographic fingerprints over every material column of every protected object. Allowed updates require exact target readback showing a material row change; denied inserts, updates, deletes, and cross-scope writes require unchanged material evidence; every persona and pooled-connection lane must finish with exact full-table rollback equality.

## Oracle feature evidence matrix

| Feature | Database evidence | API evidence | UI evidence | Explicit unavailable behavior | Current recorded state |
|---|---|---|---|---|---|
| Application Context and VPD | Canonical 40-object inventory, `RETAIL_APP_CTX`, paired context-sensitive scope/write policies, all-verb rollback matrix, `CLIENT_IDENTIFIER` | Protected routes use Oracle-derived identity; mutation endpoints enforce their narrower Admin boundary | Persona switch clears/refetches every scene and hides non-Admin mutation controls | 403 identity / 503 infrastructure | Source-ready; live DB/API/browser matrix required |
| JSON Relational Duality | `ORDERS_DV`, `PRODUCTS_INVENTORY_DV` | Native `SELECT DATA` routes | Product/order document tabs | 503, no synthetic JSON | Source-ready; live required |
| AI Vector Search | Every retained row binds canonical product text or canonical post text to the current ONNX model; bootstrap and Restore recompute every vector, then use a magnitude-sensitive Euclidean current-model comparison with a `0.000001` tolerance and persist generation-bound source/vector/cache hashes. Required provenance, score, rank, and method fields are `NOT NULL` with explicit NULL-safe validation. Each exact Vector index is bound to its table and first `EMBEDDING` column | Readiness compares current bytes to the fully validated generation evidence and requires a nonempty same-session cursor using the exact expected Vector index, exact SQL ID/child, and positive plan hash; a restricted empty scope additionally requires a matching current-generation global evidence anchor | Customer Trend Signals renders the exact cursor/index/plan-hash tuple, or the independently anchored VPD scoped-empty generation, on desktop and narrow layouts | 503 for stale text, changed vectors/cache, NULL evidence, zero-row execution, missing or mixed/full-scan plans, or a missing/stale global anchor; no ranking substitute, dummy vectors, inferred execution, or healthy-empty false pass | Source-remediated; fresh and retained live proof required |
| SQL/PGQ Property Graph | `INFLUENCER_NETWORK`, exact `GRAPH_TABLE` result and current cursor/plan | `/api/graph/network/:id` returns the same edge tuple and current-cursor proof | Creator Influence Network renders the exact edge/cursor tuple | 503, no relational fallback or claim | Source-ready; live result/cursor comparison required |
| Oracle Spatial | Exact `USER_SDO_GEOM_METADATA` for `FULFILLMENT_CENTERS.LOCATION`, SRID 4326/two dimensions, and exact valid `IDX_FC_SPATIAL` binding; a nonempty `SDO_NN` ranked result must use the complete current SQL ID/child plan and positive plan hash | `/api/fulfillment/spatial-readiness` returns the same nonempty ranked rows and exact current-cursor evidence | Fulfillment Internals renders the exact first result, object/index, SQL ID/child, and plan hash on desktop and narrow layouts | 503 for zero rows, wrong/generic index, wrong column/metadata, NULL identity, or a mixed/full-scan plan | Source-remediated; fresh, Restore, recovery, API, and browser proof required |
| Oracle Machine Learning | Four generation-specific, distinct physical models and active atomic registry; exact native rows for all five business analytics routes | Admin-only global system-model scoring evidence is separate from persona-scoped business analytics, with exact ordered business values and cardinality | OML Analytics renders exact route values on desktop and narrow layouts, global model metadata, and data scope; non-Administrators receive a restricted state rather than global score tuples | All seven mounted OML routes return server-owned 503 responses together; no partial, stale, cached, or heuristic result remains visible | Source-ready; exact five-route DB/API/UI comparison and complete outage proof required |
| Native JSON | Current-generation `JSON_VALUE`/`JSON_EXISTS` result over native JSON | `/api/dashboard/native-json` returns the matching aggregate global feature tuple without event or business identifiers | Command Center Internals renders generation, fingerprint, count, and operators | 503, no Duality reuse or payload disclosure | Source-ready; all-persona DB/API/UI proof required |
| Database In-Memory | Exact canonical `ORDERS`, `ORDER_ITEMS`, `SOCIAL_POSTS`, `CUSTOMERS`, and `DEMAND_FORECASTS` `V$IM_SEGMENTS` rows, each `COMPLETED` with positive In-Memory bytes and zero bytes not populated, plus a current `TABLE ACCESS INMEMORY FULL` cursor | `/api/dashboard/inmemory` returns the same safe global five-row segment/cursor tuple; business queries stay persona-scoped | Command Center Internals renders every exact segment tuple and cursor operation | 503, no metadata-only, wait-only, padding, or estimated substitute | Source-ready; all-persona result/cursor and retained-restart proof required |
| Unified Audit | Enabled ADMIN-owned policy plus Restore-correlated allowed INSERT (`RETURN_CODE=0`) and genuine VPD-denied INSERT (`ORA-28115`) | `/api/returns/audit-readiness` returns the matching safe global execution tuple | Returns renders exact allowed/denied counts, codes, and correlations | 503, no application-event substitute | Source-ready; audit-reader DB/API/UI comparison required |
| Dataset lifecycle | Phased Oracle jobs, exact-token-fenced lease heartbeat, lost-ownership abort, generation registry, active readiness, and atomic winner evidence under overlapping Restore requests | Import/Restore/status routes; a maintained overlap gate requires exactly one `202` winner and one `409` loser | All scenes invalidate on activation | Failed, lease-lost, or concurrent losing candidate leaves no job, lease, generation, or feature-evidence side effect | Source-ready; lifecycle and live overlap proof required |

Evidence comes from the deployed database. Relational, JavaScript, estimated, or heuristic substitutes do not count as native feature execution.

## Test-driven validation and regression

### Source and contract gates

```sh
npm run verify:wave2-green
npm run verify:remediation
npm run verify:oracle-features
npm run verify:restore-events
npm run verify:convergence
npm run verify:feature-plans
npm run verify:event-boundaries
npm run verify:operation-lock
npm run verify:mounted-effects
npm run verify:oml-lifecycle
npm run verify:inmemory-restart
npm run verify:duality-shape
npm run verify:failure-injection
npm run verify:fifth-remediation
npm run verify:sixth-remediation
npm run verify:seventh-remediation
npm run verify:eighth-remediation
npm run verify:ninth-remediation
npm run verify:tenth-remediation
npm run verify:eleventh-remediation
npm run verify:twelfth-remediation
npm run verify:thirteenth-remediation
npm run verify:fourteenth-remediation
npm run verify:fifteenth-remediation
npm run verify:sixteenth-complete-operator-plan
npm run verify:sixteenth-vector-complete-plan
npm run verify:sixteenth-plan-identity
npm run verify:sixteenth-remediation
npm run verify:r6-build
npm run verify:final-source
npm run verify:brand-colors
npm run build
node verification/check-import-contract.js
```

The fourteenth-remediation gate requires the native Vector bootstrap order
`ONNX model -> atomic product/post finalizer -> same-session current-cursor
proof -> readiness`. Complete retained 384/FLOAT32 evidence is an idempotent
no-op; partial or corrupt derived evidence must rebuild and revalidate
atomically or keep readiness unpublished.

The fifteenth-remediation gate closes retained-evidence false passes. It
requires exact canonical product/post text, full current-ONNX-model
recomputation during bootstrap and Restore, generation-bound current-byte
hashes for every vector and semantic-cache row, both exact Vector-index
table/`EMBEDDING` bindings, and a nonempty exact-index cursor. A VPD
scoped-empty response is successful only when a separate read-only system
transaction proves the same current generation and fingerprint; a missing,
stale, or mismatched anchor returns 503.

The sixteenth-remediation gates add scalar-multiple regression, Euclidean
magnitude validation, fresh and retained `NOT NULL` convergence, explicit
Oracle NULL rejection, complete-child mixed/full-scan rejection, nonempty
Vector and Spatial execution, positive plan-hash identity, and exact
`IDX_FC_SPATIAL` plus geometry-metadata binding. API and desktop/narrow UI
surfaces fail closed when any part of those tuples is missing or stale. The
complete-plan addendum also rejects any second wrong, generic, or duplicate
Vector-index row in the representative current child before evidence is
published. The complete-operator addendum requires the native operator in
the plan's `OPERATION` column and exactly one expected Vector or Spatial
index row; feature-looking options text and every second wrong, generic, or
duplicate domain-index row fail before publication.

The maintained orchestration workspace owns the external test harness and evidence. The deployment archive retains only the minimal runtime verification payload at `verification/demo-dataset/`, because the immutable runtime build copies that bundled dataset. Test scripts, fixtures, reports, and captured evidence are excluded. Script presence is not pass evidence.

### Live non-destructive gates

Run direct database metadata/execution/plan checks, the complete protected API role matrix, and Playwright desktop/mobile browser scenes from the maintained verification workspace. Finalize and review the external source freeze only after the source is otherwise complete:

```sh
npm run verify:source-freeze
npm run build
npm run verify:runtime-copy-graph:generate
npm run verify:runtime-copy-graph
export RETAIL_EXPECTED_FREEZE_JSON="$(cd ../validation && pwd)/retail-source-freeze.json"
export RETAIL_EXPECTED_FREEZE_MANIFEST="$(cd ../validation && pwd)/retail-source-freeze-manifest.sha256"
export RETAIL_API_BASE_URL="http://127.0.0.1:8505"
export RETAIL_DESTRUCTIVE_DEPLOYMENT="I_UNDERSTAND_THIS_BUILDS_AND_STARTS_RETAIL"
npm run verify:test-driven-deployment-live
```

The two expected-freeze files and generated runtime copy graph must remain outside the `retail` source root. Review their digest, file count, source bytes, database-source digest, immutable runtime hashes, complete manifest, and application/database path-type-size-SHA graph before treating them as the independent trust anchors. Any later source change invalidates them and requires a new review.

`npm run verify:test-driven-deployment-live` is the fail-closed deployment orchestrator. It first runs the sixteenth complete-operator, Vector complete-plan, plan-identity, and remediation gates, followed by fifteenth-remediation, fourteenth-remediation, thirteenth-remediation, twelfth-remediation, eleventh-remediation, tenth-remediation, final-source, Oracle-feature, failure, Duality, In-Memory, OML, brand, and frontend-build gates. It then builds through the immutable launcher, binds both exact image IDs, both stable containers, Compose project/services, database schema generation, externally frozen source, external runtime copy graph, served build, bundle, and URL, and executes these public component gates in order:

```sh
npm run verify:vpd-context
npm run verify:live-security
npm run verify:live-browser-security
npm run verify:contrast
npm run verify:focus-semantics
npm run verify:live-restore-concurrency
```

The browser matrix temporarily recreates the exact Compose application service in test mode so real server-owned unavailable responses can be exercised; it never fabricates a response in Playwright. The orchestrator then recreates `livestack-retail-app-1` in production mode, repeats the complete runtime binding, proves production ignores the test selector, and leaves that production service running. Any component failure exits nonzero and prevents a passing result.

### Stateful, restart, negative, and destructive gates

Run Restore, upload, the seven-persona SELECT/INSERT/UPDATE/DELETE VPD matrix, audit-trail, app/database restart, every maintained Oracle feature-failure phase, process-kill boundary, negative deployment, recovery, and retained-volume test only on disposable demo data. The maintained destructive command is `npm run verify:failure-atomicity-live`; it has an explicit safety guard, exercises 25 real abrupt-termination boundaries, verifies startup reconciliation, and returns the app to production mode with a recovery Restore. Current live evidence is pending in the Wave 2 validation record.

## Clean deployment, restart, and package verification

### Retained-volume restart

A retained-volume restart must preserve active version, terminal jobs, feature objects, audit evidence, and complete native product/post vectors plus deterministic semantic matches while repopulating restart-sensitive In-Memory state and establishing fresh active-generation Vector and Spatial cursor proof. An incomplete retained Vector state must converge through the atomic finalizer before readiness; a complete state must remain unchanged. A fresh deployment must use only `scripts/podman-stack.sh`, create only `livestack-retail-*` resources, and bootstrap without manual SQL.

### Fresh-volume deployment

This deletes demo data:

```sh
./scripts/podman-stack.sh down --volumes --remove-orphans
./scripts/podman-stack.sh up -d --build
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

### Package verification

The final Wave 2 release archive path, SHA-256, member manifest, and exact-archive redeployment are pending. A release has one `retail/` root, exact immutable runtime hashes, this README, the stable launcher, and only `verification/demo-dataset/` from the verification tree. It excludes test scripts, fixtures, evidence output, generated builds, dependencies, logs, local host notes, nested archives, and OS metadata.

## Troubleshooting

- Unexpected resource prefix: stop and restart through `./scripts/podman-stack.sh`.
- Feature unavailable: inspect the database object/readiness result; do not enable a substitute.
- Restore rejected: confirm administrator identity, explicit confirmation, and no active durable lease.
- Slow first start: inspect `./scripts/podman-stack.sh logs -f db app`.
- Port 8505 occupied: stop the conflicting workload; do not edit immutable topology.

## Archive layout

The `retail/` root contains immutable runtime files, backend, frontend, database schema/data, scripts, reviewed environment files, this README, and the minimal runtime verification payload required by the immutable build. External verification and captured evidence stay outside the release.

## Deferred Wave 2 acceptance

ORDS-owned API acceptance and native Select AI remain deferred for this wave. The mounted Retail AI Agent Console uses application-layer deterministic orchestration, local Ollama summarization, and governed Oracle tools; it does not claim `DBMS_CLOUD_AI_AGENT` execution.
