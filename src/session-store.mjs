/* One local review, with transaction-level ownership across extension tabs. */
const DB_NAME = 'kristina-review-session', STORE = 'session', KEY = 'current';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024, MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const failure = (code, message, details = {}) => Object.assign(new Error(message), {code, ...details});
const tokenOf = row => typeof row?.token === 'string' ? row.token : null;
const empty = () => ({token: null, payload: null, updatedAt: null});

/** Validate and detach the snapshot before an asynchronous write can start. */
export function validateSessionPayload(payload) {
  if (!object(payload)) throw failure('invalid', "Could not save your work: invalid data.");
  if (payload.version !== 1) throw failure('incompatible', "This work was saved by a different version of Compare Two Texts.");
  const invalid = () => { throw failure('invalid', "Could not save your work: invalid data."); };
  if (!object(payload.sources) || !object(payload.review) || !object(payload.report)) invalid();
  for (const side of ['left', 'right']) {
    const source = payload.sources[side];
    if (!object(source) || typeof source.name !== 'string' || !source.name.length || source.name.length > 4096 || typeof source.data !== 'string') invalid();
    const data = source.data;
    if (data.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4 || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) invalid();
    const bytes = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (bytes > MAX_SOURCE_BYTES) invalid();
  }
  const report = payload.report;
  if (report.kind === 'text') {
  if (report.status !== 'complete' || !object(report.sources)) invalid();
  for (const side of ['left', 'right']) if (!object(report.sources[side]) || !['txt', 'pdf', 'docx'].includes(report.sources[side].format)) invalid();
  let count = 0;
  const keys = new Set();
  for (const category of ['matched', 'changed', 'only_left', 'only_right', 'moved', 'reflow']) {
    const groups = report[category];
    if (groups === undefined && ['moved', 'reflow'].includes(category)) continue;
    if (!Array.isArray(groups) || (count += groups.length) > 4000) invalid();
    for (const group of groups) {
      if (!object(group) || typeof group.key !== 'string' || !/^text-\d+$/.test(group.key) || keys.has(group.key)) invalid();
      keys.add(group.key);
      const blocks = category === 'only_left' || category === 'only_right' ? [group.row] : [group.left, group.right];
      for (const block of blocks) {
        if (!object(block) || typeof block.text !== 'string' || !Number.isSafeInteger(block.record) || block.record < 1) invalid();
        if (block.source_blocks !== undefined && (!Array.isArray(block.source_blocks) || block.source_blocks.length > 2000 || block.source_blocks.some(part => !object(part) || typeof part.text !== 'string' || !Number.isSafeInteger(part.record) || part.record < 1))) invalid();
      }
    }
  }
  } else {
    if (report.kind !== undefined || report.status !== 'complete' || !object(report.sources) || !object(report.rules) || payload.review.kind !== 'sheet') invalid();
    if (!Array.isArray(report.rules.key) || report.rules.key.length !== 2 || !Array.isArray(report.rules.fields) || report.rules.fields.length > 200 || ![',',';','\t'].includes(report.rules.delimiter)) invalid();
    for (const side of ['left','right']) {
      const meta=report.sources[side];
      if (!object(meta) || ![undefined,'csv','xlsx'].includes(meta.format) || !Array.isArray(meta.headers) || !meta.headers.length || meta.headers.length > 200 || meta.headers.some(h=>typeof h!=='string') || new Set(meta.headers).size!==meta.headers.length) invalid();
    }
    let count=0; const keys=new Set();
    for (const category of ['matched','changed','only_left','only_right']) {
      if (!Array.isArray(report[category]) || (count+=report[category].length)>10000) invalid();
      for (const group of report[category]) {
        if (!object(group) || typeof group.key!=='string' || keys.has(group.key)) invalid(); keys.add(group.key);
        const blocks=category.startsWith('only_')?[group.row]:[group.left,group.right];
        for (const block of blocks) if (!object(block) || !Number.isSafeInteger(block.record) || block.record<2 || !object(block.values) || Object.values(block.values).some(v=>typeof v!=='string')) invalid();
      }
    }
  }
  let serialized;
  try { serialized = JSON.stringify(payload); } catch { invalid(); }
  if (serialized.length > MAX_PAYLOAD_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) throw failure('invalid', "This work is too large to save.");
  return JSON.parse(serialized);
}

// The key is local to this browser profile. Non-extractability prevents raw-key
// export; it does not protect against code already running in the same origin.
const SCHEMA = 2, READ_ATTEMPTS = 8;
const corrupt = row => failure('corrupt', "Could not decrypt the saved work. You can delete it and open your documents again.", {token: tokenOf(row), updatedAt: row?.updatedAt});
const conflict = () => failure('conflict', "This work changed in another window. Reopen the saved version.");
const fields = (row, allowed) => Object.keys(row).every(key => allowed.includes(key));
const isBytes = (value, length) => value instanceof Uint8Array && value.byteLength === length;

