import {docx,W,escapeXml} from './text-fixture.mjs';
import {notes} from './docx-empty-notes-fixture.mjs';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const horizontalRule='<w:pict><v:rect id="rule1" style="width:0;height:1.5pt" o:hr="t" fillcolor="gray" stroked="f"/></w:pict>';
export function textboxFixture({fallback='Sample header',choice='Sample header',shape='',rule=true,restart='0'}={}){
 const text=value=>`<w:txbxContent><w:p><w:r><w:t>${escapeXml(value)}</w:t></w:r></w:p></w:txbxContent>`;
 const header=`<w:hdr xmlns:w="${W}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"><w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData><wps:wsp><wps:txbx>${text(choice)}</wps:txbx>${shape}</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:shape><v:textbox>${text(fallback)}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p></w:hdr>`;
 const body=`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w14:ligatures w14:val="standard"/></w:rPr><w:t>Original body</w:t></w:r></w:p>${rule?`<w:p><w:r>${horizontalRule}</w:r></w:p>`:''}<w:sectPr><w:headerReference w:type="default" r:id="h"/></w:sectPr>`;
 const bytes=docx([],{xml:`<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><w:body>${body}</w:body></w:document>`,extraEntries:{
  'word/footnotes.xml':notes('footnote'),'word/endnotes.xml':notes('endnote'),'word/header1.xml':header,
  'word/numbering.xml':`<w:numbering xmlns:w="${W}" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w:abstractNum w:abstractNumId="1" w15:restartNumberingAfterBreak="${restart}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="h" Type="${R}/header" Target="header1.xml"/><Relationship Id="n" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="fn" Type="${R}/footnotes" Target="footnotes.xml"/><Relationship Id="en" Type="${R}/endnotes" Target="endnotes.xml"/></Relationships>`,
 }});
 return {name:'synthetic-textbox.docx',data:Buffer.from(bytes).toString('base64')};
}
