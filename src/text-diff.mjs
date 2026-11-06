/** Bounded, exact token differences shared by reports and the live document view. */
const MAX_WORD_WORK = 1000000, MAX_TOTAL_WORD_WORK = 4000000;
const MAX_TOKENS = 10000, MAX_SEGMENTS = 10000;
function lcs(left, right, equal) {
  const width = right.length + 1, matrix = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) matrix[i * width + j] = equal(left[i], right[j]) ? 1 + matrix[(i + 1) * width + j + 1] : Math.max(matrix[(i + 1) * width + j], matrix[i * width + j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (equal(left[i], right[j])) { pairs.push([i++, j++]); }
    else if (matrix[(i + 1) * width + j] >= matrix[i * width + j + 1]) i++;
    else j++;
  }
  return pairs;
}
function tokenize(text) { return text.match(/[\p{L}\p{M}\p{N}_]+|\s+|[^\p{L}\p{M}\p{N}_\s]/gu) || []; }
export function diffTextSegments(left, right, budget = {used: 0, fallback: 0}) {
  if (left === right) return {left: [{text: left, changed: false}], right: [{text: right, changed: false}]};
  const a = tokenize(left), b = tokenize(right), work = a.length * b.length;
  const fallback = () => { budget.fallback++; return {left: [{text: left, changed: true}], right: [{text: right, changed: true}]}; };
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS || work > MAX_WORD_WORK || budget.used + work > MAX_TOTAL_WORD_WORK) return fallback();
  budget.used += work;
  const intern = new Map(); let id = 0;
  const ids = values => values.map(value => { if (!intern.has(value)) intern.set(value, ++id); return intern.get(value); });
  const anchors = lcs(ids(a), ids(b), (x, y) => x === y), result = {left: [], right: []};
  function append(side, text, changed) {
    if (!text) return;
    const list = result[side], last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text; else list.push({text, changed});
  }
  let i = 0, j = 0;
  for (const [ai, bi] of [...anchors, [a.length, b.length]]) {
    append('left', a.slice(i, ai).join(''), true); append('right', b.slice(j, bi).join(''), true);
    if (ai < a.length) { append('left', a[ai], false); append('right', b[bi], false); }
    i = ai + 1; j = bi + 1;
  }
  if (result.left.length + result.right.length > MAX_SEGMENTS) return fallback();
  return result;
}
