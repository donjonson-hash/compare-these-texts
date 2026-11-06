// CI regression for the browser engine used by Safari. This is Playwright WebKit,
// not a claim that a particular macOS/Safari release has been tested.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';

const {webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'test-output/webkit'));
await mkdir(output, {recursive:true});
const report = {engine:`Playwright WebKit on ${process.platform}`, checks:[], page_errors:[], csp_errors:[], external_requests:[]};
const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2', '.ttf':'font/ttf'};
const server = createServer(async (request, response) => {
  try {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name.endsWith('/')) name += 'index.html';
    const filename = path.resolve(build, '.' + name);
    if (!filename.startsWith(build + path.sep)) {response.writeHead(403).end(); return;}
    response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
    response.end(await readFile(filename));
  } catch {response.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const analytics = 'https://www.googletagmanager.com/gtag/js?id=G-J33QPHR8L3';
let browser, context, page;
try {
  browser = await webkit.launch({headless:true});
  context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  context.setDefaultTimeout(30000);
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === analytics) return route.fulfill({body:'',contentType:'text/javascript'});
    if (/^https?:/.test(url) && new URL(url).origin !== origin) {
      report.external_requests.push(url); return route.abort();
    }
    return route.continue();
  });
  page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => report.page_errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /content security policy|violates.*directive/i.test(message.text())) report.csp_errors.push(message.text());
  });
  const home = async () => {
    await page.locator('#workspace-home').click();
    await page.locator('#start-menu').waitFor({state:'visible'});
  };
  const ready = async () => {
    await page.locator('#visual-review [data-save-side="right"]').waitFor({state:'visible'});
    assert.ok(await page.locator('#single-workspace').isHidden(), 'comparison keeps the independent OCR editor hidden');
  };
  const saved = id => page.waitForFunction(id => document.getElementById(id)?.textContent.includes('Saved in this browser'), id);
  const textOcrControls = async () => {
    for (const side of ['left','right']) {
      assert.ok(await page.locator(`#home-${side}-ocr-label`).isHidden(), 'OCR option is hidden for pasted text');
      assert.ok(await page.locator(`#home-${side}-ocr`).isDisabled(), 'hidden OCR option cannot remain interactive');
      assert.equal(await page.locator(`#home-${side}-ocr`).isChecked(), false, 'pasted text carries no previous PDF OCR intent');
    }
  };
  const compareTexts = async (a, b) => {
    await page.locator('#home-left-text').fill(a);
    await page.locator('#home-right-text').fill(b);
    await textOcrControls();
    await page.locator('#start-new-compare').click();
    await ready(); await saved('session-status');
  };
  const assertHighlights = async (common, left, right, expectedMarks) => {
    const columns = page.locator('#visual-review .visual-column');
    assert.equal(await columns.count(), 2);
    for (const [index, changed] of [[0,left],[1,right]]) {
      const paragraphs = columns.nth(index).locator('.visual-paragraph');
      const nodes = await paragraphs.evaluateAll(elements => elements.map(element => ({
        text:element.textContent, different:element.classList.contains('has-difference'),
        marks:[...element.querySelectorAll('mark.visual-text-change')].map(mark => ({text:mark.textContent, background:getComputedStyle(mark).backgroundColor})),
      })));
      for (const same of common) {
        const node = nodes.find(node => node.text === same);
        assert.ok(node, `common paragraph exists: ${same}`);
        assert.equal(node.different, false, `identical paragraph is not a difference: ${same}`);
        assert.deepEqual(node.marks, [], 'identical paragraph has no changed-text highlights');
      }
      const node = nodes.find(node => node.text === changed);
      assert.ok(node?.different, `changed paragraph is highlighted: ${changed}`);
      assert.ok(node.marks.length > 0, 'changed words have visible highlight elements');
      assert.ok(node.marks.some(mark => mark.background !== 'rgba(0, 0, 0, 0)' && mark.background !== 'transparent'), 'changed-text highlight has an actual WebKit background');
      assert.ok(node.marks.map(mark => mark.text).join('').length < changed.length, 'unchanged context in a differing paragraph is not all highlighted');
      assert.equal(node.marks.map(mark => mark.text).join(''), expectedMarks[index], 'only the exact changed substring is marked');
    }
  };
  await page.goto(origin + '/');
  await page.locator('#start-menu').waitFor({state:'visible'});
  const shared = ['Shared introduction.', 'Общий последний абзац.'];
  const firstA = [shared[0], 'Delivery within 5 days.', shared[1]].join('\n');
  const firstB = [shared[0], 'Delivery within 10 days.', shared[1]].join('\n');
  await compareTexts(firstA, firstB);
  await assertHighlights(shared, 'Delivery within 5 days.', 'Delivery within 10 days.', ['5','10']);
  report.checks.push('fresh browser: identical English/Cyrillic paragraphs unhighlighted; only changed text has a rendered highlight');

  // Use the public manual OCR review path. Recognition accuracy/model downloads
  // are covered by check:ocr; this gate isolates the saved-work transition.
  await home(); await page.locator('#home-ocr').click();
  const canvas = createCanvas(500,160), drawing = canvas.getContext('2d');
  drawing.fillStyle = '#fff'; drawing.fillRect(0,0,500,160);
  drawing.fillStyle = '#111'; drawing.font = '24px sans-serif'; drawing.fillText('Previous OCR document', 20,70);
  await page.locator('#single-file').setInputFiles({name:'previous-ocr.png',mimeType:'image/png',buffer:canvas.toBuffer('image/png')});
  const modal = page.locator('dialog.ocr-review-dialog');
  await modal.waitFor({state:'visible'});
  await page.waitForFunction(() => !document.querySelector('.ocr-recognize')?.disabled);
  const oldOcrText = 'Previous OCR document. This must not replace the new comparison.';
  await modal.locator('.ocr-text').fill(oldOcrText);
  await modal.locator('.ocr-confirm').click();
  await modal.locator('.ocr-use').click();
  await page.locator('#single-editor-host .ocr-document img').waitFor({state:'visible'});
  await saved('single-session-status');
  await home();
  // Stage a PDF and then abandon it for pasted text. No PDF parsing should occur.
  await page.locator('#home-left-file').setInputFiles({name:'abandoned.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n')});
  await page.locator('#home-left-ocr').check();
  await page.locator('#home-left-paste').click();
  const nextShared = ['New comparison only.', 'Общие условия поставки.'];
  const nextA = [nextShared[0], 'Цена заказа 100 рублей.', nextShared[1]].join('\n');
  const nextB = [nextShared[0], 'Цена заказа 200 рублей.', nextShared[1]].join('\n');
  await compareTexts(nextA, nextB);
  await assertHighlights(nextShared, 'Цена заказа 100 рублей.', 'Цена заказа 200 рублей.', ['100','200']);
  assert.doesNotMatch(await page.locator('#visual-review').innerText(), /Previous OCR document/);
  report.checks.push('saved single OCR → Home → staged PDF OCR → Paste text instead → fresh comparison; old OCR does not replace the pair');
  await page.screenshot({path:path.join(output,'fresh-comparison-after-ocr.png'),fullPage:true});

  await home(); await page.locator('#start-edit').click();
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('.ocr-document-text-download').click()]);
  assert.equal(await download.failure(), null);
  assert.equal(await readFile(await download.path(),'utf8'), oldOcrText, 'returning to the separate OCR editor preserves its own document');
  await home(); await page.locator('#start-compare').click(); await ready();
  await assertHighlights(nextShared, 'Цена заказа 100 рублей.', 'Цена заказа 200 рублей.', ['100','200']);
  await page.reload();
  await page.locator('#session-resume').click(); await ready();
  await assertHighlights(nextShared, 'Цена заказа 100 рублей.', 'Цена заказа 200 рублей.', ['100','200']);
  report.checks.push('explicit Continue editing preserves the OCR source; Continue comparison and reload/resume retain the new pair');

  await home();
  const identical = 'Identical text.\nОдинаковый текст.';
  await compareTexts(identical, identical);
  assert.equal(await page.locator('#visual-review .visual-paragraph.has-difference').count(), 0);
  assert.equal(await page.locator('#visual-review mark.visual-text-change').count(), 0);
  assert.match(await page.locator('#visual-review').innerText(), /Texts match/);
  report.checks.push('identical pasted texts after restoring saved work have no difference highlights');
  assert.deepEqual(report.page_errors, []);
  assert.deepEqual(report.csp_errors, []);
  assert.deepEqual(report.external_requests, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error);
  if (page) await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await context?.tracing.stop({path:path.join(output,'trace.zip')}).catch(() => {});
  await context?.close(); await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
