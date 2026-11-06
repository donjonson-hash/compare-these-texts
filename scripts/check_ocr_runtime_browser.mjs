// Real browser regression: local mixed-language recognition and resource cleanup
// when the vendor's initialization promise is pending, rejected, or interrupted.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const mime = {'.mjs':'text/javascript', '.js':'text/javascript', '.wasm':'application/wasm', '.gz':'application/gzip'};
let modelMode = 'normal';
const stalled = new Set();
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname.endsWith('.traineddata.gz') && modelMode !== 'normal') {
    if (modelMode === 'missing') { response.writeHead(404); response.end(); return; }
    stalled.add(response); response.on('close', () => stalled.delete(response)); return;
  }
  try {
    if (pathname === '/') {
      response.writeHead(200, {'Content-Type':'text/html', 'Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'"});
      response.end('<!doctype html><title>Local OCR runtime regression</title>'); return;
    }
    const filename = path.resolve(build, '.' + pathname);
    if (!filename.startsWith(build + path.sep)) throw new Error('Invalid path');
    const data = await readFile(filename);
    response.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream'}); response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {channel:'chromium'})});
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  const cdp = await browser.newBrowserCDPSession();
  const liveWorkers = async () => (await cdp.send('Target.getTargets')).targetInfos.filter(target => target.type === 'worker' && target.url.startsWith(base));
  const clean = async name => {
    const deadline = Date.now() + 5000;
    while ((await liveWorkers()).length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(await liveWorkers(), [], `${name} must leave no owner or nested OCR workers`);
    for (const response of stalled) response.destroy();
    console.log(`PASS ${name}`);
  };
  const text = await page.evaluate(async () => {
    const {makeWorker} = await import('/ocr-runtime.mjs');
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 200;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black'; ctx.font = '40px Arial'; ctx.fillText('Сравнение документов', 20, 65); ctx.fillText('Invoice total 12345', 20, 130);
    window.ocrFixture = await new Promise(resolve => canvas.toBlob(resolve));
    const worker = await makeWorker('rus+eng');
    try { return (await worker.recognize(window.ocrFixture)).data.text; } finally { await worker.terminate(); }
  });
  assert.match(text, /Сравнение документов/); assert.match(text, /Invoice total 12345/);
  await clean('Russian + English recognition');

  modelMode = 'missing';
  const missing = await page.evaluate(async () => {
    const {makeWorker} = await import('/ocr-runtime.mjs');
    const started = performance.now();
    try { await makeWorker('rus', undefined, {timeoutMs:15000}); return null; }
    catch (error) { return {message:error.message, elapsed:performance.now() - started}; }
  });
  assert.match(missing?.message || '', /404|network|fetch/i); assert.ok(missing.elapsed < 14000, 'model failure must propagate without waiting for the timeout');
  await clean('missing model rejects initialization');

  modelMode = 'stalled';
  const aborted = await page.evaluate(async () => {
    const {makeWorker} = await import('/ocr-runtime.mjs'), controller = new AbortController();
    try {
      await makeWorker('rus', message => { if (message.status === 'loading language traineddata') controller.abort(); }, {signal:controller.signal}); return null;
    } catch (error) { return error.name; }
  });
  assert.equal(aborted, 'AbortError'); await clean('Stop during model initialization');

  const timeout = await page.evaluate(async () => {
    const {makeWorker} = await import('/ocr-runtime.mjs');
    try { await makeWorker('eng', undefined, {timeoutMs:500}); return null; } catch (error) { return error.message; }
  });
  assert.match(timeout, /timed out/); await clean('stalled initialization times out');

  modelMode = 'normal';
  const recognitionAbort = await page.evaluate(async () => {
    const {makeWorker} = await import('/ocr-runtime.mjs'), controller = new AbortController();
    const worker = await makeWorker('eng', message => {
      if (message.status === 'recognizing text') controller.abort();
    }, {signal:controller.signal});
    try { await worker.recognize(window.ocrFixture); return null; } catch (error) { return error.name; }
  });
  assert.equal(recognitionAbort, 'AbortError'); await clean('Stop during recognition');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
