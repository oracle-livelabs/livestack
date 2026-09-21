# High Tech Product Intelligence LiveStack

## Purpose and business story

This LiveStack demonstrates how Seer Tech can connect product and developer signals to semiconductor manufacturing, fab operations, product lifecycle management, supply resilience, customer commitments, field quality, warranty, and support decisions.

The operator journey moves through:

- a product and commitment control tower;
- semantic product-signal search;
- a native Oracle property graph for lifecycle and dependency analysis;
- spatial capacity and allocation decisions;
- customer commitment documents exposed through JSON-relational duality views;
- in-database demand, segmentation, product-value, and capacity analytics; and
- a governed dataset workflow that can restore the bundled synthetic demo data.

The application uses synthetic High Tech data. Some physical database object names retain baseline-compatible names so the portable importer and schema bootstrap remain stable.

## Architecture and runtime services

The immutable [compose.yml](compose.yml) and [Containerfile](Containerfile) define four services on one Podman Compose network. The stack launcher fixes the Podman Compose project identity at `livestack-hightech`, so containers use the `livestack-hightech-<service>-1` prefix and named resources use the `livestack-hightech_` prefix.

| Service | Runtime responsibility | Host port | Container port | Persistence |
|---|---|---:|---:|---|
| `app` | Node.js/Express API and the built React, Oracle JET, and Redwood-style frontend | `8505` | `3001` | Application state is held in Oracle |
| `db` | Oracle AI Database Free with relational, JSON, Vector, Graph, Spatial, OML, VPD, In-Memory, and audit objects | `1521` | `1521` | Named volume `oracle-data` |
| `ords` | ORDS service retained in the topology | `8181` | `8080` | Named volume `ords-config` |
| `ollama` | Local model runtime retained for the conversational surfaces | `11434` | `11434` | Named volume `ollama-models` |

The application is available at `http://localhost:8505`. Its health endpoint is `http://localhost:8505/api/health`.

ORDS-owned APIs, native Select AI, and native Agents are deferred from the current acceptance wave, but the `ords` and `ollama` services remain required by the immutable startup topology.

## Prerequisites

- A running Podman machine with `podman compose` support.
- Access to the Oracle Container Registry images declared in [compose.yml](compose.yml), including any required sign-in or license acceptance.
- Network access to pull the Node, Oracle ORDS, Ollama, and Oracle Database images, the configured Ollama model, and the configured ONNX embedding model.
- Available host ports `8505`, `1521`, `8181`, and `11434`.
- `curl` for the health check.
- A dependency-complete, Podman-controlled test environment for the regression commands. The recorded test policy does not use or repair the host npm cache.

Use this stack as an isolated local or controlled demo. It is not a production authorization reference.

## Quick start with Podman

Run these commands from the directory containing `compose.yml`:

```bash
cp .env.example .env
./scripts/podman-stack.sh config
./scripts/podman-stack.sh up -d --build
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

Before startup, review `.env` and replace the demo passwords and any environment-specific URLs. The controlled deployment archive carries `.env` byte-identical to `.env.example`; treat both files as controlled configuration and never commit locally modified secrets.

Initial database bootstrap can take several minutes. `app` starts only after `db`, `ords`, and `ollama` pass their health checks.

Use `scripts/podman-stack.sh` for every Compose lifecycle command. It supplies `--project-name livestack-hightech` outside the immutable Compose file; running bare `podman compose` would derive an unstable project name from the checkout directory.

Open:

- Application: `http://localhost:8505`
- API health: `http://localhost:8505/api/health`
- ORDS: `http://localhost:8181/ords/`
- Ollama API: `http://localhost:11434`

## Configuration

The following variables are consumed by the immutable compose/runtime contract. Sensitive values are intentionally not reproduced here.

