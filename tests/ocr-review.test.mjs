import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import * as layoutFunctions from '../src/ocr-layout.mjs';
import {validateCheckedText} from '../src/ocr-import.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
async function harness(t, {texts = ['Page one', 'Page two'], makeWorker, loadPage, enhanceImage} = {}) {
  const dom = new JSDOM('<button id="before">Upload</button>', {runScripts: 'outside-only'});
  const context = dom.getInternalVMContext(), destroyed = [], revoked = [], languages = [], pageCalls = [], workerOptions = [], enhancements = [], recognitionInputs = [], correctionRenders = [];
  dom.window.TextEncoder = TextEncoder;
  let nextUrl = 0; dom.window.URL.createObjectURL = () => 'blob:local-image-' + ++nextUrl;
  dom.window.URL.revokeObjectURL = url => revoked.push(url);
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  const pdf = new vm.SyntheticModule(['openPdf'], function() { this.setExport('openPdf', async () => ({
    pageCount: texts.length, destroy: async () => { destroyed.push(true); },
    page: async (n, options) => { pageCalls.push({n, options}); if (loadPage) await loadPage(n, options); return {blob: {}, width:1000, height:1500, text: texts[n - 1], hasText: Boolean(texts[n - 1].trim())}; },
  })); }, {context});
  const runtime = new vm.SyntheticModule(['makeWorker'], function() { this.setExport('makeWorker', async (lang, logger, options) => {
    languages.push(lang); workerOptions.push(options); return makeWorker ? makeWorker(options) : {recognize: async input => { recognitionInputs.push(input); return {data: {text: 'Recognized Russian Я'}}; }, terminate: async () => {}};
  }); }, {context});
  const module = new vm.SourceTextModule(readFileSync(new URL('../src/ocr-review.mjs', import.meta.url), 'utf8'), {context});
  const validator = new vm.SyntheticModule(['validateCheckedText'], function() { this.setExport('validateCheckedText', validateCheckedText); }, {context});
  const imageInput = new vm.SyntheticModule(['validateOcrImage'], function() { this.setExport('validateOcrImage', async () => ({})); }, {context});
  const enhancement = new vm.SyntheticModule(['enhanceOcrImage'], function() { this.setExport('enhanceOcrImage', async (blob, options) => { enhancements.push({blob, options}); return enhanceImage ? enhanceImage(blob, options) : {blob: {enhanced: true}, width: 100, height: 100}; }); }, {context});
  const layout = new vm.SyntheticModule(Object.keys(layoutFunctions), function() { for(const [name,value] of Object.entries(layoutFunctions)) this.setExport(name,value); }, {context});
  const corrections = new vm.SyntheticModule(['createCorrectionOverlay'], function() { this.setExport('createCorrectionOverlay', (regions,width,height,doc) => {
    correctionRenders.push({regions:JSON.parse(JSON.stringify(regions)),width,height});
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const region of regions.filter(item => item.edited)) { const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text'); text.textContent=region.text; svg.append(text); }
    return svg;
  }); }, {context});
  await module.link(specifier => specifier.includes('ocr-corrections') ? corrections : specifier.includes('ocr-layout') ? layout : specifier.includes('ocr-enhance') ? enhancement : specifier.includes('pdf-input') ? pdf : specifier.includes('ocr-import') ? validator : specifier.includes('image-input') ? imageInput : runtime); await module.evaluate();
  t.after(() => dom.window.close());
  const file = {name: 'scan.pdf', type: 'application/pdf', size: 100};
  const open = async options => { const result = module.namespace.reviewOcrFile(file, options); await tick(); return {result}; };
  const $ = selector => dom.window.document.querySelector(selector);
  const change = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new dom.window.Event('change')); };
  return {dom, module, open, $, change, languages, destroyed, revoked, pageCalls, workerOptions, enhancements, recognitionInputs, correctionRenders};
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


