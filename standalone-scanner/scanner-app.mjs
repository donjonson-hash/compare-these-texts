import {reviewOcrFile} from './ocr-review.mjs';
import {mountOcrDocumentEditor} from './ocr-document.mjs';
import {mountScannerSession} from './scanner-session.mjs';

export async function mountScanner(doc = document, {review = reviewOcrFile, mountDocument = mountOcrDocumentEditor, mountSession = mountScannerSession, confirm = message => window.confirm(message)} = {}) {
  const $ = id => doc.getElementById(id), fileInput = $('scanner-file'), host = $('scanner-view');
  let session, view, controller, operation, busy = true, operating = false, disposed = false;
  const notice = (message = '', error = false) => { const node = $('scanner-notice'); node.textContent = message; node.hidden = !message; node.classList.toggle('error',error); };
  function controls() { fileInput.disabled = $('new-document').disabled = busy || operating || disposed; host.inert = busy || operating; session?.setBusy(busy); }
  function clear() { controller?.abort(); view?.dispose(); controller = view = null; host.replaceChildren(); $('document-name').textContent = ''; $('document-bar').hidden = true; doc.body.classList.remove('has-document'); notice(); }
  async function install(payload) {
    const nextController = new AbortController(), stage = doc.createElement('div'); let next;
    try {
      next = await mountDocument(stage,{source:payload.source,restoredState:payload.review,signal:nextController.signal,onStateChange:()=>{if(view===next)session?.changed();}});
      if (disposed) { nextController.abort(); next.dispose(); return; }
      await session?.flush();
      if (disposed) { nextController.abort(); next.dispose(); return; }
      controller?.abort(); view?.dispose(); controller=nextController; view=next; host.replaceChildren(stage);
      $('document-name').textContent=payload.source.name; $('document-bar').hidden=false; doc.body.classList.add('has-document');
      const source = payload.source;
      session?.activate(()=>({version:1,kind:'document-scanner',source,review:next.snapshot()}));
      notice(); $('document-name').focus({preventScroll:true});
    } catch (error) { nextController.abort(); next?.dispose(); throw error; }
  }
  async function load(file) {
    if (!file || busy || operating || disposed) return;
    busy=true; controls(); operation=new AbortController(); notice('Opening your scan…');
    try {
      if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error('Choose a PNG, JPEG or PDF. Word and spreadsheet editing belongs in your document editor.');
      if ((view || session?.hasSavedWork) && !confirm('Open another scan? Download your current document first if you want to keep a copy. Cancel keeps it open.')) {notice(); return;}
      const result = await review(file,{side:'single',signal:operation.signal});
      if (!result || disposed) {notice(); return;}
      const bytes=new Uint8Array(await file.arrayBuffer()); let binary='';
      for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      await install({source:{name:file.name,data:btoa(binary)},review:{version:1,kind:'ocr',pages:result.pages,currentPage:0}});
    } catch(error) { if(!disposed)notice(`${error.message}${view?' Your current document is still open.':''}`,true); }
    finally { operation=null; busy=false; controls(); }
  }
  controls();
  try {
    session=await mountSession($('scanner-session'),{onResume:async payload=>{notice('Restoring your scan…');await install(payload);},onFinish:clear,onOperating:value=>{operating=value;controls();}});
  } catch { notice('Automatic saving is unavailable. Download your files before closing this tab.',true); }
  busy=false; controls();
  fileInput.addEventListener('change',()=>{const file=fileInput.files[0];fileInput.value='';void load(file);});
  $('new-document').addEventListener('click',()=>fileInput.click());
  const drop=$('scanner-drop');
  drop.addEventListener('dragover',event=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();if(!busy&&!operating)drop.classList.add('dragging');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');void load(event.dataTransfer.files[0]);});
  const pagehide=event=>{if(!event.persisted){session?.changed();const save=session?.flush();disposed=true;operation?.abort();controller?.abort();view?.dispose();void Promise.resolve(save).finally(()=>session?.dispose());}};
  doc.defaultView?.addEventListener('pagehide',pagehide);
  const beforeunload=event=>{if(doc.querySelector('.ocr-review-dialog[open]') || (view&&!session?.saved)){event.preventDefault();event.returnValue='';}};
  doc.defaultView?.addEventListener('beforeunload',beforeunload);
  return {load,dispose(){disposed=true;operation?.abort();controller?.abort();view?.dispose();session?.dispose();doc.defaultView?.removeEventListener('pagehide',pagehide);doc.defaultView?.removeEventListener('beforeunload',beforeunload);},get current(){return view;}};
}
