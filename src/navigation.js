(()=>{
"use strict";
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

/* Stage text or files before replacing a comparison; Home retains all open work. */
(() => {
  const $ = id => document.getElementById(id);
  const menu = $('start-menu'), home = $('workspace-home');
  const compare = $('start-compare'), edit = $('start-edit'), start = $('start-new-compare');
  const modes = [...document.querySelectorAll('[data-work-mode]')];
  const files = {left:null, right:null};
  const sides = ['left', 'right'];
  const help = $('home-help');
  let pending = false, navigationRevision = 0, resumeNavigation = null;
  function notice(text = '', error = false) {
    const node = $('home-notice'); uiSetText(node, error && !text?.__cttUiMessage && !text?.__cttUiError ? uiError(text) : text); node.hidden = !text;
    node.classList.toggle('error', error);
  }
  function hasInput(side) { return !!files[side] || $('home-' + side + '-text').value.length > 0; }
  function controls() {
    start.disabled = pending || !sides.every(hasInput);
    uiSetText(start, pending ? uiMessage("Opening documents…") : sides.some(side => files[side]) ? uiMessage("Compare documents →") : uiMessage("Compare texts →"));
    compare.disabled = edit.disabled = home.disabled = $('header-edit').disabled = $('home-example').disabled = $('home-swap').disabled = pending;
    for (const side of sides) {
      const file = files[side], field = $('home-' + side + '-text');
      $('home-' + side + '-file').disabled = pending;
      $('home-' + side + '-paste').disabled = pending;
      field.disabled = pending || !!file; field.hidden = !!file;
      $('home-' + side + '-file-card').hidden = !file;
      uiSetText($('home-' + side + '-name'), (file?.name || uiMessage("Choose a file or drag it here")));
      uiSetText($('home-' + side + '-kind'), file ? uiMessage("{0} file", { 0: file.name.split('.').at(-1).toUpperCase() }) : uiMessage("Plain text"));
      uiSetText($('home-' + side + '-count'), file ? uiMessage("{0} KB", { 0: Math.ceil(file.size / 1024) }) : uiMessage("{0} characters", { 0: field.value.length }));
    }
  }
  function choose(side, file) {
    if (!file || pending) return;
    let error = '';
    if (/\.doc$/i.test(file.name)) error = 'Old Word files (.doc) are not supported. Save the file as .docx in Word or LibreOffice, then try again. Renaming the file is not enough.';
    else if (!/\.(docx|pdf|txt|xlsx|csv|tsv)$/i.test(file.name)) error = 'Choose a DOCX, PDF, TXT, XLSX, CSV or TSV file.';
    else if (file.size > 2 * 1024 * 1024) error = 'Choose a file up to 2 MB.';
    if (error) notice(uiError(error), true);
    else { navigationRevision++; files[side] = file; notice(); }
    controls();
  }
  function updateResume() {
    compare.hidden = $('results').hidden;
    edit.hidden = !$('single-editor-host').childElementCount;
    uiSetText(edit, uiMessage("Continue editing"));
  }
  function showHome(event) {
    event?.preventDefault();
    if (pending) return;
    help?.close(); document.dispatchEvent(new Event('ctt:home')); updateResume();
    document.body.classList.add('home-mode'); menu.hidden = false;
    $('start-title').focus({preventScroll:true}); document.querySelector('.topbar').scrollIntoView({block:'start'});
  }
  function leaveHome() { help?.close(); document.body.classList.remove('home-mode'); menu.hidden = true; }
  function open(mode) {
    leaveHome(); modes.find(button => button.dataset.workMode === mode)?.click();
    const target = mode === 'single' ? $('single-current') : document.querySelector('[data-workspace-tools-open]') || $('result-heading');
    if (target && !target.hidden && target.textContent && target.getClientRects().length) target.focus({preventScroll:true});
    else modes.find(button => button.dataset.workMode === mode)?.focus({preventScroll:true});
    home.scrollIntoView({block:'start'});
  }
  start.addEventListener('click', async () => {
    if (pending || !sides.every(hasInput)) return;
    pending = true; controls(); notice(uiMessage("Checking your documents…"));
    try {
      const next = {};
      for (const side of sides) next[side] = files[side] || new File([$('home-' + side + '-text').value], side === 'left' ? 'original-text.txt' : 'changed-text.txt', {type:'text/plain'});
      const result = await new Promise(resolve => document.dispatchEvent(new CustomEvent('ctt:new-comparison', {detail:{files:next, complete:resolve}})));
      if (!result.ok) { notice((result.message || ''), !!result.message); return; }
      // Keep the staged sources for convenient corrections on a later Home visit.
      notice(); open('compare');
    } catch (error) { notice((error.message || uiMessage("Could not open these documents. Your previous work is still open.")), true); }
    finally { pending = false; controls(); updateResume(); }
  });
  for (const side of sides) {
    const input = $('home-' + side + '-file'), zone = $('home-' + side + '-drop'), field = $('home-' + side + '-text');
    input.addEventListener('change', () => { choose(side, input.files[0]); input.value = ''; });
    field.addEventListener('input', () => { navigationRevision++; notice(); controls(); });
    $('home-' + side + '-paste').addEventListener('click', () => { if (pending) return; navigationRevision++; files[side] = null; notice(); controls(); field.focus(); });
    zone.addEventListener('dragover', event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); if (!pending) zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); zone.classList.remove('dragging'); choose(side, event.dataTransfer.files[0]); });
  }
  $('home-swap').addEventListener('click', () => {
    if (pending) return;
    navigationRevision++;
    [files.left, files.right] = [files.right, files.left];
    const left = $('home-left-text'), right = $('home-right-text');
    [left.value, right.value] = [right.value, left.value]; notice(); controls();
  });
  $('home-example').addEventListener('click', () => {
    if (pending) return;
    if (sides.some(hasInput) && !window.confirm(String(uiMessage("Replace the texts or files on this start screen with an example? Your open comparison will stay unchanged.")))) return;
    navigationRevision++; files.left = files.right = null;
    $('home-left-text').value = 'Project update\nLaunch date: October 24\nBudget: $2,500\nThe page is ready for review.';
    $('home-right-text').value = 'Project update\nLaunch date: October 28\nBudget: $2,800\nThe page is ready for review.\nMobile checks completed.';
    notice(); controls(); $('home-left-text').focus();
  });
  home.addEventListener('click', showHome);
  document.querySelector('[data-home-link]').addEventListener('click', showHome);
  compare.addEventListener('click', () => open('compare'));
  edit.addEventListener('click', () => open('single'));
  $('header-edit').addEventListener('click', () => open('single'));
  $('home-help-open').addEventListener('click', () => help.showModal());
  $('home-help-close').addEventListener('click', () => help.close());
  for (const button of modes) button.addEventListener('click', () => { navigationRevision++; leaveHome(); });
  document.addEventListener('ctt:home', () => { navigationRevision++; });
  // Help can be opened during editing. Do not let its examples silently replace
  // an active comparison, partially loaded sources or a saved comparison.
  for (const id of ['demo', 'demo-tables']) $(id).addEventListener('click', event => {
    const saved = $('saved-session'), resume = $('session-resume');
    const hasComparison = !$('results').hidden || sides.some(side => $(side + '-filename').dataset.sourceLoaded === 'true') || !!(saved && !saved.hidden && resume && !resume.hidden);
    if (pending || event.currentTarget.disabled || (hasComparison && !window.confirm(String(uiMessage("Replace the previous comparison and its saved draft with an example? Download your edited files first if you want to keep them."))))) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    open('compare');
  }, {capture:true});
  const saved = $('saved-session'); if (saved) menu.before(saved);
  // Result painting may finish after the user has returned Home. Only an
  // explicit successful resume may navigate away from staged new inputs.
  document.addEventListener('ctt:comparison-operation-started', () => { resumeNavigation = navigationRevision; });
  document.addEventListener('ctt:comparison-resumed', () => {
    const requested = resumeNavigation === navigationRevision; resumeNavigation = null;
    if (requested && !pending && document.body.classList.contains('home-mode')) open('compare');
  });
  const observer = new MutationObserver(updateResume);
  observer.observe($('results'), {attributes:true, attributeFilter:['hidden']});
  // The packaged welcome guard reports through the existing workspace notice.
  // Surface that warning on Home as well, where the comparison is still hidden.
  const workspaceNotice = $('notice');
  const mirrorNotice = () => {
    if (document.body.classList.contains('home-mode') && !workspaceNotice.hidden && workspaceNotice.textContent) notice(workspaceNotice.textContent, workspaceNotice.classList.contains('error'));
  };
  const noticeObserver = new MutationObserver(mirrorNotice);
  noticeObserver.observe(workspaceNotice, {attributes:true, childList:true, subtree:true, characterData:true});
  mirrorNotice();
  window.addEventListener('pagehide', event => {
    if (!event.persisted) { observer.disconnect(); noticeObserver.disconnect(); }
  });
  controls(); updateResume();
})();

})();
