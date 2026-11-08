"""Package the localized bound Apps Script prototype, with no runtime asset requests."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent
VERSION = '0.2.0'


def rendered_files():
    """Return deterministic installation bytes; used by package verification too."""
    manifest = json.loads((ROOT / 'appsscript.json').read_text())
    assert manifest['runtimeVersion'] == 'V8'
    assert set(manifest['oauthScopes']) == {
        'https://www.googleapis.com/auth/documents.currentonly',
        'https://www.googleapis.com/auth/script.container.ui',
    }
    sources = json.loads((PROJECT / 'i18n/source.json').read_text())
    office = set(json.loads((PROJECT / 'i18n/sources/office.json').read_text()))
    locales = json.loads((PROJECT / 'i18n/locales.json').read_text())
    assert len(locales) == 52
    catalogs = {}
    dependencies = [ROOT / 'build.py', ROOT / 'Code.gs', ROOT / 'Sidebar.html',
                    ROOT / 'appsscript.json', ROOT / 'README.md', ROOT / 'README-RU.md',
                    PROJECT / 'LICENSE', PROJECT / 'src/i18n.js',
                    PROJECT / 'src/i18n.css', PROJECT / 'i18n/source.json',
                    PROJECT / 'i18n/sources/office.json', PROJECT / 'i18n/locales.json']
    for locale in locales:
        code = locale['code']
        if code == 'en':
            catalogs[code] = {source: source for source in sorted(office)}
            continue
        path = PROJECT / 'i18n/catalogs' / f'{code}.json'
        translations = json.loads(path.read_text())
        dependencies.append(path)
        override_path = PROJECT / 'i18n/overrides' / f'{code}.json'
        if override_path.exists():
            translations.update(json.loads(override_path.read_text()))
            dependencies.append(override_path)
        missing = [key for key, source in sources.items() if source in office and not translations.get(key)]
        if missing:
            raise ValueError(f'{code}: missing {len(missing)} Office interface translations')
        catalogs[code] = {source: translations[key] for key, source in sources.items() if source in office}
    missing_sources = office - set(sources.values())
    if missing_sources:
        raise ValueError(f'Office source catalog is incomplete: {sorted(missing_sources)}')
    # No document data in provenance. Hash actual inputs to make stale bundles detectable.
    provenance = {str(path.relative_to(PROJECT)): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in dependencies}
    fingerprint = hashlib.sha256(json.dumps(provenance, sort_keys=True).encode()).hexdigest()
    header = f'CTT localized build {VERSION}; source-sha256={fingerprint}'
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    engine = (PROJECT / 'src/i18n.js').read_text().replace('</script', '<\\/script')
    css = (PROJECT / 'src/i18n.css').read_text().replace('</style', '<\\/style')
    embedded = (f'<!-- {header} -->\n<style>{css}</style>\n'
                f'<script>window.CTT_I18N_EMBEDDED={encode(catalogs)};</script>\n'
                f'<script>{engine}</script>')
    sidebar = (ROOT / 'Sidebar.html').read_text()
    assert sidebar.count('<!-- CTT_EMBEDDED_I18N -->') == 1
    sidebar = sidebar.replace('<!-- CTT_EMBEDDED_I18N -->', embedded)
    menu = {code: {'Edit selected text': values['Edit selected text']} for code, values in catalogs.items()}
    server = (ROOT / 'Code.gs').read_text()
    assert server.count('/* CTT_MENU_I18N */ {}') == 1
    server = server.replace('/* CTT_MENU_I18N */ {}', encode(menu))
    server = f'// {header}\n' + server
    files = {name: (ROOT / name).read_bytes() for name in ('appsscript.json', 'README.md', 'README-RU.md')}
    files.update({'Code.gs': server.encode(), 'Sidebar.html': sidebar.encode(),
                  'LICENSE.txt': (PROJECT / 'LICENSE').read_bytes()})
    return files


def build():
    files = rendered_files()
    target = ROOT / 'dist' / f'compare-these-texts-google-docs-{VERSION}.zip'
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, 'w') as archive:
        for name, content in files.items():
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    print(target)
    return target


if __name__ == '__main__':
    build()
