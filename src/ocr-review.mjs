import {openPdf} from './ocr-pdf-input.mjs';
import {makeWorker} from './ocr-runtime.mjs';
import {validateOcrImage} from './ocr-image-input.mjs';
import {validateCheckedText} from './ocr-import.mjs';

const preferences = new Map();
const storageKey = side => 'ctt.ocr.preferences.' + side;

function readPreferences(side) {
  const defaults = {language: 'eng', psm: '6'};
  let saved = preferences.get(side);
  if (!saved) {
    try { saved = JSON.parse(localStorage.getItem(storageKey(side))); } catch {}
  }
  return {
    language: ['eng', 'rus', 'rus+eng'].includes(saved?.language) ? saved.language : defaults.language,
    psm: ['3', '6'].includes(saved?.psm) ? saved.psm : defaults.psm,
  };
}

function savePreferences(side, settings) {
  preferences.set(side, {...settings});
  try { localStorage.setItem(storageKey(side), JSON.stringify(settings)); } catch {}
}
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const button = (text, cls = 'secondary') => {
  const node = el('button', text, `button ${cls}`); node.type = 'button'; return node;
};
const MAX_CHARS = 500000;
export function reviewedOcrResult(pages, originalName) {
  if (!pages.length || pages.some(page => !page.loaded || !page.confirmed || (!page.text.trim() && !page.blank))) {
    throw new Error('Check and confirm every page before using its text.');
  }
  const text = pages.map(page => page.text).join('\n\n');
  validateCheckedText(text);
  if (!text.trim()) throw new Error('This document has no text to compare. Choose another document.');
  return {text, originalName, pages: pages.map(page => ({text: page.text, confirmed: true, source: page.source}))};
}

