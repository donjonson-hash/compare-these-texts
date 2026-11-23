import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument, PDFName} from '../dist/pdf-vendor.mjs';
import {readTextSource} from '../dist/text-source.mjs';

async function type3Source(mappings, codes = '4142') {
  const pdf = await PDFDocument.create();
  const {context} = pdf;
  const page = pdf.addPage([300, 300]);
  const shape = context.register(context.stream('600 0 d0 0 0 300 500 re f'));
  const font = context.obj({
    Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 600, 700],
    FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
    FirstChar: 65, LastChar: 66, Widths: [600, 600],
    CharProcs: {A: shape, B: shape},
    Encoding: {Type: 'Encoding', Differences: [65, 'A', 'B']},
  });
  if (mappings.length) {
    const cmap = [
      '/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
      '/CIDSystemInfo << /Registry (Synthetic) /Ordering (Unicode) /Supplement 0 >> def',
      '/CMapName /Type3Test def', '/CMapType 2 def',
      '1 begincodespacerange', '<00> <FF>', 'endcodespacerange',
      `${mappings.length} beginbfchar`, ...mappings, 'endbfchar',
      'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end',
    ].join('\n');
    font.set(PDFName.of('ToUnicode'), context.register(context.stream(cmap)));
  }
  page.node.set(PDFName.of('Resources'), context.obj({Font: {F1: context.register(font)}}));
  const content = `BT /F1 12 Tf 25 200 Td <${codes}> Tj ET`;
  page.node.set(PDFName.of('Contents'), context.register(context.stream(content)));
  return {name: 'type3.pdf', data: Buffer.from(await pdf.save()).toString('base64')};
}

test('Type 3 import uses explicit Unicode values even when glyph names suggest other text', async () => {
  const source = await type3Source(['<41> <03A9>', '<42> <0037>']);
  const parsed = await readTextSource(source);
  assert.deepEqual(parsed.blocks.map(block => block.text), ['Ω7']);
});

test('Type 3 import only requires mappings for codes actually shown', async () => {
  const source = await type3Source(['<41> <03A9>'], '4141');
  const parsed = await readTextSource(source);
  assert.deepEqual(parsed.blocks.map(block => block.text), ['ΩΩ']);
});

test('Type 3 import rejects missing character evidence despite plausible A and B glyph names', async () => {
  for (const mappings of [[], ['<41> <03A9>']]) {
    const source = await type3Source(mappings);
    await assert.rejects(readTextSource(source), /Unicode/i);
  }
});
