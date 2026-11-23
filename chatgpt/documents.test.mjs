import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDocuments, readDocumentSource} from './documents.mjs';
import {docx, W} from '../tests/fixtures/text-fixture.mjs';
import {tableSource} from '../tests/fixtures/table-fixture.mjs';

const source = (name, bytes) => ({name, data: Buffer.from(bytes).toString('base64')});
const word = (name, paragraphs, options) => source(name, docx(paragraphs, options));

// Same independent PDF construction pattern as tests/pdf-links.test.mjs.
// A tiny standard-font input exercises actual PDF parsing without a renderer,
// canvas package, generated external assets, or a PDF exporter under test.
function pdf(lines, name = 'document.pdf') {
  const content = lines.map((text, index) => `BT /F1 14 Tf 50 ${650 - index * 24} Td (${text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 700] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let data = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(data.length); data += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = data.length;
  data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  data += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return source(name, data);
}

test('DOCX Cyrillic changes retain exact segments, stable IDs and original sources', async () => {
  const original = word('Договор A.docx', ['Договор', 'Оплата: 100 рублей.', 'Срок: 10 дней.'], {deflate: true});
  const revised = word('Договор B.docx', ['Договор', 'Оплата: 200 рублей.', 'Срок: 10 дней.'], {deflate: true});
  const inputBefore = JSON.stringify({original, revised});
  const comparison = await compareDocuments({original, revised});
  assert.equal(JSON.stringify({original, revised}), inputBefore);
  assert.equal(comparison.kind, 'documents');
  assert.equal(comparison.summary.total, 1);
  assert.equal(comparison.summary.replacements, 1);
  assert.equal(comparison.summary.matched, 2);
  assert.deepEqual(comparison.sources, {left: original, right: revised});
  assert.notEqual(comparison.sources.left, original);
  assert.equal(comparison.documents.original.byteLength, Buffer.from(original.data, 'base64').length);
  assert.equal(comparison.documents.original.coverage, 'main_body_only');
  assert.equal(comparison.documents.original.blockCount, 3);
  const [change] = comparison.changes;
  assert.equal(change.originalLocation, 'Paragraph 2');
  assert.equal(change.revisedLocation, 'Paragraph 2');
  assert.equal(change.before, 'Оплата: 100 рублей.');
  assert.equal(change.after, 'Оплата: 200 рублей.');
  assert.deepEqual(change.segments.original.filter(segment => segment.changed).map(segment => segment.text), ['100']);
  assert.deepEqual(change.segments.revised.filter(segment => segment.changed).map(segment => segment.text), ['200']);
  assert.match(change.explanation, /^Текст заменён/);
  const repeated = await compareDocuments({original: {...original, name: 'renamed.docx'}, revised});
  assert.equal(repeated.comparisonId, comparison.comparisonId);
  assert.equal(repeated.changes[0].id, change.id);
  assert.notEqual((await compareDocuments({original: revised, revised: original})).changes[0].id, change.id);
});

test('DOCX table edits retain cell coordinates and every source paragraph', async () => {
  const comparison = await compareDocuments({original: tableSource('100'), revised: tableSource('250')});
  assert.equal(comparison.report.rules.table_cells, true);
  assert.equal(comparison.changes.length, 2);
  assert.deepEqual(comparison.changes.map(change => change.original.table), [
    {table: 1, row: 3, column: 3, paragraph: 1},
    {table: 1, row: 4, column: 3, paragraph: 1},
  ]);
  assert.ok(comparison.changes.every(change => /Table 1, row [34], column 3, paragraph 1/.test(change.originalLocation)));
  assert.ok(comparison.documents.original.blocks.some(block => block.text === 'Печать'));
  assert.ok(comparison.documents.original.blocks.some(block => block.text === 'Доставка'));
  assert.equal(comparison.documents.original.blocks.length, comparison.report.summary.left_blocks);
  assert.deepEqual(comparison.documents.original.blocks.map(block => block.record), Array.from({length: comparison.documents.original.blockCount}, (_, index) => index + 1));
});

test('moved blocks remain navigable without claiming their words changed', async () => {
  const comparison = await compareDocuments({
    original: word('A.docx', ['Начало', 'Раздел A', 'Раздел B', 'Конец']),
    revised: word('B.docx', ['Начало', 'Раздел B', 'Раздел A', 'Конец']),
  });
  assert.equal(comparison.summary.moves, 1);
  assert.equal(comparison.summary.replacements, 0);
  const move = comparison.changes.find(change => change.kind === 'move');
  assert.equal(move.before, move.after);
  assert.notEqual(move.original.record, move.revised.record);
  assert.notEqual(move.originalLocation, move.revisedLocation);
  assert.ok([...move.segments.original, ...move.segments.revised].every(segment => !segment.changed));
  assert.equal(move.explanation, 'Текст перемещён без изменений.');
});

test('inserted/deleted paragraphs keep one-sided anchors, including blank paragraphs', async () => {
  const inserted = await compareDocuments({original: word('A.docx', ['Начало', 'Конец']), revised: word('B.docx', ['Начало', '', 'Новый пункт', 'Конец'])});
  assert.equal(inserted.summary.insertions, 2);
  assert.ok(inserted.changes.every(change => change.original === null && change.originalLocation === null));
  assert.deepEqual(inserted.changes.map(change => change.revised.record), [2, 3]);
  const deleted = await compareDocuments({original: word('A.docx', ['Начало', '', 'Старый пункт', 'Конец']), revised: word('B.docx', ['Начало', 'Конец'])});
  assert.equal(deleted.summary.deletions, 2);
  assert.ok(deleted.changes.every(change => change.revised === null && change.revisedLocation === null));
});

test('PDF and DOCX comparison keeps actual PDF page rectangles and text-layer scope', async () => {
  const original = word('contract.docx', ['Agreement', 'Amount: 100', 'End']);
  const revised = pdf(['Agreement', 'Amount: 200', 'End']);
  const comparison = await compareDocuments({original, revised});
  assert.equal(comparison.summary.replacements, 1);
  assert.equal(comparison.documents.revised.format, 'pdf');
  assert.equal(comparison.documents.revised.pageCount, 1);
  assert.equal(comparison.documents.revised.coverage, 'text_layer_only');
  assert.ok(comparison.notes.some(note => note.includes('OCR is not performed')));
  const [change] = comparison.changes;
  assert.equal(change.originalLocation, 'Paragraph 2');
  assert.match(change.revisedLocation, /^Page 1 · line 2$/);
  assert.equal(change.revised.page, 1);
  assert.ok(change.revised.visual.rects.length > 0);
  assert.ok(change.revised.visual.rects.every(rect => Number.isFinite(rect.x) && Number.isFinite(rect.y)));
  assert.equal(change.segments.revised.filter(segment => segment.changed).map(segment => segment.text).join(''), '200');
});

test('DOCX/PDF line reflow retains original blocks and does not become a replacement', async () => {
  const comparison = await compareDocuments({original: word('A.docx', ['Hello world']), revised: pdf(['Hello', 'world'])});
  assert.equal(comparison.summary.reflows, 1);
  assert.equal(comparison.summary.replacements, 0);
  assert.deepEqual(comparison.documents.revised.blocks.map(block => block.text), ['Hello', 'world']);
  const [change] = comparison.changes;
  assert.equal(change.kind, 'reflow');
  assert.deepEqual(change.revised.source_blocks.map(block => block.record), [1, 2]);
  assert.ok([...change.segments.original, ...change.segments.revised].every(segment => !segment.changed));
  assert.match(change.explanation, /разбиение на строки/);
});

test('unsupported, corrupted and oversized documents fail instead of returning partial reports', async () => {
  const good = word('good.docx', ['Текст']);
  for (const original of [
    {...good, name: 'macro.docm'},
    {...good, name: 'renamed.pdf'},
    source('broken.docx', 'not a ZIP archive'),
    {name: 'broken.docx', data: 'not base64'},
  ]) await assert.rejects(compareDocuments({original, revised: good}));
  await assert.rejects(compareDocuments({original: source('large.txt', Buffer.alloc(2 * 1024 * 1024 + 1, 65)), revised: good}), /500,000 characters/);
  await assert.rejects(compareDocuments({original: pdf([]), revised: good}), /no usable text layer|Empty pages and scans/);
  const footnote = word('footnote.docx', ['Body'], {extraEntries: {'word/footnotes.xml': `<w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>Uncompared note</w:t></w:r></w:p></w:footnote></w:footnotes>`}});
  await assert.rejects(compareDocuments({original: footnote, revised: good}), /footnotes or endnotes/);
});

test('single-document import shares metadata normalization and validates the source contract', async () => {
  const input = word('Пример.docx', ['Один', 'Два'], {deflate: true});
  const document = await readDocumentSource(input);
  assert.deepEqual(document.blocks.map(block => block.text), ['Один', 'Два']);
  assert.equal(document.blockCount, 2);
  assert.equal(document.pageCount, null);
  assert.match(document.sha256, /^[a-f0-9]{64}$/);
  for (const invalid of [null, [], {...input, url: 'https://example.com/document.docx'}, {name: 'x.docx'}, {name: 'x.docx', data: 1}]) await assert.rejects(readDocumentSource(invalid), /must/);
  await assert.rejects(compareDocuments({original: input, revised: input, ignored: true}), /exactly/);
});