test('failed page reload and retry preserve checked page and area drafts', async t => {
  let fail = false;
  const h = await harness(t, {loadPage: async () => { if (fail) throw new Error('render failed'); }}), {result} = await h.open();
  h.change('[data-coordinate="width"]', '50'); h.$('.ocr-recognize-area').click(); await tick();
  h.$('.ocr-region-text').value = 'Corrected area'; h.$('.ocr-region-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-text').value = 'Corrected page'; h.$('.ocr-text').dispatchEvent(new h.dom.window.Event('input'));
  const reload = () => [...h.dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'Reload page');
  fail = true; reload().click(); await tick();
  assert.match(h.$('.ocr-status').textContent, /render failed/);
  fail = false; reload().click(); await tick();
  assert.equal(h.$('.ocr-text').value, 'Corrected page');
  assert.equal(h.$('.ocr-region-text').value, 'Corrected area');
  assert.equal(h.$('.ocr-region-result').hidden, false);
  h.$('.ocr-close').click(); await result;
});

test('successful whole-page recognition keeps the existing area draft available', async t => {
  const h = await harness(t), {result} = await h.open();
  h.change('[data-coordinate="width"]', '50'); h.$('.ocr-recognize-area').click(); await tick();
  h.$('.ocr-region-text').value = 'Corrected area'; h.$('.ocr-region-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-recognize').click(); await tick();
  assert.equal(h.$('.ocr-region-result').hidden, false);
  assert.equal(h.$('.ocr-region-text').value, 'Corrected area');
  h.change('.ocr-page-select', '1'); await tick(); h.change('.ocr-page-select', '0'); await tick();
  assert.equal(h.$('.ocr-region-result').hidden, false);
  assert.equal(h.$('.ocr-region-text').value, 'Corrected area');
  h.$('.ocr-close').click(); await result;
});

test('rounding tolerance cannot create an empty region at the page edge', async t => {
  const h = await harness(t), {result} = await h.open();
  for (const axis of ['x', 'y']) {
    h.$('.ocr-clear-area').click();
    h.change(`[data-coordinate="${axis}"]`, '100');
    h.change(`[data-coordinate="${axis === 'x' ? 'width' : 'height'}"]`, '0.00001');
    assert.equal(h.$('.ocr-recognize-area').disabled, true);
  }
  h.$('.ocr-close').click(); await result;
});


test('invalid coordinates retain area edits for correction or page return, while Clear discards them', async t => {
  const h = await harness(t), {result} = await h.open();
  h.change('[data-coordinate="width"]', '50'); h.$('.ocr-recognize-area').click(); await tick();
  h.$('.ocr-region-text').value = 'Corrected area'; h.$('.ocr-region-text').dispatchEvent(new h.dom.window.Event('input'));
  h.change('[data-coordinate="x"]', '60');
  assert.equal(h.$('.ocr-recognize-area').disabled, true);
  h.change('[data-coordinate="x"]', '0');
  assert.equal(h.$('.ocr-region-text').value, 'Corrected area');
  assert.equal(h.$('.ocr-region-result').hidden, false);
  h.change('[data-coordinate="x"]', '60');
  h.change('.ocr-page-select', '1'); await tick(); h.change('.ocr-page-select', '0'); await tick();
  assert.equal(h.$('.ocr-region-text').value, 'Corrected area');
  assert.equal(h.$('.ocr-region-result').hidden, false);
  h.$('.ocr-clear-area').click();
  h.change('.ocr-page-select', '1'); await tick(); h.change('.ocr-page-select', '0'); await tick();
  assert.equal(h.$('.ocr-region-result').hidden, true);
  assert.equal(h.$('.ocr-region-text').value, '');
  h.$('.ocr-close').click(); await result;
});

