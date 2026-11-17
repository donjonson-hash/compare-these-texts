import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchAttachment, AttachmentError, MAX_ATTACHMENT_BYTES, ATTACHMENT_TIMEOUT_MS} from './attachments.mjs';

const URL = 'https://files.oaiusercontent.com/example?signature=do-not-disclose';
const file = extra => ({download_url: URL, file_id: 'file_example', ...extra});
const body = value => new TextEncoder().encode(value);
const decoded = result => Buffer.from(result.data, 'base64');
const pdf = body('%PDF-1.7\nsynthetic header; parser validates the PDF later');
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...body('[Content_Types].xml word/document.xml')]);
const errorCode = code => error => error instanceof AttachmentError && error.code === code && !error.message.includes('do-not-disclose');

test('fetches TXT bytes exactly with no credentials, normalization, or forwarded headers', async () => {
  const bytes = body('\ufeffЦена: 10\r\nEmoji: 🚀\r\n');
  const calls = [];
  const result = await fetchAttachment(file({file_name: 'договор.txt', mime_type: 'text/plain'}), {fetchImpl: async (url, options) => {
    calls.push({url, options});
    return new Response(bytes, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }});
  assert.equal(result.name, 'договор.txt');
  assert.deepEqual(decoded(result), Buffer.from(bytes));
  assert.equal(calls[0].url, URL);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(calls[0].options.headers), ['Accept']);
  assert.equal(calls[0].options.method, 'GET');
});

test('file metadata schema is strict and rejected before fetching', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error('should not fetch'); };
  for (const invalid of [null, [], {}, file({file_id: ''}), file({file_id: 'has space'}), file({file_name: '../contract.docx'}), file({mime_type: 12}), file({extra: true}), file({file_name: 'contract.exe'}), file({file_name: 'contract.pdf', mime_type: 'text/plain'})]) {
    await assert.rejects(fetchAttachment(invalid, {fetchImpl}), AttachmentError);
  }
  assert.equal(requests, 0);
});

