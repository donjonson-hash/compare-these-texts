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
  // Exercise the bundled Russian model, without replacing the worker or OCR API.
  const renderText = lines => {
    const image=createCanvas(1400,700),drawing=image.getContext('2d');
    drawing.fillStyle='white';drawing.fillRect(0,0,1400,700);
    drawing.fillStyle='black';drawing.font='48px "DejaVu Sans", sans-serif';
    lines.forEach((line,index)=>drawing.fillText(line,90,150+index*90));
    return image.toBuffer('image/png');
  };
  const recognize = async language => {
    await page.waitForFunction(()=>document.querySelector('.ocr-recognize')?.disabled===false);
    await modal.locator('.ocr-language').selectOption(language);
    await modal.locator('.ocr-recognize').click();
    await page.waitForFunction(()=>{
      const status=document.querySelector('.ocr-status');
      return status&&/^(Check this text against|Recognition failed:)/.test(status.textContent)
        &&!document.querySelector('.ocr-recognize').disabled;
    },null,{timeout:120000});
    assert.doesNotMatch(await modal.locator('.ocr-status').innerText(),/^Recognition failed:/);
    return modal.locator('.ocr-text').inputValue();
  };
  const russian=renderText(['Номер документа 67890','Сумма заказа 900 рублей']);
  const russianFixture=path.join(temporary,'russian.png');await writeFile(russianFixture,russian);
  await page.locator('#scanner-file').setInputFiles(russianFixture);await modal.waitFor({state:'visible'});
  const russianText=await recognize('rus');
  assert.match(russianText,/Номер документа/i);assert.match(russianText,/67890/);assert.match(russianText,/рублей/i);
  await modal.locator('.ocr-confirm').click();await modal.locator('.ocr-use').click();
  await page.locator('.ocr-document img').waitFor({state:'visible'});
  assert.match((await download('.ocr-document-text-download')).toString(),/Номер документа/i);
  report.checks.push('real offline Russian OCR and confirmed Cyrillic TXT export');

  // Two image-only pages ensure the PDF flow has to recognize both scans.
  const {PDFDocument}=await import('./dist/pdf-vendor.mjs');
  const scanned=await PDFDocument.create();
  for(const bytes of [original,renderText(['Delivery number 24680','Total amount 750 dollars'])]) {
    const image=await scanned.embedPng(bytes),sheet=scanned.addPage([700,350]);
    sheet.drawImage(image,{x:0,y:0,width:700,height:350});
  }
  const scannedBytes=await scanned.save(),pdfFixture=path.join(temporary,'two-page-scan.pdf');
  await writeFile(pdfFixture,scannedBytes);
  await page.locator('#scanner-file').setInputFiles(pdfFixture);await modal.waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.ocr-recognize')?.disabled===false);
  assert.equal(await modal.locator('.ocr-page-select option').count(),2);
  assert.equal((await modal.locator('.ocr-text').inputValue()).trim(),'');
  assert.match(await recognize('eng'),/12345/);
  await modal.locator('.ocr-confirm').click();
  assert.equal(await modal.locator('.ocr-use').isDisabled(),true,'Both PDF pages must be checked before opening');
  await modal.locator('.ocr-page-select').selectOption('1');
  await page.waitForFunction(()=>document.querySelector('.ocr-page-select')?.value==='1'
    &&document.querySelector('.ocr-recognize')?.disabled===false);
  assert.equal((await modal.locator('.ocr-text').inputValue()).trim(),'');
  assert.match(await recognize('eng'),/24680/);
  await modal.locator('.ocr-fragment-select').selectOption({index:0});
  await modal.locator('.ocr-fragment-text').fill('Checked delivery 87654');
  assert.ok(await modal.locator('.ocr-correction-layer svg path').count()>0);
  await modal.locator('.ocr-confirm').click();await modal.locator('.ocr-use').click();
  await page.locator('.ocr-document img').waitFor({state:'visible'});
  assert.equal(await page.locator('.ocr-document-page option').count(),2);
  await page.locator('.ocr-document-page').selectOption('1');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-document-corrections svg path').length>0);
  assert.deepEqual(await download('.ocr-document-original'),Buffer.from(scannedBytes));
  const checkedText=(await download('.ocr-document-text-download')).toString();
  assert.match(checkedText,/12345/);assert.match(checkedText,/Checked delivery 87654/);
  const checkedPdf=await download('.ocr-document-pdf-download');
  const checkedLoading=getDocument({data:new Uint8Array(checkedPdf),isEvalSupported:false,verbosity:0});
  try {
    const document=await checkedLoading.promise;assert.equal(document.numPages,2);
    const first=(await(await document.getPage(1)).getTextContent()).items.map(item=>item.str).join(' ');
    const second=(await(await document.getPage(2)).getTextContent()).items.map(item=>item.str).join(' ');
    assert.match(first,/12345/);assert.doesNotMatch(first,/87654/);
    assert.match(second,/Checked delivery 87654/);assert.doesNotMatch(second,/24680/);
  } finally {await checkedLoading.destroy();}
  report.checks.push('two-page scanned PDF: offline OCR of both pages, second-page visible correction, exact original and searchable PDF export');
  await page.screenshot({path:path.join(out,'document-scanner.png'),fullPage:true});
  assert.deepEqual(report.externalRequests,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.cspErrors,[]);
  report.passed=true;
} catch(error) {report.passed=false;report.error=error.stack;if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally {await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await context?.close();await rm(temporary,{recursive:true,force:true});}
