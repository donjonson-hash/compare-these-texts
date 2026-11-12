import {test} from 'node:test';
import assert from 'node:assert/strict';
import {docx, W, escapeXml} from './fixtures/text-fixture.mjs';
import {DOMParser} from '../dist/xml-vendor.mjs';
import {normalizeDocxHyperlinkFields} from '../dist/docx-fields.mjs';
import {readTextSource} from '../dist/text-source.mjs';
import {readDocxVisual, writeDocxVisual} from '../dist/docx-visual.mjs';
import {unzipDocument} from '../dist/text-zip.mjs';

const text = value => `<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
const marker = type => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
const instruction = value => `<w:r><w:instrText xml:space="preserve">${escapeXml(value)}</w:instrText></w:r>`;
const result = '<w:r><w:rPr><w:b/></w:rPr><w:t>Visit</w:t></w:r><w:r><w:t xml:space="preserve"> example</w:t></w:r>';
const field = (code = ' HYPERLINK "https://example.test/target" ', cached = result) => marker('begin') + instruction(code) + marker('separate') + cached + marker('end');
const xml = body => `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`;
const source = bytes => ({name: 'hyperlink-field.docx', data: Buffer.from(bytes).toString('base64')});
const fixture = (body, extraEntries) => source(docx([], {xml: xml(body), extraEntries}));
const parse = body => new DOMParser().parseFromString(xml(body), 'application/xml');

test('complex HYPERLINK compares the cached result and exports editable plain text', async () => {
  const src = fixture(`<w:p>${text('Before ')}${field()}${text(' after')}</w:p>`, {'docProps/custom.xml': '<properties/>'});
  const extracted = await readTextSource(src);
  assert.deepEqual(extracted.blocks.map(block => block.text), ['Before Visit example after']);
  assert.ok(extracted.meta.notes.some(note => /hyperlink/i.test(note) && /visible text/i.test(note) && /field and its link are removed/i.test(note)));
  const model = await readDocxVisual(src);
  assert.equal(model.blocks[0].runs.map(run => run.text || '').join(''), 'Before Visit example after');
  assert.equal(model.blocks[0].runs.find(run => run.text === 'Visit').style.fontWeight, 'bold');
  const before = await unzipDocument(Buffer.from(src.data, 'base64'));
  for (const edited of ['Before Visit example after', 'Changed display', '']) {
    const bytes = await writeDocxVisual(src, [{record: 1, text: edited}]);
    const after = await unzipDocument(bytes), document = new TextDecoder().decode(after.get('word/document.xml'));
    assert.doesNotMatch(document, /fldChar|instrText|https:\/\/example\.test\/target/);
    assert.deepEqual((await readTextSource(source(bytes))).blocks.map(block => block.text), [edited]);
    for (const [path, raw] of before) if (path !== 'word/document.xml') assert.deepEqual(after.get(path), raw, path);
  }
});

test('fields handle split instructions, several fields and controls sharing a run', () => {
  const mixed = `<w:r><w:t>prefix </w:t><w:fldChar w:fldCharType="begin"/><w:instrText> HYPER</w:instrText><w:instrText>LINK "https://example.test/" </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>display</w:t><w:tab/><w:fldChar w:fldCharType="end"/><w:t> suffix</w:t></w:r>`;
  const doc = parse(`<w:p>${mixed}${field('HYPERLINK \\l "bookmark"')}${field('HYPERLINK "https://example.test/" \\o "A tooltip" \\t "_blank" \\m \\n')}</w:p>`);
  assert.equal(normalizeDocxHyperlinkFields(doc), 3);
  assert.equal(doc.documentElement.textContent, 'prefix display suffixVisit exampleVisit example');
  assert.equal(doc.getElementsByTagNameNS(W, 'tab').length, 1);
  assert.equal(normalizeDocxHyperlinkFields(doc), 0);
});

test('malformed, nested, cross-paragraph and non-text fields reject atomically', () => {
  const invalid = [
    marker('end'), marker('separate'), instruction('HYPERLINK "https://example.test/"'),
    marker('begin'), marker('begin') + marker('end'),
    field().replace(marker('end'), ''),
    field().replace(marker('separate'), marker('separate') + marker('separate')),
    field('PAGE'), field('INCLUDETEXT "https://example.test/"'),
    field('HYPERLINK'), field('HYPERLINK "unterminated'),
    field('HYPERLINK "https://example.test/" extra'),
    field('HYPERLINK "https://example.test/" \\unknown'),
    field('HYPERLINK \\l'), field('HYPERLINK "https://example.test/" \\l "one" \\l "two"'),
    field('HYPERLINK "https://example.test/"', field()),
    field('HYPERLINK "https://example.test/"', '<w:r><w:drawing/></w:r>'),
    field('HYPERLINK "https://example.test/"', ''),
    field().replace(instruction(' HYPERLINK "https://example.test/target" '), text('hidden instruction text')),
    field().replace(marker('end'), instruction('INCLUDETEXT "https://example.test/"') + marker('end')),
    field().replace(marker('separate'), '</w:p><w:p>' + marker('separate')),
    `<w:hyperlink>${field()}</w:hyperlink>`,
    field().replace('w:fldCharType="begin"', 'w:fldCharType="begin" w:unexpected="1"'),
    ...[
      'w:fldCharType="begin" s:fldCharType="end"',
      'w:fldCharType="begin" w:dirty="true" s:dirty="false"',
      'w:fldCharType="begin" w:fldLock="true" s:fldLock="false"',
    ].map(attributes => field().replace('w:fldCharType="begin"', `xmlns:s="http://purl.oclc.org/ooxml/wordprocessingml/main" ${attributes}`)),
    field().replace('<w:fldChar w:fldCharType="begin"/>', '<w:fldChar w:fldCharType="begin"><w:fldData>ignored</w:fldData></w:fldChar>'),
  ];
  for (const body of invalid) {
    const doc = parse(`<w:p>${field()}</w:p><w:p>${body}</w:p>`), before = doc.toString();
    assert.throws(() => normalizeDocxHyperlinkFields(doc), /balanced HYPERLINK/);
    assert.equal(doc.toString(), before, 'no partial normalization on invalid fields');
  }
});

test('instruction and field count limits reject excessive work', () => {
  assert.throws(() => normalizeDocxHyperlinkFields(parse(`<w:p>${field('HYPERLINK "' + 'x'.repeat(4096) + '"')}</w:p>`)), /balanced HYPERLINK/);
  assert.throws(() => normalizeDocxHyperlinkFields(parse(`<w:p>${field().repeat(1001)}</w:p>`)), /balanced HYPERLINK/);
});

test('strict WordprocessingML namespaces are normalized without prefix assumptions', () => {
  const raw = xml(`<w:p>${field()}</w:p>`).replaceAll(W, 'http://purl.oclc.org/ooxml/wordprocessingml/main').replaceAll('w:', 's:').replace('xmlns:w=', 'xmlns:s=');
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  assert.equal(normalizeDocxHyperlinkFields(doc), 1);
  assert.equal(doc.documentElement.textContent, 'Visit example');
});
