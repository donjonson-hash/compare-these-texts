"""Assemble the reviewed store kit after build/check and store asset capture."""
from pathlib import Path
import hashlib
import json
import struct
import zipfile
from store_metadata import load_localizations

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / 'extension-package/store'
VERSION = json.loads((ROOT / 'release.json').read_text())['version']


def main():
    catalog = load_localizations()
    files = {}
    for target in ('chrome', 'firefox'):
        path = ROOT / 'dist/downloads' / f'ctt-{target}-{VERSION}.zip'
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None, path
            assert json.loads(archive.read('manifest.json'))['version'] == VERSION
            assert 'welcome.html' in archive.namelist()
        files[path.name] = path.read_bytes()
    for locale in catalog:
        path = STORE / 'descriptions' / f'{locale}.txt'
        assert path.read_text().strip(), path
        files[f'descriptions/{locale}.txt'] = path.read_bytes()
        files[f'metadata/{locale}.json'] = (json.dumps(catalog[locale], ensure_ascii=False, indent=2) + '\n').encode()
    files['descriptions/README.md'] = (STORE / 'descriptions/README.md').read_bytes()
    files['localizations.json'] = (STORE / 'localizations.json').read_bytes()
    files['FULL-DESCRIPTION-EN.txt'] = files['descriptions/en.txt']
    files['CWS-LOCALIZATIONS.md'] = (ROOT / 'docs/CWS-LOCALIZATIONS.md').read_bytes()
    files['VERIFICATION.md'] = (ROOT / 'docs/STORE-KIT-VERIFICATION.md').read_bytes()
    storage_proof = (ROOT / 'test-output/encrypted-storage-check.json').read_bytes()
    storage_check = json.loads(storage_proof)
    assert storage_check['passed'] is True and storage_check['mode'] == 'extension', 'Run the installed-extension storage check before packaging'
    assert storage_check['version'] == VERSION, 'Storage check belongs to another release'
    assert storage_check['extension_sha256'] == hashlib.sha256(files[f'ctt-chrome-{VERSION}.zip']).hexdigest(), 'Storage check belongs to a different installation ZIP'
    assert not storage_check['externalRequests'], 'Offline check made external requests'
    assert {'encrypted-comparison-indexeddb', 'encrypted-legacy-migration-indexeddb', 'encrypted-single-indexeddb', 'encrypted-browser-restart'} <= set(storage_check['checks']), 'Missing encrypted storage browser checks'
    files['ENCRYPTED-STORAGE-CHECK.json'] = storage_proof
    for path in sorted(STORE.glob('*.md')):
        files[path.name] = path.read_bytes()
    files['TITLE-EN.txt'] = (catalog['en']['name'] + '\n').encode()
    files['SHORT-DESCRIPTION-EN.txt'] = (catalog['en']['description'] + '\n').encode()
    files['START-HERE-RU.md'] = (f'# Compare Two Texts {VERSION} — начните здесь\n\n'
        f'1. В Chrome Web Store загрузите только `ctt-chrome-{VERSION}.zip`. Не загружайте весь комплект.\n'
        '2. Следуйте SUBMISSION-RU.md: поля карточки, изображения, Privacy practices и заметки для ревьюера.\n'
        '3. Название и краткое описание берутся из manifest; копии есть в TITLE-EN.txt и SHORT-DESCRIPTION-EN.txt.\n'
        '4. Полное описание: FULL-DESCRIPTION-EN.txt; переводы: descriptions/.\n'
        '5. Иконка магазина: icon128.png. Пять screenshot-*.png и два promo-*.png готовы для загрузки.\n'
        '6. Welcome page уже внутри ZIP расширения и открывается при первой установке.\n'
        '7. Шифрование черновиков AES-GCM-256 включено автоматически. Старые черновики переносятся при открытии.\n'
        '8. AUDIT-RESULTS.json, ENCRYPTED-STORAGE-CHECK.json, VERIFICATION.md и SHA256SUMS.txt описывают проверки и точные файлы.\n\n'
        'Комплект не отправлен на модерацию. Настройки аккаунта и финальная отправка выполняются владельцем в кабинете.\n').encode()
    images = {
        'screenshot-documents-1280x800.png': (1280, 800),
        'screenshot-tables-1280x800.png': (1280, 800),
        'screenshot-welcome-1280x800.png': (1280, 800),
        'screenshot-editor-1280x800.png': (1280, 800),
        'screenshot-pdf-1280x800.png': (1280, 800),
        'promo-440x280.png': (440, 280),
        'promo-1400x560.png': (1400, 560),
    }
    capture = json.loads((STORE / 'images/capture.json').read_text())
    assert capture['version'] == VERSION, 'Recapture screenshots for this release'
    assert capture['extension_sha256'] == hashlib.sha256(files[f'ctt-chrome-{VERSION}.zip']).hexdigest(), 'Screenshots were captured from a different extension ZIP'
    captured = {item['file']: item['sha256'] for item in capture['images']}
    assert set(captured) == set(images), 'Capture manifest must cover every store image'
    files['SCREENSHOT-PROVENANCE.json'] = (STORE / 'images/capture.json').read_bytes()
    for name, dimensions in images.items():
        data = (STORE / 'images' / name).read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == dimensions, name
        assert len(data) < 800_000, (name, 'image exceeds kit size budget')
        assert captured[name] == hashlib.sha256(data).hexdigest(), (name, 'image changed after capture')
        files[name] = data
    for size in (16, 32, 48, 64, 128):
        name = f'icon-{size}.png' if size != 128 else 'icon-store-128.png'
        data = (ROOT / 'src' / name).read_bytes()
        assert struct.unpack('>II', data[16:24]) == (size, size), name
        files[f'icons/{name}'] = data
    files['icon128.png'] = files['icons/icon-store-128.png']
    provenance = json.loads((ROOT / 'dist/release/provenance.json').read_text())
    files['AUDIT-RESULTS.json'] = (json.dumps({'version': VERSION, 'source_commit': provenance['source_commit'], 'source_dirty': provenance['source_dirty'], 'capture_browser': capture['browser'], 'checks': {'archive_integrity': 'passed', 'encrypted_storage_in_installed_extension': 'passed', 'encrypted_legacy_migration': 'passed', 'encrypted_browser_restart': 'passed', 'manifest_version_and_root': 'passed', 'welcome_included': 'passed', 'localized_metadata': 'passed', 'screenshots_bound_to_exact_zip': 'passed', 'image_dimensions_and_size_budget': 'passed'}, 'store_submission': 'not_submitted', 'screenshots': list(images)}, indent=2) + '\n').encode()
    files['SHA256SUMS.txt'] = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(files.items())).encode()
    output = ROOT / 'artifacts'
    output.mkdir(exist_ok=True)
    destination = output / f'ctt-{VERSION}-store-kit.zip'
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(files)
    print(destination)


if __name__ == '__main__':
    main()
