(() => {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), {once: true});
  const tool = {
    name: 'get_comparison_status',
    title: "Comparison status",
    description: 'Read comparison state flags without returning document text, filenames, errors or summaries.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    annotations: {readOnlyHint: true, untrustedContentHint: true},
    execute(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
      const results = document.getElementById('results');
      const notice = document.getElementById('notice');
      const setup = document.getElementById('setup-question');
      // Parser errors can contain document-derived strings. Never expose DOM text
      // through this optional tool, even when it looks like a harmless status.
      return {hasResult: !!results && !results.hidden, requiresClarification: !!setup && !setup.hidden,
        hasNotice: !!notice && !notice.hidden, hasError: !!notice && !notice.hidden && notice.classList.contains('error')};
    }
  };
  try { Promise.resolve(context.registerTool(tool, {signal:lifecycle.signal})).catch(() => {}); } catch (_) { /* Optional API; comparison remains available. */ }
})();
