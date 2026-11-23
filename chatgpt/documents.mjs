/** Document adapter: reuse CTT parsing/alignment and retain navigable evidence. */
import {readTextSource} from '../src/text-source.mjs';
import {compareText} from '../src/text-engine.mjs';

const VERSION = 'ctt-document-review-v1';
const CATEGORIES = ['matched', 'changed', 'only_left', 'only_right', 'moved', 'reflow'];
const KINDS = {changed: 'replace', only_left: 'delete', only_right: 'insert', moved: 'move', reflow: 'reflow'};
const EXPLANATIONS = {
  changed: 'Текст заменён. Сопоставление фрагментов не означает совпадение их смысла.',
  only_left: 'Текст удалён из новой версии.',
  only_right: 'Текст добавлен в новую версию.',
  moved: 'Текст перемещён без изменений.',
  reflow: 'Изменено разбиение на строки; текст совпадает после объединения строк пробелом.',
};

function exactObject(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} must contain exactly ${fields.join(' and ')}.`);
  }
}

function source(value) {
  exactObject(value, ['name', 'data'], 'A document source');
  if (typeof value.name !== 'string' || typeof value.data !== 'string') throw new TypeError('Document name and base64 data must be strings.');
  // The existing importer owns file signatures, supported formats, byte limits,
  // bounded ZIP/PDF validation, and all extraction-coverage checks.
  return {name: value.name, data: value.data};
}

function metadata(meta, blocks, input) {
  const padding = input.data.endsWith('==') ? 2 : input.data.endsWith('=') ? 1 : 0;
  return {
    name: meta.name,
    format: meta.format,
    sha256: meta.sha256,
    byteLength: input.data.length / 4 * 3 - padding,
    blockCount: meta.block_count,
    pageCount: meta.page_count ?? null,
    coverage: meta.format === 'pdf' ? 'text_layer_only' : meta.format === 'docx' ? 'main_body_only' : 'text_blocks',
    notes: [...meta.notes],
    blocks,
  };
}

/** Standalone import when a caller needs one document, not a comparison. */
export async function readDocumentSource(input) {
  const checked = source(input);
  const parsed = await readTextSource(checked);
  return metadata(parsed.meta, parsed.blocks, checked);
}

function blockFor(item, category, side) {
  if (category === 'only_left') return side === 'left' ? item.row : null;
  if (category === 'only_right') return side === 'right' ? item.row : null;
  return item[side] ?? null;
}

function originalBlocks(report, side) {
  // Every source block occurs in one report category. A reflow aggregate owns
  // its original source_blocks; keep those individual anchors and their order.
  // Recovering them here avoids parsing each (potentially large) PDF twice.
  const byRecord = new Map();
  for (const category of CATEGORIES) {
    for (const item of report[category] || []) {
      const block = blockFor(item, category, side);
      if (!block) continue;
      for (const part of block.source_blocks || [block]) {
        if (byRecord.has(part.record)) throw new Error('The comparison report contains a duplicate source block.');
        byRecord.set(part.record, part);
      }
    }
  }
  const blocks = [...byRecord.values()].sort((a, b) => a.record - b.record);
  if (blocks.length !== report.sources[side].block_count || blocks.some((block, index) => block.record !== index + 1)) {
    throw new Error('The comparison report does not cover every source block.');
  }
  return blocks;
}

function segments(block, changed) {
  return block ? [{text: block.text, changed}] : [];
}

/** No network, persistence, inferred meaning, or replacement diff algorithm. */
export async function compareDocuments(input) {
  exactObject(input, ['original', 'revised'], 'A document comparison');
  const sources = {left: source(input.original), right: source(input.revised)};
  const report = await compareText(sources);
  const documents = {
    original: metadata(report.sources.left, originalBlocks(report, 'left'), sources.left),
    revised: metadata(report.sources.right, originalBlocks(report, 'right'), sources.right),
  };
  const identity = JSON.stringify([VERSION, documents.original.format, documents.original.sha256, documents.revised.format, documents.revised.sha256]);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const comparisonId = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const changes = CATEGORIES.filter(category => category !== 'matched').flatMap(category => (report[category] || []).map(item => {
    const original = blockFor(item, category, 'left'), revised = blockFor(item, category, 'right');
    const contentChanged = category !== 'moved' && category !== 'reflow';
    return {
      id: `doc-${comparisonId.slice(0, 24)}-${item.key}`,
      reportKey: item.key,
      category,
      kind: KINDS[category],
      before: original?.text ?? '',
      after: revised?.text ?? '',
      originalLocation: original?.location ?? null,
      revisedLocation: revised?.location ?? null,
      original,
      revised,
      segments: {
        original: item.segments?.left ?? segments(original, contentChanged),
        revised: item.segments?.right ?? segments(revised, contentChanged),
      },
      explanation: EXPLANATIONS[category],
    };
  })).sort((a, b) => Number(a.reportKey.slice(5)) - Number(b.reportKey.slice(5)));
  const summary = {
    total: changes.length,
    replacements: report.changed.length,
    insertions: report.only_right.length,
    deletions: report.only_left.length,
    moves: report.moved?.length ?? 0,
    reflows: report.reflow?.length ?? 0,
    matched: report.matched.length,
  };
  return {
    kind: 'documents', comparisonId, documents, sources, report, changes, summary,
    notes: [...new Set([...documents.original.notes, ...documents.revised.notes])],
  };
}
