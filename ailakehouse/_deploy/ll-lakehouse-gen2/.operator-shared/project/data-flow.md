# Data and application flow

## Database boundary

- The Express application pool and lakehouse integrations target the same wallet-backed Autonomous Database `PG` schema. `init/adb-wallet.sh` provisions the wallet, and `init/adb-load.sh` creates and verifies the app, graph, vector, and warehouse data before the app starts.
- The ADB loader is for a fresh dedicated ADB. It refuses to replace an existing `PG` schema; a release update does not rerun schema creation.
- `netsuite-db` remains a local Oracle Free CDC source, separate from the ADB app pool.
- On this ADB release, `DBMS_CLOUD` resolves through a public synonym to a versioned package. Select AI readiness checks must recognize accessible package synonyms. `PG_GENAI_PROFILE` serves Ask your Data; `PG_RETAIL_AGENT_PROFILE` serves Retail Operations through OCI Grok 4.3, whose sequential team completed a live ADB test while the Command A profile repeated a successful tool call. Both profiles limit their object lists to `ingestion/db/schema/select_ai_objects.json`; an owner-only `PG` entry widens access to the whole schema. Bootstrap applies table and column comments for those objects before creating profiles, whose `comments` setting reads that metadata. The ADB loader creates the PG PL/SQL tool functions after the core data load, then runs `ingestion/db/schema/08_agents.sql` to create and verify one sequential Retail Operations team with two agents, two tasks, and two tools. The demand task selects a product ID from recent signals; the stock task receives that result and checks inventory for the same ID. The application checks readiness without creating or replacing agent objects. Each team run must create its conversation through `DBMS_CLOUD_AI.CREATE_CONVERSATION` before passing that ID to `RUN_TEAM`. The single-request page disables Oracle's human-question tool on both agents and tasks because it has no conversation-resume flow. If `RUN_TEAM` times out while generating its final answer, the app runs the two registered read-only tools directly in the same VPD user context and labels their answer as an Oracle tool response rather than a completed agent run.
- PostgreSQL and MySQL are standard source services in the Compose stack. MongoDB is optional and enabled through the image-time `AIHUB` setting.

## PeakGear scenario and lakehouse paths

The parent project presents reusable product and demand data across shopper/order, operations, preparation, and streaming workflows. The intended Data Transforms design is one project named `peakgear`, with the medallion objects folded into it. The current bootstrap still provisions a separate `peakgear_medallion` project; reconcile the implementation against this target as tracked in [known gaps](known-gaps.md). The user did not specify a change to workflow execution behavior.

The parent project's general medallion description is:

- Bronze retains source-oriented data and traceability.
- Silver cleans/enriches data for reuse.
- Gold publishes prepared products for consumption.

The specific Iceberg transformation walkthrough reads the Bronze product external table and writes a separate `GOLD_PRODUCTS` result; it preserves the source table. Do not infer that this single walkthrough executes every Bronze/Silver/Gold stage.

## Topic guides

- [Parent introduction and architecture](../../../../introduction/introduction.md)
- [Quickstart scenario](../../../../quickstart/quickstart.md)
- [Bronze-to-Silver walkthrough](../../../../process-bronze-to-silver/process-bronze-to-silver.md)
- [Extended demo](../../../../extended/extended.md)
- [Operations dashboard](../../../../operations-dashboard/operations-dashboard.md)
- [Shopper and product discovery](../../../../peakgear-webshop-and-product-discovery/peakgear-webshop-and-product-discovery.md)
- [Orders and fulfillment](../../../../orders-and-fulfillment-flow/orders-and-fulfillment-flow.md)

For implementation entry points, see the [source map](source-map.md), `ingestion/backend/`, `ingestion/db/`, and `init/`.
