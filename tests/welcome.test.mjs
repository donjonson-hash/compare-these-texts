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

function page(t) {
  const dom = new JSDOM('<button id="demo">Try document editing</button><p id="notice" hidden></p>', {url: 'https://extension.invalid/index.html?welcome-example=1'});
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
