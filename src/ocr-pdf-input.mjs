/** Bounded, local PDF page input for reviewed OCR import. */
export const PDF_LIMITS = Object.freeze({bytes: 20 * 1024 * 1024, pages: 30, pixels: 12_000_000, dimension: 4000, imagePixels: 16_000_000, dpi: 300});
const abortError = () => new DOMException('PDF operation cancelled.', 'AbortError');
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function fail(message) { throw new Error(`PDF: ${message}`); }

export function validatePdfFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > PDF_LIMITS.bytes || typeof file.arrayBuffer !== 'function') {
    fail('choose a nonempty PDF no larger than 20 MiB.');
  }
}
export function validatePageNumber(number, count) {
  if (!Number.isInteger(count) || count < 1 || count > PDF_LIMITS.pages) fail('documents with 1 to 30 pages are supported.');
  if (!Number.isInteger(number) || number < 1 || number > count) fail('choose a page within this document.');
}
/** Floor canvas dimensions so the allocated bitmap never exceeds either bound. */
export function boundedViewport(width, height, preferredScale = PDF_LIMITS.dpi / 72) {
  if (![width, height, preferredScale].every(v => Number.isFinite(v) && v > 0) || width > 10_000_000 || height > 10_000_000) fail('invalid page dimensions.');
  const scale = Math.min(preferredScale, PDF_LIMITS.dimension / width, PDF_LIMITS.dimension / height, Math.sqrt(PDF_LIMITS.pixels / (width * height)));
  return {scale, width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale))};
}
/** Coordinates are relative to the visible page, after its PDF rotation. */
export function validatePdfRegion(region) {
  if (region === undefined) return {x: 0, y: 0, width: 1, height: 1};
  if (!region || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
      || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
      || region.x + region.width > 1 || region.y + region.height > 1) fail('choose a region inside the page.');
  return {x: region.x, y: region.y, width: region.width, height: region.height};
}
/** Keep extractor order and explicit line boundaries, without correcting text. */
export function textFromItems(items) {
  if (!Array.isArray(items)) fail('invalid text layer.');
  if (items.length > 100_000) fail('text layer has too many fragments.');
  let text = '';
  for (const item of items) {
    if (typeof item?.str !== 'string') continue;
    if (text.length + item.str.length > 500_000) fail('text layer exceeds 500000 characters.');
    text += item.str;
    if (item.hasEOL && !text.endsWith('\n')) text += '\n';
    if (text.length > 500_000) fail('text layer exceeds 500000 characters.');
  }
  return text;
}
class NoExternalData {
  async fetch() { fail('this page needs unavailable external fonts or data. Use a PDF with embedded resources.'); }
}
function abortable(promise, signal, onAbort = () => {}) {
  if (!signal) return promise;
  if (signal.aborted) { onAbort(); return Promise.reject(abortError()); }
  return new Promise((resolve, reject) => {
    const cancel = () => { try { onAbort(); } finally { reject(abortError()); } };
    signal.addEventListener('abort', cancel, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}
function friendlyError(error) {
  if (error?.name === 'AbortError') return error;
  if (/Image exceeded maximum allowed size/.test(error?.message || '')) return new Error('PDF: a page image exceeds 16 million pixels. Reduce the scan resolution and try again.');
  if (error?.name === 'PasswordException') return new Error('PDF: password-protected files are not supported for OCR import. Use an unlocked copy.');
  return error instanceof Error ? error : new Error('PDF: could not read this document.');
}

export async function openPdf(file, {signal} = {}) {
  checkAbort(signal); validatePdfFile(file);
  const data = new Uint8Array(await abortable(file.arrayBuffer(), signal));
  checkAbort(signal);
  if (!data.length || data.length > PDF_LIMITS.bytes || !new TextDecoder('latin1').decode(data.subarray(0, 1024)).includes('%PDF-')) fail('the PDF signature was not found.');
  const {getDocument} = await import('./pdf-reader.mjs');
  checkAbort(signal);
  const loading = getDocument({data, stopAtErrors: true, isEvalSupported: false,
    disableFontFace: true, useSystemFonts: false, useWorkerFetch: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, useWasm: false,
    enableXfa: false, disableAutoFetch: true, disableStream: true, disableRange: true,
    verbosity: 0, maxImageSize: PDF_LIMITS.imagePixels, BinaryDataFactory: NoExternalData});
  let destroyed = false, destroyPromise, busy = false;
  const renders = new Set();
  const destroy = () => {
    if (destroyed) return destroyPromise || Promise.resolve();
    destroyed = true; signal?.removeEventListener('abort', cancelled);
    for (const task of renders) task.cancel();
    destroyPromise = Promise.resolve(loading.destroy());
    return destroyPromise;
  };
  const cancelled = () => { void destroy().catch(() => {}); };
  signal?.addEventListener('abort', cancelled, {once: true});
  try {
    const doc = await abortable(loading.promise, signal, cancelled);
    checkAbort(signal); validatePageNumber(1, doc.numPages);
    return {pageCount: doc.numPages, destroy,
      async page(number, {signal: pageSignal, region} = {}) {
        checkAbort(signal); checkAbort(pageSignal);
        if (destroyed) fail('this document has been closed.');
        if (busy) fail('wait for the current page to finish.');
        validatePageNumber(number, doc.numPages);
        const crop = validatePdfRegion(region);
        busy = true;
        let pdfPage, canvas, renderTask;
        const cancellation = new AbortController();
        const relay = () => cancellation.abort();
        signal?.addEventListener('abort', relay, {once: true});
        pageSignal?.addEventListener('abort', relay, {once: true});
        const localSignal = cancellation.signal;
        try {
          pdfPage = await abortable(doc.getPage(number), localSignal);
          checkAbort(localSignal);
          const base = pdfPage.getViewport({scale: 1});
          const size = boundedViewport(base.width * crop.width, base.height * crop.height);
          const viewport = pdfPage.getViewport({scale: size.scale});
          canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
          const context = canvas.getContext('2d');
          if (!context) fail('the browser cannot render this page.');
          // Only allocate the selected region; PDF.js clips its translated render to this canvas.
          const transform = [1, 0, 0, 1, -base.width * crop.x * size.scale, -base.height * crop.y * size.scale];
          renderTask = pdfPage.render({canvasContext: context, viewport, transform, background: 'rgb(255,255,255)', annotationMode: 0});
          renders.add(renderTask);
          await abortable(renderTask.promise, localSignal, () => renderTask.cancel());
          checkAbort(localSignal);
          let text = '', textError = null;
          if (region === undefined) try {
            const content = await abortable(pdfPage.getTextContent({disableNormalization: true, includeMarkedContent: false}), localSignal);
            text = textFromItems(content.items);
          } catch (error) {
            checkAbort(localSignal);
            textError = 'The text layer could not be read reliably. Recognize this page and check it against the image.';
          }
          const blob = await abortable(new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PDF: could not create the page image.')), 'image/png')), localSignal);
          checkAbort(localSignal); if (destroyed) throw abortError();
          return {blob, text, hasText: Boolean(text.trim()), width: size.width, height: size.height, dpi: size.scale * 72, region: crop, textError};
        } catch (error) {
          if (localSignal.aborted || destroyed) throw abortError();
          throw friendlyError(error);
        } finally {
          signal?.removeEventListener('abort', relay); pageSignal?.removeEventListener('abort', relay);
          if (renderTask) renders.delete(renderTask);
          if (canvas) { canvas.width = 0; canvas.height = 0; }
          try { pdfPage?.cleanup(); } finally { busy = false; }
        }
      }};
  } catch (error) {
    await destroy().catch(() => {});
    throw friendlyError(error);
  }
}
