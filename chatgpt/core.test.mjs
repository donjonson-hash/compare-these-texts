import test from 'node:test';
import assert from 'node:assert/strict';
import {compareTexts, applyTextChanges, MAX_TEXT_LENGTH} from './core.mjs';

async function apply(comparison, changeIds = comparison.changes.map(change => change.id)) {
  return applyTextChanges({...comparison, changeIds});
}

function verifyOffsets(comparison) {
  let lastOriginal = 0, lastRevised = 0;
  for (const change of comparison.changes) {
    assert.ok(change.originalStart >= lastOriginal);
    assert.ok(change.revisedStart >= lastRevised);
    assert.equal(comparison.original.slice(change.originalStart, change.originalEnd), change.before);
    assert.equal(comparison.revised.slice(change.revisedStart, change.revisedEnd), change.after);
    lastOriginal = change.originalEnd; lastRevised = change.revisedEnd;
  }
}

test('selective replacement uses original offsets; unselected changes survive exactly', async () => {
  const comparison = await compareTexts({original: 'Amount: 100. Deadline: 10 days.', revised: 'Amount: 200. Deadline: 30 days.'});
  assert.equal(comparison.changes.length, 2);
  assert.deepEqual(comparison.summary, {total: 2, insertions: 0, deletions: 0, replacements: 2});
  assert.equal((await apply(comparison, [comparison.changes[1].id])).result, 'Amount: 100. Deadline: 30 days.');
  assert.equal((await apply(comparison, [comparison.changes[0].id])).result, 'Amount: 200. Deadline: 10 days.');
  assert.equal((await apply(comparison, [])).result, comparison.original);
  assert.equal((await apply(comparison, comparison.changes.map(change => change.id).reverse())).result, comparison.revised);
  verifyOffsets(comparison);
});

test('insertions split coalesced equal segments without losing anchors', async () => {
  const comparison = await compareTexts({original: 'one two three', revised: 'one new two extra three!'});
  assert.equal(comparison.changes.length, 3);
  assert.ok(comparison.changes.every(change => change.kind === 'insert'));
  assert.equal((await apply(comparison, [comparison.changes[1].id])).result, 'one two extra three');
  assert.equal((await apply(comparison)).result, comparison.revised);
  verifyOffsets(comparison);
});

test('repeated phrases remain occurrence-specific and deterministic', async () => {
  const input = {original: 'same A same A same A', revised: 'same A same B same A'};
  const comparison = await compareTexts(input);
  assert.deepEqual(await compareTexts(input), comparison);
  assert.equal(comparison.changes.length, 1);
  assert.equal(comparison.changes[0].originalStart, 12);
  assert.equal((await apply(comparison)).result, input.revised);
});

test('empty inputs and insertions/deletions at both ends preserve exact content', async () => {
  for (const [original, revised] of [['', ''], ['', 'hello\n'], ['hello\n', ''], ['body', 'start body end'], ['start body end', 'body']]) {
    const comparison = await compareTexts({original, revised});
    verifyOffsets(comparison);
    assert.equal((await apply(comparison)).result, revised);
    assert.equal((await apply(comparison, [])).result, original);
  }
});

test('CRLF, final newline, tabs and lone CR are not normalized', async () => {
  const original = 'First\r\nValue:\t10\r\nLast\r', revised = 'First\r\nValue:\t20\r\nLast';
  const comparison = await compareTexts({original, revised});
  const amount = comparison.changes.find(change => change.before === '10');
  assert.equal(amount.originalLine, 2);
  assert.equal(amount.revisedLine, 2);
  assert.equal((await apply(comparison, [amount.id])).result, 'First\r\nValue:\t20\r\nLast\r');
  assert.equal((await apply(comparison)).result, revised);
  assert.notEqual(comparison.comparisonId, (await compareTexts({original: original.replaceAll('\r\n', '\n'), revised})).comparisonId);
});

test('Unicode combining marks, emoji and NUL round trip without normalization', async () => {
  const original = '🚀 e\u0301 café\0星\n', revised = '🛰️ é cafe\0月\n';
  const comparison = await compareTexts({original, revised});
  verifyOffsets(comparison);
  assert.equal((await apply(comparison)).result, revised);
  assert.equal((await apply(comparison, [])).result, original);
  await assert.rejects(compareTexts({original: '\ud800', revised: ''}), /surrogate/);
  await assert.rejects(compareTexts({original: '', revised: '\udfff'}), /surrogate/);
});

test('a changed source rejects old comparison IDs; unknown and duplicate selections fail', async () => {
  const comparison = await compareTexts({original: 'a b', revised: 'a c'});
  await assert.rejects(applyTextChanges({...comparison, original: 'a z', changeIds: ['change-1']}), /stale/);
  await assert.rejects(applyTextChanges({...comparison, revised: 'a d', changeIds: ['change-1']}), /stale/);
  await assert.rejects(apply(comparison, ['change-9000']), /Unknown/);
  await assert.rejects(apply(comparison, ['change-1', 'change-1']), /duplicate/);
  await assert.rejects(apply(comparison, [1]), /array/);
  await assert.rejects(applyTextChanges({...comparison, comparisonId: 'stale', changeIds: []}), /comparisonId/);
});

test('digest is unambiguous and independent of display names', async () => {
  const comparison = await compareTexts({original: 'ab', revised: 'c'});
  assert.match(comparison.comparisonId, /^[a-f0-9]{64}$/);
  assert.notEqual(comparison.comparisonId, (await compareTexts({original: 'a', revised: 'bc'})).comparisonId);
  assert.equal(comparison.comparisonId, (await compareTexts({original: 'ab', revised: 'c', originalName: 'Договор.txt'})).comparisonId);
});

test('large comparisons disclose engine fallback and still apply exactly', async () => {
  const original = 'left '.repeat(2000), revised = 'right '.repeat(2000);
  const comparison = await compareTexts({original, revised});
  assert.equal(comparison.coarse, true);
  assert.equal(comparison.changes.length, 1);
  assert.equal(comparison.changes[0].before, original);
  assert.equal((await apply(comparison)).result, revised);
});

test('validate bounded input without coercing or trimming text', async () => {
  for (const invalid of [null, [], 'text']) await assert.rejects(compareTexts(invalid), /input object/);
  for (const original of [undefined, 12, {}, []]) await assert.rejects(compareTexts({original, revised: ''}), /must be a string/);
  await assert.rejects(compareTexts({original: 'x'.repeat(MAX_TEXT_LENGTH + 1), revised: ''}), /exceeds/);
  await assert.rejects(compareTexts({original: '', revised: '', originalName: 'x\ny.txt'}), /Document name/);
  const comparison = await compareTexts({original: ' '.repeat(MAX_TEXT_LENGTH), revised: ' '.repeat(MAX_TEXT_LENGTH)});
  assert.equal(comparison.original.length, MAX_TEXT_LENGTH);
  assert.equal(comparison.changes.length, 0);
  assert.equal(comparison.coarse, false);
});

test('seeded varied text pairs always reconstruct the revised input', async () => {
  let state = 71983;
  const next = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 2 ** 32);
  const alphabet = ['a', 'b', 'same', ' ', '\r\n', '\n', '\t', '.', '🚀', 'е\u0308', '中'];
  const randomText = () => Array.from({length: Math.floor(next() * 35)}, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
  for (let i = 0; i < 150; i++) {
    const original = randomText(), revised = randomText();
    const comparison = await compareTexts({original, revised});
    verifyOffsets(comparison);
    assert.equal((await apply(comparison)).result, revised, `Pair ${i}`);
  }
});
