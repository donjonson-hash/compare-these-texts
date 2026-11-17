/** Offline DOM integration only: no browser, navigation, or external network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM, VirtualConsole} from 'jsdom';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = process.env.CTT_CHATGPT_SOURCE || repository;
const {createHandler} = await import(pathToFileURL(path.join(sourceRoot, 'chatgpt/server.mjs')));
const html = await readFile(path.join(sourceRoot, 'chatgpt/ui.html'), 'utf8');
const sdk = `export class App {
  constructor() { window.__app = this; }
  connect() { return Promise.resolve(); }
  getHostCapabilities() { return {updateModelContext:{text:true},downloadFile:true}; }
  getHostContext() { return {availableDisplayModes:['inline','fullscreen']}; }
  callServerTool(input) { return window.__callServerTool(input); }
  updateModelContext(value) { window.__contexts.push(value); return Promise.resolve({}); }
  downloadFile(value) { window.__downloads.push(value); return Promise.resolve({}); }
}`;
const documentUi = `export function createDocumentUI({onActivate}) {
  const node=id=>document.getElementById(id);
  return {
    show(){onActivate();node('document-mode').hidden=false;},
    hide(){node('document-mode').hidden=true;},
    lock(value){node('mode-text').disabled=value;node('mode-documents').disabled=value;},
    hostReady(){},
    receive(){this.show();},
  };
}`;
const compiled = await build({
  entryPoints: [path.join(sourceRoot, 'chatgpt/ui.mjs')], bundle: true, write: false,
  format: 'iife', platform: 'browser', target: 'es2022',
  plugins: [{name: 'offline-host', setup(b) {
    b.onResolve({filter: /^@modelcontextprotocol\/ext-apps$/}, () => ({path: 'sdk', namespace: 'offline'}));
    b.onResolve({filter: /^\.\/document-ui\.mjs$/}, () => ({path: 'documents', namespace: 'offline'}));
    b.onLoad({filter: /.*/, namespace: 'offline'}, args => ({contents: args.path === 'sdk' ? sdk : documentUi, loader: 'js'}));
  }}],
});

async function until(check, message = 'UI did not settle') {
  const deadline = Date.now() + 2500;
  while (!check()) {
    if (Date.now() > deadline) assert.fail(message);
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

async function harness(t, {embedded = true} = {}) {
  const handler = createHandler('<!doctype html><title>In-memory test server</title>');
  const calls = [], errors = [], downloads = [], contexts = [], copied = [], blobs = [], links = [];
  let nextFailure = null, pauseNext = null;
  async function serverTool(name, args) {
    const response = await handler.fetch(new Request('https://ctt-offline.invalid/mcp', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}}),
    }));
    const envelope = await response.json();
    return envelope.result;
  }
  async function callServerTool({name, arguments: args}) {
    const record = {name, args: structuredClone(args)}; calls.push(record);
    if (pauseNext && name === 'apply_text_changes') {
      const pause = pauseNext; pauseNext = null; await pause;
    }
    if (nextFailure && name === 'apply_text_changes') {
      const text = nextFailure; nextFailure = null;
      record.result = {isError: true, content: [{type: 'text', text}]};
    } else record.result = await serverTool(name, args);
    return structuredClone(record.result);
  }
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, {
    url: 'https://ctt-offline.invalid/', runScripts: 'outside-only', virtualConsole,
    beforeParse(window) {
      if (embedded) Object.defineProperty(window, 'parent', {configurable: true, value: {}});
      window.TextEncoder = TextEncoder; window.TextDecoder = TextDecoder;
      window.Blob = Blob; window.structuredClone = structuredClone;
      window.__callServerTool = callServerTool;
      window.__downloads = downloads; window.__contexts = contexts;
      Object.defineProperty(window.navigator, 'clipboard', {value: {async writeText(text) { copied.push(text); }}});
      window.URL.createObjectURL = blob => { blobs.push(blob); return `blob:offline-${blobs.length}`; };
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function () { links.push({href: this.href, download: this.download}); };
      window.fetch = async (url, init) => {
        const request = new Request(new URL(url, 'https://ctt-offline.invalid'), init);
        const args = JSON.parse(init.body), name = new URL(request.url).pathname === '/api/compare' ? 'compare_texts' : 'apply_text_changes';
        const result = await callServerTool({name, arguments: args});
        return new Response(JSON.stringify(result.isError ? {error: result.content[0].text} : result._meta), {status: result.isError ? 400 : 200, headers: {'Content-Type': 'application/json'}});
      };
    },
  });
  t.after(() => dom.window.close());
  const {window} = dom, node = id => {
    const element = window.document.getElementById(id);
    assert.ok(element, `Missing UI element #${id}`);
    return element;
  };
  window.addEventListener('error', event => errors.push(event.error || event.message));
  window.eval(compiled.outputFiles[0].text);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, [], 'UI startup must bind every existing DOM ID without errors.');
  async function idle() {
    await until(() => !window.document.body.classList.contains('busy'));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(errors, [], 'UI event handler must not throw.');
  }
  async function click(id) { node(id).click(); await idle(); }
  function type(id, value) { node(id).value = value; node(id).dispatchEvent(new window.Event('input', {bubbles: true})); }
  async function compare(original, revised) {
    await click('mode-text'); type('original', original); type('revised', revised);
    await click('compare'); assert.equal(node('review').hidden, false);
    return calls.at(-1).result;
  }
  async function host(result) {
    assert.ok(embedded); window.__app.ontoolresult(structuredClone(result)); await idle();
  }
  return {window, node, click, type, compare, host, idle, calls, downloads, contexts, copied, blobs, links, serverTool,
    result: () => node('result-text').textContent,
    failNext(message = 'Synthetic apply failure') { nextFailure = message; },
    pauseNext() { let resume; pauseNext = new Promise(resolve => { resume = resolve; }); return resume; },
  };
}

