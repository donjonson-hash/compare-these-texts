import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readDocxVisual,projectDocxVisual} from '../dist/docx-visual.mjs';
import {renderDocxPdf} from '../dist/docx-pdf.mjs';
import {getDocument} from '../dist/pdf-reader-vendor.mjs';
import {textboxFixture} from './fixtures/docx-textbox-fixture.mjs';
import {tableSource} from './fixtures/table-fixture.mjs';
const require=createRequire(import.meta.url),native=require('@napi-rs/canvas');
const sequence=model=>model.blocks.map(b=>({record:b.record,key:'p-'+b.record,text:b.text}));
async function withPdf(bytes,fn){const task=getDocument({data:bytes.slice(),useSystemFonts:false,disableFontFace:true,isEvalSupported:false,verbosity:0});try{return await fn(await task.promise);}finally{await task.destroy();}}
async function pageText(doc,n){const content=await(await doc.getPage(n)).getTextContent();return content.items.map(x=>x.str).join(' ');}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.015,`${actual} != ${expected}`);

test('Word PDF draws positioned header text and flat horizontal rules after edits',async()=>{
 const model=await readDocxVisual(textboxFixture({geometry:true,choice:'Sample compact header',fallback:'Sample compact header'})),seq=sequence(model);seq[0].text='Edited body';let layout;
 const projected=projectDocxVisual(model,seq),bytes=await renderDocxPdf(projected,{onLayout:x=>layout=x});
 await withPdf(bytes,async doc=>{assert.equal(doc.numPages,1);const text=await pageText(doc,1);assert.match(text,/Sample compact header/);assert.match(text,/Edited body/);assert.doesNotMatch(text,/Original body/);});
 const box=layout.find(x=>x.type==='textbox'),header=layout.find(x=>x.region==='header'&&!x.type),rule=layout.find(x=>x.type==='horizontal-rule');
 assert.ok(box&&header&&rule);close(box.x,0);close(box.y,0);close(box.width,122.45);close(box.height,28.15);
 close(header.x,20);close(header.y,15);close(header.height,13);assert.ok(header.y+header.height<=box.y+box.height);
 close(rule.height,1.5);close(rule.width,(model.page.width-model.page.marginLeft-model.page.marginRight)*.75);assert.equal(rule.color,'#808080');
 assert.ok(layout.filter(x=>x.region==='body').every(x=>x.y>box.y+box.height));
 // Verify actual pixels as well as metadata: the rectangle and blue text must
 // really be emitted into the PDF, not only reported by the layout callback.
 const globals=['DOMMatrix','Path2D','ImageData'],old=Object.fromEntries(globals.map(k=>[k,globalThis[k]]));Object.assign(globalThis,Object.fromEntries(globals.map(k=>[k,native[k]])));
 try{await withPdf(bytes,async doc=>{
   const page=await doc.getPage(1),viewport=page.getViewport({scale:3}),canvas=native.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext('2d');
   await page.render({canvasContext:context,viewport}).promise;
   const pixel=Array.from(context.getImageData(Math.round((rule.x+rule.width/2)*3),Math.round((rule.y+rule.height/2)*3),1,1).data);
   for(const value of pixel.slice(0,3))assert.ok(Math.abs(value-128)<=2,JSON.stringify(pixel));
   const pixels=context.getImageData(60,45,Math.ceil(header.width*3),Math.ceil(header.height*3)).data;let blue=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i+2]>pixels[i]+50&&pixels[i+2]>pixels[i+1]+25)blue++;
   assert.ok(blue>20,'Header text retains its blue run color');
 });}finally{for(const k of globals)if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k];}
});

