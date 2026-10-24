// Focused browser check for the compact comparison workspace. Uses only the
// bundled synthetic Word documents; no uploaded/private files or remote calls.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {peripheralFixture} from '../tests/fixtures/docx-headers-fixture.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'test-output', 'compact'));
const baseline = process.env.BASELINE_ONLY === '1';
await mkdir(output, {recursive:true});
const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2'};
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
let browser;
const errors = [], externalRequests = [];
try {
  browser = await chromium.launch({headless:true, args:['--no-sandbox'], ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {channel:'chromium'})});
  const context = await browser.newContext({viewport:{width:1360,height:900},acceptDownloads:true});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  let dismissNextDialog = false;
  page.on('dialog', dialog => {if (dismissNextDialog) {dismissNextDialog = false; void dialog.dismiss();} else void dialog.accept();});
  page.on('request', request => {if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) externalRequests.push(request.url());});
  const ready = () => page.locator('#visual-review [data-save-side="right"]').waitFor({state:'visible'});
  const saved = () => page.waitForFunction(() => document.getElementById('session-status')?.textContent.includes('Saved in this browser'));
  const downloadB = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#visual-review [data-save-side="right"]').click(),
    ]);
    return readFile(await download.path());
  };
  await page.goto(origin + '/');
  if (!baseline) {
    await page.locator('#start-menu').waitFor({state:'visible'});
    assert.ok(await page.locator('#start-new-compare').isDisabled(), 'fresh home requires both inputs');
    await page.locator('#home-help-open').click();
  }
  await page.locator('#demo').click();
  await ready(); await saved();
  await page.evaluate(async () => {await document.fonts.ready; window.scrollTo(0,0);});
  const firstText = page.locator('.visual-columns .visual-column').first().locator('.visual-paragraph').filter({hasText:'Office delivery agreement'}).first();
  const metrics = await firstText.evaluate(element => ({firstDocumentTextTop:element.getBoundingClientRect().top, firstDocumentTextBottom:element.getBoundingClientRect().bottom, viewportHeight:innerHeight, viewportWidth:innerWidth}));
  await page.screenshot({path:path.join(output, baseline ? 'compact-before.png' : 'compact-after.png'), animations:'disabled'});
  if (!baseline) {
    assert.ok(metrics.firstDocumentTextTop >= 0 && metrics.firstDocumentTextBottom < metrics.viewportHeight, 'Actual document text must be visible immediately at the top of a desktop comparison');
    assert.ok(await page.locator('.visual-navigation').isVisible(), 'difference navigation remains available');
    const tools = page.locator('dialog.workspace-tools-dialog');
    const toolsButton = page.locator('[data-workspace-tools-open]');
    const openTools = async () => {if (!await tools.evaluate(element => element.open)) await toolsButton.click();};
    const closeTools = async () => {if (await tools.evaluate(element => element.open)) await page.locator('[data-workspace-tools-close]').click();};
    assert.ok(await tools.isHidden(), 'secondary information starts hidden');
    for (const selector of ['#saved-session', '.work-mode-switch', '#source-picker', '.review-flow', '#office-open']) {
      assert.ok(await page.locator(selector).isHidden(), `${selector} does not occupy the comparison header`);
    }
    await openTools();
    assert.ok(await page.locator('#saved-session').isVisible(), 'saved status remains accessible in Tools & info');
    await page.keyboard.press('Escape');
    await tools.waitFor({state:'hidden'});
    assert.equal(await toolsButton.evaluate(element => document.activeElement === element), true, 'Escape returns keyboard focus to the tools button');
    await openTools();
    const sourcePicker = page.locator('#source-picker');
    assert.equal(await sourcePicker.evaluate(element => element.open), false, 'loaded source controls start collapsed');
    await sourcePicker.locator(':scope > summary').click();
    assert.ok(await page.locator('#left-drop').isVisible(), 'source replacement remains accessible');
    await sourcePicker.locator(':scope > summary').click();
    const sessionDetails = page.locator('#saved-session details.session-details');
    await sessionDetails.locator(':scope > summary').click();
    assert.ok(await page.locator('#session-delete').isVisible(), 'saved-work deletion remains accessible');
    await sessionDetails.locator(':scope > summary').click();
    const more = tools.locator('details.compact-review-tools');
    await more.locator(':scope > summary').click();
    const help = more.locator('details.visual-help');
    await help.locator(':scope > summary').click();
    assert.match(await help.innerText(), /Click any text|Highlights/);
    assert.ok(await help.locator('.visual-instruction').isVisible(), 'review instructions remain discoverable');
    await more.locator(':scope > summary').click();
    await closeTools();
    const original = await downloadB();

    await openTools();
    await page.locator('[data-review-action="start"]').click();
    await tools.waitFor({state:'hidden'});
    await page.locator('[data-review-action="keep"]').waitFor({state:'visible'});
    await page.locator('[data-review-action="keep"]').click();
    await page.waitForFunction(() => document.querySelector('.review-flow-progress')?.textContent.includes('Reviewed 1 of'));
    await openTools();
    await page.locator('[data-review-action="undo"]').click();
    await page.waitForFunction(() => document.querySelector('.review-flow-progress')?.textContent.includes('Reviewed 0 of'));
    await closeTools();
    assert.deepEqual(await downloadB(), original, 'review/undo preserves the original download');

    await openTools();
    await more.locator(':scope > summary').click();
    await page.locator('[data-action="copy-all-right"]').click();
    await tools.waitFor({state:'hidden'});
    assert.equal(await more.evaluate(element => element.open), false, 'More closes after applying an action');
    await saved();
    const edited = await downloadB();
    assert.notDeepEqual(edited, original, 'the relocated transfer action edits the downloaded document');
    await page.locator('#workspace-home').click();
    await page.locator('#start-menu').waitFor({state:'visible'});
    assert.ok(await page.locator('#compare-workspace').isHidden(), 'Home shows uploads instead of the editor');
    assert.ok(await page.locator('#home-left-drop').isVisible(), 'Home exposes the first new-file upload');
    assert.ok(await page.locator('#home-right-drop').isVisible(), 'Home exposes the second new-file upload');
    assert.ok(await page.locator('#start-new-compare').isDisabled(), 'a new comparison requires a complete new pair');
    await page.screenshot({path:path.join(output,'home-menu.png'),animations:'disabled'});
    await page.setViewportSize({width:375,height:812});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Home uploads fit a narrow viewport');
    await page.screenshot({path:path.join(output,'home-menu-mobile.png'),animations:'disabled'});
    await page.setViewportSize({width:1360,height:900});
    await page.locator('#home-left-file').setInputFiles({name:'legacy.doc',mimeType:'application/msword',buffer:Buffer.from('legacy')});
    assert.match(await page.locator('#home-notice').innerText(), /\.doc.*not supported/);
    assert.ok(await page.locator('#start-new-compare').isDisabled(), 'unsupported DOC cannot replace existing work');
    const newA = 'New reference document.\n', newB = 'New revised document.\n';
    await page.locator('#home-left-file').setInputFiles({name:'new-A.txt',mimeType:'text/plain',buffer:Buffer.from(newA)});
    await page.locator('#home-right-file').setInputFiles({name:'broken.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from('not a DOCX archive')});
    await page.locator('#start-new-compare').click();
    await page.locator('#home-notice.error').waitFor({state:'visible'});
    assert.ok(await page.locator('#start-menu').isVisible(), 'failed parsing leaves the new-file screen open');
    await page.locator('#home-right-file').setInputFiles({name:'new-B.txt',mimeType:'text/plain',buffer:Buffer.from(newB)});
    dismissNextDialog = true;
    await page.locator('#start-new-compare').click();
    await page.waitForFunction(() => !document.getElementById('start-new-compare').disabled);
    assert.ok(await page.locator('#start-menu').isVisible(), 'cancelling replacement keeps the old work');
    await page.locator('#start-compare').click();
    await ready();
    assert.deepEqual(await downloadB(), edited, 'Home and Continue preserve edited comparison bytes');
    await page.getByRole('button',{name:'Undo edit in B',exact:true}).click();
    await saved();
    assert.deepEqual(await downloadB(), original, 'document Undo remains available');

    await openTools();
    await page.locator('[data-work-mode="single"]').click();
    await page.locator('#single-workspace').waitFor({state:'visible'});
    assert.ok(await page.locator('.work-mode-switch').isVisible(), 'mode controls return to the page when leaving comparison');
    await page.locator('[data-work-mode="compare"]').click();
    await ready();
    assert.ok(await tools.isHidden(), 'returning to comparison leaves tools closed');
    assert.deepEqual(await downloadB(), original, 'switching modes preserves the comparison and its download');

    await page.setViewportSize({width:375,height:812});
    await page.evaluate(() => window.scrollTo(0,0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the narrow page must not overflow horizontally');
    await page.screenshot({path:path.join(output,'compact-mobile.png'),animations:'disabled'});
    await openTools();
    const popupBounds = await tools.boundingBox();
    assert.ok(popupBounds && popupBounds.x >= 0 && popupBounds.x + popupBounds.width <= 376 && popupBounds.y >= 0 && popupBounds.y + popupBounds.height <= 813, 'tools window fits a narrow viewport');
    await page.screenshot({path:path.join(output,'compact-tools-mobile.png'),animations:'disabled'});
    await closeTools();
    await page.setViewportSize({width:1360,height:900});
    await page.reload();
    await page.locator('#session-resume').click();
    await ready(); await saved();
    assert.deepEqual(await downloadB(), original, 'saved work resumes after the session controls are compacted');
    // A native Tools dialog used to stay open over the PDF preview launched
    // from the completed review, leaving its Download PDF button inert.
    await page.locator('[data-download-format="right"]').selectOption('pdf');
    assert.equal(await page.locator('#visual-review [data-save-side="right"]').innerText(), 'Preview PDF B');
    await openTools();
    await page.locator('[data-review-action="start"]').click();
    for (let index = 0; index < 4; index++) {
      await page.locator('[data-review-action="keep"]:not([disabled])').waitFor({state:'visible'});
      await page.locator('[data-review-action="keep"]').click();
    }
    await tools.waitFor({state:'visible'});
    assert.match(await page.locator('.review-flow-progress').innerText(), /Reviewed 4 of 4/);
    assert.equal(await page.locator('[data-review-action="download"]').innerText(), 'Preview updated B as PDF');
    await page.locator('[data-review-action="download"]').click();
    await tools.waitFor({state:'hidden'});
    const pdfSave = page.locator('.document-pdf-dialog .primary:not([disabled])');
    await pdfSave.waitFor({state:'visible'});
    const [pdfDownload] = await Promise.all([page.waitForEvent('download'), pdfSave.click()]);
    assert.match(pdfDownload.suggestedFilename(), /\.pdf$/);
    assert.match((await readFile(await pdfDownload.path())).subarray(0,8).toString(), /^%PDF-/);
    await page.getByRole('button', {name:'Back to editing', exact:true}).click();
    await page.locator('[data-download-format="right"]').selectOption('docx');
    assert.deepEqual(await downloadB(), original, 'PDF conversion preserves the editable Word document');
    // Replacing a source destroys the old review. Its relocated file controls
    // must survive, then join the new tools window without duplicate IDs.
    await openTools();
    await sourcePicker.locator(':scope > summary').click();
    const replacement = 'Replacement document for the popup lifecycle check.\n';
    await page.locator('#right-file').setInputFiles({name:'replacement-B.txt',mimeType:'text/plain',buffer:Buffer.from(replacement)});
    await ready(); await saved();
    assert.equal(await page.locator('#source-picker').count(), 1, 'source controls survive replacement exactly once');
    assert.equal(await page.locator('#saved-session').count(), 1, 'session controls survive replacement exactly once');
    assert.equal((await downloadB()).toString(), replacement, 'replacing a source through the tools window loads the new document');

    // Home must also preserve the standalone editor and its undo history.
    await page.locator('#workspace-home').click();
    await page.locator('#header-edit').click();
    await page.locator('#single-file').setInputFiles({name:'single-home.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:original});
    const single = page.locator('#single-editor-host');
    await single.locator('[data-save-side="left"]').waitFor({state:'visible'});
    await single.locator('.visual-paragraph').filter({hasText:'Warranty: 12 months.'}).first().click();
    await single.locator('[data-edit-side="left"]').fill('Warranty: 18 months.');
    await single.getByRole('button',{name:'Done ✓',exact:true}).click();
    const downloadSingle = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), single.locator('[data-save-side="left"]').click()]);
      return readFile(await download.path());
    };
    const singleEdited = await downloadSingle();
    assert.notDeepEqual(singleEdited, original, 'standalone edit changes the document');
    await page.locator('#workspace-home').click();
    await page.locator('#start-menu').waitFor({state:'visible'});
    await page.locator('#header-edit').click();
    assert.deepEqual(await downloadSingle(), singleEdited, 'Home and Continue preserve standalone edits');
    await page.locator('#single-file').setInputFiles({name:'legacy.doc',mimeType:'application/msword',buffer:Buffer.from('unsupported legacy file')});
    assert.match(await page.locator('#single-notice').innerText(), /\.doc.*not supported/);
    assert.deepEqual(await downloadSingle(), singleEdited, 'rejecting legacy DOC preserves the open document');
    await single.getByRole('button',{name:'Undo edit',exact:true}).click();
    assert.deepEqual(await downloadSingle(), original, 'standalone Undo survives Home navigation');
    await single.locator('[data-download-format="left"]').selectOption('pdf');
    assert.equal(await single.locator('[data-save-side="left"]').innerText(), 'Preview PDF');
    await single.locator('[data-save-side="left"]').click();
    const singlePdfSave = single.locator('.document-pdf-dialog .primary:not([disabled])');
    await singlePdfSave.waitFor({state:'visible'});
    const [singlePdf] = await Promise.all([page.waitForEvent('download'), singlePdfSave.click()]);
    assert.match((await readFile(await singlePdf.path())).subarray(0,8).toString(), /^%PDF-/);
    await single.getByRole('button', {name:'Back to editing', exact:true}).click();
    await single.locator('[data-download-format="left"]').selectOption('docx');
    // Stage a new pair after the earlier reload, visit the editor, then return.
    // Starting it must never mix a new A with the previous B.
    await page.locator('#workspace-home').click();
    await page.locator('#home-left-file').setInputFiles({name:'new-A.txt',mimeType:'text/plain',buffer:Buffer.from(newA)});
    await page.locator('#home-right-file').setInputFiles({name:'new-B.txt',mimeType:'text/plain',buffer:Buffer.from(newB)});
    await page.locator('#header-edit').click();
    await page.locator('#workspace-home').click();
    await page.locator('#start-new-compare').click();
    await ready(); await saved();
    assert.equal((await downloadB()).toString(), newB, 'Home starts the complete new comparison');
    const [newADownload] = await Promise.all([page.waitForEvent('download'), page.locator('#visual-review [data-save-side="left"]').click()]);
    assert.equal((await readFile(await newADownload.path())).toString(), newA, 'both sides come from the staged new pair');
    assert.ok(await page.locator('#start-menu').isHidden(), 'successful new comparison leaves Home');
    await page.locator('#workspace-home').click();
    await page.locator('#header-edit').click();
    assert.deepEqual(await downloadSingle(), original, 'starting a new comparison preserves the separate single-document workspace');
    // Reproduce the reported Word export restriction with real header/footer parts.
    const headerFile = {name:'with-headers.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(peripheralFixture().data,'base64')};
    const checkHeaderPdf = async (host, side, screenshot) => {
      const select = host.locator(`[data-download-format="${side}"]`);
      await select.waitFor({state:'visible'});
      assert.equal(await select.locator('option[value="pdf"]').isDisabled(), false, 'text headers/footers do not disable PDF');
      await select.selectOption('pdf');
      await host.locator(`[data-save-side="${side}"]`).click();
      const dialog = host.locator('.document-pdf-dialog');
      await dialog.locator('.primary:not([disabled])').waitFor({state:'visible'});
      assert.match(await dialog.locator('.document-pdf-nav').innerText(), /1 \/ 3/);
      await page.screenshot({path:path.join(output,screenshot),animations:'disabled'});
      const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button',{name:'Download PDF',exact:true}).click()]);
      const bytes = await readFile(await download.path());
      assert.match(bytes.subarray(0,8).toString(), /^%PDF-/);
      const texts = await page.evaluate(async bytes => {
        const {getDocument} = await import('/pdf-reader-vendor.mjs');
        const loading = getDocument({data:new Uint8Array(bytes),isEvalSupported:false});
        try {
          const pdf = await loading.promise, result = [];
          for (let number = 1; number <= pdf.numPages; number++) {
            const text = await (await pdf.getPage(number)).getTextContent();
            result.push(text.items.map(item => item.str).join(' '));
          }
          return result;
        } finally { await loading.destroy(); }
      }, [...bytes]);
      assert.equal(texts.length,3);
      for (let index=0;index<3;index++) {
        assert.match(texts[index], /default header/);
        assert.match(texts[index], new RegExp('default footer — Page '+(index+1)+' of 3'));
        assert.match(texts[index], new RegExp('Body page '+(index+1)));
      }
      await dialog.getByRole('button',{name:'Back to editing',exact:true}).click();
    };
    await page.locator('#single-file').setInputFiles(headerFile);
    await page.waitForFunction(() => document.getElementById('single-current').textContent === 'with-headers.docx');
    await checkHeaderPdf(single,'left','word-headers-single-preview.png');
    await page.locator('#workspace-home').click();
    await page.locator('#home-left-file').setInputFiles(headerFile);
    await page.locator('#home-right-file').setInputFiles({...headerFile,name:'with-headers-B.docx'});
    await page.locator('#start-new-compare').click();
    await ready();
    await checkHeaderPdf(page.locator('#visual-review'),'right','word-headers-comparison-preview.png');

    // The new paste-first entry must use the full document engine, preserve
    // literal markup and produce the same TXT bytes through its real export.
    await page.locator('#workspace-home').click();
    await page.locator('#home-left-paste').click();
    await page.locator('#home-right-paste').click();
    const pastedA = '<script>do not execute</script>\nAmount: $10\n';
    const pastedB = '<script>do not execute</script>\nAmount: $12\n';
    await page.locator('#home-left-text').fill(pastedA);
    await page.locator('#home-right-text').fill(pastedB);
    await page.locator('#start-new-compare').click();
    await ready(); await saved();
    assert.equal((await downloadB()).toString(), pastedB, 'pasted B uses the complete editor and exact TXT download');
    await page.locator('#workspace-home').click();
    assert.equal(await page.locator('#home-left-text').inputValue(), pastedA, 'returning Home retains the original pasted A');
    assert.equal(await page.locator('#home-right-text').inputValue(), pastedB, 'returning Home retains the original pasted B');
    await page.locator('#start-compare').click(); await ready();
    assert.equal((await downloadB()).toString(), pastedB, 'Continue keeps the existing comparison');


  }
  assert.deepEqual(errors, [], 'no uncaught page errors');
  assert.deepEqual(externalRequests, [], 'no external requests');
  const result = {passed:true, mode:baseline ? 'baseline':'compact', browser:browser.version(), ...metrics, errors, externalRequests};
  await writeFile(path.join(output, baseline ? 'baseline.json' : 'result.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({path:path.join(output,'compact-failure.png'),fullPage:true}).catch(() => {});
  console.error({errors,externalRequests});
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
