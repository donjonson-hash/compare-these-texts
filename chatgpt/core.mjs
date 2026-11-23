/** Stateless ChatGPT adapter for the existing bounded CTT diff engine. */
import {diffTextSegments} from '../src/text-diff.mjs';

export const MAX_TEXT_LENGTH = 30000;
const VERSION = 'ctt-chatgpt-exact-v1';

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Provide an input object.');
}

function wellFormed(value) {
  // TextEncoder replaces unpaired surrogates. Reject them so distinct input
  // strings can never silently become the same encoded text or digest.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function text(value, name, limit = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string.`);
  if (value.length > limit) throw new RangeError(`${name} exceeds ${limit.toLocaleString('en-US')} UTF-16 code units.`);
  if (!wellFormed(value)) throw new TypeError(`${name} contains an unpaired Unicode surrogate.`);
  return value;
}

function filename(value, fallback) {
  if (value === undefined) return fallback;
  text(value, 'Document name', 200);
  if (!value.trim() || /[\r\n\0]/u.test(value)) throw new TypeError('Document name must be nonempty and contain no line breaks or NUL.');
  return value;
}

function summary(changes) {
  return {
    total: changes.length,
    insertions: changes.filter(change => change.kind === 'insert').length,
    deletions: changes.filter(change => change.kind === 'delete').length,
    replacements: changes.filter(change => change.kind === 'replace').length,
  };
}

function lineIndex(value) {
  const starts = [0];
  for (const match of value.matchAll(/\r\n|\r|\n/gu)) starts.push(match.index + match[0].length);
  return offset => {
    let low = 0, high = starts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= offset) low = middle + 1;
      else high = middle;
    }
    return low;
  };
}

function cursor(parts) {
  let index = 0, offset = 0, position = 0;
  function skipEmpty() {
    while (index < parts.length && offset === parts[index].text.length) { index++; offset = 0; }
  }
  return {
    get position() { return position; },
    get current() { skipEmpty(); return parts[index]; },
    get rest() { skipEmpty(); return parts[index]?.text.slice(offset) || ''; },
    take(count) {
      const value = parts[index].text.slice(offset, offset + count);
      offset += count; position += count; skipEmpty();
      return value;
    },
  };
}

/** All offsets are UTF-16 indices into the unchanged input strings. */
export async function compareTexts(input) {
  object(input);
  const original = text(input.original, 'original'), revised = text(input.revised, 'revised');
  const originalName = filename(input.originalName, 'original.txt');
  const revisedName = filename(input.revisedName, 'revised.txt');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([VERSION, original, revised])));
  const comparisonId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const budget = {used: 0, fallback: 0};
  const segments = diffTextSegments(original, revised, budget);
  const left = cursor(segments.left), right = cursor(segments.right), changes = [];
  const originalLine = lineIndex(original), revisedLine = lineIndex(revised);

  // The engine coalesces adjacent equal tokens separately on each side. Walk
  // both streams together and split equal runs at the shorter boundary. This
  // preserves insertion/deletion anchors even inside a coalesced equal run.
  while (left.current || right.current) {
    const originalStart = left.position, revisedStart = right.position;
    let before = '', after = '';
    while (left.current?.changed) before += left.take(left.rest.length);
    while (right.current?.changed) after += right.take(right.rest.length);
    if (before || after) {
      changes.push({
        id: `change-${changes.length + 1}`,
        kind: before && after ? 'replace' : before ? 'delete' : 'insert',
        originalStart, originalEnd: left.position,
        revisedStart, revisedEnd: right.position,
        before, after,
        originalLine: originalLine(originalStart), revisedLine: revisedLine(revisedStart),
      });
    }
    if (!left.current && !right.current) break;
    const count = Math.min(left.rest.length, right.rest.length);
    if (!count || left.current?.changed || right.current?.changed || left.rest.slice(0, count) !== right.rest.slice(0, count)) {
      throw new Error('The comparison engine returned inconsistent unchanged segments.');
    }
    left.take(count); right.take(count);
  }

  return {comparisonId, original, revised, originalName, revisedName, changes, summary: summary(changes), coarse: budget.fallback > 0};
}

/** Recompute and verify every selected patch; never trust caller offsets. */
export async function applyTextChanges(input) {
  object(input);
  if (typeof input.comparisonId !== 'string' || !/^[a-f0-9]{64}$/u.test(input.comparisonId)) throw new TypeError('Provide the comparisonId returned by compare_texts.');
  if (!Array.isArray(input.changeIds) || input.changeIds.some(id => typeof id !== 'string')) throw new TypeError('changeIds must be an array of change ID strings.');
  if (new Set(input.changeIds).size !== input.changeIds.length) throw new TypeError('changeIds contains duplicate IDs.');
  const comparison = await compareTexts(input);
  if (input.comparisonId !== comparison.comparisonId) throw new Error('The comparison is stale. Compare these exact texts again before applying changes.');
  const byId = new Map(comparison.changes.map(change => [change.id, change]));
  for (const id of input.changeIds) if (!byId.has(id)) throw new Error(`Unknown change ID: ${id}.`);
  const selected = new Set(input.changeIds);
  const changes = comparison.changes.filter(change => selected.has(change.id));
  let position = 0;
  const parts = [];
  for (const change of changes) {
    parts.push(comparison.original.slice(position, change.originalStart), change.after);
    position = change.originalEnd;
  }
  parts.push(comparison.original.slice(position));
  return {
    comparisonId: comparison.comparisonId,
    appliedChangeIds: changes.map(change => change.id),
    result: parts.join(''),
    summary: summary(changes),
  };
}
