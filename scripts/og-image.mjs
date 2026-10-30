// Compose the 1200x630 social sharing card (src/images/og-1200x630.png) from a store screenshot.
// Usage: npm run store:assets first, then node scripts/og-image.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const shot = resolve(root, 'extension-package/store/images/screenshot-documents-1280x800.png');
const out = resolve(root, 'src/images/og-1200x630.png');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const img = 'data:image/png;base64,' + (await readFile(shot)).toString('base64');
const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : { channel: 'chromium' }), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><head><style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;font-family:'Noto Sans',sans-serif;
    background:linear-gradient(160deg,#216349 0%,#163f30 100%);color:#fff;position:relative}
  h1{position:absolute;top:40px;left:0;right:0;text-align:center;font-size:54px;font-weight:700;letter-spacing:-.5px}
  p{position:absolute;top:116px;left:0;right:0;text-align:center;font-size:26px;color:#d6e8df}
  .frame{position:absolute;top:186px;left:130px;width:940px;height:460px;border-radius:14px 14px 0 0;overflow:hidden;
    box-shadow:0 18px 50px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.25);border-bottom:0}
  .frame img{display:block;width:940px;height:588px}
</style></head><body><h1>Compare Two Texts</h1><p>Diff checker for Word, PDF &amp; Excel · Free · Files stay on your device</p>
<div class="frame"><img src="${img}"></div></body></html>`);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: out });
await browser.close();
console.log(out);
