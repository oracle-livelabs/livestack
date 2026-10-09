import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('control', ROOT / 'init/demo-setup-control.py')
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


def units():
    return {unit: {'LoadState': 'loaded', 'ActiveState': 'active', 'Result': 'success', 'Job': ''} for unit, _ in control.STEPS}


class ControlTests(unittest.TestCase):
    def test_ready(self):
        self.assertEqual(control.summarize(units())['status'], 'ready')

    def test_failed(self):
        data = units(); data[control.STEPS[1][0]].update(ActiveState='failed', Result='timeout')
        self.assertEqual(control.summarize(data)['status'], 'failed')

    def test_queued_work_prevents_another_retry(self):
        data = units(); data[control.STEPS[-1][0]].update(ActiveState='inactive', Job='123 /job/123')
        self.assertEqual(control.summarize(data)['status'], 'running')

    def test_missing_services_unavailable(self):
        self.assertEqual(control.summarize({})['status'], 'unavailable')

    def test_completed_legacy_oneshot_is_ready(self):
        data = units(); data[control.STEPS[1][0]].update(ActiveState='inactive', ExecMainExitTimestampMonotonic='123', ExecMainStatus='0')
        self.assertEqual(control.summarize(data)['status'], 'ready')

    def test_request_contents_never_control_commands(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(control, 'DIRECTORY', Path(directory)), patch.object(control, 'systemctl') as call:
            request = Path(directory) / 'retry.request'
            request.write_text('rm -rf anything; restart adb-load.service')
            with patch.object(control, 'snapshot', side_effect=[{'status': 'failed'}, {'status': 'running', 'steps': []}]):
                control.tick()
            names = [unit for unit, _ in control.STEPS]
            self.assertEqual(call.call_args_list[0].args, ('reset-failed', *names))
            self.assertEqual(call.call_args_list[1].args, ('start', '--no-block', *names))
            self.assertFalse(request.exists())
            self.assertNotIn('adb-load.service', names)

    def test_running_and_ready_requests_do_not_restart(self):
        for state in ['running', 'ready']:
            with tempfile.TemporaryDirectory() as directory, patch.object(control, 'DIRECTORY', Path(directory)), patch.object(control, 'systemctl') as call, patch.object(control, 'snapshot', return_value={'status': state, 'steps': []}):
                (Path(directory) / 'retry.request').touch()
                control.tick()
                call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
