/** Read-only views of the original PDF bytes and the parsed DOCX structure. */
const SIDES = ['original', 'revised'];
const SOURCE_SIDE = {original: 'left', revised: 'right'};
const LABEL = {original: 'A · Исходный документ', revised: 'B · Новая версия'};
const KIND = {replace: 'Замена', insert: 'Добавление', delete: 'Удаление', move: 'Перемещение', reflow: 'Изменение структуры'};
const STYLE_KEYS = ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textDecoration', 'color', 'backgroundColor', 'textAlign', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'paddingLeft', 'paddingRight', 'textIndent', 'lineHeight', 'width', 'verticalAlign', 'paddingTop', 'paddingBottom', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function style(node, values = {}) {
  // These values come from the existing bounded DOCX parser, never raw XML CSS.
  for (const key of STYLE_KEYS) if (values[key] !== undefined) node.style[key] = values[key];
}
function button(text, title, action) {
  const node = el('button', 'ctt-doc-button', text);
  node.type = 'button'; node.title = title; node.setAttribute('aria-label', title);
  node.addEventListener('click', action);
  return node;
}
function parts(block) { return block ? block.source_blocks || [block] : []; }
function location(value) {
  return String(value || '').replace(/Paragraph /g, 'абзац ').replace(/Table /g, 'таблица ').replace(/Page /g, 'страница ').replace(/Line /g, 'строка ').replace(/\bline /g, 'строка ').replace(/\brow /g, 'строка таблицы ').replace(/\bcolumn /g, 'столбец ').replace(/\bparagraph /g, 'абзац ');
}
function pdfRects(block) {
  return parts(block).flatMap(part => {
    const visual = part?.visual;
    if (!(visual?.width > 0) || !(visual.height > 0)) return [];
    return (visual.rects || []).map(rect => ({page: visual.page, x: rect.x / visual.width, y: rect.y / visual.height, width: rect.width / visual.width, height: rect.height / visual.height}));
  });
}
async function openReadOnlyPdf(source, signal) {
  // Keep the same local reader and rendering policy as openPdfVisual, without
  // importing PDF editing, font embedding, and color-emoji export dependencies.
  const {getDocument} = await import('../src/pdf-reader.mjs');
  if (signal.aborted) throw new DOMException('Открытие отменено.', 'AbortError');
  if (typeof source?.data !== 'string' || source.data.length > Math.ceil(2 * 1024 * 1024 / 3) * 4) throw new Error('Поддерживаются PDF до 2 МиБ.');
  const data = Uint8Array.from(atob(source.data), value => value.charCodeAt(0));
  if (!data.length || data.length > 2 * 1024 * 1024) throw new Error('Поддерживаются PDF до 2 МиБ.');
  class NoExternalData { async fetch() { throw new Error('PDF требует внешние шрифты или данные.'); } }
  const loading = getDocument({data, stopAtErrors: true, isEvalSupported: false,
    disableFontFace: true, useSystemFonts: false, useWorkerFetch: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false,
    useWasm: false, enableXfa: false, disableAutoFetch: true,
    disableStream: true, disableRange: true, verbosity: 0, BinaryDataFactory: NoExternalData});
  const tasks = new Set(); let disposed = false;
  async function dispose() {
    if (disposed) return; disposed = true; signal.removeEventListener('abort', cancel);
    for (const task of tasks) task.cancel();
    await loading.destroy();
  }
  const cancel = () => { void dispose().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once: true});
  try {
    const pdf = await loading.promise;
    if (disposed || signal.aborted) throw new DOMException('Открытие отменено.', 'AbortError');
    if (pdf.numPages < 1 || pdf.numPages > 100) throw new Error('Поддерживаются PDF до 100 страниц.');
    return {pageCount: pdf.numPages, rects: pdfRects, dispose,
      async renderPage(number, canvas, {scale = 1.5} = {}) {
        if (disposed || signal.aborted) throw new DOMException('Отображение отменено.', 'AbortError');
        if (!Number.isInteger(number) || number < 1 || number > pdf.numPages) throw new Error('Страница не найдена.');
        const page = await pdf.getPage(number);
        try {
          const viewport = page.getViewport({scale});
          if (!(viewport.width > 0) || !(viewport.height > 0) || viewport.width * viewport.height > 16_000_000) throw new Error('Страница слишком большая для просмотра.');
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          const task = page.render({canvasContext: canvas.getContext('2d'), viewport, background: 'rgb(255,255,255)', annotationMode: 0});
          tasks.add(task);
          try { await task.promise; }
          finally { tasks.delete(task); }
          if (disposed || signal.aborted) throw new DOMException('Отображение отменено.', 'AbortError');
          return {width: viewport.width / scale, height: viewport.height / scale};
        } finally { page.cleanup(); }
      },
    };
  } catch (error) { await dispose().catch(() => {}); throw error; }
}
function changedRanges(segments = []) {
  let offset = 0;
  return segments.flatMap(segment => {
    const start = offset; offset += segment.text.length;
    return segment.changed && offset > start ? [{start, end: offset}] : [];
  });
}
function recordAnchors(changes, side) {
  const records = new Map();
  for (const change of changes) {
    const ranges = changedRanges(change.segments?.[side]);
    let offset = 0;
    for (const block of parts(change[side])) {
      const length = block.text?.length || 0;
      const localRanges = ranges.map(range => ({start: Math.max(0, range.start - offset), end: Math.min(length, range.end - offset)})).filter(range => range.end > range.start);
      const entry = {change, ranges: localRanges};
      if (!records.has(block.record)) records.set(block.record, []);
      records.get(block.record).push(entry);
      offset += length + 1; // The engine joins source_blocks with one LF.
    }
  }
  return records;
}

