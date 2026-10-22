"""Validate the reviewed CWS copy and generate Chrome i18n message files."""
import json
from pathlib import Path
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
LOCALES = frozenset(('en', 'de', 'fr', 'es', 'es_419', 'it', 'nl', 'sv', 'da',
                     'no', 'fi', 'ar', 'id', 'ru', 'pt_BR', 'pt_PT', 'ja',
                     'fil', 'vi', 'tr', 'th', 'ko'))


def load_localizations():
    catalog = json.loads((ROOT / 'extension-package/store/localizations.json').read_text())
    if set(catalog) != LOCALES:
        raise ValueError('Store locales differ from the reviewed language list')
    for locale, entry in catalog.items():
        if set(entry) != {'name', 'description'}:
            raise ValueError(f'Unexpected store fields: {locale}')
        for field, maximum in (('name', 75), ('description', 132)):
            value = entry[field]
            if not isinstance(value, str) or not value.strip() or value != value.strip():
                raise ValueError(f'Invalid store text: {locale}/{field}')
            if len(value.encode('utf-16-le')) // 2 > maximum:
                raise ValueError(f'Store text too long: {locale}/{field}')
            if any(unicodedata.category(char) in {'Cc', 'Cf'} for char in value):
                raise ValueError(f'Control character in store text: {locale}/{field}')
            if '$' in value or '__MSG_' in value:
                raise ValueError(f'Unexpected message substitution: {locale}/{field}')
        if not entry['name'].startswith('Compare These Texts — '):
            raise ValueError(f'Missing product brand: {locale}')
    release = json.loads((ROOT / 'release.json').read_text())
    if catalog['en'] != {field: release[field] for field in ('name', 'description')}:
        raise ValueError('English store text must match release.json')
    return catalog


def message_files():
    files = {}
    for locale, entry in load_localizations().items():
        title = 'CTT — Compare & Edit' if locale == 'en' else entry['name'].replace('Compare These Texts', 'CTT', 1)
        messages = {
            'extensionName': {'message': entry['name']},
            'extensionDescription': {'message': entry['description']},
            'actionTitle': {'message': title},
        }
        files[f'_locales/{locale}/messages.json'] = (json.dumps(messages, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    return files
