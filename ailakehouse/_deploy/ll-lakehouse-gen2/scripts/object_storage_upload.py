#!/usr/bin/env python3
"""Upload a ZIP through a bucket PAR and verify the stored bytes."""

import argparse
import hashlib
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


def upload_and_verify(archive, digest, par_file):
    if not par_file.is_file() or par_file.is_symlink():
        raise RuntimeError('PAR file is missing or unsafe')
    prefix = par_file.read_text().strip()
    parsed = urlsplit(prefix)
    host = parsed.hostname or ''
    if (parsed.scheme != 'https' or not host.startswith('objectstorage.') or
            not host.endswith('.oraclecloud.com') or not parsed.path.endswith('/o/') or
            parsed.query or parsed.fragment or parsed.username or parsed.password or
            any(char.isspace() for char in prefix)):
        raise RuntimeError('PAR file must contain one HTTPS OCI Object Storage bucket object prefix')
    object_url = prefix + quote(archive.name)
    try:
        request = Request(object_url, data=archive.read_bytes(), method='PUT',
                          headers={'Content-Type': 'application/zip'})
        with urlopen(request, timeout=120) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError('Object Storage did not accept the upload')
    except Exception:
        raise RuntimeError('Object Storage upload failed; local ZIP is intact') from None

    remote_digest = hashlib.sha256()
    try:
        with urlopen(Request(object_url), timeout=120) as response:
            while block := response.read(1024 * 1024):
                remote_digest.update(block)
    except Exception:
        raise RuntimeError('Upload may have succeeded, but read-back verification failed') from None
    if remote_digest.hexdigest() != digest:
        raise RuntimeError('Uploaded object SHA-256 differs from the local ZIP')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--par-file', type=Path, required=True)
    args = parser.parse_args()
    if not args.archive.is_file() or args.archive.suffix != '.zip':
        parser.exit(1, 'Archive must be an existing ZIP file\n')
    with args.archive.open('rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
    try:
        upload_and_verify(args.archive, digest, args.par_file)
    except RuntimeError as exc:
        parser.exit(1, f'{exc}\n')
    print(f'Uploaded {args.archive.name} and verified its remote SHA-256.')


if __name__ == '__main__':
    main()
