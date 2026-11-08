/* Offline UI localization. User document content is never discovered or translated. */
(function (global) {
  'use strict';
  const LOCALES = [{"code":"en","name":"English","lang":"en","dir":"ltr"},{"code":"am","name":"አማርኛ","lang":"am","dir":"ltr"},{"code":"ar","name":"العربية","lang":"ar","dir":"rtl"},{"code":"bg","name":"Български","lang":"bg","dir":"ltr"},{"code":"bn","name":"বাংলা","lang":"bn","dir":"ltr"},{"code":"ca","name":"Català","lang":"ca","dir":"ltr"},{"code":"cs","name":"Čeština","lang":"cs","dir":"ltr"},{"code":"da","name":"Dansk","lang":"da","dir":"ltr"},{"code":"de","name":"Deutsch","lang":"de","dir":"ltr"},{"code":"el","name":"Ελληνικά","lang":"el","dir":"ltr"},{"code":"es","name":"Español","lang":"es","dir":"ltr"},{"code":"es_419","name":"Español (Latinoamérica)","lang":"es-419","dir":"ltr"},{"code":"et","name":"Eesti","lang":"et","dir":"ltr"},{"code":"fa","name":"فارسی","lang":"fa","dir":"rtl"},{"code":"fi","name":"Suomi","lang":"fi","dir":"ltr"},{"code":"fil","name":"Filipino","lang":"fil","dir":"ltr"},{"code":"fr","name":"Français","lang":"fr","dir":"ltr"},{"code":"gu","name":"ગુજરાતી","lang":"gu","dir":"ltr"},{"code":"he","name":"עברית","lang":"he","dir":"rtl"},{"code":"hi","name":"हिन्दी","lang":"hi","dir":"ltr"},{"code":"hr","name":"Hrvatski","lang":"hr","dir":"ltr"},{"code":"hu","name":"Magyar","lang":"hu","dir":"ltr"},{"code":"id","name":"Bahasa Indonesia","lang":"id","dir":"ltr"},{"code":"it","name":"Italiano","lang":"it","dir":"ltr"},{"code":"ja","name":"日本語","lang":"ja","dir":"ltr"},{"code":"kn","name":"ಕನ್ನಡ","lang":"kn","dir":"ltr"},{"code":"ko","name":"한국어","lang":"ko","dir":"ltr"},{"code":"lt","name":"Lietuvių","lang":"lt","dir":"ltr"},{"code":"lv","name":"Latviešu","lang":"lv","dir":"ltr"},{"code":"ml","name":"മലയാളം","lang":"ml","dir":"ltr"},{"code":"mr","name":"मराठी","lang":"mr","dir":"ltr"},{"code":"ms","name":"Bahasa Melayu","lang":"ms","dir":"ltr"},{"code":"nl","name":"Nederlands","lang":"nl","dir":"ltr"},{"code":"no","name":"Norsk bokmål","lang":"nb","dir":"ltr"},{"code":"pl","name":"Polski","lang":"pl","dir":"ltr"},{"code":"pt_BR","name":"Português (Brasil)","lang":"pt-BR","dir":"ltr"},{"code":"pt_PT","name":"Português (Portugal)","lang":"pt-PT","dir":"ltr"},{"code":"ro","name":"Română","lang":"ro","dir":"ltr"},{"code":"ru","name":"Русский","lang":"ru","dir":"ltr"},{"code":"sk","name":"Slovenčina","lang":"sk","dir":"ltr"},{"code":"sl","name":"Slovenščina","lang":"sl","dir":"ltr"},{"code":"sr","name":"Српски","lang":"sr","dir":"ltr"},{"code":"sv","name":"Svenska","lang":"sv","dir":"ltr"},{"code":"sw","name":"Kiswahili","lang":"sw","dir":"ltr"},{"code":"ta","name":"தமிழ்","lang":"ta","dir":"ltr"},{"code":"te","name":"తెలుగు","lang":"te","dir":"ltr"},{"code":"th","name":"ไทย","lang":"th","dir":"ltr"},{"code":"tr","name":"Türkçe","lang":"tr","dir":"ltr"},{"code":"uk","name":"Українська","lang":"uk","dir":"ltr"},{"code":"vi","name":"Tiếng Việt","lang":"vi","dir":"ltr"},{"code":"zh_CN","name":"简体中文","lang":"zh-CN","dir":"ltr"},{"code":"zh_TW","name":"繁體中文","lang":"zh-TW","dir":"ltr"}];
  const OWN = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function normalizeLocale(value) {
    if (typeof value !== 'string' || !/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value)) return null;
    const parts = value.toLowerCase().replaceAll('_', '-').split('-');
    let base = parts[0];
    base = ({iw:'he',in:'id',nb:'no',nn:'no',tl:'fil'})[base] || base;
    if (base === 'en') return 'en';
    if (base === 'zh') return parts.some(p => ['tw','hk','mo','hant'].includes(p)) ? 'zh_TW' : 'zh_CN';
    if (base === 'pt') return parts.slice(1).some(p => ['pt','ao','mz','cv','gw','st','tl'].includes(p)) ? 'pt_PT' : 'pt_BR';
    if (base === 'es') return parts.some(p => ['419','ar','bo','cl','co','cr','cu','do','ec','gt','hn','mx','ni','pa','pe','pr','py','sv','uy','ve'].includes(p)) ? 'es_419' : 'es';
    return LOCALES.some(item => item.code === base) ? base : null;
  }
  function interpolate(source, params) {
    return String(source).replace(/\{([\w]+)\}/g, (token, key) => OWN(params || {}, key) ? String(params[key]) : token);
  }
  function signature(source) { return [...String(source).matchAll(/\{([\w]+)\}/g)].map(m => m[1]).sort().join('|'); }
  function createI18n(options = {}) {
    const document = options.document === undefined ? global.document : options.document;
    const localeInfo = new Map(LOCALES.map(item => [item.code, item]));
    const bindings = new WeakMap();
    const activeBindings = new Set();
    const selectorStatuses = new Map();
    const selectors = new Set();
    const cache = new Map();
    const embedded = options.embedded === undefined ? global.CTT_I18N_EMBEDDED : options.embedded;
    const storageKey = 'ctt.ui.locale';
    let locale = 'en', catalog = Object.create(null), generation = 0;
    let patterns = [];
    const baseURL = options.baseURL || (document && document.currentScript && document.currentScript.src) || (global.location && global.location.href);
    const loader = options.loadCatalog || (async code => {
      if (embedded) {
        if (!OWN(embedded, code)) throw new Error('Missing embedded UI language');
        return embedded[code];
      }
      return (await import(new URL('i18n-' + code + '.mjs', baseURL).href)).default;
    });
    function storage() { try { return options.storage === undefined ? global.localStorage : options.storage; } catch { return null; } }
    function t(source, params = {}) {
      const translated = OWN(catalog, source) && typeof catalog[source] === 'string' && signature(catalog[source]) === signature(source) ? catalog[source] : source;
      return interpolate(translated, params);
    }
    function localizedSource(source) { return OWN(catalog, source) && typeof catalog[source] === 'string' && signature(catalog[source]) === signature(source) ? catalog[source] : source; }
    function localizeError(message) {
      const source = String(message && message.message || message || '');
      if (OWN(catalog, source)) return t(source);
      const prefix = source.match(/^(PDF|DOCX|XLSX|XLS|TXT|CSV):\s*([\s\S]*)$/);
      if (prefix) return t(prefix[1] + ': {0}', {0:localizeError(prefix[2])});
      for (const pattern of patterns) {
        const match = pattern.regex.exec(source);
        if (!match) continue;
        const params = Object.create(null);
        let valid = true;
        pattern.names.forEach((name, index) => { if (OWN(params,name) && params[name] !== match[index+1]) valid = false; params[name] = match[index+1]; });
        if (valid) return t(pattern.source, params);
      }
      return source;
    }
    function richTree(source, slots) {
      const root = [], stack = [{id:null, children:root}], seen = new Set();
      let offset = 0;
      for (const match of source.matchAll(/<(\/?)(\d+)>/g)) {
        if (match.index > offset) stack.at(-1).children.push(source.slice(offset, match.index));
        const id = match[2];
        if (match[1]) {
          if (stack.length === 1 || stack.at(-1).id !== id) throw new Error('Unbalanced UI slots');
          stack.pop();
        } else {
          if (!slots.has(id) || seen.has(id)) throw new Error('Unknown or repeated UI slot');
          seen.add(id);
          const branch = {id, children:[]};
          stack.at(-1).children.push(branch);
          stack.push(branch);
        }
        offset = match.index + match[0].length;
      }
      if (offset < source.length) stack.at(-1).children.push(source.slice(offset));
      if (stack.length !== 1 || seen.size !== slots.size) throw new Error('Missing UI slots');
      return root;
    }
    function renderRich(binding) {
      let tree;
      try { tree = richTree(localizedSource(binding.source), binding.slots); }
      catch { tree = richTree(binding.source, binding.slots); }
      for (const slot of binding.slots.values()) slot.remove();
      function nodes(branches) {
        return branches.map(branch => {
          if (typeof branch === 'string') return document.createTextNode(interpolate(branch, binding.params));
          const slot = binding.slots.get(branch.id);
          if (!slot.hasAttribute('data-i18n-preserve')) slot.replaceChildren(...nodes(branch.children));
          return slot;
        });
      }
      binding.node.replaceChildren(...nodes(tree));
    }
    function render(binding) {
      if (binding.kind === 'rich') renderRich(binding);
      else if (binding.kind === 'attr') binding.node.setAttribute(binding.attr, t(binding.source, binding.params));
      else binding.node.textContent = binding.kind === 'error' ? localizeError(binding.source) : t(binding.source, binding.params);
    }
    function register(node, key, binding) {
      if (!node) return node;
      let record = bindings.get(node);
      if (!record) { record = new Map(); record.reference = typeof WeakRef === 'function' ? new WeakRef(node) : {deref:() => node}; bindings.set(node, record); activeBindings.add(record.reference); }
      record.set(key, {...binding, node});
      render(record.get(key));
      return node;
    }
    function bindText(node, source, params = {}) { return register(node, 'text', {kind:'text',source:String(source),params}); }
    function bindError(node, source) { return register(node, 'text', {kind:'error',source:String(source && source.message || source || ''),params:{}}); }
    function bindAttr(node, attr, source, params = {}) { return register(node, 'attr:' + attr, {kind:'attr',attr,source:String(source),params}); }
    function unbindText(node) { const record = bindings.get(node); if (record) { record.delete('text'); if (!record.size) { bindings.delete(node); activeBindings.delete(record.reference); } } return node; }
    function unbindAttr(node, attr) { const record = bindings.get(node); if (record) { record.delete('attr:' + attr); if (!record.size) { bindings.delete(node); activeBindings.delete(record.reference); } } return node; }
    function bindRich(node, source, params = {}) {
      const slots = new Map([...node.querySelectorAll('[data-i18n-slot]')].map(slot => [slot.getAttribute('data-i18n-slot'),slot]));
      richTree(String(source), slots);
      return register(node, 'text', {kind:'rich',source:String(source),params,slots});
    }
    function syncSelectors() { for (const select of selectors) { select.value = locale; select.disabled = false; } }
    async function setLocale(requested, settings = {}) {
      const code = normalizeLocale(requested);
      if (!code) return false;
      const request = ++generation;
      let nextCatalog = Object.create(null);
      try {
        if (code !== 'en') {
          if (!cache.has(code)) cache.set(code, Promise.resolve().then(() => loader(code)).catch(error => { cache.delete(code); throw error; }));
          const loaded = await cache.get(code);
          if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('Invalid UI language catalog');
          nextCatalog = loaded;
        }
      } catch {
        if (request === generation) { syncSelectors(); for (const status of selectorStatuses.values()) status.textContent = t('The selected language could not load. Your work is unchanged. Try again.'); if (typeof options.onError === 'function') options.onError(t('The selected language could not load. Your work is unchanged. Try again.')); }
        return false;
      }
      if (request !== generation) return false;
      const previousLocale = locale;
      locale = code; catalog = nextCatalog;
      patterns = Object.keys(catalog).filter(source => /\{\w+\}/.test(source)).map(source => {
        const names = [], chunks = []; let offset = 0;
        for (const match of source.matchAll(/\{(\w+)\}/g)) {
          chunks.push(source.slice(offset,match.index).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), '([\\s\\S]*?)');
          names.push(match[1]); offset = match.index + match[0].length;
        }
        chunks.push(source.slice(offset).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
        return {source,names,regex:new RegExp('^'+chunks.join('')+'$'),weight:source.length-names.length*3};
      }).sort((a,b) => b.weight-a.weight);
      if (document) { const info = localeInfo.get(code); document.documentElement.lang = info.lang; document.documentElement.dir = info.dir; }
      for (const reference of activeBindings) {
        const node = reference.deref();
        const record = node && bindings.get(node);
        if (!record) { activeBindings.delete(reference); continue; }
        for (const binding of record.values()) render(binding);
      }
      for (const status of selectorStatuses.values()) status.textContent = '';
      syncSelectors();
      if (settings.persist !== false) { try { storage()?.setItem(storageKey, code); } catch { /* Private modes may deny preference storage. */ } }
      if (document && document.defaultView && typeof document.defaultView.CustomEvent === 'function') document.dispatchEvent(new document.defaultView.CustomEvent('ctt:language-changed', {detail:{locale,previousLocale}}));
      return true;
    }
    function scan(root = document) {
      if (!root || !document) return;
      const nodes = [...(root.nodeType === 1 ? [root] : []),...root.querySelectorAll('[data-i18n], [data-i18n-text], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder], [data-i18n-alt], [data-i18n-content], [data-i18n-attr], [data-i18n-selector]')];
      for (const node of nodes) {
        const record = bindings.get(node);
        if (node.hasAttribute('data-i18n') && !(record && record.has('text'))) bindRich(node,node.getAttribute('data-i18n'));
        else if (node.hasAttribute('data-i18n-text') && !(record && record.has('text'))) bindText(node,node.getAttribute('data-i18n-text'));
        for (const attr of ['title','aria-label','placeholder','alt','content']) if (node.hasAttribute('data-i18n-'+attr) && !(record && record.has('attr:'+attr))) bindAttr(node,attr,node.getAttribute('data-i18n-'+attr));
        if (node.hasAttribute('data-i18n-attr')) for (const attr of node.getAttribute('data-i18n-attr').split(/\s+/).filter(Boolean)) if (!(record && record.has('attr:'+attr))) bindAttr(node,attr,node.getAttribute(attr) || '');
        if (node.hasAttribute('data-i18n-selector') && !selectors.has(node)) {
          node.replaceChildren(...LOCALES.map(info => { const option = document.createElement('option'); option.value = info.code; option.textContent = info.name; option.lang = info.lang; option.dir = info.dir; option.setAttribute('translate','no'); return option; }));
          selectors.add(node); node.value = locale;
          const status = document.createElement('span'); status.className = 'ctt-language-status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
          node.insertAdjacentElement('afterend', status); selectorStatuses.set(node,status);
          node.addEventListener('change', () => { status.textContent = t('Changing language…'); setLocale(node.value); });
        }
      }
    }
    function initialLocale() {
      try { const saved = normalizeLocale(storage()?.getItem(storageKey)); if (saved) return saved; } catch { /* Denied storage is optional. */ }
      const preferences = options.languages || (global.navigator && (global.navigator.languages || [global.navigator.language])) || [];
      for (const value of preferences) { const code = normalizeLocale(value); if (code) return code; }
      return 'en';
    }
    const api = {t,bindText,bindRich,bindAttr,bindError,unbindText,unbindAttr,localizeError,setLocale,getLocale:() => locale,scan,normalizeLocale,locales:LOCALES};
    if (document) { scan(document); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(document), {once:true}); }
    api.ready = options.autoStart === false ? Promise.resolve(true) : setLocale(document ? initialLocale() : 'en', {persist:false});
    return api;
  }
  global.cttCreateI18n = createI18n;
  global.cttI18n = createI18n();
})(globalThis);
