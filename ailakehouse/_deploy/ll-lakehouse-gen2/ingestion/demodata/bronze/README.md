# PeakGear Bronze Demo Data

This folder contains small raw landing-zone files for the AI Data Lakehouse demo. The data is intentionally shaped like source extracts that a solution engineer can upload to Object Storage and load into Autonomous Database with Data Studio before processing it into Silver and Gold tables.

The rows line up with the current PeakGear gold seed data, especially the `SKU-100xxx` products from `pg-stack/db/data/load_gold_seed.sql`. The files keep raw source-system imperfections so the Process step has a realistic job to do.

## Files

| File | Source story | Demo use |
| --- | --- | --- |
| `product_master_raw.csv` | Databricks/PIM product master extract | Standardize product names, categories, tags, prices, and duplicate SKU updates |
| `orders_pos_raw.csv` | POS and web order-line feed | Build order facts, validate line totals, connect signal-driven demand to products |
| `inventory_snapshot_raw.csv` | Store and warehouse inventory snapshot | Identify low stock, reserved inventory pressure, and incoming replenishment |
| `demand_signals_raw.jsonl` | Social listening, store operations, search, and partner signals | Parse semi-structured events into demand signals and criticality metrics |
| `product_images_manifest_raw.csv` | Object Storage image catalog manifest | Demonstrate catalog enrichment, missing image checks, and image-quality governance |

## Bronze To Silver To Gold Story

1. Ingest the raw files from Object Storage into landing tables.
2. Process and clean the feeds: uppercase SKUs, trim product names, deduplicate latest product records, normalize categories, parse JSON metrics, and validate order line totals.
3. Curate Gold outputs for the app: Product 360, demand signal velocity, fulfillment readiness, image completeness, and AI-ready product/search features.

## Intentional Raw Issues

- Duplicate product records for `SKU-100007`, `SKU-100033`, and `SKU-100083` with later source timestamps.
- Mixed-case SKU and category values such as `sku-100009`, `OUTDOOR`, and `winter`.
- Product names with repeated spaces that should be trimmed for Gold presentation.
- Low-stock inventory for trail, outdoor, and water-sports items that have high demand signals.
- Image manifest rows with `missing`, `low_resolution`, and `needs_crop` quality states.
