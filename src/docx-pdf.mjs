/** Local, searchable PDF of the same edited Word model shown in the editor. */
import {PDFDocument, fontkit, rgb} from './pdf-vendor.mjs';
import regularBytes from './pdf-font.mjs';
import boldBytes from './word-font-bold.mjs';
import {sheetPdfFont} from './sheet-pdf-font.mjs';
import {wantsColorEmoji} from './pdf-emoji-style.mjs';
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const pt=(s,fallback=0)=>typeof s==='number'?s:typeof s==='string'&&/^\d+(?:\.\d+)?(?:pt|px)?$/.test(s)?parseFloat(s)*(s.endsWith('px')?.75:1):fallback;
const color=(s,fallback='#202820')=>{const value=/^#[a-f\d]{6}$/i.test(s||'')?s:fallback;return rgb(...[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255));};
const fail=message=>{throw new Error(message);};
const abort=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
// Word can split a single emoji across runs. A grapheme keeps the style of its
// first code point; surrounding text retains its own run's style.
function graphemeRuns(runs){
 const result=[],segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});let pending=[];
 function flush(){
  if(!pending.length)return;let text='',spans=[];
  for(const run of pending){spans.push({start:text.length,run});text+=run.text||'';}
  let index=0,last=-1;
  for(const part of segmenter.segment(text)){
   while(index+1<spans.length&&spans[index+1].start<=part.index)index++;
   if(last===index)result.at(-1).text+=part.segment;else{result.push({...spans[index].run,text:part.segment});last=index;}
  }
  pending=[];
 }
 for(const run of runs){if(run.image||run.field||run.pageBreak){flush();result.push(run);}else pending.push(run);}
 flush();return result;
}

