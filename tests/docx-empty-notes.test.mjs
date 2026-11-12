import {test} from 'node:test';
import assert from 'node:assert/strict';
import {docx,W} from './fixtures/text-fixture.mjs';
import {readTextSource} from '../dist/text-source.mjs';
import {readDocxVisual,writeDocxVisual} from '../dist/docx-visual.mjs';
import {unzipDocument} from '../dist/text-zip.mjs';
import {emptyNotesFixture as fixture,notes,relationships} from './fixtures/docx-empty-notes-fixture.mjs';
const source=bytes=>({name:'template-notes.docx',data:Buffer.from(bytes).toString('base64')});
test('OCR markerless separator templates are inert and survive edit/export unchanged',async()=>{
 const extra=Object.fromEntries(['footnote','endnote'].map(kind=>[`word/${kind}s.xml`,`<w:${kind}s xmlns:w="${W}"><w:${kind} w:id="0" w:type="separator"><w:p><w:r/></w:p></w:${kind}><w:${kind} w:id="1" w:type="continuationSeparator"><w:p><w:r/></w:p></w:${kind}></w:${kind}s>`]));
 const src=fixture(extra),before=await unzipDocument(Buffer.from(src.data,'base64'));
 assert.deepEqual((await readTextSource(src)).blocks.map(b=>b.text),['Original body']);
 const changed=await writeDocxVisual(src,[{record:1,text:'Revised OCR text'}]);
 assert.deepEqual((await readTextSource(source(changed))).blocks.map(b=>b.text),['Revised OCR text']);
 const after=await unzipDocument(changed);
 for(const path of Object.keys(extra))assert.deepEqual(after.get(path),before.get(path));
 for(const replacement of ['<w:r><w:t>Hidden note</w:t></w:r>','<w:r><w:footnoteRef/></w:r>','<w:r><w:object/></w:r>']){
  await assert.rejects(()=>readTextSource(fixture({...extra,'word/footnotes.xml':extra['word/footnotes.xml'].replace('<w:r/>',replacement)})),/footnotes or endnotes/);
 }
 await assert.rejects(()=>readTextSource(fixture({...extra,'word/footnotes.xml':extra['word/footnotes.xml'].replace('w:id="1"','w:id="0"')})),/footnotes or endnotes/);
});
test('Word separator-only note templates import and remain byte-identical after body editing',async()=>{
 const src=fixture();assert.deepEqual((await readTextSource(src)).blocks.map(b=>b.text),['Original body']);
 assert.equal((await readDocxVisual(src)).blocks.length,1);
 const changed=await writeDocxVisual(src,[{record:1,text:'Edited body'}]);
 assert.deepEqual((await readTextSource(source(changed))).blocks.map(b=>b.text),['Edited body']);
 const before=await unzipDocument(Buffer.from(src.data,'base64')),after=await unzipDocument(changed);
 assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort());
 for(const [path,bytes] of before)if(path!=='word/document.xml')assert.deepEqual(after.get(path),bytes,path);
 assert.deepEqual((await readTextSource(fixture({'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"/>`,'word/endnotes.xml':`<w:endnotes xmlns:w="${W}"/>`}))).blocks.map(b=>b.text),['Original body']);
});
test('actual notes, hidden objects, comments and note references cannot pass as empty templates',async()=>{
 const malicious=[
  {'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p><w:r><w:t>Real note</w:t></w:r></w:p></w:footnote></w:footnotes>`},
  {'word/endnotes.xml':notes('endnote').replace('<w:separator/>','<w:separator/><w:t>Visible separator text</w:t>')},
  {'word/footnotes.xml':notes('footnote').replace('<w:separator/>','<w:drawing/>')},
  {'word/endnotes.xml':notes('endnote').replace('w:type="separator"','w:type="normal"')},
  {'word/comments.xml':`<w:comments xmlns:w="${W}"><w:comment w:id="1"><w:p><w:r><w:t>Comment</w:t></w:r></w:p></w:comment></w:comments>`},
 ];
 for(const extra of malicious)await assert.rejects(()=>readTextSource(fixture(extra)),/footnote|endnote|comment/i);
 for(const kind of ['footnote','endnote']){
  const body=`<w:p><w:r><w:t>Body</w:t><w:${kind}Reference w:id="1"/></w:r></w:p>`;
  await assert.rejects(()=>readTextSource(fixture({},body)),/Reference/);
  await assert.rejects(()=>readTextSource(source(docx([],{xml:`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`}))),/Reference/);
 }
});
test('note relationships must resolve to validated local canonical parts',async()=>{
 for(const extra of [
  {'word/_rels/document.xml.rels':relationships('missing.xml')},
  {'word/_rels/document.xml.rels':relationships('other.xml'),'word/other.xml':notes('footnote')},
  {'word/_rels/document.xml.rels':relationships('footnotes.xml','TargetMode="External"')},
 ])await assert.rejects(()=>readTextSource(fixture(extra)),/relationship|additional part/i);
});
