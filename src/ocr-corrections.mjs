/** One geometry model for printed OCR corrections in the preview and PDF. */
import {fontkit} from './pdf-vendor.mjs';
import fontBase64 from './pdf-font.mjs';
import {validateOcrRegions} from './ocr-layout.mjs';

let face, supported;
function font() {
  if (!face) {
    face = fontkit.create(Uint8Array.from(atob(fontBase64), character => character.charCodeAt(0)));
    supported = new Set(face.characterSet);
  }
  return face;
}
const fail = message => { throw new Error(`OCR correction: ${message}`); };

/** Cover antialiasing just beyond a tight OCR box, without reaching a neighbour. */
function correctionMask(region, regions, width, height) {
  const x = region.x * width, y = region.y * height, w = region.width * width, h = region.height * height;
  const pad = Math.min(h * .06, Math.min(width, height) * .002);
  let left = Math.min(pad, x), top = Math.min(pad, y);
  let right = Math.min(pad, width - x - w), bottom = Math.min(pad, height - y - h);
  for (const other of regions) {
    if (other.id === region.id) continue;
    const ox = other.x * width, oy = other.y * height, ow = other.width * width, oh = other.height * height;
    // Existing overlapping frames cannot be separated by adding more paint.
    if (ox < x + w && ox + ow > x && oy < y + h && oy + oh > y) { left = top = right = bottom = 0; break; }
    if (oy < y + h + bottom && oy + oh > y - top) {
      if (ox + ow <= x) left = Math.min(left, (x - ox - ow) / 2);
      if (ox >= x + w) right = Math.min(right, (ox - x - w) / 2);
    }
    if (ox < x + w + right && ox + ow > x - left) {
      if (oy + oh <= y) top = Math.min(top, (y - oy - oh) / 2);
      if (oy >= y + h) bottom = Math.min(bottom, (oy - y - h) / 2);
    }
  }
  return {x: x - left, y: y - top, width: w + left + right, height: h + top + bottom};
}

/** Coordinates are top-down page units; each line's y is its baseline. */
export function layoutCorrections(regions, width, height) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) fail('invalid page dimensions.');
  const checkedRegions = validateOcrRegions(regions);
  const edits = checkedRegions.filter(region => region.edited === true);
  if (!edits.length) return [];
  const f = font();
  return edits.map(region => {
    const rect = {x: region.x * width, y: region.y * height, width: region.width * width, height: region.height * height};
    const texts = region.text.split(/\r\n|\r|\n/), slot = rect.height / texts.length;
    const padding = Math.min(rect.width, slot) * .04;
    const runs = texts.map(text => {
      for (const character of text) if (!supported.has(character.codePointAt(0))) fail('this character cannot be printed. Correct it or download checked text.');
      // PDF custom fonts use glyph advance widths. Disabling ligatures and kerning
      // gives the SVG paths the same advances as the embedded PDF text.
      const run = f.layout(text, {liga: false, kern: false});
      let advance = 0, left = 0, right = 0, ascent = f.ascent, descent = f.descent;
      const glyphs = run.glyphs.map(glyph => {
        const x = advance, box = glyph.bbox;
        if ([box.minX, box.maxX, box.minY, box.maxY].every(Number.isFinite)) {
          left = Math.min(left, x + box.minX); right = Math.max(right, x + box.maxX);
          ascent = Math.max(ascent, box.maxY); descent = Math.min(descent, box.minY);
        }
        advance += glyph.advanceWidth;
        return {glyph, x};
      });
      return {text, glyphs, left, width: Math.max(right, advance) - left, ascent, height: ascent - descent};
    });
    let scale = Math.min(...runs.map(run => Math.min((slot - 2 * padding) / run.height,
      run.width > 0 ? (rect.width - 2 * padding) / run.width : Infinity)));
    if (!Number.isFinite(scale) || scale <= 0) fail('the fragment is too small to print.');
    const lines = runs.map((run, index) => ({text: run.text, glyphs: run.glyphs, scale,
      size: scale * f.unitsPerEm, x: rect.x + padding - run.left * scale,
      y: rect.y + index * slot + (slot - run.height * scale) / 2 + run.ascent * scale}));
    return {id: region.id, rect, mask: correctionMask(region, checkedRegions, width, height), lines};
  });
}

/** SVG glyph outlines need no remote font or inline stylesheet under the CSP. */
export function createCorrectionOverlay(regions, width, height, doc = document) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const corrections = layoutCorrections(regions, width, height);
  // Paint all masks before text, exactly as PDF export does, including overlaps.
  for (const correction of corrections) {
    const rect = doc.createElementNS(ns, 'rect');
    for (const [key, value] of Object.entries(correction.mask)) rect.setAttribute(key, String(value));
    rect.setAttribute('fill', '#fff'); svg.append(rect);
  }
  for (const correction of corrections) {
    for (const line of correction.lines) {
      const group = doc.createElementNS(ns, 'g'); group.setAttribute('fill', '#000');
      group.setAttribute('transform', `translate(${line.x} ${line.y}) scale(${line.scale} ${-line.scale})`);
      for (const {glyph, x} of line.glyphs) {
        const d = glyph.path.toSVG(); if (!d) continue;
        const path = doc.createElementNS(ns, 'path'); path.setAttribute('d', d);
        path.setAttribute('transform', `translate(${x} 0)`); group.append(path);
      }
      svg.append(group);
    }
  }
  return svg;
}
