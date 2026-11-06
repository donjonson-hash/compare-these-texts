import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOcrImport, checkedTextFile, validateCheckedText, importFileLimit} from '../src/ocr-import.mjs';
import {readTextSource} from '../src/text-source.mjs';

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
test('document OCR preserves the original scan and approved pages while comparison remains text-only', async () => {
  const file = new File(['%PDF original scan bytes'], 'scan.pdf');
  const result = await prepareOcrImport(file, {preserveDocument:true, forceOcr:true, review:async()=>reviewed});
  assert.equal(result.kind, 'ocr-document');
  assert.equal(result.file, file);
  assert.equal(await result.file.text(), '%PDF original scan bytes');
  assert.equal(result.result, reviewed);
  await assert.rejects(prepareOcrImport(file, {preserveDocument:true, forceOcr:true, review:async()=>({...reviewed,pages:[{text:'unchecked',confirmed:false}]})}), /Check every page/);
  assert.equal(await prepareOcrImport(file, {preserveDocument:true,forceOcr:true,review:async()=>null}), null);
});
test('explicit OCR lets a PDF with a partial text layer enter review', async () => {
  const pdf = new File(['%PDF'], 'hybrid.pdf'); let probes = 0, reviews = 0;
  const result = await prepareOcrImport(pdf, {forceOcr:true, probePdf:async()=>{probes++; return {needsReview:false};}, review:async file=>{assert.equal(file,pdf); reviews++; return reviewed;}});
  assert.equal(probes, 0);
  assert.equal(reviews, 1);
  assert.equal(await result.text(), reviewed.text);
  const txt = new File(['plain'], 'plain.txt');
  assert.equal(await prepareOcrImport(txt, {forceOcr:true}), txt);
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
test('review validation agrees with TXT trailing lines, Unicode and NUL rules', async () => {
  for (const text of ['x\n'.repeat(2000), 'x\r\n'.repeat(2000), '\uFEFF' + '📄'.repeat(500000), '']) {
    assert.doesNotThrow(() => validateCheckedText(text));
    const file = checkedTextFile({text,originalName:'scan.png',pages:[{text,confirmed:true}]});
    await readTextSource({name:file.name,data:Buffer.from(await file.arrayBuffer()).toString('base64')});
  }
  for (const text of ['x\n'.repeat(2001), '📄'.repeat(500001), 'before\0after']) {
    assert.throws(() => validateCheckedText(text), /too large|NUL/);
  }
});
