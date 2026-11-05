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
            first = control.summarize({**units(), control.STEPS[1][0]: {'LoadState': 'loaded', 'ActiveState': 'failed', 'Result': 'exit-code', 'Job': ''}})
            with patch.object(control, 'snapshot', side_effect=[first, {'status': 'running', 'steps': []}]):
                control.tick()
            failed_unit = control.STEPS[1][0]
            self.assertEqual(call.call_args_list[0].args, ('reset-failed', failed_unit))
            self.assertEqual(call.call_args_list[1].args, ('start', '--no-block', failed_unit))
            self.assertFalse(request.exists())
            self.assertNotIn('adb-load.service', call.call_args_list[1].args)

    def test_failed_step_retries_while_another_step_runs(self):
        data = units()
        failed_unit = control.STEPS[2][0]
        running_unit = control.STEPS[3][0]
        waiting_unit = control.STEPS[4][0]
        data[failed_unit].update(ActiveState='failed', Result='exit-code')
        data[running_unit].update(ActiveState='activating')
        data[waiting_unit].update(ActiveState='inactive', Result='success')
        first = control.summarize(data)
        self.assertEqual(first['status'], 'running')
        with tempfile.TemporaryDirectory() as directory, patch.object(control, 'DIRECTORY', Path(directory)), patch.object(control, 'systemctl') as call, patch.object(control, 'snapshot', side_effect=[first, first]):
            (Path(directory) / 'retry.request').touch()
            control.tick()
            self.assertEqual(call.call_args_list[0].args, ('reset-failed', failed_unit))
            self.assertEqual(call.call_args_list[1].args, ('start', '--no-block', failed_unit, waiting_unit))

    def test_running_and_ready_requests_without_failed_steps_do_not_restart(self):
        for state in ['running', 'ready']:
            with tempfile.TemporaryDirectory() as directory, patch.object(control, 'DIRECTORY', Path(directory)), patch.object(control, 'systemctl') as call, patch.object(control, 'snapshot', return_value={'status': state, 'steps': []}):
                (Path(directory) / 'retry.request').touch()
                control.tick()
                call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
