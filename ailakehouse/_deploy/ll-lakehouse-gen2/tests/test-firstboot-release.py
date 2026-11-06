#!/usr/bin/env python3
"""Focused tests for the first-boot host payload."""

import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo


SCRIPT = Path(__file__).resolve().parents[1] / 'bootstrap/firstboot.py'
spec = importlib.util.spec_from_file_location('peakgear_firstboot', SCRIPT)
firstboot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(firstboot)


class ReleaseTests(unittest.TestCase):
    def make_zip(self, root, extra=None):
        archive = root / 'release.zip'
        with ZipFile(archive, 'w') as bundle:
            for name in firstboot.REQUIRED:
                bundle.writestr(name, 'x')
            for name, data in (extra or {}).items():
                bundle.writestr(name, data)
        return archive

    def test_install_preserves_host_bootstrap(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            (home / 'bootstrap').mkdir()
            (home / 'bootstrap/aihub-image-default.env').write_text('AIHUB=true\n')
            archive = self.make_zip(home)
            firstboot.install_payload(archive, home)
            self.assertTrue((home / '.peakgear-release-payload-installed').is_file())
            self.assertTrue((home / 'ingestion/.oci_wallet_required').is_file())
            self.assertTrue((home / 'init/adb-wallet.service').is_file())
            self.assertEqual((home / 'bootstrap/aihub-image-default.env').read_text(), 'AIHUB=true\n')
            firstboot.install_payload(archive, home)  # retry is idempotent

    def test_rejects_traversal_and_symlink_before_install(self):
        with tempfile.TemporaryDirectory() as temp:
            home = Path(temp)
            for name in ('../escape', 'init/../escape', '/tmp/escape'):
                archive = self.make_zip(home, {name: 'bad'})
                with self.subTest(name=name), self.assertRaises(RuntimeError):
                    firstboot.install_payload(archive, home)
                self.assertFalse((home / 'init').exists())
            link = ZipInfo('init/unsafe-link')
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive = self.make_zip(home)
            with ZipFile(archive, 'a') as bundle:
                bundle.writestr(link, '../../escape')
            with self.assertRaises(RuntimeError):
                firstboot.install_payload(archive, home)
            self.assertFalse((home / 'init').exists())

    def test_metadata_requires_https_object_storage_url_only(self):
        with patch.object(firstboot, 'metadata_value', return_value='http://objectstorage.us-ashburn-1.oraclecloud.com/o/r.zip') as metadata:
            with self.assertRaises(RuntimeError):
                firstboot.release_url()
            metadata.assert_called_once_with('release_zip_url')
        with patch.object(firstboot, 'metadata_value', return_value='https://objectstorage.us-ashburn-1.oraclecloud.com/o/r.zip') as metadata:
            self.assertEqual(firstboot.release_url(), 'https://objectstorage.us-ashburn-1.oraclecloud.com/o/r.zip')
            metadata.assert_called_once_with('release_zip_url')


if __name__ == '__main__':
    unittest.main()
