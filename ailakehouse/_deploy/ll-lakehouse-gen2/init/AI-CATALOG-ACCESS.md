# AI Catalog access provisioning

Database role `AICAT_USER` alone no longer provides REST catalog access.
`configure-ai-data-catalog.sh` runs `configure-ai-catalog-access.py` after the
database grants and before the PG mount. Existing mount markers also run this
reconciliation, without registering storage or recreating the mount.

The helper authenticates as ADMIN using the existing deployment environment,
creates `DT_WRITERS` if absent, and adds PG (or `AI_DATA_CATALOG_SCHEMA`). It
adds only missing permissions and preserves other members and grants:

- `metalake/default`: `BROWSE_METALAKE`, `USE_METALAKE`.
- `catalog/oadc_iceberg_rest_catalog`: `BROWSE_CATALOG`, `USE_CATALOG`,
  `BROWSE_SCHEMA`, `USE_SCHEMA`, `CREATE_SCHEMA`, `CREATE_TABLE`, `SELECT_TABLE`.

These are catalog-wide demo writer permissions, not administrator or drop rights.
The helper obtains a fresh PG token and verifies namespace and table listing.
Disabled AI Catalog or an unavailable URL skips the helper. An enabled catalog's
authentication/permission failure is reported without printing tokens or passwords.

Run offline tests with `python3 tests/test-ai-catalog-access.py`. The archive
validator requires the helper so new custom images include it.
