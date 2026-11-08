// Only explicitly marked interface messages are translated; document strings stay literal.
const uiMessage = (source, params = {}) => ({__cttUiMessage: true, source, params, toString() { return globalThis.cttI18n?.t(this.source, this.params) ?? this.source.replace(/\{(\w+)\}/g, (match, key) => key in this.params ? String(this.params[key]) : match); }});
const uiError = message => ({__cttUiError: true, source: String(message ?? ''), toString() { return globalThis.cttI18n?.localizeError(this.source) ?? this.source; }});
const uiTextValues = new WeakMap();
const uiSetText = (node, value) => {
  const api = globalThis.cttI18n; api?.unbindText?.(node); node.removeAttribute?.('data-i18n-text'); node.removeAttribute?.('data-i18n'); uiTextValues.set(node, value);
  if ((value?.__cttUiMessage || value?.__cttUiError) && api) {
    // Bind a text leaf so labels can retain subsequently appended inputs and icons.
    const leaf = node.nodeType === 3 ? node : node.ownerDocument.createTextNode('');
    if (leaf !== node) node.replaceChildren(leaf);
    if (value.__cttUiError) api.bindError(leaf, value.source); else api.bindText(leaf, value.source, value.params);
  } else node.textContent = value == null ? '' : String(value);
  return value;
};
const uiAppendText = (node, value) => uiSetText(node, uiMessage('{0}{1}', {0: uiTextValues.has(node) ? uiTextValues.get(node) : node.textContent, 1: value}));
const uiOption = (label, value) => { const option = new Option('', value); uiSetText(option, label); return option; };
const uiSetAttr = (node, attr, value) => { const api = globalThis.cttI18n; node.removeAttribute?.('data-i18n-' + attr); if (value?.__cttUiMessage && api) api.bindAttr(node, attr, value.source, value.params); else { api?.unbindAttr?.(node, attr); node.setAttribute(attr, String(value)); } return value; };
const uiTranslate = (source, params = {}) => String(uiMessage(source, params));

export {uiMessage, uiError, uiSetText, uiSetAttr, uiTranslate, uiAppendText, uiOption};
