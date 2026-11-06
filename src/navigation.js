/* Stage text or files before replacing a comparison; Home retains all open work. */
(() => {
  const $ = id => document.getElementById(id);
  const menu = $('start-menu'), home = $('workspace-home');
  const compare = $('start-compare'), edit = $('start-edit'), start = $('start-new-compare');
  const modes = [...document.querySelectorAll('[data-work-mode]')];
  const files = {left:null, right:null};
  const sides = ['left', 'right'];
  const help = $('home-help');
  let pending = false;
  function notice(text = '', error = false) {
    const node = $('home-notice'); node.textContent = text; node.hidden = !text;
    node.classList.toggle('error', error);
  }
  function hasInput(side) { return !!files[side] || $('home-' + side + '-text').value.length > 0; }
  function controls() {
    start.disabled = pending || !sides.every(hasInput);
    start.textContent = pending ? 'Opening documents…' : sides.some(side => files[side]) ? 'Compare documents →' : 'Compare texts →';
    compare.disabled = edit.disabled = home.disabled = $('header-edit').disabled = $('home-example').disabled = $('home-swap').disabled = pending;
    for (const side of sides) {
      const file = files[side], field = $('home-' + side + '-text');
      $('home-' + side + '-file').disabled = pending;
      $('home-' + side + '-paste').disabled = pending;
      field.disabled = pending || !!file; field.hidden = !!file;
      $('home-' + side + '-file-card').hidden = !file;
      $('home-' + side + '-name').textContent = file?.name || 'Choose a file or drag it here';
      $('home-' + side + '-kind').textContent = file ? file.name.split('.').at(-1).toUpperCase() + ' file' : 'Plain text';
      $('home-' + side + '-count').textContent = file ? Math.ceil(file.size / 1024) + ' KB' : field.value.length + ' characters';
    }
  }
  function choose(side, file) {
    if (!file || pending) return;
    let error = '';
    if (/\.doc$/i.test(file.name)) error = 'Old Word files (.doc) are not supported. Save the file as .docx in Word or LibreOffice, then try again. Renaming the file is not enough.';
    else if (!/\.(docx|pdf|txt|xlsx|csv|tsv)$/i.test(file.name)) error = 'Choose a DOCX, PDF, TXT, XLSX, CSV or TSV file.';
    else if (file.size > 2 * 1024 * 1024) error = 'Choose a file up to 2 MB.';
    if (error) notice(error, true);
    else { files[side] = file; notice(); }
    controls();
  }
  function updateResume() {
    compare.hidden = $('results').hidden;
    edit.hidden = !$('single-editor-host').childElementCount;
    edit.textContent = 'Continue editing';
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
    pending = true; controls(); notice('Checking your documents…');
    try {
      const next = {};
      for (const side of sides) next[side] = files[side] || new File([$('home-' + side + '-text').value], side === 'left' ? 'original-text.txt' : 'changed-text.txt', {type:'text/plain'});
      const result = await new Promise(resolve => document.dispatchEvent(new CustomEvent('ctt:new-comparison', {detail:{files:next, complete:resolve}})));
      if (!result.ok) { notice(result.message || '', !!result.message); return; }
      // Keep the staged sources for convenient corrections on a later Home visit.
      notice(); open('compare');
    } catch (error) { notice(error.message || 'Could not open these documents. Your previous work is still open.', true); }
    finally { pending = false; controls(); updateResume(); }
  });
  for (const side of sides) {
    const input = $('home-' + side + '-file'), zone = $('home-' + side + '-drop'), field = $('home-' + side + '-text');
    input.addEventListener('change', () => { choose(side, input.files[0]); input.value = ''; });
    field.addEventListener('input', () => { notice(); controls(); });
    $('home-' + side + '-paste').addEventListener('click', () => { if (pending) return; files[side] = null; notice(); controls(); field.focus(); });
    zone.addEventListener('dragover', event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); if (!pending) zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); zone.classList.remove('dragging'); choose(side, event.dataTransfer.files[0]); });
  }
  $('home-swap').addEventListener('click', () => {
    if (pending) return;
    [files.left, files.right] = [files.right, files.left];
    const left = $('home-left-text'), right = $('home-right-text');
    [left.value, right.value] = [right.value, left.value]; notice(); controls();
  });
  $('home-example').addEventListener('click', () => {
    if (pending) return;
    if (sides.some(hasInput) && !window.confirm('Replace the texts or files on this start screen with an example? Your open comparison will stay unchanged.')) return;
    files.left = files.right = null;
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
  for (const button of modes) button.addEventListener('click', leaveHome);
  // Help can be opened during editing. Do not let its examples silently replace
  // an active comparison, partially loaded sources or a saved comparison.
  for (const id of ['demo', 'demo-tables']) $(id).addEventListener('click', event => {
    const saved = $('saved-session'), resume = $('session-resume');
    const hasComparison = !$('results').hidden || sides.some(side => $(side + '-filename').dataset.sourceLoaded === 'true') || !!(saved && !saved.hidden && resume && !resume.hidden);
    if (pending || event.currentTarget.disabled || (hasComparison && !window.confirm('Replace the previous comparison and its saved draft with an example? Download your edited files first if you want to keep them.'))) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    open('compare');
  }, {capture:true});
  const saved = $('saved-session'); if (saved) menu.before(saved);
  // A saved comparison can be resumed from Home without hiding its restored result.
  const observer = new MutationObserver(() => {
    updateResume();
    if (!pending && document.body.classList.contains('home-mode') && !$('results').hidden) open('compare');
  });
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
  window.addEventListener('pagehide', () => { observer.disconnect(); noticeObserver.disconnect(); }, {once:true});
  controls(); updateResume();
})();
