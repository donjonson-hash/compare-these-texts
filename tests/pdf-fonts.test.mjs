import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {handleRequest} from '../dist/worker.mjs';
import {mountVisualReview} from '../dist/visual-review.mjs';
import editor from '../dist/text-editor.js';
import {PDFDocument, PDFName, fontkit, rgb, beginText, endText, setFontAndSize, setTextMatrix, showText} from '../dist/pdf-vendor.mjs';
import {readTextSource} from '../dist/text-source.mjs';
import {openPdfVisual, renderPdfRevision, measurePdfBlockFont} from '../dist/pdf-visual.mjs';
import {renderPreservedPdf} from '../dist/pdf-layout.mjs';
import boldFont from '../dist/word-font-bold.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),native=require('@napi-rs/canvas');
const source=data=>({name:'font-test.pdf',data:Buffer.from(data).toString('base64')});

function canvasEnvironment(t) {
 // PDF.js uses the PDF family names for unembedded standard fonts. Skia does
 // not follow fontconfig aliases consistently, so register the local metrics-
 // compatible families explicitly instead of using its unrelated default.
 const fontDirectory=process.env.CTT_STANDARD_FONT_DIR || '/usr/share/fonts/opentype/urw-base35';
 for(const [alias,family] of [['Times','NimbusRoman'],['Helvetica','NimbusSans'],['Courier','NimbusMonoPS']]) {
  for(const style of ['Regular','Bold','Italic','BoldItalic']) {
   assert.ok(native.GlobalFonts.registerFromPath(`${fontDirectory}/${family}-${style}.otf`,alias),
    `Install fonts-urw-base35 (or set CTT_STANDARD_FONT_DIR): ${alias} ${style}`);
  }
 }
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.DOMMatrix=native.DOMMatrix;globalThis.Path2D=native.Path2D;globalThis.ImageData=native.ImageData;
 globalThis.FontFace=class{constructor(name,bytes){this.name=name;this.bytes=bytes;}async load(){native.GlobalFonts.register(Buffer.from(this.bytes),this.name);return this;}};document.fonts={add(){}};
 const canvases=new WeakMap();function canvas(el){let c=canvases.get(el);if(!c||c.width!==el.width||c.height!==el.height){c=native.createCanvas(el.width,el.height);canvases.set(el,c);}return c;}
 window.HTMLCanvasElement.prototype.getContext=function(type){const ctx=canvas(this).getContext(type);if(!ctx._wrapped){const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(image,...args)=>draw(image instanceof window.HTMLCanvasElement?canvas(image):image,...args);ctx._wrapped=true;}return ctx;};window.HTMLCanvasElement.prototype.toBlob=function(callback,mime){canvas(this).toBlob(callback,mime);};
 t.after(()=>{dom.window.close();for(const key of ['window','document','DOMMatrix','Path2D','ImageData','FontFace'])delete globalThis[key];});
}

async function fixture(names) {
 const doc=await PDFDocument.create(),page=doc.addPage([500,700]);
 for(let i=0;i<names.length;i++)page.drawText(`  Original label ${i}.  `,{x:40,y:640-i*35,size:14,font:await doc.embedFont(names[i])});
 return source(await doc.save());
}

