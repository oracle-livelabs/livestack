# Data and application flow

## Database boundary

- The Express application pool and lakehouse integrations target the same wallet-backed Autonomous Database `PG` schema. `init/adb-wallet.sh` provisions the wallet, and `init/adb-load.sh` creates and verifies the app, graph, vector, and warehouse data before the app starts.
- The ADB loader is for a fresh dedicated ADB. It refuses to replace an existing `PG` schema; a release update does not rerun schema creation.
- `netsuite-db` remains a local Oracle Free CDC source, separate from the ADB app pool.
- On this ADB release, `DBMS_CLOUD` resolves through a public synonym to a versioned package. Select AI readiness checks must recognize accessible package synonyms. The native agent teams require five PG PL/SQL tool functions created after the core data load.
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
