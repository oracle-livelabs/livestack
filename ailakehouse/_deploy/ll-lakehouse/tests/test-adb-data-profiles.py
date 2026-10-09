import csv
import json
from pathlib import Path
import re
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
DEPLOY_ROOT = ROOT.parent
SCRIPTS = (
    ROOT / 'init/adb-load.sh',
    DEPLOY_ROOT / 'auto_build/01-image-build/02-edit-if-needed/hooks/peakgear-init/adb-load.sh',
)
BASELINE_TABLES = {
    'CUSTOMER_ORDER_STATUS',
    'DIM_PRODUCT',
    'PRODUCT_MANUALS_SOURCE',
    'PRODUCT_VECTOR_STORE',
}


def extract_generate_function(script):
    lines = script.read_text().splitlines()
    start = next(i for i, line in enumerate(lines) if line == 'generate_warehouse_sql() {')
    selected = []
    in_python = False
    for line in lines[start:]:
        selected.append(line)
        if line.strip() == "python3 <<'PY'":
            in_python = True
            continue
        if in_python:
            if line == 'PY':
                in_python = False
            continue
        if len(selected) > 1 and line == '}':
            break
    return '\n'.join(selected) + '\n'


def manifest_tables():
    gold_data = ROOT / 'ingestion/gold-data'
    manifest = json.loads((gold_data / '_export_manifest.json').read_text())
    rows = {}
    seen = set()
    for table in manifest.get('tables', []):
        csv_file = table.get('csv_file')
        if not csv_file:
            continue
        csv_path = gold_data / csv_file
        if not csv_path.is_file() or not table.get('columns'):
            continue
        table_name = table.get('table_name') or csv_path.stem.upper()
        rows[table_name] = int(table.get('row_count_exported') or 0)
        seen.add(csv_file)
    for csv_path in sorted(gold_data.glob('*.csv')):
        if csv_path.name in seen:
            continue
        with csv_path.open(newline='', encoding='utf-8-sig') as handle:
            headers = next(csv.reader(handle), [])
        if headers:
            rows[re.sub(r'[^A-Za-z0-9_$#]+', '_', csv_path.stem.upper()).strip('_')] = 1
    return rows


def parse_generated(work_dir):
    work = Path(work_dir)
    create_sql = (work / 'warehouse_create.sql').read_text()
    load_sql = (work / 'warehouse_load.sql').read_text()
    check_sql = (work / 'warehouse_check.sql').read_text()
    create_tables = set(re.findall(r'^CREATE TABLE "([^"]+)"', create_sql, re.MULTILINE))
    load_tables = set()
    for line in load_sql.splitlines():
        match = re.match(r'^LOAD TABLE (?:"([^"]+)"|([A-Z][A-Z0-9_$#]*)) ', line)
        if match:
            load_tables.add(match.group(1) or match.group(2))
    checks = {}
    for line in check_sql.splitlines():
        match = re.search(r'check_table\(\'"?([^"\']+)"?\', ([0-9]+)\);', line)
        if match:
            checks[match.group(1)] = int(match.group(2))
    return create_tables, load_tables, checks


