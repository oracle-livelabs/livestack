# Manufacturing Operations LiveStack

Manufacturing Operations is an Oracle AI Database 26ai LiveStack for investigating production risk, supplier dependencies, plant capacity, work-order demand, and governed recovery actions. The application uses synthetic demonstration data and runs as a four-service Podman Compose stack.

## Operator workflow

The application presents a ten-scene manufacturing operations journey:

1. Welcome and guided AX-400 recovery story
2. Data Foundation and active dataset readiness
3. Operations Command Center
4. Production Signal Monitor
5. Manufacturing Risk Graph
6. Plant Capacity and Routing Map
7. Work Orders
8. OML Demand and Capacity Analytics
9. Ask Manufacturing Data
10. Manufacturing Agent Console

The top-right **Use Your Own Manufacturing Data** control opens the governed dataset manager. The right-side **Oracle Internals** rail explains the Oracle objects, SQL, PL/SQL, security context, and live evidence associated with the active scene.

## Oracle AI Database capabilities

- **JSON Relational Duality:** Direct, read-only manufactured-part, work-order, inventory, and plant-capacity documents over live relational data.
- **AI Vector Search:** Oracle `VECTOR(384)` embeddings, cosine similarity, and neighbor-partition vector indexes for matching production signals to manufactured parts.
- **SQL Property Graph:** A typed `MANUFACTURING_PRODUCTION_NETWORK` queried with native `GRAPH_TABLE` SQL/PGQ traversal.
- **Oracle Spatial:** WGS-84 `SDO_GEOMETRY` points and polygons, R-tree indexes, `SDO_NN` candidate selection, exact geodetic distance ranking, GeoJSON conversion, and capacity zones.
- **Oracle Machine Learning:** Four persisted `DBMS_DATA_MINING` models for demand classification, customer-account segmentation, work-order value regression, and manufactured-part clustering.
- **Virtual Private Database:** A private `MANUFACTURING_APP_CTX`, database-backed demo identities, fail-closed `CONTEXT_SENSITIVE` policies, and connection-pool context cleanup.
- **Database In-Memory:** Four manufacturing analytic tables populated in the In-Memory Column Store with runtime `TABLE ACCESS INMEMORY FULL` plan evidence.
- **Native JSON and Unified Auditing:** JSON event records, application action history, and an enabled unified audit policy for governed work-order and agent-action changes.

## Runtime architecture

| Service | Published port | Purpose |
|---|---:|---|
| `db` | `1521` | Oracle AI Database Free, schema provisioning, seed data, security, vectors, graph, Spatial, duality, OML, and In-Memory assets |
| `ords` | `8181` | ORDS runtime and schema enablement |
| `ollama` | `11434` | Local `llama3.2` model used by Ask Manufacturing Data and the application-layer agent experience |
| `app` | `8505` | Node.js/Express API and built React/Oracle JET frontend |

The application currently serves its business APIs through Express and a pooled Oracle connection. ORDS is deployed and the application schema is enabled, but custom ORDS application modules are not yet the primary API path.

Ask Manufacturing Data uses Ollama to generate or explain governed, read-only Oracle SQL; Oracle executes the validated SQL under the active VPD identity. Optional `DBMS_CLOUD_AI` profile provisioning can be enabled for supported OCI configurations, but it is not the default application runtime. The Agent Console similarly uses application-layer orchestration with Oracle SQL and PL/SQL tools rather than an active `DBMS_CLOUD_AI_AGENT` team.

## Run locally

Prerequisites:

- Podman
- A Compose provider supported by `podman compose`
- Sufficient memory and disk for Oracle AI Database Free, ORDS, Ollama, and the application image

Start the complete stack:

```bash
podman compose up -d --build
```

The first clean start provisions Oracle and downloads the configured ONNX and Ollama models. Monitor startup with:

```bash
podman compose ps
podman compose logs -f db ords ollama app
```

When all four services are healthy, open:

