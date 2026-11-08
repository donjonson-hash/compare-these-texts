import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {renderHtml, renderJson} from '../src/report.mjs';
import {renderTextHtml} from '../src/text-report.mjs';
import {buildCommercialSummary, translateCommercialText} from '../src/commercial-summary.mjs';
import {renderXlsx} from '../src/xlsx-report.mjs';
import {read} from '../src/xlsx-vendor.mjs';
import {renderPdf} from '../src/pdf-report.mjs';
import {PDFDocument} from '../src/pdf-vendor.mjs';
import office from '../src/office.js';

function fixture() {
  const headers = ['sku', 'quantity', 'price', 'unit', 'currency', 'Documents'];
  const row = quantity => ({record: 2, sheet: 'Documents', cells: {sku: 'A2', quantity: 'B2', price: 'C2', unit: 'D2', currency: 'E2', Documents: 'F2'}, values: {sku: 'Documents', quantity, price: '10.50', unit: 'pcs', currency: 'USD', Documents: '<script>Documents</script> & {0}'}});
  const left = row('2'), right = row('3');
  const report = {status: 'complete', rules: {key: ['sku', 'sku'], fields: [['quantity', 'quantity', 'number'], ['price', 'price', 'number']], strip: true},
    sources: {left: {name: 'Documents.csv', sheet: 'Documents', headers}, right: {name: 'Другой.csv', sheet: 'Documents', headers}},
    summary: {changed: 1, matched: 0, only_left: 0, only_right: 0, left_rows: 1, right_rows: 1},
    changed: [{key: 'Documents', left, right, changes: [{left_column: 'quantity', right_column: 'quantity', before: '2', after: '3', mode: 'number'}]}], matched: [], only_left: [], only_right: []};
  report.commercial = buildCommercialSummary(report);
  return report;
}
function russian(t) {
  const previous = globalThis.cttI18n;
  const translations = {
    'Documents': 'Документы', 'Comparison complete': 'Сравнение завершено', 'Quantity, price, and amount': 'Количество, цена и сумма',
    'Document comparison': 'Сравнение документов', 'Text matches': 'Текст совпадает', 'Differences found': 'Найдены различия',
    'Compare Two Texts — comparison results': 'Compare Two Texts — результаты сравнения', 'Value': 'Значение',
    "I'm the CTT assistant. The two files have been compared.": 'Я помощник CTT. Два файла сравнены.', 'Hello,': 'Здравствуйте,',
    'Compare Two Texts — comparison report': 'Compare Two Texts — отчёт о сравнении',
    '{0}, quantity: {1}.': '{0}, количество: {1}.', 'value missing': 'значение отсутствует',
  };
  globalThis.cttI18n = {getLocale: () => 'ru', t: (source, params = {}) => (translations[source] ?? source).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match), localizeError: source => translations[source] ?? source};
  t.after(() => { if (previous) globalThis.cttI18n = previous; else delete globalThis.cttI18n; });
}

