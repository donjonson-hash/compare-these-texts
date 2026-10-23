/* Home changes only the visible workspace; drafts and undo history stay alive. */
(() => {
  const menu = document.getElementById('start-menu');
  const home = document.getElementById('workspace-home');
  const compare = document.getElementById('start-compare');
  const edit = document.getElementById('start-edit');
  const modes = [...document.querySelectorAll('[data-work-mode]')];
  function showHome(event) {
    event?.preventDefault();
    document.dispatchEvent(new Event('ctt:home'));
    compare.textContent = document.getElementById('results').hidden ? 'Compare documents' : 'Continue comparison';
    edit.textContent = document.getElementById('single-editor-host').childElementCount ? 'Continue editing' : 'Edit & convert';
    document.body.classList.add('home-mode'); menu.hidden = false;
    document.getElementById('start-title').focus({preventScroll: true});
    menu.scrollIntoView({block: 'start'});
  }
  function leaveHome() { document.body.classList.remove('home-mode'); menu.hidden = true; }
  function open(mode) {
    leaveHome();
    modes.find(button => button.dataset.workMode === mode)?.click();
    const target = mode === 'single' ? document.getElementById('single-current') : document.querySelector('[data-workspace-tools-open]') || document.getElementById('result-heading');
    if (!target.hidden && target.textContent && target.getClientRects().length) target.focus({preventScroll: true});
    else modes.find(button => button.dataset.workMode === mode)?.focus({preventScroll: true});
    home.scrollIntoView({block: 'start'});
  }
  home.addEventListener('click', showHome);
  document.querySelector('[data-home-link]').addEventListener('click', showHome);
  compare.addEventListener('click', () => open('compare'));
  edit.addEventListener('click', () => open('single'));
  for (const button of modes) button.addEventListener('click', leaveHome);
})();
