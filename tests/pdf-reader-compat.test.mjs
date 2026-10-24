import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const compatibility = readFileSync(new URL('../src/pdf-reader-compat.mjs', import.meta.url), 'utf8');

test('URL.parse fallback preserves URL resolution, invalid input and conversion failures', () => {
  class LegacyURL extends URL {}
  Object.defineProperty(LegacyURL, 'parse', {value: undefined, configurable: true});
  const context = vm.createContext({URL: LegacyURL});
  vm.runInContext(compatibility, context);
  assert.equal(LegacyURL.parse('../guide', 'https://example.com/help/start').href, 'https://example.com/guide');
  assert.equal(LegacyURL.parse('mailto:test@example.com').href, 'mailto:test@example.com');
  assert.equal(LegacyURL.parse('/relative'), null);
  assert.equal(LegacyURL.parse('https://['), null);
  assert.throws(() => LegacyURL.parse(), /requires a URL/);
  assert.throws(() => LegacyURL.parse(Symbol('url')), /symbol/);
  const conversionFailure = new Error('conversion failed');
  assert.throws(() => LegacyURL.parse({toString() {throw conversionFailure;}}), error => error === conversionFailure);
  assert.equal(Object.prototype.propertyIsEnumerable.call(LegacyURL, 'parse'), false);
  const installed = LegacyURL.parse;
  vm.runInContext(compatibility, context);
  assert.equal(LegacyURL.parse, installed, 're-importing must preserve the existing implementation');
  const native = URL.parse;
  vm.runInContext(compatibility, vm.createContext({URL}));
  assert.equal(URL.parse, native, 'a supported browser keeps its native URL.parse');
});

test('PDF links retain scope warnings and reject unsupported actions without native URL.parse', () => {
  // Run the existing end-to-end link import/edit/export tests in a clean realm.
  // Without the compatibility entry these four tests fail: link evidence and
  // chained-action rejection silently disappear inside PDF.js.
  const result = spawnSync(process.execPath, [
    '--import', 'data:text/javascript,delete URL.parse;',
    '--test', fileURLToPath(new URL('./pdf-links.test.mjs', import.meta.url))
  ], {encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});
