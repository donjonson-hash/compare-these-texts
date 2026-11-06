"""Add the Google tag to website output only, after offline ZIP packaging."""
import base64
import hashlib

MEASUREMENT_ID = "G-J33QPHR8L3"
BOOTSTRAP = """
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  // Only fixed vocabulary reaches Analytics. Never serialize app objects,
  // filenames, DOM text, error messages, draft identifiers or document contents.
  window.cttProductEvent = function(name, parameters) {
    try {
      const p = parameters || {}, data = {send_to: 'G-J33QPHR8L3'};
      if (name === 'comparison_complete') {
        if (!['text', 'table'].includes(p.comparison_type)) return;
        data.comparison_type = p.comparison_type;
      } else if (name === 'document_download') {
        if (!['docx', 'pdf', 'txt', 'csv', 'tsv', 'xlsx', 'html', 'json'].includes(p.file_format) ||
            !['comparison', 'editor'].includes(p.workspace)) return;
        data.file_format = p.file_format;
        data.workspace = p.workspace;
      } else if (name !== 'chrome_store_click') return;
      gtag('event', name, data);
    } catch (_) { /* Measurement failures must not interrupt the workspace. */ }
  };
  document.addEventListener('click', function(event) {
    if (event.defaultPrevented) return;
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href);
      if (url.protocol === 'https:' && url.hostname === 'chromewebstore.google.com' &&
          url.pathname === '/detail/kclhfaiampafehfhhlejeeefhdhocfcg') {
        window.cttProductEvent('chrome_store_click');
      }
    } catch (_) {}
  });
  // Preserve campaign attribution without sending arbitrary query parameters.
  // Campaign labels are short lowercase slugs, never document/user identifiers.
  const campaignQuery = new URLSearchParams();
  const incomingQuery = new URLSearchParams(window.location.search);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const values = incomingQuery.getAll(key);
    if (values.length === 1 && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(values[0])) {
      campaignQuery.set(key, values[0]);
    }
  }
  const campaignSuffix = campaignQuery.toString();
  gtag('js', new Date());
  gtag('config', 'G-J33QPHR8L3', {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: window.location.origin + window.location.pathname + (campaignSuffix ? '?' + campaignSuffix : ''),
    page_referrer: document.referrer ? new URL(document.referrer).origin : ''
  });
"""
SCRIPT_HASH = "'sha256-" + base64.b64encode(hashlib.sha256(BOOTSTRAP.encode()).digest()).decode() + "'"
TAG = ('<!-- Google tag (gtag.js): website only -->\n'
       '<script async src="https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID + '"></script>\n'
       '<script>' + BOOTSTRAP + '</script>\n')


def strip_website_analytics(text):
    """Also support packaging again from an already built website."""
    return (text.replace(TAG, '')
            .replace("script-src 'self' https://www.googletagmanager.com " + SCRIPT_HASH + ";", "script-src 'self';")
            .replace("connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com;", "connect-src 'none';")
            .replace("img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com;", "img-src 'self' data: blob:;"))


def add_website_analytics(output):
    for page in sorted(output.rglob('*.html')):
        text = page.read_text()
        if 'googletagmanager.com/gtag/js' in text:
            raise RuntimeError(f'Duplicate Google tag in {page}')
        text = text.replace("script-src 'self';", "script-src 'self' https://www.googletagmanager.com " + SCRIPT_HASH + ";")
        text = text.replace("connect-src 'none';", "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com;")
        text = text.replace("img-src 'self' data: blob:;", "img-src 'self' data: blob: https://www.googletagmanager.com https://*.google-analytics.com;")
        if text.count('</head>') != 1:
            raise RuntimeError(f'Expected one head in {page}')
        page.write_text(text.replace('</head>', TAG + '</head>'))
