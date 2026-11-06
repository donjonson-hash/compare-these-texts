import {openPdf} from './ocr-pdf-input.mjs';
import {makeWorker} from './ocr-runtime.mjs';
import {validateOcrImage} from './ocr-image-input.mjs';
import {validateCheckedText} from './ocr-import.mjs';
import {enhanceOcrImage} from './ocr-enhance.mjs';
import {normalizeOcrLayout, validateOcrRegions, layoutText} from './ocr-layout.mjs';
import {createCorrectionOverlay} from './ocr-corrections.mjs';

const preferences = new Map();
const storageKey = side => 'ctt.ocr.preferences.' + side;

function readPreferences(side) {
  const defaults = {language: 'eng', psm: '3'};
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
  return {text, originalName, pages: pages.map(page => ({text: page.text, confirmed: true, blank: !!page.blank, source: page.source, language: page.language, psm: page.psm, regions: validateOcrRegions(page.regions || [])}))};
}

/** The caller receives no document text until the user confirms all pages. */
export async function reviewOcrFile(file, {side = 'left', signal, restoredPages, initialPage = 0} = {}) {
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
  const pageScroll = el('div', undefined, 'ocr-page-scroll');
  const stage = el('div', undefined, 'ocr-image-stage'), selectionBox = el('div', undefined, 'ocr-selection-box');
  const fragmentLayer = el('div', undefined, 'ocr-fragment-layer');
  const correctionLayer = el('div', undefined, 'ocr-correction-layer'); correctionLayer.setAttribute('aria-hidden', 'true');
  selectionBox.hidden = true; stage.append(image, correctionLayer, fragmentLayer, selectionBox); pageScroll.append(stage);
  const zoom = el('select'); zoom.className = 'ocr-zoom'; zoom.setAttribute('aria-label', 'Page zoom');
  for (const value of ['100', '150', '200']) { const option = el('option', value === '100' ? 'Fit width' : value + '%'); option.value = value; zoom.append(option); }
  zoom.addEventListener('change', () => { stage.style.width = zoom.value + '%'; drawRegion(); drawFragments(); });
  const selectArea = button('Select area'), clearArea = button('Clear area');
  selectArea.classList.add('ocr-select-area'); selectArea.setAttribute('aria-pressed', 'false');
  clearArea.classList.add('ocr-clear-area');
  const improve = button('Improve image'); improve.classList.add('ocr-improve');
  const areaTools = el('div', undefined, 'ocr-review-options'); areaTools.append(improve, selectArea, clearArea, zoom);
  const coordinates = el('details'), coordinateFields = [];
  coordinates.append(el('summary', 'Area coordinates (%)'));
  for (const [key, label] of [['x', 'Left'], ['y', 'Top'], ['width', 'Width'], ['height', 'Height']]) {
    const field = el('input'); field.type = 'number'; field.min = '0'; field.max = '100'; field.step = '0.1';
    field.value = ['width', 'height'].includes(key) ? '100' : '0'; field.dataset.coordinate = key;
    const labelNode = el('label', label + ' '); labelNode.append(field); coordinates.append(labelNode);
    coordinateFields.push(field);
  }
  original.append(areaTools, pageScroll, full, coordinates);
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
  const fragmentPanel = el('section', undefined, 'ocr-fragment-editor');
  const fragmentSelect = el('select'); fragmentSelect.className = 'ocr-fragment-select'; fragmentSelect.setAttribute('aria-label', 'Document fragment');
  const fragmentText = el('textarea'); fragmentText.className = 'ocr-fragment-text'; fragmentText.setAttribute('aria-label', 'Selected fragment text'); fragmentText.setAttribute('translate', 'no'); fragmentText.maxLength = MAX_CHARS;
  const fragmentHint = el('p', 'Recognize the page to select text directly on the original.', 'ocr-fragment-hint');
  const correctionLabel = el('label', undefined, 'ocr-visible-correction-label'), correctionCheck = el('input');
  correctionCheck.type = 'checkbox'; correctionCheck.className = 'ocr-visible-correction';
  correctionLabel.append(correctionCheck, document.createTextNode(' Show this correction on the page'));
  fragmentPanel.append(el('h3', 'Text at the selected position'), fragmentHint, fragmentSelect, fragmentText, correctionLabel);
  const plain = el('details', undefined, 'ocr-plain-text'); plain.open = true;
  plain.append(el('summary', 'Full page text (plain text)'), el('p', 'Editing the whole text removes its position links. Edit a selected fragment to keep the page layout.'), text);
  editing.append(options, el('small', 'Choose the document language. Translating the interface does not change OCR.'), status, fragmentPanel, plain, blankLabel, confirm);
  const regionPanel = el('div', undefined, 'ocr-region-result'); regionPanel.hidden = true;
  const regionText = el('textarea'); regionText.className = 'ocr-region-text'; regionText.setAttribute('aria-label', 'Recognized area text'); regionText.setAttribute('translate', 'no'); regionText.maxLength = MAX_CHARS;
  const attachArea = button('Use at this position'); attachArea.classList.add('ocr-attach-area');
  const applyArea = button('Insert into checked text'); applyArea.classList.add('ocr-apply-area');
  regionPanel.append(el('p', 'Check the area result. In the page text above, place the cursor or select the text to replace, then insert.'), regionText, attachArea, applyArea);
  editing.append(regionPanel);
  columns.append(original, editing);
  const footer = el('footer', undefined, 'ocr-review-footer'), summary = el('span'), use = button(side === 'single' ? 'Open reviewed document' : 'Use checked text', 'primary'); use.classList.add('ocr-use'); footer.append(summary, use);
  const enhancementPanel = el('section', undefined, 'ocr-enhancement-preview'); enhancementPanel.hidden = true;
  const enhancementHeading = el('h3', 'Preview improved image'); enhancementHeading.tabIndex = -1;
  const enhancementHint = el('p', 'Compare both images before recognizing. Processing can change small marks and digits. The original and your checked text stay available.');
  const enhancementImages = el('div', undefined, 'ocr-enhancement-images');
  const enhancementOptions = el('div', undefined, 'ocr-review-options');
  const enhancementPrepare = button('Prepare preview again'); enhancementPrepare.classList.add('ocr-enhance-prepare');
  const enhancementRecognize = button('Recognize improved image', 'primary'); enhancementRecognize.classList.add('ocr-enhance-recognize');
  const enhancementStop = button('Stop'); enhancementStop.classList.add('ocr-enhance-stop');
  const enhancementBack = button('Back to original'); enhancementBack.classList.add('ocr-enhance-discard');
  enhancementOptions.append(enhancementPrepare, enhancementRecognize, enhancementStop, enhancementBack);
  const enhancementStatus = el('p', '', 'ocr-enhancement-status'); enhancementStatus.setAttribute('role', 'status');
  const enhancementResult = el('div', undefined, 'ocr-enhancement-result'); enhancementResult.hidden = true;
  const enhancedText = el('textarea'); enhancedText.className = 'ocr-enhanced-text'; enhancedText.setAttribute('aria-label', 'Improved image recognized text'); enhancedText.setAttribute('translate', 'no'); enhancedText.setAttribute('spellcheck', 'false'); enhancedText.setAttribute('autocorrect', 'off'); enhancedText.setAttribute('autocapitalize', 'off'); enhancedText.maxLength = MAX_CHARS;
  const enhancementApply = button('Use this text for page', 'primary'); enhancementApply.classList.add('ocr-enhance-apply');
  const enhancementRestore = button('Restore previous draft'); enhancementRestore.classList.add('ocr-enhance-restore'); enhancementRestore.hidden = true;
  const enhancementResultActions = el('div', undefined, 'ocr-review-options'); enhancementResultActions.append(enhancementApply, enhancementRestore);
  enhancementResult.append(el('p', 'Check this new text against the original. Using it will replace this page’s checked text and require confirmation again.'), enhancedText, enhancementResultActions);
  enhancementPanel.append(enhancementHeading, enhancementHint, enhancementImages, enhancementOptions, enhancementStatus, enhancementResult);
  dialog.append(header, filename, hint, nav, pdfNote, enhancementPanel, columns, footer); document.body.append(dialog);
  language.value = prefs.language; layout.value = prefs.psm;
  const lifecycle = new AbortController();
  let closed = false, busy = true, ready = false, generation = 0, worker = null, doc = null, previewBlob = null, url = null, index = 0, pages = [], operation = null;
  let region = null, selecting = false, dragStart = null, selectedFragment = 0;
  let previewWidth = 0, previewHeight = 0;
  let enhancementOpen = false, enhancementReady = false, enhancedBlob = null, enhancedUrl = null, enhancedImage = null, enhancedFull = null;
  let resolveResult;
  const result = new Promise(resolve => { resolveResult = resolve; });
  const current = () => pages[index];
  const say = message => { status.textContent = message; if (enhancementOpen) enhancementStatus.textContent = message; };
  const makePage = () => ({text: '', loaded: false, confirmed: false, blank: false, source: 'unread', language: prefs.language, psm: prefs.psm, regions: []});
  function controls() {
    const page = current(), confirmed = pages.filter(p => p.confirmed).length;
    fragmentText.disabled = fragmentSelect.disabled = !ready || busy || enhancementOpen || !(page?.regions?.length);
    correctionCheck.disabled = fragmentText.disabled;
    correctionCheck.checked = page?.regions?.[selectedFragment]?.edited === true;
    correctionLabel.hidden = !(page?.regions?.length);
    fragmentLayer.inert = busy || enhancementOpen || selecting;
    attachArea.disabled = busy || enhancementOpen || regionPanel.hidden || !regionText.value.trim() || !region;
    recognize.disabled = !ready || busy || enhancementOpen; stopButton.disabled = !busy;
    improve.disabled = !ready || busy || enhancementOpen;
    recognizeArea.disabled = !ready || busy || enhancementOpen || !region;
    selectArea.disabled = clearArea.disabled = !ready || busy || enhancementOpen;
    coordinateFields.forEach(field => { field.disabled = !ready || busy || enhancementOpen; });
    regionText.disabled = busy || enhancementOpen; applyArea.disabled = busy || enhancementOpen || regionPanel.hidden || !regionText.value.trim();
    text.disabled = !ready || busy || enhancementOpen; blank.disabled = !ready || busy || enhancementOpen || Boolean(page?.text.trim());
    confirm.disabled = !ready || busy || enhancementOpen || !(page?.text.trim() || page?.blank);
    language.disabled = layout.disabled = busy || enhancementOpen; pageSelect.disabled = busy || enhancementOpen; reload.disabled = busy || enhancementOpen || !pages.length;
    use.disabled = busy || enhancementOpen || !pages.length || pages.some(p => !p.confirmed);
    columns.hidden = footer.hidden = enhancementOpen; nav.hidden = !isPdf || enhancementOpen;
    enhancementPanel.hidden = !enhancementOpen;
    enhancementPrepare.hidden = Boolean(enhancedBlob); enhancementPrepare.disabled = busy;
    enhancementRecognize.textContent = enhancementResult.hidden ? 'Recognize improved image' : 'Recognize again';
    enhancementRecognize.disabled = busy || !enhancedBlob || !enhancementReady; enhancementStop.disabled = !busy;
    enhancedText.disabled = busy; enhancementApply.disabled = busy || enhancementResult.hidden || !enhancedText.value.trim();
    enhancementRestore.hidden = !page?.previousEnhancedDraft; enhancementRestore.disabled = busy;
    summary.textContent = `${confirmed} of ${pages.length} pages checked`;
    count.textContent = pages.length ? `${index + 1} / ${pages.length}` : '';
    [...pageSelect.options].forEach((option, i) => { option.textContent = `${i + 1}${pages[i].confirmed ? ' — checked' : ''}`; });
  }
  function setPageLayout(page, data) {
    let regions = [];
    try {
      regions = normalizeOcrLayout(data, previewWidth, previewHeight);
      // Never discard text that the engine did not associate with a rectangle.
      if (layoutText(regions).replace(/\s/g, '') !== data.text.replace(/\s/g, '')) regions = [];
    } catch { regions = []; }
    page.regions = regions;
    page.text = regions.length ? layoutText(regions) : data.text;
  }
  function syncFragments() {
    const regions = current()?.regions || [];
    selectedFragment = Math.max(0, Math.min(selectedFragment, regions.length - 1));
    fragmentSelect.replaceChildren();
    regions.forEach((item, i) => { const option = el('option', `${i + 1}. ${item.text.slice(0, 65) || '(empty)'}`); option.value = String(i); fragmentSelect.append(option); });
    fragmentSelect.value = String(selectedFragment); fragmentText.value = regions[selectedFragment]?.text || '';
    fragmentSelect.hidden = fragmentText.hidden = !regions.length;
    fragmentHint.textContent = regions.length ? 'Edit a fragment to replace it with printed text on the page and in the corrected PDF. Untick the option below to keep the original image at this position. Open the full-size image to see the original.' : 'No position-linked text yet. Recognize this page, or select an area and use its text at that position.';
    plain.open = !regions.length;
    drawFragments(); controls();
  }
  function drawFragments() {
    fragmentLayer.replaceChildren(); correctionLayer.replaceChildren();
    correctionCheck.checked = current()?.regions?.[selectedFragment]?.edited === true;
    const bounds = imageBounds(), parent = stage.getBoundingClientRect();
    if (!bounds || !ready) return;
    Object.assign(correctionLayer.style, {left: `${bounds.left - parent.left}px`, top: `${bounds.top - parent.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`});
    try { correctionLayer.append(createCorrectionOverlay(current()?.regions || [], bounds.width, bounds.height, document)); }
    catch (error) { say(`Could not show the correction: ${error.message}`); }
    (current()?.regions || []).forEach((item, i) => {
      const box = button('', 'ocr-fragment-box'); box.classList.toggle('is-selected', i === selectedFragment);
      box.setAttribute('aria-label', `Fragment ${i + 1}: ${item.text.slice(0, 100) || 'empty'}`); box.setAttribute('aria-pressed', String(i === selectedFragment));
      Object.assign(box.style, {left: `${bounds.left - parent.left + item.x * bounds.width}px`, top: `${bounds.top - parent.top + item.y * bounds.height}px`, width: `${item.width * bounds.width}px`, height: `${item.height * bounds.height}px`});
      box.addEventListener('click', () => { if (busy || selecting) return; selectedFragment = i; fragmentSelect.value = String(i); fragmentText.value = item.text; drawFragments(); fragmentText.focus({preventScroll:true}); });
      fragmentLayer.append(box);
    });
  }
  fragmentSelect.addEventListener('change', () => {
    selectedFragment = Number(fragmentSelect.value); fragmentText.value = current()?.regions?.[selectedFragment]?.text || ''; drawFragments();
    fragmentLayer.children[selectedFragment]?.scrollIntoView?.({block:'nearest', inline:'nearest'});
  });
  fragmentText.addEventListener('input', () => {
    const page = current(), item = page?.regions?.[selectedFragment]; if (!item || busy) return;
    const old = item.text, wasEdited = item.edited; item.text = fragmentText.value; item.edited = true;
    let next;
    try { next = layoutText(page.regions); validateCheckedText(next); } catch (error) { item.text = old; if (wasEdited === undefined) delete item.edited; else item.edited = wasEdited; fragmentText.value = old; say(error.message); return; }
    page.text = text.value = next; page.blank = false; blank.checked = false;
    fragmentSelect.options[selectedFragment].textContent = `${selectedFragment + 1}. ${item.text.slice(0,65) || '(empty)'}`;
    invalidate(); say('Visible correction updated. Check the page preview and confirm this page again.'); drawFragments();
  });
  correctionCheck.addEventListener('change', () => {
    const item = current()?.regions?.[selectedFragment]; if (!item || busy || enhancementOpen) return;
    if (correctionCheck.checked) item.edited = true; else delete item.edited;
    invalidate(); say(correctionCheck.checked ? 'This fragment will appear as printed text in the corrected PDF. Confirm this page again.' : 'The original image is shown at this position; the checked text is still available for search and copy. Confirm this page again.');
    drawFragments();
  });
  attachArea.addEventListener('click', () => {
    if (attachArea.disabled) return;
    const page = current(), regions = page.regions || [];
    if (page.text.trim() && !regions.length) { say('This page has unlinked text. Recognize the full page first, or use Insert into checked text.'); return; }
    const intersects = item => item.x < region.x + region.width && item.x + item.width > region.x && item.y < region.y + region.height && item.y + item.height > region.y;
    const overlapping = regions.map((item,i) => intersects(item) ? i : -1).filter(i => i >= 0);
    if (overlapping.length > 1) { say('This area covers several fragments. Select one smaller area to replace a single fragment.'); return; }
    const next = regions.map(item => ({...item}));
    if (overlapping.length) {
      const previous = next[overlapping[0]], epsilon = 0.001;
      if (region.x > previous.x + epsilon || region.y > previous.y + epsilon || region.x + region.width < previous.x + previous.width - epsilon || region.y + region.height < previous.y + previous.height - epsilon) {
        say('The area covers only part of an existing fragment. Edit that fragment directly, or select its whole frame.'); return;
      }
      selectedFragment = overlapping[0]; next[selectedFragment].text = regionText.value; next[selectedFragment].edited = true;
    }
    else { selectedFragment = next.length; next.push({id: `line-${Math.max(0, ...next.map(item => Number(item.id.slice(5)))) + 1}`, ...region, text: regionText.value, edited:true}); }
    try { validateOcrRegions(next); validateCheckedText(layoutText(next)); } catch(error) { say(error.message); return; }
    page.regions = next; page.text = text.value = layoutText(next); page.blank = false; blank.checked = false; page.source = 'ocr';
    regionPanel.hidden = true; rememberRegion(); invalidate(); syncFragments(); say('Area text linked to its position. Check and confirm this page again.');
  });
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
    controls(); say(selecting ? 'Drag over the original to select an area, or enter its coordinates.' : 'Area selection stopped.');
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
    controls(); say(region ? 'Area selected. Recognize it to check a separate result.' : 'Select a larger area.');
  });
  stage.addEventListener('pointercancel', () => { dragStart = null; selecting = false; stage.classList.remove('selecting'); selectArea.setAttribute('aria-pressed', 'false'); controls(); });
  image.addEventListener('load', () => { drawRegion(); drawFragments(); });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { drawRegion(); drawFragments(); }) : null;
  resizeObserver?.observe(stage);
  regionText.addEventListener('input', () => { rememberRegion(); controls(); });
  applyArea.addEventListener('click', () => {
    if (busy || regionPanel.hidden || !regionText.value.trim()) return;
    const next = text.value.slice(0, text.selectionStart) + regionText.value + text.value.slice(text.selectionEnd);
    if (next.length > MAX_CHARS) { say('The combined page exceeds 500000 characters. Shorten it before inserting.'); return; }
    text.setRangeText(regionText.value, text.selectionStart, text.selectionEnd, 'end');
    current().regions = []; syncFragments(); current().text = text.value; current().blank = false; current().source = 'ocr'; blank.checked = false;
    regionPanel.hidden = true; regionText.value = ''; rememberRegion(); invalidate(); text.focus(); say('Area text inserted. Check and confirm this page again.');
  });
  async function imagePage(operationSignal) {
    // Browser rasterization applies EXIF consistently before both preview and OCR.
    // Keep the original file separately for byte-identical download.
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    try {
      operationSignal.throwIfAborted(); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Cannot display this image.');
      context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      operationSignal.throwIfAborted(); if (!blob) throw new Error('Could not prepare the image.');
      return {blob, width:canvas.width, height:canvas.height, text:'', hasText:false};
    } finally { bitmap.close(); canvas.width = canvas.height = 0; }
  }
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
  function clearProcessedEnhancement() {
    if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    enhancedBlob = enhancedUrl = null; enhancementReady = false;
    if (enhancedImage) { enhancedImage.hidden = true; enhancedImage.removeAttribute('src'); }
    if (enhancedFull) { enhancedFull.hidden = true; enhancedFull.removeAttribute('href'); }
  }
  function clearEnhancement() {
    clearProcessedEnhancement(); enhancedImage = enhancedFull = null;
    enhancementOpen = false; enhancementImages.replaceChildren();
    enhancementResult.hidden = true; enhancedText.value = ''; enhancementStatus.textContent = '';
  }
  function rememberEnhancedDraft() {
    if (enhancementOpen && current() && !enhancementResult.hidden) {
      current().enhancedDraft = {...current().enhancedDraft, text: enhancedText.value};
    }
  }
  function leaveEnhancement(message = 'Original image restored. Your checked text is unchanged.') {
    if (!enhancementOpen || closed) return;
    rememberEnhancedDraft(); void stop(); clearEnhancement(); controls(); drawRegion(); say(message); improve.focus();
  }
  function addEnhancementImages() {
    const originalFigure = el('figure'), enhancedFigure = el('figure');
    const originalImage = el('img'); originalImage.alt = 'Original page before image improvement'; originalImage.src = url;
    const originalFull = el('a', 'Open original full size'); originalFull.href = url; originalFull.target = '_blank'; originalFull.rel = 'noopener';
    enhancedImage = el('img'); enhancedImage.alt = 'Improved page preview'; enhancedImage.hidden = true;
    enhancedFull = el('a', 'Open improved image full size'); enhancedFull.target = '_blank'; enhancedFull.rel = 'noopener'; enhancedFull.hidden = true;
    originalFigure.append(el('figcaption', 'Original'), originalImage, originalFull);
    enhancedFigure.append(el('figcaption', 'Improved preview'), enhancedImage, enhancedFull);
    enhancementImages.replaceChildren(originalFigure, enhancedFigure);
  }
  async function prepareEnhancement() {
    if (!ready || busy || closed || !enhancementOpen || enhancedBlob) return;
    busy = true; const ticket = ++generation; operation = new AbortController(); const operationSignal = operation.signal;
    controls(); say('Preparing image preview…');
    try {
      const enhanced = await enhanceOcrImage(previewBlob, {signal: operationSignal});
      if (closed || ticket !== generation || !enhancementOpen) return;
      enhancedBlob = enhanced.blob; enhancedUrl = URL.createObjectURL(enhancedBlob);
      enhancedImage.src = enhancedFull.href = enhancedUrl; enhancedImage.hidden = enhancedFull.hidden = false;
      // Recognition stays disabled until the browser can actually display the preview.
      if (typeof enhancedImage.decode === 'function') await enhancedImage.decode();
      if (closed || ticket !== generation || !enhancementOpen) return;
      enhancementReady = true;
      say('Preview ready. Compare both images, then choose whether to recognize the improved image.');
    } catch (error) {
      if (!closed && ticket === generation && enhancementOpen) {
        clearProcessedEnhancement();
        say(`Could not improve image: ${error.message}. Your checked text is unchanged.`);
      }
    } finally {
      if (!closed && ticket === generation) { busy = false; operation = null; controls(); }
    }
  }
  improve.addEventListener('click', () => {
    if (!ready || busy || closed || enhancementOpen) return;
    rememberRegion(); selecting = false; dragStart = null; stage.classList.remove('selecting'); selectArea.setAttribute('aria-pressed', 'false');
    enhancementOpen = true; addEnhancementImages();
    const draft = current().enhancedDraft;
    enhancementResult.hidden = !draft; enhancedText.value = draft?.text || '';
    controls(); enhancementHeading.focus(); void prepareEnhancement();
  });
  enhancementPrepare.addEventListener('click', () => void prepareEnhancement());
  enhancementBack.addEventListener('click', () => leaveEnhancement());
  enhancedText.addEventListener('input', () => { rememberEnhancedDraft(); controls(); });
  enhancementStop.addEventListener('click', async () => {
    if (!enhancementOpen || !busy) return;
    const pending = stop(), ticket = generation;
    if (!enhancementReady) clearProcessedEnhancement();
    controls();
    say('Stopped. Your checked text and any saved draft are unchanged.');
    await pending; if (!closed && ticket === generation) controls();
  });
  enhancementRecognize.addEventListener('click', async () => {
    if (!enhancementOpen || !enhancedBlob || !enhancementReady || busy || closed) return;
    rememberEnhancedDraft(); busy = true; const ticket = ++generation, page = current(), input = enhancedBlob;
    operation = new AbortController(); const operationSignal = operation.signal;
    controls(); say('Recognizing the improved image…');
    try {
      const nextWorker = await makeWorker(page.language, message => {
        if (!closed && ticket === generation && enhancementOpen) say(`${message.status} ${Math.round((message.progress || 0) * 100)}%`);
      }, {psm: page.psm, signal: operationSignal});
      if (closed || ticket !== generation || !enhancementOpen) { await nextWorker.terminate(); return; }
      worker = nextWorker; const {data} = await worker.recognize(input);
      if (closed || ticket !== generation || !enhancementOpen) return;
      if (typeof data.text !== 'string' || data.text.length > MAX_CHARS) throw new Error('Recognized page exceeds 500000 characters. Use a smaller document.');
      page.previousEnhancedDraft = page.enhancedDraft ? {...page.enhancedDraft} : null;
      const draft = {}; setPageLayout(draft, data);
      page.enhancedDraft = {...draft, language: page.language, psm: page.psm};
      enhancedText.value = page.enhancedDraft.text; enhancementResult.hidden = false;
      say('New text is ready for review. Your checked page text has not changed.');
    } catch (error) {
      if (!closed && ticket === generation && enhancementOpen) say(`Recognition failed: ${error.message}. Your checked text and saved draft are unchanged.`);
    } finally {
      if (!closed && ticket === generation) {
        const oldWorker = worker; worker = null;
        if (oldWorker) await oldWorker.terminate().catch(() => {});
        if (!closed && ticket === generation) { busy = false; operation = null; controls(); }
      }
    }
  });
  enhancementRestore.addEventListener('click', () => {
    if (!enhancementOpen || busy || closed || !current()?.previousEnhancedDraft) return;
    const page = current(); page.enhancedDraft = page.previousEnhancedDraft; page.previousEnhancedDraft = null;
    enhancedText.value = page.enhancedDraft.text; enhancementResult.hidden = false;
    controls(); enhancedText.focus(); say('Previous draft restored. Your checked page text has not changed.');
  });
  enhancementApply.addEventListener('click', () => {
    if (!enhancementOpen || busy || closed || enhancementResult.hidden || !enhancedText.value.trim()) return;
    try { validateCheckedText(enhancedText.value); } catch (error) { say(error.message); return; }
    const page = current(); page.regions = page.enhancedDraft?.text === enhancedText.value && layoutText(page.enhancedDraft?.regions || []) === enhancedText.value ? validateOcrRegions(page.enhancedDraft.regions) : []; page.text = enhancedText.value; page.blank = false; page.source = 'ocr'; page.confirmed = false;
    text.value = page.text; blank.checked = false; page.enhancedDraft = page.previousEnhancedDraft = null;
    // Application is the only enhancement action that changes checked page text.
    void stop(); clearEnhancement(); syncFragments(); controls(); drawRegion(); (page.regions.length ? fragmentText : text).focus();
    say('Improved-image text applied. Check it against the original and confirm this page again.');
  });
  function clearPreview() {
    clearEnhancement(); clearRegion();
    if (url) URL.revokeObjectURL(url);
    url = previewBlob = null; ready = false; fragmentLayer.replaceChildren(); correctionLayer.replaceChildren(); previewWidth = previewHeight = 0;
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
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (enhancementOpen) leaveEnhancement(); else finish(null); });
  dialog.addEventListener('close', () => finish(null));
  async function showPage(next) {
    if (closed || enhancementOpen || !Number.isInteger(next) || next < 0 || next >= pages.length) return;
    rememberRegion();
    const pending = stop(), ticket = generation; index = next; busy = true; clearPreview();
    operation = new AbortController(); const pageSignal = operation.signal;
    text.value = ''; blank.checked = false; pageSelect.value = String(index); controls(); say(`Loading page ${index + 1}…`);
    await pending; if (closed || ticket !== generation) return;
    try {
      const data = doc ? await doc.page(index + 1, {signal: pageSignal}) : await imagePage(pageSignal);
      if (closed || ticket !== generation) return;
      const page = current();
      if (!page.loaded) { page.text = data.hasText ? data.text : ''; page.source = data.hasText ? 'text-layer' : 'ocr'; page.loaded = true; }
      previewBlob = data.blob; previewWidth = data.width || page.imageWidth || image.naturalWidth; previewHeight = data.height || page.imageHeight || image.naturalHeight;
      url = URL.createObjectURL(previewBlob); image.src = full.href = url; image.hidden = full.hidden = false;
      text.value = page.text; blank.checked = page.blank; language.value = page.language; layout.value = page.psm; ready = true; restoreRegion(); selectedFragment = 0; syncFragments();
      say(page.confirmed ? 'Page already checked.' : data.textError || (page.source === 'text-layer' ? 'Text layer extracted. Check it against the original. Recognize this page if text is missing or wrong.' : 'Recognize this page, then check and confirm its text.'));
    } catch (error) { if (!closed && ticket === generation) say(`Could not load page: ${error.message}. Use Reload page to retry.`); }
    finally { if (!closed && ticket === generation) { busy = false; operation = null; controls(); } }
  }
  pageSelect.addEventListener('change', () => void showPage(Number(pageSelect.value)));
  reload.addEventListener('click', () => void showPage(index));
  async function runRecognition(areaOnly = false) {
    if (!ready || busy || closed || enhancementOpen) return;
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
      setPageLayout(page, data); page.blank = false; page.source = 'ocr'; text.value = page.text; blank.checked = false;
      restoreRegion(); syncFragments();
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
  stopButton.addEventListener('click', async () => { if (enhancementOpen) { enhancementStop.click(); return; } const pending = stop(), ticket = generation; invalidate(); await pending; if (!closed && ticket === generation) { say(ready ? 'Recognition stopped. Check the text or recognize again.' : 'Loading stopped. Use Reload page or reopen this document.'); controls(); } });
  text.addEventListener('input', () => { if (!current()) return; current().text = text.value; current().regions = []; syncFragments(); current().blank = false; blank.checked = false; invalidate(); say('Text changed. Check and confirm this page again.'); });
  blank.addEventListener('change', () => { if (current()) current().blank = blank.checked; invalidate(); });
  for (const [control, key] of [[language, 'language'], [layout, 'psm']]) control.addEventListener('change', () => {
    if (enhancementOpen) { control.value = current()[key]; return; }
    prefs[key] = control.value; savePreferences(prefKey, prefs);
    for (const page of pages) if (page === current() || !page.loaded) page[key] = control.value;
    invalidate(); say('Setting saved. Recognize again if needed, then confirm this page.');
  });
  confirm.addEventListener('click', () => { if (!ready || busy || enhancementOpen || !(current()?.text.trim() || current()?.blank)) return; current().confirmed = true; say(`Page ${index + 1} checked.`); controls(); });
  use.addEventListener('click', () => {
    if (closed || busy || enhancementOpen) return;
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
        const imageWidth = bitmap.width, imageHeight = bitmap.height;
        const valid = imageWidth * imageHeight === dimensions.width * dimensions.height;
        bitmap.close(); opening.signal.throwIfAborted();
        if (!valid) throw new Error('Image dimensions do not match its header.');
        if (closed || ticket !== generation) return;
        pages = [{...makePage(), imageWidth, imageHeight}];
      }
      if (restoredPages !== undefined) {
        if (!Array.isArray(restoredPages) || restoredPages.length !== pages.length) throw new Error('Saved OCR pages do not match the document.');
        pages = pages.map((page, i) => {
          const saved = restoredPages[i]; validateCheckedText(saved.text);
          const regions = validateOcrRegions(saved.regions || []);
          if (regions.length && layoutText(regions) !== saved.text) throw new Error('Saved text does not match its page positions.');
          return {...page, text:saved.text, regions, loaded:true, confirmed:saved.confirmed === true, blank:!!saved.blank, source:saved.source || 'ocr', language:['eng','rus','rus+eng'].includes(saved.language)?saved.language:prefs.language, psm:['3','6'].includes(saved.psm)?saved.psm:prefs.psm};
        });
      }
      pages.forEach((page, i) => { const option = el('option', String(i + 1)); option.value = String(i); pageSelect.append(option); });
      operation = null; busy = false; await showPage(Number.isInteger(initialPage) && initialPage >= 0 && initialPage < pages.length ? initialPage : 0);
    } catch (error) { if (!closed && ticket === generation) { busy = false; say(`Cannot open document: ${error.message}`); controls(); } }
  })();
  return result;
}
