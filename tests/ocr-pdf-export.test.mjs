import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas, DOMMatrix, ImageData, Path2D, loadImage} from '@napi-rs/canvas';
import {PDFDocument, rgb} from '../src/pdf-vendor.mjs';
import {exportCheckedOcrPdf} from '../src/ocr-pdf-export.mjs';
import {openPdf} from '../src/ocr-pdf-input.mjs';
import {layoutCorrections, createCorrectionOverlay} from '../src/ocr-corrections.mjs';
import {JSDOM} from 'jsdom';

function browserCanvas(t) {
  const globals = {DOMMatrix, ImageData, Path2D, document: {createElement() {
    const canvas = createCanvas(1, 1); canvas.toBlob = done => done(new Blob([canvas.toBuffer('image/png')])); return canvas;
  }}, createImageBitmap: async file => {
    const image = await loadImage(Buffer.from(await file.arrayBuffer())); image.close = () => {}; return image;
  }};
  const old = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  t.after(() => { for (const [key, descriptor] of old) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
}
const region = (text, overrides = {}) => ({id: 'line-1', text, x: .1, y: .2, width: .55, height: .1, ...overrides});
const checked = regions => ({text: regions.map(r => r.text).join('\n'), confirmed: true, regions});
const snapshot = pages => ({version: 1, kind: 'ocr', currentPage: 0, pages});
const pixelData = async blob => {
  const image = await loadImage(Buffer.from(await blob.arrayBuffer())), canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data;
};

test('PDF export preserves upright and rotated page images while replacing stale OCR with corrected Cyrillic and English', async t => {
  browserCanvas(t);
  const original = await PDFDocument.create(), font = await original.embedFont('Helvetica');
  for (const rotation of [0, 90]) {
    const page = original.addPage([216, 144]); page.setRotation({type: 'degrees', angle: rotation});
    page.drawRectangle({x: 0, y: 0, width: 216, height: 144, color: rgb(1, .9, .8)});
    page.drawRectangle({x: 108, y: 0, width: 108, height: 144, color: rgb(.8, .9, 1)});
    page.drawText('BAD OLD OCR', {x: 20, y: 90, font, opacity: 0});
  }
  const file = new File([await original.save()], 'form.pdf', {type: 'application/pdf'}), before = new Uint8Array(await file.arrayBuffer());
  const progress = [], output = await exportCheckedOcrPdf(file, snapshot([checked([region('USSR')]), checked([region('Кировоградская область')])]), {onProgress: value => progress.push(value)});
  assert.equal(output.name, 'form (checked OCR).pdf'); assert.equal(output.type, 'application/pdf');
  assert.deepEqual(progress, [{page: 1, total: 2}, {page: 2, total: 2}]);
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), before, 'original bytes remain unchanged');
  const {getDocument} = await import('../src/pdf-reader.mjs');
  const task = getDocument({data: new Uint8Array(await output.arrayBuffer()), disableFontFace: true, useSystemFonts: false, verbosity: 0});
  const source = await openPdf(file), result = await openPdf(output);
  try {
    const pdf = await task.promise; assert.equal(pdf.numPages, 2);
    for (const [index, text] of ['USSR', 'Кировоградская область'].entries()) {
      const page = await pdf.getPage(index + 1), content = await page.getTextContent();
      assert.equal(content.items.map(item => item.str).join(''), text);
      const width = index ? 144 : 216, height = index ? 216 : 144;
      assert.deepEqual(page.getViewport({scale: 1}).viewBox, [0, 0, width, height]);
      const item = content.items.find(item => item.str);
      assert.ok(Math.abs(item.transform[4] - width * .1) < .01, 'corrected text stays at its reviewed horizontal position');
      assert.ok(Math.abs(item.width - width * .55) < .01, 'text width follows the selected region');
      assert.ok(item.transform[5] > height * .7 && item.transform[5] < height * .8, 'text baseline stays within its reviewed region');
      const sourcePixels = await pixelData((await source.page(index + 1)).blob), exportedPixels = await pixelData((await result.page(index + 1)).blob);
      assert.deepEqual(exportedPixels, sourcePixels, 'the invisible text does not change the page image');
    }
  } finally { await task.destroy(); await source.destroy(); await result.destroy(); }
});

test('image export composites transparency on white and keeps multiline corrections searchable', async t => {
  browserCanvas(t);
  const canvas = createCanvas(120, 80), ctx = canvas.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 60, 80);
  const file = new File([canvas.toBuffer('image/png')], 'scan.png', {type: 'image/png'});
  const output = await exportCheckedOcrPdf(file, snapshot([checked([region('USSR\nРоссия')])]));
  const doc = await openPdf(output);
  try {
    const rendered = await doc.page(1);
    assert.equal(rendered.pageWidth, 90); assert.equal(rendered.pageHeight, 60);
    assert.equal(rendered.text.replace(/\s/gu, ''), 'USSRРоссия');
    const pixels = await pixelData(rendered.blob), midpoint = Math.floor(rendered.height / 2) * rendered.width * 4;
    assert.deepEqual([...pixels.slice(midpoint + 4, midpoint + 8)], [255, 0, 0, 255]);
    const right = midpoint + (rendered.width - 2) * 4;
    assert.deepEqual([...pixels.slice(right, right + 4)], [255, 255, 255, 255]);
  } finally { await doc.destroy(); }
});

