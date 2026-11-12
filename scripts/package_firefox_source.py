"""Create a bounded, reproducible AMO source submission from a clean Git commit."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import platform
import subprocess
import sys
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
STAMP = (2026, 1, 1, 0, 0, 0)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


REBUILD = '''#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 - <<'PY'
from pathlib import Path
import hashlib,json
m=json.loads(Path('SOURCE-REVIEW.json').read_text())
for name,expected in m['source_files_sha256'].items():
    actual=hashlib.sha256(Path(name).read_bytes()).hexdigest()
    if actual != expected: raise SystemExit('Source file mismatch: '+name)
print('Source file hashes verified')
PY
# build.py records Git provenance after the extension ZIP has been created.
# The local review commit does not change any extension bytes and is not the
# original release commit; that is recorded separately in SOURCE-REVIEW.json.
if [ ! -d .git ]; then
    git init -q
    git add .
    git -c user.name='Local AMO reproduction' -c user.email='review@localhost' commit -q -m 'Imported AMO source snapshot'
fi
npm ci --ignore-scripts
npm run build
python3 - <<'PY'
from pathlib import Path
import hashlib,json,zipfile
m=json.loads(Path('SOURCE-REVIEW.json').read_text())
path=Path('dist/downloads')/m['firefox_archive']
with zipfile.ZipFile(path) as archive:
    names=archive.namelist()
    if len(names)!=len(set(names)): raise SystemExit('Duplicate archive member')
    actual={name:hashlib.sha256(archive.read(name)).hexdigest() for name in names}
    if actual!=m['firefox_files_sha256']: raise SystemExit('Rebuilt extension payload differs')
print('PASS: every Firefox archive member matches the release')
actual=hashlib.sha256(path.read_bytes()).hexdigest()
print('Archive SHA-256: '+actual)
if actual==m['firefox_archive_sha256']:
    print('PASS: complete ZIP is byte-identical')
else:
    print('ZIP container differs, but all member paths and bytes are identical; check Python/zlib versions.')
PY
'''


def main():
    if command('git', 'status', '--porcelain'):
        raise SystemExit('Commit all source changes before creating an AMO source archive.')
    release = json.loads((ROOT / 'release.json').read_text())
    version = release['version']
    archive_path = ROOT / 'dist/downloads' / f'ctt-firefox-{version}.zip'
    provenance = json.loads((ROOT / 'dist/release/provenance.json').read_text())
    commit = command('git', 'rev-parse', 'HEAD')
    if provenance['source_commit'] != commit or provenance['source_dirty']:
        raise SystemExit('Build from the current clean commit before packaging AMO sources.')
    if provenance['archives_sha256'].get(archive_path.name) != digest(archive_path.read_bytes()):
        raise SystemExit('The Firefox archive differs from the verified build provenance.')
    files = {}
    for name in command('git', 'ls-files', '-z').split('\0'):
        if not name:
            continue
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or any(part in {'.git', 'node_modules', 'dist', 'artifacts', 'test-output', '__pycache__'} for part in path.parts):
            raise SystemExit('Unexpected generated/private tracked path: ' + name)
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise SystemExit('Unsupported source entry: ' + name)
        files[name] = source.read_bytes()
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() or json.loads(archive.read('manifest.json'))['version'] != version:
            raise SystemExit('Invalid or stale Firefox archive')
        expected = {name: digest(archive.read(name)) for name in archive.namelist()}
    metadata = {
        'product': 'Compare Two Texts', 'version': version,
        'source_repository': 'https://github.com/donjonson-hash/compare-these-texts',
        'source_commit': commit, 'source_dirty': False,
        'build_environment': {
            'os': platform.freedesktop_os_release().get('PRETTY_NAME', platform.platform()) if sys.platform == 'linux' else platform.platform(),
            'architecture': platform.machine(), 'node': command('node', '--version'),
            'npm': command('npm', '--version'), 'python': platform.python_version(),
            'zlib': zlib.ZLIB_RUNTIME_VERSION,
        },
        'firefox_archive': archive_path.name,
        'firefox_archive_sha256': digest(archive_path.read_bytes()),
        'firefox_files_sha256': expected,
        'source_files_sha256': {name: digest(data) for name, data in sorted(files.items())},
    }
    files['SOURCE-REVIEW.json'] = (json.dumps(metadata, indent=2, ensure_ascii=False) + '\n').encode()
    files['REBUILD-FIREFOX.sh'] = REBUILD.encode()
    files['AMO-README.md'] = (f'# Compare Two Texts {version} — Firefox review sources\n\n'
        f'Release source commit: `{commit}`. The source tree was clean.\n\n'
        'Start with `docs/FIREFOX-SOURCE.md`. Run `sh REBUILD-FIREFOX.sh` from this directory.\n'
        f'The resulting package is `dist/downloads/{archive_path.name}`.\n\n'
        'Exact build environment, source hashes, expected archive hash and every expected\n'
        'Firefox member hash are recorded in `SOURCE-REVIEW.json`. No Git credentials,\n'
        'history, user documents, cached dependencies or prebuilt extension ZIPs are included.\n').encode()
    output = ROOT / 'artifacts' / f'ctt-firefox-{version}-source.zip'
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name == 'REBUILD-FIREFOX.sh' else 0o100644) << 16
            archive.writestr(info, data)
    print(output)


if __name__ == '__main__':
    main()
