/** Show the draft in the current page while its exact PDF rendering is prepared. */
export function showPdfTypingPreview(scroll, key, text, block, pageNumber) {
  const paper = scroll.querySelector('.visual-pdf-page');
  if (!paper || !block) return;
  const parts = block.source_blocks || [block];
  const lines = text.split('\n');
  const pageParts = parts.filter(part => part.visual?.page === pageNumber);
  const areas = new Map();
  for (const hotspot of paper.querySelectorAll('.visual-hotspot')) {
    if (hotspot.dataset.group !== key) continue;
    const {left, top, width, height} = hotspot.style;
    const x = parseFloat(left), y = parseFloat(top), w = parseFloat(width), h = parseFloat(height);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    // Runs with different weights and sizes often belong to one source line.
    // Reflowed pages carry text offsets instead of the original record number.
    const record = Number(hotspot.dataset.pdfRecord);
    const start = Number(hotspot.dataset.pdfTextStart);
    const end = Number(hotspot.dataset.pdfTextEnd);
    const continues = hotspot.dataset.pdfContinues === 'true';
    const id = Number.isFinite(start) ? 'offset-' + start : Number.isFinite(record) ? record : 'row-' + top;
    const area = areas.get(id);
    if (area) {
      area.left = Math.min(area.left, x); area.top = Math.min(area.top, y);
      area.right = Math.max(area.right, x + w); area.bottom = Math.max(area.bottom, y + h);
    } else {
      areas.set(id, {left:x, top:y, right:x + w, bottom:y + h, record, start, end, continues});
    }
  }
  let overlay = [...paper.querySelectorAll('.pdf-typing-preview')].find(layer => layer.dataset.key === key);
  if (!areas.size) { overlay?.remove(); return; }
  if (!overlay) {
    overlay = paper.ownerDocument.createElement('div');
    overlay.className = 'pdf-typing-preview'; overlay.dataset.key = key;
    overlay.setAttribute('aria-hidden', 'true');
    paper.append(overlay);
  }
  const boxes = [...areas.values()];
  const fragment = paper.ownerDocument.createDocumentFragment();
  const spans = [];
  for (const [index, area] of boxes.entries()) {
    const part = parts.find(item => item.record === area.record) || pageParts[index] || parts[0];
    const sourceIndex = parts.indexOf(part);
    const line = paper.ownerDocument.createElement('div');
    line.className = 'pdf-typing-line'; line.dir = 'auto';
    Object.assign(line.style, {left:area.left + '%', top:area.top + '%',
      width:(area.right - area.left) + '%', height:(area.bottom - area.top) + '%'});
    const size = part.visual?.rects?.[0]?.fontSize;
    if (size > 0 && part.visual.width > 0) line.style.fontSize = (100 * size / part.visual.width) + 'cqw';
    const span = paper.ownerDocument.createElement('span');
    if (Number.isFinite(area.start)) {
      const next = boxes[index + 1]?.start;
      const end = Number.isFinite(next) ? next : area.continues ? area.end : undefined;
      span.textContent = text.slice(area.start, end);
    } else {
      span.textContent = sourceIndex === parts.length - 1 ? lines.slice(sourceIndex).join('\n') : lines[sourceIndex] || '';
    }
    line.append(span);
    spans.push(span);
    fragment.append(line);
  }
  overlay.replaceChildren(fragment);
  // Fit modest edits like the PDF renderer. Long pastes stay inside the source
  // area until the full renderer has checked where the added text can flow.
  const scales = spans.map(span => {
    const line = span.parentElement;
    return Math.max(.8, Math.min(1, line.clientWidth / (span.offsetWidth || 1), line.clientHeight / (span.offsetHeight || 1)));
  });
  spans.forEach((span, index) => { span.style.transform = 'scale(' + scales[index] + ')'; });
}
