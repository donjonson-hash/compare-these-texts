// Exercises real Home markup and navigation at the existing comparison-command
// boundary. Worker parsing, editor undo and export bytes are covered by the
// engine suites and check_compact_browser.mjs, not reimplemented here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {Script} from 'node:vm';
import {compareText} from '../src/text-engine.mjs';
import {writeDocxVisual} from '../src/docx-visual.mjs';
import {readTextSource} from '../src/text-source.mjs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

function page(t, beforeNavigation = () => {}, url = 'https://example.invalid/') {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8'), {
    url, runScripts:'outside-only', virtualConsole:console,
  });
  const {window} = dom, document = window.document, $ = id => document.getElementById(id);
  window.File = File;
  window.confirm = () => true;
  window.Element.prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const commands = [];
  document.addEventListener('ctt:new-comparison', event => commands.push(event.detail));
  window.eval(readFileSync(new URL('../src/file-limits.js', import.meta.url), 'utf8'));
  beforeNavigation({window, document, $});
  const navigation = new URL('../src/navigation.js', import.meta.url);
  const script = new Script(readFileSync(navigation, 'utf8'), {
    importModuleDynamically: path => import(new URL(path, navigation)),
  });
  script.runInContext(dom.getInternalVMContext());
  t.after(() => { window.dispatchEvent(new window.Event('pagehide')); dom.window.close(); assert.deepEqual(errors, []); });
  function paste(side, value) {
    const field = $('home-' + side + '-text');
    field.value = value; field.dispatchEvent(new window.Event('input', {bubbles:true}));
  }
  function upload(side, file) {
    const input = $('home-' + side + '-file');
    Object.defineProperty(input, 'files', {configurable:true, value:[file]});
    input.dispatchEvent(new window.Event('change', {bubbles:true}));
  }
  return {window, document, $, commands, paste, upload};
}

test('fresh Home compares exact pasted text once, then returns without losing either input', async t => {
  const p = page(t);
  assert.equal(p.$('start-menu').hidden, false);
  assert.equal(p.$('home-left-text').hidden, false);
  assert.equal(p.$('home-right-text').hidden, false);
  assert.equal(p.$('start-new-compare').disabled, true);
  const a = 'Привет 🌍\n<script>window.pwned = true</script>\n  spaces  ';
  const b = 'Привет 🌍\n<script>window.pwned = false</script>\n  spaces  ';
  p.paste('left', a);
  assert.equal(p.$('start-new-compare').disabled, true, 'one source cannot accidentally reuse an old opposite side');
  p.paste('right', b);
  p.$('start-new-compare').click();
  p.$('start-new-compare').click();
  assert.equal(p.commands.length, 1, 'a double click sends only one comparison');
  assert.equal(p.$('home-left-text').disabled, true);
  assert.equal(p.$('home-right-file').disabled, true);
  assert.equal(p.$('header-edit').disabled, true);
  assert.equal(await p.commands[0].files.left.text(), a);
  assert.equal(await p.commands[0].files.right.text(), b);
  assert.equal(p.commands[0].files.left.name, 'original-text.txt');
  assert.equal(p.window.pwned, undefined, 'markup remains file data');
  p.$('results').hidden = false;
  p.commands[0].complete({ok:true});
  await nextTurn();
  assert.equal(p.$('start-menu').hidden, true);
  assert.equal(p.$('home-left-text').disabled, false);
  p.$('workspace-home').click();
  assert.equal(p.$('start-menu').hidden, false);
  assert.equal(p.$('home-left-text').value, a);
  assert.equal(p.$('home-right-text').value, b);
  assert.equal(p.$('start-compare').hidden, false);
  p.$('start-compare').click();
  assert.equal(p.$('start-menu').hidden, true);
  assert.equal(p.commands.length, 1, 'Continue resumes instead of replacing the comparison');
});

