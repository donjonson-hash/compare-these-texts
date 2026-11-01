import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(readFileSync(new URL('../release.json', import.meta.url), 'utf8'));
const inspect = `
import json,sys,zipfile
z=zipfile.ZipFile(sys.argv[1])
print(json.dumps({'names':z.namelist(),'manifest':json.loads(z.read('manifest.json'))}))
`;
const read = archive => JSON.parse(execFileSync('python3', ['-c', inspect, archive], {cwd: root, encoding: 'utf8', maxBuffer: 1 << 24}));

test('Edge package is the Chrome build with English store metadata within the name limit', () => {
  execFileSync('python3', ['scripts/package_edge.py'], {cwd: root, stdio: 'pipe'});
  const edge = read(`artifacts/ctt-edge-${release.version}.zip`);
  const chrome = read(`dist/downloads/ctt-chrome-${release.version}.zip`);
  assert.ok(edge.manifest.name.startsWith('Compare Two Texts — '));
  assert.ok([...edge.manifest.name].length <= 45, edge.manifest.name);
  assert.equal(edge.manifest.description, release.description);
  assert.equal(edge.manifest.version, release.version);
  assert.equal(edge.manifest.homepage_url, 'https://comparetwotexts.pro/');
  assert.equal('default_locale' in edge.manifest, false);
  assert.doesNotMatch(JSON.stringify(edge.manifest), /__MSG_/);
  assert.deepEqual(edge.manifest.content_security_policy, chrome.manifest.content_security_policy);
  assert.deepEqual(edge.manifest.background, chrome.manifest.background);
  assert.equal('permissions' in edge.manifest, 'permissions' in chrome.manifest);
  assert.deepEqual(edge.names.toSorted(), chrome.names.filter(name => !name.startsWith('_locales/')).toSorted());
});
