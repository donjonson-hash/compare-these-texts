import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas, DOMMatrix, ImageData, Path2D, loadImage} from '@napi-rs/canvas';
import {PDFDocument, rgb} from '../src/pdf-vendor.mjs';
import {exportCheckedOcrPdf} from '../src/ocr-pdf-export.mjs';
import {openPdf} from '../src/ocr-pdf-input.mjs';

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
