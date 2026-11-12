# AI Catalog bronze seed

These four original workshop CSVs are packaged locally so image provisioning
does not depend on a pre-authenticated download URL remaining valid.

When AI Catalog is enabled and reachable, `pg-ai-catalog-bronze.service` runs
after the application stack. It creates Iceberg copies under `bronze` in the
existing AI Catalog warehouse, then catalog-linked external tables in `PG`:

| Source/catalog table | PG external table | Rows |
| --- | --- | ---: |
| products | EXT_PRODUCTS | 200 |
| store_inventory | EXT_STORE_INVENTORY | 1200 |
| store_locations | EXT_STORE_LOCATIONS | 6 |
| store_sales_transactions | EXT_STORE_SALES_TRANSACTIONS | 80001 |

All rows, including duplicate transaction IDs, are preserved. Dates and
timestamps remain strings in this bronze layer. In particular, the source
`sale_timestamp` contains minute/second fragments, not complete timestamps.
Numeric identifiers/quantities use bigint; monetary amounts use decimal(18,2).

The job uses the existing S3 keys and `PG_AICAT_STORAGE`, plus a PG-owned
`PG_AICAT_EXT_AUTH` credential for catalog authentication. It does not change
`PG_OCI_GENAI_CRED` or require additional Terraform variables.

Disabled/missing/unavailable AI Catalog is skipped. Other errors produce a
warning without blocking provisioning. No local success marker is baked into
the image. Reruns compare the CSV fingerprint and all catalog rows; they never
replace existing tables or append again to a populated snapshot.
The job refreshes PG's catalog metadata cache and verifies that all four tables
are discoverable. For manual `DBMS_CATALOG.GET_TABLES` calls, use `'"bronze"'`
to preserve the lowercase namespace identifier.

To retry and verify manually on a VM:

```bash
AI_CATALOG_SEED_STRICT=true bash /home/opc/init/seed-ai-data-catalog.sh
```

Query in SQL Developer Web as PG:

```sql
SELECT COUNT(*) FROM EXT_PRODUCTS;
SELECT COUNT(*) FROM EXT_STORE_INVENTORY;
SELECT COUNT(*) FROM EXT_STORE_LOCATIONS;
SELECT COUNT(*) FROM EXT_STORE_SALES_TRANSACTIONS;
```
