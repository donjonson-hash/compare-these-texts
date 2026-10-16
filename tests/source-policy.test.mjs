import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourcePolicyViolations} from '../scripts/check_source_policy.mjs';

test('browser policy catches network aliases, executable text and HTML sinks', () => {
  for (const source of [
    'fetch(url)', 'const request = window.fetch;', 'const {fetch: request} = globalThis;', 'globalThis["WebSocket"]',
    'new Function(code)', '(0, eval)(code)', 'navigator.sendBeacon(url, text)',
    'node.innerHTML = input', 'node["outerHTML"] = input',
    'node.insertAdjacentHTML("beforeend", input)', 'document.write(input)',
    'import("https://example.com/code.mjs")'
  ]) assert.ok(sourcePolicyViolations(source).length, source);
});

test('browser policy permits text-only DOM updates, comments and offline PDF adapters', () => {
  const source = `// eval and fetch in a comment are not executable.
    import {x} from './local.mjs';
    node.textContent = input;
    class NoExternalData { async fetch() { throw new Error('No network'); } }
    const label = 'innerHTML';`;
  assert.deepEqual(sourcePolicyViolations(source), []);
});
