/** Local-only OCR. All workers, engines and language data ship with the app. */
export async function makeWorker(language, logger = () => {}, {psm = '6', signal, timeoutMs = 120000} = {}) {
  if (!['eng', 'rus', 'rus+eng'].includes(language)) throw new Error('Choose English, Russian, or Russian + English for OCR.');
  if (!['3', '6'].includes(psm)) throw new Error('Choose a supported OCR layout.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Choose a positive OCR timeout.');
  const aborted = () => new DOMException('OCR stopped.', 'AbortError');
  if (signal?.aborted) throw aborted();
  // The owner exists before Tesseract starts. Terminating it also terminates its
  // nested engine worker, including when createWorker never settles on failure.
  const owner = new Worker(new URL('./ocr-worker.mjs', import.meta.url), {type: 'module'});
  const pending = new Map();
  let sequence = 0, closed = false, failure;
  const close = error => {
    if (closed) return;
    closed = true; failure = error;
    signal?.removeEventListener('abort', onAbort);
    owner.terminate();
    owner.onmessage = owner.onerror = owner.onmessageerror = null;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
    pending.clear();
  };
  const onAbort = () => close(aborted());
  signal?.addEventListener('abort', onAbort, {once: true});
  owner.onerror = event => {
    event.preventDefault();
    close(new Error(event.message || 'Could not start the local OCR engine.'));
  };
  owner.onmessageerror = () => close(new Error('Could not read the local OCR result.'));
  owner.onmessage = ({data: message}) => {
    if (closed) return;
    if (message.type === 'progress') { logger(message.data); return; }
    if (message.type === 'error') { close(new Error(message.message || 'Local OCR failed.')); return; }
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id); clearTimeout(job.timer); job.resolve(message.data);
  };
  const request = (action, payload) => {
    if (closed) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => close(new Error('Local OCR timed out. Try a smaller page or selected region.')), timeoutMs);
      pending.set(id, {resolve, reject, timer});
      try { owner.postMessage({id, action, ...payload}); }
      catch (error) { close(error); }
    });
  };
  await request('initialize', {language, psm});
  return {
    recognize: (image, options = {}) => request('recognize', {image, options}),
    terminate: async () => close(aborted()),
  };
}
