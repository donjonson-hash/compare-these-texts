import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountSessionUI} from '../dist/session-ui.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const payload=text=>({sources:{left:{name:'A.docx'},right:{name:'B.docx'}},text});
async function harness(t,{write,read,initialRow={token:null,payload:null},single=false}={}) {
 const dom=new JSDOM('<main></main>'),previous=globalThis.document;globalThis.document=dom.window.document;
 const root=document.querySelector('main');let row=initialRow;const writes=[],clears=[],restored=[];
 const store={read:async()=>read?read(row):row,write:(value,token)=>{writes.push({value,token});return write?write(value,token):Promise.resolve(row={token:'saved-'+writes.length,payload:value});},clear:async token=>{clears.push(token);return row={token:'cleared',payload:null};},close(){}};
 const ui=await mountSessionUI(root,{openStore:async()=>store,onResume:value=>restored.push(value),onFinish:()=>{},single});
 t.after(()=>{ui.dispose();dom.window.close();globalThis.document=previous;});
 return {dom,root,ui,store,writes,clears,restored,commit(value){row=value;return value;},status:()=>root.querySelector('.session-status').textContent};
}
// Controlled transaction completion tests the real autosave queue, not browser IndexedDB.
test('last edit made as a transaction completes is saved automatically and flush waits for it',async t=>{
 const first=deferred(),second=deferred();let call=0;
 const p=await harness(t,{write:()=>++call===1?first.promise:second.promise});let draft=payload('first');p.ui.activate(()=>draft);
 let flushed=false;const waiting=p.ui.flush().then(()=>{flushed=true;});
 first.resolve(p.commit({token:'first',payload:draft}));
 queueMicrotask(()=>{draft=payload('last keystroke');p.ui.changed();});
 await tick();
 assert.equal(p.writes.length,2,'The last keystroke must start saving without another edit or Retry');
 assert.equal(p.writes[1].value.text,'last keystroke');assert.equal(p.writes[1].token,'first');
 assert.equal(flushed,false,'flush must include the newly queued transaction');assert.match(p.status(),/Saving/);
 second.resolve(p.commit({token:'second',payload:draft}));await waiting;
 assert.match(p.status(),/Saved in this browser/);
 // Reopen the component against the same committed store and resume its saved work.
 p.ui.dispose();const reopened=document.createElement('section');document.body.append(reopened);
 const next=await mountSessionUI(reopened,{openStore:async()=>p.store,onResume:value=>p.restored.push(value),onFinish:()=>{}});t.after(()=>next.dispose());
 reopened.querySelector('#session-resume').click();await tick();assert.equal(p.restored[0].text,'last keystroke');
});
test('autosave failure retains the latest draft and retries only on request',async t=>{
 const first=deferred();let call=0;const p=await harness(t,{write:value=>++call===1?first.promise:Promise.resolve({token:'recovered',payload:value})});
 let draft=payload('old');p.ui.activate(()=>draft);draft=payload('newest');p.ui.changed();
 first.reject(Object.assign(new Error('Storage full'),{code:'quota'}));await p.ui.flush();await tick();
 assert.equal(p.writes.length,1,'A failed write must not enter an automatic retry loop');assert.match(p.status(),/Couldn't save/);
 p.root.querySelector('#session-retry').click();await tick();await p.ui.flush();assert.equal(p.writes.at(-1).value.text,'newest');assert.match(p.status(),/Saved/);
});
test('ending a session waits for its latest queued save before deleting it',async t=>{
 const first=deferred(),second=deferred();let call=0;const p=await harness(t,{write:()=>++call===1?first.promise:second.promise});
 let draft=payload('first');p.ui.activate(()=>draft);first.resolve(p.commit({token:'first',payload:draft}));
 queueMicrotask(()=>{draft=payload('latest');p.ui.changed();p.root.querySelector('#session-delete').click();});await tick();
 assert.equal(p.writes.length,2);assert.deepEqual(p.clears,[]);
 second.resolve(p.commit({token:'latest',payload:draft}));await tick();assert.deepEqual(p.clears,['latest']);assert.equal(p.root.hidden,true);assert.equal((await p.store.read()).payload,null);
});

test('failed legacy encryption retains the saved-work guard and supports idle restoration retry',async t=>{
 let unavailable=true;
 const original={token:'legacy-owner',payload:payload('existing work')};
 const p=await harness(t,{initialRow:original,single:true,read:row=>{
  if(unavailable)throw Object.assign(Error('Encryption unavailable'),{code:'unavailable',token:row.token,encryptionUnavailable:true});
  return row;
 }});
 assert.equal(p.ui.hasSavedWork,true,'Opening another single document must still warn about the existing draft');
 assert.equal(p.ui.saved,false);
 const retry=p.root.querySelector('#single-session-retry'),remove=p.root.querySelector('#single-session-delete');
 assert.equal(retry.hidden,false);assert.equal(retry.textContent,'Retry restoring');assert.equal(remove.hidden,false);
 assert.match(p.status(),/Couldn't restore/);assert.doesNotMatch(p.status(),/You can delete it/);
 assert.deepEqual(p.writes,[]);assert.deepEqual(p.clears,[]);
 unavailable=false;retry.click();await tick();
 assert.deepEqual(p.restored,[original.payload]);assert.deepEqual(p.writes,[]);assert.deepEqual(p.clears,[]);
 assert.equal(retry.hidden,true);assert.equal(p.ui.hasSavedWork,true);
});

test('a transient encryption failure during resume is retryable and does not mark the draft corrupt',async t=>{
 let failResume=false;
 const original={token:'encrypted-owner',payload:payload('encrypted draft')};
 const p=await harness(t,{initialRow:original,read:row=>{
  if(failResume)throw Object.assign(Error('Encryption unavailable'),{code:'unavailable',token:row.token,encryptionUnavailable:true});
  return row;
 }});
 failResume=true;p.root.querySelector('#session-resume').click();await tick();
 assert.equal(p.ui.hasSavedWork,true);assert.deepEqual(p.restored,[]);
 const retry=p.root.querySelector('#session-retry');assert.equal(retry.hidden,false);
 assert.doesNotMatch(p.status(),/You can delete it/);assert.deepEqual(p.clears,[]);
 failResume=false;retry.click();await tick();assert.deepEqual(p.restored,[original.payload]);assert.equal(retry.hidden,true);
});

test('an unreadable known draft can be explicitly deleted without first restoring it',async t=>{
 const original={token:'legacy-owner',payload:payload('old work')};
 const p=await harness(t,{initialRow:original,read:row=>{
  throw Object.assign(Error('Encryption unavailable'),{code:'unavailable',token:row.token,encryptionUnavailable:true});
 }});
 p.root.querySelector('#session-delete').click();await tick();
 assert.deepEqual(p.clears,['legacy-owner']);assert.equal(p.ui.hasSavedWork,false);assert.equal(p.root.hidden,true);
});

test('a migration quota error without a token guards replacement and requires a successful read before delete',async t=>{
 let quota=true;
 const original={token:'legacy-owner',payload:payload('legacy work')};
 const p=await harness(t,{initialRow:original,single:true,read:row=>{
  if(quota)throw Object.assign(Error('Insufficient quota during migration'),{name:'QuotaExceededError'});
  return row;
 }});
 assert.equal(p.ui.hasSavedWork,true,'Unknown saved state must not bypass replacement confirmation');
 assert.equal(p.root.querySelector('#single-session-delete').hidden,true,'No token means delete cannot safely select a stored draft');
 const retry=p.root.querySelector('#single-session-retry');assert.equal(retry.hidden,false);
 assert.deepEqual(p.writes,[]);assert.deepEqual(p.clears,[]);
 quota=false;retry.click();await tick();
 assert.deepEqual(p.restored,[original.payload]);assert.equal(p.root.querySelector('#single-session-delete').hidden,false);
 assert.deepEqual(p.writes,[]);assert.deepEqual(p.clears,[]);
});

test('an explicitly corrupt record without an owner token still exposes guarded deletion',async t=>{
 const p=await harness(t,{read:()=>{throw Object.assign(Error('Invalid record'),{code:'corrupt',token:null});}});
 assert.equal(p.ui.hasSavedWork,true);
 const remove=p.root.querySelector('#session-delete');assert.equal(remove.hidden,false);
 remove.click();await tick();assert.deepEqual(p.clears,[null]);assert.equal(p.ui.hasSavedWork,false);
});

test('idle ownership conflicts restore the latest draft without automatically overwriting it',async t=>{
 let conflict=false;
 const p=await harness(t,{initialRow:{token:'old',payload:payload('old')},read:row=>{
  if(conflict)throw Object.assign(Error('Changed in another tab'),{code:'conflict'});
  return row;
 }});
 conflict=true;p.root.querySelector('#session-resume').click();await tick();
 assert.match(p.status(),/changed in another tab/);assert.equal(p.root.querySelector('#session-retry').hidden,false);
 p.commit({token:'new',payload:payload('new')});conflict=false;
 p.root.querySelector('#session-retry').click();await tick();
 assert.equal(p.restored[0].text,'new');assert.deepEqual(p.writes,[]);assert.deepEqual(p.clears,[]);
});
