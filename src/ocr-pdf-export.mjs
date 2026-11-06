/** Local searchable PDF: the reviewed page image plus the corrected invisible text. */
import {PDFDocument, fontkit, pushGraphicsState, popGraphicsState, beginText, endText,
  setFontAndSize, setTextMatrix, setTextRenderingMode, showText} from './pdf-vendor.mjs';
import fontBase64 from './pdf-font.mjs';
import {openPdf} from './ocr-pdf-input.mjs';
import {validateOcrImage} from './ocr-image-input.mjs';
import {validateOcrSnapshot} from './ocr-document-model.mjs';

const MAX_RASTER_BYTES = 64 * 1024 * 1024;
const fail = message => { throw new Error(`OCR PDF: ${message}`); };
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('PDF export cancelled.', 'AbortError'); };

/** Image bitmap decoding applies EXIF just as the review dialog does. */
async function imagePage(file, signal) {
  const dimensions = await validateOcrImage(file, {signal});
  checkAbort(signal);
  const bitmap = await createImageBitmap(file);
  let canvas;
  try {
    checkAbort(signal);
    if (bitmap.width !== dimensions.width || bitmap.height !== dimensions.height) fail('the image orientation could not be reproduced.');
    canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) fail('the browser cannot prepare the image.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    checkAbort(signal); if (!blob) fail('the image could not be prepared.');
    // An image has no PDF page size. Use 96 dpi, matching the browser's CSS pixel scale.
    return {blob, pageWidth: bitmap.width * 72 / 96, pageHeight: bitmap.height * 72 / 96};
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0; }
}

function drawTextLayer(page, font, regions, width, height) {
  if (!regions.some(region => region.text.trim())) return;
  const key = page.node.newFontDictionary('CTTOCR', font.ref);
  for (const region of regions) {
    const lines = region.text.split(/\r\n|\r|\n/), lineHeight = region.height * height / lines.length;
    const metricHeight = font.heightAtSize(1), ascent = font.heightAtSize(1, {descender: false});
    const size = lineHeight / metricHeight;
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      const advance = font.widthOfTextAtSize(line, size);
      if (!Number.isFinite(advance) || advance <= 0) fail('a text fragment cannot be positioned. Download checked text instead.');
      const x = region.x * width, top = height * (1 - region.y) - index * lineHeight;
      const horizontalScale = region.width * width / advance;
      if (![size, horizontalScale].every(value => Number.isFinite(value) && value > 0)) fail('a text fragment is too small to position. Download checked text instead.');
      page.pushOperators(pushGraphicsState(), beginText(), setTextRenderingMode(3), setFontAndSize(key, size),
        setTextMatrix(horizontalScale, 0, 0, 1, x, top - ascent * size), showText(font.encodeText(line)), endText(), popGraphicsState());
    }
  }
}

/** Only confirmed, position-linked text is exported. The source file is never modified.
 * PDF backgrounds deliberately match the review renderer (annotations/forms excluded).
 * The old PDF text layer is discarded, so corrected words cannot coexist with stale OCR.
 */
export async function exportCheckedOcrPdf(file, snapshot, {signal, onProgress = () => {}} = {}) {
  checkAbort(signal);
  const state = validateOcrSnapshot(snapshot);
  for (const [index, page] of state.pages.entries()) {
    if (page.text.trim() && !page.regions.length) fail(`page ${index + 1} has no text positions. Recognize that page again and confirm it, or download checked text.`);
  }
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(Uint8Array.from(atob(fontBase64), character => character.charCodeAt(0)), {subset: true, features: {liga: false}});
  const supported = new Set(font.getCharacterSet());
  for (const [index, page] of state.pages.entries()) for (const character of page.text) {
    if (character === '\n' || character === '\r') continue;
    if (!supported.has(character.codePointAt(0))) fail(`page ${index + 1} contains a character unsupported by the PDF font. Download checked text to keep it unchanged.`);
  }
  checkAbort(signal);
  let source;
  try {
    const isPdf = /\.pdf$/i.test(file?.name || '');
    if (isPdf) {
      source = await openPdf(file, {signal});
      if (source.pageCount !== state.pages.length) fail('the source page count does not match the reviewed document.');
    } else if (state.pages.length !== 1) fail('an image must have exactly one reviewed page.');
    let rasterBytes = 0;
    for (let index = 0; index < state.pages.length; index++) {
      checkAbort(signal); onProgress({page: index + 1, total: state.pages.length});
      const rendered = source ? await source.page(index + 1, {signal}) : await imagePage(file, signal);
      checkAbort(signal);
      const {pageWidth: width, pageHeight: height, blob} = rendered;
      if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 14400)) fail('this page size is not supported.');
      rasterBytes += blob.size;
      if (rasterBytes > MAX_RASTER_BYTES) fail('the page images exceed 64 MiB. Split this document or download checked text.');
      const image = await pdf.embedPng(await blob.arrayBuffer()); checkAbort(signal);
      const page = pdf.addPage([width, height]); page.drawImage(image, {x: 0, y: 0, width, height});
      drawTextLayer(page, font, state.pages[index].regions, width, height);
      // Release each PNG decoder's raw buffers before rendering the next page.
      await image.embed(); checkAbort(signal);
    }
    pdf.setTitle(`${file.name} — checked OCR`); pdf.setCreator('Compare Two Texts');
    const bytes = await pdf.save(); checkAbort(signal);
    const stem = file.name.replace(/\.[^.]+$/, '').slice(0, 220) || 'document';
    return new File([bytes], `${stem} (checked OCR).pdf`, {type: 'application/pdf'});
  } finally { await source?.destroy().catch(() => {}); }
}