- Application: `http://localhost:8505/`
- Health endpoint: `http://localhost:8505/api/health`
- ORDS: `http://localhost:8181/ords/`

Stop the stack without deleting persisted data:

```bash
podman compose down
```

Removing the Oracle volume destroys the provisioned database and should only be done when an intentional clean rebuild is required.

## Provisioning and readiness

`scripts/bootstrap_db.sh` owns the versioned database state machine. A clean database is published as ready only after the required relational data, duality views, graph, Spatial assets, vector artifacts, OML models, VPD policies, audit policy, and In-Memory evidence pass validation.

The current readiness marker is `READY:2026.07.02.1`. A partial, failed, or mismatched schema fails closed instead of being silently patched or reported as healthy. Moving an existing deployment to this schema version requires an intentional clean database-volume rebuild.

Spatial readiness executes a tagged two-stage nearest-routing query, captures its SQL ID, and requires `DBMS_XPLAN` evidence of the `IDX_FC_SPATIAL` domain-index path before the stack can publish `READY`.

## Demo identities and data administration

Demo identities are stored in Oracle `APP_USERS`. Requests without an explicit demo identity use the restricted `viewer_sam` context; the browser initializes with the Oracle-backed `admin_jess` demonstration identity.

Dataset validation is non-mutating. Upload and Restore execution require:

- an active Oracle-backed Admin demo identity
- explicit same-origin dataset-command intent
- successful archive, schema, type, key, and cross-table validation

A successful dataset replacement runs a governed release workflow that rebuilds and validates relational rows, Spatial points/routes/zones, vector embeddings and matches, the manufacturing graph, all four OML models, dataset state, and demo-date metadata. The API reports the dataset ready only after the required checks pass.

## Configuration

The checked-in `.env.example` documents the available local settings. Copy it to `.env` only when overrides are required:

```bash
cp .env.example .env
```

Important settings include:

- Oracle and application schema credentials
- container image overrides
- ONNX model URL, filename, and SHA-256 checksum
- Ollama host and model
- Oracle connection-pool sizing
- optional usage telemetry
- optional `ENABLE_SELECT_AI=true` configuration for supported OCI environments

Do not commit production credentials or customer secrets.

## Verification

The repository includes focused source, provisioning, runtime, security, Restore, feature, browser, and accessibility checks under `verification/`.

Useful aggregate commands include:

```bash
npm run verify:manufacturing-source-contracts
npm run verify:manufacturing-provisioning
npm run verify:manufacturing-restore
npm run verify:manufacturing-ui-regression
npm run verify:manufacturing-live-e2e
```

Runtime checks require a healthy Manufacturing stack and the environment variables documented by the individual verification scripts. `npm run build` builds the frontend when a local production bundle is required.

## Repository layout

```text
backend/       Express server, request identity, import workflow, and Oracle-backed APIs
db/schema/     Relational, duality, graph, vector, Spatial, security, OML, and In-Memory DDL
db/data/       Synthetic Manufacturing data and feature-finalization scripts
frontend/      React, Oracle JET, Redwood-inspired application UI
scripts/       Database bootstrap, ORDS enablement, and Ollama model startup
verification/  Source, runtime, security, feature, Restore, browser, and release checks
compose.yml    Four-service Podman Compose definition
Containerfile  Application image build
```

## Current boundaries

- The data and identities are synthetic and intended for demonstration use.
- Express/direct Oracle access remains the application API path; custom ORDS modules are future work.
- Ask Manufacturing Data and Agent Console use Ollama-backed application logic by default, not native Select AI Agent execution.
- Unified Audit policy provisioning is validated, but the visible Agent Console history comes from application-owned `AGENT_ACTIONS`, not a user-facing `UNIFIED_AUDIT_TRAIL` reader.
- OML model rebuilding performs Oracle model lifecycle operations and an internal commit; fully atomic rollback across every dataset and model phase remains a future hardening item.
