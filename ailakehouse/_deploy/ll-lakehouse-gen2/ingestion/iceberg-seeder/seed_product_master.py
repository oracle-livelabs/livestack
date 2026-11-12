#!/usr/bin/env python3
import csv
import json
import os
import sys
import tempfile
import urllib.request
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import quote

import pyarrow as pa
from pyiceberg.catalog import load_catalog
from pyiceberg.exceptions import NoSuchTableError
from pyiceberg.io.fsspec import FsspecFileIO
from pyiceberg.manifest import read_manifest_list, write_manifest, write_manifest_list


DEFAULT_CSV_PATH = "/workspace/app/demodata/bronze/product_master_raw.csv"
DEFAULT_NAMESPACE = "bronze"
DEFAULT_TABLE = "product_master_raw"
DEFAULT_REST_URI = "http://gravitino:1525/iceberg"
DEFAULT_FILE_IO = "seed_product_master.OCIS3FsspecFileIO"
DEFAULT_ADB_METADATA_PREFIX = "adb_oci"


def property_bool(properties, name, default=False):
    value = clean(properties.get(name))
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def first_property(properties, *names):
    for name in names:
        value = clean(properties.get(name))
        if value:
            return value
    return None


class OCIS3FsspecFileIO(FsspecFileIO):
    """FSSpec FileIO tuned for OCI Object Storage's S3-compatible endpoint."""

    def _get_fs(self, scheme, hostname=None):
        if scheme not in {"s3", "s3a", "s3n"}:
            return super()._get_fs(scheme, hostname)

        from s3fs import S3FileSystem

        force_virtual = property_bool(self.properties, "s3.force-virtual-addressing", False)
        client_kwargs = {
            "endpoint_url": first_property(self.properties, "s3.endpoint"),
            "aws_access_key_id": first_property(self.properties, "s3.access-key-id", "client.access-key-id"),
            "aws_secret_access_key": first_property(self.properties, "s3.secret-access-key", "client.secret-access-key"),
            "aws_session_token": first_property(self.properties, "s3.session-token", "client.session-token"),
            "region_name": first_property(self.properties, "s3.region", "client.region"),
        }
        client_kwargs = {key: value for key, value in client_kwargs.items() if value}
        config_kwargs = {
            "signature_version": "s3v4",
            "request_checksum_calculation": "when_required",
            "response_checksum_validation": "when_required",
            "s3": {
                "addressing_style": "virtual" if force_virtual else "path",
                "payload_signing_enabled": False,
            },
        }

        return S3FileSystem(
            anon=property_bool(self.properties, "s3.anonymous", False),
            client_kwargs=client_kwargs,
            config_kwargs=config_kwargs,
        )


def log(message):
    print(f"[iceberg-seed] {message}", flush=True)


def clean(value):
    return str(value or "").strip().strip('"').strip("'")


def env(name, default=""):
    return clean(os.environ.get(name, default))


def env_bool(name, default=False):
    value = env(name)
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def require(name, value):
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def decimal_or_none(value, scale):
    value = clean(value)
    if not value:
        return None
    quantizer = Decimal(1).scaleb(-scale)
    return Decimal(value).quantize(quantizer)


def date_or_none(value):
    value = clean(value)
    if not value:
        return None
    return date.fromisoformat(value)


def timestamp_or_none(value):
    value = clean(value)
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def resolve_csv_path():
    csv_path = Path(env("ICEBERG_SEED_CSV_PATH", DEFAULT_CSV_PATH))
    if csv_path.is_file():
        return csv_path

    csv_url = env("ICEBERG_SEED_CSV_URL")
    if not csv_url:
        raise RuntimeError(f"CSV file is missing and ICEBERG_SEED_CSV_URL is not set: {csv_path}")

    tmp = tempfile.NamedTemporaryFile(prefix="product-master-", suffix=".csv", delete=False)
    tmp.close()
    log(f"Downloading seed CSV from {csv_url}")
    urllib.request.urlretrieve(csv_url, tmp.name)
    return Path(tmp.name)