test('unmapped or unsupported text is rejected rather than exported as a misleading searchable PDF', async () => {
  const file = new File(['not decoded'], 'scan.pdf');
  await assert.rejects(exportCheckedOcrPdf(file, snapshot([{text: 'User correction', confirmed: true, regions: []}])), /page 1 has no text positions/);
  await assert.rejects(exportCheckedOcrPdf(file, snapshot([checked([region('🚀')])])), /character unsupported/);
  await assert.rejects(exportCheckedOcrPdf(file, snapshot([{...checked([region('USSR')]), confirmed: false}])), /invalid data/);
});

test('JPEG EXIF rotation uses the same oriented bitmap as review and closes it', async t => {
  browserCanvas(t);
  const canvas = createCanvas(120, 80); canvas.getContext('2d').fillRect(0, 0, 60, 80);
  const jpeg = canvas.toBuffer('image/jpeg'), tiff = Buffer.alloc(26);
  tiff.write('II'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(6, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), tiff]), marker = Buffer.from([0xff, 0xe1, 0, 0]); marker.writeUInt16BE(payload.length + 2, 2);
  const file = new File([jpeg.subarray(0, 2), marker, payload, jpeg.subarray(2)], 'rotated.jpg');
  let closed = 0;
  // A browser ImageBitmap is already EXIF-oriented. Exercise real EXIF validation,
  // and model that browser contract without relying on native canvas JPEG metadata.
  globalThis.createImageBitmap = async () => { const bitmap = createCanvas(80, 120); bitmap.close = () => closed++; return bitmap; };
  const output = await exportCheckedOcrPdf(file, snapshot([checked([region('USSR')])]));
  const pdf = await PDFDocument.load(await output.arrayBuffer());
  assert.deepEqual(pdf.getPages()[0].getSize(), {width: 60, height: 90}); assert.equal(closed, 1);
  globalThis.createImageBitmap = async () => { const bitmap = createCanvas(120, 80); bitmap.close = () => closed++; return bitmap; };
  await assert.rejects(exportCheckedOcrPdf(file, snapshot([checked([region('USSR')])])), /orientation could not be reproduced/);
  assert.equal(closed, 2, 'a mismatched bitmap is released as well');
});

test('export cancellation stops before decoding and between PDF pages without returning a partial file', async t => {
  browserCanvas(t);
  const early = new AbortController(); early.abort();
  await assert.rejects(exportCheckedOcrPdf(new File([], 'none.pdf'), {}, {signal: early.signal}), {name: 'AbortError'});
  const source = await PDFDocument.create(); source.addPage([100, 100]); source.addPage([100, 100]);
  const file = new File([await source.save()], 'two.pdf'), during = new AbortController(), progress = [];
  await assert.rejects(exportCheckedOcrPdf(file, snapshot([checked([region('One')]), checked([region('Two')])]), {
    signal: during.signal, onProgress: value => { progress.push(value.page); if (value.page === 2) during.abort(); },
  }), {name: 'AbortError'});
  assert.deepEqual(progress, [1, 2]);
});

test('visible corrections replace printed and handwritten ink only inside edited boxes and remain searchable once', async t => {
  browserCanvas(t);
  // Both sides are whole raster pixels at 300 dpi, avoiding resampling noise.
  const pdf = await PDFDocument.create(), page = pdf.addPage([240, 168]);
  page.drawRectangle({x:0,y:0,width:240,height:168,color:rgb(.94,.92,.84)});
  page.drawText('Old printed text', {x:25,y:124,size:15});
  // Pen-like strokes exercise removal of non-text image content as well.
  for (let i=0;i<7;i++) page.drawLine({start:{x:28+i*18,y:64},end:{x:40+i*18,y:82},thickness:3,color:rgb(.1,.2,.6)});
  page.drawText('REMOVE ME', {x:25,y:20,size:10});
  const file = new File([await pdf.save()], 'mixed-ink.pdf');
  const regions = [region('Исправлено 123',{id:'line-1',x:.1,y:.1,width:.7,height:.2,edited:true}),
    region('USSR',{id:'line-2',x:.1,y:.45,width:.7,height:.2,edited:true}),
    region('',{id:'line-3',x:.1,y:.8,width:.7,height:.1,edited:true})];
  const state = snapshot([checked(regions)]);
  const exported = await exportCheckedOcrPdf(file,state), unchanged = await exportCheckedOcrPdf(file,state,{visibleCorrections:false});
  const source = await openPdf(file), output = await openPdf(exported), originalView = await openPdf(unchanged);
  try {
    const before = await source.page(1), after = await output.page(1);
    const a = await pixelData(before.blob), b = await pixelData(after.blob);
    const changes = regions.map(()=>0);
    const masks = layoutCorrections(regions,after.width,after.height).map(correction=>correction.mask);
    for(let y=0;y<after.height;y++)for(let x=0;x<after.width;x++){
      const offset=(y*after.width+x)*4;
      if (a[offset]===b[offset]&&a[offset+1]===b[offset+1]&&a[offset+2]===b[offset+2]) continue;
      const index=masks.findIndex(r=>x>=r.x-2&&x<=r.x+r.width+2&&y>=r.y-2&&y<=r.y+r.height+2);
      assert.notEqual(index,-1,'the original image outside the declared correction masks is unchanged'); changes[index]++;
    }
    assert.ok(changes.every(count=>count>100),'every edited ink region visibly changes, including deletion');
    const deletionOffset=(Math.floor(.85*after.height)*after.width+Math.floor(.3*after.width))*4;
    assert.deepEqual([...b.slice(deletionOffset,deletionOffset+4)],[255,255,255,255]);
    assert.equal(after.text.split('Исправлено 123').length-1,1);assert.equal(after.text.split('USSR').length-1,1);
    assert.ok(!after.text.includes('Old printed')&&!after.text.includes('REMOVE ME'));
    assert.ok(Buffer.from(await pixelData((await originalView.page(1)).blob)).equals(Buffer.from(a)),'original-image mode keeps all original ink');
  } finally { await source.destroy();await output.destroy();await originalView.destroy(); }
});

