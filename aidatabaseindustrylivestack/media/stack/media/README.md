# Media and Entertainment LiveStack

## Purpose and business story

This LiveStack demonstrates governed content, audience, creator, rights, campaign, and live-event operations on Oracle AI Database 26ai. The operator moves from launch operations through semantic audience signals, creator relationships, coverage planning, rights requests, and in-database forecasts.

The application uses synthetic media and entertainment data. Some physical object names preserve the shared LiveStack importer contract while the visible story remains media-specific.

## Architecture and runtime services

The immutable [compose.yml](compose.yml) and [Containerfile](Containerfile) define four services. The launcher fixes the Podman project at `livestack-media`; containers use `livestack-media-<service>-1` and named resources use the `livestack-media_` prefix.

| Service | Responsibility | Host port | Container port | Persistence |
|---|---|---:|---:|---|
| `app` | Express API and React/JET Redwood-style frontend | `8505` | `3001` | State is held in Oracle |
| `db` | Oracle AI Database with relational, JSON, Vector, Graph, Spatial, OML, VPD, In-Memory, and audit objects | `1521` | `1521` | `oracle-data` volume |
| `ords` | ORDS retained by the immutable topology | `8181` | `8080` | `ords-config` volume |
| `ollama` | Local conversational runtime retained by the topology | `11434` | `11434` | `ollama-models` volume |

The application is at `http://localhost:8505`; health is at `http://localhost:8505/api/health`.

ORDS-owned APIs, native Select AI, and native Agents are deferred from this acceptance wave, but their existing services remain required by the topology.

## Prerequisites

- A running Podman machine with `podman compose`.
- Access to the declared Oracle Container Registry images and accepted image terms.
- Network access for container images and configured model downloads.
- Free host ports `8505`, `1521`, `8181`, and `11434`.
- `curl` for health checks.
- Sufficient CPU, memory, and disk for Oracle Database, ORDS, Ollama, and the application.

Use this stack as an isolated local or separately protected demonstration. It is not a production authorization reference.

## Quick start with Podman

From the extracted stack root:

```bash
cp .env.example .env
./scripts/podman-stack.sh config
./scripts/podman-stack.sh up -d --build
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

Initial database bootstrap can take several minutes. Use `scripts/podman-stack.sh` for every lifecycle command; bare Compose derives an unstable project name.

Open:

- Application: `http://localhost:8505`
- Health: `http://localhost:8505/api/health`
- ORDS: `http://localhost:8181/ords/`
- Ollama: `http://localhost:11434`

## Configuration

Review `.env` before startup. The deployment archive carries `.env` byte-identical to `.env.example`; locally changed values are not release content.

| Variable | Default or expectation | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Runtime mode |
| `APP_PORT` | `8505` | Published application port |
| `DBPORT` | `1521` | Published database port |
| `ORDS_PORT` | `8181` | Published ORDS port |
| `OLLAMA_PORT` | `11434` | Published Ollama port |
| `ORACLE_USER` | `LIVESTACK` | Application schema owner |
| `ORACLE_PWD` | Demo-only default; change it | Oracle administrative password |
| `APP_SCHEMA_PASSWORD` | Demo-only default; change it | Application schema password |
| `ORACLE_CONNECTION_STRING` | `db:1521/FREEPDB1` | Application database connection |
| `ORACLE_POOL_MIN` / `MAX` | `2` / `10` | Oracle connection-pool bounds |
| `ONNX_MODEL_FILENAME` | `all_MiniLM_L12_v2.onnx` | Database embedding model file |
| `OLLAMA_MODEL` | `llama3.2` | Local conversational model |
| `DEMO_ANCHOR_DATE` | Blank | Optional fixed demo-date anchor |

Do not reproduce configured credentials or model-distribution URLs in logs, screenshots, support tickets, or release notes.

## Restore Demo Data

Restore is a destructive dataset replacement:

1. Select the `admin_jess` persona.
2. Open **Data Foundation** or **Use Your Own Data**.
3. Preview or validate the dataset.
4. Press **Restore Demo Data**.
5. Follow the durable asynchronous job until it reaches `completed` or `failed`.
6. Confirm the active version, refreshed dates, live record counts, and feature states.

The mutation API requires an explicit command-intent header, the Oracle-validated Admin persona, and same-origin browser metadata. Required feature failure must produce a failed job and must not advance the active version. These demo controls reduce accidental mutation; they are not authentication.

## Demo identities and security boundary

