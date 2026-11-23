import test from 'node:test';
import assert from 'node:assert/strict';
import * as server from './server.mjs';
import {docx} from '../tests/fixtures/text-fixture.mjs';

const widget = '<!doctype html><html><body data-build="0.2.2">Current document and text viewer</body></html>';
const source = (name, paragraphs) => ({name, data: Buffer.from(docx(paragraphs)).toString('base64')});

function client(options = {}) {
  const app = server.createHandler(widget, options);
  async function rpc(method, params = {}, extraHeaders = {}) {
    const response = await app.fetch(new Request('https://ctt.example/mcp', {
      method: 'POST', headers: {'Content-Type': 'application/json', ...extraHeaders},
      body: JSON.stringify({jsonrpc: '2.0', id: 'client-request', method, params}),
    }));
    assert.equal(response.status, 200);
    return response.json();
  }
  async function call(name, args = {}) { return (await rpc('tools/call', {name, arguments: args})).result; }
  return {app, rpc, call};
}

test('cached v1 resource URI serves the current viewer with the requested identity and current snapshots', async () => {
  const c = client();
  assert.deepEqual(server.LEGACY_WIDGET_URIS, ['ui://ctt/review-v1.html']);
  // A host may retain the previous descriptor even after tools/list changes.
  const cachedTemplate = 'ui://ctt/review-v1.html';
  const cachedRead = (await c.rpc('resources/read', {uri: cachedTemplate})).result.contents[0];
  assert.equal(cachedRead.uri, cachedTemplate);
  assert.equal(cachedRead.mimeType, 'text/html;profile=mcp-app');
  assert.equal(cachedRead.text, widget);
  assert.deepEqual(cachedRead._meta.ui.csp, {connectDomains: [], resourceDomains: []});
  const currentRead = (await c.rpc('resources/read', {uri: server.WIDGET_URI})).result.contents[0];
  assert.equal(currentRead.uri, server.WIDGET_URI);
  assert.equal(currentRead.text, cachedRead.text);

  const texts = await c.call('compare_texts', {original: 'Срок: 10 дней.\r\n', revised: 'Срок: 20 дней.\r\n'});
  assert.equal(texts.isError, false);
  assert.equal(texts._meta.comparison.original, 'Срок: 10 дней.\r\n');
  assert.equal(texts._meta.comparison.revised, 'Срок: 20 дней.\r\n');
  assert.equal(texts._meta.review.result, 'Срок: 10 дней.\r\n');
  assert.equal(texts.structuredContent.comparisonId, texts._meta.comparison.comparisonId);

  const documents = await c.call('compare_uploaded_documents', {
    original: source('A.docx', ['Договор', 'Сумма: 100']),
    revised: source('B.docx', ['Договор', 'Сумма: 200']),
  });
  assert.equal(documents.isError, false);
  assert.equal(documents._meta.documentComparison.kind, 'documents');
  assert.equal(documents._meta.documentComparison.changes[0].before, 'Сумма: 100');
  assert.equal(documents._meta.documentComparison.changes[0].after, 'Сумма: 200');
  assert.equal(documents._meta.documentComparison.comparisonId, documents.structuredContent.comparisonId);
  assert.equal((await c.rpc('resources/read', {uri: cachedTemplate})).result.contents[0].text, widget);
  assert.equal((await c.rpc('resources/read', {uri: 'ui://ctt/review-does-not-exist.html'})).error.code, -32602);
});

test('new descriptors use the current URI while a no-argument launcher opens the viewer', async () => {
  const c = client();
  const discovery = (await c.rpc('server/discover')).result;
  assert.equal(discovery.serverInfo.version, '0.2.2');
  const {tools} = (await c.rpc('tools/list')).result;
  const launcher = tools.find(tool => tool.name === 'open_comparison');
  assert.ok(launcher);
  assert.deepEqual(launcher.inputSchema.properties, {});
  assert.deepEqual(launcher.inputSchema.required || [], []);
  assert.equal(launcher.inputSchema.additionalProperties, false);
  assert.equal(launcher._meta.ui.resourceUri, server.WIDGET_URI);
  assert.equal(launcher._meta['openai/outputTemplate'], server.WIDGET_URI);
  assert.deepEqual(launcher._meta.ui.visibility, ['model', 'app']);
  assert.equal(launcher.annotations.readOnlyHint, true);
  for (const tool of tools.filter(tool => tool._meta?.ui?.resourceUri)) assert.equal(tool._meta.ui.resourceUri, server.WIDGET_URI);

  const result = await c.call('open_comparison');
  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent, {viewerReady: true});
  assert.deepEqual(result._meta, {viewer: true});
  assert.ok(result.content.some(block => block.type === 'text' && block.text.length > 0));
  assert.equal((await c.call('open_comparison', {original: 'Unexpected document text'})).isError, true);
  const listed = (await c.rpc('resources/list')).result.resources;
  assert.ok(listed.some(resource => resource.uri === server.WIDGET_URI));
  assert.equal((await (await c.app.fetch(new Request('https://ctt.example/health'))).json()).version, '0.2.2');
});

