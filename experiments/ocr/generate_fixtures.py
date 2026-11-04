#!/usr/bin/env python3
"""Generate 24 synthetic OCR pages with exact reference text (no user documents).

Requires Pillow and DejaVu fonts. Output is disposable: fixtures/ should be ignored.
Two degraded A/B pairs contain identical text, to measure false differences.
Reading order for two-column pages is the entire left column, then the right.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = Path('/usr/share/fonts/truetype/dejavu')
WIDTH, HEIGHT = 1200, 1600
CATEGORIES = ('paragraphs', 'invoice', 'columns', 'table', 'small_font', 'degraded')


def lines_for(lang: str, category: str, variant: str) -> list[str]:
    changed = variant == 'B' and category != 'degraded'
    if lang == 'eng':
        title = 'SYNTHETIC TEST DOCUMENT'
        if category == 'invoice':
            return [title, 'Invoice INV-2046-001', 'Date: 2026-11-04',
                    'Supplier: Example Workshop', 'Customer: Example Research', '',
                    'Item                 Qty     Price       Amount',
                    'Paper boxes          12      18.50       222.00',
                    f'Label rolls          8       7.25        {"58.80" if changed else "58.00"}',
                    'Delivery             1       15.00       15.00', '',
                    f'Total USD: {"295.80" if changed else "295.00"}',
                    'Payment due: 2026-11-18', 'Reference: AB-0010 / 1001']
        if category == 'table':
            return [title, 'Shipment schedule', '', 'Code      Quantity    Date          Status',
                    'A-101     120         2026-11-04    Ready',
                    f'B-202     {"85 " if changed else "80 "}         2026-11-05    Pending',
                    'C-303     45          2026-11-06    Ready',
                    'D-404     200         2026-11-07    Pending', '',
                    'Check quantities against the signed order.']
        if category == 'columns':
            return [title, 'LEFT COLUMN', '1. Prepare the purchase order.',
                    '2. Check the delivery address.', '3. Confirm the agreed price.',
                    '4. Archive the signed document.', '', 'RIGHT COLUMN',
                    '5. Inspect all incoming boxes.',
                    f'6. Record {"six" if changed else "five"} sample weights.',
                    '7. Report damaged packaging.', '8. Send the final receipt.']
        return [title, 'Document review instructions', '',
                'This page contains invented training data.',
                'The customer supplies two document versions.',
                'Review the names, dates and numeric values.',
                f'The delivery deadline is {"18" if changed else "15"} November 2026.',
                'The agreed quantity is 120 boxes.',
                'The unit price is USD 18.50 before delivery.',
                'Do not silently correct the source wording.',
                'Keep the original image for manual review.',
                'A recognition mistake can resemble a change.',
                'Save the confirmed text before comparison.',
                'Reference identifiers: O0, I1, AB-0010.', '',
                'End of synthetic document.']
    title = 'СИНТЕТИЧЕСКИЙ ТЕСТОВЫЙ ДОКУМЕНТ'
    if category == 'invoice':
        return [title, 'Счёт INV-2046-001', 'Дата: 04.11.2026',
                'Поставщик: Учебная мастерская', 'Заказчик: Пример исследования', '',
                'Товар                Кол-во  Цена        Сумма',
                'Бумажные коробки     12      18,50       222,00',
                f'Рулоны этикеток      8       7,25        {"58,80" if changed else "58,00"}',
                'Доставка             1       15,00       15,00', '',
                f'Итого USD: {"295,80" if changed else "295,00"}',
                'Оплатить до: 18.11.2026', 'Номер: АБ-0010 / 1001']
    if category == 'table':
        return [title, 'График отгрузки', '', 'Код       Количество  Дата          Статус',
                'А-101     120         04.11.2026    Готово',
                f'Б-202     {"85 " if changed else "80 "}         05.11.2026    Ожидание',
                'В-303     45          06.11.2026    Готово',
                'Г-404     200         07.11.2026    Ожидание', '',
                'Сверьте количество с подписанным заказом.']
    if category == 'columns':
        return [title, 'ЛЕВАЯ КОЛОНКА', '1. Подготовьте заказ.',
                '2. Проверьте адрес доставки.', '3. Подтвердите цену.',
                '4. Сохраните подписанный акт.', '', 'ПРАВАЯ КОЛОНКА',
                '5. Осмотрите все коробки.',
                f'6. Взвесьте {"шесть" if changed else "пять"} образцов.',
                '7. Запишите повреждения.', '8. Отправьте квитанцию.']
    return [title, 'Инструкция по проверке документов', '',
            'Эта страница содержит вымышленные данные.',
            'Заказчик предоставляет две версии документа.',
            'Проверьте имена, даты и числовые значения.',
            f'Срок доставки: {"18" if changed else "15"} ноября 2026 года.',
            'Согласованное количество: 120 коробок.',
            'Цена за единицу: 18,50 USD без доставки.',
            'Не исправляйте исходный текст автоматически.',
            'Сохраните изображение для ручной проверки.',
            'Ошибка распознавания может выглядеть как правка.',
            'Сохраните проверенный текст перед сравнением.',
            'Идентификаторы: О0, I1, АБ-0010.', '',
            'Конец синтетического документа.']


def render(lines: list[str], category: str, variant: str, seed: int) -> Image.Image:
    image = Image.new('RGB', (WIDTH, HEIGHT), 'white')
    draw = ImageDraw.Draw(image)
    size = 19 if category == 'small_font' else 29
    mono = category in ('invoice', 'table')
    font = ImageFont.truetype(str(FONT_DIR / ('DejaVuSansMono.ttf' if mono else 'DejaVuSans.ttf')), size)
    if category == 'columns':
        # Header followed by true newspaper-style left-to-right column reading.
        header_font = ImageFont.truetype(str(FONT_DIR / 'DejaVuSans.ttf'), 26)
        draw.text((65, 90), lines[0], fill='black', font=header_font)
        left, right = lines[1:6], lines[7:]
        font = ImageFont.truetype(str(FONT_DIR / 'DejaVuSans.ttf'), 25)
        for x, column in ((65, left), (640, right)):
            for i, line in enumerate(column):
                draw.text((x, 200 + i * 57), line, fill='black', font=font)
    else:
        for i, line in enumerate(lines):
            if draw.textbbox((0, 0), line, font=font)[2] > WIDTH - 130:
                raise ValueError(f'Fixture text exceeds image width: {line}')
            draw.text((65, 90 + i * (size + 22)), line, fill='black', font=font)
    if category == 'table':
        # Rules add structure but no content: reference uses text in row order.
        for row in (3, 4, 5, 6, 7, 8):
            y = 90 + row * (size + 22) - 4
            draw.line((55, y, 1110, y), fill=(120, 120, 120), width=1)
    if category == 'degraded' and variant == 'B':
        # Identical semantic content, simulated scan defects only.
        image = image.rotate(1.2, Image.Resampling.BICUBIC, expand=False, fillcolor='white')
        image = image.filter(ImageFilter.GaussianBlur(0.65))
        rng = random.Random(seed)
        draw = ImageDraw.Draw(image)
        for _ in range(2500):
            x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
            shade = rng.randrange(150, 245)
            draw.point((x, y), fill=(shade, shade, shade))
    return image


def generate(output: Path) -> list[dict]:
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for lang in ('eng', 'rus'):
        for category in CATEGORIES:
            pair_id = f'{lang}-{category}'
            for variant in ('A', 'B'):
                fixture_id = f'{pair_id}-{variant.lower()}'
                lines = lines_for(lang, category, variant)
                truth = '\n'.join(lines) + '\n'
                seed = int.from_bytes(hashlib.sha256(fixture_id.encode()).digest()[:4], 'big')
                image_name, truth_name = f'{fixture_id}.png', f'{fixture_id}.txt'
                render(lines, category, variant, seed).save(output / image_name, optimize=False)
                (output / truth_name).write_text(truth, encoding='utf-8')
                entries.append({'id': fixture_id, 'image': image_name, 'truth': truth_name,
                                'lang': lang, 'category': category, 'pair_id': pair_id,
                                'variant': variant, 'synthetic': True,
                                'expected_pair_changed': category != 'degraded',
                                'seed': seed})
    (output / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return entries


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'fixtures')
    args = parser.parse_args()
    entries = generate(args.output)
    print(f'Generated {len(entries)} synthetic PNG pages and references in {args.output}')
