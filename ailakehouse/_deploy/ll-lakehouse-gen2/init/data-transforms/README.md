# Packaged Data Transforms projects

`peakgear-medallion.json` is a portable version of the `peakgear_medallion`
project exported from the PG Data Transforms environment on 2026-09-25, with
the five updated cleanse expressions and Gold source attribute selection from
the 2026-10-19 XML export. It contains:

- Three flows: `df_01_enriched_sales_expressions`, `df_02_enriched_sales_cleanse`,
  `df_03_gold_west_product_performance`.
- One data load: `dl_silver_enriched_sales`.
- Four workflows: `wf_01_raw_to_bronze`, `wf_02_bronze_to_silver`,
  `wf_03_silver_to_gold`, `wf_medallion_architecture`.
- Two project variables and eight PG table/view prerequisites.

## Provisioning

`pg-medallion-project.service` runs after the existing connection/project setup
and optional AI Catalog bronze seed. It creates missing objects only, uses the
new deployment's Oracle and `pg-aicat` connections, and fills the catalog URL and
PG password variables from the deployment environment. No source-environment
password, endpoint or object ID is packaged. Access to the Data Transforms
repository should remain restricted because the project's password variable is
populated there at runtime, just as in the source project.

The existing `peakgear` project definition is unchanged. Its reset routine now
skips destructive shared-metadata cleanup whenever `peakgear_medallion` exists,
protecting both projects on later boots. The new service never calls that reset
function. It is stopped during
custom-image preparation and runs again on each new VM; it has no baked completion
marker. Repeat runs preserve user edits and skip existing objects.

AI Catalog must be enabled and its URL available; otherwise the additional
catalog-dependent project is skipped. `DATA_TRANSFORMS_MEDALLION_AUTO_CREATE=false`
also disables it. Failures retry independently without blocking the frontend.

The bootstrap creates missing PG tables without data and creates bronze views
against `PG_AICAT`. Before Silver exists, `ailh_enriched_sales_v` is a
shape-compatible view of the local staging result. Workflow 3 replaces it with
the Silver catalog view, using the exported SQL. Existing database objects are
never replaced by provisioning. A separate medallion model imports missing data
entities, and the Silver namespace is created if absent.

Provisioning **does not execute workflows**. The exported workflows retain their
original destructive demo actions (recreating target tables and clearing the
Silver Iceberg table). These actions happen only when a user runs the workflows.
No additional administrator/drop grants are introduced by this feature.

## Verification and maintenance

Run `python3 tests/test-medallion-project.py`. Packaging checks require the
template, provisioner, wrapper and service.

`scripts/package-medallion-export.py` normalizes sanitized REST project exports
and SQLcl `DBMS_METADATA` JSON into this template. It strips source IDs, generated
execution metadata, credential defaults, storage attributes and generated data-copy
statements. Review exports for embedded secrets before using this maintenance tool.

Live verification created a temporary project and reran provisioning without
duplicates. No workflows were executed. A completely fresh Terraform VM remains
the final end-to-end check for first-boot ordering and its newly provisioned ADB.
