import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {validateCheckedText} from '../src/ocr-import.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
async function harness(t, {texts = ['Page one', 'Page two'], makeWorker} = {}) {
  const dom = new JSDOM('<button id="before">Upload</button>', {runScripts: 'outside-only'});
  const context = dom.getInternalVMContext(), destroyed = [], revoked = [], languages = [], pageCalls = [], workerOptions = [];
  dom.window.TextEncoder = TextEncoder;
  dom.window.URL.createObjectURL = () => 'blob:local-image';
  dom.window.URL.revokeObjectURL = url => revoked.push(url);
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const pdf = new vm.SyntheticModule(['openPdf'], function() { this.setExport('openPdf', async () => ({
    pageCount: texts.length, destroy: async () => { destroyed.push(true); },
    page: async (n, options) => { pageCalls.push({n, options}); return {blob: {}, text: texts[n - 1], hasText: Boolean(texts[n - 1].trim())}; },
  })); }, {context});
  const runtime = new vm.SyntheticModule(['makeWorker'], function() { this.setExport('makeWorker', async (lang, logger, options) => {
    languages.push(lang); workerOptions.push(options); return makeWorker ? makeWorker(options) : {recognize: async () => ({data: {text: 'Recognized Russian Я'}}), terminate: async () => {}};
  }); }, {context});
  const module = new vm.SourceTextModule(readFileSync(new URL('../src/ocr-review.mjs', import.meta.url), 'utf8'), {context});
  const validator = new vm.SyntheticModule(['validateCheckedText'], function() { this.setExport('validateCheckedText', validateCheckedText); }, {context});
  const imageInput = new vm.SyntheticModule(['validateOcrImage'], function() { this.setExport('validateOcrImage', async () => ({})); }, {context});
  await module.link(specifier => specifier.includes('pdf-input') ? pdf : specifier.includes('ocr-import') ? validator : specifier.includes('image-input') ? imageInput : runtime); await module.evaluate();
  t.after(() => dom.window.close());
  const file = {name: 'scan.pdf', type: 'application/pdf', size: 100};
  const open = async options => { const result = module.namespace.reviewOcrFile(file, options); await tick(); return {result}; };
  const $ = selector => dom.window.document.querySelector(selector);
  const change = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new dom.window.Event('change')); };
  return {dom, module, open, $, change, languages, destroyed, revoked, pageCalls, workerOptions};
}

test('review gate requires every page and editing revokes approval without losing another page', async t => {
  const h = await harness(t), {result} = await h.open();
  assert.equal(h.$('.ocr-use').disabled, true);
  h.$('.ocr-confirm').click(); assert.equal(h.$('.ocr-use').disabled, true);
  h.change('.ocr-page-select', '1'); await tick(); h.$('.ocr-confirm').click();
  assert.equal(h.$('.ocr-use').disabled, false);
  h.change('.ocr-page-select', '0'); await tick();
  h.$('.ocr-text').value = 'Edited page one'; h.$('.ocr-text').dispatchEvent(new h.dom.window.Event('input'));
  assert.equal(h.$('.ocr-use').disabled, true);
  h.$('.ocr-confirm').click(); h.$('.ocr-use').click();
  const data = await result;
  assert.equal(data.text, 'Edited page one\n\nPage two'); assert.equal(data.pages.length, 2);
  assert.equal(h.$('.ocr-review-dialog'), null); assert.equal(h.destroyed.length, 1); assert.ok(h.revoked.length >= 3);
});

test('blank page needs explicit confirmation and an entirely blank document cannot be used', async t => {
  const h = await harness(t, {texts: ['']}), {result} = await h.open();
  assert.equal(h.$('.ocr-confirm').disabled, true);
  h.$('.ocr-blank').click(); h.$('.ocr-confirm').click(); h.$('.ocr-use').click();
  assert.match(h.$('.ocr-status').textContent, /no text to compare/);
  assert.ok(h.$('.ocr-review-dialog'));
  h.$('.ocr-close').click(); assert.equal(await result, null);
});

test('explicit language survives reopening and is scoped to the selected side', async t => {
  const h = await harness(t), first = await h.open({side: 'left'});
  h.change('.ocr-language', 'rus'); h.$('.ocr-close').click(); await first.result;
  const second = await h.open({side: 'left'}); assert.equal(h.$('.ocr-language').value, 'rus');
  h.change('.ocr-page-select', '1'); await tick(); assert.equal(h.$('.ocr-language').value, 'rus');
  h.$('.ocr-close').click(); await second.result;
  const third = await h.open({side: 'right'}); assert.equal(h.$('.ocr-language').value, 'eng');
  h.$('.ocr-close').click(); await third.result;
});

