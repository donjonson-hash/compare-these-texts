import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {recordProductEvent} from '../src/product-events.mjs';

function setup(t, url = 'https://comparetwotexts.pro/extension/?private=secret#private') {
  // Exercise the exact inline bootstrap and CSP hash shipped by the build.
  const dom = new JSDOM(readFileSync(new URL('../dist/extension/index.html', import.meta.url), 'utf8'), {
    url, runScripts: 'outside-only',
  });
  const {window} = dom;
  const bootstrap = [...window.document.scripts].find(s => !s.src && s.textContent.includes('cttProductEvent'));
  assert.ok(bootstrap);
  window.eval(bootstrap.textContent);
  t.after(() => dom.window.close());
  return {window, events: () => JSON.parse(JSON.stringify(Array.from(window.dataLayer).filter(x => x[0] === 'event').map(x => [...x])))};
}

test('analytics accepts only defined actions and fixed dimensions, never document fields', t => {
  const {window, events} = setup(t);
  window.cttProductEvent('document_download', {file_format:'pdf', workspace:'editor', file_name:'private.pdf', text:'secret'});
  window.cttProductEvent('comparison_complete', {comparison_type:'table', report:{text:'secret'}});
  window.cttProductEvent('document_download', {file_format:'private.docx', workspace:'editor'});
  window.cttProductEvent('comparison_complete', {comparison_type:'secret'});
  window.cttProductEvent('unknown', {text:'secret'});
  assert.deepEqual(events(), [
    ['event','document_download',{send_to:'G-J33QPHR8L3',file_format:'pdf',workspace:'editor'}],
    ['event','comparison_complete',{send_to:'G-J33QPHR8L3',comparison_type:'table'}],
  ]);
  const config = window.dataLayer.find(x => x[0] === 'config')[2];
  assert.equal(config.page_location,'https://comparetwotexts.pro/extension/');
  assert.equal(JSON.stringify(events()).includes('secret'),false);
});

test('campaign attribution preserves launch labels but removes unrelated query and fragment', t => {
  const {window} = setup(t, 'https://comparetwotexts.pro/?document=private.docx&utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10&utm_content=description&email=private%40example.com#secret');
  const config = window.dataLayer.find(x => x[0] === 'config')[2];
  assert.equal(config.page_location, 'https://comparetwotexts.pro/?utm_source=youtube&utm_medium=video&utm_campaign=launch_2026_10&utm_content=description');
  window.cttProductEvent('document_download', {file_format:'pdf', workspace:'editor'});
  assert.equal(JSON.stringify(window.dataLayer).includes('private'), false);
  assert.equal(window.dataLayer.filter(x => x[0] === 'config').length, 1);
});

test('ambiguous, empty, oversized and free-text campaign values are excluded', t => {
  const {window} = setup(t, 'https://comparetwotexts.pro/?utm_source=youtube&utm_source=telegram&utm_medium=&utm_campaign=' + 'a'.repeat(65) + '&utm_content=private%40example.com&utm_term=private-text#gclid');
  const config = window.dataLayer.find(x => x[0] === 'config')[2];
  assert.equal(config.page_location, 'https://comparetwotexts.pro/');
});

test('internal visits do not inherit or fabricate campaign labels', t => {
  const {window} = setup(t, 'https://comparetwotexts.pro/extension/');
  const config = window.dataLayer.find(x => x[0] === 'config')[2];
  assert.equal(config.page_location, 'https://comparetwotexts.pro/extension/');
});

test('store event counts the actual store link, not the extension information page', t => {
  const {window, events} = setup(t), doc = window.document;
  const sendClick = link => {
    const child=doc.createElement('span'); link.append(child);
    // Cancel only after the document listener runs, avoiding real navigation.
    window.addEventListener('click', e=>e.preventDefault(), {once:true});
    child.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  };
  sendClick(doc.querySelector('a[href="/extension/"]'));
  assert.equal(events().length,0);
  sendClick(doc.querySelector('a[href^="https://chromewebstore.google.com/detail/"]'));
  assert.deepEqual(events(),[['event','chrome_store_click',{send_to:'G-J33QPHR8L3'}]]);
});

test('offline and blocked analytics do not interrupt document operations', () => {
  const oldWindow=globalThis.window;
  try {
    delete globalThis.window;
    assert.doesNotThrow(()=>recordProductEvent('document_download',{file_format:'pdf',workspace:'editor'}));
    globalThis.window={cttProductEvent(){throw new Error('blocked');}};
    assert.doesNotThrow(()=>recordProductEvent('document_download',{file_format:'pdf',workspace:'editor'}));
  } finally { if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow; }
});