test('uploaded file has explicit precedence; switching back restores the previous pasted text', async t => {
  const p = page(t), file = new File(['uploaded bytes\n'], 'uploaded.txt', {type:'text/plain'});
  p.paste('left', 'saved pasted A'); p.paste('right', 'pasted B');
  p.upload('left', file);
  assert.equal(p.$('home-left-text').hidden, true);
  assert.equal(p.$('home-left-file-card').hidden, false);
  p.$('start-new-compare').click();
  assert.equal(p.commands[0].files.left, file);
  assert.equal(await p.commands[0].files.right.text(), 'pasted B');
  p.commands[0].complete({ok:false}); await nextTurn();
  p.$('home-left-paste').click();
  assert.equal(p.$('home-left-text').value, 'saved pasted A');
  assert.equal(p.$('home-left-text').hidden, false);
  p.$('start-new-compare').click();
  assert.equal(await p.commands[1].files.left.text(), 'saved pasted A');
  p.commands[1].complete({ok:false}); await nextTurn();
  p.upload('left', file); p.$('home-swap').click();
  p.$('start-new-compare').click();
  assert.equal(p.commands[2].files.right, file, 'swap moves the actual file source, not merely its label');
  assert.equal(await p.commands[2].files.left.text(), 'pasted B');
  p.commands[2].complete({ok:false}); await nextTurn();
  p.$('home-right-paste').click();
  assert.equal(p.$('home-right-text').value, 'saved pasted A', 'the alternate text travels with its source');
});

test('file rejection, failed preparation and cancellation keep current editor objects and staged inputs', async t => {
  const p = page(t);
  const editor = p.document.createElement('section'), undo = p.document.createElement('button');
  editor.textContent = 'Existing edited document'; undo.textContent = 'Undo existing edit';
  editor.append(undo); p.$('single-editor-host').append(editor);
  let undos = 0; undo.addEventListener('click', () => undos++);
  const valid = new File(['reference'], 'a.txt');
  p.upload('left', valid); p.paste('right', 'new B');
  p.upload('left', new File(['legacy'], 'old.doc'));
  assert.match(p.$('home-notice').textContent, /\.doc.*not supported/);
  assert.equal(p.$('home-left-name').textContent, 'a.txt', 'a rejected file must not replace the previously staged valid source');
  p.upload('left', {name:'large.txt', size:25 * 1024 * 1024 + 1});
  assert.match(p.$('home-notice').textContent, /up to 25 MB/);
  p.$('start-new-compare').click();
  assert.equal(p.commands[0].files.left, valid);
  p.commands[0].complete({ok:false, message:'Invalid document archive'}); await nextTurn();
  assert.equal(p.$('start-menu').hidden, false);
  assert.match(p.$('home-notice').textContent, /Invalid document archive/);
  assert.equal(p.$('start-new-compare').disabled, false);
  p.$('start-new-compare').click(); p.commands[1].complete({ok:false}); await nextTurn();
  assert.equal(p.$('start-menu').hidden, false);
  assert.equal(p.$('single-editor-host').firstChild, editor, 'navigation does not remount the live editor');
  undo.click(); assert.equal(undos, 1, 'existing editor handlers survive failure and cancellation');
  assert.equal(p.$('home-right-text').value, 'new B');
  p.$('header-edit').click(); assert.equal(p.$('start-menu').hidden, true);
  p.$('workspace-home').click(); assert.equal(p.$('start-edit').hidden, false);
  assert.equal(p.$('home-right-text').value, 'new B');
});

test('saved result and full document demo leave Home, while Help alone preserves staged work', async t => {
  const p = page(t);
  p.paste('left', 'unsent text');
  p.$('notice').textContent = 'Your saved comparison is available. Choose Continue.';
  p.$('notice').hidden = false;
  await nextTurn();
  assert.equal(p.$('home-notice').hidden, false);
  assert.match(p.$('home-notice').textContent, /saved comparison.*Continue/, 'welcome guard remains readable before a comparison is open');
  p.$('home-help-open').click(); assert.equal(p.$('home-help').open, true);
  p.$('home-help-close').click(); assert.equal(p.$('home-help').open, false);
  assert.equal(p.$('home-left-text').value, 'unsent text');
  p.$('results').hidden = false; await nextTurn();
  assert.equal(p.$('start-menu').hidden, false, 'painting a result alone must not replace staged Home inputs');
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-operation-started'));
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-resumed'));
  assert.equal(p.$('start-menu').hidden, true, 'explicitly resuming a saved result reveals its editor');
  p.$('workspace-home').click();
  assert.equal(p.$('start-menu').hidden, false);
  p.$('home-help-open').click(); p.$('demo').click();
  assert.equal(p.$('home-help').open, false);
  assert.equal(p.$('start-menu').hidden, true);
  assert.equal(p.$('home-left-text').value, 'unsent text');
});


