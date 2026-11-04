#!/usr/bin/env python3
"""Package the image-only pilot and vendored OCR assets, with stable ZIP metadata."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
START = '''Compare Two Texts — экспериментальный OCR-пилот

Это отдельный прототип, НЕ обновление расширения и НЕ пакет Chrome Web Store.
Поддерживаются только PNG/JPEG (до 10 MiB, до 12 млн пикселей), английский
и русский языки. PDF непосредственно в этом пилоте не загружается.
Все компоненты OCR уже включены. npm и скачивание моделей не нужны.
После распаковки обработка работает локально, без облачного API.

Запуск (Linux/macOS, нужен Python 3):
1. Распакуйте ZIP.
2. Откройте терминал в папке ctt-ocr-pilot.
3. Выполните:
   python3 -m http.server 8787 --bind 127.0.0.1
4. Откройте в Chrome или Firefox:
   http://127.0.0.1:8787/
Остановка сервера: Ctrl+C в терминале. Не открывайте index.html через file://.

Проверка:
Загрузите fixtures/eng-paragraphs-a.png слева и eng-paragraphs-b.png справа.
Выберите язык, нажмите Recognize. Open full-size image открывает оригинал
в полном размере. Проверьте текст рядом с оригиналом, исправьте ошибки OCR,
нажмите Confirm checked text для каждого документа, затем Compare confirmed texts.
Download TXT сохраняет подтвержденный текст. Любая правка отменяет подтверждение.
Для русского примера используйте rus-paragraphs-a/b.png и язык Russian.

Набор fixtures содержит 24 СИНТЕТИЧЕСКИЕ страницы и эталонные тексты .txt.
Это учебные данные, а не реальные документы клиентов.
Layout: Single text block (PSM6) для одного блока; Automatic page layout
(PSM3) — экспериментальный режим разделения блоков/колонок. Он может менять
порядок строк в счетах. Универсально лучшего режима в проверке не найдено.
Двухколоночные страницы могут распознаваться в неверном порядке — проверяйте
результат вручную. Сравнение пилота по позициям строк: вставка строки может
сместить последующие строки. Это не финальный алгоритм Compare Two Texts.
Xiaomi-OCR-0 в этот архив НЕ включён.

Лицензия оригинального кода — LICENSE. Сторонние компоненты — THIRD-PARTY.txt.
SHA256SUMS.json содержит контрольные суммы файлов комплекта.
'''
NOTICES = '''Local evaluation bundle — third-party notices

Tesseract.js 7.0.0: https://github.com/naptha/tesseract.js
Apache-2.0; see node_modules/tesseract.js/LICENSE.md and dist/*.LICENSE.txt.

Tesseract.js-core 7.0.0: https://github.com/naptha/tesseract.js-core
Apache-2.0; see node_modules/tesseract.js-core/LICENSE.
The complete published core package is included unmodified.

@tesseract.js-data/eng and /rus 1.0.0:
https://github.com/naptha/tessdata
The npm package metadata declares MIT (preserved in each package.json).
Those npm tarballs do not contain a standalone MIT license text.
The upstream tessdata repository LICENSE is Apache-2.0; its full text is
included as TESSDATA-LICENSE, fetched from naptha/tessdata gh-pages/LICENSE,
Git blob 261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64, on 2026-11-04.
Only 4.0.0_best_int language files are included; README and metadata retained.

Original Compare Two Texts code remains governed by LICENSE.
No Playwright, Chromium binary, or Xiaomi model weights are bundled.
'''

def build(output):
    entries = {}
    def add(path, name=None):
        if not path.is_file():
            raise FileNotFoundError(path)
        entries[name or path.relative_to(ROOT).as_posix()] = path.read_bytes()
    for name in ['index.html', 'browser.mjs', 'TESSDATA-LICENSE']:
        add(ROOT / name)
    add(ROOT.parents[1] / 'LICENSE', 'LICENSE')
    for path in sorted((ROOT / 'fixtures').rglob('*')):
        if path.is_file():
            add(path)
    for name in ['tesseract.js', 'tesseract.js-core']:
        package = ROOT / 'node_modules' / name
        meta = json.loads((package / 'package.json').read_text())
        if meta['version'] != '7.0.0':
            raise ValueError(f'Unexpected {name} version')
        for path in sorted(package.rglob('*')):
            if path.is_file() and (name.endswith('-core') or path.parent.name == 'dist' or path.name in ['package.json', 'LICENSE.md']):
                add(path)
    for lang in ['eng', 'rus']:
        package = ROOT / 'node_modules' / '@tesseract.js-data' / lang
        if json.loads((package / 'package.json').read_text())['version'] != '1.0.0':
            raise ValueError('Unexpected language package version')
        for name in ['package.json', 'README.md', f'4.0.0_best_int/{lang}.traineddata.gz']:
            add(package / name)
    entries['START-HERE.txt'] = START.encode()
    entries['THIRD-PARTY.txt'] = NOTICES.encode()
    entries['SHA256SUMS.json'] = (json.dumps({k: hashlib.sha256(v).hexdigest() for k, v in sorted(entries.items())}, indent=2) + '\n').encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo('ctt-ocr-pilot/' + name, (2026, 11, 4, 0, 0, 0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data, compresslevel=9)
    print(f'{output}\n{output.stat().st_size} bytes\nSHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'results' / 'ctt-ocr-pilot.zip')
    build(parser.parse_args().output)
