import {uiMessage, uiError, uiSetText, uiSetAttr, uiTranslate} from './ui-text.mjs';
/** A final check always describes the current draft and exact review decisions. */
export function createFinalCheck(parent,{beforeCheck,onGo,scope,matchLabel=uiMessage("No differences in checked text.")}) {
 const make=(tag,text)=>{const n=document.createElement(tag);if(text)uiSetText(n, text);return n;};
 const check=make('button',uiMessage("Check again"));check.type='button';check.className='button secondary';check.dataset.reviewAction='check';
 const panel=make('section');panel.className='final-check';panel.hidden=true;panel.dataset.checkState='idle';uiSetAttr(panel, 'aria-label', uiMessage("Final check"));
 const result=make('strong');result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.dataset.checkResult='';
 const hint=make('p'),go=make('button',uiMessage("Go to remaining differences"));go.type='button';go.className='button secondary';go.dataset.reviewAction='remaining';go.hidden=true;
 const details=make('details'),summary=make('summary',uiMessage("What was checked"));details.append(summary,make('p',scope));panel.append(result,hint,go,details);parent.append(check,panel);
 let current=[],queue,token=null,checkedToken=null;
 function dirty(){if(checkedToken===null)return;checkedToken=null;panel.hidden=false;panel.dataset.checkState='stale';uiSetText(result, uiMessage("Changes made. Check again."));uiSetText(hint, uiMessage("The previous result no longer describes the current versions."));go.hidden=true;}
 function update(items,nextQueue,revision){
  current=items;queue=nextQueue;
  const next=JSON.stringify([revision,items.map(i=>[i.key,i.differs,i.signature,nextQueue.reviewed(i.key)])]);
  if(token!==next)dirty();token=next;
 }
 check.addEventListener('click',()=>{
  if(beforeCheck()===false){dirty();return;}
  const differences=current.filter(i=>i.differs),pending=differences.filter(i=>!queue.reviewed(i.key)),kept=differences.length-pending.length;
  checkedToken=token;panel.hidden=false;panel.dataset.checkState=pending.length?'remaining':kept?'kept':'match';
  uiSetText(result, pending.length ? (pending.length===1 ? uiMessage("{0} difference still needs review.", { 0: pending.length }) : uiMessage("{0} differences still need review.", { 0: pending.length })) : kept ? uiMessage("Review complete. Your chosen differences were kept.") : matchLabel);
  uiSetText(hint, pending.length ? kept ? (kept===1 ? uiMessage("{0} other difference was kept by your choice.", { 0: kept }) : uiMessage("{0} other differences were kept by your choice.", { 0: kept })) : uiMessage("Open the remaining differences to edit them or keep B.") : kept ? (kept===1 ? uiMessage("{0} difference remains in your documents. You can download B below.", { 0: kept }) : uiMessage("{0} differences remain in your documents. You can download B below.", { 0: kept })) : uiMessage("The current versions have been checked. You can download B below."));
  go.hidden=!pending.length;
 });
 go.addEventListener('click',()=>{if(checkedToken!==null)onGo();});
 return {update,dirty};
}
