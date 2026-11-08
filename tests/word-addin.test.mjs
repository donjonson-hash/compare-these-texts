import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {validateText, inspectOoxml, previewReplacement, SNAPSHOT_MS} from '../src/word-addin/policy.mjs';
import {createWordAdapter} from '../src/word-addin/word-adapter.mjs';
import {mountTaskpane} from '../src/word-addin/taskpane.mjs';
const {window} = new JSDOM('');
const Parser = window.DOMParser;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, style = '') => `<w:r>${style}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const xml = inner => `<?xml version="1.0"?><pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document xmlns:w="${W}"><w:body>${inner}<w:sectPr/></w:body></w:document></pkg:xmlData></pkg:part></pkg:package>`;
const paraXml = (text, style = '') => xml(`<w:p>${run(text, style)}</w:p>`);

function model() {
  const state = {text: 'Delivery within 5 days.', selected: '5', style: '', body: 'MainDoc', control: false, table: false, paragraphs: 1, selectionSame: true, inside: 'Contains', track: 'Off', time: 0, writes: [], untracked: 0, failWrite: false};
  const proxy = obj => Object.assign(obj, {load() { return this; }});
  const paragraph = proxy({get text() { return state.text; }, getOoxml() { return {get value() { return paraXml(state.text, state.style); }}; }, compareLocationWith() { return {get value() { return state.inside; }}; }, track() {}, untrack() { state.untracked++; }});
  const range = proxy({
    get text() { return state.selected; },
    parentBody: proxy({get type() { return state.body; }}),
    parentContentControlOrNullObject: proxy({get isNullObject() { return !state.control; }}),
    parentTableOrNullObject: proxy({get isNullObject() { return !state.table; }}),
    paragraphs: proxy({get items() { return Array.from({length: state.paragraphs}, () => ({getRange(location) { assert.equal(location, 'Content'); return paragraph; }})); }}),
    getOoxml() { return {get value() { return paraXml(state.selected, state.style); }}; },
    compareLocationWith() { return {get value() { return state.selectionSame ? 'Equal' : 'Unrelated'; }}; },
    track() {}, untrack() { state.untracked++; },
    insertText(value, location) { assert.equal(location, 'Replace'); state.writes.push(value); state.text = state.text.replace(state.selected, value); state.selected = value; },
  });
  const context = {document: proxy({getSelection() { return range; }, get changeTrackingMode() { return state.track; }}), async sync() { if (state.failWrite && state.writes.length) throw new Error('Host disconnected'); }};
  const Word = {async run(objects, callback) { return (callback || objects)(context); }};
  return {state, adapter: createWordAdapter(Word, {Parser, now: () => state.time})};
}

test('Word policy inspects Flat OPC ordinary text and rejects rich or ambiguous structures', () => {
  const ordinary = paraXml('Pay 100 EUR', '<w:rPr><w:b/></w:rPr>');
  assert.ok(inspectOoxml(ordinary, 'Pay 100 EUR', {Parser, uniform: true}));
  for (const inner of [
    '<w:tbl><w:tr><w:tc><w:p>' + run('x') + '</w:p></w:tc></w:tr></w:tbl>',
    '<w:p><w:hyperlink>' + run('x') + '</w:hyperlink></w:p>',
    '<w:p><w:bookmarkStart w:id="1" w:name="Contract"/>' + run('x') + '<w:bookmarkEnd w:id="1"/></w:p>',
    '<w:p><w:pPr><w:numPr/></w:pPr>' + run('x') + '</w:p>',
    '<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:t>x</w:t></w:r></w:p>',
    '<w:p><w:commentRangeStart w:id="1"/>' + run('x') + '<w:commentRangeEnd w:id="1"/></w:p>',
    '<w:p>' + run('x') + '</w:p><w:p>' + run('y') + '</w:p>',
  ]) assert.throws(() => inspectOoxml(xml(inner), 'x', {Parser}));
  assert.throws(() => inspectOoxml(xml('<w:p>' + run('a') + run('b', '<w:rPr><w:b/></w:rPr>') + '</w:p>'), 'ab', {Parser, uniform: true}), /different formatting/);
  assert.throws(() => inspectOoxml(paraXml('hidden different text'), 'visible', {Parser}), /cannot be matched/);
});

test('Word text limits and preview keep emoji intact and reject invalid UTF-16', () => {
  assert.equal(validateText('Привет 👩‍💻'), 'Привет 👩‍💻');
  for (const bad of ['', 'x\ny', 'x\ry', '\uD800', '\uDC00', 'x'.repeat(4001)]) assert.throws(() => validateText(bad));
  assert.equal(validateText('', {allowEmpty: true}), '');
  assert.deepEqual(previewReplacement('Hello 😀.', 'Hello 😃.'), {prefix: 'Hello ', removed: '😀', added: '😃', suffix: '.'});
});

test('Word adapter replaces only tracked selection and consumes it; deletion remains in paragraph', async () => {
  const {state, adapter} = model();
  assert.deepEqual(await adapter.load(), {original: '5'});
  await adapter.apply('10', '10');
  assert.equal(state.text, 'Delivery within 10 days.'); assert.deepEqual(state.writes, ['10']);
  await assert.rejects(adapter.apply('10', '10'), /Preview/);
  await adapter.load(); await adapter.apply('', '');
  assert.equal(state.text, 'Delivery within  days.'); assert.equal(state.untracked, 4);
});

test('Word adapter rejects stale text, formatting, moved selection, unsupported containers and expiry without writes', async () => {
  const changes = [s => { s.text = 'Changed around selection 5'; }, s => { s.style = '<w:rPr><w:b/></w:rPr>'; }, s => { s.selected = '6'; }, s => { s.selectionSame = false; }, s => { s.body = 'Header'; }, s => { s.table = true; }, s => { s.control = true; }, s => { s.paragraphs = 2; }, s => { s.inside = 'Unrelated'; }, s => { s.track = 'TrackAll'; }, s => { s.time = SNAPSHOT_MS + 1; }];
  for (const mutate of changes) {
    const {state, adapter} = model(); await adapter.load(); mutate(state);
    await assert.rejects(adapter.apply('10', '10')); assert.equal(state.writes.length, 0);
    await assert.rejects(adapter.apply('10', '10'), /Preview/);
  }
});

test('Word adapter forbids unsupported initial selection and requires a matching preview', async () => {
  for (const mutate of [s => { s.body = 'TableCell'; }, s => { s.control = true; }, s => { s.track = 'TrackMineOnly'; }, s => { s.paragraphs = 2; }, s => { s.selected = ''; }]) {
    const {state, adapter} = model(); mutate(state); await assert.rejects(adapter.load()); assert.equal(state.writes.length, 0);
  }
  const {state, adapter} = model(); await adapter.load(); await assert.rejects(adapter.apply('10', '9'), /Preview/); assert.equal(state.writes.length, 0);
});

test('Word adapter never retries an uncertain write', async () => {
  const {state, adapter} = model(); await adapter.load(); state.failWrite = true;
  await assert.rejects(adapter.apply('10', '10'), /did not confirm/); assert.deepEqual(state.writes, ['10']);
  await assert.rejects(adapter.apply('10', '10'), /Preview/); assert.equal(state.writes.length, 1);
});

test('Word panel invalidates preview after typing and protects retained draft after failure', async () => {
  const html = fs.readFileSync(new URL('../src/word-addin/taskpane.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html); const document = dom.window.document;
  const calls = []; let loads = 0;
  const adapter = {async load() { loads++; return {original: '5 days'}; }, async apply(value, reviewed) { calls.push([value, reviewed]); throw new Error('Uncertain write'); }};
  const ui = mountTaskpane(document, adapter), field = document.getElementById('edited');
  await ui.load(); field.value = '10 days'; ui.preview(); assert.equal(document.getElementById('apply').disabled, false);
  field.value = '15 days'; field.dispatchEvent(new dom.window.Event('input')); assert.equal(document.getElementById('apply').disabled, true);
  await ui.apply(); assert.equal(calls.length, 0); ui.preview(); await ui.apply(); assert.deepEqual(calls, [['15 days', '15 days']]);
  assert.equal(field.value, '15 days'); assert.equal(document.getElementById('apply').disabled, true);
  dom.window.confirm = () => false; await ui.load(); assert.equal(loads, 1); assert.equal(field.value, '15 days');
  dom.window.close();
});

test('Word panel treats document text as text rather than markup', async () => {
  const dom = new JSDOM(fs.readFileSync(new URL('../src/word-addin/taskpane.html', import.meta.url), 'utf8'));
  const ui = mountTaskpane(dom.window.document, {async load() { return {original: '<img src=x onerror=alert(1)>'}; }});
  await ui.load(); dom.window.document.getElementById('edited').value = '<script>bad()</script>'; ui.preview();
  assert.equal(dom.window.document.getElementById('preview').querySelectorAll('img,script').length, 0);
  assert.match(dom.window.document.getElementById('preview').textContent, /script/);
  dom.window.close();
});

test('Word Russian messages remain separate from document text and retained drafts', async () => {
  const html = fs.readFileSync(new URL('../src/word-addin/taskpane.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html), document = dom.window.document;
  const messages = {
    'No changes to apply.': 'Нет изменений.',
    'The selection changed. Load the intended passage again.': 'Выделение изменилось. Загрузите его снова.',
    'Your draft remains here for copying. Reload the selection before another attempt.': 'Черновик можно скопировать.',
  };
  const t = text => messages[text] || text;
  dom.window.cttI18n = {t, bindText(node, source) { node.textContent = t(source); }, bindError(node, source) { node.textContent = t(source); }};
  const calls = [];
  const adapter = {async load() { return {original:'No changes to apply.'}; }, async apply(value) { calls.push(value); throw new Error('The selection changed. Load the intended passage again.'); }};
  const ui = mountTaskpane(document, adapter), field = document.getElementById('edited');
  await ui.load(); ui.preview();
  assert.equal(document.getElementById('status').textContent, 'Нет изменений.');
  assert.equal(field.value, 'No changes to apply.');
  assert.equal(document.getElementById('preview').textContent, 'No changes to apply.');
  field.value = 'A handwritten correction.'; ui.preview(); await ui.apply();
  assert.deepEqual(calls, ['A handwritten correction.']);
  assert.equal(document.getElementById('status').textContent, 'Выделение изменилось. Загрузите его снова. Черновик можно скопировать.');
  assert.equal(field.value, 'A handwritten correction.');
  assert.equal(document.getElementById('apply').disabled, true);
  dom.window.close();
});
