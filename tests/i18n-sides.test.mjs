import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checker = path.join(root,'scripts/check_i18n_sides.py');
const sources = JSON.parse(await readFile(path.join(root,'i18n/source.json'),'utf8'));
test('side-label gate protects version identity and numeric direction without treating English articles as identifiers', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(),'ctt-side-labels-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  await mkdir(path.join(temporary,'catalogs'));
  await mkdir(path.join(temporary,'overrides'));
  await writeFile(path.join(temporary,'source.json'),JSON.stringify(sources));
  await writeFile(path.join(temporary,'locales.json'),JSON.stringify([{code:'en'},{code:'fr'}]));
  await writeFile(path.join(temporary,'catalogs/fr.json'),JSON.stringify(sources));
  const override = path.join(temporary,'overrides/fr.json');
  const run = changes => writeFile(override,JSON.stringify(changes)).then(()=>spawnSync('python3',[checker,'--catalog-root',temporary],{encoding:'utf8'}));
  // Translating an English article does not remove a document-side identifier.
  let result = await run({'e32960dc32e6':'Un document DOCX est requis.'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  result = await run({'c1bfac6be75d':'Uniquement dans А'}); // Cyrillic look-alike, not Latin A.
  assert.equal(result.status,1); assert.match(result.stdout,/Missing literal side identifiers/);
  result = await run({'0861c57e9790':'A − B'});
  assert.equal(result.status,1); assert.match(result.stdout,/Difference formula must retain B − A/);
  result = await run({'a430210e24c4':'{0}: A {2} → B {1}; B − A: {3} {4}.'});
  assert.equal(result.status,1); assert.match(result.stdout,/Side A must remain attached to value/);
  // Chinese row nouns and paired em-dashes preserve the relationship and are valid.
  result = await run({'17fd1b3c3c44':'A——{0}； B — {1}。','789eabd12e3d':'{0}：A {1} = {2} → B {3} = {4}（A 行 {5}、B 行 {6}）。'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  // Reviewed overrides take precedence over an unsafe machine-generated base.
  const base = {...sources,'c1bfac6be75d':'Uniquement dans А'};
  await writeFile(path.join(temporary,'catalogs/fr.json'),JSON.stringify(base));
  result = await run({'c1bfac6be75d':'Uniquement dans A'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
