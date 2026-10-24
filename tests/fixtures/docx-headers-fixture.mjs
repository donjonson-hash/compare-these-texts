import {docx,W} from './text-fixture.mjs';
const source=(name,data)=>({name,data:Buffer.from(data).toString('base64')});
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function peripheralFixture({differentPages=false,largeHeader=false,sectionExtra='',bodyExtra=''}={}){
 const kinds=differentPages?['default','first','even']:['default'];
 const extraEntries={},refs=[],rels=[];
 for(const kind of ['header','footer'])for(const [i,type] of kinds.entries()){
  const id=kind+i,path=kind+(i+1)+'.xml';refs.push(`<w:${kind}Reference w:type="${type}" r:id="${id}"/>`);rels.push(`<Relationship Id="${id}" Type="${R}/${kind}" Target="${path}"/>`);
  const pPr='<w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>';
  const text=kind==='header'?`<w:r><w:rPr><w:b/><w:color w:val="205A48"/></w:rPr><w:t>${type} header</w:t>${largeHeader?Array.from({length:6},(_,i)=>`<w:br/><w:t>Header line ${i+1}</w:t>`).join(''):''}</w:r>`:`<w:r><w:t>${type} footer — Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>98</w:t></w:r></w:fldSimple><w:r><w:t> of </w:t></w:r><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>99</w:t></w:r></w:fldSimple>`;
  extraEntries['word/'+path]=`<w:${kind==='header'?'hdr':'ftr'} xmlns:w="${W}"><w:p>${pPr}${text}</w:p></w:${kind==='header'?'hdr':'ftr'}>`;
 }
 extraEntries['word/_rels/document.xml.rels']=`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
 if(differentPages)extraEntries['word/settings.xml']=`<w:settings xmlns:w="${W}"><w:evenAndOddHeaders/></w:settings>`;
 return source('with-headers.docx',docx([],{extraEntries,xml:`<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${[1,2,3].map(i=>`<w:p>${i>1?'<w:pPr><w:pageBreakBefore/></w:pPr>':''}<w:r><w:t>Body page ${i}</w:t></w:r></w:p>`).join('')}${bodyExtra}<w:sectPr>${refs.join('')}${differentPages?'<w:titlePg/>':''}<w:pgMar w:top="1080" w:bottom="1080" w:left="1080" w:right="1080" w:header="360" w:footer="360"/>${sectionExtra}</w:sectPr></w:body></w:document>`}));
}
