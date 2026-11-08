import {uiMessage, uiError, uiSetText, uiSetAttr, uiTranslate} from './ui-text.mjs';
import {findNumberChanges, numberExcerpt} from './number-changes.mjs';

const PAGE_SIZE = 5;
const displayValue = raw => raw.length > 80 ? raw.slice(0, 60) + '…' + raw.slice(-15) : raw;
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) uiSetText(node, text);
  if (className) node.className = className;
  return node;
};
const button = (text, action) => {
  const node = el('button', text, 'button secondary'); node.type = 'button';
  node.addEventListener('click', action); return node;
};

export function mountNumberReview(root, {queue, open = false, getBlocks, choose, onChange}) {
  let items = [], revision = null, page = 0, disposed = false;
  const panel = el('details', undefined, 'number-review'); panel.open = open;
  const summary = el('summary'), title = el('strong', uiMessage("Amounts & percentages")), count = el('span');
  summary.append(title, count);
  const hint = el('p', uiMessage("Finds changes to amounts ($, €, £, ₽, USD, EUR, GBP, RUB) and percentages. Open a passage to edit it. Other text changes still need review."), 'number-review-hint');
  const progress = el('p', '', 'number-review-progress'); progress.setAttribute('role', 'status');
  const list = el('ol', undefined, 'number-review-list');
  const empty = el('p', uiMessage("No changes to supported amounts or percentages found. Other text differences may remain."), 'number-review-hint');
  const pagination = el('div', undefined, 'number-review-pages');
  const previous = button(uiMessage("Previous passages"), () => { page--; render(); });
  const next = button(uiMessage("Next passages"), () => { page++; render(); });
  const pageLabel = el('span'); pagination.append(previous, pageLabel, next);
  panel.append(summary, hint, progress, empty, list, pagination); root.append(panel);
  panel.addEventListener('toggle', () => { if (!disposed) onChange(); });

  function render() {
    if (disposed) return;
    const focused = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset.numberKey, focusAction = focused?.dataset.numberAction;
    const checked = items.filter(item => queue.reviewed(item.key)).length;
    uiSetText(count, items.length ? (items.length === 1 ? uiMessage("{0} to check · {1} passage", { 0: items.length - checked, 1: items.length }) : uiMessage("{0} to check · {1} passages", { 0: items.length - checked, 1: items.length })) : uiMessage("No changes found"));
    uiSetText(progress, items.length ? (items.length === 1 ? uiMessage("Values checked in {0} of {1} passage", { 0: checked, 1: items.length }) : uiMessage("Values checked in {0} of {1} passages", { 0: checked, 1: items.length })) : '');
    empty.hidden = items.length > 0; progress.hidden = !items.length;
    page = Math.max(0, Math.min(page, Math.ceil(items.length / PAGE_SIZE) - 1));
    list.replaceChildren(); list.start = page * PAGE_SIZE + 1;
    for (const item of items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const card = el('li', undefined, 'number-review-item'); card.dataset.numberPassage = item.key;
      const checked = queue.reviewed(item.key); card.classList.toggle('is-checked', checked);
      const heading = el('strong', item.mode === 'added' ? uiMessage("Values in added text") : item.mode === 'removed' ? uiMessage("Values in removed text") : item.mode === 'context' ? uiMessage("Review values in context") : uiMessage("Values changed"));
      card.append(heading);
      if (item.mode === 'paired') {
        const values = el('ul', undefined, 'number-review-values');
        for (const pair of item.pairs.slice(0, 6)) values.append(el('li', (pair.before.kind === 'percentage' ? uiMessage("Percentage: {0} → {1}", { 0: displayValue(pair.before.raw), 1: displayValue(pair.after.raw) }) : uiMessage("Amount: {0} → {1}", { 0: displayValue(pair.before.raw), 1: displayValue(pair.after.raw) }))));
        if (item.pairs.length > 6) values.append(el('li', uiMessage("+ {0} more in this passage", { 0: item.pairs.length - 6 })));
        card.append(values);
      }
      const before = item.focusBefore, after = item.focusAfter;
      for (const [label, text, token] of [['A', item.left, before], ['B', item.right, after]]) {
        const excerpt = el('p', undefined, 'number-review-excerpt');
        excerpt.append(el('strong', `${label}: `), document.createTextNode(numberExcerpt(text, token)));
        card.append(excerpt);
      }
      if (item.mode === 'context') card.append(el('p', uiMessage("The surrounding text or value order also changed. Check both versions."), 'number-review-hint'));
      const actions = el('div', undefined, 'number-review-actions');
      const show = button(uiMessage("Show in document"), () => {
        if (disposed) return;
        Promise.resolve(choose(item)).catch(() => { if (!disposed) uiSetText(progress, uiMessage("Could not open this passage. Choose it in the documents below.")); });
      });
      const mark = button(checked ? uiMessage("Values checked ✓") : uiMessage("Mark values checked"), () => {
        if (disposed) return;
        if (queue.reviewed(item.key)) queue.reopen(item.key); else queue.accept(item.key);
        render(); onChange();
      });
      mark.setAttribute('aria-pressed', String(checked));
      for (const [node, action] of [[show, 'show'], [mark, 'check']]) { node.dataset.numberKey = item.key; node.dataset.numberAction = action; }
      actions.append(show, mark); card.append(actions); list.append(card);
    }
    pagination.hidden = items.length <= PAGE_SIZE;
    previous.disabled = page === 0; next.disabled = (page + 1) * PAGE_SIZE >= items.length;
    uiSetText(pageLabel, items.length ? `${page + 1} / ${Math.ceil(items.length / PAGE_SIZE)}` : '');
    if (focusKey) [...list.querySelectorAll('button')].find(node => node.dataset.numberKey === focusKey && node.dataset.numberAction === focusAction)?.focus({preventScroll: true});
  }
  return {
    refresh(currentRevision) {
      if (disposed || currentRevision === revision) return;
      revision = currentRevision;
      items = findNumberChanges(getBlocks());
      queue.sync(items.map(item => ({key: item.key, signature: item.signature, differs: true})));
      render();
    },
    snapshot: () => queue.snapshot(panel.open),
    reset() { queue.reset(); render(); },
    dispose() { disposed = true; panel.remove(); },
  };
}