test('URL allowlist rejects schemes, ports, credentials, local IPs and lookalike hosts before fetch', async () => {
  const rejected = ['http://files.oaiusercontent.com/a', 'file:///etc/passwd', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://localhost/a', 'https://files.oaiusercontent.com:444/a', 'https://user:pass@files.oaiusercontent.com/a', 'https://files.oaiusercontent.com.evil.example/a', 'https://oaiusercontent.com.evil.example/a', 'https://arbitrary.blob.core.windows.net/a', 'https://chatgpt.com/backend-api/accounts', 'https://chatgpt.com/backend-api/estuary/content-evil', 'https://files.oaiusercontent.com/a#fragment'];
  let requests = 0;
  for (const url of rejected) await assert.rejects(fetchAttachment(file({download_url: url}), {fetchImpl: async () => { requests++; return new Response('secret'); }}), AttachmentError);
  assert.equal(requests, 0);
});

test('supports scoped storage hosts and follows only revalidated redirects', async () => {
  for (const url of ['https://files.openai.com/a', 'https://file-storage.oaiusercontent.com/a', 'https://oaisdmntpr123.blob.core.windows.net/a', 'https://oaisdsorpruse1.blob.core.windows.net/a', 'https://sdmntprwestus2.blob.core.windows.net/a', 'https://chatgpt.com/backend-api/estuary/content?id=file_example']) {
    const result = await fetchAttachment(file({download_url: url, file_name: 'a.txt'}), {fetchImpl: async () => new Response('ok')});
    assert.equal(decoded(result).toString(), 'ok');
  }
  const seen = [];
  const result = await fetchAttachment(file({file_name: 'a.txt'}), {fetchImpl: async url => {
    seen.push(url);
    return seen.length === 1 ? new Response(null, {status: 302, headers: {Location: 'https://oaisdmntpr123.blob.core.windows.net/a?sig=private'}}) : new Response('ok');
  }});
  assert.equal(decoded(result).toString(), 'ok');
  assert.equal(seen.length, 2);
  let requests = 0;
  await assert.rejects(fetchAttachment(file(), {fetchImpl: async () => { requests++; return new Response(null, {status: 302, headers: {Location: 'https://127.0.0.1/private'}}); }}), errorCode('UNSUPPORTED_HOST'));
  assert.equal(requests, 1);
  requests = 0;
  await assert.rejects(fetchAttachment(file(), {fetchImpl: async () => { requests++; return new Response(null, {status: 307, headers: {Location: '/again'}}); }}), errorCode('REDIRECT_LIMIT'));
  assert.equal(requests, 3);
});

test('enforces maximum against streamed bytes and Content-Length without consuming oversized body', async () => {
  let cancelled = false;
  await assert.rejects(fetchAttachment(file({file_name: 'a.txt'}), {fetchImpl: async () => new Response(new ReadableStream({start(controller) { controller.enqueue(new Uint8Array(MAX_ATTACHMENT_BYTES)); controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; }}))}), errorCode('TOO_LARGE'));
  assert.equal(cancelled, true);
  cancelled = false;
  await assert.rejects(fetchAttachment(file({file_name: 'a.txt'}), {fetchImpl: async () => new Response(new ReadableStream({cancel() { cancelled = true; }}), {headers: {'Content-Length': String(MAX_ATTACHMENT_BYTES + 1)}})}), errorCode('TOO_LARGE'));
  assert.equal(cancelled, true);
});

test('expired responses and fetch exceptions never reveal signed URLs or response bodies', async () => {
  for (const status of [401, 403, 404, 410]) await assert.rejects(fetchAttachment(file(), {fetchImpl: async () => new Response('secret do-not-disclose', {status})}), errorCode('EXPIRED_FILE'));
  await assert.rejects(fetchAttachment(file(), {fetchImpl: async () => { throw new Error('failed at '+URL); }}), errorCode('DOWNLOAD_FAILED'));
  await assert.rejects(fetchAttachment(file(), {fetchImpl: async () => new Response('secret do-not-disclose', {status: 500})}), errorCode('DOWNLOAD_FAILED'));
});

test('infers names from MIME and signatures while leaving full DOCX/PDF validation to importers', async () => {
  const cases = [
    [{mime_type: 'application/pdf'}, pdf, 'application/octet-stream', 'attachment.pdf'],
    [{}, pdf, '', 'attachment.pdf'],
    [{mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}, docx, 'application/zip', 'attachment.docx'],
    [{}, docx, '', 'attachment.docx'],
    [{file_name: 'Agreement'}, pdf, 'application/pdf', 'Agreement.pdf'],
    [{}, body('plain UTF-8'), '', 'attachment.txt'],
    [{file_name: 'empty.txt'}, new Uint8Array(), 'text/plain', 'empty.txt'],
  ];
  for (const [metadata, bytes, mime, expected] of cases) {
    const result = await fetchAttachment(file(metadata), {fetchImpl: async () => new Response(bytes, {headers: mime ? {'Content-Type': mime} : {}})});
    assert.equal(result.name, expected);
    assert.deepEqual(decoded(result), Buffer.from(bytes));
  }
});

test('rejects false extensions, generic ZIPs, binary text, invalid UTF-8 and HTML login pages', async () => {
  for (const [metadata, bytes, mime, code] of [
    [{file_name: 'a.pdf'}, body('not a PDF'), '', 'TYPE_MISMATCH'],
    [{file_name: 'a.txt'}, pdf, '', 'TYPE_MISMATCH'],
    [{file_name: 'a.docx'}, pdf, '', 'TYPE_MISMATCH'],
    [{}, new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3]), '', 'UNSUPPORTED_TYPE'],
    [{file_name: 'a.txt'}, body('NUL\0'), '', 'TYPE_MISMATCH'],
    [{file_name: 'a.txt'}, new Uint8Array([0xff,0xfe,0x80]), '', 'TYPE_MISMATCH'],
    [{file_name: 'a.txt'}, body('<html>Sign in</html>'), 'text/html', 'UNSUPPORTED_TYPE'],
    [{file_name: 'a.pdf'}, pdf, 'text/plain', 'TYPE_MISMATCH'],
  ]) await assert.rejects(fetchAttachment(file(metadata), {fetchImpl: async () => new Response(bytes, {headers: mime ? {'Content-Type': mime} : {}})}), errorCode(code));
});

test('whole download deadline applies even when the fetch implementation does not honor abort', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const pending = fetchAttachment(file(), {fetchImpl: () => new Promise(() => {})});
  const rejection = assert.rejects(pending, errorCode('DOWNLOAD_TIMEOUT'));
  t.mock.timers.tick(ATTACHMENT_TIMEOUT_MS);
  await rejection;
});
