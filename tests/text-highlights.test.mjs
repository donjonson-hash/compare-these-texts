import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {diffTextSegments} from '../dist/text-diff.mjs';
import {markTextChanges} from '../dist/text-highlights.mjs';
import {compareText} from '../dist/text-engine.mjs';
import {mountVisualReview} from '../dist/visual-review.mjs';
import editor from '../dist/text-editor.js';
import {readTextSource} from '../dist/text-source.mjs';
import {docx} from './fixtures/text-fixture.mjs';

const source = (name, text) => ({name, data: Buffer.from(text).toString('base64')});
const marked = node => [...node.querySelectorAll('mark.visual-text-change')].map(mark => mark.textContent).join('');

test('word highlighting preserves rich runs and images and never marks common words', () => {
  const dom = new JSDOM('<p><strong>Срок: </strong><span>5 д</span><em>ней.</em><img alt="Logo"></p>');
  const paragraph = dom.window.document.querySelector('p'), image = paragraph.querySelector('img');
  const before = paragraph.textContent;
  const changes = diffTextSegments(before, 'Срок: 10 дней.');
  markTextChanges(paragraph, changes.left);
  assert.equal(paragraph.textContent, before);
  assert.equal(marked(paragraph), '5');
  assert.equal(paragraph.querySelector('strong').textContent, 'Срок: ');
  assert.equal(paragraph.querySelector('em').textContent, 'ней.');
  assert.equal(paragraph.querySelector('img'), image);
  markTextChanges(paragraph, diffTextSegments(before, before).left);
  assert.equal(marked(paragraph), '');
  assert.equal(paragraph.textContent, before);
  markTextChanges(paragraph, changes.left, 0, 'A newer draft that has not rendered');
  assert.equal(marked(paragraph), '', 'New ranges must not paint the previous rendered text');
  dom.window.close();
});

async function harness(t, left, right, {leftName = 'A.txt', aggregate = false, onStateChange} = {}) {
  const dom = new JSDOM('<main></main>'), root = dom.window.document.querySelector('main');
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  window.KristinaTextEditor = editor; window.Element.prototype.scrollIntoView = () => {};
  const sources = {left: source(leftName, left), right: source('B.txt', right)}, report = await compareText(sources);
  if (aggregate) {
    const block = async side => { const {blocks} = await readTextSource(sources[side]); return {...blocks[0], text: blocks.map(part => part.text).join('\n'), source_blocks: blocks}; };
    report.matched = []; report.only_left = []; report.only_right = [];
    report.changed = [{key: 'text-1', left: await block('left'), right: await block('right')}];
  }
  const options = {report, sources, onStateChange: () => onStateChange?.(view)};
  let view = await mountVisualReview(root, options);
  t.after(() => { view.dispose(); dom.window.close(); delete globalThis.window; delete globalThis.document; });
  const paragraphs = side => [...root.querySelectorAll('.visual-column')][side === 'left' ? 0 : 1].querySelectorAll('.visual-paragraph');
  return {dom, root, report, paragraphs, get view() { return view; },
    async restore(saved = view.snapshot()) { view.dispose(); view = await mountVisualReview(root, {...options, restoredState: saved}); },
  };
}

test('live paragraphs mark changed words only and refresh through edit, undo and saved restore', async t => {
  const p = await harness(t, 'Identical start\r\nДоставка через 5 дней.\r\nIdentical middle\r\nPrice: 100\r\nIdentical end', 'Identical start\nДоставка через 10 дней.\nIdentical middle\nPrice: 150\nIdentical end');
  const check = (left, right) => {
    for (const [side, expected] of [['left', left], ['right', right]]) {
      const nodes = [...p.paragraphs(side)];
      assert.deepEqual(nodes.map(marked), ['', expected[0], '', expected[1], '']);
      for (const index of [0, 2, 4]) assert.equal(nodes[index].classList.contains('has-difference'), false);
    }
  };
  check(['5', '100'], ['10', '150']);
  const delivery = p.report.changed.find(group => group.left.text.includes('Доставка'));
  await p.view.select(delivery.key, 'right');
  const field = p.root.querySelector('[data-edit-side="right"]');
  field.value = delivery.left.text; field.dispatchEvent(new p.dom.window.Event('input'));
  assert.equal(marked(p.paragraphs('left')[1]), '');
  assert.equal(p.paragraphs('left')[1].classList.contains('has-difference'), false);
  assert.equal(marked(p.paragraphs('right')[1]), '', 'Stale DOM has no new marks while typing is rendering');
  p.root.querySelector('[aria-label="Undo edit in B"]').click();
  check(['5', '100'], ['10', '150']);
  await p.restore(); check(['5', '100'], ['10', '150']);
});

