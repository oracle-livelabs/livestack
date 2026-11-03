# Data and application flow

## Database boundary

- The Express application pool targets the local Oracle AI Database Free Compose service (`db:1521/FREEPDB1` in the stack). The app bootstrap creates its application schema/data there.
- Wallet-backed Autonomous Database is a separate cloud database path. `init/adb-wallet.sh` handles wallet setup; `init/adb-load.sh` uses SQLcl for ADB setup. ADB streaming and analytics configuration consumes its own connection and wallet settings. Do not treat the local app pool and ADB connection as interchangeable.
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
