import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build-host-payload-zip.py'
spec = importlib.util.spec_from_file_location('host_payload_zip', SCRIPT)
payload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(payload)


class HostPayloadZipTests(unittest.TestCase):
    def make_source(self, root):
        for name in payload.REQUIRED:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('required\n')
        (root / 'ingestion/.env.backup').write_text('secret\n')
        (root / 'ingestion/db/wallet').mkdir(parents=True)
        (root / 'ingestion/db/wallet/cwallet.sso').write_text('secret\n')
        (root / 'ingestion/frontend/node_modules/example').mkdir(parents=True)
        (root / 'ingestion/frontend/node_modules/example/index.js').write_text('cached\n')
        generated = root / payload.GENERATED_JET / 'debug/ojcomponentcore.js'
        generated.parent.mkdir(parents=True)
        generated.write_text('generated\n')

    def test_builds_only_safe_host_payload_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'source'
            root.mkdir()
            self.make_source(root)
            output = Path(temp) / 'output'
            archive, digest = payload.build(root, output)
            with ZipFile(archive) as bundle:
                names = set(bundle.namelist())
            self.assertEqual(names, set(payload.REQUIRED))
            self.assertEqual(archive.name, 'peakgear-host.zip')
            same_archive, same_digest = payload.build(root, output)
            self.assertEqual((same_archive, same_digest), (archive, digest))
            (root / 'ingestion/compose.yml').write_text('updated\n')
            updated_archive, updated_digest = payload.build(root, output)
            self.assertEqual(updated_archive, archive)
            self.assertNotEqual(updated_digest, digest)

    def test_rejects_unexcluded_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'source'
            root.mkdir()
            self.make_source(root)
            (root / 'ingestion/linked.txt').symlink_to(root / 'ingestion/compose.yml')
            with self.assertRaisesRegex(RuntimeError, 'Unsafe payload file'):
                payload.build(root, Path(temp) / 'output')

    def test_cli_builds_from_selected_staged_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'staged'
            root.mkdir()
            self.make_source(root)
            output = Path(temp) / 'output'
            subprocess.run((sys.executable, str(SCRIPT), '--source-dir', str(root),
                            '--output-dir', str(output)), check=True, capture_output=True)
            with ZipFile(output / 'peakgear-host.zip') as bundle:
                self.assertEqual(set(bundle.namelist()), set(payload.REQUIRED))



if __name__ == '__main__':
    unittest.main()
