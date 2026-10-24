import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {openSessionStore, validateSessionPayload} from '../src/session-store.mjs';
import {openSingleSessionStore} from '../src/single-session.mjs';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SECRET = 'PRIVATE-CUSTOMER-ALPHA-49382';
const source = {name: SECRET + '.txt', data: Buffer.from(SECRET).toString('base64')};
const payload = () => ({version: 1, sources: {left: {...source}, right: {...source}}, review: {note: SECRET}, report: {kind: 'text', status: 'complete', sources: {left: {format: 'txt'}, right: {format: 'txt'}}, matched: [], changed: [], only_left: [], only_right: []}});

// Serialized transactions with structured cloning and rollback. These tests use
// real Web Crypto; the installed-extension check separately verifies real IDB.
function storage(initial) {
  let saved = structuredClone(initial), tail = Promise.resolve(), failPut = false;
  const names = [], versions = [];
  return {
    indexedDB: {open(name, version) {
      names.push(name); versions.push(version); const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {}, objectStoreNames: {contains: () => true},
          transaction() {
            let aborted = false, copied, queue = [];
            const tx = {abort() { aborted = true; }, objectStore() { return {
              get() { const req = {}; queue.push(() => { req.result = structuredClone(copied); req.onsuccess?.(); }); return req; },
              put(row) { if (failPut) throw new DOMException('Storage full', 'QuotaExceededError'); copied = structuredClone(row); return {}; },
              delete() { copied = undefined; return {}; },
            }; }};
            tail = tail.then(() => {
              copied = structuredClone(saved);
              try { while (queue.length && !aborted) queue.shift()(); }
              catch (error) { tx.error = error; aborted = true; }
              if (aborted) tx.onabort?.(); else { saved = copied; tx.oncomplete?.(); }
            });
            return tx;
          },
        };
        request.onsuccess();
      });
      return request;
    }},
    get row() { return structuredClone(saved); },
    set row(value) { saved = structuredClone(value); },
    get names() { return names; }, get versions() { return versions; },
    failWrites(value) { failPut = value; },
  };
}
function cryptoWith(overrides = {}) {
  return {randomUUID: () => webcrypto.randomUUID(), getRandomValues: value => webcrypto.getRandomValues(value),
    subtle: new Proxy(webcrypto.subtle, {get(target, name) { return overrides[name] || (typeof target[name] === 'function' ? target[name].bind(target) : target[name]); }})};
}
function gate(method) {
  let release, entered;
  const reached = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  let calls = 0;
  return {reached, release: () => release(), crypto: cryptoWith({[method]: async (...args) => {
    if (++calls === 1) { entered(); await wait; }
    return webcrypto.subtle[method](...args);
  }})};
}
async function assertEncrypted(row) {
  assert.equal(row.schema, 2);
  assert.equal(Object.hasOwn(row, 'payload'), false, 'plaintext payload is never persisted');
  assert.ok(row.ciphertext instanceof ArrayBuffer && row.ciphertext.byteLength > 16);
  assert.ok(row.iv instanceof Uint8Array && row.iv.length === 12);
  assert.equal(row.key.type, 'secret'); assert.equal(row.key.algorithm.name, 'AES-GCM'); assert.equal(row.key.algorithm.length, 256);
  assert.equal(row.key.extractable, false);
  await assert.rejects(webcrypto.subtle.exportKey('raw', row.key));
  assert.ok(!JSON.stringify(row).includes(SECRET));
  assert.ok(!Buffer.from(row.ciphertext).includes(Buffer.from(SECRET)));
  assert.ok(!Buffer.from(row.ciphertext).includes(Buffer.from(source.data)));
}
function assertCleared(row) {
  assert.equal(row.payload, null);
  for (const name of ['key', 'iv', 'ciphertext', 'revision', 'expiresAt']) assert.equal(Object.hasOwn(row, name), false, `${name} is removed`);
}

