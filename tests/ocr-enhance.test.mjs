import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {enhancePixels, validateEnhanceDimensions} from '../src/ocr-enhance-core.mjs';

const runtimeSource = await readFile(new URL('../src/ocr-enhance.mjs', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/ocr-enhance-worker.mjs', import.meta.url), 'utf8');
function image(width, height, pixel) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = pixel(x, y), p = (y * width + x) * 4;
    rgba[p] = rgba[p + 1] = rgba[p + 2] = value; rgba[p + 3] = 255;
  }
  return rgba;
}

test('uniform black, gray and white pages gain no artificial marks, including narrow images', () => {
  for (const [width, height] of [[1,1], [1,100], [100,1], [64,48]]) for (const value of [0, 128, 255]) {
    const original = image(width, height, () => value), snapshot = original.slice();
    const processed = enhancePixels(original, width, height);
    assert.deepEqual(processed, original); assert.deepEqual(original, snapshot);
    assert.notEqual(processed, original);
  }
});

test('faint strokes become more distinct without moving or changing image dimensions', () => {
  const width = 120, height = 80;
  const isStroke = (x,y) => x >= 45 && x < 50 && y >= 20 && y < 60;
  const original = image(width, height, (x,y) => isStroke(x,y) ? 202 : 248), snapshot = original.slice();
  const processed = enhancePixels(original, width, height);
  const at = (pixels,x,y) => pixels[(y * width + x) * 4];
  assert.ok(at(processed,10,40) - at(processed,47,40) > at(original,10,40) - at(original,47,40));
  assert.equal(processed.length, original.length); assert.deepEqual(original, snapshot);
  assert.ok(at(processed,47,40) < at(processed,70,40));
});

test('illumination normalization reduces a smooth shadow while preserving dark strokes', () => {
  const width = 300, height = 100;
  const original = image(width, height, (x,y) => x >= 145 && x < 150 && y >= 25 && y < 75 ? 20 : Math.round(115 + x * 0.4));
  const output = enhancePixels(original, width, height);
  const at = (pixels,x,y) => pixels[(y * width + x) * 4];
  assert.ok(Math.abs(at(output,50,10) - at(output,250,10)) < Math.abs(at(original,50,10) - at(original,250,10)));
  assert.ok(at(output,147,50) < at(output,180,50));
  assert.deepEqual(output, enhancePixels(original, width, height), 'same pixels give identical output');
});

test('transparent pixels composite onto white and invalid sizes fail before processing', () => {
  assert.deepEqual([...enhancePixels(new Uint8ClampedArray([0,0,0,0]),1,1)], [255,255,255,255]);
  for (const dimensions of [[0,1], [1,-1], [NaN,1], [1.5,2], [4001,4000]]) assert.throws(() => validateEnhanceDimensions(...dimensions), /16000000/);
  assert.throws(() => enhancePixels(new Uint8ClampedArray(3),1,1), /Invalid image pixels/);
});

async function runtimeHarness(onRequest = () => {}) {
  const workers = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.alive = true; workers.push(this); }
    postMessage(message) { onRequest(this,message); }
    terminate() { this.alive = false; }
    reply(data) { this.onmessage?.({data}); }
  }
  const module = new vm.SourceTextModule(runtimeSource, {
    context: vm.createContext({Worker, URL, Blob, DOMException, setTimeout, clearTimeout}),
    initializeImportMeta: meta => { meta.url = 'https://ctt.test/ocr-enhance.mjs'; },
  });
  await module.link(() => { throw new Error('Unexpected import'); }); await module.evaluate();
  return {enhance:module.namespace.enhanceOcrImage, workers, live:() => workers.filter(x => x.alive).length};
}

test('local enhancement returns a separate result and terminates its worker', async () => {
  const input = new Blob(['input']), result = new Blob(['processed']);
  const h = await runtimeHarness((worker,message) => {
    assert.equal(message.blob,input);
    assert.equal(worker.url.href,'https://ctt.test/ocr-enhance-worker.mjs');
    assert.equal(worker.options.type,'module');
    worker.reply({type:'result',data:{blob:result,width:10,height:20,method:'contrast-v1'}});
  });
  const output = await h.enhance(input);
  assert.equal(output.blob,result); assert.equal(h.live(),0); assert.equal(await input.text(),'input');
});

test('cancellation and timeout reject promptly and cannot deliver a late image', async () => {
  const h = await runtimeHarness(), controller = new AbortController();
  const pending = h.enhance(new Blob(['image']), {signal:controller.signal});
  const callback = h.workers[0].onmessage;
  controller.abort(); await assert.rejects(pending,{name:'AbortError'}); assert.equal(h.live(),0);
  callback({data:{type:'result',data:{blob:new Blob(['late']),width:1,height:1,method:'contrast-v1'}}});
  const timed = await runtimeHarness();
  await assert.rejects(timed.enhance(new Blob(['image']),{timeoutMs:10}),/timed out/); assert.equal(timed.live(),0);
});

