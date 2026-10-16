"""Package the bound Apps Script prototype; no credentials or document data."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parent


def build():
    manifest = json.loads((ROOT / 'appsscript.json').read_text())
    assert manifest['runtimeVersion'] == 'V8'
    assert set(manifest['oauthScopes']) == {
        'https://www.googleapis.com/auth/documents.currentonly',
        'https://www.googleapis.com/auth/script.container.ui',
    }
    target = ROOT / 'dist' / 'compare-these-texts-google-docs-0.1.0.zip'
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, 'w') as archive:
        files = {name: ROOT / name for name in ('Code.gs', 'Sidebar.html', 'appsscript.json', 'README.md', 'README-RU.md')}
        files['LICENSE.txt'] = ROOT.parent / 'LICENSE'
        for name, source in files.items():
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())
    print(target)
    return target


if __name__ == '__main__':
    build()
