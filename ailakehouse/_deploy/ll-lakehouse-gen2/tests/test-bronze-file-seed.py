#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest

path = Path(__file__).resolve().parents[1] / 'init/seed-bronze-files.py'
spec = importlib.util.spec_from_file_location('bronze_seed', path)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


class ServiceError(Exception):
    def __init__(self, status):
        self.status = status


class Client:
    def __init__(self):
        self.objects = {}
        self.fail_status = None

    def put_object(self, namespace, bucket, name, stream, if_none_match):
        assert if_none_match == '*'
        if self.fail_status:
            raise ServiceError(self.fail_status)
        if name in self.objects:
            raise ServiceError(412)
        self.objects[name] = stream.read()


class BronzeSeedTests(unittest.TestCase):
    def test_retry_preserves_existing_and_uploads_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            for name in seed.FILES:
                (data / name).write_text('new')
            client = Client()
            client.objects['bronze/' + seed.FILES[0]] = b'existing'
            seed.seed(client, 'namespace', 'bucket', data, ServiceError)
            seed.seed(client, 'namespace', 'bucket', data, ServiceError)
            self.assertEqual(client.objects['bronze/' + seed.FILES[0]], b'existing')
            self.assertEqual(len(client.objects), len(seed.FILES))

    def test_other_service_errors_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            (data / seed.FILES[0]).write_text('new')
            client = Client()
            client.fail_status = 403
            with self.assertRaises(ServiceError):
                seed.seed(client, 'namespace', 'bucket', data, ServiceError)


if __name__ == '__main__':
    unittest.main()
