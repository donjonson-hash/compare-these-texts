import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {compareText} from '../dist/text-engine.mjs';
import editor from '../dist/text-editor.js';
import {readTextSource} from '../dist/text-source.mjs';
import {readDocxVisual,writeDocxVisual,projectDocxVisual} from '../dist/docx-visual.mjs';
import {unzipDocument} from '../dist/text-zip.mjs';
import {mountVisualReview} from '../dist/visual-review.mjs';
import {mountSingleEditor} from '../dist/single-editor.mjs';
import {vmlFixture,vmlPicture,R} from './fixtures/docx-vml-fixture.mjs';
import {W} from './fixtures/text-fixture.mjs';

const source=bytes=>({name:'edited-ocr.docx',data:Buffer.from(bytes).toString('base64')});
const images=model=>model.blocks.flatMap(block=>block.runs.filter(run=>run.image).map(run=>run.image.src));
function combined(label){
 const field=`<w:r><w:fldChar w:fldCharType="begin"/><w:instrText> HYPERLINK &quot;https://example.test/contact&quot; </w:instrText><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>${label}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
 return vmlFixture({body:`<w:p><w:r><w:t>Shared title</w:t></w:r></w:p><w:p><w:r>${vmlPicture}<w:t>Contact: </w:t></w:r>${field}</w:p><w:p><w:r><w:t>Shared ending</w:t></w:r></w:p>`,extra:{
  'word/footnotes.xml':`<w:footnotes xmlns:w="${W}"><w:footnote w:id="0" w:type="separator"><w:p><w:r/></w:p></w:footnote><w:footnote w:id="1" w:type="continuationSeparator"><w:p><w:r/></w:p></w:footnote></w:footnotes>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="embedded" Type="${R}/image" Target="media/picture.png"/><Relationship Id="duplicate" Type="${R}/image" Target="media/picture.png" TargetMode="External"/><Relationship Id="notes" Type="${R}/footnotes" Target="footnotes.xml"/></Relationships>`,
 }});
}

test('combined OCR constructs survive compare, Use A, undo, manual edit, and DOCX re-import',async()=>{
 const sources={left:combined('Contact A'),right:combined('Contact B')},report=await compareText(sources),draft=editor.create(report,'right');
 const group=report.changed.find(item=>item.right.text.includes('Contact B'));assert.ok(group);
 const immutableReport=JSON.stringify(report),original=draft.snapshot(),model=await readDocxVisual(sources.right),originalImages=images(model);
 assert.equal(originalImages.length,1);
 draft.apply(group.key);assert.match(draft.text(),/Contact A/);assert.doesNotMatch(draft.text(),/Contact B/);
 draft.apply(group.key);draft.undo();assert.deepEqual(draft.entries(),original.entries,'Repeated Use A is idempotent; one undo restores B');
 draft.edit(group.key,'Contact: Edited name');draft.endEdit();
 const projected=projectDocxVisual(model,draft.entries());assert.deepEqual(images(projected),originalImages);
 const bytes=await writeDocxVisual(sources.right,[],{sequence:draft.entries()}),reloaded=await readDocxVisual(source(bytes));
 assert.deepEqual(reloaded.blocks.map(block=>block.text),projected.blocks.map(block=>block.text));assert.deepEqual(images(reloaded),originalImages);
 const before=await unzipDocument(Buffer.from(sources.right.data,'base64')),after=await unzipDocument(bytes);
 for(const [path,content] of before)if(path!=='word/document.xml')assert.deepEqual(after.get(path),content,path);
 const xml=new TextDecoder().decode(after.get('word/document.xml'));assert.doesNotMatch(xml,/<w:(?:fldChar|instrText)\b/);assert.match(xml,/<w:b\b/);
 assert.equal(JSON.stringify(report),immutableReport,'Editing never changes source comparison');
 const noAnchor=draft.entries().filter(entry=>entry.record!==2),retained=projectDocxVisual(model,noAnchor),retainedBytes=await writeDocxVisual(sources.right,[],{sequence:noAnchor});
 assert.deepEqual(images(retained),originalImages);assert.deepEqual(images(await readDocxVisual(source(retainedBytes))),originalImages);
 assert.deepEqual((await readTextSource(source(retainedBytes))).blocks.map(block=>block.text),retained.blocks.map(block=>block.text));
});

test('framed OCR files show the PDF limitation before download in both editor modes',async t=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),root=dom.window.document.querySelector('main');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document});window.KristinaTextEditor=editor;window.Element.prototype.scrollIntoView=()=>{};
 t.after(()=>{dom.window.close();delete globalThis.window;delete globalThis.document;});
 const sources={left:vmlFixture({frame:true}),right:vmlFixture({frame:true})},report=await compareText(sources);
 for(const single of [false,true]){
  const view=single?await mountSingleEditor(root,{source:sources.left}):await mountVisualReview(root,{report,sources});
  try{for(const side of single?['left']:['left','right']){
   const select=root.querySelector(`[data-download-format="${side}"]`);assert.equal(select.value,'docx');assert.equal(select.querySelector('[value="pdf"]').disabled,true);
   assert.match(root.querySelector(`[data-docx-layout-note="${side}"]`).textContent,/framed image/);
   assert.ok(root.querySelector('.visual-paper img'),'Embedded picture appears in the editor');
  }}finally{view.dispose();root.replaceChildren();}
 }
});

test('both editor modes disclose hyperlink-field conversion before saving',async t=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),root=dom.window.document.querySelector('main');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document});window.KristinaTextEditor=editor;window.Element.prototype.scrollIntoView=()=>{};
 t.after(()=>{dom.window.close();delete globalThis.window;delete globalThis.document;});
 const sources={left:combined('Contact A'),right:combined('Contact B')},report=await compareText(sources);
 for(const single of [false,true]){
  const view=single?await mountSingleEditor(root,{source:sources.left}):await mountVisualReview(root,{report,sources});
  try{for(const side of single?['left']:['left','right'])assert.match(root.querySelector(`[data-docx-field-note="${side}"]`).textContent,/field and its link are removed/);}
  finally{view.dispose();root.replaceChildren();}
 }
});