test('typing in either version updates the open document and survives reopening without Done', async t => {
  const originals = {left: 'Delivery in 5 days.', right: 'Delivery in 10 days.'};
  let saved;
  const p = await harness(t, originals.left, originals.right, {onStateChange: view => { saved = view.snapshot(); }});
  const key = p.report.changed[0].key;
  for (const [side, letter] of [['left', 'A'], ['right', 'B']]) {
    const other = side === 'left' ? 'right' : 'left';
    await p.view.select(key, side);
    const field = p.root.querySelector(`[data-edit-side="${side}"]`);
    field.focus();
    for (const value of ['Delivery in 7', 'Delivery in 7 days.']) {
      field.value = value;
      field.dispatchEvent(new p.dom.window.Event('input', {bubbles: true}));
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(p.paragraphs(side)[0].textContent, value);
      assert.equal(p.paragraphs(other)[0].textContent, originals[other]);
      assert.equal(p.dom.window.document.activeElement, field);
    }
    assert.equal(p.root.querySelector('.visual-inspector').hidden, false);
    assert.ok(saved, 'The current session was saved while the editor was open');
    await p.restore(saved);
    assert.equal(p.paragraphs(side)[0].textContent, 'Delivery in 7 days.');
    const undo = p.root.querySelector(`[aria-label="Undo edit in ${letter}"]`);
    undo.click();
    assert.equal(p.paragraphs(side)[0].textContent, originals[side]);
    assert.equal(undo.disabled, true, 'One undo restores the entire typing session');
  }
});

for (const side of ['left', 'right']) test(`editing unique text on the ${side} updates its transfer button and preserves unrelated paragraphs`, async t => {
  const other = side === 'left' ? 'right' : 'left';
  const left = ['Delivery in 5 days.', 'Reference number A.', 'Shared end.'];
  const right = ['Delivery in 10 days.', 'Reference number A.', 'Shared end.'];
  const original = 'Please transfer 120 USD.', edited = 'Please transfer 90 USD.';
  (side === 'left' ? left : right).splice(2, 0, original);
  const p = await harness(t, left.join('\n'), right.join('\n'));
  const key = p.report[`only_${side}`][0].key;
  await p.view.select(key, side);
  const add = p.root.querySelector(`[data-missing-key="${key}"]`);
  const before = [...p.paragraphs(side)];
  const otherDifference = before[0].querySelector('mark');
  assert.ok(otherDifference);
  assert.equal(add.textContent, '＋ ' + original);
  const field = p.root.querySelector(`[data-edit-side="${side}"]`);
  field.value = edited; field.dispatchEvent(new p.dom.window.Event('input'));
  assert.equal(add.textContent, '＋ ' + edited);
  assert.ok(before.every((node, i) => node === p.paragraphs(side)[i]));
  assert.equal(before[0].querySelector('mark'), otherDifference);
  assert.equal(before[2].textContent, edited);
  assert.ok(before[2].getAttribute('aria-label').includes(edited));
  add.click();
  assert.equal(p.view.drafts[other].get(key), edited);
  assert.ok([...p.paragraphs(other)].some(node => node.textContent === edited));
  assert.equal(p.root.querySelector(`[data-missing-key="${key}"]`), null);
});

for (const format of ['txt', 'docx']) test(`copied multi-block groups keep correct ranges in ${format.toUpperCase()} paragraphs`, async t => {
  const original = 'Shared words old', left = format === 'docx' ? docx([original]) : original;
  const p = await harness(t, left, 'Shared words\nnew\nextra', {leftName: `A.${format}`, aggregate: true});
  await p.view.select('text-1', 'left');
  p.root.querySelector('[data-copy-to="left"]').click();
  for (let attempt = 0; attempt < 50 && [...p.paragraphs('left')].map(node => node.textContent).join('\n') !== 'Shared words\nnew\nextra'; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal([...p.paragraphs('left')].map(node => node.textContent).join('\n'), 'Shared words\nnew\nextra');
  const field = p.root.querySelector('[data-edit-side="right"]');
  field.value = 'Shared words\nNEW\nEXTRA'; field.dispatchEvent(new p.dom.window.Event('input'));
  assert.equal([...p.paragraphs('left')].map(marked).join(''), 'newextra', 'Every copied block is mapped even when multiple records are undefined or Word merges the group');
  assert.equal([...p.paragraphs('left')].some(node => marked(node).includes('Shared words')), false);
  await p.restore();
  assert.equal([...p.paragraphs('left')].map(marked).join(''), 'newextra');
  assert.equal([...p.paragraphs('right')].map(marked).join(''), 'NEWEXTRA');
});

test('split paragraphs leave common text clear; moved identical text has only a position marker', async t => {
  const p = await harness(t, 'Header\nShared words old\nMoved paragraph\nStable section\nFooter', 'Header\nShared words\nnew\nStable section\nMoved paragraph\nFooter');
  const left = [...p.paragraphs('left')], right = [...p.paragraphs('right')];
  assert.equal(marked(left.find(node => node.textContent === 'Shared words old')), ' old');
  assert.equal(marked(right.find(node => node.textContent === 'Shared words')), '');
  assert.equal(marked(right.find(node => node.textContent === 'new')), 'new');
  for (const node of [...left, ...right].filter(node => /^(Header|Footer|Moved paragraph|Stable section)$/.test(node.textContent))) assert.equal(marked(node), '');
  assert.ok(p.root.querySelectorAll('.visual-paragraph.is-moved').length > 0, 'A positional move remains navigable without claiming its words changed');
});