| Variable | Compose default or expectation | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Application runtime mode |
| `PORT` | `3001` | Application port inside the container |
| `FRONTEND_URL` | `http://localhost:8505` | Expected browser origin |
| `APP_PORT` | `8505` | Published application port |
| `DBPORT` | `1521` | Published database port and internal database port |
| `ORDS_PORT` | `8181` | Published ORDS port |
| `OLLAMA_PORT` | `11434` | Published Ollama port |
| `ORACLE_DB_IMAGE` | Oracle Database Free `23.26.1.0` image | Database container image |
| `ORDS_IMAGE` | Oracle ORDS `latest` image | ORDS container image |
| `OLLAMA_IMAGE` | Ollama `latest` image | Ollama container image |
| `ORACLE_USER` | `LIVESTACK` | Application schema owner |
| `ORACLE_USER_PWD` | Demo-only ORDS database-user password | Required by current ORDS container images during initial installation |
| `ORACLE_PWD` | Demo-only default in `compose.yml`; change it | Oracle administrative password |
| `APP_SCHEMA_PASSWORD` | Demo-only default in `compose.yml`; change it | Application schema password |
| `ORACLE_CHARACTERSET` | `AL32UTF8` | Database character set |
| `ORACLE_CONNECTION_STRING` | `db:1521/FREEPDB1` | Application-to-database connection |
| `CONN_STRING` | `db:1521/FREEPDB1` | ORDS database connection |
| `DBHOST` | `db` | ORDS database host |
| `DBSERVICENAME` | `FREEPDB1` | Oracle pluggable database service |
| `ORACLE_POOL_MIN` | `2` | Minimum application pool size |
| `ORACLE_POOL_MAX` | `10` | Maximum application pool size |
| `ORACLE_POOL_INCREMENT` | `1` | Pool growth increment |
| `ONNX_MODEL_FILENAME` | `all_MiniLM_L12_v2.onnx` | Embedding-model filename used by database bootstrap |
| `ONNX_MODEL_URL` | Compose-provided OCI object URL | Source used to download the ONNX model; override only with a controlled equivalent |
| `OLLAMA_HOST` | `0.0.0.0:11434` | Ollama listener inside its container |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | Application-to-Ollama URL |
| `OLLAMA_MODEL` | `llama3.2` | Model pulled and checked by the Ollama service |
| `DEMO_ANCHOR_DATE` | Blank | Optional explicit demo-date anchor |
The controlled ONNX model-distribution URL remains in the immutable runtime configuration; do not duplicate its value in logs, screenshots, support tickets, or release documentation.

## Restore Demo Data

`Restore Demo Data` is a destructive dataset replacement. Use the `admin_jess` demo persona and run it only against an isolated test/demo database.

The visible workflow:

1. Open **Data Foundation** or the dataset administration entry.
2. Select the Admin demo persona.
3. Validate or preview the bundled restore where that control is offered.
4. Press **Restore Demo Data**.
5. The API accepts an asynchronous job and the frontend polls `/api/import/status/:jobId`.
6. The workflow reloads the bundled data, re-anchors time-sensitive rows, rebuilds required derived artifacts, checks feature readiness, and refreshes visible counts.
7. A terminal job is shown as `completed` or `failed`; a failed required feature must not be represented as successful.

The mutation API requires the explicit dataset-mutation intent header and the active Admin demo persona, and it rejects supplied cross-origin browser signals. These controls reduce accidental mutation; they are not user authentication.

High Tech wave-1 acceptance has live proof for the guarded browser Restore, feature-readiness gate, concurrent `409`, durable job persistence, interrupted-job recovery, and retained-volume restart. The detailed JSON, plan, and screenshot evidence is retained by the release orchestrator outside the deployment archive.

## Demo identities and security boundary

| Persona | Role and scope | Intended demonstration |
|---|---|---|
| `admin_jess` | Admin, global | Full demo visibility and dataset administration |
| `analyst_raj` | Analyst, global | Global read/analytics visibility |
| `fm_west_maria` | Fulfillment manager, California | Regional operational rows |
| `fm_east_dave` | Fulfillment manager, New Jersey | Regional operational rows |
| `fm_south_keisha` | Fulfillment manager, Georgia | Regional operational rows |
| `merch_tom` | Product planner, restricted | No regional operational rows |
| `viewer_sam` | Viewer, restricted | Fail-closed restricted view |

`inactive_audit` is an inactive security fixture and must be rejected.

Important threat-model boundary:

- `X-Demo-User` is a caller-controlled demo persona switch. It is not authentication and does not prove that the caller is entitled to use that persona.
- Oracle validates that the named persona is active and derives its role, region, and scope for the application context and VPD policies.
- A missing header maps to the restricted `viewer_sam` persona. Explicit empty, malformed, unknown, or inactive identities are rejected with `403`. Identity-resolution failure returns `503`.
- The user switcher and mutation-intent header are demonstration controls, not production authorization.
- This design is suitable for isolated local demos or a separately protected environment. Do not expose it as shared production authorization. A shared deployment requires an external trusted authentication/session boundary that binds the caller to an allowed persona.