| Persona | Scope | Demonstration |
|---|---|---|
| `admin_jess` | Global admin | Full visibility and dataset administration |
| `analyst_raj` | Global analyst | Global read and analytics |
| `fm_west_maria` | California | Regional operations |
| `fm_east_dave` | New Jersey | Regional operations |
| `fm_south_keisha` | Georgia | Regional operations |
| `merch_tom` | Restricted | No regional operational rows |
| `viewer_sam` | Restricted | Fail-closed viewer |

`inactive_audit` is an inactive test identity and must be rejected.

`X-Demo-User` is a caller-controlled persona switch, not proof of identity. Oracle validates activity and derives role, region, and scope. A missing header maps to restricted `viewer_sam`; explicit empty, malformed, unknown, or inactive identities return `403`. A shared deployment requires a trusted external authentication/session boundary.

## Oracle feature evidence matrix

Source remediation is awaiting a fresh independent review. No row below is
promoted by source wiring alone; live acceptance still requires the exact
candidate archive on fresh and retained volumes.

| Feature | Database evidence | API evidence | UI evidence | Explicit unavailable behavior | Current state |
|---|---|---|---|---|---|
| Application Context and VPD | Private `MEDIA_APP_CTX`, trusted `MEDIA_SECURITY_PKG`, and one exact SELECT/DML policy pair per protected object. Fresh bootstrap skips the retired schema-owner policies; retained reconciliation removes the exact seven legacy VPD policies before dropping their functions. The all-policy inventory rejects any extra policy and treats `ORA-28110` as a hard failure. The runtime matrix derives exact visible primary-key sets for all 23 protected objects. Admin has global DML; regional fulfillment managers can maintain only their own fulfillment-center rows, with `UPDATE_CHECK` rejecting an out-of-region transition; every other persona/object combination is denied | Request identity is Oracle-derived. The matrix proves exact database-visible IDs against governed response IDs and dashboard totals, records physical Oracle session IDs across sequential persona changes, and checks that cleanup failures discard the session | All eight scenes are exercised for every valid persona, with exact database/API/UI counts or row IDs. Explicit empty, malformed, unknown, and inactive identities render a fail-closed rejection instead of silently becoming Viewer | Every denied DML statement is independently valid as Admin; UPDATE probes are independently valid, non-key-changing mutations with full-row before/after and rollback proof. All personas run meaningful INSERT/UPDATE/DELETE through concurrent pooled connections. Regional fulfillment-center tests prove scoped allowed DML, genuine out-of-scope `INSERT_CHECK` and cross-region `UPDATE_CHECK` `ORA-28115`; existing out-of-scope UPDATE/DELETE are honestly classified as policy-filtered zero-row operations. SELECT, API, browser, sequential-switch, and concurrent-switch matrices remain exhaustive | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| JSON Relational Duality | Final bootstrap-applied `ORDERS_DV` and `PRODUCTS_INVENTORY_DV` definitions are native and read-only | Product and order document routes query `DATA` from those exact views | Content and campaign detail surfaces use the same document keys and show read-only provenance | Native view failure returns `503`, never synthetic replacement | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| AI Vector Search | `ALL_MINILM_L12_V2` must be the exact `EMBEDDING`/`ONNX` catalog model for the two 384-dimensional `FLOAT32` Vector columns. Readiness compares canonical product text and canonical post text with Oracle-safe CLOB equality, recomputes every stored embedding with the current ONNX model, and independently recomputes the semantic cache. Exact Vector index metadata binds each expected index to its table `EMBEDDING` column at position 1, `VECTOR` type, `VALID` status, IVF subtype, and `COSINE` distance. Complete retained evidence remains a no-op; any mismatch selects one atomic derived-data rebuild and post-validation | Audience searches require a current-generation global Vector anchor: one generation and dataset fingerprint across readiness, integrity, persisted execution, and a freshly captured nonempty same-session plan using the exact expected index. Full plan inspection rejects a mixed plan containing a full scan of either embedding table. Request-scoped counts are then checked under the caller's VPD context without repeating the full ONNX corpus recomputation | Desktop and narrow Audience Momentum surfaces distinguish indexed success, `SCOPED_NO_VISIBLE_VECTOR_DATA`, and feature unavailable. Success shows the exact cursor proof; scoped-empty shows the independently proven `IDX_PRODUCT_VEC` global anchor without exposing global rows | Stale text, well-shaped corrupt vectors, a self-consistent corrupt cache, wrong index binding, wrong/unrelated plan rows, any embedding-table full scan, zero results, stale generation/fingerprint, or missing global proof fails closed | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Property Graph | `INFLUENCER_NETWORK` and exact SQL/PGQ `GRAPH_TABLE` queries | Graph examples expose executed native queries | Creator & Community Graph renders traversal results | Missing graph metadata/query returns unavailable | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Oracle Spatial | Point geometry, metadata, domain indexes, `SDO_NN` candidates, exact distance ordering, and exact current-session cursor/child/plan evidence | Nearest-center route executes the indexed candidate path for every scene persona without reading Admin control tables and returns the exact index object plus plan hash | Rights, Capacity & Live Event Coverage renders scoped results, index proof, and an independently checked map-marker layer | Invalid coordinates are rejected; missing indexed evidence is unavailable | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Oracle Machine Learning | Restore writes a generation header and complete asset manifest before DDL, trains four generation-specific models, and records actual row-count plus SHA-256 provenance | Four distinct generation-bound score routes execute the active physical `DEMAND_SURGE_MODEL`, `CUSTOMER_SEGMENT_MODEL`, `REVENUE_PREDICT_MODEL`, and `PRODUCT_CLUSTER_MODEL`; each response reports the logical and physical model, generation, training fingerprint and row count, algorithm, native scoring operator, result count, and `fallback: false`. The contract covers all seven native OML API routes and all four restricted structured-empty OML states on desktop and narrow viewports | Forecast & Performance provides an interactive scored-result or explicit governed-empty panel for each of the four OML models and renders the same provenance tuple returned by its API; Rights & Capacity uses the same native demand model, and the browser contract visits every panel | A server-owned fault returns canonical `503` responses for the seven-route inventory, including Capacity, and suppresses every stale score or normal empty substitute. Training or scoring failure leaves the prior active registry and dataset intact; no heuristic can satisfy an OML route, and an asset is marked cleaned only after dictionary absence is verified | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Native JSON | `PRODUCT_ATTRIBUTES.ATTRIBUTES`, `EVENT_STREAM.EVENT_DATA`, and the physical `SOCIAL_POST_PAYLOADS.RAW_PAYLOAD` / `SOCIAL_POST_PAYLOADS.ENRICHMENTS` objects are native JSON with executed operator evidence | Restore hydrates one product document per content asset, one raw payload plus enrichments document per social post, and database event documents | Data Foundation exposes current database-derived counts for all three native JSON stores | Invalid or incomplete JSON rolls back; missing physical objects, operators, or exact document coverage block activation | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Database In-Memory | Exact four-object inventory, completed population with zero unpopulated bytes, and generation-bound current-session SQL ID, child number, plan hash, and `TABLE ACCESS INMEMORY FULL CUSTOMERS` evidence | `/api/dashboard/inmemory` returns measured catalog and exact execution evidence only | Launch Operations renders every measured object and its native current-cursor proof | Missing population or exact plan keeps readiness fail-closed; no estimate is labeled live | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Unified Audit | ADMIN-owned `SC_ORDER_AUDIT`; the Admin statement must affect one row and record `RETURN_CODE=0`, while `fm_west_maria` must attempt a California-to-Georgia transition that raises `ORA-28115`, leaves the row unchanged, and records exact `RETURN_CODE=28115` under its `CLIENT_IDENTIFIER` | Current-generation evidence requires both exact correlated outcomes and the unchanged target-state proof | Data Foundation renders the exact denied persona, `ORA-28115`, `RETURN_CODE=28115`, and unchanged-row result | Any other error, zero-row success, missing audit row, or changed target can never satisfy denial evidence | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |
| Dataset lifecycle and runtime identity | Durable bootstrap/candidate generation, jobs, attempts, asset manifest, readiness, and exact evidence. Fresh hydration and retained reconciliation remain separate. Retained startup never reseeds business rows or retrains OML; its idempotent Vector finalizer performs no DML when evidence is complete and atomically self-heals only incomplete derived Vector rows before the marker | Lease ownership, job, attempt, and requested intent share one commit. Validation has a durable heartbeat plus exact-token update/release fencing; guarded mutations and every scene response are generation-fenced. Health and every same-origin resource expose independently verifiable LiveStack, image, source, and frontend-bundle identities | Every scene clears and refetches after identity or dataset revision. Browser acceptance rejects a mismatched target, image, source tree, or frontend bundle before feature evidence is accepted | Concurrent validation/reconciliation/Restore, process-loss recovery, stale same-job tokens, exact retained fingerprints, zero/partial/corrupt Vector fault injection, pre-commit failure, post-commit reconciliation, stale frontend output, failed build subprocesses, and missing JET/runtime assets are regression contracts | **SOURCE PENDING / INDEPENDENT RE-REVIEW PENDING** |

