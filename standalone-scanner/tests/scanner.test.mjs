import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {validateScannerPayload} from '../dist/scanner-session.mjs';

const snapshot=()=>({version:1,kind:'ocr',currentPage:0,pages:[{text:'Corrected 123',confirmed:true,regions:[{id:'line-1',text:'Corrected 123',x:.1,y:.2,width:.4,height:.05,edited:true}]}]});
const payload=()=>({version:1,kind:'document-scanner',source:{name:'scan.png',data:Buffer.from('original bytes').toString('base64')},review:snapshot()});
async function harness(t) {
  const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://scanner.invalid',runScripts:'outside-only'});
  const context=dom.getInternalVMContext();dom.window.AbortController=AbortController;
  const mod=new vm.SourceTextModule(readFileSync(new URL('../scanner-app.mjs',import.meta.url),'utf8'),{context});
  const imports={'./ocr-review.mjs':'reviewOcrFile','./ocr-document.mjs':'mountOcrDocumentEditor','./scanner-session.mjs':'mountScannerSession'};
  await mod.link(id=>new vm.SyntheticModule([imports[id]],function(){this.setExport(imports[id],()=>{});},{context}));await mod.evaluate();
  let reviewer=async()=>({pages:snapshot().pages}),approve=true,fail=false,savedPayload,sessionOptions,reviewCalls=0;
  const views=[];
  const session={saved:true,hasSavedWork:false,setBusy(){},flush:async()=>{},changed(){},dispose(){},activate(get){savedPayload=get();}};
  const app=await mod.namespace.mountScanner(dom.window.document,{
    review:async(...args)=>{reviewCalls++;return reviewer(...args);},confirm:()=>approve,
    mountSession:async(root,options)=>{sessionOptions=options;return session;},
    mountDocument:async(stage,options)=>{if(fail)throw Error('Cannot render scan');const view={options,disposed:false,snapshot:()=>options.restoredState,dispose(){this.disposed=true;}};views.push(view);return view;}
  });
  t.after(()=>{app.dispose();dom.window.close();});
  return {app,dom,views,session,get saved(){return savedPayload;},get options(){return sessionOptions;},get calls(){return reviewCalls;},review(fn){reviewer=fn;},approve(value){approve=value;},fail(value){fail=value;}};
}
test('scanner saves confirmed edited text with the exact original bytes in its own payload',async t=>{
  const h=await harness(t);await h.app.load(new File(['original bytes'],'scan.png'));
  assert.equal(h.saved.kind,'document-scanner');assert.equal(h.saved.source.data,payload().source.data);
  assert.equal(h.saved.review.pages[0].regions[0].edited,true);assert.equal(h.dom.window.document.getElementById('document-name').textContent,'scan.png');
  assert.equal(h.views[0].disposed,false);assert.equal(h.calls,1);
});
test('cancelled review, declined replacement, and failed rendering preserve the confirmed document',async t=>{
  const h=await harness(t);await h.app.load(new File(['first'],'first.png'));const first=h.app.current,original=h.saved;
  h.approve(false);await h.app.load(new File(['second'],'second.png'));assert.equal(h.calls,1);
  h.approve(true);h.review(async()=>null);await h.app.load(new File(['second'],'second.png'));assert.equal(h.app.current,first);
  h.review(async()=>({pages:snapshot().pages}));h.fail(true);await h.app.load(new File(['second'],'second.png'));
  assert.equal(h.app.current,first);assert.equal(first.disposed,false);assert.equal(h.saved,original);
  assert.match(h.dom.window.document.getElementById('scanner-notice').textContent,/current document is still open/);
});
test('unsupported input and overlapping opens cannot replace a scan',async t=>{
  const h=await harness(t);await h.app.load(new File(['word'],'word.docx'));assert.equal(h.calls,0);
  let resolve;h.review(()=>new Promise(r=>{resolve=r;}));const opening=h.app.load(new File(['one'],'one.png'));
  await h.app.load(new File(['two'],'two.png'));assert.equal(h.calls,1);resolve({pages:snapshot().pages});await opening;
  assert.equal(h.saved.source.name,'one.png');
});
test('resume uses the scanner document view and tab close warns while OCR review is unfinished',async t=>{
  const h=await harness(t);await h.options.onResume(payload());assert.equal(h.saved.kind,'document-scanner');assert.equal(h.app.current.options.source.name,'scan.png');
  const dialog=h.dom.window.document.createElement('dialog');dialog.className='ocr-review-dialog';dialog.setAttribute('open','');h.dom.window.document.body.append(dialog);
  const event=new h.dom.window.Event('beforeunload',{cancelable:true});h.dom.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  dialog.remove();const savedEvent=new h.dom.window.Event('beforeunload',{cancelable:true});h.dom.window.dispatchEvent(savedEvent);assert.equal(savedEvent.defaultPrevented,false);
});
test('scanner draft validation preserves corrections and rejects comparison, unconfirmed and mismatched text',()=>{
  const value=payload(),checked=validateScannerPayload(value);assert.equal(checked.review.pages[0].regions[0].edited,true);
  checked.review.pages[0].regions[0].text='external mutation';assert.equal(value.review.pages[0].regions[0].text,'Corrected 123');
  assert.throws(()=>validateScannerPayload({...value,kind:'comparison'}),/not supported/);
  value.review.pages[0].confirmed=false;assert.throws(()=>validateScannerPayload(value),/invalid data/);
  value.review.pages[0].confirmed=true;value.review.pages[0].text='Does not match';assert.throws(()=>validateScannerPayload(value),/invalid data/);
});
test('packaged extension has an independent identity and only local scanner assets',()=>{
  const dist=new URL('../dist/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',dist)));
  assert.equal(manifest.version,'0.1.0');assert.match(manifest.name,/Document Scanner/);assert.ok(manifest.description.length<=132);
  for(const key of ['key','permissions','host_permissions','content_scripts','externally_connectable','update_url'])assert.equal(manifest[key],undefined);
  assert.match(manifest.content_security_policy.extension_pages,/wasm-unsafe-eval/);
  const html=readFileSync(new URL('index.html',dist),'utf8');assert.doesNotMatch(html,/https?:|start-new-compare|home-left-file|home-right-file/);
  const files=readdirSync(dist);for(const absent of ['app.mjs','compare.mjs','text-source.mjs','docx.mjs','single-session.mjs'])assert.equal(files.includes(absent),false);
  for(const name of ['ocr-assets/lang/eng.traineddata.gz','ocr-assets/lang/rus.traineddata.gz','pdf-font.mjs','scanner-entry.mjs'])assert.equal(existsSync(new URL(name,dist)),true,name);
});
