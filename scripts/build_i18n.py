#!/usr/bin/env python3
"""Collect English UI sources and build validated, offline language modules."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'i18n'

def collect():
    messages = set()
    for path in sorted((I18N / 'sources').glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        values = data if isinstance(data, list) else data.values()
        for value in values:
            if not isinstance(value, str):
                raise ValueError(f'{path}: English source must be a nonempty string')
            if value.strip():
                messages.add(value)
    result = {}
    for source in sorted(messages):
        key = hashlib.sha256(source.encode()).hexdigest()[:12]
        if key in result and result[key] != source:
            raise ValueError(f'English source ID collision: {key}')
        result[key] = source
    (I18N / 'source.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result

def slots(value):
    seen, stack = set(), []
    for closing, index in re.findall(r'<(/?)(\d+)>', value):
        if closing:
            if not stack or stack.pop() != index:
                raise ValueError('unbalanced rich text slots')
        else:
            if index in seen:
                raise ValueError('repeated rich text slot')
            seen.add(index)
            stack.append(index)
    if stack:
        raise ValueError('unclosed rich text slots')
    return seen

def validate(source, translated):
    if not isinstance(translated, str) or not translated.strip():
        raise ValueError('translation must be a nonempty string')
    if sorted(re.findall(r'\{(\w+)\}', source)) != sorted(re.findall(r'\{(\w+)\}', translated)):
        raise ValueError('translation placeholders differ from English')
    if slots(source) != slots(translated):
        raise ValueError('translation rich text slots differ from English')

def load_catalog(code, sources, allow_incomplete=False):
    path = I18N / 'catalogs' / (code + '.json')
    translated = dict(sources) if code == 'en' else (json.loads(path.read_text(encoding='utf-8')) if path.exists() else {})
    if not isinstance(translated, dict):
        raise ValueError(f'{path}: catalog must be an object')
    override_path = I18N / 'overrides' / (code + '.json')
    if override_path.exists():
        overrides = json.loads(override_path.read_text(encoding='utf-8'))
        if not isinstance(overrides, dict):
            raise ValueError(f'{override_path}: overrides must be an object')
        translated.update(overrides)
    missing = set(sources) - set(translated)
    extra = set(translated) - set(sources)
    if extra or (missing and not allow_incomplete):
        raise ValueError(f'{code}: {len(missing)} missing and {len(extra)} unknown source IDs')
    catalog = {}
    for key, source in sources.items():
        if key not in translated:
            continue
        try:
            validate(source, translated[key])
        except ValueError as error:
            raise ValueError(f'{code}:{key}: {error}') from error
        catalog[source] = translated[key]
    return catalog

def build(output, allow_incomplete=False):
    sources = json.loads((I18N / 'source.json').read_text(encoding='utf-8'))
    locales = json.loads((I18N / 'locales.json').read_text(encoding='utf-8'))
    # Validate the entire release before writing any module. Partial catalogs may
    # be built only through the explicit development flag, never silently.
    catalogs = {locale['code']: load_catalog(locale['code'], sources, allow_incomplete) for locale in locales}
    output.mkdir(parents=True, exist_ok=True)
    for code, catalog in catalogs.items():
        contents = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
        (output / ('i18n-' + code + '.mjs')).write_text('/* Generated offline UI catalog. */\nexport default ' + contents + ';\n', encoding='utf-8')
    return len(sources), len(locales)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect', action='store_true', help='Merge contributions into deterministic i18n/source.json; no modules built')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--allow-incomplete', action='store_true', help='Development only: omit missing translations and rely on English fallback')
    args = parser.parse_args()
    if args.collect:
        print(f'Collected {len(collect())} English UI sources')
    else:
        messages, locales = build(args.output, args.allow_incomplete)
        print(f'Built {locales} offline UI catalogs with {messages} English sources')

if __name__ == '__main__':
    main()
