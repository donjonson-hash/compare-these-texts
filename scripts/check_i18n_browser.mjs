// CI-only browser coverage of the packaged, translated product. Uses synthetic
// documents and the real language picker; no translation service is contacted.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const engine = process.env.BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const playwright = await import(process.env.PLAYWRIGHT_MODULE || (engine === 'webkit' ? 'playwright-webkit-check' : 'playwright'));
const root = fileURLToPath(new URL('../', import.meta.url));
const localeCodes = JSON.parse(await readFile(path.join(root, 'i18n', 'locales.json'), 'utf8')).map(locale => locale.code);
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'test-output', 'i18n-' + engine));
await mkdir(output, {recursive:true});
const report = {engine:`Playwright ${engine} on ${process.platform}`, checks:[], page_errors:[], csp_errors:[], external_requests:[]};
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
const sourceA = ['Download', 'Find', 'Shared introduction.', 'Delivery within 5 days.', 'Общий последний абзац.', '保存する'].join('\n');
const sourceB = sourceA.replace('5 days', '10 days');
const editedB = sourceB.replace('10 days', '15 days');
const scripts = {ru:/[\u0400-\u04ff]/u, ar:/[\u0600-\u06ff]/u, ja:/[\u3040-\u30ff\u4e00-\u9fff]/u, de:/[A-Za-zÄÖÜäöüß]/u};
let browser, context, temporary;

