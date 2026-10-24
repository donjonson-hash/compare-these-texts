// PDF.js uses URL.parse for link annotations. Chrome 120–125 needs this
// equivalent local fallback; otherwise PDF.js can omit annotation evidence.
if (typeof URL.parse !== 'function') {
  Object.defineProperty(URL, 'parse', {
    configurable: true,
    writable: true,
    value: function parse(input, base) {
      // Web IDL string conversion happens before URL parsing. Keep conversion
      // errors observable instead of treating them as a malformed URL.
      if (arguments.length === 0) throw new TypeError('URL.parse requires a URL.');
      if (typeof input === 'symbol' || typeof base === 'symbol') throw new TypeError('A URL cannot be a symbol.');
      const value = String(input), relativeTo = base === undefined ? undefined : String(base);
      try { return new URL(value, relativeTo); }
      catch { return null; }
    }
  });
}
