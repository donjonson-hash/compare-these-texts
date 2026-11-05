/** Local-only OCR. All workers, engines and language data ship with the app. */
export async function makeWorker(language, logger = () => {}, {psm = '6'} = {}) {
  if (!['eng', 'rus'].includes(language)) throw new Error('Choose English or Russian for OCR.');
  if (!['3', '6'].includes(psm)) throw new Error('Choose a supported OCR layout.');
  const {default: Tesseract} = await import('./ocr-assets/tesseract-vendor.mjs');
  const worker = await Tesseract.createWorker(language, 1, {
    workerPath: new URL('./ocr-assets/worker.min.js', import.meta.url).href,
    corePath: new URL('./ocr-assets/core/', import.meta.url).href,
    langPath: new URL('./ocr-assets/lang/', import.meta.url).href,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger,
  });
  try {
    await worker.setParameters({tessedit_pageseg_mode: psm});
    return worker;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}