class AdbDataProfileTests(unittest.TestCase):
    def run_generator(self, script, profile, ingestion_dir=None):
        with tempfile.TemporaryDirectory() as tmp:
            function_file = Path(tmp) / 'generate-function.sh'
            function_file.write_text(extract_generate_function(script))
            driver = Path(tmp) / 'driver.sh'
            driver.write_text(textwrap.dedent('''\
                set -euo pipefail
                log() { printf '[adb-load] %s\\n' "$*" >&2; }
                WORK_DIR="$1"
                INGESTION_DIR="$2"
                WAREHOUSE_DATA_PROFILE="$3"
                source "$4"
                generate_warehouse_sql
            '''))
            result = subprocess.run(
                ['bash', str(driver), tmp, str(ingestion_dir or ROOT / 'ingestion'), profile, str(function_file)],
                capture_output=True,
                text=True,
                timeout=10,
            )
            files = {}
            for name in ('warehouse_create.sql', 'warehouse_load.sql', 'warehouse_check.sql'):
                path = Path(tmp) / name
                if path.exists():
                    files[name] = path.read_text()
            return result, files

    def run_full_script_until_profile_validation(self, script, profile):
        with tempfile.TemporaryDirectory() as tmp:
            env = {
                'PATH': '/usr/bin:/bin:/usr/sbin:/sbin',
                'INGESTION_DIR': tmp,
                'ADB_WAREHOUSE_DATA_PROFILE': profile,
                'ONNX_MODEL_URL': 'https://example.invalid/model.onnx',
            }
            result = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, timeout=10)
            log_file = Path(tmp) / 'logs/adb-load.log'
            return result, log_file.read_text() if log_file.exists() else ''

    def assert_profile_sql(self, script, profile, expected_loads):
        result, files = self.run_generator(script, profile)
        self.assertEqual(result.returncode, 0, result.stderr)
        create_tables, load_tables, checks = parse_generated_from_text(files)
        all_tables = set(manifest_tables())
        self.assertEqual(create_tables, all_tables)
        self.assertEqual(load_tables, expected_loads)
        self.assertEqual(set(checks), expected_loads)
        rows = manifest_tables()
        self.assertEqual(checks, {table: rows[table] for table in expected_loads})

    def test_demo_profile_creates_all_schemas_and_loads_baseline_for_both_scripts(self):
        for script in SCRIPTS:
            with self.subTest(script=script):
                self.assert_profile_sql(script, 'demo', BASELINE_TABLES)

    def test_full_profile_loads_every_manifest_table_for_both_scripts(self):
        all_tables = set(manifest_tables())
        for script in SCRIPTS:
            with self.subTest(script=script):
                self.assert_profile_sql(script, 'full', all_tables)

    def test_invalid_profile_is_rejected_before_bootstrap_for_both_scripts(self):
        for script in SCRIPTS:
            with self.subTest(script=script):
                result, log = self.run_full_script_until_profile_validation(script, 'everything')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Invalid ADB_WAREHOUSE_DATA_PROFILE=everything; expected demo or full.', log)
                self.assertNotIn('Starting one-time ADB SQLcl bootstrap', log)

    def test_demo_profile_fails_without_manifest_for_both_scripts(self):
        for script in SCRIPTS:
            with self.subTest(script=script):
                with tempfile.TemporaryDirectory() as tmp:
                    gold = Path(tmp) / 'gold-data'
                    gold.mkdir()
                    (gold / 'DIM_PRODUCT.csv').write_text('ID,NAME\n1,A\n')
                    result, files = self.run_generator(script, 'demo', Path(tmp))
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('Cannot use demo warehouse data profile because', result.stderr)
                    self.assertIn('_export_manifest.json is unavailable', result.stderr)
                    self.assertEqual(files, {})

    def test_full_profile_uses_legacy_fallback_without_manifest_for_both_scripts(self):
        for script in SCRIPTS:
            with self.subTest(script=script):
                with tempfile.TemporaryDirectory() as tmp:
                    gold = Path(tmp) / 'gold-data'
                    gold.mkdir()
                    for table in ('DIM_PRODUCT', 'OPTIONAL_TABLE', 'PRODUCT_VECTOR_STORE'):
                        (gold / f'{table}.csv').write_text('ID,NAME\n1,A\n')
                    result, files = self.run_generator(script, 'full', Path(tmp))
                    self.assertEqual(result.returncode, 0, result.stderr)
                    create_tables, load_tables, checks = parse_generated_from_text(files)
                    self.assertEqual(create_tables, set())
                    self.assertEqual(load_tables, {'DIM_PRODUCT', 'OPTIONAL_TABLE', 'PRODUCT_VECTOR_STORE'})
                    self.assertEqual(checks, {'DIM_PRODUCT': 1, 'OPTIONAL_TABLE': 1, 'PRODUCT_VECTOR_STORE': 1})


def parse_generated_from_text(files):
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for name, text in files.items():
            (work / name).write_text(text)
        return parse_generated(work)


if __name__ == '__main__':
    unittest.main()
