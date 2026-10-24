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