const ORIGINAL = 'Price: 100. Term: 10 days.';
const REVISED = 'Price: 200. Term: 30 days.';
const FIRST_ACCEPTED = 'Price: 200. Term: 10 days.';

test('visible A/B actions immediately update the right result and restore A', async t => {
  const ui = await harness(t);
  await ui.compare(ORIGINAL, REVISED);
  assert.equal(ui.window.document.getElementById('apply'), null, 'The old pending batch action is removed.');
  assert.equal(ui.result(), ORIGINAL);
  assert.equal(ui.node('show-revised').getAttribute('aria-selected'), 'true');
  assert.equal(ui.node('accept-change').disabled, false);
  assert.equal(ui.node('keep-change').disabled, true);
  await ui.click('accept-change');
  assert.equal(ui.result(), FIRST_ACCEPTED);
  assert.equal(ui.node('show-result').getAttribute('aria-selected'), 'true');
  assert.equal(ui.node('result-text').hidden, false);
  assert.equal(ui.node('revised-doc').hidden, true);
  assert.match(ui.node('status').textContent, /Результат обновлён/);
  assert.equal(ui.node('accept-change').disabled, true);
  assert.equal(ui.node('keep-change').disabled, false);
  await ui.click('show-revised');
  assert.equal(ui.node('revised-doc').textContent, REVISED);
  await ui.click('show-result');
  assert.equal(ui.result(), FIRST_ACCEPTED);
  await ui.click('keep-change');
  assert.equal(ui.result(), ORIGINAL);
  assert.deepEqual(ui.calls.at(-1).args.changeIds, []);
});

test('individual checkboxes and bulk choice apply immediately with no pending selection', async t => {
  const ui = await harness(t);
  const compared = await ui.compare(ORIGINAL, REVISED);
  let checkboxes = ui.node('change-list').querySelectorAll('input');
  assert.equal(checkboxes.length, 2);
  checkboxes[1].click(); await ui.idle();
  assert.equal(ui.result(), 'Price: 100. Term: 30 days.');
  assert.deepEqual(ui.calls.at(-1).args.changeIds, [compared._meta.comparison.changes[1].id]);
  assert.equal(ui.node('select-all').indeterminate, true);
  await ui.click('select-all');
  assert.equal(ui.result(), REVISED);
  assert.equal(ui.node('select-all').checked, true);
  assert.equal(ui.node('select-all').indeterminate, false);
  assert.ok([...ui.node('change-list').querySelectorAll('input')].every(box => box.checked));
  await ui.click('select-all');
  assert.equal(ui.result(), ORIGINAL);
  assert.ok([...ui.node('change-list').querySelectorAll('input')].every(box => !box.checked));
});