## Oracle feature evidence matrix

No source check alone proves a feature end to end. A feature is accepted only when its database execution, API behavior, and rendered UI evidence are recorded in the orchestrator's `validation/test-evidence.md`.

| Feature | Database evidence | API evidence | UI evidence | Explicit unavailable behavior | Current recorded state |
|---|---|---|---|---|---|
| Application Context and VPD | Private `HIGHTECH_APP_CTX`, trusted package, `DBMS_RLS` policies, DML `update_check`, role/region matrix | Protected routes execute with the Oracle-derived persona; sequential and concurrent pool isolation passed | Dashboard, Fulfillment, Graph, OML, and Data Foundation identity-switch regressions passed | Missing persona is restricted; unknown/inactive is `403`; identity infrastructure failure is `503` | **GREEN** — adversarial DB, API, concurrency, and browser evidence passed |
| JSON-relational duality | Read-only keyed `PRODUCTS_INVENTORY_DV` and `ORDERS_DV` native duality views | `/api/products/:id/duality` and `/api/orders/:id/duality` return direct native-view provenance with relational cardinality parity | Product detail and Customer Commitments render native source and executed SQL | Native-view errors return `503` with `NATIVE_DUALITY_VIEW_UNAVAILABLE` | **GREEN** — native metadata, API parity, and both browser scenes passed |
| AI Vector Search | `VECTOR(384,FLOAT32)`, `ALL_MINILM_L12_V2`, native VECTOR indexes, cosine distance | Readiness and both search routes prove dimensions, model, deterministic ranking, invalid-input `400`, and actual-plan status | Enterprise Buyer Signal Monitor renders Oracle vector provenance and honest plan status | Missing catalog/model/index assets return `503`; VPD-scoped empty data returns `200` with `SCOPED_NO_VISIBLE_VECTOR_DATA` | **GREEN** — native execution passed; the representative plan returned no index operator, so no index-use claim is made |
| Property Graph | `TECH_PRODUCT_SIGNAL_NETWORK`, `USER_PROPERTY_GRAPHS`, SQL/PGQ `GRAPH_TABLE` execution | Readiness plus five example queries return the exact executed SQL/PGQ provenance | Product Signal Graph renders native source, results, and scoped findings | Missing metadata or failed probe returns `503` with `NATIVE_PROPERTY_GRAPH_UNAVAILABLE` | **GREEN** — metadata, traversal, Restore data, VPD, API, and browser evidence passed |
| Oracle Spatial | `SDO_GEOMETRY`, valid `IDX_FC_SPATIAL`, `SDO_NN` candidates, exact `SDO_GEOM.SDO_DISTANCE`, same-session `DBMS_XPLAN` | Readiness and nearest routes prove a real `DOMAIN INDEX` operation, non-empty indexed probe, exact ranking, and invalid-input `400` | Supply & Commitment Map renders `ACTIVE` plus indexed/exact stages | Missing plan/index or an empty probe produces `INCOMPLETE` and the UI renders unavailable | **GREEN** — fresh bootstrap, retained restart, API, plan, and browser evidence passed |
| Oracle Machine Learning | Four named mining models in `USER_MINING_MODELS`, persisted scoring, refresh log | Model lifecycle and result routes expose actual `PREDICTION`, `PREDICTION_PROBABILITY`, and `CLUSTER_ID` execution | Oracle Machine Learning Product Intelligence renders the four active models and exact API trend values | A real missing-model state returned `503` with `OML_CAPABILITY_UNAVAILABLE`, rendered an unavailable alert, and displayed no substitute predictions | **GREEN** — four-model scoring, persistence, app/DB restart, forced missing-model failure, browser fail-closed state, and successful rebuild all passed |
| Native JSON | Native `JSON` columns, `JSON_VALUE`, `JSON_QUERY`, and `JSON_SERIALIZE`; one product document per product | `/api/demo/native-json-readiness` reports `ACTIVE` and reconciled counts after fresh bootstrap, Restore, and restart | Data Foundation rendered current `ACTIVE` readiness during the destructive lifecycle test | Invalid JSON is rejected by Oracle and rolled back; required readiness failure blocks dataset activation | **GREEN** — fresh, Restore, invalid-data, app restart, retained-volume, API, and browser evidence passed |
| Database In-Memory | Four populated segments and actual `TABLE ACCESS INMEMORY FULL` plan evidence | `/api/dashboard/inmemory` reports Oracle catalog and same-request cursor-plan evidence | Product & Commitment Control Tower renders the live readiness state | Missing catalog/plan evidence cannot be labeled active; unavailable evidence returns `503` | **GREEN** — fresh and retained-restart catalog/plan/API evidence passed |
| Unified Audit | Admin-owned `HIGHTECH_ORDER_AUDIT`, exact protected actions, `UNIFIED_AUDIT_TRAIL`, no persistent `AUDIT_ADMIN` on app owner | No API evidence is claimed in this wave | No browser evidence is claimed in this wave | Conflicting policy definition fails bootstrap; verifier proves both successful and VPD-denied audited actions | **GREEN** — policy, least privilege, allowed action, denied action, and retained-restart trail checks passed |
| Dataset lifecycle | Oracle-backed jobs, singleton lease, readiness/version state, atomic activation | Guarded Restore, concurrent `409`, durable status, deprecated non-mutating legacy route | Data Foundation Restore/readiness flow and terminal states passed | Interrupted jobs fail with `APPLICATION_RESTART`; a forced required-feature failure preserved the active version and a subsequent Restore recovered all features | **GREEN** — success, feature failure, concurrency, job persistence, app recovery, retained-volume cycle, and recovery Restore passed |