/**
 * snapshot is compareDocuments()'s immutable full snapshot, including sources.
 * Callbacks receive the exact change ID. No source bytes or model are modified.
 * focusChange() returns a promise once the relevant PDF pages have rendered.
 */
export async function mountDocumentComparison({root, snapshot, onSelect = () => {}, onExplain = () => {}}) {
  if (!root?.replaceChildren || !snapshot?.documents || !snapshot?.sources || !Array.isArray(snapshot.changes)) throw new TypeError('Нужен полный результат сравнения документов.');
  const byId = new Map(snapshot.changes.map(change => [change.id, change]));
  const aborter = new AbortController();
  const ui = {}, viewers = {}, anchors = {}, queued = {}, renderVersion = {};
  let destroyed = false, selectedId = null, selectionVersion = 0;
  root.replaceChildren(); root.classList.add('ctt-document-comparison');
  const shell = el('div', 'ctt-doc-shell');
  const selection = el('div', 'ctt-doc-selection');
  const selectionText = el('p', '', 'Выберите подсвеченный фрагмент или правку в списке.');
  const explain = button('Объяснить правку', 'Объяснить выбранное изменение', () => { if (!destroyed && selectedId) onExplain(selectedId); });
  explain.disabled = true; selection.append(selectionText, explain);
  const columns = el('div', 'ctt-doc-columns'); shell.append(selection, columns); root.append(shell);

  function updateSelected() {
    for (const node of shell.querySelectorAll('[data-document-change]')) {
      const active = node.dataset.documentChange === selectedId;
      node.classList.toggle('is-active', active);
      if (node.matches('button')) node.setAttribute('aria-pressed', String(active));
    }
  }
  function choose(id) {
    if (destroyed || !byId.has(id)) return;
    void focusChange(id);
    onSelect(id);
  }
  function anchorButton(change, text = 'Правка') {
    const node = button(text, `${KIND[change.kind] || 'Изменение'}: ${change.id}`, () => choose(change.id));
    node.classList.add('ctt-doc-anchor'); node.dataset.documentChange = change.id;
    return node;
  }
  function appendText(parent, text, offset, entries) {
    const stops = new Set([0, text.length]);
    for (const entry of entries) for (const range of entry.ranges) {
      if (range.start < offset + text.length && range.end > offset) {
        stops.add(Math.max(0, range.start - offset)); stops.add(Math.min(text.length, range.end - offset));
      }
    }
    const edges = [...stops].sort((a, b) => a - b);
    for (let index = 0; index < edges.length - 1; index++) {
      const start = edges[index], end = edges[index + 1];
      const match = entries.find(entry => entry.ranges.some(range => range.start < offset + end && range.end > offset + start));
      if (!match) { parent.append(document.createTextNode(text.slice(start, end))); continue; }
      const mark = el('mark', 'ctt-doc-inline-change', text.slice(start, end));
      mark.dataset.documentChange = match.change.id;
      mark.title = KIND[match.change.kind] || 'Изменение';
      mark.addEventListener('click', () => choose(match.change.id));
      parent.append(mark);
    }
  }
  function paragraph(entry, side, {peripheral = false} = {}) {
    const node = el(entry.heading ? `h${entry.heading}` : 'p', 'ctt-doc-paragraph');
    node.dir = 'auto'; node.setAttribute('translate', 'no'); style(node, entry.style);
    const entries = peripheral ? [] : anchors[side].get(entry.record) || [];
    if (entry.pageBreakBefore) node.classList.add('ctt-doc-page-break');
    if (entries.length) {
      node.classList.add('ctt-doc-changed-paragraph'); node.dataset.record = String(entry.record);
      const badges = el('span', 'ctt-doc-badges');
      for (const {change} of entries) badges.append(anchorButton(change, '↗'));
      node.append(badges);
    }
    let content = node;
    if (entry.list) {
      const list = entry.list, marker = el('span', 'ctt-doc-list-marker', list.label);
      content = el('span', 'ctt-doc-list-content');
      node.classList.add('ctt-doc-list-item'); node.dataset.listLevel = String(list.level);
      const hanging = Math.max(0, list.indent?.hanging ?? 18);
      const left = Math.max(0, list.indent?.left ?? (list.level + 1) * 36);
      node.style.paddingLeft = `${Math.max(0, left - hanging)}pt`; node.style.textIndent = '0';
      marker.style.minWidth = `${list.suffix === 'tab' ? hanging : 0}pt`;
      marker.style.textAlign = list.align || 'left';
      if (list.fontFamily) marker.style.fontFamily = list.fontFamily;
      style(marker, list.markerStyle); node.append(marker, content);
    }
    if (entry.runs) {
      // Apply inline offsets only if visible runs represent the exact engine text.
      const runsText = entry.runs.map(run => run.text || '').join('');
      const exactEntries = runsText === (entry.text ?? runsText) ? entries : [];
      let offset = 0;
      for (const run of entry.runs) {
        if (run.image) {
          const image = el('img', 'ctt-doc-image'); image.src = run.image.src;
          image.alt = run.image.alt || ''; image.width = run.image.width; image.height = run.image.height;
          content.append(image);
        } else {
          const span = el('span'); style(span, run.style);
          if (run.field) span.textContent = '[номер страницы]';
          else appendText(span, run.text || '', offset, exactEntries);
          content.append(span); offset += (run.text || '').length;
        }
      }
    } else appendText(content, entry.text || '', 0, entries);
    for (const rule of entry.horizontalRules || []) {
      const line = el('hr', 'ctt-doc-rule');
      line.style.borderTop = `${rule.height}pt solid ${rule.color}`;
      if (rule.width) line.style.width = `min(100%, ${rule.width}pt)`;
      line.style.marginLeft = rule.align === 'left' ? '0' : 'auto';
      line.style.marginRight = rule.align === 'right' ? '0' : 'auto'; content.append(line);
    }
    if (!content.hasChildNodes()) content.append(el('br'));
    return node;
  }
  function renderDocx(model, side) {
    const view = ui[side];
    const paper = el('div', 'ctt-doc-word-paper');
    paper.style.maxWidth = `${model.page.width}px`;
    paper.style.paddingLeft = `${Math.min(30, model.page.marginLeft / model.page.width * 100)}%`;
    paper.style.paddingRight = `${Math.min(30, model.page.marginRight / model.page.width * 100)}%`;
    const blocks = new Map(model.blocks.map(block => [block.record, block]));
    for (const item of model.content) {
      if (item.type === 'paragraph') {
        if (blocks.has(item.record)) paper.append(paragraph(blocks.get(item.record), side));
        continue;
      }
      if (item.type !== 'table') continue;
      const table = el('table', 'ctt-doc-table'); style(table, item.style);
      table.setAttribute('aria-label', `Таблица ${item.index}, ${side === 'original' ? 'исходная версия' : 'новая версия'}`);
      const colgroup = el('colgroup'), total = item.widths.reduce((sum, width) => sum + width, 0);
      for (const width of item.widths) { const col = el('col'); if (total) col.style.width = `${width / total * 100}%`; colgroup.append(col); }
      const body = el('tbody'); table.append(colgroup, body);
      for (const row of item.rows) {
        const tr = el('tr');
        for (const cell of row.cells) {
          const td = el('td'); td.colSpan = cell.colSpan; td.rowSpan = cell.rowSpan; style(td, cell.style);
          for (const block of cell.content) if (blocks.has(block.record)) td.append(paragraph(blocks.get(block.record), side));
          tr.append(td);
        }
        body.append(tr);
      }
      paper.append(table);
    }
    view.scroller.replaceChildren(paper);
    view.note.textContent = 'Оформление DOCX: текст, таблицы и списки. Разбиение на страницы и шрифты могут отличаться от Word.';
    if (model.headersFooters?.length) view.note.textContent += ' Колонтитулы не показаны и не сравниваются.';
    view.counter.textContent = `${model.blocks.length} абзацев`;
  }
  function renderExtracted(side, message) {
    const view = ui[side], paper = el('div', 'ctt-doc-extracted');
    for (const block of snapshot.documents[side].blocks || []) paper.append(paragraph(block, side));
    view.scroller.replaceChildren(paper);
    view.note.textContent = message;
    view.note.classList.add('ctt-doc-warning');
    view.counter.textContent = 'Извлечённый текст';
    view.back.disabled = view.next.disabled = true;
  }
  function pdfOverlays(side, page, layer) {
    const viewer = viewers[side];
    for (const change of snapshot.changes) for (const rect of viewer.rects(change[side])) {
      if (rect.page !== page || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) continue;
      const left = Math.max(0, rect.x), top = Math.max(0, rect.y);
      const width = Math.min(1 - left, rect.width), height = Math.min(1 - top, rect.height);
      if (!(width > 0) || !(height > 0)) continue;
      const hit = anchorButton(change, ''); hit.classList.add('ctt-doc-pdf-change');
      hit.style.left = `${left * 100}%`; hit.style.top = `${top * 100}%`;
      hit.style.width = `${width * 100}%`; hit.style.height = `${height * 100}%`;
      hit.title = `${KIND[change.kind] || 'Изменение'} · страница ${page}`;
      layer.append(hit);
    }
  }
  function renderPdfPage(side, page) {
    const view = ui[side], viewer = viewers[side], version = ++renderVersion[side];
    page = Math.max(1, Math.min(viewer.pageCount, Math.trunc(page) || 1));
    view.page = page; view.counter.textContent = `Страница ${page} / ${viewer.pageCount}`;
    view.back.disabled = view.next.disabled = true; view.scroller.setAttribute('aria-busy', 'true');
    const work = async () => {
      if (destroyed || version !== renderVersion[side]) return;
      const canvas = el('canvas', 'ctt-doc-canvas');
      try {
        const size = await viewer.renderPage(page, canvas, {scale: 1.5});
        if (destroyed || version !== renderVersion[side]) { canvas.width = canvas.height = 0; return; }
        const paper = el('div', 'ctt-doc-pdf-paper');
        paper.style.setProperty('--ctt-page-width', `${size.width}px`);
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${LABEL[side]}, страница ${page}`);
        const layer = el('div', 'ctt-doc-pdf-layer'); pdfOverlays(side, page, layer);
        paper.append(canvas, layer);
        for (const previous of view.scroller.querySelectorAll('canvas')) previous.width = previous.height = 0;
        view.scroller.replaceChildren(paper); view.scroller.scrollTop = 0;
        updateSelected();
      } catch (error) {
        canvas.width = canvas.height = 0;
        if (!destroyed && version === renderVersion[side] && error.name !== 'AbortError') {
          view.scroller.replaceChildren(el('p', 'ctt-doc-render-error', 'Не удалось отобразить эту страницу PDF. Перейдите на другую страницу.'));
        }
      } finally {
        if (!destroyed && version === renderVersion[side]) {
          view.back.disabled = page <= 1; view.next.disabled = page >= viewer.pageCount;
          view.scroller.setAttribute('aria-busy', 'false');
        }
      }
    };
    // One rasterization per document at a time; superseded queued pages are skipped.
    queued[side] = (queued[side] || Promise.resolve()).then(work, work);
    return queued[side];
  }
  async function loadSide(side) {
    const descriptor = snapshot.documents[side], source = snapshot.sources[SOURCE_SIDE[side]], view = ui[side];
    try {
      if (descriptor.format === 'pdf') {
        if (destroyed) return;
        const viewer = await openReadOnlyPdf(source, aborter.signal);
        if (destroyed) { await viewer.dispose(); return; }
        viewers[side] = viewer;
        view.note.textContent = 'Исходные страницы PDF. Подсветка отмечает текстовые блоки с изменениями.';
        view.pager.hidden = false;
        await renderPdfPage(side, 1);
      } else if (descriptor.format === 'docx') {
        const {readDocxVisual} = await import('../src/docx-visual.mjs');
        if (destroyed) return;
        const model = await readDocxVisual(source);
        if (!destroyed) renderDocx(model, side);
      } else renderExtracted(side, 'Показан извлечённый текст документа.');
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      renderExtracted(side, descriptor.format === 'pdf'
        ? 'Исходные страницы PDF недоступны. Показан извлечённый текст; расположение на странице не воспроизведено.'
        : 'Не удалось воспроизвести оформление DOCX. Показан извлечённый текст.');
    } finally { if (!destroyed) view.scroller.setAttribute('aria-busy', 'false'); }
  }
  for (const side of SIDES) {
    anchors[side] = recordAnchors(snapshot.changes, side); renderVersion[side] = 0;
    const panel = el('section', `ctt-doc-panel ctt-doc-${side}`);
    panel.setAttribute('aria-label', LABEL[side]);
    const heading = el('div', 'ctt-doc-heading');
    const title = el('div'); title.append(el('h3', '', LABEL[side]), el('p', 'ctt-doc-filename', snapshot.documents[side].name));
    const counter = el('span', 'ctt-doc-page-counter', 'Загрузка…'); heading.append(title, counter);
    const pager = el('div', 'ctt-doc-pager'); pager.hidden = true;
    const back = button('←', 'Предыдущая страница', () => { const view = ui[side]; if (view.page > 1) void renderPdfPage(side, view.page - 1); });
    const next = button('→', 'Следующая страница', () => { const view = ui[side]; if (viewers[side] && view.page < viewers[side].pageCount) void renderPdfPage(side, view.page + 1); });
    const pagerLabel = el('span', '', 'Страницы оригинала'); pager.append(pagerLabel, back, next);
    const missing = el('p', 'ctt-doc-missing'); missing.hidden = true; missing.setAttribute('role', 'status');
    const scroller = el('div', 'ctt-doc-scroller'); scroller.tabIndex = 0; scroller.setAttribute('aria-label', `Просмотр ${side === 'original' ? 'исходного' : 'нового'} документа`); scroller.setAttribute('aria-busy', 'true');
    scroller.append(el('p', 'ctt-doc-loading', 'Открываем документ…'));
    const note = el('p', 'ctt-doc-note'); panel.append(heading, pager, missing, scroller, note); columns.append(panel);
    ui[side] = {panel, counter, pager, back, next, missing, scroller, note, page: 1};
  }
  async function focusChange(id) {
    const change = byId.get(id); if (destroyed || !change) return false;
    selectedId = id; const version = ++selectionVersion;
    selectionText.textContent = `${KIND[change.kind] || 'Изменение'} · ${location(change.originalLocation) || 'нет в A'} → ${location(change.revisedLocation) || 'нет в B'}`;
    explain.disabled = false; updateSelected();
    await Promise.all(SIDES.map(async side => {
      const view = ui[side], block = change[side], viewer = viewers[side];
      view.missing.hidden = !!block;
      view.missing.textContent = side === 'original' ? 'Добавленный фрагмент отсутствует в исходном документе A.' : 'Удалённый фрагмент отсутствует в новой версии B.';
      if (viewer && block) {
        const rects = viewer.rects(block);
        const page = (rects.find(rect => rect.page === view.page) || rects[0])?.page;
        if (page && page !== view.page) await renderPdfPage(side, page);
        else await queued[side];
      }
      if (destroyed || version !== selectionVersion) return;
      const target = [...view.scroller.querySelectorAll('[data-document-change]')].find(node => node.dataset.documentChange === id);
      if (target) {
        const area = view.scroller.getBoundingClientRect(), box = target.getBoundingClientRect();
        view.scroller.scrollTop += box.top - area.top - view.scroller.clientHeight / 3;
        view.scroller.scrollLeft += box.left - area.left - view.scroller.clientWidth / 3;
      }
    }));
    if (!destroyed && version === selectionVersion) updateSelected();
    return !destroyed && version === selectionVersion;
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; selectionVersion++; aborter.abort();
    for (const viewer of Object.values(viewers)) void viewer.dispose().catch(() => {});
    for (const canvas of shell.querySelectorAll('canvas')) canvas.width = canvas.height = 0;
    shell.remove(); root.classList.remove('ctt-document-comparison');
  }
  await Promise.all(SIDES.map(loadSide));
  return {focusChange, destroy};
}
