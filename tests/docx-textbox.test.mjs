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
test('bounded header geometry and flat rules expose point coordinates without duplicating textbox text',async()=>{
 const src=textboxFixture({geometry:true}),model=await readDocxVisual(src),box=model.peripheralTextboxes.header.default[0];
 assert.deepEqual(model.pdfUnsupported,[]);
 assert.deepEqual(model.peripherals.header.default,[]);
 assert.deepEqual({x:box.x,y:box.y,width:box.width,height:box.height,insets:box.insets,verticalAlign:box.verticalAlign,wrap:box.wrap},{x:0,y:0,width:122.45,height:28.15,insets:{left:20,right:0,top:15,bottom:0},verticalAlign:'top',wrap:'none'});
 assert.equal(box.blocks.flatMap(block=>block.runs).map(run=>run.text).join(''),'Sample header');
 assert.equal(box.blocks[0].runs[0].style.fontSize,'10pt');assert.equal(box.blocks[0].runs[0].style.color,'#5F80CB');
 assert.deepEqual(model.blocks[1].horizontalRules,[{width:null,height:1.5,color:'#808080',align:'center'}]);
 const sequence=[{record:1,text:'Changed body'}],projected=projectDocxVisual(model,sequence),bytes=await writeDocxVisual(src,[],{sequence}),reopened=await readDocxVisual(source(bytes));
 assert.deepEqual(projected.blocks.map(block=>block.horizontalRules),reopened.blocks.map(block=>block.horizontalRules));
 assert.deepEqual(reopened.peripheralTextboxes,model.peripheralTextboxes);
 assert.ok(projectDocxVisual(model,[{record:1,text:'Body'},{record:2,text:'Added to separator'}]).pdfUnsupported.some(message=>/mixed/.test(message)));
 const before=await unzipDocument(Buffer.from(src.data,'base64')),after=await unzipDocument(bytes);
 for(const [path,original]of before)if(path!=='word/document.xml')assert.deepEqual(after.get(path),original,path);
});
test('textbox positions resolve margin anchors and offsets; unsupported geometry remains blocked',async()=>{
 const margin=await readDocxVisual(textboxFixture({geometry:true,positionH:'margin',positionV:'margin',offsetX:12700,offsetY:25400}));
 assert.equal(margin.peripheralTextboxes.header.default[0].x,margin.page.marginLeft*.75+1);
 assert.equal(margin.peripheralTextboxes.header.default[0].y,margin.page.marginTop*.75+2);
 const aligned=await readDocxVisual(textboxFixture({geometry:true,horizontal:'right',vertical:'bottom'})),box=aligned.peripheralTextboxes.header.default[0];
 assert.equal(box.x,aligned.page.width*.75-box.width);assert.equal(box.y,aligned.page.height*.75-box.height);
 for(const options of [{geometry:false},{geometry:true,rotate:'60000'},{geometry:true,positionH:'column'},{geometry:true,offsetX:-12700},{geometry:true,offsetY:999999999},{geometry:true,wrap:'unsupported'}]){
  const model=await readDocxVisual(textboxFixture(options));
  assert.ok(model.pdfUnsupported.some(message=>/text boxes/.test(message)),JSON.stringify(options));
 }
});
