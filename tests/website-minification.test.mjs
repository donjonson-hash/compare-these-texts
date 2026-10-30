import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parse} from 'acorn';
import {WEBSITE_MINIFY_FILES, minifyWebsite} from '../scripts/minify_website.mjs';

// Compare program structure, excluding spelling and source positions. This guards
// global bindings and cross-file calls, which are essential for classic scripts.
function ast(source) {
  return JSON.parse(JSON.stringify(parse(source, {ecmaVersion:'latest', sourceType:'script'}), (key, value) => {
    if (['start', 'end', 'raw'].includes(key)) return undefined;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof RegExp) return {source:value.source, flags:value.flags};
    return value;
  }));
}

test('website minification preserves JavaScript program structure and reduces all audited assets', async () => {
  for (const name of WEBSITE_MINIFY_FILES) {
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
    const output = await readFile(new URL(`../dist/${name}`, import.meta.url), 'utf8');
    assert.ok(Buffer.byteLength(output) < Buffer.byteLength(source), `${name}: must shrink`);
    if (name.endsWith('.js')) assert.deepEqual(ast(output), ast(source), `${name}: program structure`);
  }
});

test('website output is deterministic from unchanged sources', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ctt-minify-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  for (const name of WEBSITE_MINIFY_FILES) await copyFile(new URL(`../src/${name}`, import.meta.url), join(dir, name));
  await minifyWebsite(dir);
  for (const name of WEBSITE_MINIFY_FILES) assert.deepEqual(await readFile(join(dir, name)),
    await readFile(new URL(`../dist/${name}`, import.meta.url)), name);
});
