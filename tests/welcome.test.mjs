import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {launchWelcomeExample} from '../extension-package/welcome-entry.mjs';

test('Chrome and Firefox installation opens local help; updates leave tabs alone', () => {
  for (const namespace of ['chrome', 'browser']) {
    let installed;
    const opened = [];
    const api = {
      runtime: {getURL: file => `extension://example/${file}`, onInstalled: {addListener: callback => { installed = callback; }}},
      tabs: {create: options => opened.push(options.url)}
    };
    vm.runInNewContext(readFileSync(new URL('../extension-package/background.js', import.meta.url), 'utf8'), {[namespace]: api});
    for (const reason of ['update', 'chrome_update', 'shared_module_update']) installed({reason});
    assert.deepEqual(opened, []);
    installed({reason: 'install'});
    assert.deepEqual(opened, ['extension://example/welcome.html']);
  }
});

function page(t, query = '?welcome-example=1') {
  const dom = new JSDOM('<button id="header-edit">Edit &amp; export</button><button id="demo">Try document editing</button><p id="notice" hidden></p>', {url: 'https://extension.invalid/index.html' + query});
  t.after(() => dom.window.close());
  let launched = 0;
  dom.window.document.getElementById('demo').addEventListener('click', () => { launched++; });
  return {dom, launched: () => launched, input: {document: dom.window.document, location: dom.window.location, history: dom.window.history}};
}

test('a fresh example launches once and consumes its URL flag before a reload', async t => {
  const p = page(t);
  await launchWelcomeExample({...p.input, readSavedComparison: async () => false});
  assert.equal(p.launched(), 1);
  assert.equal(p.dom.window.location.search, '');
  await launchWelcomeExample({...p.input, readSavedComparison: async () => { throw new Error('A plain editor load must not inspect saved work'); }});
  assert.equal(p.launched(), 1);
});

test('a saved comparison prevents the onboarding example from replacing it', async t => {
  const p = page(t);
  await launchWelcomeExample({...p.input, readSavedComparison: async () => true});
  assert.equal(p.launched(), 0);
  assert.equal(p.dom.window.location.search, '');
  assert.equal(p.dom.window.document.getElementById('notice').hidden, false);
  assert.match(p.dom.window.document.getElementById('notice').textContent, /Choose Continue/);
});

test('unavailable saved-work storage does not silently launch a replacement example', async t => {
  const p = page(t);
  await launchWelcomeExample({...p.input, readSavedComparison: async () => { throw new Error('Storage unavailable'); }});
  assert.equal(p.launched(), 0);
  assert.match(p.dom.window.document.getElementById('notice').textContent, /could not be checked/);
});

test('direct editing opens only the existing editor once without reading saved comparison', async t => {
  const p = page(t, '?welcome-mode=edit&keep=value#details');
  let opened = 0;
  p.dom.window.document.getElementById('header-edit').addEventListener('click', () => { opened++; });
  const readSavedComparison = async () => assert.fail('Opening an editor must not read or replace saved comparisons');
  await launchWelcomeExample({...p.input, readSavedComparison});
  assert.equal(opened, 1);
  assert.equal(p.launched(), 0);
  assert.equal(p.dom.window.location.search, '?keep=value');
  assert.equal(p.dom.window.location.hash, '#details');
  await launchWelcomeExample({...p.input, readSavedComparison});
  assert.equal(opened, 1, 'consumed URL does not reopen editing on reload');
});

test('direct editing takes precedence over an example and consumes both requests', async t => {
  const p = page(t, '?welcome-example=1&welcome-mode=edit');
  let opened = 0;
  p.dom.window.document.getElementById('header-edit').addEventListener('click', () => { opened++; });
  await launchWelcomeExample({...p.input, readSavedComparison: async () => assert.fail('Edit launch must not start an example check')});
  assert.equal(opened, 1);
  assert.equal(p.launched(), 0);
  assert.equal(p.dom.window.location.search, '');
});