## Test-driven validation and regression

The source checkout includes the full verification harness. The clean deployment
ZIP keeps only the **minimal runtime verification payload** required by the
immutable `Containerfile`: `verification/demo-dataset/`. It excludes test
scripts, fixtures duplicated outside that runtime dataset, and generated
evidence. Static Media parity checks run from the source checkout:

```bash
npm run verify:c1-c7
npm run verify:five-blocker-contract
npm run verify:operation-admission
npm run verify:validation-lease-runtime
npm run verify:retained-start
npm run verify:retained-vector-integrity
npm run verify:second-vector-remediation
npm run verify:m3-m4-source
npm run verify:browser-feature-runtime
npm run verify:oml-cleanup-runtime
npm run verify:build-output
npm run verify:wave2-green-contract
npm run verify:final-semantic-contract
npm run verify:m0-m8
npm run verify:module-smoke
npm run verify:post-c6-next-remediation
npm run verify:release
npm run verify:demo-date-reanchor
npm run verify:demo-date-windows
npm run verify:media-data-model-contract
npm run verify:frontend-domain-language
```

The source checkout also contains opt-in live failure, VPD, browser, OML, and cleanup matrices.
They require an already isolated acceptance deployment and produce database,
API, and all-scene browser evidence; they do not run live as part of the
offline release suite.

