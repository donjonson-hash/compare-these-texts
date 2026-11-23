/** Read-only value comparison. Never uses a repeated flag or price as a row key. */
import {loadTables} from './engine.mjs';

const idHeader = /^(?:id|sku|product[ _-]?(?:id|code)|item[ _-]?(?:id|code)|code|article|артикул|идентификатор|код(?:[ _]товара)?|url|page url|keyword|ключев(?:ое слово|ая фраза))$/iu;
const nameHeader = /^(?:product(?: name)?|item(?: name)?|name|description|наименование(?: товара)?|название(?: товара)?|товар|номенклатура|позиция)$/iu;
const measureHeader = /^(?:status|state|qty|quantity|price|unit|total|amount|date|количество|цена|сумма|итог|дата|статус|единица|шт)(?:$|[ ._(-])/iu;
const PAGE_SIZE = 50;
const uncached = (row, h) => row?.uncachedFormulas?.[h] === true;

function reliableKey(left, right, common) {
  const first = left.meta.headers[0];
  const ids = common.filter(h => idHeader.test(h.trim()));
  const names = common.filter(h => nameHeader.test(h.trim()));
  // A generic table can also start with a distinct textual label, e.g. "Model".
  const generic = first === right.meta.headers[0] && !ids.includes(first) && !names.includes(first) && !measureHeader.test(first) ? [first] : [];
  let disjointIds = false;
  for (const header of [...ids, ...names, ...generic]) {
    if (disjointIds && !ids.includes(header)) break;
    if (left.rows.some(row => uncached(row, header)) || right.rows.some(row => uncached(row, header))) continue;
    const a = left.rows.map(row => row.values[header]);
    const b = right.rows.map(row => row.values[header]);
    if (!a.length || !b.length || a.some(v => !v.trim()) || b.some(v => !v.trim())) continue;
    if (!ids.includes(header) && (!a.every(v => /\p{L}/u.test(v)) || !b.every(v => /\p{L}/u.test(v)))) continue;
    const set = new Set(a);
    if (set.size !== a.length || new Set(b).size !== b.length) continue;
    const overlap = b.reduce((count, value) => count + Number(set.has(value)), 0);
    if (overlap && (!generic.includes(header) || overlap === Math.min(a.length, b.length))) return header;
    // Explicit distinct SKU or URL lists supply no evidence that other shared
    // values refer to the same entity. Positional mode makes no such claim.
    if (ids.includes(header)) disjointIds = true;
  }
  return null;
}

function short(value, length) {
  return value.length > length ? value.slice(0, length) + '…' : value;
}

export async function simpleSheet(payload) {
  const tables = await loadTables(payload, {simple:true});
  if (tables.needs_sheet) return tables;
  const {left, right} = tables.parsed;
  const aHeaders = left.meta.headers, bHeaders = right.meta.headers;
  const aSet = new Set(aHeaders), bSet = new Set(bHeaders);
  const common = aHeaders.filter(h => bSet.has(h));
  const lost = aHeaders.filter(h => !bSet.has(h)), gained = bHeaders.filter(h => !aSet.has(h));
  const key = reliableKey(left, right, common);
  const offset = Number.isSafeInteger(payload.offset) && payload.offset >= 0 ? payload.offset : 0;
  const items = [], contexts = {left:{}, right:{}};
  const summary = {changedCells:0, addedRows:0, removedRows:0, addedColumns:gained.length, removedColumns:lost.length};
  let total = 0, pageChars = 0, full = false;
  const aLabel = aHeaders.find(h => nameHeader.test(h.trim())) || key || aHeaders[0];
  const bLabel = bHeaders.find(h => nameHeader.test(h.trim())) || key || bHeaders[0];

  function remember(store, row, headers) {
    if (!row || store[row.record]) return;
    const cells = [];
    for (const h of headers) {
      if (row.values[h] !== '') cells.push([short(h, 100), short(row.values[h], 160)]);
      if (cells.length === 6) break;
    }
    store[row.record] = cells;
  }
  function emit(kind, a, b, column, before, after) {
    if (total++ < offset || full) return;
    const label = short(a?.values[aLabel] || b?.values[bLabel] || '', 180);
    const chars = column.length + (before?.length || 0) + (after?.length || 0) + label.length;
    if (items.length && pageChars + chars > 512000) { full = true; return; }
    items.push({kind, label, leftRow:a?.record ?? null, rightRow:b?.record ?? null, column, before, after,
      ...(uncached(a, column) && {beforeFormula:true}), ...(uncached(b, column) && {afterFormula:true})});
    pageChars += chars;
    full = items.length === PAGE_SIZE;
    remember(contexts.left, a, aHeaders);
    remember(contexts.right, b, bHeaders);
  }

  for (const h of lost) emit('column-removed', null, null, h, h, null);
  for (const h of gained) emit('column-added', null, null, h, null, h);

  function compareRow(a, b) {
    if (!a || !b) {
      const row = a || b, headers = a ? aHeaders : bHeaders;
      const kind = a ? 'row-removed' : 'row-added';
      if (a) summary.removedRows++; else summary.addedRows++;
      let empty = true;
      for (const h of headers) {
        const value = row.values[h];
        if (value === '') continue;
        empty = false;
        emit(kind, a, b, h, a ? value : null, b ? value : null);
      }
      if (empty) emit(kind, a, b, '', a ? '' : null, b ? '' : null);
      return;
    }
    for (const h of common) {
      const before = a.values[h], after = b.values[h];
      if (before !== after || uncached(a, h) !== uncached(b, h)) {
        summary.changedCells++;
        emit('cell', a, b, h, before, after);
      }
    }
    for (const h of lost) if (a.values[h] !== '') emit('column-removed', a, b, h, a.values[h], null);
    for (const h of gained) if (b.values[h] !== '') emit('column-added', a, b, h, null, b.values[h]);
  }
  if (key) {
    const remaining = new Map(right.rows.map(b => [b.values[key], b]));
    for (const a of left.rows) {
      const value = a.values[key];
      compareRow(a, remaining.get(value));
      remaining.delete(value);
    }
    for (const b of remaining.values()) compareRow(null, b);
  } else {
    for (let i = 0; i < Math.max(left.rows.length, right.rows.length); i++) compareRow(left.rows[i], right.rows[i]);
  }
  return {left:left.meta, right:right.meta, mode:key ? 'key' : 'position', key:key ? [key, key] : null,
    summary, total, offset, nextOffset:offset + items.length < total ? offset + items.length : null, contexts, items};
}
