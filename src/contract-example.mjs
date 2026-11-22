import {packDocx} from './docx-visual.mjs';

const encoder = new TextEncoder();
const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const relationships = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function contractFile(revised) {
  const paragraphs = [
    'Supply agreement',
    'Northline Studio agrees to supply Alder Works with 40 adjustable desks.',
    revised ? '1. Contract price: USD 13,200.' : '1. Contract price: USD 12,000.',
    revised ? '2. Payment is due within 14 days of invoice receipt.' : '2. Payment is due within 30 days of invoice receipt.',
    revised ? '3. Delivery to the buyer’s warehouse.' : '3. Delivery to the buyer’s warehouse included.',
    '4. The supplier will confirm the delivery date by email.',
  ];
  const body = paragraphs.map((text, index) =>
    '<w:p><w:r>' + (index === 0 ? '<w:rPr><w:b/><w:sz w:val="36"/></w:rPr>' : '') +
    '<w:t>' + text + '</w:t></w:r></w:p>').join('');
  const document = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  const bytes = await packDocx([
    ['[Content_Types].xml', encoder.encode(contentTypes)],
    ['_rels/.rels', encoder.encode(relationships)],
    ['word/document.xml', encoder.encode(document)],
  ]);
  return new File([bytes], revised ? 'Supply-agreement-revised.docx' : 'Supply-agreement-original.docx', {type: mimeType});
}

export async function createContractExample() {
  const [left, right] = await Promise.all([contractFile(false), contractFile(true)]);
  return {left, right};
}
