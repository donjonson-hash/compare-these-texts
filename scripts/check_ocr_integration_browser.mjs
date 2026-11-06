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
  const openPlain = async () => { if (!(await modal().locator('.ocr-plain-text').getAttribute('open')) && !(await modal().locator('.ocr-text').isVisible())) await modal().locator('.ocr-plain-text > summary').click(); };
  const checks = run.checks;
  await uploadPair('rus-paragraphs-a.png','rus-paragraphs-b.png');
  await modalReady();
  const preview = modal().locator('.ocr-review-original img');
  await page.waitForFunction(() => document.querySelector('.ocr-review-original img')?.naturalWidth > 0);
  assert.ok(await preview.isVisible());
  const [originalBounds, textBounds] = await Promise.all([preview.boundingBox(), modal().locator('.ocr-text').boundingBox()]);
  assert.ok(originalBounds && textBounds && originalBounds.x + originalBounds.width <= textBounds.x,
    'desktop review displays the original and editable text side by side');
  assert.equal(await modal().locator('.ocr-use').isDisabled(), true);
  assert.equal(await page.locator('#results').isHidden(),true,'unchecked OCR must not open comparison');
  const a = await recognize('rus+eng'); assert.match(a,/Заказчик/); assert.match(a,/15 ноября/);
  assert.equal(await modal().locator('.ocr-text').evaluate(element => element.translate),false);
  // Exercise the real module worker and real OCR without silently adopting either.
  const checkedText = a + '\nManual correction before image improvement.';
  await openPlain(); await modal().locator('.ocr-text').fill(checkedText);
  await modal().locator('.ocr-confirm').click();
  const openEnhancement = async () => {
    await modal().locator('.ocr-improve').click();
    await page.waitForFunction(() => !document.querySelector('.ocr-enhance-recognize').disabled, null, {timeout:60000});
    const images = modal().locator('.ocr-enhancement-images img');
    assert.equal(await images.count(), 2);
    const dimensions = await images.evaluateAll(items => items.map(img => [img.naturalWidth, img.naturalHeight]));
    assert.ok(dimensions[0][0] > 0);
    assert.deepEqual(dimensions[0], dimensions[1], 'processing preserves image dimensions');
    assert.equal(await modal().locator('.ocr-text').inputValue(), checkedText);
    return images;
  };
  const images = await openEnhancement();
  assert.equal(await modal().locator('.ocr-enhancement-result').isHidden(), true, 'preparing a preview does not run OCR');
  const bounds = await images.evaluateAll(items => items.map(img => { const r = img.getBoundingClientRect(); return {x:r.x, width:r.width}; }));
  assert.ok(bounds[0].x + bounds[0].width <= bounds[1].x, 'desktop previews sit side by side');
  await page.screenshot({path:path.join(output,`${mode}-image-improvement-desktop.png`)});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await modal().evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'mobile preview has no horizontal overflow');
  await page.screenshot({path:path.join(output,`${mode}-image-improvement-mobile.png`)});
  await page.keyboard.press('Escape');
  assert.equal(await modal().isVisible(), true, 'Escape exits preview before closing review');
  assert.equal(await modal().locator('.ocr-text').inputValue(), checkedText);
  assert.equal(await modal().locator('.ocr-use').isEnabled(), true, 'discarding preview preserves approval');
  await page.setViewportSize(contextOptions.viewport);
  await openEnhancement();
  await modal().locator('.ocr-enhance-recognize').click();
  await modal().locator('.ocr-enhance-apply').waitFor({state:'visible', timeout:120000});
  await page.waitForFunction(() => !document.querySelector('.ocr-enhance-apply').disabled, null, {timeout:120000});
  assert.match(await modal().locator('.ocr-enhanced-text').inputValue(), /Заказчик/);
  assert.equal(await modal().locator('.ocr-text').inputValue(), checkedText, 'new OCR remains staged');
  const correctedDraft = a + '\nManually corrected candidate to preserve.';
  await modal().locator('.ocr-enhanced-text').fill(correctedDraft);
  await modal().locator('.ocr-enhance-recognize').click();
  await page.waitForFunction(() => !document.querySelector('.ocr-enhance-apply').disabled, null, {timeout:120000});
  assert.notEqual(await modal().locator('.ocr-enhanced-text').inputValue(), correctedDraft);
  await modal().locator('.ocr-enhance-discard').click();
  await openEnhancement();
  await modal().locator('.ocr-enhance-restore').click();
  assert.equal(await modal().locator('.ocr-enhanced-text').inputValue(), correctedDraft,
    'previous manually edited draft survives successful retry and reopening the preview');
  assert.equal(await modal().locator('.ocr-text').inputValue(), checkedText);
  await modal().locator('.ocr-enhanced-text').fill(a);
  await modal().locator('.ocr-enhance-apply').click();
  assert.equal(await modal().locator('.ocr-enhancement-preview').isHidden(), true);
  assert.equal(await modal().locator('.ocr-text').inputValue(), a, 'explicit adoption uses edited draft');
  assert.equal(await modal().locator('.ocr-use').isDisabled(), true, 'adoption revokes old approval');
  checks.push('real image worker; same-size original/improved previews; mobile layout; Escape preserves checked text and approval; edited draft restored after retry and reopening; improved OCR remains staged until explicit adoption');
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
  await modal().locator('.ocr-region-text').fill('Manually corrected area draft');
  await recognize('rus+eng');
  assert.equal(await modal().locator('.ocr-region-result').isVisible(), true, 'full-page OCR preserves the area draft');
  assert.equal(await modal().locator('.ocr-region-text').inputValue(), 'Manually corrected area draft');
  await modal().locator('.ocr-clear-area').click();
  checks.push('mixed Russian + English recognition; pointer selection; separate area OCR preserves page edits');
  await page.screenshot({path:path.join(output,`${mode}-ocr-review.png`)});
  await modal().locator('.ocr-confirm').click();
  await modal().locator('.ocr-use').click();
  await modalReady();
  assert.equal(await page.locator('#results').isHidden(),true,'first approved side cannot start comparison while second is unreviewed');
  const b = await recognize('rus'); assert.match(b,/Заказчик/); assert.match(b,/18 ноября/);
  await modal().locator('.ocr-confirm').click();
  await openPlain(); await modal().locator('.ocr-text').fill(b+'\nReviewed manually: OCR integration fixture.');
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
  await openPlain(); await modal().locator('.ocr-text').fill(scan);
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
  await page.locator('#single-editor-host .ocr-document img').waitFor({state:'visible'});
  assert.ok(await page.locator('#single-editor-host .ocr-document-region').count() > 0, 'recognized positions survive the review boundary');
  const [originalDownload] = await Promise.all([page.waitForEvent('download'), page.locator('.ocr-document-original').click()]);
  assert.deepEqual(await readFile(await originalDownload.path()), await readFile(path.join(fixtures,'rus-paragraphs-a.png')), 'original scan bytes are preserved');
  const singleSave = page.locator('#single-editor-host .ocr-document-text-download');
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
  checks.push('single-document review preserves original image and locations, exports original bytes and checked text separately; language persists across reload');

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
