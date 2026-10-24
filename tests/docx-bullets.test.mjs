import {test} from 'node:test';
import assert from 'node:assert/strict';
import {docx,W,escapeXml} from './fixtures/text-fixture.mjs';
import {readTextSource} from '../dist/text-source.mjs';
import {readDocxVisual,writeDocxVisual} from '../dist/docx-visual.mjs';
import {renderDocxPdf} from '../dist/docx-pdf.mjs';
import {getDocument} from '../dist/pdf-reader-vendor.mjs';
import {unzipDocument} from '../dist/text-zip.mjs';
import {handleRequest} from '../dist/worker.mjs';

const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const source=bytes=>({name:'synthetic-bullets.docx',data:Buffer.from(bytes).toString('base64')});
const markers=[
 {font:'Wingdings',char:'\uF06C',label:'⚫',text:'First synthetic list item'},
 {font:'Wingdings',char:'\uF0E8',label:'🡺',text:'Second synthetic list item'},
 {font:'Wingdings',char:'\uF0D8',label:'➢',text:'Third synthetic list item'},
 {font:'OpenSymbol',char:'■',label:'■',text:'Fourth synthetic list item'},
 {font:'OpenSymbol',char:'◆',label:'◆',text:'Fifth synthetic list item'},
];
function level(index,font,char){
 return `<w:lvl w:ilvl="${index}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${escapeXml(char)}"/><w:lvlJc w:val="start"/><w:pPr><w:ind w:start="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr></w:lvl>`;
}
function fixture(items=markers,{usedLevel=0,unusedFont='Wingdings 2',unusedChar='\uF081'}={}){
 const templates=items.map((item,i)=>`<w:abstractNum w:abstractNumId="${i+1}">${level(0,item.font,item.char)}${level(1,unusedFont,unusedChar)}</w:abstractNum>`).join('');
 const instances=items.map((_,i)=>`<w:num w:numId="${i+1}"><w:abstractNumId w:val="${i+1}"/></w:num>`).join('');
 const body=items.map((item,i)=>`<w:p><w:pPr><w:numPr><w:ilvl w:val="${usedLevel}"/><w:numId w:val="${i+1}"/></w:numPr></w:pPr><w:r><w:t>${escapeXml(item.text)}</w:t></w:r></w:p>`).join('');
 return source(docx([],{deflate:true,xml:`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,extraEntries:{
  'word/numbering.xml':`<w:numbering xmlns:w="${W}">${templates}${instances}</w:numbering>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="numbering" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
  'word/styles.xml':`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
  'docProps/core.xml':'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Synthetic regression fixture</dc:title></cp:coreProperties>',
 }}));
}

test('symbol-font bullets and Unicode OpenSymbol bullets import without entering compared body text',async()=>{
 const src=fixture(),parsed=await readTextSource(src),visual=await readDocxVisual(src);
 assert.deepEqual(parsed.blocks.map(b=>b.text),markers.map(m=>m.text));
 assert.deepEqual(visual.blocks.map(b=>b.list.label),markers.map(m=>m.label));
 assert.ok(visual.blocks.every(b=>b.list.fontFamily===''));
 const rawBytes=markers.slice(0,3).map(m=>({...m,char:String.fromCodePoint(m.char.codePointAt(0)-0xF000)}));
 assert.deepEqual((await readDocxVisual(fixture(rawBytes))).blocks.map(b=>b.list.label),markers.slice(0,3).map(m=>m.label));
 const {report}=await handleRequest('/api/compare',{left:src,right:src});
 assert.equal(report.changed.length,0);
 assert.equal(report.only_left.length,0);
 assert.equal(report.only_right.length,0);
 assert.equal(report.matched.length,markers.length);
});

test('editing a bulleted DOCX preserves numbering and every untouched package part and compares the edit',async()=>{
 const src=fixture(),text='Second synthetic list item updated';
 const exported=await writeDocxVisual(src,[{record:2,text}]),after=source(exported);
 const beforeParts=await unzipDocument(Buffer.from(src.data,'base64')),afterParts=await unzipDocument(exported);
 assert.deepEqual([...afterParts.keys()].sort(),[...beforeParts.keys()].sort());
 for(const [path,content] of beforeParts)if(path!=='word/document.xml')assert.deepEqual(afterParts.get(path),content,path);
 assert.notDeepEqual(afterParts.get('word/document.xml'),beforeParts.get('word/document.xml'));
 const visual=await readDocxVisual(after);
 assert.deepEqual(visual.blocks.map(b=>b.list.label),markers.map(m=>m.label));
 assert.deepEqual(visual.blocks.map(b=>b.text),markers.map((m,i)=>i===1?text:m.text));
 const {report}=await handleRequest('/api/compare',{left:src,right:after});
 assert.equal(report.changed.length,1);
 assert.equal(report.only_left.length,0);
 assert.equal(report.only_right.length,0);
 assert.equal(report.matched.length,markers.length-1);
});

test('unused exotic list levels are harmless but using an unmapped symbol rejects import',async()=>{
 const normal=[{font:'Calibri',char:'•',text:'Synthetic list body'}];
 assert.equal((await readDocxVisual(fixture(normal))).blocks[0].list.label,'•');
 for(const src of [
  fixture(normal,{usedLevel:1}),
  fixture([{...normal[0],font:'Wingdings',char:'\uF001'}]),
  fixture([{...normal[0],font:'Calibri',char:'\uE123'}]),
  fixture([{...normal[0],font:'OpenSymbol',char:'\uF081'}]),
 ]){
  await assert.rejects(()=>readTextSource(src),/list bullet symbol is not yet supported/);
  await assert.rejects(()=>readDocxVisual(src),/list bullet symbol is not yet supported/);
 }
});

test('Word PDF export keeps every bullet including the supplementary-plane arrow as extractable Unicode',async()=>{
 const original=fixture(),edited=source(await writeDocxVisual(original,[{record:2,text:'Second synthetic list item updated'}]));
 for(const src of [original,edited]){
  const model=await readDocxVisual(src),bytes=await renderDocxPdf(model);
  const loading=getDocument({data:bytes.slice(),useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,useWasm:false,isEvalSupported:false,verbosity:0});
  try{
   const pdf=await loading.promise,parts=[];
   for(let page=1;page<=pdf.numPages;page++)parts.push(...(await (await pdf.getPage(page)).getTextContent()).items.map(item=>item.str));
   const text=parts.join(' ');
   for(const {label} of markers)assert.equal([...text].filter(char=>char===label).length,1,`PDF preserves the ${label} marker exactly once`);
   for(const block of model.blocks)assert.ok(text.includes(block.text),`PDF retains ${block.text}`);
   assert.ok(text.indexOf('🡺')<text.indexOf(model.blocks[1].text),'The arrow remains before its list item');
   assert.doesNotMatch(text,/[\uE000-\uF8FF\uFFFD]/u,'No unmapped private-use or replacement characters escape into the PDF');
  }finally{await loading.destroy();}
 }
});

test('Word PDF refuses characters absent from its fonts instead of substituting a bullet',async()=>{
 // This deliberately unassigned Unicode scalar has no glyph in either font.
 for(const item of [
  {font:'Calibri',char:'\u0378',text:'Synthetic body'},
  {font:'Calibri',char:'•',text:'Synthetic body \u0378'},
 ]){
  const model=await readDocxVisual(fixture([item]));
  await assert.rejects(()=>renderDocxPdf(model),/character.*fonts cannot display/i);
 }
});

test('Word PDF keeps mixed bold and normal Latin, Cyrillic and simple emoji searchable',async()=>{
 const src=source(docx([],{xml:`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t xml:space="preserve">Normal English текст 👩 </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Bold Русский 👆</w:t></w:r></w:p></w:body></w:document>`}));
 const model=await readDocxVisual(src),pdfBytes=await renderDocxPdf(model);
 const loading=getDocument({data:pdfBytes.slice(),useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,useWasm:false,isEvalSupported:false,verbosity:0});
 try{
  const pdf=await loading.promise,parts=[];
  for(let page=1;page<=pdf.numPages;page++)parts.push(...(await (await pdf.getPage(page)).getTextContent()).items.map(item=>item.str));
  const text=parts.join('');
  for(const expected of ['Normal','English','текст','👩','Bold','Русский','👆'])assert.ok(text.includes(expected),`PDF searchable text retains ${expected}`);
  assert.doesNotMatch(text,/\uFFFD/u);
 }finally{await loading.destroy();}
});

test('Word PDF rejects unsupported composed emoji before producing a truncated or altered export',async()=>{
 for(const emoji of ['👩‍💻','👆🏻']){
  const src=source(docx([`Before ${emoji} after`])),model=await readDocxVisual(src);
  assert.equal(model.blocks[0].text,`Before ${emoji} after`,'DOCX import retains the composed emoji');
  await assert.rejects(()=>renderDocxPdf(model),/emoji sequence.*Download DOCX/i);
 }
});
