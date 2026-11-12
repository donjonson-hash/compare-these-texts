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

"use strict";
(() => {
  function recordProductEvent(name, parameters) {
    try { window.cttProductEvent?.(name, parameters); } catch (_) {}
  }
  const $ = (id) => document.getElementById(id);
  const visualModuleURL = new URL('visual-review.mjs', document.currentScript.src);
  const sheetModuleURL = new URL('sheet-review.mjs', document.currentScript.src);
  const tableReportModuleURL = new URL('report.mjs', document.currentScript.src);
  const sessionModuleURL = new URL('session-ui.mjs', document.currentScript.src);
  const textReportModuleURL = new URL('text-report.mjs', document.currentScript.src);
  const pdfReportLanguageURL = new URL('pdf-report-language.mjs', document.currentScript.src);
  let visualController = null, visualReview = null;
  let sessionUI = null;
  let restoreWorkspaceTools = () => {};
  function mountWorkspaceTools(review) {
    restoreWorkspaceTools();
    if (!review?.workspaceControlsHost) return;
    const host = review.workspaceControlsHost;
    const nodes = [$('saved-session'), document.querySelector('.work-mode-switch'), $('source-picker'), $('results').querySelector('.result-heading .downloads')].filter(Boolean);
    const homes = nodes.map(node => {
      const marker = document.createComment('workspace control home');
      const target = node.classList.contains('downloads') ? review.workspaceReportsHost || host : host;
      node.before(marker); target.append(node); return {node, marker};
    });
    document.body.classList.add('popup-mode');
    // A failed autosave must remain visible even while the tools window is closed.
    const saved = homes.find(({node}) => node.id === 'saved-session');
    const showSaveError = () => {
      if (!saved) return;
      if (saved.node.classList.contains('session-error')) saved.marker.after(saved.node);
      else if (saved.node.parentNode !== host) host.prepend(saved.node);
    };
    const observer = new MutationObserver(showSaveError);
    if (saved) observer.observe(saved.node, {attributes: true, attributeFilter: ['class']});
    showSaveError();
    restoreWorkspaceTools = () => {
      observer.disconnect(); review.closeWorkspaceTools?.();
      for (const {node, marker} of homes) { marker.replaceWith(node); }
      document.body.classList.remove('popup-mode');
      restoreWorkspaceTools = () => {};
    };
  }
  const MAX_FILE_BYTES = 2 * 1024 * 1024, PAGE_SIZE = 25;
  const state = {sources: {left: null, right: null}, metadata: null, suggested: [], delimiter: ',',
    report: null, html: null, records: [], editor: null, busy: false, revision: 0, filter: 'all', page: 0, active: -1};
  const loads = {left: 0, right: 0}, selectColumns = new WeakMap();
  let controller = null, exportController = null, changePage = 0;
  function reviewMode(enabled, textMode = false) {
    document.body.classList.toggle('review-mode', enabled);
    document.body.classList.toggle('document-mode', enabled && textMode);
    $('zoom-control').hidden = !textMode;
  }
  const categories = [['all', uiMessage("All items")], ['changed', uiMessage("Changed")], ['only_left', uiMessage("Only in A")], ['only_right', uiMessage("Only in B")], ['matched', uiMessage("Matched")], ['moved', uiMessage("Moved without text changes")], ['reflow', uiMessage("Line breaks changed")]];
  const structuralCategory = category => category === 'moved' || category === 'reflow';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) uiSetText(node, text);
    if (className) node.className = className;
    return node;
  }
  // A bounded conversation is scoped to one report revision. Sources never become HTML.
  const OFFICE_MESSAGE_LIMIT = 12, OFFICE_TEXT_LIMIT = 12000;
  let officeDraftGeneration = 0, officeContext = null;
  function officeToggle(open, focus = true) {
    open = open && officeAvailable();
    if (open) visualReview?.closeWorkspaceTools?.();
    $('office-sidebar').hidden = !open;
    $('comparison-layout').classList.toggle('assistant-open', open);
    $('office-open').setAttribute('aria-expanded', String(open));
    if (focus) {
      const target = open ? $('office-title') : document.querySelector('[data-workspace-tools-open]') || $('office-open');
      target.focus({preventScroll: true});
      if (open) target.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }
  }
  function officeUpdateContext(context) {
    officeContext = context;
    $('office-context').hidden = !context;
    $('office-basis').hidden = !context?.edited;
    if (!context) return;
    uiSetText($('office-current-summary'), context.textsEqual ? context.kind==='sheet' ? uiMessage("The checked cells now match.") : uiMessage("The texts now match.") : context.count ? (context.count === 1 ? uiMessage("{0} difference to review.", { 0: context.count }) : uiMessage("{0} differences to review.", { 0: context.count })) : context.structureDiffers ? uiMessage("The table layouts differ.") : uiMessage("The text order differs."));
    const selected = context.selected;
    $('office-excerpts').hidden = !selected;
    $('office-selection-hint').hidden = !!selected;
    uiSetText($('office-selection-title'), !selected ? uiMessage("Select a highlighted change") : !selected.different ? uiMessage("This section now matches") : selected.left === null ? uiMessage("This text appears only in B") : selected.right === null ? uiMessage("This text appears only in A") : selected.left === selected.right ? uiMessage("This text moved") : uiMessage("The wording differs here"));
    for (const side of ['left', 'right']) uiSetText($('office-' + side + '-text'), selected?.[side] === null ? uiMessage("Not in this version") : selected?.[side] === '' ? uiMessage("(Empty text)") : String(selected?.[side] ?? '').slice(0, 4000));
    // Keep the original report available, but make the current selected change primary.
    $('office-summary').hidden = !!context;
    $('office-summary-actions')?.remove();
  }
  function officeAvailable() { return !!state.report && !state.busy && !!window.KristinaOffice; }
  function officeEnable() {
    const enabled = officeAvailable();
    $('office-open').disabled = !enabled;
    $('office-question').disabled = !enabled; $('office-send').disabled = !enabled;
    $('office-form').hidden = !enabled; $('office-suggestions').hidden = !enabled;
    const textMode = state.report?.kind === 'text';
    $('office-impact-question').hidden = !enabled || textMode || !state.report?.commercial;
    $('office-impact-question').disabled = !enabled;
    uiSetAttr($('office-question'), "placeholder", enabled ? textMode ? uiMessage("For example: what changed in the text?") : uiMessage("For example: why did these rows match?") : uiMessage("Add two files first"));
    const questions = textMode ? ["What changed?", "What was added?", "What was removed?", "Draft an email"] : ["Explain the results", "Where did the price change?", "What's missing?", "Draft an email"];
    Array.from($('office-suggestions').children).forEach((button, index) => { button.disabled = !enabled; button.dataset.question = questions[index]; uiSetText(button, uiMessage(questions[index])); });
  }
  function officeReset(message = uiMessage("Add two files. I'll help you understand the differences and draft an email about the results.")) {
    officeDraftGeneration++;
    officeUpdateContext(null); $('office-summary').hidden = false; officeToggle(false, false);
    uiSetText($('office-summary'), message);
    $('office-transcript').replaceChildren(); $('office-question').value = '';
    $('office-draft').value = ''; $('office-draft-section').hidden = true; uiSetText($('office-draft-status'), '');
    $('office-summary-actions')?.remove(); officeEnable();
  }
  async function officeJump(action, revision) {
    if (revision !== state.revision || !officeAvailable() || state.report.status !== 'complete') return;
    if (visualReview) {
      const key = typeof action.key === 'string' ? action.key : state.records.find(item => item.category === action.category)?.key;
      if (key) {
        try { await visualReview.select(key); $('visual-review').scrollIntoView({behavior: 'smooth', block: 'start'}); }
        catch (_) { officeMessage('assistant', uiMessage("This section is no longer available. Select another change in the document.")); }
      }
      return;
    }
    if (typeof action.key === 'string') {
      const index = state.records.findIndex(item => item.key === action.key);
      if (index < 0) return;
      $('search').value = ''; state.filter = 'all'; state.active = index; state.page = Math.floor(index / PAGE_SIZE);
      renderRows(true);
      // Keys can contain any CSV text. Only a numeric row index selects the DOM node.
      const pair = Array.from($('result-rows').children).find(node => node.dataset.index === String(index));
      if (!pair) return;
      pair.focus({preventScroll: true}); pair.scrollIntoView({behavior: 'smooth', block: 'center'});
      if (typeof action.field === 'string') {
        const field = Array.from(pair.querySelectorAll('.document-field')).find(node => node.dataset.field === action.field);
        if (field) { field.classList.add('office-target'); setTimeout(() => field.classList.remove('office-target'), 2500); }
      }
    } else if (categories.some(([category]) => category === action.category)) {
      $('search').value = ''; state.filter = action.category; state.active = -1; state.page = 0; changePage = 0; renderRows();
      const target = $('result-rows').querySelector('.document-pair') || $('result-heading');
      target.focus({preventScroll: true}); target.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  }
  function officeActions(actions, revision) {
    const box = element('div', undefined, 'office-actions');
    for (const action of (Array.isArray(actions) ? actions.slice(0, 20) : [])) {
      if (!action || typeof action.label !== 'string') continue;
      const hasKey = typeof action.key === 'string';
      if (!hasKey && !categories.some(([category]) => category === action.category)) continue;
      const button = element('button', action.label.slice(0, 180), 'office-action'); button.type = 'button';
      if (hasKey) button.dataset.key = action.key;
      if (typeof action.category === 'string') button.dataset.category = action.category;
      button.addEventListener('click', () => officeJump(action, revision)); box.append(button);
    }
    return box;
  }
  function officeMessage(role, text, actions = []) {
    const log = $('office-transcript'), message = element('article', undefined, 'office-message ' + role);
    message.append(element('span', role === 'user' ? uiMessage("You") : uiMessage("CTT"), 'office-speaker'), element('p', String(text).slice(0, OFFICE_TEXT_LIMIT)));
    if (role !== 'user') { const buttons = officeActions(actions, state.revision); if (buttons.children.length) message.append(buttons); }
    log.append(message); while (log.children.length > OFFICE_MESSAGE_LIMIT) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function officeShowDraft(text) {
    if (typeof text !== 'string') return;
    officeDraftGeneration++;
    $('office-draft').value = text.slice(0, 1048576); $('office-draft-section').hidden = false;
    uiSetText($('office-draft-status'), officeContext?.edited ? uiMessage("This draft describes the original comparison. Review it against your edits before sending.") : uiMessage("Your draft is ready. Review it before sending."));
  }
  function officeDescribe() {
    if (!window.KristinaOffice || !state.report) return;
    const answer = window.KristinaOffice.describe(state.report);
    uiSetText($('office-summary'), String(answer.text || '').slice(0, OFFICE_TEXT_LIMIT));
    $('office-summary-actions')?.remove();
    const actions = officeActions(answer.actions, state.revision);
    if (!officeContext && actions.children.length) { actions.id = 'office-summary-actions'; $('office-summary').after(actions); }
  }
  function officeAsk(question, draftIntent = false) {
    if (!officeAvailable()) return;
    question = String(question); if (!question.trim()) return;
    if (question.length > 1000) { $('office-question').setCustomValidity(String(uiMessage("Shorten your question to 1,000 characters."))); $('office-question').reportValidity(); return; }
    $('office-question').setCustomValidity(''); officeMessage('user', question); $('office-question').value = '';
    try {
      const answer = draftIntent ? window.KristinaOffice.draftLetter(state.report) : window.KristinaOffice.answer(state.report, question);
      officeMessage('assistant', uiMessage('{0}{1}', {0: officeContext?.edited ? uiMessage('Original comparison (before your edits):\n') : '', 1: answer.text || uiMessage('Ask a more specific question about this comparison.')}), answer.actions);
      if (typeof answer.draft === 'string') officeShowDraft(answer.draft);
    } catch (_error) { officeMessage('assistant', uiMessage("Couldn't prepare a response. You can review the differences in the documents.")); }
  }
  async function officeCopy() {
    if (!officeAvailable() || $('office-draft-section').hidden) return;
    const revision = state.revision, generation = officeDraftGeneration, text = $('office-draft').value;
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (revision === state.revision && generation === officeDraftGeneration) uiSetText($('office-draft-status'), text === $('office-draft').value ? uiMessage("Text copied.") : uiMessage("Copied the version from when you clicked. Copy again to include your latest changes."));
    } catch (_error) {
      if (revision !== state.revision || generation !== officeDraftGeneration) return;
      $('office-draft').focus(); $('office-draft').select();
      uiSetText($('office-draft-status'), uiMessage("Automatic copying isn't available. The text is selected—press Ctrl+C or ⌘C."));
    }
  }
  function officeDownload() {
    if (!officeAvailable() || $('office-draft-section').hidden) return;
    const url = URL.createObjectURL(new Blob([$('office-draft').value], {type: 'text/plain;charset=utf-8'}));
    const link = element('a'); link.href = url; link.download = 'ctt-email-draft.txt'; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    uiSetText($('office-draft-status'), uiMessage("The draft has been sent to your browser for download."));
  }
  function notice(message = '', error = false) {
    uiSetText($('notice'), error && !message?.__cttUiMessage && !message?.__cttUiError ? uiError(message) : message); $('notice').classList.toggle('error', error); $('notice').hidden = !message;
  }
  function busy(value) {
    state.busy = value;
    sessionUI?.setBusy(value);
    if (value) officeReset(uiMessage("Reading the documents and checking the data. I'll answer questions about the new comparison when it's ready."));
    officeEnable(); exportEnable();
    for (const id of ['demo', 'demo-tables', 'visual-retry', 'left-file', 'right-file', 'delimiter', 'left-key', 'right-key', 'answer']) $(id).disabled = value;
    for (const side of ['left', 'right']) if ($(side + '-sheet')) $(side + '-sheet').disabled = value;
    $('rules').disabled = value || !state.metadata || state.metadata.kind === 'text';
    $('compare').disabled = value;
    uiSetText($('compare'), value ? uiMessage("Processing…") : uiMessage("Apply settings"));
  }
  function clearResult() {
    restoreWorkspaceTools();
    $('source-picker').open = true;
    sessionUI?.deactivate();
    visualController?.abort(); visualController = null; visualReview?.dispose(); visualReview = null;
    document.body.classList.remove('visual-mode'); $('visual-review').replaceChildren(); $('visual-review').className = ''; $('visual-review').hidden = true;
    $('visual-load-error').hidden = true;
    state.editor = null; $('text-editor').hidden = true; $('editor-error').hidden = true; uiSetText($('editor-preview'), ""); editorStatus();
    state.revision += 1;
    if (controller) controller.abort();
    if (exportController) exportController.abort();
    exportController = null;
    state.report = null; state.html = null; state.records = [];
    exportStatus(); exportEnable();
    $('results').hidden = true; $('result-rows').replaceChildren();
    $('change-list').replaceChildren(); changePage = 0;
    reviewMode(false);
    officeReset(uiMessage("The comparison has been reset. Add files or apply settings to review new results."));
  }
  function dirty() { clearResult(); notice(uiMessage("Settings changed. Click “Apply settings” or “Continue.”")); }
  function textSourcesSelected() { return Object.values(state.sources).some(source => source && /\.(txt|docx|pdf)$/i.test(source.name)); }
  function delimiter() { return $('delimiter').value === 'tab' ? '\t' : $('delimiter').value; }
  function encode(bytes) {
    let text = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(text);
  }
  async function api(path, payload) {
    controller = new AbortController();
    if (window.KristinaTransport) return window.KristinaTransport.request(path, payload, {signal: controller.signal});
    throw new Error("Couldn't load the comparison. Refresh the page and try again.");
  }
  function sourceLabel(side, file) {
    $(side + '-filename').dataset.sourceLoaded = String(!!file);
    uiSetText($(side + '-filename'), file ? file.name : uiMessage("Choose a file or drop it here"));
    uiSetText($(side + '-meta'), file ? uiMessage("File selected · click to replace") : window.KristinaTransport ? uiMessage("XLSX, CSV, TXT, DOCX, PDF · up to 2 MiB") : uiMessage("CSV · UTF-8 · up to 2 MiB"));
  }
  function showSheets(side, sheets = [], selected = null) {
    const select = $(side + '-sheet');
    if (!select) return;
    select.parentElement.hidden = sheets.length < 2;
    options(select, sheets.map(s => s.name), uiMessage("Choose a sheet"));
    sheets.forEach((sheet, i) => { if (sheet.hidden) uiAppendText(select.options[i + 1], uiMessage(" (hidden)")); });
    if (selected !== null) { chooseColumn(select, selected); state.sources[side].sheet = selected; }
  }
  function options(select, names, placeholder) {
    selectColumns.set(select, names); select.replaceChildren(uiOption(placeholder, ''));
    names.forEach((name, index) => select.add(uiOption(name.length > 80 ? name.slice(0, 80) + `… [${index + 1}]` : name, String(index))));
  }
  function selectedColumn(select) { return select.value === '' ? '' : selectColumns.get(select)[Number(select.value)]; }
  function chooseColumn(select, name) {
    const index = selectColumns.get(select).indexOf(name); select.value = index < 0 ? '' : String(index);
  }
  function mapping(preserve = true) {
    if (!state.metadata || state.metadata.kind === 'text') return;
    const body = $('field-mapping'), previous = new Map();
    if (preserve) for (const row of body.children) previous.set(row.dataset.left, [selectedColumn(row.querySelector('.field-target')), row.querySelector('.field-mode').value]);
    const suggestions = new Map(state.suggested.map(([left, right, mode]) => [left, [right, mode]]));
    body.replaceChildren();
    const leftKey = selectedColumn($('left-key')), rightKey = selectedColumn($('right-key'));
    for (const name of state.metadata.left.headers.filter(n => n !== leftKey)) {
      const row = element('div', undefined, 'field-rule'); row.dataset.left = name;
      row.append(element('span', name));
      const targetLabel = element('label', uiMessage("Matching field in B")), target = element('select', undefined, 'field-target');
      uiSetAttr(target, 'aria-label', uiMessage("Column B for {0}", { 0: name }));
      options(target, state.metadata.right.headers.filter(n => n !== rightKey), uiMessage("Don't check"));
      const [right, rule] = previous.get(name) || suggestions.get(name) || [name, 'text'];
      chooseColumn(target, right); targetLabel.append(target);
      const modeLabel = element('label', uiMessage("Compare as")), mode = element('select', undefined, 'field-mode');
      uiSetAttr(mode, 'aria-label', uiMessage("Comparison mode for {0}", { 0: name }));
      mode.add(uiOption(uiMessage("Text"), 'text')); mode.add(uiOption(uiMessage("Number"), 'number')); mode.value = rule;
      mode.disabled = target.value === ''; modeLabel.append(mode);
      target.addEventListener('change', () => { mode.disabled = target.value === ''; dirty(); updateUnmapped(); });
      mode.addEventListener('change', dirty); row.append(targetLabel, modeLabel); body.append(row);
    }
    updateUnmapped();
  }
  function updateUnmapped() {
    if (!state.metadata || state.metadata.kind === 'text') return;
    const used = new Set([selectedColumn($('right-key'))]), omitted = [];
    for (const row of $('field-mapping').children) {
      const target = selectedColumn(row.querySelector('.field-target'));
      if (target) used.add(target); else omitted.push('A: ' + row.dataset.left);
    }
    for (const name of state.metadata.right.headers) if (!used.has(name)) omitted.push('B: ' + name);
    uiSetText($('unmapped-fields'), omitted.length ? uiMessage("Fields that won't be checked: {0}. Match these fields or explicitly apply these settings.", { 0: omitted.join('; ') }) : uiMessage("All fields are matched. The identifier pairs the rows; the other fields are checked within each pair."));
  }
  async function prepare() {
    clearResult(); state.metadata = null; state.suggested = [];
    $('advanced-key-home').append($('key-controls')); $('setup-question').hidden = true;
    $('rules').hidden = true; $('rules').disabled = true; $('rules-empty').hidden = false;
    uiSetText($('rules-summary'), uiMessage("Detect automatically"));
    $('settings').hidden = textSourcesSelected();
    if (!state.sources.left || !state.sources.right) { notice(uiMessage("Add the second file to start comparing automatically.")); officeReset(uiMessage("The first file is ready. Add the second, and I'll match the items and explain the results.")); return; }
    busy(true); notice(uiMessage("Reading files and finding matches…"));
    const revision = state.revision; let ready = false;
    try {
      const metadata = await api('/api/prepare', {...state.sources, delimiter: delimiter()});
      if (revision !== state.revision) return;
      if (metadata.needs_sheet) {
        for (const side of ['left', 'right']) showSheets(side, metadata.sheets[side], metadata.selected[side]);
        notice(uiMessage("Choose a sheet in each Excel file that has multiple sheets with data. I'll compare only the selected sheets."));
        officeReset(uiMessage("This workbook has multiple sheets with data. Choose a sheet next to the file to continue."));
        return;
      }
      state.metadata = metadata;
      if (metadata.kind === 'text') {
        $('settings').hidden = true; $('rules-empty').hidden = true;
        for (const side of ['left', 'right']) {
          showSheets(side);
          uiSetText($(side + '-meta'), uiMessage("{0}{1} · replace file", { 0: metadata[side].page_count ? uiMessage("{0} pages · ", { 0: metadata[side].page_count }) : '', 1: String(metadata[side].format).toUpperCase() }));
        }
        ready = metadata.ready;
      } else {
        $('settings').hidden = false;
        state.suggested = metadata.rules.fields; state.delimiter = metadata.delimiter;
        for (const side of ['left', 'right']) {
          showSheets(side, metadata[side].sheets, metadata[side].sheet ?? null);
          uiSetText($(side + '-meta'), uiMessage("{0}{1} rows · {2} columns · replace file", { 0: metadata[side].sheet ? uiMessage("Sheet «{0}» · ", { 0: metadata[side].sheet }) : '', 1: metadata[side].row_count, 2: metadata[side].headers.length }));
          options($(side + '-key'), metadata[side].headers, uiMessage("Choose an identifier"));
        }
        if (metadata.rules.key) { chooseColumn($('left-key'), metadata.rules.key[0]); chooseColumn($('right-key'), metadata.rules.key[1]); }
        $('membership').checked = !!metadata.rules.key && metadata.left.headers.length === 1 && metadata.right.headers.length === 1;
        $('strip').checked = false; $('mapping-panel').hidden = $('membership').checked;
        mapping(false); $('rules').hidden = false; $('rules-empty').hidden = true;
        ready = metadata.ready;
        if (!ready) {
          uiSetText($('question-text'), metadata.question);
          $('setup-question').hidden = false;
          if (!metadata.rules.key) $('question-controls').append($('key-controls'));
          else $('settings').open = true;
          $('question-title').focus({preventScroll: true});
          $('setup-question').scrollIntoView({behavior: 'smooth', block: 'center'});
          if (metadata.unmatched.left.length || metadata.unmatched.right.length) $('settings').open = true;
          notice(); officeReset(uiMessage("The files are ready. Specify how to match the items so I can explain the results."));
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError' && revision === state.revision) { state.metadata = null; notice(uiMessage("Couldn't read the files. {0}", { 0: uiError(error.message) }), true); $('settings').open = true; officeReset(uiMessage("Couldn't read the files. Check the message next to the upload and try again.")); }
    } finally { if (revision === state.revision) busy(false); }
    if (ready && revision === state.revision) await compare();
  }
  async function loadFile(side, file) {
    if (!file || state.busy) return;
    if (/\.doc$/i.test(file.name)) { visualReview?.closeWorkspaceTools?.(); notice(uiMessage("Old Word files (.doc) are not supported. Open the file in Word or LibreOffice and save it as .docx, then try again."), true); $('notice').scrollIntoView({block: 'nearest'}); return; }
    const version = ++loads[side]; clearResult(); state.sources[side] = null; state.metadata = null;
    showSheets(side); $('settings').hidden = textSourcesSelected();
    $('advanced-key-home').append($('key-controls')); $('setup-question').hidden = true;
    $('rules').hidden = true; $('rules').disabled = true; $('rules-empty').hidden = false; sourceLabel(side, null);
    if (file.size > MAX_FILE_BYTES) { notice(uiMessage("This file exceeds 2 MiB. Choose a smaller file."), true); return; }
    if (/\.(txt|docx|pdf)$/i.test(file.name) && !window.KristinaTransport) { notice(uiMessage("The document engine could not load. Reload this page and try again."), true); return; }
    if (/\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(file.name) && !window.KristinaTransport) { notice(uiMessage("The spreadsheet engine could not load. Reload this page and try again."), true); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (version !== loads[side]) return;
      state.sources[side] = {name: file.name, data: encode(bytes)}; sourceLabel(side, file); await prepare();
    } catch (error) { if (version === loads[side]) { clearResult(); state.metadata = null; notice(uiMessage("Couldn't open the file. {0}", { 0: uiError(error.message) }), true); } }
  }
  function selectedRules() {
    const key = [selectedColumn($('left-key')), selectedColumn($('right-key'))];
    if (key.some(value => !value)) throw new Error("Choose an identifier for the same item in both files.");
    const fields = [], used = new Set();
    if (!$('membership').checked) {
      for (const row of $('field-mapping').children) {
        const right = selectedColumn(row.querySelector('.field-target')); if (!right) continue;
        if (used.has(right)) throw new Error("Each column needs a unique match. Duplicate: " + right);
        used.add(right); fields.push([row.dataset.left, right, row.querySelector('.field-mode').value]);
      }
      if (!fields.length) throw new Error("Choose values to check or enable “Check only whether items are present.”");
    }
    return {key, fields, strip: $('strip').checked};
  }
  async function compare() {
    if (state.busy || !state.metadata) return;
    let rules; try { rules = state.metadata.kind === 'text' ? {} : selectedRules(); } catch (error) { clearResult(); notice(uiError(error.message), true); return; }
    clearResult(); busy(true); const revision = state.revision; notice(uiMessage("Comparing documents…"));
    try {
      const payload = state.metadata.kind === 'text' ? {...state.sources} : {...state.sources, delimiter: state.delimiter, ...rules};
      const result = await api('/api/compare', payload);
      if (revision !== state.revision) return;
      state.report = result.report; state.html = result.html;
      $('advanced-key-home').append($('key-controls')); $('setup-question').hidden = true;
      await renderResult(); officeDescribe(); notice();
      if (revision === state.revision && state.report === result.report && result.report.status === 'complete') {
        recordProductEvent('comparison_complete', {comparison_type: result.report.kind === 'text' ? 'text' : 'table'});
      }
    } catch (error) { if (error.name !== 'AbortError' && revision === state.revision) { clearResult(); notice(uiMessage("Comparison failed. {0}", { 0: uiError(error.message) }), true); officeReset(uiMessage("Comparison failed. Correct the data or settings described in the error message.")); busy(false); } }
    finally { if (revision === state.revision) busy(false); }
  }
  function renderCommercial() {
    const box = $('commercial-summary'), impact = state.report?.commercial;
    box.replaceChildren(); box.hidden = !impact || state.report.kind === 'text' || state.report.status !== 'complete';
    if (box.hidden) return;
    box.append(element('h3', uiMessage("Impact on total")));
    const stats = element('p', undefined, 'commercial-counts');
    const count = value => value === null || value === undefined ? uiMessage("not determined") : String(value);
    uiSetText(stats, uiMessage("Price changed: {0} · quantity: {1} · only in A: {2} · only in B: {3}", { 0: count(impact.counts.price_changed), 1: count(impact.counts.quantity_changed), 2: impact.counts.only_left, 3: impact.counts.only_right }));
    box.append(stats);
    for (const line of window.KristinaOffice.commercialLines(state.report)) box.append(element('p', line));
    const revision = state.revision;
    function details(items, heading, describe) {
      if (!items.length) return;
      const section = element('details'), list = element('ul', undefined, 'commercial-items');
      section.append(element('summary', uiMessage("{0}: {1}", {0: heading, 1: items.length})));
      for (const item of items.slice(0, 12)) {
        const row = element('li'); row.append(element('p', describe(item)));
        row.append(officeActions([{label: uiTranslate("Open {0} in documents", {0: String(item.key).slice(0, 70)}), key: item.key, category: item.category}], revision));
        list.append(row);
      }
      section.append(list);
      if (items.length > 12) section.append(element('p', uiMessage("Showing 12 of {0}; all items are included in the downloadable HTML report.", { 0: items.length }), 'hint'));
      box.append(section);
    }
    details(impact.items.filter(item => !/^0(?:\.0+)?$/.test(String(item.delta))), uiMessage("Changes by item"), item => `${item.key} · ${item.unit}: ${window.KristinaOffice.commercialTotalLine(item)}`);
    details(impact.excluded, uiMessage("Information needed for a complete calculation"), item => `${item.key}: ${item.reasons.join(' ')}`);
  }
  function renderResult(restoredState) {
    const report = state.report, complete = report.status === 'complete', textMode = report.kind === 'text';
    reviewMode(complete, textMode);
    $('text-editor').hidden = !(complete && textMode);
    editorStatus();
    changePage = 0;
    exportEnable();
    renderCommercial();
    $('results').hidden = false; $('complete-result').hidden = !complete; $('clarification').hidden = complete;
    uiSetText($('result-heading'), complete ? report.summary.changed + report.summary.only_left + report.summary.only_right ? uiMessage("Document differences") : uiMessage("Checked values match") : uiMessage("More information needed"));
    $('settings').hidden = textMode; $('text-scope').hidden = !textMode;
    $('results').classList.toggle('text-results', textMode);
    const pdfMode = textMode && Object.values(report.sources).some(source => source.format === 'pdf');
    uiSetText($('text-scope'), pdfMode ? uiMessage("PDF: only the extracted text layer is compared. Images were not compared, and text within images was not recognized. Original layout and legal meaning are not checked; spacing and line order may depend on how the PDF was created.") : uiMessage("Only text is compared. Formatting, spelling, and legal meaning are not checked."));
    uiSetAttr($('search'), "placeholder", textMode ? uiMessage("Find in text…") : uiMessage("Find an item code…"));
    uiSetText($('search-label-text'), textMode ? uiMessage("Find text in documents") : uiMessage("Find an item"));
    uiSetAttr($('totals'), 'aria-label', textMode ? uiMessage("Show sections") : uiMessage("Show items"));
    const notes = $('text-source-notes'); notes.replaceChildren();
    if (textMode) {
      uiSetText($('result-context'), uiMessage("{0} sections in A · {1} in B. Showing extracted text without the original layout.", { 0: report.summary.left_blocks, 1: report.summary.right_blocks }));
      if (!report.summary.changed && !report.summary.only_left && !report.summary.only_right) uiSetText($('result-heading'), report.moved?.length || report.reflow?.length ? uiMessage("Section order or line breaks changed") : pdfMode ? uiMessage("Extracted text matches") : uiMessage("Document text matches"));
      uiSetText($('audit-explanation'), uiMessage("Comparing extracted text: lines in TXT files and paragraphs in DOCX files. Original words and spaces are preserved; line endings are standardized. Section numbers and labels refer to each original file. Unmatched sections appear on only one side. Formatting and layout are not compared."));
      if (pdfMode) uiSetText($('audit-explanation'), uiMessage("Comparing the PDF text layer: lines are linked to their original page numbers. Layout and page numbers do not affect comparison. Spaces and line order are reconstructed during extraction; original pages are not reproduced here."));
      if (report.moved?.length || report.reflow?.length) uiAppendText($('audit-explanation'), uiMessage(" Matched section pairs are shown; their display order may differ from the original. Labels show original locations. Moves and line break changes are highlighted separately. Line break changes are detected by a line-joining heuristic, without assessing whether the meaning is equivalent."));
      for (const side of ['left', 'right']) for (const note of (report.sources[side].notes || [])) notes.append(element('li', (side === 'left' ? uiMessage("A: {0}", { 0: uiError(note) }) : uiMessage("B: {0}", { 0: uiError(note) }))));
    } else {
      uiSetText($('result-context'), uiMessage("Rows are paired by «{0}». Record numbers refer to the original files.", { 0: report.rules.key.join('» ↔ «') }));
      const numeric = report.rules.fields.filter(f => f[2] === 'number').map(f => f[0]);
      uiSetText($('rules-summary'), numeric.length ? uiMessage("By «{0}» · numeric fields: {1}", {0: report.rules.key.join('» ↔ «'), 1: numeric.join(', ')}) : uiMessage("By «{0}» · exact text comparison", {0: report.rules.key.join('» ↔ «')}));
      uiSetText($('audit-explanation'), uiMessage("Showing the selected tables. Rows are paired by identifier, and record numbers refer to the original files (the header is record 1). Only checked fields are highlighted; other fields are labeled separately. Units and currencies are not converted."));
    }
    notes.hidden = !notes.children.length;
    $('source-notes-details').hidden = !notes.children.length;
    uiSetText($('audit-details'), JSON.stringify({sources: report.sources, rules: report.rules}, null, 2));
    $('search').value = ''; state.active = -1;
    if (!complete) {
      const box = $('clarification'); box.replaceChildren(element('h3', uiMessage("Comparison not completed")));
      const list = element('ul'); for (const question of report.questions) list.append(element('li', uiError(question)));
      box.append(list, element('p', uiMessage("Correct the specified data or change the comparison settings. No partial results are available.")));
      const details = element('details'); details.append(element('summary', uiMessage("Details")), element('pre', JSON.stringify(report.issues, null, 2))); box.append(details);
      return;
    }
    state.records = [];
    const visibleCategories = categories.filter(([key]) => !structuralCategory(key) || (textMode && report[key]?.length));
    for (const [category] of visibleCategories.slice(1)) for (const item of report[category] || []) state.records.push({...item, category});
    if (textMode) state.records.sort((a, b) => Number(a.key.slice(5)) - Number(b.key.slice(5)));
    else state.records.sort((a, b) => (a.left?.record ?? (a.category === 'only_left' ? a.row.record : Infinity)) - (b.left?.record ?? (b.category === 'only_left' ? b.row.record : Infinity)) || (a.right?.record ?? a.row?.record ?? 0) - (b.right?.record ?? b.row?.record ?? 0));
    state.filter = 'all'; state.page = 0; $('totals').replaceChildren();
    for (const [key, label] of visibleCategories) {
      const button = element('button', undefined, 'total'); button.type = 'button'; button.dataset.category = key;
      button.append(element('strong', key === 'all' ? state.records.length : (report.summary[key] ?? report[key]?.length ?? 0)), element('span', textMode && key === 'all' ? uiMessage("All sections") : label));
      button.addEventListener('click', () => { state.filter = key; state.page = 0; state.active = -1; changePage = 0; renderRows(); }); $('totals').append(button);
    }
    uiSetText($('document-left-name'), report.sources.left.name); uiSetText($('document-right-name'), report.sources.right.name);
    $('no-overlap').hidden = textMode || !(report.summary.left_rows && report.summary.right_rows && report.summary.matched + report.summary.changed === 0);
    renderRows();
    if (window.KristinaTransport) return startVisualReview(report, restoredState);
  }
  async function startVisualReview(report, restoredState) {
    restoreWorkspaceTools();
    visualController?.abort(); visualReview?.dispose(); visualReview = null;
    $('visual-load-error').hidden = true;
    const abort = new AbortController(); visualController = abort;
    try {
      const mount = report.kind === 'text' ? (await import(visualModuleURL.href)).mountVisualReview : (await import(sheetModuleURL.href)).mountSheetReview;
      if (abort.signal.aborted || state.report !== report) return;
      document.body.classList.add('visual-mode'); $('visual-review').hidden = false;
      uiSetText($('result-context'), uiMessage("Both documents are ready. Click any text to edit it."));
      uiSetText($('source-privacy'), uiMessage("Documents and edits are saved in this browser. You can download your edited documents."));
      const sources = {...state.sources};
      const review = await mount($('visual-review'), {report, sources, restoredState, signal: abort.signal,
        onSelectionChange: context => { if (!abort.signal.aborted) officeUpdateContext(context); },
        onExplain: () => { if (!abort.signal.aborted) officeToggle(true); },
        onStateChange: () => { if (!abort.signal.aborted) sessionUI?.changed(); }, onRevision: changed => {
        if (abort.signal.aborted) return;
        uiSetText($('result-heading'), changed ? uiMessage("Edit documents") : uiMessage("Compare documents"));
        uiSetText($('download-xlsx'), changed ? uiMessage("Original differences · XLSX") : uiMessage("Report · XLSX"));
        uiSetText($('download-pdf'), changed ? uiMessage("Original differences · PDF ↓") : uiMessage("Report · PDF ↓"));
      }});
      if (abort.signal.aborted) review.dispose();
      else {
        visualReview = review;
        $('source-picker').open = false;
        await sessionReady;
        if (!abort.signal.aborted) {
          sessionUI?.activate(() => ({version: 1, sources, report, review: review.snapshot()}));
          if (!document.body.classList.contains('single-mode')) mountWorkspaceTools(review);
        }
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        restoreWorkspaceTools();
        abort.abort(); $('visual-review').replaceChildren(); $('visual-review').className = ''; $('visual-review').hidden = true;
        officeUpdateContext(null);
        if (restoredState) throw error;
        // A failed module must not silently replace the complete editor with the legacy UI.
        document.body.classList.add('visual-mode');
        uiSetText($('result-heading'), uiMessage("Open documents"));
        $('visual-load-error').hidden = false;
      }
    }
  }
  async function resumeSession(saved) {
    clearResult(); busy(true); const revision = state.revision;
    notice(uiMessage("Opening saved documents…"));
    try {
      const renderSaved = saved.report.kind === 'text' ? (await import(textReportModuleURL.href)).renderTextHtml : (await import(tableReportModuleURL.href)).renderHtml;
      if (revision !== state.revision) return;
      state.sources = saved.sources; state.report = saved.report;
      state.html = renderSaved(saved.report); state.metadata = saved.report.kind === 'text' ? {kind:'text'} : null;
      for (const side of ['left', 'right']) {
        loads[side]++; $(side + '-file').value = ''; sourceLabel(side, state.sources[side]); showSheets(side);
      }
      $('advanced-key-home').append($('key-controls')); $('setup-question').hidden = true;
      if (saved.report.kind !== 'text') {
        state.metadata = {left:saved.report.sources.left,right:saved.report.sources.right}; state.suggested=saved.report.rules.fields; state.delimiter=saved.report.rules.delimiter;
        $('delimiter').value=saved.report.rules.delimiter==='\t'?'tab':saved.report.rules.delimiter;
        for(const [i,side] of ['left','right'].entries()) {options($(side+'-key'),state.metadata[side].headers,uiMessage("Choose an identifier"));chooseColumn($(side+'-key'),saved.report.rules.key[i]);showSheets(side,state.metadata[side].sheets,state.metadata[side].sheet??null);}
        $('membership').checked=saved.report.rules.fields.length===0;$('strip').checked=saved.report.rules.strip;$('mapping-panel').hidden=$('membership').checked;mapping(false);for(const row of $('field-mapping').children) if(!saved.report.rules.fields.some(field=>field[0]===row.dataset.left)){row.querySelector('.field-target').value='';row.querySelector('.field-mode').disabled=true;}updateUnmapped();$('rules').hidden=false;$('rules-empty').hidden=true;
      }
      await renderResult(saved.review);
      if (revision !== state.revision) return;
      document.dispatchEvent(new Event('ctt:comparison-resumed'));
      officeDescribe(); notice();
      if (!document.body.classList.contains('home-mode') && !$('compare-workspace').hidden) $('visual-review').scrollIntoView({block: 'start'});
    } catch (error) {
      clearResult(); state.metadata = null;
      // Keep the stored session available for explicit deletion/recovery.
      throw error;
    } finally { busy(false); }
  }
  function finishSession() {
    clearResult(); state.metadata = null; state.sources = {left: null, right: null};
    state.suggested = [];
    for (const side of ['left', 'right']) {
      loads[side]++; $(side + '-file').value = ''; sourceLabel(side, null); showSheets(side);
    }
    $('settings').hidden = false; $('settings').open = false;
    $('advanced-key-home').append($('key-controls')); $('setup-question').hidden = true;
    $('rules').hidden = true; $('rules').disabled = true; $('rules-empty').hidden = false;
    uiSetText($('rules-summary'), uiMessage("Detect automatically"));
    uiSetText($('source-privacy'), uiMessage("Comparison starts automatically. Files are processed in your browser. Up to 2 MiB per file."));
    officeReset(); notice(uiMessage("Session ended. Saved documents and edits have been deleted from this browser."));
  }
  // A bounded, linear prefix/suffix highlight. Preserve every original character.
  function highlight(container, value, other, mode) {
    if (mode === 'number' || !value || !other) { container.append(element('mark', value)); return; }
    const a = Array.from(value), b = Array.from(other); let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    container.append(document.createTextNode(a.slice(0, start).join('')), element('mark', a.slice(start, a.length - end).join('')), document.createTextNode(end ? a.slice(a.length - end).join('') : ''));
  }
  function editorStatus() {
    const editor = state.editor;
    $('editor-workspace').hidden = !editor;
    $('editor-start').hidden = !!editor;
    if (!editor) return;
    uiSetText($('editor-status'), editor.matchesCanonical ? uiMessage("Version B matches the extracted text of A, including section order.") : editor.changed ? uiMessage("Version B has been edited. Some differences from reference A remain.") : uiMessage("Version B still contains its original text."));
    $('editor-undo').disabled = !editor.canUndo;
    $('editor-reset').disabled = !editor.changed;
    $('editor-all').disabled = editor.matchesCanonical;
    if ($('editor-preview-details').open) uiSetText($('editor-preview'), editor.text());
  }
  function editorAction(action, redraw = true) {
    if (!state.editor) return;
    try {
      action(state.editor);
      $('editor-error').hidden = true;
      editorStatus();
      if (redraw) {
        const scroll = $('document-scroll').scrollTop;
        renderRows(); $('document-scroll').scrollTop = scroll;
      }
      return true;
    } catch (error) {
      uiSetText($('editor-error'), uiError(error.message));
      $('editor-error').hidden = false;
      return false;
    }
  }
  function editorPanel(item, panel) {
    const editor = state.editor, revision = state.revision;
    if (!editor) return;
    panel.classList.add('has-editor');
    const current = editor.get(item.key), box = element('div', undefined, 'fragment-editor');
    const label = element('label', uiMessage("Version B"), 'draft-label');
    const field = element('textarea'); field.dir='auto'; field.setAttribute('translate','no'); field.rows = Math.min(10, Math.max(3, (current || '').split('\n').length + 1));
    field.value = current ?? ''; field.maxLength = 500000;
    uiSetAttr(field, 'aria-label', uiMessage("Version B · {0}", { 0: (item.right?.location || item.left?.location || item.row?.location || item.key) }));
    field.dataset.key = item.key;
    field.addEventListener('input', () => {
      if (revision !== state.revision || editor !== state.editor) return;
      if (!editorAction(draft => draft.edit(item.key, field.value), false)) field.value = editor.get(item.key) ?? '';
      absent.hidden = editor.get(item.key) !== null;
    });
    field.addEventListener('blur', () => editor.endEdit());
    label.append(field); box.append(label);
    const absent = element('p', uiMessage("This section is missing from version B. Start typing or add it from A."), 'hint');
    absent.hidden = current !== null; box.append(absent);
    const accept = element('button', item.category === 'only_right' ? uiMessage("Remove from version B") : item.category === 'only_left' ? uiMessage("Add from A") : item.category === 'moved' ? uiMessage("Use A and restore section order") : uiMessage("Use text from A"));
    accept.type = 'button'; accept.className = 'button secondary accept-canonical';
    accept.addEventListener('click', () => {
      if (revision !== state.revision || editor !== state.editor) return;
      editorAction(draft => draft.apply(item.key));
      const restored = [...$('result-rows').querySelectorAll('textarea')].find(node => node.dataset.key === item.key);
      restored?.focus({preventScroll: true});
    });
    box.append(accept); panel.append(box);
  }
  $('editor-start').addEventListener('click', () => {
    if (state.report?.kind !== 'text' || state.report.status !== 'complete') return;
    state.editor = window.KristinaTextEditor.create(state.report);
    editorStatus(); renderRows();
  });
  $('editor-all').addEventListener('click', () => editorAction(editor => editor.applyAll()));
  $('editor-undo').addEventListener('click', () => editorAction(editor => editor.undo()));
  $('editor-reset').addEventListener('click', () => editorAction(editor => editor.reset()));
  $('editor-preview-details').addEventListener('toggle', editorStatus);
  $('editor-download').addEventListener('click', () => {
    if (!state.editor) return;
    const url = URL.createObjectURL(new Blob([state.editor.exportText()], {type: 'text/plain;charset=utf-8'}));
    const link = element('a'); link.href = url; link.download = 'ctt-edited-B.txt';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordProductEvent('document_download', {file_format: 'txt', workspace: 'comparison'});
  });
  function textPanel(item, side) {
    const isLeft = side === 'left', row = item[side] || (item.category === (isLeft ? 'only_left' : 'only_right') ? item.row : null);
    const panel = element('section', undefined, 'document-record text-record ' + (isLeft ? 'before' : 'after'));
    uiSetAttr(panel, 'aria-label', (isLeft ? uiMessage("A · {0}", { 0: (row?.location || uiMessage("No section")) }) : uiMessage("B · {0}", { 0: (row?.location || uiMessage("No section")) })));
    if (!row) { panel.classList.add('absent'); panel.append(element('p', uiMessage("This section is missing"))); return panel; }
    const title = element('div', undefined, 'record-title');
    const labels = {changed: uiMessage("Text changed"), matched: uiMessage("Text matches"), only_left: uiMessage("Only in A"), only_right: uiMessage("Only in B"), moved: uiMessage("Moved without text changes"), reflow: uiMessage("Line breaks changed")};
    title.append(element('strong', row.location), element('span', labels[item.category], 'record-status')); panel.append(title);
    if (row.page && row.line === 1) panel.append(element('p', uiMessage("Page {0}", { 0: row.page }), 'pdf-page-label'));
    const content = element('p', undefined, 'text-content'); content.dir='auto'; content.setAttribute('translate','no');
    if (item.category === 'changed') {
      const segments = item.segments?.[side];
      // Never replace source text with an incomplete set of highlight tokens.
      if (Array.isArray(segments) && segments.map(part => part.text).join('') === row.text) {
        for (const part of segments) content.append(element(part.changed ? 'mark' : 'span', part.text));
      } else content.append(element('mark', row.text));
    } else if (item.category === 'only_left' || item.category === 'only_right') content.append(element('mark', row.text));
    else uiSetText(content, row.text);
    if (!row.text) { content.classList.add('is-empty'); uiSetAttr(content, 'aria-label', uiMessage("Blank line")); }
    panel.append(content);
    if (row.source_blocks?.length) {
      const sources = element('details', undefined, 'source-blocks');
      sources.append(element('summary', uiMessage("Original sections: {0}", { 0: row.source_blocks.length })));
      for (const block of row.source_blocks) {
        const original = element('div', undefined, 'source-block');
        original.append(element('strong', uiMessage("{0} · block {1}", { 0: block.location, 1: block.record })), element('p', block.text, 'text-content'));
        sources.append(original);
      }
      panel.append(sources);
    }
    return panel;
  }
  function recordPanel(item, side) {
    const isLeft = side === 'left', index = isLeft ? 0 : 1;
    const row = item[side] || (item.category === (isLeft ? 'only_left' : 'only_right') ? item.row : null);
    const panel = element('section', undefined, 'document-record ' + (isLeft ? 'before' : 'after'));
    uiSetAttr(panel, 'aria-label', (isLeft ? uiMessage("A · {0}", { 0: item.key }) : uiMessage("B · {0}", { 0: item.key })));
    if (!row) { panel.classList.add('absent'); panel.append(element('p', uiMessage("This item is missing"))); return panel; }
    const title = element('div', undefined, 'record-title'), keyName = state.report.rules.key[index];
    title.append(element('strong', `${keyName}: ${row.values[keyName]}`), element('span', row.sheet ? uiMessage("«{0}» · row {1} · {2}", { 0: row.sheet, 1: row.record, 2: row.cells[keyName] }) : uiMessage("Record {0}", { 0: row.record }), 'record-number'));
    const labels = {changed: uiMessage("Changes found"), only_left: uiMessage("Only in A"), only_right: uiMessage("Only in B"), matched: uiMessage("Checked fields match")};
    title.append(element('span', labels[item.category], 'record-status')); panel.append(title);
    const values = element('dl', undefined, 'document-values');
    const changes = new Map((item.changes || []).map(c => [isLeft ? c.left_column : c.right_column, c]));
    const checked = new Map(state.report.rules.fields.map(f => [f[index], f]));
    for (const name of state.report.sources[side].headers) {
      const value = row.values[name];
      if (name === keyName) continue;
      const block = element('div', undefined, 'document-field'), label = element('dt', name), dd = element('dd');
      block.dataset.field = name;
      if (row.cells?.[name]) label.append(element('span', ' · ' + row.cells[name], 'cell-address'));
      if (value.length > 35 || /наименование|name|description/i.test(name)) block.classList.add('wide');
      if (!value) label.append(element('span', uiMessage(" · empty value"), 'uncompared'));
      const change = changes.get(name), single = item.category === 'only_left' || item.category === 'only_right';
      if (change) {
        block.classList.add('is-changed'); label.append(element('span', uiMessage(" · changed")));
        highlight(dd, value, isLeft ? change.after : change.before, change.mode);
      } else if (single) dd.append(element('mark', value));
      else {
        uiSetText(dd, value);
        const rule = checked.get(name);
        if (!rule) label.append(element('span', uiMessage(" · not checked"), 'uncompared'));
        else if (rule[2] === 'number' && item[isLeft ? 'right' : 'left'].values[rule[isLeft ? 1 : 0]] !== value) label.append(element('span', uiMessage(" · numerically equal"), 'uncompared'));
      }
      block.append(label, dd); values.append(block);
    }
    if (!values.children.length) values.append(element('p', uiMessage("Checked whether the identifier is present."), 'hint'));
    panel.append(values); return panel;
  }
  function filtered() {
    const query = $('search').value.toLocaleLowerCase();
    return state.records.filter(item => (state.filter === 'all' || item.category === state.filter) && (state.report?.kind === 'text' ? [item.left?.text, item.right?.text, item.row?.text, item.left?.location, item.right?.location, item.row?.location].some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(query)) : item.key.toLocaleLowerCase().includes(query)));
  }
  function changeEntries(records) {
    return records.flatMap((item, index) => item.category === 'matched' ? [] : [{item, index}]);
  }
  function renderChanges(records, followActive = false) {
    const changes = changeEntries(records), active = changes.findIndex(entry => entry.index === state.active);
    const pages = Math.max(1, Math.ceil(changes.length / PAGE_SIZE));
    if (followActive && active >= 0) changePage = Math.floor(active / PAGE_SIZE);
    changePage = Math.max(0, Math.min(changePage, pages - 1));
    uiSetText($('change-count'), String(changes.length));
    uiSetText($('change-position'), active < 0 ? uiMessage("Differences: {0}", { 0: changes.length }) : uiMessage("Difference {0} of {1}", { 0: active + 1, 1: changes.length }));
    const list = $('change-list'); list.replaceChildren(); list.start = changePage * PAGE_SIZE + 1;
    const labels = {changed: uiMessage("Changed"), only_left: uiMessage("Only in A"), only_right: uiMessage("Only in B"), moved: uiMessage("Moved without text changes"), reflow: uiMessage("Line breaks changed")};
    const textMode = state.report.kind === 'text';
    for (const [offset, {item, index}] of changes.slice(changePage * PAGE_SIZE, (changePage + 1) * PAGE_SIZE).entries()) {
      const li = element('li'), button = element('button', undefined, 'change-item');
      button.type = 'button'; button.dataset.index = String(index);
      if (index === state.active) button.setAttribute('aria-current', 'true');
      button.append(element('span', uiMessage('{0}. {1}', {0: changePage * PAGE_SIZE + offset + 1, 1: labels[item.category]}), 'change-item-title'));
      const locations = [];
      for (const side of ['left', 'right']) {
        const left = side === 'left', row = item[side] || (item.category === (left ? 'only_left' : 'only_right') ? item.row : null);
        if (!row) continue;
        locations.push(`${left ? 'A' : 'B'}: ${textMode ? row.location : (row.sheet ? `«${row.sheet}» · row ${row.record}` : `record ${row.record}`)}`);
        let value;
        if (textMode) value = row.text;
        else value = item.key + (item.changes?.length ? ' · ' + item.changes.map(change => `${left ? change.left_column : change.right_column}: ${left ? change.before : change.after}`).join('; ') : '');
        // Only this navigation preview is shortened; the evidence keeps every character.
        const preview = Array.from(value);
        button.append(element('span', `${left ? 'A' : 'B'}: ${preview.slice(0, 160).join('')}${preview.length > 160 ? '…' : ''}` + (!value ? uiTranslate(" (empty text)") : ''), 'change-excerpt ' + (structuralCategory(item.category) ? 'structural' : (left ? 'before' : 'after'))));
      }
      button.append(element('span', locations.join(' · '), 'change-location'));
      const revision = state.revision;
      button.addEventListener('click', () => { if (revision === state.revision) selectChange(index); });
      li.append(button); list.append(li);
    }
    $('change-empty').hidden = changes.length > 0;
    uiSetText($('change-empty'), state.filter !== 'all' || $('search').value ? uiMessage("No differences in the selected results. Clear the filter or search to see the rest.") : uiMessage("No differences found using these comparison rules."));
    uiSetText($('changes-page'), changes.length ? uiMessage("{0}–{1} of {2}", { 0: changePage * PAGE_SIZE + 1, 1: Math.min((changePage + 1) * PAGE_SIZE, changes.length), 2: changes.length }) : '0');
    $('changes-previous').disabled = changePage === 0; $('changes-next').disabled = changePage >= pages - 1;
  }
  function renderRows(followActive = false) {
    if (!state.report || state.report.status !== 'complete') return;
    for (const button of $('totals').children) button.setAttribute('aria-pressed', String(button.dataset.category === state.filter));
    const records = filtered(), pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE)); state.page = Math.min(state.page, pages - 1);
    const textMode = state.report.kind === 'text', unit = textMode ? "sections" : "items";
    const start = state.page * PAGE_SIZE; uiSetText($('record-range'), records.length ? uiMessage("{0}–{1} of {2} {3}", { 0: start + 1, 1: Math.min(start + PAGE_SIZE, records.length), 2: records.length, 3: unit }) : `0 ${unit}`);
    const root = $('result-rows'); root.replaceChildren();
    for (const [offset, item] of records.slice(start, start + PAGE_SIZE).entries()) {
      const pair = element('article', undefined, 'document-pair ' + item.category.replace('_', '-')); pair.tabIndex = -1; pair.dataset.index = String(start + offset); pair.dataset.category = item.category;
      pair.classList.toggle('active-change', start + offset === state.active && item.category !== 'matched');
      const panel = textMode ? textPanel : recordPanel;
      const left = panel(item, 'left'), right = panel(item, 'right');
      if (textMode) editorPanel(item, right);
      pair.append(left, right); root.append(pair);
    }
    if (!records.length) root.append(element('p', textMode ? uiMessage("No sections match this filter.") : uiMessage("No items match this filter."), 'zero-state'));
    uiSetText($('page-info'), uiMessage("Page {0} of {1}", { 0: state.page + 1, 1: pages }));
    $('previous').disabled = state.page === 0; $('next').disabled = state.page >= pages - 1;
    const hasChanges = records.some(item => item.category !== 'matched'); $('next-change').disabled = !hasChanges; $('previous-change').disabled = !hasChanges;
    $('document-scroll').scrollTop = 0;
    renderChanges(records, followActive);
  }
  function selectChange(index) {
    const records = filtered();
    if (!records[index] || records[index].category === 'matched') return;
    state.active = index; state.page = Math.floor(index / PAGE_SIZE); renderRows(true);
    const pair = $('result-rows').querySelector(`[data-index="${index}"]`);
    pair.focus({preventScroll: true}); pair.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'});
  }
  function jumpChange(direction) {
    const records = filtered(), indexes = records.flatMap((item, i) => item.category !== 'matched' ? [i] : []);
    if (!indexes.length) return;
    selectChange(direction > 0 ? (indexes.find(i => i > state.active) ?? indexes[0]) : (indexes.findLast(i => i < state.active) ?? indexes[indexes.length - 1]));
  }
  async function download(format) {
    if (!state.report) return;
    const report = state.report, revision = state.revision, html = format === 'html';
    let content;
    if (html) {
      try {
        const renderer = await import(report.kind === 'text' ? textReportModuleURL.href : tableReportModuleURL.href);
        if (revision !== state.revision || report !== state.report) return;
        content = report.kind === 'text' ? renderer.renderTextHtml(report) : renderer.renderHtml(report);
      } catch (error) { notice(uiError(error.message), true); return; }
    } else content = JSON.stringify(report, null, 2) + '\n';
    const url = URL.createObjectURL(new Blob([content], {type: html ? 'text/html;charset=utf-8' : 'application/json;charset=utf-8'}));
    const link = element('a'); link.href = url; link.download = 'ctt-comparison.' + format; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    recordProductEvent('document_download', {file_format: format, workspace: 'comparison'});
  }
  function exportEnable() {
    const available = !!window.KristinaTransport && state.report?.status === 'complete';
    for (const format of ['xlsx', 'pdf']) {
      const button = $('download-' + format);
      button.hidden = !available || (format === 'xlsx' && state.report.kind === 'text');
      button.disabled = button.hidden || state.busy || !!exportController;
    }
  }
  function exportStatus(message = '', error = false) {
    const status = $('export-status');
    uiSetText(status, error && !message?.__cttUiMessage && !message?.__cttUiError ? uiError(message) : message); status.hidden = !message; status.classList.toggle('export-error', error);
  }
  async function downloadExport(format) {
    if (!['xlsx', 'pdf'].includes(format) || !window.KristinaTransport || state.busy || exportController || state.report?.status !== 'complete') return;
    if (format === 'xlsx' && state.report.kind === 'text') return;
    const report = state.report, revision = state.revision, requestController = new AbortController();
    exportController = requestController; exportEnable();
    let pdfLabelsInEnglish = false;
    exportStatus(uiMessage("Preparing {0} report…", {0: format.toUpperCase()}));
    const current = () => !requestController.signal.aborted && revision === state.revision && report === state.report && exportController === requestController;
    try {
      if (format === 'pdf') {
        const {pdfReportLocale} = await import(pdfReportLanguageURL.href);
        const locale = globalThis.cttI18n?.getLocale() || 'en';
        pdfLabelsInEnglish = pdfReportLocale(locale) !== locale;
        if (!current()) return;
        if (pdfLabelsInEnglish) exportStatus(uiMessage('Preparing PDF report… Its headings and labels will use English because this PDF exporter does not yet support the selected language. Original document text is not translated.'));
      }
      // Export has its own cancellation scope so a new comparison stays independent.
      const result = await window.KristinaTransport.request('/api/export', {report, format}, {signal: requestController.signal});
      if (!current()) return;
      if (!(result?.data instanceof Uint8Array) || !result.data.length) throw new Error("Couldn't retrieve the prepared file. Try downloading again.");
      const url = URL.createObjectURL(new Blob([result.data], {type: result.mime}));
      const link = element('a'); link.href = url; link.download = result.filename;
      try { document.body.append(link); link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      recordProductEvent('document_download', {file_format: format, workspace: 'comparison'});
      exportStatus(pdfLabelsInEnglish ? uiMessage('PDF report sent to your browser for download. Its headings and labels use English; original document text is not translated.') : uiMessage('{0} report sent to your browser for download.', {0: format.toUpperCase()}));
    } catch (error) {
      if (!current() || error?.name === 'AbortError') return;
      const detail = typeof error?.message === 'string' && /^(?:[A-Za-zА-Яа-яЁё]|(?:XLSX|PDF)[: -])/.test(error.message) ? ' ' + error.message.slice(0, 240) : " Try downloading again or save the HTML report.";
      exportStatus(uiMessage("Couldn't prepare {0}.{1}", {0: format.toUpperCase(), 1: uiError(detail)}), true);
    } finally {
      if (exportController === requestController) { exportController = null; exportEnable(); }
    }
  }
  $('office-form').addEventListener('submit', event => { event.preventDefault(); officeAsk($('office-question').value); });
  $('office-question').addEventListener('input', () => $('office-question').setCustomValidity(''));
  $('office-question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); officeAsk($('office-question').value); } });
  $('office-impact-question').addEventListener('click', () => officeAsk("How did the total change?"));
  for (const button of $('office-suggestions').children) button.addEventListener('click', () => officeAsk(button.dataset.question, button.dataset.question === "Draft an email"));
  $('office-open').addEventListener('click', () => officeToggle($('office-sidebar').hidden));
  $('office-close').addEventListener('click', () => officeToggle(false));
  $('office-sidebar').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); officeToggle(false); } });
  $('office-show').addEventListener('click', () => { if (officeContext?.selected) officeJump({key: officeContext.selected.key}, state.revision); });
  $('office-copy').addEventListener('click', officeCopy); $('office-download').addEventListener('click', officeDownload);
  for (const button of document.querySelectorAll('[data-work-mode]')) button.addEventListener('click', () => {
    if (button.dataset.workMode === 'single') restoreWorkspaceTools();
    else if (visualReview) mountWorkspaceTools(visualReview);
  });
  document.addEventListener('ctt:home', () => restoreWorkspaceTools());
  document.addEventListener('ctt:new-comparison', event => {
    const {files, complete} = event.detail || {};
    if (typeof complete !== 'function') return;
    void (async () => {
      if (state.busy) return {ok:false, message:'Wait for the current operation to finish, then try again.'};
      busy(true);
      try {
        if (!window.KristinaTransport) throw new Error('The comparison engine could not load. Refresh the page and try again.');
        const next = {};
        for (const side of ['left', 'right']) {
          const file = files?.[side];
          if (!file || !/\.(docx|pdf|txt|xlsx|csv|tsv)$/i.test(file.name)) throw new Error('Choose two supported files. Old .doc files must first be saved as .docx in Word or LibreOffice.');
          if (file.size > MAX_FILE_BYTES) throw new Error('Choose files up to 2 MB each.');
          next[side] = {name:file.name, data:encode(new Uint8Array(await file.arrayBuffer()))};
        }
        // Parse both files before replacing anything. An invalid new document
        // must not destroy the previous comparison, its saved draft or Undo.
        await window.KristinaTransport.request('/api/prepare', {...next, delimiter:'auto'});
        if ((state.report || state.sources.left || state.sources.right) && !window.confirm(String(uiMessage("Replace the previous comparison and its saved draft? Download your edited files first if you want to keep them.")))) return {ok:false};
        loads.left++; loads.right++; clearResult(); state.sources = next;
        for (const side of ['left', 'right']) { showSheets(side); $(side + '-file').value = ''; sourceLabel(side, next[side]); }
        $('delimiter').value = 'auto'; $('settings').open = false;
        busy(false); await prepare();
        return {ok:true};
      } catch (error) { return {ok:false, message:error.message || 'Could not open the new files. Your previous work is still open.'}; }
      finally { busy(false); }
    })().then(complete);
  });
  $('office-draft').addEventListener('input', () => { uiSetText($('office-draft-status'), uiMessage("Draft edited. Review it before sending.")); });
  officeEnable(); exportEnable();
  const sessionReady = window.KristinaTransport ? (async () => {
    const root = element('section'); root.id = 'saved-session'; root.hidden = true;
    uiSetAttr(root, 'aria-label', uiMessage("Saved work")); document.querySelector('.hero').after(root);
    try {
      const {mountSessionUI} = await import(sessionModuleURL.href);
      sessionUI = await mountSessionUI(root, {onResume: resumeSession, onFinish: finishSession,
        onOperating: value => {
          if (value) { loads.left++; loads.right++; document.dispatchEvent(new Event('ctt:comparison-operation-started')); }
          busy(value);
        }});
      sessionUI.setBusy(state.busy);
    } catch {
      root.hidden = false; root.className = 'session-panel session-error';
      uiSetText(root, uiMessage("Autosave isn't available. Download your edited documents before closing."));
    }
  })() : Promise.resolve();
  if (window.KristinaTransport) {
    uiSetText($('supported-formats'), uiMessage("CSV/Excel tables, TXT/DOCX text, and PDFs with a text layer, including those with logos and images. Images are not compared; scans without text, forms, and comments are not supported."));
    uiSetText($('source-privacy'), uiMessage("Comparison starts automatically. Files are processed locally, without sending them to an LLM. Up to 2 MiB per file."));
  }
  for (const side of ['left', 'right']) {
    if (window.KristinaTransport) {
      $(side + '-file').accept += ',.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.txt,text/plain,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,application/pdf';
      sourceLabel(side, null);
      const label = element('label', uiMessage("Sheet to compare"), 'sheet-choice'), select = element('select');
      select.id = side + '-sheet'; uiSetAttr(select, 'aria-label', uiMessage("Sheet to compare {0}", { 0: side === 'left' ? 'A' : 'B' }));
      label.hidden = true; label.append(select); $(side + '-drop').after(label);
      select.addEventListener('change', () => {
        if (!state.sources[side] || state.busy) return;
        if (select.value === '') delete state.sources[side].sheet;
        else state.sources[side].sheet = selectedColumn(select);
        prepare();
      });
    }
    $(side + '-file').addEventListener('change', event => loadFile(side, event.target.files[0]));
    const zone = $(side + '-drop'); zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragging'); loadFile(side, event.dataTransfer.files[0]); });
    $(side + '-key').addEventListener('change', () => { dirty(); mapping(); });
  }
  $('demo').addEventListener('click', async () => {
    if (state.busy) return;
    if (!window.CTTDemoDocuments) { notice(uiMessage("The example could not load. Reload this page and try again."), true); return; }
    loads.left++; loads.right++;
    for (const side of ['left', 'right']) {
      showSheets(side); state.sources[side] = {...window.CTTDemoDocuments[side]};
      $(side + '-file').value = ''; sourceLabel(side, {name: state.sources[side].name});
    }
    $('settings').open = false;
    await prepare();
  });
  $('visual-retry').addEventListener('click', async () => {
    if (state.busy || !state.report || state.report.status !== 'complete') return;
    busy(true);
    try { await startVisualReview(state.report); officeDescribe(); }
    finally { busy(false); }
  });
  $('demo-tables').addEventListener('click', async () => {
    if (state.busy) return; loads.left++; loads.right++;
    for (const side of ['left', 'right']) showSheets(side);
    const examples = {left: ['order.csv', 'sku,quantity,unit,price,currency\nCH-100,10,piece,189,USD\nDS-200,5,piece,20,USD\nLP-300,2,piece,30,USD\nOLD-400,1,piece,40,USD\n'], right: ['confirmation.csv', 'sku,quantity,unit,price,currency\nCH-100,10.00,piece,189.00,USD\nDS-200,4,piece,22,USD\nLP-300,2,box,30,USD\nNEW-500,1,piece,40,USD\n']};
    $('delimiter').value = 'auto'; $('settings').open = false;
    for (const side of ['left', 'right']) { const [name, text] = examples[side]; state.sources[side] = {name, data: encode(new TextEncoder().encode(text))}; $(side + '-file').value = ''; sourceLabel(side, {name}); }
    await prepare();
  });
  $('delimiter').addEventListener('change', prepare);
  $('membership').addEventListener('change', () => { dirty(); $('mapping-panel').hidden = $('membership').checked; });
  $('strip').addEventListener('change', dirty); $('compare').addEventListener('click', compare); $('answer').addEventListener('click', compare);
  $('search').addEventListener('input', () => { state.page = 0; state.active = -1; changePage = 0; renderRows(); });
  $('changes-previous').addEventListener('click', () => { changePage--; renderChanges(filtered()); });
  $('changes-next').addEventListener('click', () => { changePage++; renderChanges(filtered()); });
  $('document-zoom').addEventListener('change', () => {
    for (const size of ['85', '100', '115', '130']) $('document-scroll').classList.toggle('zoom-' + size, $('document-zoom').value === size);
  });
  $('previous').addEventListener('click', () => { state.page--; state.active = -1; renderRows(); });
  $('next').addEventListener('click', () => { state.page++; state.active = -1; renderRows(); });
  $('next-change').addEventListener('click', () => jumpChange(1)); $('previous-change').addEventListener('click', () => jumpChange(-1));
  $('download-html').addEventListener('click', () => download('html')); $('download-json').addEventListener('click', () => download('json'));
  $('download-xlsx').addEventListener('click', () => downloadExport('xlsx')); $('download-pdf').addEventListener('click', () => downloadExport('pdf'));
})();

})();
