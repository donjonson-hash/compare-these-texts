(()=>{
"use strict";
// Only explicitly marked interface messages are translated; document strings stay literal.
const uiMessage = (source, params = {}) => ({__cttUiMessage: true, source, params, toString() { return globalThis.cttI18n?.t(this.source, this.params) ?? this.source.replace(/\{(\w+)\}/g, (match, key) => key in this.params ? String(this.params[key]) : match); }});
const uiError = message => ({__cttUiError: true, source: String(message ?? ''), toString() { return globalThis.cttI18n?.localizeError(this.source) ?? this.source; }});
const uiTextValues = new WeakMap();
const uiSetText = (node, value) => {
  const api = globalThis.cttI18n; api?.unbindText?.(node); node.removeAttribute?.('data-i18n-text'); node.removeAttribute?.('data-i18n'); uiTextValues.set(node, value);
  if ((value?.__cttUiMessage || value?.__cttUiError) && api) {
    // Bind a text leaf so labels can retain subsequently appended inputs and icons.
    const leaf = node.nodeType === 3 ? node : node.ownerDocument.createTextNode('');
    if (leaf !== node) node.replaceChildren(leaf);
    if (value.__cttUiError) api.bindError(leaf, value.source); else api.bindText(leaf, value.source, value.params);
  } else node.textContent = value == null ? '' : String(value);
  return value;
};
const uiAppendText = (node, value) => uiSetText(node, uiMessage('{0}{1}', {0: uiTextValues.has(node) ? uiTextValues.get(node) : node.textContent, 1: value}));
const uiOption = (label, value) => { const option = new Option('', value); uiSetText(option, label); return option; };
const uiSetAttr = (node, attr, value) => { const api = globalThis.cttI18n; node.removeAttribute?.('data-i18n-' + attr); if (value?.__cttUiMessage && api) api.bindAttr(node, attr, value.source, value.params); else { api?.unbindAttr?.(node, attr); node.setAttribute(attr, String(value)); } return value; };
const uiTranslate = (source, params = {}) => String(uiMessage(source, params));

/* Independent local draft; switching modes retains both workspaces. */
(() => {
 const $=id=>document.getElementById(id),moduleURL=new URL('single-editor.mjs',document.currentScript.src),sessionURL=new URL('single-session.mjs',document.currentScript.src);
 let controller=null,view=null,generation=0,candidate=null,busy=false,operating=false,session=null,navigationRevision=0,operationNavigation=null;
 const note=(text,error=false)=>{const notice=$('single-notice');notice.classList.toggle('error',error);notice.setAttribute('role',error?'alert':'status');notice.setAttribute('aria-live',error?'assertive':'polite');uiSetText(notice, text);notice.hidden=!text;};
 function chooseMode(next){
  document.body.classList.toggle('single-mode',next==='single');$('single-workspace').hidden=next!=='single';$('compare-workspace').hidden=next!=='compare';
  for(const button of document.querySelectorAll('[data-work-mode]'))button.setAttribute('aria-pressed',String(button.dataset.workMode===next));if(next==='single')view?.restoreViewport?.();
 }
 function focusDocument(){
  if(document.body.classList.contains('home-mode')||$('single-workspace').hidden)return;
  const current=$('single-current');current.focus({preventScroll:true});current.scrollIntoView?.({block:'start'});
 }
 function sourcePanel(open){
  $('single-source-panel').hidden=!!view&&!open;
  $('single-document-bar').hidden=!view;
  document.body.classList.toggle('single-document-open',!!view);
  document.body.classList.toggle('single-source-open',!!view&&open);
  $('single-source-toggle').setAttribute('aria-expanded',String(!!view&&open));
 }
 $('single-source-toggle').addEventListener('click',()=>{
  const open=$('single-source-panel').hidden;sourcePanel(open);
  const target=open?$('single-file'):$('single-current');target.focus({preventScroll:true});target.scrollIntoView?.({block:'center'});
 });
 $('single-new-document').addEventListener('click',()=>{if(!busy&&!operating)$('single-file').click();});
 function controls(){ $('single-new-document').disabled=$('single-source-toggle').disabled=busy||operating;$('single-open').disabled=$('single-file').disabled=busy||operating;if($('single-paste-open'))$('single-paste-open').disabled=busy||operating;$('single-editor-host').inert=busy||operating; }
 function setBusy(value){busy=value;session?.setBusy(value);controls();}
 function closeDocument(){
  generation++;controller?.abort();view?.dispose();controller=null;view=null;candidate=null;
  $('single-editor-host').replaceChildren();$('single-options').hidden=true;uiSetText($('single-current'), '');$('single-current').hidden=true;note('');sourcePanel(true);
 }
 const ready=import(sessionURL.href).then(({mountSingleSession})=>mountSingleSession($('single-session'),{
  onResume:async payload=>{const navigation=operationNavigation??navigationRevision;await install(payload,true);if(navigation===navigationRevision){chooseMode('single');focusDocument();}},onFinish:closeDocument,
  onOperating:value=>{operating=value;if(value){operationNavigation=navigationRevision;generation++;}else operationNavigation=null;controls();if(!value&&!view&&!document.body.classList.contains('home-mode')&&!$('single-workspace').hidden)$('single-file').focus({preventScroll:true});}
 })).then(ui=>{session=ui;session.setBusy(busy);return ui;}).catch(()=>{note(uiMessage("Automatic saving is unavailable. Download your edits before closing this tab."),true);return null;});
 document.querySelectorAll('[data-work-mode]').forEach(button=>button.addEventListener('click',()=>{navigationRevision++;chooseMode(button.dataset.workMode);}));
 document.addEventListener('ctt:home',()=>{navigationRevision++;});
 async function install(payload,resuming=false){
  const ticket=++generation,abort=new AbortController(),stage=document.createElement('div');let next;setBusy(true);note(resuming ? uiMessage("Restoring your document…") : uiMessage("Opening your document…"));
  try{
   const {mountSingleEditor}=await import(moduleURL.href);
   next=await mountSingleEditor(stage,{source:payload.source,sheet:payload.sheet,delimiter:payload.delimiter,restoredState:resuming?payload.review:undefined,signal:abort.signal,onStateChange:()=>{if(view===next)session?.changed();}});
   if(ticket!==generation){abort.abort();next.dispose();return;}
   await session?.flush();if(ticket!==generation){abort.abort();next.dispose();return;}
   controller?.abort();view?.dispose();controller=abort;view=next;$('single-editor-host').replaceChildren(stage);$('single-options').hidden=true;
   uiSetText($('single-current'), payload.source.name);$('single-current').hidden=false;note('');sourcePanel(false);
   // Bind to the opened file, never the candidate for a later replacement.
   const {source,sheet,delimiter}=payload;
   session?.activate(()=>({version:1,kind:'single-editor',source,sheet:sheet||null,delimiter,review:next.snapshot()}));
   const paste=$('single-paste');if(paste)paste.open=false;focusDocument();
  }catch(error){abort.abort();next?.dispose();if(ticket===generation)note(resuming ? uiError(error.message) : (view ? uiMessage("Could not open “{0}”. {1} Your current document is still open.", { 0: payload.source.name, 1: uiError(error.message) }) : uiMessage("Could not open “{0}”. {1}", { 0: payload.source.name, 1: uiError(error.message) })),true);if(resuming)throw error;}
  finally{if(ticket===generation)setBusy(false);}
 }
 async function open(){
  await ready;if(!candidate||busy||operating)return;
  if((view?.changed||session?.hasSavedWork)&&!window.confirm(String(uiMessage("Open “{0}” instead? Download your current document first if you want to keep a copy. Cancel keeps it open.", { 0: candidate.name }))))return;
  await install({source:candidate,sheet:$('single-sheet').value||null,delimiter:$('single-delimiter').value});
 }
 async function load(file){
  if(file&&/\.doc$/i.test(file.name)){note(uiMessage("Old Word files (.doc) are not supported. Open the file in Word or LibreOffice and save it as .docx, then try again."),true);return;}
  if(!file||busy||operating)return;const ticket=++generation;candidate=null;$('single-options').hidden=true;setBusy(true);
  try{
   if(file.size>2097152)throw Error('Choose a file up to 2 MB.');note(uiMessage("Reading your file…"));
   const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   const source={name:file.name,data:btoa(binary)},{inspectSingleSource}=await import(moduleURL.href),info=await inspectSingleSource(source);if(ticket!==generation)return;candidate=source;
   $('single-sheet-label').hidden=info.format!=='xlsx';$('single-delimiter-label').hidden=!['csv','tsv'].includes(info.format);
   $('single-sheet').replaceChildren();for(const name of info.sheets||[]){const option=document.createElement('option');option.value=uiSetText(option, name);$('single-sheet').append(option);}
   $('single-delimiter').value=info.delimiter||',';note('');setBusy(false);
   if(info.format==='docx'||info.format==='pdf'||info.format==='txt'){await open();}else{sourcePanel(true);$('single-options').hidden=false;uiSetText($('single-pending'), source.name);$('single-open').focus({preventScroll:true});$('single-options').scrollIntoView?.({block:'center'});}
  }catch(error){if(ticket===generation)note(uiError(error.message),true);}
  finally{if(ticket===generation)setBusy(false);}
 }
 $('single-paste-open')?.addEventListener('click',()=>{const text=$('single-paste-text').value;if(!text.trim()){note(uiMessage("Paste some text first."),true);return;}const bytes=new TextEncoder().encode(text);void load({name:'pasted-text.txt',size:bytes.length,arrayBuffer:async()=>bytes.buffer});});
 $('single-file').addEventListener('change',event=>{void load(event.target.files[0]);event.target.value='';});
 const drop=$('single-drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-dragging');void load(e.dataTransfer.files[0]);});$('single-open').addEventListener('click',()=>void open());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&view)session?.changed();});
 window.addEventListener('beforeunload',e=>{if(view?.changed&&!session?.saved){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',event=>{if(!event.persisted){session?.changed();const saving=session?.flush();controller?.abort();view?.dispose();void Promise.resolve(saving).finally(()=>session?.dispose());}});
})();

})();
