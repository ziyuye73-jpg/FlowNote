import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_release', ROOT / 'scripts/package_release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PlatformTests(unittest.TestCase):
    def test_native_launcher_handles_unicode_spaces_and_failure(self):
        with tempfile.TemporaryDirectory(prefix='FlowNote 测试 ') as tmp:
            root = Path(tmp)
            scripts = root / 'project with spaces' / 'scripts'
            shutil.copytree(ROOT / 'scripts', scripts, ignore=shutil.ignore_patterns('__pycache__'))
            recording = root / '中文 recording.json'
            recording.write_text(json.dumps({'producer': 'windows-record-replay', 'schemaVersion': 1,
                                            'steps': [{'action': 'navigate', 'url': 'https://example.test/'}]}), encoding='utf-8')
            output = root / '技能 output'
            if os.name == 'nt':
                command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                           str(scripts / 'Convert-Recording.ps1'), '-Recording', str(recording),
                           '-Name', 'test-flow', '-Output', str(output)]
            else:
                command = ['sh', str(scripts / 'convert-recording.sh'), str(recording),
                           '--name', 'test-flow', '--output', str(output)]
            env = dict(os.environ, FLOWNOTE_PYTHON=sys.executable)
            result = subprocess.run(command, env=env, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', errors='replace'))
            workflow = output / 'test-flow/references/workflow.json'
            before = workflow.read_bytes()
            self.assertEqual(json.loads(before)['status'], 'draft-needs-live-validation')
            # A failed conversion must reach the caller without modifying existing output.
            result = subprocess.run(command, env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(workflow.read_bytes(), before)

    def test_release_contains_both_launchers_and_no_local_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = release.package(Path(tmp) / 'FlowNote.zip')
            with ZipFile(output) as archive:
                names = archive.namelist()
                for entry in ('extension/manifest.json', '.codex-plugin/plugin.json',
                              'scripts/convert-recording.sh', 'scripts/Convert-Recording.ps1',
                              'skills/windows-record-replay/SKILL.md'):
                    self.assertIn('FlowNote/' + entry, names)
                self.assertFalse(any('__pycache__' in n or '/.git/' in n or 'recording.json' in n for n in names))
                self.assertIsNone(archive.testzip())
            with self.assertRaises(FileExistsError):
                release.package(output)


if __name__ == '__main__':
    unittest.main()