## Test-driven validation and regression

The commands below are package scripts declared in [package.json](package.json) and are executed from the source/orchestration workspace in a dependency-complete Podman test environment. To preserve the Manufacturing deployment-archive spine, the clean ZIP excludes the `verification/` harness and its evidence; run these gates from the maintained source checkout, not from the extracted deployment ZIP. The orchestrator's `validation/test-evidence.md` records the accepted run against the current source and archive.

### Source and contract gates

```bash
npm run verify:dataset-mutation-auth
npm run verify:vpd-security
npm run verify:vpd-role-matrix
npm run verify:vpd-context
npm run verify:spatial-index-contract
npm run verify:native-graph-contract
npm run verify:native-duality-contract
npm run verify:native-vector-contract
npm run verify:native-oml-contract
npm run verify:native-json-contract
npm run verify:durable-dataset-lifecycle
npm run verify:inmemory-contract
npm run verify:unified-audit-contract
npm run verify:ml-persistence
npm run verify:podman-identity
```

### Live non-destructive gates

Start with a healthy isolated stack. Browser gates require Playwright and Chromium in the test environment. Direct database gates require the Oracle connection variables from a secure test configuration.

```bash
HIGHTECH_SPATIAL_BASE_URL=http://localhost:8505 npm run verify:live-spatial-index
HIGHTECH_GRAPH_BASE_URL=http://localhost:8505 npm run verify:live-native-graph
HIGHTECH_DUALITY_BASE_URL=http://localhost:8505 npm run verify:live-native-duality
HIGHTECH_VECTOR_BASE_URL=http://localhost:8505 npm run verify:live-native-vector
HIGHTECH_BASE_URL=http://localhost:8505 npm run verify:vpd-adversarial
HIGHTECH_BASE_URL=http://localhost:8505 npm run verify:vpd-browser-adversarial
npm run verify:live-inmemory
```

### Stateful, restart, negative, and destructive gates

Use disposable data or a recoverable snapshot. These commands can restore data, restart the application, create audit-trail evidence, or depend on a deliberately incomplete negative deployment.

```bash
HIGHTECH_E2E_BASE_URL=http://localhost:8505 npm run verify:live-hightech-e2e
RESTORE_FRESHNESS_BASE_URL=http://localhost:8505 npm run verify:live-restore-freshness
A_PLUS_BASE_URL=http://localhost:8505 A_PLUS_RESTORE=1 npm run verify:live-a-plus-acceptance
npm run verify:live-unified-audit
npm run verify:live-native-oml
```

Before the OML command, set `HIGHTECH_OML_BASE_URL`, `HIGHTECH_APP_CONTAINER`, and `HIGHTECH_OML_UNAVAILABLE_BASE_URL` to real isolated targets. The last variable must identify a separate deployment deliberately missing a required model; none is invented by this README. The broad A+ script also exercises deferred Select AI and agent surfaces, so it is not by itself the wave-1 acceptance decision.

## Clean deployment, restart, and package verification

