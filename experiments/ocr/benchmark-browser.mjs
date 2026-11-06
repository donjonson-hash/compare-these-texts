import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import os from 'node:os';
import {createHash} from 'node:crypto';
const sha256=data=>createHash('sha256').update(data).digest('hex');
const root=dirname(fileURLToPath(import.meta.url));
const psm=process.env.OCR_PSM || '6';
const resultName=process.env.OCR_UI_ONLY==='1'?'ui-smoke.json':psm==='3'?'tesseract-auto-psm3.json':'tesseract-browser.json';
if(!['3','6'].includes(psm))throw Error('OCR_PSM must be 3 or 6');
const require=createRequire(process.env.OCR_PLAYWRIGHT_PACKAGE || resolve(root,'package.json'));
const {chromium}=require('playwright');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.gz':'application/gzip'};
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(p!==root && !p.startsWith(root+sep))throw Error('Path');const f=(await stat(p)).isDirectory()?resolve(p,'index.html'):p;res.setHeader('Content-Type',types[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-precise-memory-info'],...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{channel:'chromium'})});
 const context=await browser.newContext();const outbound=[];
 await context.route('**/*',route=>{const url=route.request().url();if(!url.startsWith(origin+'/')){outbound.push(url);return route.abort();}return route.continue();});
 const page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>window.ocrBenchmark);
 const manifest=JSON.parse(await readFile(resolve(root,'fixtures/manifest.json'),'utf8'));
 const report={manifest_sha256:sha256(await readFile(resolve(root,'fixtures/manifest.json'))),engine:'Tesseract.js browser WASM',settings:{psm,psm_name:psm==='3'?'AUTO':'SINGLE_BLOCK',oem:1,languages:['eng','rus']},version:'7.0.0',created_at:new Date().toISOString(),environment:{browser:browser.version(),platform:os.platform(),architecture:os.arch(),cpu:os.cpus()[0]?.model,logical_cpus:os.cpus().length,memory_note:'Sampled JS heap only; excludes worker/WASM allocations and total browser/process memory. Not a peak RSS measurement.'},setup:[],repeatability:[],results:[]};
 if(process.env.OCR_UI_ONLY!=='1') for(const lang of ['eng','rus']) {
   const setup=await page.evaluate(async ({lang,psm})=>{const start=performance.now();window.benchWorker=await window.ocrBenchmark.makeWorker(lang, undefined, {psm});return {lang,elapsed_ms:performance.now()-start};},{lang,psm});report.setup.push(setup);
   for(const item of manifest.filter(x=>x.lang===lang)) {
     const image_sha256=sha256(await readFile(resolve(root,'fixtures',item.image)));const truth_sha256=sha256(await readFile(resolve(root,'fixtures',item.truth)));
     const measurement=await page.evaluate(async item=>{const start=performance.now();try{const {data}=await window.benchWorker.recognize(`./fixtures/${item.image}`);return {id:item.id,status:'ok',text:data.text,elapsed_ms:performance.now()-start,sampled_main_thread_js_heap_bytes:performance.memory?.usedJSHeapSize??null};}catch(e){return{id:item.id,status:'error',text:'',error:e.message,elapsed_ms:performance.now()-start};}},item);
     measurement.image_sha256=image_sha256;measurement.truth_sha256=truth_sha256;report.results.push(measurement);console.log(`${item.id}: ${measurement.status} ${Math.round(measurement.elapsed_ms)} ms`);
   }
   const sample=manifest.find(x=>x.lang===lang && x.category==='degraded' && x.variant==='B');
   const repeated=await page.evaluate(async item=>{const first=(await window.benchWorker.recognize(`./fixtures/${item.image}`)).data.text;const second=(await window.benchWorker.recognize(`./fixtures/${item.image}`)).data.text;return {id:item.id,exact_match:first===second,runs:2,first,second};},sample);
   report.repeatability.push(repeated);
   await page.evaluate(async()=>{await window.benchWorker.terminate();delete window.benchWorker;});
 }
 report.outbound_requests_blocked=outbound;
 // Exercise real upload/OCR/review/edit/cancel flows independently of the benchmark worker.
 const imagePath=resolve(root,'fixtures',manifest[0].image);
 const upload=async index=>{await page.locator('input[type=file]').nth(index).setInputFiles(imagePath);await page.waitForFunction(i=>!document.querySelectorAll('.recognize')[i].disabled,index);};
 for(const i of [0,1]) {
  await upload(i);if(!await page.evaluate(i=>{const p=document.querySelectorAll('section')[i];const a=p.querySelector('.full-size');return !a.hidden && a.href===p.querySelector('img').src && a.href.startsWith('blob:') && a.target==='_blank' && a.rel==='noopener';},i))throw Error('Full-size image link invalid');await page.locator('.recognize').nth(i).click();
  await page.waitForFunction(i=>!document.querySelectorAll('.confirm')[i].disabled,i,{timeout:120000});
  await page.locator('.confirm').nth(i).click();
  if(i===0){
   if(await page.locator('details').first().getAttribute('open')!==null)throw Error('Recognition options must initially be collapsed');
   await page.locator('details summary').first().click();await page.locator('.layout').first().selectOption('3');
   if(!await page.locator('.download').first().isDisabled() || !await page.locator('#compare').isDisabled())throw Error('Layout change retained confirmation');
   await page.locator('.recognize').first().click();await page.waitForFunction(()=>!document.querySelector('.confirm').disabled,null,{timeout:120000});await page.locator('.confirm').first().click();
  }
 }
 await page.locator('#compare').click();
 if(await page.locator('#summary').textContent()!=='Confirmed texts are identical.')throw Error('Identical OCR comparison failed');
 await page.locator('textarea').first().fill('Changed text');
 if(!await page.locator('#compare').isDisabled() || !await page.locator('.download').first().isDisabled())throw Error('Edit did not invalidate confirmation');
 await page.locator('.confirm').first().click();
 await page.locator('input[type=file]').first().setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
 await page.waitForFunction(()=>document.querySelector('.recognize').disabled && document.querySelector('#compare').disabled);
 if(!await page.locator('.full-size').first().evaluate(a=>a.hidden && !a.hasAttribute('href')))throw Error('Invalid replacement retained full-size link');
 await upload(0);await page.locator('.recognize').first().click();await page.locator('.cancel').first().click();await upload(0);
 await page.waitForTimeout(500);
 if(await page.locator('textarea').first().inputValue()!=='')throw Error('Cancelled run wrote stale OCR');
 if(!await page.locator('#compare').isDisabled())throw Error('Replacement retained old confirmation');
 report.review_gate_smoke='passed: recognition, confirmation, compare, layout change invalidation and automatic-mode recognition, edit invalidation, invalid file, cancellation and replacement';
 await mkdir(resolve(root,'results'),{recursive:true});await writeFile(resolve(root,'results',resultName),JSON.stringify(report,null,2)+'\n');
 if(outbound.length)throw Error(`Unexpected outbound requests blocked: ${outbound.length}`);
 console.log(`Saved results/${resultName}; outbound requests: 0; review gate: passed.`);
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