test('image improvement previews both images without OCR or changing approved text', async t => {
  const h = await harness(t, {texts: ['Already checked']}), {result} = await h.open();
  h.$('.ocr-confirm').click();
  const originalUrl = h.$('.ocr-review-original img').src;
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.enhancements.length, 1);
  assert.equal(h.languages.length, 0, 'preview must not start recognition');
  assert.equal(h.$('.ocr-text').value, 'Already checked');
  assert.equal(h.$('.ocr-enhancement-preview').hidden, false);
  assert.equal(h.dom.window.document.querySelectorAll('.ocr-enhancement-images img').length, 2);
  assert.equal(h.$('.ocr-enhance-recognize').disabled, false);
  assert.equal(h.$('.ocr-page-select').disabled, true);
  assert.equal(h.$('.ocr-review-columns').hidden, true);
  assert.equal(h.$('.ocr-enhancement-result').hidden, true);
  h.$('.ocr-enhance-discard').click(); await tick();
  assert.equal(h.$('.ocr-review-original img').src, originalUrl);
  assert.equal(h.dom.window.document.querySelectorAll('dialog img').length, 1);
  assert.equal(h.$('.ocr-use').disabled, false, 'discard must retain prior approval');
  assert.ok(!h.revoked.includes(originalUrl), 'original remains usable after discard');
  assert.equal(h.revoked.length, 1, 'processed preview URL released');
  h.$('.ocr-close').click(); assert.equal(await result, null);
});

test('enhanced OCR is a draft until explicit application and uses the processed pixels', async t => {
  const h = await harness(t, {texts: ['Original checked text']}), {result} = await h.open();
  h.change('.ocr-language', 'rus+eng'); h.$('.ocr-confirm').click();
  h.$('.ocr-improve').click(); await tick(); h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.languages.at(-1), 'rus+eng');
  assert.equal(h.recognitionInputs.at(-1).enhanced, true);
  assert.equal(h.$('.ocr-text').value, 'Original checked text');
  assert.equal(h.$('.ocr-enhanced-text').value, 'Recognized Russian Я');
  h.$('.ocr-enhanced-text').value = 'Manually checked new text';
  h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-enhance-apply').click();
  assert.equal(h.$('.ocr-text').value, 'Manually checked new text');
  assert.equal(h.$('.ocr-enhancement-preview').hidden, true);
  assert.equal(h.$('.ocr-use').disabled, true, 'applied text needs fresh confirmation');
  h.$('.ocr-confirm').click(); h.$('.ocr-use').click();
  const checked = await result;
  assert.equal(checked.text, 'Manually checked new text');
  assert.equal(checked.pages[0].source, 'ocr');
});

test('stopping preview generation ignores late image and preserves approval', async t => {
  const pending = deferred();
  const h = await harness(t, {texts: ['Keep'], enhanceImage: () => pending.promise}), {result} = await h.open();
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  h.$('.ocr-enhance-stop').click(); await tick();
  assert.equal(h.enhancements[0].options.signal.aborted, true);
  assert.equal(h.$('.ocr-enhance-prepare').disabled, false);
  pending.resolve({blob: {late: true}, width: 100, height: 100}); await tick();
  assert.equal(h.$('.ocr-enhance-recognize').disabled, true);
  assert.equal(h.$('.ocr-text').value, 'Keep');
  h.$('.ocr-enhance-discard').click(); assert.equal(h.$('.ocr-use').disabled, false);
  h.$('.ocr-close').click(); await result;
});

test('failed enhancement and failed retry recognition keep checked text and edited candidate', async t => {
  let failImage = true, failOcr = false;
  const h = await harness(t, {texts: ['Checked'], enhanceImage: async () => {
    if (failImage) throw new Error('image failure'); return {blob: {}, width: 100, height: 100};
  }, makeWorker: async () => ({recognize: async () => {
    if (failOcr) throw new Error('OCR failure'); return {data: {text: 'Candidate'}};
  }, terminate: async () => {}})}), {result} = await h.open();
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  assert.match(h.$('.ocr-enhancement-status').textContent, /image failure/);
  assert.equal(h.$('.ocr-text').value, 'Checked');
  failImage = false; h.$('.ocr-enhance-prepare').click(); await tick();
  h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-enhanced-text').value = 'Edited candidate';
  h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  failOcr = true; h.$('.ocr-enhance-recognize').click(); await tick();
  assert.match(h.$('.ocr-enhancement-status').textContent, /OCR failure/);
  assert.equal(h.$('.ocr-enhanced-text').value, 'Edited candidate');
  h.$('.ocr-enhance-discard').click(); assert.equal(h.$('.ocr-use').disabled, false);
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Edited candidate');
  h.$('.ocr-close').click(); await result;
});

