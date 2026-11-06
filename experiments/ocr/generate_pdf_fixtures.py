#!/usr/bin/env python3
"""Build synthetic PDF routing fixtures from the existing OCR PNG corpus.

Requires ReportLab and the Pillow/DejaVu dependencies of generate_fixtures.py.
No user files are read. Output lives under ignored fixtures/pdf by default.
PDF bytes use ReportLab's invariant mode (reproducible within pinned versions).
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

from generate_fixtures import generate

ROOT = Path(__file__).resolve().parent
PAGE_SIZE = (600, 800)
MIXED_TEXT = (
    'SYNTHETIC MIXED PDF',
    'Selectable text page.',
    'Order quantity: 120 boxes.',
    'Compare the next scanned page separately.',
)


def new_pdf(path: Path):
    pdf = canvas.Canvas(str(path), pagesize=PAGE_SIZE, pageCompression=1,
                        invariant=1)
    pdf.setTitle('Compare Two Texts - synthetic OCR test')
    pdf.setAuthor('Compare Two Texts test fixtures')
    return pdf


def add_scan(pdf, image: Path):
    pdf.drawImage(ImageReader(image), 0, 0, width=PAGE_SIZE[0], height=PAGE_SIZE[1])
    pdf.showPage()


def generate_pdf_fixtures(output: Path, image_root: Path) -> list[dict]:
    output = output.resolve()
    image_root = image_root.resolve()
    needed = [f'eng-{category}-{variant}' for variant in ('a', 'b')
              for category in ('paragraphs', 'invoice', 'degraded')]
    if any(not (image_root / f'{name}.{suffix}').is_file()
           for name in needed for suffix in ('png', 'txt')):
        generate(image_root)
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for variant in ('a', 'b'):
        filename = f'scan-{variant}.pdf'
        pdf = new_pdf(output / filename)
        pages = []
        for number, category in enumerate(('paragraphs', 'invoice', 'degraded'), 1):
            fixture_id = f'eng-{category}-{variant}'
            add_scan(pdf, image_root / f'{fixture_id}.png')
            truth_name = f'scan-{variant}-page-{number}.txt'
            (output / truth_name).write_text((image_root / f'{fixture_id}.txt').read_text(), encoding='utf-8')
            pages.append({'number': number, 'source_fixture_id': fixture_id,
                          'truth': truth_name, 'has_text_layer': False,
                          'expected_pair_changed': category != 'degraded'})
        pdf.save()
        entries.append({'file': filename, 'page_count': 3, 'purpose': 'scan_pair', 'pages': pages})

    pdf = new_pdf(output / 'mixed.pdf')
    pdfmetrics.registerFont(TTFont('FixtureSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdf.setFont('FixtureSans', 18)
    for number, text in enumerate(MIXED_TEXT):
        pdf.drawString(40, 740 - number * 32, text)
    pdf.showPage()
    add_scan(pdf, image_root / 'eng-paragraphs-a.png')
    pdf.save()
    (output / 'mixed-page-1.txt').write_text('\n'.join(MIXED_TEXT) + '\n', encoding='utf-8')
    (output / 'mixed-page-2.txt').write_text((image_root / 'eng-paragraphs-a.txt').read_text(), encoding='utf-8')
    entries.append({'file': 'mixed.pdf', 'page_count': 2, 'purpose': 'per_page_routing',
                    'pages': [{'number': 1, 'truth': 'mixed-page-1.txt', 'has_text_layer': True},
                              {'number': 2, 'truth': 'mixed-page-2.txt', 'has_text_layer': False}]})

    pdf = new_pdf(output / 'blank.pdf')
    pdf.showPage()
    pdf.save()
    (output / 'blank-page-1.txt').write_text('', encoding='utf-8')
    entries.append({'file': 'blank.pdf', 'page_count': 1, 'purpose': 'blank_page',
                    'pages': [{'number': 1, 'truth': 'blank-page-1.txt', 'has_text_layer': False}]})

    pdf = new_pdf(output / 'too-many-pages.pdf')
    for _ in range(31):
        pdf.showPage()
    pdf.save()
    entries.append({'file': 'too-many-pages.pdf', 'page_count': 31,
                    'purpose': 'reject_page_limit', 'expected_error': True})
    (output / 'corrupt.pdf').write_bytes(b'%PDF-1.7\nThis is an intentionally invalid synthetic test file.\n')
    entries.append({'file': 'corrupt.pdf', 'page_count': None,
                    'purpose': 'reject_malformed_pdf', 'expected_error': True})
    for entry in entries:
        data = (output / entry['file']).read_bytes()
        entry.update(synthetic=True, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    (output / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return entries


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'fixtures' / 'pdf')
    parser.add_argument('--image-root', type=Path, default=ROOT / 'fixtures')
    args = parser.parse_args()
    entries = generate_pdf_fixtures(args.output, args.image_root)
    print(f'Generated {len(entries)} synthetic PDF fixtures and page references in {args.output}')