function checkedHeader(row) {
  if (!object(row) || !tokenOf(row) || !Number.isSafeInteger(row.updatedAt) || row.updatedAt < 0) throw corrupt(row);
  if (row.expiresAt !== undefined && (!Number.isSafeInteger(row.expiresAt) || row.expiresAt < 0)) throw corrupt(row);
  if (Object.hasOwn(row, 'schema') && row.schema !== SCHEMA) throw failure('incompatible', "This work was saved by a different version of Compare Two Texts.", {token: row.token, updatedAt: row.updatedAt});
  if (row.schema === SCHEMA) {
    if (row.payload === null && fields(row, ['schema', 'token', 'updatedAt', 'payload'])) return 'empty';
    if (!fields(row, ['schema', 'token', 'updatedAt', 'expiresAt', 'revision', 'iv', 'ciphertext', 'key']) || typeof row.revision !== 'string' || !row.revision || !Number.isSafeInteger(row.expiresAt) || !isBytes(row.iv, 12) || !(row.ciphertext instanceof ArrayBuffer) || row.ciphertext.byteLength < 16 || row.ciphertext.byteLength > MAX_PAYLOAD_BYTES + 16) throw corrupt(row);
    const key = row.key;
    if (!key || key.type !== 'secret' || key.extractable !== false || key.algorithm?.name !== 'AES-GCM' || key.algorithm?.length !== 256 || !Array.isArray(key.usages) || key.usages.length !== 2 || !key.usages.includes('encrypt') || !key.usages.includes('decrypt')) throw corrupt(row);
    return 'encrypted';
  }
  // Only the known v1 shape is eligible for migration. A damaged/future sealed
  // envelope must never be mistaken for an unencrypted draft.
  if (!fields(row, ['token', 'updatedAt', 'expiresAt', 'payload']) || !Object.hasOwn(row, 'payload')) throw corrupt(row);
  return row.payload === null ? 'empty' : 'legacy';
}

function validatedStoredPayload(payload, row, validatePayload) {
  try { return validatePayload(payload); }
  catch (error) {
    if (error.code === 'incompatible') throw failure('incompatible', error.message, {token: row.token, updatedAt: row.updatedAt});
    throw corrupt(row);
  }
}

// read() renews retention without changing editor ownership. The independent
// encryption revision detects a concurrent migration/renewal with the same token.
function sameSnapshot(a, b) {
  if (a === undefined || b === undefined) return a === b;
  return ['schema', 'token', 'revision', 'updatedAt', 'expiresAt'].every(key => a?.[key] === b?.[key]);
}