test('back during enhanced recognition rejects a late OCR result', async t => {
  const pending = deferred(); let terminated = 0;
  const h = await harness(t, {texts: ['Keep checked'], makeWorker: async () => ({
    recognize: () => pending.promise, terminate: async () => { terminated++; },
  })}), {result} = await h.open();
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-enhance-discard').click(); await tick();
  assert.equal(terminated, 1); assert.equal(h.workerOptions.at(-1).signal.aborted, true);
  pending.resolve({data: {text: 'Late replacement'}}); await tick();
  assert.equal(h.$('.ocr-text').value, 'Keep checked');
  assert.equal(h.$('.ocr-use').disabled, false);
  assert.equal(h.$('.ocr-enhancement-result').hidden, true);
  h.$('.ocr-close').click(); await result;
});

test('enhanced drafts belong to their page and survive returning to that page', async t => {
  const h = await harness(t), {result} = await h.open();
  h.$('.ocr-improve').click(); await tick(); h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-enhanced-text').value = 'Page one draft'; h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-enhance-discard').click(); h.change('.ocr-page-select', '1'); await tick();
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.$('.ocr-enhancement-result').hidden, true, 'page two must not receive page one draft');
  assert.equal(h.$('.ocr-text').value, 'Page two');
  h.$('.ocr-enhance-discard').click(); h.change('.ocr-page-select', '0'); await tick();
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Page one draft');
  assert.equal(h.languages.length, 1, 'reopening preview does not rerun OCR');
  h.$('.ocr-close').click(); await result;
});

test('successful enhanced OCR keeps a manually corrected draft recoverable across page navigation', async t => {
  let attempt = 0;
  const h = await harness(t, {makeWorker: async () => ({recognize: async () => ({data: {text: `OCR attempt ${++attempt}`}}), terminate: async () => {}})});
  const {result} = await h.open(); h.$('.ocr-confirm').click();
  h.$('.ocr-improve').click(); await tick(); h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.$('.ocr-enhance-restore').hidden, true);
  h.$('.ocr-enhanced-text').value = 'Corrected USD 100.00'; h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.$('.ocr-enhanced-text').value, 'OCR attempt 2');
  assert.equal(h.$('.ocr-enhance-restore').hidden, false);
  h.$('.ocr-enhance-discard').click(); h.change('.ocr-page-select', '1'); await tick();
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.$('.ocr-enhance-restore').hidden, true, 'another page cannot restore this page’s draft');
  h.$('.ocr-enhance-discard').click(); h.change('.ocr-page-select', '0'); await tick();
  h.$('.ocr-improve').click(); await tick(); h.$('.ocr-enhance-restore').click();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Corrected USD 100.00');
  assert.equal(h.$('.ocr-enhance-restore').hidden, true, 'one-level restoration consumes the previous draft');
  assert.equal(h.$('.ocr-text').value, 'Page one');
  h.$('.ocr-enhance-discard').click();
  assert.match(h.$('.ocr-page-select').options[0].textContent, /checked/, 'restoring a draft preserves checked page approval');
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Corrected USD 100.00');
  h.$('.ocr-close').click(); await result;
});

test('failed or cancelled enhanced OCR cannot replace the previous draft backup', async t => {
  let attempt = 0, mode = 'success'; const pending = deferred();
  const h = await harness(t, {texts: ['Checked'], makeWorker: async () => ({recognize: async () => {
    if (mode === 'failure') throw new Error('model failed');
    if (mode === 'pending') return pending.promise;
    return {data: {text: `Draft ${++attempt}`}};
  }, terminate: async () => {}})});
  const {result} = await h.open(); h.$('.ocr-confirm').click();
  h.$('.ocr-improve').click(); await tick();
  h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-enhanced-text').value = 'Edited first draft'; h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-enhanced-text').value = 'Edited second draft'; h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  mode = 'failure'; h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Edited second draft');
  mode = 'pending'; h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.$('.ocr-enhance-restore').disabled, true);
  h.$('.ocr-enhance-stop').click(); await tick();
  pending.resolve({data: {text: 'Late cancelled draft'}}); await tick();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Edited second draft');
  h.$('.ocr-enhance-restore').click();
  assert.equal(h.$('.ocr-enhanced-text').value, 'Edited first draft', 'failure and Stop leave the prior successful backup intact');
  h.$('.ocr-enhance-discard').click(); assert.equal(h.$('.ocr-use').disabled, false);
  h.$('.ocr-close').click(); await result;
});

