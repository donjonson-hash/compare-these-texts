import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import original from '../src/emoji-color-vendor.mjs';

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
  assert.equal(manifest.name, 'Compare Two Texts — Diff Checker');
  assert.ok(manifest.name.length <= 45);
  const modules = (await readdir(folder)).filter(name => name.endsWith('.mjs'));
  assert.ok(modules.filter(name => name.startsWith('emoji-color-images-')).length > 1);
  for (const name of modules) assert.ok((await stat(join(folder, name))).size < 2 * 1024 * 1024, name);
  const packaged = (await import(pathToFileURL(join(folder, 'emoji-color-vendor.mjs')))).default;
  assert.deepEqual(packaged, original, 'every sequence index, PNG byte string and image metric must survive packaging');
});
