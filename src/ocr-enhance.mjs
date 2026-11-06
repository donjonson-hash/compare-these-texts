/** One-shot, cancellable local image preparation. No OCR or network request. */
export function enhanceOcrImage(blob, {signal, timeoutMs = 60000} = {}) {
  const aborted = () => new DOMException('Image preparation stopped.', 'AbortError');
  if (signal?.aborted) return Promise.reject(aborted());
  if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > 64 * 1024 * 1024 || typeof blob.arrayBuffer !== 'function') {
    return Promise.reject(new Error('Choose a nonempty image no larger than 64 MiB.'));
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Choose a positive image preparation timeout.'));
  return new Promise((resolve, reject) => {
    let owner, timer, settled = false;
    const done = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      if (owner) { owner.onmessage = owner.onerror = owner.onmessageerror = null; owner.terminate(); }
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => done(aborted());
    try {
      owner = new Worker(new URL('./ocr-enhance-worker.mjs', import.meta.url), {type:'module'});
      signal?.addEventListener('abort', onAbort, {once:true});
      owner.onerror = event => { event.preventDefault(); done(new Error(event.message || 'Image preparation failed.')); };
      owner.onmessageerror = () => done(new Error('Could not read the image preview.'));
      owner.onmessage = ({data: message}) => {
        if (message?.type === 'error') { done(new Error(message.message || 'Image preparation failed.')); return; }
        const value = message?.data;
        if (message?.type !== 'result' || !(value?.blob instanceof Blob) || !value.blob.size || value.method !== 'contrast-v1' ||
            !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1 || value.width * value.height > 16_000_000) {
          done(new Error('Invalid image preview result.')); return;
        }
        done(null, value);
      };
      timer = setTimeout(() => done(new Error('Image preparation timed out. Try a smaller page.')), timeoutMs);
      if (signal?.aborted) { onAbort(); return; }
      owner.postMessage({blob});
    } catch (error) { done(error); }
  });
}