test('original standard font, weight and baseline survive inline, block and reflow exports',async t=>{
 canvasEnvironment(t);
 const names=['Times-Roman','Times-Bold','Times-Italic','Times-BoldItalic','Helvetica','Helvetica-Bold','Helvetica-Oblique','Helvetica-BoldOblique','Courier','Courier-Bold','Courier-Oblique','Courier-BoldOblique'];
 const input=await fixture(names),parsed=await readTextSource(input),blocks=parsed.blocks.map((b,i)=>({...b,key:`line-${i}`}));
 assert.equal(blocks.length,names.length);
 const viewer=await openPdfVisual(input);
 try {
  for(let i=0;i<names.length;i++) {
   const selected=await viewer.editFont(blocks[i],`Revised label ${i}`);
   assert.equal(selected.name,names[i]);
   const measured=await measurePdfBlockFont(input,blocks[i],`Revised label ${i}`);
   assert.equal(measured.widthOfTextAtSize('Revised label',14),selected.font.widthOfTextAtSize('Revised label',14));
  }
  const legacy=structuredClone(blocks[0]);delete legacy.visual.fontItems;
  assert.equal((await viewer.editFont(legacy,'Revised label')).name,'Times-Roman','Saved sessions re-read font identity from the source');
  await assert.rejects(()=>viewer.editFont(blocks[0],'Новая строка'),/does not contain every character/);
  const canvas=document.createElement('canvas'),seen=[];
  // Set dimensions before grabbing the context; renderPage keeps them unchanged.
  canvas.width=500;canvas.height=700;
  const same=canvas.getContext('2d'),paint=same.fillText.bind(same);same.fillText=(text,...args)=>{if(text==='Revised label 1')seen.push(same.font);return paint(text,...args);};
  await viewer.renderPage(1,canvas,{edits:[{block:blocks[1],text:'Revised label 1'}],blocks});
  assert.ok(seen.some(font=>/bold/.test(font)&&/Times/.test(font)),seen.join(','));
 } finally {await viewer.dispose();}
 const probe=await openPdfVisual(input);
 try{for(let i=0;i<blocks.length;i++){try{await probe.renderPage(1,document.createElement('canvas'),{scale:2,edits:[{block:blocks[i],text:`Revised label ${i}`}],blocks});}catch(error){throw Error(names[i]+': '+error.message);}}}finally{await probe.dispose();}
 const edits=blocks.map((block,i)=>({block,text:`Revised label ${i}`}));
 const revised=await renderPdfRevision(input,edits,{blocks}),read=await readTextSource(source(revised)),reopened=await openPdfVisual(source(revised));
 try {for(let i=0;i<names.length;i++){assert.equal((await reopened.editFont(read.blocks[i],`Another label ${i}`)).name,names[i]);assert.ok(Math.abs(read.blocks[i].visual.rects[0].baselineY-blocks[i].visual.rects[0].baselineY)<.02,'Baseline unchanged');}}finally{await reopened.dispose();}
 assert.doesNotMatch(read.blocks.map(b=>b.text).join(' '),/Original/);
 const blockOutput=await renderPdfRevision(input,[{block:blocks[1],text:'Bold line\nSecond line',box:{width:200,height:32,fontSize:12}}],{blocks});
 const blockRead=await readTextSource(source(blockOutput)),blockView=await openPdfVisual(source(blockOutput));
 try {assert.equal((await blockView.editFont(blockRead.blocks.find(b=>b.text.trim()==='Original label 0.'),'Another label')).name,'Times-Roman','Untouched text retains its font when the exported PDF is edited again');for(const b of blockRead.blocks.filter(b=>/Bold line|Second line/.test(b.text)))assert.equal((await blockView.editFont(b,'More text')).name,'Times-Bold');}finally{await blockView.dispose();}
 const entries=blocks.map((block,i)=>({key:block.key,record:block.record,text:i===1?'Bold heading expands across several lines with its original typeface and weight':block.text}));
 const flowed=await renderPreservedPdf(input,entries,{blocks}),flowRead=await readTextSource(source(flowed)),flowView=await openPdfVisual(source(flowed));
 try {const heading=flowRead.blocks.find(b=>b.text.startsWith('Bold heading'));assert.ok(heading);assert.equal((await flowView.editFont(heading,'More text')).name,'Times-Bold');}finally{await flowView.dispose();}
 if(process.env.CTT_FONT_TEST_ARTIFACTS){writeFileSync(process.env.CTT_FONT_TEST_ARTIFACTS+'/original.pdf',Buffer.from(input.data,'base64'));writeFileSync(process.env.CTT_FONT_TEST_ARTIFACTS+'/revised.pdf',revised);writeFileSync(process.env.CTT_FONT_TEST_ARTIFACTS+'/flowed.pdf',flowed);}
});

test('mixed and unsupported custom fonts never silently become another font',async t=>{
 canvasEnvironment(t);
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const page=doc.addPage([400,500]),regular=await doc.embedFont('Times-Roman'),bold=await doc.embedFont('Times-Bold');
 page.drawText('Regular ',{x:40,y:450,size:14,font:regular});page.drawText('bold',{x:40+regular.widthOfTextAtSize('Regular ',14),y:450,size:14,font:bold});
 const custom=await doc.embedFont(Buffer.from(boldFont,'base64'),{subset:true});page.drawText('Custom heading',{x:40,y:400,size:14,font:custom});
 // A narrow source run can fit at the right edge even if its substitute is wider.
 const edge='Reference number', scale=0.45, size=14;
 const key=page.node.newFontDictionary('NarrowSource',custom.ref);
 page.pushOperators(beginText(),setFontAndSize(key,size),
   setTextMatrix(scale,0,0,1,399-custom.widthOfTextAtSize(edge,size)*scale,350),showText(custom.encodeText(edge)),endText());
 const input=source(await doc.save()),{blocks}=await readTextSource(input),viewer=await openPdfVisual(input);
 try {assert.equal(blocks.length,3);await assert.rejects(()=>viewer.editFont(blocks[0],'New wording'),/different fonts/);await assert.rejects(()=>viewer.editFont(blocks[1],'New heading'),/not supported for editing/);}finally{await viewer.dispose();}
 // Keep custom fonts strict by default. Only the explicit download may substitute one.
 const edit={block:blocks[1],text:'Новый текст'};
 await assert.rejects(renderPdfRevision(input,[edit],{blocks}),{code:'PDF_FONT_UNAVAILABLE'});
 const output=await renderPdfRevision(input,[edit],{blocks,allowReplacementFont:true});
 const restored=await readTextSource(source(output));
 assert.equal(restored.meta.page_count,1);
 assert.deepEqual(restored.blocks.map(b=>b.text),[blocks[0].text,edit.text,edge]);
 const pageAfter=(await PDFDocument.load(output)).getPages()[0];
 assert.deepEqual(pageAfter.getSize(),page.getSize());
 assert.ok(pageAfter.node.Resources().lookup(PDFName.of('XObject')).keys().length,'The original page artwork is embedded');
 const grouped=await fixture(['Times-Roman','Times-Bold']),groupedRead=await readTextSource(grouped),groupedBlocks=groupedRead.blocks.map(b=>({...b,key:'group'}));
 await assert.rejects(()=>renderPreservedPdf(grouped,[{key:'group',record:1,text:'A combined replacement'}],{blocks:groupedBlocks}),/combines different fonts/);
});