test('preview paths and PDF layout share bounded uniform fitting, multiline text and explicit unsupported-character errors', () => {
  const regions=[region('Очень длинная исправленная строка\nSecond line',{edited:true}),region('Unchanged',{id:'line-2',y:.6})];
  const [correction]=layoutCorrections(regions,600,900), {rect}=correction;
  assert.equal(correction.lines.length,2);assert.equal(correction.lines[0].size,correction.lines[1].size);
  for(const line of correction.lines)for(const {glyph,x} of line.glyphs){
    const box=glyph.bbox;if(![box.minX,box.maxX,box.minY,box.maxY].every(Number.isFinite))continue;
    assert.ok(line.x+(x+box.minX)*line.scale>=rect.x-1e-6);
    assert.ok(line.x+(x+box.maxX)*line.scale<=rect.x+rect.width+1e-6);
    assert.ok(line.y-box.maxY*line.scale>=rect.y-1e-6);
    assert.ok(line.y-box.minY*line.scale<=rect.y+rect.height+1e-6);
  }
  const dom=new JSDOM('');
  try{
    const svg=createCorrectionOverlay(regions,600,900,dom.window.document);
    assert.equal(svg.getAttribute('viewBox'),'0 0 600 900');assert.equal(svg.querySelectorAll('rect').length,1);
    assert.ok(svg.querySelectorAll('path').length>10);assert.equal(svg.querySelectorAll('text,style,script,image').length,0);
    const overlap=createCorrectionOverlay([region('First',{edited:true}),region('Second',{id:'line-2',x:.2,edited:true})],600,900,dom.window.document);
    assert.deepEqual([...overlap.children].map(node=>node.localName),['rect','rect','g','g'],'all masks precede all text even when OCR frames overlap');
    assert.equal(createCorrectionOverlay([region('Legacy')],600,900,dom.window.document).children.length,0);
    assert.throws(()=>createCorrectionOverlay([region('🚀',{edited:true})],600,900,dom.window.document),/cannot be printed/);
  }finally{dom.window.close();}
});

test('a small correction halo covers tight OCR ink edges but stops before neighbouring regions and page edges', () => {
  const main=region('Corrected',{x:.1,y:.2,width:.5,height:.04,edited:true});
  const alone=layoutCorrections([main],600,840)[0];
  assert.ok(alone.mask.x<alone.rect.x&&alone.mask.y<alone.rect.y);
  assert.ok(alone.mask.x+alone.mask.width>alone.rect.x+alone.rect.width);
  assert.ok(alone.mask.y+alone.mask.height>alone.rect.y+alone.rect.height);
  assert.ok(alone.rect.x-alone.mask.x<=alone.rect.height*.06+1e-9);
  // A neighbour only 0.3 page units away limits expansion to half that gap.
  const near=region('Adjacent',{id:'line-2',x:.6005,y:.2,width:.1,height:.04});
  const constrained=layoutCorrections([main,near],600,840)[0];
  assert.ok(constrained.mask.x+constrained.mask.width<near.x*600);
  assert.ok(Math.abs(constrained.mask.x+constrained.mask.width-(360+.15))<1e-7);
  assert.deepEqual(constrained.rect,alone.rect,'padding never changes text placement');
  const edge=layoutCorrections([region('',{x:0,y:0,width:1,height:1,edited:true})],600,840)[0];
  assert.deepEqual(edge.mask,{x:0,y:0,width:600,height:840});
  const dom=new JSDOM('');
  try{
    const svg=createCorrectionOverlay([main],600,840,dom.window.document),mask=svg.querySelector('rect');
    for(const [key,value]of Object.entries(alone.mask))assert.equal(Number(mask.getAttribute(key)),value);
  }finally{dom.window.close();}
});
