/** Apply exact character ranges without replacing rich runs, links or images. */
export function markTextChanges(content, segments, offset = 0, expectedText = content.textContent) {
  for (const mark of content.querySelectorAll('mark.visual-text-change')) mark.replaceWith(...mark.childNodes);
  content.normalize();
  // A typing render can lag behind the draft. Never paint new ranges on old text.
  if (content.textContent !== expectedText) return;
  const ranges = [];
  let position = 0;
  for (const segment of segments || []) {
    const end = position + segment.text.length;
    if (segment.changed && end > offset && position < offset + expectedText.length) {
      ranges.push([Math.max(0, position - offset), Math.min(expectedText.length, end - offset)]);
    }
    position = end;
  }
  if (!ranges.length) return;
  const doc = content.ownerDocument, walker = doc.createTreeWalker(content, 4), nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let cursor = 0;
  for (const node of nodes) {
    const text = node.data, start = cursor;
    cursor += text.length;
    const hits = ranges.filter(([from, to]) => to > start && from < cursor);
    if (!hits.length) continue;
    const fragment = doc.createDocumentFragment(); let previous = 0;
    for (const [from, to] of hits) {
      const first = Math.max(0, from - start), last = Math.min(text.length, to - start);
      if (first > previous) fragment.append(doc.createTextNode(text.slice(previous, first)));
      const mark = doc.createElement('mark'); mark.className = 'visual-text-change';
      mark.textContent = text.slice(first, last); fragment.append(mark); previous = last;
    }
    if (previous < text.length) fragment.append(doc.createTextNode(text.slice(previous)));
    node.replaceWith(fragment);
  }
}
