import {uiMessage, uiError, uiSetText, uiSetAttr, uiTranslate} from './ui-text.mjs';
let fillFontPromise;
/** Load the bundled export font so the inline preview uses the same glyph widths. */
export async function ensurePdfFillFont(){
 if(typeof FontFace==='undefined'||!document.fonts)return;
 if(!fillFontPromise)fillFontPromise=(async()=>{
  const {default:base64}=await import('./pdf-font.mjs');
  const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
  const face=new FontFace('CttPdfFill',bytes,{style:'normal',weight:'400'});
  await face.load();document.fonts.add(face);
 })().catch(error=>{fillFontPromise=undefined;throw error;});
 return fillFontPromise;
}

const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)uiSetText(node, text);if(cls)node.className=cls;return node;};
const button=label=>{const node=el('button',label,'button secondary');node.type='button';return node;};
const clone=fields=>fields.map(field=>({...field}));

/** Inline entries are saved before changing fields or exporting the document. */
export function mountPdfFillInline({paper,page,width,height,fields,areas=[],externalToolbar=false,onHint=()=>{},onEditStart=()=>{},fitText=async field=>field,onCommit,validate,current=()=>true}){
 const ownerDocument=paper.ownerDocument;
 const layer=el('div',undefined,'pdf-fill-inline-layer');
 const toolbar=el('div',undefined,'pdf-fill-inline-toolbar');
 const add=button(uiMessage("Add text anywhere"));
 const hint=el('span',areas.length ? uiMessage("Click a highlighted line and type.") : uiMessage("Click where you want to write."));
 toolbar.append(add,hint);if(externalToolbar)toolbar.hidden=true;
 const outlines=el('div',undefined,'pdf-fill-inline-outlines');
 layer.append(toolbar,outlines);paper.append(layer);
 const base=clone(fields);
 let draft=null,disposed=false,pointer=null,rectangle=null,pending=null,revision=0,fitTimer=null,placing=false,opening=0;
 const position=(node,field)=>{node.style.left=`${field.x/width*100}%`;node.style.top=`${field.y/height*100}%`;node.style.width=`${field.width/width*100}%`;node.style.height=`${field.height/height*100}%`;};
 const scale=()=>paper.getBoundingClientRect().width/width;
 const coords=event=>{const bounds=paper.getBoundingClientRect();return {x:Math.max(0,Math.min(width,(event.clientX-bounds.left)/bounds.width*width)),y:Math.max(0,Math.min(height,(event.clientY-bounds.top)/bounds.height*height))};};
 const active=()=>!disposed&&current();
 function setHint(message){uiSetText(hint, message);onHint(message);}
 function setPlacing(value){placing=value;layer.classList.toggle('is-placing',value);setHint(value ? uiMessage("Click where you want to write, or drag to choose an area.") : areas.length ? uiMessage("Click a highlighted line and type.") : uiMessage("Use Add text to write anywhere."));}
 async function addText(){if(await commit()&&active())setPlacing(!placing);}
 function occupied(area){return base.some(field=>field.page===page&&field.x+field.width/2>=area.x&&field.x+field.width/2<=area.x+area.width&&field.y+field.height/2>=area.y&&field.y+field.height/2<=area.y+area.height);}
 function draw(){
  outlines.replaceChildren();
  for(const [index,area] of areas.entries()){
   if((area.page&&area.page!==page)||occupied(area))continue;
   const box=button(area.width<50 ? '…' : uiMessage("Type here"));box.className='pdf-fill-inline-blank';position(box,area);uiSetAttr(box, 'aria-label', uiMessage("Fill blank line {0}", { 0: index+1 }));
   box.addEventListener('click',()=>void create(area));outlines.append(box);
  }
  for(const [index,field] of base.entries()){
   if(field.page!==page||field.id===draft?.field.id)continue;
   const box=button(field.text);box.className='pdf-fill-inline-existing';position(box,field);box.style.fontSize=`${field.fontSize*scale()}px`;uiSetAttr(box, 'aria-label', uiMessage("Edit added text {0}: {1}", { 0: index+1, 1: (field.text || uiMessage("empty")) }));
   box.addEventListener('click',()=>void open(field));outlines.append(box);
  }
 }
 function close(){revision++;clearTimeout(fitTimer);draft?.editor.remove();draft=null;if(!disposed)draw();}
 function changed(){return !!draft&&(draft.isNew?draft.field.text.trim().length>0:JSON.stringify(draft.field)!==JSON.stringify(draft.original));}
 function failure(error,focus=true){if(!draft)return;const message=String(error.message||error).replace(/^PDF:\s*/,'');uiSetText(draft.status, /fit|vertically|word|room/i.test(message) ? uiMessage("This text needs more space. Open Format to widen the area or adjust the text size.") : uiError(message));draft.status.classList.add('is-error');if(focus)draft.input.focus({preventScroll:true});}
 function display(){
  if(!draft)return;
  const {field,editor,input,panel}=draft;
  if([field.x,field.y,field.width,field.height].every(Number.isFinite))position(editor,field);
  input.style.fontSize=`${field.fontSize*scale()}px`;input.style.lineHeight='1.2';
  panel.classList.toggle('is-above',field.y+field.height>height*.68);
  panel.style.left=field.x>width*.55?'auto':'0';panel.style.right=field.x>width*.55?'0':'auto';
 }
 function setBusy(busy){if(!draft)return;for(const control of draft.editor.querySelectorAll('input,textarea,button'))control.disabled=busy;draft.controls.fontSize.disabled=busy||draft.auto.checked;}
 function fitSource(field){return {...field,autoSize:draft.auto.checked,preferredFontSize:draft.preferredFontSize,fontSize:draft.auto.checked?draft.preferredFontSize:field.fontSize};}
 async function fit(field){const source=fitSource(field);return source.autoSize?await fitText(source):source;}
 function scheduleFit(){
  revision++;clearTimeout(fitTimer);display();if(!draft)return;
  draft.status.classList.remove('is-error');uiSetText(draft.status, uiMessage("Saves when you leave this field. Enter to save."));
  if(!draft.auto.checked||!draft.field.text.trim())return;
  const ticket=revision,editor=draft.editor,field=fitSource(draft.field);
  fitTimer=setTimeout(async()=>{try{const fitted=await fitText(field);if(!active()||!draft||draft.editor!==editor||ticket!==revision)return;draft.field={...fitted};for(const [key,control] of Object.entries(draft.controls))control.value=String(fitted[key]);display();}catch(error){if(draft?.editor===editor&&ticket===revision)failure(error,false);}},180);
 }
 async function commit(remove=false,force=false){
  if(pending)return pending;
  if(!draft)return true;
  if(!active()){failure(Error('The document changed. Reopen the document to continue.'));return false;}
  if(!remove&&((!changed()&&!force)||(draft.isNew&&!draft.field.text.trim()))){close();return true;}
  revision++;clearTimeout(fitTimer);setBusy(true);
  const entry=draft,field={...entry.field};
  const work=(async()=>{
   try{
    const fitted=remove?null:await fit(field);
    const proposal=base.filter(item=>item.id!==field.id);
    if(fitted&&fitted.text.trim())proposal.push(fitted);
    await validate(proposal);
    if(!active())throw Error('The document changed. Reopen the document to continue.');
    await onCommit(clone(proposal));
    if(disposed)return false;
    base.splice(0,base.length,...clone(proposal));close();return true;
   }catch(error){if(!disposed){setBusy(false);failure(error);}return false;}
  })();
  pending=work;try{return await work;}finally{pending=null;}
 }
 async function open(field){
  if(!active())return;
  if(draft?.field.id===field.id){draft.input.focus({preventScroll:true});return;}
  const ticket=++opening;
  if(!await commit()||!active()||ticket!==opening)return;
  onEditStart();
  if(!active()||ticket!==opening)return;
  const editor=el('div',undefined,'pdf-fill-inline-editor');editor.setAttribute('role','group');uiSetAttr(editor, 'aria-label', uiMessage("Fill text area"));
  const input=el('textarea',undefined,'pdf-fill-inline-text');input.value=field.text;input.maxLength=4000;uiSetAttr(input, 'aria-label', uiMessage("Field text"));input.spellcheck=true;
  const panel=el('div',undefined,'pdf-fill-inline-panel'),status=el('p',uiMessage("Saves when you leave this field. Enter to save."));status.setAttribute('role','status');
  const actions=el('div',undefined,'pdf-fill-inline-actions'),save=button(uiMessage("Save")),cancel=button(uiMessage("Cancel")),remove=button(uiMessage("Delete text"));actions.append(save,cancel);
  const isNew=!base.some(item=>item.id===field.id);if(!isNew)actions.append(remove);
  const format=el('details'),summary=el('summary',uiMessage("Format")),settings=el('div',undefined,'pdf-fill-inline-settings');
  const autoLabel=el('label','', 'pdf-fill-inline-auto'),auto=el('input');auto.type='checkbox';auto.checked=field.autoSize!==false;uiSetAttr(auto, 'aria-label', uiMessage("Automatically fit text"));autoLabel.append(auto,document.createTextNode(String(uiMessage("Automatically fit text"))));
  const controls={};
  draft={preferredFontSize:field.preferredFontSize??field.fontSize,field:{...field},original:{...field},isNew,editor,input,panel,status,auto,controls};
  for(const [key,label,min,max] of [['fontSize',uiMessage("Text size"),6,72],['width',uiMessage("Width"),1,width],['height',uiMessage("Height"),1,height],['x',uiMessage("Left"),0,width],['y',uiMessage("Top"),0,height]]){
   const labelNode=el('label',uiMessage("{0} (pt)", { 0: label })),control=el('input');control.type='number';control.min=String(min);control.max=String(max);control.step='0.1';control.value=String(field[key]);uiSetAttr(control, 'aria-label', uiMessage("{0} in points", { 0: label }));labelNode.append(control);settings.append(labelNode);controls[key]=control;
   control.addEventListener('input',()=>{draft.field[key]=control.value===''?NaN:Number(control.value);if(key==='fontSize')draft.preferredFontSize=draft.field.fontSize;else{draft.field.detected=false;delete draft.field.lineY;delete draft.field.fitAreaY;delete draft.field.fitAreaHeight;}scheduleFit();});
  }
  controls.fontSize.disabled=auto.checked;
  auto.addEventListener('change',()=>{controls.fontSize.disabled=auto.checked;draft.field.autoSize=auto.checked;scheduleFit();});
  format.append(summary,autoLabel,settings);panel.append(status,actions,format);editor.append(input,panel);layer.append(editor);draw();display();
  input.addEventListener('input',()=>{draft.field.text=input.value;scheduleFit();});
  save.addEventListener('click',()=>void commit(false,true));remove.addEventListener('click',()=>void commit(true));
  cancel.addEventListener('click',()=>{if(!pending){close();add.focus({preventScroll:true});}});
  input.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!pending){close();add.focus({preventScroll:true});}}
   if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();void commit();}
   if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();const next=areas.find(area=>(!area.page||area.page===page)&&!occupied(area)&&(area.y>field.y+2||(Math.abs(area.y-field.y)<=2&&area.x>field.x+2)));void commit().then(ok=>{if(ok){if(next)void create(next);else add.focus({preventScroll:true});}});}
  });
  input.focus({preventScroll:true});
 }
 async function create(area){
  if(!await commit()||!active())return;
  if(base.length>=100){setHint(uiMessage("Use up to 100 text areas."));return;}
  const w=Math.min(area.width??200,width),h=Math.min(area.height??24,height);
  setPlacing(false);
  await open({...area,id:crypto.randomUUID(),page,x:Math.max(0,Math.min(area.x,width-w)),y:Math.max(0,Math.min(area.y,height-h)),width:w,height:h,text:'',fontSize:area.fontSize??12});
 }
 add.addEventListener('click',()=>void addText());
 layer.addEventListener('pointerdown',event=>{
  if(!placing||event.button!==0||pending||event.target.closest('button,textarea,input,details,.pdf-fill-inline-panel,.pdf-fill-inline-toolbar'))return;
  const point=coords(event);if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
  event.preventDefault();pointer={id:event.pointerId,start:point};rectangle=el('div',undefined,'pdf-fill-inline-selection');layer.append(rectangle);layer.setPointerCapture?.(event.pointerId);position(rectangle,{...point,width:0,height:0});
 });
 layer.addEventListener('pointermove',event=>{if(!pointer||event.pointerId!==pointer.id)return;const end=coords(event),start=pointer.start;position(rectangle,{x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)});});
 function finish(event,cancelled=false){
  if(!pointer||event.pointerId!==pointer.id)return;
  const start=pointer.start,end=coords(event);pointer=null;rectangle?.remove();rectangle=null;if(cancelled)return;
  const w=Math.abs(end.x-start.x),h=Math.abs(end.y-start.y);
  if(w<5&&h<5){if(draft){void commit();return;}void create({x:start.x,y:Math.max(0,start.y-18),width:Math.min(200,width-start.x),height:24});return;}
  if(w<15||h<8){setHint(uiMessage("Click to add text, or draw a larger area."));return;}
  void create({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:w,height:h});
 }
 layer.addEventListener('pointerup',event=>finish(event));layer.addEventListener('pointercancel',event=>finish(event,true));
 const outside=event=>{if(draft&&!layer.contains(event.target)&&!pending)void commit();};ownerDocument.addEventListener('pointerdown',outside,true);
 const escape=event=>{if(event.key==='Escape'&&placing){setPlacing(false);event.preventDefault();}};ownerDocument.addEventListener('keydown',escape);
 draw();
 return {get dirty(){return changed();},flush:()=>commit(),addText,focus(){draft?.input.focus({preventScroll:true});},dispose(){disposed=true;close();ownerDocument.removeEventListener('pointerdown',outside,true);ownerDocument.removeEventListener('keydown',escape);layer.remove();}};
}
