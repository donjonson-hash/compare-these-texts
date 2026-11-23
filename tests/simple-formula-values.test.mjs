import test from 'node:test';
import assert from 'node:assert/strict';
import {CFB, utils, write} from '../src/xlsx-vendor.mjs';
import {readWorkbook} from '../src/xlsx-source.mjs';

function priceList() {
  const book = utils.book_new();
  const grid = utils.aoa_to_sheet([
    ['SKU', 'Qty', 'Price', 'Total', 'Date', 'Saved blank', 'Literal', 'Padded'],
    ['a', 3, 4, 0, 2, 'placeholder', '=B2*C2', 3],
    ['b', 3, 4, 12],
    ['c', 3, 4, 12],
  ]);
  grid.E2.z = 'yyyy-mm-dd';
  grid.H2.z = '00000';
  utils.book_append_sheet(book, grid, 'Price');
  utils.book_append_sheet(book, utils.aoa_to_sheet([['note'], ['text']]), 'Notes');
  const archive = CFB.read(new Uint8Array(write(book, {type:'array', bookType:'xlsx'})), {type:'array'});
  const path = 'xl/worksheets/sheet1.xml';
  let xml = new TextDecoder().decode(CFB.find(archive, '/' + path).content);
  function contents(address, type, inner) {
    const cell = new RegExp('<c r="' + address + '"([^>]*)>[\\s\\S]*?</c>');
    assert.match(xml, cell);
    xml = xml.replace(cell, (_, attributes) => '<c r="' + address + '"' + attributes.replace(/ t="[^"]*"/, '') + type + '>' + inner + '</c>');
  }
  // Use explicit OOXML values. The spreadsheet writer itself may synthesize a cache.
  contents('D2', '', '<f>B2*C2</f><v>0</v>');
  contents('D3', '', '<f>B3*C3</f>');
  contents('D4', ' t="n"', '<f>B4*C4</f><v></v>');
  contents('E2', '', '<f>DATE(1900,1,2)</f><v>2</v>');
  contents('F2', ' t="str"', '<f>IF(TRUE,"","x")</f><v/>');
  contents('H2', '', '<f>B2</f><v>3</v>');
  CFB.utils.cfb_add(archive, '/' + path, new TextEncoder().encode(xml));
  return new Uint8Array(CFB.write(archive, {type:'buffer', fileType:'zip', compression:true}));
}

test('simple Excel reads actual stored formula results and preserves uncached expressions', async () => {
  const raw = priceList(), args = {name:'prices.xlsx', simple:true};
  assert.deepEqual((await readWorkbook(raw, {...args, listOnly:true})).sheets.map(s => s.name), ['Price', 'Notes']);
  assert.equal((await readWorkbook(raw, args)).selected, null);
  const {parsed} = await readWorkbook(raw, {...args, sheet:'Price'});
  assert.deepEqual(parsed.meta.formulas, {cached:4, uncached:2});
  const [first, second, third] = parsed.rows;
  assert.equal(first.values.Total, '0');
  assert.equal(first.values.Date, '1900-01-02');
  assert.equal(first.values['Saved blank'], '');
  assert.equal(first.values.Padded, '00003');
  assert.equal(first.values.Literal, '=B2*C2');
  assert.equal(first.uncachedFormulas, undefined);
  assert.equal(second.values.Total, '=B3*C3');
  assert.equal(second.uncachedFormulas.Total, true);
  assert.equal(third.values.Total, '=B4*C4');
  assert.equal(third.uncachedFormulas.Total, true);
  await assert.rejects(readWorkbook(raw, {name:args.name, sheet:'Price'}), /formula was found/);
});