test('comparison drafts encrypt the complete snapshot and restore after closing the store', async () => {
  const db = storage(); const store = await openSessionStore({indexedDB: db.indexedDB});
  const original = payload(), saved = await store.write(original, null);
  assert.deepEqual(saved.payload, original); await assertEncrypted(db.row); const first = db.row;
  store.close();
  const reopened = await openSessionStore({indexedDB: db.indexedDB});
  assert.deepEqual((await reopened.read()).payload, original);
  const second = await reopened.write(original, saved.token);
  await assertEncrypted(db.row);
  assert.notDeepEqual(db.row.iv, first.iv, 'a fresh IV is used even for identical content');
  assert.notDeepEqual(db.row.ciphertext, first.ciphertext);
  assert.notEqual(second.token, first.token);
  assert.deepEqual(db.versions, [2, 2]);
});
test('legacy drafts migrate atomically with their ownership and content intact', async () => {
  const original = {token: 'legacy', payload: payload(), updatedAt: 1}; const db = storage(original); let time = 5 * WEEK;
  const store = await openSessionStore({indexedDB: db.indexedDB, now: () => time});
  assert.deepEqual(await store.read(), original); await assertEncrypted(db.row);
  assert.equal(db.row.token, original.token); assert.equal(db.row.updatedAt, original.updatedAt);
  assert.equal(db.row.expiresAt, time + WEEK); assert.deepEqual(db.names, ['kristina-review-session']);
  time += WEEK - 1; assert.deepEqual((await store.read()).payload, original.payload); assert.equal(db.row.expiresAt, time + WEEK);
  time += WEEK; const expired = await store.read(); assert.equal(expired.payload, null); assert.notEqual(expired.token, original.token);
  assertCleared(db.row); await assert.rejects(store.write(payload(), original.token), {code: 'conflict'});
});
test('expiration occurs only on load; an open editor may save after the deadline', async () => {
  const db = storage(); let time = 1000; const store = await openSessionStore({indexedDB: db.indexedDB, now: () => time});
  const saved = await store.write(payload(), null), ciphertext = db.row.ciphertext;
  time += 2 * WEEK; assert.deepEqual(db.row.ciphertext, ciphertext, 'No background timer destroys the open draft');
  const latest = payload(); latest.review.selected = 'last edit'; const updated = await store.write(latest, saved.token);
  assert.equal(db.row.expiresAt, time + WEEK); assert.deepEqual((await store.read()).payload, latest);
  time += WEEK; const expired = await store.read(); assert.equal(expired.payload, null); assertCleared(db.row);
  await assert.rejects(store.write(latest, updated.token), {code: 'conflict'});
});
test('invalid payloads and failed persistence preserve the last good encrypted draft', async () => {
  const db = storage(), store = await openSessionStore({indexedDB: db.indexedDB, now: () => 1000});
  const saved = await store.write(payload(), null), original = db.row;
  const corrupt = payload(); corrupt.sources.left.data = '====';
  await assert.rejects(store.write(corrupt, saved.token), {code: 'invalid'}); assert.deepEqual(db.row, original);
  db.failWrites(true); await assert.rejects(store.write(payload(), saved.token), {name: 'QuotaExceededError'}); assert.deepEqual(db.row, original);
  db.failWrites(false); assert.deepEqual((await store.read()).payload, saved.payload);
});
test('migration failures never remove or replace the legacy draft with plaintext fallback', async () => {
  for (const cryptoFailure of [false, true]) {
    const original = {token: 'legacy', payload: payload(), updatedAt: 10}, db = storage(original);
    if (!cryptoFailure) db.failWrites(true);
    const crypto = cryptoFailure ? cryptoWith({encrypt: async () => { throw Error('Crypto unavailable'); }}) : webcrypto;
    const store = await openSessionStore({indexedDB: db.indexedDB, crypto});
    await assert.rejects(store.read()); assert.deepEqual(db.row, original);
    db.failWrites(false);
    const retry = await openSessionStore({indexedDB: db.indexedDB});
    assert.deepEqual((await retry.read()).payload, original.payload); await assertEncrypted(db.row);
  }
});
test('tampered ciphertext, metadata and missing keys fail closed but can be explicitly deleted', async () => {
  const mutations = [
    row => { new Uint8Array(row.ciphertext)[0] ^= 1; },
    row => { row.iv[0] ^= 1; },
    row => { row.token += '-tampered'; },
    row => { row.updatedAt += 1; },
    row => { row.revision += '-tampered'; },
    row => { row.expiresAt += 1; },
    row => { delete row.key; },
  ];
  for (const mutate of mutations) {
    const db = storage(), store = await openSessionStore({indexedDB: db.indexedDB});
    await store.write(payload(), null); const corrupt = db.row; mutate(corrupt); db.row = corrupt;
    await assert.rejects(store.read(), error => error.code === 'corrupt' && error.token === corrupt.token);
    assert.deepEqual(db.row, corrupt, 'failed authentication does not rewrite the record');
    assert.equal((await store.clear(corrupt.token)).payload, null); assertCleared(db.row);
  }
});
test('encrypted drafts cannot be moved to a different workspace database', async () => {
  const db = storage(), store = await openSessionStore({indexedDB: db.indexedDB}); await store.write(payload(), null);
  const other = await openSessionStore({indexedDB: db.indexedDB, dbName: 'other-workspace'});
  await assert.rejects(other.read(), {code: 'corrupt'});
});
test('a delayed encrypted save cannot overwrite a newer tab or resurrect a deleted draft', async () => {
  for (const operation of ['write', 'clear']) {
    const db = storage(), fast = await openSessionStore({indexedDB: db.indexedDB});
    const first = await fast.write(payload(), null), barrier = gate('encrypt');
    const slow = await openSessionStore({indexedDB: db.indexedDB, crypto: barrier.crypto});
    const stale = payload(); stale.review.note = 'stale';
    const pending = slow.write(stale, first.token); await barrier.reached;
    const latest = payload(); latest.review.note = 'newer';
    const committed = operation === 'clear' ? await fast.clear(first.token) : await fast.write(latest, first.token);
    barrier.release(); await assert.rejects(pending, {code: 'conflict'});
    const loaded = await fast.read(); assert.equal(loaded.token, committed.token); assert.deepEqual(loaded.payload, committed.payload);
  }
});
test('legacy migration retries after another tab saves and never restores the old draft', async () => {
  const original = {token: 'legacy', payload: payload(), updatedAt: 10}, db = storage(original), barrier = gate('encrypt');
  const slow = await openSessionStore({indexedDB: db.indexedDB, crypto: barrier.crypto});
  const reading = slow.read(); await barrier.reached;
  const fast = await openSessionStore({indexedDB: db.indexedDB}), latest = payload(); latest.review.note = 'changed during migration';
  const committed = await fast.write(latest, original.token);
  barrier.release(); const loaded = await reading;
  assert.equal(loaded.token, committed.token); assert.deepEqual(loaded.payload, latest); await assertEncrypted(db.row);
});
test('a decrypting read retries a concurrent save instead of returning or storing stale data', async () => {
  const db = storage(), fast = await openSessionStore({indexedDB: db.indexedDB});
  const first = await fast.write(payload(), null), barrier = gate('decrypt');
  const slow = await openSessionStore({indexedDB: db.indexedDB, crypto: barrier.crypto}); const reading = slow.read(); await barrier.reached;
  const latest = payload(); latest.review.note = 'new revision'; const committed = await fast.write(latest, first.token);
  barrier.release(); const loaded = await reading;
  assert.equal(loaded.token, committed.token); assert.deepEqual(loaded.payload, latest);
});
test('caller mutation during encryption cannot alter the saved snapshot', async () => {
  const db = storage(), barrier = gate('encrypt'), store = await openSessionStore({indexedDB: db.indexedDB, crypto: barrier.crypto});
  const original = payload(), expected = structuredClone(original); const writing = store.write(original, null); await barrier.reached;
  original.review.note = 'changed after save began'; barrier.release(); await writing;
  assert.deepEqual((await store.read()).payload, expected);
});
test('missing Web Crypto refuses saving without plaintext writes', async () => {
  for (const crypto of [null, {}, {randomUUID: () => 'id', getRandomValues: array => array, subtle: {}}]) {
    const db = storage();
    await assert.rejects(async () => { const store = await openSessionStore({indexedDB: db.indexedDB, crypto}); await store.write(payload(), null); }, {code: 'unavailable'});
    assert.equal(db.row, undefined);
  }
});
test('corrupt and incompatible legacy records remain available for explicit deletion', async () => {
  for (const [data, code] of [[{version: 2}, 'incompatible'], [{version: 1}, 'corrupt']]) {
    const original = {token: 'bad', payload: data, updatedAt: 0}, db = storage(original), store = await openSessionStore({indexedDB: db.indexedDB, now: () => 10 * WEEK});
    await assert.rejects(store.read(), {code, token: 'bad'}); assert.deepEqual(db.row, original);
    assert.equal((await store.clear('bad')).payload, null); assertCleared(db.row);
  }
  const original = {token: 'bad-expiry', payload: payload(), updatedAt: 0, expiresAt: 'yesterday'}, db = storage(original), store = await openSessionStore({indexedDB: db.indexedDB});
  await assert.rejects(store.read(), {code: 'corrupt'}); assert.deepEqual(db.row, original);
});
test('unknown encrypted schemas are rejected rather than mistaken for legacy plaintext', async () => {
  const db = storage(), store = await openSessionStore({indexedDB: db.indexedDB}); await store.write(payload(), null);
  const unknown = db.row; unknown.schema = 999; db.row = unknown;
  await assert.rejects(store.read(), error => ['incompatible', 'corrupt'].includes(error.code)); assert.deepEqual(db.row, unknown);
});
test('single-document drafts are encrypted separately and remove their key when expired', async () => {
  const db = storage(); let time = 1000; const store = await openSingleSessionStore({indexedDB: db.indexedDB, now: () => time});
  const single = {version: 1, kind: 'single-editor', source: {name: 'one.csv', data: Buffer.from('Code,Value\nA,1').toString('base64')}, delimiter: ',', sheet: null, review: {kind: 'sheet', version: 1}};
  await store.write(single, null); await assertEncrypted(db.row); assert.deepEqual((await store.read()).payload, single);
  assert.deepEqual(db.names, ['ctt-single-editor-session']); time += WEEK;
  assert.equal((await store.read()).payload, null); assertCleared(db.row);
});
test('schema validation detaches snapshots and refuses incompatible, cyclic, and oversized sources', () => {
  const original = payload(), detached = validateSessionPayload(original); original.review.selected = 'later'; assert.equal(detached.review.selected, undefined);
  assert.throws(() => validateSessionPayload({...payload(), version: 2}), {code: 'incompatible'});
  const cyclic = payload(); cyclic.review.self = cyclic; assert.throws(() => validateSessionPayload(cyclic), {code: 'invalid'});
  const huge = payload(); huge.sources.left.data = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'); assert.throws(() => validateSessionPayload(huge), {code: 'invalid'});
});
