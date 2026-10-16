import test from 'node:test';
import assert from 'node:assert/strict';
import {crc32, deflateRawSync} from 'node:zlib';
import {unzipDocument} from '../src/text-zip.mjs';
import {validateZip} from '../src/xlsx-source.mjs';
import {readDocxPackage} from '../src/text-source.mjs';

// Construct archives explicitly so central/local headers and expansion claims can
// disagree independently. Fixtures do not need an external ZIP executable.
function zip(parts, {deflate = false, descriptor = false, signed = true} = {}) {
  const locals = [], centrals = [], offsets = []; let offset = 0;
  for (const [name, text] of parts) {
    const filename = Buffer.from(name), data = Buffer.from(text), packed = deflate ? deflateRawSync(data) : data, crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(descriptor ? 8 : 0, 6); local.writeUInt16LE(deflate ? 8 : 0, 8);
    if (!descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); }
    local.writeUInt16LE(filename.length, 26);
    const tail = Buffer.alloc(descriptor ? signed ? 16 : 12 : 0);
    if (descriptor) { const p = signed ? 4 : 0; if (signed) tail.writeUInt32LE(0x08074b50); tail.writeUInt32LE(crc, p); tail.writeUInt32LE(packed.length, p + 4); tail.writeUInt32LE(data.length, p + 8); }
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(descriptor ? 8 : 0, 8); central.writeUInt16LE(deflate ? 8 : 0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    offsets.push({local: offset, data: offset + 30 + filename.length, descriptor: offset + 30 + filename.length + packed.length});
    locals.push(local, filename, packed, tail); centrals.push(central, filename); offset += local.length + filename.length + packed.length + tail.length;
  }
  const centralStart = offset, directory = Buffer.concat(centrals), end = Buffer.alloc(22); let cursor = centralStart;
  for (let i = 0; i < parts.length; i++) { offsets[i].central = cursor; cursor += 46 + Buffer.byteLength(parts[i][0]); }
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(centralStart, 16);
  return {bytes: Buffer.concat([...locals, directory, end]), offsets};
}
const basic = [['[Content_Types].xml', '<Types/>'], ['xl/workbook.xml', '<workbook/>']];
const parsers = [['DOCX', unzipDocument], ['XLSX', validateZip]];
for (const [format, parse] of parsers) {
  test(`${format} accepts stored, deflated and signed/unsigned descriptor ZIP entries`, async () => {
    for (const options of [{}, {deflate: true}, {deflate: true, descriptor: true}, {descriptor: true, signed: false}]) await parse(zip(basic, options).bytes);
  });
  test(`${format} rejects traversal, duplicate names, encrypted entries and truncated archives`, async () => {
    for (const name of ['../secret.xml', '/secret.xml', 'word/../secret.xml', 'word\\secret.xml', 'bad\0.xml']) await assert.rejects(parse(zip([...basic, [name, 'x']]).bytes), /Invalid.*ZIP/);
    await assert.rejects(parse(zip([...basic, basic[0]]).bytes), /Invalid.*ZIP/);
    const {bytes, offsets} = zip(basic); bytes.writeUInt16LE(1, offsets[0].local + 6); bytes.writeUInt16LE(1, offsets[0].central + 8);
    await assert.rejects(parse(bytes), /Invalid.*ZIP/);
    const valid = zip(basic).bytes;
    for (const end of [0, 10, valid.length - 1, valid.length - 22]) await assert.rejects(parse(valid.subarray(0, end)), /Invalid.*ZIP/);
  });
  test(`${format} checks CRC in data and headers and rejects corrupt descriptors`, async () => {
    const corruptData = zip(basic); corruptData.bytes[corruptData.offsets[0].data] ^= 1; await assert.rejects(parse(corruptData.bytes), /Invalid.*ZIP/);
    const localCRC = zip(basic); localCRC.bytes[localCRC.offsets[0].local + 14] ^= 1; await assert.rejects(parse(localCRC.bytes), /Invalid.*ZIP/);
    for (const signed of [false, true]) {
      const corrupt = zip(basic, {descriptor: true, signed}); corrupt.bytes[corrupt.offsets[0].descriptor + (signed ? 4 : 0)] ^= 1;
      await assert.rejects(parse(corrupt.bytes), /Invalid.*ZIP/);
    }
  });
  test(`${format} bounds both declared size and actual deflate expansion`, async () => {
    const large = zip(basic); large.bytes.writeUInt32LE(16 * 1024 * 1024 + 1, large.offsets[0].central + 24);
    await assert.rejects(parse(large.bytes), /exceeds 16 MiB/);
    const forged = zip([['[Content_Types].xml', 'a'.repeat(256 * 1024)], basic[1]], {deflate: true});
    forged.bytes.writeUInt32LE(1, forged.offsets[0].central + 24); forged.bytes.writeUInt32LE(1, forged.offsets[0].local + 22);
    await assert.rejects(parse(forged.bytes), /Invalid.*ZIP/);
  });
}
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const doc = content => `<w:document xmlns:w="${W}"><w:body>${content}</w:body></w:document>`;
function word(xml) {
  return zip([
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', xml],
  ]).bytes;
}
test('DOCX XML rejects DTD, external/custom entities, malformed XML and excessive nesting', async () => {
  await readDocxPackage(word(doc('<w:p><w:r><w:t>Safe &amp; sound</w:t></w:r></w:p>')));
  for (const declaration of ['<!DOCTYPE w:document SYSTEM "https://example.invalid/entity.dtd">', '<!DOCTYPE w:document [<!ENTITY bomb "expansion">]>', '<!ENTITY local SYSTEM "file:///etc/passwd">']) {
    await assert.rejects(readDocxPackage(word(declaration + doc('<w:p/>'))), /DTDs and custom XML entities/);
  }
  await assert.rejects(readDocxPackage(word(doc('<w:p><w:r><w:t>&unknown;</w:t></w:r></w:p>'))), /invalid XML/);
  await assert.rejects(readDocxPackage(word(doc('<w:p><w:r></w:p>'))), /invalid XML/);
  await assert.rejects(readDocxPackage(word(doc('<w:p>'.repeat(65) + '</w:p>'.repeat(65)))), /nesting exceeds 64/);
});
test('DOCX rejects invalid merged table structure instead of silently hiding text', async () => {
  const table = '<w:tbl><w:tblGrid><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>';
  await assert.rejects(readDocxPackage(word(doc(table))), /vertical cell merge is invalid/);
});
