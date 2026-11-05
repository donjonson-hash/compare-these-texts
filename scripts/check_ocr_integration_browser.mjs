// Real OCR integration gate. Requires Chromium; extension checks never use a
// localhost substitute. Only synthetic fixtures are loaded.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const fixtures = path.join(root, 'experiments/ocr/fixtures');
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'test-output/ocr-integration'));
const target = process.env.CTT_OCR_TEST_TARGET || 'both';
assert.ok(['both', 'website', 'extension'].includes(target));
await mkdir(output, {recursive:true});
const report = {created_at:new Date().toISOString(), target, runs:[]};
const contextOptions = {viewport:{width:1440,height:1000}, acceptDownloads:true};
const launch = {headless:true,
  ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {channel:'chromium'})};
const analytics = 'https://www.googletagmanager.com/gtag/js?id=G-J33QPHR8L3';
const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.gz':'application/gzip'};

async function exercise(context, base, mode) {
  const run = {mode, base, checks:[], external_requests:[], page_errors:[], csp_errors:[]};
  report.runs.push(run);
  context.setDefaultTimeout(30000);
  context.on('request', request => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(base) && url !== analytics) run.external_requests.push(url);
    if (mode === 'extension' && url === analytics) run.external_requests.push(url);
  });
  if (mode === 'website') {
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url === analytics) return route.fulfill({body:'',contentType:'text/javascript'});
      if (/^https?:/.test(url) && !url.startsWith(base)) return route.abort();
      return route.continue();
    });
  } else await context.setOffline(true);
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  page.on('pageerror', error => run.page_errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error' && /content security policy|violates.*directive/i.test(message.text())) run.csp_errors.push(message.text());});
  await page.goto(new URL('index.html', base).href);
  await page.waitForFunction(() => window.KristinaTransport && document.getElementById('saved-session'));
  const modal = () => page.locator('dialog.ocr-review-dialog');
  const modalReady = async () => {
    await modal().waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const review = document.querySelector('dialog.ocr-review-dialog');
      return review && (!review.querySelector('.ocr-recognize').disabled ||
        /^(Could not load page|Cannot open document):/.test(review.querySelector('.ocr-status').textContent));
    }, null, {timeout:120000});
    assert.equal(await modal().locator('.ocr-recognize').isEnabled(), true, await modal().locator('.ocr-status').textContent());
  };
  const recognize = async language => {
    await modalReady(); await modal().locator('.ocr-language').selectOption(language);
    await modal().locator('.ocr-recognize').click();
    await page.waitForFunction(() => {
      const review = document.querySelector('dialog.ocr-review-dialog');
      return review && !review.querySelector('.ocr-recognize').disabled &&
        /^(Check this text against|Recognition failed:)/.test(review.querySelector('.ocr-status').textContent);
    }, null, {timeout:120000});
    assert.match(await modal().locator('.ocr-status').textContent(), /^Check this text against/);
    return modal().locator('.ocr-text').inputValue();
  };
  const uploadPair = async (a, b) => {
    await page.locator('#home-left-file').setInputFiles(path.join(fixtures, a));
    await page.locator('#home-right-file').setInputFiles(path.join(fixtures, b));
    await page.locator('#start-new-compare').click();
  };
  const visualReady = () => page.locator('#visual-review [data-save-side="right"]').waitFor({state:'visible',timeout:120000});
  const downloadB = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#visual-review [data-save-side="right"]').click()]);
    assert.equal(await download.failure(),null);
    return {name:download.suggestedFilename(), bytes:await readFile(await download.path())};
  };
  const checks = run.checks;
  await uploadPair('rus-paragraphs-a.png','rus-paragraphs-b.png');
  await modalReady();
  const preview = modal().locator('img');
  await page.waitForFunction(() => document.querySelector('.ocr-review-original img')?.naturalWidth > 0);
  assert.ok(await preview.isVisible());
  const [originalBounds, textBounds] = await Promise.all([preview.boundingBox(), modal().locator('.ocr-text').boundingBox()]);
  assert.ok(originalBounds && textBounds && originalBounds.x + originalBounds.width <= textBounds.x,
    'desktop review displays the original and editable text side by side');
  assert.equal(await modal().locator('.ocr-use').isDisabled(), true);
  assert.equal(await page.locator('#results').isHidden(),true,'unchecked OCR must not open comparison');
  const a = await recognize('rus+eng'); assert.match(a,/Заказчик/); assert.match(a,/15 ноября/);
  assert.equal(await modal().locator('.ocr-text').evaluate(element => element.translate),false);
  await modal().locator('.ocr-select-area').click();
  const rect = await preview.evaluate(img => {
    const r = img.getBoundingClientRect(), scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    return {x:r.x + (r.width - img.naturalWidth * scale) / 2, y:r.y + (r.height - img.naturalHeight * scale) / 2, width:img.naturalWidth*scale, height:img.naturalHeight*scale};
  });
  await page.mouse.move(rect.x + 1, rect.y + 1); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 1, rect.y + rect.height - 1, {steps:5}); await page.mouse.up();
  await modal().locator('.ocr-recognize-area').click();
  await modal().locator('.ocr-region-result').waitFor({state:'visible', timeout:120000});
  assert.match(await modal().locator('.ocr-region-text').inputValue(), /Заказчик/);
  assert.equal(await modal().locator('.ocr-text').inputValue(), a, 'area OCR does not overwrite page text');
  await modal().locator('.ocr-clear-area').click();
  checks.push('mixed Russian + English recognition; pointer selection; separate area OCR preserves page edits');
  await page.screenshot({path:path.join(output,`${mode}-ocr-review.png`)});
  await modal().locator('.ocr-confirm').click();
  await modal().locator('.ocr-use').click();
  await modalReady();
  assert.equal(await page.locator('#results').isHidden(),true,'first approved side cannot start comparison while second is unreviewed');
  const b = await recognize('rus'); assert.match(b,/Заказчик/); assert.match(b,/18 ноября/);
  await modal().locator('.ocr-confirm').click();
  await modal().locator('.ocr-text').fill(b+'\nReviewed manually: OCR integration fixture.');
  assert.equal(await modal().locator('.ocr-use').isDisabled(),true,'editing revokes page approval');
  await modal().locator('.ocr-confirm').click(); await modal().locator('.ocr-use').click();
  await visualReady();
  assert.ok(await page.locator('.visual-navigation').isVisible());
  const original = await downloadB();
  assert.match(original.name,/\.txt$/i);
  assert.match(original.bytes.toString('utf8'),/Reviewed manually: OCR integration fixture\./);
  checks.push('real Russian OCR on both image inputs; explicit per-side approval; edited OCR invalidates approval; normal comparison and TXT export');
  await page.screenshot({path:path.join(output,`${mode}-reviewed-comparison.png`),fullPage:true});

  await page.locator('[data-workspace-tools-open]').click();
  const more = page.locator('details.compact-review-tools');
  if (!await more.evaluate(element=>element.open)) await more.locator(':scope > summary').click();
  await page.locator('[data-action="copy-all-right"]').click();
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Undo edit in B"]').disabled);
  const edited = await downloadB();
  assert.notDeepEqual(edited.bytes,original.bytes);
  assert.match(edited.bytes.toString('utf8'),/15 ноября/);
  assert.doesNotMatch(edited.bytes.toString('utf8'),/Reviewed manually: OCR integration fixture/);
  await page.getByRole('button',{name:'Undo edit in B',exact:true}).click();
  assert.deepEqual((await downloadB()).bytes,original.bytes);
  checks.push('existing edit action changes actual downloaded text; Undo restores reviewed OCR output');

  await page.locator('#workspace-home').click();
  await uploadPair('rus-paragraphs-a.png','rus-paragraphs-b.png');
  await modalReady();
  assert.equal(await modal().locator('.ocr-language').inputValue(),'rus+eng','explicit language survives replacement');
  await recognize('rus'); await modal().locator('.ocr-confirm').click(); await modal().locator('.ocr-use').click();
  await modalReady();
  await modal().locator('.ocr-recognize').click();
  await modal().locator('.ocr-close').click();
  await page.locator('#start-compare').click(); await visualReady();
  assert.deepEqual((await downloadB()).bytes,original.bytes,'cancelling OCR preserves prior comparison and edited bytes');
  checks.push('cancel during second-side OCR after first-side approval preserves prior comparison; language remembered');

  await page.locator('#workspace-home').click();
  await uploadPair('pdf/mixed.pdf','eng-paragraphs-b.png');
  await modalReady();
  assert.match(await modal().locator('.ocr-text').inputValue(),/SYNTHETIC MIXED PDF/,'mixed PDF page one uses text layer');
  await modal().locator('.ocr-confirm').click();
  assert.equal(await modal().locator('.ocr-use').isDisabled(),true,'all PDF pages must be checked');
  await modal().locator('.ocr-page-select').selectOption('1');
  const scan = await recognize('eng'); assert.match(scan,/SYNTHETIC TEST DOCUMENT/);
  await modal().locator('.ocr-review-original details summary').click();
  await modal().locator('[data-coordinate="height"]').fill('60');
  await modal().locator('[data-coordinate="height"]').press('Tab');
  await modal().locator('.ocr-recognize-area').click();
  await modal().locator('.ocr-region-result').waitFor({state:'visible', timeout:120000});
  assert.match(await modal().locator('.ocr-region-text').inputValue(), /SYNTHETIC TEST DOCUMENT/);
  assert.equal(await modal().locator('.ocr-text').inputValue(), scan);
  await modal().locator('.ocr-region-text').fill('Checked region');
  await modal().locator('.ocr-text').evaluate(el => el.setSelectionRange(0, 0));
  await modal().locator('.ocr-apply-area').click();
  assert.equal(await modal().locator('.ocr-text').inputValue(), 'Checked region' + scan);
  assert.equal(await modal().locator('.ocr-use').isDisabled(), true);
  await modal().locator('.ocr-text').fill(scan);
  await modal().locator('.ocr-confirm').click();
  checks.push('PDF crop rendered separately; keyboard coordinates; explicit insert and approval invalidation');
  await modal().locator('.ocr-page-select').selectOption('0'); await modalReady();
  assert.match(await modal().locator('.ocr-text').inputValue(),/SYNTHETIC MIXED PDF/);
  await modal().locator('.ocr-page-select').selectOption('1'); await modalReady();
  assert.equal(await modal().locator('.ocr-text').inputValue(),scan,'page navigation preserves reviewed OCR');
  await modal().locator('.ocr-use').click();
  await recognize('eng'); await modal().locator('.ocr-confirm').click(); await modal().locator('.ocr-use').click();
  await visualReady();
  assert.match(await page.locator('#visual-review').innerText(),/SYNTHETIC MIXED PDF/);
  checks.push('mixed PDF text-layer and scanned-page review; all-page gate; navigation preserves text; confirmed result reaches main comparison');

  const priorB = await downloadB();
  await page.locator('[data-workspace-tools-open]').click();
  await page.locator('#workspace-tools-tab-files').click();
  await page.locator('#right-file').setInputFiles(path.join(fixtures, 'rus-paragraphs-b.png'));
  await modalReady();
  await modal().locator('.ocr-close').click();
  await modal().waitFor({state:'hidden'});
  assert.deepEqual((await downloadB()).bytes, priorB.bytes,
    'cancel from the in-workspace file picker preserves the old document');
  checks.push('in-workspace file replacement uses the same confirmation gate and preserves B on cancel');

  await page.locator('#header-edit').click();
  await page.locator('#single-file').setInputFiles(path.join(fixtures, 'rus-paragraphs-a.png'));
  await modalReady();
  assert.equal(await page.locator('#single-editor-host .single-review').count(), 0);
  const single = await recognize('rus');
  assert.match(single, /15 ноября/);
  await modal().locator('.ocr-confirm').click(); await modal().locator('.ocr-use').click();
  const singleSave = page.locator('#single-editor-host [data-save-side="left"]');
  const [singleDownload] = await Promise.all([page.waitForEvent('download'), singleSave.click()]);
  assert.equal(await singleDownload.failure(), null);
  assert.match(singleDownload.suggestedFilename(), /\.txt$/i);
  assert.match(await readFile(await singleDownload.path(), 'utf8'), /15 ноября/);
  await page.reload();
  await page.locator('#header-edit').click();
  await page.locator('#single-file').setInputFiles(path.join(fixtures, 'rus-paragraphs-b.png'));
  await modalReady();
  assert.equal(await modal().locator('.ocr-language').inputValue(), 'rus', 'explicit OCR language survives page reload');
  await modal().locator('.ocr-close').click();
  checks.push('single-document image review opens the TXT editor and exports checked text; language persists across reload');

  assert.deepEqual(run.external_requests,[],'document recognition has no external network requests');
  assert.deepEqual(run.page_errors,[]); assert.deepEqual(run.csp_errors,[],'packaged runtime must satisfy its real CSP');
  run.status='passed';
  await page.close();
}