test('undo and redo keep history intact when an apply request fails', async t => {
  const ui = await harness(t);
  await ui.compare(ORIGINAL, REVISED);
  assert.equal(ui.node('undo').disabled, true);
  await ui.click('accept-change'); await ui.click('next'); await ui.click('accept-change');
  assert.equal(ui.result(), REVISED);
  ui.failNext('Undo failed deliberately');
  await ui.click('undo');
  assert.equal(ui.result(), REVISED);
  assert.match(ui.node('status').textContent, /Undo failed/);
  assert.equal(ui.node('redo').disabled, true);
  await ui.click('undo');
  assert.equal(ui.result(), FIRST_ACCEPTED);
  ui.failNext('Redo failed deliberately');
  await ui.click('redo');
  assert.equal(ui.result(), FIRST_ACCEPTED);
  assert.equal(ui.node('redo').disabled, false);
  await ui.click('redo'); assert.equal(ui.result(), REVISED);
  await ui.click('undo'); await ui.click('undo'); assert.equal(ui.result(), ORIGINAL);
  assert.equal(ui.node('undo').disabled, true);
  await ui.click('redo'); assert.equal(ui.result(), FIRST_ACCEPTED);
});

test('failed checkbox and bulk updates revert controls; busy UI cannot dispatch a second apply', async t => {
  const ui = await harness(t);
  await ui.compare(ORIGINAL, REVISED);
  ui.failNext();
  ui.node('change-list').querySelector('input').click(); await ui.idle();
  assert.equal(ui.result(), ORIGINAL);
  assert.equal(ui.node('change-list').querySelector('input').checked, false);
  ui.failNext(); await ui.click('select-all');
  assert.equal(ui.result(), ORIGINAL);
  assert.equal(ui.node('select-all').checked, false);
  const resume = ui.pauseNext(), count = ui.calls.length;
  ui.node('accept-change').click();
  assert.equal(ui.node('accept-change').disabled, true);
  assert.equal(ui.node('next').disabled, true);
  assert.equal(ui.node('mode-documents').disabled, true);
  ui.node('accept-change').click(); ui.node('select-all').click();
  assert.equal(ui.calls.length, count + 1);
  resume(); await ui.idle();
  assert.equal(ui.result(), FIRST_ACCEPTED);
});

test('a repeated host snapshot preserves local decisions and an active text draft', async t => {
  const ui = await harness(t);
  const initial = await ui.serverTool('compare_texts', {original: ORIGINAL, revised: REVISED});
  await ui.host(initial); await ui.click('accept-change');
  await ui.host(initial);
  assert.equal(ui.result(), FIRST_ACCEPTED, 'A repeated host notification must not undo local acceptance.');
  await ui.click('edit'); ui.type('original', 'Unsaved source draft');
  await ui.host(initial);
  assert.equal(ui.node('inputs').hidden, false);
  assert.equal(ui.node('original').value, 'Unsaved source draft');
});

test('a delayed host echo of a local comparison cannot undo a newer accepted change', async t => {
  const ui = await harness(t);
  const initial = await ui.compare(ORIGINAL, REVISED);
  await ui.click('accept-change');
  await ui.host(initial);
  assert.equal(ui.result(), FIRST_ACCEPTED);
  assert.equal(ui.node('change-list').querySelector('input').checked, true);
});

test('a new host command with identical arguments applies after undo while an old echo is ignored', async t => {
  const ui = await harness(t);
  const initial = await ui.serverTool('compare_texts', {original: ORIGINAL, revised: REVISED});
  await ui.host(initial);
  const args = {
    original: ORIGINAL, revised: REVISED,
    comparisonId: initial._meta.comparison.comparisonId,
    changeIds: [initial._meta.comparison.changes[0].id],
  };
  const firstCommand = await ui.serverTool('apply_text_changes', args);
  await ui.host(firstCommand); assert.equal(ui.result(), FIRST_ACCEPTED);
  await ui.click('undo'); assert.equal(ui.result(), ORIGINAL);
  await ui.host(firstCommand); assert.equal(ui.result(), ORIGINAL, 'A delayed echo must not reapply an undone decision.');
  const newCommand = await ui.serverTool('apply_text_changes', args);
  assert.ok(newCommand._meta.snapshotId);
  assert.notEqual(newCommand._meta.snapshotId, firstCommand._meta.snapshotId);
  await ui.host(newCommand); assert.equal(ui.result(), FIRST_ACCEPTED, 'A fresh command must not be mistaken for a duplicate payload.');
});

