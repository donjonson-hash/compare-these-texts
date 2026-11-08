/** Conservative pilot policy; our code sends no document text to a server. */
export const SELECTION_LIMIT = 4000;
export const PARAGRAPH_LIMIT = 12000;
export const SNAPSHOT_MS = 15 * 60 * 1000;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const FORBIDDEN_TEXT = /[\x00-\x1f\x7f\u2028\u2029]/u;
export function validateText(text, {allowEmpty = false, limit = SELECTION_LIMIT} = {}) {
  if (typeof text !== 'string' || (!allowEmpty && !text.length) || text.length > limit || FORBIDDEN_TEXT.test(text) || /[\uD800-\uDFFF]/u.test(text)) {
    throw new Error(`Select ordinary text in one paragraph, up to ${limit.toLocaleString('en-US')} UTF-16 units, without line breaks or control characters.`);
  }
  return text;
}
function signature(element) {
  if (!element) return '';
  const attrs = [...element.attributes].filter(a => a.namespaceURI !== 'http://www.w3.org/2000/xmlns/')
    .map(a => [a.namespaceURI || '', a.localName, a.value]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify([element.namespaceURI, element.localName, attrs, [...element.childNodes].map(n => n.nodeType === 1 ? signature(n) : n.nodeType === 3 ? n.nodeValue : '')]);
}
function isWord(node, name) { return node.namespaceURI === W && node.localName === name; }
/** Check actual OOXML structure, not a regex over visible text. */
export function inspectOoxml(xml, expectedText, {Parser = globalThis.DOMParser, uniform = false} = {}) {
  if (typeof xml !== 'string' || xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('This paragraph is too complex for the pilot.');
  const doc = new Parser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Word returned an unreadable paragraph. Load the selection again.');
  const bodies = [...doc.getElementsByTagNameNS(W, 'body')];
  if (bodies.length !== 1) throw new Error('Only ordinary document paragraphs are supported.');
  const body = bodies[0];
  const children = [...body.children].filter(n => !isWord(n, 'sectPr'));
  if (children.length !== 1 || !isWord(children[0], 'p')) throw new Error('Select text in one ordinary paragraph, outside tables.');
  const paragraph = children[0];
  const runs = [];
  for (const child of paragraph.children) {
    if (isWord(child, 'pPr')) {
      if (child.getElementsByTagNameNS(W, 'numPr').length || child.getElementsByTagNameNS(W, 'sectPr').length || child.getElementsByTagNameNS(W, 'pPrChange').length) throw new Error('Lists, section breaks and tracked changes are not supported.');
      continue;
    }
    if (!isWord(child, 'r')) throw new Error('Choose a paragraph without hyperlinks, fields, bookmarks, comments, tracked changes or embedded objects.');
    for (const part of child.children) {
      if (!isWord(part, 'rPr') && !isWord(part, 't')) throw new Error('Choose a paragraph containing ordinary text only.');
      if (isWord(part, 'rPr') && part.getElementsByTagNameNS(W, 'rPrChange').length) throw new Error('Tracked formatting changes are not supported.');
    }
    const text = [...child.children].filter(n => isWord(n, 't')).map(n => n.textContent).join('');
    if (text) runs.push({text, style: signature([...child.children].find(n => isWord(n, 'rPr')))});
  }
  if (runs.map(r => r.text).join('') !== expectedText) throw new Error('The visible text cannot be matched safely to the document structure. Select a simpler passage.');
  if (uniform && new Set(runs.map(r => r.style)).size > 1) throw new Error('The selection crosses different formatting. Edit each consistently formatted passage separately.');
  return signature(paragraph);
}
/** A code-point-safe preview of the one selected-range replacement. */
export function previewReplacement(original, replacement) {
  validateText(original); validateText(replacement, {allowEmpty: true});
  const a = Array.from(original), b = Array.from(replacement);
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  return {prefix: a.slice(0, start).join(''), removed: a.slice(start, endA).join(''), added: b.slice(start, endB).join(''), suffix: a.slice(endA).join('')};
}
