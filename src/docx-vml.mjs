/** Bounded legacy Word picture support. VML is inspected, never executed. */
const W=new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']);
const V='urn:schemas-microsoft-com:vml',O='urn:schemas-microsoft-com:office:office',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',RS='http://purl.oclc.org/ooxml/officeDocument/relationships';
const elements=n=>Array.from(n?.childNodes||[]).filter(c=>c.nodeType===1);
const is=(n,ns,name)=>n?.namespaceURI===ns&&n.localName===name;
const word=(n,name)=>W.has(n?.namespaceURI)&&n.localName===name;
const descendants=n=>{const result=[],stack=[n];while(stack.length){const next=stack.pop();result.push(next);stack.push(...elements(next));}return result;};
const reference=(n,name)=>n.getAttributeNS(R,name)||n.getAttributeNS(RS,name);
const unsupported=()=>{throw new Error('DOCX: this legacy picture is not supported. Use an embedded PNG or JPEG image without cropping, rotation or other drawing effects.');};
const imageRel=r=>r&&[R+'/image',RS+'/image'].includes(r.getAttribute('Type'));
const target=r=>r?.getAttribute('Target');
const canonical=t=>/^media\/[^/\\?#\x00-\x20]+\.(?:png|jpe?g)$/i.test(t||'');
const relations=docs=>elements(docs?.get('word/_rels/document.xml.rels')?.documentElement);
function uniqueRelationship(rels,id){const matches=rels.filter(r=>r.getAttribute('Id')===id);return id&&matches.length===1?matches[0]:null;}
function attributes(node,plain=[],namespaced={}){
  for(const a of Array.from(node.attributes||[]))if(a.namespaceURI!=='http://www.w3.org/2000/xmlns/'&&!(a.namespaceURI?namespaced[a.namespaceURI]?.includes(a.localName):plain.includes(a.localName)))unsupported();
}
const formulas=['if lineDrawn pixelLineWidth 0','sum @0 1 0','sum 0 0 @1','prod @2 1 2','prod @3 21600 pixelWidth','prod @3 21600 pixelHeight','sum @0 0 1','prod @6 1 2','prod @7 21600 pixelWidth','sum @8 21600 0','prod @7 21600 pixelHeight','sum @10 21600 0'];
function validateType(type){
  attributes(type,['id','coordsize','path','filled','stroked'],{[O]:['spt','preferrelative']});
  if(type.getAttribute('coordsize')!=='21600,21600'||type.getAttributeNS(O,'spt')!=='75'||!['t','true','1'].includes(type.getAttributeNS(O,'preferrelative'))||type.getAttribute('path')!=='m@4@5l@4@11@9@11@9@5xe'||!['f','false','0'].includes(type.getAttribute('filled'))||!['f','false','0'].includes(type.getAttribute('stroked')))unsupported();
  const nodes=elements(type);if(nodes.length!==4||!is(nodes[0],V,'stroke')||!is(nodes[1],V,'formulas')||!is(nodes[2],V,'path')||!is(nodes[3],O,'lock'))unsupported();
  const [stroke,formulaSet,path,lock]=nodes;
  attributes(stroke,['joinstyle']);if(stroke.getAttribute('joinstyle')!=='miter'||elements(stroke).length)unsupported();
  attributes(formulaSet);const items=elements(formulaSet);if(items.length!==formulas.length)unsupported();
  items.forEach((f,i)=>{attributes(f,['eqn']);if(!is(f,V,'f')||elements(f).length||f.getAttribute('eqn')!==formulas[i])unsupported();});
  attributes(path,['gradientshapeok'],{[O]:['extrusionok','connecttype']});
  if(elements(path).length||!['f','false','0'].includes(path.getAttributeNS(O,'extrusionok'))||!['t','true','1'].includes(path.getAttribute('gradientshapeok'))||path.getAttributeNS(O,'connecttype')!=='rect')unsupported();
  attributes(lock,['aspectratio'],{[V]:['ext']});if(elements(lock).length||lock.getAttributeNS(V,'ext')!=='edit'||!['t','true','1'].includes(lock.getAttribute('aspectratio')))unsupported();
}
export const isVmlPicture=node=>word(node,'pict')&&elements(node).some(n=>is(n,V,'shape'));
/** Permit an OCR exporter's duplicate href only when every use points at the same embedded image. */
export function isRedundantVmlImageRelationship(rel,docs){
  if(!imageRel(rel)||rel.getAttribute('TargetMode')!=='External'||!canonical(target(rel)))return false;
  const rels=relations(docs),id=rel.getAttribute('Id');if(uniqueRelationship(rels,id)!==rel)return false;
  const document=docs?.get('word/document.xml')?.documentElement;if(!document)return false;
  let uses=0;
  for(const node of descendants(document))for(const a of Array.from(node.attributes||[])){
    if(![R,RS].includes(a.namespaceURI)||a.value!==id)continue;
    if(!is(node,V,'imagedata')||a.localName!=='href'||!is(node.parentNode,V,'shape')||!word(node.parentNode.parentNode,'pict'))return false;
    const embedded=uniqueRelationship(rels,reference(node,'id'));
    if(!imageRel(embedded)||!['',null,'Internal'].includes(embedded.getAttribute('TargetMode'))||target(embedded)!==target(rel))return false;
    uses++;
  }
  return uses>0;
}
export function inspectVmlPicture(pict,entries,docs){
  if(!word(pict,'pict')||!word(pict.parentNode,'r')||pict.textContent.trim())unsupported();
  attributes(pict);const children=elements(pict);
  if(children.length!==2||!is(children[0],V,'shapetype')||!is(children[1],V,'shape'))unsupported();
  const [type,shape]=children;validateType(type);
  attributes(shape,['id','type','style']);
  const typeId=type.getAttribute('id');if(!/^[_A-Za-z][\w.-]{0,127}$/.test(typeId||'')||shape.getAttribute('type')!=='#'+typeId)unsupported();
  const style={};for(const decl of (shape.getAttribute('style')||'').split(';').filter(x=>x.trim())){
    const match=/^\s*(width|height)\s*:\s*(\d+(?:\.\d+)?)(pt|px)\s*$/i.exec(decl);if(!match||Object.hasOwn(style,match[1].toLowerCase()))unsupported();
    style[match[1].toLowerCase()]=Number(match[2])*(match[3].toLowerCase()==='pt'?4/3:1);
  }
  if(![style.width,style.height].every(n=>Number.isFinite(n)&&n>0&&n<=5000))unsupported();
  const images=elements(shape);if(images.length!==1||!is(images[0],V,'imagedata')||elements(images[0]).length)unsupported();
  const image=images[0];attributes(image,[],{[R]:['id','href'],[RS]:['id','href']});
  for(const name of ['id','href'])if(image.hasAttributeNS(R,name)&&image.hasAttributeNS(RS,name))unsupported();
  const rels=relations(docs),rel=uniqueRelationship(rels,reference(image,'id'));
  if(!imageRel(rel)||!['',null,'Internal'].includes(rel.getAttribute('TargetMode'))||!canonical(target(rel)))unsupported();
  const href=reference(image,'href');if(href){const duplicate=uniqueRelationship(rels,href);if(!imageRel(duplicate)||target(duplicate)!==target(rel)||!(duplicate.getAttribute('TargetMode')==='External'?isRedundantVmlImageRelationship(duplicate,docs):['',null,'Internal'].includes(duplicate.getAttribute('TargetMode'))))unsupported();}
  const path='word/'+target(rel),bytes=entries?.get(path);if(!bytes)unsupported();
  return {path,bytes,width:style.width,height:style.height,alt:''};
}