test('applying an enhanced draft clears its backup and still requires fresh approval', async t => {
  const h = await harness(t, {texts: ['Checked']}), {result} = await h.open();
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-enhanced-text').value = 'Saved prior draft'; h.$('.ocr-enhanced-text').dispatchEvent(new h.dom.window.Event('input'));
  h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.$('.ocr-enhance-restore').hidden, false);
  h.$('.ocr-enhance-apply').click(); assert.equal(h.$('.ocr-use').disabled, true);
  h.$('.ocr-improve').click(); await tick();
  assert.equal(h.$('.ocr-enhancement-result').hidden, true);
  assert.equal(h.$('.ocr-enhance-restore').hidden, true);
  h.$('.ocr-enhance-recognize').click(); await tick();
  assert.equal(h.$('.ocr-enhance-restore').hidden, true, 'new cycle must not recover a stale pre-application candidate');
  h.$('.ocr-close').click(); await result;
});

test('Escape returns from image preview before closing document review', async t => {
  const h = await harness(t, {texts: ['Checked']}), {result} = await h.open();
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  h.$('dialog').dispatchEvent(new h.dom.window.Event('cancel', {cancelable: true}));
  assert.ok(h.$('dialog')); assert.equal(h.$('.ocr-enhancement-preview').hidden, true);
  assert.equal(h.$('.ocr-use').disabled, false);
  assert.equal(h.dom.window.document.activeElement, h.$('.ocr-improve'));
  h.$('dialog').dispatchEvent(new h.dom.window.Event('cancel', {cancelable: true}));
  assert.equal(await result, null); assert.equal(h.$('dialog'), null);
});

test('closing while enhanced OCR initializes terminates the late worker without recognition', async t => {
  const pending = deferred(); let recognized = 0, terminated = 0;
  const h = await harness(t, {makeWorker: () => pending.promise}), {result} = await h.open();
  h.$('.ocr-improve').click(); await tick(); h.$('.ocr-enhance-recognize').click(); await tick();
  h.$('.ocr-close').click(); assert.equal(await result, null);
  pending.resolve({recognize: async () => { recognized++; }, terminate: async () => { terminated++; }}); await tick();
  assert.equal(recognized, 0); assert.equal(terminated, 1);
});

test('an undecodable processed preview cannot be sent to OCR', async t => {
  const h = await harness(t, {texts: ['Checked']}), {result} = await h.open();
  h.dom.window.HTMLImageElement.prototype.decode = async function() { throw new Error('preview decode failed'); };
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  assert.match(h.$('.ocr-enhancement-status').textContent, /preview decode failed/);
  assert.equal(h.$('.ocr-enhance-recognize').disabled, true);
  assert.equal(h.$('.ocr-enhance-prepare').disabled, false);
  assert.equal(h.languages.length, 0);
  h.$('.ocr-enhance-discard').click(); assert.equal(h.$('.ocr-use').disabled, false);
  h.$('.ocr-close').click(); await result;
});

test('Stop while processed image decodes cannot enable recognition from a stale preview', async t => {
  const pending = deferred();
  const h = await harness(t, {texts: ['Checked']}), {result} = await h.open();
  h.dom.window.HTMLImageElement.prototype.decode = () => pending.promise;
  h.$('.ocr-confirm').click(); h.$('.ocr-improve').click(); await tick();
  h.$('.ocr-enhance-stop').click(); await tick();
  assert.equal(h.$('.ocr-enhance-recognize').disabled, true);
  assert.equal(h.$('.ocr-enhance-prepare').disabled, false);
  pending.resolve(); await tick();
  assert.equal(h.$('.ocr-enhance-recognize').disabled, true);
  h.$('.ocr-enhance-discard').click(); assert.equal(h.$('.ocr-use').disabled, false);
  h.$('.ocr-close').click(); await result;
});


