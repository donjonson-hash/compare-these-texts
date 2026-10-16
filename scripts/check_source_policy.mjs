/** Narrow regression guard for first-party browser code; not a security audit. */
import {parse} from 'acorn';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const forbidden = new Set(['eval', 'Function', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']);
const htmlSinks = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML']);
const propertyName = node => node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name;

export function sourcePolicyViolations(source) {
  const errors = [];
  const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
  function visit(node, parent, key) {
    if (!node || typeof node !== 'object') return;
    let reason;
    if (node.type === 'Identifier' && forbidden.has(node.name)) {
      // Offline PDF adapters declare a fetch() method which only throws.
      // A declaration/property name is not access to the browser network API.
      const namedKey = key === 'key' && ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent?.type) && !parent.computed && !parent.shorthand;
      const memberKey = parent?.type === 'MemberExpression' && key === 'property' && !parent.computed;
      if (!namedKey && !memberKey) reason = `forbidden browser API: ${node.name}`;
    }
    if (node.type === 'MemberExpression') {
      const name = propertyName(node);
      if (forbidden.has(name) || htmlSinks.has(name)) reason = `forbidden browser member: ${name}`;
      if (['write', 'writeln'].includes(name) && node.object.type === 'Identifier' && node.object.name === 'document') reason = 'document.write is forbidden';
    }
    if (node.type === 'Property' && parent?.type === 'ObjectPattern') {
      const name = node.computed ? node.key.value : (node.key.name ?? node.key.value);
      if (forbidden.has(name)) reason = `forbidden browser API alias: ${name}`;
    }
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      if (node.source && !node.source.value.startsWith('./')) reason = 'browser imports must be relative local modules';
    }
    if (node.type === 'ImportExpression' && node.source.type === 'Literal' && !String(node.source.value).startsWith('./')) reason = 'dynamic imports must be local';
    if (reason) errors.push(`${node.loc.start.line}:${node.loc.start.column + 1} ${reason}`);
    for (const [childKey, value] of Object.entries(node)) {
      if (childKey === 'loc') continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, node, childKey));
      else if (value && typeof value === 'object') visit(value, node, childKey);
    }
  }
  visit(ast);
  return errors;
}

function checkDirectory(directory) {
  const errors = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) errors.push(...checkDirectory(name));
    else if (/\.(?:m?js)$/.test(name) && !entry.name.endsWith('-vendor.mjs') && !['pdf-font.mjs', 'sheet-pdf-font.mjs', 'word-font-bold.mjs', 'sheet-emoji-font.mjs'].includes(entry.name)) {
      errors.push(...sourcePolicyViolations(readFileSync(name, 'utf8')).map(error => `${name}:${error}`));
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const errors = ['src', 'extension-package'].flatMap(dir => checkDirectory(path.join(root, dir)));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('PASS: first-party browser API policy (vendor code checked separately)');
}
