#!/usr/bin/env python3
"""Install the host payload before enabling PeakGear user services."""

import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
from zipfile import ZipFile


HOME = Path('/home/opc')
METADATA = 'http://169.254.169.254/opc/v2/instance/metadata/'
MAX_EXPANDED_BYTES = 3 * 1024**3
REQUIRED = (
    'init/adb-wallet.service',
    'init/adb-load.service',
    'init/user-podman.service',
    'ingestion/compose.yml',
    'ingestion/backend/server.js',
    'ingestion/frontend/package.json',
)
UNITS = (
    'adb-wallet.service',
    'adb-load.service',
    'user-podman.service',
    'pg-ai-data-catalog.service',
    'pg-ai-catalog-bronze.service',
    'pg-iceberg-connection.service',
    'pg-medallion-project.service',
    'iceberg-seed.service',
    'demo-setup-control.service',
)
FOLLOW_ON_UNITS = (
    'pg-ai-data-catalog.service',
    'pg-ai-catalog-bronze.service',
    'pg-iceberg-connection.service',
    'pg-medallion-project.service',
    'iceberg-seed.service',
    'demo-setup-control.service',
)


def metadata_value(key):
    request = Request(METADATA + key, headers={'Authorization': 'Bearer Oracle'})
    try:
        with urlopen(request, timeout=10) as response:
            value = response.read(8192).decode('utf-8').strip()
    except Exception as exc:
        raise RuntimeError(f'Unable to read instance metadata key {key}') from exc
    if not value or '<html>' in value.lower():
        raise RuntimeError(f'Instance metadata key {key} is empty')
    return value


def release_url():
    url = metadata_value('release_zip_url')
    host = urlsplit(url).hostname or ''
    if urlsplit(url).scheme != 'https' or not (
        host.startswith('objectstorage.') and
        (host.endswith('.oraclecloud.com') or host.endswith('.oci.customer-oci.com'))
    ):
        raise RuntimeError('Release URL must be an HTTPS OCI Object Storage URL')
    return url


def download_archive(url, target):
    for attempt in range(1, 6):
        try:
            request = Request(url)
            with urlopen(request, timeout=60) as response, target.open('wb') as output:
                while block := response.read(1024 * 1024):
                    output.write(block)
            return
        except Exception as exc:
            target.unlink(missing_ok=True)
            if attempt == 5:
                raise RuntimeError('Release archive download failed after five attempts') from exc
            time.sleep(min(10 * attempt, 30))


def extract_payload(archive, stage):
    seen = set()
    total = 0
    with ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            name = entry.filename
            path = PurePosixPath(name)
            mode = entry.external_attr >> 16
            normalized = path.as_posix()
            kind = stat.S_IFMT(mode)
            if (name.startswith('/') or '\\' in name or '..' in path.parts or
                    not path.parts or kind not in (0, stat.S_IFREG, stat.S_IFDIR) or
                    normalized in seen):
                raise RuntimeError('Release archive has an unsafe payload member')
            if path.parts[0] not in ('init', 'ingestion'):
                continue  # Root documentation and build scripts are not VM payload.
            seen.add(normalized)
            total += entry.file_size
            if total > MAX_EXPANDED_BYTES:
                raise RuntimeError('Release archive exceeds the extracted size limit')
            destination = stage.joinpath(*path.parts)
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(entry) as source, destination.open('wb') as output:
                shutil.copyfileobj(source, output)
            if mode & 0o111:
                destination.chmod(0o755)
        for name in REQUIRED:
            if not (stage / name).is_file():
                raise RuntimeError(f'Release archive lacks required path {name}')


def install_payload(archive, home):
    payload_marker = home / '.peakgear-release-payload-installed'
    if payload_marker.is_file():
        if all((home / name).is_dir() for name in ('init', 'ingestion')):
            return
        raise RuntimeError('Release marker exists without complete payload')
    if any((home / name).exists() for name in ('init', 'ingestion')):
        raise RuntimeError('Unmarked release payload exists; refusing to overwrite it')
    with tempfile.TemporaryDirectory(prefix='.peakgear-stage-', dir=home) as temp:
        stage = Path(temp)
        extract_payload(archive, stage)
        (stage / 'init').replace(home / 'init')
        try:
            (stage / 'ingestion').replace(home / 'ingestion')
        except Exception:
            shutil.rmtree(home / 'init')
            raise
    wallet_marker = home / 'ingestion/.oci_wallet_required'
    wallet_marker.touch(mode=0o600)
    payload_marker.touch(mode=0o600)


def start_user_services(home):
    user_dir = home / '.config/systemd/user'
    user_dir.mkdir(parents=True, exist_ok=True)
    for name in UNITS:
        shutil.copy2(home / 'init' / name, user_dir / name)
    env = dict(os.environ, XDG_RUNTIME_DIR=f'/run/user/{os.getuid()}')

    def systemctl(*args):
        subprocess.run(('systemctl', '--user', *args), env=env, check=True)

    for attempt in range(10):
        try:
            systemctl('daemon-reload')
            break
        except subprocess.CalledProcessError:
            if attempt == 9:
                raise
            time.sleep(3)
    systemctl('enable', *UNITS)
    systemctl('start', 'adb-wallet.service')
    systemctl('start', 'adb-load.service')
    systemctl('start', 'user-podman.service')
    systemctl('start', '--no-block', *FOLLOW_ON_UNITS)


def main():
    url = release_url()
    if (HOME / '.peakgear-release-ready').exists():
        return
    if not (HOME / '.peakgear-release-payload-installed').exists():
        with tempfile.TemporaryDirectory(prefix='.peakgear-download-', dir=HOME) as temp:
            archive = Path(temp) / 'release.zip'
            download_archive(url, archive)
            install_payload(archive, HOME)
    else:
        if not all((HOME / name).is_dir() for name in ('init', 'ingestion')):
            raise RuntimeError('Installed release marker exists without complete payload')
    start_user_services(HOME)
    (HOME / '.peakgear-release-ready').touch(mode=0o600)
    print('PeakGear release installed and services started')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # The PAR is a credential. Never include the URL or the underlying
        # urllib exception in systemd logs.
        print(f'PeakGear first boot failed: {exc}', file=sys.stderr)
        raise SystemExit(1)
