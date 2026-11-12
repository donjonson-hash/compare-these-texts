/** Bounded complex HYPERLINK fields, reduced to their cached visible text.
 * No field instruction is executed and no link is opened. The caller retains
 * the original ZIP bytes; the normalized DOM is used for editing and export,
 * so Word cannot recalculate an old field result over the user's edits.
 */
const W = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);
const XML = 'http://www.w3.org/XML/1998/namespace';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const MAX_FIELDS = 1000, MAX_INSTRUCTION = 4096;
const elements = node => Array.from(node?.childNodes || []).filter(child => child.nodeType === 1);
const is = (node, name) => !!node && W.has(node.namespaceURI) && node.localName === name;
const attr = (node, name) => { for (const ns of W) { const value = node.getAttributeNS(ns, name); if (value !== null) return value; } return null; };
const fail = () => { throw new Error('DOCX: only balanced HYPERLINK fields with a plain-text result in one paragraph are supported. Convert other fields to plain text.'); };
function walk(root) {
  const nodes = [], stack = [root];
  while (stack.length) { const node = stack.pop(); nodes.push(node); stack.push(...elements(node).reverse()); }
  return nodes;
}

// Accept the address and the standard display/anchor/window switches only.
// Targets remain inert strings: even file paths or URLs are never resolved.
function hyperlinkInstruction(instruction) {
  if (!instruction || instruction.length > MAX_INSTRUCTION || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(instruction)) fail();
  const tokens = []; let i = 0;
  while (i < instruction.length) {
    if (/\s/.test(instruction[i])) { i++; continue; }
    let value = '', quoted = false;
    if (instruction[i] === '"') {
      quoted = true; i++; let closed = false;
      while (i < instruction.length) {
        const char = instruction[i++];
        if (char === '\\' && instruction[i] === '"') { value += instruction[i++]; continue; }
        if (char === '"') { closed = true; break; }
        value += char;
      }
      if (!closed || i < instruction.length && !/\s/.test(instruction[i])) fail();
    } else {
      while (i < instruction.length && !/\s/.test(instruction[i])) {
        if (instruction[i] === '"') fail();
        value += instruction[i++];
      }
    }
    tokens.push({value, quoted});
  }
  if (tokens[0]?.quoted || tokens[0]?.value.toUpperCase() !== 'HYPERLINK') fail();
  let address = false, anchor = false; const switches = new Set();
  for (let j = 1; j < tokens.length; j++) {
    const token = tokens[j];
    if (!token.quoted && token.value.startsWith('\\')) {
      const flag = token.value.toLowerCase();
      if (!['\\l', '\\o', '\\t', '\\m', '\\n'].includes(flag) || switches.has(flag)) fail();
      switches.add(flag);
      if (['\\l', '\\o', '\\t'].includes(flag)) {
        const argument = tokens[++j];
        if (!argument?.value || !argument.quoted && argument.value.startsWith('\\')) fail();
        if (flag === '\\l') anchor = true;
      }
    } else {
      if (address || !token.value) fail();
      address = true;
    }
  }
  if (!address && !anchor) fail();
}

export function normalizeDocxHyperlinkFields(doc) {
  const nodes = walk(doc.documentElement);
  const controls = nodes.filter(node => is(node, 'fldChar') || is(node, 'instrText'));
  if (!controls.length) return 0;
  // A field may not cross a paragraph, hyperlink wrapper, table cell, or an
  // unsupported object. This also rejects controls hidden in properties.
  for (const node of controls) {
    if (!is(node.parentNode, 'r') || !is(node.parentNode.parentNode, 'p') || elements(node).length) fail();
    const fieldAttributes = new Set();
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.namespaceURI === XMLNS) continue;
      if (is(node, 'instrText') && attribute.namespaceURI === XML && attribute.localName === 'space' && ['default', 'preserve'].includes(attribute.value)) continue;
      if (is(node, 'fldChar') && W.has(attribute.namespaceURI) && (attribute.localName === 'fldCharType' || ['dirty', 'fldLock'].includes(attribute.localName) && ['0','1','true','false','on','off'].includes(attribute.value))) {
        if (fieldAttributes.has(attribute.localName)) fail();
        fieldAttributes.add(attribute.localName); continue;
      }
      fail();
    }
    if (is(node, 'fldChar') && node.textContent.trim()) fail();
  }
  let count = 0; const remove = [];
  for (const paragraph of nodes.filter(node => is(node, 'p'))) {
    let field = null;
    for (const run of elements(paragraph)) {
      if (!is(run, 'r')) { if (field) fail(); continue; }
      for (const node of Array.from(run.childNodes)) {
        if (node.nodeType === 8 || node.nodeType === 3 && !node.data.trim()) continue;
        if (node.nodeType !== 1) { if (field) fail(); continue; }
        if (is(node, 'rPr')) continue; // Kept for the normal formatting validator.
        if (is(node, 'fldChar')) {
          const type = attr(node, 'fldCharType');
          if (type === 'begin') {
            if (field || ++count > MAX_FIELDS) fail();
            field = {phase: 'instruction', instruction: '', result: false};
          } else if (type === 'separate') {
            if (field?.phase !== 'instruction') fail();
            hyperlinkInstruction(field.instruction); field.phase = 'result';
          } else if (type === 'end') {
            if (field?.phase !== 'result' || !field.result) fail();
            field = null;
          } else fail();
          remove.push(node); continue;
        }
        if (is(node, 'instrText')) {
          if (field?.phase !== 'instruction') fail();
          field.instruction += node.textContent;
          if (field.instruction.length > MAX_INSTRUCTION) fail();
          remove.push(node); continue;
        }
        if (field) {
          if (field.phase !== 'result' || !W.has(node.namespaceURI) || !['t','tab','br','cr','noBreakHyphen','softHyphen'].includes(node.localName) || elements(node).length || !is(node, 't') && node.textContent.trim()) fail();
          field.result = true;
        }
      }
    }
    if (field) fail();
  }
  if (remove.length !== controls.length) fail();
  // Validate the complete document before mutating any field.
  for (const node of remove) node.parentNode.removeChild(node);
  return count;
}
