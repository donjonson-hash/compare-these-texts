import {openPdf} from './ocr-pdf-input.mjs';
import {validateOcrImage} from './ocr-image-input.mjs';
import {reviewOcrFile} from './ocr-review.mjs';
import {checkedTextFile} from './ocr-import.mjs';
import {ocrSourceBytes, validateOcrSnapshot} from './ocr-document-model.mjs';

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, className) => {
  const node = el('button', text, `button secondary ${className}`); node.type = 'button'; return node;
};

/** Keep the scan as the document. Reviewed text remains a separate, linked layer. */
export async function mountOcrDocumentEditor(root, {source, restoredState, signal, onStateChange = () => {}}) {
  const bytes = ocrSourceBytes(source), pdf = /\.pdf$/i.test(source.name);
  const file = new File([bytes], source.name, {type: pdf ? 'application/pdf' : /\.png$/i.test(source.name) ? 'image/png' : 'image/jpeg'});
  let state = validateOcrSnapshot(restoredState), doc = null, disposed = false, busy = false, generation = 0, url = null;
  let selected = null, operation = null;
  const lifecycle = new AbortController(), downloads = new Set(), timers = new Set();
  const abort = () => dispose();
  if (signal?.aborted) throw new DOMException('Document closed.', 'AbortError');
  signal?.addEventListener('abort', abort, {once: true});
  const host = el('section', undefined, 'ocr-document');
  host.setAttribute('aria-label', 'Original document with checked OCR');
  const toolbar = el('div', undefined, 'ocr-document-toolbar');
  const page = el('select'); page.className = 'ocr-document-page'; page.setAttribute('aria-label', 'Document page');
  state.pages.forEach((_, index) => { const option = el('option', `Page ${index + 1} of ${state.pages.length}`); option.value = String(index); page.append(option); });
  const zoom = el('select'); zoom.setAttribute('aria-label', 'Document zoom');
  for (const [value, label] of [['100', 'Fit width'], ['150', '150%'], ['200', '200%']]) { const option = el('option', label); option.value = value; zoom.append(option); }
  const review = button('Review text', 'ocr-document-review');
  const original = button('Download original', 'ocr-document-original');
  const downloadText = button('Download checked text', 'ocr-document-text-download');
  toolbar.append(page, zoom, review, original, downloadText);
  const status = el('p', '', 'ocr-document-status'); status.setAttribute('role', 'status');
  const layout = el('div', undefined, 'ocr-document-layout');
  const scroll = el('div', undefined, 'ocr-document-scroll');
  const stage = el('div', undefined, 'ocr-document-stage'), image = el('img'), boxes = el('div', undefined, 'ocr-document-boxes');
  image.alt = 'Original document page'; image.hidden = true;
  stage.append(image, boxes); scroll.append(stage);
  const detail = el('aside', undefined, 'ocr-document-detail');
  const selectedTitle = el('h3', 'Checked text'), selectedText = el('p', '', 'ocr-document-selected-text'); selectedText.setAttribute('translate', 'no');
  const allText = el('details'), allTextContent = el('pre'); allTextContent.setAttribute('translate', 'no');
  allText.append(el('summary', 'All checked text on this page'), allTextContent);
  detail.append(selectedTitle, selectedText, allText);
  layout.append(scroll, detail);
  host.append(toolbar, el('p', 'Original scan with checked text linked to its location. Select a marked fragment to read it; use Review text to make corrections.', 'ocr-document-hint'), status, layout);
  root.replaceChildren(host);
  const current = () => state.pages[state.currentPage];
  function controls() {
    page.disabled = review.disabled = busy || disposed;
    downloadText.disabled = disposed;
    original.disabled = disposed;
    for (const node of boxes.children) node.disabled = busy || disposed;
  }
  function drawBoxes() {
    boxes.replaceChildren(); selected = null;
    selectedTitle.textContent = 'Checked text';
    selectedText.textContent = current().regions.length ? 'Select a marked fragment on the page.' : 'This page has no text locations. Open All checked text, or use Review text to recognize the page with locations.';
    allTextContent.textContent = current().text;
    for (const [index, region] of current().regions.entries()) {
      const box = el('button', undefined, 'ocr-document-region'); box.type = 'button';
      box.setAttribute('aria-label', `Text fragment ${index + 1}: ${region.text.slice(0, 120)}`); box.setAttribute('aria-pressed', 'false');
      Object.assign(box.style, {left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%`});
      box.addEventListener('click', () => {
        if (busy || disposed) return;
        selected?.setAttribute('aria-pressed', 'false'); selected = box; box.setAttribute('aria-pressed', 'true');
        selectedTitle.textContent = `Text fragment ${index + 1}`; selectedText.textContent = region.text;
      });
      boxes.append(box);
    }
  }
  function releaseImage() {
    if (url) URL.revokeObjectURL(url);
    url = null; image.hidden = true; image.removeAttribute('src'); boxes.replaceChildren();
  }
  async function showPage(index, persist = false, rejectFailure = false) {
    if (disposed || !Number.isInteger(index) || index < 0 || index >= state.pages.length) return;
    operation?.abort(); operation = new AbortController();
    const ticket = ++generation; busy = true; state.currentPage = index; page.value = String(index); releaseImage(); controls();
    status.textContent = `Opening page ${index + 1}…`;
    try {
      const data = doc ? await doc.page(index + 1, {signal: operation.signal}) : {blob: file};
      if (disposed || ticket !== generation) return;
      url = URL.createObjectURL(data.blob); image.src = url;
      if (typeof image.decode === 'function') await image.decode();
      if (disposed || ticket !== generation) return;
      image.hidden = false; drawBoxes();
      status.textContent = `Page ${index + 1} of ${state.pages.length} · checked`;
      scroll.scrollTop = scroll.scrollLeft = 0;
      if (persist) onStateChange();
    } catch (error) {
      if (!disposed && ticket === generation) { releaseImage(); status.textContent = `Could not display this page: ${error.message}`; }
      if (rejectFailure) throw error;
    } finally { if (!disposed && ticket === generation) { busy = false; operation = null; controls(); } }
  }
  function download(blob, name) {
    const href = URL.createObjectURL(blob); downloads.add(href);
    const anchor = el('a'); anchor.href = href; anchor.download = name; anchor.click();
    const timer = setTimeout(() => { URL.revokeObjectURL(href); downloads.delete(href); timers.delete(timer); }, 1000); timers.add(timer);
  }
  page.addEventListener('change', () => { if (!busy) void showPage(Number(page.value), true); });
  zoom.addEventListener('change', () => { stage.style.width = zoom.value + '%'; });
  original.addEventListener('click', () => { if (!disposed) download(file, file.name); });
  downloadText.addEventListener('click', () => {
    if (disposed) return;
    try { const checked = checkedTextFile({originalName: source.name, pages: state.pages, text: state.pages.map(item => item.text).join('\n\n')}); download(checked, checked.name); }
    catch (error) { status.textContent = error.message; }
  });
  review.addEventListener('click', async () => {
    if (busy || disposed) return;
    busy = true; controls();
    try {
      const result = await reviewOcrFile(file, {side: 'single', signal: lifecycle.signal, restoredPages: structuredClone(state.pages), initialPage: state.currentPage});
      if (disposed) return;
      if (result) {
        state = validateOcrSnapshot({version: 1, kind: 'ocr', pages: result.pages, currentPage: state.currentPage});
        onStateChange(); await showPage(state.currentPage);
      }
    } catch (error) { if (!disposed) status.textContent = `Could not review this document: ${error.message}`; }
    finally { if (!disposed) { busy = false; controls(); } }
  });
  function dispose() {
    if (disposed) return;
    disposed = true; generation++; lifecycle.abort(); operation?.abort();
    signal?.removeEventListener('abort', abort); releaseImage();
    for (const timer of timers) clearTimeout(timer);
    for (const href of downloads) URL.revokeObjectURL(href);
    timers.clear(); downloads.clear(); void doc?.destroy().catch(() => {});
  }
  try {
    if (pdf) {
      const opened = await openPdf(file, {signal: lifecycle.signal});
      if (disposed) { await opened.destroy().catch(() => {}); throw new DOMException('Document closed.', 'AbortError'); }
      doc = opened;
      if (doc.pageCount !== state.pages.length) throw new Error('The saved OCR pages do not match this document.');
    } else { await validateOcrImage(file, {signal: lifecycle.signal}); if (state.pages.length !== 1) throw new Error('An image must have one reviewed page.'); }
    if (disposed) throw new DOMException('Document closed.', 'AbortError');
    await showPage(state.currentPage, false, true);
    if (disposed) throw new DOMException('Document closed.', 'AbortError');
    return {snapshot: () => structuredClone(state), dispose, get changed() { return true; }, restoreViewport() {}};
  } catch (error) { dispose(); throw error; }
}
