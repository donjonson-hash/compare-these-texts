import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Script, createContext} from 'node:vm';
import original from '../src/emoji-color-vendor.mjs';

test('Firefox loads the selected packaged language on demand and reuses it when switching back', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const {version} = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
  const folder = await mkdtemp(join(tmpdir(), 'ctt-firefox-locales-'));
  t.after(() => rm(folder, {recursive: true, force: true}));
  execFileSync('python3', ['-c', `
import pathlib, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    for name in archive.namelist():
        if name == 'i18n.js' or name.startswith('i18n-') and name.endswith('.mjs'):
            pathlib.Path(sys.argv[2], name).write_bytes(archive.read(name))
`, join(root, 'dist/downloads', `ctt-firefox-${version}.zip`), folder]);
  const context = createContext({URL});
  const runtime = await readFile(join(folder, 'i18n.js'), 'utf8');
  const requested = [];
  new Script(runtime, {importModuleDynamically: specifier => {
    requested.push(specifier);
    return import(pathToFileURL(join(folder, specifier)));
  }}).runInContext(context);
  const api = context.cttI18n;
  await api.ready;
  assert.deepEqual(requested, []);
  const locales = JSON.parse(await readFile(join(root, 'i18n/locales.json'), 'utf8'));
  for (const {code} of locales.filter(locale => locale.code !== 'en')) {
    const count = requested.length;
    assert.equal(await api.setLocale(code), true, code);
    assert.deepEqual(requested.slice(count), [`./i18n-${code}.mjs`]);
  }
  const count = requested.length;
  await api.setLocale('ru');
  assert.equal(api.t('Language'), 'Язык');
  assert.equal(requested.length, count);
});

test('Firefox package preserves every emoji glyph and sequence through bounded static modules; Chrome retains original bytes', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const {version} = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
  const folder = await mkdtemp(join(tmpdir(), 'ctt-firefox-package-'));
  t.after(() => rm(folder, {recursive:true, force:true}));
  execFileSync('python3', ['-c', `
import sys, zipfile, pathlib
root, version, output = sys.argv[1:]
with zipfile.ZipFile(pathlib.Path(root)/'dist/downloads'/f'ctt-firefox-{version}.zip') as z:
    assert z.testzip() is None
    for name in z.namelist():
        if name == 'manifest.json' or name.startswith('emoji-color-') and name.endswith('.mjs'):
            assert '/' not in name
            pathlib.Path(output, name).write_bytes(z.read(name))
with zipfile.ZipFile(pathlib.Path(root)/'dist/downloads'/f'ctt-chrome-{version}.zip') as z:
    assert z.read('emoji-color-vendor.mjs') == pathlib.Path(root, 'src/emoji-color-vendor.mjs').read_bytes()
    assert not any(n.startswith('emoji-color-images-') for n in z.namelist())
`, root, version, folder]);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  assert.equal(manifest.name, JSON.parse(await readFile(join(root, 'release.json'), 'utf8')).short_name);
  assert.ok(manifest.name.length <= 45);
  const modules = (await readdir(folder)).filter(name => name.endsWith('.mjs'));
  assert.ok(modules.filter(name => name.startsWith('emoji-color-images-')).length > 1);
  for (const name of modules) assert.ok((await stat(join(folder, name))).size < 2 * 1024 * 1024, name);
  const packaged = (await import(pathToFileURL(join(folder, 'emoji-color-vendor.mjs')))).default;
  assert.deepEqual(packaged, original, 'every sequence index, PNG byte string and image metric must survive packaging');
});
