/** Report-label languages supported by the bundled DejaVu Sans renderer.
 * Latin, Greek, and Cyrillic are supported. Arabic/Hebrew need bidi layout;
 * the other excluded scripts need glyph coverage and/or contextual shaping.
 * This governs generated report labels only, never source document text.
 */
const supported = new Set(['en', 'bg', 'ca', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fil', 'fr', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'ms', 'nb', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'sw', 'tr', 'uk', 'vi']);

export function pdfReportLocale(locale = 'en') {
  const requested = String(locale || 'en').replaceAll('-', '_');
  return supported.has(requested.split('_')[0].toLowerCase()) ? requested : 'en';
}
