import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('optional status tool cannot return document-derived error text or counts', () => {
  let registered;
  const privateText = 'PRIVATE: client account and document name';
  const nodes = Object.fromEntries(['results', 'notice', 'setup-question', 'change-count'].map(id => [id, {
    hidden: false, textContent: privateText, classList: {contains: () => true}
  }]));
  const context = {document: {modelContext: {registerTool: tool => { registered = tool; }}, getElementById: id => nodes[id]},
    window: {addEventListener() {}}, AbortController};
  vm.runInNewContext(readFileSync(new URL('../src/site.js', import.meta.url), 'utf8'), context);
  const result = registered.execute({});
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {hasResult: true, requiresClarification: true, hasNotice: true, hasError: true});
  assert.ok(!JSON.stringify(result).includes(privateText));
  assert.throws(() => registered.execute({text: privateText}), /empty object/);
});
