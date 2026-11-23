/* Shared by the deferred browser UI and the isolated comparison worker. */
(() => {
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const maxEncodedLength = (bytes = MAX_FILE_BYTES) => 4 * Math.ceil(bytes / 3);

  function isValidEncodedSource(data) {
    if (typeof data !== 'string' || data.length > maxEncodedLength() || data.length % 4) return false;
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    return data.length / 4 * 3 - padding <= MAX_FILE_BYTES && !/[^A-Za-z0-9+/=]/.test(data)
      && data.indexOf('=') === (padding ? data.length - padding : -1);
  }

  function decodeBase64Bytes(data) {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(data);
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function encodeBase64Bytes(bytes) {
    if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
    // Chunk on triples so independently encoded chunks have no interior padding.
    const parts = [], chunkSize = 3 * 8192;
    for (let start = 0; start < bytes.length; start += chunkSize) {
      parts.push(btoa(String.fromCharCode(...bytes.subarray(start, start + chunkSize))));
    }
    return parts.join('');
  }

  globalThis.cttFileLimits = Object.freeze({MAX_FILE_BYTES, maxEncodedLength, isValidEncodedSource, decodeBase64Bytes, encodeBase64Bytes});
})();
