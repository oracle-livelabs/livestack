#!/usr/bin/env python3
"""Exercise bootstrap retry behavior without OCI, SQLcl, or a real database."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(os.environ.get('CATALOG_SCRIPT', Path(__file__).resolve().parents[1] / 'init/configure-ai-data-catalog.sh'))
BASH = os.environ.get('TEST_BASH', shutil.which('bash'))


class StorageRetryTests(unittest.TestCase):
    def run_bootstrap(self, failures=0, enabled=True, registered=False):
        with tempfile.TemporaryDirectory(prefix='aicat-retry-test-') as directory:
            root = Path(directory)
            binary = root / 'bin'
            binary.mkdir()
            wallet = root / 'wallet'
            wallet.mkdir()
            (wallet / 'tnsnames.ora').write_text('ADW_TEST_high = test\n')
            env_file = root / 'env'
            env_file.write_text('\n'.join([
                'AI_DATA_CATALOG_ENABLED=' + str(enabled).lower(),
                'AI_DATA_CATALOG_REGISTER_STORAGE=true',
                'AI_DATA_CATALOG_URL=https://example.test/catalog',
                'AI_DATA_CATALOG_WAREHOUSE=s3://test-bucket',
                'GRAVITINO_S3_ENDPOINT=https://example.test',
                'GRAVITINO_S3_REGION=test-region',
                'GRAVITINO_S3_ACCESS_KEY_ID=fake-access',
                'GRAVITINO_S3_SECRET_ACCESS_KEY=fake-secret',
                'DBPASSWORD=fake-password', 'SERVICE_NAME=ADW_TEST_high',
            ]) + '\n')
            mocks = {
                'sql': '''#!/usr/bin/env bash
set -eu
if [[ "$*" == *register-storage.sql* ]]; then
  count=0
  [[ ! -f "$TEST_ROOT/attempts" ]] || read -r count < "$TEST_ROOT/attempts"
  count=$((count + 1))
  printf '%s\\n' "$count" > "$TEST_ROOT/attempts"
  if (( count <= TEST_FAILURES )); then
    echo 'ORA-20403: Authorization failed'
    exit 1
  fi
else
  echo downstream >> "$TEST_ROOT/downstream"
fi
echo 'PL/SQL procedure successfully completed.'
''',
                'sleep': '#!/usr/bin/env bash\nprintf "%s\\n" "$1" >> "$TEST_ROOT/delays"\n',
                'python3': '#!/usr/bin/env bash\necho access-checked >> "$TEST_ROOT/downstream"\n',
                'date': '#!/usr/bin/env bash\necho 2026-10-05T00:00:00Z\n',
            }
            for name, content in mocks.items():
                file = binary / name
                file.write_text(content)
                file.chmod(0o700)
            storage_marker = root / 'storage-marker'
            marker = root / 'catalog-marker'
            if registered:
                storage_marker.write_text('already registered\n')
            env = dict(os.environ, PATH=str(binary) + ':' + str(Path(BASH).parent) + ':' + os.environ['PATH'],
                       ENV_FILE=str(env_file), WALLET_DIR=str(wallet),
                       AI_DATA_CATALOG_MARKER_FILE=str(marker),
                       AI_DATA_CATALOG_STORAGE_MARKER_FILE=str(storage_marker),
                       TEST_ROOT=str(root), TEST_FAILURES=str(failures))
            result = subprocess.run([BASH, str(SCRIPT)], env=env, capture_output=True, text=True, timeout=15)
            attempts = int((root / 'attempts').read_text()) if (root / 'attempts').exists() else 0
            delays = (root / 'delays').read_text().splitlines() if (root / 'delays').exists() else []
            return result, attempts, delays, storage_marker.exists(), marker.exists(), (root / 'downstream').exists()

    def test_first_attempt_success_has_no_delay(self):
        result, attempts, delays, storage, catalog, downstream = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((attempts, delays, storage, catalog, downstream), (1, [], True, True, True))

    def test_transient_failure_retries_once_and_continues(self):
        result, attempts, delays, storage, catalog, downstream = self.run_bootstrap(failures=1)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((attempts, delays, storage, catalog, downstream), (2, ['60'], True, True, True))

    def test_second_failure_stops_without_success_markers(self):
        result, attempts, delays, storage, catalog, downstream = self.run_bootstrap(failures=9)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((attempts, delays, storage, catalog, downstream), (2, ['60'], False, False, False))
        self.assertIn('after 2 attempts', result.stderr)

    def test_disabled_does_not_attempt_registration(self):
        result, attempts, delays, storage, catalog, downstream = self.run_bootstrap(enabled=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((attempts, delays, storage, catalog, downstream), (0, [], False, False, False))

    def test_already_registered_is_not_registered_again(self):
        result, attempts, delays, storage, catalog, downstream = self.run_bootstrap(registered=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((attempts, delays, storage, catalog, downstream), (0, [], True, True, True))


if __name__ == '__main__':
    unittest.main()
