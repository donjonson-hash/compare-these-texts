import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as original from '../src/pdf-vendor.mjs';
import fontData from '../src/pdf-font.mjs';

async function exportWithSubsetFont(writer) {
  const doc = await writer.PDFDocument.create({updateMetadata: false});
  doc.registerFontkit(writer.fontkit);
  const font = await doc.embedFont(Buffer.from(fontData, 'base64'), {subset: true});
  doc.addPage().drawText('Сумма 125 €', {font});
  return doc.save();
}

test('packaged Firefox writer preserves Unicode font subsetting and PDF output', async t => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const {version} = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
  const temp = await mkdtemp(join(tmpdir(), 'ctt-firefox-pdf-writer-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const archive = join(root, 'dist', 'downloads', `ctt-firefox-${version}.zip`);
  const modulePath = join(temp, 'pdf-vendor.mjs');
  execFileSync('python3', ['-c', [
    'import pathlib, sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    pathlib.Path(sys.argv[2]).write_bytes(archive.read("pdf-vendor.mjs"))',
  ].join('\n'), archive, modulePath]);
  const firefox = await import(pathToFileURL(modulePath).href);
  assert.deepEqual(await exportWithSubsetFont(firefox), await exportWithSubsetFont(original));
});
