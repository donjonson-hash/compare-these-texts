import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import {JSDOM} from 'jsdom';

const source = await readFile(new URL('../src/i18n.js', import.meta.url),'utf8');
function setup(html='', options={}) {
  const dom = new JSDOM('<!doctype html><html><body>'+html+'</body></html>',{url:'https://example.test/'});
  const context = vm.createContext({URL,document:undefined,navigator:{languages:['en']},location:{href:'https://example.test/i18n.js'}});
  vm.runInContext(source,context);
  const api = context.cttCreateI18n({document:dom.window.document,autoStart:false,...options});
  return {api,document:dom.window.document,dom};
}
const ru = {Save:'Сохранить',Language:'Язык','{0} pages':'{0} страниц','Could not read {file}.':'Не удалось прочитать {file}.','Open <0>help <1>now</1></0>.':'Открыть <0>справку <1>сейчас</1></0>.','Use <0></0>.':'Используйте <0></0>.'};

test('canonical release locales, regional normalization and malformed input rejection',async()=>{
  const {api}=setup();
  const metadata=JSON.parse(await readFile(new URL('../i18n/locales.json',import.meta.url),'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(api.locales)),metadata);
  for(const [value,expected] of Object.entries({'en-US':'en','nb-NO':'no','pt-PT':'pt_PT','pt-BR':'pt_BR','zh-Hant-HK':'zh_TW','zh-SG':'zh_CN','es-MX':'es_419','es-ES':'es','iw':'he'})) assert.equal(api.normalizeLocale(value),expected);
  for(const value of ['../../evil','https://evil.test/a','en<script>','',null,{},'xx','sw','sw-KE']) assert.equal(api.normalizeLocale(value),null);
});

test('switching updates explicit UI bindings without changing document text, inputs or A/B order',async()=>{
  const {api,document}=setup('<button data-i18n-text="Save">Save</button><section id="a" dir="auto">Save</section><section id="b" dir="auto">Language</section><textarea>Save</textarea><select data-i18n-selector></select>',{loadCatalog:async()=>ru});
  const textarea=document.querySelector('textarea'); textarea.setSelectionRange(1,3);
  await api.setLocale('ru');
  assert.equal(document.querySelector('button').textContent,'Сохранить');
  assert.equal(document.querySelector('#a').textContent,'Save');
  assert.equal(document.querySelector('#b').textContent,'Language');
  assert.equal(textarea.value,'Save'); assert.equal(textarea.selectionStart,1); assert.equal(textarea.selectionEnd,3);
  assert.deepEqual(Array.from(document.querySelector('select').options, option => option.value), Array.from(api.locales, locale => locale.code));
  assert.equal(document.querySelector('select').value,'ru');
  await api.setLocale('ar');
  assert.equal(document.documentElement.dir,'rtl');
  assert.equal(document.querySelector('#a').getAttribute('dir'),'auto');
  assert.equal(document.querySelector('#a').nextElementSibling.id,'b');
  await api.setLocale('en'); assert.equal(document.documentElement.dir,'ltr'); assert.equal(document.querySelector('button').textContent,'Save');
});

test('bindings preserve English source, parameters and text node children, and can be removed',async()=>{
  const {api,document}=setup('<label><span></span><input value="user document"></label>',{loadCatalog:async()=>ru});
  const node=document.createTextNode('');document.querySelector('span').append(node);
  api.bindText(node,'{0} pages',{0:3});
  api.bindAttr(document.querySelector('label'),'title','Save');
  await api.setLocale('ru');assert.equal(node.textContent,'3 страниц');assert.equal(document.querySelector('label').title,'Сохранить');
  api.unbindText(node);node.textContent='raw document';api.unbindAttr(document.querySelector('label'),'title');document.querySelector('label').title='filename';
  await api.setLocale('en'); assert.equal(node.textContent,'raw document');assert.equal(document.querySelector('label').title,'filename');assert.equal(document.querySelector('input').value,'user document');
});

test('safe rich translation retains original link identity, nested slots and protected code',async()=>{
  const {api,document}=setup('<p id="rich"><a href="/guide" data-i18n-slot="0">help <strong data-i18n-slot="1">now</strong></a></p><p id="code"><code data-i18n-slot="0" data-i18n-preserve>npm run build</code></p>',{loadCatalog:async()=>ru});
  const link=document.querySelector('a'),strong=document.querySelector('strong'),code=document.querySelector('code');
  let clicks=0;link.addEventListener('click',event=>{event.preventDefault();clicks++;});
  api.bindRich(document.querySelector('#rich'),'Open <0>help <1>now</1></0>.');
  api.bindRich(document.querySelector('#code'),'Use <0></0>.');
  await api.setLocale('ru');
  assert.equal(document.querySelector('#rich').textContent,'Открыть справку сейчас.');assert.equal(document.querySelector('a'),link);assert.equal(document.querySelector('strong'),strong);assert.equal(link.getAttribute('href'),'/guide');
  link.click();assert.equal(clicks,1);assert.equal(document.querySelector('code'),code);assert.equal(code.textContent,'npm run build');
});

test('malformed rich translations and changed placeholders fall back safely; parameters never create markup',async()=>{
  const {api,document}=setup('<p><strong data-i18n-slot="0">name</strong></p><span></span>',{loadCatalog:async()=>({'Hi <0>{name}</0>.':'Bad <9>{name}</9>.','{0} pages':'wrong {1}'})});
  api.bindRich(document.querySelector('p'),'Hi <0>{name}</0>.',{name:'<img src=x><0>evil</0>'});api.bindText(document.querySelector('span'),'{0} pages',{0:4});
  await api.setLocale('ru');assert.equal(document.querySelector('p').textContent,'Hi <img src=x><0>evil</0>.');assert.equal(document.querySelectorAll('img').length,0);assert.equal(document.querySelector('span').textContent,'4 pages');
});

test('error rendering matches whole templates, translates known prefixes and preserves original error',async()=>{
  const {api,document}=setup('<output></output>',{loadCatalog:async()=>ru});
  const error=new Error('Could not read secret-contract.pdf.'); api.bindError(document.querySelector('output'),error);
  await api.setLocale('ru'); assert.equal(document.querySelector('output').textContent,'Не удалось прочитать secret-contract.pdf.');assert.equal(error.message,'Could not read secret-contract.pdf.');
  assert.equal(api.localizeError('PDF: Could not read contract.pdf.'),'PDF: Не удалось прочитать contract.pdf.');assert.equal(api.localizeError('Unknown vendor detail'),'Unknown vendor detail');
});

test('newest language request wins and rejected loads can retry',async()=>{
  let resolveRu, attempts=0;
  const {api}=setup('',{loadCatalog:code=>{if(code==='ru')return new Promise(resolve=>{resolveRu=resolve;});if(code==='fr'&&attempts++===0)throw Error('missing');return {Save:'Enregistrer'};}});
  const slow=api.setLocale('ru');await Promise.resolve(); await api.setLocale('de');resolveRu(ru);assert.equal(await slow,false);assert.equal(api.getLocale(),'de');
  assert.equal(await api.setLocale('fr'),false);assert.equal(api.getLocale(),'de');assert.equal(await api.setLocale('fr'),true);assert.equal(api.getLocale(),'fr');assert.equal(api.t('Save'),'Enregistrer');
});

test('denied preference storage and unsupported browser preference keep offline fallback functional',async()=>{
  const {api}=setup('',{autoStart:true,languages:['xx-ZZ','ru-RU'],storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},embedded:{ru}});
  await api.ready;assert.equal(api.getLocale(),'ru');assert.equal(api.t('Save'),'Сохранить');assert.equal(await api.setLocale('en'),true);
});

test('embedded mode never invokes dynamic catalog loader, and missing strings use English',async()=>{
  const {api}=setup('',{embedded:{ru}});assert.equal(await api.setLocale('ru'),true);assert.equal(api.t('missing'),'missing');assert.equal(await api.setLocale('ja'),false);assert.equal(api.getLocale(),'ru');
});

test('worker-safe engine starts English and handles explicit locale without DOM',async()=>{
  const context=vm.createContext({URL,navigator:{languages:['ru']},CTT_I18N_EMBEDDED:{ru},location:{href:'https://example.test/worker.mjs'}});vm.runInContext(source,context);
  await context.cttI18n.ready;assert.equal(context.cttI18n.t('Save'),'Save');await context.cttI18n.setLocale('ru',{persist:false});assert.equal(context.cttI18n.t('Save'),'Сохранить');
});

test('runtime UI helpers keep appended controls and explicitly release nodes reused for documents',async()=>{
  const {uiMessage,uiSetText,uiSetAttr,uiAppendText}=await import('../src/ui-text.mjs');
  const {api,document}=setup('<label data-i18n-text="Save">Save</label><output></output>',{loadCatalog:async()=>({...ru,'{0}{1}':'{0}{1}'})});
  const previous=globalThis.cttI18n;globalThis.cttI18n=api;
  try {
    const label=document.querySelector('label'),input=document.createElement('input');input.value='my handwritten correction';
    uiSetText(label,uiMessage('Save'));label.append(input);
    uiSetAttr(input,'aria-label',uiMessage('Save'));
    uiSetText(document.querySelector('output'),uiMessage('Save'));uiAppendText(document.querySelector('output'),' — draft');
    api.scan(document);
    await api.setLocale('ru');
    assert.equal(label.firstChild.textContent,'Сохранить');assert.equal(label.querySelector('input'),input);assert.equal(input.value,'my handwritten correction');assert.equal(input.getAttribute('aria-label'),'Сохранить');
    assert.equal(document.querySelector('output').textContent,'Сохранить — draft');
    uiSetText(document.querySelector('output'),'Save');uiSetAttr(input,'aria-label','my document label');
    await api.setLocale('en');await api.setLocale('ru');
    assert.equal(document.querySelector('output').textContent,'Save');assert.equal(input.getAttribute('aria-label'),'my document label');assert.equal(label.querySelector('input'),input);
  } finally {if(previous===undefined)delete globalThis.cttI18n;else globalThis.cttI18n=previous;}
});

test('RTL comparison structure keeps left-to-right column order through explicit layout rules',async()=>{
  const css=await readFile(new URL('../src/i18n.css',import.meta.url),'utf8');
  const {api,document}=setup('<style>'+css+'</style><div class="home-sources"><section id="a"><textarea dir="auto">original</textarea></section><section id="b">revised</section></div>',{loadCatalog:async()=>({Save:'حفظ'})});
  await api.setLocale('ar');
  assert.equal(document.defaultView.getComputedStyle(document.querySelector('.home-sources')).direction,'ltr');
  assert.equal(document.defaultView.getComputedStyle(document.querySelector('#a')).direction,'rtl');
  assert.equal(document.querySelector('textarea').getAttribute('dir'),'auto');
});
