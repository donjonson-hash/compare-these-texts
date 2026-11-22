import {utils, write} from './xlsx-vendor.mjs';

export function createInventoryExample() {
  const book = utils.book_new();
  const header = ['SKU', 'Quantity', 'Price'];
  const sheets = {left:'October', right:'November'};
  const before = [['LAMP-01', 12, 35], ['DESK-02', 4, 120], ['PEN-03', 20, 3]];
  const after = [['PEN-03', 20, 3.5], ['LAMP-01', 10, 35], ['BOX-04', 8, 5]];
  utils.book_append_sheet(book, utils.aoa_to_sheet([header, ...before]), sheets.left);
  utils.book_append_sheet(book, utils.aoa_to_sheet([header, ...after]), sheets.right);
  const file = new File([write(book, {type:'array', bookType:'xlsx'})], 'Monthly-inventory.xlsx',
    {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  return {file, sheets};
}
