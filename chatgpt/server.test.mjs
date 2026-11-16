import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler, WIDGET_URI, MAX_BODY_BYTES} from './server.mjs';

const widget = '<!doctype html><html><body><p>CTT review</p></body></html>';
const app = createHandler(widget);
function request(path, body, options = {}) {
  return app.fetch(new Request(`https://ctt.example${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
    ...options,
  }));
}
async function rpc(method, params = {}, id = 1) {
  const response = await request('/mcp', {jsonrpc: '2.0', id, method, params});
  return {response, body: await response.json()};
}
async function call(name, args) { return (await rpc('tools/call', {name, arguments: args})).body.result; }

test('discovery, legacy initialization, notification and ping follow stateless MCP', async () => {
  const discovery = await rpc('server/discover');
  assert.deepEqual(discovery.body.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(discovery.body.result.capabilities, {tools: {}, resources: {}});
  const initialized = await rpc('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '1'}});
  assert.equal(initialized.body.result.protocolVersion, '2025-06-18');
  assert.equal(initialized.response.headers.get('mcp-session-id'), null);
  const notification = await request('/mcp', {jsonrpc: '2.0', method: 'notifications/initialized'});
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');
  assert.deepEqual((await rpc('ping')).body.result, {});
});

test('tools declare strict schemas, appropriate annotations, and the review resource', async () => {
  const tools = (await rpc('tools/list')).body.result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['compare_texts', 'apply_text_changes', 'get_text_changes','compare_documents','get_document_changes','compare_uploaded_documents','open_comparison']);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.type, 'object');
    assert.deepEqual(tool.annotations, {readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true});
  }
  assert.equal(tools[0]._meta.ui.resourceUri, WIDGET_URI);
  assert.deepEqual(tools[0]._meta.ui.visibility, ['model', 'app']);
  assert.equal(tools[2]._meta.ui.resourceUri, undefined);
  const resources = (await rpc('resources/list')).body.result.resources;
  assert.equal(resources[0].uri, WIDGET_URI);
  const resource = (await rpc('resources/read', {uri: WIDGET_URI})).body.result.contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  assert.equal(resource.text, widget);
  assert.deepEqual(resource._meta.ui.csp, {connectDomains: [], resourceDomains: []});
  assert.equal((await rpc('resources/read', {uri: 'ui://other'})).body.error.code, -32602);
});

test('MCP compare → selected apply provides exact model data and widget snapshots', async () => {
  const input = {original: 'Price: 100. Term: 10 days.\r\n', revised: 'Price: 200. Term: 30 days.\r\n'};
  const compared = await call('compare_texts', input);
  assert.equal(compared.isError, false);
  assert.equal(compared.structuredContent.summary.total, 2);
  assert.equal(compared._meta.comparison.original, input.original);
  assert.equal(compared._meta.review.result, input.original);
  assert.deepEqual(compared._meta.review.appliedChangeIds, []);
  const {comparisonId, changes} = compared.structuredContent;
  const applied = await call('apply_text_changes', {...input, comparisonId, changeIds: [changes[1].id]});
  assert.equal(applied.isError, false);
  assert.equal(applied.structuredContent.result, 'Price: 100. Term: 30 days.\r\n');
  assert.deepEqual(applied._meta.review, applied.structuredContent);
  assert.equal(applied._meta.comparison.comparisonId, comparisonId);
});

test('paging returns complete hunks and does not reset the widget', async () => {
  const original = Array.from({length: 100}, (_, i) => `section${i} old`).join('\n');
  const revised = Array.from({length: 100}, (_, i) => `section${i} new`).join('\n');
  const compared = await call('compare_texts', {original, revised});
  assert.equal(compared.structuredContent.totalChanges, 100);
  assert.equal(compared.structuredContent.returnedChanges, 80);
  assert.equal(compared.structuredContent.nextOffset, 80);
  const second = await call('get_text_changes', {original, revised, comparisonId: compared.structuredContent.comparisonId, offset: 80});
  assert.equal(second.structuredContent.returnedChanges, 20);
  assert.equal(second.structuredContent.nextOffset, null);
  assert.equal(second._meta, undefined);
  assert.deepEqual([...compared.structuredContent.changes, ...second.structuredContent.changes], compared._meta.comparison.changes);
  const invalid = await call('get_text_changes', {original, revised, comparisonId: compared.structuredContent.comparisonId, offset: 0.5});
  assert.equal(invalid.isError, true);
});

test('invalid, unknown, duplicate, and stale tool arguments return bounded tool errors', async () => {
  const input = {original: 'a b', revised: 'a c'};
  const compared = await call('compare_texts', input);
  const comparisonId = compared.structuredContent.comparisonId;
  for (const args of [
    {...input, comparisonId, changeIds: ['change-9999']},
    {...input, comparisonId, changeIds: ['change-1', 'change-1']},
    {...input, original: 'a z', comparisonId, changeIds: ['change-1']},
    {...input, comparisonId, changeIds: ['<script>' + 'x'.repeat(10000)]},
  ]) {
    const result = await call('apply_text_changes', args);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent, undefined);
    assert.ok(result.content[0].text.length < 200);
    assert.ok(!result.content[0].text.includes('<script>'));
  }
  assert.equal((await call('compare_texts', {...input, unexpected: true})).isError, true);
  assert.equal((await call('compare_texts', {original: 12, revised: ''})).isError, true);
  assert.equal((await call('compare_texts', {original: '\ud800', revised: ''})).isError, true);
  assert.equal((await call('no_such_tool', input)).isError, true);
});

test('malformed protocol envelopes, unknown methods, and invalid JSON are explicit', async () => {
  for (const invalid of [[], null, {jsonrpc: '1.0', id: 1, method: 'ping'}, {jsonrpc: '2.0', id: {}, method: 'ping'}, {jsonrpc: '2.0', id: 1, method: 'ping', params: []}]) {
    const response = await request('/mcp', invalid);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, -32600);
  }
  assert.equal((await rpc('invented/method')).body.error.code, -32601);
  const malformed = await request('/mcp', {}, {body: '{"secret":"do-not-reflect",'});
  const failure = await malformed.json();
  assert.equal(failure.error.code, -32700);
  assert.ok(!JSON.stringify(failure).includes('do-not-reflect'));
  assert.equal((await rpc('tools/call', {name: 'compare_texts'})).body.error.code, -32602);
  assert.equal((await request('/mcp')).status, 405);
});

test('body size is enforced against actual streamed bytes, with no Content-Length', async () => {
  const tooLarge = await request('/mcp', {}, {body: ' '.repeat(MAX_BODY_BYTES + 1)});
  assert.equal(tooLarge.status, 413);
  assert.match((await tooLarge.json()).error.message, /6 MiB/);
  const utf8Large = await request('/api/compare', {}, {body: JSON.stringify({original: '中'.repeat(Math.ceil(MAX_BODY_BYTES / 3)), revised: ''})});
  assert.equal(utf8Large.status, 413);
  const wrongType = await request('/api/compare', {}, {headers: {'Content-Type': 'text/plain'}});
  assert.equal(wrongType.status, 415);
  const invalidUtf8 = await request('/mcp', {}, {body: new Uint8Array([0xc3, 0x28])});
  assert.equal((await invalidUtf8.json()).error.code, -32700);
});

test('web APIs share the same comparison and selected patch behavior', async () => {
  const input = {original: 'red green blue', revised: 'red new green blue!'};
  const compared = await (await request('/api/compare', input)).json();
  assert.equal(compared.comparison.changes.length, 2);
  const applied = await (await request('/api/apply', {...input, comparisonId: compared.comparison.comparisonId, changeIds: [compared.comparison.changes[1].id]})).json();
  assert.equal(applied.review.result, 'red green blue!');
  assert.equal(applied.comparison.revised, input.revised);
  const stale = await request('/api/apply', {...input, revised: 'different', comparisonId: compared.comparison.comparisonId, changeIds: []});
  assert.equal(stale.status, 400);
  assert.match((await stale.json()).error, /stale/);
});

test('download emits exact UTF-8 bytes, including CRLF, final newline, and emoji', async () => {
  const text = '🚀 Результат\r\nPrice:\t200\r\n';
  const exported = await request('/api/export', {text});
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('Content-Disposition'), 'attachment; filename="result.txt"');
  assert.equal(exported.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.deepEqual(new Uint8Array(await exported.arrayBuffer()), new TextEncoder().encode(text));
  assert.equal((await request('/api/export', {text: '\udfff'})).status, 400);
  assert.equal((await request('/api/export', {text: 'x'.repeat(60001)})).status, 400);
  assert.equal((await request('/api/export', {text, filename: '../secret'})).status, 400);
});

test('documents remain JSON data and never become HTML in the resource', async () => {
  const attack = '</script><script>globalThis.pwned=true</script>';
  const compared = await request('/api/compare', {original: attack, revised: 'safe'});
  assert.match(compared.headers.get('Content-Type'), /^application\/json/);
  assert.equal((await compared.json()).comparison.original, attack);
  const html = await request('/');
  assert.equal(await html.text(), widget);
  assert.match(html.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const resource = (await rpc('resources/read', {uri: WIDGET_URI})).body.result.contents[0].text;
  assert.ok(!resource.includes(attack));
  assert.equal(globalThis.pwned, undefined);
  for (const path of ['/', '/health', '/missing']) {
    const response = await request(path);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  }
  assert.equal((await request('/missing')).status, 404);
});