export async function renderDocxPdf(model,{signal,onLayout}={}) {
  abort(signal);
  if(!model?.blocks?.length||!model.page)fail('The Word document could not be prepared. Download DOCX to keep editing.');
  if(model.pdfUnsupported?.length)fail(model.pdfUnsupported[0]);
  if(model.headersFooters?.length&&!model.peripherals)fail('The headers and footers could not be prepared. Download DOCX to preserve them.');
  const pageWidth=model.page.width*.75,pageHeight=model.page.height*.75;
  const margins=Object.fromEntries(['Left','Right','Top','Bottom'].map(k=>[k.toLowerCase(),model.page['margin'+k]*.75]));
  const usable=pageWidth-margins.left-margins.right;let bodyHeight=pageHeight-margins.top-margins.bottom;
  if(![pageWidth,pageHeight,usable,bodyHeight].every(n=>Number.isFinite(n)&&n>24))fail('The page margins leave too little room for a PDF.');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const baseFonts={regular:await pdf.embedFont(decode(regularBytes),{subset:true,features:{liga:false}}),bold:await pdf.embedFont(decode(boldBytes),{subset:true,features:{liga:false}})};
  const regularChars=new Set(baseFonts.regular.getCharacterSet()),boldChars=new Set(baseFonts.bold.getCharacterSet());
  const emojiSegments=new Intl.Segmenter('en',{granularity:'grapheme'});
  const needsFallback=text=>Array.from(emojiSegments.segment(text||''),s=>s.segment).some(wantsColorEmoji)||Array.from(text||'').some(c=>!/[\s\p{Default_Ignorable_Code_Point}]/u.test(c)&&(!regularChars.has(c.codePointAt(0))||!boldChars.has(c.codePointAt(0))))||(/\p{Extended_Pictographic}/u.test(text||'')&&/[\u200d\ufe0f]/u.test(text||''));
  let emoji=baseFonts.regular;
  const textboxBlocks=Object.values(model.peripheralTextboxes||{}).flatMap(types=>Object.values(types).flatMap(boxes=>boxes.flatMap(box=>box.blocks||[])));
  const peripheralBlocks=['header','footer'].flatMap(kind=>Object.values(model.peripherals?.[kind]||{}).flat());
  const styledBlocks=[...model.blocks,...textboxBlocks,...peripheralBlocks];
  const allText=[...styledBlocks,...(model.headersFooters||[])].flatMap(b=>[b.text||'',(b.runs||[]).map(r=>r.text||'').join(''),b.list?.label||'']);
  if(allText.some(needsFallback)){
    const {default:emojiBytes}=await import('./sheet-emoji-font.mjs');
    const {createEmojiPdfFont}=await import('./pdf-emoji-font.mjs');
    const {prepareColorEmoji}=await import('./pdf-color-emoji.mjs');
    const colorImages=await prepareColorEmoji(pdf,allText,{signal});abort(signal);
    emoji=await createEmojiPdfFont(pdf,decode(emojiBytes),{colorImages});
  }
  const fontOptions={errorMessage:'This document contains a character that the PDF fonts cannot display. Download DOCX to preserve it.',preferFallback:wantsColorEmoji};
  const fonts=Object.fromEntries(Object.entries(baseFonts).map(([key,font])=>[key,sheetPdfFont(font,emoji,fontOptions)]));
  // Carlito is metrically compatible with Calibri. Using the generic fallback
  // font here can overflow a fixed Word text box even when its source text fits.
  const isCalibri=style=>/^(?:calibri|carlito)$/i.test((style?.fontFamily||'').replace(/["']/g,'').trim());
  let calibriFonts;
  if(styledBlocks.some(block=>isCalibri(block.style)||(block.runs||[]).some(run=>isCalibri(run.style)))){
    const [{default:regular},{default:bold}]=await Promise.all([import('./word-calibri-regular-font.mjs'),import('./word-calibri-bold-font.mjs')]);
    calibriFonts={};
    for(const [key,bytes]of Object.entries({regular,bold})){const font=await pdf.embedFont(decode(bytes),{subset:true,features:{liga:false}});calibriFonts[key]=sheetPdfFont(font,emoji,fontOptions);}
  }
  let symbolFont;
  async function markerFont(label,preferred){
    // Exact supplementary Wingdings mapping, with an offline subset font.
    // Do not replace unknown markers or silently drop unsupported characters.
    if(label!=='\u{1F87A}')return preferred;
    if(!symbolFont){const {default:bytes}=await import('./word-symbol-font.mjs');const font=await pdf.embedFont(decode(bytes),{subset:true,features:{liga:false}});symbolFont=sheetPdfFont(font,font,fontOptions);}
    return symbolFont;
  }
  const pictures=new Map(),layout=[];let work=0;
  const cooperate=async()=>{if(++work%20===0){await new Promise(r=>setTimeout(r,0));abort(signal);}};
  function typography(style={},heading){const selected=isCalibri(style)&&calibriFonts?calibriFonts:fonts;return {font:style.fontWeight==='bold'||!style.fontWeight&&heading?selected.bold:selected.regular,size:pt(style.fontSize,heading?Math.max(12,24-heading*2):11),color:color(style.color),italic:style.fontStyle==='italic',decoration:style.textDecoration||''};}
  function checkText(text,font){font.check(text);}
  async function imageFor(image){
    if(!pictures.has(image.src)){const match=/^data:image\/(png|jpeg);base64,([A-Za-z\d+/=]+)$/.exec(image.src);if(!match)fail('An image could not be included in the PDF.');const bytes=decode(match[2]);pictures.set(image.src,await(match[1]==='png'?pdf.embedPng(bytes):pdf.embedJpg(bytes)));}
    return pictures.get(image.src);
  }
  async function paragraph(block,width,fields,{noWrap=false}={}){
    if(!block)fail('A paragraph is missing from the Word document.');
    const style=block.style||{},base=typography(style,block.heading),left=block.list?Math.max(0,block.list.indent?.left??(block.list.level+1)*36):pt(style.paddingLeft),right=pt(style.paddingRight);
    const indent=block.list?0:pt(style.textIndent),available=width-left-right;
    if(available<8)fail('A paragraph is too narrow. Download DOCX to adjust its indentation.');
    const before=pt(style.marginTop,block.heading?10:0),after=pt(style.marginBottom,block.heading?7:6),ratio=Math.max(1.15,Number(style.lineHeight)||1.3);
    const fragments=[];let items=[],used=0,first=true,forced=false;
    function flush(force=false){if(!items.length&&!force)return;const textItems=items.filter(i=>!i.image),textHeight=Math.max(...(textItems.length?textItems.map(i=>i.size*ratio):[base.size*ratio]));const height=Math.max(textHeight,...items.filter(i=>i.image).map(i=>i.height));const shift=['center'].includes(style.textAlign)?Math.max(0,(available-(first?indent:0)-used)/2):['right','end'].includes(style.textAlign)?Math.max(0,available-(first?indent:0)-used):0;fragments.push({height,requiredWidth:used+left+right+(first?indent:0),items:items.map(i=>({...i,x:i.x+left+(first?indent:0)+shift})),key:block.key,record:block.record,first,breakBefore:forced});items=[];used=0;first=false;forced=false;}
    const room=()=>available-(first?indent:0);
    function addText(text,format){
      text=text.replace(/\t/g,'    ').replace(/\r\n?/g,'\n');checkText(text.replace(/\n/g,''),format.font);
      for(const token of text.match(/\n|[^\S\n]+|[^\s]+/gu)||[]){
        if(token==='\n'){flush(true);continue;}
        const space=/^\s+$/u.test(token),tokenWidth=format.font.widthOfTextAtSize(token,format.size);
        if(used+tokenWidth>room()&&items.length){if(noWrap)fail('Text no longer fits its Word text box. Download DOCX to adjust the box.');flush();if(space)continue;}
        if(tokenWidth<=room()){items.push({...format,text:token,x:used,width:tokenWidth});used+=tokenWidth;continue;}
        if(noWrap)fail('Text no longer fits its Word text box. Download DOCX to adjust the box.');
        // Long unbroken identifiers must wrap too, never get clipped at a cell edge.
        let chunk='';for(const c of format.font.graphemes(token)){const next=chunk+c,w=format.font.widthOfTextAtSize(next,format.size);if(w>room()&&chunk){const cw=format.font.widthOfTextAtSize(chunk,format.size);items.push({...format,text:chunk,x:0,width:cw});used=cw;flush();chunk=c;}else chunk=next;if(format.font.widthOfTextAtSize(c,format.size)>room())fail('A character is wider than its table cell. Download DOCX to widen the column.');}
        if(chunk){const cw=format.font.widthOfTextAtSize(chunk,format.size);items.push({...format,text:chunk,x:used,width:cw});used+=cw;}
      }
    }
    for(const run of graphemeRuns(block.runs||[{text:block.text,style:{}}])){
      if(run.pageBreak&&run.text==='\n'){flush();forced=true;continue;}
      if(run.image){const image=await imageFor(run.image),w=run.image.width*.75,h=run.image.height*.75,scale=Math.min(1,available/w,(bodyHeight-20)/h);if(!(w>0&&h>0&&scale>0))fail('An image has invalid dimensions.');if(used+w*scale>room())flush();items.push({image,width:w*scale,height:h*scale,x:used});used+=w*scale;}
      else {const format=typography({...style,...run.style},block.heading);let text=run.text;if(run.field){if(!fields)fail('A page-number field is outside its header or footer.');text=fields.measure?Array.from('0123456789').sort((a,b)=>format.font.widthOfTextAtSize(b,format.size)-format.font.widthOfTextAtSize(a,format.size))[0].repeat(7):String(fields[run.field]);}addText(text,format);}
      await cooperate();
    }
    const rules=block.horizontalRules||[];
    if(rules.length&&block.list)fail('A numbered horizontal rule cannot be exported. Download DOCX to preserve it.');
    flush((!fragments.length&&!rules.length)||forced);
    for(const rule of rules){
      const w=rule.width===null?available:rule.width,h=rule.height;
      if(!Number.isFinite(w)||w<=0||w>available+.01||!Number.isFinite(h)||h<=0||!/^#[a-f\d]{6}$/i.test(rule.color||'')||!['left','center','right'].includes(rule.align))fail('A horizontal rule does not fit its paragraph. Download DOCX to preserve it.');
      const shift=rule.align==='center'?(available-w)/2:rule.align==='right'?available-w:0;
      fragments.push({height:h,items:[],rule:{x:left+shift,width:w,height:h,color:rule.color},key:block.key,record:block.record});
    }
    if(block.list&&fragments.length){const fmt=typography({...style,...block.list.markerStyle}),label=block.list.label;fmt.font=await markerFont(label,fmt.font);checkText(label,fmt.font);const w=fmt.font.widthOfTextAtSize(label,fmt.size);fragments[0].items.unshift({...fmt,text:label,x:Math.max(0,left-w-5),width:w});}
    if(fragments.length){fragments[0].before=before;fragments[0].breakBefore ||= block.pageBreakBefore;fragments.at(-1).after=after;}
    return fragments;
  }
  // Reserve space for the largest active header/footer before paginating the
  // body. Page counts are resolved after pagination, never copied from Word's
  // stale cached field results. The body may reflow, but no text is discarded.
  const peripheral=model.peripherals||{},distances={header:(model.page.headerDistance??48)*.75,footer:(model.page.footerDistance??48)*.75};
  const activeTypes=['default',...(peripheral.firstPage?['first']:[]),...(peripheral.evenPages?['even']:[])];
  async function peripheralLines(blocks,fields){const lines=[];for(const block of blocks||[])lines.push(...await paragraph(block,usable,fields));if(lines.some(line=>line.breakBefore))fail('A page break inside a header or footer cannot be exported. Download DOCX to preserve it.');let height=0;for(const line of lines){height+=line.before||0;line.top=height;height+=line.height+(line.after||0);}return {lines,height};}
  const textboxLayouts={header:{},footer:{}};
  async function textboxLines(box,fields){
    const {x,y,height,insets,verticalAlign='top'}=box;let width=box.width;
    if(![x,y,width,height,...Object.values(insets||{})].every(Number.isFinite)||x<0||y<0||width<=0||height<=0||x+width>pageWidth+.01||y+height>pageHeight+.01||!insets||!['left','right','top','bottom'].every(edge=>Number.isFinite(insets[edge])&&insets[edge]>=0)||!['top','center','bottom'].includes(verticalAlign))fail('A Word text box has unsupported bounds. Download DOCX to preserve it.');
    let innerWidth=width-insets.left-insets.right;const innerHeight=height-insets.top-insets.bottom;
    if(innerWidth<8||innerHeight<=0)fail('A Word text box has too little space for its text. Download DOCX to preserve it.');
    async function linesFor(available){const lines=[];for(const block of box.blocks||[])lines.push(...await paragraph(block,available,fields,{noWrap:box.wrap==='none'}));return lines;}
    if(box.autoFit==='shape'&&box.wrap==='none'){
      // Word's explicit shape-autofit may enlarge a no-wrap box. Measure within
      // the page first; the source size is a minimum, never a clipping window.
      const measured=await linesFor(pageWidth-x-insets.left-insets.right);
      const required=Math.max(innerWidth,...measured.map(line=>line.requiredWidth||0));
      if(required>innerWidth){const sourceWidth=width;width=required+insets.left+insets.right;innerWidth=required;box={...box,width,sourceWidth};}
    }
    const lines=await linesFor(innerWidth);let used=0;
    if(lines.some(line=>line.breakBefore))fail('A page break inside a Word text box cannot be exported. Download DOCX to preserve it.');
    for(const line of lines){used+=line.before||0;line.top=used;used+=line.height+(line.after||0);}
    if(used>innerHeight+.01)fail('Text no longer fits its Word text box. Download DOCX to adjust the box.');
    const shift=verticalAlign==='center'?(innerHeight-used)/2:verticalAlign==='bottom'?innerHeight-used:0;
    return {box,lines,x:x+insets.left,y:y+insets.top+shift,width:innerWidth};
  }
  for(const kind of ['header','footer']){
    for(const type of activeTypes){
      textboxLayouts[kind][type]=[];
      for(const box of model.peripheralTextboxes?.[kind]?.[type]||[]){
        // Measure before body pagination so an anchored header cannot cover body text.
        const measured=await textboxLines(box,{measure:true});textboxLayouts[kind][type].push(measured);
        const edge=kind==='header'?'top':'bottom',needed=kind==='header'?measured.box.y+measured.box.height:pageHeight-measured.box.y;
        margins[edge]=Math.max(margins[edge],needed+6);
      }
    }
    let height=0;for(const type of activeTypes)height=Math.max(height,(await peripheralLines(peripheral[kind]?.[type],{measure:true})).height);
    if(height){const edge=kind==='header'?'top':'bottom';margins[edge]=Math.max(margins[edge],distances[kind]+height+6);}
  }
  bodyHeight=pageHeight-margins.top-margins.bottom;
  if(!Number.isFinite(bodyHeight)||bodyHeight<=24)fail('The headers and footers leave too little room for the PDF body. Download DOCX to adjust the page margins.');
  let page,y;
  function newPage(){abort(signal);if(pdf.getPageCount()>=500)fail('The PDF would exceed 500 pages. Shorten the document.');page=pdf.addPage([pageWidth,pageHeight]);y=margins.top;}
  newPage();
  function drawFragment(fragment,x,top,{pageNumber=pdf.getPageCount(),region='body',width=usable}={}){
    if(fragment.rule){const rule=fragment.rule;page.drawRectangle({x:x+rule.x,y:pageHeight-top-rule.height,width:rule.width,height:rule.height,color:color(rule.color)});layout.push({page:pageNumber,region,type:'horizontal-rule',key:fragment.key,record:fragment.record,x:x+rule.x,y:top,width:rule.width,height:rule.height,color:rule.color});return;}
    for(const item of fragment.items){
      if(item.image){page.drawImage(item.image,{x:x+item.x,y:pageHeight-top-fragment.height,width:item.width,height:item.height});continue;}
      const baseline=pageHeight-top-fragment.height+item.size*.24;
      item.font.drawText(page,item.text,{x:x+item.x,y:baseline,size:item.size,color:item.color,...(item.italic?{xSkew:{type:'degrees',angle:12}}:{})});
      for(const [kind,offset]of [['underline',-.1],['line-through',.3]])if(item.decoration.includes(kind))page.drawLine({start:{x:x+item.x,y:baseline+item.size*offset},end:{x:x+item.x+item.width,y:baseline+item.size*offset},thickness:Math.max(.4,item.size*.05),color:item.color});
    }
    layout.push({page:pageNumber,region,key:fragment.key,record:fragment.record,x,y:top,width,height:fragment.height});
  }
  async function flowParagraph(block){const lines=await paragraph(block,usable);for(const line of lines){if(line.breakBefore&&y>margins.top)newPage();const before=line.before||0;if(y+before+line.height>pageHeight-margins.bottom)newPage();if(line.height>bodyHeight)fail('A text line is taller than the PDF page.');y+=before;drawFragment(line,margins.left,y);y+=line.height+(line.after||0);}}
  const blocks=new Map(model.blocks.map(b=>[b.record,b]));
  async function table(table){
    const specified=table.style?.width,gridTotal=table.widths.reduce((n,w)=>n+w,0);let width=typeof specified==='string'&&specified.endsWith('%')?usable*parseFloat(specified)/100:pt(specified,gridTotal?gridTotal/20:usable);width=Math.min(usable,Math.max(24,width));
    const widths=table.widths.map(w=>gridTotal?w/gridTotal*width:width/table.widths.length),offsets=[0];for(const w of widths)offsets.push(offsets.at(-1)+w);
    const tableX=margins.left+(table.style?.marginLeft==='auto'?(usable-width)/(table.style?.marginRight==='auto'?2:1):0),heights=table.rows.map(()=>0),cells=[];
    for(let row=0;row<table.rows.length;row++)for(const cell of table.rows[row].cells){
      const style=cell.style||{},col=cell.column-1,w=offsets[col+cell.colSpan]-offsets[col],padding={top:pt(style.paddingTop,4),bottom:pt(style.paddingBottom,4),left:pt(style.paddingLeft,5),right:pt(style.paddingRight,5)},lines=[];
      for(const p of cell.content)lines.push(...await paragraph(blocks.get(p.record),w-padding.left-padding.right));
      if(lines.some(l=>l.breakBefore))fail('A page break inside a table cell cannot be exported yet. Download DOCX to preserve it.');
      let top=padding.top;for(const line of lines){top+=line.before||0;line.top=top;top+=line.height+(line.after||0);}const needed=top+padding.bottom;
      if(cell.rowSpan===1)heights[row]=Math.max(heights[row],needed);
      cells.push({row,span:cell.rowSpan,col,width:w,style,padding,lines,needed});
    }
    for(let i=0;i<heights.length;i++)heights[i]=Math.max(heights[i],12);
    for(const cell of cells){const total=heights.slice(cell.row,cell.row+cell.span).reduce((a,b)=>a+b,0);if(total<cell.needed)heights[cell.row+cell.span-1]+=cell.needed-total;}
    const tops=[0];for(const height of heights)tops.push(tops.at(-1)+height);
    for(const cell of cells){cell.top=tops[cell.row];cell.height=tops[cell.row+cell.span]-cell.top;const spare=cell.height-cell.needed,shift=cell.style.verticalAlign==='middle'?spare/2:cell.style.verticalAlign==='bottom'?spare:0;for(const line of cell.lines)line.top+=cell.top+shift;}
    // Row groups connected by vertical merges stay together when they fit a page.
    const groups=[];for(let start=0;start<heights.length;){let end=start+1;for(let r=start;r<end;r++)for(const cell of cells.filter(c=>c.row===r))end=Math.max(end,r+cell.span);groups.push({top:tops[start],bottom:tops[end]});start=end;}
    function border(value,x1,y1,x2,y2){if(!value||/\bnone\b/.test(value))return;const parts=value.split(' '),thickness=pt(parts[0],.5);page.drawLine({start:{x:x1,y:pageHeight-y1},end:{x:x2,y:pageHeight-y2},thickness,color:color(parts.at(-1),'#333333'),...(/dotted|dashed/.test(value)?{dashArray:[thickness*(value.includes('dotted')?1:3),thickness*2]}:{})});if(value.includes('double'))page.drawLine({start:{x:x1,y:pageHeight-y1-2},end:{x:x2,y:pageHeight-y2-2},thickness:thickness/2,color:color(parts.at(-1),'#333333')});}
    for(const group of groups){const height=group.bottom-group.top;if(height<=bodyHeight&&y+height>pageHeight-margins.bottom)newPage();let start=group.top;
      while(start<group.bottom-.01){abort(signal);let end=Math.min(group.bottom,start+pageHeight-margins.bottom-y);
        const relevant=cells.filter(c=>c.top<group.bottom&&c.top+c.height>group.top),lines=relevant.flatMap(c=>c.lines);
        // Move the cut to a gap shared by all cells, never through a text line or image.
        for(;;){const crossing=lines.filter(l=>l.top<end-.01&&l.top+l.height>end+.01&&l.top+l.height>start+.01);if(!crossing.length)break;end=Math.min(...crossing.map(l=>l.top));}
        if(end<=start+.01){if(y>margins.top){newPage();continue;}fail('A table image or line is taller than the page. Download DOCX to adjust it.');}
        for(const cell of relevant){const from=Math.max(start,cell.top),to=Math.min(end,cell.top+cell.height);if(to<=from)continue;const x=tableX+offsets[cell.col],top=y+from-start,h=to-from,s=cell.style;
          if(s.backgroundColor)page.drawRectangle({x,y:pageHeight-top-h,width:cell.width,height:h,color:color(s.backgroundColor)});
          border(s.borderLeft,x,top,x,top+h);border(s.borderRight,x+cell.width,top,x+cell.width,top+h);border(s.borderTop,x,top,x+cell.width,top);border(s.borderBottom,x,top+h,x+cell.width,top+h);
          for(const line of cell.lines)if(line.top>=start-.01&&line.top+line.height<=end+.01)drawFragment(line,x+cell.padding.left,y+line.top-start,{width:cell.width-cell.padding.left-cell.padding.right});
        }
        y+=end-start;start=end;if(start<group.bottom-.01)newPage();await cooperate();
      }
    }
    y+=8;
  }
  if(model.hasTables){for(const item of model.content){if(item.type==='table')await table(item);else await flowParagraph(blocks.get(item.record));await cooperate();}}
  else for(const block of model.blocks){await flowParagraph(block);await cooperate();}
  const pages=pdf.getPages(),pageStart=peripheral.pageStart||1;
  for(let index=0;index<pages.length;index++){
    page=pages[index];const number=index+pageStart,fields={PAGE:number,NUMPAGES:pages.length,SECTIONPAGES:pages.length};
    const type=index===0&&peripheral.firstPage?'first':peripheral.evenPages&&number%2===0?'even':'default';
    for(const kind of ['header','footer']){
      const result=await peripheralLines(peripheral[kind]?.[type],fields),top=kind==='header'?distances.header:pageHeight-distances.footer-result.height;
      for(const line of result.lines)drawFragment(line,margins.left,top+line.top,{pageNumber:index+1,region:kind});
      for(const {box} of textboxLayouts[kind][type]||[]){
        const placed=await textboxLines(box,fields);
        layout.push({page:index+1,region:kind,type:'textbox',variant:type,x:box.x,y:box.y,width:placed.box.width,height:placed.box.height,...(placed.box.sourceWidth?{sourceWidth:placed.box.sourceWidth}:{})});
        for(const line of placed.lines)drawFragment(line,placed.x,placed.y+line.top,{pageNumber:index+1,region:kind,width:placed.width});
      }
    }
    await cooperate();
  }
  abort(signal);emoji.finalize?.();pdf.setCreator('Compare Two Texts');const bytes=await pdf.save();abort(signal);if(bytes.length>32*1024*1024)fail('The PDF is too large. Reduce image sizes in the Word document.');onLayout?.(layout);return bytes;
}