async function monitor(ctx, label, localOrigin) {
  ctx.setDefaultTimeout(30000);
  // Native tracing avoids WebKit screenshot-preparation styles violating CSP.
  await ctx.tracing.start({screenshots:true, snapshots:true, sources:true});
  const watch = page => {
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => report.page_errors.push({surface:label, message:error.message}));
    page.on('console', message => {
      if (message.type() === 'error' && /content security policy|violates.*directive/i.test(message.text())) report.csp_errors.push({surface:label, message:message.text()});
    });
  };
  ctx.pages().forEach(watch); ctx.on('page', watch);
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (localOrigin && url === analytics) return route.fulfill({body:'',contentType:'text/javascript'});
    if (/^https?:/.test(url) && (!localOrigin || new URL(url).origin !== localOrigin)) {
      report.external_requests.push({surface:label,url}); return route.abort();
    }
    return route.continue();
  });
}
async function switchLanguage(page, locale) {
  await page.locator('[data-i18n-selector]').selectOption(locale);
  await page.waitForFunction(code => document.documentElement.lang === code && document.querySelector('[data-i18n-selector]')?.value === code && !document.querySelector('[data-i18n-selector]').disabled, locale);
  assert.equal(await page.locator('html').getAttribute('dir'), locale === 'ar' ? 'rtl' : 'ltr');
}
async function assertPicker(page) {
  const values = await page.locator('[data-i18n-selector] option').evaluateAll(options => options.map(option => option.value));
  assert.deepEqual(values, localeCodes, 'the shipped picker matches the canonical release locales');
}
async function downloadText(page, scope, side) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(`${scope} [data-save-side="${side}"]`).click()]);
  assert.match(download.suggestedFilename(), /\.txt$/i, 'plain text remains a TXT export');
  const exported = await readFile(await download.path(), 'utf8');
  // TXT export closes the final block with LF. Compare the document body without that delimiter.
  assert.ok(exported.endsWith('\n'), 'TXT export closes the final block with LF');
  return exported.slice(0, -1);
}
async function assertComparison(page, a, b, marks) {
  // Typing deliberately removes stale marks until the live preview catches up.
  await page.waitForFunction(({texts, expectedMarks}) => {
    const columns = [...document.querySelectorAll('#visual-review .visual-column')];
    return columns.length === 2 && columns.every((column,index) => {
      const paragraphs = [...column.querySelectorAll('.visual-paragraph')];
      const changed = paragraphs.find(node => node.textContent.startsWith('Delivery within'));
      return JSON.stringify(paragraphs.map(node => node.textContent)) === JSON.stringify(texts[index].split('\n')) && changed && [...changed.querySelectorAll('mark.visual-text-change')].map(node => node.textContent).join('') === expectedMarks[index];
    });
  }, {texts:[a,b],expectedMarks:marks});
  const columns = page.locator('#visual-review .visual-column');
  assert.equal(await columns.count(), 2);
  for (const [index, text] of [a,b].entries()) {
    const paragraphs = columns.nth(index).locator('.visual-paragraph');
    assert.deepEqual(await paragraphs.allTextContents(), text.split('\n'), 'every original document character remains in its own version');
    const common = paragraphs.filter({hasText:'Shared introduction.'});
    assert.equal(await common.locator('mark.visual-text-change').count(), 0, 'identical text is not highlighted');
    const changed = paragraphs.filter({hasText:'Delivery within'});
    assert.equal(await changed.locator('mark.visual-text-change').allTextContents().then(parts => parts.join('')), marks[index], 'only the actual changed value is highlighted');
    assert.equal(await changed.evaluate(node => node.classList.contains('has-difference')), true);
  }
  const boxes = await columns.evaluateAll(nodes => nodes.map(node => ({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right})));
  assert.ok(boxes[0].right <= boxes[1].left + 2, 'original A stays to the left of revised B in RTL interfaces');
  assert.ok(await page.locator('#single-workspace').isHidden(), 'comparison does not reuse the independent editor');
  assert.equal(await page.locator('#home-ocr, input[id$="-ocr"], [data-ocr]').count(), 0, 'language changes never reintroduce scanner state or OCR controls');
}
async function exerciseEditor(page, label) {
  await page.locator('#start-menu').waitFor({state:'visible'});
  await assertPicker(page);
  // The words Download and Find deliberately also match interface catalog keys.
  await page.locator('#home-left-text').fill(sourceA);
  await page.locator('#home-right-text').fill(sourceB);
  const staged = page.locator('#home-right-text');
  await staged.evaluate(node => {node.focus(); node.setSelectionRange(10,18);});
  const stagedHandle = await staged.elementHandle();
  await switchLanguage(page, 'en');
  const englishCompare = await page.locator('#start-new-compare').innerText();
  for (const locale of ['ru','ja','de','ar']) {
    await switchLanguage(page, locale);
    assert.equal(await page.locator('#home-left-text').inputValue(), sourceA);
    assert.equal(await staged.inputValue(), sourceB);
    assert.equal(await staged.evaluate((node, original) => node === original, stagedHandle), true, 'the input element is retained');
    assert.deepEqual(await staged.evaluate(node => [node.selectionStart,node.selectionEnd]), [10,18], 'a staged selection survives the language change');
    const labelText = await page.locator('#start-new-compare').innerText();
    assert.notEqual(labelText, englishCompare, `${locale} shows an actual translated compare button`);
    assert.match(labelText, scripts[locale]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'translated home controls fit the desktop viewport');
    const homes = await page.locator('.home-source').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left));
    assert.ok(homes[0] < homes[1], 'the two input versions retain their order');
  }
  await stagedHandle.dispose();
  report.checks.push(`${label}: four translated locales retain staged document text, selection and A/B order`);
  await page.locator('#start-new-compare').click();
  await page.locator('#visual-review [data-save-side="right"]').waitFor({state:'visible'});
  await assertComparison(page, sourceA, sourceB, ['5','10']);
  assert.match(await page.locator('#visual-review .visual-progress').innerText(), scripts.ar, 'comparison status created after OCR-free text processing is localized');
  await page.locator('#visual-review .visual-column').nth(1).locator('.visual-paragraph').filter({hasText:'Delivery within 10 days.'}).click();
  const edited = page.locator('#visual-review [data-edit-side="right"]');
  await edited.fill('Delivery within 15 days.');
  await edited.evaluate(node => {node.focus(); node.setSelectionRange(9,15);});
  const editedHandle = await edited.elementHandle();
  await switchLanguage(page, 'en');
  const englishDownload = await page.locator('#visual-review [data-save-side="right"]').innerText();
  for (const locale of ['ar','ja','de','ru']) {
    await switchLanguage(page, locale);
    assert.equal(await edited.evaluate((node, original) => node === original, editedHandle), true, 'language updates do not rebuild the active editor');
    assert.equal(await edited.inputValue(), 'Delivery within 15 days.');
    assert.deepEqual(await edited.evaluate(node => [node.selectionStart,node.selectionEnd]), [9,15]);
    const downloadLabel = await page.locator('#visual-review [data-save-side="right"]').innerText();
    assert.notEqual(downloadLabel, englishDownload, 'dynamically created download labels switch languages');
    assert.match(downloadLabel, scripts[locale]);
    await assertComparison(page, sourceA, editedB, ['5','15']);
  }
  await editedHandle.dispose();
  assert.equal(await downloadText(page, '#visual-review', 'left'), sourceA);
  assert.equal(await downloadText(page, '#visual-review', 'right'), editedB, 'the download includes the correction, not a translated or stale document');
  report.checks.push(`${label}: dynamic labels translate; editing/caret, exact highlights and downloaded document bytes survive all switches`);
  // A separate editor must never become the comparison's previous OCR document.
  await page.locator('#workspace-home').click();
  await page.locator('#header-edit').click();
  await page.locator('#single-paste > summary').click();
  const independent = 'Download\nIndependent agreement — keep this document.';
  await page.locator('#single-paste-text').fill(independent);
  await page.locator('#single-paste-open').click();
  await page.locator('#single-editor-host [data-save-side="left"]').waitFor({state:'visible'});
  assert.equal(await downloadText(page, '#single-editor-host', 'left'), independent);
  await switchLanguage(page, 'ja');
  await page.locator('#workspace-home').click();
  await page.locator('#start-compare').click();
  await page.locator('#visual-review [data-save-side="right"]').waitFor({state:'visible'});
  await assertComparison(page, sourceA, editedB, ['5','15']);
  assert.equal(await downloadText(page, '#visual-review', 'right'), editedB);
  assert.ok(!await page.locator('#visual-review').innerText().then(text => text.includes('Independent agreement')), 'comparison contains no text from the independent editor');
  await page.locator('#workspace-home').click();
  await page.locator('#start-edit').click();
  await page.locator('#single-editor-host [data-save-side="left"]').waitFor({state:'visible'});
  assert.equal(await downloadText(page, '#single-editor-host', 'left'), independent);
  report.checks.push(`${label}: Home/Compare/Edit navigation preserves separate documents and never opens a scanner`);
}
try {
  browser = await playwright[engine].launch({headless:true, ...(engine === 'chromium' ? {channel:'chromium',args:['--no-sandbox']} : {})});
  context = await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',acceptDownloads:true});
  await monitor(context, 'website', origin);
  const page = await context.newPage();
  await page.goto(origin + '/');
  await exerciseEditor(page, 'website');
  await context.tracing.stop({path:path.join(output,'website-trace.zip')});
  await context.close(); context = null; await browser.close(); browser = null;
  if (engine === 'chromium') {
    temporary = await mkdtemp(path.join(tmpdir(),'ctt-i18n-extension-'));
    const unpacked = path.join(temporary,'extension');
    const release = JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
    execFileSync('python3',['-m','zipfile','-e',path.join(build,'downloads',`ctt-chrome-${release.version}.zip`),unpacked]);
    context = await playwright.chromium.launchPersistentContext(path.join(temporary,'profile'),{headless:true,channel:'chromium',viewport:{width:1440,height:1000},locale:'en-US',acceptDownloads:true,args:['--no-sandbox',`--disable-extensions-except=${unpacked}`,`--load-extension=${unpacked}`]});
    await monitor(context, 'installed extension', null);
    let worker = context.serviceWorkers().find(item => item.url().startsWith('chrome-extension:'));
    if (!worker) worker = await context.waitForEvent('serviceworker',{timeout:15000});
    assert.ok(worker.url().startsWith('chrome-extension:'), 'checks require the real installed extension; no HTTP fallback');
    const base = new URL('.',worker.url()).href;
    await context.setOffline(true);
    const page = await context.newPage();
    await page.goto(new URL('welcome.html',base).href);
    await assertPicker(page);
    await switchLanguage(page,'ru');
    assert.match(await page.locator('h1').innerText(),scripts.ru,'welcome content is translated offline');
    await page.goto(new URL('index.html',base).href);
    await page.waitForFunction(() => document.documentElement.lang === 'ru');
    report.checks.push('installed extension: welcome loads Russian offline and retains that language in the editor');
    await exerciseEditor(page, 'installed extension offline');
    await context.tracing.stop({path:path.join(output,'extension-offline-trace.zip')});
    await context.close(); context = null;
  }
  assert.deepEqual(report.page_errors, [], 'no uncaught browser errors');
  assert.deepEqual(report.csp_errors, [], 'the real strict CSP accepts every tested language flow');
  assert.deepEqual(report.external_requests, [], 'document and translation flows make no external requests');
  report.passed = true;
  console.log(`PASS: ${report.checks.length} multilingual browser flows (${engine})`);
} catch (error) {
  report.passed = false; report.failure = error.stack || String(error); throw error;
} finally {
  if (context) {await context.tracing.stop({path:path.join(output,'failure-trace.zip')}).catch(()=>{}); await context.close().catch(()=>{});}
  if (browser) await browser.close().catch(()=>{});
  await new Promise(resolve => server.close(resolve));
  if (temporary) await rm(temporary,{recursive:true,force:true});
  await writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');
}
