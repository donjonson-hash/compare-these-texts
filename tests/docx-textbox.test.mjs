import {test} from 'node:test';
import assert from 'node:assert/strict';
import {textboxFixture} from './fixtures/docx-textbox-fixture.mjs';
import {docx,W} from './fixtures/text-fixture.mjs';
import {readTextSource} from '../dist/text-source.mjs';
import {readDocxVisual,writeDocxVisual,projectDocxVisual} from '../dist/docx-visual.mjs';
import {renderDocxPdf} from '../dist/docx-pdf.mjs';
import {unzipDocument} from '../dist/text-zip.mjs';
const source=bytes=>({name:'synthetic.docx',data:Buffer.from(bytes).toString('base64')});
test('plain matching Word header textboxes open read-only, preserve DOCX and refuse inaccurate PDF layout',async()=>{
 const src=textboxFixture(),model=await readDocxVisual(src);
 assert.deepEqual(model.headersFooters,[{path:'word/header1.xml',kind:'header',text:'Sample header',complexLayout:true}]);
 assert.equal(model.blocks[0].list.label,'1.');assert.equal(model.blocks[1].hasHorizontalRule,true);
 await assert.rejects(()=>renderDocxPdf(model),/PDF export|text boxes|horizontal rules/i);
 const edited=await writeDocxVisual(src,[{record:1,text:'Edited body'}]);
 assert.equal((await readTextSource(source(edited))).blocks[0].text,'Edited body');
 const before=await unzipDocument(Buffer.from(src.data,'base64')),after=await unzipDocument(edited);
 for(const [path,bytes]of before)if(path!=='word/document.xml')assert.deepEqual(after.get(path),bytes,path);
 const sequence=[{record:1,text:'Edited body'}],projected=projectDocxVisual(model,sequence);
 const withoutRuleText=await writeDocxVisual(src,[],{sequence}),reopened=await readDocxVisual(source(withoutRuleText));
 assert.equal(projected.blocks.length,reopened.blocks.length);assert.equal(projected.blocks.length,2);
 assert.equal(projected.blocks[1].hasHorizontalRule,true);assert.equal(reopened.blocks[1].hasHorizontalRule,true);
});
test('different alternate text, unhandled graphic content and actual restart behavior stay rejected',async()=>{
 for(const options of [{fallback:'Different visible text'},{shape:'<a:blip r:embed="image1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>'},{restart:'1'},{restart:'unexpected'}])await assert.rejects(()=>readTextSource(textboxFixture(options)),/header|footer|restart/i);
 for(const restart of ['0','false','off'])assert.equal((await readDocxVisual(textboxFixture({restart}))).blocks[0].list.label,'1.');
});
test('only empty horizontal rule rectangles and formatting-only ligatures are admitted',async()=>{
 const wrap=body=>source(docx([],{xml:`<w:document xmlns:w="${W}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body><w:p><w:r>${body}</w:r></w:p></w:body></w:document>`}));
 for(const body of [
  '<w:pict><v:rect style="width:0;height:1pt"/></w:pict>',
  '<w:pict><v:rect o:hr="t" style="width:0;height:1pt"><w:t>Visible text</w:t></v:rect></w:pict>',
  '<w:pict><v:rect o:hr="t" style="width:0;height:1pt" href="https://example.org"/></w:pict>',
  '<w14:ligatures w14:val="standard"/>',
  '<w:rPr><w14:ligatures><w:t>Hidden text</w:t></w14:ligatures></w:rPr>',
 ])await assert.rejects(()=>readTextSource(wrap(body)),/horizontal rules|ligatures/i);
});
