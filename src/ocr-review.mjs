import {openPdf} from './ocr-pdf-input.mjs';
import {makeWorker} from './ocr-runtime.mjs';

const preferences = new Map();
const storageKey = side => 'ctt.ocr.preferences.' + side;

function readPreferences(side) {
  const defaults = {language: 'eng', psm: '6'};
  let saved = preferences.get(side);
  if (!saved) {
    try { saved = JSON.parse(localStorage.getItem(storageKey(side))); } catch {}
  }
  return {
    language: ['eng', 'rus'].includes(saved?.language) ? saved.language : defaults.language,
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
const MAX_CHARS = 500000, MAX_BYTES = 2 * 1024 * 1024;
export function reviewedOcrResult(pages, originalName) {
  if (!pages.length || pages.some(page => !page.loaded || !page.confirmed || (!page.text.trim() && !page.blank))) {
    throw new Error('Check and confirm every page before using its text.');
  }
  const text = pages.map(page => page.text).join('\n\n');
  if (text.length > MAX_CHARS || new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error('The checked text is too large. Use a document with at most 500000 characters and 2 MiB of text.');
  }
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
  original.append(image, full);
  const editing = el('div', undefined, 'ocr-review-editing'), options = el('div', undefined, 'ocr-review-options');
  const language = el('select'); language.className = 'ocr-language'; language.setAttribute('translate', 'no');
  for (const [value, label] of [['eng', 'English (eng)'], ['rus', 'Русский (rus)']]) { const option = el('option', label); option.value = value; language.append(option); }
  const langLabel = el('label', 'OCR language '); langLabel.append(language);
  const layout = el('select'); layout.className = 'ocr-layout';
  for (const [value, label] of [['6', 'Single text block'], ['3', 'Automatic layout']]) { const option = el('option', label); option.value = value; layout.append(option); }
  const layoutLabel = el('label', 'Layout '); layoutLabel.append(layout);
  const recognize = button('Recognize page'), stopButton = button('Stop'); recognize.classList.add('ocr-recognize'); stopButton.classList.add('ocr-stop');
  options.append(langLabel, layoutLabel, recognize, stopButton);
  const status = el('p', 'Opening document…', 'ocr-status'); status.setAttribute('role', 'status');
  const text = el('textarea'); text.className = 'ocr-text'; text.setAttribute('aria-label', 'Checked page text'); text.setAttribute('translate', 'no'); text.setAttribute('spellcheck', 'false'); text.setAttribute('autocorrect', 'off'); text.setAttribute('autocapitalize', 'off'); text.maxLength = MAX_CHARS;
  const blankLabel = el('label', undefined, 'ocr-blank-label'), blank = el('input'); blank.type = 'checkbox'; blank.className = 'ocr-blank'; blankLabel.append(blank, document.createTextNode(' I checked: this page has no text to compare'));
  const confirm = button('Confirm page'); confirm.classList.add('ocr-confirm');
  editing.append(options, el('small', 'Choose the document language. Translating the interface does not change OCR.'), status, text, blankLabel, confirm);
  columns.append(original, editing);
  const footer = el('footer', undefined, 'ocr-review-footer'), summary = el('span'), use = button('Use checked text', 'primary'); use.classList.add('ocr-use'); footer.append(summary, use);
  dialog.append(header, filename, hint, nav, pdfNote, columns, footer); document.body.append(dialog);
  language.value = prefs.language; layout.value = prefs.psm;
  const lifecycle = new AbortController();
  let closed = false, busy = true, ready = false, generation = 0, worker = null, doc = null, previewBlob = null, url = null, index = 0, pages = [], operation = null;
  let resolveResult;
  const result = new Promise(resolve => { resolveResult = resolve; });
  const current = () => pages[index];
  const say = message => { status.textContent = message; };
  const makePage = () => ({text: '', loaded: false, confirmed: false, blank: false, source: 'unread', language: prefs.language, psm: prefs.psm});
  function controls() {
    const page = current(), confirmed = pages.filter(p => p.confirmed).length;
    recognize.disabled = !ready || busy; stopButton.disabled = !busy;
    text.disabled = !ready || busy; blank.disabled = !ready || busy || Boolean(page?.text.trim());
    confirm.disabled = !ready || busy || !(page?.text.trim() || page?.blank);
    language.disabled = layout.disabled = busy; pageSelect.disabled = busy; reload.disabled = busy || !pages.length;
    use.disabled = busy || !pages.length || pages.some(p => !p.confirmed);
    summary.textContent = `${confirmed} of ${pages.length} pages checked`;
    count.textContent = pages.length ? `${index + 1} / ${pages.length}` : '';
    [...pageSelect.options].forEach((option, i) => { option.textContent = `${i + 1}${pages[i].confirmed ? ' — checked' : ''}`; });
  }
  function clearPreview() {
    if (url) URL.revokeObjectURL(url);
    url = previewBlob = null; ready = false;
    image.hidden = full.hidden = true; image.removeAttribute('src'); full.removeAttribute('href');
  }
  function invalidate() { if (current()) current().confirmed = false; controls(); }
  async function stop() {
    generation++; operation?.abort(); operation = null;
    const oldWorker = worker; worker = null; busy = false;
    if (oldWorker) await oldWorker.terminate().catch(() => {});
  }
  function finish(value = null) {
    if (closed) return; closed = true; void stop(); lifecycle.abort();
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
      text.value = page.text; blank.checked = page.blank; language.value = page.language; layout.value = page.psm; ready = true;
      say(page.confirmed ? 'Page already checked.' : data.textError || (page.source === 'text-layer' ? 'Text layer extracted. Check it against the original. Recognize this page if text is missing or wrong.' : 'Recognize this page, then check and confirm its text.'));
    } catch (error) { if (!closed && ticket === generation) say(`Could not load page: ${error.message}. Use Reload page to retry.`); }
    finally { if (!closed && ticket === generation) { busy = false; operation = null; controls(); } }
  }
  pageSelect.addEventListener('change', () => void showPage(Number(pageSelect.value)));
  reload.addEventListener('click', () => void showPage(index));
  recognize.addEventListener('click', async () => {
    if (!ready || busy || closed) return;
    invalidate(); busy = true; controls(); const ticket = ++generation, page = current();
    try {
      const nextWorker = await makeWorker(page.language, message => { if (!closed && ticket === generation) say(`${message.status} ${Math.round((message.progress || 0) * 100)}%`); }, {psm: page.psm});
      if (closed || ticket !== generation) { await nextWorker.terminate(); return; }
      worker = nextWorker; const {data} = await worker.recognize(previewBlob);
      if (closed || ticket !== generation) return;
      if (typeof data.text !== 'string' || data.text.length > MAX_CHARS) throw new Error('Recognized page exceeds 500000 characters. Use a smaller document.');
      page.text = data.text; page.blank = false; page.source = 'ocr'; text.value = page.text; blank.checked = false;
      say('Check this text against the original, then confirm the page.');
    } catch (error) { if (!closed && ticket === generation) say(`Recognition failed: ${error.message}`); }
    finally {
      if (!closed && ticket === generation) {
        const oldWorker = worker; worker = null; if (oldWorker) await oldWorker.terminate().catch(() => {});
        if (!closed && ticket === generation) { busy = false; controls(); }
      }
    }
  });
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
    try {
      if (isPdf) {
        const opened = await openPdf(file, {signal: lifecycle.signal});
        if (closed || ticket !== generation) { await opened.destroy(); return; }
        doc = opened; pages = Array.from({length: doc.pageCount}, makePage);
      } else {
        const bitmap = await createImageBitmap(file), pixels = bitmap.width * bitmap.height; bitmap.close();
        if (closed || ticket !== generation) return;
        if (!Number.isFinite(pixels) || pixels <= 0 || pixels > 12000000) throw new Error('Image exceeds 12 million pixels. Use a smaller image.');
        pages = [makePage()];
      }
      pages.forEach((page, i) => { const option = el('option', String(i + 1)); option.value = String(i); pageSelect.append(option); });
      busy = false; await showPage(0);
    } catch (error) { if (!closed && ticket === generation) { busy = false; say(`Cannot open document: ${error.message}`); controls(); } }
  })();
  return result;
}
