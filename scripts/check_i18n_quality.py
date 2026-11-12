#!/usr/bin/env python3
"""Audit offline UI translations without contacting any external service.

Structural findings are release errors. English residue, literal changes and script
heuristics are review candidates, not evidence of incorrect translation. This is
an automated audit; it does not certify native-language editorial quality.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
_SPEC = importlib.util.spec_from_file_location('ctt_build_i18n', ROOT / 'scripts/build_i18n.py')
BUILDER = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(BUILDER)
BRANDS = (
    'Compare Two Texts', 'Google Chrome', 'Chrome Web Store', 'Microsoft Word',
    'Microsoft Edge', 'Google Docs', 'Google Sheets', 'Google Drive',
    'Google Analytics', 'Google Workspace', 'Apps Script', 'Office.js',
    'Noto Sans', 'OpenAI', 'ChatGPT', 'Firefox', 'Safari', 'Chromium',
    'LibreOffice', 'PowerPoint', 'OneDrive', 'Carlito', 'Calibri', 'Google',
    'Microsoft', 'Chrome', 'Excel', 'macOS', 'Windows', 'MacBook', 'Android',
    'iPhone', 'iPad', 'DOCX', 'XLSX', 'PDF', 'CSV', 'TXT', 'OCR', 'JSON',
    'URL', 'HTML', 'UTF-8', 'A/B', 'JavaScript', 'CTT',
)
BRAND_PATTERN = re.compile('|'.join(re.escape(value) for value in sorted(BRANDS, key=len, reverse=True)))
BRAND_MEANING_PATTERN = re.compile(BRAND_PATTERN.pattern + r'|\bWord\b|\bEdge\b|Noto Emoji', re.I)
DOMAIN_PATTERN = re.compile(r'\b(?:[a-z0-9-]+\.)+(?:com|pro|org|net|dev|io)\b', re.I)
IDENTIFIER_PATTERN = re.compile(r'\b[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+\b')
TOKEN_PATTERN = re.compile(r'ZXQ\s*\d*\s*QXZ|ZXQ\d|\dQXZ|__\s*CTT[_\s]*P\s*\d+\s*__|\[\s*CTT\s*\d{4,}(?:BEGIN|END)?\s*\]|\[\[\s*\d{12}\s*\]\]', re.I)
PLACEHOLDER_PATTERN = re.compile(r'\{\w+\}')
SLOT_PATTERN = re.compile(r'</?\d+>')
URL_PATTERN = re.compile(r'https?://[^\s<>]+')
DECODE_ARTIFACT_PATTERN = re.compile('[⁇\ufffd]')
REPEATED_WORD_PATTERN = re.compile(r'\b([^\W\d_]+)(?:[\s,·;.!?]+\1){7}\b', re.I)
EXTENSION_PATTERN = re.compile(r'\.(?:docx|doc|pdf|xlsx|xls|csv|tsv|txt|json|zip|xml|html|mjs|js)\b', re.I)
TECHNICAL_PATTERN = re.compile(r'\b(?:TSV|UTF-?16|USD|EUR|GBP|RUB|CAD|AUD|CHF|JPY|CNY|SHA-?256|SHA|XML|SVG|CSS|HTTP|HTTPS|CSP|API|BOM|CRLF|LF|RTL|LTR|ID|IDs|OK|MB|KB|GB|px|pt|ISO|UTF-?8|PDFKit|PDFium|Tesseract|PDF\.js|pdf-lib|IndexedDB|localStorage)\b')
# Language-related scripts are a coarse sanity check only. Latin-language
# dictionaries would incorrectly flag many valid cognates, so are not guessed.
SIDE_LABEL_PATTERN = re.compile(r'(?<=>)[AB](?=<)|\b[AB](?=\s*[:·])|\b[AB](?=\s*[-−→←↔]\s*[AB]\b)|(?<=[-−→←↔] )[AB]\b|^[AB]$')
SCRIPT_RANGES = {
    'am': r'[\u1200-\u137f]', 'ar': r'[\u0600-\u06ff]',
    'fa': r'[\u0600-\u06ff]', 'he': r'[\u0590-\u05ff]',
    'bg': r'[\u0400-\u04ff]', 'ru': r'[\u0400-\u04ff]',
    'uk': r'[\u0400-\u04ff]', 'sr': r'[\u0400-\u04ff]',
    'bn': r'[\u0980-\u09ff]', 'gu': r'[\u0a80-\u0aff]',
    'hi': r'[\u0900-\u097f]', 'mr': r'[\u0900-\u097f]',
    'kn': r'[\u0c80-\u0cff]', 'ml': r'[\u0d00-\u0d7f]',
    'ta': r'[\u0b80-\u0bff]', 'te': r'[\u0c00-\u0c7f]',
    'th': r'[\u0e00-\u0e7f]', 'el': r'[\u0370-\u03ff\u1f00-\u1fff]',
    'ja': r'[\u3040-\u30ff\u3400-\u9fff]',
    'ko': r'[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]',
    'zh_CN': r'[\u3400-\u9fff]', 'zh_TW': r'[\u3400-\u9fff]',
}


def meaningful(value):
    """Remove literals whose deliberate English spelling does not need translation."""
    text = PLACEHOLDER_PATTERN.sub(' ', SLOT_PATTERN.sub(' ', value))
    text = URL_PATTERN.sub(' ', text)
    text = EXTENSION_PATTERN.sub(' ', text)
    text = DOMAIN_PATTERN.sub(' ', text)
    text = IDENTIFIER_PATTERN.sub(' ', text)
    text = BRAND_MEANING_PATTERN.sub(' ', text)
    text = TECHNICAL_PATTERN.sub(' ', text)
    text = re.sub(r'\b[A-Z](?:\b|(?=[^a-z]))', ' ', text)
    return text


def english_words(value):
    return re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", meaningful(value))


def same_text(a, b):
    return ' '.join(unicodedata.normalize('NFKC', a).split()).casefold() == ' '.join(unicodedata.normalize('NFKC', b).split()).casefold()


def prose(value):
    words = english_words(value)
    return len(words) >= 2 and sum(map(len, words)) >= 8


def english_overlap(source, translated):
    source_words = [word.lower() for word in english_words(source)]
    translated_words = [word.lower() for word in english_words(translated)]
    if len(source_words) < 6 or len(translated_words) < 4:
        return None
    ngrams = {' '.join(source_words[index:index + 4]) for index in range(len(source_words) - 3)}
    for index in range(len(translated_words) - 3):
        phrase = ' '.join(translated_words[index:index + 4])
        if phrase in ngrams:
            return phrase
    return None


def audit(catalog_root, sample_limit=12):
    sources = json.loads((catalog_root / 'source.json').read_text(encoding='utf-8'))
    locales = json.loads((catalog_root / 'locales.json').read_text(encoding='utf-8'))
    report = {
        'audit_kind': 'automated structural and linguistic heuristics; not native-language verification',
        'source_sha256': hashlib.sha256((catalog_root / 'source.json').read_bytes()).hexdigest(),
        'source_messages': len(sources),
        'locale_count': len(locales),
        'totals': {'expected_translations': 0, 'present_translations': 0, 'missing_translations': 0, 'structural_errors': 0, 'token_residue': 0, 'suspect_english_messages': 0, 'suspect_english_files': 0, 'review_candidates': 0},
        'locales': {},
    }
    for locale in locales:
        code = locale['code']
        catalog_path = catalog_root / 'catalogs' / f'{code}.json'
        override_path = catalog_root / 'overrides' / f'{code}.json'
        overrides = json.loads(override_path.read_text(encoding='utf-8')) if override_path.exists() else {}
        translations = dict(sources) if code == 'en' else (json.loads(catalog_path.read_text(encoding='utf-8')) if catalog_path.exists() else {})
        if not isinstance(translations, dict) or not isinstance(overrides, dict):
            raise ValueError(f'{code}: catalog and overrides must be objects')
        translations.update(overrides)
        unknown = sorted(set(translations) - set(sources))
        missing = sorted(set(sources) - set(translations))
        counts = Counter()
        findings = []
        def finding(key, kind, detail, severity='review'):
            counts[kind] += 1
            findings.append({'id': key, 'kind': kind, 'severity': severity, 'detail': detail, 'override': key in overrides, 'source': sources.get(key), 'translation': translations.get(key)})
        for key in unknown:
            finding(key, 'unknown_source_id', 'Catalog key does not exist in the current English inventory.', 'error')
        for key, source in sources.items():
            if key not in translations:
                continue
            value = translations[key]
            try:
                BUILDER.validate(source, value)
            except ValueError as error:
                finding(key, 'invalid_structure', str(error), 'error')
                continue
            if TOKEN_PATTERN.search(value) or ('ZXQ' in value and 'ZXQ' not in source) or ('QXZ' in value and 'QXZ' not in source):
                finding(key, 'protected_token_residue', 'Temporary translation marker is still present.', 'error')
            if code == 'en':
                continue
            if DECODE_ARTIFACT_PATTERN.search(value) and not DECODE_ARTIFACT_PATTERN.search(source):
                finding(key, 'decoder_artifact', 'A translation decoder replacement character is visible.', 'error')
            if len(value) > max(len(source) * 5, len(source) + 160) or REPEATED_WORD_PATTERN.search(value):
                finding(key, 'runaway_translation', 'Translation repeats a word or expands far beyond the source length.', 'error')
            if same_text(source, value):
                if prose(source):
                    finding(key, 'unchanged_english_prose', 'English prose is unchanged; review untranslated text or valid shared vocabulary.')
                elif english_words(source):
                    finding(key, 'unchanged_short_label', 'Short English-looking label is unchanged; this may be a valid loanword or cognate.')
                else:
                    counts['legitimate_literal_identity'] += 1
            else:
                overlap = english_overlap(source, value)
                if overlap:
                    finding(key, 'english_phrase_overlap', overlap)
            if re.search(r'\}\w|\w\{', source) and not same_text(source, value):
                residue = set(word.lower() for word in english_words(source)) & set(word.lower() for word in english_words(value)) & {'row', 'rows', 'save', 'cancel', 'download', 'compare', 'open', 'close', 'edit', 'apply', 'search', 'find', 'changes', 'file', 'files'}
                if code in {'fil', 'id'}:
                    residue.discard('edit')  # Established local UI loanword; Filipino also uses I-edit.
                if residue:
                    finding(key, 'adjacent_template_english_residue', ', '.join(sorted(residue)))
            expected_sides = Counter(SIDE_LABEL_PATTERN.findall(source))
            actual_sides = Counter(re.findall(r'[AB]', value))
            if any(actual_sides[side] < count for side, count in expected_sides.items()):
                finding(key, 'side_label_changed', 'Literal original/revised A/B label changed alphabet or disappeared.', 'error')
            source_brands = Counter(BRAND_PATTERN.findall(source))
            translated_brands = Counter(BRAND_PATTERN.findall(value))
            if source_brands != translated_brands:
                finding(key, 'brand_literal_changed', 'Product/format spelling changed; localized brand names may be legitimate.')
            source_urls = Counter(URL_PATTERN.findall(source))
            translated_urls = Counter(URL_PATTERN.findall(value))
            if source_urls != translated_urls:
                finding(key, 'url_literal_changed', 'A literal URL changed.', 'error')
            source_domains = Counter(DOMAIN_PATTERN.findall(URL_PATTERN.sub(' ', source)))
            translated_domains = Counter(DOMAIN_PATTERN.findall(URL_PATTERN.sub(' ', value)))
            if source_domains != translated_domains:
                finding(key, 'domain_literal_changed', 'A literal domain outside a URL changed.', 'error')
            if Counter(EXTENSION_PATTERN.findall(source)) != Counter(EXTENSION_PATTERN.findall(value)):
                finding(key, 'extension_literal_changed', 'A filename extension changed; inspect labels and code examples.')
            if source.count('\n') != value.count('\n'):
                finding(key, 'line_break_count_changed', 'Unexpected line breaks may indicate cross-record translation leakage.', 'error')
            if code in SCRIPT_RANGES and any(len(word) >= 3 for word in english_words(source)) and not re.search(SCRIPT_RANGES[code], meaningful(value)):
                finding(key, 'expected_script_missing', 'No expected script in a prose message; proper names and loanwords can be exceptions.')
        errors = [entry for entry in findings if entry['severity'] == 'error']
        review = [entry for entry in findings if entry['severity'] == 'review']
        suspect = len({entry['id'] for entry in findings if entry['kind'] in {'unchanged_english_prose', 'english_phrase_overlap', 'adjacent_template_english_residue'}})
        locale_report = {
            'expected': len(sources), 'present': len(set(translations) & set(sources)),
            'coverage_percent': round(100 * (len(sources) - len(missing)) / max(1, len(sources)), 2),
            'missing_count': len(missing), 'missing_ids': missing,
            'override_count': len(overrides), 'structural_error_count': len(errors),
            'review_candidate_count': len(review), 'counts': dict(sorted(counts.items())),
            'samples': {kind: [entry for entry in findings if entry['kind'] == kind][:sample_limit] for kind in sorted(counts) if kind != 'legitimate_literal_identity'},
            'findings': findings,
        }
        report['locales'][code] = locale_report
        totals = report['totals']
        totals['expected_translations'] += len(sources)
        totals['present_translations'] += locale_report['present']
        totals['missing_translations'] += len(missing)
        totals['structural_errors'] += len(errors)
        totals['token_residue'] += counts['protected_token_residue']
        totals['suspect_english_messages'] += suspect
        totals['suspect_english_files'] += int(suspect > 0)
        totals['review_candidates'] += len(review)
    report['release_structure_pass'] = report['totals']['missing_translations'] == 0 and report['totals']['structural_errors'] == 0
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT / 'i18n')
    parser.add_argument('--output', type=Path, help='Write the complete JSON report to this path.')
    parser.add_argument('--allow-incomplete', action='store_true', help='Report missing work without returning a failing exit status.')
    parser.add_argument('--samples', type=int, default=12)
    args = parser.parse_args()
    report = audit(args.root, args.samples)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'source_messages': report['source_messages'], 'locale_count': report['locale_count'], 'release_structure_pass': report['release_structure_pass'], **report['totals']}, ensure_ascii=False))
    for code, locale in report['locales'].items():
        print(f"{code}: {locale['present']}/{locale['expected']} ({locale['coverage_percent']}%); errors={locale['structural_error_count']}; English-prose={locale['counts'].get('unchanged_english_prose', 0)}; English-overlap={locale['counts'].get('english_phrase_overlap', 0)}; review={locale['review_candidate_count']}")
    if not report['release_structure_pass'] and not args.allow_incomplete:
        sys.exit(1)

if __name__ == '__main__':
    main()
