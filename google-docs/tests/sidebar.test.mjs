import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const html = readFileSync(new URL('../Sidebar.html', import.meta.url), 'utf8');
const localeCodes = JSON.parse(readFileSync(new URL('../../i18n/locales.json', import.meta.url), 'utf8')).map(locale => locale.code);
function setup(original = 'A short sentence.', translations = null) {
  const calls = [];
  const dom = new JSDOM(html, {runScripts: 'dangerously', beforeParse(window) {
    window.confirm = () => true;
    if (translations) {
      const t = text => translations[text] || text;
      window.cttI18n = {t, bindText(node, source) { node.textContent = t(source); }, bindError(node, source) { node.textContent = t(source); }};
    }
    const runner = {
      withSuccessHandler(fn) { this.success = fn; return this; },
      withFailureHandler(fn) { this.failure = fn; return this; },
      loadSelection() { calls.push({method:'load', success:this.success, failure:this.failure}); },
      applyEdit(...args) { calls.push({method:'apply', args, success:this.success, failure:this.failure}); },
    };
    window.google = {script:{run:runner, host:{close(){}}}};
  }});
  const $ = id => dom.window.document.getElementById(id);
  const edit = text => { $('edited').value = text; $('edited').dispatchEvent(new dom.window.Event('input')); };
  calls[0].success({token:'opaque-token', original, limit:4000, expiresInSeconds:900});
  return {dom, $, edit, calls};
}

test('requires a fresh preview, sends only snapshot token and reviewed text, prevents double writes', () => {
  const {dom, $, edit, calls} = setup();
  edit('A better sentence.');
  assert.equal($('apply').disabled, true);
  $('review').click();
  assert.equal($('apply').disabled, false);
  edit('A different sentence.');
  assert.equal($('apply').disabled, true);
  $('review').click(); $('apply').click(); $('apply').click();
  const writes = calls.filter(c => c.method === 'apply');
  assert.equal(writes.length, 1);
  assert.deepEqual(Array.from(writes[0].args), ['opaque-token', 'A different sentence.']);
  writes[0].success({changed:true, message:'Changes applied.'});
  assert.equal($('apply').disabled, true);
  assert.equal($('edited').readOnly, true);
  assert.equal($('load').disabled, false);
  dom.window.close();
});

test('untrusted text is shown literally; emoji differences stay intact; multiline edits are blocked', () => {
  const {dom, $, edit, calls} = setup('Hello 😀 <script>alert(1)</script>');
  edit('Hello 😁 <img src=x onerror=alert(1)>');
  $('review').click();
  assert.equal($('preview').querySelector('img,script'), null);
  assert.match($('preview').querySelector('del').textContent, /😀/);
  assert.match($('preview').querySelector('ins').textContent, /😁/);
  edit('Two\nparagraphs'); $('review').click(); $('apply').click();
  assert.equal($('apply').disabled, true);
  assert.equal($('changes').hidden, true);
  assert.equal(calls.length, 1);
  assert.match($('status').textContent, /without line breaks/);
  dom.window.close();
});

test('uncertain apply failures preserve a copyable draft and require a new snapshot', () => {
  const {dom, $, edit, calls} = setup();
  edit('Keep this draft.'); $('review').click(); $('apply').click();
  calls.at(-1).failure({message:'The paragraph changed.'});
  assert.equal($('edited').value, 'Keep this draft.');
  assert.equal($('edited').disabled, false);
  assert.equal($('apply').disabled, true);
  $('apply').click(); assert.equal(calls.length, 2);
  dom.window.confirm = () => false;
  $('load').click(); assert.equal(calls.length, 2);
  assert.match($('status').textContent, /draft remains here/);
  dom.window.close();
});

test('failed reload cannot apply a previously previewed passage', () => {
  const {dom, $, edit, calls} = setup();
  edit('Old passage edit.'); $('review').click();
  $('load').click();
  calls.at(-1).failure({message:'Select text in one paragraph.'});
  assert.equal($('apply').disabled, true);
  assert.equal($('review').disabled, true);
  assert.equal($('edited').value, 'Old passage edit.');
  $('apply').click();
  assert.equal(calls.filter(c => c.method === 'apply').length, 0);
  dom.window.close();
});

test('Russian interface messages do not translate selected text, drafts or write arguments', () => {
  const source = 'No changes to apply.';
  const {dom, $, edit, calls} = setup(source, {
    'Edit the selected text, then preview your changes.': 'Измените выделенный текст, затем проверьте правки.',
    'No changes to apply.': 'Нет изменений.',
    'The paragraph changed.': 'Абзац изменился.',
    'Your draft remains here. Copy it if needed, then select the passage and load it again.': 'Черновик сохранён в панели.',
  });
  assert.equal($('status').textContent, 'Измените выделенный текст, затем проверьте правки.');
  assert.equal($('original').textContent, source);
  assert.equal($('edited').value, source);
  $('review').click();
  assert.equal($('status').textContent, 'Нет изменений.');
  assert.equal($('preview').textContent, source);
  edit('No changes to apply. Updated.'); $('review').click(); $('apply').click();
  assert.equal(calls.at(-1).args[1], 'No changes to apply. Updated.');
  calls.at(-1).failure({message:'The paragraph changed.'});
  assert.equal($('status').textContent, 'Абзац изменился. Черновик сохранён в панели.');
  assert.equal($('edited').value, 'No changes to apply. Updated.');
  assert.equal($('apply').disabled, true);
  dom.window.close();
});

test('embedded locale switch updates sidebar labels and status without losing a reviewed draft', async () => {
  const {dom, $, edit, calls} = setup('An English original.');
  const engine = readFileSync(new URL('../../src/i18n.js', import.meta.url), 'utf8');
  dom.window.CTT_I18N_EMBEDDED = {ru:{
    'Apply to document':'Применить к документу',
    'Review the highlighted change, then apply it to the document.':'Проверьте правки и примените их.',
  }};
  dom.window.eval(engine);
  await dom.window.cttI18n.ready;
  edit('An English correction.'); $('review').click();
  const preview = $('preview').textContent;
  assert.equal($('apply').disabled, false);
  await dom.window.cttI18n.setLocale('ru');
  assert.equal($('apply').textContent, 'Применить к документу');
  assert.equal($('status').textContent, 'Проверьте правки и примените их.');
  assert.equal($('edited').value, 'An English correction.');
  assert.equal($('preview').textContent, preview);
  assert.equal($('apply').disabled, false);
  assert.equal(calls.filter(call => call.method === 'apply').length, 0);
  assert.deepEqual(Array.from($('ui-language').options, option => option.value), localeCodes);
  dom.window.close();
});