test('copying text between custom-font PDFs keeps the target artwork in Document view and in the download', async t => {
  canvasEnvironment(t);
  window.KristinaTextEditor = editor;
  window.Element.prototype.scrollIntoView = () => {};
  const root = document.querySelector('main');
  const downloads = [];
  t.mock.method(URL, 'createObjectURL', blob => { downloads.push(blob); return 'blob:edited-pdf'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(window.HTMLAnchorElement.prototype, 'click', () => {});

  async function makePdf(text, color) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(Buffer.from(boldFont, 'base64'), {subset: true});
    const page = pdf.addPage([400, 500]);
    page.drawRectangle({x: 20, y: 450, width: 40, height: 30, color});
    page.drawText(text, {x: 45, y: 360, size: 16, font});
    return source(await pdf.save());
  }
  async function waitFor(condition, message) {
    for (let i = 0; i < 250; i++) {
      if (condition()) return;
      await delay(20);
    }
    assert.fail(message);
  }
  const labels = {left: 'Contract fee 1200', right: 'Contract fee 1400'};
  const sources = {
    left: await makePdf(labels.left, rgb(1, 0, 0)),
    right: await makePdf(labels.right, rgb(0, 0, 1)),
  };
  const {report} = await handleRequest('/api/compare', sources);
  assert.equal(report.changed.length, 1);
  for (const [target, donor, letter, color] of [
    ['left', 'right', 'A', [255, 0, 0]],
    ['right', 'left', 'B', [0, 0, 255]],
  ]) {
    const view = await mountVisualReview(root, {sources, report});
    try {
      await view.select(report.changed[0].key);
      const column = root.querySelector(`[data-save-side="${target}"]`).closest('.visual-column');
      const save = column.querySelector(`[data-save-side="${target}"]`);
      root.querySelector(`[data-copy-to="${target}"]`).click();
      await waitFor(() => column.querySelector('.visual-scroll').getAttribute('aria-busy') === 'false',
        `Copy to ${letter} did not finish drawing the target`);
      assert.equal(column.querySelector('[data-pdf-view]').getAttribute('aria-pressed'), 'true');
      assert.ok(column.querySelector('.visual-pdf-page[data-pdf-layout="updated"] canvas'));
      assert.equal(column.querySelector('.pdf-recovery').hidden, true);
      assert.match(column.querySelector('.pdf-export-state').textContent, /font/i);
      assert.equal(save.disabled, false);
      assert.equal(save.textContent, 'Download PDF with replacement font');

      save.click();
      await waitFor(() => downloads.length === 1, `No edited PDF downloaded for ${letter}`);
      const bytes = new Uint8Array(await downloads.pop().arrayBuffer());
      const reopened = await readTextSource(source(bytes));
      assert.equal(reopened.meta.page_count, 1);
      assert.deepEqual(reopened.blocks.map(block => block.text), [labels[donor]]);
      const exported = await openPdfVisual(source(bytes));
      try {
        const canvas = document.createElement('canvas');
        await exported.renderPage(1, canvas);
        assert.deepEqual([canvas.width, canvas.height], [400, 500]);
        const pixel = canvas.getContext('2d').getImageData(35, 35, 1, 1).data;
        assert.deepEqual(Array.from(pixel).slice(0, 3), color, 'Target page artwork survives the transfer');
      } finally {
        await exported.dispose();
      }
      column.querySelector(`[aria-label="Undo edit in ${letter}"]`).click();
      await waitFor(() => column.querySelector('.visual-pdf-page[data-pdf-layout="original"] canvas')
        && !save.disabled && save.textContent === 'Download PDF', `Undo did not restore PDF ${letter}`);
    } finally {
      view.dispose();
    }
  }
});
