import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PDFDocument,fontkit,rgb} from '../dist/pdf-vendor.mjs';
import {createEmojiPdfFont} from '../dist/pdf-emoji-font.mjs';
import bytes from '../dist/sheet-emoji-font.mjs';
import {getDocument} from '../dist/pdf-reader-vendor.mjs';
import {readDocxVisual} from '../dist/docx-visual.mjs';
import {renderDocxPdf} from '../dist/docx-pdf.mjs';
import {docx,W} from './fixtures/text-fixture.mjs';
const options={useWasm:false,useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,stopAtErrors:true,isEvalSupported:false,verbosity:0};
const source=xml=>({name:'emoji.docx',data:Buffer.from(docx([],{xml:`<w:document xmlns:w="${W}"><w:body>${xml}</w:body></w:document>`})).toString('base64')});
async function textOf(data){const task=getDocument({data:data.slice(),...options});try{const pdf=await task.promise,parts=[];for(let i=1;i<=pdf.numPages;i++)parts.push(...(await(await pdf.getPage(i)).getTextContent()).items.map(i=>i.str));return parts.join('');}finally{await task.destroy();}}

test('Word keeps emoji across style-run boundaries and long tokens wrap only between graphemes',async()=>{
 const src=source('<w:p><w:r><w:t>Start 👩</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>‍💻 👆</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>🏻 End</w:t></w:r></w:p>');
 const model=await readDocxVisual(src);
 // PDF readers infer spacing at style boundaries; compare Unicode content in order.
 assert.equal((await textOf(await renderDocxPdf(model))).replace(/\s/gu,''),'Start👩‍💻👆🏻End');
 const repeated='👩‍💻'.repeat(35),wrapped=await readDocxVisual(source(`<w:p><w:r><w:t>${repeated}</w:t></w:r></w:p>`));
 wrapped.page.width=220;wrapped.page.marginLeft=wrapped.page.marginRight=30;
 assert.equal((await textOf(await renderDocxPdf(wrapped))).replace(/\s/gu,''),repeated);
});

test('sequence CMaps preserve over 100 distinct entries and reject an unshaped cluster',async()=>{
 const raw=Buffer.from(bytes,'base64'),shaper=fontkit.create(raw),pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await createEmojiPdfFont(pdf,raw),page=pdf.addPage([600,800]);
 const emoji=shaper.characterSet.filter(cp=>cp>=0x1f300&&cp<=0x1f64f).slice(0,120).map(cp=>String.fromCodePoint(cp));
 assert.equal(emoji.length,120);
 for(let i=0;i<emoji.length;i++)font.drawText(page,emoji[i],{x:20+(i%12)*45,y:760-Math.floor(i/12)*60,size:24,color:rgb(0,0,0)});
 assert.throws(()=>font.widthOfTextAtSize('👩‍🚀‍💻',12),/emoji sequence cannot/);
 font.finalize();assert.equal((await textOf(await pdf.save())).replace(/\s/gu,''),emoji.join(''));
});

test('composed emoji render visible outlines through the same PDF reader used by preview',async t=>{
 const native=createRequire(import.meta.url)('@napi-rs/canvas');
 Object.assign(globalThis,{DOMMatrix:native.DOMMatrix,Path2D:native.Path2D,ImageData:native.ImageData});
 t.after(()=>{for(const k of ['DOMMatrix','Path2D','ImageData'])delete globalThis[k];});
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await createEmojiPdfFont(pdf,Buffer.from(bytes,'base64')),page=pdf.addPage([500,180]);
 for(const [i,text] of ['👩‍💻','👆🏻','👨‍👩‍👧‍👦','🇺🇸'].entries())font.drawText(page,text,{x:20+i*120,y:80,size:60,color:rgb(0,0,0)});
 font.finalize();const task=getDocument({data:await pdf.save(),...options});
 try{const doc=await task.promise,p=await doc.getPage(1),viewport=p.getViewport({scale:1}),canvas=native.createCanvas(500,180),ctx=canvas.getContext('2d');await p.render({canvasContext:ctx,viewport}).promise;
  for(let i=0;i<4;i++){const pixels=ctx.getImageData(20+i*120,25,90,95).data;let ink=0;for(let j=0;j<pixels.length;j+=4)if(pixels[j]+pixels[j+1]+pixels[j+2]<600)ink++;assert.ok(ink>100,`visible outline ${i}`);}
 }finally{await task.destroy();}
});

