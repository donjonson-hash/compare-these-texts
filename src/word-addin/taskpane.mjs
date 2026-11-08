import {createWordAdapter} from './word-adapter.mjs';
import {validateText, previewReplacement} from './policy.mjs';

export function mountTaskpane(document, adapter) {
  const $ = id => document.getElementById(id);
  let snapshot = null, reviewed = null, busy = false;
  const translate = source => document.defaultView?.cttI18n?.t(source) ?? source;
  const status = (message, error = false, guidance = '') => {
    const target = $('status'), primary = document.createElement('span');
    const i18n = document.defaultView?.cttI18n;
    i18n?.unbindText?.(target);
    target.replaceChildren(primary);
    if (error && i18n) i18n.bindError(primary, message);
    else if (i18n) i18n.bindText(primary, message);
    else primary.textContent = message;
    if (guidance) {
      const help = document.createElement('span'); target.append(document.createTextNode(' '), help);
      if (i18n) i18n.bindText(help, guidance); else help.textContent = guidance;
    }
    target.dataset.error = String(error);
  };
  function controls() {
    $('load').disabled = busy; $('edited').disabled = busy;
    $('edited').readOnly = !snapshot;
    $('review').disabled = busy || !snapshot;
    $('apply').disabled = busy || !snapshot || reviewed === null || reviewed !== $('edited').value || reviewed === snapshot.original;
  }
  async function load() {
    if (busy) return;
    if (!$('editor').hidden && $('edited').value !== $('original').textContent && !document.defaultView.confirm(translate('Discard this unapplied draft and load the current Word selection?'))) return;
    busy = true; reviewed = null; snapshot = null; controls(); $('changes').hidden = true;
    status('Loading the selected passage…');
    try {
      snapshot = await adapter.load(); $('original').textContent = snapshot.original; $('edited').value = snapshot.original;
      $('editor').hidden = false; status('Edit here, then preview. Keep the original passage selected in Word.');
    } catch (error) { status(error.message || 'Word could not read the selection. Select a simple passage and try again.', true); }
    finally { busy = false; controls(); }
  }
  function preview() {
    if (busy || !snapshot) return;
    reviewed = null; $('changes').hidden = true;
    try {
      const replacement = validateText($('edited').value, {allowEmpty: true});
      const parts = previewReplacement(snapshot.original, replacement), node = $('preview'); node.replaceChildren();
      node.append(document.createTextNode(parts.prefix));
      for (const [tag, text] of [['del', parts.removed], ['ins', parts.added]]) {
        if (text) { const piece = document.createElement(tag); piece.textContent = text; node.append(piece); }
      }
      node.append(document.createTextNode(parts.suffix)); reviewed = replacement; $('changes').hidden = false;
      status(replacement === snapshot.original ? 'No changes to apply.' : 'Review the replacement. Apply writes it into the selected Word passage.');
    } catch (error) { status(error.message, true); }
    controls();
  }
  async function apply() {
    if (busy || !snapshot || reviewed === null || reviewed !== $('edited').value || reviewed === snapshot.original) return;
    busy = true; controls(); status('Checking the original passage and applying your edit…');
    try { const result = await adapter.apply($('edited').value, reviewed); $('original').textContent = $('edited').value; status(result.message); }
    catch (error) { status(error.message || 'Word could not apply the edit.', true, 'Your draft remains here for copying. Reload the selection before another attempt.'); }
    finally { snapshot = null; reviewed = null; busy = false; controls(); }
  }
  $('load').addEventListener('click', load); $('review').addEventListener('click', preview); $('apply').addEventListener('click', apply);
  $('edited').addEventListener('input', () => { reviewed = null; $('changes').hidden = true; controls(); });
  controls(); status('Select a passage in Word and choose Load selected text.');
  return {load, preview, apply};
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const fail = message => {
    const status = document.getElementById('status'), text = document.createElement('span');
    window.cttI18n?.unbindText(status);
    status.replaceChildren(text);
    if (window.cttI18n) window.cttI18n.bindError(text, message); else text.textContent = message;
    status.dataset.error = 'true';
  };
  if (!window.Office?.onReady) fail('Microsoft Office.js could not load. Open this panel inside Word with an internet connection.');
  else {
    const timeout = window.setTimeout(() => fail('Word has not connected. Open this panel through the installed Word add-in; check your connection or reload the add-in.'), 15000);
    window.Office.onReady(info => {
      window.clearTimeout(timeout);
      if (info.host !== window.Office.HostType.Word || !window.Word || !window.Office.context.requirements.isSetSupported('WordApi', '1.4')) {
        fail('This pilot needs Microsoft Word with WordApi 1.4. Open it through Word Add-ins; a regular browser tab cannot edit your document.'); return;
      }
      mountTaskpane(document, createWordAdapter(window.Word));
    });
  }
}
