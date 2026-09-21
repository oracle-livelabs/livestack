#!/usr/bin/env python3
"""Offline regression checks; no OCI credentials or Python dependencies needed."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import types
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
MODULE = ROOT / "ingestion/iceberg-seeder/seed_ai_catalog.py"
spec = importlib.util.spec_from_file_location("aicat_seed", MODULE)
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)


class BronzeTests(unittest.TestCase):
    def test_source_rows_and_raw_timestamps(self):
        sources = ROOT / "ingestion/demodata/aicat-sources"
        for name, (expected, _) in seed.SOURCES.items():
            fields, rows, digest = seed.read_source(sources, name)
            self.assertEqual(len(rows), expected)
            self.assertEqual(len(digest), 64)
            self.assertEqual(list(rows[0]), [key for key, _ in fields])
        _, sales, _ = seed.read_source(sources, "store_sales_transactions")
        self.assertEqual(sales[0]["sale_timestamp"], "31:48.0")
        self.assertEqual(len({row["txn_id"] for row in sales}), 63031)

    def test_disabled_and_missing_url_do_not_connect(self):
        for env in ({}, {"AI_DATA_CATALOG_ENABLED": "false"}, {"AI_DATA_CATALOG_ENABLED": "true"}):
            with patch.dict(os.environ, env, clear=True), patch.object(seed, "authenticate") as auth:
                self.assertEqual(seed.main(), 0)
                auth.assert_not_called()

    def test_unavailable_is_bounded_and_skips(self):
        with patch.object(seed.urllib.request, "urlopen", side_effect=HTTPError("url", 503, "offline", {}, None)) as request, patch.object(seed.time, "sleep"):
            self.assertIsNone(seed.authenticate("https://example.test/catalog", "PG", "secret"))
            self.assertEqual(request.call_count, 3)
        with patch.dict(os.environ, {"AI_DATA_CATALOG_ENABLED": "true", "AI_DATA_CATALOG_URL": "https://example.test/catalog", "DBPASSWORD": "test"}, clear=True), patch.object(seed, "authenticate", return_value=None):
            self.assertEqual(seed.main(), 0)

    def test_bad_auth_is_not_reported_as_disabled(self):
        with patch.object(seed.urllib.request, "urlopen", side_effect=HTTPError("url", 401, "bad", {}, None)):
            with self.assertRaisesRegex(RuntimeError, "HTTP 401"):
                seed.authenticate("https://example.test/catalog", "PG", "secret")

    def test_sql_links_catalog_and_does_not_drop(self):
        sql = seed.external_table_sql("https://example.test/catalog", "PG", "a'b", "PG_AICAT_STORAGE")
        self.assertNotIn("DROP", sql)
        self.assertIn("a''b", sql)
        self.assertIn("oracle_ai_data_catalog", sql)
        for name in seed.SOURCES:
            self.assertIn("EXT_" + name.upper(), sql)
            self.assertIn('"table_path": ["bronze", "' + name + '"]', sql)
        self.assertIn("Existing EXT_PRODUCTS does not match", sql)
        self.assertNotIn("COMMENT ON TABLE", sql)
        self.assertIn("user_external_tables", sql)
        self.assertIn("PREFILL_CATALOG_CACHE", sql)
        self.assertIn("GET_TABLES('PG_AICAT', '\"bronze\"')", sql)

    def test_rerun_does_not_append_and_conflict_does_not_overwrite(self):
        # The control flow can be tested without the optional runtime packages.
        exceptions = types.ModuleType("pyiceberg.exceptions")
        exceptions.NoSuchTableError = type("NoSuchTableError", (Exception,), {})
        table = MagicMock()
        table.properties = {"peakgear.seed.owner": seed.OWNER, "peakgear.seed.sha256": "hash"}
        table.current_snapshot.return_value.snapshot_id = 123
        data = MagicMock()
        data.column_names = ["id"]
        data.to_pylist.return_value = [{"id": 1}]
        data.num_rows = 1
        table.scan.return_value.to_arrow.return_value = data
        catalog = MagicMock()
        catalog.load_table.return_value = table
        with patch.dict("sys.modules", {"pyiceberg.exceptions": exceptions}):
            seed.seed_table(catalog, "products", data, "hash")
            seed.seed_table(catalog, "products", data, "hash")
            table.append.assert_not_called()
            catalog.create_table.assert_not_called()
            with self.assertRaisesRegex(RuntimeError, "refusing to change"):
                seed.seed_table(catalog, "products", data, "different")
            table.append.assert_not_called()

    def test_interrupted_empty_table_can_resume(self):
        exceptions = types.ModuleType("pyiceberg.exceptions")
        exceptions.NoSuchTableError = type("NoSuchTableError", (Exception,), {})
        table = MagicMock()
        table.properties = {"peakgear.seed.owner": seed.OWNER, "peakgear.seed.sha256": "hash"}
        table.current_snapshot.side_effect = [None, types.SimpleNamespace(snapshot_id=123)]
        data = MagicMock()
        data.column_names = ["id"]
        data.to_pylist.return_value = [{"id": 1}]
        data.num_rows = 1
        table.scan.return_value.to_arrow.return_value = data
        catalog = MagicMock()
        catalog.load_table.return_value = table
        with patch.dict("sys.modules", {"pyiceberg.exceptions": exceptions}):
            seed.seed_table(catalog, "products", data, "hash")
        table.append.assert_called_once_with(data)

    def test_shell_disabled_without_podman_or_wallet(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / "env"
            env.write_text("AI_DATA_CATALOG_ENABLED=false\n")
            result = subprocess.run(["bash", str(ROOT / "init/seed-ai-data-catalog.sh")],
                env={**os.environ, "ENV_FILE": str(env)}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("disabled; skipping", result.stdout)


if __name__ == "__main__":
    unittest.main()
