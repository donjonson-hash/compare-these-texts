import {openSessionStore} from './session-store.mjs';
import {mountSessionUI} from './session-ui.mjs';
import {ocrSourceBytes, validateOcrSnapshot} from './ocr-document-model.mjs';

export function validateScannerPayload(payload) {
  if (!payload || payload.version !== 1 || payload.kind !== 'document-scanner') throw Object.assign(new Error('This scanner draft is not supported.'), {code:'incompatible'});
  ocrSourceBytes(payload.source);
  const review = validateOcrSnapshot(payload.review);
  if (!/\.pdf$/i.test(payload.source.name) && review.pages.length !== 1) throw new Error('An image must have exactly one page.');
  const result = {version:1, kind:'document-scanner', source:{name:payload.source.name,data:payload.source.data}, review};
  if (new TextEncoder().encode(JSON.stringify(result)).length > 32 * 1024 * 1024) throw new Error('This scanner draft is too large to save. Download your document.');
  return result;
}
export function mountScannerSession(root, options) {
  return mountSessionUI(root, {...options, single:true, openStore:() => openSessionStore({dbName:'document-scanner-session-v1',validatePayload:validateScannerPayload})});
}