test('diagnostics expose only allowlisted method, tool and resource labels', async () => {
  const events = [];
  const c = client({onDiagnostic: event => events.push(event)});
  const secret = 'PRIVATE-DOCUMENT-CANARY-7391';
  const headers = {'oai-authenticated-user-id': `user-${secret}`, 'oai-authenticated-user-email': `${secret}@example.com`, Authorization: `Bearer ${secret}`};
  await c.rpc('server/discover', {}, headers);
  await c.rpc('tools/list');
  await c.rpc('resources/read', {uri: server.WIDGET_URI});
  await c.rpc('resources/read', {uri: 'ui://ctt/review-v1.html'});
  await c.rpc('resources/read', {uri: `https://example.com/${secret}?token=private`});
  await c.rpc(`malicious/${secret}`, {_meta: {secret}}, headers);
  await c.rpc('tools/call', {name: `tool-${secret}`, arguments: {document: secret, file: {download_url: `https://files.oaiusercontent.com/${secret}`}}});
  await c.rpc('tools/call', {name: 'compare_texts', arguments: {original: secret, revised: `${secret} changed`, originalName: `${secret}.txt`, revisedName: `revised-${secret}.txt`}}, headers);
  await c.call('open_comparison');

  assert.ok(events.length > 0);
  const allowedKeys = new Set(['event', 'version', 'method', 'tool', 'resource']);
  const allowedMethods = new Set(['server/discover', 'initialize', 'ping', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'notifications/initialized', 'unknown']);
  const knownTools = new Set(['open_comparison', 'compare_texts', 'apply_text_changes', 'get_text_changes', 'compare_documents', 'get_document_changes', 'compare_uploaded_documents', 'unknown']);
  for (const event of events) {
    assert.ok(Object.keys(event).every(key => allowedKeys.has(key)));
    assert.equal(event.event, 'ctt_mcp');
    assert.equal(event.version, '0.2.2');
    assert.ok(allowedMethods.has(event.method));
    if (event.tool !== undefined) assert.ok(knownTools.has(event.tool));
    if (event.resource !== undefined) assert.ok(['current', 'legacy', 'unknown'].includes(event.resource));
    assert.ok(JSON.stringify(event).length < 250);
  }
  assert.ok(events.some(event => event.method === 'unknown'));
  assert.ok(events.some(event => event.method === 'tools/call' && event.tool === 'unknown'));
  assert.ok(events.some(event => event.method === 'tools/call' && event.tool === 'compare_texts'));
  for (const resource of ['current', 'legacy', 'unknown']) assert.ok(events.some(event => event.method === 'resources/read' && event.resource === resource));
  const serialized = JSON.stringify(events);
  for (const forbidden of [secret, 'https://', 'ui://', 'file_id', 'download_url', 'Authorization', 'oai-authenticated']) assert.ok(!serialized.includes(forbidden));
});

test('an unavailable diagnostic sink cannot prevent resource rendering or tool results', async () => {
  const c = client({onDiagnostic() { throw new Error('diagnostic sink unavailable'); }});
  assert.equal((await c.rpc('resources/read', {uri: 'ui://ctt/review-v1.html'})).result.contents[0].text, widget);
  const opened = await c.call('open_comparison');
  assert.equal(opened.isError, false);
  assert.deepEqual(opened._meta, {viewer: true});
  assert.equal((await c.call('compare_texts', {original: 'A', revised: 'B'})).isError, false);
});
