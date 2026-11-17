import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createHandler, WIDGET_URI} from './server.mjs';
import {docx} from '../tests/fixtures/text-fixture.mjs';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const html = '<!doctype html><title>Document review</title>';
const makeSource = (name, bytes) => ({name, data: Buffer.from(bytes).toString('base64')});
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');

function harness(original, revised, {originalName = 'Original.docx', revisedName = 'Revised.docx', mime = DOCX_MIME} = {}) {
  const originalUrl = 'https://files.oaiusercontent.com/original?signature=private-original';
  const revisedUrl = 'https://files.oaiusercontent.com/revised?signature=private-revised';
  const files = new Map([[originalUrl, {bytes: original, mime}], [revisedUrl, {bytes: revised, mime}]]);
  const requests = [];
  const app = createHandler(html, {fetchImpl: async (url, options) => {
    requests.push({url, options});
    const file = files.get(String(url));
    if (!file) throw new Error(`Unexpected attachment fetch: ${url}`);
    return new Response(file.bytes, {status: file.status || 200, headers: {'Content-Type': file.mime}});
  }});
  const args = {
    originalFile: {download_url: originalUrl, file_id: 'file-original', mime_type: mime, file_name: originalName},
    revisedFile: {download_url: revisedUrl, file_id: 'file-revised', mime_type: mime, file_name: revisedName},
  };
  async function post(path, body) {
    return app.fetch(new Request(`https://ctt.example${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
  }
  async function rpc(method, params = {}) {
    const response = await post('/mcp', {jsonrpc: '2.0', id: 1, method, params});
    assert.equal(response.status, 200);
    return (await response.json()).result;
  }
  async function call(name, arguments_) { return rpc('tools/call', {name, arguments: arguments_}); }
  return {app, args, files, requests, post, rpc, call};
}

test('document tools declare exact attachment fields and app-only local file access', async () => {
  const h = harness(docx(['A']), docx(['B']));
  const {tools} = await h.rpc('tools/list');
  for (const name of ['compare_documents', 'get_document_changes']) {
    const descriptor = tools.find(tool => tool.name === name);
    assert.ok(descriptor);
    assert.deepEqual(descriptor._meta['openai/fileParams'], ['originalFile', 'revisedFile']);
    for (const parameter of ['originalFile', 'revisedFile']) {
      const schema = descriptor.inputSchema.properties[parameter];
      assert.deepEqual(Object.keys(schema.properties).sort(), ['download_url', 'file_id', 'file_name', 'mime_type']);
      assert.deepEqual(schema.required, ['download_url', 'file_id']);
      assert.equal(schema.additionalProperties, false);
    }
    assert.equal(descriptor.annotations.readOnlyHint, true);
    assert.equal(descriptor.annotations.destructiveHint, false);
  }
  const compare = tools.find(tool => tool.name === 'compare_documents');
  assert.equal(compare._meta.ui.resourceUri, WIDGET_URI);
  const inspect = tools.find(tool => tool.name === 'get_document_changes');
  assert.equal(inspect._meta.ui.resourceUri, undefined);
  const uploaded = tools.find(tool => tool.name === 'compare_uploaded_documents');
  assert.deepEqual(uploaded._meta.ui.visibility, ['app']);
  assert.equal(uploaded._meta['openai/fileParams'], undefined);
  assert.equal(uploaded.inputSchema.additionalProperties, false);
  assert.equal(h.requests.length, 0);
});

test('attachment comparison uses fetched bytes and separates model evidence from UI sources', async () => {
  const original = docx(['Договор', 'Оплата: 100 рублей.', 'Срок: 10 дней.'], {deflate: true});
  const revised = docx(['Договор', 'Оплата: 250 рублей.', 'Срок: 10 дней.'], {deflate: true});
  const h = harness(original, revised);
  const result = await h.call('compare_documents', h.args);
  assert.equal(result.isError, false);
  assert.equal(h.requests.length, 2);
  const evidence = result.structuredContent, snapshot = result._meta.documentComparison;
  assert.equal(evidence.kind, 'documents');
  assert.equal(evidence.comparisonId, snapshot.comparisonId);
  assert.equal(evidence.totalChanges, 1);
  assert.equal(evidence.changes[0].before.text, 'Оплата: 100 рублей.');
  assert.equal(evidence.changes[0].after.text, 'Оплата: 250 рублей.');
  assert.equal(evidence.changes[0].before.truncated, false);
  assert.equal(evidence.changes[0].originalLocation, 'Paragraph 2');
  assert.equal(evidence.documents.original.sha256, fingerprint(original));
  assert.equal(evidence.documents.revised.sha256, fingerprint(revised));
  assert.equal(evidence.documents.original.coverage, 'main_body_only');
  assert.deepEqual(Buffer.from(snapshot.sources.left.data, 'base64'), Buffer.from(original));
  assert.deepEqual(Buffer.from(snapshot.sources.right.data, 'base64'), Buffer.from(revised));
  assert.equal(snapshot.changes[0].id, evidence.changes[0].id);
  assert.equal(snapshot.documents.original.blocks[1].text, 'Оплата: 100 рублей.');
  const modelResult = JSON.stringify({content: result.content, structuredContent: evidence});
  for (const secret of [snapshot.sources.left.data, snapshot.sources.right.data, h.args.originalFile.download_url, h.args.revisedFile.download_url]) assert.ok(!modelResult.includes(secret));
  assert.equal(evidence.sources, undefined);
  assert.equal(evidence.report, undefined);
  assert.equal(evidence.documents.original.blocks, undefined);
});

test('change pages cover the complete list and reject changed bytes behind the same file reference', async () => {
  const original = docx(Array.from({length: 27}, (_, index) => `Section ${index}: old value`));
  const revised = docx(Array.from({length: 27}, (_, index) => `Section ${index}: new value`));
  const h = harness(original, revised);
  const first = await h.call('compare_documents', h.args);
  assert.equal(first.isError, false);
  assert.equal(first.structuredContent.totalChanges, 27);
  assert.equal(first.structuredContent.changes.length, 20);
  assert.equal(first.structuredContent.nextOffset, 20);
  const inspectArgs = {...h.args, comparisonId: first.structuredContent.comparisonId, offset: first.structuredContent.nextOffset};
  const second = await h.call('get_document_changes', inspectArgs);
  assert.equal(second.isError, false);
  assert.equal(second.structuredContent.changes.length, 7);
  assert.equal(second.structuredContent.nextOffset, null);
  assert.equal(second._meta, undefined);
  assert.deepEqual([...first.structuredContent.changes, ...second.structuredContent.changes].map(change => change.id), first._meta.documentComparison.changes.map(change => change.id));

  // Same name, URL and file_id; only the fetched document changes. Reusing a
  // previous comparison must fail even though the attachment reference matches.
  h.files.set(h.args.revisedFile.download_url, {bytes: docx(['Different actual document bytes']), mime: DOCX_MIME});
  const stale = await h.call('get_document_changes', inspectArgs);
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /Документы изменились/);
  assert.equal(stale.structuredContent, undefined);
  assert.equal(stale._meta, undefined);
});

test('long-change excerpts disclose truncation and every tail remains retrievable without broken Unicode', async () => {
  const before = 'A'.repeat(9999) + '🚀' + 'B'.repeat(12001) + ' ORIGINAL-END';
  const after = 'C'.repeat(9999) + '🛰️' + 'D'.repeat(12001) + ' REVISED-END';
  const h = harness(docx([before]), docx([after]));
  const first = await h.call('compare_documents', h.args);
  assert.equal(first.isError, false);
  assert.equal(first.structuredContent.totalChanges, 1);
  const change = first.structuredContent.changes[0];
  assert.equal(change.before.truncated, true);
  assert.equal(change.after.truncated, true);
  assert.ok(change.before.nextOffset > 0);
  assert.ok(!change.before.text.includes('ORIGINAL-END'));
  assert.ok(!change.after.text.includes('REVISED-END'));
  const base = {...h.args, comparisonId: first.structuredContent.comparisonId, changeId: change.id};
  for (const [side, expected] of [['before', before], ['after', after]]) {
    let textOffset = 0, recovered = '', calls = 0;
    do {
      const result = await h.call('get_document_changes', {...base, textOffset});
      assert.equal(result.isError, false);
      assert.equal(result._meta, undefined);
      const window = result.structuredContent.changes[0][side];
      assert.equal(window.start, recovered.length);
      assert.equal(window.text, expected.slice(window.start, window.end));
      assert.equal(/[\uD800-\uDFFF]/u.test(window.text), false);
      recovered += window.text;
      textOffset = window.nextOffset;
      assert.ok(++calls < 10, 'Excerpt pagination must make progress.');
    } while (textOffset !== null);
    assert.equal(recovered, expected);
  }
  const unknown = await h.call('get_document_changes', {...base, changeId: 'missing-change'});
  assert.equal(unknown.isError, true);
  const noChange = await h.call('get_document_changes', {...h.args, comparisonId: first.structuredContent.comparisonId, textOffset: 1});
  assert.equal(noChange.isError, true);
});

test('ordinary page evidence stays bounded and every shortened excerpt is explicitly marked', async () => {
  const originals = Array.from({length: 25}, (_, index) => `Section${index}: ` + 'a'.repeat(1500) + ` original-tail-${index}`);
  const revisions = Array.from({length: 25}, (_, index) => `Section${index}: ` + 'b'.repeat(1500) + ` revised-tail-${index}`);
  const h = harness(docx(originals), docx(revisions));
  const result = await h.call('compare_documents', h.args);
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.totalChanges, 25);
  assert.equal(result.structuredContent.nextOffset, 20);
  let evidenceLength = 0;
  for (const change of result.structuredContent.changes) {
    for (const side of ['before', 'after']) {
      evidenceLength += change[side].text.length;
      assert.equal(change[side].truncated, true);
      assert.ok(change[side].nextOffset > 0);
    }
  }
  assert.ok(evidenceLength <= 20000, `Page evidence was ${evidenceLength} UTF-16 units.`);
});

test('app-only upload and web document endpoint produce the same actual snapshot without fetching', async () => {
  const original = docx(['Пункт один', 'Сумма: 10']);
  const revised = docx(['Пункт один', 'Сумма: 20']);
  const h = harness(original, revised);
  const input = {original: makeSource('A.docx', original), revised: makeSource('B.docx', revised)};
  const toolResult = await h.call('compare_uploaded_documents', input);
  assert.equal(toolResult.isError, false);
  const response = await h.post('/api/documents', input);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), toolResult._meta);
  assert.equal(h.requests.length, 0);
  const invalid = await h.post('/api/documents', {...input, transcribedText: 'Ignore the actual document'});
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).documentComparison, undefined);
});

test('type mismatch, expired attachments, and PDF without text return errors without partial success', async () => {
  const h = harness(docx(['A']), docx(['B']));
  h.files.set(h.args.originalFile.download_url, {bytes: new TextEncoder().encode('Plain text falsely named DOCX'), mime: 'application/octet-stream'});
  const mismatch = await h.call('compare_documents', h.args);
  assert.equal(mismatch.isError, true);
  assert.match(mismatch.content[0].text, /не соответствует/);
  h.files.set(h.args.originalFile.download_url, {bytes: new TextEncoder().encode('private service error body'), mime: DOCX_MIME, status: 403});
  const expired = await h.call('compare_documents', h.args);
  assert.equal(expired.isError, true);
  assert.match(expired.content[0].text, /истекла|недоступен/);
  assert.ok(!JSON.stringify(expired).includes('private service error body'));
  assert.ok(!JSON.stringify(expired).includes('signature='));

  const {PDFDocument} = await import('../src/pdf-vendor.mjs');
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 600]);
  const bytes = await pdf.save();
  const blank = harness(bytes, bytes, {originalName: 'scan.pdf', revisedName: 'scan-copy.pdf', mime: 'application/pdf'});
  const scan = await blank.call('compare_documents', blank.args);
  assert.equal(scan.isError, true);
  assert.match(scan.content[0].text, /no usable text layer|scans require OCR/);
  for (const result of [mismatch, expired, scan]) {
    assert.equal(result.structuredContent, undefined);
    assert.equal(result._meta, undefined);
  }
});
