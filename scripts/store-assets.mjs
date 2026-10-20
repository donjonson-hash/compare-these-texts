// Capture the packaged extension with built-in synthetic examples only.
// npm run build first. Install Playwright separately or set PLAYWRIGHT_MODULE
// to its module entry. CHROMIUM_EXECUTABLE can select an installed browser.
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
const unpacked = await mkdtemp(join(tmpdir(), 'ctt-store-'));
const output = join(root, 'extension-package/store/images');
execFileSync('python3', ['-m', 'zipfile', '-e', join(root, `dist/downloads/ctt-chrome-${release.version}.zip`), unpacked]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(unpacked, `.${name === '/' ? '/index.html' : name}`);
    if (!path.startsWith(unpacked + '/')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : { channel: 'chromium' }), headless: true, args: ['--no-sandbox'] });
const errors = [], external = [];
async function appPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) external.push(request.url()); });
  await page.goto(origin + '/index.html');
  return page;
}
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(output, name), animations: 'disabled' });
  assert.ok((await stat(join(output, name))).size < 800000, `${name} exceeds 800 KB`);
}
try {
  await mkdir(output, { recursive: true });
  const documents = await appPage();
  await documents.locator('#demo').click();
  await documents.locator('.visual-columns .visual-column').first().waitFor();
  await documents.locator('[data-save-side="right"]').waitFor();
  await documents.locator('#visual-review').evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY));
  await screenshot(documents, 'screenshot-documents-1280x800.png');

  const tables = await appPage();
  await tables.locator('#demo-tables').click();
  await tables.locator('.sheet-review .sheet-grid').first().waitFor();
  await tables.locator('#visual-review').evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY));
  await screenshot(tables, 'screenshot-tables-1280x800.png');

  const welcome = await appPage();
  await welcome.goto(origin + '/welcome.html');
  await welcome.locator('h1').waitFor();
  assert.ok(await welcome.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'Welcome content must fit the 1280×800 store screenshot');
  await screenshot(welcome, 'screenshot-welcome-1280x800.png');

  const icon = (await readFile(join(root, 'src/icon-64.png'))).toString('base64');
  const tile = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await tile.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#f6f5f0;color:#24382f;font:14px Arial,sans-serif;padding:26px 28px}
  .brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:700;letter-spacing:-.5px}.brand img{width:34px;height:34px}
  h1{font-size:34px;letter-spacing:-1.2px;line-height:1.08;margin:22px 0 14px}p{margin:0;color:#52665a;font-size:15px;line-height:1.55}
  .badge{display:inline-block;margin-top:19px;border:1px solid #cbdaca;border-radius:20px;background:#eaf1e6;padding:6px 11px;color:#205a45;font-size:12px}
  </style></head><body><div class="brand"><img src="data:image/png;base64,${icon}" alt="">Compare These Texts</div><h1>See the difference.<br>Make it right.</h1><p>Compare documents. Edit changes.</p><span class="badge">Your files stay in your browser.</span></body></html>`);
  await tile.locator('img').evaluate(img => img.decode());
  await screenshot(tile, 'promo-440x280.png');

  const capture = (await readFile(join(output, 'screenshot-documents-1280x800.png'))).toString('base64');
  const marquee = await browser.newPage({ viewport: { width: 1400, height: 560 }, deviceScaleFactor: 1 });
  await marquee.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;height:560px;background:#183e31;color:#fffefb;font:18px Arial,sans-serif;padding:40px;display:grid;grid-template-columns:470px 1fr;gap:40px;align-items:center}
  .brand{display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700;letter-spacing:-.5px;margin-bottom:34px}.brand img{width:44px;height:44px;border-radius:11px}
  h1{font-size:54px;line-height:1.04;letter-spacing:-2px;margin:0 0 23px}p{font-size:20px;line-height:1.5;color:#d2e1d3;margin:0 0 25px}.badge{display:inline-block;border:1px solid #759781;border-radius:22px;padding:9px 14px;font-size:14px}
  .frame{width:100%;background:#eaf0e5;border:1px solid #8fad96;border-radius:12px;overflow:hidden;box-shadow:0 20px 40px #071b1840}.bar{height:26px;display:flex;align-items:center;gap:6px;padding:0 11px}.bar i{width:7px;height:7px;background:#a2b6a8;border-radius:50%}.bar span{margin:auto;color:#526d5b;font-size:10px}.frame>img{width:100%;display:block}
  </style></head><body><div><div class="brand"><img src="data:image/png;base64,${icon}" alt="">Compare These Texts</div><h1>See the difference.<br>Make it right.</h1><p>Review two versions side by side.<br>Edit the changes. Save your copy.</p><span class="badge">Your documents stay on your device.</span></div><div class="frame"><div class="bar"><i></i><i></i><i></i><span>Compare These Texts · Document comparison</span></div><img src="data:image/png;base64,${capture}" alt="Actual document comparison interface"></div></body></html>`);
  await marquee.locator('.frame>img').evaluate(img => img.decode());
  await screenshot(marquee, 'promo-1400x560.png');
  assert.deepEqual(errors, [], 'Packaged UI must not produce uncaught errors');
  assert.deepEqual(external, [], 'Captures must use only local resources');
  console.log(`Captured CTT ${release.version}: 3 screenshots and 2 promotional images, all below 800 KB.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(unpacked, { recursive: true, force: true });
}
