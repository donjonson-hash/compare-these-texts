/** Resolve replacement fonts from the original PDF, never from a CSS guess. */
import {PDFDocument, fontkit} from './pdf-vendor.mjs';
import fontBase64 from './pdf-font.mjs';

const standard = new Set(['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
  'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
  'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique']);
function fail(message, code) {
  const error = Error(`PDF: ${message} Download a text-only PDF if you want to use a replacement font.`);
  if (code) error.code = code;
  throw error;
}

export function createPdfEditFonts(document, originalBlocks, allowReplacementFont = false) {
  const pages = new Map(), fonts = new Map();
  let measurement;
  async function pageFonts(number) {
    if (!pages.has(number)) pages.set(number, (async () => {
      const page = await document.getPage(number);
      const content = await page.getTextContent({disableNormalization: true, includeMarkedContent: false});
      await page.getOperatorList();
      // Copy only the font names. PDF.js owns font objects and their lifetime.
      return content.items.map(item => item.str ? page.commonObjs.get(item.fontName).name : null);
    })());
    return pages.get(number);
  }
  return async function resolve(block, text, output) {
    if (!text) return null;
    let indices = block.visual?.fontItems;
    // Older saved sessions predate font metadata. Re-read the same source rather
    // than guessing from the page's first font or a browser's installed fonts.
    if (!indices?.length) indices = (await originalBlocks()).find(b => b.record === block.record)?.visual.fontItems;
    if (!indices?.length) fail('The original font could not be identified.');
    const names = await pageFonts(block.visual.page);
    const selected = new Set(indices.map(index => names[index]));
    if (selected.has(undefined) || selected.has(null)) fail('The original font could not be identified.');
    if (selected.size !== 1 && !allowReplacementFont) fail('This block contains different fonts. Its original styling cannot be preserved for this edit.', 'PDF_FONT_UNAVAILABLE');
    const original = selected.size === 1 ? [...selected][0] : '';
    const name = original.replace(/^[A-Z]{6}\+/, '').replace(/-\d+$/, '');
    let selectedName = name;
    if (!standard.has(name) && name !== 'DejaVuSans') {
      if (!allowReplacementFont) fail(`The original font (${name}) is not supported for editing yet.`, 'PDF_FONT_UNAVAILABLE');
      selectedName = 'DejaVuSans';
    }
    measurement ||= PDFDocument.create().then(doc => { doc.registerFontkit(fontkit); return doc; });
    const target = output || await measurement;
    let cache = fonts.get(target); if (!cache) fonts.set(target, cache = new Map());
    function embed(name) {
      if (!cache.has(name)) cache.set(name, name === 'DejaVuSans'
        ? target.embedFont(Uint8Array.from(atob(fontBase64), c => c.charCodeAt(0)), {subset:true, features:{liga:false}})
        : target.embedFont(name));
      return cache.get(name);
    }
    function covers(font) {
      const supported = new Set(font.getCharacterSet());
      return Array.from(text).every(char => /[\r\n\t]/.test(char) || supported.has(char.codePointAt(0)));
    }
    let font = await embed(selectedName);
    if (!covers(font)) {
      if (!allowReplacementFont) fail('The original font does not contain every character in this edit.', 'PDF_FONT_UNAVAILABLE');
      selectedName = 'DejaVuSans';
      font = await embed(selectedName);
      if (!covers(font)) fail('The replacement font does not contain every character in this edit.');
    }
    return {font, name:selectedName, substituted:selectedName !== name, family: selectedName === 'DejaVuSans' ? 'KristinaPdfRevision' : selectedName.startsWith('Times') ? '"Times", serif' : selectedName.startsWith('Courier') ? '"Courier", monospace' : '"Helvetica", sans-serif',
      style: /Italic|Oblique/.test(selectedName) ? 'italic' : 'normal', weight: /Bold/.test(selectedName) ? 'bold' : 'normal'};
  };
}
