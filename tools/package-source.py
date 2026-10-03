"""Package tracked source files into a deterministic ZIP, with a checked manifest.

Maintainer command: python tools/package-source.py. Requires Git and Python 3.11+.
Does not run film generation or access provider accounts.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.check_output(['git', '-C', str(root), *args])


check = sys.argv[1:] == ['--check']
if sys.argv[1:] not in ([], ['--check']):
    raise ValueError('Usage: python tools/package-source.py [--check]')
if not check:
    dirty = git('status', '--porcelain=v1', '-z').decode('utf-8').split('\0')
    if any(entry and entry[3:] != 'MANIFEST.json' for entry in dirty):
        raise ValueError('Commit source changes before packaging. Only MANIFEST.json may differ.')
entries = git('ls-tree', '-rz', '--full-tree', 'HEAD').split(b'\0')
source = {}
for entry in entries:
    if not entry:
        continue
    metadata, raw_name = entry.split(b'\t', 1)
    mode, kind, oid = metadata.split()
    name = raw_name.decode('utf-8')
    if name == 'MANIFEST.json':
        continue
    if kind != b'blob' or mode not in (b'100644', b'100755'):
        raise ValueError(f'Expected a regular committed file: {name}')
    source[name] = (git('cat-file', 'blob', oid.decode()), int(mode, 8))
version = json.loads(source['package.json'][0])['version']
files = sorted(source)
payload = []
for name in files:
    parts = Path(name).parts
    if any(p in ('.git', 'node_modules', 'out', 'dist', '.cache') for p in parts):
        raise ValueError(f'Unwanted release path: {name}')
    if any(p.startswith('.env') and p != '.env.example' for p in parts):
        raise ValueError(f'Environment file in release: {name}')
    data = source[name][0]
    payload.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
manifest = {'name': 'cinematic-film-kit', 'version': version, 'files': payload}
manifest_bytes = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
if check:
    committed = json.loads(git('show', 'HEAD:MANIFEST.json'))
    if committed != manifest:
        raise ValueError('Committed MANIFEST.json does not match the committed source.')
    print(f'{len(payload)} committed files match the manifest')
    raise SystemExit(0)
(root / 'MANIFEST.json').write_bytes(manifest_bytes)
directory = root / 'dist'
directory.mkdir(exist_ok=True)
archive = directory / f'cinematic-film-kit-{version}.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for name in sorted(files + ['MANIFEST.json']):
        entry = zipfile.ZipInfo('cinematic-film-kit/' + name, date_time=(2026, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        data, mode = (manifest_bytes, 0o100644) if name == 'MANIFEST.json' else source[name]
        entry.external_attr = mode << 16
        bundle.writestr(entry, data, compresslevel=9)
with zipfile.ZipFile(archive) as bundle:
    for file in payload:
        if hashlib.sha256(bundle.read('cinematic-film-kit/' + file['path'])).hexdigest() != file['sha256']:
            raise ValueError(f"ZIP hash mismatch: {file['path']}")
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
print(f'{len(payload)} files checked; {archive.name}: {checksum}')
