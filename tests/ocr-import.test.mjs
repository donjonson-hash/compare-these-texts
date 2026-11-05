import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOcrImport, checkedTextFile, importFileLimit} from '../src/ocr-import.mjs';

const reviewed = {originalName:'scan.pdf',text:'Цена 18,50 USD\n\nСрок 15 ноября',pages:[{text:'Цена 18,50 USD',confirmed:true},{text:'Срок 15 ноября',confirmed:true}]};
test('reviewed OCR imports exact text without synthetic headings or spelling correction', async () => {
  const file = checkedTextFile(reviewed);
  assert.equal(await file.text(), reviewed.text);
  assert.equal(file.name, 'scan (checked OCR).txt');
  const longName = checkedTextFile({...reviewed,originalName:'a' + '📄'.repeat(150) + '.png'}).name;
  assert.ok(longName.length <= 255 && longName.isWellFormed());
  assert.throws(() => checkedTextFile({...reviewed,pages:[{text:'x',confirmed:false}]}), /Check every page/);
  assert.throws(() => checkedTextFile({...reviewed,text:'corrected'}), /Check every page/);
});
test('scan review cancellation produces no import; a text PDF stays original', async () => {
  const pdf = new File(['%PDF'], 'example.pdf');
  assert.equal(await prepareOcrImport(pdf,{probePdf:async()=>({needsReview:false})}), pdf);
  assert.equal(await prepareOcrImport(pdf,{probePdf:async()=>({needsReview:true}),review:async()=>null}), null);
  const result = await prepareOcrImport(pdf,{probePdf:async()=>({needsReview:true}),review:async()=>reviewed});
  assert.equal(await result.text(), reviewed.text);
});
test('invalid PDF errors do not silently enter OCR and aborted approval is discarded', async () => {
  const pdf = new File(['broken'],'bad.pdf'); let calls = 0;
  await assert.rejects(prepareOcrImport(pdf,{probePdf:async()=>{throw new Error('Invalid PDF');},review:async()=>{calls++;}}), /Invalid PDF/);
  assert.equal(calls,0);
  const controller = new AbortController();
  await assert.rejects(prepareOcrImport(new File(['x'],'scan.png'),{signal:controller.signal,review:async()=>{controller.abort();return reviewed;}}), {name:'AbortError'});
});
test('checked text respects downstream parser bounds and type-specific input limits', () => {
  const text = 'x\n'.repeat(2001);
  assert.throws(()=>checkedTextFile({text,originalName:'big.png',pages:[{text,confirmed:true}]}), /2,000 lines/);
  assert.equal(importFileLimit('x.pdf'),20*1024*1024);
  assert.equal(importFileLimit('x.jpg'),10*1024*1024);
  assert.equal(importFileLimit('x.txt'),2*1024*1024);
});
