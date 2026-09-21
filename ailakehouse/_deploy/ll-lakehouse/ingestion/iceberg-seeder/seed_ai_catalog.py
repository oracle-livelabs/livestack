#!/usr/bin/env python3
"""Seed only the four packaged AI Catalog bronze sources; never overwrite tables."""
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from decimal import Decimal
from pathlib import Path


SOURCES = {
    "products": (200, "product_id:i product_name:s category:s cost_price:d retail_price:d sku:s"),
    "store_inventory": (1200, "store_id:i product_id:i stock_on_hand:i last_stock_update:s reorder_level:i available_to_promise_qty:i inventory_status:s"),
    "store_locations": (6, "store_id:i location:s manager:s opened_date:s channel_type:s store_type:s"),
    # Source values are minute:second fragments, not complete timestamps.
    "store_sales_transactions": (80001, "txn_id:i sale_timestamp:s store_id:i product_id:i qty_sold:i total_sale_amount:d"),
}
OWNER = "peakgear-aicat-bronze-v1"


class SeedError(RuntimeError):
    """A deliberately safe diagnostic, without REST response bodies/secrets."""


def log(message):
    print(f"[aicat-bronze] {message}", flush=True)


def enabled(value):
    return str(value).lower() in {"1", "true", "yes", "on"}


def read_source(directory, name):
    expected, specification = SOURCES[name]
    fields = [item.split(":") for item in specification.split()]
    path = Path(directory) / f"{name}.csv"
    converters = {"i": int, "s": str, "d": Decimal}
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != [key for key, _ in fields]:
            raise ValueError(f"Unexpected columns in {name}")
        rows = []
        for row in reader:
            if None in row or any(value is None or value == "" for value in row.values()):
                raise ValueError(f"Incomplete row in {name}")
            rows.append({key: converters[kind](row[key]) for key, kind in fields})
    if len(rows) != expected:
        raise ValueError(f"Unexpected source row count in {name}: {len(rows)}")
    return fields, rows, hashlib.sha256(path.read_bytes()).hexdigest()


