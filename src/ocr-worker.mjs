// Own the vendor worker so cancellation can terminate it before createWorker
// resolves. Keep the pinned vendor untouched and use its public API only.
let worker;
const fail = error => postMessage({type: 'error', message: error?.message || String(error)});
self.onmessage = async ({data: {id, action, language, psm, image, options}}) => {
  try {
    if (action === 'initialize') {
      const {default: Tesseract} = await import('./ocr-assets/tesseract-vendor.mjs');
      worker = await Tesseract.createWorker(language, 1, {
        workerPath: new URL('./ocr-assets/worker.min.js', import.meta.url).href,
        corePath: new URL('./ocr-assets/core/', import.meta.url).href,
        langPath: new URL('./ocr-assets/lang/', import.meta.url).href,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: data => postMessage({type: 'progress', data}),
        // Tesseract 7 can leave createWorker pending on a language-load error.
        // Report it directly so the owner is terminated by the caller.
        errorHandler: fail,
      });
      await worker.setParameters({tessedit_pageseg_mode: psm});
      postMessage({id});
    } else if (action === 'recognize') {
      if (!worker) throw new Error('The local OCR engine is not ready.');
      postMessage({id, data: await worker.recognize(image, options)});
    } else throw new Error('Unsupported local OCR operation.');
  } catch (error) { fail(error); }
};