The frontend build gate removes any prior output before invoking its required
steps, propagates the exact failing exit code, checks the complete Oracle JET
runtime asset set, and writes a deterministic input identity into the new
bundle. Runtime acceptance independently recomputes the source and bundle
identities instead of trusting values supplied by the application.

The release orchestrator must additionally run, from an external dependency-complete verification workspace:

- fresh-volume and retained-volume startup through the stable launcher;
- database positive, negative, plan, and metadata checks for every matrix row;
- API checks for every user-visible feature;
- desktop and mobile browser regressions with identity switching;
- successful Restore, concurrency, restart interruption, forced required-feature failure, recovery Restore, and no version advance on failure;
- exact extracted-archive redeployment and final clean-package scans.

No matrix row becomes GREEN solely because the static contract passes.

## Clean deployment, restart, and package verification

Retained-volume restart:

Retain data:

```bash
./scripts/podman-stack.sh down --remove-orphans
./scripts/podman-stack.sh up -d
./scripts/podman-stack.sh ps
```

Delete isolated demo volumes and rebuild from scratch:

```bash
./scripts/podman-stack.sh down --volumes --remove-orphans
./scripts/podman-stack.sh up -d --build
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

The fresh-volume command is destructive.

The release archive is `livestack-media.zip`. It must have one `media/` root, exact immutable runtime-file hashes, and `.env` byte-identical to `.env.example`.

The release excludes the external verification harness and evidence while
retaining `verification/demo-dataset/` as the minimal runtime build payload.
It also excludes `change.md`, `.DS_Store`, `__MACOSX`, `ip.md`, dependencies,
generated frontend output, coverage, caches, logs, local paths, host-specific
notes, and nested archives.

## Troubleshooting

Inspect service state and logs:

```bash
./scripts/podman-stack.sh ps
./scripts/podman-stack.sh logs db
./scripts/podman-stack.sh logs ords
./scripts/podman-stack.sh logs ollama
./scripts/podman-stack.sh logs app
```

If `/api/health` returns `503`, inspect database bootstrap and application logs. Health requires a working Oracle connection and global application-context proof.

If an Oracle feature is unavailable, keep the unavailable state visible and collect the failed job/API evidence. Do not relabel a fallback as native execution.

## Archive layout

```text
media/
├── compose.yml
├── Containerfile
├── .env
├── .env.example
├── README.md
├── backend/
├── db/
├── frontend/
├── package.json
├── package-lock.json
├── verification/
│   └── demo-dataset/
└── scripts/
```

## Deferred Wave 2 acceptance

ORDS-owned APIs, native Select AI, and native Agents are excluded from this feature-acceptance tranche. Their existing topology and code remain unchanged and cannot mask failures in the ten accepted database, API, frontend, Restore, security, or packaging tracks.