test('worker errors and malformed results release resources; invalid inputs start no worker', async () => {
  for (const message of [{type:'error',message:'Decode failed'}, {type:'result',data:{blob:new Blob(['x']),width:0,height:10,method:'contrast-v1'}}]) {
    const h = await runtimeHarness(worker => worker.reply(message));
    await assert.rejects(h.enhance(new Blob(['input']))); assert.equal(h.live(),0);
  }
  const h = await runtimeHarness(), controller = new AbortController(); controller.abort();
  await assert.rejects(h.enhance(new Blob(['x']),{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(h.enhance(new Blob([])),/nonempty/);
  await assert.rejects(h.enhance(new Blob(['x']),{timeoutMs:0}),/positive/);
  assert.equal(h.workers.length,0);
});

test('oversized compressed dimensions are rejected before createImageBitmap allocates pixels', async () => {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer);
  bytes.set([137,80,78,71,13,10,26,10]); view.setUint32(8,13); view.setUint32(12,0x49484452);
  view.setUint32(16,100000); view.setUint32(20,100000);
  const messages = []; let decodes = 0;
  const self = {postMessage:message => messages.push(message)};
  const context = vm.createContext({self, Blob, Uint8Array, DataView,
    createImageBitmap:async () => { decodes++; throw new Error('must not decode'); }});
  const module = new vm.SourceTextModule(workerSource,{context});
  await module.link(() => new vm.SyntheticModule(['enhancePixels','validateEnhanceDimensions','ENHANCE_LIMITS'],function() {
    this.setExport('enhancePixels',enhancePixels); this.setExport('validateEnhanceDimensions',validateEnhanceDimensions);
    this.setExport('ENHANCE_LIMITS',{pixels:16_000_000,bytes:64*1024*1024});
  },{context}));
  await module.evaluate(); await self.onmessage({data:{blob:new Blob([bytes])}});
  assert.equal(decodes,0); assert.equal(messages[0].type,'error'); assert.match(messages[0].message,/16000000/);
});

function metadataJpeg(width, height) {
  const segment = new Uint8Array(65537); segment.set([0xff, 0xe2, 0xff, 0xff]);
  const frame = new Uint8Array([0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]);
  return new Blob([new Uint8Array([0xff, 0xd8]), ...Array(17).fill(segment), frame, new Uint8Array([0xff, 0xd9])]);
}
async function runImageWorker(blob) {
  const messages = [], slices = []; let decodes = 0;
  class TrackedBlob extends Blob {
    slice(start, end) { slices.push([start, Math.min(end, this.size)]); return super.slice(start, end); }
  }
  const self = {postMessage: message => messages.push(message)};
  const context = vm.createContext({self, Blob, Uint8Array, DataView,
    createImageBitmap: async () => { decodes++; return {width: 64, height: 48, close() {}}; },
    OffscreenCanvas: class {
      getContext() { return {fillRect() {}, drawImage() {}, getImageData: () => ({data: image(64, 48, () => 255)}), putImageData() {}}; }
      async convertToBlob() { return new Blob(['processed']); }
    },
    ImageData: class { constructor(data, width, height) { Object.assign(this, {data, width, height}); } },
  });
  const module = new vm.SourceTextModule(workerSource, {context});
  await module.link(() => new vm.SyntheticModule(['enhancePixels', 'validateEnhanceDimensions', 'ENHANCE_LIMITS'], function() {
    this.setExport('enhancePixels', enhancePixels); this.setExport('validateEnhanceDimensions', validateEnhanceDimensions);
    this.setExport('ENHANCE_LIMITS', {pixels:16_000_000, bytes:64 * 1024 * 1024});
  }, {context}));
  await module.evaluate(); await self.onmessage({data:{blob:new TrackedBlob([blob])}});
  return {messages, slices, decodes};
}

test('JPEG metadata beyond 1 MiB is skipped with bounded reads before enhancement', async () => {
  const jpeg = metadataJpeg(64, 48);
  assert.ok(jpeg.size > 1024 * 1024);
  const {messages, slices, decodes} = await runImageWorker(jpeg);
  assert.equal(messages[0].type, 'result'); assert.equal(decodes, 1);
  assert.equal(messages[0].data.width, 64); assert.equal(messages[0].data.height, 48);
  assert.ok(slices.every(([start, end]) => end - start <= 4096), 'metadata is not read into one large buffer');
  assert.ok(slices.reduce((total, [start, end]) => total + end - start, 0) < 100000, 'APP payloads are skipped');
});

test('oversized JPEG after large metadata is rejected before decoding', async () => {
  const {messages, decodes} = await runImageWorker(metadataJpeg(65535, 65535));
  assert.equal(decodes, 0); assert.equal(messages[0].type, 'error'); assert.match(messages[0].message, /16000000/);
});

test('truncated JPEG segments fail before decoding', async () => {
  const jpeg = metadataJpeg(64, 48);
  for (const input of [jpeg.slice(0, 100), jpeg.slice(0, jpeg.size - 10), new Blob([new Uint8Array([0xff, 0xd8, 0xff])])]) {
    const {messages, decodes} = await runImageWorker(input);
    assert.equal(decodes, 0); assert.equal(messages[0].type, 'error'); assert.match(messages[0].message, /Incomplete/);
  }
});
