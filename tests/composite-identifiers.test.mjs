import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../src/worker.mjs';
import {read, utils} from '../src/xlsx-vendor.mjs';

const source = text => ({name: 'stock.csv', data: Buffer.from(text).toString('base64')});
const input = {
  left: source('sku,warehouse,stock\na|b,c,12\na,b|c,3\na,west,7\nout,west,1'),
  right: source('article,depot,inventory\na,west,7\na,b|c,4\na|b,c,12\nnew,west,2'),
  key: ['sku', 'article'], second_key: ['warehouse', 'depot'],
  fields: [['stock', 'inventory', 'number']],
};
test('composite keys align reordered records without delimiter collisions, including exports', async () => {
  const {report, html} = await handleRequest('/api/compare', input);
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.summary, {left_rows:4, right_rows:4, matched:2, changed:1, only_left:1, only_right:1});
  assert.equal(report.changed[0].left.record, 3);
  assert.equal(report.changed[0].right.record, 3);
  assert.deepEqual(JSON.parse(report.changed[0].key), ['a', 'b|c']);
  assert.match(html, /Matching key/);
  const {data} = await handleRequest('/api/export', {report, format:'xlsx'});
  const book = read(data);
  assert.ok(book.SheetNames.some(sheet => utils.sheet_to_json(book.Sheets[sheet], {header:1}).some(row => row.includes(report.changed[0].key))));
});
test('both paired fields are required and the complete normalized tuple must be unique', async () => {
  const q = async rows => (await handleRequest('/api/compare', {...input, strip:true,
    left: source('sku,warehouse,stock\n' + rows)})).report.issues;
  assert.equal((await q('a,east,1\na, east ,7'))[0].code, 'duplicate_key');
  assert.equal((await q('a, ,1'))[0].column, 'warehouse');
  await assert.rejects(handleRequest('/api/compare', {...input, second_key:['sku','depot']}), /distinct/);
  const {report} = await handleRequest('/api/compare', {...input, second_key:null});
  assert.ok(report.issues.some(issue => issue.code === 'duplicate_key'));
});

test('edits and copies a row with mapped SKU and warehouse, then restores and downloads B', async t => {
  const {JSDOM} = await import('jsdom');
  const {write} = await import('../src/xlsx-vendor.mjs');
  const {mountSheetReview} = await import('../src/sheet-review.mjs');
  const {validateSessionPayload} = await import('../src/session-store.mjs');
  function workbook(name, rows) {
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet(rows), 'Stock');
    return {name, data: write(book, {type:'base64', bookType:'xlsx'})};
  }
  const sources = {
    left: workbook('a.xlsx', [['sku','warehouse','stock'],['X','north',12],['X','south',7]]),
    right: workbook('b.xlsx', [['inventory','depot','article'],[4,'north','X']]),
  };
  const {report} = await handleRequest('/api/compare', {...input, ...sources});
  const dom = new JSDOM('<main></main>');
  const root = dom.window.document.querySelector('main');
  Object.assign(globalThis, {window:dom.window, document:dom.window.document});
  t.after(() => { dom.window.close(); delete globalThis.window; delete globalThis.document; });
  const downloads = [];
  t.mock.method(URL, 'createObjectURL', blob => { downloads.push(blob); return 'blob:edited'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  let view = await mountSheetReview(root, {report, sources});
  t.after(() => view.dispose());
  root.querySelector('[data-side="right"][data-cell="A2"]').click();
  root.querySelector('[data-edit-side="right"]').value = '18';
  root.querySelector('[data-apply-cell="right"]').click();
  root.querySelector('[data-side="left"][data-cell="B3"]').click();
  root.querySelector('[data-copy-row-from="left"]').click();
  const saved = validateSessionPayload({version:1, report, sources, review:view.snapshot()});
  view.dispose();
  view = await mountSheetReview(root, {report:saved.report, sources:saved.sources, restoredState:saved.review});
  root.querySelector('[data-save-side="right"]').click();
  assert.equal(downloads.length, 1);
  const output = read(new Uint8Array(await downloads[0].arrayBuffer()));
  assert.deepEqual(utils.sheet_to_json(output.Sheets.Stock, {header:1}), [
    ['inventory','depot','article'], [18,'north','X'], [7,'south','X'],
  ]);
});
