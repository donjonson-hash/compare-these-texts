/** Rebuild the pinned, offline PDF.js reader. See src/PDF-READER-SOURCE.md. */
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencies = resolve(process.argv[2] || '/tmp/ctt-pdf-reader');
const checkOnly = process.argv.includes('--check');
const require = createRequire(join(dependencies, 'package.json'));
const {build} = require('esbuild');
const packagePath = dirname(require.resolve('pdfjs-dist/package.json'));
const metadata = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8'));
if (metadata.version !== '6.3.289') throw new Error('Expected pdfjs-dist 6.3.289');
if (require('esbuild/package.json').version !== '0.25.12') throw new Error('Expected esbuild 0.25.12');
const scratch = await mkdtemp(join(tmpdir(), 'ctt-pdf-vendor-'));
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Patch must match exactly once: ${before.slice(0, 90)}`);
  return source.replace(before, after);
}
try {
  let worker = await readFile(join(packagePath, 'build/pdf.worker.mjs'), 'utf8');
  const display = await readFile(join(packagePath, 'build/pdf.mjs'), 'utf8');
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  if (sha256(worker) !== 'f2870db902eaff8397442c912b69459980ac91f6f4b5ed827167b12cf7057930' || sha256(display) !== '495588717f62303a839e91a5343deebf1b41f52e2f9f6361e73dee6ea6a4355e') throw new Error('Upstream PDF.js source checksum mismatch');
  // The application already owns the real Worker and its message listener.
  worker = replaceOnce(worker, 'if (typeof window === "undefined" && !isNodeJS && typeof self !== "undefined" && typeof self.postMessage === "function" && "onmessage" in self) {\n      this.initializeFromPort(self);\n    }', '/* Kristina: explicit in-process handler; preserve the application Worker listener. */');
  // Keep upstream text extraction: skip raster/inline images, recurse into Form XObjects.
  // No rendering or image comparison is requested; scope is disclosed by the importer.
  // ErrorFont normally returns no glyphs: that would silently discard source text.
  worker = replaceOnce(worker, 'const font = textState.font;\n      const baseCharSpacing', 'const font = textState.font;\n      if (font.error) { throw new FormatError("PDF: не удалось прочитать шрифт и сопоставить символы Unicode."); }\n      if (font.isType3Font) { throw new FormatError("PDF: графические шрифты Type3 не поддерживаются."); }\n      const baseCharSpacing');
  // Never substitute an unmapped PDF character code as a Unicode character.
  worker = replaceOnce(worker, 'let unicode = this.toUnicode.get(charcode) || charcode;', 'let unicode = this.toUnicode.get(charcode);\n    if (typeof unicode !== "string" || !unicode.length) { throw new FormatError("PDF: отсутствует пригодное сопоставление символов Unicode."); }');
  // Bound decompression before allocating expanded streams (fonts or page content).
  worker = replaceOnce(worker, 'ensureBuffer(requested) {\n    const buffer = this.buffer;', 'ensureBuffer(requested) {\n    if (requested > 32 * 1024 * 1024 || this.minBufferLength > 32 * 1024 * 1024) { throw new FormatError("PDF: распакованный поток превышает 32 МиБ. Разделите документ."); }\n    const buffer = this.buffer;');
  worker = replaceOnce(worker, 'const glyphs = font.charsToGlyphs(chars);\n      const scale =', 'if (chars.length > 500000) { throw new FormatError("PDF: текстовый фрагмент превышает 500000 символов. Разделите документ."); }\n      const glyphs = font.charsToGlyphs(chars);\n      const scale =');
  await writeFile(join(scratch, 'worker.mjs'), worker);
  await writeFile(join(scratch, 'display.mjs'), display);
  await writeFile(join(scratch, 'compat.mjs'), `
