import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
async function harness(t, {texts = ['Page one', 'Page two'], makeWorker} = {}) {
  const dom = new JSDOM('<button id="before">Upload</button>', {runScripts: 'outside-only'});
  const context = dom.getInternalVMContext(), destroyed = [], revoked = [], languages = [];
  dom.window.TextEncoder = TextEncoder;
  dom.window.URL.createObjectURL = () => 'blob:local-image';
  dom.window.URL.revokeObjectURL = url => revoked.push(url);
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const pdf = new vm.SyntheticModule(['openPdf'], function() { this.setExport('openPdf', async () => ({
    pageCount: texts.length, destroy: async () => { destroyed.push(true); },
    page: async n => ({blob: {}, text: texts[n - 1], hasText: Boolean(texts[n - 1].trim())}),
  })); }, {context});
  const runtime = new vm.SyntheticModule(['makeWorker'], function() { this.setExport('makeWorker', async lang => {
    languages.push(lang); return makeWorker ? makeWorker() : {recognize: async () => ({data: {text: 'Recognized Russian Я'}}), terminate: async () => {}};
  }); }, {context});
  const module = new vm.SourceTextModule(readFileSync(new URL('../src/ocr-review.mjs', import.meta.url), 'utf8'), {context});
  await module.link(specifier => specifier.includes('pdf-input') ? pdf : runtime); await module.evaluate();
  t.after(() => dom.window.close());
  const file = {name: 'scan.pdf', type: 'application/pdf', size: 100};
  const open = async options => { const result = module.namespace.reviewOcrFile(file, options); await tick(); return {result}; };
  const $ = selector => dom.window.document.querySelector(selector);
  const change = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new dom.window.Event('change')); };
  return {dom, module, open, $, change, languages, destroyed, revoked};
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
