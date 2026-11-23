// Excel quotes pasted cells that have embedded line breaks, tabs or quotes.
function* columnValues(text) {
  const cell = /(?:"((?:[^"]|"")*)"(?=[\t\r\n]|$)|([^\t\r\n]*))(\r\n|[\t\r\n]|$)/y;
  while (cell.lastIndex < text.length) {
    const [, quoted, plain, separator] = cell.exec(text);
    if (separator === '\t') throw new Error('Paste a single column in each box.');
    const value = quoted === undefined ? plain : quoted.replaceAll('""', '"').replace(/\r\n?/g, '\n');
    if (value.trim()) yield value;
  }
}

export function compareColumns(left, right) {
  const values = new Map();
  for (const [side, text] of [['a', left], ['b', right]]) {
    for (const value of columnValues(text)) {
      let entry = values.get(value);
      if (!entry) {
        entry = {value, a: 0, b: 0};
        values.set(value, entry);
      }
      entry[side]++;
    }
  }
  const groups = {equal: [], onlyA: [], onlyB: [], different: []};
  for (const entry of values.values()) {
    if (!entry.b) groups.onlyA.push(entry);
    else if (!entry.a) groups.onlyB.push(entry);
    else if (entry.a === entry.b) groups.equal.push(entry);
    else groups.different.push(entry);
  }
  return groups;
}

export function initializeColumns(doc) {
  const form = doc.getElementById('column-form');
  if (!form) return;
  const left = doc.getElementById('column-a');
  const right = doc.getElementById('column-b');
  const example = doc.getElementById('column-example');
  const results = doc.getElementById('column-results');
  const error = doc.getElementById('column-error');
  const status = doc.getElementById('column-status');
  const table = doc.getElementById('column-table');
  const pages = doc.getElementById('column-pages');
  const prev = doc.getElementById('column-prev');
  const next = doc.getElementById('column-next');
  const buttons = [...results.querySelectorAll('[data-column-group]')];
  const pageSize = 100;
  let groups, selected, page = 0, errorMessage = '';

  function translate(source, values = {}) {
    return doc.defaultView.cttI18n?.t(source, values)
      ?? source.replace(/\{(\w+)\}/g, (_, key) => values[key]);
  }
  function render() {
    for (const button of buttons) {
      const name = button.dataset.columnGroup;
      button.setAttribute('aria-pressed', String(name === selected));
      button.querySelector('.column-group-count').textContent = '(' + groups[name].length + ')';
    }
    const entries = groups[selected];
    const start = page * pageSize;
    const end = Math.min(start + pageSize, entries.length);
    status.textContent = entries.length
      ? translate('Showing {first}–{last} of {total} values.', {first:start + 1, last:end, total:entries.length})
      : translate('No values in this group.');
    const fragment = doc.createDocumentFragment();
    for (const {value, a, b} of entries.slice(start, end)) {
      const row = doc.createElement('tr');
      for (const field of [value, a, b]) {
        const td = row.insertCell();
        td.dir = 'auto';
        td.textContent = String(field);
      }
      fragment.append(row);
    }
    table.tBodies[0].replaceChildren(fragment);
    table.hidden = entries.length === 0;
    pages.hidden = entries.length <= pageSize;
    prev.disabled = page === 0;
    next.disabled = end >= entries.length;
  }
  function resetResult() {
    groups = null;
    errorMessage = '';
    results.hidden = true;
    error.hidden = true;
    table.tBodies[0].replaceChildren();
    example.hidden = Boolean(left.value || right.value);
  }
  function compare() {
    resetResult();
    try {
      groups = compareColumns(left.value, right.value);
      selected = ['different', 'onlyA', 'onlyB', 'equal'].find(name => groups[name].length);
      if (!selected) throw new Error('Paste at least one value to compare.');
      page = 0;
      results.hidden = false;
      render();
    } catch (err) {
      errorMessage = err.message;
      error.textContent = translate(errorMessage);
      error.hidden = false;
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); compare(); });
  form.addEventListener('input', resetResult);
  example.addEventListener('click', () => {
    left.value = '00127\n00127\n00127\nLAMP-01\nCHAIR-04';
    right.value = 'LAMP-01\nGLASS-03\n00127';
    compare();
  });
  for (const button of buttons) {
    button.addEventListener('click', () => {
      selected = button.dataset.columnGroup;
      page = 0;
      render();
    });
  }
  prev.addEventListener('click', () => { page--; render(); });
  next.addEventListener('click', () => { page++; render(); });
  doc.addEventListener('ctt:language-changed', () => {
    if (errorMessage) error.textContent = translate(errorMessage);
    if (!results.hidden) render();
  });
  resetResult();
}

if (typeof document !== 'undefined') initializeColumns(document);
