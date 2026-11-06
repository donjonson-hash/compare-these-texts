import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {validateOcrImage, IMAGE_LIMITS} from '../src/ocr-image-input.mjs';

const blob = bytes => new Blob([bytes], {type: 'application/octet-stream'});
function png(width, height) {
  const bytes = Buffer.alloc(45);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  bytes[24] = 8; bytes[25] = 2; bytes.write('IEND', 37);
  return bytes;
}
function tiff(orientation, little = true) {
  const data = Buffer.alloc(26);
  const u16 = (value, offset) => little ? data.writeUInt16LE(value, offset) : data.writeUInt16BE(value, offset);
  const u32 = (value, offset) => little ? data.writeUInt32LE(value, offset) : data.writeUInt32BE(value, offset);
  data.write(little ? 'II' : 'MM'); u16(42, 2); u32(8, 4); u16(1, 8);
  u16(0x112, 10); u16(3, 12); u32(1, 14); u16(orientation, 18);
  return data;
}
function jpeg(width, height, orientation, little = true) {
  const frame = Buffer.from([0xff,0xc0,0,11,8,0,0,0,0,1,1,0x11,0]);
  frame.writeUInt16BE(height, 5); frame.writeUInt16BE(width, 7);
  let app = Buffer.alloc(0);
  if (orientation !== undefined) {
    const payload = Buffer.concat([Buffer.from('Exif\0\0'), tiff(orientation, little)]);
    app = Buffer.alloc(4); app[0] = 0xff; app[1] = 0xe1; app.writeUInt16BE(payload.length + 2, 2);
    app = Buffer.concat([app, payload]);
  }
  return Buffer.concat([Buffer.from([0xff,0xd8]), app, frame, Buffer.from([0xff,0xd9])]);
}

test('real PNG and JPEG dimensions are read without trusting MIME labels', async () => {
  const canvas = createCanvas(640, 480);
  for (const type of ['image/png', 'image/jpeg']) {
    const info = await validateOcrImage(blob(canvas.toBuffer(type)));
    assert.equal(info.type, type); assert.equal(info.width, 640); assert.equal(info.height, 480);
  }
});
test('tiny compressed headers cannot request an unbounded bitmap allocation', async () => {
  for (const bytes of [png(100000, 100000), png(0, 100), jpeg(65535, 65535), jpeg(0, 100)]) {
    await assert.rejects(validateOcrImage(blob(bytes)), /pixels/);
  }
  assert.equal((await validateOcrImage(blob(png(4000, 3000)))).rawWidth, 4000);
  await assert.rejects(validateOcrImage(blob(png(4001, 3000))), /pixels/);
});
test('JPEG EXIF orientation in both byte orders reports browser-oriented dimensions', async () => {
  for (const little of [true, false]) for (let orientation = 1; orientation <= 8; orientation++) {
    const info = await validateOcrImage(blob(jpeg(640, 480, orientation, little)));
    assert.equal(info.orientation, orientation); assert.equal(info.rawWidth, 640);
    assert.equal(info.width, orientation >= 5 ? 480 : 640);
    assert.equal(info.height, orientation >= 5 ? 640 : 480);
  }
});
test('PNG EXIF orientation is accounted for before decode', async () => {
  const header = png(640, 480), metadata = tiff(6), chunk = Buffer.alloc(metadata.length + 12);
  chunk.writeUInt32BE(metadata.length); chunk.write('eXIf', 4); metadata.copy(chunk, 8);
  const info = await validateOcrImage(blob(Buffer.concat([header.subarray(0, 33), chunk, header.subarray(33)])));
  assert.equal(info.width, 480); assert.equal(info.height, 640);
});
test('unsupported, truncated and corrupt metadata fail at preflight', async () => {
  const badExif = jpeg(640, 480, 6); badExif.writeUInt32LE(0xffffffff, 16);
  for (const bytes of [Buffer.from('GIF89a'), png(1,1).subarray(0,30), jpeg(1,1).subarray(0,8), Buffer.from([0xff,0xd8,0xff,0xe1,0,1]), badExif, jpeg(1,1,9)]) {
    await assert.rejects(validateOcrImage(blob(bytes)), /Image:/);
  }
});
test('byte limits and cancellation prevent decoding and stop pending reads', async () => {
  let reads = 0;
  const file = {size: IMAGE_LIMITS.bytes + 1, arrayBuffer() { reads++; return new Promise(() => {}); }};
  await assert.rejects(validateOcrImage(file), /10 MiB/); assert.equal(reads, 0);
  const before = new AbortController(); before.abort();
  await assert.rejects(validateOcrImage({...file, size: 10}, {signal: before.signal}), {name: 'AbortError'});
  assert.equal(reads, 0);
  const during = new AbortController(), pending = validateOcrImage({...file, size: 10}, {signal: during.signal});
  during.abort(); await assert.rejects(pending, {name: 'AbortError'}); assert.equal(reads, 1);
});