test('Help examples require confirmation before replacing an open comparison', async t => {
  for (const id of ['demo', 'demo-tables']) {
    await t.test(id, async t => {
      let launches = 0;
      // app.js installs its bubbling demo listener before navigation.js. The
      // later capture guard must stop that earlier listener on cancellation.
      const p = page(t, ({$}) => {
        $(id).addEventListener('click', () => {
          launches++;
          $('visual-review').textContent = 'Replacement demo';
        });
      });
      const originalEditor = p.document.createElement('section');
      originalEditor.textContent = 'Edited comparison with unsaved changes';
      p.$('visual-review').append(originalEditor);
      p.$('results').hidden = false;
      await nextTurn();
      p.$('workspace-home').click();
      p.paste('left', 'staged A'); p.paste('right', 'staged B');
      p.$('home-help-open').click();
      let prompts = 0;
      p.window.confirm = () => { prompts++; return false; };
      p.$(id).click();
      assert.equal(prompts, 1);
      assert.equal(launches, 0, 'Cancel blocks the existing engine listener');
      assert.equal(p.$('visual-review').firstChild, originalEditor);
      assert.equal(p.$('results').hidden, false);
      assert.equal(p.$('start-menu').hidden, false, 'Cancel stays in the current Home screen');
      assert.equal(p.$('home-help').open, true);
      assert.equal(p.$('home-left-text').value, 'staged A');
      p.window.confirm = () => { prompts++; return true; };
      p.$(id).click();
      assert.equal(prompts, 2);
      assert.equal(launches, 1, 'Accept calls the existing engine exactly once');
      assert.equal(p.$('home-help').open, false);
      assert.equal(p.$('start-menu').hidden, true);
      assert.equal(p.$('home-right-text').value, 'staged B');

      p.$('workspace-home').click();
      p.$('start-new-compare').click();
      assert.equal(p.commands.length, 1);
      p.$(id).dispatchEvent(new p.window.MouseEvent('click', {bubbles:true, cancelable:true}));
      assert.equal(launches, 1, 'A pending comparison cannot be replaced by a demo');
      assert.equal(prompts, 2, 'Pending operations do not offer an inapplicable replacement');
      p.commands[0].complete({ok:false});
      await nextTurn();
    });
  }
});

test('returning through the back-forward cache retains Home result and notice observers', async t => {
  const p = page(t);
  p.window.dispatchEvent(new p.window.PageTransitionEvent('pagehide', {persisted:true}));
  p.window.dispatchEvent(new p.window.PageTransitionEvent('pageshow', {persisted:true}));
  p.$('results').hidden = false;
  p.$('notice').textContent = 'Download your work before closing.';
  p.$('notice').hidden = false;
  await nextTurn();
  assert.equal(p.$('start-compare').hidden, false, 'Continue tracks the live comparison after Back');
  assert.equal(p.$('start-menu').hidden, false, 'an observer update does not navigate away from Home');
  assert.equal(p.$('home-notice').textContent, 'Download your work before closing.');
});


test('a saved comparison completing after new Home input or navigation does not reopen old work', async t => {
  const p = page(t);
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-operation-started'));
  p.paste('left', 'New A'); p.paste('right', 'New B');
  p.$('results').hidden = false;
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-resumed'));
  await nextTurn();
  assert.equal(p.$('start-menu').hidden, false);
  assert.equal(p.$('home-left-text').value, 'New A');
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-operation-started'));
  p.$('header-edit').click(); p.$('workspace-home').click();
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-resumed'));
  assert.equal(p.$('start-menu').hidden, false, 'Home stays open after an intervening mode switch');
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-operation-started'));
  p.document.dispatchEvent(new p.window.Event('ctt:comparison-resumed'));
  assert.equal(p.$('start-menu').hidden, true, 'a resume without intervening input still opens the comparison');
});