def build_schema():
    return pa.schema(
        [
            ("source_system", pa.string()),
            ("extract_batch_id", pa.string()),
            ("raw_sku", pa.string()),
            ("product_name", pa.string()),
            ("brand_name", pa.string()),
            ("category", pa.string()),
            ("subcategory", pa.string()),
            ("list_price", pa.decimal128(10, 2)),
            ("cost", pa.decimal128(10, 2)),
            ("weight_kg", pa.decimal128(8, 3)),
            ("launch_date", pa.date32()),
            ("tags", pa.string()),
            ("source_updated_at", pa.timestamp("us", tz="UTC")),
            ("record_status", pa.string()),
        ]
    )


def read_product_rows(csv_path):
    rows = []
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(
                {
                    "source_system": clean(row.get("source_system")),
                    "extract_batch_id": clean(row.get("extract_batch_id")),
                    "raw_sku": clean(row.get("raw_sku")),
                    "product_name": clean(row.get("product_name")),
                    "brand_name": clean(row.get("brand_name")),
                    "category": clean(row.get("category")),
                    "subcategory": clean(row.get("subcategory")),
                    "list_price": decimal_or_none(row.get("list_price"), 2),
                    "cost": decimal_or_none(row.get("cost"), 2),
                    "weight_kg": decimal_or_none(row.get("weight_kg"), 3),
                    "launch_date": date_or_none(row.get("launch_date")),
                    "tags": clean(row.get("tags")),
                    "source_updated_at": timestamp_or_none(row.get("source_updated_at")),
                    "record_status": clean(row.get("record_status")),
                }
            )
    if not rows:
        raise RuntimeError(f"Seed CSV has no data rows: {csv_path}")
    return rows


def derive_warehouse():
    warehouse = env("GRAVITINO_WAREHOUSE")
    if warehouse:
        return warehouse.rstrip("/")

    bucket = require("GRAVITINO_OBJECT_STORAGE_BUCKET or BUCKET_NAME", env("GRAVITINO_OBJECT_STORAGE_BUCKET") or env("BUCKET_NAME"))
    prefix = env("GRAVITINO_OBJECT_STORAGE_PREFIX", "iceberg").strip("/")
    return f"s3a://{bucket}/{prefix}".rstrip("/")


def derive_s3_endpoint():
    endpoint = env("GRAVITINO_S3_ENDPOINT")
    if endpoint:
        return endpoint

    namespace = env("OBJECT_NAMESPACE")
    region = env("GRAVITINO_S3_REGION") or env("REGION_IDENTIFIER")
    if namespace and region:
        return f"https://{namespace}.compat.objectstorage.{region}.oraclecloud.com"
    return ""


def derive_object_namespace():
    namespace = env("OBJECT_NAMESPACE")
    if namespace and not namespace.startswith("ocid"):
        return namespace

    endpoint = derive_s3_endpoint()
    endpoint_host = endpoint.split("://", 1)[-1].split("/", 1)[0]
    marker = ".compat.objectstorage."
    if marker in endpoint_host:
        return endpoint_host.split(marker, 1)[0]
    return namespace


def split_s3_location(location):
    if not location.startswith(("s3://", "s3a://", "s3n://")):
        raise RuntimeError(f"Expected an S3-style Iceberg location, got: {location}")
    path = location.split("://", 1)[1]
    bucket, _, object_name = path.partition("/")
    if not bucket or not object_name:
        raise RuntimeError(f"Invalid S3-style Iceberg location: {location}")
    return bucket, object_name


def to_oci_location(location, namespace):
    bucket, object_name = split_s3_location(location)
    return f"oci://{bucket}@{namespace}/{object_name}"


def to_native_object_uri(location, namespace, region):
    bucket, object_name = split_s3_location(location)
    encoded_object = quote(object_name, safe="")
    return f"https://objectstorage.{region}.oraclecloud.com/n/{namespace}/b/{bucket}/o/{encoded_object}"


def adb_metadata_s3_path(original, prefix):
    marker = "/metadata/"
    if marker not in original:
        raise RuntimeError(f"Expected Iceberg metadata path to contain {marker}: {original}")
    head, tail = original.rsplit(marker, 1)
    return f"{head}{marker}{prefix.strip('/')}/{tail}"


def delete_if_exists(io, location):
    try:
        io.delete(location)
    except Exception:
        pass


