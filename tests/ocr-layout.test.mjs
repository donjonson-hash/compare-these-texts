import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOcrLayout, validateOcrRegions, layoutText} from '../src/ocr-layout.mjs';

const line = (text, x0, y0, x1, y1) => ({text, bbox: {x0, y0, x1, y1}});
const result = lines => ({text: lines.map(item => item.text).join(''), blocks: [{paragraphs: [{lines}]}]});

test('line regions retain separate columns and exact OCR reading order', () => {
  const data = result([line('Left first\n', 10, 20, 90, 40), line('Left second\n', 10, 60, 90, 80), line('Right first\n', 110, 20, 190, 40)]);
  const regions = normalizeOcrLayout(data, 200, 100);
  assert.deepEqual(regions, [
    {id:'line-1',text:'Left first',x:.05,y:.2,width:.4,height:.2},
    {id:'line-2',text:'Left second',x:.05,y:.6,width:.4,height:.2},
    {id:'line-3',text:'Right first',x:.55,y:.2,width:.4,height:.2},
  ]);
  assert.equal(layoutText(regions), 'Left first\nLeft second\nRight first');
  assert.equal(data.blocks[0].paragraphs[0].lines[0].text, 'Left first\n', 'normalization never mutates worker output');
});

test('cropped recognition maps line bounds back into the original page', () => {
  const [region] = normalizeOcrLayout(result([line('Surname', 20, 10, 180, 30)]), 200, 100, {region: {x:.2,y:.4,width:.5,height:.2}});
  assert.equal(region.x, .25); assert.ok(Math.abs(region.y - .42) < 1e-12);
  assert.equal(region.width, .4); assert.ok(Math.abs(region.height - .04) < 1e-12);
});

test('missing or blank geometry produces no invented mapping and leaves full text intact', () => {
  const data = {text:'Unlocated handwritten answer', blocks:null};
  assert.deepEqual(normalizeOcrLayout(data, 100, 100), []);
  assert.equal(data.text, 'Unlocated handwritten answer');
  assert.deepEqual(normalizeOcrLayout(result([{text:' \n'}]), 100, 100), []);
});

test('invalid geometry, crop coordinates and malformed worker lists are rejected', () => {
  for (const box of [[-1,0,20,10], [0,0,101,10], [0,0,20,101], [0,0,0,10], [0,0,20,0], [NaN,0,20,10], [0,0,Infinity,10]]) {
    assert.throws(() => normalizeOcrLayout(result([line('Text', ...box)]), 100, 100), /bounds/);
  }
  assert.throws(() => normalizeOcrLayout({blocks:{}}, 100, 100), /block list/);
  assert.throws(() => normalizeOcrLayout({blocks:[{paragraphs:'bad'}]}, 100, 100), /paragraph list/);
  assert.throws(() => normalizeOcrLayout({blocks:[{paragraphs:[{lines:{}}]}]}, 100, 100), /line list/);
  assert.throws(() => normalizeOcrLayout(result([line('Text',0,0,20,10)]), 0, 100), /dimensions/);
  assert.throws(() => normalizeOcrLayout(result([]), 100, 100, {region:{x:.9,y:0,width:.2,height:1}}), /inside the page/);
});

test('persisted regions are independently validated and copied without extra properties', () => {
  const source = [{id:'line-1',text:'Corrected name',x:.1,y:.1,width:.2,height:.05,unsafe:'discard'}];
  const checked = validateOcrRegions(source);
  assert.equal(checked[0].unsafe, undefined); assert.notEqual(checked[0], source[0]);
  assert.deepEqual(validateOcrRegions([]), []);
  assert.throws(() => validateOcrRegions([...source, source[0]]), /duplicate/);
  assert.throws(() => validateOcrRegions([{...source[0],id:'<script>'}]), /identifier/);
  assert.throws(() => validateOcrRegions([{...source[0],text:'a\0b'}]), /text/);
  assert.throws(() => validateOcrRegions([{...source[0],height:NaN}]), /inside the page/);
  assert.throws(() => validateOcrRegions([{...source[0],x:1,width:Number.EPSILON}]), /inside the page/);
});

test('oversized text and nested layout output are bounded before conversion', () => {
  const base = line('a', 0, 0, 10, 10);
  assert.throws(() => normalizeOcrLayout(result(Array(2001).fill(base)), 100, 100), /2000/);
  assert.throws(() => normalizeOcrLayout({blocks:Array(2001).fill({})}, 100, 100), /oversized/);
  assert.throws(() => normalizeOcrLayout({blocks:[{paragraphs:Array(2001).fill({lines:[]})}]}, 100, 100), /2000/);
  assert.throws(() => normalizeOcrLayout({text:'x'.repeat(500001)}, 100, 100), /500000/);
  assert.throws(() => normalizeOcrLayout({blocks:[{paragraphs:[{lines:[{...base,text:'x'.repeat(500001)}]}]}]}, 100, 100), /500000/);
  const regions = [{id:'line-1',text:'x'.repeat(250000),x:0,y:0,width:1,height:.2},{id:'line-2',text:'x'.repeat(250000),x:0,y:.3,width:1,height:.2}];
  assert.throws(() => layoutText(regions), /500000/, 'separating newlines also count towards the output limit');
});
