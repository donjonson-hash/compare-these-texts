import assert from 'node:assert/strict';
import test from 'node:test';
import {handleRequest} from '../src/worker.mjs';
import {utils, write} from '../src/xlsx-vendor.mjs';

function workbook(rows, name = 'a.xlsx', extraSheet = false) {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), 'Data');
  if (extraSheet) utils.book_append_sheet(book, utils.aoa_to_sheet([['A'], ['B']]), 'More');
  return {name, data:Buffer.from(write(book, {type:'array', bookType:'xlsx'})).toString('base64')};
}
const compare = (left, right, offset = 0) => handleRequest('/api/simple-sheet', {left, right, offset});

test('first result matches item names across row and column moves and carries unchanged input context', async () => {
  const left = workbook([['Товар','Шт.','Цена, USD','Итого'],['Стулья',100,100,10000],['Столы',20,30,600]]);
  const right = workbook([['Шт.','Товар','Цена, USD','Итого'],[20,'Столы',30,600],[100,'Стулья',105,10500]]);
  const result = await compare(left, right);
  assert.deepEqual(result.key, ['Товар','Товар']);
  assert.deepEqual(result.items.map(i => [i.label,i.column,i.before,i.after,i.leftRow,i.rightRow]), [
    ['Стулья','Цена, USD','100','105',2,3],['Стулья','Итого','10000','10500',2,3]
  ]);
  assert.deepEqual(result.contexts.left[2], [['Товар','Стулья'],['Шт.','100'],['Цена, USD','100'],['Итого','10000']]);
  assert.equal(result.total, 2);
  assert.equal(result.summary.changedCells, 2);
  assert.equal(result.nextOffset, null);
  assert.equal((await compare(left, left)).total, 0);
});

test('wide audits on different domains use row order and never match repeated zeros or unrelated URLs', async () => {
  const columns = ['Page URL', ...Array.from({length:101}, (_, i) => 'Metric '+i)];
  const report = (host, last) => workbook([columns, ...['one','two'].map((key, i) =>
    [host+'/'+key,...Array(100).fill(0),i ? last : 0])]);
  const result = await compare(report('example.com',0), report('example.net',3));
  assert.equal(result.mode, 'position');
  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map(i => [i.leftRow,i.column]), [[2,'Page URL'],[3,'Page URL'],[3,'Metric 100']]);
});

test('duplicate names survive positional comparison and equal zeros are excluded', async () => {
  const left = workbook([['Товар','Шт.','Цена'],['Стулья',3,0],['Стулья',9,0]]);
  const right = workbook([['Товар','Шт.','Цена'],['Стулья',3,0],['Стулья',8,0]]);
  const result = await compare(left, right);
  assert.equal(result.mode, 'position');
  assert.deepEqual(result.items.map(i => [i.leftRow,i.before,i.after]), [[3,'9','8']]);
});

test('added and removed positions and columns retain values; blank differs from missing', async () => {
  const left = workbook([['SKU','Qty','old'],['A',0,''],['B',2,'left']]);
  const right = workbook([['SKU','Qty','new'],['A','',5],['C',3,'right']]);
  const r = await compare(left, right);
  assert.deepEqual(r.summary, {addedRows:1,removedRows:1,changedCells:1,addedColumns:1,removedColumns:1});
  assert.deepEqual(r.items.filter(i => i.kind === 'cell').map(i => [i.before,i.after]), [['0','']]);
  assert.deepEqual(r.items.filter(i => i.kind === 'row-removed').map(i => i.before), ['B','2','left']);
  assert.deepEqual(r.items.filter(i => i.kind === 'row-added').map(i => i.after), ['C','3','right']);
  assert(r.items.some(i => i.kind === 'column-added' && i.leftRow === 2 && i.after === '5'));
});

test('pagination keeps exact counts and complete source values past the first page', async () => {
  const rows = changed => [['SKU','Price'], ...Array.from({length:102}, (_, i) => ['S'+i,changed ? i+1 : i])];
  const a = workbook(rows(false)), b = workbook(rows(true));
  const page = await compare(a,b);
  assert.equal(page.total, 102);
  assert.equal(page.items.length, 50);
  const p2 = await compare(a,b,page.nextOffset);
  const p3 = await compare(a,b,p2.nextOffset);
  assert.equal(p3.nextOffset, null);
  assert.equal(new Set([...page.items,...p2.items,...p3.items].map(i=>i.leftRow)).size, 102);
  assert.deepEqual(p3.items.map(i=>i.before), ['100','101']);
});

test('books with multiple sheets retain sheet selection without demanding a row identifier', async () => {
  const a = workbook([['Thing'],['Chair']], 'a.xlsx', true);
  const b = workbook([['Thing'],['Chair']], 'b.xlsx');
  const ask = await compare(a,b);
  assert.equal(ask.needs_sheet, true);
  assert.deepEqual(ask.sheets.left.map(s=>s.name), ['Data','More']);
  const r = await compare({...a,sheet:'Data'},b);
  assert.equal(r.total, 0);
});