def publish_adb_metadata(table):
    if not env_bool("ICEBERG_SEED_ADB_METADATA", True):
        log("Skipping ADB Iceberg metadata publishing because ICEBERG_SEED_ADB_METADATA is false.")
        return ""

    namespace = require("OBJECT_NAMESPACE derived from GRAVITINO_S3_ENDPOINT", derive_object_namespace())
    region = require("GRAVITINO_S3_REGION", env("GRAVITINO_S3_REGION") or env("REGION_IDENTIFIER"))
    output_prefix = env("ICEBERG_SEED_ADB_METADATA_PREFIX", DEFAULT_ADB_METADATA_PREFIX)
    snapshot = table.current_snapshot()
    if snapshot is None:
        raise RuntimeError("Cannot publish ADB metadata because the Iceberg table has no current snapshot.")

    manifest_files = list(read_manifest_list(table.io.new_input(snapshot.manifest_list)))
    new_manifest_files = []
    rewritten_entries = 0

    for manifest_file in manifest_files:
        entries = manifest_file.fetch_manifest_entry(table.io, discard_deleted=False)
        new_manifest_s3 = adb_metadata_s3_path(manifest_file.manifest_path, output_prefix)
        delete_if_exists(table.io, new_manifest_s3)
        writer = write_manifest(
            table.metadata.format_version,
            table.spec(),
            table.schema(),
            table.io.new_output(new_manifest_s3),
            snapshot.snapshot_id,
            "null",
        )
        with writer:
            for entry in entries:
                entry_copy = deepcopy(entry)
                entry_copy.data_file._data[1] = to_oci_location(entry_copy.data_file.file_path, namespace)
                writer.add_entry(entry_copy)
                rewritten_entries += 1
        new_manifest = writer.to_manifest_file()
        new_manifest._data[0] = to_oci_location(new_manifest_s3, namespace)
        new_manifest_files.append(new_manifest)

    new_manifest_list_s3 = adb_metadata_s3_path(snapshot.manifest_list, output_prefix)
    delete_if_exists(table.io, new_manifest_list_s3)
    with write_manifest_list(
        table.metadata.format_version,
        table.io.new_output(new_manifest_list_s3),
        snapshot.snapshot_id,
        getattr(snapshot, "parent_snapshot_id", None),
        getattr(snapshot, "sequence_number", None),
        "null",
    ) as manifest_list_writer:
        manifest_list_writer.add_manifests(new_manifest_files)

    metadata_location = table.metadata_location
    with table.io.new_input(metadata_location).open() as handle:
        metadata = json.load(handle)

    metadata["location"] = to_oci_location(metadata.get("location", ""), namespace)
    for log_entry in metadata.get("metadata-log", []):
        if "metadata-file" in log_entry:
            log_entry["metadata-file"] = to_oci_location(log_entry["metadata-file"], namespace)
    for metadata_snapshot in metadata.get("snapshots", []):
        if metadata_snapshot.get("snapshot-id") == snapshot.snapshot_id:
            metadata_snapshot["manifest-list"] = to_oci_location(new_manifest_list_s3, namespace)
        elif "manifest-list" in metadata_snapshot:
            metadata_snapshot["manifest-list"] = to_oci_location(metadata_snapshot["manifest-list"], namespace)

    new_metadata_s3 = adb_metadata_s3_path(metadata_location, output_prefix)
    with table.io.new_output(new_metadata_s3).create(overwrite=True) as handle:
        handle.write(json.dumps(metadata, separators=(",", ":")).encode("utf-8"))

    metadata_uri = to_native_object_uri(new_metadata_s3, namespace, region)
    log(f"Published ADB Iceberg metadata for {table.name()} to {metadata_uri}")
    log(f"Rewritten {len(new_manifest_files)} manifest files and {rewritten_entries} data file entries for ADB.")
    return metadata_uri


