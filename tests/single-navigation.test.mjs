import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, SyntheticModule} from 'node:vm';
import {JSDOM} from 'jsdom';
const until=async predicate=>{for(let attempt=0;attempt<100;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('UI did not settle');};

test('a delayed saved document restore cannot replace a newly selected comparison workspace', async t => {
 const dom=new JSDOM(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'),{runScripts:'outside-only',url:'https://ctt.example/'}),{window}=dom,document=window.document,context=dom.getInternalVMContext();
 t.after(()=>dom.window.close());
 assert.equal(document.getElementById('single-session').parentElement,document.getElementById('single-workspace'),'saved document controls belong only to their own workspace');
 let scrolls=0;window.Element.prototype.scrollIntoView=()=>{scrolls++;};
 Object.defineProperty(document,'currentScript',{value:{src:'https://ctt.example/single-entry.js'},configurable:true});
 let resume,operate,release,mountStarted=false;
 const session={setBusy(){},flush:async()=>{},activate(){},changed(){},saved:true};
 const exports={
  'single-session.mjs':{mountSingleSession:async(_root,options)=>{resume=options.onResume;operate=options.onOperating;return session;}},
  'single-editor.mjs':{mountSingleEditor:async(root,options)=>{mountStarted=true;await new Promise(resolve=>{release=resolve;});root.textContent='Previous saved document';return {snapshot:()=>options.restoredState,changed:false,dispose(){}};}},
 };
 const modules={};for(const[name,values]of Object.entries(exports)){const module=new SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value);},{context});await module.link(()=>{});await module.evaluate();modules[name]=module;}
 new Script(readFileSync(new URL('../src/single-entry.js',import.meta.url),'utf8'),{importModuleDynamically:specifier=>modules[specifier.split('/').at(-1)]}).runInContext(context);
 await until(()=>!!resume);
 document.body.classList.remove('home-mode');
 document.querySelector('[data-work-mode="single"]').click();
 const restoring=resume({source:{name:'old-document.txt',data:'AA=='},review:{version:1,kind:'text'}});
 await until(()=>mountStarted);
 // The user goes Home and starts a fresh comparison before the saved document mounts.
 document.dispatchEvent(new window.Event('ctt:home'));
 document.body.classList.add('home-mode');
 document.getElementById('home-left-text').value='New A';
 document.getElementById('home-right-text').value='New B';
 document.body.classList.remove('home-mode');
 document.querySelector('[data-work-mode="compare"]').click();
 const newSurface=document.querySelector('[data-work-mode="compare"]');newSurface.focus();
 release();await restoring;
 assert.equal(document.body.classList.contains('single-mode'),false,'late document restore must not reopen the previous workspace');
 assert.equal(document.getElementById('compare-workspace').hidden,false);
 assert.equal(document.getElementById('single-workspace').hidden,true);
 assert.equal(document.activeElement,newSurface,'late restored work must not steal focus from new comparison');
 assert.equal(scrolls,0,'late restored work must not scroll the new comparison');
 assert.equal(document.getElementById('home-left-text').value,'New A');
 assert.match(document.getElementById('single-editor-host').textContent,/Previous saved document/,'restored work remains available through explicit Continue editing');
 mountStarted=false;
 const explicitResume=resume({source:{name:'old-document.txt',data:'AA=='},review:{version:1,kind:'text'}});
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
 const lateRead=resume({source:{name:'old-document.txt',data:'AA=='},review:{version:1,kind:'text'}});
 await until(()=>mountStarted);release();await lateRead;operate(false);
 assert.equal(document.body.classList.contains('single-mode'),false,'a delayed storage read cannot reopen old document after navigation');
 assert.equal(document.activeElement,newSurface);
});
