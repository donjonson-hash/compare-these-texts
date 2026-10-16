import test from 'node:test';
import assert from 'node:assert/strict';
import {openSessionStore, validateSessionPayload} from '../src/session-store.mjs';
import {openSingleSessionStore} from '../src/single-session.mjs';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const source = {name: 'example.txt', data: Buffer.from('Hello').toString('base64')};
const payload = () => ({version: 1, sources: {left: {...source}, right: {...source}}, review: {}, report: {kind: 'text', status: 'complete', sources: {left: {format: 'txt'}, right: {format: 'txt'}}, matched: [], changed: [], only_left: [], only_right: []}});

// Transactional storage double: exercises expiration policy, rollback and tab
// ownership without pretending to verify a browser's IndexedDB implementation.
function storage(initial) {
  let saved = structuredClone(initial), tail = Promise.resolve(), failPut = false;
  const names = [], modes = [];
  return {
    indexedDB: {open(name) {
      names.push(name); const request = {};
      queueMicrotask(() => { request.result = {
        close() {},
        transaction(_store, mode) {
          modes.push(mode); let pending, aborted = false, copied;
          const tx = {abort() { aborted = true; }, objectStore() { return {
            get() { const req = {}; pending = req; return req; },
            put(row) { if (failPut) throw new DOMException('Storage full', 'QuotaExceededError'); copied = structuredClone(row); },
          }; }};
          tail = tail.then(() => { copied = structuredClone(saved); pending.result = structuredClone(saved); pending.onsuccess();
            if (aborted) tx.onabort(); else { saved = copied; tx.oncomplete(); }
          });
          return tx;
        },
      }; request.onsuccess(); });
      return request;
    }},
    get row() { return structuredClone(saved); }, get names() { return names; }, get modes() { return modes; },
    failWrites(value) { failPut = value; },
  };
}

test('legacy drafts receive a full grace period without changing content, key, or ownership', async () => {
  const original = {token: 'legacy', payload: payload(), updatedAt: 1}; const db = storage(original); let time = 5 * WEEK;
  const store = await openSessionStore({indexedDB: db.indexedDB, now: () => time});
  assert.deepEqual(await store.read(), original); assert.equal(db.row.expiresAt, time + WEEK); assert.deepEqual(db.names, ['kristina-review-session']);
  time += WEEK - 1; assert.deepEqual((await store.read()).payload, original.payload); assert.equal(db.row.expiresAt, time + WEEK);
  time += WEEK; const expired = await store.read(); assert.equal(expired.payload, null); assert.notEqual(expired.token, original.token);
  assert.equal(db.row.payload, null); assert.equal(Object.hasOwn(db.row, 'expiresAt'), false); assert.ok(db.modes.every(mode => mode === 'readwrite'));
  await assert.rejects(store.write(payload(), original.token), {code: 'conflict'});
});
test('expiration is checked on load, while an existing editor can save after the deadline', async () => {
  const db = storage(); let time = 1000; const store = await openSessionStore({indexedDB: db.indexedDB, now: () => time});
  const saved = await store.write(payload(), null); assert.equal(db.row.expiresAt, time + WEEK);
  time += 2 * WEEK; assert.deepEqual(db.row.payload, saved.payload, 'No background timer destroys the open draft');
  const latest = payload(); latest.review.selected = 'last edit'; const updated = await store.write(latest, saved.token);
  assert.equal(db.row.expiresAt, time + WEEK); assert.deepEqual((await store.read()).payload, latest);
  time += WEEK; const expired = await store.read(); assert.equal(expired.payload, null);
  await assert.rejects(store.write(latest, updated.token), {code: 'conflict'});
});
test('expired drafts cannot erase a newer save from another window', async () => {
  const db = storage(); let time = 1000; const options = {indexedDB: db.indexedDB, now: () => time};
  const a = await openSessionStore(options), b = await openSessionStore(options), first = await a.write(payload(), null);
  time += WEEK; const next = payload(); next.review.selected = 'newer';
  const [saved, restored] = await Promise.all([b.write(next, first.token), a.read()]);
  assert.equal(restored.token, saved.token); assert.deepEqual(restored.payload, next);
  await assert.rejects(a.clear(first.token), {code: 'conflict'}); assert.deepEqual(db.row.payload, next);
});
test('invalid payloads and failed writes preserve the last good draft', async () => {
  const db = storage(), store = await openSessionStore({indexedDB: db.indexedDB, now: () => 1000});
  const saved = await store.write(payload(), null), original = db.row;
  const corrupt = payload(); corrupt.sources.left.data = '====';
  await assert.rejects(store.write(corrupt, saved.token), {code: 'invalid'}); assert.deepEqual(db.row, original);
  db.failWrites(true); await assert.rejects(store.write(payload(), saved.token), {name: 'QuotaExceededError'}); assert.deepEqual(db.row, original);
  await assert.rejects(store.read(), {name: 'QuotaExceededError'}); assert.deepEqual(db.row, original);
  db.failWrites(false); assert.deepEqual((await store.read()).payload, saved.payload);
});
test('corrupt and incompatible legacy stores remain available for explicit deletion', async () => {
  for (const [data, code] of [[{version: 2}, 'incompatible'], [{version: 1}, 'corrupt']]) {
    const original = {token: 'bad', payload: data, updatedAt: 0}, db = storage(original), store = await openSessionStore({indexedDB: db.indexedDB, now: () => 10 * WEEK});
    await assert.rejects(store.read(), {code, token: 'bad'}); assert.deepEqual(db.row, original);
    assert.equal((await store.clear('bad')).payload, null);
  }
  const original = {token: 'bad-expiry', payload: payload(), updatedAt: 0, expiresAt: 'yesterday'}, db = storage(original), store = await openSessionStore({indexedDB: db.indexedDB});
  await assert.rejects(store.read(), {code: 'corrupt'}); assert.deepEqual(db.row, original);
});
test('single-document drafts share retention policy while keeping their separate database', async () => {
  const db = storage(); let time = 1000; const store = await openSingleSessionStore({indexedDB: db.indexedDB, now: () => time});
  const single = {version: 1, kind: 'single-editor', source: {name: 'one.csv', data: Buffer.from('Code,Value\nA,1').toString('base64')}, delimiter: ',', sheet: null, review: {kind: 'sheet', version: 1}};
  await store.write(single, null); assert.deepEqual(db.names, ['ctt-single-editor-session']); time += WEEK;
  assert.equal((await store.read()).payload, null); assert.equal(db.row.payload, null);
});
test('schema validation detaches snapshots and refuses incompatible, cyclic, and oversized sources', () => {
  const original = payload(), detached = validateSessionPayload(original); original.review.selected = 'later'; assert.equal(detached.review.selected, undefined);
  assert.throws(() => validateSessionPayload({...payload(), version: 2}), {code: 'incompatible'});
  const cyclic = payload(); cyclic.review.self = cyclic; assert.throws(() => validateSessionPayload(cyclic), {code: 'invalid'});
  const huge = payload(); huge.sources.left.data = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'); assert.throws(() => validateSessionPayload(huge), {code: 'invalid'});
});