/** The caller receives no document text until the user confirms all pages. */
export async function reviewOcrFile(file, {side = 'left', signal} = {}) {
  if (signal?.aborted) return null;
  const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > (isPdf ? 20 : 10) * 1024 * 1024) {
    throw new Error('Choose a nonempty PNG/JPEG up to 10 MiB or PDF up to 20 MiB.');
  }
  if (!isPdf && !/\.(png|jpe?g)$/i.test(file.name)) throw new Error('Choose a PNG, JPEG or PDF document.');
  const prefKey = ['left', 'right'].includes(side) ? side : 'single';
  const prefs = readPreferences(prefKey);
  const priorFocus = document.activeElement, dialog = el('dialog', undefined, 'ocr-review-dialog');
  dialog.setAttribute('aria-label', 'Check recognized document text');
  const header = el('header', undefined, 'ocr-review-header');
  const title = el('h2', 'Check document text'), close = button('Cancel'); close.classList.add('ocr-close');
  const filename = el('p', file.name, 'ocr-filename'); filename.setAttribute('translate', 'no');
  header.append(title, close);
  const hint = el('p', 'Check each page against the original. Recognition can confuse letters, numbers and currencies. Your file stays in this browser.');
  const nav = el('div', undefined, 'ocr-review-nav'), pageSelect = el('select'), reload = button('Reload page'), count = el('span');
  pageSelect.setAttribute('aria-label', 'OCR page'); pageSelect.className = 'ocr-page-select';
  nav.append(el('span', 'Page'), pageSelect, reload, count); nav.hidden = !isPdf;
  const pdfNote = el('p', 'Preview excludes PDF annotations and form fields. Check them in the source file separately.', 'ocr-pdf-note'); pdfNote.hidden = !isPdf;
  const columns = el('div', undefined, 'ocr-review-columns'), original = el('div', undefined, 'ocr-review-original');
  const image = el('img'); image.alt = 'Original document page'; image.hidden = true;
  const full = el('a', 'Open full-size image'); full.target = '_blank'; full.rel = 'noopener'; full.hidden = true;
  const stage = el('div', undefined, 'ocr-image-stage'), selectionBox = el('div', undefined, 'ocr-selection-box');
  selectionBox.hidden = true; stage.append(image, selectionBox);
  const selectArea = button('Select area'), clearArea = button('Clear area');
  selectArea.classList.add('ocr-select-area'); selectArea.setAttribute('aria-pressed', 'false');
  clearArea.classList.add('ocr-clear-area');
  const areaTools = el('div', undefined, 'ocr-review-options'); areaTools.append(selectArea, clearArea);
  const coordinates = el('details'), coordinateFields = [];
  coordinates.append(el('summary', 'Area coordinates (%)'));
  for (const [key, label] of [['x', 'Left'], ['y', 'Top'], ['width', 'Width'], ['height', 'Height']]) {
    const field = el('input'); field.type = 'number'; field.min = '0'; field.max = '100'; field.step = '0.1';
    field.value = ['width', 'height'].includes(key) ? '100' : '0'; field.dataset.coordinate = key;
    const labelNode = el('label', label + ' '); labelNode.append(field); coordinates.append(labelNode);
    coordinateFields.push(field);
  }
  original.append(stage, full, areaTools, coordinates);
  const editing = el('div', undefined, 'ocr-review-editing'), options = el('div', undefined, 'ocr-review-options');
  const language = el('select'); language.className = 'ocr-language'; language.setAttribute('translate', 'no');
  for (const [value, label] of [['eng', 'English (eng)'], ['rus', 'Русский (rus)'], ['rus+eng', 'Русский + English']]) { const option = el('option', label); option.value = value; language.append(option); }
  const langLabel = el('label', 'OCR language '); langLabel.append(language);
  const layout = el('select'); layout.className = 'ocr-layout';
  for (const [value, label] of [['6', 'Single text block'], ['3', 'Automatic layout']]) { const option = el('option', label); option.value = value; layout.append(option); }
  const layoutLabel = el('label', 'Layout '); layoutLabel.append(layout);
  const recognize = button('Recognize page'), stopButton = button('Stop'); recognize.classList.add('ocr-recognize'); stopButton.classList.add('ocr-stop');
  const recognizeArea = button('Recognize area'); recognizeArea.classList.add('ocr-recognize-area');
  options.append(langLabel, layoutLabel, recognize, recognizeArea, stopButton);
  const status = el('p', 'Opening document…', 'ocr-status'); status.setAttribute('role', 'status');
  const text = el('textarea'); text.className = 'ocr-text'; text.setAttribute('aria-label', 'Checked page text'); text.setAttribute('translate', 'no'); text.setAttribute('spellcheck', 'false'); text.setAttribute('autocorrect', 'off'); text.setAttribute('autocapitalize', 'off'); text.maxLength = MAX_CHARS;
  const blankLabel = el('label', undefined, 'ocr-blank-label'), blank = el('input'); blank.type = 'checkbox'; blank.className = 'ocr-blank'; blankLabel.append(blank, document.createTextNode(' I checked: this page has no text to compare'));
  const confirm = button('Confirm page'); confirm.classList.add('ocr-confirm');
  editing.append(options, el('small', 'Choose the document language. Translating the interface does not change OCR.'), status, text, blankLabel, confirm);
  const regionPanel = el('div', undefined, 'ocr-region-result'); regionPanel.hidden = true;
  const regionText = el('textarea'); regionText.className = 'ocr-region-text'; regionText.setAttribute('aria-label', 'Recognized area text'); regionText.setAttribute('translate', 'no'); regionText.maxLength = MAX_CHARS;
  const applyArea = button('Insert into checked text'); applyArea.classList.add('ocr-apply-area');
  regionPanel.append(el('p', 'Check the area result. In the page text above, place the cursor or select the text to replace, then insert.'), regionText, applyArea);
  editing.append(regionPanel);
  columns.append(original, editing);
  const footer = el('footer', undefined, 'ocr-review-footer'), summary = el('span'), use = button('Use checked text', 'primary'); use.classList.add('ocr-use'); footer.append(summary, use);
  dialog.append(header, filename, hint, nav, pdfNote, columns, footer); document.body.append(dialog);
  language.value = prefs.language; layout.value = prefs.psm;
  const lifecycle = new AbortController();
  let closed = false, busy = true, ready = false, generation = 0, worker = null, doc = null, previewBlob = null, url = null, index = 0, pages = [], operation = null;
  let region = null, selecting = false, dragStart = null;
  let resolveResult;
  const result = new Promise(resolve => { resolveResult = resolve; });
  const current = () => pages[index];
  const say = message => { status.textContent = message; };
  const makePage = () => ({text: '', loaded: false, confirmed: false, blank: false, source: 'unread', language: prefs.language, psm: prefs.psm});
  function controls() {
    const page = current(), confirmed = pages.filter(p => p.confirmed).length;
    recognize.disabled = !ready || busy; stopButton.disabled = !busy;
    recognizeArea.disabled = !ready || busy || !region;
    selectArea.disabled = clearArea.disabled = !ready || busy;
    coordinateFields.forEach(field => { field.disabled = !ready || busy; });
    regionText.disabled = busy; applyArea.disabled = busy || regionPanel.hidden || !regionText.value.trim();
    text.disabled = !ready || busy; blank.disabled = !ready || busy || Boolean(page?.text.trim());
    confirm.disabled = !ready || busy || !(page?.text.trim() || page?.blank);
    language.disabled = layout.disabled = busy; pageSelect.disabled = busy; reload.disabled = busy || !pages.length;
    use.disabled = busy || !pages.length || pages.some(p => !p.confirmed);
    summary.textContent = `${confirmed} of ${pages.length} pages checked`;
    count.textContent = pages.length ? `${index + 1} / ${pages.length}` : '';
    [...pageSelect.options].forEach((option, i) => { option.textContent = `${i + 1}${pages[i].confirmed ? ' — checked' : ''}`; });
  }
  function rememberRegion() {
    if (ready && current() && region) current().regionDraft = {region: {...region}, text: regionText.value, visible: !regionPanel.hidden};
  }
  function restoreRegion() {
    const draft = current()?.regionDraft;
    if (!draft) return;
    region = {...draft.region}; regionText.value = draft.text; regionPanel.hidden = !draft.visible;
    coordinateFields.forEach(field => { field.value = String(Math.round(region[field.dataset.coordinate] * 1000) / 10); });
    drawRegion();
  }
  function clearRegion() {
    region = null; dragStart = null; selecting = false; selectionBox.hidden = true;
    stage.classList.remove('selecting'); selectArea.setAttribute('aria-pressed', 'false');
    regionPanel.hidden = true; regionText.value = '';
    coordinateFields.forEach(field => { field.value = ['width', 'height'].includes(field.dataset.coordinate) ? '100' : '0'; });
  }
  function imageBounds() {
    const bounds = image.getBoundingClientRect();
    if (!image.naturalWidth || !image.naturalHeight || !bounds.width || !bounds.height) return null;
    const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    return {left: bounds.left + (bounds.width - width) / 2, top: bounds.top + (bounds.height - height) / 2, width, height};
  }
  function drawRegion() {
    const bounds = imageBounds(), parent = stage.getBoundingClientRect();
    selectionBox.hidden = !region || !bounds;
    if (!region || !bounds) return;
    Object.assign(selectionBox.style, {left: `${bounds.left - parent.left + region.x * bounds.width}px`, top: `${bounds.top - parent.top + region.y * bounds.height}px`, width: `${region.width * bounds.width}px`, height: `${region.height * bounds.height}px`});
  }
  function setRegion(value) {
    if (!value || !Object.values(value).every(Number.isFinite) || value.x < 0 || value.x >= 1 || value.y < 0 || value.y >= 1 || value.width <= 0 || value.height <= 0 || value.x + value.width > 1.000001 || value.y + value.height > 1.000001) {
      region = null; selectionBox.hidden = true; regionPanel.hidden = true; controls(); return false;
    }
    region = {...value, width: Math.min(value.width, 1 - value.x), height: Math.min(value.height, 1 - value.y)};
    const saved = current()?.regionDraft;
    const sameRegion = saved && ['x', 'y', 'width', 'height'].every(key => Math.abs(saved.region[key] - region[key]) < 1e-9);
    regionPanel.hidden = !(sameRegion && saved.visible); regionText.value = sameRegion ? saved.text : '';
    coordinateFields.forEach(field => { field.value = String(Math.round(region[field.dataset.coordinate] * 1000) / 10); });
    rememberRegion(); drawRegion(); controls(); return true;
  }
  function pointerPoint(event, clamp = false) {
    const bounds = imageBounds(); if (!bounds) return null;
    const x = (event.clientX - bounds.left) / bounds.width, y = (event.clientY - bounds.top) / bounds.height;
    if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return null;
    return {x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y))};
  }
  selectArea.addEventListener('click', () => {
    selecting = !selecting; stage.classList.toggle('selecting', selecting); selectArea.setAttribute('aria-pressed', String(selecting));
    say(selecting ? 'Drag over the original to select an area, or enter its coordinates.' : 'Area selection stopped.');
  });
  clearArea.addEventListener('click', () => { clearRegion(); if (current()) current().regionDraft = null; controls(); });
  coordinateFields.forEach(field => field.addEventListener('change', () => {
    const value = Object.fromEntries(coordinateFields.map(input => [input.dataset.coordinate, input.value === '' ? NaN : Number(input.value) / 100]));
    if (!setRegion(value)) say('Enter an area inside the page with a positive width and height.');
  }));
  stage.addEventListener('pointerdown', event => {
    if (!selecting || busy || event.button !== 0) return;
    dragStart = pointerPoint(event); if (!dragStart) return;
    event.preventDefault(); stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!dragStart || busy) return;
    const point = pointerPoint(event, true); if (!point) return;
    setRegion({x: Math.min(dragStart.x, point.x), y: Math.min(dragStart.y, point.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y)});
  });
  stage.addEventListener('pointerup', event => {
    if (!dragStart) return; dragStart = null;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    selecting = false; stage.classList.remove('selecting'); selectArea.setAttribute('aria-pressed', 'false');
    say(region ? 'Area selected. Recognize it to check a separate result.' : 'Select a larger area.');
  });
  stage.addEventListener('pointercancel', () => { dragStart = null; });
  image.addEventListener('load', drawRegion);
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(drawRegion) : null;
  resizeObserver?.observe(stage);
  regionText.addEventListener('input', () => { rememberRegion(); controls(); });
  applyArea.addEventListener('click', () => {
    if (busy || regionPanel.hidden || !regionText.value.trim()) return;
    const next = text.value.slice(0, text.selectionStart) + regionText.value + text.value.slice(text.selectionEnd);
    if (next.length > MAX_CHARS) { say('The combined page exceeds 500000 characters. Shorten it before inserting.'); return; }
    text.setRangeText(regionText.value, text.selectionStart, text.selectionEnd, 'end');
    current().text = text.value; current().blank = false; current().source = 'ocr'; blank.checked = false;
    regionPanel.hidden = true; regionText.value = ''; rememberRegion(); invalidate(); text.focus(); say('Area text inserted. Check and confirm this page again.');
  });
  async function areaBlob(selected, operationSignal) {
    if (doc) return (await doc.page(index + 1, {signal: operationSignal, region: selected})).blob;
    const bitmap = await createImageBitmap(previewBlob);
    try {
      operationSignal.throwIfAborted();
      const x = Math.floor(selected.x * bitmap.width), y = Math.floor(selected.y * bitmap.height);
      const width = Math.max(1, Math.min(bitmap.width - x, Math.ceil(selected.width * bitmap.width)));
      const height = Math.max(1, Math.min(bitmap.height - y, Math.ceil(selected.height * bitmap.height)));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      try {
        canvas.getContext('2d').drawImage(bitmap, x, y, width, height, 0, 0, width, height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        operationSignal.throwIfAborted(); if (!blob) throw new Error('Could not prepare the selected area.'); return blob;
      } finally { canvas.width = canvas.height = 0; }
    } finally { bitmap.close(); }
  }
  function clearPreview() {
    clearRegion();
    if (url) URL.revokeObjectURL(url);
    url = previewBlob = null; ready = false;
    image.hidden = full.hidden = true; image.removeAttribute('src'); full.removeAttribute('href');
  }
  function invalidate() { if (current()) current().confirmed = false; controls(); }
  async function stop() {
    generation++; operation?.abort(); operation = null;
    const oldWorker = worker; worker = null; busy = false;
    if (!closed && ready) restoreRegion();
    if (oldWorker) await oldWorker.terminate().catch(() => {});
  }
  function finish(value = null) {
    if (closed) return; closed = true; void stop(); lifecycle.abort();
    resizeObserver?.disconnect();
    void doc?.destroy().catch(() => {}); clearPreview(); signal?.removeEventListener('abort', abort);
    if (dialog.open) dialog.close(); dialog.remove();
    if (priorFocus?.isConnected) priorFocus.focus({preventScroll: true}); resolveResult(value);
  }
  const abort = () => finish(null);
  signal?.addEventListener('abort', abort, {once: true});
  close.addEventListener('click', () => finish(null));
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
  dialog.addEventListener('close', () => finish(null));
  async function showPage(next) {
    if (closed || !Number.isInteger(next) || next < 0 || next >= pages.length) return;
    rememberRegion();
    const pending = stop(), ticket = generation; index = next; busy = true; clearPreview();
    operation = new AbortController(); const pageSignal = operation.signal;
    text.value = ''; blank.checked = false; pageSelect.value = String(index); controls(); say(`Loading page ${index + 1}…`);
    await pending; if (closed || ticket !== generation) return;
    try {
      const data = doc ? await doc.page(index + 1, {signal: pageSignal}) : {blob: file, text: '', hasText: false};
      if (closed || ticket !== generation) return;
      const page = current();
      if (!page.loaded) { page.text = data.hasText ? data.text : ''; page.source = data.hasText ? 'text-layer' : 'ocr'; page.loaded = true; }
      previewBlob = data.blob;
      url = URL.createObjectURL(previewBlob); image.src = full.href = url; image.hidden = full.hidden = false;
      text.value = page.text; blank.checked = page.blank; language.value = page.language; layout.value = page.psm; ready = true; restoreRegion();
      say(page.confirmed ? 'Page already checked.' : data.textError || (page.source === 'text-layer' ? 'Text layer extracted. Check it against the original. Recognize this page if text is missing or wrong.' : 'Recognize this page, then check and confirm its text.'));
    } catch (error) { if (!closed && ticket === generation) say(`Could not load page: ${error.message}. Use Reload page to retry.`); }
    finally { if (!closed && ticket === generation) { busy = false; operation = null; controls(); } }
  }
  pageSelect.addEventListener('change', () => void showPage(Number(pageSelect.value)));
  reload.addEventListener('click', () => void showPage(index));
  async function runRecognition(areaOnly = false) {
    if (!ready || busy || closed) return;
    if (areaOnly && !region) return;
    const selected = region ? {...region} : null;
    if (!areaOnly) invalidate();
    rememberRegion(); regionPanel.hidden = true; busy = true; controls(); const ticket = ++generation, page = current();
    operation = new AbortController(); const operationSignal = operation.signal;
    say(areaOnly ? 'Preparing selected area…' : 'Loading recognition engine…');
    try {
      const input = areaOnly ? await areaBlob(selected, operationSignal) : previewBlob;
      operationSignal.throwIfAborted();
      const nextWorker = await makeWorker(page.language, message => { if (!closed && ticket === generation) say(`${message.status} ${Math.round((message.progress || 0) * 100)}%`); }, {psm: page.psm, signal: operationSignal});
      if (closed || ticket !== generation) { await nextWorker.terminate(); return; }
      worker = nextWorker; const {data} = await worker.recognize(input);
      if (closed || ticket !== generation) return;
      if (typeof data.text !== 'string' || data.text.length > MAX_CHARS) throw new Error('Recognized page exceeds 500000 characters. Use a smaller document.');
      if (areaOnly) {
        regionText.value = data.text; regionPanel.hidden = false; rememberRegion();
        say('Check the area result, then insert it at the cursor or replace selected page text.'); return;
      }
      page.text = data.text; page.blank = false; page.source = 'ocr'; text.value = page.text; blank.checked = false;
      restoreRegion();
      say('Check this text against the original, then confirm the page.');
    } catch (error) { if (!closed && ticket === generation) { restoreRegion(); say(`Recognition failed: ${error.message}`); } }
    finally {
      if (!closed && ticket === generation) {
        const oldWorker = worker; worker = null; if (oldWorker) await oldWorker.terminate().catch(() => {});
        if (!closed && ticket === generation) { busy = false; operation = null; controls(); }
      }
    }
  }
  recognize.addEventListener('click', () => void runRecognition());
  recognizeArea.addEventListener('click', () => void runRecognition(true));
  stopButton.addEventListener('click', async () => { const pending = stop(), ticket = generation; invalidate(); await pending; if (!closed && ticket === generation) { say(ready ? 'Recognition stopped. Check the text or recognize again.' : 'Loading stopped. Use Reload page or reopen this document.'); controls(); } });
  text.addEventListener('input', () => { if (!current()) return; current().text = text.value; current().blank = false; blank.checked = false; invalidate(); say('Text changed. Check and confirm this page again.'); });
  blank.addEventListener('change', () => { if (current()) current().blank = blank.checked; invalidate(); });
  for (const [control, key] of [[language, 'language'], [layout, 'psm']]) control.addEventListener('change', () => {
    prefs[key] = control.value; savePreferences(prefKey, prefs);
    for (const page of pages) if (page === current() || !page.loaded) page[key] = control.value;
    invalidate(); say('Setting saved. Recognize again if needed, then confirm this page.');
  });
  confirm.addEventListener('click', () => { if (!ready || busy || !(current()?.text.trim() || current()?.blank)) return; current().confirmed = true; say(`Page ${index + 1} checked.`); controls(); });
  use.addEventListener('click', () => {
    if (closed || busy) return;
    try { finish(reviewedOcrResult(pages, file.name)); } catch (error) { say(error.message); }
  });
  controls(); dialog.showModal(); close.focus();
  void (async () => {
    const ticket = ++generation;
    const opening = new AbortController(); operation = opening;
    lifecycle.signal.addEventListener('abort', () => opening.abort(), {once: true});
    try {
      if (isPdf) {
        const opened = await openPdf(file, {signal: opening.signal});
        if (closed || ticket !== generation) { await opened.destroy(); return; }
        doc = opened; pages = Array.from({length: doc.pageCount}, makePage);
      } else {
        const dimensions = await validateOcrImage(file, {signal: opening.signal});
        const bitmap = await createImageBitmap(file);
        const valid = bitmap.width * bitmap.height === dimensions.width * dimensions.height;
        bitmap.close(); opening.signal.throwIfAborted();
        if (!valid) throw new Error('Image dimensions do not match its header.');
        if (closed || ticket !== generation) return;
        pages = [makePage()];
      }
      pages.forEach((page, i) => { const option = el('option', String(i + 1)); option.value = String(i); pageSelect.append(option); });
      operation = null; busy = false; await showPage(0);
    } catch (error) { if (!closed && ticket === generation) { busy = false; say(`Cannot open document: ${error.message}`); controls(); } }
  })();
  return result;
}
