import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createCanvas, DOMMatrix, ImageData, Path2D, loadImage} from '@napi-rs/canvas';
import {boundedViewport, PDF_LIMITS, validatePdfRegion} from '../src/ocr-pdf-input.mjs';

test('ordinary A4 pages preserve 300 dpi detail while oversized pages obey allocation bounds', () => {
  const a4 = boundedViewport(595, 842);
  assert.equal(a4.scale, 300 / 72); assert.equal(a4.width, 2479); assert.equal(a4.height, 3508);
  for (const [width, height] of [[842,595],[12000,12000],[1,1e6],[1e6,1],[1200.75,1600.25]]) {
    const size = boundedViewport(width, height);
    assert.ok(size.width * size.height <= PDF_LIMITS.pixels);
    assert.ok(size.width <= PDF_LIMITS.dimension && size.height <= PDF_LIMITS.dimension);
    assert.ok(size.width >= 1 && size.height >= 1);
    assert.ok(size.scale <= 300 / 72);
  }
});
test('invalid PDF dimensions and regions fail before raster allocation', () => {
  for (const dims of [[0,1],[-1,1],[Infinity,2],[2,NaN],[1e9,2],[3,4,0]]) assert.throws(() => boundedViewport(...dims), /dimensions/);
  for (const region of [null, {}, {x:0,y:0,width:0,height:1}, {x:-.1,y:0,width:.5,height:1}, {x:.8,y:0,width:.3,height:1}, {x:0,y:NaN,width:1,height:1}]) {
    assert.throws(() => validatePdfRegion(region), /region/);
  }
});

async function harness({width = 595, height = 842} = {}) {
  const rendered = [], allocations = []; let extracted = 0;
  const pdfPage = {
    getViewport: ({scale}) => ({width: width * scale, height: height * scale}),
    render(options) { rendered.push(options); return {promise: Promise.resolve(), cancel() {}}; },
    getTextContent: async () => { extracted++; return {items: [{str: 'FULL PAGE TEXT'}]}; }, cleanup() {},
  };
  const context = vm.createContext({DOMException, AbortController, TextDecoder, Uint8Array, document: {
    createElement() {
      const canvas = {width: 0, height: 0, getContext: () => ({}), toBlob(done) {
        allocations.push({width: canvas.width, height: canvas.height}); done(new Blob(['image']));
      }};
      return canvas;
    },
  }});
  const engine = new vm.SyntheticModule(['getDocument'], function() {
    this.setExport('getDocument', () => ({promise: Promise.resolve({numPages: 1, getPage: async () => pdfPage}), destroy: async () => {}}));
  }, {context});
  await engine.link(() => {}); await engine.evaluate();
  const module = new vm.SourceTextModule(readFileSync(new URL('../src/ocr-pdf-input.mjs', import.meta.url), 'utf8'), {
    context, importModuleDynamically: async () => engine,
  });
  await module.link(() => {}); await module.evaluate();
  const doc = await module.namespace.openPdf(new Blob(['%PDF-1.7']));
  return {doc, rendered, allocations, extracted: () => extracted};
}
test('region render crops directly and never returns unrelated full-page text', async () => {
  const h = await harness(), region = {x: .25, y: .5, width: .5, height: .25};
  const page = await h.doc.page(1, {region});
  assert.equal(page.dpi, 300); assert.equal(page.width, 1239); assert.equal(page.height, 877);
  assert.equal(page.text, ''); assert.equal(page.hasText, false); assert.equal(h.extracted(), 0);
  assert.deepEqual(h.allocations, [{width: 1239, height: 877}]);
  const transform = h.rendered[0].transform;
  assert.ok(Math.abs(transform[4] + 595 * .25 * 300 / 72) < 1e-8);
  assert.ok(Math.abs(transform[5] + 842 * .5 * 300 / 72) < 1e-8);
  await h.doc.destroy();
});
test('cropping a large page restores 300 dpi without allocating a full-page raster', async () => {
  const h = await harness({width: 2000, height: 3000});
  const full = await h.doc.page(1), crop = await h.doc.page(1, {region: {x: .5, y: .5, width: .2, height: .2}});
  assert.ok(full.dpi < 300); assert.equal(full.text, 'FULL PAGE TEXT');
  assert.equal(crop.dpi, 300); assert.equal(h.extracted(), 1);
  assert.ok(crop.width * crop.height < full.width * full.height);
  assert.ok(h.allocations.every(size => size.width * size.height <= PDF_LIMITS.pixels));
  await assert.rejects(h.doc.page(1, {region: {x:1, y:0, width:.1, height:1}}), /region/);
  assert.equal(h.rendered.length, 2);
  await h.doc.destroy();
});

test('real PDF raster crops match the selected visible region for upright and rotated pages', async t => {
  const globals = {DOMMatrix, ImageData, Path2D, document: {createElement() {
    const canvas = createCanvas(1, 1);
    canvas.toBlob = done => done(new Blob([canvas.toBuffer('image/png')]));
    return canvas;
  }}};
  const prior = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  t.after(() => { for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const {PDFDocument, rgb} = await import('../src/pdf-vendor.mjs');
  const {openPdf} = await import('../src/ocr-pdf-input.mjs');
  const pixels = async blob => {
    const image = await loadImage(Buffer.from(await blob.arrayBuffer())), canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return {width: image.width, height: image.height, at: (x, y) => [...ctx.getImageData(x, y, 1, 1).data]};
  };
  for (const rotation of [0, 90]) {
    const source = await PDFDocument.create(), page = source.addPage([200, 100]);
    page.setRotation({type: 'degrees', angle: rotation});
    page.drawRectangle({x: 0, y: 0, width: 100, height: 100, color: rgb(1,0,0)});
    page.drawRectangle({x: 100, y: 0, width: 100, height: 100, color: rgb(0,0,1)});
    const doc = await openPdf(new Blob([await source.save()]));
    try {
      const full = await pixels((await doc.page(1)).blob);
      for (const region of [{x: .05, y: .05, width: .4, height: .4}, {x: .55, y: .55, width: .4, height: .4}]) {
        const cropped = await pixels((await doc.page(1, {region})).blob);
        const color = cropped.at(Math.floor(cropped.width / 2), Math.floor(cropped.height / 2));
        assert.deepEqual(color, full.at(Math.floor(full.width * (region.x + region.width / 2)), Math.floor(full.height * (region.y + region.height / 2))));
        assert.ok(color[0] === 0 || color[2] === 0, 'selected content is a colored rectangle, not a blank canvas');
      }
    } finally { await doc.destroy(); }
  }
});
