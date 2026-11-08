// CI regression for the browser engine used by Safari. This is Playwright WebKit,
// not a claim that a particular macOS/Safari release has been tested.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {docx} from '../tests/fixtures/text-fixture.mjs';

const engine = process.env.BROWSER_ENGINE || 'webkit';
assert.ok(['webkit','chromium'].includes(engine), 'Supported browser engine');
const playwright = await import(process.env.PLAYWRIGHT_MODULE || (engine === 'webkit' ? 'playwright-webkit-check' : 'playwright'));
const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.resolve(process.env.CTT_BUILD_DIR || path.join(root, 'dist'));
const output = path.resolve(process.env.TEST_OUTPUT || path.join(root, 'test-output', engine));
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
let browser, context, page;
try {
  browser = await playwright[engine].launch({headless:true, ...(engine === 'chromium' ? {channel:'chromium',args:['--no-sandbox']} : {})});
  context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  context.setDefaultTimeout(30000);
  // Trace frames use the native screencast protocol. Avoid page.screenshot():
  // Playwright's WebKit screenshot preparation injects an inline `body {}`
  // stylesheet to synchronize animations and violates this site's strict CSP.
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
    assert.ok(await page.locator('#single-workspace').isHidden(), 'comparison keeps the independent document editor hidden');
    assert.ok(await page.locator('#single-session').isHidden(), 'comparison must not show the previous document name or saved-work controls');
  };
  const saved = id => page.waitForFunction(id => document.getElementById(id)?.textContent.includes('Saved in this browser'), id);
  const compareTexts = async (a, b) => {
    await page.locator('#home-left-text').fill(a);
    await page.locator('#home-right-text').fill(b);
    assert.equal(await page.locator('#home-ocr, input[id$="-ocr"]').count(), 0, 'comparison contains no scanner controls');
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
      assert.ok(node.marks.some(mark => mark.background !== 'rgba(0, 0, 0, 0)' && mark.background !== 'transparent'), 'changed-text highlight has an actual browser background');
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

  // Preserve an independently edited ordinary document while opening new pairs.
  await home(); await page.locator('#header-edit').click();
  const original = 'Previous document. Keep this independent draft.';
  const edited = 'Previous document. Keep this edited independent draft.';
  await page.locator('#single-file').setInputFiles({name:'previous-document.txt',mimeType:'text/plain',buffer:Buffer.from(original)});
  const single = page.locator('#single-editor-host');
  await single.locator('[data-save-side="left"]').waitFor({state:'visible'});
  await single.locator('.visual-paragraph').filter({hasText:original}).click();
  await single.locator('[data-edit-side="left"]').fill(edited);
  await page.waitForFunction(value => document.querySelector('#single-editor-host .visual-paragraph')?.textContent === value, edited);
  await saved('single-session-status');
  await home();
  // A staged document can be abandoned for pasted text without reopening old work.
  await page.locator('#home-left-file').setInputFiles({name:'abandoned.txt',mimeType:'text/plain',buffer:Buffer.from('Abandoned input')});
  await page.locator('#home-left-paste').click();
  const nextShared = ['New comparison only.', 'Общие условия поставки.'];
  const nextA = [nextShared[0], 'Цена заказа 100 рублей.', nextShared[1]].join('\n');
  const nextB = [nextShared[0], 'Цена заказа 200 рублей.', nextShared[1]].join('\n');
  await compareTexts(nextA, nextB);
  await assertHighlights(nextShared, 'Цена заказа 100 рублей.', 'Цена заказа 200 рублей.', ['100','200']);
  assert.doesNotMatch(await page.locator('#visual-review').innerText(), /Previous document|Abandoned input/);
  report.checks.push('edited single TXT → Home → staged file → Paste text instead → fresh comparison; previous work stays separate');

  const downloadSingle = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'),single.locator('[data-save-side="left"]').click()]);
    assert.equal(await download.failure(), null);
    assert.equal((await readFile(await download.path(),'utf8')).trimEnd(), edited, 'download contains the independent edit');
  };
  await home(); await page.locator('#start-edit').click();
  assert.equal(await page.locator('#single-current').innerText(), 'previous-document.txt');
  await downloadSingle();
  await home(); await page.locator('#start-compare').click(); await ready();
  await assertHighlights(nextShared, 'Цена заказа 100 рублей.', 'Цена заказа 200 рублей.', ['100','200']);
  await page.reload();
  await page.locator('#session-resume').click(); await ready();
  await assertHighlights(nextShared, 'Цена заказа 100 рублей.', 'Цена заказа 200 рублей.', ['100','200']);
  await home(); await page.locator('#header-edit').click();
  await page.locator('#single-session-resume').click();
  await single.locator('[data-save-side="left"]').waitFor({state:'visible'});
  await saved('single-session-status'); await downloadSingle();
  report.checks.push('Continue editing, Continue comparison and reload/resume preserve both edited TXT and the new comparison independently');

  await home();
  const wordShared = ['Word agreement.', 'Same closing paragraph.'];
  for (const [side, days] of [['left','5'],['right','10']]) {
    await page.locator('#home-' + side + '-file').setInputFiles({name:side+'.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docx([wordShared[0], 'Delivery within ' + days + ' days.', wordShared[1]]))});
  }
  await page.locator('#start-new-compare').click(); await ready(); await saved('session-status');
  await assertHighlights(wordShared, 'Delivery within 5 days.', 'Delivery within 10 days.', ['5','10']);
  const rightColumn = page.locator('#visual-review .visual-column').nth(1);
  await rightColumn.locator('.visual-paragraph').filter({hasText:'Delivery within 10 days.'}).click();
  await page.locator('#visual-review [data-edit-side="right"]').fill('Delivery within 5 days.');
  await page.waitForFunction(() => [...document.querySelectorAll('#visual-review .visual-column')][1]?.textContent.includes('Delivery within 5 days.') && document.querySelectorAll('#visual-review mark.visual-text-change').length === 0);
  await page.getByRole('button', {name:'Undo edit in B',exact:true}).click();
  await page.waitForFunction(() => [...document.querySelectorAll('#visual-review .visual-column')][1]?.querySelector('mark.visual-text-change')?.textContent === '10');
  await assertHighlights(wordShared, 'Delivery within 5 days.', 'Delivery within 10 days.', ['5','10']);
  await saved('session-status');
  report.checks.push('ordinary DOCX marks only changed words, removes marks when edits match, and restores them on Undo');

  await home();
  for (const side of ['left','right']) await page.locator('#home-' + side + '-paste').click();
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
  throw error;
} finally {
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await context?.tracing.stop({path:path.join(output,'trace.zip')}).catch(() => {});
  await context?.close(); await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
