import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../src/ocr-runtime.mjs', import.meta.url), 'utf8');
async function harness(onRequest = () => {}) {
  const workers = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; this.alive = true; workers.push(this); }
    postMessage(message) { onRequest(this, message); }
    terminate() { this.alive = false; }
    reply(data) { this.onmessage?.({data}); }
  }
  const module = new vm.SourceTextModule(source, {
    context: vm.createContext({Worker, URL, DOMException, setTimeout, clearTimeout}),
    initializeImportMeta: meta => { meta.url = 'https://ctt.test/ocr-runtime.mjs'; },
  });
  await module.link(() => { throw new Error('Unexpected import'); }); await module.evaluate();
  return {makeWorker: module.namespace.makeWorker, workers, live: () => workers.filter(worker => worker.alive).length};
}

test('OCR supports combined languages and preserves recognition options and progress', async () => {
  const messages = [], progress = [];
  const h = await harness((worker, message) => {
    messages.push(message);
    if (message.action === 'initialize') worker.reply({type:'progress', data:{status:'loading language traineddata'}});
    worker.reply({id:message.id, data:message.action === 'recognize' ? {data:{text:'Счёт Invoice 123'}} : undefined});
  });
  const worker = await h.makeWorker('rus+eng', value => progress.push(value), {psm:'3'});
  const result = await worker.recognize('image', {rectangle:{left:2,top:3,width:10,height:20}});
  assert.equal(messages[0].language, 'rus+eng'); assert.equal(messages[0].psm, '3');
  assert.equal(messages[1].options.rectangle.width, 10); assert.equal(progress.length, 1);
  assert.equal(result.data.text, 'Счёт Invoice 123');
  await worker.terminate(); await worker.terminate(); assert.equal(h.live(), 0);
});

test('abort during initialization rejects immediately and releases owner', async () => {
  const h = await harness(), controller = new AbortController();
  const ready = h.makeWorker('eng', undefined, {signal:controller.signal});
  assert.equal(h.live(), 1); controller.abort();
  await assert.rejects(ready, {name:'AbortError'}); assert.equal(h.live(), 0);
});

test('model-load errors reject even without an initialization response', async () => {
  const h = await harness(worker => worker.reply({type:'error', message:'Language model 404'}));
  await assert.rejects(h.makeWorker('rus'), /Language model 404/); assert.equal(h.live(), 0);
});

test('initialization and recognition both have bounded lifetimes', async () => {
  const init = await harness();
  await assert.rejects(init.makeWorker('eng', undefined, {timeoutMs:10}), /timed out/); assert.equal(init.live(), 0);
  const recognition = await harness((worker, message) => {
    if (message.action === 'initialize') worker.reply({id:message.id});
  });
  const worker = await recognition.makeWorker('eng', undefined, {timeoutMs:10});
  await assert.rejects(worker.recognize('image'), /timed out/); assert.equal(recognition.live(), 0);
  await assert.rejects(worker.recognize('again'), /timed out/);
});

test('abort and terminate reject active recognition and tolerate late messages', async () => {
  for (const viaSignal of [false, true]) {
    const h = await harness((owner, message) => { if (message.action === 'initialize') owner.reply({id:message.id}); });
    const controller = new AbortController();
    const worker = await h.makeWorker('eng', undefined, {signal:controller.signal});
    const job = worker.recognize('image');
    if (viaSignal) controller.abort(); else await worker.terminate();
    await assert.rejects(job, {name:'AbortError'});
    h.workers[0].reply({type:'progress',data:{status:'late'}}); assert.equal(h.live(), 0);
  }
});

test('a native worker error closes the owner and reaches the caller', async () => {
  const h = await harness(worker => worker.onerror({message:'Engine crash', preventDefault() {}}));
  await assert.rejects(h.makeWorker('eng'), /Engine crash/); assert.equal(h.live(), 0);
});

test('invalid and already cancelled requests do not start workers', async () => {
  const h = await harness(); const controller = new AbortController(); controller.abort();
  await assert.rejects(h.makeWorker('fra'), /Choose English/);
  await assert.rejects(h.makeWorker('eng', undefined, {psm:'9'}), /supported OCR layout/);
  await assert.rejects(h.makeWorker('eng', undefined, {timeoutMs:0}), /positive OCR timeout/);
  await assert.rejects(h.makeWorker('eng', undefined, {signal:controller.signal}), {name:'AbortError'});
  assert.equal(h.workers.length, 0);
});