const mappedData = {text:'Left column\nRight column\n', blocks:[{paragraphs:[{lines:[
  {text:'Left column\n',bbox:{x0:100,y0:100,x1:400,y1:130}},
  {text:'Right column\n',bbox:{x0:550,y0:100,x1:900,y1:130}},
]}]}]};
test('position-linked fragments retain columns, edits and approvals through page navigation and reopen', async t => {
 const h=await harness(t,{texts:['','Second page'],makeWorker:async()=>({recognize:async()=>({data:mappedData}),terminate:async()=>{}})});
 const {result}=await h.open(); h.$('.ocr-recognize').click(); await tick();
 assert.equal(h.$('.ocr-fragment-select').options.length,2);
 assert.equal(h.$('.ocr-plain-text').open,false);
 h.$('.ocr-confirm').click();
 h.change('.ocr-fragment-select','1');
 h.$('.ocr-fragment-text').value='Corrected right column'; h.$('.ocr-fragment-text').dispatchEvent(new h.dom.window.Event('input'));
 assert.equal(h.$('.ocr-text').value,'Left column\nCorrected right column');
 assert.equal(h.$('.ocr-use').disabled,true);
 h.$('.ocr-confirm').click(); h.change('.ocr-page-select','1'); await tick(); h.$('.ocr-confirm').click();
 h.change('.ocr-page-select','0'); await tick();
 assert.equal(h.$('.ocr-fragment-select').options.length,2);
 h.$('.ocr-use').click(); const saved=await result;
 assert.equal(saved.pages[0].regions[1].x,0.55);
 assert.equal(saved.pages[0].regions[1].text,'Corrected right column');
 assert.equal(saved.pages[0].regions[1].edited,true);
 assert.equal(saved.pages[0].regions[0].edited,undefined);
 const reopened=await h.open({restoredPages:saved.pages,initialPage:0});
 assert.equal(h.$('.ocr-fragment-select').options.length,2); assert.equal(h.$('.ocr-use').disabled,false);
 h.$('.ocr-fragment-text').value='Cancelled edit';h.$('.ocr-fragment-text').dispatchEvent(new h.dom.window.Event('input'));h.$('.ocr-close').click();
 assert.equal(await reopened.result,null);assert.equal(saved.pages[0].regions[0].text,'Left column');
});
test('unmapped OCR content is never discarded and whole-text editing removes stale coordinates', async t => {
 let data=mappedData;
 const h=await harness(t,{texts:[''],makeWorker:async()=>({recognize:async()=>({data}),terminate:async()=>{}})}),{result}=await h.open();
 h.$('.ocr-recognize').click();await tick();assert.equal(h.$('.ocr-fragment-select').options.length,2);
 h.$('.ocr-text').value='Freely reorganized text';h.$('.ocr-text').dispatchEvent(new h.dom.window.Event('input'));
 assert.equal(h.$('.ocr-fragment-select').options.length,0);assert.equal(h.$('.ocr-plain-text').open,true);
 data={...mappedData,text:mappedData.text+'UNLOCATED IMPORTANT CONTENT'};h.$('.ocr-recognize').click();await tick();
 assert.equal(h.$('.ocr-text').value,data.text);assert.equal(h.$('.ocr-fragment-select').options.length,0);
 h.$('.ocr-close').click();await result;
});
test('a separately recognized field can be attached to its page position', async t=>{
 const h=await harness(t,{texts:['']}),{result}=await h.open();
 h.change('[data-coordinate="width"]','30');h.change('[data-coordinate="height"]','10');
 h.$('.ocr-recognize-area').click();await tick();h.$('.ocr-attach-area').click();
 assert.equal(h.$('.ocr-text').value,'Recognized Russian Я');assert.equal(h.$('.ocr-fragment-select').options.length,1);
 h.$('.ocr-confirm').click();h.$('.ocr-use').click();const saved=await result;
 assert.equal(saved.pages[0].regions[0].width,0.3);assert.equal(saved.pages[0].regions[0].height,0.1);
 assert.equal(saved.pages[0].regions[0].edited,true);
});

