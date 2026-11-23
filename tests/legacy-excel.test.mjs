import test from 'node:test';
import assert from 'node:assert/strict';
import {utils, read, write, CFB} from '../src/xlsx-vendor.mjs';
import {prepare, compare} from '../src/engine.mjs';
import {readWorkbook} from '../src/xlsx-source.mjs';
import {renderXlsx} from '../src/xlsx-report.mjs';
import {openSheetDocument} from '../src/sheet-document.mjs';
import {validateSessionPayload} from '../src/session-store.mjs';

function sample(bookType, price) {
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([['sku','price'],[12,price]]);
  ws.A2.z = '0000';
  ws.B2.l = {Target:'https://example.invalid/price'};
  utils.book_append_sheet(wb, ws, 'Прайс');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['memo'],['private']]), 'Other');
  return new Uint8Array(write(wb, {type:'array', bookType, compression:true}));
}
const source = (name, bytes) => ({name, data:Buffer.from(bytes).toString('base64'), sheet:'Прайс'});

test('binary XLS compares to XLSX and exports distinct editable worksheet and report files', async () => {
  const original = sample('biff8', 30);
  const left = source('old.XLS', original), right = source('new.xlsx', sample('xlsx', 35));
  const selection = await prepare({left:{...left, sheet:undefined}, right});
  assert.deepEqual(selection.sheets.left.map(x => x.name), ['Прайс','Other']);
  const setup = await prepare({left,right});
  assert.equal(setup.ready,true);
  const report = await compare({left,right,delimiter:setup.delimiter,...setup.rules});
  assert.equal(report.sources.left.format,'xls');
  assert.equal(report.sources.right.format,'xlsx');
  assert.equal(report.changed[0].key,'0012');
  assert.equal(report.changed[0].right.values.price,'35');
  const session = validateSessionPayload({version:1,sources:{left,right},report,review:{kind:'sheet',version:1}});
  const doc = await openSheetDocument(session.sources.left, report.sources.left);
  for (const price of [30, 40]) {
    if (price===40) doc.edit('B2','40','number');
    const bytes = doc.export();
    assert.deepEqual([...bytes.subarray(0,2)], [0x50,0x4b]);
    const copy = read(bytes, {type:'array', cellNF:true, bookVBA:true});
    assert.deepEqual(copy.SheetNames,['Прайс']);
    assert.equal(copy.Sheets.Прайс.B2.v, price);
    assert.equal(copy.Sheets.Прайс.B2.l, undefined);
    assert.equal(copy.Sheets.Прайс.A2.z, '0000');
    assert.equal(copy.vbaraw,undefined);
  }
  const reportWorkbook = read(renderXlsx(report), {type:'array'});
  assert.ok(reportWorkbook.SheetNames.length > 1);
  assert.equal(read(original, {type:'array'}).Sheets.Прайс.B2.v,30);
});

test('XLS import rejects renamed ZIP/text, unrelated compound files and VBA storage', async () => {
  const name = 'a.xls', empty = CFB.utils.cfb_new();
  CFB.utils.cfb_add(empty,'/WordDocument',new Uint8Array([1,2,3]));
  for (const bytes of [new TextEncoder().encode('sku,price\nA,1'),sample('xlsx',30),new Uint8Array(CFB.write(empty,{type:'buffer'}))]) {
    await assert.rejects(readWorkbook(bytes, {name}), /Excel 97–2003/);
  }
  const archive = CFB.read(sample('biff8',30),{type:'array'});
  CFB.utils.cfb_add(archive,'/_VBA_PROJECT_CUR/VBA/dir',new Uint8Array([1,2,3]));
  await assert.rejects(readWorkbook(new Uint8Array(CFB.write(archive,{type:'buffer'})),{name}),/macros/);
});
