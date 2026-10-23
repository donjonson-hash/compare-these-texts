// Focused browser check for the compact comparison workspace. Uses only the
// bundled synthetic Word documents; no uploaded/private files or remote calls.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';

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
  page.on('dialog', dialog => dialog.accept());
  page.on('request', request => {if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) externalRequests.push(request.url());});
  const ready = () => page.locator('.visual-review [data-save-side="right"]').waitFor({state:'visible'});
  const saved = () => page.waitForFunction(() => document.getElementById('session-status')?.textContent.includes('Saved in this browser'));
  const downloadB = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-save-side="right"]').click(),
    ]);
    return readFile(await download.path());
  };
  await page.goto(origin + '/');
  await page.locator('#demo').click();
  await ready(); await saved();
  await page.evaluate(async () => {await document.fonts.ready; window.scrollTo(0,0);});
  const firstText = page.locator('.visual-columns .visual-column').first().locator('.visual-paragraph').filter({hasText:'Office delivery agreement'}).first();
  const metrics = await firstText.evaluate(element => ({firstDocumentTextTop:element.getBoundingClientRect().top, firstDocumentTextBottom:element.getBoundingClientRect().bottom, viewportHeight:innerHeight, viewportWidth:innerWidth}));
  await page.screenshot({path:path.join(output, baseline ? 'compact-before.png' : 'compact-after.png'), animations:'disabled'});
  if (!baseline) {
    assert.ok(metrics.firstDocumentTextTop >= 0 && metrics.firstDocumentTextBottom < metrics.viewportHeight, 'Actual document text must be visible immediately at the top of a desktop comparison');
    assert.ok(await page.locator('.visual-navigation').isVisible(), 'difference navigation remains available');
    const sourcePicker = page.locator('#source-picker');
    assert.equal(await sourcePicker.evaluate(element => element.open), false, 'loaded source controls start collapsed');
    await sourcePicker.locator(':scope > summary').click();
    assert.ok(await page.locator('#left-drop').isVisible(), 'source replacement remains accessible');
    await sourcePicker.locator(':scope > summary').click();
    const sessionDetails = page.locator('#saved-session details.session-details');
    await sessionDetails.locator(':scope > summary').click();
    assert.ok(await page.locator('#session-delete').isVisible(), 'saved-work deletion remains accessible');
    await sessionDetails.locator(':scope > summary').click();
    const original = await downloadB();
    const more = page.locator('.visual-toolbar > details.visual-more');
    await more.locator(':scope > summary').click();
    const help = more.locator('details.visual-help');
    await help.locator(':scope > summary').click();
    assert.match(await help.innerText(), /Click any text|Highlights/);
    assert.ok(await help.locator('.visual-instruction').isVisible(), 'review instructions remain discoverable');
    await more.locator(':scope > summary').click();

    await page.locator('[data-review-action="start"]').click();
    await page.locator('[data-review-action="keep"]').waitFor({state:'visible'});
    await page.locator('[data-review-action="keep"]').click();
    await page.waitForFunction(() => document.querySelector('.review-flow-progress')?.textContent.includes('Reviewed 1 of'));
    await page.locator('[data-review-action="undo"]').click();
    await page.waitForFunction(() => document.querySelector('.review-flow-progress')?.textContent.includes('Reviewed 0 of'));
    assert.deepEqual(await downloadB(), original, 'review/undo preserves the original download');

    await more.locator(':scope > summary').click();
    await page.locator('[data-action="copy-all-right"]').click();
    await more.locator(':scope > summary').click();
    await saved();
    assert.notDeepEqual(await downloadB(), original, 'the relocated transfer action edits the downloaded document');
    await page.getByRole('button',{name:'Undo edit in B',exact:true}).click();
    await saved();
    assert.deepEqual(await downloadB(), original, 'document Undo remains available');
    if (await more.evaluate(element => element.open)) await more.locator(':scope > summary').click();
    await page.setViewportSize({width:375,height:812});
    await page.evaluate(() => window.scrollTo(0,0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the narrow page must not overflow horizontally');
    await page.screenshot({path:path.join(output,'compact-mobile.png'),animations:'disabled'});
    await page.setViewportSize({width:1360,height:900});
    await page.reload();
    await page.locator('#session-resume').click();
    await ready(); await saved();
    assert.deepEqual(await downloadB(), original, 'saved work resumes after the session controls are compacted');
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
