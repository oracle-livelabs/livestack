#!/usr/bin/env python3
"""Build the first-boot ZIP containing only init/ and ingestion/."""

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import sys
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from bootstrap.firstboot import REQUIRED, extract_payload  # noqa: E402
from scripts.object_storage_upload import upload_and_verify  # noqa: E402


EXCLUDED_DIRS = {
    '.git', '.omx', '.operator', '.operator-shared', '.demo-setup',
    '.dt-import-jobs', '__pycache__', 'node_modules', 'dist', 'wallet',
    'source-tls', 'logs', 'tmp', 'output', 'uploads', 'oradata',
}
EXCLUDED_FILES = {
    '.DS_Store', '.npmrc', 'ojdbc.properties', 'tnsnames.ora',
    'sqlnet.ora', 'keystore.jks', 'truststore.jks',
}
EXCLUDED_SUFFIXES = ('.pem', '.key', '.p12', '.pfx', '.jks', '.sso', '.pyc', '.zip', '.done')
GENERATED_JET = Path('ingestion/frontend/public/jet/libs/oj/20.0.2')


def include_file(relative):
    name = relative.name
    return not (
        name.startswith('.env') or name in EXCLUDED_FILES or
        name.endswith(EXCLUDED_SUFFIXES)
    )


def payload_files(root):
    for top in ('init', 'ingestion'):
        base = root / top
        if not base.is_dir() or base.is_symlink():
            raise RuntimeError(f'Missing or unsafe payload directory: {top}')
        for current, dirs, files in os.walk(base, followlinks=False):
            current_path = Path(current)
            selected_dirs = []
            for name in sorted(dirs):
                child = current_path / name
                relative = child.relative_to(root)
                if name in EXCLUDED_DIRS or relative == GENERATED_JET:
                    continue
                if child.is_symlink():
                    raise RuntimeError(f'Symbolic link in payload: {relative}')
                selected_dirs.append(name)
            dirs[:] = selected_dirs
            for name in sorted(files):
                source = current_path / name
                relative = source.relative_to(root)
                if not include_file(relative):
                    continue
                if source.is_symlink() or not source.is_file():
                    raise RuntimeError(f'Unsafe payload file: {relative}')
                yield source, relative


def build(root, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix='.peakgear-host-', suffix='.zip', dir=output_dir, delete=False) as temp:
        temporary_zip = Path(temp.name)
    try:
        with ZipFile(temporary_zip, 'w', compression=ZIP_DEFLATED, compresslevel=6) as bundle:
            for source, relative in payload_files(root):
                info = ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = ZIP_DEFLATED
                info.external_attr = (0o100755 if os.access(source, os.X_OK) else 0o100644) << 16
                with source.open('rb') as source_stream, bundle.open(info, 'w') as target_stream:
                    shutil.copyfileobj(source_stream, target_stream, length=1024 * 1024)
        with tempfile.TemporaryDirectory(prefix='.peakgear-host-check-', dir=output_dir) as stage:
            extract_payload(temporary_zip, Path(stage))
            for name in REQUIRED:
                if not (Path(stage) / name).is_file():
                    raise RuntimeError(f'Release ZIP is missing {name}')
        with temporary_zip.open('rb') as archive_stream:
            digest = hashlib.file_digest(archive_stream, 'sha256').hexdigest()
        destination = output_dir / 'peakgear-host.zip'
        if destination.exists():
            with destination.open('rb') as existing_stream:
                existing_digest = hashlib.file_digest(existing_stream, 'sha256').hexdigest()
            if existing_digest == digest:
                temporary_zip.unlink()
            else:
                temporary_zip.replace(destination)
        else:
            temporary_zip.replace(destination)
        return destination, digest
    finally:
        temporary_zip.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=ROOT,
                        help='Directory containing the init/ and ingestion/ payload')
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    parser.add_argument('--upload', action='store_true', help='Upload to the Object Storage PAR prefix in .par and verify by reading it back')
    parser.add_argument('--par-file', type=Path, default=ROOT / '.par')
    args = parser.parse_args()
    archive, digest = build(args.source_dir.resolve(), args.output_dir.resolve())
    print(f'Archive: {archive}')
    print(f'SHA-256: {digest}')
    print(f'Size: {archive.stat().st_size:,} bytes')
    if args.upload:
        try:
            upload_and_verify(archive, digest, args.par_file)
        except RuntimeError as exc:
            parser.exit(1, f'{exc}\n')
        print('Uploaded peakgear-host.zip and verified its remote SHA-256.')
    print('Set release_zip_url to the read-only object URL for peakgear-host.zip.')


if __name__ == '__main__':
    main()
