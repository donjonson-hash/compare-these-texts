import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {Script, SyntheticModule} from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {JSDOM, VirtualConsole} from 'jsdom';
import {handleRequest} from '../src/worker.mjs';
import {renderTextHtml} from '../src/text-report.mjs';
import {renderHtml} from '../src/report.mjs';

async function setup(t, intercept = null) {
  const errors=[];
  const console=new VirtualConsole(); console.on('jsdomError', e=>errors.push(e.message));
  const dom=new JSDOM(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'), {
    url:'https://comparetwotexts.pro/',runScripts:'outside-only',virtualConsole:console,
  });
  const {window}=dom, {document}=window, context=dom.getInternalVMContext();
  const events=[], results=[]; let sessionOptions, saved;
  window.confirm=()=>true;
  window.Element.prototype.scrollIntoView=()=>{};
  window.cttProductEvent=(name, params)=>events.push([name, JSON.parse(JSON.stringify(params))]);
  window.KristinaTransport={request:async(path,payload,options)=>{
    const run=()=>handleRequest(path,payload);
    const result=intercept ? await intercept(path,payload,options,run) : await run();
    if(path==='/api/compare')results.push(result);
    return result;
  }};
  Object.defineProperty(document,'currentScript',{value:{src:'https://comparetwotexts.pro/app.js'}});
  // Real comparison and legacy result rendering; isolate the independently tested
  // editor and storage modules so this suite can control completion and restoration.
  const moduleCache=new Map();
  async function load(url) {
    if(moduleCache.has(url))return moduleCache.get(url);
    const name=url.split('/').pop();
    let exports;
    if(name==='session-ui.mjs')exports={mountSessionUI:async(_root,options)=>{
      sessionOptions=options;
      return {setBusy(){},deactivate(){},activate(capture){saved=capture();},changed(){}};
    }};
    else if(name==='visual-review.mjs')exports={mountVisualReview:async()=>({snapshot:()=>({}),dispose(){},closeWorkspaceTools(){}})};
    else if(name==='sheet-review.mjs')exports={mountSheetReview:async()=>({snapshot:()=>({}),dispose(){},closeWorkspaceTools(){}})};
    else if(name==='text-report.mjs')exports={renderTextHtml};
    else if(name==='report.mjs')exports={renderHtml};
    else throw Error('Unexpected import '+url);
    const module=new SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context,identifier:url});
    await module.link(()=>{});await module.evaluate();moduleCache.set(url,module);return module;
  }
  window.eval(readFileSync(new URL('../src/office.js',import.meta.url),'utf8'));
  new Script(readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),{importModuleDynamically:load}).runInContext(context);
  for(let i=0;!sessionOptions&&i<100;i++)await delay(1);
  assert.ok(sessionOptions,'session resume boundary mounted');
  t.after(()=>{dom.window.close();assert.deepEqual(errors,[]);});
  const files=kind=>kind==='table' ? {
    left:new File(['sku,quantity\nA,1\n'],'private-a.csv'),right:new File(['sku,quantity\nA,2\n'],'private-b.csv'),
  } : {left:new File(['Old private sentence.'],'private-a.txt'),right:new File(['New private sentence.'],'private-b.txt')};
  const start=(kind='text')=>new Promise(resolve=>document.dispatchEvent(new window.CustomEvent('ctt:new-comparison',{detail:{files:files(kind),complete:resolve}})));
  return {window,document,events,results,start,restore:()=>sessionOptions.onResume(saved)};
}

for(const kind of ['text','table'])test(`completed ${kind} comparison emits once; rendering and restoring do not count again`,async t=>{
  const p=await setup(t);
  assert.equal((await p.start(kind)).ok,true);
  assert.equal(p.results[0].report.status,'complete');
  assert.equal(p.document.getElementById('complete-result').hidden,false);
  assert.deepEqual(p.events,[['comparison_complete',{comparison_type:kind}]]);
  const search=p.document.getElementById('search'); search.value='private';search.dispatchEvent(new p.window.Event('input'));
  p.document.getElementById('next-change').click();
  await p.restore();
  assert.deepEqual(p.events,[['comparison_complete',{comparison_type:kind}]],'restore is not a new comparison');
});

for(const abort of [false,true])test(`${abort?'aborted':'failed'} comparison emits no completion event`,async t=>{
  const p=await setup(t,async(path,_payload,_options,run)=>{
    if(path==='/api/compare'){const e=Error('Injected engine failure');if(abort)e.name='AbortError';throw e;}
    return run();
  });
  await p.start();
  assert.deepEqual(p.events,[]);
  assert.equal(p.document.getElementById('results').hidden,true);
});

test('clarification result does not emit a completed-comparison event',async t=>{
  const p=await setup(t,async(path,_payload,_options,run)=>{
    const result=await run();
    if(path==='/api/compare')result.report={...result.report,status:'needs_clarification',questions:['Check identifiers'],issues:[]};
    return result;
  });
  await p.start();
  assert.equal(p.document.getElementById('clarification').hidden,false);
  assert.deepEqual(p.events,[]);
});

test('late result from invalidated comparison is not counted',async t=>{
  let release, started;
  const waiting=new Promise(resolve=>{started=resolve;});
  const p=await setup(t,async(path,_payload,_options,run)=>{
    const result=await run();
    if(path==='/api/compare'){started();await new Promise(resolve=>{release=resolve;});}
    return result;
  });
  const pending=p.start();await waiting;
  p.document.getElementById('strip').dispatchEvent(new p.window.Event('change'));
  release();await pending;
  assert.deepEqual(p.events,[]);
  assert.equal(p.document.getElementById('results').hidden,true);
});