### Retained-volume restart

This preserves Oracle, ORDS, and Ollama named volumes:

```bash
./scripts/podman-stack.sh down --remove-orphans
./scripts/podman-stack.sh up -d
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

After restart, run the persistence and browser gates relevant to the change. In particular, OML persisted results, dataset-job reconciliation, VPD identity isolation, and UI readiness must not regress.

### Fresh-volume deployment

This deletes the current stack volumes and all demo data. Use it only against the isolated pilot:

```bash
./scripts/podman-stack.sh down --volumes --remove-orphans
./scripts/podman-stack.sh up -d --build
./scripts/podman-stack.sh ps
curl --fail http://localhost:8505/api/health
```

Fresh-volume acceptance requires bootstrap, database feature, API, browser, Restore, retained-volume restart, and regression evidence.

### Package verification

The release archive is named `livestack-hightech.zip`. Its exact path, SHA-256, entry manifest, integrity result, forbidden-file scan, and extracted-archive deployment result are recorded by the release orchestrator because an archive cannot embed its own final checksum without changing it.

The package carries `.env` byte-identical to the controlled `.env.example`, matching the established LiveStack deployment convention. It must contain no additional local secrets and must exclude `.DS_Store`, `ip.md`, `node_modules`, generated frontend output, the `verification/` harness and evidence, caches, logs, and nested ZIP files. It includes `compose.yml`, `Containerfile`, application sources, database/bootstrap assets, package lockfiles, the stable launcher, and this README.

## Troubleshooting

### A service does not become healthy

```bash
./scripts/podman-stack.sh ps
./scripts/podman-stack.sh logs db
./scripts/podman-stack.sh logs ords
./scripts/podman-stack.sh logs ollama
./scripts/podman-stack.sh logs app
```

Check registry access, accepted Oracle image terms, model-download access, and port conflicts. Although ORDS-owned APIs, Select AI, and native Agents are deferred, the immutable topology still requires `ords` and `ollama` to become healthy before `app` starts.

### The application is not on the documented port

The canonical app port is `8505`. Check `APP_PORT` in `.env` and the resolved mapping:

```bash
./scripts/podman-stack.sh config
./scripts/podman-stack.sh ps
```

### `/api/health` returns `503`

The health check requires an Oracle connection and a valid global application-context proof. Inspect `db` and `app` logs. Do not replace the failing proof with a static success response.

### Vector, Graph, Duality, OML, Spatial, or In-Memory is unavailable

Use the feature readiness endpoint and its test:

- Vector: `/api/social/vector-readiness`
- Graph: `/api/graph/readiness`
- Spatial: `/api/fulfillment/spatial-readiness`
- OML: `/api/ml/models/status` and `/api/ml/persistence/status`
- In-Memory: `/api/dashboard/inmemory`
- Duality: `/api/products/:id/duality` and `/api/orders/:id/duality`

An unavailable feature is a failed acceptance gate; do not relabel fallback output as native Oracle execution.

### Restore does not complete

Check the job returned by `/api/import/status/:jobId` and `app` logs. A required Vector, Graph, Spatial, native JSON, OML, VPD, or lifecycle-readiness failure must remain visible as a failed job. Do not use another mutating endpoint to repair the data before collecting failure evidence.

## Archive layout

The intended stack root is:

```text
.
├── compose.yml
├── Containerfile
├── .env
├── .env.example
├── README.md
├── package.json
├── package-lock.json
├── backend/
├── db/
│   ├── data/
│   └── schema/
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   └── src/
└── scripts/
```

Runtime volumes, dependencies, frontend build output, logs, and test artifacts are not archive content. The packaged `.env` and `.env.example` are an intentionally identical controlled deployment baseline; local modifications are not release content.

## Deferred wave-1 acceptance

The following capabilities are present in the application/runtime but excluded from High Tech wave-1 feature acceptance:

- ORDS-owned APIs;
- native Select AI; and
- native Agents.

Their services and code paths may remain available, and the immutable topology is unchanged. They must not be counted as passed Oracle features in this wave, and their behavior must not mask failures in the accepted database, API, frontend, Restore, or security gates.

Current release status is governed by the orchestrator's acceptance matrix, test evidence, and launch checklist outside the deployment archive. High Tech wave-1 runtime acceptance is green for the complete in-scope feature set, including the forced OML/required-feature failure, browser fail-closed state, and successful recovery Restore.
