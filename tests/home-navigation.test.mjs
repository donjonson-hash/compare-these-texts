// Exercises real Home markup and navigation at the existing comparison-command
// boundary. Worker parsing, editor undo and export bytes are covered by the
// engine suites and check_compact_browser.mjs, not reimplemented here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

function page(t) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8'), {
    url:'https://example.invalid/', runScripts:'outside-only', virtualConsole:console,
  });
  const {window} = dom, document = window.document, $ = id => document.getElementById(id);
  window.File = File;
  window.confirm = () => true;
  window.Element.prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const commands = [];
  document.addEventListener('ctt:new-comparison', event => commands.push(event.detail));
  window.eval(readFileSync(new URL('../src/navigation.js', import.meta.url), 'utf8'));
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
  p.upload('left', {name:'large.txt', size:2 * 1024 * 1024 + 1});
  assert.match(p.$('home-notice').textContent, /up to 2 MB/);
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
  assert.equal(p.$('start-menu').hidden, true, 'resuming a saved result reveals its editor');
  p.$('workspace-home').click();
  assert.equal(p.$('start-menu').hidden, false);
  p.$('home-help-open').click(); p.$('demo').click();
  assert.equal(p.$('home-help').open, false);
  assert.equal(p.$('start-menu').hidden, true);
  assert.equal(p.$('home-left-text').value, 'unsent text');
});
