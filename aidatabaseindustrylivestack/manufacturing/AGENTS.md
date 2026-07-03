# Manufacturing LiveStack Contributor Guide

This directory is a complete Oracle LiveLabs deliverable: a guided manufacturing demo, its screenshots and workshop manifest, and a portable Oracle AI Database application. Keep the business story, UI, API, database contracts, and runnable package aligned.

## Repository map

- `introduction/`, `scene-*/`, `download-livestack/`, and `conclusion/` are the participant-facing LiveLabs guide. Each scene has its own `images/` directory.
- `workshops/sandbox/manifest.json` is the workshop navigation and must point at the correct guide files.
- `stack/manufacturing/` is the portable application:
  - `frontend/` is the React 18 + Vite single-page application.
  - `backend/` is the Express API and Oracle connection/security layer.
  - `db/schema/` defines Oracle objects and database features; `db/data/` provides the synthetic demo dataset and import seed assets.
  - `scripts/bootstrap_db.sh` is the authoritative provisioning orchestrator; `compose.yml` runs Oracle Database, ORDS, Ollama, and the application.
- `stack/livestack-manufacturing.zip` is a published portable artifact. Rebuild it only when the task explicitly includes refreshing the distributable, and ensure it matches `stack/manufacturing/`.

## Local development and validation

Run application commands from `stack/manufacturing/`. Node.js 20 or later is required.

```bash
npm ci
(cd frontend && npm ci)
npm run build
podman compose up -d --build
curl -fsS http://localhost:8505/api/health
```

- The containerized app is served at `http://localhost:8505`; the health check is `/api/health`. The stack’s README currently mentions port 8508, but `compose.yml` and `.env.example` define the authoritative default, 8505.
- Use `npm run dev` for the local backend/frontend development servers. They need a reachable Oracle database configured through environment variables.
- For frontend-only changes, run `npm run build`. Also run relevant `verify:*` scripts when their implementation is present. This checkout’s `package.json` lists many `verification/` scripts but the `verification/` directory is absent, so report that limitation rather than treating a missing-script failure as a product regression.
- For database, security, import, or container changes, validate a clean Podman provision only when the task authorizes the time and resource use. Never run `podman compose down -v` or otherwise delete database volumes without explicit user approval.

Do not commit `.env`, wallets, ONNX model binaries, `node_modules/`, `frontend/dist/`, local `.data/`, or other ignored runtime material. Start from `.env.example`; it contains defaults intended for the portable demo, not production secrets.

## Frontend conventions

- Pages live in `frontend/src/pages/`; shared controls and explanation surfaces belong in `frontend/src/components/`; API helpers and data loading are in `src/utils/api.js` and `src/hooks/useData.js`.
- Add page navigation in `frontend/src/App.jsx`. This SPA uses `?page=<id>` and its `PAGES` map, not React Router.
- Preserve the Oracle Redwood-inspired system in `frontend/src/styles/index.css`. Reuse existing JET wrappers in `components/JetControls.jsx`, CSS variables, controls, and established component patterns. Prefer the existing Recharts and React Leaflet libraries instead of adding UI or charting frameworks.
- Keep UI copy operational, manufacturing-specific, and demo-safe: production signals, parts, suppliers, plants, work orders, capacity, quality, and governed data. The seed data is synthetic. Do not claim real operational outcomes, compliance, savings, or production readiness unless the implementation proves them.
- Maintain accessibility: semantic controls, labels, keyboard/focus behavior, and adequate contrast are part of the existing UI contract.

## Backend and Oracle boundaries

- Preserve the `/api` route structure in `backend/server.js` and use parameter binds in SQL. Keep API response shapes compatible with the consuming page before changing a route.
- All normal request data access must use `db.executeAsUser()` or `db.withUserConnection()` so the Oracle manufacturing application context and VPD policies are set and cleared on the same pooled connection. `executeSystem()` is reserved for intentional administrator-level checks.
- Do not bypass `requireDemoIdentity`, request identity handling, request-path policy, import command middleware, or dataset-operation locking. These safeguard demo roles, import/restore behavior, and pooled-session isolation.
- Treat imports as a cross-layer contract. Changes to accepted CSV tables, columns, IDs, or relationships normally require coordinated updates to `backend/lib/importCatalog.js`, import invariants/workflow code, seed CSVs, schema/data SQL, API/UI text, and the Scene 11 guide.

## Database and provisioning rules

- Preserve the ordering in `scripts/bootstrap_db.sh`; it explicitly sequences base schema, features, data, security/application context/VPD, and runtime objects. Do not execute individual schema files out of order against a shared or existing demo database.
- Clean provisioning is intentionally fail-closed. A provisioning-version or schema change must be coordinated with `PROVISIONING_VERSION`, the compose health-check marker, schema/data scripts, and the relevant runtime/readiness checks. Existing volumes are not silently migrated or repaired.
- Keep inherited physical object names (for example `products`, `brands`, `influencers`, and `fulfillment_centers`) where portability/importer compatibility depends on them; translate their manufacturing role in user-facing copy instead of casually renaming database contracts.
- Keep seed data internally consistent across relational, JSON duality, vector, graph, spatial, OML, VPD, and demo-date features. Update downstream loaders/finalizers and validation SQL when changing their source data.

## LiveLabs guide and release content

- Follow the existing scene format: title, introduction, estimated time, overview screenshot, objectives, numbered task sections, and credits/build notes.
- Use concise, actionable steps that match the shipped UI exactly. Keep the AX-400 recovery narrative, scene order, feature names, screenshots, and `workshops/sandbox/manifest.json` in sync.
- Store scene images in that scene’s `images/` folder and use relative Markdown paths with meaningful alt text. Check that each changed image reference resolves locally.
- When changing the portable runtime, update the Take It Home instructions and README if user-visible commands, ports, prerequisites, or environment variables change.

## Handoff

Summarize changed files and user-visible effects. List the exact validation commands run and their outcomes; state any skipped checks and why, especially when they need containers, credentials, absent verification scripts, or destructive reprovisioning.