test('editing survives document/text mode switching and fresh comparison uses the draft', async t => {
  const ui = await harness(t);
  await ui.compare(ORIGINAL, REVISED); await ui.click('accept-change');
  await ui.click('edit');
  ui.type('original', 'Draft A: 10'); ui.type('revised', 'Draft B: 20');
  await ui.click('mode-documents'); await ui.click('mode-text');
  assert.equal(ui.node('inputs').hidden, false);
  assert.equal(ui.node('review').hidden, true);
  assert.equal(ui.node('original').value, 'Draft A: 10');
  assert.equal(ui.node('revised').value, 'Draft B: 20');
  await ui.click('compare');
  assert.equal(ui.calls.at(-1).args.original, 'Draft A: 10');
  assert.equal(ui.calls.at(-1).args.revised, 'Draft B: 20');
  assert.equal(ui.node('inputs').hidden, true);
  assert.equal(ui.node('undo').disabled, true, 'A new comparison starts a new history.');
  await ui.click('select-all'); assert.equal(ui.result(), 'Draft B: 20');
});

test('TXT download and copy use the accepted result, while HTML remains an explicitly separate report', async t => {
  const ui = await harness(t);
  const original = '🚀 Цена: 100\r\nСрок: 10\r\n';
  const revised = '🚀 Цена: 200\r\nСрок: 30\r\n';
  const expected = '🚀 Цена: 200\r\nСрок: 10\r\n';
  await ui.host(await ui.serverTool('compare_texts', {original, revised}));
  await ui.click('accept-change');
  await ui.click('download');
  const resource = ui.downloads.at(-1).contents[0].resource;
  assert.equal(resource.mimeType, 'text/plain');
  assert.equal(resource.text, expected);
  assert.deepEqual(Buffer.from(new TextEncoder().encode(resource.text)), Buffer.from(expected, 'utf8'));
  await ui.click('copy'); assert.equal(ui.copied.at(-1), expected);
  assert.match(ui.node('download').textContent, /итог TXT/);
  assert.match(ui.node('text-report').textContent, /Отчёт HTML/);
  await ui.click('text-report');
  const report = ui.downloads.at(-1).contents[0].resource;
  assert.equal(report.mimeType, 'text/html');
  assert.match(report.text, /<mark>200<\/mark>/);
  assert.match(report.text, /<mark>30<\/mark>/);
  assert.equal(ui.result(), expected, 'Exporting the report must not alter accepted changes.');
});

test('standalone TXT download emits exact UTF-8 bytes through the real Blob path', async t => {
  const ui = await harness(t, {embedded: false});
  await ui.click('mode-text');
  const original = '🚀 A\r\nOriginal\r\n', revised = '🚀 B\r\nUpdated\r\n';
  for (const [side, value] of [['original', original], ['revised', revised]]) {
    const bytes = new TextEncoder().encode(value);
    Object.defineProperty(ui.node('file-' + side), 'files', {configurable: true, value: [{name: side + '.txt', size: bytes.byteLength, async arrayBuffer() { return bytes.buffer.slice(0); }}]});
    ui.node('file-' + side).dispatchEvent(new ui.window.Event('change', {bubbles: true}));
    await ui.idle();
  }
  await ui.click('compare'); await ui.click('select-all'); await ui.click('download');
  assert.equal(ui.links.at(-1).download, 'result.txt');
  assert.equal(ui.blobs.at(-1).type, 'text/plain;charset=utf-8');
  assert.deepEqual(new Uint8Array(await ui.blobs.at(-1).arrayBuffer()), new TextEncoder().encode(revised));
});
