// CI-only integration: an actual unpacked MV3 extension, with networking offline.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createCanvas} from '@napi-rs/canvas';
const root=fileURLToPath(new URL('./',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'test-output');
await mkdir(out,{recursive:true});const temporary=await mkdtemp(path.join(tmpdir(),'document-scanner-'));
const report={checks:[],externalRequests:[],pageErrors:[],cspErrors:[]};let context,page;
try {
  const canvas=createCanvas(1400,700),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,700);ctx.fillStyle='black';ctx.font='48px sans-serif';ctx.fillText('Invoice number 12345',90,150);ctx.fillText('Total amount 900 dollars',90,240);
  const original=canvas.toBuffer('image/png'),fixture=path.join(temporary,'invoice.png');await writeFile(fixture,original);
  context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{channel:'chromium',headless:true,viewport:{width:1440,height:1000},acceptDownloads:true,args:['--no-sandbox',`--disable-extensions-except=${dist}`,`--load-extension=${dist}`]});
  context.setDefaultTimeout(30000);
  const worker=context.serviceWorkers().find(worker=>worker.url().startsWith('chrome-extension:'))||await context.waitForEvent('serviceworker');
  const base=`chrome-extension://${new URL(worker.url()).host}`;assert.notEqual(base,'chrome-extension://kclhfiaampafehfhlejeeefhdhocfcg');
  context.on('request',request=>{if(/^https?:/.test(request.url()))report.externalRequests.push(request.url());});await context.setOffline(true);
  page=await context.newPage();page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/content security policy|violates.*directive/i.test(message.text()))report.cspErrors.push(message.text());});
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(()=>!document.getElementById('scanner-file').disabled);
  assert.equal(await page.locator('#start-new-compare,#home-left-file,#home-right-file,#single-paste').count(),0);
  await page.locator('#scanner-file').setInputFiles(fixture);
  const modal=page.locator('dialog.ocr-review-dialog');await modal.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.ocr-recognize')?.disabled===false);
  await modal.locator('.ocr-language').selectOption('eng');await modal.locator('.ocr-recognize').click();
  await page.waitForFunction(()=>{const el=document.querySelector('.ocr-status');return el&&/^(Check this text against|Recognition failed:)/.test(el.textContent)&&!document.querySelector('.ocr-recognize').disabled;},null,{timeout:120000});
  assert.match(await modal.locator('.ocr-text').inputValue(),/12345/);
  await modal.locator('.ocr-fragment-select').selectOption({index:0});await modal.locator('.ocr-fragment-text').fill('Checked invoice 54321');
  assert.ok(await modal.locator('.ocr-correction-layer svg path').count()>0);
  await modal.locator('.ocr-confirm').click();await modal.locator('.ocr-use').click();
  await page.locator('.ocr-document img').waitFor({state:'visible'});
  assert.ok(await page.locator('.ocr-document-corrections svg path').count()>0);
  report.checks.push('real offline ENG OCR and visible manual correction retained in confirmed document');
  const download=async selector=>{const [item]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator(selector).click()]);assert.equal(await item.failure(),null);return readFile(await item.path());};
  assert.deepEqual(await download('.ocr-document-original'),original);
  assert.match((await download('.ocr-document-text-download')).toString(),/Checked invoice 54321/);
  const pdf=await download('.ocr-document-pdf-download');assert.match(pdf.subarray(0,5).toString(),/%PDF-/);
  const {getDocument}=await import('./dist/pdf-reader-vendor.mjs');const loading=getDocument({data:new Uint8Array(pdf),isEvalSupported:false,verbosity:0});
  try {const doc=await loading.promise;assert.equal(doc.numPages,1);const content=await(await doc.getPage(1)).getTextContent();assert.match(content.items.map(item=>item.str).join(' '),/Checked invoice 54321/);}finally{await loading.destroy();}
  report.checks.push('original exact bytes, corrected TXT and searchable corrected PDF export');
  await page.waitForFunction(()=>document.getElementById('single-session-status')?.textContent.includes('Saved in this browser'));
  await page.reload();await page.locator('#single-session-resume').click();await page.locator('.ocr-document img').waitFor({state:'visible'});
  assert.match((await download('.ocr-document-text-download')).toString(),/Checked invoice 54321/);
  assert.ok(await page.locator('.ocr-document-corrections svg path').count()>0);
  report.checks.push('encrypted draft resumes corrected text and visible regions after reload');
  await page.locator('#scanner-file').setInputFiles(fixture);await modal.waitFor({state:'visible'});await modal.locator('.ocr-close').click();
  assert.match((await download('.ocr-document-text-download')).toString(),/Checked invoice 54321/);
  report.checks.push('cancel replacement preserves current confirmed document');
  await page.screenshot({path:path.join(out,'document-scanner.png'),fullPage:true});
  assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.cspErrors,[]);
  report.passed=true;
} catch(error) {report.passed=false;report.error=error.stack;if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally {await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context?.close();await rm(temporary,{recursive:true,force:true});}
