"""Maintainer packaging checks. Run with Python 3.11+; no extra packages."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class SourcePackaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'tools').mkdir()
        shutil.copyfile(Path(__file__).with_name('package-source.py'), self.root / 'tools' / 'package-source.py')
        (self.root / 'package.json').write_text(json.dumps({'version': '0.1.0'}))
        (self.root / '.gitignore').write_text('dist/\n')
        (self.root / 'README.md').write_text('Public source\n')
        self.git('init', '-q')
        self.git('config', 'user.name', 'test')
        self.git('config', 'user.email', 'test@example.com')
        self.git('add', '.')
        self.git('commit', '-qm', 'initial source')

    def git(self, *args):
        subprocess.run(['git', '-C', str(self.root), *args], check=True, capture_output=True)

    def package(self, *args):
        return subprocess.run([sys.executable, str(self.root / 'tools' / 'package-source.py'), *args], capture_output=True, text=True)

    def test_dirty_source_cannot_enter_the_release(self):
        (self.root / 'README.md').write_text('Uncommitted material\n')
        self.assertNotEqual(self.package().returncode, 0)
        self.assertFalse((self.root / 'dist').exists())

    def test_committed_manifest_is_checked_and_zip_is_repeatable(self):
        self.assertEqual(self.package().returncode, 0)
        self.git('add', 'MANIFEST.json')
        self.git('commit', '-qm', 'release manifest')
        self.assertEqual(self.package('--check').returncode, 0)
        archive = self.root / 'dist' / 'cinematic-film-kit-0.1.0.zip'
        first = archive.read_bytes()
        self.assertEqual(self.package().returncode, 0)
        self.assertEqual(archive.read_bytes(), first)
        (self.root / 'README.md').write_text('Changed public source\n')
        self.git('add', 'README.md')
        self.git('commit', '-qm', 'changed source')
        self.assertNotEqual(self.package('--check').returncode, 0)


if __name__ == '__main__':
    unittest.main()
