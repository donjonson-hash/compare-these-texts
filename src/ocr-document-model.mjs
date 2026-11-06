import {validateCheckedText} from './ocr-import.mjs';
import {validateOcrRegions, layoutText} from './ocr-layout.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw Object.assign(new Error('Could not save your OCR document: invalid data.'), {code: 'invalid'}); };

/** The original scan has a separate bounded path; regular editors retain 2 MiB. */
export function ocrSourceBytes(source) {
  if (!object(source) || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 255 || source.name.includes('\0')) invalid();
  const extension = /\.(pdf|png|jpe?g)$/i.exec(source.name)?.[1].toLowerCase();
  if (!extension) invalid();
  const limit = (extension === 'pdf' ? 20 : 10) * 1024 * 1024;
  const data = source.data;
  if (typeof data !== 'string' || !data.length || data.length > 4 * Math.ceil(limit / 3) || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) invalid();
  const byteLength = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (byteLength <= 0 || byteLength > limit) invalid();
  let binary;
  try { binary = atob(data); } catch { invalid(); }
  if (binary.length !== byteLength) invalid();
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/** Persist text and normalized coordinates only; image URLs are recreated on resume. */
export function validateOcrSnapshot(review) {
  if (!object(review) || review.version !== 1 || review.kind !== 'ocr' || !Array.isArray(review.pages) || review.pages.length < 1 || review.pages.length > 30 ||
      !Number.isInteger(review.currentPage) || review.currentPage < 0 || review.currentPage >= review.pages.length) invalid();
  let regionCharacters = 0;
  const pages = review.pages.map(page => {
    if (!object(page) || page.confirmed !== true || typeof page.text !== 'string' || page.text.length > 1_000_000 ||
        (page.blank !== undefined && typeof page.blank !== 'boolean') || (!page.text.trim() && page.blank !== true)) invalid();
    const source = page.source ?? 'ocr', language = page.language ?? 'eng', psm = page.psm ?? '3';
    if (!['ocr', 'text-layer'].includes(source) || !['eng', 'rus', 'rus+eng'].includes(language) || !['3', '6'].includes(psm)) invalid();
    let regions;
    try { regions = validateOcrRegions(page.regions ?? []); } catch { invalid(); }
    if (regions.length > 2000 || (regions.length && layoutText(regions) !== page.text)) invalid();
    for (const region of regions) {
      regionCharacters += [...region.text].length;
      if (regionCharacters > 500_000) invalid();
    }
    return {text: page.text, confirmed: true, source, regions, language, psm, blank: page.blank === true};
  });
  try { validateCheckedText(pages.map(page => page.text).join('\n\n')); } catch { invalid(); }
  return {version: 1, kind: 'ocr', pages, currentPage: review.currentPage};
}
