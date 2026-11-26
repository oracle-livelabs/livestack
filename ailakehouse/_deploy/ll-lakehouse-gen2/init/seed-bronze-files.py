#!/usr/bin/env python3
"""Seed the deployment bucket without overwriting existing objects."""

from pathlib import Path
import sys

DATA = Path('/home/opc/ingestion/demodata/bronze')
ENV = Path('/home/opc/ingestion/.env')
FILES = (
    'product_master_raw.csv',
    'inventory_snapshot_raw.csv',
    'orders_pos_raw.csv',
    'demand_signals_raw.jsonl',
    'product_images_manifest_raw.csv',
)


def seed(client, namespace, bucket, data_dir, service_error):
    for name in FILES:
        path = data_dir / name
        with path.open('rb') as source:
            try:
                client.put_object(namespace, bucket, 'bronze/' + name, source,
                                  if_none_match='*')
                print(f'Uploaded bronze/{name}', flush=True)
            except service_error as exc:
                if exc.status != 412:
                    raise
                print(f'Preserved existing bronze/{name}', flush=True)


def main():
    import oci

    values = {}
    for line in ENV.read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep and key in ('BRONZE_DATA_BUCKET_NAME', 'OBJECT_NAMESPACE'):
            values[key] = value
    bucket = values.get('BRONZE_DATA_BUCKET_NAME', '')
    namespace = values.get('OBJECT_NAMESPACE', '')
    if not bucket or bucket == 'bucket_name' or not namespace or namespace == 'ocid567890':
        raise RuntimeError('Object Storage bucket or namespace is unavailable')
    config = oci.config.from_file('/home/opc/.oci/config')
    client = oci.object_storage.ObjectStorageClient(config)
    seed(client, namespace, bucket, DATA, oci.exceptions.ServiceError)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Bronze file seeding failed: {exc}', file=sys.stderr)
        sys.exit(1)
