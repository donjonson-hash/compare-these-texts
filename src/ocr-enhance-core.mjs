/** Fixed, local contrast pipeline. This approximates the experimental Pillow
 * Gaussian with three box filters; it is not a pixel-identical Pillow port.
 * No thresholding, resizing, text inference or source-buffer mutation occurs.
 */
export const ENHANCE_LIMITS = Object.freeze({pixels: 16_000_000, bytes: 64 * 1024 * 1024});
export function validateEnhanceDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > ENHANCE_LIMITS.pixels) {
    throw new Error('Image enhancement supports up to 16000000 pixels. Select a smaller page.');
  }
}

const clampByte = value => Math.max(0, Math.min(255, Math.round(value)));
function boxHorizontal(input, output, width, height, radius) {
  const divisor = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const offset = y * width, last = width - 1;
    let sum = (radius + 1) * input[offset];
    for (let x = 1; x <= Math.min(radius, last); x++) sum += input[offset + x];
    sum += Math.max(0, radius - last) * input[offset + last];
    for (let x = 0; x < width; x++) {
      output[offset + x] = sum / divisor;
      sum += input[offset + Math.min(last, x + radius + 1)] - input[offset + Math.max(0, x - radius)];
    }
  }
}
function boxVertical(input, output, width, height, radius) {
  const divisor = 2 * radius + 1, last = height - 1;
  for (let x = 0; x < width; x++) {
    let sum = (radius + 1) * input[x];
    for (let y = 1; y <= Math.min(radius, last); y++) sum += input[y * width + x];
    sum += Math.max(0, radius - last) * input[last * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / divisor;
      sum += input[Math.min(last, y + radius + 1) * width + x] - input[Math.max(0, y - radius) * width + x];
    }
  }
}
function gaussianInPlace(values, temporary, width, height, radii) {
  for (const radius of radii) {
    if (!radius) continue;
    boxHorizontal(values, temporary, width, height, radius);
    boxVertical(temporary, values, width, height, radius);
  }
}
function percentile(histogram, count, quantile) {
  const rank = (count - 1) * quantile, low = Math.floor(rank), high = Math.ceil(rank);
  let total = 0, a, b;
  for (let value = 0; value < histogram.length; value++) {
    total += histogram[value];
    if (a === undefined && total > low) a = value;
    if (total > high) { b = value; break; }
  }
  return a + (b - a) * (rank - low);
}

/** Return a same-size opaque grayscale RGBA array. Peak working arrays are
 * two Float32 planes, one byte plane and the new RGBA output; input stays intact.
 */
export function enhancePixels(rgba, width, height) {
  validateEnhanceDimensions(width, height);
  const count = width * height;
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length !== count * 4) {
    throw new Error('Invalid image pixels.');
  }
  const gray = new Uint8Array(count);
  let min = 255, max = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4, alpha = rgba[p + 3] / 255;
    const value = clampByte((0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) * alpha + 255 * (1 - alpha));
    gray[i] = value; min = Math.min(min, value); max = Math.max(max, value);
  }
  const output = new Uint8ClampedArray(count * 4);
  if (min === max) {
    for (let i = 0; i < count; i++) { const p = i * 4; output[p] = output[p + 1] = output[p + 2] = min; output[p + 3] = 255; }
    return output;
  }
  const background = Float32Array.from(gray), temporary = new Float32Array(count);
  // Box widths 63/63/65 approximate sigma 32; clamped edges keep the canvas size.
  gaussianInPlace(background, temporary, width, height, [31, 31, 32]);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    gray[i] = clampByte(255 * gray[i] / Math.max(background[i], 1)); histogram[gray[i]]++;
  }
  const low = percentile(histogram, count, 0.01), high = percentile(histogram, count, 0.995);
  const gain = high - low >= 8 ? Math.min(3, 255 / (high - low)) : 1;
  if (gain !== 1) for (let i = 0; i < count; i++) gray[i] = clampByte(255 - gain * (high - gray[i]));
  background.set(gray);
  // Small sigma ~1 approximation for mild unsharp masking; preserve fine marks.
  gaussianInPlace(background, temporary, width, height, [0, 0, 1]);
  for (let i = 0; i < count; i++) {
    const difference = gray[i] - background[i];
    const value = Math.abs(difference) > 3 ? clampByte(gray[i] + 0.6 * difference) : gray[i];
    const p = i * 4; output[p] = output[p + 1] = output[p + 2] = value; output[p + 3] = 255;
  }
  return output;
}
