"""Wait for a single persisted metadata import instead of submitting duplicates."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import time


def import_model(api, payload, timeout=900, interval=5, resume_only=False):
    # Scope state to the endpoint and model, not the individual table: imports
    # of different tables in the same model also share ODI reverse metadata.
    identity = api.base + ':' + payload['modelCode']
    key = hashlib.sha256(identity.encode()).hexdigest()
    root = Path(os.environ.get('DATA_TRANSFORMS_IMPORT_STATE_DIR',
                               '/home/opc/ingestion/.dt-import-jobs'))
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    state = root / (key + '.json')
    target = payload.get('reverseObjList')
    with (root / (key + '.lock')).open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another process is already waiting for this model import')
        deadline = time.monotonic() + timeout
        while True:
            if state.exists():
                pending = json.loads(state.read_text())
                if not pending.get('sessionId'):
                    raise RuntimeError('Import submission outcome unknown; inspect ODI jobs before retrying')
            else:
                if resume_only:
                    return None
                pending = {'target': target, 'sessionId': None}
                # Persist intent before POST: a lost response must not cause a
                # second submission. Only session IDs and table names are saved.
                _save(state, pending)
                job = api.request('POST', '/models/reverse/custom', payload)
                pending['sessionId'] = job.get('sessionId')
                _save(state, pending)
                if not pending['sessionId']:
                    raise RuntimeError('Import submission returned no session ID; inspect ODI jobs')
            session = pending['sessionId']
            job = api.request('GET', f'/jobs/sessionId/{session}')
            status = job.get('status')
            if status == 'DONE':
                state.unlink()
                if resume_only or pending['target'] == target:
                    return job
                continue
            if status in ('ERROR', 'FAILED', 'STOPPED', 'CANCELED', 'CANCELLED'):
                state.unlink()
                raise RuntimeError(f'Import session {session}: {status}: '
                                   + _safe_error(job.get('errorMessage') or 'No error detail returned'))
            if time.monotonic() >= deadline:
                raise RuntimeError(f'Import session {session} still {status} after {timeout}s; '
                                   'next attempt will resume this job, not submit another')
            time.sleep(interval)


def _save(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as handle:
        os.chmod(temporary, 0o600)
        json.dump(value, handle)
    temporary.replace(path)


def _safe_error(message):
    text = str(message)
    for name, value in os.environ.items():
        if re.search(r'password|passwd|secret|token|access_key', name, re.I) and len(value) >= 4:
            text = text.replace(value, '[REDACTED]')
    return re.sub(r'(?i)((?:password|passwd|secret|token)\s*[:=]\s*)\S+',
                  r'\1[REDACTED]', text)[:2000]