export async function openSessionStore({indexedDB = globalThis.indexedDB, dbName = DB_NAME, validatePayload = validateSessionPayload, now = Date.now, crypto = globalThis.crypto} = {}) {
  if (!indexedDB?.open) throw failure('unavailable', "Your browser does not allow saving work on this device.");
  const db = await new Promise((resolve, reject) => {
    let request, settled = false;
    try { request = indexedDB.open(dbName, SCHEMA); } catch (error) { reject(error); return; }
    // Upgrading closes older app connections through their onversionchange
    // handler. Old code cannot reopen version 1 and resume plaintext writes.
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => { settled = true; reject(request.error); };
    request.onblocked = () => { settled = true; reject(failure('blocked', "Close other Compare Two Texts windows and try again.")); };
    request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
  });
  let closed = false;
  const close = () => { closed = true; db.close(); };
  db.onversionchange = close;
  db.onclose = () => { closed = true; };

  function transaction(mode, action) {
    return new Promise((resolve, reject) => {
      if (closed) { reject(failure('unavailable', "Saving is unavailable. Reopen Compare Two Texts.")); return; }
      let tx, result, reason;
      try { tx = db.transaction(STORE, mode); } catch (error) { reject(error); return; }
      const abort = error => { reason = error; try { tx.abort(); } catch { reject(error); } };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(reason || tx.error || failure('unavailable', "Could not save your work."));
      tx.onerror = () => {};
      try { action(tx.objectStore(STORE), value => { result = value; }, abort); } catch (error) { abort(error); }
    });
  }

  function encryptionUnavailable(row) {
    return failure('unavailable', "Encrypted saving is unavailable in this browser. Download your documents before closing and use HTTPS or the installed extension.", {token: tokenOf(row), updatedAt: row?.updatedAt, encryptionUnavailable: true});
  }
  function encryptionApi(row) {
    if (!crypto?.getRandomValues || !crypto.subtle?.generateKey || !crypto.subtle?.encrypt || !crypto.subtle?.decrypt) throw encryptionUnavailable(row);
    return crypto.subtle;
  }
  function newToken() {
    if (!crypto?.getRandomValues) throw encryptionUnavailable();
    // getRandomValues is also available for explicitly deleting a draft when
    // SubtleCrypto is unavailable. Tokens are ownership IDs, not encryption keys.
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function timestamp() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + SESSION_TTL_MS)) throw failure('unavailable', "Could not save your work: invalid device time.");
    return value;
  }
  function additionalData(row) {
    return new TextEncoder().encode(JSON.stringify(['CTT saved draft', dbName, row.schema, row.token, row.updatedAt, row.expiresAt, row.revision]));
  }
  async function seal(payload, metadata) {
    const subtle = encryptionApi(metadata);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    if (plaintext.byteLength > MAX_PAYLOAD_BYTES) throw failure('invalid', "This work is too large to save.");
    try {
      const row = {...metadata, schema: SCHEMA, revision: newToken(), iv: crypto.getRandomValues(new Uint8Array(12))};
      row.key = await subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      row.ciphertext = await subtle.encrypt({name: 'AES-GCM', iv: row.iv, additionalData: additionalData(row), tagLength: 128}, row.key, plaintext);
      checkedHeader(row);
      return row;
    } catch { throw encryptionUnavailable(metadata); }
    finally { plaintext.fill(0); }
  }
  async function unseal(row) {
    const subtle = encryptionApi(row);
    let plaintext;
    try {
      plaintext = new Uint8Array(await subtle.decrypt({name: 'AES-GCM', iv: row.iv, additionalData: additionalData(row), tagLength: 128}, row.key, row.ciphertext));
      const payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(plaintext));
      return validatedStoredPayload(payload, row, validatePayload);
    } catch (error) {
      if (error.code === 'incompatible') throw error;
      throw corrupt(row);
    } finally { plaintext?.fill(0); }
  }
  const publicRow = (row, payload) => ({token: row.token, payload, updatedAt: row.updatedAt});
  const tombstone = () => ({schema: SCHEMA, token: newToken(), payload: null, updatedAt: timestamp()});

  function load() {
    // Expiration and its tombstone commit are atomic. No async crypto runs while
    // an IndexedDB transaction is active, avoiding premature auto-commit.
    return transaction('readwrite', (store, done, abort) => {
      const request = store.get(KEY);
      request.onsuccess = () => {
        try {
          const saved = request.result;
          if (saved === undefined) { done(undefined); return; }
          const kind = checkedHeader(saved);
          if (kind !== 'empty' && saved.expiresAt !== undefined && timestamp() >= saved.expiresAt) {
            const cleared = tombstone(); store.put(cleared, KEY); done(cleared); return;
          }
          done(saved);
        } catch (error) { abort(error); }
      };
    });
  }
  function renew(snapshot, sealed) {
    return transaction('readwrite', (store, done, abort) => {
      const request = store.get(KEY);
      request.onsuccess = () => {
        try {
          if (!sameSnapshot(request.result, snapshot)) { done(false); return; }
          store.put(sealed, KEY); done(true);
        } catch (error) { abort(error); }
      };
    });
  }
  async function read() {
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      const saved = await load();
      if (saved === undefined) return empty();
      const kind = checkedHeader(saved);
      if (kind === 'empty') return publicRow(saved, null);
      const payload = kind === 'encrypted' ? await unseal(saved) : validatedStoredPayload(saved.payload, saved, validatePayload);
      // A valid legacy draft is encrypted before replacement. Failure leaves the
      // previous bytes intact and is surfaced, never reported as a saved draft.
      const sealed = await seal(payload, {token: saved.token, updatedAt: saved.updatedAt, expiresAt: timestamp() + SESSION_TTL_MS});
      if (await renew(saved, sealed)) return publicRow(saved, payload);
      // Another tab saved/cleared/refreshed during crypto; load its committed row.
    }
    throw conflict();
  }
  async function replace(payload, expectedToken) {
    if (expectedToken !== null && typeof expectedToken !== 'string') throw conflict();
    const updatedAt = timestamp(), token = newToken();
    const row = payload === null ? {schema: SCHEMA, token, payload: null, updatedAt} : await seal(payload, {token, updatedAt, expiresAt: updatedAt + SESSION_TTL_MS});
    return transaction('readwrite', (store, done, abort) => {
      const request = store.get(KEY);
      request.onsuccess = () => {
        try {
          if (tokenOf(request.result) !== expectedToken) { abort(conflict()); return; }
          store.put(row, KEY); done(publicRow(row, payload));
        } catch (error) { abort(error); }
      };
    });
  }
  return {read, async write(payload, expectedToken) { return replace(validatePayload(payload), expectedToken); }, clear(expectedToken) { return replace(null, expectedToken); }, close};
}
