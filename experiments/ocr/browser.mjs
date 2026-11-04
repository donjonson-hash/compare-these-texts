import Tesseract from './node_modules/tesseract.js/dist/tesseract.esm.min.js';
export async function makeWorker(lang, logger = () => {}) {
  if (!['eng', 'rus'].includes(lang)) throw new Error('Unsupported language');
  return Tesseract.createWorker(lang, 1, {
    workerPath: new URL('./node_modules/tesseract.js/dist/worker.min.js', import.meta.url).href,
    corePath: new URL('./node_modules/tesseract.js-core/', import.meta.url).href,
    langPath: new URL(`./node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/`, import.meta.url).href,
    workerBlobURL: false, logger,
  });
}
window.ocrBenchmark = {makeWorker};
const states = [];
const compare = document.querySelector('#compare');
const summary = document.querySelector('#summary');
const result = document.querySelector('#result');
function changed() { result.replaceChildren(); summary.textContent = ''; compare.disabled = states.length !== 2 || states.some(s => !s.confirmed || s.busy); }
for (const label of ['A', 'B']) {
  const panel = document.createElement('section');
  panel.innerHTML = `<h2>Document ${label}</h2><input aria-label="Image ${label}" type="file" accept="image/png,image/jpeg"><br><label>Language <select><option value="eng">English</option><option value="rus">Russian</option></select></label><br><img alt="Original document ${label}" hidden><br><a class="full-size" target="_blank" rel="noopener" hidden>Open full-size image</a><br><button class="recognize" disabled>Recognize</button> <button class="cancel" disabled>Cancel</button><p class="status" role="status">Choose an image.</p><textarea aria-label="Recognized text ${label}" placeholder="Recognized text appears here"></textarea><button class="confirm" disabled>Confirm checked text</button> <button class="download" disabled>Download TXT</button>`;
  document.querySelector('#panels').append(panel);
  const $ = q => panel.querySelector(q);
  const s = {confirmed:false,busy:false,worker:null,generation:0,url:null,ready:false}; states.push(s);
  const invalidate = () => { s.confirmed=false; $('.download').disabled=true; changed(); };
  const controls = () => { $('.recognize').disabled = !s.ready || s.busy; $('.cancel').disabled=!s.busy; $('.confirm').disabled=s.busy || !s.ready || !$('textarea').value.trim(); $('textarea').disabled=s.busy; $('select').disabled=s.busy; };
  async function cancel() { s.generation++; const w=s.worker;s.worker=null;s.busy=false;if(w) await w.terminate(); controls(); }
  $('input').onchange = async () => {
    invalidate();s.ready=false;$('.full-size').hidden=true;$('.full-size').removeAttribute('href');const pending=cancel(); const generation=s.generation;controls();await pending;if(generation!==s.generation)return; $('textarea').value=''; $('img').hidden=true;
    if(s.url) URL.revokeObjectURL(s.url);s.url=null;
    const file=$('input').files[0]; if(!file)return;
    try {
      if(!['image/png','image/jpeg'].includes(file.type) || file.size>10*1024*1024)throw new Error('Choose a PNG/JPEG no larger than 10 MiB.');
      const bitmap=await createImageBitmap(file); const pixels=bitmap.width*bitmap.height; bitmap.close();
      if(pixels>12000000)throw new Error('Image exceeds 12 million pixels.');
      if(generation!==s.generation)return;
      s.url=URL.createObjectURL(file);$('img').src=s.url;$('img').hidden=false;$('.full-size').href=s.url;$('.full-size').hidden=false;s.ready=true;$('.status').textContent='Ready to recognize.';
    }catch(e){if(generation===s.generation)$('.status').textContent=e.message;}if(generation===s.generation)controls();
  };
  $('.recognize').onclick = async () => {
    invalidate();s.busy=true;controls();const generation=++s.generation;
    try {
      const w=await makeWorker($('select').value, m => {if(generation===s.generation)$('.status').textContent=`${m.status} ${Math.round((m.progress||0)*100)}%`;});
      if(generation!==s.generation){await w.terminate();return;}s.worker=w;
      const {data}=await w.recognize(s.url);
      if(generation===s.generation){$('textarea').value=data.text;$('.status').textContent='Review the text against the image, then confirm.';}
    }catch(e){if(generation===s.generation)$('.status').textContent=`Recognition failed: ${e.message}`;}
    finally {if(generation===s.generation){const w=s.worker;s.worker=null;if(w)await w.terminate();if(generation===s.generation){s.busy=false;controls();changed();}}}
  };
  $('.cancel').onclick=async()=>{const pending=cancel();const generation=s.generation;await pending;if(generation!==s.generation)return;invalidate();$('.status').textContent='Recognition cancelled.';};
  $('textarea').oninput=()=>{invalidate();controls();$('.status').textContent='Text changed. Check and confirm it again.';};
  $('select').onchange=()=>{invalidate();$('.status').textContent='Language changed. Recognize again if needed.';};
  $('.confirm').onclick=()=>{if(s.busy || !s.ready || !$('textarea').value.trim())return;s.confirmed=true;s.text=$('textarea').value;$('.download').disabled=false;$('.status').textContent='Text confirmed.';changed();};
  $('.download').onclick=()=>{if(!s.confirmed)return;const url=URL.createObjectURL(new Blob([s.text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`ocr-${label}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
compare.onclick=()=>{
  if(states.some(s=>!s.confirmed || s.busy))return;
  result.replaceChildren();const a=states[0].text.split(/\r?\n/),b=states[1].text.split(/\r?\n/);let count=0;
  for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i]){count++;for(const [prefix,text,cls] of [['A',a[i],'removed'],['B',b[i],'added']]){const p=document.createElement('pre');p.className=cls;p.textContent=`${prefix} line ${i+1}: ${text??'[missing line]'}`;result.append(p);}}
  summary.textContent=count?`${count} differing line positions. Pilot uses line-by-position comparison; inserted lines can shift later rows. OCR mistakes may look like document changes.`:'Confirmed texts are identical.';
};