let browser, context, server, temporary;
try {
  if (target !== 'extension') {
    server = createServer(async (request,response) => {
      try {
        const url = new URL(request.url,'http://localhost');
        const filename = path.resolve(build,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!filename.startsWith(build+path.sep)) {response.writeHead(403).end();return;}
        response.setHeader('Content-Type',mime[path.extname(filename)] || 'application/octet-stream');
        response.end(await readFile(filename));
      } catch {response.writeHead(404).end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({...launch,args:['--no-sandbox','--disable-gpu']});
    report.browser=browser.version(); context=await browser.newContext(contextOptions);
    await exercise(context,`http://127.0.0.1:${server.address().port}/`,'website');
    await context.close();context=null;await browser.close();browser=null;
    await new Promise(resolve=>server.close(resolve));server=null;
  }
  if (target !== 'website') {
    temporary=await mkdtemp(path.join(tmpdir(),'ctt-ocr-extension-'));
    const unpacked=path.join(temporary,'extension'), release=JSON.parse(await readFile(path.join(root,'release.json'),'utf8'));
    execFileSync('python3',['-m','zipfile','-e',path.join(build,'downloads',`ctt-chrome-${release.version}.zip`),unpacked]);
    context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{...launch,...contextOptions,args:['--no-sandbox','--disable-gpu',`--disable-extensions-except=${unpacked}`,`--load-extension=${unpacked}`]});
    const worker=context.serviceWorkers().find(worker=>worker.url().startsWith('chrome-extension:')) || await context.waitForEvent('serviceworker',{timeout:15000});
    assert.ok(worker.url().startsWith('chrome-extension:'),'an actual installed extension is required');
    await exercise(context,new URL('.',worker.url()).href,'extension');
  }
  report.status='passed'; console.log(JSON.stringify(report,null,2));
} catch(error) {
  report.status='failed';report.error=error.stack;throw error;
} finally {
  await writeFile(path.join(output,'ocr-integration-browser.json'),JSON.stringify(report,null,2)+'\n');
  if(context)await context.close();if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(temporary)await rm(temporary,{recursive:true,force:true});
}
