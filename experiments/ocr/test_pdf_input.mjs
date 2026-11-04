import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedViewport, PDF_LIMITS, textFromItems, validatePageNumber, validatePdfFile, openPdf} from './pdf-input.mjs';

test('ordinary and extreme page bitmaps remain within both allocation limits', () => {
  for (const [w,h] of [[595,842],[842,595],[12000,12000],[1,1e6],[1e6,1],[1200.75,1600.25]]) {
    const size = boundedViewport(w,h);
    assert.ok(size.width * size.height <= PDF_LIMITS.pixels);
    assert.ok(size.width <= PDF_LIMITS.dimension && size.height <= PDF_LIMITS.dimension);
    assert.ok(size.width >= 1 && size.height >= 1);
    assert.ok(size.scale > 0 && size.scale <= 2);
  }
  assert.deepEqual(boundedViewport(595,842), {scale:2,width:1190,height:1684});
});
test('invalid page dimensions fail before allocating a canvas', () => {
  for (const dims of [[0,1],[-1,1],[Infinity,2],[2,NaN],[1e9,2],[3,4,0]]) assert.throws(() => boundedViewport(...dims), /dimensions/);
});
test('page indexes and document count are bounded', () => {
  validatePageNumber(30,30);
  for (const args of [[0,2],[3,2],[1.5,2],[1,0],[1,31],[NaN,3]]) assert.throws(() => validatePageNumber(...args));
});
test('file limits do not depend on extension or MIME label', () => {
  const file = {size:20*1024*1024,arrayBuffer:async()=>new ArrayBuffer(1)};
  validatePdfFile(file);
  for (const size of [0,-1,NaN,Infinity,20*1024*1024+1]) assert.throws(() => validatePdfFile({...file,size}));
  assert.throws(() => validatePdfFile({size:2}));
});
test('text layer retains numbers, case, Cyrillic and explicit newlines', () => {
  assert.equal(textFromItems([{str:'TOTAL 1,203.40',hasEOL:true},{str:'О0 / I1 '},{str:'КОД',hasEOL:true}]),'TOTAL 1,203.40\nО0 / I1 КОД\n');
  assert.equal(textFromItems([{type:'beginMarkedContent'},{str:''},{str:'Hello '},{str:'world'}]),'Hello world');
  assert.equal(textFromItems([{str:'Hel'},{str:'lo',hasEOL:true}]),'Hello\n');
  assert.equal(textFromItems([]),'');
});
test('overlarge text layers fail instead of being silently truncated', () => {
  assert.throws(() => textFromItems(new Array(100001).fill({str:'a'})), /fragments/);
  assert.throws(() => textFromItems([{str:'a'.repeat(500001)}]), /500000/);
});
test('abort and corrupt signatures fail before loading PDF engine', async () => {
  const controller=new AbortController();controller.abort();
  await assert.rejects(openPdf(new Blob(['%PDF-1.7']),{signal:controller.signal}), {name:'AbortError'});
  await assert.rejects(openPdf(new Blob(['not a pdf'])), /signature/);
});
