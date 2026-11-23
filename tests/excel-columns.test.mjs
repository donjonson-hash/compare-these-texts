import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {compareColumns, initializeColumns} from '../src/excel-columns.mjs';

test('pasted Excel values preserve duplicate counts, leading zeros and quoted multiline cells', () => {
  const {equal, different, onlyA, onlyB} = compareColumns(
    '001\r\n001\r\n01\r\n"a\r\nb"\r\n\r\n__proto__\nold',
    '01\n001\n"a\nb"\n__proto__\nnew',
  );
  assert.deepEqual(different, [{value:'001', a:2, b:1}]);
  assert.deepEqual(equal.map(row => row.value), ['01', 'a\nb', '__proto__']);
  assert.deepEqual(onlyA, [{value:'old', a:1, b:0}]);
  assert.deepEqual(onlyB, [{value:'new', a:0, b:1}]);
  assert.throws(() => compareColumns('extra\tcolumn', ''), /single column/);
});

test('guide example, filter changes, updates and paging operate on the actual controls', () => {
  const dom = new JSDOM(readFileSync(new URL('../src/compare-excel-files/index.html', import.meta.url), 'utf8'));
  const {document:doc, Event} = dom.window;
  initializeColumns(doc);
  const get = id => doc.getElementById(id);
  const visibleValues = () => [...get('column-table').tBodies[0].rows].map(row => [...row.cells].map(cell => cell.textContent));
  get('column-example').click();
  assert.deepEqual(visibleValues(), [['00127', '3', '1']]);
  doc.querySelector('[data-column-group="onlyB"]').click();
  assert.deepEqual(visibleValues(), [['GLASS-03', '0', '1']]);
  get('column-a').value = Array.from({length: 101}, (_, i) => 'item-' + i).join('\n');
  get('column-b').value = '';
  get('column-a').dispatchEvent(new Event('input', {bubbles:true}));
  assert.equal(get('column-results').hidden, true);
  get('column-form').dispatchEvent(new Event('submit', {cancelable:true}));
  assert.equal(visibleValues().length, 100);
  get('column-next').click();
  assert.deepEqual(visibleValues(), [['item-100', '1', '0']]);
  get('column-a').value = 'a\tb';
  get('column-form').dispatchEvent(new Event('submit', {cancelable:true}));
  assert.equal(get('column-error').hidden, false);
  assert.equal(get('column-results').hidden, true);
  dom.window.close();
});
