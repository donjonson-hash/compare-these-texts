import Tesseract from './node_modules/tesseract.js/dist/tesseract.esm.min.js';
export async function makeWorker(lang, logger = () => {}, {psm = '6'} = {}) {
  if (!['3', '6'].includes(psm)) throw new Error('Unsupported page layout mode');
  if (!['eng', 'rus'].includes(lang)) throw new Error('Unsupported language');
  const worker = await Tesseract.createWorker(lang, 1, {
    workerPath: new URL('./node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href,
    corePath: new URL('./node_modules/tesseract.js-core/', import.meta.url).href,
    langPath: new URL(`./node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/`, import.meta.url).href,
    workerBlobURL: false, logger,
  });
  try {
    await worker.setParameters({tessedit_pageseg_mode: psm});
    return worker;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}
window.ocrBenchmark = {makeWorker};
const {openPdf} = await import('./pdf-input.mjs');
const states = [];
const compare = document.querySelector('#compare');
const summary = document.querySelector('#summary');
const result = document.querySelector('#result');
const complete = s => !s.busy && s.pages.length > 0 && s.pages.every(p => p.confirmed);
function changed() {
  result.replaceChildren(); summary.textContent = '';
  compare.disabled = states.length !== 2 || states.some(s => !complete(s));
}
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const label of ['A','B']) {
  const panel = document.createElement('section');
  panel.innerHTML = `<h2>Document ${label}</h2>
    <input aria-label="Document ${label}" type="file" accept="image/png,image/jpeg,application/pdf,.pdf">
    <p class="filename"></p><div class="page-nav" hidden>
    <label>Page <select class="page-select" aria-label="Page ${label}"></select></label>
    <button class="reload">Reload page</button></div>
    <small class="pdf-note" hidden>PDF preview excludes annotations and form fields. Check the source PDF separately.</small>
    <p class="review-count" aria-live="polite"></p>
    <label>Language <select class="language"><option value="eng">English</option><option value="rus">Russian</option></select></label>
    <details><summary>Recognition options</summary><label>Layout <select class="layout"><option value="6">Single text block</option><option value="3">Automatic page layout (experimental)</option></select></label><p>Automatic layout may help columns but reorder invoices and tables.</p></details>
    <img alt="Page preview ${label}" hidden><br>
    <a class="full-size" target="_blank" rel="noopener" hidden>Open full-size image</a><br>
    <button class="recognize" disabled>Recognize</button> <button class="cancel" disabled>Cancel</button>
    <p class="status" role="status">Choose an image or PDF.</p>
    <textarea aria-label="Recognized text ${label}" placeholder="Page text appears here"></textarea>
    <label class="blank-label"><input class="blank" type="checkbox"> I checked: this page has no text to compare</label><br>
    <button class="confirm" disabled>Confirm checked text</button>
    <button class="download" disabled>Download TXT</button>`;
  document.querySelector('#panels').append(panel);
  const $ = q => panel.querySelector(q);
  const s = {pages:[],index:0,doc:null,image:null,url:null,ready:false,busy:false,generation:0,worker:null,controller:null};
  states.push(s);
  const current = () => s.pages[s.index];
  const status = text => { $('.status').textContent=text; };
  function controls() {
    const p=current();
    $('.recognize').disabled=!s.ready || s.busy;
    $('.cancel').disabled=!s.busy;
    $('.confirm').disabled=!s.ready || s.busy || !(p?.text.trim() || p?.blank);
    $('textarea').disabled=!s.ready || s.busy;
    $('.blank').disabled=!s.ready || s.busy || !!p?.text.trim();
    panel.querySelectorAll('select').forEach(el=>el.disabled=s.busy);
    $('.reload').disabled=s.busy;
    $('.download').disabled=!complete(s);
    const done=s.pages.filter(p=>p.confirmed).length;
    $('.review-count').textContent=s.pages.length?`${done} of ${s.pages.length} pages confirmed. Current page: ${s.index+1}.`:'';
    [...$('.page-select').options].forEach((option,i)=>{option.textContent=`${i+1}${s.pages[i]?.confirmed?' — checked':''}`;});
    compare.disabled=states.length!==2 || states.some(x=>!complete(x));
  }
  function invalidate() { if(current())current().confirmed=false; changed(); controls(); }
  function clearPreview() {
    if(s.url)URL.revokeObjectURL(s.url);s.url=null;s.ready=false;
    $('img').hidden=true;$('img').removeAttribute('src');
    $('.full-size').hidden=true;$('.full-size').removeAttribute('href');
  }
  // Invalidate asynchronous work before waiting for resource cleanup.
  async function stop() {
    s.generation++;s.controller?.abort();s.controller=null;
    const worker=s.worker;s.worker=null;s.busy=false;
    if(worker)await worker.terminate().catch(()=>{});
  }
  function record() { return {text:'',confirmed:false,loaded:false,blank:false,language:'eng',psm:'6',source:'unread',warning:''}; }
  async function showPage(index) {
    if(!Number.isInteger(index)||index<0||index>=s.pages.length)return;
    const pending=stop();const generation=s.generation;s.index=index;s.busy=true;clearPreview();
    s.controller=new AbortController();const signal=s.controller.signal;
    $('.page-select').value=String(index);$('textarea').value='';$('.blank').checked=false;
    controls();status(`Loading page ${index+1}…`);
    await pending;if(generation!==s.generation)return;
    try {
      const data=s.doc?await s.doc.page(index+1,{signal}):{blob:s.image,text:'',hasText:false};
      if(generation!==s.generation)return;
      const p=current();
      if(!p.loaded){p.text=data.hasText?data.text:'';p.source=data.hasText?'text-layer':'ocr';p.warning=data.textError||'';p.loaded=true;}
      s.url=URL.createObjectURL(data.blob);$('img').src=s.url;$('img').hidden=false;
      $('.full-size').href=s.url;$('.full-size').hidden=false;
      $('textarea').value=p.text;$('.blank').checked=p.blank;
      $('.language').value=p.language;$('.layout').value=p.psm;s.ready=true;
      status(p.confirmed?'Page already checked.':p.source==='text-layer'?'Text layer extracted. Check it against the page; use Recognize if text is missing or wrong.':p.warning?`Text extraction unavailable. Recognize this page. ${p.warning}`:p.text?'Review the saved page text.':'No usable text layer. Recognize this page or explicitly confirm it has no text.');
    } catch(error) {if(generation===s.generation)status(`Page could not be loaded: ${error.message}. Use Reload page or choose another document.`);}
    finally {if(generation===s.generation){s.busy=false;s.controller=null;controls();}}
  }
  s.showPage=showPage;
  $('input[type=file]').onchange=async()=>{
    const file=$('input[type=file]').files[0];
    const pending=stop();const generation=s.generation;const old=s.doc;s.doc=null;s.image=null;s.pages=[];s.index=0;
    clearPreview();$('textarea').value='';$('.blank').checked=false;$('.page-nav').hidden=true;$('.pdf-note').hidden=true;$('.page-select').replaceChildren();
    $('.filename').textContent=file?.name||'';s.busy=!!file;changed();controls();
    s.controller=new AbortController();const signal=s.controller.signal;
    await pending;await old?.destroy().catch(()=>{});if(generation!==s.generation)return;
    if(!file){s.busy=false;controls();return;}
    status('Opening document…');
    try {
      if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)) {
        const doc=await openPdf(file,{signal});
        if(generation!==s.generation){await doc.destroy();return;}
        s.doc=doc;s.pages=Array.from({length:doc.pageCount},record);$('.page-nav').hidden=false;$('.pdf-note').hidden=false;
      } else {
        if(!['image/png','image/jpeg'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a PNG/JPEG up to 10 MiB or PDF up to 20 MiB.');
        const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();
        if(pixels>12000000)throw Error('Image exceeds 12 million pixels.');
        if(generation!==s.generation)return;s.image=file;s.pages=[record()];
      }
      s.pages.forEach((_,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=String(i+1);$('.page-select').append(option);});
      s.busy=false;s.controller=null;await showPage(0);
    } catch(error) {if(generation===s.generation){s.busy=false;s.controller=null;status(`Cannot open document: ${error.message}`);controls();}}
  };
  $('.page-select').onchange=()=>showPage(Number($('.page-select').value));
  $('.reload').onclick=()=>showPage(s.index);
  $('.recognize').onclick=async()=>{
    invalidate();s.busy=true;controls();const generation=++s.generation;const p=current();
    try {
      const worker=await makeWorker(p.language,m=>{if(generation===s.generation)status(`${m.status} ${Math.round((m.progress||0)*100)}%`);},{psm:p.psm});
      if(generation!==s.generation){await worker.terminate();return;}s.worker=worker;
      const {data}=await worker.recognize(s.url);
      if(generation===s.generation){p.text=data.text;p.blank=false;p.source='ocr';$('textarea').value=p.text;$('.blank').checked=false;status('Review this page against the image, then confirm.');}
    } catch(error) {if(generation===s.generation)status(`Recognition failed: ${error.message}`);}
    finally {if(generation===s.generation){const worker=s.worker;s.worker=null;if(worker)await worker.terminate().catch(()=>{});if(generation===s.generation){s.busy=false;controls();}}}
  };
  $('.cancel').onclick=async()=>{const pending=stop();const generation=s.generation;invalidate();await pending;if(generation===s.generation){status(s.ready?'Recognition cancelled. Review or recognize again.':'Loading cancelled. Use Reload page or choose another document.');controls();}};
  $('textarea').oninput=()=>{const p=current();if(!p)return;p.text=$('textarea').value;p.blank=false;$('.blank').checked=false;invalidate();status('Text changed. Check and confirm this page again.');};
  $('.blank').onchange=()=>{if(current())current().blank=$('.blank').checked;invalidate();};
  for(const [selector,key] of [['.language','language'],['.layout','psm']])$(selector).onchange=()=>{if(current())current()[key]=$(selector).value;invalidate();status('Settings changed. Recognize again if needed, then confirm.');};
  $('.confirm').onclick=()=>{const p=current();if(!s.ready||s.busy||!(p.text.trim()||p.blank))return;p.confirmed=true;status(`Page ${s.index+1} checked.`);changed();controls();};
  $('.download').onclick=()=>{if(complete(s))download(s.pages.length===1?s.pages[0].text:s.pages.map((p,i)=>`[Page ${i+1}]\n${p.text}`).join('\n\n'),`ocr-${label}.txt`);};
}
compare.onclick=()=>{
  if(states.some(s=>!complete(s)))return;
  result.replaceChildren();let count=0;
  for(let page=0;page<Math.max(...states.map(s=>s.pages.length));page++){
    const a=states[0].pages[page],b=states[1].pages[page];
    if(a?.text===b?.text)continue;
    const heading=document.createElement('h3');heading.textContent=`Page ${page+1}`;result.append(heading);
    for(const [i,s] of states.entries())if(s.pages[page]){const button=document.createElement('button');button.textContent=`Open ${i?'B':'A'} page ${page+1}`;button.onclick=()=>{s.showPage(page);document.querySelector('#panels').scrollIntoView({behavior:'smooth'});};result.append(button);}
    const al=a?a.text.split(/\r?\n/):[],bl=b?b.text.split(/\r?\n/):[];
    for(let i=0;i<Math.max(al.length,bl.length);i++)if(al[i]!==bl[i]){count++;for(const [prefix,text,cls] of [['A',al[i],'removed'],['B',bl[i],'added']]){const p=document.createElement('pre');p.className=cls;p.textContent=`${prefix} page ${page+1}, line ${i+1}: ${text??'[missing line/page]'}`;result.append(p);}}
  }
  summary.textContent=count?`${count} differing line positions. Pages and lines are compared by position; insertions can shift later content. OCR mistakes may look like changes.`:'Confirmed texts are identical.';
};