test('Word PDF preserves emoji colors, skin-tone distinctions and searchable Unicode',async t=>{
 const native=createRequire(import.meta.url)('@napi-rs/canvas');
 const previous=Object.fromEntries(['DOMMatrix','Path2D','ImageData'].map(key=>[key,globalThis[key]]));
 Object.assign(globalThis,{DOMMatrix:native.DOMMatrix,Path2D:native.Path2D,ImageData:native.ImageData});
 t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 const values=['🔴','🟡','🟢','👆🏻','👆🏿','©︎ 123'];
 const model=await readDocxVisual({name:'color-emoji.docx',data:Buffer.from(docx(values)).toString('base64')});
 for(const block of model.blocks)block.style={...block.style,fontSize:'32pt',color:'#000000'};
 let lines;const data=await renderDocxPdf(model,{onLayout:value=>{lines=value;}});
 // Search/copy must retain modifiers and sequences even when their visible glyph is an image.
 const extracted=await textOf(data);
 const emojiText=values.slice(0,5).join('');
 assert.equal(extracted.slice(0,emojiText.length),emojiText,'colored glyphs retain their exact Unicode sequences');
 // PDF readers infer spaces and discard VS15 in ordinary text presentation.
 assert.equal(extracted.slice(emojiText.length).replace(/[\s\uFE0E]/gu,''),'©123');
 const task=getDocument({data:data.slice(),...options});
 try{
  const pdf=await task.promise;assert.equal(pdf.numPages,1);
  const page=await pdf.getPage(1),scale=2,viewport=page.getViewport({scale});
  const canvas=native.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=canvas.getContext('2d');
  await page.render({canvasContext:ctx,viewport}).promise;
  const samples=lines.filter(line=>line.region==='body').map(line=>{
   const top=Math.floor(line.y*scale),height=Math.min(canvas.height-top,Math.ceil(line.height*scale));
   const pixels=ctx.getImageData(0,top,canvas.width,height).data;
   const result={red:0,yellow:0,green:0,chromatic:0,ink:0,luma:0};
   for(let i=0;i<pixels.length;i+=4){const [r,g,b]=pixels.subarray(i,i+3);if(Math.min(r,g,b)>235)continue;
    result.ink++;result.luma+=(r+g+b)/3;
    if(Math.max(r,g,b)-Math.min(r,g,b)>35)result.chromatic++;
    if(r>g+45&&r>b+45)result.red++;
    if(r>150&&g>100&&b<Math.min(r,g)-45)result.yellow++;
    if(g>r+25&&g>b+20)result.green++;
   }
   result.luma/=Math.max(1,result.ink);return result;
  });
  assert.equal(samples.length,values.length);
  for(const [index,color] of ['red','yellow','green'].entries())assert.ok(samples[index][color]>100,`${values[index]} has visible ${color} pixels, not a monochrome substitute`);
  assert.ok(samples[3].chromatic>100&&samples[4].chromatic>100,'both skin-tone variants are colored');
  assert.ok(samples[3].luma>samples[4].luma+20,'light and dark skin-tone variants remain visually distinct');
  assert.ok(samples[5].ink>100,'text-presentation symbol and ordinary digits are visible');
  assert.equal(samples[5].chromatic,0,'VS15 text presentation and ordinary digits remain monochrome text');
 }finally{await task.destroy();}
});
