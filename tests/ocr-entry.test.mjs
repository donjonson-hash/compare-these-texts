import test from 'node:test';
import assert from 'node:assert/strict';
import {Script,SyntheticModule} from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Entry did not settle');};
test('single OCR retains a scan over 2 MiB, activates original-backed autosave and preserves it on cancelled replacement',async t=>{
 const dom=new JSDOM(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'),{runScripts:'outside-only',url:'https://ctt.example/'}),{window}=dom,document=window.document,context=dom.getInternalVMContext();
 t.after(()=>dom.window.close());window.TextEncoder=TextEncoder;window.Element.prototype.scrollIntoView=()=>{};
 Object.defineProperty(document,'currentScript',{value:{src:'https://ctt.example/single-entry.js'},configurable:true});
 const pages=[{text:'Checked scan',confirmed:true,source:'ocr',regions:[]}];let payload,activeView,prepared,accept=true,mounts=0;
 window.confirm=()=>accept;
 const session={setBusy(){},flush:async()=>{},activate(get){payload=get();},changed(){},get hasSavedWork(){return !!payload;},saved:true};
 const modules={
  'single-session.mjs':{mountSingleSession:async()=>session},
  'ocr-import.mjs':{prepareOcrImport:async(file,options)=>{prepared=options;return {kind:'ocr-document',file,result:{pages}};},probeOcrPdf:async()=>({needsReview:true})},
  'ocr-document.mjs':{mountOcrDocumentEditor:async(root,options)=>{mounts++;root.textContent='Original scan';activeView={snapshot:()=>options.restoredState,changed:true,dispose(){}};return activeView;}},
 };
 const preparedModules={};for(const[name,exports]of Object.entries(modules)){const module=new SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value);},{context});await module.link(()=>{});await module.evaluate();preparedModules[name]=module;}
 new Script(readFileSync(new URL('../src/single-entry.js',import.meta.url),'utf8'),{importModuleDynamically:specifier=>{const name=specifier.split('/').at(-1);if(!preparedModules[name])throw Error('Unexpected module '+name);return preparedModules[name];}}).runInContext(context);
 const $=id=>document.getElementById(id),bytes=new Uint8Array(3*1024*1024);bytes[0]=137;bytes[1]=80;
 async function upload(name){Object.defineProperty($('single-file'),'files',{configurable:true,value:[{name,size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});$('single-file').dispatchEvent(new window.Event('change'));await until(()=>!$('single-file').disabled);}
 await upload('scan.png');assert.equal(prepared.preserveDocument,true);assert.equal(mounts,1);assert.equal(payload.source.name,'scan.png');assert.deepEqual(Buffer.from(payload.source.data,'base64'),Buffer.from(bytes));assert.equal(payload.review.kind,'ocr');assert.equal($('single-current').textContent,'scan.png');assert.equal($('single-source-panel').hidden,true);
 const first=document.querySelector('#single-editor-host > div'),before=payload;accept=false;await upload('replacement.png');assert.equal(mounts,1);assert.equal(payload,before);assert.equal(document.querySelector('#single-editor-host > div'),first);assert.equal($('single-current').textContent,'scan.png');
});

test('a delayed saved OCR restore cannot replace a newly selected comparison workspace', async t => {
 const dom=new JSDOM(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'),{runScripts:'outside-only',url:'https://ctt.example/'}),{window}=dom,document=window.document,context=dom.getInternalVMContext();
 t.after(()=>dom.window.close());
 let scrolls=0;window.Element.prototype.scrollIntoView=()=>{scrolls++;};
 Object.defineProperty(document,'currentScript',{value:{src:'https://ctt.example/single-entry.js'},configurable:true});
 let resume,operate,release,mountStarted=false;
 const session={setBusy(){},flush:async()=>{},activate(){},changed(){},saved:true};
 const exports={
  'single-session.mjs':{mountSingleSession:async(_root,options)=>{resume=options.onResume;operate=options.onOperating;return session;}},
  'ocr-document.mjs':{mountOcrDocumentEditor:async(root,options)=>{mountStarted=true;await new Promise(resolve=>{release=resolve;});root.textContent='Previous saved OCR';return {snapshot:()=>options.restoredState,changed:false,dispose(){}};}},
 };
 const modules={};for(const[name,values]of Object.entries(exports)){const module=new SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value);},{context});await module.link(()=>{});await module.evaluate();modules[name]=module;}
 new Script(readFileSync(new URL('../src/single-entry.js',import.meta.url),'utf8'),{importModuleDynamically:specifier=>modules[specifier.split('/').at(-1)]}).runInContext(context);
 await until(()=>!!resume);
 document.body.classList.remove('home-mode');
 document.querySelector('[data-work-mode="single"]').click();
 const restoring=resume({source:{name:'old-scan.png',data:'AA=='},review:{version:1,kind:'ocr',pages:[{text:'Old text',confirmed:true,regions:[]}]}});
 await until(()=>mountStarted);
 // The user goes Home and starts a fresh comparison before the old image mounts.
 document.dispatchEvent(new window.Event('ctt:home'));
 document.body.classList.add('home-mode');
 document.getElementById('home-left-text').value='New A';
 document.getElementById('home-right-text').value='New B';
 document.body.classList.remove('home-mode');
 document.querySelector('[data-work-mode="compare"]').click();
 const newSurface=document.querySelector('[data-work-mode="compare"]');newSurface.focus();
 release();await restoring;
 assert.equal(document.body.classList.contains('single-mode'),false,'late OCR restore must not reopen the previous workspace');
 assert.equal(document.getElementById('compare-workspace').hidden,false);
 assert.equal(document.getElementById('single-workspace').hidden,true);
 assert.equal(document.activeElement,newSurface,'late restored work must not steal focus from new comparison');
 assert.equal(scrolls,0,'late restored work must not scroll the new comparison');
 assert.equal(document.getElementById('home-left-text').value,'New A');
 assert.match(document.getElementById('single-editor-host').textContent,/Previous saved OCR/,'restored work remains available through explicit Continue editing');
 mountStarted=false;
 const explicitResume=resume({source:{name:'old-scan.png',data:'AA=='},review:{version:1,kind:'ocr',pages:[{text:'Old text',confirmed:true,regions:[]}]}});
 await until(()=>mountStarted);release();await explicitResume;
 assert.equal(document.body.classList.contains('single-mode'),true,'a resume without intervening navigation still opens its document');
 assert.equal(document.getElementById('single-workspace').hidden,false);
 // IndexedDB/decryption may still be reading when the user leaves; the intent
 // must be captured at operation start, before onResume receives the payload.
 operate(true);
 document.dispatchEvent(new window.Event('ctt:home'));
 document.body.classList.add('home-mode');
 document.body.classList.remove('home-mode');
 document.querySelector('[data-work-mode="compare"]').click();newSurface.focus();
 mountStarted=false;
 const lateRead=resume({source:{name:'old-scan.png',data:'AA=='},review:{version:1,kind:'ocr',pages:[{text:'Old text',confirmed:true,regions:[]}]}});
 await until(()=>mountStarted);release();await lateRead;operate(false);
 assert.equal(document.body.classList.contains('single-mode'),false,'a delayed storage read cannot reopen old OCR after navigation');
 assert.equal(document.activeElement,newSurface);
});
