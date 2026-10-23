/* Home stages a new pair while the current documents and Undo stay alive. */
(() => {
  const $ = id => document.getElementById(id);
  const menu = $('start-menu'), home = $('workspace-home');
  const compare = $('start-compare'), edit = $('start-edit'), start = $('start-new-compare');
  const modes = [...document.querySelectorAll('[data-work-mode]')];
  const files = {left:null, right:null};
  let pending = false;
  function notice(text = '', error = false) {
    const node = $('home-notice'); node.textContent = text; node.hidden = !text;
    node.classList.toggle('error', error);
  }
  function controls() {
    start.disabled = pending || !files.left || !files.right;
    start.textContent = pending ? 'Opening files…' : 'Compare new files';
    compare.disabled = edit.disabled = pending;
    for (const side of ['left', 'right']) $('home-' + side + '-file').disabled = pending;
  }
  function choose(side, file) {
    if (!file || pending) return;
    files[side] = null; $('home-' + side + '-name').textContent = 'Choose a file or drag it here';
    let error = '';
    if (/\.doc$/i.test(file.name)) error = 'Old Word files (.doc) are not supported. Save the file as .docx in Word or LibreOffice, then try again. Renaming the file is not enough.';
    else if (!/\.(docx|pdf|txt|xlsx|csv|tsv)$/i.test(file.name)) error = 'Choose a DOCX, PDF, TXT, XLSX, CSV or TSV file.';
    else if (file.size > 2 * 1024 * 1024) error = 'Choose a file up to 2 MB.';
    if (error) notice(error, true);
    else { files[side] = file; $('home-' + side + '-name').textContent = file.name; notice(); }
    controls();
  }
  function showHome(event) {
    event?.preventDefault();
    document.dispatchEvent(new Event('ctt:home'));
    compare.hidden = $('results').hidden;
    edit.textContent = $('single-editor-host').childElementCount ? 'Continue editing' : 'Edit & convert';
    document.body.classList.add('home-mode'); menu.hidden = false;
    $('start-title').focus({preventScroll:true}); menu.scrollIntoView({block:'start'});
  }
  function leaveHome() { document.body.classList.remove('home-mode'); menu.hidden = true; }
  function open(mode) {
    leaveHome(); modes.find(button => button.dataset.workMode === mode)?.click();
    const target = mode === 'single' ? $('single-current') : document.querySelector('[data-workspace-tools-open]') || $('result-heading');
    if (target && !target.hidden && target.textContent && target.getClientRects().length) target.focus({preventScroll:true});
    else modes.find(button => button.dataset.workMode === mode)?.focus({preventScroll:true});
    home.scrollIntoView({block:'start'});
  }
  start.addEventListener('click', async () => {
    if (pending || !files.left || !files.right) return;
    pending = true; controls(); notice('Checking your new files…');
    const result = await new Promise(resolve => document.dispatchEvent(new CustomEvent('ctt:new-comparison', {detail:{files:{...files}, complete:resolve}})));
    pending = false; controls();
    if (!result.ok) { notice(result.message || '', !!result.message); return; }
    for (const side of ['left', 'right']) {
      files[side] = null; $('home-' + side + '-file').value = ''; $('home-' + side + '-name').textContent = 'Choose a file or drag it here';
    }
    notice(); controls(); open('compare');
  });
  for (const side of ['left', 'right']) {
    const input = $('home-' + side + '-file'), zone = $('home-' + side + '-drop');
    input.addEventListener('change', () => { choose(side, input.files[0]); input.value = ''; });
    zone.addEventListener('dragover', event => {event.preventDefault(); if (!pending) zone.classList.add('dragging');});
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', event => {event.preventDefault(); zone.classList.remove('dragging'); choose(side, event.dataTransfer.files[0]);});
  }
  home.addEventListener('click', showHome);
  document.querySelector('[data-home-link]').addEventListener('click', showHome);
  compare.addEventListener('click', () => open('compare'));
  edit.addEventListener('click', () => open('single'));
  for (const button of modes) button.addEventListener('click', leaveHome);
})();
