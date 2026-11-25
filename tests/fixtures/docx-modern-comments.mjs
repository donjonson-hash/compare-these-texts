import {docx, W} from './text-fixture.mjs';

export function annotatedWord(body = 'Price 100 USD', changeParts = () => {}) {
  const word14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
  const word15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
  const cid = 'http://schemas.microsoft.com/office/word/2016/wordml/cid';
  const cex = 'http://schemas.microsoft.com/office/word/2018/wordml/cex';
  const extensions = {
    commentsExtended: ['2011', `<m:commentsEx xmlns:m="${word15}"><m:commentEx m:paraId="00000011" m:done="1"/><m:commentEx m:paraId="00000012" m:paraIdParent="00000011"/></m:commentsEx>`],
    commentsIds: ['2016/09', `<m:commentsIds xmlns:m="${cid}"><m:commentId m:paraId="00000011" m:durableId="10000001"/><m:commentId m:paraId="00000012" m:durableId="10000002"/></m:commentsIds>`],
    commentsExtensible: ['2018/08', `<m:commentsExtensible xmlns:m="${cex}"><m:commentExtensible m:durableId="10000001"/></m:commentsExtensible>`],
    people: ['2011', `<m:people xmlns:m="${word15}"><m:person m:author="Reviewer"><m:presenceInfo m:providerId="None" m:userId="Reviewer"/></m:person></m:people>`],
  };
  const content = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parts = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${content}document.main+xml"/>${['comments', ...Object.keys(extensions)].map(name => `<Override PartName="/word/${name}.xml" ContentType="${content}${name}+xml"/>`).join('')}</Types>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rC" Type="${rel}/comments" Target="comments.xml"/>${Object.entries(extensions).map(([name, [year]]) => `<Relationship Id="${name}" Type="http://schemas.microsoft.com/office/${year}/relationships/${name}" Target="${name}.xml"/>`).join('')}</Relationships>`,
    'word/comments.xml': `<w:comments xmlns:w="${W}" xmlns:w14="${word14}"><w:comment w:id="0" w:author="Reviewer"><w:p w14:paraId="00000010"/><w:p w14:paraId="00000011"><w:r><w:t>PRIVATE annotation</w:t></w:r></w:p></w:comment><w:comment w:id="1" w:author="Second reviewer"><w:p w14:paraId="00000012"><w:r><w:t>PRIVATE reply</w:t></w:r></w:p></w:comment></w:comments>`,
    ...Object.fromEntries(Object.entries(extensions).map(([name, [, xml]]) => ['word/' + name + '.xml', xml])),
  };
  changeParts(parts);
  return docx([], {extraEntries:parts, xml:`<w:document xmlns:w="${W}"><w:body><w:p><w:commentRangeStart w:id="0"/><w:r><w:t>${body}</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p></w:body></w:document>`});
}
