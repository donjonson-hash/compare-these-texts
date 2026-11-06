import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {ocrSourceBytes, validateOcrSnapshot} from '../src/ocr-document-model.mjs';
import {checkedTextFile} from '../src/ocr-import.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const region = {id:'line-1',text:'Invoice 123',x:0.1,y:0.2,width:0.4,height:0.1};
const state = () => ({version:1,kind:'ocr',currentPage:0,pages:[{text:'Invoice 123',confirmed:true,source:'ocr',regions:[region]},{text:'Second page',confirmed:true,source:'ocr',regions:[]}]});
async function harness(t, {failRender = false, onDestroy = () => {}} = {}) {
  const dom = new JSDOM('<main></main>', {runScripts:'outside-only',url:'https://example.invalid/'}), context = dom.getInternalVMContext();
  dom.window.File=File; dom.window.structuredClone=structuredClone; dom.window.TextEncoder=TextEncoder;
  t.after(()=>dom.window.close());
  const blobs=new Map(), revoked=[], calls=[], downloads=[]; let serial=0, destroyed=0, reviewResolve, reviewOptions, changes=0;
  dom.window.URL.createObjectURL=blob=>{const url='blob:local-'+ ++serial; blobs.set(url,blob);return url;};
  dom.window.URL.revokeObjectURL=url=>revoked.push(url);
  dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)});};
  dom.window.HTMLImageElement.prototype.decode=async()=>{};
  const modules = {
    './ocr-pdf-input.mjs':{openPdf:async()=>({pageCount:2,page:async n=>{calls.push(n);if(failRender)throw Error('Page render failed');return {blob:new Blob(['page '+n])};},destroy:async()=>{destroyed++;onDestroy();}})},
    './ocr-image-input.mjs':{validateOcrImage:async()=>{}},
    './ocr-review.mjs':{reviewOcrFile:async(file,options)=>{reviewOptions=options; return new Promise(resolve=>{reviewResolve=resolve;});}},
    './ocr-import.mjs':{checkedTextFile},
    './ocr-document-model.mjs':{ocrSourceBytes,validateOcrSnapshot},
  };
  const module=new vm.SourceTextModule(readFileSync(new URL('../src/ocr-document.mjs',import.meta.url),'utf8'),{context});
  await module.link(specifier=>new vm.SyntheticModule(Object.keys(modules[specifier]),function(){for(const [key,value] of Object.entries(modules[specifier]))this.setExport(key,value);},{context}));await module.evaluate();
  const source={name:'scan.pdf',data:Buffer.from('%PDF-original bytes').toString('base64')};
  const view=await module.namespace.mountOcrDocumentEditor(dom.window.document.querySelector('main'),{source,restoredState:state(),onStateChange:()=>changes++});
  t.after(()=>{view.dispose();dom.window.close();});
  return {dom,view,source,calls,downloads,revoked,$:s=>dom.window.document.querySelector(s),get destroyed(){return destroyed;},get changes(){return changes;},get reviewOptions(){return reviewOptions;},resolveReview(value){reviewResolve(value);}};
}
test('OCR document keeps original bytes, locations and page selection through snapshot',async t=>{
  const h=await harness(t);
  assert.deepEqual(h.calls,[1]);
  const box=h.$('.ocr-document-region');assert.equal(box.style.left,'10%');assert.equal(box.style.width,'40%');box.click();
  assert.equal(h.$('.ocr-document-selected-text').textContent,'Invoice 123');
  h.$('.ocr-document-original').click();assert.equal(h.downloads[0].name,'scan.pdf');assert.equal(await h.downloads[0].blob.text(),'%PDF-original bytes');
  h.$('.ocr-document-text-download').click();assert.match(h.downloads[1].name,/checked OCR.*txt/);assert.equal(await h.downloads[1].blob.text(),'Invoice 123\n\nSecond page');
  const page=h.$('.ocr-document-page');page.value='1';page.dispatchEvent(new h.dom.window.Event('change'));await tick();
  assert.deepEqual(h.calls,[1,2]);assert.equal(h.view.snapshot().currentPage,1);assert.equal(h.changes,1);assert.equal(h.$('.ocr-document-region'),null);
  const snapshot=h.view.snapshot();snapshot.pages[0].text='outside mutation';assert.equal(h.view.snapshot().pages[0].text,'Invoice 123');
  h.view.dispose();assert.equal(h.destroyed,1);assert.ok(h.revoked.length>=2);
});
test('a failed first render rejects mounting and releases the new PDF before replacement', async t => {
  let destroyed = 0;
  await assert.rejects(harness(t, {failRender:true, onDestroy:()=>destroyed++}), /Page render failed/);
  assert.equal(destroyed, 1);
});
test('cancelled rereview cannot mutate checked text; only a confirmed result replaces it',async t=>{
  const h=await harness(t);
  h.$('.ocr-document-review').click();assert.equal(h.$('.ocr-document-page').disabled,true);
  h.reviewOptions.restoredPages[0].text='unconfirmed mutation';h.resolveReview(null);await tick();
  assert.equal(h.view.snapshot().pages[0].text,'Invoice 123');assert.equal(h.changes,0);
  h.$('.ocr-document-review').click();const pages=state().pages;pages[0].text='Invoice 456';pages[0].regions[0]={...region,text:'Invoice 456'};
  h.resolveReview({pages,text:'Invoice 456\n\nSecond page'});await tick();await tick();
  assert.equal(h.view.snapshot().pages[0].text,'Invoice 456');assert.equal(h.changes,1);h.$('.ocr-document-region').click();assert.equal(h.$('.ocr-document-selected-text').textContent,'Invoice 456');
});
test('unconfirmed rereview and late results after dispose cannot replace the document',async t=>{
  const h=await harness(t);h.$('.ocr-document-review').click();const pages=state().pages;pages[0].confirmed=false;h.resolveReview({pages});await tick();
  assert.equal(h.view.snapshot().pages[0].confirmed,true);assert.equal(h.changes,0);assert.match(h.$('.ocr-document-status').textContent,/Could not review/);
  h.$('.ocr-document-review').click();h.view.dispose();assert.equal(h.reviewOptions.signal.aborted,true);h.resolveReview({pages:state().pages});await tick();assert.equal(h.changes,0);
});
