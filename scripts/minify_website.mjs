// Website-only output pass. Keep classic script globals and module boundaries intact.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {transform, version as esbuildVersion} from 'esbuild';
import {minify} from 'terser';

const require = createRequire(import.meta.url);
const terserVersion = require('terser/package.json').version;
// Cover the local classic scripts and stylesheets used by the public pages.
// Keep this after extension packaging: offline extension sources stay readable.
export const WEBSITE_MINIFY_FILES = Object.freeze([
  'style.css', 'site.css', 'guides.css', 'office-addins.css', 'i18n.css',
  'compact-review.css', 'i18n.js', 'office.js', 'text-editor.js', 'transport.js',
  'document-demo.js', 'app.js', 'site.js', 'single-entry.js', 'navigation.js',
]);

export async function minifyWebsite(directory) {
  const files = [];
  for (const name of WEBSITE_MINIFY_FILES) {
    const path = resolve(directory, name);
    const source = await readFile(path, 'utf8');
    let code;
    if (name.endsWith('.css')) {
      const result = await transform(source, {
        loader: 'css', minifyWhitespace: true, minifySyntax: false,
        minifyIdentifiers: false, legalComments: 'inline', charset: 'utf8',
        target: 'es2022', sourcefile: name,
      });
      if (result.warnings.length) throw new Error(`Minification warnings in ${name}: ${result.warnings.map(w => w.text).join('; ')}`);
      code = result.code;
    } else {
      // Only print compactly: no compression, renaming, bundling or module conversion.
      const result = await minify({[name]: source}, {
        ecma: 2022, compress: false, mangle: false, module: false, toplevel: false,
        format: {comments: 'some', ascii_only: false, semicolons: true, keep_quoted_props: true},
      });
      code = result.code + '\n';
    }
    await writeFile(path, code);
    files.push({file: name, before_bytes: Buffer.byteLength(source), after_bytes: Buffer.byteLength(code)});
  }
  return {tools: {terser: terserVersion, esbuild: esbuildVersion}, mode: 'whitespace-only', files};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = fileURLToPath(new URL('../dist/', import.meta.url));
  process.stdout.write(JSON.stringify(await minifyWebsite(directory)) + '\n');
}
