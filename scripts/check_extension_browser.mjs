// Focused packaged-extension onboarding check; the core document engine has its
// own regression suite. REQUIRE_EXTENSION=1 forbids the localhost fallback.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(await readFile(path.join(root, 'release.json'), 'utf8'));
const output = process.env.TEST_OUTPUT || path.join(root, 'test-output');
const temporary = await mkdtemp(path.join(tmpdir(), 'ctt-welcome-browser-'));
const unpacked = path.join(temporary, 'extension');
await mkdir(output, {recursive: true});
execFileSync('python3', ['-m', 'zipfile', '-e', path.join(root, 'dist', 'downloads', `ctt-chrome-${release.version}.zip`), unpacked]);

const server = createServer(async (request, response) => {
  const filename = path.resolve(unpacked, '.' + new URL(request.url, 'http://localhost').pathname);
  if (!filename.startsWith(unpacked + path.sep)) { response.writeHead(404).end(); return; }
  const mime = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml'};
  try { response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream'); response.end(await readFile(filename)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const localOrigin = `http://127.0.0.1:${server.address().port}`;
let context;
const errors = [], externalRequests = [], checks = [];
try {
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath: process.env.CHROMIUM_EXECUTABLE} : {channel:'chromium'}),
    headless: true, viewport: {width:1440, height:1000}, acceptDownloads:true,
    args:['--no-sandbox', '--disable-gpu', `--disable-extensions-except=${unpacked}`, `--load-extension=${unpacked}`]
  });
  context.setDefaultTimeout(30000);
  const watch = page => {
    page.on('pageerror', error => errors.push(error.message));
    // A beforeunload prompt may appear when navigating away from an open demo.
    page.on('dialog', dialog => dialog.accept());
  };
  context.pages().forEach(watch); context.on('page', watch);
  context.on('request', request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== localOrigin) externalRequests.push(request.url());
  });
  let worker = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension:'));
  if (!worker) worker = await context.waitForEvent('serviceworker', {timeout:process.env.REQUIRE_EXTENSION ? 15000 : 2500}).catch(error => {
    if (process.env.REQUIRE_EXTENSION) throw error;
    return null;
  });
  const base = worker ? new URL('.', worker.url()).href : `${localOrigin}/`;
  const welcomeUrl = new URL('welcome.html', base).href;
  const editorUrl = new URL('index.html', base).href;
  const navigate = async callback => {
    if (!worker) await context.setOffline(false);
    try { return await callback(); }
    finally { await context.setOffline(true); }
  };
  const ready = page => page.waitForFunction(() => document.getElementById('demo') && !document.getElementById('demo').disabled && document.getElementById('saved-session'));
  const visualReady = page => page.locator('.visual-review [data-save-side="right"]').waitFor({state:'visible'});
  const saved = page => page.waitForFunction(() => document.getElementById('session-status')?.textContent.includes('Saved in this browser'));
  const payload = page => page.evaluate(async () => {
    const {openSessionStore} = await import('./session-store.mjs');
    const store = await openSessionStore();
    try { return (await store.read()).payload; } finally { store.close(); }
  });
  const downloadB = async page => {
    await page.bringToFront();
    const download = page.waitForEvent('download');
    await page.locator('.visual-review [data-save-side="right"]').click();
    const result = await download;
    return readFile(await result.path());
  };

  let page;
  if (worker) {
    // Observe the installation-created tab, rather than opening it ourselves.
    const deadline = Date.now() + 15000;
    while (!page && Date.now() < deadline) {
      page = context.pages().find(tab => tab.url() === welcomeUrl);
      if (!page) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(page, 'a fresh installed extension automatically opens welcome');
    checks.push('first-install-auto-welcome');
    await context.setOffline(true);
  } else {
    page = await context.newPage();
    await navigate(() => page.goto(welcomeUrl));
  }
  await page.locator('#open-editor').waitFor();
  await page.screenshot({path:path.join(output, 'welcome.png'), fullPage:true});
  await page.setViewportSize({width:375, height:812});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'welcome fits a narrow viewport');
  await page.setViewportSize({width:1440, height:1000});
  await navigate(async () => { await page.locator('#open-editor').click(); await ready(page); });
  assert.equal(page.url(), editorUrl);
  assert.ok(await page.locator('#results').isHidden(), 'Open comparison leaves an empty fresh workspace');
  checks.push('open-comparison');

  await navigate(async () => {
    await page.goto(welcomeUrl); await page.locator('#try-example').click(); await visualReady(page); await saved(page);
  });
  assert.equal(new URL(page.url()).search, '', 'example launch is consumed once');
  const original = await downloadB(page);
  await page.locator('.compact-review-tools > summary').click();
  await page.locator('[data-action="copy-all-right"]').click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Undo edit in B"]').disabled);
  await saved(page);
  const edited = await downloadB(page);
  assert.notDeepEqual(edited, original, 'a supported edit changes the actual downloaded B');
  const storedEdited = await payload(page);
  checks.push('fresh-example-and-edit');

  const popup = context.waitForEvent('page');
  let help;
  await navigate(async () => {
    await page.locator('#getting-started').click(); help = await popup;
    await help.waitForURL(welcomeUrl); await help.locator('#open-editor').waitFor();
  });
  assert.equal(page.url(), editorUrl, 'Getting started does not replace the editor');
  assert.deepEqual(await downloadB(page), edited, 'help preserves edited download bytes');
  assert.deepEqual(await payload(page), storedEdited, 'help preserves the saved draft');
  await page.getByRole('button', {name:'Undo edit in B', exact:true}).click();
  await saved(page);
  assert.deepEqual(await downloadB(page), original, 'Undo history survives help navigation');
  const storedOriginal = await payload(page);
  checks.push('help-preserves-document-undo-and-draft');

  // A second entry must offer the existing draft, never overwrite it with demo.
  await navigate(async () => { await help.locator('#try-example').click(); await ready(help); });
  await help.waitForFunction(() => document.getElementById('notice').textContent.includes('Your saved comparison is available'));
  assert.equal(new URL(help.url()).search, '');
  assert.ok(await help.locator('#results').isHidden(), 'saved-work guard does not launch a new example');
  await help.locator('#session-resume').waitFor({state:'visible'});
  assert.deepEqual(await payload(help), storedOriginal, 'guard keeps the exact saved draft');
  await page.close();
  await navigate(async () => { await help.locator('#session-resume').click(); await visualReady(help); await saved(help); });
  assert.deepEqual(await downloadB(help), original, 'Continue restores the saved document');
  checks.push('saved-work-guard-and-continue');
  await help.screenshot({path:path.join(output, 'welcome-restored-document.png'), fullPage:true});
  assert.deepEqual(errors, [], 'no uncaught page errors');
  assert.deepEqual(externalRequests, [], 'no external HTTP requests');
  console.log(JSON.stringify({passed:true, mode:worker ? 'extension':'local-page', browser:context.browser()?.version(), checks, externalRequests}, null, 2));
} catch (error) {
  console.error({errors, externalRequests});
  if (context) for (const [index, page] of context.pages().entries()) if (!page.isClosed()) await page.screenshot({path:path.join(output, `welcome-failure-${index}.png`), fullPage:true}).catch(() => {});
  throw error;
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, {recursive:true, force:true});
}