test('Word textbox page variants and footer bounds reserve room around the PDF body',async()=>{
 const model=await readDocxVisual(textboxFixture({geometry:true,rule:false})),template=model.peripheralTextboxes.header.default[0],paragraph=template.blocks[0];
 const makeBox=(text,y=65)=>({...template,y,blocks:[{...paragraph,text,runs:[{...paragraph.runs[0],text}]}]});
 model.peripherals.firstPage=true;model.peripherals.evenPages=true;
 model.peripheralTextboxes.header={first:[makeBox('First header')],even:[makeBox('Even header')],default:[makeBox('Default header')]};
 const footerY=model.page.height*.75-90;
 model.peripheralTextboxes.footer={first:[makeBox('First footer',footerY)],even:[makeBox('Even footer',footerY)],default:[makeBox('Default footer',footerY)]};
 model.blocks=Array.from({length:3},(_,i)=>({...model.blocks[0],record:i+1,text:'Body '+(i+1),runs:[{text:'Body '+(i+1),style:{}}],pageBreakBefore:i>0}));
 let layout;const bytes=await renderDocxPdf(model,{onLayout:x=>layout=x});
 await withPdf(bytes,async doc=>{assert.equal(doc.numPages,3);for(let i=1;i<=3;i++){const type=['First','Even','Default'][i-1],text=await pageText(doc,i);assert.match(text,new RegExp(type+' header'));assert.match(text,new RegExp(type+' footer'));assert.match(text,new RegExp('Body '+i));}});
 for(let i=1;i<=3;i++){
   const body=layout.filter(x=>x.page===i&&x.region==='body'),head=layout.find(x=>x.page===i&&x.region==='header'&&x.type==='textbox'),foot=layout.find(x=>x.page===i&&x.region==='footer'&&x.type==='textbox');
   assert.ok(body.every(x=>x.y>=head.y+head.height+6-.01&&x.y+x.height<=foot.y-6+.01));
   assert.equal(head.variant,['first','even','default'][i-1]);
 }
});

test('Word textbox PDF refuses wrapping, vertical overflow and invalid bounds without clipping',async()=>{
 for(const edit of [box=>box.height=20,box=>box.width=45,box=>box.y=-1,box=>box.x=10000,box=>box.blocks[0].runs[0].text='Line one\nLine two']){
   const model=await readDocxVisual(textboxFixture({geometry:true}));model.peripheralTextboxes.header.default[0].autoFit='none';edit(model.peripheralTextboxes.header.default[0]);
   await assert.rejects(()=>renderDocxPdf(model),/text box.*(?:fits|bounds|space)|fits.*text box/i);
 }
});

test('Word rules align inside table-cell content bounds and reject oversized widths',async()=>{
 const model=await readDocxVisual(tableSource()),block=model.blocks.find(b=>b.text==='Товар');
 block.horizontalRules=[{width:null,height:1.5,color:'#123456',align:'center'},{width:30,height:2,color:'#808080',align:'right'}];
 let layout;await renderDocxPdf(model,{onLayout:x=>layout=x});
 const line=layout.find(x=>x.record===block.record&&!x.type),rules=layout.filter(x=>x.record===block.record&&x.type==='horizontal-rule');assert.equal(rules.length,2);
 close(rules[0].x,line.x);close(rules[0].width,line.width);close(rules[1].x,line.x+line.width-30);close(rules[1].width,30);
 assert.ok(rules[0].y>=line.y+line.height);assert.ok(rules[1].y>=rules[0].y+rules[0].height);
 block.horizontalRules[0].width=10000;await assert.rejects(()=>renderDocxPdf(model),/horizontal rule does not fit/);
});


test('Word explicit shape auto-fit expands a no-wrap text box without clipping beyond the page',async()=>{
 const model=await readDocxVisual(textboxFixture({geometry:true,choice:'A compact document label',fallback:'A compact document label'}));let layout;
 const original=model.peripheralTextboxes.header.default[0];assert.equal(original.autoFit,'shape');
 const bytes=await renderDocxPdf(model,{onLayout:x=>layout=x}),box=layout.find(x=>x.type==='textbox');
 assert.ok(box.width>original.width);close(box.sourceWidth,original.width);assert.ok(box.x+box.width<=model.page.width*.75);
 await withPdf(bytes,async doc=>assert.match(await pageText(doc,1),/A compact document label/));
 assert.equal(original.width,122.45,'Rendering does not mutate the source geometry');
 original.blocks[0].runs[0].text='Overflow '.repeat(100);await assert.rejects(()=>renderDocxPdf(model),/fits.*text box/i);
});
