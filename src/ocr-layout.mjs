/** Serializable OCR line geometry. Coordinates always refer to the original page. */
const MAX_REGIONS = 2000;
const MAX_CHARS = 500000;
const invalid = message => { throw new Error(`OCR layout: ${message}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function rectangle(value) {
  if (!object(value) || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key])) ||
      value.x < 0 || value.x >= 1 || value.y < 0 || value.y >= 1 || value.width <= 0 || value.height <= 0 ||
      value.x + value.width > 1 + 1e-12 || value.y + value.height > 1 + 1e-12) {
    invalid('a text region must be inside the page.');
  }
  return {x: value.x, y: value.y, width: Math.min(value.width, 1 - value.x), height: Math.min(value.height, 1 - value.y)};
}

function checkedText(value) {
  if (typeof value !== 'string' || value.includes('\0')) invalid('invalid region text.');
  return value;
}

/** Validate persisted regions without retaining extra fields or prototype data. */
export function validateOcrRegions(regions) {
  if (!Array.isArray(regions) || regions.length > MAX_REGIONS) invalid('at most 2000 text regions are supported.');
  const ids = new Set();
  let characters = 0;
  return regions.map(region => {
    if (!object(region) || typeof region.id !== 'string' || !/^line-[1-9]\d{0,5}$/.test(region.id) || ids.has(region.id)) invalid('invalid or duplicate region identifier.');
    ids.add(region.id);
    const text = checkedText(region.text);
    characters += text.length;
    if (characters > MAX_CHARS) invalid('text regions exceed 500000 characters.');
    return {id: region.id, text, ...rectangle(region)};
  });
}

/** Keep OCR reading order. The image coordinates retain separate columns/fields. */
export function layoutText(regions) {
  const text = validateOcrRegions(regions).map(region => region.text).join('\n');
  if (text.length > MAX_CHARS) invalid('text regions exceed 500000 characters.');
  return text;
}

/** Convert Tesseract 7 blocks to normalized line regions, optionally from a crop.
 * Missing geometry is an empty result, never a guessed full-page text rectangle.
 * The caller must retain data.text separately when no usable mapping is returned.
 */
export function normalizeOcrLayout(data, width, height, {region} = {}) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) invalid('invalid recognition image dimensions.');
  const crop = rectangle(region ?? {x: 0, y: 0, width: 1, height: 1});
  if (!object(data)) invalid('invalid recognition result.');
  if (data.text !== undefined && checkedText(data.text).length > MAX_CHARS) invalid('recognized text exceeds 500000 characters.');
  if (data.blocks === undefined || data.blocks === null) return [];
  if (!Array.isArray(data.blocks) || data.blocks.length > MAX_REGIONS) invalid('invalid or oversized block list.');
  const regions = [];
  let paragraphs = 0, lines = 0, characters = 0;
  for (const block of data.blocks) {
    if (!object(block)) invalid('invalid block.');
    if (block.paragraphs === undefined || block.paragraphs === null) continue;
    if (!Array.isArray(block.paragraphs)) invalid('invalid paragraph list.');
    paragraphs += block.paragraphs.length;
    if (paragraphs > MAX_REGIONS) invalid('at most 2000 paragraphs are supported.');
    for (const paragraph of block.paragraphs) {
      if (!object(paragraph) || !Array.isArray(paragraph.lines)) invalid('invalid line list.');
      lines += paragraph.lines.length;
      if (lines > MAX_REGIONS) invalid('at most 2000 text regions are supported.');
      for (const line of paragraph.lines) {
        if (!object(line)) invalid('invalid line.');
        const text = checkedText(line.text).replace(/\r?\n$/, '');
        characters += text.length;
        if (characters > MAX_CHARS) invalid('text regions exceed 500000 characters.');
        // Empty non-text detections do not need an editable overlay.
        if (!text.trim()) continue;
        const box = line.bbox;
        if (!object(box) || !['x0', 'y0', 'x1', 'y1'].every(key => Number.isFinite(box[key])) ||
            box.x0 < 0 || box.y0 < 0 || box.x1 <= box.x0 || box.y1 <= box.y0 || box.x1 > width || box.y1 > height) invalid('invalid line bounds.');
        regions.push({id: `line-${regions.length + 1}`, text,
          x: crop.x + box.x0 / width * crop.width,
          y: crop.y + box.y0 / height * crop.height,
          width: (box.x1 - box.x0) / width * crop.width,
          height: (box.y1 - box.y0) / height * crop.height});
      }
    }
  }
  return validateOcrRegions(regions);
}
