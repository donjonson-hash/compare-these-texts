import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import '../dist/i18n.js';
import {mountFindReplace} from '../dist/find-replace.mjs';
import {mountVisualReview} from '../dist/visual-review.mjs';
import {compareText} from '../dist/text-engine.mjs';
import editor from '../dist/text-editor.js';
import {uiMessage,uiSetText} from '../dist/ui-text.mjs';
const ru={'Find & replace':'Найти и заменить','Find':'Найти','Replace with':'Заменить на','Version A':'Версия A','Version B':'Версия B','Match case':'Учитывать регистр','Download':'Скачать','Edit selected text':'Редактировать текст','Your document':'Ваш документ','Texts match ✓':'Тексты совпадают ✓'};
function environment(t){
 const dom=new JSDOM('<main></main>');globalThis.window=dom.window;globalThis.document=dom.window.document;window.KristinaTextEditor=editor;window.Element.prototype.scrollIntoView=()=>{};
 const api=globalThis.cttCreateI18n({document,autoStart:false,storage:null,loadCatalog:async()=>ru});globalThis.cttI18n=api;
 t.after(()=>{dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.cttI18n;});return {dom,api,root:document.querySelector('main')};
}
test('language changes retain find/replace inputs, handlers, selections and literal document values',async t=>{
 const {dom,api,root}=environment(t);let current='Download';
 const view=mountFindReplace(root,{single:false,getEntries:()=>[{key:'p1',text:current}],apply:()=>{},undo:()=>{},canUndo:()=>false,jump:async()=>{},highlight:()=>{}});t.after(()=>view.dispose());
 root.querySelector('button').click();const input=root.querySelector('[data-find-field="query"]'),replacement=root.querySelector('[data-find-field="replacement"]');input.value='Download';replacement.value='Find';input.focus();input.setSelectionRange(1,4);input.dispatchEvent(new dom.window.Event('input'));
 await api.setLocale('ru');
 assert.equal(root.querySelector('[data-find-field="query"]'),input);assert.equal(root.querySelector('[data-find-field="replacement"]'),replacement);assert.equal(document.activeElement,input);assert.equal(input.value,'Download');assert.equal(replacement.value,'Find');assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,4);assert.match(input.parentNode.textContent,/Найти/);assert.equal(root.querySelector('.find-replace-preview mark').textContent,'Download');
 input.value='other';input.dispatchEvent(new dom.window.Event('input'));assert.equal(root.querySelector('.find-replace-preview').hidden,true);
});
test('switching the editor to RTL keeps exact document text, drafts and A/B order',async t=>{
 const {dom,api,root}=environment(t),source=(name,text)=>({name,data:Buffer.from(text).toString('base64')});
 const sources={left:source('Download.txt','Download\nFind'),right:source('Find.txt','Download\nReplace')},report=await compareText(sources),original=JSON.stringify(report);
 const view=await mountVisualReview(root,{report,sources});t.after(()=>view.dispose());await view.select(report.changed[0].key);
 const input=root.querySelector('[data-edit-side="right"]');input.value='Find — пользовательский текст';input.dispatchEvent(new dom.window.Event('input'));input.focus();input.setSelectionRange(2,7);const saved=JSON.stringify(view.snapshot());
 await api.setLocale('ar');
 assert.equal(JSON.stringify(view.snapshot()),saved);assert.equal(JSON.stringify(report),original);assert.equal(root.querySelector('[data-edit-side="right"]'),input);assert.equal(input.value,'Find — пользовательский текст');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,7);assert.equal(root.querySelector('.visual-columns').dir,'ltr');assert.equal(input.dir,'auto');assert.ok([...root.querySelectorAll('.visual-paragraph')].some(node=>node.textContent==='Download'));assert.equal(root.querySelector('.visual-columns [data-save-side]').dataset.saveSide,'left');
});
test('replacing a translated placeholder with user text removes its prior binding',async t=>{
 const {api,root}=environment(t);root.setAttribute('data-i18n-text','Download');uiSetText(root,uiMessage('Download'));await api.setLocale('ru');assert.equal(root.textContent,'Скачать');uiSetText(root,'Find');api.scan(document);await api.setLocale('en');await api.setLocale('ru');assert.equal(root.textContent,'Find');
});