def authenticate(root, schema, password):
    data = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": schema,
                                  "client_secret": password, "scope": "PRINCIPAL_ROLE:ALL"}).encode()
    for attempt in range(3):
        try:
            request = urllib.request.Request(root + "/v1/auth/token", data=data)
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)["access_token"]
        except urllib.error.HTTPError as error:
            error.close()
            if error.code not in {404, 429, 502, 503, 504}:
                raise SeedError(f"Catalog authentication returned HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError):
            pass
        if attempt < 2:
            time.sleep(5)
    return None


def seed_table(catalog, name, data, digest):
    from pyiceberg.exceptions import NoSuchTableError
    identifier = ("bronze", name)
    try:
        table = catalog.load_table(identifier)
    except NoSuchTableError:
        table = catalog.create_table(identifier, schema=data.schema, properties={
            "format-version": "2", "peakgear.seed.owner": OWNER,
            "peakgear.seed.sha256": digest,
        })
    if table.properties.get("peakgear.seed.owner") != OWNER or table.properties.get("peakgear.seed.sha256") != digest:
        raise SeedError(f"Existing bronze.{name} is not this seed; refusing to change it")
    # An append commits a single snapshot atomically. A retry after a lost response
    # observes that snapshot instead of appending the same rows a second time.
    if table.current_snapshot() is None:
        table.append(data)
        table.refresh()
    actual = table.scan().to_arrow()
    actual_rows = Counter(tuple(row.values()) for row in actual.to_pylist())
    expected_rows = Counter(tuple(row.values()) for row in data.to_pylist())
    if actual.column_names != data.column_names or actual_rows != expected_rows:
        raise SeedError(f"bronze.{name} differs from packaged data; refusing to overwrite it")
    log(f"bronze.{name}: verified {actual.num_rows} rows; snapshot={table.current_snapshot().snapshot_id}")


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def external_table_sql(root, schema, password, storage, catalog="PG_AICAT"):
    auth = "PG_AICAT_EXT_AUTH"
    statements = ["SET ECHO OFF\nSET DEFINE OFF\nSET SERVEROUTPUT ON\nWHENEVER SQLERROR EXIT FAILURE ROLLBACK\n",
                  f"""DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_credentials WHERE credential_name = '{auth}';
  IF n = 0 THEN
    DBMS_CLOUD.CREATE_CREDENTIAL('{auth}', {sql_literal(schema)}, {sql_literal(password)});
  ELSE
    DBMS_CLOUD.UPDATE_CREDENTIAL('{auth}', 'username', {sql_literal(schema)});
    DBMS_CLOUD.UPDATE_CREDENTIAL('{auth}', 'password', {sql_literal(password)});
  END IF;
END;
/
"""]
    for name, (expected, _) in SOURCES.items():
        target = "EXT_" + name.upper()
        fmt = json.dumps({"access_protocol": {"protocol_type": "iceberg", "protocol_config": {
            "iceberg_catalog_type": "oracle_ai_data_catalog", "rest_catalog_endpoint": root,
            "rest_authentication": {"rest_auth_cred": auth, "rest_auth_endpoint": root + "/v1/auth/token"},
            "table_path": ["bronze", name]}}})
        statements.append(f"""DECLARE n NUMBER; rows_found NUMBER; parameters CLOB; config CLOB;
BEGIN
  SELECT COUNT(*) INTO n FROM user_objects WHERE object_name = '{target}';
  IF n = 0 THEN
    DBMS_CLOUD.CREATE_EXTERNAL_TABLE(table_name => '{target}',
      credential_name => {sql_literal(storage)}, format => {sql_literal(fmt)});
  ELSE
    SELECT access_parameters INTO parameters FROM user_external_tables WHERE table_name = '{target}';
    config := REGEXP_SUBSTR(parameters,
      '^com[.]oracle[.]bigdata[.]access_protocol[.]config=(.*)$', 1, 1, 'm', 1);
    IF JSON_VALUE(config, '$.iceberg_catalog_type') = 'oracle_ai_data_catalog'
       AND JSON_VALUE(config, '$.rest_catalog_endpoint') = {sql_literal(root)}
       AND JSON_VALUE(config, '$.table_path[0]') = 'bronze'
       AND JSON_VALUE(config, '$.table_path[1]') = '{name}' THEN
      NULL;
    ELSE
      RAISE_APPLICATION_ERROR(-20001, 'Existing {target} does not match this catalog source; not changed');
    END IF;
  END IF;
  EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM {target}' INTO rows_found;
  IF rows_found != {expected} THEN
    RAISE_APPLICATION_ERROR(-20002, '{target} unexpected row count: ' || rows_found);
  END IF;
  DBMS_OUTPUT.PUT_LINE('VERIFIED {target} rows=' || rows_found);
END;
/
""")
    statements.append(f"""DECLARE n NUMBER;
BEGIN
  DBMS_CATALOG.FLUSH_CATALOG_CACHE({sql_literal(catalog)});
  DBMS_CATALOG.PREFILL_CATALOG_CACHE({sql_literal(catalog)});
  -- Preserve the lowercase remote identifier instead of Oracle uppercasing it.
  SELECT COUNT(*) INTO n FROM DBMS_CATALOG.GET_TABLES({sql_literal(catalog)}, '"bronze"')
   WHERE table_name IN ('products', 'store_inventory', 'store_locations', 'store_sales_transactions');
  IF n != 4 THEN
    RAISE_APPLICATION_ERROR(-20003, 'AI Catalog bronze discovery incomplete: ' || n);
  END IF;
  DBMS_OUTPUT.PUT_LINE('VERIFIED CATALOG bronze tables=' || n);
END;
/
""")
    return "\n".join(statements) + "\nEXIT SUCCESS\n"


def main():
    if not enabled(os.environ.get("AI_DATA_CATALOG_ENABLED", "false")):
        log("AI Catalog disabled; skipping.")
        return 0
    root = os.environ.get("AI_DATA_CATALOG_URL", "").rstrip("/")
    if not root:
        log("AI Catalog URL unavailable; skipping.")
        return 0
    if not re.fullmatch(r"https://[^/\s]+/catalog", root):
        raise ValueError("AI_DATA_CATALOG_URL must be https://<host>/catalog")
    schema = os.environ.get("AI_DATA_CATALOG_SCHEMA", "PG").upper()
    password = os.environ.get("ADB_STREAM_SCHEMA_PASSWORD") or os.environ["DBPASSWORD"]
    token = authenticate(root, schema, password)
    if token is None:
        log("AI Catalog unavailable after bounded retries; skipping (no completion marker).")
        return 0

    import pyarrow as pa
    from pyiceberg.catalog import load_catalog

    log("Opening authenticated AI Catalog.")
    catalog = load_catalog("pg-aicat-bronze", type="rest", uri=root, token=token, **{
        # AI Catalog already has registered storage. Its optional warehouse
        # query parameter selects a catalog name, not an s3:// bucket URI.
        "py-io-impl": "seed_product_master.OCIS3FsspecFileIO",
        "s3.endpoint": os.environ.get("AI_DATA_CATALOG_S3_ENDPOINT") or os.environ["GRAVITINO_S3_ENDPOINT"],
        "s3.region": os.environ["GRAVITINO_S3_REGION"],
        "s3.access-key-id": os.environ["GRAVITINO_S3_ACCESS_KEY_ID"],
        "s3.secret-access-key": os.environ["GRAVITINO_S3_SECRET_ACCESS_KEY"],
        "rest.client.max-retries": "2", "rest.client.socket-timeout-ms": "60000",
    })
    # Parse all files before making changes to catch a corrupt archive early.
    inputs = {name: read_source(os.environ.get("AI_CATALOG_SOURCE_DIR", "/sources"), name) for name in SOURCES}
    log("Checking bronze namespace.")
    catalog.create_namespace_if_not_exists("bronze")
    types = {"i": pa.int64(), "s": pa.string(), "d": pa.decimal128(18, 2)}
    for name, (fields, rows, digest) in inputs.items():
        log(f"Checking bronze.{name}.")
        data = pa.Table.from_pylist(rows, schema=pa.schema([(key, types[kind]) for key, kind in fields]))
        seed_table(catalog, name, data, digest)
    # Only emit the SQL handoff once every catalog table has been verified.
    output = Path(os.environ.get("AI_CATALOG_SQL_OUTPUT", "/output/external-tables.sql"))
    output.write_text(external_table_sql(root, schema, password,
        os.environ.get("AI_DATA_CATALOG_STORAGE_CREDENTIAL", "PG_AICAT_STORAGE"),
        os.environ.get("AI_DATA_CATALOG_NAME", "PG_AICAT")), encoding="utf-8")
    output.chmod(0o600)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # REST exceptions can contain tokens or credential-vending responses.
        detail = str(error) if isinstance(error, SeedError) else type(error).__name__
        log(f"ERROR: {detail}; bronze seed incomplete, safe to retry.")
        sys.exit(1)
