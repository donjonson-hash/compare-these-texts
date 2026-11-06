import {enhancePixels, validateEnhanceDimensions, ENHANCE_LIMITS} from './ocr-enhance-core.mjs';

// Inspect a bounded header before allocating decoded bitmap memory. Enhancement
// receives validated app images, but also enforces its own PNG/JPEG size boundary.
async function inspectHeader(blob) {
  if (!(blob instanceof Blob) || blob.size < 1 || blob.size > ENHANCE_LIMITS.bytes) throw new Error('Choose an image no larger than 64 MiB.');
  const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((x,i) => bytes[i] === x) && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452) {
    const width = view.getUint32(16), height = view.getUint32(20);
    validateEnhanceDimensions(width, height); return width * height;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    // APP/COM metadata may legally put SOF beyond the first MiB. Walk lengths
    // without loading payloads; cache only a small window for adjacent markers.
    let window = bytes, windowStart = 0;
    const read = async (offset, length) => {
      if (offset + length > blob.size) throw new Error('Incomplete JPEG image header.');
      if (offset < windowStart || offset + length > windowStart + window.length) {
        windowStart = offset;
        window = new Uint8Array(await blob.slice(offset, offset + Math.max(4096, length)).arrayBuffer());
      }
      return window.subarray(offset - windowStart, offset - windowStart + length);
    };
    for (let offset = 2; offset < blob.size;) {
      if ((await read(offset++, 1))[0] !== 0xff) break;
      let marker;
      do { marker = (await read(offset++, 1))[0]; } while (marker === 0xff);
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      const size = await read(offset, 2), length = size[0] * 256 + size[1];
      if (length < 2 || offset + length > blob.size) throw new Error('Incomplete or invalid JPEG segment.');
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4,0xc8,0xcc].includes(marker)) {
        if (length < 8) throw new Error('Invalid JPEG frame header.');
        const frame = await read(offset, 8);
        if (length !== 8 + frame[7] * 3) throw new Error('Invalid JPEG frame header.');
        const height = frame[3] * 256 + frame[4], width = frame[5] * 256 + frame[6];
        validateEnhanceDimensions(width, height); return width * height;
      }
      offset += length;
    }
  }
  throw new Error('Could not read the PNG or JPEG image header.');
}

self.onmessage = async ({data}) => {
  let bitmap, canvas;
  try {
    const expectedPixels = await inspectHeader(data.blob);
    bitmap = await createImageBitmap(data.blob);
    const {width, height} = bitmap;
    validateEnhanceDimensions(width, height);
    if (width * height !== expectedPixels) throw new Error('Image dimensions do not match the header.');
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    if (!context) throw new Error('Could not prepare the image preview.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0);
    bitmap.close(); bitmap = null;
    const pixels = context.getImageData(0, 0, width, height);
    context.putImageData(new ImageData(enhancePixels(pixels.data, width, height), width, height), 0, 0);
    const blob = await canvas.convertToBlob({type:'image/png'});
    self.postMessage({type:'result', data:{blob, width, height, method:'contrast-v1'}});
  } catch (error) {
    self.postMessage({type:'error', message:error?.message || 'Could not improve this image.'});
  } finally {
    bitmap?.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
};
