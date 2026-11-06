/** Inspect compressed image headers before asking the browser to allocate a bitmap. */
export const IMAGE_LIMITS = Object.freeze({bytes: 10 * 1024 * 1024, pixels: 12_000_000});
const abortError = () => new DOMException('Image operation cancelled.', 'AbortError');
const fail = message => { throw new Error(`Image: ${message}`); };
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function exifOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) fail('invalid EXIF header.');
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) fail('invalid EXIF byte order.');
  if (view.getUint16(2, little) !== 42) fail('invalid EXIF header.');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > bytes.length) fail('invalid EXIF directory.');
  const count = view.getUint16(offset, little);
  if (offset + 2 + count * 12 > bytes.length) fail('incomplete EXIF directory.');
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (view.getUint16(entry, little) !== 0x112) continue;
    if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) fail('invalid EXIF orientation.');
    const orientation = view.getUint16(entry + 8, little);
    if (orientation < 1 || orientation > 8) fail('invalid EXIF orientation.');
    return orientation;
  }
  return 1;
}

function pngDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) fail('invalid PNG header.');
  const width = view.getUint32(16), height = view.getUint32(20);
  let orientation = 1;
  // PNG eXIf carries the same TIFF directory as JPEG EXIF, without its six-byte prefix.
  for (let offset = 33; offset < bytes.length;) {
    if (offset + 12 > bytes.length) fail('incomplete PNG chunk.');
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) fail('incomplete PNG chunk.');
    if (view.getUint32(offset + 4) === 0x65584966) orientation = exifOrientation(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  return {width, height, orientation, type: 'image/png'};
}

function jpegDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width, height, orientation = 1;
  for (let offset = 2; offset < bytes.length;) {
    if (bytes[offset++] !== 0xff) fail('invalid JPEG marker.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail('incomplete JPEG header.');
    const length = view.getUint16(offset), end = offset + length;
    if (length < 2 || end > bytes.length) fail('incomplete JPEG segment.');
    if (marker === 0xda) break; // Entropy-coded pixels follow SOS, not more metadata.
    if (marker === 0xe1 && length >= 8 && view.getUint32(offset + 2) === 0x45786966 && view.getUint16(offset + 6) === 0) {
      orientation = exifOrientation(bytes.subarray(offset + 8, end));
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8 || length !== 8 + bytes[offset + 7] * 3) fail('invalid JPEG frame header.');
      if (width !== undefined) fail('multiple JPEG frames are not supported.');
      height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
    }
    offset = end;
  }
  if (width === undefined) fail('JPEG dimensions were not found.');
  return {width, height, orientation, type: 'image/jpeg'};
}

export async function validateOcrImage(file, {signal} = {}) {
  checkAbort(signal);
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > IMAGE_LIMITS.bytes || typeof file.arrayBuffer !== 'function') {
    fail('choose a nonempty JPEG or PNG no larger than 10 MiB.');
  }
  let cancel;
  const aborted = signal && new Promise((resolve, reject) => {
    cancel = () => reject(abortError());
    signal.addEventListener('abort', cancel, {once: true});
  });
  let buffer;
  try { buffer = await (signal ? Promise.race([file.arrayBuffer(), aborted]) : file.arrayBuffer()); }
  finally { if (cancel) signal.removeEventListener('abort', cancel); }
  checkAbort(signal);
  const bytes = new Uint8Array(buffer);
  if (bytes.length !== file.size || bytes.length > IMAGE_LIMITS.bytes) fail('the image file size changed while reading.');
  let dimensions;
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) dimensions = pngDimensions(bytes);
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) dimensions = jpegDimensions(bytes);
  else fail('only JPEG and PNG images are supported.');
  const {width: rawWidth, height: rawHeight, orientation, type} = dimensions;
  if (!rawWidth || !rawHeight || rawWidth * rawHeight > IMAGE_LIMITS.pixels) fail('choose an image with 1 to 12000000 pixels.');
  const swap = orientation >= 5;
  return {width: swap ? rawHeight : rawWidth, height: swap ? rawWidth : rawHeight, rawWidth, rawHeight, orientation, type};
}