def load_rest_catalog(warehouse):
    rest_uri = env("ICEBERG_REST_CATALOG_URI", DEFAULT_REST_URI)
    s3_endpoint = require("GRAVITINO_S3_ENDPOINT", derive_s3_endpoint())
    s3_region = require("GRAVITINO_S3_REGION", env("GRAVITINO_S3_REGION") or env("REGION_IDENTIFIER"))
    access_key = require("GRAVITINO_S3_ACCESS_KEY_ID", env("GRAVITINO_S3_ACCESS_KEY_ID"))
    secret_key = require("GRAVITINO_S3_SECRET_ACCESS_KEY", env("GRAVITINO_S3_SECRET_ACCESS_KEY"))
    file_io = env("ICEBERG_SEED_FILE_IO", DEFAULT_FILE_IO)

    catalog_properties = {
        "py-io-impl": file_io,
        "s3.endpoint": s3_endpoint,
        "s3.region": s3_region,
        "s3.access-key-id": access_key,
        "s3.secret-access-key": secret_key,
        "s3.anonymous": "false",
        "auth": {"type": "noop"},
    }
    path_style = env_bool("GRAVITINO_S3_PATH_STYLE_ACCESS", True)
    if file_io.endswith(".PyArrowFileIO"):
        catalog_properties["s3.force-virtual-addressing"] = "false" if path_style else "true"
    elif not path_style:
        catalog_properties["s3.force-virtual-addressing"] = "true"

    log(f"Connecting to Iceberg REST catalog {rest_uri}")
    return load_catalog(
        "seed",
        type="rest",
        uri=rest_uri,
        warehouse=warehouse,
        **catalog_properties,
    )


def count_rows(table):
    return table.scan().to_arrow().num_rows


def load_existing_table(catalog, identifier):
    try:
        return catalog.load_table(identifier)
    except NoSuchTableError:
        return None


def main():
    if not env_bool("ICEBERG_SEED_AUTO_CREATE", True):
        log("Skipping because ICEBERG_SEED_AUTO_CREATE is false.")
        return 0

    namespace = env("ICEBERG_SEED_NAMESPACE", DEFAULT_NAMESPACE)
    table_name = env("ICEBERG_SEED_TABLE", DEFAULT_TABLE)
    identifier = f"{namespace}.{table_name}"
    overwrite = env_bool("ICEBERG_SEED_OVERWRITE", False)
    dry_run = env_bool("ICEBERG_SEED_DRY_RUN", False)

    csv_path = resolve_csv_path()
    rows = read_product_rows(csv_path)
    schema = build_schema()
    arrow_table = pa.Table.from_pylist(rows, schema=schema)
    if dry_run:
        log(f"Dry run parsed {arrow_table.num_rows} rows for {identifier} from {csv_path}.")
        return 0

    warehouse = derive_warehouse()
    table_location = env("ICEBERG_SEED_TABLE_LOCATION") or f"{warehouse}/{namespace}/{table_name}"
    catalog = load_rest_catalog(warehouse)
    catalog.create_namespace_if_not_exists(namespace)

    existing = load_existing_table(catalog, identifier)
    if existing and overwrite:
        log(f"Dropping existing table {identifier} because ICEBERG_SEED_OVERWRITE is true.")
        catalog.drop_table(identifier, purge_requested=False)
        existing = None

    if existing:
        existing_count = count_rows(existing)
        if existing_count > 0:
            log(f"Table {identifier} already exists with {existing_count} rows; skipping seed.")
            publish_adb_metadata(existing)
            return 0
        log(f"Table {identifier} exists but is empty; appending {arrow_table.num_rows} seed rows.")
        existing.append(arrow_table, snapshot_properties={"seed": "product_master_raw"})
        existing = catalog.load_table(identifier)
        publish_adb_metadata(existing)
        log(f"Seeded {identifier} with {arrow_table.num_rows} rows.")
        return 0

    log(f"Creating table {identifier} at {table_location}")
    table = catalog.create_table(
        identifier=identifier,
        schema=schema,
        location=table_location,
        properties={
            "write.object-storage.enabled": "true",
            "write.metadata.delete-after-commit.enabled": "true",
            "write.metadata.previous-versions-max": "5",
        },
    )
    table.append(arrow_table, snapshot_properties={"seed": "product_master_raw"})
    table = catalog.load_table(identifier)
    publish_adb_metadata(table)
    log(f"Created and seeded {identifier} with {arrow_table.num_rows} rows.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        log(f"ERROR: {exc}")
        raise
