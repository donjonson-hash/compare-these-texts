#!/usr/bin/env python3
"""Check literal document-side identifiers in a reviewed set of UI messages.

The source IDs below were individually classified as version/row/column labels,
comparison actions, help about those actions, or numerical report formulas.
English articles ("A document", "A clearer view") are intentionally excluded.
This check does not attempt to certify the grammar of translated prose.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
# Semantically scoped allowlist, not a scan for every capital English article.
SIDE_MESSAGES = {
    '3a3eeeca4642': ' (searching A and B)',
    '80985b852d27': ' (searching A and B; numbers may refer to different pairs)',
    'bc0de2d1d6fd': ' in either A or B',
    'fa729345f603': '<0></0>Original / Only in A',
    '7e15a789e838': '<0></0>Revised / Only in B',
    'f13b212f16e5': '<0>A — Original:</0> Delivery within <1>5 business days</1>.',
    '29f088378736': '<0>A — Original:</0> Payment is due within <1>30 days</1>.',
    '55d59c0f32d2': '<0>A — SKU LAMP-01:</0> Quantity <1>12</1>, unit price 35.00.',
    'f140b1ec1d53': '<0>A</0>Original text',
    'a6034fb8d2f1': '<0>B — Revised:</0> Delivery within <1>10 business days</1>.',
    'e52c1fb5e738': '<0>B — Revised:</0> Payment is due within <1>14 days</1>.',
    '34ef4bf13fdd': '<0>B — SKU LAMP-01:</0> Quantity <1>10</1>, unit price 35.00.',
    '4ce0f4aeb126': '<0>B</0>Changed text',
    '7003461929ee': '<0>Choose the versions.</0> Open the comparison workspace. Upload the original under A and the revised document under B, then select <1>Compare documents</1>.',
    '54c4fda57fec': '<0>Inspect and save.</0> Review changed values and items present only in A or B. Use the spreadsheet controls to edit supported values or download the comparison report.',
    '458082415d6c': '<0>Load both files.</0> Upload the earlier export under A and the later export under B, then choose <1>Compare documents</1>.',
    'd6e6794a2521': '<0>Open the workspace.</0> Upload the original PDF as A and the revised PDF as B, then choose <1>Compare documents</1>.',
    'b5f9dcb77003': '<0>Review changes in context.</0> Move through highlighted differences with <1>Next difference</1>. Select a passage to edit it. During a guided review, use <2>Use A</2> or <3>Keep B</3> to decide what belongs in the result.',
    '1416a9446a91': '<0>Save the edited version.</0> Use the download control for A or B. Open the downloaded DOCX and check the final layout before sharing it.',
    '1dfb22c02d1a': '<0>Upload A and B.</0> Choose the original workbook and its revised version, then select <1>Compare documents</1>.',
    'b8eabea5a934': 'A «{0}» → B «{1}»',
    '5bccd702e86b': 'A · {0}',
    'a88bc629d812': 'A · {0}   ↔   B · {1}',
    '4ddc7d05b2fa': 'A — reference · B — revised version',
    '17fd1b3c3c44': 'A — {0}; B — {1}.',
    'f5069687e424': 'A: {0}',
    'b9cfcdee3a30': 'A: {0}; B: {1}.',
    '61a605c45624': 'Add from A',
    'ce6291c25739': 'All differences reviewed. All tools → Review & edit → Check again, then download B.',
    'f15f4317dd02': 'Amount A',
    'c17b6e1d7e14': 'Amount B',
    'cf2aab097cd4': 'B · {0}',
    '0861c57e9790': 'B − A',
    'fba4ae015204': 'B: {0}',
    '45b3d8285b72': 'Cell A',
    '246e673b66ab': 'Cell B',
    '11f9e799d36a': 'Change B − A',
    '1a81b3b4ffe9': 'Change from A → B: quantity × listed price, separately for each currency. This is not an amount due or confirmation of delivery; VAT, shipping, and unit conversions are not calculated.',
    'ce91365862a5': 'Changed blocks: {0}; only in A: {1}; only in B: {2}; matched: {3}.',
    '83dd42940fc2': 'Changed: {0}; only in A: {1}; only in B: {2}; matched: {3}.',
    '55ea87642e72': 'Changed: {0}; only in A: {1}; only in B: {2}; {3}: {4}.',
    'b35f51c47671': 'Changes are highlighted: A on the left, B on the right.',
    '00e098c88ecb': 'Choose Use A or Keep B. You can also edit either version.',
    'c0c5cd3e8996': 'Click a cell to edit. Use A or keep B, then continue.',
    '8ed083f703e3': 'Column A',
    '0d25b5a3ca18': 'Column B',
    '615a708c3368': 'Column B for {0}',
    'be51b02a3bcc': 'Compare documents A and B',
    'b1156a231988': 'Comparing file A {0} and file B {1} produced the following results.',
    '3597969b36e7': 'Comparing the extracted text in file A {0} and file B {1} produced the following results.',
    'aa9078a31514': 'Currencies differ between A and B; no conversion is performed.',
    '9406abdb65c2': 'Data records A',
    '9ecde9a229a0': 'Data records B',
    '1b95bb2eae90': 'Download B · TXT',
    '17563aa39ae7': 'Download updated B',
    '249f877f7b32': 'Edit B',
    '4287bc7a0f79': 'Edit passages in B or use all of A. This editor downloads a new TXT file without the original DOCX/PDF layout. Your original files stay unchanged.',
    '0ef0e91a3e77': 'Full revised text of B',
    'e6eceece0b33': 'Highlights, counts, search, assistant answers, and reports refer to the original comparison. To check your revised text, upload the downloaded TXT as B. Edits remain until you change files or close this page.',
    '8260bfcdd8a0': 'Identifier in A',
    '24134139877f': 'Identifier in B',
    'd6efba104f32': 'Keep B',
    'da5694527c1e': 'Keep B layout',
    '95449705131f': 'Key matching: A {0} ↔ B {1}.',
    'b08c750907ff': 'Make A match B',
    '299569ebc434': 'Make B match A',
    '4cf53c2ad384': 'Matching field in B',
    '8b924d833b08': 'No items share the selected keys. First check that the keys in A and B refer to the same thing.',
    'c1bfac6be75d': 'Only in A',
    'ce3eafceed73': 'Only in B',
    '728e6073ce21': 'Open the original as A and the revised version as B. Or paste two texts.',
    '6e5ade81e833': 'Open the remaining differences to edit them or keep B.',
    '6737d783d177': 'Paste text into A and B, or choose <0>Upload file</0> for each side, then select <1>Compare</1>. Use <2>Next difference</2> to jump between changes. In a Word, PDF or text comparison, select a passage to edit it, or start a review to choose <3>Use A</3> or <4>Keep B</4>.',
    '65deb1da1677': 'Presence was checked using the selected keys. “Only in A/B” means the key is missing from the other file; it does not establish that a delivery was short.',
    'dc72b74fa420': 'Preview updated B as PDF',
    '4e4b084728e8': 'Price changed: {0} · quantity: {1} · only in A: {2} · only in B: {3}',
    '0db9951a3d1b': 'Quantity changes: {0}; price changes: {1}; only in A: {2}; only in B: {3}.',
    '9c0108ae2607': 'Record A',
    '20e377c0a228': 'Record B',
    '320031aeb85d': 'Red highlights show values from A; green highlights show values from B.',
    '9b03b3f83193': 'Remove from version B',
    'ba86b8b1c657': 'Reports and Explain changes describe the original comparison. Download edited documents using the controls for A or B. Spreadsheet views have their own sheet, column and row controls.',
    '0f8863da4625': 'Reports describe the original comparison. Download edited documents from A or B.',
    '86cb9216f869': 'Restore original B',
    '65887f37673d': 'See the Data A sheet',
    'de0a677b210e': 'See the Data B sheet',
    '452ae69b7b67': 'Selected cell · A {0} · B {1}',
    'ac0161884b43': 'Selected fields are compared. Original values are on the Data A and Data B sheets.',
    '3dad106c9028': 'Sheet A',
    '5c93f3e75664': 'Sheet B',
    'f72338465fc2': 'Source A',
    '6f0f415dec91': 'Source B',
    'a88785ceebd9': 'Source rows: A {0}, B {1}.',
    'c234a73dbc53': 'Text blocks only in A:',
    'af3316b831bd': 'Text blocks only in B:',
    '31a060fca079': 'Text only in A',
    '17fe55935949': 'Text only in B',
    '127d021e187b': 'Text review complete. Check the saving options in version B.',
    '7350e6844977': 'The current versions have been checked. You can download B below.',
    '6d5028979a76': 'There are also unmatched items: only in A — {0}, only in B — {1}. Their values were not compared between files.',
    '24815a4003d2': 'This row is missing in one version. Copy the whole row or keep B.',
    '3226d7636a51': 'This section is missing from version B. Start typing or add it from A.',
    '66e24a1ec6ef': 'This text appears only in A',
    'd620844b68ab': 'This text appears only in B',
    '7dffcb604716': 'Units differ between A and B; no conversion is performed.',
    '403e555cd16d': 'Use A',
    'c4efe38cf842': 'Use A and restore section order',
    '306486dca7d5': 'Use all of A in B',
    '638115f7e477': 'Use text from A',
    'ae2710201d8e': 'Use the text from A in B and continue',
    '6c5de0326776': 'Value A',
    'd6ab2a4e8cc9': 'Value B',
    '43ff3bf15082': 'Version A',
    'f3374dca7da1': 'Version B',
    '20416d932fc6': 'Version B has been edited. Some differences from reference A remain.',
    '247dd5fe61a1': 'Version B matches the extracted text of A, including section order.',
    '798419629d0b': 'Version B still contains its original text.',
    '5dead94f32e9': 'Version B · {0}',
    'ca73d0dc71ef': 'change B − A:',
    '8c1c4bea8001': '{0} difference remains in your documents. You can download B below.',
    '8335d537f649': '{0} differences remain in your documents. You can download B below.',
    '86bcbf307ff0': '{0} sections in A · {1} in B. Showing extracted text without the original layout.',
    '5323973c86c9': '{0} — only in A.',
    'c3ec1405a51e': '{0} — only in B.',
    '789eabd12e3d': '{0}: A {1} = {2} → B {3} = {4} (rows A {5}, B {6}).',
    'a430210e24c4': '{0}: A {1} → B {2}; B − A: {3} {4}.',
    '742b91c6231c': '{0}: A {1} → B {2}; B − A: {3}.{4}',
    '925348196ea8': '{0}: A {1} → B {2}; change B − A: {3}{4}.',
    'a8d7e7fcb903': '{0}: terms differ between A and B or are missing on one side.',
    '6e9fe4a5d33b': '• A {0} = {1}; B {2} = {3} — {4} ({5}).',
    'ddff1461e1c3': '• A {0} ↔ B {1} — {2}.',
}
SIDE_TOKEN = re.compile(r'(?<![A-Za-z])[AB](?![A-Za-z])')
# Formula semantics must survive localization as well as the letters themselves.
FORMULA_BINDINGS = {
    'b8eabea5a934': [('A','0'),('B','1')],
    '17fd1b3c3c44': [('A','0'),('B','1')],
    '95449705131f': [('A','0'),('B','1')],
    'a88785ceebd9': [('A','0'),('B','1')],
    '452ae69b7b67': [('A','0'),('B','1')],
    '789eabd12e3d': [('A','1'),('B','3')],
    'a430210e24c4': [('A','1'),('B','2')],
    '742b91c6231c': [('A','1'),('B','2')],
    '925348196ea8': [('A','1'),('B','2')],
    '6e9fe4a5d33b': [('A','0'),('B','2')],
    'ddff1461e1c3': [('A','0'),('B','1')],
}


def audit(catalog_root, selected=None, allow_incomplete=False):
    sources = json.loads((catalog_root / 'source.json').read_text(encoding='utf-8'))
    locales = json.loads((catalog_root / 'locales.json').read_text(encoding='utf-8'))
    findings, checks, missing = [], 0, 0
    for key, expected in SIDE_MESSAGES.items():
        if sources.get(key) != expected:
            findings.append({'locale':'source','id':key,'problem':'Reviewed source message changed or disappeared; review its identifier contract.'})
    for item in locales:
        locale = item['code']
        if locale == 'en' or selected and locale not in selected:
            continue
        base = catalog_root / 'catalogs' / (locale + '.json')
        override = catalog_root / 'overrides' / (locale + '.json')
        translations = json.loads(base.read_text(encoding='utf-8')) if base.exists() else {}
        if override.exists():
            translations.update(json.loads(override.read_text(encoding='utf-8')))
        for key, source in SIDE_MESSAGES.items():
            if key not in translations:
                missing += 1
                if not allow_incomplete:
                    findings.append({'locale':locale,'id':key,'problem':'Missing translation'})
                continue
            checks += 1
            value = translations[key]
            expected, actual = Counter(SIDE_TOKEN.findall(source)), Counter(SIDE_TOKEN.findall(value))
            lost = {side:count-actual[side] for side,count in expected.items() if actual[side] < count}
            if lost:
                findings.append({'locale':locale,'id':key,'source':source,'translation':value,'problem':'Missing literal side identifiers','missing':lost})
            # The difference is B minus A, never A minus B, regardless of RTL.
            if 'B − A' in source and not re.search(r'B\s*[−-]\s*A',value):
                findings.append({'locale':locale,'id':key,'source':source,'translation':value,'problem':'Difference formula must retain B − A'})
            for side, parameter in FORMULA_BINDINGS.get(key, []):
                pattern = r'(?<![A-Za-z])' + side + r'\s*[-–—:·]{0,2}\s*[«“"‘「『《]?\s*\{' + parameter + r'\}'
                if not re.search(pattern,value):
                    findings.append({'locale':locale,'id':key,'source':source,'translation':value,'problem':f'Side {side} must remain attached to value {{{parameter}}}'})
    return {'reviewed_messages':len(SIDE_MESSAGES),'translation_checks':checks,'missing_translations':missing,'findings':findings,'passed':not findings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog-root', type=Path, default=ROOT / 'i18n')
    parser.add_argument('--locales', help='Comma-separated locale codes; defaults to all configured translations')
    parser.add_argument('--allow-incomplete', action='store_true', help='Audit present entries during preparation; never use for release validation')
    parser.add_argument('--json', type=Path, help='Optional complete JSON findings report')
    args = parser.parse_args()
    result = audit(args.catalog_root, set(args.locales.split(',')) if args.locales else None, args.allow_incomplete)
    if args.json:
        args.json.parent.mkdir(parents=True,exist_ok=True)
        args.json.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for finding in result['findings'][:40]:
        print(f"{finding['locale']} {finding['id']}: {finding['problem']}")
    print(f"{'PASS' if result['passed'] else 'FAIL'}: {result['translation_checks']} side-label checks; {len(result['findings'])} findings; {result['missing_translations']} missing entries")
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