test('abort during worker initialization prevents late text and terminates the late worker', async t => {
  const pending = deferred(); let terminated = 0, recognized = 0;
  const h = await harness(t, {makeWorker: () => pending.promise}), controller = new AbortController();
  const {result} = await h.open({signal: controller.signal}); h.$('.ocr-recognize').click(); await tick();
  controller.abort(); assert.equal(await result, null); assert.equal(h.$('.ocr-review-dialog'), null);
  pending.resolve({recognize: async () => { recognized++; return {data: {text: 'late'}}; }, terminate: async () => { terminated++; }});
  await tick(); assert.equal(recognized, 0); assert.equal(terminated, 1);
});

test('aggregate checked text is bounded before entering comparison', async t => {
  const h = await harness(t);
  const page = text => ({text, loaded: true, confirmed: true, blank: false, source: 'ocr'});
  assert.throws(() => h.module.namespace.reviewedOcrResult([page('x'.repeat(300000)), page('y'.repeat(300000))], 'large.pdf'), /too large/);
  assert.throws(() => h.module.namespace.reviewedOcrResult([{...page('unchecked'), confirmed: false}], 'scan.pdf'), /Check and confirm/);
});


test('region OCR keeps page edits until explicit replacement and revokes confirmation on insert', async t => {
  const h = await harness(t, {texts: ['Keep this wrong text intact']}), {result} = await h.open();
  h.$('.ocr-confirm').click();
  h.change('[data-coordinate="x"]', '10');
  assert.equal(h.$('.ocr-recognize-area').disabled, true, 'out-of-page region is rejected');
  h.change('[data-coordinate="width"]', '50');
  h.change('.ocr-language', 'rus+eng');
  h.$('.ocr-confirm').click(); h.$('.ocr-recognize-area').click(); await tick();
  assert.equal(h.languages.at(-1), 'rus+eng');
  assert.equal(h.pageCalls.at(-1).options.region.x, 0.1);
  assert.equal(h.pageCalls.at(-1).options.region.width, 0.5);
  assert.equal(h.$('.ocr-text').value, 'Keep this wrong text intact');
  assert.equal(h.$('.ocr-use').disabled, false, 'unapplied region does not change approved page');
  h.$('.ocr-text').setSelectionRange(10, 15); h.$('.ocr-apply-area').click();
  assert.equal(h.$('.ocr-text').value, 'Keep this Recognized Russian Я text intact');
  assert.equal(h.$('.ocr-use').disabled, true);
  h.$('.ocr-close').click(); assert.equal(await result, null);
});

test('invalid checked text stays editable inside review instead of losing corrections', async t => {
  const h = await harness(t, {texts: ['Valid']}), {result} = await h.open();
  for (const value of ['line\n'.repeat(2001), 'broken\0text']) {
    h.$('.ocr-text').value = value; h.$('.ocr-text').dispatchEvent(new h.dom.window.Event('input'));
    h.$('.ocr-confirm').click(); h.$('.ocr-use').click();
    assert.ok(h.$('.ocr-review-dialog')); assert.equal(h.$('.ocr-text').value, value);
    assert.match(h.$('.ocr-status').textContent, /too large|NUL/);
  }
  h.$('.ocr-text').value = 'line\n'.repeat(2000); h.$('.ocr-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-confirm').click(); h.$('.ocr-use').click();
  assert.equal((await result).text, 'line\n'.repeat(2000));
});

test('Stop aborts worker initialization and restores editing immediately', async t => {
  const pending = deferred();
  const h = await harness(t, {makeWorker: () => pending.promise}), {result} = await h.open();
  h.$('.ocr-recognize').click(); await tick();
  const workerSignal = h.workerOptions.at(-1).signal;
  h.$('.ocr-stop').click(); await tick();
  assert.equal(workerSignal.aborted, true); assert.equal(h.$('.ocr-text').disabled, false);
  h.$('.ocr-close').click(); pending.resolve({terminate: async () => {}}); await tick();
  assert.equal(await result, null);
});


test('edited area drafts survive page changes and failed recognition', async t => {
  let fail = false;
  const h = await harness(t, {makeWorker: async () => ({recognize: async () => {
    if (fail) throw new Error('test failure'); return {data:{text:'Region'}};
  }, terminate: async () => {}})}), {result} = await h.open();
  h.change('[data-coordinate="width"]', '50'); h.$('.ocr-recognize-area').click(); await tick();
  h.$('.ocr-region-text').value = 'Manually corrected region'; h.$('.ocr-region-text').dispatchEvent(new h.dom.window.Event('input'));
  h.change('.ocr-page-select', '1'); await tick();
  assert.equal(h.$('.ocr-region-result').hidden, true);
  h.change('.ocr-page-select', '0'); await tick();
  assert.equal(h.$('.ocr-region-text').value, 'Manually corrected region'); assert.equal(h.$('.ocr-region-result').hidden, false);
  fail = true; h.$('.ocr-recognize-area').click(); await tick();
  assert.equal(h.$('.ocr-region-text').value, 'Manually corrected region'); assert.equal(h.$('.ocr-region-result').hidden, false);
  h.$('.ocr-close').click(); await result;
});
