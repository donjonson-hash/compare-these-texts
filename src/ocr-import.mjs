/** Import adapter: only explicitly reviewed text enters the existing editor. */
export function importFileLimit(name) {
  return /\.pdf$/i.test(name) ? 20 * 1024 * 1024 : /\.(png|jpe?g)$/i.test(name) ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
}
export function validateCheckedText(text) {
  if (typeof text !== 'string') throw new Error('The checked text must be text.');
  if (text.includes('\0')) throw new Error('NUL characters are not allowed in the checked text.');
  // Match TXT parsing: normalize line endings and omit one final empty block.
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized === '' ? [] : normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  if (lines.length > 2000 || new TextEncoder().encode(text).length > 2097152 ||
      lines.reduce((count, line) => count + [...line].length, 0) > 500000) {
    throw new Error('The checked text is too large. Split the document into smaller files (2,000 lines / 500,000 characters maximum).');
  }
}
export function checkedTextFile(result) {
  if (!result || typeof result.text !== 'string' || !Array.isArray(result.pages) || !result.pages.length ||
      result.pages.some(page => page.confirmed !== true || typeof page.text !== 'string') ||
      result.text !== result.pages.map(page => page.text).join('\n\n')) throw new Error('Check every page before importing recognized text.');
  validateCheckedText(result.text);
  const stem = String(result.originalName || 'document').replace(/\.[^.]+$/, '').replace(/\0/g, '').slice(0, 210).toWellFormed();
  return new File([result.text], `${stem} (checked OCR).txt`, {type:'text/plain'});
}
export async function probeOcrPdf(source) {
  const {readTextSource} = await import('./text-source.mjs');
  try {
    await readTextSource(source);
    return {needsReview: false};
  } catch (error) {
    if (/^PDF: Page \d+: (?:no usable text layer was found\.|the text contains unusable Unicode characters\. Another text copy or OCR is required\.)/.test(error.message)) return {needsReview: true};
    throw error;
  }
}

export async function prepareOcrImport(file, {side = 'left', signal, forceOcr = false, probePdf, review} = {}) {
  if (!file || typeof file.name !== 'string') throw new Error('Choose a document.');
  if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
  if (file.size > importFileLimit(file.name)) throw new Error('File limit: PDF 20 MiB, PNG/JPEG 10 MiB, other documents 2 MiB.');
  let needsReview = /\.(png|jpe?g)$/i.test(file.name);
  if (/\.pdf$/i.test(file.name)) {
    needsReview = forceOcr || file.size > 2097152 || (await probePdf(file, {signal})).needsReview;
  }
  if (!needsReview) return file;
  if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
  const showReview = review || (await import('./ocr-review.mjs')).reviewOcrFile;
  const result = await showReview(file, {side, signal});
  if (!result) return null;
  if (signal?.aborted) throw new DOMException('Import cancelled.', 'AbortError');
  return checkedTextFile(result);
}