test('the Word guide opens its editable sample once and exports the negotiated terms', async t => {
  const guide = new JSDOM(readFileSync(new URL('../src/compare-word-documents/index.html', import.meta.url), 'utf8'), {
    url: 'https://example.invalid/compare-word-documents/',
  });
  const href = guide.window.document.querySelector('a[href="/?demo=contract"]').href;
  guide.window.close();
  let resolve;
  const opened = new Promise(done => { resolve = done; });
  const p = page(t, ({document}) => document.addEventListener('ctt:new-comparison', e => resolve(e.detail)), href);
  const {files, example, complete} = await opened;
  assert.equal(example, 'contract');
  const sources = {};
  for (const [side, file] of Object.entries(files)) sources[side] = {name: file.name, data: Buffer.from(await file.arrayBuffer()).toString('base64')};
  const report = await compareText(sources);
  assert.equal(report.changed.length, 3);
  assert.equal(report.only_left.length + report.only_right.length, 0);
  assert.ok(report.changed.some(({left, right}) => left.text.includes('12,000') && right.text.includes('13,200')));
  assert.ok(report.changed.some(({left, right}) => left.text.includes('included') && !right.text.includes('included')));
  const payment = report.changed.find(({left, right}) => left.text.includes('30 days') && right.text.includes('14 days'));
  assert.ok(payment, 'payment terms must be independently reviewable');
  const agreed = payment.right.text.replace('14 days', '21 days');
  const bytes = await writeDocxVisual(sources.right, [{record: payment.right.record, text: agreed}]);
  const exported = await readTextSource({name: 'agreed.docx', data: Buffer.from(bytes).toString('base64')});
  assert.ok(exported.blocks.some(p => p.text === agreed));
  complete({ok:true}); await nextTurn();
  assert.ok(p.$('start-menu').hidden);
  assert.equal(p.window.location.search, '');
  assert.equal(page(t, undefined, p.window.location.href).commands.length, 0, 'refresh must not launch another demo');
});

test('one uploaded workbook offers distinct populated sheets and keeps pasted sources available', async t => {
  const {createInventoryExample} = await import('../src/workbook-example.mjs');
  const {handleRequest} = await import('../src/worker.mjs');
  const {file} = createInventoryExample();
  const p = page(t, ({window}) => { window.KristinaTransport = {request: handleRequest}; }, 'https://example.invalid/?excel=sheets');
  assert.ok(p.$('home-workbook').open);
  p.upload('left', file);
  assert.equal(p.$('start-new-compare').disabled, false);
  const available = new Promise(resolve => {
    const observer = new p.window.MutationObserver(() => {
      if (!p.$('workbook-choices').hidden) { observer.disconnect(); resolve(); }
    });
    observer.observe(p.$('workbook-choices'), {attributes:true});
  });
  p.$('start-new-compare').click();
  await available;
  assert.deepEqual(Array.from(p.$('workbook-left').options, option => option.value), ['October', 'November']);
  p.$('workbook-left').value = 'November';
  p.$('workbook-left').dispatchEvent(new p.window.Event('change'));
  assert.equal(p.$('workbook-right').value, 'October');
  p.$('workbook-compare').click();
  const command = p.commands[0];
  assert.equal(command.files.left, command.files.right);
  assert.equal(command.files.right, file);
  assert.equal(command.sheets.left, 'November');
  assert.equal(command.sheets.right, 'October');
  command.complete({ok:true}); await nextTurn();
  p.$('workspace-home').click();
  assert.equal(p.$('home-left-name').textContent, file.name);
  assert.equal(p.$('home-right-text').value, '');
});

test('inventory example uses the real selected worksheets and exports an independently edited sheet', async t => {
  const {handleRequest} = await import('../src/worker.mjs');
  const {openSheetDocument} = await import('../src/sheet-document.mjs');
  const {read} = await import('../src/xlsx-vendor.mjs');
  let capture;
  const opened = new Promise(resolve => { capture = resolve; });
  const p = page(t, ({document}) => document.addEventListener('ctt:new-comparison', e => capture(e.detail)), 'https://example.invalid/?excel=example');
  const {files, example, sheets, complete} = await opened;
  assert.equal(example, 'workbook');
  const data = Buffer.from(await files.left.arrayBuffer()).toString('base64');
  const left = {name:files.left.name, data, sheet:sheets.left};
  const right = {...left, sheet:sheets.right};
  const metadata = await handleRequest('/api/prepare', {left, right, delimiter:'auto'});
  assert.equal(metadata.ready, true);
  const {report} = await handleRequest('/api/compare', {left, right, ...metadata.rules, delimiter:metadata.delimiter});
  assert.equal(report.changed.length, 2);
  assert.equal(report.only_left.length, 1);
  assert.equal(report.only_right.length, 1);
  const lamp = report.changed.find(row => row.key === 'LAMP-01');
  assert.equal(lamp.right.values.Quantity, '10');
  const edited = await openSheetDocument(right, metadata.right);
  edited.edit(lamp.right.cells.Quantity, '11', 'number');
  const exported = read(edited.export(), {type:'array'});
  assert.equal(exported.Sheets.November[lamp.right.cells.Quantity].v, 11);
  assert.equal(exported.Sheets.October[lamp.left.cells.Quantity].v, 12);
  complete({ok:true}); await nextTurn();
  assert.ok(p.$('start-menu').hidden);
  assert.equal(p.window.location.search, '');
});