test('editing a fragment immediately redraws its visible correction and can restore the original appearance', async t=>{
 const h=await harness(t,{texts:[''],makeWorker:async()=>({recognize:async()=>({data:mappedData}),terminate:async()=>{}})}),{result}=await h.open();
 const image=h.$('.ocr-image-stage img'), stage=h.$('.ocr-image-stage');
 Object.defineProperty(image,'naturalWidth',{value:1000});Object.defineProperty(image,'naturalHeight',{value:1500});
 image.getBoundingClientRect=()=>({left:20,top:30,width:500,height:750});stage.getBoundingClientRect=()=>({left:10,top:20,width:500,height:750});
 h.$('.ocr-recognize').click();await tick();
 assert.equal(h.$('.ocr-visible-correction').checked,false);
 h.$('.ocr-fragment-text').value='Исправлено вручную';h.$('.ocr-fragment-text').dispatchEvent(new h.dom.window.Event('input'));
 assert.equal(h.$('.ocr-visible-correction').checked,true);
 assert.equal(h.$('.ocr-correction-layer').textContent,'Исправлено вручную');
 assert.equal(h.$('.ocr-correction-layer').style.left,'10px');assert.equal(h.$('.ocr-correction-layer').style.top,'10px');
 assert.deepEqual([h.correctionRenders.at(-1).width,h.correctionRenders.at(-1).height],[500,750]);
 h.$('.ocr-confirm').click();assert.equal(h.$('.ocr-use').disabled,false);
 h.$('.ocr-visible-correction').click();assert.equal(h.$('.ocr-use').disabled,true);
 assert.equal(h.$('.ocr-correction-layer').textContent,'');assert.equal(h.$('.ocr-fragment-text').value,'Исправлено вручную');
 h.$('.ocr-confirm').click();h.$('.ocr-use').click();const saved=await result;
 assert.equal(saved.pages[0].regions[0].edited,undefined);assert.match(saved.text,/Исправлено вручную/);
 const reopened=await h.open({restoredPages:saved.pages});
 assert.equal(h.$('.ocr-visible-correction').checked,false);
 h.$('.ocr-visible-correction').click();assert.equal(h.$('.ocr-visible-correction').checked,true);
 h.$('.ocr-confirm').click();h.$('.ocr-use').click();assert.equal((await reopened.result).pages[0].regions[0].edited,true);
});

test('invalid fragment text restores both text and the original visible-correction flag', async t=>{
 const h=await harness(t,{texts:[''],makeWorker:async()=>({recognize:async()=>({data:mappedData}),terminate:async()=>{}})}),{result}=await h.open();
 h.$('.ocr-recognize').click();await tick();
 h.$('.ocr-fragment-text').value='bad\0text';h.$('.ocr-fragment-text').dispatchEvent(new h.dom.window.Event('input'));
 assert.equal(h.$('.ocr-fragment-text').value,'Left column');assert.equal(h.$('.ocr-visible-correction').checked,false);
 h.$('.ocr-confirm').click();h.$('.ocr-use').click();assert.equal((await result).pages[0].regions[0].edited,undefined);
});

test('partial area cannot erase the rest of a position-linked line', async t=>{
 const h=await harness(t,{texts:[''],makeWorker:async()=>({recognize:async()=>({data:mappedData}),terminate:async()=>{}})}),{result}=await h.open();
 h.$('.ocr-recognize').click();await tick();h.$('.ocr-confirm').click();
 h.change('[data-coordinate="width"]','10');h.change('[data-coordinate="height"]','1');h.change('[data-coordinate="x"]','20');h.change('[data-coordinate="y"]','7');
 h.$('.ocr-recognize-area').click();await tick();h.$('.ocr-region-text').value='one word';h.$('.ocr-region-text').dispatchEvent(new h.dom.window.Event('input'));
 h.$('.ocr-attach-area').click();
 assert.equal(h.$('.ocr-text').value,'Left column\nRight column');assert.match(h.$('.ocr-status').textContent,/only part/);assert.equal(h.$('.ocr-use').disabled,false);
 h.$('.ocr-close').click();await result;
});
