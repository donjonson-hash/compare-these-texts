import {docx,W} from './text-fixture.mjs';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const source=bytes=>({name:'template-notes.docx',data:Buffer.from(bytes).toString('base64')});
export const notes=kind=>`<w:${kind}s xmlns:w="${W}"><w:${kind} w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:separator/></w:r></w:p></w:${kind}><w:${kind} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${kind}></w:${kind}s>`;
export const relationships=(target='footnotes.xml',mode='')=>`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="fn" Type="${R}/footnotes" Target="${target}" ${mode}/><Relationship Id="en" Type="${R}/endnotes" Target="endnotes.xml"/></Relationships>`;
export function emptyNotesFixture(extra={},body){return source(docx(['Original body'],{...(body?{xml:`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`}:{}),extraEntries:{'word/footnotes.xml':notes('footnote'),'word/endnotes.xml':notes('endnote'),'word/_rels/document.xml.rels':relationships(),...extra}}));}
