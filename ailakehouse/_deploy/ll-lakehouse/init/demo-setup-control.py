#!/usr/bin/env python3
"""Publish provisioning status and consume a fixed retry request. No shell input."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess
import time

DIRECTORY = Path(os.environ.get('DEMO_SETUP_CONTROL_DIR', '/home/opc/ingestion/.demo-setup'))
STEPS = (
    ('pg-ai-data-catalog.service', 'Configure AI Catalog'),
    ('iceberg-seed.service', 'Seed Iceberg and prepare PG tables'),
    ('pg-ai-catalog-bronze.service', 'Seed Bronze data'),
    ('pg-iceberg-connection.service', 'Configure Data Transforms'),
    ('pg-medallion-project.service', 'Create Medallion project'),
)


def systemctl(*args):
    return subprocess.run(['systemctl', '--user', *args], check=True,
                          capture_output=True, text=True, timeout=15).stdout


def summarize(units):
    steps = []
    for unit, label in STEPS:
        props = units.get(unit, {})
        if props.get('LoadState') != 'loaded':
            return {'status': 'unavailable', 'message': 'Demo setup services are not installed.', 'steps': []}
        active = props.get('ActiveState')
        job = props.get('Job', '').split(' ')[0]
        if active in ('activating', 'deactivating', 'reloading') or job not in ('', '0'):
            state = 'running'
        elif active == 'failed' or props.get('Result', 'success') != 'success':
            state = 'failed'
        elif active == 'active' or (props.get('ExecMainExitTimestampMonotonic', '0') != '0'
                                   and props.get('ExecMainStatus') == '0'):
            state = 'ready'
        else:
            state = 'waiting'
        steps.append({'id': unit, 'label': label, 'status': state})
    running = next((step for step in steps if step['status'] == 'running'), None)
    failed = next((step for step in steps if step['status'] == 'failed'), None)
    if running:
        status, message = 'running', running['label'] + ' is in progress.'
    elif failed:
        status, message = 'failed', failed['label'] + ' failed. Retry demo setup to resume.'
    elif all(step['status'] == 'ready' for step in steps):
        status, message = 'ready', 'Demo setup is ready.'
    else:
        status, message = 'incomplete', 'Demo setup is incomplete. Retry to continue.'
    return {'status': status, 'message': message, 'steps': steps}


def snapshot():
    output = systemctl('show', *[unit for unit, _ in STEPS],
                       '--property=Id,LoadState,ActiveState,Result,Job,ExecMainStatus,ExecMainExitTimestampMonotonic')
    units = {}
    for block in output.strip().split('\n\n'):
        props = dict(line.split('=', 1) for line in block.splitlines() if '=' in line)
        units[props.get('Id')] = props
    return summarize(units)


def publish(status):
    status['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    temporary = DIRECTORY / 'status.tmp'
    temporary.write_text(json.dumps(status))
    temporary.chmod(0o644)
    temporary.replace(DIRECTORY / 'status.json')


def tick():
    status = snapshot()
    request = DIRECTORY / 'retry.request'
    if request.exists():
        if status['status'] in ('failed', 'incomplete'):
            # Start (never restart) preserves active jobs and completed oneshots.
            # Fixed unit names only; the request file's contents are never executed.
            systemctl('reset-failed', *[unit for unit, _ in STEPS])
            systemctl('start', '--no-block', *[unit for unit, _ in STEPS])
            status = snapshot()
            status.update(status='running', message='Resuming demo setup…')
        publish(status)
        request.unlink()
    else:
        publish(status)


def main():
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    with (DIRECTORY / 'controller.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        while True:
            try:
                tick()
            except (OSError, subprocess.SubprocessError):
                # Never publish command output or journal text: it can contain secrets.
                publish({'status': 'unavailable', 'message': 'Could not communicate with demo setup services.', 'steps': []})
            time.sleep(3)


if __name__ == '__main__':
    main()
