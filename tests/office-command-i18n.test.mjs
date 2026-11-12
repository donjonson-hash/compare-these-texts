import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/i18n.js';
import office from '../src/office.js';

const intro = 'Supported command examples (English): {0}';
const scope = 'This version does not assess the content of contracts, reports, or books.';
const examples = {
  empty: ['What changed?', 'What was added?', 'What was deleted?', 'Show paragraph 3 in A', 'Find "phrase"', 'Draft a letter'],
  text: ['What changed?', 'What was added?', 'Show text-2', 'Show paragraph 3 in A', 'Find "phrase"', 'Draft a letter'],
  table: ['What changed?', 'What about prices?', 'What is missing?', 'Why do they match?', 'Show [exact key]', 'Draft a letter'],
};
function fixtures() {
  const raw = 'phrase — العربية 日本語 Download {0}';
  const block = (record, text) => ({record, location: `Document paragraph ${record}`, text});
  const text = {kind: 'text', status: 'complete', sources: {left: {name: 'Download.txt'}, right: {name: '日本語.txt'}},
    changed: [{key: 'text-2', left: block(3, raw), right: block(3, raw + ' revised')}],
    only_left: [{key: 'text-3', row: block(4, 'Deleted ' + raw)}], only_right: [{key: 'text-4', row: block(4, 'Added ' + raw)}], matched: []};
  const row = price => ({record: 2, values: {key: raw, price}});
  const table = {status: 'complete', sources: {left: {name: 'Download.csv', headers: ['key', 'price']}, right: {name: '日本語.csv', headers: ['key', 'price']}},
    rules: {key: ['key', 'key'], fields: [['price', 'price', 'number']], strip: true},
    changed: [{key: raw, left: row('10'), right: row('20'), changes: [{left_column: 'price', right_column: 'price', before: '10', after: '20', mode: 'number'}]}], only_left: [], only_right: [], matched: []};
  return {raw, text, table};
}

// These commands are a public parser contract. A language change must leave
// the suggested runnable examples usable, even if a catalog contains their translations.
test('Arabic and Japanese language switches preserve runnable assistant examples and original evidence', async t => {
  const previous = globalThis.cttI18n;
  t.after(() => { globalThis.cttI18n = previous; });
  const translations = {
    ar: {[intro]: 'أمثلة أوامر مدعومة (بالإنجليزية): {0}', [scope]: 'لا يقيّم هذا الإصدار محتوى العقود أو التقارير أو الكتب.'},
    ja: {[intro]: '対応するコマンドの例（英語）: {0}', [scope]: 'このバージョンは契約書、報告書、書籍の内容を評価しません。'},
  };
  for (const catalog of Object.values(translations)) for (const command of Object.values(examples).flat()) catalog[command] = 'INVALID_TRANSLATED_COMMAND';
  const api = globalThis.cttCreateI18n({document: null, autoStart: false, storage: null, embedded: translations});
  globalThis.cttI18n = api;
  const {raw, text, table} = fixtures(), before = JSON.stringify({text, table});
  const quotedCommands = answer => [...answer.text.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  for (const locale of ['ar', 'ja']) {
    assert.equal(await api.setLocale(locale, {persist: false}), true);
    for (const [kind, report, question] of [['empty', text, ''], ['text', text, 'unsupported request'], ['table', table, 'unsupported request']]) {
      const help = office.answer(report, question);
      assert.ok(help.text.includes(translations[locale][intro].replace('{0}', '')));
      assert.deepEqual(quotedCommands(help), examples[kind]);
      assert.ok(!help.text.includes('INVALID_TRANSLATED_COMMAND'));
      if (kind === 'table') assert.ok(help.text.includes(translations[locale][scope]));
      for (const example of quotedCommands(help)) {
        const command = example.replace('[exact key]', raw);
        const answer = office.answer(report, command);
        assert.ok(!answer.text.includes('supported comparison request'), command);
        assert.ok(!answer.text.includes('supported text comparison request'), command);
        assert.ok(!answer.text.includes('No matching blocks'), command);
        if (command === 'Draft a letter') assert.ok(answer.draft.includes(raw));
        if (command.startsWith('Show ') || command.startsWith('Find ')) {
          assert.ok(answer.actions.length > 0, command);
          assert.ok(answer.text.includes(raw), command);
        }
      }
    }
    assert.equal(JSON.stringify({text, table}), before);
  }
});
