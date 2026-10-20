// Packaged extension only: consume a one-time launch request without replacing saved work.
export async function launchWelcomeExample({document, location, history, readSavedComparison}) {
  const url = new URL(location.href);
  if (url.searchParams.get('welcome-example') !== '1') return;
  url.searchParams.delete('welcome-example');
  history.replaceState(history.state, '', url.href);
  const button = document.getElementById('demo');
  const inform = text => {
    const notice = document.getElementById('notice');
    notice.textContent = text;
    notice.hidden = false;
    button.focus();
  };
  try {
    if (await readSavedComparison()) {
      inform('Your saved comparison is available. Choose Continue to resume it, or download it before starting a new example.');
      return;
    }
  } catch {
    inform('Your saved work could not be checked. Choose Try document editing yourself when you are ready to start an example.');
    return;
  }
  // App scripts have registered the existing example action before DOMContentLoaded.
  if (!button.disabled) button.click();
}

if (typeof window !== 'undefined') {
  const start = () => launchWelcomeExample({
    document, location: window.location, history: window.history,
    readSavedComparison: async () => {
      const {openSessionStore} = await import('./session-store.mjs');
      const store = await openSessionStore();
      try { return Boolean((await store.read()).payload); }
      finally { store.close(); }
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else void start();
}
