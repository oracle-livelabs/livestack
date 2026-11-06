import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'init'))
import data_transform_import as imports


class Api:
    base = 'https://test.invalid'

    def __init__(self, statuses):
        self.statuses = iter(statuses)
        self.posts = 0
        self.gets = []

    def request(self, method, path, payload=None):
        if method == 'POST':
            self.posts += 1
            return {'sessionId': self.posts}
        self.gets.append(path)
        result = next(self.statuses)
        if isinstance(result, Exception):
            raise result
        return result if isinstance(result, dict) else {'status': result}


class Tests(unittest.TestCase):
    payload = {'modelCode': 'PG', 'reverseObjList': 'PRODUCTS'}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env = patch.dict(os.environ, {'DATA_TRANSFORMS_IMPORT_STATE_DIR': self.tmp.name})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_slow_job_is_submitted_only_once(self):
        api = Api(['RUNNING'] * 80 + ['DONE'])
        with patch.object(imports.time, 'sleep'):
            imports.import_model(api, self.payload)
        self.assertEqual(api.posts, 1)
        self.assertEqual(len(api.gets), 81)
        self.assertFalse(list(Path(self.tmp.name).glob('*.json')))

    def test_timeout_resumes_same_session(self):
        api = Api(['RUNNING', 'DONE'])
        with self.assertRaisesRegex(RuntimeError, 'resume this job'):
            imports.import_model(api, self.payload, timeout=0)
        imports.import_model(api, self.payload)
        self.assertEqual(api.posts, 1)
        self.assertEqual(api.gets, ['/jobs/sessionId/1'] * 2)

    def test_resume_only_without_pending_job_never_submits(self):
        api = Api([])
        self.assertIsNone(imports.import_model(api, {'modelCode': 'PG'}, resume_only=True))
        self.assertEqual(api.posts, 0)
        self.assertEqual(api.gets, [])

    def test_resume_only_finishes_pending_target_without_another_post(self):
        api = Api(['RUNNING', 'DONE'])
        with self.assertRaises(RuntimeError):
            imports.import_model(api, self.payload, timeout=0)
        imports.import_model(api, {'modelCode': 'PG'}, resume_only=True)
        self.assertEqual(api.posts, 1)
        self.assertEqual(api.gets, ['/jobs/sessionId/1'] * 2)

    def test_poll_failure_does_not_resubmit(self):
        api = Api([RuntimeError('HTTP 503'), 'DONE'])
        with self.assertRaisesRegex(RuntimeError, '503'):
            imports.import_model(api, self.payload)
        imports.import_model(api, self.payload)
        self.assertEqual(api.posts, 1)

    def test_failed_job_reports_error_immediately(self):
        api = Api([{'status': 'ERROR', 'errorMessage': 'ORA-00001 password=hidden'}])
        with patch.object(imports.time, 'sleep') as sleep:
            with self.assertRaisesRegex(RuntimeError, r'ORA-00001 password=\[REDACTED\]'):
                imports.import_model(api, self.payload)
            sleep.assert_not_called()

    def test_unknown_submission_does_not_resubmit(self):
        api = Api([])
        with patch.object(api, 'request', side_effect=RuntimeError('response lost')):
            with self.assertRaisesRegex(RuntimeError, 'response lost'):
                imports.import_model(api, self.payload)
        with self.assertRaisesRegex(RuntimeError, 'outcome unknown'):
            imports.import_model(api, self.payload)
        self.assertEqual(api.posts, 0)

    def test_different_table_waits_for_previous_job(self):
        api = Api(['RUNNING', 'DONE', 'DONE'])
        with self.assertRaises(RuntimeError):
            imports.import_model(api, self.payload, timeout=0)
        imports.import_model(api, dict(self.payload, reverseObjList='OTHER'))
        self.assertEqual(api.posts, 2)
        self.assertEqual(api.gets, ['/jobs/sessionId/1', '/jobs/sessionId/1', '/jobs/sessionId/2'])

    def test_concurrent_waiter_cannot_submit(self):
        api = Api([])
        with patch.object(imports.fcntl, 'flock', side_effect=BlockingIOError):
            with self.assertRaisesRegex(RuntimeError, 'Another process'):
                imports.import_model(api, self.payload)
        self.assertEqual(api.posts, 0)

    def test_new_schema_metadata_is_refreshed(self):
        script = ROOT / 'init/create-pg-iceberg-connection.sh'
        commands = r'''
source "$1"
WORK_DIR="$2"
PYTHON_BIN=python3
find_connection_id() { echo conn; }
log() { :; }
api_request() {
  if [[ "$1" == POST ]]; then
    printf '{"globalId":"gold-id"}' > "$4"
    touch "$WORK_DIR/created"
  elif [[ -e "$WORK_DIR/created" ]]; then
    printf '{"name":"pg-iceberg","globalId":"conn","schemas":[{"dataSchema":"gold","globalId":"gold-id"}]}' > "$4"
  else
    printf '{"name":"pg-iceberg","globalId":"conn","schemas":[]}' > "$4"
  fi
}
ensure_iceberg_gold_schema /api
'''
        subprocess.run(['bash', '-c', commands, 'test', str(script), self.tmp.name], check=True)
        detail = json.loads((Path(self.tmp.name) / 'iceberg-connection-detail.json').read_text())
        self.assertEqual(detail['schemas'][0]['dataSchema'], 'gold')


if __name__ == '__main__':
    unittest.main()