test('English remains the default for exports and generated assistant prose', () => {
  const report = fixture(), html = renderHtml(report);
  assert.match(html, /<h1>Comparison complete<\/h1>/);
  assert.match(html, /<h2>Documents<\/h2>/);
  assert.match(office.describe(report).text, /^I'm the CTT assistant\./);
  assert.match(office.draftLetter(report).draft, /^Hello,\n/);
  assert.deepEqual(report.commercial.totals, [{currency: 'USD', before: '21', after: '31.5', delta: '10.5'}]);
});

test('translated HTML labels never translate user values, keys, filenames or source sheets', t => {
  const report = fixture(), evidence = renderJson(report); russian(t);
  const dom = new JSDOM(renderHtml(report)), doc = dom.window.document;
  assert.equal(doc.documentElement.lang, 'ru');
  assert.equal(doc.querySelector('h1').textContent, 'Сравнение завершено');
  assert.ok([...doc.querySelectorAll('h2')].some(node => node.textContent === 'Документы'));
  assert.equal(doc.querySelector('.key').textContent, 'Documents');
  assert.ok([...doc.querySelectorAll('dt')].some(node => node.textContent === 'Documents · F2'));
  assert.ok([...doc.querySelectorAll('dd')].some(node => node.textContent === '<script>Documents</script> & {0}'));
  assert.match(doc.body.textContent, /Documents\.csv/);
  assert.match(doc.body.textContent, /Documents»/);
  assert.equal(doc.querySelectorAll('script').length, 0);
  assert.equal(renderJson(report), evidence);
  assert.deepEqual(buildCommercialSummary(report), report.commercial);
  dom.window.close();
});

test('text report, assistant and XLSX localize generated labels while preserving all document data', t => {
  const report = fixture(), evidence = renderJson(report); russian(t);
  const block = {record: 1, location: 'Documents', text: 'Documents <b>literal</b> {0}'};
  const textReport = {kind: 'text', status: 'complete', sources: report.sources, summary: {matched: 1}, matched: [{key: 'text-1', left: block, right: block}], changed: [], only_left: [], only_right: []};
  const dom = new JSDOM(renderTextHtml(textReport));
  assert.equal(dom.window.document.querySelector('h1').textContent, 'Сравнение документов');
  assert.equal(dom.window.document.querySelector('.text').textContent, block.text);
  assert.equal(dom.window.document.querySelector('.text b'), null); dom.window.close();
  const answer = office.describe(report), draft = office.draftLetter(report).draft;
  assert.match(answer.text, /^Я помощник CTT\./);
  assert.match(answer.text, /Documents\.csv/);
  assert.match(draft, /^Здравствуйте,\n/);
  assert.match(draft, /Documents/);
  const book = read(renderXlsx(report), {type: 'array'});
  assert.deepEqual(book.SheetNames, ['Summary', 'Differences', 'Data A', 'Data B']);
  assert.equal(book.Sheets.Summary.A1.v, 'Compare Two Texts — результаты сравнения');
  assert.equal(book.Sheets['Data A'].B2.v, 'Documents');
  assert.equal(book.Sheets['Data A'].I2.v, '<script>Documents</script> & {0}');
  assert.equal(book.Sheets['Data A'].F2.v, '10.50');
  assert.equal(translateCommercialText('A, quantity: value missing.'), 'A, количество: значение отсутствует.');
  assert.equal(renderJson(report), evidence);
});

test('PDF export uses the current interface language without mutating evidence', async t => {
  const report = fixture(), evidence = renderJson(report); russian(t);
  const pdf = await PDFDocument.load(await renderPdf(report));
  assert.equal(pdf.getTitle(), 'Compare Two Texts — отчёт о сравнении');
  assert.ok(pdf.getPageCount() > 0);
  assert.equal(renderJson(report), evidence);
});

for (const locale of ['ja', 'ar']) test(`PDF uses English generated labels for ${locale} without changing source data or UI locale`, async t => {
  const previous = globalThis.cttI18n;
  t.after(() => { if (previous) globalThis.cttI18n = previous; else delete globalThis.cttI18n; });
  globalThis.cttI18n = {getLocale: () => locale, t: source => `${locale === 'ja' ? '日本語' : 'العربية'} ${source}`, localizeError: source => `日本語 ${source}`};
  const report = fixture(), evidence = renderJson(report);
  const bytes = await renderPdf(report), pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), 'Compare Two Texts — comparison report');
  const {readTextSource} = await import('../src/text-source.mjs');
  const extracted = await readTextSource({name: 'report.pdf', data: Buffer.from(bytes).toString('base64')});
  const text = extracted.blocks.map(block => block.text).join('\n');
  assert.match(text, /Quantity, price, and amount/);
  assert.doesNotMatch(text, /\[U\+|日本語|العربية/);
  assert.match(text, /Другой\.csv/);
  assert.match(text, /Documents/);
  assert.equal(renderJson(report), evidence);
  assert.equal(globalThis.cttI18n.getLocale(), locale);
});

for (const [locale, title] of [['ru', 'Количество, цена и сумма'], ['cs', 'Množství, cena a částka']]) test(`PDF preserves ${locale} generated labels and document characters through actual text extraction`, async t => {
  const previous = globalThis.cttI18n;
  t.after(() => { if (previous) globalThis.cttI18n = previous; else delete globalThis.cttI18n; });
  globalThis.cttI18n = {getLocale: () => locale, t: (source, params = {}) => (source === 'Quantity, price, and amount' ? title : source).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match), localizeError: source => source};
  const report = fixture(); report.sources.left.name = 'Příliš žluťoučký kůň — Договор.csv';
  const evidence = renderJson(report), bytes = await renderPdf(report);
  const {readTextSource} = await import('../src/text-source.mjs');
  const extracted = await readTextSource({name: 'report.pdf', data: Buffer.from(bytes).toString('base64')});
  const text = extracted.blocks.map(block => block.text).join('\n');
  assert.ok(text.includes(title), 'translated heading retains every glyph');
  assert.ok(text.includes(report.sources.left.name), 'source filename retains diacritics and Cyrillic');
  assert.doesNotMatch(text, /\[U\+/);
  assert.equal(renderJson(report), evidence);
});

test('changing the interface language during PDF export cannot mix generated report languages', async t => {
  russian(t);
  const pending = renderPdf(fixture());
  globalThis.cttI18n = {getLocale: () => 'ja', t: () => '日本語', localizeError: () => '日本語'};
  const bytes = await pending, pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), 'Compare Two Texts — отчёт о сравнении');
  const {readTextSource} = await import('../src/text-source.mjs');
  const extracted = await readTextSource({name: 'report.pdf', data: Buffer.from(bytes).toString('base64')});
  assert.doesNotMatch(extracted.blocks.map(block => block.text).join('\n'), /\[U\+|日本語/);
});