if (!Promise.try) Object.defineProperty(Promise, 'try', {configurable: true, writable: true, value: function (callback, ...args) { return new this(resolve => resolve(callback(...args))); }});
if (!Promise.withResolvers) Object.defineProperty(Promise, 'withResolvers', {configurable: true, writable: true, value: function () { let resolve, reject; const promise = new this((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; }});
if (!Uint8Array.prototype.toHex) Object.defineProperty(Uint8Array.prototype, 'toHex', {configurable: true, writable: true, value: function () { return Array.from(this, byte => byte.toString(16).padStart(2, '0')).join(''); }});
if (!Map.prototype.getOrInsertComputed) Object.defineProperty(Map.prototype, 'getOrInsertComputed', {configurable: true, writable: true, value: function (key, callback) { if (this.has(key)) return this.get(key); const value = callback(key); this.set(key, value); return value; }});
if (!Map.prototype.getOrInsert) Object.defineProperty(Map.prototype, 'getOrInsert', {configurable: true, writable: true, value: function (key, value) { if (this.has(key)) return this.get(key); this.set(key, value); return value; }});
`);
  await writeFile(join(scratch, 'entry.mjs'), 'import "./compat.mjs";\nimport {getDocument} from "./display.mjs";\nimport {WorkerMessageHandler} from "./worker.mjs";\nglobalThis.pdfjsWorker = {WorkerMessageHandler};\nexport {getDocument};\n');
  const result = await build({write: false, entryPoints: [join(scratch, 'entry.mjs')], outfile: join(root, 'src/pdf-reader-vendor.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none', banner: {js: '/* PDF.js 6.3.289, Apache-2.0. Modified for offline text extraction; see PDF-READER-SOURCE.md and PDF-READER-LICENSE.txt. */'}});
  let bundled = result.outputFiles[0].text;
  if (sha256(bundled) !== 'dcd3cd61840406b08cef5c57dcd6552de5ee3be67e80e2c6314ecb427ac512aa') {
    throw new Error('Pre-0.33.4 PDF.js bundle checksum mismatch; no asset was written');
  }
  // Preserve the exact six integer-only compatibility replacements shipped in 0.33.4.
  // Other Math.sumPrecise calls may sum floating-point values and must stay unchanged.
  for (const expression of [
    'Math.sumPrecise(c.map(d=>d.length))',
    'Math.sumPrecise(this.glyphs.map(e=>e.getSize()+3&-4))',
    'Math.sumPrecise(this.composites.map(t=>t.getSize()))',
    'Math.sumPrecise(m.map(w=>w.length))',
    'Math.sumPrecise(s.map(w=>w.length))',
    'Math.sumPrecise(i.map(w=>w.length))',
  ]) bundled = replaceOnce(bundled, expression, expression.replace('Math.sumPrecise', 'pdfIntegerSum'));
  bundled = '// Compatibility for integer-only font sizes and DOM lengths in older browsers.\n' +
    'const pdfIntegerSum=values=>values.reduce((sum,value)=>sum+value,0);\n' + bundled;
  const expected = '599b1521b3c10f542ef254afee75ba2d9cbda0bb8d92ca4c27eef5d7fd977da7';
  if (sha256(bundled) !== expected) throw new Error('Final PDF.js bundle checksum mismatch; no asset was written');
  const license = await readFile(join(packagePath, 'LICENSE'));
  if (checkOnly) {
    if (sha256(await readFile(join(root, 'src/pdf-reader-vendor.mjs'))) !== expected) {
      throw new Error('Committed PDF.js bundle differs from the rebuilt asset');
    }
    if (!(await readFile(join(root, 'src/PDF-READER-LICENSE.txt'))).equals(license)) {
      throw new Error('Committed PDF.js license differs from the package license');
    }
  } else {
    await writeFile(join(root, 'src/pdf-reader-vendor.mjs'), bundled);
    await writeFile(join(root, 'src/PDF-READER-LICENSE.txt'), license);
  }
  console.log(`PDF.js 6.3.289: exact-byte rebuild ${checkOnly ? 'verified' : 'written'} (${expected})`);
} finally {
  await rm(scratch, {recursive: true, force: true});
}
