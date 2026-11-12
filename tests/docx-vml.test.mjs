import test from 'node:test';
import assert from 'node:assert/strict';
import {readTextSource} from '../dist/text-source.mjs';
import {readDocxVisual,writeDocxVisual,projectDocxVisual} from '../dist/docx-visual.mjs';
import {renderDocxPdf} from '../dist/docx-pdf.mjs';
import {PDFDocument,PDFName} from '../dist/pdf-vendor.mjs';
import {unzipDocument} from '../dist/text-zip.mjs';
import {vmlFixture,vmlPicture,png,R} from './fixtures/docx-vml-fixture.mjs';
const source=bytes=>({name:'edited.docx',data:Buffer.from(bytes).toString('base64')});
const sequence=model=>model.blocks.map(b=>({record:b.record,text:b.text}));

test('legacy embedded picture previews, survives caption edits and is emitted into PDF',async()=>{
 const src=vmlFixture(),model=await readDocxVisual(src),image=model.blocks[0].runs[0].image;
 assert.deepEqual([image.width,image.height],[96,72]);assert.equal(image.src,'data:image/png;base64,'+png.toString('base64'));
 assert.equal(model.blocks[0].hasHorizontalRule,false);assert.deepEqual(model.pdfUnsupported,[]);
 const seq=sequence(model);seq[1].text='Revised caption';
 const changed=await writeDocxVisual(src,[],{sequence:seq}),before=await unzipDocument(Buffer.from(src.data,'base64')),after=await unzipDocument(changed);
 for(const [path,bytes] of before)if(path!=='word/document.xml')assert.deepEqual(after.get(path),bytes,path);
 assert.equal((await readDocxVisual(source(changed))).blocks[0].runs[0].image.src,image.src);
 assert.deepEqual((await readTextSource(source(changed))).blocks.map(b=>b.text),['','Revised caption']);
 const pdf=await PDFDocument.load(await renderDocxPdf(projectDocxVisual(model,seq)));
 assert.equal(pdf.getPageCount(),1);
 const xobjects=pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
 assert.ok(xobjects&&xobjects.keys().some(key=>xobjects.lookup(key).dict.get(PDFName.of('Subtype'))===PDFName.of('Image')),'PDF contains an embedded image object');
});

test('removing an image anchor retains picture in projected and exported document',async()=>{
 const src=vmlFixture(),model=await readDocxVisual(src),seq=sequence(model).slice(1),projected=projectDocxVisual(model,seq);
 assert.equal(projected.blocks.filter(b=>b.runs.some(r=>r.image)).length,1);
 const reloaded=await readDocxVisual(source(await writeDocxVisual(src,[],{sequence:seq})));
 assert.equal(reloaded.blocks.filter(b=>b.runs.some(r=>r.image)).length,1);
});

test('framed OCR image remains editable in DOCX but PDF refuses unsupported positioning',async()=>{
 const model=await readDocxVisual(vmlFixture({frame:true}));assert.ok(model.blocks[0].runs[0].image);
 await assert.rejects(()=>renderDocxPdf(model),/framed image/);
 const src=vmlFixture({frame:true}),output=await writeDocxVisual(src,[{record:2,text:'Edited'}]);
 const parts=await unzipDocument(output);assert.match(new TextDecoder().decode(parts.get('word/document.xml')),/framePr/);
});

test('VML rejects crop, transform, alternate shapes, templates and nonlocal image links',async()=>{
 const mutations=[
  s=>s.replace('r:id="embedded"','xmlns:rs="http://purl.oclc.org/ooxml/officeDocument/relationships" rs:id="duplicate" r:id="embedded"'),
  s=>s.replace('r:id="embedded"','cropleft="0.1" r:id="embedded"'),
  s=>s.replace('height:54pt;','height:54pt;rotation:90;'),
  s=>s.replace('height:54pt;','height:54pt;width:80pt;'),
  s=>s.replace('height:54pt;','height:0pt;'),
  s=>s.replace('o:spt="75"','o:spt="1"'),
  s=>s.replace('eqn="sum @0 1 0"','eqn="sum @0 100 0"'),
  s=>s.replace('<v:imagedata','<v:fill/><v:imagedata'),
  s=>s.replace('r:id="embedded"','r:id="duplicate"'),
  s=>s.replace('r:href="duplicate"','r:href="missing"'),
 ];
 for(const mutate of mutations)await assert.rejects(()=>readTextSource(vmlFixture({picture:mutate(vmlPicture)})),/legacy picture|external relationships/);
 const rels=(externalTarget,internalTarget='media/picture.png',extra='')=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="embedded" Type="${R}/image" Target="${internalTarget}"/><Relationship Id="duplicate" Type="${R}/image" Target="${externalTarget}" TargetMode="External"/>${extra}</Relationships>`;
 for(const target of ['https://example.test/image.png','../picture.png','media/other.png'])await assert.rejects(()=>readTextSource(vmlFixture({relationships:rels(target)})),/relationship|legacy picture|embedded PNG/);
 await assert.rejects(()=>readTextSource(vmlFixture({relationships:rels('media/picture.png','media/other.png'),extra:{'word/media/other.png':png}})),/relationship|legacy picture|embedded PNG/);
 // A valid-looking duplicate cannot also be used as a link elsewhere.
 await assert.rejects(()=>readTextSource(vmlFixture({body:`<w:p><w:r>${vmlPicture}</w:r><w:hyperlink r:id="duplicate"><w:r><w:t>Unexpected use</w:t></w:r></w:hyperlink></w:p>`})),/external relationships/);
 await assert.rejects(()=>readTextSource(vmlFixture({extra:{'word/media/picture.png':new Uint8Array([1,2,3])}})),/damaged|unsupported format/);
});
