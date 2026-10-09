#!/usr/bin/env python3
"""Offline checks of the production retry wrapper with shortened deadlines."""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'init/retry-provision-step.sh'


class RetryTests(unittest.TestCase):
    def run_step(self, command, window='3', interval='1'):
        return subprocess.run(
            ['bash', str(SCRIPT), 'test-seed', 'bash', '-c', command],
            env={**os.environ, 'PROVISION_RETRY_TIMEOUT_SECONDS': window,
                 'PROVISION_RETRY_INTERVAL_SECONDS': interval},
            capture_output=True, text=True, timeout=15)

    def test_success_stops_immediately(self):
        result = self.run_step('exit 0')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count('attempt '), 1)

    def test_transient_failure_recovers(self):
        with tempfile.TemporaryDirectory() as directory:
            counter = Path(directory) / 'count'
            result = self.run_step(
                f'n=$(cat "{counter}" 2>/dev/null || echo 0); n=$((n+1)); '
                f'echo "$n" > "{counter}"; [ "$n" -ge 3 ]', window='8')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(counter.read_text().strip(), '3')

    def test_permanent_failure_stops_at_deadline(self):
        started = time.monotonic()
        result = self.run_step('exit 1')
        self.assertEqual(result.returncode, 124, result.stderr)
        self.assertIn('timed out after 3s', result.stderr)
        self.assertLess(time.monotonic() - started, 8)

    def test_hung_command_and_child_are_stopped(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'late-success'
            started = time.monotonic()
            result = self.run_step(f'sleep 4; touch "{marker}"', window='1')
            self.assertEqual(result.returncode, 124, result.stderr)
            self.assertLess(time.monotonic() - started, 3)
            time.sleep(4)
            self.assertFalse(marker.exists())

    def test_invalid_deadline_rejected(self):
        result = self.run_step('exit 0', window='0')
        self.assertEqual(result.returncode, 2)

    def test_production_defaults_and_service_gates(self):
        text = SCRIPT.read_text()
        self.assertIn('PROVISION_RETRY_TIMEOUT_SECONDS:-1200', text)
        self.assertIn('PROVISION_RETRY_INTERVAL_SECONDS:-30', text)
        for name in ['iceberg-seed', 'pg-ai-catalog-bronze']:
            unit = (ROOT / f'init/{name}.service').read_text()
            self.assertIn('retry-provision-step.sh', unit)
            self.assertIn('TimeoutStartSec=1230', unit)
            self.assertNotIn('Restart=on-failure', unit)
        unit = (ROOT / 'init/pg-iceberg-connection.service').read_text()
        self.assertIn('Requires=iceberg-seed.service', unit)
        unit = (ROOT / 'init/pg-medallion-project.service').read_text()
        self.assertIn('Requires=pg-iceberg-connection.service pg-ai-catalog-bronze.service', unit)


if __name__ == '__main__':
    unittest.main()
