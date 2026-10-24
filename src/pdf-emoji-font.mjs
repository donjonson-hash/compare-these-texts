import {PDFName,PDFHexString,fontkit,pushGraphicsState,popGraphicsState,beginText,endText,setFontAndSize,setTextMatrix,setFillingRgbColor,setTextRenderingMode,showText} from './pdf-vendor.mjs';

/** Embed an unchanged TrueType font with sequence-specific CIDs.
 * PDF 1.7 §5.6.4/5.9: CIDToGIDMap selects the outline; ToUnicode preserves
 * the complete UTF-16BE sequence, including ZWJ, variation and skin modifiers.
 * Two sequences may share an outline without sharing their extracted text.
 */
export async function createEmojiPdfFont(pdf,bytes,{colorImages=new Map()}={}){
 const shaped=fontkit.create(bytes),chars=new Set(shaped.characterSet);
 const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'}),entries=new Map();
 const base=await pdf.embedFont(bytes,{subset:false});await base.embed();
 const ctx=pdf.context,baseDict=ctx.lookup(base.ref);
 const descendant=ctx.lookup(baseDict.get(PDFName.of('DescendantFonts')).get(0)).clone(ctx);
 const cidMapRef=ctx.nextRef(),unicodeRef=ctx.nextRef(),descendantRef=ctx.register(descendant);
 const dict=baseDict.clone(ctx);dict.set(PDFName.of('DescendantFonts'),ctx.obj([descendantRef]));dict.set(PDFName.of('ToUnicode'),unicodeRef);
 descendant.set(PDFName.of('CIDToGIDMap'),cidMapRef);
 const ref=ctx.register(dict),pageKeys=new WeakMap();let finalized=false;
 const error=()=>{throw Error('This emoji sequence cannot be displayed in PDF. Download the original document to preserve it.');};
 const hex=n=>n.toString(16).toUpperCase().padStart(4,'0');
 const utf16=text=>Array.from({length:text.length},(_,i)=>hex(text.charCodeAt(i))).join('');
 function entry(text){
  if(entries.has(text))return entries.get(text);
  if(finalized)throw Error('The PDF emoji font has already been finalized.');
  if(entries.size>=65534||text.length>128)error();
  if(Array.from(text).some(c=>!/[\p{Default_Ignorable_Code_Point}]/u.test(c)&&!chars.has(c.codePointAt(0))))error();
  const run=shaped.layout(text),glyph=run.glyphs[0],position=run.positions[0];
  // Supported sequences must shape to one real glyph; never emit missing-glyph
  // boxes or a visually disconnected approximation of an unsupported cluster.
  if(run.glyphs.length!==1||!glyph?.id||!position||position.xOffset||position.yOffset||position.yAdvance)error();
  const width=position.xAdvance*1000/shaped.unitsPerEm;
  if(!Number.isFinite(width)||width<0||glyph.id>65535)error();
  const value={cid:entries.size+1,gid:glyph.id,text,width};entries.set(text,value);return value;
 }
 function tokens(text){return Array.from(segmenter.segment(text),s=>entry(s.segment));}
 return {
  getCharacterSet:()=>shaped.characterSet,
  widthOfTextAtSize:(text,size)=>tokens(text).reduce((n,e)=>n+e.width*size/1000,0),
  drawText(page,text,{x,y,size,color,xSkew}){
   const values=tokens(text);if(!values.length)return;
   let key=pageKeys.get(page);if(!key){key=page.node.newFontDictionary('CTTEmoji',ref);pageKeys.set(page,key);}
   const skew=xSkew?Math.tan(xSkew.angle*(xSkew.type==='degrees'?Math.PI/180:1)):0;
   if(![x,y,size,skew].every(Number.isFinite)||size<=0)throw Error('Invalid PDF emoji position.');
   for(const value of values){
    const picture=colorImages.get(value.text),advance=value.width*size/1000;
    // Invisible searchable text carries the exact Unicode sequence. Color artwork
    // is a bundled image at the same position, independent of the OS emoji font.
    page.pushOperators(pushGraphicsState(),beginText(),setTextRenderingMode(picture?3:0),setFillingRgbColor(color.red,color.green,color.blue),setFontAndSize(key,size),setTextMatrix(1,0,skew,1,x,y),showText(PDFHexString.of(hex(value.cid))),endText(),popGraphicsState());
    if(picture)page.drawImage(picture.image,{x:x+picture.left*advance,y:y+picture.bottom*advance,width:picture.width*advance,height:picture.height*advance});
    x+=advance;
   }
  },
  finalize(){
   if(finalized)return;finalized=true;
   const values=[...entries.values()],map=new Uint8Array((values.length+1)*2);
   for(const e of values){map[e.cid*2]=e.gid>>>8;map[e.cid*2+1]=e.gid&255;}
   ctx.assign(cidMapRef,ctx.flateStream(map));
   descendant.set(PDFName.of('W'),ctx.obj(values.length?[1,values.map(e=>e.width)]:[]));
   const lines=['/CIDInit /ProcSet findresource begin','12 dict begin','begincmap','/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def','/CMapName /CTTEmojiUnicode def','/CMapType 2 def','1 begincodespacerange','<0000> <FFFF>','endcodespacerange'];
   for(let i=0;i<values.length;i+=100){const batch=values.slice(i,i+100);lines.push(`${batch.length} beginbfchar`,...batch.map(e=>`<${hex(e.cid)}> <${utf16(e.text)}>`),'endbfchar');}
   lines.push('endcmap','CMapName currentdict /CMap defineresource pop','end','end');
   ctx.assign(unicodeRef,ctx.flateStream(lines.join('\n')));
  }
 };
}
