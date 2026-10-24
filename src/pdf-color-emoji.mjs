import {wantsColorEmoji} from './pdf-emoji-style.mjs';

/** Embed each needed offline color bitmap once per PDF, preserving original text. */
export async function prepareColorEmoji(pdf,texts,{signal}={}){
 const result=new Map(),wanted=new Set();
 const segmenter=new Intl.Segmenter('en',{granularity:'grapheme'});
 const abort=()=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
 abort();
 for(const text of texts)for(const {segment} of segmenter.segment(text))if(wantsColorEmoji(segment))wanted.add(segment);
 if(!wanted.size)return result;
 const {default:assets}=await import('./emoji-color-vendor.mjs');
 const embedded=new Map();let count=0;
 for(const text of wanted){
  abort();
  // VS16 selects emoji presentation; the pinned asset keys omit that selector.
  const key=Array.from(text).filter(c=>c!=='\uFE0F').map(c=>c.codePointAt(0).toString(16)).join('-');
  const index=assets.sequences[key];
  if(index===undefined)continue; // Preserve the existing outline for newer symbols.
  if(!embedded.has(index)){
   const asset=assets.images[index];
   const bytes=Uint8Array.from(atob(asset.png),c=>c.charCodeAt(0));
   const image=await pdf.embedPng(bytes);
   embedded.set(index,{image,left:asset.left,bottom:asset.bottom,width:asset.width,height:asset.height});
  }
  result.set(text,embedded.get(index));
  if(++count%20===0){await new Promise(resolve=>setTimeout(resolve,0));abort();}
 }
 return result;
}
