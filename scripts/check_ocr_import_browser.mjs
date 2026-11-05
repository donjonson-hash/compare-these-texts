// Import-boundary regression gate: real browser, parser and editors; manual
// checked text keeps this gate independent of recognition quality and models.
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const {PDFDocument} = await import(pathToFileURL(path.join(build, 'pdf-vendor.mjs')));
const picture = path.join(root, 'experiments/ocr/fixtures/rus-paragraphs-a.png');
const pdf = await PDFDocument.create(), sheet = pdf.addPage([600,800]);
const raster = await pdf.embedPng(await readFile(picture));
sheet.drawImage(raster,{x:30,y:80,width:540,height:680});
sheet.drawText('Page 1',{x:40,y:30,size:12,font:await pdf.embedFont('Helvetica')});
const hybrid = {name:'synthetic-hybrid.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())};
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.gz':'application/gzip'};
const server = createServer(async (request,response) => {
  try {
    const pathname = new URL(request.url,'http://localhost').pathname;
    const file = path.resolve(build, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(build + path.sep)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
const errors = [], checks = [];
try {
  browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {channel:'chromium'})});
  async function fresh() {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.fulfill({body:''}));
    const page = await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(base); return page;
  }
  const ready = page => page.locator('#visual-review [data-save-side="right"]').waitFor({state:'visible'});
  const review = page => page.locator('.ocr-text:not([disabled])').waitFor({state:'visible'});
  const approve = async (page,text) => { await page.locator('.ocr-text').fill(text); await page.locator('.ocr-confirm').click(); await page.locator('.ocr-use').click(); };
  const native = await fresh();
  await native.locator('#home-left-file').setInputFiles(hybrid);
  await native.locator('#home-right-text').fill('Page 1');
  await native.locator('#start-new-compare').click(); await ready(native);
  assert.equal(await native.locator('.ocr-review-dialog').count(),0,'a native text PDF keeps its default import');
  checks.push('native PDF default');

  const forced = await fresh();
  await forced.locator('#home-left-file').setInputFiles(hybrid);
  await forced.locator('#home-left-ocr').check();
  await forced.locator('#home-right-text').fill('Scanned body');
  await forced.locator('#start-new-compare').click(); await review(forced);
  assert.match(await forced.locator('.ocr-text').inputValue(),/Page 1/,'partial text layer is available for visual review');
  await approve(forced,'Scanned body'); await ready(forced);
  assert.match(await forced.locator('#left-filename').textContent(),/checked OCR/);
  checks.push('forced hybrid PDF on Home');

  const atomic = await fresh();
  for (const [side,price] of [['left',10],['right',20]]) await atomic.locator(`#home-${side}-file`).setInputFiles({name:`${side}.csv`,mimeType:'text/csv',buffer:Buffer.from(`sku,price\nA1,${price}\n`)});
  await atomic.locator('#start-new-compare').click(); await ready(atomic);
  await atomic.locator('[data-review-action="start"]').click();
  await atomic.locator('[data-review-action="use-a"]').click();
  const cell = atomic.locator('.visual-column').nth(1).locator('[data-cell="B2"]');
  assert.equal(await cell.textContent(),'10');
  await atomic.evaluate(()=>{window.previousEditor = document.querySelector('#visual-review').firstChild;});
  await atomic.locator('#left-file').setInputFiles(picture); await review(atomic);
  await approve(atomic,'Checked scanned text');
  await atomic.waitForFunction(()=>document.querySelector('#notice').textContent.includes('CSV/XLSX tables are compared separately'));
  assert.equal(await atomic.locator('#results').isHidden(),false);
  assert.equal(await atomic.evaluate(()=>window.previousEditor === document.querySelector('#visual-review').firstChild),true,'failed OCR replacement retains editor objects');
  await atomic.locator('[data-sheet-undo=""]').click();
  assert.equal(await cell.textContent(),'20','Undo remains functional after a rejected replacement');
  checks.push('failed OCR replacement retains editor and Undo');
  if (!await atomic.locator('#source-picker').evaluate(node=>node.open)) await atomic.locator('#source-picker > summary').click();
  await atomic.locator('#left-ocr').check();
  await atomic.locator('#left-file').setInputFiles(hybrid); await review(atomic);
  await atomic.locator('.ocr-close').click();
  assert.equal(await atomic.locator('#results').isHidden(),false);
  checks.push('forced hybrid PDF workspace replacement and cancellation');

  const single = await fresh();
  await single.locator('#header-edit').click();
  await single.locator('#single-ocr').check();
  await single.locator('#single-file').setInputFiles(hybrid); await review(single);
  await approve(single,'Checked single document');
  await single.locator('#single-current').waitFor({state:'visible'});
  assert.match(await single.locator('#single-current').textContent(),/checked OCR/);
  checks.push('forced hybrid PDF single editor');
  const largeCanvas = createCanvas(4001,4000);
  largeCanvas.getContext('2d').fillRect(0,0,4001,4000);
  const largePdf = await PDFDocument.create();
  const largeScan = await largePdf.embedPng(largeCanvas.toBuffer('image/png'));
  largePdf.addPage([200,200]).drawImage(largeScan,{x:0,y:0,width:200,height:200});
  const oversized = await fresh();
  await oversized.locator('#home-left-file').setInputFiles({name:'oversized-scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(await largePdf.save())});
  await oversized.locator('#home-left-ocr').check();
  await oversized.locator('#home-right-text').fill('Comparison');
  await oversized.locator('#start-new-compare').click();
  await oversized.waitForFunction(()=>/Could not load page:/.test(document.querySelector('.ocr-status')?.textContent || ''));
  assert.equal(await oversized.locator('.ocr-blank').isDisabled(),true,'a missing image cannot be approved as a blank page');
  assert.equal(await oversized.locator('.ocr-confirm').isDisabled(),true);
  assert.equal(await oversized.locator('.ocr-use').isDisabled(),true);
  await oversized.locator('.ocr-close').click();
  checks.push('oversized PDF scan fails visibly before blank-page approval');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks}));
} finally {
  await browser?.close(); await new Promise(resolve=>server.close(resolve));
}
